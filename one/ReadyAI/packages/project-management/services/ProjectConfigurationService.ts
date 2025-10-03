// packages/project-management/services/ProjectConfigurationService.ts

/**
 * Project Configuration Service for ReadyAI Personal AI Development Orchestrator
 * 
 * Adapted from Cline's proven configuration management patterns with ReadyAI-specific
 * extensions for project-specific configuration management, inheritance patterns,
 * and multi-phase development lifecycle integration.
 * 
 * Primary Cline Sources:
 * - Enhanced ConfigService (configuration orchestration and state management)
 * - Settings management patterns (user preferences and project settings)
 * - Configuration validation and normalization patterns
 * - Auto-approval and permission-based configuration
 * 
 * Key ReadyAI Adaptations:
 * - Project-specific configuration scoping and inheritance
 * - Multi-phase configuration management with phase-specific overrides
 * - Technology stack configuration integration
 * - AI provider configuration per project
 * - Local-first configuration persistence with backup/restore
 * - Configuration templates and presets management
 * 
 * @version 1.0.0 - Phase 2.1 Implementation
 * @author ReadyAI Development Team
 */

import {
  UUID,
  ApiResponse,
  ApiErrorResponse,
  ReadyAIError,
  AsyncResult,
  wrapAsync,
  createApiResponse,
  createApiError,
  isApiSuccess,
  PhaseType,
  AIProviderType,
  ProjectConfig,
  TechStack,
  generateUUID,
  createTimestamp
} from '../../foundation/types/core';

import {
  Project,
  ProjectCreationRequest,
  ProjectUpdateRequest,
  ProjectTemplate,
  ProjectCategory,
  ProjectComplexity,
  ProjectPriority
} from '../types/project';

import { ConfigService } from '../../config/services/ConfigService';
import { Logger } from '../../logging/services/Logger';
import { ErrorService } from '../../error-handling/services/ErrorService';

// =============================================================================
// PROJECT CONFIGURATION TYPES
// =============================================================================

/**
 * Project-specific configuration that extends base ProjectConfig
 * Following Cline's hierarchical configuration pattern
 */
export interface ProjectConfiguration extends ProjectConfig {
  /** Project-specific overrides */
  projectSpecific: {
    /** Custom AI model configurations per phase */
    phaseModelOverrides: Record<PhaseType, {
      aiProvider?: AIProviderType;
      modelId?: string;
      temperature?: number;
      maxTokens?: number;
      systemPrompt?: string;
    }>;
    
    /** Technology stack specific settings */
    techStackSettings: {
      buildCommand?: string;
      testCommand?: string;
      lintCommand?: string;
      formatCommand?: string;
      environmentVariables?: Record<string, string>;
      dependencies?: {
        required: string[];
        optional: string[];
        dev: string[];
      };
    };
    
    /** Project workspace settings */
    workspaceSettings: {
      excludePatterns: string[];
      includePatterns: string[];
      watchPatterns: string[];
      ignorePaths: string[];
      maxFileSize: number;
      encoding: string;
    };
    
    /** Collaboration and sharing settings */
    collaborationSettings: {
      enableRealTimeSync: boolean;
      conflictResolution: 'auto' | 'manual' | 'prompt';
      changeNotifications: boolean;
      reviewRequired: boolean;
      approvalWorkflow: boolean;
    };
    
    /** Performance and resource limits */
    performanceSettings: {
      maxMemoryUsage: number;
      maxCpuUsage: number;
      timeoutSettings: {
        aiRequest: number;
        fileOperation: number;
        buildOperation: number;
      };
      cacheSettings: {
        enableCache: boolean;
        cacheTtl: number;
        maxCacheSize: number;
      };
    };
  };
  
  /** Configuration metadata */
  metadata: {
    version: string;
    createdAt: string;
    updatedAt: string;
    createdBy: UUID;
    lastModifiedBy: UUID;
    source: 'default' | 'template' | 'inherited' | 'custom';
    templateId?: UUID;
    parentConfigId?: UUID;
  };
}

/**
 * Configuration inheritance pattern following Cline's settings hierarchy
 */
export interface ConfigurationInheritance {
  /** Base configuration (system defaults) */
  base: Partial<ProjectConfiguration>;
  
  /** Template configuration (if created from template) */
  template?: Partial<ProjectConfiguration>;
  
  /** Category configuration (category-specific defaults) */
  category?: Partial<ProjectConfiguration>;
  
  /** User preferences (user-specific overrides) */
  userPreferences?: Partial<ProjectConfiguration>;
  
  /** Project configuration (project-specific settings) */
  project: Partial<ProjectConfiguration>;
}

/**
 * Configuration template for project creation
 * Following Cline's configuration preset patterns
 */
export interface ConfigurationTemplate {
  id: UUID;
  name: string;
  description: string;
  category: ProjectCategory;
  techStack: TechStack;
  configuration: Partial<ProjectConfiguration>;
  complexity: ProjectComplexity;
  tags: string[];
  isSystem: boolean;
  usageCount: number;
  rating: number;
  createdAt: string;
  updatedAt: string;
  author: {
    id: UUID;
    name: string;
  };
}

/**
 * Configuration validation result with ReadyAI-specific checks
 */
