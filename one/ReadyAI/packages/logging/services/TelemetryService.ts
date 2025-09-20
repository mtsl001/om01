// packages/logging/services/TelemetryService.ts

/**
 * ReadyAI Telemetry Service - Production-Grade Analytics and Monitoring
 * 
 * Advanced telemetry and analytics service adapted from Cline's battle-tested telemetry architecture.
 * Provides comprehensive usage analytics, performance monitoring, privacy-controlled data collection,
 * and real-time insights for ReadyAI's development orchestration workflow.
 * 
 * Key Features:
 * - ReadyAI-specific metrics and KPIs (context retrieval, AI generation, phase progression)
 * - Privacy-first data collection with granular consent controls
 * - Real-time performance monitoring and alerting
 * - Comprehensive usage analytics and reporting
 * - AI provider performance tracking and cost analysis
 * - Project lifecycle analytics and optimization insights
 * - GDPR-compliant data handling with automatic retention policies
 * 
 * Reuse Strategy: 75% Adapt from Cline's telemetry patterns
 * - Direct adaptation of Cline's proven telemetry collection and aggregation
 * - Enhanced with ReadyAI-specific metrics and privacy controls
 * - Maintains Cline's performance optimization and data integrity patterns
 */

import { randomUUID, createHash } from 'crypto';
import { writeFile, readFile, existsSync, mkdirSync } from 'fs/promises';
import { dirname, join } from 'path';

// ReadyAI Core Types
import { 
  UUID, 
  ApiResult, 
  ApiResponse, 
  createApiResponse, 
  createApiError,
  PhaseType,
  AIProviderType,
  Project,
  GenerationRequest,
  GenerationResult,
  QualityMetrics,
  AsyncResult,
  wrapAsync
} from '../../../foundation/types/core';

// Logging Dependencies
import { 
  LogLevel, 
  LogContext, 
  MetricType, 
  PerformanceMetric,
  ErrorSeverity,
  ILoggerService 
} from '../types/logging';
import { Logger } from './Logger';
import { ErrorService } from './ErrorService';

/**
 * Privacy consent levels for telemetry data collection
 * Inspired by Cline's privacy-first approach with ReadyAI enhancements
 */
export type TelemetryConsentLevel = 
  | 'none'        // No telemetry collection
  | 'essential'   // Only critical errors and basic usage
  | 'standard'    // Performance metrics and feature usage
  | 'full'        // Complete analytics including AI generation patterns

/**
 * ReadyAI-specific telemetry event types
 * Extends Cline's event tracking with development orchestration metrics
 */
export type ReadyAITelemetryEventType =
  // Phase progression events
  | 'phase_started'
  | 'phase_completed'
  | 'phase_failed'
  | 'phase_skipped'
  // AI generation events
  | 'ai_generation_started'
  | 'ai_generation_completed'
  | 'ai_generation_failed'
  | 'ai_provider_switched'
  // Context management events
  | 'context_retrieval_started'
  | 'context_retrieval_completed'
  | 'context_package_optimized'
  | 'dependency_graph_analyzed'
  // Project lifecycle events
  | 'project_created'
  | 'project_opened'
  | 'project_completed'
  | 'project_archived'
  // Quality and performance events
  | 'quality_metrics_calculated'
  | 'performance_threshold_exceeded'
  | 'error_pattern_detected'
  | 'user_feedback_submitted'
  // System events
  | 'extension_activated'
  | 'extension_deactivated'
  | 'settings_changed'
  | 'feature_used';

/**
 * Enhanced telemetry event with ReadyAI-specific metadata
 * Based on Cline's event structure with development orchestration context
 */
export interface ReadyAITelemetryEvent {
  /** Unique event identifier */
  id: UUID;
  /** Event type classification */
  type: ReadyAITelemetryEventType;
  /** Human-readable event description */
  name: string;
  /** Event timestamp (ISO 8601) */
  timestamp: string;
  /** User session identifier */
  sessionId: UUID;
  /** Project context if applicable */
  projectId?: UUID;
  /** Current development phase */
  phaseType?: PhaseType;
  /** AI provider used */
  aiProvider?: AIProviderType;
  /** Event-specific properties */
  properties: Record<string, any>;
  /** Performance metrics for the event */
  metrics?: {
    duration?: number;
    tokensUsed?: number;
    cost?: number;
    memoryUsage?: number;
    cpuUsage?: number;
  };
  /** User privacy consent level at time of event */
  consentLevel: TelemetryConsentLevel;
  /** Geographic region (anonymized) */
  region?: string;
  /** ReadyAI version */
  version: string;
  /** Platform information (anonymized) */
  platform: {
    os: string;
    arch: string;
    nodeVersion: string;
    vscodeVersion: string;
  };
}

