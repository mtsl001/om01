// packages/ui/hooks/useErrorHandler.ts

/**
 * ReadyAI Error Handler Hook
 * 
 * Production-ready error handling hook adapted from Cline's comprehensive error management
 * patterns. Provides centralized error handling, user notifications, recovery mechanisms,
 * and integration with ReadyAI's error handling system and ErrorBoundary components.
 * 
 * Extracted and enhanced from Cline's error handling patterns with ReadyAI-specific features:
 * - Integration with DetailedReadyAIError system
 * - Phase-aware error handling for development lifecycle
 * - Context management error handling
 * - Enhanced user notification strategies
 * - Automatic error recovery mechanisms
 * - Comprehensive error telemetry and logging
 * 
 * @version 1.1.0 - Production Ready
 * @author ReadyAI Development Team
 */

import { useCallback, useRef, useState, useEffect, useMemo } from 'react'
import { 
  DetailedReadyAIError, 
  ErrorCategory, 
  ErrorSeverity, 
  RecoveryStrategy,
  ErrorFactory,
  isDetailedReadyAIError,
  isRetryableError,
  DEFAULT_RETRY_CONFIG
} from '../../error-handling/types/error.js'
import { useLogger } from './useLogger.js'
import type { 
  UUID, 
  PhaseType, 
  ReadyAIError 
} from '../../foundation/types/core.js'

// =============================================================================
// HOOK INTERFACES AND TYPES
// =============================================================================

/**
 * Error handler configuration options
 * Provides comprehensive customization for error handling behavior
 */
export interface UseErrorHandlerOptions {
  /** Component or context identifier for error correlation */
  context?: string
  
  /** Current project phase for phase-aware error handling */
  currentPhase?: PhaseType
  
  /** Enable automatic error recovery attempts */
  enableAutoRecovery?: boolean
  
  /** Enable user notifications for errors */
  enableNotifications?: boolean
  
  /** Default error notification display duration in milliseconds */
  notificationDuration?: number
  
  /** Custom error message formatter */
  formatErrorMessage?: (error: DetailedReadyAIError) => string
  
  /** Custom recovery action handlers */
  recoveryHandlers?: Record<RecoveryStrategy, () => void | Promise<void>>
  
  /** Maximum automatic retry attempts */
  maxAutoRetries?: number
  
  /** Base delay for retry attempts in milliseconds */
  retryDelay?: number
  
  /** Enable error boundary integration */
  enableErrorBoundary?: boolean
  
  /** Callback for unhandled errors */
  onUnhandledError?: (error: DetailedReadyAIError) => void
  
  /** Filter function to determine which errors to handle */
  errorFilter?: (error: Error | ReadyAIError) => boolean
}

/**
 * Error state interface for tracking error information
 */
export interface ErrorState {
  /** Current error being handled */
  currentError: DetailedReadyAIError | null
  
  /** Whether error handling is in progress */
  isHandlingError: boolean
  
  /** Current retry attempt number */
  retryAttempt: number
  
  /** Maximum retry attempts for current error */
  maxRetries: number
  
  /** Error history for the session */
  errorHistory: DetailedReadyAIError[]
  
  /** Whether auto-recovery is active */
  isRecovering: boolean
  
  /** Last recovery attempt timestamp */
  lastRecoveryAttempt: number | null
  
  /** Recovery success count */
  recoverySuccessCount: number
  
  /** Recovery failure count */
  recoveryFailureCount: number
}

/**
 * User notification interface for error display
 */
export interface ErrorNotification {
  /** Unique notification ID */
  id: UUID
  
  /** Error that triggered the notification */
  error: DetailedReadyAIError
  
  /** Notification message */
  message: string
  
  /** Notification type based on error severity */
  type: 'error' | 'warning' | 'info'
  
  /** Whether notification is dismissible */
  dismissible: boolean
  
  /** Notification duration in milliseconds */
  duration: number
  
  /** Available actions for the notification */
  actions?: Array<{
    label: string
    action: () => void | Promise<void>
    isPrimary?: boolean
  }>
}

/**
 * Error handler return interface
 * Comprehensive error handling capabilities with recovery mechanisms
 */
