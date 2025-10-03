// packages/project-management/types/lifecycle.ts

/**
 * Project Lifecycle Types for ReadyAI Personal AI Development Orchestrator
 * 
 * Comprehensive lifecycle management types adapted from Cline's proven TaskState patterns
 * with ReadyAI-specific extensions for 7-phase development methodology, state transitions,
 * validation rules, and progress tracking.
 * 
 * Primary Cline Sources:
 * - src/core/task/TaskState.ts (task state and lifecycle management)
 * - src/core/task/types.ts (task state definitions and transitions)  
 * - src/shared/api.ts (API response patterns and error handling)
 * - src/services/telemetry/ (progress tracking and metrics)
 * 
 * @version 1.0.0 - Phase 2.1 Implementation
 * @author ReadyAI Development Team
 */

import {
  UUID,
  ApiResponse,
  PhaseType,
  PhaseStatus,
  ValidationResult,
  QualityMetrics,
  generateUUID,
  createTimestamp,
  ReadyAIError
} from '../../foundation/types/core'

// =============================================================================
// LIFECYCLE STATE MANAGEMENT (Adapted from Cline TaskState)
// =============================================================================

/**
 * Project lifecycle state tracking all aspects of project progression
 * Adapted from Cline's TaskState with ReadyAI-specific extensions
 */
export interface ProjectLifecycleState {
  /** Unique project identifier */
  projectId: UUID
  
  /** Current active phase in the development methodology */
  currentPhase: PhaseType
  
  /** Current status of the active phase */
  currentPhaseStatus: PhaseStatus
  
  /** Completed phases with their completion metadata */
  completedPhases: Set<PhaseType>
  
  /** Failed phases that require attention */
  failedPhases: Set<PhaseType>
  
  /** Skipped phases with justification */
  skippedPhases: Map<PhaseType, string>
  
  /** Overall project completion percentage (0-100) */
  completionPercentage: number
  
  /** Project health score based on various quality metrics (0-100) */
  healthScore: number
  
  /** Timestamp when project was created */
  createdAt: string
  
  /** Timestamp of last significant state change */
  lastModified: string
  
  /** Total time spent in development (milliseconds) */
  totalDuration: number
  
  /** Current session start time for active development */
  currentSessionStart?: string
  
  /** Flag indicating if project is currently being worked on */
  isActive: boolean
  
  /** Flag indicating if project is abandoned or deprecated */
  isAbandoned: boolean
  
  /** Flag indicating if project is archived */
  isArchived: boolean
  
  /** Current development context and notes */
  contextNotes?: string
  
  /** Critical blockers preventing progress */
  blockers: ProjectBlocker[]
  
  /** Phase-specific metadata and configuration */
  phaseMetadata: Map<PhaseType, Record<string, any>>
}

/**
 * Project blocker representing issues preventing progress
 * Adapted from Cline's error handling with ReadyAI lifecycle context
 */
export interface ProjectBlocker {
  /** Unique blocker identifier */
  id: UUID
  
  /** Phase where blocker was encountered */
  phase: PhaseType
  
  /** Severity level of the blocker */
  severity: 'low' | 'medium' | 'high' | 'critical'
  
  /** Type of blocker */
  type: 'dependency' | 'validation' | 'resource' | 'technical' | 'user_input' | 'external'
  
  /** Human-readable description of the blocker */
  description: string
  
  /** Optional detailed error information */
  errorDetails?: {
    code: string
    message: string
    stack?: string
    context?: Record<string, any>
  }
  
  /** Timestamp when blocker was identified */
  identifiedAt: string
  
  /** Estimated impact on project timeline (in hours) */
  estimatedImpact?: number
  
  /** Suggested resolution steps */
  resolutionSteps?: string[]
  
  /** Flag indicating if blocker is currently being worked on */
  isBeingResolved: boolean
  
  /** Timestamp when resolution began */
  resolutionStarted?: string
  
  /** Timestamp when blocker was resolved */
  resolvedAt?: string
  
