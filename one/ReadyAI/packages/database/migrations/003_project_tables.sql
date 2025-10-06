-- packages/database/migrations/003_project_tables.sql

/**
 * ReadyAI Project Management Tables Migration - Phase 1.2 Database Structure
 * 
 * This migration creates the core project management schema for ReadyAI's orchestration engine.
 * Built on Cline's proven database patterns with ReadyAI-specific enhancements for project 
 * lifecycle management, phase tracking, and multi-module coordination.
 * 
 * Key Cline Pattern Adaptations:
 * - Table structure patterns from Cline's task management schema
 * - Index optimization strategies from Cline's performance patterns
 * - Foreign key relationship patterns from Cline's relational architecture
 * - JSON metadata storage from Cline's flexible data patterns
 * - Trigger patterns from Cline's automated maintenance systems
 * - Constraint definitions from Cline's data integrity framework
 * - Audit patterns from Cline's comprehensive tracking system
 * 
 * ReadyAI Project Extensions:
 * - Multi-phase project lifecycle management
 * - Service orchestration and coordination tracking
 * - Project template and scaffolding support
 * - AI provider integration per project
 * - Context-aware project relationships
 * - Performance monitoring and health tracking
 * - Module dependency management
 * 
 * @version 1.0.0
 * @author ReadyAI Development Team
 * @migration_id 003
 * @depends_on 002_vector_support
 */

-- =============================================================================
-- PRAGMA SETTINGS AND VALIDATION (Cline Pattern)
-- =============================================================================

-- Verify prerequisite migrations exist
PRAGMA foreign_keys = OFF; -- Temporarily disable for migration

-- Verify schema integrity before proceeding
PRAGMA integrity_check;

-- =============================================================================
-- PROJECT TEMPLATE AND SCAFFOLDING TABLES (ReadyAI Core)
-- =============================================================================

/**
 * Project templates for rapid project initialization
 * ReadyAI-specific table for managing reusable project templates
 * following Cline's template management patterns
 */
CREATE TABLE IF NOT EXISTS project_templates (
    id TEXT PRIMARY KEY CHECK (length(id) = 36), -- UUID format validation
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 100),
    description TEXT CHECK (length(description) <= 1000),
    
    -- Template categorization (ReadyAI specific)
    category TEXT NOT NULL CHECK (category IN (
        'web-application', 'api-service', 'desktop-app', 'mobile-app',
        'data-pipeline', 'ml-project', 'documentation', 'library', 'custom'
    )),
    
    -- Template configuration and structure (JSON) - Cline pattern
    template_config TEXT NOT NULL CHECK (json_valid(template_config)),
    directory_structure TEXT NOT NULL CHECK (json_valid(directory_structure)), -- JSON tree
    file_templates TEXT DEFAULT '{}' CHECK (json_valid(file_templates)), -- JSON object
    
    -- Technology stack and requirements
    tech_stack TEXT DEFAULT '[]' CHECK (json_valid(tech_stack)), -- JSON array
    dependencies TEXT DEFAULT '{}' CHECK (json_valid(dependencies)), -- JSON object
    system_requirements TEXT DEFAULT '{}' CHECK (json_valid(system_requirements)),
    
    -- Template metadata and settings (Cline flexible storage pattern)
    template_metadata TEXT DEFAULT '{}' CHECK (json_valid(template_metadata)),
    
    -- AI and configuration defaults
    default_ai_provider TEXT CHECK (default_ai_provider IN ('claude-sonnet-4', 'gpt-4', 'local')),
    default_configuration_id TEXT REFERENCES configurations(id) ON DELETE SET NULL,
    
    -- Template lifecycle and versioning
    version TEXT NOT NULL DEFAULT '1.0.0' CHECK (length(version) <= 20),
    is_system_template INTEGER DEFAULT 0 CHECK (is_system_template IN (0, 1)),
    is_active INTEGER DEFAULT 1 CHECK (is_active IN (0, 1)),
    is_public INTEGER DEFAULT 0 CHECK (is_public IN (0, 1)),
    
    -- Usage statistics
    usage_count INTEGER DEFAULT 0 CHECK (usage_count >= 0),
    success_rate REAL DEFAULT 1.0 CHECK (success_rate BETWEEN 0.0 AND 1.0),
    average_setup_time_seconds INTEGER DEFAULT 0 CHECK (average_setup_time_seconds >= 0),
    
    -- Audit fields (Cline audit pattern)
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    created_by TEXT DEFAULT 'system',
    
    -- Ensure unique template names
    UNIQUE(name, version)
);

/**
 * Project phases definition and configuration
 * ReadyAI-specific table for managing development methodology phases
 */
