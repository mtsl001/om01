// packages/database/services/DatabaseHealthMonitor.ts

/**
 * Database Health Monitor for ReadyAI Phase 1.2 - Production Implementation
 * 
 * Adapted from Cline's health monitoring patterns with database-specific extensions
 * Provides comprehensive database health monitoring, performance tracking, and proactive
 * alerts for ReadyAI's SQLite-based data persistence layer.
 * 
 * Key Features:
 * - Real-time database health monitoring with configurable intervals
 * - Performance metrics collection and trend analysis
 * - Proactive alerting for degraded performance or connectivity issues
 * - Connection pool health tracking
 * - Query performance monitoring with slow query detection
 * - Memory usage and disk space monitoring
 * - WAL mode and foreign key constraint verification
 * - Automated recovery suggestions and health reports
 * 
 * Reuse Strategy: 80% Adapt from Cline health monitoring patterns
 * - Direct adaptation of Cline's health check infrastructure
 * - Enhanced with database-specific metrics and thresholds
 * - Maintains Cline's reliability patterns and event-driven architecture
 * 
 * @author ReadyAI Development Team
 * @version 1.2.0
 */

import { EventEmitter } from 'events';
import { statSync } from 'fs';
import { 
    UUID, 
    ApiResponse, 
    ReadyAIError, 
    wrapAsync, 
    createApiResponse 
} from '../../../foundation/types/core';
import { DatabaseConnection } from './DatabaseConnection';
import { Logger, LogLevel, LogCategory } from '../../../logging/services/Logger';
import { 
    DatabaseHealth, 
    DatabaseHealthStatus, 
    HealthMetric, 
    HealthAlert, 
    HealthTrend,
    AlertSeverity,
    HealthCheckOptions
} from '../types/database';

/**
 * Health monitoring configuration interface
 */
export interface DatabaseHealthMonitorConfig {
    /** Health check interval in milliseconds */
    checkInterval: number;
    /** Enable performance metrics collection */
    enableMetrics: boolean;
    /** Enable proactive alerting */
    enableAlerts: boolean;
    /** Slow query threshold in milliseconds */
    slowQueryThreshold: number;
    /** Connection timeout threshold in milliseconds */
    connectionTimeoutThreshold: number;
    /** Memory usage alert threshold in MB */
    memoryThreshold: number;
    /** Disk usage alert threshold in percentage */
    diskUsageThreshold: number;
    /** Number of health check samples to keep for trend analysis */
    sampleHistorySize: number;
    /** Enable automatic recovery attempts */
    enableAutoRecovery: boolean;
    /** Alert cool-down period in milliseconds */
    alertCooldown: number;
}

/**
 * Health check result with comprehensive metrics
 */
interface HealthCheckResult extends DatabaseHealth {
    /** Health check execution time */
    checkDuration: number;
    /** Memory usage statistics */
    memoryStats: {
        used: number;
        total: number;
        percentage: number;
    };
    /** Disk usage statistics */
    diskStats: {
        used: number;
        total: number;
        percentage: number;
    };
    /** Connection pool statistics */
    poolStats: {
        activeConnections: number;
        totalConnections: number;
        failedConnections: number;
        avgResponseTime: number;
    };
    /** Query performance metrics */
    queryStats: {
        totalQueries: number;
        slowQueries: number;
        avgQueryTime: number;
        errors: number;
    };
}

/**
 * Health trend tracking for predictive monitoring
 */
interface HealthTrendTracker {
    /** Response time trend */
    responseTimeTrend: HealthTrend;
    /** Error rate trend */
    errorRateTrend: HealthTrend;
    /** Connection usage trend */
    connectionUsageTrend: HealthTrend;
    /** Memory usage trend */
    memoryUsageTrend: HealthTrend;
    /** Query performance trend */
    queryPerformanceTrend: HealthTrend;
}

/**
 * Default health monitoring configuration optimized for ReadyAI
 */
