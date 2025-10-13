// packages/context-intelligence/services/ContentAnalyzer.ts

/**
 * Advanced Content Analysis Service for ReadyAI Personal AI Development Orchestrator
 * 
 * Comprehensive content analysis engine adapted from Cline's content processing patterns
 * (from src/core/analysis/ContentAnalyzer.ts and related analysis services - 400+ lines)
 * for ReadyAI's context intelligence architecture. Provides multi-dimensional content
 * analysis including readability scoring, information density calculation, structural
 * analysis, and quality assessment to optimize AI-powered development workflows.
 * 
 * Key Adaptations from Cline:
 * - Content parsing algorithms from Cline's message content processing
 * - Quality assessment patterns from Cline's validation framework
 * - Readability analysis from Cline's text evaluation system
 * - Information density calculation from Cline's content optimization
 * - Structural analysis from Cline's code parsing capabilities
 * - Performance monitoring from Cline's telemetry system
 * 
 * ReadyAI Enhancements:
 * - ReadyAI-specific content dimensions (code quality, technical depth, etc.)
 * - Multi-format content analysis with specialized parsers
 * - Development lifecycle-aware analysis strategies
 * - Batch content processing with performance optimization
 * - Context relationship analysis for improved understanding
 * - Adaptive analysis strategies based on content characteristics
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
  ContextContentType,
  ContextQualityLevel,
  ContextAnalysisResult,
  ContextAnalysisMetrics,
  ContentAnalysisOptions,
  ContentAnalysisStrategy,
  ContentStructure,
  ContentComplexity,
  InformationDensity,
  ReadabilityMetrics,
  TechnicalDepthAnalysis,
  DEFAULT_ANALYSIS_CONFIG,
  ANALYSIS_CONSTANTS,
  validateContextNode,
  calculateBasicAnalysis
} from '../types/context';

import {
  ContentAnalysisConfig,
  ContentAnalysisDimensions,
  ContentAnalysisPerformanceMetrics,
  BatchAnalysisRequest,
  BatchAnalysisResult,
  ContentQualityAssessment,
  ContentReadabilityScore,
  ContentInformationDensity,
  ContentStructuralAnalysis,
  ContentTechnicalAnalysis,
  AnalysisValidationResult,
  AnalysisError,
  createContentAnalysisResult,
  validateAnalysisConfig,
  calculateOverallAnalysisScore,
  aggregateAnalysisConfidence,
  createAnalysisMetrics,
  isValidAnalysisScore,
  normalizeAnalysisScore
} from '../types/scoring';

import { QualityScorer } from './QualityScorer';
import { RelevanceCalculator } from './RelevanceCalculator';
import { Logger } from '../../logging/services/Logger';
import { ErrorService } from '../../error-handling/services/ErrorService';

// =============================================================================
// CONTENT ANALYZER SERVICE
// =============================================================================

/**
 * Advanced Content Analysis Service
 * 
 * Implements comprehensive content analysis for context intelligence nodes,
 * providing multi-dimensional assessment, batch processing, and quality
 * improvement recommendations based on Cline's proven analysis patterns.
 */
export class ContentAnalyzer {
  private readonly logger: Logger;
  private readonly errorService: ErrorService;
  private readonly qualityScorer: QualityScorer;
  private readonly relevanceCalculator: RelevanceCalculator;
  
  // Configuration and state
  private config: ContentAnalysisConfig;
  private isInitialized: boolean = false;
  
  // Caching and performance optimization (adapted from Cline patterns)
  private readonly analysisCache: Map<string, ContextAnalysisResult> = new Map();
  private readonly structureCache: Map<string, ContentStructure> = new Map();
  private readonly batchProcessingQueue: Map<UUID, Promise<any>> = new Map();
  
  // Performance tracking
  private performanceMetrics: ContentAnalysisPerformanceMetrics = {
    totalAnalyses: 0,
    averageAnalysisTime: 0,
    cacheHitRate: 0,
    batchProcessingTime: 0,
    structuralAnalysisTime: 0,
    readabilityAnalysisTime: 0,
    informationDensityTime: 0,
    qualityAssessmentTime: 0
  };

  // Content parsers and analyzers
  private readonly textAnalyzer: TextContentAnalyzer;
  private readonly codeAnalyzer: CodeContentAnalyzer;
  private readonly markdownAnalyzer: MarkdownContentAnalyzer;
  private readonly jsonAnalyzer: JsonContentAnalyzer;

  constructor(
    qualityScorer: QualityScorer,
    relevanceCalculator: RelevanceCalculator,
    config: ContentAnalysisConfig = DEFAULT_ANALYSIS_CONFIG,
    logger?: Logger,
    errorService?: ErrorService
  ) {
    this.qualityScorer = qualityScorer;
    this.relevanceCalculator = relevanceCalculator;
    this.config = { ...config };
    this.logger = logger || new Logger('ContentAnalyzer');
    this.errorService = errorService || new ErrorService();

    // Initialize content analyzers
    this.textAnalyzer = new TextContentAnalyzer(this.logger);
    this.codeAnalyzer = new CodeContentAnalyzer(this.logger);
    this.markdownAnalyzer = new MarkdownContentAnalyzer(this.logger);
    this.jsonAnalyzer = new JsonContentAnalyzer(this.logger);

    this.logger.info('ContentAnalyzer initialized with configuration', {
      analysisStrategy: config.analysisStrategy,
      enableCache: config.performance.enableCache,
      maxCacheSize: config.performance.maxCacheSize,
      enableBatchProcessing: config.performance.enableBatchProcessing
    });
  }

