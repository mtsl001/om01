// packages/project-management/services/ProjectEventService.ts

/**
 * Project Event Service for ReadyAI Personal AI Development Orchestrator
 * 
 * Comprehensive event management system for project lifecycle events, notifications,
 * and audit trails. Adapted from Cline's EventEmitter patterns with ReadyAI-specific
 * extensions for multi-phase development methodology and collaboration workflows.
 * 
 * Primary Cline Sources:
 * - src/core/events/EventEmitter.ts (event emission and subscription patterns)
 * - src/core/task/events.ts (task lifecycle event patterns)
 * - src/shared/telemetry.ts (event tracking and analytics)
 * 
 * @version 1.0.0 - Phase 2.1 Implementation
 * @author ReadyAI Development Team
 */

import {
  UUID,
  ApiResponse,
  PhaseType,
  PhaseStatus,
  ProjectConfig,
  ValidationResult,
  generateUUID,
  createTimestamp,
  ReadyAIError
} from '../../foundation/types/core'

import {
  Project,
  ProjectPhase,
  ProjectMilestone,
  PhaseArtifact,
  ProjectCollaborator,
  ProjectStateChange,
  ProjectSnapshot,
  ProjectCreationMethod,
  ProjectPriority,
  ProjectComplexity,
  ProjectArchivalStatus,
  ProjectHealth
} from '../types/project'

import { Logger } from '../../logging/services/Logger'
import { ErrorService } from '../../logging/services/ErrorService'
import { TelemetryService } from '../../logging/services/TelemetryService'

// =============================================================================
// EVENT TYPE DEFINITIONS
// =============================================================================

/**
 * Base interface for all project events
 */
export interface ProjectEventBase {
  /** Unique event identifier */
  id: UUID
  /** Event timestamp */
  timestamp: string
  /** Project identifier */
  projectId: UUID
  /** User who triggered the event */
  userId?: UUID
  /** Event metadata */
  metadata?: Record<string, any>
}

/**
 * Project lifecycle events
 */
export interface ProjectLifecycleEvent extends ProjectEventBase {
  /** Event type */
  type: 'project_created' | 'project_updated' | 'project_deleted' | 'project_archived' | 'project_restored'
  /** Project data */
  project: Project
  /** Previous project state for updates */
  previousProject?: Project
  /** Changes made (for updates) */
  changes?: string[]
}

/**
 * Project phase events
 */
export interface ProjectPhaseEvent extends ProjectEventBase {
  /** Event type */
  type: 'phase_started' | 'phase_completed' | 'phase_failed' | 'phase_skipped' | 'phase_reverted'
  /** Phase identifier */
  phaseId: PhaseType
  /** Phase data */
  phase: ProjectPhase
  /** Previous phase status */
  previousStatus?: PhaseStatus
  /** Phase duration in milliseconds */
  duration?: number
  /** Error details for failed phases */
  error?: string
}

/**
 * Project milestone events
 */
export interface ProjectMilestoneEvent extends ProjectEventBase {
  /** Event type */
  type: 'milestone_created' | 'milestone_updated' | 'milestone_completed' | 'milestone_failed' | 'milestone_deleted'
  /** Milestone identifier */
  milestoneId: UUID
  /** Milestone data */
  milestone: ProjectMilestone
  /** Previous milestone data for updates */
  previousMilestone?: ProjectMilestone
}

/**
 * Project artifact events
 */
export interface ProjectArtifactEvent extends ProjectEventBase {
  /** Event type */
  type: 'artifact_generated' | 'artifact_updated' | 'artifact_deleted' | 'artifact_approved' | 'artifact_rejected'
  /** Artifact identifier */
  artifactId: UUID
  /** Artifact data */
  artifact: PhaseArtifact
  /** Previous artifact data for updates */
  previousArtifact?: PhaseArtifact
  /** Approval/rejection reason */
  reason?: string
}

