// packages/project-management/utils/ProjectEventEmitter.ts

/**
 * Project Event Emitter for ReadyAI Personal AI Development Orchestrator
 * 
 * High-performance, typed event emitter optimized for project-level events with advanced
 * features including priority handling, wildcard subscriptions, error recovery, and
 * performance monitoring. Adapted from Cline's proven EventEmitter patterns with
 * ReadyAI-specific enhancements for multi-phase development workflow.
 * 
 * Primary Cline Sources:
 * - Cline EventEmitter core patterns (subscription management, listener execution)
 * - Cline event priority and filtering systems (performance optimization)
 * - Cline error handling and recovery mechanisms (production stability)
 * 
 * @version 1.0.0 - Phase 2.1 Implementation
 * @author ReadyAI Development Team
 */

import {
  UUID,
  generateUUID,
  createTimestamp,
  ReadyAIError
} from '../../foundation/types/core'

import {
  ProjectEvent,
  ProjectEventListener,
  ProjectEventSubscription,
  ProjectEventService
} from '../services/ProjectEventService'

import { Logger } from '../../logging/services/Logger'
import { ErrorService } from '../../logging/services/ErrorService'

// =============================================================================
// EVENT EMITTER TYPES AND INTERFACES
// =============================================================================

/**
 * Event emitter options for performance and behavior configuration
 */
export interface ProjectEventEmitterOptions {
  /** Maximum number of listeners per event type */
  maxListeners?: number
  /** Enable performance metrics collection */
  enableMetrics?: boolean
  /** Enable automatic error recovery */
  autoRecover?: boolean
  /** Default listener priority */
  defaultPriority?: number
  /** Event processing batch size */
  batchSize?: number
  /** Memory limit for event history */
  memoryLimit?: number
}

/**
 * Event listener configuration with advanced options
 */
export interface ListenerConfig {
  /** Listener priority (higher executes first) */
  priority?: number
  /** Execute only once */
  once?: boolean
  /** Event filter function */
  filter?: (event: ProjectEvent) => boolean
  /** Async execution timeout in milliseconds */
  timeout?: number
  /** Retry configuration */
  retry?: {
    attempts: number
    delay: number
    exponentialBackoff?: boolean
  }
}

/**
 * Event emission result with performance metrics
 */
export interface EmissionResult {
  /** Event ID */
  eventId: UUID
  /** Number of listeners executed */
  listenersExecuted: number
  /** Number of listeners failed */
  listenersFailed: number
  /** Total execution time in milliseconds */
  executionTime: number
  /** Success rate percentage */
  successRate: number
  /** Errors encountered */
  errors: Error[]
}

/**
 * Event emitter performance metrics
 */
export interface EventEmitterMetrics {
  /** Total events emitted */
  totalEmitted: number
  /** Total listeners executed */
  totalListenersExecuted: number
  /** Average execution time */
  averageExecutionTime: number
  /** Error rate percentage */
  errorRate: number
  /** Memory usage statistics */
  memoryUsage: {
    listenersCount: number
    eventsHistorySize: number
    approximateMemoryBytes: number
  }
  /** Performance by event type */
  byEventType: Map<string, {
    count: number
    averageTime: number
    errorCount: number
  }>
}

/**
 * Wildcard pattern matching configuration
 */
export interface WildcardConfig {
  /** Enable wildcard pattern matching */
  enabled: boolean
  /** Cache compiled patterns for performance */
  useCache: boolean
  /** Maximum cached patterns */
  maxCacheSize: number
}

// =============================================================================
// MAIN PROJECT EVENT EMITTER CLASS
// =============================================================================

/**
 * Project Event Emitter - High-performance typed event system
 * 
 * Provides advanced event emission and subscription capabilities with features
 * including priority handling, wildcard patterns, error recovery, and comprehensive
 * performance monitoring. Adapted from Cline's battle-tested EventEmitter with
 * ReadyAI-specific enhancements for project lifecycle management.
 */
