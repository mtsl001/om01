// packages/logging/types/logging.ts

/**
 * Logging types for ReadyAI Personal AI Development Orchestrator
 * 
 * Adapted from Cline's telemetry system with ReadyAI-specific extensions.
 * This module provides comprehensive logging and telemetry types that leverage
 * Cline's proven production patterns while supporting ReadyAI's 7-phase methodology
 * and enhanced context management requirements.
 * 
 * Source: Adapted from Cline's src/services/telemetry/TelemetryService.ts
 * Reuse Level: 75% - Architectural patterns + Interface adaptation
 */

import type {
  UUID,
  PhaseType,
  PhaseStatus,
  AIProviderType,
  ApiResult,
  ReadyAIError
} from '../../foundation/types/core.js'

// =============================================================================
// LOG LEVELS AND SEVERITY
// =============================================================================

/**
 * Log severity levels following Cline's proven hierarchy
 * Extended with ReadyAI-specific levels for development phase tracking
 */
export type LogLevel = 
  | 'trace'
  | 'debug' 
  | 'info'
  | 'warn'
  | 'error'
  | 'fatal'
  | 'phase'     // ReadyAI extension for phase transitions
  | 'context'   // ReadyAI extension for context management events

/**
 * Log categories for granular control over logging output
 * Adapted from Cline's telemetry categories with ReadyAI extensions
 */
export type LogCategory =
  | 'system'
  | 'api'
  | 'telemetry'
  | 'browser'
  | 'checkpoint'
  | 'context'
  | 'phase'        // ReadyAI: Development phase events
  | 'generation'   // ReadyAI: AI code generation events
  | 'validation'   // ReadyAI: Quality validation events
  | 'dependency'   // ReadyAI: Dependency resolution events

// =============================================================================
// CORE LOGGING INTERFACES
// =============================================================================

/**
 * Base log entry structure with Cline's proven metadata patterns
 * Enhanced with ReadyAI's project and phase correlation
 */
export interface LogEntry {
  /** Unique log entry identifier */
  id: UUID
  
  /** Timestamp in ISO 8601 format */
  timestamp: string
  
  /** Log severity level */
  level: LogLevel
  
  /** Log category for filtering and routing */
  category: LogCategory
  
  /** Primary log message */
  message: string
  
  /** Optional structured data associated with log entry */
  data?: Record<string, unknown>
  
  /** Optional error object if this is an error log */
  error?: LogError
  
  /** ReadyAI: Associated project identifier */
  projectId?: UUID
  
  /** ReadyAI: Current development phase when log was created */
  phase?: PhaseType
  
  /** ReadyAI: Task/session identifier for correlation */
  taskId?: string
  
  /** Source component or service that generated the log */
  source: string
  
  /** Request correlation ID for tracing across services */
  correlationId?: string
}

/**
 * Enhanced error structure based on Cline's error handling patterns
 * Extended with ReadyAI-specific error classification
 */
export interface LogError {
  /** Error message */
  message: string
  
  /** Error code for programmatic handling */
  code?: string
  
  /** Stack trace (development only) */
  stack?: string
  
  /** HTTP status code if applicable */
  statusCode?: number
  
  /** Additional error context */
  details?: Record<string, unknown>
  
  /** Whether this error is retryable */
  retryable?: boolean
  
  /** ReadyAI: Phase where error occurred */
  phase?: PhaseType
  
  /** ReadyAI: Error classification for analytics */
  errorType?: ReadyAIErrorType
  
  /** Inner/cause error */
  cause?: LogError
}

/**
 * ReadyAI-specific error classifications for improved debugging
 * and analytics based on common failure patterns
 */
export type ReadyAIErrorType =
  | 'validation_failed'
  | 'context_overflow'
  | 'dependency_missing'
  | 'generation_failed'
  | 'phase_transition_failed'
  | 'api_provider_error'
  | 'file_system_error'
  | 'configuration_error'
  | 'network_error'
  | 'unknown_error'

// =============================================================================
// TELEMETRY AND ANALYTICS (Adapted from Cline)
// =============================================================================

/**
 * Telemetry event structure following Cline's proven patterns
 * Extended with ReadyAI's 7-phase methodology tracking
 */
export interface TelemetryEvent {
  /** Event identifier */
  id: UUID
  
  /** Event name using hierarchical dot notation */
  event: string
  
  /** Event timestamp */
  timestamp: string
  
  /** Event properties/metadata */
  properties: Record<string, unknown>
  
  /** User identifier (if available) */
  userId?: string
  
  /** Session identifier */
  sessionId?: string
  
