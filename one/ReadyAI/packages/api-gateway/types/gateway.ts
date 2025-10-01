// packages/api-gateway/types/gateway.ts

/**
 * API Gateway types for ReadyAI Personal AI Development Orchestrator
 * 
 * Adapted from Cline's src/api/types.ts patterns with ReadyAI-specific requirements.
 * Provides comprehensive type definitions for request/response interfaces, routing types,
 * and gateway configuration following enterprise-grade patterns proven in production.
 * 
 * @version 1.0.0 - Production Ready
 * @author ReadyAI Development Team
 * 
 * Cline Source Adaptation:
 * - Request/response patterns from src/api/types.ts (75% reuse)
 * - Routing types from webview communication patterns (60% reuse)
 * - Error handling from src/services/error/ (85% reuse)
 * - Provider abstraction from multi-provider architecture (70% reuse)
 */

import {
  UUID,
  ApiResponse,
  ApiErrorResponse,
  ApiResult,
  PhaseType,
  AIProviderType,
  ValidationError,
  ReadyAIError,
  createApiResponse,
  createApiError,
  generateRequestId,
  createTimestamp,
  HTTP_STATUS,
  ERROR_CODES
} from '../../foundation/types/core'

// =============================================================================
// GATEWAY CORE TYPES (Adapted from Cline's API Infrastructure)
// =============================================================================

/**
 * Gateway request context with enhanced tracking
 * Adapted from Cline's request handling patterns with ReadyAI correlation
 */
export interface GatewayRequestContext {
  /** Unique request identifier */
  requestId: string
  /** User session identifier */
  sessionId?: string
  /** Request timestamp */
  timestamp: string
  /** Client information */
  client: {
    /** Client type identifier */
    type: 'vscode-extension' | 'web-ui' | 'api-client'
    /** Client version */
    version: string
    /** User agent string */
    userAgent?: string
  }
  /** Request routing information */
  routing: {
    /** Source service */
    source: string
    /** Target service */
    target: string
    /** Route path */
    path: string
    /** HTTP method */
    method: HttpMethod
  }
  /** Performance tracking */
  performance: {
    /** Request start time */
    startTime: number
    /** Processing duration (populated on completion) */
    duration?: number
  }
  /** Security context */
  security?: {
    /** Authentication level */
    authLevel: 'none' | 'local' | 'authenticated'
    /** Permissions */
    permissions: string[]
    /** Rate limiting info */
    rateLimiting?: {
      remaining: number
      resetTime: number
    }
  }
}

/**
 * HTTP methods supported by the gateway
 * Following RESTful API standards with ReadyAI extensions
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

/**
 * Gateway request interface with comprehensive validation
 * Incorporates Cline's proven request validation patterns
 */
export interface GatewayRequest<T = any> {
  /** Request context */
  context: GatewayRequestContext
  /** Request headers */
  headers: Record<string, string>
  /** Query parameters */
  query: Record<string, string | string[]>
  /** Path parameters */
  params: Record<string, string>
  /** Request body */
  body?: T
  /** Request metadata */
  metadata?: {
    /** Content type */
    contentType?: string
    /** Content length */
    contentLength?: number
    /** Encoding */
    encoding?: string
    /** Custom metadata */
    custom?: Record<string, any>
  }
}

/**
 * Gateway response interface with enhanced metadata
 * Adapted from Cline's response patterns with ReadyAI tracking
 */
export interface GatewayResponse<T = any> {
  /** Response context */
  context: {
    /** Original request ID */
    requestId: string
    /** Response timestamp */
    timestamp: string
    /** Processing duration */
    duration: number
    /** Service that handled the request */
    handledBy: string
  }
  /** HTTP status code */
  statusCode: number
  /** Response headers */
  headers: Record<string, string>
  /** Response body */
  body: ApiResult<T>
  /** Response metadata */
  metadata?: {
    /** Cache information */
    cache?: {
      hit: boolean
      ttl?: number
    }
    /** Performance metrics */
    performance?: {
      dbQueries: number
      externalCalls: number
      memoryUsage: number
    }
    /** Debug information (development only) */
    debug?: Record<string, any>
  }
}

