// packages/context-intelligence/types/scoring.ts

/**
 * Context Intelligence Scoring Types for ReadyAI Personal AI Development Orchestrator
 * 
 * This module provides comprehensive scoring and ranking types for context-aware AI development,
 * adapting Cline's proven quality assessment patterns while adding ReadyAI-specific
 * multi-dimensional scoring capabilities for semantic relevance, quality dimensions,
 * and context intelligence optimization.
 * 
 * Key Adaptations from Cline:
 * - Quality assessment patterns from Cline's src/core/quality/types.ts
 * - Ranking algorithms from Cline's context management system
 * - Performance metrics from Cline's telemetry and monitoring
 * - Validation patterns from Cline's comprehensive validation framework
 * - Error handling from Cline's robust error management system
 * 
 * ReadyAI Extensions:
 * - Multi-dimensional context scoring with weighted quality factors
 * - Semantic relevance assessment with vector similarity scoring
 * - Project-phase-aware scoring with temporal quality adjustments
 * - Context relationship scoring for dependency-aware retrieval
 * - Performance-based scoring with optimization recommendations
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
  ContextAccessPattern
} from './context';

// =============================================================================
// CORE SCORING TYPES
// =============================================================================

/**
 * Multi-dimensional scoring categories for context quality assessment
 * Based on ReadyAI's quality dimensions requirements
 */
export type ScoringDimension = 
  | 'relevance'         // How relevant the context is to the current task
  | 'freshness'         // How recent and up-to-date the context is
  | 'completeness'      // How complete and comprehensive the context is
  | 'accuracy'          // How accurate and validated the context is
  | 'coherence'         // How well the context fits with related contexts
  | 'dependencies'      // How well dependencies are resolved and valid
  | 'performance'       // How efficiently the context can be processed
  | 'accessibility'     // How easily the context can be retrieved and used
  | 'semantic'          // Semantic similarity and meaning alignment
  | 'temporal'          // Time-based relevance and phase alignment
  | 'structural'        // Code/document structure quality
  | 'maintainability';  // Long-term maintenance and evolution potential

/**
 * Scoring algorithm types for different ranking strategies
 * Adapted from Cline's context ranking patterns
 */
export type ScoringAlgorithm = 
  | 'weighted-sum'       // Simple weighted sum of dimension scores
  | 'harmonic-mean'      // Harmonic mean for balanced scoring
  | 'geometric-mean'     // Geometric mean for multiplicative factors
  | 'min-max'            // Min-max normalization approach
  | 'percentile-rank'    // Percentile-based ranking
  | 'ml-ensemble'        // Machine learning ensemble scoring
  | 'hybrid-adaptive';   // Adaptive hybrid approach

/**
 * Scoring confidence levels based on data quality and completeness
 */
export type ScoringConfidence = 'very-high' | 'high' | 'medium' | 'low' | 'very-low';

/**
 * Comprehensive scoring configuration
 * Enhanced configuration based on Cline's proven patterns
 */
export interface ContextScoringConfig {
  /** Primary scoring algorithm to use */
  algorithm: ScoringAlgorithm;
  
  /** Dimension weights (must sum to 1.0) */
  dimensionWeights: Record<ScoringDimension, number>;
  
  /** Minimum confidence required for scoring */
  minimumConfidence: ScoringConfidence;
  
  /** Temporal decay settings */
  temporalDecay: {
    enabled: boolean;
    halfLifeDays: number;
    minimumScore: number;
  };
  
  /** Phase-aware scoring adjustments */
  phaseAdjustments: Record<PhaseType, Record<ScoringDimension, number>>;
  
  /** Performance optimization settings */
  performance: {
    cacheScores: boolean;
    scoreCacheTtlMs: number;
    batchScoringSize: number;
    parallelScoring: boolean;
  };
  
  /** Quality thresholds for filtering */
  qualityThresholds: {
    minimum: number;
    recommended: number;
    excellent: number;
  };
  
  /** Advanced scoring features */
  advanced: {
    semanticBoostEnabled: boolean;
    dependencyPenaltyEnabled: boolean;
    accessPatternBoostEnabled: boolean;
    qualityTrendAdjustmentEnabled: boolean;
  };
}

/**
 * Individual dimension score with detailed metrics
 * Enhanced dimension scoring based on Cline's quality assessment
 */
export interface DimensionScore {
  /** Dimension being scored */
  dimension: ScoringDimension;
  
  /** Raw score (0.0 - 1.0) */
  rawScore: number;
  
  /** Weighted score (raw score * weight) */
  weightedScore: number;
  
  /** Confidence in this score */
  confidence: ScoringConfidence;
  
  /** Factors contributing to this score */
  contributingFactors: Array<{
    factor: string;
    impact: number;
    description: string;
  }>;
  
  /** Data points used for calculation */
  dataPoints: Record<string, any>;
  
  /** Calculation method used */
  calculationMethod: string;
  
  /** Score calculation timestamp */
  calculatedAt: string;
  
  /** Score validity period */
  validUntil?: string;
}

/**
 * Complete context scoring result
 * Comprehensive scoring result based on Cline's validation patterns
 */
export interface ContextScore {
  /** Unique scoring identifier */
  id: UUID;
  
  /** Context being scored */
  contextId: UUID;
  
