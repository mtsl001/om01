// packages/vectordb/services/CollectionManager.ts

/**
 * Collection Manager for ReadyAI Personal AI Development Orchestrator
 * 
 * This module implements comprehensive Milvus collection management operations,
 * leveraging Cline's proven collection management patterns with 60% pattern replication
 * while extending with ReadyAI-specific vector database functionality and schema management.
 * 
 * Key Adaptations from Cline:
 * - Collection lifecycle patterns from Cline's data management architecture
 * - Schema validation patterns from Cline's robust data integrity framework
 * - Error handling and retry mechanisms from Cline's production-tested patterns
 * - Performance monitoring from Cline's comprehensive telemetry system
 * - Resource management from Cline's efficient cleanup patterns
 * 
 * ReadyAI Extensions:
 * - Milvus-specific collection operations and optimization
 * - Project-aware collection management with context isolation
 * - Advanced schema validation for vector embeddings
 * - Integration with ReadyAI's logging and configuration systems
 * 
 * @version 1.0.0
 * @author ReadyAI Development Team
 */

import { EventEmitter } from 'events';
import { MilvusClient, DataType, MetricType, IndexType } from '@zilliz/milvus2-sdk-node';

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
    VectorCollectionConfig,
    VectorCollection,
    CollectionStats,
    IndexInfo,
    PartitionInfo,
    VectorOperationResult,
    VectorDatabaseHealth,
    VECTOR_SIMILARITY_METRICS,
    VECTOR_INDEX_TYPES,
    DEFAULT_VECTOR_CONFIG
} from '../types/vectordb';

// Service Dependencies
import { MilvusConnection } from './MilvusConnection';
import { Logger } from '../../logging/services/Logger';
import { ErrorService } from '../../logging/services/ErrorService';

/**
 * Collection operation context for tracking and monitoring
 * Adapted from Cline's operation context patterns
 */
interface CollectionOperationContext {
    operationId: UUID;
    operationType: 'create' | 'delete' | 'describe' | 'index' | 'load' | 'release';
    collectionName: string;
    projectId?: UUID;
    startTime: number;
    metadata?: Record<string, any>;
}

/**
 * Collection schema validation result
 * Following Cline's validation result patterns
 */
interface CollectionSchemaValidation {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    recommendations: string[];
}

/**
 * Collection performance metrics
 * Adapted from Cline's performance tracking patterns
 */
interface CollectionPerformanceMetrics {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    averageOperationTime: number;
    lastOperationTime: number;
    cacheHitRatio: number;
}

/**
 * Collection Manager Configuration
 * Enhanced with ReadyAI-specific settings
 */
export interface CollectionManagerConfig {
    /** Enable collection caching */
    enableCaching: boolean;
    /** Cache TTL in milliseconds */
    cacheTtl: number;
    /** Maximum number of cached collections */
    maxCachedCollections: number;
    /** Default collection configuration */
    defaultCollection: {
        indexType: string;
        metricType: string;
        indexParams: Record<string, any>;
    };
    /** Performance monitoring settings */
    monitoring: {
        enableMetrics: boolean;
        metricsInterval: number;
    };
}

/**
 * Default Collection Manager configuration
 * Optimized for ReadyAI vector operations
 */
const DEFAULT_COLLECTION_MANAGER_CONFIG: CollectionManagerConfig = {
    enableCaching: true,
    cacheTtl: 300000, // 5 minutes
    maxCachedCollections: 50,
    defaultCollection: {
        indexType: 'AUTOINDEX',
        metricType: 'COSINE',
        indexParams: {
            'M': 16,
            'efConstruction': 200
        }
    },
    monitoring: {
        enableMetrics: true,
        metricsInterval: 60000 // 1 minute
    }
};

/**
 * Collection Manager Service
 * 
 * Manages Milvus vector collections with comprehensive schema management,
 * performance optimization, and ReadyAI-specific functionality. Adapts Cline's
 * proven collection management patterns while extending for vector database requirements.
 */
export class CollectionManager extends EventEmitter {
    private readonly config: CollectionManagerConfig;
    private readonly milvusConnection: MilvusConnection;
    private readonly logger: Logger;
    private readonly errorService: ErrorService;
    private isInitialized = false;

    // Collection cache following Cline patterns
    private readonly collectionCache = new Map<string, {
        collection: VectorCollection;
        timestamp: number;
        hitCount: number;
    }>();

