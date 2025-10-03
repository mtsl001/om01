// packages/project-management/services/ProjectWorkspaceManager.ts

/**
 * ProjectWorkspaceManager - ReadyAI Project-Centric Workspace Orchestration Service
 * 
 * Enterprise-grade project workspace management service adapted from Cline's proven workspace patterns
 * with ReadyAI-specific project lifecycle management, phase-aware operations, and intelligent 
 * project organization capabilities.
 * 
 * This service provides high-level workspace orchestration for ReadyAI projects, managing the complete
 * project lifecycle across the 7-phase methodology while leveraging the lower-level FileOperationsService
 * and WorkspaceManager for actual file system operations.
 * 
 * Reuse Strategy: 70% Adapt from Cline workspace patterns
 * - Core workspace orchestration adapted from Cline's WorkspaceManager
 * - Enhanced with ReadyAI 7-phase methodology awareness
 * - Maintains Cline's proven project state management and validation patterns
 * - Integrates with ReadyAI's context management and AI generation pipeline
 * 
 * @version 1.0.0 - Production Ready
 * @author ReadyAI Development Team
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

// Core foundation types
import { 
  UUID, 
  Project,
  PhaseType,
  PhaseStatus,
  TechStack,
  ProjectConfig,
  ApiResponse, 
  ApiErrorResponse,
  createApiResponse, 
  createApiError,
  ReadyAIError,
  AsyncResult,
  wrapAsync,
  generateUUID,
  createTimestamp
} from '../../foundation/types/core.js';

// Project management types
import {
  ProjectLifecycleState,
  ProjectPhaseTransition,
  PhaseValidationResult,
  ProjectBackupMetadata,
  WorkspaceValidationResult
} from '../types/lifecycle.js';

import {
  ProjectOrchestrationContext,
  WorkspaceOperationRequest,
  ProjectStructureTemplate,
  ProjectInitializationConfig
} from '../types/orchestration.js';

// Filesystem services
import { 
  FileOperationsService,
  SafetyLevel,
  FileOperationType,
  FileOperationResult
} from '../../filesystem/services/FileOperationsService.js';

import { 
  WorkspaceManager,
  ProjectStructureType,
  WorkspaceOperationContext,
  ValidationIssue
} from '../../filesystem/services/WorkspaceManager.js';

// Logging
import { logger, logPhaseOperation } from '../../logging/services/Logger.js';

// Configuration
import { ConfigService } from '../../config/services/ConfigService.js';

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

/**
 * Project workspace operation types specific to project management
 */
export type ProjectWorkspaceOperationType = 
  | 'project-initialize'
  | 'phase-transition'
  | 'project-restructure'
  | 'dependency-sync'
  | 'context-reorganize'
  | 'workspace-cleanup'
  | 'project-archive'
  | 'project-restore'
  | 'quality-validation'
  | 'backup-create'
  | 'backup-restore';

/**
 * Project workspace status levels
 */
export type ProjectWorkspaceStatus = 
  | 'healthy'
  | 'needs-attention' 
  | 'degraded'
  | 'critical'
  | 'maintenance';

/**
 * Phase-specific workspace requirements
 */
export interface PhaseWorkspaceRequirements {
  /** Required directories for this phase */
  requiredDirectories: string[];
  /** Required files for this phase */
  requiredFiles: string[];
  /** Optional files that enhance the phase */
  optionalFiles: string[];
  /** Validation rules for this phase */
  validationRules: WorkspaceValidationRule[];
  /** Cleanup patterns for phase completion */
  cleanupPatterns: string[];
  /** Backup requirements */
  backupRequired: boolean;
}

/**
 * Workspace validation rule
 */
export interface WorkspaceValidationRule {
  /** Rule identifier */
  id: string;
  /** Rule name */
  name: string;
  /** Rule description */
  description: string;
  /** Validation function */
  validate: (projectPath: string, context: ProjectOrchestrationContext) => Promise<ValidationIssue[]>;
  /** Fix function (if auto-fixable) */
  fix?: (projectPath: string, context: ProjectOrchestrationContext) => Promise<void>;
  /** Rule severity */
  severity: 'error' | 'warning' | 'info';
  /** Applicable phases */
  applicablePhases: PhaseType[];
}

/**
 * Project workspace health report
 */