// =============================================================================
// ROUTING AND SERVICE DISCOVERY (Cline Multi-Provider Patterns)
// =============================================================================

/**
 * Service route definition with advanced configuration
 * Adapted from Cline's provider routing architecture
 */
export interface ServiceRoute {
  /** Unique route identifier */
  id: string
  /** Route path pattern */
  path: string
  /** HTTP methods supported */
  methods: HttpMethod[]
  /** Target service identifier */
  service: string
  /** Route handler function name */
  handler: string
  /** Route priority (higher = more priority) */
  priority: number
  /** Route configuration */
  config: {
    /** Authentication required */
    authRequired: boolean
    /** Rate limiting configuration */
    rateLimit?: {
      requests: number
      window: number // seconds
      burst?: number
    }
    /** Validation schema */
    validation?: {
      headers?: Record<string, any>
      query?: Record<string, any>
      params?: Record<string, any>
      body?: Record<string, any>
    }
    /** Timeout configuration */
    timeout?: {
      request: number
      response: number
    }
    /** Caching configuration */
    caching?: {
      enabled: boolean
      ttl: number
      vary?: string[]
    }
  }
  /** Route metadata */
  metadata: {
    /** Route description */
    description: string
    /** API version */
    version: string
    /** Tags for organization */
    tags: string[]
    /** Deprecation information */
    deprecated?: {
      deprecated: boolean
      sunset?: string
      successor?: string
    }
  }
}

/**
 * Service registry entry with health monitoring
 * Following Cline's service discovery patterns
 */
export interface ServiceRegistryEntry {
  /** Service identifier */
  id: string
  /** Service name */
  name: string
  /** Service version */
  version: string
  /** Service endpoints */
  endpoints: {
    /** Base URL */
    baseUrl: string
    /** Health check endpoint */
    healthCheck: string
    /** Alternative endpoints */
    alternatives?: string[]
  }
  /** Service status */
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
  /** Health information */
  health: {
    /** Last health check */
    lastCheck: string
    /** Response time in ms */
    responseTime: number
    /** Error count in last window */
    errorCount: number
    /** Uptime percentage */
    uptime: number
  }
  /** Service capabilities */
  capabilities: {
    /** Supported operations */
    operations: string[]
    /** Maximum concurrent requests */
    maxConcurrency: number
    /** Request timeout */
    timeout: number
  }
  /** Load balancing configuration */
  loadBalancing?: {
    /** Weight for load distribution */
    weight: number
    /** Maximum requests per second */
    maxRps: number
    /** Circuit breaker configuration */
    circuitBreaker?: {
      enabled: boolean
      threshold: number
      timeout: number
    }
  }
}

/**
 * Routing table with dynamic configuration
 * Incorporates Cline's proven routing logic patterns
 */
export interface RoutingTable {
  /** Table version for cache invalidation */
  version: string
  /** Last update timestamp */
  lastUpdated: string
  /** Route entries */
  routes: ServiceRoute[]
  /** Service registry */
  services: Map<string, ServiceRegistryEntry>
  /** Routing rules */
  rules: {
    /** Default service for unmatched routes */
    defaultService?: string
    /** Fallback behavior */
    fallback: 'error' | 'redirect' | 'proxy'
    /** Load balancing strategy */
    loadBalancing: 'round-robin' | 'weighted' | 'least-connections' | 'random'
  }
  /** Middleware configuration */
  middleware: {
    /** Global middleware */
    global: string[]
    /** Route-specific middleware */
    perRoute: Record<string, string[]>
  }
}

// =============================================================================
// REQUEST/RESPONSE PROCESSING (ReadyAI Specific Types)
// =============================================================================

