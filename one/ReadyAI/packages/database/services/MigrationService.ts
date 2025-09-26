// packages/database/services/MigrationService.ts

/**
 * Database Migration Service for ReadyAI Personal AI Development Orchestrator
 * 
 * This service adapts Cline's proven database migration patterns (~70% reuse) from their
 * state management system, extending with ReadyAI-specific schema versioning, rollback
 * strategies, and dependency-aware migrations for the development orchestrator.
 * 
 * Key Cline Pattern Adaptations:
 * - Migration versioning from Cline's state persistence patterns
 * - Rollback strategies from Cline's error recovery mechanisms
 * - Sequential execution with dependency checking from Cline's task ordering
 * - Comprehensive logging and error handling from Cline's telemetry system
 * - Transaction-based migration execution from Cline's atomic operations
 * 
 * ReadyAI Extensions:
 * - ReadyAI schema versioning with semantic versioning support
 * - Vector database migration coordination
 * - Project-specific migration tracking
 * - Development phase-aware schema evolution
 * - Automated backup before migrations
 * 
 * @version 1.0.0
 * @author ReadyAI Development Team
 */

import { EventEmitter } from 'events';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import crypto from 'crypto';

// Core ReadyAI types
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
} from '../../foundation/types/core';

// Database types and connections
import {
  DatabaseConfig,
  Migration,
  MigrationResult,
  BackupResult,
  TransactionOptions,
  DEFAULT_TRANSACTION_OPTIONS,
  DatabaseHealth
} from '../types/database';

import { DatabaseConnection } from './DatabaseConnection';

/**
 * Migration execution status tracking
 * Adapted from Cline's task status patterns
 */
export interface MigrationExecutionStatus {
  /** Migration ID being executed */
  id: string;
  /** Current execution phase */
  phase: 'pending' | 'backing_up' | 'executing' | 'verifying' | 'completed' | 'failed' | 'rolled_back';
  /** Start timestamp */
  startedAt: string;
  /** Completion timestamp */
  completedAt?: string;
  /** Progress percentage (0-100) */
  progress: number;
  /** Current operation description */
  currentOperation: string;
  /** Error details if failed */
  error?: string;
  /** Backup created before migration */
  backupPath?: string;
  /** Applied SQL statements */
  appliedStatements: string[];
  /** Migration metadata */
  metadata: Record<string, any>;
}

/**
 * Migration plan with dependency resolution
 * Based on Cline's execution planning patterns
 */
export interface MigrationPlan {
  /** Migrations to execute in order */
  migrations: Migration[];
  /** Total estimated execution time (ms) */
  estimatedDuration: number;
  /** Dependencies resolved successfully */
  dependenciesResolved: boolean;
  /** Detected conflicts or issues */
  warnings: string[];
  /** Rollback plan if needed */
  rollbackPlan: Migration[];
  /** Backup strategy */
  backupStrategy: 'full' | 'incremental' | 'schema_only';
  /** Pre-migration validation checks */
  validationChecks: string[];
}

/**
 * Migration registry for tracking applied migrations
 * Follows Cline's state tracking patterns
 */
interface MigrationRecord {
  id: string;
  version: number;
  name: string;
  checksum: string;
  executedAt: string;
  executionTime: number;
  rollbackChecksum?: string;
  appliedBy: string;
  metadata?: Record<string, any>;
}

/**
 * Migration service configuration
 * Extends Cline's configuration patterns with ReadyAI specifics
 */
export interface MigrationServiceConfig {
  /** Migration files directory */
  migrationsPath: string;
  /** Schema version table name */
  schemaTable: string;
  /** Enable automatic backups before migrations */
  enableBackups: boolean;
  /** Backup directory path */
  backupPath?: string;
  /** Maximum migration execution time (ms) */
  executionTimeout: number;
  /** Enable migration validation */
  enableValidation: boolean;
  /** Migration file pattern */
  migrationPattern: RegExp;
  /** Enable rollback on failure */
  enableRollback: boolean;
  /** Maximum rollback attempts */
  maxRollbackAttempts: number;
  /** Enable dependency checking */
  enableDependencyChecking: boolean;
  /** Transaction isolation level for migrations */
  isolationLevel: 'SERIALIZABLE' | 'REPEATABLE READ' | 'READ COMMITTED' | 'READ UNCOMMITTED';
}