/**
 * Project collaboration events
 */
export interface ProjectCollaborationEvent extends ProjectEventBase {
  /** Event type */
  type: 'collaborator_invited' | 'collaborator_joined' | 'collaborator_left' | 'collaborator_role_changed' | 'collaborator_removed'
  /** Collaborator identifier */
  collaboratorId: UUID
  /** Collaborator data */
  collaborator: ProjectCollaborator
  /** Previous collaborator data for role changes */
  previousCollaborator?: ProjectCollaborator
  /** Invitation details */
  invitationDetails?: {
    invitedBy: UUID
    expiresAt: string
    message?: string
  }
}

/**
 * Project configuration events
 */
export interface ProjectConfigurationEvent extends ProjectEventBase {
  /** Event type */
  type: 'config_updated' | 'tech_stack_changed' | 'preferences_updated' | 'integration_added' | 'integration_removed'
  /** Configuration section affected */
  configSection: string
  /** New configuration values */
  newConfig: Record<string, any>
  /** Previous configuration values */
  previousConfig: Record<string, any>
  /** Configuration change impact */
  impact?: 'low' | 'medium' | 'high' | 'critical'
}

/**
 * Project error and validation events
 */
export interface ProjectErrorEvent extends ProjectEventBase {
  /** Event type */
  type: 'validation_failed' | 'error_occurred' | 'warning_issued' | 'recovery_attempted' | 'recovery_successful'
  /** Error/validation details */
  error: {
    code: string
    message: string
    details?: any
    stack?: string
    severity: 'low' | 'medium' | 'high' | 'critical'
  }
  /** Validation results if applicable */
  validationResults?: ValidationResult[]
  /** Recovery action taken */
  recoveryAction?: string
}

/**
 * Project analytics events
 */
export interface ProjectAnalyticsEvent extends ProjectEventBase {
  /** Event type */
  type: 'metrics_updated' | 'performance_measured' | 'usage_tracked' | 'report_generated' | 'alert_triggered'
  /** Analytics data */
  analytics: {
    metric: string
    value: any
    previousValue?: any
    trend?: 'up' | 'down' | 'stable'
    threshold?: any
  }
  /** Alert details for triggered alerts */
  alert?: {
    severity: 'info' | 'warning' | 'error' | 'critical'
    message: string
    threshold: any
    actualValue: any
  }
}

/**
 * Union type for all project events
 */
export type ProjectEvent = 
  | ProjectLifecycleEvent
  | ProjectPhaseEvent
  | ProjectMilestoneEvent
  | ProjectArtifactEvent
  | ProjectCollaborationEvent
  | ProjectConfigurationEvent
  | ProjectErrorEvent
  | ProjectAnalyticsEvent

/**
 * Event listener callback function type
 */
export type ProjectEventListener<T extends ProjectEvent = ProjectEvent> = (event: T) => void | Promise<void>

/**
 * Event subscription interface
 */
export interface ProjectEventSubscription {
  /** Unique subscription identifier */
  id: UUID
  /** Event type pattern to match */
  eventType: string | RegExp
  /** Listener callback function */
  listener: ProjectEventListener
  /** Subscription options */
  options: {
    once?: boolean
    priority?: number
    filter?: (event: ProjectEvent) => boolean
  }
  /** Subscription timestamp */
  subscribedAt: string
  /** Subscriber information */
  subscriber?: {
    id: UUID
    name: string
    type: 'service' | 'user' | 'system'
  }
}

/**
 * Event notification configuration
 */
export interface EventNotificationConfig {
  /** Notification channels */
  channels: {
    inApp: boolean
    email: boolean
    webhook?: {
      url: string
      headers?: Record<string, string>
      timeout?: number
    }
  }
  /** Event filters */
  filters: {
    eventTypes?: string[]
    severity?: ('low' | 'medium' | 'high' | 'critical')[]
    projects?: UUID[]
    users?: UUID[]
  }
  /** Notification template */
  template?: {
    title: string
    message: string
    variables: Record<string, string>
  }
}

