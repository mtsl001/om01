# Configuration Management Module - Technical Specification

## **1. Module Overview**

**Purpose:** The Configuration Management Module serves as the centralized configuration management system for the entire ReadyAI application, handling environment variable validation, configuration schema management, settings persistence, and configuration hot reloading. This module ensures consistent and reliable configuration across all ReadyAI components while maintaining the local-first architecture principles defined in the HLSD.

**Dependencies:** This module implements the foundational environment variable management patterns defined in the Core Contracts document (`.env.template`) and provides the core configuration services that support the local-first architecture. It integrates directly with the `config` object structure defined in the Project Scaffolding and implements the Zod-based validation patterns for environment variables. The module serves as a critical dependency for all other P0 modules including Database Management, Vector Database Service, Claude Integration Service, and API Gateway Module.

## **2. Module-Specific Type Additions (`types.configuration.ts`)**

```typescript
/**
 * Configuration Management Module Types
 * Extends foundational types with configuration-specific interfaces
 */

/** Configuration change event types */
export type ConfigChangeEventType = 'updated' | 'reloaded' | 'validated' | 'error';

/** Configuration validation severity levels */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/** Configuration source types */
export type ConfigSourceType = 'environment' | 'file' | 'database' | 'default';

/** Configuration scope levels */
export type ConfigScope = 'global' | 'project' | 'user' | 'session';

/** Configuration change event */
export interface ConfigChangeEvent {
  /** Unique event identifier */
  id: UUID;
  /** Type of configuration change */
  eventType: ConfigChangeEventType;
  /** Configuration key that changed */
  configKey: string;
  /** Previous value (if applicable) */
  previousValue?: any;
  /** New value */
  newValue?: any;
  /** Source of the change */
  source: ConfigSourceType;
  /** Timestamp of the change */
  timestamp: string; // ISO 8601 format
  /** Optional metadata */
  metadata?: Record<string, any>;
}

/** Configuration validation result */
export interface ConfigValidationResult {
  /** Validation identifier */
  id: UUID;
  /** Configuration key being validated */
  configKey: string;
  /** Whether validation passed */
  isValid: boolean;
  /** Validation severity */
  severity: ValidationSeverity;
  /** Error or warning message */
  message?: string;
  /** Expected value type or format */
  expectedFormat?: string;
  /** Actual value that failed validation */
  actualValue?: any;
  /** Validation timestamp */
  validatedAt: string; // ISO 8601 format
}

/** Configuration schema definition */
export interface ConfigSchemaDefinition {
  /** Configuration key */
  key: string;
  /** Human-readable description */
  description: string;
  /** Value type */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  /** Whether the configuration is required */
  required: boolean;
  /** Default value if not provided */
  defaultValue?: any;
  /** Validation pattern (for string types) */
  pattern?: string;
  /** Minimum value (for number types) */
  minimum?: number;
  /** Maximum value (for number types) */
  maximum?: number;
  /** Allowed values (enum) */
  allowedValues?: any[];
  /** Configuration scope */
  scope: ConfigScope;
  /** Whether this config supports hot reloading */
  hotReloadable: boolean;
  /** Dependencies on other config keys */
  dependencies?: string[];
}

/** Configuration watcher callback */
export interface ConfigWatcher {
  /** Unique watcher identifier */
  id: UUID;
  /** Configuration keys to watch */
  watchKeys: string[];
  /** Callback function to execute on change */
  callback: (event: ConfigChangeEvent) => void | Promise<void>;
  /** Whether watcher is currently active */
  active: boolean;
  /** Watcher creation timestamp */
  createdAt: string; // ISO 8601 format
}

/** Configuration backup */
export interface ConfigBackup {
  /** Backup identifier */
  id: UUID;
  /** Backup name/label */
  name: string;
  /** Configuration snapshot */
  configSnapshot: Record<string, any>;
  /** Backup creation timestamp */
  createdAt: string; // ISO 8601 format
  /** Backup description */
  description?: string;
  /** Whether this is an automatic backup */
  isAutomatic: boolean;
}

/** Configuration health status */
export interface ConfigHealth {
  /** Overall health status */
  status: 'healthy' | 'warning' | 'error';
  /** Total number of configurations */
  totalConfigs: number;
  /** Number of valid configurations */
  validConfigs: number;
  /** Number of configurations with warnings */
  warningConfigs: number;
  /** Number of invalid configurations */
  errorConfigs: number;
  /** Recent validation results */
  recentValidations: ConfigValidationResult[];
  /** Last health check timestamp */
  lastCheckedAt: string; // ISO 8601 format
}
```

## **3. API Endpoint Specification (OpenAPI `paths` block)**

```yaml
paths:
  /api/v1/config:
    get:
      tags:
        - Configuration
      summary: Get all configuration values
      description: Retrieves all configuration values with optional filtering by scope or keys
      security:
        - localAuth: []
      parameters:
        - name: scope
          in: query
          description: Filter configurations by scope
          required: false
          schema:
            type: string
            enum: [global, project, user, session]
        - name: keys
          in: query
          description: Comma-separated list of specific configuration keys to retrieve
          required: false
          schema:
            type: string
      responses:
        '200':
          description: Configuration values retrieved successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          configurations:
                            type: object
                            additionalProperties: true
                          totalCount:
                            type: integer
                          scope:
                            type: string
        '400':
          description: Invalid request parameters
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiErrorResponse'
        '500':
          description: Internal server error
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiErrorResponse'

    put:
      tags:
        - Configuration
      summary: Update configuration values
      description: Updates one or more configuration values with validation
      security:
        - localAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                configurations:
                  type: object
                  additionalProperties: true
                validateOnly:
                  type: boolean
                  default: false
                backup:
                  type: boolean
                  default: true
              required:
                - configurations
      responses:
        '200':
          description: Configuration values updated successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          updatedKeys:
                            type: array
                            items:
                              type: string
                          validationResults:
                            type: array
                            items:
                              $ref: '#/components/schemas/ConfigValidationResult'
                          backupId:
                            $ref: '#/components/schemas/UUID'
        '400':
          description: Validation errors or invalid configuration values
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiErrorResponse'
                  - type: object
                    properties:
                      error:
                        type: object
                        properties:
                          validationErrors:
                            type: array
                            items:
                              $ref: '#/components/schemas/ConfigValidationResult'
        '500':
          description: Internal server error
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiErrorResponse'

  /api/v1/config/validate:
    post:
      tags:
        - Configuration
      summary: Validate configuration values
      description: Validates configuration values without applying changes
      security:
        - localAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                configurations:
                  type: object
                  additionalProperties: true
                strictMode:
                  type: boolean
                  default: false
              required:
                - configurations
      responses:
        '200':
          description: Validation completed
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          validationResults:
                            type: array
                            items:
                              $ref: '#/components/schemas/ConfigValidationResult'
                          overallStatus:
                            type: string
                            enum: [valid, warning, error]
        '400':
          description: Invalid request format
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiErrorResponse'

  /api/v1/config/schema:
    get:
      tags:
        - Configuration
      summary: Get configuration schema
      description: Retrieves the complete configuration schema definitions
      security:
        - localAuth: []
      responses:
        '200':
          description: Configuration schema retrieved successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          schemas:
                            type: array
                            items:
                              $ref: '#/components/schemas/ConfigSchemaDefinition'
                          version:
                            type: string

  /api/v1/config/reload:
    post:
      tags:
        - Configuration
      summary: Reload configuration from sources
      description: Triggers a reload of configuration from all sources (environment, files, etc.)
      security:
        - localAuth: []
      requestBody:
        required: false
        content:
          application/json:
            schema:
              type: object
              properties:
                sources:
                  type: array
                  items:
                    type: string
                    enum: [environment, file, database, default]
                validateAfterReload:
                  type: boolean
                  default: true
      responses:
        '200':
          description: Configuration reloaded successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          reloadedKeys:
                            type: array
                            items:
                              type: string
                          validationResults:
                            type: array
                            items:
                              $ref: '#/components/schemas/ConfigValidationResult'
                          reloadedAt:
                            type: string
                            format: date-time

  /api/v1/config/backup:
    get:
      tags:
        - Configuration
      summary: List configuration backups
      description: Retrieves list of available configuration backups
      security:
        - localAuth: []
      parameters:
        - name: limit
          in: query
          description: Maximum number of backups to return
          required: false
          schema:
            type: integer
            minimum: 1
            maximum: 100
            default: 20
        - name: automaticOnly
          in: query
          description: Filter to automatic backups only
          required: false
          schema:
            type: boolean
      responses:
        '200':
          description: Backup list retrieved successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          backups:
                            type: array
                            items:
                              $ref: '#/components/schemas/ConfigBackup'
                          totalCount:
                            type: integer

    post:
      tags:
        - Configuration
      summary: Create configuration backup
      description: Creates a new backup of current configuration
      security:
        - localAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
                  minLength: 1
                  maxLength: 100
                description:
                  type: string
                  maxLength: 500
                includeSecrets:
                  type: boolean
                  default: false
              required:
                - name
      responses:
        '201':
          description: Backup created successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/ConfigBackup'

  /api/v1/config/backup/{backupId}:
    get:
      tags:
        - Configuration
      summary: Get specific backup details
      description: Retrieves details of a specific configuration backup
      security:
        - localAuth: []
      parameters:
        - name: backupId
          in: path
          required: true
          schema:
            $ref: '#/components/schemas/UUID'
      responses:
        '200':
          description: Backup details retrieved successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/ConfigBackup'
        '404':
          description: Backup not found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiErrorResponse'

    delete:
      tags:
        - Configuration
      summary: Delete configuration backup
      description: Deletes a specific configuration backup
      security:
        - localAuth: []
      parameters:
        - name: backupId
          in: path
          required: true
          schema:
            $ref: '#/components/schemas/UUID'
      responses:
        '200':
          description: Backup deleted successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiResponse'
        '404':
          description: Backup not found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiErrorResponse'

  /api/v1/config/restore/{backupId}:
    post:
      tags:
        - Configuration
      summary: Restore from backup
      description: Restores configuration from a specific backup
      security:
        - localAuth: []
      parameters:
        - name: backupId
          in: path
          required: true
          schema:
            $ref: '#/components/schemas/UUID'
      requestBody:
        required: false
        content:
          application/json:
            schema:
              type: object
              properties:
                selectedKeys:
                  type: array
                  items:
                    type: string
                validateBeforeRestore:
                  type: boolean
                  default: true
                createBackupBeforeRestore:
                  type: boolean
                  default: true
      responses:
        '200':
          description: Configuration restored successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          restoredKeys:
                            type: array
                            items:
                              type: string
                          preRestoreBackupId:
                            $ref: '#/components/schemas/UUID'
                          restoredAt:
                            type: string
                            format: date-time

  /api/v1/config/health:
    get:
      tags:
        - Configuration
      summary: Get configuration health status
      description: Retrieves the current health status of the configuration system
      security:
        - localAuth: []
      responses:
        '200':
          description: Configuration health status retrieved successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/ConfigHealth'

  /api/v1/config/watchers:
    get:
      tags:
        - Configuration
      summary: List configuration watchers
      description: Retrieves list of active configuration watchers
      security:
        - localAuth: []
      responses:
        '200':
          description: Watchers list retrieved successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          watchers:
                            type: array
                            items:
                              $ref: '#/components/schemas/ConfigWatcher'
                          activeCount:
                            type: integer

components:
  schemas:
    ConfigValidationResult:
      type: object
      required:
        - id
        - configKey
        - isValid
        - severity
        - validatedAt
      properties:
        id:
          $ref: '#/components/schemas/UUID'
        configKey:
          type: string
        isValid:
          type: boolean
        severity:
          type: string
          enum: [error, warning, info]
        message:
          type: string
        expectedFormat:
          type: string
        actualValue:
          oneOf:
            - type: string
            - type: number
            - type: boolean
            - type: object
        validatedAt:
          type: string
          format: date-time

    ConfigSchemaDefinition:
      type: object
      required:
        - key
        - description
        - type
        - required
        - scope
        - hotReloadable
      properties:
        key:
          type: string
        description:
          type: string
        type:
          type: string
          enum: [string, number, boolean, object, array]
        required:
          type: boolean
        defaultValue:
          oneOf:
            - type: string
            - type: number
            - type: boolean
            - type: object
        pattern:
          type: string
        minimum:
          type: number
        maximum:
          type: number
        allowedValues:
          type: array
          items: {}
        scope:
          type: string
          enum: [global, project, user, session]
        hotReloadable:
          type: boolean
        dependencies:
          type: array
          items:
            type: string

    ConfigWatcher:
      type: object
      required:
        - id
        - watchKeys
        - active
        - createdAt
      properties:
        id:
          $ref: '#/components/schemas/UUID'
        watchKeys:
          type: array
          items:
            type: string
        active:
          type: boolean
        createdAt:
          type: string
          format: date-time

    ConfigBackup:
      type: object
      required:
        - id
        - name
        - configSnapshot
        - createdAt
        - isAutomatic
      properties:
        id:
          $ref: '#/components/schemas/UUID'
        name:
          type: string
        configSnapshot:
          type: object
          additionalProperties: true
        createdAt:
          type: string
          format: date-time
        description:
          type: string
        isAutomatic:
          type: boolean

    ConfigHealth:
      type: object
      required:
        - status
        - totalConfigs
        - validConfigs
        - warningConfigs
        - errorConfigs
        - recentValidations
        - lastCheckedAt
      properties:
        status:
          type: string
          enum: [healthy, warning, error]
        totalConfigs:
          type: integer
        validConfigs:
          type: integer
        warningConfigs:
          type: integer
        errorConfigs:
          type: integer
        recentValidations:
          type: array
          items:
            $ref: '#/components/schemas/ConfigValidationResult'
        lastCheckedAt:
          type: string
          format: date-time
```

