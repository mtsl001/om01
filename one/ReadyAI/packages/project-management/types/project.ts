// packages/project-management/types/project.ts

/**
 * Project Management Types for ReadyAI Personal AI Development Orchestrator
 * 
 * Comprehensive type definitions for project lifecycle, orchestration, and management.
 * Adapted from Cline's proven task and workspace management patterns with ReadyAI-specific
 * extensions for multi-phase development methodology and local-first architecture.
 * 
 * Primary Cline Sources:
 * - src/core/task/types.ts (task state and lifecycle patterns)
 * - src/core/workspace/types.ts (workspace organization)
 * - src/shared/api.ts (configuration interfaces)
 * 
 * @version 1.0.0 - Phase 2.1 Implementation
 * @author ReadyAI Development Team
 */

import {
  UUID,
  ApiResponse,
  PhaseType,
  PhaseStatus,
  TechStack,
  ProjectConfig,
  AIProviderType,
  DependencyGraph,
  ValidationResult,
  QualityMetrics,
  generateUUID,
  createTimestamp,
  ReadyAIError
} from '../../foundation/types/core'

// =============================================================================
// PROJECT CORE TYPES
// =============================================================================

/**
 * Project creation method indicating how the project was initialized
 */
export type ProjectCreationMethod = 'wizard' | 'template' | 'import' | 'clone' | 'manual'

/**
 * Project complexity level for resource allocation and timeline estimation
 */
export type ProjectComplexity = 'simple' | 'moderate' | 'complex' | 'enterprise'

/**
 * Project priority level for resource allocation and scheduling
 */
export type ProjectPriority = 'low' | 'medium' | 'high' | 'critical'

/**
 * Project visibility and access control settings
 */
export type ProjectVisibility = 'private' | 'team' | 'organization' | 'public'

/**
 * Project archival status for lifecycle management
 */
export type ProjectArchivalStatus = 'active' | 'paused' | 'completed' | 'archived' | 'deleted'

/**
 * Project health status based on various quality metrics
 */
export type ProjectHealth = 'excellent' | 'good' | 'fair' | 'poor' | 'critical'

// =============================================================================
// PROJECT METADATA AND CATEGORIZATION
// =============================================================================

/**
 * Project category for organization and filtering
 */
export interface ProjectCategory {
  /** Unique identifier for the category */
  id: UUID
  /** Display name of the category */
  name: string
  /** Optional category description */
  description?: string
  /** Category color for UI display */
  color?: string
  /** Category icon identifier */
  icon?: string
  /** Parent category for hierarchical organization */
  parentId?: UUID
  /** Order for display sorting */
  order: number
}

/**
 * Project tag for flexible labeling and search
 */
export interface ProjectTag {
  /** Unique identifier for the tag */
  id: UUID
  /** Tag name/label */
  name: string
  /** Optional tag description */
  description?: string
  /** Tag color for UI display */
  color?: string
  /** Usage count for popularity metrics */
  usageCount: number
  /** Tag creation timestamp */
  createdAt: string
}

/**
 * Project template for rapid project creation
 */
export interface ProjectTemplate {
  /** Unique identifier for the template */
  id: UUID
  /** Template name */
  name: string
  /** Template description */
  description: string
  /** Template category */
  category: ProjectCategory
  /** Technology stack configuration */
  techStack: TechStack
  /** Default project configuration */
  defaultConfig: ProjectConfig
  /** Template complexity level */
  complexity: ProjectComplexity
  /** Estimated completion time in hours */
  estimatedHours: number
  /** Template version */
  version: string
  /** Template author/creator */
  author: string
  /** Template creation timestamp */
  createdAt: string
  /** Last update timestamp */
  updatedAt: string
  /** Template usage count */
  usageCount: number
  /** Template rating (0-5) */
  rating: number
  /** Template preview images */
  previewImages?: string[]
  /** Required skills/knowledge */
  prerequisites: string[]
  /** Learning objectives */
  learningObjectives: string[]
}

// =============================================================================
// PROJECT LIFECYCLE AND STATUS TRACKING
// =============================================================================

/**
 * Project milestone for tracking major achievements
 */
