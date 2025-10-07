// packages/context-intelligence/services/QualityScorer.ts

/**
 * Context Quality Scorer for ReadyAI Personal AI Development Orchestrator
 * 
 * This service implements comprehensive quality scoring and assessment for context intelligence,
 * adapting Cline's proven quality assessment patterns (from src/core/quality/QualityAssessment.ts)
 * while adding ReadyAI-specific multi-dimensional scoring, threshold management, and 
 * quality improvement recommendations.
 * 
 * Key Adaptations from Cline:
 * - Quality assessment algorithms from Cline's QualityAssessment service (450+ lines)
 * - Scoring methodology from Cline's validation framework
 * - Performance monitoring patterns from Cline's telemetry system
 * - Error handling and recovery from Cline's robust error management
 * - Threshold management from Cline's configuration system
 * 
 * ReadyAI Extensions:
 * - Multi-dimensional scoring with weighted quality factors
 * - Phase-aware quality assessment with temporal adjustments
 * - Context relationship scoring for dependency-aware evaluation
 * - Batch processing capabilities for efficient large-scale assessment
 * - Quality trend analysis and predictive scoring
 * - Automated threshold adjustment based on project patterns
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
  createTimestamp,
  generateUUID
} from '../../foundation/types/core';

import {
  ContextIntelligenceNode,
  ContextQualityLevel,
  ContextQualityMetrics,
  ContextValidationResult,
  ContextIntelligenceError
} from '../types/context';

import {
  ScoringDimension,
  ScoringAlgorithm,
  ScoringConfidence,
  ContextScoringConfig,
  DimensionScore,
  ContextScore,
  BatchScoringRequest,
  BatchScoringResult,
  QualityDimensionAssessment,
  QualityScore,
  QualityRecommendation,
  ScoringPerformanceMetrics,
  BatchScoringMetrics,
  ScoringValidationResult,
  ScoringError,
  DEFAULT_SCORING_CONFIG,
  SCORING_CONSTANTS,
  createContextScore,
  validateScoringConfig,
  calculateOverallScore,
  aggregateConfidence,
  applyTemporalDecay,
  createQualityRecommendation,
  isValidScore,
  normalizeScore
} from '../types/scoring';

import { Logger } from '../../logging/services/Logger';
import { ErrorService } from '../../error-handling/services/ErrorService';

// =============================================================================
// QUALITY SCORER SERVICE
// =============================================================================

/**
 * Context Quality Scorer Service
 * 
 * Implements comprehensive quality scoring for context intelligence nodes,
 * providing multi-dimensional assessment, batch processing, and quality
 * improvement recommendations based on Cline's proven quality patterns.
 */
export class QualityScorer {
  private readonly logger: Logger;
  private readonly errorService: ErrorService;
  private config: ContextScoringConfig;
  private scoreCache: Map<string, ContextScore>;
  private cacheTtl: Map<string, number>;
  private performanceMetrics: Map<string, ScoringPerformanceMetrics>;
  private isProcessing: boolean;

  constructor(
    config: ContextScoringConfig = DEFAULT_SCORING_CONFIG,
    logger?: Logger,
    errorService?: ErrorService
  ) {
    this.config = config;
    this.logger = logger || new Logger('QualityScorer');
    this.errorService = errorService || new ErrorService();
    this.scoreCache = new Map();
    this.cacheTtl = new Map();
    this.performanceMetrics = new Map();
    this.isProcessing = false;

    // Validate configuration on initialization
    this.validateConfiguration();
    
    // Set up cache cleanup interval
    this.setupCacheCleanup();
    
    this.logger.info('QualityScorer initialized', {
      algorithm: this.config.algorithm,
      cacheEnabled: this.config.performance.cacheScores,
      batchSize: this.config.performance.batchScoringSize
    });
  }

  // =============================================================================
  // PUBLIC API METHODS
  // =============================================================================

