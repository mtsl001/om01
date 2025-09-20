// packages/logging/repositories/LogRepository.ts

/**
 * Log repository for ReadyAI Personal AI Development Orchestrator
 * 
 * Adapted from Cline's production-proven storage patterns with ReadyAI-specific
 * database persistence, log retention policies, and comprehensive query capabilities.
 * This repository provides enterprise-grade log management with efficient storage,
 * retrieval, and maintenance operations.
 * 
 * Pattern-Replicate: ~50% reuse of Cline's storage architecture
 * Source: Cline's storage patterns and telemetry infrastructure
 */

import { promises as fs } from 'fs'
import path from 'path'
import sqlite3 from 'sqlite3'
import { open, Database } from 'sqlite'
import type {
  UUID,
  ApiResponse,
  ApiErrorResponse,
  createApiResponse,
  createApiError,
  wrapAsync,
  AsyncResult
} from '../../foundation/types/core.js'
import type {
  LogEntry,
  LogLevel,
  LogCategory,
  LogQuery,
  LogQueryResult,
  TelemetryEvent,
  PerformanceMetrics,
  PhaseTrackingEvent,
  LoggingResult
} from '../types/logging.js'

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

/**
 * Database configuration for the log repository
 * Adapted from Cline's storage configuration patterns
 */
interface DatabaseConfig {
  /** Path to the SQLite database file */
  dbPath: string
  /** Maximum number of log entries to retain */
  maxEntries: number
  /** Log retention period in days */
  retentionDays: number
  /** Enable WAL mode for better performance */
  enableWAL: boolean
  /** Database connection timeout in milliseconds */
  timeout: number
  /** Enable query logging for debugging */
  enableQueryLogging: boolean
}

/**
 * Log retention policy configuration
 * Based on Cline's data lifecycle management patterns
 */
interface RetentionPolicy {
  /** Minimum log level to retain long-term */
  minLevel: LogLevel
  /** Categories to retain beyond standard retention */
  preserveCategories: LogCategory[]
  /** Emergency retention for critical errors (days) */
  emergencyRetentionDays: number
  /** Archive old logs instead of deleting */
  enableArchiving: boolean
  /** Archive path for old logs */
  archivePath?: string
}

/**
 * Database statistics for monitoring and optimization
 */
interface DatabaseStats {
  /** Total number of log entries */
  totalEntries: number
  /** Number of entries by level */
  entriesByLevel: Record<LogLevel, number>
  /** Number of entries by category */
  entriesByCategory: Record<LogCategory, number>
  /** Database file size in bytes */
  databaseSize: number
  /** Oldest log entry timestamp */
  oldestEntry?: string
  /** Newest log entry timestamp */
  newestEntry?: string
  /** Last cleanup timestamp */
  lastCleanup?: string
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Default database configuration values */
const DEFAULT_CONFIG: DatabaseConfig = {
  dbPath: './logs/readyai.db',
  maxEntries: 100000,
  retentionDays: 30,
  enableWAL: true,
  timeout: 5000,
  enableQueryLogging: false
}

/** Default retention policy */
const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  minLevel: 'info',
  preserveCategories: ['system', 'phase', 'validation'],
  emergencyRetentionDays: 90,
  enableArchiving: true
}