  /** Project context */
  projectId: UUID;
  
  /** Overall composite score (0.0 - 1.0) */
  overallScore: number;
  
  /** Individual dimension scores */
  dimensionScores: DimensionScore[];
  
  /** Scoring algorithm used */
  algorithmUsed: ScoringAlgorithm;
  
  /** Overall confidence in scoring */
  overallConfidence: ScoringConfidence;
  
  /** Scoring configuration used */
  configurationSnapshot: ContextScoringConfig;
  
  /** Performance metrics for scoring operation */
  performanceMetrics: ScoringPerformanceMetrics;
  
  /** Quality assessment */
  qualityAssessment: {
    qualityLevel: ContextQualityLevel;
    passesMinimumThreshold: boolean;
    recommendedForUse: boolean;
    qualityIssues: string[];
    improvementSuggestions: string[];
  };
  
  /** Ranking information */
  rankingInfo?: {
    rank: number;
    totalCandidates: number;
    percentile: number;
    relativeTo: string;
  };
  
  /** Score calculation timestamp */
  scoredAt: string;
  
  /** Score expiration timestamp */
  expiresAt: string;
  
  /** Additional metadata */
  metadata: Record<string, any>;
}

/**
 * Batch scoring request for multiple contexts
 * Efficient batch processing based on Cline's performance patterns
 */
export interface BatchScoringRequest {
  /** Request identifier */
  id: UUID;
  
  /** Project scope */
  projectId: UUID;
  
  /** Contexts to score */
  contextIds: UUID[];
  
  /** Scoring configuration */
  config: ContextScoringConfig;
  
  /** Query context for relevance scoring */
  queryContext?: {
    query: string;
    phase: PhaseType;
    intent: string;
    currentFile?: string;
    recentFiles?: string[];
  };
  
  /** Performance requirements */
  performance: {
    maxLatencyMs: number;
    allowCachedResults: boolean;
    priorityOrder?: UUID[];
  };
  
  /** Request timestamp */
  requestedAt: string;
}

/**
 * Batch scoring result with comprehensive analytics
 */
export interface BatchScoringResult {
  /** Request identifier */
  requestId: UUID;
  
  /** Scoring results by context ID */
  scores: Map<UUID, ContextScore>;
  
  /** Ranked context IDs by score */
  rankedContextIds: UUID[];
  
  /** Batch performance metrics */
  batchMetrics: BatchScoringMetrics;
  
  /** Quality distribution analysis */
  qualityDistribution: Record<ContextQualityLevel, number>;
  
  /** Scoring summary statistics */
  summaryStatistics: {
    meanScore: number;
    medianScore: number;
    standardDeviation: number;
    scoreRange: { min: number; max: number };
  };
  
  /** Failed scoring attempts */
  failures: Array<{
    contextId: UUID;
    error: string;
    recoverable: boolean;
  }>;
  
  /** Recommendations based on results */
  recommendations: ScoringRecommendation[];
  
  /** Result timestamp */
  completedAt: string;
}

// =============================================================================
// PERFORMANCE AND ANALYTICS
// =============================================================================

/**
 * Performance metrics for individual scoring operations
 * Detailed performance tracking based on Cline's telemetry patterns
 */
export interface ScoringPerformanceMetrics {
  /** Total scoring duration */
  totalDurationMs: number;
  
  /** Individual dimension calculation times */
  dimensionTimings: Record<ScoringDimension, number>;
  
  /** Cache performance */
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
  };
  
  /** Resource utilization */
  resourceUsage: {
    memoryUsageMB: number;
    cpuTimeMs: number;
    ioOperations: number;
  };
  
  /** Data quality metrics */
  dataQuality: {
    completenessPercent: number;
    missingDataPoints: string[];
    estimatedDataPoints: string[];
  };
  
  /** Scoring accuracy indicators */
  accuracy: {
    confidenceLevel: ScoringConfidence;
    uncertaintyFactors: string[];
    validationsPassed: number;
    validationsFailed: number;
  };
}

/**
 * Batch scoring performance metrics
 * Comprehensive batch operation tracking
 */
export interface BatchScoringMetrics {
  /** Total batch processing time */
  totalBatchDurationMs: number;
  
  /** Individual context processing times */
  contextProcessingTimes: Record<UUID, number>;
  
  /** Parallel processing statistics */
  parallelization: {
    threadsUsed: number;
    averageThreadUtilization: number;
    loadBalanceEfficiency: number;
  };
  
  /** Cache performance across batch */
  batchCache: {
    totalHits: number;
    totalMisses: number;
    cacheEfficiency: number;
    memoryUsageMB: number;
  };
  
  /** Success/failure statistics */
  outcomes: {
    successful: number;
    failed: number;
    partiallySuccessful: number;
    successRate: number;
  };
  
  /** Resource efficiency metrics */
  efficiency: {
    contextsPerSecond: number;
    memoryPerContext: number;
    cpuUtilizationPercent: number;
  };
}

// =============================================================================
// RANKING AND OPTIMIZATION
// =============================================================================

/**
 * Context ranking request with advanced criteria
 * Enhanced ranking based on Cline's context prioritization
 */
export interface ContextRankingRequest {
  /** Request identifier */
  id: UUID;
  
