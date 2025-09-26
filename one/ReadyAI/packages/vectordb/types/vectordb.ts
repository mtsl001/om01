// packages/vectordb/types/vectordb.ts

/**
 * Vector Database Types for ReadyAI Personal AI Development Orchestrator
 * 
 * This module provides comprehensive type definitions for vector database operations,
 * leveraging Cline's proven type patterns while adding ReadyAI-specific vector
 * functionality for semantic search, embedding management, and collection operations.
 * 
 * Key Adaptations from Cline:
 * - Type safety patterns from Cline's comprehensive type definitions
 * - Configuration interfaces from Cline's proven config patterns
 * - Result types from Cline's consistent API response structure
 * - Error handling types from Cline's robust error management
 * - Performance monitoring types from Cline's telemetry patterns
 * 
 * ReadyAI Extensions:
 * - Vector collection management for project context
 * - Embedding cache optimization
 * - Semantic search with ReadyAI context awareness
 * - Project-specific vector operations
 * - Quality metrics integration
 * 
 * @version 1.0.0
 * @author ReadyAI Development Team
 */

import { 
  UUID, 
  ApiResponse, 
  ApiErrorResponse,
  ReadyAIError,
  ValidationResult,
  AsyncResult,
  Timestamp,
  OperationStatus,
  ErrorDetails,
  PhaseType
} from '../../foundation/types/core';

// =============================================================================
// CORE VECTOR DATABASE CONFIGURATION
// =============================================================================

/**
 * Vector database connection configuration
 * Adapted from Cline's connection management patterns with Milvus specifics
 */
export interface VectorDatabaseConfig {
  /** Milvus server host */
  host: string;
  /** Milvus server port */
  port: number;
  /** Database name */
  database?: string;
  /** Authentication username (optional) */
  username?: string;
  /** Authentication password (optional) */
  password?: string;
  /** Use secure connection (TLS) */
  secure?: boolean;
  /** Connection timeout in milliseconds */
  timeout: number;
  /** Maximum number of concurrent connections */
  maxConnections: number;
  /** Connection retry configuration */
  retry: {
    attempts: number;
    backoffMs: number;
  };
  /** Health check interval in seconds */
  healthCheckInterval: number;
}

/**
 * Vector collection configuration
 * Defines embedding space and indexing strategy following Cline patterns
 */
export interface VectorCollectionConfig {
  /** Collection name identifier */
  name: string;
  /** Vector dimension (must match embedding model) */
  dimension: number;
  /** Distance metric for similarity search */
  metricType: 'L2' | 'IP' | 'COSINE';
  /** Index type for performance optimization */
  indexType: 'IVF_FLAT' | 'IVF_SQ8' | 'HNSW' | 'AUTOINDEX';
  /** Index parameters */
  indexParams?: Record<string, any>;
  /** Collection description */
  description?: string;
  /** Shard configuration */
  shards?: number;
  /** Consistency level */
  consistencyLevel?: 'Strong' | 'Bounded' | 'Eventually';
}

/**
 * Embedding service configuration
 * Based on Cline's service configuration patterns
 */
export interface EmbeddingConfig {
  /** Embedding model name */
  model: string;
  /** Model provider */
  provider: 'sentence-transformers' | 'openai' | 'anthropic' | 'custom';
  /** Maximum text length for embedding */
  maxTextLength: number;
  /** Batch size for embedding generation */
  batchSize: number;
  /** Cache configuration */
  cache: {
    enabled: boolean;
    ttlSeconds: number;
    maxEntries: number;
  };
  /** Model-specific parameters */
  modelParams?: Record<string, any>;
}

// =============================================================================
// VECTOR OPERATIONS AND QUERIES
// =============================================================================

/**
 * Vector search query configuration
 * Enhanced with ReadyAI context-aware filtering
 */
