// packages/ui/contexts/ConfigContext.tsx

/**
 * Configuration Context for ReadyAI Personal AI Development Orchestrator
 * 
 * This context maximizes reuse of Cline's ExtensionStateContext patterns (800+ lines),
 * adapting their proven React state management architecture for ReadyAI's phase-aware
 * configuration management. Achieves 80%+ reuse of Cline's state patterns while adding
 * ReadyAI-specific configuration capabilities and enhanced error handling.
 * 
 * Adapted from Cline's webview-ui/src/context/ExtensionStateContext.tsx
 */

import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
  ReactNode
} from 'react'
import {
  ConfigApiClient,
  getConfigApiClient,
  ConfigRequestOptions,
  ConfigUpdateRequest,
  ConfigValidationRequest,
  ModelAvailabilityResponse,
  ConfigurationTemplate,
  handleApiResult
} from '../services/ConfigApiClient'
import {
  ApiConfiguration,
  PhaseConfiguration,
  PhaseConfigurationMap,
  ApiProvider,
  ModelInfo,
  ConfigurationValidationResult,
  PhaseType,
  UUID,
  ApiResponse,
  ApiErrorResponse,
  isApiSuccess,
  ReadyAIError
} from '../../../foundation/types/core'

// =============================================================================
// TYPE DEFINITIONS (Adapted from Cline's ExtensionStateContext)
// =============================================================================

/**
 * Configuration state adapted from Cline's ExtensionState patterns
 * Enhanced with ReadyAI's phase-aware configuration management
 */
export interface ReadyAIConfigState {
  /** Current API configuration */
  apiConfiguration: ApiConfiguration
  /** Phase-specific configurations */
  phaseConfigurations: PhaseConfigurationMap
  /** Current active phase */
  currentPhase: PhaseType
  /** Available models by provider */
  availableModels: Record<ApiProvider, Record<string, ModelInfo>>
  /** Provider status information */
  providerStatus: Record<ApiProvider, {
    available: boolean
    latency?: number
    error?: string
  }>
  /** Configuration validation state */
  validationState: {
    isValidating: boolean
    validationResults: ConfigurationValidationResult | null
    lastValidated: string | null
    errors: string[]
  }
  /** Connection state adapted from Cline's patterns */
  connectionState: {
    isConnected: boolean
    isReconnecting: boolean
    reconnectAttempts: number
    lastConnectionAttempt: string | null
    lastError: string | null
  }
  /** Loading states for various operations */
  loadingStates: {
    configuration: boolean
    validation: boolean
    models: boolean
    phaseConfig: boolean
    templates: boolean
    export: boolean
    import: boolean
    reset: boolean
  }
  /** Configuration templates */
  templates: ConfigurationTemplate[]
  /** UI state management */
  uiState: {
    expandedSections: Set<string>
    showAdvanced: boolean
    activeTab: 'general' | 'phases' | 'models' | 'templates'
    notifications: Array<{
      id: string
      type: 'info' | 'success' | 'warning' | 'error'
      message: string
      timestamp: string
      duration?: number
    }>
  }
  /** Configuration history for undo/redo */
  history: {
    past: ApiConfiguration[]
    present: ApiConfiguration
    future: ApiConfiguration[]
    maxHistorySize: number
  }
}

/**
 * Configuration context value interface
 * Follows Cline's comprehensive context pattern with enhanced configuration methods
 */
export interface ConfigContextValue {
  // State
  state: ReadyAIConfigState
  
  // Core configuration methods adapted from Cline
  getConfiguration: () => Promise<void>
  updateConfiguration: (request: ConfigUpdateRequest, options?: ConfigRequestOptions) => Promise<void>
  validateConfiguration: (request?: ConfigValidationRequest) => Promise<void>
  resetConfiguration: (scope?: 'all' | 'api' | 'phases') => Promise<void>
  
  // Phase-specific configuration management
  getPhaseConfiguration: (phase: PhaseType) => Promise<void>
  updatePhaseConfiguration: (phase: PhaseType, configuration: Partial<PhaseConfiguration>) => Promise<void>
  switchToPhase: (phase: PhaseType) => Promise<void>
  
  // Model management
  refreshModels: (providers?: ApiProvider[]) => Promise<void>
  getModelInfo: (provider: ApiProvider, modelId: string) => ModelInfo | null
  
  // Template management
  loadTemplates: () => Promise<void>
  applyTemplate: (templateId: string) => Promise<void>
  saveAsTemplate: (name: string, description?: string) => Promise<void>
  