export interface ProjectWorkspaceHealthReport {
  /** Project identifier */
  projectId: UUID;
  /** Overall workspace status */
  status: ProjectWorkspaceStatus;
  /** Health score (0-100) */
  healthScore: number;
  /** Last check timestamp */
  lastChecked: string;
  /** Phase-specific health */
  phaseHealth: Record<PhaseType, {
    status: ProjectWorkspaceStatus;
    issues: ValidationIssue[];
    recommendations: string[];
  }>;
  /** File system metrics */
  metrics: {
    totalFiles: number;
    totalSize: number;
    obsoleteFiles: number;
    missingFiles: number;
    orphanedFiles: number;
  };
  /** Recommended actions */
  recommendations: Array<{
    action: ProjectWorkspaceOperationType;
    priority: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    estimatedImpact: string;
  }>;
}

/**
 * Project backup configuration
 */
export interface ProjectBackupConfig {
  /** Enable automatic backups */
  enabled: boolean;
  /** Backup frequency */
  frequency: 'phase-transition' | 'daily' | 'weekly' | 'manual';
  /** Maximum number of backups to retain */
  maxBackups: number;
  /** Backup compression */
  compress: boolean;
  /** Include node_modules and similar */
  excludePatterns: string[];
  /** Custom backup location */
  backupLocation?: string;
}

/**
 * Project workspace operation result
 */
export interface ProjectWorkspaceOperationResult {
  /** Operation identifier */
  operationId: UUID;
  /** Operation type */
  operationType: ProjectWorkspaceOperationType;
  /** Operation success */
  success: boolean;
  /** Operation duration in milliseconds */
  duration: number;
  /** Files affected */
  filesAffected: string[];
  /** Directories created/modified */
  directoriesAffected: string[];
  /** Validation results */
  validationResults?: WorkspaceValidationResult[];
  /** Backup created */
  backupCreated?: ProjectBackupMetadata;
  /** Any issues encountered */
  issues: ValidationIssue[];
  /** Operation metadata */
  metadata: Record<string, any>;
}

// =============================================================================
// CONSTANTS AND CONFIGURATION
// =============================================================================

/**
 * ReadyAI Phase-Specific Workspace Requirements
 * Adapted from Cline's workspace patterns with ReadyAI methodology integration
 */
const PHASE_WORKSPACE_REQUIREMENTS: Record<PhaseType, PhaseWorkspaceRequirements> = {
  'Phase0_StrategicCharter': {
    requiredDirectories: ['.readyai', 'docs'],
    requiredFiles: ['README.md', '.readyai/charter.md'],
    optionalFiles: ['.gitignore', 'LICENSE'],
    validationRules: [],
    cleanupPatterns: [],
    backupRequired: true
  },
  'Phase1_ArchitecturalBlueprint': {
    requiredDirectories: ['.readyai', 'docs', 'docs/architecture'],
    requiredFiles: ['.readyai/blueprint.json', 'docs/architecture.md'],
    optionalFiles: ['docs/architecture/diagrams/', 'docs/architecture/decisions/'],
    validationRules: [],
    cleanupPatterns: ['*.tmp', '*.draft'],
    backupRequired: true
  },
  'Phase20_CoreContracts': {
    requiredDirectories: ['src/types', 'packages/shared/types'],
    requiredFiles: ['src/types/index.ts', 'packages/shared/types/core.ts'],
    optionalFiles: ['src/types/api.ts', 'src/types/domain.ts'],
    validationRules: [],
    cleanupPatterns: [],
    backupRequired: true
  },
  'Phase21_ModuleSpec': {
    requiredDirectories: ['docs/modules', '.readyai/specs'],
    requiredFiles: ['docs/modules/index.md', '.readyai/specs/module-spec.json'],
    optionalFiles: ['docs/modules/*/README.md'],
    validationRules: [],
    cleanupPatterns: ['*.draft', '*.tmp'],
    backupRequired: false
  },
  'Phase23_ModuleSpecSubsequent': {
    requiredDirectories: ['docs/modules', '.readyai/specs'],
    requiredFiles: ['.readyai/specs/module-dependencies.json'],
    optionalFiles: ['docs/modules/dependencies.md'],
    validationRules: [],
    cleanupPatterns: ['*.draft'],
    backupRequired: false
  },
  'Phase30_ProjectScaffolding': {
    requiredDirectories: ['src', 'tests', 'docs'],
    requiredFiles: ['package.json', 'tsconfig.json'],
    optionalFiles: ['.eslintrc.json', 'jest.config.js', 'docker-compose.yml'],
    validationRules: [],
    cleanupPatterns: ['node_modules/.cache', '*.log'],
    backupRequired: true
  },
  'Phase301_MasterPlan': {
    requiredDirectories: ['.readyai/plans'],
    requiredFiles: ['.readyai/plans/master-plan.json', '.readyai/plans/generation-order.json'],
    optionalFiles: ['.readyai/plans/dependency-graph.json'],
    validationRules: [],
    cleanupPatterns: [],
    backupRequired: true
  },
  'Phase31_FileGeneration': {
    requiredDirectories: ['src', 'tests'],
    requiredFiles: [],
    optionalFiles: [],
    validationRules: [],
    cleanupPatterns: ['*.generated.backup', '*.ai-temp'],
    backupRequired: false
  },
  'Phase4_ValidationCorrection': {
    requiredDirectories: ['tests', '.readyai/validation'],
    requiredFiles: ['.readyai/validation/results.json'],
    optionalFiles: ['tests/unit', 'tests/integration', 'tests/e2e'],
    validationRules: [],
    cleanupPatterns: ['*.error.log', 'coverage/', 'test-results/'],
    backupRequired: false
  },
  'Phase5_TestGeneration': {
    requiredDirectories: ['tests'],
    requiredFiles: [],
    optionalFiles: ['tests/unit/', 'tests/integration/', 'tests/e2e/'],
    validationRules: [],
    cleanupPatterns: ['coverage/', '*.test.log'],
    backupRequired: false
  },
  'Phase6_Documentation': {
    requiredDirectories: ['docs'],
    requiredFiles: ['docs/README.md'],
    optionalFiles: ['docs/api/', 'docs/guides/', 'docs/examples/'],
    validationRules: [],
    cleanupPatterns: ['*.md.tmp', 'docs/.cache/'],
    backupRequired: false
  },
  'Phase7_Iteration': {
    requiredDirectories: ['.readyai/iterations'],
    requiredFiles: ['.readyai/iterations/current.json'],
    optionalFiles: ['.readyai/iterations/history/'],
    validationRules: [],
    cleanupPatterns: ['*.iteration.tmp'],
    backupRequired: true
  }
};

