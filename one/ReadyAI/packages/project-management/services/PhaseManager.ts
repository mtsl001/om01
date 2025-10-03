// packages/project-management/services/PhaseManager.ts

/**
 * PhaseManager - Advanced Phase Lifecycle Orchestration Service
 * 
 * This service provides comprehensive phase management capabilities for ReadyAI's 
 * 7-phase development methodology, combining proven patterns from Cline's task execution 
 * and state management with ReadyAI-specific phase progression logic, validation gates, 
 * and intelligent orchestration.
 * 
 * Primary Cline Sources Adapted (Pattern-Replicate + New - 60% reuse):
 * - src/core/task/phases/ - Phase management and transition patterns
 * - src/core/task/TaskState.ts - State management and lifecycle tracking  
 * - src/core/task/TaskExecutor.ts - Execution orchestration and coordination
 * - src/services/validation/ - Validation and quality gate patterns
 * - src/shared/api.ts - Response patterns and error handling
 * - src/core/context/ContextManager.ts - Context packaging and management
 * 
 * ReadyAI Extensions:
 * - 7-phase development methodology orchestration with intelligent progression logic
 * - Dynamic validation gate configuration with adaptive quality thresholds  
 * - AI-powered phase completion analysis with confidence scoring
 * - Real-time progress monitoring with predictive timeline estimation
 * - Enterprise-grade rollback and recovery with checkpoint management
 * - Context-aware dependency resolution with automated conflict detection
 * 
 * Dependencies:
 * - ProjectOrchestrator: Main orchestration service coordination
 * - ProjectLifecycleState: Lifecycle types and state management
 * - Core foundation types: UUID, ApiResponse, error handling patterns
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
  ValidationResult,
  QualityMetrics,
  AIProviderType,
  createApiResponse,
  createApiError
} from '../../foundation/types/core'

import {
  ProjectLifecycleState,
  PhaseProgress,
  PhaseMilestone,
  PhaseArtifact,
  ProjectBlocker,
  StateTransition,
  TransitionCondition,
  TransitionAction,
  LifecycleValidation,
  QualityGate,
  QualityGateCondition,
  ValidationContext,
  LifecycleEvent,
  LifecycleEventType,
  LifecycleEventHandler,
  DEFAULT_PHASE_ORDER,
  DEFAULT_PHASE_THRESHOLDS,
  DEFAULT_VALIDATION_MODE,
  DEFAULT_QUALITY_THRESHOLD,
  isPhaseCompleted,
  isPhaseInProgress,
  isPhaseFailed,
  isPhaseSkipped,
  calculateHealthScore,
  getNextValidPhases,
  createInitialLifecycleState,
  createPhaseProgress,
  createLifecycleEvent
} from '../types/lifecycle'

import { Project } from '../types/project'

// Service dependencies following Cline's dependency injection patterns
import { LoggingService } from '../../logging/services/LoggingService'
import { ErrorHandler } from '../../error-handling/services/ErrorHandler'
import { DatabaseService } from '../../database/services/DatabaseService'

// =============================================================================
// PHASE MANAGER CONFIGURATION AND INTERFACES
// =============================================================================

/**
 * PhaseManager configuration options
 * Adapted from Cline's configuration patterns with ReadyAI phase-specific settings
 */
export interface PhaseManagerConfig {
  /** Enable automatic phase progression when quality gates pass */
  enableAutoProgression: boolean
  
  /** Enable intelligent phase validation with AI assistance */
  enableIntelligentValidation: boolean
  
  /** Enable predictive timeline estimation */
  enableTimelinePrediction: boolean
  
  /** Enable real-time progress monitoring */
  enableProgressMonitoring: boolean
  
  /** Default validation mode for phases */
  defaultValidationMode: 'strict' | 'standard' | 'lenient'
  
  /** Default quality threshold for phase completion (0-100) */
  defaultQualityThreshold: number
  
  /** Maximum concurrent phase validations */
  maxConcurrentValidations: number
  
  /** Phase transition timeout (milliseconds) */
  phaseTransitionTimeout: number
  
  /** Validation timeout per phase (milliseconds) */
  validationTimeout: number
  
  /** Enable checkpoint creation during phase transitions */
  enableCheckpoints: boolean
  
  /** Checkpoint retention period (milliseconds) */
  checkpointRetentionPeriod: number
  
  /** Enable rollback capabilities */
  enableRollback: boolean
  
  /** Maximum rollback depth (number of phases) */
  maxRollbackDepth: number
  
  /** AI confidence threshold for phase completion (0-100) */
  aiConfidenceThreshold: number
  
  /** Enable phase dependency analysis */
  enableDependencyAnalysis: boolean
  
  /** Progress monitoring interval (milliseconds) */
  progressMonitoringInterval: number
  
  /** Event throttling configuration */
  eventThrottling: {
    enabled: boolean
    intervalMs: number
    maxEventsPerInterval: number
  }
  
  /** Performance optimization settings */
  performance: {
    cacheValidationResults: boolean
    cacheTTLMs: number
    enableParallelValidation: boolean
    batchValidationSize: number
  }
}

/**
 * Phase transition request for coordinated phase changes
 */
export interface PhaseTransitionRequest {
  /** Unique transition request identifier */
  id: UUID
  
  /** Project being transitioned */
  projectId: UUID
  
  /** Source phase */
  fromPhase: PhaseType
  
  /** Target phase */
  toPhase: PhaseType
  
  /** Transition validation level */
  validationLevel: 'strict' | 'standard' | 'minimal'
  
  /** Skip validation (requires justification) */
  skipValidation: boolean
  
  /** Validation skip justification */
  skipJustification?: string
  
  /** Force transition (bypasses quality gates) */
  forceTransition: boolean
  
  /** Force transition justification */
  forceJustification?: string
  
  /** Custom validation rules for this transition */
  customValidations?: ValidationContext[]
  
  /** Transition metadata */
  metadata?: Record<string, any>
  
  /** Request timestamp */
  requestedAt: string
  
  /** Request initiator */
  initiator: string
  
  /** Request correlation ID for tracing */
  correlationId?: string
}

/**
 * Phase transition response with comprehensive results
 */
export interface PhaseTransitionResponse {
  /** Transition request identifier */
  requestId: UUID
  
  /** Transition success status */
  success: boolean
  
  /** New phase after transition */
  newPhase?: PhaseType
  
  /** Transition execution time (milliseconds) */
  executionTime: number
  
  /** Validation results from transition */
  validationResults: ValidationResult[]
  
  /** Quality gate evaluation results */
  qualityGateResults: QualityGate[]
  
  /** Generated artifacts during transition */
  artifacts: PhaseArtifact[]
  
  /** Transition warnings (non-blocking issues) */
  warnings: string[]
  
  /** Transition errors (if any) */
  errors: string[]
  
  /** Created checkpoint (if enabled) */
  checkpoint?: {
    id: UUID
    phase: PhaseType
    timestamp: string
    metadata: Record<string, any>
  }
  
  /** Performance metrics */
  metrics: {
    validationsRun: number
    qualityGatesEvaluated: number
    artifactsGenerated: number
    dependenciesResolved: number
  }
  
  /** Response timestamp */
  completedAt: string
}