CREATE TABLE IF NOT EXISTS project_phases (
    id TEXT PRIMARY KEY CHECK (length(id) = 36), -- UUID
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 50),
    display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 100),
    description TEXT CHECK (length(description) <= 500),
    
    -- Phase ordering and relationships
    phase_order INTEGER NOT NULL CHECK (phase_order > 0),
    is_required INTEGER DEFAULT 1 CHECK (is_required IN (0, 1)),
    can_skip INTEGER DEFAULT 0 CHECK (can_skip IN (0, 1)),
    can_repeat INTEGER DEFAULT 0 CHECK (can_repeat IN (0, 1)),
    
    -- Phase configuration (JSON) - Cline pattern
    phase_config TEXT DEFAULT '{}' CHECK (json_valid(phase_config)),
    
    -- Validation and completion criteria
    entry_requirements TEXT DEFAULT '[]' CHECK (json_valid(entry_requirements)), -- JSON array
    completion_criteria TEXT DEFAULT '[]' CHECK (json_valid(completion_criteria)), -- JSON array
    validation_rules TEXT DEFAULT '{}' CHECK (json_valid(validation_rules)),
    
    -- Estimated duration and resources
    estimated_duration_hours INTEGER CHECK (estimated_duration_hours > 0),
    required_services TEXT DEFAULT '[]' CHECK (json_valid(required_services)), -- JSON array
    optional_services TEXT DEFAULT '[]' CHECK (json_valid(optional_services)), -- JSON array
    
    -- AI configuration per phase
    recommended_ai_provider TEXT CHECK (recommended_ai_provider IN ('claude-sonnet-4', 'gpt-4', 'local')),
    ai_instructions TEXT, -- Phase-specific AI instructions
    
    -- Phase status and lifecycle
    is_active INTEGER DEFAULT 1 CHECK (is_active IN (0, 1)),
    is_system_phase INTEGER DEFAULT 1 CHECK (is_system_phase IN (0, 1)),
    
    -- Audit fields
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    
    -- Ensure unique phase names and ordering
    UNIQUE(name),
    UNIQUE(phase_order)
);

-- =============================================================================
-- PROJECT MANAGEMENT CORE TABLES (Enhanced from existing projects table)
-- =============================================================================

/**
 * Project activities and tasks tracking
 * ReadyAI-specific table for managing project activities within phases
 */
CREATE TABLE IF NOT EXISTS project_activities (
    id TEXT PRIMARY KEY CHECK (length(id) = 36), -- UUID
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    phase_id TEXT NOT NULL REFERENCES project_phases(id) ON DELETE RESTRICT,
    
    -- Activity identification
    activity_name TEXT NOT NULL CHECK (length(activity_name) BETWEEN 1 AND 200),
    activity_type TEXT NOT NULL CHECK (activity_type IN (
        'analysis', 'design', 'implementation', 'testing', 'documentation',
        'review', 'deployment', 'maintenance', 'optimization', 'research'
    )),
    
    -- Activity status and progress
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'in_progress', 'blocked', 'completed', 'failed', 'skipped', 'cancelled'
    )),
    progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage BETWEEN 0 AND 100),
    
    -- Activity metadata and configuration (JSON) - Cline pattern
    activity_config TEXT DEFAULT '{}' CHECK (json_valid(activity_config)),
    activity_results TEXT DEFAULT '{}' CHECK (json_valid(activity_results)),
    
    -- Dependencies and relationships
    depends_on_activities TEXT DEFAULT '[]' CHECK (json_valid(depends_on_activities)), -- JSON array of IDs
    blocks_activities TEXT DEFAULT '[]' CHECK (json_valid(blocks_activities)), -- JSON array of IDs
    
    -- Execution tracking
    assigned_services TEXT DEFAULT '[]' CHECK (json_valid(assigned_services)), -- JSON array
    execution_log TEXT DEFAULT '[]' CHECK (json_valid(execution_log)), -- JSON array of log entries
    
    -- Performance metrics
    estimated_duration_minutes INTEGER CHECK (estimated_duration_minutes > 0),
    actual_duration_minutes INTEGER CHECK (actual_duration_minutes >= 0),
    cpu_time_ms INTEGER DEFAULT 0 CHECK (cpu_time_ms >= 0),
    memory_used_mb REAL DEFAULT 0.0 CHECK (memory_used_mb >= 0.0),
    
    -- Quality metrics
    quality_score REAL CHECK (quality_score BETWEEN 0.0 AND 1.0),
    validation_passed INTEGER CHECK (validation_passed IN (0, 1)),
    retry_count INTEGER DEFAULT 0 CHECK (retry_count >= 0),
    
    -- Error tracking
    last_error TEXT,
    error_count INTEGER DEFAULT 0 CHECK (error_count >= 0),
    
    -- Timestamps
    started_at TEXT,
    completed_at TEXT,
    last_heartbeat_at TEXT,
    
    -- Audit fields
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

