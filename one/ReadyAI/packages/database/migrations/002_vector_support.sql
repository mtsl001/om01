-- packages/database/migrations/002_vector_support.sql

/**
 * ReadyAI Vector Database Support Migration - Vector Metadata and Collection Management
 * 
 * This migration extends ReadyAI's database schema to support vector operations and metadata
 * management for AI-powered context retrieval and code generation. While marked as "New" in the 
 * implementation plan, it leverages Cline's proven schema patterns for performance optimization,
 * indexing strategies, and data integrity constraints.
 * 
 * Key Cline Pattern Adaptations:
 * - Table structure patterns from Cline's extension schema definitions
 * - Index optimization strategies from Cline's performance tuning
 * - Foreign key relationship patterns from Cline's relational data architecture
 * - JSON column usage from Cline's flexible metadata storage
 * - Trigger patterns from Cline's automated maintenance systems
 * - Constraint definitions from Cline's data integrity patterns
 * 
 * ReadyAI Vector Extensions:
 * - Collection management for organized vector storage
 * - Document and chunk metadata tracking
 * - Vector operation metrics and performance monitoring
 * - Context-aware vector relationships
 * - AI provider integration support for embeddings
 * - Phase-specific vector collections
 * 
 * @version 1.0.0
 * @author ReadyAI Development Team
 * @migration_id 002
 * @depends_on 001_initial_schema
 */

-- =============================================================================
-- PRAGMA SETTINGS AND VALIDATION (Cline Pattern)
-- =============================================================================

-- Verify prerequisite migration exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM schema_migrations 
        WHERE migration_name = '001_initial_schema' 
        AND status = 'completed'
    ) THEN
        RAISE EXCEPTION 'Migration 001_initial_schema must be completed before running this migration';
    END IF;
END $$;

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- Verify existing database schema is ready for vector support
PRAGMA integrity_check;

-- =============================================================================
-- VECTOR COLLECTION MANAGEMENT TABLES (ReadyAI Core)
-- =============================================================================

/**
 * Vector collections for organized storage and retrieval
 * ReadyAI-specific table for managing different types of vector collections
 * following Cline's entity management patterns
 */
CREATE TABLE IF NOT EXISTS vector_collections (
    id TEXT PRIMARY KEY CHECK (length(id) = 36), -- UUID format validation
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    description TEXT CHECK (length(description) <= 500),
    
    -- Collection type and purpose (ReadyAI specific)
    collection_type TEXT NOT NULL CHECK (collection_type IN (
        'code-context', 'documentation', 'project-knowledge', 
        'ai-training', 'user-context', 'system-cache'
    )),
    
    -- Vector configuration (JSON) - Cline pattern
    vector_config TEXT NOT NULL CHECK (json_valid(vector_config)),
    
    -- AI provider and model information
    embedding_provider TEXT CHECK (embedding_provider IN ('openai', 'anthropic', 'cohere', 'local')),
    embedding_model TEXT CHECK (length(embedding_model) <= 100),
    vector_dimension INTEGER CHECK (vector_dimension BETWEEN 128 AND 3072),
    
    -- Collection metadata and settings (JSON) - Cline flexible storage pattern
    collection_settings TEXT DEFAULT '{}' CHECK (json_valid(collection_settings)),
    
    -- Project and configuration relationships
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    configuration_id TEXT REFERENCES configurations(id) ON DELETE SET NULL,
    
    -- Phase-specific collection assignment (ReadyAI specific)
    phase_association TEXT CHECK (phase_association IN (
        'discovery', 'design', 'planning', 'development', 
        'testing', 'deployment', 'maintenance', 'all'
    )),
    
    -- Collection statistics
    document_count INTEGER DEFAULT 0 CHECK (document_count >= 0),
    total_vectors INTEGER DEFAULT 0 CHECK (total_vectors >= 0),
    average_vector_size REAL DEFAULT 0.0 CHECK (average_vector_size >= 0.0),
    
    -- Status and health
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'syncing', 'error', 'archived')),
    health_status TEXT DEFAULT 'unknown' CHECK (health_status IN ('healthy', 'degraded', 'unhealthy', 'unknown')),
    last_sync_at TEXT,
    
    -- Performance metrics
    average_query_time_ms REAL DEFAULT 0.0 CHECK (average_query_time_ms >= 0.0),
    total_queries INTEGER DEFAULT 0 CHECK (total_queries >= 0),
    cache_hit_rate REAL DEFAULT 0.0 CHECK (cache_hit_rate BETWEEN 0.0 AND 1.0),
    
    -- Audit fields (Cline audit pattern)
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    created_by TEXT DEFAULT 'system',
    
    -- Ensure unique collection names per project
    UNIQUE(project_id, name)
);