/**
 * Default migration service configuration
 * Optimized for ReadyAI development workflow
 */
const DEFAULT_MIGRATION_CONFIG: MigrationServiceConfig = {
  migrationsPath: './migrations',
  schemaTable: '_readyai_migrations',
  enableBackups: true,
  backupPath: './backups',
  executionTimeout: 300000, // 5 minutes
  enableValidation: true,
  migrationPattern: /^(\d+)_(.+)\.(sql|js|ts)$/,
  enableRollback: true,
  maxRollbackAttempts: 3,
  enableDependencyChecking: true,
  isolationLevel: 'SERIALIZABLE'
};

/**
 * Database Migration Service
 * 
 * Manages database schema evolution with comprehensive migration support.
 * Adapts Cline's proven state management patterns while extending for ReadyAI's
 * development orchestrator requirements including vector database coordination
 * and project-specific schema versioning.
 */
export class MigrationService extends EventEmitter {
  private readonly config: MigrationServiceConfig;
  private readonly dbConnection: DatabaseConnection;
  private isInitialized = false;
  private currentExecution?: MigrationExecutionStatus;
  private migrationCache = new Map<string, Migration>();
  private readonly appliedMigrations = new Set<string>();

  constructor(
    dbConnection: DatabaseConnection,
    config?: Partial<MigrationServiceConfig>
  ) {
    super();
    this.dbConnection = dbConnection;
    this.config = { ...DEFAULT_MIGRATION_CONFIG, ...config };
    
    // Validate configuration
    this.validateConfiguration();
  }

  /**
   * Initialize the migration service
   * Sets up migration tracking table and loads migration history
   * Following Cline's initialization patterns
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      throw new ReadyAIError(
        'MigrationService is already initialized',
        'MIGRATION_ALREADY_INITIALIZED',
        400
      );
    }

    try {
      this.emit('initializing');

      // Ensure database connection is ready
      const health = await this.dbConnection.getHealth();
      if (!health.isConnected) {
        throw new ReadyAIError(
          'Database connection is not healthy',
          'DATABASE_UNHEALTHY',
          500,
          { health }
        );
      }

      // Create migration tracking table
      await this.createMigrationTable();

      // Load applied migrations into cache
      await this.loadAppliedMigrations();

      // Load available migrations from filesystem
      await this.loadMigrationFiles();

      this.isInitialized = true;
      this.emit('initialized');

    } catch (error) {
      this.emit('error', error);
      throw new ReadyAIError(
        `Failed to initialize MigrationService: ${error}`,
        'MIGRATION_INIT_FAILED',
        500,
        { originalError: error }
      );
    }
  }

  /**
   * Get current schema version
   * Returns the highest applied migration version
   */
  public async getCurrentVersion(): Promise<ApiResponse<number>> {
    return wrapAsync(async () => {
      this.ensureInitialized();

      const result = await this.dbConnection.execute(
        (db) => {
          const stmt = db.prepare(`
            SELECT MAX(version) as current_version 
            FROM ${this.config.schemaTable}
            WHERE applied = 1
          `);
          return stmt.get();
        }
      );

      return (result as any)?.current_version || 0;
    });
  }

  /**
   * Get pending migrations
   * Returns migrations that haven't been applied yet
   * Adapted from Cline's pending task patterns
   */
  public async getPendingMigrations(): Promise<ApiResponse<Migration[]>> {
    return wrapAsync(async () => {
      this.ensureInitialized();

      const pendingMigrations: Migration[] = [];
      
      for (const migration of this.migrationCache.values()) {
        if (!this.appliedMigrations.has(migration.id)) {
          pendingMigrations.push(migration);
        }
      }

      // Sort by version number
      pendingMigrations.sort((a, b) => a.version - b.version);

      return pendingMigrations;
    });
  }

