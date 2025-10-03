// packages/project-management/services/ProjectValidator.ts

/**
 * Project Validation Service for ReadyAI Personal AI Development Orchestrator
 * 
 * Comprehensive project validation service adapted from Cline's proven validation patterns
 * with ReadyAI-specific project validation rules and schema enforcement capabilities.
 * 
 * This service provides multi-layered project validation including:
 * - Schema validation and structure integrity
 * - Business logic validation and constraint enforcement  
 * - Phase compatibility and dependency validation
 * - Security and compliance validation
 * - Performance and quality metric validation
 * - Cross-service validation with external dependencies
 * 
 * Cline Source Adaptations:
 * - Adapted from src/utils/validation/ patterns for robust validation workflows
 * - Reuses Cline's error handling and retry mechanisms for validation operations
 * - Maintains Cline's comprehensive validation result patterns
 * - Extends Cline's type-safe validation approaches for ReadyAI project domain
 * 
 * @version 1.0.0 - Phase 2.1 Implementation  
 * @author ReadyAI Development Team
 */

import {
  UUID,
  ApiResponse,
  ReadyAIError,
  ValidationResult,
  QualityMetrics,
  PhaseType,
  PhaseStatus,
  TechStack,
  ProjectConfig,
  createApiResponse,
  createApiError,
  isApiSuccess,
  wrapAsync,
  generateUUID,
  createTimestamp
} from '../../foundation/types/core';

import {
  Project,
  ProjectCreationRequest,
  ProjectUpdateRequest,
  ProjectPhase,
  ProjectMilestone,
  PhaseArtifact,
  ProjectCollaborator,
  ProjectTemplate,
  ProjectCategory,
  ProjectTag,
  ProjectDeployment,
  ProjectIntegration,
  ProjectSnapshot,
  ProjectOperationResult,
  validateProject as coreValidateProject,
  calculateProjectHealth,
  isProject,
  ProjectValidationError
} from '../types/project';

import { ConfigService } from '../../config/services/ConfigService';
import { Logger } from '../../logging/services/Logger';

/**
 * Validation severity levels for different types of validation issues
 */
export type ValidationSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Validation context for providing additional validation parameters
 */
export interface ProjectValidationContext {
  /** Project being validated */
  projectId?: UUID;
  /** Current user performing validation */
  userId?: UUID;
  /** Validation mode for different scenarios */
  mode: 'creation' | 'update' | 'phase_transition' | 'deployment' | 'full_audit';
  /** Whether to perform strict validation */
  strict?: boolean;
  /** Whether to validate dependencies */
  validateDependencies?: boolean;
  /** Whether to validate external integrations */
  validateExternalSystems?: boolean;
  /** Specific phase being validated (for phase transitions) */
  targetPhase?: PhaseType;
  /** Previous phase for transition validation */
  fromPhase?: PhaseType;
  /** Additional context metadata */
  metadata?: Record<string, any>;
}

/**
 * Enhanced validation result with ReadyAI-specific extensions
 */
export interface EnhancedValidationResult extends ValidationResult {
  /** Validation context used */
  context: ProjectValidationContext;
  /** Validation execution time in milliseconds */
  executionTime: number;
  /** Specific validation categories that were checked */
  validationCategories: ValidationCategory[];
  /** Recommendations for addressing issues */
  recommendations: ValidationRecommendation[];
  /** Validation metrics and performance data */
  metrics: {
    rulesEvaluated: number;
    constraintsChecked: number;
    dependenciesValidated: number;
    externalCallsMade: number;
  };
}

/**
 * Validation categories for organizing validation rules
 */
export type ValidationCategory = 
  | 'schema' 
  | 'business_logic' 
  | 'phase_compatibility' 
  | 'dependencies' 
  | 'security' 
  | 'performance' 
  | 'quality' 
  | 'integration' 
  | 'compliance';

/**
 * Validation recommendation for addressing validation issues
 */
