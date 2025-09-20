// packages/ui/hooks/useLogger.ts

/**
 * ReadyAI Logger Hook - Client-side logging integration
 * 
 * This hook provides a React interface for ReadyAI's logging system, maximizing reuse
 * of Cline's proven logging patterns while extending them for ReadyAI's 7-phase methodology
 * and enhanced telemetry requirements.
 * 
 * Adapted from Cline's frontend logging patterns with ReadyAI-specific extensions:
 * - Phase-aware logging for development lifecycle tracking
 * - Context management integration for semantic project understanding
 * - Enhanced telemetry correlation with unique session tracking
 * - Production-ready error handling and performance monitoring
 * 
 * @see packages/logging/services/Logger.ts - Core logging service
 * @see packages/logging/services/TelemetryService.ts - Telemetry integration
 */

import { useCallback, useContext, useEffect, useRef, useMemo } from 'react'
import type { 
  UUID, 
  PhaseType, 
  PhaseStatus,
  APIProviderType,
  Project,
  ReadyAIError
} from '../../foundation/types/core.js'
import type {
  LogLevel,
  LogCategory,
  LogEntry,
  LogContext,
  TelemetryEvent,
  TelemetryMetric,
  PerformanceMetric,
  ErrorEvent,
  PhaseTransitionEvent,
  ContextEvent,
  SessionMetadata,
  LoggerConfiguration
} from '../../logging/types/logging.js'
import { Logger } from '../../logging/services/Logger.js'
import { TelemetryService } from '../../logging/services/TelemetryService.js'

// =============================================================================
// HOOK CONFIGURATION AND STATE
// =============================================================================

/**
 * Logger hook configuration options
 * Extends Cline's logging patterns with ReadyAI-specific requirements
 */
export interface UseLoggerOptions {
  /** Component or module identifier for log correlation */
  source?: string
  /** Current project context for enhanced logging */
  project?: Project
  /** Current phase for phase-aware logging */
  currentPhase?: PhaseType
  /** Enable development mode with enhanced debugging */
  developmentMode?: boolean
  /** Custom logger configuration overrides */
  config?: Partial<LoggerConfiguration>
  /** Enable automatic error boundary integration */
  autoErrorCapture?: boolean
  /** Performance monitoring enabled */
  performanceTracking?: boolean
  /** Maximum log buffer size for client-side batching */
  bufferSize?: number
}

/**
 * Logger hook return interface
 * Provides comprehensive logging capabilities with Cline's proven patterns
 */
export interface UseLoggerReturn {
  // Core logging functions adapted from Cline's patterns
  log: (level: LogLevel, message: string, context?: LogContext) => void
  trace: (message: string, context?: LogContext) => void
  debug: (message: string, context?: LogContext) => void
  info: (message: string, context?: LogContext) => void
  warn: (message: string, context?: LogContext) => void
  error: (message: string, error?: Error | ReadyAIError, context?: LogContext) => void
  fatal: (message: string, error?: Error | ReadyAIError, context?: LogContext) => void
  
  // ReadyAI-specific logging extensions
  phase: (message: string, phase?: PhaseType, status?: PhaseStatus, context?: LogContext) => void
  context: (message: string, contextData?: Record<string, any>) => void
  
  // Performance and telemetry functions
  startTimer: (operation: string) => () => void
  measurePerformance: <T>(operation: string, fn: () => T | Promise<T>) => Promise<T>
  trackEvent: (event: TelemetryEvent) => void
  trackMetric: (metric: TelemetryMetric) => void
  
  // Session and correlation management
  getSessionId: () => UUID
  getCorrelationId: () => UUID
  createChildLogger: (childSource: string) => UseLoggerReturn
  
  // Error handling integration
  captureException: (error: Error | ReadyAIError, context?: LogContext) => void
  
  // Configuration and state
  isEnabled: (level: LogLevel) => boolean
  getCurrentConfig: () => LoggerConfiguration
  flush: () => Promise<void>
}

/**
 * Internal hook state for managing logger instances and correlation
 */
interface UseLoggerState {
  logger: Logger
  telemetry: TelemetryService
  sessionId: UUID
  correlationId: UUID
  source: string
  performanceTimers: Map<string, number>
  logBuffer: LogEntry[]
  isInitialized: boolean
}

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

