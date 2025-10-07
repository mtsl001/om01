// packages/context-intelligence/services/RelevanceCalculator.ts

/**
 * Advanced Relevance Calculation Service for ReadyAI Personal AI Development Orchestrator
 * 
 * Multi-factor relevance scoring service adapted from Cline's ranking and scoring patterns
 * for ReadyAI's context intelligence architecture. Calculates comprehensive relevance scores
 * for context nodes using semantic similarity, content quality, recency, and project-specific
 * factors to optimize AI-powered development workflows.
 * 
 * Adapted from Cline's ranking and scoring systems (300+ lines)
 * Key Adaptations:
 * - Multi-dimensional relevance scoring from Cline's ranking algorithms
 * - Context-aware relevance calculation from Cline's context management
 * - Quality-weighted scoring from Cline's quality assessment patterns
 * - Temporal decay functions from Cline's recency handling
 * - Project-specific relevance from Cline's workspace-aware scoring
 * 
 * ReadyAI Enhancements:
 * - ReadyAI-specific relevance dimensions (development phase, code quality, etc.)
 * - Multi-factor relevance scoring with configurable weights
 * - Context relationship analysis for improved relevance
 * - Development lifecycle-aware relevance calculation
 * - Performance-optimized batch relevance computation
 * 
 * @version 1.0.0
 * @author ReadyAI Development Team
 */

import { 
  UUID, 
  ApiResponse, 
  ReadyAIError,
  createApiResponse,
  createApiError,
  wrapAsync,
  generateUUID,
  createTimestamp,
  PhaseType
} from '../../foundation/types/core';

import {
  ContextIntelligenceNode,
  ContextNodeType,
  ContextRelevanceScore,
  ContextRelevanceDimensions,
  ContextRelevanceConfig,
  ContextRelevanceResult,
  ContextRelevanceMetrics,
  RelevanceCalculationOptions,
  RelevanceScoringStrategy,
  DEFAULT_RELEVANCE_CONFIG,
  RELEVANCE_CONSTANTS,
  validateContextNode,
  calculateBasicRelevance
} from '../types/context';

import {
  RelevanceScoringMethod,
  RelevanceWeightConfig,
  MultiFactorRelevanceScore,
  RelevancePerformanceMetrics,
  AdvancedRelevanceOptions,
  ContentSimilarityScore,
  TemporalRelevanceScore
} from '../types/scoring';

import { ContextVectorizer } from './ContextVectorizer';
import { Logger } from '../../logging/services/Logger';

// =============================================================================
// RELEVANCE CALCULATOR SERVICE
// =============================================================================

/**
 * Advanced relevance calculation service with Cline-inspired multi-factor scoring
 * Handles context-specific relevance calculation and intelligent ranking
 */
export class RelevanceCalculator {
  private readonly logger: Logger;
  private readonly vectorizer: ContextVectorizer;
  
  // Configuration and state
  private config: ContextRelevanceConfig;
  private isInitialized: boolean = false;
  
  // Caching and performance optimization (adapted from Cline patterns)
  private readonly relevanceCache: Map<string, ContextRelevanceResult> = new Map();
  private readonly similarityCache: Map<string, ContentSimilarityScore> = new Map();
  private readonly batchProcessingQueue: Map<UUID, Promise<any>> = new Map();
  
  // Performance tracking
  private performanceMetrics: RelevancePerformanceMetrics = {
    totalCalculations: 0,
    averageCalculationTime: 0,
    cacheHitRate: 0,
    batchProcessingTime: 0,
    similarityCalculationTime: 0
  };

  constructor(
    config: ContextRelevanceConfig = DEFAULT_RELEVANCE_CONFIG,
    vectorizer: ContextVectorizer,
    logger: Logger
  ) {
    this.config = { ...config };
    this.vectorizer = vectorizer;
    this.logger = logger;

    this.logger.info('RelevanceCalculator initialized with configuration', {
      scoringMethod: config.scoringMethod,
      enableCache: config.performance.enableCache,
      maxCacheSize: config.performance.maxCacheSize
    });
  }

