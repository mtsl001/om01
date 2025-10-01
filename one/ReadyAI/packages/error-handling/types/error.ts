// packages/error-handling/types/error.ts

/**
 * ReadyAI Error Handling Types
 * 
 * Comprehensive error type definitions extracted and adapted from Cline's production-tested
 * error handling patterns. This module provides a centralized taxonomy for all error
 * scenarios encountered in the ReadyAI Personal AI Development Orchestrator.
 * 
 * Based on Cline's src/services/error/types.ts with ReadyAI-specific extensions for:
 * - AI-powered development workflows
 * - Multi-phase project orchestration
 * - Context management operations
 * - RAG system interactions
 * 
 * @version 1.1.0 - Production Ready
 * @author ReadyAI Development Team
 */

import { ReadyAIError, UUID, generateUUID, createTimestamp } from '../../foundation/types/core'

// =============================================================================
// ERROR CATEGORIES & CLASSIFICATION
// =============================================================================

/**
 * Primary error categories for ReadyAI system classification
 * Hierarchical organization enables precise error handling and recovery strategies
 */
export enum ErrorCategory {
  /** Authentication and authorization failures */
  AUTHENTICATION = 'authentication',
  
  /** API provider communication errors */
  API_PROVIDER = 'api_provider',
  
  /** Context management and RAG system errors */
  CONTEXT_MANAGEMENT = 'context_management',
  
  /** File system and workspace operations */
  FILESYSTEM = 'filesystem',
  
  /** Database operations and persistence */
  DATABASE = 'database',
  
  /** Configuration and settings validation */
  CONFIGURATION = 'configuration',
  
  /** AI generation and processing errors */
  AI_GENERATION = 'ai_generation',
  
  /** Dependency resolution and analysis */
  DEPENDENCY = 'dependency',
  
  /** Project phase management */
  PHASE_MANAGEMENT = 'phase_management',
  
  /** Validation and quality checks */
  VALIDATION = 'validation',
  
  /** Network connectivity and communication */
  NETWORK = 'network',
  
  /** Resource management and limits */
  RESOURCE = 'resource',
  
  /** System-level and infrastructure */
  SYSTEM = 'system',
  
  /** User input and interface errors */
  USER_INPUT = 'user_input'
}

/**
 * Error severity levels for prioritization and response
 * Based on operational impact and required intervention level
 */
export enum ErrorSeverity {
  /** System-critical errors requiring immediate attention */
  CRITICAL = 'critical',
  
  /** High-impact errors that block primary functionality */
  HIGH = 'high',
  
  /** Medium-impact errors with available workarounds */
  MEDIUM = 'medium',
  
  /** Low-impact errors that don't block core functionality */
  LOW = 'low',
  
  /** Informational messages that may indicate potential issues */
  INFO = 'info'
}

/**
 * Recovery strategies for automated error handling
 * Defines possible automated responses to different error types
 */
export enum RecoveryStrategy {
  /** No recovery possible - manual intervention required */
  NONE = 'none',
  
  /** Retry the operation with exponential backoff */
  RETRY = 'retry',
  
  /** Retry with different parameters or configuration */
  RETRY_WITH_FALLBACK = 'retry_with_fallback',
  
  /** Skip the current operation and continue */
  SKIP = 'skip',
  
  /** Reset to a previous known good state */
  RESET = 'reset',
  
  /** Degrade functionality but continue operation */
  DEGRADE = 'degrade',
  
  /** Escalate to human intervention */
  ESCALATE = 'escalate'
}

// =============================================================================
// SPECIFIC ERROR CODES
// =============================================================================

/**
 * Authentication and authorization error codes
 * Covers all identity and access management scenarios
 */
export enum AuthenticationErrorCode {
  /** Invalid or missing API key */
  INVALID_API_KEY = 'INVALID_API_KEY',
  
  /** API key has expired and needs renewal */
  EXPIRED_API_KEY = 'EXPIRED_API_KEY',
  
  /** API key lacks required permissions */
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  
  /** Authentication token is malformed */
  MALFORMED_TOKEN = 'MALFORMED_TOKEN',
  
  /** User session has expired */
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  
  /** Account has been suspended or disabled */
  ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED',
  
  /** Two-factor authentication required */
  MFA_REQUIRED = 'MFA_REQUIRED',
  
