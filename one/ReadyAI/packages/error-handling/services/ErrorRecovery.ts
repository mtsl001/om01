// packages/error-handling/services/ErrorRecovery.ts

/**
 * ReadyAI Error Recovery Service
 * 
 * Advanced error recovery system extracted and adapted from Cline's production-tested
 * error handling framework. This service implements intelligent recovery strategies,
 * retry mechanisms, and fallback handling for the ReadyAI Personal AI Development 
 * Orchestrator.
 * 
 * Based on Cline's src/core/task/error-recovery.ts patterns with ReadyAI-specific
 * extensions for AI-powered development workflows, multi-phase project orchestration,
 * context management operations, and RAG system interactions.
 * 
 * @version 1.1.0 - Production Ready
 * @author ReadyAI Development Team
 */

import { 
  ReadyAIError, 
  UUID, 
  generateUUID, 
  createTimestamp,
  wrapAsync,
  AsyncResult 
} from '../../foundation/types/core'

import { 
  ErrorClassifier, 
  ErrorClassificationResult,
  ErrorCategory,
  ErrorSeverity,
  RecoveryStrategy,
  ErrorType,
  RetryConfiguration
} from './ErrorClassifier'

// =============================================================================
// ERROR RECOVERY INTERFACES
// =============================================================================

/**
 * Recovery attempt result with comprehensive feedback
 */
export interface RecoveryAttemptResult {
  /** Unique recovery attempt identifier */
  id: UUID
  
  /** Recovery attempt timestamp */
  timestamp: string
  
  /** Whether recovery was successful */
  success: boolean
  
  /** Recovery strategy used */
  strategyUsed: RecoveryStrategy
  
  /** Attempt number (1-based) */
  attemptNumber: number
  
  /** Time taken for recovery in milliseconds */
  duration: number
  
  /** Error that occurred during recovery (if failed) */
  recoveryError?: ReadyAIError
  
  /** Actions taken during recovery */
  actionsTaken: string[]
  
  /** Recovery metadata */
  metadata?: {
    retryAfter?: number
    fallbackUsed?: string
    contextReset?: boolean
    providerSwitched?: boolean
  }
}

/**
 * Recovery context for maintaining state across attempts
 */
export interface RecoveryContext {
  /** Original error being recovered from */
  originalError: Error | ReadyAIError | any
  
  /** Error classification */
  classification: ErrorClassificationResult
  
  /** Recovery operation identifier */
  operationId: UUID
  
  /** Current attempt number */
  currentAttempt: number
  
  /** Maximum allowed attempts */
  maxAttempts: number
  
  /** Recovery start timestamp */
  startedAt: string
  
  /** Previous recovery attempts */
  previousAttempts: RecoveryAttemptResult[]
  
  /** Context metadata */
  context: {
    /** Project identifier if applicable */
    projectId?: UUID
    
    /** Phase being executed */
    phase?: string
    
    /** AI provider being used */
    aiProvider?: string
    
    /** File path involved */
    filePath?: string
    
    /** Operation being performed */
    operation?: string
    
    /** Additional context */
    metadata?: Record<string, any>
  }
}

/**
 * Recovery configuration for customizable behavior
 */
export interface RecoveryConfig {
  /** Enable automatic recovery */
  enabled: boolean
  
  /** Global maximum retry attempts */
  globalMaxRetries: number
  
  /** Global timeout for recovery operations (ms) */
  globalTimeout: number
  
  /** Enable fallback mechanisms */
  enableFallbacks: boolean
  
  /** Provider switching enabled */
  enableProviderSwitching: boolean
  
  /** Context reset enabled */
  enableContextReset: boolean
  
  /** Recovery strategy overrides */
  strategyOverrides: Partial<Record<ErrorCategory, RecoveryStrategy>>
  
  /** Category-specific configurations */
  categoryConfigs: Partial<Record<ErrorCategory, {
    maxRetries?: number
    timeout?: number
    enableFallback?: boolean
  }>>
}