export interface VectorSearchQuery {
  /** Target collection name */
  collectionName: string;
  /** Query vectors for similarity search */
  vectors: number[][];
  /** Maximum number of results to return */
  limit: number;
  /** Search-specific parameters */
  searchParams?: {
    nprobe?: number;
    ef?: number;
    radius?: number;
    rangeFilter?: number;
  };
  /** Filter expression for result refinement */
  filter?: string;
  /** Specific fields to return in results */
  outputFields?: string[];
  /** ReadyAI-specific context filters */
  contextFilter?: {
    projectId?: UUID;
    phase?: PhaseType;
    moduleId?: string;
    relevanceThreshold?: number;
  };
  /** Search timeout in milliseconds */
  timeout?: number;
}

/**
 * Vector search result item
 * Contains similarity score and ReadyAI metadata
 */
export interface VectorSearchResult {
  /** Entity identifier */
  id: string;
  /** Similarity score (distance metric dependent) */
  score: number;
  /** Entity fields and metadata */
  entity?: Record<string, any>;
  /** ReadyAI-specific metadata */
  readyAIMetadata?: {
    projectId?: UUID;
    contextType?: string;
    filePath?: string;
    phase?: PhaseType;
    lastAccessed?: Timestamp;
    relevanceScore?: number;
  };
}

/**
 * Vector insertion request
 * Supports batch operations with ReadyAI context
 */
export interface VectorInsertRequest {
  /** Target collection name */
  collectionName: string;
  /** Vector data to insert */
  data: VectorEntity[];
  /** Partition name (optional) */
  partition?: string;
  /** ReadyAI operation context */
  context?: {
    projectId: UUID;
    phase: PhaseType;
    operationId: UUID;
    batchId?: UUID;
  };
}

/**
 * Vector entity structure
 * Combines vector data with ReadyAI metadata
 */
export interface VectorEntity {
  /** Entity identifier */
  id?: string;
  /** Vector embedding */
  vector: number[];
  /** Entity metadata fields */
  metadata: {
    /** Original text content */
    text?: string;
    /** Source file path */
    filePath?: string;
    /** Content hash for change detection */
    contentHash?: string;
    /** ReadyAI project context */
    projectId?: UUID;
    /** Development phase */
    phase?: PhaseType;
    /** Module identifier */
    moduleId?: string;
    /** Context type */
    contextType?: 'file' | 'dependency' | 'api' | 'config' | 'documentation';
    /** Creation timestamp */
    createdAt?: Timestamp;
    /** Last update timestamp */
    updatedAt?: Timestamp;
    /** Relevance score (0-1) */
    relevanceScore?: number;
    /** Additional custom metadata */
    [key: string]: any;
  };
}

// =============================================================================
// COLLECTION MANAGEMENT
// =============================================================================

/**
 * Collection information with statistics
 * Enhanced with ReadyAI usage metrics
 */
export interface CollectionInfo {
  /** Collection name */
  name: string;
  /** Schema information */
  schema: CollectionSchema;
  /** Collection statistics */
  stats: CollectionStats;
  /** Index information */
  indexes: IndexInfo[];
  /** Partition information */
  partitions?: PartitionInfo[];
  /** ReadyAI-specific metrics */
  readyAIMetrics?: {
    totalProjects: number;
    averageRelevanceScore: number;
    lastSearchTime?: Timestamp;
    searchFrequency: number;
  };
}

/**
 * Collection schema definition
 * Follows Cline's structured schema patterns
 */
export interface CollectionSchema {
  /** Collection name */
  name: string;
  /** Field definitions */
  fields: FieldSchema[];
  /** Auto-generated ID enabled */
  autoId: boolean;
  /** Description */
  description?: string;
}

/**
 * Field schema for collection
 * Comprehensive field type support
 */