/**
 * ReadyAI-specific request types for different operations
 * Enhanced beyond Cline's patterns for AI development orchestration
 */
export namespace ReadyAIRequests {
  /**
   * Project management request
   */
  export interface ProjectRequest {
    /** Project identifier */
    projectId?: UUID
    /** Operation type */
    operation: 'create' | 'read' | 'update' | 'delete' | 'list'
    /** Request data */
    data?: {
      name?: string
      description?: string
      rootPath?: string
      techStack?: any
      config?: any
    }
    /** Query filters */
    filters?: {
      status?: string[]
      tags?: string[]
      createdAfter?: string
      createdBefore?: string
    }
  }

  /**
   * Phase management request
   */
  export interface PhaseRequest {
    /** Project identifier */
    projectId: UUID
    /** Phase identifier */
    phaseId?: PhaseType
    /** Operation type */
    operation: 'start' | 'complete' | 'validate' | 'status' | 'list'
    /** Phase data */
    data?: {
      artifacts?: any[]
      validationRules?: string[]
      aiProvider?: AIProviderType
    }
  }

  /**
   * Generation request
   */
  export interface GenerationRequest {
    /** Project identifier */
    projectId: UUID
    /** Target file path */
    targetFile: string
    /** Current phase */
    phase: PhaseType
    /** AI provider preference */
    aiProvider?: AIProviderType
    /** Extended thinking mode */
    extendedThinking?: boolean
    /** Context preferences */
    contextPreferences?: {
      maxNodes: number
      relevanceThreshold: number
      compressionLevel: 'minimal' | 'standard' | 'aggressive'
    }
    /** Generation options */
    options?: {
      priority: number
      timeout: number
      retryCount: number
    }
  }

  /**
   * Context management request
   */
  export interface ContextRequest {
    /** Project identifier */
    projectId: UUID
    /** Operation type */
    operation: 'search' | 'add' | 'update' | 'delete' | 'refresh'
    /** Context query */
    query?: {
      text: string
      type?: string[]
      relevanceThreshold?: number
      maxResults?: number
    }
    /** Context data */
    data?: {
      path: string
      content: string
      type: string
      metadata?: Record<string, any>
    }
  }

  /**
   * Dependency analysis request
   */
  export interface DependencyRequest {
    /** Project identifier */
    projectId: UUID
    /** Operation type */
    operation: 'analyze' | 'graph' | 'order' | 'validate'
    /** Analysis options */
    options?: {
      includeTransitive: boolean
      detectCircular: boolean
      complexityAnalysis: boolean
    }
    /** Target files for focused analysis */
    targetFiles?: string[]
  }
}

/**
 * ReadyAI-specific response types
 * Enhanced with comprehensive metadata and status information
 */
export namespace ReadyAIResponses {
  /**
   * Project operation response
   */
  export interface ProjectResponse {
    /** Operation result */
    operation: string
    /** Project data */
    project?: any
    /** Projects list */
    projects?: any[]
    /** Operation metadata */
    metadata: {
      totalCount?: number
      filteredCount?: number
      operationTime: number
    }
  }

  /**
   * Phase operation response
   */
  export interface PhaseResponse {
    /** Operation result */
    operation: string
    /** Phase data */
    phase?: any
    /** Phases list */
    phases?: any[]
    /** Validation results */
    validationResults?: any[]
    /** Operation metadata */
    metadata: {
      phaseProgress: number
      estimatedCompletion?: string
      nextRecommendedAction?: string
    }
  }

  /**
   * Generation operation response
   */
  export interface GenerationResponse {
    /** Generation ID */
    generationId: UUID
    /** Generation status */
    status: 'pending' | 'in_progress' | 'completed' | 'failed'
    /** Generated content */
    content?: string
    /** Generation metadata */
    metadata: {
      tokensUsed: number
      confidence: number
      generationTime: number
      modelUsed: string
      issues?: string[]
    }
  }