export interface ProjectConfigurationValidationResult {
  isValid: boolean;
  errors: {
    field: string;
    message: string;
    severity: 'error' | 'warning' | 'suggestion';
    code: string;
  }[];
  warnings: string[];
  suggestions: string[];
  compatibility: {
    techStack: boolean;
    aiProvider: boolean;
    phase: boolean;
    dependencies: boolean;
  };
  performance: {
    estimatedMemoryUsage: number;
    estimatedProcessingTime: number;
    resourceWarnings: string[];
  };
}

/**
 * Configuration backup and versioning
 * Adapted from Cline's checkpoint system
 */
export interface ConfigurationBackup {
  id: UUID;
  projectId: UUID;
  configuration: ProjectConfiguration;
  timestamp: string;
  version: number;
  description: string;
  trigger: 'manual' | 'auto' | 'phase_change' | 'major_change';
  size: number;
  canRestore: boolean;
}

/**
 * Configuration change event for tracking and rollback
 */
export interface ProjectConfigurationChangeEvent {
  eventId: UUID;
  projectId: UUID;
  timestamp: string;
  changeType: 'create' | 'update' | 'reset' | 'inherit' | 'template_apply' | 'rollback';
  changedFields: string[];
  previousValues: Record<string, any>;
  newValues: Record<string, any>;
  metadata: {
    userId: UUID;
    source: 'user' | 'system' | 'template' | 'inheritance';
    reason?: string;
  };
}

// =============================================================================
// PROJECT CONFIGURATION SERVICE OPTIONS
// =============================================================================

export interface ProjectConfigurationServiceOptions {
  /** Enable automatic configuration validation */
  enableAutoValidation?: boolean;
  
  /** Enable configuration change tracking */
  enableChangeTracking?: boolean;
  
  /** Enable automatic backup creation */
  enableAutoBackup?: boolean;
  
  /** Maximum number of backups to retain */
  maxBackups?: number;
  
  /** Enable configuration inheritance */
  enableInheritance?: boolean;
  
  /** Enable performance monitoring */
  enablePerformanceMonitoring?: boolean;
  
  /** Configuration cache TTL in milliseconds */
  cacheTtl?: number;
  
  /** Default configuration source */
  defaultConfigurationSource?: 'system' | 'template';
}

const DEFAULT_SERVICE_OPTIONS: Required<ProjectConfigurationServiceOptions> = {
  enableAutoValidation: true,
  enableChangeTracking: true,
  enableAutoBackup: true,
  maxBackups: 10,
  enableInheritance: true,
  enablePerformanceMonitoring: true,
  cacheTtl: 300000, // 5 minutes
  defaultConfigurationSource: 'system'
};

// =============================================================================
// MAIN PROJECT CONFIGURATION SERVICE
// =============================================================================

/**
 * Project Configuration Service
 * 
 * Manages project-specific configuration with inheritance, validation, and templates.
 * Adapted from Cline's proven configuration management patterns with ReadyAI-specific
 * extensions for project lifecycle and multi-phase development.
 * 
 * Key responsibilities:
 * - Project configuration creation, validation, and management
 * - Configuration inheritance from templates, categories, and user preferences
 * - Phase-specific configuration overrides and management
 * - Configuration templates and presets management
 * - Backup/restore functionality with versioning
 * - Performance monitoring and optimization
 * - Change tracking and audit trail
 */
export class ProjectConfigurationService {
  private readonly configService: ConfigService;
  private readonly logger: Logger;
  private readonly errorService: ErrorService;
  private readonly options: Required<ProjectConfigurationServiceOptions>;
  
  // Configuration cache following Cline's caching patterns
  private readonly configCache = new Map<string, {
    config: ProjectConfiguration;
    timestamp: number;
    version: number;
  }>();
  
  // Configuration templates cache
  private readonly templatesCache = new Map<string, {
    templates: ConfigurationTemplate[];
    timestamp: number;
  }>();
  
  // Change tracking following Cline's event system
  private readonly changeListeners = new Set<(event: ProjectConfigurationChangeEvent) => void>();
  
  // Backup storage
  private readonly backupStorage = new Map<UUID, ConfigurationBackup[]>();
  
  constructor(
    configService: ConfigService,
    options: ProjectConfigurationServiceOptions = {},
    logger?: Logger,
    errorService?: ErrorService
  ) {
    this.configService = configService;
    this.options = { ...DEFAULT_SERVICE_OPTIONS, ...options };
    this.logger = logger || this.createBasicLogger();
    this.errorService = errorService || this.createBasicErrorService();
    
    this.logger.info('ProjectConfigurationService initialized', {
      options: this.options,
      cacheEnabled: this.options.cacheTtl > 0,
      inheritanceEnabled: this.options.enableInheritance,
      validationEnabled: this.options.enableAutoValidation
    });
  }

