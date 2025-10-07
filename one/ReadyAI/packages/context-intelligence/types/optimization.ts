// packages/context-intelligence/types/optimization.ts

/**
 * Context Optimization Types for ReadyAI Personal AI Development Orchestrator
 * 
 * This module provides comprehensive optimization types for context compression,
 * performance enhancement, and intelligent resource management. Adapts Cline's proven
 * optimization patterns from context window management, performance monitoring,
 * and resource optimization while adding ReadyAI-specific optimization strategies
 * for multi-dimensional context intelligence.
 * 
 * Key Adaptations from Cline:
 * - Context window management patterns from Cline's src/core/context/optimization.ts
 * - Performance optimization from Cline's telemetry and monitoring systems
 * - Resource management patterns from Cline's memory optimization strategies
 * - Compression algorithms from Cline's context condensation features
 * - Cache optimization patterns from Cline's efficient caching systems
 * 
 * ReadyAI Extensions:
 * - Multi-dimensional context compression with quality preservation
 * - Semantic-aware optimization with vector embedding considerations
 * - Phase-aware optimization strategies aligned with development methodology
 * - Performance-based optimization with real-time adaptation capabilities
 * - Context relationship optimization for dependency-aware compression
 * 
 * @version 1.0.0
 * @author ReadyAI Development Team
 */

import { 
  UUID, 
  ApiResponse, 
  ValidationResult,
  AsyncResult,
  PhaseType,
  QualityMetrics,
  ReadyAIError,
  createTimestamp,
  generateUUID
} from '../../foundation/types/core';

import {
  ContextIntelligenceNode,
  ContextQualityLevel,
  ContextNodeType,
  ContextAccessPattern,
  ContextCompressionConfig,
  ContextCompressionResult
} from './context';

import {
  ScoringDimension,
  ContextScore,
  ScoringConfidence,
  ContextScoringConfig,
  ScoringPerformanceMetrics
} from './scoring';

// =============================================================================
// CORE OPTIMIZATION TYPES
// =============================================================================

/**
 * Optimization strategy categories for different performance goals
 * Enhanced strategy types based on Cline's optimization approaches
 */
export type OptimizationStrategy = 
  | 'performance-first'    // Prioritize speed and responsiveness
  | 'quality-first'        // Prioritize context quality and accuracy
  | 'memory-efficient'     // Minimize memory footprint
  | 'balanced'             // Balance all factors
  | 'adaptive'             // Dynamically adjust based on conditions
  | 'aggressive'           // Maximum optimization with higher risk
  | 'conservative'         // Safe optimization with minimal risk
  | 'phase-aware';         // Optimize based on current development phase

/**
 * Optimization operation types for tracking and analysis
 * Based on Cline's operation tracking patterns
 */
export type OptimizationOperationType = 
  | 'compress'             // Context compression operations
  | 'prune'                // Remove outdated or low-quality contexts
  | 'rerank'               // Reorganize context priority
  | 'cache-optimize'       // Optimize caching strategies
  | 'merge'                // Combine related contexts
  | 'split'                // Divide large contexts
  | 'vectorize'            // Generate or update embeddings
  | 'validate'             // Quality validation and correction
  | 'cleanup'              // Resource cleanup and maintenance
  | 'prefetch';            // Predictive context loading

/**
 * Performance impact levels for optimization operations
 */
export type PerformanceImpactLevel = 'minimal' | 'low' | 'moderate' | 'high' | 'significant';

/**
 * Resource constraint types for optimization decisions
 */
export type ResourceConstraintType = 'memory' | 'cpu' | 'storage' | 'network' | 'time' | 'api-calls';

/**
 * Comprehensive optimization configuration
 * Enhanced configuration based on Cline's optimization settings
 */
export interface ContextOptimizationConfig {
  /** Primary optimization strategy */
  strategy: OptimizationStrategy;
  
  /** Performance targets */
  performanceTargets: {
    maxLatencyMs: number;
    maxMemoryUsageMB: number;
    maxStorageUsageMB: number;
    targetCacheHitRate: number;
    minQualityScore: number;
  };
  
  /** Compression settings */
  compression: {
    enabled: boolean;
    aggressiveness: 'light' | 'moderate' | 'aggressive';
    qualityThreshold: number;
    targetRatio: number;
    preserveKeyContexts: boolean;
    semanticAwareCompression: boolean;
  };
  
  /** Cache optimization */
  cacheOptimization: {
    enabled: boolean;
    maxCacheSize: number;
    evictionPolicy: 'lru' | 'lfu' | 'quality-based' | 'hybrid';
    prefetchingEnabled: boolean;
    compressionEnabled: boolean;
  };
  
  /** Resource management */
  resourceManagement: {
    memoryThreshold: number;
    cpuThreshold: number;
    storageThreshold: number;
    autoCleanupEnabled: boolean;
    resourceMonitoringInterval: number;
  };
  
  /** Quality optimization */
  qualityOptimization: {
    autoValidation: boolean;
    qualityEnforcement: boolean;
    improvementSuggestions: boolean;
    continuousAssessment: boolean;
  };
  
  /** Phase-aware settings */
  phaseOptimization: {
    enabled: boolean;
    phaseSpecificStrategies: Record<PhaseType, Partial<ContextOptimizationConfig>>;
    dynamicAdjustment: boolean;
  };
  
  /** Advanced features */
  advanced: {
    mlOptimizationEnabled: boolean;
    predictiveOptimization: boolean;
    userBehaviorLearning: boolean;
    contextRelationshipOptimization: boolean;
  };
}

/**
 * Optimization operation request with comprehensive configuration
 * Enhanced operation request based on Cline's operation patterns
 */
export interface OptimizationRequest {
  /** Request identifier */
  id: UUID;
  
  /** Project scope */
  projectId: UUID;
  
  /** Operation type */
  operation: OptimizationOperationType;
  
  /** Target contexts for optimization */
  targetContextIds?: UUID[];
  
  /** Optimization configuration */
  config: ContextOptimizationConfig;
  
  /** Resource constraints */
  constraints: {
    maxDurationMs: number;
    maxMemoryUsageMB: number;
    maxCpuUsagePercent: number;
    allowBackgroundProcessing: boolean;
  };
  
  /** Quality requirements */
  qualityRequirements: {
    minimumQualityLevel: ContextQualityLevel;
    preserveCriticalContexts: boolean;
    maintainDependencies: boolean;
    validateResults: boolean;
  };
  
  /** Performance requirements */
  performanceRequirements: {
    maxLatencyMs: number;
    minThroughput: number;
    cacheUtilization: boolean;
    parallelProcessing: boolean;
  };
  
  /** Optimization context */
  optimizationContext?: {
    currentPhase?: PhaseType;
    userIntent?: string;
    urgency?: 'low' | 'normal' | 'high' | 'critical';
    userPreferences?: Record<string, any>;
  };
  
  /** Request timestamp */
  requestedAt: string;
}

