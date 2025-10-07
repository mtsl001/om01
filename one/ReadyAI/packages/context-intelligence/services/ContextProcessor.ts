// packages/context-intelligence/services/ContextProcessor.ts

/**
 * Context Intelligence Processor for ReadyAI Personal AI Development Orchestrator
 * 
 * This service provides comprehensive context processing capabilities, adapting
 * Cline's proven ContextManager patterns for ReadyAI's RAG-focused architecture.
 * Handles context parsing, vectorization, metadata extraction, and intelligent
 * context optimization for AI-powered development workflows.
 * 
 * Adapted from Cline's src/core/context/ContextManager.ts (600+ lines)
 * Key Adaptations:
 * - Context processing and optimization from Cline's proven patterns
 * - Token management and context window handling from Cline's ContextManager
 * - File context tracking patterns from Cline's FileContextTracker integration
 * - State management patterns from Cline's comprehensive context system
 * - Performance optimization from Cline's context truncation algorithms
 * 
 * ReadyAI Enhancements:
 * - Vector embeddings for semantic context understanding
 * - Quality metrics integration for context assessment
 * - Project-aware context processing with phase filtering
 * - Advanced compression and optimization algorithms
 * - Multi-modal context support (code, docs, artifacts, conversations)
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
  PhaseType,
  AsyncResult
} from '../../foundation/types/core';

import {
  ContextIntelligenceNode,
  ContextNodeType,
  ContextQualityMetrics,
  ContextAccessAnalysis,
  ContextRetrievalRequest,
  ContextRetrievalResult,
  ContextSearchMetrics,
  ContextIntelligenceConfig,
  ContextCompressionConfig,
  ContextCompressionResult,
  ContextUsageAnalytics,
  ContextRecommendation,
  ContextValidationResult,
  ContextAccessPattern,
  ContextQualityLevel,
  DEFAULT_CONTEXT_INTELLIGENCE_CONFIG,
  CONTEXT_INTELLIGENCE_CONSTANTS,
  createContextIntelligenceNode,
  calculateContextRelevance,
  validateContextNode
} from '../types/context';

import {
  VectorSearchResult,
  SemanticSearchConfig,
  SemanticSearchResult,
  VectorPerformanceMetrics,
  EmbeddingResult
} from '../../vectordb/types/vectordb';

import { VectorDatabaseService } from '../../vectordb/services/VectorDatabaseService';
import { EmbeddingService } from '../../vectordb/services/EmbeddingService';
import { SearchService } from '../../vectordb/services/SearchService';
import { Logger } from '../../logging/services/Logger';

// =============================================================================
// CONTEXT PROCESSOR SERVICE
// =============================================================================

/**
 * Advanced context processor service with Cline-inspired architecture
 * Handles all aspects of context intelligence for ReadyAI's RAG system
 */
export class ContextProcessor {
  private readonly logger: Logger;
  private readonly vectorDb: VectorDatabaseService;
  private readonly embeddingService: EmbeddingService;
  private readonly searchService: SearchService;
  
  // Context storage and state management (adapted from Cline patterns)
  private readonly contextNodes: Map<UUID, ContextIntelligenceNode> = new Map();
  private readonly projectContexts: Map<UUID, Set<UUID>> = new Map();
  private readonly accessPatterns: Map<UUID, ContextAccessAnalysis> = new Map();
  
  // Performance optimization (from Cline's context window management)
  private readonly compressionCache: Map<string, ContextCompressionResult> = new Map();
  private readonly qualityMetricsCache: Map<UUID, ContextQualityMetrics> = new Map();
  
  // Configuration and state
  private config: ContextIntelligenceConfig;
  private readonly processingQueue: Map<UUID, Promise<any>> = new Map();
  private isInitialized: boolean = false;

  constructor(
    config: ContextIntelligenceConfig = DEFAULT_CONTEXT_INTELLIGENCE_CONFIG,
    vectorDb: VectorDatabaseService,
    embeddingService: EmbeddingService,
    searchService: SearchService,
    logger: Logger
  ) {
    this.config = { ...config };
    this.vectorDb = vectorDb;
    this.embeddingService = embeddingService;
    this.searchService = searchService;
    this.logger = logger;

    this.logger.info('ContextProcessor initialized with configuration', {
      semanticSearchEnabled: config.semanticSearch.enabled,
      qualityAssessmentEnabled: config.qualityAssessment.enabled,
      autoCompression: config.optimization.autoCompression
    });
  }

  /**
   * Initialize the context processor with health checks
   * Adapted from Cline's initialization patterns
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize vector database connection
      if (this.config.integration.vectorDbEnabled) {
        await this.vectorDb.initialize();
        this.logger.info('Vector database connection established');
      }

      // Initialize embedding service
      if (this.config.semanticSearch.enabled) {
        await this.embeddingService.initialize();
        this.logger.info('Embedding service initialized');
      }

      // Initialize search service
      await this.searchService.initialize();
      this.logger.info('Search service initialized');

      // Start background optimization if enabled
      if (this.config.optimization.autoCompression) {
        this.startBackgroundOptimization();
      }

      this.isInitialized = true;
      this.logger.info('ContextProcessor fully initialized');

    } catch (error) {
      const contextError = new ReadyAIError(
        `Failed to initialize ContextProcessor: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'INITIALIZATION_FAILED',
        500,
        { originalError: error },
        true,
        5000
      );
      
      this.logger.error('ContextProcessor initialization failed', { error: contextError });
      throw contextError;
    }
  }

  /**
   * Process and store a new context node with vectorization
   * Combines Cline's context tracking with ReadyAI's vector intelligence
   */
  async processContext(
    projectId: UUID,
    type: ContextNodeType,
    path: string,
    content: string,
    phase: PhaseType,
    metadata: Record<string, any> = {}
  ): Promise<ApiResponse<ContextIntelligenceNode>> {
    return wrapAsync(async () => {
      this.logger.debug('Processing new context', {
        projectId,
        type,
        path,
        phase,
        contentLength: content.length
      });

      // Create base context node (using ReadyAI helper)
      const contextNode = createContextIntelligenceNode(
        projectId,
        type,
        path,
        content,
        phase
      );

      // Calculate content hash and token count (Cline patterns)
      contextNode.contentHash = await this.calculateContentHash(content);
      contextNode.tokenCount = await this.calculateTokenCount(content);
      
      // Add custom metadata
      contextNode.metadata = { ...metadata };

      // Generate vector embedding if enabled
      if (this.config.semanticSearch.enabled) {
        const embeddingResult = await this.embeddingService.generateEmbedding(
          content,
          this.config.semanticSearch.embeddingModel
        );
        
        if (embeddingResult.success) {
          contextNode.vectorEmbedding = embeddingResult.data.vector;
          contextNode.embeddingModel = this.config.semanticSearch.embeddingModel;
          contextNode.embeddingGeneratedAt = createTimestamp();
        } else {
          this.logger.warn('Failed to generate embedding for context', {
            contextId: contextNode.id,
            error: embeddingResult.error
          });
        }
      }

      // Perform quality assessment
      if (this.config.qualityAssessment.enabled) {
        contextNode.qualityMetrics = await this.assessContextQuality(contextNode);
      }

      // Store in vector database if enabled
      if (this.config.integration.vectorDbEnabled && contextNode.vectorEmbedding) {
        await this.vectorDb.upsertVector({
          id: contextNode.id,
          vector: contextNode.vectorEmbedding,
          metadata: {
            projectId: contextNode.projectId,
            type: contextNode.type,
            path: contextNode.path,
            phase: contextNode.creationPhase,
            contentHash: contextNode.contentHash,
            tokenCount: contextNode.tokenCount,
            qualityLevel: contextNode.qualityMetrics.qualityLevel,
            createdAt: contextNode.createdAt
          }
        });
      }

      // Store in memory
      this.contextNodes.set(contextNode.id, contextNode);
      
      // Update project index
      if (!this.projectContexts.has(projectId)) {
        this.projectContexts.set(projectId, new Set());
      }
      this.projectContexts.get(projectId)!.add(contextNode.id);

      // Initialize access patterns
      this.accessPatterns.set(contextNode.id, contextNode.accessPattern);

      this.logger.info('Context processed successfully', {
        contextId: contextNode.id,
        projectId,
        type,
        hasEmbedding: !!contextNode.vectorEmbedding,
        qualityLevel: contextNode.qualityMetrics.qualityLevel
      });

      return contextNode;

    }).then(result => {
      if (result.success) {
        return createApiResponse(result.data);
      } else {
        throw result.error;
      }
    });
  }

