// packages\logging\services\ErrorService.ts

/**
 * ErrorService - Production-Ready Error Management System
 * 
 * Advanced error handling service extracted and adapted from Cline's battle-tested
 * error management architecture. Provides comprehensive error categorization,
 * recovery strategies, correlation tracking, and intelligent retry mechanisms.
 * 
 * Key Features:
 * - ReadyAI-specific error categorization and recovery strategies
 * - Intelligent retry mechanisms with exponential backoff
 * - Comprehensive error correlation and context preservation
 * - Production-grade telemetry and monitoring integration
 * - Memory-efficient error aggregation and reporting
 * - Real-time error alerting and notification system
 */

import { 
  UUID, 
  ReadyAIError, 
  ApiResult, 
  ApiResponse, 
  ApiErrorResponse,
  createApiError,
  wrapAsync,
  AsyncResult
} from '../../foundation/types/core'
import {
  LogLevel,
  LogContext,
  ErrorSeverity,
  ErrorCategory,
  ErrorRecoveryStrategy,
  ErrorAggregation,
  ErrorMetrics,
  ErrorAlert,
  ErrorCorrelation,
  RetryPolicy,
  CircuitBreakerState,
  ILoggerService
} from '../types/logging'
import { Logger } from './Logger'

/**
 * Enhanced error context for comprehensive error tracking
 * Extends Cline's error context patterns with ReadyAI-specific metadata
 */
interface ErrorContext extends LogContext {
  /** ReadyAI-specific error category */
  category: ErrorCategory
  /** Error severity level */
  severity: ErrorSeverity
  /** Suggested recovery strategy */
  recoveryStrategy: ErrorRecoveryStrategy
  /** Error occurrence timestamp */
  timestamp: string
  /** Stack trace for debugging */
  stackTrace?: string
  /** Related operation context */
  operationContext?: {
    operationType: string
    operationId: UUID
    userId?: UUID
    sessionId?: UUID
  }
  /** System context at time of error */
  systemContext?: {
    memoryUsage: number
    cpuUsage: number
    activeConnections: number
    requestQueue: number
  }
  /** Error correlation data */
  correlation?: ErrorCorrelation
}

/**
 * Error occurrence tracking for pattern analysis
 */
interface ErrorOccurrence {
  errorId: UUID
  message: string
  category: ErrorCategory
  severity: ErrorSeverity
  timestamp: string
  context: ErrorContext
  resolved: boolean
  resolutionTime?: string
  resolutionStrategy?: string
  retryCount: number
  similarErrors: UUID[]
}

/**
 * Circuit breaker implementation for preventing cascading failures
 * Adapted from Cline's robust failure prevention patterns
 */
class CircuitBreaker {
  private state: CircuitBreakerState = 'closed'
  private failureCount = 0
  private lastFailureTime?: Date
  private nextAttemptTime?: Date

  constructor(
    private readonly threshold: number = 5,
    private readonly timeout: number = 60000,
    private readonly resetTimeout: number = 300000
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.nextAttemptTime && Date.now() < this.nextAttemptTime.getTime()) {
        throw new ReadyAIError(
          'Circuit breaker is open - operation blocked',
          'CIRCUIT_BREAKER_OPEN',
          503,
          { state: this.state, nextAttemptTime: this.nextAttemptTime }
        )
      }
      this.state = 'half-open'
    }

    try {
      const result = await operation()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private onSuccess(): void {
    this.failureCount = 0
    this.state = 'closed'
    this.nextAttemptTime = undefined
  }

  private onFailure(): void {
    this.failureCount++
    this.lastFailureTime = new Date()

    if (this.failureCount >= this.threshold) {
      this.state = 'open'
      this.nextAttemptTime = new Date(Date.now() + this.resetTimeout)
    }
  }

  getState(): CircuitBreakerState {
    return this.state
  }

  getMetrics() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime
    }
  }
}

/**
 * Advanced retry mechanism with intelligent backoff strategies
 * Leverages Cline's proven retry patterns with ReadyAI enhancements
 */
