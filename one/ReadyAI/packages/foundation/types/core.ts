/**
 * Core foundational types for ReadyAI Personal AI Development Orchestrator
 * 
 * This module combines proven patterns from Cline's production codebase with ReadyAI's
 * specific requirements, providing a single source of truth for all shared data shapes
 * and ensuring perfect consistency across all ReadyAI components.
 * 
 * Adapted from Cline's src/shared/api.ts with ReadyAI-specific extensions
 */

// =============================================================================
// FOUNDATIONAL TYPES (ReadyAI Core Contracts)
// =============================================================================

/**
 * UUID type for unique identifiers across the ReadyAI system
 * Ensures consistency and type safety for all entity identification
 */
export type UUID = string

/**
 * Generic API response wrapper for successful responses
 * Adapted from Cline's response patterns with ReadyAI metadata requirements
 */
export interface ApiResponse<T> {
  /** Success indicator - always true for successful responses */
  success: true
  /** Response data payload */
  data: T
  /** Optional metadata for request tracking and debugging */
  metadata?: {
    /** ISO 8601 timestamp of response generation */
    timestamp: string
    /** Unique identifier for request correlation */
    requestId: string
    /** Optional performance metrics */
    metrics?: {
      /** Request processing time in milliseconds */
      processingTime: number
      /** Token usage if applicable */
      tokenUsage?: {
        input: number
        output: number
        total: number
      }
    }
  }
}

/**
 * Standardized API error response with enhanced error details
 * Incorporates Cline's comprehensive error handling patterns
 */
export interface ApiErrorResponse {
  /** Failure indicator - always false for error responses */
  success: false
  /** Error details */
  error: {
    /** Human-readable error message */
    message: string
    /** Optional error code for programmatic handling */
    code?: string
    /** Optional HTTP status code */
    statusCode?: number
    /** Optional additional error details */
    details?: Record<string, any>
    /** Optional stack trace for debugging (development only) */
    stack?: string
    /** Optional retry information */
    retryable?: boolean
    /** Optional suggested retry delay in milliseconds */
    retryAfter?: number
  }
}

/**
 * Union type for all API responses - ensures exhaustive handling
 * Follows Cline's pattern of discriminated unions for type safety
 */
export type ApiResult<T> = ApiResponse<T> | ApiErrorResponse

// =============================================================================
// DEVELOPMENT PHASES (7-Phase Methodology)
// =============================================================================

/**
 * Development phases in ReadyAI's 7-phase methodology
 * Each phase represents a distinct stage in the AI-powered development process
 */
export type PhaseType =
  | 'Phase0_StrategicCharter'
  | 'Phase1_ArchitecturalBlueprint'
  | 'Phase20_CoreContracts'
  | 'Phase21_ModuleSpec'
  | 'Phase23_ModuleSpecSubsequent'
  | 'Phase30_ProjectScaffolding'
  | 'Phase301_MasterPlan'
  | 'Phase31_FileGeneration'
  | 'Phase4_ValidationCorrection'
  | 'Phase5_TestGeneration'
  | 'Phase6_Documentation'
  | 'Phase7_Iteration'

/**
 * Status of a development phase with enhanced state tracking
 * Incorporates Cline's task state management patterns
 */
export type PhaseStatus = 'pending' | 'in_progress' | 'completed' | 'validated' | 'failed' | 'skipped'

// =============================================================================
// AI PROVIDER SYSTEM (Multi-Provider Architecture)
// =============================================================================

/**
 * AI provider types supported by ReadyAI
 * Extensible to support additional providers as needed
 */
export type AIProviderType = 'claude-sonnet-4' | 'claude-3.5-sonnet' | 'gpt-4' | 'gpt-5' | 'openrouter'

/**
 * Enhanced AI provider configuration with Cline's proven patterns
 */
export interface AIProviderConfig {
  /** Provider type identifier */
  provider: AIProviderType
  /** API configuration */
  apiKey: string
  /** Optional base URL for custom endpoints */
  baseUrl?: string
  /** Model-specific identifier */
  modelId: string
  /** Maximum tokens for requests */
  maxTokens?: number
  /** Context window size */
  contextWindow?: number
  /** Temperature setting for generation */
  temperature?: number
  /** Extended thinking mode (for supported models) */
  extendedThinking?: boolean
  /** Rate limiting configuration */
  rateLimiting?: {
    requestsPerMinute: number
    tokensPerMinute: number
  }
}

// =============================================================================
// CONTEXT MANAGEMENT SYSTEM
// =============================================================================

/**
 * Context node types for semantic organization
 * Enables intelligent context retrieval and management
 */
export type ContextType = 'file' | 'module' | 'dependency' | 'pattern' | 'artifact' | 'conversation'