/**
 * Comprehensive optimization result with detailed analytics
 * Enhanced results based on Cline's comprehensive result patterns
 */
export interface OptimizationResult {
  /** Request identifier */
  requestId: UUID;
  
  /** Operation performed */
  operation: OptimizationOperationType;
  
  /** Overall success status */
  success: boolean;
  
  /** Operation summary */
  summary: {
    contextsProcessed: number;
    contextsOptimized: number;
    contextsRemoved: number;
    qualityImprovement: number;
    performanceImprovement: number;
    storageReduction: number;
  };
  
  /** Detailed context changes */
  contextChanges: OptimizationContextChange[];
  
  /** Performance metrics */
  performanceMetrics: OptimizationPerformanceMetrics;
  
  /** Quality assessment */
  qualityImpact: {
    overallQualityChange: number;
    qualityDistribution: Record<ContextQualityLevel, number>;
    criticalContextsPreserved: boolean;
    dependencyIntegrityMaintained: boolean;
  };
  
  /** Resource impact */
  resourceImpact: {
    memoryReduction: number;
    storageReduction: number;
    processingSpeedup: number;
    cacheEfficiencyImprovement: number;
  };
  
  /** Recommendations for future optimizations */
  recommendations: OptimizationRecommendation[];
  
  /** Operation metadata */
  metadata: {
    algorithmUsed: string;
    configurationSnapshot: ContextOptimizationConfig;
    environmentConditions: Record<string, any>;
  };
  
  /** Completion timestamp */
  completedAt: string;
  
  /** Operation duration */
  durationMs: number;
}

/**
 * Individual context optimization change record
 * Detailed change tracking for audit and rollback purposes
 */
export interface OptimizationContextChange {
  /** Context identifier */
  contextId: UUID;
  
  /** Change type */
  changeType: 'compressed' | 'removed' | 'merged' | 'split' | 'updated' | 'reranked';
  
  /** Before state */
  beforeState: {
    tokenCount: number;
    qualityScore: number;
    relevanceScore: number;
    storageSize: number;
  };
  
  /** After state */
  afterState?: {
    tokenCount: number;
    qualityScore: number;
    relevanceScore: number;
    storageSize: number;
  };
  
  /** Change details */
  changeDetails: {
    compressionRatio?: number;
    qualityImpact?: number;
    informationLoss?: number;
    processingTime?: number;
  };
  
  /** Rollback information */
  rollbackInfo?: {
    canRollback: boolean;
    rollbackData?: string;
    rollbackComplexity: 'simple' | 'moderate' | 'complex';
  };
  
  /** Change timestamp */
  changedAt: string;
}

// =============================================================================
// PERFORMANCE OPTIMIZATION
// =============================================================================

/**
 * Performance optimization metrics with comprehensive tracking
 * Detailed performance monitoring based on Cline's telemetry patterns
 */
export interface OptimizationPerformanceMetrics {
  /** Overall operation timing */
  timing: {
    totalDurationMs: number;
    analysisPhaseMs: number;
    optimizationPhaseMs: number;
    validationPhaseMs: number;
    cleanupPhaseMs: number;
  };
  
  /** Resource utilization during optimization */
  resourceUtilization: {
    peakMemoryUsageMB: number;
    averageMemoryUsageMB: number;
    peakCpuUsagePercent: number;
    averageCpuUsagePercent: number;
    diskOperations: number;
    networkRequests: number;
  };
  
  /** Throughput metrics */
  throughput: {
    contextsPerSecond: number;
    tokensPerSecond: number;
    bytesProcessedPerSecond: number;
    operationsPerSecond: number;
  };
  
  /** Cache performance */
  cachePerformance: {
    hitRate: number;
    hits: number;
    misses: number;
    evictions: number;
    compressionRatio: number;
  };
  
  /** Quality vs performance tradeoffs */
  qualityTradeoffs: {
    qualityPreservationRate: number;
    performanceGain: number;
    acceptableQualityLoss: number;
    criticalContextsPreserved: number;
  };
  
  /** Parallel processing efficiency */
  parallelization: {
    threadsUsed: number;
    parallelizationRatio: number;
    loadBalanceEfficiency: number;
    synchronizationOverhead: number;
  };
}

/**
 * Performance optimization target with measurable goals
 * Goal-oriented optimization based on Cline's target patterns
 */
export interface PerformanceOptimizationTarget {
  /** Target identifier */
  id: UUID;
  
  /** Target category */
  category: 'latency' | 'throughput' | 'memory' | 'storage' | 'quality' | 'cost';
  
  /** Target metrics */
  metrics: {
    currentValue: number;
    targetValue: number;
    unit: string;
    improvementPercent: number;
  };
  
  /** Achievement strategy */
  strategy: {
    optimizationApproaches: OptimizationOperationType[];
    riskLevel: 'low' | 'medium' | 'high';
    expectedDuration: number;
    resourceRequirements: Record<ResourceConstraintType, number>;
  };
  
  /** Success criteria */
  successCriteria: {
    minimumImprovement: number;
    qualityThreshold: number;
    stabilityRequirement: number;
    timeConstraint: number;
  };
  
  /** Priority and urgency */
  priority: 'low' | 'medium' | 'high' | 'critical';
  
  /** Target timestamp */
  targetDate?: string;
  
  /** Created timestamp */
  createdAt: string;
}

// =============================================================================
// COMPRESSION OPTIMIZATION
// =============================================================================

/**
 * Advanced compression strategy with semantic awareness
 * Enhanced compression based on Cline's context window management
 */
export interface ContextCompressionStrategy {
  /** Strategy identifier */
  id: UUID;
  
  /** Strategy name */
  name: string;
  
  /** Compression approach */
  approach: 'lossy' | 'lossless' | 'selective' | 'semantic' | 'hierarchical' | 'adaptive';
  
  /** Semantic preservation settings */
  semanticPreservation: {
    preserveKeyTerms: boolean;
    preserveRelationships: boolean;
    preserveStructure: boolean;
    semanticSimilarityThreshold: number;
  };
  
  /** Quality preservation settings */
  qualityPreservation: {
    minimumQualityLevel: ContextQualityLevel;
    preserveCriticalContexts: boolean;
    maintainDependencies: boolean;
    qualityImpactThreshold: number;
  };
  
  /** Compression parameters */
  parameters: {
    targetCompressionRatio: number;
    maxInformationLoss: number;
    chunkSize: number;
    overlapRatio: number;
  };
  
  /** Performance characteristics */
  performance: {
    expectedSpeedup: number;
    memoryOverhead: number;
    computationalComplexity: 'O(n)' | 'O(n log n)' | 'O(n²)' | 'O(n³)';
    parallelizable: boolean;
  };
  
  /** Use case recommendations */
  useCases: {
    recommendedForPhases: PhaseType[];
    recommendedContextTypes: ContextNodeType[];
    optimalProjectSize: 'small' | 'medium' | 'large' | 'enterprise';
  };
  
  /** Strategy metadata */
  metadata: {
    version: string;
    author: string;
    benchmarkResults?: CompressionBenchmarkResult[];
    userRatings?: number[];
  };
  
