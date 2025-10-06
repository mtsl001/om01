// apps/api/server.ts

/**
 * ReadyAI API Server - Production-grade Express server with Cline-accelerated patterns (Updated for Phase 2.1)
 * 
 * This server implementation leverages Cline's proven extension activation patterns
 * and service coordination architecture, adapted for ReadyAI's comprehensive API
 * gateway system with integrated authentication, error handling, and modular
 * controller registration.
 * 
 * PHASE 2.1 UPDATE: Added Project Management Module Integration
 * - Project management controller registration
 * - Project orchestration middleware integration
 * - Enhanced dependency injection for project services
 * - Project-specific route registration and middleware
 * 
 * Key Adaptations from Cline:
 * - Extension activation patterns from Cline's extension.ts startup sequence
 * - Service coordination patterns from Cline's Controller architecture  
 * - Error handling and retry mechanisms from Cline's ErrorService patterns
 * - Gateway middleware patterns from Cline's WebviewProvider architecture
 * - Authentication middleware from Cline's AuthService patterns
 * - Module registration from Cline's provider system initialization
 * - Graceful shutdown patterns from Cline's resource cleanup
 * - Project lifecycle management from Cline's TaskManager patterns (NEW)
 * - Project orchestration from Cline's TaskExecutor coordination (NEW)
 * 
 * ReadyAI Extensions:
 * - Comprehensive API Gateway middleware stack
 * - Advanced authentication and session management
 * - Enterprise-grade error handling and recovery
 * - Multi-controller registration system with health monitoring
 * - Production-ready dependency injection container
 * - Request/response validation and transformation
 * - Rate limiting and security middleware
 * - Comprehensive telemetry and monitoring integration
 * - Project management lifecycle and orchestration (Phase 2.1)
 * - Project-aware context management and validation (Phase 2.1)
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer, Server } from 'http';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// ReadyAI Core Dependencies
import {
  UUID,
  ApiResponse,
  ApiErrorResponse,
  ReadyAIError,
  createApiResponse,
  createApiError,
  wrapAsync,
  PhaseType
} from '../../packages/foundation/types/core';

// Service Dependencies - Enhanced with Phase 1.3 modules
import { Logger, LoggerConfig } from '../../packages/logging/services/Logger';
import { ConfigService } from '../../packages/config/services/ConfigService';
import { ConfigRepository } from '../../packages/config/repositories/ConfigRepository';
import { ConfigNormalizer } from '../../packages/config/services/ConfigNormalizer';
import { ErrorService } from '../../packages/error-handling/services/ErrorService';
import { ErrorClassifier } from '../../packages/error-handling/services/ErrorClassifier';
import { ErrorRecovery } from '../../packages/error-handling/services/ErrorRecovery';

// Database Service Dependencies
import { DatabaseService } from '../../packages/database/services/DatabaseService';
import { DatabaseRepository } from '../../packages/database/repositories/DatabaseRepository';
import { MigrationService } from '../../packages/database/services/MigrationService';
import { QueryBuilder } from '../../packages/database/utils/QueryBuilder';

// Vector Database Service Dependencies
import { VectorDatabaseService } from '../../packages/vectordb/services/VectorDatabaseService';
import { VectorRepository } from '../../packages/vectordb/repositories/VectorRepository';
import { EmbeddingService } from '../../packages/vectordb/services/EmbeddingService';

// Authentication Service Dependencies (Phase 1.3)
import { AuthService } from '../../packages/auth/services/AuthService';
import { TokenManager } from '../../packages/auth/services/TokenManager';
import { SessionManager } from '../../packages/auth/services/SessionManager';
import { AuthMiddleware } from '../../packages/auth/middleware/AuthMiddleware';

// API Gateway Dependencies (Phase 1.3)
import { GatewayService } from '../../packages/api-gateway/services/GatewayService';
import { RequestRouter } from '../../packages/api-gateway/services/RequestRouter';
import { ValidationMiddleware } from '../../packages/api-gateway/middleware/ValidationMiddleware';
import { RateLimitingMiddleware } from '../../packages/api-gateway/middleware/RateLimitingMiddleware';
import { ApiDocumentationService } from '../../packages/api-gateway/services/ApiDocumentationService';

// Project Management Dependencies (Phase 2.1 - NEW)
import { ProjectService } from '../../packages/project-management/services/ProjectService';
import { ProjectOrchestrator } from '../../packages/project-management/services/ProjectOrchestrator';
import { ProjectStateManager } from '../../packages/project-management/services/ProjectStateManager';
import { ProjectWorkspaceManager } from '../../packages/project-management/services/ProjectWorkspaceManager';
import { ProjectCreationService } from '../../packages/project-management/services/ProjectCreationService';
import { ProjectConfigurationService } from '../../packages/project-management/services/ProjectConfigurationService';
import { ProjectValidator } from '../../packages/project-management/services/ProjectValidator';
import { ProjectEventService } from '../../packages/project-management/services/ProjectEventService';
import { PhaseManager } from '../../packages/project-management/services/PhaseManager';
import { ServiceCoordinator } from '../../packages/project-management/services/ServiceCoordinator';

// Project Management Repository Dependencies (Phase 2.1 - NEW)
import { ProjectRepository } from '../../packages/project-management/repositories/ProjectRepository';
import { ProjectStateRepository } from '../../packages/project-management/repositories/ProjectStateRepository';
import { ProjectMetadataService } from '../../packages/project-management/services/ProjectMetadataService';
import { ProjectSettingsService } from '../../packages/project-management/services/ProjectSettingsService';

// Controller Dependencies - All phases including Phase 2.1
import { ConfigController } from '../../packages/config/controllers/ConfigController';
import { LoggingController } from '../../packages/logging/controllers/LoggingController';
import { DatabaseController } from '../../packages/database/controllers/DatabaseController';
import { VectorDatabaseController } from '../../packages/vectordb/controllers/VectorDatabaseController';
import { ErrorController } from '../../packages/error-handling/controllers/ErrorController';
import { AuthController } from '../../packages/auth/controllers/AuthController';
import { GatewayController } from '../../packages/api-gateway/controllers/GatewayController';

// Project Management Controllers (Phase 2.1 - NEW)
import { ProjectController } from '../../packages/project-management/controllers/ProjectController';
import { ProjectOrchestrationController } from '../../packages/project-management/controllers/ProjectOrchestrationController';
import { ProjectSettingsController } from '../../packages/project-management/controllers/ProjectSettingsController';

/**
 * Enhanced server configuration interface with comprehensive Phase 2.1 options
 * Adapted from Cline's configuration patterns with ReadyAI gateway and project management extensions
 */
export interface ReadyAIServerConfig {
  /** Server port */
  port: number;
  /** Server host */
  host: string;
  /** Environment mode */
  environment: 'development' | 'production' | 'test';
  /** CORS origins */
  corsOrigin: string[];
  /** Request timeout in milliseconds */
  requestTimeout: number;
  /** Enable request logging */
  enableRequestLogging: boolean;
  /** Enable compression */
  enableCompression: boolean;
  /** Enable rate limiting */
  enableRateLimit: boolean;
  /** Rate limit configuration */
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  /** Security configuration */
  security: {
    enableHelmet: boolean;
    trustProxy: boolean;
    jwtSecret: string;
    jwtExpiresIn: string;
    bcryptSaltRounds: number;
  };
  /** Health check configuration */
  healthCheck: {
    enabled: boolean;
    endpoint: string;
  };
  /** API Gateway configuration */
  gateway: {
    enabled: boolean;
    enableValidation: boolean;
    enableDocumentation: boolean;
    enableMetrics: boolean;
    maxRequestSize: string;
  };
  /** Authentication configuration */
  auth: {
    enabled: boolean;
    enableSessions: boolean;
    sessionTimeout: number;
    enableRefreshTokens: boolean;
    refreshTokenExpiry: number;
  };
  /** Project Management configuration (Phase 2.1 - NEW) */
  projectManagement: {
    enabled: boolean;
    enableOrchestration: boolean;
    enableWorkspaceManagement: boolean;
    enablePhaseProgression: boolean;
    maxConcurrentProjects: number;
    projectTimeoutMs: number;
    enableProjectMetrics: boolean;
    enableProjectEvents: boolean;
    defaultProjectSettings: {
      enableAutoSave: boolean;
      autoSaveIntervalMs: number;
      enableVersioning: boolean;
      maxVersionHistory: number;
    };
  };
}

/**
 * Enhanced default server configuration optimized for ReadyAI Phase 2.1 deployment
 */
const DEFAULT_SERVER_CONFIG: ReadyAIServerConfig = {
  port: parseInt(process.env.PORT || '8000', 10),
  host: process.env.HOST || 'localhost',
  environment: (process.env.NODE_ENV as any) || 'development',
  corsOrigin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:5173'],
  requestTimeout: 30000, // 30 seconds
  enableRequestLogging: true,
  enableCompression: true,
  enableRateLimit: true,
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 1000, // requests per window
  },
  security: {
    enableHelmet: true,
    trustProxy: process.env.NODE_ENV === 'production',
    jwtSecret: process.env.JWT_SECRET || 'readyai-dev-secret-key',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10),
  },
  healthCheck: {
    enabled: true,
    endpoint: '/health',
  },
  gateway: {
    enabled: true,
    enableValidation: true,
    enableDocumentation: true,
    enableMetrics: true,
    maxRequestSize: '10mb',
  },
  auth: {
    enabled: true,
    enableSessions: true,
    sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
    enableRefreshTokens: true,
    refreshTokenExpiry: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
  // Phase 2.1 Project Management Configuration (NEW)
  projectManagement: {
    enabled: true,
    enableOrchestration: true,
    enableWorkspaceManagement: true,
    enablePhaseProgression: true,
    maxConcurrentProjects: parseInt(process.env.MAX_CONCURRENT_PROJECTS || '10', 10),
    projectTimeoutMs: parseInt(process.env.PROJECT_TIMEOUT_MS || '300000', 10), // 5 minutes
    enableProjectMetrics: true,
    enableProjectEvents: true,
    defaultProjectSettings: {
      enableAutoSave: true,
      autoSaveIntervalMs: 30000, // 30 seconds
      enableVersioning: true,
      maxVersionHistory: 50,
    },
  },
};

/**
 * Enhanced controller registration metadata for Phase 2.1 modular architecture
 * Following Cline's provider registration patterns with gateway integration
 */
interface ControllerRegistration {
  name: string;
  path: string;
  router: express.Router;
  controller?: any;
  version: string;
  status: 'active' | 'inactive' | 'error';
  registeredAt: string;
  healthCheck?: () => Promise<boolean>;
  requiresAuth?: boolean;
  rateLimits?: {
    windowMs: number;
    maxRequests: number;
  };
  middleware?: express.RequestHandler[];
  // Phase 2.1 enhancements (NEW)
  projectAware?: boolean;
  phaseRequirements?: PhaseType[];
  dependsOn?: string[];
}

/**
 * Enhanced server metrics for comprehensive Phase 2.1 monitoring
 * Adapted from Cline's telemetry collection patterns
 */
interface ServerMetrics {
  startTime: Date;
  requestCount: number;
  errorCount: number;
  activeConnections: number;
  authenticatedSessions: number;
  failedAuthAttempts: number;
  gatewayRequests: number;
  // Phase 2.1 project metrics (NEW)
  activeProjects: number;
  totalProjectsCreated: number;
  projectOperations: number;
  orchestrationRequests: number;
  phaseTransitions: number;
  projectErrors: number;
  uptime: () => number;
  memoryUsage: NodeJS.MemoryUsage;
  registeredControllers: number;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
}

/**
 * Enhanced Dependency Injection Container for Phase 2.1
 * Production-grade service management following enterprise patterns
 */
class ServiceContainer {
  private services = new Map<string, any>();
  private factories = new Map<string, () => any>();
  private singletons = new Map<string, any>();
  private dependencies = new Map<string, string[]>();

  /**
   * Register a service factory with dependency tracking
   */
  register<T>(name: string, factory: () => T, deps: string[] = [], singleton = true): void {
    this.factories.set(name, factory);
    this.dependencies.set(name, deps);
    if (singleton && !this.singletons.has(name)) {
      this.singletons.set(name, null);
    }
  }