export interface UseErrorHandlerReturn {
  // Core error handling functions
  handleError: (error: Error | ReadyAIError | DetailedReadyAIError) => void
  handleAsyncError: (error: Error | ReadyAIError | DetailedReadyAIError) => Promise<void>
  
  // Error state management
  clearError: () => void
  clearErrorHistory: () => void
  retryLastOperation: () => Promise<void>
  
  // Recovery mechanisms
  attemptRecovery: (strategy?: RecoveryStrategy) => Promise<boolean>
  resetErrorState: () => void
  
  // Notification management
  showErrorNotification: (error: DetailedReadyAIError, options?: Partial<ErrorNotification>) => UUID
  dismissNotification: (notificationId: UUID) => void
  clearAllNotifications: () => void
  
  // Error state and information
  errorState: ErrorState
  notifications: ErrorNotification[]
  hasActiveError: boolean
  canRetry: boolean
  
  // Error utilities
  isErrorCategory: (category: ErrorCategory) => boolean
  getErrorSeverity: () => ErrorSeverity | null
  getRecoveryStrategy: () => RecoveryStrategy | null
  
  // Error boundary integration
  reportToBoundary: (error: DetailedReadyAIError) => void
  captureErrorContext: () => Record<string, any>
}

/**
 * Internal retry state for managing retry attempts
 */
interface RetryState {
  retryCount: number
  lastRetryTime: number
  retryTimeoutId: NodeJS.Timeout | null
  maxRetries: number
  baseDelay: number
}

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

/**
 * ReadyAI Error Handler Hook
 * 
 * Provides comprehensive error handling capabilities adapted from Cline's proven patterns,
 * with ReadyAI-specific enhancements for phase-aware error handling, context management,
 * and seamless integration with the ErrorBoundary system.
 * 
 * @param options - Error handler configuration options
 * @returns Comprehensive error handling interface
 */