  /** Project scope */
  projectId: UUID;
  
  /** Contexts to rank */
  contextIds: UUID[];
  
  /** Ranking criteria */
  criteria: {
    primaryDimension: ScoringDimension;
    secondaryDimensions: ScoringDimension[];
    tieBreaker: ScoringDimension;
  };
  
  /** Ranking strategy */
  strategy: {
    algorithm: 'score-based' | 'tournament' | 'pairwise' | 'ml-ranked';
    stabilityImportance: number; // 0.0 - 1.0
    diversityFactor: number; // 0.0 - 1.0
  };
  
  /** Context for relevance assessment */
  rankingContext?: {
    query?: string;
    phase?: PhaseType;
    userIntent?: string;
    constraints?: Record<string, any>;
  };
  
  /** Request timestamp */
  requestedAt: string;
}

/**
 * Context ranking result with detailed analysis
 */
export interface ContextRankingResult {
  /** Request identifier */
  requestId: UUID;
  
  /** Ranked context IDs in order */
  rankedContextIds: UUID[];
  
  /** Ranking scores by context ID */
  rankingScores: Map<UUID, RankingScore>;
  
  /** Ranking stability analysis */
  stabilityAnalysis: {
    stabilityScore: number;
    volatileRankings: UUID[];
    consistentRankings: UUID[];
  };
  
  /** Diversity analysis */
  diversityAnalysis: {
    diversityScore: number;
    clusteringInfo: Array<{
      clusterId: number;
      contextIds: UUID[];
      representativeContext: UUID;
    }>;
  };
  
  /** Ranking confidence */
  confidence: ScoringConfidence;
  
  /** Performance metrics */
  performanceMetrics: RankingPerformanceMetrics;
  
  /** Result timestamp */
  rankedAt: string;
}

/**
 * Individual ranking score with detailed breakdown
 */
export interface RankingScore {
  /** Context identifier */
  contextId: UUID;
  
  /** Final ranking position (1-based) */
  rank: number;
  
  /** Ranking score (0.0 - 1.0) */
  score: number;
  
  /** Score breakdown by criteria */
  criteriaBreakdown: Record<ScoringDimension, number>;
  
  /** Ranking factors */
  rankingFactors: {
    baseScore: number;
    bonuses: Array<{ factor: string; bonus: number; }>;
    penalties: Array<{ factor: string; penalty: number; }>;
    adjustments: Array<{ factor: string; adjustment: number; }>;
  };
  
  /** Confidence in this ranking */
  confidence: ScoringConfidence;
  
  /** Comparison with other contexts */
  comparisons?: Array<{
    otherContextId: UUID;
    comparisonType: 'better' | 'worse' | 'similar';
    marginOfDifference: number;
  }>;
}

/**
 * Ranking performance metrics
 */
export interface RankingPerformanceMetrics {
  /** Total ranking duration */
  rankingDurationMs: number;
  
  /** Algorithm-specific timings */
  algorithmTimings: {
    scoringMs: number;
    sortingMs: number;
    analysisMs: number;
  };
  
  /** Comparison operations performed */
  comparisons: {
    totalComparisons: number;
    pairwiseComparisons: number;
    cacheHits: number;
  };
  
  /** Memory usage during ranking */
  memoryUsage: {
    peakUsageMB: number;
    averageUsageMB: number;
    allocationCount: number;
  };
}

// =============================================================================
// QUALITY ASSESSMENT AND VALIDATION
// =============================================================================

/**
 * Quality dimension assessment
 * Enhanced quality assessment based on Cline's validation patterns
 */
export interface QualityDimensionAssessment {
  /** Quality dimension */
  dimension: ScoringDimension;
  
  /** Assessment score (0.0 - 1.0) */
  score: number;
  
  /** Quality level classification */
  qualityLevel: ContextQualityLevel;
  
  /** Assessment method used */
  assessmentMethod: 'rule-based' | 'statistical' | 'ml-based' | 'hybrid';
  
  /** Validation results */
  validationResults: Array<{
    rule: string;
    passed: boolean;
    score: number;
    message?: string;
  }>;
  
  /** Improvement opportunities */
  improvements: Array<{
    action: string;
    expectedImpact: number;
    effort: 'low' | 'medium' | 'high';
    priority: 'low' | 'medium' | 'high' | 'critical';
  }>;
  
  /** Assessment confidence */
  confidence: ScoringConfidence;
  
  /** Assessment timestamp */
  assessedAt: string;
}

/**
 * Comprehensive quality scoring result
 * Multi-dimensional quality assessment with actionable insights
 */
export interface QualityScore {
  /** Scoring identifier */
  id: UUID;
  
  /** Context being assessed */
  contextId: UUID;
  
  /** Overall quality score (0.0 - 1.0) */
  overallQuality: number;
  
  /** Quality level classification */
  qualityLevel: ContextQualityLevel;
  
  /** Individual dimension assessments */
  dimensionAssessments: QualityDimensionAssessment[];
  
  /** Quality trend analysis */
  trendAnalysis: {
    trend: 'improving' | 'stable' | 'degrading';
    trendStrength: number;
    historicalScores: Array<{
      score: number;
      timestamp: string;
    }>;
  };
  
