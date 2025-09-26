// packages/vectordb/services/VectorOperations.ts

/**
 * Vector Operations Service for ReadyAI Personal AI Development Orchestrator
 * 
 * This module implements comprehensive vector CRUD and batch operations, leveraging Cline's 
 * proven batch operations patterns with 60% pattern replication while extending with 
 * ReadyAI-specific vector database functionality and performance optimization.
 * 
 * Key Adaptations from Cline:
 * - Batch processing patterns from Cline's bulk operation management
 * - Error handling and retry mechanisms from Cline's production-tested patterns
 * - Performance monitoring from Cline's comprehensive telemetry system
 * - Resource management from Cline's efficient cleanup patterns
 * - Operation context tracking from Cline's operation management
 * 
 * ReadyAI Extensions:
 * - Milvus-specific vector operations and optimization
 * - Project-aware vector management with context isolation
 * - Advanced batch processing for vector embeddings
 * - Integration with ReadyAI's logging and configuration systems
 * 
 * @version 1.0.0
 * @author ReadyAI Development Team
 */

import { EventEmitter } from 'events';
import { MilvusClient } from '@zilliz/milvus2-sdk-node';

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
    ValidationResult
} from '../../../foundation/types/core';

// Vector Database Types
import {
    VectorDatabaseConfig,
    VectorSearchQuery,
    VectorSearchResult,
    VectorInsertRequest,
    VectorEntity,
    VectorOperationResult,
    BatchVectorOperationResult,
    VectorPerformanceMetrics,
    VectorDatabaseHealth,
    VECTOR_SIMILARITY_METRICS,
    VECTOR_INDEX_TYPES,
    DEFAULT_VECTOR_CONFIG
} from '../types/vectordb';

// Service Dependencies
import { CollectionManager } from './CollectionManager';
import { Logger } from '../../logging/services/Logger';
import { ErrorService } from '../../logging/services/ErrorService';

/**
 * Vector operation context for tracking and monitoring
 * Adapted from Cline's operation context patterns
 */
interface VectorOperationContext {
    operationId: UUID;
    operationType: 'insert' | 'update' | 'delete' | 'search' | 'batch';
    collectionName: string;
    projectId?: UUID;
    startTime: number;
    vectorCount: number;
    metadata?: Record<string, any>;
}

/**
 * Batch operation configuration
 * Enhanced with ReadyAI-specific batch processing settings
 */
interface BatchOperationConfig {
    // Batch size for processing
    batchSize: number;
    // Maximum concurrent operations
    maxConcurrency: number;
    // Retry configuration
    retry: {
        attempts: number;
        backoffMs: number;
    };
    // Performance thresholds
    performance: {
        maxLatencyMs: number;
        maxMemoryMB: number;
    };
}

/**
 * Vector operation performance metrics
 * Adapted from Cline's performance tracking patterns
 */
interface VectorOperationMetrics {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    averageLatencyMs: number;
    lastOperationTime: number;
    throughputVectorsPerSecond: number;
    cacheHitRatio: number;
}

/**
 * Vector Operations Configuration
 * Enhanced with ReadyAI-specific settings
 */
export interface VectorOperationsConfig {
    // Enable operation result caching
    enableCaching: boolean;
    // Cache TTL in milliseconds
    cacheTtl: number;
    // Maximum number of cached results
    maxCachedResults: number;
    // Default batch configuration
    defaultBatch: BatchOperationConfig;
    // Performance monitoring settings
    monitoring: {
        enableMetrics: boolean;
        metricsInterval: number;
    };
}

/**
 * Default Vector Operations configuration
 * Optimized for ReadyAI vector processing
 */