  /**
   * Initialize the content analyzer with health checks
   * Adapted from Cline's initialization patterns
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize dependencies
      if (this.qualityScorer && typeof this.qualityScorer.initialize === 'function') {
        await this.qualityScorer.initialize();
      }
      
      if (this.relevanceCalculator && typeof this.relevanceCalculator.initialize === 'function') {
        await this.relevanceCalculator.initialize();
      }

      // Validate configuration
      const configValidation = validateAnalysisConfig(this.config);
      if (!configValidation.passed) {
        throw this.createAnalysisError(
          'INVALID_ANALYSIS_CONFIG',
          `Configuration validation failed: ${configValidation.errors.join(', ')}`,
          [],
          { errors: configValidation.errors }
        );
      }

      // Start background cleanup if enabled
      if (this.config.performance.enableCache) {
        this.startBackgroundCleanup();
      }

      this.isInitialized = true;
      this.logger.info('ContentAnalyzer fully initialized');

    } catch (error) {
      const analyzerError = this.createAnalysisError(
        'INITIALIZATION_FAILED',
        `Failed to initialize ContentAnalyzer: ${error instanceof Error ? error.message : 'Unknown error'}`,
        [],
        { originalError: error }
      );
      
      this.logger.error('ContentAnalyzer initialization failed', { error: analyzerError });
      throw analyzerError;
    }
  }

  /**
   * Analyze content of a context intelligence node
   * Primary interface for content analysis with comprehensive assessment
   */
  async analyzeContent(
    context: ContextIntelligenceNode,
    options?: ContentAnalysisOptions
  ): Promise<ApiResponse<ContextAnalysisResult>> {
    return wrapAsync(async () => {
      const startTime = performance.now();
      const operationId = generateUUID();

      this.logger.debug('Starting content analysis', {
        operationId,
        contextId: context.id,
        contextType: context.type,
        contentLength: context.content.length,
        analysisStrategy: options?.analysisStrategy || this.config.analysisStrategy
      });

      // Check cache first if enabled
      if (this.config.performance.enableCache && !options?.forceReanalysis) {
        const cached = this.getCachedAnalysis(context, options);
        if (cached) {
          this.logger.debug('Using cached analysis', {
            operationId,
            contextId: context.id
          });
          return cached;
        }
      }

      // Validate context node
      const validation = validateContextNode(context);
      if (!validation.passed) {
        throw this.createAnalysisError(
          'CONTEXT_VALIDATION_FAILED',
          `Context validation failed: ${validation.errors.join(', ')}`,
          [context.id],
          { validation }
        );
      }

      // Determine analysis strategy
      const analysisStrategy = options?.analysisStrategy || this.config.analysisStrategy;

      // Perform content analysis using specified strategy
      let analysisResult: ContextAnalysisResult;
      
      switch (analysisStrategy) {
        case 'comprehensive':
          analysisResult = await this.performComprehensiveAnalysis(context, options);
          break;
        
        case 'focused':
          analysisResult = await this.performFocusedAnalysis(context, options);
          break;
        
        case 'fast':
          analysisResult = await this.performFastAnalysis(context, options);
          break;
        
        case 'adaptive':
          analysisResult = await this.performAdaptiveAnalysis(context, options);
          break;
        
        default:
          analysisResult = await this.performComprehensiveAnalysis(context, options);
      }

      const durationMs = performance.now() - startTime;

      // Update operation metadata
      analysisResult.operationId = operationId;
      analysisResult.analysisStrategy = analysisStrategy;
      analysisResult.analyzedAt = createTimestamp();
      analysisResult.durationMs = durationMs;

      // Cache result if enabled
      if (this.config.performance.enableCache) {
        this.cacheAnalysis(context, analysisResult, options);
      }

      // Update performance metrics
      this.updatePerformanceMetrics(durationMs);

      this.logger.info('Content analysis completed', {
        operationId,
        contextId: context.id,
        overallScore: analysisResult.overallScore,
        qualityLevel: analysisResult.qualityAssessment.level,
        duration: durationMs
      });

      return analysisResult;

    }).then(result => {
      if (result.success) {
        return createApiResponse(result.data);
      } else {
        throw result.error;
      }
    });
  }

  /**
   * Analyze multiple contexts in batch
   * Optimized batch processing from Cline's batch patterns
   */
  async analyzeBatch(
    request: BatchAnalysisRequest
  ): Promise<ApiResponse<BatchAnalysisResult>> {
    return wrapAsync(async () => {
      const startTime = performance.now();
      const operationId = generateUUID();
      
      const batchSize = request.batchSize || this.config.performance.batchSize;
      const concurrency = request.concurrency || this.config.performance.concurrency;

      this.logger.info('Starting batch content analysis', {
        operationId,
        totalContexts: request.contextIds.length,
        batchSize,
        concurrency
      });

      if (!this.config.performance.enableBatchProcessing) {
        throw this.createAnalysisError(
          'BATCH_PROCESSING_DISABLED',
          'Batch processing is disabled in configuration',
          request.contextIds
        );
      }

      const results: Map<UUID, ContextAnalysisResult> = new Map();
      const failures: Array<{ contextId: UUID; error: string; recoverable: boolean }> = [];
      
      const batches = this.createBatches(request.contextIds, batchSize);
      
      let completed = 0;

      // Process batches with concurrency control
      for (const batch of batches) {
        const batchPromises = batch.map(async (contextId, index) => {
          try {
            // Note: In real implementation, you would fetch the context from repository
            const context = await this.mockGetContext(contextId, request.projectId);
            const result = await this.analyzeContent(context, request.options);
            
            if (result.success) {
              results.set(contextId, result.data);
              completed++;
              request.progressCallback?.(completed, request.contextIds.length);
              return result.data;
            } else {
              this.logger.warn('Context analysis failed in batch', {
                contextId,
                error: result.error
              });
              failures.push({
                contextId,
                error: result.error?.message || 'Analysis failed',
                recoverable: true
              });
              return null;
            }
          } catch (error) {
            this.logger.error('Batch analysis error', {
              contextId,
              error
            });
            failures.push({
              contextId,
              error: error instanceof Error ? error.message : 'Unknown error',
              recoverable: false
            });
            return null;
          }
        });

        // Wait for batch completion with concurrency limit
        const batchResults = await this.processConcurrently(batchPromises, concurrency);
      }

      const durationMs = performance.now() - startTime;

      // Create batch result
      const batchResult: BatchAnalysisResult = {
        requestId: request.id,
        results,
        failures,
        batchMetrics: {
          totalBatchDurationMs: durationMs,
          contextProcessingTimes: {},
          successful: results.size,
          failed: failures.length,
          averageProcessingTime: durationMs / request.contextIds.length,
          throughputPerSecond: request.contextIds.length / (durationMs / 1000)
        },
        qualityDistribution: this.calculateQualityDistribution(results),
        summaryStatistics: this.calculateSummaryStatistics(results),
        recommendations: await this.generateBatchRecommendations(results, failures),
        completedAt: createTimestamp()
      };

      // Update batch processing metrics
      this.performanceMetrics.batchProcessingTime = 
        (this.performanceMetrics.batchProcessingTime + durationMs) / 2;

      this.logger.info('Batch content analysis completed', {
        operationId,
        totalContexts: request.contextIds.length,
        successfulAnalyses: results.size,
        failures: failures.length,
        duration: durationMs,
        averageDuration: durationMs / request.contextIds.length
      });

      return batchResult;

    }).then(result => {
      if (result.success) {
        return createApiResponse(result.data);
      } else {
        throw result.error;
      }
    });
  }

  /**
   * Calculate readability score for content
   * Enhanced readability analysis from Cline's text evaluation patterns
   */
  async calculateReadability(
    content: string,
    options?: {
      contentType?: ContextContentType;
      includeMetrics?: boolean;
    }
  ): Promise<ApiResponse<ContentReadabilityScore>> {
    return wrapAsync(async () => {
      const startTime = performance.now();
      const contentType = options?.contentType || this.inferContentType(content);

      this.logger.debug('Calculating readability', {
        contentLength: content.length,
        contentType
      });

      // Select appropriate analyzer based on content type
      let analyzer: ContentAnalyzerInterface;
      switch (contentType) {
        case 'code':
          analyzer = this.codeAnalyzer;
          break;
        case 'markdown':
          analyzer = this.markdownAnalyzer;
          break;
        case 'json':
          analyzer = this.jsonAnalyzer;
          break;
        default:
          analyzer = this.textAnalyzer;
      }

      const readabilityScore = await analyzer.calculateReadability(content);
      
      if (options?.includeMetrics) {
        readabilityScore.metrics = await analyzer.getReadabilityMetrics(content);
      }

      const durationMs = performance.now() - startTime;
      this.performanceMetrics.readabilityAnalysisTime = 
        (this.performanceMetrics.readabilityAnalysisTime + durationMs) / 2;

      return readabilityScore;

    }).then(result => {
      if (result.success) {
        return createApiResponse(result.data);
      } else {
        throw result.error;
      }
    });
  }