export interface ValidationRecommendation {
  /** Unique identifier for the recommendation */
  id: UUID;
  /** Recommendation category */
  category: ValidationCategory;
  /** Severity of the issue being addressed */
  severity: ValidationSeverity;
  /** Title of the recommendation */
  title: string;
  /** Detailed description of the recommendation */
  description: string;
  /** Suggested actions to resolve the issue */
  actions: string[];
  /** Estimated effort to implement (in hours) */
  estimatedEffort?: number;
  /** Priority level for implementation */
  priority: 'low' | 'medium' | 'high' | 'critical';
  /** Related validation errors/warnings */
  relatedIssues: string[];
}

/**
 * Validation rule definition for extensible validation logic
 */
export interface ValidationRule {
  /** Unique identifier for the rule */
  id: string;
  /** Rule name for display purposes */
  name: string;
  /** Rule description */
  description: string;
  /** Validation category */
  category: ValidationCategory;
  /** Rule severity when violated */
  severity: ValidationSeverity;
  /** Whether the rule is enabled */
  enabled: boolean;
  /** Validation function */
  validate: (project: Project, context: ProjectValidationContext) => Promise<ValidationRuleResult>;
  /** Rule dependencies (other rules that must pass first) */
  dependencies?: string[];
  /** Applicable phases for this rule */
  applicablePhases?: PhaseType[];
  /** Rule metadata */
  metadata?: Record<string, any>;
}

/**
 * Result of a single validation rule execution
 */
export interface ValidationRuleResult {
  /** Whether the rule passed */
  passed: boolean;
  /** Error message if rule failed */
  message?: string;
  /** Additional details about the validation */
  details?: Record<string, any>;
  /** Recommendations for fixing the issue */
  recommendations?: string[];
  /** Severity override for this specific result */
  severityOverride?: ValidationSeverity;
}

/**
 * Batch validation request for validating multiple projects
 */
export interface BatchValidationRequest {
  /** Projects to validate */
  projectIds: UUID[];
  /** Validation context */
  context: ProjectValidationContext;
  /** Whether to fail fast on first error */
  failFast?: boolean;
  /** Maximum concurrent validations */
  maxConcurrency?: number;
}

/**
 * Batch validation result
 */
export interface BatchValidationResult {
  /** Overall batch success status */
  success: boolean;
  /** Individual project validation results */
  results: Map<UUID, EnhancedValidationResult>;
  /** Batch execution summary */
  summary: {
    totalProjects: number;
    successfulValidations: number;
    failedValidations: number;
    totalExecutionTime: number;
    averageExecutionTime: number;
  };
  /** Batch-level recommendations */
  batchRecommendations: ValidationRecommendation[];
}

/**
 * Project Validator Service Options
 */
export interface ProjectValidatorOptions {
  /** Enable parallel validation for better performance */
  enableParallelValidation?: boolean;
  /** Maximum concurrent validation operations */
  maxConcurrentValidations?: number;
  /** Validation timeout in milliseconds */
  validationTimeout?: number;
  /** Enable caching of validation results */
  enableValidationCaching?: boolean;
  /** Cache TTL in milliseconds */
  validationCacheTtl?: number;
  /** Enable comprehensive logging */
  enableDetailedLogging?: boolean;
  /** Custom validation rules to include */
  customRules?: ValidationRule[];
  /** Rules to disable */
  disabledRules?: string[];
  /** Enable external system validation */
  enableExternalValidation?: boolean;
}

/**
 * Default validator options
 */
const DEFAULT_VALIDATOR_OPTIONS: Required<ProjectValidatorOptions> = {
  enableParallelValidation: true,
  maxConcurrentValidations: 5,
  validationTimeout: 30000, // 30 seconds
  enableValidationCaching: true,
  validationCacheTtl: 300000, // 5 minutes
  enableDetailedLogging: true,
  customRules: [],
  disabledRules: [],
  enableExternalValidation: false
};

/**
 * Enhanced Project Validator Service
 * 
 * Comprehensive project validation service that enforces ReadyAI project standards,
 * business rules, and quality constraints. Adapted from Cline's validation patterns
 * with extensive ReadyAI-specific validation logic.
 * 
 * Key capabilities:
 * - Multi-layered validation with configurable rules and severity levels
 * - Phase transition validation ensuring proper project lifecycle progression
 * - Dependency validation across project components and external systems
 * - Security and compliance validation for enterprise requirements
 * - Performance validation for scalability and efficiency
 * - Batch validation for processing multiple projects efficiently
 * - Caching and optimization for high-throughput validation scenarios
 */