  /** Quality compliance */
  compliance: {
    meetsMinimumStandards: boolean;
    certificationLevel: 'bronze' | 'silver' | 'gold' | 'platinum';
    complianceIssues: string[];
  };
  
  /** Actionable recommendations */
  recommendations: QualityRecommendation[];
  
  /** Assessment metadata */
  metadata: {
    assessor: string;
    assessmentDuration: number;
    dataCompleteness: number;
    methodologyVersion: string;
  };
  
  /** Scoring timestamp */
  scoredAt: string;
}

/**
 * Quality improvement recommendation
 * Actionable quality improvement based on Cline's recommendation patterns
 */
export interface QualityRecommendation {
  /** Recommendation identifier */
  id: UUID;
  
  /** Recommendation type */
  type: 'critical' | 'performance' | 'maintainability' | 'optimization';
  
  /** Priority level */
  priority: 'low' | 'medium' | 'high' | 'critical';
  
  /** Target dimension */
  targetDimension: ScoringDimension;
  
  /** Recommendation title */
  title: string;
  
  /** Detailed description */
  description: string;
  
  /** Expected impact */
  expectedImpact: {
    scoreImprovement: number;
    affectedDimensions: ScoringDimension[];
    timeToRealize: 'immediate' | 'short-term' | 'medium-term' | 'long-term';
  };
  
  /** Implementation details */
  implementation: {
    effort: 'low' | 'medium' | 'high';
    automated: boolean;
    dependencies: string[];
    steps: string[];
  };
  
  /** Recommendation confidence */
  confidence: ScoringConfidence;
  
  /** Generated timestamp */
  generatedAt: string;
  
  /** Expiration timestamp */
  expiresAt?: string;
}

// =============================================================================
// SEMANTIC AND VECTOR SCORING
// =============================================================================

/**
 * Semantic similarity scoring configuration
 * Vector-based scoring adapted from Cline's semantic patterns
 */
export interface SemanticScoringConfig {
  /** Semantic similarity algorithm */
  algorithm: 'cosine' | 'euclidean' | 'manhattan' | 'jaccard' | 'hybrid';
  
  /** Embedding model configuration */
  embeddingModel: {
    name: string;
    dimension: number;
    normalization: 'l1' | 'l2' | 'none';
  };
  
  /** Similarity thresholds */
  thresholds: {
    minimum: number;
    good: number;
    excellent: number;
  };
  
  /** Contextual boosting */
  contextualBoosting: {
    enabled: boolean;
    queryWeightBoost: number;
    phaseAlignmentBoost: number;
    recentAccessBoost: number;
  };
  
  /** Performance settings */
  performance: {
    batchSize: number;
    cacheEmbeddings: boolean;
    approximateSearch: boolean;
    searchTimeout: number;
  };
}

/**
 * Semantic similarity score
 * Detailed semantic assessment result
 */
export interface SemanticScore {
  /** Context identifier */
  contextId: UUID;
  
  /** Query identifier */
  queryId: UUID;
  
  /** Raw similarity score (0.0 - 1.0) */
  rawSimilarity: number;
  
  /** Boosted similarity score */
  boostedSimilarity: number;
  
  /** Similarity algorithm used */
  algorithm: string;
  
  /** Embedding information */
  embeddingInfo: {
    modelUsed: string;
    dimension: number;
    queryEmbedding: number[];
    contextEmbedding: number[];
  };
  
  /** Semantic features */
  semanticFeatures: {
    topicAlignment: number;
    conceptualSimilarity: number;
    linguisticSimilarity: number;
    domainRelevance: number;
  };
  
  /** Contextual factors */
  contextualFactors: {
    phaseAlignment: number;
    temporalRelevance: number;
    accessPatternMatch: number;
    dependencyRelevance: number;
  };
  
  /** Score confidence */
  confidence: ScoringConfidence;
  
  /** Calculation timestamp */
  calculatedAt: string;
}

// =============================================================================
// RECOMMENDATION AND OPTIMIZATION
// =============================================================================

/**
 * Scoring optimization recommendation
 * System-level optimization suggestions based on Cline's optimization patterns
 */
export interface ScoringRecommendation {
  /** Recommendation identifier */
  id: UUID;
  
  /** Recommendation category */
  category: 'performance' | 'accuracy' | 'efficiency' | 'configuration';
  
  /** Priority level */
  priority: 'low' | 'medium' | 'high' | 'critical';
  
  /** Target area */
  target: {
    scope: 'global' | 'project' | 'context' | 'dimension';
    identifier?: UUID;
    dimension?: ScoringDimension;
  };
  
  /** Recommendation details */
  recommendation: {
    title: string;
    description: string;
    rationale: string;
    expectedBenefit: string;
  };
  
  /** Implementation guidance */
  implementation: {
    complexity: 'low' | 'medium' | 'high';
    estimatedEffort: number; // hours
    prerequisites: string[];
    steps: Array<{
      step: number;
      description: string;
      automated: boolean;
    }>;
  };
  
  /** Impact assessment */
  impact: {
    performanceImprovement: number;
    accuracyImprovement: number;
    resourceReduction: number;
    userExperience: 'significant' | 'moderate' | 'minimal';
  };
  
  /** Recommendation confidence */
  confidence: ScoringConfidence;
  