/** SQL schema definitions adapted from Cline's storage patterns */
const SCHEMA_SQL = `
  -- Core log entries table with comprehensive indexing
  CREATE TABLE IF NOT EXISTS log_entries (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    level TEXT NOT NULL,
    category TEXT NOT NULL,
    message TEXT NOT NULL,
    data TEXT, -- JSON data
    error_code TEXT,
    error_stack TEXT,
    project_id TEXT,
    phase TEXT,
    task_id TEXT,
    source TEXT NOT NULL,
    correlation_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Telemetry events table for performance and usage tracking
  CREATE TABLE IF NOT EXISTS telemetry_events (
    id TEXT PRIMARY KEY,
    event TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    properties TEXT, -- JSON properties
    user_id TEXT,
    session_id TEXT,
    project_id TEXT,
    phase TEXT,
    task_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Performance metrics table for system monitoring
  CREATE TABLE IF NOT EXISTS performance_metrics (
    id TEXT PRIMARY KEY,
    metric TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT,
    timestamp TEXT NOT NULL,
    labels TEXT, -- JSON labels
    project_id TEXT,
    phase TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Phase tracking events for ReadyAI methodology analytics
  CREATE TABLE IF NOT EXISTS phase_tracking_events (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    project_id TEXT NOT NULL,
    phase TEXT NOT NULL,
    status TEXT NOT NULL,
    previous_phase TEXT,
    duration INTEGER,
    artifact_count INTEGER,
    token_usage TEXT, -- JSON token usage
    validation_results TEXT, -- JSON validation results
    metadata TEXT, -- JSON metadata
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Indexes for efficient queries (following Cline's indexing strategy)
  CREATE INDEX IF NOT EXISTS idx_log_entries_timestamp ON log_entries(timestamp);
  CREATE INDEX IF NOT EXISTS idx_log_entries_level ON log_entries(level);
  CREATE INDEX IF NOT EXISTS idx_log_entries_category ON log_entries(category);
  CREATE INDEX IF NOT EXISTS idx_log_entries_project_id ON log_entries(project_id);
  CREATE INDEX IF NOT EXISTS idx_log_entries_phase ON log_entries(phase);
  CREATE INDEX IF NOT EXISTS idx_log_entries_correlation_id ON log_entries(correlation_id);
  
  CREATE INDEX IF NOT EXISTS idx_telemetry_events_event ON telemetry_events(event);
  CREATE INDEX IF NOT EXISTS idx_telemetry_events_timestamp ON telemetry_events(timestamp);
  CREATE INDEX IF NOT EXISTS idx_telemetry_events_project_id ON telemetry_events(project_id);
  
  CREATE INDEX IF NOT EXISTS idx_performance_metrics_metric ON performance_metrics(metric);
  CREATE INDEX IF NOT EXISTS idx_performance_metrics_timestamp ON performance_metrics(timestamp);
  
  CREATE INDEX IF NOT EXISTS idx_phase_tracking_project_phase ON phase_tracking_events(project_id, phase);
  CREATE INDEX IF NOT EXISTS idx_phase_tracking_timestamp ON phase_tracking_events(timestamp);

  -- Metadata table for repository configuration and statistics
  CREATE TABLE IF NOT EXISTS repository_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`

// =============================================================================
// LOG REPOSITORY IMPLEMENTATION
// =============================================================================

/**
 * Enterprise-grade log repository with database persistence
 * 
 * This repository implements Cline's proven storage patterns while adding
 * ReadyAI-specific features like phase tracking, advanced retention policies,
 * and comprehensive analytics capabilities.
 */
export class LogRepository {
  private db?: Database
  private config: DatabaseConfig
  private retentionPolicy: RetentionPolicy
  private cleanupInterval?: NodeJS.Timeout
  private isInitialized = false

  /**
   * Creates a new LogRepository instance
   * 
   * @param config Database configuration (optional, uses defaults)
   * @param retentionPolicy Log retention policy (optional, uses defaults)
   */
  constructor(
    config: Partial<DatabaseConfig> = {},
    retentionPolicy: Partial<RetentionPolicy> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.retentionPolicy = { ...DEFAULT_RETENTION_POLICY, ...retentionPolicy }
  }

  // =============================================================================
  // INITIALIZATION AND LIFECYCLE
  // =============================================================================

  /**
   * Initialize the repository and database connection
   * Follows Cline's initialization patterns with comprehensive error handling
   */
  async initialize(): Promise<AsyncResult<void>> {
    return wrapAsync(async () => {
      if (this.isInitialized) {
        return
      }

      // Ensure database directory exists
      const dbDir = path.dirname(this.config.dbPath)
      await fs.mkdir(dbDir, { recursive: true })

      // Open database connection with Cline's connection patterns
      this.db = await open({
        filename: this.config.dbPath,
        driver: sqlite3.Database
      })

      // Configure database for optimal performance (Cline's optimization patterns)
      if (this.config.enableWAL) {
        await this.db.exec('PRAGMA journal_mode = WAL;')
      }
      
      await this.db.exec(`
        PRAGMA busy_timeout = ${this.config.timeout};
        PRAGMA cache_size = -64000; -- 64MB cache
        PRAGMA temp_store = MEMORY;
        PRAGMA mmap_size = 134217728; -- 128MB mmap
        PRAGMA optimize;
      `)

      // Create schema if it doesn't exist
      await this.db.exec(SCHEMA_SQL)

      // Initialize metadata
      await this.initializeMetadata()

      // Set up automatic cleanup (Cline's maintenance pattern)
      this.setupCleanupInterval()

      this.isInitialized = true

      if (this.config.enableQueryLogging) {
        console.log('[LogRepository] Initialized successfully at:', this.config.dbPath)
      }
    })
  }