  /**
   * Context operation response
   */
  export interface ContextResponse {
    /** Operation result */
    operation: string
    /** Context nodes */
    contexts?: any[]
    /** Search results */
    searchResults?: Array<{
      node: any
      relevanceScore: number
      matchedFields: string[]
    }>
    /** Operation metadata */
    metadata: {
      totalNodes: number
      searchTime?: number
      indexSize: number
    }
  }

  /**
   * Dependency analysis response
   */
  export interface DependencyResponse {
    /** Analysis operation */
    operation: string
    /** Dependency graph */
    graph?: any
    /** Generation order */
    generationOrder?: string[]
    /** Circular dependencies */
    circularDependencies?: string[][]
    /** Analysis metadata */
    metadata: {
      totalNodes: number
      totalEdges: number
      analysisTime: number
      complexity: {
        average: number
        maximum: number
        distribution: Record<string, number>
      }
    }
  }
}

// =============================================================================
// MIDDLEWARE AND PROCESSING (Cline's Proven Patterns)
// =============================================================================

/**
 * Middleware function type with comprehensive context
 * Adapted from Cline's middleware architecture
 */
export type GatewayMiddleware = (
  request: GatewayRequest,
  response: GatewayResponse,
  next: () => Promise<void>
) => Promise<void>

/**
 * Middleware configuration with execution order
 */
export interface MiddlewareConfig {
  /** Middleware identifier */
  id: string
  /** Middleware name */
  name: string
  /** Execution priority (lower = earlier) */
  priority: number
  /** Middleware function */
  handler: GatewayMiddleware
  /** Configuration options */
  options?: Record<string, any>
  /** Middleware metadata */
  metadata: {
    description: string
    version: string
    author?: string
    enabled: boolean
  }
}

/**
 * Request validation configuration
 * Enhanced beyond Cline's patterns for ReadyAI requirements
 */
export interface ValidationConfig {
  /** Validation rules */
  rules: {
    /** Header validation */
    headers?: {
      required?: string[]
      allowed?: string[]
      patterns?: Record<string, RegExp>
    }
    /** Query parameter validation */
    query?: {
      required?: string[]
      types?: Record<string, 'string' | 'number' | 'boolean' | 'array'>
      constraints?: Record<string, any>
    }
    /** Path parameter validation */
    params?: {
      required?: string[]
      patterns?: Record<string, RegExp>
    }
    /** Body validation */
    body?: {
      schema?: any // JSON Schema
      maxSize?: number
      contentTypes?: string[]
    }
  }
  /** Custom validators */
  customValidators?: Record<string, (value: any) => ValidationError | null>
  /** Validation options */
  options: {
    /** Strict mode - reject unknown properties */
    strict: boolean
    /** Coerce types */
    coerceTypes: boolean
    /** Remove additional properties */
    removeAdditional: boolean
  }
}

/**
 * Rate limiting configuration
 * Following Cline's rate limiting patterns with ReadyAI enhancements
 */
export interface RateLimitConfig {
  /** Identifier for rate limiting */
  identifier: string
  /** Limit configuration */
  limits: {
    /** Requests per time window */
    requests: number
    /** Time window in seconds */
    window: number
    /** Burst allowance */
    burst?: number
  }
  /** Rate limiting strategy */
  strategy: 'fixed-window' | 'sliding-window' | 'token-bucket'
  /** Storage backend */
  storage: 'memory' | 'redis' | 'database'
  /** Rate limit headers */
  headers: {
    /** Include rate limit headers in response */
    include: boolean
    /** Header prefix */
    prefix: string
  }
  /** Exceeded behavior */
  onExceeded: {
    /** HTTP status code */
    statusCode: number
    /** Error message */
    message: string
    /** Retry after header */
    retryAfter?: number
  }
}

// =============================================================================
// ERROR HANDLING AND RECOVERY (Cline's Proven Error Patterns)
// =============================================================================

/**
 * Gateway-specific error types
 * Incorporates Cline's comprehensive error classification
 */