/**
 * Context node for semantic project understanding
 * Enhanced with Cline's context tracking capabilities
 */
export interface ContextNode {
  /** Unique context identifier */
  id: UUID
  /** Project this context belongs to */
  projectId: UUID
  /** Type of context element */
  type: ContextType
  /** File path or identifier */
  path: string
  /** Content or summary */
  content: string
  /** Vector embedding for semantic search */
  vectorEmbedding: number[]
  /** Dependencies this context relies on */
  dependencies: UUID[]
  /** Contexts that depend on this one */
  dependents: UUID[]
  /** Relevance score for retrieval (0-1) */
  relevanceScore: number
  /** Last access timestamp */
  lastAccessed: string
  /** Metadata for additional context */
  metadata: Record<string, any>
  /** Content hash for change detection */
  contentHash: string
  /** Size in tokens for context window management */
  tokenCount: number
}

// =============================================================================
// PROJECT MANAGEMENT
// =============================================================================

/**
 * Technology stack configuration with comprehensive coverage
 */
export interface TechStack {
  /** Frontend framework */
  frontend?: string
  /** Backend framework */
  backend?: string
  /** Database technology */
  database?: string
  /** Programming languages */
  languages: string[]
  /** Additional tools and libraries */
  tools: string[]
  /** Package managers */
  packageManagers?: string[]
  /** Testing frameworks */
  testingFrameworks?: string[]
}

/**
 * Project-specific configuration with quality preferences
 */
export interface ProjectConfig {
  /** Code quality preferences */
  quality: {
    /** Target test coverage percentage (0-100) */
    testCoverage: number
    /** Linting strictness level */
    lintingLevel: 'basic' | 'standard' | 'strict'
    /** Type checking strictness */
    typeChecking: 'loose' | 'standard' | 'strict'
  }
  /** AI generation preferences */
  aiSettings: {
    /** Preferred AI provider */
    preferredProvider: AIProviderType
    /** Enable extended thinking mode */
    extendedThinking: boolean
    /** Context compression level */
    contextCompression: 'minimal' | 'standard' | 'aggressive'
  }
  /** Development preferences */
  development?: {
    /** Auto-save enabled */
    autoSave: boolean
    /** Git integration enabled */
    gitIntegration: boolean
    /** Checkpoint frequency */
    checkpointFrequency: 'low' | 'medium' | 'high'
  }
}

/**
 * Core project entity representing a software development project
 * Enhanced with Cline's project state management patterns
 */
export interface Project {
  /** Unique project identifier */
  id: UUID
  /** Project name */
  name: string
  /** Detailed project description */
  description?: string
  /** Current development phase */
  currentPhase: PhaseType
  /** Root file system path */
  rootPath: string
  /** Technology stack configuration */
  techStack: TechStack
  /** Project creation timestamp (ISO 8601 format) */
  createdAt: string
  /** Last modification timestamp (ISO 8601 format) */
  lastModified: string
  /** Project configuration */
  config: ProjectConfig
  /** Project status */
  status: 'active' | 'paused' | 'completed' | 'archived'
  /** Project tags for organization */
  tags?: string[]
  /** Project size metrics */
  metrics?: {
    totalFiles: number
    totalLines: number
    totalTokens: number
  }
}

// =============================================================================
// PHASE AND ARTIFACT MANAGEMENT
// =============================================================================

/**
 * Development phase instance with comprehensive tracking
 */
export interface Phase {
  /** Phase type identifier */
  id: PhaseType
  /** Current status of phase */
  status: PhaseStatus
  /** Generated artifacts for this phase */
  artifacts: PhaseArtifact[]
  /** Dependencies on other phases */
  dependencies: PhaseType[]
  /** Phase completion timestamp (ISO 8601 format) */
  completedAt?: string
  /** Validation results */
  validationResults?: ValidationResult[]
  /** Phase duration in milliseconds */
  duration?: number
  /** AI provider used for this phase */
  aiProvider?: AIProviderType
  /** Token usage for this phase */
  tokenUsage?: {
    input: number
    output: number
    total: number
  }
}

/**
 * Artifact generated during a phase with comprehensive metadata
 */
export interface PhaseArtifact {
  /** Unique artifact identifier */
  id: UUID
  /** Artifact filename */
  filename: string
  /** File path relative to project root */
  path: string
  /** Artifact content */
  content: string
  /** Content hash for change detection */
  contentHash: string
  /** Generation timestamp (ISO 8601 format) */
  generatedAt: string
  /** Size in bytes */
  size: number
  /** MIME type */
  mimeType: string
  /** Generation metadata */
  metadata?: {
    generator: 'ai' | 'template' | 'user'
    confidence?: number
    reviewStatus?: 'pending' | 'approved' | 'rejected'
  }
}

