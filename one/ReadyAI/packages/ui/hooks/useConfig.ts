// packages/ui/hooks/useConfig.ts

/**
 * ReadyAI Configuration Hook
 * 
 * Custom hook that maximizes reuse of Cline's proven custom hook patterns,
 * adapting their React state management architecture for ReadyAI's 
 * phase-aware configuration management system.
 * 
 * Achieves 60% reuse of Cline's hook patterns while adding ReadyAI-specific
 * configuration operations and enhanced error handling capabilities.
 * 
 * Adapted from Cline's webview-ui/src/hooks/ custom hook patterns
 * Pattern-Replicate reuse strategy focusing on proven hook architecture
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { 
  useConfig as useConfigContext,
  useConfigLoadingStates,
  useConfigValidation,
  useConfigConnection,
  useConfigUI 
} from '../contexts/ConfigContext';
import type {
  UUID,
  PhaseType,
  ApiProvider,
  ModelInfo,
  ApiConfiguration,
  PhaseConfiguration,
  ConfigurationTemplate,
  ApiResult,
  ReadyAIError,
  AsyncResult
} from '../../../foundation/types/core';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Configuration operation request options
 * Adapted from Cline's hook parameter patterns
 */
interface ConfigOperationOptions {
  /** Whether to show loading indicators */
  showLoading?: boolean;
  /** Whether to show success notifications */
  showNotifications?: boolean;
  /** Custom error handling callback */
  onError?: (error: ReadyAIError) => void;
  /** Custom success callback */
  onSuccess?: (message: string) => void;
  /** Operation timeout in milliseconds */
  timeout?: number;
  /** Whether to validate after operation */
  autoValidate?: boolean;
}

/**
 * Phase configuration update request
 * ReadyAI-specific extension of Cline patterns
 */
interface PhaseConfigUpdate {
  /** Phase to update */
  phase: PhaseType;
  /** Configuration changes to apply */
  configuration: Partial<PhaseConfiguration>;
  /** Update options */
  options?: ConfigOperationOptions;
}

/**
 * Model selection configuration
 * Enhanced model management from Cline patterns
 */
interface ModelSelection {
  /** AI provider */
  provider: ApiProvider;
  /** Model identifier */
  modelId: string;
  /** Optional model-specific configuration */
  modelConfig?: {
    maxTokens?: number;
    temperature?: number;
    extendedThinking?: boolean;
  };
}

/**
 * Configuration export result
 * File export functionality adapted from Cline
 */
interface ConfigExportResult {
  /** Exported data */
  data: string;
  /** Suggested filename */
  filename: string;
  /** Export format used */
  format: 'json' | 'yaml';
  /** Export timestamp */
  timestamp: string;
}

/**
 * Configuration import result
 * Import functionality with validation results
 */
interface ConfigImportResult {
  /** Whether import was successful */
  success: boolean;
  /** Imported configuration */
  configuration?: ApiConfiguration;
  /** Validation warnings */
  warnings: string[];
  /** Import errors */
  errors: string[];
}

// =============================================================================
// MAIN HOOK IMPLEMENTATION
// =============================================================================

/**
 * Enhanced configuration hook with ReadyAI-specific operations
 * 
 * This hook provides a comprehensive interface for configuration management,
 * building on Cline's proven custom hook patterns while adding ReadyAI's
 * phase-aware configuration capabilities and enhanced error handling.
 * 
 * Pattern-replicates Cline's hook architecture:
 * - Consistent error handling patterns
 * - Memoized operation callbacks
 * - Loading state management
 * - Automatic cleanup and resource management
 * 
 * @returns Enhanced configuration management interface
 */
