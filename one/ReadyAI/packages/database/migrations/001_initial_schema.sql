-- packages/database/migrations/001_initial_schema.sql
-- ReadyAI Initial Database Schema - Production-grade SQLite schema with comprehensive indexing
-- 
-- Adapted from Cline schema patterns with ReadyAI-specific extensions including:
-- - Core ReadyAI entities (projects, sessions, users, configurations)
-- - Comprehensive logging and telemetry infrastructure
-- - Phase tracking for ReadyAI methodology analytics
-- - Performance monitoring and audit trails
-- - Full-text search capabilities and optimized indexes
--
-- Pattern Reuse: Reference from Cline database patterns (90%+ reuse)
-- Key Modifications: ReadyAI tables, indexes, constraints for development orchestrator
-- Dependencies: None (base schema migration)

-- Enable foreign key constraints and optimize SQLite performance
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000; -- 64MB cache
PRAGMA temp_store = MEMORY;

-- =============================================================================
-- CORE READYAI ENTITIES
-- =============================================================================

-- Users table for authentication and user management
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    preferences TEXT, -- JSON preferences
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

-- Sessions table for authentication and activity tracking
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    token_hash TEXT UNIQUE NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    expires_at TEXT NOT NULL,
    last_activity_at TEXT NOT NULL,
    metadata TEXT, -- JSON metadata
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Projects table for ReadyAI project management
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    user_id TEXT NOT NULL,
    workspace_path TEXT NOT NULL,
    template_type TEXT,
    phase TEXT NOT NULL DEFAULT 'initialization' CHECK (phase IN ('initialization', 'planning', 'implementation', 'testing', 'deployment', 'maintenance')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived', 'failed')),
    ai_provider TEXT NOT NULL DEFAULT 'claude-sonnet-4',
    configuration TEXT, -- JSON configuration
    metadata TEXT, -- JSON metadata
    last_activity_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Configurations table for AI and system configuration management
CREATE TABLE IF NOT EXISTS configurations (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL DEFAULT 'project' CHECK (type IN ('project', 'global', 'template', 'user')),
    user_id TEXT,
    ai_settings TEXT NOT NULL, -- JSON AI configuration
    quality_settings TEXT NOT NULL, -- JSON quality requirements
    development_settings TEXT, -- JSON development preferences
    is_default BOOLEAN DEFAULT FALSE,
    is_template BOOLEAN DEFAULT FALSE,
    version TEXT NOT NULL DEFAULT '1.0.0',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Artifacts table for generated code files and assets
CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('file', 'directory', 'snippet', 'image', 'document')),
    path TEXT NOT NULL,
    content TEXT,
    content_hash TEXT,
    size_bytes INTEGER DEFAULT 0,
    mime_type TEXT,
    phase TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'generated', 'reviewed', 'approved', 'deployed')),
    validation_results TEXT, -- JSON validation results
    metadata TEXT, -- JSON metadata
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Dependencies table for tracking project and artifact dependencies
CREATE TABLE IF NOT EXISTS dependencies (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    version TEXT,
    type TEXT NOT NULL CHECK (type IN ('npm', 'pip', 'gem', 'composer', 'cargo', 'go', 'maven', 'nuget', 'system')),
    source TEXT, -- registry URL or source location
    status TEXT NOT NULL DEFAULT 'required' CHECK (status IN ('required', 'installed', 'outdated', 'vulnerable', 'removed')),
    metadata TEXT, -- JSON metadata
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- =============================================================================
-- LOGGING AND TELEMETRY INFRASTRUCTURE (Adapted from Cline patterns)
-- =============================================================================

-- Core log entries table with comprehensive indexing
CREATE TABLE IF NOT EXISTS log_entries (
    id TEXT PRIMARY KEY NOT NULL,
    timestamp TEXT NOT NULL,
    level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error', 'fatal')),
    category TEXT NOT NULL CHECK (category IN ('system', 'user', 'ai', 'phase', 'validation', 'performance', 'security', 'audit')),
    message TEXT NOT NULL,
    data TEXT, -- JSON data
    error_code TEXT,
    error_stack TEXT,
    project_id TEXT,
    phase TEXT,
    task_id TEXT,
    source TEXT NOT NULL,
    correlation_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Telemetry events table for performance and usage tracking
CREATE TABLE IF NOT EXISTS telemetry_events (
    id TEXT PRIMARY KEY NOT NULL,
    event TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    properties TEXT, -- JSON properties
    user_id TEXT,
    session_id TEXT,
    project_id TEXT,
    phase TEXT,
    task_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Performance metrics table for system monitoring
CREATE TABLE IF NOT EXISTS performance_metrics (
    id TEXT PRIMARY KEY NOT NULL,
    metric TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT,
    timestamp TEXT NOT NULL,
    labels TEXT, -- JSON labels
    project_id TEXT,
    phase TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Phase tracking events for ReadyAI methodology analytics
CREATE TABLE IF NOT EXISTS phase_tracking_events (
    id TEXT PRIMARY KEY NOT NULL,
    timestamp TEXT NOT NULL,
    project_id TEXT NOT NULL,
    phase TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('started', 'in_progress', 'completed', 'failed', 'skipped')),
    previous_phase TEXT,
    duration INTEGER, -- milliseconds
    artifact_count INTEGER DEFAULT 0,
    token_usage TEXT, -- JSON token usage
    validation_results TEXT, -- JSON validation results
    metadata TEXT, -- JSON metadata
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- =============================================================================
-- SYSTEM TABLES
-- =============================================================================

-- Repository metadata for configuration and statistics
CREATE TABLE IF NOT EXISTS repository_metadata (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Migration tracking table (used by MigrationService)
CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY NOT NULL,
    version INTEGER NOT NULL UNIQUE,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    executed_at TEXT NOT NULL,
    execution_time INTEGER NOT NULL,
    rollback_checksum TEXT,
    applied_by TEXT NOT NULL,
    applied BOOLEAN DEFAULT TRUE,
    metadata TEXT
);

-- =============================================================================
-- INDEXES FOR OPTIMAL PERFORMANCE (Following Cline's indexing strategy)
-- =============================================================================

-- User indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- Session indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity_at);

-- Project indexes
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_phase ON projects(phase);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at);
CREATE INDEX IF NOT EXISTS idx_projects_last_activity ON projects(last_activity_at);
CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);

-- Configuration indexes
CREATE INDEX IF NOT EXISTS idx_configurations_user_id ON configurations(user_id);
CREATE INDEX IF NOT EXISTS idx_configurations_type ON configurations(type);
CREATE INDEX IF NOT EXISTS idx_configurations_name ON configurations(name);
CREATE INDEX IF NOT EXISTS idx_configurations_is_default ON configurations(is_default);
CREATE INDEX IF NOT EXISTS idx_configurations_is_template ON configurations(is_template);

-- Artifact indexes
CREATE INDEX IF NOT EXISTS idx_artifacts_project_id ON artifacts(project_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(type);
CREATE INDEX IF NOT EXISTS idx_artifacts_status ON artifacts(status);
CREATE INDEX IF NOT EXISTS idx_artifacts_phase ON artifacts(phase);
CREATE INDEX IF NOT EXISTS idx_artifacts_created_at ON artifacts(created_at);
CREATE INDEX IF NOT EXISTS idx_artifacts_path ON artifacts(path);
CREATE INDEX IF NOT EXISTS idx_artifacts_content_hash ON artifacts(content_hash);

-- Dependency indexes
CREATE INDEX IF NOT EXISTS idx_dependencies_project_id ON dependencies(project_id);
CREATE INDEX IF NOT EXISTS idx_dependencies_name ON dependencies(name);
CREATE INDEX IF NOT EXISTS idx_dependencies_type ON dependencies(type);
CREATE INDEX IF NOT EXISTS idx_dependencies_status ON dependencies(status);

-- Log entry indexes
CREATE INDEX IF NOT EXISTS idx_log_entries_timestamp ON log_entries(timestamp);
CREATE INDEX IF NOT EXISTS idx_log_entries_level ON log_entries(level);
CREATE INDEX IF NOT EXISTS idx_log_entries_category ON log_entries(category);
CREATE INDEX IF NOT EXISTS idx_log_entries_project_id ON log_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_log_entries_phase ON log_entries(phase);
CREATE INDEX IF NOT EXISTS idx_log_entries_correlation_id ON log_entries(correlation_id);
CREATE INDEX IF NOT EXISTS idx_log_entries_source ON log_entries(source);

-- Telemetry event indexes
CREATE INDEX IF NOT EXISTS idx_telemetry_events_event ON telemetry_events(event);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_timestamp ON telemetry_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_project_id ON telemetry_events(project_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_user_id ON telemetry_events(user_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_session_id ON telemetry_events(session_id);

-- Performance metrics indexes
CREATE INDEX IF NOT EXISTS idx_performance_metrics_metric ON performance_metrics(metric);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_timestamp ON performance_metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_project_id ON performance_metrics(project_id);

-- Phase tracking indexes
CREATE INDEX IF NOT EXISTS idx_phase_tracking_project_phase ON phase_tracking_events(project_id, phase);
CREATE INDEX IF NOT EXISTS idx_phase_tracking_timestamp ON phase_tracking_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_phase_tracking_status ON phase_tracking_events(status);

-- Migration tracking indexes
CREATE INDEX IF NOT EXISTS idx_schema_migrations_version ON schema_migrations(version);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied ON schema_migrations(applied);

-- =============================================================================
-- FULL-TEXT SEARCH INDEXES
-- =============================================================================

-- Full-text search for projects
CREATE VIRTUAL TABLE IF NOT EXISTS projects_fts USING fts5(
    id UNINDEXED,
    name,
    description,
    content='projects',
    content_rowid='rowid'
);

-- Full-text search triggers for projects
CREATE TRIGGER IF NOT EXISTS projects_fts_insert AFTER INSERT ON projects BEGIN
    INSERT INTO projects_fts(rowid, id, name, description) 
    VALUES (new.rowid, new.id, new.name, new.description);
END;

CREATE TRIGGER IF NOT EXISTS projects_fts_delete AFTER DELETE ON projects BEGIN
    INSERT INTO projects_fts(projects_fts, rowid, id, name, description) 
    VALUES ('delete', old.rowid, old.id, old.name, old.description);
END;

CREATE TRIGGER IF NOT EXISTS projects_fts_update AFTER UPDATE ON projects BEGIN
    INSERT INTO projects_fts(projects_fts, rowid, id, name, description) 
    VALUES ('delete', old.rowid, old.id, old.name, old.description);
    INSERT INTO projects_fts(rowid, id, name, description) 
    VALUES (new.rowid, new.id, new.name, new.description);
END;

-- Full-text search for artifacts
CREATE VIRTUAL TABLE IF NOT EXISTS artifacts_fts USING fts5(
    id UNINDEXED,
    name,
    path,
    content,
    content='artifacts',
    content_rowid='rowid'
);

-- Full-text search triggers for artifacts
CREATE TRIGGER IF NOT EXISTS artifacts_fts_insert AFTER INSERT ON artifacts BEGIN
    INSERT INTO artifacts_fts(rowid, id, name, path, content) 
    VALUES (new.rowid, new.id, new.name, new.path, new.content);
END;

CREATE TRIGGER IF NOT EXISTS artifacts_fts_delete AFTER DELETE ON artifacts BEGIN
    INSERT INTO artifacts_fts(artifacts_fts, rowid, id, name, path, content) 
    VALUES ('delete', old.rowid, old.id, old.name, old.path, old.content);
END;

CREATE TRIGGER IF NOT EXISTS artifacts_fts_update AFTER UPDATE ON artifacts BEGIN
    INSERT INTO artifacts_fts(artifacts_fts, rowid, id, name, path, content) 
    VALUES ('delete', old.rowid, old.id, old.name, old.path, old.content);
    INSERT INTO artifacts_fts(rowid, id, name, path, content) 
    VALUES (new.rowid, new.id, new.name, new.path, new.content);
END;

-- =============================================================================
-- TRIGGERS FOR AUTOMATIC TIMESTAMP UPDATES
-- =============================================================================

-- Users updated_at trigger
CREATE TRIGGER IF NOT EXISTS users_updated_at AFTER UPDATE ON users BEGIN
    UPDATE users SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Sessions updated_at trigger
CREATE TRIGGER IF NOT EXISTS sessions_updated_at AFTER UPDATE ON sessions BEGIN
    UPDATE sessions SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Projects updated_at trigger
CREATE TRIGGER IF NOT EXISTS projects_updated_at AFTER UPDATE ON projects BEGIN
    UPDATE projects SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Configurations updated_at trigger
CREATE TRIGGER IF NOT EXISTS configurations_updated_at AFTER UPDATE ON configurations BEGIN
    UPDATE configurations SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Artifacts updated_at trigger
CREATE TRIGGER IF NOT EXISTS artifacts_updated_at AFTER UPDATE ON artifacts BEGIN
    UPDATE artifacts SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Dependencies updated_at trigger
CREATE TRIGGER IF NOT EXISTS dependencies_updated_at AFTER UPDATE ON dependencies BEGIN
    UPDATE dependencies SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- =============================================================================
-- INITIAL DATA SETUP
-- =============================================================================

-- Insert initial repository metadata
INSERT OR IGNORE INTO repository_metadata (key, value) VALUES 
    ('schema_version', '1.0.0'),
    ('created_at', datetime('now')),
    ('last_cleanup', datetime('now')),
    ('migration_status', 'completed');

-- Insert initial configuration templates
INSERT OR IGNORE INTO configurations (
    id, 
    name, 
    description, 
    type, 
    ai_settings, 
    quality_settings, 
    is_default, 
    is_template
) VALUES (
    'default-config',
    'Default ReadyAI Configuration',
    'Standard configuration template for new projects',
    'template',
    '{"provider": "claude-sonnet-4", "model": "claude-3.5-sonnet", "temperature": 0.7, "maxTokens": 4096}',
    '{"minConfidence": 0.8, "maxRetries": 3, "validationRequired": true}',
    TRUE,
    TRUE
);

-- Enable query optimization
PRAGMA optimize;
PRAGMA analysis_limit = 1000;
ANALYZE;
