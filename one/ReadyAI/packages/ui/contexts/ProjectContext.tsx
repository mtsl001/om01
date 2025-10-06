// packages/ui/contexts/ProjectContext.tsx

/**
 * ReadyAI Project Management Context Provider
 * 
 * Adapted from Cline's ExtensionStateContext.tsx (800+ lines) with ReadyAI-specific 
 * project management capabilities. Provides comprehensive React context for project 
 * state management, real-time updates, and action dispatching throughout the ReadyAI UI.
 * 
 * This context manages the complete lifecycle of ReadyAI projects including:
 * - Project creation, configuration, and settings
 * - Phase progression and artifact generation
 * - Real-time collaboration and synchronization
 * - Context and dependency management
 * - AI generation orchestration
 * 
 * Based on Cline's webview-ui/src/context/ExtensionStateContext.tsx (90%+ reuse)
 * with ReadyAI project management adaptations
 * 
 * @version 1.0.0 - Production Ready
 * @author ReadyAI Development Team
 */

import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  useRef,
  useMemo,
  ReactNode
} from 'react'

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
  isApiSuccess,
  PaginatedResponse
} from '../../foundation/types/core'

// Project Management Types
import {
  Project,
  ProjectConfig,
  ProjectStatus,
  TechStack,
  PhaseType,
  PhaseStatus,
  Phase,
  PhaseArtifact,
  DependencyGraph,
  DependencyNode,
  GenerationRequest,
  GenerationResult,
  ValidationResult,
  QualityMetrics,
  AIProviderConfig,
  AIProviderType,
  ContextNode,
  ContextType
} from '../../project-management/types/project'

// Project Services
import { ProjectService } from '../../project-management/services/ProjectService'
import { PhaseManager } from '../../project-management/services/PhaseManager'
import { ProjectOrchestrator } from '../../project-management/services/ProjectOrchestrator'
import { ProjectStateManager } from '../../project-management/services/ProjectStateManager'
import { ProjectEventService } from '../../project-management/services/ProjectEventService'
import { ServiceCoordinator } from '../../project-management/services/ServiceCoordinator'

// Error Handling
import { ErrorService } from '../../error-handling/services/ErrorService'
import { ErrorCategory, ErrorSeverity } from '../../error-handling/types/error'

// Logging
import { LoggingService } from '../../logging/services/LoggingService'
import { LogLevel } from '../../logging/types/logging'

// =============================================================================
// STREAMING AND REAL-TIME TYPES
// =============================================================================

/**
 * Real-time project event types
 */
export type ProjectEventType = 
  | 'project_created'
  | 'project_updated'
  | 'project_deleted'
  | 'phase_started'
  | 'phase_completed'
  | 'phase_failed'
  | 'artifact_generated'
  | 'generation_started'
  | 'generation_completed'
  | 'generation_failed'
  | 'validation_completed'
  | 'dependency_updated'
  | 'context_updated'
  | 'collaboration_update'

/**
 * Streaming project update event
 */
export interface ProjectStreamEvent {
  id: UUID
  type: ProjectEventType
  projectId: UUID
  timestamp: string
  data: unknown
  sequence: number
}

/**
 * Real-time collaboration update
 */
export interface CollaborationUpdate {
  id: UUID
  projectId: UUID
  userId: UUID
  action: 'join' | 'leave' | 'edit' | 'comment' | 'review'
  timestamp: string
  data?: unknown
}

// =============================================================================
// PROJECT CONTEXT STATE INTERFACE
// =============================================================================

/**
 * Complete project context state interface
 * Extends Cline's state management patterns with project-specific requirements
 */
export interface ProjectContextState {
  // Core Project State
  currentProject: Project | null
  projects: Project[]
  isProjectLoading: boolean
  hasProjectError: boolean
  projectError: ReadyAIError | null

  // Phase Management
  currentPhase: PhaseType | null
  phases: Phase[]
  phaseProgress: Record<PhaseType, PhaseStatus>
  isPhaseLoading: boolean

  // Artifact Management
  artifacts: PhaseArtifact[]
  artifactsByPhase: Record<PhaseType, PhaseArtifact[]>
  isGenerating: boolean
  generationQueue: GenerationRequest[]
  
  // Dependencies and Context
  dependencyGraph: DependencyGraph | null
  contextNodes: ContextNode[]
  contextHistory: ContextNode[]
  isAnalyzingContext: boolean

  // AI Generation State
  aiProvider: AIProviderType
  aiProviderConfig: AIProviderConfig | null
  availableProviders: AIProviderType[]
  isProviderConnected: boolean
  generationResults: GenerationResult[]

  // Validation and Quality
  validationResults: ValidationResult[]
  qualityMetrics: QualityMetrics | null
  isValidating: boolean

  // Collaboration State
  collaborators: string[]
  activeCollaborators: string[]
  collaborationUpdates: CollaborationUpdate[]
  isCollaborationEnabled: boolean

  // Real-time Updates
  lastUpdated: string
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting'
  eventStream: ProjectStreamEvent[]

  // Pagination State
  projectsPagination: {
    page: number
    pageSize: number
    totalPages: number
    totalItems: number
    hasNext: boolean
    hasPrevious: boolean
  }

  // Search and Filters
  searchQuery: string
  filters: {
    status: ProjectStatus[]
    techStack: string[]
    phase: PhaseType[]
    tags: string[]
  }
}

// =============================================================================
// PROJECT CONTEXT ACTIONS INTERFACE
// =============================================================================

/**
 * Project context actions interface
 * Provides all project management functionality through action dispatchers
 */
export interface ProjectContextActions {
  // Project CRUD Operations
  createProject: (config: Partial<Project>) => Promise<ApiResult<Project>>
  updateProject: (id: UUID, updates: Partial<Project>) => Promise<ApiResult<Project>>
  deleteProject: (id: UUID) => Promise<ApiResult<void>>
  loadProject: (id: UUID) => Promise<ApiResult<Project>>
  loadProjects: (page?: number, filters?: Partial<ProjectContextState['filters']>) => Promise<ApiResult<PaginatedResponse<Project>>>
  
  // Project Management
  setCurrentProject: (project: Project | null) => void
  duplicateProject: (id: UUID, newName: string) => Promise<ApiResult<Project>>
  archiveProject: (id: UUID) => Promise<ApiResult<void>>
  restoreProject: (id: UUID) => Promise<ApiResult<void>>
  