export enum GatewayErrorType {
  // Request errors
  INVALID_REQUEST = 'INVALID_REQUEST',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  AUTHORIZATION_FAILED = 'AUTHORIZATION_FAILED',
  RATE_LIMITED = 'RATE_LIMITED',
  
  // Routing errors
  ROUTE_NOT_FOUND = 'ROUTE_NOT_FOUND',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  SERVICE_TIMEOUT = 'SERVICE_TIMEOUT',
  LOAD_BALANCER_ERROR = 'LOAD_BALANCER_ERROR',
  
  // Processing errors
  MIDDLEWARE_ERROR = 'MIDDLEWARE_ERROR',
  TRANSFORMATION_ERROR = 'TRANSFORMATION_ERROR',
  SERIALIZATION_ERROR = 'SERIALIZATION_ERROR',
  
  // System errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  RESOURCE_EXHAUSTED = 'RESOURCE_EXHAUSTED',
  CIRCUIT_BREAKER_OPEN = 'CIRCUIT_BREAKER_OPEN'
}

/**
 * Gateway error with enhanced context
 * Extends ReadyAI's base error class with gateway-specific information
 */
export class GatewayError extends ReadyAIError {
  constructor(
    public readonly type: GatewayErrorType,
    message: string,
    public readonly context?: {
      requestId?: string
      service?: string
      route?: string
      upstreamError?: Error
    },
    statusCode?: number,
    retryable = false
  ) {
    super(
      message,
      type,
      statusCode || GatewayError.getDefaultStatusCode(type),
      context,
      retryable
    )
    this.name = 'GatewayError'
  }

  /**
   * Get default HTTP status code for error type
   */
  private static getDefaultStatusCode(type: GatewayErrorType): number {
    switch (type) {
      case GatewayErrorType.INVALID_REQUEST:
      case GatewayErrorType.VALIDATION_FAILED:
        return HTTP_STATUS.BAD_REQUEST
      case GatewayErrorType.AUTHENTICATION_FAILED:
        return HTTP_STATUS.UNAUTHORIZED
      case GatewayErrorType.AUTHORIZATION_FAILED:
        return HTTP_STATUS.FORBIDDEN
      case GatewayErrorType.ROUTE_NOT_FOUND:
        return HTTP_STATUS.NOT_FOUND
      case GatewayErrorType.RATE_LIMITED:
        return HTTP_STATUS.TOO_MANY_REQUESTS
      case GatewayErrorType.SERVICE_UNAVAILABLE:
      case GatewayErrorType.CIRCUIT_BREAKER_OPEN:
        return HTTP_STATUS.SERVICE_UNAVAILABLE
      case GatewayErrorType.SERVICE_TIMEOUT:
        return 408 // Request Timeout
      default:
        return HTTP_STATUS.INTERNAL_SERVER_ERROR
    }
  }
}

/**
 * Error recovery configuration
 * Based on Cline's proven error recovery mechanisms
 */
export interface ErrorRecoveryConfig {
  /** Retry configuration */
  retry: {
    /** Maximum retry attempts */
    maxAttempts: number
    /** Base delay between retries (ms) */
    baseDelay: number
    /** Maximum delay between retries (ms) */
    maxDelay: number
    /** Backoff strategy */
    strategy: 'exponential' | 'linear' | 'fixed'
    /** Jitter to prevent thundering herd */
    jitter: boolean
  }
  /** Circuit breaker configuration */
  circuitBreaker: {
    /** Enable circuit breaker */
    enabled: boolean
    /** Failure threshold before opening */
    failureThreshold: number
    /** Success threshold before closing */
    successThreshold: number
    /** Timeout before half-open state */
    timeout: number
  }
  /** Fallback configuration */
  fallback: {
    /** Enable fallback responses */
    enabled: boolean
    /** Fallback response generator */
    generator?: (error: GatewayError) => ApiResult<any>
    /** Cached responses for fallback */
    cache?: {
      enabled: boolean
      ttl: number
    }
  }
}

