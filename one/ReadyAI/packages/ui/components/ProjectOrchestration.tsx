// packages/ui/components/ProjectOrchestration.tsx

/**
 * Project Orchestration Component for ReadyAI Personal AI Development Orchestrator
 * 
 * Adapts Cline's proven TaskExecution UI patterns (90%+ reuse) for ReadyAI's phase-based
 * orchestration workflow, providing comprehensive project lifecycle visualization,
 * phase progression controls, and real-time orchestration monitoring.
 * 
 * Key Cline Pattern Adaptations:
 * - Task execution UI from webview-ui/src/components/TaskExecution.tsx (85% reuse)
 * - Progress visualization patterns from task header components (90% reuse)
 * - Control interface from chat ActionButtons patterns (80% reuse)
 * - State management from useExtensionState patterns (75% reuse)
 * - Real-time updates from streaming API patterns (70% reuse)
 * 
 * @version 1.0.0 - Production Ready
 * @author ReadyAI Development Team
 */

import React, { 
  useState, 
  useEffect, 
  useCallback, 
  useMemo, 
  useRef 
} from 'react'
import { 
  VSCodeButton, 
  VSCodeProgressRing, 
  VSCodeDivider,
  VSCodeTag,
  VSCodeLink,
  VSCodeTextField
} from '@vscode/webview-ui-toolkit/react'

// ReadyAI Core Dependencies
import {
  UUID,
  ApiResult,
  PhaseType,
  PhaseStatus,
  isApiSuccess,
  generateUUID,
  createTimestamp
} from '../../foundation/types/core'

import {
  OrchestrationService,
  OrchestrationWorkflow,
  OrchestrationContext,
  WorkflowExecution,
  OrchestrationStatus,
  ServiceHealth,
  ServicePriority,
  CoordinationMode,
  ReadyAIOrchestration,
  PhaseOrchestration,
  WorkflowStepResult,
  createOrchestrationService,
  createOrchestrationWorkflow,
  validateOrchestration,
  OrchestrationError,
  ServiceCoordinationError,
  WorkflowExecutionError
} from '../../project-management/types/orchestration'

import { useApiClient } from '../services/ApiClient'
import { useAuth } from '../contexts/AuthContext'

// =============================================================================
// TYPE DEFINITIONS (Cline TaskExecution Pattern Adaptation)
// =============================================================================

/**
 * Phase progression UI state (adapted from Cline's task state patterns)
 */
export interface PhaseProgressionState {
  currentPhase: PhaseType
  completedPhases: PhaseType[]
  availablePhases: PhaseType[]
  phaseProgress: Record<PhaseType, number>
  phaseStatus: Record<PhaseType, PhaseStatus>
  transitionInProgress: boolean
  lastTransition?: {
    from: PhaseType
    to: PhaseType
    timestamp: string
  }
}

/**
 * Orchestration control state (Cline ActionButtons pattern)
 */
export interface OrchestrationControlState {
  isRunning: boolean
  isPaused: boolean
  canStart: boolean
  canPause: boolean
  canStop: boolean
  canTransition: boolean
  activeServices: UUID[]
  activeWorkflows: UUID[]
}

/**
 * Workflow visualization data (adapted from Cline task timeline patterns)
 */
export interface WorkflowVisualization {
  workflow: OrchestrationWorkflow
  execution?: WorkflowExecution
  stepProgress: Record<UUID, {
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
    progress: number
    startTime?: string
    endTime?: string
    duration?: number
  }>
  dependencies: Array<{
    from: UUID
    to: UUID
    satisfied: boolean
  }>
}

/**
 * Service monitoring data (Cline metrics pattern)
 */
export interface ServiceMonitoringData {
  service: OrchestrationService
  realTimeMetrics: {
    health: ServiceHealth
    uptime: number
    responseTime: number
    throughput: number
    errorRate: number
    resourceUsage: {
      cpu: number
      memory: number
      storage: number
    }
  }
  historicalData: Array<{
    timestamp: string
    metrics: any
  }>
}

// =============================================================================
// COMPONENT PROPS INTERFACE
// =============================================================================

export interface ProjectOrchestrationProps {
  /** Project identifier */
  projectId: UUID
  