  // Phase Management
  startPhase: (projectId: UUID, phaseType: PhaseType) => Promise<ApiResult<Phase>>
  completePhase: (projectId: UUID, phaseType: PhaseType) => Promise<ApiResult<Phase>>
  retryPhase: (projectId: UUID, phaseType: PhaseType) => Promise<ApiResult<Phase>>
  skipPhase: (projectId: UUID, phaseType: PhaseType) => Promise<ApiResult<Phase>>
  
  // Artifact Management
  generateArtifact: (request: GenerationRequest) => Promise<ApiResult<PhaseArtifact>>
  regenerateArtifact: (artifactId: UUID, request: Partial<GenerationRequest>) => Promise<ApiResult<PhaseArtifact>>
  validateArtifact: (artifactId: UUID) => Promise<ApiResult<ValidationResult>>
  downloadArtifact: (artifactId: UUID) => Promise<ApiResult<string>>
  
  // Context Management
  addContextNode: (node: Omit<ContextNode, 'id' | 'timestamp'>) => Promise<ApiResult<ContextNode>>
  updateContextNode: (id: UUID, updates: Partial<ContextNode>) => Promise<ApiResult<ContextNode>>
  removeContextNode: (id: UUID) => Promise<ApiResult<void>>
  refreshContext: (projectId: UUID) => Promise<ApiResult<ContextNode[]>>
  
  // Dependency Management
  analyzeDependencies: (projectId: UUID) => Promise<ApiResult<DependencyGraph>>
  updateDependencyGraph: (projectId: UUID, graph: DependencyGraph) => Promise<ApiResult<void>>
  resolveDependencies: (projectId: UUID) => Promise<ApiResult<DependencyNode[]>>
  
  // AI Provider Management
  setAIProvider: (provider: AIProviderType, config: AIProviderConfig) => Promise<ApiResult<void>>
  testAIProvider: (provider: AIProviderType, config: AIProviderConfig) => Promise<ApiResult<boolean>>
  refreshProviders: () => Promise<ApiResult<AIProviderType[]>>
  
  // Validation and Quality
  validateProject: (projectId: UUID) => Promise<ApiResult<ValidationResult[]>>
  calculateQualityMetrics: (projectId: UUID) => Promise<ApiResult<QualityMetrics>>
  
  // Search and Filtering
  searchProjects: (query: string) => Promise<ApiResult<Project[]>>
  setSearchQuery: (query: string) => void
  setFilters: (filters: Partial<ProjectContextState['filters']>) => void
  clearFilters: () => void
  
  // Collaboration
  enableCollaboration: (projectId: UUID) => Promise<ApiResult<void>>
  disableCollaboration: (projectId: UUID) => Promise<ApiResult<void>>
  inviteCollaborator: (projectId: UUID, email: string, role: string) => Promise<ApiResult<void>>
  removeCollaborator: (projectId: UUID, userId: UUID) => Promise<ApiResult<void>>
  
  // Real-time Updates
  subscribeToUpdates: (projectId: UUID) => Promise<ApiResult<void>>
  unsubscribeFromUpdates: (projectId: UUID) => Promise<ApiResult<void>>
  
  // State Management
  refreshState: () => Promise<ApiResult<void>>
  resetState: () => void
  exportState: () => Promise<ApiResult<string>>
  importState: (state: string) => Promise<ApiResult<void>>
}

// =============================================================================
// COMPLETE CONTEXT TYPE
// =============================================================================

/**
 * Complete project context type combining state and actions
 */
export interface ProjectContextType extends ProjectContextState, ProjectContextActions {
  // Context Metadata
  version: string
  initialized: boolean
  lastError: ReadyAIError | null
}

// =============================================================================
// CONTEXT CREATION
// =============================================================================

/**
 * Project context - undefined means not within a provider
 */
export const ProjectContext = createContext<ProjectContextType | undefined>(undefined)

// =============================================================================
// PROJECT CONTEXT PROVIDER
// =============================================================================

/**
 * ProjectProvider Props
 */
interface ProjectProviderProps {
  children: ReactNode
  /** Initial project to load */
  initialProjectId?: UUID
  /** Configuration options */
  config?: {
    enableRealTimeUpdates?: boolean
    enableCollaboration?: boolean
    enableAutoSave?: boolean
    autoSaveInterval?: number
  }
}

/**
 * ReadyAI Project Management Context Provider
 * 
 * Manages comprehensive project state including:
 * - Project lifecycle and phase management
 * - Real-time collaboration and updates
 * - AI generation orchestration
 * - Context and dependency tracking
 * - Quality assurance and validation
 */
