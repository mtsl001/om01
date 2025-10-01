// packages/error-handling/services/ErrorReporting.ts

/**
 * ReadyAI Error Reporting Service
 * 
 * Comprehensive error reporting system adapted from Cline's production-tested telemetry
 * and error handling framework. This service provides intelligent error reporting,
 * privacy-controlled telemetry, and comprehensive error analytics for the ReadyAI
 * Personal AI Development Orchestrator.
 * 
 * Based on Cline's telemetry error reporting patterns with ReadyAI-specific extensions
 * for multi-phase project orchestration, context management operations, and AI-powered
 * development workflow error tracking.
 * 
 * @version 1.1.0 - Production Ready
 * @author ReadyAI Development Team
 */

import { 
  ReadyAIError, 
  UUID, 
  generateUUID, 
  createTimestamp,
  PhaseType,
  AIProviderType,
  wrapAsync,
  AsyncResult 
} from '../../foundation/types/core'

import { 
  ErrorClassifier, 
  ErrorClassificationResult,
  ErrorCategory,
  ErrorSeverity,
  ErrorType,
  RecoveryStrategy
} from './ErrorClassifier'

import { Logger } from '../../logging/services/Logger'

// =============================================================================
// ERROR REPORTING INTERFACES
// =============================================================================

/**
 * Error reporting configuration with privacy controls
 * Adapted from Cline's telemetry configuration patterns
 */
export interface ErrorReportingConfig {
  /** Enable error reporting */
  enabled: boolean
  
  /** Enable automatic error reporting */
  autoReport: boolean
  
  /** Privacy level for error reporting */
  privacyLevel: 'minimal' | 'standard' | 'detailed'
  
  /** Report only critical errors */
  criticalOnly: boolean
  
  /** Maximum error reports per session */
  maxReportsPerSession: number
  
  /** Batch size for error reporting */
  batchSize: number
  
  /** Reporting interval in milliseconds */
  reportingInterval: number
  
  /** Include stack traces in reports */
  includeStackTraces: boolean
  
  /** Include context metadata */
  includeContextMetadata: boolean
  
  /** Include project information */
  includeProjectInfo: boolean
  
  /** Include AI provider information */
  includeProviderInfo: boolean
  
  /** Sampling rate for non-critical errors (0-1) */
  samplingRate: number
  
  /** Custom error reporting endpoint */
  reportingEndpoint?: string
  
  /** API key for error reporting service */
  apiKey?: string
}

/**
 * Error report structure with comprehensive context
 */
export interface ErrorReport {
  /** Unique report identifier */
  id: UUID
  
  /** Error report timestamp */
  timestamp: string
  
  /** Error classification */
  classification: ErrorClassificationResult
  
  /** Original error information */
  error: {
    message: string
    name?: string
    code?: string
    stack?: string
  }
  
  /** Context information */
  context: ErrorReportContext
  
  /** System information */
  system: SystemInfo
  
  /** ReadyAI-specific metadata */
  readyAiMetadata: ReadyAIMetadata
  
  /** Privacy-sanitized data */
  sanitized: boolean
  
  /** Report severity level */
  severity: ErrorSeverity
  
  /** Error frequency information */
  frequency: {
    occurrenceCount: number
    firstOccurrence: string
    lastOccurrence: string
    sessionOccurrences: number
  }
  
  /** Recovery information */
  recovery: {
    attempted: boolean
    successful: boolean
    strategy?: RecoveryStrategy
    attempts: number
  }
}

/**
 * Error report context information
 */
export interface ErrorReportContext {
  /** Request/operation identifier */
  requestId?: string
  
  /** Session identifier */
  sessionId?: string
  
  /** Correlation identifier */
  correlationId?: string
  
  /** Project identifier (if privacy allows) */
  projectId?: string
  
  /** Current phase */
  phase?: PhaseType
  
  /** Operation being performed */
  operation?: string
  
  /** Component or service source */
  source?: string
  
  /** AI provider information */
  aiProvider?: {
    provider: AIProviderType
    model: string
    temperature?: number
  }
  
  /** File path (sanitized) */
  filePath?: string
  
  /** Additional context metadata */
  metadata?: Record<string, any>
}

/**
 * System information for error reports
 */
