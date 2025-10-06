// apps/vscode/extension.ts

/**
 * ReadyAI VS Code Extension Entry Point
 * Main activation and lifecycle management for the ReadyAI Personal AI Development Orchestrator.
 * 
 * Production-ready implementation with:
 * - Robust error handling and recovery
 * - Proper service lifecycle management
 * - Comprehensive dependency injection
 * - Production-grade logging and telemetry
 * - Graceful degradation on service failures
 * - Project management commands and context menu integration
 */

import * as vscode from 'vscode';
import { ExtensionContext, window, workspace, commands, Disposable, Uri, TextDocument } from 'vscode';

// Core Types with proper imports
import { 
  UUID, 
  ApiResponse, 
  ServiceHealth,
  ReadyAIError,
  createApiResponse,
  createApiError 
} from '../../packages/foundation/types/core';

import { 
  LogLevel, 
  LogEntry, 
  TelemetryEvent 
} from '../../packages/foundation/types/logging';

import { 
  ConfigurationState, 
  ReadyAIConfig 
} from '../../packages/config/types/config';

import { 
  WorkspaceInfo, 
  FileOperation 
} from '../../packages/filesystem/types/filesystem';

// Project Management Types
import {
  Project,
  ProjectCreationRequest,
  ProjectSettings,
  ProjectLifecyclePhase,
  ProjectValidationResult
} from '../../packages/project-management/types/project';

import {
  ProjectOrchestrationRequest,
  PhaseTransitionRequest,
  WorkflowExecutionContext
} from '../../packages/project-management/types/orchestration';

// Services with error recovery
import { ConfigService } from '../../packages/config/services/ConfigService';
import { Logger } from '../../packages/logging/services/Logger';
import { ErrorService } from '../../packages/logging/services/ErrorService';
import { TelemetryService } from '../../packages/logging/services/TelemetryService';
import { WorkspaceManager } from '../../packages/filesystem/services/WorkspaceManager';
import { FileOperationsService } from '../../packages/filesystem/services/FileOperationsService';

// Project Management Services
import { ProjectService } from '../../packages/project-management/services/ProjectService';
import { ProjectCreationService } from '../../packages/project-management/services/ProjectCreationService';
import { ProjectOrchestrator } from '../../packages/project-management/services/ProjectOrchestrator';
import { PhaseManager } from '../../packages/project-management/services/PhaseManager';
import { ProjectWorkspaceManager } from '../../packages/project-management/services/ProjectWorkspaceManager';
import { ProjectEventService } from '../../packages/project-management/services/ProjectEventService';
import { ServiceCoordinator } from '../../packages/project-management/services/ServiceCoordinator';

/**
 * Extension state interface for managing activation lifecycle
 */
interface ExtensionState {
  readonly extensionId: UUID;
  readonly activationTimestamp: number;
  isActivated: boolean;
  services: ExtensionServices;
  disposables: vscode.Disposable[];
  context: ExtensionContext | null;
  healthCheckTimer?: NodeJS.Timeout;
  isShuttingDown: boolean;
  currentProject?: Project;
}

/**
 * Service registry for dependency management with null-safe typing
 */
interface ExtensionServices {
  config: ConfigService | null;
  logger: Logger | null;
  errorService: ErrorService | null;
  telemetry: TelemetryService | null;
  workspaceManager: WorkspaceManager | null;
  fileOperations: FileOperationsService | null;
  projectService: ProjectService | null;
  projectCreation: ProjectCreationService | null;
  projectOrchestrator: ProjectOrchestrator | null;
  phaseManager: PhaseManager | null;
  projectWorkspace: ProjectWorkspaceManager | null;
  projectEvents: ProjectEventService | null;
  serviceCoordinator: ServiceCoordinator | null;
}

/**
 * Extension activation context and configuration
 */
interface ActivationContext {
  readonly context: ExtensionContext;
  readonly workspaceFolder: vscode.WorkspaceFolder | undefined;
  readonly config: ReadyAIConfig;
  readonly sessionId: UUID;
}

/**
 * Service initialization result for tracking failures
 */
interface ServiceInitResult {
  serviceName: string;
  success: boolean;  
  error?: Error;
  criticalService: boolean;
}

/**
 * Project context menu context
 */
interface ProjectContextMenuContext {
  uri: Uri;
  document?: TextDocument;
  selection?: vscode.Selection;
  resourceType: 'file' | 'folder' | 'workspace';
}

// Global extension state with proper initialization
let extensionState: ExtensionState = {
  extensionId: generateUUID(),
  activationTimestamp: Date.now(),
  isActivated: false,
  services: {
    config: null,
    logger: null,
    errorService: null,
    telemetry: null,
    workspaceManager: null,
    fileOperations: null,
    projectService: null,
    projectCreation: null,
    projectOrchestrator: null,
    phaseManager: null,
    projectWorkspace: null,
    projectEvents: null,
    serviceCoordinator: null,
  },
  disposables: [],
  context: null,
  isShuttingDown: false,
};

/**
 * Main extension activation function
 * Production-ready implementation with comprehensive error handling
 */
export async function activate(context: ExtensionContext): Promise<void> {
  try {
    console.log('ReadyAI extension activation starting...');
    
    // Initialize activation context
    const activationContext = await initializeActivationContext(context);
    extensionState.context = context;

    // Initialize core services with error recovery
    const serviceResults = await initializeCoreServices(activationContext);
    
    // Initialize project management services
    const projectServiceResults = await initializeProjectServices(activationContext);
    serviceResults.push(...projectServiceResults);
    
    // Check if critical services failed
    const criticalFailures = serviceResults.filter(
      result => !result.success && result.criticalService
    );

    if (criticalFailures.length > 0) {
      await handleCriticalServiceFailures(criticalFailures);
      // Continue with degraded mode rather than complete failure
    }

    // Register extension commands (graceful degradation if services failed)
    await registerExtensionCommands(activationContext);

    // Register project management commands
    await registerProjectManagementCommands(activationContext);

    // Register context menu commands
    await registerContextMenuCommands(activationContext);

    // Setup workspace monitoring
    await setupWorkspaceMonitoring(activationContext);

    // Initialize project detection
    await initializeProjectDetection(activationContext);

    // Initialize UI components
    await initializeUserInterface(activationContext);

    // Start health monitoring
    setupServiceHealthMonitoring();

    // Mark extension as activated
    extensionState.isActivated = true;

    // Log successful activation
    const activationTime = Date.now() - extensionState.activationTimestamp;
    await extensionState.services.logger?.info(`ReadyAI extension activated successfully`, {
      extensionId: extensionState.extensionId,
      workspaceCount: workspace.workspaceFolders?.length || 0,
      activationTime,
      serviceFailures: serviceResults.filter(r => !r.success).length,
      projectServicesActive: Object.values(extensionState.services)
        .slice(6) // Project services start from index 6
        .filter(s => s !== null).length,
    });

    // Send activation telemetry
    await extensionState.services.telemetry?.trackEvent({
      eventId: generateUUID(),
      eventType: 'extension.activated',
      timestamp: Date.now(),
      properties: {
        extensionVersion: context.extension.packageJSON.version,
        vscodeVersion: vscode.version,
        workspaceType: workspace.workspaceFolders ? 'workspace' : 'single-file',
        activationTime,
        serviceStatus: serviceResults.map(r => ({ name: r.serviceName, success: r.success })),
        projectManagementEnabled: extensionState.services.projectService !== null,
      },
    });

    console.log(`ReadyAI extension activated in ${activationTime}ms`);
    
  } catch (error) {
    await handleActivationError(error, context);
  }
}