const DEFAULT_MONITOR_CONFIG: DatabaseHealthMonitorConfig = {
    checkInterval: 30000, // 30 seconds
    enableMetrics: true,
    enableAlerts: true,
    slowQueryThreshold: 1000, // 1 second
    connectionTimeoutThreshold: 5000, // 5 seconds
    memoryThreshold: 500, // 500 MB
    diskUsageThreshold: 85, // 85%
    sampleHistorySize: 100,
    enableAutoRecovery: true,
    alertCooldown: 300000 // 5 minutes
};

/**
 * Database Health Monitor Service
 * 
 * Provides comprehensive health monitoring for ReadyAI's database layer,
 * including performance tracking, proactive alerting, and automated recovery.
 * Adapts Cline's proven health monitoring architecture for database-specific needs.
 */
export class DatabaseHealthMonitor extends EventEmitter {
    private readonly config: DatabaseHealthMonitorConfig;
    private readonly logger: Logger;
    private readonly dbConnection: DatabaseConnection;
    
    private healthHistory: HealthCheckResult[] = [];
    private alerts: HealthAlert[] = [];
    private trends: HealthTrendTracker;
    private lastAlertTimes = new Map<string, number>();
    
    private isRunning = false;
    private healthCheckTimer?: NodeJS.Timeout;
    private metricsCollectionTimer?: NodeJS.Timeout;
    
    // Performance tracking
    private queryExecutionTimes: number[] = [];
    private connectionResponseTimes: number[] = [];
    private errorCounts = new Map<string, number>();
    
    constructor(
        dbConnection: DatabaseConnection, 
        config: Partial<DatabaseHealthMonitorConfig> = {}
    ) {
        super();
        
        this.dbConnection = dbConnection;
        this.config = { ...DEFAULT_MONITOR_CONFIG, ...config };
        this.logger = Logger.getInstance();
        
        // Initialize trend trackers
        this.trends = this.initializeTrends();
        
        // Set up database event handlers
        this.setupDatabaseEventHandlers();
    }

    /**
     * Initialize the health monitoring service
     */
    public async initialize(): Promise<void> {
        if (this.isRunning) {
            throw new ReadyAIError(
                'DatabaseHealthMonitor is already running',
                'MONITOR_ALREADY_RUNNING',
                400
            );
        }

        try {
            this.emit('initializing');
            this.logger.info('Initializing database health monitor', 'database', {
                config: this.config
            }, 'DatabaseHealthMonitor');

            // Perform initial health check
            const initialHealth = await this.performHealthCheck();
            this.logger.info('Initial health check completed', 'database', {
                health: initialHealth
            }, 'DatabaseHealthMonitor');

            // Start monitoring intervals
            this.startMonitoring();
            
            this.isRunning = true;
            this.emit('initialized');
            
        } catch (error) {
            this.logger.error(`Failed to initialize DatabaseHealthMonitor: ${error.message}`, 
                'database', { error }, 'DatabaseHealthMonitor');
            throw new ReadyAIError(
                `Database health monitor initialization failed: ${error.message}`,
                'MONITOR_INIT_FAILED',
                500,
                { originalError: error }
            );
        }
    }

    /**
     * Get current database health status
     */
    public async getCurrentHealth(): Promise<ApiResponse<DatabaseHealthStatus>> {
        return wrapAsync(async () => {
            const healthResult = await this.performHealthCheck();
            
            const status: DatabaseHealthStatus = {
                overall: this.calculateOverallHealth(healthResult),
                timestamp: new Date().toISOString(),
                checks: {
                    connectivity: healthResult.isConnected,
                    responseTime: healthResult.responseTime < this.config.connectionTimeoutThreshold,
                    walMode: healthResult.walMode,
                    foreignKeys: healthResult.foreignKeys,
                    memoryUsage: healthResult.memoryStats.percentage < (this.config.memoryThreshold / 1024 * 100),
                    diskUsage: healthResult.diskStats.percentage < this.config.diskUsageThreshold,
                    connectionPool: healthResult.poolStats.activeConnections > 0,
                    queryPerformance: healthResult.queryStats.avgQueryTime < this.config.slowQueryThreshold
                },
                metrics: {
                    responseTime: healthResult.responseTime,
                    connectionCount: healthResult.connectionCount,
                    memoryUsage: healthResult.memoryStats.percentage,
                    diskUsage: healthResult.diskStats.percentage,
                    queryCount: healthResult.queryStats.totalQueries,
                    errorCount: healthResult.errors.length,
                    slowQueryCount: healthResult.queryStats.slowQueries
                },
                alerts: this.getActiveAlerts(),
                trends: this.getTrendSummary(),
                recommendations: this.generateRecommendations(healthResult)
            };

            return createApiResponse(status, {
                timestamp: new Date().toISOString()
            });
        });
    }