  /**
   * Get a service instance with dependency injection
   */
  get<T>(name: string): T {
    if (this.singletons.has(name)) {
      let instance = this.singletons.get(name);
      if (!instance) {
        // Check dependencies first
        const deps = this.dependencies.get(name) || [];
        for (const dep of deps) {
          if (!this.has(dep)) {
            throw new Error(`Dependency '${dep}' not found for service '${name}'`);
          }
        }

        const factory = this.factories.get(name);
        if (!factory) throw new Error(`Service '${name}' not registered`);
        instance = factory();
        this.singletons.set(name, instance);
      }
      return instance;
    }

    const factory = this.factories.get(name);
    if (!factory) throw new Error(`Service '${name}' not registered`);
    return factory();
  }

  /**
   * Check if a service is registered
   */
  has(name: string): boolean {
    return this.factories.has(name);
  }

  /**
   * Clear all services (for cleanup)
   */
  clear(): void {
    this.services.clear();
    this.factories.clear();
    this.singletons.clear();
    this.dependencies.clear();
  }

  /**
   * Get dependency graph for debugging
   */
  getDependencyGraph(): Record<string, string[]> {
    const graph: Record<string, string[]> = {};
    for (const [service, deps] of this.dependencies.entries()) {
      graph[service] = deps;
    }
    return graph;
  }
}

/**
 * ReadyAI API Server - Enterprise-grade Express server with Phase 2.1 capabilities
 * 
 * Implements Cline's proven server architecture enhanced with:
 * - Comprehensive API Gateway middleware stack
 * - Advanced authentication and session management
 * - Enterprise-grade error handling and recovery
 * - Multi-controller registration with health monitoring
 * - Advanced dependency injection with circular dependency detection
 * - Request/response validation and transformation
 * - Rate limiting and security middleware
 * - Performance monitoring and telemetry integration
 * - Graceful startup and shutdown sequences
 * - Project management lifecycle and orchestration (Phase 2.1)
 * - Project-aware request routing and validation (Phase 2.1)
 * - Multi-project coordination and state management (Phase 2.1)
 */
export class ReadyAIServer {
  private readonly app: Express;
  private server: Server | null = null;
  private readonly config: ReadyAIServerConfig;
  private readonly logger: Logger;
  private readonly controllers: Map<string, ControllerRegistration> = new Map();
  private readonly metrics: ServerMetrics;
  private readonly container: ServiceContainer;
  private readonly errorService: ErrorService;
  private readonly authService: AuthService;
  private readonly gatewayService: GatewayService;
  // Phase 2.1 Project Management Services (NEW)
  private readonly projectService: ProjectService;
  private readonly projectOrchestrator: ProjectOrchestrator;
  private readonly serviceCoordinator: ServiceCoordinator;
  private isShuttingDown = false;
  private shutdownTimeout?: NodeJS.Timeout;

  constructor(config?: Partial<ReadyAIServerConfig>) {
    this.config = { ...DEFAULT_SERVER_CONFIG, ...config };
    this.app = express();
    
    // Initialize dependency injection container
    this.container = new ServiceContainer();
    
    // Initialize logger with enhanced server-specific configuration
    const loggerConfig: Partial<LoggerConfig> = {
      level: this.config.environment === 'development' ? 'debug' : 'info',
      enableConsole: true,
      enableFile: this.config.environment === 'production',
      enableCorrelation: true,
      enableMetrics: true,
      enablePhaseTracking: true,
      enableAuthentication: true,
      enableGateway: true,
      enableProjectManagement: this.config.projectManagement.enabled, // Phase 2.1
    };
    this.logger = Logger.getInstance(loggerConfig);

    // Initialize core services early
    this.initializeCoreServices();

    // Get services from container
    this.errorService = this.container.get<ErrorService>('errorService');
    this.authService = this.container.get<AuthService>('authService');
    this.gatewayService = this.container.get<GatewayService>('gatewayService');
    
    // Phase 2.1 Project Management Services (NEW)
    this.projectService = this.container.get<ProjectService>('projectService');
    this.projectOrchestrator = this.container.get<ProjectOrchestrator>('projectOrchestrator');
    this.serviceCoordinator = this.container.get<ServiceCoordinator>('serviceCoordinator');

    // Initialize enhanced metrics with Phase 2.1 support
    this.metrics = {
      startTime: new Date(),
      requestCount: 0,
      errorCount: 0,
      activeConnections: 0,
      authenticatedSessions: 0,
      failedAuthAttempts: 0,
      gatewayRequests: 0,
      // Phase 2.1 metrics (NEW)
      activeProjects: 0,
      totalProjectsCreated: 0,
      projectOperations: 0,
      orchestrationRequests: 0,
      phaseTransitions: 0,
      projectErrors: 0,
      uptime: () => Date.now() - this.metrics.startTime.getTime(),
      memoryUsage: process.memoryUsage(),
      registeredControllers: 0,
      healthStatus: 'healthy',
    };

    this.initializeServer();
  }

  /**
   * Initialize core services in dependency injection container with Phase 2.1 enhancements
   * Following Cline's service initialization patterns with project management integration
   */
  private initializeCoreServices(): void {
    try {
      this.logger.info('Initializing ReadyAI Phase 2.1 core services...', 'server');

      // Register repositories (no dependencies)
      this.container.register('configRepository', () => new ConfigRepository());
      this.container.register('databaseRepository', () => new DatabaseRepository());
      this.container.register('vectorRepository', () => new VectorRepository());
      
      // Phase 2.1 Project Management Repositories (NEW)
      this.container.register('projectRepository', () => new ProjectRepository());
      this.container.register('projectStateRepository', () => new ProjectStateRepository());
      
      // Register utility services
      this.container.register('configNormalizer', () => new ConfigNormalizer());
      this.container.register('queryBuilder', () => new QueryBuilder());

      // Register error handling services (Phase 1.3)
      this.container.register('errorClassifier', () => new ErrorClassifier());
      this.container.register('errorRecovery', () => new ErrorRecovery(), ['errorClassifier']);
      this.container.register('errorService', () => {
        const classifier = this.container.get<ErrorClassifier>('errorClassifier');
        const recovery = this.container.get<ErrorRecovery>('errorRecovery');
        return new ErrorService(classifier, recovery, this.logger);
      }, ['errorClassifier', 'errorRecovery']);

      // Register authentication services (Phase 1.3)
      this.container.register('tokenManager', () => {
        return new TokenManager({
          jwtSecret: this.config.security.jwtSecret,
          jwtExpiresIn: this.config.security.jwtExpiresIn,
          bcryptSaltRounds: this.config.security.bcryptSaltRounds,
        }, this.logger);
      });

      this.container.register('sessionManager', () => {
        const tokenManager = this.container.get<TokenManager>('tokenManager');
        return new SessionManager(tokenManager, {
          sessionTimeout: this.config.auth.sessionTimeout,
          enableRefreshTokens: this.config.auth.enableRefreshTokens,
          refreshTokenExpiry: this.config.auth.refreshTokenExpiry,
        }, this.logger);
      }, ['tokenManager']);

      this.container.register('authService', () => {
        const sessionManager = this.container.get<SessionManager>('sessionManager');
        const tokenManager = this.container.get<TokenManager>('tokenManager');
        return new AuthService(sessionManager, tokenManager, this.logger);
      }, ['sessionManager', 'tokenManager']);

      // Register API Gateway services (Phase 1.3)
      this.container.register('requestRouter', () => {
        return new RequestRouter({
          enableLoadBalancing: true,
          enableCircuitBreaker: true,
          enableRetry: true,
          maxRetries: 3,
          // Phase 2.1 Project-aware routing (NEW)
          enableProjectRouting: this.config.projectManagement.enabled,
        }, this.logger);
      });

      this.container.register('validationMiddleware', () => {
        return new ValidationMiddleware({
          enableRequestValidation: this.config.gateway.enableValidation,
          enableResponseValidation: this.config.gateway.enableValidation,
          enableSchemaCache: true,
          // Phase 2.1 Project validation (NEW)
          enableProjectValidation: this.config.projectManagement.enabled,
        }, this.logger);
      });

      this.container.register('rateLimitingMiddleware', () => {
        return new RateLimitingMiddleware({
          defaultWindowMs: this.config.rateLimit.windowMs,
          defaultMaxRequests: this.config.rateLimit.maxRequests,
          enableDistributedLimiting: false,
          enableUserSpecificLimits: true,
          // Phase 2.1 Project-aware rate limiting (NEW)
          enableProjectSpecificLimits: this.config.projectManagement.enabled,
        }, this.logger);
      });

      this.container.register('apiDocumentationService', () => {
        return new ApiDocumentationService({
          enabled: this.config.gateway.enableDocumentation,
          title: 'ReadyAI API',
          version: '2.1.0', // Updated for Phase 2.1
          description: 'ReadyAI Personal AI Development Orchestrator API with Project Management',
          // Phase 2.1 documentation enhancements (NEW)
          includeProjectManagement: this.config.projectManagement.enabled,
        }, this.logger);
      });

      this.container.register('gatewayService', () => {
        const router = this.container.get<RequestRouter>('requestRouter');
        const validation = this.container.get<ValidationMiddleware>('validationMiddleware');
        const rateLimiting = this.container.get<RateLimitingMiddleware>('rateLimitingMiddleware');
        const documentation = this.container.get<ApiDocumentationService>('apiDocumentationService');
        
        return new GatewayService(
          router,
          validation,
          rateLimiting,
          documentation,
          {
            enabled: this.config.gateway.enabled,
            enableMetrics: this.config.gateway.enableMetrics,
            enableHealthChecks: true,
            enableRequestTracing: true,
            // Phase 2.1 Project integration (NEW)
            enableProjectIntegration: this.config.projectManagement.enabled,
          },
          this.logger
        );
      }, ['requestRouter', 'validationMiddleware', 'rateLimitingMiddleware', 'apiDocumentationService']);

      // Register existing Phase 1.1/1.2 services
      this.container.register('configService', () => {
        const configRepository = this.container.get<ConfigRepository>('configRepository');
        const configNormalizer = this.container.get<ConfigNormalizer>('configNormalizer');
        
        return new ConfigService(
          configRepository,
          configNormalizer,
          {
            enableAutoValidation: true,
            enableChangeEvents: true,
            maxRetryAttempts: 3,
            retryDelayMs: 1000,
            enableCaching: true,
            cacheTtlMs: 300000, // 5 minutes
            enableBackgroundSync: false,
            // Phase 2.1 Project integration (NEW)
            enableProjectIntegration: this.config.projectManagement.enabled,
          },
          this.logger
        );
      }, ['configRepository', 'configNormalizer']);

      this.container.register('databaseService', () => {
        const databaseRepository = this.container.get<DatabaseRepository>('databaseRepository');
        const queryBuilder = this.container.get<QueryBuilder>('queryBuilder');
        
        return new DatabaseService(
          databaseRepository,
          queryBuilder,
          {
            connectionPoolSize: 10,
            connectionTimeoutMs: 30000,
            queryTimeoutMs: 60000,
            enableQueryLogging: this.config.environment === 'development',
            enableAutoMigrations: true,
            enableTransactionSupport: true,
            enableQueryOptimization: true,
            // Phase 2.1 Project support (NEW)
            enableProjectTables: this.config.projectManagement.enabled,
          },
          this.logger
        );
      }, ['databaseRepository', 'queryBuilder']);

      this.container.register('migrationService', () => {
        const databaseService = this.container.get<DatabaseService>('databaseService');
        return new MigrationService(
          databaseService,
          {
            migrationsPath: './migrations',
            enableAutoMigrations: true,
            enableRollback: true,
            enableBackup: true,
            // Phase 2.1 Project migrations (NEW)
            includeProjectMigrations: this.config.projectManagement.enabled,
          },
          this.logger
        );
      }, ['databaseService']);

      this.container.register('embeddingService', () => {
        return new EmbeddingService(
          {
            provider: 'openai',
            model: 'text-embedding-ada-002',
            dimensions: 1536,
            enableCaching: true,
            cacheTtlMs: 3600000, // 1 hour
            batchSize: 100,
            enableRetry: true,
            maxRetryAttempts: 3,
            // Phase 2.1 Project context (NEW)
            enableProjectContext: this.config.projectManagement.enabled,
          },
          this.logger
        );
      });

      this.container.register('vectorDatabaseService', () => {
        const vectorRepository = this.container.get<VectorRepository>('vectorRepository');
        const embeddingService = this.container.get<EmbeddingService>('embeddingService');
        
        return new VectorDatabaseService(
          vectorRepository,
          embeddingService,
          {
            indexType: 'hnsw',
            dimensions: 1536,
            enableIndexOptimization: true,
            enableSearchOptimization: true,
            enableCaching: true,
            cacheTtlMs: 300000, // 5 minutes
            defaultTopK: 10,
            defaultThreshold: 0.7,
            // Phase 2.1 Project collections (NEW)
            enableProjectCollections: this.config.projectManagement.enabled,
          },
          this.logger
        );
      }, ['vectorRepository', 'embeddingService']);

      // Phase 2.1 Project Management Services (NEW)
      if (this.config.projectManagement.enabled) {
        this.registerProjectManagementServices();
      }

      this.logger.info('ReadyAI Phase 2.1 core services initialized successfully', 'server');

    } catch (error) {
      this.logger.logError(error as Error, 'server', { operation: 'initializeCoreServices' });
      throw new ReadyAIError(
        `Failed to initialize core services: ${error}`,
        'SERVICE_INITIALIZATION_ERROR',
        500
      );
    }
  }