// =============================================================================
// PROJECT EVENT SERVICE IMPLEMENTATION
// =============================================================================

/**
 * Project Event Service - Comprehensive event management for ReadyAI projects
 * 
 * Provides event emission, subscription, and notification capabilities for project
 * lifecycle events, state changes, and system events. Adapted from Cline's proven
 * EventEmitter patterns with ReadyAI-specific extensions.
 */
export class ProjectEventService {
  private readonly logger: Logger
  private readonly errorService: ErrorService
  private readonly telemetryService: TelemetryService
  
  /** Event subscriptions by event type */
  private readonly subscriptions = new Map<string, ProjectEventSubscription[]>()
  
  /** Global event listeners */
  private readonly globalListeners: ProjectEventSubscription[] = []
  
  /** Event history for audit trails */
  private readonly eventHistory = new Map<UUID, ProjectEvent[]>()
  
  /** Event processing queue for async handling */
  private readonly eventQueue: Array<{ event: ProjectEvent; retryCount: number }> = []
  
  /** Event processing state */
  private isProcessingQueue = false
  
  /** Notification configurations */
  private readonly notificationConfigs = new Map<UUID, EventNotificationConfig>()
  
  /** Event statistics */
  private readonly eventStats = {
    totalEmitted: 0,
    totalProcessed: 0,
    totalFailed: 0,
    byType: new Map<string, number>(),
    byProject: new Map<UUID, number>()
  }

  constructor(
    logger: Logger,
    errorService: ErrorService,
    telemetryService: TelemetryService
  ) {
    this.logger = logger
    this.errorService = errorService
    this.telemetryService = telemetryService
    
    // Start event processing
    this.startEventProcessing()
    
    this.logger.info('ProjectEventService initialized', {
      service: 'ProjectEventService',
      timestamp: createTimestamp()
    })
  }

  // =============================================================================
  // EVENT EMISSION METHODS
  // =============================================================================

  /**
   * Emit a project event to all registered listeners
   */
  async emit<T extends ProjectEvent>(event: T): Promise<void> {
    try {
      // Validate event structure
      this.validateEvent(event)
      
      // Track statistics
      this.updateEventStats(event)
      
      // Add to event history
      this.addToEventHistory(event)
      
      // Log the event
      this.logger.info('Project event emitted', {
        eventId: event.id,
        eventType: event.type,
        projectId: event.projectId,
        timestamp: event.timestamp
      })
      
      // Add to processing queue
      this.eventQueue.push({ event, retryCount: 0 })
      
      // Trigger immediate processing if not already running
      if (!this.isProcessingQueue) {
        await this.processEventQueue()
      }
      
      // Track telemetry
      this.telemetryService.trackEvent('project_event_emitted', {
        eventType: event.type,
        projectId: event.projectId,
        hasMetadata: !!event.metadata
      })
      
    } catch (error) {
      await this.handleEventError(error, event)
      throw error
    }
  }

  /**
   * Emit a project lifecycle event
   */
  async emitProjectLifecycleEvent(
    type: ProjectLifecycleEvent['type'],
    project: Project,
    userId?: UUID,
    previousProject?: Project,
    changes?: string[]
  ): Promise<void> {
    const event: ProjectLifecycleEvent = {
      id: generateUUID(),
      timestamp: createTimestamp(),
      projectId: project.id,
      userId,
      type,
      project,
      previousProject,
      changes,
      metadata: {
        projectName: project.name,
        currentPhase: project.currentPhase,
        status: project.status,
        complexity: project.complexity
      }
    }
    
    await this.emit(event)
  }

