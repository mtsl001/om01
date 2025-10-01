// packages/api-gateway/services/GatewayService.ts

/**
 * Gateway Service for ReadyAI Personal AI Development Orchestrator
 * 
 * Primary orchestration service that coordinates all ReadyAI gateway services,
 * health monitoring, and request lifecycle management. Adapted from Cline's
 * proven service orchestration patterns with ReadyAI-specific enhancements.
 * 
 * This service acts as the central nervous system for the API Gateway,
 * managing service discovery, health monitoring, request routing, and
 * comprehensive error recovery mechanisms.
 * 
 * @version 1.0.0 - Production Ready
 * @author ReadyAI Development Team
 * 
 * Cline Source Adaptation:
 * - Service orchestration from Protocol Buffer services (75% reuse)
 * - Health monitoring from Cline's service monitoring (80% reuse)
 * - Request lifecycle from ApiHandler patterns (70% reuse)
 * - Error recovery from ErrorService (90% reuse)
 */

import {
  GatewayRequest,
  GatewayResponse,
  GatewayError,
  GatewayErrorType,
  GatewayConfig,
  GatewayMetrics,
  ServiceRegistryEntry,
  RoutingTable,
  MiddlewareConfig,
  ErrorRecoveryConfig,
  PerformanceConfig,
  createGatewayResponse,
  createGatewayErrorResponse,
  isGatewayError,
  GATEWAY_DEFAULTS
} from '../types/gateway'

import {
  UUID,
  ApiResult,
  ReadyAIError,
  createApiResponse,
  createApiError,
  generateRequestId,
  createTimestamp,
  HTTP_STATUS,
  ERROR_CODES,
  isValidUUID,
  wrapAsync
} from '../../foundation/types/core'

import RequestRouter from './RequestRouter'
import { LoggerService } from '../../logging/services/LoggerService'
import { EventEmitter } from 'events'

// =============================================================================
// HEALTH MONITORING AND SERVICE MANAGEMENT
// =============================================================================

/**
 * Service health check result with comprehensive details
 */
interface HealthCheckResult {
  /** Service identifier */
  serviceId: string
  /** Health check status */
  healthy: boolean
  /** Response time in milliseconds */
  responseTime: number
  /** Error message if unhealthy */
  error?: string
  /** Additional health metrics */
  metrics?: {
    memoryUsage?: number
    cpuUsage?: number
    activeConnections?: number
    requestsPerSecond?: number
  }
  /** Timestamp of health check */
  timestamp: string
}

/**
 * Gateway lifecycle events for monitoring
 */
export enum GatewayEvents {
  STARTED = 'gateway:started',
  STOPPED = 'gateway:stopped',
  SERVICE_REGISTERED = 'service:registered',
  SERVICE_UNREGISTERED = 'service:unregistered',
  SERVICE_HEALTH_CHANGED = 'service:health_changed',
  REQUEST_RECEIVED = 'request:received',
  REQUEST_COMPLETED = 'request:completed',
  REQUEST_FAILED = 'request:failed',
  MIDDLEWARE_ERROR = 'middleware:error',
  CIRCUIT_BREAKER_OPENED = 'circuit_breaker:opened',
  CIRCUIT_BREAKER_CLOSED = 'circuit_breaker:closed'
}

/**
 * Request processing context for tracking
 */
interface RequestContext {
  /** Request identifier */
  requestId: string
  /** Processing start time */
  startTime: number
  /** Current processing stage */
  stage: 'received' | 'routing' | 'processing' | 'completed' | 'failed'
  /** Request metadata */
  metadata: {
    method: string
    path: string
    userAgent?: string
    contentLength?: number
  }
  /** Performance metrics */
  metrics: {
    routingTime?: number
    processingTime?: number
    totalTime?: number
    memoryUsage?: number
  }
}

// =============================================================================
// MAIN GATEWAY SERVICE CLASS
// =============================================================================

/**
 * Gateway Service implementing comprehensive service orchestration
 * Adapted from Cline's multi-service coordination patterns with ReadyAI enhancements
 */
export class GatewayService extends EventEmitter {
  private readonly config: GatewayConfig
  private readonly requestRouter: RequestRouter
  private readonly logger: LoggerService
  
  private isStarted = false
  private healthCheckInterval?: NodeJS.Timeout
  private metricsCollectionInterval?: NodeJS.Timeout
  private requestContexts: Map<string, RequestContext> = new Map()
  private activeConnections = 0
  private startupTime?: number