// =============================================================================
// DEPENDENCY MANAGEMENT
// =============================================================================

/**
 * Node in the dependency graph with complexity estimation
 */
export interface DependencyNode {
  /** Node identifier */
  id: UUID
  /** File path */
  path: string
  /** Dependencies of this node */
  dependencies: UUID[]
  /** Estimated generation complexity (1-10) */
  complexity: number
  /** Node type */
  type: 'file' | 'module' | 'component' | 'service' | 'utility'
  /** Generation priority (1-10, higher = more important) */
  priority: number
  /** Size estimate in lines of code */
  estimatedSize: number
}

/**
 * Edge in the dependency graph with relationship type
 */
export interface DependencyEdge {
  /** Source node */
  from: UUID
  /** Target node */
  to: UUID
  /** Dependency type */
  type: 'import' | 'extends' | 'implements' | 'uses' | 'references'
  /** Strength of dependency (0-1) */
  strength: number
}

/**
 * Complete dependency graph for a project with analysis results
 */
export interface DependencyGraph {
  /** All nodes in the graph */
  nodes: Map<string, DependencyNode>
  /** All edges in the graph */
  edges: DependencyEdge[]
  /** Optimal generation order */
  generationOrder: string[]
  /** Detected circular dependencies */
  circularDependencies: string[][]
  /** Graph analysis metadata */
  analysis: {
    totalNodes: number
    totalEdges: number
    averageComplexity: number
    criticalPath: string[]
    estimatedDuration: number
  }
}

// =============================================================================
// AI GENERATION SYSTEM
// =============================================================================

/**
 * AI code generation request with comprehensive context
 */
export interface GenerationRequest {
  /** Unique request identifier */
  id: UUID
  /** Associated project */
  projectId: UUID
  /** Target file to generate */
  targetFile: string
  /** Current phase */
  phase: PhaseType
  /** Context package for AI */
  contextPackage: ContextPackage
  /** AI provider to use */
  aiProvider: AIProviderType
  /** Enable extended thinking mode */
  extendedThinking: boolean
  /** Request status */
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  /** Generation result */
  result?: GenerationResult
  /** Request timestamp (ISO 8601 format) */
  createdAt: string
  /** Processing started timestamp */
  startedAt?: string
  /** Processing completed timestamp */
  completedAt?: string
  /** Request priority (1-10) */
  priority: number
  /** Retry count */
  retryCount: number
  /** Maximum retry attempts */
  maxRetries: number
}

/**
 * Context package sent to AI for generation with optimized structure
 */
export interface ContextPackage {
  /** Relevant context nodes */
  contextNodes: ContextNode[]
  /** Dependency information */
  dependencyGraph: DependencyGraph
  /** Phase-specific context */
  phaseContext: Record<string, any>
  /** Total token count estimate */
  estimatedTokens: number
  /** Context compression applied */
  compressionLevel: 'none' | 'minimal' | 'standard' | 'aggressive'
  /** Context selection strategy */
  selectionStrategy: {
    algorithm: 'relevance' | 'dependency' | 'hybrid'
    maxNodes: number
    relevanceThreshold: number
  }
}

/**
 * Result of AI generation with comprehensive feedback
 */
export interface GenerationResult {
  /** Generated content */
  content: string
  /** Confidence score (0-1) */
  confidence: number
  /** Any issues or warnings */
  issues: string[]
  /** Token usage */
  tokenUsage: {
    input: number
    output: number
    total: number
    cached?: number
  }
  /** Generation timestamp (ISO 8601 format) */
  generatedAt: string
  /** Model used for generation */
  modelUsed: string
  /** Generation metadata */
  metadata?: {
    thinkingTime?: number
    cacheHitRate?: number
    contextUtilization?: number
  }
}

// =============================================================================
// VALIDATION AND QUALITY ASSURANCE
// =============================================================================

/**
 * Validation result for code or artifacts with detailed feedback
 */
export interface ValidationResult {
  /** Validation identifier */
  id: UUID
  /** Validation type */
  type: 'syntax' | 'type' | 'lint' | 'test' | 'dependency' | 'security'
  /** Validation passed */
  passed: boolean
  /** Error messages */
  errors: string[]
  /** Warning messages */
  warnings: string[]
  /** Suggestions for improvement */
  suggestions: string[]
  /** Validation score (0-100) */
  score: number
  /** Validation timestamp */
  validatedAt: string
  /** Validator used */
  validator: string
  /** Fix suggestions */
  fixes?: Array<{
    description: string
    automated: boolean
    confidence: number
  }>
}

/**
 * Quality metrics for project monitoring with trend analysis
 */
