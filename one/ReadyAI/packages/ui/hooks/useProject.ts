// packages/ui/hooks/useProject.ts

/**
 * ReadyAI Project Management Hook
 * 
 * Production-ready React hook for project operations, state access, and optimistic updates.
 * Adapted from Cline's custom hook patterns with ReadyAI-specific project management capabilities.
 * 
 * This hook provides comprehensive project management functionality including:
 * - Project CRUD operations with optimistic updates
 * - Phase progression and artifact management
 * - Real-time collaboration and synchronization
 * - Context and dependency management
 * - AI generation orchestration
 * 
 * Based on Cline's webview-ui hook patterns (90%+ reuse) with ReadyAI project management adaptations
 * 
 * @version 1.0.0 - Production Ready
 * @author ReadyAI Development Team
 */

import { useCallback, useMemo, useRef, useEffect } from 'react'

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
  ContextType,
  ProjectCreationRequest,
  ProjectUpdateRequest,
  ProjectSearchCriteria,
  ProjectOperationResult
} from '../../project-management/types/project'

// Project Context
import { useProject as useProjectContext, ProjectContextType } from '../contexts/ProjectContext'

// Error Handling
import { ErrorService } from '../../error-handling/services/ErrorService'
import { ErrorCategory, ErrorSeverity } from '../../error-handling/types/error'

// Logging
import { LoggingService } from '../../logging/services/LoggingService'
import { LogLevel } from '../../logging/types/logging'

// =============================================================================
// HOOK RETURN TYPES
// =============================================================================

/**
 * Project management hook return type
 * Provides comprehensive project functionality with Cline-inspired patterns
 */
export interface UseProjectReturn {
  // Current project state
  currentProject: Project | null
  projects: Project[]
  isLoading: boolean
  error: ReadyAIError | null

  // Project CRUD operations
  createProject: (request: ProjectCreationRequest) => Promise<Project>
  updateProject: (id: UUID, updates: ProjectUpdateRequest) => Promise<Project>
  deleteProject: (id: UUID) => Promise<void>
  loadProject: (id: UUID) => Promise<Project>
  loadProjects: (criteria?: ProjectSearchCriteria) => Promise<PaginatedResponse<Project>>
  
  // Project management
  setCurrentProject: (project: Project | null) => void
  duplicateProject: (id: UUID, newName: string) => Promise<Project>
  archiveProject: (id: UUID) => Promise<void>
  restoreProject: (id: UUID) => Promise<void>
  
  // Phase management
  startPhase: (projectId: UUID, phaseType: PhaseType) => Promise<Phase>
  completePhase: (projectId: UUID, phaseType: PhaseType) => Promise<Phase>
  getCurrentPhase: () => PhaseType | null
  getPhaseStatus: (phase: PhaseType) => PhaseStatus
  getPhaseProgress: () => Record<PhaseType, PhaseStatus>
  
  // Artifact management
  generateArtifact: (request: GenerationRequest) => Promise<PhaseArtifact>
  getArtifacts: () => PhaseArtifact[]
  getArtifactsByPhase: (phase: PhaseType) => PhaseArtifact[]
  isGenerating: () => boolean
  
  // Context management
  addContextNode: (node: Omit<ContextNode, 'id' | 'lastAccessed'>) => Promise<ContextNode>
  getContextNodes: () => ContextNode[]
  refreshContext: (projectId: UUID) => Promise<ContextNode[]>
  
  // AI Provider management
  setAIProvider: (provider: AIProviderType, config: AIProviderConfig) => Promise<void>
  getAIProvider: () => AIProviderType
  isProviderConnected: () => boolean
  
  // Quality and validation
  validateProject: (projectId: UUID) => Promise<ValidationResult[]>
  getQualityMetrics: () => QualityMetrics | null
  
  // Collaboration
  enableCollaboration: (projectId: UUID) => Promise<void>
  disableCollaboration: (projectId: UUID) => Promise<void>
  isCollaborationEnabled: () => boolean
  
  // Utility functions
  refreshState: () => Promise<void>
  clearError: () => void
  retry: () => Promise<void>
}