  /** Resolution notes and actions taken */
  resolutionNotes?: string
}

// =============================================================================
// STATE TRANSITION MANAGEMENT (Adapted from Cline TaskState transitions)
// =============================================================================

/**
 * Valid state transitions for project lifecycle phases
 * Based on Cline's proven state machine patterns with ReadyAI methodology
 */
export interface StateTransition {
  /** Source phase for the transition */
  from: PhaseType
  
  /** Target phase for the transition */
  to: PhaseType
  
  /** Conditions that must be met for valid transition */
  conditions: TransitionCondition[]
  
  /** Actions to execute during transition */
  actions: TransitionAction[]
  
  /** Whether this transition can be rolled back */
  isReversible: boolean
  
  /** Estimated time for transition completion (milliseconds) */
  estimatedDuration?: number
}

/**
 * Condition that must be satisfied for state transition
 */
export interface TransitionCondition {
  /** Condition type */
  type: 'validation' | 'dependency' | 'manual_approval' | 'quality_gate' | 'resource_availability'
  
  /** Condition description */
  description: string
  
  /** Function to evaluate the condition */
  predicate: (state: ProjectLifecycleState) => Promise<boolean>
  
  /** Error message if condition fails */
  failureMessage: string
  
  /** Whether condition failure should block transition entirely */
  isBlocking: boolean
}

/**
 * Action to execute during state transition
 */
export interface TransitionAction {
  /** Action type */
  type: 'validation' | 'cleanup' | 'initialization' | 'notification' | 'backup' | 'update_metadata'
  
  /** Action description */
  description: string
  
  /** Function to execute the action */
  execute: (state: ProjectLifecycleState, context?: Record<string, any>) => Promise<void>
  
  /** Whether action failure should rollback transition */
  isRequired: boolean
  
  /** Retry configuration for failed actions */
  retryConfig?: {
    maxAttempts: number
    delayMs: number
    backoffMultiplier: number
  }
}

// =============================================================================
// PHASE PROGRESS AND METRICS (Adapted from Cline progress tracking)
// =============================================================================

/**
 * Detailed progress tracking for individual phase
 * Enhanced with ReadyAI-specific development methodology metrics
 */
export interface PhaseProgress {
  /** Phase identifier */
  phaseId: PhaseType
  
  /** Current phase status */
  status: PhaseStatus
  
  /** Phase start timestamp */
  startedAt?: string
  
  /** Phase completion timestamp */
  completedAt?: string
  
  /** Total phase duration (milliseconds) */
  duration?: number
  
  /** Current completion percentage within phase (0-100) */
  completionPercentage: number
  
  /** Phase-specific milestones and their completion status */
  milestones: PhaseMilestone[]
  
  /** Generated artifacts during this phase */
  artifacts: PhaseArtifact[]
  
  /** Validation results for this phase */
  validationResults: ValidationResult[]
  
  /** Quality metrics specific to this phase */
  qualityMetrics: QualityMetrics
  
  /** AI provider used for this phase (if applicable) */
  aiProvider?: string
  
  /** Token usage and cost tracking for AI operations */
  tokenUsage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    estimatedCost: number
    cacheHits: number
  }
  
  /** Phase-specific configuration overrides */
  configuration?: Record<string, any>
  
  /** Developer notes and comments for this phase */
  notes: PhaseNote[]
  
  /** Time tracking for different activities within phase */
  timeTracking: PhaseTimeTracking
  
  /** Dependencies this phase has on other phases or external resources */
  dependencies: PhaseDependency[]
  
  /** Issues and challenges encountered during this phase */
  issues: PhaseIssue[]
}

/**
 * Milestone within a phase representing significant checkpoints
 */
export interface PhaseMilestone {
  /** Unique milestone identifier */
  id: UUID
  
  /** Milestone name */
  name: string
  
  /** Milestone description */
  description?: string
  
  /** Target completion date */
  targetDate?: string
  
  /** Actual completion date */
  completedAt?: string
  