export interface FieldSchema {
  /** Field name */
  name: string;
  /** Data type */
  dataType: 'Bool' | 'Int8' | 'Int16' | 'Int32' | 'Int64' | 'Float' | 'Double' | 'String' | 'VarChar' | 'JSON' | 'FloatVector' | 'BinaryVector';
  /** Field description */
  description?: string;
  /** Primary key indicator */
  isPrimaryKey?: boolean;
  /** Auto ID generation */
  autoId?: boolean;
  /** Vector dimension (for vector fields) */
  dimension?: number;
  /** Maximum length (for string fields) */
  maxLength?: number;
  /** Default value */
  defaultValue?: any;
}

/**
 * Collection statistics
 * Performance and usage metrics following Cline patterns
 */
export interface CollectionStats {
  /** Total number of entities */
  entityCount: number;
  /** Collection size in bytes */
  sizeInBytes: number;
  /** Memory usage in bytes */
  memoryUsage: number;
  /** Last compaction time */
  lastCompactionTime?: Timestamp;
  /** Number of segments */
  segmentCount: number;
  /** Index build progress */
  indexBuildProgress: number;
}

/**
 * Index information
 * Detailed index configuration and status
 */
export interface IndexInfo {
  /** Field name */
  fieldName: string;
  /** Index name */
  indexName: string;
  /** Index type */
  indexType: string;
  /** Index parameters */
  params: Record<string, any>;
  /** Index state */
  state: 'Unissued' | 'InProgress' | 'Finished' | 'Failed';
  /** Build progress (0-100) */
  buildProgress: number;
}

/**
 * Partition information
 * Collection partitioning for performance
 */
export interface PartitionInfo {
  /** Partition name */
  name: string;
  /** Entity count in partition */
  entityCount: number;
  /** Created timestamp */
  createdAt: Timestamp;
  /** Partition tags */
  tags?: string[];
}

// =============================================================================
// EMBEDDING MANAGEMENT
// =============================================================================

/**
 * Embedding generation request
 * Supports batch processing and caching
 */
export interface EmbeddingRequest {
  /** Text content to embed */
  texts: string[];
  /** Model to use for embedding */
  model?: string;
  /** Cache keys for embedding reuse */
  cacheKeys?: string[];
  /** ReadyAI context for the request */
  context?: {
    projectId: UUID;
    operationId: UUID;
    priority: 'low' | 'normal' | 'high' | 'critical';
  };
  /** Batch processing options */
  batchOptions?: {
    maxBatchSize: number;
    timeoutMs: number;
  };
}

/**
 * Embedding generation result
 * Comprehensive result with performance metrics
 */
export interface EmbeddingResult {
  /** Generated embeddings */
  embeddings: number[][];
  /** Model used for generation */
  model: string;
  /** Processing statistics */
  stats: {
    totalTexts: number;
    cacheHits: number;
    processingTimeMs: number;
    tokensProcessed: number;
  };
  /** Any warnings or issues */
  warnings?: string[];
  /** Error details if partial failure */
  errors?: Array<{
    index: number;
    error: string;
  }>;
}

/**
 * Embedding cache entry
 * Optimized caching with LRU eviction
 */
export interface EmbeddingCacheEntry {
  /** Cache key */
  cacheKey: string;
  /** Text hash for validation */
  textHash: string;
  /** Cached embedding */
  embedding: number[];
  /** Model used */
  modelName: string;
  /** Embedding dimension */
  dimension: number;
  /** Cache metadata */
  metadata: {
    createdAt: Timestamp;
    accessedAt: Timestamp;
    accessCount: number;
    expiresAt?: Timestamp;
    sizeBytes: number;
  };
}

// =============================================================================
// OPERATION RESULTS AND STATUS
// =============================================================================

/**
 * Vector database operation result
 * Standardized result structure following Cline patterns
 */