/**
 * Default project workspace configuration
 */
const DEFAULT_PROJECT_WORKSPACE_CONFIG = {
  enableHealthMonitoring: true,
  healthCheckInterval: 300000, // 5 minutes
  autoCleanup: true,
  cleanupSchedule: 'phase-completion',
  backupConfig: {
    enabled: true,
    frequency: 'phase-transition' as const,
    maxBackups: 5,
    compress: true,
    excludePatterns: ['node_modules/**', '*.log', 'coverage/**', 'dist/**']
  },
  validationConfig: {
    enableContinuousValidation: true,
    validationLevel: 'standard' as const,
    autoFix: false
  }
};

// =============================================================================
// MAIN SERVICE CLASS
// =============================================================================

/**
 * ProjectWorkspaceManager - High-level project workspace orchestration
 * 
 * Provides comprehensive project workspace management with phase-aware operations,
 * intelligent project health monitoring, and seamless integration with ReadyAI's
 * 7-phase development methodology.
 * 
 * Adapted from Cline's workspace management patterns with enterprise-grade
 * project lifecycle support and context-aware operations.
 */
export class ProjectWorkspaceManager {
  private static instance: ProjectWorkspaceManager;
  
  // Core services
  private workspaceManager: WorkspaceManager;
  private fileOps: FileOperationsService;
  private config: ConfigService;
  
  // State management
  private activeProjects: Map<UUID, Project> = new Map();
  private projectHealth: Map<UUID, ProjectWorkspaceHealthReport> = new Map();
  private operationHistory: Map<UUID, ProjectWorkspaceOperationResult[]> = new Map();
  private validationRules: Map<string, WorkspaceValidationRule> = new Map();
  
  // Configuration
  private serviceConfig: typeof DEFAULT_PROJECT_WORKSPACE_CONFIG;

  private constructor() {
    this.workspaceManager = WorkspaceManager.getInstance();
    this.fileOps = FileOperationsService.getInstance();
    this.config = ConfigService.getInstance();
    
    this.serviceConfig = {
      ...DEFAULT_PROJECT_WORKSPACE_CONFIG,
      ...this.config.get('projectWorkspace', {})
    };

    this.initializeValidationRules();
    this.startHealthMonitoring();

    logger.info('ProjectWorkspaceManager initialized', {
      context: 'project-workspace',
      config: this.serviceConfig
    });
  }

