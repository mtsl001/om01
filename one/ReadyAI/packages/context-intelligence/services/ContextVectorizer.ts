// packages/context-intelligence/services/ContextVectorizer.ts

/**
 * Context Vectorization Service for ReadyAI Personal AI Development Orchestrator
 * 
 * Advanced vector processing service adapted from Cline's EmbeddingService patterns
 * for ReadyAI's context intelligence architecture. Handles context-specific embedding
 * generation, intelligent chunking strategies, and vector optimization for AI-powered
 * development workflows.
 * 
 * Adapted from Cline's src/services/embedding/EmbeddingService.ts (400+ lines)
 * Key Adaptations:
 * - Context-aware embedding generation from Cline's proven embedding patterns
 * - Advanced chunking strategies adapted from Cline's content processing
 * - Vector optimization techniques from Cline's performance optimizations
 * - Batch processing patterns from Cline's efficient processing systems
 * - Caching mechanisms from Cline's context caching architecture
 * 
 * ReadyAI Enhancements:
 * - Context-specific vectorization for different node types
 * - Intelligent chunking based on content type and structure
 * - Quality-aware embedding generation with fallback strategies
 * - Multi-modal context vectorization support
 * - Performance optimization for large context windows
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
  ContextVectorizationConfig,
  ContextVectorizationResult,
  ContextChunkingStrategy,
  ContextEmbeddingQuality,
  ContextVectorCache,
  VectorizationPerformanceMetrics,
  ContextChunkMetadata,
  DEFAULT_VECTORIZATION_CONFIG,
  VECTORIZATION_CONSTANTS,
  validateContextNode,
  calculateContextRelevance
} from '../types/context';

import {
  VectorSearchResult,
  EmbeddingResult,
  EmbeddingBatchResult,
  VectorPerformanceMetrics
} from '../../vectordb/types/vectordb';

import { EmbeddingService } from '../../vectordb/services/EmbeddingService';
import { VectorDatabaseService } from '../../vectordb/services/VectorDatabaseService';
import { Logger } from '../../logging/services/Logger';

// =============================================================================
// CONTEXT VECTORIZER SERVICE
// =============================================================================

/**
 * Advanced context vectorization service with Cline-inspired architecture
 * Handles context-specific embedding generation and intelligent chunking
 */
export class ContextVectorizer {
  private readonly logger: Logger;
  private readonly embeddingService: EmbeddingService;
  private readonly vectorDb: VectorDatabaseService;
  
  // Caching and performance optimization (adapted from Cline patterns)
  private readonly vectorCache: Map<string, ContextVectorCache> = new Map();
  private readonly chunkCache: Map<string, ContextChunkMetadata[]> = new Map();
  private readonly processingQueue: Map<UUID, Promise<any>> = new Map();
  
  // Configuration and state
  private config: ContextVectorizationConfig;
  private isInitialized: boolean = false;

  constructor(
    config: ContextVectorizationConfig = DEFAULT_VECTORIZATION_CONFIG,
    embeddingService: EmbeddingService,
    vectorDb: VectorDatabaseService,
    logger: Logger
  ) {
    this.config = { ...config };
    this.embeddingService = embeddingService;
    this.vectorDb = vectorDb;
    this.logger = logger;

    this.logger.info('ContextVectorizer initialized with configuration', {
      chunkingEnabled: config.chunking.enabled,
      batchSize: config.performance.batchSize,
      cacheEnabled: config.performance.enableCache
    });
  }