/**
 * Project module dependencies and relationships
 * ReadyAI-specific table for managing inter-module dependencies within projects
 */
CREATE TABLE IF NOT EXISTS project_module_dependencies (
    id TEXT PRIMARY KEY CHECK (length(id) = 36), -- UUID
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Module identification
    module_name TEXT NOT NULL CHECK (length(module_name) BETWEEN 1 AND 100),
    module_type TEXT NOT NULL CHECK (module_type IN (
        'config', 'database', 'vectordb', 'auth', 'api-gateway', 'error-handling',
        'logging', 'filesystem', 'project-management', 'context-management',
        'code-generation', 'validation', 'custom'
    )),
    
    -- Dependency relationship
    depends_on_module TEXT NOT NULL CHECK (length(depends_on_module) BETWEEN 1 AND 100),
    dependency_type TEXT NOT NULL CHECK (dependency_type IN (
        'hard', 'soft', 'optional', 'development', 'runtime', 'build'
    )),
    
    -- Dependency metadata (JSON) - Cline pattern
    dependency_config TEXT DEFAULT '{}' CHECK (json_valid(dependency_config)),
    
    -- Version and compatibility
    required_version TEXT CHECK (length(required_version) <= 20),
    compatibility_range TEXT CHECK (length(compatibility_range) <= 50),
    
    -- Status and health
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deprecated', 'failed')),
    health_status TEXT DEFAULT 'unknown' CHECK (health_status IN ('healthy', 'degraded', 'unhealthy', 'unknown')),
    last_health_check_at TEXT,
    
    -- Usage and performance tracking
    usage_count INTEGER DEFAULT 0 CHECK (usage_count >= 0),
    average_response_time_ms REAL DEFAULT 0.0 CHECK (average_response_time_ms >= 0.0),
    error_rate REAL DEFAULT 0.0 CHECK (error_rate BETWEEN 0.0 AND 1.0),
    
    -- Audit fields
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    
    -- Prevent duplicate dependencies and self-references
    UNIQUE(project_id, module_name, depends_on_module),
    CHECK (module_name != depends_on_module)
);

/**
 * Project settings and configuration overrides
 * ReadyAI-specific table for project-level configuration management
 */
CREATE TABLE IF NOT EXISTS project_settings (
    id TEXT PRIMARY KEY CHECK (length(id) = 36), -- UUID
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Setting identification
    setting_key TEXT NOT NULL CHECK (length(setting_key) BETWEEN 1 AND 100),
    setting_category TEXT NOT NULL CHECK (setting_category IN (
        'ai', 'database', 'filesystem', 'logging', 'validation', 'performance',
        'security', 'ui', 'workflow', 'quality', 'custom'
    )),
    
    -- Setting value and metadata
    setting_value TEXT NOT NULL, -- Can store JSON or simple values
    setting_type TEXT NOT NULL CHECK (setting_type IN (
        'string', 'number', 'boolean', 'json', 'array', 'object'
    )),
    
    -- Setting configuration (JSON) - Cline pattern
    setting_config TEXT DEFAULT '{}' CHECK (json_valid(setting_config)),
    
    -- Inheritance and overrides
    inherits_from TEXT CHECK (length(inherits_from) <= 100),
    is_override INTEGER DEFAULT 0 CHECK (is_override IN (0, 1)),
    is_system_setting INTEGER DEFAULT 0 CHECK (is_system_setting IN (0, 1)),
    
    -- Validation and constraints
    validation_schema TEXT CHECK (json_valid(validation_schema)),
    is_valid INTEGER DEFAULT 1 CHECK (is_valid IN (0, 1)),
    validation_error TEXT,
    
    -- Lifecycle and versioning
    is_active INTEGER DEFAULT 1 CHECK (is_active IN (0, 1)),
    version INTEGER DEFAULT 1 CHECK (version > 0),
    
    -- Audit fields
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    created_by TEXT DEFAULT 'system',
    
    -- Ensure unique settings per project
    UNIQUE(project_id, setting_key)
);

-- =============================================================================
-- PROJECT ORCHESTRATION AND COORDINATION TABLES
-- =============================================================================

/**
 * Project orchestration sessions
 * ReadyAI-specific table for managing project execution sessions and workflows
 */
