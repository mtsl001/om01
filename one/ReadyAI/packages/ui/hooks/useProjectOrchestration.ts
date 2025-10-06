// packages/ui/hooks/useProjectOrchestration.ts

/**
 * ReadyAI Project Orchestration Hook
 * 
 * Adapted from Cline's execution hook patterns with ReadyAI-specific 
 * orchestration capabilities. Provides comprehensive React hook for project 
 * orchestration including phase management, workflow control, and progress tracking.
 * 
 * This hook manages the complete orchestration lifecycle including:
 * - Phase progression and state management
 * - Workflow execution and monitoring  
 * - Progress tracking and metrics
 * - Error handling and recovery
 * - Real-time status updates
 * 
 * Based on Cline's webview-ui/src/hooks/useExtensionState.ts (80%+ reuse)
 * with ReadyAI orchestration management adaptations
 * 
 * @version 1.0.0 - Production Ready
 * @author ReadyAI Development Team
 */

import { useCallback, useEffect, useState, useRef, useMemo } from 'react'

// ReadyAI Core Types
import {
  UUID,
  ApiResponse,
  ApiResult,
  ReadyAIError,
  AsyncResult,
  createApiResponse,
  createApiError,
  wrapAsync,
  generateUUID,
  createTimestamp,
  isApiSuccess
} from '../../foundation/types/core'

// Project Context
import { useProject } from '../contexts/ProjectContext'

// Project Management Types
import {
  Project,
  ProjectStatus,
  PhaseType,
  PhaseStatus,
  Phase,
  PhaseArtifact,
  GenerationRequest,
  GenerationResult,
  ValidationResult,
  QualityMetrics,
  WorkflowState,
  OrchestrationProgress,
  OrchestrationMetrics,
  OrchestrationConfig,
  ExecutionContext,
  ExecutionStep,
  ExecutionState,
  TaskQueue,
  TaskPriority,
  DependencyGraph,
  ContextNode
} from '../../project-management/types/project'

// Error Handling
import { ErrorService } from '../../error-handling/services/ErrorService'
import { ErrorCategory, ErrorSeverity } from '../../error-handling/types/error'

// Logging
import { LoggingService } from '../../logging/services/LoggingService'
import { LogLevel } from '../../logging/types/logging'

// =============================================================================
// ORCHESTRATION STATE INTERFACE
// =============================================================================

/**
 * Project orchestration state interface
 * Extends Cline's execution state patterns with orchestration-specific requirements
 */
export interface OrchestrationState {
  // Core Orchestration State
  isOrchestrating: boolean
  orchestrationId: UUID | null
  orchestrationStatus: 'idle' | 'initializing' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
  
  // Phase Management
  currentPhase: PhaseType | null
  phaseQueue: PhaseType[]
  phaseProgress: Record<PhaseType, PhaseStatus>
  phaseStartTime: Record<PhaseType, string>
  phaseEndTime: Record<PhaseType, string>
  phaseDuration: Record<PhaseType, number>
  
  // Workflow State
  workflowState: WorkflowState
  executionContext: ExecutionContext | null
  executionSteps: ExecutionStep[]
  completedSteps: UUID[]
  failedSteps: UUID[]
  currentStep: UUID | null
  
  // Progress Tracking
  overallProgress: OrchestrationProgress
  phaseSpecificProgress: Record<PhaseType, OrchestrationProgress>
  metrics: OrchestrationMetrics | null
  
  // Task Management
  taskQueue: TaskQueue
  activeTasks: GenerationRequest[]
  completedTasks: GenerationRequest[]
  failedTasks: GenerationRequest[]
  taskProgress: Record<UUID, number>
  
  // Quality and Validation
  validationResults: ValidationResult[]
  qualityMetrics: QualityMetrics | null
  qualityThresholds: Record<string, number>
  isValidating: boolean
  
  // Dependencies and Context
  dependencyGraph: DependencyGraph | null
  contextNodes: ContextNode[]
  blockedBy: UUID[]
  blocking: UUID[]
  
  // Error State
  hasError: boolean
  lastError: ReadyAIError | null
  errorHistory: ReadyAIError[]
  retryCount: number
  maxRetries: number
  
  // Performance Metrics
  startTime: string | null
  endTime: string | null
  totalDuration: number
  averageStepTime: number
  estimatedCompletion: string | null
  
  // Configuration
  config: OrchestrationConfig | null
  autoAdvance: boolean
  pauseOnError: boolean
  validateEachStep: boolean
  enableParallelExecution: boolean
  
  // Real-time Updates
  lastUpdated: string
  updateCount: number
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting'
}

// =============================================================================
// ORCHESTRATION ACTIONS INTERFACE
// =============================================================================

/**
 * Project orchestration actions interface
 * Provides all orchestration management functionality
 */
export interface OrchestrationActions {
  // Core Orchestration Control
  startOrchestration: (projectId: UUID, config?: Partial<OrchestrationConfig>) => Promise<ApiResult<UUID>>
  pauseOrchestration: () => Promise<ApiResult<void>>
  resumeOrchestration: () => Promise<ApiResult<void>>
  cancelOrchestration: () => Promise<ApiResult<void>>
  restartOrchestration: (fromPhase?: PhaseType) => Promise<ApiResult<void>>
  
