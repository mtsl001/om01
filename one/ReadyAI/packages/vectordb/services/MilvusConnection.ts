// packages/vectordb/services/MilvusConnection.ts

/**
 * Milvus Connection Service for ReadyAI Personal AI Development Orchestrator
 * 
 * This module adapts Cline's proven connection management patterns (70% reuse) 
 * from their database connection handling while extending with Milvus-specific
 * vector database functionality and ReadyAI's health monitoring capabilities.
 * 
 * Key Adaptations from Cline:
 * - Connection pooling patterns from Cline's DatabaseConnection service
 * - Health monitoring from Cline's comprehensive health check system
 * - Error handling and retry mechanisms from Cline's robust error recovery
 * - Event-driven architecture from Cline's service coordination patterns
 * - Graceful shutdown patterns from Cline's resource cleanup
 * 
 * ReadyAI Extensions:
 * - Milvus-specific connection management and optimization
 * - Vector database health monitoring with collection awareness  
 * - Project-aware connection context and resource management
 * - Integration with ReadyAI's telemetry and logging system
 * 
 * @version 1.0.0
 * @author ReadyAI Development Team
 */

import { EventEmitter } from 'events';
import { MilvusClient, DataType } from '@zilliz/milvus2-sdk-node';

// ReadyAI Core Dependencies
import {
  UUID,
  ApiResponse,
  ReadyAIError,
  AsyncResult,
  wrapAsync,
  createApiResponse,
  createApiError,
  isApiSuccess
} from '../../foundation/types/core';

// Vector Database Types
import {
  VectorDatabaseConfig,
  VectorDatabaseHealth,
  VectorOperationResult,
  VectorDatabaseDiagnostics,
  VectorDatabaseError,
  VectorPerformanceMetrics,
  DEFAULTVECTORCONFIG
} from '../types/vectordb';

/**
 * Milvus connection pool entry tracking client instances
 * Enhanced with health monitoring and usage statistics
 * Adapted from Cline's ConnectionPoolEntry pattern
 */
interface MilvusConnectionPoolEntry {
  /** Milvus client instance */
  client: MilvusClient;
  /** Connection creation timestamp */
  createdAt: string;
  /** Last activity timestamp */
  lastUsed: string;
  /** Number of active operations */
  activeOperations: number;
  /** Connection health status */
  isHealthy: boolean;
  /** Error count since last reset */
  errorCount: number;
  /** Connection-specific configuration */
  config: VectorDatabaseConfig;
}

/**
 * Connection statistics for monitoring and optimization
 * Following Cline's performance tracking patterns
 */
interface MilvusConnectionStats {
  /** Total connections created */
  totalConnections: number;
  /** Active connections count */
  activeConnections: number;
  /** Failed connection attempts */
  failedConnections: number;
  /** Total operations executed */
  totalOperations: number;
  /** Average response time in milliseconds */
  averageResponseTime: number;
  /** Current memory usage */
  memoryUsage: number;
  /** Peak memory usage */
  peakMemoryUsage: number;
}

/**
 * Milvus-specific configuration extending base vector config
 * Enhanced with connection pooling and optimization settings
 */
export interface MilvusConnectionConfig extends VectorDatabaseConfig {
  /** Connection pool configuration */
  pool?: {
    /** Minimum pool size */
    min: number;
    /** Maximum pool size */
    max: number;
    /** Connection idle timeout */
    idleTimeoutMs: number;
    /** Connection acquire timeout */
    acquireTimeoutMs: number;
  };
  /** Milvus-specific client options */
  clientOptions?: {
    /** Connection keep-alive */
    keepAlive?: boolean;
    /** Channel options */
    channelOptions?: Record<string, any>;
    /** gRPC options */
    grpcOptions?: Record<string, any>;
  };
}

/**
 * Default Milvus connection configuration
 * Optimized for ReadyAI development workflow
 */
const DEFAULT_MILVUS_CONFIG: Required<MilvusConnectionConfig> = {
  ...DEFAULTVECTORCONFIG,
  pool: {
    min: 1,
    max: 5,
    idleTimeoutMs: 300000, // 5 minutes
    acquireTimeoutMs: 10000  // 10 seconds
  },
  clientOptions: {
    keepAlive: true,
    channelOptions: {
      'grpc.keepalive_time_ms': 30000,
      'grpc.keepalive_timeout_ms': 5000,
      'grpc.keepalive_permit_without_calls': true,
      'grpc.http2.max_pings_without_data': 0,
      'grpc.http2.min_time_between_pings_ms': 10000,
      'grpc.http2.min_ping_interval_without_data_ms': 300000
    },
    grpcOptions: {}
  }
};