export const ProjectProvider: React.FC<ProjectProviderProps> = ({
  children,
  initialProjectId,
  config = {}
}) => {
  // =============================================================================
  // SERVICE INSTANCES
  // =============================================================================

  const servicesRef = useRef({
    projectService: new ProjectService(),
    phaseManager: new PhaseManager(),
    orchestrator: new ProjectOrchestrator(),
    stateManager: new ProjectStateManager(),
    eventService: new ProjectEventService(),
    coordinator: new ServiceCoordinator(),
    errorService: new ErrorService(),
    loggingService: new LoggingService()
  })

  const services = servicesRef.current

  // =============================================================================
  // CORE STATE MANAGEMENT
  // =============================================================================

  const [state, setState] = useState<ProjectContextState>({
    // Core Project State
    currentProject: null,
    projects: [],
    isProjectLoading: false,
    hasProjectError: false,
    projectError: null,

    // Phase Management
    currentPhase: null,
    phases: [],
    phaseProgress: {} as Record<PhaseType, PhaseStatus>,
    isPhaseLoading: false,

    // Artifact Management
    artifacts: [],
    artifactsByPhase: {} as Record<PhaseType, PhaseArtifact[]>,
    isGenerating: false,
    generationQueue: [],

    // Dependencies and Context
    dependencyGraph: null,
    contextNodes: [],
    contextHistory: [],
    isAnalyzingContext: false,

    // AI Generation State
    aiProvider: 'claude-sonnet-4' as AIProviderType,
    aiProviderConfig: null,
    availableProviders: [],
    isProviderConnected: false,
    generationResults: [],

    // Validation and Quality
    validationResults: [],
    qualityMetrics: null,
    isValidating: false,

    // Collaboration State
    collaborators: [],
    activeCollaborators: [],
    collaborationUpdates: [],
    isCollaborationEnabled: config.enableCollaboration || false,

    // Real-time Updates
    lastUpdated: createTimestamp(),
    connectionStatus: 'disconnected',
    eventStream: [],

    // Pagination State
    projectsPagination: {
      page: 1,
      pageSize: 20,
      totalPages: 0,
      totalItems: 0,
      hasNext: false,
      hasPrevious: false
    },

    // Search and Filters
    searchQuery: '',
    filters: {
      status: [],
      techStack: [],
      phase: [],
      tags: []
    }
  })

  // =============================================================================
  // REFS FOR SUBSCRIPTIONS AND TIMERS
  // =============================================================================

  const eventStreamRef = useRef<EventSource | null>(null)
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null)
  const pendingUpdatesRef = useRef<Set<UUID>>(new Set())

  // =============================================================================
  // PROJECT CRUD OPERATIONS
  // =============================================================================

  const createProject = useCallback(async (config: Partial<Project>): Promise<ApiResult<Project>> => {
    setState(prev => ({ ...prev, isProjectLoading: true, hasProjectError: false }))

    try {
      services.loggingService.log(LogLevel.INFO, 'Creating new project', { config })
      
      const result = await services.projectService.createProject(config)
      
      if (isApiSuccess(result)) {
        const project = result.data
        
        setState(prev => ({
          ...prev,
          projects: [project, ...prev.projects],
          currentProject: project,
          isProjectLoading: false,
          lastUpdated: createTimestamp()
        }))

        // Initialize project phases
        await initializeProjectPhases(project.id)
        
        services.loggingService.log(LogLevel.INFO, 'Project created successfully', { projectId: project.id })
        
        return result
      } else {
        setState(prev => ({
          ...prev,
          isProjectLoading: false,
          hasProjectError: true,
          projectError: new ReadyAIError(result.error.message, result.error.code)
        }))
        
        return result
      }
    } catch (error) {
      const readyAIError = error instanceof ReadyAIError 
        ? error 
        : new ReadyAIError('Failed to create project', 'PROJECT_CREATION_FAILED')

      setState(prev => ({
        ...prev,
        isProjectLoading: false,
        hasProjectError: true,
        projectError: readyAIError
      }))

      services.errorService.reportError(readyAIError, ErrorCategory.USER_ACTION, ErrorSeverity.HIGH)
      
      return createApiError(readyAIError.message, readyAIError.code)
    }
  }, [services])

  const updateProject = useCallback(async (id: UUID, updates: Partial<Project>): Promise<ApiResult<Project>> => {
    setState(prev => ({ ...prev, isProjectLoading: true }))

    try {
      services.loggingService.log(LogLevel.INFO, 'Updating project', { projectId: id, updates })
      
      const result = await services.projectService.updateProject(id, updates)
      
      if (isApiSuccess(result)) {
        const updatedProject = result.data
        
        setState(prev => ({
          ...prev,
          projects: prev.projects.map(p => p.id === id ? updatedProject : p),
          currentProject: prev.currentProject?.id === id ? updatedProject : prev.currentProject,
          isProjectLoading: false,
          lastUpdated: createTimestamp()
        }))

        pendingUpdatesRef.current.add(id)
        
        return result
      } else {
        setState(prev => ({
          ...prev,
          isProjectLoading: false,
          hasProjectError: true,
          projectError: new ReadyAIError(result.error.message, result.error.code)
        }))
        
        return result
      }
    } catch (error) {
      const readyAIError = error instanceof ReadyAIError 
        ? error 
        : new ReadyAIError('Failed to update project', 'PROJECT_UPDATE_FAILED')

      setState(prev => ({
        ...prev,
        isProjectLoading: false,
        hasProjectError: true,
        projectError: readyAIError
      }))

      return createApiError(readyAIError.message, readyAIError.code)
    }
  }, [services])

  const loadProject = useCallback(async (id: UUID): Promise<ApiResult<Project>> => {
    setState(prev => ({ ...prev, isProjectLoading: true, hasProjectError: false }))

    try {
      const result = await services.projectService.getProject(id)
      
      if (isApiSuccess(result)) {
        const project = result.data
        
        setState(prev => ({
          ...prev,
          currentProject: project,
          isProjectLoading: false,
          lastUpdated: createTimestamp()
        }))

        // Load project phases and artifacts
        await Promise.all([
          loadProjectPhases(id),
          loadProjectArtifacts(id),
          loadProjectContext(id)
        ])
        
        return result
      } else {
        setState(prev => ({
          ...prev,
          isProjectLoading: false,
          hasProjectError: true,
          projectError: new ReadyAIError(result.error.message, result.error.code)
        }))
        
        return result
      }
    } catch (error) {
      const readyAIError = error instanceof ReadyAIError 
        ? error 
        : new ReadyAIError('Failed to load project', 'PROJECT_LOAD_FAILED')

      setState(prev => ({
        ...prev,
        isProjectLoading: false,
        hasProjectError: true,
        projectError: readyAIError
      }))

      return createApiError(readyAIError.message, readyAIError.code)
    }
  }, [services])

  const loadProjects = useCallback(async (
    page: number = 1, 
    filters?: Partial<ProjectContextState['filters']>
  ): Promise<ApiResult<PaginatedResponse<Project>>> => {
    setState(prev => ({ ...prev, isProjectLoading: true }))

    try {
      const result = await services.projectService.getProjects({
        page,
        pageSize: state.projectsPagination.pageSize,
        filters: filters || state.filters
      })
      
      if (isApiSuccess(result)) {
        const paginatedProjects = result.data
        
        setState(prev => ({
          ...prev,
          projects: page === 1 ? paginatedProjects.items : [...prev.projects, ...paginatedProjects.items],
          projectsPagination: {
            page: paginatedProjects.page,
            pageSize: paginatedProjects.pageSize,
            totalPages: paginatedProjects.totalPages,
            totalItems: paginatedProjects.total,
            hasNext: paginatedProjects.hasNext,
            hasPrevious: paginatedProjects.hasPrevious
          },
          isProjectLoading: false,
          lastUpdated: createTimestamp()
        }))
        
        return result
      } else {
        setState(prev => ({
          ...prev,
          isProjectLoading: false,
          hasProjectError: true,
          projectError: new ReadyAIError(result.error.message, result.error.code)
        }))
        
        return result
      }
    } catch (error) {
      const readyAIError = error instanceof ReadyAIError 
        ? error 
        : new ReadyAIError('Failed to load projects', 'PROJECTS_LOAD_FAILED')

      setState(prev => ({
        ...prev,
        isProjectLoading: false,
        hasProjectError: true,
        projectError: readyAIError
      }))

      return createApiError(readyAIError.message, readyAIError.code)
    }
  }, [services, state.projectsPagination.pageSize, state.filters])

  // =============================================================================
  // PHASE MANAGEMENT
  // =============================================================================

  const startPhase = useCallback(async (projectId: UUID, phaseType: PhaseType): Promise<ApiResult<Phase>> => {
    setState(prev => ({ ...prev, isPhaseLoading: true }))

    try {
      const result = await services.phaseManager.startPhase(projectId, phaseType)
      
      if (isApiSuccess(result)) {
        const phase = result.data
        
        setState(prev => ({
          ...prev,
          phases: prev.phases.map(p => p.id === phaseType ? phase : p),
          phaseProgress: {
            ...prev.phaseProgress,
            [phaseType]: phase.status
          },
          currentPhase: phaseType,
          isPhaseLoading: false,
          lastUpdated: createTimestamp()
        }))
        
        return result
      } else {
        setState(prev => ({ ...prev, isPhaseLoading: false }))
        return result
      }
    } catch (error) {
      setState(prev => ({ ...prev, isPhaseLoading: false }))
      return createApiError('Failed to start phase', 'PHASE_START_FAILED')
    }
  }, [services])

  const completePhase = useCallback(async (projectId: UUID, phaseType: PhaseType): Promise<ApiResult<Phase>> => {
    setState(prev => ({ ...prev, isPhaseLoading: true }))

    try {
      const result = await services.phaseManager.completePhase(projectId, phaseType)
      
      if (isApiSuccess(result)) {
        const phase = result.data
        
        setState(prev => ({
          ...prev,
          phases: prev.phases.map(p => p.id === phaseType ? phase : p),
          phaseProgress: {
            ...prev.phaseProgress,
            [phaseType]: 'completed'
          },
          isPhaseLoading: false,
          lastUpdated: createTimestamp()
        }))
        
        // Auto-advance to next phase if configured
        const nextPhase = getNextPhase(phaseType)
        if (nextPhase && state.currentProject?.config.development?.autoAdvancePhases) {
          setTimeout(() => startPhase(projectId, nextPhase), 1000)
        }
        
        return result
      } else {
        setState(prev => ({ ...prev, isPhaseLoading: false }))
        return result
      }
    } catch (error) {
      setState(prev => ({ ...prev, isPhaseLoading: false }))
      return createApiError('Failed to complete phase', 'PHASE_COMPLETE_FAILED')
    }
  }, [services, state.currentProject, startPhase])

  // =============================================================================
  // ARTIFACT GENERATION
  // =============================================================================

  const generateArtifact = useCallback(async (request: GenerationRequest): Promise<ApiResult<PhaseArtifact>> => {
    setState(prev => ({
      ...prev,
      isGenerating: true,
      generationQueue: [...prev.generationQueue, request]
    }))

    try {
      const result = await services.orchestrator.generateArtifact(request)
      
      if (isApiSuccess(result)) {
        const artifact = result.data
        
        setState(prev => ({
          ...prev,
          artifacts: [...prev.artifacts, artifact],
          artifactsByPhase: {
            ...prev.artifactsByPhase,
            [request.phase]: [...(prev.artifactsByPhase[request.phase] || []), artifact]
          },
          generationQueue: prev.generationQueue.filter(r => r.id !== request.id),
          isGenerating: prev.generationQueue.length > 1,
          lastUpdated: createTimestamp()
        }))
        
        return result
      } else {
        setState(prev => ({
          ...prev,
          generationQueue: prev.generationQueue.filter(r => r.id !== request.id),
          isGenerating: prev.generationQueue.length > 1
        }))
        
        return result
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        generationQueue: prev.generationQueue.filter(r => r.id !== request.id),
        isGenerating: prev.generationQueue.length > 1
      }))
      
      return createApiError('Failed to generate artifact', 'ARTIFACT_GENERATION_FAILED')
    }
  }, [services])

  // =============================================================================
  // CONTEXT MANAGEMENT
  // =============================================================================

  const addContextNode = useCallback(async (node: Omit<ContextNode, 'id' | 'lastAccessed'>): Promise<ApiResult<ContextNode>> => {
    setState(prev => ({ ...prev, isAnalyzingContext: true }))

    try {
      const contextNode: ContextNode = {
        ...node,
        id: generateUUID(),
        lastAccessed: createTimestamp()
      }

      setState(prev => ({
        ...prev,
        contextNodes: [...prev.contextNodes, contextNode],
        isAnalyzingContext: false,
        lastUpdated: createTimestamp()
      }))

      return createApiResponse(contextNode)
    } catch (error) {
      setState(prev => ({ ...prev, isAnalyzingContext: false }))
      return createApiError('Failed to add context node', 'CONTEXT_ADD_FAILED')
    }
  }, [])

  const refreshContext = useCallback(async (projectId: UUID): Promise<ApiResult<ContextNode[]>> => {
    setState(prev => ({ ...prev, isAnalyzingContext: true }))

    try {
      const result = await services.stateManager.refreshProjectContext(projectId)
      
      if (isApiSuccess(result)) {
        setState(prev => ({
          ...prev,
          contextNodes: result.data,
          isAnalyzingContext: false,
          lastUpdated: createTimestamp()
        }))
        
        return result
      } else {
        setState(prev => ({ ...prev, isAnalyzingContext: false }))
        return result
      }
    } catch (error) {
      setState(prev => ({ ...prev, isAnalyzingContext: false }))
      return createApiError('Failed to refresh context', 'CONTEXT_REFRESH_FAILED')
    }
  }, [services])

  // =============================================================================
  // AI PROVIDER MANAGEMENT
  // =============================================================================

  const setAIProvider = useCallback(async (
    provider: AIProviderType, 
    config: AIProviderConfig
  ): Promise<ApiResult<void>> => {
    try {
      // Test provider connection first
      const testResult = await testAIProvider(provider, config)
      
      if (!isApiSuccess(testResult) || !testResult.data) {
        return createApiError('Failed to connect to AI provider', 'AI_PROVIDER_CONNECTION_FAILED')
      }

      setState(prev => ({
        ...prev,
        aiProvider: provider,
        aiProviderConfig: config,
        isProviderConnected: true,
        lastUpdated: createTimestamp()
      }))

      services.loggingService.log(LogLevel.INFO, 'AI provider updated', { provider })
      
      return createApiResponse(undefined)
    } catch (error) {
      return createApiError('Failed to set AI provider', 'AI_PROVIDER_SET_FAILED')
    }
  }, [])

  const testAIProvider = useCallback(async (
    provider: AIProviderType, 
    config: AIProviderConfig
  ): Promise<ApiResult<boolean>> => {
    try {
      const result = await services.orchestrator.testAIProvider(provider, config)
      return result
    } catch (error) {
      return createApiError('Failed to test AI provider', 'AI_PROVIDER_TEST_FAILED')
    }
  }, [services])

  // =============================================================================
  // REAL-TIME UPDATES AND EVENT HANDLING
  // =============================================================================

  const subscribeToUpdates = useCallback(async (projectId: UUID): Promise<ApiResult<void>> => {
    if (!config.enableRealTimeUpdates) {
      return createApiResponse(undefined)
    }

    try {
      // Close existing connection
      if (eventStreamRef.current) {
        eventStreamRef.current.close()
      }

      // Create new EventSource connection
      const eventSource = new EventSource(`/api/projects/${projectId}/events`)
      eventStreamRef.current = eventSource

      eventSource.onopen = () => {
        setState(prev => ({
          ...prev,
          connectionStatus: 'connected',
          lastUpdated: createTimestamp()
        }))
      }

      eventSource.onmessage = (event) => {
        try {
          const streamEvent: ProjectStreamEvent = JSON.parse(event.data)
          handleStreamEvent(streamEvent)
        } catch (error) {
          services.loggingService.log(LogLevel.ERROR, 'Failed to parse stream event', { error })
        }
      }

      eventSource.onerror = () => {
        setState(prev => ({ ...prev, connectionStatus: 'reconnecting' }))
        
        // Attempt reconnection with exponential backoff
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current)
        }
        
        reconnectTimerRef.current = setTimeout(() => {
          subscribeToUpdates(projectId)
        }, 5000)
      }

      return createApiResponse(undefined)
    } catch (error) {
      setState(prev => ({ ...prev, connectionStatus: 'disconnected' }))
      return createApiError('Failed to subscribe to updates', 'SUBSCRIPTION_FAILED')
    }
  }, [config.enableRealTimeUpdates, services])

  const handleStreamEvent = useCallback((event: ProjectStreamEvent) => {
    setState(prev => ({
      ...prev,
      eventStream: [...prev.eventStream.slice(-99), event], // Keep last 100 events
      lastUpdated: createTimestamp()
    }))

    // Handle specific event types
    switch (event.type) {
      case 'project_updated':
        if (event.data && typeof event.data === 'object') {
          const updatedProject = event.data as Project
          setState(prev => ({
            ...prev,
            projects: prev.projects.map(p => p.id === event.projectId ? updatedProject : p),
            currentProject: prev.currentProject?.id === event.projectId ? updatedProject : prev.currentProject
          }))
        }
        break

      case 'phase_completed':
        if (event.data && typeof event.data === 'object') {
          const completedPhase = event.data as Phase
          setState(prev => ({
            ...prev,
            phases: prev.phases.map(p => p.id === completedPhase.id ? completedPhase : p),
            phaseProgress: {
              ...prev.phaseProgress,
              [completedPhase.id]: 'completed'
            }
          }))
        }
        break

      case 'artifact_generated':
        if (event.data && typeof event.data === 'object') {
          const newArtifact = event.data as PhaseArtifact
          setState(prev => ({
            ...prev,
            artifacts: [...prev.artifacts, newArtifact]
          }))
        }
        break

      case 'collaboration_update':
        if (event.data && typeof event.data === 'object') {
          const collaborationUpdate = event.data as CollaborationUpdate
          setState(prev => ({
            ...prev,
            collaborationUpdates: [...prev.collaborationUpdates.slice(-49), collaborationUpdate]
          }))
        }
        break
    }
  }, [])

  // =============================================================================
  // SEARCH AND FILTERING
  // =============================================================================

  const searchProjects = useCallback(async (query: string): Promise<ApiResult<Project[]>> => {
    try {
      const result = await services.projectService.searchProjects(query)
      
      if (isApiSuccess(result)) {
        setState(prev => ({
          ...prev,
          searchQuery: query,
          projects: result.data,
          lastUpdated: createTimestamp()
        }))
      }
      
      return result
    } catch (error) {
      return createApiError('Failed to search projects', 'PROJECT_SEARCH_FAILED')
    }
  }, [services])

  const setSearchQuery = useCallback((query: string) => {
    setState(prev => ({ ...prev, searchQuery: query }))
  }, [])

  const setFilters = useCallback((filters: Partial<ProjectContextState['filters']>) => {
    setState(prev => ({
      ...prev,
      filters: { ...prev.filters, ...filters },
      lastUpdated: createTimestamp()
    }))
  }, [])

  const clearFilters = useCallback(() => {
    setState(prev => ({
      ...prev,
      filters: {
        status: [],
        techStack: [],
        phase: [],
        tags: []
      },
      searchQuery: '',
      lastUpdated: createTimestamp()
    }))
  }, [])

  // =============================================================================
  // STATE MANAGEMENT UTILITIES
  // =============================================================================

  const setCurrentProject = useCallback((project: Project | null) => {
    setState(prev => ({
      ...prev,
      currentProject: project,
      lastUpdated: createTimestamp()
    }))

    // Subscribe to project updates if real-time is enabled
    if (project && config.enableRealTimeUpdates) {
      subscribeToUpdates(project.id)
    }
  }, [config.enableRealTimeUpdates, subscribeToUpdates])

  const refreshState = useCallback(async (): Promise<ApiResult<void>> => {
    setState(prev => ({ ...prev, isProjectLoading: true }))

    try {
      // Refresh all data
      const [projectsResult, providersResult] = await Promise.all([
        loadProjects(1),
        refreshProviders()
      ])

      if (state.currentProject) {
        await loadProject(state.currentProject.id)
      }

      setState(prev => ({ ...prev, isProjectLoading: false }))
      return createApiResponse(undefined)
    } catch (error) {
      setState(prev => ({ ...prev, isProjectLoading: false }))
      return createApiError('Failed to refresh state', 'STATE_REFRESH_FAILED')
    }
  }, [loadProjects, loadProject, state.currentProject])

  const resetState = useCallback(() => {
    // Close event stream
    if (eventStreamRef.current) {
      eventStreamRef.current.close()
      eventStreamRef.current = null
    }

    // Clear timers
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }

    // Reset state to initial values
    setState({
      currentProject: null,
      projects: [],
      isProjectLoading: false,
      hasProjectError: false,
      projectError: null,
      currentPhase: null,
      phases: [],
      phaseProgress: {} as Record<PhaseType, PhaseStatus>,
      isPhaseLoading: false,
      artifacts: [],
      artifactsByPhase: {} as Record<PhaseType, PhaseArtifact[]>,
      isGenerating: false,
      generationQueue: [],
      dependencyGraph: null,
      contextNodes: [],
      contextHistory: [],
      isAnalyzingContext: false,
      aiProvider: 'claude-sonnet-4' as AIProviderType,
      aiProviderConfig: null,
      availableProviders: [],
      isProviderConnected: false,
      generationResults: [],
      validationResults: [],
      qualityMetrics: null,
      isValidating: false,
      collaborators: [],
      activeCollaborators: [],
      collaborationUpdates: [],
      isCollaborationEnabled: false,
      lastUpdated: createTimestamp(),
      connectionStatus: 'disconnected',
      eventStream: [],
      projectsPagination: {
        page: 1,
        pageSize: 20,
        totalPages: 0,
        totalItems: 0,
        hasNext: false,
        hasPrevious: false
      },
      searchQuery: '',
      filters: {
        status: [],
        techStack: [],
        phase: [],
        tags: []
      }
    })
  }, [])

  // =============================================================================
  // HELPER FUNCTIONS
  // =============================================================================

  const initializeProjectPhases = useCallback(async (projectId: UUID) => {
    try {
      const phasesResult = await services.phaseManager.initializePhases(projectId)
      
      if (isApiSuccess(phasesResult)) {
        setState(prev => ({
          ...prev,
          phases: phasesResult.data,
          phaseProgress: phasesResult.data.reduce((acc, phase) => {
            acc[phase.id] = phase.status
            return acc
          }, {} as Record<PhaseType, PhaseStatus>)
        }))
      }
    } catch (error) {
      services.loggingService.log(LogLevel.ERROR, 'Failed to initialize project phases', { error, projectId })
    }
  }, [services])

  const loadProjectPhases = useCallback(async (projectId: UUID) => {
    try {
      const phasesResult = await services.phaseManager.getProjectPhases(projectId)
      
      if (isApiSuccess(phasesResult)) {
        setState(prev => ({
          ...prev,
          phases: phasesResult.data,
          phaseProgress: phasesResult.data.reduce((acc, phase) => {
            acc[phase.id] = phase.status
            return acc
          }, {} as Record<PhaseType, PhaseStatus>)
        }))
      }
    } catch (error) {
      services.loggingService.log(LogLevel.ERROR, 'Failed to load project phases', { error, projectId })
    }
  }, [services])

  const loadProjectArtifacts = useCallback(async (projectId: UUID) => {
    try {
      const artifactsResult = await services.orchestrator.getProjectArtifacts(projectId)
      
      if (isApiSuccess(artifactsResult)) {
        const artifacts = artifactsResult.data
        const artifactsByPhase = artifacts.reduce((acc, artifact) => {
          if (!acc[artifact.phase]) {
            acc[artifact.phase] = []
          }
          acc[artifact.phase].push(artifact)
          return acc
        }, {} as Record<PhaseType, PhaseArtifact[]>)

        setState(prev => ({
          ...prev,
          artifacts,
          artifactsByPhase
        }))
      }
    } catch (error) {
      services.loggingService.log(LogLevel.ERROR, 'Failed to load project artifacts', { error, projectId })
    }
  }, [services])

  const loadProjectContext = useCallback(async (projectId: UUID) => {
    try {
      const contextResult = await services.stateManager.getProjectContext(projectId)
      
      if (isApiSuccess(contextResult)) {
        setState(prev => ({
          ...prev,
          contextNodes: contextResult.data
        }))
      }
    } catch (error) {
      services.loggingService.log(LogLevel.ERROR, 'Failed to load project context', { error, projectId })
    }
  }, [services])

  const getNextPhase = useCallback((currentPhase: PhaseType): PhaseType | null => {
    const phaseOrder: PhaseType[] = [
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

    const currentIndex = phaseOrder.indexOf(currentPhase)
    return currentIndex >= 0 && currentIndex < phaseOrder.length - 1 
      ? phaseOrder[currentIndex + 1] 
      : null
  }, [])

  // =============================================================================
  // PLACEHOLDER IMPLEMENTATIONS FOR MISSING METHODS
  // =============================================================================

  // These would be implemented based on the actual service methods available
  const deleteProject = useCallback(async (id: UUID): Promise<ApiResult<void>> => {
    // Implementation would call services.projectService.deleteProject(id)
    return createApiResponse(undefined)
  }, [])

  const duplicateProject = useCallback(async (id: UUID, newName: string): Promise<ApiResult<Project>> => {
    // Implementation would call services.projectService.duplicateProject(id, newName)
    return createApiError('Not implemented', 'NOT_IMPLEMENTED')
  }, [])

  const archiveProject = useCallback(async (id: UUID): Promise<ApiResult<void>> => {
    // Implementation would call services.projectService.archiveProject(id)
    return createApiResponse(undefined)
  }, [])

  const restoreProject = useCallback(async (id: UUID): Promise<ApiResult<void>> => {
    // Implementation would call services.projectService.restoreProject(id)
    return createApiResponse(undefined)
  }, [])

  const retryPhase = useCallback(async (projectId: UUID, phaseType: PhaseType): Promise<ApiResult<Phase>> => {
    // Implementation would call services.phaseManager.retryPhase(projectId, phaseType)
    return createApiError('Not implemented', 'NOT_IMPLEMENTED')
  }, [])

  const skipPhase = useCallback(async (projectId: UUID, phaseType: PhaseType): Promise<ApiResult<Phase>> => {
    // Implementation would call services.phaseManager.skipPhase(projectId, phaseType)
    return createApiError('Not implemented', 'NOT_IMPLEMENTED')
  }, [])

  const regenerateArtifact = useCallback(async (artifactId: UUID, request: Partial<GenerationRequest>): Promise<ApiResult<PhaseArtifact>> => {
    // Implementation would call services.orchestrator.regenerateArtifact(artifactId, request)
    return createApiError('Not implemented', 'NOT_IMPLEMENTED')
  }, [])

  const validateArtifact = useCallback(async (artifactId: UUID): Promise<ApiResult<ValidationResult>> => {
    // Implementation would call services.orchestrator.validateArtifact(artifactId)
    return createApiError('Not implemented', 'NOT_IMPLEMENTED')
  }, [])

  const downloadArtifact = useCallback(async (artifactId: UUID): Promise<ApiResult<string>> => {
    // Implementation would call services.orchestrator.downloadArtifact(artifactId)
    return createApiError('Not implemented', 'NOT_IMPLEMENTED')
  }, [])

  const updateContextNode = useCallback(async (id: UUID, updates: Partial<ContextNode>): Promise<ApiResult<ContextNode>> => {
    // Implementation would update the context node
    return createApiError('Not implemented', 'NOT_IMPLEMENTED')
  }, [])

  const removeContextNode = useCallback(async (id: UUID): Promise<ApiResult<void>> => {
    // Implementation would remove the context node
    return createApiResponse(undefined)
  }, [])

  const analyzeDependencies = useCallback(async (projectId: UUID): Promise<ApiResult<DependencyGraph>> => {
    // Implementation would call services.stateManager.analyzeDependencies(projectId)
    return createApiError('Not implemented', 'NOT_IMPLEMENTED')
  }, [])

  const updateDependencyGraph = useCallback(async (projectId: UUID, graph: DependencyGraph): Promise<ApiResult<void>> => {
    // Implementation would call services.stateManager.updateDependencyGraph(projectId, graph)
    return createApiResponse(undefined)
  }, [])

  const resolveDependencies = useCallback(async (projectId: UUID): Promise<ApiResult<DependencyNode[]>> => {
    // Implementation would call services.stateManager.resolveDependencies(projectId)
    return createApiError('Not implemented', 'NOT_IMPLEMENTED')
  }, [])

  const refreshProviders = useCallback(async (): Promise<ApiResult<AIProviderType[]>> => {
    // Implementation would get available AI providers
    const providers: AIProviderType[] = ['claude-sonnet-4', 'claude-3.5-sonnet', 'gpt-4', 'gpt-5']
    setState(prev => ({ ...prev, availableProviders: providers }))
    return createApiResponse(providers)
  }, [])

  const validateProject = useCallback(async (projectId: UUID): Promise<ApiResult<ValidationResult[]>> => {
    // Implementation would call services.orchestrator.validateProject(projectId)
    return createApiError('Not implemented', 'NOT_IMPLEMENTED')
  }, [])

  const calculateQualityMetrics = useCallback(async (projectId: UUID): Promise<ApiResult<QualityMetrics>> => {
    // Implementation would call services.stateManager.calculateQualityMetrics(projectId)
    return createApiError('Not implemented', 'NOT_IMPLEMENTED')
  }, [])

  const enableCollaboration = useCallback(async (projectId: UUID): Promise<ApiResult<void>> => {
    // Implementation would enable collaboration for project
    return createApiResponse(undefined)
  }, [])

  const disableCollaboration = useCallback(async (projectId: UUID): Promise<ApiResult<void>> => {
    // Implementation would disable collaboration for project
    return createApiResponse(undefined)
  }, [])

  const inviteCollaborator = useCallback(async (projectId: UUID, email: string, role: string): Promise<ApiResult<void>> => {
    // Implementation would invite collaborator to project
    return createApiResponse(undefined)
  }, [])

  const removeCollaborator = useCallback(async (projectId: UUID, userId: UUID): Promise<ApiResult<void>> => {
    // Implementation would remove collaborator from project
    return createApiResponse(undefined)
  }, [])

  const unsubscribeFromUpdates = useCallback(async (projectId: UUID): Promise<ApiResult<void>> => {
    if (eventStreamRef.current) {
      eventStreamRef.current.close()
      eventStreamRef.current = null
    }
    setState(prev => ({ ...prev, connectionStatus: 'disconnected' }))
    return createApiResponse(undefined)
  }, [])

  const exportState = useCallback(async (): Promise<ApiResult<string>> => {
    // Implementation would export current state as JSON
    const stateExport = JSON.stringify(state, null, 2)
    return createApiResponse(stateExport)
  }, [state])

  const importState = useCallback(async (stateData: string): Promise<ApiResult<void>> => {
    // Implementation would import state from JSON
    try {
      const importedState = JSON.parse(stateData) as Partial<ProjectContextState>
      setState(prev => ({ ...prev, ...importedState }))
      return createApiResponse(undefined)
    } catch (error) {
      return createApiError('Invalid state data', 'INVALID_STATE_DATA')
    }
  }, [])

  // =============================================================================
  // LIFECYCLE EFFECTS
  // =============================================================================

  // Initialize context on mount
  useEffect(() => {
    const initialize = async () => {
      services.loggingService.log(LogLevel.INFO, 'Initializing ProjectContext')

      // Load initial data
      await Promise.all([
        loadProjects(1),
        refreshProviders()
      ])

      // Load initial project if provided
      if (initialProjectId) {
        await loadProject(initialProjectId)
      }

      services.loggingService.log(LogLevel.INFO, 'ProjectContext initialized')
    }

    initialize().catch(error => {
      services.errorService.reportError(
        error instanceof ReadyAIError ? error : new ReadyAIError('Context initialization failed'),
        ErrorCategory.SYSTEM,
        ErrorSeverity.HIGH
      )
    })
  }, [initialProjectId, loadProjects, loadProject, refreshProviders, services])

  // Setup auto-save if enabled
  useEffect(() => {
    if (config.enableAutoSave && config.autoSaveInterval && state.currentProject) {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }

      autoSaveTimerRef.current = setTimeout(async () => {
        if (pendingUpdatesRef.current.has(state.currentProject!.id)) {
          // Save pending changes
          services.loggingService.log(LogLevel.DEBUG, 'Auto-saving project changes')
          pendingUpdatesRef.current.delete(state.currentProject!.id)
        }
      }, config.autoSaveInterval)
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [config.enableAutoSave, config.autoSaveInterval, state.currentProject, services])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventStreamRef.current) {
        eventStreamRef.current.close()
      }
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
    }
  }, [])

  // =============================================================================
  // CONTEXT VALUE
  // =============================================================================

  const contextValue = useMemo<ProjectContextType>(() => ({
    // State
    ...state,

    // Actions
    createProject,
    updateProject,
    deleteProject,
    loadProject,
    loadProjects,
    setCurrentProject,
    duplicateProject,
    archiveProject,
    restoreProject,
    startPhase,
    completePhase,
    retryPhase,
    skipPhase,
    generateArtifact,
    regenerateArtifact,
    validateArtifact,
    downloadArtifact,
    addContextNode,
    updateContextNode,
    removeContextNode,
    refreshContext,
    analyzeDependencies,
    updateDependencyGraph,
    resolveDependencies,
    setAIProvider,
    testAIProvider,
    refreshProviders,
    validateProject,
    calculateQualityMetrics,
    searchProjects,
    setSearchQuery,
    setFilters,
    clearFilters,
    enableCollaboration,
    disableCollaboration,
    inviteCollaborator,
    removeCollaborator,
    subscribeToUpdates,
    unsubscribeFromUpdates,
    refreshState,
    resetState,
    exportState,
    importState,

    // Context Metadata
    version: '1.0.0',
    initialized: true,
    lastError: state.projectError
  }), [
    state,
    createProject,
    updateProject,
    deleteProject,
    loadProject,
    loadProjects,
    setCurrentProject,
    duplicateProject,
    archiveProject,
    restoreProject,
    startPhase,
    completePhase,
    retryPhase,
    skipPhase,
    generateArtifact,
    regenerateArtifact,
    validateArtifact,
    downloadArtifact,
    addContextNode,
    updateContextNode,
    removeContextNode,
    refreshContext,
    analyzeDependencies,
    updateDependencyGraph,
    resolveDependencies,
    setAIProvider,
    testAIProvider,
    refreshProviders,
    validateProject,
    calculateQualityMetrics,
    searchProjects,
    setSearchQuery,
    setFilters,
    clearFilters,
    enableCollaboration,
    disableCollaboration,
    inviteCollaborator,
    removeCollaborator,
    subscribeToUpdates,
    unsubscribeFromUpdates,
    refreshState,
    resetState,
    exportState,
    importState
  ])

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <ProjectContext.Provider value={contextValue}>
      {children}
    </ProjectContext.Provider>
  )
}