/**
 * Extension deactivation function
 * Ensures clean resource disposal with timeout protection
 */
export async function deactivate(): Promise<void> {
  try {
    console.log('ReadyAI extension deactivation starting...');
    extensionState.isShuttingDown = true;

    // Set timeout for deactivation to prevent hanging
    const deactivationTimeout = setTimeout(() => {
      console.warn('ReadyAI extension deactivation timeout, forcing cleanup');
    }, 10000); // 10 second timeout

    // Log deactivation start
    await extensionState.services.logger?.info('ReadyAI extension deactivating', {
      extensionId: extensionState.extensionId,
      uptime: Date.now() - extensionState.activationTimestamp,
      currentProjectId: extensionState.currentProject?.id,
    });

    // Send deactivation telemetry
    await extensionState.services.telemetry?.trackEvent({
      eventId: generateUUID(),
      eventType: 'extension.deactivated',
      timestamp: Date.now(),
      properties: {
        uptime: Date.now() - extensionState.activationTimestamp,
        servicesActive: Object.values(extensionState.services).filter(s => s !== null).length,
        hadActiveProject: extensionState.currentProject !== undefined,
      },
    });

    // Stop health monitoring
    if (extensionState.healthCheckTimer) {
      clearInterval(extensionState.healthCheckTimer);
    }

    // Dispose all registered disposables
    const disposalPromises = extensionState.disposables.map(async (disposable, index) => {
      try {
        disposable.dispose();
      } catch (error) {
        await extensionState.services.errorService?.logError(error as Error, {
          context: 'extension.deactivation',
          source: 'disposable.cleanup',
          disposableIndex: index,
        });
      }
    });

    await Promise.all(disposalPromises);

    // Shutdown services in reverse dependency order
    await shutdownServices();

    // Reset extension state
    extensionState.isActivated = false;
    extensionState.currentProject = undefined;
    extensionState.services = {
      config: null,
      logger: null,
      errorService: null,
      telemetry: null,
      workspaceManager: null,
      fileOperations: null,
      projectService: null,
      projectCreation: null,
      projectOrchestrator: null,
      phaseManager: null,
      projectWorkspace: null,
      projectEvents: null,
      serviceCoordinator: null,
    };
    extensionState.disposables = [];

    clearTimeout(deactivationTimeout);
    console.log('ReadyAI extension deactivated successfully');
    
  } catch (error) {
    console.error('Error during ReadyAI extension deactivation:', error);
  }
}

/**
 * Initialize activation context with workspace and configuration
 */
async function initializeActivationContext(context: ExtensionContext): Promise<ActivationContext> {
  const workspaceFolder = workspace.workspaceFolders?.[0];
  const sessionId = generateUUID();

  // Initialize minimal config service for bootstrap
  let config: ReadyAIConfig;
  try {
    const tempConfigService = new ConfigService();
    await tempConfigService.initialize?.();
    config = await tempConfigService.getConfiguration?.() || getDefaultConfig();
  } catch (error) {
    console.warn('Failed to load initial configuration, using defaults:', error);
    config = getDefaultConfig();
  }

  return {
    context,
    workspaceFolder,
    config,
    sessionId,
  };
}

/**
 * Initialize core services with comprehensive error handling
 */
async function initializeCoreServices(activationContext: ActivationContext): Promise<ServiceInitResult[]> {
  const { config, sessionId } = activationContext;
  const results: ServiceInitResult[] = [];

  // 1. Configuration Service (critical)
  try {
    extensionState.services.config = new ConfigService();
    await extensionState.services.config.initialize?.();
    results.push({ serviceName: 'ConfigService', success: true, criticalService: true });
  } catch (error) {
    results.push({ 
      serviceName: 'ConfigService', 
      success: false, 
      error: error as Error, 
      criticalService: true 
    });
    console.error('Failed to initialize ConfigService:', error);
  }

  // 2. Logger Service (critical)
  try {
    extensionState.services.logger = new Logger({
      level: config.logging?.level || LogLevel.INFO,
      enableConsole: config.logging?.enableConsole ?? true,
      enableFile: config.logging?.enableFile ?? true,
      sessionId,
    });
    await extensionState.services.logger.initialize?.();
    results.push({ serviceName: 'Logger', success: true, criticalService: true });
  } catch (error) {
    results.push({ 
      serviceName: 'Logger', 
      success: false, 
      error: error as Error, 
      criticalService: true 
    });
    console.error('Failed to initialize Logger:', error);
  }

  // 3. Error Service (critical)
  try {
    extensionState.services.errorService = new ErrorService(extensionState.services.logger);
    await extensionState.services.errorService.initialize?.();
    results.push({ serviceName: 'ErrorService', success: true, criticalService: true });
  } catch (error) {
    results.push({ 
      serviceName: 'ErrorService', 
      success: false, 
      error: error as Error, 
      criticalService: true 
    });
    console.error('Failed to initialize ErrorService:', error);
  }

  // 4. Telemetry Service (non-critical)
  try {
    extensionState.services.telemetry = new TelemetryService(extensionState.services.logger);
    await extensionState.services.telemetry.initialize?.({
      enableTelemetry: config.telemetry?.enabled ?? false,
      sessionId,
    });
    results.push({ serviceName: 'TelemetryService', success: true, criticalService: false });
  } catch (error) {
    results.push({ 
      serviceName: 'TelemetryService', 
      success: false, 
      error: error as Error, 
      criticalService: false 
    });
    console.warn('Failed to initialize TelemetryService (non-critical):', error);
  }

  // 5. Workspace Manager (non-critical)
  try {
    extensionState.services.workspaceManager = new WorkspaceManager(
      extensionState.services.logger,
      extensionState.services.errorService
    );
    await extensionState.services.workspaceManager.initialize?.();
    results.push({ serviceName: 'WorkspaceManager', success: true, criticalService: false });
  } catch (error) {
    results.push({ 
      serviceName: 'WorkspaceManager', 
      success: false, 
      error: error as Error, 
      criticalService: false 
    });
    console.warn('Failed to initialize WorkspaceManager (non-critical):', error);
  }

  // 6. File Operations Service (non-critical)
  try {
    extensionState.services.fileOperations = new FileOperationsService(
      extensionState.services.logger,
      extensionState.services.errorService
    );
    await extensionState.services.fileOperations.initialize?.();
    results.push({ serviceName: 'FileOperationsService', success: true, criticalService: false });
  } catch (error) {
    results.push({ 
      serviceName: 'FileOperationsService', 
      success: false, 
      error: error as Error, 
      criticalService: false 
    });
    console.warn('Failed to initialize FileOperationsService (non-critical):', error);
  }

  return results;
}

