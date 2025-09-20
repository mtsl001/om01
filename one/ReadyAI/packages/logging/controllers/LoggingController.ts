// packages\logging\controllers\LoggingController.ts

/**
 * LoggingController - ReadyAI Logging and Monitoring Management Controller
 * 
 * Leverages Cline's proven handler patterns for robust logging management,
 * providing comprehensive monitoring endpoints for ReadyAI's AI development
 * orchestration system with enterprise-grade error handling and telemetry.
 * 
 * Pattern-Replicated from Cline's handler architecture with ReadyAI-specific
 * monitoring capabilities and telemetry integration.
 */

import { 
  UUID,
  ApiResponse, 
  ApiErrorResponse,
  createApiResponse,
  createApiError,
  ReadyAIError,
  wrapAsync,
  PaginatedResponse
} from '../../foundation/types/core.js';

import {
  LogLevel,
  LogEntry,
  LogQuery,
  LogMetrics,
  LogAnalytics,
  LoggingConfig,
  LoggingStatus,
  TelemetryEvent,
  PerformanceMetric,
  SystemHealth,
  MonitoringAlert,
  LogRetentionPolicy,
  LogExportRequest,
  LogExportResult
} from '../types/logging.js';

import { Logger } from '../services/Logger.js';
import { ErrorService } from '../services/ErrorService.js';
import { TelemetryService } from '../services/TelemetryService.js';

/**
 * LoggingController handles all logging and monitoring operations for ReadyAI
 * 
 * Implements Cline's proven controller patterns with:
 * - Comprehensive error handling and validation
 * - Real-time monitoring and alerting capabilities  
 * - Performance metrics collection and analysis
 * - Log management with retention policies
 * - Telemetry integration for system insights
 */
export class LoggingController {
  private readonly logger: Logger;
  private readonly errorService: ErrorService;
  private readonly telemetryService: TelemetryService;
  private readonly requestCorrelationMap = new Map<string, string>();

  constructor(
    logger: Logger,
    errorService: ErrorService,
    telemetryService: TelemetryService
  ) {
    this.logger = logger;
    this.errorService = errorService;
    this.telemetryService = telemetryService;

    // Initialize controller with telemetry tracking
    this.telemetryService.trackEvent({
      eventType: 'controller_initialized',
      component: 'LoggingController',
      timestamp: new Date().toISOString(),
      metadata: {
        version: '1.0.0',
        capabilities: ['logging', 'monitoring', 'analytics', 'alerts']
      }
    });
  }