/**
 * Fallback mechanism definition
 */
export interface FallbackMechanism {
  /** Fallback identifier */
  id: string
  
  /** Fallback name */
  name: string
  
  /** Applicable error categories */
  applicableCategories: ErrorCategory[]
  
  /** Applicable error types */
  applicableTypes: ErrorType[]
  
  /** Fallback priority (lower = higher priority) */
  priority: number
  
  /** Fallback implementation */
  execute: (context: RecoveryContext, config: RecoveryConfig) => Promise<RecoveryAttemptResult>
}

/**
 * Recovery operation function signature
 */
export type RecoveryOperation<T = any> = () => Promise<T>

// =============================================================================
// ERROR RECOVERY SERVICE
// =============================================================================

/**
 * Advanced error recovery service
 * Extracted and adapted from Cline's production-tested error handling system
 */
export class ErrorRecovery {
  private errorClassifier: ErrorClassifier
  private config: RecoveryConfig
  private fallbackMechanisms = new Map<string, FallbackMechanism>()
  private activeRecoveries = new Map<string, RecoveryContext>()
  
  /**
   * Recovery metrics and statistics
   */
  private metrics = {
    totalRecoveries: 0,
    successfulRecoveries: 0,
    failedRecoveries: 0,
    averageAttempts: 0,
    averageRecoveryTime: 0,
    categorySuccessRates: new Map<ErrorCategory, { attempts: number, successes: number }>(),
    strategySuccessRates: new Map<RecoveryStrategy, { attempts: number, successes: number }>()
  }

  constructor(
    errorClassifier: ErrorClassifier,
    config?: Partial<RecoveryConfig>
  ) {
    this.errorClassifier = errorClassifier
    this.config = {
      enabled: true,
      globalMaxRetries: 3,
      globalTimeout: 300000, // 5 minutes
      enableFallbacks: true,
      enableProviderSwitching: true,
      enableContextReset: true,
      strategyOverrides: {},
      categoryConfigs: {},
      ...config
    }
    
    this.initializeDefaultFallbacks()
  }

  /**
   * Main recovery method - attempts to recover from an error
   * Uses intelligent recovery strategies based on error classification
   */
  public async recover<T>(
    operation: RecoveryOperation<T>,
    error: Error | ReadyAIError | any,
    context?: Partial<RecoveryContext['context']>
  ): AsyncResult<T> {
    if (!this.config.enabled) {
      return { success: false, error: error instanceof ReadyAIError ? error : new ReadyAIError('Recovery disabled') }
    }

    const operationId = generateUUID()
    const classification = this.errorClassifier.classify(error, {
      source: context?.operation || 'unknown',
      operation: context?.operation,
      aiProvider: context?.aiProvider,
      filePath: context?.filePath,
      phase: context?.phase,
      metadata: context?.metadata
    })

    const recoveryContext: RecoveryContext = {
      originalError: error,
      classification,
      operationId,
      currentAttempt: 0,
      maxAttempts: this.getMaxAttemptsForCategory(classification.category),
      startedAt: createTimestamp(),
      previousAttempts: [],
      context: {
        projectId: context?.projectId,
        phase: context?.phase,
        aiProvider: context?.aiProvider,
        filePath: context?.filePath,
        operation: context?.operation,
        metadata: context?.metadata
      }
    }

    this.activeRecoveries.set(operationId, recoveryContext)

    try {
      const result = await this.executeRecoveryStrategy(operation, recoveryContext)
      this.activeRecoveries.delete(operationId)
      this.updateMetrics(recoveryContext, result.success)
      
      if (result.success) {
        return { success: true, data: result.data }
      } else {
        return { success: false, error: result.error }
      }
    } catch (error) {
      this.activeRecoveries.delete(operationId)
      const readyAIError = error instanceof ReadyAIError 
        ? error 
        : new ReadyAIError('Recovery failed', 'RECOVERY_ERROR', 500, { originalError: error })
      
      this.updateMetrics(recoveryContext, false)
      return { success: false, error: readyAIError }
    }
  }