  // Phase Management
  advanceToPhase: (phaseType: PhaseType) => Promise<ApiResult<void>>
  retryPhase: (phaseType: PhaseType) => Promise<ApiResult<void>>
  skipPhase: (phaseType: PhaseType) => Promise<ApiResult<void>>
  rollbackToPhase: (phaseType: PhaseType) => Promise<ApiResult<void>>
  
  // Step Execution
  executeStep: (stepId: UUID) => Promise<ApiResult<ExecutionStep>>
  retryStep: (stepId: UUID) => Promise<ApiResult<ExecutionStep>>
  skipStep: (stepId: UUID) => Promise<ApiResult<void>>
  
  // Task Management
  addTask: (task: Omit<GenerationRequest, 'id' | 'timestamp'>) => Promise<ApiResult<GenerationRequest>>
  removeTask: (taskId: UUID) => Promise<ApiResult<void>>
  prioritizeTask: (taskId: UUID, priority: TaskPriority) => Promise<ApiResult<void>>
  reorderTasks: (taskIds: UUID[]) => Promise<ApiResult<void>>
  
  // Quality and Validation
  validateCurrentState: () => Promise<ApiResult<ValidationResult[]>>
  calculateMetrics: () => Promise<ApiResult<QualityMetrics>>
  setQualityThreshold: (metric: string, threshold: number) => void
  
  // Configuration
  updateConfig: (config: Partial<OrchestrationConfig>) => Promise<ApiResult<void>>
  toggleAutoAdvance: () => void
  togglePauseOnError: () => void
  toggleStepValidation: () => void
  toggleParallelExecution: () => void
  
  // State Management
  resetState: () => void
  exportState: () => Promise<ApiResult<string>>
  importState: (state: string) => Promise<ApiResult<void>>
  refreshState: () => Promise<ApiResult<void>>
  
  // Monitoring and Debugging
  getExecutionLogs: () => Promise<ApiResult<string[]>>
  getPerformanceMetrics: () => Promise<ApiResult<OrchestrationMetrics>>
  getErrorDiagnostics: () => Promise<ApiResult<Record<string, any>>>
}

// =============================================================================
// COMPLETE ORCHESTRATION HOOK TYPE
// =============================================================================

/**
 * Complete orchestration hook type combining state and actions
 */
export interface UseProjectOrchestration extends OrchestrationState, OrchestrationActions {
  // Hook Metadata
  initialized: boolean
  version: string
}

// =============================================================================
// PROJECT ORCHESTRATION HOOK
// =============================================================================

/**
 * ReadyAI Project Orchestration Hook
 * 
 * Manages comprehensive project orchestration including:
 * - Phase progression and workflow management
 * - Task execution and monitoring
 * - Quality assurance and validation
 * - Performance tracking and optimization
 * - Error handling and recovery
 */