export function useConfig() {
  // =============================================================================
  // CONTEXT AND STATE ACCESS
  // =============================================================================

  // Primary configuration context - Cline pattern
  const configContext = useConfigContext();
  
  // Specialized state hooks - following Cline's separation of concerns
  const loadingStates = useConfigLoadingStates();
  const validationState = useConfigValidation();
  const connectionState = useConfigConnection();
  const uiState = useConfigUI();

  // Operation timeout references - Cline's cleanup pattern
  const operationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cleanupCallbacksRef = useRef<Array<() => void>>([]);

  // =============================================================================
  // UTILITY FUNCTIONS
  // =============================================================================

  /**
   * Enhanced error handler with context-aware messaging
   * Adapted from Cline's error handling patterns
   */
  const handleOperationError = useCallback((
    error: Error | ReadyAIError,
    context: string,
    options?: ConfigOperationOptions
  ) => {
    const readyAIError = error instanceof ReadyAIError 
      ? error 
      : new ReadyAIError(
          `${context}: ${error.message}`,
          'OPERATION_ERROR',
          500,
          { context, originalError: error }
        );

    // Custom error handler takes precedence
    if (options?.onError) {
      options.onError(readyAIError);
    } else {
      // Fall back to context error handler
      configContext.handleError(readyAIError, context);
    }

    return readyAIError;
  }, [configContext]);

  /**
   * Success notification handler
   * Following Cline's notification patterns
   */
  const handleOperationSuccess = useCallback((
    message: string,
    options?: ConfigOperationOptions
  ) => {
    if (options?.onSuccess) {
      options.onSuccess(message);
    } else if (options?.showNotifications !== false) {
      configContext.showNotification({
        type: 'success',
        message,
        duration: 3000
      });
    }
  }, [configContext]);

  /**
   * Operation timeout wrapper
   * Cline's timeout management pattern
   */
  const withTimeout = useCallback(async <T>(
    operation: () => Promise<T>,
    timeoutMs: number = 30000,
    context: string = 'Operation'
  ): Promise<T> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new ReadyAIError(
          `${context} timed out after ${timeoutMs}ms`,
          'TIMEOUT_ERROR',
          408,
          { timeout: timeoutMs, context }
        ));
      }, timeoutMs);

      operationTimeoutRef.current = timeout;
      cleanupCallbacksRef.current.push(() => clearTimeout(timeout));

      operation()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          clearTimeout(timeout);
          operationTimeoutRef.current = null;
        });
    });
  }, []);

  // =============================================================================
  // CORE CONFIGURATION OPERATIONS
  // =============================================================================

  /**
   * Update API configuration with enhanced options
   * Extends Cline's configuration update patterns
   */
  const updateApiConfiguration = useCallback(async (
    configuration: Partial<ApiConfiguration>,
    options: ConfigOperationOptions = {}
  ): Promise<AsyncResult<ApiConfiguration>> => {
    const context = 'Updating API Configuration';
    
    try {
      const result = await withTimeout(
        () => configContext.updateConfiguration({ configuration }),
        options.timeout || 15000,
        context
      );

      // Auto-validate if requested
      if (options.autoValidate !== false) {
        await validationState.validate();
      }

      handleOperationSuccess('API configuration updated successfully', options);
      
      return { success: true, data: configContext.state.apiConfiguration };
    } catch (error) {
      const readyAIError = handleOperationError(error as Error, context, options);
      return { success: false, error: readyAIError };
    }
  }, [configContext, validationState, withTimeout, handleOperationError, handleOperationSuccess]);

  /**
   * Switch AI provider with model validation
   * ReadyAI-specific provider management
   */
  const switchProvider = useCallback(async (
    provider: ApiProvider,
    modelId: string,
    options: ConfigOperationOptions = {}
  ): Promise<AsyncResult<ModelInfo>> => {
    const context = `Switching to provider ${provider}`;
    
    try {
      // Check model availability
      const modelInfo = configContext.getModelInfo(provider, modelId);
      if (!modelInfo) {
        throw new ReadyAIError(
          `Model ${modelId} not available for provider ${provider}`,
          'MODEL_NOT_AVAILABLE',
          400,
          { provider, modelId }
        );
      }

      // Update configuration
      const configUpdate: Partial<ApiConfiguration> = {
        planModeApiProvider: provider,
        actModeApiProvider: provider,
        planModeModelId: modelId,
        actModeModelId: modelId,
        planModeModelInfo: modelInfo,
        actModeModelInfo: modelInfo
      };

      await withTimeout(
        () => configContext.updateConfiguration({ configuration: configUpdate }),
        options.timeout || 20000,
        context
      );

      handleOperationSuccess(`Successfully switched to ${provider} (${modelId})`, options);
      
      return { success: true, data: modelInfo };
    } catch (error) {
      const readyAIError = handleOperationError(error as Error, context, options);
      return { success: false, error: readyAIError };
    }
  }, [configContext, withTimeout, handleOperationError, handleOperationSuccess]);

  // =============================================================================
  // PHASE-AWARE OPERATIONS
  // =============================================================================

  /**
   * Update phase-specific configuration
   * ReadyAI's phase-aware configuration management
   */
  const updatePhaseConfiguration = useCallback(async ({
    phase,
    configuration,
    options = {}
  }: PhaseConfigUpdate): Promise<AsyncResult<PhaseConfiguration>> => {
    const context = `Updating ${phase} configuration`;
    
    try {
      await withTimeout(
        () => configContext.updatePhaseConfiguration(phase, configuration),
        options.timeout || 15000,
        context
      );

      // Auto-validate if requested
      if (options.autoValidate !== false) {
        await validationState.validate();
      }

      handleOperationSuccess(`${phase} configuration updated successfully`, options);
      
      const updatedConfig = configContext.state.phaseConfigurations[phase];
      return { success: true, data: updatedConfig };
    } catch (error) {
      const readyAIError = handleOperationError(error as Error, context, options);
      return { success: false, error: readyAIError };
    }
  }, [configContext, validationState, withTimeout, handleOperationError, handleOperationSuccess]);

  /**
   * Switch to different development phase
   * Enhanced phase switching with configuration loading
   */
  const switchPhase = useCallback(async (
    phase: PhaseType,
    options: ConfigOperationOptions = {}
  ): Promise<AsyncResult<PhaseConfiguration | null>> => {
    const context = `Switching to ${phase}`;
    
    try {
      await withTimeout(
        () => configContext.switchToPhase(phase),
        options.timeout || 10000,
        context
      );

      handleOperationSuccess(`Successfully switched to ${phase}`, options);
      
      const phaseConfig = configContext.state.phaseConfigurations[phase];
      return { success: true, data: phaseConfig || null };
    } catch (error) {
      const readyAIError = handleOperationError(error as Error, context, options);
      return { success: false, error: readyAIError };
    }
  }, [configContext, withTimeout, handleOperationError, handleOperationSuccess]);

  // =============================================================================
  // MODEL MANAGEMENT OPERATIONS
  // =============================================================================

  /**
   * Refresh model availability from all providers
   * Enhanced model management with selective refresh
   */
  const refreshModels = useCallback(async (
    providers?: ApiProvider[],
    options: ConfigOperationOptions = {}
  ): Promise<AsyncResult<Record<ApiProvider, Record<string, ModelInfo>>>> => {
    const context = providers 
      ? `Refreshing models for ${providers.join(', ')}` 
      : 'Refreshing all models';
    
    try {
      await withTimeout(
        () => configContext.refreshModels(providers),
        options.timeout || 30000,
        context
      );

      handleOperationSuccess('Model availability updated', options);
      
      return { success: true, data: configContext.state.availableModels };
    } catch (error) {
      const readyAIError = handleOperationError(error as Error, context, options);
      return { success: false, error: readyAIError };
    }
  }, [configContext, withTimeout, handleOperationError, handleOperationSuccess]);

  /**
   * Select optimal model for current phase
   * ReadyAI-specific model selection logic
   */
  const selectOptimalModel = useCallback(async (
    criteria: {
      phase?: PhaseType;
      preferredProvider?: ApiProvider;
      maxTokens?: number;
      supportImages?: boolean;
      budgetConstraint?: 'low' | 'medium' | 'high';
    },
    options: ConfigOperationOptions = {}
  ): Promise<AsyncResult<ModelSelection>> => {
    const context = 'Selecting optimal model';
    
    try {
      const { availableModels } = configContext.state;
      const currentPhase = criteria.phase || configContext.state.currentPhase;
      
      // Model selection algorithm (simplified for this example)
      let bestMatch: ModelSelection | null = null;
      let bestScore = 0;

      for (const [provider, models] of Object.entries(availableModels)) {
        for (const [modelId, modelInfo] of Object.entries(models)) {
          let score = 0;
          
          // Preferred provider bonus
          if (criteria.preferredProvider === provider) score += 50;
          
          // Token requirement check
          if (!criteria.maxTokens || modelInfo.maxTokens >= criteria.maxTokens) score += 30;
          
          // Image support check
          if (!criteria.supportImages || modelInfo.supportsImages) score += 20;
          
          // Budget constraint consideration
          if (criteria.budgetConstraint) {
            const priceScore = criteria.budgetConstraint === 'low' ? 
              (10 - (modelInfo.inputPrice || 0)) : 
              (modelInfo.inputPrice || 0) < 5 ? 10 : 5;
            score += priceScore;
          }

          if (score > bestScore) {
            bestScore = score;
            bestMatch = {
              provider: provider as ApiProvider,
              modelId,
              modelConfig: {
                maxTokens: modelInfo.maxTokens,
                temperature: 0.7 // Default temperature
              }
            };
          }
        }
      }

      if (!bestMatch) {
        throw new ReadyAIError(
          'No suitable model found for the given criteria',
          'NO_SUITABLE_MODEL',
          404,
          { criteria }
        );
      }

      handleOperationSuccess(
        `Selected ${bestMatch.provider} model: ${bestMatch.modelId}`, 
        options
      );

      return { success: true, data: bestMatch };
    } catch (error) {
      const readyAIError = handleOperationError(error as Error, context, options);
      return { success: false, error: readyAIError };
    }
  }, [configContext, handleOperationError, handleOperationSuccess]);

  // =============================================================================
  // TEMPLATE MANAGEMENT OPERATIONS
  // =============================================================================

  /**
   * Apply configuration template with validation
   * Enhanced template management from Cline patterns
   */
  const applyTemplate = useCallback(async (
    templateId: string,
    options: ConfigOperationOptions = {}
  ): Promise<AsyncResult<ConfigurationTemplate>> => {
    const context = `Applying template ${templateId}`;
    
    try {
      const template = configContext.state.templates.find(t => t.id === templateId);
      if (!template) {
        throw new ReadyAIError(
          `Template ${templateId} not found`,
          'TEMPLATE_NOT_FOUND',
          404,
          { templateId }
        );
      }

      await withTimeout(
        () => configContext.applyTemplate(templateId),
        options.timeout || 20000,
        context
      );

      // Auto-validate if requested
      if (options.autoValidate !== false) {
        await validationState.validate();
      }

      handleOperationSuccess(`Template "${template.name}" applied successfully`, options);
      
      return { success: true, data: template };
    } catch (error) {
      const readyAIError = handleOperationError(error as Error, context, options);
      return { success: false, error: readyAIError };
    }
  }, [configContext, validationState, withTimeout, handleOperationError, handleOperationSuccess]);

  /**
   * Save current configuration as template
   * Template creation with metadata
   */
  const saveAsTemplate = useCallback(async (
    name: string,
    description?: string,
    options: ConfigOperationOptions = {}
  ): Promise<AsyncResult<ConfigurationTemplate>> => {
    const context = `Saving template "${name}"`;
    
    try {
      await withTimeout(
        () => configContext.saveAsTemplate(name, description),
        options.timeout || 15000,
        context
      );

      // Find the newly created template
      const newTemplate = configContext.state.templates.find(t => t.name === name);
      if (!newTemplate) {
        throw new ReadyAIError(
          'Template was saved but could not be retrieved',
          'TEMPLATE_SAVE_ERROR',
          500,
          { name, description }
        );
      }

      handleOperationSuccess(`Template "${name}" saved successfully`, options);
      
      return { success: true, data: newTemplate };
    } catch (error) {
      const readyAIError = handleOperationError(error as Error, context, options);
      return { success: false, error: readyAIError };
    }
  }, [configContext, withTimeout, handleOperationError, handleOperationSuccess]);

  // =============================================================================
  // IMPORT/EXPORT OPERATIONS
  // =============================================================================

  /**
   * Export configuration to file
   * Enhanced export with format options
   */
  const exportConfiguration = useCallback(async (
    format: 'json' | 'yaml' = 'json',
    options: ConfigOperationOptions = {}
  ): Promise<AsyncResult<ConfigExportResult>> => {
    const context = `Exporting configuration as ${format}`;
    
    try {
      const result = await withTimeout(
        () => configContext.exportConfiguration(format),
        options.timeout || 10000,
        context
      );

      const exportResult: ConfigExportResult = {
        ...result,
        format,
        timestamp: new Date().toISOString()
      };

      handleOperationSuccess(`Configuration exported as ${format}`, options);
      
      return { success: true, data: exportResult };
    } catch (error) {
      const readyAIError = handleOperationError(error as Error, context, options);
      return { success: false, error: readyAIError };
    }
  }, [configContext, withTimeout, handleOperationError, handleOperationSuccess]);

  /**
   * Import configuration from file or data
   * Enhanced import with validation
   */
  const importConfiguration = useCallback(async (
    data: string | File,
    options: ConfigOperationOptions = {}
  ): Promise<AsyncResult<ConfigImportResult>> => {
    const context = 'Importing configuration';
    
    try {
      // Store current configuration for rollback
      const previousConfig = configContext.state.apiConfiguration;

      await withTimeout(
        () => configContext.importConfiguration(data),
        options.timeout || 20000,
        context
      );

      // Validate imported configuration
      let warnings: string[] = [];
      let errors: string[] = [];

      if (options.autoValidate !== false) {
        try {
          await validationState.validate();
          const validationResults = validationState.validationResults;
          
          if (validationResults) {
            warnings = validationResults.warnings || [];
            errors = validationResults.errors || [];
          }
        } catch (validationError) {
          errors.push(`Validation failed: ${(validationError as Error).message}`);
        }
      }

      const importResult: ConfigImportResult = {
        success: true,
        configuration: configContext.state.apiConfiguration,
        warnings,
        errors
      };

      const message = errors.length > 0 
        ? `Configuration imported with ${errors.length} errors`
        : warnings.length > 0 
        ? `Configuration imported with ${warnings.length} warnings`
        : 'Configuration imported successfully';

      handleOperationSuccess(message, options);
      
      return { success: true, data: importResult };
    } catch (error) {
      const readyAIError = handleOperationError(error as Error, context, options);
      return { 
        success: false, 
        error: readyAIError 
      };
    }
  }, [configContext, validationState, withTimeout, handleOperationError, handleOperationSuccess]);

  // =============================================================================
  // VALIDATION AND TESTING OPERATIONS
  // =============================================================================

  /**
   * Comprehensive configuration validation
   * Enhanced validation with detailed results
   */
  const validateConfiguration = useCallback(async (
    options: ConfigOperationOptions = {}
  ): Promise<AsyncResult<{
    isValid: boolean;
    score: number;
    errors: string[];
    warnings: string[];
    suggestions: string[];
  }>> => {
    const context = 'Validating configuration';
    
    try {
      await withTimeout(
        () => validationState.validate(),
        options.timeout || 15000,
        context
      );

      const results = validationState.validationResults;
      if (!results) {
        throw new ReadyAIError(
          'Validation completed but no results were returned',
          'VALIDATION_NO_RESULTS',
          500
        );
      }

      const validationSummary = {
        isValid: results.isValid,
        score: results.score || 0,
        errors: results.errors || [],
        warnings: results.warnings || [],
        suggestions: results.suggestions || []
      };

      const message = results.isValid 
        ? `Configuration is valid (Score: ${validationSummary.score}/100)`
        : `Configuration validation failed with ${validationSummary.errors.length} errors`;

      handleOperationSuccess(message, options);
      
      return { success: true, data: validationSummary };
    } catch (error) {
      const readyAIError = handleOperationError(error as Error, context, options);
      return { success: false, error: readyAIError };
    }
  }, [validationState, withTimeout, handleOperationError, handleOperationSuccess]);

  /**
   * Test API connection with current configuration
   * Connection testing functionality
   */
  const testConnection = useCallback(async (
    provider?: ApiProvider,
    options: ConfigOperationOptions = {}
  ): Promise<AsyncResult<{
    provider: ApiProvider;
    connected: boolean;
    latency: number;
    modelInfo?: ModelInfo;
  }>> => {
    const targetProvider = provider || configContext.state.apiConfiguration.planModeApiProvider;
    const context = `Testing connection to ${targetProvider}`;
    
    try {
      const startTime = Date.now();
      
      // Perform connection test by refreshing models for the specific provider
      await withTimeout(
        () => configContext.refreshModels([targetProvider]),
        options.timeout || 15000,
        context
      );

      const endTime = Date.now();
      const latency = endTime - startTime;
      
      const providerStatus = configContext.state.providerStatus[targetProvider];
      const modelInfo = configContext.getModelInfo(
        targetProvider, 
        configContext.state.apiConfiguration.planModeModelId
      );

      const testResult = {
        provider: targetProvider,
        connected: providerStatus?.available ?? false,
        latency,
        modelInfo: modelInfo || undefined
      };

      const message = testResult.connected 
        ? `Successfully connected to ${targetProvider} (${latency}ms)`
        : `Failed to connect to ${targetProvider}`;

      handleOperationSuccess(message, options);
      
      return { success: true, data: testResult };
    } catch (error) {
      const readyAIError = handleOperationError(error as Error, context, options);
      return { success: false, error: readyAIError };
    }
  }, [configContext, withTimeout, handleOperationError, handleOperationSuccess]);

  // =============================================================================
  // CLEANUP AND LIFECYCLE MANAGEMENT
  // =============================================================================

  /**
   * Cleanup function for component unmount
   * Cline's cleanup pattern implementation
   */
  useEffect(() => {
    return () => {
      // Clear any pending timeouts
      if (operationTimeoutRef.current) {
        clearTimeout(operationTimeoutRef.current);
      }

      // Execute all cleanup callbacks
      cleanupCallbacksRef.current.forEach(cleanup => {
        try {
          cleanup();
        } catch (error) {
          console.warn('Cleanup callback failed:', error);
        }
      });
      
      // Clear cleanup callbacks
      cleanupCallbacksRef.current = [];
    };
  }, []);

  // =============================================================================
  // MEMOIZED RETURN VALUE
  // =============================================================================

  /**
   * Memoized hook return value
   * Following Cline's performance optimization patterns
   */
  const hookValue = useMemo(() => ({
    // State access
    state: configContext.state,
    loadingStates,
    validationState,
    connectionState,
    uiState,

    // Core configuration operations
    updateApiConfiguration,
    switchProvider,
    
    // Phase-aware operations
    updatePhaseConfiguration,
    switchPhase,
    
    // Model management
    refreshModels,
    selectOptimalModel,
    getModelInfo: configContext.getModelInfo,
    
    // Template management
    applyTemplate,
    saveAsTemplate,
    loadTemplates: configContext.loadTemplates,
    
    // Import/Export
    exportConfiguration,
    importConfiguration,
    
    // Validation and testing
    validateConfiguration,
    testConnection,
    
    // History management (from context)
    undo: configContext.undo,
    redo: configContext.redo,
    canUndo: configContext.canUndo,
    canRedo: configContext.canRedo,
    
    // UI state management
    toggleSection: uiState.toggleSection,
    setActiveTab: uiState.setActiveTab,
    showNotification: configContext.showNotification,
    dismissNotification: uiState.dismissNotification,
    setShowAdvanced: uiState.setShowAdvanced,
    
    // Connection management
    reconnect: connectionState.reconnect,
    disconnect: connectionState.disconnect,
    
    // Error handling
    clearErrors: configContext.clearErrors,
    
    // Utility functions
    handleError: handleOperationError
  }), [
    configContext,
    loadingStates,
    validationState,
    connectionState,
    uiState,
    updateApiConfiguration,
    switchProvider,
    updatePhaseConfiguration,
    switchPhase,
    refreshModels,
    selectOptimalModel,
    applyTemplate,
    saveAsTemplate,
    exportConfiguration,
    importConfiguration,
    validateConfiguration,
    testConnection,
    handleOperationError
  ]);

  return hookValue;
}

