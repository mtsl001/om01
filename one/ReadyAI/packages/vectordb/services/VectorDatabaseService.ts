// packages/vectordb/services/VectorDatabaseService.ts

/**
 * ReadyAI Vector Database Service - Enterprise-Grade Service Orchestrator
 * 
 * This module implements comprehensive vector database service orchestration,
 * adapting Cline's proven service orchestration patterns with 90% pattern reuse
 * while extending with ReadyAI-specific vector operations and business logic.
 * 
 * Key Adaptations from Cline:
 * - Service orchestration patterns from Cline's multi-service coordination architecture
 * - Event-driven architecture from Cline's robust event handling system
 * - Error handling and retry mechanisms from Cline's production-tested patterns
 * - Performance monitoring from Cline's comprehensive telemetry system
 * - Resource lifecycle management from Cline's efficient cleanup patterns
 * - Configuration management from Cline's flexible config system
 * 
 * ReadyAI Extensions:
 * - Vector database operations with Milvus integration
 * - Context-aware vector search for project intelligence
 * - Performance monitoring for ReadyAI KPI tracking (3-second retrieval target)
 * - Project-scoped vector operations with isolation
 * - Integration with ReadyAI's logging and error services
 * 
 * @version 1.0.0
 * @author ReadyAI Development Team
 */

import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';

// ReadyAI Core Dependencies
import {
    UUID,
    ApiResponse,
    ApiErrorResponse,
    ReadyAIError,
    AsyncResult,
    wrapAsync,
    createApiResponse,
    createApiError,
    isApiSuccess,
    ValidationResult,
    generateUUID,
    createTimestamp,
    PhaseType
} from '../../../foundation/types/core.js';

// Vector Database Types
import {
    VectorDatabaseConfig,
    VectorCollectionConfig,
    VectorCollection,
    VectorSearchQuery,
    VectorSearchResult,
    VectorInsertRequest,
    VectorEntity,
    VectorOperationResult,
    BatchVectorOperationResult,
    VectorDatabaseHealth,
    VectorPerformanceMetrics,
    SemanticSearchConfig,
    SemanticSearchResult,
    VectorContextNode,
    EmbeddingRequest,
    EmbeddingResult,
    CollectionStats,
    IndexInfo,
    DEFAULT_VECTOR_CONFIG,
    VectorOperationType
} from '../types/vectordb.js';

// Service Dependencies
import { MilvusConnection } from './MilvusConnection.js';
import { CollectionManager } from './CollectionManager.js';
import { EmbeddingService } from './EmbeddingService.js';
import { SearchService } from './SearchService.js';
import { VectorOperations } from './VectorOperations.js';
import { VectorCache } from './VectorCache.js';

// Logging and Error Services
import { Logger, logContextPerformance } from '../../logging/services/Logger.js';
import { ErrorService } from '../../logging/services/ErrorService.js';
import { TelemetryService } from '../../logging/services/TelemetryService.js';

/**
 * Vector Database Service configuration
 * Enhanced with ReadyAI-specific orchestration settings
 */
export interface VectorDatabaseServiceConfig {
    /** Database connection configuration */
    database: VectorDatabaseConfig;
    /** Enable performance monitoring */
    enableMonitoring: boolean;
    /** Health check interval in milliseconds */
    healthCheckInterval: number;
    /** Performance metrics collection interval */
    metricsInterval: number;
    /** ReadyAI-specific settings */
    readyai: {
        /** Context retrieval KPI target in milliseconds */
        contextRetrievalTarget: number;
        /** Enable project-scoped operations */
        enableProjectScoping: boolean;
        /** Default collection prefix for ReadyAI */
        collectionPrefix: string;
        /** Maximum concurrent operations */
        maxConcurrentOps: number;
    };
    /** Service coordination settings */
    services: {
        /** Enable embedding service */
        enableEmbedding: boolean;
        /** Enable search service */
        enableSearch: boolean;
        /** Enable caching */
        enableCache: boolean;
        /** Service startup timeout */
        startupTimeoutMs: number;
    };
}

/**
 * Service orchestration context for tracking cross-service operations
 * Adapted from Cline's operation context patterns
 */
interface ServiceOperationContext {
    /** Unique operation identifier */
    operationId: UUID;
    /** Operation type */
    operationType: VectorOperationType;
    /** Project context */
    projectId?: UUID;
    /** Phase context */
    phase?: PhaseType;
    /** Started services */
    startedServices: Set<string>;
    /** Operation start time */
    startTime: number;
    /** Operation metadata */
    metadata: Record<string, any>;
}

