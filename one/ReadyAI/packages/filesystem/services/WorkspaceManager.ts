// packages/filesystem/services/WorkspaceManager.ts

/**
 * WorkspaceManager - ReadyAI Workspace Structure Management Service
 * 
 * Comprehensive workspace management service adapted from Cline's proven workspace patterns 
 * with ReadyAI-specific project structure management, phase-aware operations, and intelligent
 * project organization capabilities.
 * 
 * This service manages ReadyAI project workspaces including structure creation, validation,
 * phase management, and maintains consistency across the 7-phase development methodology.
 * 
 * Reuse Strategy: 75% Adapt from Cline workspace patterns
 * - Core workspace management adapted from Cline's workspace coordination
 * - Enhanced with ReadyAI 7-phase methodology awareness
 * - Maintains Cline's proven project structure and state management patterns
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

// Core dependencies
import { 
  FileOperationsService, 
  FileOperationType, 
  SafetyLevel, 
  FileOperationContext,
  FileOperationResult,
  createDirectory as createDir,
  writeFile as writeFileOp,
  readFile as readFileOp
} from './FileOperationsService.js';

// Foundation types
import { 
  UUID, 
  ReadyAIError, 
  ApiResponse, 
  createApiResponse, 
  createApiError,
  PhaseType,
  PhaseStatus,
  Project,
  TechStack,
  ProjectConfig
} from '../../../foundation/types/core.js';

// Logging
import { Logger, logger, logPhaseOperation } from '../../../logging/services/Logger.js';

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

/**
 * ReadyAI project structure types
 */
export type ProjectStructureType = 
  | 'fullstack-web'
  | 'backend-api'
  | 'frontend-spa'
  | 'mobile-app'
  | 'desktop-app'
  | 'library'
  | 'cli-tool'
  | 'microservice'
  | 'custom';

/**
 * Workspace validation severity levels
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * Workspace operation types
 */
export type WorkspaceOperationType = 
  | 'create'
  | 'initialize'
  | 'validate'
  | 'restructure'
  | 'cleanup'
  | 'backup'
  | 'restore'
  | 'phase-transition';

/**
 * Project structure template configuration
 */
export interface ProjectStructureTemplate {
  /** Template identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Template description */
  description: string;
  /** Supported tech stacks */
  supportedTechStacks: TechStack[];
  /** Required directory structure */
  directories: string[];
  /** Template files to create */
  templateFiles: TemplateFile[];
  /** Configuration files to generate */
  configFiles: ConfigFile[];
  /** Phase-specific requirements */
  phaseRequirements: Record<PhaseType, string[]>;
}

/**
 * Template file definition
 */
export interface TemplateFile {
  /** Relative file path */
  path: string;
  /** File content or template */
  content: string;
  /** Whether to overwrite if exists */
  overwrite: boolean;
  /** Required phases for this file */
  requiredForPhases: PhaseType[];
  /** File encoding */
  encoding?: 'utf8' | 'binary' | 'base64';
}

/**
 * Configuration file definition
 */
export interface ConfigFile {
  /** Configuration file path */
  path: string;
  /** Configuration object */
  config: Record<string, any>;
  /** Whether to merge with existing */
  merge: boolean;
  /** Configuration format */
  format: 'json' | 'yaml' | 'toml' | 'env';
}

/**
 * Workspace validation issue
 */
export interface ValidationIssue {
  /** Issue severity */
  severity: ValidationSeverity;
  /** Issue category */
  category: string;
  /** Issue message */
  message: string;
  /** File path if applicable */
  filePath?: string;
  /** Line number if applicable */
  lineNumber?: number;
  /** Suggested fix */
  suggestedFix?: string;
  /** Auto-fixable flag */
  autoFixable: boolean;
}

/**
 * Workspace validation result
 */
export interface WorkspaceValidationResult {
  /** Overall validation success */
  valid: boolean;
  /** Validation score (0-100) */
  score: number;
  /** All validation issues */
  issues: ValidationIssue[];
  /** Missing required files */
  missingFiles: string[];
  /** Invalid file contents */
  invalidFiles: string[];
  /** Suggestions for improvement */
  suggestions: string[];
  /** Validation timestamp */
  timestamp: string;
}

/**
 * Workspace operation context
 */
export interface WorkspaceOperationContext {
  /** Operation identifier */
  operationId: UUID;
  /** Project being operated on */
  projectId: UUID;
  /** Current phase */
  currentPhase: PhaseType;
  /** Target phase if transitioning */
  targetPhase?: PhaseType;
  /** Operation type */
  operationType: WorkspaceOperationType;
  /** Safety level for operations */
  safetyLevel: SafetyLevel;
  /** Whether to create backups */
  createBackup: boolean;
  /** User or system initiating operation */
  initiatedBy: string;
  /** Additional context data */
  metadata: Record<string, any>;
}

/**
 * Phase transition requirements
 */
export interface PhaseTransitionRequirements {
  /** Source phase */
  fromPhase: PhaseType;
  /** Target phase */
  toPhase: PhaseType;
  /** Required files for transition */
  requiredFiles: string[];
  /** Required validations */
  requiredValidations: string[];
  /** Pre-transition checks */
  preChecks: (() => Promise<boolean>)[];
  /** Post-transition setup */
  postSetup: (() => Promise<void>)[];
}

/**
 * Workspace backup metadata
 */
export interface WorkspaceBackup {
  /** Backup identifier */
  backupId: UUID;
  /** Project identifier */
  projectId: UUID;
  /** Backup timestamp */
  timestamp: string;
  /** Phase at backup time */
  phase: PhaseType;
  /** Backup location */
  backupPath: string;
  /** Files included in backup */
  files: string[];
  /** Backup size in bytes */
  size: number;
  /** Backup description */
  description: string;
}

// =============================================================================
// CONSTANTS AND DEFAULTS
// =============================================================================

/**
 * ReadyAI project structure templates
 * Adapted from Cline's workspace patterns with ReadyAI-specific enhancements
 */