  /**
   * Register Phase 2.1 Project Management Services (NEW)
   * Following Cline's TaskManager and WorkspaceManager patterns
   */
  private registerProjectManagementServices(): void {
    this.logger.info('Registering Phase 2.1 Project Management services...', 'server');

    // Project Validation Service
    this.container.register('projectValidator', () => {
      const configService = this.container.get<ConfigService>('configService');
      return new ProjectValidator(configService, {
        enableStrictValidation: true,
        validateProjectStructure: true,
        validatePhaseRequirements: this.config.projectManagement.enablePhaseProgression,
        maxProjectNameLength: 100,
        allowedProjectTypes: ['web', 'api', 'mobile', 'desktop', 'ml', 'data'],
      }, this.logger);
    }, ['configService']);

    // Project Creation Service
    this.container.register('projectCreationService', () => {
      const projectValidator = this.container.get<ProjectValidator>('projectValidator');
      const databaseService = this.container.get<DatabaseService>('databaseService');
      return new ProjectCreationService(
        projectValidator,
        databaseService,
        {
          enableTemplateSupport: true,
          defaultTemplate: 'basic',
          enableWorkspaceSetup: this.config.projectManagement.enableWorkspaceManagement,
          autoCreateDirectories: true,
          enableGitInitialization: true,
        },
        this.logger
      );
    }, ['projectValidator', 'databaseService']);

    // Project Configuration Service
    this.container.register('projectConfigurationService', () => {
      const configService = this.container.get<ConfigService>('configService');
      return new ProjectConfigurationService(
        configService,
        {
          enableInheritance: true,
          enableOverrides: true,
          validateOnChange: true,
          enableEncryption: false, // Local-only mode
          autoSave: this.config.projectManagement.defaultProjectSettings.enableAutoSave,
          autoSaveInterval: this.config.projectManagement.defaultProjectSettings.autoSaveIntervalMs,
        },
        this.logger
      );
    }, ['configService']);

    // Project State Manager (adapted from Cline's TaskManager)
    this.container.register('projectStateManager', () => {
      const projectStateRepository = this.container.get<ProjectStateRepository>('projectStateRepository');
      return new ProjectStateManager(
        projectStateRepository,
        {
          enableVersioning: this.config.projectManagement.defaultProjectSettings.enableVersioning,
          maxVersionHistory: this.config.projectManagement.defaultProjectSettings.maxVersionHistory,
          enableStateValidation: true,
          enableRollback: true,
          persistenceInterval: 5000, // 5 seconds
          enableCompression: true,
        },
        this.logger
      );
    }, ['projectStateRepository']);

    // Project Workspace Manager (adapted from Cline's WorkspaceManager)
    this.container.register('projectWorkspaceManager', () => {
      const projectStateManager = this.container.get<ProjectStateManager>('projectStateManager');
      return new ProjectWorkspaceManager(
        projectStateManager,
        {
          workspaceRoot: process.env.READYAI_WORKSPACE_ROOT || './projects',
          enableFileWatching: true,
          enableAutoSync: true,
          enableBackup: true,
          backupInterval: 300000, // 5 minutes
          maxWorkspaces: this.config.projectManagement.maxConcurrentProjects,
          enableCleanup: true,
        },
        this.logger
      );
    }, ['projectStateManager']);

    // Project Event Service
    this.container.register('projectEventService', () => {
      return new ProjectEventService({
        enableEventLogging: this.config.projectManagement.enableProjectEvents,
        enableEventMetrics: this.config.projectManagement.enableProjectMetrics,
        enableEventPersistence: true,
        maxEventHistory: 10000,
        enableEventFiltering: true,
        enableRealTimeEvents: true,
      }, this.logger);
    });

    // Project Metadata Service
    this.container.register('projectMetadataService', () => {
      const databaseService = this.container.get<DatabaseService>('databaseService');
      return new ProjectMetadataService(
        databaseService,
        {
          enableIndexing: true,
          enableSearching: true,
          enableTagging: true,
          enableAnalytics: this.config.projectManagement.enableProjectMetrics,
          maxTagsPerProject: 20,
          enableAutoTags: true,
        },
        this.logger
      );
    }, ['databaseService']);

    // Project Settings Service
    this.container.register('projectSettingsService', () => {
      const projectConfigurationService = this.container.get<ProjectConfigurationService>('projectConfigurationService');
      return new ProjectSettingsService(
        projectConfigurationService,
        {
          enableUserPreferences: true,
          enableProjectOverrides: true,
          enableSettingsValidation: true,
          enableSettingsEncryption: false, // Local-only
          autoSaveSettings: true,
          settingsVersion: '2.1.0',
        },
        this.logger
      );
    }, ['projectConfigurationService']);

    // Phase Manager (Phase 2.1 specific)
    this.container.register('phaseManager', () => {
      const projectStateManager = this.container.get<ProjectStateManager>('projectStateManager');
      const projectEventService = this.container.get<ProjectEventService>('projectEventService');
      return new PhaseManager(
        projectStateManager,
        projectEventService,
        {
          enablePhaseValidation: true,
          enablePhaseGates: true,
          enablePhaseRollback: true,
          enablePhaseMetrics: this.config.projectManagement.enableProjectMetrics,
          phaseTimeout: this.config.projectManagement.projectTimeoutMs,
          enableParallelPhases: false, // Sequential for now
        },
        this.logger
      );
    }, ['projectStateManager', 'projectEventService']);

    // Service Coordinator (adapted from Cline's service coordination patterns)
    this.container.register('serviceCoordinator', () => {
      const configService = this.container.get<ConfigService>('configService');
      const databaseService = this.container.get<DatabaseService>('databaseService');
      const vectorDatabaseService = this.container.get<VectorDatabaseService>('vectorDatabaseService');
      const authService = this.container.get<AuthService>('authService');
      const gatewayService = this.container.get<GatewayService>('gatewayService');
      const errorService = this.container.get<ErrorService>('errorService');
      
      return new ServiceCoordinator(
        {
          config: configService,
          database: databaseService,
          vectorDatabase: vectorDatabaseService,
          auth: authService,
          gateway: gatewayService,
          error: errorService,
        },
        {
          enableHealthMonitoring: true,
          enableDependencyTracking: true,
          enableServiceMetrics: this.config.projectManagement.enableProjectMetrics,
          enableCircuitBreaker: true,
          enableRetry: true,
          maxRetryAttempts: 3,
          retryDelayMs: 1000,
        },
        this.logger
      );
    }, ['configService', 'databaseService', 'vectorDatabaseService', 'authService', 'gatewayService', 'errorService']);

    // Project Orchestrator (adapted from Cline's TaskExecutor)
    this.container.register('projectOrchestrator', () => {
      const phaseManager = this.container.get<PhaseManager>('phaseManager');
      const serviceCoordinator = this.container.get<ServiceCoordinator>('serviceCoordinator');
      const projectEventService = this.container.get<ProjectEventService>('projectEventService');
      
      return new ProjectOrchestrator(
        phaseManager,
        serviceCoordinator,
        projectEventService,
        {
          enableOrchestration: this.config.projectManagement.enableOrchestration,
          maxConcurrentOperations: this.config.projectManagement.maxConcurrentProjects,
          operationTimeout: this.config.projectManagement.projectTimeoutMs,
          enableOperationMetrics: this.config.projectManagement.enableProjectMetrics,
          enableOperationEvents: this.config.projectManagement.enableProjectEvents,
          enableRollback: true,
          enableRecovery: true,
        },
        this.logger
      );
    }, ['phaseManager', 'serviceCoordinator', 'projectEventService']);

    // Main Project Service (coordination layer)
    this.container.register('projectService', () => {
      const projectRepository = this.container.get<ProjectRepository>('projectRepository');
      const projectCreationService = this.container.get<ProjectCreationService>('projectCreationService');
      const projectWorkspaceManager = this.container.get<ProjectWorkspaceManager>('projectWorkspaceManager');
      const projectMetadataService = this.container.get<ProjectMetadataService>('projectMetadataService');
      const projectSettingsService = this.container.get<ProjectSettingsService>('projectSettingsService');
      
      return new ProjectService(
        projectRepository,
        projectCreationService,
        projectWorkspaceManager,
        projectMetadataService,
        projectSettingsService,
        {
          enableProjectValidation: true,
          enableProjectMetrics: this.config.projectManagement.enableProjectMetrics,
          enableProjectEvents: this.config.projectManagement.enableProjectEvents,
          maxProjectsPerUser: this.config.projectManagement.maxConcurrentProjects,
          enableProjectSharing: false, // Local-only mode
          enableProjectTemplates: true,
          defaultProjectSettings: this.config.projectManagement.defaultProjectSettings,
        },
        this.logger
      );
    }, ['projectRepository', 'projectCreationService', 'projectWorkspaceManager', 'projectMetadataService', 'projectSettingsService']);

    this.logger.info('Phase 2.1 Project Management services registered successfully', 'server');
  }