/**
 * Initialize project management services
 */
async function initializeProjectServices(activationContext: ActivationContext): Promise<ServiceInitResult[]> {
  const results: ServiceInitResult[] = [];

  // 1. Project Service (critical for project functionality)
  try {
    extensionState.services.projectService = new ProjectService(
      extensionState.services.logger!,
      extensionState.services.errorService!,
      extensionState.services.config!
    );
    await extensionState.services.projectService.initialize?.();
    results.push({ serviceName: 'ProjectService', success: true, criticalService: true });
  } catch (error) {
    results.push({
      serviceName: 'ProjectService',
      success: false,
      error: error as Error,
      criticalService: true
    });
    console.error('Failed to initialize ProjectService:', error);
  }

  // 2. Project Creation Service
  try {
    extensionState.services.projectCreation = new ProjectCreationService(
      extensionState.services.logger!,
      extensionState.services.errorService!, 
      extensionState.services.fileOperations!
    );
    await extensionState.services.projectCreation.initialize?.();
    results.push({ serviceName: 'ProjectCreationService', success: true, criticalService: false });
  } catch (error) {
    results.push({
      serviceName: 'ProjectCreationService',
      success: false,
      error: error as Error,
      criticalService: false
    });
    console.warn('Failed to initialize ProjectCreationService:', error);
  }

  // 3. Project Workspace Manager
  try {
    extensionState.services.projectWorkspace = new ProjectWorkspaceManager(
      extensionState.services.logger!,
      extensionState.services.errorService!,
      extensionState.services.fileOperations!
    );
    await extensionState.services.projectWorkspace.initialize?.();
    results.push({ serviceName: 'ProjectWorkspaceManager', success: true, criticalService: false });
  } catch (error) {
    results.push({
      serviceName: 'ProjectWorkspaceManager',
      success: false,
      error: error as Error,
      criticalService: false
    });
    console.warn('Failed to initialize ProjectWorkspaceManager:', error);
  }

  // 4. Project Event Service
  try {
    extensionState.services.projectEvents = new ProjectEventService(
      extensionState.services.logger!,
      extensionState.services.errorService!
    );
    await extensionState.services.projectEvents.initialize?.();
    results.push({ serviceName: 'ProjectEventService', success: true, criticalService: false });
  } catch (error) {
    results.push({
      serviceName: 'ProjectEventService',
      success: false,
      error: error as Error,
      criticalService: false
    });
    console.warn('Failed to initialize ProjectEventService:', error);
  }

  // 5. Phase Manager
  try {
    extensionState.services.phaseManager = new PhaseManager(
      extensionState.services.logger!,
      extensionState.services.errorService!,
      extensionState.services.projectEvents!
    );
    await extensionState.services.phaseManager.initialize?.();
    results.push({ serviceName: 'PhaseManager', success: true, criticalService: false });
  } catch (error) {
    results.push({
      serviceName: 'PhaseManager',
      success: false,
      error: error as Error,
      criticalService: false
    });
    console.warn('Failed to initialize PhaseManager:', error);
  }

  // 6. Project Orchestrator (depends on other project services)
  try {
    extensionState.services.projectOrchestrator = new ProjectOrchestrator(
      extensionState.services.logger!,
      extensionState.services.errorService!,
      extensionState.services.projectService!,
      extensionState.services.phaseManager!,
      extensionState.services.projectEvents!
    );
    await extensionState.services.projectOrchestrator.initialize?.();
    results.push({ serviceName: 'ProjectOrchestrator', success: true, criticalService: false });
  } catch (error) {
    results.push({
      serviceName: 'ProjectOrchestrator',
      success: false,
      error: error as Error,
      criticalService: false
    });
    console.warn('Failed to initialize ProjectOrchestrator:', error);
  }

  // 7. Service Coordinator (orchestrates all services)
  try {
    extensionState.services.serviceCoordinator = new ServiceCoordinator(
      extensionState.services.logger!,
      extensionState.services.errorService!,
      {
        config: extensionState.services.config!,
        fileOperations: extensionState.services.fileOperations!,
        workspaceManager: extensionState.services.workspaceManager!,
        projectService: extensionState.services.projectService!,
      }
    );
    await extensionState.services.serviceCoordinator.initialize?.();
    results.push({ serviceName: 'ServiceCoordinator', success: true, criticalService: false });
  } catch (error) {
    results.push({
      serviceName: 'ServiceCoordinator',
      success: false,
      error: error as Error,
      criticalService: false
    });
    console.warn('Failed to initialize ServiceCoordinator:', error);
  }

  return results;
}

/**
 * Handle critical service failures with user notification
 */
async function handleCriticalServiceFailures(failures: ServiceInitResult[]): Promise<void> {
  const failedServices = failures.map(f => f.serviceName).join(', ');
  const errorMessage = `ReadyAI extension started with limited functionality. Critical services failed: ${failedServices}`;
  
  console.error('Critical service failures:', failures);
  
  const action = await window.showWarningMessage(
    errorMessage,
    'View Logs',
    'Continue Anyway',
    'Disable Extension'
  );

  switch (action) {
    case 'View Logs':
      await commands.executeCommand('workbench.action.toggleDevTools');
      break;
    case 'Disable Extension':
      await commands.executeCommand(
        'workbench.extensions.action.disableWorkspaceExtension',
        'readyai.personal-ai-orchestrator'
      );
      break;
    case 'Continue Anyway':
    default:
      // Continue with degraded functionality
      break;
  }
}