## **4. Detailed Business Logic & Validation Rules**

| Rule ID | Rule Description | Implementation Location(s) & Notes |
|---------|------------------|-----------------------------------|
| **CFG-01** | All required environment variables must be present and valid before the application can start. | **Backend (Authoritative):** Environment validation in `config/environment.ts` using Zod schema validation. Application startup must fail if critical configurations are missing. |
| **CFG-02** | Configuration changes must be validated against the schema before being applied to prevent system instability. | **Backend (Authoritative):** Validation service layer that runs Zod validation on all configuration updates. Frontend provides immediate feedback but backend is authoritative. |
| **CFG-03** | Sensitive configuration values (API keys, secrets) must never be logged or exposed in plain text through APIs. | **Backend (Authoritative):** Logging service must mask sensitive values. API responses must redact secrets. Use environment variable patterns to identify sensitive keys. |
| **CFG-04** | Configuration backups must be created automatically before any configuration changes are applied. | **Backend (Authoritative):** Backup service automatically creates snapshots before applying changes. Configurable retention policy (default 30 days per Core Contracts). |
| **CFG-05** | Hot reloading must only affect configurations marked as `hotReloadable: true` in the schema to prevent system disruption. | **Backend (Authoritative):** Configuration schema validation ensures only safe configurations can be hot-reloaded. Critical system configs require restart. |
| **CFG-06** | Configuration watchers must be automatically cleaned up when their associated components are destroyed to prevent memory leaks. | **Backend (Authoritative):** Watcher registry with automatic cleanup on component disposal. Frontend components must properly unregister watchers on unmount. |
| **CFG-07** | Database and vector database connection configurations must be validated by attempting actual connections during validation. | **Backend (Authoritative):** Connection validation service that performs health checks against configured database endpoints as part of validation process. |
| **CFG-08** | OpenRouter API key must be validated by making a test API call during configuration validation. | **Backend (Authoritative):** API key validation service that performs authentication check with OpenRouter during config validation. |
| **CFG-09** | Configuration restore operations must validate restored configurations before applying them to prevent invalid state. | **Backend (Authoritative):** Restore service must run full validation pipeline on backup data before applying any changes. |
| **CFG-10** | Milvus vector database configuration must validate host/port connectivity and verify the embedding model is accessible. | **Backend (Authoritative):** Vector database validation service that checks Milvus connectivity and sentence-transformer model availability. |

## **5. Developer Task Checklist**

### **Backend Tasks:**
- [ ] Create database migration script for configuration tables (`config_definitions`, `config_backups`, `config_watchers`, `config_audit_log`)
- [ ] Implement the `ConfigurationService` class with environment validation, schema management, and hot reloading capabilities
- [ ] Implement the `GET /api/v1/config` endpoint with scope filtering and key selection functionality
- [ ] Implement the `PUT /api/v1/config` endpoint with comprehensive validation and backup creation
- [ ] Implement the `POST /api/v1/config/validate` endpoint for configuration validation without applying changes
- [ ] Implement the `GET /api/v1/config/schema` endpoint to serve configuration schema definitions
- [ ] Implement the `POST /api/v1/config/reload` endpoint for hot configuration reloading
- [ ] Implement configuration backup management endpoints (`GET`, `POST /api/v1/config/backup`, `DELETE /api/v1/config/backup/{id}`)
- [ ] Implement configuration restore endpoint (`POST /api/v1/config/restore/{backupId}`)
- [ ] Implement the `GET /api/v1/config/health` endpoint for configuration system health monitoring
- [ ] Implement configuration watcher management (`GET /api/v1/config/watchers`)
- [ ] Create `ConfigurationRepository` class for database operations with proper error handling
- [ ] Implement `ConfigValidationService` with Zod schema integration and custom validation rules
- [ ] Implement `ConfigBackupService` with automatic backup creation and retention management
- [ ] Implement `ConfigWatcherService` for managing configuration change notifications
- [ ] Create comprehensive unit tests for all service classes with edge case coverage
- [ ] Create integration tests for all API endpoints including error scenarios
- [ ] Implement configuration audit logging for compliance and debugging
- [ ] Add configuration health checks to system monitoring

### **Frontend Tasks:**
- [ ] Create `ConfigurationProvider` React context for global configuration state management
- [ ] Implement `useConfiguration` hook for accessing and updating configuration values
- [ ] Create `ConfigurationPanel` component for the settings page with tabbed interface
- [ ] Implement `ConfigurationEditor` component for editing individual configuration values with validation
- [ ] Create `ConfigurationValidation` component to display validation results and errors
- [ ] Implement `ConfigurationBackup` component for managing configuration backups and restoration
- [ ] Create `ConfigurationHealth` component to display system configuration health status
- [ ] Implement configuration service functions in the API client (`configService.ts`)
- [ ] Integrate configuration management into the main application settings interface
- [ ] Implement real-time configuration updates using the watcher system
- [ ] Create configuration import/export functionality for advanced users
- [ ] Add configuration search and filtering capabilities in the UI
- [ ] Implement configuration validation feedback with inline error messages
- [ ] Create configuration backup scheduling interface
- [ ] Add configuration change history and diff viewing capabilities
- [ ] Implement configuration templates and presets for common setups

========================================================================================


# Logging & Monitoring Service - Technical Specification

## **1. Module Overview**

**Purpose:** The Logging & Monitoring Service serves as the centralized logging, error tracking, and system monitoring infrastructure for the entire ReadyAI application. This module provides structured logging capabilities, performance monitoring, error tracking with detailed context, and usage analytics to support the local-first architecture while ensuring comprehensive observability across all ReadyAI components including the VS Code extension, backend services, and AI integration workflows.

**Dependencies & Interactions:** This module depends on the Configuration Management Module to obtain logging configuration settings, log levels, retention policies, and monitoring thresholds. It interacts with all other ReadyAI modules by receiving log events, error reports, and performance metrics. The module integrates with the Multi-Phase Development Orchestrator to track phase progression metrics, with the Claude Integration Service to monitor AI generation performance and token usage, and with the Context Management Engine to track context retrieval performance against the <3 second KPI requirement. It also provides logging infrastructure that other modules use for audit trails and debugging.

## **2. Module-Specific Type Additions (`types.logging.ts`)**