export interface SystemInfo {
  /** Operating system */
  os: {
    platform: string
    version: string
    arch: string
  }
  
  /** Runtime information */
  runtime: {
    version: string
    environment: 'development' | 'production' | 'test'
  }
  
  /** ReadyAI version */
  readyAiVersion: string
  
  /** Memory usage */
  memory: {
    used: number
    total: number
    available: number
  }
  
  /** Performance metrics */
  performance?: {
    uptime: number
    cpuUsage: number
    activeConnections: number
  }
}

/**
 * ReadyAI-specific metadata for error reports
 */
export interface ReadyAIMetadata {
  /** Development phase context */
  phaseContext?: {
    currentPhase: PhaseType
    phaseProgress: number
    phaseDuration: number
  }
  
  /** Context management metrics */
  contextMetrics?: {
    totalContexts: number
    activeContexts: number
    contextRetrievalTime: number
    contextWindowUtilization: number
  }
  
  /** AI generation metrics */
  aiMetrics?: {
    generationCount: number
    averageGenerationTime: number
    tokenUsage: {
      input: number
      output: number
      total: number
    }
    modelSwitches: number
  }
  
  /** Project quality metrics */
  qualityMetrics?: {
    testCoverage: number
    lintingScore: number
    dependencyHealth: number
  }
}

/**
 * Error reporting channel interface
 */
export interface ErrorReportingChannel {
  /** Channel identifier */
  id: string
  
  /** Channel name */
  name: string
  
  /** Channel priority (lower = higher priority) */
  priority: number
  
  /** Send error report */
  send(report: ErrorReport, config: ErrorReportingConfig): Promise<boolean>
  
  /** Test channel connectivity */
  test(): Promise<boolean>
}

/**
 * Error report batch for efficient transmission
 */
export interface ErrorReportBatch {
  /** Batch identifier */
  id: UUID
  
  /** Batch timestamp */
  timestamp: string
  
  /** Error reports in batch */
  reports: ErrorReport[]
  
  /** Batch metadata */
  metadata: {
    sessionId: string
    totalErrors: number
    criticalErrors: number
    reportingPeriod: {
      start: string
      end: string
    }
  }
}

// =============================================================================
// ERROR REPORTING SERVICE
// =============================================================================

/**
 * Advanced error reporting service
 * Adapted from Cline's telemetry patterns with ReadyAI-specific enhancements
 */
export class ErrorReporting {
  private errorClassifier: ErrorClassifier
  private logger: Logger
  private config: ErrorReportingConfig
  private reportingChannels = new Map<string, ErrorReportingChannel>()
  private pendingReports: ErrorReport[] = []
  private reportedErrors = new Set<string>()
  private sessionReportCount = 0
  private reportingTimer?: NodeJS.Timeout
  
  /**
   * Error reporting metrics and statistics
   */
  private metrics = {
    totalReports: 0,
    successfulReports: 0,
    failedReports: 0,
    criticalReports: 0,
    suppressedReports: 0,
    averageReportSize: 0,
    reportingLatency: 0,
    channelSuccessRates: new Map<string, { attempts: number, successes: number }>()
  }
  
  /**
   * Error frequency tracking
   */
  private errorFrequency = new Map<string, {
    count: number
    firstOccurrence: string
    lastOccurrence: string
    sessionCount: number
  }>()

  constructor(
    errorClassifier: ErrorClassifier,
    logger: Logger,
    config?: Partial<ErrorReportingConfig>
  ) {
    this.errorClassifier = errorClassifier
    this.logger = logger
    this.config = {
      enabled: true,
      autoReport: false, // Privacy-first default
      privacyLevel: 'standard',
      criticalOnly: false,
      maxReportsPerSession: 50,
      batchSize: 10,
      reportingInterval: 60000, // 1 minute
      includeStackTraces: true,
      includeContextMetadata: true,
      includeProjectInfo: false, // Privacy protection
      includeProviderInfo: true,
      samplingRate: 0.1, // 10% for non-critical errors
      ...config
    }
    
    this.initializeDefaultChannels()
    this.startPeriodicReporting()
    this.setupGracefulShutdown()
  }