  /**
   * Create project configuration from creation request
   * Adapted from Cline's configuration creation patterns
   */
  async createProjectConfiguration(
    request: ProjectCreationRequest,
    userId: UUID
  ): Promise<ApiResponse<ProjectConfiguration>> {
    return wrapAsync(async () => {
      this.logger.debug('Creating project configuration', { 
        projectName: request.name,
        templateId: request.templateId,
        userId 
      });

      // Build configuration from inheritance chain
      const inheritanceChain = await this.buildInheritanceChain(request, userId);
      const baseConfig = this.applyConfigurationInheritance(inheritanceChain);

      // Apply request-specific overrides
      const projectConfig: ProjectConfiguration = {
        ...baseConfig,
        ...request.config,
        projectSpecific: {
          ...baseConfig.projectSpecific,
          phaseModelOverrides: {},
          techStackSettings: {
            buildCommand: request.techStack?.tools?.find(t => t.includes('build')) || 'npm run build',
            testCommand: request.techStack?.tools?.find(t => t.includes('test')) || 'npm test',
            lintCommand: request.techStack?.tools?.find(t => t.includes('lint')) || 'npm run lint',
            formatCommand: 'npm run format',
            environmentVariables: {},
            dependencies: {
              required: [],
              optional: [],
              dev: []
            }
          },
          workspaceSettings: {
            excludePatterns: ['node_modules', '.git', 'dist', 'build', '.next'],
            includePatterns: ['src/**/*', 'lib/**/*', 'app/**/*'],
            watchPatterns: ['src/**/*', 'app/**/*', '*.config.*'],
            ignorePaths: ['.git', 'node_modules', '.env'],
            maxFileSize: 1024 * 1024, // 1MB
            encoding: 'utf8'
          },
          collaborationSettings: {
            enableRealTimeSync: false,
            conflictResolution: 'prompt',
            changeNotifications: true,
            reviewRequired: false,
            approvalWorkflow: false
          },
          performanceSettings: {
            maxMemoryUsage: 512, // MB
            maxCpuUsage: 80, // percentage
            timeoutSettings: {
              aiRequest: 30000, // 30 seconds
              fileOperation: 5000, // 5 seconds
              buildOperation: 120000 // 2 minutes
            },
            cacheSettings: {
              enableCache: true,
              cacheTtl: 3600000, // 1 hour
              maxCacheSize: 100 // MB
            }
          }
        },
        metadata: {
          version: '1.0.0',
          createdAt: createTimestamp(),
          updatedAt: createTimestamp(),
          createdBy: userId,
          lastModifiedBy: userId,
          source: request.templateId ? 'template' : 'custom',
          templateId: request.templateId
        }
      };

      // Validate configuration
      if (this.options.enableAutoValidation) {
        const validationResult = await this.validateConfiguration(projectConfig, {
          techStack: request.techStack,
          complexity: request.complexity,
          priority: request.priority
        });

        if (!validationResult.isValid) {
          const errors = validationResult.errors.filter(e => e.severity === 'error');
          if (errors.length > 0) {
            throw new ReadyAIError(
              `Project configuration validation failed: ${errors.map(e => e.message).join(', ')}`,
              'PROJECT_CONFIG_VALIDATION_ERROR',
              422,
              { errors: validationResult.errors }
            );
          }
        }
      }

      this.logger.info('Project configuration created successfully', { 
        source: projectConfig.metadata.source,
        templateId: request.templateId,
        hasInheritance: !!inheritanceChain.template || !!inheritanceChain.category
      });

      return createApiResponse(projectConfig);
    });
  }

  /**
   * Get project configuration with caching and inheritance resolution
   */
  async getProjectConfiguration(
    projectId: UUID,
    includeInherited: boolean = true
  ): Promise<ApiResponse<ProjectConfiguration>> {
    return wrapAsync(async () => {
      this.logger.debug('Retrieving project configuration', { projectId, includeInherited });

      // Check cache first
      const cacheKey = `${projectId}:${includeInherited}`;
      const cached = this.getConfigFromCache(cacheKey);
      if (cached) {
        this.logger.debug('Configuration retrieved from cache', { projectId });
        return createApiResponse(cached);
      }

      // Load base configuration from ConfigService
      const baseConfigResult = await this.configService.getConfiguration(projectId);
      if (!isApiSuccess(baseConfigResult)) {
        throw new ReadyAIError(
          `Failed to retrieve base configuration: ${baseConfigResult.error.message}`,
          'PROJECT_CONFIG_RETRIEVAL_ERROR',
          500,
          { projectId }
        );
      }

      let projectConfig = baseConfigResult.data as ProjectConfiguration;

      // Apply inheritance if requested
      if (includeInherited && this.options.enableInheritance) {
        // This would require project metadata to determine inheritance chain
        // For now, return the direct configuration
      }

      // Cache the configuration
      this.setConfigInCache(cacheKey, projectConfig);

      this.logger.info('Project configuration retrieved successfully', { 
        projectId,
        version: projectConfig.metadata?.version,
        source: projectConfig.metadata?.source
      });

      return createApiResponse(projectConfig);
    });
  }