  /**
   * Initialize the relevance calculator with health checks
   * Adapted from Cline's initialization patterns
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize vectorizer if not already initialized
      if (!this.vectorizer) {
        throw new ReadyAIError(
          'ContextVectorizer is required for relevance calculation',
          'MISSING_DEPENDENCY',
          500
        );
      }

      // Start background cleanup if enabled
      if (this.config.performance.enableCache) {
        this.startBackgroundCleanup();
      }

      this.isInitialized = true;
      this.logger.info('RelevanceCalculator fully initialized');

    } catch (error) {
      const calculatorError = new ReadyAIError(
        `Failed to initialize RelevanceCalculator: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'INITIALIZATION_FAILED',
        500,
        { originalError: error },
        true,
        5000
      );
      
      this.logger.error('RelevanceCalculator initialization failed', { error: calculatorError });
      throw calculatorError;
    }
  }

  /**
   * Calculate relevance score for a single context node against a query
   * Primary interface for relevance calculation with comprehensive scoring
   */
  async calculateRelevance(
    context: ContextIntelligenceNode,
    query: string,
    options?: RelevanceCalculationOptions
  ): Promise<ApiResponse<ContextRelevanceResult>> {
    return wrapAsync(async () => {
      const startTime = performance.now();
      const operationId = generateUUID();

      this.logger.debug('Starting relevance calculation', {
        operationId,
        contextId: context.id,
        contextType: context.type,
        queryLength: query.length,
        scoringMethod: options?.scoringMethod || this.config.scoringMethod
      });

      // Check cache first if enabled
      if (this.config.performance.enableCache && !options?.forceRecalculation) {
        const cached = this.getCachedRelevance(context, query, options);
        if (cached) {
          this.logger.debug('Using cached relevance', {
            operationId,
            contextId: context.id
          });
          return cached;
        }
      }

      // Validate context node
      const validation = validateContextNode(context);
      if (!validation.passed) {
        throw new ReadyAIError(
          `Context validation failed: ${validation.errors.join(', ')}`,
          'CONTEXT_VALIDATION_FAILED',
          400,
          { validation }
        );
      }

      // Determine scoring method
      const scoringMethod = options?.scoringMethod || this.config.scoringMethod;

      // Calculate relevance using specified method
      let relevanceScore: ContextRelevanceScore;
      
      switch (scoringMethod) {
        case 'semantic':
          relevanceScore = await this.calculateSemanticRelevance(context, query, options);
          break;
        
        case 'multi-factor':
          relevanceScore = await this.calculateMultiFactorRelevance(context, query, options);
          break;
        
        case 'hybrid':
          relevanceScore = await this.calculateHybridRelevance(context, query, options);
          break;
        
        case 'adaptive':
          relevanceScore = await this.calculateAdaptiveRelevance(context, query, options);
          break;
        
        default:
          relevanceScore = await this.calculateSemanticRelevance(context, query, options);
      }

      // Calculate relevance dimensions
      const dimensions = await this.calculateRelevanceDimensions(context, query, options);

      // Generate relevance metrics
      const metrics = await this.generateRelevanceMetrics(context, query, relevanceScore, dimensions);

      const durationMs = performance.now() - startTime;

      const result: ContextRelevanceResult = {
        operationId,
        contextId: context.id,
        query,
        relevanceScore,
        dimensions,
        metrics,
        scoringMethod,
        calculatedAt: createTimestamp(),
        durationMs
      };

      // Cache result if enabled
      if (this.config.performance.enableCache) {
        this.cacheRelevance(context, query, result, options);
      }

      // Update performance metrics
      this.updatePerformanceMetrics(durationMs);

      this.logger.info('Relevance calculation completed', {
        operationId,
        contextId: context.id,
        overallScore: relevanceScore.overall,
        duration: durationMs
      });

      return result;

    }).then(result => {
      if (result.success) {
        return createApiResponse(result.data);
      } else {
        throw result.error;
      }
    });
  }

  /**
   * Calculate relevance scores for multiple context nodes in batch
   * Optimized batch processing from Cline's batch patterns
   */
  async calculateBatchRelevance(
    contexts: ContextIntelligenceNode[],
    query: string,
    options?: RelevanceCalculationOptions & {
      batchSize?: number;
      concurrency?: number;
      progressCallback?: (completed: number, total: number) => void;
    }
  ): Promise<ApiResponse<ContextRelevanceResult[]>> {
    return wrapAsync(async () => {
      const startTime = performance.now();
      const operationId = generateUUID();
      
      const batchSize = options?.batchSize || this.config.performance.batchSize;
      const concurrency = options?.concurrency || this.config.performance.concurrency;

      this.logger.info('Starting batch relevance calculation', {
        operationId,
        totalContexts: contexts.length,
        batchSize,
        concurrency,
        query: query.substring(0, 100)
      });

      const results: ContextRelevanceResult[] = [];
      const batches = this.createBatches(contexts, batchSize);
      
      let completed = 0;

      // Process batches with concurrency control
      for (const batch of batches) {
        const batchPromises = batch.map(async (context, index) => {
          try {
            const result = await this.calculateRelevance(context, query, options);
            if (result.success) {
              completed++;
              options?.progressCallback?.(completed, contexts.length);
              return result.data;
            } else {
              this.logger.warn('Context relevance calculation failed in batch', {
                contextId: context.id,
                error: result.error
              });
              return null;
            }
          } catch (error) {
            this.logger.error('Batch relevance calculation error', {
              contextId: context.id,
              error
            });
            return null;
          }
        });

        // Wait for batch completion with concurrency limit
        const batchResults = await this.processConcurrently(batchPromises, concurrency);
        results.push(...batchResults.filter((r): r is ContextRelevanceResult => r !== null));
      }

      const durationMs = performance.now() - startTime;

      // Update batch processing metrics
      this.performanceMetrics.batchProcessingTime = 
        (this.performanceMetrics.batchProcessingTime + durationMs) / 2;

      this.logger.info('Batch relevance calculation completed', {
        operationId,
        totalContexts: contexts.length,
        successfulCalculations: results.length,
        duration: durationMs,
        averageDuration: durationMs / contexts.length
      });

      return results;

    }).then(result => {
      if (result.success) {
        return createApiResponse(result.data);
      } else {
        throw result.error;
      }
    });
  }