  /** Milestone status */
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'skipped'
  
  /** Dependencies on other milestones */
  dependencies: UUID[]
  
  /** Success criteria for milestone completion */
  successCriteria: string[]
  
  /** Completion percentage (0-100) */
  completionPercentage: number
  
  /** Deliverables associated with this milestone */
  deliverables: string[]
  
  /** Validation rules for milestone completion */
  validationRules: MilestoneValidationRule[]
}

/**
 * Enhanced artifact generated during project phases
 * Adapted from Cline's artifact tracking with ReadyAI extensions
 */
export interface PhaseArtifact {
  /** Unique artifact identifier */
  id: UUID
  
  /** Associated phase */
  phaseId: PhaseType
  
  /** Associated milestone (if applicable) */
  milestoneId?: UUID
  
  /** Artifact name */
  name: string
  
  /** Artifact type/category */
  type: 'code' | 'documentation' | 'config' | 'schema' | 'test' | 'asset' | 'report'
  
  /** File path relative to project root */
  path: string
  
  /** Artifact content */
  content: string
  
  /** Content MIME type */
  mimeType: string
  
  /** File size in bytes */
  size: number
  
  /** Content hash for change detection */
  contentHash: string
  
  /** Generation timestamp */
  generatedAt: string
  
  /** Last modification timestamp */
  modifiedAt?: string
  
  /** Version number */
  version: number
  
  /** Generation metadata */
  metadata: {
    /** How the artifact was generated */
    generator: 'ai' | 'template' | 'user' | 'import' | 'system'
    
    /** Confidence score for AI-generated content (0-100) */
    confidence?: number
    
    /** Review status */
    reviewStatus: 'pending' | 'approved' | 'rejected' | 'needs_revision'
    
    /** AI model used for generation */
    aiModel?: string
    
    /** Generation prompt or template used */
    generationPrompt?: string
    
    /** Quality score (0-100) */
    qualityScore?: number
    
    /** Tags for categorization and search */
    tags: string[]
  }
  
  /** Version history */
  versions?: {
    version: number
    timestamp: string
    changes: string
    author: string
  }[]
  
  /** Dependencies on other artifacts */
  dependencies: UUID[]
  
  /** Validation results for this artifact */
  validationResults: ValidationResult[]
}

/**
 * Time tracking for activities within a phase
 */
export interface PhaseTimeTracking {
  /** Total time spent in phase (milliseconds) */
  totalTime: number
  
  /** Time breakdown by activity type */
  activities: {
    planning: number
    implementation: number
    testing: number
    review: number
    debugging: number
    documentation: number
    research: number
  }
  
  /** Detailed time entries */
  entries: PhaseTimeEntry[]
  
  /** Productivity metrics */
  productivity: {
    /** Average time per milestone */
    avgTimePerMilestone: number
    
    /** Average time per artifact */
    avgTimePerArtifact: number
    
    /** Efficiency score (0-100) */
    efficiencyScore: number
  }
}

/**
 * Individual time tracking entry
 */
export interface PhaseTimeEntry {
  /** Entry identifier */
  id: UUID
  
  /** Activity type */
  activity: 'planning' | 'implementation' | 'testing' | 'review' | 'debugging' | 'documentation' | 'research'
  
  /** Start timestamp */
  startTime: string
  
  /** End timestamp */
  endTime?: string
  
  /** Duration (milliseconds) */
  duration: number
  
  /** Description of work performed */
  description: string
  
  /** Associated milestone (if applicable) */
  milestoneId?: UUID
  
  /** Associated artifact (if applicable) */
  artifactId?: UUID
}

/**
 * Phase dependency tracking
 */
export interface PhaseDependency {
  /** Dependency identifier */
  id: UUID
  
  /** Dependency type */
  type: 'phase' | 'external_service' | 'resource' | 'approval' | 'data'
  
  /** Dependency name */
  name: string
  
  /** Dependency description */
  description: string
  
  /** Required phase (for phase dependencies) */
  requiredPhase?: PhaseType
  