export function useErrorHandler(options: UseErrorHandlerOptions = {}): UseErrorHandlerReturn {
  const {
    context = 'unknown',
    currentPhase,
    enableAutoRecovery = true,
    enableNotifications = true,
    notificationDuration = 5000,
    formatErrorMessage,
    recoveryHandlers = {},
    maxAutoRetries = 3,
    retryDelay = 1000,
    enableErrorBoundary = true,
    onUnhandledError,
    errorFilter = () => true
  } = options

  // Initialize logger for error tracking
  const logger = useLogger({
    source: `error-handler.${context}`,
    currentPhase,
    performanceTracking: false
  })

  // Error state management
  const [errorState, setErrorState] = useState<ErrorState>({
    currentError: null,
    isHandlingError: false,
    retryAttempt: 0,
    maxRetries: 0,
    errorHistory: [],
    isRecovering: false,
    lastRecoveryAttempt: null,
    recoverySuccessCount: 0,
    recoveryFailureCount: 0
  })

  // Notification state management
  const [notifications, setNotifications] = useState<ErrorNotification[]>([])

  // Retry state management
  const retryStateRef = useRef<RetryState>({
    retryCount: 0,
    lastRetryTime: 0,
    retryTimeoutId: null,
    maxRetries: maxAutoRetries,
    baseDelay: retryDelay
  })

  // Last operation callback for retry functionality
  const lastOperationRef = useRef<(() => void | Promise<void>) | null>(null)

  // Error context capture
  const errorContextRef = useRef<Record<string, any>>({})

  // Memoized error severity and recovery strategy
  const { currentSeverity, currentRecoveryStrategy } = useMemo(() => {
    if (!errorState.currentError) {
      return { currentSeverity: null, currentRecoveryStrategy: null }
    }

    return {
      currentSeverity: errorState.currentError.details.severity,
      currentRecoveryStrategy: errorState.currentError.details.recoveryStrategy
    }
  }, [errorState.currentError])

  // Enhanced error message formatter
  const formatMessage = useCallback((error: DetailedReadyAIError): string => {
    if (formatErrorMessage) {
      return formatErrorMessage(error)
    }

    // Default formatting logic adapted from Cline
    const userMessage = error.details.userMessage || error.message
    const category = error.details.category
    const operation = error.details.operation

    if (operation) {
      return `Failed to ${operation}: ${userMessage}`
    }

    // Category-specific formatting
    switch (category) {
      case ErrorCategory.API_PROVIDER:
        return `AI Provider Error: ${userMessage}`
      case ErrorCategory.AUTHENTICATION:
        return `Authentication Error: ${userMessage}`
      case ErrorCategory.CONTEXT_MANAGEMENT:
        return `Context Management Error: ${userMessage}`
      case ErrorCategory.FILESYSTEM:
        return `File Operation Error: ${userMessage}`
      case ErrorCategory.PHASE_MANAGEMENT:
        return `Phase Error: ${userMessage}`
      default:
        return userMessage
    }
  }, [formatErrorMessage])

  // Create error notification with enhanced details
  const createErrorNotification = useCallback((
    error: DetailedReadyAIError,
    overrides: Partial<ErrorNotification> = {}
  ): ErrorNotification => {
    const notificationId = crypto.randomUUID()
    const message = formatMessage(error)
    
    // Determine notification type based on severity
    let notificationType: 'error' | 'warning' | 'info'
    switch (error.details.severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        notificationType = 'error'
        break
      case ErrorSeverity.MEDIUM:
        notificationType = 'warning'
        break
      default:
        notificationType = 'info'
        break
    }

    // Build available actions based on error properties
    const actions: ErrorNotification['actions'] = []

    // Add retry action if error is retryable
    if (error.isRetryable() && lastOperationRef.current) {
      actions.push({
        label: 'Retry',
        action: async () => {
          await retryLastOperation()
          dismissNotification(notificationId)
        },
        isPrimary: true
      })
    }

    // Add recovery action if recovery strategy is available
    const recoveryStrategy = error.getRecoveryStrategy()
    if (recoveryStrategy !== RecoveryStrategy.NONE && recoveryStrategy !== RecoveryStrategy.ESCALATE) {
      actions.push({
        label: 'Attempt Recovery',
        action: async () => {
          const success = await attemptRecovery(recoveryStrategy)
          if (success) {
            dismissNotification(notificationId)
          }
        }
      })
    }

    return {
      id: notificationId,
      error,
      message,
      type: notificationType,
      dismissible: true,
      duration: notificationDuration,
      actions,
      ...overrides
    }
  }, [formatMessage, notificationDuration])

  // Enhanced error conversion with context awareness
  const convertToDetailedError = useCallback((error: Error | ReadyAIError): DetailedReadyAIError => {
    // Return if already a DetailedReadyAIError
    if (isDetailedReadyAIError(error)) {
      return error
    }

    // Try to determine error category based on error patterns
    let category = ErrorCategory.SYSTEM
    let severity = ErrorSeverity.MEDIUM
    let recoveryStrategy = RecoveryStrategy.NONE

    const message = error.message?.toLowerCase() || ''

    // Pattern matching for error categorization (adapted from Cline)
    if (message.includes('auth') || message.includes('unauthorized') || message.includes('forbidden')) {
      category = ErrorCategory.AUTHENTICATION
      severity = ErrorSeverity.HIGH
      recoveryStrategy = RecoveryStrategy.ESCALATE
    } else if (message.includes('network') || message.includes('timeout') || message.includes('connection')) {
      category = ErrorCategory.NETWORK
      severity = ErrorSeverity.MEDIUM
      recoveryStrategy = RecoveryStrategy.RETRY
    } else if (message.includes('file') || message.includes('path') || message.includes('permission')) {
      category = ErrorCategory.FILESYSTEM
      severity = ErrorSeverity.MEDIUM
      recoveryStrategy = RecoveryStrategy.RETRY_WITH_FALLBACK
    } else if (message.includes('context') || message.includes('embedding') || message.includes('vector')) {
      category = ErrorCategory.CONTEXT_MANAGEMENT
      severity = ErrorSeverity.MEDIUM
      recoveryStrategy = RecoveryStrategy.RETRY_WITH_FALLBACK
    } else if (currentPhase && (message.includes('phase') || message.includes('transition'))) {
      category = ErrorCategory.PHASE_MANAGEMENT
      severity = ErrorSeverity.HIGH
      recoveryStrategy = RecoveryStrategy.RESET
    }

    // Create appropriate error using factory
    switch (category) {
      case ErrorCategory.AUTHENTICATION:
        return ErrorFactory.createAuthError(
          'UNKNOWN_ERROR' as any,
          error.message,
          {
            category,
            severity,
            recoveryStrategy,
            source: context,
            operation: 'unknown',
            retryable: recoveryStrategy === RecoveryStrategy.RETRY,
            technicalDetails: {
              originalError: error,
              stack: error.stack,
              context: errorContextRef.current
            }
          }
        )

      case ErrorCategory.CONTEXT_MANAGEMENT:
        return ErrorFactory.createContextError(
          'UNKNOWN_ERROR' as any,
          error.message,
          {
            source: context,
            operation: 'unknown',
            technicalDetails: {
              originalError: error,
              stack: error.stack,
              context: errorContextRef.current
            }
          }
        )

      case ErrorCategory.FILESYSTEM:
        return ErrorFactory.createFilesystemError(
          'UNKNOWN_ERROR' as any,
          'unknown',
          'unknown',
          error.message,
          {
            source: context,
            technicalDetails: {
              originalError: error,
              stack: error.stack,
              context: errorContextRef.current
            }
          }
        )

      case ErrorCategory.PHASE_MANAGEMENT:
        return ErrorFactory.createPhaseError(
          'UNKNOWN_ERROR' as any,
          currentPhase || 'unknown',
          error.message,
          {
            source: context,
            technicalDetails: {
              originalError: error,
              stack: error.stack,
              context: errorContextRef.current
            }
          }
        )

      default:
        // Generic error
        return new DetailedReadyAIError({
          errorId: crypto.randomUUID(),
          category,
          severity,
          recoveryStrategy,
          timestamp: new Date().toISOString(),
          retryable: recoveryStrategy === RecoveryStrategy.RETRY,
          source: context,
          operation: 'unknown',
          userMessage: error.message,
          technicalDetails: {
            originalError: error,
            stack: error.stack,
            context: errorContextRef.current
          }
        } as any)
    }
  }, [context, currentPhase])

  // Core error handling function
  const handleError = useCallback((error: Error | ReadyAIError | DetailedReadyAIError) => {
    try {
      // Apply error filter
      if (!errorFilter(error as Error | ReadyAIError)) {
        return
      }

      const detailedError = convertToDetailedError(error as Error | ReadyAIError)

      // Log error with comprehensive details
      logger.error('Error handled by useErrorHandler', detailedError, {
        category: 'error_handling',
        errorId: detailedError.details.errorId,
        severity: detailedError.details.severity,
        recoveryStrategy: detailedError.details.recoveryStrategy,
        context,
        currentPhase,
        retryable: detailedError.details.retryable
      })

      // Update error state
      setErrorState(prev => ({
        ...prev,
        currentError: detailedError,
        isHandlingError: true,
        retryAttempt: 0,
        maxRetries: detailedError.getRetryConfig()?.maxRetries || 0,
        errorHistory: [...prev.errorHistory, detailedError].slice(-10) // Keep last 10 errors
      }))

      // Show notification if enabled
      if (enableNotifications) {
        const notification = createErrorNotification(detailedError)
        setNotifications(prev => [...prev, notification])

        // Auto-dismiss notification after duration
        setTimeout(() => {
          dismissNotification(notification.id)
        }, notification.duration)
      }

      // Attempt automatic recovery if enabled and appropriate
      if (enableAutoRecovery && detailedError.isRetryable()) {
        setTimeout(() => {
          attemptRecovery(detailedError.getRecoveryStrategy())
        }, 100) // Small delay to allow UI to update
      }

      // Report to error boundary if enabled
      if (enableErrorBoundary) {
        // Throw error to trigger error boundary (will be caught by nearest boundary)
        setTimeout(() => {
          throw detailedError
        }, 0)
      }

      // Call unhandled error callback
      if (onUnhandledError) {
        try {
          onUnhandledError(detailedError)
        } catch (callbackError) {
          logger.error('Error in unhandled error callback', callbackError as Error)
        }
      }

    } catch (handlingError) {
      // Fallback error handling to prevent infinite loops
      logger.fatal('Critical error in error handler', handlingError as Error, {
        originalError: error,
        context: 'error_handler_failure'
      })
      
      console.error('Critical error in useErrorHandler:', handlingError)
    }
  }, [
    errorFilter,
    convertToDetailedError,
    logger,
    context,
    currentPhase,
    enableNotifications,
    createErrorNotification,
    enableAutoRecovery,
    enableErrorBoundary,
    onUnhandledError
  ])

  // Async error handling wrapper
  const handleAsyncError = useCallback(async (error: Error | ReadyAIError | DetailedReadyAIError) => {
    return new Promise<void>((resolve) => {
      handleError(error)
      resolve()
    })
  }, [handleError])

  // Clear current error
  const clearError = useCallback(() => {
    setErrorState(prev => ({
      ...prev,
      currentError: null,
      isHandlingError: false,
      retryAttempt: 0,
      maxRetries: 0,
      isRecovering: false
    }))

    // Clear retry timeout if active
    if (retryStateRef.current.retryTimeoutId) {
      clearTimeout(retryStateRef.current.retryTimeoutId)
      retryStateRef.current.retryTimeoutId = null
    }

    logger.debug('Error state cleared', { context })
  }, [logger, context])

  // Clear error history
  const clearErrorHistory = useCallback(() => {
    setErrorState(prev => ({
      ...prev,
      errorHistory: []
    }))

    logger.debug('Error history cleared', { context })
  }, [logger, context])

  // Retry last operation
  const retryLastOperation = useCallback(async (): Promise<void> => {
    if (!lastOperationRef.current || !errorState.currentError) {
      logger.warn('No operation to retry', { context })
      return
    }

    if (!errorState.currentError.isRetryable()) {
      logger.warn('Current error is not retryable', { 
        errorId: errorState.currentError.details.errorId,
        context
      })
      return
    }

    const retryConfig = errorState.currentError.getRetryConfig()
    if (!retryConfig) {
      logger.warn('No retry configuration available', { context })
      return
    }

    if (errorState.retryAttempt >= retryConfig.maxRetries) {
      logger.warn('Maximum retry attempts exceeded', {
        retryAttempt: errorState.retryAttempt,
        maxRetries: retryConfig.maxRetries,
        context
      })
      return
    }

    try {
      setErrorState(prev => ({
        ...prev,
        retryAttempt: prev.retryAttempt + 1,
        isRecovering: true
      }))

      logger.info(`Retrying operation (attempt ${errorState.retryAttempt + 1}/${retryConfig.maxRetries})`, {
        errorId: errorState.currentError.details.errorId,
        context
      })

      // Execute retry with exponential backoff
      const delay = retryConfig.delay * Math.pow(2, errorState.retryAttempt)
      await new Promise(resolve => setTimeout(resolve, delay))

      await lastOperationRef.current()

      // Success - clear error
      clearError()

      setErrorState(prev => ({
        ...prev,
        recoverySuccessCount: prev.recoverySuccessCount + 1,
        isRecovering: false
      }))

      logger.info('Operation retry successful', { context })

    } catch (retryError) {
      setErrorState(prev => ({
        ...prev,
        recoveryFailureCount: prev.recoveryFailureCount + 1,
        isRecovering: false
      }))

      logger.error('Operation retry failed', retryError as Error, {
        retryAttempt: errorState.retryAttempt + 1,
        context
      })

      // Handle the retry error
      handleError(retryError as Error)
    }
  }, [errorState, logger, context, clearError, handleError])

  // Attempt recovery using specific strategy
  const attemptRecovery = useCallback(async (strategy?: RecoveryStrategy): Promise<boolean> => {
    if (!errorState.currentError) {
      return false
    }

    const recoveryStrategy = strategy || errorState.currentError.getRecoveryStrategy()

    if (recoveryStrategy === RecoveryStrategy.NONE || recoveryStrategy === RecoveryStrategy.ESCALATE) {
      return false
    }

    try {
      setErrorState(prev => ({
        ...prev,
        isRecovering: true,
        lastRecoveryAttempt: Date.now()
      }))

      logger.info('Attempting error recovery', {
        strategy: recoveryStrategy,
        errorId: errorState.currentError.details.errorId,
        context
      })

      // Try custom recovery handler first
      const customHandler = recoveryHandlers[recoveryStrategy]
      if (customHandler) {
        await customHandler()
        clearError()
        
        setErrorState(prev => ({
          ...prev,
          recoverySuccessCount: prev.recoverySuccessCount + 1,
          isRecovering: false
        }))

        logger.info('Custom recovery handler successful', { strategy: recoveryStrategy, context })
        return true
      }

      // Default recovery strategies adapted from Cline
      switch (recoveryStrategy) {
        case RecoveryStrategy.RETRY:
          await retryLastOperation()
          return true

        case RecoveryStrategy.RETRY_WITH_FALLBACK:
          // Try retry first, then fallback
          try {
            await retryLastOperation()
            return true
          } catch {
            // Implement fallback logic here
            logger.info('Retry failed, implementing fallback', { context })
            clearError()
            return true
          }

        case RecoveryStrategy.SKIP:
          // Skip the operation and continue
          clearError()
          logger.info('Skipped failed operation', { context })
          return true

        case RecoveryStrategy.RESET:
          // Reset to clean state
          clearError()
          clearErrorHistory()
          logger.info('Reset error state', { context })
          return true

        case RecoveryStrategy.DEGRADE:
          // Continue with reduced functionality
          clearError()
          logger.info('Continuing with degraded functionality', { context })
          return true

        default:
          logger.warn('Unknown recovery strategy', { strategy: recoveryStrategy, context })
          return false
      }

    } catch (recoveryError) {
      setErrorState(prev => ({
        ...prev,
        recoveryFailureCount: prev.recoveryFailureCount + 1,
        isRecovering: false
      }))

      logger.error('Recovery attempt failed', recoveryError as Error, {
        strategy: recoveryStrategy,
        context
      })

      return false
    }
  }, [
    errorState.currentError,
    recoveryHandlers,
    logger,
    context,
    clearError,
    retryLastOperation,
    clearErrorHistory
  ])

  // Reset complete error state
  const resetErrorState = useCallback(() => {
    // Clear all timeouts
    if (retryStateRef.current.retryTimeoutId) {
      clearTimeout(retryStateRef.current.retryTimeoutId)
    }

    // Reset all state
    setErrorState({
      currentError: null,
      isHandlingError: false,
      retryAttempt: 0,
      maxRetries: 0,
      errorHistory: [],
      isRecovering: false,
      lastRecoveryAttempt: null,
      recoverySuccessCount: 0,
      recoveryFailureCount: 0
    })

    setNotifications([])

    retryStateRef.current = {
      retryCount: 0,
      lastRetryTime: 0,
      retryTimeoutId: null,
      maxRetries: maxAutoRetries,
      baseDelay: retryDelay
    }

    lastOperationRef.current = null
    errorContextRef.current = {}

    logger.info('Error handler state reset completely', { context })
  }, [maxAutoRetries, retryDelay, logger, context])

  // Show error notification
  const showErrorNotification = useCallback((
    error: DetailedReadyAIError,
    options: Partial<ErrorNotification> = {}
  ): UUID => {
    const notification = createErrorNotification(error, options)
    
    setNotifications(prev => [...prev, notification])
    
    logger.debug('Error notification displayed', {
      notificationId: notification.id,
      errorId: error.details.errorId,
      context
    })

    return notification.id
  }, [createErrorNotification, logger, context])

  // Dismiss notification
  const dismissNotification = useCallback((notificationId: UUID) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId))
    
    logger.debug('Notification dismissed', { notificationId, context })
  }, [logger, context])

  // Clear all notifications
  const clearAllNotifications = useCallback(() => {
    setNotifications([])
    logger.debug('All notifications cleared', { context })
  }, [logger, context])

  // Check if error belongs to specific category
  const isErrorCategory = useCallback((category: ErrorCategory): boolean => {
    return errorState.currentError?.isCategory(category) ?? false
  }, [errorState.currentError])

  // Get current error severity
  const getErrorSeverity = useCallback((): ErrorSeverity | null => {
    return currentSeverity
  }, [currentSeverity])

  // Get current recovery strategy
  const getRecoveryStrategy = useCallback((): RecoveryStrategy | null => {
    return currentRecoveryStrategy
  }, [currentRecoveryStrategy])

  // Report error to boundary
  const reportToBoundary = useCallback((error: DetailedReadyAIError) => {
    if (enableErrorBoundary) {
      // This will be caught by the nearest ErrorBoundary
      throw error
    }
  }, [enableErrorBoundary])

  // Capture current error context
  const captureErrorContext = useCallback((): Record<string, any> => {
    const contextData = {
      timestamp: new Date().toISOString(),
      context,
      currentPhase,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
      errorState: {
        hasActiveError: errorState.currentError !== null,
        retryAttempt: errorState.retryAttempt,
        isRecovering: errorState.isRecovering,
        errorHistoryCount: errorState.errorHistory.length
      },
      notificationCount: notifications.length
    }

    errorContextRef.current = contextData
    return contextData
  }, [context, currentPhase, errorState, notifications.length])

  // Update error context on state changes
  useEffect(() => {
    captureErrorContext()
  }, [captureErrorContext])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (retryStateRef.current.retryTimeoutId) {
        clearTimeout(retryStateRef.current.retryTimeoutId)
      }
    }
  }, [])

  // Computed properties
  const hasActiveError = errorState.currentError !== null
  const canRetry = hasActiveError && 
                   errorState.currentError!.isRetryable() && 
                   errorState.retryAttempt < errorState.maxRetries &&
                   lastOperationRef.current !== null

  // Return comprehensive error handling interface
  return {
    // Core error handling functions
    handleError,
    handleAsyncError,
    
    // Error state management
    clearError,
    clearErrorHistory,
    retryLastOperation,
    
    // Recovery mechanisms
    attemptRecovery,
    resetErrorState,
    
    // Notification management
    showErrorNotification,
    dismissNotification,
    clearAllNotifications,
    
    // Error state and information
    errorState,
    notifications,
    hasActiveError,
    canRetry,
    
    // Error utilities
    isErrorCategory,
    getErrorSeverity,
    getRecoveryStrategy,
    
    // Error boundary integration
    reportToBoundary,
    captureErrorContext
  }
}