```typescript
/**
 * Logging & Monitoring Service Module Types
 * Extends foundational types with logging and monitoring interfaces
 */

/** Log severity levels */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/** Log categories for organizing log entries */
export type LogCategory = 
  | 'system'
  | 'api'
  | 'ai_generation'
  | 'context_management'
  | 'user_action'
  | 'performance'
  | 'security'
  | 'database'
  | 'file_system'
  | 'configuration'
  | 'phase_progression';

/** Performance metric types */
export type MetricType = 
  | 'counter'
  | 'gauge'
  | 'histogram'
  | 'timer'
  | 'memory_usage'
  | 'api_response_time'
  | 'context_retrieval_time'
  | 'ai_generation_time';

/** Error classification levels */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

/** Log entry structure */
export interface LogEntry {
  /** Unique log entry identifier */
  id: UUID;
  /** Log severity level */
  level: LogLevel;
  /** Log category */
  category: LogCategory;
  /** Log message */
  message: string;
  /** Timestamp when log was created */
  timestamp: string; // ISO 8601 format
  /** Source component or module */
  source: string;
  /** Optional project context */
  projectId?: UUID;
  /** Optional user session context */
  sessionId?: string;
  /** Optional request correlation ID */
  correlationId?: string;
  /** Additional structured data */
  metadata?: Record<string, any>;
  /** Stack trace for errors */
  stackTrace?: string;
  /** Request/response context for API logs */
  requestContext?: {
    method: string;
    url: string;
    userAgent?: string;
    ip?: string;
    responseTime?: number;
    statusCode?: number;
  };
}

/** Performance metric entry */
export interface PerformanceMetric {
  /** Unique metric identifier */
  id: UUID;
  /** Metric name/identifier */
  name: string;
  /** Type of metric */
  type: MetricType;
  /** Metric value */
  value: number;
  /** Metric unit (ms, bytes, count, etc.) */
  unit: string;
  /** Timestamp when metric was recorded */
  timestamp: string; // ISO 8601 format
  /** Source component */
  source: string;
  /** Optional project context */
  projectId?: UUID;
  /** Optional additional tags */
  tags?: Record<string, string>;
  /** Optional metadata */
  metadata?: Record<string, any>;
}

/** Error tracking entry */
export interface ErrorEntry {
  /** Unique error identifier */
  id: UUID;
  /** Error message */
  message: string;
  /** Error type/name */
  errorType: string;
  /** Error severity classification */
  severity: ErrorSeverity;
  /** Stack trace */
  stackTrace?: string;
  /** Source component where error occurred */
  source: string;
  /** Timestamp when error occurred */
  timestamp: string; // ISO 8601 format
  /** Optional project context */
  projectId?: UUID;
  /** Optional user session context */
  sessionId?: string;
  /** Request correlation ID */
  correlationId?: string;
  /** Additional error context */
  context?: Record<string, any>;
  /** Whether error was handled or unhandled */
  handled: boolean;
  /** Error resolution status */
  resolved: boolean;
  /** Number of times this error has occurred */
  occurrenceCount: number;
  /** First occurrence timestamp */
  firstOccurrence: string; // ISO 8601 format
  /** Last occurrence timestamp */
  lastOccurrence: string; // ISO 8601 format
}

/** System health status */
export interface SystemHealth {
  /** Overall system health */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Health check timestamp */
  timestamp: string; // ISO 8601 format
  /** Individual component health */
  components: {
    database: ComponentHealth;
    vectorDatabase: ComponentHealth;
    aiProvider: ComponentHealth;
    fileSystem: ComponentHealth;
    configuration: ComponentHealth;
  };
  /** Recent performance metrics summary */
  performance: {
    avgContextRetrievalTime: number;
    avgAiGenerationTime: number;
    avgApiResponseTime: number;
    errorRate: number;
    memoryUsage: number;
    diskUsage: number;
  };
  /** Recent errors summary */
  recentErrors: {
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
  };
}

/** Individual component health status */
export interface ComponentHealth {
  /** Component status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Last health check timestamp */
  lastChecked: string; // ISO 8601 format
  /** Response time in milliseconds */
  responseTime?: number;
  /** Additional status details */
  details?: string;
  /** Error information if unhealthy */
  error?: string;
}

/** Usage analytics summary */
export interface UsageAnalytics {
  /** Analytics period identifier */
  id: UUID;
  /** Start of analytics period */
  periodStart: string; // ISO 8601 format
  /** End of analytics period */
  periodEnd: string; // ISO 8601 format
  /** Total number of projects */
  totalProjects: number;
  /** Total AI generations */
  totalGenerations: number;
  /** Total context retrievals */
  totalContextRetrievals: number;
  /** Average context retrieval time */
  avgContextRetrievalTime: number;
  /** Average AI generation time */
  avgAiGenerationTime: number;
  /** Total API requests */
  totalApiRequests: number;
  /** Average API response time */
  avgApiResponseTime: number;
  /** Error statistics */
  errorStats: {
    totalErrors: number;
    errorsByLevel: Record<LogLevel, number>;
    errorsBySeverity: Record<ErrorSeverity, number>;
  };
  /** Most active phases */
  phaseActivity: Record<PhaseType, number>;
  /** Token usage statistics */
  tokenUsage: {
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    avgTokensPerGeneration: number;
  };
}

/** Log query parameters */
export interface LogQuery {
  /** Log levels to include */
  levels?: LogLevel[];
  /** Categories to filter by */
  categories?: LogCategory[];
  /** Source components to filter by */
  sources?: string[];
  /** Project ID filter */
  projectId?: UUID;
  /** Session ID filter */
  sessionId?: string;
  /** Start time for log range */
  startTime?: string; // ISO 8601 format
  /** End time for log range */
  endTime?: string; // ISO 8601 format
  /** Search text in log messages */
  searchText?: string;
  /** Correlation ID filter */
  correlationId?: string;
  /** Maximum number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/** Monitoring alert configuration */
export interface AlertConfig {
  /** Alert identifier */
  id: UUID;
  /** Alert name */
  name: string;
  /** Alert description */
  description?: string;
  /** Whether alert is enabled */
  enabled: boolean;
  /** Metric or condition to monitor */
  condition: {
    metric: string;
    operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
    threshold: number;
    timeWindow: number; // seconds
  };
  /** Alert severity */
  severity: 'info' | 'warning' | 'critical';
  /** Alert actions */
  actions: {
    logAlert: boolean;
    emailNotification?: boolean;
    webhookUrl?: string;
  };
  /** Alert creation timestamp */
  createdAt: string; // ISO 8601 format
  /** Last triggered timestamp */
  lastTriggered?: string; // ISO 8601 format
}
```

## **3. API Endpoint Specification (OpenAPI `paths` block)**