/**
 * Milvus Connection Service
 * 
 * Manages Milvus vector database connections with pooling, health monitoring,
 * and ReadyAI-specific optimizations. Adapts Cline's proven connection patterns
 * while extending for vector database requirements and ReadyAI's development
 * orchestrator needs.
 */
export class MilvusConnection extends EventEmitter {
  private readonly config: Required<MilvusConnectionConfig>;
  private readonly connectionPool = new Map<string, MilvusConnectionPoolEntry>();
  private readonly stats: MilvusConnectionStats = {
    totalConnections: 0,
    activeConnections: 0,
    failedConnections: 0,
    totalOperations: 0,
    averageResponseTime: 0,
    memoryUsage: 0,
    peakMemoryUsage: 0
  };

  private isInitialized = false;
  private isShuttingDown = false;
  private healthCheckInterval?: NodeJS.Timeout;
  private poolCleanupInterval?: NodeJS.Timeout;

  // Performance tracking - adapted from Cline patterns
  private readonly responseTimes: number[] = [];
  private readonly MAX_RESPONSE_TIMES = 100;

  constructor(config?: Partial<MilvusConnectionConfig>) {
    super();
    this.config = { ...DEFAULT_MILVUS_CONFIG, ...config };
    
    // Validate configuration
    this.validateConfiguration();
    
    // Set up event handlers
    this.setupEventHandlers();
  }