/**
 * Document metadata for vector content management
 * ReadyAI-specific table for tracking source documents and their vector representations
 */
CREATE TABLE IF NOT EXISTS vector_documents (
    id TEXT PRIMARY KEY CHECK (length(id) = 36), -- UUID
    collection_id TEXT NOT NULL REFERENCES vector_collections(id) ON DELETE CASCADE,
    
    -- Document identification
    document_name TEXT NOT NULL CHECK (length(document_name) BETWEEN 1 AND 255),
    document_path TEXT CHECK (length(document_path) <= 1000),
    document_type TEXT CHECK (document_type IN (
        'source-code', 'documentation', 'configuration', 'test', 
        'README', 'api-spec', 'schema', 'other'
    )),
    
    -- Content metadata
    content_hash TEXT CHECK (length(content_hash) = 64), -- SHA-256 hash
    content_length INTEGER CHECK (content_length >= 0),
    language TEXT CHECK (length(language) <= 20),
    encoding TEXT DEFAULT 'utf-8' CHECK (length(encoding) <= 20),
    
    -- Processing information
    processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN (
        'pending', 'processing', 'completed', 'failed', 'skipped'
    )),
    chunk_count INTEGER DEFAULT 0 CHECK (chunk_count >= 0),
    vector_count INTEGER DEFAULT 0 CHECK (vector_count >= 0),
    
    -- Document metadata (JSON) - Cline pattern
    document_metadata TEXT DEFAULT '{}' CHECK (json_valid(document_metadata)),
    
    -- Processing timestamps
    processed_at TEXT,
    last_modified TEXT,
    indexed_at TEXT,
    
    -- Error tracking
    processing_error TEXT,
    retry_count INTEGER DEFAULT 0 CHECK (retry_count >= 0),
    
    -- Audit fields
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    created_by TEXT DEFAULT 'system',
    
    -- Ensure unique documents per collection
    UNIQUE(collection_id, document_path)
);

/**
 * Vector chunks for fine-grained content management
 * ReadyAI-specific table for managing document chunks and their vector embeddings
 */
CREATE TABLE IF NOT EXISTS vector_chunks (
    id TEXT PRIMARY KEY CHECK (length(id) = 36), -- UUID
    document_id TEXT NOT NULL REFERENCES vector_documents(id) ON DELETE CASCADE,
    collection_id TEXT NOT NULL REFERENCES vector_collections(id) ON DELETE CASCADE,
    
    -- Chunk identification and positioning
    chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
    chunk_hash TEXT CHECK (length(chunk_hash) = 64), -- SHA-256 hash
    
    -- Content information
    content_preview TEXT CHECK (length(content_preview) <= 500), -- First 500 chars for preview
    content_length INTEGER NOT NULL CHECK (content_length > 0),
    line_start INTEGER CHECK (line_start >= 1),
    line_end INTEGER CHECK (line_end >= line_start),
    
    -- Vector information
    vector_id TEXT CHECK (length(vector_id) <= 100), -- External vector database ID
    embedding_provider TEXT CHECK (embedding_provider IN ('openai', 'anthropic', 'cohere', 'local')),
    embedding_model TEXT CHECK (length(embedding_model) <= 100),
    vector_dimension INTEGER CHECK (vector_dimension BETWEEN 128 AND 3072),
    
    -- Chunk metadata and context (JSON) - Cline pattern
    chunk_metadata TEXT DEFAULT '{}' CHECK (json_valid(chunk_metadata)),
    
    -- Processing and quality metrics
    embedding_quality_score REAL CHECK (embedding_quality_score BETWEEN 0.0 AND 1.0),
    similarity_threshold REAL DEFAULT 0.7 CHECK (similarity_threshold BETWEEN 0.0 AND 1.0),
    
    -- Status tracking
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'processing', 'failed')),
    
    -- Performance metrics
    query_count INTEGER DEFAULT 0 CHECK (query_count >= 0),
    average_similarity REAL DEFAULT 0.0 CHECK (average_similarity BETWEEN 0.0 AND 1.0),
    last_accessed_at TEXT,
    
    -- Audit fields
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    processed_at TEXT,
    
    -- Ensure unique chunks per document
    UNIQUE(document_id, chunk_index)
);