  /**
   * Calculate content similarity between contexts using advanced algorithms
   * Enhanced similarity calculation from Cline's similarity patterns
   */
  async calculateContentSimilarity(
    sourceContext: ContextIntelligenceNode,
    targetContext: ContextIntelligenceNode,
    options?: {
      method?: 'cosine' | 'euclidean' | 'jaccard' | 'semantic';
      includeMetadata?: boolean;
    }
  ): Promise<ApiResponse<ContentSimilarityScore>> {
    return wrapAsync(async () => {
      const operationId = generateUUID();
      const method = options?.method || 'semantic';

      // Check similarity cache
      const cacheKey = `${sourceContext.id}_${targetContext.id}_${method}`;
      if (this.config.performance.enableCache) {
        const cached = this.similarityCache.get(cacheKey);
        if (cached) {
          return cached;
        }
      }

      this.logger.debug('Calculating content similarity', {
        operationId,
        sourceId: sourceContext.id,
        targetId: targetContext.id,
        method
      });

      let similarity: ContentSimilarityScore;

      switch (method) {
        case 'cosine':
          similarity = await this.calculateCosineSimilarity(sourceContext, targetContext);
          break;
        
        case 'euclidean':
          similarity = await this.calculateEuclideanSimilarity(sourceContext, targetContext);
          break;
        
        case 'jaccard':
          similarity = await this.calculateJaccardSimilarity(sourceContext, targetContext);
          break;
        
        case 'semantic':
          similarity = await this.calculateSemanticSimilarity(sourceContext, targetContext);
          break;
        
        default:
          similarity = await this.calculateSemanticSimilarity(sourceContext, targetContext);
      }

      // Include metadata similarity if requested
      if (options?.includeMetadata) {
        const metadataSimilarity = this.calculateMetadataSimilarity(sourceContext, targetContext);
        similarity.metadata = metadataSimilarity;
        similarity.overall = (similarity.overall + metadataSimilarity) / 2;
      }

      // Cache result
      if (this.config.performance.enableCache) {
        this.similarityCache.set(cacheKey, similarity);
      }

      return similarity;

    }).then(result => {
      if (result.success) {
        return createApiResponse(result.data);
      } else {
        throw result.error;
      }
    });
  }

  /**
   * Rank contexts by relevance to a query with advanced sorting
   * Enhanced ranking from Cline's ranking algorithms
   */
  async rankContextsByRelevance(
    contexts: ContextIntelligenceNode[],
    query: string,
    options?: {
      limit?: number;
      minRelevanceScore?: number;
      sortStrategy?: 'overall' | 'semantic' | 'temporal' | 'composite';
      includeScores?: boolean;
    }
  ): Promise<ApiResponse<{
    rankedContexts: (ContextIntelligenceNode & { relevanceScore?: ContextRelevanceScore })[];
    totalProcessed: number;
    averageRelevance: number;
    rankingMetrics: {
      processingTime: number;
      cacheHitRate: number;
      filteredCount: number;
    };
  }>> {
    return wrapAsync(async () => {
      const startTime = performance.now();
      const operationId = generateUUID();

      this.logger.info('Starting context ranking by relevance', {
        operationId,
        totalContexts: contexts.length,
        query: query.substring(0, 100),
        sortStrategy: options?.sortStrategy || 'overall'
      });

      // Calculate relevance scores for all contexts
      const batchResult = await this.calculateBatchRelevance(contexts, query, {
        batchSize: this.config.performance.batchSize,
        concurrency: this.config.performance.concurrency
      });

      if (!batchResult.success) {
        throw batchResult.error;
      }

      const relevanceResults = batchResult.data;
      
      // Create context-relevance pairs
      const contextWithRelevance = contexts.map(context => {
        const relevanceResult = relevanceResults.find(r => r.contextId === context.id);
        return {
          ...context,
          relevanceScore: relevanceResult?.relevanceScore
        };
      }).filter(item => item.relevanceScore !== undefined);

      // Filter by minimum relevance score if specified
      const minScore = options?.minRelevanceScore || 0;
      const filteredContexts = contextWithRelevance.filter(
        item => (item.relevanceScore?.overall || 0) >= minScore
      );

      // Sort by relevance strategy
      const sortStrategy = options?.sortStrategy || 'overall';
      const sortedContexts = this.sortContextsByRelevance(filteredContexts, sortStrategy);

      // Apply limit if specified
      const limit = options?.limit;
      const rankedContexts = limit ? sortedContexts.slice(0, limit) : sortedContexts;

      // Remove relevance scores if not requested
      const finalRankedContexts = options?.includeScores 
        ? rankedContexts 
        : rankedContexts.map(({ relevanceScore, ...context }) => context);

      // Calculate metrics
      const totalRelevance = relevanceResults.reduce((sum, r) => sum + r.relevanceScore.overall, 0);
      const averageRelevance = totalRelevance / relevanceResults.length;
      const processingTime = performance.now() - startTime;

      const result = {
        rankedContexts: finalRankedContexts,
        totalProcessed: contexts.length,
        averageRelevance,
        rankingMetrics: {
          processingTime,
          cacheHitRate: this.calculateCurrentCacheHitRate(),
          filteredCount: contexts.length - filteredContexts.length
        }
      };

      this.logger.info('Context ranking completed', {
        operationId,
        totalProcessed: contexts.length,
        rankedCount: rankedContexts.length,
        averageRelevance,
        processingTime
      });

      return result;

    }).then(result => {
      if (result.success) {
        return createApiResponse(result.data);
      } else {
        throw result.error;
      }
    });
  }

  // =============================================================================
  // PRIVATE METHODS - RELEVANCE CALCULATION STRATEGIES
  // =============================================================================