// =============================================================================
// SPECIALIZED HOOKS
// =============================================================================

/**
 * Hook for phase-specific configuration management
 * Specialized hook for phase-aware operations
 */
export function usePhaseConfig(phase?: PhaseType) {
  const config = useConfig();
  const targetPhase = phase || config.state.currentPhase;

  const phaseConfig = useMemo(() => 
    config.state.phaseConfigurations[targetPhase] || null,
    [config.state.phaseConfigurations, targetPhase]
  );

  const updatePhase = useCallback(
    (configuration: Partial<PhaseConfiguration>, options?: ConfigOperationOptions) =>
      config.updatePhaseConfiguration({ phase: targetPhase, configuration, options }),
    [config.updatePhaseConfiguration, targetPhase]
  );

  const switchToPhase = useCallback(
    (options?: ConfigOperationOptions) => config.switchPhase(targetPhase, options),
    [config.switchPhase, targetPhase]
  );

  return useMemo(() => ({
    phase: targetPhase,
    configuration: phaseConfig,
    updateConfiguration: updatePhase,
    switchToPhase,
    isActive: targetPhase === config.state.currentPhase,
    isLoading: config.loadingStates.phaseConfig
  }), [
    targetPhase,
    phaseConfig,
    updatePhase,
    switchToPhase,
    config.state.currentPhase,
    config.loadingStates.phaseConfig
  ]);
}