export interface ProjectMilestone {
  /** Unique identifier for the milestone */
  id: UUID
  /** Milestone name */
  name: string
  /** Milestone description */
  description?: string
  /** Associated phase */
  phase: PhaseType
  /** Target completion date */
  targetDate?: string
  /** Actual completion date */
  completedAt?: string
  /** Milestone status */
  status: PhaseStatus
  /** Dependencies on other milestones */
  dependencies: UUID[]
  /** Success criteria for completion */
  successCriteria: string[]
  /** Completion percentage (0-100) */
  completionPercentage: number
  /** Associated deliverables */
  deliverables: string[]
}

/**
 * Project phase instance with ReadyAI-specific extensions
 */
export interface ProjectPhase {
  /** Phase type identifier */
  id: PhaseType
  /** Current status of phase */
  status: PhaseStatus
  /** Phase start timestamp */
  startedAt?: string
  /** Phase completion timestamp */
  completedAt?: string
  /** Phase duration in milliseconds */
  duration?: number
  /** Dependencies on other phases */
  dependencies: PhaseType[]
  /** Phase-specific milestones */
  milestones: ProjectMilestone[]
  /** Generated artifacts for this phase */
  artifacts: PhaseArtifact[]
  /** Validation results */
  validationResults: ValidationResult[]
  /** AI provider used for this phase */
  aiProvider?: AIProviderType
  /** Token usage for this phase */
  tokenUsage?: {
    input: number
    output: number
    total: number
    cost: number
  }
  /** Phase configuration overrides */
  configuration?: Record<string, any>
  /** Phase-specific notes and comments */
  notes?: string[]
  /** Quality score for this phase (0-100) */
  qualityScore?: number
}

/**
 * Enhanced artifact generated during project phases
 */
export interface PhaseArtifact {
  /** Unique artifact identifier */
  id: UUID
  /** Associated phase */
  phaseId: PhaseType
  /** Artifact name */
  name: string
  /** Artifact type/category */
  type: string
  /** File path relative to project root */
  path: string
  /** Artifact content */
  content: string
  /** Content MIME type */
  mimeType: string
  /** File size in bytes */
  size: number
  /** Content hash for change detection */
  contentHash: string
  /** Generation timestamp */
  generatedAt: string
  /** Last modification timestamp */
  modifiedAt?: string
  /** Generation metadata */
  metadata: {
    generator: 'ai' | 'template' | 'user' | 'import'
    confidence?: number
    reviewStatus: 'pending' | 'approved' | 'rejected' | 'needs_revision'
    aiModel?: string
    generationPrompt?: string
  }
  /** Version history */
  versions?: {
    version: number
    timestamp: string
    changes: string
    author: string
  }[]
  /** Artifact tags for organization */
  tags: string[]
  /** Dependencies on other artifacts */
  dependencies: UUID[]
}

// =============================================================================
// PROJECT COLLABORATION AND OWNERSHIP
// =============================================================================

/**
 * Project collaborator with role-based permissions
 */
export interface ProjectCollaborator {
  /** Unique identifier for the collaborator */
  id: UUID
  /** User identifier */
  userId: UUID
  /** Display name */
  name: string
  /** Email address */
  email: string
  /** Avatar/profile image URL */
  avatar?: string
  /** Collaboration role */
  role: 'owner' | 'admin' | 'editor' | 'viewer' | 'guest'
  /** Permissions granted */
  permissions: {
    read: boolean
    write: boolean
    delete: boolean
    invite: boolean
    configure: boolean
    deploy: boolean
  }
  /** Invitation timestamp */
  invitedAt: string
  /** Acceptance timestamp */
  joinedAt?: string
  /** Last activity timestamp */
  lastActiveAt?: string
  /** Collaboration status */
  status: 'invited' | 'active' | 'inactive' | 'suspended'
  /** Contribution statistics */
  contributions: {
    commits: number
    files: number
    issues: number
    reviews: number
  }
}

/**
 * Project sharing and access control settings
 */
export interface ProjectSharingSettings {
  /** Project visibility level */
  visibility: ProjectVisibility
  /** Allow public access */
  isPublic: boolean
  /** Require authentication for access */
  requireAuth: boolean
  /** Allow anonymous viewing */
  allowAnonymousView: boolean
  /** Allow cloning/forking */
  allowCloning: boolean
  /** Enable collaboration features */
  enableCollaboration: boolean
  /** Maximum number of collaborators */
  maxCollaborators: number
  /** Invitation expiration time in milliseconds */
  invitationExpiresIn: number
  /** Access control list */
  accessList: {
    userId: UUID
    permissions: string[]
    expiresAt?: string
  }[]
}