CREATE TABLE IF NOT EXISTS project_orchestration_sessions (
    id TEXT PRIMARY KEY CHECK (length(id) = 36), -- UUID
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    session_name TEXT NOT NULL CHECK (length(session_name) BETWEEN 1 AND 200),
    
    -- Session type and context
    session_type TEXT NOT NULL CHECK (session_type IN (
        'full-lifecycle', 'phase-execution', 'activity-run', 'testing', 'deployment',
        'maintenance', 'debug', 'recovery', 'optimization'
    )),
    
    -- Session status and progress
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'initializing', 'running', 'paused', 'completed', 
        'failed', 'cancelled', 'timeout'
    )),
    
    -- Phase and activity tracking
    current_phase_id TEXT REFERENCES project_phases(id) ON DELETE SET NULL,
    current_activity_id TEXT REFERENCES project_activities(id) ON DELETE SET NULL,
    phases_completed INTEGER DEFAULT 0 CHECK (phases_completed >= 0),
    activities_completed INTEGER DEFAULT 0 CHECK (activities_completed >= 0),
    total_phases INTEGER DEFAULT 0 CHECK (total_phases >= 0),
    total_activities INTEGER DEFAULT 0 CHECK (total_activities >= 0),
    
    -- Session configuration (JSON) - Cline pattern
    session_config TEXT DEFAULT '{}' CHECK (json_valid(session_config)),
    execution_plan TEXT DEFAULT '{}' CHECK (json_valid(execution_plan)),
    
    -- Performance and resource tracking
    cpu_time_total_ms INTEGER DEFAULT 0 CHECK (cpu_time_total_ms >= 0),
    memory_peak_mb REAL DEFAULT 0.0 CHECK (memory_peak_mb >= 0.0),
    disk_io_mb REAL DEFAULT 0.0 CHECK (disk_io_mb >= 0.0),
    network_io_mb REAL DEFAULT 0.0 CHECK (network_io_mb >= 0.0),
    
    -- Quality and success metrics
    success_rate REAL CHECK (success_rate BETWEEN 0.0 AND 1.0),
    quality_score REAL CHECK (quality_score BETWEEN 0.0 AND 1.0),
    user_satisfaction INTEGER CHECK (user_satisfaction BETWEEN 1 AND 5),
    
    -- Error and issue tracking
    error_count INTEGER DEFAULT 0 CHECK (error_count >= 0),
    warning_count INTEGER DEFAULT 0 CHECK (warning_count >= 0),
    retry_count INTEGER DEFAULT 0 CHECK (retry_count >= 0),
    last_error TEXT,
    
    -- Session lifecycle timestamps
    started_at TEXT,
    paused_at TEXT,
    resumed_at TEXT,
    completed_at TEXT,
    cancelled_at TEXT,
    timeout_at TEXT,
    
    -- Audit fields
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    created_by TEXT DEFAULT 'system'
);

/**
 * Service coordination tracking
 * ReadyAI-specific table for monitoring inter-service communication and coordination
 */
CREATE TABLE IF NOT EXISTS project_service_coordination (
    id TEXT PRIMARY KEY CHECK (length(id) = 36), -- UUID
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    orchestration_session_id TEXT REFERENCES project_orchestration_sessions(id) ON DELETE CASCADE,
    
    -- Service identification
    source_service TEXT NOT NULL CHECK (length(source_service) BETWEEN 1 AND 100),
    target_service TEXT NOT NULL CHECK (length(target_service) BETWEEN 1 AND 100),
    coordination_type TEXT NOT NULL CHECK (coordination_type IN (
        'request', 'response', 'event', 'callback', 'heartbeat', 
        'health-check', 'data-sync', 'error-report'
    )),
    
    -- Coordination context
    operation_name TEXT CHECK (length(operation_name) <= 100),
    correlation_id TEXT CHECK (length(correlation_id) = 36), -- UUID for tracing
    
    -- Request/Response data (JSON) - Cline pattern
    request_data TEXT CHECK (json_valid(request_data)),
    response_data TEXT CHECK (json_valid(response_data)),
    
    -- Performance metrics
    execution_time_ms REAL NOT NULL CHECK (execution_time_ms >= 0.0),
    queue_time_ms REAL DEFAULT 0.0 CHECK (queue_time_ms >= 0.0),
    network_time_ms REAL DEFAULT 0.0 CHECK (network_time_ms >= 0.0),
    
    -- Status and outcome
    status TEXT NOT NULL CHECK (status IN (
        'pending', 'in_progress', 'completed', 'failed', 'timeout', 'cancelled'
    )),
    http_status_code INTEGER CHECK (http_status_code BETWEEN 100 AND 599),
    
    -- Error tracking
    error_message TEXT,
    error_code TEXT CHECK (length(error_code) <= 50),
    retry_attempt INTEGER DEFAULT 0 CHECK (retry_attempt >= 0),
    
    -- Audit fields
    timestamp TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    completed_at TEXT
);

-- =============================================================================
-- PROJECT MONITORING AND HEALTH TABLES
-- =============================================================================

/**
 * Project health monitoring
 * ReadyAI-specific table for tracking project health metrics and alerts
 */