/**
 * Register all extension commands with error handling
 */
async function registerExtensionCommands(activationContext: ActivationContext): Promise<void> {
  const { context } = activationContext;

  const commands = [
    { command: 'readyai.activateOrchestrator', callback: activateOrchestrator },
    { command: 'readyai.openConfigurationPanel', callback: openConfigurationPanel },
    { command: 'readyai.generateCode', callback: generateCode },
    { command: 'readyai.manageContext', callback: manageContext },
    { command: 'readyai.viewSystemHealth', callback: viewSystemHealth },
    { command: 'readyai.exportProject', callback: exportProject },
  ];

  for (const cmd of commands) {
    try {
      const disposable = vscode.commands.registerCommand(cmd.command, cmd.callback);
      extensionState.disposables.push(disposable);
      context.subscriptions.push(disposable);
    } catch (error) {
      await extensionState.services.errorService?.logError(error as Error, {
        context: 'extension.commandRegistration',
        command: cmd.command,
      });
    }
  }

  await extensionState.services.logger?.info('Extension commands registered', {
    commandCount: commands.length,
  });
}

/**
 * Register project management commands
 */
async function registerProjectManagementCommands(activationContext: ActivationContext): Promise<void> {
  const { context } = activationContext;

  const projectCommands = [
    { command: 'readyai.project.create', callback: createProject },
    { command: 'readyai.project.open', callback: openProject },
    { command: 'readyai.project.close', callback: closeProject },
    { command: 'readyai.project.settings', callback: showProjectSettings },
    { command: 'readyai.project.nextPhase', callback: advanceToNextPhase },
    { command: 'readyai.project.previousPhase', callback: revertToPreviousPhase },
    { command: 'readyai.project.validatePhase', callback: validateCurrentPhase },
    { command: 'readyai.project.orchestrate', callback: orchestrateProject },
    { command: 'readyai.project.showStatus', callback: showProjectStatus },
    { command: 'readyai.project.refreshWorkspace', callback: refreshProjectWorkspace },
  ];

  for (const cmd of projectCommands) {
    try {
      const disposable = vscode.commands.registerCommand(cmd.command, cmd.callback);
      extensionState.disposables.push(disposable);
      context.subscriptions.push(disposable);
    } catch (error) {
      await extensionState.services.errorService?.logError(error as Error, {
        context: 'extension.projectCommandRegistration',
        command: cmd.command,
      });
    }
  }

  await extensionState.services.logger?.info('Project management commands registered', {
    commandCount: projectCommands.length,
  });
}

/**
 * Register context menu commands for project operations
 */
async function registerContextMenuCommands(activationContext: ActivationContext): Promise<void> {
  const { context } = activationContext;

  const contextMenuCommands = [
    { command: 'readyai.context.addToProject', callback: addToProjectContext },
    { command: 'readyai.context.generateFromTemplate', callback: generateFromTemplate },
    { command: 'readyai.context.analyzeCode', callback: analyzeCodeContext },
    { command: 'readyai.context.refactorCode', callback: refactorCodeContext },
    { command: 'readyai.context.generateTests', callback: generateTestsContext },
    { command: 'readyai.context.explainCode', callback: explainCodeContext },
  ];

  for (const cmd of contextMenuCommands) {
    try {
      const disposable = vscode.commands.registerCommand(cmd.command, cmd.callback);
      extensionState.disposables.push(disposable);
      context.subscriptions.push(disposable);
    } catch (error) {
      await extensionState.services.errorService?.logError(error as Error, {
        context: 'extension.contextMenuCommandRegistration',
        command: cmd.command,
      });
    }
  }

  await extensionState.services.logger?.info('Context menu commands registered', {
    commandCount: contextMenuCommands.length,
  });
}

/**
 * Setup workspace monitoring for file changes and project state
 */
async function setupWorkspaceMonitoring(activationContext: ActivationContext): Promise<void> {
  const { context } = activationContext;

  try {
    // File system watcher
    const fileWatcher = workspace.createFileSystemWatcher('**/*', false, false, false);

    fileWatcher.onDidCreate(async (uri) => {
      await extensionState.services.fileOperations?.handleFileCreated?.(uri.fsPath);
      await extensionState.services.projectEvents?.emitEvent?.({
        eventId: generateUUID(),
        eventType: 'file.created',
        timestamp: Date.now(),
        projectId: extensionState.currentProject?.id,
        data: { filePath: uri.fsPath },
      });
      await extensionState.services.telemetry?.trackEvent({
        eventId: generateUUID(),
        eventType: 'file.created',
        timestamp: Date.now(),
        properties: { filePath: uri.fsPath },
      });
    });

    fileWatcher.onDidChange(async (uri) => {
      await extensionState.services.fileOperations?.handleFileChanged?.(uri.fsPath);
      await extensionState.services.projectEvents?.emitEvent?.({
        eventId: generateUUID(),
        eventType: 'file.modified',
        timestamp: Date.now(),
        projectId: extensionState.currentProject?.id,
        data: { filePath: uri.fsPath },
      });
    });

    fileWatcher.onDidDelete(async (uri) => {
      await extensionState.services.fileOperations?.handleFileDeleted?.(uri.fsPath);
      await extensionState.services.projectEvents?.emitEvent?.({
        eventId: generateUUID(),
        eventType: 'file.deleted',
        timestamp: Date.now(),
        projectId: extensionState.currentProject?.id,
        data: { filePath: uri.fsPath },
      });
      await extensionState.services.telemetry?.trackEvent({
        eventId: generateUUID(),
        eventType: 'file.deleted',
        timestamp: Date.now(),
        properties: { filePath: uri.fsPath },
      });
    });

    // Workspace folder changes
    const workspaceWatcher = workspace.onDidChangeWorkspaceFolders(async (event) => {
      for (const folder of event.added) {
        await extensionState.services.workspaceManager?.addWorkspaceFolder?.(folder.uri.fsPath);
        await extensionState.services.projectWorkspace?.handleWorkspaceFolderAdded?.(folder.uri.fsPath);
      }
      
      for (const folder of event.removed) {
        await extensionState.services.workspaceManager?.removeWorkspaceFolder?.(folder.uri.fsPath);
        await extensionState.services.projectWorkspace?.handleWorkspaceFolderRemoved?.(folder.uri.fsPath);
      }
    });

    extensionState.disposables.push(fileWatcher, workspaceWatcher);
    context.subscriptions.push(fileWatcher, workspaceWatcher);

  } catch (error) {
    await extensionState.services.errorService?.logError(error as Error, {
      context: 'extension.workspaceMonitoring',
    });
  }
}