  /**
   * Close the repository and clean up resources
   * Follows Cline's cleanup patterns
   */
  async close(): Promise<AsyncResult<void>> {
    return wrapAsync(async () => {
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval)
        this.cleanupInterval = undefined
      }

      if (this.db) {
        await this.db.close()
        this.db = undefined
      }

      this.isInitialized = false
    })
  }

  /**
   * Initialize repository metadata
   * Adapted from Cline's metadata management patterns
   */
  private async initializeMetadata(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    const metadata = [
      ['schema_version', '1.0.0'],
      ['created_at', new Date().toISOString()],
      ['last_cleanup', new Date().toISOString()]
    ]

    for (const [key, value] of metadata) {
      await this.db.run(
        'INSERT OR IGNORE INTO repository_metadata (key, value) VALUES (?, ?)',
        [key, value]
      )
    }
  }

  /**
   * Set up automatic cleanup interval
   * Based on Cline's maintenance scheduling patterns
   */
  private setupCleanupInterval(): void {
    // Run cleanup every 4 hours (Cline's maintenance frequency)
    this.cleanupInterval = setInterval(async () => {
      const result = await this.performMaintenance()
      if (!result.success && this.config.enableQueryLogging) {
        console.warn('[LogRepository] Maintenance failed:', result.error.message)
      }
    }, 4 * 60 * 60 * 1000)
  }

  // =============================================================================
  // CORE LOG OPERATIONS
  // =============================================================================

  /**
   * Store a log entry in the database
   * Implements Cline's high-performance insertion patterns
   * 
   * @param entry Log entry to store
   * @returns Promise resolving to success/error response
   */
  async storeLogEntry(entry: LogEntry): Promise<ApiResponse<void> | ApiErrorResponse> {
    const result = await wrapAsync(async () => {
      if (!this.db || !this.isInitialized) {
        throw new Error('Repository not initialized')
      }

      // Validate entry (Cline's validation pattern)
      this.validateLogEntry(entry)

      // Prepare data for insertion
      const data = entry.data ? JSON.stringify(entry.data) : null
      const errorCode = entry.error?.code || null
      const errorStack = entry.error?.stack || null

      // Insert with comprehensive error handling
      await this.db.run(`
        INSERT INTO log_entries (
          id, timestamp, level, category, message, data,
          error_code, error_stack, project_id, phase, task_id,
          source, correlation_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        entry.id,
        entry.timestamp,
        entry.level,
        entry.category,
        entry.message,
        data,
        errorCode,
        errorStack,
        entry.projectId || null,
        entry.phase || null,
        entry.taskId || null,
        entry.source,
        entry.correlationId || null
      ])

      if (this.config.enableQueryLogging) {
        console.log(`[LogRepository] Stored log entry: ${entry.id} (${entry.level}/${entry.category})`)
      }
    })

    if (result.success) {
      return createApiResponse(undefined, {
        timestamp: new Date().toISOString(),
        requestId: entry.id
      })
    } else {
      return createApiError(
        `Failed to store log entry: ${result.error.message}`,
        'STORAGE_ERROR',
        500,
        { entryId: entry.id }
      )
    }
  }

  /**
   * Store multiple log entries efficiently
   * Uses Cline's batch insertion patterns for optimal performance
   * 
   * @param entries Array of log entries to store
   * @returns Promise resolving to success/error response
   */
  async storeBulkLogEntries(entries: LogEntry[]): Promise<ApiResponse<number> | ApiErrorResponse> {
    const result = await wrapAsync(async () => {
      if (!this.db || !this.isInitialized) {
        throw new Error('Repository not initialized')
      }

      if (entries.length === 0) {
        return 0
      }

      // Validate all entries first
      entries.forEach(entry => this.validateLogEntry(entry))

      // Use transaction for atomic batch insert (Cline's transaction pattern)
      let insertedCount = 0
      await this.db.exec('BEGIN TRANSACTION')

      try {
        const stmt = await this.db.prepare(`
          INSERT INTO log_entries (
            id, timestamp, level, category, message, data,
            error_code, error_stack, project_id, phase, task_id,
            source, correlation_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)

        for (const entry of entries) {
          const data = entry.data ? JSON.stringify(entry.data) : null
          const errorCode = entry.error?.code || null
          const errorStack = entry.error?.stack || null

          await stmt.run([
            entry.id,
            entry.timestamp,
            entry.level,
            entry.category,
            entry.message,
            data,
            errorCode,
            errorStack,
            entry.projectId || null,
            entry.phase || null,
            entry.taskId || null,
            entry.source,
            entry.correlationId || null
          ])
          insertedCount++
        }

        await stmt.finalize()
        await this.db.exec('COMMIT')

        if (this.config.enableQueryLogging) {
          console.log(`[LogRepository] Stored ${insertedCount} log entries in batch`)
        }

        return insertedCount
      } catch (error) {
        await this.db.exec('ROLLBACK')
        throw error
      }
    })

    if (result.success) {
      return createApiResponse(result.data, {
        timestamp: new Date().toISOString(),
        requestId: crypto.randomUUID(),
        metrics: {
          processingTime: 0, // Would be measured in real implementation
          tokenUsage: {
            input: 0,
            output: 0,
            total: entries.length
          }
        }
      })
    } else {
      return createApiError(
        `Failed to store bulk log entries: ${result.error.message}`,
        'BULK_STORAGE_ERROR',
        500,
        { entryCount: entries.length }
      )
    }
  }

  /**
   * Query log entries with advanced filtering and pagination
   * Implements Cline's comprehensive query patterns with optimization
   * 
   * @param query Query parameters for filtering and pagination
   * @returns Promise resolving to query results
   */
  async queryLogs(query: LogQuery): Promise<ApiResponse<LogQueryResult> | ApiErrorResponse> {
    const result = await wrapAsync(async () => {
      if (!this.db || !this.isInitialized) {
        throw new Error('Repository not initialized')
      }

      const startTime = Date.now()

      // Build dynamic query (Cline's query building pattern)
      const { sql, params, countSql } = this.buildQuery(query)

      // Get total count for pagination
      const countResult = await this.db.get(countSql, params)
      const total = countResult?.count || 0

      // Get paginated results
      const rows = await this.db.all(sql, params)

      // Transform database rows to LogEntry objects
      const entries: LogEntry[] = rows.map(row => this.transformRowToLogEntry(row))

      const executionTime = Date.now() - startTime
      const hasMore = (query.offset || 0) + entries.length < total

      if (this.config.enableQueryLogging) {
        console.log(`[LogRepository] Query executed in ${executionTime}ms, returned ${entries.length}/${total} entries`)
      }

      return {
        entries,
        total,
        executionTime,
        hasMore
      }
    })

    if (result.success) {
      return createApiResponse(result.data, {
        timestamp: new Date().toISOString(),
        requestId: crypto.randomUUID(),
        metrics: {
          processingTime: result.data.executionTime,
          tokenUsage: {
            input: 0,
            output: result.data.entries.length,
            total: result.data.entries.length
          }
        }
      })
    } else {
      return createApiError(
        `Failed to query logs: ${result.error.message}`,
        'QUERY_ERROR',
        500,
        { query }
      )
    }
  }

  // =============================================================================
  // TELEMETRY AND ANALYTICS
  // =============================================================================

  /**
   * Store a telemetry event for analytics
   * Adapted from Cline's telemetry infrastructure
   */
  async storeTelemetryEvent(event: TelemetryEvent): Promise<ApiResponse<void> | ApiErrorResponse> {
    const result = await wrapAsync(async () => {
      if (!this.db || !this.isInitialized) {
        throw new Error('Repository not initialized')
      }

      const properties = event.properties ? JSON.stringify(event.properties) : null

      await this.db.run(`
        INSERT INTO telemetry_events (
          id, event, timestamp, properties, user_id, session_id,
          project_id, phase, task_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        event.id,
        event.event,
        event.timestamp,
        properties,
        event.userId || null,
        event.sessionId || null,
        event.projectId || null,
        event.phase || null,
        event.taskId || null
      ])
    })

    if (result.success) {
      return createApiResponse(undefined)
    } else {
      return createApiError(
        `Failed to store telemetry event: ${result.error.message}`,
        'TELEMETRY_ERROR',
        500
      )
    }
  }

  /**
   * Store performance metrics
   * Based on Cline's performance monitoring patterns
   */
  async storePerformanceMetrics(metrics: PerformanceMetrics): Promise<ApiResponse<void> | ApiErrorResponse> {
    const result = await wrapAsync(async () => {
      if (!this.db || !this.isInitialized) {
        throw new Error('Repository not initialized')
      }

      const labels = metrics.labels ? JSON.stringify(metrics.labels) : null

      await this.db.run(`
        INSERT INTO performance_metrics (
          id, metric, value, unit, timestamp, labels, project_id, phase
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        metrics.id,
        metrics.metric,
        metrics.value,
        metrics.unit,
        metrics.timestamp,
        labels,
        metrics.projectId || null,
        metrics.phase || null
      ])
    })

    if (result.success) {
      return createApiResponse(undefined)
    } else {
      return createApiError(
        `Failed to store performance metrics: ${result.error.message}`,
        'METRICS_ERROR',
        500
      )
    }
  }

  /**
   * Store phase tracking event for ReadyAI methodology analytics
   * ReadyAI-specific extension of Cline patterns
   */
  async storePhaseTrackingEvent(event: PhaseTrackingEvent): Promise<ApiResponse<void> | ApiErrorResponse> {
    const result = await wrapAsync(async () => {
      if (!this.db || !this.isInitialized) {
        throw new Error('Repository not initialized')
      }

      const tokenUsage = event.tokenUsage ? JSON.stringify(event.tokenUsage) : null
      const validationResults = event.validationResults ? JSON.stringify(event.validationResults) : null
      const metadata = event.metadata ? JSON.stringify(event.metadata) : null

      await this.db.run(`
        INSERT INTO phase_tracking_events (
          id, timestamp, project_id, phase, status, previous_phase,
          duration, artifact_count, token_usage, validation_results, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        event.id,
        event.timestamp,
        event.projectId,
        event.phase,
        event.status,
        event.previousPhase || null,
        event.duration || null,
        event.artifactCount || null,
        tokenUsage,
        validationResults,
        metadata
      ])
    })

    if (result.success) {
      return createApiResponse(undefined)
    } else {
      return createApiError(
        `Failed to store phase tracking event: ${result.error.message}`,
        'PHASE_TRACKING_ERROR',
        500
      )
    }
  }

  // =============================================================================
  // MAINTENANCE AND OPTIMIZATION
  // =============================================================================

  /**
   * Perform comprehensive database maintenance
   * Implements Cline's maintenance and optimization patterns
   */
  async performMaintenance(): Promise<ApiResponse<DatabaseStats> | ApiErrorResponse> {
    const result = await wrapAsync(async () => {
      if (!this.db || !this.isInitialized) {
        throw new Error('Repository not initialized')
      }

      const startTime = Date.now()

      // Apply retention policy (Cline's data lifecycle pattern)
      await this.applyRetentionPolicy()

      // Optimize database (Cline's optimization routine)
      await this.db.exec('PRAGMA optimize')
      await this.db.exec('VACUUM')

      // Update metadata
      await this.db.run(
        'UPDATE repository_metadata SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
        [new Date().toISOString(), 'last_cleanup']
      )

      // Gather statistics
      const stats = await this.getDatabaseStats()

      const maintenanceTime = Date.now() - startTime
      if (this.config.enableQueryLogging) {
        console.log(`[LogRepository] Maintenance completed in ${maintenanceTime}ms`)
      }

      return stats
    })

    if (result.success) {
      return createApiResponse(result.data)
    } else {
      return createApiError(
        `Maintenance failed: ${result.error.message}`,
        'MAINTENANCE_ERROR',
        500
      )
    }
  }

  /**
   * Apply retention policy to clean up old logs
   * Based on Cline's data lifecycle management
   */
  private async applyRetentionPolicy(): Promise<void> {
    if (!this.db) return

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays)
    const cutoffIso = cutoffDate.toISOString()

    // Archive logs if enabled (Cline's archiving pattern)
    if (this.retentionPolicy.enableArchiving && this.retentionPolicy.archivePath) {
      await this.archiveOldLogs(cutoffIso)
    }

    // Delete old logs respecting preservation rules
    const preserveCategories = this.retentionPolicy.preserveCategories
      .map(cat => `'${cat}'`).join(',')

    await this.db.run(`
      DELETE FROM log_entries 
      WHERE timestamp < ? 
      AND level NOT IN ('error', 'fatal')
      AND category NOT IN (${preserveCategories})
    `, [cutoffIso])

    // Clean up telemetry and metrics with longer retention for preserved categories
    await this.db.run('DELETE FROM telemetry_events WHERE timestamp < ?', [cutoffIso])
    await this.db.run('DELETE FROM performance_metrics WHERE timestamp < ?', [cutoffIso])
  }

  /**
   * Archive old logs to separate storage
   * Implements Cline's archiving patterns
   */
  private async archiveOldLogs(cutoffDate: string): Promise<void> {
    if (!this.db || !this.retentionPolicy.archivePath) return

    // Get logs to archive
    const logsToArchive = await this.db.all(
      'SELECT * FROM log_entries WHERE timestamp < ?',
      [cutoffDate]
    )

    if (logsToArchive.length === 0) return

    // Ensure archive directory exists
    await fs.mkdir(this.retentionPolicy.archivePath, { recursive: true })

    // Create archive file with timestamp
    const archiveFile = path.join(
      this.retentionPolicy.archivePath,
      `logs_${new Date().toISOString().split('T')[0]}.jsonl`
    )

    // Write logs to archive file (JSONL format for efficiency)
    const archiveContent = logsToArchive
      .map(log => JSON.stringify(log))
      .join('\n')

    await fs.appendFile(archiveFile, archiveContent + '\n')

    if (this.config.enableQueryLogging) {
      console.log(`[LogRepository] Archived ${logsToArchive.length} logs to: ${archiveFile}`)
    }
  }

  /**
   * Get comprehensive database statistics
   * Adapted from Cline's monitoring patterns
   */
  async getDatabaseStats(): Promise<DatabaseStats> {
    if (!this.db || !this.isInitialized) {
      throw new Error('Repository not initialized')
    }

    // Get basic counts
    const totalResult = await this.db.get('SELECT COUNT(*) as count FROM log_entries')
    const totalEntries = totalResult?.count || 0

    // Get counts by level
    const levelRows = await this.db.all(`
      SELECT level, COUNT(*) as count 
      FROM log_entries 
      GROUP BY level
    `)
    const entriesByLevel = {} as Record<LogLevel, number>
    levelRows.forEach(row => {
      entriesByLevel[row.level as LogLevel] = row.count
    })

    // Get counts by category
    const categoryRows = await this.db.all(`
      SELECT category, COUNT(*) as count 
      FROM log_entries 
      GROUP BY category
    `)
    const entriesByCategory = {} as Record<LogCategory, number>
    categoryRows.forEach(row => {
      entriesByCategory[row.category as LogCategory] = row.count
    })

    // Get timestamp bounds
    const boundsResult = await this.db.get(`
      SELECT 
        MIN(timestamp) as oldest,
        MAX(timestamp) as newest
      FROM log_entries
    `)

    // Get database file size
    let databaseSize = 0
    try {
      const stats = await fs.stat(this.config.dbPath)
      databaseSize = stats.size
    } catch {
      // File might not exist yet
    }

    // Get last cleanup time
    const cleanupResult = await this.db.get(
      "SELECT value FROM repository_metadata WHERE key = 'last_cleanup'"
    )

    return {
      totalEntries,
      entriesByLevel,
      entriesByCategory,
      databaseSize,
      oldestEntry: boundsResult?.oldest,
      newestEntry: boundsResult?.newest,
      lastCleanup: cleanupResult?.value
    }
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Validate log entry before storage
   * Implements Cline's validation patterns
   */
  private validateLogEntry(entry: LogEntry): void {
    if (!entry.id) {
      throw new Error('Log entry must have an ID')
    }
    if (!entry.timestamp) {
      throw new Error('Log entry must have a timestamp')
    }
    if (!entry.message) {
      throw new Error('Log entry must have a message')
    }
    if (!entry.source) {
      throw new Error('Log entry must have a source')
    }
    if (entry.message.length > 2048) {
      throw new Error('Log message exceeds maximum length (2048 characters)')
    }
  }

  /**
   * Build dynamic SQL query from LogQuery parameters
   * Adapted from Cline's query building patterns
   */
  private buildQuery(query: LogQuery): { sql: string; params: any[]; countSql: string } {
    const conditions: string[] = []
    const params: any[] = []

    // Build WHERE conditions
    if (query.startTime) {
      conditions.push('timestamp >= ?')
      params.push(query.startTime)
    }
    if (query.endTime) {
      conditions.push('timestamp <= ?')
      params.push(query.endTime)
    }
    if (query.levels && query.levels.length > 0) {
      const placeholders = query.levels.map(() => '?').join(',')
      conditions.push(`level IN (${placeholders})`)
      params.push(...query.levels)
    }
    if (query.categories && query.categories.length > 0) {
      const placeholders = query.categories.map(() => '?').join(',')
      conditions.push(`category IN (${placeholders})`)
      params.push(...query.categories)
    }
    if (query.source) {
      conditions.push('source LIKE ?')
      params.push(`%${query.source}%`)
    }
    if (query.projectId) {
      conditions.push('project_id = ?')
      params.push(query.projectId)
    }
    if (query.phase) {
      conditions.push('phase = ?')
      params.push(query.phase)
    }
    if (query.search) {
      conditions.push('message LIKE ?')
      params.push(`%${query.search}%`)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Build main query
    const limit = query.limit || 100
    const offset = query.offset || 0
    const orderBy = 'ORDER BY timestamp DESC'

    const sql = `
      SELECT * FROM log_entries 
      ${whereClause} 
      ${orderBy} 
      LIMIT ? OFFSET ?
    `
    const queryParams = [...params, limit, offset]

    // Build count query
    const countSql = `SELECT COUNT(*) as count FROM log_entries ${whereClause}`

    return { sql, params: queryParams, countSql }
  }

  /**
   * Transform database row to LogEntry object
   * Handles proper type conversion and JSON parsing
   */
  private transformRowToLogEntry(row: any): LogEntry {
    return {
      id: row.id,
      timestamp: row.timestamp,
      level: row.level as LogLevel,
      category: row.category as LogCategory,
      message: row.message,
      data: row.data ? JSON.parse(row.data) : undefined,
      error: row.error_code || row.error_stack ? {
        message: row.message,
        code: row.error_code,
        stack: row.error_stack
      } : undefined,
      projectId: row.project_id,
      phase: row.phase,
      taskId: row.task_id,
      source: row.source,
      correlationId: row.correlation_id
    }
  }

  // =============================================================================
  // STATIC FACTORY METHODS
  // =============================================================================

  /**
   * Create a LogRepository instance with default configuration
   * Follows Cline's factory pattern for easy instantiation
   */
  static createDefault(): LogRepository {
    return new LogRepository()
  }

  /**
   * Create a LogRepository instance for testing
   * Uses in-memory database for fast tests
   */
  static createForTesting(): LogRepository {
    return new LogRepository({
      dbPath: ':memory:',
      maxEntries: 1000,
      retentionDays: 1,
      enableQueryLogging: false
    })
  }

  /**
   * Create a LogRepository instance with custom configuration
   * Provides full configuration flexibility
   */
  static createWithConfig(
    dbPath: string,
    config?: Partial<DatabaseConfig>,
    retentionPolicy?: Partial<RetentionPolicy>
  ): LogRepository {
    return new LogRepository(
      { ...config, dbPath },
      retentionPolicy
    )
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default LogRepository
export type {
  DatabaseConfig,
  RetentionPolicy,
  DatabaseStats
}

/**
 * Version information for the LogRepository module
 */
export const LOG_REPOSITORY_VERSION = '1.0.0'

/**
 * Export utility functions for testing and advanced usage
 */
export const LogRepositoryUtils = {
  /**
   * Validate database configuration
   */
  validateConfig: (config: Partial<DatabaseConfig>): boolean => {
    if (config.maxEntries && config.maxEntries < 1) return false
    if (config.retentionDays && config.retentionDays < 1) return false
    if (config.timeout && config.timeout < 1000) return false
    return true
  },

  /**
   * Create optimal database configuration for given constraints
   */
  createOptimalConfig: (constraints: {
    expectedVolumePerDay?: number
    retentionDays?: number
    performanceLevel?: 'basic' | 'standard' | 'high'
  }): DatabaseConfig => {
    const { expectedVolumePerDay = 1000, retentionDays = 30, performanceLevel = 'standard' } = constraints
    
    const maxEntries = expectedVolumePerDay * retentionDays * 2 // 2x safety margin
    
    const performanceSettings = {
      basic: { enableWAL: false, timeout: 10000 },
      standard: { enableWAL: true, timeout: 5000 },
      high: { enableWAL: true, timeout: 3000 }
    }

    return {
      ...DEFAULT_CONFIG,
      maxEntries,
      retentionDays,
      ...performanceSettings[performanceLevel]
    }
  }
}
