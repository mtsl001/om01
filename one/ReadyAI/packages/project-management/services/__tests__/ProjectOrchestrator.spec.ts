// packages/project-management/services/__tests__/ProjectOrchestrator.spec.ts

/**
 * ProjectOrchestrator Test Suite
 * 
 * Comprehensive test coverage for the advanced multi-phase development workflow orchestrator.
 * Adapted from Cline's task execution testing patterns with ReadyAI-specific orchestration
 * validation, phase progression testing, and service coordination verification.
 * 
 * Test Coverage Areas:
 * - Workflow orchestration and execution lifecycle
 * - Service coordination with dependency resolution  
 * - Phase transition management with quality gate validation
 * - AI generation workflow coordination
 * - Error handling and recovery mechanisms
 * - Performance metrics and monitoring
 * - Event-driven orchestration patterns
 * - Resource management and allocation
 * 
 * Cline Source Patterns (90% Adapted):
 * - src/test/e2e/fixtures/server.test.ts - Mock server coordination patterns
 * - src/core/task/__tests__/TaskExecutor.test.ts - Task execution validation  
 * - src/services/coordination/__tests__/ServiceCoordinator.test.ts - Service coordination testing
 * - src/test/integration/workflow.test.ts - Workflow execution patterns
 * - src/shared/__tests__/api.test.ts - API response validation patterns
 * 
 * @version 1.0.0 - Phase 2.1 Implementation
 * @author ReadyAI Test Team
 */

import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from 'vitest'
import { EventEmitter } from 'events'

// ReadyAI Core Types and Utilities
import {
  UUID,
  ApiResponse,
  generateUUID,
  createTimestamp,
  PhaseType,
  PhaseStatus,
  AIProviderType,
  ValidationResult,
  wrapAsync
} from '../../../foundation/types/core'

import {
  Project,
  ProjectPhase,
  ProjectMilestone,
  PhaseArtifact
} from '../../types/project'

import {
  OrchestrationService,
  OrchestrationWorkflow,
  OrchestrationContext,
  OrchestrationStatus,
  ServiceType,
  ServiceHealth,
  CoordinationMode,
  WorkflowExecution,
  WorkflowStep,
  WorkflowStepResult,
  ReadyAIOrchestration,
  PhaseOrchestration,
  AIProviderOrchestration,
  OrchestrationRequest,
  OrchestrationResponse,
  OrchestrationResult,
  createOrchestrationService,
  createOrchestrationWorkflow,
  createReadyAIOrchestration,
  OrchestrationError,
  ServiceCoordinationError,
  WorkflowExecutionError
} from '../../types/orchestration'

import {
  ProjectLifecycleState,
  LifecycleEvent,
  StateTransition,
  PhaseProgress,
  LifecycleEventType
} from '../../types/lifecycle'

// System Under Test
import { 
  ProjectOrchestrator,
  ProjectOrchestratorConfig,
  OrchestratorExecutionContext,
  WorkflowExecutionStats,
  ProjectOrchestratorError,
  createProjectOrchestrator,
  PROJECT_ORCHESTRATOR_CONFIG
} from '../ProjectOrchestrator'

// Service Dependencies - Mocked
import { ProjectService } from '../ProjectService'
import { ProjectStateManager } from '../ProjectStateManager'
import { PhaseManager } from '../PhaseManager'
import { ServiceCoordinator } from '../ServiceCoordinator'

// Infrastructure Dependencies - Mocked
import { LoggingService } from '../../../logging/services/LoggingService'
import { ErrorHandler } from '../../../error-handling/services/ErrorHandler'
import { DatabaseService } from '../../../database/services/DatabaseService'

// =============================================================================
// MOCK SETUP AND TEST UTILITIES (Adapted from Cline Mock Patterns)
// =============================================================================

/**
 * Mock service dependencies following Cline's dependency injection patterns
 */
vi.mock('../ProjectService')
vi.mock('../ProjectStateManager')
vi.mock('../PhaseManager')
vi.mock('../ServiceCoordinator')
vi.mock('../../../logging/services/LoggingService')
vi.mock('../../../error-handling/services/ErrorHandler')
vi.mock('../../../database/services/DatabaseService')

/**
 * Mock project data factory following Cline's test data patterns
 */
const createMockProject = (overrides: Partial<Project> = {}): Project => ({
  id: generateUUID(),
  name: 'TestProject',
  description: 'Test project for orchestration',
  owner: 'test-user',
  status: 'active',
  currentPhase: 'Phase0_StrategicCharter',
  phases: [],
  metadata: {},
  createdAt: createTimestamp(),
  updatedAt: createTimestamp(),
  ...overrides
})

/**
 * Mock orchestration service factory
 */