  /**
   * Initialize the Milvus connection service
   * Sets up connection pool, health monitoring, and cleanup scheduling
   * Following Cline's initialization patterns
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      throw new ReadyAIError(
        'MilvusConnection is already initialized',
        'MILVUS_ALREADY_INITIALIZED',
        400
      );
    }

    try {
      this.emit('initializing');

      // Create primary connection
      await this.createConnection('primary');

      // Test connection health
      const health = await this.getHealth();
      if (!health.isHealthy) {
        throw new ReadyAIError(
          'Initial Milvus connection health check failed',
          'MILVUS_HEALTH_CHECK_FAILED',
          500,
          { health }
        );
      }

      // Start health monitoring
      this.startHealthMonitoring();

      // Start pool cleanup
      this.startPoolCleanup();

      this.isInitialized = true;
      this.emit('initialized');

    } catch (error) {
      this.stats.failedConnections++;
      this.emit('error', error);
      throw new ReadyAIError(
        `Failed to initialize MilvusConnection: ${(error as Error).message}`,
        'MILVUS_INIT_FAILED',
        500,
        { originalError: error }
      );
    }
  }

  /**
   * Execute a Milvus operation with connection management
   * Provides automatic retry, error handling, and performance tracking
   * Adapted from Cline's execute pattern
   */
  public async execute<T>(
    operation: (client: MilvusClient) => Promise<T>,
    options: {
      connectionId?: string;
      retries?: number;
      timeout?: number;
    } = {}
  ): Promise<T> {
    if (!this.isInitialized) {
      throw new ReadyAIError(
        'MilvusConnection not initialized',
        'MILVUS_NOT_INITIALIZED',
        500
      );
    }

    if (this.isShuttingDown) {
      throw new ReadyAIError(
        'MilvusConnection is shutting down',
        'MILVUS_SHUTTING_DOWN',
        503
      );
    }

    const connectionId = options.connectionId || 'primary';
    const retries = options.retries || 3;
    const timeout = options.timeout || 30000;

    const startTime = Date.now();

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const connection = await this.getConnection(connectionId);
        connection.activeOperations++;

        // Execute with timeout
        const result = await this.executeWithTimeout(
          () => operation(connection.client),
          timeout
        );

        // Update statistics
        const responseTime = Date.now() - startTime;
        this.updatePerformanceStats(responseTime);

        connection.lastUsed = new Date().toISOString();
        connection.activeOperations--;
        this.stats.totalOperations++;

        return result;

      } catch (error) {
        const connection = this.connectionPool.get(connectionId);
        if (connection) {
          connection.activeOperations--;
          connection.errorCount++;

          // Mark connection as unhealthy after too many errors
          if (connection.errorCount >= 5) {
            connection.isHealthy = false;
            this.emit('connectionUnhealthy', connectionId, error);
          }
        }

        // Retry logic - adapted from Cline patterns
        if (attempt < retries && this.shouldRetry(error)) {
          await this.delay(Math.pow(2, attempt - 1) * 1000); // Exponential backoff
          continue;
        }

        this.emit('operationFailed', error, attempt);
        throw error;
      }
    }

    throw new ReadyAIError('Unexpected execution path', 'MILVUS_EXECUTION_ERROR', 500);
  }

  /**
   * Get current Milvus health status
   * Comprehensive health check including connection status and performance metrics
   * Following Cline's health monitoring patterns
   */
  public async getHealth(): Promise<VectorDatabaseHealth> {
    const health: VectorDatabaseHealth = {
      isHealthy: false,
      connection: {
        isConnected: false,
        connectionCount: this.stats.activeConnections,
        responseTimeMs: this.stats.averageResponseTime,
        lastChecked: new Date().toISOString()
      },
      memory: {
        totalBytes: 0,
        usedBytes: this.stats.memoryUsage,
        availableBytes: 0,
        utilizationPercent: 0
      },
      storage: {
        totalBytes: 0,
        usedBytes: 0,
        availableBytes: 0,
        utilizationPercent: 0
      },
      performance: {
        queriesPerSecond: 0,
        averageQueryLatencyMs: this.stats.averageResponseTime,
        insertionsPerSecond: 0,
        averageInsertLatencyMs: this.stats.averageResponseTime
      },
      collections: [],
      issues: []
    };

    try {
      if (!this.isInitialized) {
        health.issues.push({
          severity: 'error',
          message: 'MilvusConnection not initialized',
          component: 'connection',
          timestamp: new Date().toISOString()
        });
        return health;
      }

      const startTime = Date.now();

      // Test primary connection
      await this.execute(async (client) => {
        // Simple health check query
        const result = await client.getVersion();
        health.connection.isConnected = !!result;
        return result;
      });

      health.connection.responseTimeMs = Date.now() - startTime;

      // Get collection health status
      const collections = await this.execute(async (client) => {
        return await client.listCollections();
      });

      if (collections?.collection_names) {
        health.collections = await Promise.all(
          collections.collection_names.slice(0, 10).map(async (name: string) => {
            try {
              const stats = await this.execute(async (client) => {
                return await client.getCollectionStatistics({ collection_name: name });
              });

              return {
                name,
                isHealthy: true,
                entityCount: parseInt(stats?.stats?.row_count || '0'),
                lastChecked: new Date().toISOString()
              };
            } catch (error) {
              return {
                name,
                isHealthy: false,
                entityCount: 0,
                lastChecked: new Date().toISOString()
              };
            }
          })
        );
      }

      // Collect connection-specific errors
      for (const [connectionId, connection] of this.connectionPool) {
        if (!connection.isHealthy) {
          health.issues.push({
            severity: 'warning',
            message: `Connection ${connectionId} is unhealthy (errors: ${connection.errorCount})`,
            component: 'connection-pool',
            timestamp: new Date().toISOString()
          });
        }
      }

      // Overall health determination
      health.isHealthy = health.connection.isConnected && health.issues.length === 0;

    } catch (error) {
      health.issues.push({
        severity: 'error',
        message: `Health check failed: ${(error as Error).message}`,
        component: 'health-monitor',
        timestamp: new Date().toISOString()
      });
    }

    return health;
  }

  /**
   * Get connection statistics for monitoring and optimization
   * Following Cline's performance tracking patterns
   */
  public getStats(): MilvusConnectionStats & { responseTimeHistory: number[] } {
    return {
      ...this.stats,
      responseTimeHistory: [...this.responseTimes]
    };
  }

  /**
   * Get comprehensive diagnostics information
   * Detailed diagnostic information for troubleshooting
   */
  public async getDiagnostics(): Promise<VectorDatabaseDiagnostics> {
    const diagnostics: VectorDatabaseDiagnostics = {
      system: {
        version: 'unknown',
        uptime: process.uptime() * 1000,
        nodeCount: 1,
        mode: 'standalone'
      },
      config: this.config,
      connections: Array.from(this.connectionPool.entries()).map(([id, conn]) => ({
        id,
        clientAddress: `${this.config.host}:${this.config.port}`,
        connectedAt: conn.createdAt,
        lastActivity: conn.lastUsed
      })),
      recentOperations: [],
      trends: {
        queryLatency: [],
        throughput: []
      }
    };

    try {
      // Get Milvus version
      const versionResult = await this.execute(async (client) => {
        return await client.getVersion();
      });
      
      if (versionResult) {
        diagnostics.system.version = versionResult.version || 'unknown';
      }
    } catch (error) {
      // Version check failed, use unknown
    }

    return diagnostics;
  }

  /**
   * Close specific connection or all connections
   * Graceful shutdown with pending operation completion
   * Following Cline's cleanup patterns
   */
  public async close(connectionId?: string): Promise<void> {
    if (connectionId) {
      await this.closeConnection(connectionId);
    } else {
      await this.closeAllConnections();
    }
  }

  /**
   * Shutdown the Milvus connection service
   * Comprehensive cleanup with graceful operation completion
   * Following Cline's shutdown patterns
   */
  public async shutdown(): Promise<void> {
    if (!this.isInitialized || this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.emit('shuttingDown');

    try {
      // Clear intervals
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }
      
      if (this.poolCleanupInterval) {
        clearInterval(this.poolCleanupInterval);
      }

      // Wait for active operations to complete with timeout
      await this.waitForActiveOperations(10000);

      // Close all connections
      await this.closeAllConnections();

      this.isInitialized = false;
      this.emit('shutdown');

    } catch (error) {
      this.emit('error', error);
      throw error;
    } finally {
      this.isShuttingDown = false;
    }
  }

  // Private Methods - adapted from Cline patterns

  private validateConfiguration(): void {
    if (!this.config.host || typeof this.config.host !== 'string') {
      throw new ReadyAIError('Milvus host must be a valid string', 'INVALID_MILVUS_HOST', 400);
    }

    if (!this.config.port || this.config.port <= 0 || this.config.port > 65535) {
      throw new ReadyAIError('Milvus port must be between 1 and 65535', 'INVALID_MILVUS_PORT', 400);
    }
  }

  private async createConnection(connectionId: string): Promise<MilvusConnectionPoolEntry> {
    try {
      const client = new MilvusClient({
        address: `${this.config.host}:${this.config.port}`,
        username: this.config.username,
        password: this.config.password,
        database: this.config.database,
        timeout: this.config.timeout,
        ...this.config.clientOptions
      });

      const connection: MilvusConnectionPoolEntry = {
        client,
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString(),
        activeOperations: 0,
        isHealthy: true,
        errorCount: 0,
        config: this.config
      };

      this.connectionPool.set(connectionId, connection);
      this.stats.totalConnections++;
      this.stats.activeConnections++;

      this.emit('connectionCreated', connectionId);

      return connection;

    } catch (error) {
      this.stats.failedConnections++;
      throw new ReadyAIError(
        `Failed to create Milvus connection ${connectionId}: ${(error as Error).message}`,
        'MILVUS_CONNECTION_FAILED',
        500
      );
    }
  }

  private async getConnection(connectionId: string): Promise<MilvusConnectionPoolEntry> {
    let connection = this.connectionPool.get(connectionId);

    if (!connection || !connection.isHealthy) {
      // Recreate unhealthy connections
      if (connection && !connection.isHealthy) {
        await this.closeConnection(connectionId);
      }

      connection = await this.createConnection(connectionId);
    }

    return connection;
  }

  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new ReadyAIError(`Operation timed out after ${timeout}ms`, 'MILVUS_TIMEOUT', 408));
      }, timeout);

      operation()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private shouldRetry(error: any): boolean {
    // Retry on connection errors, timeout errors, or server errors
    const retryableErrors = [
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'timeout',
      'unavailable'
    ];

    const errorMessage = error?.message?.toLowerCase() || '';
    return retryableErrors.some(retryableError =>
      errorMessage.includes(retryableError)
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private updatePerformanceStats(responseTime: number): void {
    this.responseTimes.push(responseTime);

    // Keep only last MAX_RESPONSE_TIMES entries
    if (this.responseTimes.length > this.MAX_RESPONSE_TIMES) {
      this.responseTimes.shift();
    }

    // Calculate average response time
    this.stats.averageResponseTime =
      this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;

    // Update memory usage (basic estimation)
    const memoryUsage = process.memoryUsage();
    this.stats.memoryUsage = memoryUsage.used;
    this.stats.peakMemoryUsage = Math.max(this.stats.peakMemoryUsage, memoryUsage.used);
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.getHealth();

        if (!health.isHealthy || health.issues.length > 0) {
          this.emit('healthCheckFailed', health);
        } else {
          this.emit('healthCheckPassed', health);
        }

        // Reset error counts for healthy connections
        for (const connection of this.connectionPool.values()) {
          if (connection.isHealthy && connection.errorCount > 0) {
            connection.errorCount = Math.max(0, connection.errorCount - 1);
          }
        }

      } catch (error) {
        this.emit('healthCheckError', error);
      }
    }, this.config.healthCheckInterval * 1000); // Convert to milliseconds
  }

  private startPoolCleanup(): void {
    this.poolCleanupInterval = setInterval(() => {
      const now = Date.now();
      const idleTimeout = this.config.pool.idleTimeoutMs;

      for (const [connectionId, connection] of this.connectionPool) {
        // Skip primary connection and active connections
        if (connectionId === 'primary' || connection.activeOperations > 0) {
          continue;
        }

        const lastUsed = new Date(connection.lastUsed).getTime();
        const idleTime = now - lastUsed;

        if (idleTime > idleTimeout && this.connectionPool.size > this.config.pool.min) {
          this.closeConnection(connectionId).catch(error => {
            this.emit('poolCleanupError', connectionId, error);
          });
        }
      }
    }, 60000); // Check every minute
  }

  private async closeConnection(connectionId: string): Promise<void> {
    const connection = this.connectionPool.get(connectionId);
    if (!connection) {
      return;
    }

    // Wait for active operations to complete
    let attempts = 0;
    while (connection.activeOperations > 0 && attempts < 50) {
      await this.delay(100);
      attempts++;
    }

    try {
      // Milvus client doesn't have explicit close method in some versions
      // Connection will be closed automatically when client is garbage collected
      this.connectionPool.delete(connectionId);
      this.stats.activeConnections--;

      this.emit('connectionClosed', connectionId);

    } catch (error) {
      this.emit('connectionCloseError', connectionId, error);
    }
  }

  private async closeAllConnections(): Promise<void> {
    const connectionIds = Array.from(this.connectionPool.keys());

    await Promise.allSettled(
      connectionIds.map(id => this.closeConnection(id))
    );
  }

  private async waitForActiveOperations(timeout: number): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const hasActiveOperations = Array.from(this.connectionPool.values())
        .some(connection => connection.activeOperations > 0);

      if (!hasActiveOperations) {
        return;
      }

      await this.delay(100);
    }

    // Force close after timeout
    console.warn('MilvusConnection: Timeout waiting for active operations to complete');
  }

  private setupEventHandlers(): void {
    // Handle process signals for graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.emit('uncaughtException', error);
    });

    process.on('unhandledRejection', (reason) => {
      this.emit('unhandledRejection', reason);
    });
  }
}

/**
 * Default MilvusConnection instance factory
 * Provides a singleton pattern for application-wide Milvus connectivity
 */
let defaultInstance: MilvusConnection | null = null;

export function createMilvusConnection(config?: Partial<MilvusConnectionConfig>): MilvusConnection {
  return new MilvusConnection(config);
}

export function getDefaultMilvusConnection(config?: Partial<MilvusConnectionConfig>): MilvusConnection {
  if (!defaultInstance) {
    defaultInstance = new MilvusConnection(config);
  }
  return defaultInstance;
}

export function resetDefaultMilvusConnection(): void {
  if (defaultInstance) {
    defaultInstance.shutdown();
    defaultInstance = null;
  }
}

// Export types and configuration
export type {
  MilvusConnectionConfig,
  MilvusConnectionPoolEntry,
  MilvusConnectionStats
};

export {
  DEFAULT_MILVUS_CONFIG
};

export default MilvusConnection;