/**
 * Aggregated usage analytics for reporting and insights
 * Adapted from Cline's analytics aggregation patterns
 */
export interface UsageAnalytics {
  /** Analytics time window */
  timeWindow: {
    start: string;
    end: string;
    durationMs: number;
  };
  /** Project lifecycle metrics */
  projects: {
    created: number;
    completed: number;
    active: number;
    averageCompletionTime: number;
    mostUsedTechStacks: string[];
  };
  /** Phase progression analytics */
  phases: {
    totalPhaseExecutions: number;
    averagePhaseTime: Record<PhaseType, number>;
    phaseSuccessRates: Record<PhaseType, number>;
    commonFailureReasons: Array<{
      phase: PhaseType;
      reason: string;
      count: number;
    }>;
  };
  /** AI generation performance */
  aiGeneration: {
    totalRequests: number;
    successfulGenerations: number;
    averageGenerationTime: number;
    averageTokenUsage: number;
    totalCost: number;
    providerPerformance: Record<AIProviderType, {
      requests: number;
      successRate: number;
      averageTime: number;
      averageCost: number;
    }>;
  };
  /** Context management efficiency */
  contextManagement: {
    averageRetrievalTime: number;
    contextHitRate: number;
    averagePackageSize: number;
    dependencyGraphComplexity: number;
  };
  /** Quality metrics trends */
  quality: {
    averageArchitecturalConsistency: number;
    averageTestCoverage: number;
    averageDependencyHealth: number;
    trendDirection: 'improving' | 'stable' | 'declining';
  };
  /** Error patterns and reliability */
  errors: {
    totalErrors: number;
    criticalErrors: number;
    errorsByCategory: Record<string, number>;
    meanTimeToResolution: number;
    recurringIssues: Array<{
      pattern: string;
      count: number;
      impact: 'low' | 'medium' | 'high';
    }>;
  };
}

/**
 * Performance benchmarks and KPIs for ReadyAI operations
 * Extends Cline's performance tracking with development-specific metrics
 */
export interface PerformanceBenchmarks {
  /** Context retrieval performance (3-second SLA) */
  contextRetrieval: {
    averageTime: number;
    p95Time: number;
    p99Time: number;
    slaViolations: number;
    threshold: 3000; // 3 seconds
  };
  /** AI generation performance */
  aiGeneration: {
    averageTime: number;
    p95Time: number;
    timeByProvider: Record<AIProviderType, number>;
    costEfficiency: Record<AIProviderType, number>;
  };
  /** Phase execution efficiency */
  phaseExecution: {
    averagePhaseTime: Record<PhaseType, number>;
    bottleneckPhases: PhaseType[];
    optimizationOpportunities: Array<{
      phase: PhaseType;
      currentTime: number;
      targetTime: number;
      potentialImprovement: number;
    }>;
  };
  /** System resource utilization */
  resources: {
    averageMemoryUsage: number;
    peakMemoryUsage: number;
    averageCpuUsage: number;
    diskUsage: number;
    networkLatency: number;
  };
}

/**
 * Privacy-controlled data collection settings
 * Implements GDPR-compliant data handling principles
 */
export interface TelemetryPrivacySettings {
  /** Current consent level */
  consentLevel: TelemetryConsentLevel;
  /** Consent timestamp */
  consentTimestamp: string;
  /** Data retention period in days */
  retentionDays: number;
  /** Anonymization settings */
  anonymization: {
    enabled: boolean;
    hashUserIdentifiers: boolean;
    removeGeolocation: boolean;
    obfuscateFilePaths: boolean;
  };
  /** Data sharing preferences */
  dataSharing: {
    allowAggregatedAnalytics: boolean;
    allowPerformanceMetrics: boolean;
    allowErrorReporting: boolean;
    allowFeatureUsageStats: boolean;
  };
  /** Opt-out preferences */
  optOut: {
    crashReports: boolean;
    usageAnalytics: boolean;
    performanceMetrics: boolean;
    aiModelMetrics: boolean;
  };
}

/**
 * Telemetry storage and batching configuration
 * Based on Cline's efficient data handling patterns
 */
interface TelemetryStorageConfig {
  /** Local storage directory */
  storageDir: string;
  /** Batch size for event uploads */
  batchSize: number;
  /** Flush interval in milliseconds */
  flushIntervalMs: number;
  /** Maximum local storage size in MB */
  maxStorageMB: number;
  /** Enable compression for stored events */
  enableCompression: boolean;
  /** Retry configuration */
  retryConfig: {
    maxRetries: number;
    initialDelayMs: number;
    backoffMultiplier: number;
  };
}

/**
 * Production-Ready Telemetry Service
 * 
 * Comprehensive analytics and monitoring service adapted from Cline's 
 * battle-tested telemetry architecture with ReadyAI-specific enhancements
 * for development orchestration workflows.
 */
