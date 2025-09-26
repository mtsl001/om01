// packages/database/types/database.ts

/**
 * Database types for ReadyAI Phase 1.2 - Production Implementation
 * 
 * Adapted from Cline's src/core/storage/types.ts with ReadyAI-specific extensions
 * Provides comprehensive type definitions for SQLite database operations,
 * vector database integration, and ReadyAI transaction models.
 * 
 * Key Features:
 * - SQLite-specific database configurations with WAL mode support
 * - Transaction management with ACID compliance
 * - Migration interfaces with versioning and rollback capabilities
 * - Vector database types for Milvus integration
 * - ReadyAI domain-specific schemas (Projects, Context Nodes, etc.)
 * - Production-ready health monitoring and backup types
 */

import { UUID } from '../../foundation/types/core';

// ============================================================================
// CORE DATABASE CONFIGURATION
// Adapted from Cline's storage patterns with ReadyAI extensions
// ============================================================================

/**
 * Core database configuration adapted from Cline's storage patterns
 * Enhanced with ReadyAI-specific SQLite optimizations and vector database support
 */
export interface DatabaseConfig {
  /** SQLite database file path */
  url: string;
  /** Maximum number of concurrent connections (SQLite limitation applies) */
  maxConnections: number;
  /** Connection timeout in milliseconds */
  connectionTimeout: number;
  /** Enable Write-Ahead Logging for better concurrency */
  enableWAL: boolean;
  /** Enable foreign key constraints */
  enableForeignKeys: boolean;
  /** Busy timeout for locked database operations */
  busyTimeout: number;
  /** Automatic backup interval in seconds (optional) */
  backupInterval?: number;
  /** Additional SQLite pragma settings */
  pragma?: Record<string, string | number>;
}

/**
 * Transaction configuration with ACID compliance
 * Supports nested transactions via SQLite savepoints
 */
export interface TransactionOptions {
  /** Transaction mode affecting locking behavior */
  mode: 'DEFERRED' | 'IMMEDIATE' | 'EXCLUSIVE';
  /** Isolation level (mapped to SQLite locking mechanisms) */
  isolationLevel: 'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';
  /** Transaction timeout in milliseconds */
  timeout: number;
}

/**
 * Migration schema with comprehensive versioning
 * Supports dependency tracking and rollback strategies
 */
export interface Migration {
  /** Unique migration identifier */
  id: string;
  /** Sequential version number */
  version: number;
  /** Human-readable migration name */
  name: string;
  /** SQL for applying the migration */
  upSql: string;
  /** SQL for rolling back the migration */
  downSql: string;
  /** Content checksum for integrity verification */
  checksum: string;
  /** Execution timestamp (when applied) */
  executedAt?: string;
  /** Migration dependencies (other migration names) */
  dependencies?: string[];
}

/**
 * Database health check results
 * Comprehensive monitoring for production environments
 */
export interface DatabaseHealth {
  /** Database connection status */
  isConnected: boolean;
  /** Number of active connections */
  connectionCount: number;
  /** Last executed query for health verification */
  lastQuery: string;
  /** Query response time in milliseconds */
  responseTime: number;
  /** Array of error messages if any */
  errors: string[];
  /** WAL mode enabled status */
  walMode: boolean;
  /** Foreign keys enabled status */
  foreignKeys: boolean;
}

// ============================================================================
// VECTOR DATABASE CONFIGURATION
// Milvus integration patterns adapted from Cline's approach
// ============================================================================

/**
 * Vector database configuration adapted from Milvus patterns
 * Enhanced with ReadyAI context management requirements
 */
export interface VectorConfig {
  /** Milvus server host */
  host: string;
  /** Milvus server port */
  port: number;
  /** Authentication username (optional) */
  username?: string;
  /** Authentication password (optional) */
  password?: string;
  /** Use secure connection (TLS) */
  secure?: boolean;
  /** Connection timeout in milliseconds */
  timeout?: number;
}

/**
 * Vector collection configuration
 * Defines embedding space and indexing strategy
 */
export interface VectorCollection {
  /** Collection name identifier */
  name: string;
  /** Vector dimension (must match embedding model) */
  dimension: number;
  /** Distance metric for similarity search */
  metricType: 'L2' | 'IP' | 'COSINE';
  /** Index type for performance optimization */
  indexType: 'IVF_FLAT' | 'HNSW' | 'AUTOINDEX';
  /** Human-readable description */
  description?: string;
}

/**
 * Vector search query configuration
 * Supports similarity search with filtering and field selection
 */
export interface VectorSearchQuery {
  /** Target collection name */
  collectionName: string;
  /** Query vectors for similarity search */
  vectors: number[][];
  /** Maximum number of results to return */
  limit: number;
  /** Search-specific parameters */
  searchParams?: Record<string, any>;
  /** Filter expression for result refinement */
  filter?: string;
  /** Specific fields to return in results */
  outputFields?: string[];
}

/**
 * Vector search result item
 * Contains similarity score and associated metadata
 */