/**
 * Project hook configuration
 */
export interface UseProjectConfig {
  /**
   * Enable optimistic updates for better UX
   * @default true
   */
  optimisticUpdates?: boolean
  
  /**
   * Auto-refresh project data interval in milliseconds
   * @default 30000 (30 seconds)
   */
  autoRefreshInterval?: number
  
  /**
   * Maximum number of retry attempts for failed operations
   * @default 3
   */
  maxRetries?: number
  
  /**
   * Enable automatic error clearing after specified time
   * @default true
   */
  autoClearErrors?: boolean
  
  /**
   * Error clearing timeout in milliseconds
   * @default 10000
   */
  errorClearTimeout?: number
  
  /**
   * Enable real-time updates
   * @default false
   */
  enableRealTimeUpdates?: boolean
  
  /**
   * Cache project data locally
   * @default true
   */
  enableLocalCache?: boolean
}

/**
 * Default hook configuration
 */
const DEFAULT_CONFIG: Required<UseProjectConfig> = {
  optimisticUpdates: true,
  autoRefreshInterval: 30000,
  maxRetries: 3,
  autoClearErrors: true,
  errorClearTimeout: 10000,
  enableRealTimeUpdates: false,
  enableLocalCache: true
}

// =============================================================================
// PROJECT HOOK IMPLEMENTATION
// =============================================================================

/**
 * ReadyAI Project Management Hook
 * 
 * Provides comprehensive project management functionality adapted from Cline's proven patterns.
 * Features include optimistic updates, automatic refresh, error handling, phase management,
 * and AI generation orchestration with ReadyAI-specific enhancements.
 * 
 * @param config - Optional configuration for the hook behavior
 * @returns Project state and management operations
 * 
 * @example
 * ```
 * const { currentProject, createProject, startPhase, generateArtifact } = useProject({
 *   optimisticUpdates: true,
 *   autoRefreshInterval: 30000
 * })
 * 
 * // Create a new project
 * const project = await createProject({
 *   name: 'My New Project',
 *   description: 'A sample project',
 *   techStack: { languages: ['typescript'], tools: ['react'] }
 * })
 * 
 * // Start a phase
 * await startPhase(project.id, 'Phase1_ArchitecturalBlueprint')
 * ```
 */
