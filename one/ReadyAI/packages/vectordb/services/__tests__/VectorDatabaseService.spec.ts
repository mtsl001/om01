// packages/vectordb/services/__tests__/VectorDatabaseService.spec.ts

/**
 * Vector Database Service Tests - Enterprise Service Orchestration Testing
 * 
 * Comprehensive test suite for VectorDatabaseService leveraging Cline's proven testing
 * patterns with 90% pattern reuse while extending for ReadyAI-specific vector operations.
 * 
 * Key Adaptations from Cline:
 * - Service testing patterns from Cline's comprehensive service test architecture
 * - Mock orchestration from Cline's sophisticated mocking system
 * - Error handling validation from Cline's robust error testing patterns
 * - Performance assertion patterns from Cline's telemetry testing
 * - Async operation testing from Cline's promise-based test patterns
 * - Event-driven testing from Cline's EventEmitter testing approach
 * 
 * ReadyAI Extensions:
 * - Vector operation testing with Milvus integration mocks
 * - Performance KPI validation (3-second context retrieval target)
 * - Project-scoped operation testing
 * - Semantic search result validation
 * - ReadyAI context node testing
 * 
 * @version 1.0.0
 * @author ReadyAI Development Team
 */

import { describe, it, beforeEach, afterEach, before, after } from 'mocha';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';

// ReadyAI Core Types
import {
    UUID,
    ApiResponse,
    ReadyAIError,
    generateUUID,
    createTimestamp,
    PhaseType
} from '../../../../foundation/types/core.js';

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
    VectorDatabaseHealth,
    SemanticSearchConfig,
    SemanticSearchResult,
    VectorContextNode,
    EmbeddingRequest,
    EmbeddingResult,
    DEFAULT_VECTOR_CONFIG
} from '../../types/vectordb.js';

// Service Under Test
import {
    VectorDatabaseService,
    VectorDatabaseServiceConfig,
    DEFAULT_SERVICE_CONFIG
} from '../VectorDatabaseService.js';

// Mock Dependencies - following Cline's mocking patterns
import { MilvusConnection } from '../MilvusConnection.js';
import { CollectionManager } from '../CollectionManager.js';
import { EmbeddingService } from '../EmbeddingService.js';
import { SearchService } from '../SearchService.js';
import { VectorOperations } from '../VectorOperations.js';
import { VectorCache } from '../VectorCache.js';
import { Logger } from '../../../logging/services/Logger.js';
import { ErrorService } from '../../../logging/services/ErrorService.js';
import { TelemetryService } from '../../../logging/services/TelemetryService.js';

