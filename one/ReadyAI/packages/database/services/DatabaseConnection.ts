// packages/database/services/DatabaseConnection.ts

/**
 * DatabaseConnection Service for ReadyAI Phase 1.2 - Production Implementation
 * 
 * Adapted from Cline's src/core/storage/connection.ts with ReadyAI-specific extensions
 * Provides robust SQLite connection management with connection pooling, lifecycle management,
 * and comprehensive health monitoring for ReadyAI's development orchestrator needs.
 * 
 * Key Features:
 * - SQLite connection pooling with WAL mode support
 * - Connection lifecycle management with graceful shutdown
 * - Health monitoring and error recovery
 * - Transaction support with ACID compliance
 * - Production-ready logging and telemetry integration
 * - Backup and migration coordination
 * - ReadyAI-specific database operations
 */

import { EventEmitter } from 'events';
import { existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import Database from 'better-sqlite3';

import { UUID } from '../../foundation/types/core';
import {
  DatabaseConfig,
  DatabaseHealth,
  TransactionOptions,
  DatabaseOperationResult,
  DEFAULT_DATABASE_CONFIG,
  DEFAULT_TRANSACTION_OPTIONS
} from '../types/database';

/**
 * Connection pool entry tracking SQLite database instances
 * Enhanced with health monitoring and usage statistics
 */
interface ConnectionPoolEntry {
  /** SQLite database instance */
  db: Database.Database;
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
}

/**
 * Connection statistics for monitoring and optimization
 */
interface ConnectionStats {
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
}

/**
 * DatabaseConnection Service
 * 
 * Manages SQLite database connections with pooling, health monitoring,
 * and ReadyAI-specific optimizations. Adapts Cline's proven connection
 * patterns while extending for ReadyAI's development orchestrator requirements.
 */
export class DatabaseConnection extends EventEmitter {
  private config: DatabaseConfig;
  private connectionPool: Map<string, ConnectionPoolEntry> = new Map();
  private stats: ConnectionStats = {
    totalConnections: 0,
    activeConnections: 0,
    failedConnections: 0,
    totalOperations: 0,
    averageResponseTime: 0
  };
  
  private isInitialized = false;
  private isShuttingDown = false;
  private healthCheckInterval?: NodeJS.Timeout;
  private backupInterval?: NodeJS.Timeout;
  
  // Performance tracking
  private responseTimes: number[] = [];
  private readonly MAX_RESPONSE_TIMES = 100;

  constructor(config: Partial<DatabaseConfig> = {}) {
    super();
    this.config = { ...DEFAULT_DATABASE_CONFIG, ...config };
    
    // Validate database path
    this.validateDatabasePath();
    
    // Set up event handlers
    this.setupEventHandlers();
  }

  /**
   * Initialize the database connection service
   * Sets up connection pool, health monitoring, and backup scheduling
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      throw new Error('DatabaseConnection is already initialized');
    }

    try {
      this.emit('initializing');
      
      // Ensure database directory exists
      this.ensureDatabaseDirectory();
      
      // Create primary connection
      await this.createConnection('primary');
      
      // Configure database settings
      await this.configureDatabaseSettings('primary');
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      // Schedule backups if configured
      if (this.config.backupInterval) {
        this.startBackupScheduling();
      }
      
      this.isInitialized = true;
      this.emit('initialized');
      
    } catch (error) {
      this.stats.failedConnections++;
      this.emit('error', error);
      throw new Error(`Failed to initialize DatabaseConnection: ${error.message}`);
    }
  }

  /**
   * Execute a database operation with connection management
   * Provides automatic retry, error handling, and performance tracking
   */
  public async execute<T>(
    operation: (db: Database.Database) => T,
    options: { 
      connectionId?: string;
      retries?: number;
      timeout?: number;
    } = {}
  ): Promise<T> {
    if (!this.isInitialized) {
      throw new Error('DatabaseConnection not initialized');
    }

    if (this.isShuttingDown) {
      throw new Error('DatabaseConnection is shutting down');
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
          () => operation(connection.db),
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
        
        // Retry logic
        if (attempt < retries && this.shouldRetry(error)) {
          await this.delay(Math.pow(2, attempt - 1) * 1000); // Exponential backoff
          continue;
        }
        
        this.emit('operationFailed', error, attempt);
        throw error;
      }
    }
  }

  /**
   * Execute a transaction with ACID compliance
   * Supports nested transactions via savepoints and comprehensive error handling
   */
  public async executeTransaction<T>(
    operations: (db: Database.Database) => T,
    options: TransactionOptions = DEFAULT_TRANSACTION_OPTIONS
  ): Promise<T> {
    return this.execute((db) => {
      // Begin transaction with specified mode
      const transaction = db.transaction(() => {
        return operations(db);
      });
      
      // Configure transaction options
      transaction.immediate = options.mode === 'IMMEDIATE';
      transaction.exclusive = options.mode === 'EXCLUSIVE';
      
      return transaction();
    }, { timeout: options.timeout });
  }

  /**
   * Get current database health status
   * Comprehensive health check including connection status and performance metrics
   */
  public async getHealth(): Promise<DatabaseHealth> {
    const health: DatabaseHealth = {
      isConnected: false,
      connectionCount: this.stats.activeConnections,
      lastQuery: '',
      responseTime: this.stats.averageResponseTime,
      errors: [],
      walMode: false,
      foreignKeys: false
    };

    try {
      if (!this.isInitialized) {
        health.errors.push('DatabaseConnection not initialized');
        return health;
      }

      const startTime = Date.now();
      
      // Test primary connection
      await this.execute((db) => {
        const result = db.prepare('SELECT 1 as test').get();
        health.lastQuery = 'SELECT 1 as test';
        health.isConnected = result && result.test === 1;
      });
      
      health.responseTime = Date.now() - startTime;
      
      // Check WAL mode
      await this.execute((db) => {
        const result = db.pragma('journal_mode');
        health.walMode = result === 'wal';
      });
      
      // Check foreign keys
      await this.execute((db) => {
        const result = db.pragma('foreign_keys');
        health.foreignKeys = result === 1;
      });
      
      // Collect connection-specific errors
      for (const [connectionId, connection] of this.connectionPool) {
        if (!connection.isHealthy) {
          health.errors.push(`Connection ${connectionId} is unhealthy (errors: ${connection.errorCount})`);
        }
      }
      
    } catch (error) {
      health.errors.push(`Health check failed: ${error.message}`);
    }

    return health;
  }

  /**
   * Get connection statistics for monitoring and optimization
   */
  public getStats(): ConnectionStats & { responseTimeHistory: number[] } {
    return {
      ...this.stats,
      responseTimeHistory: [...this.responseTimes]
    };
  }

  /**
   * Close specific connection or all connections
   * Graceful shutdown with pending operation completion
   */
  public async close(connectionId?: string): Promise<void> {
    if (connectionId) {
      await this.closeConnection(connectionId);
    } else {
      await this.closeAllConnections();
    }
  }

  /**
   * Shutdown the database connection service
   * Comprehensive cleanup with graceful operation completion
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
      
      if (this.backupInterval) {
        clearInterval(this.backupInterval);
      }
      
      // Wait for active operations to complete (with timeout)
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

  // Private Methods

  private validateDatabasePath(): void {
    if (!this.config.url || typeof this.config.url !== 'string') {
      throw new Error('Database URL must be a valid string');
    }
    
    // Resolve relative paths
    this.config.url = resolve(this.config.url);
  }

  private ensureDatabaseDirectory(): void {
    const dbDir = dirname(this.config.url);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }
  }

  private async createConnection(connectionId: string): Promise<ConnectionPoolEntry> {
    try {
      const db = new Database(this.config.url, {
        fileMustExist: false,
        timeout: this.config.connectionTimeout,
        verbose: process.env.NODE_ENV === 'development' ? console.log : undefined
      });

      const connection: ConnectionPoolEntry = {
        db,
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString(),
        activeOperations: 0,
        isHealthy: true,
        errorCount: 0
      };

      this.connectionPool.set(connectionId, connection);
      this.stats.totalConnections++;
      this.stats.activeConnections++;
      
      this.emit('connectionCreated', connectionId);
      
      return connection;
      
    } catch (error) {
      this.stats.failedConnections++;
      throw new Error(`Failed to create connection ${connectionId}: ${error.message}`);
    }
  }

  private async configureDatabaseSettings(connectionId: string): Promise<void> {
    const connection = this.connectionPool.get(connectionId);
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    const { db } = connection;

    // Enable WAL mode for better concurrency
    if (this.config.enableWAL) {
      db.pragma('journal_mode = WAL');
    }

    // Enable foreign key constraints
    if (this.config.enableForeignKeys) {
      db.pragma('foreign_keys = ON');
    }

    // Set busy timeout
    db.pragma(`busy_timeout = ${this.config.busyTimeout}`);

    // Apply custom pragma settings
    if (this.config.pragma) {
      for (const [key, value] of Object.entries(this.config.pragma)) {
        db.pragma(`${key} = ${value}`);
      }
    }
  }

  private async getConnection(connectionId: string): Promise<ConnectionPoolEntry> {
    let connection = this.connectionPool.get(connectionId);
    
    if (!connection || !connection.isHealthy) {
      // Recreate unhealthy connections
      if (connection && !connection.isHealthy) {
        await this.closeConnection(connectionId);
      }
      
      connection = await this.createConnection(connectionId);
      await this.configureDatabaseSettings(connectionId);
    }
    
    return connection;
  }

  private async executeWithTimeout<T>(
    operation: () => T,
    timeout: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeout}ms`));
      }, timeout);

      try {
        const result = operation();
        clearTimeout(timer);
        resolve(result);
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  private shouldRetry(error: any): boolean {
    // Retry on connection errors, timeout errors, or database locked errors
    const retryableErrors = [
      'SQLITE_BUSY',
      'SQLITE_LOCKED',
      'SQLITE_PROTOCOL',
      'timeout',
      'connection'
    ];
    
    const errorMessage = error.message?.toLowerCase() || '';
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
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.getHealth();
        
        if (!health.isConnected || health.errors.length > 0) {
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
    }, 30000); // Check every 30 seconds
  }

  private startBackupScheduling(): void {
    this.backupInterval = setInterval(() => {
      this.emit('backupScheduled');
    }, this.config.backupInterval! * 1000);
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
      connection.db.close();
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
    console.warn('DatabaseConnection: Timeout waiting for active operations to complete');
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
 * Default DatabaseConnection instance factory
 * Provides a singleton pattern for application-wide database connectivity
 */
let defaultInstance: DatabaseConnection | null = null;

export function createDatabaseConnection(config?: Partial<DatabaseConfig>): DatabaseConnection {
  return new DatabaseConnection(config);
}

export function getDefaultDatabaseConnection(config?: Partial<DatabaseConfig>): DatabaseConnection {
  if (!defaultInstance) {
    defaultInstance = new DatabaseConnection(config);
  }
  return defaultInstance;
}

export function resetDefaultDatabaseConnection(): void {
  if (defaultInstance) {
    defaultInstance.shutdown();
    defaultInstance = null;
  }
}

// Export types and constants for external use
export type {
  ConnectionPoolEntry,
  ConnectionStats
};

export {
  DEFAULT_DATABASE_CONFIG,
  DEFAULT_TRANSACTION_OPTIONS
};