  /** Rate limit exceeded for authentication attempts */
  AUTH_RATE_LIMITED = 'AUTH_RATE_LIMITED'
}

/**
 * AI Provider specific error codes
 * Comprehensive coverage of all AI service integration failures
 */
export enum AIProviderErrorCode {
  /** Provider service is temporarily unavailable */
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  
  /** API request has exceeded rate limits */
  RATE_LIMITED = 'RATE_LIMITED',
  
  /** Account has insufficient balance or credits */
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  
  /** Request exceeds model's context window */
  CONTEXT_LENGTH_EXCEEDED = 'CONTEXT_LENGTH_EXCEEDED',
  
  /** Model is not available or has been deprecated */
  MODEL_UNAVAILABLE = 'MODEL_UNAVAILABLE',
  
  /** Input content violates provider policies */
  CONTENT_FILTERED = 'CONTENT_FILTERED',
  
  /** Request format is invalid or unsupported */
  INVALID_REQUEST_FORMAT = 'INVALID_REQUEST_FORMAT',
  
  /** Connection to provider timed out */
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  
  /** Provider returned an unexpected response */
  UNEXPECTED_RESPONSE = 'UNEXPECTED_RESPONSE',
  
  /** Model is overloaded and cannot process request */
  MODEL_OVERLOADED = 'MODEL_OVERLOADED',
  
  /** Provider endpoint is not responding */
  ENDPOINT_UNREACHABLE = 'ENDPOINT_UNREACHABLE'
}

/**
 * Context management and RAG system error codes
 * Specialized errors for semantic search and context operations
 */
export enum ContextErrorCode {
  /** Vector embedding generation failed */
  EMBEDDING_GENERATION_FAILED = 'EMBEDDING_GENERATION_FAILED',
  
  /** Vector database is unavailable or corrupted */
  VECTOR_DB_UNAVAILABLE = 'VECTOR_DB_UNAVAILABLE',
  
  /** Similarity search returned no results */
  NO_RELEVANT_CONTEXT = 'NO_RELEVANT_CONTEXT',
  
  /** Context exceeds maximum allowed size */
  CONTEXT_SIZE_EXCEEDED = 'CONTEXT_SIZE_EXCEEDED',
  
  /** Context compression failed */
  COMPRESSION_FAILED = 'COMPRESSION_FAILED',
  
  /** Circular dependency detected in context */
  CIRCULAR_DEPENDENCY = 'CIRCULAR_DEPENDENCY',
  
  /** Context indexing operation failed */
  INDEXING_FAILED = 'INDEXING_FAILED',
  
  /** Context retrieval optimization failed */
  OPTIMIZATION_FAILED = 'OPTIMIZATION_FAILED',
  
  /** Semantic chunking process failed */
  CHUNKING_FAILED = 'CHUNKING_FAILED'
}

/**
 * File system operation error codes
 * Comprehensive file and directory management errors
 */
export enum FilesystemErrorCode {
  /** File or directory not found */
  NOT_FOUND = 'NOT_FOUND',
  
  /** Permission denied for file operation */
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  
  /** File already exists and cannot be overwritten */
  FILE_EXISTS = 'FILE_EXISTS',
  
  /** Disk space insufficient for operation */
  DISK_FULL = 'DISK_FULL',
  
  /** Path contains invalid characters */
  INVALID_PATH = 'INVALID_PATH',
  
  /** File is locked by another process */
  FILE_LOCKED = 'FILE_LOCKED',
  
  /** File is too large to process */
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  
  /** File format is not supported */
  UNSUPPORTED_FORMAT = 'UNSUPPORTED_FORMAT',
  
  /** File is corrupted or unreadable */
  CORRUPTED_FILE = 'CORRUPTED_FILE',
  
  /** Maximum number of files exceeded */
  TOO_MANY_FILES = 'TOO_MANY_FILES'
}

/**
 * Database operation error codes
 * Persistent storage and data integrity errors
 */
export enum DatabaseErrorCode {
  /** Database connection failed or lost */
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  
  /** Database query syntax is invalid */
  INVALID_QUERY = 'INVALID_QUERY',
  
  /** Data constraint violation */
  CONSTRAINT_VIOLATION = 'CONSTRAINT_VIOLATION',
  