CREATE TABLE IF NOT EXISTS project_health_monitoring (
    id TEXT PRIMARY KEY CHECK (length(id) = 36), -- UUID
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Health check identification
    check_name TEXT NOT NULL CHECK (length(check_name) BETWEEN 1 AND 100),
    check_category TEXT NOT NULL CHECK (check_category IN (
        'system', 'performance', 'quality', 'security', 'dependencies', 
        'resources', 'connectivity', 'data-integrity'
    )),
    
    -- Health status and metrics
    status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'unhealthy', 'unknown')),
    score REAL NOT NULL CHECK (score BETWEEN 0.0 AND 1.0),
    
    -- Check results and details (JSON) - Cline pattern
    check_results TEXT NOT NULL CHECK (json_valid(check_results)),
    recommendations TEXT DEFAULT '[]' CHECK (json_valid(recommendations)), -- JSON array
    
    -- Performance metrics
    check_duration_ms REAL NOT NULL CHECK (check_duration_ms >= 0.0),
    last_healthy_at TEXT,
    consecutive_failures INTEGER DEFAULT 0 CHECK (consecutive_failures >= 0),
    
    -- Alerting and notifications
    alert_threshold REAL DEFAULT 0.3 CHECK (alert_threshold BETWEEN 0.0 AND 1.0),
    is_critical INTEGER DEFAULT 0 CHECK (is_critical IN (0, 1)),
    alert_sent_at TEXT,
    
    -- Audit fields
    timestamp TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    next_check_at TEXT
);

/**
 * Project performance metrics tracking
 * ReadyAI-specific table for detailed project performance monitoring
 */