  // Import/Export functionality
  exportConfiguration: (format?: 'json' | 'yaml') => Promise<{ data: string; filename: string }>
  importConfiguration: (data: string | File) => Promise<void>
  
  // History management (undo/redo)
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  
  // UI state management adapted from Cline
  toggleSection: (sectionId: string) => void
  setActiveTab: (tab: ReadyAIConfigState['uiState']['activeTab']) => void
  showNotification: (notification: Omit<ReadyAIConfigState['uiState']['notifications'][0], 'id' | 'timestamp'>) => void
  dismissNotification: (id: string) => void
  setShowAdvanced: (show: boolean) => void
  
  // Connection management
  reconnect: () => Promise<void>
  disconnect: () => void
  
  // Error handling
  clearErrors: () => void
  handleError: (error: Error | ReadyAIError, context?: string) => void
}

/**
 * Configuration provider props
 */
export interface ConfigProviderProps {
  children: ReactNode
  /** Optional custom API client */
  apiClient?: ConfigApiClient
  /** Initial phase to load */
  initialPhase?: PhaseType
  /** Configuration options */
  options?: {
    autoValidate?: boolean
    autoRefreshModels?: boolean
    enableHistory?: boolean
    maxHistorySize?: number
    reconnectAttempts?: number
    validationDebounce?: number
  }
}

// =============================================================================
// CONTEXT CREATION (Following Cline's pattern)
// =============================================================================

const ConfigContext = createContext<ConfigContextValue | null>(null)

/**
 * Custom hook to use configuration context with comprehensive error handling
 * Adapted from Cline's useExtensionState pattern
 */
export function useConfig(): ConfigContextValue {
  const context = useContext(ConfigContext)
  if (!context) {
    throw new ReadyAIError(
      'useConfig must be used within a ConfigProvider',
      'CONTEXT_ERROR',
      500,
      { 
        component: 'useConfig',
        suggestion: 'Wrap your component with <ConfigProvider>'
      }
    )
  }
  return context
}

// =============================================================================
// INITIAL STATE (Adapted from Cline's patterns)
// =============================================================================

/**
 * Create initial configuration state with sensible defaults
 * Based on Cline's state initialization patterns
 */
function createInitialState(initialPhase: PhaseType = 'Phase0_StrategicCharter'): ReadyAIConfigState {
  const initialApiConfig: ApiConfiguration = {
    planModeApiProvider: 'claude-sonnet-4',
    actModeApiProvider: 'claude-sonnet-4',
    planModeApiKey: '',
    actModeApiKey: '',
    planModeBaseUrl: '',
    actModeBaseUrl: '',
    planModeModelId: 'claude-sonnet-4-20250514',
    actModeModelId: 'claude-sonnet-4-20250514',
    planModeModelInfo: {
      maxTokens: 8192,
      contextWindow: 200000,
      supportsImages: true,
      supportsPromptCache: true,
      inputPrice: 3.0,
      outputPrice: 15.0
    },
    actModeModelInfo: {
      maxTokens: 8192,
      contextWindow: 200000,
      supportsImages: true,
      supportsPromptCache: true,
      inputPrice: 3.0,
      outputPrice: 15.0
    }
  }

  return {
    apiConfiguration: initialApiConfig,
    phaseConfigurations: {},
    currentPhase: initialPhase,
    availableModels: {},
    providerStatus: {},
    validationState: {
      isValidating: false,
      validationResults: null,
      lastValidated: null,
      errors: []
    },
    connectionState: {
      isConnected: false,
      isReconnecting: false,
      reconnectAttempts: 0,
      lastConnectionAttempt: null,
      lastError: null
    },
    loadingStates: {
      configuration: false,
      validation: false,
      models: false,
      phaseConfig: false,
      templates: false,
      export: false,
      import: false,
      reset: false
    },
    templates: [],
    uiState: {
      expandedSections: new Set(['general']),
      showAdvanced: false,
      activeTab: 'general',
      notifications: []
    },
    history: {
      past: [],
      present: initialApiConfig,
      future: [],
      maxHistorySize: 50
    }
  }
}

// =============================================================================
// CONFIGURATION PROVIDER (Extensive adaptation of Cline's provider)
// =============================================================================