const PROJECT_TEMPLATES: Record<ProjectStructureType, ProjectStructureTemplate> = {
  'fullstack-web': {
    id: 'fullstack-web',
    name: 'Full-Stack Web Application',
    description: 'Complete web application with frontend, backend, and database',
    supportedTechStacks: [
      {
        frontend: 'React',
        backend: 'Node.js',
        database: 'PostgreSQL',
        languages: ['TypeScript', 'JavaScript'],
        tools: ['Vite', 'Express', 'Prisma']
      }
    ],
    directories: [
      'apps/web',
      'apps/api', 
      'packages/shared',
      'packages/ui',
      'packages/database',
      'docs',
      'tests/e2e',
      'tests/integration',
      '.readyai'
    ],
    templateFiles: [
      {
        path: 'apps/web/src/App.tsx',
        content: `// ReadyAI Generated App Component\nexport default function App() {\n  return <div>Welcome to ReadyAI</div>;\n}`,
        overwrite: false,
        requiredForPhases: ['Phase30_ProjectScaffolding']
      }
    ],
    configFiles: [
      {
        path: 'package.json',
        config: {
          name: '{{projectName}}',
          version: '0.1.0',
          scripts: {
            dev: 'concurrently "npm run dev:api" "npm run dev:web"',
            build: 'npm run build:api && npm run build:web'
          },
          workspaces: ['apps/*', 'packages/*']
        },
        merge: true,
        format: 'json'
      }
    ],
    phaseRequirements: {
      'Phase0_StrategicCharter': ['README.md', '.readyai/charter.md'],
      'Phase1_ArchitecturalBlueprint': ['docs/architecture.md', '.readyai/blueprint.json'],
      'Phase20_CoreContracts': ['packages/shared/types/index.ts'],
      'Phase21_ModuleSpec': ['docs/modules/index.md'],
      'Phase23_ModuleSpecSubsequent': ['docs/modules/'],
      'Phase30_ProjectScaffolding': ['package.json', 'apps/', 'packages/'],
      'Phase301_MasterPlan': ['.readyai/master-plan.json'],
      'Phase31_FileGeneration': ['apps/web/src/', 'apps/api/src/'],
      'Phase4_ValidationCorrection': ['tests/'],
      'Phase5_TestGeneration': ['tests/unit/', 'tests/integration/'],
      'Phase6_Documentation': ['docs/', 'README.md'],
      'Phase7_Iteration': ['.readyai/iterations/']
    }
  },

  'backend-api': {
    id: 'backend-api',
    name: 'Backend API Service',
    description: 'RESTful API service with database integration',
    supportedTechStacks: [
      {
        backend: 'FastAPI',
        database: 'PostgreSQL',
        languages: ['Python'],
        tools: ['SQLAlchemy', 'Alembic', 'Pydantic']
      }
    ],
    directories: [
      'src/api',
      'src/models',
      'src/services',
      'src/utils',
      'tests/unit',
      'tests/integration',
      'migrations',
      'docs',
      '.readyai'
    ],
    templateFiles: [
      {
        path: 'src/main.py',
        content: `# ReadyAI Generated API Entry Point\nfrom fastapi import FastAPI\n\napp = FastAPI(title="{{projectName}}")\n\n@app.get("/")\ndef root():\n    return {"message": "ReadyAI API"}`,
        overwrite: false,
        requiredForPhases: ['Phase30_ProjectScaffolding']
      }
    ],
    configFiles: [
      {
        path: 'pyproject.toml',
        config: {
          'tool.poetry': {
            name: '{{projectName}}',
            version: '0.1.0',
            dependencies: {
              python: '^3.11',
              fastapi: '^0.104.0',
              uvicorn: '^0.24.0'
            }
          }
        },
        merge: true,
        format: 'toml'
      }
    ],
    phaseRequirements: {
      'Phase0_StrategicCharter': ['README.md'],
      'Phase1_ArchitecturalBlueprint': ['docs/api-design.md'],
      'Phase20_CoreContracts': ['src/models/__init__.py'],
      'Phase21_ModuleSpec': ['docs/modules.md'],
      'Phase23_ModuleSpecSubsequent': ['docs/'],
      'Phase30_ProjectScaffolding': ['src/', 'pyproject.toml'],
      'Phase301_MasterPlan': ['.readyai/plan.json'],
      'Phase31_FileGeneration': ['src/api/', 'src/models/'],
      'Phase4_ValidationCorrection': ['tests/'],
      'Phase5_TestGeneration': ['tests/unit/', 'tests/integration/'],
      'Phase6_Documentation': ['docs/', 'README.md'],
      'Phase7_Iteration': ['.readyai/iterations/']
    }
  },

  // Additional templates would be defined similarly...
  'frontend-spa': {
    id: 'frontend-spa',
    name: 'Frontend Single Page Application',
    description: 'Modern React-based single page application',
    supportedTechStacks: [{
      frontend: 'React',
      languages: ['TypeScript'],
      tools: ['Vite', 'Tailwind CSS']
    }],
    directories: ['src', 'public', 'tests', 'docs', '.readyai'],
    templateFiles: [],
    configFiles: [],
    phaseRequirements: {
      'Phase0_StrategicCharter': ['README.md'],
      'Phase1_ArchitecturalBlueprint': ['docs/architecture.md'],
      'Phase20_CoreContracts': ['src/types/index.ts'],
      'Phase21_ModuleSpec': ['docs/components.md'],
      'Phase23_ModuleSpecSubsequent': ['docs/'],
      'Phase30_ProjectScaffolding': ['src/', 'package.json'],
      'Phase301_MasterPlan': ['.readyai/plan.json'],
      'Phase31_FileGeneration': ['src/components/', 'src/pages/'],
      'Phase4_ValidationCorrection': ['tests/'],
      'Phase5_TestGeneration': ['tests/'],
      'Phase6_Documentation': ['docs/'],
      'Phase7_Iteration': ['.readyai/iterations/']
    }
  },

  'mobile-app': {
    id: 'mobile-app',
    name: 'Mobile Application',
    description: 'Cross-platform mobile application',
    supportedTechStacks: [{
      frontend: 'React Native',
      languages: ['TypeScript'],
      tools: ['Expo', 'React Navigation']
    }],
    directories: ['src', 'assets', 'tests', 'docs', '.readyai'],
    templateFiles: [],
    configFiles: [],
    phaseRequirements: {
      'Phase0_StrategicCharter': ['README.md'],
      'Phase1_ArchitecturalBlueprint': ['docs/architecture.md'],
      'Phase20_CoreContracts': ['src/types/index.ts'],
      'Phase21_ModuleSpec': ['docs/screens.md'],
      'Phase23_ModuleSpecSubsequent': ['docs/'],
      'Phase30_ProjectScaffolding': ['src/', 'package.json'],
      'Phase301_MasterPlan': ['.readyai/plan.json'],
      'Phase31_FileGeneration': ['src/screens/', 'src/components/'],
      'Phase4_ValidationCorrection': ['tests/'],
      'Phase5_TestGeneration': ['tests/'],
      'Phase6_Documentation': ['docs/'],
      'Phase7_Iteration': ['.readyai/iterations/']
    }
  },

  'desktop-app': {
    id: 'desktop-app',
    name: 'Desktop Application',
    description: 'Cross-platform desktop application',
    supportedTechStacks: [{
      frontend: 'Electron',
      languages: ['TypeScript'],
      tools: ['React', 'Electron Builder']
    }],
    directories: ['src', 'assets', 'tests', 'docs', '.readyai'],
    templateFiles: [],
    configFiles: [],
    phaseRequirements: {
      'Phase0_StrategicCharter': ['README.md'],
      'Phase1_ArchitecturalBlueprint': ['docs/architecture.md'],
      'Phase20_CoreContracts': ['src/types/index.ts'],
      'Phase21_ModuleSpec': ['docs/windows.md'],
      'Phase23_ModuleSpecSubsequent': ['docs/'],
      'Phase30_ProjectScaffolding': ['src/', 'package.json'],
      'Phase301_MasterPlan': ['.readyai/plan.json'],
      'Phase31_FileGeneration': ['src/main/', 'src/renderer/'],
      'Phase4_ValidationCorrection': ['tests/'],
      'Phase5_TestGeneration': ['tests/'],
      'Phase6_Documentation': ['docs/'],
      'Phase7_Iteration': ['.readyai/iterations/']
    }
  },

  'library': {
    id: 'library',
    name: 'Library Package',
    description: 'Reusable library or package',
    supportedTechStacks: [{
      languages: ['TypeScript'],
      tools: ['Rollup', 'Jest']
    }],
    directories: ['src', 'tests', 'docs', '.readyai'],
    templateFiles: [],
    configFiles: [],
    phaseRequirements: {
      'Phase0_StrategicCharter': ['README.md'],
      'Phase1_ArchitecturalBlueprint': ['docs/api.md'],
      'Phase20_CoreContracts': ['src/types.ts'],
      'Phase21_ModuleSpec': ['docs/modules.md'],
      'Phase23_ModuleSpecSubsequent': ['docs/'],
      'Phase30_ProjectScaffolding': ['src/', 'package.json'],
      'Phase301_MasterPlan': ['.readyai/plan.json'],
      'Phase31_FileGeneration': ['src/'],
      'Phase4_ValidationCorrection': ['tests/'],
      'Phase5_TestGeneration': ['tests/'],
      'Phase6_Documentation': ['docs/', 'README.md'],
      'Phase7_Iteration': ['.readyai/iterations/']
    }
  },

  'cli-tool': {
    id: 'cli-tool',
    name: 'Command Line Tool',
    description: 'Command line interface application',
    supportedTechStacks: [{
      backend: 'Node.js',
      languages: ['TypeScript'],
      tools: ['Commander.js', 'Inquirer']
    }],
    directories: ['src', 'tests', 'docs', '.readyai'],
    templateFiles: [],
    configFiles: [],
    phaseRequirements: {
      'Phase0_StrategicCharter': ['README.md'],
      'Phase1_ArchitecturalBlueprint': ['docs/commands.md'],
      'Phase20_CoreContracts': ['src/types.ts'],
      'Phase21_ModuleSpec': ['docs/commands/'],
      'Phase23_ModuleSpecSubsequent': ['docs/'],
      'Phase30_ProjectScaffolding': ['src/', 'package.json'],
      'Phase301_MasterPlan': ['.readyai/plan.json'],
      'Phase31_FileGeneration': ['src/commands/', 'src/utils/'],
      'Phase4_ValidationCorrection': ['tests/'],
      'Phase5_TestGeneration': ['tests/'],
      'Phase6_Documentation': ['docs/', 'README.md'],
      'Phase7_Iteration': ['.readyai/iterations/']
    }
  },

  'microservice': {
    id: 'microservice',
    name: 'Microservice',
    description: 'Containerized microservice application',
    supportedTechStacks: [{
      backend: 'Node.js',
      database: 'MongoDB',
      languages: ['TypeScript'],
      tools: ['Express', 'Docker', 'Mongoose']
    }],
    directories: ['src', 'tests', 'docs', 'docker', '.readyai'],
    templateFiles: [],
    configFiles: [],
    phaseRequirements: {
      'Phase0_StrategicCharter': ['README.md'],
      'Phase1_ArchitecturalBlueprint': ['docs/service-design.md'],
      'Phase20_CoreContracts': ['src/types/index.ts'],
      'Phase21_ModuleSpec': ['docs/endpoints.md'],
      'Phase23_ModuleSpecSubsequent': ['docs/'],
      'Phase30_ProjectScaffolding': ['src/', 'Dockerfile'],
      'Phase301_MasterPlan': ['.readyai/plan.json'],
      'Phase31_FileGeneration': ['src/routes/', 'src/models/'],
      'Phase4_ValidationCorrection': ['tests/'],
      'Phase5_TestGeneration': ['tests/unit/', 'tests/integration/'],
      'Phase6_Documentation': ['docs/', 'README.md'],
      'Phase7_Iteration': ['.readyai/iterations/']
    }
  },

  'custom': {
    id: 'custom',
    name: 'Custom Project',
    description: 'Custom project structure',
    supportedTechStacks: [],
    directories: ['src', 'docs', '.readyai'],
    templateFiles: [],
    configFiles: [],
    phaseRequirements: {
      'Phase0_StrategicCharter': ['README.md'],
      'Phase1_ArchitecturalBlueprint': ['docs/architecture.md'],
      'Phase20_CoreContracts': ['src/types.ts'],
      'Phase21_ModuleSpec': ['docs/modules.md'],
      'Phase23_ModuleSpecSubsequent': ['docs/'],
      'Phase30_ProjectScaffolding': ['src/'],
      'Phase301_MasterPlan': ['.readyai/plan.json'],
      'Phase31_FileGeneration': ['src/'],
      'Phase4_ValidationCorrection': ['tests/'],
      'Phase5_TestGeneration': ['tests/'],
      'Phase6_Documentation': ['docs/'],
      'Phase7_Iteration': ['.readyai/iterations/']
    }
  }
};

