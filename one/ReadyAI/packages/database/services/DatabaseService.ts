// packages/database/services/DatabaseService.ts

/**
 * Database Service for ReadyAI Phase 1.2 - Production Implementation
 * 
 * Adapted from Cline's service coordination patterns with ReadyAI-specific extensions
 * Provides comprehensive database service layer that orchestrates all database operations
 * including connections, migrations, backups, health monitoring, and business logic.
 * 
 * Key Features:
 * - Unified database operations interface
 * - Health monitoring and diagnostics
 * - Business logic coordination
 * - Repository pattern implementation
 * - Production-ready error handling
 * - ReadyAI-specific database operations
 * - Integration with all database services
 * 
 * Reuse Strategy: 70% Adapt from Cline service coordination patterns
 * - Direct adaptation of Cline's service orchestration architecture
 * - Enhanced with ReadyAI business logic and health monitoring
 * - Maintains Cline's reliability and performance patterns
 */

import { EventEmitter } from 'events';
import { 
    UUID, 
    ApiResponse, 
    ApiErrorResponse, 
    ReadyAIError, 
    AsyncResult, 
    wrapAsync, 
    createApiResponse, 
    createApiError, 
    isApiSuccess 
} from '../../../foundation/types/core';

import {
    DatabaseConfig,
    DatabaseHealth,
    TransactionOptions,
    DatabaseOperationResult,
    MigrationResult,
    BackupResult,
    DEFAULTDATABASECONFIG,
    DEFAULTTRANSACTIONOPTIONS
} from '../types/database';

// Database services
import DatabaseConnection from './DatabaseConnection';
import MigrationService from './MigrationService';
import BackupService from './BackupService';
import TransactionManager from './TransactionManager';
import DatabaseHealthMonitor from './DatabaseHealthMonitor';

// Repository layer dependencies
import BaseRepository from '../repositories/BaseRepository';

/**
 * Database service configuration interface
 */
export interface DatabaseServiceConfig extends DatabaseConfig {
    /** Enable automatic migrations on startup */
    enableAutoMigrations?: boolean;
    /** Enable scheduled backups */
    enableScheduledBackups?: boolean;
    /** Health check interval in milliseconds */
    healthCheckInterval?: number;
    /** Enable performance monitoring */
    enablePerformanceMonitoring?: boolean;
    /** Connection pool size */
    connectionPoolSize?: number;
}

/**
 * Service health status
 */
export interface ServiceHealthStatus {
    /** Overall service health */
    isHealthy: boolean;
    /** Connection pool status */
    connectionHealth: DatabaseHealth;
    /** Migration service status */
    migrationStatus: {
        isRunning: boolean;
        currentVersion: number;
        pendingMigrations: number;
    };
    /** Backup service status */
    backupStatus: {
        isScheduled: boolean;
        lastBackup?: string;
        totalBackups: number;
    };
    /** Performance metrics */
    performance: {
        averageResponseTime: number;
        totalOperations: number;
        errorRate: number;
    };
    /** Last health check timestamp */
    lastChecked: string;
}

/**
 * Database operation context for tracking and logging
 */
export interface DatabaseOperationContext {
    /** Operation identifier */
    operationId: UUID;
    /** Operation type */
    operation: string;
    /** Project context if applicable */
    projectId?: UUID;
    /** User context if applicable */
    userId?: UUID;
    /** Additional metadata */
    metadata?: Record<string, any>;
}

/**
 * Default database service configuration
 */
const DEFAULT_SERVICE_CONFIG: Required<DatabaseServiceConfig> = {
    ...DEFAULTDATABASECONFIG,
    enableAutoMigrations: true,
    enableScheduledBackups: true,
    healthCheckInterval: 30000, // 30 seconds
    enablePerformanceMonitoring: true,
    connectionPoolSize: 5
};

/**
 * Database Service - Central orchestrator for all database operations
 * 
 * Manages all database-related services and provides a unified interface for
 * database operations. Adapts Cline's proven service coordination patterns
 * while extending for ReadyAI's development orchestrator requirements.
 */
export class DatabaseService extends EventEmitter {
    private readonly config: Required<DatabaseServiceConfig>;
    private readonly dbConnection: DatabaseConnection;
    private readonly migrationService: MigrationService;
    private readonly backupService: BackupService;
    private readonly transactionManager: TransactionManager;
    private readonly healthMonitor: DatabaseHealthMonitor;