class RetryManager {
  /**
   * Execute operation with intelligent retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    policy: RetryPolicy,
    context: ErrorContext
  ): Promise<T> {
    let lastError: Error | undefined
    let attempt = 0

    while (attempt <= policy.maxAttempts) {
      try {
        if (attempt > 0) {
          const delay = this.calculateDelay(attempt, policy)
          await this.sleep(delay)
        }

        const result = await operation()
        
        if (attempt > 0) {
          // Log successful retry
          await Logger.info('Operation succeeded after retry', {
            ...context,
            attempt,
            totalAttempts: policy.maxAttempts,
            strategy: policy.backoffStrategy
          })
        }

        return result
      } catch (error) {
        lastError = error
        attempt++

        const shouldRetry = this.shouldRetry(error, attempt, policy, context)
        if (!shouldRetry) {
          break
        }

        await Logger.warn('Operation failed, retrying', {
          ...context,
          attempt,
          totalAttempts: policy.maxAttempts,
          error: error instanceof Error ? error.message : 'Unknown error',
          nextRetryIn: this.calculateDelay(attempt, policy)
        })
      }
    }

    throw new ReadyAIError(
      `Operation failed after ${attempt} attempts: ${lastError?.message || 'Unknown error'}`,
      'RETRY_EXHAUSTED',
      500,
      {
        originalError: lastError,
        attempts: attempt,
        maxAttempts: policy.maxAttempts,
        context
      },
      false // Not retryable since we've exhausted retries
    )
  }

  private shouldRetry(
    error: any,
    attempt: number,
    policy: RetryPolicy,
    context: ErrorContext
  ): boolean {
    if (attempt >= policy.maxAttempts) {
      return false
    }

    // Don't retry certain error types
    if (error instanceof ReadyAIError && !error.retryable) {
      return false
    }

    // Apply retry conditions
    if (policy.retryConditions.length > 0) {
      return policy.retryConditions.some(condition => {
        switch (condition.type) {
          case 'errorCode':
            return error.code === condition.value
          case 'httpStatus':
            return error.statusCode === condition.value
          case 'errorMessage':
            return error.message?.includes(condition.value)
          case 'errorType':
            return error.constructor.name === condition.value
          default:
            return false
        }
      })
    }

    // Default retry logic for common recoverable errors
    const recoverableErrors = ['NETWORK_ERROR', 'TIMEOUT', 'RATE_LIMIT', 'SERVICE_UNAVAILABLE']
    return recoverableErrors.includes(error.code) || 
           (error.statusCode >= 500 && error.statusCode < 600)
  }

  private calculateDelay(attempt: number, policy: RetryPolicy): number {
    const baseDelay = policy.baseDelay || 1000

    switch (policy.backoffStrategy) {
      case 'exponential':
        return Math.min(baseDelay * Math.pow(2, attempt - 1), policy.maxDelay || 30000)
      case 'linear':
        return Math.min(baseDelay * attempt, policy.maxDelay || 30000)
      case 'fixed':
        return baseDelay
      case 'jittered':
        const exponential = Math.min(baseDelay * Math.pow(2, attempt - 1), policy.maxDelay || 30000)
        return exponential * (0.5 + Math.random() * 0.5) // Add jitter
      default:
        return baseDelay
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

/**
 * Production-Ready Error Service
 * Comprehensive error management with advanced features from Cline's architecture
 */
export class ErrorService implements ILoggerService {
  private static instance: ErrorService
  private readonly logger: Logger
  private readonly retryManager: RetryManager
  private readonly circuitBreakers: Map<string, CircuitBreaker>
  private readonly errorOccurrences: Map<UUID, ErrorOccurrence>
  private readonly errorAggregations: Map<string, ErrorAggregation>
  private readonly activeAlerts: Map<UUID, ErrorAlert>
  
  // Performance and monitoring
  private readonly maxErrorHistorySize = 10000
  private readonly aggregationWindowMs = 300000 // 5 minutes
  private readonly alertCooldownMs = 900000 // 15 minutes
  