  /**
   * Update project configuration with validation and change tracking
   */
  async updateProjectConfiguration(
    projectId: UUID,
    updates: Partial<ProjectConfiguration>,
    userId: UUID,
    options: {
      validateOnly?: boolean;
      createBackup?: boolean;
      skipValidation?: boolean;
    } = {}
  ): Promise<ApiResponse<ProjectConfiguration>> {
    return wrapAsync(async () => {
      this.logger.debug('Updating project configuration', { projectId, userId, options });

      // Get current configuration
      const currentResult = await this.getProjectConfiguration(projectId, false);
      if (!isApiSuccess(currentResult)) {
        throw new ReadyAIError(
          `Failed to retrieve current configuration: ${currentResult.error.message}`,
          'PROJECT_CONFIG_UPDATE_ERROR',
          500,
          { projectId }
        );
      }

      const currentConfig = currentResult.data;

      // Create backup if requested
      if (options.createBackup !== false && this.options.enableAutoBackup) {
        await this.createConfigurationBackup(projectId, currentConfig, 'auto', userId, 'Before update');
      }

      // Apply updates
      const updatedConfig: ProjectConfiguration = {
        ...currentConfig,
        ...updates,
        metadata: {
          ...currentConfig.metadata,
          ...updates.metadata,
          updatedAt: createTimestamp(),
          lastModifiedBy: userId,
          version: this.incrementVersion(currentConfig.metadata?.version || '1.0.0')
        }
      };

      // Validate updated configuration
      if (this.options.enableAutoValidation && !options.skipValidation) {
        const validationResult = await this.validateConfiguration(updatedConfig);
        
        if (!validationResult.isValid) {
          const errors = validationResult.errors.filter(e => e.severity === 'error');
          if (errors.length > 0) {
            throw new ReadyAIError(
              `Configuration validation failed: ${errors.map(e => e.message).join(', ')}`,
              'PROJECT_CONFIG_VALIDATION_ERROR',
              422,
              { errors: validationResult.errors }
            );
          }
        }

        // Return early for validation-only mode
        if (options.validateOnly) {
          return createApiResponse(updatedConfig);
        }
      }

      // Persist updated configuration
      const saveResult = await this.configService.updateConfiguration(
        projectId,
        { updates: updatedConfig }
      );

      if (!isApiSuccess(saveResult)) {
        throw new ReadyAIError(
          `Failed to save updated configuration: ${saveResult.error.message}`,
          'PROJECT_CONFIG_SAVE_ERROR',
          500,
          { projectId }
        );
      }

      // Emit change event
      if (this.options.enableChangeTracking) {
        await this.emitConfigurationChangeEvent({
          eventId: generateUUID(),
          projectId,
          timestamp: createTimestamp(),
          changeType: 'update',
          changedFields: Object.keys(updates),
          previousValues: this.extractChangedValues(currentConfig, Object.keys(updates)),
          newValues: this.extractChangedValues(updatedConfig, Object.keys(updates)),
          metadata: {
            userId,
            source: 'user',
            reason: 'Manual configuration update'
          }
        });
      }

      // Update cache
      this.invalidateConfigCache(projectId);

      this.logger.info('Project configuration updated successfully', { 
        projectId,
        fieldsChanged: Object.keys(updates).length,
        newVersion: updatedConfig.metadata.version
      });

      return createApiResponse(updatedConfig);
    });
  }

  /**
   * Apply configuration template to project
   * Following Cline's template application patterns
   */
  async applyConfigurationTemplate(
    projectId: UUID,
    templateId: UUID,
    userId: UUID,
    mergeStrategy: 'replace' | 'merge' | 'selective' = 'merge'
  ): Promise<ApiResponse<ProjectConfiguration>> {
    return wrapAsync(async () => {
      this.logger.debug('Applying configuration template', { projectId, templateId, mergeStrategy });

      // Load template
      const template = await this.getConfigurationTemplate(templateId);
      if (!template) {
        throw new ReadyAIError(
          `Configuration template not found: ${templateId}`,
          'TEMPLATE_NOT_FOUND',
          404,
          { templateId }
        );
      }

      // Get current configuration
      const currentResult = await this.getProjectConfiguration(projectId, false);
      if (!isApiSuccess(currentResult)) {
        throw new ReadyAIError(
          `Failed to retrieve current configuration: ${currentResult.error.message}`,
          'PROJECT_CONFIG_RETRIEVAL_ERROR',
          500,
          { projectId }
        );
      }

      const currentConfig = currentResult.data;
      let updatedConfig: ProjectConfiguration;

      // Apply template based on merge strategy
      switch (mergeStrategy) {
        case 'replace':
          updatedConfig = {
            ...template.configuration as ProjectConfiguration,
            metadata: {
              ...currentConfig.metadata,
              updatedAt: createTimestamp(),
              lastModifiedBy: userId,
              source: 'template',
              templateId,
              version: this.incrementVersion(currentConfig.metadata?.version || '1.0.0')
            }
          };
          break;

        case 'merge':
          updatedConfig = this.deepMergeConfigurations(
            currentConfig,
            template.configuration as ProjectConfiguration,
            {
              updatedAt: createTimestamp(),
              lastModifiedBy: userId,
              templateId,
              version: this.incrementVersion(currentConfig.metadata?.version || '1.0.0')
            }
          );
          break;

        case 'selective':
          // For selective merge, only apply non-conflicting settings
          updatedConfig = this.selectiveMergeConfigurations(
            currentConfig,
            template.configuration as ProjectConfiguration,
            {
              updatedAt: createTimestamp(),
              lastModifiedBy: userId,
              templateId,
              version: this.incrementVersion(currentConfig.metadata?.version || '1.0.0')
            }
          );
          break;
      }

      // Update configuration
      const updateResult = await this.updateProjectConfiguration(
        projectId,
        updatedConfig,
        userId,
        { createBackup: true }
      );

      if (!isApiSuccess(updateResult)) {
        throw new ReadyAIError(
          `Failed to apply template: ${updateResult.error.message}`,
          'TEMPLATE_APPLICATION_ERROR',
          500,
          { projectId, templateId }
        );
      }

      // Update template usage count
      await this.incrementTemplateUsage(templateId);

      this.logger.info('Configuration template applied successfully', {
        projectId,
        templateId,
        templateName: template.name,
        mergeStrategy
      });

      return updateResult;
    });
  }