    // Service state
    private isInitialized = false;
    private isShuttingDown = false;
    private healthCheckInterval?: NodeJS.Timeout;

    // Performance tracking
    private operationCount = 0;
    private errorCount = 0;
    private readonly responseTimes: number[] = [];
    private readonly MAX_RESPONSE_TIMES = 1000;

    // Repository registry
    private readonly repositories = new Map<string, BaseRepository<any>>();

    constructor(config: Partial<DatabaseServiceConfig> = {}) {
        super();
        
        this.config = { ...DEFAULT_SERVICE_CONFIG, ...config };
        
        // Initialize core services
        this.dbConnection = new DatabaseConnection(this.config);
        this.transactionManager = new TransactionManager(this.dbConnection);
        this.migrationService = new MigrationService(this.dbConnection, {
            enableAutoMigrations: this.config.enableAutoMigrations
        });
        this.backupService = new BackupService(
            this.dbConnection, 
            this.transactionManager, 
            {
                enableCompression: true,
                schedule: {
                    enabled: this.config.enableScheduledBackups,
                    interval: 24 * 60 * 60 * 1000, // 24 hours
                    retention: {
                        maxCount: 7,
                        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
                    },
                    strategies: ['full']
                }
            }
        );
        this.healthMonitor = new DatabaseHealthMonitor(this.dbConnection, {
            checkInterval: this.config.healthCheckInterval
        });

        // Set up event forwarding
        this.setupEventHandlers();
    }