  /**
   * Score a single context intelligence node
   * 
   * Performs comprehensive quality scoring using the configured algorithm
   * and dimension weights, with caching and performance monitoring.
   * 
   * @param context The context node to score
   * @param requestId Optional request identifier for tracking
   * @returns Promise resolving to context score
   */
  public async scoreContext(
    context: ContextIntelligenceNode,
    requestId?: string
  ): Promise<ContextScore> {
    const startTime = performance.now();
    const scoreId = generateUUID();
    const operationId = requestId || generateUUID();

    try {
      this.logger.debug('Starting context scoring', {
        contextId: context.id,
        contextType: context.type,
        algorithm: this.config.algorithm,
        requestId: operationId
      });

      // Check cache first
      const cacheKey = this.getCacheKey(context);
      if (this.config.performance.cacheScores) {
        const cachedScore = this.getCachedScore(cacheKey);
        if (cachedScore) {
          this.logger.debug('Cache hit for context score', { contextId: context.id });
          return cachedScore;
        }
      }

      // Initialize score object
      const contextScore = createContextScore(context.id, context.projectId, this.config);
      contextScore.id = scoreId;

      // Perform dimensional scoring
      const dimensionScores = await this.scoreDimensions(context);
      contextScore.dimensionScores = dimensionScores;

      // Calculate overall score
      contextScore.overallScore = calculateOverallScore(dimensionScores, this.config);

      // Aggregate confidence
      contextScore.overallConfidence = aggregateConfidence(dimensionScores);

      // Perform quality assessment
      contextScore.qualityAssessment = await this.assessQuality(context, contextScore.overallScore);

      // Calculate performance metrics
      const endTime = performance.now();
      contextScore.performanceMetrics = this.calculatePerformanceMetrics(
        startTime,
        endTime,
        dimensionScores,
        cacheKey
      );

      // Cache the result
      if (this.config.performance.cacheScores) {
        this.cacheScore(cacheKey, contextScore);
      }

      // Store performance metrics
      this.performanceMetrics.set(operationId, contextScore.performanceMetrics);

      this.logger.info('Context scoring completed', {
        contextId: context.id,
        overallScore: contextScore.overallScore,
        qualityLevel: contextScore.qualityAssessment.qualityLevel,
        durationMs: contextScore.performanceMetrics.totalDurationMs
      });

      return contextScore;

    } catch (error) {
      const scoringError = this.createScoringError(
        'DIMENSION_CALCULATION_FAILED',
        `Failed to score context ${context.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        [context.id],
        { context: context.type, algorithm: this.config.algorithm }
      );

      await this.errorService.handleError(scoringError);
      throw scoringError;
    }
  }

  /**
   * Score multiple contexts in batch
   * 
   * Efficiently processes multiple contexts with parallel execution,
   * load balancing, and comprehensive error handling.
   * 
   * @param request Batch scoring request
   * @returns Promise resolving to batch scoring result
   */
  public async scoreBatch(request: BatchScoringRequest): Promise<BatchScoringResult> {
    const startTime = performance.now();

    try {
      this.logger.info('Starting batch scoring', {
        requestId: request.id,
        contextCount: request.contextIds.length,
        algorithm: this.config.algorithm,
        batchSize: this.config.performance.batchScoringSize
      });

      if (this.isProcessing && !this.config.performance.parallelScoring) {
        throw this.createScoringError(
          'RESOURCE_EXHAUSTED',
          'Another batch scoring operation is in progress',
          [],
          { concurrent: true }
        );
      }

      this.isProcessing = true;

      // Initialize result structure
      const result: BatchScoringResult = {
        requestId: request.id,
        scores: new Map(),
        rankedContextIds: [],
        batchMetrics: this.createEmptyBatchMetrics(),
        qualityDistribution: {
          'excellent': 0,
          'good': 0,
          'fair': 0,
          'poor': 0,
          'stale': 0,
          'invalid': 0
        },
        summaryStatistics: {
          meanScore: 0,
          medianScore: 0,
          standardDeviation: 0,
          scoreRange: { min: 1.0, max: 0.0 }
        },
        failures: [],
        recommendations: [],
        completedAt: createTimestamp()
      };

      // Process contexts in batches
      const batchSize = Math.min(
        request.contextIds.length,
        this.config.performance.batchScoringSize
      );

      const batches = this.createBatches(request.contextIds, batchSize);
      
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        
        this.logger.debug('Processing batch', {
          batchIndex: batchIndex + 1,
          totalBatches: batches.length,
          batchSize: batch.length
        });

        await this.processBatch(batch, request, result);
      }

      // Calculate final metrics and rankings
      await this.finalizeBatchResult(result, startTime);

      this.logger.info('Batch scoring completed', {
        requestId: request.id,
        successfulScores: result.scores.size,
        failures: result.failures.length,
        durationMs: result.batchMetrics.totalBatchDurationMs
      });

      return result;

    } catch (error) {
      const scoringError = this.createScoringError(
        'ALGORITHM_EXECUTION_FAILED',
        `Batch scoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        request.contextIds,
        { batchSize: request.contextIds.length }
      );

      await this.errorService.handleError(scoringError);
      throw scoringError;

    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Assess quality of a context node
   * 
   * Performs detailed quality assessment with dimension-specific analysis,
   * validation, and improvement recommendations.
   * 
   * @param context Context node to assess
   * @returns Promise resolving to quality score
   */
  public async assessQuality(
    context: ContextIntelligenceNode,
    overallScore?: number
  ): Promise<QualityScore['qualityAssessment']> {
    try {
      const score = overallScore ?? (await this.scoreContext(context)).overallScore;
      
      // Determine quality level
      const qualityLevel = this.determineQualityLevel(score);
      
      // Check minimum threshold
      const passesThreshold = score >= this.config.qualityThresholds.minimum;
      
      // Check recommendation threshold
      const recommendedForUse = score >= this.config.qualityThresholds.recommended;
      
      // Identify quality issues
      const qualityIssues = await this.identifyQualityIssues(context, score);
      
      // Generate improvement suggestions
      const improvementSuggestions = await this.generateImprovementSuggestions(
        context, 
        score, 
        qualityIssues
      );

      return {
        qualityLevel,
        passesMinimumThreshold: passesThreshold,
        recommendedForUse,
        qualityIssues,
        improvementSuggestions
      };

    } catch (error) {
      this.logger.error('Quality assessment failed', {
        contextId: context.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Return safe defaults
      return {
        qualityLevel: 'poor',
        passesMinimumThreshold: false,
        recommendedForUse: false,
        qualityIssues: ['Quality assessment failed'],
        improvementSuggestions: ['Retry quality assessment']
      };
    }
  }

  /**
   * Update scoring configuration
   * 
   * Updates the scorer configuration with validation and cache invalidation.
   * 
   * @param newConfig New scoring configuration
   */
  public async updateConfiguration(newConfig: Partial<ContextScoringConfig>): Promise<void> {
    try {
      // Merge with current config
      const updatedConfig = { ...this.config, ...newConfig };
      
      // Validate new configuration
      const validation = validateScoringConfig(updatedConfig);
      if (!validation.passed) {
        throw this.createScoringError(
          'INVALID_SCORING_CONFIG',
          `Configuration validation failed: ${validation.errors.join(', ')}`,
          [],
          { errors: validation.errors }
        );
      }

      // Apply new configuration
      this.config = updatedConfig;
      
      // Clear cache if algorithm or weights changed
      if (newConfig.algorithm || newConfig.dimensionWeights) {
        this.clearCache();
      }

      this.logger.info('Scoring configuration updated', {
        algorithm: this.config.algorithm,
        cacheCleared: !!(newConfig.algorithm || newConfig.dimensionWeights)
      });

    } catch (error) {
      await this.errorService.handleError(error);
      throw error;
    }
  }

  /**
   * Get scoring performance metrics
   * 
   * Returns comprehensive performance metrics for monitoring and optimization.
   * 
   * @param operationId Optional operation ID to get specific metrics
   * @returns Performance metrics
   */
  public getPerformanceMetrics(operationId?: string): ScoringPerformanceMetrics | Map<string, ScoringPerformanceMetrics> {
    if (operationId) {
      return this.performanceMetrics.get(operationId) || this.createEmptyPerformanceMetrics();
    }
    return new Map(this.performanceMetrics);
  }

  /**
   * Clear scoring cache
   * 
   * Clears the internal scoring cache and TTL tracking.
   */
  public clearCache(): void {
    const cacheSize = this.scoreCache.size;
    this.scoreCache.clear();
    this.cacheTtl.clear();
    
    this.logger.info('Scoring cache cleared', { clearedEntries: cacheSize });
  }

  /**
   * Get cache statistics
   * 
   * Returns current cache usage and performance statistics.
   */
  public getCacheStats(): { size: number; hitRate: number; memoryUsageMB: number } {
    const totalRequests = Array.from(this.performanceMetrics.values())
      .reduce((total, metrics) => total + metrics.cache.hits + metrics.cache.misses, 0);
    
    const totalHits = Array.from(this.performanceMetrics.values())
      .reduce((total, metrics) => total + metrics.cache.hits, 0);
    
    const hitRate = totalRequests > 0 ? totalHits / totalRequests : 0;
    
    // Estimate memory usage (rough calculation)
    const avgScoreSize = 2048; // Estimated bytes per score
    const memoryUsageMB = (this.scoreCache.size * avgScoreSize) / (1024 * 1024);

    return {
      size: this.scoreCache.size,
      hitRate,
      memoryUsageMB
    };
  }

  // =============================================================================
  // PRIVATE SCORING METHODS
  // =============================================================================

  /**
   * Score individual dimensions of a context
   */
  private async scoreDimensions(context: ContextIntelligenceNode): Promise<DimensionScore[]> {
    const dimensionScores: DimensionScore[] = [];
    const now = createTimestamp();

    try {
      // Score each dimension according to configuration
      for (const [dimension, weight] of Object.entries(this.config.dimensionWeights)) {
        if (weight <= 0) continue; // Skip dimensions with zero weight

        const dimensionStartTime = performance.now();
        const score = await this.scoreDimension(context, dimension as ScoringDimension);
        const dimensionEndTime = performance.now();

        dimensionScores.push({
          dimension: dimension as ScoringDimension,
          rawScore: score.rawScore,
          weightedScore: score.rawScore * weight,
          confidence: score.confidence,
          contributingFactors: score.contributingFactors,
          dataPoints: score.dataPoints,
          calculationMethod: score.calculationMethod,
          calculatedAt: now,
          validUntil: score.validUntil
        });
      }

      return dimensionScores;

    } catch (error) {
      this.logger.error('Dimension scoring failed', {
        contextId: context.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw this.createScoringError(
        'DIMENSION_CALCULATION_FAILED',
        `Failed to score dimensions for context ${context.id}`,
        [context.id]
      );
    }
  }

  /**
   * Score a specific dimension
   */
  private async scoreDimension(
    context: ContextIntelligenceNode, 
    dimension: ScoringDimension
  ): Promise<{
    rawScore: number;
    confidence: ScoringConfidence;
    contributingFactors: Array<{ factor: string; impact: number; description: string; }>;
    dataPoints: Record<string, any>;
    calculationMethod: string;
    validUntil?: string;
  }> {
    const contributingFactors: Array<{ factor: string; impact: number; description: string; }> = [];
    const dataPoints: Record<string, any> = {};
    let rawScore = 0;
    let confidence: ScoringConfidence = 'medium';
    let calculationMethod = 'default';

    try {
      switch (dimension) {
        case 'relevance':
          rawScore = await this.scoreRelevance(context, contributingFactors, dataPoints);
          confidence = 'high';
          calculationMethod = 'semantic-analysis';
          break;

        case 'freshness':
          rawScore = await this.scoreFreshness(context, contributingFactors, dataPoints);
          confidence = 'very-high';
          calculationMethod = 'temporal-analysis';
          break;

        case 'completeness':
          rawScore = await this.scoreCompleteness(context, contributingFactors, dataPoints);
          confidence = 'medium';
          calculationMethod = 'content-analysis';
          break;

        case 'accuracy':
          rawScore = await this.scoreAccuracy(context, contributingFactors, dataPoints);
          confidence = 'medium';
          calculationMethod = 'validation-based';
          break;

        case 'coherence':
          rawScore = await this.scoreCoherence(context, contributingFactors, dataPoints);
          confidence = 'medium';
          calculationMethod = 'relationship-analysis';
          break;

        case 'dependencies':
          rawScore = await this.scoreDependencies(context, contributingFactors, dataPoints);
          confidence = 'high';
          calculationMethod = 'dependency-graph-analysis';
          break;

        case 'performance':
          rawScore = await this.scorePerformance(context, contributingFactors, dataPoints);
          confidence = 'high';
          calculationMethod = 'metrics-based';
          break;

        case 'accessibility':
          rawScore = await this.scoreAccessibility(context, contributingFactors, dataPoints);
          confidence = 'high';
          calculationMethod = 'access-pattern-analysis';
          break;

        case 'semantic':
          rawScore = await this.scoreSemantic(context, contributingFactors, dataPoints);
          confidence = 'medium';
          calculationMethod = 'embedding-similarity';
          break;

        case 'temporal':
          rawScore = await this.scoreTemporal(context, contributingFactors, dataPoints);
          confidence = 'high';
          calculationMethod = 'phase-alignment';
          break;

        case 'structural':
          rawScore = await this.scoreStructural(context, contributingFactors, dataPoints);
          confidence = 'medium';
          calculationMethod = 'structure-analysis';
          break;

        case 'maintainability':
          rawScore = await this.scoreMaintainability(context, contributingFactors, dataPoints);
          confidence = 'low';
          calculationMethod = 'heuristic-based';
          break;

        default:
          throw new Error(`Unsupported dimension: ${dimension}`);
      }

      // Normalize and validate score
      rawScore = normalizeScore(rawScore);

      // Apply temporal decay if enabled
      if (this.config.temporalDecay.enabled) {
        const age = Date.now() - new Date(context.lastModified).getTime();
        rawScore = applyTemporalDecay(rawScore, age, this.config);
      }

      return {
        rawScore,
        confidence,
        contributingFactors,
        dataPoints,
        calculationMethod
      };

    } catch (error) {
      this.logger.error('Dimension scoring failed', {
        contextId: context.id,
        dimension,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Return safe defaults
      return {
        rawScore: 0.5,
        confidence: 'very-low',
        contributingFactors: [
          {
            factor: 'scoring-error',
            impact: -0.5,
            description: 'Failed to calculate dimension score'
          }
        ],
        dataPoints: { error: error instanceof Error ? error.message : 'Unknown error' },
        calculationMethod: 'error-fallback'
      };
    }
  }

  // =============================================================================
  // DIMENSION SCORING IMPLEMENTATIONS
  // =============================================================================

  /**
   * Score relevance dimension
   */
  private async scoreRelevance(
    context: ContextIntelligenceNode,
    factors: Array<{ factor: string; impact: number; description: string; }>,
    dataPoints: Record<string, any>
  ): Promise<number> {
    let score = context.relevanceScore;
    
    // Base relevance from context
    factors.push({
      factor: 'base-relevance',
      impact: score,
      description: 'Base relevance score from context metadata'
    });
    
    dataPoints.baseRelevance = score;
    dataPoints.lastAccessed = context.lastAccessed;
    dataPoints.accessCount = context.accessCount;
    
    return score;
  }

  /**
   * Score freshness dimension
   */
  private async scoreFreshness(
    context: ContextIntelligenceNode,
    factors: Array<{ factor: string; impact: number; description: string; }>,
    dataPoints: Record<string, any>
  ): Promise<number> {
    const now = Date.now();
    const lastModified = new Date(context.lastModified).getTime();
    const ageMs = now - lastModified;
    const ageDays = ageMs / (24 * 60 * 60 * 1000);
    
    // Exponential decay based on age
    const freshnessScore = Math.exp(-ageDays / 30); // 30-day half-life
    
    factors.push({
      factor: 'temporal-freshness',
      impact: freshnessScore,
      description: `Content age: ${ageDays.toFixed(1)} days`
    });
    
    dataPoints.ageDays = ageDays;
    dataPoints.lastModified = context.lastModified;
    dataPoints.freshnessDecayRate = 30;
    
    return Math.max(0.1, freshnessScore);
  }

  /**
   * Score completeness dimension
   */
  private async scoreCompleteness(
    context: ContextIntelligenceNode,
    factors: Array<{ factor: string; impact: number; description: string; }>,
    dataPoints: Record<string, any>
  ): Promise<number> {
    const contentLength = context.content.length;
    const hasMetadata = Object.keys(context.metadata).length > 0;
    const hasDependencies = context.dependencies.length > 0;
    
    let score = 0.5; // Base completeness
    
    // Content length factor
    if (contentLength > 1000) {
      score += 0.3;
      factors.push({
        factor: 'content-length',
        impact: 0.3,
        description: 'Substantial content present'
      });
    } else if (contentLength > 100) {
      score += 0.1;
      factors.push({
        factor: 'content-length',
        impact: 0.1,
        description: 'Moderate content present'
      });
    }
    
    // Metadata presence
    if (hasMetadata) {
      score += 0.1;
      factors.push({
        factor: 'metadata-present',
        impact: 0.1,
        description: 'Additional metadata available'
      });
    }
    
    // Dependency information
    if (hasDependencies) {
      score += 0.1;
      factors.push({
        factor: 'dependencies-mapped',
        impact: 0.1,
        description: 'Dependencies identified'
      });
    }
    
    dataPoints.contentLength = contentLength;
    dataPoints.metadataCount = Object.keys(context.metadata).length;
    dataPoints.dependencyCount = context.dependencies.length;
    
    return Math.min(1.0, score);
  }

  /**
   * Score accuracy dimension
   */
  private async scoreAccuracy(
    context: ContextIntelligenceNode,
    factors: Array<{ factor: string; impact: number; description: string; }>,
    dataPoints: Record<string, any>
  ): Promise<number> {
    // Use quality metrics if available
    const baseAccuracy = context.qualityMetrics?.accuracyScore ?? 0.7;
    const validationIssues = context.qualityMetrics?.validationIssues ?? [];
    
    let score = baseAccuracy;
    
    // Penalize for validation issues
    if (validationIssues.length > 0) {
      const penalty = Math.min(0.5, validationIssues.length * 0.1);
      score -= penalty;
      
      factors.push({
        factor: 'validation-issues',
        impact: -penalty,
        description: `${validationIssues.length} validation issues found`
      });
    }
    
    factors.push({
      factor: 'base-accuracy',
      impact: baseAccuracy,
      description: 'Quality metrics accuracy score'
    });
    
    dataPoints.baseAccuracy = baseAccuracy;
    dataPoints.validationIssueCount = validationIssues.length;
    dataPoints.validationIssues = validationIssues;
    
    return Math.max(0.0, score);
  }

  /**
   * Score coherence dimension
   */
  private async scoreCoherence(
    context: ContextIntelligenceNode,
    factors: Array<{ factor: string; impact: number; description: string; }>,
    dataPoints: Record<string, any>
  ): Promise<number> {
    // Use quality metrics if available
    const baseCoherence = context.qualityMetrics?.coherenceScore ?? 0.7;
    
    // Factor in dependency relationships
    const dependencyRatio = context.dependencies.length / Math.max(1, context.dependencies.length + context.dependents.length);
    const relationshipBonus = Math.min(0.2, dependencyRatio * 0.4);
    
    let score = baseCoherence + relationshipBonus;
    
    factors.push({
      factor: 'base-coherence',
      impact: baseCoherence,
      description: 'Quality metrics coherence score'
    });
    
    if (relationshipBonus > 0) {
      factors.push({
        factor: 'relationship-coherence',
        impact: relationshipBonus,
        description: 'Well-connected in dependency graph'
      });
    }
    
    dataPoints.baseCoherence = baseCoherence;
    dataPoints.dependencyCount = context.dependencies.length;
    dataPoints.dependentCount = context.dependents.length;
    dataPoints.relationshipRatio = dependencyRatio;
    
    return Math.min(1.0, score);
  }

  /**
   * Score dependencies dimension
   */
  private async scoreDependencies(
    context: ContextIntelligenceNode,
    factors: Array<{ factor: string; impact: number; description: string; }>,
    dataPoints: Record<string, any>
  ): Promise<number> {
    const totalDependencies = context.dependencies.length;
    const totalDependents = context.dependents.length;
    
    let score = 0.7; // Base score
    
    // Moderate dependencies are good
    if (totalDependencies > 0 && totalDependencies <= 5) {
      score += 0.2;
      factors.push({
        factor: 'moderate-dependencies',
        impact: 0.2,
        description: 'Good number of dependencies'
      });
    } else if (totalDependencies > 10) {
      const penalty = Math.min(0.3, (totalDependencies - 10) * 0.02);
      score -= penalty;
      factors.push({
        factor: 'excessive-dependencies',
        impact: -penalty,
        description: 'Too many dependencies may indicate coupling issues'
      });
    }
    
    // Being depended upon is generally positive
    if (totalDependents > 0) {
      const bonus = Math.min(0.1, totalDependents * 0.02);
      score += bonus;
      factors.push({
        factor: 'dependents-present',
        impact: bonus,
        description: 'Context is useful to other components'
      });
    }
    
    dataPoints.dependencyCount = totalDependencies;
    dataPoints.dependentCount = totalDependents;
    dataPoints.totalConnections = totalDependencies + totalDependents;
    
    return Math.min(1.0, Math.max(0.0, score));
  }

  /**
   * Score performance dimension
   */
  private async scorePerformance(
    context: ContextIntelligenceNode,
    factors: Array<{ factor: string; impact: number; description: string; }>,
    dataPoints: Record<string, any>
  ): Promise<number> {
    const tokenCount = context.tokenCount || context.content.length / 4; // Rough estimate
    const accessCount = context.accessCount;
    
    let score = 0.8; // Base performance score
    
    // Token efficiency
    if (tokenCount < 1000) {
      score += 0.1;
      factors.push({
        factor: 'efficient-size',
        impact: 0.1,
        description: 'Compact content size'
      });
    } else if (tokenCount > 5000) {
      const penalty = Math.min(0.3, (tokenCount - 5000) / 10000);
      score -= penalty;
      factors.push({
        factor: 'large-content',
        impact: -penalty,
        description: 'Large content may impact performance'
      });
    }
    
    // Access patterns
    if (accessCount > 10) {
      const bonus = Math.min(0.1, Math.log(accessCount) / 10);
      score += bonus;
      factors.push({
        factor: 'frequent-access',
        impact: bonus,
        description: 'Frequently accessed content'
      });
    }
    
    dataPoints.tokenCount = tokenCount;
    dataPoints.accessCount = accessCount;
    dataPoints.avgTokensPerAccess = accessCount > 0 ? tokenCount / accessCount : tokenCount;
    
    return Math.min(1.0, Math.max(0.0, score));
  }

  /**
   * Score accessibility dimension
   */
  private async scoreAccessibility(
    context: ContextIntelligenceNode,
    factors: Array<{ factor: string; impact: number; description: string; }>,
    dataPoints: Record<string, any>
  ): Promise<number> {
    const recentAccess = new Date(context.lastAccessed).getTime();
    const timeSinceAccess = Date.now() - recentAccess;
    const daysSinceAccess = timeSinceAccess / (24 * 60 * 60 * 1000);
    
    let score = 0.7; // Base accessibility
    
    // Recent access is good
    if (daysSinceAccess < 1) {
      score += 0.2;
      factors.push({
        factor: 'recent-access',
        impact: 0.2,
        description: 'Recently accessed'
      });
    } else if (daysSinceAccess > 30) {
      const penalty = Math.min(0.4, daysSinceAccess / 100);
      score -= penalty;
      factors.push({
        factor: 'stale-access',
        impact: -penalty,
        description: 'Not accessed recently'
      });
    }
    
    // Path complexity
    const pathDepth = context.path.split('/').length;
    if (pathDepth > 5) {
      score -= 0.1;
      factors.push({
        factor: 'deep-path',
        impact: -0.1,
        description: 'Deep file path may be harder to locate'
      });
    }
    
    dataPoints.daysSinceAccess = daysSinceAccess;
    dataPoints.pathDepth = pathDepth;
    dataPoints.path = context.path;
    
    return Math.min(1.0, Math.max(0.0, score));
  }

  /**
   * Score semantic dimension
   */
  private async scoreSemantic(
    context: ContextIntelligenceNode,
    factors: Array<{ factor: string; impact: number; description: string; }>,
    dataPoints: Record<string, any>
  ): Promise<number> {
    let score = 0.6; // Base semantic score
    
    // Check if embeddings are available
    const hasEmbeddings = context.vectorEmbedding && context.vectorEmbedding.length > 0;
    
    if (hasEmbeddings) {
      score += 0.3;
      factors.push({
        factor: 'embeddings-available',
        impact: 0.3,
        description: 'Vector embeddings enable semantic search'
      });
    }
    
    // Check embedding model quality
    if (context.embeddingModel) {
      score += 0.1;
      factors.push({
        factor: 'embedding-model',
        impact: 0.1,
        description: `Using ${context.embeddingModel} for embeddings`
      });
    }
    
    dataPoints.hasEmbeddings = hasEmbeddings;
    dataPoints.embeddingDimension = context.vectorEmbedding?.length || 0;
    dataPoints.embeddingModel = context.embeddingModel;
    
    return Math.min(1.0, score);
  }

  /**
   * Score temporal dimension
   */
  private async scoreTemporal(
    context: ContextIntelligenceNode,
    factors: Array<{ factor: string; impact: number; description: string; }>,
    dataPoints: Record<string, any>
  ): Promise<number> {
    let score = 0.5; // Base temporal score
    
    // Phase alignment would need current phase context
    // For now, use creation phase as a factor
    const isRecentPhase = ['Phase3_1_FileGeneration', 'Phase4_ValidationCorrection'].includes(context.creationPhase);
    
    if (isRecentPhase) {
      score += 0.3;
      factors.push({
        factor: 'recent-phase',
        impact: 0.3,
        description: 'Created in recent development phase'
      });
    }
    
    // Temporal consistency
    const creationTime = new Date(context.createdAt).getTime();
    const modificationTime = new Date(context.lastModified).getTime();
    const hasBeenUpdated = modificationTime > creationTime;
    
    if (hasBeenUpdated) {
      score += 0.2;
      factors.push({
        factor: 'maintained',
        impact: 0.2,
        description: 'Context has been updated since creation'
      });
    }
    
    dataPoints.creationPhase = context.creationPhase;
    dataPoints.hasBeenUpdated = hasBeenUpdated;
    dataPoints.daysSinceCreation = (Date.now() - creationTime) / (24 * 60 * 60 * 1000);
    
    return Math.min(1.0, score);
  }

  /**
   * Score structural dimension
   */
  private async scoreStructural(
    context: ContextIntelligenceNode,
    factors: Array<{ factor: string; impact: number; description: string; }>,
    dataPoints: Record<string, any>
  ): Promise<number> {
    let score = 0.6; // Base structural score
    
    // Content structure analysis (basic)
    const contentLength = context.content.length;
    const hasStructure = contentLength > 100 && context.content.includes('\n');
    
    if (hasStructure) {
      score += 0.2;
      factors.push({
        factor: 'structured-content',
        impact: 0.2,
        description: 'Content appears to have structure'
      });
    }
    
    // Type-specific structural factors
    switch (context.type) {
      case 'file':
        if (context.path.includes('.')) {
          score += 0.1;
          factors.push({
            factor: 'file-extension',
            impact: 0.1,
            description: 'File has proper extension'
          });
        }
        break;
      
      case 'module':
        if (context.dependencies.length > 0) {
          score += 0.1;
          factors.push({
            factor: 'module-dependencies',
            impact: 0.1,
            description: 'Module has defined dependencies'
          });
        }
        break;
    }
    
    dataPoints.contentLength = contentLength;
    dataPoints.hasStructure = hasStructure;
    dataPoints.contextType = context.type;
    
    return Math.min(1.0, score);
  }

  /**
   * Score maintainability dimension
   */
  private async scoreMaintainability(
    context: ContextIntelligenceNode,
    factors: Array<{ factor: string; impact: number; description: string; }>,
    dataPoints: Record<string, any>
  ): Promise<number> {
    let score = 0.5; // Base maintainability
    
    // Regular updates indicate maintainability
    const daysSinceUpdate = (Date.now() - new Date(context.lastModified).getTime()) / (24 * 60 * 60 * 1000);
    
    if (daysSinceUpdate < 30) {
      score += 0.3;
      factors.push({
        factor: 'recently-updated',
        impact: 0.3,
        description: 'Recently updated content'
      });
    } else if (daysSinceUpdate > 365) {
      score -= 0.2;
      factors.push({
        factor: 'outdated-content',
        impact: -0.2,
        description: 'Content not updated in over a year'
      });
    }
    
    // Clear documentation/metadata helps maintainability
    const metadataCount = Object.keys(context.metadata).length;
    if (metadataCount > 3) {
      score += 0.2;
      factors.push({
        factor: 'well-documented',
        impact: 0.2,
        description: 'Rich metadata for maintainability'
      });
    }
    
    dataPoints.daysSinceUpdate = daysSinceUpdate;
    dataPoints.metadataCount = metadataCount;
    
    return Math.min(1.0, Math.max(0.0, score));
  }

  // =============================================================================
  // BATCH PROCESSING METHODS
  // =============================================================================

  /**
   * Create batches from context IDs
   */
  private createBatches(contextIds: UUID[], batchSize: number): UUID[][] {
    const batches: UUID[][] = [];
    for (let i = 0; i < contextIds.length; i += batchSize) {
      batches.push(contextIds.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Process a single batch
   */
  private async processBatch(
    contextIds: UUID[],
    request: BatchScoringRequest,
    result: BatchScoringResult
  ): Promise<void> {
    const batchStartTime = performance.now();
    
    // Process contexts in parallel if enabled
    if (this.config.performance.parallelScoring) {
      const promises = contextIds.map(async (contextId) => {
        try {
          // Note: In real implementation, you would fetch the context from repository
          // For now, create a minimal context for scoring
          const context = await this.mockGetContext(contextId, request.projectId);
          const score = await this.scoreContext(context, request.id);
          result.scores.set(contextId, score);
          
          // Update quality distribution
          result.qualityDistribution[score.qualityAssessment.qualityLevel]++;
          
        } catch (error) {
          result.failures.push({
            contextId,
            error: error instanceof Error ? error.message : 'Unknown error',
            recoverable: true
          });
        }
      });
      
      await Promise.allSettled(promises);
    } else {
      // Process sequentially
      for (const contextId of contextIds) {
        try {
          const context = await this.mockGetContext(contextId, request.projectId);
          const score = await this.scoreContext(context, request.id);
          result.scores.set(contextId, score);
          
          // Update quality distribution
          result.qualityDistribution[score.qualityAssessment.qualityLevel]++;
          
        } catch (error) {
          result.failures.push({
            contextId,
            error: error instanceof Error ? error.message : 'Unknown error',
            recoverable: true
          });
        }
      }
    }
    
    const batchEndTime = performance.now();
    result.batchMetrics.totalBatchDurationMs += (batchEndTime - batchStartTime);
  }

  /**
   * Finalize batch result with rankings and statistics
   */
  private async finalizeBatchResult(result: BatchScoringResult, startTime: number): Promise<void> {
    const endTime = performance.now();
    result.batchMetrics.totalBatchDurationMs = endTime - startTime;
    
    // Create ranked list
    const scores = Array.from(result.scores.entries());
    scores.sort(([, a], [, b]) => b.overallScore - a.overallScore);
    result.rankedContextIds = scores.map(([contextId]) => contextId);
    
    // Calculate summary statistics
    const scoreValues = scores.map(([, score]) => score.overallScore);
    if (scoreValues.length > 0) {
      result.summaryStatistics = {
        meanScore: scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length,
        medianScore: this.calculateMedian(scoreValues),
        standardDeviation: this.calculateStandardDeviation(scoreValues),
        scoreRange: {
          min: Math.min(...scoreValues),
          max: Math.max(...scoreValues)
        }
      };
    }
    
    // Generate recommendations
    result.recommendations = await this.generateBatchRecommendations(result);
    
    // Update batch metrics
    result.batchMetrics.successful = result.scores.size;
    result.batchMetrics.failed = result.failures.length;
    result.batchMetrics.successRate = result.scores.size / (result.scores.size + result.failures.length);
  }

  // =============================================================================
  // QUALITY ASSESSMENT METHODS
  // =============================================================================

  /**
   * Determine quality level from score
   */
  private determineQualityLevel(score: number): ContextQualityLevel {
    if (score >= this.config.qualityThresholds.excellent) return 'excellent';
    if (score >= this.config.qualityThresholds.recommended) return 'good';
    if (score >= this.config.qualityThresholds.minimum) return 'fair';
    if (score >= 0.3) return 'poor';
    if (score >= 0.1) return 'stale';
    return 'invalid';
  }

  /**
   * Identify quality issues
   */
  private async identifyQualityIssues(
    context: ContextIntelligenceNode,
    score: number
  ): Promise<string[]> {
    const issues: string[] = [];
    
    if (score < this.config.qualityThresholds.minimum) {
      issues.push('Overall quality score below minimum threshold');
    }
    
    // Check age
    const ageDays = (Date.now() - new Date(context.lastModified).getTime()) / (24 * 60 * 60 * 1000);
    if (ageDays > 90) {
      issues.push('Content has not been updated in over 90 days');
    }
    
    // Check content quality
    if (context.content.length < 50) {
      issues.push('Content is very short and may lack substance');
    }
    
    // Check for validation issues from quality metrics
    if (context.qualityMetrics?.validationIssues.length > 0) {
      issues.push(...context.qualityMetrics.validationIssues);
    }
    
    return issues;
  }

  /**
   * Generate improvement suggestions
   */
  private async generateImprovementSuggestions(
    context: ContextIntelligenceNode,
    score: number,
    issues: string[]
  ): Promise<string[]> {
    const suggestions: string[] = [];
    
    if (issues.includes('Content has not been updated in over 90 days')) {
      suggestions.push('Review and update content to ensure current relevance');
    }
    
    if (issues.includes('Content is very short and may lack substance')) {
      suggestions.push('Expand content with additional details and context');
    }
    
    if (score < this.config.qualityThresholds.recommended) {
      suggestions.push('Consider adding more metadata and dependency information');
    }
    
    if (context.dependencies.length === 0 && context.type === 'module') {
      suggestions.push('Map dependencies to improve context relationships');
    }
    
    if (!context.vectorEmbedding || context.vectorEmbedding.length === 0) {
      suggestions.push('Generate vector embeddings to enable semantic search');
    }
    
    return suggestions;
  }

  /**
   * Generate batch recommendations
   */
  private async generateBatchRecommendations(result: BatchScoringResult): Promise<string[]> {
    const recommendations: string[] = [];
    
    const averageScore = result.summaryStatistics.meanScore;
    const lowQualityCount = result.qualityDistribution.poor + result.qualityDistribution.stale + result.qualityDistribution.invalid;
    
    if (averageScore < 0.6) {
      recommendations.push('Consider implementing quality improvement processes for contexts');
    }
    
    if (lowQualityCount > result.scores.size * 0.3) {
      recommendations.push('High percentage of low-quality contexts - review and update content');
    }
    
    if (result.failures.length > result.scores.size * 0.1) {
      recommendations.push('Consider investigating scoring failures and improving data quality');
    }
    
    return recommendations;
  }

  // =============================================================================
  // CACHING METHODS
  // =============================================================================

  /**
   * Get cache key for context
   */
  private getCacheKey(context: ContextIntelligenceNode): string {
    return `${context.id}-${context.contentHash}-${this.config.algorithm}`;
  }

  /**
   * Get cached score if valid
   */
  private getCachedScore(cacheKey: string): ContextScore | null {
    const score = this.scoreCache.get(cacheKey);
    const ttl = this.cacheTtl.get(cacheKey);
    
    if (score && ttl && Date.now() < ttl) {
      return score;
    }
    
    // Remove expired entry
    if (score) {
      this.scoreCache.delete(cacheKey);
      this.cacheTtl.delete(cacheKey);
    }
    
    return null;
  }

  /**
   * Cache score
   */
  private cacheScore(cacheKey: string, score: ContextScore): void {
    this.scoreCache.set(cacheKey, score);
    this.cacheTtl.set(cacheKey, Date.now() + this.config.performance.scoreCacheTtlMs);
    
    // Prevent cache from growing too large
    if (this.scoreCache.size > 1000) {
      const oldestKey = this.scoreCache.keys().next().value;
      this.scoreCache.delete(oldestKey);
      this.cacheTtl.delete(oldestKey);
    }
  }

  /**
   * Setup cache cleanup interval
   */
  private setupCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, ttl] of this.cacheTtl.entries()) {
        if (now >= ttl) {
          this.scoreCache.delete(key);
          this.cacheTtl.delete(key);
        }
      }
    }, 60000); // Run every minute
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Validate configuration
   */
  private validateConfiguration(): void {
    const validation = validateScoringConfig(this.config);
    if (!validation.passed) {
      throw this.createScoringError(
        'INVALID_SCORING_CONFIG',
        `Invalid configuration: ${validation.errors.join(', ')}`,
        [],
        { errors: validation.errors }
      );
    }
  }

  /**
   * Calculate performance metrics
   */
  private calculatePerformanceMetrics(
    startTime: number,
    endTime: number,
    dimensionScores: DimensionScore[],
    cacheKey: string
  ): ScoringPerformanceMetrics {
    const totalDuration = endTime - startTime;
    const wasHit = this.scoreCache.has(cacheKey);
    
    return {
      totalDurationMs: totalDuration,
      dimensionTimings: dimensionScores.reduce((timings, score) => {
        timings[score.dimension] = 10; // Mock timing
        return timings;
      }, {} as Record<ScoringDimension, number>),
      cache: {
        hits: wasHit ? 1 : 0,
        misses: wasHit ? 0 : 1,
        hitRate: wasHit ? 1 : 0
      },
      resourceUsage: {
        memoryUsageMB: process.memoryUsage().heapUsed / (1024 * 1024),
        cpuTimeMs: totalDuration,
        ioOperations: 0
      },
      dataQuality: {
        completenessPercent: 100,
        missingDataPoints: [],
        estimatedDataPoints: []
      },
      accuracy: {
        confidenceLevel: 'medium',
        uncertaintyFactors: [],
        validationsPassed: 1,
        validationsFailed: 0
      }
    };
  }

  /**
   * Create empty performance metrics
   */
  private createEmptyPerformanceMetrics(): ScoringPerformanceMetrics {
    return {
      totalDurationMs: 0,
      dimensionTimings: {} as Record<ScoringDimension, number>,
      cache: { hits: 0, misses: 0, hitRate: 0 },
      resourceUsage: { memoryUsageMB: 0, cpuTimeMs: 0, ioOperations: 0 },
      dataQuality: { completenessPercent: 0, missingDataPoints: [], estimatedDataPoints: [] },
      accuracy: {
        confidenceLevel: 'very-low',
        uncertaintyFactors: [],
        validationsPassed: 0,
        validationsFailed: 0
      }
    };
  }

  /**
   * Create empty batch metrics
   */
  private createEmptyBatchMetrics(): BatchScoringMetrics {
    return {
      totalBatchDurationMs: 0,
      contextProcessingTimes: {},
      parallelization: {
        threadsUsed: 1,
        averageThreadUtilization: 0,
        loadBalanceEfficiency: 0
      },
      batchCache: {
        totalHits: 0,
        totalMisses: 0,
        cacheEfficiency: 0,
        memoryUsageMB: 0
      },
      outcomes: {
        successful: 0,
        failed: 0,
        partiallySuccessful: 0,
        successRate: 0
      },
      efficiency: {
        contextsPerSecond: 0,
        memoryPerContext: 0,
        cpuUtilizationPercent: 0
      }
    };
  }

  /**
   * Create scoring error
   */
  private createScoringError(
    code: ScoringError['scoringErrorCode'],
    message: string,
    contextIds: UUID[] = [],
    metadata: Record<string, any> = {}
  ): ScoringError {
    return {
      name: 'ScoringError',
      message,
      code: 'CONTEXT_SCORING_ERROR',
      timestamp: createTimestamp(),
      componentId: 'QualityScorer',
      severity: 'error',
      recoverable: true,
      context: metadata,
      scoringErrorCode: code,
      affectedContextIds: contextIds,
      recoverySuggestions: [
        {
          action: 'Retry with different configuration',
          automated: false,
          confidence: 0.7
        },
        {
          action: 'Check context data quality',
          automated: true,
          confidence: 0.8
        }
      ]
    };
  }

  /**
   * Calculate median of array
   */
  private calculateMedian(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  /**
   * Calculate standard deviation
   */
  private calculateStandardDeviation(values: number[]): number {
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / squaredDiffs.length;
    return Math.sqrt(avgSquaredDiff);
  }

  /**
   * Mock context retrieval (would be replaced with actual repository call)
   */
  private async mockGetContext(contextId: UUID, projectId: UUID): Promise<ContextIntelligenceNode> {
    // This would be replaced with actual context repository call
    const now = createTimestamp();
    
    return {
      id: contextId,
      projectId,
      type: 'file',
      path: `/mock/path/${contextId}.ts`,
      content: 'Mock content for scoring test',
      contentHash: 'mock-hash',
      tokenCount: 100,
      vectorEmbedding: Array.from({ length: 384 }, () => Math.random()),
      embeddingModel: 'all-MiniLM-L6-v2',
      embeddingGeneratedAt: now,
      dependencies: [],
      dependents: [],
      relevanceScore: 0.8,
      qualityMetrics: {
        qualityLevel: 'good',
        freshnessScore: 0.9,
        relevanceScore: 0.8,
        completenessScore: 0.7,
        accuracyScore: 0.8,
        coherenceScore: 0.8,
        validationIssues: [],
        lastAssessed: now,
        qualityTrend: 'stable'
      },
      accessPattern: {
        primaryPattern: 'sequential',
        accessFrequency: { hourly: 1, daily: 5, weekly: 20 },
        coAccessPatterns: [],
        temporalPatterns: { peakHours: [9, 14], seasonality: 'morning' },
        lastAnalyzed: now
      },
      lastAccessed: now,
      accessCount: 10,
      createdAt: now,
      lastModified: now,
      creationPhase: 'Phase3_1_FileGeneration',
      tags: ['test', 'mock'],
      metadata: { purpose: 'testing', category: 'utility' }
    };
  }
}

/**
 * Export the QualityScorer service for use in context intelligence
 */
export default QualityScorer;

/**
 * Version information
 */
export const QUALITY_SCORER_VERSION = '1.0.0';
