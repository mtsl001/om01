// packages/logging/services/Logger.ts

/**
 * ReadyAI Logging Service - Core Logger Implementation
 * 
 * Enterprise-grade logging service adapted from Cline's production-proven logging architecture.
 * Provides structured logging, performance monitoring, correlation tracking, and comprehensive
 * error handling with ReadyAI-specific enhancements for phase tracking and development metrics.
 * 
 * Key Features:
 * - Structured logging with correlation IDs
 * - ReadyAI-specific log levels and categories  
 * - Phase-aware context tracking
 * - Performance metrics collection
 * - Automatic error classification
 * - Memory-safe circular buffer for high-volume logging
 * - Thread-safe operations with async batching
 * 
 * Reuse Strategy: 90%+ Extract from Cline's Logger implementation
 * - Direct adaptation of Cline's proven logging patterns
 * - Enhanced with ReadyAI correlation IDs and phase tracking
 * - Maintains Cline's performance optimization and error handling
 */

import { createHash, randomUUID } from 'crypto';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { appendFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { 
  LogLevel, 
  LogCategory, 
  LogEntry, 
  PerformanceMetric, 
  ErrorEntry, 
  ErrorSeverity,
  MetricType,
  LogQuery,
  UUID
} from '../types/logging.js';

/**
 * Logger configuration interface
 */
export interface LoggerConfig {
  /** Minimum log level to output */
  level: LogLevel;
  /** Maximum number of log entries to keep in memory */
  maxMemoryEntries: number;
  /** File path for persistent log storage */
  logFilePath?: string;
  /** Enable console output */
  enableConsole: boolean;
  /** Enable file output */
  enableFile: boolean;
  /** Batch size for file writes */
  batchSize: number;
  /** Flush interval in milliseconds */
  flushInterval: number;
  /** Enable correlation ID tracking */
  enableCorrelation: boolean;
  /** Enable performance metrics */
  enableMetrics: boolean;
  /** ReadyAI-specific: Enable phase context tracking */
  enablePhaseTracking: boolean;
}

/**
 * Default logger configuration optimized for ReadyAI development workflow
 */
const DEFAULT_CONFIG: LoggerConfig = {
  level: 'info',
  maxMemoryEntries: 10000,
  enableConsole: true,
  enableFile: true,
  batchSize: 100,
  flushInterval: 5000, // 5 seconds
  enableCorrelation: true,
  enableMetrics: true,
  enablePhaseTracking: true
};

/**
 * Log level hierarchy for filtering
 */
const LOG_LEVEL_HIERARCHY: Record<LogLevel, number> = {
  'debug': 0,
  'info': 1,
  'warn': 2,
  'error': 3,
  'fatal': 4
};

/**
 * Console styling for different log levels (adapted from Cline's telemetry styling)
 */
const CONSOLE_STYLES = {
  debug: '\x1b[36m', // Cyan
  info: '\x1b[32m',  // Green  
  warn: '\x1b[33m',  // Yellow
  error: '\x1b[31m', // Red
  fatal: '\x1b[41m', // Red background
  reset: '\x1b[0m'
};

/**
 * Circular buffer for memory-efficient log storage
 * Adapted from Cline's efficient memory management patterns
 */
class CircularBuffer<T> {
  private buffer: (T | undefined)[] = [];
  private head = 0;
  private tail = 0;
  private count = 0;

  constructor(private capacity: number) {
    this.buffer = new Array(capacity);
  }

  push(item: T): void {
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;
    
    if (this.count < this.capacity) {
      this.count++;
    } else {
      this.head = (this.head + 1) % this.capacity;
    }
  }

  toArray(): T[] {
    const result: T[] = [];
    if (this.count === 0) return result;

    let index = this.head;
    for (let i = 0; i < this.count; i++) {
      const item = this.buffer[index];
      if (item !== undefined) {
        result.push(item);
      }
      index = (index + 1) % this.capacity;
    }
    return result;
  }

  clear(): void {
    this.head = 0;
    this.tail = 0;
    this.count = 0;
    this.buffer.fill(undefined);
  }

  get length(): number {
    return this.count;
  }
}

/**
 * Performance metrics collector
 */
class MetricsCollector {
  private metrics = new Map<string, PerformanceMetric[]>();
  private startTimes = new Map<string, number>();

  startTiming(key: string): void {
    this.startTimes.set(key, performance.now());
  }

  endTiming(key: string, source: string, projectId?: UUID): PerformanceMetric | null {
    const startTime = this.startTimes.get(key);
    if (startTime === undefined) return null;

    const duration = performance.now() - startTime;
    this.startTimes.delete(key);

    const metric: PerformanceMetric = {
      id: randomUUID() as UUID,
      name: key,
      type: 'timer' as MetricType,
      value: duration,
      unit: 'ms',
      timestamp: new Date().toISOString(),
      source,
      projectId,
      tags: {
        category: 'timing',
        operation: key
      }
    };

    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    this.metrics.get(key)!.push(metric);

    return metric;
  }

  recordMetric(metric: PerformanceMetric): void {
    const key = `${metric.name}_${metric.type}`;
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    this.metrics.get(key)!.push(metric);
  }

  getMetrics(name?: string): PerformanceMetric[] {
    if (name) {
      const exactMatch = this.metrics.get(name) || [];
      const prefixMatches = Array.from(this.metrics.entries())
        .filter(([key]) => key.startsWith(name))
        .flatMap(([, values]) => values);
      
      return [...exactMatch, ...prefixMatches];
    }

    return Array.from(this.metrics.values()).flat();
  }

  clearMetrics(name?: string): void {
    if (name) {
      this.metrics.delete(name);
    } else {
      this.metrics.clear();
    }
  }
}

/**
 * Correlation context for tracking requests across components
 * Inspired by Cline's request correlation patterns
 */
class CorrelationContext {
  private static instance: CorrelationContext;
  private contextMap = new Map<string, {
    correlationId: string;
    projectId?: UUID;
    sessionId?: string;
    phaseType?: string;
  }>();

  static getInstance(): CorrelationContext {
    if (!CorrelationContext.instance) {
      CorrelationContext.instance = new CorrelationContext();
    }
    return CorrelationContext.instance;
  }

  setCorrelationId(correlationId: string, context?: {
    projectId?: UUID;
    sessionId?: string;
    phaseType?: string;
  }): void {
    this.contextMap.set('current', {
      correlationId,
      ...context
    });
  }

  getCorrelationId(): string | undefined {
    return this.contextMap.get('current')?.correlationId;
  }

  getContext(): typeof this.contextMap extends Map<any, infer T> ? T : never {
    return this.contextMap.get('current') || { correlationId: '' };
  }

  clearCorrelation(): void {
    this.contextMap.delete('current');
  }

  generateCorrelationId(): string {
    return randomUUID();
  }
}

/**
 * Main Logger class - Enterprise-grade logging service
 * Adapted from Cline's production logging architecture with ReadyAI enhancements
 */
export class Logger {
  private static instance: Logger;
  private config: LoggerConfig;
  private memoryBuffer: CircularBuffer<LogEntry>;
  private errorBuffer: CircularBuffer<ErrorEntry>;
  private pendingWrites: LogEntry[] = [];
  private flushTimer?: NodeJS.Timeout;
  private metricsCollector: MetricsCollector;
  private correlationContext: CorrelationContext;
  private isShuttingDown = false;

  private constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.memoryBuffer = new CircularBuffer<LogEntry>(this.config.maxMemoryEntries);
    this.errorBuffer = new CircularBuffer<ErrorEntry>(1000); // Fixed size for errors
    this.metricsCollector = new MetricsCollector();
    this.correlationContext = CorrelationContext.getInstance();

    // Initialize file logging if enabled
    if (this.config.enableFile && this.config.logFilePath) {
      this.ensureLogDirectory();
    }

    // Start auto-flush timer
    if (this.config.flushInterval > 0) {
      this.startAutoFlush();
    }

    // Setup graceful shutdown handlers
    this.setupShutdownHandlers();
  }

  /**
   * Get singleton logger instance
   */
  public static getInstance(config?: Partial<LoggerConfig>): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config);
    }
    return Logger.instance;
  }

  /**
   * Create correlation context for request tracking
   */
  public startCorrelation(options?: {
    projectId?: UUID;
    sessionId?: string;
    phaseType?: string;
  }): string {
    const correlationId = this.correlationContext.generateCorrelationId();
    this.correlationContext.setCorrelationId(correlationId, options);
    return correlationId;
  }

  /**
   * End correlation context
   */
  public endCorrelation(): void {
    this.correlationContext.clearCorrelation();
  }

  /**
   * Start performance timing
   */
  public startTiming(key: string): void {
    if (this.config.enableMetrics) {
      this.metricsCollector.startTiming(key);
    }
  }

  /**
   * End performance timing and log result
   */
  public endTiming(key: string, source = 'unknown'): PerformanceMetric | null {
    if (!this.config.enableMetrics) return null;

    const context = this.correlationContext.getContext();
    const metric = this.metricsCollector.endTiming(key, source, context.projectId);
    
    if (metric) {
      // Auto-log slow operations (> 3 seconds for context retrieval KPI)
      if (key.includes('context') && metric.value > 3000) {
        this.warn(`Slow context operation detected: ${key} took ${metric.value}ms`, 
          'performance', { metric, threshold: 3000 });
      }
    }

    return metric;
  }

  /**
   * Record custom performance metric
   */
  public recordMetric(
    name: string,
    type: MetricType,
    value: number,
    unit: string,
    source = 'unknown',
    tags?: Record<string, string>
  ): void {
    if (!this.config.enableMetrics) return;

    const context = this.correlationContext.getContext();
    const metric: PerformanceMetric = {
      id: randomUUID() as UUID,
      name,
      type,
      value,
      unit,
      timestamp: new Date().toISOString(),
      source,
      projectId: context.projectId,
      tags
    };

    this.metricsCollector.recordMetric(metric);
  }

  /**
   * Core logging method with full context
   */
  public log(
    level: LogLevel,
    message: string,
    category: LogCategory = 'system',
    metadata?: Record<string, any>,
    source = 'unknown'
  ): void {
    // Check if level meets threshold
    if (LOG_LEVEL_HIERARCHY[level] < LOG_LEVEL_HIERARCHY[this.config.level]) {
      return;
    }

    const context = this.correlationContext.getContext();
    const logEntry: LogEntry = {
      id: randomUUID() as UUID,
      level,
      category,
      message,
      timestamp: new Date().toISOString(),
      source,
      correlationId: context.correlationId,
      projectId: context.projectId,
      sessionId: context.sessionId,
      metadata: {
        ...metadata,
        ...(this.config.enablePhaseTracking && context.phaseType ? {
          phaseType: context.phaseType
        } : {})
      }
    };

    // Add to memory buffer
    this.memoryBuffer.push(logEntry);

    // Output to console if enabled
    if (this.config.enableConsole) {
      this.writeToConsole(logEntry);
    }

    // Queue for file writing if enabled
    if (this.config.enableFile) {
      this.queueForFileWrite(logEntry);
    }

    // Handle errors specially
    if (level === 'error' || level === 'fatal') {
      this.handleError(logEntry);
    }
  }

  /**
   * Convenience logging methods with type safety
   */
  public debug(message: string, category?: LogCategory, metadata?: Record<string, any>, source = 'unknown'): void {
    this.log('debug', message, category, metadata, source);
  }

  public info(message: string, category?: LogCategory, metadata?: Record<string, any>, source = 'unknown'): void {
    this.log('info', message, category, metadata, source);
  }

  public warn(message: string, category?: LogCategory, metadata?: Record<string, any>, source = 'unknown'): void {
    this.log('warn', message, category, metadata, source);
  }

  public error(message: string, category?: LogCategory, metadata?: Record<string, any>, source = 'unknown'): void {
    this.log('error', message, category, metadata, source);
  }

  public fatal(message: string, category?: LogCategory, metadata?: Record<string, any>, source = 'unknown'): void {
    this.log('fatal', message, category, metadata, source);
  }

  /**
   * Log errors with enhanced context and stack traces
   */
  public logError(
    error: Error | string,
    category: LogCategory = 'system',
    metadata?: Record<string, any>,
    source = 'unknown',
    severity: ErrorSeverity = 'medium'
  ): void {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const stackTrace = error instanceof Error ? error.stack : undefined;

    const context = this.correlationContext.getContext();
    const errorEntry: ErrorEntry = {
      id: randomUUID() as UUID,
      message: errorMessage,
      errorType: error instanceof Error ? error.constructor.name : 'GenericError',
      severity,
      stackTrace,
      source,
      timestamp: new Date().toISOString(),
      projectId: context.projectId,
      sessionId: context.sessionId,
      correlationId: context.correlationId || '',
      context: metadata,
      handled: true, // Assume handled since it's being logged
      resolved: false,
      occurrenceCount: 1,
      firstOccurrence: new Date().toISOString(),
      lastOccurrence: new Date().toISOString()
    };

    this.errorBuffer.push(errorEntry);
    this.error(errorMessage, category, { ...metadata, severity, stackTrace }, source);
  }

  /**
   * Query logs from memory buffer with filtering
   */
  public queryLogs(query: Partial<LogQuery> = {}): LogEntry[] {
    const logs = this.memoryBuffer.toArray();
    
    return logs.filter(log => {
      // Filter by levels
      if (query.levels && !query.levels.includes(log.level)) {
        return false;
      }

      // Filter by categories
      if (query.categories && !query.categories.includes(log.category)) {
        return false;
      }

      // Filter by sources
      if (query.sources && !query.sources.includes(log.source)) {
        return false;
      }

      // Filter by project ID
      if (query.projectId && log.projectId !== query.projectId) {
        return false;
      }

      // Filter by session ID
      if (query.sessionId && log.sessionId !== query.sessionId) {
        return false;
      }

      // Filter by correlation ID
      if (query.correlationId && log.correlationId !== query.correlationId) {
        return false;
      }

      // Filter by time range
      if (query.startTime) {
        const logTime = new Date(log.timestamp);
        const startTime = new Date(query.startTime);
        if (logTime < startTime) return false;
      }

      if (query.endTime) {
        const logTime = new Date(log.timestamp);
        const endTime = new Date(query.endTime);
        if (logTime > endTime) return false;
      }

      // Filter by search text
      if (query.searchText) {
        const searchLower = query.searchText.toLowerCase();
        const messageMatch = log.message.toLowerCase().includes(searchLower);
        const sourceMatch = log.source.toLowerCase().includes(searchLower);
        if (!messageMatch && !sourceMatch) return false;
      }

      return true;
    })
    .slice(query.offset || 0, (query.offset || 0) + (query.limit || logs.length));
  }

  /**
   * Get performance metrics
   */
  public getMetrics(name?: string): PerformanceMetric[] {
    return this.metricsCollector.getMetrics(name);
  }

  /**
   * Get error entries
   */
  public getErrors(): ErrorEntry[] {
    return this.errorBuffer.toArray();
  }

  /**
   * Clear memory buffers
   */
  public clearLogs(): void {
    this.memoryBuffer.clear();
  }

  public clearErrors(): void {
    this.errorBuffer.clear();
  }

  public clearMetrics(name?: string): void {
    this.metricsCollector.clearMetrics(name);
  }

  /**
   * Flush pending writes to disk
   */
  public async flush(): Promise<void> {
    if (!this.config.enableFile || this.pendingWrites.length === 0) {
      return;
    }

    const writes = [...this.pendingWrites];
    this.pendingWrites = [];

    if (!this.config.logFilePath) return;

    try {
      const logLines = writes.map(entry => JSON.stringify(entry)).join('\n') + '\n';
      await appendFile(this.config.logFilePath, logLines, 'utf8');
    } catch (error) {
      // Avoid infinite recursion by not using this.error()
      console.error('[Logger] Failed to write to log file:', error);
      // Re-queue the writes for retry
      this.pendingWrites.unshift(...writes);
    }
  }

  /**
   * Graceful shutdown - flush all pending writes
   */
  public async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }

    await this.flush();
    this.info('Logger shutdown completed', 'system');
  }

  /**
   * Update logger configuration
   */
  public updateConfig(newConfig: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Restart auto-flush with new interval
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    if (this.config.flushInterval > 0) {
      this.startAutoFlush();
    }

    // Ensure log directory exists if file logging enabled
    if (this.config.enableFile && this.config.logFilePath) {
      this.ensureLogDirectory();
    }
  }

  /**
   * Get current configuration
   */
  public getConfig(): Readonly<LoggerConfig> {
    return { ...this.config };
  }

  // Private methods

  private writeToConsole(entry: LogEntry): void {
    const style = CONSOLE_STYLES[entry.level] || '';
    const reset = CONSOLE_STYLES.reset;
    const timestamp = new Date(entry.timestamp).toLocaleTimeString();
    const correlation = entry.correlationId ? ` [${entry.correlationId.slice(0, 8)}]` : '';
    const project = entry.projectId ? ` {${entry.projectId.slice(0, 8)}}` : '';
    
    const prefix = `${style}[${timestamp}] ${entry.level.toUpperCase()} [${entry.category}]${correlation}${project} (${entry.source})${reset}`;
    const message = `${prefix} ${entry.message}`;
    
    // Use appropriate console method
    switch (entry.level) {
      case 'debug':
        console.debug(message, entry.metadata);
        break;
      case 'info':
        console.info(message, entry.metadata);
        break;
      case 'warn':
        console.warn(message, entry.metadata);
        break;
      case 'error':
      case 'fatal':
        console.error(message, entry.metadata);
        break;
      default:
        console.log(message, entry.metadata);
    }
  }

  private queueForFileWrite(entry: LogEntry): void {
    if (this.isShuttingDown) return;

    this.pendingWrites.push(entry);

    // Auto-flush when batch size reached
    if (this.pendingWrites.length >= this.config.batchSize) {
      // Don't await to avoid blocking
      this.flush().catch(error => {
        console.error('[Logger] Auto-flush failed:', error);
      });
    }
  }

  private handleError(logEntry: LogEntry): void {
    // Create error entry if not already created via logError()
    const context = this.correlationContext.getContext();
    
    // Check if error already exists in buffer to avoid duplicates
    const existingErrors = this.errorBuffer.toArray();
    const duplicate = existingErrors.find(err => 
      err.message === logEntry.message && 
      err.correlationId === context.correlationId
    );

    if (!duplicate) {
      const errorEntry: ErrorEntry = {
        id: randomUUID() as UUID,
        message: logEntry.message,
        errorType: 'LoggedError',
        severity: logEntry.level === 'fatal' ? 'critical' : 'high',
        source: logEntry.source,
        timestamp: logEntry.timestamp,
        projectId: context.projectId,
        sessionId: context.sessionId,
        correlationId: context.correlationId || '',
        context: logEntry.metadata,
        handled: true,
        resolved: false,
        occurrenceCount: 1,
        firstOccurrence: logEntry.timestamp,
        lastOccurrence: logEntry.timestamp
      };

      this.errorBuffer.push(errorEntry);
    }
  }

  private ensureLogDirectory(): void {
    if (!this.config.logFilePath) return;

    const logDir = dirname(this.config.logFilePath);
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
  }

  private startAutoFlush(): void {
    this.flushTimer = setInterval(() => {
      if (!this.isShuttingDown) {
        this.flush().catch(error => {
          console.error('[Logger] Auto-flush failed:', error);
        });
      }
    }, this.config.flushInterval);
  }

  private setupShutdownHandlers(): void {
    // Handle process shutdown gracefully
    const shutdownHandler = () => {
      this.shutdown().catch(error => {
        console.error('[Logger] Shutdown failed:', error);
      });
    };

    process.on('SIGTERM', shutdownHandler);
    process.on('SIGINT', shutdownHandler);
    process.on('exit', shutdownHandler);
  }
}