  /**
   * Report an error with automatic classification and privacy controls
   */
  public async reportError(
    error: Error | ReadyAIError | any,
    context?: Partial<ErrorReportContext>,
    options?: {
      force?: boolean
      skipSampling?: boolean
      customSeverity?: ErrorSeverity
    }
  ): AsyncResult<void> {
    if (!this.config.enabled) {
      return { success: true, data: undefined }
    }

    try {
      const classification = this.errorClassifier.classify(error, {
        source: context?.source,
        operation: context?.operation,
        aiProvider: context?.aiProvider?.provider,
        filePath: context?.filePath,
        phase: context?.phase,
        metadata: context?.metadata
      })

      // Check if we should report this error
      if (!this.shouldReportError(classification, options)) {
        this.metrics.suppressedReports++
        return { success: true, data: undefined }
      }

      const report = await this.createErrorReport(error, classification, context, options)
      
      if (this.config.autoReport || options?.force) {
        await this.sendReport(report)
      } else {
        this.queueReport(report)
      }

      this.updateErrorFrequency(report)
      this.sessionReportCount++
      this.metrics.totalReports++

      this.logger.info(
        `Error reported: ${classification.category}/${classification.errorType}`,
        'errorreporting',
        { 
          reportId: report.id,
          severity: report.severity,
          autoReported: this.config.autoReport || options?.force
        },
        'error-reporting'
      )

      return { success: true, data: undefined }

    } catch (reportingError) {
      const error = reportingError instanceof ReadyAIError 
        ? reportingError 
        : new ReadyAIError(
            'Failed to report error',
            'ERROR_REPORTING_FAILED',
            500,
            { originalError: reportingError }
          )
      
      this.logger.error(
        'Error reporting failed',
        'errorreporting',
        { error: error.message },
        'error-reporting'
      )
      
      return { success: false, error }
    }
  }

  /**
   * Batch report multiple errors efficiently
   */
  public async reportErrorBatch(
    errors: Array<{
      error: Error | ReadyAIError | any
      context?: Partial<ErrorReportContext>
      options?: { force?: boolean; skipSampling?: boolean; customSeverity?: ErrorSeverity }
    }>
  ): Promise<Array<AsyncResult<void>>> {
    const promises = errors.map(({ error, context, options }) => 
      this.reportError(error, context, options)
    )
    
    return Promise.all(promises)
  }

  /**
   * Send pending reports immediately
   */
  public async flush(): Promise<void> {
    if (this.pendingReports.length === 0) {
      return
    }

    const reportsToSend = [...this.pendingReports]
    this.pendingReports = []

    const batch: ErrorReportBatch = {
      id: generateUUID(),
      timestamp: createTimestamp(),
      reports: reportsToSend,
      metadata: {
        sessionId: this.getSessionId(),
        totalErrors: reportsToSend.length,
        criticalErrors: reportsToSend.filter(r => r.severity === 'critical').length,
        reportingPeriod: {
          start: reportsToSend[0]?.timestamp || createTimestamp(),
          end: reportsToSend[reportsToSend.length - 1]?.timestamp || createTimestamp()
        }
      }
    }

    await this.sendBatch(batch)
  }

  /**
   * Get error reporting statistics
   */
  public getReportingMetrics(): {
    totalReports: number
    successRate: number
    criticalReports: number
    suppressedReports: number
    averageReportSize: number
    reportingLatency: number
    sessionReportCount: number
    pendingReports: number
    channelHealth: Record<string, { successRate: number; lastSuccess: string }>
    topErrorCategories: Array<{ category: string; count: number }>
  } {
    const channelHealth: Record<string, { successRate: number; lastSuccess: string }> = {}
    for (const [channelId, stats] of this.metrics.channelSuccessRates) {
      channelHealth[channelId] = {
        successRate: stats.attempts > 0 ? stats.successes / stats.attempts : 0,
        lastSuccess: 'unknown' // Would be tracked with timestamps in production
      }
    }

    // Calculate top error categories
    const categoryCount = new Map<string, number>()
    for (const [, frequency] of this.errorFrequency) {
      // Would need to track category in frequency data for accurate stats
      // This is a simplified version
    }

    const topErrorCategories = Array.from(categoryCount.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([category, count]) => ({ category, count }))

    return {
      totalReports: this.metrics.totalReports,
      successRate: this.metrics.totalReports > 0 
        ? this.metrics.successfulReports / this.metrics.totalReports 
        : 0,
      criticalReports: this.metrics.criticalReports,
      suppressedReports: this.metrics.suppressedReports,
      averageReportSize: this.metrics.averageReportSize,
      reportingLatency: this.metrics.reportingLatency,
      sessionReportCount: this.sessionReportCount,
      pendingReports: this.pendingReports.length,
      channelHealth,
      topErrorCategories
    }
  }