-- =============================================================================
-- VECTOR OPERATION TRACKING AND METRICS (ReadyAI Analytics)
-- =============================================================================

/**
 * Vector search operations tracking for analytics and optimization
 * ReadyAI-specific table for monitoring vector database performance
 */
CREATE TABLE IF NOT EXISTS vector_operations (
    id TEXT PRIMARY KEY CHECK (length(id) = 36), -- UUID
    
    -- Operation identification
    operation_type TEXT NOT NULL CHECK (operation_type IN (
        'search', 'insert', 'update', 'delete', 'bulk_insert', 'reindex'
    )),
    collection_id TEXT REFERENCES vector_collections(id) ON DELETE SET NULL,
    
    -- Query information
    query_hash TEXT CHECK (length(query_hash) = 64), -- SHA-256 of query
    query_type TEXT CHECK (query_type IN ('similarity', 'hybrid', 'semantic', 'keyword')),
    result_count INTEGER CHECK (result_count >= 0),
    
    -- Performance metrics
    execution_time_ms REAL NOT NULL CHECK (execution_time_ms >= 0.0),
    cpu_time_ms REAL CHECK (cpu_time_ms >= 0.0),
    memory_used_mb REAL CHECK (memory_used_mb >= 0.0),
    
    -- Query parameters (JSON) - Cline pattern
    query_parameters TEXT CHECK (json_valid(query_parameters)),
    
    -- Results metadata (JSON)
    operation_results TEXT CHECK (json_valid(operation_results)),
    
    -- Context information
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    configuration_id TEXT REFERENCES configurations(id) ON DELETE SET NULL,
    session_id TEXT CHECK (length(session_id) <= 50),
    
    -- Quality metrics
    relevance_score REAL CHECK (relevance_score BETWEEN 0.0 AND 1.0),
    user_feedback TEXT CHECK (user_feedback IN ('helpful', 'not_helpful', 'partially_helpful')),
    
    -- Error tracking
    error_message TEXT,
    error_code TEXT CHECK (length(error_code) <= 50),
    
    -- Audit fields
    timestamp TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    user_id TEXT,
    source_ip TEXT CHECK (length(source_ip) <= 45) -- IPv6 support
);

/**
 * Vector similarity cache for performance optimization
 * ReadyAI-specific table for caching frequently accessed similarity results
 */
CREATE TABLE IF NOT EXISTS vector_similarity_cache (
    id TEXT PRIMARY KEY CHECK (length(id) = 36), -- UUID
    
    -- Cache key components
    query_hash TEXT NOT NULL CHECK (length(query_hash) = 64), -- SHA-256 of query
    collection_id TEXT NOT NULL REFERENCES vector_collections(id) ON DELETE CASCADE,
    parameters_hash TEXT NOT NULL CHECK (length(parameters_hash) = 64), -- SHA-256 of parameters
    
    -- Cached results (JSON) - Cline pattern
    cached_results TEXT NOT NULL CHECK (json_valid(cached_results)),
    result_count INTEGER NOT NULL CHECK (result_count >= 0),
    
    -- Cache metadata
    cache_hit_count INTEGER DEFAULT 0 CHECK (cache_hit_count >= 0),
    cache_quality_score REAL CHECK (cache_quality_score BETWEEN 0.0 AND 1.0),
    
    -- Expiration and management
    expires_at TEXT NOT NULL,
    is_stale INTEGER DEFAULT 0 CHECK (is_stale IN (0, 1)),
    priority INTEGER DEFAULT 1 CHECK (priority BETWEEN 1 AND 10),
    
    -- Performance tracking
    average_retrieval_time_ms REAL CHECK (average_retrieval_time_ms >= 0.0),
    cache_size_bytes INTEGER CHECK (cache_size_bytes > 0),
    
    -- Audit fields
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    last_accessed_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    
    -- Ensure unique cache entries
    UNIQUE(query_hash, collection_id, parameters_hash)
);

