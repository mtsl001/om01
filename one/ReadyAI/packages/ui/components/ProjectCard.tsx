// packages/ui/components/ProjectCard.tsx

/**
 * ProjectCard Component - ReadyAI Project Display Card
 * 
 * Displays individual project information in a card format within the ProjectList.
 * Adapted from Cline's card component patterns with ReadyAI-specific project data visualization.
 * 
 * Key Cline Patterns Preserved (Adapt - 70% reuse):
 * - Card layout and styling patterns from Cline's webview-ui components
 * - Hover and interaction patterns from Cline's chat message cards
 * - Action button patterns from Cline's UI toolkit integration
 * - State-based styling from Cline's status indicator patterns
 * - Accessibility patterns from Cline's proven component architecture
 * 
 * ReadyAI-Specific Adaptations:
 * - Project-centric information display
 * - Phase status visualization
 * - Technology stack badges
 * - Quick action buttons for project operations
 * - Status-based color coding
 * - Project metrics display
 * 
 * @version 1.0.0 - Production Ready Implementation
 * @author ReadyAI Development Team
 */

import React, { memo, useCallback, useMemo } from 'react'
import styled from 'styled-components'

// ReadyAI Core Types
import { 
  Project, 
  PhaseType, 
  ProjectStatus,
  UUID,
  createTimestamp
} from '../../foundation/types/core'

// UI Infrastructure
import { LoggingService } from '../../logging/services/LoggingService'

// =============================================================================
// STYLED COMPONENTS (CLINE UI PATTERNS)
// =============================================================================

const CardContainer = styled.div<{ 
  isSelected?: boolean; 
  status?: ProjectStatus;
  isHovered?: boolean;
}>`
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
  min-height: 120px;

  &:hover {
    background-color: var(--vscode-list-hoverBackground);
    border-color: var(--vscode-list-hoverForeground);
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  }

  &:active {
    transform: translateY(0);
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

const CardHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 12px;
  gap: 12px;
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
  line-height: 1.3;
`

const ProjectMetadata = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
  flex-shrink: 0;
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
  min-height: 2.8em; /* Reserve space for 2 lines */
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
  text-transform: uppercase;
  letter-spacing: 0.5px;
`

const ProjectTechStack = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin: 8px 0;
  min-height: 24px; /* Reserve space for at least one row */
`

const TechStackBadge = styled.span`
  padding: 2px 6px;
  background-color: var(--vscode-textBlockQuote-background);
  color: var(--vscode-textBlockQuote-foreground);
  border-radius: 4px;
  font-size: 10px;
  font-weight: 500;
  white-space: nowrap;
`

const ProjectFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 8px;
`

const ProjectStats = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
`

const StatItem = styled.span`
  display: flex;
  align-items: center;
  gap: 4px;
`