  // Default retry policies for different error categories
  private readonly defaultRetryPolicies: Map<ErrorCategory, RetryPolicy> = new Map([
    ['network', {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffStrategy: 'exponential',
      retryConditions: [
        { type: 'errorCode', value: 'NETWORK_ERROR' },
        { type: 'httpStatus', value: 503 },
        { type: 'httpStatus', value: 502 }
      ]
    }],
    ['ai_provider', {
      maxAttempts: 2,
      baseDelay: 2000,
      maxDelay: 15000,
      backoffStrategy: 'jittered',
      retryConditions: [
        { type: 'errorCode', value: 'RATE_LIMIT' },
        { type: 'errorCode', value: 'SERVICE_UNAVAILABLE' }
      ]
    }],
    ['database', {
      maxAttempts: 2,
      baseDelay: 500,
      maxDelay: 5000,
      backoffStrategy: 'linear',
      retryConditions: [
        { type: 'errorCode', value: 'CONNECTION_ERROR' },
        { type: 'errorCode', value: 'TIMEOUT' }
      ]
    }],
    ['validation', {
      maxAttempts: 0, // Don't retry validation errors
      baseDelay: 0,
      maxDelay: 0,
      backoffStrategy: 'fixed',
      retryConditions: []
    }]
  ])

  private constructor() {
    this.logger = Logger.getInstance()
    this.retryManager = new RetryManager()
    this.circuitBreakers = new Map()
    this.errorOccurrences = new Map()
    this.errorAggregations = new Map()
    this.activeAlerts = new Map()

    // Start background tasks
    this.startErrorAggregation()
    this.startAlertManagement()
    this.startMetricsCollection()
  }

  /**
   * Get singleton instance of ErrorService
   */
  static getInstance(): ErrorService {
    if (!ErrorService.instance) {
      ErrorService.instance = new ErrorService()
    }
    return ErrorService.instance
  }

  /**
   * Handle error with comprehensive processing and recovery strategies
   * Core method adapted from Cline's error handling patterns
   */
  async handleError(
    error: Error | ReadyAIError | any,
    context: Partial<ErrorContext> = {}
  ): Promise<ErrorOccurrence> {
    const errorId = crypto.randomUUID() as UUID
    const timestamp = new Date().toISOString()

    // Normalize error to ReadyAIError
    const normalizedError = this.normalizeError(error)
    
    // Build complete error context
    const completeContext: ErrorContext = {
      ...context,
      category: context.category || this.categorizeError(normalizedError),
      severity: context.severity || this.determineSeverity(normalizedError),
      recoveryStrategy: context.recoveryStrategy || this.determineRecoveryStrategy(normalizedError),
      timestamp,
      stackTrace: normalizedError.stack,
      operationId: context.operationId || crypto.randomUUID() as UUID,
      correlation: await this.buildErrorCorrelation(normalizedError, context)
    }

    // Create error occurrence record
    const occurrence: ErrorOccurrence = {
      errorId,
      message: normalizedError.message,
      category: completeContext.category,
      severity: completeContext.severity,
      timestamp,
      context: completeContext,
      resolved: false,
      retryCount: 0,
      similarErrors: this.findSimilarErrors(normalizedError)
    }

    // Store error occurrence
    this.errorOccurrences.set(errorId, occurrence)

    // Log error with appropriate level
    await this.logError(normalizedError, completeContext)

    // Update error aggregations
    this.updateErrorAggregations(occurrence)

    // Check and trigger alerts
    await this.checkAndTriggerAlerts(occurrence)

    // Clean up old errors to prevent memory leaks
    this.cleanupOldErrors()

    return occurrence
  }