  /** ReadyAI: Project context */
  projectId?: UUID
  
  /** ReadyAI: Current phase context */
  phase?: PhaseType
  
  /** ReadyAI: Task correlation */
  taskId?: string
}

/**
 * Telemetry categories adapted from Cline's system
 * Extended with ReadyAI-specific event categories
 */
export type TelemetryCategory =
  | 'user'           // User interactions
  | 'system'         // System events
  | 'task'           // Task execution (from Cline)
  | 'ui'             // UI interactions (from Cline)
  | 'project'        // ReadyAI: Project lifecycle events
  | 'phase'          // ReadyAI: Phase transition events
  | 'generation'     // ReadyAI: Code generation events
  | 'validation'     // ReadyAI: Quality validation events
  | 'context'        // ReadyAI: Context management events

/**
 * Event definitions following Cline's hierarchical naming pattern
 * Organized by category with ReadyAI extensions
 */
export const TELEMETRY_EVENTS = {
  // Cline-inherited events
  USER: {
    EXTENSION_ACTIVATED: 'user.extension_activated',
    TELEMETRY_ENABLED: 'user.telemetry_enabled'
  } as const,
  
  TASK: {
    CREATED: 'task.created',
    COMPLETED: 'task.completed',
    FAILED: 'task.failed',
    CANCELLED: 'task.cancelled'
  } as const,
  
  UI: {
    BUTTON_CLICKED: 'ui.button_clicked',
    MODEL_SELECTED: 'ui.model_selected'
  } as const,
  
  // ReadyAI-specific events
  PROJECT: {
    CREATED: 'project.created',
    LOADED: 'project.loaded',
    ARCHIVED: 'project.archived',
    CONFIG_UPDATED: 'project.config_updated'
  } as const,
  
  PHASE: {
    STARTED: 'phase.started',
    COMPLETED: 'phase.completed',
    FAILED: 'phase.failed',
    SKIPPED: 'phase.skipped',
    TRANSITION: 'phase.transition'
  } as const,
  
  GENERATION: {
    REQUESTED: 'generation.requested',
    STARTED: 'generation.started',
    COMPLETED: 'generation.completed',
    FAILED: 'generation.failed',
    CACHED: 'generation.cached'
  } as const,
  
  VALIDATION: {
    STARTED: 'validation.started',
    PASSED: 'validation.passed',
    FAILED: 'validation.failed',
    WARNING: 'validation.warning'
  } as const,
  
  CONTEXT: {
    CREATED: 'context.created',
    COMPRESSED: 'context.compressed',
    RETRIEVED: 'context.retrieved',
    OVERFLOW: 'context.overflow'
  } as const
} as const

// =============================================================================
// PERFORMANCE METRICS (Adapted from Cline)
// =============================================================================

/**
 * Performance metrics structure based on Cline's telemetry patterns
 * Enhanced with ReadyAI-specific performance tracking
 */
export interface PerformanceMetrics {
  /** Unique metric identifier */
  id: UUID
  
  /** Metric timestamp */
  timestamp: string
  
  /** Metric name/type */
  metric: string
  
  /** Numeric value */
  value: number
  
  /** Measurement unit */
  unit: string
  
  /** Optional labels for grouping */
  labels?: Record<string, string>
  
  /** ReadyAI: Associated project */
  projectId?: UUID
  
  /** ReadyAI: Associated phase */
  phase?: PhaseType
}

/**
 * Token usage tracking adapted from Cline's patterns
 * Extended for ReadyAI's multi-provider architecture
 */
export interface TokenUsage {
  /** Input tokens consumed */
  input: number
  
  /** Output tokens generated */
  output: number
  
  /** Total tokens used */
  total: number
  
  /** Cached tokens (if applicable) */
  cached?: number
  
  /** AI provider used */
  provider: AIProviderType
  
  /** Model identifier */
  modelId: string
  
  /** Cost estimate (if available) */
  estimatedCost?: number
  
  /** Currency for cost */
  currency?: string
  
  /** ReadyAI: Phase context */
  phase?: PhaseType
  
  /** ReadyAI: Generation type */
  generationType?: 'file' | 'module' | 'component' | 'test' | 'documentation'
}

// =============================================================================
// PHASE TRACKING (ReadyAI-Specific)
// =============================================================================

/**
 * Phase progression tracking for ReadyAI's 7-phase methodology
 * Enables detailed analytics on development flow efficiency
 */
export interface PhaseTrackingEvent {
  /** Event identifier */
  id: UUID
  
  /** Event timestamp */
  timestamp: string
  
  /** Project identifier */
  projectId: UUID
  