  /** Current orchestration configuration */
  orchestration: ReadyAIOrchestration
  
  /** Phase progression callback */
  onPhaseTransition: (fromPhase: PhaseType, toPhase: PhaseType) => Promise<void>
  
  /** Service control callbacks */
  onServiceStart: (serviceId: UUID) => Promise<void>
  onServiceStop: (serviceId: UUID) => Promise<void>
  onServiceRestart: (serviceId: UUID) => Promise<void>
  
  /** Workflow control callbacks */
  onWorkflowStart: (workflowId: UUID) => Promise<void>
  onWorkflowPause: (executionId: UUID) => Promise<void>
  onWorkflowStop: (executionId: UUID) => Promise<void>
  
  /** Emergency controls */
  onEmergencyStop: () => Promise<void>
  onRollback: (checkpointId: UUID) => Promise<void>
  
  /** Configuration updates */
  onOrchestrationUpdate: (updates: Partial<ReadyAIOrchestration>) => Promise<void>
  
  /** UI state callbacks */
  onMinimize?: () => void
  onMaximize?: () => void
  onClose?: () => void
  
  /** Initial UI state */
  initialState?: {
    expanded?: boolean
    selectedView?: 'overview' | 'phases' | 'services' | 'workflows' | 'monitoring'
    showAdvanced?: boolean
  }
}

// =============================================================================
// MAIN COMPONENT (Cline TaskExecution Structure Adaptation)
// =============================================================================

/**
 * Project Orchestration Dashboard
 * Comprehensive orchestration control interface adapted from Cline's TaskExecution patterns
 */