export class ProjectValidator {
  private readonly configService: ConfigService;
  private readonly logger: Logger;
  private readonly options: Required<ProjectValidatorOptions>;
  
  // Validation rule registry
  private readonly validationRules = new Map<string, ValidationRule>();
  
  // Validation result cache
  private readonly validationCache = new Map<string, {
    result: EnhancedValidationResult;
    timestamp: number;
    context: ProjectValidationContext;
  }>();
  
  // Performance metrics tracking
  private readonly performanceMetrics = {
    totalValidations: 0,
    totalExecutionTime: 0,
    averageExecutionTime: 0,
    cacheHits: 0,
    cacheMisses: 0
  };

  constructor(
    configService: ConfigService,
    logger: Logger,
    options: ProjectValidatorOptions = {}
  ) {
    this.configService = configService;
    this.logger = logger;
    this.options = { ...DEFAULT_VALIDATOR_OPTIONS, ...options };
    
    // Initialize built-in validation rules
    this.initializeValidationRules();
    
    // Add custom rules if provided
    this.options.customRules.forEach(rule => {
      this.addValidationRule(rule);
    });
    
    this.logger.info('ProjectValidator initialized', {
      totalRules: this.validationRules.size,
      customRules: this.options.customRules.length,
      disabledRules: this.options.disabledRules.length,
      cacheEnabled: this.options.enableValidationCaching,
      parallelValidation: this.options.enableParallelValidation
    });
  }