  /**
   * Create a new log entry with comprehensive validation and correlation
   * Implements Cline's robust validation patterns with ReadyAI extensions
   */
  async createLogEntry(
    logEntry: Omit<LogEntry, 'id' | 'timestamp'>,
    correlationId?: string
  ): Promise<ApiResponse<LogEntry> | ApiErrorResponse> {
    const requestId = crypto.randomUUID();
    
    try {
      // Validate log entry structure
      if (!logEntry.level || !logEntry.message || !logEntry.component) {
        return createApiError(
          'Invalid log entry: level, message, and component are required',
          'INVALID_LOG_ENTRY',
          400,
          { provided: logEntry, required: ['level', 'message', 'component'] }
        );
      }

      // Validate log level
      const validLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
      if (!validLevels.includes(logEntry.level)) {
        return createApiError(
          `Invalid log level: ${logEntry.level}`,
          'INVALID_LOG_LEVEL',
          400,
          { provided: logEntry.level, valid: validLevels }
        );
      }

      // Create enhanced log entry with correlation
      const enhancedLogEntry: LogEntry = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        correlationId: correlationId || requestId,
        ...logEntry,
        metadata: {
          requestId,
          sessionId: this.extractSessionId(logEntry),
          ...logEntry.metadata
        }
      };

      // Store correlation mapping for request tracking
      if (correlationId) {
        this.requestCorrelationMap.set(requestId, correlationId);
      }

      // Log the entry using the Logger service
      await this.logger.log(enhancedLogEntry);

      // Track telemetry for log creation
      await this.telemetryService.trackEvent({
        eventType: 'log_entry_created',
        component: 'LoggingController',
        timestamp: enhancedLogEntry.timestamp,
        metadata: {
          logLevel: enhancedLogEntry.level,
          component: enhancedLogEntry.component,
          correlationId: enhancedLogEntry.correlationId,
          hasContext: !!enhancedLogEntry.context
        }
      });

      // Check for error-level logs and trigger alerts
      if (enhancedLogEntry.level === 'error' || enhancedLogEntry.level === 'fatal') {
        await this.handleErrorLogAlert(enhancedLogEntry);
      }

      return createApiResponse(enhancedLogEntry, {
        timestamp: new Date().toISOString(),
        requestId,
        metrics: {
          processingTime: Date.now() - new Date(enhancedLogEntry.timestamp).getTime()
        }
      });

    } catch (error) {
      // Use ErrorService for comprehensive error handling
      const handledError = await this.errorService.handleError(error, {
        operation: 'createLogEntry',
        context: { logEntry, correlationId, requestId }
      });

      return handledError.toApiErrorResponse();
    }
  }

  /**
   * Query logs with advanced filtering and pagination
   * Adapts Cline's query patterns for ReadyAI log management
   */
  async queryLogs(
    query: LogQuery,
    correlationId?: string
  ): Promise<ApiResponse<PaginatedResponse<LogEntry>> | ApiErrorResponse> {
    const requestId = crypto.randomUUID();

    try {
      // Validate query parameters
      const validationResult = this.validateLogQuery(query);
      if (!validationResult.valid) {
        return createApiError(
          'Invalid log query parameters',
          'INVALID_QUERY',
          400,
          { errors: validationResult.errors, query }
        );
      }

      // Apply default pagination if not specified
      const normalizedQuery: LogQuery = {
        page: 1,
        pageSize: 50,
        ...query,
        pageSize: Math.min(query.pageSize || 50, 1000) // Cap at 1000
      };

      // Execute query with Logger service
      const queryResult = await this.logger.query(normalizedQuery);

      // Track query telemetry
      await this.telemetryService.trackEvent({
        eventType: 'log_query_executed',
        component: 'LoggingController',
        timestamp: new Date().toISOString(),
        metadata: {
          queryFilters: Object.keys(normalizedQuery).filter(k => 
            normalizedQuery[k as keyof LogQuery] !== undefined
          ),
          resultCount: queryResult.items.length,
          totalResults: queryResult.total,
          correlationId
        }
      });

      return createApiResponse(queryResult, {
        timestamp: new Date().toISOString(),
        requestId,
        metrics: {
          processingTime: queryResult.metadata?.queryTime || 0
        }
      });

    } catch (error) {
      const handledError = await this.errorService.handleError(error, {
        operation: 'queryLogs',
        context: { query, correlationId, requestId }
      });

      return handledError.toApiErrorResponse();
    }
  }

  /**
   * Get comprehensive logging metrics and analytics
   * Implements Cline's metrics collection patterns
   */
  async getLoggingMetrics(
    timeRange?: { start: string; end: string },
    correlationId?: string
  ): Promise<ApiResponse<LogMetrics> | ApiErrorResponse> {
    const requestId = crypto.randomUUID();

    try {
      // Default to last 24 hours if no range specified
      const defaultEnd = new Date();
      const defaultStart = new Date(defaultEnd.getTime() - (24 * 60 * 60 * 1000));

      const range = {
        start: timeRange?.start || defaultStart.toISOString(),
        end: timeRange?.end || defaultEnd.toISOString()
      };

      // Validate time range
      const startDate = new Date(range.start);
      const endDate = new Date(range.end);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return createApiError(
          'Invalid time range format',
          'INVALID_TIME_RANGE',
          400,
          { provided: range, expected: 'ISO 8601 format' }
        );
      }

      if (startDate >= endDate) {
        return createApiError(
          'Start time must be before end time',
          'INVALID_TIME_ORDER',
          400,
          { start: range.start, end: range.end }
        );
      }

      // Collect metrics from Logger service
      const metrics = await this.logger.getMetrics(range);

      // Enhance with system health data
      const systemHealth = await this.getSystemHealthMetrics();

      const enhancedMetrics: LogMetrics = {
        ...metrics,
        systemHealth,
        collectionTimestamp: new Date().toISOString(),
        timeRange: range
      };

      // Track metrics collection
      await this.telemetryService.trackEvent({
        eventType: 'metrics_collected',
        component: 'LoggingController',
        timestamp: new Date().toISOString(),
        metadata: {
          timeRange: range,
          totalLogs: metrics.totalLogs,
          errorRate: metrics.errorRate,
          correlationId
        }
      });

      return createApiResponse(enhancedMetrics, {
        timestamp: new Date().toISOString(),
        requestId
      });

    } catch (error) {
      const handledError = await this.errorService.handleError(error, {
        operation: 'getLoggingMetrics',
        context: { timeRange, correlationId, requestId }
      });

      return handledError.toApiErrorResponse();
    }
  }

  /**
   * Get real-time system health status
   * Leverages TelemetryService for comprehensive monitoring
   */
  async getSystemHealth(
    correlationId?: string
  ): Promise<ApiResponse<SystemHealth> | ApiErrorResponse> {
    const requestId = crypto.randomUUID();

    try {
      const healthMetrics = await this.getSystemHealthMetrics();

      // Get recent alerts
      const recentAlerts = await this.getRecentAlerts(5);

      // Collect performance metrics
      const performanceMetrics = await this.telemetryService.getPerformanceMetrics();

      const systemHealth: SystemHealth = {
        ...healthMetrics,
        recentAlerts,
        performanceMetrics,
        lastChecked: new Date().toISOString()
      };

      // Track health check
      await this.telemetryService.trackEvent({
        eventType: 'health_check_performed',
        component: 'LoggingController',
        timestamp: new Date().toISOString(),
        metadata: {
          status: healthMetrics.status,
          alertCount: recentAlerts.length,
          correlationId
        }
      });

      return createApiResponse(systemHealth, {
        timestamp: new Date().toISOString(),
        requestId
      });

    } catch (error) {
      const handledError = await this.errorService.handleError(error, {
        operation: 'getSystemHealth',
        context: { correlationId, requestId }
      });

      return handledError.toApiErrorResponse();
    }
  }

  /**
   * Configure logging settings with validation
   * Implements Cline's configuration patterns
   */
  async updateLoggingConfig(
    config: Partial<LoggingConfig>,
    correlationId?: string
  ): Promise<ApiResponse<LoggingConfig> | ApiErrorResponse> {
    const requestId = crypto.randomUUID();

    try {
      // Validate configuration
      const validationResult = this.validateLoggingConfig(config);
      if (!validationResult.valid) {
        return createApiError(
          'Invalid logging configuration',
          'INVALID_CONFIG',
          400,
          { errors: validationResult.errors, config }
        );
      }

      // Update configuration with Logger service
      const updatedConfig = await this.logger.updateConfig(config);

      // Track configuration change
      await this.telemetryService.trackEvent({
        eventType: 'logging_config_updated',
        component: 'LoggingController',
        timestamp: new Date().toISOString(),
        metadata: {
          changedFields: Object.keys(config),
          correlationId
        }
      });

      return createApiResponse(updatedConfig, {
        timestamp: new Date().toISOString(),
        requestId
      });

    } catch (error) {
      const handledError = await this.errorService.handleError(error, {
        operation: 'updateLoggingConfig',
        context: { config, correlationId, requestId }
      });

      return handledError.toApiErrorResponse();
    }
  }

  /**
   * Export logs with compression and filtering
   * Follows Cline's export patterns with ReadyAI enhancements
   */
  async exportLogs(
    exportRequest: LogExportRequest,
    correlationId?: string
  ): Promise<ApiResponse<LogExportResult> | ApiErrorResponse> {
    const requestId = crypto.randomUUID();

    try {
      // Validate export request
      if (!exportRequest.timeRange || !exportRequest.format) {
        return createApiError(
          'Export request must include timeRange and format',
          'INVALID_EXPORT_REQUEST',
          400,
          { provided: exportRequest, required: ['timeRange', 'format'] }
        );
      }

      // Execute export with Logger service
      const exportResult = await this.logger.exportLogs(exportRequest);

      // Track export operation
      await this.telemetryService.trackEvent({
        eventType: 'logs_exported',
        component: 'LoggingController',
        timestamp: new Date().toISOString(),
        metadata: {
          format: exportRequest.format,
          timeRange: exportRequest.timeRange,
          logCount: exportResult.logCount,
          fileSize: exportResult.fileSize,
          correlationId
        }
      });

      return createApiResponse(exportResult, {
        timestamp: new Date().toISOString(),
        requestId
      });

    } catch (error) {
      const handledError = await this.errorService.handleError(error, {
        operation: 'exportLogs',
        context: { exportRequest, correlationId, requestId }
      });

      return handledError.toApiErrorResponse();
    }
  }

  /**
   * Get logging analytics with trend analysis
   * Leverages TelemetryService for advanced analytics
   */
  async getLoggingAnalytics(
    timeRange: { start: string; end: string },
    correlationId?: string
  ): Promise<ApiResponse<LogAnalytics> | ApiErrorResponse> {
    const requestId = crypto.randomUUID();

    try {
      // Generate analytics from Logger service
      const analytics = await this.logger.getAnalytics(timeRange);

      // Enhance with telemetry insights
      const telemetryAnalytics = await this.telemetryService.getAnalytics(timeRange);

      const enhancedAnalytics: LogAnalytics = {
        ...analytics,
        telemetryInsights: telemetryAnalytics,
        generatedAt: new Date().toISOString()
      };

      // Track analytics generation
      await this.telemetryService.trackEvent({
        eventType: 'analytics_generated',
        component: 'LoggingController',
        timestamp: new Date().toISOString(),
        metadata: {
          timeRange,
          trendPoints: analytics.trends?.length || 0,
          correlationId
        }
      });

      return createApiResponse(enhancedAnalytics, {
        timestamp: new Date().toISOString(),
        requestId
      });

    } catch (error) {
      const handledError = await this.errorService.handleError(error, {
        operation: 'getLoggingAnalytics',
        context: { timeRange, correlationId, requestId }
      });

      return handledError.toApiErrorResponse();
    }
  }

  // Private helper methods implementing Cline's utility patterns

  private extractSessionId(logEntry: Partial<LogEntry>): string {
    return logEntry.metadata?.sessionId || 
           logEntry.context?.sessionId || 
           'anonymous';
  }

  private validateLogQuery(query: LogQuery): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (query.page !== undefined && (query.page < 1 || !Number.isInteger(query.page))) {
      errors.push('page must be a positive integer');
    }

    if (query.pageSize !== undefined && (query.pageSize < 1 || query.pageSize > 1000)) {
      errors.push('pageSize must be between 1 and 1000');
    }

    if (query.startTime && isNaN(new Date(query.startTime).getTime())) {
      errors.push('startTime must be a valid ISO 8601 date');
    }

    if (query.endTime && isNaN(new Date(query.endTime).getTime())) {
      errors.push('endTime must be a valid ISO 8601 date');
    }

    if (query.level && !['trace', 'debug', 'info', 'warn', 'error', 'fatal'].includes(query.level)) {
      errors.push('level must be one of: trace, debug, info, warn, error, fatal');
    }

    return { valid: errors.length === 0, errors };
  }

  private validateLoggingConfig(config: Partial<LoggingConfig>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (config.level && !['trace', 'debug', 'info', 'warn', 'error', 'fatal'].includes(config.level)) {
      errors.push('level must be one of: trace, debug, info, warn, error, fatal');
    }

    if (config.maxFileSize !== undefined && config.maxFileSize < 1024) {
      errors.push('maxFileSize must be at least 1024 bytes');
    }

    if (config.maxFiles !== undefined && (config.maxFiles < 1 || config.maxFiles > 100)) {
      errors.push('maxFiles must be between 1 and 100');
    }

    if (config.retentionDays !== undefined && (config.retentionDays < 1 || config.retentionDays > 365)) {
      errors.push('retentionDays must be between 1 and 365');
    }

    return { valid: errors.length === 0, errors };
  }

  private async getSystemHealthMetrics(): Promise<Omit<SystemHealth, 'recentAlerts' | 'performanceMetrics' | 'lastChecked'>> {
    // Collect system health metrics
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    return {
      status: 'healthy', // This would be determined by actual health checks
      uptime: uptime,
      memory: {
        used: memoryUsage.heapUsed,
        total: memoryUsage.heapTotal,
        external: memoryUsage.external
      },
      disk: {
        used: 0, // Would be populated by actual disk usage check
        total: 0,
        available: 0
      },
      services: {
        logger: await this.logger.getHealthStatus(),
        telemetry: await this.telemetryService.getHealthStatus(),
        errors: await this.errorService.getHealthStatus()
      }
    };
  }

  private async getRecentAlerts(limit: number): Promise<MonitoringAlert[]> {
    // This would integrate with an alerting system
    return [];
  }

  private async handleErrorLogAlert(logEntry: LogEntry): Promise<void> {
    try {
      // Create monitoring alert for error-level logs
      const alert: MonitoringAlert = {
        id: crypto.randomUUID(),
        type: 'error_log',
        severity: logEntry.level === 'fatal' ? 'critical' : 'high',
        message: `${logEntry.level.toUpperCase()} log detected: ${logEntry.message}`,
        timestamp: new Date().toISOString(),
        component: logEntry.component,
        metadata: {
          logId: logEntry.id,
          correlationId: logEntry.correlationId,
          context: logEntry.context
        }
      };

      // Track alert via telemetry
      await this.telemetryService.trackEvent({
        eventType: 'monitoring_alert_created',
        component: 'LoggingController',
        timestamp: alert.timestamp,
        metadata: {
          alertType: alert.type,
          severity: alert.severity,
          logLevel: logEntry.level
        }
      });
    } catch (error) {
      // Silently handle alert creation failures to prevent cascading errors
      await this.errorService.handleError(error, {
        operation: 'handleErrorLogAlert',
        context: { logEntry },
        silent: true
      });
    }
  }

  /**
   * Cleanup resources and correlations
   * Implements Cline's resource management patterns
   */
  async cleanup(): Promise<void> {
    try {
      // Clear correlation mappings
      this.requestCorrelationMap.clear();

      // Track cleanup event
      await this.telemetryService.trackEvent({
        eventType: 'controller_cleanup',
        component: 'LoggingController',
        timestamp: new Date().toISOString(),
        metadata: {
          action: 'resources_cleaned'
        }
      });
    } catch (error) {
      // Handle cleanup errors silently
      await this.errorService.handleError(error, {
        operation: 'cleanup',
        context: {},
        silent: true
      });
    }
  }
}

/**
 * Factory function for creating LoggingController instances
 * Follows Cline's dependency injection patterns
 */
export function createLoggingController(
  logger: Logger,
  errorService: ErrorService,
  telemetryService: TelemetryService
): LoggingController {
  return new LoggingController(logger, errorService, telemetryService);
}

/**
 * Default export for convenience
 */
export default LoggingController;