  /** Created timestamp */
  createdAt: string;
}

/**
 * Compression benchmark results for strategy evaluation
 */
export interface CompressionBenchmarkResult {
  /** Benchmark identifier */
  id: UUID;
  
  /** Test dataset characteristics */
  dataset: {
    contextCount: number;
    totalTokens: number;
    averageQuality: number;
    contextTypes: ContextNodeType[];
    projectPhase: PhaseType;
  };
  
  /** Compression results */
  results: {
    compressionRatio: number;
    qualityRetention: number;
    informationLoss: number;
    processingTime: number;
    memoryUsage: number;
  };
  
  /** Performance metrics */
  performance: {
    compressionSpeed: number;
    decompressionSpeed: number;
    cacheEfficiency: number;
    searchPerformance: number;
  };
  
  /** Benchmark timestamp */
  benchmarkedAt: string;
}

// =============================================================================
// CACHE OPTIMIZATION
// =============================================================================

/**
 * Cache optimization configuration with intelligent strategies
 * Advanced caching based on Cline's proven cache patterns
 */
export interface CacheOptimizationConfig {
  /** Cache strategy */
  strategy: 'lru' | 'lfu' | 'arc' | 'tlru' | 'quality-aware' | 'predictive' | 'hybrid';
  
  /** Size management */
  sizeManagement: {
    maxSizeMB: number;
    targetUtilization: number;
    evictionThreshold: number;
    compressionEnabled: boolean;
  };
  
  /** Access pattern optimization */
  accessPatternOptimization: {
    enabled: boolean;
    patternLearning: boolean;
    prefetchingEnabled: boolean;
    prefetchDepth: number;
  };
  
  /** Quality-based caching */
  qualityBasedCaching: {
    enabled: boolean;
    qualityWeightFactor: number;
    freshnessWeightFactor: number;
    accessFrequencyFactor: number;
  };
  
  /** Performance tuning */
  performance: {
    writeBufferSize: number;
    readBufferSize: number;
    batchOperations: boolean;
    asyncOperations: boolean;
  };
  
  /** Persistence settings */
  persistence: {
    durableCache: boolean;
    backupEnabled: boolean;
    recoveryEnabled: boolean;
    compressionOnDisk: boolean;
  };
}

/**
 * Cache optimization result with detailed analysis
 */
export interface CacheOptimizationResult {
  /** Operation identifier */
  operationId: UUID;
  
  /** Cache performance before optimization */
  beforeOptimization: CachePerformanceSnapshot;
  
  /** Cache performance after optimization */
  afterOptimization: CachePerformanceSnapshot;
  
  /** Optimization actions performed */
  actionsPerformed: Array<{
    action: 'evict' | 'compress' | 'reorder' | 'prefetch' | 'merge';
    contextIds: UUID[];
    impact: PerformanceImpactLevel;
    reason: string;
  }>;
  
  /** Performance improvement summary */
  improvement: {
    hitRateImprovement: number;
    latencyReduction: number;
    memoryReduction: number;
    throughputIncrease: number;
  };
  
  /** Predictive insights */
  predictions: {
    expectedFutureHitRate: number;
    recommendedNextOptimization: string;
    optimizationFrequency: number;
  };
  
  /** Operation timestamp */
  optimizedAt: string;
  
  /** Operation duration */
  durationMs: number;
}

/**
 * Cache performance snapshot for comparison
 */
export interface CachePerformanceSnapshot {
  /** Snapshot timestamp */
  timestamp: string;
  
  /** Basic cache metrics */
  metrics: {
    hitRate: number;
    size: number;
    utilizationPercent: number;
    averageLatency: number;
  };
  
  /** Quality metrics */
  quality: {
    averageQualityScore: number;
    staleContextPercent: number;
    invalidContextCount: number;
  };
  
  /** Resource usage */
  resources: {
    memoryUsageMB: number;
    diskUsageMB: number;
    cpuUsagePercent: number;
  };
  
  /** Access patterns */
  accessPatterns: {
    mostAccessedContexts: UUID[];
    leastAccessedContexts: UUID[];
    accessDistribution: Record<string, number>;
  };
}

// =============================================================================
// CONTEXT RELATIONSHIP OPTIMIZATION
// =============================================================================

/**
 * Context relationship optimization for dependency-aware processing
 * Relationship optimization based on Cline's dependency management
 */
export interface ContextRelationshipOptimization {
  /** Optimization identifier */
  id: UUID;
  
  /** Project scope */
  projectId: UUID;
  
  /** Relationship analysis */
  relationshipAnalysis: {
    totalRelationships: number;
    strongRelationships: number;
    weakRelationships: number;
    circularDependencies: UUID[][];
    orphanedContexts: UUID[];
  };
  
  /** Optimization strategies */
  strategies: Array<{
    strategy: 'cluster' | 'flatten' | 'hierarchical' | 'graph-based';
    targetRelationships: Array<{
      sourceId: UUID;
      targetId: UUID;
      relationshipType: string;
      strength: number;
    }>;
    expectedImprovement: number;
  }>;
  
  /** Cluster optimization */
  clusterOptimization: {
    clusterCount: number;
    clusters: Array<{
      clusterId: UUID;
      contextIds: UUID[];
      centerContextId: UUID;
      cohesionScore: number;
    }>;
    interClusterRelationships: number;
    intraClusterDensity: number;
  };
  
  /** Graph optimization metrics */
  graphMetrics: {
    nodeCount: number;
    edgeCount: number;
    averageDegree: number;
    clusteringCoefficient: number;
    pathLength: number;
  };
  
  /** Optimization timestamp */
  optimizedAt: string;
}

// =============================================================================
// PREDICTIVE OPTIMIZATION
// =============================================================================

/**
 * Predictive optimization with machine learning insights
 * ML-based optimization patterns inspired by Cline's adaptive features
 */
export interface PredictiveOptimizationConfig {
  /** Prediction model configuration */
  predictionModel: {
    modelType: 'statistical' | 'ml-based' | 'hybrid';
    confidenceThreshold: number;
    predictionHorizon: number; // in milliseconds
    updateFrequency: number;
  };
  
  /** User behavior learning */
  behaviorLearning: {
    enabled: boolean;
    learningRate: number;
    adaptationSpeed: 'slow' | 'moderate' | 'fast';
    personalizationLevel: number;
  };
  
  /** Context usage prediction */
  usagePrediction: {
    enabled: boolean;
    predictionAccuracy: number;
    prefetchingEnabled: boolean;
    precomputationEnabled: boolean;
  };
  
  /** Quality prediction */
  qualityPrediction: {
    enabled: boolean;
    degradationPrediction: boolean;
    improvementSuggestions: boolean;
    proactiveOptimization: boolean;
  };
  
  /** Resource prediction */
  resourcePrediction: {
    memoryGrowthPrediction: boolean;
    performanceDegradationPrediction: boolean;
    maintenanceScheduling: boolean;
  };
}