  /** External resource identifier */
  externalResourceId?: string
  
  /** Dependency status */
  status: 'pending' | 'available' | 'blocked' | 'resolved'
  
  /** Whether dependency is critical for phase progression */
  isCritical: boolean
  
  /** Estimated resolution time if blocked */
  estimatedResolutionTime?: number
}

/**
 * Issue tracking within phases
 */
export interface PhaseIssue {
  /** Issue identifier */
  id: UUID
  
  /** Issue severity */
  severity: 'low' | 'medium' | 'high' | 'critical'
  
  /** Issue type */
  type: 'bug' | 'performance' | 'design' | 'requirement' | 'technical_debt' | 'compatibility'
  
  /** Issue title */
  title: string
  
  /** Detailed issue description */
  description: string
  
  /** When issue was identified */
  identifiedAt: string
  
  /** Issue status */
  status: 'open' | 'in_progress' | 'resolved' | 'closed' | 'deferred'
  
  /** Resolution timestamp */
  resolvedAt?: string
  
  /** Resolution description */
  resolution?: string
  
  /** Associated milestone */
  milestoneId?: UUID
  
  /** Associated artifact */
  artifactId?: UUID
  
  /** Estimated effort to resolve (hours) */
  estimatedEffort?: number
  
  /** Actual effort spent (hours) */
  actualEffort?: number
}

/**
 * Phase-specific notes and comments
 */
export interface PhaseNote {
  /** Note identifier */
  id: UUID
  
  /** Note type */
  type: 'general' | 'decision' | 'issue' | 'improvement' | 'reminder'
  
  /** Note title */
  title: string
  
  /** Note content */
  content: string
  
  /** Creation timestamp */
  createdAt: string
  
  /** Last modification timestamp */
  modifiedAt?: string
  
  /** Note priority */
  priority: 'low' | 'medium' | 'high'
  
  /** Whether note is pinned */
  isPinned: boolean
  
  /** Tags for categorization */
  tags: string[]
  
  /** Associated milestone */
  milestoneId?: UUID
  
  /** Associated artifact */
  artifactId?: UUID
}

/**
 * Milestone validation rule
 */
export interface MilestoneValidationRule {
  /** Rule identifier */
  id: UUID
  
  /** Rule name */
  name: string
  
  /** Rule description */
  description: string
  
  /** Rule type */
  type: 'artifact_exists' | 'quality_threshold' | 'test_coverage' | 'performance' | 'custom'
  
  /** Validation function */
  validator: (milestone: PhaseMilestone, context: PhaseProgress) => Promise<ValidationResult>
  
  /** Whether rule is required for completion */
  isRequired: boolean
  
  /** Rule configuration */
  configuration: Record<string, any>
}

// =============================================================================
// LIFECYCLE VALIDATION AND QUALITY GATES
// =============================================================================

/**
 * Comprehensive lifecycle validation configuration
 * Adapted from Cline's validation patterns with ReadyAI quality gates
 */
export interface LifecycleValidation {
  /** Project identifier */
  projectId: UUID
  
  /** Validation configuration per phase */
  phaseValidations: Map<PhaseType, PhaseValidationConfig>
  
  /** Global validation rules that apply to all phases */
  globalRules: ValidationRule[]
  
  /** Quality gates that must be passed for phase progression */
  qualityGates: QualityGate[]
  
  /** Validation mode (strict, standard, lenient) */
  mode: 'strict' | 'standard' | 'lenient'
  
  /** Whether to auto-fix certain validation issues */
  autoFix: boolean
  
  /** Maximum number of validation retries */
  maxRetries: number
  
  /** Validation timeout (milliseconds) */
  timeout: number
}

/**
 * Phase-specific validation configuration
 */
export interface PhaseValidationConfig {
  /** Phase identifier */
  phaseId: PhaseType
  
  /** Validation rules specific to this phase */
  rules: ValidationRule[]
  
  /** Required quality score threshold (0-100) */
  qualityThreshold: number
  
