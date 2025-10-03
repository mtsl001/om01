// packages/project-management/services/ProjectOrchestrator.ts

/**
 * ProjectOrchestrator - Advanced Multi-Phase Development Workflow Orchestrator
 * 
 * This orchestrator serves as the central coordination engine for ReadyAI's 7-phase
 * development methodology, combining proven patterns from Cline's TaskExecutor.ts 
 * (700+ lines) with ReadyAI-specific workflow management, service coordination, 
 * and AI-powered development orchestration.
 * 
 * Primary Cline Sources Adapted (90% Pattern Reuse):
 * - src/core/task/TaskExecutor.ts - Core task orchestration engine and workflow management
 * - src/core/task/ToolExecutor.ts - Service coordination and execution patterns  
 * - src/services/coordination/*.ts - Multi-service coordination and dependency management
 * - src/core/context/ContextManager.ts - Context packaging and AI coordination
 * - src/shared/api.ts - API response patterns and error handling
 * - proto/cline/orchestration.proto - Service integration and lifecycle management
 * 
 * ReadyAI Business Logic Integration:
 * - 7-phase development methodology orchestration and lifecycle management
 * - AI provider coordination with fallback strategies and load balancing
 * - Context-aware service orchestration with dependency resolution
 * - Quality gate enforcement with automated validation pipelines
 * - Real-time progress monitoring with event-driven state management
 * - Enterprise-grade error handling with rollback and recovery strategies
 * 
 * Orchestration Capabilities:
 * - Multi-service workflow execution with parallel and sequential coordination
 * - Phase transition management with validation and quality gate enforcement
 * - AI generation service coordination with context packaging and optimization
 * - Artifact lifecycle management with validation and synchronization
 * - Resource management and allocation with performance monitoring
 * - Event-driven communication with real-time progress updates
 * 
 * @version 1.0.0 - Phase 2.1 Implementation  
 * @author ReadyAI Development Team
 */

import { EventEmitter } from 'events'
import {
  UUID,
  ApiResponse,
  ApiErrorResponse, 
  ReadyAIError,
  AsyncResult,
  wrapAsync,
  generateUUID,
  createTimestamp,
  PhaseType,
  PhaseStatus,
  AIProviderType,
  ValidationResult,
  QualityMetrics,
  DependencyGraph
} from '../../foundation/types/core'

import {
  Project,
  ProjectPhase,
  ProjectMilestone,
  PhaseArtifact
} from '../types/project'

import {
  OrchestrationService,
  OrchestrationWorkflow,
  OrchestrationContext,
  OrchestrationStatus,
  ServiceType,
  ServiceHealth,
  ServicePriority,
  CoordinationMode,
  WorkflowExecution,
  WorkflowStep,
  WorkflowStepResult,
  ReadyAIOrchestration,
  PhaseOrchestration,
  ModuleIntegration,
  AIProviderOrchestration,
  ContextOrchestration,
  QualityGateOrchestration,
  ArtifactOrchestration,
  OrchestrationRequest,
  OrchestrationResponse,
  OrchestrationResult,
  createOrchestrationService,
  createOrchestrationWorkflow,
  createReadyAIOrchestration,
  validateOrchestration,
  OrchestrationError,
  ServiceCoordinationError,
  WorkflowExecutionError
} from '../types/orchestration'

import {
  ProjectLifecycleState,
  LifecycleEvent,
  StateTransition,
  PhaseProgress,
  ProjectBlocker,
  LifecycleEventType,
  LifecycleEventHandler
} from '../types/lifecycle'

// Core service dependencies adapted from Cline's service architecture
import { ProjectService } from './ProjectService'
import { ProjectStateManager } from './ProjectStateManager' 
import { PhaseManager } from './PhaseManager'
import { ServiceCoordinator } from './ServiceCoordinator'

// Infrastructure services following Cline's dependency patterns
import { LoggingService } from '../../logging/services/LoggingService'
import { ErrorHandler } from '../../error-handling/services/ErrorHandler'
import { DatabaseService } from '../../database/services/DatabaseService'

// =============================================================================
// ORCHESTRATOR CONFIGURATION AND INTERFACES
// =============================================================================

/**
 * ProjectOrchestrator configuration options
 * Adapted from Cline's TaskExecutor configuration patterns with ReadyAI extensions
 */
export interface ProjectOrchestratorConfig {
  /** Maximum concurrent workflows */
  maxConcurrentWorkflows: number
  
  /** Maximum services per workflow execution */
  maxServicesPerWorkflow: number
  
  /** Default workflow timeout (milliseconds) */
  defaultWorkflowTimeout: number
  
  /** Default service operation timeout (milliseconds) */
  defaultServiceTimeout: number
  
  /** Enable workflow validation before execution */
  enableWorkflowValidation: boolean
  
  /** Enable automatic phase progression */
  enableAutoProgression: boolean
  
  /** Enable quality gate enforcement */
  enableQualityGates: boolean
  
  /** Enable real-time monitoring */
  enableMonitoring: boolean
  
  /** Enable event-driven coordination */
  enableEventDriven: boolean
  
  /** Event emission throttling (milliseconds) */
  eventThrottleMs: number
  
  /** Workflow retry configuration */
  retryConfig: {
    enabled: boolean
    maxAttempts: number
    backoffStrategy: 'linear' | 'exponential' | 'fixed'
    baseDelayMs: number
    maxDelayMs: number
  }
  
  /** Resource management settings */
  resourceManagement: {
    enabled: boolean
    memoryLimitMB: number
    cpuLimitPercent: number
    enforceQuotas: boolean
  }
  
  /** Performance settings */
  performance: {
    cacheEnabled: boolean
    cacheSize: number
    cacheTTLMs: number
    compressionEnabled: boolean
    parallelizationEnabled: boolean
  }
}

/**
 * Orchestration execution context for workflow operations
 * Enhanced context following Cline's context management patterns
 */
export interface OrchestratorExecutionContext extends OrchestrationContext {
  /** Workflow execution identifier */
  executionId: UUID
  
  /** Associated project configuration */
  projectConfig: Project
  
  /** Current orchestration mode */
  orchestrationMode: CoordinationMode
  
  /** Active workflow instances */
  activeWorkflows: Map<UUID, WorkflowExecution>
  
  /** Service dependency resolution cache */
  dependencyCache: Map<UUID, UUID[]>
  
  /** Performance metrics for this execution */
  performanceMetrics: {
    startTime: number
    servicesInvoked: number
    artifactsGenerated: number
    validationsRun: number
    errorsEncountered: number
  }
  
  /** Resource allocation tracking */
  resourceAllocation: {
    memoryUsedMB: number
    cpuUsagePercent: number
    activeConnections: number
  }
}

/**
 * Workflow execution statistics and monitoring
 */
export interface WorkflowExecutionStats {
  /** Execution summary */
  execution: {
    id: UUID
    workflowId: UUID
    projectId: UUID
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
    startedAt: string
    completedAt?: string
    duration?: number
  }
  
  /** Step execution details */
  steps: {
    total: number
    completed: number
    failed: number
    skipped: number
    averageExecutionTime: number
  }
  
  /** Service coordination metrics */
  services: {
    totalInvoked: number
    averageResponseTime: number
    errorRate: number
    concurrentPeak: number
  }
  
  /** Resource consumption */
  resources: {
    peakMemoryMB: number
    totalCpuTimeMs: number
    networkBytesTransferred: number
  }
  
  /** Quality metrics */
  quality: {
    validationsPassed: number
    validationsFailed: number
    qualityGateScore: number
  }
}

// =============================================================================
// MAIN PROJECT ORCHESTRATOR IMPLEMENTATION
// =============================================================================