  /** Database is locked by another process */
  DATABASE_LOCKED = 'DATABASE_LOCKED',
  
  /** Data corruption detected */
  DATA_CORRUPTION = 'DATA_CORRUPTION',
  
  /** Database schema version mismatch */
  SCHEMA_MISMATCH = 'SCHEMA_MISMATCH',
  
  /** Migration operation failed */
  MIGRATION_FAILED = 'MIGRATION_FAILED',
  
  /** Transaction rolled back */
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  
  /** Duplicate key violation */
  DUPLICATE_KEY = 'DUPLICATE_KEY',
  
  /** Database storage full */
  STORAGE_FULL = 'STORAGE_FULL'
}

/**
 * Configuration and validation error codes
 * Settings, preferences, and setup validation errors
 */
export enum ConfigurationErrorCode {
  /** Configuration file is missing */
  MISSING_CONFIG = 'MISSING_CONFIG',
  
  /** Configuration format is invalid */
  INVALID_FORMAT = 'INVALID_FORMAT',
  
  /** Required configuration parameter is missing */
  MISSING_PARAMETER = 'MISSING_PARAMETER',
  
  /** Configuration parameter has invalid value */
  INVALID_PARAMETER = 'INVALID_PARAMETER',
  
  /** Configuration schema validation failed */
  SCHEMA_VALIDATION_FAILED = 'SCHEMA_VALIDATION_FAILED',
  
  /** Environment variable is missing or invalid */
  INVALID_ENVIRONMENT = 'INVALID_ENVIRONMENT',
  
  /** Configuration conflicts detected */
  CONFLICTING_CONFIG = 'CONFLICTING_CONFIG',
  
  /** Configuration version is unsupported */
  UNSUPPORTED_VERSION = 'UNSUPPORTED_VERSION'
}

/**
 * AI generation specific error codes
 * Code generation, validation, and processing errors
 */
export enum AIGenerationErrorCode {
  /** AI generation request timed out */
  GENERATION_TIMEOUT = 'GENERATION_TIMEOUT',
  
  /** Generated content failed validation */
  INVALID_OUTPUT = 'INVALID_OUTPUT',
  
  /** Generation context is incomplete */
  INCOMPLETE_CONTEXT = 'INCOMPLETE_CONTEXT',
  
  /** Generation request was rejected */
  REQUEST_REJECTED = 'REQUEST_REJECTED',
  
  /** Output parsing failed */
  PARSING_FAILED = 'PARSING_FAILED',
  
  /** Generated code has compilation errors */
  COMPILATION_ERROR = 'COMPILATION_ERROR',
  
  /** Generation confidence too low */
  LOW_CONFIDENCE = 'LOW_CONFIDENCE',
  
  /** Output format not recognized */
  UNKNOWN_FORMAT = 'UNKNOWN_FORMAT',
  
  /** Generation was truncated */
  TRUNCATED_OUTPUT = 'TRUNCATED_OUTPUT'
}

/**
 * Phase management error codes
 * 7-phase methodology workflow errors
 */
export enum PhaseErrorCode {
  /** Phase transition is not allowed */
  INVALID_TRANSITION = 'INVALID_TRANSITION',
  
  /** Phase prerequisites not met */
  PREREQUISITES_NOT_MET = 'PREREQUISITES_NOT_MET',
  
  /** Phase execution failed */
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  
  /** Phase validation failed */
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  
  /** Phase timeout exceeded */
  PHASE_TIMEOUT = 'PHASE_TIMEOUT',
  
  /** Required artifacts missing */
  MISSING_ARTIFACTS = 'MISSING_ARTIFACTS',
  
  /** Phase rollback failed */
  ROLLBACK_FAILED = 'ROLLBACK_FAILED',
  
  /** Concurrent phase execution detected */
  CONCURRENT_EXECUTION = 'CONCURRENT_EXECUTION'
}

// =============================================================================
// ERROR DETAIL INTERFACES
// =============================================================================

/**
 * Base error details interface for all ReadyAI errors
 * Provides structured information for error handling and recovery
 */
export interface BaseErrorDetails {
  /** Unique error instance identifier */
  errorId: UUID
  
  /** Error category for classification */
  category: ErrorCategory
  
  /** Error severity level */
  severity: ErrorSeverity
  