/**
 * Service health status tracking
 * Following Cline's service health patterns
 */
interface ServiceHealthStatus {
    /** Service name */
    name: string;
    /** Health status */
    isHealthy: boolean;
    /** Last check timestamp */
    lastChecked: string;
    /** Response time in milliseconds */
    responseTimeMs: number;
    /** Error message if unhealthy */
    error?: string;
    /** Service-specific metrics */
    metrics?: Record<string, number>;
}

/**
 * Default Vector Database Service configuration
 * Optimized for ReadyAI development workflow
 */
const DEFAULT_SERVICE_CONFIG: VectorDatabaseServiceConfig = {
    database: DEFAULT_VECTOR_CONFIG,
    enableMonitoring: true,
    healthCheckInterval: 30000, // 30 seconds
    metricsInterval: 60000, // 1 minute
    readyai: {
        contextRetrievalTarget: 3000, // 3 seconds KPI target
        enableProjectScoping: true,
        collectionPrefix: 'readyai_',
        maxConcurrentOps: 50
    },
    services: {
        enableEmbedding: true,
        enableSearch: true,
        enableCache: true,
        startupTimeoutMs: 30000
    }
};

/**
 * Vector Database Service - Enterprise Service Orchestrator
 * 
 * Coordinates all vector database operations across ReadyAI components,
 * adapting Cline's proven service orchestration patterns while providing
 * ReadyAI-specific vector intelligence and performance monitoring.
 */
export class VectorDatabaseService extends EventEmitter {
    private readonly config: VectorDatabaseServiceConfig;
    private readonly logger: Logger;
    private readonly errorService: ErrorService;
    private readonly telemetryService: TelemetryService;

    // Core Services - following Cline's service composition patterns
    private milvusConnection!: MilvusConnection;
    private collectionManager!: CollectionManager;
    private embeddingService!: EmbeddingService;
    private searchService!: SearchService;
    private vectorOperations!: VectorOperations;
    private vectorCache!: VectorCache;

    // Service State Management - adapted from Cline patterns
    private isInitialized = false;
    private isShuttingDown = false;
    private readonly serviceHealth = new Map<string, ServiceHealthStatus>();

    // Operation Tracking - following Cline's operation management
    private readonly activeOperations = new Map<UUID, ServiceOperationContext>();
    private readonly performanceMetrics: VectorPerformanceMetrics[] = [];

    // Monitoring and Health Check Intervals
    private healthCheckInterval?: NodeJS.Timeout;
    private metricsInterval?: NodeJS.Timeout;

    // Performance Tracking - adapted from Cline telemetry patterns
    private readonly operationStats = {
        totalOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        averageLatency: 0,
        contextRetrievalTimes: [] as number[]
    };

    constructor(config?: Partial<VectorDatabaseServiceConfig>) {
        super();
        
        this.config = { ...DEFAULT_SERVICE_CONFIG, ...config };
        this.logger = Logger.getInstance();
        this.errorService = ErrorService.getInstance();
        this.telemetryService = TelemetryService.getInstance();

        // Setup error handling
        this.setupErrorHandlers();
    }