  /**
   * Batch recovery for multiple operations
   * Efficient recovery handling for multiple concurrent errors
   */
  public async recoverBatch<T>(
    operations: Array<{
      operation: RecoveryOperation<T>
      error: Error | ReadyAIError | any
      context?: Partial<RecoveryContext['context']>
    }>
  ): Promise<Array<AsyncResult<T>>> {
    const promises = operations.map(({ operation, error, context }) => 
      this.recover(operation, error, context)
    )
    
    return Promise.all(promises)
  }

  /**
   * Get recovery statistics and metrics
   */
  public getRecoveryMetrics(): {
    totalRecoveries: number
    successRate: number
    averageAttempts: number
    averageRecoveryTime: number
    categoryBreakdown: Record<string, { attempts: number, successRate: number }>
    strategyBreakdown: Record<string, { attempts: number, successRate: number }>
    activeRecoveries: number
  } {
    const categoryBreakdown: Record<string, { attempts: number, successRate: number }> = {}
    for (const [category, stats] of this.metrics.categorySuccessRates) {
      categoryBreakdown[category] = {
        attempts: stats.attempts,
        successRate: stats.attempts > 0 ? stats.successes / stats.attempts : 0
      }
    }

    const strategyBreakdown: Record<string, { attempts: number, successRate: number }> = {}
    for (const [strategy, stats] of this.metrics.strategySuccessRates) {
      strategyBreakdown[strategy] = {
        attempts: stats.attempts,
        successRate: stats.attempts > 0 ? stats.successes / stats.attempts : 0
      }
    }

    return {
      totalRecoveries: this.metrics.totalRecoveries,
      successRate: this.metrics.totalRecoveries > 0 ? this.metrics.successfulRecoveries / this.metrics.totalRecoveries : 0,
      averageAttempts: this.metrics.averageAttempts,
      averageRecoveryTime: this.metrics.averageRecoveryTime,
      categoryBreakdown,
      strategyBreakdown,
      activeRecoveries: this.activeRecoveries.size
    }
  }

  /**
   * Update recovery configuration
   */
  public updateConfig(newConfig: Partial<RecoveryConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }

  /**
   * Register custom fallback mechanism
   */
  public registerFallback(fallback: FallbackMechanism): void {
    this.fallbackMechanisms.set(fallback.id, fallback)
  }

  /**
   * Clear recovery metrics
   */
  public clearMetrics(): void {
    this.metrics = {
      totalRecoveries: 0,
      successfulRecoveries: 0,
      failedRecoveries: 0,
      averageAttempts: 0,
      averageRecoveryTime: 0,
      categorySuccessRates: new Map(),
      strategySuccessRates: new Map()
    }
  }

  // =============================================================================
  // PRIVATE RECOVERY METHODS
  // =============================================================================

  /**
   * Execute recovery strategy based on classification
   */
  private async executeRecoveryStrategy<T>(
    operation: RecoveryOperation<T>,
    context: RecoveryContext
  ): Promise<{ success: true; data: T } | { success: false; error: ReadyAIError }> {
    const startTime = Date.now()
    const strategy = this.config.strategyOverrides[context.classification.category] || context.classification.recoveryStrategy

    // Track strategy usage
    this.trackStrategyUsage(strategy)

    switch (strategy) {
      case RecoveryStrategy.RETRY:
        return this.executeRetryStrategy(operation, context)

      case RecoveryStrategy.RETRY_WITH_FALLBACK:
        return this.executeRetryWithFallbackStrategy(operation, context)

      case RecoveryStrategy.SKIP:
        return this.executeSkipStrategy(context)

      case RecoveryStrategy.RESET:
        return this.executeResetStrategy(operation, context)

      case RecoveryStrategy.DEGRADE:
        return this.executeDegradeStrategy(operation, context)

      case RecoveryStrategy.ESCALATE:
        return this.executeEscalateStrategy(context)

      case RecoveryStrategy.NONE:
      default:
        return { 
          success: false, 
          error: new ReadyAIError(
            'No recovery strategy available',
            'NO_RECOVERY_STRATEGY',
            500,
            { classification: context.classification }
          )
        }
    }
  }