  /** Suggested recovery strategy */
  recoveryStrategy: RecoveryStrategy
  
  /** Error occurrence timestamp */
  timestamp: string
  
  /** Component or service where error occurred */
  source?: string
  
  /** Operation that was being performed */
  operation?: string
  
  /** User-friendly error message */
  userMessage?: string
  
  /** Technical error details for debugging */
  technicalDetails?: Record<string, any>
  
  /** Related error IDs for error chains */
  relatedErrors?: UUID[]
  
  /** Whether this error is retryable */
  retryable: boolean
  
  /** Suggested retry delay in milliseconds */
  retryDelay?: number
  
  /** Maximum retry attempts recommended */
  maxRetries?: number
}

/**
 * Authentication error details
 * Specific information for identity and access errors
 */
export interface AuthenticationErrorDetails extends BaseErrorDetails {
  category: ErrorCategory.AUTHENTICATION
  code: AuthenticationErrorCode
  
  /** Provider or service that failed authentication */
  provider?: string
  
  /** Username or identifier involved */
  username?: string
  
  /** Authentication method used */
  authMethod?: string
  
  /** Token or credential type */
  credentialType?: string
  
  /** Expiration time for expired credentials */
  expiresAt?: string
}

/**
 * AI Provider error details
 * Specific information for AI service integration errors
 */
export interface AIProviderErrorDetails extends BaseErrorDetails {
  category: ErrorCategory.API_PROVIDER
  code: AIProviderErrorCode
  
  /** AI provider name */
  provider: string
  
  /** Model identifier */
  modelId?: string
  
  /** Request ID for tracking */
  requestId?: string
  
  /** Rate limit information */
  rateLimitInfo?: {
    limit: number
    remaining: number
    resetAt: string
  }
  
  /** Token usage details */
  tokenUsage?: {
    requested: number
    limit: number
  }
  
  /** HTTP status code */
  statusCode?: number
  
  /** Provider-specific error code */
  providerCode?: string
}

/**
 * Context management error details
 * Specific information for RAG and semantic search errors
 */
export interface ContextErrorDetails extends BaseErrorDetails {
  category: ErrorCategory.CONTEXT_MANAGEMENT
  code: ContextErrorCode
  
  /** Context operation type */
  contextOperation?: string
  
  /** Number of documents processed */
  documentCount?: number
  
  /** Context size in tokens */
  contextSize?: number
  
  /** Vector dimension information */
  vectorDimension?: number
  
  /** Similarity threshold used */
  similarityThreshold?: number
  
  /** Query that failed */
  failedQuery?: string
}

/**
 * File system error details
 * Specific information for file and directory operations
 */
export interface FilesystemErrorDetails extends BaseErrorDetails {
  category: ErrorCategory.FILESYSTEM
  code: FilesystemErrorCode
  
  /** File or directory path */
  path: string
  
  /** File operation attempted */
  operation: 'read' | 'write' | 'delete' | 'create' | 'move' | 'copy'
  
  /** File size in bytes */
  fileSize?: number
  
  /** Available disk space in bytes */
  availableSpace?: number
  
  /** File permissions */
  permissions?: string
  
  /** Process ID that owns the lock */
  lockOwner?: number
}

/**
 * Database error details
 * Specific information for data persistence operations
 */
export interface DatabaseErrorDetails extends BaseErrorDetails {
  category: ErrorCategory.DATABASE
  code: DatabaseErrorCode
  
  /** Database operation type */
  operation: 'select' | 'insert' | 'update' | 'delete' | 'migrate' | 'connect'
  
  /** Table or collection name */
  table?: string
  
  /** Query that failed */
  query?: string
  
  /** Database transaction ID */
  transactionId?: string
  
  /** Constraint that was violated */
  constraint?: string
  
  /** Database engine type */
  engine?: string
}

/**
 * Configuration error details
 * Specific information for settings and setup validation
 */
export interface ConfigurationErrorDetails extends BaseErrorDetails {
  category: ErrorCategory.CONFIGURATION
  code: ConfigurationErrorCode
  
  /** Configuration file path */
  configPath?: string
  
  /** Configuration key that failed */
  configKey?: string
  
  /** Expected value type or format */
  expectedFormat?: string
  
  /** Actual value received */
  actualValue?: any
  