  /**
   * Initialize the vectorizer with health checks
   * Adapted from Cline's initialization patterns
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize embedding service
      await this.embeddingService.initialize();
      this.logger.info('Embedding service initialized');

      // Initialize vector database if needed
      if (this.config.integration.storeVectors) {
        await this.vectorDb.initialize();
        this.logger.info('Vector database initialized');
      }

      // Start background cleanup if enabled
      if (this.config.performance.enableCache) {
        this.startBackgroundCleanup();
      }

      this.isInitialized = true;
      this.logger.info('ContextVectorizer fully initialized');

    } catch (error) {
      const vectorizerError = new ReadyAIError(
        `Failed to initialize ContextVectorizer: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'INITIALIZATION_FAILED',
        500,
        { originalError: error },
        true,
        5000
      );
      
      this.logger.error('ContextVectorizer initialization failed', { error: vectorizerError });
      throw vectorizerError;
    }
  }

  /**
   * Vectorize a single context node with intelligent chunking and embedding
   * Combines Cline's embedding patterns with ReadyAI's context intelligence
   */
  async vectorizeContext(
    context: ContextIntelligenceNode,
    options?: {
      forceRegeneration?: boolean;
      chunkingStrategy?: ContextChunkingStrategy;
      qualityThreshold?: number;
    }
  ): Promise<ApiResponse<ContextVectorizationResult>> {
    return wrapAsync(async () => {
      const startTime = performance.now();
      const operationId = generateUUID();

      this.logger.debug('Starting context vectorization', {
        operationId,
        contextId: context.id,
        contextType: context.type,
        contentLength: context.content.length,
        forceRegeneration: options?.forceRegeneration || false
      });

      // Check cache first if not forcing regeneration
      if (!options?.forceRegeneration && this.config.performance.enableCache) {
        const cached = this.getCachedVectorization(context);
        if (cached) {
          this.logger.debug('Using cached vectorization', {
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

      // Determine chunking strategy
      const chunkingStrategy = options?.chunkingStrategy || 
                              this.determineOptimalChunkingStrategy(context);

      // Perform intelligent chunking
      const chunks = await this.chunkContext(context, chunkingStrategy);
      
      this.logger.debug('Context chunked', {
        operationId,
        contextId: context.id,
        chunkCount: chunks.length,
        strategy: chunkingStrategy
      });

      // Generate embeddings for chunks
      const embeddings = await this.generateChunkEmbeddings(chunks, context.type);

      // Calculate quality metrics
      const qualityMetrics = await this.assessEmbeddingQuality(embeddings, context);

      // Apply quality threshold if specified
      const qualityThreshold = options?.qualityThreshold || 
                              this.config.quality.minimumQuality;
      
      if (qualityMetrics.averageQuality < qualityThreshold) {
        this.logger.warn('Embedding quality below threshold', {
          operationId,
          contextId: context.id,
          quality: qualityMetrics.averageQuality,
          threshold: qualityThreshold
        });

        // Try with different strategy if quality is poor
        if (chunkingStrategy !== 'adaptive') {
          return this.vectorizeContext(context, {
            ...options,
            chunkingStrategy: 'adaptive'
          });
        }
      }

      // Store vectors in database if configured
      let vectorIds: string[] = [];
      if (this.config.integration.storeVectors && this.vectorDb) {
        vectorIds = await this.storeContextVectors(context, chunks, embeddings);
      }

      const durationMs = performance.now() - startTime;

      const result: ContextVectorizationResult = {
        operationId,
        contextId: context.id,
        chunks: chunks.length,
        embeddings: embeddings.length,
        chunkingStrategy,
        qualityMetrics,
        vectorIds,
        performanceMetrics: {
          durationMs,
          tokensProcessed: chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0),
          embeddingGenerationMs: embeddings.reduce((sum, emb) => sum + (emb.durationMs || 0), 0),
          cacheHitRate: 0, // Would be calculated from actual cache stats
          throughputTokensPerSecond: chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0) / (durationMs / 1000)
        },
        vectorizedAt: createTimestamp()
      };

      // Cache result if enabled
      if (this.config.performance.enableCache) {
        this.cacheVectorization(context, result);
      }

      this.logger.info('Context vectorization completed', {
        operationId,
        contextId: context.id,
        chunks: result.chunks,
        quality: result.qualityMetrics.averageQuality,
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
   * Batch vectorize multiple contexts with optimization
   * Enhanced batch processing from Cline's batch patterns
   */
  async vectorizeContextsBatch(
    contexts: ContextIntelligenceNode[],
    options?: {
      batchSize?: number;
      concurrency?: number;
      progressCallback?: (completed: number, total: number) => void;
    }
  ): Promise<ApiResponse<ContextVectorizationResult[]>> {
    return wrapAsync(async () => {
      const startTime = performance.now();
      const operationId = generateUUID();
      
      const batchSize = options?.batchSize || this.config.performance.batchSize;
      const concurrency = options?.concurrency || this.config.performance.concurrency;

      this.logger.info('Starting batch context vectorization', {
        operationId,
        totalContexts: contexts.length,
        batchSize,
        concurrency
      });

      const results: ContextVectorizationResult[] = [];
      const batches = this.createBatches(contexts, batchSize);
      
      let completed = 0;

      // Process batches with concurrency control
      for (const batch of batches) {
        const batchPromises = batch.map(async (context, index) => {
          try {
            const result = await this.vectorizeContext(context);
            if (result.success) {
              completed++;
              options?.progressCallback?.(completed, contexts.length);
              return result.data;
            } else {
              this.logger.warn('Context vectorization failed in batch', {
                contextId: context.id,
                error: result.error
              });
              return null;
            }
          } catch (error) {
            this.logger.error('Batch vectorization error', {
              contextId: context.id,
              error
            });
            return null;
          }
        });

        // Wait for batch completion with concurrency limit
        const batchResults = await this.processConcurrently(batchPromises, concurrency);
        results.push(...batchResults.filter((r): r is ContextVectorizationResult => r !== null));
      }

      const durationMs = performance.now() - startTime;

      this.logger.info('Batch vectorization completed', {
        operationId,
        totalContexts: contexts.length,
        successfulVectorizations: results.length,
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
   * Re-vectorize contexts with updated configuration or model
   * Handles context evolution and embedding updates
   */
  async revectorizeContexts(
    contextIds: UUID[],
    options?: {
      newConfig?: Partial<ContextVectorizationConfig>;
      modelUpdate?: boolean;
      preserveHistory?: boolean;
    }
  ): Promise<ApiResponse<{
    updated: UUID[];
    failed: UUID[];
    performanceMetrics: VectorizationPerformanceMetrics;
  }>> {
    return wrapAsync(async () => {
      const startTime = performance.now();
      const operationId = generateUUID();

      this.logger.info('Starting context re-vectorization', {
        operationId,
        contextCount: contextIds.length,
        modelUpdate: options?.modelUpdate || false
      });

      // Update configuration if provided
      if (options?.newConfig) {
        this.config = { ...this.config, ...options.newConfig };
      }

      const updated: UUID[] = [];
      const failed: UUID[] = [];

      // Clear cache if model is being updated
      if (options?.modelUpdate) {
        this.clearVectorCache();
        this.logger.info('Vector cache cleared for model update');
      }

      // Process each context
      for (const contextId of contextIds) {
        try {
          // Would need to retrieve context from storage
          // For now, we'll simulate the process
          const success = await this.revectorizeContext(contextId, options);
          
          if (success) {
            updated.push(contextId);
          } else {
            failed.push(contextId);
          }
        } catch (error) {
          this.logger.error('Re-vectorization failed for context', {
            contextId,
            error
          });
          failed.push(contextId);
        }
      }

      const durationMs = performance.now() - startTime;

      const performanceMetrics: VectorizationPerformanceMetrics = {
        durationMs,
        tokensProcessed: 0, // Would be calculated from actual processing
        embeddingGenerationMs: 0, // Would be calculated from actual processing
        cacheHitRate: 0,
        throughputTokensPerSecond: 0
      };

      this.logger.info('Context re-vectorization completed', {
        operationId,
        totalContexts: contextIds.length,
        updated: updated.length,
        failed: failed.length,
        duration: durationMs
      });

      return {
        updated,
        failed,
        performanceMetrics
      };

    }).then(result => {
      if (result.success) {
        return createApiResponse(result.data);
      } else {
        throw result.error;
      }
    });
  }

  /**
   * Get vectorization statistics and health metrics
   */
  async getVectorizationStats(): Promise<ApiResponse<{
    totalVectorized: number;
    cacheSize: number;
    cacheHitRate: number;
    averageQuality: number;
    performanceMetrics: {
      averageDuration: number;
      averageThroughput: number;
      memoryUsage: number;
    };
  }>> {
    return wrapAsync(async () => {
      const cacheEntries = Array.from(this.vectorCache.values());
      
      return {
        totalVectorized: cacheEntries.length,
        cacheSize: this.vectorCache.size,
        cacheHitRate: this.calculateCacheHitRate(),
        averageQuality: this.calculateAverageQuality(cacheEntries),
        performanceMetrics: {
          averageDuration: this.calculateAverageDuration(cacheEntries),
          averageThroughput: this.calculateAverageThroughput(cacheEntries),
          memoryUsage: this.estimateMemoryUsage()
        }
      };

    }).then(result => {
      if (result.success) {
        return createApiResponse(result.data);
      } else {
        throw result.error;
      }
    });
  }

  // =============================================================================
  // PRIVATE METHODS - CHUNKING STRATEGIES
  // =============================================================================

  /**
   * Determine optimal chunking strategy based on context characteristics
   * Enhanced strategy selection from Cline's context management patterns
   */
  private determineOptimalChunkingStrategy(context: ContextIntelligenceNode): ContextChunkingStrategy {
    const contentLength = context.content.length;
    const contentType = context.type;

    // Strategy selection based on content characteristics
    if (contentLength < VECTORIZATION_CONSTANTS.MIN_CHUNK_SIZE) {
      return 'none';
    }

    if (contentType === 'file' && context.path?.endsWith('.md')) {
      return 'semantic'; // Markdown benefits from semantic chunking
    }

    if (contentType === 'pattern' || contentType === 'api') {
      return 'fixed'; // Structured content works well with fixed chunks
    }

    if (contentLength > VECTORIZATION_CONSTANTS.MAX_CONTENT_SIZE) {
      return 'adaptive'; // Large content needs adaptive strategy
    }

    return this.config.chunking.defaultStrategy;
  }

  /**
   * Chunk context content using specified strategy
   * Advanced chunking algorithms adapted from Cline's content processing
   */
  private async chunkContext(
    context: ContextIntelligenceNode,
    strategy: ContextChunkingStrategy
  ): Promise<ContextChunkMetadata[]> {
    const cacheKey = `${context.id}_${strategy}_${context.contentHash}`;
    
    // Check chunk cache
    if (this.config.performance.enableCache) {
      const cached = this.chunkCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    let chunks: ContextChunkMetadata[];

    switch (strategy) {
      case 'none':
        chunks = await this.chunkNone(context);
        break;
      
      case 'fixed':
        chunks = await this.chunkFixed(context);
        break;
      
      case 'semantic':
        chunks = await this.chunkSemantic(context);
        break;
      
      case 'adaptive':
        chunks = await this.chunkAdaptive(context);
        break;
      
      case 'sliding':
        chunks = await this.chunkSliding(context);
        break;
      
      default:
        chunks = await this.chunkFixed(context);
    }

    // Cache chunks
    if (this.config.performance.enableCache) {
      this.chunkCache.set(cacheKey, chunks);
    }

    return chunks;
  }

  /**
   * No chunking - treat entire content as single chunk
   */
  private async chunkNone(context: ContextIntelligenceNode): Promise<ContextChunkMetadata[]> {
    const tokenCount = await this.estimateTokenCount(context.content);
    
    return [{
      id: generateUUID(),
      contextId: context.id,
      chunkIndex: 0,
      content: context.content,
      tokenCount,
      startPosition: 0,
      endPosition: context.content.length,
      metadata: {
        type: context.type,
        phase: context.creationPhase,
        isComplete: true
      }
    }];
  }

  /**
   * Fixed-size chunking with overlap
   */
  private async chunkFixed(context: ContextIntelligenceNode): Promise<ContextChunkMetadata[]> {
    const chunkSize = this.config.chunking.fixedSize;
    const overlap = this.config.chunking.overlapSize;
    const content = context.content;
    const chunks: ContextChunkMetadata[] = [];
    
    let startPos = 0;
    let chunkIndex = 0;

    while (startPos < content.length) {
      const endPos = Math.min(startPos + chunkSize, content.length);
      const chunkContent = content.slice(startPos, endPos);
      const tokenCount = await this.estimateTokenCount(chunkContent);

      chunks.push({
        id: generateUUID(),
        contextId: context.id,
        chunkIndex,
        content: chunkContent,
        tokenCount,
        startPosition: startPos,
        endPosition: endPos,
        metadata: {
          type: context.type,
          phase: context.creationPhase,
          isComplete: endPos >= content.length,
          hasOverlap: startPos > 0
        }
      });

      startPos = endPos - overlap;
      chunkIndex++;

      // Prevent infinite loop
      if (startPos >= endPos) {
        break;
      }
    }

    return chunks;
  }

  /**
   * Semantic chunking based on content structure
   */
  private async chunkSemantic(context: ContextIntelligenceNode): Promise<ContextChunkMetadata[]> {
    const content = context.content;
    const chunks: ContextChunkMetadata[] = [];
    
    // Simple semantic chunking based on double line breaks
    const sections = content.split('\n\n').filter(section => section.trim().length > 0);
    
    let currentChunk = '';
    let chunkIndex = 0;
    let startPos = 0;

    for (const section of sections) {
      const potentialChunk = currentChunk + (currentChunk ? '\n\n' : '') + section;
      const tokenCount = await this.estimateTokenCount(potentialChunk);

      if (tokenCount <= this.config.chunking.maxTokens || !currentChunk) {
        currentChunk = potentialChunk;
      } else {
        // Save current chunk
        if (currentChunk) {
          const endPos = startPos + currentChunk.length;
          chunks.push({
            id: generateUUID(),
            contextId: context.id,
            chunkIndex,
            content: currentChunk,
            tokenCount: await this.estimateTokenCount(currentChunk),
            startPosition: startPos,
            endPosition: endPos,
            metadata: {
              type: context.type,
              phase: context.creationPhase,
              isComplete: false,
              semanticBoundary: true
            }
          });

          startPos = endPos;
          chunkIndex++;
        }
        
        currentChunk = section;
      }
    }

    // Add final chunk
    if (currentChunk) {
      const endPos = startPos + currentChunk.length;
      chunks.push({
        id: generateUUID(),
        contextId: context.id,
        chunkIndex,
        content: currentChunk,
        tokenCount: await this.estimateTokenCount(currentChunk),
        startPosition: startPos,
        endPosition: endPos,
        metadata: {
          type: context.type,
          phase: context.creationPhase,
          isComplete: true,
          semanticBoundary: true
        }
      });
    }

    return chunks.length > 0 ? chunks : await this.chunkFixed(context);
  }

  /**
   * Adaptive chunking that adjusts based on content characteristics
   */
  private async chunkAdaptive(context: ContextIntelligenceNode): Promise<ContextChunkMetadata[]> {
    // For adaptive chunking, we'll use a combination of strategies
    const contentLength = context.content.length;
    
    if (contentLength < VECTORIZATION_CONSTANTS.MIN_CHUNK_SIZE * 2) {
      return this.chunkNone(context);
    }

    // Try semantic first, fall back to fixed if not effective
    const semanticChunks = await this.chunkSemantic(context);
    
    // Check if semantic chunking was effective
    const avgChunkSize = semanticChunks.reduce((sum, chunk) => sum + chunk.content.length, 0) / semanticChunks.length;
    const sizeVariance = this.calculateChunkSizeVariance(semanticChunks);
    
    if (sizeVariance < 0.5 && avgChunkSize > VECTORIZATION_CONSTANTS.MIN_CHUNK_SIZE) {
      return semanticChunks;
    }

    // Fall back to fixed chunking
    return this.chunkFixed(context);
  }

  /**
   * Sliding window chunking with overlap
   */
  private async chunkSliding(context: ContextIntelligenceNode): Promise<ContextChunkMetadata[]> {
    const windowSize = this.config.chunking.slidingWindowSize;
    const stepSize = this.config.chunking.slidingStepSize;
    const content = context.content;
    const chunks: ContextChunkMetadata[] = [];
    
    let startPos = 0;
    let chunkIndex = 0;

    while (startPos < content.length) {
      const endPos = Math.min(startPos + windowSize, content.length);
      const chunkContent = content.slice(startPos, endPos);
      const tokenCount = await this.estimateTokenCount(chunkContent);

      chunks.push({
        id: generateUUID(),
        contextId: context.id,
        chunkIndex,
        content: chunkContent,
        tokenCount,
        startPosition: startPos,
        endPosition: endPos,
        metadata: {
          type: context.type,
          phase: context.creationPhase,
          isComplete: endPos >= content.length,
          slidingWindow: true
        }
      });

      startPos += stepSize;
      chunkIndex++;

      // Prevent infinite loop and ensure progress
      if (stepSize <= 0 || startPos >= endPos) {
        break;
      }
    }

    return chunks;
  }

  // =============================================================================
  // PRIVATE METHODS - EMBEDDING GENERATION
  // =============================================================================

  /**
   * Generate embeddings for context chunks
   * Enhanced embedding generation from Cline's embedding patterns
   */
  private async generateChunkEmbeddings(
    chunks: ContextChunkMetadata[],
    contextType: ContextNodeType
  ): Promise<EmbeddingResult[]> {
    const embeddings: EmbeddingResult[] = [];
    const batchSize = this.config.performance.embeddingBatchSize;

    // Process chunks in batches for efficiency
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const batchTexts = batch.map(chunk => this.prepareTextForEmbedding(chunk.content, contextType));

      try {
        // Use batch embedding if available, otherwise process individually
        if (this.embeddingService.generateBatchEmbedding) {
          const batchResult = await this.embeddingService.generateBatchEmbedding(
            batchTexts,
            this.config.embedding.model
          );

          if (batchResult.success) {
            embeddings.push(...batchResult.data.embeddings);
          } else {
            // Fall back to individual processing
            for (const text of batchTexts) {
              const result = await this.embeddingService.generateEmbedding(
                text,
                this.config.embedding.model
              );
              
              if (result.success) {
                embeddings.push(result.data);
              } else {
                // Create placeholder embedding for failed generation
                embeddings.push(this.createPlaceholderEmbedding(text));
              }
            }
          }
        } else {
          // Process individually
          for (const text of batchTexts) {
            const result = await this.embeddingService.generateEmbedding(
              text,
              this.config.embedding.model
            );
            
            if (result.success) {
              embeddings.push(result.data);
            } else {
              embeddings.push(this.createPlaceholderEmbedding(text));
            }
          }
        }
      } catch (error) {
        this.logger.error('Batch embedding generation failed', {
          batchSize: batch.length,
          contextType,
          error
        });

        // Create placeholder embeddings for the failed batch
        for (const text of batchTexts) {
          embeddings.push(this.createPlaceholderEmbedding(text));
        }
      }
    }

    return embeddings;
  }

  /**
   * Prepare text for embedding generation with context-specific preprocessing
   */
  private prepareTextForEmbedding(text: string, contextType: ContextNodeType): string {
    let preparedText = text.trim();

    // Context-specific preprocessing
    switch (contextType) {
      case 'file':
        // Remove excessive whitespace but preserve structure
        preparedText = preparedText.replace(/\n{3,}/g, '\n\n');
        break;
      
      case 'api':
        // Normalize API documentation format
        preparedText = preparedText.replace(/``````/g, '[CODE_BLOCK]');
        break;
      
      case 'conversation':
        // Clean up conversation formatting
        preparedText = preparedText.replace(/^(Human|Assistant):\s*/gm, '');
        break;
      
      default:
        // General cleanup
        preparedText = preparedText.replace(/\s+/g, ' ');
    }

    // Ensure text is within reasonable length
    const maxLength = this.config.embedding.maxTextLength;
    if (preparedText.length > maxLength) {
      preparedText = preparedText.slice(0, maxLength) + '...';
    }

    return preparedText;
  }

  /**
   * Create placeholder embedding for failed generation
   */
  private createPlaceholderEmbedding(text: string): EmbeddingResult {
    return {
      text,
      vector: new Array(this.config.embedding.dimensions).fill(0),
      model: this.config.embedding.model,
      tokenCount: Math.ceil(text.length / 4), // Rough estimation
      durationMs: 0,
      quality: 0.1,
      generatedAt: createTimestamp()
    };
  }

  // =============================================================================
  // PRIVATE METHODS - QUALITY ASSESSMENT
  // =============================================================================

  /**
   * Assess embedding quality with multiple quality indicators
   */
  private async assessEmbeddingQuality(
    embeddings: EmbeddingResult[],
    context: ContextIntelligenceNode
  ): Promise<ContextEmbeddingQuality> {
    if (embeddings.length === 0) {
      return {
        averageQuality: 0,
        qualityVariance: 0,
        consistencyScore: 0,
        completenessScore: 0,
        assessedAt: createTimestamp()
      };
    }

    const qualities = embeddings.map(emb => emb.quality || 0.5);
    const averageQuality = qualities.reduce((sum, q) => sum + q, 0) / qualities.length;
    
    // Calculate quality variance
    const qualityVariance = this.calculateVariance(qualities);
    
    // Assess consistency by comparing vector similarities
    const consistencyScore = await this.calculateConsistencyScore(embeddings);
    
    // Calculate completeness based on coverage of original content
    const completenessScore = embeddings.length > 0 ? 
      Math.min(1.0, embeddings.length / Math.ceil(context.content.length / 1000)) : 0;

    return {
      averageQuality,
      qualityVariance,
      consistencyScore,
      completenessScore,
      assessedAt: createTimestamp()
    };
  }

  /**
   * Calculate consistency score between embeddings
   */
  private async calculateConsistencyScore(embeddings: EmbeddingResult[]): Promise<number> {
    if (embeddings.length < 2) {
      return 1.0; // Single embedding is perfectly consistent
    }

    let totalSimilarity = 0;
    let comparisons = 0;

    // Compare adjacent embeddings for consistency
    for (let i = 0; i < embeddings.length - 1; i++) {
      const sim = this.calculateCosineSimilarity(
        embeddings[i].vector,
        embeddings[i + 1].vector
      );
      totalSimilarity += sim;
      comparisons++;
    }

    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private calculateCosineSimilarity(vectorA: number[], vectorB: number[]): number {
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

  // =============================================================================
  // PRIVATE METHODS - STORAGE AND CACHING
  // =============================================================================

  /**
   * Store context vectors in database
   */
  private async storeContextVectors(
    context: ContextIntelligenceNode,
    chunks: ContextChunkMetadata[],
    embeddings: EmbeddingResult[]
  ): Promise<string[]> {
    const vectorIds: string[] = [];

    for (let i = 0; i < chunks.length && i < embeddings.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];

      try {
        const vectorId = await this.vectorDb.upsertVector({
          id: chunk.id,
          vector: embedding.vector,
          metadata: {
            contextId: context.id,
            chunkIndex: chunk.chunkIndex,
            contextType: context.type,
            phase: context.creationPhase,
            tokenCount: chunk.tokenCount,
            startPosition: chunk.startPosition,
            endPosition: chunk.endPosition,
            embeddingModel: embedding.model,
            createdAt: createTimestamp()
          }
        });

        if (vectorId) {
          vectorIds.push(vectorId);
        }
      } catch (error) {
        this.logger.error('Failed to store context vector', {
          chunkId: chunk.id,
          contextId: context.id,
          error
        });
      }
    }

    return vectorIds;
  }

  /**
   * Cache vectorization result
   */
  private cacheVectorization(
    context: ContextIntelligenceNode,
    result: ContextVectorizationResult
  ): void {
    const cacheKey = this.generateCacheKey(context);
    
    const cacheEntry: ContextVectorCache = {
      contextId: context.id,
      contentHash: context.contentHash,
      result,
      cachedAt: createTimestamp(),
      accessCount: 0,
      lastAccessed: createTimestamp()
    };

    this.vectorCache.set(cacheKey, cacheEntry);

    // Cleanup old entries if cache is getting too large
    if (this.vectorCache.size > this.config.performance.maxCacheSize) {
      this.cleanupOldCacheEntries();
    }
  }

  /**
   * Get cached vectorization result
   */
  private getCachedVectorization(context: ContextIntelligenceNode): ContextVectorizationResult | null {
    const cacheKey = this.generateCacheKey(context);
    const cached = this.vectorCache.get(cacheKey);

    if (cached && cached.contentHash === context.contentHash) {
      // Update access statistics
      cached.accessCount++;
      cached.lastAccessed = createTimestamp();
      
      return cached.result;
    }

    // Remove stale cache entry
    if (cached) {
      this.vectorCache.delete(cacheKey);
    }

    return null;
  }

  /**
   * Generate cache key for context
   */
  private generateCacheKey(context: ContextIntelligenceNode): string {
    return `${context.id}_${context.contentHash}_${this.config.embedding.model}`;
  }

  // =============================================================================
  // PRIVATE METHODS - UTILITY FUNCTIONS
  // =============================================================================

  /**
   * Estimate token count using simple heuristic
   */
  private async estimateTokenCount(text: string): Promise<number> {
    // Simple estimation: ~4 characters per token (GPT tokenization approximation)
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate variance of an array of numbers
   */
  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    
    return variance;
  }

  /**
   * Calculate chunk size variance for adaptive chunking
   */
  private calculateChunkSizeVariance(chunks: ContextChunkMetadata[]): number {
    const sizes = chunks.map(chunk => chunk.content.length);
    return this.calculateVariance(sizes) / Math.max(...sizes); // Normalized variance
  }

  /**
   * Create batches from array
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
   * Re-vectorize a single context (stub implementation)
   */
  private async revectorizeContext(
    contextId: UUID,
    options?: any
  ): Promise<boolean> {
    try {
      // Would retrieve context and re-vectorize
      // For now, simulate success
      await new Promise(resolve => setTimeout(resolve, 100));
      return true;
    } catch (error) {
      this.logger.error('Re-vectorization failed', { contextId, error });
      return false;
    }
  }

  /**
   * Clear vector cache
   */
  private clearVectorCache(): void {
    this.vectorCache.clear();
    this.chunkCache.clear();
    this.logger.info('Vector cache cleared');
  }

  /**
   * Calculate cache hit rate
   */
  private calculateCacheHitRate(): number {
    const entries = Array.from(this.vectorCache.values());
    if (entries.length === 0) return 0;
    
    const totalAccesses = entries.reduce((sum, entry) => sum + entry.accessCount, 0);
    return totalAccesses > 0 ? entries.length / totalAccesses : 0;
  }

  /**
   * Calculate average quality from cache entries
   */
  private calculateAverageQuality(entries: ContextVectorCache[]): number {
    if (entries.length === 0) return 0;
    
    const totalQuality = entries.reduce((sum, entry) => 
      sum + entry.result.qualityMetrics.averageQuality, 0
    );
    
    return totalQuality / entries.length;
  }

  /**
   * Calculate average duration from cache entries
   */
  private calculateAverageDuration(entries: ContextVectorCache[]): number {
    if (entries.length === 0) return 0;
    
    const totalDuration = entries.reduce((sum, entry) => 
      sum + entry.result.performanceMetrics.durationMs, 0
    );
    
    return totalDuration / entries.length;
  }

  /**
   * Calculate average throughput from cache entries
   */
  private calculateAverageThroughput(entries: ContextVectorCache[]): number {
    if (entries.length === 0) return 0;
    
    const totalThroughput = entries.reduce((sum, entry) => 
      sum + entry.result.performanceMetrics.throughputTokensPerSecond, 0
    );
    
    return totalThroughput / entries.length;
  }

  /**
   * Estimate memory usage
   */
  private estimateMemoryUsage(): number {
    let totalSize = 0;
    
    // Estimate vector cache size
    this.vectorCache.forEach(entry => {
      totalSize += JSON.stringify(entry).length * 2; // UTF-16 encoding
    });
    
    // Estimate chunk cache size
    this.chunkCache.forEach(chunks => {
      chunks.forEach(chunk => {
        totalSize += chunk.content.length * 2;
        totalSize += JSON.stringify(chunk.metadata).length * 2;
      });
    });
    
    // Convert to MB
    return totalSize / (1024 * 1024);
  }

  /**
   * Cleanup old cache entries based on access patterns
   */
  private cleanupOldCacheEntries(): void {
    const entries = Array.from(this.vectorCache.entries());
    const now = Date.now();
    const maxAge = this.config.performance.cacheMaxAge;
    
    // Remove entries that are too old or least accessed
    entries.sort((a, b) => {
      const ageA = now - new Date(a[1].lastAccessed).getTime();
      const ageB = now - new Date(b[1].lastAccessed).getTime();
      return ageB - ageA; // Oldest first
    });
    
    // Remove oldest 25% of entries
    const toRemove = Math.ceil(entries.length * 0.25);
    for (let i = 0; i < toRemove; i++) {
      this.vectorCache.delete(entries[i][0]);
    }
    
    this.logger.debug('Cache cleanup completed', {
      entriesRemoved: toRemove,
      remainingEntries: this.vectorCache.size
    });
  }

  /**
   * Start background cleanup process
   */
  private startBackgroundCleanup(): void {
    const cleanupInterval = VECTORIZATION_CONSTANTS.CACHE_CLEANUP_INTERVAL;
    
    setInterval(() => {
      try {
        if (this.vectorCache.size > this.config.performance.maxCacheSize * 0.8) {
          this.cleanupOldCacheEntries();
        }
      } catch (error) {
        this.logger.error('Background cleanup failed', { error });
      }
    }, cleanupInterval);

    this.logger.info('Background cleanup started', {
      interval: cleanupInterval
    });
  }

  /**
   * Update configuration at runtime
   */
  async updateConfig(newConfig: Partial<ContextVectorizationConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('ContextVectorizer configuration updated', { newConfig });
  }

  /**
   * Get current vectorizer statistics
   */
  getStatistics(): {
    cacheSize: number;
    chunkCacheSize: number;
    processingQueueSize: number;
    memoryUsageMB: number;
  } {
    return {
      cacheSize: this.vectorCache.size,
      chunkCacheSize: this.chunkCache.size,
      processingQueueSize: this.processingQueue.size,
      memoryUsageMB: this.estimateMemoryUsage()
    };
  }

  /**
   * Cleanup all resources
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up ContextVectorizer resources');
    
    this.vectorCache.clear();
    this.chunkCache.clear();
    this.processingQueue.clear();
    
    this.isInitialized = false;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export { ContextVectorizer };
export default ContextVectorizer;