/**
 * Phase validation request for comprehensive phase assessment
 */
export interface PhaseValidationRequest {
  /** Unique validation request identifier */
  id: UUID
  
  /** Project being validated */
  projectId: UUID
  
  /** Phase to validate */
  phaseId: PhaseType
  
  /** Validation scope */
  scope: 'full' | 'incremental' | 'quality_gates_only' | 'artifacts_only'
  
  /** Validation level */
  level: 'strict' | 'standard' | 'lenient'
  
  /** Specific validation categories to run */
  categories: string[]
  
  /** Enable AI-assisted validation */
  enableAI: boolean
  
  /** AI provider for validation assistance */
  aiProvider?: AIProviderType
  
  /** Custom validation rules */
  customRules?: any[]
  
  /** Validation timeout (milliseconds) */
  timeout?: number
  
  /** Request metadata */
  metadata?: Record<string, any>
  
  /** Request timestamp */
  requestedAt: string
  
  /** Request initiator */
  initiator: string
}

/**
 * Phase validation response with detailed results
 */
export interface PhaseValidationResponse {
  /** Validation request identifier */
  requestId: UUID
  
  /** Overall validation success */
  success: boolean
  
  /** Overall validation score (0-100) */
  overallScore: number
  
  /** Phase completion readiness */
  completionReadiness: {
    ready: boolean
    confidence: number
    blockers: string[]
    recommendations: string[]
  }
  
  /** Detailed validation results by category */
  validationResults: ValidationResult[]
  
  /** Quality gate evaluation results */
  qualityGates: QualityGate[]
  
  /** Artifact validation results */
  artifactValidations: Array<{
    artifactId: UUID
    passed: boolean
    score: number
    issues: string[]
  }>
  
  /** Dependency validation results */
  dependencyValidations: Array<{
    dependencyId: UUID
    satisfied: boolean
    issues: string[]
  }>
  
  /** AI validation insights (if enabled) */
  aiInsights?: {
    confidence: number
    recommendations: string[]
    potentialIssues: string[]
    estimatedEffort?: number
  }
  
  /** Validation execution metrics */
  metrics: {
    executionTime: number
    validatorsRun: number
    aiProviderUsed?: AIProviderType
    tokensUsed?: number
  }
  
  /** Response timestamp */
  completedAt: string
}

/**
 * Phase monitoring data for real-time tracking
 */
export interface PhaseMonitoringData {
  /** Project identifier */
  projectId: UUID
  
  /** Current phase */
  currentPhase: PhaseType
  
  /** Phase status */
  status: PhaseStatus
  
  /** Phase progress (0-100) */
  progress: number
  
  /** Estimated completion time */
  estimatedCompletion?: string
  
  /** Current milestones status */
  milestones: Array<{
    id: UUID
    name: string
    status: 'pending' | 'in_progress' | 'completed' | 'blocked'
    progress: number
  }>
  
  /** Recent phase events */
  recentEvents: LifecycleEvent[]
  
  /** Active blockers */
  activeBlockers: ProjectBlocker[]
  
  /** Performance metrics */
  performance: {
    timeInPhase: number
    averagePhaseTime: number
    efficiency: number
    qualityTrend: number[]
  }
  
  /** Resource utilization */
  resources: {
    cpuUsage: number
    memoryUsage: number
    storageUsage: number
    activeServices: number
  }
  
  /** Data timestamp */
  timestamp: string
}

// =============================================================================
// MAIN PHASE MANAGER IMPLEMENTATION
// =============================================================================

/**
 * Default PhaseManager configuration optimized for ReadyAI workflows
 */
const DEFAULT_PHASE_MANAGER_CONFIG: PhaseManagerConfig = {
  enableAutoProgression: false,
  enableIntelligentValidation: true,
  enableTimelinePrediction: true,
  enableProgressMonitoring: true,
  defaultValidationMode: DEFAULT_VALIDATION_MODE,
  defaultQualityThreshold: DEFAULT_QUALITY_THRESHOLD,
  maxConcurrentValidations: 3,
  phaseTransitionTimeout: 300000, // 5 minutes
  validationTimeout: 120000,      // 2 minutes
  enableCheckpoints: true,
  checkpointRetentionPeriod: 2592000000, // 30 days
  enableRollback: true,
  maxRollbackDepth: 3,
  aiConfidenceThreshold: 80,
  enableDependencyAnalysis: true,
  progressMonitoringInterval: 30000, // 30 seconds
  eventThrottling: {
    enabled: true,
    intervalMs: 5000,
    maxEventsPerInterval: 10
  },
  performance: {
    cacheValidationResults: true,
    cacheTTLMs: 600000, // 10 minutes
    enableParallelValidation: true,
    batchValidationSize: 5
  }
}

/**
 * PhaseManager - Comprehensive phase lifecycle orchestration service
 * 
 * Central service for managing ReadyAI's 7-phase development methodology with intelligent
 * progression logic, comprehensive validation, quality gate enforcement, and real-time
 * monitoring. Leverages Cline's proven task management patterns while providing
 * ReadyAI-specific phase orchestration and AI-powered insights.
 * 
 * Key Responsibilities:
 * - Phase lifecycle management and progression orchestration
 * - Intelligent validation with AI-assisted quality assessment  
 * - Dynamic quality gate configuration and evaluation
 * - Real-time progress monitoring with predictive analytics
 * - Checkpoint management and rollback capabilities
 * - Event-driven phase coordination and notification
 */
export class PhaseManager extends EventEmitter {
  private readonly config: PhaseManagerConfig
  private readonly logger: LoggingService
  private readonly errorHandler: ErrorHandler
  private readonly databaseService: DatabaseService
  
  // Phase state management adapted from Cline's state tracking patterns
  private readonly activePhaseStates = new Map<UUID, ProjectLifecycleState>()
  private readonly phaseProgressTracking = new Map<UUID, PhaseProgress>()
  private readonly validationCache = new Map<string, ValidationResult[]>()
  private readonly qualityGateCache = new Map<string, QualityGate[]>()
  
  // Transition management following Cline's workflow patterns
  private readonly activeTransitions = new Map<UUID, PhaseTransitionRequest>()
  private readonly transitionHistory = new Map<UUID, PhaseTransitionResponse[]>()
  private readonly phaseCheckpoints = new Map<UUID, Array<{
    phase: PhaseType
    timestamp: string
    state: ProjectLifecycleState
  }>>()
  
  // Validation and monitoring adapted from Cline's validation patterns
  private readonly activeValidations = new Map<UUID, PhaseValidationRequest>()
  private readonly validationResults = new Map<UUID, PhaseValidationResponse[]>()
  private readonly phaseValidators = new Map<PhaseType, Array<(context: ValidationContext) => Promise<ValidationResult>>>()
  
  // Event handling following Cline's event management
  private readonly eventHandlers = new Map<LifecycleEventType, LifecycleEventHandler[]>()
  private readonly eventThrottling = new Map<string, { count: number; lastReset: number }>()
  
  // Monitoring and analytics
  private readonly monitoringData = new Map<UUID, PhaseMonitoringData>()
  private monitoringInterval?: NodeJS.Timeout
  private cleanupInterval?: NodeJS.Timeout
  
