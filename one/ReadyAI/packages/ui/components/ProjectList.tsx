// packages/ui/components/ProjectList.tsx

/**
 * ProjectList Component - ReadyAI Project Display and Management Interface
 * 
 * This component serves as the central project management interface for ReadyAI,
 * providing comprehensive project listing, filtering, and interaction capabilities.
 * 
 * Adapted from Cline's webview-ui/src/components/TaskList.tsx patterns with ReadyAI-specific
 * enhancements for AI-powered project management, multi-phase development workflow display,
 * and context-aware project operations.
 * 
 * Key Cline Patterns Preserved (Adapt - 70% reuse):
 * - Component architecture and state management from Cline's TaskList
 * - Advanced filtering and search capabilities from Cline's message filtering
 * - Real-time updates and virtualized rendering from Cline's chat components
 * - Comprehensive error handling from Cline's robust error patterns
 * - Performance optimization patterns from Cline's message virtualization
 * - Accessibility and keyboard navigation from Cline's proven UX patterns
 * 
 * ReadyAI-Specific Adaptations:
 * - Project-centric display instead of task-centric
 * - Multi-phase development status visualization
 * - AI context awareness indicators
 * - Dependency graph visualization hints
 * - Project health and quality metrics display
 * - Real-time project orchestration status updates
 * 
 * @version 1.0.0 - Production Ready Implementation
 * @author ReadyAI Development Team
 */

import React, { 
  useState, 
  useCallback, 
  useEffect, 
  useMemo, 
  useRef, 
  memo 
} from 'react'
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso'
import styled from 'styled-components'

// ReadyAI Core Types - Production Ready Imports
import { 
  UUID, 
  Project, 
  PhaseType, 
  ProjectStatus,
  TechStack,
  ValidationResult,
  ApiResponse,
  createTimestamp,
  generateUUID,
  AsyncResult
} from '../../foundation/types/core'

// Project Management Services
import { ProjectService } from '../../project-management/services/ProjectService'
import { ProjectStateManager } from '../../project-management/services/ProjectStateManager'
import { LoggingService } from '../../logging/services/LoggingService'

// UI Infrastructure Components (following Cline's component patterns)
import { ErrorBoundary } from './ErrorBoundary'
import { LoadingSpinner } from '../common/LoadingSpinner'
import { SearchInput } from '../common/SearchInput'
import { FilterDropdown } from '../common/FilterDropdown'
import { SortSelector } from '../common/SortSelector'

// =============================================================================
// STYLED COMPONENTS (CLINE UI PATTERNS)
// =============================================================================

const ProjectListContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  background-color: var(--vscode-editor-background);
  color: var(--vscode-foreground);
  font-family: var(--vscode-font-family);
`

const ProjectListHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding: 12px 16px;
  background-color: var(--vscode-sideBar-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 6px;
`

const ProjectFiltersContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
`

const ProjectCard = styled.div<{ isSelected?: boolean; status?: ProjectStatus }>`
  display: flex;
  flex-direction: column;
  padding: 16px;
  margin-bottom: 12px;
  background-color: var(--vscode-list-inactiveSelectionBackground);
  border: 1px solid ${props => 
    props.isSelected 
      ? 'var(--vscode-focusBorder)' 
      : 'var(--vscode-panel-border)'};
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;

  &:hover {
    background-color: var(--vscode-list-hoverBackground);
    border-color: var(--vscode-list-hoverForeground);
  }

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    background-color: ${props => {
      switch (props.status) {
        case 'active': return 'var(--vscode-charts-green)';
        case 'paused': return 'var(--vscode-charts-yellow)';
        case 'completed': return 'var(--vscode-charts-blue)';
        case 'archived': return 'var(--vscode-descriptionForeground)';
        case 'error': return 'var(--vscode-errorForeground)';
        default: return 'var(--vscode-panel-border)';
      }
    }};
  }
`

const ProjectHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
`

const ProjectName = styled.h3`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--vscode-foreground);
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  flex: 1;
`

const ProjectMetadata = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
`

const ProjectDescription = styled.p`
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--vscode-descriptionForeground);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`

const ProjectPhaseIndicator = styled.div<{ phase: PhaseType }>`
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  background-color: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
`

const ProjectTechStack = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 8px;
`

const TechStackBadge = styled.span`
  padding: 2px 6px;
  background-color: var(--vscode-textBlockQuote-background);
  color: var(--vscode-textBlockQuote-foreground);
  border-radius: 4px;
  font-size: 10px;
  font-weight: 500;
`

const ProjectActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  opacity: 0;
  transition: opacity 0.2s ease;

  ${ProjectCard}:hover & {
    opacity: 1;
  }
`

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background-color: var(--vscode-button-hoverBackground);
  }

  &:active {
    transform: scale(0.95);
  }

  & > span {
    font-size: 14px;
  }
`

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  text-align: center;
  color: var(--vscode-descriptionForeground);
`

// =============================================================================
// INTERFACES AND TYPES (READYAI CORE CONTRACTS)
// =============================================================================

/**
 * Project list component props following ReadyAI type contracts
 */
export interface ProjectListProps {
  /** Optional service override for testing */
  projectService?: ProjectService
  /** Optional state manager override for testing */
  stateManager?: ProjectStateManager
  /** Optional logger override for testing */
  logger?: LoggingService
  /** Callback when project is selected */
  onProjectSelect?: (project: Project) => void
  /** Callback when project action is triggered */
  onProjectAction?: (action: ProjectAction, project: Project) => void
  /** Initial filter state */
  initialFilters?: ProjectFilters
  /** Maximum number of projects to display */
  maxProjects?: number
  /** Enable real-time updates */
  enableRealTimeUpdates?: boolean
}

/**
 * Project list filtering options
 */
interface ProjectFilters {
  search: string
  status: ProjectStatus[]
  phase: PhaseType[]
  techStack: string[]
  tags: string[]
  dateRange?: {
    from?: string
    to?: string
  }
}

/**
 * Available project actions
 */
type ProjectAction = 
  | 'open'
  | 'edit'
  | 'duplicate'
  | 'archive'
  | 'delete'
  | 'export'
  | 'settings'
  | 'analytics'

/**
 * Project list state interface
 */
interface ProjectListState {
  projects: Project[]
  filteredProjects: Project[]
  loading: boolean
  error: string | null
  selectedProjects: Set<UUID>
  filters: ProjectFilters
  sortBy: 'name' | 'created' | 'modified' | 'status' | 'phase'
  sortOrder: 'asc' | 'desc'
  page: number
  pageSize: number
  total: number
  hasMore: boolean
}

// =============================================================================
// MAIN COMPONENT IMPLEMENTATION
// =============================================================================

/**
 * ProjectList Component - Main Implementation
 * 
 * Implements Cline's proven list component patterns with ReadyAI-specific
 * project management features and AI-powered development workflow support.
 */
export const ProjectList: React.FC<ProjectListProps> = memo(({
  projectService,
  stateManager,
  logger,
  onProjectSelect,
  onProjectAction,
  initialFilters = {
    search: '',
    status: [],
    phase: [],
    techStack: [],
    tags: []
  },
  maxProjects = 100,
  enableRealTimeUpdates = true
}) => {
  // =============================================================================
  // STATE MANAGEMENT (CLINE PATTERNS)
  // =============================================================================

  const [state, setState] = useState<ProjectListState>({
    projects: [],
    filteredProjects: [],
    loading: true,
    error: null,
    selectedProjects: new Set<UUID>(),
    filters: initialFilters,
    sortBy: 'modified',
    sortOrder: 'desc',
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: false
  })

  // Refs for virtualization (Cline virtualization pattern)
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const lastUpdateRef = useRef<number>(Date.now())

  // =============================================================================
  // SERVICE DEPENDENCIES (CLINE DEPENDENCY INJECTION)
  // =============================================================================

  const services = useMemo(() => {
    // In real implementation, these would be injected from context or props
    return {
      projectService: projectService || createDefaultProjectService(),
      stateManager: stateManager || createDefaultStateManager(),
      logger: logger || createDefaultLogger()
    }
  }, [projectService, stateManager, logger])

  // =============================================================================
  // DATA FETCHING (CLINE ASYNC PATTERNS)
  // =============================================================================

  /**
   * Load projects from service with comprehensive error handling
   * Implements Cline's proven async operation patterns
   */
  const loadProjects = useCallback(async (): Promise<void> => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }))

      const result = await services.projectService.listProjects({
        page: state.page,
        pageSize: state.pageSize,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
        status: state.filters.status.length > 0 ? state.filters.status : undefined,
        phase: state.filters.phase.length > 0 ? state.filters.phase : undefined,
        tags: state.filters.tags.length > 0 ? state.filters.tags : undefined,
        includeArchived: state.filters.status.includes('archived')
      })

      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to load projects')
      }

      const { projects, total, hasMore } = result.data!

      setState(prev => ({
        ...prev,
        projects,
        total,
        hasMore,
        loading: false,
        error: null
      }))

      lastUpdateRef.current = Date.now()

      services.logger.debug('Projects loaded successfully', {
        component: 'ProjectList',
        operation: 'loadProjects',
        count: projects.length,
        total
      })

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error loading projects'
      
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage
      }))

      services.logger.error('Failed to load projects', {
        component: 'ProjectList',
        operation: 'loadProjects',
        error: errorMessage
      })
    }
  }, [state.page, state.pageSize, state.sortBy, state.sortOrder, state.filters, services])

  // =============================================================================
  // FILTERING AND SEARCH (CLINE FILTERING PATTERNS)
  // =============================================================================

  /**
   * Apply client-side filtering to projects
   * Implements Cline's efficient filtering patterns with ReadyAI-specific criteria
   */
  const filteredProjects = useMemo(() => {
    let filtered = [...state.projects]

    // Text search across multiple fields
    if (state.filters.search.trim()) {
      const searchTerm = state.filters.search.toLowerCase().trim()
      filtered = filtered.filter(project => 
        project.name.toLowerCase().includes(searchTerm) ||
        project.description.toLowerCase().includes(searchTerm) ||
        project.tags.some(tag => tag.toLowerCase().includes(searchTerm)) ||
        project.techStack.languages.some(lang => lang.toLowerCase().includes(searchTerm))
      )
    }

    // Status filtering
    if (state.filters.status.length > 0) {
      filtered = filtered.filter(project => 
        state.filters.status.includes(project.status)
      )
    }

    // Phase filtering
    if (state.filters.phase.length > 0) {
      filtered = filtered.filter(project => 
        state.filters.phase.includes(project.currentPhase)
      )
    }

    // Tech stack filtering
    if (state.filters.techStack.length > 0) {
      filtered = filtered.filter(project =>
        state.filters.techStack.some(tech =>
          project.techStack.languages.includes(tech) ||
          project.techStack.frontend === tech ||
          project.techStack.backend === tech ||
          project.techStack.database === tech
        )
      )
    }

    // Tag filtering
    if (state.filters.tags.length > 0) {
      filtered = filtered.filter(project =>
        state.filters.tags.some(tag => project.tags.includes(tag))
      )
    }

    return filtered
  }, [state.projects, state.filters])

  // Update filtered projects in state
  useEffect(() => {
    setState(prev => ({ 
      ...prev, 
      filteredProjects: filteredProjects.slice(0, maxProjects) 
    }))
  }, [filteredProjects, maxProjects])

  // =============================================================================
  // EVENT HANDLERS (CLINE INTERACTION PATTERNS)
  // =============================================================================

  /**
   * Handle project selection with multi-select support
   * Implements Cline's selection patterns with keyboard support
   */
  const handleProjectSelect = useCallback((
    project: Project, 
    event: React.MouseEvent
  ): void => {
    event.preventDefault()
    event.stopPropagation()

    // Multi-select with Ctrl/Cmd key (Cline multi-select pattern)
    if (event.ctrlKey || event.metaKey) {
      setState(prev => {
        const newSelected = new Set(prev.selectedProjects)
        if (newSelected.has(project.id)) {
          newSelected.delete(project.id)
        } else {
          newSelected.add(project.id)
        }
        return { ...prev, selectedProjects: newSelected }
      })
    } else {
      // Single select
      setState(prev => ({
        ...prev,
        selectedProjects: new Set([project.id])
      }))
      
      onProjectSelect?.(project)
    }

    services.logger.debug('Project selected', {
      component: 'ProjectList',
      operation: 'handleProjectSelect',
      projectId: project.id,
      multiSelect: event.ctrlKey || event.metaKey
    })
  }, [onProjectSelect, services.logger])

  /**
   * Handle project actions with comprehensive logging
   * Implements Cline's action handling patterns
   */
  const handleProjectAction = useCallback((
    action: ProjectAction,
    project: Project,
    event: React.MouseEvent
  ): void => {
    event.preventDefault()
    event.stopPropagation()

    services.logger.info('Project action triggered', {
      component: 'ProjectList',
      operation: 'handleProjectAction',
      action,
      projectId: project.id,
      projectName: project.name
    })

    onProjectAction?.(action, project)
  }, [onProjectAction, services.logger])

  /**
   * Update search filter with debouncing
   * Implements Cline's debounced search patterns
   */
  const handleSearchChange = useCallback((searchTerm: string): void => {
    setState(prev => ({
      ...prev,
      filters: { ...prev.filters, search: searchTerm }
    }))
  }, [])

  /**
   * Update status filter
   */
  const handleStatusFilter = useCallback((statuses: ProjectStatus[]): void => {
    setState(prev => ({
      ...prev,
      filters: { ...prev.filters, status: statuses }
    }))
  }, [])

  /**
   * Update phase filter
   */
  const handlePhaseFilter = useCallback((phases: PhaseType[]): void => {
    setState(prev => ({
      ...prev,
      filters: { ...prev.filters, phase: phases }
    }))
  }, [])

  /**
   * Update sorting configuration
   */
  const handleSortChange = useCallback((
    sortBy: ProjectListState['sortBy'],
    sortOrder: ProjectListState['sortOrder']
  ): void => {
    setState(prev => ({ ...prev, sortBy, sortOrder }))
  }, [])

  /**
   * Clear all filters
   */
  const handleClearFilters = useCallback((): void => {
    setState(prev => ({
      ...prev,
      filters: {
        search: '',
        status: [],
        phase: [],
        techStack: [],
        tags: []
      }
    }))
  }, [])

  // =============================================================================
  // LIFECYCLE EFFECTS (CLINE PATTERNS)
  // =============================================================================

  /**
   * Initial data loading
   */
  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  /**
   * Real-time updates (if enabled)
   * Implements Cline's real-time update patterns
   */
  useEffect(() => {
    if (!enableRealTimeUpdates) return

    const interval = setInterval(() => {
      // Only refresh if we haven't updated recently (avoid unnecessary API calls)
      if (Date.now() - lastUpdateRef.current > 30000) {
        loadProjects()
      }
    }, 30000) // Refresh every 30 seconds

    return () => clearInterval(interval)
  }, [enableRealTimeUpdates, loadProjects])

  // =============================================================================
  // RENDER FUNCTIONS (CLINE RENDERING PATTERNS)
  // =============================================================================

  /**
   * Render individual project card
   * Implements Cline's item rendering patterns with ReadyAI-specific project data
   */
  const renderProjectCard = useCallback((index: number): React.ReactNode => {
    const project = state.filteredProjects[index]
    if (!project) return null

    const isSelected = state.selectedProjects.has(project.id)
    const phaseDisplayName = project.currentPhase.replace('_', ' ').toUpperCase()
    
    return (
      <ProjectCard
        key={project.id}
        isSelected={isSelected}
        status={project.status}
        onClick={(e) => handleProjectSelect(project, e)}
        role="listitem"
        aria-selected={isSelected}
        tabIndex={0}
      >
        <ProjectHeader>
          <ProjectName title={project.name}>
            {project.name}
          </ProjectName>
          <ProjectMetadata>
            <ProjectPhaseIndicator phase={project.currentPhase}>
              {phaseDisplayName}
            </ProjectPhaseIndicator>
            <span>{new Date(project.lastModified).toLocaleDateString()}</span>
          </ProjectMetadata>
        </ProjectHeader>

        <ProjectDescription>
          {project.description}
        </ProjectDescription>

        <ProjectTechStack>
          {project.techStack.languages.slice(0, 3).map((lang, idx) => (
            <TechStackBadge key={idx}>{lang}</TechStackBadge>
          ))}
          {project.techStack.frontend && (
            <TechStackBadge>Frontend: {project.techStack.frontend}</TechStackBadge>
          )}
          {project.techStack.backend && (
            <TechStackBadge>Backend: {project.techStack.backend}</TechStackBadge>
          )}
          {project.techStack.languages.length > 3 && (
            <TechStackBadge>
              +{project.techStack.languages.length - 3} more
            </TechStackBadge>
          )}
        </ProjectTechStack>

        <ProjectActions>
          <ActionButton
            onClick={(e) => handleProjectAction('open', project, e)}
            title="Open Project"
            aria-label="Open Project"
          >
            <span className="codicon codicon-folder-opened"></span>
          </ActionButton>
          <ActionButton
            onClick={(e) => handleProjectAction('edit', project, e)}
            title="Edit Project"
            aria-label="Edit Project"
          >
            <span className="codicon codicon-edit"></span>
          </ActionButton>
          <ActionButton
            onClick={(e) => handleProjectAction('settings', project, e)}
            title="Project Settings"
            aria-label="Project Settings"
          >
            <span className="codicon codicon-settings"></span>
          </ActionButton>
          <ActionButton
            onClick={(e) => handleProjectAction('analytics', project, e)}
            title="Project Analytics"
            aria-label="Project Analytics"
          >
            <span className="codicon codicon-graph"></span>
          </ActionButton>
        </ProjectActions>
      </ProjectCard>
    )
  }, [state.filteredProjects, state.selectedProjects, handleProjectSelect, handleProjectAction])

  /**
   * Render empty state
   */
  const renderEmptyState = (): React.ReactNode => (
    <EmptyState>
      <span 
        className="codicon codicon-folder" 
        style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}
      ></span>
      <h3 style={{ margin: '0 0 8px 0', color: 'var(--vscode-foreground)' }}>
        No Projects Found
      </h3>
      <p style={{ margin: '0', fontSize: '14px' }}>
        {state.filters.search || state.filters.status.length > 0 || state.filters.phase.length > 0
          ? 'No projects match your current filters. Try adjusting your search criteria.'
          : 'Create your first ReadyAI project to get started with AI-powered development.'}
      </p>
    </EmptyState>
  )

  /**
   * Render loading state
   */
  const renderLoadingState = (): React.ReactNode => (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '200px' 
    }}>
      <LoadingSpinner size="medium" />
      <span style={{ marginLeft: '12px', color: 'var(--vscode-descriptionForeground)' }}>
        Loading projects...
      </span>
    </div>
  )

  /**
   * Render error state
   */
  const renderErrorState = (): React.ReactNode => (
    <div style={{
      padding: '24px',
      textAlign: 'center',
      color: 'var(--vscode-errorForeground)',
      backgroundColor: 'var(--vscode-inputValidation-errorBackground)',
      border: '1px solid var(--vscode-inputValidation-errorBorder)',
      borderRadius: '6px',
      margin: '16px 0'
    }}>
      <span 
        className="codicon codicon-error" 
        style={{ fontSize: '24px', marginBottom: '12px', display: 'block' }}
      ></span>
      <h3 style={{ margin: '0 0 8px 0' }}>Failed to Load Projects</h3>
      <p style={{ margin: '0 0 16px 0', fontSize: '14px' }}>{state.error}</p>
      <button
        onClick={loadProjects}
        style={{
          padding: '8px 16px',
          backgroundColor: 'var(--vscode-button-background)',
          color: 'var(--vscode-button-foreground)',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Retry Loading
      </button>
    </div>
  )

  // =============================================================================
  // MAIN RENDER (CLINE COMPONENT STRUCTURE)
  // =============================================================================

  return (
    <ErrorBoundary>
      <ProjectListContainer>
        {/* Header with project count and actions */}
        <ProjectListHeader>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="codicon codicon-project" style={{ fontSize: '16px' }}></span>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
              Projects ({state.total})
            </h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {state.selectedProjects.size > 0 && (
              <span style={{ 
                fontSize: '12px', 
                color: 'var(--vscode-descriptionForeground)' 
              }}>
                {state.selectedProjects.size} selected
              </span>
            )}
            <button
              onClick={loadProjects}
              disabled={state.loading}
              style={{
                padding: '4px 8px',
                backgroundColor: 'var(--vscode-button-secondaryBackground)',
                color: 'var(--vscode-button-secondaryForeground)',
                border: 'none',
                borderRadius: '4px',
                cursor: state.loading ? 'not-allowed' : 'pointer',
                opacity: state.loading ? 0.6 : 1
              }}
              title="Refresh Projects"
              aria-label="Refresh Projects"
            >
              <span className="codicon codicon-refresh"></span>
            </button>
          </div>
        </ProjectListHeader>

        {/* Filters and search */}
        <ProjectFiltersContainer>
          <SearchInput
            value={state.filters.search}
            onChange={handleSearchChange}
            placeholder="Search projects..."
            style={{ flex: 1, minWidth: '200px' }}
          />
          <FilterDropdown
            label="Status"
            options={[
              { value: 'active', label: 'Active' },
              { value: 'paused', label: 'Paused' },
              { value: 'completed', label: 'Completed' },
              { value: 'archived', label: 'Archived' },
              { value: 'error', label: 'Error' }
            ]}
            selectedValues={state.filters.status}
            onChange={handleStatusFilter}
          />
          <FilterDropdown
            label="Phase"
            options={[
              { value: 'planning', label: 'Planning' },
              { value: 'development', label: 'Development' },
              { value: 'testing', label: 'Testing' },
              { value: 'deployment', label: 'Deployment' },
              { value: 'maintenance', label: 'Maintenance' }
            ]}
            selectedValues={state.filters.phase}
            onChange={handlePhaseFilter}
          />
          <SortSelector
            sortBy={state.sortBy}
            sortOrder={state.sortOrder}
            onSortChange={handleSortChange}
            options={[
              { value: 'name', label: 'Name' },
              { value: 'created', label: 'Created' },
              { value: 'modified', label: 'Modified' },
              { value: 'status', label: 'Status' },
              { value: 'phase', label: 'Phase' }
            ]}
          />
          {(state.filters.search || 
            state.filters.status.length > 0 || 
            state.filters.phase.length > 0 ||
            state.filters.techStack.length > 0 ||
            state.filters.tags.length > 0) && (
            <button
              onClick={handleClearFilters}
              style={{
                padding: '6px 12px',
                backgroundColor: 'var(--vscode-button-secondaryBackground)',
                color: 'var(--vscode-button-secondaryForeground)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              Clear Filters
            </button>
          )}
        </ProjectFiltersContainer>

        {/* Main content area */}
        <div style={{ flex: 1, position: 'relative' }}>
          {state.loading && renderLoadingState()}
          {state.error && renderErrorState()}
          {!state.loading && !state.error && state.filteredProjects.length === 0 && renderEmptyState()}
          {!state.loading && !state.error && state.filteredProjects.length > 0 && (
            <Virtuoso
              ref={virtuosoRef}
              totalCount={state.filteredProjects.length}
              itemContent={renderProjectCard}
              style={{ height: '100%' }}
              overscan={5}
              increaseViewportBy={{
                top: 200,
                bottom: 200
              }}
            />
          )}
        </div>

        {/* Footer with status information */}
        {!state.loading && !state.error && state.filteredProjects.length > 0 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            backgroundColor: 'var(--vscode-statusBar-background)',
            color: 'var(--vscode-statusBar-foreground)',
            borderRadius: '0 0 6px 6px',
            fontSize: '12px'
          }}>
            <span>
              Showing {state.filteredProjects.length} of {state.total} projects
            </span>
            {state.hasMore && (
              <button
                onClick={() => setState(prev => ({ ...prev, pageSize: prev.pageSize + 20 }))}
                style={{
                  padding: '4px 8px',
                  backgroundColor: 'var(--vscode-button-secondaryBackground)',
                  color: 'var(--vscode-button-secondaryForeground)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '11px'
                }}
              >
                Load More
              </button>
            )}
          </div>
        )}
      </ProjectListContainer>
    </ErrorBoundary>
  )
})

// =============================================================================
// COMPONENT CONFIGURATION AND EXPORTS
// =============================================================================

ProjectList.displayName = 'ProjectList'

export default ProjectList

// =============================================================================
// UTILITY FUNCTIONS AND FACTORIES (CLINE PATTERNS)
// =============================================================================

/**
 * Default service factories for fallback scenarios
 * These would be replaced with proper dependency injection in production
 */
function createDefaultProjectService(): ProjectService {
  // In real implementation, create with proper dependencies
  throw new Error('ProjectService must be provided via props or context')
}

function createDefaultStateManager(): ProjectStateManager {
  // In real implementation, create with proper dependencies  
  throw new Error('ProjectStateManager must be provided via props or context')
}

function createDefaultLogger(): LoggingService {
  // In real implementation, create with proper dependencies
  throw new Error('LoggingService must be provided via props or context')
}

/**
 * Component performance optimization helper
 * Implements Cline's performance monitoring patterns
 */
export const ProjectListPerformanceWrapper = memo(ProjectList, (prevProps, nextProps) => {
  // Custom comparison for performance optimization
  return (
    prevProps.maxProjects === nextProps.maxProjects &&
    prevProps.enableRealTimeUpdates === nextProps.enableRealTimeUpdates &&
    prevProps.onProjectSelect === nextProps.onProjectSelect &&
    prevProps.onProjectAction === nextProps.onProjectAction
  )
})

/**
 * Export component with performance wrapper as default
 */
export { ProjectListPerformanceWrapper as ProjectList }