  /**
   * Validate project configuration
   * Following Cline's comprehensive validation patterns
   */
  async validateConfiguration(
    config: ProjectConfiguration,
    context?: {
      techStack?: TechStack;
      complexity?: ProjectComplexity;
      priority?: ProjectPriority;
    }
  ): Promise<ProjectConfigurationValidationResult> {
    const errors: ProjectConfigurationValidationResult['errors'] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    try {
      // Basic validation
      if (!config.quality?.testCoverage || config.quality.testCoverage < 0 || config.quality.testCoverage > 100) {
        errors.push({
          field: 'quality.testCoverage',
          message: 'Test coverage must be between 0 and 100',
          severity: 'error',
          code: 'INVALID_TEST_COVERAGE'
        });
      }

      if (!config.aiSettings?.preferredProvider) {
        errors.push({
          field: 'aiSettings.preferredProvider',
          message: 'AI provider must be specified',
          severity: 'error',
          code: 'MISSING_AI_PROVIDER'
        });
      }

      // Performance validation
      const performanceSettings = config.projectSpecific?.performanceSettings;
      if (performanceSettings) {
        if (performanceSettings.maxMemoryUsage > 2048) {
          warnings.push('High memory usage limit may cause performance issues');
        }

        if (performanceSettings.maxCpuUsage > 90) {
          warnings.push('High CPU usage limit may affect system responsiveness');
        }
      }

      // Tech stack compatibility
      const techStackCompatible = context?.techStack ? 
        this.validateTechStackCompatibility(config, context.techStack) : true;

      // AI provider compatibility
      const aiProviderCompatible = this.validateAIProviderCompatibility(config);

      // Dependencies validation
      const dependenciesCompatible = this.validateDependenciesCompatibility(config);

      // Performance estimation
      const estimatedMemoryUsage = this.estimateMemoryUsage(config);
      const estimatedProcessingTime = this.estimateProcessingTime(config, context?.complexity);
      const resourceWarnings = this.analyzeResourceRequirements(config);

      // Suggestions based on configuration
      if (config.quality?.testCoverage && config.quality.testCoverage < 70) {
        suggestions.push('Consider increasing test coverage for better quality assurance');
      }

      if (!config.development?.gitIntegration) {
        suggestions.push('Enable Git integration for better version control');
      }

      return {
        isValid: errors.filter(e => e.severity === 'error').length === 0,
        errors,
        warnings,
        suggestions,
        compatibility: {
          techStack: techStackCompatible,
          aiProvider: aiProviderCompatible,
          phase: true, // Phase compatibility would need project context
          dependencies: dependenciesCompatible
        },
        performance: {
          estimatedMemoryUsage,
          estimatedProcessingTime,
          resourceWarnings
        }
      };
    } catch (error) {
      this.logger.error('Configuration validation failed', { error });
      
      return {
        isValid: false,
        errors: [{
          field: 'validation',
          message: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          severity: 'error',
          code: 'VALIDATION_ERROR'
        }],
        warnings: [],
        suggestions: [],
        compatibility: {
          techStack: false,
          aiProvider: false,
          phase: false,
          dependencies: false
        },
        performance: {
          estimatedMemoryUsage: 0,
          estimatedProcessingTime: 0,
          resourceWarnings: ['Validation failed - unable to analyze performance']
        }
      };
    }
  }

  /**
   * Create configuration backup
   * Following Cline's checkpoint patterns
   */
  async createConfigurationBackup(
    projectId: UUID,
    config: ProjectConfiguration,
    trigger: ConfigurationBackup['trigger'],
    userId: UUID,
    description: string
  ): Promise<ConfigurationBackup> {
    const backup: ConfigurationBackup = {
      id: generateUUID(),
      projectId,
      configuration: { ...config },
      timestamp: createTimestamp(),
      version: this.getVersionNumber(config.metadata?.version || '1.0.0'),
      description,
      trigger,
      size: JSON.stringify(config).length,
      canRestore: true
    };

    // Store backup
    const projectBackups = this.backupStorage.get(projectId) || [];
    projectBackups.push(backup);
    
    // Maintain backup limit
    if (projectBackups.length > this.options.maxBackups) {
      projectBackups.splice(0, projectBackups.length - this.options.maxBackups);
    }
    
    this.backupStorage.set(projectId, projectBackups);

    this.logger.debug('Configuration backup created', {
      projectId,
      backupId: backup.id,
      trigger,
      size: backup.size
    });

    return backup;
  }