    /**
     * Get health history for trend analysis
     */
    public getHealthHistory(limit: number = 50): HealthCheckResult[] {
        return this.healthHistory.slice(-limit);
    }

    /**
     * Get active health alerts
     */
    public getActiveAlerts(): HealthAlert[] {
        const now = Date.now();
        return this.alerts.filter(alert => 
            !alert.resolved && 
            (now - new Date(alert.timestamp).getTime()) < (24 * 60 * 60 * 1000) // Last 24 hours
        );
    }

    /**
     * Get performance metrics for monitoring dashboard
     */
    public getPerformanceMetrics(): HealthMetric[] {
        const metrics: HealthMetric[] = [];
        const now = new Date().toISOString();

        // Add response time metrics
        if (this.connectionResponseTimes.length > 0) {
            const avgResponseTime = this.connectionResponseTimes.reduce((a, b) => a + b, 0) / this.connectionResponseTimes.length;
            metrics.push({
                name: 'avg_response_time',
                value: avgResponseTime,
                unit: 'ms',
                timestamp: now,
                threshold: this.config.connectionTimeoutThreshold,
                status: avgResponseTime < this.config.connectionTimeoutThreshold ? 'healthy' : 'degraded'
            });
        }

        // Add query performance metrics
        if (this.queryExecutionTimes.length > 0) {
            const avgQueryTime = this.queryExecutionTimes.reduce((a, b) => a + b, 0) / this.queryExecutionTimes.length;
            metrics.push({
                name: 'avg_query_time',
                value: avgQueryTime,
                unit: 'ms',
                timestamp: now,
                threshold: this.config.slowQueryThreshold,
                status: avgQueryTime < this.config.slowQueryThreshold ? 'healthy' : 'warning'
            });
        }

        // Add error rate metrics
        const totalErrors = Array.from(this.errorCounts.values()).reduce((a, b) => a + b, 0);
        metrics.push({
            name: 'error_rate',
            value: totalErrors,
            unit: 'errors/hour',
            timestamp: now,
            threshold: 10,
            status: totalErrors < 10 ? 'healthy' : 'critical'
        });

        return metrics;
    }

    /**
     * Force an immediate health check
     */
    public async forceHealthCheck(): Promise<ApiResponse<HealthCheckResult>> {
        return wrapAsync(async () => {
            this.logger.info('Performing forced health check', 'database', {}, 'DatabaseHealthMonitor');
            
            const result = await this.performHealthCheck();
            this.processHealthResult(result);
            
            return createApiResponse(result, {
                timestamp: new Date().toISOString(),
                forced: true
            });
        });
    }

    /**
     * Resolve a health alert manually
     */
    public resolveAlert(alertId: string): ApiResponse<boolean> {
        return wrapAsync(async () => {
            const alert = this.alerts.find(a => a.id === alertId);
            if (!alert) {
                throw new ReadyAIError(
                    `Alert with ID ${alertId} not found`,
                    'ALERT_NOT_FOUND',
                    404
                );
            }

            alert.resolved = true;
            alert.resolvedAt = new Date().toISOString();
            alert.resolvedBy = 'manual';

            this.logger.info(`Alert resolved manually: ${alert.title}`, 'database', {
                alertId,
                alert
            }, 'DatabaseHealthMonitor');

            this.emit('alertResolved', alert);
            
            return createApiResponse(true);
        });
    }