  /**
   * Emit a project phase event
   */
  async emitProjectPhaseEvent(
    type: ProjectPhaseEvent['type'],
    projectId: UUID,
    phase: ProjectPhase,
    userId?: UUID,
    previousStatus?: PhaseStatus,
    duration?: number,
    error?: string
  ): Promise<void> {
    const event: ProjectPhaseEvent = {
      id: generateUUID(),
      timestamp: createTimestamp(),
      projectId,
      userId,
      type,
      phaseId: phase.id,
      phase,
      previousStatus,
      duration,
      error,
      metadata: {
        phaseId: phase.id,
        phaseStatus: phase.status,
        milestonesCount: phase.milestones.length,
        artifactsCount: phase.artifacts.length
      }
    }
    
    await this.emit(event)
  }

  /**
   * Emit a project milestone event
   */
  async emitProjectMilestoneEvent(
    type: ProjectMilestoneEvent['type'],
    projectId: UUID,
    milestone: ProjectMilestone,
    userId?: UUID,
    previousMilestone?: ProjectMilestone
  ): Promise<void> {
    const event: ProjectMilestoneEvent = {
      id: generateUUID(),
      timestamp: createTimestamp(),
      projectId,
      userId,
      type,
      milestoneId: milestone.id,
      milestone,
      previousMilestone,
      metadata: {
        milestoneName: milestone.name,
        phase: milestone.phase,
        status: milestone.status,
        completionPercentage: milestone.completionPercentage
      }
    }
    
    await this.emit(event)
  }

  /**
   * Emit a project artifact event
   */
  async emitProjectArtifactEvent(
    type: ProjectArtifactEvent['type'],
    projectId: UUID,
    artifact: PhaseArtifact,
    userId?: UUID,
    previousArtifact?: PhaseArtifact,
    reason?: string
  ): Promise<void> {
    const event: ProjectArtifactEvent = {
      id: generateUUID(),
      timestamp: createTimestamp(),
      projectId,
      userId,
      type,
      artifactId: artifact.id,
      artifact,
      previousArtifact,
      reason,
      metadata: {
        artifactName: artifact.name,
        artifactType: artifact.type,
        phaseId: artifact.phaseId,
        size: artifact.size,
        reviewStatus: artifact.metadata.reviewStatus
      }
    }
    
    await this.emit(event)
  }

  /**
   * Emit a project error event
   */
  async emitProjectErrorEvent(
    type: ProjectErrorEvent['type'],
    projectId: UUID,
    error: ProjectErrorEvent['error'],
    userId?: UUID,
    validationResults?: ValidationResult[],
    recoveryAction?: string
  ): Promise<void> {
    const event: ProjectErrorEvent = {
      id: generateUUID(),
      timestamp: createTimestamp(),
      projectId,
      userId,
      type,
      error,
      validationResults,
      recoveryAction,
      metadata: {
        errorCode: error.code,
        severity: error.severity,
        hasValidationResults: !!validationResults,
        hasRecoveryAction: !!recoveryAction
      }
    }
    
    await this.emit(event)
  }

  // =============================================================================
  // EVENT SUBSCRIPTION METHODS
  // =============================================================================

  /**
   * Subscribe to project events with optional filtering
   */
  subscribe<T extends ProjectEvent>(
    eventType: string | RegExp,
    listener: ProjectEventListener<T>,
    options: Partial<ProjectEventSubscription['options']> = {},
    subscriber?: ProjectEventSubscription['subscriber']
  ): UUID {
    const subscription: ProjectEventSubscription = {
      id: generateUUID(),
      eventType,
      listener: listener as ProjectEventListener,
      options: {
        once: false,
        priority: 0,
        ...options
      },
      subscribedAt: createTimestamp(),
      subscriber
    }
    
    // Add to appropriate subscription list
    if (eventType === '*' || eventType instanceof RegExp && eventType.source === '.*') {
      this.globalListeners.push(subscription)
    } else {
      const typeKey = typeof eventType === 'string' ? eventType : eventType.source
      const subscriptions = this.subscriptions.get(typeKey) || []
      subscriptions.push(subscription)
      
      // Sort by priority (higher priority first)
      subscriptions.sort((a, b) => (b.options.priority || 0) - (a.options.priority || 0))
      
      this.subscriptions.set(typeKey, subscriptions)
    }
    
    this.logger.debug('Event subscription created', {
      subscriptionId: subscription.id,
      eventType: typeof eventType === 'string' ? eventType : eventType.source,
      subscriber: subscriber?.name || 'anonymous'
    })
    
    return subscription.id
  }