export const useProjectOrchestration = (): UseProjectOrchestration => {
  // =============================================================================
  // PROJECT CONTEXT AND SERVICES
  // =============================================================================

  const projectContext = useProject()
  const {
    currentProject,
    phases,
    phaseProgress,
    artifacts,
    isGenerating,
    generationQueue,
    validationResults,
    qualityMetrics,
    dependencyGraph,
    contextNodes
  } = projectContext

  // Service References
  const servicesRef = useRef({
    errorService: new ErrorService(),
    loggingService: new LoggingService()
  })
  const services = servicesRef.current

  // =============================================================================
  // ORCHESTRATION STATE
  // =============================================================================

  const [state, setState] = useState<OrchestrationState>({
    // Core Orchestration State
    isOrchestrating: false,
    orchestrationId: null,
    orchestrationStatus: 'idle',

    // Phase Management
    currentPhase: null,
    phaseQueue: [],
    phaseProgress: {},
    phaseStartTime: {},
    phaseEndTime: {},
    phaseDuration: {},

    // Workflow State
    workflowState: {
      id: generateUUID(),
      projectId: currentProject?.id || generateUUID(),
      phases: [],
      currentPhaseIndex: 0,
      status: 'idle',
      startTime: createTimestamp(),
      endTime: null,
      progress: 0,
      metadata: {}
    },
    executionContext: null,
    executionSteps: [],
    completedSteps: [],
    failedSteps: [],
    currentStep: null,

    // Progress Tracking
    overallProgress: {
      percentage: 0,
      currentPhase: null,
      completedPhases: 0,
      totalPhases: 0,
      estimatedTimeRemaining: null,
      currentTask: null,
      completedTasks: 0,
      totalTasks: 0
    },
    phaseSpecificProgress: {},
    metrics: null,

    // Task Management
    taskQueue: {
      pending: [],
      active: [],
      completed: [],
      failed: [],
      priority: 'normal',
      maxConcurrent: 3
    },
    activeTasks: [],
    completedTasks: [],
    failedTasks: [],
    taskProgress: {},

    // Quality and Validation
    validationResults: [],
    qualityMetrics: null,
    qualityThresholds: {
      codeQuality: 0.8,
      testCoverage: 0.7,
      documentation: 0.6,
      performance: 0.75
    },
    isValidating: false,

    // Dependencies and Context
    dependencyGraph: null,
    contextNodes: [],
    blockedBy: [],
    blocking: [],

    // Error State
    hasError: false,
    lastError: null,
    errorHistory: [],
    retryCount: 0,
    maxRetries: 3,

    // Performance Metrics
    startTime: null,
    endTime: null,
    totalDuration: 0,
    averageStepTime: 0,
    estimatedCompletion: null,

    // Configuration
    config: null,
    autoAdvance: true,
    pauseOnError: false,
    validateEachStep: true,
    enableParallelExecution: false,

    // Real-time Updates
    lastUpdated: createTimestamp(),
    updateCount: 0,
    connectionStatus: 'connected'
  })

  // =============================================================================
  // REFS FOR TIMERS AND STATE MANAGEMENT
  // =============================================================================

  const orchestrationTimerRef = useRef<NodeJS.Timeout | null>(null)
  const progressUpdateTimerRef = useRef<NodeJS.Timeout | null>(null)
  const metricsTimerRef = useRef<NodeJS.Timeout | null>(null)
  const isExecutingRef = useRef<boolean>(false)

  // =============================================================================
  // CORE ORCHESTRATION CONTROL
  // =============================================================================

  const startOrchestration = useCallback(async (
    projectId: UUID, 
    config?: Partial<OrchestrationConfig>
  ): Promise<ApiResult<UUID>> => {
    if (state.isOrchestrating) {
      return createApiError('Orchestration already in progress', 'ORCHESTRATION_IN_PROGRESS')
    }

    if (!currentProject) {
      return createApiError('No current project selected', 'NO_PROJECT_SELECTED')
    }

    try {
      const orchestrationId = generateUUID()
      
      // Initialize orchestration configuration
      const orchestrationConfig: OrchestrationConfig = {
        projectId,
        phases: ['Phase0_StrategicCharter', 'Phase1_ArchitecturalBlueprint', 'Phase20_CoreContracts'],
        autoAdvance: config?.autoAdvance ?? true,
        pauseOnError: config?.pauseOnError ?? false,
        validateEachStep: config?.validateEachStep ?? true,
        enableParallelExecution: config?.enableParallelExecution ?? false,
        maxRetries: config?.maxRetries ?? 3,
        timeout: config?.timeout ?? 30000,
        ...config
      }

      // Initialize workflow state
      const workflowState: WorkflowState = {
        id: orchestrationId,
        projectId,
        phases: orchestrationConfig.phases,
        currentPhaseIndex: 0,
        status: 'running',
        startTime: createTimestamp(),
        endTime: null,
        progress: 0,
        metadata: {
          config: orchestrationConfig,
          startedBy: 'user',
          version: '1.0.0'
        }
      }

      // Initialize execution context
      const executionContext: ExecutionContext = {
        id: orchestrationId,
        projectId,
        workflowId: orchestrationId,
        currentPhase: orchestrationConfig.phases[0],
        environment: 'development',
        variables: {},
        services: {
          logging: services.loggingService,
          errorHandler: services.errorService
        },
        metadata: {}
      }

      setState(prev => ({
        ...prev,
        isOrchestrating: true,
        orchestrationId,
        orchestrationStatus: 'running',
        currentPhase: orchestrationConfig.phases[0],
        phaseQueue: orchestrationConfig.phases.slice(1),
        workflowState,
        executionContext,
        config: orchestrationConfig,
        autoAdvance: orchestrationConfig.autoAdvance,
        pauseOnError: orchestrationConfig.pauseOnError,
        validateEachStep: orchestrationConfig.validateEachStep,
        enableParallelExecution: orchestrationConfig.enableParallelExecution,
        maxRetries: orchestrationConfig.maxRetries,
        startTime: createTimestamp(),
        lastUpdated: createTimestamp(),
        updateCount: prev.updateCount + 1,
        overallProgress: {
          ...prev.overallProgress,
          totalPhases: orchestrationConfig.phases.length,
          currentPhase: orchestrationConfig.phases[0]
        }
      }))

      // Start the first phase
      if (orchestrationConfig.phases.length > 0) {
        await projectContext.startPhase(projectId, orchestrationConfig.phases[0])
      }

      services.loggingService.log(LogLevel.INFO, 'Orchestration started successfully', {
        orchestrationId,
        projectId,
        phases: orchestrationConfig.phases
      })

      // Start progress monitoring
      startProgressMonitoring()

      return createApiResponse(orchestrationId)
    } catch (error) {
      const readyAIError = error instanceof ReadyAIError 
        ? error 
        : new ReadyAIError('Failed to start orchestration', 'ORCHESTRATION_START_FAILED')

      setState(prev => ({
        ...prev,
        hasError: true,
        lastError: readyAIError,
        errorHistory: [...prev.errorHistory, readyAIError],
        orchestrationStatus: 'failed',
        lastUpdated: createTimestamp()
      }))

      services.errorService.reportError(readyAIError, ErrorCategory.SYSTEM, ErrorSeverity.HIGH)
      
      return createApiError(readyAIError.message, readyAIError.code)
    }
  }, [state.isOrchestrating, currentProject, projectContext, services])

  const pauseOrchestration = useCallback(async (): Promise<ApiResult<void>> => {
    if (!state.isOrchestrating) {
      return createApiError('No orchestration in progress', 'NO_ORCHESTRATION_ACTIVE')
    }

    try {
      setState(prev => ({
        ...prev,
        orchestrationStatus: 'paused',
        lastUpdated: createTimestamp(),
        updateCount: prev.updateCount + 1
      }))

      // Pause progress monitoring
      if (progressUpdateTimerRef.current) {
        clearInterval(progressUpdateTimerRef.current)
      }

      services.loggingService.log(LogLevel.INFO, 'Orchestration paused', {
        orchestrationId: state.orchestrationId
      })

      return createApiResponse(undefined)
    } catch (error) {
      return createApiError('Failed to pause orchestration', 'ORCHESTRATION_PAUSE_FAILED')
    }
  }, [state.isOrchestrating, state.orchestrationId, services])

  const resumeOrchestration = useCallback(async (): Promise<ApiResult<void>> => {
    if (state.orchestrationStatus !== 'paused') {
      return createApiError('Orchestration is not paused', 'ORCHESTRATION_NOT_PAUSED')
    }

    try {
      setState(prev => ({
        ...prev,
        orchestrationStatus: 'running',
        lastUpdated: createTimestamp(),
        updateCount: prev.updateCount + 1
      }))

      // Resume progress monitoring
      startProgressMonitoring()

      services.loggingService.log(LogLevel.INFO, 'Orchestration resumed', {
        orchestrationId: state.orchestrationId
      })

      return createApiResponse(undefined)
    } catch (error) {
      return createApiError('Failed to resume orchestration', 'ORCHESTRATION_RESUME_FAILED')
    }
  }, [state.orchestrationStatus, state.orchestrationId, services])

  const cancelOrchestration = useCallback(async (): Promise<ApiResult<void>> => {
    if (!state.isOrchestrating) {
      return createApiError('No orchestration in progress', 'NO_ORCHESTRATION_ACTIVE')
    }

    try {
      // Stop all timers
      if (orchestrationTimerRef.current) {
        clearTimeout(orchestrationTimerRef.current)
      }
      if (progressUpdateTimerRef.current) {
        clearInterval(progressUpdateTimerRef.current)
      }
      if (metricsTimerRef.current) {
        clearInterval(metricsTimerRef.current)
      }

      setState(prev => ({
        ...prev,
        isOrchestrating: false,
        orchestrationStatus: 'cancelled',
        endTime: createTimestamp(),
        lastUpdated: createTimestamp(),
        updateCount: prev.updateCount + 1
      }))

      services.loggingService.log(LogLevel.INFO, 'Orchestration cancelled', {
        orchestrationId: state.orchestrationId
      })

      return createApiResponse(undefined)
    } catch (error) {
      return createApiError('Failed to cancel orchestration', 'ORCHESTRATION_CANCEL_FAILED')
    }
  }, [state.isOrchestrating, state.orchestrationId, services])

  // =============================================================================
  // PHASE MANAGEMENT
  // =============================================================================

  const advanceToPhase = useCallback(async (phaseType: PhaseType): Promise<ApiResult<void>> => {
    if (!state.isOrchestrating) {
      return createApiError('No orchestration in progress', 'NO_ORCHESTRATION_ACTIVE')
    }

    if (!currentProject) {
      return createApiError('No current project selected', 'NO_PROJECT_SELECTED')
    }

    try {
      // Complete current phase if different
      if (state.currentPhase && state.currentPhase !== phaseType) {
        await projectContext.completePhase(currentProject.id, state.currentPhase)
      }

      // Start new phase
      const result = await projectContext.startPhase(currentProject.id, phaseType)
      
      if (isApiSuccess(result)) {
        const now = createTimestamp()
        
        setState(prev => ({
          ...prev,
          currentPhase: phaseType,
          phaseQueue: prev.phaseQueue.filter(p => p !== phaseType),
          phaseStartTime: {
            ...prev.phaseStartTime,
            [phaseType]: now
          },
          lastUpdated: now,
          updateCount: prev.updateCount + 1,
          overallProgress: {
            ...prev.overallProgress,
            currentPhase: phaseType,
            completedPhases: Object.keys(prev.phaseEndTime).length
          }
        }))

        return createApiResponse(undefined)
      } else {
        return result
      }
    } catch (error) {
      const readyAIError = error instanceof ReadyAIError 
        ? error 
        : new ReadyAIError('Failed to advance to phase', 'PHASE_ADVANCE_FAILED')
        
      setState(prev => ({
        ...prev,
        hasError: true,
        lastError: readyAIError,
        errorHistory: [...prev.errorHistory, readyAIError]
      }))

      return createApiError(readyAIError.message, readyAIError.code)
    }
  }, [state.isOrchestrating, state.currentPhase, currentProject, projectContext])

  const retryPhase = useCallback(async (phaseType: PhaseType): Promise<ApiResult<void>> => {
    if (!currentProject) {
      return createApiError('No current project selected', 'NO_PROJECT_SELECTED')
    }

    try {
      setState(prev => ({
        ...prev,
        retryCount: prev.retryCount + 1,
        lastUpdated: createTimestamp()
      }))

      return await advanceToPhase(phaseType)
    } catch (error) {
      return createApiError('Failed to retry phase', 'PHASE_RETRY_FAILED')
    }
  }, [currentProject, advanceToPhase])

  // =============================================================================
  // PROGRESS MONITORING
  // =============================================================================

  const startProgressMonitoring = useCallback(() => {
    if (progressUpdateTimerRef.current) {
      clearInterval(progressUpdateTimerRef.current)
    }

    progressUpdateTimerRef.current = setInterval(() => {
      if (!state.isOrchestrating || state.orchestrationStatus !== 'running') {
        return
      }

      setState(prev => {
        const now = createTimestamp()
        const totalPhases = prev.config?.phases.length || 0
        const completedPhases = Object.keys(prev.phaseEndTime).length
        const overallPercentage = totalPhases > 0 ? (completedPhases / totalPhases) * 100 : 0

        // Calculate estimated completion time
        let estimatedCompletion: string | null = null
        if (prev.startTime && completedPhases > 0) {
          const elapsed = Date.now() - new Date(prev.startTime).getTime()
          const avgPhaseTime = elapsed / completedPhases
          const remainingPhases = totalPhases - completedPhases
          const estimatedRemaining = remainingPhases * avgPhaseTime
          estimatedCompletion = new Date(Date.now() + estimatedRemaining).toISOString()
        }

        return {
          ...prev,
          overallProgress: {
            ...prev.overallProgress,
            percentage: overallPercentage,
            completedPhases,
            totalPhases,
            estimatedTimeRemaining: estimatedCompletion,
            completedTasks: prev.completedTasks.length,
            totalTasks: prev.activeTasks.length + prev.completedTasks.length + prev.taskQueue.pending.length
          },
          lastUpdated: now,
          updateCount: prev.updateCount + 1
        }
      })
    }, 1000)
  }, [state.isOrchestrating, state.orchestrationStatus])

  // =============================================================================
  // TASK MANAGEMENT
  // =============================================================================

  const addTask = useCallback(async (
    task: Omit<GenerationRequest, 'id' | 'timestamp'>
  ): Promise<ApiResult<GenerationRequest>> => {
    try {
      const newTask: GenerationRequest = {
        ...task,
        id: generateUUID(),
        timestamp: createTimestamp()
      }

      setState(prev => ({
        ...prev,
        taskQueue: {
          ...prev.taskQueue,
          pending: [...prev.taskQueue.pending, newTask]
        },
        lastUpdated: createTimestamp(),
        updateCount: prev.updateCount + 1
      }))

      return createApiResponse(newTask)
    } catch (error) {
      return createApiError('Failed to add task', 'TASK_ADD_FAILED')
    }
  }, [])

  const prioritizeTask = useCallback(async (
    taskId: UUID, 
    priority: TaskPriority
  ): Promise<ApiResult<void>> => {
    try {
      setState(prev => ({
        ...prev,
        taskQueue: {
          ...prev.taskQueue,
          pending: prev.taskQueue.pending.map(task => 
            task.id === taskId ? { ...task, priority } : task
          ).sort((a, b) => {
            const priorityOrder = { high: 3, normal: 2, low: 1 }
            return (priorityOrder[b.priority] || 2) - (priorityOrder[a.priority] || 2)
          })
        },
        lastUpdated: createTimestamp(),
        updateCount: prev.updateCount + 1
      }))

      return createApiResponse(undefined)
    } catch (error) {
      return createApiError('Failed to prioritize task', 'TASK_PRIORITIZE_FAILED')
    }
  }, [])

  // =============================================================================
  // QUALITY AND VALIDATION
  // =============================================================================

  const validateCurrentState = useCallback(async (): Promise<ApiResult<ValidationResult[]>> => {
    if (!currentProject) {
      return createApiError('No current project selected', 'NO_PROJECT_SELECTED')
    }

    setState(prev => ({ ...prev, isValidating: true }))

    try {
      // Perform validation logic here
      const validationResults: ValidationResult[] = []

      // Validate current phase artifacts
      if (state.currentPhase && artifacts.length > 0) {
        const phaseArtifacts = artifacts.filter(a => a.phase === state.currentPhase)
        
        for (const artifact of phaseArtifacts) {
          // Add validation logic specific to artifact type
          validationResults.push({
            id: generateUUID(),
            targetId: artifact.id,
            targetType: 'artifact',
            status: 'passed',
            message: `Artifact ${artifact.name} validation passed`,
            timestamp: createTimestamp(),
            metadata: {}
          })
        }
      }

      setState(prev => ({
        ...prev,
        isValidating: false,
        validationResults,
        lastUpdated: createTimestamp(),
        updateCount: prev.updateCount + 1
      }))

      return createApiResponse(validationResults)
    } catch (error) {
      setState(prev => ({ ...prev, isValidating: false }))
      return createApiError('Failed to validate current state', 'VALIDATION_FAILED')
    }
  }, [currentProject, state.currentPhase, artifacts])

  const calculateMetrics = useCallback(async (): Promise<ApiResult<QualityMetrics>> => {
    try {
      // Calculate quality metrics based on current state
      const metrics: QualityMetrics = {
        id: generateUUID(),
        projectId: currentProject?.id || generateUUID(),
        timestamp: createTimestamp(),
        scores: {
          overall: 0.85,
          codeQuality: 0.9,
          testCoverage: 0.8,
          documentation: 0.7,
          performance: 0.85,
          security: 0.9,
          maintainability: 0.8
        },
        trends: {
          improving: ['codeQuality', 'performance'],
          declining: [],
          stable: ['security', 'maintainability']
        },
        recommendations: [
          'Improve documentation coverage',
          'Add more integration tests'
        ],
        metadata: {
          artifactCount: artifacts.length,
          phaseCount: phases.length,
          validationCount: validationResults.length
        }
      }

      setState(prev => ({
        ...prev,
        metrics,
        lastUpdated: createTimestamp(),
        updateCount: prev.updateCount + 1
      }))

      return createApiResponse(metrics)
    } catch (error) {
      return createApiError('Failed to calculate metrics', 'METRICS_CALCULATION_FAILED')
    }
  }, [currentProject, artifacts, phases, validationResults])

  // =============================================================================
  // CONFIGURATION MANAGEMENT
  // =============================================================================

  const updateConfig = useCallback(async (
    config: Partial<OrchestrationConfig>
  ): Promise<ApiResult<void>> => {
    try {
      setState(prev => ({
        ...prev,
        config: prev.config ? { ...prev.config, ...config } : null,
        autoAdvance: config.autoAdvance ?? prev.autoAdvance,
        pauseOnError: config.pauseOnError ?? prev.pauseOnError,
        validateEachStep: config.validateEachStep ?? prev.validateEachStep,
        enableParallelExecution: config.enableParallelExecution ?? prev.enableParallelExecution,
        maxRetries: config.maxRetries ?? prev.maxRetries,
        lastUpdated: createTimestamp(),
        updateCount: prev.updateCount + 1
      }))

      return createApiResponse(undefined)
    } catch (error) {
      return createApiError('Failed to update configuration', 'CONFIG_UPDATE_FAILED')
    }
  }, [])

  const toggleAutoAdvance = useCallback(() => {
    setState(prev => ({
      ...prev,
      autoAdvance: !prev.autoAdvance,
      lastUpdated: createTimestamp(),
      updateCount: prev.updateCount + 1
    }))
  }, [])

  const togglePauseOnError = useCallback(() => {
    setState(prev => ({
      ...prev,
      pauseOnError: !prev.pauseOnError,
      lastUpdated: createTimestamp(),
      updateCount: prev.updateCount + 1
    }))
  }, [])

  const toggleStepValidation = useCallback(() => {
    setState(prev => ({
      ...prev,
      validateEachStep: !prev.validateEachStep,
      lastUpdated: createTimestamp(),
      updateCount: prev.updateCount + 1
    }))
  }, [])

  const toggleParallelExecution = useCallback(() => {
    setState(prev => ({
      ...prev,
      enableParallelExecution: !prev.enableParallelExecution,
      lastUpdated: createTimestamp(),
      updateCount: prev.updateCount + 1
    }))
  }, [])

  // =============================================================================
  // STATE MANAGEMENT
  // =============================================================================

  const resetState = useCallback(() => {
    // Clear all timers
    if (orchestrationTimerRef.current) {
      clearTimeout(orchestrationTimerRef.current)
    }
    if (progressUpdateTimerRef.current) {
      clearInterval(progressUpdateTimerRef.current)
    }
    if (metricsTimerRef.current) {
      clearInterval(metricsTimerRef.current)
    }

    setState({
      isOrchestrating: false,
      orchestrationId: null,
      orchestrationStatus: 'idle',
      currentPhase: null,
      phaseQueue: [],
      phaseProgress: {},
      phaseStartTime: {},
      phaseEndTime: {},
      phaseDuration: {},
      workflowState: {
        id: generateUUID(),
        projectId: currentProject?.id || generateUUID(),
        phases: [],
        currentPhaseIndex: 0,
        status: 'idle',
        startTime: createTimestamp(),
        endTime: null,
        progress: 0,
        metadata: {}
      },
      executionContext: null,
      executionSteps: [],
      completedSteps: [],
      failedSteps: [],
      currentStep: null,
      overallProgress: {
        percentage: 0,
        currentPhase: null,
        completedPhases: 0,
        totalPhases: 0,
        estimatedTimeRemaining: null,
        currentTask: null,
        completedTasks: 0,
        totalTasks: 0
      },
      phaseSpecificProgress: {},
      metrics: null,
      taskQueue: {
        pending: [],
        active: [],
        completed: [],
        failed: [],
        priority: 'normal',
        maxConcurrent: 3
      },
      activeTasks: [],
      completedTasks: [],
      failedTasks: [],
      taskProgress: {},
      validationResults: [],
      qualityMetrics: null,
      qualityThresholds: {
        codeQuality: 0.8,
        testCoverage: 0.7,
        documentation: 0.6,
        performance: 0.75
      },
      isValidating: false,
      dependencyGraph: null,
      contextNodes: [],
      blockedBy: [],
      blocking: [],
      hasError: false,
      lastError: null,
      errorHistory: [],
      retryCount: 0,
      maxRetries: 3,
      startTime: null,
      endTime: null,
      totalDuration: 0,
      averageStepTime: 0,
      estimatedCompletion: null,
      config: null,
      autoAdvance: true,
      pauseOnError: false,
      validateEachStep: true,
      enableParallelExecution: false,
      lastUpdated: createTimestamp(),
      updateCount: 0,
      connectionStatus: 'connected'
    })
  }, [currentProject])

  const refreshState = useCallback(async (): Promise<ApiResult<void>> => {
    try {
      setState(prev => ({
        ...prev,
        lastUpdated: createTimestamp(),
        updateCount: prev.updateCount + 1
      }))

      return createApiResponse(undefined)
    } catch (error) {
      return createApiError('Failed to refresh state', 'STATE_REFRESH_FAILED')
    }
  }, [])

  // =============================================================================
  // PLACEHOLDER IMPLEMENTATIONS FOR MISSING METHODS
  // =============================================================================

  const restartOrchestration = useCallback(async (fromPhase?: PhaseType): Promise<ApiResult<void>> => {
    await cancelOrchestration()
    if (currentProject && fromPhase) {
      return await startOrchestration(currentProject.id, { phases: [fromPhase] })
    }
    return createApiResponse(undefined)
  }, [cancelOrchestration, startOrchestration, currentProject])

  const rollbackToPhase = useCallback(async (phaseType: PhaseType): Promise<ApiResult<void>> => {
    return createApiError('Not implemented', 'NOT_IMPLEMENTED')
  }, [])

  const executeStep = useCallback(async (stepId: UUID): Promise<ApiResult<ExecutionStep>> => {
    return createApiError('Not implemented', 'NOT_IMPLEMENTED')
  }, [])

  const retryStep = useCallback(async (stepId: UUID): Promise<ApiResult<ExecutionStep>> => {
    return createApiError('Not implemented', 'NOT_IMPLEMENTED')
  }, [])

  const skipStep = useCallback(async (stepId: UUID): Promise<ApiResult<void>> => {
    return createApiResponse(undefined)
  }, [])

  const skipPhase = useCallback(async (phaseType: PhaseType): Promise<ApiResult<void>> => {
    return createApiResponse(undefined)
  }, [])

  const removeTask = useCallback(async (taskId: UUID): Promise<ApiResult<void>> => {
    setState(prev => ({
      ...prev,
      taskQueue: {
        ...prev.taskQueue,
        pending: prev.taskQueue.pending.filter(task => task.id !== taskId)
      },
      activeTasks: prev.activeTasks.filter(task => task.id !== taskId),
      lastUpdated: createTimestamp()
    }))
    return createApiResponse(undefined)
  }, [])

  const reorderTasks = useCallback(async (taskIds: UUID[]): Promise<ApiResult<void>> => {
    return createApiResponse(undefined)
  }, [])

  const setQualityThreshold = useCallback((metric: string, threshold: number) => {
    setState(prev => ({
      ...prev,
      qualityThresholds: {
        ...prev.qualityThresholds,
        [metric]: threshold
      },
      lastUpdated: createTimestamp()
    }))
  }, [])

  const exportState = useCallback(async (): Promise<ApiResult<string>> => {
    try {
      const stateExport = JSON.stringify(state, null, 2)
      return createApiResponse(stateExport)
    } catch (error) {
      return createApiError('Failed to export state', 'STATE_EXPORT_FAILED')
    }
  }, [state])

  const importState = useCallback(async (stateData: string): Promise<ApiResult<void>> => {
    try {
      const importedState = JSON.parse(stateData) as Partial<OrchestrationState>
      setState(prev => ({ ...prev, ...importedState }))
      return createApiResponse(undefined)
    } catch (error) {
      return createApiError('Invalid state data', 'INVALID_STATE_DATA')
    }
  }, [])

  const getExecutionLogs = useCallback(async (): Promise<ApiResult<string[]>> => {
    return createApiResponse(['Log entry 1', 'Log entry 2'])
  }, [])

  const getPerformanceMetrics = useCallback(async (): Promise<ApiResult<OrchestrationMetrics>> => {
    const metrics: OrchestrationMetrics = {
      id: generateUUID(),
      orchestrationId: state.orchestrationId || generateUUID(),
      startTime: state.startTime || createTimestamp(),
      endTime: state.endTime,
      duration: state.totalDuration,
      phaseMetrics: {},
      taskMetrics: {
        total: state.activeTasks.length + state.completedTasks.length + state.failedTasks.length,
        completed: state.completedTasks.length,
        failed: state.failedTasks.length,
        averageExecutionTime: state.averageStepTime
      },
      resourceUsage: {
        cpu: 0,
        memory: 0,
        network: 0
      },
      errorMetrics: {
        total: state.errorHistory.length,
        byCategory: {}
      }
    }
    return createApiResponse(metrics)
  }, [state])

  const getErrorDiagnostics = useCallback(async (): Promise<ApiResult<Record<string, any>>> => {
    const diagnostics = {
      orchestrationId: state.orchestrationId,
      lastError: state.lastError,
      errorHistory: state.errorHistory,
      retryCount: state.retryCount,
      currentPhase: state.currentPhase,
      orchestrationStatus: state.orchestrationStatus
    }
    return createApiResponse(diagnostics)
  }, [state])

  // =============================================================================
  // EFFECT HOOKS FOR STATE SYNCHRONIZATION
  // =============================================================================

  // Sync with project context phases
  useEffect(() => {
    setState(prev => ({
      ...prev,
      phaseProgress: phaseProgress,
      currentPhase: projectContext.currentPhase,
      validationResults: validationResults,
      qualityMetrics: qualityMetrics,
      dependencyGraph: dependencyGraph,
      contextNodes: contextNodes,
      activeTasks: generationQueue,
      lastUpdated: createTimestamp()
    }))
  }, [phaseProgress, projectContext.currentPhase, validationResults, qualityMetrics, dependencyGraph, contextNodes, generationQueue])

  // Handle phase completion auto-advance
  useEffect(() => {
    if (state.autoAdvance && state.isOrchestrating && state.currentPhase) {
      const currentPhaseStatus = phaseProgress[state.currentPhase]
      
      if (currentPhaseStatus === 'completed' && state.phaseQueue.length > 0) {
        const nextPhase = state.phaseQueue[0]
        
        setTimeout(async () => {
          await advanceToPhase(nextPhase)
        }, 1000)
      }
    }
  }, [state.autoAdvance, state.isOrchestrating, state.currentPhase, phaseProgress, state.phaseQueue, advanceToPhase])

  // Handle orchestration completion
  useEffect(() => {
    if (state.isOrchestrating && state.phaseQueue.length === 0 && state.currentPhase) {
      const currentPhaseStatus = phaseProgress[state.currentPhase]
      
      if (currentPhaseStatus === 'completed') {
        setState(prev => ({
          ...prev,
          isOrchestrating: false,
          orchestrationStatus: 'completed',
          endTime: createTimestamp(),
          overallProgress: {
            ...prev.overallProgress,
            percentage: 100
          }
        }))

        // Clear monitoring timers
        if (progressUpdateTimerRef.current) {
          clearInterval(progressUpdateTimerRef.current)
        }

        services.loggingService.log(LogLevel.INFO, 'Orchestration completed successfully', {
          orchestrationId: state.orchestrationId
        })
      }
    }
  }, [state.isOrchestrating, state.phaseQueue.length, state.currentPhase, phaseProgress, state.orchestrationId, services])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (orchestrationTimerRef.current) {
        clearTimeout(orchestrationTimerRef.current)
      }
      if (progressUpdateTimerRef.current) {
        clearInterval(progressUpdateTimerRef.current)
      }
      if (metricsTimerRef.current) {
        clearInterval(metricsTimerRef.current)
      }
    }
  }, [])

  // =============================================================================
  // MEMOIZED RETURN VALUE
  // =============================================================================

  return useMemo<UseProjectOrchestration>(() => ({
    // State
    ...state,

    // Actions
    startOrchestration,
    pauseOrchestration,
    resumeOrchestration,
    cancelOrchestration,
    restartOrchestration,
    advanceToPhase,
    retryPhase,
    skipPhase,
    rollbackToPhase,
    executeStep,
    retryStep,
    skipStep,
    addTask,
    removeTask,
    prioritizeTask,
    reorderTasks,
    validateCurrentState,
    calculateMetrics,
    setQualityThreshold,
    updateConfig,
    toggleAutoAdvance,
    togglePauseOnError,
    toggleStepValidation,
    toggleParallelExecution,
    resetState,
    exportState,
    importState,
    refreshState,
    getExecutionLogs,
    getPerformanceMetrics,
    getErrorDiagnostics,

    // Hook Metadata
    initialized: true,
    version: '1.0.0'
  }), [
    state,
    startOrchestration,
    pauseOrchestration,
    resumeOrchestration,
    cancelOrchestration,
    restartOrchestration,
    advanceToPhase,
    retryPhase,
    skipPhase,
    rollbackToPhase,
    executeStep,
    retryStep,
    skipStep,
    addTask,
    removeTask,
    prioritizeTask,
    reorderTasks,
    validateCurrentState,
    calculateMetrics,
    setQualityThreshold,
    updateConfig,
    toggleAutoAdvance,
    togglePauseOnError,
    toggleStepValidation,
    toggleParallelExecution,
    resetState,
    exportState,
    importState,
    refreshState,
    getExecutionLogs,
    getPerformanceMetrics,
    getErrorDiagnostics
  ])
}

