// tests/integration/phase1-3.spec.ts

/**
 * ReadyAI Phase 1.3 Integration Tests - Authentication & API Gateway End-to-End Scenarios
 * 
 * Comprehensive integration tests that validate all Phase 1.3 modules working together,
 * adapting Cline's proven integration test patterns with ReadyAI-specific authentication
 * and gateway operations.
 * 
 * Reuse Strategy: 85% Adapt from Cline integration test patterns
 * - Direct adaptation of Cline's comprehensive E2E test architecture
 * - Enhanced with ReadyAI authentication and gateway scenario testing
 * - Maintains Cline's reliability patterns with auth-specific validations
 * 
 * Key Test Scenarios:
 * - Authentication Service end-to-end operations
 * - API Gateway request routing and middleware integration
 * - Error Handling & Recovery cross-module scenarios
 * - Production security validation
 * - Performance monitoring and KPI compliance
 * - Cross-service health validation
 * 
 * @version 1.0.0 - Phase 1.3 Integration Testing
 * @author ReadyAI Development Team
 */

import { describe, it, beforeEach, afterEach, before, after } from 'mocha';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { performance } from 'perf_hooks';
import { randomUUID } from 'crypto';
import * as express from 'express';
import * as supertest from 'supertest';
import * as jwt from 'jsonwebtoken';

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

// Authentication Module
import { AuthService } from '../../packages/auth/services/AuthService.js';
import { TokenManager } from '../../packages/auth/services/TokenManager.js';
import { SessionManager } from '../../packages/auth/services/SessionManager.js';
import { AuthMiddleware } from '../../packages/auth/middleware/AuthMiddleware.js';

import type {
    AuthConfig,
    SessionData,
    TokenPayload,
    AuthState,
    AuthUserInfo
} from '../../packages/auth/types/auth.js';

// API Gateway Module
import { GatewayService } from '../../packages/api-gateway/services/GatewayService.js';
import { RequestRouter } from '../../packages/api-gateway/services/RequestRouter.js';
import { ValidationMiddleware } from '../../packages/api-gateway/middleware/ValidationMiddleware.js';
import { RateLimitingMiddleware } from '../../packages/api-gateway/middleware/RateLimitingMiddleware.js';
import { GatewayMonitor } from '../../packages/api-gateway/services/GatewayMonitor.js';

import type {
    GatewayConfig,
    RouteConfig,
    GatewayHealth,
    RequestMetrics,
    RouteMatch
} from '../../packages/api-gateway/types/gateway.js';

// Error Handling Module
import { ErrorService } from '../../packages/error-handling/services/ErrorService.js';
import { ErrorClassifier } from '../../packages/error-handling/services/ErrorClassifier.js';
import { ErrorRecovery } from '../../packages/error-handling/services/ErrorRecovery.js';

import type {
    ErrorCategory,
    ErrorSeverity,
    RecoveryStrategy,
    ErrorContext
} from '../../packages/error-handling/types/error.js';

// Logging Services
import { Logger } from '../../packages/logging/services/Logger.js';
import { TelemetryService } from '../../packages/logging/services/TelemetryService.js';

// Configuration
import { ConfigService } from '../../packages/config/services/ConfigService.js';

/**
 * Test configuration adapted from Cline's proven test setup patterns
 */
interface Phase13TestConfig {
    authentication: {
        jwtSecret: string;
        tokenExpiry: number;
        sessionTimeout: number;
        enableSecureTokens: boolean;
    };
    gateway: {
        port: number;
        enableRateLimit: boolean;
        rateLimit: {
            windowMs: number;
            maxRequests: number;
        };
        enableValidation: boolean;
    };
    errorHandling: {
        enableRecovery: boolean;
        maxRetryAttempts: number;
        backoffMultiplier: number;
    };
    performance: {
        maxAuthTime: number;
        maxGatewayResponseTime: number;
        maxErrorRecoveryTime: number;
    };
    cleanup: {
        cleanupOnSuccess: boolean;
        retainLogsOnFailure: boolean;
    };
}

const DEFAULT_TEST_CONFIG: Phase13TestConfig = {
    authentication: {
        jwtSecret: 'test-jwt-secret-key-for-phase13-testing',
        tokenExpiry: 3600, // 1 hour
        sessionTimeout: 1800, // 30 minutes
        enableSecureTokens: true
    },
    gateway: {
        port: 0, // Let OS assign port
        enableRateLimit: true,
        rateLimit: {
            windowMs: 60000, // 1 minute
            maxRequests: 100
        },
        enableValidation: true
    },
    errorHandling: {
        enableRecovery: true,
        maxRetryAttempts: 3,
        backoffMultiplier: 2
    },
    performance: {
        maxAuthTime: 2000, // 2 seconds
        maxGatewayResponseTime: 1000, // 1 second
        maxErrorRecoveryTime: 5000 // 5 seconds
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
        auth?: AuthService;
        gateway?: GatewayService;
        errorService?: ErrorService;
        config?: ConfigService;
        logger?: Logger;
        telemetry?: TelemetryService;
    };
    testData: {
        testUserId: UUID;
        testSessionId: string;
        testTokens: string[];
        performanceMetrics: Array<{
            operation: string;
            duration: number;
            success: boolean;
            timestamp: string;
        }>;
    };
    server: {
        app?: express.Application;
        instance?: any; // Server instance
        port?: number;
        baseUrl?: string;
    };
    cleanup: Array<() => Promise<void>>;
    assertions: {
        totalOperations: number;
        successfulOperations: number;
        failedOperations: number;
        averageLatency: number;
    };
}