/**
 * Default workspace configuration
 */
const DEFAULT_WORKSPACE_CONFIG = {
  defaultSafetyLevel: 'moderate' as SafetyLevel,
  createBackups: true,
  backupDirectory: '.readyai/backups',
  maxBackups: 10,
  validateOnOperations: true,
  enablePhaseTracking: true,
  autoCleanup: false
};

// =============================================================================
// MAIN SERVICE CLASS
// =============================================================================

/**
 * WorkspaceManager - Enterprise-grade workspace management for ReadyAI
 * 
 * Provides comprehensive workspace structure management with phase-aware operations,
 * intelligent project organization, and robust validation capabilities.
 * Adapted from Cline's workspace patterns with ReadyAI-specific enhancements.
 */
export class WorkspaceManager {
  private static instance: WorkspaceManager;
  private fileOps: FileOperationsService;
  private logger: Logger;
  private config: typeof DEFAULT_WORKSPACE_CONFIG;
  private activeWorkspaces: Map<UUID, Project> = new Map();
  private backupHistory: Map<UUID, WorkspaceBackup[]> = new Map();

  private constructor(config?: Partial<typeof DEFAULT_WORKSPACE_CONFIG>) {
    this.config = { ...DEFAULT_WORKSPACE_CONFIG, ...config };
    this.fileOps = FileOperationsService.getInstance();
    this.logger = logger;

    // Initialize workspace manager
    this.logger.info('WorkspaceManager initialized', {
      context: 'workspace',
      config: this.config
    });
  }