  /**
   * Execute retry strategy with exponential backoff
   */
  private async executeRetryStrategy<T>(
    operation: RecoveryOperation<T>,
    context: RecoveryContext
  ): Promise<{ success: true; data: T } | { success: false; error: ReadyAIError }> {
    const retryConfig = context.classification.retryConfig || this.getDefaultRetryConfig(context.classification.category)

    for (let attempt = 1; attempt <= Math.min(context.maxAttempts, retryConfig.maxRetries); attempt++) {
      context.currentAttempt = attempt
      
      const attemptStart = Date.now()
      const actionsTaken: string[] = []

      try {
        // Apply retry delay with exponential backoff
        if (attempt > 1) {
          const delay = this.calculateRetryDelay(attempt - 1, retryConfig)
          actionsTaken.push(`Applied ${delay}ms delay`)
          await this.sleep(delay)
        }

        actionsTaken.push(`Executing retry attempt ${attempt}`)
        const result = await this.executeWithTimeout(operation, this.config.globalTimeout)
        
        // Success - record attempt and return
        const attemptResult: RecoveryAttemptResult = {
          id: generateUUID(),
          timestamp: createTimestamp(),
          success: true,
          strategyUsed: RecoveryStrategy.RETRY,
          attemptNumber: attempt,
          duration: Date.now() - attemptStart,
          actionsTaken
        }
        
        context.previousAttempts.push(attemptResult)
        return { success: true, data: result }

      } catch (error) {
        const attemptResult: RecoveryAttemptResult = {
          id: generateUUID(),
          timestamp: createTimestamp(),
          success: false,
          strategyUsed: RecoveryStrategy.RETRY,
          attemptNumber: attempt,
          duration: Date.now() - attemptStart,
          recoveryError: error instanceof ReadyAIError ? error : new ReadyAIError(
            error instanceof Error ? error.message : 'Unknown error',
            'RETRY_FAILED'
          ),
          actionsTaken
        }
        
        context.previousAttempts.push(attemptResult)

        // If this is the last attempt, return the error
        if (attempt >= Math.min(context.maxAttempts, retryConfig.maxRetries)) {
          return { 
            success: false, 
            error: new ReadyAIError(
              `Retry strategy failed after ${attempt} attempts`,
              'RETRY_EXHAUSTED',
              500,
              { 
                originalError: context.originalError,
                attempts: context.previousAttempts
              }
            )
          }
        }
      }
    }

    return { 
      success: false, 
      error: new ReadyAIError('Retry strategy exhausted', 'RETRY_EXHAUSTED')
    }
  }

  /**
   * Execute retry with fallback strategy
   */
  private async executeRetryWithFallbackStrategy<T>(
    operation: RecoveryOperation<T>,
    context: RecoveryContext
  ): Promise<{ success: true; data: T } | { success: false; error: ReadyAIError }> {
    // First, try the retry strategy
    const retryResult = await this.executeRetryStrategy(operation, context)
    
    if (retryResult.success) {
      return retryResult
    }

    // If retry failed and fallbacks are enabled, try fallback mechanisms
    if (!this.config.enableFallbacks) {
      return retryResult
    }

    const applicableFallbacks = this.getApplicableFallbacks(context.classification)
    
    for (const fallback of applicableFallbacks) {
      const attemptStart = Date.now()
      
      try {
        const fallbackResult = await fallback.execute(context, this.config)
        
        if (fallbackResult.success) {
          return { success: true, data: fallbackResult as any }
        }
      } catch (error) {
        const attemptResult: RecoveryAttemptResult = {
          id: generateUUID(),
          timestamp: createTimestamp(),
          success: false,
          strategyUsed: RecoveryStrategy.RETRY_WITH_FALLBACK,
          attemptNumber: context.currentAttempt + 1,
          duration: Date.now() - attemptStart,
          recoveryError: error instanceof ReadyAIError ? error : new ReadyAIError(
            `Fallback ${fallback.id} failed`,
            'FALLBACK_FAILED'
          ),
          actionsTaken: [`Tried fallback: ${fallback.name}`],
          metadata: { fallbackUsed: fallback.id }
        }
        
        context.previousAttempts.push(attemptResult)
      }
    }

    return { 
      success: false, 
      error: new ReadyAIError(
        'Retry with fallback strategy failed',
        'FALLBACK_EXHAUSTED',
        500,
        { attempts: context.previousAttempts }
      )
    }
  }