// =============================================================================
// PROJECT PERFORMANCE AND ANALYTICS
// =============================================================================

/**
 * Project performance metrics and analytics
 */
export interface ProjectPerformance {
  /** Performance measurement timestamp */
  timestamp: string
  /** Development velocity metrics */
  velocity: {
    /** Lines of code per day */
    linesPerDay: number
    /** Files created per day */
    filesPerDay: number
    /** Commits per day */
    commitsPerDay: number
    /** Issues resolved per day */
    issuesPerDay: number
  }
  /** Quality metrics */
  quality: QualityMetrics
  /** Time tracking */
  timeTracking: {
    /** Total time spent in milliseconds */
    totalTime: number
    /** Time per phase breakdown */
    phaseTime: Record<PhaseType, number>
    /** Active development time */
    activeTime: number
    /** Idle time */
    idleTime: number
  }
  /** Resource utilization */
  resources: {
    /** CPU usage percentage */
    cpu: number
    /** Memory usage in MB */
    memory: number
    /** Disk usage in MB */
    disk: number
    /** Network bandwidth usage in MB */
    network: number
  }
  /** AI usage statistics */
  aiUsage: {
    /** Total API calls */
    totalCalls: number
    /** Total tokens consumed */
    totalTokens: number
    /** Total cost in USD */
    totalCost: number
    /** Calls per provider */
    providerBreakdown: Record<AIProviderType, {
      calls: number
      tokens: number
      cost: number
    }>
  }
}

/**
 * Project analytics dashboard data
 */
export interface ProjectAnalytics {
  /** Project identifier */
  projectId: UUID
  /** Analytics time period */
  period: {
    startDate: string
    endDate: string
    granularity: 'hour' | 'day' | 'week' | 'month'
  }
  /** Performance history */
  performance: ProjectPerformance[]
  /** Phase progression timeline */
  phaseProgression: {
    phase: PhaseType
    startedAt: string
    completedAt?: string
    duration?: number
    status: PhaseStatus
  }[]
  /** Code generation statistics */
  codeGeneration: {
    totalFiles: number
    totalLines: number
    languageBreakdown: Record<string, {
      files: number
      lines: number
      percentage: number
    }>
    aiGeneratedPercentage: number
    userModifiedPercentage: number
  }
  /** Collaboration activity */
  collaboration: {
    activeCollaborators: number
    totalCollaborators: number
    activityTimeline: {
      timestamp: string
      userId: UUID
      action: string
      details: Record<string, any>
    }[]
  }
  /** Error and issue tracking */
  issues: {
    totalIssues: number
    resolvedIssues: number
    openIssues: number
    criticalIssues: number
    averageResolutionTime: number
    issueTypes: Record<string, number>
  }
}

// =============================================================================
// PROJECT INTEGRATION AND DEPLOYMENT
// =============================================================================

/**
 * Project deployment configuration
 */
export interface ProjectDeployment {
  /** Unique deployment identifier */
  id: UUID
  /** Deployment name */
  name: string
  /** Deployment environment */
  environment: 'development' | 'staging' | 'production' | 'testing'
  /** Deployment status */
  status: 'pending' | 'deploying' | 'deployed' | 'failed' | 'stopped'
  /** Deployment URL */
  url?: string
  /** Deployment configuration */
  configuration: {
    /** Build command */
    buildCommand?: string
    /** Start command */
    startCommand?: string
    /** Environment variables */
    environmentVariables: Record<string, string>
    /** Resource requirements */
    resources: {
      cpu: string
      memory: string
      storage: string
    }
    /** Auto-deployment settings */
    autoDeployment: {
      enabled: boolean
      branch: string
      conditions: string[]
    }
  }
  /** Deployment timestamp */
  deployedAt?: string
  /** Deployment duration in milliseconds */
  deploymentDuration?: number
  /** Deployment logs */
  logs?: string[]
  /** Health check configuration */
  healthCheck: {
    enabled: boolean
    endpoint: string
    interval: number
    timeout: number
    retries: number
  }
}

/**
 * Project integration with external services
 */