  /**
   * Calculate semantic relevance using vector similarity
   * Enhanced semantic analysis from Cline's semantic patterns
   */
  private async calculateSemanticRelevance(
    context: ContextIntelligenceNode,
    query: string,
    options?: RelevanceCalculationOptions
  ): Promise<ContextRelevanceScore> {
    const startTime = performance.now();

    // Vectorize query and context for semantic comparison
    const [queryVector, contextVectors] = await Promise.all([
      this.vectorizeText(query),
      this.getContextVectors(context)
    ]);

    if (!contextVectors || contextVectors.length === 0) {
      return this.createDefaultRelevanceScore('semantic');
    }

    // Calculate semantic similarity with all context vectors
    const similarities = contextVectors.map(vector => 
      this.calculateVectorSimilarity(queryVector, vector.vector)
    );

    const maxSimilarity = Math.max(...similarities);
    const avgSimilarity = similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length;

    // Apply semantic boost for high-quality matches
    const qualityBoost = context.qualityScore > 0.8 ? 0.1 : 0;
    const semanticScore = Math.min(1.0, (maxSimilarity * 0.7 + avgSimilarity * 0.3) + qualityBoost);

    const duration = performance.now() - startTime;
    this.performanceMetrics.similarityCalculationTime = 
      (this.performanceMetrics.similarityCalculationTime + duration) / 2;

    return {
      overall: semanticScore,
      semantic: semanticScore,
      temporal: this.calculateTemporalScore(context),
      contextual: this.calculateContextualScore(context, query),
      quality: context.qualityScore,
      confidence: maxSimilarity > 0.8 ? 0.9 : maxSimilarity > 0.6 ? 0.7 : 0.5
    };
  }

  /**
   * Calculate multi-factor relevance using weighted scoring
   * Advanced multi-factor analysis from Cline's scoring patterns
   */
  private async calculateMultiFactorRelevance(
    context: ContextIntelligenceNode,
    query: string,
    options?: RelevanceCalculationOptions
  ): Promise<ContextRelevanceScore> {
    const weights = options?.weights || this.config.weights;

    // Calculate individual relevance factors
    const [semantic, temporal, contextual, quality] = await Promise.all([
      this.calculateSemanticComponent(context, query),
      this.calculateTemporalComponent(context),
      this.calculateContextualComponent(context, query),
      this.calculateQualityComponent(context)
    ]);

    // Apply ReadyAI-specific relevance dimensions
    const readyAIFactors = this.calculateReadyAISpecificFactors(context, query);

    // Weighted combination of all factors
    const overall = 
      (semantic * weights.semantic) +
      (temporal * weights.temporal) +
      (contextual * weights.contextual) +
      (quality * weights.quality) +
      (readyAIFactors.developmentRelevance * 0.1) +
      (readyAIFactors.phaseRelevance * 0.1);

    return {
      overall: Math.min(1.0, overall),
      semantic,
      temporal,
      contextual,
      quality,
      confidence: this.calculateConfidenceScore([semantic, temporal, contextual, quality])
    };
  }

  /**
   * Calculate hybrid relevance combining multiple strategies
   * Intelligent strategy combination from Cline's hybrid patterns
   */
  private async calculateHybridRelevance(
    context: ContextIntelligenceNode,
    query: string,
    options?: RelevanceCalculationOptions
  ): Promise<ContextRelevanceScore> {
    // Calculate using both semantic and multi-factor approaches
    const [semanticScore, multiFactorScore] = await Promise.all([
      this.calculateSemanticRelevance(context, query, options),
      this.calculateMultiFactorRelevance(context, query, options)
    ]);

    // Intelligently combine scores based on content characteristics
    const contentLength = context.content.length;
    const isLongContent = contentLength > RELEVANCE_CONSTANTS.LONG_CONTENT_THRESHOLD;
    
    // For long content, favor semantic analysis
    // For short content, favor multi-factor analysis
    const semanticWeight = isLongContent ? 0.7 : 0.4;
    const multiFactorWeight = 1 - semanticWeight;

    return {
      overall: (semanticScore.overall * semanticWeight) + (multiFactorScore.overall * multiFactorWeight),
      semantic: (semanticScore.semantic * semanticWeight) + (multiFactorScore.semantic * multiFactorWeight),
      temporal: Math.max(semanticScore.temporal, multiFactorScore.temporal),
      contextual: Math.max(semanticScore.contextual, multiFactorScore.contextual),
      quality: Math.max(semanticScore.quality, multiFactorScore.quality),
      confidence: Math.max(semanticScore.confidence, multiFactorScore.confidence)
    };
  }

  /**
   * Calculate adaptive relevance that adjusts based on context characteristics
   * Dynamic strategy selection from Cline's adaptive patterns
   */
  private async calculateAdaptiveRelevance(
    context: ContextIntelligenceNode,
    query: string,
    options?: RelevanceCalculationOptions
  ): Promise<ContextRelevanceScore> {
    // Analyze context characteristics to choose optimal strategy
    const contentComplexity = this.analyzeContentComplexity(context);
    const queryComplexity = this.analyzeQueryComplexity(query);
    
    // Choose strategy based on complexity analysis
    if (contentComplexity.isHighlyTechnical && queryComplexity.isSpecific) {
      return this.calculateSemanticRelevance(context, query, options);
    } else if (contentComplexity.hasMultipleTopics || queryComplexity.isBroad) {
      return this.calculateMultiFactorRelevance(context, query, options);
    } else {
      return this.calculateHybridRelevance(context, query, options);
    }
  }

  // =============================================================================
  // PRIVATE METHODS - RELEVANCE DIMENSIONS
  // =============================================================================

  /**
   * Calculate comprehensive relevance dimensions
   * Enhanced dimension analysis from Cline's context patterns
   */
  private async calculateRelevanceDimensions(
    context: ContextIntelligenceNode,
    query: string,
    options?: RelevanceCalculationOptions
  ): Promise<ContextRelevanceDimensions> {
    return {
      developmentPhase: this.calculateDevelopmentPhaseRelevance(context, query),
      codeQuality: this.calculateCodeQualityRelevance(context),
      projectContext: this.calculateProjectContextRelevance(context, query),
      technicalDepth: this.calculateTechnicalDepthRelevance(context, query),
      recency: this.calculateRecencyRelevance(context),
      completeness: this.calculateCompletenessRelevance(context),
      userIntent: this.calculateUserIntentRelevance(context, query)
    };
  }