  /**
   * Subscribe to all events for a specific project
   */
  subscribeToProject(
    projectId: UUID,
    listener: ProjectEventListener,
    options: Partial<ProjectEventSubscription['options']> = {},
    subscriber?: ProjectEventSubscription['subscriber']
  ): UUID {
    return this.subscribe(
      '.*',
      listener,
      {
        ...options,
        filter: (event) => event.projectId === projectId
      },
      subscriber
    )
  }

  /**
   * Subscribe to specific event types for a project
   */
  subscribeToProjectEvents(
    projectId: UUID,
    eventTypes: string[],
    listener: ProjectEventListener,
    options: Partial<ProjectEventSubscription['options']> = {},
    subscriber?: ProjectEventSubscription['subscriber']
  ): UUID {
    const eventTypePattern = new RegExp(`^(${eventTypes.join('|')})$`)
    
    return this.subscribe(
      eventTypePattern,
      listener,
      {
        ...options,
        filter: (event) => event.projectId === projectId
      },
      subscriber
    )
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriptionId: UUID): boolean {
    // Check global listeners
    const globalIndex = this.globalListeners.findIndex(sub => sub.id === subscriptionId)
    if (globalIndex !== -1) {
      this.globalListeners.splice(globalIndex, 1)
      this.logger.debug('Global event subscription removed', { subscriptionId })
      return true
    }
    
    // Check typed subscriptions
    for (const [eventType, subscriptions] of this.subscriptions.entries()) {
      const index = subscriptions.findIndex(sub => sub.id === subscriptionId)
      if (index !== -1) {
        subscriptions.splice(index, 1)
        
        // Clean up empty subscription lists
        if (subscriptions.length === 0) {
          this.subscriptions.delete(eventType)
        }
        
        this.logger.debug('Event subscription removed', { subscriptionId, eventType })
        return true
      }
    }
    
    return false
  }

  /**
   * Get all subscriptions for debugging
   */
  getSubscriptions(): Map<string, ProjectEventSubscription[]> {
    const allSubscriptions = new Map<string, ProjectEventSubscription[]>()
    
    // Add global subscriptions
    if (this.globalListeners.length > 0) {
      allSubscriptions.set('*', [...this.globalListeners])
    }
    
    // Add typed subscriptions
    for (const [eventType, subscriptions] of this.subscriptions.entries()) {
      allSubscriptions.set(eventType, [...subscriptions])
    }
    
    return allSubscriptions
  }

  // =============================================================================
  // EVENT PROCESSING METHODS
  // =============================================================================

  /**
   * Start the event processing loop
   */
  private async startEventProcessing(): Promise<void> {
    // Process events every 100ms
    setInterval(async () => {
      if (!this.isProcessingQueue && this.eventQueue.length > 0) {
        await this.processEventQueue()
      }
    }, 100)
  }