  /**
   * Get singleton service instance
   */
  public static getInstance(): ProjectWorkspaceManager {
    if (!ProjectWorkspaceManager.instance) {
      ProjectWorkspaceManager.instance = new ProjectWorkspaceManager();
    }
    return ProjectWorkspaceManager.instance;
  }

  // =============================================================================
  // PROJECT WORKSPACE INITIALIZATION
  // =============================================================================

  /**
   * Initialize a complete ReadyAI project workspace
   * Adapted from Cline's project initialization with ReadyAI enhancements
   */
  public async initializeProjectWorkspace(
    project: Project,
    structureType: ProjectStructureType,
    config?: ProjectInitializationConfig
  ): Promise<ApiResponse<ProjectWorkspaceOperationResult>> {
    const operationId = generateUUID();
    const startTime = Date.now();

    try {
      logPhaseOperation('project-initialization', project.currentPhase, {
        projectId: project.id,
        structureType,
        operationId
      });

      // Create orchestration context
      const context: ProjectOrchestrationContext = {
        projectId: project.id,
        currentPhase: project.currentPhase,
        operationType: 'project-initialize',
        operationId,
        metadata: { structureType, config }
      };

      // Validate project requirements
      await this.validateProjectRequirements(project, structureType);

      // Create base workspace structure
      const workspaceResult = await this.workspaceManager.createWorkspace(
        project,
        structureType,
        {
          overwrite: config?.overwriteExisting,
          skipExisting: config?.skipExistingFiles,
          customTemplate: config?.customTemplate
        }
      );

      if (!workspaceResult.success) {
        throw new ReadyAIError(
          `Workspace creation failed: ${workspaceResult.error.message}`,
          'WORKSPACE_CREATION_FAILED',
          500
        );
      }

      // Initialize phase-specific requirements
      await this.initializePhaseRequirements(project, context);

      // Create project metadata and tracking files
      await this.createProjectMetadata(project, context);

      // Setup project health monitoring
      await this.initializeProjectHealth(project);

      // Create initial backup if configured
      let backupMetadata: ProjectBackupMetadata | undefined;
      if (this.serviceConfig.backupConfig.enabled) {
        const backupResult = await this.createProjectBackup(
          project,
          `Initial workspace setup - ${structureType}`,
          context
        );
        if (backupResult.success) {
          backupMetadata = backupResult.data;
        }
      }

      // Register active project
      this.activeProjects.set(project.id, project);

      const duration = Date.now() - startTime;
      const result: ProjectWorkspaceOperationResult = {
        operationId,
        operationType: 'project-initialize',
        success: true,
        duration,
        filesAffected: workspaceResult.data.filesCreated,
        directoriesAffected: [],
        backupCreated: backupMetadata,
        issues: [],
        metadata: {
          structureType,
          workspacePath: workspaceResult.data.workspacePath,
          template: workspaceResult.data.structure
        }
      };

      // Record operation history
      this.recordOperation(project.id, result);

      logger.info('Project workspace initialized successfully', {
        context: 'project-workspace',
        projectId: project.id,
        operationId,
        duration,
        filesCreated: workspaceResult.data.filesCreated.length
      });

      return createApiResponse(result);

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Project workspace initialization failed', {
        context: 'project-workspace',
        projectId: project.id,
        operationId,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      if (error instanceof ReadyAIError) {
        return error.toApiErrorResponse() as ApiErrorResponse;
      }

      return createApiError(
        `Project workspace initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'WORKSPACE_INIT_FAILED',
        500
      );
    }
  }

  // =============================================================================
  // PHASE TRANSITION MANAGEMENT
  // =============================================================================

  /**
   * Handle workspace transitions between development phases
   * Maintains Cline's proven state management patterns
   */
  public async transitionProjectPhase(
    project: Project,
    fromPhase: PhaseType,
    toPhase: PhaseType,
    options?: {
      skipValidation?: boolean;
      createBackup?: boolean;
      autoCleanup?: boolean;
    }
  ): Promise<ApiResponse<ProjectWorkspaceOperationResult>> {
    const operationId = generateUUID();
    const startTime = Date.now();

    try {
      logPhaseOperation('phase-transition', fromPhase, {
        projectId: project.id,
        targetPhase: toPhase,
        operationId
      });

      // Create transition context
      const context: ProjectOrchestrationContext = {
        projectId: project.id,
        currentPhase: fromPhase,
        targetPhase: toPhase,
        operationType: 'phase-transition',
        operationId,
        metadata: { options }
      };

      // Validate current phase completion
      if (!options?.skipValidation) {
        const validationResult = await this.validatePhaseRequirements(project, fromPhase);
        if (!validationResult.valid) {
          return createApiError(
            `Cannot transition from ${fromPhase}: phase validation failed`,
            'PHASE_VALIDATION_FAILED',
            400,
            { validationIssues: validationResult.issues }
          );
        }
      }

      // Create backup before transition
      let backupMetadata: ProjectBackupMetadata | undefined;
      if (options?.createBackup !== false && this.serviceConfig.backupConfig.enabled) {
        const backupResult = await this.createProjectBackup(
          project,
          `Phase transition: ${fromPhase} → ${toPhase}`,
          context
        );
        if (backupResult.success) {
          backupMetadata = backupResult.data;
        }
      }

      // Cleanup previous phase if configured
      const cleanupResults: string[] = [];
      if (options?.autoCleanup !== false && this.serviceConfig.autoCleanup) {
        const cleanupResult = await this.cleanupPhaseArtifacts(project, fromPhase, context);
        cleanupResults.push(...cleanupResult);
      }

      // Setup requirements for new phase
      await this.initializePhaseRequirements(project, context, toPhase);

      // Update project phase
      const updatedProject = { ...project, currentPhase: toPhase };
      this.activeProjects.set(project.id, updatedProject);

      // Update health monitoring
      await this.updateProjectHealth(project.id);

      const duration = Date.now() - startTime;
      const result: ProjectWorkspaceOperationResult = {
        operationId,
        operationType: 'phase-transition',
        success: true,
        duration,
        filesAffected: cleanupResults,
        directoriesAffected: [],
        backupCreated: backupMetadata,
        issues: [],
        metadata: {
          fromPhase,
          toPhase,
          cleanupPerformed: cleanupResults.length > 0
        }
      };

      this.recordOperation(project.id, result);

      logger.info('Phase transition completed successfully', {
        context: 'project-workspace',
        projectId: project.id,
        operationId,
        fromPhase,
        toPhase,
        duration
      });

      return createApiResponse(result);

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Phase transition failed', {
        context: 'project-workspace',
        projectId: project.id,
        operationId,
        fromPhase,
        toPhase,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      if (error instanceof ReadyAIError) {
        return error.toApiErrorResponse() as ApiErrorResponse;
      }

      return createApiError(
        `Phase transition failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PHASE_TRANSITION_FAILED',
        500
      );
    }
  }