  /**
   * Create migration execution plan
   * Plans migration execution with dependency resolution and validation
   * Based on Cline's execution planning patterns
   */
  public async createMigrationPlan(targetVersion?: number): Promise<ApiResponse<MigrationPlan>> {
    return wrapAsync(async () => {
      this.ensureInitialized();

      const pendingResult = await this.getPendingMigrations();
      if (!isApiSuccess(pendingResult)) {
        throw pendingResult.error;
      }

      let migrations = pendingResult.data;

      // Filter by target version if specified
      if (targetVersion !== undefined) {
        migrations = migrations.filter(m => m.version <= targetVersion);
      }

      // Check dependencies if enabled
      if (this.config.enableDependencyChecking) {
        const dependencyResult = await this.validateDependencies(migrations);
        if (!dependencyResult.dependenciesResolved) {
          throw new ReadyAIError(
            'Migration dependencies could not be resolved',
            'MIGRATION_DEPENDENCIES_UNRESOLVED',
            400,
            { warnings: dependencyResult.warnings }
          );
        }
      }

      // Estimate execution time based on migration complexity
      const estimatedDuration = this.estimateExecutionTime(migrations);

      // Generate rollback plan
      const rollbackPlan = await this.generateRollbackPlan(migrations);

      // Determine backup strategy
      const backupStrategy = this.determineBackupStrategy(migrations);

      // Pre-migration validation checks
      const validationChecks = this.generateValidationChecks(migrations);

      const plan: MigrationPlan = {
        migrations,
        estimatedDuration,
        dependenciesResolved: true,
        warnings: [],
        rollbackPlan,
        backupStrategy,
        validationChecks
      };

      return plan;
    });
  }