export const useProject = (config: UseProjectConfig = {}): UseProjectReturn => {
  // =============================================================================
  // CONFIGURATION
  // =============================================================================
  
  const mergedConfig = useMemo<Required<UseProjectConfig>>(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [config]
  )

  // =============================================================================
  // CONTEXT AND SERVICES
  // =============================================================================
  
  const projectContext = useProjectContext()
  
  // Service instances
  const errorService = useMemo(() => new ErrorService(), [])
  const loggingService = useMemo(() => new LoggingService(), [])
  
  // Hook-specific state
  const retryCountRef = useRef<number>(0)
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastOperationRef = useRef<(() => Promise<void>) | null>(null)
  const autoRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // =============================================================================
  // DERIVED STATE
  // =============================================================================
  
  const currentProject = useMemo(() => projectContext.currentProject, [projectContext.currentProject])
  const projects = useMemo(() => projectContext.projects, [projectContext.projects])
  const isLoading = useMemo(() => projectContext.isProjectLoading, [projectContext.isProjectLoading])
  const error = useMemo(() => projectContext.projectError, [projectContext.projectError])

  // =============================================================================
  // ERROR HANDLING
  // =============================================================================
  
  const clearError = useCallback(() => {
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current)
      errorTimeoutRef.current = null
    }
    projectContext.resetState()
  }, [projectContext])

  const handleError = useCallback((error: unknown, operation?: () => Promise<void>) => {
    loggingService.log(LogLevel.ERROR, 'useProject: Operation failed', { error })
    
    // Store the operation for retry
    if (operation) {
      lastOperationRef.current = operation
    }

    // Report to error service
    const readyAIError = error instanceof ReadyAIError 
      ? error 
      : new ReadyAIError(
          error instanceof Error ? error.message : 'Unknown project operation error',
          'PROJECT_OPERATION_ERROR',
          500
        )
    
    errorService.reportError(readyAIError, ErrorCategory.USER_ACTION, ErrorSeverity.MEDIUM)

    // Auto-clear error after timeout
    if (mergedConfig.autoClearErrors && mergedConfig.errorClearTimeout > 0) {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current)
      }
      
      errorTimeoutRef.current = setTimeout(() => {
        clearError()
      }, mergedConfig.errorClearTimeout)
    }
  }, [mergedConfig.autoClearErrors, mergedConfig.errorClearTimeout, clearError, errorService, loggingService])

  const retry = useCallback(async (): Promise<void> => {
    const operation = lastOperationRef.current
    if (!operation) {
      loggingService.log(LogLevel.WARN, 'useProject: No operation to retry')
      return
    }

    if (retryCountRef.current >= mergedConfig.maxRetries) {
      loggingService.log(LogLevel.ERROR, 'useProject: Maximum retry attempts reached')
      return
    }

    try {
      retryCountRef.current += 1
      await operation()
      retryCountRef.current = 0 // Reset on success
    } catch (error) {
      handleError(error, operation)
    }
  }, [mergedConfig.maxRetries, handleError, loggingService])

  // =============================================================================
  // PROJECT CRUD OPERATIONS
  // =============================================================================
  
  const createProject = useCallback(async (request: ProjectCreationRequest): Promise<Project> => {
    const operation = async () => {
      loggingService.log(LogLevel.INFO, 'Creating project', { request })
      
      const result = await projectContext.createProject(request)
      
      if (isApiSuccess(result)) {
        retryCountRef.current = 0
        loggingService.log(LogLevel.INFO, 'Project created successfully', { projectId: result.data.id })
        return result.data
      } else {
        throw new ReadyAIError(result.error.message, result.error.code)
      }
    }

    try {
      lastOperationRef.current = operation
      return await operation()
    } catch (error) {
      handleError(error, operation)
      throw error
    }
  }, [projectContext, loggingService, handleError])

  const updateProject = useCallback(async (id: UUID, updates: ProjectUpdateRequest): Promise<Project> => {
    const operation = async () => {
      loggingService.log(LogLevel.INFO, 'Updating project', { projectId: id, updates })
      
      // Optimistic update if enabled
      if (mergedConfig.optimisticUpdates && currentProject?.id === id) {
        // Apply updates optimistically to current project
        const optimisticProject = { ...currentProject, ...updates, updatedAt: createTimestamp() }
        projectContext.setCurrentProject(optimisticProject)
      }
      
      const result = await projectContext.updateProject(id, updates)
      
      if (isApiSuccess(result)) {
        retryCountRef.current = 0
        loggingService.log(LogLevel.INFO, 'Project updated successfully', { projectId: id })
        return result.data
      } else {
        // Revert optimistic update on failure
        if (mergedConfig.optimisticUpdates && currentProject?.id === id) {
          await projectContext.loadProject(id)
        }
        throw new ReadyAIError(result.error.message, result.error.code)
      }
    }

    try {
      lastOperationRef.current = operation
      return await operation()
    } catch (error) {
      handleError(error, operation)
      throw error
    }
  }, [id, updates, projectContext, currentProject, mergedConfig.optimisticUpdates, loggingService, handleError])

  const deleteProject = useCallback(async (id: UUID): Promise<void> => {
    const operation = async () => {
      loggingService.log(LogLevel.INFO, 'Deleting project', { projectId: id })
      
      const result = await projectContext.deleteProject(id)
      
      if (isApiSuccess(result)) {
        retryCountRef.current = 0
        loggingService.log(LogLevel.INFO, 'Project deleted successfully', { projectId: id })
      } else {
        throw new ReadyAIError(result.error.message, result.error.code)
      }
    }

    try {
      lastOperationRef.current = operation
      await operation()
    } catch (error) {
      handleError(error, operation)
      throw error
    }
  }, [projectContext, loggingService, handleError])

  const loadProject = useCallback(async (id: UUID): Promise<Project> => {
    const operation = async () => {
      loggingService.log(LogLevel.INFO, 'Loading project', { projectId: id })
      
      const result = await projectContext.loadProject(id)
      
      if (isApiSuccess(result)) {
        retryCountRef.current = 0
        loggingService.log(LogLevel.INFO, 'Project loaded successfully', { projectId: id })
        return result.data
      } else {
        throw new ReadyAIError(result.error.message, result.error.code)
      }
    }

    try {
      lastOperationRef.current = operation
      return await operation()
    } catch (error) {
      handleError(error, operation)
      throw error
    }
  }, [projectContext, loggingService, handleError])

  const loadProjects = useCallback(async (criteria?: ProjectSearchCriteria): Promise<PaginatedResponse<Project>> => {
    const operation = async () => {
      loggingService.log(LogLevel.INFO, 'Loading projects', { criteria })
      
      const result = await projectContext.loadProjects(criteria?.page, criteria)
      
      if (isApiSuccess(result)) {
        retryCountRef.current = 0
        loggingService.log(LogLevel.INFO, 'Projects loaded successfully', { count: result.data.items.length })
        return result.data
      } else {
        throw new ReadyAIError(result.error.message, result.error.code)
      }
    }

    try {
      lastOperationRef.current = operation
      return await operation()
    } catch (error) {
      handleError(error, operation)
      throw error
    }
  }, [projectContext, loggingService, handleError])

  // =============================================================================
  // PROJECT MANAGEMENT OPERATIONS
  // =============================================================================
  
  const setCurrentProject = useCallback((project: Project | null) => {
    projectContext.setCurrentProject(project)
  }, [projectContext])

  const duplicateProject = useCallback(async (id: UUID, newName: string): Promise<Project> => {
    const operation = async () => {
      loggingService.log(LogLevel.INFO, 'Duplicating project', { projectId: id, newName })
      
      const result = await projectContext.duplicateProject(id, newName)
      
      if (isApiSuccess(result)) {
        retryCountRef.current = 0
        loggingService.log(LogLevel.INFO, 'Project duplicated successfully', { newProjectId: result.data.id })
        return result.data
      } else {
        throw new ReadyAIError(result.error.message, result.error.code)
      }
    }

    try {
      lastOperationRef.current = operation
      return await operation()
    } catch (error) {
      handleError(error, operation)
      throw error
    }
  }, [projectContext, loggingService, handleError])

  const archiveProject = useCallback(async (id: UUID): Promise<void> => {
    const operation = async () => {
      loggingService.log(LogLevel.INFO, 'Archiving project', { projectId: id })
      
      const result = await projectContext.archiveProject(id)
      
      if (isApiSuccess(result)) {
        retryCountRef.current = 0
        loggingService.log(LogLevel.INFO, 'Project archived successfully', { projectId: id })
      } else {
        throw new ReadyAIError(result.error.message, result.error.code)
      }
    }

    try {
      lastOperationRef.current = operation
      await operation()
    } catch (error) {
      handleError(error, operation)
      throw error
    }
  }, [projectContext, loggingService, handleError])

  const restoreProject = useCallback(async (id: UUID): Promise<void> => {
    const operation = async () => {
      loggingService.log(LogLevel.INFO, 'Restoring project', { projectId: id })
      
      const result = await projectContext.restoreProject(id)
      
      if (isApiSuccess(result)) {
        retryCountRef.current = 0
        loggingService.log(LogLevel.INFO, 'Project restored successfully', { projectId: id })
      } else {
        throw new ReadyAIError(result.error.message, result.error.code)
      }
    }

    try {
      lastOperationRef.current = operation
      await operation()
    } catch (error) {
      handleError(error, operation)
      throw error
    }
  }, [projectContext, loggingService, handleError])

  // =============================================================================
  // PHASE MANAGEMENT
  // =============================================================================
  
  const startPhase = useCallback(async (projectId: UUID, phaseType: PhaseType): Promise<Phase> => {
    const operation = async () => {
      loggingService.log(LogLevel.INFO, 'Starting phase', { projectId, phaseType })
      
      const result = await projectContext.startPhase(projectId, phaseType)
      
      if (isApiSuccess(result)) {
        retryCountRef.current = 0
        loggingService.log(LogLevel.INFO, 'Phase started successfully', { projectId, phaseType })
        return result.data
      } else {
        throw new ReadyAIError(result.error.message, result.error.code)
      }
    }

    try {
      lastOperationRef.current = operation
      return await operation()
    } catch (error) {
      handleError(error, operation)
      throw error
    }
  }, [projectContext, loggingService, handleError])

  const completePhase = useCallback(async (projectId: UUID, phaseType: PhaseType): Promise<Phase> => {
    const operation = async () => {
      loggingService.log(LogLevel.INFO, 'Completing phase', { projectId, phaseType })
      
      const result = await projectContext.completePhase(projectId, phaseType)
      
      if (isApiSuccess(result)) {
        retryCountRef.current = 0
        loggingService.log(LogLevel.INFO, 'Phase completed successfully', { projectId, phaseType })
        return result.data
      } else {
        throw new ReadyAIError(result.error.message, result.error.code)
      }
    }

    try {
      lastOperationRef.current = operation
      return await operation()
    } catch (error) {
      handleError(error, operation)
      throw error
    }
  }, [projectContext, loggingService, handleError])

  const getCurrentPhase = useCallback((): PhaseType | null => {
    return projectContext.currentPhase
  }, [projectContext.currentPhase])

  const getPhaseStatus = useCallback((phase: PhaseType): PhaseStatus => {
    return projectContext.phaseProgress[phase] || 'pending'
  }, [projectContext.phaseProgress])

  const getPhaseProgress = useCallback((): Record<PhaseType, PhaseStatus> => {
    return projectContext.phaseProgress
  }, [projectContext.phaseProgress])

  // =============================================================================
  // ARTIFACT MANAGEMENT
  // =============================================================================
  
  const generateArtifact = useCallback(async (request: GenerationRequest): Promise<PhaseArtifact> => {
    const operation = async () => {
      loggingService.log(LogLevel.INFO, 'Generating artifact', { request })
      
      const result = await projectContext.generateArtifact(request)
      
      if (isApiSuccess(result)) {
        retryCountRef.current = 0
        loggingService.log(LogLevel.INFO, 'Artifact generated successfully', { artifactId: result.data.id })
        return result.data
      } else {
        throw new ReadyAIError(result.error.message, result.error.code)
      }
    }

    try {
      lastOperationRef.current = operation
      return await operation()
    } catch (error) {
      handleError(error, operation)
      throw error
    }
  }, [projectContext, loggingService, handleError])

  const getArtifacts = useCallback((): PhaseArtifact[] => {
    return projectContext.artifacts
  }, [projectContext.artifacts])

  const getArtifactsByPhase = useCallback((phase: PhaseType): PhaseArtifact[] => {
    return projectContext.artifactsByPhase[phase] || []
  }, [projectContext.artifactsByPhase])

  const isGenerating = useCallback((): boolean => {
    return projectContext.isGenerating
  }, [projectContext.isGenerating])

  // =============================================================================
  // CONTEXT MANAGEMENT
  // =============================================================================
  
  const addContextNode = useCallback(async (node: Omit<ContextNode, 'id' | 'lastAccessed'>): Promise<ContextNode> => {
    const operation = async () => {
      loggingService.log(LogLevel.INFO, 'Adding context node', { node })
      
      const result = await projectContext.addContextNode(node)
      
      if (isApiSuccess(result)) {
        retryCountRef.current = 0
        loggingService.log(LogLevel.INFO, 'Context node added successfully', { nodeId: result.data.id })
        return result.data
      } else {
        throw new ReadyAIError(result.error.message, result.error.code)
      }
    }

    try {
      lastOperationRef.current = operation
      return await operation()
    } catch (error) {
      handleError(error, operation)
      throw error
    }
  }, [projectContext, loggingService, handleError])

  const getContextNodes = useCallback((): ContextNode[] => {
    return projectContext.contextNodes
  }, [projectContext.contextNodes])

  const refreshContext = useCallback(async (projectId: UUID): Promise<ContextNode[]> => {
    const operation = async () => {
      loggingService.log(LogLevel.INFO, 'Refreshing context', { projectId })
      
      const result = await projectContext.refreshContext(projectId)
      
      if (isApiSuccess(result)) {
        retryCountRef.current = 0
        loggingService.log(LogLevel.INFO, 'Context refreshed successfully', { count: result.data.length })
        return result.data
      } else {
        throw new ReadyAIError(result.error.message, result.error.code)
      }
    }

    try {
      lastOperationRef.current = operation
      return await operation()
    } catch (error) {
      handleError(error, operation)
      throw error
    }
  }, [projectContext, loggingService, handleError])

  // =============================================================================
  // AI PROVIDER MANAGEMENT
  // =============================================================================
  
  const setAIProvider = useCallback(async (provider: AIProviderType, config: AIProviderConfig): Promise<void> => {
    const operation = async () => {
      loggingService.log(LogLevel.INFO, 'Setting AI provider', { provider })
      
      const result = await projectContext.setAIProvider(provider, config)
      
      if (isApiSuccess(result)) {
        retryCountRef.current = 0
        loggingService.log(LogLevel.INFO, 'AI provider set successfully', { provider })
      } else {
        throw new ReadyAIError(result.error.message, result.error.code)
      }
    }

    try {
      lastOperationRef.current = operation
      await operation()
    } catch (error) {
      handleError(error, operation)
      throw error
    }
  }, [projectContext, loggingService, handleError])

  const getAIProvider = useCallback((): AIProviderType => {
    return projectContext.aiProvider
  }, [projectContext.aiProvider])

  const isProviderConnected = useCallback((): boolean => {
    return projectContext.isProviderConnected
  }, [projectContext.isProviderConnected])

  // =============================================================================
  // QUALITY AND VALIDATION
  // =============================================================================
  
  const validateProject = useCallback(async (projectId: UUID): Promise<ValidationResult[]> => {
    const operation = async () => {
      loggingService.log(LogLevel.INFO, 'Validating project', { projectId })
      
      const result = await projectContext.validateProject(projectId)
      
      if (isApiSuccess(result)) {
        retryCountRef.current = 0
        loggingService.log(LogLevel.INFO, 'Project validated successfully', { resultCount: result.data.length })
        return result.data
      } else {
        throw new ReadyAIError(result.error.message, result.error.code)
      }
    }

    try {
      lastOperationRef.current = operation
      return await operation()
    } catch (error) {
      handleError(error, operation)
      throw error
    }
  }, [projectContext, loggingService, handleError])

  const getQualityMetrics = useCallback((): QualityMetrics | null => {
    return projectContext.qualityMetrics
  }, [projectContext.qualityMetrics])

  // =============================================================================
  // COLLABORATION
  // =============================================================================
  
  const enableCollaboration = useCallback(async (projectId: UUID): Promise<void> => {
    const operation = async () => {
      loggingService.log(LogLevel.INFO, 'Enabling collaboration', { projectId })
      
      const result = await projectContext.enableCollaboration(projectId)
      
      if (isApiSuccess(result)) {
        retryCountRef.current = 0
        loggingService.log(LogLevel.INFO, 'Collaboration enabled successfully', { projectId })
      } else {
        throw new ReadyAIError(result.error.message, result.error.code)
      }
    }

    try {
      lastOperationRef.current = operation
      await operation()
    } catch (error) {
      handleError(error, operation)
      throw error
    }
  }, [projectContext, loggingService, handleError])

  const disableCollaboration = useCallback(async (projectId: UUID): Promise<void> => {
    const operation = async () => {
      loggingService.log(LogLevel.INFO, 'Disabling collaboration', { projectId })
      
      const result = await projectContext.disableCollaboration(projectId)
      
      if (isApiSuccess(result)) {
        retryCountRef.current = 0
        loggingService.log(LogLevel.INFO, 'Collaboration disabled successfully', { projectId })
      } else {
        throw new ReadyAIError(result.error.message, result.error.code)
      }
    }

    try {
      lastOperationRef.current = operation
      await operation()
    } catch (error) {
      handleError(error, operation)
      throw error
    }
  }, [projectContext, loggingService, handleError])

  const isCollaborationEnabled = useCallback((): boolean => {
    return projectContext.isCollaborationEnabled
  }, [projectContext.isCollaborationEnabled])

  // =============================================================================
  // UTILITY FUNCTIONS
  // =============================================================================
  
  const refreshState = useCallback(async (): Promise<void> => {
    const operation = async () => {
      loggingService.log(LogLevel.INFO, 'Refreshing project state')
      
      const result = await projectContext.refreshState()
      
      if (isApiSuccess(result)) {
        retryCountRef.current = 0
        loggingService.log(LogLevel.INFO, 'Project state refreshed successfully')
      } else {
        throw new ReadyAIError(result.error.message, result.error.code)
      }
    }

    try {
      lastOperationRef.current = operation
      await operation()
    } catch (error) {
      handleError(error, operation)
      throw error
    }
  }, [projectContext, loggingService, handleError])

  // =============================================================================
  // AUTO-REFRESH SETUP
  // =============================================================================
  
  useEffect(() => {
    if (!mergedConfig.autoRefreshInterval || mergedConfig.autoRefreshInterval <= 0) {
      return
    }

    const setupAutoRefresh = () => {
      autoRefreshIntervalRef.current = setInterval(async () => {
        try {
          await refreshState()
        } catch (error) {
          loggingService.log(LogLevel.WARN, 'Auto-refresh failed', { error })
        }
      }, mergedConfig.autoRefreshInterval)
    }

    setupAutoRefresh()

    return () => {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current)
        autoRefreshIntervalRef.current = null
      }
    }
  }, [mergedConfig.autoRefreshInterval, refreshState, loggingService])

  // =============================================================================
  // REAL-TIME UPDATES
  // =============================================================================
  
  useEffect(() => {
    if (!mergedConfig.enableRealTimeUpdates || !currentProject) {
      return
    }

    const subscribeToUpdates = async () => {
      try {
        await projectContext.subscribeToUpdates(currentProject.id)
        loggingService.log(LogLevel.INFO, 'Subscribed to real-time updates', { projectId: currentProject.id })
      } catch (error) {
        loggingService.log(LogLevel.ERROR, 'Failed to subscribe to real-time updates', { error })
      }
    }

    subscribeToUpdates()

    return () => {
      if (currentProject) {
        projectContext.unsubscribeFromUpdates(currentProject.id).catch(error => {
          loggingService.log(LogLevel.WARN, 'Failed to unsubscribe from real-time updates', { error })
        })
      }
    }
  }, [mergedConfig.enableRealTimeUpdates, currentProject, projectContext, loggingService])

  // =============================================================================
  // CLEANUP
  // =============================================================================
  
  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current)
      }
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current)
      }
    }
  }, [])

  // =============================================================================
  // RETURN HOOK INTERFACE
  // =============================================================================
  
  return useMemo<UseProjectReturn>(() => ({
    // Current state
    currentProject,
    projects,
    isLoading,
    error,

    // Project CRUD operations
    createProject,
    updateProject,
    deleteProject,
    loadProject,
    loadProjects,

    // Project management
    setCurrentProject,
    duplicateProject,
    archiveProject,
    restoreProject,

    // Phase management
    startPhase,
    completePhase,
    getCurrentPhase,
    getPhaseStatus,
    getPhaseProgress,

    // Artifact management
    generateArtifact,
    getArtifacts,
    getArtifactsByPhase,
    isGenerating,

    // Context management
    addContextNode,
    getContextNodes,
    refreshContext,

    // AI Provider management
    setAIProvider,
    getAIProvider,
    isProviderConnected,

    // Quality and validation
    validateProject,
    getQualityMetrics,

    // Collaboration
    enableCollaboration,
    disableCollaboration,
    isCollaborationEnabled,

    // Utility functions
    refreshState,
    clearError,
    retry
  }), [
    currentProject,
    projects,
    isLoading,
    error,
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
    getCurrentPhase,
    getPhaseStatus,
    getPhaseProgress,
    generateArtifact,
    getArtifacts,
    getArtifactsByPhase,
    isGenerating,
    addContextNode,
    getContextNodes,
    refreshContext,
    setAIProvider,
    getAIProvider,
    isProviderConnected,
    validateProject,
    getQualityMetrics,
    enableCollaboration,
    disableCollaboration,
    isCollaborationEnabled,
    refreshState,
    clearError,
    retry
  ])
}