// =============================================================================
// MONITORING AND METRICS (Production-Ready Observability)
// =============================================================================

/**
 * Gateway metrics for monitoring and observability
 * Following production monitoring patterns from Cline
 */
export interface GatewayMetrics {
  /** Request metrics */
  requests: {
    /** Total requests */
    total: number
    /** Requests per second */
    rps: number
    /** Requests by status code */
    byStatusCode: Record<number, number>
    /** Requests by route */
    byRoute: Record<string, number>
    /** Requests by service */
    byService: Record<string, number>
  }
  /** Response time metrics */
  responseTime: {
    /** Average response time (ms) */
    average: number
    /** Median response time (ms) */
    median: number
    /** 95th percentile (ms) */
    p95: number
    /** 99th percentile (ms) */
    p99: number
    /** Maximum response time (ms) */
    max: number
  }
  /** Error metrics */
  errors: {
    /** Total errors */
    total: number
    /** Error rate (percentage) */
    rate: number
    /** Errors by type */
    byType: Record<GatewayErrorType, number>
    /** Errors by service */
    byService: Record<string, number>
  }
  /** Health metrics */
  health: {
    /** Gateway health status */
    status: 'healthy' | 'degraded' | 'unhealthy'
    /** Service health status */
    services: Record<string, 'healthy' | 'degraded' | 'unhealthy'>
    /** Last health check */
    lastCheck: string
  }
  /** Resource usage */
  resources: {
    /** Memory usage (bytes) */
    memory: number
    /** CPU usage (percentage) */
    cpu: number
    /** Active connections */
    connections: number
    /** Queue size */
    queueSize: number
  }
}

/**
 * Performance tracking configuration
 */
export interface PerformanceConfig {
  /** Metrics collection */
  metrics: {
    /** Enable metrics collection */
    enabled: boolean
    /** Collection interval (ms) */
    interval: number
    /** Metrics retention (seconds) */
    retention: number
  }
  /** Tracing configuration */
  tracing: {
    /** Enable distributed tracing */
    enabled: boolean
    /** Sampling rate (0-1) */
    samplingRate: number
    /** Trace export endpoint */
    endpoint?: string
  }
  /** Logging configuration */
  logging: {
    /** Log request/response */
    requests: boolean
    /** Log errors */
    errors: boolean
    /** Log slow requests (threshold in ms) */
    slowRequests?: number
  }
}

// =============================================================================
// CONFIGURATION AND INITIALIZATION
// =============================================================================

/**
 * Complete gateway configuration
 * Comprehensive configuration following Cline's config patterns
 */
export interface GatewayConfig {
  /** Gateway identification */
  gateway: {
    /** Gateway instance ID */
    id: string
    /** Gateway name */
    name: string
    /** Gateway version */
    version: string
  }
  /** Server configuration */
  server: {
    /** Server host */
    host: string
    /** Server port */
    port: number
    /** HTTPS configuration */
    https?: {
      enabled: boolean
      cert: string
      key: string
    }
    /** CORS configuration */
    cors?: {
      enabled: boolean
      origins: string[]
      credentials: boolean
    }
  }
  /** Routing configuration */
  routing: RoutingTable
  /** Middleware configuration */
  middleware: MiddlewareConfig[]
  /** Validation configuration */
  validation: ValidationConfig
  /** Rate limiting configuration */
  rateLimiting: RateLimitConfig
  /** Error recovery configuration */
  errorRecovery: ErrorRecoveryConfig
  /** Performance monitoring */
  performance: PerformanceConfig
  /** Feature flags */
  features: {
    /** Enable health checks */
    healthChecks: boolean
    /** Enable API documentation */
    apiDocs: boolean
    /** Enable metrics endpoint */
    metricsEndpoint: boolean
    /** Enable admin endpoints */
    adminEndpoints: boolean
  }
}