export interface VectorOperationResult<T = any> {
  /** Operation success status */
  success: boolean;
  /** Result data */
  data?: T;
  /** Error details if operation failed */
  error?: ErrorDetails;
  /** Operation metadata */
  metadata: {
    /** Operation duration in milliseconds */
    durationMs: number;
    /** Operation timestamp */
    timestamp: Timestamp;
    /** Operation identifier */
    operationId: UUID;
    /** Affected collections */
    affectedCollections?: string[];
  };
  /** Performance metrics */
  performance?: {
    vectorsProcessed: number;
    throughputVectorsPerSecond: number;
    memoryUsedBytes: number;
    diskUsedBytes: number;
  };
}

/**
 * Batch operation result
 * Results for multiple vector operations
 */
export interface BatchVectorOperationResult {
  /** Overall batch success */
  success: boolean;
  /** Individual operation results */
  results: VectorOperationResult[];
  /** Batch statistics */
  stats: {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    totalDurationMs: number;
    averageDurationMs: number;
  };
  /** First error encountered (if any) */
  firstError?: ErrorDetails;
  /** All errors from failed operations */
  errors: ErrorDetails[];
}

// =============================================================================
// HEALTH MONITORING AND DIAGNOSTICS
// =============================================================================

/**
 * Vector database health status
 * Comprehensive health monitoring following Cline patterns
 */
export interface VectorDatabaseHealth {
  /** Overall health status */
  isHealthy: boolean;
  /** Connection status */
  connection: {
    isConnected: boolean;
    connectionCount: number;
    responseTimeMs: number;
    lastChecked: Timestamp;
  };
  /** Memory usage statistics */
  memory: {
    totalBytes: number;
    usedBytes: number;
    availableBytes: number;
    utilizationPercent: number;
  };
  /** Storage statistics */
  storage: {
    totalBytes: number;
    usedBytes: number;
    availableBytes: number;
    utilizationPercent: number;
  };
  /** Performance metrics */
  performance: {
    queriesPerSecond: number;
    averageQueryLatencyMs: number;
    insertionsPerSecond: number;
    averageInsertLatencyMs: number;
  };
  /** Collection health */
  collections: Array<{
    name: string;
    isHealthy: boolean;
    entityCount: number;
    lastChecked: Timestamp;
  }>;
  /** Any health issues */
  issues: Array<{
    severity: 'warning' | 'error' | 'critical';
    message: string;
    component: string;
    timestamp: Timestamp;
  }>;
}

/**
 * Vector database diagnostics
 * Detailed diagnostic information for troubleshooting
 */
export interface VectorDatabaseDiagnostics {
  /** System information */
  system: {
    version: string;
    uptime: number;
    nodeCount: number;
    mode: 'standalone' | 'cluster';
  };
  /** Configuration snapshot */
  config: Partial<VectorDatabaseConfig>;
  /** Active connections */
  connections: Array<{
    id: string;
    clientAddress: string;
    connectedAt: Timestamp;
    lastActivity: Timestamp;
  }>;
  /** Recent operations */
  recentOperations: Array<{
    type: string;
    collection: string;
    duration: number;
    timestamp: Timestamp;
    status: 'success' | 'error';
  }>;
  /** Performance trends */
  trends: {
    queryLatency: Array<{
      timestamp: Timestamp;
      latencyMs: number;
    }>;
    throughput: Array<{
      timestamp: Timestamp;
      operationsPerSecond: number;
    }>;
  };
}

// =============================================================================
// READYAI INTEGRATION TYPES
// =============================================================================

/**
 * ReadyAI context node with vector embedding
 * Semantic project understanding with vector search support
 */