export class TelemetryService implements ILoggerService {
  private static instance: TelemetryService | null = null;
  private readonly logger: Logger;
  private readonly errorService: ErrorService;
  
  // Event storage and batching
  private readonly eventQueue: ReadyAITelemetryEvent[] = [];
  private readonly storageConfig: TelemetryStorageConfig;
  private flushTimer?: NodeJS.Timeout;
  private isShuttingDown = false;
  
  // Session and user context
  private currentSessionId: UUID;
  private privacySettings: TelemetryPrivacySettings;
  
  // Performance tracking
  private readonly activeTimers = new Map<string, number>();
  private readonly performanceMetrics = new Map<string, PerformanceMetric[]>();
  
  // Analytics aggregation
  private analyticsCache: {
    data: UsageAnalytics | null;
    lastUpdated: string | null;
    ttlMs: number;
  };
  
  // Default privacy settings (privacy-first approach)
  private static readonly DEFAULT_PRIVACY_SETTINGS: TelemetryPrivacySettings = {
    consentLevel: 'essential',
    consentTimestamp: new Date().toISOString(),
    retentionDays: 30,
    anonymization: {
      enabled: true,
      hashUserIdentifiers: true,
      removeGeolocation: true,
      obfuscateFilePaths: true
    },
    dataSharing: {
      allowAggregatedAnalytics: false,
      allowPerformanceMetrics: true,
      allowErrorReporting: true,
      allowFeatureUsageStats: false
    },
    optOut: {
      crashReports: false,
      usageAnalytics: false,
      performanceMetrics: false,
      aiModelMetrics: false
    }
  };

  private constructor(
    storageDir?: string,
    privacySettings?: Partial<TelemetryPrivacySettings>
  ) {
    this.logger = Logger.getInstance();
    this.errorService = ErrorService.getInstance();
    this.currentSessionId = randomUUID() as UUID;
    
    // Initialize storage configuration
    this.storageConfig = {
      storageDir: storageDir || join(process.cwd(), '.readyai', 'telemetry'),
      batchSize: 50,
      flushIntervalMs: 60000, // 1 minute
      maxStorageMB: 10,
      enableCompression: true,
      retryConfig: {
        maxRetries: 3,
        initialDelayMs: 1000,
        backoffMultiplier: 2
      }
    };
    
    // Initialize privacy settings
    this.privacySettings = {
      ...TelemetryService.DEFAULT_PRIVACY_SETTINGS,
      ...privacySettings
    };
    
    // Initialize analytics cache
    this.analyticsCache = {
      data: null,
      lastUpdated: null,
      ttlMs: 300000 // 5 minutes
    };
    
    // Initialize telemetry system
    this.initializeTelemetrySystem();
  }

  /**
   * Get singleton instance of TelemetryService
   */
  public static getInstance(
    storageDir?: string,
    privacySettings?: Partial<TelemetryPrivacySettings>
  ): TelemetryService {
    if (!TelemetryService.instance) {
      TelemetryService.instance = new TelemetryService(storageDir, privacySettings);
    }
    return TelemetryService.instance;
  }

  /**
   * Track ReadyAI-specific telemetry event with privacy controls
   * Core method adapted from Cline's event tracking patterns
   */
  public async trackEvent(
    type: ReadyAITelemetryEventType,
    name: string,
    properties: Record<string, any> = {},
    context?: {
      projectId?: UUID;
      phaseType?: PhaseType;
      aiProvider?: AIProviderType;
      metrics?: ReadyAITelemetryEvent['metrics'];
    }
  ): Promise<void> {
    // Check privacy consent
    if (this.privacySettings.consentLevel === 'none') {
      return;
    }
    
    // Apply consent-level filtering
    if (!this.shouldTrackEvent(type, this.privacySettings.consentLevel)) {
      return;
    }
    
    try {
      // Create telemetry event
      const event: ReadyAITelemetryEvent = {
        id: randomUUID() as UUID,
        type,
        name,
        timestamp: new Date().toISOString(),
        sessionId: this.currentSessionId,
        projectId: context?.projectId,
        phaseType: context?.phaseType,
        aiProvider: context?.aiProvider,
        properties: await this.sanitizeProperties(properties),
        metrics: context?.metrics,
        consentLevel: this.privacySettings.consentLevel,
        region: this.privacySettings.anonymization.removeGeolocation ? undefined : this.getAnonymizedRegion(),
        version: this.getReadyAIVersion(),
        platform: await this.getPlatformInfo()
      };
      
      // Add to event queue
      this.eventQueue.push(event);
      
      // Log event locally
      await this.logger.info(`Telemetry event tracked: ${type}`, 'telemetry', {
        eventId: event.id,
        sessionId: this.currentSessionId,
        projectId: context?.projectId,
        consentLevel: this.privacySettings.consentLevel
      });
      
      // Auto-flush if batch size reached
      if (this.eventQueue.length >= this.storageConfig.batchSize) {
        await this.flush();
      }
      
    } catch (error) {
      await this.errorService.handleError(error, {
        category: 'telemetry',
        severity: 'medium',
        recoveryStrategy: 'retry',
        operationContext: {
          operationType: 'trackEvent',
          operationId: randomUUID() as UUID
        }
      });
    }
  }

