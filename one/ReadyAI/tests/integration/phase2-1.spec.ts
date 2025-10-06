// tests/integration/phase2-1.spec.ts

/**
 * ReadyAI Phase 2.1 Integration Tests - Project Management Module End-to-End Scenarios
 * 
 * Comprehensive integration tests that validate all Phase 2.1 Project Management modules
 * working together, adapting Cline's proven integration test patterns with ReadyAI-specific
 * project lifecycle and orchestration operations.
 * 
 * Reuse Strategy: 80% Adapt from Cline integration test patterns
 * - Direct adaptation of Cline's comprehensive TaskManager and WorkspaceManager test architecture
 * - Enhanced with ReadyAI project management and orchestration scenario testing
 * - Maintains Cline's reliability patterns with project-specific validations
 * 
 * Key Test Scenarios:
 * - Project lifecycle management (create, configure, execute, complete)
 * - Phase orchestration and workflow coordination
 * - Cross-module integration with all Phase 1 services
 * - Project state management and persistence
 * - Real-time project updates and event handling
 * - Production-ready project management operations
 * - Performance monitoring and KPI compliance
 * 
 * @version 1.0.0 - Phase 2.1 Integration Testing
 * @author ReadyAI Development Team
 */

import { describe, it, beforeEach, afterEach, before, after } from 'mocha';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { performance } from 'perf_hooks';
import { randomUUID } from 'crypto';
import * as express from 'express';
import * as supertest from 'supertest';

// ReadyAI Core Dependencies
import {
    UUID,
    ApiResponse,
    ReadyAIError,
    generateUUID,
    createTimestamp,
    isApiSuccess,
    createApiResponse,
    wrapAsync,
    HTTP_STATUS,
    ERROR_CODES
} from '../../packages/foundation/types/core.js';

// Phase 1 Dependencies
import { ConfigService } from '../../packages/config/services/ConfigService.js';
import { DatabaseService } from '../../packages/database/services/DatabaseService.js';
import { VectorDatabaseService } from '../../packages/vectordb/services/VectorDatabaseService.js';
import { AuthService } from '../../packages/auth/services/AuthService.js';
import { GatewayService } from '../../packages/api-gateway/services/GatewayService.js';
import { ErrorService } from '../../packages/error-handling/services/ErrorService.js';
import { Logger } from '../../packages/logging/services/Logger.js';
import { FileOperationsService } from '../../packages/filesystem/services/FileOperationsService.js';

// Phase 2.1 Project Management Dependencies
import { ProjectService } from '../../packages/project-management/services/ProjectService.js';
import { ProjectOrchestrator } from '../../packages/project-management/services/ProjectOrchestrator.js';
import { ProjectCreationService } from '../../packages/project-management/services/ProjectCreationService.js';
import { ProjectStateManager } from '../../packages/project-management/services/ProjectStateManager.js';
import { ProjectWorkspaceManager } from '../../packages/project-management/services/ProjectWorkspaceManager.js';
import { PhaseManager } from '../../packages/project-management/services/PhaseManager.js';
import { ServiceCoordinator } from '../../packages/project-management/services/ServiceCoordinator.js';
import { ProjectEventService } from '../../packages/project-management/services/ProjectEventService.js';
import { ProjectMetadataService } from '../../packages/project-management/services/ProjectMetadataService.js';
import { ProjectSettingsService } from '../../packages/project-management/services/ProjectSettingsService.js';

import type {
    ProjectConfig,
    ProjectData,
    ProjectPhase,
    ProjectState,
    ProjectLifecycleState,
    PhaseTransition,
    OrchestrationContext,
    ProjectEventData,
    ProjectMetadata,
    WorkspaceStructure,
    PhaseExecutionResult
} from '../../packages/project-management/types/project.js';

import type {
    PhaseDefinition,
    PhaseProgressData,
    PhaseValidationResult,
    OrchestrationStrategy
} from '../../packages/project-management/types/lifecycle.js';

import type {
    ServiceIntegration,
    ModuleCoordination,
    CrossModuleEvent
} from '../../packages/project-management/types/orchestration.js';

/**
 * Test configuration adapted from Cline's proven TaskManager test setup patterns
 */
interface Phase21TestConfig {
    projectManagement: {
        maxProjectsPerUser: number;
        defaultProjectTimeout: number;
        enableAutoSave: boolean;
        saveInterval: number;
        enableEventLogging: boolean;
    };
    orchestration: {
        maxParallelPhases: number;
        phaseTimeout: number;
        enablePhaseRecovery: boolean;
        retryAttempts: number;
        coordinationInterval: number;
    };
    workspace: {
        baseWorkspaceDir: string;
        enableWorkspaceCleanup: boolean;
        maxWorkspaceSize: string;
        enableVersioning: boolean;
    };
    performance: {
        maxProjectCreationTime: number;
        maxPhaseExecutionTime: number;
        maxOrchestrationTime: number;
        maxWorkspaceSetupTime: number;
    };
    testing: {
        enableMockData: boolean;
        cleanupOnSuccess: boolean;
        retainLogsOnFailure: boolean;
        enablePerformanceTracking: boolean;
    };
}

const DEFAULT_TEST_CONFIG: Phase21TestConfig = {
    projectManagement: {
        maxProjectsPerUser: 10,
        defaultProjectTimeout: 3600000, // 1 hour
        enableAutoSave: true,
        saveInterval: 30000, // 30 seconds
        enableEventLogging: true
    },
    orchestration: {
        maxParallelPhases: 3,
        phaseTimeout: 600000, // 10 minutes
        enablePhaseRecovery: true,
        retryAttempts: 3,
        coordinationInterval: 5000 // 5 seconds
    },
    workspace: {
        baseWorkspaceDir: '/tmp/readyai-test-workspaces',
        enableWorkspaceCleanup: true,
        maxWorkspaceSize: '100MB',
        enableVersioning: true
    },
    performance: {
        maxProjectCreationTime: 5000, // 5 seconds
        maxPhaseExecutionTime: 30000, // 30 seconds
        maxOrchestrationTime: 15000, // 15 seconds
        maxWorkspaceSetupTime: 3000 // 3 seconds
    },
    testing: {
        enableMockData: true,
        cleanupOnSuccess: true,
        retainLogsOnFailure: false,
        enablePerformanceTracking: true
    }
};

/**
 * Integration test context for comprehensive project management testing
 * Following Cline's TaskManager context management patterns
 */
interface ProjectManagementTestContext {
    testId: UUID;
    startTime: number;
    
    // Core services from Phase 1
    coreServices: {
        config?: ConfigService;
        database?: DatabaseService;
        vectorDb?: VectorDatabaseService;
        auth?: AuthService;
        gateway?: GatewayService;
        errorService?: ErrorService;
        logger?: Logger;
        fileOps?: FileOperationsService;
    };
    
    // Phase 2.1 project management services
    projectServices: {
        projectService?: ProjectService;
        orchestrator?: ProjectOrchestrator;
        creationService?: ProjectCreationService;
        stateManager?: ProjectStateManager;
        workspaceManager?: ProjectWorkspaceManager;
        phaseManager?: PhaseManager;
        coordinator?: ServiceCoordinator;
        eventService?: ProjectEventService;
        metadataService?: ProjectMetadataService;
        settingsService?: ProjectSettingsService;
    };
    