  /** Configuration schema version */
  schemaVersion?: string
  
  /** List of validation errors */
  validationErrors?: string[]
}

/**
 * AI generation error details
 * Specific information for code generation and AI processing
 */
export interface AIGenerationErrorDetails extends BaseErrorDetails {
  category: ErrorCategory.AI_GENERATION
  code: AIGenerationErrorCode
  
  /** Generation request ID */
  requestId?: string
  
  /** Target file being generated */
  targetFile?: string
  
  /** Current phase when error occurred */
  phase?: string
  
  /** Generation confidence score */
  confidenceScore?: number
  
  /** Minimum required confidence */
  minConfidence?: number
  
  /** Partial output received */
  partialOutput?: string
  
  /** Compilation errors */
  compilationErrors?: string[]
  
  /** AI provider used */
  aiProvider?: string
  
  /** Model used for generation */
  modelId?: string
}

/**
 * Phase management error details
 * Specific information for workflow phase operations
 */
export interface PhaseErrorDetails extends BaseErrorDetails {
  category: ErrorCategory.PHASE_MANAGEMENT
  code: PhaseErrorCode
  
  /** Current phase identifier */
  currentPhase: string
  
  /** Target phase for transition */
  targetPhase?: string
  
  /** Missing prerequisites */
  missingPrerequisites?: string[]
  
  /** Required artifacts not found */
  missingArtifacts?: string[]
  
  /** Phase execution duration */
  executionDuration?: number
  
  /** Phase timeout limit */
  timeoutLimit?: number
  
  /** Artifacts generated before failure */
  partialArtifacts?: string[]
}

// =============================================================================
// UNION TYPES FOR ERROR DETAILS
// =============================================================================

/**
 * Union type for all specific error detail interfaces
 * Enables type-safe error handling across all error categories
 */
export type ErrorDetails = 
  | AuthenticationErrorDetails
  | AIProviderErrorDetails
  | ContextErrorDetails
  | FilesystemErrorDetails
  | DatabaseErrorDetails
  | ConfigurationErrorDetails
  | AIGenerationErrorDetails
  | PhaseErrorDetails

/**
 * Union type for all error codes
 * Comprehensive enumeration of all possible error scenarios
 */
export type ErrorCode = 
  | AuthenticationErrorCode
  | AIProviderErrorCode
  | ContextErrorCode
  | FilesystemErrorCode
  | DatabaseErrorCode
  | ConfigurationErrorCode
  | AIGenerationErrorCode
  | PhaseErrorCode

// =============================================================================
// ERROR FACTORY AND UTILITIES
// =============================================================================

/**
 * Enhanced ReadyAI Error class with structured error details
 * Extends the base ReadyAIError with comprehensive error information
 */
export class DetailedReadyAIError extends ReadyAIError {
  constructor(
    public readonly details: ErrorDetails,
    cause?: Error
  ) {
    super(
      details.userMessage || details.technicalDetails?.message || 'An error occurred',
      details.technicalDetails?.code,
      details.technicalDetails?.statusCode,
      details.technicalDetails,
      details.retryable,
      details.retryDelay
    )
    
    this.name = 'DetailedReadyAIError'
    this.cause = cause
  }
  
  /**
   * Check if error matches specific category
   */
  isCategory(category: ErrorCategory): boolean {
    return this.details.category === category
  }
  
  /**
   * Check if error has specific severity
   */
  hasSeverity(severity: ErrorSeverity): boolean {
    return this.details.severity === severity
  }
  
  /**
   * Get suggested recovery strategy
   */
  getRecoveryStrategy(): RecoveryStrategy {
    return this.details.recoveryStrategy
  }
  
  /**
   * Check if error is retryable
   */
  isRetryable(): boolean {
    return this.details.retryable
  }
  
  /**
   * Get retry configuration
   */
  getRetryConfig(): { maxRetries: number; delay: number } | null {
    if (!this.details.retryable) return null
    
    return {
      maxRetries: this.details.maxRetries || 3,
      delay: this.details.retryDelay || 1000
    }
  }
  