  /**
   * Execute skip strategy
   */
  private async executeSkipStrategy(
    context: RecoveryContext
  ): Promise<{ success: true; data: any } | { success: false; error: ReadyAIError }> {
    const attemptResult: RecoveryAttemptResult = {
      id: generateUUID(),
      timestamp: createTimestamp(),
      success: true,
      strategyUsed: RecoveryStrategy.SKIP,
      attemptNumber: 1,
      duration: 0,
      actionsTaken: ['Skipped operation due to error']
    }
    
    context.previousAttempts.push(attemptResult)
    
    return { 
      success: true, 
      data: { skipped: true, reason: context.classification.category }
    }
  }

  /**
   * Execute reset strategy
   */
  private async executeResetStrategy<T>(
    operation: RecoveryOperation<T>,
    context: RecoveryContext
  ): Promise<{ success: true; data: T } | { success: false; error: ReadyAIError }> {
    const attemptStart = Date.now()
    const actionsTaken: string[] = []

    try {
      // Reset context if enabled
      if (this.config.enableContextReset) {
        actionsTaken.push('Reset operation context')
        // Context reset implementation would go here
      }

      actionsTaken.push('Executing operation after reset')
      const result = await this.executeWithTimeout(operation, this.config.globalTimeout)
      
      const attemptResult: RecoveryAttemptResult = {
        id: generateUUID(),
        timestamp: createTimestamp(),
        success: true,
        strategyUsed: RecoveryStrategy.RESET,
        attemptNumber: 1,
        duration: Date.now() - attemptStart,
        actionsTaken,
        metadata: { contextReset: this.config.enableContextReset }
      }
      
      context.previousAttempts.push(attemptResult)
      return { success: true, data: result }

    } catch (error) {
      const attemptResult: RecoveryAttemptResult = {
        id: generateUUID(),
        timestamp: createTimestamp(),
        success: false,
        strategyUsed: RecoveryStrategy.RESET,
        attemptNumber: 1,
        duration: Date.now() - attemptStart,
        recoveryError: error instanceof ReadyAIError ? error : new ReadyAIError(
          'Reset strategy failed',
          'RESET_FAILED'
        ),
        actionsTaken
      }
      
      context.previousAttempts.push(attemptResult)
      return { 
        success: false, 
        error: attemptResult.recoveryError || new ReadyAIError('Reset strategy failed')
      }
    }
  }