  /** Whether validation can be skipped with approval */
  allowSkip: boolean
  
  /** Custom validation scripts or functions */
  customValidators: CustomValidator[]
  
  /** Validation dependencies */
  dependencies: string[]
}

/**
 * Individual validation rule
 */
export interface ValidationRule {
  /** Rule identifier */
  id: UUID
  
  /** Rule name */
  name: string
  
  /** Rule description */
  description: string
  
  /** Rule category */
  category: 'structure' | 'content' | 'quality' | 'dependencies' | 'security' | 'performance'
  
  /** Rule severity */
  severity: 'error' | 'warning' | 'info'
  
  /** Validation function */
  validator: (context: ValidationContext) => Promise<ValidationResult>
  
  /** Whether rule is enabled */
  isEnabled: boolean
  
  /** Rule configuration */
  configuration: Record<string, any>
  
  /** Auto-fix function (if available) */
  autoFix?: (context: ValidationContext) => Promise<void>
}

/**
 * Quality gate for phase progression
 */
export interface QualityGate {
  /** Gate identifier */
  id: UUID
  
  /** Gate name */
  name: string
  
  /** Gate description */
  description: string
  
  /** Phase this gate applies to */
  phaseId: PhaseType
  
  /** Gate type */
  type: 'automated' | 'manual' | 'hybrid'
  
  /** Required conditions for gate passage */
  conditions: QualityGateCondition[]
  
  /** Gate status */
  status: 'pending' | 'passed' | 'failed' | 'skipped'
  
  /** Gate evaluation timestamp */
  evaluatedAt?: string
  
  /** Gate passage timestamp */
  passedAt?: string
  
  /** Failure reasons (if failed) */
  failureReasons?: string[]
  
  /** Whether gate can be overridden */
  allowOverride: boolean
  
  /** Override justification (if overridden) */
  overrideJustification?: string
}

/**
 * Quality gate condition
 */
export interface QualityGateCondition {
  /** Condition identifier */
  id: UUID
  
  /** Condition name */
  name: string
  
  /** Condition type */
  type: 'metric_threshold' | 'validation_passed' | 'milestone_completed' | 'manual_approval'
  
  /** Required threshold or value */
  threshold: number | string | boolean
  
  /** Comparison operator */
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'matches'
  
  /** Evaluation function */
  evaluate: (context: ValidationContext) => Promise<boolean>
  
  /** Whether condition is required or optional */
  isRequired: boolean
  
  /** Weight for composite scoring */
  weight: number
}

/**
 * Custom validator for specialized validation logic
 */
export interface CustomValidator {
  /** Validator identifier */
  id: UUID
  
  /** Validator name */
  name: string
  
  /** Validator description */
  description: string
  
  /** Validator implementation */
  validate: (context: ValidationContext) => Promise<ValidationResult>
  
  /** Validator configuration */
  configuration: Record<string, any>
  
  /** Whether validator is asynchronous */
  isAsync: boolean
  
  /** Validator timeout (milliseconds) */
  timeout: number
}

/**
 * Validation context provided to validators
 */
export interface ValidationContext {
  /** Project identifier */
  projectId: UUID
  
  /** Current lifecycle state */
  lifecycleState: ProjectLifecycleState
  
  /** Phase being validated */
  currentPhase: PhaseType
  
  /** Phase progress data */
  phaseProgress: PhaseProgress
  
  /** Project artifacts */
  artifacts: PhaseArtifact[]
  
  /** Project configuration */
  configuration: Record<string, any>
  
  /** Additional context data */
  metadata: Record<string, any>
  
  /** File system access for validation */
  fileSystem: {
    readFile: (path: string) => Promise<string>
    writeFile: (path: string, content: string) => Promise<void>
    exists: (path: string) => Promise<boolean>
    list: (path: string) => Promise<string[]>
  }
  
  /** Logger for validation messages */
  logger: {
    info: (message: string) => void
    warn: (message: string) => void
    error: (message: string) => void
    debug: (message: string) => void
  }
}