/**
 * Default logger instance for convenience
 */
export const logger = Logger.getInstance();

/**
 * Convenience functions for common logging patterns
 */
export const createLogger = (config?: Partial<LoggerConfig>) => Logger.getInstance(config);

/**
 * Phase-aware logging helper for ReadyAI development workflow
 */
export const logPhaseOperation = (
  phase: string,
  operation: string,
  result: 'success' | 'error' | 'warning',
  details?: Record<string, any>
) => {
  const level: LogLevel = result === 'error' ? 'error' : result === 'warning' ? 'warn' : 'info';
  const message = `${phase}: ${operation}`;
  
  logger.log(level, message, 'phaseprogression', {
    phase,
    operation,
    result,
    ...details
  }, 'phase-tracker');
};

/**
 * Context retrieval performance logger for ReadyAI KPI tracking
 */
export const logContextPerformance = (
  operation: string,
  duration: number,
  itemCount?: number,
  metadata?: Record<string, any>
) => {
  const level: LogLevel = duration > 3000 ? 'warn' : 'info';
  const message = `Context retrieval: ${operation} completed in ${duration}ms`;
  
  logger.recordMetric(
    'context_retrieval_time',
    'contextretrievaltime',
    duration,
    'ms',
    'context-engine',
    { operation, itemCount: itemCount?.toString() }
  );
  
  logger.log(level, message, 'contextmanagement', {
    operation,
    duration,
    itemCount,
    kpiThreshold: 3000,
    exceedsThreshold: duration > 3000,
    ...metadata
  }, 'context-engine');
};

/**
 * AI generation performance logger for ReadyAI metrics
 */
export const logAiGenerationPerformance = (
  provider: string,
  model: string,
  duration: number,
  tokenUsage?: { input: number; output: number; total: number },
  metadata?: Record<string, any>
) => {
  const message = `AI generation: ${provider}/${model} completed in ${duration}ms`;
  
  logger.recordMetric(
    'ai_generation_time',
    'aigenerationtime',
    duration,
    'ms',
    'ai-engine',
    { provider, model }
  );
  
  if (tokenUsage) {
    logger.recordMetric(
      'token_usage_total',
      'counter',
      tokenUsage.total,
      'tokens',
      'ai-engine',
      { provider, model, type: 'total' }
    );
  }
  
  logger.info(message, 'aigeneration', {
    provider,
    model,
    duration,
    tokenUsage,
    ...metadata
  }, 'ai-engine');
};

// Export types for external consumption
export type { LoggerConfig, LogEntry, PerformanceMetric, ErrorEntry, LogLevel, LogCategory, MetricType, ErrorSeverity };