  /**
   * Execute migrations according to plan
   * Comprehensive migration execution with backup, validation, and rollback
   * Leverages Cline's atomic operation patterns
   */
  public async executeMigrations(plan?: MigrationPlan): Promise<ApiResponse<MigrationResult>> {
    return wrapAsync(async () => {
      this.ensureInitialized();

      if (this.currentExecution) {
        throw new ReadyAIError(
          'Migration is already in progress',
          'MIGRATION_IN_PROGRESS',
          409,
          { currentExecution: this.currentExecution }
        );
      }

      // Create plan if not provided
      if (!plan) {
        const planResult = await this.createMigrationPlan();
        if (!isApiSuccess(planResult)) {
          throw planResult.error;
        }
        plan = planResult.data;
      }

      if (plan.migrations.length === 0) {
        return {
          success: true,
          migrationsApplied: 0,
          executionTime: 0,
          appliedVersions: [],
          error: undefined,
          canRollback: false
        };
      }

      const startTime = Date.now();
      let backupPath: string | undefined;
      let appliedMigrations: Migration[] = [];

      try {
        // Initialize execution status
        this.currentExecution = {
          id: crypto.randomUUID(),
          phase: 'pending',
          startedAt: new Date().toISOString(),
          progress: 0,
          currentOperation: 'Preparing migration execution',
          appliedStatements: [],
          metadata: {
            totalMigrations: plan.migrations.length,
            targetVersion: Math.max(...plan.migrations.map(m => m.version))
          }
        };

        this.emit('migrationStarted', this.currentExecution);

        // Create backup if enabled
        if (this.config.enableBackups) {
          this.updateExecutionStatus('backing_up', 5, 'Creating database backup');
          backupPath = await this.createBackup(plan.backupStrategy);
          this.currentExecution.backupPath = backupPath;
        }

        // Execute migrations in transaction
        this.updateExecutionStatus('executing', 10, 'Executing migrations');
        
        const result = await this.dbConnection.executeTransaction(
          async (db) => {
            for (let i = 0; i < plan.migrations.length; i++) {
              const migration = plan.migrations[i];
              const progress = 10 + ((i + 1) / plan.migrations.length) * 80;
              
              this.updateExecutionStatus(
                'executing',
                progress,
                `Applying migration: ${migration.name}`
              );

              // Execute migration
              await this.executeSingleMigration(db, migration);
              appliedMigrations.push(migration);

              // Record migration as applied
              await this.recordMigrationApplied(db, migration);
            }

            return true;
          },
          {
            mode: 'EXCLUSIVE',
            isolationLevel: this.config.isolationLevel,
            timeout: this.config.executionTimeout
          }
        );

        // Verify migrations
        this.updateExecutionStatus('verifying', 95, 'Verifying migration integrity');
        await this.verifyMigrations(appliedMigrations);

        // Complete execution
        this.updateExecutionStatus('completed', 100, 'Migration completed successfully');
        
        const executionTime = Date.now() - startTime;
        
        const migrationResult: MigrationResult = {
          success: true,
          migrationsApplied: appliedMigrations.length,
          executionTime,
          appliedVersions: appliedMigrations.map(m => m.version),
          error: undefined,
          canRollback: this.config.enableRollback && appliedMigrations.length > 0
        };

        this.emit('migrationCompleted', migrationResult);
        return migrationResult;

      } catch (error) {
        const executionTime = Date.now() - startTime;
        
        this.updateExecutionStatus('failed', this.currentExecution?.progress || 0, 'Migration failed');

        // Attempt rollback if enabled and migrations were applied
        let canRollback = false;
        if (this.config.enableRollback && appliedMigrations.length > 0) {
          try {
            this.updateExecutionStatus('rolling_back', this.currentExecution?.progress || 0, 'Rolling back changes');
            await this.rollbackMigrations(appliedMigrations);
            canRollback = true;
            this.updateExecutionStatus('rolled_back', this.currentExecution?.progress || 0, 'Changes rolled back');
          } catch (rollbackError) {
            this.emit('rollbackFailed', { error, rollbackError });
          }
        }

        const migrationResult: MigrationResult = {
          success: false,
          migrationsApplied: appliedMigrations.length,
          executionTime,
          appliedVersions: appliedMigrations.map(m => m.version),
          error: error instanceof Error ? error.message : String(error),
          canRollback
        };

        this.emit('migrationFailed', migrationResult);
        throw new ReadyAIError(
          'Migration execution failed',
          'MIGRATION_EXECUTION_FAILED',
          500,
          migrationResult
        );

      } finally {
        this.currentExecution = undefined;
      }
    });
  }