export interface VectorContextNode {
  /** Unique context identifier */
  id: UUID;
  /** Project this context belongs to */
  projectId: UUID;
  /** Context type */
  type: 'file' | 'dependency' | 'api' | 'config' | 'documentation';
  /** File path or identifier */
  path: string;
  /** Content or summary */
  content: string;
  /** Vector embedding for semantic search */
  embedding?: number[];
  /** Embedding model used */
  embeddingModel?: string;
  /** Dependencies this context relies on */
  dependencies: UUID[];
  /** Contexts that depend on this one */
  dependents: UUID[];
  /** Relevance score for retrieval (0-1) */
  relevanceScore: number;
  /** Last access timestamp */
  lastAccessed: Timestamp;
  /** Vector metadata for search optimization */
  vectorMetadata: {
    collectionName: string;
    vectorId?: string;
    lastEmbedded?: Timestamp;
    embeddingVersion: string;
  };
}

/**
 * Semantic search configuration for ReadyAI
 * Context-aware search with project filtering
 */
export interface SemanticSearchConfig {
  /** Target project for search scope */
  projectId?: UUID;
  /** Development phase filter */
  phase?: PhaseType;
  /** Content type filters */
  contentTypes?: Array<'file' | 'dependency' | 'api' | 'config' | 'documentation'>;
  /** Relevance threshold (0-1) */
  relevanceThreshold: number;
  /** Maximum results to return */
  maxResults: number;
  /** Search strategy */
  strategy: 'exact' | 'semantic' | 'hybrid';
  /** Boost factors for different content types */
  boostFactors?: Record<string, number>;
}

/**
 * Semantic search result with ReadyAI context
 * Enhanced search results with project relevance
 */
export interface SemanticSearchResult {
  /** Context node information */
  contextNode: VectorContextNode;
  /** Similarity score */
  score: number;
  /** Matched text snippet */
  snippet?: string;
  /** Explanation of relevance */
  explanation?: string;
  /** Related context nodes */
  relatedNodes?: Array<{
    id: UUID;
    relationship: 'dependency' | 'dependent' | 'similar';
    score: number;
  }>;
}

// =============================================================================
// CACHE AND PERFORMANCE OPTIMIZATION
// =============================================================================

/**
 * Vector cache configuration
 * Performance optimization for frequent operations
 */
export interface VectorCacheConfig {
  /** Enable vector result caching */
  enabled: boolean;
  /** Cache size limits */
  limits: {
    maxEntries: number;
    maxMemoryMB: number;
    maxDiskMB?: number;
  };
  /** Cache eviction policy */
  evictionPolicy: 'LRU' | 'LFU' | 'TTL';
  /** TTL settings */
  ttl: {
    defaultSeconds: number;
    searchResults: number;
    embeddings: number;
    collections: number;
  };
  /** Cache persistence */
  persistence?: {
    enabled: boolean;
    path: string;
    syncIntervalSeconds: number;
  };
}

/**
 * Vector operation performance metrics
 * Detailed performance tracking
 */
export interface VectorPerformanceMetrics {
  /** Operation type */
  operationType: 'search' | 'insert' | 'update' | 'delete' | 'embed';
  /** Collection name */
  collection: string;
  /** Performance data */
  metrics: {
    /** Total operation time */
    totalTimeMs: number;
    /** Vector processing time */
    vectorProcessingMs: number;
    /** Network latency */
    networkLatencyMs: number;
    /** Vectors processed */
    vectorCount: number;
    /** Throughput (vectors/second) */
    throughput: number;
    /** Memory usage peak */
    peakMemoryMB: number;
  };
  /** Cache performance */
  cache?: {
    hits: number;
    misses: number;
    hitRate: number;
    evictions: number;
  };
  /** Timestamp */
  timestamp: Timestamp;
}

// =============================================================================
// ERROR HANDLING AND VALIDATION
// =============================================================================

/**
 * Vector database specific error types
 * Enhanced error handling following Cline patterns
 */
export interface VectorDatabaseError extends ReadyAIError {
  /** Vector-specific error code */
  vectorErrorCode: 'CONNECTION_FAILED' | 'COLLECTION_NOT_FOUND' | 'DIMENSION_MISMATCH' | 
                   'INDEX_BUILD_FAILED' | 'QUOTA_EXCEEDED' | 'INVALID_VECTOR' | 
                   'SEARCH_TIMEOUT' | 'EMBEDDING_FAILED';
  /** Collection name (if applicable) */
  collection?: string;
  /** Vector dimension information */
  dimensionInfo?: {
    expected: number;
    received: number;
  };
  /** Suggested recovery actions */
  recoveryActions?: string[];
}