/**
 * ReadyAI Logger Hook
 * 
 * Provides comprehensive logging capabilities with Cline's proven patterns,
 * extended for ReadyAI's phase-aware development methodology and enhanced
 * telemetry requirements.
 * 
 * @param options - Logger configuration and context options
 * @returns Comprehensive logger interface with ReadyAI extensions
 */
export function useLogger(options: UseLoggerOptions = {}): UseLoggerReturn {
  const {
    source = 'unknown',
    project,
    currentPhase,
    developmentMode = process.env.NODE_ENV === 'development',
    config = {},
    autoErrorCapture = true,
    performanceTracking = true,
    bufferSize = 100
  } = options

  // Initialize logger state with Cline's proven patterns
  const stateRef = useRef<UseLoggerState | null>(null)
  
  // Initialize or get existing state
  const getState = useCallback((): UseLoggerState => {
    if (!stateRef.current) {
      const sessionId = crypto.randomUUID()
      const correlationId = crypto.randomUUID()
      
      // Create logger instance with ReadyAI configuration
      const logger = new Logger({
        source,
        sessionId,
        developmentMode,
        bufferSize,
        ...config
      })
      
      // Create telemetry service with correlation
      const telemetry = new TelemetryService({
        sessionId,
        correlationId,
        source,
        project: project?.id,
        currentPhase
      })
      
      stateRef.current = {
        logger,
        telemetry,
        sessionId,
        correlationId,
        source,
        performanceTimers: new Map(),
        logBuffer: [],
        isInitialized: true
      }
    }
    
    return stateRef.current
  }, [source, project, currentPhase, developmentMode, config, bufferSize])

  const state = getState()

  // Memoized base context for all log entries
  const baseContext = useMemo((): LogContext => ({
    sessionId: state.sessionId,
    correlationId: state.correlationId,
    source: state.source,
    timestamp: new Date().toISOString(),
    project: project ? {
      id: project.id,
      name: project.name,
      phase: project.currentPhase,
      status: project.status
    } : undefined,
    currentPhase,
    userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
    url: typeof window !== 'undefined' ? window.location.href : undefined
  }), [state.sessionId, state.correlationId, state.source, project, currentPhase])

  // Core logging function with Cline's proven patterns
  const log = useCallback((level: LogLevel, message: string, context?: LogContext): void => {
    try {
      const enhancedContext: LogContext = {
        ...baseContext,
        ...context,
        level,
        category: context?.category || 'general'
      }

      const logEntry: LogEntry = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        level,
        message,
        context: enhancedContext,
        source: state.source,
        sessionId: state.sessionId,
        correlationId: state.correlationId
      }

      // Log through service layer
      state.logger.log(logEntry)

      // Track telemetry for significant events
      if (level === 'error' || level === 'fatal' || level === 'warn') {
        state.telemetry.trackEvent({
          type: 'log_entry',
          level,
          message,
          context: enhancedContext,
          timestamp: logEntry.timestamp
        })
      }

      // Buffer management for client-side batching
      state.logBuffer.push(logEntry)
      if (state.logBuffer.length > bufferSize) {
        state.logBuffer = state.logBuffer.slice(-bufferSize)
      }

    } catch (error) {
      // Fallback logging to prevent infinite loops
      console.error('Logger hook error:', error)
      console.log(`[${level.toUpperCase()}] ${message}`, context)
    }
  }, [baseContext, state.logger, state.telemetry, state.source, state.sessionId, state.correlationId, bufferSize])

  // Convenience logging methods following Cline's patterns
  const trace = useCallback((message: string, context?: LogContext) => {
    log('trace', message, context)
  }, [log])

  const debug = useCallback((message: string, context?: LogContext) => {
    log('debug', message, context)
  }, [log])

  const info = useCallback((message: string, context?: LogContext) => {
    log('info', message, context)
  }, [log])

  const warn = useCallback((message: string, context?: LogContext) => {
    log('warn', message, context)
  }, [log])

  const error = useCallback((message: string, errorObj?: Error | ReadyAIError, context?: LogContext) => {
    const errorContext: LogContext = {
      ...context,
      error: errorObj ? {
        name: errorObj.name,
        message: errorObj.message,
        stack: errorObj.stack,
        ...(errorObj instanceof ReadyAIError && {
          code: errorObj.code,
          statusCode: errorObj.statusCode,
          details: errorObj.details
        })
      } : undefined
    }
    
    log('error', message, errorContext)
    
    // Track error telemetry
    if (errorObj) {
      state.telemetry.trackEvent({
        type: 'error',
        error: errorObj,
        message,
        context: errorContext,
        timestamp: new Date().toISOString()
      } as ErrorEvent)
    }
  }, [log, state.telemetry])

  const fatal = useCallback((message: string, errorObj?: Error | ReadyAIError, context?: LogContext) => {
    const errorContext: LogContext = {
      ...context,
      error: errorObj ? {
        name: errorObj.name,
        message: errorObj.message,
        stack: errorObj.stack,
        ...(errorObj instanceof ReadyAIError && {
          code: errorObj.code,
          statusCode: errorObj.statusCode,
          details: errorObj.details
        })
      } : undefined
    }
    
    log('fatal', message, errorContext)
    
    // Track fatal error telemetry
    state.telemetry.trackEvent({
      type: 'fatal_error',
      error: errorObj,
      message,
      context: errorContext,
      timestamp: new Date().toISOString()
    } as ErrorEvent)
  }, [log, state.telemetry])

  // ReadyAI-specific phase logging
  const phase = useCallback((message: string, phase?: PhaseType, status?: PhaseStatus, context?: LogContext) => {
    const phaseContext: LogContext = {
      ...context,
      phase: phase || currentPhase,
      phaseStatus: status,
      category: 'phase'
    }
    
    log('phase', message, phaseContext)
    
    // Track phase transition telemetry
    if (phase && status) {
      state.telemetry.trackEvent({
        type: 'phase_transition',
        phase,
        status,
        message,
        timestamp: new Date().toISOString(),
        project: project?.id
      } as PhaseTransitionEvent)
    }
  }, [log, currentPhase, project, state.telemetry])

  // Context-aware logging for semantic events
  const contextLog = useCallback((message: string, contextData?: Record<string, any>) => {
    const contextLogEntry: LogContext = {
      ...contextData,
      category: 'context'
    }
    
    log('context', message, contextLogEntry)
    
    // Track context telemetry
    state.telemetry.trackEvent({
      type: 'context_event',
      message,
      contextData,
      timestamp: new Date().toISOString()
    } as ContextEvent)
  }, [log, state.telemetry])

  // Performance monitoring with Cline's patterns
  const startTimer = useCallback((operation: string): (() => void) => {
    if (!performanceTracking) {
      return () => {} // No-op if performance tracking disabled
    }

    const startTime = performance.now()
    const timerId = `${operation}_${crypto.randomUUID()}`
    state.performanceTimers.set(timerId, startTime)

    return () => {
      const endTime = performance.now()
      const startTimeActual = state.performanceTimers.get(timerId)
      
      if (startTimeActual !== undefined) {
        const duration = endTime - startTimeActual
        state.performanceTimers.delete(timerId)
        
        // Log performance metric
        debug(`Performance: ${operation} completed in ${duration.toFixed(2)}ms`, {
          category: 'performance',
          operation,
          duration,
          startTime: startTimeActual,
          endTime
        })
        
        // Track performance telemetry
        state.telemetry.trackMetric({
          type: 'performance',
          name: operation,
          value: duration,
          unit: 'milliseconds',
          timestamp: new Date().toISOString(),
          metadata: {
            operation,
            source: state.source
          }
        } as PerformanceMetric)
      }
    }
  }, [performanceTracking, debug, state.performanceTimers, state.telemetry, state.source])

  // Measure performance of async operations
  const measurePerformance = useCallback(async <T>(
    operation: string, 
    fn: () => T | Promise<T>
  ): Promise<T> => {
    const stopTimer = startTimer(operation)
    
    try {
      const result = await Promise.resolve(fn())
      return result
    } catch (error) {
      error(`Performance measurement failed for ${operation}`, error as Error)
      throw error
    } finally {
      stopTimer()
    }
  }, [startTimer, error])

  // Telemetry event tracking
  const trackEvent = useCallback((event: TelemetryEvent) => {
    state.telemetry.trackEvent(event)
    debug('Tracked telemetry event', {
      category: 'telemetry',
      eventType: event.type,
      timestamp: event.timestamp
    })
  }, [state.telemetry, debug])

  // Telemetry metric tracking
  const trackMetric = useCallback((metric: TelemetryMetric) => {
    state.telemetry.trackMetric(metric)
    debug('Tracked telemetry metric', {
      category: 'telemetry',
      metricName: metric.name,
      value: metric.value,
      unit: metric.unit
    })
  }, [state.telemetry, debug])

  // Session and correlation management
  const getSessionId = useCallback(() => state.sessionId, [state.sessionId])
  const getCorrelationId = useCallback(() => state.correlationId, [state.correlationId])

  // Create child logger for component hierarchy
  const createChildLogger = useCallback((childSource: string): UseLoggerReturn => {
    return useLogger({
      ...options,
      source: `${state.source}.${childSource}`
    })
  }, [options, state.source])

  // Exception capture with ReadyAI error handling
  const captureException = useCallback((errorObj: Error | ReadyAIError, context?: LogContext) => {
    error('Captured exception', errorObj, {
      ...context,
      category: 'exception',
      captured: true
    })
  }, [error])

  // Configuration and utility methods
  const isEnabled = useCallback((level: LogLevel): boolean => {
    return state.logger.isEnabled(level)
  }, [state.logger])

  const getCurrentConfig = useCallback((): LoggerConfiguration => {
    return state.logger.getConfiguration()
  }, [state.logger])

  const flush = useCallback(async (): Promise<void> => {
    try {
      await state.logger.flush()
      await state.telemetry.flush()
      debug('Logger and telemetry buffers flushed', { category: 'system' })
    } catch (error) {
      console.error('Failed to flush logger buffers:', error)
    }
  }, [state.logger, state.telemetry, debug])

  // Automatic error boundary integration
  useEffect(() => {
    if (!autoErrorCapture || typeof window === 'undefined') {
      return
    }

    const handleUnhandledError = (event: ErrorEvent) => {
      captureException(new Error(event.message), {
        category: 'unhandled_error',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      })
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      captureException(
        event.reason instanceof Error 
          ? event.reason 
          : new Error(String(event.reason)), 
        {
          category: 'unhandled_rejection',
          type: 'promise'
        }
      )
    }

    window.addEventListener('error', handleUnhandledError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      window.removeEventListener('error', handleUnhandledError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [autoErrorCapture, captureException])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (stateRef.current) {
        // Cleanup timers
        stateRef.current.performanceTimers.clear()
        
        // Flush buffers on cleanup
        flush().catch(console.error)
      }
    }
  }, [flush])

  // Return comprehensive logger interface
  return {
    // Core logging functions
    log,
    trace,
    debug,
    info,
    warn,
    error,
    fatal,
    
    // ReadyAI extensions
    phase,
    context: contextLog,
    
    // Performance and telemetry
    startTimer,
    measurePerformance,
    trackEvent,
    trackMetric,
    
    // Session management
    getSessionId,
    getCorrelationId,
    createChildLogger,
    
    // Error handling
    captureException,
    
    // Configuration and utilities
    isEnabled,
    getCurrentConfig,
    flush
  }
}

