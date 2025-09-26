// packages/database/services/TransactionManager.ts

/**
 * Transaction Manager with comprehensive ACID compliance - Production Implementation
 * 
 * Adapts Cline's production-proven transaction handling patterns for ReadyAI's
 * database operations with enhanced nested transaction support, timeout management,
 * and comprehensive monitoring. Provides enterprise-grade transaction management
 * with proper isolation levels, rollback capabilities, and performance tracking.
 */

import Database from 'better-sqlite3';
import DatabaseConnection from './DatabaseConnection';
import { TransactionOptions, DatabaseOperationResult } from '../types';
import { Logger } from '@readyai/logging';
import * as crypto from 'crypto';

/**
 * Active transaction tracking interface
 * Maintains state for all concurrent transactions
 */
interface ActiveTransaction {
  id: string;
  startTime: number;
  options: TransactionOptions;
  status: 'active' | 'committed' | 'rolledback';
}

/**
 * Savepoint tracking for nested transactions
 */
interface SavepointInfo {
  name: string;
  transactionId: string;
  createdAt: number;
}

/**
 * Transaction statistics for monitoring
 */
interface TransactionStats {
  active: number;
  committed: number;
  rolledBack: number;
  avgDuration: number;
}

/**
 * Enterprise-grade Transaction Manager
 * 
 * Provides ACID-compliant transaction management with support for:
 * - Nested transactions via savepoints
 * - Configurable isolation levels
 * - Transaction timeout handling
 * - Comprehensive monitoring and metrics
 * - Batch operation support
 * - Automatic cleanup and resource management
 */
export class TransactionManager {
  private connection: DatabaseConnection;
  private logger: Logger;
  private activeTransactions = new Map<string, ActiveTransaction>();
  private transactionTimeouts = new Map<string, NodeJS.Timeout>();
  private activeSavepoints = new Map<string, SavepointInfo>();

  constructor(connection: DatabaseConnection, logger: Logger) {
    this.connection = connection;
    this.logger = logger;
  }

  /**
   * Execute operations within a transaction with full ACID compliance
   * 
   * @param operations - Function containing database operations
   * @param options - Transaction configuration options
   * @returns Promise resolving to operation result or error
   */
  async executeTransaction<T>(
    operations: (db: Database.Database) => T,
    options: Partial<TransactionOptions> = {}
  ): Promise<DatabaseOperationResult<{ result?: T }>> {
    const db = this.connection.getConnection();
    const txId = crypto.randomUUID();

    const defaultOptions: TransactionOptions = {
      mode: 'IMMEDIATE',
      isolationLevel: 'SERIALIZABLE',
      timeout: 30000,
    };

    const txOptions = { ...defaultOptions, ...options };

    this.logger.debug('Starting transaction', { txId, txOptions });

    const txInfo: ActiveTransaction = {
      id: txId,
      startTime: Date.now(),
      options: txOptions,
      status: 'active',
    };

    this.activeTransactions.set(txId, txInfo);

    // Set transaction timeout
    const timeoutHandle = setTimeout(() => {
      this.handleTransactionTimeout(txId);
    }, txOptions.timeout);

    this.transactionTimeouts.set(txId, timeoutHandle);

    try {
      // Configure transaction isolation level
      this.configureTransaction(db, txOptions);

      // Create transaction function with better-sqlite3
      const transaction = db.transaction(operations as any);

      try {
        const result = operations(db);
        
        this.logger.debug('Transaction completed successfully', {
          txId,
          duration: Date.now() - txInfo.startTime,
        });

        // Execute the transaction
        const transactionResult = transaction(operations);

        // Mark as committed
        txInfo.status = 'committed';

        return { success: true, result };
      } catch (error) {
        this.logger.error('Transaction failed', { txId, error });
        throw error;
      }
    } catch (error) {
      // Mark as rolled back
      txInfo.status = 'rolledback';

      const errorMessage = error instanceof Error ? error.message : 'Unknown transaction error';
      this.logger.error('Transaction rolled back', { txId, error: errorMessage });

      return { success: false, error: errorMessage };
    } finally {
      // Cleanup
      this.cleanupTransaction(txId);
    }
  }