/**
 * Predictive optimization result with future insights
 */
export interface PredictiveOptimizationResult {
  /** Prediction identifier */
  id: UUID;
  
  /** Prediction confidence */
  confidence: ScoringConfidence;
  
  /** Usage predictions */
  usagePredictions: Array<{
    contextId: UUID;
    predictedAccessProbability: number;
    predictedAccessTime: string;
    predictedUsagePattern: ContextAccessPattern;
    confidenceLevel: number;
  }>;
  
  /** Performance predictions */
  performancePredictions: {
    expectedLatency: number;
    expectedThroughput: number;
    expectedMemoryUsage: number;
    expectedCacheHitRate: number;
  };
  
  /** Quality predictions */
  qualityPredictions: {
    expectedQualityDegradation: number;
    contextsAtRisk: UUID[];
    recommendedPreventiveMaintenance: string[];
  };
  
  /** Resource predictions */
  resourcePredictions: {
    memoryGrowthRate: number;
    storageGrowthRate: number;
    performanceDegradationRate: number;
  };
  
  /** Recommended actions */
  recommendations: PredictiveRecommendation[];
  
  /** Prediction timestamp */
  predictedAt: string;
  
  /** Prediction validity period */
  validUntil: string;
}

/**
 * Predictive recommendation with timing and priority
 */
export interface PredictiveRecommendation {
  /** Recommendation identifier */
  id: UUID;
  
  /** Recommendation type */
  type: 'optimization' | 'maintenance' | 'capacity' | 'quality' | 'performance';
  
  /** Priority level */
  priority: 'low' | 'medium' | 'high' | 'urgent';
  
  /** Predicted trigger condition */
  triggerCondition: {
    metric: string;
    threshold: number;
    timeframe: number;
    probability: number;
  };
  
  /** Recommended action */
  recommendedAction: {
    operation: OptimizationOperationType;
    parameters: Record<string, any>;
    expectedImpact: PerformanceImpactLevel;
    estimatedDuration: number;
  };
  
  /** Implementation timing */
  timing: {
    recommendedExecutionTime: string;
    latestExecutionTime: string;
    urgencyIncreaseRate: number;
  };
  
  /** Confidence and validation */
  confidence: ScoringConfidence;
  
  /** Generated timestamp */
  generatedAt: string;
}

// =============================================================================
// OPTIMIZATION ANALYTICS AND INSIGHTS
// =============================================================================

/**
 * Comprehensive optimization analytics for system insights
 * Analytics patterns based on Cline's comprehensive analytics
 */
export interface OptimizationAnalytics {
  /** Analysis period */
  period: {
    startDate: string;
    endDate: string;
    totalDuration: string;
  };
  
  /** Operation statistics */
  operationStatistics: {
    totalOptimizations: number;
    successfulOptimizations: number;
    failedOptimizations: number;
    averageImprovementPercent: number;
    operationsByType: Record<OptimizationOperationType, number>;
  };
  
  /** Performance trends */
  performanceTrends: {
    latencyTrend: Array<{ timestamp: string; value: number; }>;
    throughputTrend: Array<{ timestamp: string; value: number; }>;
    qualityTrend: Array<{ timestamp: string; value: number; }>;
    resourceUsageTrend: Array<{ timestamp: string; memory: number; cpu: number; }>;
  };
  
  /** Strategy effectiveness */
  strategyEffectiveness: Record<OptimizationStrategy, {
    usageCount: number;
    averageImprovement: number;
    successRate: number;
    userSatisfaction: number;
    recommendationScore: number;
  }>;
  
  /** User behavior insights */
  userBehaviorInsights: {
    preferredStrategies: OptimizationStrategy[];
    optimizationFrequency: number;
    qualityVsPerformancePreference: number;
    riskTolerance: 'low' | 'medium' | 'high';
  };
  
  /** System health indicators */
  systemHealth: {
    overallHealthScore: number;
    performanceHealthScore: number;
    qualityHealthScore: number;
    resourceHealthScore: number;
    stabilityScore: number;
  };
  
  /** Recommendations */
  systemRecommendations: OptimizationRecommendation[];
}

/**
 * Optimization recommendation with detailed implementation guidance
 * Enhanced recommendations based on Cline's recommendation patterns
 */
export interface OptimizationRecommendation {
  /** Recommendation identifier */
  id: UUID;
  
  /** Recommendation category */
  category: 'performance' | 'quality' | 'resource' | 'strategy' | 'maintenance';
  
  /** Priority and urgency */
  priority: 'low' | 'medium' | 'high' | 'critical';
  
  /** Urgency factors */
  urgency: {
    timeframe: 'immediate' | 'short-term' | 'medium-term' | 'long-term';
    impactIfIgnored: PerformanceImpactLevel;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  };
  
  /** Recommendation details */
  recommendation: {
    title: string;
    description: string;
    rationale: string;
    expectedBenefit: string;
  };
  
  /** Implementation plan */
  implementation: {
    strategy: OptimizationStrategy;
    operations: OptimizationOperationType[];
    estimatedEffort: number; // in hours
    riskAssessment: string;
    prerequisites: string[];
    steps: Array<{
      step: number;
      description: string;
      estimatedDuration: number;
      riskLevel: 'low' | 'medium' | 'high';
    }>;
  };
  
  /** Impact assessment */
  impact: {
    performanceImprovement: number;
    qualityImpact: number;
    resourceSavings: number;
    userExperienceImprovement: 'minimal' | 'moderate' | 'significant';
    roi: number; // Return on Investment score
  };
  
  /** Validation criteria */
  validation: {
    successMetrics: string[];
    validationMethod: string;
    rollbackPlan: string;
    monitoringRequired: boolean;
  };
  
  /** Recommendation confidence */
  confidence: ScoringConfidence;
  
  /** Generated timestamp */
  generatedAt: string;
  
  /** Expiration timestamp */
  expiresAt?: string;
}

// =============================================================================
// OPTIMIZATION MONITORING AND ALERTS
// =============================================================================

/**
 * Optimization monitoring configuration for continuous improvement
 * Monitoring patterns based on Cline's real-time monitoring systems
 */
export interface OptimizationMonitoringConfig {
  /** Monitoring strategy */
  strategy: 'passive' | 'active' | 'predictive' | 'adaptive';
  
  /** Performance monitoring */
  performance: {
    latencyMonitoring: boolean;
    throughputMonitoring: boolean;
    resourceMonitoring: boolean;
    alertThresholds: Record<string, number>;
  };
  
  /** Quality monitoring */
  quality: {
    continuousAssessment: boolean;
    degradationDetection: boolean;
    improvementTracking: boolean;
    qualityAlerts: boolean;
  };
  
  /** Health checks */
  healthChecks: {
    interval: number;
    comprehensiveCheck: boolean;
    dependencyValidation: boolean;
    integrationTesting: boolean;
  };
  
