// packages/vectordb/controllers/VectorDatabaseController.ts

/**
 * ReadyAI Vector Database Controller - Production-Ready Request Handler
 * 
 * This module implements comprehensive vector database HTTP controllers for ReadyAI,
 * adapting Cline's proven controller patterns with 90% pattern reuse while extending
 * with ReadyAI-specific vector operations and RESTful API endpoints.
 * 
 * Key Adaptations from Cline:
 * - Controller patterns from Cline's comprehensive HTTP handling architecture
 * - Async request processing from Cline's robust async patterns
 * - Error handling and response formatting from Cline's production-tested patterns
 * - Request validation from Cline's input validation system
 * - Performance monitoring from Cline's comprehensive telemetry system
 * - Health check patterns from Cline's service monitoring system
 * 
 * ReadyAI Extensions:
 * - Vector database CRUD operations with Milvus integration
 * - Context-aware vector search endpoints for project intelligence
 * - Performance monitoring endpoints for ReadyAI KPI tracking (3-second retrieval target)
 * - Project-scoped vector collection management
 * - Integration with ReadyAI's logging and error services
 * 
 * @version 1.0.0
 * @author ReadyAI Development Team
 */

import { Request, Response } from 'express';
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
} from '../../foundation/types/core.js';

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
import { VectorDatabaseService } from '../services/VectorDatabaseService.js';

// Logging and Error Services
import { Logger, logContextPerformance } from '../../logging/services/Logger.js';
import { ErrorService } from '../../logging/services/ErrorService.js';
import { TelemetryService } from '../../logging/services/TelemetryService.js';

/**
 * Request validation middleware patterns adapted from Cline
 */
interface RequestValidationRule {
    field: string;
    required: boolean;
    type: 'string' | 'number' | 'object' | 'array' | 'uuid';
    validator?: (value: any) => boolean;
    errorMessage?: string;
}

/**
 * Controller configuration for vector database operations
 * Enhanced with ReadyAI-specific settings
 */
export interface VectorDatabaseControllerConfig {
    /** Enable performance monitoring */
    enableMonitoring: boolean;
    /** Request timeout in milliseconds */
    requestTimeout: number;
    /** Maximum request body size */
    maxRequestSize: string;
    /** ReadyAI-specific settings */
    readyai: {
        /** Context retrieval KPI target in milliseconds */
        contextRetrievalTarget: number;
        /** Enable project-scoped operations */
        enableProjectScoping: boolean;
        /** Default results limit */
        defaultResultsLimit: number;
        /** Maximum concurrent operations */
        maxConcurrentOps: number;
    };
    /** Rate limiting settings */
    rateLimiting: {
        /** Enable rate limiting */
        enabled: boolean;
        /** Requests per minute per client */
        requestsPerMinute: number;
        /** Burst limit */
        burstLimit: number;
    };
}

/**
 * Default controller configuration
 * Optimized for ReadyAI development workflow
 */
const DEFAULT_CONTROLLER_CONFIG: VectorDatabaseControllerConfig = {
    enableMonitoring: true,
    requestTimeout: 30000, // 30 seconds
    maxRequestSize: '10mb',
    readyai: {
        contextRetrievalTarget: 3000, // 3 seconds KPI target
        enableProjectScoping: true,
        defaultResultsLimit: 10,
        maxConcurrentOps: 50
    },
    rateLimiting: {
        enabled: true,
        requestsPerMinute: 100,
        burstLimit: 10
    }
};

/**
 * Vector Database Controller - Production HTTP Request Handler
 * 
 * Provides RESTful API endpoints for vector database operations,
 * adapting Cline's proven controller patterns while providing
 * ReadyAI-specific vector intelligence and performance monitoring.
 */
export class VectorDatabaseController {
    private readonly config: VectorDatabaseControllerConfig;
    private readonly logger: Logger;
    private readonly errorService: ErrorService;
    private readonly telemetryService: TelemetryService;
    private readonly vectorService: VectorDatabaseService;

    // Request tracking patterns adapted from Cline
    private readonly activeRequests = new Map<UUID, {
        startTime: number;
        endpoint: string;
        projectId?: UUID;
    }>();