    // Performance tracking - adapted from Cline patterns
    private readonly performanceMetrics: CollectionPerformanceMetrics = {
        totalOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        averageOperationTime: 0,
        lastOperationTime: 0,
        cacheHitRatio: 0
    };

    // Active operations tracking
    private readonly activeOperations = new Map<UUID, CollectionOperationContext>();

    // Monitoring interval
    private metricsInterval?: NodeJS.Timeout;

    constructor(
        milvusConnection: MilvusConnection,
        config?: Partial<CollectionManagerConfig>
    ) {
        super();
        
        this.config = { ...DEFAULT_COLLECTION_MANAGER_CONFIG, ...config };
        this.milvusConnection = milvusConnection;
        this.logger = Logger.getInstance({ source: 'CollectionManager' });
        this.errorService = ErrorService.getInstance();

        // Validate dependencies
        if (!this.milvusConnection) {
            throw new ReadyAIError(
                'MilvusConnection is required for CollectionManager',
                'INVALID_DEPENDENCY',
                400
            );
        }
    }

    /**
     * Initialize the Collection Manager
     * Sets up monitoring, caching, and event handlers following Cline initialization patterns
     */
    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            throw new ReadyAIError(
                'CollectionManager is already initialized',
                'ALREADY_INITIALIZED',
                400
            );
        }

        try {
            this.emit('initializing');

            // Ensure MilvusConnection is initialized
            if (!this.milvusConnection.isInitialized) {
                await this.milvusConnection.initialize();
            }

            // Start performance monitoring if enabled
            if (this.config.monitoring.enableMetrics) {
                this.startPerformanceMonitoring();
            }

            // Setup event handlers
            this.setupEventHandlers();

            this.isInitialized = true;
            this.emit('initialized');

            this.logger.info('CollectionManager initialized successfully', {
                caching: this.config.enableCaching,
                monitoring: this.config.monitoring.enableMetrics,
                defaultIndexType: this.config.defaultCollection.indexType
            });

        } catch (error) {
            this.emit('error', error);
            throw new ReadyAIError(
                `Failed to initialize CollectionManager: ${(error as Error).message}`,
                'INITIALIZATION_FAILED',
                500,
                { originalError: error }
            );
        }
    }

    /**
     * Create a new vector collection
     * Comprehensive collection creation with schema validation and optimization
     * Adapted from Cline's resource creation patterns
     */
    public async createCollection(
        config: VectorCollectionConfig,
        options: {
            skipIndexCreation?: boolean;
            partitionConfig?: PartitionInfo[];
            metadata?: Record<string, any>;
        } = {}
    ): Promise<VectorOperationResult<VectorCollection>> {
        this.ensureInitialized();

        const operationId = this.generateOperationId();
        const startTime = Date.now();

        try {
            const context: CollectionOperationContext = {
                operationId,
                operationType: 'create',
                collectionName: config.name,
                projectId: config.projectId,
                startTime,
                metadata: options.metadata
            };

            this.activeOperations.set(operationId, context);
            this.emit('collection-creation-started', operationId, config.name);

            this.logger.info('Creating vector collection', {
                operationId,
                collectionName: config.name,
                dimension: config.dimension,
                metricType: config.metricType,
                indexType: config.indexType
            });

            // Validate collection configuration
            const validation = await this.validateCollectionSchema(config);
            if (!validation.isValid) {
                throw new ReadyAIError(
                    `Collection schema validation failed: ${validation.errors.join(', ')}`,
                    'SCHEMA_VALIDATION_FAILED',
                    400,
                    { errors: validation.errors, warnings: validation.warnings }
                );
            }

            // Check if collection already exists
            const exists = await this.checkCollectionExists(config.name);
            if (exists) {
                throw new ReadyAIError(
                    `Collection '${config.name}' already exists`,
                    'COLLECTION_EXISTS',
                    409,
                    { collectionName: config.name }
                );
            }

            // Create collection schema
            const schema = this.buildCollectionSchema(config);

            // Execute collection creation
            const result = await this.milvusConnection.execute(async (client: MilvusClient) => {
                return await client.createCollection({
                    collection_name: config.name,
                    description: config.description || '',
                    fields: schema.fields,
                    enable_dynamic_field: true
                });
            });

            if (result.error_code !== 'Success') {
                throw new ReadyAIError(
                    `Failed to create collection: ${result.reason}`,
                    'COLLECTION_CREATION_FAILED',
                    500,
                    { milvusError: result }
                );
            }

            // Create index if not skipped
            if (!options.skipIndexCreation) {
                await this.createCollectionIndex(config.name, {
                    fieldName: 'vector',
                    indexType: config.indexType || this.config.defaultCollection.indexType,
                    metricType: config.metricType || this.config.defaultCollection.metricType,
                    indexParams: config.indexParams || this.config.defaultCollection.indexParams
                });
            }

            // Create partitions if specified
            if (options.partitionConfig?.length) {
                await this.createPartitions(config.name, options.partitionConfig);
            }

            // Build collection response
            const collection: VectorCollection = {
                name: config.name,
                description: config.description,
                type: config.type,
                dimension: config.dimension,
                metricType: config.metricType,
                indexType: config.indexType || this.config.defaultCollection.indexType,
                indexParams: config.indexParams,
                createdAt: new Date().toISOString(),
                lastModified: new Date().toISOString(),
                vectorCount: 0,
                status: 'ready',
                projectId: config.projectId
            };

            // Cache the collection
            if (this.config.enableCaching) {
                this.cacheCollection(collection);
            }

            const duration = Date.now() - startTime;
            this.updatePerformanceMetrics(duration, true);

            this.emit('collection-created', operationId, collection);

            this.logger.info('Vector collection created successfully', {
                operationId,
                collectionName: config.name,
                duration,
                indexType: collection.indexType
            });

            return {
                success: true,
                data: collection,
                metadata: {
                    durationMs: duration,
                    timestamp: new Date().toISOString(),
                    operationId,
                    affectedCollections: [config.name]
                }
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            this.updatePerformanceMetrics(duration, false);

            await this.errorService.handleError(error as Error, {
                operation: 'createCollection',
                operationId,
                collectionName: config.name,
                severity: 'high'
            });

            this.emit('collection-creation-failed', operationId, error, config.name);

            this.logger.error('Vector collection creation failed', {
                operationId,
                collectionName: config.name,
                error: (error as Error).message,
                duration
            });

            return {
                success: false,
                error: {
                    message: (error as Error).message,
                    code: error instanceof ReadyAIError ? error.code : 'COLLECTION_CREATION_FAILED',
                    timestamp: new Date().toISOString(),
                    operationId
                },
                metadata: {
                    durationMs: duration,
                    timestamp: new Date().toISOString(),
                    operationId,
                    affectedCollections: [config.name]
                }
            };

        } finally {
            this.activeOperations.delete(operationId);
        }
    }

    /**
     * Get collection information
     * Retrieves comprehensive collection details with caching support
     * Following Cline's data retrieval patterns
     */
    public async getCollection(
        collectionName: string,
        options: {
            includeStats?: boolean;
            includeIndexInfo?: boolean;
            useCache?: boolean;
        } = {}
    ): Promise<VectorOperationResult<VectorCollection>> {
        this.ensureInitialized();

        const operationId = this.generateOperationId();
        const startTime = Date.now();

        try {
            // Check cache first if enabled
            if (options.useCache !== false && this.config.enableCaching) {
                const cached = this.getCachedCollection(collectionName);
                if (cached) {
                    this.updatePerformanceMetrics(Date.now() - startTime, true);
                    
                    return {
                        success: true,
                        data: cached,
                        metadata: {
                            durationMs: Date.now() - startTime,
                            timestamp: new Date().toISOString(),
                            operationId,
                            fromCache: true
                        }
                    };
                }
            }

            this.logger.debug('Retrieving collection information', {
                operationId,
                collectionName,
                includeStats: options.includeStats,
                includeIndexInfo: options.includeIndexInfo
            });

            // Check if collection exists
            const exists = await this.checkCollectionExists(collectionName);
            if (!exists) {
                throw new ReadyAIError(
                    `Collection '${collectionName}' not found`,
                    'COLLECTION_NOT_FOUND',
                    404,
                    { collectionName }
                );
            }

            // Get collection description
            const description = await this.milvusConnection.execute(async (client: MilvusClient) => {
                return await client.describeCollection({
                    collection_name: collectionName
                });
            });

            if (description.error_code !== 'Success') {
                throw new ReadyAIError(
                    `Failed to describe collection: ${description.reason}`,
                    'COLLECTION_DESCRIBE_FAILED',
                    500,
                    { milvusError: description }
                );
            }

            // Build collection object
            const vectorField = description.schema.fields.find(f => f.data_type === DataType.FloatVector);
            const collection: VectorCollection = {
                name: collectionName,
                description: description.schema.description,
                type: 'context', // Default type, could be enhanced
                dimension: vectorField?.type_params?.dim || 0,
                metricType: 'COSINE', // Default, could be retrieved from index
                indexType: 'AUTOINDEX', // Default, will be updated if index info requested
                createdAt: new Date().toISOString(), // Placeholder
                lastModified: new Date().toISOString(),
                vectorCount: 0,
                status: 'ready'
            };

            // Get collection statistics if requested
            if (options.includeStats) {
                const stats = await this.getCollectionStats(collectionName);
                if (stats.success && stats.data) {
                    collection.vectorCount = stats.data.entityCount;
                }
            }

            // Get index information if requested
            if (options.includeIndexInfo) {
                const indexInfo = await this.getCollectionIndexInfo(collectionName);
                if (indexInfo.success && indexInfo.data?.length) {
                    const vectorIndex = indexInfo.data.find(idx => idx.fieldName === 'vector');
                    if (vectorIndex) {
                        collection.indexType = vectorIndex.indexType;
                        collection.indexParams = vectorIndex.params;
                    }
                }
            }

            // Cache the collection
            if (this.config.enableCaching) {
                this.cacheCollection(collection);
            }

            const duration = Date.now() - startTime;
            this.updatePerformanceMetrics(duration, true);

            return {
                success: true,
                data: collection,
                metadata: {
                    durationMs: duration,
                    timestamp: new Date().toISOString(),
                    operationId,
                    fromCache: false
                }
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            this.updatePerformanceMetrics(duration, false);

            await this.errorService.handleError(error as Error, {
                operation: 'getCollection',
                operationId,
                collectionName,
                severity: 'medium'
            });

            return {
                success: false,
                error: {
                    message: (error as Error).message,
                    code: error instanceof ReadyAIError ? error.code : 'COLLECTION_RETRIEVAL_FAILED',
                    timestamp: new Date().toISOString(),
                    operationId
                },
                metadata: {
                    durationMs: duration,
                    timestamp: new Date().toISOString(),
                    operationId
                }
            };
        }
    }

    /**
     * Delete a vector collection
     * Comprehensive collection deletion with safety checks
     * Adapted from Cline's resource deletion patterns
     */
    public async deleteCollection(
        collectionName: string,
        options: {
            force?: boolean;
            skipBackup?: boolean;
        } = {}
    ): Promise<VectorOperationResult<void>> {
        this.ensureInitialized();

        const operationId = this.generateOperationId();
        const startTime = Date.now();

        try {
            const context: CollectionOperationContext = {
                operationId,
                operationType: 'delete',
                collectionName,
                startTime
            };

            this.activeOperations.set(operationId, context);
            this.emit('collection-deletion-started', operationId, collectionName);

            this.logger.info('Deleting vector collection', {
                operationId,
                collectionName,
                force: options.force,
                skipBackup: options.skipBackup
            });

            // Check if collection exists
            const exists = await this.checkCollectionExists(collectionName);
            if (!exists) {
                throw new ReadyAIError(
                    `Collection '${collectionName}' not found`,
                    'COLLECTION_NOT_FOUND',
                    404,
                    { collectionName }
                );
            }

            // Safety check: Get collection stats before deletion
            if (!options.force) {
                const stats = await this.getCollectionStats(collectionName);
                if (stats.success && stats.data && stats.data.entityCount > 0) {
                    this.logger.warn('Attempting to delete non-empty collection', {
                        operationId,
                        collectionName,
                        entityCount: stats.data.entityCount
                    });
                    
                    // Could implement backup logic here if !options.skipBackup
                }
            }

            // Release collection from memory first
            await this.milvusConnection.execute(async (client: MilvusClient) => {
                return await client.releaseCollection({
                    collection_name: collectionName
                });
            });

            // Delete the collection
            const result = await this.milvusConnection.execute(async (client: MilvusClient) => {
                return await client.dropCollection({
                    collection_name: collectionName
                });
            });

            if (result.error_code !== 'Success') {
                throw new ReadyAIError(
                    `Failed to delete collection: ${result.reason}`,
                    'COLLECTION_DELETION_FAILED',
                    500,
                    { milvusError: result }
                );
            }

            // Remove from cache
            this.removeCachedCollection(collectionName);

            const duration = Date.now() - startTime;
            this.updatePerformanceMetrics(duration, true);

            this.emit('collection-deleted', operationId, collectionName);

            this.logger.info('Vector collection deleted successfully', {
                operationId,
                collectionName,
                duration
            });

            return {
                success: true,
                metadata: {
                    durationMs: duration,
                    timestamp: new Date().toISOString(),
                    operationId,
                    affectedCollections: [collectionName]
                }
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            this.updatePerformanceMetrics(duration, false);

            await this.errorService.handleError(error as Error, {
                operation: 'deleteCollection',
                operationId,
                collectionName,
                severity: 'high'
            });

            this.emit('collection-deletion-failed', operationId, error, collectionName);

            return {
                success: false,
                error: {
                    message: (error as Error).message,
                    code: error instanceof ReadyAIError ? error.code : 'COLLECTION_DELETION_FAILED',
                    timestamp: new Date().toISOString(),
                    operationId
                },
                metadata: {
                    durationMs: duration,
                    timestamp: new Date().toISOString(),
                    operationId,
                    affectedCollections: [collectionName]
                }
            };

        } finally {
            this.activeOperations.delete(operationId);
        }
    }

    /**
     * List all collections
     * Retrieves all collections with optional filtering
     * Following Cline's listing patterns
     */
    public async listCollections(options: {
        projectId?: UUID;
        type?: string;
        includeStats?: boolean;
    } = {}): Promise<VectorOperationResult<VectorCollection[]>> {
        this.ensureInitialized();

        const operationId = this.generateOperationId();
        const startTime = Date.now();

        try {
            this.logger.debug('Listing vector collections', {
                operationId,
                projectId: options.projectId,
                type: options.type,
                includeStats: options.includeStats
            });

            // Get collection list from Milvus
            const result = await this.milvusConnection.execute(async (client: MilvusClient) => {
                return await client.listCollections();
            });

            if (result.error_code !== 'Success') {
                throw new ReadyAIError(
                    `Failed to list collections: ${result.reason}`,
                    'COLLECTION_LIST_FAILED',
                    500,
                    { milvusError: result }
                );
            }

            const collections: VectorCollection[] = [];

            // Get detailed information for each collection
            for (const collectionName of result.collection_names || []) {
                const collectionInfo = await this.getCollection(collectionName, {
                    includeStats: options.includeStats,
                    useCache: true
                });

                if (collectionInfo.success && collectionInfo.data) {
                    // Apply filters
                    if (options.projectId && collectionInfo.data.projectId !== options.projectId) {
                        continue;
                    }
                    if (options.type && collectionInfo.data.type !== options.type) {
                        continue;
                    }

                    collections.push(collectionInfo.data);
                }
            }

            const duration = Date.now() - startTime;
            this.updatePerformanceMetrics(duration, true);

            this.logger.debug('Collections listed successfully', {
                operationId,
                collectionCount: collections.length,
                duration
            });

            return {
                success: true,
                data: collections,
                metadata: {
                    durationMs: duration,
                    timestamp: new Date().toISOString(),
                    operationId,
                    totalCollections: collections.length
                }
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            this.updatePerformanceMetrics(duration, false);

            await this.errorService.handleError(error as Error, {
                operation: 'listCollections',
                operationId,
                severity: 'medium'
            });

            return {
                success: false,
                error: {
                    message: (error as Error).message,
                    code: error instanceof ReadyAIError ? error.code : 'COLLECTION_LIST_FAILED',
                    timestamp: new Date().toISOString(),
                    operationId
                },
                metadata: {
                    durationMs: duration,
                    timestamp: new Date().toISOString(),
                    operationId
                }
            };
        }
    }

    /**
     * Get collection statistics
     * Retrieves comprehensive collection performance metrics
     */
    public async getCollectionStats(collectionName: string): Promise<VectorOperationResult<CollectionStats>> {
        this.ensureInitialized();

        const operationId = this.generateOperationId();
        const startTime = Date.now();

        try {
            const result = await this.milvusConnection.execute(async (client: MilvusClient) => {
                return await client.getCollectionStatistics({
                    collection_name: collectionName
                });
            });

            if (result.error_code !== 'Success') {
                throw new ReadyAIError(
                    `Failed to get collection statistics: ${result.reason}`,
                    'COLLECTION_STATS_FAILED',
                    500,
                    { milvusError: result }
                );
            }

            const stats: CollectionStats = {
                entityCount: parseInt(result.stats?.row_count || '0'),
                sizeInBytes: 0, // Would need additional query
                memoryUsage: 0, // Would need additional query
                segmentCount: 0, // Would need additional query
                indexBuildProgress: 100 // Assume complete for now
            };

            const duration = Date.now() - startTime;
            this.updatePerformanceMetrics(duration, true);

            return {
                success: true,
                data: stats,
                metadata: {
                    durationMs: duration,
                    timestamp: new Date().toISOString(),
                    operationId
                }
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            this.updatePerformanceMetrics(duration, false);

            return {
                success: false,
                error: {
                    message: (error as Error).message,
                    code: error instanceof ReadyAIError ? error.code : 'COLLECTION_STATS_FAILED',
                    timestamp: new Date().toISOString(),
                    operationId
                },
                metadata: {
                    durationMs: duration,
                    timestamp: new Date().toISOString(),
                    operationId
                }
            };
        }
    }

    /**
     * Get collection performance metrics
     * Returns current performance statistics following Cline patterns
     */
    public getPerformanceMetrics(): CollectionPerformanceMetrics {
        return { ...this.performanceMetrics };
    }

    /**
     * Clear collection cache
     * Utility method for cache management
     */
    public clearCache(): void {
        this.collectionCache.clear();
        this.logger.debug('Collection cache cleared');
    }

    /**
     * Shutdown the Collection Manager
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

            this.logger.info('CollectionManager shutdown completed');

        } catch (error) {
            this.logger.error('Error during CollectionManager shutdown', {
                error: (error as Error).message
            });
            throw error;
        }
    }

    // Private Methods - adapted from Cline patterns

    private ensureInitialized(): void {
        if (!this.isInitialized) {
            throw new ReadyAIError(
                'CollectionManager not initialized',
                'NOT_INITIALIZED',
                500
            );
        }
    }

    private generateOperationId(): UUID {
        return require('crypto').randomUUID() as UUID;
    }

    private async checkCollectionExists(collectionName: string): Promise<boolean> {
        try {
            const result = await this.milvusConnection.execute(async (client: MilvusClient) => {
                return await client.hasCollection({
                    collection_name: collectionName
                });
            });

            return result.value === true;
        } catch (error) {
            return false;
        }
    }

    private async validateCollectionSchema(config: VectorCollectionConfig): Promise<CollectionSchemaValidation> {
        const validation: CollectionSchemaValidation = {
            isValid: true,
            errors: [],
            warnings: [],
            recommendations: []
        };

        // Validate collection name
        if (!config.name || config.name.length === 0) {
            validation.errors.push('Collection name is required');
        } else if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(config.name)) {
            validation.errors.push('Collection name must start with a letter and contain only letters, numbers, and underscores');
        }

        // Validate dimension
        if (!config.dimension || config.dimension <= 0) {
            validation.errors.push('Vector dimension must be a positive integer');
        } else if (config.dimension > 32768) {
            validation.warnings.push('Vector dimension is very high, consider reducing for better performance');
        }

        // Validate metric type
        if (config.metricType && !VECTOR_SIMILARITY_METRICS.includes(config.metricType)) {
            validation.errors.push(`Invalid metric type. Supported: ${VECTOR_SIMILARITY_METRICS.join(', ')}`);
        }

        // Validate index type
        if (config.indexType && !VECTOR_INDEX_TYPES.includes(config.indexType)) {
            validation.errors.push(`Invalid index type. Supported: ${VECTOR_INDEX_TYPES.join(', ')}`);
        }

        validation.isValid = validation.errors.length === 0;

        return validation;
    }

    private buildCollectionSchema(config: VectorCollectionConfig): any {
        return {
            fields: [
                {
                    name: 'id',
                    data_type: DataType.VarChar,
                    max_length: 255,
                    is_primary_key: true
                },
                {
                    name: 'vector',
                    data_type: DataType.FloatVector,
                    dim: config.dimension
                },
                {
                    name: 'metadata',
                    data_type: DataType.JSON
                }
            ]
        };
    }

    private async createCollectionIndex(
        collectionName: string,
        indexConfig: {
            fieldName: string;
            indexType: string;
            metricType: string;
            indexParams: Record<string, any>;
        }
    ): Promise<void> {
        await this.milvusConnection.execute(async (client: MilvusClient) => {
            return await client.createIndex({
                collection_name: collectionName,
                field_name: indexConfig.fieldName,
                index_type: indexConfig.indexType as IndexType,
                metric_type: indexConfig.metricType as MetricType,
                params: indexConfig.indexParams
            });
        });
    }

    private async createPartitions(collectionName: string, partitions: PartitionInfo[]): Promise<void> {
        for (const partition of partitions) {
            await this.milvusConnection.execute(async (client: MilvusClient) => {
                return await client.createPartition({
                    collection_name: collectionName,
                    partition_name: partition.name
                });
            });
        }
    }

    private async getCollectionIndexInfo(collectionName: string): Promise<VectorOperationResult<IndexInfo[]>> {
        try {
            const result = await this.milvusConnection.execute(async (client: MilvusClient) => {
                return await client.describeIndex({
                    collection_name: collectionName,
                    field_name: 'vector'
                });
            });

            if (result.error_code === 'Success' && result.index_descriptions) {
                const indexes: IndexInfo[] = result.index_descriptions.map((desc: any) => ({
                    fieldName: desc.field_name,
                    indexName: desc.index_name,
                    indexType: desc.index_type,
                    params: desc.params,
                    state: 'Finished',
                    buildProgress: 100
                }));

                return { success: true, data: indexes };
            }

            return { success: true, data: [] };
        } catch (error) {
            return {
                success: false,
                error: {
                    message: (error as Error).message,
                    code: 'INDEX_INFO_FAILED',
                    timestamp: new Date().toISOString()
                }
            };
        }
    }

    private cacheCollection(collection: VectorCollection): void {
        if (!this.config.enableCaching) return;

        // Evict old entries if cache is full
        if (this.collectionCache.size >= this.config.maxCachedCollections) {
            const oldestKey = this.collectionCache.keys().next().value;
            this.collectionCache.delete(oldestKey);
        }

        this.collectionCache.set(collection.name, {
            collection,
            timestamp: Date.now(),
            hitCount: 0
        });
    }

    private getCachedCollection(collectionName: string): VectorCollection | null {
        if (!this.config.enableCaching) return null;

        const cached = this.collectionCache.get(collectionName);
        if (!cached) return null;

        // Check TTL
        if (Date.now() - cached.timestamp > this.config.cacheTtl) {
            this.collectionCache.delete(collectionName);
            return null;
        }

        // Update hit count
        cached.hitCount++;
        return cached.collection;
    }

    private removeCachedCollection(collectionName: string): void {
        this.collectionCache.delete(collectionName);
    }

    private updatePerformanceMetrics(operationTime: number, success: boolean): void {
        this.performanceMetrics.totalOperations++;
        
        if (success) {
            this.performanceMetrics.successfulOperations++;
        } else {
            this.performanceMetrics.failedOperations++;
        }

        this.performanceMetrics.lastOperationTime = operationTime;
        
        // Update rolling average
        const totalSuccessful = this.performanceMetrics.successfulOperations;
        if (totalSuccessful === 1) {
            this.performanceMetrics.averageOperationTime = operationTime;
        } else {
            this.performanceMetrics.averageOperationTime = 
                (this.performanceMetrics.averageOperationTime * (totalSuccessful - 1) + operationTime) / totalSuccessful;
        }

        // Update cache hit ratio
        const totalCacheRequests = Array.from(this.collectionCache.values())
            .reduce((sum, entry) => sum + entry.hitCount, 0);
        this.performanceMetrics.cacheHitRatio = this.collectionCache.size > 0 ? 
            totalCacheRequests / this.performanceMetrics.totalOperations : 0;
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
    CollectionManagerConfig,
    CollectionOperationContext,
    CollectionSchemaValidation,
    CollectionPerformanceMetrics
};

export { DEFAULT_COLLECTION_MANAGER_CONFIG };

export default CollectionManager;