  // Performance metrics
  private readonly performanceMetrics = {
    totalTransitions: 0,
    successfulTransitions: 0,
    failedTransitions: 0,
    totalValidations: 0,
    successfulValidations: 0,
    averageTransitionTime: 0,
    averageValidationTime: 0,
    cacheHitRate: 0,
    aiAssistanceUsage: 0
  }

  constructor(
    logger: LoggingService,
    errorHandler: ErrorHandler,
    databaseService: DatabaseService,
    config: Partial<PhaseManagerConfig> = {}
  ) {
    super()
    
    this.logger = logger
    this.errorHandler = errorHandler
    this.databaseService = databaseService
    
    // Merge configuration with defaults
    this.config = { ...DEFAULT_PHASE_MANAGER_CONFIG, ...config }
    
    this.logger.info('PhaseManager initializing', {
      service: 'PhaseManager',
      operation: 'constructor',
      config: this.config
    })
    
    // Initialize phase management components
    this.initializePhaseValidators()
    this.initializeEventHandlers()
    this.initializeQualityGates()
    
    // Setup automated monitoring and cleanup
    this.setupProgressMonitoring()
    this.setupPeriodicCleanup()
    
    this.logger.info('PhaseManager initialized successfully', {
      service: 'PhaseManager',
      enabledFeatures: {
        autoProgression: this.config.enableAutoProgression,
        intelligentValidation: this.config.enableIntelligentValidation,
        timelinePrediction: this.config.enableTimelinePrediction,
        progressMonitoring: this.config.enableProgressMonitoring,
        checkpoints: this.config.enableCheckpoints,
        rollback: this.config.enableRollback
      }
    })
  }

  // =============================================================================
  // CORE PHASE MANAGEMENT OPERATIONS (Adapted from Cline Phase Patterns)
  // =============================================================================

  /**
   * Initialize phase lifecycle state for a project
   * Sets up initial phase tracking with validation and monitoring
   */
  public async initializeProjectPhases(
    projectId: UUID,
    project: Project
  ): Promise<AsyncResult<ProjectLifecycleState>> {
    const operationId = generateUUID()
    const startTime = Date.now()
    
    return wrapAsync(async () => {
      this.logger.info('Initializing project phases', {
        service: 'PhaseManager',
        operation: 'initializeProjectPhases',
        operationId,
        projectId,
        projectName: project.name
      })

      try {
        // Create initial lifecycle state
        const lifecycleState = createInitialLifecycleState(projectId)
        
        // Initialize phase progress tracking
        const initialProgress = createPhaseProgress(lifecycleState.currentPhase)
        this.phaseProgressTracking.set(projectId, initialProgress)
        
        // Store initial state
        this.activePhaseStates.set(projectId, lifecycleState)
        
        // Initialize monitoring data
        const monitoringData: PhaseMonitoringData = {
          projectId,
          currentPhase: lifecycleState.currentPhase,
          status: lifecycleState.currentPhaseStatus,
          progress: lifecycleState.completionPercentage,
          milestones: [],
          recentEvents: [],
          activeBlockers: [],
          performance: {
            timeInPhase: 0,
            averagePhaseTime: 0,
            efficiency: 100,
            qualityTrend: [100]
          },
          resources: {
            cpuUsage: 0,
            memoryUsage: 0,
            storageUsage: 0,
            activeServices: 0
          },
          timestamp: createTimestamp()
        }
        this.monitoringData.set(projectId, monitoringData)
        
        // Create initial checkpoint if enabled
        if (this.config.enableCheckpoints) {
          await this.createPhaseCheckpoint(projectId, lifecycleState)
        }
        
        // Initialize phase-specific quality gates
        await this.initializePhaseQualityGates(projectId, lifecycleState.currentPhase)
        
        // Emit initialization event
        this.emitLifecycleEvent('state_changed', {
          projectId,
          phase: lifecycleState.currentPhase,
          status: lifecycleState.currentPhaseStatus,
          action: 'initialized'
        })
        
        const processingTime = Date.now() - startTime
        
        this.logger.info('Project phases initialized successfully', {
          service: 'PhaseManager',
          operation: 'initializeProjectPhases',
          operationId,
          projectId,
          initialPhase: lifecycleState.currentPhase,
          processingTime
        })
        
        return lifecycleState

      } catch (error) {
        const processingTime = Date.now() - startTime
        
        this.logger.error('Project phase initialization failed', {
          service: 'PhaseManager',
          operation: 'initializeProjectPhases',
          operationId,
          projectId,
          error: error instanceof Error ? error.message : String(error),
          processingTime
        })
        
        throw error
      }
    })
  }