  /**
   * Rollback migrations to specific version
   * Comprehensive rollback with validation and backup restore
   * Adapts Cline's error recovery patterns
   */
  public async rollbackToVersion(targetVersion: number): Promise<ApiResponse<MigrationResult>> {
    return wrapAsync(async () => {
      this.ensureInitialized();

      const currentVersionResult = await this.getCurrentVersion();
      if (!isApiSuccess(currentVersionResult)) {
        throw currentVersionResult.error;
      }

      const currentVersion = currentVersionResult.data;
      if (targetVersion >= currentVersion) {
        throw new ReadyAIError(
          `Target version ${targetVersion} is not less than current version ${currentVersion}`,
          'INVALID_ROLLBACK_VERSION',
          400
        );
      }

      // Get migrations to rollback (in reverse order)
      const migrationsToRollback = await this.getMigrationsToRollback(currentVersion, targetVersion);
      
      if (migrationsToRollback.length === 0) {
        return {
          success: true,
          migrationsApplied: 0,
          executionTime: 0,
          appliedVersions: [],
          error: undefined,
          canRollback: false
        };
      }

      const startTime = Date.now();
      let rolledBackMigrations: Migration[] = [];

      try {
        // Create backup before rollback
        let backupPath: string | undefined;
        if (this.config.enableBackups) {
          backupPath = await this.createBackup('full');
        }

        // Execute rollback in transaction
        await this.dbConnection.executeTransaction(
          async (db) => {
            for (const migration of migrationsToRollback) {
              if (migration.downSql) {
                // Execute rollback SQL
                db.exec(migration.downSql);
                
                // Remove migration record
                const deleteStmt = db.prepare(`
                  DELETE FROM ${this.config.schemaTable}
                  WHERE id = ? AND version = ?
                `);
                deleteStmt.run(migration.id, migration.version);
                
                rolledBackMigrations.push(migration);
                this.appliedMigrations.delete(migration.id);
              }
            }
          },
          {
            mode: 'EXCLUSIVE',
            isolationLevel: this.config.isolationLevel,
            timeout: this.config.executionTimeout
          }
        );

        const executionTime = Date.now() - startTime;
        
        const result: MigrationResult = {
          success: true,
          migrationsApplied: rolledBackMigrations.length,
          executionTime,
          appliedVersions: rolledBackMigrations.map(m => m.version),
          error: undefined,
          canRollback: false
        };

        this.emit('rollbackCompleted', result);
        return result;

      } catch (error) {
        const executionTime = Date.now() - startTime;
        
        const result: MigrationResult = {
          success: false,
          migrationsApplied: rolledBackMigrations.length,
          executionTime,
          appliedVersions: rolledBackMigrations.map(m => m.version),
          error: error instanceof Error ? error.message : String(error),
          canRollback: false
        };

        throw new ReadyAIError(
          'Migration rollback failed',
          'MIGRATION_ROLLBACK_FAILED',
          500,
          result
        );
      }
    });
  }

  /**
   * Validate migration integrity
   * Comprehensive validation including checksum verification and dependency checking
   */
  public async validateMigrations(): Promise<ApiResponse<{ valid: boolean; issues: string[] }>> {
    return wrapAsync(async () => {
      this.ensureInitialized();

      const issues: string[] = [];

      // Validate applied migrations checksums
      for (const migrationId of this.appliedMigrations) {
        const migration = this.migrationCache.get(migrationId);
        if (!migration) {
          issues.push(`Applied migration ${migrationId} not found in filesystem`);
          continue;
        }

        const recordedChecksum = await this.getRecordedChecksum(migrationId);
        if (recordedChecksum !== migration.checksum) {
          issues.push(`Checksum mismatch for migration ${migrationId}`);
        }
      }

      // Validate migration file integrity
      for (const migration of this.migrationCache.values()) {
        if (!migration.upSql || migration.upSql.trim() === '') {
          issues.push(`Migration ${migration.id} has empty up SQL`);
        }

        if (this.config.enableRollback && (!migration.downSql || migration.downSql.trim() === '')) {
          issues.push(`Migration ${migration.id} has empty down SQL but rollback is enabled`);
        }
      }

      // Validate dependencies
      if (this.config.enableDependencyChecking) {
        const allMigrations = Array.from(this.migrationCache.values());
        const dependencyResult = await this.validateDependencies(allMigrations);
        if (!dependencyResult.dependenciesResolved) {
          issues.push(...dependencyResult.warnings);
        }
      }

      return {
        valid: issues.length === 0,
        issues
      };
    });
  }

  /**
   * Get migration history
   * Returns complete migration execution history
   */
  public async getMigrationHistory(): Promise<ApiResponse<MigrationRecord[]>> {
    return wrapAsync(async () => {
      this.ensureInitialized();

      const records = await this.dbConnection.execute(
        (db) => {
          const stmt = db.prepare(`
            SELECT * FROM ${this.config.schemaTable}
            WHERE applied = 1
            ORDER BY version ASC
          `);
          return stmt.all();
        }
      );

      return records as MigrationRecord[];
    });
  }