// =============================================================================
// LIFECYCLE EVENT SYSTEM (Adapted from Cline EventEmitter patterns)
// =============================================================================

/**
 * Lifecycle event types for project state changes
 */
export type LifecycleEventType =
  | 'phase_started'
  | 'phase_completed'
  | 'phase_failed'
  | 'phase_skipped'
  | 'milestone_completed'
  | 'artifact_generated'
  | 'validation_passed'
  | 'validation_failed'
  | 'quality_gate_passed'
  | 'quality_gate_failed'
  | 'blocker_identified'
  | 'blocker_resolved'
  | 'state_changed'
  | 'progress_updated'

/**
 * Lifecycle event data structure
 */
export interface LifecycleEvent {
  /** Event identifier */
  id: UUID
  
  /** Event type */
  type: LifecycleEventType
  
  /** Project identifier */
  projectId: UUID
  
  /** Event timestamp */
  timestamp: string
  
  /** Phase associated with event */
  phaseId?: PhaseType
  
  /** Milestone associated with event */
  milestoneId?: UUID
  
  /** Artifact associated with event */
  artifactId?: UUID
  
  /** Event data payload */
  data: Record<string, any>
  
  /** Event metadata */
  metadata: {
    source: string
    version: string
    correlationId?: string
  }
  
  /** Event severity */
  severity: 'info' | 'warning' | 'error' | 'critical'
  
  /** Whether event should trigger notifications */
  shouldNotify: boolean
}

/**
 * Lifecycle event handler interface
 */
export interface LifecycleEventHandler {
  /** Handler identifier */
  id: UUID
  
  /** Handler name */
  name: string
  
  /** Event types this handler processes */
  eventTypes: LifecycleEventType[]
  
  /** Handler function */
  handle: (event: LifecycleEvent) => Promise<void>
  
  /** Whether handler is enabled */
  isEnabled: boolean
  
  /** Handler priority (higher numbers execute first) */
  priority: number
  
  /** Handler configuration */
  configuration: Record<string, any>
}

// =============================================================================
// UTILITY TYPES AND FUNCTIONS
// =============================================================================

/**
 * Type guard to check if a phase is completed
 */
export function isPhaseCompleted(state: ProjectLifecycleState, phase: PhaseType): boolean {
  return state.completedPhases.has(phase)
}

/**
 * Type guard to check if a phase is in progress
 */
export function isPhaseInProgress(state: ProjectLifecycleState, phase: PhaseType): boolean {
  return state.currentPhase === phase && state.currentPhaseStatus === 'in_progress'
}

/**
 * Type guard to check if a phase is failed
 */
export function isPhaseFailed(state: ProjectLifecycleState, phase: PhaseType): boolean {
  return state.failedPhases.has(phase)
}

/**
 * Type guard to check if a phase is skipped
 */
export function isPhaseSkipped(state: ProjectLifecycleState, phase: PhaseType): boolean {
  return state.skippedPhases.has(phase)
}

/**
 * Calculate overall project health score
 */
export function calculateHealthScore(state: ProjectLifecycleState, phaseProgresses: PhaseProgress[]): number {
  if (phaseProgresses.length === 0) return 100
  
  const totalScore = phaseProgresses.reduce((sum, progress) => {
    return sum + progress.qualityMetrics.architecturalConsistency
  }, 0)
  
  return Math.round(totalScore / phaseProgresses.length)
}

/**
 * Get next valid phases for transition
 */
export function getNextValidPhases(
  currentPhase: PhaseType,
  state: ProjectLifecycleState,
  transitions: StateTransition[]
): PhaseType[] {
  return transitions
    .filter(t => t.from === currentPhase)
    .map(t => t.to)
    .filter(phase => !state.completedPhases.has(phase))
}

/**
 * Create initial project lifecycle state
 */