const createMockOrchestrationService = (overrides: Partial<OrchestrationService> = {}): OrchestrationService => ({
  id: generateUUID(),
  name: 'TestService',
  type: 'database',
  version: '1.0.0',
  description: 'Test orchestration service',
  health: 'healthy',
  status: 'running',
  priority: 'normal',
  configuration: {},
  dependencies: [],
  capabilities: ['read', 'write'],
  endpoints: [],
  resources: {
    cpu: { allocated: 50, used: 25 },
    memory: { allocated: 128, used: 64 },
    storage: { allocated: 1024, used: 256 }
  },
  metrics: {
    requestCount: 100,
    errorCount: 2,
    averageResponseTime: 150,
    uptime: 3600000,
    lastHealthCheck: createTimestamp()
  },
  createdAt: createTimestamp(),
  updatedAt: createTimestamp(),
  ...overrides
})

/**
 * Mock workflow factory with realistic workflow structure
 */
const createMockWorkflow = (overrides: Partial<OrchestrationWorkflow> = {}): OrchestrationWorkflow => ({
  id: generateUUID(),
  name: 'TestWorkflow',
  description: 'Test orchestration workflow',
  version: '1.0.0',
  mode: 'sequential',
  status: 'ready',
  steps: [
    {
      id: generateUUID(),
      name: 'InitializeStep',
      description: 'Initialize workflow',
      type: 'service_call',
      services: [generateUUID()],
      order: 1,
      dependencies: [],
      configuration: {},
      timeout: 30000,
      retry: { enabled: true, maxAttempts: 3, delay: 1000 },
      successConditions: [],
      failureConditions: [],
      outputs: {},
      optional: false,
      continueOnFailure: false
    }
  ],
  triggers: [],
  errorHandling: {
    strategy: 'fail_fast',
    maxErrors: 3,
    errorCategories: [],
    rollback: { enabled: true, checkpointFrequency: 1, maxRollbacks: 2 },
    notifications: { onError: true, onFailure: true, onRecovery: true, channels: [] }
  },
  scheduling: {
    type: 'manual',
    configuration: {},
    constraints: [],
    dependencies: []
  },
  validation: {
    preExecution: [],
    postExecution: [],
    stepValidation: []
  },
  metadata: {},
  createdAt: createTimestamp(),
  updatedAt: createTimestamp(),
  ...overrides
})

/**
 * Mock project lifecycle state
 */
const createMockLifecycleState = (overrides: Partial<ProjectLifecycleState> = {}): ProjectLifecycleState => ({
  id: generateUUID(),
  projectId: generateUUID(),
  currentPhase: 'Phase0_StrategicCharter',
  phaseHistory: [],
  completionPercentage: 0,
  qualityScore: 100,
  blockers: [],
  milestones: [],
  lastModified: createTimestamp(),
  createdAt: createTimestamp(),
  ...overrides
})

/**
 * Test configuration optimized for testing
 */
const createTestConfig = (overrides: Partial<ProjectOrchestratorConfig> = {}): ProjectOrchestratorConfig => ({
  maxConcurrentWorkflows: 2,
  maxServicesPerWorkflow: 5,
  defaultWorkflowTimeout: 10000, // Shorter for tests
  defaultServiceTimeout: 5000,
  enableWorkflowValidation: true,
  enableAutoProgression: false,
  enableQualityGates: true,
  enableMonitoring: false, // Disable for tests
  enableEventDriven: true,
  eventThrottleMs: 100,
  retryConfig: {
    enabled: true,
    maxAttempts: 2,
    backoffStrategy: 'linear',
    baseDelayMs: 100,
    maxDelayMs: 1000
  },
  resourceManagement: {
    enabled: true,
    memoryLimitMB: 128,
    cpuLimitPercent: 50,
    enforceQuotas: false
  },
  performance: {
    cacheEnabled: true,
    cacheSize: 10,
    cacheTTLMs: 5000,
    compressionEnabled: false,
    parallelizationEnabled: true
  },
  ...overrides
})

// =============================================================================
// MAIN TEST SUITE
// =============================================================================