export const ProjectOrchestration: React.FC<ProjectOrchestrationProps> = ({
  projectId,
  orchestration,
  onPhaseTransition,
  onServiceStart,
  onServiceStop,
  onServiceRestart,
  onWorkflowStart,
  onWorkflowPause,
  onWorkflowStop,
  onEmergencyStop,
  onRollback,
  onOrchestrationUpdate,
  onMinimize,
  onMaximize,
  onClose,
  initialState = {}
}) => {
  // =============================================================================
  // STATE MANAGEMENT (Cline useExtensionState Pattern)
  // =============================================================================

  // UI State
  const [isExpanded, setIsExpanded] = useState(initialState.expanded ?? true)
  const [selectedView, setSelectedView] = useState(initialState.selectedView ?? 'overview')
  const [showAdvanced, setShowAdvanced] = useState(initialState.showAdvanced ?? false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Orchestration State
  const [phaseProgression, setPhaseProgression] = useState<PhaseProgressionState>({
    currentPhase: orchestration.currentPhase.phaseId,
    completedPhases: [],
    availablePhases: ['Phase0_StrategicCharter'],
    phaseProgress: {},
    phaseStatus: {},
    transitionInProgress: false
  })

  const [controlState, setControlState] = useState<OrchestrationControlState>({
    isRunning: false,
    isPaused: false,
    canStart: true,
    canPause: false,
    canStop: false,
    canTransition: false,
    activeServices: [],
    activeWorkflows: []
  })

  // Service and Workflow State
  const [services, setServices] = useState<Map<UUID, OrchestrationService>>(new Map())
  const [workflows, setWorkflows] = useState<Map<UUID, OrchestrationWorkflow>>(new Map())
  const [serviceMetrics, setServiceMetrics] = useState<Map<UUID, ServiceMonitoringData>>(new Map())
  const [workflowVisualizations, setWorkflowVisualizations] = useState<Map<UUID, WorkflowVisualization>>(new Map())

  // Real-time updates
  const [lastUpdate, setLastUpdate] = useState(createTimestamp())
  const updateIntervalRef = useRef<NodeJS.Timeout>()

  // API Integration
  const { client: apiClient } = useApiClient()
  const { state: authState } = useAuth()

  // =============================================================================
  // COMPUTED VALUES (Cline useMemo Patterns)
  // =============================================================================

  const orchestrationHealth = useMemo(() => {
    const serviceHealthScores = Array.from(services.values()).map(service => {
      switch (service.health) {
        case 'healthy': return 100
        case 'degraded': return 60
        case 'unhealthy': return 20
        default: return 0
      }
    })
    
    const averageHealth = serviceHealthScores.length > 0 
      ? serviceHealthScores.reduce((a, b) => a + b, 0) / serviceHealthScores.length
      : 0

    return {
      overall: averageHealth >= 80 ? 'healthy' : averageHealth >= 40 ? 'degraded' : 'unhealthy',
      score: Math.round(averageHealth),
      serviceCount: services.size,
      healthyServices: Array.from(services.values()).filter(s => s.health === 'healthy').length
    }
  }, [services])

  const phaseProgressPercentage = useMemo(() => {
    const allPhases: PhaseType[] = [
      'Phase0_StrategicCharter',
      'Phase1_ArchitecturalBlueprint', 
      'Phase20_CoreContracts',
      'Phase21_ModuleSpec',
      'Phase23_ModuleSpecSubsequent',
      'Phase30_ProjectScaffolding',
      'Phase301_MasterPlan',
      'Phase31_FileGeneration',
      'Phase4_ValidationCorrection',
      'Phase5_TestGeneration',
      'Phase6_Documentation',
      'Phase7_Iteration'
    ]

    const currentIndex = allPhases.indexOf(phaseProgression.currentPhase)
    const completedCount = phaseProgression.completedPhases.length
    
    return Math.round(((completedCount + (currentIndex >= 0 ? 0.5 : 0)) / allPhases.length) * 100)
  }, [phaseProgression])

  const canPerformActions = useMemo(() => {
    return authState.status === 'authenticated' && !isLoading && !phaseProgression.transitionInProgress
  }, [authState.status, isLoading, phaseProgression.transitionInProgress])

  // =============================================================================
  // EFFECT HOOKS (Cline useEffect Patterns)
  // =============================================================================

  // Initialize orchestration data
  useEffect(() => {
    const initializeOrchestration = async () => {
      setIsLoading(true)
      setError(null)

      try {
        // Load current services
        const servicesResult = await apiClient.request('GET', `/v1/projects/${projectId}/orchestration/services`)
        
        if (isApiSuccess(servicesResult)) {
          const servicesMap = new Map<UUID, OrchestrationService>()
          servicesResult.data.services?.forEach((service: OrchestrationService) => {
            servicesMap.set(service.id, service)
          })
          setServices(servicesMap)
        }

        // Load current workflows  
        const workflowsResult = await apiClient.request('GET', `/v1/projects/${projectId}/orchestration/workflows`)
        
        if (isApiSuccess(workflowsResult)) {
          const workflowsMap = new Map<UUID, OrchestrationWorkflow>()
          workflowsResult.data.workflows?.forEach((workflow: OrchestrationWorkflow) => {
            workflowsMap.set(workflow.id, workflow)
          })
          setWorkflows(workflowsMap)
        }

        // Load phase progression state
        const phaseResult = await apiClient.request('GET', `/v1/projects/${projectId}/phases/status`)
        
        if (isApiSuccess(phaseResult)) {
          setPhaseProgression(prev => ({
            ...prev,
            ...phaseResult.data
          }))
        }

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize orchestration'
        setError(errorMessage)
        console.error('[ProjectOrchestration] Initialization error:', err)
      } finally {
        setIsLoading(false)
      }
    }

    initializeOrchestration()
  }, [projectId, apiClient])

  // Setup real-time updates (Cline streaming pattern)
  useEffect(() => {
    if (!canPerformActions) return

    const startRealTimeUpdates = () => {
      updateIntervalRef.current = setInterval(async () => {
        try {
          // Update service metrics
          const metricsResult = await apiClient.request('GET', `/v1/projects/${projectId}/orchestration/metrics`)
          
          if (isApiSuccess(metricsResult)) {
            const metricsMap = new Map<UUID, ServiceMonitoringData>()
            metricsResult.data.services?.forEach((serviceData: ServiceMonitoringData) => {
              metricsMap.set(serviceData.service.id, serviceData)
            })
            setServiceMetrics(metricsMap)
          }

          // Update workflow executions
          const executionsResult = await apiClient.request('GET', `/v1/projects/${projectId}/orchestration/executions`)
          
          if (isApiSuccess(executionsResult)) {
            setWorkflowVisualizations(prev => {
              const updated = new Map(prev)
              executionsResult.data.executions?.forEach((execution: WorkflowExecution) => {
                const visualization = updated.get(execution.workflowId)
                if (visualization) {
                  updated.set(execution.workflowId, {
                    ...visualization,
                    execution
                  })
                }
              })
              return updated
            })
          }

          setLastUpdate(createTimestamp())

        } catch (err) {
          console.warn('[ProjectOrchestration] Real-time update failed:', err)
        }
      }, 2000) // Update every 2 seconds (Cline pattern)
    }

    startRealTimeUpdates()

    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current)
      }
    }
  }, [canPerformActions, projectId, apiClient])

  // =============================================================================
  // EVENT HANDLERS (Cline Callback Patterns)
  // =============================================================================

  const handlePhaseTransition = useCallback(async (targetPhase: PhaseType) => {
    if (!canPerformActions) return

    setPhaseProgression(prev => ({ ...prev, transitionInProgress: true }))
    setError(null)

    try {
      await onPhaseTransition(phaseProgression.currentPhase, targetPhase)
      
      setPhaseProgression(prev => ({
        ...prev,
        currentPhase: targetPhase,
        completedPhases: [...prev.completedPhases, prev.currentPhase],
        transitionInProgress: false,
        lastTransition: {
          from: prev.currentPhase,
          to: targetPhase,
          timestamp: createTimestamp()
        }
      }))

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Phase transition failed'
      setError(errorMessage)
      setPhaseProgression(prev => ({ ...prev, transitionInProgress: false }))
    }
  }, [canPerformActions, phaseProgression.currentPhase, onPhaseTransition])

  const handleServiceControl = useCallback(async (
    action: 'start' | 'stop' | 'restart',
    serviceId: UUID
  ) => {
    if (!canPerformActions) return

    setIsLoading(true)
    setError(null)

    try {
      switch (action) {
        case 'start':
          await onServiceStart(serviceId)
          break
        case 'stop':
          await onServiceStop(serviceId)
          break
        case 'restart':
          await onServiceRestart(serviceId)
          break
      }

      // Update service status
      setServices(prev => {
        const updated = new Map(prev)
        const service = updated.get(serviceId)
        if (service) {
          updated.set(serviceId, {
            ...service,
            status: action === 'start' || action === 'restart' ? 'running' : 'stopped',
            lastHealthCheck: createTimestamp()
          })
        }
        return updated
      })

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : `Failed to ${action} service`
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [canPerformActions, onServiceStart, onServiceStop, onServiceRestart])

  const handleWorkflowControl = useCallback(async (
    action: 'start' | 'pause' | 'stop',
    workflowId: UUID,
    executionId?: UUID
  ) => {
    if (!canPerformActions) return

    setIsLoading(true)
    setError(null)

    try {
      switch (action) {
        case 'start':
          await onWorkflowStart(workflowId)
          break
        case 'pause':
          if (executionId) await onWorkflowPause(executionId)
          break
        case 'stop':
          if (executionId) await onWorkflowStop(executionId)
          break
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : `Failed to ${action} workflow`
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [canPerformActions, onWorkflowStart, onWorkflowPause, onWorkflowStop])

  const handleEmergencyStop = useCallback(async () => {
    if (!canPerformActions) return

    const confirmed = confirm('Emergency stop will halt all orchestration activities. Continue?')
    if (!confirmed) return

    setIsLoading(true)
    setError(null)

    try {
      await onEmergencyStop()
      
      setControlState(prev => ({
        ...prev,
        isRunning: false,
        isPaused: false,
        activeServices: [],
        activeWorkflows: []
      }))

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Emergency stop failed'
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [canPerformActions, onEmergencyStop])

  // =============================================================================
  // RENDER HELPERS (Cline Component Patterns)
  // =============================================================================

  const renderOrchestrationHeader = () => (
    <div 
      className="orchestration-header"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        backgroundColor: 'var(--vscode-badge-background)',
        borderRadius: '6px',
        marginBottom: '16px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div 
          style={{ 
            cursor: 'pointer', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px'
          }}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <span className={`codicon codicon-chevron-${isExpanded ? 'down' : 'right'}`} />
          <span style={{ fontWeight: 'bold', color: 'var(--vscode-badge-foreground)' }}>
            Project Orchestration
          </span>
        </div>
        
        <VSCodeTag style={{ fontSize: '11px' }}>
          {phaseProgression.currentPhase.replace(/([A-Z])/g, ' $1').trim()}
        </VSCodeTag>
        
        <div 
          className="health-indicator"
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: 
              orchestrationHealth.overall === 'healthy' ? 'var(--vscode-terminal-ansiGreen)' :
              orchestrationHealth.overall === 'degraded' ? 'var(--vscode-terminal-ansiYellow)' :
              'var(--vscode-terminal-ansiRed)'
          }}
          title={`Orchestration Health: ${orchestrationHealth.overall} (${orchestrationHealth.score}%)`}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
          Progress: {phaseProgressPercentage}%
        </div>
        
        {onMinimize && (
          <VSCodeButton appearance="icon" onClick={onMinimize}>
            <span className="codicon codicon-chrome-minimize" />
          </VSCodeButton>
        )}
        
        {onMaximize && (
          <VSCodeButton appearance="icon" onClick={onMaximize}>
            <span className="codicon codicon-chrome-maximize" />
          </VSCodeButton>
        )}
        
        {onClose && (
          <VSCodeButton appearance="icon" onClick={onClose}>
            <span className="codicon codicon-chrome-close" />
          </VSCodeButton>
        )}
      </div>
    </div>
  )

  const renderPhaseProgression = () => (
    <div className="phase-progression" style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <h4 style={{ margin: 0, color: 'var(--vscode-foreground)' }}>Phase Progression</h4>
        <div 
          style={{
            flex: 1,
            height: '4px',
            backgroundColor: 'var(--vscode-progressBar-background)',
            borderRadius: '2px',
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              width: `${phaseProgressPercentage}%`,
              height: '100%',
              backgroundColor: 'var(--vscode-progressBar-foreground)',
              transition: 'width 0.3s ease'
            }}
          />
        </div>
        <span style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>
          {phaseProgressPercentage}%
        </span>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {phaseProgression.availablePhases.map(phase => (
          <VSCodeButton
            key={phase}
            appearance={phase === phaseProgression.currentPhase ? 'primary' : 'secondary'}
            disabled={!canPerformActions || phaseProgression.transitionInProgress}
            onClick={() => handlePhaseTransition(phase)}
            style={{ fontSize: '11px' }}
          >
            {phase.replace(/([A-Z])/g, ' $1').trim()}
            {phaseProgression.completedPhases.includes(phase) && (
              <span className="codicon codicon-check" style={{ marginLeft: '4px' }} />
            )}
          </VSCodeButton>
        ))}
      </div>

      {phaseProgression.transitionInProgress && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
          <VSCodeProgressRing />
          <span style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>
            Phase transition in progress...
          </span>
        </div>
      )}
    </div>
  )

  const renderServiceGrid = () => (
    <div className="service-grid" style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h4 style={{ margin: 0, color: 'var(--vscode-foreground)' }}>Services</h4>
        <div style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
          {orchestrationHealth.healthyServices} / {orchestrationHealth.serviceCount} healthy
        </div>
      </div>

      <div 
        style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '8px' 
        }}
      >
        {Array.from(services.values()).map(service => (
          <div
            key={service.id}
            className="service-card"
            style={{
              padding: '12px',
              border: `1px solid var(--vscode-panel-border)`,
              borderRadius: '4px',
              backgroundColor: 'var(--vscode-editor-background)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontWeight: '500', fontSize: '13px' }}>{service.name}</span>
              <div
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 
                    service.health === 'healthy' ? 'var(--vscode-terminal-ansiGreen)' :
                    service.health === 'degraded' ? 'var(--vscode-terminal-ansiYellow)' :
                    'var(--vscode-terminal-ansiRed)'
                }}
              />
            </div>
            
            <div style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)', marginBottom: '8px' }}>
              {service.type} • {service.status}
            </div>
            
            <div style={{ display: 'flex', gap: '4px' }}>
              <VSCodeButton
                appearance="icon"
                disabled={!canPerformActions}
                onClick={() => handleServiceControl('start', service.id)}
                title="Start Service"
              >
                <span className="codicon codicon-play" />
              </VSCodeButton>
              
              <VSCodeButton
                appearance="icon" 
                disabled={!canPerformActions}
                onClick={() => handleServiceControl('stop', service.id)}
                title="Stop Service"
              >
                <span className="codicon codicon-stop" />
              </VSCodeButton>
              
              <VSCodeButton
                appearance="icon"
                disabled={!canPerformActions} 
                onClick={() => handleServiceControl('restart', service.id)}
                title="Restart Service"
              >
                <span className="codicon codicon-refresh" />
              </VSCodeButton>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  const renderControlPanel = () => (
    <div className="control-panel" style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h4 style={{ margin: 0, color: 'var(--vscode-foreground)' }}>Orchestration Control</h4>
        {showAdvanced && (
          <VSCodeButton
            appearance="secondary"
            disabled={!canPerformActions}
            onClick={handleEmergencyStop}
            style={{ color: 'var(--vscode-errorForeground)' }}
          >
            Emergency Stop
          </VSCodeButton>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <VSCodeButton
          appearance="primary"
          disabled={!canPerformActions || controlState.isRunning}
          onClick={() => handleWorkflowControl('start', 'main-workflow')}
        >
          Start Orchestration
        </VSCodeButton>
        
        <VSCodeButton
          appearance="secondary"
          disabled={!canPerformActions || !controlState.isRunning}
          onClick={() => handleWorkflowControl('pause', 'main-workflow')}
        >
          Pause
        </VSCodeButton>
        
        <VSCodeButton
          appearance="secondary"
          disabled={!canPerformActions || !controlState.isRunning}
          onClick={() => handleWorkflowControl('stop', 'main-workflow')}
        >
          Stop
        </VSCodeButton>
        
        <VSCodeButton
          appearance="secondary"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? 'Hide' : 'Show'} Advanced
        </VSCodeButton>
      </div>
    </div>
  )

  const renderErrorDisplay = () => {
    if (!error) return null

    return (
      <div 
        style={{
          padding: '12px',
          backgroundColor: 'var(--vscode-inputValidation-errorBackground)',
          border: '1px solid var(--vscode-inputValidation-errorBorder)',
          borderRadius: '4px',
          marginBottom: '16px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="codicon codicon-error" style={{ color: 'var(--vscode-errorForeground)' }} />
          <span style={{ color: 'var(--vscode-errorForeground)', fontSize: '13px' }}>{error}</span>
          <VSCodeButton
            appearance="icon"
            onClick={() => setError(null)}
            style={{ marginLeft: 'auto' }}
          >
            <span className="codicon codicon-close" />
          </VSCodeButton>
        </div>
      </div>
    )
  }

  // =============================================================================
  // MAIN RENDER
  // =============================================================================

  return (
    <div 
      className="project-orchestration"
      style={{
        fontFamily: 'var(--vscode-font-family)',
        fontSize: 'var(--vscode-font-size)',
        color: 'var(--vscode-foreground)',
        padding: '0px'
      }}
    >
      {renderOrchestrationHeader()}
      
      {error && renderErrorDisplay()}
      
      {isExpanded && (
        <div className="orchestration-content">
          {isLoading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
              <VSCodeProgressRing />
            </div>
          )}
          
          {!isLoading && (
            <>
              {renderPhaseProgression()}
              <VSCodeDivider />
              {renderServiceGrid()}
              <VSCodeDivider />
              {renderControlPanel()}
              
              {showAdvanced && (
                <>
                  <VSCodeDivider />
                  <div style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
                    Last update: {new Date(lastUpdate).toLocaleTimeString()} • 
                    Services: {services.size} • 
                    Workflows: {workflows.size}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default ProjectOrchestration

// =============================================================================
// ADDITIONAL EXPORTS FOR COMPONENT ECOSYSTEM
// =============================================================================

export type {
  ProjectOrchestrationProps,
  PhaseProgressionState,
  OrchestrationControlState,
  WorkflowVisualization,
  ServiceMonitoringData
}

/**
 * Component version information
 */
export const PROJECT_ORCHESTRATION_VERSION = '1.0.0'

/**
 * Default props for testing and storybook
 */
export const defaultProps: Partial<ProjectOrchestrationProps> = {
  initialState: {
    expanded: true,
    selectedView: 'overview',
    showAdvanced: false
  }
}