  /**
   * Calculate development phase relevance
   */
  private calculateDevelopmentPhaseRelevance(context: ContextIntelligenceNode, query: string): number {
    const currentPhase = context.creationPhase;
    const queryPhaseIndicators = this.extractPhaseIndicators(query);
    
    // Higher relevance for contexts from current or related phases
    let phaseRelevance = 0.5; // Base relevance

    if (queryPhaseIndicators.includes(currentPhase)) {
      phaseRelevance = 0.9;
    } else if (this.areRelatedPhases(currentPhase, queryPhaseIndicators)) {
      phaseRelevance = 0.7;
    }

    return phaseRelevance;
  }

  /**
   * Calculate code quality relevance
   */
  private calculateCodeQualityRelevance(context: ContextIntelligenceNode): number {
    // Use existing quality score with ReadyAI-specific adjustments
    const baseQuality = context.qualityScore;
    
    // Boost relevance for high-quality contexts in development scenarios
    const qualityBoost = baseQuality > 0.8 ? 0.1 : 0;
    
    return Math.min(1.0, baseQuality + qualityBoost);
  }

  /**
   * Calculate project context relevance
   */
  private calculateProjectContextRelevance(context: ContextIntelligenceNode, query: string): number {
    // Analyze project-specific keywords and patterns
    const projectKeywords = this.extractProjectKeywords(context);
    const queryKeywords = this.extractQueryKeywords(query);
    
    const intersection = projectKeywords.filter(keyword => 
      queryKeywords.some(qk => qk.toLowerCase().includes(keyword.toLowerCase()))
    );
    
    return Math.min(1.0, intersection.length / Math.max(projectKeywords.length, 1));
  }

  // =============================================================================
  // PRIVATE METHODS - SIMILARITY CALCULATIONS
  // =============================================================================

  /**
   * Calculate cosine similarity between contexts
   */
  private async calculateCosineSimilarity(
    sourceContext: ContextIntelligenceNode,
    targetContext: ContextIntelligenceNode
  ): Promise<ContentSimilarityScore> {
    const [sourceVectors, targetVectors] = await Promise.all([
      this.getContextVectors(sourceContext),
      this.getContextVectors(targetContext)
    ]);

    if (!sourceVectors || !targetVectors || sourceVectors.length === 0 || targetVectors.length === 0) {
      return this.createDefaultSimilarityScore('cosine');
    }

    // Calculate average cosine similarity across all vector pairs
    let totalSimilarity = 0;
    let comparisons = 0;

    for (const sourceVector of sourceVectors) {
      for (const targetVector of targetVectors) {
        const similarity = this.calculateVectorCosineSimilarity(
          sourceVector.vector,
          targetVector.vector
        );
        totalSimilarity += similarity;
        comparisons++;
      }
    }

    const averageSimilarity = comparisons > 0 ? totalSimilarity / comparisons : 0;

    return {
      overall: averageSimilarity,
      method: 'cosine',
      confidence: comparisons > 0 ? 0.8 : 0.1,
      details: {
        comparisons,
        maxSimilarity: Math.max(...sourceVectors.flatMap(sv => 
          targetVectors.map(tv => this.calculateVectorCosineSimilarity(sv.vector, tv.vector))
        ))
      }
    };
  }

  /**
   * Calculate semantic similarity using advanced techniques
   */
  private async calculateSemanticSimilarity(
    sourceContext: ContextIntelligenceNode,
    targetContext: ContextIntelligenceNode
  ): Promise<ContentSimilarityScore> {
    // Combine cosine similarity with content analysis
    const cosineSim = await this.calculateCosineSimilarity(sourceContext, targetContext);
    
    // Add content-based similarity
    const contentSimilarity = this.calculateTextSimilarity(
      sourceContext.content,
      targetContext.content
    );
    
    // Combine with weighted average
    const overall = (cosineSim.overall * 0.7) + (contentSimilarity * 0.3);

    return {
      overall,
      method: 'semantic',
      confidence: Math.max(cosineSim.confidence, 0.6),
      details: {
        vectorSimilarity: cosineSim.overall,
        contentSimilarity,
        combinedScore: overall
      }
    };
  }

  // =============================================================================
  // PRIVATE METHODS - UTILITY FUNCTIONS
  // =============================================================================

  /**
   * Vectorize text using the vectorizer service
   */
  private async vectorizeText(text: string): Promise<number[]> {
    try {
      // Create a temporary context node for vectorization
      const tempContext: ContextIntelligenceNode = {
        id: generateUUID(),
        type: 'query',
        content: text,
        contentHash: this.generateContentHash(text),
        creationPhase: 'development' as PhaseType,
        qualityScore: 1.0,
        createdAt: createTimestamp(),
        lastModified: createTimestamp(),
        metadata: {}
      };

      const vectorResult = await this.vectorizer.vectorizeContext(tempContext);
      
      if (vectorResult.success && vectorResult.data.embeddings.length > 0) {
        return vectorResult.data.embeddings[0];
      }
      
      // Return zero vector if vectorization fails
      return new Array(384).fill(0); // Common embedding dimension
    } catch (error) {
      this.logger.warn('Failed to vectorize text', { error });
      return new Array(384).fill(0);
    }
  }