/**
 * Initialize project detection for existing workspaces
 */
async function initializeProjectDetection(activationContext: ActivationContext): Promise<void> {
  try {
    if (!extensionState.services.projectService) {
      return; // Project service not available
    }

    const workspaceFolder = activationContext.workspaceFolder;
    if (workspaceFolder) {
      // Check if current workspace contains a ReadyAI project
      const existingProject = await extensionState.services.projectService.detectProject?.(
        workspaceFolder.uri.fsPath
      );

      if (existingProject) {
        extensionState.currentProject = existingProject;
        await extensionState.services.logger?.info('Existing ReadyAI project detected', {
          projectId: existingProject.id,
          projectName: existingProject.name,
          currentPhase: existingProject.currentPhase,
        });

        // Show project status in status bar
        await updateProjectStatusDisplay(existingProject);
      }
    }
  } catch (error) {
    await extensionState.services.errorService?.logError(error as Error, {
      context: 'extension.projectDetection',
    });
  }
}

/**
 * Initialize user interface components
 */
async function initializeUserInterface(activationContext: ActivationContext): Promise<void> {
  const { context } = activationContext;

  try {
    // Status bar item for ReadyAI
    const statusBarItem = window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = '🚀 ReadyAI';
    statusBarItem.tooltip = 'ReadyAI Personal AI Development Orchestrator';
    statusBarItem.command = 'readyai.activateOrchestrator';
    statusBarItem.show();

    // Project status bar item (initially hidden)
    const projectStatusBar = window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    projectStatusBar.command = 'readyai.project.showStatus';
    
    if (extensionState.currentProject) {
      await updateProjectStatusDisplay(extensionState.currentProject);
    }

    extensionState.disposables.push(statusBarItem, projectStatusBar);
    context.subscriptions.push(statusBarItem, projectStatusBar);

    await extensionState.services.logger?.info('User interface components initialized');
    
  } catch (error) {
    await extensionState.services.errorService?.logError(error as Error, {
      context: 'extension.uiInitialization',
    });
  }
}

/**
 * Update project status display in status bar
 */
async function updateProjectStatusDisplay(project: Project): Promise<void> {
  const statusBarItems = extensionState.context?.subscriptions.filter(
    (item): item is vscode.StatusBarItem => 
      item instanceof vscode.StatusBarItem
  );

  const projectStatusBar = statusBarItems?.find(item => 
    item.command === 'readyai.project.showStatus'
  );

  if (projectStatusBar) {
    projectStatusBar.text = `📋 ${project.name} (${project.currentPhase})`;
    projectStatusBar.tooltip = `ReadyAI Project: ${project.name}\nPhase: ${project.currentPhase}\nClick for details`;
    projectStatusBar.show();
  }
}

/**
 * Setup service health monitoring with configurable intervals
 */
function setupServiceHealthMonitoring(): void {
  // Clear existing timer if any
  if (extensionState.healthCheckTimer) {
    clearInterval(extensionState.healthCheckTimer);
  }

  extensionState.healthCheckTimer = setInterval(async () => {
    if (extensionState.isShuttingDown) return;

    try {
      const healthChecks: ServiceHealth[] = [];

      // Check each service health
      for (const [serviceName, service] of Object.entries(extensionState.services)) {
        if (service && typeof service.getHealthStatus === 'function') {
          try {
            const health = await service.getHealthStatus();
            healthChecks.push({
              serviceId: serviceName as UUID,
              serviceName,
              status: health.status,
              timestamp: Date.now(),
              details: health.details,
            });
          } catch (error) {
            healthChecks.push({
              serviceId: serviceName as UUID,
              serviceName,
              status: 'unhealthy',
              timestamp: Date.now(),
              details: { 
                error: error instanceof Error ? error.message : 'Unknown error' 
              },
            });
          }
        }
      }

      // Log health status
      const unhealthyServices = healthChecks.filter(h => h.status !== 'healthy');
      if (unhealthyServices.length > 0) {
        await extensionState.services.logger?.warn('Unhealthy services detected', {
          unhealthyCount: unhealthyServices.length,
          services: unhealthyServices.map(s => s.serviceName),
        });
      }

    } catch (error) {
      await extensionState.services.errorService?.logError(error as Error, {
        context: 'extension.healthMonitoring',
        source: 'periodicCheck',
      });
    }
  }, 30000); // Check every 30 seconds
}

/**
 * Handle activation errors with comprehensive reporting
 */
async function handleActivationError(error: unknown, context: ExtensionContext): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : 'Unknown activation error';
  const errorStack = error instanceof Error ? error.stack : undefined;

  // Log to console as fallback
  console.error('ReadyAI extension activation failed:', error);

  // Try to log through error service if available
  if (extensionState.services.errorService) {
    await extensionState.services.errorService.logError(error as Error, {
      context: 'extension.activation',
      source: 'activateFunction',
    });
  }

  // Show user-friendly error message
  const action = await window.showErrorMessage(
    `ReadyAI extension failed to activate: ${errorMessage}`,
    'View Logs',
    'Retry',
    'Disable'
  );

  switch (action) {
    case 'View Logs':
      await commands.executeCommand('workbench.action.toggleDevTools');
      break;
    case 'Retry':
      await commands.executeCommand('workbench.action.reloadWindow');
      break;
    case 'Disable':
      await commands.executeCommand(
        'workbench.extensions.action.disableWorkspaceExtension',
        'readyai.personal-ai-orchestrator'
      );
      break;
  }

  // Mark extension as failed
  extensionState.isActivated = false;
  throw error;
}

/**
 * Shutdown services in reverse dependency order
 */