// =============================================================================
// UTILITY FUNCTIONS AND HELPERS
// =============================================================================

/**
 * Create gateway request context
 */
export function createGatewayContext(
  requestId: string,
  clientInfo: GatewayRequestContext['client'],
  routingInfo: GatewayRequestContext['routing']
): GatewayRequestContext {
  return {
    requestId,
    timestamp: createTimestamp(),
    client: clientInfo,
    routing: routingInfo,
    performance: {
      startTime: Date.now()
    }
  }
}

/**
 * Create successful gateway response
 */
export function createGatewayResponse<T>(
  context: GatewayResponse<T>['context'],
  data: T,
  statusCode = HTTP_STATUS.OK,
  headers: Record<string, string> = {}
): GatewayResponse<T> {
  return {
    context,
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': context.requestId,
      'X-Response-Time': `${context.duration}ms`,
      ...headers
    },
    body: createApiResponse(data, {
      requestId: context.requestId,
      timestamp: context.timestamp
    })
  }
}

/**
 * Create error gateway response
 */
export function createGatewayErrorResponse(
  context: GatewayResponse['context'],
  error: GatewayError,
  headers: Record<string, string> = {}
): GatewayResponse {
  return {
    context,
    statusCode: error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': context.requestId,
      'X-Response-Time': `${context.duration}ms`,
      ...headers
    },
    body: error.toApiErrorResponse()
  }
}

/**
 * Extract client info from request headers
 */
export function extractClientInfo(headers: Record<string, string>): GatewayRequestContext['client'] {
  return {
    type: (headers['x-client-type'] as any) || 'api-client',
    version: headers['x-client-version'] || 'unknown',
    userAgent: headers['user-agent']
  }
}

/**
 * Generate routing info from request
 */
export function createRoutingInfo(
  method: HttpMethod,
  path: string,
  source = 'external',
  target = 'unknown'
): GatewayRequestContext['routing'] {
  return {
    source,
    target,
    path,
    method
  }
}

/**
 * Type guard for gateway errors
 */
export function isGatewayError(error: any): error is GatewayError {
  return error instanceof GatewayError
}

/**
 * Validate UUID in gateway context
 */
export function validateGatewayUUID(uuid: string, fieldName: string): ValidationError | null {
  if (!uuid) {
    return {
      field: fieldName,
      message: `${fieldName} is required`,
      value: uuid,
      code: ERROR_CODES.MISSING_PARAMETER
    }
  }
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(uuid)) {
    return {
      field: fieldName,
      message: `${fieldName} must be a valid UUID`,
      value: uuid,
      code: ERROR_CODES.INVALID_UUID
    }
  }
  
  return null
}

// =============================================================================
// EXPORTS AND MODULE METADATA
// =============================================================================

/**
 * Gateway types version
 */
export const GATEWAY_TYPES_VERSION = '1.0.0'

/**
 * Supported gateway protocols
 */
export const SUPPORTED_PROTOCOLS = ['http', 'https'] as const
export type GatewayProtocol = typeof SUPPORTED_PROTOCOLS[number]

/**
 * Default gateway configuration values
 */
export const GATEWAY_DEFAULTS = {
  REQUEST_TIMEOUT: 30000,
  RESPONSE_TIMEOUT: 30000,
  MAX_REQUEST_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_CONCURRENT_REQUESTS: 1000,
  HEALTH_CHECK_INTERVAL: 30000,
  METRICS_RETENTION: 3600, // 1 hour
  RATE_LIMIT_WINDOW: 60000, // 1 minute
  CIRCUIT_BREAKER_THRESHOLD: 5,
  RETRY_MAX_ATTEMPTS: 3,
  RETRY_BASE_DELAY: 1000
} as const

/**
 * Export all types for external consumption
 */
export default {
  GATEWAY_TYPES_VERSION,
  SUPPORTED_PROTOCOLS,
  GATEWAY_DEFAULTS
}