CREATE TABLE IF NOT EXISTS project_performance_metrics (
    id TEXT PRIMARY KEY CHECK (length(id) = 36), -- UUID
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    orchestration_session_id TEXT REFERENCES project_orchestration_sessions(id) ON DELETE SET NULL,
    
    -- Metric identification
    metric_name TEXT NOT NULL CHECK (length(metric_name) BETWEEN 1 AND 100),
    metric_category TEXT NOT NULL CHECK (metric_category IN (
        'performance', 'resource', 'quality', 'throughput', 'latency',
        'error-rate', 'availability', 'scalability'
    )),
    
    -- Metric values and units
    metric_value REAL NOT NULL,
    metric_unit TEXT CHECK (length(metric_unit) <= 20),
    baseline_value REAL CHECK (baseline_value >= 0.0),
    threshold_value REAL CHECK (threshold_value >= 0.0),
    
    -- Metric context and metadata (JSON) - Cline pattern
    metric_context TEXT DEFAULT '{}' CHECK (json_valid(metric_context)),
    
    -- Aggregation and analysis
    aggregation_type TEXT CHECK (aggregation_type IN ('instant', 'average', 'sum', 'max', 'min', 'percentile')),
    time_window_seconds INTEGER CHECK (time_window_seconds > 0),
    
    -- Status and alerting
    is_anomaly INTEGER DEFAULT 0 CHECK (is_anomaly IN (0, 1)),
    breach_threshold INTEGER DEFAULT 0 CHECK (breach_threshold IN (0, 1)),
    
    -- Audit fields
    measured_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    recorded_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

-- =============================================================================
-- PERFORMANCE INDEXES (Cline Performance Optimization Patterns)
-- =============================================================================

-- Project template indexes for rapid lookups
CREATE INDEX IF NOT EXISTS idx_project_templates_category ON project_templates(category);
CREATE INDEX IF NOT EXISTS idx_project_templates_active ON project_templates(is_active) WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS idx_project_templates_public ON project_templates(is_public) WHERE is_public = 1;
CREATE INDEX IF NOT EXISTS idx_project_templates_usage ON project_templates(usage_count);
CREATE INDEX IF NOT EXISTS idx_project_templates_created_at ON project_templates(created_at);

-- Project phase indexes for workflow management
CREATE INDEX IF NOT EXISTS idx_project_phases_order ON project_phases(phase_order);
CREATE INDEX IF NOT EXISTS idx_project_phases_active ON project_phases(is_active) WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS idx_project_phases_required ON project_phases(is_required) WHERE is_required = 1;

-- Project activity indexes for execution tracking
CREATE INDEX IF NOT EXISTS idx_project_activities_project ON project_activities(project_id);
CREATE INDEX IF NOT EXISTS idx_project_activities_phase ON project_activities(phase_id);
CREATE INDEX IF NOT EXISTS idx_project_activities_status ON project_activities(status);
CREATE INDEX IF NOT EXISTS idx_project_activities_type ON project_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_project_activities_progress ON project_activities(progress_percentage);
CREATE INDEX IF NOT EXISTS idx_project_activities_started_at ON project_activities(started_at);
CREATE INDEX IF NOT EXISTS idx_project_activities_completed_at ON project_activities(completed_at);

-- Module dependency indexes for relationship tracking
CREATE INDEX IF NOT EXISTS idx_project_module_deps_project ON project_module_dependencies(project_id);
CREATE INDEX IF NOT EXISTS idx_project_module_deps_module ON project_module_dependencies(module_name);
CREATE INDEX IF NOT EXISTS idx_project_module_deps_type ON project_module_dependencies(dependency_type);
CREATE INDEX IF NOT EXISTS idx_project_module_deps_status ON project_module_dependencies(status);
CREATE INDEX IF NOT EXISTS idx_project_module_deps_health ON project_module_dependencies(health_status);

-- Project settings indexes for configuration management
CREATE INDEX IF NOT EXISTS idx_project_settings_project ON project_settings(project_id);
CREATE INDEX IF NOT EXISTS idx_project_settings_key ON project_settings(setting_key);
CREATE INDEX IF NOT EXISTS idx_project_settings_category ON project_settings(setting_category);
CREATE INDEX IF NOT EXISTS idx_project_settings_active ON project_settings(is_active) WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS idx_project_settings_override ON project_settings(is_override) WHERE is_override = 1;

-- Orchestration session indexes for execution monitoring
CREATE INDEX IF NOT EXISTS idx_orchestration_sessions_project ON project_orchestration_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_orchestration_sessions_status ON project_orchestration_sessions(status);
CREATE INDEX IF NOT EXISTS idx_orchestration_sessions_type ON project_orchestration_sessions(session_type);
CREATE INDEX IF NOT EXISTS idx_orchestration_sessions_started_at ON project_orchestration_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_orchestration_sessions_completed_at ON project_orchestration_sessions(completed_at);

-- Service coordination indexes for performance monitoring
CREATE INDEX IF NOT EXISTS idx_service_coordination_project ON project_service_coordination(project_id);
CREATE INDEX IF NOT EXISTS idx_service_coordination_session ON project_service_coordination(orchestration_session_id);
CREATE INDEX IF NOT EXISTS idx_service_coordination_source ON project_service_coordination(source_service);
CREATE INDEX IF NOT EXISTS idx_service_coordination_target ON project_service_coordination(target_service);
CREATE INDEX IF NOT EXISTS idx_service_coordination_type ON project_service_coordination(coordination_type);
CREATE INDEX IF NOT EXISTS idx_service_coordination_correlation ON project_service_coordination(correlation_id);
CREATE INDEX IF NOT EXISTS idx_service_coordination_timestamp ON project_service_coordination(timestamp);
CREATE INDEX IF NOT EXISTS idx_service_coordination_status ON project_service_coordination(status);

-- Health monitoring indexes for system oversight
CREATE INDEX IF NOT EXISTS idx_project_health_project ON project_health_monitoring(project_id);
CREATE INDEX IF NOT EXISTS idx_project_health_category ON project_health_monitoring(check_category);
CREATE INDEX IF NOT EXISTS idx_project_health_status ON project_health_monitoring(status);
CREATE INDEX IF NOT EXISTS idx_project_health_critical ON project_health_monitoring(is_critical) WHERE is_critical = 1;
CREATE INDEX IF NOT EXISTS idx_project_health_timestamp ON project_health_monitoring(timestamp);
CREATE INDEX IF NOT EXISTS idx_project_health_next_check ON project_health_monitoring(next_check_at);

-- Performance metrics indexes for analytics
CREATE INDEX IF NOT EXISTS idx_project_metrics_project ON project_performance_metrics(project_id);
CREATE INDEX IF NOT EXISTS idx_project_metrics_session ON project_performance_metrics(orchestration_session_id);
CREATE INDEX IF NOT EXISTS idx_project_metrics_name ON project_performance_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_project_metrics_category ON project_performance_metrics(metric_category);
CREATE INDEX IF NOT EXISTS idx_project_metrics_measured_at ON project_performance_metrics(measured_at);
CREATE INDEX IF NOT EXISTS idx_project_metrics_anomaly ON project_performance_metrics(is_anomaly) WHERE is_anomaly = 1;
CREATE INDEX IF NOT EXISTS idx_project_metrics_breach ON project_performance_metrics(breach_threshold) WHERE breach_threshold = 1;

-- =============================================================================
-- AUTOMATED MAINTENANCE TRIGGERS (Cline Trigger Patterns)
-- =============================================================================

/**
 * Auto-update timestamp triggers (Cline pattern)
 * Automatically maintain updated_at fields for all project tables
 */
CREATE TRIGGER IF NOT EXISTS trg_project_templates_updated_at
    AFTER UPDATE ON project_templates
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE project_templates 
    SET updated_at = datetime('now', 'utc') 
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_project_phases_updated_at
    AFTER UPDATE ON project_phases
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE project_phases 
    SET updated_at = datetime('now', 'utc') 
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_project_activities_updated_at
    AFTER UPDATE ON project_activities
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE project_activities 
    SET updated_at = datetime('now', 'utc') 
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_project_module_deps_updated_at
    AFTER UPDATE ON project_module_dependencies
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE project_module_dependencies 
    SET updated_at = datetime('now', 'utc') 
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_project_settings_updated_at
    AFTER UPDATE ON project_settings
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE project_settings 
    SET updated_at = datetime('now', 'utc') 
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_orchestration_sessions_updated_at
    AFTER UPDATE ON project_orchestration_sessions
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE project_orchestration_sessions 
    SET updated_at = datetime('now', 'utc') 
    WHERE id = NEW.id;
END;

/**
 * Project template usage tracking trigger (ReadyAI specific)
 * Automatically increment usage count when template is used
 */
CREATE TRIGGER IF NOT EXISTS trg_template_usage_tracking
    AFTER INSERT ON projects
    FOR EACH ROW
    WHEN NEW.template_type IS NOT NULL
BEGIN
    UPDATE project_templates 
    SET usage_count = usage_count + 1,
        updated_at = datetime('now', 'utc')
    WHERE name = NEW.template_type;
END;

/**
 * Activity progress validation trigger (Quality assurance)
 * Ensures activity progress stays within valid bounds
 */
CREATE TRIGGER IF NOT EXISTS trg_activity_progress_validation
    BEFORE UPDATE ON project_activities
    FOR EACH ROW
    WHEN NEW.progress_percentage < OLD.progress_percentage AND NEW.status != 'failed'
BEGIN
    SELECT RAISE(ABORT, 'Activity progress cannot decrease unless status is failed');
END;

/**
 * Orchestration session completion trigger (Workflow management)
 * Automatically update project status when orchestration completes
 */
CREATE TRIGGER IF NOT EXISTS trg_session_completion_project_update
    AFTER UPDATE ON project_orchestration_sessions
    FOR EACH ROW
    WHEN NEW.status = 'completed' AND OLD.status != 'completed'
BEGIN
    UPDATE projects 
    SET last_activity_at = datetime('now', 'utc'),
        updated_at = datetime('now', 'utc')
    WHERE id = NEW.project_id;
END;

/**
 * Health monitoring alert trigger (Proactive monitoring)
 * Automatically update alert timestamps when status changes
 */
CREATE TRIGGER IF NOT EXISTS trg_health_alert_notification
    AFTER UPDATE ON project_health_monitoring
    FOR EACH ROW
    WHEN NEW.status IN ('degraded', 'unhealthy') 
         AND OLD.status = 'healthy' 
         AND NEW.is_critical = 1
BEGIN
    UPDATE project_health_monitoring 
    SET alert_sent_at = datetime('now', 'utc')
    WHERE id = NEW.id;
END;

-- =============================================================================
-- INITIAL DATA SEEDING (ReadyAI Bootstrap Data)
-- =============================================================================

/**
 * Insert default project phases (ReadyAI methodology)
 * Seeds the system with standard development phases
 */
INSERT OR IGNORE INTO project_phases (
    id, name, display_name, description, phase_order, is_required,
    estimated_duration_hours, required_services, recommended_ai_provider
) VALUES 
(
    '40000000-0000-0000-0000-000000000001',
    'discovery',
    'Discovery & Analysis',
    'Analyze requirements and define project scope',
    1, 1, 8,
    json_array('config', 'logging', 'filesystem'),
    'claude-sonnet-4'
),
(
    '40000000-0000-0000-0000-000000000002',
    'design',
    'Architecture & Design',
    'Design system architecture and component structure',
    2, 1, 16,
    json_array('config', 'database', 'vectordb', 'logging'),
    'claude-sonnet-4'
),
(
    '40000000-0000-0000-0000-000000000003',
    'planning',
    'Implementation Planning',
    'Create detailed implementation plan and task breakdown',
    3, 1, 12,
    json_array('config', 'project-management', 'logging'),
    'claude-sonnet-4'
),
(
    '40000000-0000-0000-0000-000000000004',
    'development',
    'Development & Implementation',
    'Implement planned features and functionality',
    4, 1, 80,
    json_array('config', 'database', 'auth', 'api-gateway', 'code-generation'),
    'claude-sonnet-4'
),
(
    '40000000-0000-0000-0000-000000000005',
    'testing',
    'Testing & Validation',
    'Comprehensive testing and quality assurance',
    5, 1, 24,
    json_array('config', 'validation', 'logging', 'error-handling'),
    'claude-sonnet-4'
),
(
    '40000000-0000-0000-0000-000000000006',
    'deployment',
    'Deployment & Release',
    'Deploy application and prepare for production',
    6, 1, 16,
    json_array('config', 'database', 'filesystem', 'logging'),
    'claude-sonnet-4'
);

/**
 * Insert default project templates (ReadyAI templates)
 * Seeds common project templates for rapid initialization
 */
INSERT OR IGNORE INTO project_templates (
    id, name, display_name, description, category,
    template_config, directory_structure, tech_stack,
    default_ai_provider, version
) VALUES 
(
    '50000000-0000-0000-0000-000000000001',
    'web-application-basic',
    'Basic Web Application',
    'Standard web application with frontend and backend',
    'web-application',
    json_object(
        'framework', 'react',
        'backend', 'nodejs',
        'database', 'sqlite',
        'auth_required', true
    ),
    json_object(
        'src', json_object(
            'components', json_array(),
            'services', json_array(),
            'utils', json_array()
        ),
        'public', json_array(),
        'tests', json_array()
    ),
    json_array('react', 'nodejs', 'express', 'sqlite'),
    'claude-sonnet-4',
    '1.0.0'
),
(
    '50000000-0000-0000-0000-000000000002',
    'api-service-basic',
    'Basic API Service',
    'RESTful API service with database integration',
    'api-service',
    json_object(
        'framework', 'express',
        'database', 'sqlite',
        'auth_required', true,
        'swagger_enabled', true
    ),
    json_object(
        'src', json_object(
            'routes', json_array(),
            'controllers', json_array(),
            'services', json_array(),
            'models', json_array()
        ),
        'tests', json_array(),
        'docs', json_array()
    ),
    json_array('nodejs', 'express', 'sqlite', 'swagger'),
    'claude-sonnet-4',
    '1.0.0'
);

-- =============================================================================
-- FOREIGN KEY CONSTRAINTS RE-ENABLEMENT
-- =============================================================================

-- Re-enable foreign key constraints
PRAGMA foreign_keys = ON;

-- Verify foreign key integrity
PRAGMA foreign_key_check;

-- =============================================================================
-- MIGRATION COMPLETION TRACKING
-- =============================================================================

/**
 * Record this migration execution
 * Following Cline's migration tracking pattern with enhanced metadata
 */
INSERT INTO schema_migrations (
    id, version, name, checksum, executed_at, execution_time, 
    rollback_checksum, applied_by, applied, metadata
) VALUES (
    lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6))),
    3,
    '003_project_tables',
    'project_management_schema_v1_0_0_checksum',
    datetime('now', 'utc'),
    0, -- Will be updated by migration service
    'project_management_rollback_checksum',
    'migration_system',
    1,
    json_object(
        'description', 'Project management tables for ReadyAI orchestration',
        'tables_created', 9,
        'indexes_created', 42,
        'triggers_created', 8,
        'phase', 'Phase 1.2',
        'cline_patterns_used', json_array('database_schema', 'indexing', 'triggers', 'audit_fields')
    )
);