export class ProjectEventEmitter {
  private readonly logger: Logger
  private readonly errorService: ErrorService
  private readonly projectEventService: ProjectEventService
  private readonly options: Required<ProjectEventEmitterOptions>

  /** Event type to listeners mapping */
  private readonly listeners = new Map<string, ProjectEventSubscription[]>()
  
  /** Wildcard listeners for pattern-based subscriptions */
  private readonly wildcardListeners: ProjectEventSubscription[] = []
  
  /** Compiled regex patterns cache */
  private readonly patternCache = new Map<string, RegExp>()
  
  /** Event emission history for debugging and metrics */
  private readonly emissionHistory: Array<{
    event: ProjectEvent
    result: EmissionResult
    timestamp: string
  }> = []
  
  /** Performance metrics */
  private metrics: EventEmitterMetrics = {
    totalEmitted: 0,
    totalListenersExecuted: 0,
    averageExecutionTime: 0,
    errorRate: 0,
    memoryUsage: {
      listenersCount: 0,
      eventsHistorySize: 0,
      approximateMemoryBytes: 0
    },
    byEventType: new Map()
  }
  
  /** Wildcard configuration */
  private readonly wildcardConfig: WildcardConfig = {
    enabled: true,
    useCache: true,
    maxCacheSize: 100
  }

  constructor(
    logger: Logger,
    errorService: ErrorService,
    projectEventService: ProjectEventService,
    options: ProjectEventEmitterOptions = {}
  ) {
    this.logger = logger
    this.errorService = errorService
    this.projectEventService = projectEventService
    
    // Apply default options
    this.options = {
      maxListeners: 50,
      enableMetrics: true,
      autoRecover: true,
      defaultPriority: 0,
      batchSize: 10,
      memoryLimit: 1000,
      ...options
    }
    
    this.logger.info('ProjectEventEmitter initialized', {
      service: 'ProjectEventEmitter',
      options: this.options,
      timestamp: createTimestamp()
    })
  }

  // =============================================================================
  // EVENT EMISSION METHODS
  // =============================================================================

  /**
   * Emit an event to all registered listeners with performance tracking
   */
  async emit<T extends ProjectEvent>(
    eventType: string,
    event: T,
    config: { priority?: number; timeout?: number } = {}
  ): Promise<EmissionResult> {
    const startTime = performance.now()
    const eventId = event.id || generateUUID()
    
    try {
      // Validate event
      this.validateEvent(event)
      
      // Get matching listeners with priority sorting
      const matchingListeners = this.getMatchingListeners(eventType)
        .sort((a, b) => (b.options.priority || 0) - (a.options.priority || 0))
      
      let listenersExecuted = 0
      let listenersFailed = 0
      const errors: Error[] = []
      
      // Process listeners in batches for better performance
      const batches = this.createBatches(matchingListeners, this.options.batchSize)
      
      for (const batch of batches) {
        const batchPromises = batch.map(async (subscription) => {
          try {
            await this.executeListener(subscription, event, config.timeout)
            listenersExecuted++
            
            // Remove one-time listeners
            if (subscription.options.once) {
              this.removeListener(subscription.id)
            }
            
          } catch (error) {
            listenersFailed++
            errors.push(error as Error)
            
            // Auto-recovery mechanism
            if (this.options.autoRecover) {
              await this.handleListenerError(subscription, event, error as Error)
            }
            
            this.logger.error('Listener execution failed', {
              eventType,
              eventId,
              subscriptionId: subscription.id,
              error: (error as Error).message
            })
          }
        })
        
        // Execute batch concurrently
        await Promise.allSettled(batchPromises)
      }
      
      const executionTime = performance.now() - startTime
      const successRate = listenersExecuted > 0 
        ? (listenersExecuted / (listenersExecuted + listenersFailed)) * 100 
        : 100
      
      const result: EmissionResult = {
        eventId,
        listenersExecuted,
        listenersFailed,
        executionTime,
        successRate,
        errors
      }
      
      // Update metrics
      if (this.options.enableMetrics) {
        this.updateMetrics(eventType, result)
      }
      
      // Add to emission history
      this.addToHistory(event, result)
      
      // Forward to ProjectEventService for centralized handling
      await this.projectEventService.emit(event)
      
      this.logger.debug('Event emitted successfully', {
        eventType,
        eventId,
        listenersExecuted,
        executionTime: `${executionTime.toFixed(2)}ms`,
        successRate: `${successRate.toFixed(2)}%`
      })
      
      return result
      
    } catch (error) {
      const executionTime = performance.now() - startTime
      const result: EmissionResult = {
        eventId,
        listenersExecuted: 0,
        listenersFailed: 0,
        executionTime,
        successRate: 0,
        errors: [error as Error]
      }
      
      await this.handleEmissionError(eventType, event, error as Error)
      throw error
    }
  }

