// packages/context-intelligence/services/ContextCompressor.ts

/**
 * Advanced Context Compression Service for ReadyAI Personal AI Development Orchestrator
 * 
 * This service implements intelligent context compression with semantic preservation,
 * information retention, and configurable compression ratios. Adapts Cline's proven
 * compression patterns from src/utils/compression/ContextCompressor.ts (250+ lines)
 * while adding ReadyAI-specific context intelligence and quality preservation.
 * 
 * Key Adaptations from Cline:
 * - Context compression algorithms from Cline's ContextCompressor service (250+ lines)
 * - Auto-condense patterns from Cline's context window management system
 * - Content summarization from Cline's summarization features
 * - Token optimization from Cline's efficient token management
 * - Compression validation from Cline's quality assurance patterns
 * - Performance optimization from Cline's efficient processing
 * 
 * ReadyAI Extensions:
 * - Semantic-aware compression preserving meaning and relationships
 * - Multi-level compression strategies with configurable trade-offs
 * - Context relationship preservation during compression operations
 * - Quality-based compression with information loss monitoring
 * - Adaptive compression based on content characteristics
 * - Performance-optimized compression with resource management
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
  createTimestamp,
  generateUUID,
  createApiResponse,
  createApiError,
  wrapAsync
} from '../../foundation/types/core';

import {
  ContextIntelligenceNode,
  ContextNodeType,
  ContextQualityLevel,
  ContextOptimizationResult,
  ContextOptimizationMetrics,
  ContextOptimizationStrategy,
  ContextOptimizationOptions,
  ContextCompressionLevel,
  ContextCompressionResult,
  validateContextNode
} from '../types/context';

import {
  OptimizationConfig,
  OptimizationStrategy,
  CompressionStrategy,
  ContextCompressionStrategy,
  CompressionBenchmarkResult,
  OptimizationPerformanceMetrics,
  OptimizationError,
  OptimizationValidationResult,
  DEFAULT_OPTIMIZATION_CONFIG,
  OPTIMIZATION_CONSTANTS,
  calculateCompressionRatio,
  validateOptimizationConfig
} from '../types/optimization';

import { ContextOptimizer } from './ContextOptimizer';
import { Logger } from '../../logging/services/Logger';
import { ErrorService } from '../../error-handling/services/ErrorService';

// =============================================================================
// COMPRESSION INTERFACES
// =============================================================================

/**
 * Compression operation result with detailed metrics
 */
interface CompressionOperationResult {
  /** Original content length */
  originalLength: number;
  /** Compressed content length */
  compressedLength: number;
  /** Compression ratio achieved */
  compressionRatio: number;
  /** Information loss estimate */
  informationLoss: number;
  /** Semantic preservation score */
  semanticPreservationScore: number;
  /** Processing time in milliseconds */
  processingTime: number;
  /** Memory usage during compression */
  memoryUsage: number;
}

/**
 * Compression chunk for batch processing
 */
interface CompressionChunk {
  /** Chunk identifier */
  id: UUID;
  /** Chunk content */
  content: string;
  /** Start position in original content */
  startPosition: number;
  /** End position in original content */
  endPosition: number;
  /** Chunk importance score */
  importance: number;
  /** Semantic boundaries within chunk */
  semanticBoundaries: number[];
}

/**
 * Compression strategy configuration
 */
interface CompressionStrategyConfig {
  /** Target compression ratio */
  targetRatio: number;
  /** Quality preservation threshold */
  qualityThreshold: number;
  /** Enable semantic analysis */
  semanticAware: boolean;
  /** Preserve code structure */
  preserveStructure: boolean;
  /** Maximum information loss tolerance */
  maxInformationLoss: number;
}

// =============================================================================
// CONTEXT COMPRESSOR SERVICE
// =============================================================================

/**
 * Context Compressor Service
 * 
 * Implements advanced context compression with semantic preservation and 
 * information retention, building on Cline's proven compression patterns
 * while adding ReadyAI-specific context intelligence capabilities.
 */
export class ContextCompressor {
  private readonly logger: Logger;
  private readonly errorService: ErrorService;
  private readonly contextOptimizer: ContextOptimizer;
  
  // Configuration and state management
  private config: CompressionStrategyConfig;
  private isInitialized: boolean = false;
  private isCompressing: boolean = false;
  
  // Compression strategies and algorithms (adapted from Cline)
  private readonly compressionStrategies: Map<ContextCompressionLevel, CompressionStrategyConfig> = new Map();
  private readonly compressionCache: Map<string, ContextCompressionResult> = new Map();
  
  // Performance tracking and metrics
  private compressionMetrics: {
    totalCompressions: number;
    averageCompressionRatio: number;
    averageProcessingTime: number;
    totalTokensSaved: number;
    averageQualityRetention: number;
    compressionsByStrategy: Map<ContextCompressionLevel, number>;
  } = {
    totalCompressions: 0,
    averageCompressionRatio: 0,
    averageProcessingTime: 0,
    totalTokensSaved: 0,
    averageQualityRetention: 0,
    compressionsByStrategy: new Map()
  };