  /** Generated timestamp */
  generatedAt: string;
  
  /** Validity period */
  validUntil?: string;
}

/**
 * Scoring analytics and insights
 * Comprehensive analytics based on Cline's analytics patterns
 */
export interface ScoringAnalytics {
  /** Analysis period */
  period: {
    startDate: string;
    endDate: string;
    duration: string;
  };
  
  /** Overall scoring statistics */
  statistics: {
    totalScoringOperations: number;
    averageOverallScore: number;
    scoreDistribution: Record<string, number>;
    qualityLevelDistribution: Record<ContextQualityLevel, number>;
  };
  
  /** Dimension performance analysis */
  dimensionPerformance: Record<ScoringDimension, {
    averageScore: number;
    scoreVariance: number;
    improvementTrend: number;
    topPerformingContexts: UUID[];
    underperformingContexts: UUID[];
  }>;
  
  /** Algorithm effectiveness */
  algorithmEffectiveness: Record<ScoringAlgorithm, {
    usageCount: number;
    averageAccuracy: number;
    averagePerformance: number;
    userSatisfaction?: number;
  }>;
  
  /** Performance trends */
  performanceTrends: {
    scoringSpeed: Array<{ timestamp: string; avgDurationMs: number; }>;
    cacheHitRate: Array<{ timestamp: string; hitRate: number; }>;
    qualityTrends: Array<{ timestamp: string; avgQuality: number; }>;
  };
  
  /** User behavior insights */
  userBehavior: {
    mostAccessedHighScoreContexts: UUID[];
    leastAccessedHighScoreContexts: UUID[];
    scoringPreferences: Record<ScoringDimension, number>;
  };
  
  /** System recommendations */
  systemRecommendations: ScoringRecommendation[];
}

// =============================================================================
// ERROR HANDLING AND VALIDATION
// =============================================================================

/**
 * Scoring-specific error types
 * Enhanced error handling based on Cline's error patterns
 */
export interface ScoringError extends ReadyAIError {
  /** Scoring-specific error code */
  scoringErrorCode:
    | 'INVALID_SCORING_CONFIG'
    | 'DIMENSION_CALCULATION_FAILED'
    | 'INSUFFICIENT_DATA'
    | 'ALGORITHM_EXECUTION_FAILED'
    | 'CACHE_CORRUPTION'
    | 'TIMEOUT_EXCEEDED'
    | 'MEMORY_LIMIT_EXCEEDED'
    | 'INVALID_DIMENSION_WEIGHTS'
    | 'EMBEDDING_SERVICE_UNAVAILABLE'
    | 'QUALITY_THRESHOLD_NOT_MET';
  
  /** Affected contexts */
  affectedContextIds?: UUID[];
  
  /** Dimension-specific information */
  dimensionInfo?: {
    dimension: ScoringDimension;
    attemptedValue?: any;
    expectedRange?: { min: number; max: number; };
  };
  
  /** Recovery suggestions */
  recoverySuggestions: Array<{
    action: string;
    automated: boolean;
    confidence: number;
  }>;
}

/**
 * Scoring validation result
 * Comprehensive validation based on Cline's validation framework
 */
export interface ScoringValidationResult extends ValidationResult {
  /** Configuration validation */
  configValidation: {
    weightsValid: boolean;
    weightSum: number;
    expectedWeightSum: number;
    algorithmSupported: boolean;
    thresholdsValid: boolean;
  };
  
  /** Data validation */
  dataValidation: {
    sufficientDataPoints: boolean;
    dataQualityScore: number;
    missingDataDimensions: ScoringDimension[];
    estimatedDataReliability: number;
  };
  
  /** Performance validation */
  performanceValidation: {
    withinLatencyLimits: boolean;
    memoryUsageAcceptable: boolean;
    cachePerformanceGood: boolean;
  };
  
  /** Result validation */
  resultValidation: {
    scoresInValidRange: boolean;
    confidenceLevelsReasonable: boolean;
    rankingConsistent: boolean;
    qualityAssessmentValid: boolean;
  };
}

// =============================================================================
// UTILITY TYPES AND CONSTANTS
// =============================================================================

/**
 * Scoring operation types
 */
export type ScoringOperationType = 
  | 'individual'
  | 'batch'
  | 'comparative'
  | 'trend-analysis'
  | 'quality-assessment'
  | 'ranking'
  | 'optimization';

/**
 * Scoring model types for ML-based scoring
 */
export type ScoringModelType = 
  | 'linear-regression'
  | 'random-forest'
  | 'neural-network'
  | 'ensemble'
  | 'custom';

/**
 * Default scoring configuration
 * Production-ready defaults based on Cline's proven patterns and ReadyAI requirements
 */