// =============================================================================
// UTILITY HOOKS
// =============================================================================

/**
 * Hook to get current project
 * Lightweight alternative to full useProject hook
 */
export const useCurrentProject = (): Project | null => {
  const { currentProject } = useProject()
  return currentProject
}

/**
 * Hook to check if project operations are loading
 * Lightweight alternative to full useProject hook
 */
export const useProjectLoading = (): boolean => {
  const { isLoading } = useProject()
  return isLoading
}

/**
 * Hook to get current phase
 * Lightweight alternative to full useProject hook
 */
export const useCurrentPhase = (): PhaseType | null => {
  const { getCurrentPhase } = useProject()
  return getCurrentPhase()
}

/**
 * Hook to get phase progress
 * Lightweight alternative to full useProject hook
 */
export const usePhaseProgress = (): Record<PhaseType, PhaseStatus> => {
  const { getPhaseProgress } = useProject()
  return getPhaseProgress()
}

/**
 * Hook to check if artifact generation is in progress
 * Lightweight alternative to full useProject hook
 */
export const useIsGenerating = (): boolean => {
  const { isGenerating } = useProject()
  return isGenerating()
}

/**
 * Hook to get artifacts for current project
 * Lightweight alternative to full useProject hook
 */
export const useProjectArtifacts = (): PhaseArtifact[] => {
  const { getArtifacts } = useProject()
  return getArtifacts()
}