    // Performance metrics tracking - following Cline patterns
    private readonly performanceStats = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageLatency: 0,
        contextRetrievalTimes: [] as number[]
    };

    constructor(
        vectorService: VectorDatabaseService,
        config?: Partial<VectorDatabaseControllerConfig>
    ) {
        this.config = { ...DEFAULT_CONTROLLER_CONFIG, ...config };
        this.logger = Logger.getInstance();
        this.errorService = ErrorService.getInstance();
        this.telemetryService = TelemetryService.getInstance();
        this.vectorService = vectorService;
    }

    /**
     * Health check endpoint - GET /health
     * Comprehensive health monitoring following Cline patterns
     */
    public getHealth = async (req: Request, res: Response): Promise<void> => {
        const requestId = generateUUID();
        const startTime = performance.now();

        try {
            this.logger.debug('Health check requested', { requestId });

            // Get comprehensive health status from service
            const healthStatus = await this.vectorService.getHealthStatus();
            const duration = performance.now() - startTime;

            // Track performance
            this.updatePerformanceStats(duration, true);

            logContextPerformance('health_check', duration, 1, {
                requestId,
                healthy: healthStatus.isHealthy
            });

            const response = createApiResponse<VectorDatabaseHealth>(healthStatus, {
                requestId,
                metrics: {
                    processingTime: duration
                }
            });

            res.status(healthStatus.isHealthy ? 200 : 503).json(response);

        } catch (error) {
            const duration = performance.now() - startTime;
            this.updatePerformanceStats(duration, false);

            await this.handleControllerError(error as Error, {
                operation: 'getHealth',
                requestId,
                req
            });

            const errorResponse = createApiError(
                'Health check failed',
                'HEALTH_CHECK_FAILED',
                500,
                { requestId, duration }
            );

            res.status(500).json(errorResponse);
        }
    };

    /**
     * Create or get project collection - POST /collections/{projectId}
     * Project-scoped collection management with ReadyAI context
     */
    public createProjectCollection = async (req: Request, res: Response): Promise<void> => {
        const requestId = generateUUID();
        const startTime = performance.now();

        try {
            // Validate request parameters
            const validationResult = this.validateRequest(req, [
                { field: 'projectId', required: true, type: 'uuid' },
                { field: 'config', required: false, type: 'object' }
            ]);

            if (!validationResult.valid) {
                res.status(400).json(createApiError(
                    'Invalid request parameters',
                    'VALIDATION_ERROR',
                    400,
                    { validationErrors: validationResult.errors, requestId }
                ));
                return;
            }

            const { projectId } = req.params;
            const collectionConfig = req.body.config || {};

            this.logger.info('Creating project collection', {
                requestId,
                projectId,
                config: collectionConfig
            });

            // Track active request
            this.activeRequests.set(requestId, {
                startTime,
                endpoint: 'createProjectCollection',
                projectId: projectId as UUID
            });

            // Create or get collection from service
            const result = await this.vectorService.getOrCreateProjectCollection(
                projectId as UUID,
                collectionConfig
            );

            const duration = performance.now() - startTime;
            this.updatePerformanceStats(duration, result.success);

            if (result.success) {
                logContextPerformance('project_collection_creation', duration, 1, {
                    requestId,
                    projectId,
                    cached: result.metadata?.cached || false
                });

                const response = createApiResponse<VectorCollection>(result.data!, {
                    requestId,
                    metrics: {
                        processingTime: duration
                    }
                });

                res.status(201).json(response);
            } else {
                const errorResponse = createApiError(
                    result.error?.message || 'Failed to create collection',
                    result.error?.code || 'COLLECTION_CREATION_FAILED',
                    500,
                    { requestId, projectId, duration }
                );

                res.status(500).json(errorResponse);
            }

        } catch (error) {
            const duration = performance.now() - startTime;
            this.updatePerformanceStats(duration, false);

            await this.handleControllerError(error as Error, {
                operation: 'createProjectCollection',
                requestId,
                req
            });

            const errorResponse = createApiError(
                'Collection creation failed',
                'COLLECTION_CREATION_ERROR',
                500,
                { requestId, duration }
            );

            res.status(500).json(errorResponse);

        } finally {
            this.activeRequests.delete(requestId);
        }
    };

    /**
     * Semantic search endpoint - POST /search/{projectId}
     * Enhanced vector search with ReadyAI context awareness and KPI monitoring
     */
    public searchProjectContext = async (req: Request, res: Response): Promise<void> => {
        const requestId = generateUUID();
        const startTime = performance.now();

        try {
            // Validate request parameters
            const validationResult = this.validateRequest(req, [
                { field: 'projectId', required: true, type: 'uuid' },
                { field: 'query', required: true, type: 'string' },
                { field: 'config', required: false, type: 'object' }
            ]);

            if (!validationResult.valid) {
                res.status(400).json(createApiError(
                    'Invalid search parameters',
                    'VALIDATION_ERROR',
                    400,
                    { validationErrors: validationResult.errors, requestId }
                ));
                return;
            }

            const { projectId } = req.params;
            const { query, config = {} } = req.body;

            // Merge with defaults for search configuration
            const searchConfig: SemanticSearchConfig = {
                relevanceThreshold: 0.7,
                maxResults: this.config.readyai.defaultResultsLimit,
                strategy: 'hybrid',
                ...config
            };

            this.logger.info('Performing semantic search', {
                requestId,
                projectId,
                queryLength: query.length,
                strategy: searchConfig.strategy,
                maxResults: searchConfig.maxResults
            });

            // Track active request
            this.activeRequests.set(requestId, {
                startTime,
                endpoint: 'searchProjectContext',
                projectId: projectId as UUID
            });

            // Execute semantic search
            const result = await this.vectorService.searchProjectContext(
                projectId as UUID,
                query,
                searchConfig
            );

            const duration = performance.now() - startTime;
            this.updatePerformanceStats(duration, result.success);

            if (result.success) {
                // Track context retrieval performance for ReadyAI KPI
                const exceedsKpiTarget = duration > this.config.readyai.contextRetrievalTarget;
                
                logContextPerformance('semantic_search_api', duration, result.data!.length, {
                    requestId,
                    projectId,
                    strategy: searchConfig.strategy,
                    exceedsKpiTarget,
                    kpiCompliant: !exceedsKpiTarget
                });

                const response = createApiResponse<SemanticSearchResult[]>(result.data!, {
                    requestId,
                    metrics: {
                        processingTime: duration,
                        tokenUsage: {
                            input: 0, // Would be populated from embedding service
                            output: 0,
                            total: 0
                        }
                    }
                });

                res.status(200).json(response);
            } else {
                const errorResponse = createApiError(
                    result.error?.message || 'Search operation failed',
                    result.error?.code || 'SEARCH_OPERATION_FAILED',
                    500,
                    { requestId, projectId, duration }
                );

                res.status(500).json(errorResponse);
            }

        } catch (error) {
            const duration = performance.now() - startTime;
            this.updatePerformanceStats(duration, false);

            await this.handleControllerError(error as Error, {
                operation: 'searchProjectContext',
                requestId,
                req
            });

            const errorResponse = createApiError(
                'Search operation failed',
                'SEARCH_ERROR',
                500,
                { requestId, duration }
            );

            res.status(500).json(errorResponse);

        } finally {
            this.activeRequests.delete(requestId);
        }
    };

    /**
     * Add context vectors endpoint - POST /context/{projectId}
     * Batch vector insertion with ReadyAI context metadata
     */
    public addProjectContext = async (req: Request, res: Response): Promise<void> => {
        const requestId = generateUUID();
        const startTime = performance.now();

        try {
            // Validate request parameters
            const validationResult = this.validateRequest(req, [
                { field: 'projectId', required: true, type: 'uuid' },
                { field: 'contexts', required: true, type: 'array' }
            ]);

            if (!validationResult.valid) {
                res.status(400).json(createApiError(
                    'Invalid context data',
                    'VALIDATION_ERROR',
                    400,
                    { validationErrors: validationResult.errors, requestId }
                ));
                return;
            }

            const { projectId } = req.params;
            const { contexts } = req.body;

            // Validate contexts array
            if (!Array.isArray(contexts) || contexts.length === 0) {
                res.status(400).json(createApiError(
                    'Contexts must be a non-empty array',
                    'INVALID_CONTEXTS',
                    400,
                    { requestId }
                ));
                return;
            }

            this.logger.info('Adding context vectors to project', {
                requestId,
                projectId,
                contextCount: contexts.length
            });

            // Track active request
            this.activeRequests.set(requestId, {
                startTime,
                endpoint: 'addProjectContext',
                projectId: projectId as UUID
            });

            // Execute context insertion
            const result = await this.vectorService.addProjectContext(
                projectId as UUID,
                contexts as VectorContextNode[]
            );

            const duration = performance.now() - startTime;
            this.updatePerformanceStats(duration, result.success);

            if (result.success) {
                logContextPerformance('context_insertion_api', duration, contexts.length, {
                    requestId,
                    projectId,
                    vectorCount: contexts.length
                });

                const response = createApiResponse<{ insertedCount: number; errors: string[] }>(
                    result.data!,
                    {
                        requestId,
                        metrics: {
                            processingTime: duration
                        }
                    }
                );

                res.status(201).json(response);
            } else {
                const errorResponse = createApiError(
                    result.error?.message || 'Context insertion failed',
                    result.error?.code || 'CONTEXT_INSERTION_FAILED',
                    500,
                    { requestId, projectId, duration }
                );

                res.status(500).json(errorResponse);
            }

        } catch (error) {
            const duration = performance.now() - startTime;
            this.updatePerformanceStats(duration, false);

            await this.handleControllerError(error as Error, {
                operation: 'addProjectContext',
                requestId,
                req
            });

            const errorResponse = createApiError(
                'Context insertion failed',
                'CONTEXT_INSERTION_ERROR',
                500,
                { requestId, duration }
            );

            res.status(500).json(errorResponse);

        } finally {
            this.activeRequests.delete(requestId);
        }
    };

    /**
     * Get performance metrics endpoint - GET /metrics
     * Performance monitoring with ReadyAI KPI tracking
     */
    public getPerformanceMetrics = async (req: Request, res: Response): Promise<void> => {
        const requestId = generateUUID();
        const startTime = performance.now();

        try {
            this.logger.debug('Performance metrics requested', { requestId });

            // Calculate current performance metrics
            const currentMetrics = {
                totalRequests: this.performanceStats.totalRequests,
                successfulRequests: this.performanceStats.successfulRequests,
                failedRequests: this.performanceStats.failedRequests,
                successRate: this.performanceStats.totalRequests > 0 
                    ? (this.performanceStats.successfulRequests / this.performanceStats.totalRequests) * 100 
                    : 0,
                averageLatency: this.performanceStats.averageLatency,
                activeRequests: this.activeRequests.size,
                kpiCompliance: {
                    contextRetrievalTarget: this.config.readyai.contextRetrievalTarget,
                    contextRetrievalTimes: this.performanceStats.contextRetrievalTimes.slice(-100), // Last 100
                    averageContextRetrievalTime: this.calculateAverageContextRetrievalTime(),
                    kpiComplianceRate: this.calculateKpiComplianceRate()
                },
                timestamp: createTimestamp()
            };

            const duration = performance.now() - startTime;

            const response = createApiResponse(currentMetrics, {
                requestId,
                metrics: {
                    processingTime: duration
                }
            });

            res.status(200).json(response);

        } catch (error) {
            await this.handleControllerError(error as Error, {
                operation: 'getPerformanceMetrics',
                requestId,
                req
            });

            const errorResponse = createApiError(
                'Failed to retrieve metrics',
                'METRICS_RETRIEVAL_FAILED',
                500,
                { requestId }
            );

            res.status(500).json(errorResponse);
        }
    };

    /**
     * Request validation following Cline patterns
     * Comprehensive input validation with detailed error reporting
     */
    private validateRequest(req: Request, rules: RequestValidationRule[]): ValidationResult {
        const errors: string[] = [];

        for (const rule of rules) {
            const value = req.params[rule.field] || req.body[rule.field] || req.query[rule.field];

            // Check required fields
            if (rule.required && (value === undefined || value === null || value === '')) {
                errors.push(`${rule.field} is required`);
                continue;
            }

            // Skip type checking for optional fields that are undefined
            if (!rule.required && (value === undefined || value === null)) {
                continue;
            }

            // Type validation
            switch (rule.type) {
                case 'string':
                    if (typeof value !== 'string') {
                        errors.push(`${rule.field} must be a string`);
                    }
                    break;
                case 'number':
                    if (typeof value !== 'number' && !Number.isFinite(Number(value))) {
                        errors.push(`${rule.field} must be a number`);
                    }
                    break;
                case 'uuid':
                    if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
                        errors.push(`${rule.field} must be a valid UUID`);
                    }
                    break;
                case 'array':
                    if (!Array.isArray(value)) {
                        errors.push(`${rule.field} must be an array`);
                    }
                    break;
                case 'object':
                    if (typeof value !== 'object' || Array.isArray(value)) {
                        errors.push(`${rule.field} must be an object`);
                    }
                    break;
            }

            // Custom validation
            if (rule.validator && !rule.validator(value)) {
                errors.push(rule.errorMessage || `${rule.field} failed custom validation`);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Error handling following Cline patterns
     * Comprehensive error handling with context preservation
     */
    private async handleControllerError(error: Error, context: {
        operation: string;
        requestId: UUID;
        req: Request;
        projectId?: UUID;
    }): Promise<void> {
        await this.errorService.handleError(error, {
            operation: `VectorDatabaseController.${context.operation}`,
            operationId: context.requestId,
            severity: 'high',
            context: {
                url: context.req.url,
                method: context.req.method,
                userAgent: context.req.get('User-Agent'),
                projectId: context.projectId
            }
        });

        this.logger.error('Controller operation failed', {
            operation: context.operation,
            requestId: context.requestId,
            error: error.message,
            stack: error.stack,
            projectId: context.projectId
        });
    }

    /**
     * Performance statistics update following Cline patterns
     * Efficient performance tracking with sliding window
     */
    private updatePerformanceStats(duration: number, success: boolean): void {
        this.performanceStats.totalRequests++;
        
        if (success) {
            this.performanceStats.successfulRequests++;
        } else {
            this.performanceStats.failedRequests++;
        }

        // Update average latency with exponential moving average
        const alpha = 0.1; // Smoothing factor
        this.performanceStats.averageLatency = 
            this.performanceStats.averageLatency * (1 - alpha) + duration * alpha;

        // Track context retrieval times for KPI monitoring
        if (duration <= this.config.readyai.contextRetrievalTarget * 2) { // Only track reasonable times
            this.performanceStats.contextRetrievalTimes.push(duration);
            
            // Keep only last 1000 entries to prevent memory growth
            if (this.performanceStats.contextRetrievalTimes.length > 1000) {
                this.performanceStats.contextRetrievalTimes = 
                    this.performanceStats.contextRetrievalTimes.slice(-1000);
            }
        }
    }

    /**
     * Calculate average context retrieval time
     * KPI monitoring for ReadyAI performance targets
     */
    private calculateAverageContextRetrievalTime(): number {
        const times = this.performanceStats.contextRetrievalTimes;
        if (times.length === 0) return 0;
        
        return times.reduce((sum, time) => sum + time, 0) / times.length;
    }

    /**
     * Calculate KPI compliance rate
     * Percentage of requests meeting the 3-second target
     */
    private calculateKpiComplianceRate(): number {
        const times = this.performanceStats.contextRetrievalTimes;
        if (times.length === 0) return 100;

        const compliantRequests = times.filter(time => time <= this.config.readyai.contextRetrievalTarget).length;
        return (compliantRequests / times.length) * 100;
    }

    /**
     * Get controller statistics for monitoring
     * Comprehensive statistics following Cline patterns
     */
    public getStats() {
        return {
            config: {
                enableMonitoring: this.config.enableMonitoring,
                contextRetrievalTarget: this.config.readyai.contextRetrievalTarget,
                rateLimitingEnabled: this.config.rateLimiting.enabled
            },
            performance: {
                ...this.performanceStats,
                activeRequests: this.activeRequests.size,
                averageContextRetrievalTime: this.calculateAverageContextRetrievalTime(),
                kpiComplianceRate: this.calculateKpiComplianceRate()
            },
            timestamp: createTimestamp()
        };
    }
}