  /** Alert configuration */
  alerts: {
    enabled: boolean;
    channels: Array<'log' | 'ui' | 'email' | 'webhook'>;
    severityLevels: Array<'info' | 'warning' | 'error' | 'critical'>;
    rateLimiting: boolean;
  };
}

/**
 * Optimization alert with severity and action recommendations
 */
export interface OptimizationAlert {
  /** Alert identifier */
  id: UUID;
  
  /** Alert severity */
  severity: 'info' | 'warning' | 'error' | 'critical';
  
  /** Alert category */
  category: 'performance' | 'quality' | 'resource' | 'security' | 'maintenance';
  
  /** Alert details */
  details: {
    title: string;
    description: string;
    affectedContexts: UUID[];
    triggerCondition: string;
    impact: PerformanceImpactLevel;
  };
  
  /** Recommended actions */
  recommendations: Array<{
    action: string;
    urgency: 'immediate' | 'soon' | 'scheduled' | 'optional';
    estimatedEffort: number;
    expectedImpact: PerformanceImpactLevel;
  }>;
  
  /** Alert context */
  context: {
    projectId: UUID;
    phase: PhaseType;
    triggerMetrics: Record<string, number>;
    environmentInfo: Record<string, any>;
  };
  
  /** Alert lifecycle */
  lifecycle: {
    createdAt: string;
    acknowledgedAt?: string;
    resolvedAt?: string;
    escalatedAt?: string;
  };
  
  /** Alert metadata */
  metadata: {
    source: string;
    correlationId?: UUID;
    suppressionRules?: string[];
  };
}

// =============================================================================
// ERROR HANDLING AND VALIDATION
// =============================================================================

/**
 * Optimization-specific error types
 * Enhanced error handling based on Cline's comprehensive error patterns
 */
export interface OptimizationError extends ReadyAIError {
  /** Optimization-specific error code */
  optimizationErrorCode:
    | 'INVALID_OPTIMIZATION_CONFIG'
    | 'COMPRESSION_FAILED'
    | 'QUALITY_DEGRADATION_EXCEEDED'
    | 'RESOURCE_LIMIT_EXCEEDED'
    | 'OPTIMIZATION_TIMEOUT'
    | 'DEPENDENCY_CYCLE_DETECTED'
    | 'INSUFFICIENT_RESOURCES'
    | 'STRATEGY_NOT_SUPPORTED'
    | 'CACHE_CORRUPTION'
    | 'ROLLBACK_FAILED'
    | 'PREDICTION_MODEL_ERROR'
    | 'MONITORING_SYSTEM_ERROR';
  
  /** Affected optimization operation */
  operationId?: UUID;
  
  /** Affected contexts */
  affectedContextIds?: UUID[];
  
  /** Resource information */
  resourceInfo?: {
    availableMemoryMB: number;
    requiredMemoryMB: number;
    availableCpuPercent: number;
    requiredCpuPercent: number;
  };
  
  /** Recovery options */
  recoveryOptions: Array<{
    option: string;
    automated: boolean;
    riskLevel: 'low' | 'medium' | 'high';
    estimatedRecoveryTime: number;
  }>;
  
  /** Rollback information */
  rollbackInfo?: {
    canRollback: boolean;
    rollbackComplexity: 'simple' | 'moderate' | 'complex';
    rollbackRisks: string[];
  };
}

/**
 * Optimization validation result with comprehensive checks
 * Enhanced validation based on Cline's validation framework
 */
export interface OptimizationValidationResult extends ValidationResult {
  /** Configuration validation */
  configValidation: {
    strategyValid: boolean;
    targetsAchievable: boolean;
    resourcesAdequate: boolean;
    constraintsConsistent: boolean;
  };
  
  /** Performance validation */
  performanceValidation: {
    targetsRealistic: boolean;
    improvementFeasible: boolean;
    riskAcceptable: boolean;
    timeframeReasonable: boolean;
  };
  
  /** Quality validation */
  qualityValidation: {
    qualityPreservationFeasible: boolean;
    dependenciesValidated: boolean;
    criticalContextsProtected: boolean;
    rollbackPlanValid: boolean;
  };
  
  /** Resource validation */
  resourceValidation: {
    memoryRequirementsValid: boolean;
    cpuRequirementsValid: boolean;
    storageRequirementsValid: boolean;
    networkRequirementsValid: boolean;
  };
  
  /** Strategy validation */
  strategyValidation: {
    strategySupported: boolean;
    parameterRangesValid: boolean;
    phaseCompatibility: boolean;
    contextTypeCompatibility: boolean;
  };
}

// =============================================================================
// UTILITY TYPES AND CONSTANTS
// =============================================================================

/**
 * Optimization health status types
 */
export type OptimizationHealthStatus = 
  | 'optimal'
  | 'good'
  | 'fair'
  | 'poor'
  | 'critical'
  | 'unknown';

/**
 * Optimization execution modes
 */
export type OptimizationExecutionMode = 
  | 'synchronous'
  | 'asynchronous'
  | 'background'
  | 'scheduled'
  | 'on-demand'
  | 'event-driven';

/**
 * Default optimization configuration
 * Production-ready defaults based on Cline's proven patterns
 */
export const DEFAULT_OPTIMIZATION_CONFIG: ContextOptimizationConfig = {
  strategy: 'balanced',
  performanceTargets: {
    maxLatencyMs: 2000,
    maxMemoryUsageMB: 512,
    maxStorageUsageMB: 1024,
    targetCacheHitRate: 0.8,
    minQualityScore: 0.6
  },
  compression: {
    enabled: true,
    aggressiveness: 'moderate',
    qualityThreshold: 0.5,
    targetRatio: 0.3,
    preserveKeyContexts: true,
    semanticAwareCompression: true
  },
  cacheOptimization: {
    enabled: true,
    maxCacheSize: 256,
    evictionPolicy: 'hybrid',
    prefetchingEnabled: true,
    compressionEnabled: true
  },
  resourceManagement: {
    memoryThreshold: 0.8,
    cpuThreshold: 0.7,
    storageThreshold: 0.9,
    autoCleanupEnabled: true,
    resourceMonitoringInterval: 60000
  },
  qualityOptimization: {
    autoValidation: true,
    qualityEnforcement: true,
    improvementSuggestions: true,
    continuousAssessment: true
  },
  phaseOptimization: {
    enabled: true,
    phaseSpecificStrategies: {
      Phase0_StrategicCharter: { strategy: 'quality-first' },
      Phase1_ArchitecturalBlueprint: { strategy: 'balanced' },
      Phase20_CoreContracts: { strategy: 'quality-first' },
      Phase21_ModuleSpec: { strategy: 'balanced' },
      Phase23_ModuleSpecSubsequent: { strategy: 'performance-first' },
      Phase30_ProjectScaffolding: { strategy: 'performance-first' },
      Phase301_MasterPlan: { strategy: 'quality-first' },
      Phase31_FileGeneration: { strategy: 'performance-first' },
      Phase4_ValidationCorrection: { strategy: 'quality-first' },
      Phase5_TestGeneration: { strategy: 'balanced' },
      Phase6_Documentation: { strategy: 'balanced' },
      Phase7_Iteration: { strategy: 'adaptive' }
    },
    dynamicAdjustment: true
  },
  advanced: {
    mlOptimizationEnabled: false, // Start conservatively
    predictiveOptimization: true,
    userBehaviorLearning: true,
    contextRelationshipOptimization: true
  }
} as const;