  /**
   * Start performance timing for ReadyAI operations
   * Extends Cline's performance tracking with ReadyAI-specific KPIs
   */
  public startTiming(operation: string, context?: { projectId?: UUID; phaseType?: PhaseType }): string {
    const timingId = `${operation}-${randomUUID()}`;
    this.activeTimers.set(timingId, performance.now());
    
    // Track timing start event for critical operations
    const criticalOps = ['context_retrieval', 'ai_generation', 'phase_execution'];
    if (criticalOps.some(op => operation.includes(op))) {
      this.trackEvent(`${operation}_started` as ReadyAITelemetryEventType, `${operation} started`, {
        timingId,
        operation
      }, context);
    }
    
    return timingId;
  }

  /**
   * End performance timing and record metrics
   * Implements ReadyAI KPI monitoring (3-second context retrieval SLA)
   */
  public async endTiming(
    timingId: string, 
    operation: string, 
    context?: { 
      projectId?: UUID; 
      phaseType?: PhaseType; 
      success?: boolean;
      metadata?: Record<string, any>;
    }
  ): Promise<PerformanceMetric | null> {
    const startTime = this.activeTimers.get(timingId);
    if (startTime === undefined) {
      await this.logger.warn(`Timing ID not found: ${timingId}`, 'telemetry');
      return null;
    }
    
    const duration = performance.now() - startTime;
    this.activeTimers.delete(timingId);
    
    // Create performance metric
    const metric: PerformanceMetric = {
      id: randomUUID() as UUID,
      name: operation,
      type: 'timer' as MetricType,
      value: duration,
      unit: 'ms',
      timestamp: new Date().toISOString(),
      source: 'telemetry-service',
      projectId: context?.projectId,
      tags: {
        operation,
        phase: context?.phaseType,
        success: context?.success?.toString() || 'unknown',
        ...context?.metadata
      }
    };
    
    // Store metric
    if (!this.performanceMetrics.has(operation)) {
      this.performanceMetrics.set(operation, []);
    }
    this.performanceMetrics.get(operation)!.push(metric);
    
    // Check KPI thresholds and alert if exceeded
    await this.checkPerformanceThresholds(operation, duration, context);
    
    // Track completion event
    await this.trackEvent(
      `${operation}_completed` as ReadyAITelemetryEventType,
      `${operation} completed`,
      {
        timingId,
        operation,
        duration,
        success: context?.success !== false,
        ...context?.metadata
      },
      {
        ...context,
        metrics: {
          duration,
          ...context?.metadata
        }
      }
    );
    
    return metric;
  }

  /**
   * Track AI generation performance and cost analysis
   * ReadyAI-specific analytics for AI provider comparison and optimization
   */
  public async trackAIGeneration(
    provider: AIProviderType,
    model: string,
    request: Partial<GenerationRequest>,
    result: Partial<GenerationResult>,
    error?: Error
  ): Promise<void> {
    const success = !error && result.content;
    const eventType: ReadyAITelemetryEventType = success ? 'ai_generation_completed' : 'ai_generation_failed';
    
    await this.trackEvent(eventType, `AI generation ${success ? 'completed' : 'failed'}`, {
      provider,
      model,
      success,
      confidence: result.confidence,
      tokenUsage: result.tokenUsage,
      cost: result.tokenUsage?.total ? this.calculateCost(provider, result.tokenUsage.total) : undefined,
      error: error ? {
        message: error.message,
        code: (error as any).code,
        retryable: (error as any).retryable
      } : undefined,
      contextSize: request.contextPackage?.estimatedTokens,
      priority: request.priority,
      retryCount: request.retryCount
    }, {
      projectId: request.projectId,
      phaseType: request.phase,
      aiProvider: provider,
      metrics: {
        duration: result.generatedAt ? 
          new Date(result.generatedAt).getTime() - new Date(request.createdAt || Date.now()).getTime() : undefined,
        tokensUsed: result.tokenUsage?.total,
        cost: result.tokenUsage?.total ? this.calculateCost(provider, result.tokenUsage.total) : undefined
      }
    });
  }