    // Test data and state
    testData: {
        testUserId: UUID;
        testProjects: Array<{
            id: UUID;
            name: string;
            config: ProjectConfig;
            state: ProjectLifecycleState;
            workspacePath?: string;
        }>;
        performanceMetrics: Array<{
            operation: string;
            duration: number;
            success: boolean;
            timestamp: string;
            metadata?: Record<string, any>;
        }>;
        eventLog: Array<{
            eventType: string;
            projectId?: UUID;
            phaseId?: string;
            data: any;
            timestamp: string;
        }>;
    };
    
    // Server and API setup
    server: {
        app?: express.Application;
        instance?: any;
        port?: number;
        baseUrl?: string;
    };
    
    // Cleanup functions
    cleanup: Array<() => Promise<void>>;
    
    // Test assertions and metrics
    assertions: {
        totalOperations: number;
        successfulOperations: number;
        failedOperations: number;
        averageLatency: number;
        projectsCreated: number;
        phasesExecuted: number;
        eventsProcessed: number;
    };
}

describe('ReadyAI Phase 2.1 Integration Tests - Project Management Module', () => {
    let testContext: ProjectManagementTestContext;
    let sandbox: sinon.SinonSandbox;
    let config: Phase21TestConfig;

    // Global test setup following Cline's TaskManager patterns
    before(async function() {
        this.timeout(45000); // 45 seconds for comprehensive setup

        console.log('🚀 Setting up ReadyAI Phase 2.1 Project Management Integration Test Environment...');

        // Initialize test configuration
        config = { ...DEFAULT_TEST_CONFIG };

        // Setup sandbox for reliable test isolation
        sandbox = sinon.createSandbox();

        console.log('✅ Phase 2.1 Project Management Integration Test Environment Ready');
    });

    // Global test teardown
    after(async function() {
        this.timeout(20000); // 20 seconds for cleanup

        console.log('🧹 Cleaning up Phase 2.1 Project Management Integration Test Environment...');

        if (sandbox) {
            sandbox.restore();
        }

        console.log('✅ Phase 2.1 Project Management Integration Test Cleanup Complete');
    });

    // Individual test setup
    beforeEach(async function() {
        this.timeout(15000); // 15 seconds for each test setup

        const testId = generateUUID();
        console.log(`📋 Setting up project management test context for: ${this.currentTest?.title} (${testId})`);

        testContext = {
            testId,
            startTime: performance.now(),
            coreServices: {},
            projectServices: {},
            testData: {
                testUserId: generateUUID(),
                testProjects: [],
                performanceMetrics: [],
                eventLog: []
            },
            server: {},
            cleanup: [],
            assertions: {
                totalOperations: 0,
                successfulOperations: 0,
                failedOperations: 0,
                averageLatency: 0,
                projectsCreated: 0,
                phasesExecuted: 0,
                eventsProcessed: 0
            }
        };
    });

    // Individual test teardown with comprehensive cleanup
    afterEach(async function() {
        this.timeout(15000); // 15 seconds for each test cleanup

        if (!testContext) return;

        console.log(`🧹 Cleaning up project management test context for: ${this.currentTest?.title}`);

        // Execute all cleanup functions in reverse order
        const cleanupPromises = testContext.cleanup.reverse().map(cleanup => 
            cleanup().catch(error => {
                console.warn('Project management cleanup function failed:', error);
                return Promise.resolve();
            })
        );

        await Promise.all(cleanupPromises);

        // Stop server if running
        if (testContext.server.instance) {
            try {
                await new Promise<void>((resolve) => {
                    testContext.server.instance.close(() => resolve());
                });
            } catch (error) {
                console.warn('Server cleanup failed:', error);
            }
        }

        // Shutdown all project services gracefully
        const serviceShutdowns = Object.values(testContext.projectServices)
            .filter(service => service && typeof service.shutdown === 'function')
            .map(service => service.shutdown().catch(console.warn));

        const coreShutdowns = Object.values(testContext.coreServices)
            .filter(service => service && typeof service.shutdown === 'function')
            .map(service => service.shutdown().catch(console.warn));

        await Promise.all([...serviceShutdowns, ...coreShutdowns]);

        // Calculate and log comprehensive test performance metrics
        const testDuration = performance.now() - testContext.startTime;
        const avgLatency = testContext.testData.performanceMetrics.length > 0
            ? testContext.testData.performanceMetrics.reduce((sum, metric) => sum + metric.duration, 0) / testContext.testData.performanceMetrics.length
            : 0;

        console.log(`📊 Project Management Test Performance Summary:
            - Test Duration: ${testDuration.toFixed(2)}ms
            - Total Operations: ${testContext.assertions.totalOperations}
            - Success Rate: ${testContext.assertions.totalOperations > 0 ? (testContext.assertions.successfulOperations / testContext.assertions.totalOperations * 100).toFixed(1) : 0}%
            - Average Latency: ${avgLatency.toFixed(2)}ms
            - Projects Created: ${testContext.assertions.projectsCreated}
            - Phases Executed: ${testContext.assertions.phasesExecuted}
            - Events Processed: ${testContext.assertions.eventsProcessed}`);

        testContext = null as any;
    });

    /**
     * Helper functions adapted from Cline's TaskManager test utilities
     */

    async function initializeCoreServices(): Promise<void> {
        console.log('Initializing core Phase 1 services...');

        // Initialize configuration service
        testContext.coreServices.config = new ConfigService({
            enableLocalStorage: true,
            configPath: '/tmp/readyai-test-config.json'
        });
        await testContext.coreServices.config.initialize();

        // Initialize database service
        testContext.coreServices.database = new DatabaseService({
            type: 'sqlite',
            database: ':memory:',
            synchronize: true
        });
        await testContext.coreServices.database.initialize();

        // Initialize logger
        testContext.coreServices.logger = new Logger({
            level: 'debug',
            enableConsole: true,
            enableFile: false
        });

        // Initialize error service
        testContext.coreServices.errorService = new ErrorService({
            enableRecovery: true,
            maxRetryAttempts: 3
        });
        await testContext.coreServices.errorService.initialize();

        // Initialize file operations
        testContext.coreServices.fileOps = new FileOperationsService({
            baseDir: config.workspace.baseWorkspaceDir,
            enableVersioning: config.workspace.enableVersioning
        });

        // Add cleanup for core services
        testContext.cleanup.push(async () => {
            await Promise.all([
                testContext.coreServices.config?.shutdown(),
                testContext.coreServices.database?.shutdown(),
                testContext.coreServices.errorService?.shutdown()
            ].filter(Boolean));
        });

        console.log('✅ Core Phase 1 services initialized');
    }

    async function initializeProjectManagementServices(): Promise<void> {
        console.log('Initializing Phase 2.1 project management services...');

        // Initialize project state manager
        testContext.projectServices.stateManager = new ProjectStateManager({
            databaseService: testContext.coreServices.database!,
            enableAutoSave: config.projectManagement.enableAutoSave,
            saveInterval: config.projectManagement.saveInterval
        });

        // Initialize workspace manager
        testContext.projectServices.workspaceManager = new ProjectWorkspaceManager({
            fileOperationsService: testContext.coreServices.fileOps!,
            baseWorkspaceDir: config.workspace.baseWorkspaceDir,
            enableCleanup: config.workspace.enableWorkspaceCleanup
        });

        // Initialize project event service
        testContext.projectServices.eventService = new ProjectEventService({
            logger: testContext.coreServices.logger!,
            enableLogging: config.projectManagement.enableEventLogging
        });

        // Initialize metadata service
        testContext.projectServices.metadataService = new ProjectMetadataService({
            databaseService: testContext.coreServices.database!,
            eventService: testContext.projectServices.eventService!
        });

        // Initialize settings service
        testContext.projectServices.settingsService = new ProjectSettingsService({
            configService: testContext.coreServices.config!,
            eventService: testContext.projectServices.eventService!
        });

        // Initialize project creation service
        testContext.projectServices.creationService = new ProjectCreationService({
            workspaceManager: testContext.projectServices.workspaceManager!,
            metadataService: testContext.projectServices.metadataService!,
            settingsService: testContext.projectServices.settingsService!,
            eventService: testContext.projectServices.eventService!
        });

        // Initialize phase manager
        testContext.projectServices.phaseManager = new PhaseManager({
            stateManager: testContext.projectServices.stateManager!,
            eventService: testContext.projectServices.eventService!,
            maxParallelPhases: config.orchestration.maxParallelPhases,
            phaseTimeout: config.orchestration.phaseTimeout,
            enableRecovery: config.orchestration.enablePhaseRecovery
        });

        // Initialize service coordinator
        testContext.projectServices.coordinator = new ServiceCoordinator({
            coreServices: testContext.coreServices,
            logger: testContext.coreServices.logger!,
            coordinationInterval: config.orchestration.coordinationInterval
        });

        // Initialize project orchestrator
        testContext.projectServices.orchestrator = new ProjectOrchestrator({
            phaseManager: testContext.projectServices.phaseManager!,
            coordinator: testContext.projectServices.coordinator!,
            eventService: testContext.projectServices.eventService!,
            maxRetryAttempts: config.orchestration.retryAttempts
        });

        // Initialize main project service
        testContext.projectServices.projectService = new ProjectService({
            creationService: testContext.projectServices.creationService!,
            stateManager: testContext.projectServices.stateManager!,
            orchestrator: testContext.projectServices.orchestrator!,
            metadataService: testContext.projectServices.metadataService!,
            settingsService: testContext.projectServices.settingsService!,
            eventService: testContext.projectServices.eventService!,
            maxProjectsPerUser: config.projectManagement.maxProjectsPerUser
        });

        // Initialize all services
        await Promise.all([
            testContext.projectServices.stateManager.initialize(),
            testContext.projectServices.workspaceManager.initialize(),
            testContext.projectServices.eventService.initialize(),
            testContext.projectServices.metadataService.initialize(),
            testContext.projectServices.settingsService.initialize(),
            testContext.projectServices.creationService.initialize(),
            testContext.projectServices.phaseManager.initialize(),
            testContext.projectServices.coordinator.initialize(),
            testContext.projectServices.orchestrator.initialize(),
            testContext.projectServices.projectService.initialize()
        ]);

        // Add cleanup for project services
        testContext.cleanup.push(async () => {
            await Promise.all([
                testContext.projectServices.projectService?.shutdown(),
                testContext.projectServices.orchestrator?.shutdown(),
                testContext.projectServices.coordinator?.shutdown(),
                testContext.projectServices.phaseManager?.shutdown(),
                testContext.projectServices.creationService?.shutdown(),
                testContext.projectServices.settingsService?.shutdown(),
                testContext.projectServices.metadataService?.shutdown(),
                testContext.projectServices.eventService?.shutdown(),
                testContext.projectServices.workspaceManager?.shutdown(),
                testContext.projectServices.stateManager?.shutdown()
            ].filter(Boolean));
        });

        console.log('✅ Phase 2.1 project management services initialized');
    }

    function trackPerformanceMetric(operation: string, duration: number, success: boolean, metadata?: Record<string, any>): void {
        testContext.testData.performanceMetrics.push({
            operation,
            duration,
            success,
            timestamp: createTimestamp(),
            metadata
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

    function trackProjectEvent(eventType: string, projectId?: UUID, phaseId?: string, data?: any): void {
        testContext.testData.eventLog.push({
            eventType,
            projectId,
            phaseId,
            data,
            timestamp: createTimestamp()
        });

        testContext.assertions.eventsProcessed++;
    }

    async function createTestProject(projectName: string, customConfig?: Partial<ProjectConfig>): Promise<{ id: UUID; config: ProjectConfig }> {
        const projectId = generateUUID();
        const projectConfig: ProjectConfig = {
            name: projectName,
            description: `Test project: ${projectName}`,
            type: 'web-application',
            phases: [
                { id: 'planning', name: 'Planning Phase', dependencies: [] },
                { id: 'implementation', name: 'Implementation Phase', dependencies: ['planning'] },
                { id: 'testing', name: 'Testing Phase', dependencies: ['implementation'] },
                { id: 'deployment', name: 'Deployment Phase', dependencies: ['testing'] }
            ],
            settings: {
                enableAutoSave: true,
                enableVersionControl: true,
                maxFileSize: '10MB',
                allowedFileTypes: ['.ts', '.js', '.tsx', '.jsx', '.json', '.md']
            },
            metadata: {
                createdBy: testContext.testData.testUserId,
                createdAt: createTimestamp(),
                tags: ['test', 'integration'],
                priority: 'medium'
            },
            ...customConfig
        };

        testContext.testData.testProjects.push({
            id: projectId,
            name: projectName,
            config: projectConfig,
            state: 'created' as ProjectLifecycleState
        });

        testContext.assertions.projectsCreated++;
        trackProjectEvent('project_created', projectId, undefined, { name: projectName });

        return { id: projectId, config: projectConfig };
    }

    async function setupTestServer(): Promise<express.Application> {
        const app = express();

        // Setup basic middleware
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));

        // Add project management test routes
        app.get('/health', (req, res) => {
            res.json({ status: 'ok', timestamp: createTimestamp() });
        });

        app.get('/api/projects', async (req, res) => {
            try {
                const result = await testContext.projectServices.projectService!.getAllProjects(testContext.testData.testUserId);
                if (isApiSuccess(result)) {
                    res.json({ success: true, data: result.data });
                } else {
                    res.status(400).json({ success: false, error: result.error });
                }
            } catch (error) {
                res.status(500).json({ success: false, error: (error as Error).message });
            }
        });

        app.post('/api/projects', async (req, res) => {
            try {
                const { name, config } = req.body;
                const result = await testContext.projectServices.projectService!.createProject(testContext.testData.testUserId, name, config);
                if (isApiSuccess(result)) {
                    res.json({ success: true, data: result.data });
                } else {
                    res.status(400).json({ success: false, error: result.error });
                }
            } catch (error) {
                res.status(500).json({ success: false, error: (error as Error).message });
            }
        });

        app.post('/api/projects/:projectId/phases/:phaseId/execute', async (req, res) => {
            try {
                const { projectId, phaseId } = req.params;
                const result = await testContext.projectServices.orchestrator!.executePhase(projectId as UUID, phaseId, req.body);
                if (isApiSuccess(result)) {
                    res.json({ success: true, data: result.data });
                } else {
                    res.status(400).json({ success: false, error: result.error });
                }
            } catch (error) {
                res.status(500).json({ success: false, error: (error as Error).message });
            }
        });

        // Error handling middleware
        app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
            console.error('Test server error:', error);
            res.status(500).json({ error: 'Internal server error', message: error.message });
        });

        testContext.server.app = app;
        return app;
    }

    /**
     * Phase 2.1 Core Integration Tests
     */

    describe('Project Management Service Integration', () => {
        it('should initialize all project management services with proper dependencies', async function() {
            this.timeout(20000);

            const startTime = performance.now();

            try {
                await initializeCoreServices();
                await initializeProjectManagementServices();

                // Verify all services are initialized
                expect(testContext.projectServices.projectService).to.not.be.undefined;
                expect(testContext.projectServices.orchestrator).to.not.be.undefined;
                expect(testContext.projectServices.creationService).to.not.be.undefined;
                expect(testContext.projectServices.stateManager).to.not.be.undefined;
                expect(testContext.projectServices.workspaceManager).to.not.be.undefined;
                expect(testContext.projectServices.phaseManager).to.not.be.undefined;
                expect(testContext.projectServices.coordinator).to.not.be.undefined;
                expect(testContext.projectServices.eventService).to.not.be.undefined;

                // Verify health status of main project service
                const health = await testContext.projectServices.projectService!.getHealthStatus();
                expect(isApiSuccess(health)).to.be.true;
                if (isApiSuccess(health)) {
                    expect(health.data.isHealthy).to.be.true;
                    expect(health.data.services).to.have.property('creationService');
                    expect(health.data.services).to.have.property('orchestrator');
                    expect(health.data.services).to.have.property('stateManager');
                }

                const duration = performance.now() - startTime;
                trackPerformanceMetric('project_services_initialization', duration, true);

                // Performance assertion
                expect(duration).to.be.lessThan(config.performance.maxProjectCreationTime * 3); // 3x for full initialization

            } catch (error) {
                const duration = performance.now() - startTime;
                trackPerformanceMetric('project_services_initialization', duration, false);
                throw error;
            }
        });

        it('should create projects with proper workspace and configuration setup', async function() {
            this.timeout(15000);

            await initializeCoreServices();
            await initializeProjectManagementServices();

            const projectCreationStartTime = performance.now();

            try {
                const { id: projectId, config: projectConfig } = await createTestProject('E2E Test Project');

                // Create project through the service
                const creationResult = await testContext.projectServices.projectService!.createProject(
                    testContext.testData.testUserId,
                    projectConfig.name,
                    projectConfig
                );

                expect(isApiSuccess(creationResult)).to.be.true;
                
                if (isApiSuccess(creationResult)) {
                    const project = creationResult.data;
                    expect(project).to.have.property('id');
                    expect(project).to.have.property('name', projectConfig.name);
                    expect(project).to.have.property('state');
                    expect(project).to.have.property('workspacePath');
                    expect(project.phases).to.have.lengthOf(4);
                    expect(project.phases[0]).to.have.property('id', 'planning');
                    expect(project.phases[1]).to.have.property('id', 'implementation');
                    expect(project.phases[2]).to.have.property('id', 'testing');
                    expect(project.phases[3]).to.have.property('id', 'deployment');

                    // Update test data with actual project ID
                    const testProject = testContext.testData.testProjects.find(p => p.name === projectConfig.name);
                    if (testProject) {
                        testProject.id = project.id;
                        testProject.workspacePath = project.workspacePath;
                        testProject.state = 'initialized';
                    }
                }

                const projectCreationDuration = performance.now() - projectCreationStartTime;
                trackPerformanceMetric('project_creation', projectCreationDuration, true, {
                    projectName: projectConfig.name,
                    phasesCount: projectConfig.phases.length
                });

                // Performance assertion
                expect(projectCreationDuration).to.be.lessThan(config.performance.maxProjectCreationTime);

            } catch (error) {
                const projectCreationDuration = performance.now() - projectCreationStartTime;
                trackPerformanceMetric('project_creation', projectCreationDuration, false);
                throw error;
            }
        });

        it('should manage project settings and configuration updates', async function() {
            this.timeout(10000);

            await initializeCoreServices();
            await initializeProjectManagementServices();

            // Create a test project
            const { id: projectId, config: projectConfig } = await createTestProject('Settings Test Project');
            const creationResult = await testContext.projectServices.projectService!.createProject(
                testContext.testData.testUserId,
                projectConfig.name,
                projectConfig
            );
            expect(isApiSuccess(creationResult)).to.be.true;

            const actualProjectId = isApiSuccess(creationResult) ? creationResult.data.id : projectId;

            // Test settings update
            const settingsUpdateStartTime = performance.now();

            try {
                const updatedSettings = {
                    ...projectConfig.settings,
                    maxFileSize: '50MB',
                    allowedFileTypes: [...(projectConfig.settings?.allowedFileTypes || []), '.py', '.java'],
                    enableAutoBackup: true,
                    backupInterval: 300000 // 5 minutes
                };

                const updateResult = await testContext.projectServices.settingsService!.updateProjectSettings(
                    actualProjectId,
                    updatedSettings
                );

                expect(isApiSuccess(updateResult)).to.be.true;
                if (isApiSuccess(updateResult)) {
                    expect(updateResult.data.maxFileSize).to.equal('50MB');
                    expect(updateResult.data.allowedFileTypes).to.include('.py');
                    expect(updateResult.data.allowedFileTypes).to.include('.java');
                    expect(updateResult.data.enableAutoBackup).to.be.true;
                }

                // Verify settings persistence
                const retrieveResult = await testContext.projectServices.settingsService!.getProjectSettings(actualProjectId);
                expect(isApiSuccess(retrieveResult)).to.be.true;
                if (isApiSuccess(retrieveResult)) {
                    expect(retrieveResult.data.maxFileSize).to.equal('50MB');
                    expect(retrieveResult.data.enableAutoBackup).to.be.true;
                }

                const settingsUpdateDuration = performance.now() - settingsUpdateStartTime;
                trackPerformanceMetric('project_settings_update', settingsUpdateDuration, true, {
                    settingsKeys: Object.keys(updatedSettings).length
                });

            } catch (error) {
                const settingsUpdateDuration = performance.now() - settingsUpdateStartTime;
                trackPerformanceMetric('project_settings_update', settingsUpdateDuration, false);
                throw error;
            }
        });
    });

    describe('Phase Orchestration Integration', () => {
        it('should orchestrate multi-phase project execution', async function() {
            this.timeout(45000);

            await initializeCoreServices();
            await initializeProjectManagementServices();

            // Create a comprehensive test project
            const { id: projectId, config: projectConfig } = await createTestProject('Multi-Phase Orchestration Project');
            const creationResult = await testContext.projectServices.projectService!.createProject(
                testContext.testData.testUserId,
                projectConfig.name,
                projectConfig
            );
            expect(isApiSuccess(creationResult)).to.be.true;

            const actualProjectId = isApiSuccess(creationResult) ? creationResult.data.id : projectId;

            // Test phase orchestration
            const orchestrationStartTime = performance.now();

            try {
                // Execute planning phase
                const planningStartTime = performance.now();
                const planningResult = await testContext.projectServices.orchestrator!.executePhase(
                    actualProjectId,
                    'planning',
                    {
                        requirements: ['Define project scope', 'Create technical specifications', 'Plan architecture'],
                        deliverables: ['Requirements document', 'Technical design', 'Project timeline'],
                        resources: ['Product manager', 'Technical architect', 'UX designer']
                    }
                );

                expect(isApiSuccess(planningResult)).to.be.true;
                if (isApiSuccess(planningResult)) {
                    expect(planningResult.data.phase).to.equal('planning');
                    expect(planningResult.data.status).to.equal('completed');
                    expect(planningResult.data.deliverables).to.be.an('array').with.lengthOf.at.least(1);
                }

                const planningDuration = performance.now() - planningStartTime;
                trackPerformanceMetric('phase_execution_planning', planningDuration, true, {
                    phaseId: 'planning',
                    projectId: actualProjectId
                });
                testContext.assertions.phasesExecuted++;

                // Execute implementation phase (depends on planning)
                const implementationStartTime = performance.now();
                const implementationResult = await testContext.projectServices.orchestrator!.executePhase(
                    actualProjectId,
                    'implementation',
                    {
                        components: ['Frontend UI', 'Backend API', 'Database schema', 'Authentication'],
                        technologies: ['React', 'Node.js', 'PostgreSQL', 'JWT'],
                        milestones: ['Core features', 'User authentication', 'Data persistence', 'API integration']
                    }
                );

                expect(isApiSuccess(implementationResult)).to.be.true;
                if (isApiSuccess(implementationResult)) {
                    expect(implementationResult.data.phase).to.equal('implementation');
                    expect(implementationResult.data.status).to.equal('completed');
                    expect(implementationResult.data.artifacts).to.be.an('array');
                }

                const implementationDuration = performance.now() - implementationStartTime;
                trackPerformanceMetric('phase_execution_implementation', implementationDuration, true, {
                    phaseId: 'implementation',
                    projectId: actualProjectId
                });
                testContext.assertions.phasesExecuted++;

                // Execute testing phase
                const testingStartTime = performance.now();
                const testingResult = await testContext.projectServices.orchestrator!.executePhase(
                    actualProjectId,
                    'testing',
                    {
                        testTypes: ['Unit tests', 'Integration tests', 'E2E tests', 'Performance tests'],
                        coverage: { target: 85, current: 0 },
                        tools: ['Jest', 'Playwright', 'Lighthouse', 'Artillery']
                    }
                );

                expect(isApiSuccess(testingResult)).to.be.true;
                if (isApiSuccess(testingResult)) {
                    expect(testingResult.data.phase).to.equal('testing');
                    expect(testingResult.data.status).to.equal('completed');
                    expect(testingResult.data.testResults).to.be.an('object');
                }

                const testingDuration = performance.now() - testingStartTime;
                trackPerformanceMetric('phase_execution_testing', testingDuration, true, {
                    phaseId: 'testing',
                    projectId: actualProjectId
                });
                testContext.assertions.phasesExecuted++;

                // Verify project state after phase execution
                const projectState = await testContext.projectServices.stateManager!.getProjectState(actualProjectId);
                expect(isApiSuccess(projectState)).to.be.true;
                if (isApiSuccess(projectState)) {
                    expect(projectState.data.currentPhase).to.equal('testing');
                    expect(projectState.data.completedPhases).to.include('planning');
                    expect(projectState.data.completedPhases).to.include('implementation');
                    expect(projectState.data.completedPhases).to.include('testing');
                }

                const orchestrationDuration = performance.now() - orchestrationStartTime;
                trackPerformanceMetric('full_phase_orchestration', orchestrationDuration, true, {
                    phasesExecuted: 3,
                    projectId: actualProjectId
                });

                // Performance assertion
                expect(orchestrationDuration).to.be.lessThan(config.performance.maxOrchestrationTime * 3); // 3x for multiple phases

            } catch (error) {
                const orchestrationDuration = performance.now() - orchestrationStartTime;
                trackPerformanceMetric('full_phase_orchestration', orchestrationDuration, false);
                throw error;
            }
        });

        it('should handle phase dependencies and validation', async function() {
            this.timeout(20000);

            await initializeCoreServices();
            await initializeProjectManagementServices();

            // Create project with complex phase dependencies
            const complexProjectConfig: ProjectConfig = {
                name: 'Complex Dependencies Project',
                description: 'Testing complex phase dependencies',
                type: 'microservices-application',
                phases: [
                    { id: 'requirements', name: 'Requirements Analysis', dependencies: [] },
                    { id: 'architecture', name: 'Architecture Design', dependencies: ['requirements'] },
                    { id: 'frontend', name: 'Frontend Development', dependencies: ['architecture'] },
                    { id: 'backend', name: 'Backend Development', dependencies: ['architecture'] },
                    { id: 'integration', name: 'System Integration', dependencies: ['frontend', 'backend'] },
                    { id: 'deployment', name: 'Production Deployment', dependencies: ['integration'] }
                ],
                settings: {
                    enableAutoSave: true,
                    enableVersionControl: true
                },
                metadata: {
                    createdBy: testContext.testData.testUserId,
                    createdAt: createTimestamp(),
                    tags: ['complex', 'dependencies'],
                    priority: 'high'
                }
            };

            const creationResult = await testContext.projectServices.projectService!.createProject(
                testContext.testData.testUserId,
                complexProjectConfig.name,
                complexProjectConfig
            );
            expect(isApiSuccess(creationResult)).to.be.true;

            const projectId = isApiSuccess(creationResult) ? creationResult.data.id : generateUUID();

            // Test dependency validation - should fail to execute backend before requirements
            const dependencyTestStartTime = performance.now();

            try {
                const backendEarlyResult = await testContext.projectServices.orchestrator!.executePhase(
                    projectId,
                    'backend',
                    { skipValidation: false }
                );

                // Should fail due to missing dependencies
                expect(isApiSuccess(backendEarlyResult)).to.be.false;
                if (!isApiSuccess(backendEarlyResult)) {
                    expect(backendEarlyResult.error).to.include('dependencies');
                }

                // Execute phases in correct dependency order
                const requirementsResult = await testContext.projectServices.orchestrator!.executePhase(
                    projectId,
                    'requirements',
                    {
                        stakeholders: ['Product Owner', 'End Users', 'Technical Team'],
                        requirements: ['Functional requirements', 'Non-functional requirements', 'Constraints']
                    }
                );
                expect(isApiSuccess(requirementsResult)).to.be.true;

                const architectureResult = await testContext.projectServices.orchestrator!.executePhase(
                    projectId,
                    'architecture',
                    {
                        patterns: ['Microservices', 'Event-driven', 'CQRS'],
                        technologies: ['Docker', 'Kubernetes', 'Redis', 'PostgreSQL']
                    }
                );
                expect(isApiSuccess(architectureResult)).to.be.true;

                // Now backend should be executable
                const backendResult = await testContext.projectServices.orchestrator!.executePhase(
                    projectId,
                    'backend',
                    {
                        services: ['User Service', 'Product Service', 'Order Service'],
                        frameworks: ['Express.js', 'TypeORM', 'Joi']
                    }
                );
                expect(isApiSuccess(backendResult)).to.be.true;

                const dependencyTestDuration = performance.now() - dependencyTestStartTime;
                trackPerformanceMetric('phase_dependency_validation', dependencyTestDuration, true, {
                    phasesValidated: 4
                });

            } catch (error) {
                const dependencyTestDuration = performance.now() - dependencyTestStartTime;
                trackPerformanceMetric('phase_dependency_validation', dependencyTestDuration, false);
                throw error;
            }
        });
    });

    describe('Cross-Module Service Integration', () => {
        it('should coordinate all Phase 1 and Phase 2.1 services together', async function() {
            this.timeout(30000);

            await initializeCoreServices();
            await initializeProjectManagementServices();

            const app = await setupTestServer();
            
            // Start test server
            const server = app.listen(0);
            testContext.server.instance = server;
            const address = server.address() as any;
            testContext.server.port = address.port;
            testContext.server.baseUrl = `http://localhost:${address.port}`;

            const integrationStartTime = performance.now();

            try {
                // Test full integration flow through HTTP API
                
                // 1. Create project via API
                const projectCreationResponse = await supertest(app)
                    .post('/api/projects')
                    .send({
                        name: 'Full Integration Test Project',
                        config: {
                            description: 'End-to-end integration testing',
                            type: 'full-stack-application',
                            phases: [
                                { id: 'analysis', name: 'Business Analysis', dependencies: [] },
                                { id: 'design', name: 'System Design', dependencies: ['analysis'] },
                                { id: 'development', name: 'Development', dependencies: ['design'] }
                            ],
                            settings: {
                                enableAutoSave: true,
                                enableVersionControl: true,
                                maxFileSize: '25MB'
                            },
                            metadata: {
                                createdBy: testContext.testData.testUserId,
                                tags: ['integration', 'full-stack'],
                                priority: 'high'
                            }
                        }
                    })
                    .expect(200);

                expect(projectCreationResponse.body.success).to.be.true;
                expect(projectCreationResponse.body.data).to.have.property('id');
                const projectId = projectCreationResponse.body.data.id;

                // 2. Execute phase via API
                const phaseExecutionResponse = await supertest(app)
                    .post(`/api/projects/${projectId}/phases/analysis/execute`)
                    .send({
                        stakeholders: ['Business Analysts', 'Product Managers', 'End Users'],
                        methodologies: ['User Stories', 'Use Cases', 'Process Mapping'],
                        deliverables: ['Business Requirements Document', 'Process Flow Diagrams', 'User Personas']
                    })
                    .expect(200);

                expect(phaseExecutionResponse.body.success).to.be.true;
                expect(phaseExecutionResponse.body.data).to.have.property('phase', 'analysis');
                expect(phaseExecutionResponse.body.data).to.have.property('status', 'completed');

                // 3. Verify project list via API
                const projectListResponse = await supertest(app)
                    .get('/api/projects')
                    .expect(200);

                expect(projectListResponse.body.success).to.be.true;
                expect(projectListResponse.body.data).to.be.an('array').with.lengthOf.at.least(1);
                
                const createdProject = projectListResponse.body.data.find((p: any) => p.id === projectId);
                expect(createdProject).to.not.be.undefined;
                expect(createdProject.name).to.equal('Full Integration Test Project');

                // 4. Verify service health across all modules
                const healthChecks = await Promise.all([
                    testContext.coreServices.config!.getHealthStatus(),
                    testContext.coreServices.database!.getHealthStatus(),
                    testContext.coreServices.errorService!.getHealthStatus(),
                    testContext.projectServices.projectService!.getHealthStatus(),
                    testContext.projectServices.orchestrator!.getHealthStatus(),
                    testContext.projectServices.coordinator!.getHealthStatus()
                ]);

                // Validate all services are healthy
                for (const health of healthChecks) {
                    expect(isApiSuccess(health)).to.be.true;
                    if (isApiSuccess(health)) {
                        expect(health.data.isHealthy).to.be.true;
                    }
                }

                const integrationDuration = performance.now() - integrationStartTime;
                trackPerformanceMetric('full_service_integration', integrationDuration, true, {
                    servicesIntegrated: healthChecks.length,
                    apiCallsSuccessful: 3
                });

                // Performance assertion
                expect(integrationDuration).to.be.lessThan(config.performance.maxOrchestrationTime * 2);

            } catch (error) {
                const integrationDuration = performance.now() - integrationStartTime;
                trackPerformanceMetric('full_service_integration', integrationDuration, false);
                throw error;
            }
        });

        it('should handle complex error scenarios across all integrated services', async function() {
            this.timeout(15000);

            await initializeCoreServices();
            await initializeProjectManagementServices();

            const errorHandlingStartTime = performance.now();

            try {
                // Simulate database connection failure
                const databaseErrorResult = await testContext.coreServices.errorService!.handleError(
                    new ReadyAIError('Database connection timeout', 'DB_TIMEOUT', 503, {}, true, 10000),
                    {
                        source: 'project_management',
                        operation: 'project_creation',
                        timestamp: createTimestamp(),
                        projectId: generateUUID()
                    }
                );

                expect(isApiSuccess(databaseErrorResult)).to.be.true;
                if (isApiSuccess(databaseErrorResult)) {
                    expect(databaseErrorResult.data.recoverable).to.be.true;
                    expect(databaseErrorResult.data.recovery?.strategy).to.be.a('string');
                }

                // Simulate orchestration failure
                const orchestrationErrorResult = await testContext.coreServices.errorService!.handleError(
                    new ReadyAIError('Phase execution failed', 'PHASE_ERROR', 500, { phase: 'implementation' }, true, 5000),
                    {
                        source: 'orchestrator',
                        operation: 'phase_execution',
                        timestamp: createTimestamp(),
                        phaseId: 'implementation'
                    }
                );

                expect(isApiSuccess(orchestrationErrorResult)).to.be.true;
                if (isApiSuccess(orchestrationErrorResult)) {
                    expect(orchestrationErrorResult.data.recoverable).to.be.true;
                }

                // Verify all services remain operational during error scenarios
                const healthCheck = await testContext.projectServices.coordinator!.getHealthStatus();
                expect(healthCheck.isHealthy).to.be.true;
                expect(healthCheck.services).to.have.property('coreServices');
                expect(healthCheck.services).to.have.property('projectServices');

                const errorHandlingDuration = performance.now() - errorHandlingStartTime;
                trackPerformanceMetric('cross_service_error_handling', errorHandlingDuration, true, {
                    errorsHandled: 2,
                    servicesRecovered: 2
                });

            } catch (error) {
                const errorHandlingDuration = performance.now() - errorHandlingStartTime;
                trackPerformanceMetric('cross_service_error_handling', errorHandlingDuration, false);
                throw error;
            }
        });
    });

    describe('Event Handling and Real-time Updates', () => {
        it('should process project events and maintain real-time state synchronization', async function() {
            this.timeout(20000);

            await initializeCoreServices();
            await initializeProjectManagementServices();

            const eventProcessingStartTime = performance.now();
            const eventPromises: Promise<any>[] = [];

            try {
                // Setup event listeners
                const eventService = testContext.projectServices.eventService!;
                const receivedEvents: Array<{ type: string; data: any; timestamp: string }> = [];

                eventService.on('project_created', (data) => {
                    receivedEvents.push({ type: 'project_created', data, timestamp: createTimestamp() });
                    trackProjectEvent('project_created', data.projectId);
                });

                eventService.on('phase_started', (data) => {
                    receivedEvents.push({ type: 'phase_started', data, timestamp: createTimestamp() });
                    trackProjectEvent('phase_started', data.projectId, data.phaseId);
                });

                eventService.on('phase_completed', (data) => {
                    receivedEvents.push({ type: 'phase_completed', data, timestamp: createTimestamp() });
                    trackProjectEvent('phase_completed', data.projectId, data.phaseId);
                });

                eventService.on('project_state_changed', (data) => {
                    receivedEvents.push({ type: 'project_state_changed', data, timestamp: createTimestamp() });
                    trackProjectEvent('project_state_changed', data.projectId);
                });

                // Create project and trigger events
                const { id: projectId, config: projectConfig } = await createTestProject('Event Processing Project');
                const creationResult = await testContext.projectServices.projectService!.createProject(
                    testContext.testData.testUserId,
                    projectConfig.name,
                    projectConfig
                );
                expect(isApiSuccess(creationResult)).to.be.true;

                const actualProjectId = isApiSuccess(creationResult) ? creationResult.data.id : projectId;

                // Wait for project creation event
                await new Promise(resolve => setTimeout(resolve, 100));

                // Execute a phase to trigger more events
                const phaseResult = await testContext.projectServices.orchestrator!.executePhase(
                    actualProjectId,
                    'planning',
                    {
                        activities: ['Requirement gathering', 'Stakeholder analysis', 'Risk assessment'],
                        timeline: '2 weeks'
                    }
                );
                expect(isApiSuccess(phaseResult)).to.be.true;

                // Wait for phase events
                await new Promise(resolve => setTimeout(resolve, 200));

                // Verify events were processed
                expect(receivedEvents.length).to.be.at.least(2);
                
                const projectCreatedEvent = receivedEvents.find(e => e.type === 'project_created');
                expect(projectCreatedEvent).to.not.be.undefined;
                expect(projectCreatedEvent?.data).to.have.property('projectId', actualProjectId);

                const phaseStartedEvent = receivedEvents.find(e => e.type === 'phase_started');
                expect(phaseStartedEvent).to.not.be.undefined;
                expect(phaseStartedEvent?.data).to.have.property('phaseId', 'planning');

                const phaseCompletedEvent = receivedEvents.find(e => e.type === 'phase_completed');
                expect(phaseCompletedEvent).to.not.be.undefined;
                expect(phaseCompletedEvent?.data).to.have.property('phaseId', 'planning');

                // Verify state synchronization
                const currentState = await testContext.projectServices.stateManager!.getProjectState(actualProjectId);
                expect(isApiSuccess(currentState)).to.be.true;
                if (isApiSuccess(currentState)) {
                    expect(currentState.data.completedPhases).to.include('planning');
                    expect(currentState.data.lastEventTimestamp).to.be.a('string');
                }

                const eventProcessingDuration = performance.now() - eventProcessingStartTime;
                trackPerformanceMetric('event_processing_and_sync', eventProcessingDuration, true, {
                    eventsProcessed: receivedEvents.length,
                    projectId: actualProjectId
                });

            } catch (error) {
                const eventProcessingDuration = performance.now() - eventProcessingStartTime;
                trackPerformanceMetric('event_processing_and_sync', eventProcessingDuration, false);
                throw error;
            }
        });
    });

    describe('Performance and Scalability Validation', () => {
        it('should meet ReadyAI performance KPIs for Phase 2.1 project operations', async function() {
            this.timeout(45000);

            await initializeCoreServices();
            await initializeProjectManagementServices();

            const performanceTestStartTime = performance.now();
            const batchSize = 10;
            const operationResults: Array<{ operation: string; duration: number; success: boolean; metadata?: any }> = [];

            try {
                // Performance test batch - project creation
                console.log('Starting project creation performance tests...');
                
                for (let i = 0; i < batchSize; i++) {
                    const projectCreationStart = performance.now();
                    
                    try {
                        const { config } = await createTestProject(`Perf Test Project ${i + 1}`);
                        const creationResult = await testContext.projectServices.projectService!.createProject(
                            testContext.testData.testUserId,
                            config.name,
                            config
                        );
                        
                        const projectCreationDuration = performance.now() - projectCreationStart;
                        operationResults.push({
                            operation: 'project_creation',
                            duration: projectCreationDuration,
                            success: isApiSuccess(creationResult),
                            metadata: { projectIndex: i, projectName: config.name }
                        });

                    } catch (error) {
                        const projectCreationDuration = performance.now() - projectCreationStart;
                        operationResults.push({
                            operation: 'project_creation',
                            duration: projectCreationDuration,
                            success: false,
                            metadata: { projectIndex: i, error: (error as Error).message }
                        });
                    }
                }

                // Performance test batch - phase execution
                console.log('Starting phase execution performance tests...');
                
                const testProjects = testContext.testData.testProjects.slice(0, Math.min(5, batchSize));
                for (const project of testProjects) {
                    const phaseExecutionStart = performance.now();
                    
                    try {
                        const phaseResult = await testContext.projectServices.orchestrator!.executePhase(
                            project.id,
                            'planning',
                            {
                                scope: 'performance test',
                                duration: 'minimal',
                                resources: ['automated']
                            }
                        );
                        
                        const phaseExecutionDuration = performance.now() - phaseExecutionStart;
                        operationResults.push({
                            operation: 'phase_execution',
                            duration: phaseExecutionDuration,
                            success: isApiSuccess(phaseResult),
                            metadata: { projectId: project.id, phaseId: 'planning' }
                        });

                    } catch (error) {
                        const phaseExecutionDuration = performance.now() - phaseExecutionStart;
                        operationResults.push({
                            operation: 'phase_execution',
                            duration: phaseExecutionDuration,
                            success: false,
                            metadata: { projectId: project.id, error: (error as Error).message }
                        });
                    }
                }

                // Performance analysis
                const projectCreationOps = operationResults.filter(r => r.operation === 'project_creation');
                const phaseExecutionOps = operationResults.filter(r => r.operation === 'phase_execution');

                const avgProjectCreationLatency = projectCreationOps.reduce((sum, op) => sum + op.duration, 0) / projectCreationOps.length;
                const avgPhaseExecutionLatency = phaseExecutionOps.reduce((sum, op) => sum + op.duration, 0) / (phaseExecutionOps.length || 1);

                const projectCreationSuccessRate = projectCreationOps.filter(op => op.success).length / projectCreationOps.length * 100;
                const phaseExecutionSuccessRate = phaseExecutionOps.length > 0 
                    ? phaseExecutionOps.filter(op => op.success).length / phaseExecutionOps.length * 100 
                    : 100;

                console.log(`📊 Phase 2.1 Performance KPI Results:
                    Project Creation Operations:
                    - Count: ${projectCreationOps.length}
                    - Average Latency: ${avgProjectCreationLatency.toFixed(2)}ms
                    - Success Rate: ${projectCreationSuccessRate.toFixed(1)}%
                    - KPI Compliance: ${avgProjectCreationLatency < config.performance.maxProjectCreationTime ? 'PASS' : 'FAIL'}
                    
                    Phase Execution Operations:
                    - Count: ${phaseExecutionOps.length}
                    - Average Latency: ${avgPhaseExecutionLatency.toFixed(2)}ms
                    - Success Rate: ${phaseExecutionSuccessRate.toFixed(1)}%
                    - KPI Compliance: ${avgPhaseExecutionLatency < config.performance.maxPhaseExecutionTime ? 'PASS' : 'FAIL'}`);

                // KPI Assertions
                expect(avgProjectCreationLatency).to.be.lessThan(config.performance.maxProjectCreationTime,
                    `Project creation average latency should be under ${config.performance.maxProjectCreationTime}ms`);
                    
                if (phaseExecutionOps.length > 0) {
                    expect(avgPhaseExecutionLatency).to.be.lessThan(config.performance.maxPhaseExecutionTime,
                        `Phase execution average latency should be under ${config.performance.maxPhaseExecutionTime}ms`);
                }

                expect(projectCreationSuccessRate).to.be.greaterThan(90, 
                    'Project creation operations should have >90% success rate');
                expect(phaseExecutionSuccessRate).to.be.greaterThan(90, 
                    'Phase execution operations should have >90% success rate');

                const performanceTestDuration = performance.now() - performanceTestStartTime;
                trackPerformanceMetric('performance_kpi_validation', performanceTestDuration, true, {
                    projectCreationOps: projectCreationOps.length,
                    phaseExecutionOps: phaseExecutionOps.length,
                    avgProjectLatency: avgProjectCreationLatency,
                    avgPhaseLatency: avgPhaseExecutionLatency
                });

            } catch (error) {
                const performanceTestDuration = performance.now() - performanceTestStartTime;
                trackPerformanceMetric('performance_kpi_validation', performanceTestDuration, false);
                throw error;
            }
        });
    });

    describe('Production Readiness Validation', () => {
        it('should demonstrate production-ready project management lifecycle', async function() {
            this.timeout(35000);

            const lifecycleStartTime = performance.now();

            try {
                // 1. Complete service stack initialization
                const initStart = performance.now();
                await initializeCoreServices();
                await initializeProjectManagementServices();
                const initDuration = performance.now() - initStart;

                trackPerformanceMetric('production_service_initialization', initDuration, true);
                expect(initDuration).to.be.lessThan(15000); // 15 seconds max for production initialization

                // 2. Complete project lifecycle test
                const lifecycleTestStart = performance.now();
                
                // Create comprehensive project
                const { id: projectId, config: projectConfig } = await createTestProject('Production Readiness Project', {
                    type: 'enterprise-application',
                    phases: [
                        { id: 'discovery', name: 'Discovery Phase', dependencies: [] },
                        { id: 'planning', name: 'Planning Phase', dependencies: ['discovery'] },
                        { id: 'development', name: 'Development Phase', dependencies: ['planning'] },
                        { id: 'testing', name: 'Testing Phase', dependencies: ['development'] },
                        { id: 'deployment', name: 'Deployment Phase', dependencies: ['testing'] },
                        { id: 'monitoring', name: 'Monitoring Phase', dependencies: ['deployment'] }
                    ],
                    settings: {
                        enableAutoSave: true,
                        enableVersionControl: true,
                        maxFileSize: '100MB',
                        allowedFileTypes: ['.ts', '.js', '.tsx', '.jsx', '.json', '.md', '.yml', '.yaml', '.sql'],
                        enableAutoBackup: true,
                        backupInterval: 300000
                    },
                    metadata: {
                        createdBy: testContext.testData.testUserId,
                        tags: ['production', 'enterprise', 'lifecycle'],
                        priority: 'critical'
                    }
                });

                const creationResult = await testContext.projectServices.projectService!.createProject(
                    testContext.testData.testUserId,
                    projectConfig.name,
                    projectConfig
                );
                expect(isApiSuccess(creationResult)).to.be.true;

                const actualProjectId = isApiSuccess(creationResult) ? creationResult.data.id : projectId;

                // Execute complete lifecycle
                const phases = ['discovery', 'planning', 'development', 'testing', 'deployment'];
                for (const phaseId of phases) {
                    const phaseContext = {
                        discovery: { activities: ['Market research', 'User interviews', 'Competitive analysis'] },
                        planning: { deliverables: ['Project plan', 'Resource allocation', 'Timeline'] },
                        development: { components: ['Backend API', 'Frontend UI', 'Database', 'Integration'] },
                        testing: { testTypes: ['Unit', 'Integration', 'E2E', 'Performance', 'Security'] },
                        deployment: { environments: ['Staging', 'Production'], strategy: 'Blue-green' }
                    }[phaseId] || {};

                    const phaseResult = await testContext.projectServices.orchestrator!.executePhase(
                        actualProjectId,
                        phaseId,
                        phaseContext
                    );
                    expect(isApiSuccess(phaseResult)).to.be.true;
                    
                    if (isApiSuccess(phaseResult)) {
                        expect(phaseResult.data.phase).to.equal(phaseId);
                        expect(phaseResult.data.status).to.equal('completed');
                    }
                }

                const lifecycleTestDuration = performance.now() - lifecycleTestStart;
                trackPerformanceMetric('production_lifecycle_execution', lifecycleTestDuration, true, {
                    phasesExecuted: phases.length,
                    projectId: actualProjectId
                });

                // 3. Verify final project state
                const finalState = await testContext.projectServices.stateManager!.getProjectState(actualProjectId);
                expect(isApiSuccess(finalState)).to.be.true;
                if (isApiSuccess(finalState)) {
                    expect(finalState.data.completedPhases).to.have.lengthOf(phases.length);
                    expect(finalState.data.lifecycleState).to.equal('active');
                    expect(finalState.data.health.overall).to.equal('healthy');
                }

                // 4. Comprehensive health validation
                const allServices = [
                    ...Object.values(testContext.coreServices),
                    ...Object.values(testContext.projectServices)
                ].filter(service => service && typeof service.getHealthStatus === 'function');

                const healthResults = await Promise.all(
                    allServices.map(service => service.getHealthStatus().catch(error => ({ isHealthy: false, error: error.message })))
                );

                const healthyServices = healthResults.filter(result => 
                    (isApiSuccess(result) && result.data.isHealthy) || result.isHealthy
                ).length;

                expect(healthyServices).to.equal(allServices.length, 'All services should be healthy in production');

                const lifecycleDuration = performance.now() - lifecycleStartTime;
                trackPerformanceMetric('complete_production_lifecycle', lifecycleDuration, true, {
                    servicesInitialized: allServices.length,
                    healthyServices,
                    phasesCompleted: phases.length
                });

                console.log(`🏭 Production Lifecycle Metrics:
                    - Total Duration: ${lifecycleDuration.toFixed(2)}ms
                    - Service Initialization: ${initDuration.toFixed(2)}ms
                    - Lifecycle Execution: ${lifecycleTestDuration.toFixed(2)}ms
                    - Services Healthy: ${healthyServices}/${allServices.length}
                    - Phases Completed: ${phases.length}
                    - Overall Status: PRODUCTION READY`);

            } catch (error) {
                const lifecycleDuration = performance.now() - lifecycleStartTime;
                trackPerformanceMetric('complete_production_lifecycle', lifecycleDuration, false);
                throw error;
            }
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

            console.log(`\n🎯 ReadyAI Phase 2.1 Project Management Integration Test Summary:
                ✅ All Project Management Service tests completed
                ✅ All Phase Orchestration tests completed  
                ✅ All Cross-Module Integration tests completed
                ✅ All Event Handling and Real-time Update tests completed
                ✅ All Performance and Scalability validations completed
                ✅ All Production Readiness tests completed
                
                📊 Final Metrics:
                - Total Test Duration: ${totalTestTime.toFixed(2)}ms
                - Total Operations: ${testContext.assertions.totalOperations}
                - Success Rate: ${successRate.toFixed(1)}%
                - Average Latency: ${testContext.assertions.averageLatency.toFixed(2)}ms
                - Projects Created: ${testContext.assertions.projectsCreated}
                - Phases Executed: ${testContext.assertions.phasesExecuted}
                - Events Processed: ${testContext.assertions.eventsProcessed}
                
                🚀 Phase 2.1 Project Management: ${successRate >= 95 ? 'PRODUCTION READY' : 'NEEDS OPTIMIZATION'}
                
                📈 Key Achievements:
                - Complete project lifecycle management validated
                - Multi-phase orchestration with dependency handling
                - Cross-service integration with all Phase 1 modules
                - Real-time event processing and state synchronization
                - Production-grade performance and scalability
                - Enterprise-ready error handling and recovery
            `);
        }
    });
});