  /**
   * Calculate information density of content
   * Enhanced density analysis from Cline's content optimization patterns
   */
  async calculateInformationDensity(
    content: string,
    options?: {
      contentType?: ContextContentType;
      includeBreakdown?: boolean;
    }
  ): Promise<ApiResponse<ContentInformationDensity>> {
    return wrapAsync(async () => {
      const startTime = performance.now();
      const contentType = options?.contentType || this.inferContentType(content);

      this.logger.debug('Calculating information density', {
        contentLength: content.length,
        contentType
      });

      const density = await this.calculateContentDensity(content, contentType);
      
      if (options?.includeBreakdown) {
        density.breakdown = await this.calculateDensityBreakdown(content, contentType);
      }

      const durationMs = performance.now() - startTime;
      this.performanceMetrics.informationDensityTime = 
        (this.performanceMetrics.informationDensityTime + durationMs) / 2;

      return density;

    }).then(result => {
      if (result.success) {
        return createApiResponse(result.data);
      } else {
        throw result.error;
      }
    });
  }

  // =============================================================================
  // PRIVATE METHODS - ANALYSIS STRATEGIES
  // =============================================================================

  /**
   * Perform comprehensive analysis using all available dimensions
   * Most thorough analysis strategy from Cline's comprehensive assessment
   */
  private async performComprehensiveAnalysis(
    context: ContextIntelligenceNode,
    options?: ContentAnalysisOptions
  ): Promise<ContextAnalysisResult> {
    const analysisStartTime = performance.now();

    // Initialize result structure
    const result = createContentAnalysisResult(context.id, context.projectId);

    // Perform all analysis dimensions in parallel for efficiency
    const [
      structuralAnalysis,
      readabilityScore,
      informationDensity,
      qualityAssessment,
      technicalAnalysis,
      complexityAnalysis
    ] = await Promise.all([
      this.analyzeStructure(context.content, context.type),
      this.calculateReadability(context.content, { contentType: this.inferContentType(context.content) }),
      this.calculateInformationDensity(context.content, { contentType: this.inferContentType(context.content) }),
      this.assessQuality(context),
      this.analyzeTechnicalDepth(context.content, context.type),
      this.analyzeComplexity(context.content, context.type)
    ]);

    // Populate analysis result
    result.structuralAnalysis = structuralAnalysis;
    result.readabilityScore = readabilityScore.success ? readabilityScore.data : this.createDefaultReadabilityScore();
    result.informationDensity = informationDensity.success ? informationDensity.data : this.createDefaultInformationDensity();
    result.qualityAssessment = qualityAssessment;
    result.technicalAnalysis = technicalAnalysis;
    result.complexityAnalysis = complexityAnalysis;

    // Calculate overall analysis score
    result.overallScore = calculateOverallAnalysisScore(result, this.config);

    // Calculate confidence level
    result.confidence = aggregateAnalysisConfidence([
      result.structuralAnalysis.confidence,
      result.readabilityScore.confidence,
      result.informationDensity.confidence,
      result.qualityAssessment.confidence
    ]);

    // Generate analysis metrics
    result.analysisMetrics = createAnalysisMetrics(
      analysisStartTime,
      performance.now(),
      'comprehensive',
      context.content.length
    );

    return result;
  }

  /**
   * Perform focused analysis on specific dimensions
   * Targeted analysis strategy from Cline's focused assessment patterns
   */
  private async performFocusedAnalysis(
    context: ContextIntelligenceNode,
    options?: ContentAnalysisOptions
  ): Promise<ContextAnalysisResult> {
    const analysisStartTime = performance.now();
    const focusAreas = options?.focusAreas || ['quality', 'readability'];

    // Initialize result structure
    const result = createContentAnalysisResult(context.id, context.projectId);

    // Perform only focused analysis dimensions
    const analysisPromises: Promise<any>[] = [];

    if (focusAreas.includes('structure')) {
      analysisPromises.push(
        this.analyzeStructure(context.content, context.type)
          .then(analysis => { result.structuralAnalysis = analysis; })
      );
    }

    if (focusAreas.includes('readability')) {
      analysisPromises.push(
        this.calculateReadability(context.content)
          .then(readability => {
            result.readabilityScore = readability.success ? readability.data : this.createDefaultReadabilityScore();
          })
      );
    }

    if (focusAreas.includes('density')) {
      analysisPromises.push(
        this.calculateInformationDensity(context.content)
          .then(density => {
            result.informationDensity = density.success ? density.data : this.createDefaultInformationDensity();
          })
      );
    }

    if (focusAreas.includes('quality')) {
      analysisPromises.push(
        this.assessQuality(context)
          .then(quality => { result.qualityAssessment = quality; })
      );
    }

    if (focusAreas.includes('technical')) {
      analysisPromises.push(
        this.analyzeTechnicalDepth(context.content, context.type)
          .then(technical => { result.technicalAnalysis = technical; })
      );
    }

    await Promise.all(analysisPromises);

    // Calculate overall score based on available dimensions
    result.overallScore = this.calculatePartialAnalysisScore(result, focusAreas);

    // Calculate confidence based on completed analyses
    const confidenceScores = this.extractConfidenceScores(result);
    result.confidence = aggregateAnalysisConfidence(confidenceScores);

    // Generate analysis metrics
    result.analysisMetrics = createAnalysisMetrics(
      analysisStartTime,
      performance.now(),
      'focused',
      context.content.length
    );

    return result;
  }

  /**
   * Perform fast analysis for quick assessment
   * Optimized analysis strategy from Cline's fast evaluation patterns
   */
  private async performFastAnalysis(
    context: ContextIntelligenceNode,
    options?: ContentAnalysisOptions
  ): Promise<ContextAnalysisResult> {
    const analysisStartTime = performance.now();

    // Initialize result structure
    const result = createContentAnalysisResult(context.id, context.projectId);

    // Perform lightweight analysis dimensions only
    const [basicQuality, fastReadability] = await Promise.all([
      this.assessBasicQuality(context),
      this.calculateFastReadability(context.content)
    ]);

    result.qualityAssessment = basicQuality;
    result.readabilityScore = fastReadability;

    // Use existing quality score if available
    if (context.qualityMetrics) {
      result.overallScore = context.qualityMetrics.qualityLevel === 'excellent' ? 0.9 :
                           context.qualityMetrics.qualityLevel === 'good' ? 0.8 :
                           context.qualityMetrics.qualityLevel === 'fair' ? 0.6 :
                           context.qualityMetrics.qualityLevel === 'poor' ? 0.4 : 0.2;
    } else {
      result.overallScore = (basicQuality.score + fastReadability.overall) / 2;
    }

    result.confidence = 0.7; // Lower confidence for fast analysis

    // Generate analysis metrics
    result.analysisMetrics = createAnalysisMetrics(
      analysisStartTime,
      performance.now(),
      'fast',
      context.content.length
    );

    return result;
  }

  /**
   * Perform adaptive analysis based on content characteristics
   * Dynamic analysis strategy from Cline's adaptive assessment patterns
   */
  private async performAdaptiveAnalysis(
    context: ContextIntelligenceNode,
    options?: ContentAnalysisOptions
  ): Promise<ContextAnalysisResult> {
    // Analyze content characteristics to determine optimal strategy
    const contentCharacteristics = this.analyzeContentCharacteristics(context);
    
    // Choose analysis strategy based on characteristics
    if (contentCharacteristics.isHighlyTechnical && contentCharacteristics.isComplex) {
      return this.performComprehensiveAnalysis(context, options);
    } else if (contentCharacteristics.hasSpecificFocus) {
      const focusAreas = this.determineFocusAreas(contentCharacteristics);
      return this.performFocusedAnalysis(context, { ...options, focusAreas });
    } else {
      return this.performFastAnalysis(context, options);
    }
  }

  // =============================================================================
  // PRIVATE METHODS - ANALYSIS DIMENSIONS
  // =============================================================================