```yaml
paths:
  /api/v1/logging/logs:
    get:
      tags:
        - Logging
      summary: Query log entries
      description: Retrieves log entries with filtering, searching, and pagination capabilities
      security:
        - localAuth: []
      parameters:
        - name: levels
          in: query
          description: Comma-separated log levels to filter by
          required: false
          schema:
            type: string
            example: "info,warn,error"
        - name: categories
          in: query
          description: Comma-separated categories to filter by
          required: false
          schema:
            type: string
            example: "api,ai_generation"
        - name: sources
          in: query
          description: Comma-separated source components to filter by
          required: false
          schema:
            type: string
        - name: projectId
          in: query
          description: Filter logs by project ID
          required: false
          schema:
            $ref: '#/components/schemas/UUID'
        - name: sessionId
          in: query
          description: Filter logs by session ID
          required: false
          schema:
            type: string
        - name: startTime
          in: query
          description: Start time for log range (ISO 8601)
          required: false
          schema:
            type: string
            format: date-time
        - name: endTime
          in: query
          description: End time for log range (ISO 8601)
          required: false
          schema:
            type: string
            format: date-time
        - name: searchText
          in: query
          description: Search text in log messages
          required: false
          schema:
            type: string
        - name: correlationId
          in: query
          description: Filter by correlation ID
          required: false
          schema:
            type: string
        - name: limit
          in: query
          description: Maximum number of results
          required: false
          schema:
            type: integer
            minimum: 1
            maximum: 1000
            default: 100
        - name: offset
          in: query
          description: Offset for pagination
          required: false
          schema:
            type: integer
            minimum: 0
            default: 0
      responses:
        '200':
          description: Log entries retrieved successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          logs:
                            type: array
                            items:
                              $ref: '#/components/schemas/LogEntry'
                          totalCount:
                            type: integer
                          hasMore:
                            type: boolean
        '400':
          description: Invalid query parameters
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiErrorResponse'

    post:
      tags:
        - Logging
      summary: Create log entry
      description: Creates a new log entry (typically used by other system components)
      security:
        - localAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                level:
                  type: string
                  enum: [debug, info, warn, error, fatal]
                category:
                  type: string
                  enum: [system, api, ai_generation, context_management, user_action, performance, security, database, file_system, configuration, phase_progression]
                message:
                  type: string
                  minLength: 1
                source:
                  type: string
                  minLength: 1
                projectId:
                  $ref: '#/components/schemas/UUID'
                sessionId:
                  type: string
                correlationId:
                  type: string
                metadata:
                  type: object
                stackTrace:
                  type: string
                requestContext:
                  type: object
                  properties:
                    method:
                      type: string
                    url:
                      type: string
                    userAgent:
                      type: string
                    ip:
                      type: string
                    responseTime:
                      type: number
                    statusCode:
                      type: integer
              required:
                - level
                - category
                - message
                - source
      responses:
        '201':
          description: Log entry created successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/LogEntry'
        '400':
          description: Invalid log entry data
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiErrorResponse'

  /api/v1/logging/metrics:
    get:
      tags:
        - Monitoring
      summary: Query performance metrics
      description: Retrieves performance metrics with filtering and aggregation options
      security:
        - localAuth: []
      parameters:
        - name: type
          in: query
          description: Metric type filter
          required: false
          schema:
            type: string
            enum: [counter, gauge, histogram, timer, memory_usage, api_response_time, context_retrieval_time, ai_generation_time]
        - name: source
          in: query
          description: Source component filter
          required: false
          schema:
            type: string
        - name: projectId
          in: query
          description: Project ID filter
          required: false
          schema:
            $ref: '#/components/schemas/UUID'
        - name: startTime
          in: query
          description: Start time for metric range
          required: false
          schema:
            type: string
            format: date-time
        - name: endTime
          in: query
          description: End time for metric range
          required: false
          schema:
            type: string
            format: date-time
        - name: aggregation
          in: query
          description: Aggregation method
          required: false
          schema:
            type: string
            enum: [avg, sum, min, max, count]
            default: avg
        - name: interval
          in: query
          description: Aggregation interval in seconds
          required: false
          schema:
            type: integer
            minimum: 60
            default: 300
      responses:
        '200':
          description: Performance metrics retrieved successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          metrics:
                            type: array
                            items:
                              $ref: '#/components/schemas/PerformanceMetric'
                          aggregatedMetrics:
                            type: array
                            items:
                              type: object
                              properties:
                                timestamp:
                                  type: string
                                  format: date-time
                                value:
                                  type: number
                                count:
                                  type: integer

    post:
      tags:
        - Monitoring
      summary: Record performance metric
      description: Records a new performance metric (typically used by other system components)
      security:
        - localAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
                  minLength: 1
                type:
                  type: string
                  enum: [counter, gauge, histogram, timer, memory_usage, api_response_time, context_retrieval_time, ai_generation_time]
                value:
                  type: number
                unit:
                  type: string
                  minLength: 1
                source:
                  type: string
                  minLength: 1
                projectId:
                  $ref: '#/components/schemas/UUID'
                tags:
                  type: object
                  additionalProperties:
                    type: string
                metadata:
                  type: object
              required:
                - name
                - type
                - value
                - unit
                - source
      responses:
        '201':
          description: Performance metric recorded successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/PerformanceMetric'

  /api/v1/logging/errors:
    get:
      tags:
        - Logging
      summary: Query error entries
      description: Retrieves error entries with filtering and grouping options
      security:
        - localAuth: []
      parameters:
        - name: severity
          in: query
          description: Error severity filter
          required: false
          schema:
            type: string
            enum: [low, medium, high, critical]
        - name: source
          in: query
          description: Source component filter
          required: false
          schema:
            type: string
        - name: projectId
          in: query
          description: Project ID filter
          required: false
          schema:
            $ref: '#/components/schemas/UUID'
        - name: resolved
          in: query
          description: Filter by resolution status
          required: false
          schema:
            type: boolean
        - name: startTime
          in: query
          description: Start time for error range
          required: false
          schema:
            type: string
            format: date-time
        - name: endTime
          in: query
          description: End time for error range
          required: false
          schema:
            type: string
            format: date-time
        - name: groupBy
          in: query
          description: Group errors by field
          required: false
          schema:
            type: string
            enum: [errorType, source, severity]
      responses:
        '200':
          description: Error entries retrieved successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          errors:
                            type: array
                            items:
                              $ref: '#/components/schemas/ErrorEntry'
                          groupedErrors:
                            type: object
                            additionalProperties:
                              type: array
                              items:
                                $ref: '#/components/schemas/ErrorEntry'

    post:
      tags:
        - Logging
      summary: Report error
      description: Reports a new error occurrence
      security:
        - localAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                message:
                  type: string
                  minLength: 1
                errorType:
                  type: string
                  minLength: 1
                severity:
                  type: string
                  enum: [low, medium, high, critical]
                stackTrace:
                  type: string
                source:
                  type: string
                  minLength: 1
                projectId:
                  $ref: '#/components/schemas/UUID'
                sessionId:
                  type: string
                correlationId:
                  type: string
                context:
                  type: object
                handled:
                  type: boolean
                  default: true
              required:
                - message
                - errorType
                - severity
                - source
      responses:
        '201':
          description: Error reported successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/ErrorEntry'

  /api/v1/logging/errors/{errorId}/resolve:
    patch:
      tags:
        - Logging
      summary: Mark error as resolved
      description: Marks a specific error as resolved
      security:
        - localAuth: []
      parameters:
        - name: errorId
          in: path
          required: true
          schema:
            $ref: '#/components/schemas/UUID'
      responses:
        '200':
          description: Error marked as resolved
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/ErrorEntry'
        '404':
          description: Error not found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiErrorResponse'

  /api/v1/monitoring/health:
    get:
      tags:
        - Monitoring
      summary: Get system health status
      description: Retrieves comprehensive system health information including component status and performance metrics
      security:
        - localAuth: []
      responses:
        '200':
          description: System health retrieved successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/SystemHealth'

  /api/v1/monitoring/analytics:
    get:
      tags:
        - Monitoring
      summary: Get usage analytics
      description: Retrieves usage analytics for specified time periods
      security:
        - localAuth: []
      parameters:
        - name: period
          in: query
          description: Analytics period
          required: false
          schema:
            type: string
            enum: [hour, day, week, month]
            default: day
        - name: startDate
          in: query
          description: Start date for analytics period
          required: false
          schema:
            type: string
            format: date
        - name: endDate
          in: query
          description: End date for analytics period
          required: false
          schema:
            type: string
            format: date
      responses:
        '200':
          description: Usage analytics retrieved successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/UsageAnalytics'

  /api/v1/monitoring/alerts:
    get:
      tags:
        - Monitoring
      summary: List monitoring alerts
      description: Retrieves configured monitoring alerts
      security:
        - localAuth: []
      responses:
        '200':
          description: Monitoring alerts retrieved successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          alerts:
                            type: array
                            items:
                              $ref: '#/components/schemas/AlertConfig'

    post:
      tags:
        - Monitoring
      summary: Create monitoring alert
      description: Creates a new monitoring alert configuration
      security:
        - localAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
                  minLength: 1
                  maxLength: 100
                description:
                  type: string
                  maxLength: 500
                enabled:
                  type: boolean
                  default: true
                condition:
                  type: object
                  properties:
                    metric:
                      type: string
                    operator:
                      type: string
                      enum: [gt, lt, eq, gte, lte]
                    threshold:
                      type: number
                    timeWindow:
                      type: integer
                      minimum: 60
                  required:
                    - metric
                    - operator
                    - threshold
                    - timeWindow
                severity:
                  type: string
                  enum: [info, warning, critical]
                actions:
                  type: object
                  properties:
                    logAlert:
                      type: boolean
                      default: true
                    emailNotification:
                      type: boolean
                    webhookUrl:
                      type: string
                      format: uri
                  required:
                    - logAlert
              required:
                - name
                - condition
                - severity
                - actions
      responses:
        '201':
          description: Monitoring alert created successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/AlertConfig'

components:
  schemas:
    LogEntry:
      type: object
      required:
        - id
        - level
        - category
        - message
        - timestamp
        - source
      properties:
        id:
          $ref: '#/components/schemas/UUID'
        level:
          type: string
          enum: [debug, info, warn, error, fatal]
        category:
          type: string
          enum: [system, api, ai_generation, context_management, user_action, performance, security, database, file_system, configuration, phase_progression]
        message:
          type: string
        timestamp:
          type: string
          format: date-time
        source:
          type: string
        projectId:
          $ref: '#/components/schemas/UUID'
        sessionId:
          type: string
        correlationId:
          type: string
        metadata:
          type: object
        stackTrace:
          type: string
        requestContext:
          type: object
          properties:
            method:
              type: string
            url:
              type: string
            userAgent:
              type: string
            ip:
              type: string
            responseTime:
              type: number
            statusCode:
              type: integer

    PerformanceMetric:
      type: object
      required:
        - id
        - name
        - type
        - value
        - unit
        - timestamp
        - source
      properties:
        id:
          $ref: '#/components/schemas/UUID'
        name:
          type: string
        type:
          type: string
          enum: [counter, gauge, histogram, timer, memory_usage, api_response_time, context_retrieval_time, ai_generation_time]
        value:
          type: number
        unit:
          type: string
        timestamp:
          type: string
          format: date-time
        source:
          type: string
        projectId:
          $ref: '#/components/schemas/UUID'
        tags:
          type: object
          additionalProperties:
            type: string
        metadata:
          type: object

    ErrorEntry:
      type: object
      required:
        - id
        - message
        - errorType
        - severity
        - source
        - timestamp
        - handled
        - resolved
        - occurrenceCount
        - firstOccurrence
        - lastOccurrence
      properties:
        id:
          $ref: '#/components/schemas/UUID'
        message:
          type: string
        errorType:
          type: string
        severity:
          type: string
          enum: [low, medium, high, critical]
        stackTrace:
          type: string
        source:
          type: string
        timestamp:
          type: string
          format: date-time
        projectId:
          $ref: '#/components/schemas/UUID'
        sessionId:
          type: string
        correlationId:
          type: string
        context:
          type: object
        handled:
          type: boolean
        resolved:
          type: boolean
        occurrenceCount:
          type: integer
        firstOccurrence:
          type: string
          format: date-time
        lastOccurrence:
          type: string
          format: date-time

    SystemHealth:
      type: object
      required:
        - status
        - timestamp
        - components
        - performance
        - recentErrors
      properties:
        status:
          type: string
          enum: [healthy, degraded, unhealthy]
        timestamp:
          type: string
          format: date-time
        components:
          type: object
          properties:
            database:
              $ref: '#/components/schemas/ComponentHealth'
            vectorDatabase:
              $ref: '#/components/schemas/ComponentHealth'
            aiProvider:
              $ref: '#/components/schemas/ComponentHealth'
            fileSystem:
              $ref: '#/components/schemas/ComponentHealth'
            configuration:
              $ref: '#/components/schemas/ComponentHealth'
        performance:
          type: object
          properties:
            avgContextRetrievalTime:
              type: number
            avgAiGenerationTime:
              type: number
            avgApiResponseTime:
              type: number
            errorRate:
              type: number
            memoryUsage:
              type: number
            diskUsage:
              type: number
        recentErrors:
          type: object
          properties:
            criticalCount:
              type: integer
            highCount:
              type: integer
            mediumCount:
              type: integer
            lowCount:
              type: integer

    ComponentHealth:
      type: object
      required:
        - status
        - lastChecked
      properties:
        status:
          type: string
          enum: [healthy, degraded, unhealthy]
        lastChecked:
          type: string
          format: date-time
        responseTime:
          type: number
        details:
          type: string
        error:
          type: string

    UsageAnalytics:
      type: object
      required:
        - id
        - periodStart
        - periodEnd
        - totalProjects
        - totalGenerations
        - totalContextRetrievals
        - avgContextRetrievalTime
        - avgAiGenerationTime
        - totalApiRequests
        - avgApiResponseTime
        - errorStats
        - phaseActivity
        - tokenUsage
      properties:
        id:
          $ref: '#/components/schemas/UUID'
        periodStart:
          type: string
          format: date-time
        periodEnd:
          type: string
          format: date-time
        totalProjects:
          type: integer
        totalGenerations:
          type: integer
        totalContextRetrievals:
          type: integer
        avgContextRetrievalTime:
          type: number
        avgAiGenerationTime:
          type: number
        totalApiRequests:
          type: integer
        avgApiResponseTime:
          type: number
        errorStats:
          type: object
          properties:
            totalErrors:
              type: integer
            errorsByLevel:
              type: object
              additionalProperties:
                type: integer
            errorsBySeverity:
              type: object
              additionalProperties:
                type: integer
        phaseActivity:
          type: object
          additionalProperties:
            type: integer
        tokenUsage:
          type: object
          properties:
            totalTokens:
              type: integer
            inputTokens:
              type: integer
            outputTokens:
              type: integer
            avgTokensPerGeneration:
              type: number

    AlertConfig:
      type: object
      required:
        - id
        - name
        - enabled
        - condition
        - severity
        - actions
        - createdAt
      properties:
        id:
          $ref: '#/components/schemas/UUID'
        name:
          type: string
        description:
          type: string
        enabled:
          type: boolean
        condition:
          type: object
          properties:
            metric:
              type: string
            operator:
              type: string
              enum: [gt, lt, eq, gte, lte]
            threshold:
              type: number
            timeWindow:
              type: integer
        severity:
          type: string
          enum: [info, warning, critical]
        actions:
          type: object
          properties:
            logAlert:
              type: boolean
            emailNotification:
              type: boolean
            webhookUrl:
              type: string
        createdAt:
          type: string
          format: date-time
        lastTriggered:
          type: string
          format: date-time
```