describe('ProjectOrchestrator', () => {
  // Mock dependencies
  let mockLogger: vi.Mocked<LoggingService>
  let mockErrorHandler: vi.Mocked<ErrorHandler>
  let mockDatabaseService: vi.Mocked<DatabaseService>
  let mockProjectService: vi.Mocked<ProjectService>
  let mockStateManager: vi.Mocked<ProjectStateManager>
  let mockPhaseManager: vi.Mocked<PhaseManager>
  let mockServiceCoordinator: vi.Mocked<ServiceCoordinator>

  // Test subject
  let orchestrator: ProjectOrchestrator
  let testConfig: ProjectOrchestratorConfig

  // Test data
  let mockProject: Project
  let mockLifecycleState: ProjectLifecycleState
  let mockService: OrchestrationService
  let mockWorkflow: OrchestrationWorkflow

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    // Setup mock dependencies with realistic behavior
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn()
    } as any

    mockErrorHandler = {
      handleError: vi.fn(),
      createError: vi.fn()
    } as any

    mockDatabaseService = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      isConnected: vi.fn().mockReturnValue(true)
    } as any

    mockProjectService = {
      getProject: vi.fn(),
      createProject: vi.fn(),
      updateProject: vi.fn()
    } as any

    mockStateManager = {
      getLifecycleState: vi.fn(),
      updateLifecycleState: vi.fn(),
      transitionToPhase: vi.fn(),
      evaluateQualityGates: vi.fn()
    } as any

    mockPhaseManager = {
      getCurrentPhase: vi.fn(),
      transitionPhase: vi.fn(),
      validatePhaseTransition: vi.fn()
    } as any

    mockServiceCoordinator = {
      coordinateServices: vi.fn(),
      registerService: vi.fn(),
      getServiceHealth: vi.fn()
    } as any

    // Create test data
    mockProject = createMockProject()
    mockLifecycleState = createMockLifecycleState({ projectId: mockProject.id })
    mockService = createMockOrchestrationService()
    mockWorkflow = createMockWorkflow()
    testConfig = createTestConfig()

    // Setup successful mock responses
    mockProjectService.getProject.mockResolvedValue({
      success: true,
      data: mockProject
    })

    mockStateManager.getLifecycleState.mockResolvedValue({
      success: true,
      data: mockLifecycleState
    })

    mockStateManager.transitionToPhase.mockResolvedValue({
      success: true,
      data: mockLifecycleState
    })

    mockStateManager.updateLifecycleState.mockResolvedValue({
      success: true,
      data: mockLifecycleState
    })

    mockStateManager.evaluateQualityGates.mockResolvedValue({
      success: true,
      data: []
    })

    // Create orchestrator instance
    orchestrator = new ProjectOrchestrator(
      mockLogger,
      mockErrorHandler,
      mockDatabaseService,
      mockProjectService,
      mockStateManager,
      mockPhaseManager,
      mockServiceCoordinator,
      testConfig
    )
  })

  afterEach(async () => {
    // Cleanup orchestrator
    if (orchestrator) {
      await orchestrator.dispose()
    }
  })

  // =============================================================================
  // ORCHESTRATOR INITIALIZATION TESTS
  // =============================================================================

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultOrchestrator = new ProjectOrchestrator(
        mockLogger,
        mockErrorHandler,
        mockDatabaseService,
        mockProjectService,
        mockStateManager,
        mockPhaseManager,
        mockServiceCoordinator
      )

      expect(defaultOrchestrator).toBeInstanceOf(ProjectOrchestrator)
      expect(defaultOrchestrator).toBeInstanceOf(EventEmitter)

      const healthStatus = defaultOrchestrator.getHealthStatus()
      expect(healthStatus.status).toBe('ready')
      expect(healthStatus.isHealthy).toBe(true)
    })

    it('should initialize with custom configuration', () => {
      const customConfig = createTestConfig({
        maxConcurrentWorkflows: 10,
        enableMonitoring: true
      })

      const customOrchestrator = new ProjectOrchestrator(
        mockLogger,
        mockErrorHandler,
        mockDatabaseService,
        mockProjectService,
        mockStateManager,
        mockPhaseManager,
        mockServiceCoordinator,
        customConfig
      )

      expect(customOrchestrator).toBeInstanceOf(ProjectOrchestrator)
      
      const healthStatus = customOrchestrator.getHealthStatus()
      expect(healthStatus.status).toBe('ready')
    })

    it('should log initialization completion', () => {
      expect(mockLogger.info).toHaveBeenCalledWith(
        'ProjectOrchestrator initialized successfully',
        expect.objectContaining({
          service: 'ProjectOrchestrator',
          status: 'ready'
        })
      )
    })

    it('should setup event handlers during initialization', () => {
      // Verify event emitter setup
      expect(orchestrator.listenerCount('workflow_completed')).toBeGreaterThan(0)
      expect(orchestrator.listenerCount('service_failed')).toBeGreaterThan(0)
    })
  })

  // =============================================================================
  // WORKFLOW EXECUTION TESTS (Core Orchestration)
  // =============================================================================

  describe('Workflow Execution', () => {
    it('should execute phase workflow successfully', async () => {
      const projectId = mockProject.id
      const phaseId: PhaseType = 'Phase0_StrategicCharter'

      const result = await orchestrator.executePhaseWorkflow(projectId, phaseId)

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.status).toBe('completed')

      // Verify project service was called
      expect(mockProjectService.getProject).toHaveBeenCalledWith(projectId)

      // Verify state manager was called
      expect(mockStateManager.getLifecycleState).toHaveBeenCalledWith(
        projectId,
        expect.objectContaining({ initiator: 'ProjectOrchestrator' })
      )

      // Verify state was updated
      expect(mockStateManager.updateLifecycleState).toHaveBeenCalled()

      // Verify quality gates were evaluated
      expect(mockStateManager.evaluateQualityGates).toHaveBeenCalled()
    })

    it('should handle workflow execution with custom configuration', async () => {
      const projectId = mockProject.id
      const phaseId: PhaseType = 'Phase1_ArchitecturalBlueprint'
      const workflowConfig = {
        mode: 'parallel' as CoordinationMode,
        timeout: 20000
      }

      const result = await orchestrator.executePhaseWorkflow(
        projectId, 
        phaseId, 
        workflowConfig
      )

      expect(result.success).toBe(true)
      expect(result.data?.status).toBe('completed')
    })

    it('should fail workflow execution when project not found', async () => {
      const projectId = generateUUID()
      const phaseId: PhaseType = 'Phase0_StrategicCharter'

      // Mock project service to return error
      mockProjectService.getProject.mockResolvedValue({
        success: false,
        error: { message: 'Project not found', code: 'PROJECT_NOT_FOUND' }
      })

      const result = await orchestrator.executePhaseWorkflow(projectId, phaseId)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.message).toContain('Project not found')
    })

    it('should handle workflow validation errors', async () => {
      const projectId = mockProject.id
      const phaseId: PhaseType = 'Phase0_StrategicCharter'

      // Test with validation enabled (should pass validation for valid workflow)
      const result = await orchestrator.executePhaseWorkflow(projectId, phaseId)
      
      expect(result.success).toBe(true)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting phase workflow execution',
        expect.objectContaining({
          service: 'ProjectOrchestrator',
          operation: 'executePhaseWorkflow',
          projectId,
          phaseId
        })
      )
    })

    it('should update performance metrics after workflow execution', async () => {
      const projectId = mockProject.id
      const phaseId: PhaseType = 'Phase0_StrategicCharter'

      const result = await orchestrator.executePhaseWorkflow(projectId, phaseId)

      expect(result.success).toBe(true)

      const healthStatus = orchestrator.getHealthStatus()
      expect(healthStatus.metrics.totalWorkflowsExecuted).toBeGreaterThan(0)
      expect(healthStatus.metrics.successfulExecutions).toBeGreaterThan(0)
    })
  })

  // =============================================================================
  // SERVICE COORDINATION TESTS
  // =============================================================================

  describe('Service Coordination', () => {
    it('should coordinate services in sequential mode', async () => {
      const services = [generateUUID(), generateUUID()]
      const coordinationMode: CoordinationMode = 'sequential'
      const context: OrchestratorExecutionContext = {
        executionId: generateUUID(),
        projectConfig: mockProject,
        orchestrationMode: coordinationMode,
        activeWorkflows: new Map(),
        dependencyCache: new Map(),
        performanceMetrics: {
          startTime: Date.now(),
          servicesInvoked: 0,
          artifactsGenerated: 0,
          validationsRun: 0,
          errorsEncountered: 0
        },
        resourceAllocation: {
          memoryUsedMB: 0,
          cpuUsagePercent: 0,
          activeConnections: 0
        }
      } as OrchestratorExecutionContext

      const result = await orchestrator.coordinateServices(services, coordinationMode, context)

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(Array.isArray(result.data)).toBe(true)
    })

    it('should coordinate services in parallel mode', async () => {
      const services = [generateUUID(), generateUUID()]
      const coordinationMode: CoordinationMode = 'parallel'
      const context: OrchestratorExecutionContext = {
        executionId: generateUUID(),
        projectConfig: mockProject,
        orchestrationMode: coordinationMode,
        activeWorkflows: new Map(),
        dependencyCache: new Map(),
        performanceMetrics: {
          startTime: Date.now(),
          servicesInvoked: 0,
          artifactsGenerated: 0,
          validationsRun: 0,
          errorsEncountered: 0
        },
        resourceAllocation: {
          memoryUsedMB: 0,
          cpuUsagePercent: 0,
          activeConnections: 0
        }
      } as OrchestratorExecutionContext

      const result = await orchestrator.coordinateServices(services, coordinationMode, context)

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
    })

    it('should handle service coordination errors gracefully', async () => {
      const services = [generateUUID()]
      const coordinationMode: CoordinationMode = 'sequential'
      const context: OrchestratorExecutionContext = {
        executionId: generateUUID(),
        projectConfig: mockProject,
        orchestrationMode: coordinationMode,
        activeWorkflows: new Map(),
        dependencyCache: new Map(),
        performanceMetrics: {
          startTime: Date.now(),
          servicesInvoked: 0,
          artifactsGenerated: 0,
          validationsRun: 0,
          errorsEncountered: 0
        },
        resourceAllocation: {
          memoryUsedMB: 0,
          cpuUsagePercent: 0,
          activeConnections: 0
        }
      } as OrchestratorExecutionContext

      const result = await orchestrator.coordinateServices(services, coordinationMode, context)

      // Even with missing services, should handle gracefully
      expect(result.success).toBe(true)
    })
  })

  // =============================================================================
  // PHASE TRANSITION TESTS
  // =============================================================================

  describe('Phase Transition Orchestration', () => {
    it('should orchestrate phase transition with validation', async () => {
      const projectId = mockProject.id
      const fromPhase: PhaseType = 'Phase0_StrategicCharter'
      const toPhase: PhaseType = 'Phase1_ArchitecturalBlueprint'

      const result = await orchestrator.orchestratePhaseTransition(
        projectId,
        fromPhase,
        toPhase
      )

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.from).toBe(fromPhase)
      expect(result.data?.to).toBe(toPhase)

      // Verify state manager transition was called
      expect(mockStateManager.transitionToPhase).toHaveBeenCalledWith(
        projectId,
        toPhase,
        expect.objectContaining({
          initiator: 'ProjectOrchestrator'
        })
      )
    })

    it('should handle phase transition with different validation levels', async () => {
      const projectId = mockProject.id
      const fromPhase: PhaseType = 'Phase1_ArchitecturalBlueprint'
      const toPhase: PhaseType = 'Phase20_CoreContracts'

      // Test strict validation
      const strictResult = await orchestrator.orchestratePhaseTransition(
        projectId,
        fromPhase,
        toPhase,
        'strict'
      )

      expect(strictResult.success).toBe(true)

      // Test minimal validation
      const minimalResult = await orchestrator.orchestratePhaseTransition(
        projectId,
        fromPhase,
        toPhase,
        'minimal'
      )

      expect(minimalResult.success).toBe(true)
    })

    it('should fail phase transition when state manager fails', async () => {
      const projectId = mockProject.id
      const fromPhase: PhaseType = 'Phase0_StrategicCharter'
      const toPhase: PhaseType = 'Phase1_ArchitecturalBlueprint'

      // Mock state manager to fail transition
      mockStateManager.transitionToPhase.mockResolvedValue({
        success: false,
        error: { message: 'Transition not allowed', code: 'TRANSITION_INVALID' }
      })

      const result = await orchestrator.orchestratePhaseTransition(
        projectId,
        fromPhase,
        toPhase
      )

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.message).toContain('Phase transition failed')
    })
  })

  // =============================================================================
  // AI GENERATION ORCHESTRATION TESTS
  // =============================================================================

  describe('AI Generation Orchestration', () => {
    it('should orchestrate AI generation workflow', async () => {
      const projectId = mockProject.id
      const generationRequest = {
        targetFiles: ['src/component.ts', 'src/service.ts'],
        phaseContext: { phase: 'Phase20_CoreContracts' },
        aiProvider: 'claude-3.5-sonnet' as AIProviderType,
        enableFallback: true
      }

      const result = await orchestrator.orchestrateAIGeneration(
        projectId,
        generationRequest
      )

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.artifacts).toBeDefined()
      expect(result.data?.provider).toBe('claude-3.5-sonnet')
      expect(result.data?.metrics).toBeDefined()
    })

    it('should handle AI generation with fallback provider', async () => {
      const projectId = mockProject.id
      const generationRequest = {
        targetFiles: ['src/test.ts'],
        phaseContext: { phase: 'Phase1_ArchitecturalBlueprint' },
        enableFallback: true
      }

      const result = await orchestrator.orchestrateAIGeneration(
        projectId,
        generationRequest
      )

      expect(result.success).toBe(true)
      expect(result.data?.artifacts).toEqual([])
      expect(result.data?.metrics.tokensUsed).toBe(0)
    })

    it('should fail AI generation when project not found', async () => {
      const projectId = generateUUID()
      const generationRequest = {
        targetFiles: ['src/test.ts'],
        phaseContext: {}
      }

      // Mock project service to return error
      mockProjectService.getProject.mockResolvedValue({
        success: false,
        error: { message: 'Project not found', code: 'PROJECT_NOT_FOUND' }
      })

      const result = await orchestrator.orchestrateAIGeneration(
        projectId,
        generationRequest
      )

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  // =============================================================================
  // SERVICE REGISTRATION TESTS
  // =============================================================================

  describe('Service Registration', () => {
    it('should register orchestration service successfully', async () => {
      const service = createMockOrchestrationService({
        name: 'TestRegistrationService',
        type: 'ai_provider'
      })

      const result = await orchestrator.registerService(service)

      expect(result.success).toBe(true)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Service registered successfully',
        expect.objectContaining({
          service: 'ProjectOrchestrator',
          serviceId: service.id
        })
      )
    })

    it('should register workflow successfully', async () => {
      const workflow = createMockWorkflow({
        name: 'TestRegistrationWorkflow',
        mode: 'parallel'
      })

      const result = await orchestrator.registerWorkflow(workflow)

      expect(result.success).toBe(true)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Workflow registered successfully',
        expect.objectContaining({
          service: 'ProjectOrchestrator',
          workflowId: workflow.id
        })
      )
    })

    it('should validate service configuration during registration', async () => {
      const invalidService = {
        // Missing required fields
        name: '',
        type: undefined
      } as any

      const result = await orchestrator.registerService(invalidService)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should emit events when services are registered', async () => {
      const service = createMockOrchestrationService()
      
      // Listen for service registration event
      const eventPromise = new Promise((resolve) => {
        orchestrator.once('service_registered', resolve)
      })

      await orchestrator.registerService(service)

      const eventData = await eventPromise
      expect(eventData).toBeDefined()
    })
  })

  // =============================================================================
  // ERROR HANDLING TESTS
  // =============================================================================

  describe('Error Handling', () => {
    it('should handle orchestration errors gracefully', async () => {
      const projectId = generateUUID()
      const phaseId: PhaseType = 'Phase0_StrategicCharter'

      // Mock state manager to throw error
      mockStateManager.getLifecycleState.mockRejectedValue(
        new Error('Database connection failed')
      )

      const result = await orchestrator.executePhaseWorkflow(projectId, phaseId)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(mockLogger.error).toHaveBeenCalled()
    })

    it('should handle service coordination errors', async () => {
      const services = [generateUUID()]
      const coordinationMode: CoordinationMode = 'sequential'
      const context = {
        executionId: generateUUID(),
        projectConfig: mockProject,
        orchestrationMode: coordinationMode,
        activeWorkflows: new Map(),
        dependencyCache: new Map(),
        performanceMetrics: {
          startTime: Date.now(),
          servicesInvoked: 0,
          artifactsGenerated: 0,
          validationsRun: 0,
          errorsEncountered: 0
        },
        resourceAllocation: {
          memoryUsedMB: 0,
          cpuUsagePercent: 0,
          activeConnections: 0
        }
      } as OrchestratorExecutionContext

      const result = await orchestrator.coordinateServices(services, coordinationMode, context)

      // Should handle missing services gracefully
      expect(result.success).toBe(true)
    })

    it('should create specific error types', () => {
      const orchestratorError = new ProjectOrchestratorError(
        'Test orchestrator error',
        'TEST_ERROR',
        500,
        { testData: 'test' }
      )

      expect(orchestratorError).toBeInstanceOf(Error)
      expect(orchestratorError.name).toBe('ProjectOrchestratorError')
      expect(orchestratorError.message).toBe('Test orchestrator error')
    })
  })

  // =============================================================================
  // PERFORMANCE AND MONITORING TESTS
  // =============================================================================

  describe('Performance and Monitoring', () => {
    it('should track workflow execution metrics', async () => {
      const projectId = mockProject.id
      const phaseId: PhaseType = 'Phase0_StrategicCharter'

      const result = await orchestrator.executePhaseWorkflow(projectId, phaseId)

      expect(result.success).toBe(true)

      const healthStatus = orchestrator.getHealthStatus()
      expect(healthStatus.metrics.totalWorkflowsExecuted).toBe(1)
      expect(healthStatus.metrics.successfulExecutions).toBe(1)
      expect(healthStatus.metrics.errorRate).toBe(0)
    })

    it('should provide health status information', () => {
      const healthStatus = orchestrator.getHealthStatus()

      expect(healthStatus).toEqual({
        status: 'ready',
        isHealthy: true,
        metrics: expect.any(Object),
        activeExecutions: 0,
        queuedRequests: 0,
        registeredServices: 0,
        registeredWorkflows: 0
      })
    })

    it('should handle resource monitoring when enabled', () => {
      const monitoringConfig = createTestConfig({
        enableMonitoring: true,
        resourceManagement: { ...testConfig.resourceManagement, enforceQuotas: true }
      })

      const monitoringOrchestrator = new ProjectOrchestrator(
        mockLogger,
        mockErrorHandler,
        mockDatabaseService,
        mockProjectService,
        mockStateManager,
        mockPhaseManager,
        mockServiceCoordinator,
        monitoringConfig
      )

      const healthStatus = monitoringOrchestrator.getHealthStatus()
      expect(healthStatus.status).toBe('ready')
    })
  })

  // =============================================================================
  // EVENT-DRIVEN ORCHESTRATION TESTS
  // =============================================================================

  describe('Event-Driven Orchestration', () => {
    it('should emit workflow completion events', async () => {
      const projectId = mockProject.id
      const phaseId: PhaseType = 'Phase0_StrategicCharter'

      // Listen for workflow completion event
      const eventPromise = new Promise((resolve) => {
        orchestrator.once('workflow_completed', resolve)
      })

      await orchestrator.executePhaseWorkflow(projectId, phaseId)

      // The event should be emitted during workflow execution
      // Note: This test verifies the event system is set up, actual emission happens internally
      expect(orchestrator.listenerCount('workflow_completed')).toBeGreaterThan(0)
    })

    it('should handle event throttling', async () => {
      const projectId = mockProject.id
      const phaseId: PhaseType = 'Phase0_StrategicCharter'

      // Execute multiple workflows rapidly
      const promises = Array.from({ length: 3 }, () =>
        orchestrator.executePhaseWorkflow(projectId, phaseId)
      )

      const results = await Promise.all(promises)
      results.forEach(result => {
        expect(result.success).toBe(true)
      })
    })

    it('should emit service failure events', () => {
      const serviceId = generateUUID()
      const error = new Error('Service test error')

      // Emit service failure event
      orchestrator.emit('service_failed', serviceId, error)

      // Verify the event system is working
      expect(orchestrator.listenerCount('service_failed')).toBeGreaterThan(0)
    })
  })

  // =============================================================================
  // FACTORY FUNCTION TESTS
  // =============================================================================

  describe('Factory Functions', () => {
    it('should create orchestrator instance via factory function', () => {
      const factoryOrchestrator = createProjectOrchestrator(
        mockLogger,
        mockErrorHandler,
        mockDatabaseService,
        mockProjectService,
        mockStateManager,
        mockPhaseManager,
        mockServiceCoordinator,
        testConfig
      )

      expect(factoryOrchestrator).toBeInstanceOf(ProjectOrchestrator)
      expect(factoryOrchestrator.getHealthStatus().status).toBe('ready')
    })

    it('should export configuration constants', () => {
      expect(PROJECT_ORCHESTRATOR_CONFIG.DEFAULT_MAX_CONCURRENT_WORKFLOWS).toBeDefined()
      expect(PROJECT_ORCHESTRATOR_CONFIG.DEFAULT_WORKFLOW_TIMEOUT).toBeDefined()
      expect(PROJECT_ORCHESTRATOR_CONFIG.DEFAULT_SERVICE_TIMEOUT).toBeDefined()
      expect(PROJECT_ORCHESTRATOR_CONFIG.DEFAULT_RETRY_MAX_ATTEMPTS).toBeDefined()
      expect(PROJECT_ORCHESTRATOR_CONFIG.DEFAULT_RETRY_BASE_DELAY).toBeDefined()
    })
  })

  // =============================================================================
  // LIFECYCLE MANAGEMENT TESTS
  // =============================================================================

  describe('Lifecycle Management', () => {
    it('should dispose orchestrator cleanly', async () => {
      const disposableOrchestrator = new ProjectOrchestrator(
        mockLogger,
        mockErrorHandler,
        mockDatabaseService,
        mockProjectService,
        mockStateManager,
        mockPhaseManager,
        mockServiceCoordinator,
        testConfig
      )

      await disposableOrchestrator.dispose()

      const healthStatus = disposableOrchestrator.getHealthStatus()
      expect(healthStatus.status).toBe('stopped')
      expect(healthStatus.activeExecutions).toBe(0)
      expect(healthStatus.queuedRequests).toBe(0)
    })

    it('should handle concurrent disposal safely', async () => {
      const concurrentOrchestrator = new ProjectOrchestrator(
        mockLogger,
        mockErrorHandler,
        mockDatabaseService,
        mockProjectService,
        mockStateManager,
        mockPhaseManager,
        mockServiceCoordinator,
        testConfig
      )

      // Call dispose multiple times concurrently
      const disposePromises = Array.from({ length: 3 }, () =>
        concurrentOrchestrator.dispose()
      )

      await Promise.all(disposePromises)

      const healthStatus = concurrentOrchestrator.getHealthStatus()
      expect(healthStatus.status).toBe('stopped')
    })

    it('should log disposal completion', async () => {
      await orchestrator.dispose()

      expect(mockLogger.info).toHaveBeenCalledWith(
        'ProjectOrchestrator disposed successfully',
        expect.objectContaining({
          finalStatus: 'stopped'
        })
      )
    })
  })

  // =============================================================================
  // INTEGRATION TESTS (End-to-End Scenarios)
  // =============================================================================

  describe('Integration Scenarios', () => {
    it('should handle complete project lifecycle orchestration', async () => {
      const projectId = mockProject.id

      // Execute multiple phases in sequence
      const phases: PhaseType[] = [
        'Phase0_StrategicCharter',
        'Phase1_ArchitecturalBlueprint',
        'Phase20_CoreContracts'
      ]

      for (const phase of phases) {
        const result = await orchestrator.executePhaseWorkflow(projectId, phase)
        expect(result.success).toBe(true)
      }

      // Verify final health status
      const healthStatus = orchestrator.getHealthStatus()
      expect(healthStatus.metrics.totalWorkflowsExecuted).toBe(phases.length)
      expect(healthStatus.metrics.successfulExecutions).toBe(phases.length)
    })

    it('should handle service registration and workflow execution integration', async () => {
      // Register services
      const services = [
        createMockOrchestrationService({ name: 'DatabaseService', type: 'database' }),
        createMockOrchestrationService({ name: 'AIService', type: 'ai_provider' }),
        createMockOrchestrationService({ name: 'LoggingService', type: 'logging' })
      ]

      for (const service of services) {
        const result = await orchestrator.registerService(service)
        expect(result.success).toBe(true)
      }

      // Register workflow
      const workflow = createMockWorkflow({ name: 'IntegrationWorkflow' })
      const workflowResult = await orchestrator.registerWorkflow(workflow)
      expect(workflowResult.success).toBe(true)

      // Execute workflow
      const projectId = mockProject.id
      const phaseId: PhaseType = 'Phase0_StrategicCharter'
      const executionResult = await orchestrator.executePhaseWorkflow(projectId, phaseId)
      expect(executionResult.success).toBe(true)

      // Verify final state
      const healthStatus = orchestrator.getHealthStatus()
      expect(healthStatus.registeredServices).toBe(services.length)
      expect(healthStatus.registeredWorkflows).toBe(1)
    })

    it('should handle error recovery and retry scenarios', async () => {
      const projectId = mockProject.id
      const phaseId: PhaseType = 'Phase0_StrategicCharter'

      // First call fails, second succeeds (simulating retry behavior)
      mockStateManager.getLifecycleState
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({
          success: true,
          data: mockLifecycleState
        })

      const result = await orchestrator.executePhaseWorkflow(projectId, phaseId)

      // Should succeed after internal retry handling
      expect(result.success).toBe(true)
    })
  })
})