  /**
   * Process queued events
   */
  private async processEventQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      return
    }
    
    this.isProcessingQueue = true
    
    try {
      while (this.eventQueue.length > 0) {
        const queueItem = this.eventQueue.shift()!
        await this.processEvent(queueItem.event, queueItem.retryCount)
      }
    } catch (error) {
      this.logger.error('Error processing event queue', { error })
    } finally {
      this.isProcessingQueue = false
    }
  }

  /**
   * Process a single event
   */
  private async processEvent(event: ProjectEvent, retryCount: number): Promise<void> {
    try {
      // Get matching subscriptions
      const matchingSubscriptions = this.getMatchingSubscriptions(event)
      
      // Process each subscription
      const processingPromises = matchingSubscriptions.map(async (subscription) => {
        try {
          // Apply filter if specified
          if (subscription.options.filter && !subscription.options.filter(event)) {
            return
          }
          
          // Execute listener
          await subscription.listener(event)
          
          // Remove one-time subscriptions
          if (subscription.options.once) {
            this.unsubscribe(subscription.id)
          }
          
        } catch (error) {
          this.logger.error('Error in event listener', {
            subscriptionId: subscription.id,
            eventId: event.id,
            error
          })
          
          // Track listener errors but don't fail the entire event processing
          this.eventStats.totalFailed += 1
        }
      })
      
      await Promise.all(processingPromises)
      
      // Send notifications
      await this.sendNotifications(event)
      
      // Update statistics
      this.eventStats.totalProcessed += 1
      
      this.logger.debug('Event processed successfully', {
        eventId: event.id,
        eventType: event.type,
        listenersNotified: matchingSubscriptions.length
      })
      
    } catch (error) {
      // Retry logic
      if (retryCount < 3) {
        this.logger.warn('Event processing failed, retrying', {
          eventId: event.id,
          retryCount: retryCount + 1,
          error
        })
        
        // Add back to queue with increased retry count
        setTimeout(() => {
          this.eventQueue.push({ event, retryCount: retryCount + 1 })
        }, Math.pow(2, retryCount) * 1000) // Exponential backoff
        
      } else {
        this.logger.error('Event processing failed permanently', {
          eventId: event.id,
          error
        })
        
        this.eventStats.totalFailed += 1
        
        // Emit error event for permanent failures
        if (event.type !== 'error_occurred') { // Prevent infinite loops
          await this.emitProjectErrorEvent(
            'error_occurred',
            event.projectId,
            {
              code: 'EVENT_PROCESSING_FAILED',
              message: 'Failed to process event after retries',
              details: { originalEvent: event, error },
              severity: 'high'
            }
          )
        }
      }
    }
  }

  /**
   * Get subscriptions matching an event
   */
  private getMatchingSubscriptions(event: ProjectEvent): ProjectEventSubscription[] {
    const matching: ProjectEventSubscription[] = []
    
    // Add global listeners
    matching.push(...this.globalListeners)
    
    // Add type-specific listeners
    const typeSubscriptions = this.subscriptions.get(event.type) || []
    matching.push(...typeSubscriptions)
    
    // Add regex pattern matches
    for (const [pattern, subscriptions] of this.subscriptions.entries()) {
      try {
        const regex = new RegExp(pattern)
        if (regex.test(event.type)) {
          matching.push(...subscriptions)
        }
      } catch (error) {
        // Ignore invalid regex patterns
      }
    }
    
    // Remove duplicates and sort by priority
    const uniqueSubscriptions = Array.from(
      new Map(matching.map(sub => [sub.id, sub])).values()
    )
    
    return uniqueSubscriptions.sort(
      (a, b) => (b.options.priority || 0) - (a.options.priority || 0)
    )
  }

  // =============================================================================
  // NOTIFICATION METHODS
  // =============================================================================

  /**
   * Configure event notifications
   */
  configureNotifications(
    userId: UUID,
    config: EventNotificationConfig
  ): void {
    this.notificationConfigs.set(userId, config)
    
    this.logger.info('Event notifications configured', {
      userId,
      channels: Object.keys(config.channels).filter(ch => config.channels[ch as keyof typeof config.channels]),
      eventTypesCount: config.filters.eventTypes?.length || 0
    })
  }

  /**
   * Send notifications for an event
   */
  private async sendNotifications(event: ProjectEvent): Promise<void> {
    const notificationPromises = Array.from(this.notificationConfigs.entries())
      .map(async ([userId, config]) => {
        try {
          if (this.shouldNotify(event, config)) {
            await this.sendNotification(userId, event, config)
          }
        } catch (error) {
          this.logger.error('Error sending notification', {
            userId,
            eventId: event.id,
            error
          })
        }
      })
    
    await Promise.all(notificationPromises)
  }

  /**
   * Check if an event should trigger a notification
   */
  private shouldNotify(event: ProjectEvent, config: EventNotificationConfig): boolean {
    // Check event type filter
    if (config.filters.eventTypes && !config.filters.eventTypes.includes(event.type)) {
      return false
    }
    
    // Check project filter
    if (config.filters.projects && !config.filters.projects.includes(event.projectId)) {
      return false
    }
    
    // Check user filter
    if (config.filters.users && event.userId && !config.filters.users.includes(event.userId)) {
      return false
    }
    
    // Check severity filter for error events
    if ('error' in event && config.filters.severity) {
      const errorEvent = event as ProjectErrorEvent
      if (!config.filters.severity.includes(errorEvent.error.severity)) {
        return false
      }
    }
    
    return true
  }

  /**
   * Send a notification to a user
   */
  private async sendNotification(
    userId: UUID,
    event: ProjectEvent,
    config: EventNotificationConfig
  ): Promise<void> {
    // In-app notification
    if (config.channels.inApp) {
      // This would integrate with the UI notification system
      this.logger.info('In-app notification sent', {
        userId,
        eventId: event.id,
        eventType: event.type
      })
    }
    
    // Email notification
    if (config.channels.email) {
      // This would integrate with an email service
      this.logger.info('Email notification queued', {
        userId,
        eventId: event.id,
        eventType: event.type
      })
    }
    
    // Webhook notification
    if (config.channels.webhook) {
      try {
        // This would make an HTTP request to the webhook URL
        this.logger.info('Webhook notification sent', {
          userId,
          eventId: event.id,
          webhookUrl: config.channels.webhook.url
        })
      } catch (error) {
        this.logger.error('Webhook notification failed', {
          userId,
          eventId: event.id,
          webhookUrl: config.channels.webhook.url,
          error
        })
      }
    }
  }

  // =============================================================================
  // AUDIT TRAIL METHODS
  // =============================================================================

  /**
   * Get event history for a project
   */
  getProjectEventHistory(
    projectId: UUID,
    limit?: number,
    offset?: number,
    eventTypes?: string[]
  ): ProjectEvent[] {
    const history = this.eventHistory.get(projectId) || []
    
    let filtered = eventTypes 
      ? history.filter(event => eventTypes.includes(event.type))
      : history
    
    // Sort by timestamp (newest first)
    filtered = filtered.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
    
    // Apply pagination
    const start = offset || 0
    const end = limit ? start + limit : filtered.length
    
    return filtered.slice(start, end)
  }

  /**
   * Create a state change record
   */
  async createStateChange(
    projectId: UUID,
    userId: UUID,
    changeType: ProjectStateChange['changeType'],
    changedFields: string[],
    previousValues: Record<string, any>,
    newValues: Record<string, any>,
    description?: string
  ): Promise<ProjectStateChange> {
    const stateChange: ProjectStateChange = {
      id: generateUUID(),
      projectId,
      timestamp: createTimestamp(),
      userId,
      changeType,
      changedFields,
      previousValues,
      newValues,
      description
    }
    
    // Emit state change event
    await this.emit({
      id: generateUUID(),
      timestamp: createTimestamp(),
      projectId,
      userId,
      type: 'config_updated',
      configSection: 'state',
      newConfig: newValues,
      previousConfig: previousValues,
      metadata: {
        changeType,
        changedFieldsCount: changedFields.length
      }
    } as ProjectConfigurationEvent)
    
    return stateChange
  }

  /**
   * Add event to history
   */
  private addToEventHistory(event: ProjectEvent): void {
    const history = this.eventHistory.get(event.projectId) || []
    history.push(event)
    
    // Limit history size (keep last 1000 events per project)
    if (history.length > 1000) {
      history.splice(0, history.length - 1000)
    }
    
    this.eventHistory.set(event.projectId, history)
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Validate event structure
   */
  private validateEvent(event: ProjectEvent): void {
    if (!event.id || !event.timestamp || !event.projectId || !event.type) {
      throw new ReadyAIError(
        'Invalid event structure: missing required fields',
        'INVALID_EVENT',
        400,
        { event }
      )
    }
    
    try {
      new Date(event.timestamp)
    } catch (error) {
      throw new ReadyAIError(
        'Invalid event timestamp format',
        'INVALID_TIMESTAMP',
        400,
        { timestamp: event.timestamp }
      )
    }
  }

  /**
   * Update event statistics
   */
  private updateEventStats(event: ProjectEvent): void {
    this.eventStats.totalEmitted += 1
    
    const typeCount = this.eventStats.byType.get(event.type) || 0
    this.eventStats.byType.set(event.type, typeCount + 1)
    
    const projectCount = this.eventStats.byProject.get(event.projectId) || 0
    this.eventStats.byProject.set(event.projectId, projectCount + 1)
  }

  /**
   * Handle event errors
   */
  private async handleEventError(error: any, event?: ProjectEvent): Promise<void> {
    this.errorService.handleError(error, 'ProjectEventService')
    
    if (event) {
      this.logger.error('Event processing error', {
        eventId: event.id,
        eventType: event.type,
        projectId: event.projectId,
        error
      })
    }
  }

  /**
   * Get event statistics
   */
  getEventStatistics(): {
    totalEmitted: number
    totalProcessed: number
    totalFailed: number
    successRate: number
    byType: Record<string, number>
    byProject: Record<string, number>
  } {
    return {
      totalEmitted: this.eventStats.totalEmitted,
      totalProcessed: this.eventStats.totalProcessed,
      totalFailed: this.eventStats.totalFailed,
      successRate: this.eventStats.totalEmitted > 0 
        ? (this.eventStats.totalProcessed / this.eventStats.totalEmitted) * 100 
        : 100,
      byType: Object.fromEntries(this.eventStats.byType.entries()),
      byProject: Object.fromEntries(this.eventStats.byProject.entries())
    }
  }

  /**
   * Clear event history for a project
   */
  clearProjectEventHistory(projectId: UUID): void {
    this.eventHistory.delete(projectId)
    this.logger.info('Project event history cleared', { projectId })
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Clear all subscriptions
    this.subscriptions.clear()
    this.globalListeners.splice(0)
    
    // Clear event history
    this.eventHistory.clear()
    
    // Clear notification configs
    this.notificationConfigs.clear()
    
    // Clear event queue
    this.eventQueue.splice(0)
    
    this.logger.info('ProjectEventService cleaned up')
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a project event service instance
 */
export function createProjectEventService(
  logger: Logger,
  errorService: ErrorService,
  telemetryService: TelemetryService
): ProjectEventService {
  return new ProjectEventService(logger, errorService, telemetryService)
}

/**
 * Project event service error class
 */
export class ProjectEventServiceError extends ReadyAIError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'PROJECT_EVENT_SERVICE_ERROR', 500, details)
    this.name = 'ProjectEventServiceError'
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default ProjectEventService

export {
  type ProjectEvent,
  type ProjectEventListener,
  type ProjectEventSubscription,
  type EventNotificationConfig,
  type ProjectLifecycleEvent,
  type ProjectPhaseEvent,
  type ProjectMilestoneEvent,
  type ProjectArtifactEvent,
  type ProjectCollaborationEvent,
  type ProjectConfigurationEvent,
  type ProjectErrorEvent,
  type ProjectAnalyticsEvent
}