## **4. Detailed Business Logic & Validation Rules**

| Rule ID | Rule Description | Implementation Location(s) & Notes |
|---------|------------------|-----------------------------------|
| **LOG-01** | Log entries must be persisted immediately and never lost, even during system failures or high load conditions. | **Backend (Authoritative):** Logging service must use asynchronous queuing with persistent storage. Implement circuit breaker pattern to prevent logging failures from affecting core functionality. |
| **LOG-02** | Performance metrics for context retrieval must automatically trigger alerts if they exceed the 3-second KPI threshold defined in the charter. | **Backend (Authoritative):** Monitoring service must automatically create alerts when context_retrieval_time metrics exceed 3000ms threshold. Integrates with Configuration Management Module for alert thresholds. |
| **LOG-03** | Sensitive data (API keys, tokens, passwords) must never be logged in plain text or included in error stack traces. | **Backend (Authoritative):** Logging service must implement data sanitization filters that detect and mask sensitive patterns before persisting logs. Use configuration patterns from Configuration Management Module. |
| **LOG-04** | Error occurrences of the same type from the same source must be grouped and counted rather than creating duplicate entries. | **Backend (Authoritative):** Error tracking service must implement deduplication logic based on errorType + source + message hash. Update occurrence count and timestamps for existing errors. |
| **LOG-05** | System health status must automatically degrade to 'unhealthy' if any P0 component (Database, Vector Database, AI Provider) fails health checks. | **Backend (Authoritative):** Health monitoring service must aggregate component health and apply business rules. P0 component failures override overall status regardless of other component states. |
| **LOG-06** | Log retention must follow the backup retention policy from Configuration Management Module (default 30 days for logs, 90 days for metrics). | **Backend (Authoritative):** Log cleanup service must query Configuration Management Module for retention policies and implement automated cleanup based on configured retention periods. |
| **LOG-07** | Performance metrics that impact ReadyAI KPIs (development velocity, code quality consistency) must be tagged with project context for analytics. | **Backend (Authoritative):** Metrics collection must automatically tag AI generation time, context retrieval time, and phase progression metrics with projectId and phaseType for KPI analytics. |
| **LOG-08** | Critical errors (severity 'critical') must automatically create system health incidents and persist until manually resolved. | **Backend (Authoritative):** Error tracking service must create persistent incident records for critical errors and prevent system health from returning to 'healthy' until incidents are resolved. |
| **LOG-09** | Usage analytics must aggregate data without exposing individual user sessions or project details to maintain privacy in the local-first architecture. | **Backend (Authoritative):** Analytics service must implement aggregation functions that summarize usage patterns while anonymizing individual session or project identifiers. |
| **LOG-10** | Monitoring alerts must respect the Configuration Management Module's settings for notification preferences and alert thresholds. | **Backend (Authoritative):** Alert service must query Configuration Management Module for user notification preferences and use configured thresholds instead of hardcoded values. |

## **5. Developer Task Checklist**

### **Backend Tasks:**
- [ ] Create database migration script for logging tables (`log_entries`, `performance_metrics`, `error_entries`, `system_health_checks`, `usage_analytics`, `alert_configs`)
- [ ] Implement the `LoggingService` class with structured logging, log levels, and asynchronous persistence capabilities
- [ ] Implement the `PerformanceMonitoringService` class for collecting and aggregating performance metrics across all ReadyAI components
- [ ] Implement the `ErrorTrackingService` class with error deduplication, occurrence counting, and severity classification
- [ ] Implement the `SystemHealthService` class for component health monitoring and overall system status aggregation
- [ ] Implement the `UsageAnalyticsService` class for privacy-aware analytics aggregation and KPI tracking
- [ ] Implement the `AlertingService` class for threshold monitoring and notification management
- [ ] Implement all logging API endpoints (`GET`, `POST /api/v1/logging/logs`) with advanced querying and filtering capabilities
- [ ] Implement metrics API endpoints (`GET`, `POST /api/v1/logging/metrics`) with aggregation and time-series support
- [ ] Implement error tracking endpoints (`GET`, `POST /api/v1/logging/errors`, `PATCH /api/v1/logging/errors/{id}/resolve`)
- [ ] Implement system monitoring endpoints (`GET /api/v1/monitoring/health`, `GET /api/v1/monitoring/analytics`)
- [ ] Implement alert management endpoints (`GET`, `POST /api/v1/monitoring/alerts`)
- [ ] Create `LoggingRepository` class for efficient log storage and retrieval with indexing on timestamp, level, category, and source
- [ ] Create `MetricsRepository` class for time-series metrics storage with aggregation capabilities
- [ ] Create `ErrorRepository` class for error deduplication and occurrence tracking
- [ ] Implement log data sanitization filters to prevent sensitive data exposure
- [ ] Implement automated log retention and cleanup based on Configuration Management Module policies
- [ ] Create middleware for automatic request/response logging with correlation ID generation
- [ ] Implement performance monitoring interceptors for AI generation and context retrieval operations
- [ ] Create health check probes for Database, Vector Database, AI Provider, File System, and Configuration components
- [ ] Implement comprehensive unit tests for all service classes with mock dependencies
- [ ] Create integration tests for logging endpoints with real database interactions
- [ ] Implement performance tests for logging throughput under high load conditions
- [ ] Add logging instrumentation to existing ReadyAI modules (Project Management, Phase Management, Context Management)

### **Frontend Tasks:**
- [ ] Create `LoggingProvider` React context for accessing logging and monitoring functionality
- [ ] Implement `useLogging` hook for frontend logging capabilities with automatic error boundary integration
- [ ] Create `LogViewer` component for displaying log entries with filtering, searching, and real-time updates
- [ ] Implement `MetricsDashboard` component for visualizing performance metrics and system health
- [ ] Create `ErrorTracker` component for displaying error summaries, groupings, and resolution status
- [ ] Implement `SystemHealthMonitor` component for real-time system status display
- [ ] Create `UsageAnalytics` component for displaying usage statistics and KPI metrics
- [ ] Implement `AlertConfiguration` component for managing monitoring alerts and thresholds
- [ ] Create logging service functions in the API client (`loggingService.ts`) for all logging endpoints
- [ ] Implement automatic error logging for uncaught exceptions and API errors
- [ ] Create performance monitoring hooks for tracking frontend component render times
- [ ] Implement log export functionality for downloading logs and metrics
- [ ] Add real-time log streaming capabilities using WebSockets or Server-Sent Events
- [ ] Create log search and filtering interface with advanced query capabilities
- [ ] Implement metrics visualization using charts and graphs for performance trends
- [ ] Add error reporting integration to React error boundaries with automatic context collection
- [ ] Create system health status indicators in the main application header
- [ ] Implement alert notification display system for critical system alerts
- [ ] Add logging configuration interface integrated with Configuration Management Module settings
- [ ] Create debugging tools for developers including correlation ID tracking and distributed tracing visualization


========================================================================================


# File System Management Module - Technical Specification

## **1. Module Overview**

**Purpose:** The File System Management Module serves as the centralized file system interface for the entire ReadyAI application, handling all file operations, workspace management, and file system integration. This module provides secure and efficient file CRUD operations, directory management, file watching capabilities, workspace isolation, and backup management while maintaining the local-first architecture principles. It acts as the foundational layer that enables the VS Code extension, AI code generation, and project management features to interact safely with the local file system.

**Dependencies & Interactions:** This module depends on the Configuration Management Module to obtain file system configuration settings, workspace paths, backup retention policies, and security configurations. It interacts with the Logging & Monitoring Service to track file operations, performance metrics, and error reporting. The module provides file system services that are consumed by the Project Management Module for project file operations, the Context Management Engine for reading source files and extracting context, the AI Code Generation Engine for writing generated files, and the VS Code Extension Host for workspace integration. It also supports the Multi-Phase Development Orchestrator by managing phase artifacts and project scaffolding files.

## **2. Module-Specific Type Additions (`types.filesystem.ts`)**