export interface QualityMetrics {
  /** Project identifier */
  projectId: UUID
  /** Architectural consistency score (0-100) */
  architecturalConsistency: number
  /** Test coverage percentage (0-100) */
  testCoverage: number
  /** Dependency health score (0-100) */
  dependencyHealth: number
  /** Context efficiency score (0-100) */
  contextEfficiency: number
  /** Last calculation timestamp (ISO 8601 format) */
  lastCalculated: string
  /** Historical trends */
  trends?: {
    timeframe: '1d' | '7d' | '30d'
    data: Array<{
      timestamp: string
      metrics: Omit<QualityMetrics, 'projectId' | 'lastCalculated' | 'trends'>
    }>
  }
}

// =============================================================================
// PAGINATION AND COLLECTION MANAGEMENT
// =============================================================================

/**
 * Paginated response wrapper with comprehensive pagination info
 */
export interface PaginatedResponse<T> {
  /** Array of items for current page */
  items: T[]
  /** Total number of items */
  total: number
  /** Current page number (1-based) */
  page: number
  /** Items per page */
  pageSize: number
  /** Total number of pages */
  totalPages: number
  /** Has next page */
  hasNext: boolean
  /** Has previous page */
  hasPrevious: boolean
  /** Pagination metadata */
  metadata?: {
    /** Sort criteria applied */
    sortBy?: string
    /** Sort direction */
    sortOrder?: 'asc' | 'desc'
    /** Filters applied */
    filters?: Record<string, any>
    /** Query execution time */
    queryTime?: number
  }
}

// =============================================================================
// ERROR HANDLING AND VALIDATION
// =============================================================================

/**
 * Validation error details with field-specific information
 */
export interface ValidationError {
  /** Field name that failed validation */
  field: string
  /** Validation error message */
  message: string
  /** Invalid value */
  value?: any
  /** Error code for programmatic handling */
  code?: string
  /** Suggested fix */
  suggestion?: string
}

/**
 * Enhanced error class with Cline's proven error patterns
 */
export class ReadyAIError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number,
    public details?: Record<string, any>,
    public retryable = false,
    public retryAfter?: number
  ) {
    super(message)
    this.name = 'ReadyAIError'
  }

  /**
   * Convert to API error response format
   */
  toApiErrorResponse(): ApiErrorResponse {
    return {
      success: false,
      error: {
        message: this.message,
        code: this.code,
        statusCode: this.statusCode,
        details: this.details,
        retryable: this.retryable,
        retryAfter: this.retryAfter,
        // Only include stack in development
        ...(process.env.NODE_ENV === 'development' && { stack: this.stack })
      }
    }
  }
}

// =============================================================================
// UTILITY TYPES AND HELPERS
// =============================================================================

/**
 * Type guard to check if a response is successful
 */
export function isApiSuccess<T>(response: ApiResult<T>): response is ApiResponse<T> {
  return response.success === true
}

/**
 * Type guard to check if a response is an error
 */
export function isApiError<T>(response: ApiResult<T>): response is ApiErrorResponse {
  return response.success === false
}

/**
 * Helper to create successful API response
 */
export function createApiResponse<T>(
  data: T,
  metadata?: ApiResponse<T>['metadata']
): ApiResponse<T> {
  return {
    success: true,
    data,
    metadata: {
      timestamp: new Date().toISOString(),
      requestId: crypto.randomUUID(),
      ...metadata
    }
  }
}

/**
 * Helper to create error API response
 */
export function createApiError(
  message: string,
  code?: string,
  statusCode?: number,
  details?: Record<string, any>
): ApiErrorResponse {
  return {
    success: false,
    error: {
      message,
      code,
      statusCode,
      details
    }
  }
}

/**
 * Async result type for operations that may fail
 * Incorporates Cline's error handling patterns
 */
export type AsyncResult<T, E = ReadyAIError> = Promise<
  | { success: true; data: T }
  | { success: false; error: E }
>

/**
 * Helper to wrap async operations with error handling
 */
export async function wrapAsync<T>(
  operation: () => Promise<T>
): Promise<AsyncResult<T>> {
  try {
    const data = await operation()
    return { success: true, data }
  } catch (error) {
    const readyAIError = error instanceof ReadyAIError 
      ? error 
      : new ReadyAIError(
          error instanceof Error ? error.message : 'Unknown error',
          'UNKNOWN_ERROR',
          500,
          { originalError: error }
        )
    return { success: false, error: readyAIError }
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export * from './streaming'
export * from './configuration'

/**
 * Version information for the core types module
 */
export const CORE_TYPES_VERSION = '1.0.0'

/**
 * Supported API versions
 */
export const SUPPORTED_API_VERSIONS = ['v1'] as const
export type ApiVersion = typeof SUPPORTED_API_VERSIONS[number]