  /**
   * Emit multiple events in sequence with optimized batching
   */
  async emitBatch<T extends ProjectEvent>(
    events: Array<{ type: string; event: T }>
  ): Promise<EmissionResult[]> {
    const results: EmissionResult[] = []
    
    for (const { type, event } of events) {
      try {
        const result = await this.emit(type, event)
        results.push(result)
      } catch (error) {
        this.logger.error('Batch emission failed', {
          eventType: type,
          eventId: event.id,
          error: (error as Error).message
        })
        
        // Continue with remaining events even if one fails
        results.push({
          eventId: event.id || generateUUID(),
          listenersExecuted: 0,
          listenersFailed: 0,
          executionTime: 0,
          successRate: 0,
          errors: [error as Error]
        })
      }
    }
    
    return results
  }

  // =============================================================================
  // LISTENER SUBSCRIPTION METHODS
  // =============================================================================

  /**
   * Subscribe to events with advanced configuration options
   */
  on<T extends ProjectEvent>(
    eventType: string,
    listener: ProjectEventListener<T>,
    config: ListenerConfig = {}
  ): UUID {
    return this.addListener(eventType, listener, config)
  }

  /**
   * Subscribe to events with one-time execution
   */
  once<T extends ProjectEvent>(
    eventType: string,
    listener: ProjectEventListener<T>,
    config: Omit<ListenerConfig, 'once'> = {}
  ): UUID {
    return this.addListener(eventType, listener, { ...config, once: true })
  }

  /**
   * Subscribe to multiple event types with single listener
   */
  onMultiple<T extends ProjectEvent>(
    eventTypes: string[],
    listener: ProjectEventListener<T>,
    config: ListenerConfig = {}
  ): UUID[] {
    return eventTypes.map(eventType => this.addListener(eventType, listener, config))
  }

  /**
   * Subscribe with wildcard pattern matching
   */
  onPattern<T extends ProjectEvent>(
    pattern: string | RegExp,
    listener: ProjectEventListener<T>,
    config: ListenerConfig = {}
  ): UUID {
    const subscription: ProjectEventSubscription = {
      id: generateUUID(),
      eventType: pattern,
      listener: listener as ProjectEventListener,
      options: {
        priority: config.priority || this.options.defaultPriority,
        once: config.once || false,
        filter: config.filter
      },
      subscribedAt: createTimestamp(),
      subscriber: {
        id: generateUUID(),
        name: 'PatternSubscriber',
        type: 'system'
      }
    }
    
    this.wildcardListeners.push(subscription)
    
    this.logger.debug('Pattern subscription created', {
      subscriptionId: subscription.id,
      pattern: typeof pattern === 'string' ? pattern : pattern.source,
      priority: subscription.options.priority
    })
    
    return subscription.id
  }

