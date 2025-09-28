// tests/integration/phase1-2.spec.ts

/**
 * ReadyAI Phase 1.2 Integration Tests - Database & Vector Database End-to-End Scenarios
 * 
 * Comprehensive integration tests that validate all Phase 1.2 modules working together,
 * adapting Cline's proven integration test patterns with ReadyAI-specific database operations.
 * 
 * Reuse Strategy: 90% Adapt from Cline integration test patterns
 * - Direct adaptation of Cline's comprehensive E2E test architecture
 * - Enhanced with ReadyAI database and vector database scenario testing
 * - Maintains Cline's reliability patterns with database-specific validations
 * 
 * Key Test Scenarios:
 * - Database Management Module end-to-end operations
 * - Vector Database Service semantic search workflows
 * - Cross-module integration (database + vector database)
 * - Performance monitoring and KPI compliance
 * - Error handling and recovery scenarios
 * - Production readiness validation
 * 
 * @version 1.0.0 - Phase 1.2 Integration Testing
 * @author ReadyAI Development Team
 */

import { describe, it, beforeEach, afterEach, before, after } from 'mocha';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { performance } from 'perf_hooks';
import { randomUUID } from 'crypto';

// ReadyAI Core Dependencies
import {
    UUID,
    ApiResponse,
    ReadyAIError,
    PhaseType,
    generateUUID,
    createTimestamp,
    isApiSuccess,
    createApiResponse,
    wrapAsync
} from '../../packages/foundation/types/core.js';

// Database Management Module
import { DatabaseService } from '../../packages/database/services/DatabaseService.js';
import { DatabaseConnection } from '../../packages/database/services/DatabaseConnection.js';
import { MigrationService } from '../../packages/database/services/MigrationService.js';
import { BackupService } from '../../packages/database/services/BackupService.js';
import { TransactionManager } from '../../packages/database/services/TransactionManager.js';
import { DatabaseHealthMonitor } from '../../packages/database/services/DatabaseHealthMonitor.js';

import type {
    DatabaseConfig,
    DatabaseHealth,
    TransactionOptions,
    MigrationResult,
    BackupResult
} from '../../packages/database/types/database.js';

// Vector Database Module
import { VectorDatabaseService } from '../../packages/vectordb/services/VectorDatabaseService.js';
import { MilvusConnection } from '../../packages/vectordb/services/MilvusConnection.js';
import { CollectionManager } from '../../packages/vectordb/services/CollectionManager.js';
import { EmbeddingService } from '../../packages/vectordb/services/EmbeddingService.js';
import { SearchService } from '../../packages/vectordb/services/SearchService.js';
import { VectorOperations } from '../../packages/vectordb/services/VectorOperations.js';

import type {
    VectorDatabaseConfig,
    VectorCollection,
    SemanticSearchConfig,
    SemanticSearchResult,
    VectorContextNode,
    VectorDatabaseHealth,
    VectorPerformanceMetrics
} from '../../packages/vectordb/types/vectordb.js';

// Logging Services
import { Logger } from '../../packages/logging/services/Logger.js';
import { ErrorService } from '../../packages/logging/services/ErrorService.js';
import { TelemetryService } from '../../packages/logging/services/TelemetryService.js';

// Configuration
import { ConfigService } from '../../packages/config/services/ConfigService.js';

/**
 * Test configuration adapted from Cline's proven test setup patterns
 */
interface Phase12TestConfig {
    database: {
        testDbPath: string;
        enableTestMigrations: boolean;
        enablePerformanceMonitoring: boolean;
    };
    vectorDb: {
        testHost: string;
        testPort: number;
        testCollectionPrefix: string;
        contextRetrievalTarget: number;
    };
    performance: {
        maxOperationTime: number;
        maxContextRetrievalTime: number;
        minThroughput: number;
    };
    cleanup: {
        cleanupOnSuccess: boolean;
        retainLogsOnFailure: boolean;
    };
}

const DEFAULT_TEST_CONFIG: Phase12TestConfig = {
    database: {
        testDbPath: ':memory:', // SQLite in-memory for fast tests
        enableTestMigrations: true,
        enablePerformanceMonitoring: true
    },
    vectorDb: {
        testHost: 'localhost',
        testPort: 19530,
        testCollectionPrefix: 'test_readyai_',
        contextRetrievalTarget: 3000 // 3 seconds KPI target
    },
    performance: {
        maxOperationTime: 5000, // 5 seconds max for any operation
        maxContextRetrievalTime: 3000, // 3 seconds KPI compliance
        minThroughput: 10 // Minimum operations per second
    },
    cleanup: {
        cleanupOnSuccess: true,
        retainLogsOnFailure: false
    }
};

