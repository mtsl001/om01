/**
 * UI Configuration types for ReadyAI Personal AI Development Orchestrator
 * 
 * This module adapts Cline's battle-tested frontend type system with ReadyAI-specific
 * UI state management requirements. Achieves 75% reuse of Cline's proven webview-ui
 * patterns while adding ReadyAI's unique orchestration dashboard and phase visualization.
 * 
 * Adapted from Cline's webview-ui context and state management patterns
 */

import { ApiProvider, ApiConfiguration, PhaseConfiguration, PhaseConfigurationMap, ModelInfo, ReasoningEffort, ThinkingConfig, ConfigurationValidationResult, ConfigurationTemplate } from '../../../config/types/config'
import { UUID, PhaseType, PhaseStatus, Project, QualityMetrics, ValidationResult, ApiResponse, ApiErrorResponse } from '../../../foundation/types/core'

// =============================================================================
// UI STATE MANAGEMENT (Adapted from Cline ExtensionStateContext)
// =============================================================================

/**
 * Main UI application state interface
 * Enhanced adaptation of Cline's ExtensionState with ReadyAI orchestration
 */
export interface ReadyAIUIState {
  // =====================================
  // CORE PROJECT STATE
  // =====================================
  
  /** Current active project */
  currentProject?: Project
  
  /** All available projects */
  projects: Project[]
  
  /** Project creation/loading state */
  projectState: {
    isCreating: boolean
    isLoading: boolean
    error?: string
  }
  
  /** Current development phase */
  currentPhase: PhaseType
  
  /** Phase execution status */
  phaseStatus: PhaseStatus
  
  /** Phase progress tracking */
  phaseProgress: {
    [K in PhaseType]?: {
      status: PhaseStatus
      progress: number // 0-100
      artifacts: number
      validationResults: ValidationResult[]
      duration?: number
      startedAt?: string
      completedAt?: string
    }
  }
  
  // =====================================
  // AI CONFIGURATION STATE (From Cline)
  // =====================================
  
  /** Current API configuration - adapted from Cline */
  apiConfiguration: ApiConfiguration
  
  /** Phase-specific configurations */
  phaseConfigurations: PhaseConfigurationMap
  
  /** Available AI models by provider - from Cline patterns */
  availableModels: {
    [K in ApiProvider]?: Record<string, ModelInfo>
  }
  
  /** Model loading states */
  modelLoadingStates: {
    [K in ApiProvider]?: boolean
  }
  
  /** Current AI provider selections by phase */
  phaseProviders: Partial<Record<PhaseType, ApiProvider>>
  
  // =====================================
  // UI VIEW STATE (Adapted from Cline)
  // =====================================
  
  /** Current main view */
  currentView: 'dashboard' | 'projects' | 'phase-detail' | 'settings' | 'history'
  
  /** Active sidebar panels */
  sidebars: {
    projectExplorer: boolean
    phaseNavigator: boolean
    contextViewer: boolean
    qualityMetrics: boolean
  }
  
  /** Modal states */
  modals: {
    createProject: boolean
    configureAI: boolean
    phaseConfig: boolean
    templateSelector: boolean
    settingsModal: boolean
  }
  
  /** Settings panel state - adapted from Cline */
  settings: {
    isVisible: boolean
    activeTab: 'api-config' | 'phase-config' | 'quality' | 'ui-preferences' | 'about'
    isExpanded: boolean
  }
  
  // =====================================
  // TASK AND GENERATION STATE
  // =====================================
  
  /** Current generation tasks */
  activeTasks: Array<{
    id: UUID
    type: 'phase-execution' | 'file-generation' | 'validation' | 'testing'
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
    progress: number
    phase: PhaseType
    startedAt: string
    estimatedCompletion?: string
    artifacts: string[]
  }>
  
  /** Task history */
  taskHistory: Array<{
    id: UUID
    type: string
    status: string
    phase: PhaseType
    completedAt: string
    duration: number
    artifactsGenerated: number
    tokensUsed: number
    cost?: number
  }>
  
  // =====================================
  // CONTEXT AND QUALITY STATE
  // =====================================
  
  /** Context management state */
  contextState: {
    totalNodes: number
    loadedNodes: number
    cacheSize: number
    lastUpdated: string
    isBuilding: boolean
    buildProgress?: number
  }
  