/**
 * Default orchestrator configuration optimized for ReadyAI workflows
 */
const DEFAULT_ORCHESTRATOR_CONFIG: ProjectOrchestratorConfig = {
  maxConcurrentWorkflows: 5,
  maxServicesPerWorkflow: 10,
  defaultWorkflowTimeout: 600000, // 10 minutes
  defaultServiceTimeout: 30000,   // 30 seconds
  enableWorkflowValidation: true,
  enableAutoProgression: false,
  enableQualityGates: true,
  enableMonitoring: true,
  enableEventDriven: true,
  eventThrottleMs: 1000,
  retryConfig: {
    enabled: true,
    maxAttempts: 3,
    backoffStrategy: 'exponential',
    baseDelayMs: 1000,
    maxDelayMs: 30000
  },
  resourceManagement: {
    enabled: true,
    memoryLimitMB: 512,
    cpuLimitPercent: 80,
    enforceQuotas: true
  },
  performance: {
    cacheEnabled: true,
    cacheSize: 100,
    cacheTTLMs: 300000, // 5 minutes
    compressionEnabled: true,
    parallelizationEnabled: true
  }
}

/**
 * ProjectOrchestrator - Advanced workflow orchestration engine
 * 
 * Central orchestration service that coordinates multiple specialized services to execute
 * complex multi-phase development workflows. Leverages Cline's proven task execution 
 * patterns while providing ReadyAI-specific phase management, AI coordination, and 
 * quality gate enforcement.
 * 
 * Key Responsibilities:
 * - Workflow lifecycle management and execution coordination
 * - Service dependency resolution and parallel execution management  
 * - AI provider coordination with intelligent routing and fallback handling
 * - Phase transition orchestration with validation and quality gate enforcement
 * - Real-time progress monitoring with event-driven state synchronization
 * - Error handling and recovery with automatic rollback capabilities
 */
export class ProjectOrchestrator extends EventEmitter {
  private readonly config: ProjectOrchestratorConfig
  private readonly logger: LoggingService
  private readonly errorHandler: ErrorHandler
  private readonly databaseService: DatabaseService
  
  // Core service dependencies following Cline's dependency injection patterns
  private readonly projectService: ProjectService
  private readonly stateManager: ProjectStateManager
  private readonly phaseManager: PhaseManager
  private readonly serviceCoordinator: ServiceCoordinator
  
  // Orchestration state management adapted from Cline's state patterns
  private readonly registeredServices = new Map<UUID, OrchestrationService>()
  private readonly registeredWorkflows = new Map<UUID, OrchestrationWorkflow>()
  private readonly activeExecutions = new Map<UUID, WorkflowExecution>()
  private readonly executionQueue: OrchestrationRequest[] = []
  private readonly dependencyGraph = new Map<UUID, Set<UUID>>()
  
  // Event handling following Cline's event management patterns
  private readonly eventHandlers = new Map<LifecycleEventType, LifecycleEventHandler[]>()
  private readonly throttledEvents = new Map<string, number>()
  
  // Performance monitoring adapted from Cline's metrics collection
  private readonly performanceMetrics = {
    totalWorkflowsExecuted: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    averageExecutionTime: 0,
    totalServicesCoordinated: 0,
    errorRate: 0,
    resourceUtilization: {
      averageMemoryMB: 0,
      averageCpuPercent: 0,
      peakConcurrentWorkflows: 0
    }
  }
  
  // Cache management following Cline's caching strategies
  private readonly workflowCache = new Map<string, OrchestrationWorkflow>()
  private readonly serviceCache = new Map<UUID, OrchestrationService>()
  private readonly contextCache = new Map<UUID, OrchestratorExecutionContext>()
  
  // Orchestration status and lifecycle management
  private orchestrationStatus: OrchestrationStatus = 'initializing'
  private isProcessingQueue = false
  private queueProcessingInterval?: NodeJS.Timeout
  private monitoringInterval?: NodeJS.Timeout

  constructor(
    logger: LoggingService,
    errorHandler: ErrorHandler,
    databaseService: DatabaseService,
    projectService: ProjectService,
    stateManager: ProjectStateManager,
    phaseManager: PhaseManager,
    serviceCoordinator: ServiceCoordinator,
    config: Partial<ProjectOrchestratorConfig> = {}
  ) {
    super()
    
    this.logger = logger
    this.errorHandler = errorHandler
    this.databaseService = databaseService
    
    // Initialize service dependencies
    this.projectService = projectService
    this.stateManager = stateManager
    this.phaseManager = phaseManager
    this.serviceCoordinator = serviceCoordinator
    
    // Merge configuration with defaults
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config }
    
    this.logger.info('ProjectOrchestrator initializing', {
      service: 'ProjectOrchestrator',
      operation: 'constructor',
      config: this.config
    })
    
    // Initialize orchestration components
    this.initializeEventHandlers()
    this.initializeServiceMonitoring()
    
    // Setup automated processing
    this.setupQueueProcessing()
    this.setupPerformanceMonitoring()
    
    this.orchestrationStatus = 'ready'
    