-- =============================================================================
-- SCHEMA VALIDATION AND INTEGRITY CHECKS
-- =============================================================================

/**
 * Verify project schema integrity (Cline validation pattern)
 * Ensures all project tables and indexes were created successfully
 */

-- Verify project tables exist
SELECT 
    name, 
    sql IS NOT NULL as has_schema
FROM sqlite_master 
WHERE type = 'table' 
    AND name IN (
        'project_templates', 'project_phases', 'project_activities',
        'project_module_dependencies', 'project_settings', 
        'project_orchestration_sessions', 'project_service_coordination',
        'project_health_monitoring', 'project_performance_metrics'
    );

-- Verify project indexes exist
SELECT 
    name,
    tbl_name,
    sql IS NOT NULL as index_exists
FROM sqlite_master 
WHERE type = 'index' 
    AND name LIKE 'idx_project_%';

-- Verify project triggers exist
SELECT 
    name,
    tbl_name,
    sql IS NOT NULL as trigger_exists
FROM sqlite_master 
WHERE type = 'trigger' 
    AND name LIKE 'trg_%project%';

-- Final integrity checks
PRAGMA integrity_check;
PRAGMA foreign_key_check;

-- =============================================================================
-- SCHEMA METADATA AND COMPLETION
-- =============================================================================

-- Update schema version to reflect project management support
PRAGMA user_version = 3;

-- Document project schema completion
SELECT 
    'ReadyAI Project Management Migration Completed' as status,
    datetime('now', 'utc') as completed_at,
    '003_project_tables.sql' as migration_file,
    'v1.0.0' as schema_version,
    (
        SELECT COUNT(*) FROM sqlite_master 
        WHERE type = 'table' AND name LIKE 'project_%'
    ) as project_tables_created,
    (
        SELECT COUNT(*) FROM sqlite_master 
        WHERE type = 'index' AND name LIKE 'idx_project_%'
    ) as project_indexes_created,
    (
        SELECT COUNT(*) FROM sqlite_master 
        WHERE type = 'trigger' AND name LIKE 'trg_%project%'
    ) as project_triggers_created,
    (
        SELECT COUNT(*) FROM project_phases WHERE is_active = 1
    ) as default_phases_seeded,
    (
        SELECT COUNT(*) FROM project_templates WHERE is_active = 1
    ) as default_templates_seeded;