```typescript
/**
 * File System Management Module Types
 * Extends foundational types with file system-specific interfaces
 */

/** File operation types */
export type FileOperationType = 'create' | 'read' | 'update' | 'delete' | 'copy' | 'move' | 'watch';

/** File system entry types */
export type FileSystemEntryType = 'file' | 'directory' | 'symlink';

/** File watching event types */
export type FileWatchEventType = 'created' | 'modified' | 'deleted' | 'renamed' | 'moved';

/** Workspace isolation levels */
export type WorkspaceIsolationLevel = 'strict' | 'moderate' | 'permissive';

/** Backup operation types */
export type BackupOperationType = 'full' | 'incremental' | 'differential';

/** File system entry information */
export interface FileSystemEntry {
  /** Entry path relative to workspace root */
  path: string;
  /** Absolute file system path */
  absolutePath: string;
  /** Entry type */
  type: FileSystemEntryType;
  /** File size in bytes */
  size: number;
  /** Created timestamp */
  createdAt: string; // ISO 8601 format
  /** Modified timestamp */
  modifiedAt: string; // ISO 8601 format
  /** Accessed timestamp */
  accessedAt: string; // ISO 8601 format
  /** File permissions (Unix-style octal) */
  permissions: string;
  /** Whether entry is readable */
  readable: boolean;
  /** Whether entry is writable */
  writable: boolean;
  /** Whether entry is executable */
  executable: boolean;
  /** File MIME type (for files) */
  mimeType?: string;
  /** File extension (for files) */
  extension?: string;
  /** Directory contents (for directories) */
  children?: FileSystemEntry[];
  /** File content hash for change detection */
  contentHash?: string;
}

/** File operation request */
export interface FileOperationRequest {
  /** Unique operation identifier */
  id: UUID;
  /** Type of file operation */
  operation: FileOperationType;
  /** Source path */
  sourcePath: string;
  /** Destination path (for copy/move operations) */
  destinationPath?: string;
  /** File content (for create/update operations) */
  content?: string;
  /** Content encoding */
  encoding?: 'utf8' | 'base64' | 'binary';
  /** Operation options */
  options?: {
    /** Create parent directories if they don't exist */
    createDirectories?: boolean;
    /** Overwrite existing files */
    overwrite?: boolean;
    /** Preserve timestamps */
    preserveTimestamps?: boolean;
    /** Follow symlinks */
    followSymlinks?: boolean;
  };
  /** Project context */
  projectId?: UUID;
  /** User session context */
  sessionId?: string;
  /** Request timestamp */
  createdAt: string; // ISO 8601 format
}

/** File operation result */
export interface FileOperationResult {
  /** Operation request identifier */
  requestId: UUID;
  /** Operation success status */
  success: boolean;
  /** Operation result data */
  result?: {
    /** File system entry information */
    entry?: FileSystemEntry;
    /** File content (for read operations) */
    content?: string;
    /** Content encoding */
    encoding?: string;
    /** Operation metadata */
    metadata?: Record<string, any>;
  };
  /** Error information (if operation failed) */
  error?: {
    /** Error code */
    code: string;
    /** Error message */
    message: string;
    /** Additional error details */
    details?: Record<string, any>;
  };
  /** Operation execution time in milliseconds */
  executionTime: number;
  /** Operation completion timestamp */
  completedAt: string; // ISO 8601 format
}

/** File watcher configuration */
export interface FileWatcher {
  /** Unique watcher identifier */
  id: UUID;
  /** Watch path pattern */
  pattern: string;
  /** Events to watch for */
  events: FileWatchEventType[];
  /** Whether watcher is recursive */
  recursive: boolean;
  /** Whether watcher is currently active */
  active: boolean;
  /** Callback URL for notifications */
  callbackUrl?: string;
  /** Project context */
  projectId?: UUID;
  /** Watcher creation timestamp */
  createdAt: string; // ISO 8601 format
  /** Last activity timestamp */
  lastActivity?: string; // ISO 8601 format
}

/** File watch event */
export interface FileWatchEvent {
  /** Unique event identifier */
  id: UUID;
  /** Watcher that detected this event */
  watcherId: UUID;
  /** Event type */
  eventType: FileWatchEventType;
  /** File path that changed */
  path: string;
  /** Old path (for rename/move events) */
  oldPath?: string;
  /** New path (for rename/move events) */
  newPath?: string;
  /** Event timestamp */
  timestamp: string; // ISO 8601 format
  /** Additional event metadata */
  metadata?: Record<string, any>;
}

/** Workspace configuration */
export interface WorkspaceConfig {
  /** Workspace identifier */
  id: UUID;
  /** Workspace name */
  name: string;
  /** Root path */
  rootPath: string;
  /** Workspace isolation level */
  isolationLevel: WorkspaceIsolationLevel;
  /** Allowed file extensions */
  allowedExtensions?: string[];
  /** Blocked file extensions */
  blockedExtensions?: string[];
  /** Allowed directories (relative to root) */
  allowedDirectories?: string[];
  /** Blocked directories (relative to root) */
  blockedDirectories?: string[];
  /** Maximum file size in bytes */
  maxFileSize?: number;
  /** Maximum total workspace size in bytes */
  maxWorkspaceSize?: number;
  /** Whether workspace is read-only */
  readOnly: boolean;
  /** Workspace creation timestamp */
  createdAt: string; // ISO 8601 format
  /** Last access timestamp */
  lastAccessed: string; // ISO 8601 format
}

/** Backup configuration */
export interface BackupConfig {
  /** Backup identifier */
  id: UUID;
  /** Backup name/label */
  name: string;
  /** Backup type */
  type: BackupOperationType;
  /** Source path to backup */
  sourcePath: string;
  /** Backup destination path */
  destinationPath: string;
  /** Whether backup is enabled */
  enabled: boolean;
  /** Backup schedule (cron expression) */
  schedule?: string;
  /** Retention policy in days */
  retentionDays: number;
  /** Compression enabled */
  compressed: boolean;
  /** Include patterns */
  includePatterns?: string[];
  /** Exclude patterns */
  excludePatterns?: string[];
  /** Project context */
  projectId?: UUID;
  /** Backup creation timestamp */
  createdAt: string; // ISO 8601 format
}

/** Backup execution record */
export interface BackupExecution {
  /** Execution identifier */
  id: UUID;
  /** Backup configuration used */
  backupConfigId: UUID;
  /** Execution status */
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** Backup start timestamp */
  startedAt: string; // ISO 8601 format
  /** Backup completion timestamp */
  completedAt?: string; // ISO 8601 format
  /** Number of files backed up */
  filesBackedUp?: number;
  /** Total backup size in bytes */
  backupSize?: number;
  /** Execution duration in milliseconds */
  duration?: number;
  /** Error information (if backup failed) */
  error?: {
    /** Error code */
    code: string;
    /** Error message */
    message: string;
    /** Stack trace */
    stackTrace?: string;
  };
  /** Backup file path */
  backupPath?: string;
}

/** File system statistics */
export interface FileSystemStats {
  /** Workspace identifier */
  workspaceId: UUID;
  /** Statistics timestamp */
  timestamp: string; // ISO 8601 format
  /** Total number of files */
  totalFiles: number;
  /** Total number of directories */
  totalDirectories: number;
  /** Total workspace size in bytes */
  totalSize: number;
  /** Available space in bytes */
  availableSpace: number;
  /** Used space percentage */
  usedSpacePercentage: number;
  /** File type breakdown */
  fileTypes: Record<string, number>;
  /** Largest files */
  largestFiles: Array<{
    path: string;
    size: number;
  }>;
  /** Recently modified files */
  recentlyModified: Array<{
    path: string;
    modifiedAt: string;
  }>;
}
```

## **3. API Endpoint Specification (OpenAPI `paths` block)**