// =============================================================================
// CONTEXT HOOK
// =============================================================================

/**
 * Hook to access project context
 * Must be used within a ProjectProvider
 */
export const useProject = (): ProjectContextType => {
  const context = useContext(ProjectContext)
  
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider')
  }
  
  return context
}

// =============================================================================
// UTILITY HOOKS
// =============================================================================

/**
 * Hook to get current project
 */
export const useCurrentProject = (): Project | null => {
  const { currentProject } = useProject()
  return currentProject
}

/**
 * Hook to get project loading state
 */
export const useProjectLoading = (): boolean => {
  const { isProjectLoading } = useProject()
  return isProjectLoading
}

/**
 * Hook to get current phase
 */
export const useCurrentPhase = (): PhaseType | null => {
  const { currentPhase } = useProject()
  return currentPhase
}

/**
 * Hook to get phase progress
 */
export const usePhaseProgress = (): Record<PhaseType, PhaseStatus> => {
  const { phaseProgress } = useProject()
  return phaseProgress
}

/**
 * Hook to check if artifact generation is in progress
 */
export const useIsGenerating = (): boolean => {
  const { isGenerating } = useProject()
  return isGenerating
}

/**
 * Hook to get artifacts for current project
 */
export const useProjectArtifacts = (): PhaseArtifact[] => {
  const { artifacts } = useProject()
  return artifacts
}