  /** Phase identifier */
  phase: PhaseType
  
  /** Phase status */
  status: PhaseStatus
  
  /** Previous phase (for transitions) */
  previousPhase?: PhaseType
  
  /** Duration in milliseconds (for completed phases) */
  duration?: number
  
  /** Artifacts generated during this phase */
  artifactCount?: number
  
  /** Token usage for this phase */
  tokenUsage?: TokenUsage
  
  /** Validation results */
  validationResults?: {
    passed: number
    failed: number
    warnings: number
  }
  
  /** Phase-specific metadata */
  metadata?: Record<string, unknown>
}

// =============================================================================
// LOGGER INTERFACES
// =============================================================================

/**
 * Main logger interface based on Cline's logging patterns
 * Enhanced with ReadyAI-specific context management
 */
export interface Logger {
  /** Log a trace message */
  trace(message: string, data?: Record<string, unknown>): void
  
  /** Log a debug message */
  debug(message: string, data?: Record<string, unknown>): void
  
  /** Log an info message */
  info(message: string, data?: Record<string, unknown>): void
  
  /** Log a warning message */
  warn(message: string, data?: Record<string, unknown>): void
  
  /** Log an error message */
  error(message: string, error?: Error | ReadyAIError, data?: Record<string, unknown>): void
  
  /** Log a fatal error message */
  fatal(message: string, error?: Error | ReadyAIError, data?: Record<string, unknown>): void
  
  /** ReadyAI: Log a phase transition */
  phase(phase: PhaseType, status: PhaseStatus, data?: Record<string, unknown>): void
  
  /** ReadyAI: Log a context management event */
  context(message: string, data?: Record<string, unknown>): void
  
  /** Create a child logger with additional context */
  child(context: Partial<LogContext>): Logger
  
  /** Set the minimum log level */
  setLevel(level: LogLevel): void
  
  /** Get the current log level */
  getLevel(): LogLevel
  
  /** Enable/disable a specific category */
  setCategoryEnabled(category: LogCategory, enabled: boolean): void
  
  /** Check if a category is enabled */
  isCategoryEnabled(category: LogCategory): boolean
}

/**
 * Logger context for scoped logging
 * Adapted from Cline's context patterns with ReadyAI extensions
 */
export interface LogContext {
  /** Source component/service */
  source: string
  
  /** Request correlation ID */
  correlationId?: string
  
  /** ReadyAI: Project context */
  projectId?: UUID
  
  /** ReadyAI: Current phase */
  phase?: PhaseType
  
  /** ReadyAI: Task identifier */
  taskId?: string
  
  /** Additional context metadata */
  metadata?: Record<string, unknown>
}

/**
 * Telemetry service interface based on Cline's TelemetryService
 * Extended with ReadyAI-specific event tracking
 */
export interface TelemetryService {
  /** Track a telemetry event */
  captureEvent(event: string, properties?: Record<string, unknown>): void
  
  /** Track performance metrics */
  captureMetrics(metrics: PerformanceMetrics): void
  
  /** Track token usage */
  captureTokenUsage(usage: TokenUsage): void
  
  /** ReadyAI: Track phase progression */
  capturePhaseEvent(event: PhaseTrackingEvent): void
  
  /** ReadyAI: Track generation request */
  captureGenerationRequest(
    projectId: UUID,
    phase: PhaseType,
    provider: AIProviderType,
    modelId: string,
    success: boolean,
    duration?: number,
    tokenUsage?: TokenUsage
  ): void
  
  /** ReadyAI: Track validation result */
  captureValidationResult(
    projectId: UUID,
    phase: PhaseType,
    validationType: string,
    passed: boolean,
    details?: Record<string, unknown>
  ): void
  
  /** Set user identity for telemetry correlation */
  identify(userId: string, properties?: Record<string, unknown>): void
  
  /** Enable/disable telemetry */
  setEnabled(enabled: boolean): void
  
  /** Check if telemetry is enabled */
  isEnabled(): boolean
  
  /** Flush pending telemetry data */
  flush(): Promise<void>
}

// =============================================================================
// LOGGING CONFIGURATION
// =============================================================================

/**
 * Logger configuration based on Cline's patterns
 * Extended with ReadyAI-specific options
 */
export interface LoggerConfig {
  /** Minimum log level */
  level: LogLevel
  
  /** Enabled categories */
  categories: Record<LogCategory, boolean>
  
  /** Output targets */
  outputs: LogOutput[]
  
  /** Enable structured logging (JSON) */
  structured: boolean
  