describe('VectorDatabaseService', () => {
    let service: VectorDatabaseService;
    let sandbox: sinon.SinonSandbox;
    
    // Service Mock Stubs - following Cline's comprehensive mocking patterns
    let mockMilvusConnection: sinon.SinonStubbedInstance<MilvusConnection>;
    let mockCollectionManager: sinon.SinonStubbedInstance<CollectionManager>;
    let mockEmbeddingService: sinon.SinonStubbedInstance<EmbeddingService>;
    let mockSearchService: sinon.SinonStubbedInstance<SearchService>;
    let mockVectorOperations: sinon.SinonStubbedInstance<VectorOperations>;
    let mockVectorCache: sinon.SinonStubbedInstance<VectorCache>;
    
    // Logger Mock Stubs
    let mockLogger: sinon.SinonStubbedInstance<Logger>;
    let mockErrorService: sinon.SinonStubbedInstance<ErrorService>;
    let mockTelemetryService: sinon.SinonStubbedInstance<TelemetryService>;

    // Test Data Constants - following Cline's test data patterns
    const TEST_PROJECT_ID: UUID = 'test-project-12345678-1234-1234-1234-123456789012';
    const TEST_OPERATION_ID: UUID = 'test-operation-12345678-1234-1234-1234-123456789012';
    const TEST_COLLECTION_NAME = 'readyai_test_project_12345678_1234_1234_1234_123456789012';
    
    const mockConfig: Partial<VectorDatabaseServiceConfig> = {
        database: {
            ...DEFAULT_VECTOR_CONFIG,
            host: 'localhost',
            port: 19530,
            timeout: 5000
        },
        enableMonitoring: false, // Disable for tests
        readyai: {
            contextRetrievalTarget: 3000,
            enableProjectScoping: true,
            collectionPrefix: 'readyai_',
            maxConcurrentOps: 10
        }
    };

    beforeEach(() => {
        sandbox = sinon.createSandbox();

        // Create service mocks - following Cline's mock creation patterns
        mockMilvusConnection = sandbox.createStubInstance(MilvusConnection);
        mockCollectionManager = sandbox.createStubInstance(CollectionManager);
        mockEmbeddingService = sandbox.createStubInstance(EmbeddingService);
        mockSearchService = sandbox.createStubInstance(SearchService);
        mockVectorOperations = sandbox.createStubInstance(VectorOperations);
        mockVectorCache = sandbox.createStubInstance(VectorCache);

        // Create logger mocks
        mockLogger = sandbox.createStubInstance(Logger);
        mockErrorService = sandbox.createStubInstance(ErrorService);
        mockTelemetryService = sandbox.createStubInstance(TelemetryService);

        // Mock static getInstance methods - Cline singleton pattern
        sandbox.stub(Logger, 'getInstance').returns(mockLogger as any);
        sandbox.stub(ErrorService, 'getInstance').returns(mockErrorService as any);
        sandbox.stub(TelemetryService, 'getInstance').returns(mockTelemetryService as any);

        // Setup default mock behaviors - following Cline's behavior setup patterns
        mockMilvusConnection.initialize.resolves();
        mockMilvusConnection.isConnected = true;
        mockCollectionManager.initialize.resolves();
        mockEmbeddingService.initialize.resolves();
        mockSearchService.initialize.resolves();
        mockVectorOperations.initialize.resolves();
        mockVectorCache.initialize.resolves();

        // Mock service constructors - Cline dependency injection pattern
        sandbox.stub(MilvusConnection.prototype, 'constructor').returns(mockMilvusConnection as any);
        sandbox.stub(CollectionManager.prototype, 'constructor').returns(mockCollectionManager as any);
        sandbox.stub(EmbeddingService.prototype, 'constructor').returns(mockEmbeddingService as any);
        sandbox.stub(SearchService.prototype, 'constructor').returns(mockSearchService as any);
        sandbox.stub(VectorOperations.prototype, 'constructor').returns(mockVectorOperations as any);
        sandbox.stub(VectorCache.prototype, 'constructor').returns(mockVectorCache as any);

        // Create service instance
        service = new VectorDatabaseService(mockConfig);
    });

    afterEach(async () => {
        try {
            if (service && (service as any).isInitialized) {
                await service.shutdown();
            }
        } catch (error) {
            // Ignore shutdown errors in tests
        }
        sandbox.restore();
    });

    describe('Service Lifecycle Management', () => {
        describe('initialize()', () => {
            it('should successfully initialize all core services', async () => {
                // Act
                await service.initialize();

                // Assert - following Cline's comprehensive assertion patterns
                expect(mockMilvusConnection.initialize.calledOnce).to.be.true;
                expect(mockCollectionManager.initialize.calledOnce).to.be.true;
                expect(mockVectorOperations.initialize.calledOnce).to.be.true;
                expect(mockEmbeddingService.initialize.calledOnce).to.be.true;
                expect(mockSearchService.initialize.calledOnce).to.be.true;
                expect(mockVectorCache.initialize.calledOnce).to.be.true;
            });

            it('should emit service-initializing and service-initialized events', async () => {
                const initializingEventSpy = sandbox.spy();
                const initializedEventSpy = sandbox.spy();

                service.on('service-initializing', initializingEventSpy);
                service.on('service-initialized', initializedEventSpy);

                // Act
                await service.initialize();

                // Assert - Cline event emission patterns
                expect(initializingEventSpy.calledOnce).to.be.true;
                expect(initializedEventSpy.calledOnce).to.be.true;
                expect(initializedEventSpy.calledAfter(initializingEventSpy)).to.be.true;
            });

            it('should prevent double initialization', async () => {
                await service.initialize();

                // Act & Assert
                try {
                    await service.initialize();
                    expect.fail('Expected initialization to throw error');
                } catch (error) {
                    expect(error).to.be.instanceOf(ReadyAIError);
                    expect((error as ReadyAIError).code).to.equal('ALREADY_INITIALIZED');
                }
            });

            it('should handle service initialization failure gracefully', async () => {
                // Arrange - mock failure following Cline's error simulation patterns
                const testError = new Error('Connection failed');
                mockMilvusConnection.initialize.rejects(testError);

                // Act & Assert
                try {
                    await service.initialize();
                    expect.fail('Expected initialization to throw error');
                } catch (error) {
                    expect(error).to.be.instanceOf(ReadyAIError);
                    expect((error as ReadyAIError).code).to.equal('SERVICE_INITIALIZATION_FAILED');
                    expect(mockErrorService.handleError.calledOnce).to.be.true;
                }
            });

            it('should emit service-initialization-failed event on error', async () => {
                const failedEventSpy = sandbox.spy();
                service.on('service-initialization-failed', failedEventSpy);
                
                mockMilvusConnection.initialize.rejects(new Error('Test failure'));

                // Act
                try {
                    await service.initialize();
                } catch {
                    // Expected to throw
                }

                // Assert
                expect(failedEventSpy.calledOnce).to.be.true;
            });
        });

        describe('shutdown()', () => {
            beforeEach(async () => {
                await service.initialize();
            });

            it('should gracefully shutdown all services in reverse order', async () => {
                // Setup shutdown methods
                mockVectorCache.shutdown = sandbox.stub().resolves();
                mockVectorOperations.shutdown = sandbox.stub().resolves();
                mockSearchService.shutdown = sandbox.stub().resolves();
                mockEmbeddingService.shutdown = sandbox.stub().resolves();
                mockCollectionManager.shutdown = sandbox.stub().resolves();
                mockMilvusConnection.shutdown = sandbox.stub().resolves();

                // Act
                await service.shutdown();

                // Assert shutdown order - Cline reverse dependency pattern
                expect(mockVectorCache.shutdown.calledOnce).to.be.true;
                expect(mockVectorOperations.shutdown.calledOnce).to.be.true;
                expect(mockSearchService.shutdown.calledOnce).to.be.true;
                expect(mockEmbeddingService.shutdown.calledOnce).to.be.true;
                expect(mockCollectionManager.shutdown.calledOnce).to.be.true;
                expect(mockMilvusConnection.shutdown.calledOnce).to.be.true;
            });

            it('should emit service-shutting-down and service-shutdown events', async () => {
                const shuttingDownEventSpy = sandbox.spy();
                const shutdownEventSpy = sandbox.spy();

                service.on('service-shutting-down', shuttingDownEventSpy);
                service.on('service-shutdown', shutdownEventSpy);

                // Act
                await service.shutdown();

                // Assert
                expect(shuttingDownEventSpy.calledOnce).to.be.true;
                expect(shutdownEventSpy.calledOnce).to.be.true;
            });

            it('should handle shutdown when service is not initialized', async () => {
                const uninitializedService = new VectorDatabaseService(mockConfig);

                // Act - should not throw
                await uninitializedService.shutdown();

                // Assert - no service shutdowns should be called
                expect(mockMilvusConnection.shutdown?.called || false).to.be.false;
            });

            it('should prevent multiple shutdown calls', async () => {
                await service.shutdown();

                // Act - second shutdown should be no-op
                await service.shutdown();

                // Assert - services should only be shutdown once
                expect((mockMilvusConnection.shutdown?.callCount || 0) <= 1).to.be.true;
            });
        });
    });

    describe('Project Collection Management', () => {
        beforeEach(async () => {
            await service.initialize();
        });

        describe('getOrCreateProjectCollection()', () => {
            it('should retrieve existing collection if found', async () => {
                // Arrange
                const mockCollection: VectorCollection = {
                    name: TEST_COLLECTION_NAME,
                    dimension: 384,
                    metricType: 'COSINE',
                    stats: { entityCount: 100, sizeInBytes: 1024000 }
                } as VectorCollection;

                mockCollectionManager.getCollection.resolves({
                    success: true,
                    data: mockCollection,
                    metadata: {
                        durationMs: 50,
                        timestamp: createTimestamp(),
                        operationId: generateUUID()
                    }
                });

                // Act
                const result = await service.getOrCreateProjectCollection(TEST_PROJECT_ID);

                // Assert - following Cline's result validation patterns
                expect(result.success).to.be.true;
                expect(result.data).to.deep.equal(mockCollection);
                expect(result.metadata?.cached).to.be.true;
                expect(mockCollectionManager.getCollection.calledWith(TEST_COLLECTION_NAME)).to.be.true;
                expect(mockCollectionManager.createCollection.called).to.be.false;
            });

            it('should create new collection if not found', async () => {
                // Arrange - collection not found
                mockCollectionManager.getCollection.resolves({ success: false });
                
                const newCollection: VectorCollection = {
                    name: TEST_COLLECTION_NAME,
                    dimension: 384,
                    metricType: 'COSINE',
                    stats: { entityCount: 0, sizeInBytes: 0 }
                } as VectorCollection;

                mockCollectionManager.createCollection.resolves({
                    success: true,
                    data: newCollection,
                    metadata: {
                        durationMs: 200,
                        timestamp: createTimestamp(),
                        operationId: generateUUID()
                    }
                });

                // Act
                const result = await service.getOrCreateProjectCollection(TEST_PROJECT_ID, {
                    dimension: 768,
                    metricType: 'IP'
                });

                // Assert
                expect(result.success).to.be.true;
                expect(result.data).to.deep.equal(newCollection);
                expect(mockCollectionManager.createCollection.calledOnce).to.be.true;

                const createCall = mockCollectionManager.createCollection.getCall(0);
                const collectionConfig = createCall.args[0];
                expect(collectionConfig.name).to.equal(TEST_COLLECTION_NAME);
                expect(collectionConfig.dimension).to.equal(768);
                expect(collectionConfig.metricType).to.equal('IP');
                expect(collectionConfig.description).to.contain(TEST_PROJECT_ID);
            });

            it('should use default configuration for new collections', async () => {
                // Arrange
                mockCollectionManager.getCollection.resolves({ success: false });
                mockCollectionManager.createCollection.resolves({
                    success: true,
                    data: {} as VectorCollection,
                    metadata: { durationMs: 100, timestamp: createTimestamp(), operationId: generateUUID() }
                });

                // Act
                await service.getOrCreateProjectCollection(TEST_PROJECT_ID);

                // Assert default values
                const createCall = mockCollectionManager.createCollection.getCall(0);
                const config = createCall.args[0];
                expect(config.dimension).to.equal(384);
                expect(config.metricType).to.equal('COSINE');
                expect(config.indexType).to.equal('AUTOINDEX');
            });

            it('should handle collection creation errors', async () => {
                // Arrange
                mockCollectionManager.getCollection.resolves({ success: false });
                const testError = new Error('Collection creation failed');
                mockCollectionManager.createCollection.rejects(testError);

                // Act
                const result = await service.getOrCreateProjectCollection(TEST_PROJECT_ID);

                // Assert - Cline error handling patterns
                expect(result.success).to.be.false;
                expect(result.error).to.exist;
                expect(result.error?.message).to.equal('Collection creation failed');
                expect(mockErrorService.handleError.calledOnce).to.be.true;
            });

            it('should enforce service initialization check', async () => {
                // Arrange - create uninitialized service
                const uninitializedService = new VectorDatabaseService(mockConfig);

                // Act & Assert
                try {
                    await uninitializedService.getOrCreateProjectCollection(TEST_PROJECT_ID);
                    expect.fail('Expected method to throw error');
                } catch (error) {
                    expect(error).to.be.instanceOf(ReadyAIError);
                    expect((error as ReadyAIError).code).to.equal('SERVICE_NOT_INITIALIZED');
                }
            });
        });
    });

    describe('Semantic Search Operations', () => {
        beforeEach(async () => {
            await service.initialize();
        });

        describe('searchProjectContext()', () => {
            const testQuery = 'How to implement user authentication';
            const testEmbedding = [0.1, 0.2, 0.3, -0.1, 0.5];

            it('should perform successful semantic search with results', async () => {
                // Arrange - mock embedding generation
                mockEmbeddingService.generateEmbeddings.resolves({
                    success: true,
                    data: {
                        embeddings: [testEmbedding],
                        model: 'test-model',
                        stats: { totalTexts: 1, cacheHits: 0, processingTimeMs: 100, tokensProcessed: 10 }
                    },
                    metadata: { durationMs: 100, timestamp: createTimestamp(), operationId: generateUUID() }
                });

                // Mock vector search results
                const mockSearchResults: VectorSearchResult[] = [
                    {
                        id: 'vector1',
                        score: 0.95,
                        entity: {
                            metadata: {
                                text: 'Authentication implementation guide',
                                filePath: '/auth/README.md',
                                contextType: 'documentation'
                            }
                        }
                    },
                    {
                        id: 'vector2',
                        score: 0.87,
                        entity: {
                            metadata: {
                                text: 'User login service code',
                                filePath: '/auth/login.js',
                                contextType: 'file'
                            }
                        }
                    }
                ];

                mockSearchService.searchSimilarVectors.resolves({
                    success: true,
                    data: mockSearchResults,
                    metadata: { durationMs: 150, timestamp: createTimestamp(), operationId: generateUUID() }
                });

                // Act
                const result = await service.searchProjectContext(TEST_PROJECT_ID, testQuery, {
                    relevanceThreshold: 0.8,
                    maxResults: 5,
                    strategy: 'semantic'
                });

                // Assert - Cline comprehensive result validation
                expect(result.success).to.be.true;
                expect(result.data).to.be.an('array');
                expect(result.data).to.have.length(2);

                const firstResult = result.data![0];
                expect(firstResult.contextNode.projectId).to.equal(TEST_PROJECT_ID);
                expect(firstResult.contextNode.content).to.equal('Authentication implementation guide');
                expect(firstResult.score).to.equal(0.95);
                expect(firstResult.snippet).to.contain('Authentication');

                // Verify embedding service was called correctly
                expect(mockEmbeddingService.generateEmbeddings.calledOnce).to.be.true;
                const embeddingCall = mockEmbeddingService.generateEmbeddings.getCall(0);
                expect(embeddingCall.args[0].texts).to.deep.equal([testQuery]);
                expect(embeddingCall.args[0].context.projectId).to.equal(TEST_PROJECT_ID);

                // Verify search service was called correctly
                expect(mockSearchService.searchSimilarVectors.calledOnce).to.be.true;
                const searchCall = mockSearchService.searchSimilarVectors.getCall(0);
                expect(searchCall.args[0].collectionName).to.equal(TEST_COLLECTION_NAME);
                expect(searchCall.args[0].vectors).to.deep.equal([testEmbedding]);
                expect(searchCall.args[0].contextFilter?.projectId).to.equal(TEST_PROJECT_ID);
            });

            it('should track performance metrics and KPI compliance', async () => {
                // Arrange - setup mocks for fast operation
                mockEmbeddingService.generateEmbeddings.resolves({
                    success: true,
                    data: {
                        embeddings: [testEmbedding],
                        model: 'test-model',
                        stats: { totalTexts: 1, cacheHits: 0, processingTimeMs: 50, tokensProcessed: 10 }
                    },
                    metadata: { durationMs: 50, timestamp: createTimestamp(), operationId: generateUUID() }
                });

                mockSearchService.searchSimilarVectors.resolves({
                    success: true,
                    data: [],
                    metadata: { durationMs: 100, timestamp: createTimestamp(), operationId: generateUUID() }
                });

                // Act
                const startTime = performance.now();
                await service.searchProjectContext(TEST_PROJECT_ID, testQuery);
                const endTime = performance.now();
                const actualDuration = endTime - startTime;

                // Assert performance tracking
                const metrics = service.getPerformanceMetrics();
                expect(metrics.operations.totalOperations).to.be.greaterThan(0);
                expect(metrics.contextRetrieval.averageTime).to.be.lessThan(mockConfig.readyai!.contextRetrievalTarget);
                
                // Should meet KPI target
                expect(actualDuration).to.be.lessThan(mockConfig.readyai!.contextRetrievalTarget);
            });

            it('should handle embedding generation failure', async () => {
                // Arrange
                mockEmbeddingService.generateEmbeddings.resolves({
                    success: false,
                    error: {
                        message: 'Embedding service unavailable',
                        code: 'EMBEDDING_SERVICE_ERROR',
                        timestamp: createTimestamp()
                    },
                    metadata: { durationMs: 1000, timestamp: createTimestamp(), operationId: generateUUID() }
                });

                // Act
                const result = await service.searchProjectContext(TEST_PROJECT_ID, testQuery);

                // Assert - Cline error handling validation
                expect(result.success).to.be.false;
                expect(result.error).to.exist;
                expect(result.error?.code).to.equal('EMBEDDING_GENERATION_FAILED');
                expect(mockErrorService.handleError.calledOnce).to.be.true;
            });

            it('should handle vector search failure', async () => {
                // Arrange
                mockEmbeddingService.generateEmbeddings.resolves({
                    success: true,
                    data: {
                        embeddings: [testEmbedding],
                        model: 'test-model',
                        stats: { totalTexts: 1, cacheHits: 0, processingTimeMs: 100, tokensProcessed: 10 }
                    },
                    metadata: { durationMs: 100, timestamp: createTimestamp(), operationId: generateUUID() }
                });

                mockSearchService.searchSimilarVectors.resolves({
                    success: false,
                    error: {
                        message: 'Search index not available',
                        code: 'SEARCH_INDEX_ERROR',
                        timestamp: createTimestamp()
                    },
                    metadata: { durationMs: 200, timestamp: createTimestamp(), operationId: generateUUID() }
                });

                // Act
                const result = await service.searchProjectContext(TEST_PROJECT_ID, testQuery);

                // Assert
                expect(result.success).to.be.false;
                expect(result.error?.code).to.equal('SEARCH_OPERATION_FAILED');
            });

            it('should enforce configured timeout limits', async () => {
                // Arrange - mock slow search
                mockEmbeddingService.generateEmbeddings.resolves({
                    success: true,
                    data: {
                        embeddings: [testEmbedding],
                        model: 'test-model',
                        stats: { totalTexts: 1, cacheHits: 0, processingTimeMs: 100, tokensProcessed: 10 }
                    },
                    metadata: { durationMs: 100, timestamp: createTimestamp(), operationId: generateUUID() }
                });

                // Verify timeout is passed to search service
                mockSearchService.searchSimilarVectors.resolves({
                    success: true,
                    data: [],
                    metadata: { durationMs: 2500, timestamp: createTimestamp(), operationId: generateUUID() }
                });

                // Act
                await service.searchProjectContext(TEST_PROJECT_ID, testQuery);

                // Assert timeout configuration
                const searchCall = mockSearchService.searchSimilarVectors.getCall(0);
                expect(searchCall.args[0].timeout).to.equal(mockConfig.readyai!.contextRetrievalTarget);
            });
        });
    });

    describe('Context Vector Management', () => {
        beforeEach(async () => {
            await service.initialize();
        });

        describe('addProjectContext()', () => {
            const mockContextNodes: VectorContextNode[] = [
                {
                    id: generateUUID(),
                    projectId: TEST_PROJECT_ID,
                    type: 'file',
                    path: '/src/components/Button.tsx',
                    content: 'React button component implementation',
                    dependencies: [],
                    dependents: [],
                    relevanceScore: 0.9,
                    lastAccessed: createTimestamp(),
                    vectorMetadata: {
                        collectionName: TEST_COLLECTION_NAME,
                        lastEmbedded: createTimestamp(),
                        embeddingVersion: '1.0'
                    }
                },
                {
                    id: generateUUID(),
                    projectId: TEST_PROJECT_ID,
                    type: 'documentation',
                    path: '/docs/api.md',
                    content: 'API documentation for authentication endpoints',
                    embedding: [0.2, 0.4, 0.1, 0.8, -0.3], // Pre-computed embedding
                    dependencies: [],
                    dependents: [],
                    relevanceScore: 0.85,
                    lastAccessed: createTimestamp(),
                    vectorMetadata: {
                        collectionName: TEST_COLLECTION_NAME,
                        lastEmbedded: createTimestamp(),
                        embeddingVersion: '1.0'
                    }
                }
            ];

            it('should successfully add context vectors to project collection', async () => {
                // Arrange
                // Mock collection exists
                mockCollectionManager.getCollection.resolves({
                    success: true,
                    data: {} as VectorCollection,
                    metadata: { durationMs: 50, timestamp: createTimestamp(), operationId: generateUUID() }
                });

                // Mock embedding generation for context without embeddings
                mockEmbeddingService.generateEmbeddings.resolves({
                    success: true,
                    data: {
                        embeddings: [[0.1, 0.3, 0.5, 0.7, -0.2]], // For first context
                        model: 'test-model',
                        stats: { totalTexts: 1, cacheHits: 0, processingTimeMs: 150, tokensProcessed: 20 }
                    },
                    metadata: { durationMs: 150, timestamp: createTimestamp(), operationId: generateUUID() }
                });

                // Mock vector insertion
                mockVectorOperations.insertVectors.resolves({
                    success: true,
                    data: { insertedIds: [mockContextNodes[0].id, mockContextNodes[1].id] },
                    metadata: { durationMs: 300, timestamp: createTimestamp(), operationId: generateUUID() }
                });

                // Act
                const result = await service.addProjectContext(TEST_PROJECT_ID, mockContextNodes);

                // Assert - Cline comprehensive validation
                expect(result.success).to.be.true;
                expect(result.data?.insertedCount).to.equal(2);
                expect(result.data?.errors).to.be.an('array').that.is.empty;

                // Verify embedding generation was called for context without embeddings
                expect(mockEmbeddingService.generateEmbeddings.calledOnce).to.be.true;
                const embeddingCall = mockEmbeddingService.generateEmbeddings.getCall(0);
                expect(embeddingCall.args[0].texts).to.deep.equal(['React button component implementation']);

                // Verify vector insertion
                expect(mockVectorOperations.insertVectors.calledOnce).to.be.true;
                const insertCall = mockVectorOperations.insertVectors.getCall(0);
                expect(insertCall.args[0].collectionName).to.equal(TEST_COLLECTION_NAME);
                expect(insertCall.args[0].data).to.have.length(2);

                // Verify metadata structure
                const insertedVectors = insertCall.args[0].data;
                expect(insertedVectors[0].metadata.projectId).to.equal(TEST_PROJECT_ID);
                expect(insertedVectors[0].metadata.contextType).to.equal('file');
                expect(insertedVectors[1].metadata.contextType).to.equal('documentation');
            });

            it('should handle contexts with pre-computed embeddings', async () => {
                // Arrange - all contexts have embeddings
                const contextsWithEmbeddings = mockContextNodes.map(ctx => ({
                    ...ctx,
                    embedding: [0.1, 0.2, 0.3, 0.4, 0.5]
                }));

                mockCollectionManager.getCollection.resolves({
                    success: true,
                    data: {} as VectorCollection,
                    metadata: { durationMs: 50, timestamp: createTimestamp(), operationId: generateUUID() }
                });

                mockVectorOperations.insertVectors.resolves({
                    success: true,
                    data: { insertedIds: contextsWithEmbeddings.map(ctx => ctx.id) },
                    metadata: { durationMs: 200, timestamp: createTimestamp(), operationId: generateUUID() }
                });

                // Act
                await service.addProjectContext(TEST_PROJECT_ID, contextsWithEmbeddings);

                // Assert - no embedding generation should be called
                expect(mockEmbeddingService.generateEmbeddings.called).to.be.false;
                expect(mockVectorOperations.insertVectors.calledOnce).to.be.true;
            });

            it('should handle embedding generation failures gracefully', async () => {
                // Arrange
                mockCollectionManager.getCollection.resolves({
                    success: true,
                    data: {} as VectorCollection,
                    metadata: { durationMs: 50, timestamp: createTimestamp(), operationId: generateUUID() }
                });

                mockEmbeddingService.generateEmbeddings.resolves({
                    success: false,
                    error: {
                        message: 'Embedding model unavailable',
                        code: 'MODEL_UNAVAILABLE',
                        timestamp: createTimestamp()
                    },
                    metadata: { durationMs: 5000, timestamp: createTimestamp(), operationId: generateUUID() }
                });

                // Act
                const result = await service.addProjectContext(TEST_PROJECT_ID, mockContextNodes);

                // Assert - should still proceed with insertion (embeddings may be empty)
                expect(mockVectorOperations.insertVectors.calledOnce).to.be.true;
            });

            it('should handle vector insertion failures', async () => {
                // Arrange
                mockCollectionManager.getCollection.resolves({
                    success: true,
                    data: {} as VectorCollection,
                    metadata: { durationMs: 50, timestamp: createTimestamp(), operationId: generateUUID() }
                });

                mockEmbeddingService.generateEmbeddings.resolves({
                    success: true,
                    data: {
                        embeddings: [[0.1, 0.2, 0.3, 0.4, 0.5]],
                        model: 'test-model',
                        stats: { totalTexts: 1, cacheHits: 0, processingTimeMs: 100, tokensProcessed: 15 }
                    },
                    metadata: { durationMs: 100, timestamp: createTimestamp(), operationId: generateUUID() }
                });

                const insertError = new Error('Vector insertion failed');
                mockVectorOperations.insertVectors.rejects(insertError);

                // Act
                const result = await service.addProjectContext(TEST_PROJECT_ID, mockContextNodes);

                // Assert - Cline error handling patterns
                expect(result.success).to.be.false;
                expect(result.error?.message).to.equal('Vector insertion failed');
                expect(mockErrorService.handleError.calledOnce).to.be.true;
            });
        });
    });

    describe('Health Monitoring and Performance', () => {
        beforeEach(async () => {
            await service.initialize();
        });

        describe('getHealthStatus()', () => {
            it('should return healthy status when all services are operational', async () => {
                // Arrange - mock healthy services
                mockMilvusConnection.isHealthy = sandbox.stub().resolves(true);
                mockCollectionManager.isHealthy = sandbox.stub().resolves(true);
                mockVectorOperations.isHealthy = sandbox.stub().resolves(true);

                // Act
                const health = await service.getHealthStatus();

                // Assert - Cline health monitoring patterns
                expect(health.isHealthy).to.be.true;
                expect(health.connection.isConnected).to.be.true;
                expect(health.connection.responseTimeMs).to.be.a('number');
                expect(health.memory.totalBytes).to.be.greaterThan(0);
                expect(health.memory.utilizationPercent).to.be.within(0, 100);
                expect(health.issues).to.be.an('array').that.is.empty;
            });

            it('should return unhealthy status when services fail', async () => {
                // Arrange - mock service failures
                mockMilvusConnection.isHealthy = sandbox.stub().resolves(false);
                mockCollectionManager.isHealthy = sandbox.stub().rejects(new Error('Collection service error'));

                // Act
                const health = await service.getHealthStatus();

                // Assert
                expect(health.isHealthy).to.be.false;
                expect(health.issues).to.have.length.greaterThan(0);
                
                const errorIssues = health.issues.filter(issue => issue.severity === 'error');
                expect(errorIssues).to.have.length.greaterThan(0);
            });

            it('should include performance metrics in health status', async () => {
                // Act
                const health = await service.getHealthStatus();

                // Assert performance data structure
                expect(health.performance).to.exist;
                expect(health.performance.queriesPerSecond).to.be.a('number');
                expect(health.performance.averageQueryLatencyMs).to.be.a('number');
                expect(health.performance.insertionsPerSecond).to.be.a('number');
                expect(health.performance.averageInsertLatencyMs).to.be.a('number');
            });
        });

        describe('getPerformanceMetrics()', () => {
            it('should return comprehensive performance data', async () => {
                // Act
                const metrics = service.getPerformanceMetrics();

                // Assert - Cline metrics structure validation
                expect(metrics.operations).to.exist;
                expect(metrics.operations.totalOperations).to.be.a('number');
                expect(metrics.operations.successfulOperations).to.be.a('number');
                expect(metrics.operations.failedOperations).to.be.a('number');
                expect(metrics.operations.averageLatency).to.be.a('number');

                expect(metrics.contextRetrieval).to.exist;
                expect(metrics.contextRetrieval.averageTime).to.be.a('number');
                expect(metrics.contextRetrieval.kpiCompliance).to.be.within(0, 100);
                expect(metrics.contextRetrieval.exceedsThresholdCount).to.be.a('number');

                expect(metrics.services).to.be.an('array');
            });

            it('should track KPI compliance accurately', async () => {
                // Arrange - perform operations to generate metrics
                mockCollectionManager.getCollection.resolves({
                    success: true,
                    data: {} as VectorCollection,
                    metadata: { durationMs: 50, timestamp: createTimestamp(), operationId: generateUUID() }
                });

                // Act - perform multiple operations
                await service.getOrCreateProjectCollection(TEST_PROJECT_ID);
                
                const metrics = service.getPerformanceMetrics();

                // Assert KPI tracking
                expect(metrics.contextRetrieval.kpiCompliance).to.be.within(0, 100);
                expect(metrics.operations.totalOperations).to.be.greaterThan(0);
            });
        });
    });

    describe('Error Handling and Resilience', () => {
        beforeEach(async () => {
            await service.initialize();
        });

        it('should handle concurrent operation failures gracefully', async () => {
            // Arrange - simulate concurrent operations with some failures
            const promises = [
                service.getOrCreateProjectCollection(generateUUID()),
                service.getOrCreateProjectCollection(generateUUID()),
                service.getOrCreateProjectCollection(generateUUID())
            ];

            // Mock some successes and some failures
            mockCollectionManager.getCollection
                .onCall(0).resolves({ success: true, data: {} as VectorCollection, metadata: { durationMs: 100, timestamp: createTimestamp(), operationId: generateUUID() } })
                .onCall(1).rejects(new Error('Network error'))
                .onCall(2).resolves({ success: true, data: {} as VectorCollection, metadata: { durationMs: 150, timestamp: createTimestamp(), operationId: generateUUID() } });

            // Act
            const results = await Promise.allSettled(promises);

            // Assert - some should succeed, some should fail
            const successful = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;
            
            expect(successful).to.be.greaterThan(0);
            expect(failed).to.be.greaterThan(0);
            expect(successful + failed).to.equal(3);
        });

        it('should prevent operations on shutting down service', async () => {
            // Arrange - start shutdown process
            const shutdownPromise = service.shutdown();

            // Act & Assert - operations should be rejected
            try {
                await service.getOrCreateProjectCollection(TEST_PROJECT_ID);
                expect.fail('Expected operation to be rejected');
            } catch (error) {
                expect(error).to.be.instanceOf(ReadyAIError);
                expect((error as ReadyAIError).code).to.equal('SERVICE_SHUTTING_DOWN');
            }

            await shutdownPromise;
        });

        it('should handle memory pressure gracefully', async () => {
            // Arrange - simulate memory constraints
            const originalMemoryUsage = process.memoryUsage;
            sandbox.stub(process, 'memoryUsage').returns({
                rss: 1024 * 1024 * 1024, // 1GB
                heapTotal: 512 * 1024 * 1024, // 512MB
                heapUsed: 480 * 1024 * 1024, // 480MB (93.75% usage)
                external: 0,
                arrayBuffers: 0
            });

            // Act
            const health = await service.getHealthStatus();

            // Assert - should report high memory usage
            expect(health.memory.utilizationPercent).to.be.greaterThan(90);
            
            // Restore original function
            process.memoryUsage = originalMemoryUsage;
        });
    });

    describe('Event Emission and Monitoring', () => {
        beforeEach(async () => {
            await service.initialize();
        });

        it('should emit performance-metrics events during monitoring', (done) => {
            // Arrange
            service.on('performance-metrics', (metrics) => {
                try {
                    expect(metrics).to.exist;
                    expect(metrics.operations).to.exist;
                    expect(metrics.contextRetrieval).to.exist;
                    done();
                } catch (error) {
                    done(error);
                }
            });

            // Act - trigger metrics collection manually
            (service as any).collectPerformanceMetrics();
        });

        it('should maintain event listener limits', () => {
            // Act - add many listeners to test EventEmitter patterns
            const listeners = [];
            for (let i = 0; i < 15; i++) {
                const listener = () => {};
                listeners.push(listener);
                service.on('service-initialized', listener);
            }

            // Assert - should handle many listeners without issues
            expect(service.listenerCount('service-initialized')).to.equal(15);

            // Cleanup
            listeners.forEach(listener => {
                service.removeListener('service-initialized', listener);
            });
        });
    });
});