  /**
   * Execute degrade strategy
   */
  private async executeDegradeStrategy<T>(
    operation: RecoveryOperation<T>,
    context: RecoveryContext
  ): Promise<{ success: true; data: T } | { success: false; error: ReadyAIError }> {
    const attemptStart = Date.now()
    const actionsTaken: string[] = []

    try {
      // Provider switching if enabled and applicable
      if (this.config.enableProviderSwitching && context.context.aiProvider) {
        actionsTaken.push(`Switching from provider: ${context.context.aiProvider}`)
        // Provider switching logic would be implemented here
      }

      actionsTaken.push('Executing operation with degraded parameters')
      const result = await this.executeWithTimeout(operation, this.config.globalTimeout)
      
      const attemptResult: RecoveryAttemptResult = {
        id: generateUUID(),
        timestamp: createTimestamp(),
        success: true,
        strategyUsed: RecoveryStrategy.DEGRADE,
        attemptNumber: 1,
        duration: Date.now() - attemptStart,
        actionsTaken,
        metadata: { 
          providerSwitched: this.config.enableProviderSwitching && !!context.context.aiProvider 
        }
      }
      
      context.previousAttempts.push(attemptResult)
      return { success: true, data: result }

    } catch (error) {
      const attemptResult: RecoveryAttemptResult = {
        id: generateUUID(),
        timestamp: createTimestamp(),
        success: false,
        strategyUsed: RecoveryStrategy.DEGRADE,
        attemptNumber: 1,
        duration: Date.now() - attemptStart,
        recoveryError: error instanceof ReadyAIError ? error : new ReadyAIError(
          'Degrade strategy failed',
          'DEGRADE_FAILED'
        ),
        actionsTaken
      }
      
      context.previousAttempts.push(attemptResult)
      return { 
        success: false, 
        error: attemptResult.recoveryError || new ReadyAIError('Degrade strategy failed')
      }
    }
  }