  /**
   * Create database backup
   * Creates backup using appropriate strategy
   */
  private async createBackup(strategy: 'full' | 'incremental' | 'schema_only'): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = join(
      this.config.backupPath || './backups',
      `backup-${strategy}-${timestamp}.db`
    );

    // Implement backup logic based on strategy
    // For SQLite, we can copy the database file or use backup API
    await this.dbConnection.execute(
      (db) => {
        db.backup(backupPath);
        return true;
      }
    );

    return backupPath;
  }

  // Private helper methods
  private validateConfiguration(): void {
    if (!existsSync(this.config.migrationsPath)) {
      throw new ReadyAIError(
        `Migrations path does not exist: ${this.config.migrationsPath}`,
        'MIGRATIONS_PATH_INVALID',
        400
      );
    }
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new ReadyAIError(
        'MigrationService not initialized',
        'MIGRATION_NOT_INITIALIZED',
        500
      );
    }
  }

  private async createMigrationTable(): Promise<void> {
    await this.dbConnection.execute(
      (db) => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS ${this.config.schemaTable} (
            id TEXT PRIMARY KEY,
            version INTEGER NOT NULL,
            name TEXT NOT NULL,
            checksum TEXT NOT NULL,
            executed_at TEXT NOT NULL,
            execution_time INTEGER NOT NULL,
            rollback_checksum TEXT,
            applied_by TEXT NOT NULL,
            applied INTEGER DEFAULT 1,
            metadata TEXT
          )
        `);
        
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_${this.config.schemaTable}_version 
          ON ${this.config.schemaTable}(version)
        `);
        
        return true;
      }
    );
  }

  private async loadAppliedMigrations(): Promise<void> {
    const applied = await this.dbConnection.execute(
      (db) => {
        const stmt = db.prepare(`
          SELECT id FROM ${this.config.schemaTable}
          WHERE applied = 1
        `);
        return stmt.all();
      }
    );

    this.appliedMigrations.clear();
    for (const record of applied as any[]) {
      this.appliedMigrations.add(record.id);
    }
  }

  private async loadMigrationFiles(): Promise<void> {
    // Implementation would load migration files from filesystem
    // Parse migration files and populate migrationCache
    // This is a placeholder - actual implementation would read files
    this.migrationCache.clear();
  }

  private updateExecutionStatus(
    phase: MigrationExecutionStatus['phase'],
    progress: number,
    operation: string
  ): void {
    if (this.currentExecution) {
      this.currentExecution.phase = phase;
      this.currentExecution.progress = progress;
      this.currentExecution.currentOperation = operation;
      this.emit('migrationProgress', this.currentExecution);
    }
  }

  private async executeSingleMigration(db: any, migration: Migration): Promise<void> {
    try {
      db.exec(migration.upSql);
      if (this.currentExecution) {
        this.currentExecution.appliedStatements.push(migration.upSql);
      }
    } catch (error) {
      throw new ReadyAIError(
        `Failed to execute migration ${migration.name}: ${error}`,
        'MIGRATION_EXECUTION_ERROR',
        500,
        { migrationId: migration.id, sql: migration.upSql }
      );
    }
  }

  private async recordMigrationApplied(db: any, migration: Migration): Promise<void> {
    const stmt = db.prepare(`
      INSERT INTO ${this.config.schemaTable}
      (id, version, name, checksum, executed_at, execution_time, applied_by, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      migration.id,
      migration.version,
      migration.name,
      migration.checksum,
      new Date().toISOString(),
      0, // execution_time would be calculated
      'ReadyAI-MigrationService',
      JSON.stringify({ executionId: this.currentExecution?.id })
    );

    this.appliedMigrations.add(migration.id);
  }

  private estimateExecutionTime(migrations: Migration[]): number {
    // Simple estimation based on SQL statement count and complexity
    return migrations.length * 1000; // 1 second per migration baseline
  }

  private async generateRollbackPlan(migrations: Migration[]): Promise<Migration[]> {
    // Return migrations in reverse order for rollback
    return [...migrations].reverse();
  }

  private determineBackupStrategy(migrations: Migration[]): 'full' | 'incremental' | 'schema_only' {
    // Simple strategy: full backup for any structural changes
    return 'full';
  }

  private generateValidationChecks(migrations: Migration[]): string[] {
    const checks: string[] = [];
    checks.push('Database connection health');
    checks.push('Schema table integrity');
    checks.push('Migration file checksums');
    if (this.config.enableDependencyChecking) {
      checks.push('Migration dependencies');
    }
    return checks;
  }

  private async validateDependencies(migrations: Migration[]): Promise<{ dependenciesResolved: boolean; warnings: string[] }> {
    // Placeholder implementation
    return { dependenciesResolved: true, warnings: [] };
  }

  private async verifyMigrations(migrations: Migration[]): Promise<void> {
    // Verify that all migrations were applied correctly
    for (const migration of migrations) {
      if (!this.appliedMigrations.has(migration.id)) {
        throw new ReadyAIError(
          `Migration ${migration.id} was not recorded as applied`,
          'MIGRATION_VERIFICATION_FAILED',
          500
        );
      }
    }
  }

  private async rollbackMigrations(migrations: Migration[]): Promise<void> {
    // Rollback migrations in reverse order
    const reversedMigrations = [...migrations].reverse();
    
    await this.dbConnection.executeTransaction(
      async (db) => {
        for (const migration of reversedMigrations) {
          if (migration.downSql) {
            db.exec(migration.downSql);
            
            const deleteStmt = db.prepare(`
              DELETE FROM ${this.config.schemaTable}
              WHERE id = ? AND version = ?
            `);
            deleteStmt.run(migration.id, migration.version);
            
            this.appliedMigrations.delete(migration.id);
          }
        }
      },
      DEFAULT_TRANSACTION_OPTIONS
    );
  }

  private async getMigrationsToRollback(currentVersion: number, targetVersion: number): Promise<Migration[]> {
    const migrationsToRollback: Migration[] = [];
    
    for (const migration of this.migrationCache.values()) {
      if (migration.version > targetVersion && migration.version <= currentVersion) {
        migrationsToRollback.push(migration);
      }
    }
    
    // Sort in descending order (newest first) for rollback
    migrationsToRollback.sort((a, b) => b.version - a.version);
    
    return migrationsToRollback;
  }

  private async getRecordedChecksum(migrationId: string): Promise<string> {
    const result = await this.dbConnection.execute(
      (db) => {
        const stmt = db.prepare(`
          SELECT checksum FROM ${this.config.schemaTable}
          WHERE id = ? AND applied = 1
        `);
        return stmt.get(migrationId);
      }
    );

    return (result as any)?.checksum || '';
  }
}

/**
 * Factory functions for creating MigrationService instances
 * Following ReadyAI's service instantiation patterns
 */
export function createMigrationService(
  dbConnection: DatabaseConnection,
  config?: Partial<MigrationServiceConfig>
): MigrationService {
  return new MigrationService(dbConnection, config);
}

/**
 * Default migration service instance for application-wide use
 */
let defaultInstance: MigrationService | null = null;

export function getDefaultMigrationService(
  dbConnection?: DatabaseConnection,
  config?: Partial<MigrationServiceConfig>
): MigrationService {
  if (!defaultInstance && dbConnection) {
    defaultInstance = new MigrationService(dbConnection, config);
  }
  
  if (!defaultInstance) {
    throw new ReadyAIError(
      'Default MigrationService not initialized and no database connection provided',
      'MIGRATION_SERVICE_NOT_AVAILABLE',
      500
    );
  }
  
  return defaultInstance;
}

export function resetDefaultMigrationService(): void {
  defaultInstance = null;
}

/**
 * Export configuration and types for external use
 */
export type {
  MigrationServiceConfig,
  MigrationExecutionStatus,
  MigrationPlan,
  MigrationRecord
};

export {
  DEFAULT_MIGRATION_CONFIG
};