  /** Quality metrics dashboard */
  qualityDashboard: {
    overallScore: number
    metrics: QualityMetrics
    trends: Array<{
      timestamp: string
      score: number
      phase: PhaseType
    }>
    issues: Array<{
      id: UUID
      type: 'error' | 'warning' | 'suggestion'
      phase: PhaseType
      file: string
      message: string
      severity: number
    }>
  }
  
  // =====================================
  // USER PREFERENCES (Enhanced from Cline)
  // =====================================
  
  /** UI theme and appearance */
  appearance: {
    theme: 'light' | 'dark' | 'auto'
    density: 'compact' | 'comfortable' | 'spacious'
    accentColor: string
    showAnimations: boolean
    reduceMotion: boolean
  }
  
  /** Dashboard layout preferences */
  dashboard: {
    layout: 'grid' | 'list' | 'kanban'
    showPhaseProgress: boolean
    showQualityMetrics: boolean
    showRecentFiles: boolean
    compactMode: boolean
  }
  
  /** Notification preferences */
  notifications: {
    phaseCompletion: boolean
    validationErrors: boolean
    qualityAlerts: boolean
    taskUpdates: boolean
    position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
  }
  
  // =====================================
  // ADVANCED UI STATE
  // =====================================
  
  /** Welcome and onboarding */
  onboarding: {
    isNewUser: boolean
    currentStep?: number
    completedSteps: number[]
    showWelcome: boolean
    tutorialMode: boolean
  }
  
  /** Error and loading states */
  globalState: {
    isInitializing: boolean
    hasNetworkConnection: boolean
    lastSyncTime?: string
    criticalErrors: string[]
    backgroundTasks: number
  }
}

// =============================================================================
// UI COMPONENT PROPS AND INTERFACES (Adapted from Cline)
// =============================================================================

/**
 * Common button configuration interface
 * Adapted from Cline's ButtonConfig patterns
 */
export interface UIButtonConfig {
  variant: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size: 'sm' | 'md' | 'lg'
  disabled?: boolean
  loading?: boolean
  icon?: string
  tooltip?: string
  onClick?: () => void | Promise<void>
}

/**
 * Phase navigation interface
 * ReadyAI-specific extension for phase management
 */
export interface PhaseNavigationProps {
  currentPhase: PhaseType
  phaseStatus: Record<PhaseType, PhaseStatus>
  phaseProgress: Record<PhaseType, number>
  onPhaseClick: (phase: PhaseType) => void
  allowNavigation: boolean
  showProgress: boolean
  compactMode?: boolean
}

/**
 * Project dashboard props
 * Main dashboard component interface
 */
export interface ProjectDashboardProps {
  project: Project
  currentPhase: PhaseType
  phaseProgress: ReadyAIUIState['phaseProgress']
  qualityMetrics: QualityMetrics
  recentTasks: ReadyAIUIState['taskHistory']
  onPhaseClick: (phase: PhaseType) => void
  onTaskClick: (taskId: UUID) => void
  onSettingsClick: () => void
}

/**
 * AI Configuration panel props
 * Enhanced from Cline's API configuration patterns
 */
export interface AIConfigurationPanelProps {
  configuration: ApiConfiguration
  phaseConfigurations: PhaseConfigurationMap
  availableModels: ReadyAIUIState['availableModels']
  currentPhase?: PhaseType
  isLoading: boolean
  validationResult?: ConfigurationValidationResult
  onConfigurationChange: (config: Partial<ApiConfiguration>) => void
  onPhaseConfigChange: (phase: PhaseType, config: Partial<PhaseConfiguration>) => void
  onValidate: () => void
  onSave: () => Promise<void>
  onReset: () => void
}

/**
 * Task execution interface
 * ReadyAI task management with real-time updates
 */
export interface TaskExecutionProps {
  task: ReadyAIUIState['activeTasks'][0]
  showDetails: boolean
  allowCancel: boolean
  onCancel: () => void
  onViewDetails: () => void
  onRetry: () => void
}

// =============================================================================
// UI CONTEXT PROVIDERS (Adapted from Cline Context Patterns)
// =============================================================================

/**
 * Main UI context interface
 * Adapted from Cline's ExtensionStateContext with ReadyAI extensions
 */