-- =============================================================================
-- VECTOR COLLECTION RELATIONSHIPS (ReadyAI Context Management)
-- =============================================================================

/**
 * Collection relationships for context management
 * ReadyAI-specific table for managing relationships between vector collections
 */
CREATE TABLE IF NOT EXISTS vector_collection_relationships (
    id TEXT PRIMARY KEY CHECK (length(id) = 36), -- UUID
    
    -- Relationship definition
    source_collection_id TEXT NOT NULL REFERENCES vector_collections(id) ON DELETE CASCADE,
    target_collection_id TEXT NOT NULL REFERENCES vector_collections(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL CHECK (relationship_type IN (
        'depends_on', 'extends', 'references', 'similar_to', 'derived_from'
    )),
    
    -- Relationship strength and metadata
    relationship_strength REAL DEFAULT 1.0 CHECK (relationship_strength BETWEEN 0.0 AND 1.0),
    relationship_metadata TEXT DEFAULT '{}' CHECK (json_valid(relationship_metadata)),
    
    -- Status and lifecycle
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deprecated')),
    
    -- Audit fields
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    created_by TEXT DEFAULT 'system',
    
    -- Prevent self-references and duplicate relationships
    CHECK (source_collection_id != target_collection_id),
    UNIQUE(source_collection_id, target_collection_id, relationship_type)
);

-- =============================================================================
-- VECTOR PROVIDER CONFIGURATIONS (AI Integration)
-- =============================================================================

/**
 * Vector provider configurations for AI service integration
 * ReadyAI-specific table for managing embedding providers and their configurations
 */
CREATE TABLE IF NOT EXISTS vector_providers (
    id TEXT PRIMARY KEY CHECK (length(id) = 36), -- UUID
    
    -- Provider identification
    provider_name TEXT NOT NULL CHECK (provider_name IN ('openai', 'anthropic', 'cohere', 'local')),
    provider_display_name TEXT NOT NULL CHECK (length(provider_display_name) BETWEEN 1 AND 50),
    
    -- Provider configuration (JSON) - Cline pattern
    provider_config TEXT NOT NULL CHECK (json_valid(provider_config)),
    
    -- Model and capability information
    supported_models TEXT NOT NULL CHECK (json_valid(supported_models)), -- JSON array
    default_model TEXT CHECK (length(default_model) <= 100),
    max_dimension INTEGER CHECK (max_dimension > 0),
    
    -- Connection and status
    api_endpoint TEXT CHECK (length(api_endpoint) <= 200),
    is_enabled INTEGER DEFAULT 1 CHECK (is_enabled IN (0, 1)),
    is_available INTEGER DEFAULT 1 CHECK (is_available IN (0, 1)),
    
    -- Performance metrics
    average_response_time_ms INTEGER DEFAULT 0 CHECK (average_response_time_ms >= 0),
    success_rate REAL DEFAULT 1.0 CHECK (success_rate BETWEEN 0.0 AND 1.0),
    total_embeddings INTEGER DEFAULT 0 CHECK (total_embeddings >= 0),
    failed_embeddings INTEGER DEFAULT 0 CHECK (failed_embeddings >= 0),
    
    -- Cost tracking
    total_tokens_processed INTEGER DEFAULT 0 CHECK (total_tokens_processed >= 0),
    estimated_cost_usd REAL DEFAULT 0.0 CHECK (estimated_cost_usd >= 0.0),
    
    -- Health monitoring
    last_health_check TEXT DEFAULT (datetime('now', 'utc')),
    health_status TEXT DEFAULT 'unknown' CHECK (health_status IN ('healthy', 'degraded', 'unhealthy', 'unknown')),
    
    -- Audit fields
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    
    -- Ensure unique provider names
    UNIQUE(provider_name)
);

-- =============================================================================
-- PERFORMANCE INDEXES (Cline Performance Optimization Patterns)
-- =============================================================================

-- Vector collection indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_vector_collections_type ON vector_collections(collection_type);
CREATE INDEX IF NOT EXISTS idx_vector_collections_project ON vector_collections(project_id);
CREATE INDEX IF NOT EXISTS idx_vector_collections_status ON vector_collections(status);
CREATE INDEX IF NOT EXISTS idx_vector_collections_phase ON vector_collections(phase_association);
CREATE INDEX IF NOT EXISTS idx_vector_collections_health ON vector_collections(health_status);
CREATE INDEX IF NOT EXISTS idx_vector_collections_updated_at ON vector_collections(updated_at);

-- Document indexes for content management
CREATE INDEX IF NOT EXISTS idx_vector_documents_collection ON vector_documents(collection_id);
CREATE INDEX IF NOT EXISTS idx_vector_documents_type ON vector_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_vector_documents_status ON vector_documents(processing_status);
CREATE INDEX IF NOT EXISTS idx_vector_documents_hash ON vector_documents(content_hash);
CREATE INDEX IF NOT EXISTS idx_vector_documents_language ON vector_documents(language);
CREATE INDEX IF NOT EXISTS idx_vector_documents_processed_at ON vector_documents(processed_at);

-- Chunk indexes for fast vector operations
CREATE INDEX IF NOT EXISTS idx_vector_chunks_document ON vector_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_vector_chunks_collection ON vector_chunks(collection_id);
CREATE INDEX IF NOT EXISTS idx_vector_chunks_vector_id ON vector_chunks(vector_id);
CREATE INDEX IF NOT EXISTS idx_vector_chunks_status ON vector_chunks(status);
CREATE INDEX IF NOT EXISTS idx_vector_chunks_provider ON vector_chunks(embedding_provider);
CREATE INDEX IF NOT EXISTS idx_vector_chunks_quality ON vector_chunks(embedding_quality_score);

-- Operation tracking indexes for analytics
CREATE INDEX IF NOT EXISTS idx_vector_operations_type ON vector_operations(operation_type);
CREATE INDEX IF NOT EXISTS idx_vector_operations_collection ON vector_operations(collection_id);
CREATE INDEX IF NOT EXISTS idx_vector_operations_timestamp ON vector_operations(timestamp);
CREATE INDEX IF NOT EXISTS idx_vector_operations_execution_time ON vector_operations(execution_time_ms);
CREATE INDEX IF NOT EXISTS idx_vector_operations_project ON vector_operations(project_id);
CREATE INDEX IF NOT EXISTS idx_vector_operations_session ON vector_operations(session_id);

-- Cache indexes for performance optimization  
CREATE INDEX IF NOT EXISTS idx_vector_cache_query_hash ON vector_similarity_cache(query_hash);
CREATE INDEX IF NOT EXISTS idx_vector_cache_collection ON vector_similarity_cache(collection_id);
CREATE INDEX IF NOT EXISTS idx_vector_cache_expires_at ON vector_similarity_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_vector_cache_last_accessed ON vector_similarity_cache(last_accessed_at);
CREATE INDEX IF NOT EXISTS idx_vector_cache_hit_count ON vector_similarity_cache(cache_hit_count);
CREATE INDEX IF NOT EXISTS idx_vector_cache_priority ON vector_similarity_cache(priority);

-- Relationship indexes for context management
CREATE INDEX IF NOT EXISTS idx_vector_relationships_source ON vector_collection_relationships(source_collection_id);
CREATE INDEX IF NOT EXISTS idx_vector_relationships_target ON vector_collection_relationships(target_collection_id);
CREATE INDEX IF NOT EXISTS idx_vector_relationships_type ON vector_collection_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_vector_relationships_status ON vector_collection_relationships(status);

-- Provider indexes for service management
CREATE INDEX IF NOT EXISTS idx_vector_providers_name ON vector_providers(provider_name);
CREATE INDEX IF NOT EXISTS idx_vector_providers_enabled ON vector_providers(is_enabled) WHERE is_enabled = 1;
CREATE INDEX IF NOT EXISTS idx_vector_providers_health ON vector_providers(health_status);

-- =============================================================================
-- AUTOMATED MAINTENANCE TRIGGERS (Cline Trigger Patterns)
-- =============================================================================

/**
 * Auto-update timestamp triggers (Cline pattern)
 * Automatically maintain updated_at fields for all vector tables
 */
CREATE TRIGGER IF NOT EXISTS trg_vector_collections_updated_at
    AFTER UPDATE ON vector_collections
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE vector_collections 
    SET updated_at = datetime('now', 'utc') 
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_vector_documents_updated_at
    AFTER UPDATE ON vector_documents
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE vector_documents 
    SET updated_at = datetime('now', 'utc') 
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_vector_chunks_updated_at
    AFTER UPDATE ON vector_chunks
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE vector_chunks 
    SET updated_at = datetime('now', 'utc') 
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_vector_providers_updated_at
    AFTER UPDATE ON vector_providers
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE vector_providers 
    SET updated_at = datetime('now', 'utc') 
    WHERE id = NEW.id;
END;

/**
 * Collection statistics maintenance triggers (ReadyAI specific)
 * Automatically update document and vector counts
 */
CREATE TRIGGER IF NOT EXISTS trg_update_collection_document_count
    AFTER INSERT ON vector_documents
    FOR EACH ROW
BEGIN
    UPDATE vector_collections 
    SET document_count = document_count + 1,
        updated_at = datetime('now', 'utc')
    WHERE id = NEW.collection_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_update_collection_document_count_delete
    AFTER DELETE ON vector_documents
    FOR EACH ROW
BEGIN
    UPDATE vector_collections 
    SET document_count = CASE WHEN document_count > 0 THEN document_count - 1 ELSE 0 END,
        updated_at = datetime('now', 'utc')
    WHERE id = OLD.collection_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_update_collection_vector_count
    AFTER INSERT ON vector_chunks
    FOR EACH ROW
BEGIN
    UPDATE vector_collections 
    SET total_vectors = total_vectors + 1,
        updated_at = datetime('now', 'utc')
    WHERE id = NEW.collection_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_update_collection_vector_count_delete
    AFTER DELETE ON vector_chunks
    FOR EACH ROW
BEGIN
    UPDATE vector_collections 
    SET total_vectors = CASE WHEN total_vectors > 0 THEN total_vectors - 1 ELSE 0 END,
        updated_at = datetime('now', 'utc')
    WHERE id = OLD.collection_id;
END;

/**
 * Cache expiration trigger (Performance optimization)
 * Automatically mark expired cache entries as stale
 */
CREATE TRIGGER IF NOT EXISTS trg_mark_expired_cache
    AFTER UPDATE ON vector_similarity_cache
    FOR EACH ROW
    WHEN datetime(NEW.expires_at) < datetime('now', 'utc') AND NEW.is_stale = 0
BEGIN
    UPDATE vector_similarity_cache 
    SET is_stale = 1,
        updated_at = datetime('now', 'utc')
    WHERE id = NEW.id;
END;

-- =============================================================================
-- INITIAL DATA SEEDING (ReadyAI Bootstrap Data)
-- =============================================================================

/**
 * Insert default vector providers (ReadyAI bootstrap)
 * Seeds the system with commonly used embedding providers
 */
INSERT OR IGNORE INTO vector_providers (
    id, provider_name, provider_display_name, provider_config,
    supported_models, default_model, max_dimension
) VALUES 
(
    '20000000-0000-0000-0000-000000000001',
    'openai',
    'OpenAI Embeddings',
    json_object(
        'apiEndpoint', 'https://api.openai.com/v1',
        'apiVersion', 'v1',
        'maxRetries', 3,
        'timeout', 30000,
        'batchSize', 100
    ),
    json_array('text-embedding-ada-002', 'text-embedding-3-small', 'text-embedding-3-large'),
    'text-embedding-3-small',
    3072
),
(
    '20000000-0000-0000-0000-000000000002', 
    'cohere',
    'Cohere Embeddings',
    json_object(
        'apiEndpoint', 'https://api.cohere.ai/v1',
        'maxRetries', 3,
        'timeout', 30000,
        'batchSize', 96
    ),
    json_array('embed-english-v3.0', 'embed-multilingual-v3.0'),
    'embed-english-v3.0',
    1024
),
(
    '20000000-0000-0000-0000-000000000003',
    'local', 
    'Local Embeddings',
    json_object(
        'apiEndpoint', 'http://localhost:11434',
        'timeout', 60000,
        'batchSize', 32
    ),
    json_array('all-MiniLM-L6-v2', 'sentence-transformers/all-mpnet-base-v2'),
    'all-MiniLM-L6-v2',
    384
);

/**
 * Create default system collection for ReadyAI context
 */
INSERT OR IGNORE INTO vector_collections (
    id, name, description, collection_type, vector_config,
    embedding_provider, embedding_model, vector_dimension, phase_association
) VALUES (
    '30000000-0000-0000-0000-000000000001',
    'ReadyAI System Context',
    'Default collection for ReadyAI system documentation and context',
    'system-cache',
    json_object(
        'similarity_threshold', 0.7,
        'max_results', 50,
        'rerank', true,
        'cache_enabled', true
    ),
    'openai',
    'text-embedding-3-small',
    1536,
    'all'
);

-- =============================================================================
-- MIGRATION COMPLETION TRACKING
-- =============================================================================

/**
 * Record this migration execution
 * Following Cline's migration tracking pattern with enhanced metadata
 */
INSERT INTO schema_migrations (
    id, migration_name, version, migration_sql, status, 
    executed_at, executed_by, checksum
) VALUES (
    lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6))),
    '002_vector_support',
    '1.0.0',
    '-- Vector support schema created with comprehensive metadata and performance optimization',
    'completed',
    datetime('now', 'utc'),
    'migration_system',
    '002_vector_support_checksum_placeholder'
);