// =============================================================================
// UTILITY HOOKS AND HELPERS
// =============================================================================

/**
 * Hook for phase-aware logging with automatic phase context
 * Simplified interface for phase-specific logging scenarios
 */
export function usePhaseLogger(phase: PhaseType, project?: Project) {
  return useLogger({
    source: `phase.${phase}`,
    currentPhase: phase,
    project,
    performanceTracking: true
  })
}

/**
 * Hook for performance monitoring with automatic telemetry
 * Specialized interface for performance-critical operations
 */
export function usePerformanceLogger(source: string) {
  return useLogger({
    source: `perf.${source}`,
    performanceTracking: true,
    autoErrorCapture: true
  })
}

/**
 * Hook for error-focused logging with enhanced error handling
 * Specialized interface for error boundary and exception handling
 */
export function useErrorLogger(source: string) {
  return useLogger({
    source: `error.${source}`,
    autoErrorCapture: true,
    performanceTracking: false,
    config: {
      minLevel: 'warn'
    }
  })
}

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type { UseLoggerOptions, UseLoggerReturn }

/**
 * Version information for the logger hook
 */
export const USE_LOGGER_VERSION = '1.0.0'

/**
 * Default hook configuration following Cline's patterns
 */
export const DEFAULT_LOGGER_OPTIONS: UseLoggerOptions = {
  source: 'default',
  developmentMode: process.env.NODE_ENV === 'development',
  autoErrorCapture: true,
  performanceTracking: true,
  bufferSize: 100
}