export interface ReadyAIUIContext extends ReadyAIUIState {
  // =====================================
  // STATE ACTIONS
  // =====================================
  
  /** Project management actions */
  projectActions: {
    createProject: (project: Omit<Project, 'id' | 'createdAt' | 'lastModified'>) => Promise<void>
    loadProject: (projectId: UUID) => Promise<void>
    updateProject: (projectId: UUID, updates: Partial<Project>) => Promise<void>
    deleteProject: (projectId: UUID) => Promise<void>
    duplicateProject: (projectId: UUID, newName: string) => Promise<void>
  }
  
  /** Phase management actions */
  phaseActions: {
    startPhase: (phase: PhaseType) => Promise<void>
    completePhase: (phase: PhaseType) => Promise<void>
    retryPhase: (phase: PhaseType) => Promise<void>
    skipPhase: (phase: PhaseType, reason: string) => Promise<void>
    validatePhase: (phase: PhaseType) => Promise<ValidationResult[]>
  }
  
  /** AI configuration actions */
  configActions: {
    updateConfiguration: (config: Partial<ApiConfiguration>) => Promise<void>
    updatePhaseConfiguration: (phase: PhaseType, config: Partial<PhaseConfiguration>) => Promise<void>
    validateConfiguration: () => Promise<ConfigurationValidationResult>
    resetConfiguration: () => Promise<void>
    importConfiguration: (config: ApiConfiguration) => Promise<void>
    exportConfiguration: () => Promise<string>
  }
  
  /** UI state actions */
  uiActions: {
    setCurrentView: (view: ReadyAIUIState['currentView']) => void
    toggleSidebar: (sidebar: keyof ReadyAIUIState['sidebars']) => void
    showModal: (modal: keyof ReadyAIUIState['modals']) => void
    hideModal: (modal: keyof ReadyAIUIState['modals']) => void
    updateAppearance: (appearance: Partial<ReadyAIUIState['appearance']>) => void
    showNotification: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void
  }
  
  /** Task management actions */
  taskActions: {
    startTask: (type: string, phase: PhaseType, config?: any) => Promise<UUID>
    cancelTask: (taskId: UUID) => Promise<void>
    retryTask: (taskId: UUID) => Promise<void>
    getTaskDetails: (taskId: UUID) => Promise<any>
    clearTaskHistory: () => Promise<void>
  }
}

// =============================================================================
// FORM AND INPUT INTERFACES
// =============================================================================

/**
 * Configuration form interfaces
 * Enhanced from Cline's form handling patterns
 */
export interface ConfigurationFormProps {
  initialValues: Partial<ApiConfiguration>
  validationRules: Record<string, any>
  onSubmit: (values: ApiConfiguration) => Promise<void>
  onCancel: () => void
  isLoading: boolean
  errors: Record<string, string>
}

/**
 * Project creation form
 */
export interface ProjectCreationFormProps {
  templates: ConfigurationTemplate[]
  onSubmit: (project: Omit<Project, 'id' | 'createdAt' | 'lastModified'>) => Promise<void>
  onCancel: () => void
  isLoading: boolean
}

/**
 * Phase configuration form
 */
export interface PhaseConfigFormProps {
  phase: PhaseType
  configuration: PhaseConfiguration
  availableModels: Record<string, ModelInfo>
  onSubmit: (config: PhaseConfiguration) => Promise<void>
  onCancel: () => void
  isLoading: boolean
  validationResult?: ValidationResult
}

// =============================================================================
// VISUALIZATION AND CHART INTERFACES
// =============================================================================

/**
 * Phase progress visualization
 */
export interface PhaseProgressChartProps {
  phaseProgress: ReadyAIUIState['phaseProgress']
  currentPhase: PhaseType
  showDetails: boolean
  onPhaseClick?: (phase: PhaseType) => void
  height?: number
  animated?: boolean
}

/**
 * Quality metrics dashboard
 */
export interface QualityMetricsDashboardProps {
  metrics: QualityMetrics
  trends: ReadyAIUIState['qualityDashboard']['trends']
  issues: ReadyAIUIState['qualityDashboard']['issues']
  showTrends: boolean
  onIssueClick: (issueId: UUID) => void
  onDrillDown: (metric: string) => void
}

/**
 * Task timeline visualization
 */