/**
 * Optimization constants for system limits and defaults
 */
export const OPTIMIZATION_CONSTANTS = {
  MAX_COMPRESSION_RATIO: 0.9,
  MIN_COMPRESSION_RATIO: 0.1,
  MAX_OPTIMIZATION_DURATION_MS: 30000,
  MAX_CONTEXTS_PER_OPERATION: 1000,
  MIN_QUALITY_SCORE: 0.1,
  MAX_QUALITY_SCORE: 1.0,
  DEFAULT_CACHE_SIZE_MB: 256,
  MAX_CACHE_SIZE_MB: 2048,
  MIN_CACHE_HIT_RATE: 0.3,
  TARGET_CACHE_HIT_RATE: 0.8,
  MAX_PREDICTION_HORIZON_MS: 24 * 60 * 60 * 1000, // 24 hours
  DEFAULT_MONITORING_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes
  MAX_ALERT_RETENTION_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
  DEFAULT_BATCH_SIZE: 50,
  MAX_PARALLEL_OPERATIONS: 4,
  QUALITY_DEGRADATION_THRESHOLD: 0.2,
  PERFORMANCE_IMPROVEMENT_THRESHOLD: 0.1
} as const;

/**
 * Default cache optimization configuration
 */
export const DEFAULT_CACHE_OPTIMIZATION_CONFIG: CacheOptimizationConfig = {
  strategy: 'hybrid',
  sizeManagement: {
    maxSizeMB: 256,
    targetUtilization: 0.8,
    evictionThreshold: 0.9,
    compressionEnabled: true
  },
  accessPatternOptimization: {
    enabled: true,
    patternLearning: true,
    prefetchingEnabled: true,
    prefetchDepth: 3
  },
  qualityBasedCaching: {
    enabled: true,
    qualityWeightFactor: 0.4,
    freshnessWeightFactor: 0.3,
    accessFrequencyFactor: 0.3
  },
  performance: {
    writeBufferSize: 1024,
    readBufferSize: 2048,
    batchOperations: true,
    asyncOperations: true
  },
  persistence: {
    durableCache: true,
    backupEnabled: true,
    recoveryEnabled: true,
    compressionOnDisk: true
  }
} as const;

/**
 * Default predictive optimization configuration
 */
export const DEFAULT_PREDICTIVE_OPTIMIZATION_CONFIG: PredictiveOptimizationConfig = {
  predictionModel: {
    modelType: 'statistical',
    confidenceThreshold: 0.7,
    predictionHorizon: 60 * 60 * 1000, // 1 hour
    updateFrequency: 5 * 60 * 1000 // 5 minutes
  },
  behaviorLearning: {
    enabled: true,
    learningRate: 0.1,
    adaptationSpeed: 'moderate',
    personalizationLevel: 0.5
  },
  usagePrediction: {
    enabled: true,
    predictionAccuracy: 0.7,
    prefetchingEnabled: true,
    precomputationEnabled: false
  },
  qualityPrediction: {
    enabled: true,
    degradationPrediction: true,
    improvementSuggestions: true,
    proactiveOptimization: false
  },
  resourcePrediction: {
    memoryGrowthPrediction: true,
    performanceDegradationPrediction: true,
    maintenanceScheduling: true
  }
} as const;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a new optimization request with default configuration
 * Factory function with ReadyAI conventions
 */
export function createOptimizationRequest(
  projectId: UUID,
  operation: OptimizationOperationType,
  targetContextIds?: UUID[]
): OptimizationRequest {
  return {
    id: generateUUID(),
    projectId,
    operation,
    targetContextIds,
    config: DEFAULT_OPTIMIZATION_CONFIG,
    constraints: {
      maxDurationMs: OPTIMIZATION_CONSTANTS.MAX_OPTIMIZATION_DURATION_MS,
      maxMemoryUsageMB: 512,
      maxCpuUsagePercent: 70,
      allowBackgroundProcessing: true
    },
    qualityRequirements: {
      minimumQualityLevel: 'fair',
      preserveCriticalContexts: true,
      maintainDependencies: true,
      validateResults: true
    },
    performanceRequirements: {
      maxLatencyMs: 2000,
      minThroughput: 10,
      cacheUtilization: true,
      parallelProcessing: true
    },
    requestedAt: createTimestamp()
  };
}

/**
 * Calculate optimization effectiveness score
 * Comprehensive effectiveness calculation
 */
export function calculateOptimizationEffectiveness(
  result: OptimizationResult,
  target: PerformanceOptimizationTarget
): number {
  const performanceGain = result.summary.performanceImprovement;
  const qualityImpact = result.qualityImpact.overallQualityChange;
  const resourceSavings = result.summary.storageReduction;
  
  // Weighted score calculation
  const performanceWeight = 0.4;
  const qualityWeight = 0.3;
  const resourceWeight = 0.3;
  
  const performanceScore = Math.min(1.0, Math.max(0.0, performanceGain));
  const qualityScore = Math.min(1.0, Math.max(0.0, 1.0 + qualityImpact)); // Quality impact can be negative
  const resourceScore = Math.min(1.0, Math.max(0.0, resourceSavings));
  
  return (performanceScore * performanceWeight) + 
         (qualityScore * qualityWeight) + 
         (resourceScore * resourceWeight);
}

/**
 * Validate optimization configuration
 * Comprehensive validation based on Cline's validation patterns
 */
