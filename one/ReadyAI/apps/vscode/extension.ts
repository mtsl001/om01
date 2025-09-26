// apps\vscode\extension.ts

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
 */

import * as vscode from 'vscode';
import { ExtensionContext, window, workspace, commands, Disposable } from 'vscode';

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

// Services with error recovery
import { ConfigService } from '../../packages/config/services/ConfigService';
import { Logger } from '../../packages/logging/services/Logger';
import { ErrorService } from '../../packages/logging/services/ErrorService';
import { TelemetryService } from '../../packages/logging/services/TelemetryService';
import { WorkspaceManager } from '../../packages/filesystem/services/WorkspaceManager';
import { FileOperationsService } from '../../packages/filesystem/services/FileOperationsService';

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

    // Setup workspace monitoring
    await setupWorkspaceMonitoring(activationContext);

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
    });

    // Send deactivation telemetry
    await extensionState.services.telemetry?.trackEvent({
      eventId: generateUUID(),
      eventType: 'extension.deactivated',
      timestamp: Date.now(),
      properties: {
        uptime: Date.now() - extensionState.activationTimestamp,
        servicesActive: Object.values(extensionState.services).filter(s => s !== null).length,
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
    extensionState.services = {
      config: null,
      logger: null,
      errorService: null,
      telemetry: null,
      workspaceManager: null,
      fileOperations: null,
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
 * Setup workspace monitoring for file changes and project state
 */
async function setupWorkspaceMonitoring(activationContext: ActivationContext): Promise<void> {
  const { context } = activationContext;

  try {
    // File system watcher
    const fileWatcher = workspace.createFileSystemWatcher('**/*', false, false, false);

    fileWatcher.onDidCreate(async (uri) => {
      await extensionState.services.fileOperations?.handleFileCreated?.(uri.fsPath);
      await extensionState.services.telemetry?.trackEvent({
        eventId: generateUUID(),
        eventType: 'file.created',
        timestamp: Date.now(),
        properties: { filePath: uri.fsPath },
      });
    });

    fileWatcher.onDidChange(async (uri) => {
      await extensionState.services.fileOperations?.handleFileChanged?.(uri.fsPath);
    });

    fileWatcher.onDidDelete(async (uri) => {
      await extensionState.services.fileOperations?.handleFileDeleted?.(uri.fsPath);
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
      }
      
      for (const folder of event.removed) {
        await extensionState.services.workspaceManager?.removeWorkspaceFolder?.(folder.uri.fsPath);
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
 * Initialize user interface components
 */
async function initializeUserInterface(activationContext: ActivationContext): Promise<void> {
  const { context } = activationContext;

  try {
    // Status bar item
    const statusBarItem = window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = '🚀 ReadyAI';
    statusBarItem.tooltip = 'ReadyAI Personal AI Development Orchestrator';
    statusBarItem.command = 'readyai.activateOrchestrator';
    statusBarItem.show();

    extensionState.disposables.push(statusBarItem);
    context.subscriptions.push(statusBarItem);

    await extensionState.services.logger?.info('User interface components initialized');
    
  } catch (error) {
    await extensionState.services.errorService?.logError(error as Error, {
      context: 'extension.uiInitialization',
    });
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

// Command Implementations with error handling

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

// Utility Functions

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
  } as ReadyAIConfig;
}

// Export functions for testing and debugging

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