-- =============================================================================
-- SCHEMA VALIDATION AND INTEGRITY CHECKS
-- =============================================================================

/**
 * Verify vector schema integrity (Cline validation pattern)
 * Ensures all vector tables and indexes were created successfully
 */

-- Verify vector tables exist
SELECT 
    name, 
    sql IS NOT NULL as has_schema
FROM sqlite_master 
WHERE type = 'table' 
    AND name IN (
        'vector_collections', 'vector_documents', 'vector_chunks',
        'vector_operations', 'vector_similarity_cache', 
        'vector_collection_relationships', 'vector_providers'
    );

-- Verify vector indexes exist
SELECT 
    name,
    tbl_name,
    sql IS NOT NULL as index_exists
FROM sqlite_master 
WHERE type = 'index' 
    AND name LIKE 'idx_vector_%';

-- Verify vector triggers exist
SELECT 
    name,
    tbl_name,
    sql IS NOT NULL as trigger_exists
FROM sqlite_master 
WHERE type = 'trigger' 
    AND name LIKE 'trg_%vector%';

-- Final integrity checks
PRAGMA integrity_check;
PRAGMA foreign_key_check;

-- =============================================================================
-- SCHEMA METADATA AND COMPLETION
-- =============================================================================

-- Update schema version to reflect vector support
PRAGMA user_version = 2;

-- Document vector schema completion
SELECT 
    'ReadyAI Vector Support Migration Completed' as status,
    datetime('now', 'utc') as completed_at,
    '002_vector_support.sql' as migration_file,
    'v1.0.0' as schema_version,
    (
        SELECT COUNT(*) FROM sqlite_master 
        WHERE type = 'table' AND name LIKE 'vector_%'
    ) as vector_tables_created,
    (
        SELECT COUNT(*) FROM sqlite_master 
        WHERE type = 'index' AND name LIKE 'idx_vector_%'
    ) as vector_indexes_created,
    (
        SELECT COUNT(*) FROM sqlite_master 
        WHERE type = 'trigger' AND name LIKE 'trg_%vector%'
    ) as vector_triggers_created;