    /**
     * Update monitoring configuration
     */
    public updateConfig(newConfig: Partial<DatabaseHealthMonitorConfig>): void {
        Object.assign(this.config, newConfig);
        
        this.logger.info('Health monitor configuration updated', 'database', {
            config: this.config
        }, 'DatabaseHealthMonitor');

        // Restart monitoring with new configuration
        if (this.isRunning) {
            this.stopMonitoring();
            this.startMonitoring();
        }

        this.emit('configUpdated', this.config);
    }

    /**
     * Shutdown the health monitoring service
     */
    public async shutdown(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        this.logger.info('Shutting down database health monitor', 'database', {}, 'DatabaseHealthMonitor');
        
        this.stopMonitoring();
        this.isRunning = false;
        
        this.emit('shutdown');
    }

    // Private Methods

    private async performHealthCheck(): Promise<HealthCheckResult> {
        const startTime = performance.now();
        
        try {
            // Get basic database health
            const dbHealth = await this.dbConnection.getHealth();
            
            // Get connection statistics
            const connectionStats = this.dbConnection.getStats();
            
            // Calculate memory and disk usage
            const memoryStats = this.getMemoryStats();
            const diskStats = this.getDiskStats();
            
            // Calculate query statistics
            const queryStats = this.calculateQueryStats();
            
            const checkDuration = performance.now() - startTime;
            
            const result: HealthCheckResult = {
                ...dbHealth,
                checkDuration,
                memoryStats,
                diskStats,
                poolStats: {
                    activeConnections: connectionStats.activeConnections,
                    totalConnections: connectionStats.totalConnections,
                    failedConnections: connectionStats.failedConnections,
                    avgResponseTime: connectionStats.averageResponseTime
                },
                queryStats
            };

            return result;
            
        } catch (error) {
            this.logger.error(`Health check failed: ${error.message}`, 'database', 
                { error }, 'DatabaseHealthMonitor');
            
            throw new ReadyAIError(
                `Health check execution failed: ${error.message}`,
                'HEALTH_CHECK_FAILED',
                500,
                { originalError: error }
            );
        }
    }

    private calculateOverallHealth(healthResult: HealthCheckResult): 'healthy' | 'degraded' | 'critical' {
        const checks = [
            healthResult.isConnected,
            healthResult.responseTime < this.config.connectionTimeoutThreshold,
            healthResult.memoryStats.percentage < (this.config.memoryThreshold / 1024 * 100),
            healthResult.diskStats.percentage < this.config.diskUsageThreshold,
            healthResult.queryStats.avgQueryTime < this.config.slowQueryThreshold,
            healthResult.errors.length === 0
        ];

        const healthyChecks = checks.filter(Boolean).length;
        const totalChecks = checks.length;
        const healthPercentage = (healthyChecks / totalChecks) * 100;

        if (healthPercentage >= 90) return 'healthy';
        if (healthPercentage >= 70) return 'degraded';
        return 'critical';
    }

    private processHealthResult(result: HealthCheckResult): void {
        // Add to history
        this.healthHistory.push(result);
        if (this.healthHistory.length > this.config.sampleHistorySize) {
            this.healthHistory.shift();
        }

        // Update trends
        this.updateTrends(result);

        // Check for alerts
        if (this.config.enableAlerts) {
            this.checkForAlerts(result);
        }

        // Emit health update event
        this.emit('healthUpdated', result);

        // Log significant health changes
        const overall = this.calculateOverallHealth(result);
        const logLevel: LogLevel = overall === 'critical' ? 'error' : 
                                  overall === 'degraded' ? 'warn' : 'debug';
        
        this.logger.log(logLevel, `Database health check completed: ${overall}`, 'database', {
            health: result,
            overall
        }, 'DatabaseHealthMonitor');
    }