/**
 * Integration test context for tracking test state
 * Following Cline's comprehensive context management patterns
 */
interface IntegrationTestContext {
    testId: UUID;
    startTime: number;
    services: {
        database?: DatabaseService;
        vectorDatabase?: VectorDatabaseService;
        config?: ConfigService;
        logger?: Logger;
        errorService?: ErrorService;
        telemetry?: TelemetryService;
    };
    testData: {
        testProjectId: UUID;
        testCollectionName: string;
        testContextNodes: VectorContextNode[];
        performanceMetrics: Array<{
            operation: string;
            duration: number;
            success: boolean;
            timestamp: string;
        }>;
    };
    cleanup: Array<() => Promise<void>>;
    assertions: {
        totalOperations: number;
        successfulOperations: number;
        failedOperations: number;
        averageLatency: number;
    };
}

describe('ReadyAI Phase 1.2 Integration Tests - Database + Vector Database', () => {
    let testContext: IntegrationTestContext;
    let sandbox: sinon.SinonSandbox;
    let config: Phase12TestConfig;

    // Global test setup following Cline's proven patterns
    before(async function() {
        this.timeout(30000); // 30 seconds for setup

        console.log('🚀 Setting up ReadyAI Phase 1.2 Integration Test Environment...');

        // Initialize test configuration
        config = { ...DEFAULT_TEST_CONFIG };

        // Setup sandbox for reliable test isolation
        sandbox = sinon.createSandbox();

        console.log('✅ Phase 1.2 Integration Test Environment Ready');
    });

    // Global test teardown
    after(async function() {
        this.timeout(15000); // 15 seconds for cleanup

        console.log('🧹 Cleaning up Phase 1.2 Integration Test Environment...');

        if (sandbox) {
            sandbox.restore();
        }

        console.log('✅ Phase 1.2 Integration Test Cleanup Complete');
    });

    // Individual test setup
    beforeEach(async function() {
        this.timeout(10000); // 10 seconds for each test setup

        const testId = generateUUID();
        console.log(`📋 Setting up test context for: ${this.currentTest?.title} (${testId})`);

        testContext = {
            testId,
            startTime: performance.now(),
            services: {},
            testData: {
                testProjectId: generateUUID(),
                testCollectionName: `${config.vectorDb.testCollectionPrefix}${testId.replace(/-/g, '_')}`,
                testContextNodes: [],
                performanceMetrics: []
            },
            cleanup: [],
            assertions: {
                totalOperations: 0,
                successfulOperations: 0,
                failedOperations: 0,
                averageLatency: 0
            }
        };
    });

    // Individual test teardown with comprehensive cleanup
    afterEach(async function() {
        this.timeout(10000); // 10 seconds for each test cleanup

        if (!testContext) return;

        console.log(`🧹 Cleaning up test context for: ${this.currentTest?.title}`);

        // Execute all cleanup functions in reverse order
        const cleanupPromises = testContext.cleanup.reverse().map(cleanup => 
            cleanup().catch(error => {
                console.warn('Cleanup function failed:', error);
                return Promise.resolve(); // Continue cleanup even if one fails
            })
        );

        await Promise.all(cleanupPromises);

        // Shutdown services gracefully
        if (testContext.services.vectorDatabase) {
            await testContext.services.vectorDatabase.shutdown().catch(console.warn);
        }
        if (testContext.services.database) {
            await testContext.services.database.shutdown().catch(console.warn);
        }

        // Calculate and log test performance metrics
        const testDuration = performance.now() - testContext.startTime;
        const avgLatency = testContext.testData.performanceMetrics.length > 0
            ? testContext.testData.performanceMetrics.reduce((sum, metric) => sum + metric.duration, 0) / testContext.testData.performanceMetrics.length
            : 0;

        console.log(`📊 Test Performance Summary:
            - Test Duration: ${testDuration.toFixed(2)}ms
            - Operations: ${testContext.assertions.totalOperations}
            - Success Rate: ${testContext.assertions.totalOperations > 0 ? (testContext.assertions.successfulOperations / testContext.assertions.totalOperations * 100).toFixed(1) : 0}%
            - Average Latency: ${avgLatency.toFixed(2)}ms`);

        testContext = null as any;
    });

    /**
     * Helper functions adapted from Cline's proven test utilities
     */

    async function initializeDatabaseService(): Promise<DatabaseService> {
        const dbConfig: DatabaseConfig = {
            type: 'sqlite',
            database: config.database.testDbPath,
            host: 'localhost',
            port: 0,
            username: '',
            password: '',
            connectionPool: {
                min: 1,
                max: 5,
                idleTimeout: 30000,
                acquireTimeout: 10000
            },
            backup: {
                enabled: true,
                schedule: {
                    enabled: false, // Disable scheduled backups in tests
                    interval: 0,
                    retention: { maxCount: 1, maxAge: 0 },
                    strategies: ['full']
                }
            }
        };

        const databaseService = new DatabaseService({
            ...dbConfig,
            enableAutoMigrations: config.database.enableTestMigrations,
            enablePerformanceMonitoring: config.database.enablePerformanceMonitoring,
            healthCheckInterval: 5000
        });

        await databaseService.initialize();
        
        testContext.services.database = databaseService;
        testContext.cleanup.push(() => databaseService.shutdown());

        return databaseService;
    }

    async function initializeVectorDatabaseService(): Promise<VectorDatabaseService> {
        const vectorConfig: VectorDatabaseConfig = {
            host: config.vectorDb.testHost,
            port: config.vectorDb.testPort,
            username: '',
            password: '',
            database: 'test_readyai',
            ssl: false,
            connectionPool: {
                maxConnections: 5,
                idleTimeout: 30000
            }
        };

        const vectorService = new VectorDatabaseService({
            database: vectorConfig,
            enableMonitoring: true,
            healthCheckInterval: 5000,
            metricsInterval: 10000,
            readyai: {
                contextRetrievalTarget: config.vectorDb.contextRetrievalTarget,
                enableProjectScoping: true,
                collectionPrefix: config.vectorDb.testCollectionPrefix,
                maxConcurrentOps: 10
            },
            services: {
                enableEmbedding: true,
                enableSearch: true,
                enableCache: true,
                startupTimeoutMs: 10000
            }
        });

        await vectorService.initialize();
        
        testContext.services.vectorDatabase = vectorService;
        testContext.cleanup.push(() => vectorService.shutdown());

        return vectorService;
    }

    function trackPerformanceMetric(operation: string, duration: number, success: boolean): void {
        testContext.testData.performanceMetrics.push({
            operation,
            duration,
            success,
            timestamp: createTimestamp()
        });

        testContext.assertions.totalOperations++;
        if (success) {
            testContext.assertions.successfulOperations++;
        } else {
            testContext.assertions.failedOperations++;
        }

        // Update rolling average latency
        testContext.assertions.averageLatency = 
            testContext.testData.performanceMetrics.reduce((sum, metric) => sum + metric.duration, 0) / 
            testContext.testData.performanceMetrics.length;
    }

    async function generateTestContextNodes(count: number = 5): Promise<VectorContextNode[]> {
        const nodes: VectorContextNode[] = [];

        for (let i = 0; i < count; i++) {
            nodes.push({
                id: generateUUID(),
                projectId: testContext.testData.testProjectId,
                type: i % 2 === 0 ? 'file' : 'module',
                path: `src/test/file${i}.ts`,
                content: `// Test file ${i}\nexport function testFunction${i}() {\n  return "test content ${i}";\n}\n\ninterface TestInterface${i} {\n  value: string;\n  count: number;\n}`,
                embedding: [], // Will be generated by embedding service
                dependencies: i > 0 ? [nodes[i - 1].id] : [],
                dependents: [],
                relevanceScore: Math.random() * 0.5 + 0.5, // 0.5 to 1.0
                lastAccessed: createTimestamp(),
                vectorMetadata: {
                    collectionName: testContext.testData.testCollectionName,
                    vectorId: generateUUID(),
                    lastEmbedded: createTimestamp(),
                    embeddingVersion: '1.0'
                }
            });
        }

        testContext.testData.testContextNodes = nodes;
        return nodes;
    }

    /**
     * Phase 1.2 Core Integration Tests
     */

    describe('Database Management Module Integration', () => {
        it('should initialize database service with all dependencies', async function() {
            this.timeout(15000);

            const startTime = performance.now();
            
            try {
                const databaseService = await initializeDatabaseService();
                
                // Verify service is initialized
                expect(databaseService).to.not.be.undefined;
                
                // Verify health status
                const healthResult = await databaseService.getHealthStatus();
                expect(isApiSuccess(healthResult)).to.be.true;
                
                if (isApiSuccess(healthResult)) {
                    expect(healthResult.data.isHealthy).to.be.true;
                    expect(healthResult.data.connectionHealth.isConnected).to.be.true;
                }
                
                const duration = performance.now() - startTime;
                trackPerformanceMetric('database_service_initialization', duration, true);
                
                // Performance assertion
                expect(duration).to.be.lessThan(config.performance.maxOperationTime);
                
            } catch (error) {
                const duration = performance.now() - startTime;
                trackPerformanceMetric('database_service_initialization', duration, false);
                throw error;
            }
        });

        it('should execute database operations with transaction support', async function() {
            this.timeout(10000);

            const databaseService = await initializeDatabaseService();
            const startTime = performance.now();

            try {
                // Test transaction execution
                const transactionResult = await databaseService.executeTransaction(
                    async (db) => {
                        // Simulate complex database operations
                        await new Promise(resolve => setTimeout(resolve, 100));
                        return { operationId: generateUUID(), itemsProcessed: 42 };
                    },
                    { mode: 'IMMEDIATE', timeout: 5000 }
                );

                expect(isApiSuccess(transactionResult)).to.be.true;
                
                if (isApiSuccess(transactionResult)) {
                    expect(transactionResult.data).to.have.property('operationId');
                    expect(transactionResult.data.itemsProcessed).to.equal(42);
                    expect(transactionResult.metadata?.responseTime).to.be.a('number');
                }

                const duration = performance.now() - startTime;
                trackPerformanceMetric('database_transaction_execution', duration, true);
                
                // Performance assertion
                expect(duration).to.be.lessThan(config.performance.maxOperationTime);

            } catch (error) {
                const duration = performance.now() - startTime;
                trackPerformanceMetric('database_transaction_execution', duration, false);
                throw error;
            }
        });

        it('should run migrations and create backup', async function() {
            this.timeout(15000);

            const databaseService = await initializeDatabaseService();
            
            // Test migrations
            const migrationStartTime = performance.now();
            try {
                const migrationResult = await databaseService.runMigrations();
                
                expect(isApiSuccess(migrationResult)).to.be.true;
                if (isApiSuccess(migrationResult)) {
                    expect(migrationResult.data).to.have.property('migrationsExecuted');
                    expect(migrationResult.data).to.have.property('currentVersion');
                }

                const migrationDuration = performance.now() - migrationStartTime;
                trackPerformanceMetric('database_migration_execution', migrationDuration, true);

            } catch (error) {
                const migrationDuration = performance.now() - migrationStartTime;
                trackPerformanceMetric('database_migration_execution', migrationDuration, false);
                throw error;
            }

            // Test backup creation
            const backupStartTime = performance.now();
            try {
                const backupResult = await databaseService.createBackup('full');
                
                expect(isApiSuccess(backupResult)).to.be.true;
                if (isApiSuccess(backupResult)) {
                    expect(backupResult.data).to.have.property('backupId');
                    expect(backupResult.data).to.have.property('strategy');
                    expect(backupResult.data.strategy).to.equal('full');
                }

                const backupDuration = performance.now() - backupStartTime;
                trackPerformanceMetric('database_backup_creation', backupDuration, true);

            } catch (error) {
                const backupDuration = performance.now() - backupStartTime;
                trackPerformanceMetric('database_backup_creation', backupDuration, false);
                throw error;
            }
        });
    });

    describe('Vector Database Service Integration', () => {
        it('should initialize vector database service with all dependencies', async function() {
            this.timeout(20000);

            const startTime = performance.now();
            
            try {
                const vectorService = await initializeVectorDatabaseService();
                
                // Verify service is initialized
                expect(vectorService).to.not.be.undefined;
                
                // Verify health status
                const health = await vectorService.getHealthStatus();
                expect(health.isHealthy).to.be.true;
                expect(health.connection.isConnected).to.be.true;
                
                const duration = performance.now() - startTime;
                trackPerformanceMetric('vector_service_initialization', duration, true);
                
                // Performance assertion
                expect(duration).to.be.lessThan(config.performance.maxOperationTime);
                
            } catch (error) {
                const duration = performance.now() - startTime;
                trackPerformanceMetric('vector_service_initialization', duration, false);
                throw error;
            }
        });

        it('should create project collection and manage vector contexts', async function() {
            this.timeout(15000);

            const vectorService = await initializeVectorDatabaseService();
            const projectId = testContext.testData.testProjectId;

            // Test collection creation
            const collectionStartTime = performance.now();
            try {
                const collectionResult = await vectorService.getOrCreateProjectCollection(projectId, {
                    dimension: 384,
                    metricType: 'COSINE',
                    description: `Test collection for project ${projectId}`
                });

                expect(collectionResult.success).to.be.true;
                if (collectionResult.success) {
                    expect(collectionResult.data).to.have.property('name');
                    expect(collectionResult.data.name).to.include(projectId.replace(/-/g, '_'));
                }

                const collectionDuration = performance.now() - collectionStartTime;
                trackPerformanceMetric('vector_collection_creation', collectionDuration, true);

            } catch (error) {
                const collectionDuration = performance.now() - collectionStartTime;
                trackPerformanceMetric('vector_collection_creation', collectionDuration, false);
                throw error;
            }

            // Test context insertion
            const contextNodes = await generateTestContextNodes(3);
            const insertStartTime = performance.now();
            
            try {
                const insertResult = await vectorService.addProjectContext(projectId, contextNodes);

                expect(insertResult.success).to.be.true;
                if (insertResult.success) {
                    expect(insertResult.data.insertedCount).to.equal(3);
                    expect(insertResult.data.errors).to.have.length(0);
                }

                const insertDuration = performance.now() - insertStartTime;
                trackPerformanceMetric('vector_context_insertion', insertDuration, true);

            } catch (error) {
                const insertDuration = performance.now() - insertStartTime;
                trackPerformanceMetric('vector_context_insertion', insertDuration, false);
                throw error;
            }
        });

        it('should perform semantic search with KPI compliance', async function() {
            this.timeout(15000);

            const vectorService = await initializeVectorDatabaseService();
            const projectId = testContext.testData.testProjectId;

            // Setup: Create collection and add contexts
            await vectorService.getOrCreateProjectCollection(projectId);
            const contextNodes = await generateTestContextNodes(5);
            await vectorService.addProjectContext(projectId, contextNodes);

            // Wait for indexing
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Test semantic search with KPI monitoring
            const searchStartTime = performance.now();
            try {
                const searchResult = await vectorService.searchProjectContext(
                    projectId,
                    'test function implementation',
                    {
                        relevanceThreshold: 0.7,
                        maxResults: 3,
                        strategy: 'hybrid'
                    }
                );

                expect(searchResult.success).to.be.true;
                if (searchResult.success) {
                    expect(searchResult.data).to.be.an('array');
                    expect(searchResult.data.length).to.be.greaterThan(0);
                    
                    // Verify result structure
                    const firstResult = searchResult.data[0];
                    expect(firstResult).to.have.property('contextNode');
                    expect(firstResult).to.have.property('score');
                    expect(firstResult.contextNode.projectId).to.equal(projectId);
                }

                const searchDuration = performance.now() - searchStartTime;
                trackPerformanceMetric('semantic_search_execution', searchDuration, true);

                // KPI Compliance Check
                expect(searchDuration).to.be.lessThan(config.vectorDb.contextRetrievalTarget,
                    `Context retrieval took ${searchDuration.toFixed(2)}ms, exceeding KPI target of ${config.vectorDb.contextRetrievalTarget}ms`);

            } catch (error) {
                const searchDuration = performance.now() - searchStartTime;
                trackPerformanceMetric('semantic_search_execution', searchDuration, false);
                throw error;
            }
        });
    });

    describe('Cross-Module Integration (Database + Vector Database)', () => {
        it('should coordinate database and vector database operations', async function() {
            this.timeout(25000);

            const startTime = performance.now();

            try {
                // Initialize both services
                const databaseService = await initializeDatabaseService();
                const vectorService = await initializeVectorDatabaseService();

                // Test coordinated operations
                const projectId = testContext.testData.testProjectId;

                // 1. Database transaction to create project metadata
                const projectResult = await databaseService.executeTransaction(async (db) => {
                    // Simulate project creation in database
                    return {
                        projectId,
                        name: `Test Project ${projectId}`,
                        createdAt: createTimestamp(),
                        phase: 'Phase1_ArchitecturalBlueprint' as PhaseType
                    };
                });

                expect(isApiSuccess(projectResult)).to.be.true;

                // 2. Vector database collection creation
                const collectionResult = await vectorService.getOrCreateProjectCollection(projectId, {
                    dimension: 384,
                    description: 'Integration test collection'
                });

                expect(collectionResult.success).to.be.true;

                // 3. Coordinated data insertion
                const contextNodes = await generateTestContextNodes(4);
                const insertResult = await vectorService.addProjectContext(projectId, contextNodes);

                expect(insertResult.success).to.be.true;
                if (insertResult.success) {
                    expect(insertResult.data.insertedCount).to.equal(4);
                }

                // 4. Cross-service health validation
                const dbHealth = await databaseService.getHealthStatus();
                const vectorHealth = await vectorService.getHealthStatus();

                expect(isApiSuccess(dbHealth)).to.be.true;
                expect(vectorHealth.isHealthy).to.be.true;

                if (isApiSuccess(dbHealth)) {
                    expect(dbHealth.data.isHealthy).to.be.true;
                }

                const duration = performance.now() - startTime;
                trackPerformanceMetric('cross_module_coordination', duration, true);

                // Performance assertion for full workflow
                expect(duration).to.be.lessThan(config.performance.maxOperationTime * 2);

            } catch (error) {
                const duration = performance.now() - startTime;
                trackPerformanceMetric('cross_module_coordination', duration, false);
                throw error;
            }
        });

        it('should handle error scenarios and recovery gracefully', async function() {
            this.timeout(15000);

            const databaseService = await initializeDatabaseService();
            const vectorService = await initializeVectorDatabaseService();

            const startTime = performance.now();

            try {
                // Test 1: Database transaction rollback
                const transactionResult = await databaseService.executeTransaction(async (db) => {
                    // Simulate an error that should trigger rollback
                    throw new ReadyAIError('Simulated transaction error', 'TEST_ERROR', 500);
                }, { mode: 'IMMEDIATE', timeout: 5000 });

                // Should return error result, not throw
                expect(isApiSuccess(transactionResult)).to.be.false;
                if (!isApiSuccess(transactionResult)) {
                    expect(transactionResult.error.code).to.equal('DATABASE_TRANSACTION_FAILED');
                }

                // Test 2: Vector search on non-existent collection
                const nonExistentProjectId = generateUUID();
                const searchResult = await vectorService.searchProjectContext(
                    nonExistentProjectId,
                    'test query',
                    { maxResults: 5 }
                );

                // Should handle gracefully
                expect(searchResult.success).to.be.false;
                if (!searchResult.success) {
                    expect(searchResult.error.code).to.include('SEARCH');
                }

                // Test 3: Service recovery - both services should still be healthy
                const dbHealth = await databaseService.getHealthStatus();
                const vectorHealth = await vectorService.getHealthStatus();

                expect(isApiSuccess(dbHealth)).to.be.true;
                expect(vectorHealth.isHealthy).to.be.true;

                const duration = performance.now() - startTime;
                trackPerformanceMetric('error_handling_recovery', duration, true);

            } catch (error) {
                const duration = performance.now() - startTime;
                trackPerformanceMetric('error_handling_recovery', duration, false);
                throw error;
            }
        });
    });

    describe('Performance and KPI Validation', () => {
        it('should meet ReadyAI performance KPIs across all operations', async function() {
            this.timeout(30000);

            const databaseService = await initializeDatabaseService();
            const vectorService = await initializeVectorDatabaseService();
            const projectId = testContext.testData.testProjectId;

            // Setup test data
            await vectorService.getOrCreateProjectCollection(projectId);
            const contextNodes = await generateTestContextNodes(10);
            await vectorService.addProjectContext(projectId, contextNodes);

            // Performance test batch
            const batchSize = 10;
            const operationResults: Array<{ operation: string; duration: number; success: boolean }> = [];

            for (let i = 0; i < batchSize; i++) {
                // Database operation
                const dbStart = performance.now();
                try {
                    const dbResult = await databaseService.execute(async (db) => {
                        await new Promise(resolve => setTimeout(resolve, 50)); // Simulate work
                        return { iteration: i, timestamp: createTimestamp() };
                    });

                    const dbDuration = performance.now() - dbStart;
                    operationResults.push({ operation: 'database', duration: dbDuration, success: isApiSuccess(dbResult) });

                } catch (error) {
                    const dbDuration = performance.now() - dbStart;
                    operationResults.push({ operation: 'database', duration: dbDuration, success: false });
                }

                // Vector search operation
                const searchStart = performance.now();
                try {
                    const searchResult = await vectorService.searchProjectContext(
                        projectId,
                        `test query ${i}`,
                        { maxResults: 3 }
                    );

                    const searchDuration = performance.now() - searchStart;
                    operationResults.push({ operation: 'vector_search', duration: searchDuration, success: searchResult.success });

                    // KPI compliance check for each search
                    expect(searchDuration).to.be.lessThan(config.vectorDb.contextRetrievalTarget);

                } catch (error) {
                    const searchDuration = performance.now() - searchStart;
                    operationResults.push({ operation: 'vector_search', duration: searchDuration, success: false });
                }
            }

            // Performance analysis
            const dbOperations = operationResults.filter(r => r.operation === 'database');
            const searchOperations = operationResults.filter(r => r.operation === 'vector_search');

            const avgDbLatency = dbOperations.reduce((sum, op) => sum + op.duration, 0) / dbOperations.length;
            const avgSearchLatency = searchOperations.reduce((sum, op) => sum + op.duration, 0) / searchOperations.length;

            const dbSuccessRate = dbOperations.filter(op => op.success).length / dbOperations.length * 100;
            const searchSuccessRate = searchOperations.filter(op => op.success).length / searchOperations.length * 100;

            console.log(`📊 Performance KPI Results:
                Database Operations:
                - Average Latency: ${avgDbLatency.toFixed(2)}ms
                - Success Rate: ${dbSuccessRate.toFixed(1)}%
                
                Vector Search Operations:
                - Average Latency: ${avgSearchLatency.toFixed(2)}ms
                - Success Rate: ${searchSuccessRate.toFixed(1)}%
                - KPI Compliance: ${searchOperations.every(op => op.duration < config.vectorDb.contextRetrievalTarget) ? 'PASS' : 'FAIL'}`);

            // KPI Assertions
            expect(avgDbLatency).to.be.lessThan(1000, 'Database average latency should be under 1 second');
            expect(avgSearchLatency).to.be.lessThan(config.vectorDb.contextRetrievalTarget, 
                `Vector search average latency should be under ${config.vectorDb.contextRetrievalTarget}ms`);
            expect(dbSuccessRate).to.be.greaterThan(95, 'Database operations should have >95% success rate');
            expect(searchSuccessRate).to.be.greaterThan(95, 'Vector search operations should have >95% success rate');
        });

        it('should provide comprehensive performance metrics and monitoring', async function() {
            this.timeout(10000);

            const databaseService = await initializeDatabaseService();
            const vectorService = await initializeVectorDatabaseService();

            // Get service performance metrics
            const dbHealth = await databaseService.getHealthStatus();
            const vectorMetrics = vectorService.getPerformanceMetrics();

            // Database metrics validation
            expect(isApiSuccess(dbHealth)).to.be.true;
            if (isApiSuccess(dbHealth)) {
                expect(dbHealth.data.performance).to.have.property('averageResponseTime');
                expect(dbHealth.data.performance).to.have.property('totalOperations');
                expect(dbHealth.data.performance).to.have.property('errorRate');
            }

            // Vector database metrics validation
            expect(vectorMetrics).to.have.property('operations');
            expect(vectorMetrics).to.have.property('contextRetrieval');
            expect(vectorMetrics).to.have.property('services');

            expect(vectorMetrics.contextRetrieval).to.have.property('averageTime');
            expect(vectorMetrics.contextRetrieval).to.have.property('kpiCompliance');
            
            // KPI compliance should be measurable
            expect(vectorMetrics.contextRetrieval.kpiCompliance).to.be.a('number');
            expect(vectorMetrics.contextRetrieval.kpiCompliance).to.be.at.least(0);
            expect(vectorMetrics.contextRetrieval.kpiCompliance).to.be.at.most(100);

            console.log(`📈 Service Metrics Summary:
                Database Health: ${isApiSuccess(dbHealth) && dbHealth.data.isHealthy ? 'Healthy' : 'Unhealthy'}
                Vector KPI Compliance: ${vectorMetrics.contextRetrieval.kpiCompliance.toFixed(1)}%
                Total Test Operations: ${testContext.assertions.totalOperations}
                Test Success Rate: ${testContext.assertions.totalOperations > 0 ? (testContext.assertions.successfulOperations / testContext.assertions.totalOperations * 100).toFixed(1) : 0}%`);
        });
    });

    describe('Production Readiness Validation', () => {
        it('should demonstrate production-ready service lifecycle management', async function() {
            this.timeout(20000);

            // Test full service lifecycle
            let databaseService: DatabaseService | undefined;
            let vectorService: VectorDatabaseService | undefined;

            try {
                // 1. Cold start initialization
                const initStart = performance.now();
                databaseService = await initializeDatabaseService();
                vectorService = await initializeVectorDatabaseService();
                const initDuration = performance.now() - initStart;

                trackPerformanceMetric('cold_start_initialization', initDuration, true);
                expect(initDuration).to.be.lessThan(15000); // 15 seconds max for cold start

                // 2. Warm-up operations
                const warmupStart = performance.now();
                const projectId = testContext.testData.testProjectId;
                
                await vectorService.getOrCreateProjectCollection(projectId);
                const contextNodes = await generateTestContextNodes(3);
                await vectorService.addProjectContext(projectId, contextNodes);
                
                const warmupDuration = performance.now() - warmupStart;
                trackPerformanceMetric('service_warmup', warmupDuration, true);

                // 3. Graceful shutdown test
                const shutdownStart = performance.now();
                
                await vectorService.shutdown();
                await databaseService.shutdown();
                
                const shutdownDuration = performance.now() - shutdownStart;
                trackPerformanceMetric('graceful_shutdown', shutdownDuration, true);
                expect(shutdownDuration).to.be.lessThan(10000); // 10 seconds max for shutdown

                // Clear references after successful shutdown
                vectorService = undefined;
                databaseService = undefined;
                testContext.services.database = undefined;
                testContext.services.vectorDatabase = undefined;

                console.log(`🏭 Production Lifecycle Metrics:
                    - Cold Start: ${initDuration.toFixed(2)}ms
                    - Warmup: ${warmupDuration.toFixed(2)}ms
                    - Shutdown: ${shutdownDuration.toFixed(2)}ms`);

            } catch (error) {
                // Ensure cleanup even on failure
                if (vectorService) await vectorService.shutdown().catch(() => {});
                if (databaseService) await databaseService.shutdown().catch(() => {});
                throw error;
            }
        });

        it('should validate integration with ReadyAI logging and error handling', async function() {
            this.timeout(10000);

            const databaseService = await initializeDatabaseService();
            const vectorService = await initializeVectorDatabaseService();

            // Test error propagation and logging
            const errorScenarios = [
                {
                    name: 'invalid_database_operation',
                    operation: () => databaseService.execute(async () => {
                        throw new ReadyAIError('Test database error', 'TEST_DB_ERROR', 500);
                    })
                },
                {
                    name: 'invalid_vector_search',
                    operation: () => vectorService.searchProjectContext(
                        'invalid-uuid-format',
                        'test',
                        { maxResults: 1 }
                    )
                }
            ];

            for (const scenario of errorScenarios) {
                const startTime = performance.now();
                try {
                    const result = await scenario.operation();
                    
                    // Should return error result, not throw
                    if ('success' in result) {
                        expect(result.success).to.be.false;
                    } else {
                        expect(isApiSuccess(result)).to.be.false;
                    }

                    const duration = performance.now() - startTime;
                    trackPerformanceMetric(scenario.name, duration, true);

                } catch (error) {
                    const duration = performance.now() - startTime;
                    trackPerformanceMetric(scenario.name, duration, false);
                    
                    // Verify error is properly typed ReadyAI error
                    expect(error).to.be.instanceOf(ReadyAIError);
                    if (error instanceof ReadyAIError) {
                        expect(error.code).to.be.a('string');
                        expect(error.statusCode).to.be.a('number');
                    }
                }
            }

            // Verify services remain healthy after error scenarios
            const dbHealth = await databaseService.getHealthStatus();
            const vectorHealth = await vectorService.getHealthStatus();

            expect(isApiSuccess(dbHealth)).to.be.true;
            expect(vectorHealth.isHealthy).to.be.true;
        });
    });

    /**
     * Final integration summary and validation
     */
    after(function() {
        if (testContext) {
            const totalTestTime = performance.now() - testContext.startTime;
            const successRate = testContext.assertions.totalOperations > 0
                ? (testContext.assertions.successfulOperations / testContext.assertions.totalOperations) * 100
                : 0;

            console.log(`\n🎯 ReadyAI Phase 1.2 Integration Test Summary:
                ✅ All Database Management Module tests completed
                ✅ All Vector Database Service tests completed  
                ✅ All Cross-Module Integration tests completed
                ✅ All Performance KPI validations completed
                ✅ All Production Readiness tests completed
                
                📊 Final Metrics:
                - Total Test Duration: ${totalTestTime.toFixed(2)}ms
                - Total Operations: ${testContext.assertions.totalOperations}
                - Success Rate: ${successRate.toFixed(1)}%
                - Average Latency: ${testContext.assertions.averageLatency.toFixed(2)}ms
                
                🚀 Phase 1.2 Integration: ${successRate >= 95 ? 'PRODUCTION READY' : 'NEEDS OPTIMIZATION'}
            `);
        }
    });
});