  /**
   * Get singleton service instance
   */
  public static getInstance(config?: Partial<typeof DEFAULT_WORKSPACE_CONFIG>): WorkspaceManager {
    if (!WorkspaceManager.instance) {
      WorkspaceManager.instance = new WorkspaceManager(config);
    }
    return WorkspaceManager.instance;
  }

  // =============================================================================
  // WORKSPACE CREATION AND INITIALIZATION
  // =============================================================================

  /**
   * Create new ReadyAI workspace with complete project structure
   * Adapted from Cline's workspace creation patterns
   */
  public async createWorkspace(
    project: Project,
    structureType: ProjectStructureType,
    options?: {
      overwrite?: boolean;
      skipExisting?: boolean;
      customTemplate?: Partial<ProjectStructureTemplate>;
    }
  ): Promise<ApiResponse<{
    workspacePath: string;
    filesCreated: string[];
    structure: ProjectStructureTemplate;
  }>> {
    const operationId = randomUUID() as UUID;
    const startTime = Date.now();

    try {
      // Create operation context
      const context: WorkspaceOperationContext = {
        operationId,
        projectId: project.id,
        currentPhase: project.currentPhase,
        operationType: 'create',
        safetyLevel: this.config.defaultSafetyLevel,
        createBackup: false, // No backup needed for new workspace
        initiatedBy: 'system',
        metadata: { structureType, options }
      };

      // Get project template
      const template = this.getProjectTemplate(structureType, options?.customTemplate);
      
      // Validate workspace path
      const workspacePath = project.rootPath;
      if (!workspacePath) {
        return createApiError('Project root path is required', 'MISSING_ROOT_PATH', 400);
      }

      // Check if workspace already exists
      const pathExists = await this.pathExists(workspacePath);
      if (pathExists && !options?.overwrite) {
        return createApiError(
          'Workspace already exists. Use overwrite option to replace.',
          'WORKSPACE_EXISTS',
          409
        );
      }

      // Create directory structure
      const directoriesCreated = await this.createDirectoryStructure(
        workspacePath, 
        template.directories,
        context
      );

      // Create template files
      const templateFilesCreated = await this.createTemplateFiles(
        workspacePath,
        template.templateFiles,
        project,
        context,
        options?.skipExisting
      );

      // Create configuration files
      const configFilesCreated = await this.createConfigFiles(
        workspacePath,
        template.configFiles,
        project,
        context
      );

      // Create ReadyAI metadata
      const metadataFiles = await this.createWorkspaceMetadata(
        workspacePath,
        project,
        template,
        context
      );

      // Register workspace
      this.activeWorkspaces.set(project.id, project);

      const filesCreated = [
        ...directoriesCreated,
        ...templateFilesCreated,
        ...configFilesCreated,
        ...metadataFiles
      ];

      // Log successful creation
      const duration = Date.now() - startTime;
      this.logger.info('Workspace created successfully', {
        context: 'workspace',
        operationId,
        projectId: project.id,
        workspacePath,
        structureType,
        filesCreated: filesCreated.length,
        duration
      });

      return createApiResponse({
        workspacePath,
        filesCreated,
        structure: template
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.logger.error('Workspace creation failed', {
        context: 'workspace',
        operationId,
        projectId: project.id,
        error: errorMessage,
        duration: Date.now() - startTime
      });

      return createApiError(
        `Failed to create workspace: ${errorMessage}`,
        'WORKSPACE_CREATION_FAILED',
        500,
        { operationId, originalError: errorMessage }
      );
    }
  }

  /**
   * Initialize existing workspace for ReadyAI management
   */
  public async initializeWorkspace(
    projectPath: string,
    project: Project
  ): Promise<ApiResponse<{
    initialized: boolean;
    structure: WorkspaceValidationResult;
    missingFiles: string[];
  }>> {
    const operationId = randomUUID() as UUID;

    try {
      const context: WorkspaceOperationContext = {
        operationId,
        projectId: project.id,
        currentPhase: project.currentPhase,
        operationType: 'initialize',
        safetyLevel: this.config.defaultSafetyLevel,
        createBackup: this.config.createBackups,
        initiatedBy: 'system',
        metadata: { projectPath }
      };

      // Validate workspace structure
      const validationResult = await this.validateWorkspace(projectPath, project.currentPhase);

      // Create missing ReadyAI directories
      const readyAiDirs = ['.readyai', '.readyai/backups', '.readyai/phases', '.readyai/logs'];
      const missingFiles: string[] = [];

      for (const dir of readyAiDirs) {
        const dirPath = path.join(projectPath, dir);
        if (!await this.pathExists(dirPath)) {
          await this.fileOps.createDirectory(dirPath, context);
          missingFiles.push(dir);
        }
      }

      // Create workspace metadata if missing
      const metadataPath = path.join(projectPath, '.readyai/workspace.json');
      if (!await this.pathExists(metadataPath)) {
        const metadata = this.generateWorkspaceMetadata(project);
        await this.fileOps.writeFile(metadataPath, JSON.stringify(metadata, null, 2), context);
        missingFiles.push('.readyai/workspace.json');
      }

      // Register workspace
      this.activeWorkspaces.set(project.id, { ...project, rootPath: projectPath });

      this.logger.info('Workspace initialized successfully', {
        context: 'workspace',
        operationId,
        projectId: project.id,
        projectPath,
        missingFilesCreated: missingFiles.length
      });

      return createApiResponse({
        initialized: true,
        structure: validationResult,
        missingFiles
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.logger.error('Workspace initialization failed', {
        context: 'workspace',
        operationId,
        projectId: project.id,
        error: errorMessage
      });

      return createApiError(
        `Failed to initialize workspace: ${errorMessage}`,
        'WORKSPACE_INIT_FAILED',
        500
      );
    }
  }

  // =============================================================================
  // PHASE MANAGEMENT
  // =============================================================================

  /**
   * Transition workspace to new phase with validation and setup
   * Core ReadyAI functionality for managing development phases
   */
  public async transitionToPhase(
    projectId: UUID,
    targetPhase: PhaseType,
    options?: {
      skipValidation?: boolean;
      createBackup?: boolean;
      autoSetup?: boolean;
    }
  ): Promise<ApiResponse<{
    transitioned: boolean;
    fromPhase: PhaseType;
    toPhase: PhaseType;
    setupActions: string[];
    validationResults?: WorkspaceValidationResult;
  }>> {
    const operationId = randomUUID() as UUID;

    try {
      const project = this.activeWorkspaces.get(projectId);
      if (!project) {
        return createApiError('Project not found in active workspaces', 'PROJECT_NOT_FOUND', 404);
      }

      const context: WorkspaceOperationContext = {
        operationId,
        projectId,
        currentPhase: project.currentPhase,
        targetPhase,
        operationType: 'phase-transition',
        safetyLevel: this.config.defaultSafetyLevel,
        createBackup: options?.createBackup ?? this.config.createBackups,
        initiatedBy: 'system',
        metadata: { options }
      };

      const fromPhase = project.currentPhase;

      // Validate current phase completion (unless skipped)
      let validationResults: WorkspaceValidationResult | undefined;
      if (!options?.skipValidation) {
        validationResults = await this.validateWorkspace(project.rootPath, fromPhase);
        if (!validationResults.valid) {
          return createApiError(
            'Current phase validation failed. Cannot transition to next phase.',
            'PHASE_VALIDATION_FAILED',
            422,
            { validationResults }
          );
        }
      }

      // Create backup if requested
      if (context.createBackup) {
        await this.createWorkspaceBackup(
          projectId, 
          `Pre-transition backup: ${fromPhase} -> ${targetPhase}`
        );
      }

      // Get phase transition requirements
      const template = this.getProjectTemplateForProject(project);
      const setupActions: string[] = [];

      // Create required directories for target phase
      const requiredFiles = template.phaseRequirements[targetPhase] || [];
      for (const requiredPath of requiredFiles) {
        const fullPath = path.join(project.rootPath, requiredPath);
        
        if (requiredPath.endsWith('/')) {
          // Directory
          if (!await this.pathExists(fullPath)) {
            await this.fileOps.createDirectory(fullPath, context);
            setupActions.push(`Created directory: ${requiredPath}`);
          }
        } else if (requiredPath.includes('/') && !await this.pathExists(path.dirname(fullPath))) {
          // File in directory that needs to be created
          await this.fileOps.createDirectory(path.dirname(fullPath), context);
          setupActions.push(`Created parent directory for: ${requiredPath}`);
        }
      }

      // Update phase metadata
      if (options?.autoSetup !== false) {
        const phaseMetadata = {
          phase: targetPhase,
          transitionedAt: new Date().toISOString(),
          transitionedFrom: fromPhase,
          operationId,
          setupActions
        };

        const metadataPath = path.join(project.rootPath, `.readyai/phases/${targetPhase}.json`);
        await this.fileOps.writeFile(
          metadataPath, 
          JSON.stringify(phaseMetadata, null, 2), 
          context
        );
        setupActions.push(`Created phase metadata: ${targetPhase}.json`);
      }

      // Update project phase
      project.currentPhase = targetPhase;
      project.lastModified = new Date().toISOString();
      this.activeWorkspaces.set(projectId, project);

      this.logger.info('Phase transition completed successfully', {
        context: 'workspace',
        operationId,
        projectId,
        fromPhase,
        toPhase: targetPhase,
        setupActionsCount: setupActions.length
      });

      return createApiResponse({
        transitioned: true,
        fromPhase,
        toPhase: targetPhase,
        setupActions,
        validationResults
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.logger.error('Phase transition failed', {
        context: 'workspace',
        operationId,
        projectId,
        targetPhase,
        error: errorMessage
      });

      return createApiError(
        `Failed to transition to phase: ${errorMessage}`,
        'PHASE_TRANSITION_FAILED',
        500
      );
    }
  }

  // =============================================================================
  // WORKSPACE VALIDATION
  // =============================================================================

  /**
   * Comprehensive workspace validation for ReadyAI compliance
   * Adapted from Cline's validation patterns with ReadyAI-specific checks
   */
  public async validateWorkspace(
    workspacePath: string, 
    currentPhase: PhaseType
  ): Promise<WorkspaceValidationResult> {
    const issues: ValidationIssue[] = [];
    const missingFiles: string[] = [];
    const invalidFiles: string[] = [];
    const suggestions: string[] = [];

    try {
      // Detect project structure type
      const structureType = await this.detectProjectStructure(workspacePath);
      const template = PROJECT_TEMPLATES[structureType];

      // Validate required phase files
      const requiredFiles = template.phaseRequirements[currentPhase] || [];
      
      for (const requiredFile of requiredFiles) {
        const filePath = path.join(workspacePath, requiredFile);
        const exists = await this.pathExists(filePath);
        
        if (!exists) {
          missingFiles.push(requiredFile);
          issues.push({
            severity: requiredFile.includes('README') ? 'warning' : 'error',
            category: 'missing-file',
            message: `Required file missing for ${currentPhase}: ${requiredFile}`,
            filePath: requiredFile,
            suggestedFix: `Create file: ${requiredFile}`,
            autoFixable: true
          });
        } else if (!requiredFile.endsWith('/')) {
          // Validate file content for non-directories
          const contentValid = await this.validateFileContent(filePath, requiredFile);
          if (!contentValid) {
            invalidFiles.push(requiredFile);
            issues.push({
              severity: 'warning',
              category: 'invalid-content',
              message: `File content validation failed: ${requiredFile}`,
              filePath: requiredFile,
              suggestedFix: `Review and fix content in ${requiredFile}`,
              autoFixable: false
            });
          }
        }
      }

      // Validate project structure consistency
      await this.validateProjectStructure(workspacePath, template, issues);

      // Validate ReadyAI metadata
      await this.validateReadyAIMetadata(workspacePath, currentPhase, issues);

      // Generate improvement suggestions
      this.generateImprovementSuggestions(issues, suggestions, template);

      // Calculate validation score
      const score = this.calculateValidationScore(issues, missingFiles, invalidFiles);

      return {
        valid: issues.filter(i => i.severity === 'error').length === 0,
        score,
        issues,
        missingFiles,
        invalidFiles,
        suggestions,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      issues.push({
        severity: 'error',
        category: 'validation-error',
        message: `Validation process failed: ${errorMessage}`,
        suggestedFix: 'Check workspace permissions and structure',
        autoFixable: false
      });

      return {
        valid: false,
        score: 0,
        issues,
        missingFiles,
        invalidFiles,
        suggestions: ['Fix validation errors and retry'],
        timestamp: new Date().toISOString()
      };
    }
  }

  // =============================================================================
  // BACKUP AND RESTORE
  // =============================================================================

  /**
   * Create comprehensive workspace backup
   * Enhanced from Cline's backup patterns with ReadyAI-specific metadata
   */
  public async createWorkspaceBackup(
    projectId: UUID,
    description: string
  ): Promise<ApiResponse<WorkspaceBackup>> {
    const operationId = randomUUID() as UUID;

    try {
      const project = this.activeWorkspaces.get(projectId);
      if (!project) {
        return createApiError('Project not found', 'PROJECT_NOT_FOUND', 404);
      }

      const backupId = randomUUID() as UUID;
      const timestamp = new Date().toISOString();
      const backupDir = path.join(project.rootPath, this.config.backupDirectory);
      const backupPath = path.join(backupDir, `backup-${backupId}`);

      const context: WorkspaceOperationContext = {
        operationId,
        projectId,
        currentPhase: project.currentPhase,
        operationType: 'backup',
        safetyLevel: 'moderate',
        createBackup: false, // We're creating the backup
        initiatedBy: 'system',
        metadata: { description }
      };

      // Ensure backup directory exists
      await this.fileOps.createDirectory(backupDir, context);

      // Get all files to backup (excluding certain directories)
      const filesToBackup = await this.getFilesForBackup(project.rootPath);
      const backedUpFiles: string[] = [];
      let totalSize = 0;

      // Create backup directory
      await this.fileOps.createDirectory(backupPath, context);

      // Copy files to backup location
      for (const relativePath of filesToBackup) {
        const sourcePath = path.join(project.rootPath, relativePath);
        const destPath = path.join(backupPath, relativePath);
        const destDir = path.dirname(destPath);

        // Ensure destination directory exists
        if (!await this.pathExists(destDir)) {
          await this.fileOps.createDirectory(destDir, context);
        }

        // Read and write file (using FileOperations for consistency)
        const readResult = await this.fileOps.readFile(sourcePath, context);
        if (readResult.success) {
          const writeResult = await this.fileOps.writeFile(
            destPath, 
            readResult.data.content, 
            context
          );
          
          if (writeResult.success) {
            backedUpFiles.push(relativePath);
            totalSize += readResult.data.metadata?.size || 0;
          }
        }
      }

      // Create backup metadata
      const backup: WorkspaceBackup = {
        backupId,
        projectId,
        timestamp,
        phase: project.currentPhase,
        backupPath,
        files: backedUpFiles,
        size: totalSize,
        description
      };

      // Save backup metadata
      const metadataPath = path.join(backupPath, '.backup-metadata.json');
      await this.fileOps.writeFile(
        metadataPath, 
        JSON.stringify(backup, null, 2), 
        context
      );

      // Update backup history
      const projectBackups = this.backupHistory.get(projectId) || [];
      projectBackups.push(backup);
      
      // Keep only the most recent backups
      if (projectBackups.length > this.config.maxBackups) {
        const oldBackups = projectBackups.splice(0, projectBackups.length - this.config.maxBackups);
        // Clean up old backup files
        for (const oldBackup of oldBackups) {
          try {
            await this.deleteDirectory(oldBackup.backupPath);
          } catch (error) {
            this.logger.warn('Failed to delete old backup', {
              context: 'workspace',
              backupPath: oldBackup.backupPath,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }

      this.backupHistory.set(projectId, projectBackups);

      this.logger.info('Workspace backup created successfully', {
        context: 'workspace',
        operationId,
        projectId,
        backupId,
        filesBackedUp: backedUpFiles.length,
        totalSize,
        backupPath
      });

      return createApiResponse(backup);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.logger.error('Workspace backup failed', {
        context: 'workspace',
        operationId,
        projectId,
        error: errorMessage
      });

      return createApiError(
        `Failed to create workspace backup: ${errorMessage}`,
        'BACKUP_FAILED',
        500
      );
    }
  }

  // =============================================================================
  // UTILITY AND HELPER METHODS
  // =============================================================================

  /**
   * Detect project structure type from existing workspace
   */
  private async detectProjectStructure(workspacePath: string): Promise<ProjectStructureType> {
    try {
      // Check for common project structure indicators
      const packageJsonPath = path.join(workspacePath, 'package.json');
      const pyprojectPath = path.join(workspacePath, 'pyproject.toml');
      const cargoPath = path.join(workspacePath, 'Cargo.toml');

      // Check for specific directory patterns
      const hasAppsDir = await this.pathExists(path.join(workspacePath, 'apps'));
      const hasPackagesDir = await this.pathExists(path.join(workspacePath, 'packages'));
      const hasSrcDir = await this.pathExists(path.join(workspacePath, 'src'));
      const hasPublicDir = await this.pathExists(path.join(workspacePath, 'public'));

      // Node.js/TypeScript projects
      if (await this.pathExists(packageJsonPath)) {
        if (hasAppsDir && hasPackagesDir) {
          return 'fullstack-web';
        } else if (hasPublicDir) {
          return 'frontend-spa';
        } else if (hasSrcDir) {
          // Check for specific patterns
          const hasCommandsDir = await this.pathExists(path.join(workspacePath, 'src/commands'));
          if (hasCommandsDir) return 'cli-tool';
          
          const hasRoutesDir = await this.pathExists(path.join(workspacePath, 'src/routes'));
          if (hasRoutesDir) return 'backend-api';
          
          return 'library';
        }
        return 'library';
      }

      // Python projects
      if (await this.pathExists(pyprojectPath)) {
        return 'backend-api';
      }

      // Rust projects
      if (await this.pathExists(cargoPath)) {
        return 'cli-tool';
      }

      // Check for mobile/desktop indicators
      const hasElectronConfig = await this.pathExists(path.join(workspacePath, 'electron.json'));
      if (hasElectronConfig) return 'desktop-app';

      const hasReactNativeConfig = await this.pathExists(path.join(workspacePath, 'metro.config.js'));
      if (hasReactNativeConfig) return 'mobile-app';

      // Default fallback
      return 'custom';

    } catch (error) {
      this.logger.warn('Failed to detect project structure, using custom', {
        context: 'workspace',
        workspacePath,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return 'custom';
    }
  }

  /**
   * Get project template with optional customizations
   */
  private getProjectTemplate(
    structureType: ProjectStructureType, 
    customizations?: Partial<ProjectStructureTemplate>
  ): ProjectStructureTemplate {
    const baseTemplate = PROJECT_TEMPLATES[structureType];
    if (!customizations) {
      return baseTemplate;
    }

    return {
      ...baseTemplate,
      ...customizations,
      directories: customizations.directories || baseTemplate.directories,
      templateFiles: customizations.templateFiles || baseTemplate.templateFiles,
      configFiles: customizations.configFiles || baseTemplate.configFiles,
      phaseRequirements: customizations.phaseRequirements || baseTemplate.phaseRequirements
    };
  }

  /**
   * Get project template for existing project
   */
  private getProjectTemplateForProject(project: Project): ProjectStructureTemplate {
    // Try to detect from project tech stack
    if (project.techStack.frontend && project.techStack.backend) {
      return PROJECT_TEMPLATES['fullstack-web'];
    } else if (project.techStack.backend && !project.techStack.frontend) {
      return PROJECT_TEMPLATES['backend-api'];
    } else if (project.techStack.frontend && !project.techStack.backend) {
      return PROJECT_TEMPLATES['frontend-spa'];
    }

    // Fallback to custom
    return PROJECT_TEMPLATES['custom'];
  }

  /**
   * Check if path exists
   */
  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create directory structure
   */
  private async createDirectoryStructure(
    basePath: string, 
    directories: string[], 
    context: WorkspaceOperationContext
  ): Promise<string[]> {
    const created: string[] = [];
    
    for (const dir of directories) {
      const fullPath = path.join(basePath, dir);
      if (!await this.pathExists(fullPath)) {
        await this.fileOps.createDirectory(fullPath, context, { recursive: true });
        created.push(dir);
      }
    }
    
    return created;
  }

  /**
   * Create template files
   */
  private async createTemplateFiles(
    basePath: string,
    templateFiles: TemplateFile[],
    project: Project,
    context: WorkspaceOperationContext,
    skipExisting?: boolean
  ): Promise<string[]> {
    const created: string[] = [];

    for (const templateFile of templateFiles) {
      const fullPath = path.join(basePath, templateFile.path);
      
      if (skipExisting && await this.pathExists(fullPath)) {
        continue;
      }

      // Process template content
      let content = templateFile.content;
      content = content.replace(/\{\{projectName\}\}/g, project.name);
      content = content.replace(/\{\{projectDescription\}\}/g, project.description || '');
      
      await this.fileOps.writeFile(
        fullPath, 
        content, 
        context, 
        { 
          overwrite: templateFile.overwrite,
          createDirs: true,
          encoding: templateFile.encoding 
        }
      );
      
      created.push(templateFile.path);
    }

    return created;
  }

  /**
   * Create configuration files
   */
  private async createConfigFiles(
    basePath: string,
    configFiles: ConfigFile[],
    project: Project,
    context: WorkspaceOperationContext
  ): Promise<string[]> {
    const created: string[] = [];

    for (const configFile of configFiles) {
      const fullPath = path.join(basePath, configFile.path);
      
      let config = configFile.config;
      
      // Process template variables in config
      const configStr = JSON.stringify(config);
      const processedStr = configStr
        .replace(/\{\{projectName\}\}/g, project.name)
        .replace(/\{\{projectDescription\}\}/g, project.description || '');
      
      config = JSON.parse(processedStr);

      // Handle existing config merging
      if (configFile.merge && await this.pathExists(fullPath)) {
        const existingResult = await this.fileOps.readFile(fullPath, context);
        if (existingResult.success) {
          try {
            const existingConfig = JSON.parse(existingResult.data.content);
            config = { ...existingConfig, ...config };
          } catch (error) {
            this.logger.warn('Failed to parse existing config for merging', {
              context: 'workspace',
              filePath: configFile.path,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }

      // Write configuration
      const content = configFile.format === 'json' 
        ? JSON.stringify(config, null, 2)
        : JSON.stringify(config, null, 2); // TODO: Add YAML/TOML support

      await this.fileOps.writeFile(fullPath, content, context, { createDirs: true });
      created.push(configFile.path);
    }

    return created;
  }

  /**
   * Create workspace metadata
   */
  private async createWorkspaceMetadata(
    basePath: string,
    project: Project,
    template: ProjectStructureTemplate,
    context: WorkspaceOperationContext
  ): Promise<string[]> {
    const created: string[] = [];

    // Create main workspace metadata
    const workspaceMetadata = this.generateWorkspaceMetadata(project, template);
    const metadataPath = path.join(basePath, '.readyai/workspace.json');
    
    await this.fileOps.writeFile(
      metadataPath, 
      JSON.stringify(workspaceMetadata, null, 2), 
      context,
      { createDirs: true }
    );
    created.push('.readyai/workspace.json');

    // Create phase tracking file
    const phaseMetadata = {
      currentPhase: project.currentPhase,
      phaseHistory: [],
      createdAt: new Date().toISOString(),
      template: template.id
    };
    
    const phaseTrackingPath = path.join(basePath, '.readyai/phases.json');
    await this.fileOps.writeFile(
      phaseTrackingPath,
      JSON.stringify(phaseMetadata, null, 2),
      context
    );
    created.push('.readyai/phases.json');

    return created;
  }

  /**
   * Generate workspace metadata
   */
  private generateWorkspaceMetadata(project: Project, template?: ProjectStructureTemplate) {
    return {
      version: '1.0.0',
      projectId: project.id,
      name: project.name,
      description: project.description,
      techStack: project.techStack,
      currentPhase: project.currentPhase,
      createdAt: project.createdAt,
      lastModified: new Date().toISOString(),
      structure: template?.id || 'custom',
      readyaiVersion: '1.0.0'
    };
  }

  /**
   * Validate file content
   */
  private async validateFileContent(filePath: string, fileName: string): Promise<boolean> {
    try {
      const context: FileOperationContext = {
        operationId: randomUUID() as UUID,
        safetyLevel: 'moderate',
        createBackup: false,
        maxFileSize: 1024 * 1024 // 1MB
      };

      const result = await this.fileOps.readFile(filePath, context);
      if (!result.success) {
        return false;
      }

      const content = result.data.content;

      // Basic validation checks
      if (fileName.endsWith('.json')) {
        try {
          JSON.parse(content);
          return true;
        } catch {
          return false;
        }
      }

      if (fileName.endsWith('.md')) {
        return content.trim().length > 0;
      }

      return true;

    } catch {
      return false;
    }
  }

  /**
   * Validate project structure
   */
  private async validateProjectStructure(
    workspacePath: string,
    template: ProjectStructureTemplate,
    issues: ValidationIssue[]
  ): Promise<void> {
    // Check for required directories
    for (const directory of template.directories) {
      const dirPath = path.join(workspacePath, directory);
      if (!await this.pathExists(dirPath)) {
        issues.push({
          severity: 'error',
          category: 'missing-directory',
          message: `Required directory missing: ${directory}`,
          filePath: directory,
          suggestedFix: `Create directory: ${directory}`,
          autoFixable: true
        });
      }
    }
  }

  /**
   * Validate ReadyAI metadata
   */
  private async validateReadyAIMetadata(
    workspacePath: string,
    currentPhase: PhaseType,
    issues: ValidationIssue[]
  ): Promise<void> {
    const metadataPath = path.join(workspacePath, '.readyai/workspace.json');
    
    if (!await this.pathExists(metadataPath)) {
      issues.push({
        severity: 'error',
        category: 'missing-metadata',
        message: 'ReadyAI workspace metadata missing',
        filePath: '.readyai/workspace.json',
        suggestedFix: 'Initialize workspace with ReadyAI',
        autoFixable: true
      });
    }
  }

  /**
   * Generate improvement suggestions
   */
  private generateImprovementSuggestions(
    issues: ValidationIssue[],
    suggestions: string[],
    template: ProjectStructureTemplate
  ): void {
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;

    if (errorCount > 0) {
      suggestions.push(`Fix ${errorCount} critical error${errorCount > 1 ? 's' : ''} to ensure workspace functionality`);
    }

    if (warningCount > 0) {
      suggestions.push(`Address ${warningCount} warning${warningCount > 1 ? 's' : ''} to improve project quality`);
    }

    const autoFixableCount = issues.filter(i => i.autoFixable).length;
    if (autoFixableCount > 0) {
      suggestions.push(`${autoFixableCount} issue${autoFixableCount > 1 ? 's' : ''} can be automatically fixed`);
    }

    if (issues.length === 0) {
      suggestions.push('Workspace structure is compliant with ReadyAI standards');
    }
  }

  /**
   * Calculate validation score
   */
  private calculateValidationScore(
    issues: ValidationIssue[],
    missingFiles: string[],
    invalidFiles: string[]
  ): number {
    let score = 100;

    // Deduct points for issues
    for (const issue of issues) {
      switch (issue.severity) {
        case 'error':
          score -= 10;
          break;
        case 'warning':
          score -= 5;
          break;
        case 'info':
          score -= 1;
          break;
      }
    }

    // Additional deductions
    score -= missingFiles.length * 3;
    score -= invalidFiles.length * 2;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get files for backup (excluding certain patterns)
   */
  private async getFilesForBackup(workspacePath: string): Promise<string[]> {
    const excludePatterns = [
      'node_modules',
      '.git',
      'dist',
      'build',
      'coverage',
      '.next',
      '.nuxt',
      '__pycache__',
      '*.pyc',
      'target',
      '.cargo'
    ];

    const files: string[] = [];

    // Simple implementation - in production, would use more sophisticated file walking
    try {
      const getAllFiles = async (dir: string, relativePath: string = ''): Promise<void> => {
        const entries = await fs.readdir(path.join(workspacePath, relativePath), { withFileTypes: true });

        for (const entry of entries) {
          const entryPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
          
          // Skip excluded patterns
          if (excludePatterns.some(pattern => entryPath.includes(pattern))) {
            continue;
          }

          if (entry.isDirectory()) {
            await getAllFiles(dir, entryPath);
          } else {
            files.push(entryPath);
          }
        }
      };

      await getAllFiles(workspacePath);
    } catch (error) {
      this.logger.warn('Error collecting files for backup', {
        context: 'workspace',
        workspacePath,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    return files;
  }

  /**
   * Delete directory recursively
   */
  private async deleteDirectory(dirPath: string): Promise<void> {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
      this.logger.warn('Failed to delete directory', {
        context: 'workspace',
        dirPath,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // =============================================================================
  // PUBLIC API METHODS
  // =============================================================================

  /**
   * Get available project templates
   */
  public getAvailableTemplates(): ProjectStructureTemplate[] {
    return Object.values(PROJECT_TEMPLATES);
  }

  /**
   * Get active workspace
   */
  public getActiveWorkspace(projectId: UUID): Project | undefined {
    return this.activeWorkspaces.get(projectId);
  }

  /**
   * Get backup history for project
   */
  public getBackupHistory(projectId: UUID): WorkspaceBackup[] {
    return this.backupHistory.get(projectId) || [];
  }

  /**
   * Update workspace manager configuration
   */
  public updateConfig(newConfig: Partial<typeof DEFAULT_WORKSPACE_CONFIG>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('WorkspaceManager configuration updated', {
      context: 'workspace',
      config: this.config
    });
  }

  /**
   * Health check for workspace manager
   */
  public async healthCheck(): Promise<ApiResponse<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    metrics: {
      activeWorkspaces: number;
      totalBackups: number;
      diskUsage?: string;
    };
  }>> {
    try {
      const activeWorkspaces = this.activeWorkspaces.size;
      const totalBackups = Array.from(this.backupHistory.values())
        .reduce((sum, backups) => sum + backups.length, 0);

      const status = activeWorkspaces > 100 ? 'degraded' : 'healthy';

      return createApiResponse({
        status,
        metrics: {
          activeWorkspaces,
          totalBackups
        }
      });

    } catch (error) {
      return createApiError(
        'Health check failed',
        'HEALTH_CHECK_FAILED',
        500,
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }
}

// =============================================================================
// EXPORTS AND CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Default workspace manager instance
 */
export const workspaceManager = WorkspaceManager.getInstance();

/**
 * Create custom workspace manager with specific configuration
 */
export const createWorkspaceManager = (config?: Partial<typeof DEFAULT_WORKSPACE_CONFIG>) =>
  WorkspaceManager.getInstance(config);

/**
 * Convenience functions for common operations
 */
export const createWorkspace = (
  project: Project,
  structureType: ProjectStructureType,
  options?: Parameters<WorkspaceManager['createWorkspace']>[2]
) => workspaceManager.createWorkspace(project, structureType, options);

export const initializeWorkspace = (projectPath: string, project: Project) =>
  workspaceManager.initializeWorkspace(projectPath, project);

export const transitionToPhase = (
  projectId: UUID,
  targetPhase: PhaseType,
  options?: Parameters<WorkspaceManager['transitionToPhase']>[2]
) => workspaceManager.transitionToPhase(projectId, targetPhase, options);

export const validateWorkspace = (workspacePath: string, currentPhase: PhaseType) =>
  workspaceManager.validateWorkspace(workspacePath, currentPhase);

export const createWorkspaceBackup = (projectId: UUID, description: string) =>
  workspaceManager.createWorkspaceBackup(projectId, description);

/**
 * Export types for external consumption
 */
export type {
  ProjectStructureType,
  ValidationSeverity,
  WorkspaceOperationType,
  ProjectStructureTemplate,
  TemplateFile,
  ConfigFile,
  ValidationIssue,
  WorkspaceValidationResult,
  WorkspaceOperationContext,
  PhaseTransitionRequirements,
  WorkspaceBackup
};