const DEFAULT_VECTOR_OPERATIONS_CONFIG: VectorOperationsConfig = {
    enableCaching: true,
    cacheTtl: 600000, // 10 minutes
    maxCachedResults: 1000,
    defaultBatch: {
        batchSize: 100,
        maxConcurrency: 5,
        retry: {
            attempts: 3,
            backoffMs: 1000
        },
        performance: {
            maxLatencyMs: 30000,
            maxMemoryMB: 512
        }
    },
    monitoring: {
        enableMetrics: true,
        metricsInterval: 60000 // 1 minute
    }
};

/**
 * Vector Operations Service
 * 
 * Manages vector CRUD operations and batch processing with comprehensive performance
 * optimization and ReadyAI-specific functionality. Adapts Cline's proven batch operation
 * patterns while extending for vector database requirements.
 */
export class VectorOperations extends EventEmitter {
    private readonly config: VectorOperationsConfig;
    private readonly collectionManager: CollectionManager;
    private readonly logger: Logger;
    private readonly errorService: ErrorService;
    private isInitialized = false;

    // Operation result cache following Cline patterns
    private readonly operationCache = new Map<string, {
        result: any;
        timestamp: number;
        hitCount: number;
    }>();

    // Performance tracking - adapted from Cline patterns
    private readonly performanceMetrics: VectorOperationMetrics = {
        totalOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        averageLatencyMs: 0,
        lastOperationTime: 0,
        throughputVectorsPerSecond: 0,
        cacheHitRatio: 0
    };

    // Active operations tracking
    private readonly activeOperations = new Map<UUID, VectorOperationContext>();

    // Monitoring interval
    private metricsInterval?: NodeJS.Timeout;

    constructor(
        collectionManager: CollectionManager,
        config?: Partial<VectorOperationsConfig>
    ) {
        super();

        this.config = { ...DEFAULT_VECTOR_OPERATIONS_CONFIG, ...config };
        this.collectionManager = collectionManager;
        this.logger = Logger.getInstance({ source: 'VectorOperations' });
        this.errorService = ErrorService.getInstance();

        // Validate dependencies
        if (!this.collectionManager) {
            throw new ReadyAIError(
                'CollectionManager is required for VectorOperations',
                'INVALID_DEPENDENCY',
                400
            );
        }
    }