  /**
   * Analyze content structure
   * Enhanced structure analysis from Cline's parsing patterns
   */
  private async analyzeStructure(
    content: string,
    contextType: ContextNodeType
  ): Promise<ContentStructuralAnalysis> {
    const startTime = performance.now();

    // Check structure cache first
    const cacheKey = this.generateStructureCacheKey(content, contextType);
    const cached = this.structureCache.get(cacheKey);
    if (cached) {
      return {
        structure: cached,
        confidence: 0.9,
        analysisMethod: 'cached',
        durationMs: 0
      };
    }

    let structure: ContentStructure;
    let analysisMethod: string;

    try {
      switch (contextType) {
        case 'file':
          structure = await this.analyzeFileStructure(content);
          analysisMethod = 'file-structure-analysis';
          break;
        
        case 'module':
          structure = await this.analyzeModuleStructure(content);
          analysisMethod = 'module-structure-analysis';
          break;
        
        case 'function':
          structure = await this.analyzeFunctionStructure(content);
          analysisMethod = 'function-structure-analysis';
          break;
        
        default:
          structure = await this.analyzeGenericStructure(content);
          analysisMethod = 'generic-structure-analysis';
      }

      // Cache the structure
      this.structureCache.set(cacheKey, structure);

      const durationMs = performance.now() - startTime;
      this.performanceMetrics.structuralAnalysisTime = 
        (this.performanceMetrics.structuralAnalysisTime + durationMs) / 2;

      return {
        structure,
        confidence: this.calculateStructuralConfidence(structure),
        analysisMethod,
        durationMs
      };

    } catch (error) {
      this.logger.warn('Structural analysis failed, using fallback', { error });
      
      return {
        structure: this.createFallbackStructure(content),
        confidence: 0.3,
        analysisMethod: 'fallback',
        durationMs: performance.now() - startTime
      };
    }
  }

  /**
   * Assess content quality
   * Enhanced quality assessment using QualityScorer integration
   */
  private async assessQuality(context: ContextIntelligenceNode): Promise<ContentQualityAssessment> {
    const startTime = performance.now();

    try {
      // Use QualityScorer for comprehensive quality assessment
      const qualityResult = await this.qualityScorer.scoreContext(context);
      
      return {
        level: qualityResult.qualityAssessment.qualityLevel,
        score: qualityResult.overallScore,
        confidence: qualityResult.overallConfidence,
        factors: qualityResult.dimensionScores.map(dimension => ({
          factor: dimension.dimension,
          impact: dimension.weightedScore,
          description: `${dimension.dimension} assessment: ${dimension.rawScore.toFixed(2)}`
        })),
        recommendations: qualityResult.qualityAssessment.improvementSuggestions,
        assessmentMethod: 'quality-scorer-integration',
        durationMs: performance.now() - startTime
      };

    } catch (error) {
      this.logger.warn('Quality assessment failed, using fallback', { error });
      
      return this.createFallbackQualityAssessment(context, startTime);
    }
  }

  /**
   * Analyze technical depth of content
   * Technical analysis from Cline's code evaluation patterns
   */
  private async analyzeTechnicalDepth(
    content: string,
    contextType: ContextNodeType
  ): Promise<ContentTechnicalAnalysis> {
    const startTime = performance.now();

    const technicalKeywords = [
      'algorithm', 'implementation', 'architecture', 'pattern', 'optimization',
      'interface', 'abstract', 'polymorphism', 'inheritance', 'encapsulation',
      'async', 'await', 'promise', 'callback', 'closure', 'prototype'
    ];

    const advancedConcepts = [
      'design pattern', 'microservices', 'containerization', 'orchestration',
      'load balancing', 'caching strategy', 'database optimization',
      'security implementation', 'performance tuning'
    ];

    // Analyze technical keyword density
    const contentLower = content.toLowerCase();
    const technicalMatches = technicalKeywords.filter(keyword => 
      contentLower.includes(keyword)
    ).length;

    const advancedMatches = advancedConcepts.filter(concept => 
      contentLower.includes(concept)
    ).length;

    // Calculate technical depth score
    const keywordDensity = technicalMatches / Math.max(1, content.split(/\s+/).length / 100);
    const conceptDensity = advancedMatches / Math.max(1, content.split(/\s+/).length / 200);
    
    let technicalDepth = Math.min(1.0, (keywordDensity * 0.6) + (conceptDensity * 0.4));

    // Adjust based on context type
    if (contextType === 'module' || contextType === 'function') {
      technicalDepth *= 1.2; // Boost for code-specific contexts
    }

    // Determine technical level
    let level: 'basic' | 'intermediate' | 'advanced' | 'expert';
    if (technicalDepth >= 0.8) level = 'expert';
    else if (technicalDepth >= 0.6) level = 'advanced';
    else if (technicalDepth >= 0.4) level = 'intermediate';
    else level = 'basic';

    const durationMs = performance.now() - startTime;

    return {
      level,
      score: Math.min(1.0, technicalDepth),
      confidence: technicalMatches > 0 ? 0.8 : 0.4,
      technicalKeywords: technicalKeywords.filter(keyword => contentLower.includes(keyword)),
      advancedConcepts: advancedConcepts.filter(concept => contentLower.includes(concept)),
      complexityIndicators: this.identifyComplexityIndicators(content),
      analysisMethod: 'keyword-and-concept-analysis',
      durationMs
    };
  }

  /**
   * Analyze content complexity
   * Complexity analysis from Cline's complexity assessment patterns
   */
  private async analyzeComplexity(
    content: string,
    contextType: ContextNodeType
  ): Promise<ContentComplexity> {
    const startTime = performance.now();

    // Calculate various complexity metrics
    const lineCount = content.split('\n').length;
    const wordCount = content.split(/\s+/).length;
    const characterCount = content.length;
    
    // Calculate structural complexity
    const nestingDepth = this.calculateNestingDepth(content);
    const functionCount = this.countFunctions(content);
    const conditionalCount = this.countConditionals(content);
    
    // Calculate cognitive complexity (simplified version)
    let cognitiveComplexity = 0;
    cognitiveComplexity += conditionalCount * 1; // if, else, switch
    cognitiveComplexity += this.countLoops(content) * 2; // for, while, etc.
    cognitiveComplexity += nestingDepth * 1; // nesting penalty
    cognitiveComplexity += functionCount * 0.5; // function definitions

    // Normalize scores
    const lineComplexity = Math.min(1.0, lineCount / 1000);
    const structuralComplexity = Math.min(1.0, (nestingDepth + functionCount + conditionalCount) / 50);
    const cognitiveScore = Math.min(1.0, cognitiveComplexity / 100);

    // Overall complexity score
    const overallComplexity = (lineComplexity + structuralComplexity + cognitiveScore) / 3;

    // Determine complexity level
    let level: 'simple' | 'moderate' | 'complex' | 'highly_complex';
    if (overallComplexity >= 0.8) level = 'highly_complex';
    else if (overallComplexity >= 0.6) level = 'complex';
    else if (overallComplexity >= 0.4) level = 'moderate';
    else level = 'simple';

    const durationMs = performance.now() - startTime;

    return {
      level,
      score: overallComplexity,
      confidence: 0.8,
      metrics: {
        lineCount,
        wordCount,
        characterCount,
        nestingDepth,
        functionCount,
        conditionalCount,
        cognitiveComplexity
      },
      factors: [
        { factor: 'line-complexity', impact: lineComplexity, description: `${lineCount} lines of content` },
        { factor: 'structural-complexity', impact: structuralComplexity, description: `${functionCount} functions, ${conditionalCount} conditionals` },
        { factor: 'cognitive-complexity', impact: cognitiveScore, description: `Cognitive complexity score: ${cognitiveComplexity}` }
      ],
      analysisMethod: 'multi-metric-complexity-analysis',
      durationMs
    };
  }