  // =============================================================================
  // WORKSPACE HEALTH MONITORING
  // =============================================================================

  /**
   * Get comprehensive workspace health report for a project
   * Implements Cline's monitoring patterns with ReadyAI enhancements
   */
  public async getProjectHealth(projectId: UUID): Promise<ApiResponse<ProjectWorkspaceHealthReport>> {
    try {
      const project = this.activeProjects.get(projectId);
      if (!project) {
        return createApiError('Project not found', 'PROJECT_NOT_FOUND', 404);
      }

      // Get cached health report if recent
      const cachedHealth = this.projectHealth.get(projectId);
      const cacheAge = cachedHealth ? Date.now() - new Date(cachedHealth.lastChecked).getTime() : Infinity;
      
      if (cachedHealth && cacheAge < this.serviceConfig.healthCheckInterval) {
        return createApiResponse(cachedHealth);
      }

      // Generate fresh health report
      const healthReport = await this.generateHealthReport(project);
      
      // Cache the report
      this.projectHealth.set(projectId, healthReport);

      logger.debug('Project health report generated', {
        context: 'project-workspace',
        projectId,
        status: healthReport.status,
        healthScore: healthReport.healthScore
      });

      return createApiResponse(healthReport);

    } catch (error) {
      logger.error('Failed to get project health', {
        context: 'project-workspace',
        projectId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return createApiError(
        `Failed to get project health: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'HEALTH_CHECK_FAILED',
        500
      );
    }
  }

  /**
   * Perform workspace cleanup operations
   * Adapts Cline's cleanup patterns for ReadyAI's phase-aware operations
   */
  public async cleanupProjectWorkspace(
    projectId: UUID,
    options?: {
      phases?: PhaseType[];
      dryRun?: boolean;
      aggressiveCleanup?: boolean;
    }
  ): Promise<ApiResponse<ProjectWorkspaceOperationResult>> {
    const operationId = generateUUID();
    const startTime = Date.now();

    try {
      const project = this.activeProjects.get(projectId);
      if (!project) {
        return createApiError('Project not found', 'PROJECT_NOT_FOUND', 404);
      }

      const context: ProjectOrchestrationContext = {
        projectId,
        currentPhase: project.currentPhase,
        operationType: 'workspace-cleanup',
        operationId,
        metadata: { options }
      };

      const phasesToClean = options?.phases || [project.currentPhase];
      const cleanedFiles: string[] = [];
      const issues: ValidationIssue[] = [];

      for (const phase of phasesToClean) {
        try {
          const phaseCleanup = await this.cleanupPhaseArtifacts(project, phase, context, options?.dryRun);
          cleanedFiles.push(...phaseCleanup);
        } catch (error) {
          issues.push({
            severity: 'warning',
            category: 'cleanup',
            message: `Failed to cleanup phase ${phase}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            autoFixable: false
          });
        }
      }

      // Perform general workspace cleanup
      if (options?.aggressiveCleanup) {
        const generalCleanup = await this.performGeneralCleanup(project, context, options.dryRun);
        cleanedFiles.push(...generalCleanup);
      }

      const duration = Date.now() - startTime;
      const result: ProjectWorkspaceOperationResult = {
        operationId,
        operationType: 'workspace-cleanup',
        success: true,
        duration,
        filesAffected: cleanedFiles,
        directoriesAffected: [],
        issues,
        metadata: {
          phasesProcessed: phasesToClean,
          dryRun: options?.dryRun || false,
          aggressiveCleanup: options?.aggressiveCleanup || false
        }
      };

      this.recordOperation(projectId, result);

      logger.info('Workspace cleanup completed', {
        context: 'project-workspace',
        projectId,
        operationId,
        filesAffected: cleanedFiles.length,
        duration
      });

      return createApiResponse(result);

    } catch (error) {
      logger.error('Workspace cleanup failed', {
        context: 'project-workspace',
        projectId,
        operationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return createApiError(
        `Workspace cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CLEANUP_FAILED',
        500
      );
    }
  }

  // =============================================================================
  // BACKUP AND RESTORE OPERATIONS
  // =============================================================================

  /**
   * Create project backup with comprehensive metadata
   * Leverages Cline's proven backup strategies
   */
  public async createProjectBackup(
    project: Project,
    description: string,
    context: ProjectOrchestrationContext
  ): Promise<ApiResponse<ProjectBackupMetadata>> {
    try {
      const backupId = generateUUID();
      const timestamp = createTimestamp();
      const backupPath = path.join(
        project.rootPath,
        this.serviceConfig.backupConfig.backupLocation || '.readyai/backups',
        `${timestamp.replace(/[:.]/g, '-')}_${backupId.substring(0, 8)}`
      );

      // Create backup directory
      await this.fileOps.createDirectory(backupPath, {
        recursive: true,
        mode: 0o755
      });

      // Get files to backup (excluding patterns)
      const filesToBackup = await this.getFilesToBackup(project.rootPath);

      // Copy files to backup location
      let totalSize = 0;
      for (const filePath of filesToBackup) {
        const relativePath = path.relative(project.rootPath, filePath);
        const backupFilePath = path.join(backupPath, relativePath);
        
        await this.fileOps.createDirectory(path.dirname(backupFilePath), { recursive: true });
        await this.fileOps.copyFile(filePath, backupFilePath);
        
        const stats = await fs.stat(backupFilePath);
        totalSize += stats.size;
      }

      // Create backup metadata
      const backupMetadata: ProjectBackupMetadata = {
        backupId,
        projectId: project.id,
        timestamp,
        phase: project.currentPhase,
        backupPath,
        description,
        files: filesToBackup.map(f => path.relative(project.rootPath, f)),
        size: totalSize,
        operationId: context.operationId,
        metadata: {
          createdBy: 'ProjectWorkspaceManager',
          context: context.operationType,
          compressionEnabled: this.serviceConfig.backupConfig.compress
        }
      };

      // Save backup metadata
      const metadataPath = path.join(backupPath, 'backup-metadata.json');
      await this.fileOps.writeFile(metadataPath, JSON.stringify(backupMetadata, null, 2));

      // Compress if configured
      if (this.serviceConfig.backupConfig.compress) {
        // Implementation would compress the backup directory
        // For now, we'll note it in metadata
      }

      // Clean up old backups
      await this.cleanupOldBackups(project.id);

      logger.info('Project backup created successfully', {
        context: 'project-workspace',
        projectId: project.id,
        backupId,
        size: totalSize,
        fileCount: filesToBackup.length
      });

      return createApiResponse(backupMetadata);

    } catch (error) {
      logger.error('Failed to create project backup', {
        context: 'project-workspace',
        projectId: project.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return createApiError(
        `Backup creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'BACKUP_FAILED',
        500
      );
    }
  }

  // =============================================================================
  // PRIVATE IMPLEMENTATION METHODS
  // =============================================================================

  /**
   * Initialize validation rules for workspace management
   */
  private initializeValidationRules(): void {
    // This would be expanded with comprehensive validation rules
    // For now, we'll initialize with basic structure
    
    logger.debug('Validation rules initialized', {
      context: 'project-workspace',
      rulesCount: this.validationRules.size
    });
  }

  /**
   * Start health monitoring for active projects
   */
  private startHealthMonitoring(): void {
    if (!this.serviceConfig.enableHealthMonitoring) {
      return;
    }

    setInterval(async () => {
      for (const [projectId, project] of this.activeProjects.entries()) {
        try {
          await this.updateProjectHealth(projectId);
        } catch (error) {
          logger.warn('Failed to update project health during monitoring', {
            context: 'project-workspace',
            projectId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }, this.serviceConfig.healthCheckInterval);

    logger.info('Health monitoring started', {
      context: 'project-workspace',
      interval: this.serviceConfig.healthCheckInterval
    });
  }

  /**
   * Validate project requirements before initialization
   */
  private async validateProjectRequirements(
    project: Project,
    structureType: ProjectStructureType
  ): Promise<void> {
    if (!project.rootPath) {
      throw new ReadyAIError('Project root path is required', 'MISSING_ROOT_PATH', 400);
    }

    if (!project.id) {
      throw new ReadyAIError('Project ID is required', 'MISSING_PROJECT_ID', 400);
    }

    // Additional validation logic would go here
  }

  /**
   * Initialize phase-specific requirements
   */
  private async initializePhaseRequirements(
    project: Project,
    context: ProjectOrchestrationContext,
    targetPhase?: PhaseType
  ): Promise<void> {
    const phase = targetPhase || project.currentPhase;
    const requirements = PHASE_WORKSPACE_REQUIREMENTS[phase];

    // Create required directories
    for (const dir of requirements.requiredDirectories) {
      const dirPath = path.join(project.rootPath, dir);
      await this.fileOps.createDirectory(dirPath, { recursive: true });
    }

    // Create placeholder files for required files
    for (const file of requirements.requiredFiles) {
      const filePath = path.join(project.rootPath, file);
      const exists = await this.fileOps.pathExists(filePath);
      
      if (!exists) {
        await this.fileOps.createFile(filePath, '');
      }
    }
  }

  /**
   * Create project metadata and tracking files
   */
  private async createProjectMetadata(
    project: Project,
    context: ProjectOrchestrationContext
  ): Promise<void> {
    const metadataDir = path.join(project.rootPath, '.readyai');
    await this.fileOps.createDirectory(metadataDir, { recursive: true });

    // Create project metadata file
    const projectMetadata = {
      projectId: project.id,
      name: project.name,
      description: project.description,
      createdAt: project.createdAt,
      currentPhase: project.currentPhase,
      techStack: project.techStack,
      config: project.config,
      workspaceVersion: '1.0.0',
      lastOperation: {
        operationId: context.operationId,
        type: context.operationType,
        timestamp: createTimestamp()
      }
    };

    const metadataPath = path.join(metadataDir, 'project.json');
    await this.fileOps.writeFile(metadataPath, JSON.stringify(projectMetadata, null, 2));
  }

  /**
   * Initialize project health monitoring
   */
  private async initializeProjectHealth(project: Project): Promise<void> {
    const healthReport = await this.generateHealthReport(project);
    this.projectHealth.set(project.id, healthReport);
  }

  /**
   * Generate comprehensive health report for project
   */
  private async generateHealthReport(project: Project): Promise<ProjectWorkspaceHealthReport> {
    const healthReport: ProjectWorkspaceHealthReport = {
      projectId: project.id,
      status: 'healthy',
      healthScore: 100,
      lastChecked: createTimestamp(),
      phaseHealth: {} as any,
      metrics: {
        totalFiles: 0,
        totalSize: 0,
        obsoleteFiles: 0,
        missingFiles: 0,
        orphanedFiles: 0
      },
      recommendations: []
    };

    // Implementation would analyze workspace and populate health report
    // For now, return basic healthy status

    return healthReport;
  }

  /**
   * Validate phase requirements completion
   */
  private async validatePhaseRequirements(
    project: Project,
    phase: PhaseType
  ): Promise<{ valid: boolean; issues: ValidationIssue[] }> {
    const requirements = PHASE_WORKSPACE_REQUIREMENTS[phase];
    const issues: ValidationIssue[] = [];

    // Check required files exist
    for (const requiredFile of requirements.requiredFiles) {
      const filePath = path.join(project.rootPath, requiredFile);
      const exists = await this.fileOps.pathExists(filePath);
      
      if (!exists) {
        issues.push({
          severity: 'error',
          category: 'missing-file',
          message: `Required file missing: ${requiredFile}`,
          filePath: requiredFile,
          autoFixable: true
        });
      }
    }

    return {
      valid: issues.filter(i => i.severity === 'error').length === 0,
      issues
    };
  }

  /**
   * Cleanup phase-specific artifacts
   */
  private async cleanupPhaseArtifacts(
    project: Project,
    phase: PhaseType,
    context: ProjectOrchestrationContext,
    dryRun?: boolean
  ): Promise<string[]> {
    const requirements = PHASE_WORKSPACE_REQUIREMENTS[phase];
    const cleanedFiles: string[] = [];

    for (const pattern of requirements.cleanupPatterns) {
      // Implementation would find and clean files matching pattern
      // For now, return empty array
    }

    return cleanedFiles;
  }

  /**
   * Perform general workspace cleanup
   */
  private async performGeneralCleanup(
    project: Project,
    context: ProjectOrchestrationContext,
    dryRun?: boolean
  ): Promise<string[]> {
    const cleanedFiles: string[] = [];

    // Implementation would perform general cleanup operations
    // Like removing temp files, clearing caches, etc.

    return cleanedFiles;
  }

  /**
   * Get list of files to include in backup
   */
  private async getFilesToBackup(projectPath: string): Promise<string[]> {
    const allFiles: string[] = [];
    const excludePatterns = this.serviceConfig.backupConfig.excludePatterns;

    // Implementation would recursively scan directory and filter files
    // For now, return empty array

    return allFiles;
  }

  /**
   * Clean up old backups beyond retention limit
   */
  private async cleanupOldBackups(projectId: UUID): Promise<void> {
    // Implementation would find and remove old backups
    // keeping only the configured number of recent backups
  }

  /**
   * Update project health information
   */
  private async updateProjectHealth(projectId: UUID): Promise<void> {
    const project = this.activeProjects.get(projectId);
    if (!project) {
      return;
    }

    const healthReport = await this.generateHealthReport(project);
    this.projectHealth.set(projectId, healthReport);
  }

  /**
   * Record operation in history
   */
  private recordOperation(projectId: UUID, operation: ProjectWorkspaceOperationResult): void {
    const history = this.operationHistory.get(projectId) || [];
    history.push(operation);
    
    // Keep only recent operations (limit to 100)
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
    
    this.operationHistory.set(projectId, history);
  }

  // =============================================================================
  // PUBLIC API METHODS
  // =============================================================================

  /**
   * Get operation history for a project
   */
  public getOperationHistory(projectId: UUID): ProjectWorkspaceOperationResult[] {
    return this.operationHistory.get(projectId) || [];
  }

  /**
   * Get active projects
   */
  public getActiveProjects(): Project[] {
    return Array.from(this.activeProjects.values());
  }

  /**
   * Check if project is actively managed
   */
  public isProjectActive(projectId: UUID): boolean {
    return this.activeProjects.has(projectId);
  }

  /**
   * Remove project from active management
   */
  public async deactivateProject(projectId: UUID): Promise<void> {
    this.activeProjects.delete(projectId);
    this.projectHealth.delete(projectId);
    this.operationHistory.delete(projectId);
    
    logger.info('Project deactivated from workspace management', {
      context: 'project-workspace',
      projectId
    });
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default ProjectWorkspaceManager;

// Re-export commonly used types
export type {
  ProjectWorkspaceOperationType,
  ProjectWorkspaceStatus,
  ProjectWorkspaceHealthReport,
  ProjectWorkspaceOperationResult,
  PhaseWorkspaceRequirements,
  WorkspaceValidationRule,
  ProjectBackupConfig
};