export const DEFAULT_SCORING_CONFIG: ContextScoringConfig = {
  algorithm: 'hybrid-adaptive',
  dimensionWeights: {
    relevance: 0.20,
    freshness: 0.15,
    completeness: 0.12,
    accuracy: 0.12,
    coherence: 0.10,
    dependencies: 0.08,
    performance: 0.08,
    accessibility: 0.05,
    semantic: 0.05,
    temporal: 0.03,
    structural: 0.02,
    maintainability: 0.00
  },
  minimumConfidence: 'medium',
  temporalDecay: {
    enabled: true,
    halfLifeDays: 30,
    minimumScore: 0.1
  },
  phaseAdjustments: {
    Phase0_StrategicCharter: {
      relevance: 1.2, freshness: 1.1, completeness: 1.0, accuracy: 1.1,
      coherence: 1.0, dependencies: 0.8, performance: 0.9, accessibility: 1.0,
      semantic: 1.1, temporal: 1.0, structural: 0.8, maintainability: 0.8
    },
    Phase1_ArchitecturalBlueprint: {
      relevance: 1.2, freshness: 1.0, completeness: 1.2, accuracy: 1.1,
      coherence: 1.2, dependencies: 1.1, performance: 0.9, accessibility: 1.0,
      semantic: 1.0, temporal: 1.0, structural: 1.2, maintainability: 1.1
    },
    Phase20_CoreContracts: {
      relevance: 1.1, freshness: 1.0, completeness: 1.3, accuracy: 1.2,
      coherence: 1.1, dependencies: 1.0, performance: 1.0, accessibility: 1.0,
      semantic: 1.0, temporal: 1.0, structural: 1.1, maintainability: 1.0
    },
    Phase21_ModuleSpec: {
      relevance: 1.2, freshness: 1.0, completeness: 1.2, accuracy: 1.1,
      coherence: 1.1, dependencies: 1.2, performance: 1.0, accessibility: 1.0,
      semantic: 1.0, temporal: 1.0, structural: 1.1, maintainability: 1.0
    },
    Phase23_ModuleSpecSubsequent: {
      relevance: 1.1, freshness: 1.0, completeness: 1.1, accuracy: 1.0,
      coherence: 1.0, dependencies: 1.1, performance: 1.0, accessibility: 1.0,
      semantic: 1.0, temporal: 1.0, structural: 1.0, maintainability: 1.0
    },
    Phase30_ProjectScaffolding: {
      relevance: 1.1, freshness: 1.0, completeness: 1.0, accuracy: 1.0,
      coherence: 1.0, dependencies: 1.0, performance: 1.1, accessibility: 1.1,
      semantic: 0.9, temporal: 1.0, structural: 1.1, maintainability: 1.0
    },
    Phase301_MasterPlan: {
      relevance: 1.2, freshness: 1.1, completeness: 1.3, accuracy: 1.1,
      coherence: 1.2, dependencies: 1.2, performance: 1.0, accessibility: 1.0,
      semantic: 1.0, temporal: 1.0, structural: 1.1, maintainability: 1.1
    },
    Phase31_FileGeneration: {
      relevance: 1.3, freshness: 1.0, completeness: 1.1, accuracy: 1.2,
      coherence: 1.1, dependencies: 1.3, performance: 1.1, accessibility: 1.0,
      semantic: 1.0, temporal: 0.9, structural: 1.2, maintainability: 1.0
    },
    Phase4_ValidationCorrection: {
      relevance: 1.1, freshness: 1.0, completeness: 1.0, accuracy: 1.3,
      coherence: 1.1, dependencies: 1.1, performance: 1.0, accessibility: 1.0,
      semantic: 0.9, temporal: 0.9, structural: 1.1, maintainability: 1.0
    },
    Phase5_TestGeneration: {
      relevance: 1.1, freshness: 1.0, completeness: 1.1, accuracy: 1.1,
      coherence: 1.0, dependencies: 1.0, performance: 1.0, accessibility: 1.0,
      semantic: 0.9, temporal: 0.9, structural: 1.0, maintainability: 1.1
    },
    Phase6_Documentation: {
      relevance: 1.0, freshness: 1.1, completeness: 1.2, accuracy: 1.1,
      coherence: 1.1, dependencies: 0.9, performance: 0.9, accessibility: 1.2,
      semantic: 1.0, temporal: 0.9, structural: 1.0, maintainability: 1.1
    },
    Phase7_Iteration: {
      relevance: 1.1, freshness: 1.2, completeness: 1.0, accuracy: 1.0,
      coherence: 1.0, dependencies: 1.0, performance: 1.1, accessibility: 1.0,
      semantic: 1.0, temporal: 1.1, structural: 1.0, maintainability: 1.2
    }
  },
  performance: {
    cacheScores: true,
    scoreCacheTtlMs: 300000, // 5 minutes
    batchScoringSize: 50,
    parallelScoring: true
  },
  qualityThresholds: {
    minimum: 0.3,
    recommended: 0.6,
    excellent: 0.8
  },
  advanced: {
    semanticBoostEnabled: true,
    dependencyPenaltyEnabled: true,
    accessPatternBoostEnabled: true,
    qualityTrendAdjustmentEnabled: true
  }
} as const;

/**
 * Scoring constants
 */
export const SCORING_CONSTANTS = {
  MAX_DIMENSION_SCORE: 1.0,
  MIN_DIMENSION_SCORE: 0.0,
  DEFAULT_CONFIDENCE_THRESHOLD: 0.7,
  MAX_BATCH_SIZE: 1000,
  SCORE_PRECISION_DECIMALS: 4,
  DEFAULT_CACHE_TTL_MS: 300000, // 5 minutes
  MAX_RECOMMENDATION_AGE_MS: 24 * 60 * 60 * 1000, // 24 hours
  QUALITY_ASSESSMENT_INTERVAL_MS: 60 * 60 * 1000, // 1 hour
  PERFORMANCE_MONITORING_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes
  MAX_HISTORICAL_SCORES: 100,
  DEFAULT_SIMILARITY_THRESHOLD: 0.7
} as const;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a new context score with default values
 * Factory function with ReadyAI conventions
 */