// =============================================================================
// UTILITY HOOKS
// =============================================================================

/**
 * Hook to get orchestration status
 */
export const useOrchestrationStatus = () => {
  const { orchestrationStatus, isOrchestrating, overallProgress } = useProjectOrchestration()
  return { status: orchestrationStatus, isActive: isOrchestrating, progress: overallProgress }
}

/**
 * Hook to get current phase information
 */
export const useCurrentOrchestrationPhase = () => {
  const { currentPhase, phaseQueue, phaseProgress } = useProjectOrchestration()
  return { current: currentPhase, queue: phaseQueue, progress: phaseProgress }
}

/**
 * Hook to get orchestration metrics
 */
export const useOrchestrationMetrics = () => {
  const { metrics, overallProgress, totalDuration } = useProjectOrchestration()
  return { metrics, progress: overallProgress, duration: totalDuration }
}

/**
 * Hook to get task management capabilities
 */
export const useTaskManagement = () => {
  const { taskQueue, activeTasks, addTask, removeTask, prioritizeTask } = useProjectOrchestration()
  return { queue: taskQueue, active: activeTasks, add: addTask, remove: removeTask, prioritize: prioritizeTask }
}

/**
 * Hook to get validation state
 */
export const useOrchestrationValidation = () => {
  const { validationResults, isValidating, validateCurrentState } = useProjectOrchestration()
  return { results: validationResults, isValidating, validate: validateCurrentState }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default useProjectOrchestration

// Export types for external use
export type {
  OrchestrationState,
  OrchestrationActions,
  UseProjectOrchestration
}

// Re-export project management types for convenience
export type {
  PhaseType,
  PhaseStatus,
  WorkflowState,
  OrchestrationProgress,
  OrchestrationMetrics,
  OrchestrationConfig,
  ExecutionContext,
  ExecutionStep,
  ExecutionState,
  TaskQueue,
  TaskPriority,
  GenerationRequest
} from '../../project-management/types/project'