  /**
   * Convert to structured JSON for logging
   */
  toStructuredLog(): Record<string, any> {
    return {
      errorId: this.details.errorId,
      category: this.details.category,
      severity: this.details.severity,
      code: (this.details as any).code,
      message: this.message,
      source: this.details.source,
      operation: this.details.operation,
      timestamp: this.details.timestamp,
      retryable: this.details.retryable,
      recoveryStrategy: this.details.recoveryStrategy,
      technicalDetails: this.details.technicalDetails,
      stack: this.stack
    }
  }
}

/**
 * Error factory for creating standardized ReadyAI errors
 * Provides convenient methods for common error scenarios
 */
export class ErrorFactory {
  /**
   * Create an authentication error
   */
  static createAuthError(
    code: AuthenticationErrorCode,
    message: string,
    options: Partial<AuthenticationErrorDetails> = {}
  ): DetailedReadyAIError {
    const details: AuthenticationErrorDetails = {
      errorId: generateUUID(),
      category: ErrorCategory.AUTHENTICATION,
      severity: ErrorSeverity.HIGH,
      recoveryStrategy: RecoveryStrategy.ESCALATE,
      timestamp: createTimestamp(),
      retryable: false,
      code,
      userMessage: message,
      ...options
    }
    
    return new DetailedReadyAIError(details)
  }
  
  /**
   * Create an AI provider error
   */
  static createAIProviderError(
    code: AIProviderErrorCode,
    provider: string,
    message: string,
    options: Partial<AIProviderErrorDetails> = {}
  ): DetailedReadyAIError {
    const severity = code === AIProviderErrorCode.RATE_LIMITED ? ErrorSeverity.MEDIUM : ErrorSeverity.HIGH
    const recoveryStrategy = code === AIProviderErrorCode.RATE_LIMITED ? RecoveryStrategy.RETRY : RecoveryStrategy.RETRY_WITH_FALLBACK
    const retryable = [AIProviderErrorCode.RATE_LIMITED, AIProviderErrorCode.CONNECTION_TIMEOUT, AIProviderErrorCode.SERVICE_UNAVAILABLE].includes(code)
    
    const details: AIProviderErrorDetails = {
      errorId: generateUUID(),
      category: ErrorCategory.API_PROVIDER,
      severity,
      recoveryStrategy,
      timestamp: createTimestamp(),
      retryable,
      code,
      provider,
      userMessage: message,
      ...options
    }
    
    return new DetailedReadyAIError(details)
  }
  
  /**
   * Create a context management error
   */
  static createContextError(
    code: ContextErrorCode,
    message: string,
    options: Partial<ContextErrorDetails> = {}
  ): DetailedReadyAIError {
    const details: ContextErrorDetails = {
      errorId: generateUUID(),
      category: ErrorCategory.CONTEXT_MANAGEMENT,
      severity: ErrorSeverity.MEDIUM,
      recoveryStrategy: RecoveryStrategy.RETRY_WITH_FALLBACK,
      timestamp: createTimestamp(),
      retryable: true,
      code,
      userMessage: message,
      ...options
    }
    
    return new DetailedReadyAIError(details)
  }
  
  /**
   * Create a filesystem error
   */
  static createFilesystemError(
    code: FilesystemErrorCode,
    path: string,
    operation: string,
    message: string,
    options: Partial<FilesystemErrorDetails> = {}
  ): DetailedReadyAIError {
    const retryable = [FilesystemErrorCode.FILE_LOCKED, FilesystemErrorCode.DISK_FULL].includes(code)
    const severity = code === FilesystemErrorCode.PERMISSION_DENIED ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM
    
    const details: FilesystemErrorDetails = {
      errorId: generateUUID(),
      category: ErrorCategory.FILESYSTEM,
      severity,
      recoveryStrategy: retryable ? RecoveryStrategy.RETRY : RecoveryStrategy.ESCALATE,
      timestamp: createTimestamp(),
      retryable,
      code,
      path,
      operation: operation as any,
      userMessage: message,
      ...options
    }
    
    return new DetailedReadyAIError(details)
  }
  