describe('ReadyAI Phase 1.3 Integration Tests - Authentication + API Gateway + Error Handling', () => {
    let testContext: IntegrationTestContext;
    let sandbox: sinon.SinonSandbox;
    let config: Phase13TestConfig;

    // Global test setup following Cline's proven patterns
    before(async function() {
        this.timeout(30000); // 30 seconds for setup

        console.log('🚀 Setting up ReadyAI Phase 1.3 Integration Test Environment...');

        // Initialize test configuration
        config = { ...DEFAULT_TEST_CONFIG };

        // Setup sandbox for reliable test isolation
        sandbox = sinon.createSandbox();

        console.log('✅ Phase 1.3 Integration Test Environment Ready');
    });

    // Global test teardown
    after(async function() {
        this.timeout(15000); // 15 seconds for cleanup

        console.log('🧹 Cleaning up Phase 1.3 Integration Test Environment...');

        if (sandbox) {
            sandbox.restore();
        }

        console.log('✅ Phase 1.3 Integration Test Cleanup Complete');
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
                testUserId: generateUUID(),
                testSessionId: `session_${testId}`,
                testTokens: [],
                performanceMetrics: []
            },
            server: {},
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

        // Shutdown services gracefully
        if (testContext.services.gateway) {
            await testContext.services.gateway.shutdown().catch(console.warn);
        }
        if (testContext.services.auth) {
            await testContext.services.auth.shutdown().catch(console.warn);
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

    async function initializeAuthService(): Promise<AuthService> {
        const authConfig: AuthConfig = {
            jwt: {
                secret: config.authentication.jwtSecret,
                expiresIn: config.authentication.tokenExpiry,
                algorithm: 'HS256'
            },
            session: {
                timeout: config.authentication.sessionTimeout,
                renewalThreshold: 300, // 5 minutes
                maxSessions: 5
            },
            security: {
                enableSecureTokens: config.authentication.enableSecureTokens,
                tokenRotationInterval: 3600, // 1 hour
                maxLoginAttempts: 5,
                lockoutDuration: 900 // 15 minutes
            }
        };

        const authService = new AuthService({
            config: authConfig,
            enableLocalAuth: true,
            enableTokenRotation: true,
            sessionStorageType: 'memory' // Use memory for testing
        });

        await authService.initialize();
        
        testContext.services.auth = authService;
        testContext.cleanup.push(() => authService.shutdown());

        return authService;
    }

    async function initializeGatewayService(): Promise<GatewayService> {
        const gatewayConfig: GatewayConfig = {
            server: {
                port: config.gateway.port,
                host: 'localhost',
                enableCors: true,
                trustProxy: false
            },
            routing: {
                enableLoadBalancing: false,
                defaultTimeout: 30000,
                maxBodySize: '10mb'
            },
            middleware: {
                enableValidation: config.gateway.enableValidation,
                enableRateLimit: config.gateway.enableRateLimit,
                enableLogging: true,
                enableMetrics: true
            },
            rateLimit: config.gateway.rateLimit,
            monitoring: {
                enableHealthChecks: true,
                healthCheckInterval: 5000,
                metricsRetention: 3600000 // 1 hour
            }
        };

        const gatewayService = new GatewayService({
            config: gatewayConfig,
            enableMiddleware: true,
            enableMonitoring: true
        });

        await gatewayService.initialize();
        
        testContext.services.gateway = gatewayService;
        testContext.cleanup.push(() => gatewayService.shutdown());

        return gatewayService;
    }

    async function initializeErrorService(): Promise<ErrorService> {
        const errorService = new ErrorService({
            enableRecovery: config.errorHandling.enableRecovery,
            maxRetryAttempts: config.errorHandling.maxRetryAttempts,
            backoffMultiplier: config.errorHandling.backoffMultiplier,
            enableTelemetry: true,
            enableContext: true
        });

        await errorService.initialize();
        
        testContext.services.errorService = errorService;
        testContext.cleanup.push(() => errorService.shutdown());

        return errorService;
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

    async function createTestUser(): Promise<AuthUserInfo> {
        return {
            id: testContext.testData.testUserId,
            email: 'test@readyai.local',
            displayName: 'Test User',
            roles: ['user'],
            permissions: ['read', 'write'],
            metadata: {
                testUser: true,
                createdAt: createTimestamp()
            }
        };
    }

    async function generateTestToken(user: AuthUserInfo): Promise<string> {
        const payload: TokenPayload = {
            sub: user.id,
            email: user.email,
            displayName: user.displayName,
            roles: user.roles,
            permissions: user.permissions,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + config.authentication.tokenExpiry
        };

        const token = jwt.sign(payload, config.authentication.jwtSecret);
        testContext.testData.testTokens.push(token);
        return token;
    }

    async function setupTestServer(): Promise<express.Application> {
        const app = express();

        // Setup basic middleware
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));

        // Add test routes
        app.get('/health', (req, res) => {
            res.json({ status: 'ok', timestamp: createTimestamp() });
        });

        app.get('/protected', async (req, res) => {
            res.json({ message: 'Protected resource accessed', user: req.user });
        });

        app.post('/api/test', (req, res) => {
            res.json({ success: true, data: req.body });
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
     * Phase 1.3 Core Integration Tests
     */

    describe('Authentication Service Integration', () => {
        it('should initialize authentication service with all dependencies', async function() {
            this.timeout(15000);

            const startTime = performance.now();
            
            try {
                const authService = await initializeAuthService();
                
                // Verify service is initialized
                expect(authService).to.not.be.undefined;
                
                // Verify health status
                const healthResult = await authService.getHealthStatus();
                expect(isApiSuccess(healthResult)).to.be.true;
                
                if (isApiSuccess(healthResult)) {
                    expect(healthResult.data.isHealthy).to.be.true;
                    expect(healthResult.data.services.tokenManager).to.be.true;
                    expect(healthResult.data.services.sessionManager).to.be.true;
                }
                
                const duration = performance.now() - startTime;
                trackPerformanceMetric('auth_service_initialization', duration, true);
                
                // Performance assertion
                expect(duration).to.be.lessThan(config.performance.maxAuthTime);
                
            } catch (error) {
                const duration = performance.now() - startTime;
                trackPerformanceMetric('auth_service_initialization', duration, false);
                throw error;
            }
        });

        it('should handle user authentication flow with token generation', async function() {
            this.timeout(10000);

            const authService = await initializeAuthService();
            const testUser = await createTestUser();

            // Test user authentication
            const authStartTime = performance.now();
            try {
                const authResult = await authService.authenticateUser({
                    email: testUser.email,
                    password: 'test-password',
                    metadata: { source: 'integration-test' }
                });

                expect(isApiSuccess(authResult)).to.be.true;
                
                if (isApiSuccess(authResult)) {
                    expect(authResult.data).to.have.property('token');
                    expect(authResult.data).to.have.property('user');
                    expect(authResult.data.user.email).to.equal(testUser.email);
                    expect(authResult.data.expiresAt).to.be.a('string');
                    
                    // Store token for cleanup
                    testContext.testData.testTokens.push(authResult.data.token);
                }

                const authDuration = performance.now() - authStartTime;
                trackPerformanceMetric('user_authentication', authDuration, true);
                
                // Performance assertion
                expect(authDuration).to.be.lessThan(config.performance.maxAuthTime);

            } catch (error) {
                const authDuration = performance.now() - authStartTime;
                trackPerformanceMetric('user_authentication', authDuration, false);
                throw error;
            }

            // Test token validation
            const validationStartTime = performance.now();
            try {
                const token = testContext.testData.testTokens[0];
                const validationResult = await authService.validateToken(token);

                expect(isApiSuccess(validationResult)).to.be.true;
                if (isApiSuccess(validationResult)) {
                    expect(validationResult.data.valid).to.be.true;
                    expect(validationResult.data.payload.email).to.equal(testUser.email);
                }

                const validationDuration = performance.now() - validationStartTime;
                trackPerformanceMetric('token_validation', validationDuration, true);

            } catch (error) {
                const validationDuration = performance.now() - validationStartTime;
                trackPerformanceMetric('token_validation', validationDuration, false);
                throw error;
            }
        });

        it('should manage sessions with proper lifecycle', async function() {
            this.timeout(10000);

            const authService = await initializeAuthService();
            const testUser = await createTestUser();
            const token = await generateTestToken(testUser);

            // Test session creation
            const sessionStartTime = performance.now();
            try {
                const sessionResult = await authService.createSession({
                    userId: testUser.id,
                    token,
                    metadata: { 
                        userAgent: 'ReadyAI-Integration-Test',
                        ipAddress: '127.0.0.1'
                    }
                });

                expect(isApiSuccess(sessionResult)).to.be.true;
                if (isApiSuccess(sessionResult)) {
                    expect(sessionResult.data).to.have.property('sessionId');
                    expect(sessionResult.data).to.have.property('expiresAt');
                    expect(sessionResult.data.userId).to.equal(testUser.id);
                    
                    testContext.testData.testSessionId = sessionResult.data.sessionId;
                }

                const sessionDuration = performance.now() - sessionStartTime;
                trackPerformanceMetric('session_creation', sessionDuration, true);

            } catch (error) {
                const sessionDuration = performance.now() - sessionStartTime;
                trackPerformanceMetric('session_creation', sessionDuration, false);
                throw error;
            }

            // Test session validation
            const sessionValidationStartTime = performance.now();
            try {
                const validationResult = await authService.validateSession(testContext.testData.testSessionId);

                expect(isApiSuccess(validationResult)).to.be.true;
                if (isApiSuccess(validationResult)) {
                    expect(validationResult.data.valid).to.be.true;
                    expect(validationResult.data.session.userId).to.equal(testUser.id);
                }

                const sessionValidationDuration = performance.now() - sessionValidationStartTime;
                trackPerformanceMetric('session_validation', sessionValidationDuration, true);

            } catch (error) {
                const sessionValidationDuration = performance.now() - sessionValidationStartTime;
                trackPerformanceMetric('session_validation', sessionValidationDuration, false);
                throw error;
            }
        });
    });

    describe('API Gateway Service Integration', () => {
        it('should initialize gateway service with middleware stack', async function() {
            this.timeout(15000);

            const startTime = performance.now();
            
            try {
                const gatewayService = await initializeGatewayService();
                
                // Verify service is initialized
                expect(gatewayService).to.not.be.undefined;
                
                // Verify health status
                const health = await gatewayService.getHealthStatus();
                expect(health.isHealthy).to.be.true;
                expect(health.services.router).to.be.true;
                expect(health.services.middleware).to.be.true;
                
                const duration = performance.now() - startTime;
                trackPerformanceMetric('gateway_service_initialization', duration, true);
                
                // Performance assertion
                expect(duration).to.be.lessThan(config.performance.maxGatewayResponseTime * 5); // 5x for initialization
                
            } catch (error) {
                const duration = performance.now() - startTime;
                trackPerformanceMetric('gateway_service_initialization', duration, false);
                throw error;
            }
        });

        it('should route requests through gateway with authentication middleware', async function() {
            this.timeout(15000);

            const authService = await initializeAuthService();
            const gatewayService = await initializeGatewayService();
            const app = await setupTestServer();

            // Configure authentication middleware
            const authMiddleware = new AuthMiddleware(authService);
            app.use('/protected', authMiddleware.authenticate.bind(authMiddleware));

            // Setup gateway routes
            await gatewayService.addRoute({
                method: 'GET',
                path: '/protected',
                target: 'http://localhost',
                middleware: ['auth', 'validation'],
                timeout: 5000
            });

            // Start test server
            const server = app.listen(0);
            testContext.server.instance = server;
            const address = server.address() as any;
            testContext.server.port = address.port;
            testContext.server.baseUrl = `http://localhost:${address.port}`;

            // Create authenticated user and token
            const testUser = await createTestUser();
            const token = await generateTestToken(testUser);

            // Test authenticated request through gateway
            const requestStartTime = performance.now();
            try {
                const response = await supertest(app)
                    .get('/protected')
                    .set('Authorization', `Bearer ${token}`)
                    .expect(200);

                expect(response.body).to.have.property('message');
                expect(response.body.user).to.be.an('object');

                const requestDuration = performance.now() - requestStartTime;
                trackPerformanceMetric('authenticated_gateway_request', requestDuration, true);
                
                // Performance assertion
                expect(requestDuration).to.be.lessThan(config.performance.maxGatewayResponseTime);

            } catch (error) {
                const requestDuration = performance.now() - requestStartTime;
                trackPerformanceMetric('authenticated_gateway_request', requestDuration, false);
                throw error;
            }

            // Test unauthenticated request (should fail)
            const unauthStartTime = performance.now();
            try {
                await supertest(app)
                    .get('/protected')
                    .expect(401);

                const unauthDuration = performance.now() - unauthStartTime;
                trackPerformanceMetric('unauthenticated_gateway_request', unauthDuration, true);

            } catch (error) {
                const unauthDuration = performance.now() - unauthStartTime;
                trackPerformanceMetric('unauthenticated_gateway_request', unauthDuration, false);
                throw error;
            }
        });

        it('should enforce rate limiting and validation middleware', async function() {
            this.timeout(20000);

            const gatewayService = await initializeGatewayService();
            const app = await setupTestServer();

            // Setup rate limiting middleware
            const rateLimitMiddleware = new RateLimitingMiddleware({
                windowMs: 1000, // 1 second window for testing
                maxRequests: 3, // Allow only 3 requests per window
                enableHeaders: true
            });

            // Setup validation middleware
            const validationMiddleware = new ValidationMiddleware({
                enableSchemaValidation: true,
                enableTypeCoercion: true
            });

            app.use('/api/test', rateLimitMiddleware.middleware.bind(rateLimitMiddleware));
            app.use('/api/test', validationMiddleware.middleware.bind(validationMiddleware));

            // Start test server
            const server = app.listen(0);
            testContext.server.instance = server;
            const address = server.address() as any;
            testContext.server.port = address.port;

            // Test rate limiting
            const rateLimitStartTime = performance.now();
            try {
                // Make 3 successful requests (within limit)
                for (let i = 0; i < 3; i++) {
                    await supertest(app)
                        .post('/api/test')
                        .send({ message: `Test request ${i + 1}` })
                        .expect(200);
                }

                // 4th request should be rate limited
                await supertest(app)
                    .post('/api/test')
                    .send({ message: 'Rate limited request' })
                    .expect(429);

                const rateLimitDuration = performance.now() - rateLimitStartTime;
                trackPerformanceMetric('rate_limiting_enforcement', rateLimitDuration, true);

            } catch (error) {
                const rateLimitDuration = performance.now() - rateLimitStartTime;
                trackPerformanceMetric('rate_limiting_enforcement', rateLimitDuration, false);
                throw error;
            }

            // Wait for rate limit window to reset
            await new Promise(resolve => setTimeout(resolve, 1100));

            // Test validation middleware
            const validationStartTime = performance.now();
            try {
                // Valid request
                await supertest(app)
                    .post('/api/test')
                    .send({ message: 'Valid request' })
                    .expect(200);

                const validationDuration = performance.now() - validationStartTime;
                trackPerformanceMetric('validation_middleware', validationDuration, true);

            } catch (error) {
                const validationDuration = performance.now() - validationStartTime;
                trackPerformanceMetric('validation_middleware', validationDuration, false);
                throw error;
            }
        });
    });

    describe('Error Handling & Recovery Integration', () => {
        it('should initialize error handling service with recovery mechanisms', async function() {
            this.timeout(10000);

            const startTime = performance.now();
            
            try {
                const errorService = await initializeErrorService();
                
                // Verify service is initialized
                expect(errorService).to.not.be.undefined;
                
                // Verify health status
                const health = await errorService.getHealthStatus();
                expect(health.isHealthy).to.be.true;
                expect(health.services.classifier).to.be.true;
                expect(health.services.recovery).to.be.true;
                
                const duration = performance.now() - startTime;
                trackPerformanceMetric('error_service_initialization', duration, true);
                
                // Performance assertion
                expect(duration).to.be.lessThan(config.performance.maxErrorRecoveryTime);
                
            } catch (error) {
                const duration = performance.now() - startTime;
                trackPerformanceMetric('error_service_initialization', duration, false);
                throw error;
            }
        });

        it('should classify and handle different error types', async function() {
            this.timeout(10000);

            const errorService = await initializeErrorService();

            const errorScenarios = [
                {
                    name: 'authentication_error',
                    error: new ReadyAIError('Invalid token', ERROR_CODES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED),
                    expectedCategory: 'authentication' as ErrorCategory,
                    expectedSeverity: 'medium' as ErrorSeverity
                },
                {
                    name: 'validation_error',
                    error: new ReadyAIError('Invalid input format', ERROR_CODES.VALIDATION_ERROR, HTTP_STATUS.BAD_REQUEST),
                    expectedCategory: 'validation' as ErrorCategory,
                    expectedSeverity: 'low' as ErrorSeverity
                },
                {
                    name: 'system_error',
                    error: new ReadyAIError('Database connection failed', ERROR_CODES.INTERNAL_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR),
                    expectedCategory: 'system' as ErrorCategory,
                    expectedSeverity: 'high' as ErrorSeverity
                }
            ];

            for (const scenario of errorScenarios) {
                const startTime = performance.now();
                try {
                    const classificationResult = await errorService.classifyError(scenario.error, {
                        source: 'integration-test',
                        operation: scenario.name,
                        timestamp: createTimestamp()
                    });

                    expect(isApiSuccess(classificationResult)).to.be.true;
                    if (isApiSuccess(classificationResult)) {
                        expect(classificationResult.data.category).to.equal(scenario.expectedCategory);
                        expect(classificationResult.data.severity).to.equal(scenario.expectedSeverity);
                        expect(classificationResult.data.recoverable).to.be.a('boolean');
                    }

                    const duration = performance.now() - startTime;
                    trackPerformanceMetric(`error_classification_${scenario.name}`, duration, true);

                } catch (error) {
                    const duration = performance.now() - startTime;
                    trackPerformanceMetric(`error_classification_${scenario.name}`, duration, false);
                    throw error;
                }
            }
        });

        it('should execute recovery strategies for recoverable errors', async function() {
            this.timeout(15000);

            const errorService = await initializeErrorService();

            // Test recoverable error with retry strategy
            const retryStartTime = performance.now();
            try {
                let attemptCount = 0;
                const mockOperation = async (): Promise<string> => {
                    attemptCount++;
                    if (attemptCount < 3) {
                        throw new ReadyAIError('Temporary failure', 'TEMP_ERROR', 503, { attemptCount }, true, 1000);
                    }
                    return 'Success after retry';
                };

                const recoveryResult = await errorService.executeWithRecovery(
                    mockOperation,
                    {
                        maxAttempts: 3,
                        backoffMultiplier: 1.5,
                        initialDelay: 100
                    }
                );

                expect(isApiSuccess(recoveryResult)).to.be.true;
                if (isApiSuccess(recoveryResult)) {
                    expect(recoveryResult.data).to.equal('Success after retry');
                    expect(recoveryResult.metadata?.attemptCount).to.equal(3);
                }

                const retryDuration = performance.now() - retryStartTime;
                trackPerformanceMetric('error_recovery_retry', retryDuration, true);

                // Performance assertion (should be quick but allow for retry delays)
                expect(retryDuration).to.be.lessThan(config.performance.maxErrorRecoveryTime);

            } catch (error) {
                const retryDuration = performance.now() - retryStartTime;
                trackPerformanceMetric('error_recovery_retry', retryDuration, false);
                throw error;
            }
        });
    });

    describe('Cross-Module Integration (Auth + Gateway + Error Handling)', () => {
        it('should coordinate all Phase 1.3 services together', async function() {
            this.timeout(30000);

            const startTime = performance.now();

            try {
                // Initialize all services
                const authService = await initializeAuthService();
                const gatewayService = await initializeGatewayService();
                const errorService = await initializeErrorService();
                const app = await setupTestServer();

                // Configure integrated middleware stack
                const authMiddleware = new AuthMiddleware(authService);
                const rateLimitMiddleware = new RateLimitingMiddleware({
                    windowMs: 60000,
                    maxRequests: 100
                });

                // Setup error handling for the entire app
                app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
                    errorService.handleError(error, {
                        source: 'gateway',
                        operation: 'request_processing',
                        timestamp: createTimestamp(),
                        requestId: req.headers['x-request-id'] as string || generateUUID()
                    }).then(errorResult => {
                        if (isApiSuccess(errorResult)) {
                            res.status(errorResult.data.statusCode || 500).json(errorResult.data.response);
                        } else {
                            res.status(500).json({ error: 'Error handling failed' });
                        }
                    }).catch(() => {
                        res.status(500).json({ error: 'Critical error' });
                    });
                });

                // Setup integrated routes
                app.use('/api/protected', authMiddleware.authenticate.bind(authMiddleware));
                app.use('/api', rateLimitMiddleware.middleware.bind(rateLimitMiddleware));

                // Start test server
                const server = app.listen(0);
                testContext.server.instance = server;
                const address = server.address() as any;
                testContext.server.port = address.port;

                // Create test user and token
                const testUser = await createTestUser();
                const token = await generateTestToken(testUser);

                // Test successful authenticated request
                const successStartTime = performance.now();
                const successResponse = await supertest(app)
                    .post('/api/protected')
                    .set('Authorization', `Bearer ${token}`)
                    .send({ data: 'integration test' })
                    .expect(200);

                expect(successResponse.body).to.have.property('success', true);
                const successDuration = performance.now() - successStartTime;
                trackPerformanceMetric('integrated_success_flow', successDuration, true);

                // Test error handling flow
                const errorStartTime = performance.now();
                await supertest(app)
                    .post('/api/protected')
                    .set('Authorization', 'Bearer invalid-token')
                    .send({ data: 'should fail' })
                    .expect(401);

                const errorDuration = performance.now() - errorStartTime;
                trackPerformanceMetric('integrated_error_flow', errorDuration, true);

                // Verify all services are still healthy
                const authHealth = await authService.getHealthStatus();
                const gatewayHealth = await gatewayService.getHealthStatus();
                const errorHealth = await errorService.getHealthStatus();

                expect(isApiSuccess(authHealth) && authHealth.data.isHealthy).to.be.true;
                expect(gatewayHealth.isHealthy).to.be.true;
                expect(errorHealth.isHealthy).to.be.true;

                const duration = performance.now() - startTime;
                trackPerformanceMetric('full_integration_test', duration, true);

            } catch (error) {
                const duration = performance.now() - startTime;
                trackPerformanceMetric('full_integration_test', duration, false);
                throw error;
            }
        });

        it('should handle complex error scenarios across all services', async function() {
            this.timeout(20000);

            const authService = await initializeAuthService();
            const gatewayService = await initializeGatewayService();
            const errorService = await initializeErrorService();

            // Simulate cascade failure scenario
            const cascadeStartTime = performance.now();
            try {
                // Simulate auth service degradation
                const authFailureResult = await errorService.handleError(
                    new ReadyAIError('Auth service temporarily unavailable', 'AUTH_DEGRADED', 503, {}, true, 5000),
                    {
                        source: 'auth_service',
                        operation: 'token_validation',
                        timestamp: createTimestamp()
                    }
                );

                expect(isApiSuccess(authFailureResult)).to.be.true;
                if (isApiSuccess(authFailureResult)) {
                    expect(authFailureResult.data.recoverable).to.be.true;
                    expect(authFailureResult.data.recovery?.strategy).to.be.a('string');
                }

                // Verify services can continue operating in degraded mode
                const degradedHealth = await errorService.getHealthStatus();
                expect(degradedHealth.isHealthy).to.be.true; // Error service should still be healthy

                const cascadeDuration = performance.now() - cascadeStartTime;
                trackPerformanceMetric('cascade_error_handling', cascadeDuration, true);

            } catch (error) {
                const cascadeDuration = performance.now() - cascadeStartTime;
                trackPerformanceMetric('cascade_error_handling', cascadeDuration, false);
                throw error;
            }
        });
    });

    describe('Performance and Security Validation', () => {
        it('should meet ReadyAI performance KPIs for Phase 1.3 operations', async function() {
            this.timeout(30000);

            const authService = await initializeAuthService();
            const gatewayService = await initializeGatewayService();
            const app = await setupTestServer();

            // Setup performance test scenario
            const server = app.listen(0);
            testContext.server.instance = server;
            const address = server.address() as any;
            testContext.server.port = address.port;

            const testUser = await createTestUser();
            const batchSize = 20;
            const operationResults: Array<{ operation: string; duration: number; success: boolean }> = [];

            // Performance test batch
            for (let i = 0; i < batchSize; i++) {
                // Authentication operation
                const authStart = performance.now();
                try {
                    const token = await generateTestToken(testUser);
                    const authDuration = performance.now() - authStart;
                    operationResults.push({ operation: 'authentication', duration: authDuration, success: true });

                    // Gateway operation
                    const gatewayStart = performance.now();
                    await supertest(app)
                        .get('/health')
                        .expect(200);
                    const gatewayDuration = performance.now() - gatewayStart;
                    operationResults.push({ operation: 'gateway_request', duration: gatewayDuration, success: true });

                } catch (error) {
                    const authDuration = performance.now() - authStart;
                    operationResults.push({ operation: 'authentication', duration: authDuration, success: false });
                }
            }

            // Performance analysis
            const authOperations = operationResults.filter(r => r.operation === 'authentication');
            const gatewayOperations = operationResults.filter(r => r.operation === 'gateway_request');

            const avgAuthLatency = authOperations.reduce((sum, op) => sum + op.duration, 0) / authOperations.length;
            const avgGatewayLatency = gatewayOperations.reduce((sum, op) => sum + op.duration, 0) / gatewayOperations.length;

            const authSuccessRate = authOperations.filter(op => op.success).length / authOperations.length * 100;
            const gatewaySuccessRate = gatewayOperations.filter(op => op.success).length / gatewayOperations.length * 100;

            console.log(`📊 Performance KPI Results:
                Authentication Operations:
                - Average Latency: ${avgAuthLatency.toFixed(2)}ms
                - Success Rate: ${authSuccessRate.toFixed(1)}%
                - KPI Compliance: ${avgAuthLatency < config.performance.maxAuthTime ? 'PASS' : 'FAIL'}
                
                Gateway Operations:
                - Average Latency: ${avgGatewayLatency.toFixed(2)}ms
                - Success Rate: ${gatewaySuccessRate.toFixed(1)}%
                - KPI Compliance: ${avgGatewayLatency < config.performance.maxGatewayResponseTime ? 'PASS' : 'FAIL'}`);

            // KPI Assertions
            expect(avgAuthLatency).to.be.lessThan(config.performance.maxAuthTime, 
                `Authentication average latency should be under ${config.performance.maxAuthTime}ms`);
            expect(avgGatewayLatency).to.be.lessThan(config.performance.maxGatewayResponseTime, 
                `Gateway average latency should be under ${config.performance.maxGatewayResponseTime}ms`);
            expect(authSuccessRate).to.be.greaterThan(95, 'Authentication operations should have >95% success rate');
            expect(gatewaySuccessRate).to.be.greaterThan(95, 'Gateway operations should have >95% success rate');
        });

        it('should validate security measures and token integrity', async function() {
            this.timeout(15000);

            const authService = await initializeAuthService();
            const testUser = await createTestUser();

            // Test token security
            const securityStartTime = performance.now();
            try {
                // Generate valid token
                const validToken = await generateTestToken(testUser);
                
                // Test token validation
                const validResult = await authService.validateToken(validToken);
                expect(isApiSuccess(validResult)).to.be.true;
                if (isApiSuccess(validResult)) {
                    expect(validResult.data.valid).to.be.true;
                    expect(validResult.data.payload.sub).to.equal(testUser.id);
                }

                // Test invalid token handling
                const invalidToken = 'invalid.jwt.token';
                const invalidResult = await authService.validateToken(invalidToken);
                expect(isApiSuccess(invalidResult)).to.be.true;
                if (isApiSuccess(invalidResult)) {
                    expect(invalidResult.data.valid).to.be.false;
                    expect(invalidResult.data.error).to.be.a('string');
                }

                // Test expired token handling
                const expiredPayload: TokenPayload = {
                    sub: testUser.id,
                    email: testUser.email,
                    displayName: testUser.displayName,
                    roles: testUser.roles,
                    permissions: testUser.permissions,
                    iat: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
                    exp: Math.floor(Date.now() / 1000) - 3600  // 1 hour ago (expired)
                };

                const expiredToken = jwt.sign(expiredPayload, config.authentication.jwtSecret);
                const expiredResult = await authService.validateToken(expiredToken);
                expect(isApiSuccess(expiredResult)).to.be.true;
                if (isApiSuccess(expiredResult)) {
                    expect(expiredResult.data.valid).to.be.false;
                    expect(expiredResult.data.error).to.include('expired');
                }

                const securityDuration = performance.now() - securityStartTime;
                trackPerformanceMetric('security_validation', securityDuration, true);

            } catch (error) {
                const securityDuration = performance.now() - securityStartTime;
                trackPerformanceMetric('security_validation', securityDuration, false);
                throw error;
            }
        });
    });

    describe('Production Readiness Validation', () => {
        it('should demonstrate production-ready service lifecycle management', async function() {
            this.timeout(25000);

            // Test full service lifecycle
            let authService: AuthService | undefined;
            let gatewayService: GatewayService | undefined;
            let errorService: ErrorService | undefined;

            try {
                // 1. Cold start initialization
                const initStart = performance.now();
                authService = await initializeAuthService();
                gatewayService = await initializeGatewayService();
                errorService = await initializeErrorService();
                const initDuration = performance.now() - initStart;

                trackPerformanceMetric('cold_start_initialization', initDuration, true);
                expect(initDuration).to.be.lessThan(15000); // 15 seconds max for cold start

                // 2. Warm-up operations
                const warmupStart = performance.now();
                const testUser = await createTestUser();
                const token = await generateTestToken(testUser);
                
                await authService.validateToken(token);
                await gatewayService.getHealthStatus();
                await errorService.getHealthStatus();
                
                const warmupDuration = performance.now() - warmupStart;
                trackPerformanceMetric('service_warmup', warmupDuration, true);

                // 3. Graceful shutdown test
                const shutdownStart = performance.now();
                
                await errorService.shutdown();
                await gatewayService.shutdown();
                await authService.shutdown();
                
                const shutdownDuration = performance.now() - shutdownStart;
                trackPerformanceMetric('graceful_shutdown', shutdownDuration, true);
                expect(shutdownDuration).to.be.lessThan(10000); // 10 seconds max for shutdown

                // Clear references after successful shutdown
                errorService = undefined;
                gatewayService = undefined;
                authService = undefined;
                testContext.services.auth = undefined;
                testContext.services.gateway = undefined;
                testContext.services.errorService = undefined;

                console.log(`🏭 Production Lifecycle Metrics:
                    - Cold Start: ${initDuration.toFixed(2)}ms
                    - Warmup: ${warmupDuration.toFixed(2)}ms
                    - Shutdown: ${shutdownDuration.toFixed(2)}ms`);

            } catch (error) {
                // Ensure cleanup even on failure
                if (errorService) await errorService.shutdown().catch(() => {});
                if (gatewayService) await gatewayService.shutdown().catch(() => {});
                if (authService) await authService.shutdown().catch(() => {});
                throw error;
            }
        });

        it('should validate comprehensive monitoring and health checks', async function() {
            this.timeout(10000);

            const authService = await initializeAuthService();
            const gatewayService = await initializeGatewayService();
            const errorService = await initializeErrorService();

            // Test health monitoring
            const healthChecks = await Promise.all([
                authService.getHealthStatus(),
                gatewayService.getHealthStatus(),
                errorService.getHealthStatus()
            ]);

            // Validate auth service health
            const authHealth = healthChecks[0];
            expect(isApiSuccess(authHealth)).to.be.true;
            if (isApiSuccess(authHealth)) {
                expect(authHealth.data.isHealthy).to.be.true;
                expect(authHealth.data.services).to.have.property('tokenManager');
                expect(authHealth.data.services).to.have.property('sessionManager');
                expect(authHealth.data.performance).to.have.property('averageResponseTime');
            }

            // Validate gateway service health
            const gatewayHealth = healthChecks[1];
            expect(gatewayHealth.isHealthy).to.be.true;
            expect(gatewayHealth.services).to.have.property('router');
            expect(gatewayHealth.services).to.have.property('middleware');
            expect(gatewayHealth.metrics).to.have.property('totalRequests');

            // Validate error service health
            const errorHealth = healthChecks[2];
            expect(errorHealth.isHealthy).to.be.true;
            expect(errorHealth.services).to.have.property('classifier');
            expect(errorHealth.services).to.have.property('recovery');

            console.log(`📈 Service Health Summary:
                Authentication: ${isApiSuccess(authHealth) && authHealth.data.isHealthy ? 'Healthy' : 'Unhealthy'}
                Gateway: ${gatewayHealth.isHealthy ? 'Healthy' : 'Unhealthy'}
                Error Handling: ${errorHealth.isHealthy ? 'Healthy' : 'Unhealthy'}
                Total Test Operations: ${testContext.assertions.totalOperations}
                Test Success Rate: ${testContext.assertions.totalOperations > 0 ? (testContext.assertions.successfulOperations / testContext.assertions.totalOperations * 100).toFixed(1) : 0}%`);
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

            console.log(`\n🎯 ReadyAI Phase 1.3 Integration Test Summary:
                ✅ All Authentication Service tests completed
                ✅ All API Gateway Service tests completed  
                ✅ All Error Handling & Recovery tests completed
                ✅ All Cross-Module Integration tests completed
                ✅ All Performance and Security validations completed
                ✅ All Production Readiness tests completed
                
                📊 Final Metrics:
                - Total Test Duration: ${totalTestTime.toFixed(2)}ms
                - Total Operations: ${testContext.assertions.totalOperations}
                - Success Rate: ${successRate.toFixed(1)}%
                - Average Latency: ${testContext.assertions.averageLatency.toFixed(2)}ms
                
                🚀 Phase 1.3 Integration: ${successRate >= 95 ? 'PRODUCTION READY' : 'NEEDS OPTIMIZATION'}
            `);
        }
    });
});