export interface ProjectIntegration {
  /** Unique integration identifier */
  id: UUID
  /** Integration name */
  name: string
  /** Integration type */
  type: 'git' | 'ci_cd' | 'monitoring' | 'notification' | 'analytics' | 'storage' | 'other'
  /** Service provider */
  provider: string
  /** Integration status */
  status: 'active' | 'inactive' | 'error' | 'pending'
  /** Configuration settings */
  configuration: Record<string, any>
  /** Authentication credentials */
  credentials: {
    type: 'api_key' | 'oauth' | 'token' | 'username_password'
    encrypted: boolean
    lastUpdated: string
  }
  /** Integration health */
  health: {
    lastCheck: string
    status: 'healthy' | 'warning' | 'error'
    message?: string
    responseTime?: number
  }
  /** Usage statistics */
  usage: {
    totalRequests: number
    successfulRequests: number
    failedRequests: number
    lastUsed: string
  }
}

// =============================================================================
// MAIN PROJECT INTERFACE
// =============================================================================

/**
 * Core project entity representing a complete ReadyAI software development project
 * 
 * Enhanced from Cline's task and workspace patterns with ReadyAI-specific features:
 * - Multi-phase development methodology
 * - AI-powered code generation tracking
 * - Local-first architecture
 * - Comprehensive project lifecycle management
 * - Advanced collaboration and analytics
 */
export interface Project {
  // Basic project identification
  /** Unique project identifier */
  id: UUID
  /** Project name */
  name: string
  /** Detailed project description */
  description?: string
  /** Project version */
  version: string
  
  // Project lifecycle
  /** Current development phase */
  currentPhase: PhaseType
  /** Project status */
  status: ProjectArchivalStatus
  /** Project health indicator */
  health: ProjectHealth
  /** Project priority level */
  priority: ProjectPriority
  /** Project complexity assessment */
  complexity: ProjectComplexity
  
  // Temporal tracking
  /** Project creation timestamp (ISO 8601 format) */
  createdAt: string
  /** Last modification timestamp (ISO 8601 format) */
  updatedAt: string
  /** Project start date */
  startedAt?: string
  /** Expected completion date */
  expectedCompletionAt?: string
  /** Actual completion date */
  completedAt?: string
  
  // Project organization
  /** Project category */
  category?: ProjectCategory
  /** Project tags for flexible labeling */
  tags: ProjectTag[]
  /** Project creation method */
  creationMethod: ProjectCreationMethod
  /** Source template if created from template */
  sourceTemplate?: UUID
  
  // Technical configuration
  /** Root file system path */
  rootPath: string
  /** Technology stack configuration */
  techStack: TechStack
  /** Project-specific configuration */
  config: ProjectConfig
  /** Dependency graph for the project */
  dependencyGraph?: DependencyGraph
  
  // Project structure and phases
  /** All project phases with detailed tracking */
  phases: ProjectPhase[]
  /** Project milestones */
  milestones: ProjectMilestone[]
  /** Generated and imported artifacts */
  artifacts: PhaseArtifact[]
  
  // Collaboration and sharing
  /** Project owner */
  ownerId: UUID
  /** Project collaborators */
  collaborators: ProjectCollaborator[]
  /** Sharing and access control settings */
  sharingSettings: ProjectSharingSettings
  
  // Performance and analytics
  /** Project performance metrics */
  performance?: ProjectPerformance
  /** Comprehensive project analytics */
  analytics?: ProjectAnalytics
  /** Quality metrics and validation results */
  qualityMetrics?: QualityMetrics
  
  // Integration and deployment
  /** Deployment configurations */
  deployments: ProjectDeployment[]
  /** External service integrations */
  integrations: ProjectIntegration[]
  
  // Project metadata
  /** Project size metrics */
  metrics: {
    /** Total number of files */
    totalFiles: number
    /** Total lines of code */
    totalLines: number
    /** Total tokens processed */
    totalTokens: number
    /** Project size in bytes */
    sizeInBytes: number
    /** Number of AI generations */
    aiGenerations: number
    /** User modifications count */
    userModifications: number
  }
  
  // Backup and versioning
  /** Last backup timestamp */
  lastBackupAt?: string
  /** Backup configuration */
  backupConfig: {
    enabled: boolean
    frequency: 'hourly' | 'daily' | 'weekly' | 'manual'
    retentionDays: number
    includeArtifacts: boolean
    compress: boolean
  }
  
  // AI-specific tracking
  /** AI provider usage statistics */
  aiProviderUsage: Record<AIProviderType, {
    totalCalls: number
    totalTokens: number
    totalCost: number
    successRate: number
    averageResponseTime: number
    lastUsed: string
  }>
  