  /**
   * Restore configuration from backup
   */
  async restoreConfigurationFromBackup(
    projectId: UUID,
    backupId: UUID,
    userId: UUID
  ): Promise<ApiResponse<ProjectConfiguration>> {
    return wrapAsync(async () => {
      this.logger.debug('Restoring configuration from backup', { projectId, backupId });

      const projectBackups = this.backupStorage.get(projectId) || [];
      const backup = projectBackups.find(b => b.id === backupId);

      if (!backup) {
        throw new ReadyAIError(
          `Configuration backup not found: ${backupId}`,
          'BACKUP_NOT_FOUND',
          404,
          { backupId }
        );
      }

      if (!backup.canRestore) {
        throw new ReadyAIError(
          'Configuration backup cannot be restored',
          'BACKUP_NOT_RESTORABLE',
          400,
          { backupId }
        );
      }

      // Create backup of current state before restore
      const currentResult = await this.getProjectConfiguration(projectId, false);
      if (isApiSuccess(currentResult)) {
        await this.createConfigurationBackup(
          projectId,
          currentResult.data,
          'manual',
          userId,
          `Before restore from backup ${backupId.substring(0, 8)}`
        );
      }

      // Restore configuration
      const restoredConfig: ProjectConfiguration = {
        ...backup.configuration,
        metadata: {
          ...backup.configuration.metadata,
          updatedAt: createTimestamp(),
          lastModifiedBy: userId,
          version: this.incrementVersion(backup.configuration.metadata?.version || '1.0.0')
        }
      };

      const updateResult = await this.updateProjectConfiguration(
        projectId,
        restoredConfig,
        userId,
        { createBackup: false, skipValidation: false }
      );

      if (!isApiSuccess(updateResult)) {
        throw new ReadyAIError(
          `Failed to restore configuration: ${updateResult.error.message}`,
          'CONFIGURATION_RESTORE_ERROR',
          500,
          { projectId, backupId }
        );
      }

      this.logger.info('Configuration restored from backup successfully', {
        projectId,
        backupId,
        backupVersion: backup.version,
        restoredVersion: restoredConfig.metadata.version
      });

      return updateResult;
    });
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  /**
   * Build configuration inheritance chain
   */
  private async buildInheritanceChain(
    request: ProjectCreationRequest,
    userId: UUID
  ): Promise<ConfigurationInheritance> {
    const chain: ConfigurationInheritance = {
      base: this.getSystemDefaultConfiguration(),
      project: request.config || {}
    };

    // Load template configuration
    if (request.templateId) {
      const template = await this.getConfigurationTemplate(request.templateId);
      if (template) {
        chain.template = template.configuration;
      }
    }

    // Load category configuration
    if (request.categoryId) {
      const categoryConfig = await this.getCategoryConfiguration(request.categoryId);
      if (categoryConfig) {
        chain.category = categoryConfig;
      }
    }

    // Load user preferences
    const userPreferences = await this.getUserPreferences(userId);
    if (userPreferences) {
      chain.userPreferences = userPreferences;
    }

    return chain;
  }

  /**
   * Apply configuration inheritance following Cline's hierarchical pattern
   */
  private applyConfigurationInheritance(chain: ConfigurationInheritance): ProjectConfiguration {
    let config = chain.base as ProjectConfiguration;

    // Apply in order of precedence (lowest to highest)
    if (chain.template) {
      config = this.deepMergeConfigurations(config, chain.template as ProjectConfiguration);
    }

    if (chain.category) {
      config = this.deepMergeConfigurations(config, chain.category as ProjectConfiguration);
    }

    if (chain.userPreferences) {
      config = this.deepMergeConfigurations(config, chain.userPreferences as ProjectConfiguration);
    }

    if (chain.project) {
      config = this.deepMergeConfigurations(config, chain.project as ProjectConfiguration);
    }

    return config;
  }

  /**
   * Deep merge configurations
   */
  private deepMergeConfigurations(
    target: ProjectConfiguration,
    source: Partial<ProjectConfiguration>,
    metadataOverrides?: Partial<ProjectConfiguration['metadata']>
  ): ProjectConfiguration {
    const merged = { ...target };

    // Merge top-level properties
    Object.keys(source).forEach(key => {
      if (key === 'metadata') return; // Handle metadata separately
      
      const targetValue = (target as any)[key];
      const sourceValue = (source as any)[key];
      
      if (sourceValue !== undefined) {
        if (typeof sourceValue === 'object' && sourceValue !== null && !Array.isArray(sourceValue)) {
          (merged as any)[key] = { ...targetValue, ...sourceValue };
        } else {
          (merged as any)[key] = sourceValue;
        }
      }
    });

    // Handle metadata
    if (source.metadata || metadataOverrides) {
      merged.metadata = {
        ...target.metadata,
        ...source.metadata,
        ...metadataOverrides
      };
    }

    return merged;
  }

  /**
   * Selective merge avoiding conflicts
   */
  private selectiveMergeConfigurations(
    target: ProjectConfiguration,
    source: Partial<ProjectConfiguration>,
    metadataOverrides?: Partial<ProjectConfiguration['metadata']>
  ): ProjectConfiguration {
    const merged = { ...target };

    // Only merge non-conflicting values
    Object.keys(source).forEach(key => {
      if (key === 'metadata') return;
      
      const targetValue = (target as any)[key];
      const sourceValue = (source as any)[key];
      
      if (sourceValue !== undefined && (targetValue === undefined || targetValue === null)) {
        (merged as any)[key] = sourceValue;
      }
    });

    // Handle metadata
    merged.metadata = {
      ...target.metadata,
      ...metadataOverrides
    };

    return merged;
  }

  /**
   * Cache management following Cline patterns
   */
  private getConfigFromCache(cacheKey: string): ProjectConfiguration | null {
    const cached = this.configCache.get(cacheKey);
    
    if (!cached) return null;
    
    const now = Date.now();
    if (now - cached.timestamp > this.options.cacheTtl) {
      this.configCache.delete(cacheKey);
      return null;
    }
    
    return cached.config;
  }

  private setConfigInCache(cacheKey: string, config: ProjectConfiguration): void {
    this.configCache.set(cacheKey, {
      config: { ...config },
      timestamp: Date.now(),
      version: this.getVersionNumber(config.metadata?.version || '1.0.0')
    });
  }

  private invalidateConfigCache(projectId: UUID): void {
    const keysToDelete = Array.from(this.configCache.keys()).filter(key => key.startsWith(projectId));
    keysToDelete.forEach(key => this.configCache.delete(key));
  }

  /**
   * Emit configuration change event
   */
  private async emitConfigurationChangeEvent(event: ProjectConfigurationChangeEvent): Promise<void> {
    this.changeListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        this.logger.error('Configuration change listener error', {
          eventId: event.eventId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    this.logger.debug('Configuration change event emitted', {
      eventType: event.changeType,
      projectId: event.projectId,
      fieldsChanged: event.changedFields.length,
      listenersNotified: this.changeListeners.size
    });
  }

  /**
   * Extract changed values for event tracking
   */
  private extractChangedValues(config: ProjectConfiguration, fields: string[]): Record<string, any> {
    const values: Record<string, any> = {};
    
    fields.forEach(field => {
      const keys = field.split('.');
      let current: any = config;
      
      for (const key of keys) {
        if (current && typeof current === 'object' && key in current) {
          current = current[key];
        } else {
          current = undefined;
          break;
        }
      }
      
      values[field] = current;
    });
    
    return values;
  }

  /**
   * Version management utilities
   */
  private incrementVersion(version: string): string {
    const parts = version.split('.').map(Number);
    parts[2] = (parts[2] || 0) + 1;
    return parts.join('.');
  }

  private getVersionNumber(version: string): number {
    const parts = version.split('.').map(Number);
    return (parts[0] || 0) * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0);
  }

  /**
   * Validation helper methods
   */
  private validateTechStackCompatibility(config: ProjectConfiguration, techStack: TechStack): boolean {
    // Validate that AI settings are compatible with tech stack
    if (techStack.frontend.includes('React') && !config.projectSpecific?.techStackSettings.dependencies?.required.includes('react')) {
      return false;
    }
    
    return true;
  }

  private validateAIProviderCompatibility(config: ProjectConfiguration): boolean {
    const provider = config.aiSettings?.preferredProvider;
    return !!provider && ['claude-3.5-sonnet', 'gpt-4', 'gpt-3.5-turbo'].includes(provider);
  }

  private validateDependenciesCompatibility(config: ProjectConfiguration): boolean {
    const deps = config.projectSpecific?.techStackSettings.dependencies;
    if (!deps) return true;
    
    // Check for conflicting dependencies
    const hasReact = deps.required.includes('react');
    const hasVue = deps.required.includes('vue');
    const hasAngular = deps.required.includes('@angular/core');
    
    // Multiple frontend frameworks conflict
    return [hasReact, hasVue, hasAngular].filter(Boolean).length <= 1;
  }

  /**
   * Performance estimation
   */
  private estimateMemoryUsage(config: ProjectConfiguration): number {
    let baseUsage = 128; // Base memory in MB
    
    // Add for each enabled feature
    if (config.development?.gitIntegration) baseUsage += 32;
    if (config.aiSettings?.extendedThinking) baseUsage += 64;
    if (config.projectSpecific?.performanceSettings.cacheSettings.enableCache) {
      baseUsage += config.projectSpecific.performanceSettings.cacheSettings.maxCacheSize;
    }
    
    return baseUsage;
  }

  private estimateProcessingTime(config: ProjectConfiguration, complexity?: ProjectComplexity): number {
    let baseTime = 1000; // Base time in ms
    
    // Adjust for complexity
    if (complexity) {
      const multipliers = { simple: 0.5, moderate: 1, complex: 2, enterprise: 4 };
      baseTime *= multipliers[complexity];
    }
    
    // Add for AI processing
    if (config.aiSettings?.extendedThinking) baseTime += 2000;
    
    return baseTime;
  }

  private analyzeResourceRequirements(config: ProjectConfiguration): string[] {
    const warnings: string[] = [];
    
    const perfSettings = config.projectSpecific?.performanceSettings;
    if (perfSettings) {
      if (perfSettings.maxMemoryUsage > 1024) {
        warnings.push('High memory usage may require additional system resources');
      }
      
      if (perfSettings.timeoutSettings.aiRequest > 60000) {
        warnings.push('Long AI request timeouts may impact user experience');
      }
    }
    
    return warnings;
  }

  /**
   * Template and preference loading (placeholders for future implementation)
   */
  private async getConfigurationTemplate(templateId: UUID): Promise<ConfigurationTemplate | null> {
    // This would load from a template repository
    // For now, return null
    return null;
  }

  private async getCategoryConfiguration(categoryId: UUID): Promise<Partial<ProjectConfiguration> | null> {
    // This would load category-specific configuration
    return null;
  }

  private async getUserPreferences(userId: UUID): Promise<Partial<ProjectConfiguration> | null> {
    // This would load user-specific preferences
    return null;
  }

  private async incrementTemplateUsage(templateId: UUID): Promise<void> {
    // This would update template usage statistics
  }

  /**
   * Get system default configuration
   */
  private getSystemDefaultConfiguration(): Partial<ProjectConfiguration> {
    return {
      quality: {
        testCoverage: 80,
        lintingLevel: 'standard',
        typeChecking: 'standard'
      },
      aiSettings: {
        preferredProvider: 'claude-3.5-sonnet',
        extendedThinking: false,
        contextCompression: 'standard'
      },
      development: {
        autoSave: true,
        gitIntegration: true,
        checkpointFrequency: 'medium'
      },
      projectSpecific: {
        phaseModelOverrides: {},
        techStackSettings: {
          buildCommand: 'npm run build',
          testCommand: 'npm test',
          lintCommand: 'npm run lint',
          formatCommand: 'npm run format',
          environmentVariables: {},
          dependencies: {
            required: [],
            optional: [],
            dev: []
          }
        },
        workspaceSettings: {
          excludePatterns: ['node_modules', '.git', 'dist'],
          includePatterns: ['src/**/*'],
          watchPatterns: ['src/**/*'],
          ignorePaths: ['.git', 'node_modules'],
          maxFileSize: 1024 * 1024,
          encoding: 'utf8'
        },
        collaborationSettings: {
          enableRealTimeSync: false,
          conflictResolution: 'prompt',
          changeNotifications: true,
          reviewRequired: false,
          approvalWorkflow: false
        },
        performanceSettings: {
          maxMemoryUsage: 512,
          maxCpuUsage: 80,
          timeoutSettings: {
            aiRequest: 30000,
            fileOperation: 5000,
            buildOperation: 120000
          },
          cacheSettings: {
            enableCache: true,
            cacheTtl: 3600000,
            maxCacheSize: 100
          }
        }
      }
    };
  }

  /**
   * Basic service implementations
   */
  private createBasicLogger(): Logger {
    return {
      info: (message: string, meta?: Record<string, any>) => console.info(`[ProjectConfigurationService] ${message}`, meta),
      warn: (message: string, meta?: Record<string, any>) => console.warn(`[ProjectConfigurationService] ${message}`, meta),
      error: (message: string, meta?: Record<string, any>) => console.error(`[ProjectConfigurationService] ${message}`, meta),
      debug: (message: string, meta?: Record<string, any>) => console.debug(`[ProjectConfigurationService] ${message}`, meta)
    } as Logger;
  }

  private createBasicErrorService(): ErrorService {
    return {
      captureError: (error: Error, context?: Record<string, any>) => {
        console.error('[ProjectConfigurationService Error]', error.message, context);
      },
      createErrorResponse: (message: string, code?: string): ApiErrorResponse => 
        createApiError(message, code || 'PROJECT_CONFIGURATION_ERROR'),
      handleConfigurationChange: async (config: any) => {
        // Placeholder implementation
      }
    } as ErrorService;
  }

  /**
   * Add change listener for configuration events
   */
  addChangeListener(listener: (event: ProjectConfigurationChangeEvent) => void): void {
    this.changeListeners.add(listener);
  }

  /**
   * Remove change listener
   */
  removeChangeListener(listener: (event: ProjectConfigurationChangeEvent) => void): void {
    this.changeListeners.delete(listener);
  }

  /**
   * Get configuration backups for a project
   */
  getConfigurationBackups(projectId: UUID): ConfigurationBackup[] {
    return this.backupStorage.get(projectId) || [];
  }

  /**
   * Clear configuration cache
   */
  clearCache(): void {
    this.configCache.clear();
    this.templatesCache.clear();
  }

  /**
   * Get service health status
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    cacheSize: number;
    backupCount: number;
    lastActivity: string;
  }> {
    const totalBackups = Array.from(this.backupStorage.values()).reduce((sum, backups) => sum + backups.length, 0);
    
    return {
      status: 'healthy',
      cacheSize: this.configCache.size,
      backupCount: totalBackups,
      lastActivity: createTimestamp()
    };
  }
}

/**
 * Factory function to create ProjectConfigurationService
 */
export async function createProjectConfigurationService(
  configService: ConfigService,
  options: ProjectConfigurationServiceOptions = {},
  logger?: Logger,
  errorService?: ErrorService
): Promise<ProjectConfigurationService> {
  const service = new ProjectConfigurationService(configService, options, logger, errorService);
  return service;
}

export default ProjectConfigurationService;