  /**
   * Execute operation with comprehensive error handling and recovery
   */
  async executeWithErrorHandling<T>(
    operation: () => Promise<T>,
    context: Partial<ErrorContext> = {},
    customRetryPolicy?: RetryPolicy
  ): Promise<ApiResult<T>> {
    return wrapAsync(async () => {
      const category = context.category || 'system'
      const retryPolicy = customRetryPolicy || this.defaultRetryPolicies.get(category)
      
      if (retryPolicy && retryPolicy.maxAttempts > 0) {
        return await this.retryManager.executeWithRetry(
          operation,
          retryPolicy,
          context as ErrorContext
        )
      }

      return await operation()
    })
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async executeWithCircuitBreaker<T>(
    operation: () => Promise<T>,
    circuitBreakerKey: string,
    context: Partial<ErrorContext> = {}
  ): Promise<T> {
    let circuitBreaker = this.circuitBreakers.get(circuitBreakerKey)
    if (!circuitBreaker) {
      circuitBreaker = new CircuitBreaker()
      this.circuitBreakers.set(circuitBreakerKey, circuitBreaker)
    }

    try {
      return await circuitBreaker.execute(operation)
    } catch (error) {
      await this.handleError(error, {
        ...context,
        category: 'system',
        severity: 'high',
        metadata: {
          circuitBreakerKey,
          circuitBreakerState: circuitBreaker.getState()
        }
      })
      throw error
    }
  }

  /**
   * Get comprehensive error metrics and statistics
   */
  getErrorMetrics(): ErrorMetrics {
    const now = Date.now()
    const windowStart = now - this.aggregationWindowMs
    
    const recentErrors = Array.from(this.errorOccurrences.values())
      .filter(error => Date.parse(error.timestamp) >= windowStart)

    const errorsByCategory = new Map<ErrorCategory, number>()
    const errorsBySeverity = new Map<ErrorSeverity, number>()
    let totalErrors = 0
    let resolvedErrors = 0

    recentErrors.forEach(error => {
      totalErrors++
      if (error.resolved) {
        resolvedErrors++
      }

      const categoryCount = errorsByCategory.get(error.category) || 0
      errorsByCategory.set(error.category, categoryCount + 1)

      const severityCount = errorsBySeverity.get(error.severity) || 0
      errorsBySeverity.set(error.severity, severityCount + 1)
    })

    const circuitBreakerMetrics = Object.fromEntries(
      Array.from(this.circuitBreakers.entries()).map(([key, breaker]) => [
        key,
        breaker.getMetrics()
      ])
    )

    return {
      windowStart: new Date(windowStart).toISOString(),
      windowEnd: new Date(now).toISOString(),
      totalErrors,
      resolvedErrors,
      resolutionRate: totalErrors > 0 ? resolvedErrors / totalErrors : 0,
      errorsByCategory: Object.fromEntries(errorsByCategory),
      errorsBySeverity: Object.fromEntries(errorsBySeverity),
      activeAlerts: this.activeAlerts.size,
      circuitBreakerMetrics,
      memoryUsage: {
        errorOccurrences: this.errorOccurrences.size,
        errorAggregations: this.errorAggregations.size,
        circuitBreakers: this.circuitBreakers.size
      }
    }
  }

  /**
   * Get error aggregations for analysis and reporting
   */
  getErrorAggregations(): ErrorAggregation[] {
    return Array.from(this.errorAggregations.values())
      .sort((a, b) => b.count - a.count)
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): ErrorAlert[] {
    return Array.from(this.activeAlerts.values())
  }

  /**
   * Resolve error occurrence
   */
  async resolveError(
    errorId: UUID,
    resolutionStrategy: string,
    context?: Record<string, any>
  ): Promise<boolean> {
    const occurrence = this.errorOccurrences.get(errorId)
    if (!occurrence || occurrence.resolved) {
      return false
    }

    occurrence.resolved = true
    occurrence.resolutionTime = new Date().toISOString()
    occurrence.resolutionStrategy = resolutionStrategy

    await this.logger.info('Error resolved', {
      errorId,
      resolutionStrategy,
      resolutionTime: occurrence.resolutionTime,
      originalTimestamp: occurrence.timestamp,
      context
    })

    return true
  }

  // ILoggerService implementation
  async log(level: LogLevel, message: string, context?: LogContext): Promise<void> {
    if (level === 'error') {
      await this.handleError(new Error(message), context as Partial<ErrorContext>)
    } else {
      await this.logger.log(level, message, context)
    }
  }

  async debug(message: string, context?: LogContext): Promise<void> {
    await this.logger.debug(message, context)
  }

  async info(message: string, context?: LogContext): Promise<void> {
    await this.logger.info(message, context)
  }

  async warn(message: string, context?: LogContext): Promise<void> {
    await this.logger.warn(message, context)
  }

  async error(message: string, context?: LogContext): Promise<void> {
    await this.handleError(new Error(message), context as Partial<ErrorContext>)
  }

  // Private helper methods

  private normalizeError(error: any): ReadyAIError {
    if (error instanceof ReadyAIError) {
      return error
    }

    if (error instanceof Error) {
      return new ReadyAIError(
        error.message,
        'UNKNOWN_ERROR',
        500,
        { originalError: error },
        true
      )
    }

    return new ReadyAIError(
      typeof error === 'string' ? error : 'Unknown error occurred',
      'UNKNOWN_ERROR',
      500,
      { originalError: error },
      true
    )
  }

  private categorizeError(error: ReadyAIError): ErrorCategory {
    const code = error.code || ''
    const message = error.message.toLowerCase()

    if (code.includes('NETWORK') || code.includes('CONNECTION') || message.includes('network')) {
      return 'network'
    }
    if (code.includes('VALIDATION') || code.includes('INVALID') || message.includes('validation')) {
      return 'validation'
    }
    if (code.includes('AUTH') || code.includes('UNAUTHORIZED') || message.includes('auth')) {
      return 'authentication'
    }
    if (code.includes('RATE_LIMIT') || code.includes('AI_') || message.includes('ai provider')) {
      return 'ai_provider'
    }
    if (code.includes('DB') || code.includes('DATABASE') || message.includes('database')) {
      return 'database'
    }
    if (code.includes('FILE') || code.includes('FILESYSTEM') || message.includes('file')) {
      return 'filesystem'
    }
    if (code.includes('CONFIG') || message.includes('configuration')) {
      return 'configuration'
    }

    return 'system'
  }

  private determineSeverity(error: ReadyAIError): ErrorSeverity {
    const code = error.code || ''
    const statusCode = error.statusCode || 500

    // Critical errors
    if (code.includes('SECURITY') || code.includes('DATA_LOSS') || statusCode === 500) {
      return 'critical'
    }

    // High priority errors
    if (code.includes('AUTH') || code.includes('DATABASE') || statusCode >= 400) {
      return 'high'
    }

    // Medium priority errors
    if (code.includes('VALIDATION') || code.includes('NETWORK') || statusCode >= 300) {
      return 'medium'
    }

    return 'low'
  }

  private determineRecoveryStrategy(error: ReadyAIError): ErrorRecoveryStrategy {
    const category = this.categorizeError(error)

    switch (category) {
      case 'network':
      case 'ai_provider':
        return 'retry'
      case 'validation':
        return 'user_input'
      case 'authentication':
        return 'reauthenticate'
      case 'configuration':
        return 'reconfigure'
      case 'database':
      case 'filesystem':
        return 'fallback'
      default:
        return 'manual'
    }
  }

  private async buildErrorCorrelation(
    error: ReadyAIError,
    context: Partial<ErrorContext>
  ): Promise<ErrorCorrelation> {
    return {
      correlationId: crypto.randomUUID() as UUID,
      traceId: context.traceId || crypto.randomUUID() as UUID,
      parentOperationId: context.operationId,
      relatedErrors: this.findSimilarErrors(error).slice(0, 5),
      causedBy: context.correlation?.correlationId,
      userSession: context.userId,
      requestId: context.requestId || crypto.randomUUID() as UUID
    }
  }

  private findSimilarErrors(error: ReadyAIError): UUID[] {
    const similarErrors: UUID[] = []
    const errorMessage = error.message.toLowerCase()
    const errorCode = error.code || ''

    for (const [id, occurrence] of this.errorOccurrences.entries()) {
      if (occurrence.message.toLowerCase().includes(errorMessage.substring(0, 50)) ||
          occurrence.context.metadata?.code === errorCode) {
        similarErrors.push(id)
      }
      
      if (similarErrors.length >= 10) break
    }

    return similarErrors
  }

  private async logError(error: ReadyAIError, context: ErrorContext): Promise<void> {
    const logLevel = this.mapSeverityToLogLevel(context.severity)
    
    await this.logger.log(logLevel, error.message, {
      ...context,
      errorCode: error.code,
      statusCode: error.statusCode,
      retryable: error.retryable,
      errorDetails: error.details
    })
  }

  private mapSeverityToLogLevel(severity: ErrorSeverity): LogLevel {
    switch (severity) {
      case 'critical':
      case 'high':
        return 'error'
      case 'medium':
        return 'warn'
      case 'low':
        return 'info'
      default:
        return 'debug'
    }
  }

  private updateErrorAggregations(occurrence: ErrorOccurrence): void {
    const key = `${occurrence.category}_${occurrence.message.substring(0, 100)}`
    const existing = this.errorAggregations.get(key)

    if (existing) {
      existing.count++
      existing.lastOccurrence = occurrence.timestamp
      existing.occurrences.push(occurrence.errorId)
      if (existing.occurrences.length > 100) {
        existing.occurrences = existing.occurrences.slice(-50)
      }
    } else {
      this.errorAggregations.set(key, {
        id: crypto.randomUUID() as UUID,
        errorPattern: key,
        category: occurrence.category,
        severity: occurrence.severity,
        count: 1,
        firstOccurrence: occurrence.timestamp,
        lastOccurrence: occurrence.timestamp,
        occurrences: [occurrence.errorId],
        recoveryStrategies: [occurrence.context.recoveryStrategy],
        impactedUsers: occurrence.context.operationContext?.userId ? [occurrence.context.operationContext.userId] : [],
        trend: 'increasing'
      })
    }
  }

  private async checkAndTriggerAlerts(occurrence: ErrorOccurrence): Promise<void> {
    const now = Date.now()
    
    // Check for alert conditions
    const shouldAlert = this.shouldTriggerAlert(occurrence)
    if (!shouldAlert) return

    // Check cooldown period
    const alertKey = `${occurrence.category}_${occurrence.severity}`
    const existingAlert = this.activeAlerts.get(alertKey as UUID)
    if (existingAlert && (now - Date.parse(existingAlert.timestamp)) < this.alertCooldownMs) {
      return
    }

    // Create and trigger alert
    const alert: ErrorAlert = {
      id: crypto.randomUUID() as UUID,
      type: 'error_spike',
      severity: occurrence.severity,
      title: `Error Spike Detected: ${occurrence.category}`,
      description: `High frequency of ${occurrence.category} errors detected`,
      timestamp: new Date().toISOString(),
      errorOccurrenceId: occurrence.errorId,
      affectedOperations: [occurrence.context.operationContext?.operationType || 'unknown'],
      suggestedActions: this.getSuggestedActions(occurrence),
      acknowledged: false,
      resolved: false
    }

    this.activeAlerts.set(alert.id, alert)

    // Log alert
    await this.logger.error('Error alert triggered', {
      alertId: alert.id,
      alertType: alert.type,
      severity: alert.severity,
      errorCategory: occurrence.category,
      occurrenceId: occurrence.errorId
    })
  }

  private shouldTriggerAlert(occurrence: ErrorOccurrence): boolean {
    const windowStart = Date.now() - this.aggregationWindowMs
    const recentSimilarErrors = Array.from(this.errorOccurrences.values())
      .filter(error => 
        error.category === occurrence.category &&
        Date.parse(error.timestamp) >= windowStart
      )

    // Alert thresholds based on severity
    const thresholds = {
      critical: 1,
      high: 3,
      medium: 10,
      low: 50
    }

    return recentSimilarErrors.length >= thresholds[occurrence.severity]
  }

  private getSuggestedActions(occurrence: ErrorOccurrence): string[] {
    const actions: string[] = []

    switch (occurrence.context.recoveryStrategy) {
      case 'retry':
        actions.push('Check network connectivity and retry the operation')
        actions.push('Verify service availability')
        break
      case 'user_input':
        actions.push('Review and correct input parameters')
        actions.push('Check validation rules')
        break
      case 'reauthenticate':
        actions.push('Refresh authentication tokens')
        actions.push('Verify user permissions')
        break
      case 'fallback':
        actions.push('Switch to backup service/database')
        actions.push('Enable degraded mode operation')
        break
      case 'reconfigure':
        actions.push('Review configuration settings')
        actions.push('Update environment variables')
        break
      default:
        actions.push('Manual investigation required')
        actions.push('Check system logs for more details')
    }

    return actions
  }

  private startErrorAggregation(): void {
    setInterval(() => {
      this.cleanupOldAggregations()
      this.updateAggregationTrends()
    }, 60000) // Run every minute
  }

  private startAlertManagement(): void {
    setInterval(() => {
      this.cleanupResolvedAlerts()
    }, 300000) // Run every 5 minutes
  }

  private startMetricsCollection(): void {
    setInterval(async () => {
      const metrics = this.getErrorMetrics()
      await this.logger.info('Error metrics collected', { metrics })
    }, 600000) // Run every 10 minutes
  }

  private cleanupOldErrors(): void {
    if (this.errorOccurrences.size <= this.maxErrorHistorySize) return

    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000) // 24 hours
    const entriesToDelete: UUID[] = []

    for (const [id, occurrence] of this.errorOccurrences.entries()) {
      if (Date.parse(occurrence.timestamp) < cutoffTime) {
        entriesToDelete.push(id)
      }
    }

    // Keep most recent errors even if they're old
    const totalToDelete = this.errorOccurrences.size - this.maxErrorHistorySize
    entriesToDelete.slice(0, totalToDelete).forEach(id => {
      this.errorOccurrences.delete(id)
    })
  }