  // User preferences and customization
  /** User-specific project preferences */
  preferences: {
    /** Default AI provider for this project */
    defaultAIProvider: AIProviderType
    /** Auto-save frequency in milliseconds */
    autoSaveInterval: number
    /** Enable notifications for this project */
    enableNotifications: boolean
    /** Notification preferences */
    notificationSettings: {
      phaseCompletion: boolean
      errors: boolean
      milestones: boolean
      collaboratorActivity: boolean
    }
    /** UI customization */
    uiCustomization: {
      theme: 'light' | 'dark' | 'auto'
      layout: 'standard' | 'compact' | 'detailed'
      sidebarCollapsed: boolean
    }
  }
}

// =============================================================================
// PROJECT MANAGEMENT OPERATIONS
// =============================================================================

/**
 * Project creation request with comprehensive configuration options
 */
export interface ProjectCreationRequest {
  /** Project name */
  name: string
  /** Project description */
  description?: string
  /** Template to use for creation */
  templateId?: UUID
  /** Technology stack configuration */
  techStack?: Partial<TechStack>
  /** Project configuration overrides */
  config?: Partial<ProjectConfig>
  /** Project category */
  categoryId?: UUID
  /** Initial tags */
  tags?: string[]
  /** Project priority */
  priority?: ProjectPriority
  /** Project complexity */
  complexity?: ProjectComplexity
  /** Root path for project creation */
  rootPath?: string
  /** Initial collaborators to invite */
  collaborators?: {
    email: string
    role: ProjectCollaborator['role']
  }[]
  /** Sharing settings */
  sharingSettings?: Partial<ProjectSharingSettings>
  /** Import existing project data */
  importData?: {
    source: 'git' | 'archive' | 'template' | 'clone'
    location: string
    options: Record<string, any>
  }
}

/**
 * Project update request for modifications
 */
export interface ProjectUpdateRequest {
  /** Updated project name */
  name?: string
  /** Updated description */
  description?: string
  /** Updated technology stack */
  techStack?: Partial<TechStack>
  /** Updated configuration */
  config?: Partial<ProjectConfig>
  /** Updated category */
  categoryId?: UUID
  /** Updated tags */
  tags?: string[]
  /** Updated priority */
  priority?: ProjectPriority
  /** Updated status */
  status?: ProjectArchivalStatus
  /** Updated sharing settings */
  sharingSettings?: Partial<ProjectSharingSettings>
  /** Updated preferences */
  preferences?: Partial<Project['preferences']>
}

/**
 * Project search and filtering criteria
 */
export interface ProjectSearchCriteria {
  /** Text search in name and description */
  query?: string
  /** Filter by category */
  categoryId?: UUID
  /** Filter by tags */
  tags?: string[]
  /** Filter by status */
  status?: ProjectArchivalStatus[]
  /** Filter by priority */
  priority?: ProjectPriority[]
  /** Filter by complexity */
  complexity?: ProjectComplexity[]
  /** Filter by current phase */
  currentPhase?: PhaseType[]
  /** Filter by owner */
  ownerId?: UUID
  /** Filter by collaborator */
  collaboratorId?: UUID
  /** Filter by creation date range */
  createdAfter?: string
  /** Filter by creation date range */
  createdBefore?: string
  /** Filter by last update date range */
  updatedAfter?: string
  /** Filter by last update date range */
  updatedBefore?: string
  /** Filter by technology stack */
  techStack?: {
    languages?: string[]
    frameworks?: string[]
    tools?: string[]
  }
  /** Sort criteria */
  sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'priority' | 'status' | 'health'
  /** Sort direction */
  sortDirection?: 'asc' | 'desc'
  /** Pagination */
  page?: number
  /** Items per page */
  limit?: number
}

/**
 * Project operation result with comprehensive feedback
 */
export interface ProjectOperationResult {
  /** Operation success status */
  success: boolean
  /** Created or updated project */
  project?: Project
  /** Validation errors if any */
  errors?: ValidationResult[]
  /** Operation warnings */
  warnings?: string[]
  /** Operation metadata */
  metadata: {
    /** Operation type */
    operation: 'create' | 'update' | 'delete' | 'archive' | 'restore'
    /** Operation timestamp */
    timestamp: string
    /** Processing time in milliseconds */
    processingTime: number
    /** User who performed the operation */
    userId: UUID
    /** Additional operation details */
    details?: Record<string, any>
  }
}

// =============================================================================
// PROJECT STATE MANAGEMENT
// =============================================================================