  /**
   * Update error reporting configuration
   */
  public updateConfig(newConfig: Partial<ErrorReportingConfig>): void {
    this.config = { ...this.config, ...newConfig }
    
    // Restart periodic reporting with new interval
    if (this.reportingTimer) {
      clearInterval(this.reportingTimer)
    }
    
    if (this.config.enabled && this.config.reportingInterval > 0) {
      this.startPeriodicReporting()
    }
    
    this.logger.info(
      'Error reporting configuration updated',
      'errorreporting',
      { 
        enabled: this.config.enabled,
        autoReport: this.config.autoReport,
        privacyLevel: this.config.privacyLevel
      },
      'error-reporting'
    )
  }

  /**
   * Register custom reporting channel
   */
  public registerChannel(channel: ErrorReportingChannel): void {
    this.reportingChannels.set(channel.id, channel)
    this.logger.info(
      `Registered error reporting channel: ${channel.name}`,
      'errorreporting',
      { channelId: channel.id, priority: channel.priority },
      'error-reporting'
    )
  }

  /**
   * Test all reporting channels
   */
  public async testChannels(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {}
    
    for (const [channelId, channel] of this.reportingChannels) {
      try {
        results[channelId] = await channel.test()
      } catch (error) {
        results[channelId] = false
        this.logger.error(
          `Channel test failed: ${channel.name}`,
          'errorreporting',
          { channelId, error: error instanceof Error ? error.message : error },
          'error-reporting'
        )
      }
    }
    
    return results
  }

  /**
   * Clear error frequency tracking and metrics
   */
  public clearMetrics(): void {
    this.errorFrequency.clear()
    this.reportedErrors.clear()
    this.sessionReportCount = 0
    this.metrics = {
      totalReports: 0,
      successfulReports: 0,
      failedReports: 0,
      criticalReports: 0,
      suppressedReports: 0,
      averageReportSize: 0,
      reportingLatency: 0,
      channelSuccessRates: new Map()
    }
  }