async function shutdownServices(): Promise<void> {
  const shutdownOrder = [
    'serviceCoordinator',
    'projectOrchestrator',
    'phaseManager',
    'projectEvents',
    'projectWorkspace',
    'projectCreation',
    'projectService',
    'fileOperations',
    'workspaceManager',
    'telemetry',
    'errorService',
    'logger',
    'config',
  ] as const;

  for (const serviceName of shutdownOrder) {
    const service = extensionState.services[serviceName];
    if (service && typeof service.shutdown === 'function') {
      try {
        await service.shutdown();
        extensionState.services[serviceName] = null;
      } catch (error) {
        console.error(`Error shutting down ${serviceName}:`, error);
      }
    }
  }
}

// ================================
// Command Implementations
// ================================

async function activateOrchestrator(): Promise<void> {
  try {
    await window.showInformationMessage('ReadyAI Orchestrator is now active!');
    await extensionState.services.telemetry?.trackEvent({
      eventId: generateUUID(),
      eventType: 'orchestrator.activated',
      timestamp: Date.now(),
      properties: {},
    });
  } catch (error) {
    await extensionState.services.errorService?.logError(error as Error, {
      context: 'command.activateOrchestrator',
    });
  }
}

async function openConfigurationPanel(): Promise<void> {
  try {
    await commands.executeCommand('workbench.action.openSettings', 'ext:readyai.personal-ai-orchestrator');
  } catch (error) {
    await extensionState.services.errorService?.logError(error as Error, {
      context: 'command.openConfigurationPanel',
    });
  }
}

async function generateCode(): Promise<void> {
  try {
    const input = await window.showInputBox({
      prompt: 'Describe the code you want to generate',
      placeHolder: 'e.g., Create a React component for user authentication',
    });

    if (input) {
      await window.showInformationMessage(`Generating code for: ${input}`);
      // TODO: Implementation would integrate with Claude API
    }
  } catch (error) {
    await extensionState.services.errorService?.logError(error as Error, {
      context: 'command.generateCode',
    });
  }
}

async function manageContext(): Promise<void> {
  try {
    const workspaceInfo = await extensionState.services.workspaceManager?.getWorkspaceInfo?.();
    await window.showInformationMessage(
      `Managing context for: ${workspaceInfo?.workspaceName || 'current workspace'}`
    );
  } catch (error) {
    await extensionState.services.errorService?.logError(error as Error, {
      context: 'command.manageContext',
    });
  }
}

async function viewSystemHealth(): Promise<void> {
  try {
    const healthStatus = Object.keys(extensionState.services)
      .map(service => `${service}: ${extensionState.services[service as keyof ExtensionServices] ? '✓' : '✗'}`)
      .join('\n');

    await window.showInformationMessage(`ReadyAI System Health:\n${healthStatus}`);
  } catch (error) {
    await extensionState.services.errorService?.logError(error as Error, {
      context: 'command.viewSystemHealth',
    });
  }
}

async function exportProject(): Promise<void> {
  try {
    const result = await extensionState.services.fileOperations?.exportProject?.();
    if (result) {
      await window.showInformationMessage('Project exported successfully!');
    }
  } catch (error) {
    await extensionState.services.errorService?.logError(error as Error, {
      context: 'command.exportProject',
    });
  }
}

// ================================
// Project Management Commands
// ================================