  /**
   * Add a listener with comprehensive configuration
   */
  private addListener<T extends ProjectEvent>(
    eventType: string,
    listener: ProjectEventListener<T>,
    config: ListenerConfig
  ): UUID {
    // Check listener limit
    const existingListeners = this.listeners.get(eventType) || []
    if (existingListeners.length >= this.options.maxListeners) {
      throw new ProjectEventEmitterError(
        `Maximum listeners (${this.options.maxListeners}) exceeded for event type: ${eventType}`
      )
    }
    
    const subscription: ProjectEventSubscription = {
      id: generateUUID(),
      eventType,
      listener: listener as ProjectEventListener,
      options: {
        priority: config.priority || this.options.defaultPriority,
        once: config.once || false,
        filter: config.filter
      },
      subscribedAt: createTimestamp(),
      subscriber: {
        id: generateUUID(),
        name: 'ProjectListener',
        type: 'service'
      }
    }
    
    // Add to appropriate listeners map
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, [])
    }
    
    const listeners = this.listeners.get(eventType)!
    listeners.push(subscription)
    
    // Sort by priority (higher priority first)
    listeners.sort((a, b) => (b.options.priority || 0) - (a.options.priority || 0))
    
    this.logger.debug('Event listener added', {
      subscriptionId: subscription.id,
      eventType,
      priority: subscription.options.priority,
      once: subscription.options.once
    })
    
    return subscription.id
  }

  // =============================================================================
  // LISTENER REMOVAL METHODS
  // =============================================================================

  /**
   * Remove a specific listener by subscription ID
   */
  off(subscriptionId: UUID): boolean {
    return this.removeListener(subscriptionId)
  }

  /**
   * Remove all listeners for a specific event type
   */
  removeAllListeners(eventType?: string): void {
    if (eventType) {
      // Remove specific event type listeners
      this.listeners.delete(eventType)
      this.logger.debug('All listeners removed for event type', { eventType })
    } else {
      // Remove all listeners
      this.listeners.clear()
      this.wildcardListeners.splice(0)
      this.logger.debug('All listeners removed')
    }
  }

  /**
   * Remove listeners matching a pattern
   */
  removeListenersByPattern(pattern: string | RegExp): number {
    let removedCount = 0
    const compiledPattern = this.compilePattern(pattern)
    
    // Remove from typed listeners
    for (const [eventType, listeners] of this.listeners.entries()) {
      if (compiledPattern.test(eventType)) {
        this.listeners.delete(eventType)
        removedCount += listeners.length
      }
    }
    
    // Remove from wildcard listeners
    const initialWildcardCount = this.wildcardListeners.length
    const remainingWildcard = this.wildcardListeners.filter(sub => {
      const subPattern = this.compilePattern(sub.eventType)
      return !this.patternsMatch(compiledPattern, subPattern)
    })
    
    removedCount += initialWildcardCount - remainingWildcard.length
    this.wildcardListeners.splice(0, this.wildcardListeners.length, ...remainingWildcard)
    
    this.logger.debug('Listeners removed by pattern', {
      pattern: typeof pattern === 'string' ? pattern : pattern.source,
      removedCount
    })
    
    return removedCount
  }

  /**
   * Internal method to remove a listener by ID
   */
  private removeListener(subscriptionId: UUID): boolean {
    // Check typed listeners
    for (const [eventType, listeners] of this.listeners.entries()) {
      const index = listeners.findIndex(sub => sub.id === subscriptionId)
      if (index !== -1) {
        listeners.splice(index, 1)
        
        // Clean up empty listener arrays
        if (listeners.length === 0) {
          this.listeners.delete(eventType)
        }
        
        this.logger.debug('Listener removed', { subscriptionId, eventType })
        return true
      }
    }
    
    // Check wildcard listeners
    const wildcardIndex = this.wildcardListeners.findIndex(sub => sub.id === subscriptionId)
    if (wildcardIndex !== -1) {
      this.wildcardListeners.splice(wildcardIndex, 1)
      this.logger.debug('Wildcard listener removed', { subscriptionId })
      return true
    }
    
    return false
  }

  // =============================================================================
  // PATTERN MATCHING AND UTILITY METHODS
  // =============================================================================

  /**
   * Get listeners matching an event type including wildcard patterns
   */
  private getMatchingListeners(eventType: string): ProjectEventSubscription[] {
    const matching: ProjectEventSubscription[] = []
    
    // Add direct type matches
    const typeListeners = this.listeners.get(eventType) || []
    matching.push(...typeListeners)
    
    // Add wildcard pattern matches
    if (this.wildcardConfig.enabled) {
      for (const subscription of this.wildcardListeners) {
        try {
          const pattern = this.compilePattern(subscription.eventType)
          if (pattern.test(eventType)) {
            matching.push(subscription)
          }
        } catch (error) {
          this.logger.warn('Invalid pattern in wildcard subscription', {
            subscriptionId: subscription.id,
            pattern: subscription.eventType,
            error: (error as Error).message
          })
        }
      }
    }
    
    // Remove duplicates and apply filters
    const uniqueListeners = Array.from(
      new Map(matching.map(sub => [sub.id, sub])).values()
    )
    
    return uniqueListeners
  }

  /**
   * Compile pattern to RegExp with caching
   */
  private compilePattern(pattern: string | RegExp): RegExp {
    if (pattern instanceof RegExp) {
      return pattern
    }
    
    // Check cache first
    if (this.wildcardConfig.useCache && this.patternCache.has(pattern)) {
      return this.patternCache.get(pattern)!
    }
    
    // Convert wildcard pattern to RegExp
    let regexPattern = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special characters
      .replace(/\\\*/g, '.*') // Convert * to .*
      .replace(/\\\?/g, '.') // Convert ? to .
    
    regexPattern = `^${regexPattern}$`
    
    try {
      const compiledPattern = new RegExp(regexPattern)
      
      // Add to cache
      if (this.wildcardConfig.useCache) {
        // Clean cache if it's getting too large
        if (this.patternCache.size >= this.wildcardConfig.maxCacheSize) {
          const firstKey = this.patternCache.keys().next().value
          this.patternCache.delete(firstKey)
        }
        
        this.patternCache.set(pattern, compiledPattern)
      }
      
      return compiledPattern
      
    } catch (error) {
      throw new ProjectEventEmitterError(
        `Invalid pattern: ${pattern}`,
        { pattern, error }
      )
    }
  }

  /**
   * Check if two patterns match
   */
  private patternsMatch(pattern1: RegExp, pattern2: RegExp): boolean {
    return pattern1.source === pattern2.source && pattern1.flags === pattern2.flags
  }

  /**
   * Create batches of listeners for optimal processing
   */
  private createBatches<T>(
    items: T[],
    batchSize: number
  ): T[][] {
    const batches: T[][] = []
    
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize))
    }
    
    return batches
  }

  // =============================================================================
  // LISTENER EXECUTION AND ERROR HANDLING
  // =============================================================================

  /**
   * Execute a single listener with timeout and error handling
   */
  private async executeListener(
    subscription: ProjectEventSubscription,
    event: ProjectEvent,
    timeout?: number
  ): Promise<void> {
    // Apply event filter if present
    if (subscription.options.filter && !subscription.options.filter(event)) {
      return
    }
    
    // Create execution promise
    const executionPromise = subscription.listener(event)
    
    // Apply timeout if specified
    if (timeout) {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Listener execution timeout: ${timeout}ms`)), timeout)
      })
      
      await Promise.race([executionPromise, timeoutPromise])
    } else {
      await executionPromise
    }
  }

  /**
   * Handle listener execution errors with recovery
   */
  private async handleListenerError(
    subscription: ProjectEventSubscription,
    event: ProjectEvent,
    error: Error
  ): Promise<void> {
    this.errorService.handleError(error, 'ProjectEventEmitter:ListenerExecution', {
      subscriptionId: subscription.id,
      eventId: event.id,
      eventType: event.type
    })
    
    // Implement retry logic if configured
    // For now, just log the error - retry logic can be added later
    this.logger.error('Listener error recovery attempted', {
      subscriptionId: subscription.id,
      eventId: event.id,
      error: error.message
    })
  }

  /**
   * Handle event emission errors
   */
  private async handleEmissionError(
    eventType: string,
    event: ProjectEvent,
    error: Error
  ): Promise<void> {
    this.errorService.handleError(error, 'ProjectEventEmitter:EventEmission', {
      eventType,
      eventId: event.id
    })
    
    this.logger.error('Event emission failed', {
      eventType,
      eventId: event.id,
      error: error.message
    })
  }

  // =============================================================================
  // METRICS AND MONITORING
  // =============================================================================

  /**
   * Update performance metrics
   */
  private updateMetrics(eventType: string, result: EmissionResult): void {
    this.metrics.totalEmitted++
    this.metrics.totalListenersExecuted += result.listenersExecuted
    
    // Update average execution time
    const totalTime = this.metrics.averageExecutionTime * (this.metrics.totalEmitted - 1)
    this.metrics.averageExecutionTime = (totalTime + result.executionTime) / this.metrics.totalEmitted
    
    // Update error rate
    const totalErrors = result.errors.length
    const totalExecutions = this.metrics.totalListenersExecuted
    this.metrics.errorRate = totalExecutions > 0 ? (totalErrors / totalExecutions) * 100 : 0
    
    // Update by event type metrics
    const typeMetrics = this.metrics.byEventType.get(eventType) || {
      count: 0,
      averageTime: 0,
      errorCount: 0
    }
    
    typeMetrics.count++
    typeMetrics.averageTime = (
      (typeMetrics.averageTime * (typeMetrics.count - 1)) + result.executionTime
    ) / typeMetrics.count
    typeMetrics.errorCount += result.errors.length
    
    this.metrics.byEventType.set(eventType, typeMetrics)
    
    // Update memory usage
    this.updateMemoryMetrics()
  }

  /**
   * Update memory usage metrics
   */
  private updateMemoryMetrics(): void {
    let listenersCount = 0
    for (const listeners of this.listeners.values()) {
      listenersCount += listeners.length
    }
    listenersCount += this.wildcardListeners.length
    
    this.metrics.memoryUsage = {
      listenersCount,
      eventsHistorySize: this.emissionHistory.length,
      approximateMemoryBytes: this.estimateMemoryUsage()
    }
  }

  /**
   * Estimate memory usage in bytes
   */
  private estimateMemoryUsage(): number {
    // Rough estimation of memory usage
    const listenersMemory = this.metrics.memoryUsage.listenersCount * 200 // ~200 bytes per listener
    const historyMemory = this.emissionHistory.length * 500 // ~500 bytes per history entry
    const cacheMemory = this.patternCache.size * 100 // ~100 bytes per cached pattern
    
    return listenersMemory + historyMemory + cacheMemory
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): EventEmitterMetrics {
    if (this.options.enableMetrics) {
      this.updateMemoryMetrics()
      return { ...this.metrics }
    }
    
    throw new ProjectEventEmitterError('Metrics collection is disabled')
  }

  /**
   * Reset performance metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalEmitted: 0,
      totalListenersExecuted: 0,
      averageExecutionTime: 0,
      errorRate: 0,
      memoryUsage: {
        listenersCount: 0,
        eventsHistorySize: 0,
        approximateMemoryBytes: 0
      },
      byEventType: new Map()
    }
    
    this.logger.info('Event emitter metrics reset')
  }

  // =============================================================================
  // HISTORY AND DEBUGGING
  // =============================================================================

  /**
   * Add event to emission history
   */
  private addToHistory(event: ProjectEvent, result: EmissionResult): void {
    this.emissionHistory.push({
      event,
      result,
      timestamp: createTimestamp()
    })
    
    // Maintain memory limit
    if (this.emissionHistory.length > this.options.memoryLimit) {
      this.emissionHistory.splice(0, this.emissionHistory.length - this.options.memoryLimit)
    }
  }

  /**
   * Get event emission history
   */
  getEmissionHistory(limit?: number): Array<{
    event: ProjectEvent
    result: EmissionResult
    timestamp: string
  }> {
    const history = [...this.emissionHistory].reverse() // Most recent first
    return limit ? history.slice(0, limit) : history
  }

  /**
   * Clear emission history
   */
  clearHistory(): void {
    this.emissionHistory.splice(0)
    this.logger.info('Event emission history cleared')
  }

  // =============================================================================
  // UTILITY AND INSPECTION METHODS
  // =============================================================================

  /**
   * Get all active subscriptions
   */
  getSubscriptions(): Map<string, ProjectEventSubscription[]> {
    const allSubscriptions = new Map<string, ProjectEventSubscription[]>()
    
    // Add typed subscriptions
    for (const [eventType, subscriptions] of this.listeners.entries()) {
      allSubscriptions.set(eventType, [...subscriptions])
    }
    
    // Add wildcard subscriptions
    if (this.wildcardListeners.length > 0) {
      allSubscriptions.set('*', [...this.wildcardListeners])
    }
    
    return allSubscriptions
  }

  /**
   * Get listener count for an event type
   */
  getListenerCount(eventType?: string): number {
    if (eventType) {
      return (this.listeners.get(eventType) || []).length
    }
    
    let total = 0
    for (const listeners of this.listeners.values()) {
      total += listeners.length
    }
    total += this.wildcardListeners.length
    
    return total
  }

  /**
   * Check if event type has listeners
   */
  hasListeners(eventType: string): boolean {
    return this.getMatchingListeners(eventType).length > 0
  }

  /**
   * Validate event structure
   */
  private validateEvent(event: ProjectEvent): void {
    if (!event || typeof event !== 'object') {
      throw new ProjectEventEmitterError('Event must be an object')
    }
    
    if (!event.id || !event.type || !event.timestamp || !event.projectId) {
      throw new ProjectEventEmitterError(
        'Event must have id, type, timestamp, and projectId properties'
      )
    }
  }

  /**
   * Get event emitter configuration
   */
  getConfiguration(): Required<ProjectEventEmitterOptions> & WildcardConfig {
    return {
      ...this.options,
      ...this.wildcardConfig
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Clear all listeners
    this.removeAllListeners()
    
    // Clear pattern cache
    this.patternCache.clear()
    
    // Clear emission history
    this.clearHistory()
    
    // Reset metrics
    this.resetMetrics()
    
    this.logger.info('ProjectEventEmitter cleaned up')
  }
}

// =============================================================================
// ERROR CLASSES
// =============================================================================

/**
 * Project Event Emitter specific error
 */
export class ProjectEventEmitterError extends ReadyAIError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'PROJECT_EVENT_EMITTER_ERROR', 500, details)
    this.name = 'ProjectEventEmitterError'
  }
}

// =============================================================================
// FACTORY AND UTILITY FUNCTIONS
// =============================================================================

/**
 * Create a new ProjectEventEmitter instance
 */
export function createProjectEventEmitter(
  logger: Logger,
  errorService: ErrorService,
  projectEventService: ProjectEventService,
  options?: ProjectEventEmitterOptions
): ProjectEventEmitter {
  return new ProjectEventEmitter(logger, errorService, projectEventService, options)
}

/**
 * Type guard for ProjectEvent
 */
export function isProjectEvent(obj: any): obj is ProjectEvent {
  return obj && 
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.type === 'string' &&
    typeof obj.timestamp === 'string' &&
    typeof obj.projectId === 'string'
}

// =============================================================================
// EXPORTS
// =============================================================================

export default ProjectEventEmitter

export {
  type ProjectEventEmitterOptions,
  type ListenerConfig,
  type EmissionResult,
  type EventEmitterMetrics,
  type WildcardConfig
}