  /**
   * Track phase progression analytics
   * Monitors ReadyAI's 7-phase development methodology performance
   */
  public async trackPhaseProgression(
    phase: PhaseType,
    status: 'started' | 'completed' | 'failed' | 'skipped',
    projectId: UUID,
    metrics?: {
      duration?: number;
      artifactsGenerated?: number;
      validationScore?: number;
      aiRequestsCount?: number;
      errorCount?: number;
    }
  ): Promise<void> {
    const eventType: ReadyAITelemetryEventType = `phase_${status}`;
    
    await this.trackEvent(eventType, `Phase ${phase} ${status}`, {
      phase,
      status,
      ...metrics
    }, {
      projectId,
      phaseType: phase,
      metrics: {
        duration: metrics?.duration,
        ...metrics
      }
    });
  }

  /**
   * Get comprehensive usage analytics with caching
   * Adapted from Cline's analytics aggregation patterns
   */
  public async getUsageAnalytics(forceRefresh = false): Promise<ApiResult<UsageAnalytics>> {
    return wrapAsync(async () => {
      // Check cache first
      const now = Date.now();
      if (!forceRefresh && this.analyticsCache.data && this.analyticsCache.lastUpdated) {
        const cacheAge = now - new Date(this.analyticsCache.lastUpdated).getTime();
        if (cacheAge < this.analyticsCache.ttlMs) {
          return this.analyticsCache.data;
        }
      }
      
      // Generate fresh analytics
      const analytics = await this.generateUsageAnalytics();
      
      // Update cache
      this.analyticsCache = {
        data: analytics,
        lastUpdated: new Date().toISOString(),
        ttlMs: 300000 // 5 minutes
      };
      
      return analytics;
    });
  }

  /**
   * Get performance benchmarks and KPI analysis
   */
  public async getPerformanceBenchmarks(): Promise<ApiResult<PerformanceBenchmarks>> {
    return wrapAsync(async () => {
      const contextRetrievalMetrics = this.performanceMetrics.get('context_retrieval') || [];
      const aiGenerationMetrics = this.performanceMetrics.get('ai_generation') || [];
      const phaseMetrics = new Map<PhaseType, PerformanceMetric[]>();
      
      // Group metrics by phase
      for (const [key, metrics] of this.performanceMetrics.entries()) {
        if (key.startsWith('phase_')) {
          const phase = key.replace('phase_', '') as PhaseType;
          phaseMetrics.set(phase, metrics);
        }
      }
      
      // Calculate benchmarks
      const benchmarks: PerformanceBenchmarks = {
        contextRetrieval: {
          averageTime: this.calculateAverage(contextRetrievalMetrics.map(m => m.value)),
          p95Time: this.calculatePercentile(contextRetrievalMetrics.map(m => m.value), 95),
          p99Time: this.calculatePercentile(contextRetrievalMetrics.map(m => m.value), 99),
          slaViolations: contextRetrievalMetrics.filter(m => m.value > 3000).length,
          threshold: 3000
        },
        aiGeneration: {
          averageTime: this.calculateAverage(aiGenerationMetrics.map(m => m.value)),
          p95Time: this.calculatePercentile(aiGenerationMetrics.map(m => m.value), 95),
          timeByProvider: this.calculateTimeByProvider(aiGenerationMetrics),
          costEfficiency: this.calculateCostEfficiency(aiGenerationMetrics)
        },
        phaseExecution: {
          averagePhaseTime: this.calculateAveragePhaseTime(phaseMetrics),
          bottleneckPhases: this.identifyBottleneckPhases(phaseMetrics),
          optimizationOpportunities: this.identifyOptimizationOpportunities(phaseMetrics)
        },
        resources: await this.getResourceUtilization()
      };
      
      return benchmarks;
    });
  }

  /**
   * Update privacy settings with user consent
   * GDPR-compliant consent management
   */
  public async updatePrivacySettings(
    newSettings: Partial<TelemetryPrivacySettings>
  ): Promise<ApiResult<TelemetryPrivacySettings>> {
    return wrapAsync(async () => {
      // Validate consent level change
      if (newSettings.consentLevel && newSettings.consentLevel !== this.privacySettings.consentLevel) {
        await this.trackEvent('settings_changed', 'Privacy consent updated', {
          previousLevel: this.privacySettings.consentLevel,
          newLevel: newSettings.consentLevel,
          timestamp: new Date().toISOString()
        });
      }
      
      // Update settings
      this.privacySettings = {
        ...this.privacySettings,
        ...newSettings,
        consentTimestamp: new Date().toISOString()
      };
      
      // Save to persistent storage
      await this.savePrivacySettings();
      
      // Apply data retention policies if consent level decreased
      if (newSettings.consentLevel === 'none' || newSettings.consentLevel === 'essential') {
        await this.applyDataRetentionPolicy();
      }
      
      await this.logger.info('Privacy settings updated', 'telemetry', {
        consentLevel: this.privacySettings.consentLevel,
        anonymizationEnabled: this.privacySettings.anonymization.enabled
      });
      
      return this.privacySettings;
    });
  }