  /**
   * Get context vectors from vectorizer or cache
   */
  private async getContextVectors(context: ContextIntelligenceNode): Promise<Array<{vector: number[]}> | null> {
    try {
      const vectorResult = await this.vectorizer.vectorizeContext(context);
      
      if (vectorResult.success) {
        // Convert embeddings to expected format
        return vectorResult.data.embeddings.map(embedding => ({ vector: embedding }));
      }
      
      return null;
    } catch (error) {
      this.logger.warn('Failed to get context vectors', { contextId: context.id, error });
      return null;
    }
  }

  /**
   * Calculate vector similarity using cosine similarity
   */
  private calculateVectorSimilarity(vectorA: number[], vectorB: number[]): number {
    return this.calculateVectorCosineSimilarity(vectorA, vectorB);
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private calculateVectorCosineSimilarity(vectorA: number[], vectorB: number[]): number {
    if (vectorA.length !== vectorB.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
      normA += vectorA[i] * vectorA[i];
      normB += vectorB[i] * vectorB[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Calculate text similarity using simple text analysis
   */
  private calculateTextSimilarity(textA: string, textB: string): number {
    const wordsA = new Set(textA.toLowerCase().split(/\W+/).filter(word => word.length > 2));
    const wordsB = new Set(textB.toLowerCase().split(/\W+/).filter(word => word.length > 2));
    
    const intersection = new Set([...wordsA].filter(word => wordsB.has(word)));
    const union = new Set([...wordsA, ...wordsB]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Calculate temporal score based on recency and update frequency
   */
  private calculateTemporalScore(context: ContextIntelligenceNode): number {
    const now = Date.now();
    const createdTime = new Date(context.createdAt).getTime();
    const modifiedTime = new Date(context.lastModified).getTime();
    
    // Calculate age in days
    const ageInDays = (now - createdTime) / (1000 * 60 * 60 * 24);
    const daysSinceModified = (now - modifiedTime) / (1000 * 60 * 60 * 24);
    
    // Apply temporal decay
    const recencyScore = Math.exp(-ageInDays / RELEVANCE_CONSTANTS.TEMPORAL_DECAY_DAYS);
    const freshnessScore = Math.exp(-daysSinceModified / (RELEVANCE_CONSTANTS.TEMPORAL_DECAY_DAYS * 0.5));
    
    return Math.max(recencyScore, freshnessScore);
  }

  /**
   * Calculate contextual score based on content relationships
   */
  private calculateContextualScore(context: ContextIntelligenceNode, query: string): number {
    // Simple contextual scoring based on content type and query alignment
    const queryLower = query.toLowerCase();
    const contentLower = context.content.toLowerCase();
    
    // Check for direct mentions
    const directMentions = this.countDirectMentions(queryLower, contentLower);
    
    // Check for related terms
    const relatedTerms = this.findRelatedTerms(queryLower, contentLower);
    
    // Calculate contextual relevance
    const mentionScore = Math.min(1.0, directMentions * 0.3);
    const relationScore = Math.min(1.0, relatedTerms.length * 0.1);
    
    return Math.max(mentionScore, relationScore);
  }

  /**
   * Create batches from array for batch processing
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Process promises with concurrency control
   */
  private async processConcurrently<T>(
    promises: Promise<T>[],
    concurrency: number
  ): Promise<T[]> {
    const results: T[] = [];
    
    for (let i = 0; i < promises.length; i += concurrency) {
      const batch = promises.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch);
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * Sort contexts by relevance using specified strategy
   */
  private sortContextsByRelevance(
    contexts: (ContextIntelligenceNode & { relevanceScore?: ContextRelevanceScore })[],
    strategy: string
  ): typeof contexts {
    return contexts.sort((a, b) => {
      const scoreA = a.relevanceScore;
      const scoreB = b.relevanceScore;
      
      if (!scoreA || !scoreB) return 0;
      
      switch (strategy) {
        case 'semantic':
          return scoreB.semantic - scoreA.semantic;
        case 'temporal':
          return scoreB.temporal - scoreA.temporal;
        case 'composite':
          return (scoreB.semantic + scoreB.temporal + scoreB.quality) / 3 - 
                 (scoreA.semantic + scoreA.temporal + scoreA.quality) / 3;
        default: // 'overall'
          return scoreB.overall - scoreA.overall;
      }
    });
  }

  // =============================================================================
  // PRIVATE METHODS - HELPER FUNCTIONS
  // =============================================================================

  /**
   * Generate content hash for caching
   */
  private generateContentHash(content: string): string {
    // Simple hash function for demonstration
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Create default relevance score
   */
  private createDefaultRelevanceScore(method: string): ContextRelevanceScore {
    return {
      overall: 0.1,
      semantic: 0.1,
      temporal: 0.5,
      contextual: 0.1,
      quality: 0.5,
      confidence: 0.1
    };
  }

  /**
   * Create default similarity score
   */
  private createDefaultSimilarityScore(method: string): ContentSimilarityScore {
    return {
      overall: 0.0,
      method,
      confidence: 0.1,
      details: {}
    };
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(durationMs: number): void {
    this.performanceMetrics.totalCalculations++;
    this.performanceMetrics.averageCalculationTime = 
      (this.performanceMetrics.averageCalculationTime + durationMs) / 2;
  }

  /**
   * Calculate current cache hit rate
   */
  private calculateCurrentCacheHitRate(): number {
    // Simplified calculation - would be more sophisticated in production
    const totalRequests = this.performanceMetrics.totalCalculations;
    const cacheSize = this.relevanceCache.size;
    return totalRequests > 0 ? Math.min(1.0, cacheSize / totalRequests) : 0;
  }

  // =============================================================================
  // PRIVATE METHODS - READYAI-SPECIFIC CALCULATIONS
  // =============================================================================

  /**
   * Calculate ReadyAI-specific relevance factors
   */
  private calculateReadyAISpecificFactors(context: ContextIntelligenceNode, query: string) {
    return {
      developmentRelevance: this.calculateDevelopmentRelevance(context, query),
      phaseRelevance: this.calculatePhaseRelevance(context, query)
    };
  }

  /**
   * Calculate development-specific relevance
   */
  private calculateDevelopmentRelevance(context: ContextIntelligenceNode, query: string): number {
    const developmentKeywords = ['implement', 'code', 'function', 'class', 'method', 'api', 'feature'];
    const queryLower = query.toLowerCase();
    const contentLower = context.content.toLowerCase();
    
    const queryDevKeywords = developmentKeywords.filter(keyword => queryLower.includes(keyword));
    const contentDevKeywords = developmentKeywords.filter(keyword => contentLower.includes(keyword));
    
    const intersection = queryDevKeywords.filter(keyword => contentDevKeywords.includes(keyword));
    const union = [...new Set([...queryDevKeywords, ...contentDevKeywords])];
    
    return union.length > 0 ? intersection.length / union.length : 0.5;
  }

  /**
   * Calculate phase-specific relevance
   */
  private calculatePhaseRelevance(context: ContextIntelligenceNode, query: string): number {
    // Implementation would depend on ReadyAI's phase system
    return 0.5; // Placeholder
  }

  // Additional helper methods with simplified implementations

  private calculateSemanticComponent(context: ContextIntelligenceNode, query: string): Promise<number> {
    return Promise.resolve(this.calculateTextSimilarity(context.content, query));
  }

  private calculateTemporalComponent(context: ContextIntelligenceNode): Promise<number> {
    return Promise.resolve(this.calculateTemporalScore(context));
  }

  private calculateContextualComponent(context: ContextIntelligenceNode, query: string): Promise<number> {
    return Promise.resolve(this.calculateContextualScore(context, query));
  }

  private calculateQualityComponent(context: ContextIntelligenceNode): Promise<number> {
    return Promise.resolve(context.qualityScore);
  }

  private calculateConfidenceScore(scores: number[]): number {
    const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - average, 2), 0) / scores.length;
    return Math.max(0.1, 1 - Math.sqrt(variance));
  }

  private analyzeContentComplexity(context: ContextIntelligenceNode) {
    return {
      isHighlyTechnical: context.content.length > 1000 && context.qualityScore > 0.7,
      hasMultipleTopics: context.content.split('\n').length > 20
    };
  }

  private analyzeQueryComplexity(query: string) {
    return {
      isSpecific: query.length > 20 && query.includes('specific'),
      isBroad: query.length < 20 || query.includes('general')
    };
  }

  private extractPhaseIndicators(query: string): PhaseType[] {
    const indicators: PhaseType[] = [];
    const queryLower = query.toLowerCase();
    
    if (queryLower.includes('plan') || queryLower.includes('design')) indicators.push('planning');
    if (queryLower.includes('implement') || queryLower.includes('code')) indicators.push('implementation');
    if (queryLower.includes('test') || queryLower.includes('verify')) indicators.push('testing');
    if (queryLower.includes('deploy') || queryLower.includes('release')) indicators.push('deployment');
    
    return indicators;
  }

  private areRelatedPhases(phase1: PhaseType, phases: PhaseType[]): boolean {
    // Simplified phase relationship logic
    const relatedPhases: Record<PhaseType, PhaseType[]> = {
      'planning': ['implementation'],
      'implementation': ['planning', 'testing'],
      'testing': ['implementation', 'deployment'],
      'deployment': ['testing'],
      'development': ['planning', 'implementation']
    };
    
    return phases.some(phase => relatedPhases[phase1]?.includes(phase));
  }

  private extractProjectKeywords(context: ContextIntelligenceNode): string[] {
    // Simple keyword extraction
    return context.content.toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 3)
      .slice(0, 10); // Top 10 keywords
  }

  private extractQueryKeywords(query: string): string[] {
    return query.toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 2);
  }

  private countDirectMentions(query: string, content: string): number {
    const queryWords = query.split(/\W+/).filter(word => word.length > 2);
    return queryWords.reduce((count, word) => {
      return count + (content.split(word).length - 1);
    }, 0);
  }

  private findRelatedTerms(query: string, content: string): string[] {
    // Simplified related terms finding
    const queryWords = query.split(/\W+/).filter(word => word.length > 2);
    const contentWords = content.split(/\W+/).filter(word => word.length > 2);
    
    return queryWords.filter(qWord => 
      contentWords.some(cWord => 
        qWord.includes(cWord) || cWord.includes(qWord)
      )
    );
  }

  private calculateTechnicalDepthRelevance(context: ContextIntelligenceNode, query: string): number {
    const technicalTerms = ['algorithm', 'implementation', 'architecture', 'pattern', 'optimization'];
    const queryTech = technicalTerms.filter(term => query.toLowerCase().includes(term));
    const contentTech = technicalTerms.filter(term => context.content.toLowerCase().includes(term));
    
    return queryTech.length > 0 && contentTech.length > 0 ? 0.8 : 0.4;
  }

  private calculateRecencyRelevance(context: ContextIntelligenceNode): number {
    return this.calculateTemporalScore(context);
  }

  private calculateCompletenessRelevance(context: ContextIntelligenceNode): number {
    // Simple completeness based on content length and quality
    const lengthScore = Math.min(1.0, context.content.length / 1000);
    return (lengthScore + context.qualityScore) / 2;
  }

  private calculateUserIntentRelevance(context: ContextIntelligenceNode, query: string): number {
    // Simplified intent matching
    const intentKeywords = ['how', 'what', 'why', 'implement', 'create', 'fix', 'optimize'];
    const hasIntent = intentKeywords.some(keyword => query.toLowerCase().includes(keyword));
    const hasResponse = context.content.length > 100; // Assume longer content can answer questions
    
    return hasIntent && hasResponse ? 0.8 : 0.5;
  }

  private async generateRelevanceMetrics(
    context: ContextIntelligenceNode,
    query: string,
    score: ContextRelevanceScore,
    dimensions: ContextRelevanceDimensions
  ): Promise<ContextRelevanceMetrics> {
    return {
      calculationMethod: 'advanced',
      processingTime: 0, // Would be calculated from actual processing
      cacheHit: false,
      qualityFactors: {
        contentQuality: context.qualityScore,
        semanticClarity: score.semantic,
        contextualFit: score.contextual
      },
      dimensionScores: {
        developmentPhase: dimensions.developmentPhase,
        technicalDepth: dimensions.technicalDepth,
        projectRelevance: dimensions.projectContext
      }
    };
  }

  // =============================================================================
  // CACHING AND CLEANUP
  // =============================================================================

  private getCachedRelevance(
    context: ContextIntelligenceNode,
    query: string,
    options?: RelevanceCalculationOptions
  ): ContextRelevanceResult | null {
    const cacheKey = this.generateRelevanceCacheKey(context, query, options);
    return this.relevanceCache.get(cacheKey) || null;
  }

  private cacheRelevance(
    context: ContextIntelligenceNode,
    query: string,
    result: ContextRelevanceResult,
    options?: RelevanceCalculationOptions
  ): void {
    const cacheKey = this.generateRelevanceCacheKey(context, query, options);
    this.relevanceCache.set(cacheKey, result);

    // Clean up old cache entries if needed
    if (this.relevanceCache.size > this.config.performance.maxCacheSize) {
      this.cleanupOldCacheEntries();
    }
  }

  private generateRelevanceCacheKey(
    context: ContextIntelligenceNode,
    query: string,
    options?: RelevanceCalculationOptions
  ): string {
    const queryHash = this.generateContentHash(query);
    const optionsHash = options ? this.generateContentHash(JSON.stringify(options)) : '';
    return `${context.id}_${context.contentHash}_${queryHash}_${optionsHash}`;
  }

  private cleanupOldCacheEntries(): void {
    const entries = Array.from(this.relevanceCache.entries());
    const toRemove = Math.ceil(entries.length * 0.25); // Remove 25% of oldest entries
    
    // In a real implementation, you'd sort by timestamp
    for (let i = 0; i < toRemove; i++) {
      this.relevanceCache.delete(entries[i][0]);
    }
  }

  private startBackgroundCleanup(): void {
    const cleanupInterval = RELEVANCE_CONSTANTS.CACHE_CLEANUP_INTERVAL;
    
    setInterval(() => {
      try {
        if (this.relevanceCache.size > this.config.performance.maxCacheSize * 0.8) {
          this.cleanupOldCacheEntries();
        }
        if (this.similarityCache.size > this.config.performance.maxCacheSize * 0.8) {
          this.cleanupSimilarityCache();
        }
      } catch (error) {
        this.logger.error('Background cleanup failed', { error });
      }
    }, cleanupInterval);

    this.logger.info('Background cleanup started', { interval: cleanupInterval });
  }

  private cleanupSimilarityCache(): void {
    const entries = Array.from(this.similarityCache.entries());
    const toRemove = Math.ceil(entries.length * 0.25);
    
    for (let i = 0; i < toRemove; i++) {
      this.similarityCache.delete(entries[i][0]);
    }
  }

  // =============================================================================
  // PUBLIC UTILITY METHODS
  // =============================================================================

  /**
   * Get current performance statistics
   */
  getPerformanceMetrics(): RelevancePerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.relevanceCache.clear();
    this.similarityCache.clear();
    this.logger.info('Relevance calculator cache cleared');
  }

  /**
   * Update configuration at runtime
   */
  async updateConfig(newConfig: Partial<ContextRelevanceConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('RelevanceCalculator configuration updated', { newConfig });
  }

  /**
   * Get cache statistics
   */
  getCacheStatistics() {
    return {
      relevanceCacheSize: this.relevanceCache.size,
      similarityCacheSize: this.similarityCache.size,
      cacheHitRate: this.calculateCurrentCacheHitRate(),
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  private estimateMemoryUsage(): number {
    // Simple memory usage estimation
    let totalSize = 0;
    
    this.relevanceCache.forEach(entry => {
      totalSize += JSON.stringify(entry).length * 2; // UTF-16 encoding
    });
    
    this.similarityCache.forEach(entry => {
      totalSize += JSON.stringify(entry).length * 2;
    });
    
    return totalSize / (1024 * 1024); // Convert to MB
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up RelevanceCalculator resources');
    
    this.relevanceCache.clear();
    this.similarityCache.clear();
    this.batchProcessingQueue.clear();
    
    this.isInitialized = false;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export { RelevanceCalculator };
export default RelevanceCalculator;