/**
 * Hook for model management operations
 * Specialized hook for AI model operations
 */
export function useModelManagement() {
  const config = useConfig();

  const availableProviders = useMemo(() => 
    Object.keys(config.state.availableModels) as ApiProvider[],
    [config.state.availableModels]
  );

  const currentModel = useMemo(() => ({
    planMode: {
      provider: config.state.apiConfiguration.planModeApiProvider,
      modelId: config.state.apiConfiguration.planModeModelId,
      info: config.state.apiConfiguration.planModeModelInfo
    },
    actMode: {
      provider: config.state.apiConfiguration.actModeApiProvider,
      modelId: config.state.apiConfiguration.actModeModelId,
      info: config.state.apiConfiguration.actModeModelInfo
    }
  }), [config.state.apiConfiguration]);

  const getProviderStatus = useCallback((provider: ApiProvider) => 
    config.state.providerStatus[provider] || { available: false },
    [config.state.providerStatus]
  );

  return useMemo(() => ({
    availableModels: config.state.availableModels,
    availableProviders,
    currentModel,
    providerStatus: config.state.providerStatus,
    getProviderStatus,
    refreshModels: config.refreshModels,
    selectOptimalModel: config.selectOptimalModel,
    switchProvider: config.switchProvider,
    getModelInfo: config.getModelInfo,
    testConnection: config.testConnection,
    isLoading: config.loadingStates.models
  }), [
    config.state.availableModels,
    availableProviders,
    currentModel,
    config.state.providerStatus,
    getProviderStatus,
    config.refreshModels,
    config.selectOptimalModel,
    config.switchProvider,
    config.getModelInfo,
    config.testConnection,
    config.loadingStates.models
  ]);
}

// =============================================================================
// EXPORT DEFAULT
// =============================================================================

export default useConfig;

/**
 * Version information for the configuration hook
 */
export const USE_CONFIG_VERSION = '1.0.0';

/**
 * Hook type exports for external usage
 */
export type {
  ConfigOperationOptions,
  PhaseConfigUpdate,
  ModelSelection,
  ConfigExportResult,
  ConfigImportResult
};