  /**
   * Create a phase management error
   */
  static createPhaseError(
    code: PhaseErrorCode,
    currentPhase: string,
    message: string,
    options: Partial<PhaseErrorDetails> = {}
  ): DetailedReadyAIError {
    const details: PhaseErrorDetails = {
      errorId: generateUUID(),
      category: ErrorCategory.PHASE_MANAGEMENT,
      severity: ErrorSeverity.HIGH,
      recoveryStrategy: RecoveryStrategy.RESET,
      timestamp: createTimestamp(),
      retryable: code !== PhaseErrorCode.INVALID_TRANSITION,
      code,
      currentPhase,
      userMessage: message,
      ...options
    }
    
    return new DetailedReadyAIError(details)
  }
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Type guard to check if error is a DetailedReadyAIError
 */
export function isDetailedReadyAIError(error: unknown): error is DetailedReadyAIError {
  return error instanceof DetailedReadyAIError
}

/**
 * Type guard to check if error belongs to specific category
 */
export function isErrorCategory(error: unknown, category: ErrorCategory): boolean {
  return isDetailedReadyAIError(error) && error.details.category === category
}

/**
 * Type guard to check if error has specific severity
 */
export function isErrorSeverity(error: unknown, severity: ErrorSeverity): boolean {
  return isDetailedReadyAIError(error) && error.details.severity === severity
}

/**
 * Type guard to check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  return isDetailedReadyAIError(error) && error.details.retryable
}

// =============================================================================
// ERROR CONSTANTS
// =============================================================================

/**
 * Default retry configuration for different error categories
 */
export const DEFAULT_RETRY_CONFIG: Record<ErrorCategory, { maxRetries: number; baseDelay: number }> = {
  [ErrorCategory.AUTHENTICATION]: { maxRetries: 1, baseDelay: 0 },
  [ErrorCategory.API_PROVIDER]: { maxRetries: 3, baseDelay: 1000 },
  [ErrorCategory.CONTEXT_MANAGEMENT]: { maxRetries: 2, baseDelay: 500 },
  [ErrorCategory.FILESYSTEM]: { maxRetries: 3, baseDelay: 100 },
  [ErrorCategory.DATABASE]: { maxRetries: 3, baseDelay: 200 },
  [ErrorCategory.CONFIGURATION]: { maxRetries: 0, baseDelay: 0 },
  [ErrorCategory.AI_GENERATION]: { maxRetries: 2, baseDelay: 2000 },
  [ErrorCategory.DEPENDENCY]: { maxRetries: 1, baseDelay: 100 },
  [ErrorCategory.PHASE_MANAGEMENT]: { maxRetries: 1, baseDelay: 0 },
  [ErrorCategory.VALIDATION]: { maxRetries: 0, baseDelay: 0 },
  [ErrorCategory.NETWORK]: { maxRetries: 3, baseDelay: 1000 },
  [ErrorCategory.RESOURCE]: { maxRetries: 2, baseDelay: 1000 },
  [ErrorCategory.SYSTEM]: { maxRetries: 1, baseDelay: 5000 },
  [ErrorCategory.USER_INPUT]: { maxRetries: 0, baseDelay: 0 }
}

/**
 * Error severity priority mapping for incident handling
 */
export const SEVERITY_PRIORITY: Record<ErrorSeverity, number> = {
  [ErrorSeverity.CRITICAL]: 1,
  [ErrorSeverity.HIGH]: 2,
  [ErrorSeverity.MEDIUM]: 3,
  [ErrorSeverity.LOW]: 4,
  [ErrorSeverity.INFO]: 5
}

// =============================================================================
// EXPORTS
// =============================================================================

// Export all enums
export {
  ErrorCategory,
  ErrorSeverity,
  RecoveryStrategy,
  AuthenticationErrorCode,
  AIProviderErrorCode,
  ContextErrorCode,
  FilesystemErrorCode,
  DatabaseErrorCode,
  ConfigurationErrorCode,
  AIGenerationErrorCode,
  PhaseErrorCode
}

// Export all interfaces
export type {
  BaseErrorDetails,
  AuthenticationErrorDetails,
  AIProviderErrorDetails,
  ContextErrorDetails,
  FilesystemErrorDetails,
  DatabaseErrorDetails,
  ConfigurationErrorDetails,
  AIGenerationErrorDetails,
  PhaseErrorDetails,
  ErrorDetails,
  ErrorCode
}

// Export classes and utilities
export {
  DetailedReadyAIError,
  ErrorFactory,
  isDetailedReadyAIError,
  isErrorCategory,
  isErrorSeverity,
  isRetryableError
}

// Export constants
export {
  DEFAULT_RETRY_CONFIG,
  SEVERITY_PRIORITY
}