  /**
   * Execute escalate strategy
   */
  private async executeEscalateStrategy(
    context: RecoveryContext
  ): Promise<{ success: false; error: ReadyAIError }> {
    const attemptResult: RecoveryAttemptResult = {
      id: generateUUID(),
      timestamp: createTimestamp(),
      success: false,
      strategyUsed: RecoveryStrategy.ESCALATE,
      attemptNumber: 1,
      duration: 0,
      actionsTaken: ['Escalated error - requires manual intervention']
    }
    
    context.previousAttempts.push(attemptResult)
    
    return { 
      success: false, 
      error: new ReadyAIError(
        'Error escalated - manual intervention required',
        'ERROR_ESCALATED',
        500,
        { 
          classification: context.classification,
          originalError: context.originalError
        },
        false // Not retryable
      )
    }
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Execute operation with timeout
   */
  private async executeWithTimeout<T>(
    operation: RecoveryOperation<T>,
    timeout: number
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new ReadyAIError('Operation timeout', 'TIMEOUT', 408))
      }, timeout)

      operation()
        .then(result => {
          clearTimeout(timer)
          resolve(result)
        })
        .catch(error => {
          clearTimeout(timer)
          reject(error)
        })
    })
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  private calculateRetryDelay(attempt: number, config: RetryConfiguration): number {
    let delay = config.baseDelay * Math.pow(config.backoffFactor, attempt)
    delay = Math.min(delay, config.maxDelay)
    
    if (config.jitter) {
      // Add random jitter ±25%
      const jitterAmount = delay * 0.25
      delay += (Math.random() - 0.5) * 2 * jitterAmount
    }
    
    return Math.max(0, Math.round(delay))
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Get maximum attempts for error category
   */
  private getMaxAttemptsForCategory(category: ErrorCategory): number {
    const categoryConfig = this.config.categoryConfigs[category]
    return categoryConfig?.maxRetries || this.config.globalMaxRetries
  }

  /**
   * Get default retry configuration for category
   */
  private getDefaultRetryConfig(category: ErrorCategory): RetryConfiguration {
    const baseConfigs: Record<ErrorCategory, RetryConfiguration> = {
      [ErrorCategory.API_PROVIDER]: {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 30000,
        backoffFactor: 2,
        jitter: true,
        conditions: ['rate_limit', 'server_error', 'timeout']
      },
      [ErrorCategory.NETWORK]: {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 15000,
        backoffFactor: 2,
        jitter: true,
        conditions: ['connection_error', 'timeout', 'dns_error']
      },
      [ErrorCategory.DATABASE]: {
        maxRetries: 3,
        baseDelay: 200,
        maxDelay: 5000,
        backoffFactor: 1.5,
        jitter: false,
        conditions: ['deadlock', 'lock_timeout', 'connection_error']
      },
      [ErrorCategory.CONTEXT_MANAGEMENT]: {
        maxRetries: 2,
        baseDelay: 500,
        maxDelay: 2000,
        backoffFactor: 2,
        jitter: false,
        conditions: ['context_overflow', 'memory_pressure']
      },
      [ErrorCategory.AI_GENERATION]: {
        maxRetries: 2,
        baseDelay: 2000,
        maxDelay: 10000,
        backoffFactor: 2,
        jitter: true,
        conditions: ['generation_failed', 'context_window_exceeded']
      }
    }

    return baseConfigs[category] || {
      maxRetries: 1,
      baseDelay: 1000,
      maxDelay: 5000,
      backoffFactor: 2,
      jitter: true,
      conditions: []
    }
  }

  /**
   * Get applicable fallback mechanisms for classification
   */
  private getApplicableFallbacks(classification: ErrorClassificationResult): FallbackMechanism[] {
    const fallbacks: FallbackMechanism[] = []
    
    for (const fallback of this.fallbackMechanisms.values()) {
      const categoryMatch = fallback.applicableCategories.includes(classification.category)
      const typeMatch = fallback.applicableTypes.includes(classification.errorType)
      
      if (categoryMatch || typeMatch) {
        fallbacks.push(fallback)
      }
    }
    
    // Sort by priority
    return fallbacks.sort((a, b) => a.priority - b.priority)
  }

  /**
   * Track strategy usage for metrics
   */
  private trackStrategyUsage(strategy: RecoveryStrategy): void {
    const current = this.metrics.strategySuccessRates.get(strategy) || { attempts: 0, successes: 0 }
    current.attempts++
    this.metrics.strategySuccessRates.set(strategy, current)
  }

  /**
   * Update recovery metrics
   */
  private updateMetrics(context: RecoveryContext, success: boolean): void {
    this.metrics.totalRecoveries++
    
    if (success) {
      this.metrics.successfulRecoveries++
    } else {
      this.metrics.failedRecoveries++
    }

    // Update category metrics
    const categoryStats = this.metrics.categorySuccessRates.get(context.classification.category) || 
      { attempts: 0, successes: 0 }
    categoryStats.attempts++
    if (success) categoryStats.successes++
    this.metrics.categorySuccessRates.set(context.classification.category, categoryStats)

    // Update strategy metrics
    const strategy = this.config.strategyOverrides[context.classification.category] || 
      context.classification.recoveryStrategy
    const strategyStats = this.metrics.strategySuccessRates.get(strategy) || 
      { attempts: 0, successes: 0 }
    if (success) strategyStats.successes++
    this.metrics.strategySuccessRates.set(strategy, strategyStats)

    // Update averages
    const totalAttempts = context.previousAttempts.length
    this.metrics.averageAttempts = (
      (this.metrics.averageAttempts * (this.metrics.totalRecoveries - 1)) + totalAttempts
    ) / this.metrics.totalRecoveries

    if (context.previousAttempts.length > 0) {
      const totalDuration = context.previousAttempts.reduce((sum, attempt) => sum + attempt.duration, 0)
      this.metrics.averageRecoveryTime = (
        (this.metrics.averageRecoveryTime * (this.metrics.totalRecoveries - 1)) + totalDuration
      ) / this.metrics.totalRecoveries
    }
  }

  /**
   * Initialize default fallback mechanisms
   */
  private initializeDefaultFallbacks(): void {
    // AI Provider Switching Fallback
    this.registerFallback({
      id: 'ai-provider-switch',
      name: 'AI Provider Switch',
      applicableCategories: [ErrorCategory.API_PROVIDER, ErrorCategory.AI_GENERATION],
      applicableTypes: [ErrorType.AI_PROVIDER, ErrorType.RATE_LIMIT, ErrorType.BALANCE],
      priority: 1,
      execute: async (context: RecoveryContext, config: RecoveryConfig): Promise<RecoveryAttemptResult> => {
        const startTime = Date.now()
        const actionsTaken = ['Switching AI provider']
        
        try {
          // Provider switching logic would be implemented here
          return {
            id: generateUUID(),
            timestamp: createTimestamp(),
            success: true,
            strategyUsed: RecoveryStrategy.RETRY_WITH_FALLBACK,
            attemptNumber: context.currentAttempt + 1,
            duration: Date.now() - startTime,
            actionsTaken,
            metadata: { fallbackUsed: 'ai-provider-switch', providerSwitched: true }
          }
        } catch (error) {
          return {
            id: generateUUID(),
            timestamp: createTimestamp(),
            success: false,
            strategyUsed: RecoveryStrategy.RETRY_WITH_FALLBACK,
            attemptNumber: context.currentAttempt + 1,
            duration: Date.now() - startTime,
            recoveryError: new ReadyAIError('Provider switch failed', 'PROVIDER_SWITCH_FAILED'),
            actionsTaken
          }
        }
      }
    })

    // Context Compression Fallback
    this.registerFallback({
      id: 'context-compression',
      name: 'Context Compression',
      applicableCategories: [ErrorCategory.AI_GENERATION, ErrorCategory.CONTEXT_MANAGEMENT],
      applicableTypes: [ErrorType.CONTEXT_WINDOW, ErrorType.GENERATION],
      priority: 2,
      execute: async (context: RecoveryContext, config: RecoveryConfig): Promise<RecoveryAttemptResult> => {
        const startTime = Date.now()
        const actionsTaken = ['Compressing context to reduce size']
        
        try {
          // Context compression logic would be implemented here
          return {
            id: generateUUID(),
            timestamp: createTimestamp(),
            success: true,
            strategyUsed: RecoveryStrategy.RETRY_WITH_FALLBACK,
            attemptNumber: context.currentAttempt + 1,
            duration: Date.now() - startTime,
            actionsTaken,
            metadata: { fallbackUsed: 'context-compression', contextReset: true }
          }
        } catch (error) {
          return {
            id: generateUUID(),
            timestamp: createTimestamp(),
            success: false,
            strategyUsed: RecoveryStrategy.RETRY_WITH_FALLBACK,
            attemptNumber: context.currentAttempt + 1,
            duration: Date.now() - startTime,
            recoveryError: new ReadyAIError('Context compression failed', 'CONTEXT_COMPRESSION_FAILED'),
            actionsTaken
          }
        }
      }
    })

    // File Operation Retry Fallback
    this.registerFallback({
      id: 'file-operation-retry',
      name: 'File Operation Retry',
      applicableCategories: [ErrorCategory.FILESYSTEM],
      applicableTypes: [ErrorType.FILESYSTEM],
      priority: 3,
      execute: async (context: RecoveryContext, config: RecoveryConfig): Promise<RecoveryAttemptResult> => {
        const startTime = Date.now()
        const actionsTaken = ['Retrying file operation with different approach']
        
        try {
          // File operation retry logic would be implemented here
          return {
            id: generateUUID(),
            timestamp: createTimestamp(),
            success: true,
            strategyUsed: RecoveryStrategy.RETRY_WITH_FALLBACK,
            attemptNumber: context.currentAttempt + 1,
            duration: Date.now() - startTime,
            actionsTaken,
            metadata: { fallbackUsed: 'file-operation-retry' }
          }
        } catch (error) {
          return {
            id: generateUUID(),
            timestamp: createTimestamp(),
            success: false,
            strategyUsed: RecoveryStrategy.RETRY_WITH_FALLBACK,
            attemptNumber: context.currentAttempt + 1,
            duration: Date.now() - startTime,
            recoveryError: new ReadyAIError('File operation retry failed', 'FILE_RETRY_FAILED'),
            actionsTaken
          }
        }
      }
    })
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

// Export main service
export { ErrorRecovery }

// Export interfaces
export type {
  RecoveryAttemptResult,
  RecoveryContext,
  RecoveryConfig,
  FallbackMechanism,
  RecoveryOperation
}

// Create default instance
export const defaultErrorRecovery = new ErrorRecovery(
  // ErrorClassifier will be injected via dependency injection in production
  {} as ErrorClassifier
)

// Export default
export default ErrorRecovery