  /**
   * Initialize server with comprehensive Phase 2.1 middleware pipeline
   * Following Cline's proven middleware patterns with ReadyAI gateway and project management enhancements
   */
  private initializeServer(): void {
    // Trust proxy if in production (for load balancers)
    if (this.config.security.trustProxy) {
      this.app.set('trust proxy', 1);
    }

    // Security middleware (Helmet) - Enhanced configuration
    if (this.config.security.enableHelmet) {
      this.app.use(helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "ws:", "wss:"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
          },
        },
        crossOriginEmbedderPolicy: false,
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true
        }
      }));
    }

    // CORS middleware with enhanced ReadyAI-specific configuration
    this.app.use(cors({
      origin: this.config.corsOrigin,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Request-ID',
        'X-Correlation-ID',
        'X-Project-ID',
        'X-Session-ID',
        'X-Phase-Type',
        'X-API-Key',
        'X-Gateway-Route',
        'X-Auth-Token',
        'X-Refresh-Token',
        // Phase 2.1 Project Management headers (NEW)
        'X-Project-Name',
        'X-Project-Version',
        'X-Project-Phase',
        'X-Orchestration-ID',
        'X-Workspace-Path',
      ],
      credentials: true,
      maxAge: 86400, // 24 hours
      optionsSuccessStatus: 200,
    }));

    // Compression middleware
    if (this.config.enableCompression) {
      this.app.use(compression({
        level: 6,
        threshold: 1024,
        filter: (req: Request) => {
          if (req.headers['x-no-compression']) return false;
          return compression.filter(req, {} as any);
        },
      }));
    }

    // Body parsing middleware with enhanced limits
    this.app.use(express.json({ 
      limit: this.config.gateway.maxRequestSize,
      type: ['application/json', 'text/plain'],
    }));
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: this.config.gateway.maxRequestSize,
    }));

    // API Gateway middleware integration (Phase 1.3)
    if (this.config.gateway.enabled) {
      this.setupGatewayMiddleware();
    }

    // Enhanced rate limiting middleware with Phase 2.1 project-aware limits
    if (this.config.enableRateLimit) {
      const limiter = rateLimit({
        windowMs: this.config.rateLimit.windowMs,
        max: this.config.rateLimit.maxRequests,
        message: {
          success: false,
          error: {
            message: 'Too many requests, please try again later',
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfter: this.config.rateLimit.windowMs / 1000,
          },
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req: Request) => {
          // Enhanced key generation with user and project context (Phase 2.1)
          const userId = (req as any).user?.id;
          const projectId = (req as any).projectId;
          const ip = req.ip || 'unknown';
          
          if (userId && projectId) {
            return `user:${userId}:project:${projectId}`;
          } else if (userId) {
            return `user:${userId}`;
          } else {
            return `ip:${ip}`;
          }
        },
        handler: (req: Request, res: Response) => {
          this.metrics.errorCount++;
          this.logger.warn('Rate limit exceeded', 'server', {
            ip: req.ip,
            method: req.method,
            path: req.path,
            correlationId: (req as any).correlationId,
            projectId: (req as any).projectId, // Phase 2.1
            userId: (req as any).user?.id,
          });
          
          const error: ApiErrorResponse = createApiError(
            'Too many requests, please try again later',
            'RATE_LIMIT_EXCEEDED',
            429,
            { 
              retryAfter: this.config.rateLimit.windowMs / 1000,
              windowMs: this.config.rateLimit.windowMs,
              maxRequests: this.config.rateLimit.maxRequests,
              projectAware: this.config.projectManagement.enabled, // Phase 2.1
            }
          );
          res.status(429).json(error);
        },
      });
      this.app.use(limiter);
    }

    // Request correlation and logging middleware (Enhanced with Phase 2.1 support)
    this.setupRequestMiddleware();

    // Authentication middleware (Phase 1.3)
    if (this.config.auth.enabled) {
      this.setupAuthenticationMiddleware();
    }

    // Project context middleware (Phase 2.1 - NEW)
    if (this.config.projectManagement.enabled) {
      this.setupProjectContextMiddleware();
    }

    // Initialize core routes
    this.setupCoreRoutes();

    // Error handling middleware (must be last) - Enhanced with Phase 2.1 patterns
    this.setupErrorHandling();

    this.logger.info('ReadyAI server initialized with Phase 2.1 capabilities', 'server', {
      config: {
        port: this.config.port,
        host: this.config.host,
        environment: this.config.environment,
      },
      features: {
        compression: this.config.enableCompression,
        rateLimit: this.config.enableRateLimit,
        security: this.config.security.enableHelmet,
        gateway: this.config.gateway.enabled,
        auth: this.config.auth.enabled,
        projectManagement: this.config.projectManagement.enabled, // Phase 2.1
      },
      services: {
        registeredServices: this.container.getDependencyGraph(),
      },
    });
  }

  /**
   * Setup Project Context Middleware (Phase 2.1 - NEW)
   * Following Cline's task context patterns adapted for project management
   */
  private setupProjectContextMiddleware(): void {
    this.logger.info('Setting up Project Context middleware', 'server');

    // Project context extraction and validation
    this.app.use(async (req: Request, res: Response, next: NextFunction) => {
      try {
        const projectId = req.headers['x-project-id'] as string;
        const projectName = req.headers['x-project-name'] as string;
        const projectPhase = req.headers['x-project-phase'] as PhaseType;
        const orchestrationId = req.headers['x-orchestration-id'] as string;

        // Add project context to request
        (req as any).projectContext = {
          projectId,
          projectName,
          projectPhase,
          orchestrationId,
          startTime: Date.now(),
        };

        // Validate project context for project-aware routes
        if (req.path.startsWith('/api/v1/projects') && projectId) {
          try {
            const project = await this.projectService.getProject(projectId as UUID);
            if (project) {
              (req as any).project = project;
              this.metrics.activeProjects = await this.projectService.getActiveProjectCount();
            } else {
              this.logger.warn('Project not found for request', 'server', {
                projectId,
                path: req.path,
                correlationId: (req as any).correlationId,
              });
            }
          } catch (error) {
            this.logger.warn('Error loading project context', 'server', {
              projectId,
              error: (error as Error).message,
              correlationId: (req as any).correlationId,
            });
          }
        }

        // Update project metrics
        if (projectId) {
          this.metrics.projectOperations++;
        }

        if (orchestrationId) {
          this.metrics.orchestrationRequests++;
        }

        next();
      } catch (error) {
        this.logger.logError(error as Error, 'server', { 
          operation: 'projectContextMiddleware',
          correlationId: (req as any).correlationId,
        });
        next(error);
      }
    });

    // Project-aware logging enhancement
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const originalSend = res.send;
      res.send = function(body: any) {
        const projectContext = (req as any).projectContext;
        if (projectContext && projectContext.projectId) {
          const duration = Date.now() - projectContext.startTime;
          Logger.getInstance().info('Project request completed', 'project', {
            projectId: projectContext.projectId,
            projectName: projectContext.projectName,
            projectPhase: projectContext.projectPhase,
            orchestrationId: projectContext.orchestrationId,
            path: req.path,
            method: req.method,
            duration,
            statusCode: res.statusCode,
            correlationId: (req as any).correlationId,
          });
        }
        return originalSend.call(this, body);
      };
      next();
    });
  }

  /**
   * Setup API Gateway middleware stack (Phase 1.3 with Phase 2.1 enhancements)
   * Adapted from Cline's WebviewProvider middleware patterns
   */
  private setupGatewayMiddleware(): void {
    this.logger.info('Setting up API Gateway middleware stack', 'server');

    // Gateway request preprocessing
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      this.metrics.gatewayRequests++;
      
      // Add gateway context with Phase 2.1 project awareness
      (req as any).gateway = {
        startTime: Date.now(),
        route: req.path,
        method: req.method,
        version: req.headers['api-version'] || 'v1',
        // Phase 2.1 enhancements (NEW)
        projectAware: req.path.startsWith('/api/v1/projects'),
        orchestrationAware: req.path.includes('/orchestration'),
      };

      // Gateway request validation
      if (this.config.gateway.enableValidation) {
        const validationMiddleware = this.container.get<ValidationMiddleware>('validationMiddleware');
        return validationMiddleware.validate(req, res, next);
      }

      next();
    });

    // Gateway request routing with Phase 2.1 project routing
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const requestRouter = this.container.get<RequestRouter>('requestRouter');
      return requestRouter.route(req, res, next);
    });

    // Gateway response post-processing
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const originalSend = res.send;
      res.send = function(body: any) {
        const gateway = (req as any).gateway;
        if (gateway) {
          const duration = Date.now() - gateway.startTime;
          Logger.getInstance().info('Gateway request completed', 'gateway', {
            route: gateway.route,
            method: gateway.method,
            duration,
            statusCode: res.statusCode,
            correlationId: (req as any).correlationId,
            // Phase 2.1 context (NEW)
            projectAware: gateway.projectAware,
            orchestrationAware: gateway.orchestrationAware,
            projectId: (req as any).projectContext?.projectId,
          });
        }
        return originalSend.call(this, body);
      };
      next();
    });
  }

  /**
   * Setup enhanced request correlation and logging middleware
   * Adapted from Cline's request tracking patterns with Phase 2.1 enhancements
   */
  private setupRequestMiddleware(): void {
    // Enhanced request correlation middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const requestId = req.headers['x-request-id'] as string || uuidv4();
      const correlationId = req.headers['x-correlation-id'] as string || uuidv4();
      const projectId = req.headers['x-project-id'] as string;
      const sessionId = req.headers['x-session-id'] as string;
      const phaseType = req.headers['x-phase-type'] as PhaseType;
      // Phase 2.1 headers (NEW)
      const orchestrationId = req.headers['x-orchestration-id'] as string;
      const workspacePath = req.headers['x-workspace-path'] as string;

      // Attach to request for downstream use
      (req as any).correlationId = correlationId;
      (req as any).requestId = requestId;
      (req as any).projectId = projectId;
      (req as any).sessionId = sessionId;
      (req as any).phaseType = phaseType;
      // Phase 2.1 context (NEW)
      (req as any).orchestrationId = orchestrationId;
      (req as any).workspacePath = workspacePath;

      // Set response headers
      res.setHeader('X-Request-ID', requestId);
      res.setHeader('X-Correlation-ID', correlationId);
      res.setHeader('X-Server-Version', '2.1.0'); // Updated for Phase 2.1
      res.setHeader('X-Phase-Support', 'all');
      // Phase 2.1 headers (NEW)
      res.setHeader('X-Project-Management', this.config.projectManagement.enabled ? 'enabled' : 'disabled');
      res.setHeader('X-Orchestration-Support', this.config.projectManagement.enableOrchestration ? 'enabled' : 'disabled');

      // Start correlation context in logger
      this.logger.startCorrelation({
        projectId: projectId as UUID,
        sessionId,
        phaseType,
        // Phase 2.1 context (NEW)
        orchestrationId,
        workspacePath,
      });

      // Update metrics
      this.metrics.requestCount++;
      this.updateMemoryUsage();

      next();
    });

    // Enhanced request logging middleware
    if (this.config.enableRequestLogging) {
      this.app.use((req: Request, res: Response, next: NextFunction) => {
        const startTime = Date.now();
        
        this.logger.debug(`Incoming request: ${req.method} ${req.path}`, 'server', {
          method: req.method,
          path: req.path,
          query: req.query,
          userAgent: req.headers['user-agent'],
          ip: req.ip,
          correlationId: (req as any).correlationId,
          projectId: (req as any).projectId,
          sessionId: (req as any).sessionId,
          phaseType: (req as any).phaseType,
          // Phase 2.1 context (NEW)
          orchestrationId: (req as any).orchestrationId,
          workspacePath: (req as any).workspacePath,
        });

        // Enhanced response completion logging
        const originalSend = res.send;
        res.send = function(body: any) {
          const duration = Date.now() - startTime;
          const logger = Logger.getInstance();
          
          logger.info(`Request completed: ${req.method} ${req.path}`, 'server', {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration,
            correlationId: (req as any).correlationId,
            contentLength: res.get('content-length'),
            gateway: (req as any).gateway,
            user: (req as any).user?.id,
            // Phase 2.1 context (NEW)
            project: (req as any).project?.id,
            projectContext: (req as any).projectContext,
          });

          return originalSend.call(this, body);
        };

        next();
      });
    }
  }

  /**
   * Setup authentication middleware (Phase 1.3)
   * Following Cline's authentication patterns with ReadyAI enhancements
   */
  private setupAuthenticationMiddleware(): void {
    this.logger.info('Setting up authentication middleware', 'server');

    // JWT token extraction and validation
    this.app.use(async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ')
          ? authHeader.substring(7)
          : null;

        if (token) {
          const decoded = jwt.verify(token, this.config.security.jwtSecret) as any;
          const session = await this.authService.validateSession(decoded.sessionId);
          
          if (session && session.isValid) {
            (req as any).user = session.user;
            (req as any).session = session;
            this.metrics.authenticatedSessions++;
          }
        }

        next();
      } catch (error) {
        this.logger.warn('Authentication token validation failed', 'auth', {
          error: (error as Error).message,
          correlationId: (req as any).correlationId,
        });
        this.metrics.failedAuthAttempts++;
        next(); // Continue without authentication
      }
    });

    // Authentication middleware for protected routes
    const authMiddleware = this.container.get<AuthMiddleware>('authMiddleware');
    this.app.use('/api/v1/protected', authMiddleware.requireAuth.bind(authMiddleware));
    
    // Phase 2.1 Project management routes require authentication (NEW)
    if (this.config.projectManagement.enabled) {
      this.app.use('/api/v1/projects', authMiddleware.requireAuth.bind(authMiddleware));
      this.app.use('/api/v1/project-orchestration', authMiddleware.requireAuth.bind(authMiddleware));
    }
  }

  /**
   * Setup enhanced core server routes with Phase 2.1 capabilities
   * Following Cline's core endpoint patterns with gateway integration
   */
  private setupCoreRoutes(): void {
    // Health check endpoint (Enhanced)
    if (this.config.healthCheck.enabled) {
      this.app.get(this.config.healthCheck.endpoint, this.handleHealthCheck.bind(this));
    }

    // Enhanced server info endpoint
    this.app.get('/api/v1/server/info', this.handleServerInfo.bind(this));

    // Enhanced server metrics endpoint
    this.app.get('/api/v1/server/metrics', this.handleServerMetrics.bind(this));

    // Controllers status endpoint
    this.app.get('/api/v1/server/controllers', this.handleControllersStatus.bind(this));

    // Gateway status endpoint (Phase 1.3)
    if (this.config.gateway.enabled) {
      this.app.get('/api/v1/gateway/status', this.handleGatewayStatus.bind(this));
      this.app.get('/api/v1/gateway/routes', this.handleGatewayRoutes.bind(this));
    }

    // Authentication endpoints (Phase 1.3)
    if (this.config.auth.enabled) {
      this.app.get('/api/v1/auth/status', this.handleAuthStatus.bind(this));
    }

    // Phase 2.1 Project Management endpoints (NEW)
    if (this.config.projectManagement.enabled) {
      this.app.get('/api/v1/projects/status', this.handleProjectsStatus.bind(this));
      this.app.get('/api/v1/projects/metrics', this.handleProjectsMetrics.bind(this));
      this.app.get('/api/v1/orchestration/status', this.handleOrchestrationStatus.bind(this));
    }

    // API documentation endpoint (Phase 1.3)
    if (this.config.gateway.enableDocumentation) {
      this.app.get('/api/v1/docs', this.handleApiDocumentation.bind(this));
      this.app.get('/api/v1/docs/openapi.json', this.handleOpenApiSpec.bind(this));
    }

    // Enhanced version endpoint
    this.app.get('/api/v1/version', (req: Request, res: Response) => {
      const response: ApiResponse<any> = createApiResponse({
        service: 'ReadyAI Personal AI Development Orchestrator',
        version: '2.1.0', // Updated for Phase 2.1
        apiVersion: 'v1',
        buildDate: new Date().toISOString(),
        environment: this.config.environment,
        nodeVersion: process.version,
        features: {
          gateway: this.config.gateway.enabled,
          auth: this.config.auth.enabled,
          rateLimiting: this.config.enableRateLimit,
          validation: this.config.gateway.enableValidation,
          documentation: this.config.gateway.enableDocumentation,
          // Phase 2.1 features (NEW)
          projectManagement: this.config.projectManagement.enabled,
          orchestration: this.config.projectManagement.enableOrchestration,
          workspaceManagement: this.config.projectManagement.enableWorkspaceManagement,
          phaseProgression: this.config.projectManagement.enablePhaseProgression,
        },
      });
      res.json(response);
    });

    // Enhanced root endpoint
    this.app.get('/', (req: Request, res: Response) => {
      const response: ApiResponse<any> = createApiResponse({
        message: 'ReadyAI API Server',
        status: 'running',
        version: '2.1.0', // Updated for Phase 2.1
        phase: 'Phase 2.1 - Project Management Module',
        documentation: '/api/v1/docs',
        endpoints: {
          health: this.config.healthCheck.endpoint,
          info: '/api/v1/server/info',
          metrics: '/api/v1/server/metrics',
          controllers: '/api/v1/server/controllers',
          gateway: '/api/v1/gateway/status',
          auth: '/api/v1/auth/status',
          docs: '/api/v1/docs',
          // Phase 2.1 endpoints (NEW)
          projects: '/api/v1/projects',
          projectStatus: '/api/v1/projects/status',
          orchestration: '/api/v1/project-orchestration',
          orchestrationStatus: '/api/v1/orchestration/status',
        },
      });
      res.json(response);
    });
  }

  /**
   * Setup comprehensive Phase 2.1 error handling middleware
   * Adapted from Cline's error handling patterns with ReadyAI enhancements
   */
  private setupErrorHandling(): void {
    // 404 handler for undefined routes (Enhanced)
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const error: ApiErrorResponse = createApiError(
        `Route not found: ${req.method} ${req.path}`,
        'ROUTE_NOT_FOUND',
        404,
        {
          method: req.method,
          path: req.path,
          availableRoutes: this.getRegisteredRoutes(),
          suggestions: this.getSimilarRoutes(req.path),
          // Phase 2.1 context (NEW)
          projectManagementEnabled: this.config.projectManagement.enabled,
          projectContext: (req as any).projectContext,
        }
      );

      this.logger.warn(`Route not found: ${req.method} ${req.path}`, 'server', {
        method: req.method,
        path: req.path,
        correlationId: (req as any).correlationId,
        userAgent: req.headers['user-agent'],
        // Phase 2.1 context (NEW)
        projectId: (req as any).projectId,
        orchestrationId: (req as any).orchestrationId,
      });

      res.status(404).json(error);
    });

    // Enhanced global error handler with Phase 2.1 error service integration
    this.app.use((error: any, req: Request, res: Response, next: NextFunction) => {
      this.metrics.errorCount++;
      
      // Phase 2.1 project error tracking (NEW)
      if ((req as any).projectId) {
        this.metrics.projectErrors++;
      }
      
      const correlationId = (req as any).correlationId || 'unknown';
      
      // Use error service for classification and recovery
      const classifiedError = this.errorService.classifyError(error);
      const recoveryStrategy = this.errorService.getRecoveryStrategy(classifiedError);

      this.logger.logError(error, 'server', {
        method: req.method,
        path: req.path,
        correlationId,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        user: (req as any).user?.id,
        classification: classifiedError,
        recoveryStrategy,
        // Phase 2.1 context (NEW)
        project: (req as any).project?.id,
        projectContext: (req as any).projectContext,
        orchestrationId: (req as any).orchestrationId,
      });

      // Handle ReadyAI errors
      if (error instanceof ReadyAIError) {
        return res.status(error.statusCode || 500).json(error.toApiErrorResponse());
      }

      // Handle authentication errors
      if (error.name === 'UnauthorizedError' || error.name === 'JsonWebTokenError') {
        const apiError: ApiErrorResponse = createApiError(
          'Authentication failed',
          'AUTHENTICATION_ERROR',
          401,
          { 
            type: error.name,
            suggestion: 'Please provide a valid authentication token',
          }
        );
        return res.status(401).json(apiError);
      }

      // Handle validation errors
      if (error.name === 'ValidationError') {
        const apiError: ApiErrorResponse = createApiError(
          error.message,
          'VALIDATION_ERROR',
          400,
          { 
            field: error.field, 
            value: error.value,
            constraints: error.constraints,
          }
        );
        return res.status(400).json(apiError);
      }

      // Handle timeout errors
      if (error.code === 'TIMEOUT' || error.message.includes('timeout')) {
        const apiError: ApiErrorResponse = createApiError(
          'Request timeout',
          'REQUEST_TIMEOUT',
          408,
          { 
            timeout: this.config.requestTimeout,
            suggestion: 'Try breaking the request into smaller parts',
          }
        );
        return res.status(408).json(apiError);
      }

      // Handle gateway errors
      if (error.code === 'GATEWAY_ERROR') {
        const apiError: ApiErrorResponse = createApiError(
          'Gateway processing error',
          'GATEWAY_ERROR',
          502,
          { 
            gatewayId: (req as any).gateway?.id,
            route: (req as any).gateway?.route,
          }
        );
        return res.status(502).json(apiError);
      }

      // Phase 2.1 Project management errors (NEW)
      if (error.code === 'PROJECT_ERROR') {
        const apiError: ApiErrorResponse = createApiError(
          error.message || 'Project management error',
          'PROJECT_ERROR',
          422,
          {
            projectId: (req as any).projectId,
            orchestrationId: (req as any).orchestrationId,
            phase: (req as any).projectContext?.projectPhase,
          }
        );
        return res.status(422).json(apiError);
      }

      if (error.code === 'ORCHESTRATION_ERROR') {
        const apiError: ApiErrorResponse = createApiError(
          error.message || 'Orchestration processing error',
          'ORCHESTRATION_ERROR',
          503,
          {
            orchestrationId: (req as any).orchestrationId,
            projectId: (req as any).projectId,
            operation: error.operation,
          }
        );
        return res.status(503).json(apiError);
      }

      // Default error response with enhanced information
      const isDevelopment = this.config.environment === 'development';
      const apiError: ApiErrorResponse = createApiError(
        isDevelopment ? error.message : 'Internal server error',
        'INTERNAL_ERROR',
        500,
        isDevelopment ? { 
          stack: error.stack,
          classification: classifiedError,
          recoveryStrategy,
        } : {
          correlationId,
        }
      );

      res.status(500).json(apiError);
    });
  }

  /**
   * Initialize and register all ReadyAI controllers with Phase 2.1 enhancements
   * Following Cline's service initialization patterns with proper dependency injection
   */
  private async initializeControllers(): Promise<void> {
    try {
      this.logger.info('Starting ReadyAI Phase 2.1 module registration...', 'server');

      // Register controllers with enhanced metadata
      const controllers = [
        {
          name: 'config',
          path: '/api/v1/config',
          factory: () => this.container.get<ConfigService>('configService'),
          controllerFactory: (service: any) => new ConfigController(service),
          requiresAuth: false,
          projectAware: false,
        },
        {
          name: 'database',
          path: '/api/v1/database',
          factory: () => ({
            database: this.container.get<DatabaseService>('databaseService'),
            migration: this.container.get<MigrationService>('migrationService'),
          }),
          controllerFactory: (services: any) => new DatabaseController(services.database, services.migration),
          requiresAuth: true,
          projectAware: false,
        },
        {
          name: 'vector',
          path: '/api/v1/vector',
          factory: () => this.container.get<VectorDatabaseService>('vectorDatabaseService'),
          controllerFactory: (service: any) => new VectorDatabaseController(service),
          requiresAuth: true,
          projectAware: true, // Phase 2.1: Vector operations can be project-scoped
        },
        {
          name: 'error',
          path: '/api/v1/errors',
          factory: () => this.container.get<ErrorService>('errorService'),
          controllerFactory: (service: any) => new ErrorController(service),
          requiresAuth: false,
          projectAware: false,
        },
        {
          name: 'auth',
          path: '/api/v1/auth',
          factory: () => this.container.get<AuthService>('authService'),
          controllerFactory: (service: any) => new AuthController(service),
          requiresAuth: false,
          projectAware: false,
        },
        {
          name: 'gateway',
          path: '/api/v1/gateway',
          factory: () => this.container.get<GatewayService>('gatewayService'),
          controllerFactory: (service: any) => new GatewayController(service),
          requiresAuth: true,
          projectAware: false,
        },
        // Phase 2.1 Project Management Controllers (NEW)
        ...(this.config.projectManagement.enabled ? [
          {
            name: 'projects',
            path: '/api/v1/projects',
            factory: () => this.container.get<ProjectService>('projectService'),
            controllerFactory: (service: any) => new ProjectController(service),
            requiresAuth: true,
            projectAware: true,
            phaseRequirements: ['phase-2-1'] as PhaseType[],
          },
          {
            name: 'project-orchestration',
            path: '/api/v1/project-orchestration',
            factory: () => ({
              orchestrator: this.container.get<ProjectOrchestrator>('projectOrchestrator'),
              phaseManager: this.container.get<PhaseManager>('phaseManager'),
            }),
            controllerFactory: (services: any) => new ProjectOrchestrationController(
              services.orchestrator,
              services.phaseManager
            ),
            requiresAuth: true,
            projectAware: true,
            phaseRequirements: ['phase-2-1'] as PhaseType[],
            dependsOn: ['projects'],
          },
          {
            name: 'project-settings',
            path: '/api/v1/project-settings',
            factory: () => this.container.get<ProjectSettingsService>('projectSettingsService'),
            controllerFactory: (service: any) => new ProjectSettingsController(service),
            requiresAuth: true,
            projectAware: true,
            phaseRequirements: ['phase-2-1'] as PhaseType[],
            dependsOn: ['projects'],
          },
        ] : []),
      ];

      // Register each controller with enhanced configuration
      for (const controllerConfig of controllers) {
        try {
          const service = controllerConfig.factory();
          const controller = controllerConfig.controllerFactory(service);
          
          // Setup middleware for this controller
          const middleware: express.RequestHandler[] = [];
          
          // Add authentication middleware if required
          if (controllerConfig.requiresAuth && this.config.auth.enabled) {
            const authMiddleware = this.container.get<AuthMiddleware>('authMiddleware');
            middleware.push(authMiddleware.requireAuth.bind(authMiddleware));
          }

          // Add rate limiting middleware if needed
          const rateLimitingMiddleware = this.container.get<RateLimitingMiddleware>('rateLimitingMiddleware');
          middleware.push(rateLimitingMiddleware.createLimiter({
            windowMs: 15 * 60 * 1000, // 15 minutes
            maxRequests: controllerConfig.projectAware ? 200 : 100, // Higher limits for project operations
          }));

          await this.registerController(
            controllerConfig.name,
            controllerConfig.path,
            controller.getRouter(),
            controller,
            '2.1.0', // Phase 2.1 version
            async () => {
              try {
                return await service.getHealthStatus?.() ?? true;
              } catch {
                return false;
              }
            },
            controllerConfig.requiresAuth,
            undefined,
            middleware
          );
        } catch (error) {
          this.logger.error(`Failed to register controller: ${controllerConfig.name}`, 'server', {
            name: controllerConfig.name,
            error: (error as Error).message,
          });
        }
      }

      this.logger.info('ReadyAI Phase 2.1 module registration completed', 'server', {
        registeredControllers: this.controllers.size,
        controllers: Array.from(this.controllers.keys()),
        features: {
          authentication: this.config.auth.enabled,
          gateway: this.config.gateway.enabled,
          errorHandling: true,
          // Phase 2.1 features (NEW)
          projectManagement: this.config.projectManagement.enabled,
          orchestration: this.config.projectManagement.enableOrchestration,
          workspaceManagement: this.config.projectManagement.enableWorkspaceManagement,
        },
      });
    } catch (error) {
      this.logger.logError(error as Error, 'server', { operation: 'initializeControllers' });
      throw new ReadyAIError(
        `Failed to initialize controllers: ${error}`,
        'CONTROLLER_INITIALIZATION_ERROR',
        500
      );
    }
  }

  /**
   * Enhanced controller registration with Phase 2.1 capabilities
   * Following Cline's modular provider registration patterns
   */
  public async registerController(
    name: string,
    path: string,
    router: express.Router,
    controller?: any,
    version = '2.1.0', // Updated default version
    healthCheck?: () => Promise<boolean>,
    requiresAuth = false,
    rateLimits?: { windowMs: number; maxRequests: number },
    middleware: express.RequestHandler[] = []
  ): Promise<void> {
    try {
      // Validate controller registration
      if (this.controllers.has(name)) {
        this.logger.warn(`Controller '${name}' is already registered, replacing...`, 'server');
      }

      // Register controller with enhanced configuration
      const registration: ControllerRegistration = {
        name,
        path,
        router,
        controller,
        version,
        status: 'active',
        registeredAt: new Date().toISOString(),
        healthCheck,
        requiresAuth,
        rateLimits,
        middleware,
        // Phase 2.1 enhancements (NEW)
        projectAware: path.includes('/projects'),
        phaseRequirements: path.includes('/projects') ? ['phase-2-1'] as PhaseType[] : undefined,
        dependsOn: this.getControllerDependencies(name),
      };

      this.controllers.set(name, registration);
      
      // Apply middleware if provided
      if (middleware.length > 0) {
        this.app.use(path, ...middleware, router);
      } else {
        this.app.use(path, router);
      }
      
      this.metrics.registeredControllers = this.controllers.size;

      this.logger.info(`Controller registered successfully: ${name}`, 'server', {
        name,
        path,
        version,
        hasController: !!controller,
        hasHealthCheck: !!healthCheck,
        requiresAuth,
        middlewareCount: middleware.length,
        rateLimits,
        // Phase 2.1 metadata (NEW)
        projectAware: registration.projectAware,
        phaseRequirements: registration.phaseRequirements,
        dependsOn: registration.dependsOn,
      });

      // Test controller health if health check is provided
      if (healthCheck) {
        try {
          const isHealthy = await healthCheck();
          if (!isHealthy) {
            registration.status = 'error';
            this.logger.warn(`Controller '${name}' failed health check`, 'server');
          }
        } catch (error) {
          registration.status = 'error';
          this.logger.error(`Controller '${name}' health check threw error: ${error}`, 'server');
        }
      }
    } catch (error) {
      this.logger.logError(error as Error, 'server', { name, path, version });
      throw new ReadyAIError(
        `Failed to register controller '${name}': ${error}`,
        'CONTROLLER_REGISTRATION_ERROR',
        500,
        { name, path }
      );
    }
  }

  /**
   * Get controller dependencies for Phase 2.1 (NEW)
   */
  private getControllerDependencies(controllerName: string): string[] {
    const dependencies: Record<string, string[]> = {
      'project-orchestration': ['projects'],
      'project-settings': ['projects'],
      'vector': this.config.projectManagement.enabled ? ['projects'] : [],
    };

    return dependencies[controllerName] || [];
  }

  // Phase 2.1 Enhanced Health and Monitoring Endpoints (NEW)

  /**
   * Projects status endpoint handler (Phase 2.1 - NEW)
   */
  private async handleProjectsStatus(req: Request, res: Response): Promise<void> {
    if (!this.config.projectManagement.enabled) {
      const error: ApiErrorResponse = createApiError(
        'Project Management is not enabled',
        'PROJECT_MANAGEMENT_DISABLED',
        503
      );
      return res.status(503).json(error);
    }

    try {
      const projectsStatus = {
        enabled: this.config.projectManagement.enabled,
        orchestration: this.config.projectManagement.enableOrchestration,
        workspaceManagement: this.config.projectManagement.enableWorkspaceManagement,
        phaseProgression: this.config.projectManagement.enablePhaseProgression,
        activeProjects: this.metrics.activeProjects,
        totalProjectsCreated: this.metrics.totalProjectsCreated,
        maxConcurrentProjects: this.config.projectManagement.maxConcurrentProjects,
        projectOperations: this.metrics.projectOperations,
        projectErrors: this.metrics.projectErrors,
        health: await this.projectService.getHealthStatus?.(),
      };

      const response: ApiResponse<any> = createApiResponse(projectsStatus);
      res.json(response);
    } catch (error) {
      this.logger.logError(error as Error, 'server', { operation: 'handleProjectsStatus' });
      const apiError: ApiErrorResponse = createApiError(
        'Failed to get projects status',
        'PROJECTS_STATUS_ERROR',
        500
      );
      res.status(500).json(apiError);
    }
  }

  /**
   * Projects metrics endpoint handler (Phase 2.1 - NEW)
   */
  private async handleProjectsMetrics(req: Request, res: Response): Promise<void> {
    if (!this.config.projectManagement.enabled) {
      const error: ApiErrorResponse = createApiError(
        'Project Management is not enabled',
        'PROJECT_MANAGEMENT_DISABLED',
        503
      );
      return res.status(503).json(error);
    }

    try {
      const projectsMetrics = {
        activeProjects: this.metrics.activeProjects,
        totalProjectsCreated: this.metrics.totalProjectsCreated,
        projectOperations: this.metrics.projectOperations,
        orchestrationRequests: this.metrics.orchestrationRequests,
        phaseTransitions: this.metrics.phaseTransitions,
        projectErrors: this.metrics.projectErrors,
        averageProjectLifetime: await this.projectService.getAverageProjectLifetime?.(),
        mostActiveProjects: await this.projectService.getMostActiveProjects?.(5),
        projectsByPhase: await this.projectService.getProjectsByPhase?.(),
        recentProjectActivity: await this.projectService.getRecentActivity?.(10),
      };

      const response: ApiResponse<any> = createApiResponse(projectsMetrics);
      res.json(response);
    } catch (error) {
      this.logger.logError(error as Error, 'server', { operation: 'handleProjectsMetrics' });
      const apiError: ApiErrorResponse = createApiError(
        'Failed to get projects metrics',
        'PROJECTS_METRICS_ERROR',
        500
      );
      res.status(500).json(apiError);
    }
  }

  /**
   * Orchestration status endpoint handler (Phase 2.1 - NEW)
   */
  private async handleOrchestrationStatus(req: Request, res: Response): Promise<void> {
    if (!this.config.projectManagement.enableOrchestration) {
      const error: ApiErrorResponse = createApiError(
        'Project Orchestration is not enabled',
        'ORCHESTRATION_DISABLED',
        503
      );
      return res.status(503).json(error);
    }

    try {
      const orchestrationStatus = {
        enabled: this.config.projectManagement.enableOrchestration,
        maxConcurrentOperations: this.config.projectManagement.maxConcurrentProjects,
        operationTimeout: this.config.projectManagement.projectTimeoutMs,
        orchestrationRequests: this.metrics.orchestrationRequests,
        phaseTransitions: this.metrics.phaseTransitions,
        activeOperations: await this.projectOrchestrator.getActiveOperationCount?.(),
        queuedOperations: await this.projectOrchestrator.getQueuedOperationCount?.(),
        health: await this.projectOrchestrator.getHealthStatus?.(),
      };

      const response: ApiResponse<any> = createApiResponse(orchestrationStatus);
      res.json(response);
    } catch (error) {
      this.logger.logError(error as Error, 'server', { operation: 'handleOrchestrationStatus' });
      const apiError: ApiErrorResponse = createApiError(
        'Failed to get orchestration status',
        'ORCHESTRATION_STATUS_ERROR',
        500
      );
      res.status(500).json(apiError);
    }
  }

  /**
   * Enhanced health check endpoint handler with Phase 2.1 capabilities
   */
  private async handleHealthCheck(req: Request, res: Response): Promise<void> {
    const healthData = {
      status: this.metrics.healthStatus,
      timestamp: new Date().toISOString(),
      uptime: this.metrics.uptime(),
      version: '2.1.0', // Updated version
      phase: 'Phase 2.1',
      environment: this.config.environment,
      metrics: {
        requests: this.metrics.requestCount,
        errors: this.metrics.errorCount,
        connections: this.metrics.activeConnections,
        controllers: this.metrics.registeredControllers,
        gatewayRequests: this.metrics.gatewayRequests,
        authenticatedSessions: this.metrics.authenticatedSessions,
        failedAuthAttempts: this.metrics.failedAuthAttempts,
        // Phase 2.1 metrics (NEW)
        activeProjects: this.metrics.activeProjects,
        totalProjectsCreated: this.metrics.totalProjectsCreated,
        projectOperations: this.metrics.projectOperations,
        orchestrationRequests: this.metrics.orchestrationRequests,
        phaseTransitions: this.metrics.phaseTransitions,
        projectErrors: this.metrics.projectErrors,
      },
      controllers: await this.getControllersHealth(),
      services: {
        gateway: this.config.gateway.enabled ? 'enabled' : 'disabled',
        auth: this.config.auth.enabled ? 'enabled' : 'disabled',
        errorHandling: 'enabled',
        validation: this.config.gateway.enableValidation ? 'enabled' : 'disabled',
        // Phase 2.1 services (NEW)
        projectManagement: this.config.projectManagement.enabled ? 'enabled' : 'disabled',
        orchestration: this.config.projectManagement.enableOrchestration ? 'enabled' : 'disabled',
        workspaceManagement: this.config.projectManagement.enableWorkspaceManagement ? 'enabled' : 'disabled',
        phaseProgression: this.config.projectManagement.enablePhaseProgression ? 'enabled' : 'disabled',
      },
    };

    const statusCode = this.metrics.healthStatus === 'healthy' ? 200 : 503;
    const response: ApiResponse<any> = createApiResponse(healthData);
    res.status(statusCode).json(response);
  }

  /**
   * Enhanced server info endpoint handler
   */
  private handleServerInfo(req: Request, res: Response): void {
    const serverInfo = {
      service: 'ReadyAI Personal AI Development Orchestrator API',
      version: '2.1.0', // Updated version
      apiVersion: 'v1',
      phase: 'Phase 2.1 - Project Management Module',
      environment: this.config.environment,
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      startTime: this.metrics.startTime.toISOString(),
      uptime: this.metrics.uptime(),
      pid: process.pid,
      configuration: {
        port: this.config.port,
        host: this.config.host,
        requestTimeout: this.config.requestTimeout,
        features: {
          compression: this.config.enableCompression,
          rateLimit: this.config.enableRateLimit,
          requestLogging: this.config.enableRequestLogging,
          gateway: this.config.gateway.enabled,
          auth: this.config.auth.enabled,
          validation: this.config.gateway.enableValidation,
          documentation: this.config.gateway.enableDocumentation,
          // Phase 2.1 features (NEW)
          projectManagement: this.config.projectManagement.enabled,
          orchestration: this.config.projectManagement.enableOrchestration,
          workspaceManagement: this.config.projectManagement.enableWorkspaceManagement,
          phaseProgression: this.config.projectManagement.enablePhaseProgression,
          projectMetrics: this.config.projectManagement.enableProjectMetrics,
          projectEvents: this.config.projectManagement.enableProjectEvents,
        },
        // Phase 2.1 configuration (NEW)
        projectManagement: this.config.projectManagement.enabled ? {
          maxConcurrentProjects: this.config.projectManagement.maxConcurrentProjects,
          projectTimeoutMs: this.config.projectManagement.projectTimeoutMs,
          defaultProjectSettings: this.config.projectManagement.defaultProjectSettings,
        } : undefined,
      },
    };

    const response: ApiResponse<any> = createApiResponse(serverInfo);
    res.json(response);
  }

  /**
   * Enhanced server metrics endpoint handler
   */
  private handleServerMetrics(req: Request, res: Response): void {
    this.updateMemoryUsage();
    
    const metrics = {
      ...this.metrics,
      uptime: this.metrics.uptime(),
      timestamp: new Date().toISOString(),
      process: {
        pid: process.pid,
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
      },
      services: {
        dependencyGraph: this.container.getDependencyGraph(),
      },
    };

    const response: ApiResponse<any> = createApiResponse(metrics);
    res.json(response);
  }

  /**
   * Enhanced controllers status endpoint handler
   */
  private async handleControllersStatus(req: Request, res: Response): Promise<void> {
    const controllersStatus = await Promise.all(
      Array.from(this.controllers.entries()).map(async ([name, registration]) => {
        let healthStatus = 'unknown';
        if (registration.healthCheck) {
          try {
            healthStatus = await registration.healthCheck() ? 'healthy' : 'unhealthy';
          } catch (error) {
            healthStatus = 'error';
          }
        }

        return {
          name: registration.name,
          path: registration.path,
          version: registration.version,
          status: registration.status,
          healthStatus,
          registeredAt: registration.registeredAt,
          hasController: !!registration.controller,
          hasHealthCheck: !!registration.healthCheck,
          requiresAuth: registration.requiresAuth,
          rateLimits: registration.rateLimits,
          middlewareCount: registration.middleware?.length || 0,
          // Phase 2.1 metadata (NEW)
          projectAware: registration.projectAware,
          phaseRequirements: registration.phaseRequirements,
          dependsOn: registration.dependsOn,
        };
      })
    );

    const response: ApiResponse<any> = createApiResponse({
      total: controllersStatus.length,
      controllers: controllersStatus,
    });
    res.json(response);
  }

  /**
   * Gateway status endpoint handler (Phase 1.3)
   */
  private async handleGatewayStatus(req: Request, res: Response): Promise<void> {
    if (!this.config.gateway.enabled) {
      const error: ApiErrorResponse = createApiError(
        'API Gateway is not enabled',
        'GATEWAY_DISABLED',
        503
      );
      return res.status(503).json(error);
    }

    const gatewayStatus = {
      enabled: this.config.gateway.enabled,
      validation: this.config.gateway.enableValidation,
      documentation: this.config.gateway.enableDocumentation,
      metrics: this.config.gateway.enableMetrics,
      requests: this.metrics.gatewayRequests,
      health: await this.gatewayService.getHealthStatus?.(),
      // Phase 2.1 enhancements (NEW)
      projectIntegration: this.config.projectManagement.enabled,
    };

    const response: ApiResponse<any> = createApiResponse(gatewayStatus);
    res.json(response);
  }

  /**
   * Gateway routes endpoint handler (Phase 1.3)
   */
  private handleGatewayRoutes(req: Request, res: Response): void {
    const routes = this.getRegisteredRoutes().map(route => ({
      route,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      controller: this.getControllerForRoute(route),
      // Phase 2.1 metadata (NEW)
      projectAware: route.includes('/projects'),
      requiresAuth: this.isRouteProtected(route),
    }));

    const response: ApiResponse<any> = createApiResponse({
      total: routes.length,
      routes,
    });
    res.json(response);
  }

  /**
   * Authentication status endpoint handler (Phase 1.3)
   */
  private handleAuthStatus(req: Request, res: Response): void {
    const authStatus = {
      enabled: this.config.auth.enabled,
      sessions: this.config.auth.enableSessions,
      refreshTokens: this.config.auth.enableRefreshTokens,
      activeSessions: this.metrics.authenticatedSessions,
      failedAttempts: this.metrics.failedAuthAttempts,
      user: (req as any).user ? {
        id: (req as any).user.id,
        authenticated: true,
        // Phase 2.1 context (NEW)
        projects: (req as any).user.projects?.length || 0,
      } : {
        authenticated: false,
      },
    };

    const response: ApiResponse<any> = createApiResponse(authStatus);
    res.json(response);
  }

  /**
   * API documentation endpoint handler (Phase 1.3)
   */
  private handleApiDocumentation(req: Request, res: Response): void {
    if (!this.config.gateway.enableDocumentation) {
      const error: ApiErrorResponse = createApiError(
        'API documentation is not enabled',
        'DOCUMENTATION_DISABLED',
        503
      );
      return res.status(503).json(error);
    }

    const documentation = {
      title: 'ReadyAI API Documentation',
      version: '2.1.0', // Updated version
      description: 'ReadyAI Personal AI Development Orchestrator API with Project Management',
      phase: 'Phase 2.1',
      endpoints: this.getRegisteredRoutes(),
      openapi: '/api/v1/docs/openapi.json',
      // Phase 2.1 sections (NEW)
      sections: {
        core: 'Core API endpoints',
        auth: 'Authentication and authorization',
        projects: 'Project management operations',
        orchestration: 'Project orchestration and workflow',
        gateway: 'API Gateway management',
      },
    };

    const response: ApiResponse<any> = createApiResponse(documentation);
    res.json(response);
  }

  /**
   * OpenAPI specification endpoint handler (Phase 1.3)
   */
  private async handleOpenApiSpec(req: Request, res: Response): Promise<void> {
    if (!this.config.gateway.enableDocumentation) {
      const error: ApiErrorResponse = createApiError(
        'API documentation is not enabled',
        'DOCUMENTATION_DISABLED',
        503
      );
      return res.status(503).json(error);
    }

    const apiDocService = this.container.get<ApiDocumentationService>('apiDocumentationService');
    const openApiSpec = await apiDocService.generateOpenApiSpec();
    
    res.json(openApiSpec);
  }

  /**
   * Start the server with comprehensive Phase 2.1 initialization
   * Following Cline's proven startup patterns with enhanced error handling
   */
  public async start(): Promise<void> {
    try {
      if (this.server) {
        throw new ReadyAIError('Server is already running', 'SERVER_ALREADY_RUNNING', 400);
      }

      this.logger.info('Starting ReadyAI Phase 2.1 server...', 'server');

      // Initialize controllers with enhanced dependency injection
      await this.initializeControllers();

      // Create HTTP server
      this.server = createServer(this.app);

      // Configure server timeouts
      this.server.timeout = this.config.requestTimeout;
      this.server.keepAliveTimeout = 65000; // Slightly higher than load balancer timeout
      this.server.headersTimeout = 66000; // Slightly higher than keepAliveTimeout

      // Setup connection tracking
      this.setupConnectionTracking();

      // Setup graceful shutdown handlers
      this.setupGracefulShutdown();

      // Start listening
      await new Promise<void>((resolve, reject) => {
        this.server!.listen(this.config.port, this.config.host, () => {
          resolve();
        });

        this.server!.on('error', (error: any) => {
          if (error.code === 'EADDRINUSE') {
            const errorMsg = `Port ${this.config.port} is already in use`;
            this.logger.error(errorMsg, 'server', { port: this.config.port, host: this.config.host });
            reject(new ReadyAIError(errorMsg, 'PORT_IN_USE', 500));
          } else {
            this.logger.logError(error, 'server', { operation: 'serverStart' });
            reject(error);
          }
        });
      });

      // Update health status
      this.metrics.healthStatus = 'healthy';

      this.logger.info('ReadyAI Phase 2.1 server started successfully', 'server', {
        port: this.config.port,
        host: this.config.host,
        environment: this.config.environment,
        processId: process.pid,
        startTime: this.metrics.startTime.toISOString(),
        controllersRegistered: this.controllers.size,
        features: {
          gateway: this.config.gateway.enabled,
          auth: this.config.auth.enabled,
          errorHandling: true,
          validation: this.config.gateway.enableValidation,
          documentation: this.config.gateway.enableDocumentation,
          // Phase 2.1 features (NEW)
          projectManagement: this.config.projectManagement.enabled,
          orchestration: this.config.projectManagement.enableOrchestration,
          workspaceManagement: this.config.projectManagement.enableWorkspaceManagement,
          phaseProgression: this.config.projectManagement.enablePhaseProgression,
        },
      });
    } catch (error) {
      this.metrics.healthStatus = 'unhealthy';
      this.logger.logError(error as Error, 'server', { operation: 'start' });
      throw error;
    }
  }

  /**
   * Setup connection tracking for enhanced monitoring
   * Following Cline's resource management patterns
   */
  private setupConnectionTracking(): void {
    if (!this.server) return;

    this.server.on('connection', (socket) => {
      this.metrics.activeConnections++;
      socket.on('close', () => {
        this.metrics.activeConnections--;
      });
    });
  }

  /**
   * Setup graceful shutdown handlers with Phase 2.1 enhancements
   * Following Cline's proven shutdown patterns
   */
  private setupGracefulShutdown(): void {
    const gracefulShutdown = (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      this.logger.info(`Received ${signal}, starting graceful shutdown...`, 'server');

      // Set shutdown timeout
      this.shutdownTimeout = setTimeout(() => {
        this.logger.warn('Graceful shutdown timeout, forcing exit', 'server');
        process.exit(1);
      }, 30000); // 30 seconds timeout

      this.stop().then(() => {
        this.logger.info('Graceful shutdown completed', 'server');
        process.exit(0);
      }).catch((error) => {
        this.logger.logError(error, 'server', { operation: 'gracefulShutdown' });
        process.exit(1);
      });
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    // Handle uncaught exceptions and unhandled rejections
    process.on('uncaughtException', (error) => {
      this.logger.logError(error, 'server', { type: 'uncaughtException' }, 'unknown', 'critical');
      gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled Promise Rejection', 'server', {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
        promise: promise.toString(),
      });
      gracefulShutdown('unhandledRejection');
    });
  }

  /**
   * Stop the server gracefully with Phase 2.1 cleanup
   * Following Cline's resource cleanup patterns
   */
  public async stop(): Promise<void> {
    try {
      if (!this.server) {
        this.logger.warn('Server is not running', 'server');
        return;
      }

      this.logger.info('Stopping ReadyAI Phase 2.1 server...', 'server');

      // Clear shutdown timeout
      if (this.shutdownTimeout) {
        clearTimeout(this.shutdownTimeout);
      }

      // Close server
      await new Promise<void>((resolve, reject) => {
        this.server!.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      // Cleanup resources
      await this.cleanup();

      this.server = null;
      this.metrics.healthStatus = 'unhealthy';

      this.logger.info('ReadyAI Phase 2.1 server stopped successfully', 'server', {
        uptime: this.metrics.uptime(),
        totalRequests: this.metrics.requestCount,
        totalErrors: this.metrics.errorCount,
        gatewayRequests: this.metrics.gatewayRequests,
        authenticatedSessions: this.metrics.authenticatedSessions,
        // Phase 2.1 metrics (NEW)
        totalProjectsCreated: this.metrics.totalProjectsCreated,
        projectOperations: this.metrics.projectOperations,
        orchestrationRequests: this.metrics.orchestrationRequests,
        phaseTransitions: this.metrics.phaseTransitions,
        projectErrors: this.metrics.projectErrors,
      });
    } catch (error) {
      this.logger.logError(error as Error, 'server', { operation: 'stop' });
      throw error;
    }
  }

  /**
   * Enhanced cleanup for Phase 2.1 resources
   * Following Cline's resource management patterns
   */
  private async cleanup(): Promise<void> {
    try {
      // End logger correlation
      this.logger.endCorrelation();

      // Cleanup Phase 1.3 services
      if (this.authService) {
        await this.authService.cleanup?.();
      }

      if (this.gatewayService) {
        await this.gatewayService.cleanup?.();
      }

      if (this.errorService) {
        await this.errorService.cleanup?.();
      }

      // Cleanup Phase 2.1 Project Management services (NEW)
      if (this.config.projectManagement.enabled) {
        if (this.projectOrchestrator) {
          await this.projectOrchestrator.cleanup?.();
        }

        if (this.serviceCoordinator) {
          await this.serviceCoordinator.cleanup?.();
        }

        if (this.projectService) {
          await this.projectService.cleanup?.();
        }
      }

      // Clear controller registrations
      this.controllers.clear();
      this.metrics.registeredControllers = 0;

      // Clear dependency injection container
      this.container.clear();

      this.logger.debug('Phase 2.1 server cleanup completed', 'server');
    } catch (error) {
      this.logger.logError(error as Error, 'server', { operation: 'cleanup' });
    }
  }

  // Enhanced utility methods for Phase 2.1

  /**
   * Get registered routes for documentation with enhanced metadata
   */
  private getRegisteredRoutes(): string[] {
    const routes: string[] = [
      'GET /',
      'GET /api/v1/version',
      'GET /health',
      'GET /api/v1/server/info',
      'GET /api/v1/server/metrics',
      'GET /api/v1/server/controllers',
    ];

    // Add Phase 1.3 routes
    if (this.config.gateway.enabled) {
      routes.push('GET /api/v1/gateway/status');
      routes.push('GET /api/v1/gateway/routes');
    }

    if (this.config.auth.enabled) {
      routes.push('GET /api/v1/auth/status');
    }

    if (this.config.gateway.enableDocumentation) {
      routes.push('GET /api/v1/docs');
      routes.push('GET /api/v1/docs/openapi.json');
    }

    // Add Phase 2.1 Project Management routes (NEW)
    if (this.config.projectManagement.enabled) {
      routes.push('GET /api/v1/projects/status');
      routes.push('GET /api/v1/projects/metrics');
      routes.push('GET /api/v1/orchestration/status');
    }

    this.controllers.forEach((controller) => {
      routes.push(`${controller.path}/* (${controller.name})`);
    });

    return routes;
  }

  /**
   * Get similar routes for better error messages
   */
  private getSimilarRoutes(path: string): string[] {
    const routes = this.getRegisteredRoutes();
    // Simple similarity check - in production, you might want a more sophisticated algorithm
    return routes.filter(route => {
      const routePath = route.split(' ')[1];
      return routePath && this.calculateSimilarity(path, routePath) > 0.5;
    }).slice(0, 3);
  }

  /**
   * Simple string similarity calculation
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    const editDistance = this.getEditDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate edit distance between two strings
   */
  private getEditDistance(str1: string, str2: string): number {
    const matrix = [];
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[str2.length][str1.length];
  }

  /**
   * Get controller for specific route
   */
  private getControllerForRoute(route: string): string | undefined {
    for (const [name, controller] of this.controllers.entries()) {
      if (route.startsWith(controller.path)) {
        return name;
      }
    }
    return undefined;
  }

  /**
   * Check if route is protected (Phase 2.1 enhanced)
   */
  private isRouteProtected(route: string): boolean {
    const protectedPaths = [
      '/api/v1/protected',
      '/api/v1/database',
      '/api/v1/vector',
      '/api/v1/gateway',
      // Phase 2.1 protected routes (NEW)
      '/api/v1/projects',
      '/api/v1/project-orchestration',
      '/api/v1/project-settings',
    ];

    return protectedPaths.some(path => route.includes(path));
  }

  /**
   * Get controllers health status
   */
  private async getControllersHealth(): Promise<Record<string, boolean>> {
    const health: Record<string, boolean> = {};
    
    for (const [name, registration] of this.controllers.entries()) {
      if (registration.healthCheck) {
        try {
          health[name] = await registration.healthCheck();
        } catch (error) {
          health[name] = false;
        }
      } else {
        health[name] = registration.status === 'active';
      }
    }

    return health;
  }

  /**
   * Update memory usage metrics
   */
  private updateMemoryUsage(): void {
    this.metrics.memoryUsage = process.memoryUsage();
  }

  // Enhanced getters for testing and monitoring

  /**
   * Get Express app instance
   */
  public getApp(): Express {
    return this.app;
  }

  /**
   * Get enhanced server metrics with Phase 2.1 support
   */
  public getMetrics(): ServerMetrics {
    this.updateMemoryUsage();
    return {
      ...this.metrics,
      uptime: this.metrics.uptime(),
    };
  }

  /**
   * Get server configuration
   */
  public getConfig(): ReadyAIServerConfig {
    return { ...this.config };
  }

  /**
   * Check if server is running
   */
  public isRunning(): boolean {
    return this.server !== null && !this.isShuttingDown;
  }

  /**
   * Get service container (for testing)
   */
  public getContainer(): ServiceContainer {
    return this.container;
  }

  /**
   * Get Phase 2.1 services for testing (Enhanced)
   */
  public getServices() {
    return {
      // Phase 1.3 services
      errorService: this.errorService,
      authService: this.authService,
      gatewayService: this.gatewayService,
      // Phase 2.1 services (NEW)
      projectService: this.projectService,
      projectOrchestrator: this.projectOrchestrator,
      serviceCoordinator: this.serviceCoordinator,
    };
  }

  /**
   * Get Project Management configuration (Phase 2.1 - NEW)
   */
  public getProjectManagementConfig(): ReadyAIServerConfig['projectManagement'] {
    return this.config.projectManagement;
  }

  /**
   * Get active project count (Phase 2.1 - NEW)
   */
  public async getActiveProjectCount(): Promise<number> {
    if (!this.config.projectManagement.enabled) {
      return 0;
    }
    return this.metrics.activeProjects;
  }

  /**
   * Get project management health status (Phase 2.1 - NEW)
   */
  public async getProjectManagementHealth(): Promise<Record<string, boolean>> {
    if (!this.config.projectManagement.enabled) {
      return { projectManagement: false };
    }

    const health: Record<string, boolean> = {};
    
    try {
      health.projectService = await this.projectService.getHealthStatus?.() ?? true;
      health.projectOrchestrator = await this.projectOrchestrator.getHealthStatus?.() ?? true;
      health.serviceCoordinator = await this.serviceCoordinator.getHealthStatus?.() ?? true;
    } catch (error) {
      this.logger.logError(error as Error, 'server', { operation: 'getProjectManagementHealth' });
      health.projectService = false;
      health.projectOrchestrator = false;
      health.serviceCoordinator = false;
    }

    return health;
  }

  /**
   * Force update project metrics (Phase 2.1 - NEW)
   */
  public async updateProjectMetrics(): Promise<void> {
    if (!this.config.projectManagement.enabled) {
      return;
    }

    try {
      this.metrics.activeProjects = await this.projectService.getActiveProjectCount?.() ?? 0;
      this.metrics.totalProjectsCreated = await this.projectService.getTotalProjectCount?.() ?? 0;
    } catch (error) {
      this.logger.logError(error as Error, 'server', { operation: 'updateProjectMetrics' });
    }
  }

  /**
   * Register project event listener (Phase 2.1 - NEW)
   */
  public registerProjectEventListener(eventType: string, handler: Function): void {
    if (!this.config.projectManagement.enabled) {
      this.logger.warn('Cannot register project event listener: Project Management is disabled', 'server');
      return;
    }

    try {
      const projectEventService = this.container.get<ProjectEventService>('projectEventService');
      projectEventService.on?.(eventType, handler);
    } catch (error) {
      this.logger.logError(error as Error, 'server', { 
        operation: 'registerProjectEventListener',
        eventType,
      });
    }
  }

  /**
   * Trigger project phase transition (Phase 2.1 - NEW)
   */
  public async triggerPhaseTransition(projectId: UUID, fromPhase: PhaseType, toPhase: PhaseType): Promise<boolean> {
    if (!this.config.projectManagement.enablePhaseProgression) {
      this.logger.warn('Cannot trigger phase transition: Phase Progression is disabled', 'server');
      return false;
    }

    try {
      const phaseManager = this.container.get<PhaseManager>('phaseManager');
      const result = await phaseManager.transitionPhase?.(projectId, fromPhase, toPhase);
      
      if (result) {
        this.metrics.phaseTransitions++;
      }
      
      return result ?? false;
    } catch (error) {
      this.logger.logError(error as Error, 'server', { 
        operation: 'triggerPhaseTransition',
        projectId,
        fromPhase,
        toPhase,
      });
      return false;
    }
  }

  /**
   * Execute project orchestration operation (Phase 2.1 - NEW)
   */
  public async executeOrchestrationOperation(
    operationType: string,
    projectId: UUID,
    parameters: Record<string, any>
  ): Promise<any> {
    if (!this.config.projectManagement.enableOrchestration) {
      throw new ReadyAIError(
        'Project Orchestration is disabled',
        'ORCHESTRATION_DISABLED',
        503
      );
    }

    try {
      this.metrics.orchestrationRequests++;
      const result = await this.projectOrchestrator.executeOperation?.(
        operationType,
        projectId,
        parameters
      );
      
      return result;
    } catch (error) {
      this.metrics.projectErrors++;
      this.logger.logError(error as Error, 'server', { 
        operation: 'executeOrchestrationOperation',
        operationType,
        projectId,
        parameters,
      });
      throw error;
    }
  }
}

/**
 * Enhanced factory function to create ReadyAI server instance with Phase 2.1 support
 * Following Cline's factory patterns for dependency injection
 */
export function createReadyAIServer(config?: Partial<ReadyAIServerConfig>): ReadyAIServer {
  return new ReadyAIServer(config);
}

/**
 * Enhanced main entry point for Phase 2.1 server
 * Following Cline's activation patterns with comprehensive error handling
 */
if (require.main === module) {
  const server = createReadyAIServer();
  
  server.start()
    .then(() => {
      const config = server.getConfig();
      console.log('🚀 ReadyAI Phase 2.1 server is running successfully');
      console.log(`📍 Server: http://${config.host}:${config.port}`);
      console.log(`🏥 Health: http://${config.host}:${config.port}${config.healthCheck.endpoint}`);
      console.log(`📊 Metrics: http://${config.host}:${config.port}/api/v1/server/metrics`);
      console.log(`🛡️ Gateway: ${config.gateway.enabled ? 'Enabled' : 'Disabled'}`);
      console.log(`🔐 Auth: ${config.auth.enabled ? 'Enabled' : 'Disabled'}`);
      // Phase 2.1 status logging (NEW)
      console.log(`📁 Project Management: ${config.projectManagement.enabled ? 'Enabled' : 'Disabled'}`);
      if (config.projectManagement.enabled) {
        console.log(`🎯 Orchestration: ${config.projectManagement.enableOrchestration ? 'Enabled' : 'Disabled'}`);
        console.log(`🏗️ Workspace Management: ${config.projectManagement.enableWorkspaceManagement ? 'Enabled' : 'Disabled'}`);
        console.log(`📈 Phase Progression: ${config.projectManagement.enablePhaseProgression ? 'Enabled' : 'Disabled'}`);
        console.log(`📊 Project Status: http://${config.host}:${config.port}/api/v1/projects/status`);
        console.log(`🎼 Orchestration Status: http://${config.host}:${config.port}/api/v1/orchestration/status`);
      }
      if (config.gateway.enableDocumentation) {
        console.log(`📖 Docs: http://${config.host}:${config.port}/api/v1/docs`);
      }
    })
    .catch((error) => {
      console.error('❌ Failed to start ReadyAI Phase 2.1 server:', error);
      process.exit(1);
    });
}

// Export the server class and factory function with Phase 2.1 enhancements
export default ReadyAIServer;
export { 
  ReadyAIServerConfig, 
  ControllerRegistration, 
  ServerMetrics, 
  ServiceContainer,
  // Phase 2.1 exports (NEW)
  createReadyAIServer,
};