/**
 * Hook to get artifacts by phase
 * Provides convenient phase-specific artifact access
 */
export const useArtifactsByPhase = (phase: PhaseType): PhaseArtifact[] => {
  const { getArtifactsByPhase } = useProject()
  return useMemo(() => getArtifactsByPhase(phase), [getArtifactsByPhase, phase])
}

/**
 * Hook to get project context nodes
 * Lightweight alternative to full useProject hook
 */
export const useProjectContext = (): ContextNode[] => {
  const { getContextNodes } = useProject()
  return getContextNodes()
}

/**
 * Hook to get collaboration state
 * Provides convenient collaboration utilities
 */
export const useProjectCollaboration = () => {
  const { isCollaborationEnabled, enableCollaboration, disableCollaboration } = useProject()
  
  return useMemo(() => ({
    isEnabled: isCollaborationEnabled(),
    enable: enableCollaboration,
    disable: disableCollaboration
  }), [isCollaborationEnabled, enableCollaboration, disableCollaboration])
}

/**
 * Hook to get AI provider state
 * Provides convenient AI provider utilities
 */
export const useProjectAI = () => {
  const { getAIProvider, isProviderConnected, setAIProvider } = useProject()
  
  return useMemo(() => ({
    provider: getAIProvider(),
    isConnected: isProviderConnected(),
    setProvider: setAIProvider
  }), [getAIProvider, isProviderConnected, setAIProvider])
}

/**
 * Hook for project errors
 * Lightweight alternative to full useProject hook
 */
export const useProjectError = (): ReadyAIError | null => {
  const { error } = useProject()
  return error
}

// =============================================================================
// EXPORTS
// =============================================================================

export default useProject

// Re-export project management types for convenience
export {
  PhaseType,
  PhaseStatus,
  ProjectStatus,
  AIProviderType,
  ContextType
} from '../../foundation/types/core'

export type {
  Project,
  ProjectConfig,
  TechStack,
  Phase,
  PhaseArtifact,
  DependencyGraph,
  DependencyNode,
  GenerationRequest,
  GenerationResult,
  ValidationResult,
  QualityMetrics,
  AIProviderConfig,
  ContextNode,
  ProjectCreationRequest,
  ProjectUpdateRequest,
  ProjectSearchCriteria,
  ProjectOperationResult
} from '../../project-management/types/project'