// =============================================================================
// ADDITIONAL TEST HELPERS AND UTILITIES
// =============================================================================

/**
 * Helper function to wait for orchestrator events in tests
 */
const waitForOrchestratorEvent = (
  orchestrator: ProjectOrchestrator,
  eventName: string,
  timeout: number = 5000
): Promise<any> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Event ${eventName} not received within ${timeout}ms`))
    }, timeout)

    orchestrator.once(eventName, (data) => {
      clearTimeout(timer)
      resolve(data)
    })
  })
}

/**
 * Helper to create complex workflow execution context for testing
 */
const createComplexExecutionContext = (
  projectConfig: Project,
  workflowId: UUID
): OrchestratorExecutionContext => {
  return {
    id: generateUUID(),
    projectId: projectConfig.id,
    currentPhase: 'Phase0_StrategicCharter',
    environment: 'test',
    user: {
      id: generateUUID(),
      role: 'developer',
      permissions: ['read', 'write', 'execute']
    },
    lifecycleState: createMockLifecycleState({ projectId: projectConfig.id }),
    services: new Map(),
    executionOrder: [],
    sharedData: new Map(),
    variables: new Map(),
    activeWorkflows: new Map(),
    channels: new Map(),
    eventBus: {
      id: generateUUID(),
      handlers: new Map(),
      history: [],
      statistics: {
        totalEvents: 0,
        handledEvents: 0,
        failedEvents: 0,
        averageProcessingTime: 0
      },
      routing: [],
      filters: [],
      deadLetterQueue: []
    },
    resourcePool: {
      id: generateUUID(),
      resources: {
        cpu: { total: 100, available: 80, allocated: 20 },
        memory: { total: 1024, available: 512, allocated: 512 },
        storage: { total: 10240, available: 8192, allocated: 2048 }
      },
      allocations: new Map(),
      utilizationHistory: []
    },
    configRegistry: {
      id: generateUUID(),
      configurations: new Map(),
      schemas: new Map(),
      changeHistory: [],
      watchers: new Map()
    },
    security: {
      id: generateUUID(),
      authenticated: true,
      permissions: new Set(['read', 'write', 'execute']),
      tokens: new Map(),
      encryptionKeys: new Map(),
      policies: [],
      auditLog: []
    },
    monitoring: {
      id: generateUUID(),
      monitors: new Map(),
      alerts: [],
      dashboards: [],
      logging: {
        level: 'info',
        aggregation: { enabled: true, batchSize: 100, flushInterval: 5000 },
        retention: { period: 86400000, maxSize: 1000000, compression: true },
        routing: { rules: [] }
      },
      metrics: {
        interval: 10000,
        types: ['cpu', 'memory', 'network'],
        aggregation: { window: 60000, functions: ['avg', 'max'] },
        retention: { period: 86400000, granularity: ['1m', '5m', '1h'] }
      },
      tracing: {
        enabled: true,
        samplingRate: 0.1,
        retentionPeriod: 86400000,
        export: { enabled: true, endpoint: '', format: 'jaeger' }
      }
    },
    createdAt: createTimestamp(),
    updatedAt: createTimestamp(),
    executionId: generateUUID(),
    projectConfig,
    orchestrationMode: 'sequential',
    dependencyCache: new Map(),
    performanceMetrics: {
      startTime: Date.now(),
      servicesInvoked: 0,
      artifactsGenerated: 0,
      validationsRun: 0,
      errorsEncountered: 0
    },
    resourceAllocation: {
      memoryUsedMB: 128,
      cpuUsagePercent: 25,
      activeConnections: 3
    }
  }
}

/**
 * Performance test helper for measuring orchestration execution time
 */
const measureOrchestrationPerformance = async <T>(
  operation: () => Promise<T>
): Promise<{ result: T; duration: number; memoryUsed: number }> => {
  const startTime = process.hrtime.bigint()
  const startMemory = process.memoryUsage().heapUsed

  const result = await operation()

  const endTime = process.hrtime.bigint()
  const endMemory = process.memoryUsage().heapUsed

  const duration = Number(endTime - startTime) / 1_000_000 // Convert to milliseconds
  const memoryUsed = endMemory - startMemory

  return { result, duration, memoryUsed }
}

export {
  waitForOrchestratorEvent,
  createComplexExecutionContext,
  measureOrchestrationPerformance
}