  /** Include stack traces in error logs */
  includeStackTrace: boolean
  
  /** ReadyAI: Enable phase tracking */
  enablePhaseTracking: boolean
  
  /** ReadyAI: Enable performance metrics */
  enablePerformanceMetrics: boolean
  
  /** ReadyAI: Context window for log correlation */
  contextWindowSize: number
  
  /** Maximum log entry size in bytes */
  maxLogEntrySize: number
  
  /** Log rotation settings */
  rotation?: LogRotationConfig
}

/**
 * Log output configuration
 */
export interface LogOutput {
  /** Output type */
  type: 'console' | 'file' | 'network' | 'memory'
  
  /** Minimum level for this output */
  level: LogLevel
  
  /** Output-specific configuration */
  config: Record<string, unknown>
}

/**
 * Log rotation configuration
 */
export interface LogRotationConfig {
  /** Maximum file size in bytes */
  maxFileSize: number
  
  /** Maximum number of log files to keep */
  maxFiles: number
  
  /** Rotation interval in milliseconds */
  interval?: number
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Log query interface for searching and filtering logs
 */
export interface LogQuery {
  /** Start time filter */
  startTime?: string
  
  /** End time filter */
  endTime?: string
  
  /** Log levels to include */
  levels?: LogLevel[]
  
  /** Categories to include */
  categories?: LogCategory[]
  
  /** Source filter */
  source?: string
  
  /** Project filter */
  projectId?: UUID
  
  /** Phase filter */
  phase?: PhaseType
  
  /** Text search in messages */
  search?: string
  
  /** Maximum number of results */
  limit?: number
  
  /** Results offset for pagination */
  offset?: number
}

/**
 * Log query result
 */
export interface LogQueryResult {
  /** Log entries matching the query */
  entries: LogEntry[]
  
  /** Total number of matching entries */
  total: number
  
  /** Query execution time in milliseconds */
  executionTime: number
  
  /** Whether more results are available */
  hasMore: boolean
}

/**
 * Async result type for logging operations
 * Consistent with ReadyAI's error handling patterns
 */
export type LoggingResult<T = void> = Promise<ApiResult<T>>

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Type guard to check if an object is a LogEntry
 */
export function isLogEntry(obj: unknown): obj is LogEntry {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as LogEntry).id === 'string' &&
    typeof (obj as LogEntry).timestamp === 'string' &&
    typeof (obj as LogEntry).level === 'string' &&
    typeof (obj as LogEntry).message === 'string'
  )
}

/**
 * Type guard to check if an object is a TelemetryEvent
 */
export function isTelemetryEvent(obj: unknown): obj is TelemetryEvent {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as TelemetryEvent).id === 'string' &&
    typeof (obj as TelemetryEvent).event === 'string' &&
    typeof (obj as TelemetryEvent).timestamp === 'string'
  )
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Default logger configuration values
 */
export const DEFAULT_LOGGER_CONFIG: Partial<LoggerConfig> = {
  level: 'info',
  structured: false,
  includeStackTrace: true,
  enablePhaseTracking: true,
  enablePerformanceMetrics: true,
  contextWindowSize: 100,
  maxLogEntrySize: 10 * 1024, // 10KB
  categories: {
    system: true,
    api: true,
    telemetry: true,
    browser: true,
    checkpoint: true,
    context: true,
    phase: true,
    generation: true,
    validation: true,
    dependency: true
  }
} as const

/**
 * Maximum lengths for various log fields to prevent memory issues
 */
export const LOG_FIELD_LIMITS = {
  MESSAGE_MAX_LENGTH: 2048,
  SOURCE_MAX_LENGTH: 100,
  ERROR_MESSAGE_MAX_LENGTH: 1024,
  STACK_TRACE_MAX_LENGTH: 8192
} as const

// =============================================================================
// VERSION AND EXPORTS
// =============================================================================

/**
 * Version information for the logging types module
 */
export const LOGGING_TYPES_VERSION = '1.0.0'

/**
 * Export all types and interfaces for consumption by other modules
 */
export type {
  // Core logging types
  LogEntry,
  LogError,
  LogLevel,
  LogCategory,
  ReadyAIErrorType,
  
  // Telemetry types
  TelemetryEvent,
  TelemetryCategory,
  PerformanceMetrics,
  TokenUsage,
  PhaseTrackingEvent,
  
  // Logger interfaces
  Logger,
  LogContext,
  TelemetryService,
  
  // Configuration types
  LoggerConfig,
  LogOutput,
  LogRotationConfig,
  
  // Utility types
  LogQuery,
  LogQueryResult,
  LoggingResult
}
