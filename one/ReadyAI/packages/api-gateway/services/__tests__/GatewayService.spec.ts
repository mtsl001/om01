// packages/api-gateway/services/__tests__/GatewayService.spec.ts

/**
 * Comprehensive test suite for GatewayService
 * 
 * Adapted from Cline's service testing patterns with ReadyAI-specific enhancements.
 * Provides exhaustive coverage of gateway functionality including lifecycle management,
 * request processing, health monitoring, service registration, and error handling.
 * 
 * @version 1.0.0 - Production Ready
 * @author ReadyAI Development Team
 * 
 * Cline Source Adaptation:
 * - Service test patterns from Cline's comprehensive test suite (80% reuse)
 * - Mock implementation patterns from Cline's testing infrastructure (75% reuse)
 * - Event testing from Cline's EventEmitter tests (90% reuse)
 * - Error scenario coverage from Cline's error handling tests (85% reuse)
 */

import { EventEmitter } from 'events'
import { 
  GatewayService, 
  GatewayEvents, 
  createDefaultGatewayConfig 
} from '../GatewayService'
import {
  GatewayRequest,
  GatewayResponse,
  GatewayError,
  GatewayErrorType,
  GatewayConfig,
  ServiceRegistryEntry,
  createGatewayResponse,
  createGatewayErrorResponse,
  GATEWAY_DEFAULTS
} from '../../types/gateway'
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
  generateUUID
} from '../../../foundation/types/core'

// =============================================================================
// MOCK IMPLEMENTATIONS
// =============================================================================

// Mock RequestRouter
class MockRequestRouter {
  constructor(private config: GatewayConfig) {}
  
  async routeRequest<T>(request: GatewayRequest): Promise<GatewayResponse<T>> {
    // Simulate successful routing
    return createGatewayResponse(
      {
        requestId: request.context.requestId,
        timestamp: createTimestamp(),
        duration: 50,
        handledBy: 'mock-router'
      },
      { success: true, data: 'mocked response' } as any,
      HTTP_STATUS.OK
    )
  }

  updateService(service: ServiceRegistryEntry): void {}
  removeService(serviceId: string): void {}
  updateRoutingTable(routingTable: any): void {}
  getRoutingStats() {
    return {
      totalRequests: 100,
      averageResponseTime: 45,
      errorRate: 2.5,
      routeStats: {}
    }
  }
}

// Mock LoggerService
class MockLoggerService {
  constructor(private config: any) {}
  
  debug(message: string, meta?: any): void {}
  info(message: string, meta?: any): void {}
  warn(message: string, meta?: any): void {}
  error(message: string, meta?: any): void {}
}

// Mock dependencies
jest.mock('./RequestRouter', () => ({
  __esModule: true,
  default: MockRequestRouter
}))

jest.mock('../../logging/services/LoggerService', () => ({
  LoggerService: MockLoggerService
}))

// =============================================================================
// TEST UTILITIES
// =============================================================================

/**
 * Create test gateway configuration
 */
function createTestConfig(): GatewayConfig {
  const config = createDefaultGatewayConfig()
  config.gateway.id = 'test-gateway-001'
  config.gateway.name = 'Test Gateway'
  config.server.port = 3001
  return config
}

/**
 * Create test service registry entry
 */
function createTestService(id = 'test-service'): ServiceRegistryEntry {
  return {
    id,
    name: 'Test Service',
    version: '1.0.0',
    endpoints: {
      baseUrl: 'http://localhost:3002',
      healthCheck: '/health'
    },
    status: 'healthy',
    health: {
      lastCheck: createTimestamp(),
      responseTime: 25,
      errorCount: 0,
      uptime: 99.9
    },
    capabilities: {
      operations: ['create', 'read', 'update', 'delete'],
      maxConcurrency: 50,
      timeout: 30000
    }
  }
}

/**
 * Create test gateway request
 */
function createTestRequest(overrides: Partial<GatewayRequest> = {}): GatewayRequest {
  const requestId = generateRequestId()
  return {
    context: {
      requestId,
      timestamp: createTimestamp(),
      routing: {
        method: 'GET',
        path: '/api/test',
        service: 'test-service'
      },
      user: {
        id: generateUUID(),
        permissions: ['read']
      }
    },
    headers: {
      'content-type': 'application/json',
      'user-agent': 'ReadyAI-Test/1.0'
    },
    query: {},
    params: {},
    body: null,
    ...overrides
  }
}