  /**
   * Validate a single project with comprehensive rule checking
   */
  async validateProject(
    project: Project,
    context: ProjectValidationContext
  ): Promise<ApiResponse<EnhancedValidationResult>> {
    return wrapAsync(async () => {
      const startTime = Date.now();
      const validationId = generateUUID();
      
      this.logger.debug('Starting project validation', {
        validationId,
        projectId: project.id,
        projectName: project.name,
        mode: context.mode,
        strict: context.strict
      });

      // Check cache first
      if (this.options.enableValidationCaching) {
        const cached = this.getCachedValidation(project.id, context);
        if (cached) {
          this.performanceMetrics.cacheHits++;
          this.logger.debug('Returning cached validation result', { validationId, projectId: project.id });
          return createApiResponse(cached);
        }
        this.performanceMetrics.cacheMisses++;
      }

      // Initialize validation result
      const validationResult: EnhancedValidationResult = {
        id: validationId,
        type: 'project',
        passed: true,
        errors: [],
        warnings: [],
        suggestions: [],
        score: 100,
        validatedAt: createTimestamp(),
        validator: 'ReadyAI Project Validator',
        context,
        executionTime: 0,
        validationCategories: [],
        recommendations: [],
        metrics: {
          rulesEvaluated: 0,
          constraintsChecked: 0,
          dependenciesValidated: 0,
          externalCallsMade: 0
        }
      };

      try {
        // Get applicable validation rules
        const applicableRules = this.getApplicableRules(project, context);
        validationResult.metrics.rulesEvaluated = applicableRules.length;

        this.logger.debug('Executing validation rules', {
          validationId,
          ruleCount: applicableRules.length,
          categories: [...new Set(applicableRules.map(r => r.category))]
        });

        // Execute validation rules
        const ruleResults = await this.executeValidationRules(
          project,
          context,
          applicableRules,
          validationId
        );

        // Process rule results
        this.processRuleResults(validationResult, ruleResults, applicableRules);

        // Perform core ReadyAI validation
        const coreValidation = coreValidateProject(project);
        this.integrateCoreValidation(validationResult, coreValidation);

        // Calculate final score and status
        this.calculateValidationScore(validationResult);

        // Generate recommendations
        validationResult.recommendations = await this.generateRecommendations(
          validationResult,
          project,
          context
        );

        // Record execution time
        validationResult.executionTime = Date.now() - startTime;

        // Update performance metrics
        this.updatePerformanceMetrics(validationResult.executionTime);

        // Cache the result
        if (this.options.enableValidationCaching) {
          this.cacheValidationResult(project.id, context, validationResult);
        }

        this.logger.info('Project validation completed', {
          validationId,
          projectId: project.id,
          passed: validationResult.passed,
          score: validationResult.score,
          errors: validationResult.errors.length,
          warnings: validationResult.warnings.length,
          executionTime: validationResult.executionTime
        });

        return createApiResponse(validationResult);

      } catch (error) {
        const executionTime = Date.now() - startTime;
        this.updatePerformanceMetrics(executionTime);

        this.logger.error('Project validation failed', {
          validationId,
          projectId: project.id,
          error: error instanceof Error ? error.message : 'Unknown error',
          executionTime
        });

        throw new ReadyAIError(
          `Project validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'PROJECT_VALIDATION_ERROR',
          500,
          {
            validationId,
            projectId: project.id,
            context,
            executionTime
          }
        );
      }
    });
  }

  /**
   * Validate project creation request
   */
  async validateProjectCreation(
    request: ProjectCreationRequest,
    context: Omit<ProjectValidationContext, 'mode'>
  ): Promise<ApiResponse<EnhancedValidationResult>> {
    return wrapAsync(async () => {
      this.logger.debug('Validating project creation request', {
        projectName: request.name,
        templateId: request.templateId,
        techStack: request.techStack
      });

      // Create temporary project for validation
      const tempProject: Partial<Project> = {
        id: generateUUID(),
        name: request.name,
        description: request.description,
        currentPhase: 'Phase0_StrategicCharter',
        status: 'active',
        createdAt: createTimestamp(),
        updatedAt: createTimestamp(),
        techStack: request.techStack || { frontend: '', backend: '', database: '', languages: [], tools: [] },
        config: request.config || {
          quality: { testCoverage: 80, lintingLevel: 'standard', typeChecking: 'standard' },
          aiSettings: { preferredProvider: 'claude-3.5-sonnet', extendedThinking: false, contextCompression: 'standard' },
          development: { autoSave: true, gitIntegration: true, checkpointFrequency: 'medium' }
        },
        phases: [],
        milestones: [],
        artifacts: [],
        collaborators: [],
        deployments: [],
        integrations: [],
        metrics: { totalFiles: 0, totalLines: 0, totalTokens: 0, sizeInBytes: 0, aiGenerations: 0, userModifications: 0 }
      } as Project;

      const validationContext: ProjectValidationContext = {
        ...context,
        mode: 'creation'
      };

      return await this.validateProject(tempProject as Project, validationContext);
    });
  }

  /**
   * Validate project update request
   */
  async validateProjectUpdate(
    currentProject: Project,
    updateRequest: ProjectUpdateRequest,
    context: Omit<ProjectValidationContext, 'mode'>
  ): Promise<ApiResponse<EnhancedValidationResult>> {
    return wrapAsync(async () => {
      this.logger.debug('Validating project update request', {
        projectId: currentProject.id,
        updateFields: Object.keys(updateRequest)
      });

      // Create updated project version for validation
      const updatedProject: Project = {
        ...currentProject,
        ...updateRequest,
        updatedAt: createTimestamp()
      };

      const validationContext: ProjectValidationContext = {
        ...context,
        mode: 'update',
        projectId: currentProject.id
      };

      return await this.validateProject(updatedProject, validationContext);
    });
  }

  /**
   * Validate phase transition
   */
  async validatePhaseTransition(
    project: Project,
    fromPhase: PhaseType,
    toPhase: PhaseType,
    context: Omit<ProjectValidationContext, 'mode' | 'fromPhase' | 'targetPhase'>
  ): Promise<ApiResponse<EnhancedValidationResult>> {
    return wrapAsync(async () => {
      this.logger.debug('Validating phase transition', {
        projectId: project.id,
        fromPhase,
        toPhase
      });

      const validationContext: ProjectValidationContext = {
        ...context,
        mode: 'phase_transition',
        projectId: project.id,
        fromPhase,
        targetPhase: toPhase
      };

      return await this.validateProject(project, validationContext);
    });
  }

  /**
   * Perform batch validation of multiple projects
   */
  async validateBatch(
    request: BatchValidationRequest
  ): Promise<ApiResponse<BatchValidationResult>> {
    return wrapAsync(async () => {
      const startTime = Date.now();
      const { projectIds, context, failFast = false, maxConcurrency = this.options.maxConcurrentValidations } = request;

      this.logger.info('Starting batch validation', {
        projectCount: projectIds.length,
        mode: context.mode,
        failFast,
        maxConcurrency
      });

      const results = new Map<UUID, EnhancedValidationResult>();
      const errors: Error[] = [];
      let successCount = 0;
      let failureCount = 0;

      // Process projects in batches
      const batches = this.chunkArray(projectIds, maxConcurrency);
      
      for (const batch of batches) {
        const batchPromises = batch.map(async (projectId) => {
          try {
            // For actual implementation, you would load the project here
            // This is a placeholder for the project loading logic
            const project = await this.loadProject(projectId);
            
            const validationResult = await this.validateProject(project, {
              ...context,
              projectId
            });

            if (isApiSuccess(validationResult)) {
              results.set(projectId, validationResult.data);
              if (validationResult.data.passed) {
                successCount++;
              } else {
                failureCount++;
              }
            } else {
              failureCount++;
              errors.push(new Error(`Validation failed for project ${projectId}: ${validationResult.error.message}`));
            }

          } catch (error) {
            failureCount++;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            errors.push(new Error(`Failed to validate project ${projectId}: ${errorMessage}`));

            if (failFast) {
              throw error;
            }
          }
        });

        await Promise.allSettled(batchPromises);

        if (failFast && errors.length > 0) {
          break;
        }
      }

      const totalExecutionTime = Date.now() - startTime;
      const averageExecutionTime = results.size > 0 ? totalExecutionTime / results.size : 0;

      const batchResult: BatchValidationResult = {
        success: errors.length === 0,
        results,
        summary: {
          totalProjects: projectIds.length,
          successfulValidations: successCount,
          failedValidations: failureCount,
          totalExecutionTime,
          averageExecutionTime
        },
        batchRecommendations: this.generateBatchRecommendations(results)
      };

      this.logger.info('Batch validation completed', {
        totalProjects: projectIds.length,
        successful: successCount,
        failed: failureCount,
        executionTime: totalExecutionTime,
        averageTime: averageExecutionTime
      });

      return createApiResponse(batchResult);
    });
  }

  /**
   * Add a custom validation rule
   */
  addValidationRule(rule: ValidationRule): void {
    if (this.options.disabledRules.includes(rule.id)) {
      this.logger.debug('Skipping disabled validation rule', { ruleId: rule.id });
      return;
    }

    this.validationRules.set(rule.id, rule);
    this.logger.debug('Added validation rule', {
      ruleId: rule.id,
      category: rule.category,
      severity: rule.severity
    });
  }

  /**
   * Remove a validation rule
   */
  removeValidationRule(ruleId: string): boolean {
    const removed = this.validationRules.delete(ruleId);
    if (removed) {
      this.logger.debug('Removed validation rule', { ruleId });
    }
    return removed;
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): typeof this.performanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Clear validation cache
   */
  clearValidationCache(): void {
    this.validationCache.clear();
    this.logger.debug('Validation cache cleared');
  }

  /**
   * Initialize built-in validation rules
   */
  private initializeValidationRules(): void {
    // Schema validation rules
    this.addValidationRule({
      id: 'project_name_required',
      name: 'Project Name Required',
      description: 'Project must have a non-empty name',
      category: 'schema',
      severity: 'error',
      enabled: true,
      validate: async (project: Project) => ({
        passed: !!(project.name && project.name.trim().length > 0),
        message: project.name ? undefined : 'Project name is required',
        recommendations: project.name ? [] : ['Provide a meaningful project name']
      })
    });

    this.addValidationRule({
      id: 'project_name_length',
      name: 'Project Name Length',
      description: 'Project name must be between 1 and 100 characters',
      category: 'schema',
      severity: 'error',
      enabled: true,
      validate: async (project: Project) => {
        const nameLength = project.name?.length || 0;
        return {
          passed: nameLength > 0 && nameLength <= 100,
          message: nameLength > 100 ? 'Project name must be 100 characters or less' : 
                   nameLength === 0 ? 'Project name cannot be empty' : undefined,
          recommendations: nameLength > 100 ? ['Shorten the project name to 100 characters or less'] : []
        };
      }
    });

    // Tech stack validation rules
    this.addValidationRule({
      id: 'tech_stack_languages',
      name: 'Tech Stack Languages',
      description: 'Project should specify at least one programming language',
      category: 'business_logic',
      severity: 'warning',
      enabled: true,
      validate: async (project: Project) => ({
        passed: project.techStack.languages.length > 0,
        message: project.techStack.languages.length === 0 ? 'No programming languages specified' : undefined,
        recommendations: project.techStack.languages.length === 0 ? 
          ['Specify the primary programming languages for your project'] : []
      })
    });

    // Phase compatibility rules
    this.addValidationRule({
      id: 'current_phase_valid',
      name: 'Current Phase Valid',
      description: 'Project must have a valid current phase',
      category: 'phase_compatibility',
      severity: 'error',
      enabled: true,
      validate: async (project: Project) => {
        const validPhases: PhaseType[] = [
          'Phase0_StrategicCharter',
          'Phase1_ArchitecturalBlueprint', 
          'Phase20_CoreContracts',
          'Phase21_ModuleSpec',
          'Phase23_ModuleSpecSubsequent',
          'Phase30_ProjectScaffolding',
          'Phase301_MasterPlan',
          'Phase31_FileGeneration',
          'Phase4_ValidationCorrection',
          'Phase5_TestGeneration',
          'Phase6_Documentation',
          'Phase7_Iteration'
        ];
        
        return {
          passed: validPhases.includes(project.currentPhase),
          message: validPhases.includes(project.currentPhase) ? 
            undefined : `Invalid current phase: ${project.currentPhase}`,
          recommendations: validPhases.includes(project.currentPhase) ? [] :
            ['Set current phase to a valid ReadyAI development phase']
        };
      }
    });

    // Quality metrics validation
    this.addValidationRule({
      id: 'test_coverage_target',
      name: 'Test Coverage Target',
      description: 'Test coverage target should be reasonable (50-100%)',
      category: 'quality',
      severity: 'warning',
      enabled: true,
      validate: async (project: Project) => {
        const coverage = project.config.quality.testCoverage;
        return {
          passed: coverage >= 50 && coverage <= 100,
          message: coverage < 50 ? 'Test coverage target is below recommended minimum (50%)' :
                   coverage > 100 ? 'Test coverage target cannot exceed 100%' : undefined,
          recommendations: coverage < 50 ? ['Consider increasing test coverage target to at least 50%'] :
                          coverage > 100 ? ['Set test coverage target to a value between 50% and 100%'] : []
        };
      }
    });

    // Security validation rules
    this.addValidationRule({
      id: 'project_path_security',
      name: 'Project Path Security',
      description: 'Project root path should be secure and accessible',
      category: 'security',
      severity: 'warning',
      enabled: true,
      validate: async (project: Project) => {
        const hasRootPath = !!(project.rootPath && project.rootPath.trim().length > 0);
        return {
          passed: hasRootPath,
          message: hasRootPath ? undefined : 'Project root path is not set',
          recommendations: hasRootPath ? [] : ['Set a secure root path for the project']
        };
      }
    });

    this.logger.debug('Initialized built-in validation rules', {
      ruleCount: this.validationRules.size
    });
  }

  /**
   * Get applicable validation rules for a project and context
   */
  private getApplicableRules(project: Project, context: ProjectValidationContext): ValidationRule[] {
    return Array.from(this.validationRules.values()).filter(rule => {
      // Check if rule is enabled
      if (!rule.enabled) return false;

      // Check if rule applies to the current phase
      if (rule.applicablePhases && rule.applicablePhases.length > 0) {
        const relevantPhase = context.targetPhase || project.currentPhase;
        if (!rule.applicablePhases.includes(relevantPhase)) return false;
      }

      return true;
    });
  }

  /**
   * Execute validation rules with proper error handling and timeout
   */
  private async executeValidationRules(
    project: Project,
    context: ProjectValidationContext,
    rules: ValidationRule[],
    validationId: string
  ): Promise<Map<string, ValidationRuleResult>> {
    const results = new Map<string, ValidationRuleResult>();

    if (this.options.enableParallelValidation) {
      // Execute rules in parallel with concurrency limit
      const batches = this.chunkArray(rules, this.options.maxConcurrentValidations);
      
      for (const batch of batches) {
        const batchPromises = batch.map(async (rule) => {
          try {
            const result = await Promise.race([
              rule.validate(project, context),
              this.createTimeoutPromise(this.options.validationTimeout)
            ]);
            results.set(rule.id, result);
          } catch (error) {
            this.logger.warn('Validation rule execution failed', {
              validationId,
              ruleId: rule.id,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
            results.set(rule.id, {
              passed: false,
              message: `Rule execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              severityOverride: 'error'
            });
          }
        });