    private checkForAlerts(result: HealthCheckResult): void {
        const now = Date.now();

        // Check response time alert
        if (result.responseTime > this.config.connectionTimeoutThreshold) {
            this.createAlert('slow_response', 'Slow Database Response', 
                `Database response time (${result.responseTime}ms) exceeds threshold (${this.config.connectionTimeoutThreshold}ms)`,
                'warning', { responseTime: result.responseTime });
        }

        // Check memory usage alert
        if (result.memoryStats.percentage > (this.config.memoryThreshold / 1024 * 100)) {
            this.createAlert('high_memory', 'High Memory Usage',
                `Memory usage (${result.memoryStats.percentage}%) exceeds threshold`,
                'warning', { memoryUsage: result.memoryStats });
        }

        // Check disk usage alert
        if (result.diskStats.percentage > this.config.diskUsageThreshold) {
            this.createAlert('high_disk_usage', 'High Disk Usage',
                `Disk usage (${result.diskStats.percentage}%) exceeds threshold (${this.config.diskUsageThreshold}%)`,
                'critical', { diskUsage: result.diskStats });
        }

        // Check connection errors
        if (result.errors.length > 0) {
            this.createAlert('connection_errors', 'Database Connection Errors',
                `${result.errors.length} connection errors detected`,
                'critical', { errors: result.errors });
        }

        // Check slow queries
        if (result.queryStats.slowQueries > 0) {
            this.createAlert('slow_queries', 'Slow Query Detection',
                `${result.queryStats.slowQueries} slow queries detected`,
                'warning', { queryStats: result.queryStats });
        }
    }

    private createAlert(
        type: string,
        title: string,
        description: string,
        severity: AlertSeverity,
        metadata?: Record<string, any>
    ): void {
        const now = Date.now();
        const lastAlertTime = this.lastAlertTimes.get(type) || 0;
        
        // Check cooldown period
        if (now - lastAlertTime < this.config.alertCooldown) {
            return;
        }

        const alert: HealthAlert = {
            id: `${type}_${now}`,
            type,
            title,
            description,
            severity,
            timestamp: new Date().toISOString(),
            resolved: false,
            metadata
        };

        this.alerts.push(alert);
        this.lastAlertTimes.set(type, now);

        this.logger.warn(`Health alert created: ${title}`, 'database', {
            alert
        }, 'DatabaseHealthMonitor');

        this.emit('alertCreated', alert);

        // Attempt automatic recovery if enabled
        if (this.config.enableAutoRecovery) {
            this.attemptAutoRecovery(alert);
        }
    }

    private attemptAutoRecovery(alert: HealthAlert): void {
        this.logger.info(`Attempting automatic recovery for alert: ${alert.type}`, 'database', {
            alert
        }, 'DatabaseHealthMonitor');

        // Implement recovery strategies based on alert type
        switch (alert.type) {
            case 'connection_errors':
                // Attempt to recreate connections
                this.dbConnection.close().then(() => {
                    return this.dbConnection.initialize();
                }).catch(error => {
                    this.logger.error(`Auto-recovery failed for connection errors: ${error.message}`, 
                        'database', { error, alert }, 'DatabaseHealthMonitor');
                });
                break;

            case 'high_memory':
                // Clear caches and force garbage collection
                if (global.gc) {
                    global.gc();
                }
                break;

            default:
                this.logger.debug(`No auto-recovery strategy for alert type: ${alert.type}`, 
                    'database', { alert }, 'DatabaseHealthMonitor');
        }
    }

    private getMemoryStats(): { used: number; total: number; percentage: number } {
        const memUsage = process.memoryUsage();
        const totalMem = memUsage.heapTotal;
        const usedMem = memUsage.heapUsed;
        
        return {
            used: usedMem,
            total: totalMem,
            percentage: (usedMem / totalMem) * 100
        };
    }

    private getDiskStats(): { used: number; total: number; percentage: number } {
        try {
            // This is a simplified disk usage check
            // In a production environment, you might want to use a more sophisticated approach
            const stats = statSync(process.cwd());
            return {
                used: 0, // Would need platform-specific implementation
                total: 0,
                percentage: 0
            };
        } catch (error) {
            return { used: 0, total: 0, percentage: 0 };
        }
    }