// =============================================================================
// CONVENIENCE HOOKS
// =============================================================================

/**
 * Simplified error handler for basic error handling scenarios
 * Provides essential error handling without advanced features
 */
export function useSimpleErrorHandler(context?: string) {
  return useErrorHandler({
    context,
    enableAutoRecovery: false,
    enableNotifications: true,
    enableErrorBoundary: false,
    maxAutoRetries: 0
  })
}

/**
 * Recovery-focused error handler with automatic retry mechanisms
 * Optimized for operations that benefit from automatic recovery
 */
export function useRecoveryErrorHandler(context?: string, maxRetries = 3) {
  return useErrorHandler({
    context,
    enableAutoRecovery: true,
    enableNotifications: true,
    enableErrorBoundary: true,
    maxAutoRetries: maxRetries,
    retryDelay: 1000
  })
}

/**
 * Phase-aware error handler for development workflow operations
 * Specialized for ReadyAI's 7-phase development methodology
 */
export function usePhaseErrorHandler(context: string, currentPhase: PhaseType) {
  return useErrorHandler({
    context: `phase.${currentPhase}.${context}`,
    currentPhase,
    enableAutoRecovery: true,
    enableNotifications: true,
    enableErrorBoundary: true,
    maxAutoRetries: 2
  })
}

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type {
  UseErrorHandlerOptions,
  UseErrorHandlerReturn,
  ErrorState,
  ErrorNotification
}

/**
 * Version information for the error handler hook
 */
export const USE_ERROR_HANDLER_VERSION = '1.1.0'

/**
 * Default error handler configuration
 */
export const DEFAULT_ERROR_HANDLER_OPTIONS: UseErrorHandlerOptions = {
  context: 'default',
  enableAutoRecovery: true,
  enableNotifications: true,
  notificationDuration: 5000,
  maxAutoRetries: 3,
  retryDelay: 1000,
  enableErrorBoundary: true
}