        await Promise.allSettled(batchPromises);
      }
    } else {
      // Execute rules sequentially
      for (const rule of rules) {
        try {
          const result = await Promise.race([
            rule.validate(project, context),
            this.createTimeoutPromise(this.options.validationTimeout)
          ]);
          results.set(rule.id, result);
        } catch (error) {
          this.logger.warn('Validation rule execution failed', {
            validationId,
            ruleId: rule.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          results.set(rule.id, {
            passed: false,
            message: `Rule execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            severityOverride: 'error'
          });
        }
      }
    }

    return results;
  }

  /**
   * Process rule results and update validation result
   */
  private processRuleResults(
    validationResult: EnhancedValidationResult,
    ruleResults: Map<string, ValidationRuleResult>,
    rules: ValidationRule[]
  ): void {
    const categories = new Set<ValidationCategory>();

    for (const rule of rules) {
      const result = ruleResults.get(rule.id);
      if (!result) continue;

      categories.add(rule.category);

      if (!result.passed) {
        const severity = result.severityOverride || rule.severity;
        const message = result.message || `${rule.name} validation failed`;

        switch (severity) {
          case 'error':
          case 'critical':
            validationResult.errors.push(message);
            validationResult.passed = false;
            break;
          case 'warning':
            validationResult.warnings.push(message);
            break;
          case 'info':
            validationResult.suggestions.push(message);
            break;
        }
      }
    }

    validationResult.validationCategories = Array.from(categories);
  }

  /**
   * Integrate core ReadyAI validation results
   */
  private integrateCoreValidation(
    validationResult: EnhancedValidationResult,
    coreValidation: ValidationResult
  ): void {
    // Merge core validation results
    validationResult.errors.push(...coreValidation.errors);
    validationResult.warnings.push(...coreValidation.warnings);
    validationResult.suggestions.push(...coreValidation.suggestions);

    // Update passed status
    if (!coreValidation.passed) {
      validationResult.passed = false;
    }

    // Update constraints checked count
    validationResult.metrics.constraintsChecked += 1;
  }

  /**
   * Calculate final validation score
   */
  private calculateValidationScore(validationResult: EnhancedValidationResult): void {
    let score = 100;
    
    // Deduct points for errors and warnings
    score -= validationResult.errors.length * 20;
    score -= validationResult.warnings.length * 5;
    score -= validationResult.suggestions.length * 2;

    // Ensure score doesn't go below 0
    validationResult.score = Math.max(0, score);
  }

  /**
   * Generate recommendations based on validation results
   */
  private async generateRecommendations(
    validationResult: EnhancedValidationResult,
    project: Project,
    context: ProjectValidationContext
  ): Promise<ValidationRecommendation[]> {
    const recommendations: ValidationRecommendation[] = [];

    // Generate recommendations for errors
    for (const error of validationResult.errors) {
      recommendations.push({
        id: generateUUID(),
        category: 'schema',
        severity: 'critical',
        title: 'Critical Issue Detected',
        description: error,
        actions: ['Address this critical issue before proceeding'],
        priority: 'critical',
        relatedIssues: [error]
      });
    }

    // Generate recommendations for warnings
    for (const warning of validationResult.warnings) {
      recommendations.push({
        id: generateUUID(),
        category: 'quality',
        severity: 'warning',
        title: 'Improvement Opportunity',
        description: warning,
        actions: ['Consider addressing this warning to improve project quality'],
        estimatedEffort: 1,
        priority: 'medium',
        relatedIssues: [warning]
      });
    }

    return recommendations;
  }

  /**
   * Generate batch-level recommendations
   */
  private generateBatchRecommendations(
    results: Map<UUID, EnhancedValidationResult>
  ): ValidationRecommendation[] {
    const recommendations: ValidationRecommendation[] = [];
    
    // Analyze common issues across projects
    const commonErrors = new Map<string, number>();
    const commonWarnings = new Map<string, number>();

    for (const result of results.values()) {
      result.errors.forEach(error => {
        commonErrors.set(error, (commonErrors.get(error) || 0) + 1);
      });
      result.warnings.forEach(warning => {
        commonWarnings.set(warning, (commonWarnings.get(warning) || 0) + 1);
      });
    }

    // Generate recommendations for common issues
    for (const [error, count] of commonErrors) {
      if (count > 1) {
        recommendations.push({
          id: generateUUID(),
          category: 'compliance',
          severity: 'error',
          title: 'Common Issue Across Projects',
          description: `This issue appears in ${count} projects: ${error}`,
          actions: [
            'Create a standardized solution for this common issue',
            'Update project templates to prevent this issue',
            'Add automated checks for this validation'
          ],
          estimatedEffort: count * 0.5,
          priority: 'high',
          relatedIssues: [error]
        });
      }
    }

    return recommendations;
  }

  /**
   * Get cached validation result if available and valid
   */
  private getCachedValidation(
    projectId: UUID,
    context: ProjectValidationContext
  ): EnhancedValidationResult | null {
    const cacheKey = this.buildCacheKey(projectId, context);
    const cached = this.validationCache.get(cacheKey);

    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > this.options.validationCacheTtl) {
      this.validationCache.delete(cacheKey);
      return null;
    }

    return cached.result;
  }

  /**
   * Cache validation result
   */
  private cacheValidationResult(
    projectId: UUID,
    context: ProjectValidationContext,
    result: EnhancedValidationResult
  ): void {
    const cacheKey = this.buildCacheKey(projectId, context);
    this.validationCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
      context
    });
  }

  /**
   * Build cache key for validation result
   */
  private buildCacheKey(projectId: UUID, context: ProjectValidationContext): string {
    return `${projectId}:${context.mode}:${context.targetPhase || 'none'}:${context.strict || false}`;
  }

  /**
   * Create timeout promise for rule execution
   */
  private createTimeoutPromise(timeoutMs: number): Promise<ValidationRuleResult> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Validation rule execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(executionTime: number): void {
    this.performanceMetrics.totalValidations++;
    this.performanceMetrics.totalExecutionTime += executionTime;
    this.performanceMetrics.averageExecutionTime = 
      this.performanceMetrics.totalExecutionTime / this.performanceMetrics.totalValidations;
  }

  /**
   * Chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Load project by ID (placeholder for actual implementation)
   */
  private async loadProject(projectId: UUID): Promise<Project> {
    // This would typically load from a repository
    // For now, return a placeholder
    throw new ReadyAIError(
      'Project loading not implemented in validator',
      'NOT_IMPLEMENTED',
      501,
      { projectId }
    );
  }
}

/**
 * Factory function to create a ProjectValidator instance
 */
export function createProjectValidator(
  configService: ConfigService,
  logger: Logger,
  options: ProjectValidatorOptions = {}
): ProjectValidator {
  return new ProjectValidator(configService, logger, options);
}

export default ProjectValidator;