    /**
     * Initialize the Vector Database Service
     * Orchestrates startup of all dependent services following Cline initialization patterns
     */
    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            throw new ReadyAIError(
                'VectorDatabaseService is already initialized',
                'ALREADY_INITIALIZED',
                400
            );
        }

        const operationId = generateUUID();
        const startTime = performance.now();

        try {
            this.emit('service-initializing', operationId);
            
            this.logger.info('Initializing VectorDatabaseService', {
                operationId,
                config: {
                    host: this.config.database.host,
                    port: this.config.database.port,
                    enableMonitoring: this.config.enableMonitoring,
                    contextTarget: this.config.readyai.contextRetrievalTarget
                }
            });

            // Initialize core services in dependency order (Cline pattern)
            await this.initializeCoreServices();

            // Initialize ReadyAI-specific services
            await this.initializeReadyAIServices();

            // Start monitoring if enabled
            if (this.config.enableMonitoring) {
                this.startMonitoring();
            }

            // Perform initial health check
            await this.performHealthCheck();

            this.isInitialized = true;
            const duration = performance.now() - startTime;

            this.emit('service-initialized', operationId, duration);
            
            this.logger.info('VectorDatabaseService initialized successfully', {
                operationId,
                duration: `${duration.toFixed(2)}ms`,
                servicesStarted: Array.from(this.serviceHealth.keys())
            });

        } catch (error) {
            const duration = performance.now() - startTime;
            
            await this.errorService.handleError(error as Error, {
                operation: 'initializeVectorDatabaseService',
                operationId,
                severity: 'critical',
                duration
            });

            this.emit('service-initialization-failed', operationId, error, duration);
            
            throw new ReadyAIError(
                `Failed to initialize VectorDatabaseService: ${(error as Error).message}`,
                'SERVICE_INITIALIZATION_FAILED',
                500,
                { originalError: error, operationId, duration }
            );
        }
    }

    /**
     * Create or retrieve a vector collection for a ReadyAI project
     * Project-scoped collection management with ReadyAI context
     */
    public async getOrCreateProjectCollection(
        projectId: UUID,
        config: Partial<VectorCollectionConfig> = {}
    ): Promise<VectorOperationResult<VectorCollection>> {
        this.ensureInitialized();

        const operationId = generateUUID();
        const startTime = performance.now();

        try {
            const context = this.createOperationContext({
                operationId,
                operationType: 'create_collection',
                projectId,
                startTime,
                metadata: { config }
            });

            this.activeOperations.set(operationId, context);

            const collectionName = this.generateProjectCollectionName(projectId);
            
            this.logger.info('Getting or creating project collection', {
                operationId,
                projectId,
                collectionName
            });

            // Check if collection already exists
            const existing = await this.collectionManager.getCollection(collectionName, {
                useCache: true,
                includeStats: true
            });

            if (existing.success && existing.data) {
                const duration = performance.now() - startTime;
                this.updateOperationStats(duration, true);
                
                logContextPerformance('project_collection_retrieval', duration, 1, {
                    operationId,
                    projectId,
                    cached: true
                });

                return {
                    success: true,
                    data: existing.data,
                    metadata: {
                        durationMs: duration,
                        timestamp: createTimestamp(),
                        operationId,
                        cached: true
                    }
                };
            }

            // Create new collection with ReadyAI defaults
            const collectionConfig: VectorCollectionConfig = {
                name: collectionName,
                dimension: config.dimension || 384, // Default for sentence-transformers
                metricType: config.metricType || 'COSINE',
                indexType: config.indexType || 'AUTOINDEX',
                description: `ReadyAI project collection for ${projectId}`,
                ...config
            };

            const result = await this.collectionManager.createCollection(collectionConfig, {
                metadata: { projectId, createdBy: 'VectorDatabaseService' }
            });

            const duration = performance.now() - startTime;
            this.updateOperationStats(duration, result.success);

            if (result.success) {
                logContextPerformance('project_collection_creation', duration, 1, {
                    operationId,
                    projectId,
                    collectionName
                });
            }

            return result;

        } catch (error) {
            const duration = performance.now() - startTime;
            this.updateOperationStats(duration, false);

            await this.errorService.handleError(error as Error, {
                operation: 'getOrCreateProjectCollection',
                operationId,
                projectId,
                severity: 'high'
            });

            return {
                success: false,
                error: {
                    message: (error as Error).message,
                    code: error instanceof ReadyAIError ? error.code : 'COLLECTION_OPERATION_FAILED',
                    timestamp: createTimestamp(),
                    operationId
                },
                metadata: {
                    durationMs: duration,
                    timestamp: createTimestamp(),
                    operationId
                }
            };

        } finally {
            this.activeOperations.delete(operationId);
        }
    }

    /**
     * Perform semantic search across project context
     * Enhanced vector search with ReadyAI context awareness and KPI monitoring
     */
    public async searchProjectContext(
        projectId: UUID,
        query: string,
        config: SemanticSearchConfig = {
            relevanceThreshold: 0.7,
            maxResults: 10,
            strategy: 'hybrid'
        }
    ): Promise<VectorOperationResult<SemanticSearchResult[]>> {
        this.ensureInitialized();

        const operationId = generateUUID();
        const startTime = performance.now();

        try {
            const context = this.createOperationContext({
                operationId,
                operationType: 'search_vectors',
                projectId,
                startTime,
                metadata: { query, config }
            });

            this.activeOperations.set(operationId, context);

            this.logger.debug('Performing semantic search on project context', {
                operationId,
                projectId,
                queryLength: query.length,
                strategy: config.strategy,
                maxResults: config.maxResults
            });

            // Generate embedding for search query
            const embeddingResult = await this.embeddingService.generateEmbeddings({
                texts: [query],
                context: { projectId, operationId, priority: 'high' }
            });

            if (!embeddingResult.success || !embeddingResult.data?.embeddings.length) {
                throw new ReadyAIError(
                    'Failed to generate embedding for search query',
                    'EMBEDDING_GENERATION_FAILED',
                    500,
                    { embeddingError: embeddingResult.error }
                );
            }

            const queryEmbedding = embeddingResult.data.embeddings[0];
            const collectionName = this.generateProjectCollectionName(projectId);

            // Prepare vector search query
            const searchQuery: VectorSearchQuery = {
                collectionName,
                vectors: [queryEmbedding],
                limit: config.maxResults,
                contextFilter: {
                    projectId,
                    phase: config.phase,
                    relevanceThreshold: config.relevanceThreshold
                },
                outputFields: ['metadata'],
                timeout: this.config.readyai.contextRetrievalTarget
            };

            // Execute vector search with performance monitoring
            const searchStartTime = performance.now();
            const searchResult = await this.searchService.searchSimilarVectors(searchQuery);
            const searchDuration = performance.now() - searchStartTime;

            if (!searchResult.success) {
                throw new ReadyAIError(
                    'Vector search operation failed',
                    'SEARCH_OPERATION_FAILED',
                    500,
                    { searchError: searchResult.error }
                );
            }

            // Transform results to ReadyAI semantic search format
            const semanticResults: SemanticSearchResult[] = (searchResult.data || []).map(result => ({
                contextNode: {
                    id: generateUUID(), // Would be populated from metadata
                    projectId,
                    type: result.entity?.metadata?.contextType || 'file',
                    path: result.entity?.metadata?.filePath || '',
                    content: result.entity?.metadata?.text || '',
                    dependencies: [],
                    dependents: [],
                    relevanceScore: result.score,
                    lastAccessed: createTimestamp(),
                    vectorMetadata: {
                        collectionName,
                        vectorId: result.id,
                        lastEmbedded: result.entity?.metadata?.updatedAt || createTimestamp(),
                        embeddingVersion: '1.0'
                    }
                },
                score: result.score,
                snippet: result.entity?.metadata?.text?.substring(0, 200),
                explanation: `Semantic match with ${(result.score * 100).toFixed(1)}% similarity`
            }));

            const totalDuration = performance.now() - startTime;
            this.updateOperationStats(totalDuration, true);
            
            // Track context retrieval performance for ReadyAI KPI
            logContextPerformance('semantic_search', totalDuration, semanticResults.length, {
                operationId,
                projectId,
                strategy: config.strategy,
                searchDuration,
                exceedsKpiTarget: totalDuration > this.config.readyai.contextRetrievalTarget
            });

            this.logger.info('Semantic search completed successfully', {
                operationId,
                projectId,
                resultsCount: semanticResults.length,
                duration: `${totalDuration.toFixed(2)}ms`,
                kpiCompliant: totalDuration <= this.config.readyai.contextRetrievalTarget
            });

            return {
                success: true,
                data: semanticResults,
                metadata: {
                    durationMs: totalDuration,
                    timestamp: createTimestamp(),
                    operationId,
                    affectedCollections: [collectionName]
                },
                performance: {
                    vectorsProcessed: 1,
                    throughputVectorsPerSecond: 1000 / totalDuration,
                    memoryUsedBytes: searchResult.data?.length || 0 * 1024, // Estimate
                    diskUsedBytes: 0
                }
            };

        } catch (error) {
            const duration = performance.now() - startTime;
            this.updateOperationStats(duration, false);

            await this.errorService.handleError(error as Error, {
                operation: 'searchProjectContext',
                operationId,
                projectId,
                severity: 'high',
                context: { query: query.substring(0, 100) }
            });

            this.logger.error('Semantic search failed', {
                operationId,
                projectId,
                error: (error as Error).message,
                duration: `${duration.toFixed(2)}ms`
            });

            return {
                success: false,
                error: {
                    message: (error as Error).message,
                    code: error instanceof ReadyAIError ? error.code : 'SEMANTIC_SEARCH_FAILED',
                    timestamp: createTimestamp(),
                    operationId
                },
                metadata: {
                    durationMs: duration,
                    timestamp: createTimestamp(),
                    operationId
                }
            };

        } finally {
            this.activeOperations.delete(operationId);
        }
    }

    /**
     * Add context vectors to project collection
     * Batch vector insertion with ReadyAI context metadata
     */
    public async addProjectContext(
        projectId: UUID,
        contexts: VectorContextNode[]
    ): Promise<VectorOperationResult<{ insertedCount: number; errors: string[] }>> {
        this.ensureInitialized();

        const operationId = generateUUID();
        const startTime = performance.now();

        try {
            const context = this.createOperationContext({
                operationId,
                operationType: 'insert_vectors',
                projectId,
                startTime,
                metadata: { contextCount: contexts.length }
            });

            this.activeOperations.set(operationId, context);

            this.logger.info('Adding context vectors to project', {
                operationId,
                projectId,
                contextCount: contexts.length
            });

            // Ensure project collection exists
            await this.getOrCreateProjectCollection(projectId);

            // Generate embeddings for contexts without them
            const textsToEmbed: string[] = [];
            const contextIndices: number[] = [];

            contexts.forEach((ctx, index) => {
                if (!ctx.embedding) {
                    textsToEmbed.push(ctx.content);
                    contextIndices.push(index);
                }
            });

            if (textsToEmbed.length > 0) {
                const embeddingResult = await this.embeddingService.generateEmbeddings({
                    texts: textsToEmbed,
                    context: { projectId, operationId, priority: 'normal' }
                });

                if (embeddingResult.success && embeddingResult.data?.embeddings) {
                    embeddingResult.data.embeddings.forEach((embedding, i) => {
                        const contextIndex = contextIndices[i];
                        contexts[contextIndex].embedding = embedding;
                    });
                }
            }

            // Prepare vector entities for insertion
            const vectorEntities: VectorEntity[] = contexts.map(ctx => ({
                id: ctx.id,
                vector: ctx.embedding || [],
                metadata: {
                    text: ctx.content,
                    filePath: ctx.path,
                    projectId: ctx.projectId,
                    contextType: ctx.type,
                    relevanceScore: ctx.relevanceScore,
                    createdAt: createTimestamp(),
                    updatedAt: createTimestamp(),
                    dependencies: ctx.dependencies,
                    dependents: ctx.dependents
                }
            }));

            const collectionName = this.generateProjectCollectionName(projectId);
            const insertRequest: VectorInsertRequest = {
                collectionName,
                data: vectorEntities,
                context: { projectId, operationId, phase: context.metadata.phase }
            };

            // Execute batch insertion
            const insertResult = await this.vectorOperations.insertVectors(insertRequest);

            const duration = performance.now() - startTime;
            this.updateOperationStats(duration, insertResult.success);

            if (insertResult.success) {
                logContextPerformance('context_insertion', duration, contexts.length, {
                    operationId,
                    projectId,
                    vectorCount: contexts.length
                });

                this.logger.info('Context vectors added successfully', {
                    operationId,
                    projectId,
                    insertedCount: contexts.length,
                    duration: `${duration.toFixed(2)}ms`
                });

                return {
                    success: true,
                    data: {
                        insertedCount: contexts.length,
                        errors: []
                    },
                    metadata: {
                        durationMs: duration,
                        timestamp: createTimestamp(),
                        operationId,
                        affectedCollections: [collectionName]
                    }
                };
            }

            return insertResult as VectorOperationResult<{ insertedCount: number; errors: string[] }>;

        } catch (error) {
            const duration = performance.now() - startTime;
            this.updateOperationStats(duration, false);

            await this.errorService.handleError(error as Error, {
                operation: 'addProjectContext',
                operationId,
                projectId,
                severity: 'high',
                context: { contextCount: contexts.length }
            });

            return {
                success: false,
                error: {
                    message: (error as Error).message,
                    code: error instanceof ReadyAIError ? error.code : 'CONTEXT_INSERTION_FAILED',
                    timestamp: createTimestamp(),
                    operationId
                },
                metadata: {
                    durationMs: duration,
                    timestamp: createTimestamp(),
                    operationId
                }
            };

        } finally {
            this.activeOperations.delete(operationId);
        }
    }

    /**
     * Get comprehensive database health status
     * Multi-service health monitoring following Cline patterns
     */
    public async getHealthStatus(): Promise<VectorDatabaseHealth> {
        const healthCheckStart = performance.now();

        try {
            await this.performHealthCheck();

            const serviceHealthArray = Array.from(this.serviceHealth.values());
            const isHealthy = serviceHealthArray.every(service => service.isHealthy);

            const health: VectorDatabaseHealth = {
                isHealthy,
                connection: {
                    isConnected: this.milvusConnection?.isConnected || false,
                    connectionCount: 1, // Single connection for now
                    responseTimeMs: performance.now() - healthCheckStart,
                    lastChecked: createTimestamp()
                },
                memory: {
                    totalBytes: process.memoryUsage().heapTotal,
                    usedBytes: process.memoryUsage().heapUsed,
                    availableBytes: process.memoryUsage().heapTotal - process.memoryUsage().heapUsed,
                    utilizationPercent: (process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100
                },
                storage: {
                    totalBytes: 0, // Would need system integration
                    usedBytes: 0,
                    availableBytes: 0,
                    utilizationPercent: 0
                },
                performance: {
                    queriesPerSecond: this.calculateOperationsPerSecond('search'),
                    averageQueryLatencyMs: this.operationStats.averageLatency,
                    insertionsPerSecond: this.calculateOperationsPerSecond('insert'),
                    averageInsertLatencyMs: this.operationStats.averageLatency
                },
                collections: [], // Would be populated from collection manager
                issues: serviceHealthArray
                    .filter(service => !service.isHealthy)
                    .map(service => ({
                        severity: 'error' as const,
                        message: service.error || `${service.name} is unhealthy`,
                        component: service.name,
                        timestamp: createTimestamp()
                    }))
            };

            return health;

        } catch (error) {
            this.logger.error('Failed to get health status', {
                error: (error as Error).message
            });

            return {
                isHealthy: false,
                connection: {
                    isConnected: false,
                    connectionCount: 0,
                    responseTimeMs: performance.now() - healthCheckStart,
                    lastChecked: createTimestamp()
                },
                memory: { totalBytes: 0, usedBytes: 0, availableBytes: 0, utilizationPercent: 0 },
                storage: { totalBytes: 0, usedBytes: 0, availableBytes: 0, utilizationPercent: 0 },
                performance: { queriesPerSecond: 0, averageQueryLatencyMs: 0, insertionsPerSecond: 0, averageInsertLatencyMs: 0 },
                collections: [],
                issues: [{
                    severity: 'critical',
                    message: `Health check failed: ${(error as Error).message}`,
                    component: 'VectorDatabaseService',
                    timestamp: createTimestamp()
                }]
            };
        }
    }

    /**
     * Get performance metrics for monitoring and optimization
     */
    public getPerformanceMetrics(): {
        operations: typeof this.operationStats;
        contextRetrieval: {
            averageTime: number;
            kpiCompliance: number;
            exceedsThresholdCount: number;
        };
        services: ServiceHealthStatus[];
    } {
        const contextRetrievalTimes = this.operationStats.contextRetrievalTimes;
        const exceedsThreshold = contextRetrievalTimes.filter(time => 
            time > this.config.readyai.contextRetrievalTarget
        );

        return {
            operations: { ...this.operationStats },
            contextRetrieval: {
                averageTime: contextRetrievalTimes.length > 0 
                    ? contextRetrievalTimes.reduce((sum, time) => sum + time, 0) / contextRetrievalTimes.length
                    : 0,
                kpiCompliance: contextRetrievalTimes.length > 0 
                    ? ((contextRetrievalTimes.length - exceedsThreshold.length) / contextRetrievalTimes.length) * 100
                    : 100,
                exceedsThresholdCount: exceedsThreshold.length
            },
            services: Array.from(this.serviceHealth.values())
        };
    }

    /**
     * Shutdown the Vector Database Service
     * Graceful cleanup of all services following Cline shutdown patterns
     */
    public async shutdown(): Promise<void> {
        if (!this.isInitialized || this.isShuttingDown) {
            return;
        }

        this.isShuttingDown = true;
        const shutdownStart = performance.now();

        try {
            this.emit('service-shutting-down');
            
            this.logger.info('Shutting down VectorDatabaseService...', {
                activeOperations: this.activeOperations.size
            });

            // Clear monitoring intervals
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
            }
            if (this.metricsInterval) {
                clearInterval(this.metricsInterval);
            }

            // Wait for active operations to complete (max 30 seconds)
            const maxWaitTime = 30000;
            const operationWaitStart = Date.now();
            
            while (this.activeOperations.size > 0 && Date.now() - operationWaitStart < maxWaitTime) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            if (this.activeOperations.size > 0) {
                this.logger.warn('Forced shutdown with active operations', {
                    remainingOperations: this.activeOperations.size
                });
            }

            // Shutdown services in reverse dependency order
            const shutdownServices = [
                { name: 'VectorCache', service: this.vectorCache },
                { name: 'VectorOperations', service: this.vectorOperations },
                { name: 'SearchService', service: this.searchService },
                { name: 'EmbeddingService', service: this.embeddingService },
                { name: 'CollectionManager', service: this.collectionManager },
                { name: 'MilvusConnection', service: this.milvusConnection }
            ];

            for (const { name, service } of shutdownServices) {
                try {
                    if (service && typeof service.shutdown === 'function') {
                        await service.shutdown();
                        this.logger.debug(`${name} shutdown completed`);
                    }
                } catch (error) {
                    this.logger.error(`Error shutting down ${name}`, {
                        error: (error as Error).message
                    });
                }
            }

            this.isInitialized = false;
            const shutdownDuration = performance.now() - shutdownStart;

            this.emit('service-shutdown', shutdownDuration);
            
            this.logger.info('VectorDatabaseService shutdown completed', {
                duration: `${shutdownDuration.toFixed(2)}ms`
            });

        } catch (error) {
            this.logger.error('Error during VectorDatabaseService shutdown', {
                error: (error as Error).message
            });
            throw error;
        }
    }

    // Private Methods - adapted from Cline service orchestration patterns

    private ensureInitialized(): void {
        if (!this.isInitialized) {
            throw new ReadyAIError(
                'VectorDatabaseService not initialized',
                'SERVICE_NOT_INITIALIZED',
                500
            );
        }
        if (this.isShuttingDown) {
            throw new ReadyAIError(
                'VectorDatabaseService is shutting down',
                'SERVICE_SHUTTING_DOWN',
                503
            );
        }
    }

    private async initializeCoreServices(): Promise<void> {
        // Initialize MilvusConnection first
        this.milvusConnection = new MilvusConnection(this.config.database);
        await this.milvusConnection.initialize();
        this.updateServiceHealth('MilvusConnection', true, 0);

        // Initialize CollectionManager
        this.collectionManager = new CollectionManager(this.milvusConnection);
        await this.collectionManager.initialize();
        this.updateServiceHealth('CollectionManager', true, 0);

        // Initialize VectorOperations
        this.vectorOperations = new VectorOperations(this.milvusConnection);
        await this.vectorOperations.initialize();
        this.updateServiceHealth('VectorOperations', true, 0);
    }

    private async initializeReadyAIServices(): Promise<void> {
        // Initialize EmbeddingService if enabled
        if (this.config.services.enableEmbedding) {
            this.embeddingService = new EmbeddingService();
            await this.embeddingService.initialize();
            this.updateServiceHealth('EmbeddingService', true, 0);
        }

        // Initialize SearchService if enabled
        if (this.config.services.enableSearch) {
            this.searchService = new SearchService(this.milvusConnection, this.embeddingService);
            await this.searchService.initialize();
            this.updateServiceHealth('SearchService', true, 0);
        }

        // Initialize VectorCache if enabled
        if (this.config.services.enableCache) {
            this.vectorCache = new VectorCache();
            await this.vectorCache.initialize();
            this.updateServiceHealth('VectorCache', true, 0);
        }
    }

    private startMonitoring(): void {
        // Health check monitoring
        this.healthCheckInterval = setInterval(async () => {
            try {
                await this.performHealthCheck();
            } catch (error) {
                this.logger.error('Health check failed', {
                    error: (error as Error).message
                });
            }
        }, this.config.healthCheckInterval);

        // Performance metrics collection
        this.metricsInterval = setInterval(() => {
            this.collectPerformanceMetrics();
        }, this.config.metricsInterval);
    }

    private async performHealthCheck(): Promise<void> {
        const services = [
            { name: 'MilvusConnection', service: this.milvusConnection },
            { name: 'CollectionManager', service: this.collectionManager },
            { name: 'VectorOperations', service: this.vectorOperations }
        ];

        for (const { name, service } of services) {
            if (service) {
                const checkStart = performance.now();
                try {
                    // Call health check method if available, otherwise assume healthy
                    const isHealthy = typeof service.isHealthy === 'function' ? 
                        await service.isHealthy() : true;
                    
                    const responseTime = performance.now() - checkStart;
                    this.updateServiceHealth(name, isHealthy, responseTime);
                } catch (error) {
                    const responseTime = performance.now() - checkStart;
                    this.updateServiceHealth(name, false, responseTime, (error as Error).message);
                }
            }
        }
    }

    private updateServiceHealth(
        serviceName: string, 
        isHealthy: boolean, 
        responseTimeMs: number, 
        error?: string
    ): void {
        this.serviceHealth.set(serviceName, {
            name: serviceName,
            isHealthy,
            lastChecked: createTimestamp(),
            responseTimeMs,
            error
        });
    }

    private collectPerformanceMetrics(): void {
        const metrics = this.getPerformanceMetrics();
        
        this.emit('performance-metrics', metrics);
        
        // Log performance alerts if KPI thresholds exceeded
        if (metrics.contextRetrieval.kpiCompliance < 90) {
            this.logger.warn('Context retrieval KPI compliance below threshold', {
                compliance: `${metrics.contextRetrieval.kpiCompliance.toFixed(1)}%`,
                averageTime: `${metrics.contextRetrieval.averageTime.toFixed(2)}ms`,
                target: `${this.config.readyai.contextRetrievalTarget}ms`
            });
        }
    }

    private createOperationContext(params: {
        operationId: UUID;
        operationType: VectorOperationType;
        projectId?: UUID;
        startTime: number;
        metadata: Record<string, any>;
    }): ServiceOperationContext {
        return {
            operationId: params.operationId,
            operationType: params.operationType,
            projectId: params.projectId,
            startedServices: new Set(),
            startTime: params.startTime,
            metadata: params.metadata
        };
    }

    private generateProjectCollectionName(projectId: UUID): string {
        return `${this.config.readyai.collectionPrefix}${projectId.replace(/-/g, '_')}`;
    }

    private updateOperationStats(duration: number, success: boolean): void {
        this.operationStats.totalOperations++;
        
        if (success) {
            this.operationStats.successfulOperations++;
        } else {
            this.operationStats.failedOperations++;
        }

        // Update rolling average latency
        const totalSuccessful = this.operationStats.successfulOperations;
        if (totalSuccessful === 1) {
            this.operationStats.averageLatency = duration;
        } else {
            this.operationStats.averageLatency = 
                (this.operationStats.averageLatency * (totalSuccessful - 1) + duration) / totalSuccessful;
        }

        // Track context retrieval times for KPI monitoring
        this.operationStats.contextRetrievalTimes.push(duration);
        
        // Keep only last 100 measurements for rolling analysis
        if (this.operationStats.contextRetrievalTimes.length > 100) {
            this.operationStats.contextRetrievalTimes.shift();
        }
    }

    private calculateOperationsPerSecond(operationType: 'search' | 'insert'): number {
        // Simplified calculation - in production would track per operation type
        const recentOperations = Math.min(this.operationStats.totalOperations, 60);
        return recentOperations / 60; // Assume 60-second window
    }

    private setupErrorHandlers(): void {
        // Handle uncaught exceptions in service context
        process.on('uncaughtException', (error) => {
            this.logger.error('Uncaught exception in VectorDatabaseService', {
                error: error.message,
                stack: error.stack
            });
        });

        process.on('unhandledRejection', (reason, promise) => {
            this.logger.error('Unhandled rejection in VectorDatabaseService', {
                reason,
                promise
            });
        });

        // Graceful shutdown on process signals
        process.on('SIGTERM', () => {
            this.logger.info('Received SIGTERM, initiating graceful shutdown...');
            this.shutdown().catch(error => {
                this.logger.error('Error during graceful shutdown', {
                    error: (error as Error).message
                });
            });
        });

        process.on('SIGINT', () => {
            this.logger.info('Received SIGINT, initiating graceful shutdown...');
            this.shutdown().catch(error => {
                this.logger.error('Error during graceful shutdown', {
                    error: (error as Error).message
                });
            });
        });
    }
}

/**
 * Export configuration and service class
 */
export type {
    VectorDatabaseServiceConfig,
    ServiceOperationContext,
    ServiceHealthStatus
};

export { DEFAULT_SERVICE_CONFIG };

/**
 * Default service instance for convenient access
 */
export const vectorDatabaseService = new VectorDatabaseService();

export default VectorDatabaseService;