    /**
     * Initialize the Vector Operations service
     * Sets up monitoring, caching, and event handlers following Cline initialization patterns
     */
    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            throw new ReadyAIError(
                'VectorOperations is already initialized',
                'ALREADY_INITIALIZED',
                400
            );
        }

        try {
            this.emit('initializing');

            // Ensure CollectionManager is initialized
            if (!this.collectionManager.isInitialized) {
                await this.collectionManager.initialize();
            }

            // Start performance monitoring if enabled
            if (this.config.monitoring.enableMetrics) {
                this.startPerformanceMonitoring();
            }

            // Setup event handlers
            this.setupEventHandlers();

            this.isInitialized = true;
            this.emit('initialized');

            this.logger.info('VectorOperations initialized successfully', {
                caching: this.config.enableCaching,
                monitoring: this.config.monitoring.enableMetrics,
                batchSize: this.config.defaultBatch.batchSize
            });

        } catch (error) {
            this.emit('error', error);
            throw new ReadyAIError(
                `Failed to initialize VectorOperations: ${(error as Error).message}`,
                'INITIALIZATION_FAILED',
                500,
                { originalError: error }
            );
        }
    }

    /**
     * Insert vectors into a collection
     * Comprehensive vector insertion with validation and performance tracking
     * Adapted from Cline's resource creation patterns
     */
    public async insertVectors(
        collectionName: string,
        vectors: VectorInsertRequest[],
        options: {
            partition?: string;
            timeout?: number;
            validate?: boolean;
            metadata?: Record<string, any>;
        } = {}
    ): Promise<VectorOperationResult<string[]>> {
        this.ensureInitialized();

        const operationId = this.generateOperationId();
        const startTime = Date.now();

        try {
            const context: VectorOperationContext = {
                operationId,
                operationType: 'insert',
                collectionName,
                startTime,
                vectorCount: vectors.length,
                metadata: options.metadata
            };

            this.activeOperations.set(operationId, context);
            this.emit('vector-insertion-started', operationId, collectionName, vectors.length);

            this.logger.info('Inserting vectors', {
                operationId,
                collectionName,
                vectorCount: vectors.length,
                partition: options.partition,
                timeout: options.timeout
            });

            // Validate vectors if requested
            if (options.validate) {
                const validation = await this.validateVectors(vectors, collectionName);
                if (!validation.isValid) {
                    throw new ReadyAIError(
                        `Vector validation failed: ${validation.errors.join(', ')}`,
                        'VECTOR_VALIDATION_FAILED',
                        400,
                        { errors: validation.errors, warnings: validation.warnings }
                    );
                }
            }

            // Execute vector insertion via CollectionManager
            const result = await this.collectionManager.milvusConnection.execute(async (client: MilvusClient) => {
                const insertData = vectors.map(vector => ({
                    id: vector.id || this.generateVectorId(),
                    vector: vector.vector,
                    ...vector.metadata
                }));

                return await client.insert({
                    collection_name: collectionName,
                    partition_name: options.partition,
                    data: insertData,
                    timeout: options.timeout
                });
            });

            if (result.error_code !== 'Success') {
                throw new ReadyAIError(
                    `Failed to insert vectors: ${result.reason}`,
                    'VECTOR_INSERT_FAILED',
                    500,
                    { milvusError: result }
                );
            }

            const insertedIds = vectors.map((_, index) => result.IDs.int_id?.data?.[index]?.toString() || `vector_${index}`);
            
            const duration = Date.now() - startTime;
            this.updatePerformanceMetrics(duration, true, vectors.length);

            this.emit('vectors-inserted', operationId, collectionName, insertedIds);

            this.logger.info('Vectors inserted successfully', {
                operationId,
                collectionName,
                insertedCount: insertedIds.length,
                duration
            });

            return {
                success: true,
                data: insertedIds,
                metadata: {
                    durationMs: duration,
                    timestamp: new Date().toISOString(),
                    operationId,
                    affectedCollections: [collectionName],
                    vectorsProcessed: vectors.length
                }
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            this.updatePerformanceMetrics(duration, false, vectors.length);

            await this.errorService.handleError(error as Error, {
                operation: 'insertVectors',
                operationId,
                collectionName,
                vectorCount: vectors.length,
                severity: 'high'
            });

            this.emit('vector-insertion-failed', operationId, error, collectionName);

            this.logger.error('Vector insertion failed', {
                operationId,
                collectionName,
                vectorCount: vectors.length,
                error: (error as Error).message,
                duration
            });

            return {
                success: false,
                error: {
                    message: (error as Error).message,
                    code: error instanceof ReadyAIError ? error.code : 'VECTOR_INSERT_FAILED',
                    timestamp: new Date().toISOString(),
                    operationId
                },
                metadata: {
                    durationMs: duration,
                    timestamp: new Date().toISOString(),
                    operationId,
                    affectedCollections: [collectionName],
                    vectorsProcessed: vectors.length
                }
            };

        } finally {
            this.activeOperations.delete(operationId);
        }
    }

    /**
     * Search vectors in a collection
     * Advanced vector similarity search with caching and performance optimization
     * Following Cline's data retrieval patterns
     */
    public async searchVectors(
        query: VectorSearchQuery,
        options: {
            useCache?: boolean;
            timeout?: number;
        } = {}
    ): Promise<VectorOperationResult<VectorSearchResult[]>> {
        this.ensureInitialized();

        const operationId = this.generateOperationId();
        const startTime = Date.now();

        try {
            // Check cache first if enabled
            const cacheKey = this.generateCacheKey('search', query);
            if (options.useCache !== false && this.config.enableCaching) {
                const cached = this.getCachedResult(cacheKey);
                if (cached) {
                    this.updatePerformanceMetrics(Date.now() - startTime, true, query.vectors.length);
                    
                    return {
                        success: true,
                        data: cached,
                        metadata: {
                            durationMs: Date.now() - startTime,
                            timestamp: new Date().toISOString(),
                            operationId,
                            fromCache: true,
                            vectorsProcessed: query.vectors.length
                        }
                    };
                }
            }

            this.logger.debug('Searching vectors', {
                operationId,
                collectionName: query.collectionName,
                vectorCount: query.vectors.length,
                limit: query.limit,
                filter: query.filter
            });

            // Execute vector search via CollectionManager
            const result = await this.collectionManager.milvusConnection.execute(async (client: MilvusClient) => {
                return await client.search({
                    collection_name: query.collectionName,
                    vectors: query.vectors,
                    search_params: query.searchParams,
                    limit: query.limit,
                    filter: query.filter,
                    output_fields: query.outputFields,
                    timeout: options.timeout
                });
            });

            if (result.error_code !== 'Success') {
                throw new ReadyAIError(
                    `Failed to search vectors: ${result.reason}`,
                    'VECTOR_SEARCH_FAILED',
                    500,
                    { milvusError: result }
                );
            }

            // Process search results
            const searchResults: VectorSearchResult[] = result.results.map((resultSet: any, queryIndex: number) => 
                resultSet.map((item: any) => ({
                    id: item.id.toString(),
                    score: item.score,
                    metadata: item.entity || {}
                }))
            ).flat();

            // Cache the results
            if (this.config.enableCaching) {
                this.cacheResult(cacheKey, searchResults);
            }

            const duration = Date.now() - startTime;
            this.updatePerformanceMetrics(duration, true, query.vectors.length);

            return {
                success: true,
                data: searchResults,
                metadata: {
                    durationMs: duration,
                    timestamp: new Date().toISOString(),
                    operationId,
                    fromCache: false,
                    vectorsProcessed: query.vectors.length,
                    resultsReturned: searchResults.length
                }
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            this.updatePerformanceMetrics(duration, false, query.vectors.length);

            await this.errorService.handleError(error as Error, {
                operation: 'searchVectors',
                operationId,
                collectionName: query.collectionName,
                severity: 'medium'
            });

            return {
                success: false,
                error: {
                    message: (error as Error).message,
                    code: error instanceof ReadyAIError ? error.code : 'VECTOR_SEARCH_FAILED',
                    timestamp: new Date().toISOString(),
                    operationId
                },
                metadata: {
                    durationMs: duration,
                    timestamp: new Date().toISOString(),
                    operationId,
                    vectorsProcessed: query.vectors.length
                }
            };
        }
    }

    /**
     * Delete vectors from a collection
     * Comprehensive vector deletion with safety checks
     * Adapted from Cline's resource deletion patterns
     */
    public async deleteVectors(
        collectionName: string,
        vectorIds: string[],
        options: {
            partition?: string;
            timeout?: number;
        } = {}
    ): Promise<VectorOperationResult<number>> {
        this.ensureInitialized();

        const operationId = this.generateOperationId();
        const startTime = Date.now();

        try {
            const context: VectorOperationContext = {
                operationId,
                operationType: 'delete',
                collectionName,
                startTime,
                vectorCount: vectorIds.length
            };

            this.activeOperations.set(operationId, context);
            this.emit('vector-deletion-started', operationId, collectionName, vectorIds.length);

            this.logger.info('Deleting vectors', {
                operationId,
                collectionName,
                vectorCount: vectorIds.length,
                partition: options.partition
            });

            // Execute vector deletion via CollectionManager
            const result = await this.collectionManager.milvusConnection.execute(async (client: MilvusClient) => {
                return await client.deleteEntities({
                    collection_name: collectionName,
                    partition_name: options.partition,
                    ids: vectorIds,
                    timeout: options.timeout
                });
            });

            if (result.error_code !== 'Success') {
                throw new ReadyAIError(
                    `Failed to delete vectors: ${result.reason}`,
                    'VECTOR_DELETE_FAILED',
                    500,
                    { milvusError: result }
                );
            }

            const deletedCount = result.delete_cnt || vectorIds.length;
            
            const duration = Date.now() - startTime;
            this.updatePerformanceMetrics(duration, true, vectorIds.length);

            this.emit('vectors-deleted', operationId, collectionName, deletedCount);

            this.logger.info('Vectors deleted successfully', {
                operationId,
                collectionName,
                deletedCount,
                duration
            });

            return {
                success: true,
                data: deletedCount,
                metadata: {
                    durationMs: duration,
                    timestamp: new Date().toISOString(),
                    operationId,
                    affectedCollections: [collectionName],
                    vectorsProcessed: vectorIds.length
                }
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            this.updatePerformanceMetrics(duration, false, vectorIds.length);

            await this.errorService.handleError(error as Error, {
                operation: 'deleteVectors',
                operationId,
                collectionName,
                severity: 'high'
            });

            return {
                success: false,
                error: {
                    message: (error as Error).message,
                    code: error instanceof ReadyAIError ? error.code : 'VECTOR_DELETE_FAILED',
                    timestamp: new Date().toISOString(),
                    operationId
                },
                metadata: {
                    durationMs: duration,
                    timestamp: new Date().toISOString(),
                    operationId,
                    vectorsProcessed: vectorIds.length
                }
            };

        } finally {
            this.activeOperations.delete(operationId);
        }
    }

    /**
     * Batch vector operations
     * High-performance batch processing with concurrent execution
     * Adapted from Cline's batch operation patterns
     */
    public async batchOperations(
        operations: Array<{
            type: 'insert' | 'update' | 'delete' | 'search';
            collectionName: string;
            data: any;
            options?: any;
        }>,
        config?: Partial<BatchOperationConfig>
    ): Promise<BatchVectorOperationResult> {
        this.ensureInitialized();

        const operationId = this.generateOperationId();
        const startTime = Date.now();
        const batchConfig = { ...this.config.defaultBatch, ...config };

        try {
            this.logger.info('Starting batch vector operations', {
                operationId,
                operationCount: operations.length,
                batchSize: batchConfig.batchSize,
                maxConcurrency: batchConfig.maxConcurrency
            });

            const results: VectorOperationResult<any>[] = [];
            const errors: any[] = [];
            let successfulOperations = 0;
            let failedOperations = 0;

            // Process operations in batches with concurrency control
            for (let i = 0; i < operations.length; i += batchConfig.batchSize) {
                const batch = operations.slice(i, i + batchConfig.batchSize);
                const batchPromises = batch.map(async (operation, index) => {
                    try {
                        let result: VectorOperationResult<any>;
                        
                        switch (operation.type) {
                            case 'insert':
                                result = await this.insertVectors(
                                    operation.collectionName,
                                    operation.data,
                                    operation.options
                                );
                                break;
                            case 'search':
                                result = await this.searchVectors(
                                    operation.data,
                                    operation.options
                                );
                                break;
                            case 'delete':
                                result = await this.deleteVectors(
                                    operation.collectionName,
                                    operation.data,
                                    operation.options
                                );
                                break;
                            default:
                                throw new ReadyAIError(
                                    `Unsupported operation type: ${operation.type}`,
                                    'UNSUPPORTED_OPERATION',
                                    400
                                );
                        }

                        if (result.success) {
                            successfulOperations++;
                        } else {
                            failedOperations++;
                            if (result.error) {
                                errors.push(result.error);
                            }
                        }

                        return result;
                    } catch (error) {
                        failedOperations++;
                        const errorResult: VectorOperationResult<any> = {
                            success: false,
                            error: {
                                message: (error as Error).message,
                                code: 'BATCH_OPERATION_FAILED',
                                timestamp: new Date().toISOString()
                            }
                        };
                        errors.push(errorResult.error);
                        return errorResult;
                    }
                });

                // Execute batch with concurrency limit
                const batchResults = await this.executeConcurrentOperations(
                    batchPromises,
                    batchConfig.maxConcurrency
                );
                
                results.push(...batchResults);
            }

            const totalDuration = Date.now() - startTime;
            const averageDuration = totalDuration / operations.length;

            this.logger.info('Batch vector operations completed', {
                operationId,
                totalOperations: operations.length,
                successfulOperations,
                failedOperations,
                totalDuration,
                averageDuration
            });

            return {
                success: failedOperations === 0,
                results,
                stats: {
                    totalOperations: operations.length,
                    successfulOperations,
                    failedOperations,
                    totalDurationMs: totalDuration,
                    averageDurationMs: averageDuration
                },
                firstError: errors.length > 0 ? errors[0] : undefined,
                errors
            };

        } catch (error) {
            this.logger.error('Batch vector operations failed', {
                operationId,
                error: (error as Error).message
            });

            return {
                success: false,
                results: [],
                stats: {
                    totalOperations: operations.length,
                    successfulOperations: 0,
                    failedOperations: operations.length,
                    totalDurationMs: Date.now() - startTime,
                    averageDurationMs: 0
                },
                firstError: {
                    message: (error as Error).message,
                    code: 'BATCH_OPERATION_FAILED',
                    timestamp: new Date().toISOString()
                },
                errors: [{
                    message: (error as Error).message,
                    code: 'BATCH_OPERATION_FAILED',
                    timestamp: new Date().toISOString()
                }]
            };
        }
    }

    /**
     * Clear operation cache
     * Utility method for cache management
     */
    public clearCache(): void {
        this.operationCache.clear();
        this.logger.debug('Vector operations cache cleared');
    }

    /**
     * Get performance metrics
     * Returns current performance statistics following Cline patterns
     */
    public getPerformanceMetrics(): VectorOperationMetrics {
        return { ...this.performanceMetrics };
    }

    /**
     * Shutdown the Vector Operations service
     * Graceful cleanup following Cline shutdown patterns
     */
    public async shutdown(): Promise<void> {
        if (!this.isInitialized) {
            return;
        }

        try {
            this.emit('shutting-down');

            // Clear monitoring interval
            if (this.metricsInterval) {
                clearInterval(this.metricsInterval);
            }

            // Wait for active operations to complete
            const activeOps = Array.from(this.activeOperations.keys());
            if (activeOps.length > 0) {
                this.logger.info('Waiting for active operations to complete...', {
                    activeOperations: activeOps.length
                });

                // Wait up to 30 seconds for operations to complete
                const timeout = 30000;
                const startTime = Date.now();

                while (this.activeOperations.size > 0 && Date.now() - startTime < timeout) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                if (this.activeOperations.size > 0) {
                    this.logger.warn('Forced shutdown with active operations', {
                        remainingOperations: this.activeOperations.size
                    });
                }
            }

            // Clear cache
            this.clearCache();

            this.isInitialized = false;
            this.emit('shutdown');

            this.logger.info('VectorOperations shutdown completed');

        } catch (error) {
            this.logger.error('Error during VectorOperations shutdown', {
                error: (error as Error).message
            });

            throw error;
        }
    }

    // Private Methods - adapted from Cline patterns

    private ensureInitialized(): void {
        if (!this.isInitialized) {
            throw new ReadyAIError(
                'VectorOperations not initialized',
                'NOT_INITIALIZED',
                500
            );
        }
    }

    private generateOperationId(): UUID {
        return require('crypto').randomUUID() as UUID;
    }

    private generateVectorId(): string {
        return `vec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private generateCacheKey(operation: string, data: any): string {
        return `${operation}_${require('crypto').createHash('md5').update(JSON.stringify(data)).digest('hex')}`;
    }

    private getCachedResult(key: string): any | null {
        if (!this.config.enableCaching) return null;

        const cached = this.operationCache.get(key);
        if (!cached) return null;

        // Check TTL
        if (Date.now() - cached.timestamp > this.config.cacheTtl) {
            this.operationCache.delete(key);
            return null;
        }

        // Update hit count
        cached.hitCount++;
        return cached.result;
    }

    private cacheResult(key: string, result: any): void {
        if (!this.config.enableCaching) return;

        // Evict old entries if cache is full
        if (this.operationCache.size >= this.config.maxCachedResults) {
            const oldestKey = this.operationCache.keys().next().value;
            this.operationCache.delete(oldestKey);
        }

        this.operationCache.set(key, {
            result,
            timestamp: Date.now(),
            hitCount: 0
        });
    }

    private async validateVectors(vectors: VectorInsertRequest[], collectionName: string): Promise<ValidationResult> {
        const validation: ValidationResult = {
            isValid: true,
            errors: [],
            warnings: [],
            recommendations: []
        };

        // Basic validation
        if (vectors.length === 0) {
            validation.errors.push('No vectors provided for insertion');
        }

        // Validate vector dimensions (would need collection info)
        // This is a simplified validation - in production would check against collection schema
        for (let i = 0; i < vectors.length; i++) {
            const vector = vectors[i];
            if (!vector.vector || !Array.isArray(vector.vector)) {
                validation.errors.push(`Vector at index ${i} has invalid vector data`);
            }
        }

        validation.isValid = validation.errors.length === 0;
        return validation;
    }

    private async executeConcurrentOperations<T>(
        operations: Promise<T>[],
        maxConcurrency: number
    ): Promise<T[]> {
        const results: T[] = [];
        
        for (let i = 0; i < operations.length; i += maxConcurrency) {
            const batch = operations.slice(i, i + maxConcurrency);
            const batchResults = await Promise.all(batch);
            results.push(...batchResults);
        }

        return results;
    }

    private updatePerformanceMetrics(duration: number, success: boolean, vectorCount: number = 1): void {
        this.performanceMetrics.totalOperations++;
        this.performanceMetrics.lastOperationTime = duration;

        if (success) {
            this.performanceMetrics.successfulOperations++;
        } else {
            this.performanceMetrics.failedOperations++;
        }

        // Calculate averages
        this.performanceMetrics.averageLatencyMs = 
            (this.performanceMetrics.averageLatencyMs * (this.performanceMetrics.totalOperations - 1) + duration) / 
            this.performanceMetrics.totalOperations;

        // Calculate throughput
        this.performanceMetrics.throughputVectorsPerSecond = vectorCount / (duration / 1000);

        // Calculate cache hit ratio
        const totalCacheAccess = Array.from(this.operationCache.values()).reduce((sum, entry) => sum + entry.hitCount, 0);
        this.performanceMetrics.cacheHitRatio = totalCacheAccess > 0 ? 
            totalCacheAccess / (totalCacheAccess + this.performanceMetrics.totalOperations) : 0;
    }

    private startPerformanceMonitoring(): void {
        this.metricsInterval = setInterval(() => {
            this.emit('performance-metrics', this.getPerformanceMetrics());
        }, this.config.monitoring.metricsInterval);
    }

    private setupEventHandlers(): void {
        // Handle process signals for graceful shutdown
        process.on('SIGTERM', () => this.shutdown());
        process.on('SIGINT', () => this.shutdown());
    }
}

/**
 * Export types and utilities
 */
export type {
    VectorOperationsConfig,
    VectorOperationContext,
    VectorOperationMetrics,
    BatchOperationConfig
};

export { DEFAULT_VECTOR_OPERATIONS_CONFIG };

export default VectorOperations;