const ProjectActions = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.2s ease;

  ${CardContainer}:hover & {
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
  font-size: 14px;

  &:hover {
    background-color: var(--vscode-button-hoverBackground);
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }

  &:focus {
    outline: 1px solid var(--vscode-focusBorder);
  }
`

// =============================================================================
// INTERFACES AND TYPES
// =============================================================================

/**
 * Available project actions
 */
export type ProjectAction = 
  | 'open'
  | 'edit' 
  | 'duplicate'
  | 'archive'
  | 'delete'
  | 'export'
  | 'settings'
  | 'analytics'

/**
 * Project card component props
 */
export interface ProjectCardProps {
  /** Project data to display */
  project: Project
  /** Whether this card is currently selected */
  isSelected?: boolean
  /** Callback when project is selected */
  onSelect?: (project: Project, event: React.MouseEvent) => void
  /** Callback when project action is triggered */
  onAction?: (action: ProjectAction, project: Project, event: React.MouseEvent) => void
  /** Optional logger instance */
  logger?: LoggingService
  /** Optional CSS class name */
  className?: string
  /** Optional style overrides */
  style?: React.CSSProperties
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Format phase type for display
 */
function formatPhaseDisplay(phase: PhaseType): string {
  return phase
    .replace(/Phase\d+_?/, '')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .toUpperCase()
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) {
    return 'Today'
  } else if (diffDays === 1) {
    return 'Yesterday'
  } else if (diffDays < 7) {
    return `${diffDays} days ago`
  } else {
    return date.toLocaleDateString()
  }
}

/**
 * Get status icon
 */
function getStatusIcon(status: ProjectStatus): string {
  switch (status) {
    case 'active': return 'play'
    case 'paused': return 'debug-pause'
    case 'completed': return 'check'
    case 'archived': return 'archive'
    case 'error': return 'error'
    default: return 'circle-outline'
  }
}

// =============================================================================
// MAIN COMPONENT IMPLEMENTATION
// =============================================================================

/**
 * ProjectCard Component - Main Implementation
 * 
 * Displays project information in a card format with status indicators,
 * tech stack, and quick actions. Follows Cline's proven card patterns
 * while adapting to ReadyAI's project-specific requirements.
 */
export const ProjectCard: React.FC<ProjectCardProps> = memo(({
  project,
  isSelected = false,
  onSelect,
  onAction,
  logger,
  className,
  style
}) => {
  // =============================================================================
  // COMPUTED VALUES
  // =============================================================================

  const phaseDisplayName = useMemo(() => 
    formatPhaseDisplay(project.currentPhase), 
    [project.currentPhase]
  )

  const lastModifiedDisplay = useMemo(() => 
    formatTimestamp(project.lastModified), 
    [project.lastModified]
  )

  const statusIcon = useMemo(() => 
    getStatusIcon(project.status), 
    [project.status]
  )

  const primaryTechStack = useMemo(() => {
    const items: string[] = []
    
    // Add primary languages (limit to 3)
    items.push(...project.techStack.languages.slice(0, 3))
    
    // Add framework info if available
    if (project.techStack.frontend && !items.includes(project.techStack.frontend)) {
      items.push(project.techStack.frontend)
    }
    if (project.techStack.backend && !items.includes(project.techStack.backend)) {
      items.push(project.techStack.backend)
    }
    
    return items.slice(0, 4) // Max 4 badges
  }, [project.techStack])

  const hasMoreTech = useMemo(() => {
    const totalTech = project.techStack.languages.length + 
      (project.techStack.frontend ? 1 : 0) +
      (project.techStack.backend ? 1 : 0) +
      (project.techStack.database ? 1 : 0) +
      project.techStack.tools.length
    return totalTech > primaryTechStack.length
  }, [project.techStack, primaryTechStack.length])

  // =============================================================================
  // EVENT HANDLERS
  // =============================================================================

  /**
   * Handle card selection
   */
  const handleCardClick = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    
    logger?.debug('Project card clicked', {
      component: 'ProjectCard',
      projectId: project.id,
      projectName: project.name
    })

    onSelect?.(project, event)
  }, [project, onSelect, logger])

  /**
   * Handle project actions
   */
  const handleAction = useCallback((
    action: ProjectAction,
    event: React.MouseEvent
  ) => {
    event.preventDefault()
    event.stopPropagation() // Prevent card selection

    logger?.info('Project action triggered', {
      component: 'ProjectCard',
      action,
      projectId: project.id,
      projectName: project.name
    })

    onAction?.(action, project, event)
  }, [project, onAction, logger])

  /**
   * Handle keyboard navigation
   */
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect?.(project, event as any)
    }
  }, [project, onSelect])

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <CardContainer
      className={className}
      style={style}
      isSelected={isSelected}
      status={project.status}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      role="button"
      aria-selected={isSelected}
      aria-label={`Project: ${project.name}`}
      tabIndex={0}
    >
      {/* Header with name and metadata */}
      <CardHeader>
        <ProjectName title={project.name}>
          {project.name}
        </ProjectName>
        <ProjectMetadata>
          <ProjectPhaseIndicator phase={project.currentPhase}>
            {phaseDisplayName}
          </ProjectPhaseIndicator>
        </ProjectMetadata>
      </CardHeader>

      {/* Description */}
      <ProjectDescription>
        {project.description || 'No description provided'}
      </ProjectDescription>

      {/* Technology Stack */}
      <ProjectTechStack>
        {primaryTechStack.map((tech, index) => (
          <TechStackBadge key={`${tech}-${index}`}>
            {tech}
          </TechStackBadge>
        ))}
        {hasMoreTech && (
          <TechStackBadge>
            +{project.techStack.languages.length + 
              project.techStack.tools.length - 
              primaryTechStack.length} more
          </TechStackBadge>
        )}
      </ProjectTechStack>

      {/* Footer with stats and actions */}
      <ProjectFooter>
        <ProjectStats>
          <StatItem>
            <span className={`codicon codicon-${statusIcon}`}></span>
            {project.status}
          </StatItem>
          <StatItem>
            <span className="codicon codicon-history"></span>
            {lastModifiedDisplay}
          </StatItem>
          {project.metrics && (
            <StatItem>
              <span className="codicon codicon-files"></span>
              {project.metrics.totalFiles} files
            </StatItem>
          )}
        </ProjectStats>

        <ProjectActions>
          <ActionButton
            onClick={(e) => handleAction('open', e)}
            title="Open Project"
            aria-label="Open Project"
          >
            <span className="codicon codicon-folder-opened"></span>
          </ActionButton>
          <ActionButton
            onClick={(e) => handleAction('edit', e)}
            title="Edit Project"
            aria-label="Edit Project"
          >
            <span className="codicon codicon-edit"></span>
          </ActionButton>
          <ActionButton
            onClick={(e) => handleAction('settings', e)}
            title="Project Settings"
            aria-label="Project Settings"
          >
            <span className="codicon codicon-settings"></span>
          </ActionButton>
          <ActionButton
            onClick={(e) => handleAction('analytics', e)}
            title="Project Analytics"
            aria-label="Project Analytics"
          >
            <span className="codicon codicon-graph"></span>
          </ActionButton>
        </ProjectActions>
      </ProjectFooter>
    </CardContainer>
  )
})

// =============================================================================
// COMPONENT CONFIGURATION
// =============================================================================

ProjectCard.displayName = 'ProjectCard'

export default ProjectCard

// =============================================================================
// PERFORMANCE OPTIMIZATION
// =============================================================================

/**
 * Optimized ProjectCard with custom comparison
 */
export const ProjectCardOptimized = memo(ProjectCard, (prevProps, nextProps) => {
  // Custom comparison for performance optimization
  return (
    prevProps.project.id === nextProps.project.id &&
    prevProps.project.lastModified === nextProps.project.lastModified &&
    prevProps.project.status === nextProps.project.status &&
    prevProps.project.currentPhase === nextProps.project.currentPhase &&
    prevProps.isSelected === nextProps.isSelected
  )
})

/**
 * Export optimized version as default for performance
 */
export { ProjectCardOptimized as ProjectCard }