/**
 * Project state snapshot for versioning and rollback
 */
export interface ProjectSnapshot {
  /** Unique snapshot identifier */
  id: UUID
  /** Associated project identifier */
  projectId: UUID
  /** Snapshot name/label */
  name: string
  /** Snapshot description */
  description?: string
  /** Complete project state at time of snapshot */
  projectState: Project
  /** Snapshot creation timestamp */
  createdAt: string
  /** User who created the snapshot */
  createdBy: UUID
  /** Snapshot size in bytes */
  size: number
  /** Snapshot type */
  type: 'manual' | 'automatic' | 'milestone' | 'phase_completion'
  /** Whether this snapshot can be automatically cleaned up */
  canDelete: boolean
  /** Snapshot expiration date */
  expiresAt?: string
}

/**
 * Project state change event for audit and rollback tracking
 */
export interface ProjectStateChange {
  /** Unique change identifier */
  id: UUID
  /** Associated project identifier */
  projectId: UUID
  /** Change timestamp */
  timestamp: string
  /** User who made the change */
  userId: UUID
  /** Type of change */
  changeType: 'create' | 'update' | 'delete' | 'phase_change' | 'configuration' | 'collaboration'
  /** Changed fields */
  changedFields: string[]
  /** Previous values */
  previousValues: Record<string, any>
  /** New values */
  newValues: Record<string, any>
  /** Change description */
  description?: string
  /** Related snapshot if applicable */
  snapshotId?: UUID
}

// =============================================================================
// UTILITY FUNCTIONS AND HELPERS
// =============================================================================

/**
 * Create a new project with default values
 */
export function createProject(request: ProjectCreationRequest): Project {
  const now = createTimestamp()
  const projectId = generateUUID()
  
  return {
    id: projectId,
    name: request.name,
    description: request.description,
    version: '1.0.0',
    
    currentPhase: 'Phase0_StrategicCharter',
    status: 'active',
    health: 'good',
    priority: request.priority || 'medium',
    complexity: request.complexity || 'moderate',
    
    createdAt: now,
    updatedAt: now,
    
    category: undefined,
    tags: [],
    creationMethod: request.templateId ? 'template' : 'manual',
    sourceTemplate: request.templateId,
    
    rootPath: request.rootPath || '',
    techStack: {
      frontend: '',
      backend: '',
      database: '',
      languages: [],
      tools: [],
      ...request.techStack
    },
    config: {
      quality: {
        testCoverage: 80,
        lintingLevel: 'standard',
        typeChecking: 'standard'
      },
      aiSettings: {
        preferredProvider: 'claude-3.5-sonnet',
        extendedThinking: false,
        contextCompression: 'standard'
      },
      development: {
        autoSave: true,
        gitIntegration: true,
        checkpointFrequency: 'medium'
      },
      ...request.config
    },
    
    phases: [],
    milestones: [],
    artifacts: [],
    
    ownerId: generateUUID(), // This should come from the authenticated user
    collaborators: [],
    sharingSettings: {
      visibility: 'private',
      isPublic: false,
      requireAuth: true,
      allowAnonymousView: false,
      allowCloning: false,
      enableCollaboration: false,
      maxCollaborators: 10,
      invitationExpiresIn: 7 * 24 * 60 * 60 * 1000, // 7 days
      accessList: []
    },
    
    deployments: [],
    integrations: [],
    
    metrics: {
      totalFiles: 0,
      totalLines: 0,
      totalTokens: 0,
      sizeInBytes: 0,
      aiGenerations: 0,
      userModifications: 0
    },
    
    backupConfig: {
      enabled: true,
      frequency: 'daily',
      retentionDays: 30,
      includeArtifacts: true,
      compress: true
    },
    
    aiProviderUsage: {},
    
    preferences: {
      defaultAIProvider: 'claude-3.5-sonnet',
      autoSaveInterval: 30000, // 30 seconds
      enableNotifications: true,
      notificationSettings: {
        phaseCompletion: true,
        errors: true,
        milestones: true,
        collaboratorActivity: false
      },
      uiCustomization: {
        theme: 'auto',
        layout: 'standard',
        sidebarCollapsed: false
      }
    }
  }
}

/**
 * Validate project data against ReadyAI requirements
 */