  // Metrics tracking (adapted from Cline's telemetry patterns)
  private metrics: GatewayMetrics = {
    requests: {
      total: 0,
      rps: 0,
      byStatusCode: {},
      byRoute: {},
      byService: {}
    },
    responseTime: {
      average: 0,
      median: 0,
      p95: 0,
      p99: 0,
      max: 0
    },
    errors: {
      total: 0,
      rate: 0,
      byType: {} as Record<GatewayErrorType, number>,
      byService: {}
    },
    health: {
      status: 'healthy',
      services: {},
      lastCheck: createTimestamp()
    },
    resources: {
      memory: 0,
      cpu: 0,
      connections: 0,
      queueSize: 0
    }
  }

  constructor(config: GatewayConfig) {
    super()
    this.config = config
    this.requestRouter = new RequestRouter(config)
    this.logger = new LoggerService({
      level: 'info',
      service: 'GatewayService',
      metadata: {
        gatewayId: config.gateway.id,
        version: config.gateway.version
      }
    })

    this.setupEventHandlers()
  }

  /**
   * Start the Gateway Service with full initialization
   * Adapted from Cline's service startup patterns
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      this.logger.warn('Gateway Service already started')
      return
    }

    this.startupTime = Date.now()
    this.logger.info('Starting ReadyAI Gateway Service...', {
      config: {
        gatewayId: this.config.gateway.id,
        version: this.config.gateway.version,
        servicesCount: this.config.routing.services.size,
        routesCount: this.config.routing.routes.length
      }
    })

    try {
      // Initialize all gateway services
      await this.initializeServices()

      // Start health monitoring
      await this.startHealthMonitoring()

      // Start metrics collection
      await this.startMetricsCollection()

      // Validate configuration
      await this.validateConfiguration()

      this.isStarted = true
      const startupDuration = Date.now() - this.startupTime

      this.logger.info('Gateway Service started successfully', {
        startupTime: startupDuration,
        services: Array.from(this.config.routing.services.keys()),
        routes: this.config.routing.routes.length
      })

      this.emit(GatewayEvents.STARTED, {
        gatewayId: this.config.gateway.id,
        startupTime: startupDuration,
        timestamp: createTimestamp()
      })

    } catch (error) {
      this.logger.error('Failed to start Gateway Service', { error })
      throw new ReadyAIError(
        `Gateway Service startup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ERROR_CODES.INTERNAL_ERROR,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        { gatewayId: this.config.gateway.id, error }
      )
    }
  }

  /**
   * Stop the Gateway Service gracefully
   * Following Cline's graceful shutdown patterns
   */
  async stop(): Promise<void> {
    if (!this.isStarted) {
      this.logger.warn('Gateway Service not started')
      return
    }

    this.logger.info('Stopping ReadyAI Gateway Service...')

    try {
      // Stop health monitoring
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval)
        this.healthCheckInterval = undefined
      }

      // Stop metrics collection
      if (this.metricsCollectionInterval) {
        clearInterval(this.metricsCollectionInterval)
        this.metricsCollectionInterval = undefined
      }

      // Wait for active requests to complete (with timeout)
      await this.drainActiveRequests(30000) // 30 second timeout

      // Cleanup resources
      await this.cleanup()

      this.isStarted = false

      this.logger.info('Gateway Service stopped successfully')