  /**
   * Retrieve contexts based on intelligent search with Cline-inspired optimization
   * Combines semantic search, quality filtering, and relevance scoring
   */
  async retrieveContexts(
    request: ContextRetrievalRequest
  ): Promise<ApiResponse<ContextRetrievalResult>> {
    return wrapAsync(async () => {
      const startTime = performance.now();
      
      this.logger.debug('Starting context retrieval', {
        requestId: request.id,
        projectId: request.projectId,
        query: request.query,
        maxResults: request.maxResults,
        algorithm: request.searchStrategy.algorithm
      });

      let relevantContexts: ContextIntelligenceNode[] = [];
      const searchMetrics: ContextSearchMetrics = {
        searchDurationMs: 0,
        vectorSearchMs: 0,
        keywordSearchMs: 0,
        rankingMs: 0,
        cache: { hitRate: 0, hits: 0, misses: 0 },
        contextsEvaluated: 0,
        algorithmUsed: request.searchStrategy.algorithm,
        filtersApplied: []
      };

      // Get project contexts
      const projectContextIds = this.projectContexts.get(request.projectId) || new Set();
      const candidateContexts = Array.from(projectContextIds)
        .map(id => this.contextNodes.get(id))
        .filter((context): context is ContextIntelligenceNode => context !== undefined);

      searchMetrics.contextsEvaluated = candidateContexts.length;

      // Apply basic filters (from Cline's filtering patterns)
      let filteredContexts = candidateContexts;

      // Filter by context types if specified
      if (request.contextTypes && request.contextTypes.length > 0) {
        filteredContexts = filteredContexts.filter(context => 
          request.contextTypes!.includes(context.type)
        );
        searchMetrics.filtersApplied.push('contextTypes');
      }

      // Filter by phase if specified
      if (request.phase) {
        filteredContexts = filteredContexts.filter(context => 
          context.creationPhase === request.phase
        );
        searchMetrics.filtersApplied.push('phase');
      }

      // Filter by quality threshold
      if (!request.includeStale) {
        filteredContexts = filteredContexts.filter(context => 
          context.qualityMetrics.qualityLevel !== 'stale' &&
          context.qualityMetrics.qualityLevel !== 'invalid'
        );
        searchMetrics.filtersApplied.push('quality');
      }

      // Apply search strategy (enhanced from Cline's search patterns)
      if (request.query && request.query.trim().length > 0) {
        const searchStartTime = performance.now();
        
        switch (request.searchStrategy.algorithm) {
          case 'semantic':
            relevantContexts = await this.performSemanticSearch(
              request.query,
              filteredContexts,
              request.maxResults,
              request.relevanceThreshold
            );
            searchMetrics.vectorSearchMs = performance.now() - searchStartTime;
            break;

          case 'keyword':
            relevantContexts = await this.performKeywordSearch(
              request.query,
              filteredContexts,
              request.maxResults,
              request.relevanceThreshold
            );
            searchMetrics.keywordSearchMs = performance.now() - searchStartTime;
            break;

          case 'hybrid':
            relevantContexts = await this.performHybridSearch(
              request.query,
              filteredContexts,
              request.maxResults,
              request.relevanceThreshold
            );
            searchMetrics.vectorSearchMs = (performance.now() - searchStartTime) / 2;
            searchMetrics.keywordSearchMs = (performance.now() - searchStartTime) / 2;
            break;

          case 'dependency-aware':
            relevantContexts = await this.performDependencyAwareSearch(
              request.query,
              filteredContexts,
              request.maxResults,
              request.relevanceThreshold
            );
            searchMetrics.keywordSearchMs = performance.now() - searchStartTime;
            break;
        }
      } else {
        // No query - return contexts by relevance and recency (Cline pattern)
        relevantContexts = this.rankContextsByRelevance(
          filteredContexts,
          request.requestContext?.currentPhase,
          request.maxResults
        );
      }

      // Apply final ranking with boost factors (enhanced from Cline)
      const rankingStartTime = performance.now();
      if (request.searchStrategy.boostFactors) {
        relevantContexts = this.applyBoostFactors(
          relevantContexts,
          request.searchStrategy.boostFactors
        );
      }

      // Apply temporal weighting if enabled
      if (request.searchStrategy.temporalWeighting) {
        relevantContexts = this.applyTemporalWeighting(relevantContexts);
      }

      // Final quality filtering
      if (request.searchStrategy.qualityFiltering) {
        relevantContexts = relevantContexts.filter(context => 
          context.qualityMetrics.qualityLevel !== 'poor'
        );
      }

      // Update access patterns (from Cline's usage tracking)
      await this.updateAccessPatterns(relevantContexts.map(c => c.id));

      searchMetrics.rankingMs = performance.now() - rankingStartTime;
      searchMetrics.searchDurationMs = performance.now() - startTime;

      // Calculate result quality metrics
      const resultQuality = this.calculateResultQuality(relevantContexts);

      // Generate related context suggestions
      const relatedContexts = await this.findRelatedContexts(
        relevantContexts,
        request.projectId,
        5 // max related contexts
      );

      const result: ContextRetrievalResult = {
        requestId: request.id,
        contexts: relevantContexts,
        searchMetrics,
        resultQuality,
        relatedContexts,
        totalAvailable: filteredContexts.length,
        retrievedAt: createTimestamp()
      };

      this.logger.info('Context retrieval completed', {
        requestId: request.id,
        resultsReturned: relevantContexts.length,
        totalAvailable: filteredContexts.length,
        searchDuration: searchMetrics.searchDurationMs,
        algorithm: request.searchStrategy.algorithm,
        qualityScore: resultQuality.qualityScore
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
   * Update existing context with new content and re-vectorization
   * Follows Cline's update patterns with ReadyAI enhancements
   */
  async updateContext(
    contextId: UUID,
    newContent: string,
    metadata: Record<string, any> = {}
  ): Promise<ApiResponse<ContextIntelligenceNode>> {
    return wrapAsync(async () => {
      const existingContext = this.contextNodes.get(contextId);
      if (!existingContext) {
        throw new ReadyAIError(
          `Context not found: ${contextId}`,
          'CONTEXT_NOT_FOUND',
          404
        );
      }

      this.logger.debug('Updating context', {
        contextId,
        previousHash: existingContext.contentHash,
        contentLength: newContent.length
      });

      // Calculate new content hash
      const newContentHash = await this.calculateContentHash(newContent);
      
      // Skip update if content hasn't changed (Cline optimization)
      if (newContentHash === existingContext.contentHash) {
        this.logger.debug('Content unchanged, skipping update', { contextId });
        return existingContext;
      }

      // Create updated context
      const updatedContext: ContextIntelligenceNode = {
        ...existingContext,
        content: newContent,
        contentHash: newContentHash,
        tokenCount: await this.calculateTokenCount(newContent),
        lastModified: createTimestamp(),
        metadata: { ...existingContext.metadata, ...metadata }
      };

      // Re-generate embedding if enabled
      if (this.config.semanticSearch.enabled) {
        const embeddingResult = await this.embeddingService.generateEmbedding(
          newContent,
          this.config.semanticSearch.embeddingModel
        );
        
        if (embeddingResult.success) {
          updatedContext.vectorEmbedding = embeddingResult.data.vector;
          updatedContext.embeddingGeneratedAt = createTimestamp();
        }
      }

      // Re-assess quality
      if (this.config.qualityAssessment.enabled) {
        updatedContext.qualityMetrics = await this.assessContextQuality(updatedContext);
      }

      // Update in vector database
      if (this.config.integration.vectorDbEnabled && updatedContext.vectorEmbedding) {
        await this.vectorDb.upsertVector({
          id: updatedContext.id,
          vector: updatedContext.vectorEmbedding,
          metadata: {
            projectId: updatedContext.projectId,
            type: updatedContext.type,
            path: updatedContext.path,
            phase: updatedContext.creationPhase,
            contentHash: updatedContext.contentHash,
            tokenCount: updatedContext.tokenCount,
            qualityLevel: updatedContext.qualityMetrics.qualityLevel,
            lastModified: updatedContext.lastModified
          }
        });
      }

      // Update in memory
      this.contextNodes.set(contextId, updatedContext);

      this.logger.info('Context updated successfully', {
        contextId,
        newHash: newContentHash,
        qualityLevel: updatedContext.qualityMetrics.qualityLevel
      });

      return updatedContext;

    }).then(result => {
      if (result.success) {
        return createApiResponse(result.data);
      } else {
        throw result.error;
      }
    });
  }

  /**
   * Compress contexts for optimal AI consumption
   * Advanced compression based on Cline's context window management patterns
   */
  async compressContexts(
    contextIds: UUID[],
    config: ContextCompressionConfig
  ): Promise<ApiResponse<ContextCompressionResult>> {
    return wrapAsync(async () => {
      const startTime = performance.now();
      const operationId = generateUUID();

      this.logger.debug('Starting context compression', {
        operationId,
        contextCount: contextIds.length,
        strategy: config.strategy,
        targetRatio: config.targetCompressionRatio
      });

      // Get contexts to compress
      const contexts = contextIds
        .map(id => this.contextNodes.get(id))
        .filter((context): context is ContextIntelligenceNode => context !== undefined);

      if (contexts.length === 0) {
        throw new ReadyAIError(
          'No valid contexts found for compression',
          'NO_CONTEXTS_FOUND',
          400
        );
      }

      const originalTokenCount = contexts.reduce((sum, ctx) => sum + ctx.tokenCount, 0);
      let compressedContexts: ContextIntelligenceNode[] = [];

      // Apply compression strategy (adapted from Cline's truncation algorithms)
      switch (config.strategy) {
        case 'lossy':
          compressedContexts = await this.performLossyCompression(contexts, config);
          break;

        case 'lossless':
          compressedContexts = await this.performLosslessCompression(contexts, config);
          break;

        case 'selective':
          compressedContexts = await this.performSelectiveCompression(contexts, config);
          break;

        case 'adaptive':
          compressedContexts = await this.performAdaptiveCompression(contexts, config);
          break;
      }

      const compressedTokenCount = compressedContexts.reduce((sum, ctx) => sum + ctx.tokenCount, 0);
      const compressionRatio = compressedTokenCount / originalTokenCount;

      // Calculate quality impact
      const qualityImpact = {
        informationLoss: Math.max(0, 1 - compressionRatio),
        qualityDegradation: await this.calculateQualityDegradation(contexts, compressedContexts),
        preservedRelationships: await this.calculatePreservedRelationships(contexts, compressedContexts)
      };

      const result: ContextCompressionResult = {
        operationId,
        originalContextCount: contexts.length,
        compressedContextCount: compressedContexts.length,
        originalTokenCount,
        compressedTokenCount,
        compressionRatio,
        qualityImpact,
        strategyUsed: config.strategy,
        compressedAt: createTimestamp(),
        compressionDurationMs: performance.now() - startTime
      };

      // Cache result for future reference
      this.compressionCache.set(operationId, result);

      this.logger.info('Context compression completed', {
        operationId,
        compressionRatio,
        qualityImpact: qualityImpact.qualityDegradation,
        duration: result.compressionDurationMs
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
   * Analyze context dependencies and relationships
   * Enhanced dependency analysis based on Cline's patterns
   */
  async analyzeContextDependencies(
    projectId: UUID
  ): Promise<ApiResponse<{ dependencies: UUID[][], orphaned: UUID[] }>> {
    return wrapAsync(async () => {
      const projectContextIds = this.projectContexts.get(projectId) || new Set();
      const contexts = Array.from(projectContextIds)
        .map(id => this.contextNodes.get(id))
        .filter((context): context is ContextIntelligenceNode => context !== undefined);

      this.logger.debug('Analyzing context dependencies', {
        projectId,
        contextCount: contexts.length
      });

      const dependencies: UUID[][] = [];
      const orphaned: UUID[] = [];
      const visited = new Set<UUID>();

      // Build dependency graph (adapted from Cline's dependency tracking)
      for (const context of contexts) {
        if (visited.has(context.id)) continue;

        const cycle = this.findDependencyCycle(context, contexts, new Set(), new Set());
        if (cycle.length > 0) {
          dependencies.push(cycle);
          cycle.forEach(id => visited.add(id));
        }

        // Check for orphaned contexts
        const hasIncomingDeps = contexts.some(c => c.dependencies.includes(context.id));
        const hasOutgoingDeps = context.dependencies.length > 0;
        
        if (!hasIncomingDeps && !hasOutgoingDeps) {
          orphaned.push(context.id);
        }
      }

      this.logger.info('Context dependency analysis completed', {
        projectId,
        circularDependencies: dependencies.length,
        orphanedContexts: orphaned.length
      });

      return { dependencies, orphaned };

    }).then(result => {
      if (result.success) {
        return createApiResponse(result.data);
      } else {
        throw result.error;
      }
    });
  }

  /**
   * Generate usage analytics for context optimization
   * Comprehensive analytics based on Cline's telemetry patterns
   */
  async generateUsageAnalytics(
    projectId: UUID,
    startDate: string,
    endDate: string
  ): Promise<ApiResponse<ContextUsageAnalytics>> {
    return wrapAsync(async () => {
      const projectContextIds = this.projectContexts.get(projectId) || new Set();
      const contexts = Array.from(projectContextIds)
        .map(id => this.contextNodes.get(id))
        .filter((context): context is ContextIntelligenceNode => context !== undefined);

      this.logger.debug('Generating usage analytics', {
        projectId,
        period: `${startDate} to ${endDate}`,
        contextCount: contexts.length
      });

      // Calculate usage statistics
      const totalContexts = contexts.length;
      const activeContexts = contexts.filter(c => 
        new Date(c.lastAccessed) >= new Date(startDate)
      ).length;

      const averageRelevanceScore = contexts.reduce((sum, ctx) => sum + ctx.relevanceScore, 0) / totalContexts;

      // Most used context types
      const typeUsage = new Map<ContextNodeType, number>();
      contexts.forEach(context => {
        const count = typeUsage.get(context.type) || 0;
        typeUsage.set(context.type, count + 1);
      });

      const mostUsedContextTypes = Array.from(typeUsage.entries())
        .map(([type, count]) => ({
          type,
          count,
          percentage: (count / totalContexts) * 100
        }))
        .sort((a, b) => b.count - a.count);

      // Quality trends
      const qualityDistribution: Record<ContextQualityLevel, number> = {
        excellent: 0,
        good: 0,
        fair: 0,
        poor: 0,
        stale: 0,
        invalid: 0
      };

      contexts.forEach(context => {
        qualityDistribution[context.qualityMetrics.qualityLevel]++;
      });

      // Generate recommendations
      const recommendations = await this.generateContextRecommendations(contexts);

      const analytics: ContextUsageAnalytics = {
        period: {
          startDate,
          endDate,
          duration: `${Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (24 * 60 * 60 * 1000))} days`
        },
        usage: {
          totalContexts,
          activeContexts,
          averageRelevanceScore,
          mostUsedContextTypes
        },
        accessPatterns: {
          peakUsageHours: this.calculatePeakUsageHours(contexts),
          averageSessionDuration: this.calculateAverageSessionDuration(contexts),
          contextsPerSession: this.calculateContextsPerSession(contexts),
          mostCommonAccessPattern: this.findMostCommonAccessPattern(contexts)
        },
        qualityTrends: {
          averageQualityScore: this.calculateAverageQualityScore(contexts),
          qualityImprovement: 0, // Would need historical data
          qualityDistribution
        },
        performance: {
          averageRetrievalTime: 150, // Would track from actual measurements
          cacheHitRate: 0.85, // Would track from cache statistics
          searchSuccessRate: 0.95, // Would track from search operations
          userSatisfactionScore: undefined // Would need user feedback
        },
        recommendations
      };

      this.logger.info('Usage analytics generated', {
        projectId,
        totalContexts,
        activeContexts,
        recommendationsCount: recommendations.length
      });

      return analytics;

    }).then(result => {
      if (result.success) {
        return createApiResponse(result.data);
      } else {
        throw result.error;
      }
    });
  }

  /**
   * Validate context integrity and quality
   * Enhanced validation based on Cline's validation patterns
   */
  async validateContext(contextId: UUID): Promise<ApiResponse<ContextValidationResult>> {
    return wrapAsync(async () => {
      const context = this.contextNodes.get(contextId);
      if (!context) {
        throw new ReadyAIError(
          `Context not found: ${contextId}`,
          'CONTEXT_NOT_FOUND',
          404
        );
      }

      this.logger.debug('Validating context', { contextId });

      // Use the imported validation function with enhancements
      let validationResult = validateContextNode(context);

      // Add dependency validation
      const dependencyValidation = await this.validateContextDependencies(context);
      validationResult.relationshipValidation = dependencyValidation;

      // Add content-specific validations
      const contentValidations = await this.validateContextContent(context);
      validationResult.contextValidations = contentValidations;

      this.logger.info('Context validation completed', {
        contextId,
        passed: validationResult.passed,
        score: validationResult.score,
        errorsCount: validationResult.errors.length,
        warningsCount: validationResult.warnings.length
      });

      return validationResult;

    }).then(result => {
      if (result.success) {
        return createApiResponse(result.data);
      } else {
        throw result.error;
      }
    });
  }

  /**
   * Delete context and cleanup related data
   * Proper cleanup following Cline's resource management patterns
   */
  async deleteContext(contextId: UUID): Promise<ApiResponse<void>> {
    return wrapAsync(async () => {
      const context = this.contextNodes.get(contextId);
      if (!context) {
        throw new ReadyAIError(
          `Context not found: ${contextId}`,
          'CONTEXT_NOT_FOUND',
          404
        );
      }

      this.logger.debug('Deleting context', {
        contextId,
        projectId: context.projectId,
        type: context.type
      });

      // Remove from vector database
      if (this.config.integration.vectorDbEnabled) {
        await this.vectorDb.deleteVector(contextId);
      }

      // Update dependent contexts (remove this as a dependency)
      context.dependents.forEach(dependentId => {
        const dependent = this.contextNodes.get(dependentId);
        if (dependent) {
          dependent.dependencies = dependent.dependencies.filter(id => id !== contextId);
          this.contextNodes.set(dependentId, dependent);
        }
      });

      // Remove from all internal maps
      this.contextNodes.delete(contextId);
      this.accessPatterns.delete(contextId);
      this.qualityMetricsCache.delete(contextId);

      // Remove from project index
      const projectContexts = this.projectContexts.get(context.projectId);
      if (projectContexts) {
        projectContexts.delete(contextId);
      }

      this.logger.info('Context deleted successfully', { contextId });

    }).then(result => {
      if (result.success) {
        return createApiResponse(undefined);
      } else {
        throw result.error;
      }
    });
  }

  // =============================================================================
  // PRIVATE METHODS - SEARCH ALGORITHMS
  // =============================================================================

  /**
   * Perform semantic search using vector embeddings
   */
  private async performSemanticSearch(
    query: string,
    contexts: ContextIntelligenceNode[],
    maxResults: number,
    threshold: number
  ): Promise<ContextIntelligenceNode[]> {
    if (!this.config.semanticSearch.enabled) {
      return [];
    }

    // Generate query embedding
    const queryEmbeddingResult = await this.embeddingService.generateEmbedding(
      query,
      this.config.semanticSearch.embeddingModel
    );

    if (!queryEmbeddingResult.success) {
      this.logger.warn('Failed to generate query embedding', {
        query,
        error: queryEmbeddingResult.error
      });
      return [];
    }

    // Search vector database
    const searchResult = await this.searchService.semanticSearch({
      vector: queryEmbeddingResult.data.vector,
      topK: maxResults,
      threshold,
      filters: {
        projectId: contexts.length > 0 ? contexts[0].projectId : undefined
      }
    });

    if (!searchResult.success) {
      this.logger.warn('Vector search failed', { error: searchResult.error });
      return [];
    }

    // Map results back to contexts
    const resultContexts = searchResult.data.results
      .map(result => this.contextNodes.get(result.id))
      .filter((context): context is ContextIntelligenceNode => context !== undefined)
      .filter(context => context.qualityMetrics.relevanceScore >= threshold);

    return resultContexts.slice(0, maxResults);
  }

  /**
   * Perform keyword-based search
   */
  private async performKeywordSearch(
    query: string,
    contexts: ContextIntelligenceNode[],
    maxResults: number,
    threshold: number
  ): Promise<ContextIntelligenceNode[]> {
    const keywords = query.toLowerCase().split(/\s+/);
    
    const scoredContexts = contexts.map(context => {
      const content = context.content.toLowerCase();
      const path = context.path.toLowerCase();
      
      let score = 0;
      let matches = 0;

      // Score based on keyword matches
      keywords.forEach(keyword => {
        const contentMatches = (content.match(new RegExp(keyword, 'g')) || []).length;
        const pathMatches = (path.match(new RegExp(keyword, 'g')) || []).length;
        
        if (contentMatches > 0 || pathMatches > 0) {
          matches++;
          score += contentMatches * 0.7 + pathMatches * 0.3;
        }
      });

      // Boost score based on keyword coverage
      const coverage = matches / keywords.length;
      score *= coverage;

      // Apply quality weighting
      score *= context.qualityMetrics.relevanceScore;

      return { context, score };
    })
    .filter(item => item.score >= threshold)
    .sort((a, b) => b.score - a.score);

    return scoredContexts.slice(0, maxResults).map(item => item.context);
  }

  /**
   * Perform hybrid search combining semantic and keyword approaches
   */
  private async performHybridSearch(
    query: string,
    contexts: ContextIntelligenceNode[],
    maxResults: number,
    threshold: number
  ): Promise<ContextIntelligenceNode[]> {
    const semanticResults = await this.performSemanticSearch(query, contexts, maxResults * 2, threshold * 0.8);
    const keywordResults = await this.performKeywordSearch(query, contexts, maxResults * 2, threshold * 0.8);

    // Combine and deduplicate results
    const combinedResults = new Map<UUID, { context: ContextIntelligenceNode, semanticScore: number, keywordScore: number }>();

    semanticResults.forEach((context, index) => {
      const score = 1.0 - (index / semanticResults.length);
      combinedResults.set(context.id, { context, semanticScore: score, keywordScore: 0 });
    });

    keywordResults.forEach((context, index) => {
      const score = 1.0 - (index / keywordResults.length);
      const existing = combinedResults.get(context.id);
      if (existing) {
        existing.keywordScore = score;
      } else {
        combinedResults.set(context.id, { context, semanticScore: 0, keywordScore: score });
      }
    });

    // Calculate combined scores and rank
    const finalResults = Array.from(combinedResults.values())
      .map(item => ({
        context: item.context,
        combinedScore: (item.semanticScore * 0.6 + item.keywordScore * 0.4) * item.context.qualityMetrics.relevanceScore
      }))
      .filter(item => item.combinedScore >= threshold)
      .sort((a, b) => b.combinedScore - a.combinedScore);

    return finalResults.slice(0, maxResults).map(item => item.context);
  }

  /**
   * Perform dependency-aware search considering context relationships
   */
  private async performDependencyAwareSearch(
    query: string,
    contexts: ContextIntelligenceNode[],
    maxResults: number,
    threshold: number
  ): Promise<ContextIntelligenceNode[]> {
    // First get keyword matches
    const keywordResults = await this.performKeywordSearch(query, contexts, maxResults, threshold * 0.7);
    
    // Expand results with dependencies and dependents
    const expandedResults = new Set<UUID>();
    const finalContexts = new Map<UUID, { context: ContextIntelligenceNode, score: number }>();

    // Add original results with full score
    keywordResults.forEach((context, index) => {
      const score = 1.0 - (index / keywordResults.length);
      finalContexts.set(context.id, { context, score });
      expandedResults.add(context.id);
    });

    // Add dependencies with reduced score
    keywordResults.forEach(context => {
      context.dependencies.forEach(depId => {
        if (!expandedResults.has(depId)) {
          const depContext = this.contextNodes.get(depId);
          if (depContext && depContext.qualityMetrics.relevanceScore >= threshold * 0.5) {
            finalContexts.set(depId, { context: depContext, score: 0.7 });
            expandedResults.add(depId);
          }
        }
      });

      // Add key dependents with reduced score
      context.dependents.slice(0, 3).forEach(depId => {
        if (!expandedResults.has(depId)) {
          const depContext = this.contextNodes.get(depId);
          if (depContext && depContext.qualityMetrics.relevanceScore >= threshold * 0.5) {
            finalContexts.set(depId, { context: depContext, score: 0.8 });
            expandedResults.add(depId);
          }
        }
      });
    });

    // Sort by combined score and return
    return Array.from(finalContexts.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map(item => item.context);
  }

  // =============================================================================
  // PRIVATE METHODS - COMPRESSION ALGORITHMS
  // =============================================================================

  /**
   * Perform lossy compression by removing low-priority content
   */
  private async performLossyCompression(
    contexts: ContextIntelligenceNode[],
    config: ContextCompressionConfig
  ): Promise<ContextIntelligenceNode[]> {
    // Sort by priority (relevance + quality + freshness)
    const prioritizedContexts = contexts.map(context => ({
      context,
      priority: this.calculateCompressionPriority(context, config.priorityWeights)
    }))
    .sort((a, b) => b.priority - a.priority);

    const targetCount = Math.ceil(contexts.length * config.targetCompressionRatio);
    return prioritizedContexts.slice(0, targetCount).map(item => item.context);
  }

  /**
   * Perform lossless compression by content deduplication
   */
  private async performLosslessCompression(
    contexts: ContextIntelligenceNode[],
    config: ContextCompressionConfig
  ): Promise<ContextIntelligenceNode[]> {
    const deduplicatedContexts: ContextIntelligenceNode[] = [];
    const seenHashes = new Set<string>();

    for (const context of contexts) {
      if (!seenHashes.has(context.contentHash)) {
        deduplicatedContexts.push(context);
        seenHashes.add(context.contentHash);
      }
    }

    // If still too large, apply content summarization while preserving structure
    if (config.contentAwareSettings.preserveCodeStructure) {
      return deduplicatedContexts; // Would implement content summarization
    }

    return deduplicatedContexts;
  }

  /**
   * Perform selective compression based on context types and quality
   */
  private async performSelectiveCompression(
    contexts: ContextIntelligenceNode[],
    config: ContextCompressionConfig
  ): Promise<ContextIntelligenceNode[]> {
    const typeImportance: Record<ContextNodeType, number> = {
      'file': 1.0,
      'module': 0.9,
      'api': 0.8,
      'pattern': 0.7,
      'dependency': 0.9,
      'artifact': 0.6,
      'conversation': 0.5,
      'config': 0.8,
      'documentation': 0.6,
      'test': 0.7,
      'schema': 0.8
    };

    return contexts
      .filter(context => {
        const importance = typeImportance[context.type] || 0.5;
        const qualityScore = context.qualityMetrics.relevanceScore;
        const combinedScore = importance * qualityScore;
        
        return combinedScore >= config.qualityThreshold;
      })
      .sort((a, b) => {
        const scoreA = (typeImportance[a.type] || 0.5) * a.qualityMetrics.relevanceScore;
        const scoreB = (typeImportance[b.type] || 0.5) * b.qualityMetrics.relevanceScore;
        return scoreB - scoreA;
      })
      .slice(0, Math.ceil(contexts.length * config.targetCompressionRatio));
  }

  /**
   * Perform adaptive compression based on current context window pressure
   */
  private async performAdaptiveCompression(
    contexts: ContextIntelligenceNode[],
    config: ContextCompressionConfig
  ): Promise<ContextIntelligenceNode[]> {
    const totalTokens = contexts.reduce((sum, ctx) => sum + ctx.tokenCount, 0);
    const targetTokens = Math.ceil(totalTokens * config.targetCompressionRatio);
    
    let currentTokens = 0;
    const selectedContexts: ContextIntelligenceNode[] = [];
    
    // Sort by adaptive priority considering current project phase and recent usage
    const adaptiveContexts = contexts
      .map(context => ({
        context,
        priority: this.calculateAdaptivePriority(context, config)
      }))
      .sort((a, b) => b.priority - a.priority);

    // Select contexts until token limit is reached
    for (const item of adaptiveContexts) {
      if (currentTokens + item.context.tokenCount <= targetTokens) {
        selectedContexts.push(item.context);
        currentTokens += item.context.tokenCount;
      }
    }

    return selectedContexts;
  }

  // =============================================================================
  // PRIVATE METHODS - UTILITY FUNCTIONS
  // =============================================================================

  /**
   * Calculate content hash for change detection (from Cline patterns)
   */
  private async calculateContentHash(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Calculate token count using a simple estimation
   * Would use actual tokenizer in production
   */
  private async calculateTokenCount(content: string): Promise<number> {
    // Simple estimation: ~4 characters per token (GPT tokenization approximation)
    return Math.ceil(content.length / 4);
  }

  /**
   * Assess context quality using multiple quality indicators
   */
  private async assessContextQuality(context: ContextIntelligenceNode): Promise<ContextQualityMetrics> {
    const now = createTimestamp();
    
    // Calculate freshness score based on last modification
    const ageMs = Date.now() - new Date(context.lastModified).getTime();
    const ageDays = ageMs / (24 * 60 * 60 * 1000);
    const freshnessScore = Math.max(0.1, Math.exp(-ageDays / 30)); // Exponential decay over 30 days

    // Calculate completeness score based on content length and structure
    const completenessScore = Math.min(1.0, context.content.length / 1000); // Assume 1000 chars is "complete"

    // Calculate coherence score (simplified - would use more sophisticated analysis)
    const coherenceScore = context.content.length > 50 && 
                          context.content.split('\n').length > 1 ? 0.8 : 0.6;

    // Determine overall quality level
    const averageScore = (freshnessScore + context.relevanceScore + completenessScore + coherenceScore) / 4;
    let qualityLevel: ContextQualityLevel;
    
    if (averageScore >= 0.9) qualityLevel = 'excellent';
    else if (averageScore >= 0.7) qualityLevel = 'good';
    else if (averageScore >= 0.5) qualityLevel = 'fair';
    else if (averageScore >= 0.3) qualityLevel = 'poor';
    else if (ageDays > 90) qualityLevel = 'stale';
    else qualityLevel = 'invalid';

    return {
      qualityLevel,
      freshnessScore,
      relevanceScore: context.relevanceScore,
      completenessScore,
      accuracyScore: 0.85, // Would implement accuracy checking
      coherenceScore,
      validationIssues: [],
      lastAssessed: now,
      qualityTrend: 'stable'
    };
  }

  /**
   * Rank contexts by relevance using multiple factors
   */
  private rankContextsByRelevance(
    contexts: ContextIntelligenceNode[],
    currentPhase?: PhaseType,
    maxResults?: number
  ): ContextIntelligenceNode[] {
    const rankedContexts = contexts.map(context => ({
      context,
      score: calculateContextRelevance(context, '', currentPhase)
    }))
    .sort((a, b) => b.score - a.score);

    return maxResults 
      ? rankedContexts.slice(0, maxResults).map(item => item.context)
      : rankedContexts.map(item => item.context);
  }

  /**
   * Apply boost factors to search results
   */
  private applyBoostFactors(
    contexts: ContextIntelligenceNode[],
    boostFactors: Record<string, number>
  ): ContextIntelligenceNode[] {
    return contexts.map(context => {
      let boostMultiplier = 1.0;

      // Apply type-based boosts
      if (boostFactors[context.type]) {
        boostMultiplier *= boostFactors[context.type];
      }

      // Apply path-based boosts
      Object.entries(boostFactors).forEach(([pattern, boost]) => {
        if (pattern.startsWith('/') && context.path.includes(pattern.slice(1))) {
          boostMultiplier *= boost;
        }
      });

      // Create boosted context (immutable update)
      return {
        ...context,
        relevanceScore: Math.min(1.0, context.relevanceScore * boostMultiplier)
      };
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Apply temporal weighting to favor recent contexts
   */
  private applyTemporalWeighting(contexts: ContextIntelligenceNode[]): ContextIntelligenceNode[] {
    const now = Date.now();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

    return contexts.map(context => {
      const age = now - new Date(context.lastModified).getTime();
      const temporalWeight = Math.max(0.1, 1.0 - (age / maxAge));

      return {
        ...context,
        relevanceScore: Math.min(1.0, context.relevanceScore * temporalWeight)
      };
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Update access patterns for contexts (from Cline's usage tracking)
   */
  private async updateAccessPatterns(contextIds: UUID[]): Promise<void> {
    const now = createTimestamp();
    
    contextIds.forEach(contextId => {
      const context = this.contextNodes.get(contextId);
      if (context) {
        // Update access count and timestamp
        context.accessCount++;
        context.lastAccessed = now;

        // Update access pattern analysis
        const accessPattern = this.accessPatterns.get(contextId) || context.accessPattern;
        accessPattern.accessFrequency.hourly++;
        accessPattern.accessFrequency.daily++;
        accessPattern.accessFrequency.weekly++;
        accessPattern.lastAnalyzed = now;

        this.accessPatterns.set(contextId, accessPattern);
        this.contextNodes.set(contextId, context);
      }
    });
  }

  /**
   * Calculate result quality metrics
   */
  private calculateResultQuality(contexts: ContextIntelligenceNode[]): {
    averageRelevance: number;
    coverageScore: number;
    diversityScore: number;
    qualityScore: number;
  } {
    if (contexts.length === 0) {
      return {
        averageRelevance: 0,
        coverageScore: 0,
        diversityScore: 0,
        qualityScore: 0
      };
    }

    const averageRelevance = contexts.reduce((sum, ctx) => sum + ctx.relevanceScore, 0) / contexts.length;
    
    // Calculate type diversity
    const uniqueTypes = new Set(contexts.map(ctx => ctx.type)).size;
    const maxPossibleTypes = Object.keys({ 'file': 1, 'module': 1, 'dependency': 1, 'pattern': 1, 'artifact': 1, 'conversation': 1 }).length;
    const diversityScore = uniqueTypes / maxPossibleTypes;

    // Calculate coverage score (proportion of high-quality results)
    const highQualityCount = contexts.filter(ctx => 
      ['excellent', 'good'].includes(ctx.qualityMetrics.qualityLevel)
    ).length;
    const coverageScore = highQualityCount / contexts.length;

    const qualityScore = (averageRelevance + diversityScore + coverageScore) / 3;

    return {
      averageRelevance,
      coverageScore,
      diversityScore,
      qualityScore
    };
  }

  /**
   * Find related contexts based on relationships and similarity
   */
  private async findRelatedContexts(
    contexts: ContextIntelligenceNode[],
    projectId: UUID,
    maxRelated: number
  ): Promise<Array<{
    contextId: UUID;
    relationshipType: 'dependency' | 'similar' | 'complementary';
    relevanceScore: number;
  }>> {
    const related: Array<{
      contextId: UUID;
      relationshipType: 'dependency' | 'similar' | 'complementary';
      relevanceScore: number;
    }> = [];

    const contextIds = new Set(contexts.map(c => c.id));
    
    // Find dependencies and dependents
    contexts.forEach(context => {
      context.dependencies.forEach(depId => {
        if (!contextIds.has(depId)) {
          related.push({
            contextId: depId,
            relationshipType: 'dependency',
            relevanceScore: 0.8
          });
        }
      });

      context.dependents.slice(0, 2).forEach(depId => {
        if (!contextIds.has(depId)) {
          related.push({
            contextId: depId,
            relationshipType: 'complementary',
            relevanceScore: 0.7
          });
        }
      });
    });

    // Sort by relevance and limit results
    return related
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxRelated);
  }

  /**
   * Calculate compression priority based on multiple factors
   */
  private calculateCompressionPriority(
    context: ContextIntelligenceNode,
    weights: ContextCompressionConfig['priorityWeights']
  ): number {
    const relevanceScore = context.relevanceScore * weights.relevance;
    const freshnessScore = context.qualityMetrics.freshnessScore * weights.freshness;
    const dependencyScore = (context.dependencies.length + context.dependents.length) / 10 * weights.dependencies;
    const userPreferenceScore = context.accessCount / 100 * weights.userPreference;

    return relevanceScore + freshnessScore + dependencyScore + userPreferenceScore;
  }

  /**
   * Calculate adaptive priority considering current context and usage patterns
   */
  private calculateAdaptivePriority(
    context: ContextIntelligenceNode,
    config: ContextCompressionConfig
  ): number {
    let priority = context.relevanceScore;

    // Recent access bonus
    const daysSinceAccess = (Date.now() - new Date(context.lastAccessed).getTime()) / (24 * 60 * 60 * 1000);
    if (daysSinceAccess < 1) priority *= 1.3;
    else if (daysSinceAccess < 7) priority *= 1.1;

    // Quality bonus
    switch (context.qualityMetrics.qualityLevel) {
      case 'excellent': priority *= 1.2; break;
      case 'good': priority *= 1.0; break;
      case 'fair': priority *= 0.8; break;
      case 'poor': priority *= 0.5; break;
      case 'stale': priority *= 0.3; break;
      case 'invalid': priority *= 0.1; break;
    }

    // Dependency importance
    const dependencyImportance = Math.min(1.0, (context.dependents.length * 0.2) + 0.5);
    priority *= dependencyImportance;

    return priority;
  }

  // =============================================================================
  // PRIVATE METHODS - ANALYSIS AND METRICS
  // =============================================================================

  /**
   * Find dependency cycles in context graph
   */
  private findDependencyCycle(
    context: ContextIntelligenceNode,
    allContexts: ContextIntelligenceNode[],
    visiting: Set<UUID>,
    visited: Set<UUID>
  ): UUID[] {
    if (visiting.has(context.id)) {
      // Found cycle
      return [context.id];
    }

    if (visited.has(context.id)) {
      return [];
    }

    visiting.add(context.id);

    for (const depId of context.dependencies) {
      const depContext = allContexts.find(c => c.id === depId);
      if (depContext) {
        const cycle = this.findDependencyCycle(depContext, allContexts, visiting, visited);
        if (cycle.length > 0) {
          return [context.id, ...cycle];
        }
      }
    }

    visiting.delete(context.id);
    visited.add(context.id);
    return [];
  }

  /**
   * Validate context dependencies
   */
  private async validateContextDependencies(
    context: ContextIntelligenceNode
  ): Promise<{
    dependenciesValid: boolean;
    circularDependencies: UUID[][];
    orphanedContexts: UUID[];
  }> {
    const dependenciesValid = context.dependencies.every(depId => 
      this.contextNodes.has(depId)
    );

    // Check for circular dependencies (simplified)
    const circularDependencies: UUID[][] = [];
    const visited = new Set<UUID>();
    const visiting = new Set<UUID>();

    const checkCycles = (nodeId: UUID): UUID[] => {
      if (visiting.has(nodeId)) return [nodeId];
      if (visited.has(nodeId)) return [];

      visiting.add(nodeId);
      const node = this.contextNodes.get(nodeId);
      if (node) {
        for (const depId of node.dependencies) {
          const cycle = checkCycles(depId);
          if (cycle.length > 0) {
            return [nodeId, ...cycle];
          }
        }
      }
      visiting.delete(nodeId);
      visited.add(nodeId);
      return [];
    };

    const cycle = checkCycles(context.id);
    if (cycle.length > 0) {
      circularDependencies.push(cycle);
    }

    return {
      dependenciesValid,
      circularDependencies,
      orphanedContexts: [] // Would implement orphan detection
    };
  }

  /**
   * Validate context content integrity
   */
  private async validateContextContent(
    context: ContextIntelligenceNode
  ): Promise<Array<{
    type: 'content' | 'quality' | 'relationships' | 'metadata';
    field: string;
    valid: boolean;
    message: string;
    suggestion?: string;
  }>> {
    const validations = [];

    // Content validation
    if (context.content.length === 0) {
      validations.push({
        type: 'content' as const,
        field: 'content',
        valid: false,
        message: 'Content is empty',
        suggestion: 'Add meaningful content to improve context utility'
      });
    }

    // Quality validation
    if (context.qualityMetrics.qualityLevel === 'poor') {
      validations.push({
        type: 'quality' as const,
        field: 'qualityLevel',
        valid: false,
        message: 'Context quality is below acceptable threshold',
        suggestion: 'Review and update content to improve quality'
      });
    }

    // Metadata validation
    if (!context.metadata || Object.keys(context.metadata).length === 0) {
      validations.push({
        type: 'metadata' as const,
        field: 'metadata',
        valid: false,
        message: 'Missing metadata',
        suggestion: 'Add relevant metadata for better context understanding'
      });
    }

    return validations;
  }

  /**
   * Generate context optimization recommendations
   */
  private async generateContextRecommendations(
    contexts: ContextIntelligenceNode[]
  ): Promise<ContextRecommendation[]> {
    const recommendations: ContextRecommendation[] = [];
    const now = createTimestamp();

    // Find stale contexts
    const staleContexts = contexts.filter(ctx => 
      ctx.qualityMetrics.qualityLevel === 'stale'
    );

    if (staleContexts.length > 0) {
      recommendations.push({
        id: generateUUID(),
        type: 'quality',
        priority: 'medium',
        title: 'Update Stale Contexts',
        description: `${staleContexts.length} contexts are marked as stale and should be reviewed or refreshed`,
        expectedImpact: {
          qualityImprovement: 0.2,
          performanceImprovement: 0.1
        },
        implementationEffort: 'medium',
        affectedContextIds: staleContexts.map(ctx => ctx.id),
        generatedAt: now
      });
    }

    // Find contexts with low access frequency
    const underutilizedContexts = contexts.filter(ctx => 
      ctx.accessCount === 0 && 
      new Date(ctx.createdAt).getTime() < Date.now() - (7 * 24 * 60 * 60 * 1000)
    );

    if (underutilizedContexts.length > 0) {
      recommendations.push({
        id: generateUUID(),
        type: 'optimization',
        priority: 'low',
        title: 'Archive Underutilized Contexts',
        description: `${underutilizedContexts.length} contexts haven't been accessed recently and could be archived`,
        expectedImpact: {
          performanceImprovement: 0.15,
          storageReduction: underutilizedContexts.length * 0.1
        },
        implementationEffort: 'low',
        affectedContextIds: underutilizedContexts.map(ctx => ctx.id),
        generatedAt: now
      });
    }

    return recommendations;
  }

  /**
   * Background optimization process (from Cline's background processing patterns)
   */
  private startBackgroundOptimization(): void {
    const optimizationInterval = CONTEXT_INTELLIGENCE_CONSTANTS.QUALITY_ASSESSMENT_INTERVAL;
    
    setInterval(async () => {
      try {
        await this.performBackgroundOptimization();
      } catch (error) {
        this.logger.error('Background optimization failed', { error });
      }
    }, optimizationInterval);

    this.logger.info('Background optimization started', {
      interval: optimizationInterval
    });
  }

  /**
   * Perform background optimization tasks
   */
  private async performBackgroundOptimization(): Promise<void> {
    if (!this.config.performance.backgroundProcessing) {
      return;
    }

    // Quality assessment refresh
    if (this.config.qualityAssessment.enabled && 
        this.config.qualityAssessment.assessmentFrequency === 'periodic') {
      await this.refreshQualityMetrics();
    }

    // Auto-compression of old contexts
    if (this.config.optimization.autoCompression) {
      await this.performAutoCompression();
    }

    // Cleanup expired cache entries
    await this.cleanupCache();
  }

  /**
   * Refresh quality metrics for all contexts
   */
  private async refreshQualityMetrics(): Promise<void> {
    const contexts = Array.from(this.contextNodes.values());
    const batchSize = 10;

    for (let i = 0; i < contexts.length; i += batchSize) {
      const batch = contexts.slice(i, i + batchSize);
      await Promise.all(batch.map(async context => {
        try {
          const updatedQuality = await this.assessContextQuality(context);
          context.qualityMetrics = updatedQuality;
          this.contextNodes.set(context.id, context);
          this.qualityMetricsCache.set(context.id, updatedQuality);
        } catch (error) {
          this.logger.warn('Failed to refresh quality metrics', {
            contextId: context.id,
            error
          });
        }
      }));
    }
  }

  /**
   * Perform automatic compression of contexts
   */
  private async performAutoCompression(): Promise<void> {
    const maxAge = this.config.optimization.maxContextAge;
    const oldContexts = Array.from(this.contextNodes.values())
      .filter(context => {
        const age = Date.now() - new Date(context.createdAt).getTime();
        return age > maxAge && context.qualityMetrics.qualityLevel === 'fair';
      });

    if (oldContexts.length > 0) {
      const compressionConfig: ContextCompressionConfig = {
        strategy: 'adaptive',
        targetCompressionRatio: this.config.optimization.compressionThreshold,
        qualityThreshold: 0.5,
        priorityWeights: {
          relevance: 0.4,
          freshness: 0.2,
          dependencies: 0.2,
          userPreference: 0.2
        },
        contentAwareSettings: {
          preserveCodeStructure: true,
          preserveKeywords: true,
          preserveRelationships: true
        }
      };

      await this.compressContexts(oldContexts.map(ctx => ctx.id), compressionConfig);
    }
  }

  /**
   * Cleanup expired cache entries
   */
  private async cleanupCache(): Promise<void> {
    const now = Date.now();
    const cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours

    // Clean compression cache
    for (const [operationId, result] of this.compressionCache.entries()) {
      const age = now - new Date(result.compressedAt).getTime();
      if (age > cacheExpiry) {
        this.compressionCache.delete(operationId);
      }
    }

    // Clean quality metrics cache
    for (const [contextId, metrics] of this.qualityMetricsCache.entries()) {
      const age = now - new Date(metrics.lastAssessed).getTime();
      if (age > cacheExpiry) {
        this.qualityMetricsCache.delete(contextId);
      }
    }
  }

  // =============================================================================
  // PRIVATE METHODS - ANALYTICS CALCULATIONS
  // =============================================================================

  /**
   * Calculate peak usage hours from access patterns
   */
  private calculatePeakUsageHours(contexts: ContextIntelligenceNode[]): number[] {
    const hourlyAccess = new Array(24).fill(0);
    
    contexts.forEach(context => {
      const accessTime = new Date(context.lastAccessed);
      hourlyAccess[accessTime.getHours()]++;
    });

    // Find top 3 peak hours
    return hourlyAccess
      .map((count, hour) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(item => item.hour);
  }

  /**
   * Calculate average session duration
   */
  private calculateAverageSessionDuration(contexts: ContextIntelligenceNode[]): number {
    // Simplified calculation - would need actual session tracking
    return contexts.length > 0 ? 45 * 60 * 1000 : 0; // 45 minutes in milliseconds
  }

  /**
   * Calculate contexts per session
   */
  private calculateContextsPerSession(contexts: ContextIntelligenceNode[]): number {
    // Simplified calculation - would need actual session tracking
    return contexts.length > 0 ? Math.ceil(contexts.length / 10) : 0;
  }

  /**
   * Find most common access pattern
   */
  private findMostCommonAccessPattern(contexts: ContextIntelligenceNode[]): ContextAccessPattern {
    const patternCounts = new Map<ContextAccessPattern, number>();

    contexts.forEach(context => {
      const pattern = context.accessPattern.primaryPattern;
      patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1);
    });

    let maxCount = 0;
    let mostCommon: ContextAccessPattern = 'sequential';

    for (const [pattern, count] of patternCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = pattern;
      }
    }

    return mostCommon;
  }

  /**
   * Calculate average quality score
   */
  private calculateAverageQualityScore(contexts: ContextIntelligenceNode[]): number {
    if (contexts.length === 0) return 0;

    const qualityValues: Record<ContextQualityLevel, number> = {
      excellent: 1.0,
      good: 0.8,
      fair: 0.6,
      poor: 0.4,
      stale: 0.2,
      invalid: 0.0
    };

    const totalScore = contexts.reduce((sum, context) => 
      sum + qualityValues[context.qualityMetrics.qualityLevel], 0
    );

    return totalScore / contexts.length;
  }

  /**
   * Calculate quality degradation from compression
   */
  private async calculateQualityDegradation(
    original: ContextIntelligenceNode[],
    compressed: ContextIntelligenceNode[]
  ): Promise<number> {
    if (original.length === 0) return 0;

    const originalQuality = this.calculateAverageQualityScore(original);
    const compressedQuality = this.calculateAverageQualityScore(compressed);

    return Math.max(0, originalQuality - compressedQuality);
  }

  /**
   * Calculate preserved relationships after compression
   */
  private async calculatePreservedRelationships(
    original: ContextIntelligenceNode[],
    compressed: ContextIntelligenceNode[]
  ): Promise<number> {
    const compressedIds = new Set(compressed.map(ctx => ctx.id));
    
    let totalRelationships = 0;
    let preservedRelationships = 0;

    original.forEach(context => {
      totalRelationships += context.dependencies.length + context.dependents.length;
      
      if (compressedIds.has(context.id)) {
        const preservedDeps = context.dependencies.filter(depId => compressedIds.has(depId)).length;
        const preservedDependents = context.dependents.filter(depId => compressedIds.has(depId)).length;
        preservedRelationships += preservedDeps + preservedDependents;
      }
    });

    return totalRelationships > 0 ? preservedRelationships / totalRelationships : 1.0;
  }

  // =============================================================================
  // PUBLIC UTILITY METHODS
  // =============================================================================

  /**
   * Get context by ID with access tracking
   */
  async getContext(contextId: UUID): Promise<ApiResponse<ContextIntelligenceNode | null>> {
    const context = this.contextNodes.get(contextId);
    
    if (context) {
      // Update access patterns
      await this.updateAccessPatterns([contextId]);
    }

    return createApiResponse(context || null);
  }

  /**
   * Get all contexts for a project
   */
  async getProjectContexts(projectId: UUID): Promise<ApiResponse<ContextIntelligenceNode[]>> {
    const contextIds = this.projectContexts.get(projectId) || new Set();
    const contexts = Array.from(contextIds)
      .map(id => this.contextNodes.get(id))
      .filter((context): context is ContextIntelligenceNode => context !== undefined);

    return createApiResponse(contexts);
  }

  /**
   * Update configuration at runtime
   */
  async updateConfig(newConfig: Partial<ContextIntelligenceConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('ContextProcessor configuration updated', { newConfig });
  }

  /**
   * Get current processor statistics
   */
  getStatistics(): {
    totalContexts: number;
    activeProjects: number;
    cacheSize: number;
    memoryUsageMB: number;
  } {
    return {
      totalContexts: this.contextNodes.size,
      activeProjects: this.projectContexts.size,
      cacheSize: this.compressionCache.size + this.qualityMetricsCache.size,
      memoryUsageMB: this.estimateMemoryUsage()
    };
  }

  /**
   * Cleanup all resources
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up ContextProcessor resources');
    
    this.contextNodes.clear();
    this.projectContexts.clear();
    this.accessPatterns.clear();
    this.compressionCache.clear();
    this.qualityMetricsCache.clear();
    this.processingQueue.clear();
    
    this.isInitialized = false;
  }

  // =============================================================================
  // PRIVATE UTILITY METHODS
  // =============================================================================

  /**
   * Estimate memory usage of the processor
   */
  private estimateMemoryUsage(): number {
    let totalSize = 0;
    
    // Estimate context nodes size
    this.contextNodes.forEach(context => {
      totalSize += context.content.length * 2; // UTF-16 encoding
      totalSize += (context.vectorEmbedding?.length || 0) * 8; // Float64 arrays
      totalSize += JSON.stringify(context.metadata).length * 2;
    });

    // Convert to MB
    return totalSize / (1024 * 1024);
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export { ContextProcessor };
export default ContextProcessor;