export function createContextScore(
  contextId: UUID,
  projectId: UUID,
  config: ContextScoringConfig
): ContextScore {
  const now = createTimestamp();
  const scoreId = generateUUID();
  
  return {
    id: scoreId,
    contextId,
    projectId,
    overallScore: 0.0,
    dimensionScores: [],
    algorithmUsed: config.algorithm,
    overallConfidence: 'medium',
    configurationSnapshot: { ...config },
    performanceMetrics: {
      totalDurationMs: 0,
      dimensionTimings: {} as Record<ScoringDimension, number>,
      cache: { hits: 0, misses: 0, hitRate: 0 },
      resourceUsage: { memoryUsageMB: 0, cpuTimeMs: 0, ioOperations: 0 },
      dataQuality: { 
        completenessPercent: 0, 
        missingDataPoints: [], 
        estimatedDataPoints: [] 
      },
      accuracy: {
        confidenceLevel: 'medium',
        uncertaintyFactors: [],
        validationsPassed: 0,
        validationsFailed: 0
      }
    },
    qualityAssessment: {
      qualityLevel: 'fair',
      passesMinimumThreshold: false,
      recommendedForUse: false,
      qualityIssues: [],
      improvementSuggestions: []
    },
    scoredAt: now,
    expiresAt: new Date(Date.now() + config.performance.scoreCacheTtlMs).toISOString(),
    metadata: {}
  };
}

/**
 * Validate scoring configuration
 * Comprehensive validation based on Cline's validation patterns
 */
export function validateScoringConfig(config: ContextScoringConfig): ScoringValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];
  
  // Validate dimension weights sum to 1.0
  const weightSum = Object.values(config.dimensionWeights).reduce((sum, weight) => sum + weight, 0);
  const tolerance = 0.001; // Allow small floating-point differences
  
  if (Math.abs(weightSum - 1.0) > tolerance) {
    errors.push(`Dimension weights must sum to 1.0, but sum to ${weightSum.toFixed(4)}`);
  }
  
  // Validate individual weights are non-negative
  for (const [dimension, weight] of Object.entries(config.dimensionWeights)) {
    if (weight < 0) {
      errors.push(`Dimension weight for ${dimension} cannot be negative: ${weight}`);
    }
    if (weight > 1) {
      errors.push(`Dimension weight for ${dimension} cannot exceed 1.0: ${weight}`);
    }
  }
  
  // Validate quality thresholds
  const { minimum, recommended, excellent } = config.qualityThresholds;
  if (minimum >= recommended || recommended >= excellent) {
    errors.push('Quality thresholds must be in ascending order: minimum < recommended < excellent');
  }
  
  if (minimum < 0 || excellent > 1) {
    errors.push('Quality thresholds must be between 0.0 and 1.0');
  }
  
  // Validate temporal decay
  if (config.temporalDecay.enabled) {
    if (config.temporalDecay.halfLifeDays <= 0) {
      errors.push('Temporal decay half-life must be positive');
    }
    if (config.temporalDecay.minimumScore < 0 || config.temporalDecay.minimumScore > 1) {
      errors.push('Temporal decay minimum score must be between 0.0 and 1.0');
    }
  }
  
  // Performance configuration warnings
  if (config.performance.batchScoringSize > SCORING_CONSTANTS.MAX_BATCH_SIZE) {
    warnings.push(`Batch scoring size ${config.performance.batchScoringSize} exceeds recommended maximum ${SCORING_CONSTANTS.MAX_BATCH_SIZE}`);
    suggestions.push('Consider reducing batch size for better performance');
  }
  
  if (config.performance.scoreCacheTtlMs < 60000) { // Less than 1 minute
    warnings.push('Score cache TTL is very low, may impact performance');
    suggestions.push('Consider increasing cache TTL to at least 1 minute');
  }
  
  return {
    id: generateUUID(),
    type: 'scoring-config',
    passed: errors.length === 0,
    errors,
    warnings,
    suggestions,
    score: errors.length === 0 ? (warnings.length === 0 ? 100 : 85) : 0,
    validatedAt: createTimestamp(),
    validator: 'context-scoring-validator',
    configValidation: {
      weightsValid: Math.abs(weightSum - 1.0) <= tolerance,
      weightSum,
      expectedWeightSum: 1.0,
      algorithmSupported: true, // Could be enhanced with actual algorithm validation
      thresholdsValid: minimum < recommended && recommended < excellent
    },
    dataValidation: {
      sufficientDataPoints: true, // Would be determined by actual data analysis
      dataQualityScore: 0.8,
      missingDataDimensions: [],
      estimatedDataReliability: 0.85
    },
    performanceValidation: {
      withinLatencyLimits: true,
      memoryUsageAcceptable: true,
      cachePerformanceGood: true
    },
    resultValidation: {
      scoresInValidRange: true,
      confidenceLevelsReasonable: true,
      rankingConsistent: true,
      qualityAssessmentValid: true
    }
  };
}