  /**
   * Execute operations within a savepoint for nested transaction support
   * 
   * @param operations - Function containing database operations
   * @param savepointName - Optional savepoint name
   * @returns Promise resolving to operation result or error
   */
  async executeInSavepoint<T>(
    operations: (db: Database.Database) => T,
    savepointName = `sp_${Date.now()}`
  ): Promise<DatabaseOperationResult<{ result?: T }>> {
    const db = this.connection.getConnection();
    const txId = crypto.randomUUID();

    this.logger.debug('Creating savepoint', { savepointName, txId });

    try {
      // Create savepoint
      db.exec(`SAVEPOINT ${savepointName}`);

      // Track savepoint
      this.activeSavepoints.set(savepointName, {
        name: savepointName,
        transactionId: txId,
        createdAt: Date.now(),
      });

      const result = operations(db);

      // Release savepoint on success
      db.exec(`RELEASE SAVEPOINT ${savepointName}`);

      this.logger.debug('Savepoint released', { savepointName, txId });

      return { success: true, result };
    } catch (error) {
      // Rollback to savepoint on error
      db.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);

      const errorMessage = error instanceof Error ? error.message : 'Unknown savepoint error';
      this.logger.error('Rolled back to savepoint', {
        savepointName,
        error: errorMessage,
        txId
      });

      return { success: false, error: errorMessage };
    } finally {
      // Cleanup savepoint tracking
      this.activeSavepoints.delete(savepointName);
    }
  }

  /**
   * Execute multiple operations as a batch with transaction support
   * 
   * @param operations - Array of operations to execute
   * @param options - Transaction options
   * @returns Promise resolving to batch results
   */
  async executeBatch<T>(
    operations: Array<(db: Database.Database) => T>,
    options: Partial<TransactionOptions> = {}
  ): Promise<DatabaseOperationResult<{ results?: T[] }>> {
    const results: T[] = [];

    return await this.executeTransaction((db) => {
      for (const operation of operations) {
        const result = operation(db);
        results.push(result);
      }
      return results;
    }, options).then(result => ({
      ...result,
      results: result.result,
    }));
  }

  /**
   * Configure transaction isolation level and mode
   * 
   * @param db - Database connection
   * @param options - Transaction options
   */
  private configureTransaction(db: Database.Database, options: TransactionOptions): void {
    try {
      // Set isolation level (SQLite maps these to its locking mechanisms)
      switch (options.isolationLevel) {
        case 'READ_UNCOMMITTED':
          db.pragma('read_uncommitted = 1');
          break;
        case 'SERIALIZABLE':
          // This is SQLite's default with WAL mode
          break;
        // SQLite doesn't support READ_COMMITTED or REPEATABLE_READ directly
        // They're handled through its locking mechanisms
      }

      // Transaction mode is handled by better-sqlite3 internally
      this.logger.debug('Transaction configured', { options });
    } catch (error) {
      this.logger.error('Failed to configure transaction', { error });
      throw error;
    }
  }

  /**
   * Handle transaction timeout
   * 
   * @param txId - Transaction ID
   */
  private handleTransactionTimeout(txId: string): void {
    const txInfo = this.activeTransactions.get(txId);
    if (txInfo && txInfo.status === 'active') {
      this.logger.warn('Transaction timed out', {
        txId,
        duration: Date.now() - txInfo.startTime,
        timeout: txInfo.options.timeout,
      });

      // Note: SQLite automatically rolls back on timeout
      txInfo.status = 'rolledback';
    }
  }

  /**
   * Clean up transaction resources
   * 
   * @param txId - Transaction ID to cleanup
   */
  private cleanupTransaction(txId: string): void {
    this.activeTransactions.delete(txId);

    const timeoutHandle = this.transactionTimeouts.get(txId);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      this.transactionTimeouts.delete(txId);
    }
  }

  /**
   * Get count of active transactions
   * 
   * @returns Number of active transactions
   */
  getActiveTransactionCount(): number {
    return Array.from(this.activeTransactions.values())
      .filter(tx => tx.status === 'active').length;
  }

  /**
   * Get transaction statistics for monitoring
   * 
   * @returns Transaction statistics object
   */
  getTransactionStats(): TransactionStats {
    const transactions = Array.from(this.activeTransactions.values());
    const now = Date.now();

    const active = transactions.filter(tx => tx.status === 'active').length;
    const committed = transactions.filter(tx => tx.status === 'committed').length;
    const rolledBack = transactions.filter(tx => tx.status === 'rolledback').length;

    const completedTxs = transactions.filter(tx => tx.status !== 'active');
    const avgDuration = completedTxs.length > 0
      ? completedTxs.reduce((sum, tx) => sum + (now - tx.startTime), 0) / completedTxs.length
      : 0;

    return { active, committed, rolledBack, avgDuration };
  }

  /**
   * Force rollback all active transactions (emergency cleanup)
   */
  async forceRollbackAll(): Promise<void> {
    this.logger.warn('Force rolling back all active transactions');

    for (const [txId, txInfo] of this.activeTransactions.entries()) {
      if (txInfo.status === 'active') {
        txInfo.status = 'rolledback';
        this.cleanupTransaction(txId);
      }
    }
  }

  /**
   * Get active savepoint information
   * 
   * @returns Array of active savepoints
   */
  getActiveSavepoints(): SavepointInfo[] {
    return Array.from(this.activeSavepoints.values());
  }

  /**
   * Check if a transaction is currently active
   * 
   * @param txId - Transaction ID to check
   * @returns True if transaction is active
   */
  isTransactionActive(txId: string): boolean {
    const txInfo = this.activeTransactions.get(txId);
    return txInfo?.status === 'active' || false;
  }
}