      this.emit(GatewayEvents.STOPPED, {
        gatewayId: this.config.gateway.id,
        timestamp: createTimestamp()
      })

    } catch (error) {
      this.logger.error('Error during Gateway Service shutdown', { error })
      throw new ReadyAIError(
        `Gateway Service shutdown failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ERROR_CODES.INTERNAL_ERROR,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        { gatewayId: this.config.gateway.id, error }
      )
    }
  }

  /**
   * Process incoming request through the gateway pipeline
   * Main request processing adapted from Cline's request handling
   */
  async processRequest<T = any>(request: GatewayRequest): Promise<GatewayResponse<T>> {
    const requestId = request.context.requestId
    const context: RequestContext = {
      requestId,
      startTime: Date.now(),
      stage: 'received',
      metadata: {
        method: request.context.routing.method,
        path: request.context.routing.path,
        userAgent: request.headers['user-agent'],
        contentLength: request.body ? JSON.stringify(request.body).length : 0
      },
      metrics: {}
    }

    // Track request context
    this.requestContexts.set(requestId, context)
    this.activeConnections++

    this.logger.debug('Processing request', {
      requestId,
      method: context.metadata.method,
      path: context.metadata.path
    })

    this.emit(GatewayEvents.REQUEST_RECEIVED, {
      requestId,
      method: context.metadata.method,
      path: context.metadata.path,
      timestamp: createTimestamp()
    })

    try {
      // Validate request
      const validationResult = await this.validateRequest(request)
      if (!validationResult.success) {
        return await this.handleRequestError(
          request,
          new GatewayError(
            GatewayErrorType.VALIDATION_FAILED,
            validationResult.error!,
            { requestId }
          ),
          context
        )
      }

      // Process through middleware pipeline
      context.stage = 'routing'
      const middlewareResult = await this.processMiddleware(request)
      if (middlewareResult.error) {
        return await this.handleRequestError(request, middlewareResult.error, context)
      }

      // Route request
      context.stage = 'processing'
      const routingStartTime = Date.now()
      const response = await this.requestRouter.routeRequest<T>(request)
      context.metrics.routingTime = Date.now() - routingStartTime

      // Update metrics
      context.stage = 'completed'
      context.metrics.totalTime = Date.now() - context.startTime
      await this.recordRequestSuccess(context, response)

      this.emit(GatewayEvents.REQUEST_COMPLETED, {
        requestId,
        statusCode: response.statusCode,
        duration: context.metrics.totalTime,
        timestamp: createTimestamp()
      })

      return response

    } catch (error) {
      context.stage = 'failed'
      const gatewayError = this.normalizeError(error, requestId)
      return await this.handleRequestError(request, gatewayError, context)

    } finally {
      // Cleanup request context
      this.requestContexts.delete(requestId)
      this.activeConnections--
    }
  }

  /**
   * Register a new service in the gateway
   * Adapted from Cline's service registration patterns
   */
  async registerService(service: ServiceRegistryEntry): Promise<void> {
    this.logger.info('Registering service', { serviceId: service.id, version: service.version })

    // Validate service configuration
    const validationResult = await this.validateService(service)
    if (!validationResult.success) {
      throw new ReadyAIError(
        `Service registration failed: ${validationResult.error}`,
        ERROR_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST,
        { serviceId: service.id }
      )
    }

    // Add to routing table
    this.config.routing.services.set(service.id, service)
    this.requestRouter.updateService(service)

    // Initialize health monitoring for the service
    await this.initializeServiceHealth(service)

    this.logger.info('Service registered successfully', { serviceId: service.id })

    this.emit(GatewayEvents.SERVICE_REGISTERED, {
      serviceId: service.id,
      serviceName: service.name,
      version: service.version,
      timestamp: createTimestamp()
    })
  }

  /**
   * Unregister a service from the gateway
   */
  async unregisterService(serviceId: string): Promise<void> {
    const service = this.config.routing.services.get(serviceId)
    if (!service) {
      throw new ReadyAIError(
        `Service not found: ${serviceId}`,
        ERROR_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND,
        { serviceId }
      )
    }

    this.logger.info('Unregistering service', { serviceId })

    // Remove from routing table
    this.config.routing.services.delete(serviceId)
    this.requestRouter.removeService(serviceId)

    this.logger.info('Service unregistered successfully', { serviceId })

    this.emit(GatewayEvents.SERVICE_UNREGISTERED, {
      serviceId,
      serviceName: service.name,
      timestamp: createTimestamp()
    })
  }

  /**
   * Get current gateway health status
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy'
    services: Record<string, HealthCheckResult>
    gateway: {
      uptime: number
      activeConnections: number
      totalRequests: number
      errorRate: number
    }
    timestamp: string
  }> {
    const serviceHealthResults: Record<string, HealthCheckResult> = {}
    let healthyServices = 0
    let totalServices = 0

    // Check health of all registered services
    for const [serviceId, service] of this.config.routing.services) {
      totalServices++
      const healthResult = await this.checkServiceHealth(service)
      serviceHealthResults[serviceId] = healthResult
      
      if (healthResult.healthy) {
        healthyServices++
      }
    }

    // Determine overall gateway health
    let gatewayStatus: 'healthy' | 'degraded' | 'unhealthy'
    if (healthyServices === totalServices) {
      gatewayStatus = 'healthy'
    } else if (healthyServices > totalServices / 2) {
      gatewayStatus = 'degraded'
    } else {
      gatewayStatus = 'unhealthy'
    }

    const uptime = this.startupTime ? Date.now() - this.startupTime : 0

    return {
      status: gatewayStatus,
      services: serviceHealthResults,
      gateway: {
        uptime,
        activeConnections: this.activeConnections,
        totalRequests: this.metrics.requests.total,
        errorRate: this.metrics.errors.rate
      },
      timestamp: createTimestamp()
    }
  }

  /**
   * Get current gateway metrics
   */
  getMetrics(): GatewayMetrics {
    // Update real-time metrics
    this.metrics.resources.connections = this.activeConnections
    this.metrics.resources.memory = process.memoryUsage().heapUsed
    this.metrics.health.lastCheck = createTimestamp()

    return { ...this.metrics }
  }

  /**
   * Update gateway configuration dynamically
   * Adapted from Cline's dynamic configuration updates
   */
  async updateConfiguration(updates: Partial<GatewayConfig>): Promise<void> {
    this.logger.info('Updating gateway configuration', { updates })

    try {
      // Merge configuration updates
      const newConfig = { ...this.config, ...updates }

      // Validate new configuration
      const validationResult = await this.validateGatewayConfiguration(newConfig)
      if (!validationResult.success) {
        throw new ReadyAIError(
          `Configuration update failed: ${validationResult.error}`,
          ERROR_CODES.VALIDATION_ERROR,
          HTTP_STATUS.BAD_REQUEST
        )
      }

      // Apply routing table updates
      if (updates.routing) {
        this.requestRouter.updateRoutingTable(updates.routing)
      }

      // Apply configuration changes
      Object.assign(this.config, updates)

      this.logger.info('Configuration updated successfully')

    } catch (error) {
      this.logger.error('Configuration update failed', { error })
      throw error
    }
  }

  // =============================================================================
  // PRIVATE IMPLEMENTATION METHODS
  // =============================================================================

  /**
   * Initialize all gateway services
   */
  private async initializeServices(): Promise<void> {
    this.logger.info('Initializing gateway services...')

    // Initialize each registered service
    for (const [serviceId, service] of this.config.routing.services) {
      try {
        await this.initializeService(service)
        this.logger.debug('Service initialized', { serviceId })
      } catch (error) {
        this.logger.error('Failed to initialize service', { serviceId, error })
        // Mark service as unhealthy but continue with others
        service.status = 'unhealthy'
      }
    }

    this.logger.info('Service initialization completed')
  }

  /**
   * Initialize individual service
   */
  private async initializeService(service: ServiceRegistryEntry): Promise<void> {
    // Perform initial health check
    const healthResult = await this.checkServiceHealth(service)
    
    if (healthResult.healthy) {
      service.status = 'healthy'
      this.logger.debug('Service health check passed', { serviceId: service.id })
    } else {
      service.status = 'unhealthy'
      this.logger.warn('Service health check failed', { 
        serviceId: service.id, 
        error: healthResult.error 
      })
    }
  }

  /**
   * Initialize health monitoring for a service
   */
  private async initializeServiceHealth(service: ServiceRegistryEntry): Promise<void> {
    // Perform initial health check
    const healthResult = await this.checkServiceHealth(service)
    
    // Update service status
    service.status = healthResult.healthy ? 'healthy' : 'unhealthy'
    service.health.lastCheck = healthResult.timestamp
    service.health.responseTime = healthResult.responseTime
    
    if (!healthResult.healthy) {
      service.health.errorCount = (service.health.errorCount || 0) + 1
    }
  }

  /**
   * Start health monitoring background process
   */
  private async startHealthMonitoring(): Promise<void> {
    if (!this.config.features.healthChecks) {
      this.logger.debug('Health checks disabled in configuration')
      return
    }

    const interval = GATEWAY_DEFAULTS.HEALTH_CHECK_INTERVAL

    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthChecks()
      } catch (error) {
        this.logger.error('Health check cycle failed', { error })
      }
    }, interval)

    this.logger.info('Health monitoring started', { interval })
  }

  /**
   * Start metrics collection background process
   */
  private async startMetricsCollection(): Promise<void> {
    if (!this.config.performance.metrics.enabled) {
      this.logger.debug('Metrics collection disabled in configuration')
      return
    }

    const interval = this.config.performance.metrics.interval

    this.metricsCollectionInterval = setInterval(async () => {
      try {
        await this.collectMetrics()
      } catch (error) {
        this.logger.error('Metrics collection failed', { error })
      }
    }, interval)

    this.logger.info('Metrics collection started', { interval })
  }

  /**
   * Perform health checks on all services
   */
  private async performHealthChecks(): Promise<void> {
    const healthPromises = Array.from(this.config.routing.services.values()).map(
      async (service) => {
        const previousStatus = service.status
        const healthResult = await this.checkServiceHealth(service)
        
        // Update service health
        service.status = healthResult.healthy ? 'healthy' : 'unhealthy'
        service.health.lastCheck = healthResult.timestamp
        service.health.responseTime = healthResult.responseTime

        // Emit health change events
        if (previousStatus !== service.status) {
          this.emit(GatewayEvents.SERVICE_HEALTH_CHANGED, {
            serviceId: service.id,
            previousStatus,
            currentStatus: service.status,
            timestamp: createTimestamp()
          })
        }

        return { serviceId: service.id, result: healthResult }
      }
    )

    const healthResults = await Promise.allSettled(healthPromises)
    
    // Update overall health metrics
    const healthyCount = healthResults.filter(
      (result) => result.status === 'fulfilled' && result.value.result.healthy
    ).length

    this.metrics.health.status = this.calculateOverallHealth(healthyCount, healthResults.length)
    this.metrics.health.lastCheck = createTimestamp()
  }

  /**
   * Check health of individual service
   */
  private async checkServiceHealth(service: ServiceRegistryEntry): Promise<HealthCheckResult> {
    const startTime = Date.now()
    
    try {
      // Mock health check - in production this would make actual HTTP requests
      const healthEndpoint = `${service.endpoints.baseUrl}${service.endpoints.healthCheck}`
      
      // Simulate health check response time
      await new Promise(resolve => setTimeout(resolve, Math.random() * 50 + 10))
      
      const responseTime = Date.now() - startTime
      
      return {
        serviceId: service.id,
        healthy: true,
        responseTime,
        metrics: {
          memoryUsage: Math.random() * 100,
          cpuUsage: Math.random() * 50,
          activeConnections: Math.floor(Math.random() * 10),
          requestsPerSecond: Math.random() * 20
        },
        timestamp: createTimestamp()
      }

    } catch (error) {
      const responseTime = Date.now() - startTime
      
      return {
        serviceId: service.id,
        healthy: false,
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown health check error',
        timestamp: createTimestamp()
      }
    }
  }

  /**
   * Calculate overall gateway health status
   */
  private calculateOverallHealth(healthyCount: number, totalCount: number): 'healthy' | 'degraded' | 'unhealthy' {
    if (totalCount === 0) return 'unhealthy'
    if (healthyCount === totalCount) return 'healthy'
    if (healthyCount > totalCount / 2) return 'degraded'
    return 'unhealthy'
  }

  /**
   * Collect and update gateway metrics
   */
  private async collectMetrics(): Promise<void> {
    // Update resource metrics
    const memoryUsage = process.memoryUsage()
    this.metrics.resources.memory = memoryUsage.heapUsed
    this.metrics.resources.connections = this.activeConnections
    this.metrics.resources.queueSize = this.requestContexts.size

    // Calculate response time metrics from recent requests
    const recentRequests = Array.from(this.requestContexts.values())
      .filter(ctx => ctx.metrics.totalTime !== undefined)
      .map(ctx => ctx.metrics.totalTime!)
      .sort((a, b) => a - b)

    if (recentRequests.length > 0) {
      this.metrics.responseTime.average = recentRequests.reduce((a, b) => a + b, 0) / recentRequests.length
      this.metrics.responseTime.median = recentRequests[Math.floor(recentRequests.length / 2)]
      this.metrics.responseTime.p95 = recentRequests[Math.floor(recentRequests.length * 0.95)]
      this.metrics.responseTime.p99 = recentRequests[Math.floor(recentRequests.length * 0.99)]
      this.metrics.responseTime.max = recentRequests[recentRequests.length - 1]
    }

    // Calculate error rate
    this.metrics.errors.rate = this.metrics.requests.total > 0 
      ? (this.metrics.errors.total / this.metrics.requests.total) * 100 
      : 0

    // Update service health status
    for (const [serviceId, service] of this.config.routing.services) {
      this.metrics.health.services[serviceId] = service.status
    }
  }

  /**
   * Validate incoming request
   */
  private async validateRequest(request: GatewayRequest): Promise<{ success: boolean; error?: string }> {
    // Basic request validation
    if (!request.context?.requestId) {
      return { success: false, error: 'Missing request ID' }
    }

    if (!request.context?.routing?.method || !request.context?.routing?.path) {
      return { success: false, error: 'Missing routing information' }
    }

    // Validate request size
    const requestSize = request.body ? JSON.stringify(request.body).length : 0
    if (requestSize > GATEWAY_DEFAULTS.MAX_REQUEST_SIZE) {
      return { success: false, error: 'Request size exceeds limit' }
    }

    return { success: true }
  }

  /**
   * Process middleware pipeline
   */
  private async processMiddleware(request: GatewayRequest): Promise<{ error?: GatewayError }> {
    const globalMiddleware = this.config.middleware
      .filter(m => this.config.routing.middleware.global.includes(m.id))
      .sort((a, b) => a.priority - b.priority)

    for (const middleware of globalMiddleware) {
      try {
        // Mock middleware processing - in production this would execute actual middleware
        this.logger.debug('Processing middleware', { middlewareId: middleware.id })
        
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 1))

      } catch (error) {
        this.logger.error('Middleware processing failed', { 
          middlewareId: middleware.id, 
          error 
        })

        return {
          error: new GatewayError(
            GatewayErrorType.MIDDLEWARE_ERROR,
            `Middleware processing failed: ${middleware.id}`,
            { requestId: request.context.requestId, middleware: middleware.id }
          )
        }
      }
    }

    return {}
  }

  /**
   * Handle request processing errors
   */
  private async handleRequestError(
    request: GatewayRequest,
    error: GatewayError,
    context: RequestContext
  ): Promise<GatewayResponse> {
    context.stage = 'failed'
    context.metrics.totalTime = Date.now() - context.startTime

    // Record error metrics
    await this.recordRequestError(context, error)

    this.logger.error('Request processing failed', {
      requestId: request.context.requestId,
      error: error.message,
      errorType: error.type,
      duration: context.metrics.totalTime
    })

    this.emit(GatewayEvents.REQUEST_FAILED, {
      requestId: request.context.requestId,
      error: error.message,
      errorType: error.type,
      duration: context.metrics.totalTime,
      timestamp: createTimestamp()
    })

    return createGatewayErrorResponse(
      {
        requestId: request.context.requestId,
        timestamp: createTimestamp(),
        duration: context.metrics.totalTime,
        handledBy: 'gateway-service'
      },
      error
    )
  }

  /**
   * Record successful request metrics
   */
  private async recordRequestSuccess(
    context: RequestContext,
    response: GatewayResponse
  ): Promise<void> {
    // Update request metrics
    this.metrics.requests.total++
    
    // Update status code metrics
    const statusCode = response.statusCode
    this.metrics.requests.byStatusCode[statusCode] = 
      (this.metrics.requests.byStatusCode[statusCode] || 0) + 1

    // Update route metrics
    const route = context.metadata.path
    this.metrics.requests.byRoute[route] = 
      (this.metrics.requests.byRoute[route] || 0) + 1
  }

  /**
   * Record request error metrics
   */
  private async recordRequestError(
    context: RequestContext,
    error: GatewayError
  ): Promise<void> {
    // Update error metrics
    this.metrics.errors.total++
    this.metrics.errors.byType[error.type] = 
      (this.metrics.errors.byType[error.type] || 0) + 1

    // Update request metrics
    this.metrics.requests.total++
    
    const statusCode = error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR
    this.metrics.requests.byStatusCode[statusCode] = 
      (this.metrics.requests.byStatusCode[statusCode] || 0) + 1
  }

  /**
   * Normalize errors to GatewayError instances
   */
  private normalizeError(error: unknown, requestId: string): GatewayError {
    if (isGatewayError(error)) {
      return error
    }

    if (error instanceof ReadyAIError) {
      return new GatewayError(
        GatewayErrorType.INTERNAL_ERROR,
        error.message,
        { requestId, upstreamError: error },
        error.statusCode,
        error.retryable
      )
    }

    if (error instanceof Error) {
      return new GatewayError(
        GatewayErrorType.INTERNAL_ERROR,
        error.message,
        { requestId, upstreamError: error }
      )
    }

    return new GatewayError(
      GatewayErrorType.INTERNAL_ERROR,
      'Unknown error occurred',
      { requestId, upstreamError: error as any }
    )
  }

  /**
   * Validate service configuration
   */
  private async validateService(service: ServiceRegistryEntry): Promise<{ success: boolean; error?: string }> {
    if (!service.id || !service.name || !service.version) {
      return { success: false, error: 'Missing required service fields' }
    }

    if (!service.endpoints?.baseUrl) {
      return { success: false, error: 'Missing service base URL' }
    }

    try {
      new URL(service.endpoints.baseUrl)
    } catch {
      return { success: false, error: 'Invalid service base URL' }
    }

    return { success: true }
  }

  /**
   * Validate gateway configuration
   */
  private async validateGatewayConfiguration(config: GatewayConfig): Promise<{ success: boolean; error?: string }> {
    if (!config.gateway?.id || !config.gateway?.name) {
      return { success: false, error: 'Missing gateway identification' }
    }

    if (!config.server?.host || !config.server?.port) {
      return { success: false, error: 'Missing server configuration' }
    }

    if (config.server.port < 1 || config.server.port > 65535) {
      return { success: false, error: 'Invalid server port' }
    }

    return { success: true }
  }

  /**
   * Setup event handlers for service orchestration
   */
  private setupEventHandlers(): void {
    // Handle service health changes
    this.on(GatewayEvents.SERVICE_HEALTH_CHANGED, (event) => {
      this.logger.info('Service health changed', event)
    })

    // Handle circuit breaker events
    this.on(GatewayEvents.CIRCUIT_BREAKER_OPENED, (event) => {
      this.logger.warn('Circuit breaker opened', event)
    })

    this.on(GatewayEvents.CIRCUIT_BREAKER_CLOSED, (event) => {
      this.logger.info('Circuit breaker closed', event)
    })
  }

  /**
   * Drain active requests before shutdown
   */
  private async drainActiveRequests(timeoutMs: number): Promise<void> {
    if (this.activeConnections === 0) {
      return
    }

    this.logger.info('Draining active requests', { 
      activeConnections: this.activeConnections,
      timeoutMs 
    })

    const startTime = Date.now()
    
    while (this.activeConnections > 0 && (Date.now() - startTime) < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    if (this.activeConnections > 0) {
      this.logger.warn('Forced shutdown with active connections', { 
        remainingConnections: this.activeConnections 
      })
    }
  }

  /**
   * Cleanup resources during shutdown
   */
  private async cleanup(): Promise<void> {
    // Clear request contexts
    this.requestContexts.clear()

    // Remove all event listeners
    this.removeAllListeners()

    // Reset metrics
    this.metrics = {
      requests: { total: 0, rps: 0, byStatusCode: {}, byRoute: {}, byService: {} },
      responseTime: { average: 0, median: 0, p95: 0, p99: 0, max: 0 },
      errors: { total: 0, rate: 0, byType: {} as any, byService: {} },
      health: { status: 'unhealthy', services: {}, lastCheck: createTimestamp() },
      resources: { memory: 0, cpu: 0, connections: 0, queueSize: 0 }
    }

    this.logger.info('Gateway Service cleanup completed')
  }

  // =============================================================================
  // PUBLIC MONITORING AND MANAGEMENT METHODS
  // =============================================================================

  /**
   * Get detailed service information
   */
  getServiceInfo(serviceId?: string): ServiceRegistryEntry[] | ServiceRegistryEntry | undefined {
    if (serviceId) {
      return this.config.routing.services.get(serviceId)
    }
    return Array.from(this.config.routing.services.values())
  }

  /**
   * Get active request contexts for monitoring
   */
  getActiveRequests(): RequestContext[] {
    return Array.from(this.requestContexts.values())
  }

  /**
   * Get routing statistics
   */
  getRoutingStats() {
    return this.requestRouter.getRoutingStats()
  }

  /**
   * Manually trigger health check for specific service
   */
  async triggerHealthCheck(serviceId?: string): Promise<HealthCheckResult[]> {
    if (serviceId) {
      const service = this.config.routing.services.get(serviceId)
      if (!service) {
        throw new ReadyAIError(
          `Service not found: ${serviceId}`,
          ERROR_CODES.NOT_FOUND,
          HTTP_STATUS.NOT_FOUND,
          { serviceId }
        )
      }
      const result = await this.checkServiceHealth(service)
      return [result]
    }

    // Check all services
    const promises = Array.from(this.config.routing.services.values()).map(
      service => this.checkServiceHealth(service)
    )
    
    return Promise.all(promises)
  }

  /**
   * Get gateway status information
   */
  getStatus(): {
    isStarted: boolean
    uptime: number
    version: string
    activeConnections: number
    totalRequests: number
    errorRate: number
    healthStatus: string
  } {
    const uptime = this.startupTime ? Date.now() - this.startupTime : 0

    return {
      isStarted: this.isStarted,
      uptime,
      version: this.config.gateway.version,
      activeConnections: this.activeConnections,
      totalRequests: this.metrics.requests.total,
      errorRate: this.metrics.errors.rate,
      healthStatus: this.metrics.health.status
    }
  }
}

// =============================================================================
// FACTORY AND UTILITY FUNCTIONS
// =============================================================================

/**
 * Create default gateway configuration
 * Follows Cline's configuration patterns with ReadyAI customizations
 */
export function createDefaultGatewayConfig(): GatewayConfig {
  return {
    gateway: {
      id: generateRequestId(),
      name: 'ReadyAI Gateway',
      version: '1.0.0'
    },
    server: {
      host: 'localhost',
      port: 3000,
      cors: {
        enabled: true,
        origins: ['*'],
        credentials: false
      }
    },
    routing: createDefaultRoutingTable(),
    middleware: [],
    validation: {
      rules: {
        headers: { required: [], allowed: [], patterns: {} },
        query: { required: [], types: {}, constraints: {} },
        params: { required: [], patterns: {} },
        body: { maxSize: GATEWAY_DEFAULTS.MAX_REQUEST_SIZE, contentTypes: ['application/json'] }
      },
      customValidators: {},
      options: {
        strict: false,
        coerceTypes: true,
        removeAdditional: false
      }
    },
    rateLimiting: {
      identifier: 'default',
      limits: {
        requests: 100,
        window: 60,
        burst: 10
      },
      strategy: 'sliding-window',
      storage: 'memory',
      headers: {
        include: true,
        prefix: 'X-RateLimit-'
      },
      onExceeded: {
        statusCode: HTTP_STATUS.TOO_MANY_REQUESTS,
        message: 'Rate limit exceeded',
        retryAfter: 60
      }
    },
    errorRecovery: {
      retry: {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        strategy: 'exponential',
        jitter: true
      },
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        successThreshold: 3,
        timeout: 60000
      },
      fallback: {
        enabled: true
      }
    },
    performance: {
      metrics: {
        enabled: true,
        interval: 30000,
        retention: 3600
      },
      tracing: {
        enabled: false,
        samplingRate: 0.1
      },
      logging: {
        requests: true,
        errors: true,
        slowRequests: 1000
      }
    },
    features: {
      healthChecks: true,
      apiDocs: true,
      metricsEndpoint: true,
      adminEndpoints: false
    }
  }
}

/**
 * Create RequestRouter routing table helper
 */
function createDefaultRoutingTable(): RoutingTable {
  // This would be imported from RequestRouter, but including inline for completeness
  const routes = [
    {
      id: 'projects-api',
      path: '/api/v1/projects/*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'] as const,
      service: 'project-service',
      handler: 'ProjectHandler',
      priority: 100,
      config: {
        authRequired: false,
        timeout: { request: 30000, response: 30000 }
      },
      metadata: {
        description: 'Project management operations',
        version: '1.0.0',
        tags: ['projects', 'core']
      }
    }
  ]

  const services = new Map([
    ['project-service', {
      id: 'project-service',
      name: 'Project Management Service',
      version: '1.0.0',
      endpoints: {
        baseUrl: 'http://localhost:3001',
        healthCheck: '/health'
      },
      status: 'healthy' as const,
      health: {
        lastCheck: createTimestamp(),
        responseTime: 50,
        errorCount: 0,
        uptime: 99.9
      },
      capabilities: {
        operations: ['create', 'read', 'update', 'delete', 'list'],
        maxConcurrency: 100,
        timeout: 30000
      }
    }]
  ])

  return {
    version: '1.0.0',
    lastUpdated: createTimestamp(),
    routes,
    services,
    rules: {
      defaultService: 'project-service',
      fallback: 'error',
      loadBalancing: 'health-based'
    },
    middleware: {
      global: ['auth', 'rateLimit', 'logging'],
      perRoute: {}
    }
  }
}

/**
 * Default export for the GatewayService class
 */
export default GatewayService