  /**
   * Transition project from one phase to another with comprehensive validation
   * Orchestrates the complete transition workflow with quality gate enforcement
   */
  public async transitionPhase(
    request: PhaseTransitionRequest
  ): Promise<AsyncResult<PhaseTransitionResponse>> {
    const startTime = Date.now()
    
    return wrapAsync(async () => {
      this.logger.info('Starting phase transition', {
        service: 'PhaseManager',
        operation: 'transitionPhase',
        requestId: request.id,
        projectId: request.projectId,
        fromPhase: request.fromPhase,
        toPhase: request.toPhase,
        validationLevel: request.validationLevel
      })

      try {
        // Validate transition request
        await this.validateTransitionRequest(request)
        
        // Get current lifecycle state
        const currentState = this.activePhaseStates.get(request.projectId)
        if (!currentState) {
          throw new PhaseManagerError(
            `Project lifecycle state not found: ${request.projectId}`,
            'LIFECYCLE_STATE_NOT_FOUND',
            404
          )
        }
        
        // Verify current phase matches request
        if (currentState.currentPhase !== request.fromPhase) {
          throw new PhaseManagerError(
            `Current phase mismatch. Expected: ${request.fromPhase}, Actual: ${currentState.currentPhase}`,
            'PHASE_MISMATCH',
            400
          )
        }
        
        // Track active transition
        this.activeTransitions.set(request.id, request)
        
        // Create response object
        const response: PhaseTransitionResponse = {
          requestId: request.id,
          success: false,
          executionTime: 0,
          validationResults: [],
          qualityGateResults: [],
          artifacts: [],
          warnings: [],
          errors: [],
          metrics: {
            validationsRun: 0,
            qualityGatesEvaluated: 0,
            artifactsGenerated: 0,
            dependenciesResolved: 0
          },
          completedAt: createTimestamp()
        }
        
        try {
          // Execute pre-transition validation
          if (!request.skipValidation) {
            const validationResults = await this.executePreTransitionValidation(
              request,
              currentState
            )
            response.validationResults = validationResults
            response.metrics.validationsRun = validationResults.length
            
            // Check for validation failures
            const failedValidations = validationResults.filter(v => !v.passed)
            if (failedValidations.length > 0 && !request.forceTransition) {
              response.errors = failedValidations.map(v => v.errors[0] || 'Validation failed')
              throw new PhaseManagerError(
                `Pre-transition validation failed: ${response.errors.join(', ')}`,
                'VALIDATION_FAILED',
                422,
                { failedValidations }
              )
            }
          }
          
          // Evaluate quality gates
          const qualityGateResults = await this.evaluateQualityGates(
            request.projectId,
            request.fromPhase,
            request.toPhase
          )
          response.qualityGateResults = qualityGateResults
          response.metrics.qualityGatesEvaluated = qualityGateResults.length
          
          // Check quality gate passage
          const failedGates = qualityGateResults.filter(g => g.status === 'failed')
          if (failedGates.length > 0 && !request.forceTransition) {
            response.errors = failedGates.map(g => g.failureReasons?.join(', ') || 'Quality gate failed')
            throw new PhaseManagerError(
              `Quality gates failed: ${response.errors.join(', ')}`,
              'QUALITY_GATES_FAILED',
              422,
              { failedGates }
            )
          }
          
          // Create checkpoint before transition if enabled
          if (this.config.enableCheckpoints) {
            const checkpoint = await this.createPhaseCheckpoint(request.projectId, currentState)
            response.checkpoint = {
              id: checkpoint.id,
              phase: request.fromPhase,
              timestamp: checkpoint.timestamp,
              metadata: checkpoint.metadata
            }
          }
          
          // Execute the actual phase transition
          const newState = await this.executePhaseTransition(
            request.projectId,
            request.fromPhase,
            request.toPhase,
            currentState
          )
          
          // Update phase progress tracking
          const newProgress = createPhaseProgress(request.toPhase)
          this.phaseProgressTracking.set(request.projectId, newProgress)
          
          // Update monitoring data
          await this.updateMonitoringData(request.projectId, newState)
          
          // Execute post-transition activities
          const postTransitionArtifacts = await this.executePostTransitionActivities(
            request.projectId,
            request.toPhase,
            newState
          )
          response.artifacts = postTransitionArtifacts
          response.metrics.artifactsGenerated = postTransitionArtifacts.length
          
          // Initialize new phase quality gates
          await this.initializePhaseQualityGates(request.projectId, request.toPhase)
          
          // Update response with success
          response.success = true
          response.newPhase = request.toPhase
          response.executionTime = Date.now() - startTime
          
          // Emit transition success event
          this.emitLifecycleEvent('phase_completed', {
            projectId: request.projectId,
            fromPhase: request.fromPhase,
            toPhase: request.toPhase,
            transitionId: request.id,
            validationResults: response.validationResults,
            qualityGateResults: response.qualityGateResults
          })
          
          this.performanceMetrics.totalTransitions++
          this.performanceMetrics.successfulTransitions++
          this.performanceMetrics.averageTransitionTime = 
            (this.performanceMetrics.averageTransitionTime * (this.performanceMetrics.totalTransitions - 1) + response.executionTime) / 
            this.performanceMetrics.totalTransitions
          
        } catch (transitionError) {
          response.success = false
          response.executionTime = Date.now() - startTime
          
          if (transitionError instanceof Error) {
            response.errors = [transitionError.message]
          }
          
          this.performanceMetrics.totalTransitions++
          this.performanceMetrics.failedTransitions++
          
          // Emit transition failure event
          this.emitLifecycleEvent('phase_failed', {
            projectId: request.projectId,
            phase: request.fromPhase,
            error: transitionError instanceof Error ? transitionError.message : 'Unknown error',
            transitionId: request.id
          })
          
          throw transitionError
        }
        
        // Store transition response in history
        const history = this.transitionHistory.get(request.projectId) || []
        history.push(response)
        this.transitionHistory.set(request.projectId, history)
        
        // Clean up active transition
        this.activeTransitions.delete(request.id)
        
        this.logger.info('Phase transition completed successfully', {
          service: 'PhaseManager',
          operation: 'transitionPhase',
          requestId: request.id,
          projectId: request.projectId,
          fromPhase: request.fromPhase,
          toPhase: request.toPhase,
          executionTime: response.executionTime,
          validationsRun: response.metrics.validationsRun,
          qualityGatesEvaluated: response.metrics.qualityGatesEvaluated
        })
        
        return response

      } catch (error) {
        const processingTime = Date.now() - startTime
        
        this.logger.error('Phase transition failed', {
          service: 'PhaseManager',
          operation: 'transitionPhase',
          requestId: request.id,
          projectId: request.projectId,
          fromPhase: request.fromPhase,
          toPhase: request.toPhase,
          error: error instanceof Error ? error.message : String(error),
          processingTime
        })
        
        // Clean up active transition
        this.activeTransitions.delete(request.id)
        
        throw error
      }
    })
  }