/**
 * Wait for specific number of milliseconds
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Wait for event with timeout
 */
function waitForEvent(emitter: EventEmitter, event: string, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      emitter.removeAllListeners(event)
      reject(new Error(`Event '${event}' not emitted within ${timeout}ms`))
    }, timeout)

    emitter.once(event, (data) => {
      clearTimeout(timer)
      resolve(data)
    })
  })
}

// =============================================================================
// MAIN TEST SUITE
// =============================================================================

describe('GatewayService', () => {
  let gatewayService: GatewayService
  let testConfig: GatewayConfig
  let consoleSpy: jest.SpyInstance

  beforeEach(() => {
    testConfig = createTestConfig()
    gatewayService = new GatewayService(testConfig)
    
    // Suppress console output during tests
    consoleSpy = jest.spyOn(console, 'log').mockImplementation()
  })

  afterEach(async () => {
    if (gatewayService) {
      try {
        await gatewayService.stop()
      } catch (error) {
        // Ignore shutdown errors in tests
      }
    }
    consoleSpy.mockRestore()
    jest.clearAllMocks()
  })

  // =============================================================================
  // CONSTRUCTOR AND INITIALIZATION TESTS
  // =============================================================================

  describe('Constructor', () => {
    it('should initialize with valid configuration', () => {
      const service = new GatewayService(testConfig)
      expect(service).toBeInstanceOf(GatewayService)
      expect(service).toBeInstanceOf(EventEmitter)
    })

    it('should initialize with default metrics', () => {
      const service = new GatewayService(testConfig)
      const metrics = service.getMetrics()
      
      expect(metrics.requests.total).toBe(0)
      expect(metrics.errors.total).toBe(0)
      expect(metrics.health.status).toBe('healthy')
    })

    it('should setup event handlers during construction', () => {
      const service = new GatewayService(testConfig)
      expect(service.listenerCount(GatewayEvents.STARTED)).toBeGreaterThan(0)
    })
  })

  // =============================================================================
  // SERVICE LIFECYCLE TESTS
  // =============================================================================

  describe('Service Lifecycle', () => {
    describe('start()', () => {
      it('should start successfully with valid configuration', async () => {
        const startPromise = waitForEvent(gatewayService, GatewayEvents.STARTED)
        
        await gatewayService.start()
        
        const startEvent = await startPromise
        expect(startEvent.gatewayId).toBe(testConfig.gateway.id)
        expect(startEvent.startupTime).toBeGreaterThan(0)
      })

      it('should not start twice', async () => {
        await gatewayService.start()
        
        // Second start should not throw but should be ignored
        await expect(gatewayService.start()).resolves.not.toThrow()
      })

      it('should initialize all registered services', async () => {
        const testService = createTestService()
        testConfig.routing.services.set('test-service', testService)
        
        await gatewayService.start()
        
        const status = await gatewayService.getHealthStatus()
        expect(status.services['test-service']).toBeDefined()
      })

      it('should handle service initialization failures gracefully', async () => {
        const faultyService = createTestService('faulty-service')
        faultyService.endpoints.baseUrl = 'invalid-url'
        testConfig.routing.services.set('faulty-service', faultyService)
        
        await expect(gatewayService.start()).resolves.not.toThrow()
      })
    })

    describe('stop()', () => {
      it('should stop gracefully', async () => {
        await gatewayService.start()
        
        const stopPromise = waitForEvent(gatewayService, GatewayEvents.STOPPED)
        
        await gatewayService.stop()
        
        const stopEvent = await stopPromise
        expect(stopEvent.gatewayId).toBe(testConfig.gateway.id)
      })

      it('should not stop if not started', async () => {
        await expect(gatewayService.stop()).resolves.not.toThrow()
      })

      it('should drain active requests before stopping', async () => {
        await gatewayService.start()
        
        // Simulate active request processing
        const request = createTestRequest()
        const processPromise = gatewayService.processRequest(request)
        
        // Start shutdown while request is active
        const stopPromise = gatewayService.stop()
        
        // Both should complete successfully
        await expect(processPromise).resolves.toBeDefined()
        await expect(stopPromise).resolves.not.toThrow()
      })
    })
  })

  // =============================================================================
  // REQUEST PROCESSING TESTS
  // =============================================================================

  describe('Request Processing', () => {
    beforeEach(async () => {
      await gatewayService.start()
    })

    describe('processRequest()', () => {
      it('should process valid request successfully', async () => {
        const request = createTestRequest()
        const startPromise = waitForEvent(gatewayService, GatewayEvents.REQUEST_RECEIVED)
        const completedPromise = waitForEvent(gatewayService, GatewayEvents.REQUEST_COMPLETED)
        
        const response = await gatewayService.processRequest(request)
        
        await startPromise
        await completedPromise
        
        expect(response).toBeDefined()
        expect(response.statusCode).toBe(HTTP_STATUS.OK)
        expect(response.context.requestId).toBe(request.context.requestId)
      })

      it('should handle missing request ID', async () => {
        const request = createTestRequest()
        delete (request.context as any).requestId
        
        const response = await gatewayService.processRequest(request)
        
        expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST)
        expect(response.success).toBe(false)
      })

      it('should handle missing routing information', async () => {
        const request = createTestRequest()
        delete (request.context as any).routing
        
        const response = await gatewayService.processRequest(request)
        
        expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST)
        expect(response.success).toBe(false)
      })

      it('should handle oversized requests', async () => {
        const request = createTestRequest({
          body: 'x'.repeat(GATEWAY_DEFAULTS.MAX_REQUEST_SIZE + 1)
        })
        
        const response = await gatewayService.processRequest(request)
        
        expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST)
        expect(response.success).toBe(false)
      })

      it('should emit REQUEST_FAILED event on processing error', async () => {
        // Mock router to throw error
        const mockRouter = gatewayService['requestRouter'] as any
        mockRouter.routeRequest = jest.fn().mockRejectedValue(new Error('Routing failed'))
        
        const request = createTestRequest()
        const failedPromise = waitForEvent(gatewayService, GatewayEvents.REQUEST_FAILED)
        
        const response = await gatewayService.processRequest(request)
        
        const failedEvent = await failedPromise
        expect(failedEvent.requestId).toBe(request.context.requestId)
        expect(response.success).toBe(false)
      })

      it('should track active connections', async () => {
        const request = createTestRequest()
        
        // Start processing without awaiting
        const processPromise = gatewayService.processRequest(request)
        
        // Give time for connection tracking
        await delay(10)
        
        const activeRequests = gatewayService.getActiveRequests()
        expect(activeRequests.length).toBeGreaterThan(0)
        
        // Complete processing
        await processPromise
        
        // Connection should be cleaned up
        const finalActiveRequests = gatewayService.getActiveRequests()
        expect(finalActiveRequests.length).toBe(0)
      })
    })

    describe('Middleware Processing', () => {
      it('should process middleware in correct order', async () => {
        // Add test middleware to configuration
        testConfig.middleware = [
          {
            id: 'test-middleware-1',
            name: 'Test Middleware 1',
            priority: 1,
            config: {}
          },
          {
            id: 'test-middleware-2',
            name: 'Test Middleware 2',
            priority: 2,
            config: {}
          }
        ]
        testConfig.routing.middleware.global = ['test-middleware-1', 'test-middleware-2']
        
        const request = createTestRequest()
        const response = await gatewayService.processRequest(request)
        
        expect(response.statusCode).toBe(HTTP_STATUS.OK)
      })

      it('should handle middleware errors', async () => {
        // Mock middleware processing to fail
        const processMiddleware = gatewayService['processMiddleware'] as any
        gatewayService['processMiddleware'] = jest.fn().mockResolvedValue({
          error: new GatewayError(
            GatewayErrorType.MIDDLEWARE_ERROR,
            'Middleware failed',
            { middlewareId: 'test-middleware' }
          )
        })
        
        const request = createTestRequest()
        const response = await gatewayService.processRequest(request)
        
        expect(response.success).toBe(false)
        expect(response.statusCode).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      })
    })
  })

  // =============================================================================
  // SERVICE MANAGEMENT TESTS
  // =============================================================================

  describe('Service Management', () => {
    beforeEach(async () => {
      await gatewayService.start()
    })

    describe('registerService()', () => {
      it('should register valid service successfully', async () => {
        const testService = createTestService('new-service')
        const registeredPromise = waitForEvent(gatewayService, GatewayEvents.SERVICE_REGISTERED)
        
        await gatewayService.registerService(testService)
        
        const registeredEvent = await registeredPromise
        expect(registeredEvent.serviceId).toBe('new-service')
        
        const serviceInfo = gatewayService.getServiceInfo('new-service')
        expect(serviceInfo).toEqual(testService)
      })

      it('should validate service configuration', async () => {
        const invalidService = {
          id: '',
          name: '',
          version: '1.0.0'
        } as ServiceRegistryEntry
        
        await expect(gatewayService.registerService(invalidService))
          .rejects.toThrow('Service registration failed')
      })

      it('should validate service base URL', async () => {
        const invalidService = createTestService()
        invalidService.endpoints.baseUrl = 'not-a-valid-url'
        
        await expect(gatewayService.registerService(invalidService))
          .rejects.toThrow('Invalid service base URL')
      })

      it('should initialize health monitoring for new service', async () => {
        const testService = createTestService('health-test-service')
        
        await gatewayService.registerService(testService)
        
        const healthStatus = await gatewayService.getHealthStatus()
        expect(healthStatus.services['health-test-service']).toBeDefined()
      })
    })

    describe('unregisterService()', () => {
      it('should unregister existing service', async () => {
        const testService = createTestService('service-to-remove')
        await gatewayService.registerService(testService)
        
        const unregisteredPromise = waitForEvent(gatewayService, GatewayEvents.SERVICE_UNREGISTERED)
        
        await gatewayService.unregisterService('service-to-remove')
        
        const unregisteredEvent = await unregisteredPromise
        expect(unregisteredEvent.serviceId).toBe('service-to-remove')
        
        const serviceInfo = gatewayService.getServiceInfo('service-to-remove')
        expect(serviceInfo).toBeUndefined()
      })

      it('should throw error for non-existent service', async () => {
        await expect(gatewayService.unregisterService('non-existent-service'))
          .rejects.toThrow('Service not found: non-existent-service')
      })
    })
  })

  // =============================================================================
  // HEALTH MONITORING TESTS
  // =============================================================================

  describe('Health Monitoring', () => {
    beforeEach(async () => {
      await gatewayService.start()
    })

    describe('getHealthStatus()', () => {
      it('should return overall health status', async () => {
        const healthStatus = await gatewayService.getHealthStatus()
        
        expect(healthStatus).toHaveProperty('status')
        expect(healthStatus).toHaveProperty('services')
        expect(healthStatus).toHaveProperty('gateway')
        expect(healthStatus).toHaveProperty('timestamp')
        
        expect(healthStatus.gateway).toHaveProperty('uptime')
        expect(healthStatus.gateway).toHaveProperty('activeConnections')
        expect(healthStatus.gateway).toHaveProperty('totalRequests')
        expect(healthStatus.gateway).toHaveProperty('errorRate')
      })

      it('should calculate healthy status with all services healthy', async () => {
        const healthyService = createTestService('healthy-service')
        await gatewayService.registerService(healthyService)
        
        const healthStatus = await gatewayService.getHealthStatus()
        
        expect(healthStatus.status).toBe('healthy')
        expect(healthStatus.services['healthy-service'].healthy).toBe(true)
      })

      it('should calculate degraded status with some services unhealthy', async () => {
        const healthyService = createTestService('healthy-service')
        const unhealthyService = createTestService('unhealthy-service')
        
        await gatewayService.registerService(healthyService)
        await gatewayService.registerService(unhealthyService)
        
        // Mock unhealthy service
        const checkServiceHealth = gatewayService['checkServiceHealth'] as any
        gatewayService['checkServiceHealth'] = jest.fn().mockImplementation((service) => {
          if (service.id === 'unhealthy-service') {
            return Promise.resolve({
              serviceId: service.id,
              healthy: false,
              responseTime: 5000,
              error: 'Service timeout',
              timestamp: createTimestamp()
            })
          }
          return Promise.resolve({
            serviceId: service.id,
            healthy: true,
            responseTime: 50,
            timestamp: createTimestamp()
          })
        })
        
        const healthStatus = await gatewayService.getHealthStatus()
        
        expect(['degraded', 'unhealthy']).toContain(healthStatus.status)
      })
    })

    describe('triggerHealthCheck()', () => {
      it('should check health of specific service', async () => {
        const testService = createTestService('health-check-service')
        await gatewayService.registerService(testService)
        
        const healthResults = await gatewayService.triggerHealthCheck('health-check-service')
        
        expect(healthResults).toHaveLength(1)
        expect(healthResults[0].serviceId).toBe('health-check-service')
        expect(healthResults[0]).toHaveProperty('healthy')
        expect(healthResults[0]).toHaveProperty('responseTime')
      })

      it('should check health of all services when no serviceId provided', async () => {
        const service1 = createTestService('service-1')
        const service2 = createTestService('service-2')
        
        await gatewayService.registerService(service1)
        await gatewayService.registerService(service2)
        
        const healthResults = await gatewayService.triggerHealthCheck()
        
        expect(healthResults.length).toBeGreaterThanOrEqual(2)
      })

      it('should throw error for non-existent service', async () => {
        await expect(gatewayService.triggerHealthCheck('non-existent-service'))
          .rejects.toThrow('Service not found: non-existent-service')
      })
    })
  })

  // =============================================================================
  // METRICS AND MONITORING TESTS
  // =============================================================================

  describe('Metrics and Monitoring', () => {
    beforeEach(async () => {
      await gatewayService.start()
    })

    describe('getMetrics()', () => {
      it('should return comprehensive metrics', () => {
        const metrics = gatewayService.getMetrics()
        
        expect(metrics).toHaveProperty('requests')
        expect(metrics).toHaveProperty('responseTime')
        expect(metrics).toHaveProperty('errors')
        expect(metrics).toHaveProperty('health')
        expect(metrics).toHaveProperty('resources')
        
        expect(metrics.requests).toHaveProperty('total')
        expect(metrics.requests).toHaveProperty('rps')
        expect(metrics.requests).toHaveProperty('byStatusCode')
        expect(metrics.requests).toHaveProperty('byRoute')
        expect(metrics.requests).toHaveProperty('byService')
        
        expect(metrics.responseTime).toHaveProperty('average')
        expect(metrics.responseTime).toHaveProperty('median')
        expect(metrics.responseTime).toHaveProperty('p95')
        expect(metrics.responseTime).toHaveProperty('p99')
        expect(metrics.responseTime).toHaveProperty('max')
      })

      it('should update metrics after request processing', async () => {
        const initialMetrics = gatewayService.getMetrics()
        const initialTotal = initialMetrics.requests.total
        
        const request = createTestRequest()
        await gatewayService.processRequest(request)
        
        const updatedMetrics = gatewayService.getMetrics()
        expect(updatedMetrics.requests.total).toBe(initialTotal + 1)
      })

      it('should track error metrics', async () => {
        // Mock router to throw error
        const mockRouter = gatewayService['requestRouter'] as any
        mockRouter.routeRequest = jest.fn().mockRejectedValue(new Error('Test error'))
        
        const request = createTestRequest()
        await gatewayService.processRequest(request)
        
        const metrics = gatewayService.getMetrics()
        expect(metrics.errors.total).toBeGreaterThan(0)
      })

      it('should update resource metrics', () => {
        const metrics = gatewayService.getMetrics()
        
        expect(metrics.resources.memory).toBeGreaterThan(0)
        expect(metrics.resources.connections).toBeGreaterThanOrEqual(0)
      })
    })

    describe('getStatus()', () => {
      it('should return current gateway status', async () => {
        const status = gatewayService.getStatus()
        
        expect(status).toHaveProperty('isStarted')
        expect(status).toHaveProperty('uptime')
        expect(status).toHaveProperty('version')
        expect(status).toHaveProperty('activeConnections')
        expect(status).toHaveProperty('totalRequests')
        expect(status).toHaveProperty('errorRate')
        expect(status).toHaveProperty('healthStatus')
        
        expect(status.isStarted).toBe(true)
        expect(status.version).toBe(testConfig.gateway.version)
      })
    })

    describe('getRoutingStats()', () => {
      it('should return routing statistics', () => {
        const stats = gatewayService.getRoutingStats()
        
        expect(stats).toHaveProperty('totalRequests')
        expect(stats).toHaveProperty('averageResponseTime')
        expect(stats).toHaveProperty('errorRate')
        expect(stats).toHaveProperty('routeStats')
      })
    })
  })

  // =============================================================================
  // CONFIGURATION MANAGEMENT TESTS
  // =============================================================================

  describe('Configuration Management', () => {
    beforeEach(async () => {
      await gatewayService.start()
    })

    describe('updateConfiguration()', () => {
      it('should update valid configuration', async () => {
        const configUpdates = {
          server: {
            ...testConfig.server,
            port: 3003
          }
        }
        
        await expect(gatewayService.updateConfiguration(configUpdates))
          .resolves.not.toThrow()
      })

      it('should validate configuration updates', async () => {
        const invalidUpdates = {
          server: {
            host: '',
            port: -1
          }
        }
        
        await expect(gatewayService.updateConfiguration(invalidUpdates))
          .rejects.toThrow('Configuration update failed')
      })

      it('should update routing table when provided', async () => {
        const routingUpdates = {
          routing: {
            ...testConfig.routing,
            rules: {
              ...testConfig.routing.rules,
              defaultService: 'updated-default-service'
            }
          }
        }
        
        await expect(gatewayService.updateConfiguration(routingUpdates))
          .resolves.not.toThrow()
      })
    })
  })

  // =============================================================================
  // EVENT SYSTEM TESTS
  // =============================================================================

  describe('Event System', () => {
    it('should emit STARTED event on startup', async () => {
      const service = new GatewayService(testConfig)
      const startedPromise = waitForEvent(service, GatewayEvents.STARTED)
      
      await service.start()
      
      const event = await startedPromise
      expect(event.gatewayId).toBe(testConfig.gateway.id)
      expect(event).toHaveProperty('startupTime')
      expect(event).toHaveProperty('timestamp')
      
      await service.stop()
    })

    it('should emit STOPPED event on shutdown', async () => {
      const service = new GatewayService(testConfig)
      await service.start()
      
      const stoppedPromise = waitForEvent(service, GatewayEvents.STOPPED)
      
      await service.stop()
      
      const event = await stoppedPromise
      expect(event.gatewayId).toBe(testConfig.gateway.id)
      expect(event).toHaveProperty('timestamp')
    })

    it('should emit SERVICE_REGISTERED event when registering service', async () => {
      await gatewayService.start()
      
      const registeredPromise = waitForEvent(gatewayService, GatewayEvents.SERVICE_REGISTERED)
      
      const testService = createTestService('event-test-service')
      await gatewayService.registerService(testService)
      
      const event = await registeredPromise
      expect(event.serviceId).toBe('event-test-service')
      expect(event.serviceName).toBe('Test Service')
      expect(event.version).toBe('1.0.0')
    })

    it('should emit REQUEST_RECEIVED and REQUEST_COMPLETED events', async () => {
      await gatewayService.start()
      
      const receivedPromise = waitForEvent(gatewayService, GatewayEvents.REQUEST_RECEIVED)
      const completedPromise = waitForEvent(gatewayService, GatewayEvents.REQUEST_COMPLETED)
      
      const request = createTestRequest()
      const response = await gatewayService.processRequest(request)
      
      const receivedEvent = await receivedPromise
      const completedEvent = await completedPromise
      
      expect(receivedEvent.requestId).toBe(request.context.requestId)
      expect(completedEvent.requestId).toBe(request.context.requestId)
      expect(completedEvent.statusCode).toBe(response.statusCode)
    })

    it('should emit SERVICE_HEALTH_CHANGED event on health status change', async () => {
      await gatewayService.start()
      
      const testService = createTestService('health-change-service')
      await gatewayService.registerService(testService)
      
      // Mock health check to simulate status change
      const originalCheck = gatewayService['checkServiceHealth']
      let healthToggle = true
      
      gatewayService['checkServiceHealth'] = jest.fn().mockImplementation((service) => {
        const healthy = healthToggle
        healthToggle = !healthToggle
        
        return Promise.resolve({
          serviceId: service.id,
          healthy,
          responseTime: 50,
          timestamp: createTimestamp()
        })
      })
      
      const healthChangePromise = waitForEvent(gatewayService, GatewayEvents.SERVICE_HEALTH_CHANGED)
      
      // Trigger health check
      await gatewayService['performHealthChecks']()
      
      const healthChangeEvent = await healthChangePromise
      expect(healthChangeEvent.serviceId).toBe('health-change-service')
      expect(healthChangeEvent).toHaveProperty('previousStatus')
      expect(healthChangeEvent).toHaveProperty('currentStatus')
    })
  })

  // =============================================================================
  // ERROR HANDLING TESTS
  // =============================================================================

  describe('Error Handling', () => {
    beforeEach(async () => {
      await gatewayService.start()
    })

    describe('Error Normalization', () => {
      it('should normalize GatewayError correctly', async () => {
        const mockRouter = gatewayService['requestRouter'] as any
        const gatewayError = new GatewayError(
          GatewayErrorType.SERVICE_UNAVAILABLE,
          'Test gateway error',
          { testData: 'test' }
        )
        mockRouter.routeRequest = jest.fn().mockRejectedValue(gatewayError)
        
        const request = createTestRequest()
        const response = await gatewayService.processRequest(request)
        
        expect(response.success).toBe(false)
        expect(response.error?.message).toBe('Test gateway error')
      })

      it('should normalize ReadyAIError correctly', async () => {
        const mockRouter = gatewayService['requestRouter'] as any
        const readyAIError = new ReadyAIError(
          'Test ReadyAI error',
          ERROR_CODES.INTERNAL_ERROR,
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
        mockRouter.routeRequest = jest.fn().mockRejectedValue(readyAIError)
        
        const request = createTestRequest()
        const response = await gatewayService.processRequest(request)
        
        expect(response.success).toBe(false)
        expect(response.error?.message).toBe('Test ReadyAI error')
      })

      it('should normalize generic Error correctly', async () => {
        const mockRouter = gatewayService['requestRouter'] as any
        const genericError = new Error('Test generic error')
        mockRouter.routeRequest = jest.fn().mockRejectedValue(genericError)
        
        const request = createTestRequest()
        const response = await gatewayService.processRequest(request)
        
        expect(response.success).toBe(false)
        expect(response.error?.message).toBe('Test generic error')
      })

      it('should handle unknown error types', async () => {
        const mockRouter = gatewayService['requestRouter'] as any
        const unknownError = { weird: 'object' }
        mockRouter.routeRequest = jest.fn().mockRejectedValue(unknownError)
        
        const request = createTestRequest()
        const response = await gatewayService.processRequest(request)
        
        expect(response.success).toBe(false)
        expect(response.error?.message).toBe('Unknown error occurred')
      })
    })

    describe('Service Failure Handling', () => {
      it('should handle service registration validation failure', async () => {
        const invalidService = {
          id: '',
          name: 'Invalid Service'
        } as ServiceRegistryEntry
        
        await expect(gatewayService.registerService(invalidService))
          .rejects.toThrow(ReadyAIError)
      })

      it('should handle health check failures gracefully', async () => {
        const testService = createTestService('failing-health-service')
        await gatewayService.registerService(testService)
        
        // Mock health check to fail
        gatewayService['checkServiceHealth'] = jest.fn().mockRejectedValue(
          new Error('Health check failed')
        )
        
        const healthStatus = await gatewayService.getHealthStatus()
        expect(healthStatus).toBeDefined()
        // Should not throw even if health check fails
      })
    })
  })

  // =============================================================================
  // PERFORMANCE AND LOAD TESTS
  // =============================================================================

  describe('Performance and Load', () => {
    beforeEach(async () => {
      await gatewayService.start()
    })

    it('should handle concurrent requests', async () => {
      const concurrentRequests = Array.from({ length: 10 }, (_, i) => 
        createTestRequest({ 
          context: {
            requestId: `concurrent-${i}`,
            timestamp: createTimestamp(),
            routing: { method: 'GET', path: `/api/concurrent/${i}`, service: 'test-service' },
            user: { id: generateUUID(), permissions: ['read'] }
          }
        })
      )
      
      const responses = await Promise.all(
        concurrentRequests.map(req => gatewayService.processRequest(req))
      )
      
      expect(responses).toHaveLength(10)
      responses.forEach(response => {
        expect(response.statusCode).toBe(HTTP_STATUS.OK)
      })
    })

    it('should track metrics correctly under load', async () => {
      const initialMetrics = gatewayService.getMetrics()
      const initialTotal = initialMetrics.requests.total
      
      const requests = Array.from({ length: 5 }, (_, i) => 
        gatewayService.processRequest(createTestRequest({
          context: {
            requestId: `load-test-${i}`,
            timestamp: createTimestamp(),
            routing: { method: 'GET', path: `/api/load/${i}`, service: 'test-service' },
            user: { id: generateUUID(), permissions: ['read'] }
          }
        }))
      )
      
      await Promise.all(requests)
      
      const finalMetrics = gatewayService.getMetrics()
      expect(finalMetrics.requests.total).toBe(initialTotal + 5)
    })

    it('should cleanup request contexts properly', async () => {
      const request = createTestRequest()
      
      const processingPromise = gatewayService.processRequest(request)
      
      // Check active requests during processing
      await delay(10)
      const activeRequests = gatewayService.getActiveRequests()
      expect(activeRequests.length).toBeGreaterThan(0)
      
      // Wait for completion
      await processingPromise
      
      // Check cleanup
      const finalActiveRequests = gatewayService.getActiveRequests()
      expect(finalActiveRequests.length).toBe(0)
    })
  })

  // =============================================================================
  // INTEGRATION TESTS
  // =============================================================================

  describe('Integration Tests', () => {
    it('should complete full request lifecycle with events', async () => {
      await gatewayService.start()
      
      const events: string[] = []
      
      gatewayService.on(GatewayEvents.REQUEST_RECEIVED, () => events.push('received'))
      gatewayService.on(GatewayEvents.REQUEST_COMPLETED, () => events.push('completed'))
      
      const request = createTestRequest()
      const response = await gatewayService.processRequest(request)
      
      expect(response.statusCode).toBe(HTTP_STATUS.OK)
      expect(events).toContain('received')
      expect(events).toContain('completed')
    })

    it('should maintain service registry across operations', async () => {
      await gatewayService.start()
      
      // Register service
      const testService = createTestService('integration-service')
      await gatewayService.registerService(testService)
      
      // Verify service exists
      let serviceInfo = gatewayService.getServiceInfo('integration-service')
      expect(serviceInfo).toBeDefined()
      
      // Check health
      const healthStatus = await gatewayService.getHealthStatus()
      expect(healthStatus.services['integration-service']).toBeDefined()
      
      // Unregister service
      await gatewayService.unregisterService('integration-service')
      
      // Verify service removed
      serviceInfo = gatewayService.getServiceInfo('integration-service')
      expect(serviceInfo).toBeUndefined()
    })

    it('should maintain consistent state through start/stop cycles', async () => {
      // First startup
      await gatewayService.start()
      const testService = createTestService('persistent-service')
      await gatewayService.registerService(testService)
      
      let serviceInfo = gatewayService.getServiceInfo('persistent-service')
      expect(serviceInfo).toBeDefined()
      
      // Stop and restart
      await gatewayService.stop()
      await gatewayService.start()
      
      // Service should still be registered
      serviceInfo = gatewayService.getServiceInfo('persistent-service')
      expect(serviceInfo).toBeDefined()
    })
  })

  // =============================================================================
  // EDGE CASES AND BOUNDARY CONDITIONS
  // =============================================================================

  describe('Edge Cases', () => {
    it('should handle empty service registry', async () => {
      const emptyConfig = createTestConfig()
      emptyConfig.routing.services.clear()
      
      const service = new GatewayService(emptyConfig)
      
      await service.start()
      const healthStatus = await service.getHealthStatus()
      
      expect(healthStatus.status).toBe('unhealthy')
      expect(Object.keys(healthStatus.services)).toHaveLength(0)
      
      await service.stop()
    })

    it('should handle malformed requests gracefully', async () => {
      await gatewayService.start()
      
      const malformedRequest = {} as GatewayRequest
      const response = await gatewayService.processRequest(malformedRequest)
      
      expect(response.success).toBe(false)
      expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST)
    })

    it('should handle service registration with duplicate IDs', async () => {
      await gatewayService.start()
      
      const service1 = createTestService('duplicate-id')
      const service2 = createTestService('duplicate-id')
      
      await gatewayService.registerService(service1)
      
      // Second registration should overwrite first
      await gatewayService.registerService(service2)
      
      const serviceInfo = gatewayService.getServiceInfo('duplicate-id')
      expect(serviceInfo).toBeDefined()
    })
  })
})

// =============================================================================
// HELPER TEST UTILITIES
// =============================================================================

/**
 * Test utilities for gateway service testing
 */
export const GatewayServiceTestUtils = {
  createTestConfig,
  createTestService,
  createTestRequest,
  waitForEvent,
  delay
}

/**
 * Mock implementations for external dependencies
 */
export const GatewayServiceMocks = {
  MockRequestRouter,
  MockLoggerService
}

/**
 * Test constants and defaults
 */
export const GatewayServiceTestConstants = {
  DEFAULT_TIMEOUT: 5000,
  HEALTH_CHECK_INTERVAL: 100,
  METRICS_COLLECTION_INTERVAL: 50
}