export interface TaskTimelineProps {
  tasks: ReadyAIUIState['taskHistory']
  activeTasks: ReadyAIUIState['activeTasks']
  groupBy: 'phase' | 'date' | 'type'
  showDetails: boolean
  onTaskClick: (taskId: UUID) => void
}

// =============================================================================
// NOTIFICATION AND FEEDBACK INTERFACES
// =============================================================================

/**
 * Notification system interface
 * Enhanced from Cline's user feedback patterns
 */
export interface NotificationProps {
  id: UUID
  type: 'info' | 'success' | 'warning' | 'error' | 'progress'
  title: string
  message: string
  duration?: number // Auto-dismiss time in ms
  actions?: Array<{
    label: string
    action: () => void
    variant?: 'primary' | 'secondary'
  }>
  persistent?: boolean
  showProgress?: boolean
  progressValue?: number
}

/**
 * Toast notification manager
 */
export interface ToastManager {
  show: (notification: Omit<NotificationProps, 'id'>) => UUID
  update: (id: UUID, updates: Partial<NotificationProps>) => void
  dismiss: (id: UUID) => void
  dismissAll: () => void
  getAll: () => NotificationProps[]
}

// =============================================================================
// RESPONSIVE AND ACCESSIBILITY INTERFACES
// =============================================================================

/**
 * Responsive breakpoint configuration
 */
export interface ResponsiveConfig {
  breakpoints: {
    xs: number
    sm: number
    md: number
    lg: number
    xl: number
  }
  currentBreakpoint: string
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
}

/**
 * Accessibility preferences
 */
export interface AccessibilityConfig {
  reduceMotion: boolean
  highContrast: boolean
  largeText: boolean
  keyboardNavigation: boolean
  screenReaderOptimizations: boolean
  focusVisible: boolean
}

// =============================================================================
// ADVANCED UI PATTERNS
// =============================================================================

/**
 * Virtual scrolling configuration
 * For large datasets and performance optimization
 */
export interface VirtualScrollConfig {
  itemHeight: number | ((index: number) => number)
  overscan: number
  scrollingDelay: number
  enableSmoothScrolling: boolean
  onScroll?: (scrollTop: number) => void
  onScrollEnd?: () => void
}

/**
 * Drag and drop interface
 * For phase reordering and file management
 */
export interface DragDropConfig {
  enabled: boolean
  dragHandleSelector?: string
  ghostClass?: string
  chosenClass?: string
  dragClass?: string
  onStart?: (event: any) => void
  onEnd?: (event: any) => void
  onSort?: (event: any) => void
}

/**
 * Keyboard shortcut configuration
 */
export interface KeyboardShortcuts {
  [key: string]: {
    description: string
    action: () => void
    global?: boolean
    preventDefault?: boolean
  }
}

// =============================================================================
// ERROR BOUNDARIES AND FALLBACKS
// =============================================================================

/**
 * Error boundary props
 * Enhanced error handling for UI components
 */
export interface ErrorBoundaryProps {
  fallback?: React.ComponentType<{ error: Error; retry: () => void }>
  onError?: (error: Error, errorInfo: any) => void
  level: 'component' | 'page' | 'app'
  retryable?: boolean
}

/**
 * Loading state configuration
 */
export interface LoadingStateConfig {
  variant: 'spinner' | 'skeleton' | 'pulse' | 'shimmer'
  size: 'sm' | 'md' | 'lg'
  text?: string
  showProgress?: boolean
  progressValue?: number
  overlay?: boolean
  blur?: boolean
}

// =============================================================================
// UTILITY TYPES AND HELPERS
// =============================================================================

/**
 * UI event handler types
 * Standardized event handling across components
 */
export type UIEventHandler<T = any> = (event: T) => void | Promise<void>

/**
 * Component size variants
 */
export type ComponentSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

/**
 * Component color variants
 */
export type ComponentColor = 
  | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'
  | 'neutral' | 'accent'

/**
 * Animation configuration
 */
export interface AnimationConfig {
  duration: number
  easing: string
  delay?: number
  fillMode?: 'none' | 'forwards' | 'backwards' | 'both'
}

/**
 * Theme configuration
 * Enhanced from Cline's theming patterns
 */