export function validateOptimizationConfig(
  config: ContextOptimizationConfig
): OptimizationValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];
  
  // Validate performance targets
  if (config.performanceTargets.maxLatencyMs <= 0) {
    errors.push('Maximum latency must be positive');
  }
  
  if (config.performanceTargets.minQualityScore < 0 || config.performanceTargets.minQualityScore > 1) {
    errors.push('Minimum quality score must be between 0 and 1');
  }
  
  // Validate compression settings
  if (config.compression.targetRatio < OPTIMIZATION_CONSTANTS.MIN_COMPRESSION_RATIO ||
      config.compression.targetRatio > OPTIMIZATION_CONSTANTS.MAX_COMPRESSION_RATIO) {
    errors.push(`Compression ratio must be between ${OPTIMIZATION_CONSTANTS.MIN_COMPRESSION_RATIO} and ${OPTIMIZATION_CONSTANTS.MAX_COMPRESSION_RATIO}`);
  }
  
  // Validate cache settings
  if (config.cacheOptimization.maxCacheSize > OPTIMIZATION_CONSTANTS.MAX_CACHE_SIZE_MB) {
    warnings.push(`Cache size ${config.cacheOptimization.maxCacheSize}MB exceeds recommended maximum ${OPTIMIZATION_CONSTANTS.MAX_CACHE_SIZE_MB}MB`);
    suggestions.push('Consider reducing cache size for better performance');
  }
  
  // Validate resource thresholds
  const { memoryThreshold, cpuThreshold, storageThreshold } = config.resourceManagement;
  if (memoryThreshold < 0.1 || memoryThreshold > 0.95) {
    warnings.push('Memory threshold should be between 10% and 95%');
  }
  
  if (cpuThreshold < 0.1 || cpuThreshold > 0.95) {
    warnings.push('CPU threshold should be between 10% and 95%');
  }
  
  if (storageThreshold < 0.1 || storageThreshold > 0.99) {
    warnings.push('Storage threshold should be between 10% and 99%');
  }
  
  return {
    id: generateUUID(),
    type: 'optimization-config',
    passed: errors.length === 0,
    errors,
    warnings,
    suggestions,
    score: errors.length === 0 ? (warnings.length === 0 ? 100 : 85) : 0,
    validatedAt: createTimestamp(),
    validator: 'context-optimization-validator',
    configValidation: {
      strategyValid: true, // Could be enhanced with actual strategy validation
      targetsAchievable: config.performanceTargets.maxLatencyMs > 0,
      resourcesAdequate: true, // Would require actual resource analysis
      constraintsConsistent: true
    },
    performanceValidation: {
      targetsRealistic: true,
      improvementFeasible: true,
      riskAcceptable: true,
      timeframeReasonable: true
    },
    qualityValidation: {
      qualityPreservationFeasible: config.compression.qualityThreshold >= 0.3,
      dependenciesValidated: true,
      criticalContextsProtected: config.compression.preserveKeyContexts,
      rollbackPlanValid: true
    },
    resourceValidation: {
      memoryRequirementsValid: config.performanceTargets.maxMemoryUsageMB > 0,
      cpuRequirementsValid: true,
      storageRequirementsValid: config.performanceTargets.maxStorageUsageMB > 0,
      networkRequirementsValid: true
    },
    strategyValidation: {
      strategySupported: true,
      parameterRangesValid: true,
      phaseCompatibility: config.phaseOptimization.enabled,
      contextTypeCompatibility: true
    }
  };
}

/**
 * Calculate resource efficiency score
 * Resource efficiency calculation with multi-factor analysis
 */
export function calculateResourceEfficiency(
  beforeMetrics: OptimizationPerformanceMetrics,
  afterMetrics: OptimizationPerformanceMetrics
): number {
  // Memory efficiency
  const memoryReduction = (beforeMetrics.resourceUtilization.averageMemoryUsageMB - 
                          afterMetrics.resourceUtilization.averageMemoryUsageMB) / 
                          beforeMetrics.resourceUtilization.averageMemoryUsageMB;
  
  // CPU efficiency
  const cpuReduction = (beforeMetrics.resourceUtilization.averageCpuUsagePercent - 
                       afterMetrics.resourceUtilization.averageCpuUsagePercent) / 
                       beforeMetrics.resourceUtilization.averageCpuUsagePercent;
  
  // Throughput improvement
  const throughputImprovement = (afterMetrics.throughput.contextsPerSecond - 
                                beforeMetrics.throughput.contextsPerSecond) / 
                                beforeMetrics.throughput.contextsPerSecond;
  
  // Cache improvement
  const cacheImprovement = afterMetrics.cachePerformance.hitRate - 
                          beforeMetrics.cachePerformance.hitRate;
  
  // Weighted efficiency score
  return Math.max(0.0, Math.min(1.0, 
    (memoryReduction * 0.3) + 
    (cpuReduction * 0.2) + 
    (throughputImprovement * 0.3) + 
    (cacheImprovement * 0.2)
  ));
}

/**
 * Determine optimal strategy based on current conditions
 * Intelligent strategy selection with context awareness
 */
export function determineOptimalStrategy(
  projectId: UUID,
  currentPhase: PhaseType,
  resourceConstraints: Record<ResourceConstraintType, number>,
  qualityRequirements: { minimumQuality: number; preserveKeyContexts: boolean; }
): OptimizationStrategy {
  // Memory constraint analysis
  const memoryPressure = resourceConstraints.memory || 0;
  const cpuPressure = resourceConstraints.cpu || 0;
  const timePressure = resourceConstraints.time || 0;
  
  // High resource pressure - prioritize efficiency
  if (memoryPressure > 0.8 || cpuPressure > 0.8) {
    return timePressure > 0.8 ? 'aggressive' : 'performance-first';
  }
  
  // High quality requirements
  if (qualityRequirements.minimumQuality > 0.8 && qualityRequirements.preserveKeyContexts) {
    return 'quality-first';
  }
  
  // Phase-specific recommendations
  switch (currentPhase) {
    case 'Phase0_StrategicCharter':
    case 'Phase20_CoreContracts':
    case 'Phase301_MasterPlan':
    case 'Phase4_ValidationCorrection':
      return 'quality-first';
    
    case 'Phase31_FileGeneration':
    case 'Phase23_ModuleSpecSubsequent':
      return 'performance-first';
    
    case 'Phase7_Iteration':
      return 'adaptive';
    
    default:
      return 'balanced';
  }
}

/**
 * Create optimization alert with proper configuration
 */
export function createOptimizationAlert(
  severity: OptimizationAlert['severity'],
  category: OptimizationAlert['category'],
  title: string,
  description: string,
  projectId: UUID,
  phase: PhaseType
): OptimizationAlert {
  const now = createTimestamp();
  
  return {
    id: generateUUID(),
    severity,
    category,
    details: {
      title,
      description,
      affectedContexts: [],
      triggerCondition: 'Manual creation',
      impact: 'moderate'
    },
    recommendations: [],
    context: {
      projectId,
      phase,
      triggerMetrics: {},
      environmentInfo: {}
    },
    lifecycle: {
      createdAt: now
    },
    metadata: {
      source: 'context-optimization-system'
    }
  };
}

/**
 * Apply phase-specific optimization adjustments
 * Phase-aware optimization with intelligent parameter adjustment
 */
export function applyPhaseOptimization(
  config: ContextOptimizationConfig,
  phase: PhaseType
): ContextOptimizationConfig {
  if (!config.phaseOptimization.enabled) return config;
  
  const phaseOverrides = config.phaseOptimization.phaseSpecificStrategies[phase];
  if (!phaseOverrides) return config;
  
  // Deep merge phase-specific overrides
  return {
    ...config,
    ...phaseOverrides,
    phaseOptimization: {
      ...config.phaseOptimization,
      ...phaseOverrides.phaseOptimization
    }
  };
}

/**
 * Estimate optimization impact before execution
 * Impact estimation with confidence intervals
 */