```yaml
paths:
  /api/v1/filesystem/entries:
    get:
      tags:
        - FileSystem
      summary: List directory contents
      description: Retrieves the contents of a directory with filtering and metadata options
      security:
        - localAuth: []
      parameters:
        - name: path
          in: query
          description: Directory path to list (relative to workspace root)
          required: true
          schema:
            type: string
        - name: recursive
          in: query
          description: Whether to list contents recursively
          required: false
          schema:
            type: boolean
            default: false
        - name: includeMetadata
          in: query
          description: Whether to include detailed metadata for each entry
          required: false
          schema:
            type: boolean
            default: true
        - name: fileTypes
          in: query
          description: Filter by file types (extensions)
          required: false
          schema:
            type: string
            example: "js,ts,json"
        - name: workspaceId
          in: query
          description: Workspace context for path resolution
          required: false
          schema:
            $ref: '#/components/schemas/UUID'
      responses:
        '200':
          description: Directory contents retrieved successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          entries:
                            type: array
                            items:
                              $ref: '#/components/schemas/FileSystemEntry'
                          totalCount:
                            type: integer
                          path:
                            type: string
        '400':
          description: Invalid path or request parameters
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiErrorResponse'
        '403':
          description: Access denied to specified path
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiErrorResponse'
        '404':
          description: Directory not found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiErrorResponse'

  /api/v1/filesystem/files:
    get:
      tags:
        - FileSystem
      summary: Read file contents
      description: Retrieves the contents of a specific file
      security:
        - localAuth: []
      parameters:
        - name: path
          in: query
          description: File path to read (relative to workspace root)
          required: true
          schema:
            type: string
        - name: encoding
          in: query
          description: Content encoding format
          required: false
          schema:
            type: string
            enum: [utf8, base64, binary]
            default: utf8
        - name: workspaceId
          in: query
          description: Workspace context for path resolution
          required: false
          schema:
            $ref: '#/components/schemas/UUID'
      responses:
        '200':
          description: File contents retrieved successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          content:
                            type: string
                          encoding:
                            type: string
                          metadata:
                            $ref: '#/components/schemas/FileSystemEntry'
        '400':
          description: Invalid file path or encoding
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiErrorResponse'
        '403':
          description: Access denied to file
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiErrorResponse'
        '404':
          description: File not found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiErrorResponse'

    post:
      tags:
        - FileSystem
      summary: Create or update file
      description: Creates a new file or updates an existing file with the provided content
      security:
        - localAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                path:
                  type: string
                  description: File path (relative to workspace root)
                content:
                  type: string
                  description: File content
                encoding:
                  type: string
                  enum: [utf8, base64, binary]
                  default: utf8
                  description: Content encoding
                options:
                  type: object
                  properties:
                    createDirectories:
                      type: boolean
                      default: true
                      description: Create parent directories if they don't exist
                    overwrite:
                      type: boolean
                      default: false
                      description: Overwrite existing file
                    preserveTimestamps:
                      type: boolean
                      default: false
                      description: Preserve existing timestamps
                workspaceId:
                  $ref: '#/components/schemas/UUID'
                  description: Workspace context
                projectId:
                  $ref: '#/components/schemas/UUID'
                  description: Project context for logging
              required:
                - path
                - content
      responses:
        '201':
          description: File created successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/FileOperationResult'
        '200':
          description: File updated successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/FileOperationResult'
        '400':
          description: Invalid file path, content, or options
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiErrorResponse'
        '403':
          description: Access denied or workspace is read-only
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiErrorResponse'
        '409':
          description: File exists and overwrite is disabled
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiErrorResponse'

    delete:
      tags:
        - FileSystem
      summary: Delete file or directory
      description: Removes a file or directory from the file system
      security:
        - localAuth: []
      parameters:
        - name: path
          in: query
          description: Path to delete (relative to workspace root)
          required: true
          schema:
            type: string
        - name: recursive
          in: query
          description: Delete directories recursively
          required: false
          schema:
            type: boolean
            default: false
        - name: workspaceId
          in: query
          description: Workspace context
          required: false
          schema:
            $ref: '#/components/schemas/UUID'
      responses:
        '200':
          description: File or directory deleted successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/FileOperationResult'
        '400':
          description: Invalid path or recursive option
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiErrorResponse'
        '403':
          description: Access denied or workspace is read-only
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiErrorResponse'
        '404':
          description: File or directory not found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiErrorResponse'

  /api/v1/filesystem/operations:
    post:
      tags:
        - FileSystem
      summary: Execute file system operation
      description: Executes complex file system operations like copy, move, or batch operations
      security:
        - localAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                operation:
                  type: string
                  enum: [copy, move]
                sourcePath:
                  type: string
                  description: Source path
                destinationPath:
                  type: string
                  description: Destination path
                options:
                  type: object
                  properties:
                    createDirectories:
                      type: boolean
                      default: true
                    overwrite:
                      type: boolean
                      default: false
                    preserveTimestamps:
                      type: boolean
                      default: true
                    followSymlinks:
                      type: boolean
                      default: true
                workspaceId:
                  $ref: '#/components/schemas/UUID'
                projectId:
                  $ref: '#/components/schemas/UUID'
              required:
                - operation
                - sourcePath
                - destinationPath
      responses:
        '200':
          description: Operation completed successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/FileOperationResult'
        '400':
          description: Invalid operation parameters
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiErrorResponse'
        '403':
          description: Access denied
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiErrorResponse'
        '404':
          description: Source path not found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiErrorResponse'

  /api/v1/filesystem/watchers:
    get:
      tags:
        - FileSystem
      summary: List file watchers
      description: Retrieves list of active file watchers
      security:
        - localAuth: []
      parameters:
        - name: projectId
          in: query
          description: Filter watchers by project
          required: false
          schema:
            $ref: '#/components/schemas/UUID'
        - name: active
          in: query
          description: Filter by active status
          required: false
          schema:
            type: boolean
      responses:
        '200':
          description: File watchers retrieved successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          watchers:
                            type: array
                            items:
                              $ref: '#/components/schemas/FileWatcher'
                          totalCount:
                            type: integer

    post:
      tags:
        - FileSystem
      summary: Create file watcher
      description: Creates a new file system watcher to monitor changes
      security:
        - localAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                pattern:
                  type: string
                  description: File path pattern to watch
                events:
                  type: array
                  items:
                    type: string
                    enum: [created, modified, deleted, renamed, moved]
                  description: Events to watch for
                recursive:
                  type: boolean
                  default: true
                  description: Watch subdirectories recursively
                callbackUrl:
                  type: string
                  format: uri
                  description: URL to notify on events
                projectId:
                  $ref: '#/components/schemas/UUID'
              required:
                - pattern
                - events
      responses:
        '201':
          description: File watcher created successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/FileWatcher'
        '400':
          description: Invalid watcher configuration
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiErrorResponse'

  /api/v1/filesystem/watchers/{watcherId}:
    delete:
      tags:
        - FileSystem
      summary: Remove file watcher
      description: Removes an existing file system watcher
      security:
        - localAuth: []
      parameters:
        - name: watcherId
          in: path
          required: true
          schema:
            $ref: '#/components/schemas/UUID'
      responses:
        '200':
          description: File watcher removed successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiResponse'
        '404':
          description: File watcher not found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiErrorResponse'

  /api/v1/filesystem/workspaces:
    get:
      tags:
        - FileSystem
      summary: List workspaces
      description: Retrieves list of configured workspaces
      security:
        - localAuth: []
      responses:
        '200':
          description: Workspaces retrieved successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          workspaces:
                            type: array
                            items:
                              $ref: '#/components/schemas/WorkspaceConfig'

    post:
      tags:
        - FileSystem
      summary: Create workspace
      description: Creates a new workspace configuration
      security:
        - localAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
                  minLength: 1
                  maxLength: 100
                rootPath:
                  type: string
                  description: Absolute path to workspace root
                isolationLevel:
                  type: string
                  enum: [strict, moderate, permissive]
                  default: moderate
                allowedExtensions:
                  type: array
                  items:
                    type: string
                blockedExtensions:
                  type: array
                  items:
                    type: string
                maxFileSize:
                  type: integer
                  minimum: 1
                  description: Maximum file size in bytes
                readOnly:
                  type: boolean
                  default: false
              required:
                - name
                - rootPath
      responses:
        '201':
          description: Workspace created successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/WorkspaceConfig'
        '400':
          description: Invalid workspace configuration
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiErrorResponse'
        '409':
          description: Workspace with same name or path already exists
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiErrorResponse'

  /api/v1/filesystem/backups:
    get:
      tags:
        - FileSystem
      summary: List backup configurations
      description: Retrieves list of backup configurations and recent executions
      security:
        - localAuth: []
      parameters:
        - name: projectId
          in: query
          description: Filter backups by project
          required: false
          schema:
            $ref: '#/components/schemas/UUID'
      responses:
        '200':
          description: Backup configurations retrieved successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          backups:
                            type: array
                            items:
                              $ref: '#/components/schemas/BackupConfig'
                          recentExecutions:
                            type: array
                            items:
                              $ref: '#/components/schemas/BackupExecution'

    post:
      tags:
        - FileSystem
      summary: Create backup configuration
      description: Creates a new backup configuration
      security:
        - localAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
                  minLength: 1
                  maxLength: 100
                type:
                  type: string
                  enum: [full, incremental, differential]
                  default: full
                sourcePath:
                  type: string
                  description: Path to backup
                destinationPath:
                  type: string
                  description: Backup destination
                schedule:
                  type: string
                  description: Cron expression for scheduling
                retentionDays:
                  type: integer
                  minimum: 1
                  default: 30
                compressed:
                  type: boolean
                  default: true
                includePatterns:
                  type: array
                  items:
                    type: string
                excludePatterns:
                  type: array
                  items:
                    type: string
                projectId:
                  $ref: '#/components/schemas/UUID'
              required:
                - name
                - sourcePath
                - destinationPath
      responses:
        '201':
          description: Backup configuration created successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/BackupConfig'

  /api/v1/filesystem/backups/{backupId}/execute:
    post:
      tags:
        - FileSystem
      summary: Execute backup
      description: Manually triggers execution of a backup configuration
      security:
        - localAuth: []
      parameters:
        - name: backupId
          in: path
          required: true
          schema:
            $ref: '#/components/schemas/UUID'
      responses:
        '202':
          description: Backup execution started
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/BackupExecution'
        '404':
          description: Backup configuration not found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiErrorResponse'

  /api/v1/filesystem/stats:
    get:
      tags:
        - FileSystem
      summary: Get file system statistics
      description: Retrieves file system usage statistics for workspace
      security:
        - localAuth: []
      parameters:
        - name: workspaceId
          in: query
          description: Workspace to analyze
          required: false
          schema:
            $ref: '#/components/schemas/UUID'
      responses:
        '200':
          description: File system statistics retrieved successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/FileSystemStats'

components:
  schemas:
    FileSystemEntry:
      type: object
      required:
        - path
        - absolutePath
        - type
        - size
        - createdAt
        - modifiedAt
        - accessedAt
        - permissions
        - readable
        - writable
        - executable
      properties:
        path:
          type: string
        absolutePath:
          type: string
        type:
          type: string
          enum: [file, directory, symlink]
        size:
          type: integer
        createdAt:
          type: string
          format: date-time
        modifiedAt:
          type: string
          format: date-time
        accessedAt:
          type: string
          format: date-time
        permissions:
          type: string
        readable:
          type: boolean
        writable:
          type: boolean
        executable:
          type: boolean
        mimeType:
          type: string
        extension:
          type: string
        children:
          type: array
          items:
            $ref: '#/components/schemas/FileSystemEntry'
        contentHash:
          type: string

    FileOperationResult:
      type: object
      required:
        - requestId
        - success
        - executionTime
        - completedAt
      properties:
        requestId:
          $ref: '#/components/schemas/UUID'
        success:
          type: boolean
        result:
          type: object
          properties:
            entry:
              $ref: '#/components/schemas/FileSystemEntry'
            content:
              type: string
            encoding:
              type: string
            metadata:
              type: object
        error:
          type: object
          properties:
            code:
              type: string
            message:
              type: string
            details:
              type: object
        executionTime:
          type: number
        completedAt:
          type: string
          format: date-time

    FileWatcher:
      type: object
      required:
        - id
        - pattern
        - events
        - recursive
        - active
        - createdAt
      properties:
        id:
          $ref: '#/components/schemas/UUID'
        pattern:
          type: string
        events:
          type: array
          items:
            type: string
            enum: [created, modified, deleted, renamed, moved]
        recursive:
          type: boolean
        active:
          type: boolean
        callbackUrl:
          type: string
        projectId:
          $ref: '#/components/schemas/UUID'
        createdAt:
          type: string
          format: date-time
        lastActivity:
          type: string
          format: date-time

    WorkspaceConfig:
      type: object
      required:
        - id
        - name
        - rootPath
        - isolationLevel
        - readOnly
        - createdAt
        - lastAccessed
      properties:
        id:
          $ref: '#/components/schemas/UUID'
        name:
          type: string
        rootPath:
          type: string
        isolationLevel:
          type: string
          enum: [strict, moderate, permissive]
        allowedExtensions:
          type: array
          items:
            type: string
        blockedExtensions:
          type: array
          items:
            type: string
        allowedDirectories:
          type: array
          items:
            type: string
        blockedDirectories:
          type: array
          items:
            type: string
        maxFileSize:
          type: integer
        maxWorkspaceSize:
          type: integer
        readOnly:
          type: boolean
        createdAt:
          type: string
          format: date-time
        lastAccessed:
          type: string
          format: date-time

    BackupConfig:
      type: object
      required:
        - id
        - name
        - type
        - sourcePath
        - destinationPath
        - enabled
        - retentionDays
        - compressed
        - createdAt
      properties:
        id:
          $ref: '#/components/schemas/UUID'
        name:
          type: string
        type:
          type: string
          enum: [full, incremental, differential]
        sourcePath:
          type: string
        destinationPath:
          type: string
        enabled:
          type: boolean
        schedule:
          type: string
        retentionDays:
          type: integer
        compressed:
          type: boolean
        includePatterns:
          type: array
          items:
            type: string
        excludePatterns:
          type: array
          items:
            type: string
        projectId:
          $ref: '#/components/schemas/UUID'
        createdAt:
          type: string
          format: date-time

    BackupExecution:
      type: object
      required:
        - id
        - backupConfigId
        - status
        - startedAt
      properties:
        id:
          $ref: '#/components/schemas/UUID'
        backupConfigId:
          $ref: '#/components/schemas/UUID'
        status:
          type: string
          enum: [pending, running, completed, failed]
        startedAt:
          type: string
          format: date-time
        completedAt:
          type: string
          format: date-time
        filesBackedUp:
          type: integer
        backupSize:
          type: integer
        duration:
          type: integer
        error:
          type: object
          properties:
            code:
              type: string
            message:
              type: string
            stackTrace:
              type: string
        backupPath:
          type: string

    FileSystemStats:
      type: object
      required:
        - workspaceId
        - timestamp
        - totalFiles
        - totalDirectories
        - totalSize
        - availableSpace
        - usedSpacePercentage
        - fileTypes
        - largestFiles
        - recentlyModified
      properties:
        workspaceId:
          $ref: '#/components/schemas/UUID'
        timestamp:
          type: string
          format: date-time
        totalFiles:
          type: integer
        totalDirectories:
          type: integer
        totalSize:
          type: integer
        availableSpace:
          type: integer
        usedSpacePercentage:
          type: number
        fileTypes:
          type: object
          additionalProperties:
            type: integer
        largestFiles:
          type: array
          items:
            type: object
            properties:
              path:
                type: string
              size:
                type: integer
        recentlyModified:
          type: array
          items:
            type: object
            properties:
              path:
                type: string
              modifiedAt:
                type: string
                format: date-time
```