export interface ThemeConfig {
  colors: {
    primary: Record<string, string>
    secondary: Record<string, string>
    neutral: Record<string, string>
    semantic: {
      success: Record<string, string>
      warning: Record<string, string>
      error: Record<string, string>
      info: Record<string, string>
    }
  }
  typography: {
    fontFamily: {
      sans: string[]
      serif: string[]
      mono: string[]
    }
    fontSize: Record<string, string>
    fontWeight: Record<string, number>
    lineHeight: Record<string, string>
  }
  spacing: Record<string, string>
  borderRadius: Record<string, string>
  shadows: Record<string, string>
  animation: {
    duration: Record<string, string>
    easing: Record<string, string>
  }
}

// =============================================================================
// TYPE GUARDS AND UTILITIES
// =============================================================================

/**
 * Type guard for UI state validation
 */
export function isValidUIState(state: any): state is ReadyAIUIState {
  return (
    typeof state === 'object' &&
    state !== null &&
    Array.isArray(state.projects) &&
    typeof state.currentPhase === 'string' &&
    typeof state.phaseStatus === 'string' &&
    typeof state.apiConfiguration === 'object'
  )
}

/**
 * Type guard for notification validation
 */
export function isValidNotification(notification: any): notification is NotificationProps {
  return (
    typeof notification === 'object' &&
    notification !== null &&
    typeof notification.id === 'string' &&
    typeof notification.type === 'string' &&
    typeof notification.title === 'string' &&
    typeof notification.message === 'string'
  )
}

/**
 * Helper to create default UI state
 */
export function createDefaultUIState(): ReadyAIUIState {
  return {
    // Core project state
    projects: [],
    projectState: { isCreating: false, isLoading: false },
    currentPhase: PhaseType.Phase0_StrategicCharter,
    phaseStatus: 'pending',
    phaseProgress: {},
    
    // AI configuration state
    apiConfiguration: {} as ApiConfiguration,
    phaseConfigurations: {} as PhaseConfigurationMap,
    availableModels: {},
    modelLoadingStates: {},
    phaseProviders: {},
    
    // UI view state
    currentView: 'dashboard',
    sidebars: {
      projectExplorer: true,
      phaseNavigator: true,
      contextViewer: false,
      qualityMetrics: false,
    },
    modals: {
      createProject: false,
      configureAI: false,
      phaseConfig: false,
      templateSelector: false,
      settingsModal: false,
    },
    settings: {
      isVisible: false,
      activeTab: 'api-config',
      isExpanded: false,
    },
    
    // Task and generation state
    activeTasks: [],
    taskHistory: [],
    
    // Context and quality state
    contextState: {
      totalNodes: 0,
      loadedNodes: 0,
      cacheSize: 0,
      lastUpdated: new Date().toISOString(),
      isBuilding: false,
    },
    qualityDashboard: {
      overallScore: 0,
      metrics: {} as QualityMetrics,
      trends: [],
      issues: [],
    },
    
    // User preferences
    appearance: {
      theme: 'auto',
      density: 'comfortable',
      accentColor: '#0066cc',
      showAnimations: true,
      reduceMotion: false,
    },
    dashboard: {
      layout: 'grid',
      showPhaseProgress: true,
      showQualityMetrics: true,
      showRecentFiles: true,
      compactMode: false,
    },
    notifications: {
      phaseCompletion: true,
      validationErrors: true,
      qualityAlerts: true,
      taskUpdates: false,
      position: 'top-right',
    },
    
    // Advanced UI state
    onboarding: {
      isNewUser: true,
      completedSteps: [],
      showWelcome: true,
      tutorialMode: false,
    },
    globalState: {
      isInitializing: true,
      hasNetworkConnection: true,
      criticalErrors: [],
      backgroundTasks: 0,
    },
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export * from './components'
export * from './hooks'
export * from './utils'

/**
 * UI configuration types module version
 */
export const UI_CONFIG_TYPES_VERSION = '1.0.0'

/**
 * Supported UI framework versions
 */
export const SUPPORTED_UI_VERSIONS = ['1.0.0'] as const
export type UIVersion = typeof SUPPORTED_UI_VERSIONS[number]

/**
 * Default component props
 */
export const DEFAULT_COMPONENT_PROPS = {
  size: 'md' as ComponentSize,
  color: 'primary' as ComponentColor,
  loading: false,
  disabled: false,
} as const