/**
 * Vector operation validation result
 * Comprehensive validation for vector operations
 */
export interface VectorValidationResult extends ValidationResult {
  /** Vector-specific validations */
  vectorValidations: Array<{
    type: 'dimension' | 'format' | 'range' | 'metadata';
    field: string;
    valid: boolean;
    message: string;
    suggestion?: string;
  }>;
  /** Collection compatibility check */
  collectionCompatibility?: {
    compatible: boolean;
    issues: string[];
    suggestions: string[];
  };
}

// =============================================================================
// UTILITY TYPES AND CONSTANTS
// =============================================================================

/**
 * Supported vector database operations
 */
export type VectorOperationType = 
  | 'create_collection'
  | 'drop_collection' 
  | 'insert_vectors'
  | 'search_vectors'
  | 'delete_vectors'
  | 'update_vectors'
  | 'build_index'
  | 'drop_index'
  | 'flush_collection'
  | 'compact_collection';

/**
 * Vector data types supported
 */
export type VectorDataType = 'float32' | 'float64' | 'binary';

/**
 * Collection states
 */
export type CollectionState = 'NotExist' | 'NotLoaded' | 'Loading' | 'Loaded';

/**
 * Default configurations following Cline patterns
 */
export const DEFAULT_VECTOR_CONFIG: VectorDatabaseConfig = {
  host: 'localhost',
  port: 19530,
  timeout: 30000,
  maxConnections: 10,
  retry: {
    attempts: 3,
    backoffMs: 1000
  },
  healthCheckInterval: 60
} as const;

export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  model: 'all-MiniLM-L6-v2',
  provider: 'sentence-transformers',
  maxTextLength: 8192,
  batchSize: 32,
  cache: {
    enabled: true,
    ttlSeconds: 3600,
    maxEntries: 10000
  }
} as const;

export const DEFAULT_CACHE_CONFIG: VectorCacheConfig = {
  enabled: true,
  limits: {
    maxEntries: 1000,
    maxMemoryMB: 256
  },
  evictionPolicy: 'LRU',
  ttl: {
    defaultSeconds: 3600,
    searchResults: 300,
    embeddings: 86400,
    collections: 1800
  }
} as const;

/**
 * Vector database constants
 */
export const VECTOR_CONSTANTS = {
  MAX_COLLECTION_NAME_LENGTH: 255,
  MAX_FIELD_NAME_LENGTH: 64,
  MAX_DIMENSION: 32768,
  MIN_DIMENSION: 1,
  MAX_TOP_K: 16384,
  MAX_BATCH_SIZE: 1000,
  DEFAULT_CONSISTENCY_LEVEL: 'Bounded'
} as const;

/**
 * Export all types for external consumption
 */
export type {
  VectorDatabaseConfig,
  VectorCollectionConfig,
  EmbeddingConfig,
  VectorSearchQuery,
  VectorSearchResult,
  VectorInsertRequest,
  VectorEntity,
  CollectionInfo,
  CollectionSchema,
  FieldSchema,
  CollectionStats,
  IndexInfo,
  PartitionInfo,
  EmbeddingRequest,
  EmbeddingResult,
  EmbeddingCacheEntry,
  VectorOperationResult,
  BatchVectorOperationResult,
  VectorDatabaseHealth,
  VectorDatabaseDiagnostics,
  VectorContextNode,
  SemanticSearchConfig,
  SemanticSearchResult,
  VectorCacheConfig,
  VectorPerformanceMetrics,
  VectorDatabaseError,
  VectorValidationResult
};