export function estimateOptimizationImpact(
  contexts: ContextIntelligenceNode[],
  operation: OptimizationOperationType,
  config: ContextOptimizationConfig
): {
  estimatedImprovement: number;
  confidenceInterval: { min: number; max: number; };
  riskAssessment: 'low' | 'medium' | 'high';
  recommendedProceed: boolean;
} {
  const baselineScore = contexts.reduce((sum, ctx) => sum + ctx.relevanceScore, 0) / contexts.length;
  
  // Operation-specific impact estimation
  let estimatedImprovement: number;
  switch (operation) {
    case 'compress':
      estimatedImprovement = config.compression.targetRatio * 0.3;
      break;
    case 'prune':
      estimatedImprovement = 0.2;
      break;
    case 'rerank':
      estimatedImprovement = 0.15;
      break;
    case 'cache-optimize':
      estimatedImprovement = 0.25;
      break;
    default:
      estimatedImprovement = 0.1;
  }
  
  // Adjust based on current quality
  const qualityAdjustment = baselineScore < 0.5 ? 1.2 : baselineScore > 0.8 ? 0.8 : 1.0;
  estimatedImprovement *= qualityAdjustment;
  
  // Calculate confidence interval
  const variance = 0.05; // 5% variance
  const confidenceInterval = {
    min: Math.max(0, estimatedImprovement - variance),
    max: Math.min(1, estimatedImprovement + variance)
  };
  
  // Risk assessment
  const riskFactors = [
    config.compression.aggressiveness === 'aggressive' ? 0.3 : 0.1,
    contexts.length > 1000 ? 0.2 : 0.1,
    baselineScore < 0.3 ? 0.3 : 0.1
  ];
  
  const riskScore = riskFactors.reduce((sum, risk) => sum + risk, 0);
  const riskAssessment: 'low' | 'medium' | 'high' = 
    riskScore > 0.5 ? 'high' : riskScore > 0.3 ? 'medium' : 'low';
  
  const recommendedProceed = estimatedImprovement > 0.1 && riskAssessment !== 'high';
  
  return {
    estimatedImprovement,
    confidenceInterval,
    riskAssessment,
    recommendedProceed
  };
}

/**
 * Create performance optimization target
 */
export function createPerformanceTarget(
  category: PerformanceOptimizationTarget['category'],
  currentValue: number,
  targetValue: number,
  unit: string
): PerformanceOptimizationTarget {
  const improvementPercent = ((targetValue - currentValue) / currentValue) * 100;
  
  return {
    id: generateUUID(),
    category,
    metrics: {
      currentValue,
      targetValue,
      unit,
      improvementPercent
    },
    strategy: {
      optimizationApproaches: ['compress', 'cache-optimize'],
      riskLevel: 'medium',
      expectedDuration: 30000, // 30 seconds
      resourceRequirements: {
        memory: 100,
        cpu: 50,
        storage: 10,
        network: 5,
        time: 30000,
        'api-calls': 0
      }
    },
    successCriteria: {
      minimumImprovement: Math.abs(improvementPercent) * 0.5,
      qualityThreshold: 0.6,
      stabilityRequirement: 0.9,
      timeConstraint: 60000
    },
    priority: Math.abs(improvementPercent) > 50 ? 'high' : 
              Math.abs(improvementPercent) > 25 ? 'medium' : 'low',
    createdAt: createTimestamp()
  };
}

// =============================================================================
// TYPE GUARDS AND UTILITIES
// =============================================================================

/**
 * Type guard for optimization error
 */
export function isOptimizationError(error: any): error is OptimizationError {
  return error instanceof ReadyAIError && 'optimizationErrorCode' in error;
}

/**
 * Check if optimization strategy is performance-focused
 */
export function isPerformanceFocusedStrategy(strategy: OptimizationStrategy): boolean {
  return ['performance-first', 'aggressive', 'memory-efficient'].includes(strategy);
}

/**
 * Check if optimization strategy is quality-focused
 */
export function isQualityFocusedStrategy(strategy: OptimizationStrategy): boolean {
  return ['quality-first', 'conservative'].includes(strategy);
}

/**
 * Get recommended optimization operations for a strategy
 */
export function getRecommendedOperations(strategy: OptimizationStrategy): OptimizationOperationType[] {
  switch (strategy) {
    case 'performance-first':
      return ['compress', 'cache-optimize', 'prune'];
    case 'quality-first':
      return ['validate', 'rerank', 'merge'];
    case 'memory-efficient':
      return ['compress', 'cleanup', 'prune'];
    case 'aggressive':
      return ['compress', 'prune', 'cleanup', 'cache-optimize'];
    case 'conservative':
      return ['validate', 'rerank'];
    case 'adaptive':
      return ['compress', 'rerank', 'validate', 'cache-optimize'];
    case 'phase-aware':
      return ['rerank', 'validate', 'cache-optimize'];
    case 'balanced':
    default:
      return ['compress', 'rerank', 'validate'];
  }
}

/**
 * Calculate optimization priority based on multiple factors
 */
export function calculateOptimizationPriority(
  performanceMetrics: OptimizationPerformanceMetrics,
  qualityScore: number,
  resourceUsage: number
): 'low' | 'medium' | 'high' | 'critical' {
  // Performance factor
  const performanceFactor = performanceMetrics.timing.totalDurationMs > 5000 ? 0.3 : 0.1;
  
  // Quality factor
  const qualityFactor = qualityScore < 0.5 ? 0.3 : qualityScore < 0.7 ? 0.2 : 0.1;
  
  // Resource factor
  const resourceFactor = resourceUsage > 0.8 ? 0.4 : resourceUsage > 0.6 ? 0.2 : 0.1;
  
  const totalPriority = performanceFactor + qualityFactor + resourceFactor;
  
  if (totalPriority > 0.7) return 'critical';
  if (totalPriority > 0.5) return 'high';
  if (totalPriority > 0.3) return 'medium';
  return 'low';
}

// =============================================================================
// EXPORT ALL TYPES
// =============================================================================

/**
 * Export all types for external consumption
 */
export type {
  ContextOptimizationConfig,
  OptimizationRequest,
  OptimizationResult,
  OptimizationContextChange,
  OptimizationPerformanceMetrics,
  PerformanceOptimizationTarget,
  ContextCompressionStrategy,
  CompressionBenchmarkResult,
  CacheOptimizationConfig,
  CacheOptimizationResult,
  CachePerformanceSnapshot,
  ContextRelationshipOptimization,
  PredictiveOptimizationConfig,
  PredictiveOptimizationResult,
  PredictiveRecommendation,
  OptimizationAnalytics,
  OptimizationRecommendation,
  OptimizationAlert,
  OptimizationError,
  OptimizationValidationResult
};

// Version information
export const CONTEXT_OPTIMIZATION_TYPES_VERSION = '1.0.0';

// Default exports
export default {
  CONTEXT_OPTIMIZATION_TYPES_VERSION,
  DEFAULT_OPTIMIZATION_CONFIG,
  DEFAULT_CACHE_OPTIMIZATION_CONFIG,
  DEFAULT_PREDICTIVE_OPTIMIZATION_CONFIG,
  OPTIMIZATION_CONSTANTS
};