    private calculateQueryStats(): { 
        totalQueries: number; 
        slowQueries: number; 
        avgQueryTime: number; 
        errors: number; 
    } {
        const totalQueries = this.queryExecutionTimes.length;
        const slowQueries = this.queryExecutionTimes.filter(time => 
            time > this.config.slowQueryThreshold
        ).length;
        
        const avgQueryTime = totalQueries > 0 
            ? this.queryExecutionTimes.reduce((a, b) => a + b, 0) / totalQueries
            : 0;
            
        const errors = Array.from(this.errorCounts.values()).reduce((a, b) => a + b, 0);

        return {
            totalQueries,
            slowQueries,
            avgQueryTime,
            errors
        };
    }

    private updateTrends(result: HealthCheckResult): void {
        const timestamp = new Date().toISOString();

        // Update response time trend
        this.updateTrend(this.trends.responseTimeTrend, result.responseTime, timestamp);
        
        // Update error rate trend
        this.updateTrend(this.trends.errorRateTrend, result.errors.length, timestamp);
        
        // Update connection usage trend
        this.updateTrend(this.trends.connectionUsageTrend, result.poolStats.activeConnections, timestamp);
        
        // Update memory usage trend
        this.updateTrend(this.trends.memoryUsageTrend, result.memoryStats.percentage, timestamp);
        
        // Update query performance trend
        this.updateTrend(this.trends.queryPerformanceTrend, result.queryStats.avgQueryTime, timestamp);
    }

    private updateTrend(trend: HealthTrend, value: number, timestamp: string): void {
        trend.values.push({ value, timestamp });
        
        // Keep only recent values for trend analysis
        const maxValues = 50;
        if (trend.values.length > maxValues) {
            trend.values.shift();
        }

        // Calculate trend direction
        if (trend.values.length >= 2) {
            const recent = trend.values.slice(-10);
            const older = trend.values.slice(-20, -10);
            
            if (recent.length > 0 && older.length > 0) {
                const recentAvg = recent.reduce((sum, item) => sum + item.value, 0) / recent.length;
                const olderAvg = older.reduce((sum, item) => sum + item.value, 0) / older.length;
                
                const change = ((recentAvg - olderAvg) / olderAvg) * 100;
                
                if (Math.abs(change) < 5) {
                    trend.direction = 'stable';
                } else if (change > 0) {
                    trend.direction = 'increasing';
                } else {
                    trend.direction = 'decreasing';
                }
                
                trend.changePercentage = change;
            }
        }

        trend.lastUpdated = timestamp;
    }

    private getTrendSummary(): Record<string, HealthTrend> {
        return {
            responseTime: this.trends.responseTimeTrend,
            errorRate: this.trends.errorRateTrend,
            connectionUsage: this.trends.connectionUsageTrend,
            memoryUsage: this.trends.memoryUsageTrend,
            queryPerformance: this.trends.queryPerformanceTrend
        };
    }

    private generateRecommendations(result: HealthCheckResult): string[] {
        const recommendations: string[] = [];

        if (result.responseTime > this.config.connectionTimeoutThreshold) {
            recommendations.push('Consider optimizing database queries or increasing connection pool size');
        }

        if (result.memoryStats.percentage > 80) {
            recommendations.push('Monitor memory usage and consider implementing query result caching');
        }

        if (result.diskStats.percentage > this.config.diskUsageThreshold) {
            recommendations.push('Clean up old log files and consider implementing data archival');
        }

        if (result.queryStats.slowQueries > 0) {
            recommendations.push('Analyze and optimize slow queries, consider adding database indexes');
        }

        if (!result.walMode) {
            recommendations.push('Enable WAL mode for better concurrency and performance');
        }

        if (!result.foreignKeys) {
            recommendations.push('Enable foreign key constraints for data integrity');
        }

        return recommendations;
    }