  // =============================================================================
  // PRIVATE METHODS - CONTENT-SPECIFIC ANALYZERS
  // =============================================================================

  /**
   * Calculate content density for information density analysis
   */
  private async calculateContentDensity(
    content: string,
    contentType: ContextContentType
  ): Promise<ContentInformationDensity> {
    const words = content.split(/\s+/).filter(word => word.length > 0);
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    
    // Calculate basic density metrics
    const averageWordsPerSentence = words.length / Math.max(1, sentences.length);
    const averageSentencesPerParagraph = sentences.length / Math.max(1, paragraphs.length);
    
    // Calculate information indicators
    const uniqueWords = new Set(words.map(w => w.toLowerCase())).size;
    const vocabularyRichness = uniqueWords / Math.max(1, words.length);
    
    // Calculate density score based on content type
    let densityScore: number;
    let densityLevel: 'sparse' | 'moderate' | 'dense' | 'very_dense';
    
    switch (contentType) {
      case 'code':
        // Code density based on functionality per line
        densityScore = this.calculateCodeDensity(content);
        break;
      case 'documentation':
        // Documentation density based on information per paragraph
        densityScore = this.calculateDocumentationDensity(content);
        break;
      default:
        // General text density
        densityScore = (vocabularyRichness + Math.min(1.0, averageWordsPerSentence / 20)) / 2;
    }

    // Determine density level
    if (densityScore >= 0.8) densityLevel = 'very_dense';
    else if (densityScore >= 0.6) densityLevel = 'dense';
    else if (densityScore >= 0.4) densityLevel = 'moderate';
    else densityLevel = 'sparse';

    return {
      level: densityLevel,
      score: densityScore,
      confidence: 0.8,
      metrics: {
        wordCount: words.length,
        sentenceCount: sentences.length,
        paragraphCount: paragraphs.length,
        averageWordsPerSentence,
        averageSentencesPerParagraph,
        vocabularyRichness,
        uniqueWordCount: uniqueWords
      },
      factors: [
        { factor: 'vocabulary-richness', impact: vocabularyRichness, description: `${(vocabularyRichness * 100).toFixed(1)}% unique words` },
        { factor: 'sentence-length', impact: Math.min(1.0, averageWordsPerSentence / 20), description: `Average ${averageWordsPerSentence.toFixed(1)} words per sentence` }
      ],
      analysisMethod: `${contentType}-density-analysis`
    };
  }

  // =============================================================================
  // PRIVATE METHODS - UTILITY FUNCTIONS
  // =============================================================================