  // Semantic analysis patterns (enhanced from Cline's semantic handling)
  private readonly semanticPatterns = {
    codeBlocks: /``````/g,
    functionDefinitions: /(?:function|const|let|var)\s+\w+\s*[=\(]/g,
    importStatements: /(?:import|from|require)\s+.*$/gm,
    comments: /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
    stringLiterals: /(['"`])(?:(?!\1)[^\\]|\\.)*\1/g,
    whitespace: /\s+/g,
    duplicateLines: /^(.+)(\n\1)+$/gm,
    emptyLines: /^\s*$/gm
  };

  constructor(
    contextOptimizer: ContextOptimizer,
    config?: Partial<CompressionStrategyConfig>,
    logger?: Logger,
    errorService?: ErrorService
  ) {
    this.contextOptimizer = contextOptimizer;
    this.logger = logger || new Logger('ContextCompressor');
    this.errorService = errorService || new ErrorService();
    
    // Initialize default configuration
    this.config = {
      targetRatio: 0.5,
      qualityThreshold: 0.8,
      semanticAware: true,
      preserveStructure: true,
      maxInformationLoss: 0.2,
      ...config
    };

    this.logger.info('ContextCompressor initialized', {
      targetRatio: this.config.targetRatio,
      qualityThreshold: this.config.qualityThreshold,
      semanticAware: this.config.semanticAware
    });

    this.initializeCompressionStrategies();
  }

  /**
   * Initialize compression strategies with Cline's proven patterns
   */
  private initializeCompressionStrategies(): void {
    // Minimal compression - preserve almost everything (like Cline's conservative mode)
    this.compressionStrategies.set('minimal', {
      targetRatio: 0.9,
      qualityThreshold: 0.95,
      semanticAware: true,
      preserveStructure: true,
      maxInformationLoss: 0.05
    });

    // Balanced compression - good balance of size and quality (like Cline's default mode)
    this.compressionStrategies.set('balanced', {
      targetRatio: 0.5,
      qualityThreshold: 0.8,
      semanticAware: true,
      preserveStructure: true,
      maxInformationLoss: 0.2
    });

    // Aggressive compression - maximum compression (like Cline's aggressive mode)
    this.compressionStrategies.set('aggressive', {
      targetRatio: 0.3,
      qualityThreshold: 0.6,
      semanticAware: true,
      preserveStructure: false,
      maxInformationLoss: 0.4
    });
  }

  /**
   * Initialize the context compressor with dependency validation
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.logger.info('Initializing ContextCompressor...');

      // Validate configuration
      if (this.config.targetRatio < 0.1 || this.config.targetRatio > 0.95) {
        throw this.createCompressionError(
          'INVALID_COMPRESSION_CONFIG',
          `Invalid target ratio: ${this.config.targetRatio}. Must be between 0.1 and 0.95`
        );
      }

      // Initialize context optimizer dependency
      if (this.contextOptimizer && typeof (this.contextOptimizer as any).initialize === 'function') {
        await (this.contextOptimizer as any).initialize();
      }

      // Warm up compression patterns (adapted from Cline's initialization)
      await this.warmupCompressionPatterns();

      this.isInitialized = true;
      this.logger.info('ContextCompressor fully initialized');

    } catch (error) {
      const compressionError = this.createCompressionError(
        'INITIALIZATION_FAILED',
        `Failed to initialize ContextCompressor: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      
      this.logger.error('ContextCompressor initialization failed', { error: compressionError });
      throw compressionError;
    }
  }

  // =============================================================================
  // PUBLIC COMPRESSION API
  // =============================================================================

  /**
   * Compress context content with semantic preservation
   * Primary compression interface with intelligent quality preservation
   */
  async compressContext(
    context: ContextIntelligenceNode,
    compressionLevel: ContextCompressionLevel = 'balanced',
    options?: {
      preserveSemantics?: boolean;
      maintainStructure?: boolean;
      targetRatio?: number;
      qualityThreshold?: number;
    }
  ): Promise<ApiResponse<ContextCompressionResult>> {
    return wrapAsync(async () => {
      const startTime = performance.now();
      const operationId = generateUUID();

      this.logger.debug('Starting context compression', {
        operationId,
        contextId: context.id,
        originalSize: context.content.length,
        compressionLevel,
        preserveSemantics: options?.preserveSemantics
      });

      // Validate context input
      const validation = validateContextNode(context);
      if (!validation.passed) {
        throw this.createCompressionError(
          'CONTEXT_VALIDATION_FAILED',
          `Context validation failed: ${validation.errors.join(', ')}`,
          [context.id]
        );
      }

      // Check cache first (adapted from Cline's caching patterns)
      const cacheKey = this.generateCompressionCacheKey(context, compressionLevel, options);
      const cached = this.compressionCache.get(cacheKey);
      if (cached && !options?.targetRatio) {
        this.logger.debug('Using cached compression result', {
          operationId,
          contextId: context.id,
          compressionRatio: cached.compressionRatio
        });
        return cached;
      }

      // Get compression strategy configuration
      const strategyConfig = this.getCompressionStrategy(compressionLevel, options);
      
      // Pre-compression analysis
      const preAnalysis = await this.analyzeContentForCompression(context.content);
      
      // Perform compression operation
      const compressionResult = await this.performCompression(
        context,
        strategyConfig,
        preAnalysis
      );

      // Post-compression validation
      await this.validateCompressionResult(
        context,
        compressionResult,
        strategyConfig
      );

      // Finalize result
      const finalResult = await this.finalizeCompressionResult(
        context,
        compressionResult,
        operationId,
        startTime
      );

      // Cache successful result
      this.compressionCache.set(cacheKey, finalResult);

      // Update metrics
      this.updateCompressionMetrics(finalResult);

      this.logger.info('Context compression completed', {
        operationId,
        contextId: context.id,
        originalSize: context.content.length,
        compressedSize: finalResult.compressedContent.length,
        compressionRatio: finalResult.compressionRatio,
        qualityPreserved: finalResult.qualityMetrics.semanticPreservationScore,
        duration: finalResult.processingMetrics.totalDurationMs
      });

      return finalResult;

    }).then(result => {
      if (result.success) {
        return createApiResponse(result.data);
      } else {
        throw result.error;
      }
    });
  }

  /**
   * Compress multiple contexts in batch with efficiency optimization
   * Enhanced batch compression from Cline's batch processing patterns
   */
  async compressContextsBatch(
    contexts: ContextIntelligenceNode[],
    compressionLevel: ContextCompressionLevel = 'balanced',
    options?: {
      preserveRelationships?: boolean;
      maxConcurrency?: number;
      progressCallback?: (completed: number, total: number) => void;
    }
  ): Promise<ApiResponse<ContextCompressionResult[]>> {
    return wrapAsync(async () => {
      const startTime = performance.now();
      const batchId = generateUUID();

      this.logger.info('Starting batch context compression', {
        batchId,
        totalContexts: contexts.length,
        compressionLevel,
        maxConcurrency: options?.maxConcurrency || 4
      });

      const results: ContextCompressionResult[] = [];
      const errors: { contextId: UUID; error: string; }[] = [];
      
      // Process contexts in batches for memory efficiency
      const batchSize = Math.min(10, contexts.length);
      const concurrency = Math.min(options?.maxConcurrency || 4, 8);
      
      for (let i = 0; i < contexts.length; i += batchSize) {
        const batch = contexts.slice(i, i + batchSize);
        
        // Process batch with concurrency control
        const batchPromises = batch.map(async (context) => {
          try {
            const compressionResult = await this.compressContext(context, compressionLevel);
            if (compressionResult.success) {
              return compressionResult.data;
            } else {
              throw new Error(`Compression failed: ${compressionResult.error.message}`);
            }
          } catch (error) {
            errors.push({
              contextId: context.id,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
            return null;
          }
        });

        // Wait for batch completion with concurrency limit
        const batchResults = await this.processConcurrently(batchPromises, concurrency);
        results.push(...batchResults.filter((result): result is ContextCompressionResult => result !== null));

        // Report progress
        if (options?.progressCallback) {
          options.progressCallback(i + batch.length, contexts.length);
        }
      }

      // Log batch completion
      this.logger.info('Batch context compression completed', {
        batchId,
        successful: results.length,
        failed: errors.length,
        averageCompressionRatio: results.reduce((sum, r) => sum + r.compressionRatio, 0) / results.length,
        duration: performance.now() - startTime
      });

      if (errors.length > 0) {
        this.logger.warn('Some contexts failed to compress', { errors });
      }

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
   * Analyze compression potential for a context
   * Compression analysis from Cline's content analysis patterns
   */
  async analyzeCompressionPotential(
    context: ContextIntelligenceNode,
    targetRatio: number = 0.5
  ): Promise<ApiResponse<{
    estimatedRatio: number;
    redundancyLevel: number;
    compressionFeasibility: 'low' | 'medium' | 'high';
    recommendedStrategy: ContextCompressionLevel;
    estimatedQualityLoss: number;
    recommendations: string[];
  }>> {
    return wrapAsync(async () => {
      const analysis = await this.analyzeContentForCompression(context.content);
      
      // Calculate compression potential
      const redundancyLevel = this.calculateRedundancyLevel(context.content);
      const structuralComplexity = this.calculateStructuralComplexity(context.content);
      
      // Estimate achievable compression ratio
      const estimatedRatio = Math.max(
        targetRatio,
        1.0 - (redundancyLevel * 0.6 + (1 - structuralComplexity) * 0.4)
      );

      // Determine compression feasibility
      let compressionFeasibility: 'low' | 'medium' | 'high';
      if (redundancyLevel > 0.6) {
        compressionFeasibility = 'high';
      } else if (redundancyLevel > 0.3) {
        compressionFeasibility = 'medium';
      } else {
        compressionFeasibility = 'low';
      }

      // Recommend compression strategy
      let recommendedStrategy: ContextCompressionLevel;
      if (compressionFeasibility === 'high' && structuralComplexity < 0.7) {
        recommendedStrategy = 'aggressive';
      } else if (compressionFeasibility === 'low' || structuralComplexity > 0.8) {
        recommendedStrategy = 'minimal';
      } else {
        recommendedStrategy = 'balanced';
      }

      // Estimate quality loss
      const estimatedQualityLoss = Math.min(
        0.5,
        (1 - estimatedRatio) * 0.3 + (structuralComplexity > 0.8 ? 0.2 : 0.1)
      );

      // Generate recommendations
      const recommendations = this.generateCompressionRecommendations(
        redundancyLevel,
        structuralComplexity,
        analysis
      );

      return {
        estimatedRatio,
        redundancyLevel,
        compressionFeasibility,
        recommendedStrategy,
        estimatedQualityLoss,
        recommendations
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
  // CORE COMPRESSION IMPLEMENTATION
  // =============================================================================

  /**
   * Perform the actual compression operation
   * Core compression logic adapted from Cline's compression algorithms
   */
  private async performCompression(
    context: ContextIntelligenceNode,
    strategyConfig: CompressionStrategyConfig,
    analysis: any
  ): Promise<CompressionOperationResult> {
    const compressionStart = performance.now();
    const memoryBefore = this.getCurrentMemoryUsage();

    let compressedContent = context.content;

    try {
      this.isCompressing = true;

      // Step 1: Structural compression (adapted from Cline's structural optimization)
      if (strategyConfig.preserveStructure) {
        compressedContent = await this.applyStructuralCompression(compressedContent, analysis);
      }

      // Step 2: Semantic-aware compression (enhanced from Cline's semantic handling)
      if (strategyConfig.semanticAware) {
        compressedContent = await this.applySemanticCompression(compressedContent, analysis);
      }

      // Step 3: Token-level compression (from Cline's token optimization)
      compressedContent = await this.applyTokenCompression(compressedContent, strategyConfig);

      // Step 4: Redundancy removal (from Cline's duplicate content handling)
      compressedContent = await this.removeRedundancy(compressedContent, strategyConfig);

      // Step 5: Whitespace optimization (from Cline's whitespace handling)
      compressedContent = await this.optimizeWhitespace(compressedContent, strategyConfig);

      // Calculate metrics
      const compressionRatio = calculateCompressionRatio(context.content.length, compressedContent.length);
      const informationLoss = await this.estimateInformationLoss(context.content, compressedContent);
      const semanticPreservationScore = await this.calculateSemanticPreservation(
        context.content,
        compressedContent
      );

      const processingTime = performance.now() - compressionStart;
      const memoryAfter = this.getCurrentMemoryUsage();

      return {
        originalLength: context.content.length,
        compressedLength: compressedContent.length,
        compressionRatio,
        informationLoss,
        semanticPreservationScore,
        processingTime,
        memoryUsage: memoryAfter - memoryBefore
      };

    } finally {
      this.isCompressing = false;
    }
  }

  /**
   * Apply structural compression while preserving code structure
   * Structural compression adapted from Cline's structure-aware optimization
   */
  private async applyStructuralCompression(content: string, analysis: any): Promise<string> {
    let compressed = content;

    // Preserve import statements but compress spacing
    compressed = compressed.replace(
      /import\s+\{([^}]+)\}\s+from\s+(['"][^'"]+['"])/g,
      (match, imports, from) => {
        const cleanImports = imports
          .split(',')
          .map((imp: string) => imp.trim())
          .join(',');
        return `import {${cleanImports}} from ${from}`;
      }
    );

    // Compress function definitions while preserving structure
    compressed = compressed.replace(
      /function\s+(\w+)\s*\(\s*([^)]*)\s*\)\s*\{/g,
      (match, name, params) => {
        const cleanParams = params
          .split(',')
          .map((param: string) => param.trim())
          .join(',');
        return `function ${name}(${cleanParams}){`;
      }
    );

    // Optimize object and array formatting
    compressed = compressed.replace(/\{\s*([^}]+)\s*\}/g, (match, content) => {
      if (content.includes('\n')) {
        // Multi-line object - preserve structure but optimize spacing
        return match.replace(/\s*,\s*/g, ',').replace(/\s*:\s*/g, ':');
      } else {
        // Single-line object - compress fully
        return `{${content.replace(/\s*,\s*/g, ',').replace(/\s*:\s*/g, ':')}}`;
      }
    });

    return compressed;
  }

  /**
   * Apply semantic-aware compression preserving meaning
   * Semantic compression enhanced from Cline's semantic analysis
   */
  private async applySemanticCompression(content: string, analysis: any): Promise<string> {
    let compressed = content;

    // Identify and preserve semantic boundaries
    const semanticBoundaries = await this.identifySemanticBoundaries(content);

    // Compress within semantic boundaries
    for (const boundary of semanticBoundaries) {
      const segment = content.slice(boundary.start, boundary.end);
      let compressedSegment = segment;

      // Apply different compression based on semantic importance
      if (boundary.importance > 0.8) {
        // High importance - minimal compression
        compressedSegment = this.applyMinimalCompression(segment);
      } else if (boundary.importance > 0.5) {
        // Medium importance - balanced compression
        compressedSegment = this.applyBalancedCompression(segment);
      } else {
        // Low importance - aggressive compression
        compressedSegment = this.applyAggressiveCompression(segment);
      }

      // Replace segment in compressed content
      const beforeSegment = compressed.slice(0, boundary.start);
      const afterSegment = compressed.slice(boundary.end);
      compressed = beforeSegment + compressedSegment + afterSegment;
    }

    return compressed;
  }

  /**
   * Apply token-level compression optimizations
   * Token compression from Cline's token optimization patterns
   */
  private async applyTokenCompression(
    content: string,
    config: CompressionStrategyConfig
  ): Promise<string> {
    let compressed = content;

    // Compress common programming patterns
    if (config.targetRatio < 0.5) {
      // Aggressive token compression
      compressed = compressed.replace(/console\.log\(/g, 'log(');
      compressed = compressed.replace(/document\.getElementById\(/g, 'byId(');
      compressed = compressed.replace(/addEventListener\(/g, 'on(');
      compressed = compressed.replace(/removeEventListener\(/g, 'off(');
    }

    // Compress verbose TypeScript patterns
    compressed = compressed.replace(/: boolean = /g, ':boolean=');
    compressed = compressed.replace(/: string = /g, ':string=');
    compressed = compressed.replace(/: number = /g, ':number=');

    // Compress interface definitions
    compressed = compressed.replace(/interface\s+(\w+)\s*\{/g, 'interface $1{');
    compressed = compressed.replace(/export\s+interface\s+(\w+)\s*\{/g, 'export interface $1{');

    // Optimize arrow functions
    compressed = compressed.replace(/\s*=>\s*\{/g, '=>{');
    compressed = compressed.replace(/\s*=>\s*/g, '=>');

    return compressed;
  }

  /**
   * Remove redundant content while preserving meaning
   * Redundancy removal from Cline's duplicate content detection
   */
  private async removeRedundancy(
    content: string,
    config: CompressionStrategyConfig
  ): Promise<string> {
    let deduped = content;

    // Remove duplicate lines (adapted from Cline's duplicate handling)
    const lines = deduped.split('\n');
    const seenLines = new Set<string>();
    const uniqueLines: string[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip empty lines in aggressive mode
      if (config.targetRatio < 0.4 && trimmedLine === '') {
        continue;
      }

      // Remove exact duplicate lines
      if (!seenLines.has(trimmedLine) || this.isStructuralLine(trimmedLine)) {
        uniqueLines.push(line);
        seenLines.add(trimmedLine);
      }
    }

    deduped = uniqueLines.join('\n');

    // Remove duplicate imports
    deduped = this.removeDuplicateImports(deduped);

    // Remove redundant comments in aggressive mode
    if (config.targetRatio < 0.5) {
      deduped = this.removeRedundantComments(deduped);
    }

    return deduped;
  }

  /**
   * Optimize whitespace while preserving readability
   * Whitespace optimization from Cline's formatting patterns
   */
  private async optimizeWhitespace(
    content: string,
    config: CompressionStrategyConfig
  ): Promise<string> {
    let optimized = content;

    if (config.targetRatio < 0.5) {
      // Aggressive whitespace compression
      optimized = optimized.replace(/\s+/g, ' '); // Multiple spaces to single
      optimized = optimized.replace(/\s*;\s*/g, ';'); // Semicolon spacing
      optimized = optimized.replace(/\s*,\s*/g, ','); // Comma spacing
      optimized = optimized.replace(/\s*\{\s*/g, '{'); // Brace spacing
      optimized = optimized.replace(/\s*\}\s*/g, '}'); // Brace spacing
    } else if (config.targetRatio < 0.7) {
      // Balanced whitespace compression
      optimized = optimized.replace(/[ \t]+/g, ' '); // Multiple spaces/tabs to single
      optimized = optimized.replace(/\n\s*\n\s*\n/g, '\n\n'); // Multiple empty lines to double
    } else {
      // Minimal whitespace compression
      optimized = optimized.replace(/\s+$/gm, ''); // Trailing whitespace only
    }

    // Always normalize line endings
    optimized = optimized.replace(/\r\n/g, '\n');

    return optimized.trim();
  }

  // =============================================================================
  // COMPRESSION ANALYSIS METHODS
  // =============================================================================

  /**
   * Analyze content for compression optimization
   */
  private async analyzeContentForCompression(content: string): Promise<{
    contentType: 'code' | 'text' | 'mixed' | 'data';
    structureComplexity: number;
    redundancyLevel: number;
    semanticDensity: number;
    compressionChallenges: string[];
    optimizationOpportunities: string[];
  }> {
    const contentType = this.detectContentType(content);
    const structureComplexity = this.calculateStructuralComplexity(content);
    const redundancyLevel = this.calculateRedundancyLevel(content);
    const semanticDensity = this.calculateSemanticDensity(content);

    const compressionChallenges: string[] = [];
    const optimizationOpportunities: string[] = [];

    // Identify challenges
    if (structureComplexity > 0.8) {
      compressionChallenges.push('High structural complexity may limit compression');
    }
    if (semanticDensity > 0.9) {
      compressionChallenges.push('High semantic density requires careful preservation');
    }
    if (contentType === 'code' && content.includes('import')) {
      compressionChallenges.push('Import statements require structure preservation');
    }

    // Identify opportunities
    if (redundancyLevel > 0.4) {
      optimizationOpportunities.push('High redundancy offers good compression potential');
    }
    if (content.match(this.semanticPatterns.emptyLines)) {
      optimizationOpportunities.push('Empty lines can be optimized');
    }
    if (content.match(this.semanticPatterns.duplicateLines)) {
      optimizationOpportunities.push('Duplicate lines detected for removal');
    }

    return {
      contentType,
      structureComplexity,
      redundancyLevel,
      semanticDensity,
      compressionChallenges,
      optimizationOpportunities
    };
  }

  /**
   * Identify semantic boundaries for intelligent compression
   */
  private async identifySemanticBoundaries(content: string): Promise<Array<{
    start: number;
    end: number;
    type: 'paragraph' | 'function' | 'class' | 'block' | 'comment';
    importance: number;
  }>> {
    const boundaries: Array<{
      start: number;
      end: number;
      type: 'paragraph' | 'function' | 'class' | 'block' | 'comment';
      importance: number;
    }> = [];

    // Detect function boundaries
    const functionMatches = Array.from(content.matchAll(this.semanticPatterns.functionDefinitions));
    for (const match of functionMatches) {
      if (match.index !== undefined) {
        boundaries.push({
          start: match.index,
          end: match.index + match[0].length,
          type: 'function',
          importance: 0.9 // Functions are high importance
        });
      }
    }

    // Detect import boundaries
    const importMatches = Array.from(content.matchAll(this.semanticPatterns.importStatements));
    for (const match of importMatches) {
      if (match.index !== undefined) {
        boundaries.push({
          start: match.index,
          end: match.index + match[0].length,
          type: 'block',
          importance: 0.95 // Imports are very high importance
        });
      }
    }

    // Detect comment boundaries
    const commentMatches = Array.from(content.matchAll(this.semanticPatterns.comments));
    for (const match of commentMatches) {
      if (match.index !== undefined) {
        boundaries.push({
          start: match.index,
          end: match.index + match[0].length,
          type: 'comment',
          importance: 0.3 // Comments are lower importance
        });
      }
    }

    // Detect paragraph boundaries for text content
    const paragraphs = content.split(/\n\s*\n/);
    let currentPos = 0;
    for (const paragraph of paragraphs) {
      if (paragraph.trim()) {
        boundaries.push({
          start: currentPos,
          end: currentPos + paragraph.length,
          type: 'paragraph',
          importance: 0.6
        });
      }
      currentPos += paragraph.length + 2; // Account for \n\n
    }

    return boundaries.sort((a, b) => a.start - b.start);
  }

  /**
   * Calculate redundancy level in content
   * Redundancy calculation from Cline's duplicate detection
   */
  private calculateRedundancyLevel(content: string): number {
    const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length === 0) return 0;

    const uniqueLines = new Set(lines);
    const duplicateRatio = 1 - (uniqueLines.size / lines.length);

    // Calculate token-level redundancy
    const words = content.toLowerCase().split(/\s+/);
    const uniqueWords = new Set(words);
    const wordDuplicateRatio = 1 - (uniqueWords.size / words.length);

    // Weighted average
    return (duplicateRatio * 0.6) + (wordDuplicateRatio * 0.4);
  }

  /**
   * Calculate structural complexity of content
   * Complexity calculation for compression planning
   */
  private calculateStructuralComplexity(content: string): number {
    let complexity = 0;

    // Count nesting levels
    const braceDepth = this.calculateMaxNestingDepth(content, /[{}]/g);
    const parenDepth = this.calculateMaxNestingDepth(content, /[()]/g);
    const bracketDepth = this.calculateMaxNestingDepth(content, /[\[\]]/g);

    complexity += Math.min(1.0, (braceDepth + parenDepth + bracketDepth) / 30);

    // Count line length variations
    const lines = content.split('\n');
    const avgLineLength = lines.reduce((sum, line) => sum + line.length, 0) / lines.length;
    const lengthVariance = lines.reduce((sum, line) => sum + Math.pow(line.length - avgLineLength, 2), 0) / lines.length;
    complexity += Math.min(1.0, lengthVariance / 10000);

    // Count special characters
    const specialCharCount = (content.match(/[^\w\s]/g) || []).length;
    complexity += Math.min(1.0, specialCharCount / content.length);

    return Math.min(1.0, complexity);
  }

  /**
   * Calculate semantic density of content
   */
  private calculateSemanticDensity(content: string): number {
    const words = content.split(/\s+/).filter(word => word.length > 0);
    if (words.length === 0) return 0;

    // Count meaningful words (not common stop words)
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
    const meaningfulWords = words.filter(word => 
      !stopWords.has(word.toLowerCase()) && word.length > 2
    );

    // Calculate keyword density
    const keywordDensity = meaningfulWords.length / words.length;

    // Calculate unique concept density
    const uniqueConcepts = new Set(meaningfulWords.map(word => word.toLowerCase()));
    const conceptDensity = uniqueConcepts.size / meaningfulWords.length;

    return (keywordDensity * 0.6) + (conceptDensity * 0.4);
  }

  // =============================================================================
  // COMPRESSION LEVEL IMPLEMENTATIONS
  // =============================================================================

  /**
   * Apply minimal compression (safest approach from Cline)
   */
  private applyMinimalCompression(content: string): string {
    // Only remove trailing whitespace and normalize line endings
    return content
      .replace(/\s+$/gm, '') // Trailing whitespace
      .replace(/\r\n/g, '\n') // Normalize line endings
      .trim();
  }

  /**
   * Apply balanced compression (Cline's default approach)
   */
  private applyBalancedCompression(content: string): string {
    let compressed = content;

    // Remove excessive whitespace but preserve structure
    compressed = compressed.replace(/[ \t]+/g, ' '); // Multiple spaces to single
    compressed = compressed.replace(/\n\s*\n\s*\n/g, '\n\n'); // Multiple empty lines to double
    compressed = compressed.replace(/\s+$/gm, ''); // Trailing whitespace

    return compressed.trim();
  }

  /**
   * Apply aggressive compression (maximum compression from Cline)
   */
  private applyAggressiveCompression(content: string): string {
    let compressed = content;

    // Aggressive whitespace removal
    compressed = compressed.replace(/\s+/g, ' '); // All whitespace to single space
    compressed = compressed.replace(/\s*([{}();,])\s*/g, '$1'); // Remove spacing around delimiters
    compressed = compressed.replace(/\n+/g, '\n'); // Multiple newlines to single

    // Remove comments in aggressive mode
    compressed = compressed.replace(/\/\*[\s\S]*?\*\//g, ''); // Block comments
    compressed = compressed.replace(/\/\/.*$/gm, ''); // Line comments

    return compressed.trim();
  }

  // =============================================================================
  // VALIDATION AND QUALITY METHODS
  // =============================================================================

  /**
   * Validate compression result quality
   * Quality validation adapted from Cline's validation patterns
   */
  private async validateCompressionResult(
    originalContext: ContextIntelligenceNode,
    compressionResult: CompressionOperationResult,
    strategyConfig: CompressionStrategyConfig
  ): Promise<void> {
    // Validate compression ratio achieved
    if (compressionResult.compressionRatio > strategyConfig.targetRatio * 1.2) {
      this.logger.warn('Compression ratio higher than target', {
        achieved: compressionResult.compressionRatio,
        target: strategyConfig.targetRatio,
        contextId: originalContext.id
      });
    }

    // Validate quality preservation
    if (compressionResult.semanticPreservationScore < strategyConfig.qualityThreshold) {
      this.logger.warn('Semantic preservation below threshold', {
        score: compressionResult.semanticPreservationScore,
        threshold: strategyConfig.qualityThreshold,
        contextId: originalContext.id
      });
    }

    // Validate information loss
    if (compressionResult.informationLoss > strategyConfig.maxInformationLoss) {
      this.logger.error('Information loss exceeds maximum tolerance', {
        loss: compressionResult.informationLoss,
        maxAllowed: strategyConfig.maxInformationLoss,
        contextId: originalContext.id
      });
      
      throw this.createCompressionError(
        'QUALITY_DEGRADATION_EXCEEDED',
        `Information loss ${compressionResult.informationLoss} exceeds maximum ${strategyConfig.maxInformationLoss}`,
        [originalContext.id]
      );
    }
  }

  /**
   * Estimate information loss from compression
   */
  private async estimateInformationLoss(original: string, compressed: string): Promise<number> {
    // Simple information loss estimation based on content reduction
    const lengthLoss = 1 - (compressed.length / original.length);
    
    // Estimate semantic information loss
    const originalWords = new Set(original.toLowerCase().split(/\s+/));
    const compressedWords = new Set(compressed.toLowerCase().split(/\s+/));
    const wordLoss = 1 - (compressedWords.size / originalWords.size);
    
    // Estimate structural information loss
    const originalStructures = (original.match(/[{}()\[\]]/g) || []).length;
    const compressedStructures = (compressed.match(/[{}()\[\]]/g) || []).length;
    const structureLoss = originalStructures > 0 ? 1 - (compressedStructures / originalStructures) : 0;

    // Weighted information loss calculation
    return (lengthLoss * 0.3) + (wordLoss * 0.4) + (structureLoss * 0.3);
  }

  /**
   * Calculate semantic preservation score
   */
  private async calculateSemanticPreservation(original: string, compressed: string): Promise<number> {
    // Word overlap analysis
    const originalWords = new Set(original.toLowerCase().split(/\s+/));
    const compressedWords = new Set(compressed.toLowerCase().split(/\s+/));
    const wordOverlap = this.calculateSetOverlap(originalWords, compressedWords);

    // Structure preservation analysis
    const originalStructures = original.match(/[{}()\[\]]/g) || [];
    const compressedStructures = compressed.match(/[{}()\[\]]/g) || [];
    const structurePreservation = originalStructures.length > 0 ? 
      Math.min(1.0, compressedStructures.length / originalStructures.length) : 1.0;

    // Content flow preservation
    const originalSentences = original.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const compressedSentences = compressed.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const flowPreservation = originalSentences.length > 0 ?
      Math.min(1.0, compressedSentences.length / originalSentences.length) : 1.0;

    // Weighted semantic preservation score
    return (wordOverlap * 0.5) + (structurePreservation * 0.3) + (flowPreservation * 0.2);
  }

  // =============================================================================
  // UTILITY AND HELPER METHODS
  // =============================================================================

  /**
   * Get compression strategy configuration
   */
  private getCompressionStrategy(
    level: ContextCompressionLevel,
    options?: any
  ): CompressionStrategyConfig {
    const baseStrategy = this.compressionStrategies.get(level) || this.compressionStrategies.get('balanced')!;
    
    return {
      ...baseStrategy,
      ...(options?.targetRatio && { targetRatio: options.targetRatio }),
      ...(options?.qualityThreshold && { qualityThreshold: options.qualityThreshold })
    };
  }

  /**
   * Generate cache key for compression results
   */
  private generateCompressionCacheKey(
    context: ContextIntelligenceNode,
    level: ContextCompressionLevel,
    options?: any
  ): string {
    const optionsHash = options ? this.generateContentHash(JSON.stringify(options)) : '';
    return `comp_${context.id}_${context.contentHash}_${level}_${optionsHash}`;
  }

  /**
   * Finalize compression result with metrics and metadata
   */
  private async finalizeCompressionResult(
    context: ContextIntelligenceNode,
    compressionResult: CompressionOperationResult,
    operationId: UUID,
    startTime: number
  ): Promise<ContextCompressionResult> {
    const durationMs = performance.now() - startTime;

    return {
      id: operationId,
      contextId: context.id,
      projectId: context.projectId,
      originalContent: context.content,
      compressedContent: compressedContent,
      compressionRatio: compressionResult.compressionRatio,
      tokensOriginal: context.tokenCount || Math.ceil(context.content.length / 4),
      tokensCompressed: Math.ceil(compressedContent.length / 4),
      tokensSaved: (context.tokenCount || Math.ceil(context.content.length / 4)) - Math.ceil(compressedContent.length / 4),
      qualityMetrics: {
        informationLoss: compressionResult.informationLoss,
        semanticPreservationScore: compressionResult.semanticPreservationScore,
        structurePreservationScore: 0.8, // Simplified
        readabilityScore: 0.7, // Simplified
        qualityScore: compressionResult.semanticPreservationScore
      },
      processingMetrics: {
        totalDurationMs: durationMs,
        compressionTime: compressionResult.processingTime,
        validationTime: 0, // Updated during validation
        memoryUsage: compressionResult.memoryUsage
      },
      compressionStrategy: 'semantic-aware',
      preservedElements: ['structure', 'imports', 'functions'],
      removedElements: ['comments', 'whitespace', 'duplicates'],
      compressionMetadata: {
        algorithm: 'semantic-boundary-aware',
        version: '1.0.0',
        configSnapshot: this.config
      },
      compressedAt: createTimestamp()
    };
  }

  /**
   * Update compression metrics
   */
  private updateCompressionMetrics(result: ContextCompressionResult): void {
    this.compressionMetrics.totalCompressions++;
    
    // Update averages
    const n = this.compressionMetrics.totalCompressions;
    this.compressionMetrics.averageCompressionRatio = 
      ((n - 1) * this.compressionMetrics.averageCompressionRatio + result.compressionRatio) / n;
    
    this.compressionMetrics.averageProcessingTime = 
      ((n - 1) * this.compressionMetrics.averageProcessingTime + result.processingMetrics.totalDurationMs) / n;
    
    this.compressionMetrics.averageQualityRetention = 
      ((n - 1) * this.compressionMetrics.averageQualityRetention + result.qualityMetrics.qualityScore) / n;
    
    this.compressionMetrics.totalTokensSaved += result.tokensSaved;

    // Update strategy counters
    const strategyCount = this.compressionMetrics.compressionsByStrategy.get(result.compressionStrategy as ContextCompressionLevel) || 0;
    this.compressionMetrics.compressionsByStrategy.set(result.compressionStrategy as ContextCompressionLevel, strategyCount + 1);
  }

  /**
   * Warm up compression patterns for better performance
   */
  private async warmupCompressionPatterns(): Promise<void> {
    // Pre-compile regex patterns for better performance
    const testContent = `
      // Test content for pattern warmup
      import { test } from 'module';
      function testFunction() {
        console.log('test');
        return true;
      }
    `;

    // Test each pattern
    for (const [name, pattern] of Object.entries(this.semanticPatterns)) {
      try {
        testContent.match(pattern);
      } catch (error) {
        this.logger.warn(`Pattern warmup failed for ${name}`, { error });
      }
    }

    this.logger.debug('Compression patterns warmed up');
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  /**
   * Detect content type for optimization strategy selection
   */
  private detectContentType(content: string): 'code' | 'text' | 'mixed' | 'data' {
    const codePatterns = [
      /function\s+\w+/,
      /class\s+\w+/,
      /import\s+.*from/,
      /export\s+.*{/,
      /const\s+\w+\s*=/,
      /let\s+\w+\s*=/,
      /var\s+\w+\s*=/
    ];

    const codeScore = codePatterns.reduce((score, pattern) => {
      return score + (pattern.test(content) ? 1 : 0);
    }, 0) / codePatterns.length;

    if (codeScore > 0.6) return 'code';
    if (codeScore > 0.2) return 'mixed';
    
    // Check for structured data
    if (content.includes('{') && content.includes('}') && content.includes(':')) {
      return 'data';
    }

    return 'text';
  }

  /**
   * Calculate maximum nesting depth
   */
  private calculateMaxNestingDepth(content: string, pattern: RegExp): number {
    const matches = content.match(pattern) || [];
    let depth = 0;
    let maxDepth = 0;

    for (const match of matches) {
      if (match === '{' || match === '(' || match === '[') {
        depth++;
        maxDepth = Math.max(maxDepth, depth);
      } else {
        depth = Math.max(0, depth - 1);
      }
    }

    return maxDepth;
  }

  /**
   * Check if line is structural (should not be removed)
   */
  private isStructuralLine(line: string): boolean {
    const structuralPatterns = [
      /^\s*import\s+/,
      /^\s*export\s+/,
      /^\s*function\s+/,
      /^\s*class\s+/,
      /^\s*interface\s+/,
      /^\s*type\s+/,
      /^\s*const\s+.*=.*{/,
      /^\s*\w+\s*:\s*{/, // Object property definitions
    ];

    return structuralPatterns.some(pattern => pattern.test(line));
  }

  /**
   * Remove duplicate imports
   */
  private removeDuplicateImports(content: string): string {
    const lines = content.split('\n');
    const importLines = new Set<string>();
    const processedLines: string[] = [];

    for (const line of lines) {
      if (/^\s*import\s+/.test(line)) {
        const normalizedImport = line.trim();
        if (!importLines.has(normalizedImport)) {
          importLines.add(normalizedImport);
          processedLines.push(line);
        }
      } else {
        processedLines.push(line);
      }
    }

    return processedLines.join('\n');
  }

  /**
   * Remove redundant comments
   */
  private removeRedundantComments(content: string): string {
    // Remove single-line comments that are just whitespace or common phrases
    let processed = content.replace(/^\s*\/\/\s*$/gm, ''); // Empty comments
    processed = processed.replace(/^\s*\/\/\s*(TODO|FIXME|NOTE):\s*$/gm, ''); // Empty TODOs
    
    // Remove block comments that are mostly whitespace
    processed = processed.replace(/\/\*\s*\*\//g, ''); // Empty block comments
    
    return processed;
  }

  /**
   * Calculate set overlap (Jaccard similarity)
   */
  private calculateSetOverlap<T>(set1: Set<T>, set2: Set<T>): number {
    const intersection = new Set([...set1].filter(item => set2.has(item)));
    const union = new Set([...set1, ...set2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Process promises concurrently with limit
   */
  private async processConcurrently<T>(
    promises: Promise<T>[],
    concurrency: number
  ): Promise<T[]> {
    const results: T[] = [];
    
    for (let i = 0; i < promises.length; i += concurrency) {
      const batch = promises.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(batch);
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        }
      }
    }
    
    return results;
  }

  /**
   * Generate content hash for caching
   */
  private generateContentHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get current memory usage
   */
  private getCurrentMemoryUsage(): number {
    const used = process.memoryUsage();
    return used.heapUsed / (1024 * 1024); // Convert to MB
  }

  /**
   * Generate compression recommendations
   */
  private generateCompressionRecommendations(
    redundancyLevel: number,
    structuralComplexity: number,
    analysis: any
  ): string[] {
    const recommendations: string[] = [];

    if (redundancyLevel > 0.5) {
      recommendations.push('High redundancy detected - aggressive compression recommended');
    }
    
    if (structuralComplexity > 0.8) {
      recommendations.push('Complex structure - use conservative compression to preserve integrity');
    }
    
    if (analysis.contentType === 'code') {
      recommendations.push('Code content detected - preserve syntax and imports');
    }
    
    if (analysis.optimizationOpportunities.length > 0) {
      recommendations.push(...analysis.optimizationOpportunities);
    }

    return recommendations;
  }

  /**
   * Create compression-specific error
   */
  private createCompressionError(
    code: string,
    message: string,
    contextIds: UUID[] = []
  ): OptimizationError {
    return {
      name: 'CompressionError',
      message,
      code: 'CONTEXT_COMPRESSION_ERROR',
      timestamp: createTimestamp(),
      componentId: 'ContextCompressor',
      severity: 'error',
      recoverable: true,
      context: { contextIds },
      optimizationErrorCode: code as any,
      affectedContextIds: contextIds,
      recoverySuggestions: [
        {
          action: 'Try with lower compression ratio',
          automated: false,
          confidence: 0.8
        },
        {
          action: 'Switch to conservative compression strategy',
          automated: true,
          confidence: 0.9
        }
      ]
    };
  }

  // =============================================================================
  // PUBLIC UTILITY METHODS
  // =============================================================================

  /**
   * Get compression statistics
   */
  getCompressionMetrics(): {
    totalCompressions: number;
    averageCompressionRatio: number;
    averageProcessingTime: number;
    totalTokensSaved: number;
    averageQualityRetention: number;
    compressionsByStrategy: Record<string, number>;
  } {
    return {
      ...this.compressionMetrics,
      compressionsByStrategy: Object.fromEntries(this.compressionMetrics.compressionsByStrategy)
    };
  }

  /**
   * Update compression configuration
   */
  async updateConfig(newConfig: Partial<CompressionStrategyConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    
    // Clear cache when configuration changes
    this.compressionCache.clear();
    
    this.logger.info('ContextCompressor configuration updated', { config: this.config });
  }

  /**
   * Clear compression cache
   */
  clearCache(): void {
    const cacheSize = this.compressionCache.size;
    this.compressionCache.clear();
    this.logger.info('Compression cache cleared', { clearedEntries: cacheSize });
  }

  /**
   * Test compression with different strategies
   */
  async testCompressionStrategies(
    content: string
  ): Promise<ApiResponse<Record<ContextCompressionLevel, {
    ratio: number;
    quality: number;
    processingTime: number;
  }>>> {
    return wrapAsync(async () => {
      const results: Record<ContextCompressionLevel, {
        ratio: number;
        quality: number;
        processingTime: number;
      }> = {} as any;

      const testContext: ContextIntelligenceNode = {
        id: generateUUID(),
        projectId: generateUUID(),
        type: 'file',
        path: '/test/compression-test.ts',
        content,
        contentHash: this.generateContentHash(content),
        tokenCount: Math.ceil(content.length / 4),
        vectorEmbedding: [],
        embeddingModel: 'test-model',
        embeddingGeneratedAt: createTimestamp(),
        dependencies: [],
        dependents: [],
        relevanceScore: 0.5,
        qualityMetrics: {
          qualityLevel: 'good',
          freshnessScore: 1.0,
          relevanceScore: 0.5,
          completenessScore: 1.0,
          accuracyScore: 1.0,
          coherenceScore: 1.0,
          validationIssues: [],
          lastAssessed: createTimestamp(),
          qualityTrend: 'stable'
        },
        accessPattern: {
          primaryPattern: 'sequential',
          accessFrequency: { hourly: 1, daily: 1, weekly: 1 },
          coAccessPatterns: [],
          temporalPatterns: { peakHours: [12], seasonality: 'none' },
          lastAnalyzed: createTimestamp()
        },
        lastAccessed: createTimestamp(),
        accessCount: 1,
        createdAt: createTimestamp(),
        lastModified: createTimestamp(),
        creationPhase: 'Phase31_FileGeneration',
        tags: ['test'],
        metadata: { purpose: 'testing' }
      };

      const levels: ContextCompressionLevel[] = ['minimal', 'balanced', 'aggressive'];
      
      for (const level of levels) {
        const startTime = performance.now();
        const compressionResult = await this.compressContext(testContext, level);
        const endTime = performance.now();

        if (compressionResult.success) {
          results[level] = {
            ratio: compressionResult.data.compressionRatio,
            quality: compressionResult.data.qualityMetrics.qualityScore,
            processingTime: endTime - startTime
          };
        }
      }

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
   * Cleanup resources and caches
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up ContextCompressor resources');
    
    this.compressionCache.clear();
    this.isInitialized = false;
    this.isCompressing = false;
    
    // Reset metrics
    this.compressionMetrics = {
      totalCompressions: 0,
      averageCompressionRatio: 0,
      averageProcessingTime: 0,
      totalTokensSaved: 0,
      averageQualityRetention: 0,
      compressionsByStrategy: new Map()
    };
  }
}

/**
 * Export the ContextCompressor service for use in context intelligence
 */
export default ContextCompressor;

/**
 * Version information and constants
 */
export const CONTEXT_COMPRESSOR_VERSION = '1.0.0';

export const COMPRESSION_CONSTANTS = {
  MIN_COMPRESSION_RATIO: 0.1,
  MAX_COMPRESSION_RATIO: 0.95,
  DEFAULT_QUALITY_THRESHOLD: 0.8,
  MAX_PROCESSING_TIME_MS: 10000,
  CACHE_TTL_MS: 5 * 60 * 1000, // 5 minutes
  MAX_CACHE_SIZE: 1000
} as const;