export interface VectorSearchResult {
  /** Entity identifier */
  id: string;
  /** Similarity score (distance metric dependent) */
  score: number;
  /** Associated metadata fields */
  metadata?: Record<string, any>;
}

/**
 * Embedding generation request
 * Supports caching and model selection
 */
export interface EmbeddingRequest {
  /** Text content to embed */
  text: string;
  /** Optional context identifier for tracking */
  contextId?: UUID;
  /** Cache key for embedding reuse */
  cacheKey?: string;
  /** Specific embedding model to use */
  model?: string;
}

// ============================================================================
// OPERATION RESULT TYPES
// Standardized response patterns following Cline's approach
// ============================================================================

/**
 * Database operation result with comprehensive feedback
 * Provides success status, affected rows, and error details
 */
export interface DatabaseOperationResult {
  /** Operation success status */
  success: boolean;
  /** Number of rows affected by the operation */
  affectedRows?: number;
  /** Generated ID for insert operations */
  insertId?: string;
  /** Error message if operation failed */
  error?: string;
}

/**
 * Vector database operation result
 * Specialized for vector operations with search results
 */
export interface VectorOperationResult {
  /** Operation success status */
  success: boolean;
  /** Number of vectors inserted */
  insertedCount?: number;
  /** Search results for query operations */
  searchResults?: VectorSearchResult[];
  /** Error message if operation failed */
  error?: string;
}

// ============================================================================
// READYAI DOMAIN SCHEMAS
// Application-specific entities with vector embedding support
// ============================================================================

/**
 * ReadyAI project entity with comprehensive metadata
 * Central entity for the development orchestrator
 */
export interface Project {
  /** Unique project identifier */
  id: UUID;
  /** Project name */
  name: string;
  /** Detailed project description */
  description?: string;
  /** Current development phase */
  currentPhase: string;
  /** Root file system path */
  rootPath: string;
  /** Technology stack configuration (JSON string) */
  techStack: string;
  /** Project creation timestamp (ISO 8601) */
  createdAt: string;
  /** Last modification timestamp (ISO 8601) */
  lastModified: string;
  /** Project configuration (JSON string) */
  config: string;
}

/**
 * Development phase tracking entity
 * Manages progression through ReadyAI's methodology
 */
export interface Phase {
  /** Phase identifier */
  id: string;
  /** Associated project ID */
  projectId: UUID;
  /** Current phase status */
  status: 'pending' | 'active' | 'completed' | 'failed';
  /** Phase completion timestamp */
  completedAt?: string;
  /** Validation results (JSON string) */
  validationResults?: string;
}

/**
 * Context node for semantic project understanding
 * Enhanced with vector embeddings for intelligent retrieval
 */
export interface ContextNode {
  /** Unique context identifier */
  id: UUID;
  /** Project this context belongs to */
  projectId: UUID;
  /** Type of context element */
  type: 'file' | 'dependency' | 'api' | 'config';
  /** File path or identifier */
  path: string;
  /** Content or summary */
  content: string;
  /** Vector embedding for semantic search (JSON array) */
  vectorEmbedding?: string;
  /** Dependencies this context relies on (JSON array of UUIDs) */
  dependencies: string;
  /** Contexts that depend on this one (JSON array of UUIDs) */
  dependents: string;
  /** Relevance score for retrieval (0-1) */
  relevanceScore: number;
  /** Last access timestamp */
  lastAccessed: string;
  /** Additional metadata (JSON string) */
  metadata: string;
}

/**
 * AI generation request tracking
 * Monitors code generation operations and results
 */
export interface GenerationRequest {
  /** Unique request identifier */
  id: UUID;
  /** Associated project ID */
  projectId: UUID;
  /** Target file to generate */
  targetFile: string;
  /** Development phase during generation */
  phase: string;
  /** AI provider used */
  aiProvider: string;
  /** Extended thinking mode enabled */
  extendedThinking: boolean;
  /** Request processing status */
  status: 'pending' | 'processing' | 'completed' | 'failed';
  /** Generation result (JSON string) */
  result?: string;
  /** Request creation timestamp */
  createdAt: string;
}

/**
 * Project quality metrics tracking
 * Monitors code quality, coverage, and architectural consistency
 */
export interface QualityMetrics {
  /** Associated project ID */
  projectId: UUID;
  /** Architectural consistency score (0-1) */
  architecturalConsistency: number;
  /** Test coverage percentage (0-1) */
  testCoverage: number;
  /** Dependency health score (0-1) */
  dependencyHealth: number;
  /** Context efficiency score (0-1) */
  contextEfficiency: number;
  /** Last calculation timestamp */
  lastCalculated: string;
}

// ============================================================================
// CACHE AND PERFORMANCE TYPES
// Vector embedding cache and search optimization
// ============================================================================

/**
 * Vector embedding cache entry
 * Optimizes embedding generation with intelligent eviction
 */