export function ConfigProvider({
  children,
  apiClient,
  initialPhase = 'Phase0_StrategicCharter',
  options = {}
}: ConfigProviderProps) {
  const {
    autoValidate = true,
    autoRefreshModels = true,
    enableHistory = true,
    maxHistorySize = 50,
    reconnectAttempts = 5,
    validationDebounce = 1000
  } = options

  // State management adapted from Cline's patterns
  const [state, setState] = useState<ReadyAIConfigState>(() => {
    const initial = createInitialState(initialPhase)
    return {
      ...initial,
      history: {
        ...initial.history,
        maxHistorySize
      }
    }
  })

  // API client management
  const apiClientRef = useRef<ConfigApiClient>(apiClient || getConfigApiClient())
  
  // Validation debouncing
  const validationTimeoutRef = useRef<NodeJS.Timeout>()
  const isInitialized = useRef(false)

  // =============================================================================
  // UTILITY FUNCTIONS (Adapted from Cline's helper patterns)
  // =============================================================================

  /**
   * Update state with proper immutability (Cline pattern)
   */
  const updateState = useCallback((updater: (prev: ReadyAIConfigState) => ReadyAIConfigState) => {
    setState(updater)
  }, [])

  /**
   * Update loading state for specific operation
   */
  const setLoading = useCallback((operation: keyof ReadyAIConfigState['loadingStates'], loading: boolean) => {
    updateState(prev => ({
      ...prev,
      loadingStates: {
        ...prev.loadingStates,
        [operation]: loading
      }
    }))
  }, [updateState])

  /**
   * Add configuration to history (for undo/redo functionality)
   */
  const addToHistory = useCallback((configuration: ApiConfiguration) => {
    if (!enableHistory) return

    updateState(prev => {
      const newPast = [...prev.history.past, prev.history.present].slice(-maxHistorySize)
      return {
        ...prev,
        history: {
          ...prev.history,
          past: newPast,
          present: configuration,
          future: []
        }
      }
    })
  }, [enableHistory, maxHistorySize, updateState])

  /**
   * Show notification with auto-dismiss (Cline pattern)
   */
  const showNotification = useCallback((notification: Omit<ReadyAIConfigState['uiState']['notifications'][0], 'id' | 'timestamp'>) => {
    const id = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const newNotification = {
      ...notification,
      id,
      timestamp: new Date().toISOString()
    }

    updateState(prev => ({
      ...prev,
      uiState: {
        ...prev.uiState,
        notifications: [...prev.uiState.notifications, newNotification]
      }
    }))

    // Auto-dismiss notification
    if (notification.duration !== 0) {
      const timeout = notification.duration || (notification.type === 'error' ? 8000 : 4000)
      setTimeout(() => {
        updateState(prev => ({
          ...prev,
          uiState: {
            ...prev.uiState,
            notifications: prev.uiState.notifications.filter(n => n.id !== id)
          }
        }))
      }, timeout)
    }
  }, [updateState])

  /**
   * Handle errors with proper context and user feedback
   */
  const handleError = useCallback((error: Error | ReadyAIError, context?: string) => {
    console.error(`ConfigContext Error${context ? ` (${context})` : ''}:`, error)

    const errorMessage = error instanceof ReadyAIError ? error.message : error.message
    const contextMessage = context ? `${context}: ${errorMessage}` : errorMessage

    updateState(prev => ({
      ...prev,
      connectionState: {
        ...prev.connectionState,
        lastError: errorMessage
      },
      validationState: {
        ...prev.validationState,
        errors: [...prev.validationState.errors, contextMessage]
      }
    }))

    showNotification({
      type: 'error',
      message: contextMessage,
      duration: 8000
    })
  }, [updateState, showNotification])

  // =============================================================================
  // CORE CONFIGURATION METHODS (Adapted from Cline's API patterns)
  // =============================================================================

  /**
   * Get current configuration from API
   */
  const getConfiguration = useCallback(async () => {
    try {
      setLoading('configuration', true)
      await handleApiResult(
        apiClientRef.current.getConfiguration(),
        (data) => {
          updateState(prev => ({
            ...prev,
            apiConfiguration: data,
            history: enableHistory ? {
              ...prev.history,
              present: data
            } : prev.history
          }))
          
          if (autoValidate) {
            // Debounced validation
            if (validationTimeoutRef.current) {
              clearTimeout(validationTimeoutRef.current)
            }
            validationTimeoutRef.current = setTimeout(() => {
              validateConfiguration()
            }, validationDebounce)
          }
        },
        (error) => handleError(new ReadyAIError(error.message, error.code), 'Loading configuration')
      )
    } catch (error) {
      handleError(error as Error, 'Loading configuration')
    } finally {
      setLoading('configuration', false)
    }
  }, [setLoading, updateState, enableHistory, autoValidate, validationDebounce, handleError])

  /**
   * Update configuration with validation and history
   */
  const updateConfiguration = useCallback(async (request: ConfigUpdateRequest, options?: ConfigRequestOptions) => {
    try {
      setLoading('configuration', true)
      
      // Add to history before update
      if (enableHistory) {
        addToHistory(state.apiConfiguration)
      }

      await handleApiResult(
        apiClientRef.current.updateConfiguration(request, options),
        (data) => {
          updateState(prev => ({
            ...prev,
            apiConfiguration: data,
            history: enableHistory ? {
              ...prev.history,
              present: data
            } : prev.history
          }))
          
          showNotification({
            type: 'success',
            message: 'Configuration updated successfully'
          })

          if (autoValidate) {
            setTimeout(() => validateConfiguration(), validationDebounce)
          }
        },
        (error) => handleError(new ReadyAIError(error.message, error.code), 'Updating configuration')
      )
    } catch (error) {
      handleError(error as Error, 'Updating configuration')
    } finally {
      setLoading('configuration', false)
    }
  }, [setLoading, enableHistory, addToHistory, state.apiConfiguration, updateState, showNotification, autoValidate, validationDebounce, handleError])

  /**
   * Validate current configuration
   */
  const validateConfiguration = useCallback(async (request?: ConfigValidationRequest) => {
    try {
      setLoading('validation', true)
      updateState(prev => ({
        ...prev,
        validationState: {
          ...prev.validationState,
          isValidating: true,
          errors: []
        }
      }))

      const validationRequest = request || {
        configuration: state.apiConfiguration,
        phaseConfigurations: state.phaseConfigurations,
        strict: true
      }

      await handleApiResult(
        apiClientRef.current.validateConfiguration(validationRequest),
        (data) => {
          updateState(prev => ({
            ...prev,
            validationState: {
              ...prev.validationState,
              isValidating: false,
              validationResults: data,
              lastValidated: new Date().toISOString(),
              errors: data.errors || []
            }
          }))

          if (data.isValid) {
            showNotification({
              type: 'success',
              message: 'Configuration is valid',
              duration: 3000
            })
          } else {
            showNotification({
              type: 'warning',
              message: `Configuration has ${data.errors?.length || 0} issues`,
              duration: 5000
            })
          }
        },
        (error) => handleError(new ReadyAIError(error.message, error.code), 'Validating configuration')
      )
    } catch (error) {
      handleError(error as Error, 'Validating configuration')
    } finally {
      setLoading('validation', false)
      updateState(prev => ({
        ...prev,
        validationState: {
          ...prev.validationState,
          isValidating: false
        }
      }))
    }
  }, [setLoading, updateState, state.apiConfiguration, state.phaseConfigurations, showNotification, handleError])

  /**
   * Reset configuration to defaults
   */
  const resetConfiguration = useCallback(async (scope: 'all' | 'api' | 'phases' = 'all') => {
    try {
      setLoading('reset', true)
      
      // Add to history before reset
      if (enableHistory) {
        addToHistory(state.apiConfiguration)
      }

      await handleApiResult(
        apiClientRef.current.resetConfiguration(scope),
        (data) => {
          updateState(prev => ({
            ...prev,
            apiConfiguration: data,
            phaseConfigurations: scope === 'all' || scope === 'phases' ? {} : prev.phaseConfigurations,
            history: enableHistory ? {
              ...prev.history,
              present: data
            } : prev.history
          }))
          
          showNotification({
            type: 'success',
            message: `Configuration reset successfully (${scope})`
          })
        },
        (error) => handleError(new ReadyAIError(error.message, error.code), 'Resetting configuration')
      )
    } catch (error) {
      handleError(error as Error, 'Resetting configuration')
    } finally {
      setLoading('reset', false)
    }
  }, [setLoading, enableHistory, addToHistory, state.apiConfiguration, updateState, showNotification, handleError])

  // =============================================================================
  // PHASE CONFIGURATION METHODS
  // =============================================================================

  /**
   * Get phase-specific configuration
   */
  const getPhaseConfiguration = useCallback(async (phase: PhaseType) => {
    try {
      setLoading('phaseConfig', true)
      await handleApiResult(
        apiClientRef.current.getPhaseConfiguration(phase),
        (data) => {
          updateState(prev => ({
            ...prev,
            phaseConfigurations: {
              ...prev.phaseConfigurations,
              [phase]: data
            }
          }))
        },
        (error) => handleError(new ReadyAIError(error.message, error.code), `Loading ${phase} configuration`)
      )
    } catch (error) {
      handleError(error as Error, `Loading ${phase} configuration`)
    } finally {
      setLoading('phaseConfig', false)
    }
  }, [setLoading, updateState, handleError])

  /**
   * Update phase-specific configuration
   */
  const updatePhaseConfiguration = useCallback(async (phase: PhaseType, configuration: Partial<PhaseConfiguration>) => {
    try {
      setLoading('phaseConfig', true)
      await handleApiResult(
        apiClientRef.current.updatePhaseConfiguration(phase, configuration),
        (data) => {
          updateState(prev => ({
            ...prev,
            phaseConfigurations: {
              ...prev.phaseConfigurations,
              [phase]: data
            }
          }))
          
          showNotification({
            type: 'success',
            message: `${phase} configuration updated successfully`
          })
        },
        (error) => handleError(new ReadyAIError(error.message, error.code), `Updating ${phase} configuration`)
      )
    } catch (error) {
      handleError(error as Error, `Updating ${phase} configuration`)
    } finally {
      setLoading('phaseConfig', false)
    }
  }, [setLoading, updateState, showNotification, handleError])

  /**
   * Switch to different phase
   */
  const switchToPhase = useCallback(async (phase: PhaseType) => {
    try {
      // Load phase configuration if not already loaded
      if (!state.phaseConfigurations[phase]) {
        await getPhaseConfiguration(phase)
      }

      updateState(prev => ({
        ...prev,
        currentPhase: phase
      }))

      showNotification({
        type: 'info',
        message: `Switched to ${phase}`,
        duration: 2000
      })
    } catch (error) {
      handleError(error as Error, `Switching to ${phase}`)
    }
  }, [state.phaseConfigurations, getPhaseConfiguration, updateState, showNotification, handleError])

  // =============================================================================
  // MODEL MANAGEMENT METHODS
  // =============================================================================

  /**
   * Refresh available models from providers
   */
  const refreshModels = useCallback(async (providers?: ApiProvider[]) => {
    try {
      setLoading('models', true)
      await handleApiResult(
        apiClientRef.current.refreshModelAvailability(providers),
        (data: ModelAvailabilityResponse) => {
          updateState(prev => ({
            ...prev,
            availableModels: data.models,
            providerStatus: data.providerStatus
          }))
          
          showNotification({
            type: 'success',
            message: 'Model availability refreshed',
            duration: 3000
          })
        },
        (error) => handleError(new ReadyAIError(error.message, error.code), 'Refreshing models')
      )
    } catch (error) {
      handleError(error as Error, 'Refreshing models')
    } finally {
      setLoading('models', false)
    }
  }, [setLoading, updateState, showNotification, handleError])

  /**
   * Get model information for specific provider and model
   */
  const getModelInfo = useCallback((provider: ApiProvider, modelId: string): ModelInfo | null => {
    return state.availableModels[provider]?.[modelId] || null
  }, [state.availableModels])

  // =============================================================================
  // TEMPLATE MANAGEMENT METHODS
  // =============================================================================

  /**
   * Load configuration templates
   */
  const loadTemplates = useCallback(async () => {
    try {
      setLoading('templates', true)
      await handleApiResult(
        apiClientRef.current.getConfigurationTemplates(),
        (data) => {
          updateState(prev => ({
            ...prev,
            templates: data
          }))
        },
        (error) => handleError(new ReadyAIError(error.message, error.code), 'Loading templates')
      )
    } catch (error) {
      handleError(error as Error, 'Loading templates')
    } finally {
      setLoading('templates', false)
    }
  }, [setLoading, updateState, handleError])

  /**
   * Apply configuration template
   */
  const applyTemplate = useCallback(async (templateId: string) => {
    try {
      const template = state.templates.find(t => t.id === templateId)
      if (!template) {
        throw new ReadyAIError(`Template ${templateId} not found`, 'TEMPLATE_NOT_FOUND')
      }

      // Add to history before applying template
      if (enableHistory) {
        addToHistory(state.apiConfiguration)
      }

      await updateConfiguration({
        configuration: template.configuration,
        reason: `Applied template: ${template.name}`
      })

      showNotification({
        type: 'success',
        message: `Template "${template.name}" applied successfully`
      })
    } catch (error) {
      handleError(error as Error, 'Applying template')
    }
  }, [state.templates, state.apiConfiguration, enableHistory, addToHistory, updateConfiguration, showNotification, handleError])

  /**
   * Save current configuration as template
   */
  const saveAsTemplate = useCallback(async (name: string, description?: string) => {
    try {
      const template: ConfigurationTemplate = {
        id: `template-${Date.now()}`,
        name,
        description: description || '',
        configuration: state.apiConfiguration,
        createdAt: new Date().toISOString()
      }

      // This would typically be handled by the API
      updateState(prev => ({
        ...prev,
        templates: [...prev.templates, template]
      }))

      showNotification({
        type: 'success',
        message: `Template "${name}" saved successfully`
      })
    } catch (error) {
      handleError(error as Error, 'Saving template')
    }
  }, [state.apiConfiguration, updateState, showNotification, handleError])

  // =============================================================================
  // IMPORT/EXPORT METHODS
  // =============================================================================

  /**
   * Export current configuration
   */
  const exportConfiguration = useCallback(async (format: 'json' | 'yaml' = 'json'): Promise<{ data: string; filename: string }> => {
    try {
      setLoading('export', true)
      return await new Promise((resolve) => {
        handleApiResult(
          apiClientRef.current.exportConfiguration(format),
          (data) => {
            showNotification({
              type: 'success',
              message: 'Configuration exported successfully',
              duration: 3000
            })
            resolve(data)
          },
          (error) => {
            handleError(new ReadyAIError(error.message, error.code), 'Exporting configuration')
            resolve({ data: '', filename: '' })
          }
        )
      })
    } catch (error) {
      handleError(error as Error, 'Exporting configuration')
      return { data: '', filename: '' }
    } finally {
      setLoading('export', false)
    }
  }, [setLoading, showNotification, handleError])

  /**
   * Import configuration from file or data
   */
  const importConfiguration = useCallback(async (data: string | File) => {
    try {
      setLoading('import', true)
      
      // Add to history before import
      if (enableHistory) {
        addToHistory(state.apiConfiguration)
      }

      await handleApiResult(
        apiClientRef.current.importConfiguration(data),
        (importedConfig) => {
          updateState(prev => ({
            ...prev,
            apiConfiguration: importedConfig,
            history: enableHistory ? {
              ...prev.history,
              present: importedConfig
            } : prev.history
          }))
          
          showNotification({
            type: 'success',
            message: 'Configuration imported successfully'
          })

          if (autoValidate) {
            setTimeout(() => validateConfiguration(), validationDebounce)
          }
        },
        (error) => handleError(new ReadyAIError(error.message, error.code), 'Importing configuration')
      )
    } catch (error) {
      handleError(error as Error, 'Importing configuration')
    } finally {
      setLoading('import', false)
    }
  }, [setLoading, enableHistory, addToHistory, state.apiConfiguration, updateState, showNotification, autoValidate, validationDebounce, validateConfiguration, handleError])

  // =============================================================================
  // HISTORY MANAGEMENT (Undo/Redo)
  // =============================================================================

  const undo = useCallback(() => {
    if (!enableHistory || state.history.past.length === 0) return

    updateState(prev => {
      const previous = prev.history.past[prev.history.past.length - 1]
      const newPast = prev.history.past.slice(0, -1)
      
      return {
        ...prev,
        apiConfiguration: previous,
        history: {
          ...prev.history,
          past: newPast,
          present: previous,
          future: [prev.history.present, ...prev.history.future].slice(0, maxHistorySize)
        }
      }
    })

    showNotification({
      type: 'info',
      message: 'Configuration restored',
      duration: 2000
    })
  }, [enableHistory, state.history.past.length, updateState, maxHistorySize, showNotification])

  const redo = useCallback(() => {
    if (!enableHistory || state.history.future.length === 0) return

    updateState(prev => {
      const next = prev.history.future[0]
      const newFuture = prev.history.future.slice(1)
      
      return {
        ...prev,
        apiConfiguration: next,
        history: {
          ...prev.history,
          past: [...prev.history.past, prev.history.present].slice(-maxHistorySize),
          present: next,
          future: newFuture
        }
      }
    })

    showNotification({
      type: 'info',
      message: 'Configuration restored',
      duration: 2000
    })
  }, [enableHistory, state.history.future.length, updateState, maxHistorySize, showNotification])

  const canUndo = useMemo(() => enableHistory && state.history.past.length > 0, [enableHistory, state.history.past.length])
  const canRedo = useMemo(() => enableHistory && state.history.future.length > 0, [enableHistory, state.history.future.length])

  // =============================================================================
  // UI STATE MANAGEMENT
  // =============================================================================

  const toggleSection = useCallback((sectionId: string) => {
    updateState(prev => {
      const newExpanded = new Set(prev.uiState.expandedSections)
      if (newExpanded.has(sectionId)) {
        newExpanded.delete(sectionId)
      } else {
        newExpanded.add(sectionId)
      }
      
      return {
        ...prev,
        uiState: {
          ...prev.uiState,
          expandedSections: newExpanded
        }
      }
    })
  }, [updateState])

  const setActiveTab = useCallback((tab: ReadyAIConfigState['uiState']['activeTab']) => {
    updateState(prev => ({
      ...prev,
      uiState: {
        ...prev.uiState,
        activeTab: tab
      }
    }))
  }, [updateState])

  const dismissNotification = useCallback((id: string) => {
    updateState(prev => ({
      ...prev,
      uiState: {
        ...prev.uiState,
        notifications: prev.uiState.notifications.filter(n => n.id !== id)
      }
    }))
  }, [updateState])

  const setShowAdvanced = useCallback((show: boolean) => {
    updateState(prev => ({
      ...prev,
      uiState: {
        ...prev.uiState,
        showAdvanced: show
      }
    }))
  }, [updateState])

  // =============================================================================
  // CONNECTION MANAGEMENT
  // =============================================================================

  const reconnect = useCallback(async () => {
    updateState(prev => ({
      ...prev,
      connectionState: {
        ...prev.connectionState,
        isReconnecting: true,
        reconnectAttempts: prev.connectionState.reconnectAttempts + 1,
        lastConnectionAttempt: new Date().toISOString()
      }
    }))

    try {
      // Test connection by fetching configuration
      await getConfiguration()
      
      updateState(prev => ({
        ...prev,
        connectionState: {
          ...prev.connectionState,
          isConnected: true,
          isReconnecting: false,
          lastError: null
        }
      }))

      showNotification({
        type: 'success',
        message: 'Successfully reconnected to configuration service',
        duration: 3000
      })
    } catch (error) {
      updateState(prev => ({
        ...prev,
        connectionState: {
          ...prev.connectionState,
          isConnected: false,
          isReconnecting: false,
          lastError: error instanceof Error ? error.message : 'Unknown error'
        }
      }))

      handleError(error as Error, 'Reconnection failed')
    }
  }, [updateState, getConfiguration, showNotification, handleError])

  const disconnect = useCallback(() => {
    apiClientRef.current.disconnect()
    
    updateState(prev => ({
      ...prev,
      connectionState: {
        ...prev.connectionState,
        isConnected: false,
        isReconnecting: false,
        reconnectAttempts: 0,
        lastConnectionAttempt: null,
        lastError: null
      }
    }))

    showNotification({
      type: 'info',
      message: 'Disconnected from configuration service',
      duration: 3000
    })
  }, [updateState, showNotification])

  // =============================================================================
  // ERROR MANAGEMENT
  // =============================================================================

  const clearErrors = useCallback(() => {
    updateState(prev => ({
      ...prev,
      connectionState: {
        ...prev.connectionState,
        lastError: null
      },
      validationState: {
        ...prev.validationState,
        errors: []
      }
    }))
  }, [updateState])

  // =============================================================================
  // EFFECTS (Adapted from Cline's initialization patterns)
  // =============================================================================

  /**
   * Initialize configuration context
   * Follows Cline's comprehensive initialization pattern
   */
  useEffect(() => {
    if (isInitialized.current) return
    
    const initializeConfig = async () => {
      try {
        // Load initial configuration
        await getConfiguration()
        
        // Auto-refresh models if enabled
        if (autoRefreshModels) {
          await refreshModels()
        }
        
        // Load templates
        await loadTemplates()
        
        // Mark as initialized
        isInitialized.current = true
        
        updateState(prev => ({
          ...prev,
          connectionState: {
            ...prev.connectionState,
            isConnected: true
          }
        }))

        showNotification({
          type: 'success',
          message: 'Configuration loaded successfully',
          duration: 3000
        })
      } catch (error) {
        handleError(error as Error, 'Initializing configuration')
      }
    }

    initializeConfig()
  }, [getConfiguration, autoRefreshModels, refreshModels, loadTemplates, updateState, showNotification, handleError])

  /**
   * Set up WebSocket event listeners (adapted from Cline's real-time patterns)
   */
  useEffect(() => {
    const client = apiClientRef.current

    // Connection status updates
    const unsubscribeConnection = client.on('connection-status', (connected: boolean) => {
      updateState(prev => ({
        ...prev,
        connectionState: {
          ...prev.connectionState,
          isConnected: connected
        }
      }))
    })

    // Configuration updates
    const unsubscribeConfigUpdate = client.on('config-updated', (config: ApiConfiguration) => {
      updateState(prev => ({
        ...prev,
        apiConfiguration: config,
        history: enableHistory ? {
          ...prev.history,
          present: config
        } : prev.history
      }))
      
      showNotification({
        type: 'info',
        message: 'Configuration updated remotely',
        duration: 4000
      })
    })

    // Validation completed
    const unsubscribeValidation = client.on('validation-completed', (results: ConfigurationValidationResult) => {
      updateState(prev => ({
        ...prev,
        validationState: {
          ...prev.validationState,
          validationResults: results,
          lastValidated: new Date().toISOString()
        }
      }))
    })

    // Model availability changes
    const unsubscribeModelUpdate = client.on('model-availability-changed', (data: ModelAvailabilityResponse) => {
      updateState(prev => ({
        ...prev,
        availableModels: data.models,
        providerStatus: data.providerStatus
      }))
    })

    // Error events
    const unsubscribeError = client.on('error-occurred', (error: { message: string }) => {
      handleError(new ReadyAIError(error.message, 'WEBSOCKET_ERROR'), 'Real-time update')
    })

    // Cleanup on unmount
    return () => {
      unsubscribeConnection()
      unsubscribeConfigUpdate()
      unsubscribeValidation()
      unsubscribeModelUpdate()
      unsubscribeError()
    }
  }, [updateState, enableHistory, showNotification, handleError])

  /**
   * Auto-reconnection logic (adapted from Cline's patterns)
   */
  useEffect(() => {
    if (!state.connectionState.isConnected && 
        !state.connectionState.isReconnecting &&
        state.connectionState.reconnectAttempts < reconnectAttempts &&
        state.connectionState.lastError) {
      
      const timeout = Math.min(1000 * Math.pow(2, state.connectionState.reconnectAttempts), 30000)
      
      const timer = setTimeout(() => {
        reconnect()
      }, timeout)

      return () => clearTimeout(timer)
    }
  }, [state.connectionState, reconnectAttempts, reconnect])

  // =============================================================================
  // CONTEXT VALUE ASSEMBLY
  // =============================================================================

  const contextValue: ConfigContextValue = useMemo(() => ({
    // State
    state,
    
    // Core configuration methods
    getConfiguration,
    updateConfiguration,
    validateConfiguration,
    resetConfiguration,
    
    // Phase-specific methods
    getPhaseConfiguration,
    updatePhaseConfiguration,
    switchToPhase,
    
    // Model management
    refreshModels,
    getModelInfo,
    
    // Template management
    loadTemplates,
    applyTemplate,
    saveAsTemplate,
    
    // Import/Export
    exportConfiguration,
    importConfiguration,
    
    // History management
    undo,
    redo,
    canUndo,
    canRedo,
    
    // UI state management
    toggleSection,
    setActiveTab,
    showNotification,
    dismissNotification,
    setShowAdvanced,
    
    // Connection management
    reconnect,
    disconnect,
    
    // Error handling
    clearErrors,
    handleError
  }), [
    state,
    getConfiguration,
    updateConfiguration,
    validateConfiguration,
    resetConfiguration,
    getPhaseConfiguration,
    updatePhaseConfiguration,
    switchToPhase,
    refreshModels,
    getModelInfo,
    loadTemplates,
    applyTemplate,
    saveAsTemplate,
    exportConfiguration,
    importConfiguration,
    undo,
    redo,
    canUndo,
    canRedo,
    toggleSection,
    setActiveTab,
    showNotification,
    dismissNotification,
    setShowAdvanced,
    reconnect,
    disconnect,
    clearErrors,
    handleError
  ])

  // =============================================================================
  // PROVIDER RENDER
  // =============================================================================

  return (
    <ConfigContext.Provider value={contextValue}>
      {children}
    </ConfigContext.Provider>
  )
}