  /**
   * Infer content type from content analysis
   */
  private inferContentType(content: string): ContextContentType {
    // Simple heuristics to determine content type
    const trimmedContent = content.trim();
    
    // Check for code patterns
    if (this.isCodeContent(trimmedContent)) {
      return 'code';
    }
    
    // Check for JSON
    if (trimmedContent.startsWith('{') || trimmedContent.startsWith('[')) {
      try {
        JSON.parse(trimmedContent);
        return 'json';
      } catch {
        // Not valid JSON
      }
    }
    
    // Check for markdown
    if (trimmedContent.includes('#') || trimmedContent.includes('```
      return 'markdown';
    }
    
    return 'text';
  }

  /**
   * Check if content appears to be code
   */
  private isCodeContent(content: string): boolean {
    const codeIndicators = [
      'function ', 'class ', 'interface ', 'import ', 'export ',
      'const ', 'let ', 'var ', 'if (', 'for (', 'while (',
      '{', '}', ';', '//', '/*', '*/'
    ];
    
    const indicatorCount = codeIndicators.filter(indicator => 
      content.includes(indicator)
    ).length;
    
    return indicatorCount >= 3;
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
   * Calculate nesting depth in content
   */
  private calculateNestingDepth(content: string): number {
    let maxDepth = 0;
    let currentDepth = 0;
    
    for (const char of content) {
      if (char === '{' || char === '(' || char === '[') {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      } else if (char === '}' || char === ')' || char === ']') {
        currentDepth = Math.max(0, currentDepth - 1);
      }
    }
    
    return maxDepth;
  }

  /**
   * Count functions in content
   */
  private countFunctions(content: string): number {
    const functionPatterns = [
      /function\s+\w+/g,
      /=>\s*{/g,
      /\w+\s*:\s*function/g,
      /def\s+\w+/g, // Python
      /public\s+\w+\s*$$/g, // Java/C#
      /private\s+\w+\s*$$/g
    ];
    
    return functionPatterns.reduce((count, pattern) => {
      const matches = content.match(pattern);
      return count + (matches ? matches.length : 0);
    }, 0);
  }

  /**
   * Count conditional statements
   */
  private countConditionals(content: string): number {
    const conditionalPatterns = [
      /\bif\s*$$/g,
      /\belse\s*if\s*$$/g,
      /\bswitch\s*$$/g,
      /\bcase\s+/g,
      /\?\s*.*\s*:/g // Ternary operators
    ];
    
    return conditionalPatterns.reduce((count, pattern) => {
      const matches = content.match(pattern);
      return count + (matches ? matches.length : 0);
    }, 0);
  }

  /**
   * Count loop statements
   */
  private countLoops(content: string): number {
    const loopPatterns = [
      /\bfor\s*$$/g,
      /\bwhile\s*$$/g,
      /\bdo\s*{/g,
      /\.forEach$$/g,
      /\.map$$/g,
      /\.filter$$/g,
      /\.reduce$$/g
    ];
    
    return loopPatterns.reduce((count, pattern) => {
      const matches = content.match(pattern);
      return count + (matches ? matches.length : 0);
    }, 0);
  }

  /**
   * Generate cache key for analysis results
   */
  private generateCacheKey(
    context: ContextIntelligenceNode,
    options?: ContentAnalysisOptions
  ): string {
    const contentHash = this.generateContentHash(context.content);
    const optionsHash = options ? this.generateContentHash(JSON.stringify(options)) : '';
    return `${context.id}_${contentHash}_${optionsHash}_${this.config.analysisStrategy}`;
  }

  /**
   * Generate cache key for structure analysis
   */
  private generateStructureCacheKey(content: string, contextType: ContextNodeType): string {
    const contentHash = this.generateContentHash(content);
    return `struct_${contextType}_${contentHash}`;
  }

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
   * Update performance metrics
   */
  private updatePerformanceMetrics(durationMs: number): void {
    this.performanceMetrics.totalAnalyses++;
    this.performanceMetrics.averageAnalysisTime = 
      (this.performanceMetrics.averageAnalysisTime + durationMs) / 2;
  }

  /**
   * Create analysis error
   */
  private createAnalysisError(
    code: AnalysisError['analysisErrorCode'],
    message: string,
    contextIds: UUID[] = [],
    metadata: Record<string, any> = {}
  ): AnalysisError {
    return {
      name: 'AnalysisError',
      message,
      code: 'CONTENT_ANALYSIS_ERROR',
      timestamp: createTimestamp(),
      componentId: 'ContentAnalyzer',
      severity: 'error',
      recoverable: true,
      context: metadata,
      analysisErrorCode: code,
      affectedContextIds: contextIds,
      recoverySuggestions: [
        {
          action: 'Retry with different strategy',
          automated: false,
          confidence: 0.7
        },
        {
          action: 'Check content format and encoding',
          automated: true,
          confidence: 0.8
        }
      ]
    };
  }

  // =============================================================================
  // PRIVATE METHODS - CACHE MANAGEMENT
  // =============================================================================

  /**
   * Get cached analysis result
   */
  private getCachedAnalysis(
    context: ContextIntelligenceNode,
    options?: ContentAnalysisOptions
  ): ContextAnalysisResult | null {
    const cacheKey = this.generateCacheKey(context, options);
    return this.analysisCache.get(cacheKey) || null;
  }

  /**
   * Cache analysis result
   */
  private cacheAnalysis(
    context: ContextIntelligenceNode,
    result: ContextAnalysisResult,
    options?: ContentAnalysisOptions
  ): void {
    const cacheKey = this.generateCacheKey(context, options);
    this.analysisCache.set(cacheKey, result);

    // Clean up old cache entries if needed
    if (this.analysisCache.size > this.config.performance.maxCacheSize) {
      this.cleanupOldCacheEntries();
    }
  }

  /**
   * Clean up old cache entries
   */
  private cleanupOldCacheEntries(): void {
    const entries = Array.from(this.analysisCache.entries());
    const toRemove = Math.ceil(entries.length * 0.25); // Remove 25% of oldest entries
    
    for (let i = 0; i < toRemove; i++) {
      this.analysisCache.delete(entries[i]);
    }

    // Also clean up structure cache
    const structureEntries = Array.from(this.structureCache.entries());
    const structureToRemove = Math.ceil(structureEntries.length * 0.25);
    
    for (let i = 0; i < structureToRemove; i++) {
      this.structureCache.delete(structureEntries[i]);
    }
  }

  /**
   * Start background cleanup process
   */
  private startBackgroundCleanup(): void {
    const cleanupInterval = ANALYSIS_CONSTANTS.CACHE_CLEANUP_INTERVAL;
    
    setInterval(() => {
      try {
        if (this.analysisCache.size > this.config.performance.maxCacheSize * 0.8) {
          this.cleanupOldCacheEntries();
        }
      } catch (error) {
        this.logger.error('Background cleanup failed', { error });
      }
    }, cleanupInterval);

    this.logger.info('Background cleanup started', { interval: cleanupInterval });
  }

  // Additional helper methods for completeness (simplified implementations)

  private async analyzeFileStructure(content: string): Promise<ContentStructure> {
    return {
      type: 'file',
      elements: [],
      hierarchy: { depth: 1, breadth: 1 },
      organization: { sectioned: false, modular: false, structured: true }
    };
  }

  private async analyzeModuleStructure(content: string): Promise<ContentStructure> {
    return {
      type: 'module',
      elements: [],
      hierarchy: { depth: 2, breadth: 3 },
      organization: { sectioned: true, modular: true, structured: true }
    };
  }

  private async analyzeFunctionStructure(content: string): Promise<ContentStructure> {
    return {
      type: 'function',
      elements: [],
      hierarchy: { depth: 1, breadth: 2 },
      organization: { sectioned: false, modular: false, structured: true }
    };
  }

  private async analyzeGenericStructure(content: string): Promise<ContentStructure> {
    return {
      type: 'generic',
      elements: [],
      hierarchy: { depth: 1, breadth: 1 },
      organization: { sectioned: false, modular: false, structured: false }
    };
  }

  private calculateStructuralConfidence(structure: ContentStructure): number {
    return 0.8; // Simplified
  }

  private createFallbackStructure(content: string): ContentStructure {
    return {
      type: 'unknown',
      elements: [],
      hierarchy: { depth: 0, breadth: 0 },
      organization: { sectioned: false, modular: false, structured: false }
    };
  }

  private createFallbackQualityAssessment(context: ContextIntelligenceNode, startTime: number): ContentQualityAssessment {
    return {
      level: 'fair',
      score: 0.5,
      confidence: 0.3,
      factors: [],
      recommendations: ['Content analysis failed, manual review recommended'],
      assessmentMethod: 'fallback',
      durationMs: performance.now() - startTime
    };
  }

  private identifyComplexityIndicators(content: string): string[] {
    const indicators = [];
    if (content.includes('async') || content.includes('await')) indicators.push('asynchronous-patterns');
    if (content.includes('class') || content.includes('interface')) indicators.push('object-oriented');
    if (content.includes('=>') || content.includes('callback')) indicators.push('functional-patterns');
    return indicators;
  }

  private calculateCodeDensity(content: string): number {
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    const functionalLines = lines.filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('/*'));
    return functionalLines.length / Math.max(1, lines.length);
  }

  private calculateDocumentationDensity(content: string): number {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = content.split(/\s+/).length;
    return Math.min(1.0, sentences.length / Math.max(1, words / 20)); // Information per 20 words
  }

  private calculateFastReadability(content: string): ContentReadabilityScore {
    const words = content.split(/\s+/).length;
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    const avgWordsPerSentence = words / Math.max(1, sentences);
    
    // Simple readability score based on sentence length
    const readabilityScore = Math.max(0.1, Math.min(1.0, 1 - (avgWordsPerSentence - 15) / 30));
    
    return {
      overall: readabilityScore,
      confidence: 0.6,
      level: readabilityScore > 0.7 ? 'high' : readabilityScore > 0.5 ? 'medium' : 'low',
      factors: [
        { factor: 'sentence-length', impact: readabilityScore, description: `Average sentence length: ${avgWordsPerSentence.toFixed(1)} words` }
      ],
      analysisMethod: 'fast-readability'
    };
  }

  private assessBasicQuality(context: ContextIntelligenceNode): ContentQualityAssessment {
    const contentLength = context.content.length;
    let score = 0.5; // Base score
    
    if (contentLength > 100) score += 0.2;
    if (contentLength > 500) score += 0.1;
    if (context.qualityMetrics) score += 0.2;
    
    return {
      level: score > 0.8 ? 'excellent' : score > 0.6 ? 'good' : score > 0.4 ? 'fair' : 'poor',
      score,
      confidence: 0.6,
      factors: [
        { factor: 'content-length', impact: Math.min(0.3, contentLength / 1000), description: `Content length: ${contentLength} characters` }
      ],
      recommendations: score < 0.6 ? ['Consider adding more detailed content'] : [],
      assessmentMethod: 'basic-quality-assessment',
      durationMs: 5
    };
  }

  private analyzeContentCharacteristics(context: ContextIntelligenceNode): {
    isHighlyTechnical: boolean;
    isComplex: boolean;
    hasSpecificFocus: boolean;
  } {
    const content = context.content.toLowerCase();
    const technicalKeywords = ['algorithm', 'implementation', 'architecture', 'optimization'];
    const isHighlyTechnical = technicalKeywords.some(keyword => content.includes(keyword));
    
    return {
      isHighlyTechnical,
      isComplex: context.content.length > 1000 && isHighlyTechnical,
      hasSpecificFocus: context.type === 'function' || context.type === 'module'
    };
  }

  private determineFocusAreas(characteristics: any): string[] {
    const areas = ['quality'];
    if (characteristics.isHighlyTechnical) areas.push('technical');
    if (characteristics.isComplex) areas.push('structure', 'readability');
    return areas;
  }

  private calculatePartialAnalysisScore(result: ContextAnalysisResult, focusAreas: string[]): number {
    let totalScore = 0;
    let count = 0;
    
    if (focusAreas.includes('quality') && result.qualityAssessment) {
      totalScore += result.qualityAssessment.score;
      count++;
    }
    if (focusAreas.includes('readability') && result.readabilityScore) {
      totalScore += result.readabilityScore.overall;
      count++;
    }
    if (focusAreas.includes('density') && result.informationDensity) {
      totalScore += result.informationDensity.score;
      count++;
    }
    
    return count > 0 ? totalScore / count : 0.5;
  }

  private extractConfidenceScores(result: ContextAnalysisResult): number[] {
    const scores = [];
    if (result.qualityAssessment) scores.push(result.qualityAssessment.confidence);
    if (result.readabilityScore) scores.push(result.readabilityScore.confidence);
    if (result.informationDensity) scores.push(result.informationDensity.confidence);
    if (result.structuralAnalysis) scores.push(result.structuralAnalysis.confidence);
    return scores.length > 0 ? scores : [0.5];
  }

  private createDefaultReadabilityScore(): ContentReadabilityScore {
    return {
      overall: 0.5,
      confidence: 0.3,
      level: 'medium',
      factors: [],
      analysisMethod: 'default'
    };
  }

  private createDefaultInformationDensity(): ContentInformationDensity {
    return {
      level: 'moderate',
      score: 0.5,
      confidence: 0.3,
      metrics: {
        wordCount: 0,
        sentenceCount: 0,
        paragraphCount: 0,
        averageWordsPerSentence: 0,
        averageSentencesPerParagraph: 0,
        vocabularyRichness: 0,
        uniqueWordCount: 0
      },
      factors: [],
      analysisMethod: 'default'
    };
  }

  private calculateQualityDistribution(results: Map<UUID, ContextAnalysisResult>): Record<ContextQualityLevel, number> {
    const distribution: Record<ContextQualityLevel, number> = {
      'excellent': 0,
      'good': 0,
      'fair': 0,
      'poor': 0,
      'stale': 0,
      'invalid': 0
    };
    
    for (const result of results.values()) {
      if (result.qualityAssessment) {
        distribution[result.qualityAssessment.level]++;
      }
    }
    
    return distribution;
  }

  private calculateSummaryStatistics(results: Map<UUID, ContextAnalysisResult>): {
    meanScore: number;
    medianScore: number;
    standardDeviation: number;
    scoreRange: { min: number; max: number };
  } {
    const scores = Array.from(results.values()).map(r => r.overallScore);
    
    if (scores.length === 0) {
      return {
        meanScore: 0,
        medianScore: 0,
        standardDeviation: 0,
        scoreRange: { min: 0, max: 0 }
      };
    }
    
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const sortedScores = [...scores].sort((a, b) => a - b);
    const median = sortedScores.length % 2 === 0
      ? (sortedScores[sortedScores.length / 2 - 1] + sortedScores[sortedScores.length / 2]) / 2
      : sortedScores[Math.floor(sortedScores.length / 2)];
    
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
    const standardDeviation = Math.sqrt(variance);
    
    return {
      meanScore: mean,
      medianScore: median,
      standardDeviation,
      scoreRange: {
        min: Math.min(...scores),
        max: Math.max(...scores)
      }
    };
  }

  private async generateBatchRecommendations(
    results: Map<UUID, ContextAnalysisResult>,
    failures: Array<{ contextId: UUID; error: string; recoverable: boolean }>
  ): Promise<string[]> {
    const recommendations: string[] = [];
    
    const averageScore = Array.from(results.values())
      .reduce((sum, result) => sum + result.overallScore, 0) / Math.max(1, results.size);
    
    if (averageScore < 0.6) {
      recommendations.push('Consider implementing content quality improvement processes');
    }
    
    if (failures.length > results.size * 0.1) {
      recommendations.push('High failure rate detected - review content format and encoding');
    }
    
    const lowReadabilityCount = Array.from(results.values())
      .filter(r => r.readabilityScore && r.readabilityScore.overall < 0.5).length;
    
    if (lowReadabilityCount > results.size * 0.3) {
      recommendations.push('Many contexts have low readability - consider content restructuring');
    }
    
    return recommendations;
  }

  private async mockGetContext(contextId: UUID, projectId: UUID): Promise<ContextIntelligenceNode> {
    // This would be replaced with actual context repository call
    const now = createTimestamp();
    
    return {
      id: contextId,
      projectId,
      type: 'file',
      path: `/mock/path/${contextId}.ts`,
      content: 'Mock content for analysis test',
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
        temporalPatterns: { peakHours: , seasonality: 'morning' },
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

  // =============================================================================
  // PUBLIC UTILITY METHODS
  // =============================================================================

  /**
   * Get current performance statistics
   */
  getPerformanceMetrics(): ContentAnalysisPerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.analysisCache.clear();
    this.structureCache.clear();
    this.logger.info('Content analyzer cache cleared');
  }

  /**
   * Update configuration at runtime
   */
  async updateConfig(newConfig: Partial<ContentAnalysisConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    
    // Clear cache if analysis strategy changed
    if (newConfig.analysisStrategy) {
      this.clearCache();
    }
    
    this.logger.info('ContentAnalyzer configuration updated', { newConfig });
  }

  /**
   * Get cache statistics
   */
  getCacheStatistics() {
    return {
      analysisCacheSize: this.analysisCache.size,
      structureCacheSize: this.structureCache.size,
      cacheHitRate: this.performanceMetrics.cacheHitRate,
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  private estimateMemoryUsage(): number {
    // Simple memory usage estimation
    let totalSize = 0;
    
    this.analysisCache.forEach(entry => {
      totalSize += JSON.stringify(entry).length * 2; // UTF-16 encoding
    });
    
    this.structureCache.forEach(entry => {
      totalSize += JSON.stringify(entry).length * 2;
    });
    
    return totalSize / (1024 * 1024); // Convert to MB
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up ContentAnalyzer resources');
    
    this.analysisCache.clear();
    this.structureCache.clear();
    this.batchProcessingQueue.clear();
    
    this.isInitialized = false;
  }
}

// =============================================================================
// CONTENT ANALYZER INTERFACES
// =============================================================================

interface ContentAnalyzerInterface {
  calculateReadability(content: string): Promise<ContentReadabilityScore>;
  getReadabilityMetrics(content: string): Promise<ReadabilityMetrics>;
}

// Simplified content analyzer implementations
class TextContentAnalyzer implements ContentAnalyzerInterface {
  constructor(private logger: Logger) {}

  async calculateReadability(content: string): Promise<ContentReadabilityScore> {
    // Simplified text readability calculation
    const words = content.split(/\s+/).length;
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    const avgWordsPerSentence = words / Math.max(1, sentences);
    
    const readabilityScore = Math.max(0.1, Math.min(1.0, 1 - (avgWordsPerSentence - 15) / 30));
    
    return {
      overall: readabilityScore,
      confidence: 0.8,
      level: readabilityScore > 0.7 ? 'high' : readabilityScore > 0.5 ? 'medium' : 'low',
      factors: [
        { factor: 'sentence-length', impact: readabilityScore, description: `Average sentence length: ${avgWordsPerSentence.toFixed(1)} words` }
      ],
      analysisMethod: 'text-readability-analysis'
    };
  }

  async getReadabilityMetrics(content: string): Promise<ReadabilityMetrics> {
    const words = content.split(/\s+/).length;
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0).length;
    
    return {
      wordCount: words,
      sentenceCount: sentences,
      paragraphCount: paragraphs,
      averageWordsPerSentence: words / Math.max(1, sentences),
      averageSentencesPerParagraph: sentences / Math.max(1, paragraphs),
      readingLevel: 'intermediate', // Simplified
      complexityScore: Math.min(1.0, words / 1000)
    };
  }
}

class CodeContentAnalyzer implements ContentAnalyzerInterface {
  constructor(private logger: Logger) {}

  async calculateReadability(content: string): Promise<ContentReadabilityScore> {
    // Code-specific readability calculation
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    const functionalLines = lines.filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('/*'));
    const commentRatio = (lines.length - functionalLines.length) / Math.max(1, lines.length);
    
    let readabilityScore = 0.6; // Base score for code
    readabilityScore += commentRatio * 0.3; // Boost for comments
    readabilityScore += Math.min(0.1, lines.length / 1000); // Small boost for substantial code
    
    return {
      overall: Math.min(1.0, readabilityScore),
      confidence: 0.7,
      level: readabilityScore > 0.7 ? 'high' : readabilityScore > 0.5 ? 'medium' : 'low',
      factors: [
        { factor: 'comment-ratio', impact: commentRatio, description: `${(commentRatio * 100).toFixed(1)}% comments` },
        { factor: 'code-length', impact: Math.min(0.1, lines.length / 1000), description: `${lines.length} lines of code` }
      ],
      analysisMethod: 'code-readability-analysis'
    };
  }

  async getReadabilityMetrics(content: string): Promise<ReadabilityMetrics> {
    const lines = content.split('\n');
    const nonEmptyLines = lines.filter(line => line.trim().length > 0);
    
    return {
      wordCount: content.split(/\s+/).length,
      sentenceCount: nonEmptyLines.length, // Treat lines as sentences in code
      paragraphCount: content.split(/\n\s*\n/).filter(p => p.trim().length > 0).length,
      averageWordsPerSentence: content.split(/\s+/).length / Math.max(1, nonEmptyLines.length),
      averageSentencesPerParagraph: 5, // Simplified
      readingLevel: 'technical',
      complexityScore: this.calculateCodeComplexity(content)
    };
  }

  private calculateCodeComplexity(content: string): number {
    // Simplified code complexity calculation
    const complexityIndicators = [
      content.match(/if\s*$$/g)?.length || 0,
      content.match(/for\s*$$/g)?.length || 0,
      content.match(/while\s*$$/g)?.length || 0,
      content.match(/function\s+/g)?.length || 0,
      content.match(/class\s+/g)?.length || 0
    ];
    
    const totalComplexity = complexityIndicators.reduce((sum, count) => sum + count, 0);
    return Math.min(1.0, totalComplexity / 50); // Normalize to 0-1 scale
  }
}

class MarkdownContentAnalyzer implements ContentAnalyzerInterface {
  constructor(private logger: Logger) {}

  async calculateReadability(content: string): Promise<ContentReadabilityScore> {
    // Markdown-specific readability calculation
    const hasHeaders = content.includes('#');
    const hasLists = content.includes('-') || content.includes('*') || content.includes('1.');
    const hasFormatting = content.includes('**') || content.includes('*') || content.includes('`');
    
    let readabilityScore = 0.7; // Base score for markdown
    if (hasHeaders) readabilityScore += 0.1;
    if (hasLists) readabilityScore += 0.1;
    if (hasFormatting) readabilityScore += 0.1;
    
    return {
      overall: Math.min(1.0, readabilityScore),
      confidence: 0.8,
      level: readabilityScore > 0.8 ? 'high' : readabilityScore > 0.6 ? 'medium' : 'low',
      factors: [
        { factor: 'structure', impact: hasHeaders ? 0.1 : 0, description: hasHeaders ? 'Has header structure' : 'No header structure' },
        { factor: 'formatting', impact: hasFormatting ? 0.1 : 0, description: hasFormatting ? 'Has formatting' : 'No formatting' }
      ],
      analysisMethod: 'markdown-readability-analysis'
    };
  }

  async getReadabilityMetrics(content: string): Promise<ReadabilityMetrics> {
    const words = content.replace(/[#*`$$$$]/g, '').split(/\s+/).filter(w => w.length > 0).length;
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    const sections = content.split(/#{1,6}\s/).filter(s => s.trim().length > 0).length;
    
    return {
      wordCount: words,
      sentenceCount: sentences,
      paragraphCount: sections,
      averageWordsPerSentence: words / Math.max(1, sentences),
      averageSentencesPerParagraph: sentences / Math.max(1, sections),
      readingLevel: 'general',
      complexityScore: Math.min(1.0, sections / 10) // Based on section count
    };
  }
}

class JsonContentAnalyzer implements ContentAnalyzerInterface {
  constructor(private logger: Logger) {}

  async calculateReadability(content: string): Promise<ContentReadabilityScore> {
    try {
      const parsed = JSON.parse(content);
      const isFormatted = content.includes('\n') && content.includes('  ');
      const depth = this.calculateJsonDepth(parsed);
      
      let readabilityScore = 0.6; // Base score for JSON
      if (isFormatted) readabilityScore += 0.2;
      if (depth <= 3) readabilityScore += 0.2;
      
      return {
        overall: Math.min(1.0, readabilityScore),
        confidence: 0.9,
        level: readabilityScore > 0.7 ? 'high' : readabilityScore > 0.5 ? 'medium' : 'low',
        factors: [
          { factor: 'formatting', impact: isFormatted ? 0.2 : 0, description: isFormatted ? 'Well formatted' : 'Not formatted' },
          { factor: 'depth', impact: depth <= 3 ? 0.2 : 0, description: `Nesting depth: ${depth}` }
        ],
        analysisMethod: 'json-readability-analysis'
      };
    } catch {
      return {
        overall: 0.1,
        confidence: 0.9,
        level: 'low',
        factors: [
          { factor: 'validity', impact: -0.9, description: 'Invalid JSON' }
        ],
        analysisMethod: 'json-validation-failed'
      };
    }
  }

  async getReadabilityMetrics(content: string): Promise<ReadabilityMetrics> {
    try {
      const parsed = JSON.parse(content);
      const keyCount = this.countJsonKeys(parsed);
      const depth = this.calculateJsonDepth(parsed);
      
      return {
        wordCount: keyCount, // Use key count as word equivalent
        sentenceCount: keyCount,
        paragraphCount: Math.max(1, Math.floor(keyCount / 10)),
        averageWordsPerSentence: 1,
        averageSentencesPerParagraph: 10,
        readingLevel: 'technical',
        complexityScore: Math.min(1.0, depth / 10)
      };
    } catch {
      return {
        wordCount: 0,
        sentenceCount: 0,
        paragraphCount: 0,
        averageWordsPerSentence: 0,
        averageSentencesPerParagraph: 0,
        readingLevel: 'invalid',
        complexityScore: 1.0
      };
    }
  }

  private calculateJsonDepth(obj: any): number {
    if (typeof obj !== 'object' || obj === null) return 0;
    
    let maxDepth = 0;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const depth = 1 + this.calculateJsonDepth(obj[key]);
        maxDepth = Math.max(maxDepth, depth);
      }
    }
    return maxDepth;
  }

  private countJsonKeys(obj: any): number {
    if (typeof obj !== 'object' || obj === null) return 0;
    
    let count = 0;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        count += 1 + this.countJsonKeys(obj[key]);
      }
    }
    return count;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export { ContentAnalyzer };
export default ContentAnalyzer;

/**
 * Version information
 */
export const CONTENT_ANALYZER_VERSION = '1.0.0';