  private cleanupOldAggregations(): void {
    const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000) // 7 days
    const keysToDelete: string[] = []

    for (const [key, aggregation] of this.errorAggregations.entries()) {
      if (Date.parse(aggregation.lastOccurrence) < cutoffTime) {
        keysToDelete.push(key)
      }
    }

    keysToDelete.forEach(key => {
      this.errorAggregations.delete(key)
    })
  }

  private updateAggregationTrends(): void {
    const windowSize = 3600000 // 1 hour
    const now = Date.now()

    for (const aggregation of this.errorAggregations.values()) {
      const recentCount = aggregation.occurrences.filter(id => {
        const occurrence = this.errorOccurrences.get(id)
        return occurrence && (now - Date.parse(occurrence.timestamp)) < windowSize
      }).length

      const totalCount = aggregation.count
      const recentRatio = totalCount > 0 ? recentCount / totalCount : 0

      if (recentRatio > 0.7) {
        aggregation.trend = 'increasing'
      } else if (recentRatio < 0.3) {
        aggregation.trend = 'decreasing'
      } else {
        aggregation.trend = 'stable'
      }
    }
  }

  private cleanupResolvedAlerts(): void {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000) // 24 hours
    const alertsToDelete: UUID[] = []

    for (const [id, alert] of this.activeAlerts.entries()) {
      if (alert.resolved && (Date.parse(alert.timestamp) < cutoffTime)) {
        alertsToDelete.push(id)
      }
    }

    alertsToDelete.forEach(id => {
      this.activeAlerts.delete(id)
    })
  }
}

// Export singleton instance
export const errorService = ErrorService.getInstance()

// Export factory function for dependency injection
export function createErrorService(): ErrorService {
  return ErrorService.getInstance()
}

// Export default instance
export default errorService