// =============================================================================
// EXPORTS
// =============================================================================

export default ConfigProvider
export type {
  ReadyAIConfigState,
  ConfigContextValue,
  ConfigProviderProps
}

/**
 * Version information for the configuration context
 */
export const CONFIG_CONTEXT_VERSION = '1.0.0'

/**
 * Hook to get configuration loading states
 */
export function useConfigLoadingStates() {
  const { state } = useConfig()
  return state.loadingStates
}

/**
 * Hook to get configuration validation state
 */
export function useConfigValidation() {
  const { state, validateConfiguration } = useConfig()
  return {
    ...state.validationState,
    validate: validateConfiguration
  }
}

/**
 * Hook to get configuration connection state
 */
export function useConfigConnection() {
  const { state, reconnect, disconnect } = useConfig()
  return {
    ...state.connectionState,
    reconnect,
    disconnect
  }
}

/**
 * Hook to get configuration UI state
 */
export function useConfigUI() {
  const { 
    state, 
    toggleSection, 
    setActiveTab, 
    showNotification, 
    dismissNotification, 
    setShowAdvanced 
  } = useConfig()
  
  return {
    ...state.uiState,
    toggleSection,
    setActiveTab,
    showNotification,
    dismissNotification,
    setShowAdvanced
  }
}