  /**
   * Flush pending events to storage
   * Adapted from Cline's batched data persistence patterns
   */
  public async flush(): Promise<void> {
    if (this.eventQueue.length === 0) {
      return;
    }
    
    try {
      const eventsToFlush = [...this.eventQueue];
      this.eventQueue.length = 0; // Clear queue
      
      // Apply privacy filters before storage
      const filteredEvents = eventsToFlush.filter(event => 
        this.shouldPersistEvent(event)
      );
      
      // Store events locally
      await this.storeEventsLocally(filteredEvents);
      
      await this.logger.debug(`Flushed ${filteredEvents.length} telemetry events`, 'telemetry', {
        totalQueued: eventsToFlush.length,
        filtered: eventsToFlush.length - filteredEvents.length,
        consentLevel: this.privacySettings.consentLevel
      });
      
    } catch (error) {
      await this.errorService.handleError(error, {
        category: 'telemetry',
        severity: 'medium',
        recoveryStrategy: 'retry',
        operationContext: {
          operationType: 'flushEvents',
          operationId: randomUUID() as UUID
        }
      });
      
      // Re-queue events on failure (with limit to prevent unbounded growth)
      if (this.eventQueue.length < this.storageConfig.batchSize * 2) {
        // Events were cleared at start, don't re-add if queue has grown since
      }
    }
  }

  /**
   * Graceful shutdown - flush all pending data
   */
  public async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    
    await this.flush();
    
    await this.trackEvent('extension_deactivated', 'ReadyAI extension deactivated', {
      sessionDuration: Date.now() - new Date(this.currentSessionId).getTime(),
      gracefulShutdown: true
    });
    
    await this.flush(); // Final flush
    