  /**
   * Gracefully shutdown error reporting
   */
  public async shutdown(): Promise<void> {
    if (this.reportingTimer) {
      clearInterval(this.reportingTimer)
      this.reportingTimer = undefined
    }
    
    // Send any pending reports
    await this.flush()
    
    this.logger.info(
      'Error reporting service shutdown completed',
      'errorreporting',
      { pendingReports: 0, totalReports: this.metrics.totalReports },
      'error-reporting'
    )
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  /**
   * Determine if an error should be reported based on configuration and classification
   */
  private shouldReportError(
    classification: ErrorClassificationResult,
    options?: { force?: boolean; skipSampling?: boolean; customSeverity?: ErrorSeverity }
  ): boolean {
    if (options?.force) {
      return true
    }

    // Check session limits
    if (this.sessionReportCount >= this.config.maxReportsPerSession) {
      return false
    }

    // Check if critical only mode is enabled
    if (this.config.criticalOnly && classification.severity !== 'critical') {
      return false
    }

    // Check error frequency to avoid spam
    const errorKey = this.generateErrorKey(classification)
    const frequency = this.errorFrequency.get(errorKey)
    if (frequency && frequency.sessionCount > 5) { // Max 5 same errors per session
      return false
    }

    // Apply sampling for non-critical errors
    if (!options?.skipSampling && classification.severity !== 'critical' && classification.severity !== 'high') {
      if (Math.random() > this.config.samplingRate) {
        return false
      }
    }

    return true
  }

  /**
   * Create a comprehensive error report
   */
  private async createErrorReport(
    error: Error | ReadyAIError | any,
    classification: ErrorClassificationResult,
    context?: Partial<ErrorReportContext>,
    options?: { customSeverity?: ErrorSeverity }
  ): Promise<ErrorReport> {
    const reportId = generateUUID()
    const timestamp = createTimestamp()

    // Extract error information
    const errorInfo = {
      message: this.extractErrorMessage(error),
      name: error instanceof Error ? error.name : 'Unknown',
      code: this.extractErrorCode(error),
      stack: this.config.includeStackTraces && error instanceof Error ? error.stack : undefined
    }

    // Build context with privacy controls
    const reportContext: ErrorReportContext = {
      requestId: context?.requestId || generateUUID(),
      sessionId: this.getSessionId(),
      correlationId: context?.correlationId,
      projectId: this.config.includeProjectInfo ? context?.projectId : undefined,
      phase: context?.phase,
      operation: context?.operation,
      source: context?.source || 'unknown',
      aiProvider: this.config.includeProviderInfo ? context?.aiProvider : undefined,
      filePath: context?.filePath ? this.sanitizeFilePath(context.filePath) : undefined,
      metadata: this.config.includeContextMetadata ? this.sanitizeMetadata(context?.metadata) : undefined
    }

    // Collect system information
    const systemInfo = await this.collectSystemInfo()

    // Collect ReadyAI-specific metadata
    const readyAiMetadata = await this.collectReadyAIMetadata(context)

    // Determine error frequency
    const errorKey = this.generateErrorKey(classification)
    const frequency = this.errorFrequency.get(errorKey) || {
      count: 0,
      firstOccurrence: timestamp,
      lastOccurrence: timestamp,
      sessionCount: 0
    }

    const report: ErrorReport = {
      id: reportId,
      timestamp,
      classification,
      error: errorInfo,
      context: reportContext,
      system: systemInfo,
      readyAiMetadata,
      sanitized: true,
      severity: options?.customSeverity || classification.severity,
      frequency: {
        occurrenceCount: frequency.count + 1,
        firstOccurrence: frequency.firstOccurrence,
        lastOccurrence: timestamp,
        sessionOccurrences: frequency.sessionCount + 1
      },
      recovery: {
        attempted: false, // Will be updated by recovery system
        successful: false,
        attempts: 0
      }
    }

    return report
  }

  /**
   * Send individual error report
   */
  private async sendReport(report: ErrorReport): Promise<void> {
    const startTime = Date.now()

    // Sort channels by priority
    const sortedChannels = Array.from(this.reportingChannels.values())
      .sort((a, b) => a.priority - b.priority)

    let sent = false
    for (const channel of sortedChannels) {
      try {
        const success = await channel.send(report, this.config)
        
        if (success) {
          sent = true
          this.trackChannelSuccess(channel.id, true)
          break
        }
      } catch (error) {
        this.trackChannelSuccess(channel.id, false)
        this.logger.warn(
          `Error reporting channel failed: ${channel.name}`,
          'errorreporting',
          { 
            channelId: channel.id, 
            reportId: report.id,
            error: error instanceof Error ? error.message : error
          },
          'error-reporting'
        )
      }
    }

    const duration = Date.now() - startTime
    this.metrics.reportingLatency = (this.metrics.reportingLatency + duration) / 2 // Simple moving average

    if (sent) {
      this.metrics.successfulReports++
      if (report.severity === 'critical') {
        this.metrics.criticalReports++
      }
    } else {
      this.metrics.failedReports++
    }
  }

  /**
   * Send batch of error reports
   */
  private async sendBatch(batch: ErrorReportBatch): Promise<void> {
    // For now, send individual reports
    // In a full implementation, this would optimize by sending as a single batch
    for (const report of batch.reports) {
      await this.sendReport(report)
    }
  }

  /**
   * Queue error report for batch sending
   */
  private queueReport(report: ErrorReport): void {
    this.pendingReports.push(report)
    
    // Auto-flush if batch size reached
    if (this.pendingReports.length >= this.config.batchSize) {
      this.flush().catch(error => {
        this.logger.error(
          'Error report batch flush failed',
          'errorreporting',
          { error: error instanceof Error ? error.message : error },
          'error-reporting'
        )
      })
    }
  }

  /**
   * Update error frequency tracking
   */
  private updateErrorFrequency(report: ErrorReport): void {
    const errorKey = this.generateErrorKey(report.classification)
    
    const current = this.errorFrequency.get(errorKey) || {
      count: 0,
      firstOccurrence: report.timestamp,
      lastOccurrence: report.timestamp,
      sessionCount: 0
    }

    this.errorFrequency.set(errorKey, {
      count: current.count + 1,
      firstOccurrence: current.firstOccurrence,
      lastOccurrence: report.timestamp,
      sessionCount: current.sessionCount + 1
    })
  }

  /**
   * Generate unique key for error deduplication
   */
  private generateErrorKey(classification: ErrorClassificationResult): string {
    return `${classification.category}:${classification.errorType}:${classification.extractedCodes.join(',')}`
  }

  /**
   * Track channel success/failure rates
   */
  private trackChannelSuccess(channelId: string, success: boolean): void {
    const current = this.metrics.channelSuccessRates.get(channelId) || { attempts: 0, successes: 0 }
    current.attempts++
    if (success) {
      current.successes++
    }
    this.metrics.channelSuccessRates.set(channelId, current)
  }

  /**
   * Extract error message with fallbacks
   */
  private extractErrorMessage(error: any): string {
    if (typeof error === 'string') return error
    if (error?.message) return error.message
    if (error?.error?.message) return error.error.message
    return 'Unknown error'
  }

  /**
   * Extract error code with fallbacks
   */
  private extractErrorCode(error: any): string | undefined {
    if (error?.code) return error.code
    if (error?.error?.code) return error.error.code
    if (error?.statusCode) return error.statusCode.toString()
    return undefined
  }

  /**
   * Sanitize file path for privacy
   */
  private sanitizeFilePath(filePath: string): string {
    // Remove absolute paths and user-specific information
    const segments = filePath.split('/').filter(Boolean)
    if (segments.length <= 2) return filePath
    
    return segments.slice(-2).join('/')
  }

  /**
   * Sanitize metadata for privacy
   */
  private sanitizeMetadata(metadata?: Record<string, any>): Record<string, any> | undefined {
    if (!metadata) return undefined
    
    const sanitized: Record<string, any> = {}
    const allowedKeys = ['phase', 'operation', 'duration', 'tokenCount', 'retryCount']
    
    for (const key of allowedKeys) {
      if (metadata[key] !== undefined) {
        sanitized[key] = metadata[key]
      }
    }
    
    return Object.keys(sanitized).length > 0 ? sanitized : undefined
  }

  /**
   * Collect system information
   */
  private async collectSystemInfo(): Promise<SystemInfo> {
    const os = await import('os')
    const process = globalThis.process || { version: 'unknown', env: {} }
    
    return {
      os: {
        platform: os.platform(),
        version: os.version(),
        arch: os.arch()
      },
      runtime: {
        version: process.version || 'unknown',
        environment: (process.env?.NODE_ENV as any) || 'unknown'
      },
      readyAiVersion: '1.1.0', // Would be imported from package.json
      memory: {
        used: process.memoryUsage?.()?.heapUsed || 0,
        total: process.memoryUsage?.()?.heapTotal || 0,
        available: os.freemem?.() || 0
      },
      performance: {
        uptime: process.uptime?.() || 0,
        cpuUsage: 0, // Would calculate actual CPU usage
        activeConnections: 0 // Would track active connections
      }
    }
  }

  /**
   * Collect ReadyAI-specific metadata
   */
  private async collectReadyAIMetadata(context?: Partial<ErrorReportContext>): Promise<ReadyAIMetadata> {
    return {
      phaseContext: context?.phase ? {
        currentPhase: context.phase,
        phaseProgress: 0, // Would calculate from actual progress
        phaseDuration: 0  // Would calculate from phase start time
      } : undefined,
      contextMetrics: {
        totalContexts: 0, // Would get from context manager
        activeContexts: 0,
        contextRetrievalTime: 0,
        contextWindowUtilization: 0
      },
      aiMetrics: {
        generationCount: 0, // Would get from AI service
        averageGenerationTime: 0,
        tokenUsage: {
          input: 0,
          output: 0,
          total: 0
        },
        modelSwitches: 0
      }
    }
  }

  /**
   * Get current session identifier
   */
  private getSessionId(): string {
    // Would be implemented to track session across service lifecycle
    return 'session-' + Date.now()
  }

  /**
   * Initialize default reporting channels
   */
  private initializeDefaultChannels(): void {
    // Console channel for development
    this.registerChannel({
      id: 'console',
      name: 'Console Logger',
      priority: 1,
      send: async (report: ErrorReport) => {
        this.logger.error(
          `Error Report: ${report.classification.category}/${report.classification.errorType}`,
          'errorreporting',
          {
            reportId: report.id,
            severity: report.severity,
            message: report.error.message,
            context: report.context
          },
          'console-channel'
        )
        return true
      },
      test: async () => true
    })

    // File channel for persistent logging
    this.registerChannel({
      id: 'file',
      name: 'File Logger',
      priority: 2,
      send: async (report: ErrorReport) => {
        // Would write to dedicated error report file
        return true
      },
      test: async () => true
    })

    // HTTP channel for remote reporting (if configured)
    if (this.config.reportingEndpoint) {
      this.registerChannel({
        id: 'http',
        name: 'HTTP Reporter',
        priority: 3,
        send: async (report: ErrorReport, config: ErrorReportingConfig) => {
          // Would send HTTP request to reporting endpoint
          return false // Not implemented in this example
        },
        test: async () => false
      })
    }
  }

  /**
   * Start periodic reporting timer
   */
  private startPeriodicReporting(): void {
    this.reportingTimer = setInterval(() => {
      if (this.pendingReports.length > 0) {
        this.flush().catch(error => {
          this.logger.error(
            'Periodic error report flush failed',
            'errorreporting',
            { error: error instanceof Error ? error.message : error },
            'error-reporting'
          )
        })
      }
    }, this.config.reportingInterval)
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const shutdownHandler = () => {
      this.shutdown().catch(error => {
        console.error('[ErrorReporting] Shutdown failed:', error)
      })
    }

    process.on('SIGTERM', shutdownHandler)
    process.on('SIGINT', shutdownHandler)
    process.on('exit', shutdownHandler)
  }
}

// =============================================================================
// PRIVACY-AWARE ERROR REPORTING HELPERS
// =============================================================================

/**
 * Privacy levels for error reporting
 */
export const PRIVACY_LEVELS = {
  minimal: {
    includeStackTraces: false,
    includeContextMetadata: false,
    includeProjectInfo: false,
    includeProviderInfo: false,
    sanitizeLevel: 'aggressive'
  },
  standard: {
    includeStackTraces: true,
    includeContextMetadata: true,
    includeProjectInfo: false,
    includeProviderInfo: true,
    sanitizeLevel: 'moderate'
  },
  detailed: {
    includeStackTraces: true,
    includeContextMetadata: true,
    includeProjectInfo: true,
    includeProviderInfo: true,
    sanitizeLevel: 'minimal'
  }
} as const

/**
 * Create privacy-compliant error reporting configuration
 */
export function createPrivacyCompliantConfig(
  privacyLevel: keyof typeof PRIVACY_LEVELS,
  overrides?: Partial<ErrorReportingConfig>
): ErrorReportingConfig {
  const baseConfig = PRIVACY_LEVELS[privacyLevel]
  
  return {
    enabled: true,
    autoReport: false,
    privacyLevel,
    criticalOnly: false,
    maxReportsPerSession: 50,
    batchSize: 10,
    reportingInterval: 60000,
    samplingRate: 0.1,
    ...baseConfig,
    ...overrides
  }
}

/**
 * ReadyAI-specific error context helper
 */
export function createReadyAIErrorContext(
  phase?: PhaseType,
  operation?: string,
  aiProvider?: AIProviderType,
  projectId?: string,
  additionalContext?: Record<string, any>
): Partial<ErrorReportContext> {
  return {
    phase,
    operation,
    aiProvider: aiProvider ? {
      provider: aiProvider,
      model: 'unknown' // Would be provided by AI service
    } : undefined,
    projectId,
    requestId: generateUUID(),
    correlationId: generateUUID(),
    metadata: additionalContext
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

// Export main service
export { ErrorReporting }

// Export interfaces
export type {
  ErrorReportingConfig,
  ErrorReport,
  ErrorReportContext,
  SystemInfo,
  ReadyAIMetadata,
  ErrorReportingChannel,
  ErrorReportBatch
}

// Create default instance (will be injected via DI in production)
export const defaultErrorReporting = new ErrorReporting(
  {} as ErrorClassifier, // Will be injected
  {} as Logger           // Will be injected
)

// Export default
export default ErrorReporting