    /**
     * Initialize the database service
     * Sets up all database services and performs initial health checks
     */
    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            throw new ReadyAIError(
                'DatabaseService is already initialized',
                'SERVICE_ALREADY_INITIALIZED',
                400
            );
        }

        try {
            this.emit('initializing');

            // Initialize core connection
            await this.dbConnection.initialize();

            // Initialize migration service and run migrations if enabled
            await this.migrationService.initialize();
            
            if (this.config.enableAutoMigrations) {
                await this.runPendingMigrations();
            }

            // Initialize backup service
            await this.backupService.initialize();

            // Initialize health monitoring
            await this.healthMonitor.initialize();

            // Start health check interval
            if (this.config.enablePerformanceMonitoring) {
                this.startHealthMonitoring();
            }

            this.isInitialized = true;
            this.emit('initialized');

        } catch (error) {
            this.emit('error', error);
            throw new ReadyAIError(
                `Failed to initialize DatabaseService: ${(error as Error).message}`,
                'SERVICE_INITIALIZATION_FAILED',
                500,
                { originalError: error }
            );
        }
    }

    /**
     * Execute a database operation with comprehensive error handling and monitoring
     */
    public async execute<T>(
        operation: (db: any) => Promise<T>,
        context?: Partial<DatabaseOperationContext>
    ): Promise<ApiResponse<T>> {
        return wrapAsync(async () => {
            this.ensureInitialized();

            const operationId = crypto.randomUUID() as UUID;
            const startTime = Date.now();
            
            const fullContext: DatabaseOperationContext = {
                operationId,
                operation: 'database_operation',
                ...context
            };

            try {
                this.operationCount++;
                this.emit('operation_started', fullContext);

                const result = await this.dbConnection.execute(operation);
                
                // Track performance
                const responseTime = Date.now() - startTime;
                this.updatePerformanceStats(responseTime);

                this.emit('operation_completed', fullContext, responseTime);
                
                return createApiResponse(result, {
                    timestamp: new Date().toISOString(),
                    requestId: operationId,
                    metrics: {
                        responseTime,
                        operationCount: this.operationCount
                    }
                });

            } catch (error) {
                this.errorCount++;
                const responseTime = Date.now() - startTime;
                
                this.emit('operation_failed', fullContext, error, responseTime);
                
                throw new ReadyAIError(
                    `Database operation failed: ${(error as Error).message}`,
                    'DATABASE_OPERATION_FAILED',
                    500,
                    { operationId, context: fullContext, responseTime }
                );
            }
        });
    }

    /**
     * Execute a database transaction with comprehensive management
     */
    public async executeTransaction<T>(
        operations: (db: any) => Promise<T>,
        options: TransactionOptions = DEFAULTTRANSACTIONOPTIONS,
        context?: Partial<DatabaseOperationContext>
    ): Promise<ApiResponse<T>> {
        return wrapAsync(async () => {
            this.ensureInitialized();

            const operationId = crypto.randomUUID() as UUID;
            const startTime = Date.now();
            
            const fullContext: DatabaseOperationContext = {
                operationId,
                operation: 'database_transaction',
                ...context
            };

            try {
                this.emit('transaction_started', fullContext);

                const result = await this.transactionManager.executeTransaction(
                    operations,
                    options
                );
                
                const responseTime = Date.now() - startTime;
                this.updatePerformanceStats(responseTime);

                this.emit('transaction_completed', fullContext, responseTime);
                
                return createApiResponse(result, {
                    timestamp: new Date().toISOString(),
                    requestId: operationId,
                    metrics: {
                        responseTime,
                        transactionMode: options.mode
                    }
                });

            } catch (error) {
                this.errorCount++;
                const responseTime = Date.now() - startTime;
                
                this.emit('transaction_failed', fullContext, error, responseTime);
                
                throw new ReadyAIError(
                    `Database transaction failed: ${(error as Error).message}`,
                    'DATABASE_TRANSACTION_FAILED',
                    500,
                    { operationId, context: fullContext, responseTime }
                );
            }
        });
    }

    /**
     * Run pending database migrations
     */
    public async runMigrations(): Promise<ApiResponse<MigrationResult>> {
        return wrapAsync(async () => {
            this.ensureInitialized();
            
            const result = await this.migrationService.runPendingMigrations();
            
            if (!isApiSuccess(result)) {
                throw new ReadyAIError(
                    `Migration failed: ${result.error.message}`,
                    'MIGRATION_FAILED',
                    500
                );
            }

            return createApiResponse(result.data);
        });
    }

    /**
     * Create a database backup
     */
    public async createBackup(
        strategy: 'full' | 'incremental' | 'schema-only' = 'full'
    ): Promise<ApiResponse<BackupResult>> {
        return wrapAsync(async () => {
            this.ensureInitialized();
            
            const result = await this.backupService.createBackup(strategy);
            
            return createApiResponse(result, {
                timestamp: new Date().toISOString(),
                backupStrategy: strategy
            });
        });
    }

    /**
     * Get comprehensive database health status
     */
    public async getHealthStatus(): Promise<ApiResponse<ServiceHealthStatus>> {
        return wrapAsync(async () => {
            // Get connection health
            const connectionHealth = await this.dbConnection.getHealth();
            
            // Get migration status
            const currentVersionResult = await this.migrationService.getCurrentVersion();
            const pendingMigrationsResult = await this.migrationService.getPendingMigrations();
            
            const migrationStatus = {
                isRunning: false, // Would track active migrations
                currentVersion: isApiSuccess(currentVersionResult) ? currentVersionResult.data : 0,
                pendingMigrations: isApiSuccess(pendingMigrationsResult) 
                    ? pendingMigrationsResult.data.length 
                    : 0
            };

            // Get backup status
            const backupStatus = {
                isScheduled: this.config.enableScheduledBackups,
                lastBackup: this.backupService.getBackupHistory(1)[0]?.timestamp,
                totalBackups: this.backupService.getBackupHistory().length
            };

            // Calculate performance metrics
            const averageResponseTime = this.responseTimes.length > 0
                ? this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length
                : 0;

            const errorRate = this.operationCount > 0
                ? (this.errorCount / this.operationCount) * 100
                : 0;

            const healthStatus: ServiceHealthStatus = {
                isHealthy: connectionHealth.isConnected && 
                          migrationStatus.pendingMigrations === 0 &&
                          errorRate < 10, // Less than 10% error rate
                connectionHealth,
                migrationStatus,
                backupStatus,
                performance: {
                    averageResponseTime,
                    totalOperations: this.operationCount,
                    errorRate
                },
                lastChecked: new Date().toISOString()
            };

            return createApiResponse(healthStatus);
        });
    }

    /**
     * Register a repository with the service
     */
    public registerRepository<T>(name: string, repository: BaseRepository<T>): void {
        this.repositories.set(name, repository);
        this.emit('repository_registered', name, repository);
    }

    /**
     * Get a registered repository
     */
    public getRepository<T>(name: string): BaseRepository<T> | undefined {
        return this.repositories.get(name);
    }

    /**
     * Get database connection for direct access (use with caution)
     */
    public getConnection(): DatabaseConnection {
        this.ensureInitialized();
        return this.dbConnection;
    }

    /**
     * Shutdown the database service gracefully
     */
    public async shutdown(): Promise<void> {
        if (!this.isInitialized || this.isShuttingDown) {
            return;
        }

        this.isShuttingDown = true;
        this.emit('shutting_down');

        try {
            // Clear intervals
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
            }

            // Shutdown services in reverse order
            await this.healthMonitor.shutdown();
            await this.backupService.shutdown();
            await this.migrationService.shutdown();
            await this.transactionManager.shutdown();
            await this.dbConnection.shutdown();

            // Clear repositories
            this.repositories.clear();

            this.isInitialized = false;
            this.emit('shutdown');

        } catch (error) {
            this.emit('error', error);
            throw error;
        } finally {
            this.isShuttingDown = false;
        }
    }

    /**
     * Private Methods
     */

    private ensureInitialized(): void {
        if (!this.isInitialized) {
            throw new ReadyAIError(
                'DatabaseService not initialized',
                'SERVICE_NOT_INITIALIZED',
                500
            );
        }
    }

    private async runPendingMigrations(): Promise<void> {
        const pendingResult = await this.migrationService.getPendingMigrations();
        
        if (isApiSuccess(pendingResult) && pendingResult.data.length > 0) {
            this.emit('migrations_starting', pendingResult.data.length);
            
            const migrationResult = await this.migrationService.runPendingMigrations();
            
            if (!isApiSuccess(migrationResult)) {
                throw new ReadyAIError(
                    `Auto-migration failed: ${migrationResult.error.message}`,
                    'AUTO_MIGRATION_FAILED',
                    500
                );
            }

            this.emit('migrations_completed', migrationResult.data);
        }
    }

    private updatePerformanceStats(responseTime: number): void {
        this.responseTimes.push(responseTime);

        // Keep only last MAX_RESPONSE_TIMES entries
        if (this.responseTimes.length > this.MAX_RESPONSE_TIMES) {
            this.responseTimes.shift();
        }
    }

    private startHealthMonitoring(): void {
        this.healthCheckInterval = setInterval(async () => {
            try {
                const healthStatus = await this.getHealthStatus();
                
                if (isApiSuccess(healthStatus)) {
                    this.emit('health_check', healthStatus.data);
                    
                    if (!healthStatus.data.isHealthy) {
                        this.emit('health_degraded', healthStatus.data);
                    }
                }
            } catch (error) {
                this.emit('health_check_failed', error);
            }
        }, this.config.healthCheckInterval);
    }

    private setupEventHandlers(): void {
        // Forward database connection events
        this.dbConnection.on('connectionCreated', (connectionId) => {
            this.emit('connection_created', connectionId);
        });

        this.dbConnection.on('connectionClosed', (connectionId) => {
            this.emit('connection_closed', connectionId);
        });

        this.dbConnection.on('error', (error) => {
            this.emit('database_error', error);
        });

        // Forward migration events
        this.migrationService.on('migrationStarted', (migration) => {
            this.emit('migration_started', migration);
        });

        this.migrationService.on('migrationCompleted', (migration) => {
            this.emit('migration_completed', migration);
        });

        // Forward backup events
        this.backupService.on('backup-started', (operationId, strategy) => {
            this.emit('backup_started', operationId, strategy);
        });

        this.backupService.on('backup-completed', (operationId, metadata) => {
            this.emit('backup_completed', operationId, metadata);
        });

        // Handle process signals for graceful shutdown
        process.on('SIGTERM', () => this.shutdown());
        process.on('SIGINT', () => this.shutdown());
    }
}

/**
 * Default DatabaseService instance factory
 * Provides a singleton pattern for application-wide database management
 */
let defaultInstance: DatabaseService | null = null;

export function createDatabaseService(
    config?: Partial<DatabaseServiceConfig>
): DatabaseService {
    return new DatabaseService(config);
}

export function getDefaultDatabaseService(
    config?: Partial<DatabaseServiceConfig>
): DatabaseService {
    if (!defaultInstance) {
        defaultInstance = new DatabaseService(config);
    }
    return defaultInstance;
}

export function resetDefaultDatabaseService(): void {
    if (defaultInstance) {
        defaultInstance.shutdown();
        defaultInstance = null;
    }
}

// Export types and configuration
export type {
    DatabaseServiceConfig,
    ServiceHealthStatus,
    DatabaseOperationContext
};

export {
    DEFAULT_SERVICE_CONFIG
};

export default DatabaseService;