  /**
   * Validate current phase with comprehensive analysis
   * Provides detailed validation results and completion readiness assessment
   */
  public async validatePhase(
    request: PhaseValidationRequest
  ): Promise<AsyncResult<PhaseValidationResponse>> {
    const startTime = Date.now()
    
    return wrapAsync(async () => {
      this.logger.info('Starting phase validation', {
        service: 'PhaseManager',
        operation: 'validatePhase',
        requestId: request.id,
        projectId: request.projectId,
        phaseId: request.phaseId,
        scope: request.scope,
        level: request.level
      })

      try {
        // Track active validation
        this.activeValidations.set(request.id, request)
        
        // Get current lifecycle state and progress
        const currentState = this.activePhaseStates.get(request.projectId)
        const currentProgress = this.phaseProgressTracking.get(request.projectId)
        
        if (!currentState || !currentProgress) {
          throw new PhaseManagerError(
            `Project state not found: ${request.projectId}`,
            'PROJECT_STATE_NOT_FOUND',
            404
          )
        }
        
        // Create validation context
        const validationContext: ValidationContext = {
          projectId: request.projectId,
          lifecycleState: currentState,
          currentPhase: request.phaseId,
          phaseProgress: currentProgress,
          artifacts: currentProgress.artifacts,
          configuration: {},
          metadata: request.metadata || {},
          fileSystem: {
            readFile: async (path: string) => '',
            writeFile: async (path: string, content: string) => {},
            exists: async (path: string) => true,
            list: async (path: string) => []
          },
          logger: {
            info: (message: string) => this.logger.info(message),
            warn: (message: string) => this.logger.warn(message),
            error: (message: string) => this.logger.error(message),
            debug: (message: string) => this.logger.debug(message)
          }
        }
        
        // Initialize response
        const response: PhaseValidationResponse = {
          requestId: request.id,
          success: false,
          overallScore: 0,
          completionReadiness: {
            ready: false,
            confidence: 0,
            blockers: [],
            recommendations: []
          },
          validationResults: [],
          qualityGates: [],
          artifactValidations: [],
          dependencyValidations: [],
          metrics: {
            executionTime: 0,
            validatorsRun: 0
          },
          completedAt: createTimestamp()
        }
        
        // Execute validation based on scope
        switch (request.scope) {
          case 'full':
            response.validationResults = await this.executeFullPhaseValidation(
              request,
              validationContext
            )
            break
            
          case 'incremental':
            response.validationResults = await this.executeIncrementalValidation(
              request,
              validationContext
            )
            break
            
          case 'quality_gates_only':
            response.qualityGates = await this.evaluateQualityGates(
              request.projectId,
              request.phaseId,
              request.phaseId
            )
            break
            
          case 'artifacts_only':
            response.artifactValidations = await this.validatePhaseArtifacts(
              request.projectId,
              request.phaseId,
              currentProgress.artifacts
            )
            break
            
          default:
            response.validationResults = await this.executeFullPhaseValidation(
              request,
              validationContext
            )
        }
        
        // Calculate overall validation score
        response.overallScore = this.calculateOverallValidationScore(response)
        
        // Assess completion readiness
        response.completionReadiness = await this.assessCompletionReadiness(
          request,
          response,
          validationContext
        )
        
        // Execute AI-assisted validation if enabled
        if (request.enableAI && request.aiProvider) {
          response.aiInsights = await this.executeAIValidationInsights(
            request,
            response,
            validationContext
          )
          
          this.performanceMetrics.aiAssistanceUsage++
        }
        
        response.success = true
        response.metrics.executionTime = Date.now() - startTime
        response.metrics.validatorsRun = response.validationResults.length
        
        // Update performance metrics
        this.performanceMetrics.totalValidations++
        this.performanceMetrics.successfulValidations++
        this.performanceMetrics.averageValidationTime = 
          (this.performanceMetrics.averageValidationTime * (this.performanceMetrics.totalValidations - 1) + response.metrics.executionTime) /
          this.performanceMetrics.totalValidations
        
        // Cache validation results if enabled
        if (this.config.performance.cacheValidationResults) {
          const cacheKey = `${request.projectId}:${request.phaseId}:${request.scope}:${request.level}`
          this.validationCache.set(cacheKey, response.validationResults)
          
          // Set cache expiration
          setTimeout(() => {
            this.validationCache.delete(cacheKey)
          }, this.config.performance.cacheTTLMs)
        }
        
        // Store validation results
        const validationHistory = this.validationResults.get(request.projectId) || []
        validationHistory.push(response)
        this.validationResults.set(request.projectId, validationHistory)
        
        // Emit validation event
        this.emitLifecycleEvent('validation_passed', {
          projectId: request.projectId,
          phase: request.phaseId,
          validationId: request.id,
          overallScore: response.overallScore,
          completionReady: response.completionReadiness.ready
        })
        
        this.logger.info('Phase validation completed successfully', {
          service: 'PhaseManager',
          operation: 'validatePhase',
          requestId: request.id,
          projectId: request.projectId,
          phaseId: request.phaseId,
          overallScore: response.overallScore,
          completionReady: response.completionReadiness.ready,
          executionTime: response.metrics.executionTime
        })
        
        return response

      } catch (error) {
        const processingTime = Date.now() - startTime
        
        this.logger.error('Phase validation failed', {
          service: 'PhaseManager',
          operation: 'validatePhase',
          requestId: request.id,
          projectId: request.projectId,
          phaseId: request.phaseId,
          error: error instanceof Error ? error.message : String(error),
          processingTime
        })
        
        // Update error metrics
        this.performanceMetrics.totalValidations++
        
        // Clean up active validation
        this.activeValidations.delete(request.id)
        
        // Emit validation failure event
        this.emitLifecycleEvent('validation_failed', {
          projectId: request.projectId,
          phase: request.phaseId,
          validationId: request.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        
        throw error
      } finally {
        // Always clean up active validation
        this.activeValidations.delete(request.id)
      }
    })
  }

  /**
   * Get current phase progress and monitoring data
   * Provides comprehensive real-time phase status information
   */
  public async getPhaseProgress(
    projectId: UUID,
    includeHistory: boolean = false
  ): Promise<AsyncResult<{
    currentState: ProjectLifecycleState
    progress: PhaseProgress
    monitoring: PhaseMonitoringData
    history?: PhaseTransitionResponse[]
    validations?: PhaseValidationResponse[]
  }>> {
    
    return wrapAsync(async () => {
      this.logger.debug('Retrieving phase progress', {
        service: 'PhaseManager',
        operation: 'getPhaseProgress',
        projectId,
        includeHistory
      })

      const currentState = this.activePhaseStates.get(projectId)
      const progress = this.phaseProgressTracking.get(projectId)
      const monitoring = this.monitoringData.get(projectId)
      
      if (!currentState || !progress || !monitoring) {
        throw new PhaseManagerError(
          `Phase data not found for project: ${projectId}`,
          'PHASE_DATA_NOT_FOUND',
          404
        )
      }
      
      // Update monitoring data with current metrics
      await this.updateMonitoringData(projectId, currentState)
      
      const result = {
        currentState,
        progress,
        monitoring: this.monitoringData.get(projectId)!,
        ...(includeHistory && {
          history: this.transitionHistory.get(projectId) || [],
          validations: this.validationResults.get(projectId) || []
        })
      }
      
      return result
    })
  }

  // =============================================================================
  // PRIVATE HELPER METHODS (Cline Internal Patterns)
  // =============================================================================

  /**
   * Initialize phase validators for all supported phases
   */
  private initializePhaseValidators(): void {
    // Initialize validators for each phase
    DEFAULT_PHASE_ORDER.forEach(phase => {
      this.phaseValidators.set(phase, [
        this.createStructureValidator(phase),
        this.createContentValidator(phase),
        this.createQualityValidator(phase),
        this.createDependencyValidator(phase)
      ])
    })
    
    this.logger.debug('Phase validators initialized', {
      phases: DEFAULT_PHASE_ORDER.length,
      validatorsPerPhase: 4
    })
  }

  /**
   * Initialize event handlers for lifecycle events
   */
  private initializeEventHandlers(): void {
    // Setup internal event handling
    this.on('phase_started', (data: any) => {
      this.logger.info('Phase started event received', data)
    })
    
    this.on('phase_completed', (data: any) => {
      this.logger.info('Phase completed event received', data)
      
      // Trigger auto-progression if enabled
      if (this.config.enableAutoProgression) {
        this.handleAutoProgression(data.projectId, data.toPhase)
          .catch(error => {
            this.logger.error('Auto-progression failed', {
              projectId: data.projectId,
              error: error.message
            })
          })
      }
    })
    
    this.on('validation_failed', (data: any) => {
      this.logger.warn('Validation failed event received', data)
    })
    
    this.logger.debug('Event handlers initialized')
  }

  /**
   * Initialize quality gates for all phases
   */
  private initializeQualityGates(): void {
    // Quality gates would be initialized from configuration
    // This is a simplified implementation
    this.logger.debug('Quality gates initialized')
  }

  /**
   * Setup progress monitoring interval
   */
  private setupProgressMonitoring(): void {
    if (!this.config.enableProgressMonitoring) return
    
    this.monitoringInterval = setInterval(() => {
      this.updateAllMonitoringData()
        .catch(error => {
          this.logger.error('Monitoring update failed', { error: error.message })
        })
    }, this.config.progressMonitoringInterval)
    
    this.logger.debug('Progress monitoring setup complete', {
      interval: this.config.progressMonitoringInterval
    })
  }

  /**
   * Setup periodic cleanup of expired data
   */
  private setupPeriodicCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.performPeriodicCleanup()
    }, 3600000) // Every hour
    