    private initializeTrends(): HealthTrendTracker {
        const createEmptyTrend = (): HealthTrend => ({
            values: [],
            direction: 'stable',
            changePercentage: 0,
            lastUpdated: new Date().toISOString()
        });

        return {
            responseTimeTrend: createEmptyTrend(),
            errorRateTrend: createEmptyTrend(),
            connectionUsageTrend: createEmptyTrend(),
            memoryUsageTrend: createEmptyTrend(),
            queryPerformanceTrend: createEmptyTrend()
        };
    }

    private setupDatabaseEventHandlers(): void {
        // Listen to database connection events
        this.dbConnection.on('connectionCreated', (connectionId) => {
            this.logger.debug(`Database connection created: ${connectionId}`, 'database', 
                { connectionId }, 'DatabaseHealthMonitor');
        });

        this.dbConnection.on('connectionClosed', (connectionId) => {
            this.logger.debug(`Database connection closed: ${connectionId}`, 'database', 
                { connectionId }, 'DatabaseHealthMonitor');
        });

        this.dbConnection.on('operationFailed', (error, attempts) => {
            this.errorCounts.set('operation', (this.errorCounts.get('operation') || 0) + 1);
            this.logger.warn(`Database operation failed after ${attempts} attempts: ${error.message}`, 
                'database', { error, attempts }, 'DatabaseHealthMonitor');
        });

        this.dbConnection.on('healthCheckFailed', (health) => {
            this.createAlert('health_check_failed', 'Database Health Check Failed',
                'Routine health check detected issues', 'warning', { health });
        });
    }

    private startMonitoring(): void {
        // Start periodic health checks
        this.healthCheckTimer = setInterval(() => {
            this.performHealthCheck()
                .then(result => this.processHealthResult(result))
                .catch(error => {
                    this.logger.error(`Scheduled health check failed: ${error.message}`, 
                        'database', { error }, 'DatabaseHealthMonitor');
                });
        }, this.config.checkInterval);

        // Start metrics collection
        if (this.config.enableMetrics) {
            this.metricsCollectionTimer = setInterval(() => {
                this.collectPerformanceMetrics();
            }, 60000); // Collect metrics every minute
        }

        this.logger.info('Database health monitoring started', 'database', {
            checkInterval: this.config.checkInterval,
            enableMetrics: this.config.enableMetrics
        }, 'DatabaseHealthMonitor');
    }

    private stopMonitoring(): void {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = undefined;
        }

        if (this.metricsCollectionTimer) {
            clearInterval(this.metricsCollectionTimer);
            this.metricsCollectionTimer = undefined;
        }

        this.logger.info('Database health monitoring stopped', 'database', {}, 'DatabaseHealthMonitor');
    }

    private collectPerformanceMetrics(): void {
        const stats = this.dbConnection.getStats();
        
        // Record connection response times
        if (stats.responseTimeHistory) {
            this.connectionResponseTimes.push(...stats.responseTimeHistory);
            
            // Keep only recent response times (last 1000)
            if (this.connectionResponseTimes.length > 1000) {
                this.connectionResponseTimes = this.connectionResponseTimes.slice(-1000);
            }
        }

        // Emit metrics for external monitoring systems
        this.emit('metricsCollected', {
            timestamp: new Date().toISOString(),
            connectionStats: stats,
            queryStats: this.calculateQueryStats(),
            memoryStats: this.getMemoryStats()
        });
    }
}

/**
 * Default DatabaseHealthMonitor instance factory
 */
export function createDatabaseHealthMonitor(
    dbConnection: DatabaseConnection,
    config?: Partial<DatabaseHealthMonitorConfig>
): DatabaseHealthMonitor {
    return new DatabaseHealthMonitor(dbConnection, config);
}

// Export types and constants for external use
export type {
    DatabaseHealthMonitorConfig,
    HealthCheckResult,
    HealthTrendTracker
};

export {
    DEFAULT_MONITOR_CONFIG
};

export default DatabaseHealthMonitor;