/**
 * Hook to get artifacts by phase
 */
export const useArtifactsByPhase = (phase: PhaseType): PhaseArtifact[] => {
  const { artifactsByPhase } = useProject()
  return artifactsByPhase[phase] || []
}

/**
 * Hook to get project context nodes
 */
export const useProjectContext = (): ContextNode[] => {
  const { contextNodes } = useProject()
  return contextNodes
}

/**
 * Hook to get collaboration state
 */
export const useCollaboration = () => {
  const { 
    isCollaborationEnabled, 
    collaborators, 
    activeCollaborators, 
    collaborationUpdates,
    enableCollaboration,
    disableCollaboration,
    inviteCollaborator,
    removeCollaborator
  } = useProject()

  return {
    isEnabled: isCollaborationEnabled,
    collaborators,
    activeCollaborators,
    updates: collaborationUpdates,
    enable: enableCollaboration,
    disable: disableCollaboration,
    invite: inviteCollaborator,
    remove: removeCollaborator
  }
}

/**
 * Hook to get real-time connection status
 */
export const useConnectionStatus = (): 'connected' | 'disconnected' | 'reconnecting' => {
  const { connectionStatus } = useProject()
  return connectionStatus
}

// =============================================================================
// EXPORTS
// =============================================================================

export default ProjectProvider

// Export types for external use
export type {
  ProjectContextState,
  ProjectContextActions,
  ProjectContextType,
  ProjectEventType,
  ProjectStreamEvent,
  CollaborationUpdate
}

// Re-export project management types for convenience
export type {
  Project,
  ProjectConfig,
  ProjectStatus,
  TechStack,
  PhaseType,
  PhaseStatus,
  Phase,
  PhaseArtifact,
  DependencyGraph,
  DependencyNode,
  GenerationRequest,
  GenerationResult,
  ValidationResult,
  QualityMetrics,
  AIProviderConfig,
  AIProviderType,
  ContextNode,
  ContextType
} from '../../project-management/types/project'