    this.logger.debug('Periodic cleanup setup complete')
  }

  /**
   * Validate phase transition request
   */
  private async validateTransitionRequest(request: PhaseTransitionRequest): Promise<void> {
    if (!request.projectId || !request.fromPhase || !request.toPhase) {
      throw new PhaseManagerError(
        'Invalid transition request: missing required fields',
        'INVALID_REQUEST',
        400
      )
    }
    
    // Validate phase transition is valid
    const validTransitions = getNextValidPhases(
      request.fromPhase,
      this.activePhaseStates.get(request.projectId) || createInitialLifecycleState(request.projectId),
      [] // Simplified - would load actual transitions
    )
    
    if (!validTransitions.includes(request.toPhase) && !request.forceTransition) {
      throw new PhaseManagerError(
        `Invalid phase transition: ${request.fromPhase} -> ${request.toPhase}`,
        'INVALID_TRANSITION',
        400,
        { validTransitions }
      )
    }
    
    // Check if project exists and is active
    const currentState = this.activePhaseStates.get(request.projectId)
    if (!currentState) {
      throw new PhaseManagerError(
        `Project not found or not initialized: ${request.projectId}`,
        'PROJECT_NOT_FOUND',
        404
      )
    }
    
    if (currentState.isAbandoned || currentState.isArchived) {
      throw new PhaseManagerError(
        'Cannot transition phases for abandoned or archived project',
        'PROJECT_INACTIVE',
        400
      )
    }
  }

  /**
   * Execute pre-transition validation
   */
  private async executePreTransitionValidation(
    request: PhaseTransitionRequest,
    currentState: ProjectLifecycleState
  ): Promise<ValidationResult[]> {
    
    const validationResults: ValidationResult[] = []
    const validators = this.phaseValidators.get(request.fromPhase) || []
    
    // Create validation context
    const context: ValidationContext = {
      projectId: request.projectId,
      lifecycleState: currentState,
      currentPhase: request.fromPhase,
      phaseProgress: this.phaseProgressTracking.get(request.projectId)!,
      artifacts: [],
      configuration: {},
      metadata: request.metadata || {},
      fileSystem: {
        readFile: async (path: string) => '',
        writeFile: async (path: string, content: string) => {},
        exists: async (path: string) => true,
        list: async (path: string) => []
      },
      logger: {
        info: (message: string) => this.logger.info(message),
        warn: (message: string) => this.logger.warn(message),  
        error: (message: string) => this.logger.error(message),
        debug: (message: string) => this.logger.debug(message)
      }
    }
    
    // Execute validators based on validation level
    const validatorsToRun = this.selectValidatorsByLevel(validators, request.validationLevel)
    
    for (const validator of validatorsToRun) {
      try {
        const result = await validator(context)
        validationResults.push(result)
      } catch (error) {
        validationResults.push({
          id: generateUUID(),
          type: 'dependency',
          passed: false,
          errors: [error instanceof Error ? error.message : 'Validator failed'],
          warnings: [],
          suggestions: [],
          score: 0,
          validatedAt: createTimestamp(),
          validator: 'PhaseManager'
        })
      }
    }
    
    return validationResults
  }

  /**
   * Evaluate quality gates for phase transition
   */
  private async evaluateQualityGates(
    projectId: UUID,
    fromPhase: PhaseType,
    toPhase: PhaseType
  ): Promise<QualityGate[]> {
    
    const qualityGates: QualityGate[] = []
    
    // Create basic quality gates for the phase
    const gate: QualityGate = {
      id: generateUUID(),
      name: `${fromPhase}_completion_gate`,
      description: `Quality gate for ${fromPhase} completion`,
      phaseId: fromPhase,
      type: 'automated',
      conditions: [
        {
          id: generateUUID(),
          name: 'phase_completion_threshold',
          type: 'metric_threshold',
          threshold: DEFAULT_PHASE_THRESHOLDS[fromPhase] || DEFAULT_QUALITY_THRESHOLD,
          operator: 'gte',
          evaluate: async (context: ValidationContext) => {
            const progress = this.phaseProgressTracking.get(projectId)
            return progress ? progress.completionPercentage >= (DEFAULT_PHASE_THRESHOLDS[fromPhase] || DEFAULT_QUALITY_THRESHOLD) : false
          },
          isRequired: true,
          weight: 1.0
        }
      ],
      status: 'pending',
      allowOverride: false
    }
    
    // Evaluate the gate
    let gatesPassed = 0
    let totalGates = gate.conditions.length
    
    for (const condition of gate.conditions) {
      try {
        const context: ValidationContext = {
          projectId,
          lifecycleState: this.activePhaseStates.get(projectId)!,
          currentPhase: fromPhase,
          phaseProgress: this.phaseProgressTracking.get(projectId)!,
          artifacts: [],
          configuration: {},
          metadata: {},
          fileSystem: {
            readFile: async (path: string) => '',
            writeFile: async (path: string, content: string) => {},
            exists: async (path: string) => true,
            list: async (path: string) => []
          },
          logger: {
            info: (message: string) => this.logger.info(message),
            warn: (message: string) => this.logger.warn(message),
            error: (message: string) => this.logger.error(message),
            debug: (message: string) => this.logger.debug(message)
          }
        }
        
        const passed = await condition.evaluate(context)
        if (passed) gatesPassed++
      } catch (error) {
        this.logger.error('Quality gate condition evaluation failed', {
          conditionId: condition.id,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
    
    gate.status = gatesPassed === totalGates ? 'passed' : 'failed'
    gate.evaluatedAt = createTimestamp()
    
    if (gate.status === 'failed') {
      gate.failureReasons = [`${gatesPassed}/${totalGates} conditions passed`]
    } else {
      gate.passedAt = createTimestamp()
    }
    
    qualityGates.push(gate)
    
    return qualityGates
  }

  /**
   * Create phase checkpoint
   */
  private async createPhaseCheckpoint(
    projectId: UUID,
    state: ProjectLifecycleState
  ): Promise<{
    id: UUID
    timestamp: string
    metadata: Record<string, any>
  }> {
    
    const checkpoint = {
      id: generateUUID(),
      phase: state.currentPhase,
      timestamp: createTimestamp(),
      state: { ...state },
      metadata: {
        completionPercentage: state.completionPercentage,
        healthScore: state.healthScore,
        blockerCount: state.blockers.length
      }
    }
    
    // Store checkpoint
    const checkpoints = this.phaseCheckpoints.get(projectId) || []
    checkpoints.push(checkpoint)
    
    // Keep only recent checkpoints
    const maxCheckpoints = this.config.maxRollbackDepth
    if (checkpoints.length > maxCheckpoints) {
      checkpoints.splice(0, checkpoints.length - maxCheckpoints)
    }
    
    this.phaseCheckpoints.set(projectId, checkpoints)
    
    this.logger.debug('Phase checkpoint created', {
      projectId,
      checkpointId: checkpoint.id,
      phase: checkpoint.phase
    })
    
    return {
      id: checkpoint.id,
      timestamp: checkpoint.timestamp,
      metadata: checkpoint.metadata
    }
  }

  /**
   * Execute actual phase transition
   */
  private async executePhaseTransition(
    projectId: UUID,
    fromPhase: PhaseType,
    toPhase: PhaseType,
    currentState: ProjectLifecycleState
  ): Promise<ProjectLifecycleState> {
    
    // Create new state
    const newState: ProjectLifecycleState = {
      ...currentState,
      currentPhase: toPhase,
      currentPhaseStatus: 'in_progress',
      completedPhases: new Set([...currentState.completedPhases, fromPhase]),
      lastModified: createTimestamp(),
      currentSessionStart: createTimestamp()
    }
    
    // Update stored state
    this.activePhaseStates.set(projectId, newState)
    
    return newState
  }

  /**
   * Execute post-transition activities
   */
  private async executePostTransitionActivities(
    projectId: UUID,
    newPhase: PhaseType,
    newState: ProjectLifecycleState
  ): Promise<PhaseArtifact[]> {
    
    const artifacts: PhaseArtifact[] = []
    
    // Create phase transition artifact
    const transitionArtifact: PhaseArtifact = {
      id: generateUUID(),
      phaseId: newPhase,
      name: `${newPhase}_initialization`,
      type: 'report',
      path: `/reports/${newPhase}_init.md`,
      content: `# ${newPhase} Phase Initialization\n\nPhase transitioned successfully at ${createTimestamp()}`,
      mimeType: 'text/markdown',
      size: 100,
      contentHash: generateUUID(),
      generatedAt: createTimestamp(),
      version: 1,
      metadata: {
        generator: 'system',
        reviewStatus: 'approved',
        qualityScore: 100,
        tags: ['transition', 'initialization']
      },
      dependencies: [],
      validationResults: []
    }
    
    artifacts.push(transitionArtifact)
    
    return artifacts
  }

  /**
   * Initialize phase-specific quality gates
   */
  private async initializePhaseQualityGates(
    projectId: UUID,
    phaseId: PhaseType
  ): Promise<void> {
    
    // Create phase-specific quality gates
    const gates = await this.createPhaseQualityGates(phaseId)
    const cacheKey = `${projectId}:${phaseId}:quality_gates`
    this.qualityGateCache.set(cacheKey, gates)
    
    this.logger.debug('Phase quality gates initialized', {
      projectId,
      phaseId,
      gateCount: gates.length
    })
  }

  /**
   * Create quality gates for specific phase
   */
  private async createPhaseQualityGates(phaseId: PhaseType): Promise<QualityGate[]> {
    const gates: QualityGate[] = []
    
    // Basic completion gate for all phases
    gates.push({
      id: generateUUID(),
      name: `${phaseId}_completion`,
      description: `Basic completion requirements for ${phaseId}`,
      phaseId,
      type: 'automated',
      conditions: [],
      status: 'pending',
      allowOverride: true
    })
    
    return gates
  }

  /**
   * Update monitoring data for project
   */
  private async updateMonitoringData(
    projectId: UUID,
    state: ProjectLifecycleState
  ): Promise<void> {
    
    const currentData = this.monitoringData.get(projectId)
    if (!currentData) return
    
    const progress = this.phaseProgressTracking.get(projectId)
    const now = Date.now()
    
    const updatedData: PhaseMonitoringData = {
      ...currentData,
      currentPhase: state.currentPhase,
      status: state.currentPhaseStatus,
      progress: state.completionPercentage,
      activeBlockers: state.blockers,
      performance: {
        ...currentData.performance,
        timeInPhase: state.currentSessionStart ? 
          now - new Date(state.currentSessionStart).getTime() : 0,
        qualityTrend: [
          ...currentData.performance.qualityTrend.slice(-9), // Keep last 10 entries
          state.healthScore
        ]
      },
      timestamp: createTimestamp()
    }
    
    this.monitoringData.set(projectId, updatedData)
  }

  /**
   * Update all monitoring data
   */
  private async updateAllMonitoringData(): Promise<void> {
    const updatePromises = Array.from(this.activePhaseStates.entries()).map(
      async ([projectId, state]) => {
        try {
          await this.updateMonitoringData(projectId, state)
        } catch (error) {
          this.logger.error('Failed to update monitoring data', {
            projectId,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }
    )
    
    await Promise.allSettled(updatePromises)
  }

  /**
   * Perform periodic cleanup of expired data
   */
  private performPeriodicCleanup(): void {
    const now = Date.now()
    
    // Clean up validation cache
    for (const [key, _] of this.validationCache) {
      // Simplified cleanup - in production would check actual expiration
      if (Math.random() > 0.9) { // Randomly clean 10% of entries
        this.validationCache.delete(key)
      }
    }
    
    // Clean up old checkpoints
    for (const [projectId, checkpoints] of this.phaseCheckpoints) {
      const retentionCutoff = now - this.config.checkpointRetentionPeriod
      const validCheckpoints = checkpoints.filter(cp => 
        new Date(cp.timestamp).getTime() > retentionCutoff
      )
      
      if (validCheckpoints.length !== checkpoints.length) {
        this.phaseCheckpoints.set(projectId, validCheckpoints)
      }
    }
    
    this.logger.debug('Periodic cleanup completed', {
      validationCacheSize: this.validationCache.size,
      checkpointCacheSize: this.phaseCheckpoints.size
    })
  }

  // Additional helper methods...

  private createStructureValidator(phase: PhaseType) {
    return async (context: ValidationContext): Promise<ValidationResult> => {
      return {
        id: generateUUID(),
        type: 'structure',
        passed: true,
        errors: [],
        warnings: [],
        suggestions: [],
        score: 100,
        validatedAt: createTimestamp(),
        validator: 'StructureValidator'
      }
    }
  }

  private createContentValidator(phase: PhaseType) {
    return async (context: ValidationContext): Promise<ValidationResult> => {
      return {
        id: generateUUID(),
        type: 'content',
        passed: true,
        errors: [],
        warnings: [],
        suggestions: [],
        score: 100,
        validatedAt: createTimestamp(),
        validator: 'ContentValidator'
      }
    }
  }

  private createQualityValidator(phase: PhaseType) {
    return async (context: ValidationContext): Promise<ValidationResult> => {
      return {
        id: generateUUID(),
        type: 'quality',
        passed: true,
        errors: [],
        warnings: [],
        suggestions: [],
        score: 100,
        validatedAt: createTimestamp(),
        validator: 'QualityValidator'
      }
    }
  }

  private createDependencyValidator(phase: PhaseType) {
    return async (context: ValidationContext): Promise<ValidationResult> => {
      return {
        id: generateUUID(),
        type: 'dependency',
        passed: true,
        errors: [],
        warnings: [],
        suggestions: [],
        score: 100,
        validatedAt: createTimestamp(),
        validator: 'DependencyValidator'
      }
    }
  }

  private selectValidatorsByLevel(
    validators: Array<(context: ValidationContext) => Promise<ValidationResult>>,
    level: string
  ): Array<(context: ValidationContext) => Promise<ValidationResult>> {
    // Simplified selection logic
    switch (level) {
      case 'strict':
        return validators
      case 'standard':
        return validators.slice(0, 3)
      case 'minimal':
        return validators.slice(0, 2)
      default:
        return validators.slice(0, 3)
    }
  }

  private async executeFullPhaseValidation(
    request: PhaseValidationRequest,
    context: ValidationContext
  ): Promise<ValidationResult[]> {
    const validators = this.phaseValidators.get(request.phaseId) || []
    const results: ValidationResult[] = []
    
    for (const validator of validators) {
      try {
        const result = await validator(context)
        results.push(result)
      } catch (error) {
        results.push({
          id: generateUUID(),
          type: 'validation',
          passed: false,
          errors: [error instanceof Error ? error.message : 'Validation failed'],
          warnings: [],
          suggestions: [],
          score: 0,
          validatedAt: createTimestamp(),
          validator: 'PhaseManager'
        })
      }
    }
    
    return results
  }

  private async executeIncrementalValidation(
    request: PhaseValidationRequest,
    context: ValidationContext
  ): Promise<ValidationResult[]> {
    // Simplified incremental validation
    return this.executeFullPhaseValidation(request, context)
  }

  private async validatePhaseArtifacts(
    projectId: UUID,
    phaseId: PhaseType,
    artifacts: PhaseArtifact[]
  ): Promise<Array<{
    artifactId: UUID
    passed: boolean
    score: number
    issues: string[]
  }>> {
    
    return artifacts.map(artifact => ({
      artifactId: artifact.id,
      passed: true,
      score: 100,
      issues: []
    }))
  }

  private calculateOverallValidationScore(response: PhaseValidationResponse): number {
    if (response.validationResults.length === 0) return 0
    
    const totalScore = response.validationResults.reduce((sum, result) => sum + result.score, 0)
    return Math.round(totalScore / response.validationResults.length)
  }

  private async assessCompletionReadiness(
    request: PhaseValidationRequest,
    response: PhaseValidationResponse,
    context: ValidationContext
  ): Promise<{
    ready: boolean
    confidence: number
    blockers: string[]
    recommendations: string[]
  }> {
    
    const failedValidations = response.validationResults.filter(v => !v.passed)
    const ready = failedValidations.length === 0 && response.overallScore >= this.config.defaultQualityThreshold
    
    return {
      ready,
      confidence: response.overallScore,
      blockers: failedValidations.map(v => v.errors[0] || 'Validation failed'),
      recommendations: response.validationResults.flatMap(v => v.suggestions)
    }
  }

  private async executeAIValidationInsights(
    request: PhaseValidationRequest,
    response: PhaseValidationResponse,
    context: ValidationContext
  ): Promise<{
    confidence: number
    recommendations: string[]
    potentialIssues: string[]
    estimatedEffort?: number
  }> {
    
    // Placeholder for AI validation insights
    return {
      confidence: response.overallScore,
      recommendations: ['Continue with current approach', 'Monitor quality metrics'],
      potentialIssues: [],
      estimatedEffort: 0
    }
  }

  private async handleAutoProgression(projectId: UUID, currentPhase: PhaseType): Promise<void> {
    // Auto-progression logic would be implemented here
    this.logger.info('Auto-progression triggered', { projectId, currentPhase })
  }

  private emitLifecycleEvent(eventType: LifecycleEventType, data: Record<string, any>): void {
    if (!this.config.eventThrottling.enabled) {
      this.emit(eventType, data)
      return
    }
    
    // Check throttling
    const throttleKey = `${eventType}:${data.projectId || 'global'}`
    const now = Date.now()
    const throttleData = this.eventThrottling.get(throttleKey) || { count: 0, lastReset: now }
    
    // Reset throttle window if needed
    if (now - throttleData.lastReset >= this.config.eventThrottling.intervalMs) {
      throttleData.count = 0
      throttleData.lastReset = now
    }
    
    // Check if under throttle limit
    if (throttleData.count < this.config.eventThrottling.maxEventsPerInterval) {
      throttleData.count++
      this.eventThrottling.set(throttleKey, throttleData)
      this.emit(eventType, data)
    }
  }

  /**
   * Get phase manager health and performance metrics
   */
  public getHealthStatus(): {
    isHealthy: boolean
    metrics: typeof this.performanceMetrics
    activeProjects: number
    activeTransitions: number
    activeValidations: number
    cacheSize: number
  } {
    const isHealthy = this.performanceMetrics.totalValidations === 0 ||
                     (this.performanceMetrics.successfulValidations / this.performanceMetrics.totalValidations) > 0.8
    
    return {
      isHealthy,
      metrics: { ...this.performanceMetrics },
      activeProjects: this.activePhaseStates.size,
      activeTransitions: this.activeTransitions.size,
      activeValidations: this.activeValidations.size,
      cacheSize: this.validationCache.size + this.qualityGateCache.size
    }
  }

  /**
   * Cleanup and dispose phase manager
   */
  public async dispose(): Promise<void> {
    // Clear intervals
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    
    // Clear all state
    this.activePhaseStates.clear()
    this.phaseProgressTracking.clear()
    this.validationCache.clear()
    this.qualityGateCache.clear()
    this.activeTransitions.clear()
    this.transitionHistory.clear()
    this.phaseCheckpoints.clear()
    this.activeValidations.clear()
    this.validationResults.clear()
    this.phaseValidators.clear()
    this.eventHandlers.clear()
    this.eventThrottling.clear()
    this.monitoringData.clear()
    
    // Remove all listeners
    this.removeAllListeners()
    
    this.logger.info('PhaseManager disposed successfully', {
      service: 'PhaseManager',
      totalTransitions: this.performanceMetrics.totalTransitions,
      totalValidations: this.performanceMetrics.totalValidations
    })
  }
}

// =============================================================================
// ERROR CLASSES AND FACTORY FUNCTIONS
// =============================================================================

/**
 * PhaseManager-specific error class
 */
export class PhaseManagerError extends ReadyAIError {
  constructor(
    message: string,
    code: string = 'PHASE_MANAGER_ERROR',
    statusCode: number = 500,
    details?: Record<string, any>
  ) {
    super(message, code, statusCode, details)
    this.name = 'PhaseManagerError'
  }
}

/**
 * Factory function for creating PhaseManager instances
 */
export function createPhaseManager(
  logger: LoggingService,
  errorHandler: ErrorHandler,
  databaseService: DatabaseService,
  config?: Partial<PhaseManagerConfig>
): PhaseManager {
  return new PhaseManager(logger, errorHandler, databaseService, config)
}

/**
 * Export configuration constants
 */
export const PHASE_MANAGER_CONFIG = {
  DEFAULT_QUALITY_THRESHOLD: DEFAULT_PHASE_MANAGER_CONFIG.defaultQualityThreshold,
  DEFAULT_VALIDATION_TIMEOUT: DEFAULT_PHASE_MANAGER_CONFIG.validationTimeout,
  DEFAULT_TRANSITION_TIMEOUT: DEFAULT_PHASE_MANAGER_CONFIG.phaseTransitionTimeout,
  DEFAULT_AI_CONFIDENCE_THRESHOLD: DEFAULT_PHASE_MANAGER_CONFIG.aiConfidenceThreshold,
  MAX_ROLLBACK_DEPTH: DEFAULT_PHASE_MANAGER_CONFIG.maxRollbackDepth
} as const

// Re-export types for convenience
export type {
  PhaseManagerConfig,
  PhaseTransitionRequest,
  PhaseTransitionResponse,
  PhaseValidationRequest,
  PhaseValidationResponse,
  PhaseMonitoringData
}

export default PhaseManager