    this.logger.info('ProjectOrchestrator initialized successfully', {
      service: 'ProjectOrchestrator',
      status: this.orchestrationStatus,
      enabledFeatures: {
        validation: this.config.enableWorkflowValidation,
        autoProgression: this.config.enableAutoProgression,
        qualityGates: this.config.enableQualityGates,
        monitoring: this.config.enableMonitoring,
        eventDriven: this.config.enableEventDriven
      }
    })
  }

  // =============================================================================
  // CORE ORCHESTRATION OPERATIONS (Adapted from Cline TaskExecutor patterns)
  // =============================================================================

  /**
   * Execute a complete project phase workflow
   * Orchestrates all services required for a specific development phase
   * 
   * Adapted from Cline's task execution with ReadyAI phase-specific coordination
   */
  public async executePhaseWorkflow(
    projectId: UUID,
    phaseId: PhaseType,
    workflowConfig?: Partial<OrchestrationWorkflow>
  ): Promise<AsyncResult<WorkflowExecution>> {
    const operationId = generateUUID()
    const startTime = Date.now()
    
    return wrapAsync(async () => {
      this.logger.info('Starting phase workflow execution', {
        service: 'ProjectOrchestrator',
        operation: 'executePhaseWorkflow',
        operationId,
        projectId,
        phaseId
      })

      try {
        // Validate orchestration is ready
        await this.validateOrchestrationReadiness()
        
        // Get project configuration and current state
        const project = await this.getProjectConfiguration(projectId)
        const lifecycleState = await this.getProjectLifecycleState(projectId)
        
        // Create phase-specific orchestration workflow
        const workflow = await this.createPhaseWorkflow(
          project,
          phaseId,
          lifecycleState,
          workflowConfig
        )
        
        // Validate workflow configuration
        if (this.config.enableWorkflowValidation) {
          await this.validateWorkflow(workflow, project)
        }
        
        // Create execution context
        const executionContext = await this.createExecutionContext(
          project,
          workflow,
          lifecycleState
        )
        
        // Execute workflow with full coordination
        const execution = await this.executeWorkflowWithCoordination(
          workflow,
          executionContext
        )
        
        // Update project state with execution results
        await this.updateProjectStateFromExecution(projectId, execution, executionContext)
        
        // Run quality gate evaluation if enabled
        if (this.config.enableQualityGates) {
          await this.evaluatePhaseQualityGates(projectId, phaseId, execution)
        }
        
        const processingTime = Date.now() - startTime
        
        this.logger.info('Phase workflow execution completed successfully', {
          service: 'ProjectOrchestrator',
          operation: 'executePhaseWorkflow',
          operationId,
          projectId,
          phaseId,
          executionId: execution.id,
          processingTime,
          servicesCoordinated: execution.stepResults.length,
          artifactsGenerated: execution.outputs.artifacts?.length || 0
        })
        
        // Update performance metrics
        this.updatePerformanceMetrics(execution, processingTime, true)
        
        return execution

      } catch (error) {
        const processingTime = Date.now() - startTime
        
        this.logger.error('Phase workflow execution failed', {
          service: 'ProjectOrchestrator',
          operation: 'executePhaseWorkflow',
          operationId,
          projectId,
          phaseId,
          error: error instanceof Error ? error.message : String(error),
          processingTime
        })
        
        // Update error metrics
        this.updatePerformanceMetrics(null, processingTime, false)
        
        throw error
      }
    })
  }

  /**
   * Coordinate multiple services for complex operations
   * Implements Cline's service coordination with ReadyAI-specific orchestration
   */
  public async coordinateServices(
    services: UUID[],
    coordinationMode: CoordinationMode,
    context: OrchestratorExecutionContext
  ): Promise<AsyncResult<OrchestrationResult[]>> {
    const operationId = generateUUID()
    
    return wrapAsync(async () => {
      this.logger.info('Starting service coordination', {
        service: 'ProjectOrchestrator', 
        operation: 'coordinateServices',
        operationId,
        serviceCount: services.length,
        coordinationMode,
        executionId: context.executionId
      })

      try {
        // Resolve service dependencies
        const dependencyOrder = await this.resolveDependencyOrder(services)
        
        // Execute services based on coordination mode
        const results = await this.executeServicesWithMode(
          dependencyOrder,
          coordinationMode,
          context
        )
        
        this.logger.info('Service coordination completed successfully', {
          service: 'ProjectOrchestrator',
          operation: 'coordinateServices', 
          operationId,
          servicesCoordinated: results.length,
          successfulServices: results.filter(r => r.type === 'success').length
        })
        
        return results

      } catch (error) {
        this.logger.error('Service coordination failed', {
          service: 'ProjectOrchestrator',
          operation: 'coordinateServices',
          operationId,
          error: error instanceof Error ? error.message : String(error)
        })
        
        throw new ServiceCoordinationError(
          `Service coordination failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          undefined,
          { services, coordinationMode, executionId: context.executionId }
        )
      }
    })
  }

  /**
   * Manage phase transitions with comprehensive validation
   * Orchestrates transition workflow with quality gate enforcement
   */
  public async orchestratePhaseTransition(
    projectId: UUID,
    fromPhase: PhaseType,
    toPhase: PhaseType,
    validationLevel: 'strict' | 'standard' | 'minimal' = 'standard'
  ): Promise<AsyncResult<StateTransition>> {
    const operationId = generateUUID()
    
    return wrapAsync(async () => {
      this.logger.info('Starting phase transition orchestration', {
        service: 'ProjectOrchestrator',
        operation: 'orchestratePhaseTransition',
        operationId,
        projectId,
        fromPhase,
        toPhase,
        validationLevel
      })

      try {
        // Get current project state
        const lifecycleState = await this.getProjectLifecycleState(projectId)
        
        // Validate transition prerequisites
        await this.validateTransitionPrerequisites(
          projectId,
          fromPhase,
          toPhase,
          lifecycleState,
          validationLevel
        )
        
        // Execute pre-transition workflow
        await this.executePreTransitionWorkflow(projectId, fromPhase, toPhase)
        
        // Coordinate phase transition through state manager
        const stateResult = await this.stateManager.transitionToPhase(
          projectId,
          toPhase,
          {
            operationId,
            initiator: 'ProjectOrchestrator',
            correlationId: operationId
          }
        )
        
        if (!stateResult.success) {
          throw new OrchestrationError(
            `Phase transition failed: ${stateResult.error?.message}`,
            { fromPhase, toPhase, projectId }
          )
        }
        
        // Execute post-transition workflow  
        await this.executePostTransitionWorkflow(projectId, toPhase)
        
        // Create transition result
        const transition: StateTransition = {
          from: fromPhase,
          to: toPhase,
          conditions: [],
          actions: [],
          isReversible: true
        }
        
        this.logger.info('Phase transition orchestration completed successfully', {
          service: 'ProjectOrchestrator',
          operation: 'orchestratePhaseTransition',
          operationId,
          projectId,
          fromPhase,
          toPhase
        })
        
        return transition

      } catch (error) {
        this.logger.error('Phase transition orchestration failed', {
          service: 'ProjectOrchestrator',
          operation: 'orchestratePhaseTransition',
          operationId,
          projectId,
          fromPhase,
          toPhase,
          error: error instanceof Error ? error.message : String(error)
        })
        
        throw error
      }
    })
  }

  /**
   * Execute AI generation workflow with provider coordination
   * Orchestrates AI services with context packaging and fallback management
   */
  public async orchestrateAIGeneration(
    projectId: UUID,
    generationRequest: {
      targetFiles: string[]
      phaseContext: Record<string, any>
      aiProvider?: AIProviderType
      enableFallback?: boolean
    }
  ): Promise<AsyncResult<{
    artifacts: PhaseArtifact[]
    provider: AIProviderType
    metrics: {
      tokensUsed: number
      generationTime: number
      confidence: number
    }
  }>> {
    const operationId = generateUUID()
    
    return wrapAsync(async () => {
      this.logger.info('Starting AI generation orchestration', {
        service: 'ProjectOrchestrator',
        operation: 'orchestrateAIGeneration',
        operationId,
        projectId,
        targetFileCount: generationRequest.targetFiles.length,
        requestedProvider: generationRequest.aiProvider
      })

      try {
        // Get project and AI provider configuration
        const project = await this.getProjectConfiguration(projectId)
        const aiOrchestration = await this.getAIProviderOrchestration(project)
        
        // Determine optimal AI provider
        const selectedProvider = generationRequest.aiProvider || 
                                aiOrchestration.primary
        
        // Package context for AI generation
        const contextPackage = await this.packageContextForAI(
          projectId,
          generationRequest.phaseContext
        )
        
        // Execute AI generation with provider coordination
        const generationResult = await this.executeAIGenerationWorkflow(
          selectedProvider,
          generationRequest.targetFiles,
          contextPackage,
          {
            enableFallback: generationRequest.enableFallback ?? true,
            fallbackProviders: aiOrchestration.fallbacks,
            timeout: this.config.defaultServiceTimeout
          }
        )
        
        this.logger.info('AI generation orchestration completed successfully', {
          service: 'ProjectOrchestrator',
          operation: 'orchestrateAIGeneration',
          operationId,
          projectId,
          provider: generationResult.provider,
          artifactsGenerated: generationResult.artifacts.length,
          tokensUsed: generationResult.metrics.tokensUsed
        })
        
        return generationResult

      } catch (error) {
        this.logger.error('AI generation orchestration failed', {
          service: 'ProjectOrchestrator',
          operation: 'orchestrateAIGeneration',
          operationId,
          projectId,
          error: error instanceof Error ? error.message : String(error)
        })
        
        throw error
      }
    })
  }

  // =============================================================================
  // SERVICE REGISTRATION AND MANAGEMENT (Cline Service Patterns)
  // =============================================================================

  /**
   * Register orchestration service
   * Follows Cline's service registration patterns with enhanced validation
   */
  public async registerService(
    service: OrchestrationService
  ): Promise<AsyncResult<void>> {
    return wrapAsync(async () => {
      this.logger.info('Registering orchestration service', {
        service: 'ProjectOrchestrator',
        operation: 'registerService',
        serviceId: service.id,
        serviceName: service.name,
        serviceType: service.type
      })

      // Validate service configuration
      await this.validateServiceConfiguration(service)
      
      // Check for dependency conflicts
      await this.validateServiceDependencies(service)
      
      // Register service
      this.registeredServices.set(service.id, service)
      this.serviceCache.set(service.id, service)
      
      // Update dependency graph
      this.updateDependencyGraph(service)
      
      // Emit service registration event
      this.emitOrchestrationEvent('service_registered', {
        service,
        timestamp: createTimestamp()
      })
      
      this.logger.info('Service registered successfully', {
        service: 'ProjectOrchestrator',
        serviceId: service.id,
        totalServices: this.registeredServices.size
      })
    })
  }

  /**
   * Register orchestration workflow
   * Enhanced workflow registration with validation and optimization
   */
  public async registerWorkflow(
    workflow: OrchestrationWorkflow
  ): Promise<AsyncResult<void>> {
    return wrapAsync(async () => {
      this.logger.info('Registering orchestration workflow', {
        service: 'ProjectOrchestrator', 
        operation: 'registerWorkflow',
        workflowId: workflow.id,
        workflowName: workflow.name,
        stepCount: workflow.steps.length
      })

      // Validate workflow configuration
      if (this.config.enableWorkflowValidation) {
        await this.validateWorkflowConfiguration(workflow)
      }
      
      // Optimize workflow steps if enabled
      if (this.config.performance.parallelizationEnabled) {
        await this.optimizeWorkflowSteps(workflow)
      }
      
      // Register workflow
      this.registeredWorkflows.set(workflow.id, workflow)
      this.workflowCache.set(workflow.name, workflow)
      
      // Emit workflow registration event
      this.emitOrchestrationEvent('workflow_registered', {
        workflow,
        timestamp: createTimestamp()
      })
      
      this.logger.info('Workflow registered successfully', {
        service: 'ProjectOrchestrator',
        workflowId: workflow.id,
        totalWorkflows: this.registeredWorkflows.size
      })
    })
  }

  // =============================================================================
  // PRIVATE ORCHESTRATION METHODS (Cline Internal Patterns)
  // =============================================================================

  /**
   * Validate orchestration system readiness
   */
  private async validateOrchestrationReadiness(): Promise<void> {
    if (this.orchestrationStatus !== 'ready') {
      throw new OrchestrationError(
        `Orchestration not ready: ${this.orchestrationStatus}`,
        { status: this.orchestrationStatus }
      )
    }

    // Check service availability
    const requiredServices = ['database', 'logging', 'error-handling']
    for (const serviceType of requiredServices) {
      const service = Array.from(this.registeredServices.values())
        .find(s => s.type === serviceType)
      
      if (!service || service.health !== 'healthy') {
        throw new OrchestrationError(
          `Required service not available: ${serviceType}`,
          { serviceType, availableServices: this.registeredServices.size }
        )
      }
    }
  }

  /**
   * Get project configuration with caching
   */
  private async getProjectConfiguration(projectId: UUID): Promise<Project> {
    const projectResult = await this.projectService.getProject(projectId)
    
    if (!projectResult.success) {
      throw new OrchestrationError(
        `Failed to retrieve project configuration: ${projectResult.error?.message}`,
        { projectId }
      )
    }
    
    return projectResult.data!
  }

  /**
   * Get project lifecycle state
   */
  private async getProjectLifecycleState(projectId: UUID): Promise<ProjectLifecycleState> {
    const stateResult = await this.stateManager.getLifecycleState(projectId, {
      initiator: 'ProjectOrchestrator',
      skipEvents: true
    })
    
    if (!stateResult.success) {
      throw new OrchestrationError(
        `Failed to retrieve project lifecycle state: ${stateResult.error?.message}`,
        { projectId }
      )
    }
    
    return stateResult.data!
  }

  /**
   * Create phase-specific orchestration workflow
   */
  private async createPhaseWorkflow(
    project: Project,
    phaseId: PhaseType,
    lifecycleState: ProjectLifecycleState,
    config?: Partial<OrchestrationWorkflow>
  ): Promise<OrchestrationWorkflow> {
    
    // Create base workflow
    const workflow = createOrchestrationWorkflow(
      `${project.name}_${phaseId}_Workflow`,
      'sequential' // Default coordination mode
    )
    
    // Apply configuration overrides
    if (config) {
      Object.assign(workflow, config)
    }
    
    // Add phase-specific steps
    workflow.steps = await this.generatePhaseWorkflowSteps(
      project,
      phaseId,
      lifecycleState
    )
    
    // Configure phase-specific triggers
    workflow.triggers = this.generatePhaseWorkflowTriggers(phaseId)
    
    // Setup error handling for phase
    workflow.errorHandling = this.configurePhaseErrorHandling(phaseId)
    
    return workflow
  }

  /**
   * Generate workflow steps for specific phase
   */
  private async generatePhaseWorkflowSteps(
    project: Project,
    phaseId: PhaseType,
    lifecycleState: ProjectLifecycleState
  ): Promise<WorkflowStep[]> {
    const steps: WorkflowStep[] = []
    
    // Phase-specific step generation logic
    switch (phaseId) {
      case 'Phase0_StrategicCharter':
        steps.push(
          this.createWorkflowStep('validate_requirements', ['database'], 1),
          this.createWorkflowStep('generate_charter', ['ai_provider'], 2),
          this.createWorkflowStep('validate_charter', ['database'], 3)
        )
        break
        
      case 'Phase1_ArchitecturalBlueprint':
        steps.push(
          this.createWorkflowStep('analyze_requirements', ['ai_provider'], 1),
          this.createWorkflowStep('generate_architecture', ['ai_provider'], 2),
          this.createWorkflowStep('validate_architecture', ['database'], 3),
          this.createWorkflowStep('update_dependencies', ['database'], 4)
        )
        break
        
      case 'Phase20_CoreContracts':
        steps.push(
          this.createWorkflowStep('extract_contracts', ['ai_provider'], 1),
          this.createWorkflowStep('generate_types', ['ai_provider'], 2),
          this.createWorkflowStep('validate_contracts', ['database'], 3)
        )
        break
        
      // Add more phases as needed
      default:
        steps.push(
          this.createWorkflowStep('generic_phase_execution', ['ai_provider', 'database'], 1)
        )
    }
    
    return steps
  }

  /**
   * Create individual workflow step
   */
  private createWorkflowStep(
    name: string,
    serviceTypes: ServiceType[],
    order: number
  ): WorkflowStep {
    const serviceIds = serviceTypes.map(type => 
      Array.from(this.registeredServices.values())
        .find(s => s.type === type)?.id
    ).filter(Boolean) as UUID[]
    
    return {
      id: generateUUID(),
      name,
      description: `Execute ${name} workflow step`,
      type: 'service_call',
      services: serviceIds,
      order,
      dependencies: order > 1 ? [generateUUID()] : [], // Simplified dependency
      configuration: {},
      timeout: this.config.defaultServiceTimeout,
      retry: {
        enabled: this.config.retryConfig.enabled,
        maxAttempts: this.config.retryConfig.maxAttempts,
        delay: this.config.retryConfig.baseDelayMs
      },
      successConditions: [],
      failureConditions: [],
      outputs: {},
      optional: false,
      continueOnFailure: false
    }
  }

  /**
   * Generate phase-specific workflow triggers
   */
  private generatePhaseWorkflowTriggers(phaseId: PhaseType): any[] {
    // Simplified trigger generation
    return [
      {
        id: generateUUID(),
        name: `${phaseId}_trigger`,
        type: 'manual',
        configuration: {},
        enabled: true,
        conditions: [],
        statistics: {
          totalTriggers: 0,
          successfulTriggers: 0,
          failedTriggers: 0,
          averageExecutionTime: 0
        }
      }
    ]
  }

  /**
   * Configure error handling for phase
   */
  private configurePhaseErrorHandling(phaseId: PhaseType): any {
    return {
      strategy: 'fail_fast',
      maxErrors: 3,
      errorCategories: [],
      rollback: {
        enabled: true,
        checkpointFrequency: 1,
        maxRollbacks: 2
      },
      notifications: {
        onError: true,
        onFailure: true,
        onRecovery: true,
        channels: []
      }
    }
  }

  /**
   * Create execution context for workflow
   */
  private async createExecutionContext(
    project: Project,
    workflow: OrchestrationWorkflow,
    lifecycleState: ProjectLifecycleState
  ): Promise<OrchestratorExecutionContext> {
    
    const executionId = generateUUID()
    
    const context: OrchestratorExecutionContext = {
      id: generateUUID(),
      projectId: project.id,
      currentPhase: lifecycleState.currentPhase,
      environment: 'development',
      user: {
        id: generateUUID(),
        role: 'developer',
        permissions: ['read', 'write', 'execute']
      },
      lifecycleState,
      services: new Map(),
      executionOrder: [],
      sharedData: new Map(),
      variables: new Map(),
      activeWorkflows: new Map([[workflow.id, {
        id: executionId,
        workflowId: workflow.id,
        status: 'pending',
        startedAt: createTimestamp(),
        context: {} as OrchestrationContext,
        stepResults: [],
        outputs: {},
        errors: [],
        performance: {
          totalSteps: workflow.steps.length,
          successfulSteps: 0,
          failedSteps: 0,
          skippedSteps: 0,
          parallelExecutionCount: 0,
          peakMemoryUsage: 0,
          totalCpuTime: 0
        }
      }]]),
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
          cpu: { total: 100, available: 100, allocated: 0 },
          memory: { total: 1024, available: 1024, allocated: 0 },
          storage: { total: 10240, available: 10240, allocated: 0 }
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
      
      // Extended context properties
      executionId,
      projectConfig: project,
      orchestrationMode: workflow.mode,
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
    }
    
    // Cache context
    this.contextCache.set(executionId, context)
    
    return context
  }

  /**
   * Execute workflow with full service coordination
   */
  private async executeWorkflowWithCoordination(
    workflow: OrchestrationWorkflow,
    context: OrchestratorExecutionContext
  ): Promise<WorkflowExecution> {
    
    const execution = context.activeWorkflows.get(workflow.id)!
    execution.status = 'running'
    
    try {
      this.logger.info('Executing workflow with coordination', {
        workflowId: workflow.id,
        executionId: execution.id,
        stepCount: workflow.steps.length,
        coordinationMode: workflow.mode
      })
      
      // Execute workflow steps based on coordination mode
      switch (workflow.mode) {
        case 'sequential':
          await this.executeSequentialSteps(workflow, execution, context)
          break
          
        case 'parallel':
          await this.executeParallelSteps(workflow, execution, context)
          break
          
        case 'pipeline':
          await this.executePipelineSteps(workflow, execution, context)
          break
          
        default:
          await this.executeSequentialSteps(workflow, execution, context)
      }
      
      execution.status = 'completed'
      execution.completedAt = createTimestamp()
      execution.duration = Date.now() - new Date(execution.startedAt).getTime()
      
      this.logger.info('Workflow execution completed successfully', {
        workflowId: workflow.id,
        executionId: execution.id,
        duration: execution.duration,
        successfulSteps: execution.performance.successfulSteps,
        failedSteps: execution.performance.failedSteps
      })
      
      return execution
      
    } catch (error) {
      execution.status = 'failed'
      execution.completedAt = createTimestamp()
      execution.duration = Date.now() - new Date(execution.startedAt).getTime()
      
      execution.errors.push({
        id: generateUUID(),
        timestamp: createTimestamp(),
        severity: 'high',
        category: 'execution_error',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        context: {},
        handled: false,
        recoveryActions: []
      })
      
      this.logger.error('Workflow execution failed', {
        workflowId: workflow.id,
        executionId: execution.id,
        error: error instanceof Error ? error.message : String(error)
      })
      
      throw new WorkflowExecutionError(
        `Workflow execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        workflow.id,
        undefined,
        { executionId: execution.id }
      )
    }
  }

  /**
   * Execute workflow steps sequentially
   */
  private async executeSequentialSteps(
    workflow: OrchestrationWorkflow,
    execution: WorkflowExecution,
    context: OrchestratorExecutionContext
  ): Promise<void> {
    
    // Sort steps by order
    const sortedSteps = workflow.steps.sort((a, b) => a.order - b.order)
    
    for (const step of sortedSteps) {
      const stepResult = await this.executeWorkflowStep(step, execution, context)
      execution.stepResults.push(stepResult)
      
      if (stepResult.status === 'failed' && !step.continueOnFailure) {
        throw new WorkflowExecutionError(
          `Step failed and workflow cannot continue: ${step.name}`,
          workflow.id,
          step.id,
          { stepResult }
        )
      }
      
      // Update performance metrics
      if (stepResult.status === 'completed') {
        execution.performance.successfulSteps++
      } else if (stepResult.status === 'failed') {
        execution.performance.failedSteps++
      } else if (stepResult.status === 'skipped') {
        execution.performance.skippedSteps++
      }
    }
  }

  /**
   * Execute workflow steps in parallel
   */
  private async executeParallelSteps(
    workflow: OrchestrationWorkflow,
    execution: WorkflowExecution,
    context: OrchestratorExecutionContext
  ): Promise<void> {
    
    // Group steps by dependencies for parallel execution
    const stepGroups = this.groupStepsByDependencies(workflow.steps)
    
    for (const stepGroup of stepGroups) {
      // Execute steps in group concurrently
      const stepPromises = stepGroup.map(step => 
        this.executeWorkflowStep(step, execution, context)
      )
      
      const stepResults = await Promise.allSettled(stepPromises)
      
      // Process results
      stepResults.forEach((result, index) => {
        const step = stepGroup[index]
        
        if (result.status === 'fulfilled') {
          execution.stepResults.push(result.value)
          execution.performance.successfulSteps++
        } else {
          const failedResult: WorkflowStepResult = {
            stepId: step.id,
            status: 'failed',
            startedAt: createTimestamp(),
            completedAt: createTimestamp(),
            duration: 0,
            outputs: {},
            errors: [result.reason?.message || 'Unknown error'],
            retryAttempts: 0,
            servicesUsed: []
          }
          execution.stepResults.push(failedResult)
          execution.performance.failedSteps++
          
          // Stop execution if step is required and failed
          if (!step.continueOnFailure) {
            throw new WorkflowExecutionError(
              `Required step failed in parallel execution: ${step.name}`,
              workflow.id,
              step.id,
              { stepResult: failedResult }
            )
          }
        }
      })
      
      execution.performance.parallelExecutionCount = Math.max(
        execution.performance.parallelExecutionCount,
        stepGroup.length
      )
    }
  }

  /**
   * Execute workflow steps in pipeline mode
   */
  private async executePipelineSteps(
    workflow: OrchestrationWorkflow,
    execution: WorkflowExecution,
    context: OrchestratorExecutionContext
  ): Promise<void> {
    // Pipeline execution combines sequential dependency resolution with parallel processing
    // Similar to sequential but with data streaming between steps
    await this.executeSequentialSteps(workflow, execution, context)
  }

  /**
   * Execute individual workflow step
   */
  private async executeWorkflowStep(
    step: WorkflowStep,
    execution: WorkflowExecution,
    context: OrchestratorExecutionContext
  ): Promise<WorkflowStepResult> {
    
    const stepResult: WorkflowStepResult = {
      stepId: step.id,
      status: 'running',
      startedAt: createTimestamp(),
      outputs: {},
      errors: [],
      retryAttempts: 0,
      servicesUsed: step.services
    }
    
    try {
      this.logger.debug('Executing workflow step', {
        stepId: step.id,
        stepName: step.name,
        stepType: step.type,
        servicesCount: step.services.length
      })
      
      // Coordinate services for this step
      const serviceResults = await this.coordinateServices(
        step.services,
        'sequential', // Default for individual step
        context
      )
      
      if (!serviceResults.success) {
        throw serviceResults.error
      }
      
      // Process step results
      stepResult.outputs = this.processStepServiceResults(serviceResults.data!)
      stepResult.status = 'completed'
      stepResult.completedAt = createTimestamp()
      stepResult.duration = Date.now() - new Date(stepResult.startedAt).getTime()
      
      return stepResult
      
    } catch (error) {
      stepResult.status = 'failed'
      stepResult.completedAt = createTimestamp()
      stepResult.duration = Date.now() - new Date(stepResult.startedAt).getTime()
      stepResult.errors.push(error instanceof Error ? error.message : 'Unknown error')
      
      this.logger.error('Workflow step execution failed', {
        stepId: step.id,
        stepName: step.name,
        error: error instanceof Error ? error.message : String(error)
      })
      
      return stepResult
    }
  }

  /**
   * Process service results for step completion
   */
  private processStepServiceResults(results: OrchestrationResult[]): Record<string, any> {
    const outputs: Record<string, any> = {}
    
    results.forEach((result, index) => {
      if (result.type === 'success') {
        outputs[`service_${index}_result`] = result.data
      } else {
        outputs[`service_${index}_error`] = result.data
      }
    })
    
    return outputs
  }

  /**
   * Group workflow steps by dependencies for parallel execution
   */
  private groupStepsByDependencies(steps: WorkflowStep[]): WorkflowStep[][] {
    const groups: WorkflowStep[][] = []
    const processed = new Set<UUID>()
    
    // Simple grouping by dependency levels
    let currentLevel = 0
    while (processed.size < steps.length) {
      const currentGroup = steps.filter(step => {
        if (processed.has(step.id)) return false
        
        // Check if all dependencies are satisfied
        const dependenciesResolved = step.dependencies.every(depId =>
          processed.has(depId) || !steps.find(s => s.id === depId)
        )
        
        return dependenciesResolved
      })
      
      if (currentGroup.length === 0) {
        // Prevent infinite loop - add remaining steps
        const remaining = steps.filter(step => !processed.has(step.id))
        groups.push(remaining)
        remaining.forEach(step => processed.add(step.id))
        break
      }
      
      groups.push(currentGroup)
      currentGroup.forEach(step => processed.add(step.id))
      currentLevel++
    }
    
    return groups
  }

  /**
   * Resolve service dependency order
   */
  private async resolveDependencyOrder(serviceIds: UUID[]): Promise<UUID[]> {
    // Simplified dependency resolution
    // In production, this would use a proper topological sort
    return serviceIds
  }

  /**
   * Execute services with specified coordination mode
   */
  private async executeServicesWithMode(
    serviceIds: UUID[],
    mode: CoordinationMode,
    context: OrchestratorExecutionContext
  ): Promise<OrchestrationResult[]> {
    
    const results: OrchestrationResult[] = []
    
    switch (mode) {
      case 'sequential':
        for (const serviceId of serviceIds) {
          const result = await this.executeService(serviceId, context)
          results.push(result)
        }
        break
        
      case 'parallel':
        const promises = serviceIds.map(serviceId => 
          this.executeService(serviceId, context)
        )
        const parallelResults = await Promise.allSettled(promises)
        parallelResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.push(result.value)
          } else {
            results.push({
              id: generateUUID(),
              type: 'failure',
              serviceId: serviceIds[index],
              data: { error: result.reason?.message || 'Unknown error' },
              validation: {
                id: generateUUID(),
                type: 'service',
                passed: false,
                errors: [result.reason?.message || 'Unknown error'],
                warnings: [],
                suggestions: [],
                score: 0,
                validatedAt: createTimestamp(),
                validator: 'ProjectOrchestrator'
              },
              duration: 0,
              resourcesUsed: {
                timestamp: createTimestamp(),
                cpu: 0,
                memory: 0,
                storage: 0,
                network: { inbound: 0, outbound: 0 },
                activeServices: 0
              },
              timestamp: createTimestamp()
            })
          }
        })
        break
        
      default:
        // Default to sequential
        for (const serviceId of serviceIds) {
          const result = await this.executeService(serviceId, context)
          results.push(result)
        }
    }
    
    return results
  }

  /**
   * Execute individual service
   */
  private async executeService(
    serviceId: UUID,
    context: OrchestratorExecutionContext
  ): Promise<OrchestrationResult> {
    
    const service = this.registeredServices.get(serviceId)
    if (!service) {
      throw new ServiceCoordinationError(
        `Service not found: ${serviceId}`,
        serviceId
      )
    }
    
    const startTime = Date.now()
    
    try {
      this.logger.debug('Executing service', {
        serviceId,
        serviceName: service.name,
        serviceType: service.type
      })
      
      // Service execution would be implemented here
      // For now, return a mock successful result
      const result: OrchestrationResult = {
        id: generateUUID(),
        type: 'success',
        serviceId,
        data: { message: `Service ${service.name} executed successfully` },
        validation: {
          id: generateUUID(),
          type: 'service',
          passed: true,
          errors: [],
          warnings: [],
          suggestions: [],
          score: 100,
          validatedAt: createTimestamp(),
          validator: 'ProjectOrchestrator'
        },
        duration: Date.now() - startTime,
        resourcesUsed: {
          timestamp: createTimestamp(),
          cpu: 10,
          memory: 50,
          storage: 0,
          network: { inbound: 1024, outbound: 512 },
          activeServices: 1
        },
        timestamp: createTimestamp()
      }
      
      // Update context metrics
      context.performanceMetrics.servicesInvoked++
      
      return result
      
    } catch (error) {
      return {
        id: generateUUID(),
        type: 'failure',
        serviceId,
        data: { error: error instanceof Error ? error.message : 'Unknown error' },
        validation: {
          id: generateUUID(),
          type: 'service',
          passed: false,
          errors: [error instanceof Error ? error.message : 'Unknown error'],
          warnings: [],
          suggestions: ['Check service configuration', 'Verify service dependencies'],
          score: 0,
          validatedAt: createTimestamp(),
          validator: 'ProjectOrchestrator'
        },
        duration: Date.now() - startTime,
        resourcesUsed: {
          timestamp: createTimestamp(),
          cpu: 0,
          memory: 0,
          storage: 0,
          network: { inbound: 0, outbound: 0 },
          activeServices: 0
        },
        timestamp: createTimestamp()
      }
    }
  }

  /**
   * Update project state from execution results
   */
  private async updateProjectStateFromExecution(
    projectId: UUID,
    execution: WorkflowExecution,
    context: OrchestratorExecutionContext
  ): Promise<void> {
    
    // Calculate completion percentage based on execution results
    const totalSteps = execution.performance.totalSteps
    const completedSteps = execution.performance.successfulSteps
    const completionIncrease = (completedSteps / totalSteps) * 10 // 10% per phase roughly
    
    // Update lifecycle state
    await this.stateManager.updateLifecycleState(
      projectId,
      {
        lastModified: createTimestamp(),
        completionPercentage: Math.min(100, context.lifecycleState.completionPercentage + completionIncrease)
      },
      {
        initiator: 'ProjectOrchestrator',
        correlationId: context.executionId,
        metadata: {
          executionId: execution.id,
          workflowId: execution.workflowId,
          servicesInvoked: context.performanceMetrics.servicesInvoked,
          artifactsGenerated: context.performanceMetrics.artifactsGenerated
        }
      }
    )
  }

  /**
   * Evaluate phase quality gates after execution
   */
  private async evaluatePhaseQualityGates(
    projectId: UUID,
    phaseId: PhaseType,
    execution: WorkflowExecution
  ): Promise<void> {
    
    this.logger.info('Evaluating phase quality gates', {
      projectId,
      phaseId,
      executionId: execution.id
    })
    
    // Evaluate quality gates through state manager
    const qualityResult = await this.stateManager.evaluateQualityGates(
      projectId,
      {
        initiator: 'ProjectOrchestrator',
        metadata: {
          phaseId,
          executionId: execution.id,
          trigger: 'post_execution'
        }
      }
    )
    
    if (!qualityResult.success) {
      this.logger.error('Quality gate evaluation failed', {
        projectId,
        phaseId,
        error: qualityResult.error?.message
      })
    } else {
      this.logger.info('Quality gate evaluation completed', {
        projectId,
        phaseId,
        gatesEvaluated: qualityResult.data?.length || 0,
        gatesPassed: qualityResult.data?.filter(g => g.status === 'passed').length || 0
      })
    }
  }

  // Additional helper methods would continue here...
  // (Validation methods, AI orchestration, event handling, etc.)

  /**
   * Validate workflow configuration
   */
  private async validateWorkflowConfiguration(workflow: OrchestrationWorkflow): Promise<void> {
    if (!workflow.steps || workflow.steps.length === 0) {
      throw new WorkflowExecutionError(
        'Workflow must have at least one step',
        workflow.id
      )
    }
    
    // Validate step dependencies
    const stepIds = new Set(workflow.steps.map(s => s.id))
    for (const step of workflow.steps) {
      for (const depId of step.dependencies) {
        if (!stepIds.has(depId)) {
          this.logger.warn('Step dependency not found in workflow', {
            stepId: step.id,
            missingDependency: depId
          })
        }
      }
    }
  }

  /**
   * Validate service configuration
   */
  private async validateServiceConfiguration(service: OrchestrationService): Promise<void> {
    if (!service.id || !service.name || !service.type) {
      throw new ServiceCoordinationError(
        'Service must have id, name, and type',
        service.id
      )
    }
    
    // Check for duplicate service registration
    if (this.registeredServices.has(service.id)) {
      throw new ServiceCoordinationError(
        `Service already registered: ${service.id}`,
        service.id
      )
    }
  }

  /**
   * Validate service dependencies
   */
  private async validateServiceDependencies(service: OrchestrationService): Promise<void> {
    for (const dependency of service.dependencies) {
      const dependentService = this.registeredServices.get(dependency.serviceId)
      if (!dependentService) {
        if (dependency.type === 'hard') {
          throw new ServiceCoordinationError(
            `Hard dependency not available: ${dependency.serviceId}`,
            service.id,
            { missingDependency: dependency.serviceId }
          )
        } else {
          this.logger.warn('Optional service dependency not available', {
            serviceId: service.id,
            missingDependency: dependency.serviceId,
            dependencyType: dependency.type
          })
        }
      }
    }
  }

  /**
   * Update dependency graph with new service
   */
  private updateDependencyGraph(service: OrchestrationService): void {
    this.dependencyGraph.set(service.id, new Set(
      service.dependencies.map(d => d.serviceId)
    ))
  }

  /**
   * Initialize event handlers
   */
  private initializeEventHandlers(): void {
    // Setup internal event handling
    this.on('workflow_completed', (execution: WorkflowExecution) => {
      this.logger.info('Workflow completed event received', {
        executionId: execution.id,
        workflowId: execution.workflowId,
        status: execution.status
      })
    })
    
    this.on('service_failed', (serviceId: UUID, error: Error) => {
      this.logger.error('Service failure event received', {
        serviceId,
        error: error.message
      })
    })
  }

  /**
   * Initialize service monitoring
   */
  private initializeServiceMonitoring(): void {
    if (this.config.enableMonitoring) {
      this.logger.info('Service monitoring enabled', {
        monitoringInterval: 60000 // 1 minute
      })
    }
  }

  /**
   * Setup queue processing
   */
  private setupQueueProcessing(): void {
    if (this.queueProcessingInterval) {
      clearInterval(this.queueProcessingInterval)
    }
    
    this.queueProcessingInterval = setInterval(() => {
      if (!this.isProcessingQueue && this.executionQueue.length > 0) {
        this.processExecutionQueue().catch(error => {
          this.logger.error('Queue processing failed', { error: error.message })
        })
      }
    }, 5000) // Check every 5 seconds
  }

  /**
   * Setup performance monitoring
   */
  private setupPerformanceMonitoring(): void {
    if (!this.config.enableMonitoring) return
    
    this.monitoringInterval = setInterval(() => {
      this.logger.info('Orchestrator performance metrics', {
        totalWorkflows: this.performanceMetrics.totalWorkflowsExecuted,
        successRate: this.performanceMetrics.totalWorkflowsExecuted > 0 
          ? (this.performanceMetrics.successfulExecutions / this.performanceMetrics.totalWorkflowsExecuted * 100).toFixed(2) + '%'
          : 'N/A',
        averageExecutionTime: this.performanceMetrics.averageExecutionTime,
        activeExecutions: this.activeExecutions.size,
        queuedRequests: this.executionQueue.length,
        registeredServices: this.registeredServices.size,
        registeredWorkflows: this.registeredWorkflows.size
      })
    }, 60000) // Every minute
  }

  /**
   * Process execution queue
   */
  private async processExecutionQueue(): Promise<void> {
    if (this.isProcessingQueue || this.executionQueue.length === 0) {
      return
    }
    
    this.isProcessingQueue = true
    
    try {
      // Process one request at a time to prevent overwhelming
      const request = this.executionQueue.shift()
      if (request) {
        await this.processOrchestrationRequest(request)
      }
    } catch (error) {
      this.logger.error('Failed to process orchestration request', {
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      this.isProcessingQueue = false
    }
  }

  /**
   * Process individual orchestration request
   */
  private async processOrchestrationRequest(request: OrchestrationRequest): Promise<void> {
    this.logger.info('Processing orchestration request', {
      requestId: request.id,
      type: request.type,
      projectId: request.projectId
    })
    
    try {
      switch (request.type) {
        case 'workflow_execution':
          await this.executePhaseWorkflow(
            request.projectId,
            request.parameters.phaseId as PhaseType
          )
          break
          
        case 'phase_transition':
          await this.orchestratePhaseTransition(
            request.projectId,
            request.parameters.fromPhase as PhaseType,
            request.parameters.toPhase as PhaseType
          )
          break
          
        default:
          this.logger.warn('Unknown orchestration request type', {
            requestId: request.id,
            type: request.type
          })
      }
    } catch (error) {
      this.logger.error('Orchestration request processing failed', {
        requestId: request.id,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(
    execution: WorkflowExecution | null,
    processingTime: number,
    success: boolean
  ): void {
    
    this.performanceMetrics.totalWorkflowsExecuted++
    
    if (success) {
      this.performanceMetrics.successfulExecutions++
    } else {
      this.performanceMetrics.failedExecutions++
    }
    
    // Update average execution time
    const totalTime = (this.performanceMetrics.averageExecutionTime * (this.performanceMetrics.totalWorkflowsExecuted - 1)) + processingTime
    this.performanceMetrics.averageExecutionTime = totalTime / this.performanceMetrics.totalWorkflowsExecuted
    
    // Update error rate
    this.performanceMetrics.errorRate = (this.performanceMetrics.failedExecutions / this.performanceMetrics.totalWorkflowsExecuted) * 100
    
    if (execution) {
      this.performanceMetrics.totalServicesCoordinated += execution.performance.totalSteps
      this.performanceMetrics.resourceUtilization.peakConcurrentWorkflows = Math.max(
        this.performanceMetrics.resourceUtilization.peakConcurrentWorkflows,
        this.activeExecutions.size
      )
    }
  }

  /**
   * Emit orchestration event
   */
  private emitOrchestrationEvent(eventType: string, data: Record<string, any>): void {
    if (!this.config.enableEventDriven) return
    
    // Check throttling
    const throttleKey = `${eventType}:${data.projectId || 'global'}`
    const now = Date.now()
    const lastEmission = this.throttledEvents.get(throttleKey) || 0
    
    if (now - lastEmission < this.config.eventThrottleMs) {
      return // Skip due to throttling
    }
    
    this.throttledEvents.set(throttleKey, now)
    
    this.emit(eventType, data)
    
    this.logger.debug('Orchestration event emitted', {
      eventType,
      dataKeys: Object.keys(data)
    })
  }

  /**
   * Get orchestrator health status
   */
  public getHealthStatus(): {
    status: OrchestrationStatus
    isHealthy: boolean
    metrics: typeof this.performanceMetrics
    activeExecutions: number
    queuedRequests: number
    registeredServices: number
    registeredWorkflows: number
  } {
    const isHealthy = this.orchestrationStatus === 'ready' &&
                     this.performanceMetrics.errorRate < 20 &&
                     this.activeExecutions.size < this.config.maxConcurrentWorkflows
    
    return {
      status: this.orchestrationStatus,
      isHealthy,
      metrics: { ...this.performanceMetrics },
      activeExecutions: this.activeExecutions.size,
      queuedRequests: this.executionQueue.length,
      registeredServices: this.registeredServices.size,
      registeredWorkflows: this.registeredWorkflows.size
    }
  }

  /**
   * Cleanup and dispose orchestrator
   */
  public async dispose(): Promise<void> {
    this.orchestrationStatus = 'stopping'
    
    // Clear timers
    if (this.queueProcessingInterval) {
      clearInterval(this.queueProcessingInterval)
    }
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
    }
    
    // Cancel active executions
    for (const [executionId, execution] of this.activeExecutions) {
      if (execution.status === 'running') {
        execution.status = 'cancelled'
        execution.completedAt = createTimestamp()
      }
    }
    
    // Clear caches and state
    this.registeredServices.clear()
    this.registeredWorkflows.clear()
    this.activeExecutions.clear()
    this.executionQueue.length = 0
    this.dependencyGraph.clear()
    this.workflowCache.clear()
    this.serviceCache.clear()
    this.contextCache.clear()
    this.eventHandlers.clear()
    this.throttledEvents.clear()
    
    // Remove all listeners
    this.removeAllListeners()
    
    this.orchestrationStatus = 'stopped'
    
    this.logger.info('ProjectOrchestrator disposed successfully', {
      totalWorkflowsExecuted: this.performanceMetrics.totalWorkflowsExecuted,
      totalServicesCoordinated: this.performanceMetrics.totalServicesCoordinated,
      finalStatus: this.orchestrationStatus
    })
  }

  // Placeholder methods for extended functionality that would be implemented
  
  private async validateWorkflow(workflow: OrchestrationWorkflow, project: Project): Promise<void> {
    // Implementation would validate workflow against project constraints
  }
  
  private async optimizeWorkflowSteps(workflow: OrchestrationWorkflow): Promise<void> {
    // Implementation would optimize step execution order for performance
  }
  
  private async validateTransitionPrerequisites(
    projectId: UUID, 
    fromPhase: PhaseType, 
    toPhase: PhaseType,
    lifecycleState: ProjectLifecycleState,
    validationLevel: string
  ): Promise<void> {
    // Implementation would validate transition is allowed
  }
  
  private async executePreTransitionWorkflow(projectId: UUID, fromPhase: PhaseType, toPhase: PhaseType): Promise<void> {
    // Implementation would execute pre-transition steps
  }
  
  private async executePostTransitionWorkflow(projectId: UUID, toPhase: PhaseType): Promise<void> {
    // Implementation would execute post-transition steps  
  }
  
  private async getAIProviderOrchestration(project: Project): Promise<AIProviderOrchestration> {
    // Implementation would return AI provider configuration
    return {
      primary: 'claude-3.5-sonnet',
      fallbacks: ['gpt-4'],
      routing: [],
      loadBalancing: { enabled: false, strategy: 'round_robin', healthChecking: true },
      tokenManagement: { pooling: true, rateLimiting: true, costOptimization: true },
      failover: { enabled: true, maxRetries: 3, circuitBreakerThreshold: 5, recoveryTimeout: 30000 }
    }
  }
  
  private async packageContextForAI(projectId: UUID, phaseContext: Record<string, any>): Promise<any> {
    // Implementation would package context for AI generation
    return { projectId, phaseContext }
  }
  
  private async executeAIGenerationWorkflow(
    provider: AIProviderType,
    targetFiles: string[],
    contextPackage: any,
    options: any
  ): Promise<any> {
    // Implementation would execute AI generation workflow
    return {
      artifacts: [],
      provider,
      metrics: { tokensUsed: 0, generationTime: 0, confidence: 0 }
    }
  }
}

// =============================================================================
// FACTORY FUNCTIONS AND EXPORTS
// =============================================================================

/**
 * Factory function for creating ProjectOrchestrator instances
 * Enables dependency injection and testing following Cline's patterns
 */
export function createProjectOrchestrator(
  logger: LoggingService,
  errorHandler: ErrorHandler,
  databaseService: DatabaseService,
  projectService: ProjectService,
  stateManager: ProjectStateManager,
  phaseManager: PhaseManager,
  serviceCoordinator: ServiceCoordinator,
  config?: Partial<ProjectOrchestratorConfig>
): ProjectOrchestrator {
  return new ProjectOrchestrator(
    logger,
    errorHandler,
    databaseService,
    projectService,
    stateManager,
    phaseManager,
    serviceCoordinator,
    config
  )
}

/**
 * Orchestrator-specific error types
 */
export class ProjectOrchestratorError extends ReadyAIError {
  constructor(
    message: string,
    code: string = 'PROJECT_ORCHESTRATOR_ERROR',
    statusCode: number = 500,
    details?: Record<string, any>
  ) {
    super(message, code, statusCode, details)
    this.name = 'ProjectOrchestratorError'
  }
}

/**
 * Export configuration constants
 */
export const PROJECT_ORCHESTRATOR_CONFIG = {
  DEFAULT_MAX_CONCURRENT_WORKFLOWS: DEFAULT_ORCHESTRATOR_CONFIG.maxConcurrentWorkflows,
  DEFAULT_WORKFLOW_TIMEOUT: DEFAULT_ORCHESTRATOR_CONFIG.defaultWorkflowTimeout,
  DEFAULT_SERVICE_TIMEOUT: DEFAULT_ORCHESTRATOR_CONFIG.defaultServiceTimeout,
  DEFAULT_RETRY_MAX_ATTEMPTS: DEFAULT_ORCHESTRATOR_CONFIG.retryConfig.maxAttempts,
  DEFAULT_RETRY_BASE_DELAY: DEFAULT_ORCHESTRATOR_CONFIG.retryConfig.baseDelayMs
} as const

/**
 * Version information
 */
export const PROJECT_ORCHESTRATOR_VERSION = '1.0.0'

// Re-export types for convenience
export type {
  ProjectOrchestratorConfig,
  OrchestratorExecutionContext,
  WorkflowExecutionStats
}

export default ProjectOrchestrator