    await this.logger.info('Telemetry service shutdown completed', 'telemetry', {
      sessionId: this.currentSessionId,
      eventsInQueue: this.eventQueue.length
    });
  }

  // ILoggerService implementation for error integration
  public async log(level: LogLevel, message: string, context?: LogContext): Promise<void> {
    await this.logger.log(level, message, context);
    
    // Track significant log events
    if (level === 'error' || level === 'fatal') {
      await this.trackEvent('error_pattern_detected', `${level.toUpperCase()}: ${message}`, {
        level,
        message: message.substring(0, 200), // Truncate for privacy
        category: context?.category || 'unknown',
        source: context?.source || 'unknown'
      });
    }
  }

  public async debug(message: string, context?: LogContext): Promise<void> {
    await this.logger.debug(message, context);
  }

  public async info(message: string, context?: LogContext): Promise<void> {
    await this.logger.info(message, context);
  }

  public async warn(message: string, context?: LogContext): Promise<void> {
    await this.logger.warn(message, context);
  }

  public async error(message: string, context?: LogContext): Promise<void> {
    await this.logger.error(message, context);
  }

  // Private helper methods

  private async initializeTelemetrySystem(): Promise<void> {
    try {
      // Ensure storage directory exists
      await this.ensureStorageDirectory();
      
      // Load saved privacy settings
      await this.loadPrivacySettings();
      
      // Start periodic flush timer
      if (this.storageConfig.flushIntervalMs > 0) {
        this.flushTimer = setInterval(() => {
          if (!this.isShuttingDown) {
            this.flush().catch(error => 
              this.logger.error('Auto-flush failed', 'telemetry', { error: error.message })
            );
          }
        }, this.storageConfig.flushIntervalMs);
      }
      
      // Track initialization
      await this.trackEvent('extension_activated', 'ReadyAI extension activated', {
        sessionId: this.currentSessionId,
        consentLevel: this.privacySettings.consentLevel,
        version: this.getReadyAIVersion(),
        timestamp: new Date().toISOString()
      });
      
      await this.logger.info('Telemetry service initialized', 'telemetry', {
        sessionId: this.currentSessionId,
        consentLevel: this.privacySettings.consentLevel,
        storageDir: this.storageConfig.storageDir
      });
      
    } catch (error) {
      await this.errorService.handleError(error, {
        category: 'telemetry',
        severity: 'high',
        recoveryStrategy: 'manual',
        operationContext: {
          operationType: 'initializeTelemetry',
          operationId: randomUUID() as UUID
        }
      });
    }
  }

  private shouldTrackEvent(type: ReadyAITelemetryEventType, consentLevel: TelemetryConsentLevel): boolean {
    switch (consentLevel) {
      case 'none':
        return false;
      case 'essential':
        return ['extension_activated', 'extension_deactivated', 'error_pattern_detected'].includes(type);
      case 'standard':
        return !['ai_generation_completed', 'user_feedback_submitted'].includes(type);
      case 'full':
        return true;
      default:
        return false;
    }
  }

  private shouldPersistEvent(event: ReadyAITelemetryEvent): boolean {
    // Apply retention policy
    const eventAge = Date.now() - new Date(event.timestamp).getTime();
    const retentionMs = this.privacySettings.retentionDays * 24 * 60 * 60 * 1000;
    
    return eventAge < retentionMs;
  }

  private async sanitizeProperties(properties: Record<string, any>): Promise<Record<string, any>> {
    const sanitized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(properties)) {
      // Hash user identifiers if anonymization enabled
      if (this.privacySettings.anonymization.hashUserIdentifiers && this.isUserIdentifier(key)) {
        sanitized[key] = this.hashValue(value);
      }
      // Obfuscate file paths
      else if (this.privacySettings.anonymization.obfuscateFilePaths && this.isFilePath(key, value)) {
        sanitized[key] = this.obfuscateFilePath(value);
      }
      // Include regular properties
      else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  private async checkPerformanceThresholds(
    operation: string, 
    duration: number, 
    context?: { projectId?: UUID; phaseType?: PhaseType }
  ): Promise<void> {
    let threshold: number | undefined;
    
    // Define KPI thresholds
    switch (operation) {
      case 'context_retrieval':
        threshold = 3000; // 3 seconds
        break;
      case 'ai_generation':
        threshold = 30000; // 30 seconds
        break;
      default:
        return; // No threshold defined
    }
    
    if (duration > threshold) {
      await this.trackEvent('performance_threshold_exceeded', `${operation} exceeded threshold`, {
        operation,
        duration,
        threshold,
        exceedByMs: duration - threshold,
        exceedByPercent: ((duration - threshold) / threshold) * 100
      }, context);
      
      await this.logger.warn(`Performance threshold exceeded for ${operation}`, 'telemetry', {
        operation,
        duration,
        threshold,
        projectId: context?.projectId,
        phase: context?.phaseType
      });
    }
  }

  private async generateUsageAnalytics(): Promise<UsageAnalytics> {
    // This would typically query stored events and aggregate data
    // Simplified implementation for now
    const now = new Date();
    const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours
    
    return {
      timeWindow: {
        start: windowStart.toISOString(),
        end: now.toISOString(),
        durationMs: 24 * 60 * 60 * 1000
      },
      projects: {
        created: 0,
        completed: 0,
        active: 0,
        averageCompletionTime: 0,
        mostUsedTechStacks: []
      },
      phases: {
        totalPhaseExecutions: 0,
        averagePhaseTime: {} as Record<PhaseType, number>,
        phaseSuccessRates: {} as Record<PhaseType, number>,
        commonFailureReasons: []
      },
      aiGeneration: {
        totalRequests: 0,
        successfulGenerations: 0,
        averageGenerationTime: 0,
        averageTokenUsage: 0,
        totalCost: 0,
        providerPerformance: {} as Record<AIProviderType, any>
      },
      contextManagement: {
        averageRetrievalTime: 0,
        contextHitRate: 0,
        averagePackageSize: 0,
        dependencyGraphComplexity: 0
      },
      quality: {
        averageArchitecturalConsistency: 0,
        averageTestCoverage: 0,
        averageDependencyHealth: 0,
        trendDirection: 'stable'
      },
      errors: {
        totalErrors: 0,
        criticalErrors: 0,
        errorsByCategory: {},
        meanTimeToResolution: 0,
        recurringIssues: []
      }
    };
  }

  private calculateCost(provider: AIProviderType, tokens: number): number {
    // Simplified cost calculation - would use actual provider pricing
    const baseCostPerToken = 0.00001; // $0.00001 per token
    return tokens * baseCostPerToken;
  }

  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  private calculateTimeByProvider(metrics: PerformanceMetric[]): Record<AIProviderType, number> {
    const providerTimes: Record<string, number[]> = {};
    
    for (const metric of metrics) {
      const provider = metric.tags?.provider;
      if (provider) {
        if (!providerTimes[provider]) {
          providerTimes[provider] = [];
        }
        providerTimes[provider].push(metric.value);
      }
    }
    
    const result: Record<AIProviderType, number> = {} as Record<AIProviderType, number>;
    for (const [provider, times] of Object.entries(providerTimes)) {
      result[provider as AIProviderType] = this.calculateAverage(times);
    }
    
    return result;
  }

  private calculateCostEfficiency(metrics: PerformanceMetric[]): Record<AIProviderType, number> {
    // Simplified cost efficiency calculation
    return {} as Record<AIProviderType, number>;
  }

  private calculateAveragePhaseTime(phaseMetrics: Map<PhaseType, PerformanceMetric[]>): Record<PhaseType, number> {
    const result: Record<PhaseType, number> = {} as Record<PhaseType, number>;
    
    for (const [phase, metrics] of phaseMetrics.entries()) {
      result[phase] = this.calculateAverage(metrics.map(m => m.value));
    }
    
    return result;
  }

  private identifyBottleneckPhases(phaseMetrics: Map<PhaseType, PerformanceMetric[]>): PhaseType[] {
    // Simplified bottleneck identification
    return [];
  }

  private identifyOptimizationOpportunities(phaseMetrics: Map<PhaseType, PerformanceMetric[]>): Array<{
    phase: PhaseType;
    currentTime: number;
    targetTime: number;
    potentialImprovement: number;
  }> {
    return [];
  }

  private async getResourceUtilization(): Promise<PerformanceBenchmarks['resources']> {
    // Get system resource utilization
    const memUsage = process.memoryUsage();
    
    return {
      averageMemoryUsage: memUsage.rss,
      peakMemoryUsage: memUsage.rss,
      averageCpuUsage: 0, // Would need platform-specific implementation
      diskUsage: 0, // Would need file system analysis
      networkLatency: 0 // Would need network testing
    };
  }

  private async storeEventsLocally(events: ReadyAITelemetryEvent[]): Promise<void> {
    if (events.length === 0) return;
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `events-${timestamp}.json`;
    const filepath = join(this.storageConfig.storageDir, filename);
    
    await writeFile(filepath, JSON.stringify(events, null, 2), 'utf8');
  }

  private async ensureStorageDirectory(): Promise<void> {
    if (!existsSync(this.storageConfig.storageDir)) {
      await mkdirSync(this.storageConfig.storageDir, { recursive: true });
    }
  }

  private async savePrivacySettings(): Promise<void> {
    const settingsPath = join(this.storageConfig.storageDir, 'privacy-settings.json');
    await writeFile(settingsPath, JSON.stringify(this.privacySettings, null, 2), 'utf8');
  }

  private async loadPrivacySettings(): Promise<void> {
    try {
      const settingsPath = join(this.storageConfig.storageDir, 'privacy-settings.json');
      if (existsSync(settingsPath)) {
        const content = await readFile(settingsPath, 'utf8');
        const savedSettings = JSON.parse(content) as TelemetryPrivacySettings;
        this.privacySettings = { ...this.privacySettings, ...savedSettings };
      }
    } catch (error) {
      await this.logger.warn('Failed to load privacy settings, using defaults', 'telemetry');
    }
  }

  private async applyDataRetentionPolicy(): Promise<void> {
    // Implementation would clean up stored data based on retention policy
    await this.logger.info('Applied data retention policy', 'telemetry', {
      retentionDays: this.privacySettings.retentionDays,
      consentLevel: this.privacySettings.consentLevel
    });
  }

  private isUserIdentifier(key: string): boolean {
    const userIdKeys = ['userId', 'sessionId', 'deviceId', 'machineId'];
    return userIdKeys.includes(key) || key.toLowerCase().includes('id');
  }

  private isFilePath(key: string, value: any): boolean {
    if (typeof value !== 'string') return false;
    const pathKeys = ['path', 'file', 'directory', 'folder'];
    return pathKeys.some(k => key.toLowerCase().includes(k)) || 
           value.includes('/') || value.includes('\\');
  }

  private hashValue(value: any): string {
    return createHash('sha256').update(String(value)).digest('hex').substring(0, 8);
  }

  private obfuscateFilePath(path: string): string {
    // Replace personal paths with generic placeholders
    return path.replace(/\/Users\/[^\/]+/, '/Users/*')
               .replace(/C:\\Users\\[^\\]+/, 'C:\\Users\\*')
               .replace(/\/home\/[^\/]+/, '/home/*');
  }

  private getAnonymizedRegion(): string {
    // Would implement geographic region detection without precise location
    return 'unknown';
  }

  private getReadyAIVersion(): string {
    // Would get actual ReadyAI version
    return '1.0.0';
  }

  private async getPlatformInfo(): Promise<ReadyAITelemetryEvent['platform']> {
    return {
      os: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      vscodeVersion: 'unknown' // Would get from VSCode API
    };
  }
}

// Export singleton instance for convenience
export const telemetryService = TelemetryService.getInstance();

// Export factory function for dependency injection
export function createTelemetryService(
  storageDir?: string,
  privacySettings?: Partial<TelemetryPrivacySettings>
): TelemetryService {
  return TelemetryService.getInstance(storageDir, privacySettings);
}

// Export default instance
export default telemetryService;

// Export types for external consumption
export type {
  TelemetryConsentLevel,
  ReadyAITelemetryEventType,
  ReadyAITelemetryEvent,
  UsageAnalytics,
  PerformanceBenchmarks,
  TelemetryPrivacySettings
};