export function createInitialLifecycleState(projectId: UUID): ProjectLifecycleState {
  return {
    projectId,
    currentPhase: 'Phase0_StrategicCharter',
    currentPhaseStatus: 'pending',
    completedPhases: new Set(),
    failedPhases: new Set(),
    skippedPhases: new Map(),
    completionPercentage: 0,
    healthScore: 100,
    createdAt: createTimestamp(),
    lastModified: createTimestamp(),
    totalDuration: 0,
    isActive: false,
    isAbandoned: false,
    isArchived: false,
    blockers: [],
    phaseMetadata: new Map()
  }
}

/**
 * Create new phase progress instance
 */
export function createPhaseProgress(phaseId: PhaseType): PhaseProgress {
  return {
    phaseId,
    status: 'pending',
    completionPercentage: 0,
    milestones: [],
    artifacts: [],
    validationResults: [],
    qualityMetrics: {
      projectId: generateUUID(),
      architecturalConsistency: 100,
      testCoverage: 0,
      dependencyHealth: 100,
      contextEfficiency: 100,
      lastCalculated: createTimestamp()
    },
    notes: [],
    timeTracking: {
      totalTime: 0,
      activities: {
        planning: 0,
        implementation: 0,
        testing: 0,
        review: 0,
        debugging: 0,
        documentation: 0,
        research: 0
      },
      entries: [],
      productivity: {
        avgTimePerMilestone: 0,
        avgTimePerArtifact: 0,
        efficiencyScore: 100
      }
    },
    dependencies: [],
    issues: []
  }
}

/**
 * Create new lifecycle event
 */
export function createLifecycleEvent(
  type: LifecycleEventType,
  projectId: UUID,
  data: Record<string, any> = {},
  options: {
    phaseId?: PhaseType
    milestoneId?: UUID
    artifactId?: UUID
    severity?: 'info' | 'warning' | 'error' | 'critical'
    shouldNotify?: boolean
  } = {}
): LifecycleEvent {
  return {
    id: generateUUID(),
    type,
    projectId,
    timestamp: createTimestamp(),
    phaseId: options.phaseId,
    milestoneId: options.milestoneId,
    artifactId: options.artifactId,
    data,
    metadata: {
      source: 'ReadyAI',
      version: '1.0.0',
      correlationId: generateUUID()
    },
    severity: options.severity ?? 'info',
    shouldNotify: options.shouldNotify ?? false
  }
}

// =============================================================================
// DEFAULT CONFIGURATIONS AND CONSTANTS
// =============================================================================

/**
 * Default ReadyAI phase order based on 7-phase methodology
 */
export const DEFAULT_PHASE_ORDER: PhaseType[] = [
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

/**
 * Default phase completion thresholds
 */
export const DEFAULT_PHASE_THRESHOLDS: Record<PhaseType, number> = {
  'Phase0_StrategicCharter': 90,
  'Phase1_ArchitecturalBlueprint': 95,
  'Phase20_CoreContracts': 100,
  'Phase21_ModuleSpec': 95,
  'Phase23_ModuleSpecSubsequent': 95,
  'Phase30_ProjectScaffolding': 90,
  'Phase301_MasterPlan': 100,
  'Phase31_FileGeneration': 85,
  'Phase4_ValidationCorrection': 95,
  'Phase5_TestGeneration': 90,
  'Phase6_Documentation': 85,
  'Phase7_Iteration': 80
}

/**
 * Default validation mode for new projects
 */
export const DEFAULT_VALIDATION_MODE = 'standard'

/**
 * Default quality score threshold for phase completion
 */
export const DEFAULT_QUALITY_THRESHOLD = 85

/**
 * Default health score calculation weights
 */
export const DEFAULT_HEALTH_WEIGHTS = {
  qualityMetrics: 0.4,
  completionRate: 0.3,
  blockerSeverity: 0.2,
  timeToCompletion: 0.1
} as const

// Re-export commonly used types for convenience
export type {
  ProjectLifecycleState as LifecycleState,
  PhaseProgress as Progress,
  ProjectBlocker as Blocker,
  LifecycleEvent as Event
}