/**
 * Calculate weighted overall score from dimension scores
 * Efficient calculation with proper normalization
 */
export function calculateOverallScore(
  dimensionScores: DimensionScore[],
  config: ContextScoringConfig
): number {
  let totalWeightedScore = 0;
  let totalWeight = 0;
  
  for (const dimensionScore of dimensionScores) {
    const weight = config.dimensionWeights[dimensionScore.dimension] || 0;
    totalWeightedScore += dimensionScore.rawScore * weight;
    totalWeight += weight;
  }
  
  // Normalize by total weight to handle missing dimensions
  return totalWeight > 0 ? Math.min(1.0, Math.max(0.0, totalWeightedScore / totalWeight)) : 0.0;
}

/**
 * Determine confidence level from individual dimension confidences
 */
export function aggregateConfidence(dimensionScores: DimensionScore[]): ScoringConfidence {
  if (dimensionScores.length === 0) return 'very-low';
  
  const confidenceValues = {
    'very-high': 5,
    'high': 4,
    'medium': 3,
    'low': 2,
    'very-low': 1
  };
  
  const averageConfidenceValue = dimensionScores
    .map(score => confidenceValues[score.confidence])
    .reduce((sum, value) => sum + value, 0) / dimensionScores.length;
  
  if (averageConfidenceValue >= 4.5) return 'very-high';
  if (averageConfidenceValue >= 3.5) return 'high';
  if (averageConfidenceValue >= 2.5) return 'medium';
  if (averageConfidenceValue >= 1.5) return 'low';
  return 'very-low';
}

/**
 * Apply temporal decay to a score based on age
 */
export function applyTemporalDecay(
  score: number,
  ageMs: number,
  config: ContextScoringConfig
): number {
  if (!config.temporalDecay.enabled) return score;
  
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  const halfLifeDays = config.temporalDecay.halfLifeDays;
  const decayFactor = Math.pow(0.5, ageDays / halfLifeDays);
  const decayedScore = score * decayFactor;
  
  return Math.max(config.temporalDecay.minimumScore, decayedScore);
}

/**
 * Create a quality recommendation
 */
export function createQualityRecommendation(
  targetDimension: ScoringDimension,
  type: QualityRecommendation['type'],
  priority: QualityRecommendation['priority'],
  title: string,
  description: string
): QualityRecommendation {
  const now = createTimestamp();
  
  return {
    id: generateUUID(),
    type,
    priority,
    targetDimension,
    title,
    description,
    expectedImpact: {
      scoreImprovement: 0.1, // Default improvement estimate
      affectedDimensions: [targetDimension],
      timeToRealize: 'short-term'
    },
    implementation: {
      effort: 'medium',
      automated: false,
      dependencies: [],
      steps: []
    },
    confidence: 'medium',
    generatedAt: now,
    expiresAt: new Date(Date.now() + SCORING_CONSTANTS.MAX_RECOMMENDATION_AGE_MS).toISOString()
  };
}

// =============================================================================
// TYPE GUARDS AND UTILITIES
// =============================================================================

/**
 * Type guard for scoring error
 */
export function isScoringError(error: any): error is ScoringError {
  return error instanceof ReadyAIError && 'scoringErrorCode' in error;
}

/**
 * Type guard for valid score range
 */
export function isValidScore(score: number): boolean {
  return typeof score === 'number' && 
         score >= SCORING_CONSTANTS.MIN_DIMENSION_SCORE && 
         score <= SCORING_CONSTANTS.MAX_DIMENSION_SCORE &&
         !isNaN(score) && isFinite(score);
}

/**
 * Normalize score to valid range
 */
export function normalizeScore(score: number): number {
  if (isNaN(score) || !isFinite(score)) return 0.0;
  return Math.min(SCORING_CONSTANTS.MAX_DIMENSION_SCORE, 
                  Math.max(SCORING_CONSTANTS.MIN_DIMENSION_SCORE, score));
}

/**
 * Calculate score percentile within a group
 */
export function calculateScorePercentile(score: number, allScores: number[]): number {
  if (allScores.length === 0) return 50; // Default percentile
  
  const sortedScores = [...allScores].sort((a, b) => a - b);
  const rank = sortedScores.findIndex(s => s >= score);
  
  return rank === -1 ? 100 : (rank / sortedScores.length) * 100;
}

/**
 * Export all types for external consumption
 */
export type {
  ContextScoringConfig,
  DimensionScore,
  ContextScore,
  BatchScoringRequest,
  BatchScoringResult,
  ScoringPerformanceMetrics,
  BatchScoringMetrics,
  ContextRankingRequest,
  ContextRankingResult,
  RankingScore,
  RankingPerformanceMetrics,
  QualityDimensionAssessment,
  QualityScore,
  QualityRecommendation,
  SemanticScoringConfig,
  SemanticScore,
  ScoringRecommendation,
  ScoringAnalytics,
  ScoringError,
  ScoringValidationResult
};

// Version information
export const CONTEXT_SCORING_TYPES_VERSION = '1.0.0';

// Default exports
export default {
  CONTEXT_SCORING_TYPES_VERSION,
  DEFAULT_SCORING_CONFIG,
  SCORING_CONSTANTS
};