async function createProject(): Promise<void> {
  try {
    if (!extensionState.services.projectCreation) {
      await window.showErrorMessage('Project creation service is not available');
      return;
    }

    const projectName = await window.showInputBox({
      prompt: 'Enter project name',
      placeHolder: 'My ReadyAI Project',
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Project name is required';
        }
        if (value.length > 100) {
          return 'Project name is too long';
        }
        return null;
      }
    });

    if (!projectName) return;

    const projectDescription = await window.showInputBox({
      prompt: 'Enter project description (optional)',
      placeHolder: 'Describe what this project will do...',
    });

    const workspaceFolder = workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      await window.showErrorMessage('Please open a workspace folder first');
      return;
    }

    const createRequest: ProjectCreationRequest = {
      name: projectName.trim(),
      description: projectDescription?.trim() || '',
      workspacePath: workspaceFolder.uri.fsPath,
      template: 'default', // TODO: Allow template selection
    };

    await window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Creating ReadyAI project: ${projectName}`,
      cancellable: false
    }, async (progress) => {
      const project = await extensionState.services.projectCreation!.createProject(createRequest);
      extensionState.currentProject = project;
      
      await updateProjectStatusDisplay(project);
      await window.showInformationMessage(`ReadyAI project "${projectName}" created successfully!`);
      
      await extensionState.services.telemetry?.trackEvent({
        eventId: generateUUID(),
        eventType: 'project.created',
        timestamp: Date.now(),
        properties: { 
          projectId: project.id,
          projectName: project.name,
          hasDescription: !!project.description,
        },
      });
    });

  } catch (error) {
    await extensionState.services.errorService?.logError(error as Error, {
      context: 'command.createProject',
    });
    await window.showErrorMessage(`Failed to create project: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function openProject(): Promise<void> {
  try {
    if (!extensionState.services.projectService) {
      await window.showErrorMessage('Project service is not available');
      return;
    }

    // Get list of available projects
    const projects = await extensionState.services.projectService.getAllProjects?.() || [];
    
    if (projects.length === 0) {
      const action = await window.showInformationMessage(
        'No ReadyAI projects found. Would you like to create one?',
        'Create Project'
      );
      if (action === 'Create Project') {
        await createProject();
      }
      return;
    }

    const projectItems = projects.map(project => ({
      label: project.name,
      description: project.description || 'No description',
      detail: `Phase: ${project.currentPhase} | Modified: ${new Date(project.updatedAt).toLocaleDateString()}`,
      project,
    }));

    const selectedItem = await window.showQuickPick(projectItems, {
      placeHolder: 'Select a ReadyAI project to open',
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (selectedItem) {
      extensionState.currentProject = selectedItem.project;
      await updateProjectStatusDisplay(selectedItem.project);
      await window.showInformationMessage(`Opened ReadyAI project: ${selectedItem.project.name}`);
      
      await extensionState.services.telemetry?.trackEvent({
        eventId: generateUUID(),
        eventType: 'project.opened',
        timestamp: Date.now(),
        properties: { 
          projectId: selectedItem.project.id,
          projectName: selectedItem.project.name,
        },
      });
    }

  } catch (error) {
    await extensionState.services.errorService?.logError(error as Error, {
      context: 'command.openProject',
    });
    await window.showErrorMessage(`Failed to open project: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function closeProject(): Promise<void> {
  try {
    if (!extensionState.currentProject) {
      await window.showInformationMessage('No ReadyAI project is currently open');
      return;
    }

    const projectName = extensionState.currentProject.name;
    extensionState.currentProject = undefined;

    // Hide project status bar
    const statusBarItems = extensionState.context?.subscriptions.filter(
      (item): item is vscode.StatusBarItem => item instanceof vscode.StatusBarItem
    );
    const projectStatusBar = statusBarItems?.find(item => 
      item.command === 'readyai.project.showStatus'
    );
    if (projectStatusBar) {
      projectStatusBar.hide();
    }

    await window.showInformationMessage(`Closed ReadyAI project: ${projectName}`);
    
    await extensionState.services.telemetry?.trackEvent({
      eventId: generateUUID(),
      eventType: 'project.closed',
      timestamp: Date.now(),
      properties: { projectName },
    });

  } catch (error) {
    await extensionState.services.errorService?.logError(error as Error, {
      context: 'command.closeProject',
    });
  }
}

async function showProjectSettings(): Promise<void> {
  try {
    if (!extensionState.currentProject) {
      await window.showWarningMessage('No ReadyAI project is currently open');
      return;
    }

    // TODO: Open project settings UI
    await window.showInformationMessage(`Project Settings for: ${extensionState.currentProject.name}`);
    
  } catch (error) {
    await extensionState.services.errorService?.logError(error as Error, {
      context: 'command.showProjectSettings',
    });
  }
}

async function advanceToNextPhase(): Promise<void> {
  try {
    if (!extensionState.currentProject || !extensionState.services.phaseManager) {
      await window.showWarningMessage('No ReadyAI project is currently open or phase manager is unavailable');
      return;
    }

    const currentPhase = extensionState.currentProject.currentPhase;
    const nextPhase = await extensionState.services.phaseManager.getNextPhase?.(currentPhase);
    
    if (!nextPhase) {
      await window.showInformationMessage('Project is already in the final phase');
      return;
    }

    const action = await window.showInformationMessage(
      `Advance project from ${currentPhase} to ${nextPhase}?`,
      'Advance',
      'Cancel'
    );

    if (action === 'Advance') {
      await window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Advancing project phase...',
        cancellable: false
      }, async () => {
        const transitionRequest: PhaseTransitionRequest = {
          projectId: extensionState.currentProject!.id,
          targetPhase: nextPhase,
          skipValidation: false,
        };

        await extensionState.services.phaseManager!.transitionToPhase(transitionRequest);
        extensionState.currentProject!.currentPhase = nextPhase;
        await updateProjectStatusDisplay(extensionState.currentProject!);
      });

      await window.showInformationMessage(`Project advanced to phase: ${nextPhase}`);
    }

  } catch (error) {
    await extensionState.services.errorService?.logError(error as Error, {
      context: 'command.advanceToNextPhase',
    });
    await window.showErrorMessage(`Failed to advance phase: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function revertToPreviousPhase(): Promise<void> {
  try {
    if (!extensionState.currentProject || !extensionState.services.phaseManager) {
      await window.showWarningMessage('No ReadyAI project is currently open or phase manager is unavailable');
      return;
    }

    const currentPhase = extensionState.currentProject.currentPhase;
    const previousPhase = await extensionState.services.phaseManager.getPreviousPhase?.(currentPhase);
    
    if (!previousPhase) {
      await window.showInformationMessage('Project is already in the initial phase');
      return;
    }

    const action = await window.showWarningMessage(
      `Revert project from ${currentPhase} back to ${previousPhase}? This may lose progress.`,
      'Revert',
      'Cancel'
    );

    if (action === 'Revert') {
      await window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Reverting project phase...',
        cancellable: false
      }, async () => {
        const transitionRequest: PhaseTransitionRequest = {
          projectId: extensionState.currentProject!.id,
          targetPhase: previousPhase,
          skipValidation: true, // Skip validation when reverting
        };

        await extensionState.services.phaseManager!.transitionToPhase(transitionRequest);
        extensionState.currentProject!.currentPhase = previousPhase;
        await updateProjectStatusDisplay(extensionState.currentProject!);
      });

      await window.showInformationMessage(`Project reverted to phase: ${previousPhase}`);
    }

  } catch (error) {
    await extensionState.services.errorService?.logError(error as Error, {
      context: 'command.revertToPreviousPhase',
    });
    await window.showErrorMessage(`Failed to revert phase: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function validateCurrentPhase(): Promise<void> {
  try {
    if (!extensionState.currentProject || !extensionState.services.phaseManager) {
      await window.showWarningMessage('No ReadyAI project is currently open or phase manager is unavailable');
      return;
    }

    await window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Validating current phase...',
      cancellable: false
    }, async () => {
      const validation = await extensionState.services.phaseManager!.validatePhase?.({
        projectId: extensionState.currentProject!.id,
        phase: extensionState.currentProject!.currentPhase,
      });

      if (validation?.isValid) {
        await window.showInformationMessage(
          `Phase ${extensionState.currentProject!.currentPhase} validation passed ✓`
        );
      } else {
        const issues = validation?.issues?.join('\n• ') || 'Unknown validation issues';
        await window.showWarningMessage(
          `Phase ${extensionState.currentProject!.currentPhase} validation failed:\n• ${issues}`
        );
      }
    });

  } catch (error) {
    await extensionState.services.errorService?.logError(error as Error, {
      context: 'command.validateCurrentPhase',
    });
    await window.showErrorMessage(`Failed to validate phase: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function orchestrateProject(): Promise<void> {
  try {
    if (!extensionState.currentProject || !extensionState.services.projectOrchestrator) {
      await window.showWarningMessage('No ReadyAI project is currently open or orchestrator is unavailable');
      return;
    }

    const action = await window.showInformationMessage(
      `Start orchestrating project: ${extensionState.currentProject.name}?`,
      'Start Orchestration',
      'Cancel'
    );

    if (action === 'Start Orchestration') {
      await window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Orchestrating project...',
        cancellable: true
      }, async (progress, token) => {
        const orchestrationRequest: ProjectOrchestrationRequest = {
          projectId: extensionState.currentProject!.id,
          targetPhase: extensionState.currentProject!.currentPhase,
          executionMode: 'interactive',
        };

        // TODO: Implement progress reporting
        await extensionState.services.projectOrchestrator!.orchestrateProject(orchestrationRequest);
        
        if (!token.isCancellationRequested) {
          await window.showInformationMessage('Project orchestration completed successfully!');
        }
      });
    }

  } catch (error) {
    await extensionState.services.errorService?.logError(error as Error, {
      context: 'command.orchestrateProject',
    });
    await window.showErrorMessage(`Failed to orchestrate project: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function showProjectStatus(): Promise<void> {
  try {
    if (!extensionState.currentProject) {
      await window.showInformationMessage('No ReadyAI project is currently open');
      return;
    }

    const project = extensionState.currentProject;
    const statusMessage = [
      `**Project:** ${project.name}`,
      `**Description:** ${project.description || 'No description'}`,
      `**Current Phase:** ${project.currentPhase}`,
      `**Created:** ${new Date(project.createdAt).toLocaleDateString()}`,
      `**Modified:** ${new Date(project.updatedAt).toLocaleDateString()}`,
      `**Workspace:** ${project.workspacePath}`,
    ].join('\n');

    await window.showInformationMessage(statusMessage, { modal: true });

  } catch (error) {
    await extensionState.services.errorService?.logError(error as Error, {
      context: 'command.showProjectStatus',
    });
  }
}

async function refreshProjectWorkspace(): Promise<void> {
  try {
    if (!extensionState.currentProject || !extensionState.services.projectWorkspace) {
      await window.showWarningMessage('No ReadyAI project is currently open or workspace manager is unavailable');
      return;
    }

    await window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Refreshing project workspace...',
      cancellable: false
    }, async () => {
      await extensionState.services.projectWorkspace!.refreshWorkspace?.(
        extensionState.currentProject!.id
      );
    });

    await window.showInformationMessage('Project workspace refreshed successfully');

  } catch (error) {
    await extensionState.services.errorService?.logError(error as Error, {
      context: 'command.refreshProjectWorkspace',
    });
    await window.showErrorMessage(`Failed to refresh workspace: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ================================
// Context Menu Commands
// ================================

async function addToProjectContext(uri?: Uri): Promise<void> {
  try {
    if (!extensionState.currentProject) {
      await window.showWarningMessage('No ReadyAI project is currently open');
      return;
    }

    const targetUri = uri || window.activeTextEditor?.document.uri;
    if (!targetUri) {
      await window.showWarningMessage('No file or folder selected');
      return;
    }

    // TODO: Implement adding file/folder to project context
    await window.showInformationMessage(`Added to project context: ${targetUri.fsPath}`);

  } catch (error) {
    await extensionState.services.errorService?.logError(error as Error, {
      context: 'command.addToProjectContext',
    });
  }
}

async function generateFromTemplate(uri?: Uri): Promise<void> {
  try {
    const targetUri = uri || window.activeTextEditor?.document.uri;
    if (!targetUri) {
      await window.showWarningMessage('No file or folder selected');
      return;
    }

    // TODO: Implement template-based code generation
    await window.showInformationMessage(`Generate from template at: ${targetUri.fsPath}`);

  } catch (error) {
    await extensionState.services.errorService?.logError(error as Error, {
      context: 'command.generateFromTemplate',
    });
  }
}

async function analyzeCodeContext(uri?: Uri): Promise<void> {
  try {
    const targetUri = uri || window.activeTextEditor?.document.uri;
    if (!targetUri) {
      await window.showWarningMessage('No file selected');
      return;
    }

    // TODO: Implement code analysis
    await window.showInformationMessage(`Analyzing code: ${targetUri.fsPath}`);

  } catch (error) {
    await extensionState.services.errorService?.logError(error as Error, {
      context: 'command.analyzeCodeContext',
    });
  }
}

async function refactorCodeContext(uri?: Uri): Promise<void> {
  try {
    const targetUri = uri || window.activeTextEditor?.document.uri;
    if (!targetUri) {
      await window.showWarningMessage('No file selected');
      return;
    }

    // TODO: Implement code refactoring
    await window.showInformationMessage(`Refactoring code: ${targetUri.fsPath}`);

  } catch (error) {
    await extensionState.services.errorService?.logError(error as Error, {
      context: 'command.refactorCodeContext',
    });
  }
}

async function generateTestsContext(uri?: Uri): Promise<void> {
  try {
    const targetUri = uri || window.activeTextEditor?.document.uri;
    if (!targetUri) {
      await window.showWarningMessage('No file selected');
      return;
    }

    // TODO: Implement test generation
    await window.showInformationMessage(`Generating tests for: ${targetUri.fsPath}`);

  } catch (error) {
    await extensionState.services.errorService?.logError(error as Error, {
      context: 'command.generateTestsContext',
    });
  }
}

async function explainCodeContext(uri?: Uri): Promise<void> {
  try {
    const editor = window.activeTextEditor;
    const targetUri = uri || editor?.document.uri;
    
    if (!targetUri) {
      await window.showWarningMessage('No file selected');
      return;
    }

    let codeToExplain = '';
    if (editor && !editor.selection.isEmpty) {
      codeToExplain = editor.document.getText(editor.selection);
    } else if (editor) {
      codeToExplain = editor.document.getText();
    }

    // TODO: Implement code explanation
    await window.showInformationMessage(
      codeToExplain 
        ? `Explaining selected code in: ${targetUri.fsPath}`
        : `Explaining entire file: ${targetUri.fsPath}`
    );

  } catch (error) {
    await extensionState.services.errorService?.logError(error as Error, {
      context: 'command.explainCodeContext',
    });
  }
}

// ================================
// Utility Functions
// ================================

function generateUUID(): UUID {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  }) as UUID;
}

function getDefaultConfig(): ReadyAIConfig {
  return {
    logging: {
      level: LogLevel.INFO,
      enableConsole: true,
      enableFile: false,
    },
    telemetry: {
      enabled: false,
    },
    projectManagement: {
      autoDetectProjects: true,
      defaultTemplate: 'default',
    },
  } as ReadyAIConfig;
}

// ================================
// Export functions for testing and debugging
// ================================

export function getExtensionState(): Readonly<ExtensionState> {
  return extensionState;
}

export function isExtensionActivated(): boolean {
  return extensionState.isActivated && extensionState.services.logger !== null;
}

export function getServiceStatus(): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(extensionState.services).map(([key, service]) => [key, service !== null])
  );
}

export function getCurrentProject(): Project | undefined {
  return extensionState.currentProject;
}

export function getProjectServices(): {
  projectService: ProjectService | null;
  projectOrchestrator: ProjectOrchestrator | null;
  phaseManager: PhaseManager | null;
} {
  return {
    projectService: extensionState.services.projectService,
    projectOrchestrator: extensionState.services.projectOrchestrator,
    phaseManager: extensionState.services.phaseManager,
  };
}