## **4. Detailed Business Logic & Validation Rules**

| Rule ID | Rule Description | Implementation Location(s) & Notes |
|---------|------------------|-----------------------------------|
| **FS-01** | All file operations must be validated against workspace isolation rules before execution, ensuring operations are only allowed within permitted directories and on allowed file types. | **Backend (Authoritative):** File service must query Configuration Management Module for workspace configuration and validate all paths against isolation rules before performing any file system operations. |
| **FS-02** | File watchers must automatically clean up and deactivate when their associated project is deleted or becomes inactive to prevent resource leaks. | **Backend (Authoritative):** Watcher service must integrate with Project Management Module to receive project lifecycle events and automatically remove watchers for deleted/inactive projects. |
| **FS-03** | Backup operations must respect the retention policy from Configuration Management Module and automatically clean up old backups to prevent disk space exhaustion. | **Backend (Authoritative):** Backup service must query Configuration Management Module for retention policies and implement automated cleanup based on configured retention periods (default 30 days per Core Contracts). |
| **FS-04** | All file operations must be logged to the Logging & Monitoring Service with appropriate detail level and performance metrics for audit trails and KPI tracking. | **Backend (Authoritative):** File operations service must send structured log entries to Logging & Monitoring Service including operation type, file paths, execution time, and success/failure status. |
| **FS-05** | File content must be validated for maximum size limits defined in workspace configuration before write operations to prevent disk space issues. | **Backend (Authoritative):** File write operations must check content size against workspace configuration limits from Configuration Management Module and reject operations exceeding limits. |
| **FS-06** | Concurrent file operations on the same path must be serialized to prevent race conditions and ensure data consistency. | **Backend (Authoritative):** File operations service must implement file-level locking mechanism using path-based mutexes to serialize operations on identical file paths. |
| **FS-07** | File watchers must debounce rapid file changes to prevent excessive callback notifications and system overload. | **Backend (Authoritative):** Watcher service must implement debouncing logic with configurable delay (default 500ms) to batch rapid sequential changes to the same file into single notifications. |
| **FS-08** | Backup configurations must validate source and destination paths for accessibility and permissions before allowing backup creation. | **Backend (Authoritative):** Backup service must perform pre-flight checks on source/destination paths, verifying read access to source and write access to destination during configuration creation. |
| **FS-09** | File operations involving symbolic links must respect the followSymlinks option and prevent infinite loops from circular symbolic links. | **Backend (Authoritative):** File operations service must implement symlink resolution with loop detection (max depth 10) and respect followSymlinks configuration to prevent infinite recursion. |
| **FS-10** | All sensitive file paths containing configuration data, credentials, or private keys must be excluded from backup operations by default. | **Backend (Authoritative):** Backup service must implement default exclusion patterns for sensitive files (.env, *.key, *.pem, credentials/*) and allow custom patterns from Configuration Management Module. |

## **5. Developer Task Checklist**

### **Backend Tasks:**
- [ ] Create database migration script for file system tables (`file_operations`, `file_watchers`, `workspace_configs`, `backup_configs`, `backup_executions`, `file_system_stats`)
- [ ] Implement the `FileSystemService` class with secure file CRUD operations, path validation, and workspace isolation enforcement
- [ ] Implement the `WorkspaceManager` class for workspace configuration management, isolation rules, and access control validation
- [ ] Implement the `FileWatcherService` class with native file system watching, event debouncing, and callback notification management
- [ ] Implement the `BackupService` class with scheduled backup execution, compression, retention management, and progress tracking
- [ ] Implement all file system API endpoints (`GET`, `POST`, `DELETE /api/v1/filesystem/files`) with comprehensive error handling and logging
- [ ] Implement directory listing endpoints (`GET /api/v1/filesystem/entries`) with recursive traversal, filtering, and metadata collection
- [ ] Implement file operation endpoints (`POST /api/v1/filesystem/operations`) for copy, move, and batch operations
- [ ] Implement watcher management endpoints (`GET`, `POST /api/v1/filesystem/watchers`, `DELETE /api/v1/filesystem/watchers/{id}`)
- [ ] Implement workspace management endpoints (`GET`, `POST /api/v1/filesystem/workspaces`) with configuration validation
- [ ] Implement backup management endpoints (`GET`, `POST /api/v1/filesystem/backups`, `POST /api/v1/filesystem/backups/{id}/execute`)
- [ ] Implement file system statistics endpoint (`GET /api/v1/filesystem/stats`) with usage analysis and reporting
- [ ] Create `FileSystemRepository` class for file operation logging, metadata storage, and audit trail persistence
- [ ] Create `PathValidator` utility class for workspace isolation validation, path sanitization, and security checks
- [ ] Create `FileContentAnalyzer` utility class for MIME type detection, content validation, and encoding handling
- [ ] Implement file locking mechanism to prevent concurrent operation conflicts on same files
- [ ] Implement symlink resolution with circular link detection and configurable maximum depth
- [ ] Create backup compression and decompression utilities with progress reporting
- [ ] Integrate with Configuration Management Module for workspace settings, backup policies, and security configurations
- [ ] Integrate with Logging & Monitoring Service for operation logging, performance metrics, and error tracking
- [ ] Implement comprehensive unit tests for all service classes with mock file system operations
- [ ] Create integration tests for file operations with real file system interactions and temporary directories
- [ ] Implement performance tests for file watching, backup operations, and large file handling
- [ ] Add file system health checks for disk space monitoring, permission validation, and backup status verification

### **Frontend Tasks:**
- [ ] Create `FileSystemProvider` React context for accessing file system operations and state management
- [ ] Implement `useFileSystem` hook for file CRUD operations, directory navigation, and file watching capabilities
- [ ] Create `FileExplorer` component for browsing directory structures with tree view, search, and filtering
- [ ] Implement `FileEditor` component for viewing and editing file contents with syntax highlighting and save functionality
- [ ] Create `FileUploader` component for drag-and-drop file uploads with progress tracking and validation
- [ ] Implement `WorkspaceManager` component for workspace configuration, isolation settings, and access control management
- [ ] Create `BackupManager` component for backup configuration, scheduling, execution monitoring, and restore functionality
- [ ] Implement `FileWatcher` component for configuring file watching patterns, event monitoring, and notification display
- [ ] Create `FileSystemStats` component for displaying workspace usage statistics, file type breakdowns, and disk usage charts
- [ ] Implement file system service functions in the API client (`fileSystemService.ts`) for all file system endpoints
- [ ] Create file operation progress tracking with cancellation support for long-running operations
- [ ] Implement file preview functionality for common file types (text, images, JSON, markdown)
- [ ] Add file system error handling with user-friendly error messages and retry mechanisms
- [ ] Create file and directory context menus with copy, move, rename, and delete operations
- [ ] Implement file search functionality with content search, file name filtering, and advanced search options
- [ ] Add keyboard shortcuts for common file operations (Ctrl+S for save, F2 for rename, Delete for delete)
- [ ] Create file history and version tracking interface for backup and restore operations
- [ ] Implement real-time file system updates using file watcher events and WebSocket connections
- [ ] Add file system security warnings for operations outside workspace boundaries or on sensitive files
- [ ] Create batch operation interfaces for multiple file selection and bulk operations (delete, move, copy)


========================================================================================