export interface VectorCacheEntry {
  /** Cache key for lookup */
  cacheKey: string;
  /** Hash of original text */
  textHash: string;
  /** Cached embedding (JSON array) */
  embedding: string;
  /** Model used for embedding */
  modelName: string;
  /** Embedding dimension */
  embeddingDimension: number;
  /** Cache creation timestamp */
  createdAt: string;
  /** Last access timestamp */
  accessedAt: string;
  /** Access count for LRU eviction */
  accessCount: number;
  /** Optional expiration timestamp */
  expiresAt?: string;
  /** Additional metadata (JSON) */
  metadata?: string;
}

/**
 * Vector search performance metrics
 * Tracks search operations for optimization
 */
export interface VectorSearchMetrics {
  /** Search operation ID */
  id: string;
  /** Target collection */
  collectionName: string;
  /** Query type classification */
  queryType: 'similarity' | 'keyword' | 'hybrid';
  /** Query vector (JSON array) */
  queryVector?: string;
  /** Query text for keyword search */
  queryText?: string;
  /** Applied filters (JSON) */
  filters?: string;
  /** Result limit */
  limitCount: number;
  /** Search parameters (JSON) */
  searchParams?: string;
  /** Number of results returned */
  resultsCount: number;
  /** Search execution time (milliseconds) */
  searchTimeMs: number;
  /** Cache hit indicator */
  cacheHit: boolean;
  /** Search timestamp */
  createdAt: string;
  /** User context (JSON) */
  userContext?: string;
}

/**
 * Vector collection statistics
 * Monitors collection health and performance
 */
export interface VectorCollectionStats {
  /** Collection name */
  collectionName: string;
  /** Index size in bytes */
  indexSizeBytes: number;
  /** Index build time (milliseconds) */
  buildTimeMs?: number;
  /** Last index rebuild timestamp */
  lastRebuild?: string;
  /** Index optimization score (0-1) */
  optimizationScore: number;
  /** Average query performance score (0-1) */
  queryPerformance: number;
  /** Detailed statistics (JSON) */
  statsData?: string;
  /** Statistics update timestamp */
  updatedAt: string;
}

// ============================================================================
// BACKUP AND MIGRATION TYPES
// Data protection and schema evolution
// ============================================================================

/**
 * Database backup configuration
 * Supports automated backups with compression
 */
export interface BackupConfig {
  /** Backup storage path */
  backupPath: string;
  /** Enable backup compression */
  enableCompression: boolean;
  /** Retention period in days */
  retentionDays: number;
  /** Backup schedule (cron expression) */
  schedule?: string;
  /** Maximum backup file size (bytes) */
  maxBackupSize?: number;
}

/**
 * Backup operation result
 * Tracks backup success and metadata
 */
export interface BackupResult {
  /** Backup operation success */
  success: boolean;
  /** Backup file path */
  backupPath?: string;
  /** Backup file size (bytes) */
  backupSize?: number;
  /** Backup duration (milliseconds) */
  duration?: number;
  /** Backup timestamp */
  timestamp: string;
  /** Error message if backup failed */
  error?: string;
}

/**
 * Migration execution result
 * Tracks migration success and rollback capability
 */
export interface MigrationResult {
  /** Migration execution success */
  success: boolean;
  /** Number of migrations applied */
  migrationsApplied: number;
  /** Total execution time (milliseconds) */
  executionTime: number;
  /** Applied migration versions */
  appliedVersions: number[];
  /** Error message if migration failed */
  error?: string;
  /** Rollback available flag */
  canRollback: boolean;
}

// ============================================================================
// TYPE EXPORTS AND VERSION INFORMATION
// Module metadata and re-exports
// ============================================================================

/**
 * Database types module version
 */
export const DATABASE_TYPES_VERSION = '1.2.0';

/**
 * Supported database schema versions
 */
export const SUPPORTED_SCHEMA_VERSIONS = ['1.0.0', '1.1.0', '1.2.0'] as const;
export type SchemaVersion = typeof SUPPORTED_SCHEMA_VERSIONS[number];

/**
 * Default database configuration for development
 */
export const DEFAULT_DATABASE_CONFIG: DatabaseConfig = {
  url: './data/readyai.db',
  maxConnections: 1, // SQLite limitation
  connectionTimeout: 30000,
  enableWAL: true,
  enableForeignKeys: true,
  busyTimeout: 30000,
  backupInterval: 86400, // 24 hours
  pragma: {
    'cache_size': -64000, // 64MB
    'temp_store': 'MEMORY',
    'synchronous': 'NORMAL',
    'mmap_size': 268435456 // 256MB
  }
};

/**
 * Default vector database configuration
 */
export const DEFAULT_VECTOR_CONFIG: VectorConfig = {
  host: 'localhost',
  port: 19530,
  timeout: 30000,
  secure: false
};

/**
 * Default transaction options
 */
export const DEFAULT_TRANSACTION_OPTIONS: TransactionOptions = {
  mode: 'IMMEDIATE',
  isolationLevel: 'SERIALIZABLE',
  timeout: 30000
};