export function validateProject(project: Project): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const suggestions: string[] = []

  // Basic validation
  if (!project.name || project.name.trim().length === 0) {
    errors.push('Project name is required')
  }
  
  if (project.name.length > 100) {
    errors.push('Project name must be 100 characters or less')
  }
  
  if (!project.rootPath) {
    warnings.push('Project root path is not set')
  }
  
  if (project.techStack.languages.length === 0) {
    warnings.push('No programming languages specified in tech stack')
  }
  
  // Phase validation
  if (!project.currentPhase) {
    errors.push('Project must have a current phase')
  }
  
  // Configuration validation
  if (project.config.quality.testCoverage < 0 || project.config.quality.testCoverage > 100) {
    errors.push('Test coverage must be between 0 and 100')
  }
  
  // Suggest improvements
  if (project.config.quality.testCoverage < 70) {
    suggestions.push('Consider increasing test coverage target for better quality')
  }
  
  if (project.techStack.tools.length === 0) {
    suggestions.push('Adding development tools to tech stack can improve project organization')
  }

  return {
    id: generateUUID(),
    type: 'project',
    passed: errors.length === 0,
    errors,
    warnings,
    suggestions,
    score: Math.max(0, 100 - (errors.length * 20) - (warnings.length * 5)),
    validatedAt: createTimestamp(),
    validator: 'ReadyAI Project Validator'
  }
}

/**
 * Calculate project health based on various metrics
 */
export function calculateProjectHealth(project: Project): ProjectHealth {
  let healthScore = 100
  
  // Reduce score based on issues
  const validation = validateProject(project)
  healthScore -= validation.errors.length * 15
  healthScore -= validation.warnings.length * 5
  
  // Consider phase progression
  const phaseCount = project.phases.length
  const completedPhases = project.phases.filter(p => p.status === 'completed').length
  if (phaseCount > 0) {
    const progressRatio = completedPhases / phaseCount
    if (progressRatio < 0.3) healthScore -= 10
  }
  
  // Consider quality metrics
  if (project.qualityMetrics) {
    if (project.qualityMetrics.testCoverage < 50) healthScore -= 15
    if (project.qualityMetrics.dependencyHealth < 70) healthScore -= 10
  }
  
  // Consider recent activity
  const lastUpdate = new Date(project.updatedAt).getTime()
  const daysSinceUpdate = (Date.now() - lastUpdate) / (1000 * 60 * 60 * 24)
  if (daysSinceUpdate > 30) healthScore -= 20
  else if (daysSinceUpdate > 7) healthScore -= 5
  
  // Determine health level
  if (healthScore >= 90) return 'excellent'
  if (healthScore >= 75) return 'good'
  if (healthScore >= 50) return 'fair'
  if (healthScore >= 25) return 'poor'
  return 'critical'
}

/**
 * Create a project snapshot for versioning
 */
export function createProjectSnapshot(
  project: Project,
  name: string,
  type: ProjectSnapshot['type'] = 'manual',
  userId: UUID,
  description?: string
): ProjectSnapshot {
  return {
    id: generateUUID(),
    projectId: project.id,
    name,
    description,
    projectState: { ...project },
    createdAt: createTimestamp(),
    createdBy: userId,
    size: JSON.stringify(project).length,
    type,
    canDelete: type === 'automatic',
    expiresAt: type === 'automatic' ? 
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : // 30 days
      undefined
  }
}

/**
 * Type guard to check if a value is a valid Project
 */
export function isProject(value: any): value is Project {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.currentPhase === 'string' &&
    typeof value.status === 'string' &&
    typeof value.createdAt === 'string' &&
    Array.isArray(value.phases) &&
    Array.isArray(value.milestones) &&
    Array.isArray(value.artifacts) &&
    Array.isArray(value.collaborators) &&
    Array.isArray(value.deployments) &&
    Array.isArray(value.integrations)
  )
}

/**
 * Project creation error class
 */
export class ProjectCreationError extends ReadyAIError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'PROJECT_CREATION_ERROR', 400, details)
    this.name = 'ProjectCreationError'
  }
}

/**
 * Project validation error class
 */
export class ProjectValidationError extends ReadyAIError {
  constructor(message: string, validationResults: ValidationResult[]) {
    super(message, 'PROJECT_VALIDATION_ERROR', 422, { validationResults })
    this.name = 'ProjectValidationError'
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  createProject,
  validateProject,
  calculateProjectHealth,
  createProjectSnapshot,
  isProject,
  ProjectCreationError,
  ProjectValidationError
}
