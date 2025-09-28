// apps/api/server.ts

/**
 * ReadyAI API Server - Production-grade Express server with Cline-accelerated patterns
 * 
 * This server implementation leverages Cline's proven extension activation patterns
 * and service coordination architecture, adapted for ReadyAI's 7-phase development
 * orchestration system with comprehensive module registration and lifecycle management.
 * 
 * Key Adaptations from Cline:
 * - Extension activation patterns from Cline's extension.ts startup sequence
 * - Service coordination patterns from Cline's StateManager architecture
 * - Error handling and retry mechanisms from Cline's ApiHandler patterns
 * - Module registration from Cline's provider system initialization
 * - Graceful shutdown patterns from Cline's resource cleanup
 * 
 * ReadyAI Extensions:
 * - 7-phase methodology integration
 * - Multi-controller registration system
 * - Enhanced telemetry and monitoring
 * - Project-aware context management
 * - AI provider abstraction integration
 * - Production-grade dependency injection container
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer, Server } from 'http';
import { v4 as uuidv4 } from 'uuid';

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

// Service Dependencies - Fixed import paths for proper dependency injection
import { Logger, LoggerConfig } from '../../packages/logging/services/Logger';
import { ConfigService } from '../../packages/config/services/ConfigService';
import { ConfigRepository } from '../../packages/config/repositories/ConfigRepository';
import { ConfigNormalizer } from '../../packages/config/services/ConfigNormalizer';
import { ErrorService } from '../../packages/logging/services/ErrorService';

// Database Service Dependencies
import { DatabaseService } from '../../packages/database/services/DatabaseService';
import { DatabaseRepository } from '../../packages/database/repositories/DatabaseRepository';
import { MigrationService } from '../../packages/database/services/MigrationService';
import { QueryBuilder } from '../../packages/database/utils/QueryBuilder';

// Vector Database Service Dependencies
import { VectorDatabaseService } from '../../packages/vectordb/services/VectorDatabaseService';
import { VectorRepository } from '../../packages/vectordb/repositories/VectorRepository';
import { EmbeddingService } from '../../packages/vectordb/services/EmbeddingService';

// Controller Dependencies
import { ConfigController } from '../../packages/config/controllers/ConfigController';
import { LoggingController } from '../../packages/logging/controllers/LoggingController';
import { FileSystemController } from '../../packages/filesystem/controllers/FileSystemController';
import { DatabaseController } from '../../packages/database/controllers/DatabaseController';
import { VectorDatabaseController } from '../../packages/vectordb/controllers/VectorDatabaseController';

/**
 * Server configuration interface with comprehensive options
 * Adapted from Cline's configuration patterns with ReadyAI extensions
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
  };
  /** Health check configuration */
  healthCheck: {
    enabled: boolean;
    endpoint: string;
  };
}

/**
 * Default server configuration optimized for ReadyAI deployment
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
  },
  healthCheck: {
    enabled: true,
    endpoint: '/health',
  },
};

/**
 * Controller registration metadata for modular architecture
 * Following Cline's provider registration patterns
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
}

/**
 * Server metrics for monitoring and telemetry
 * Adapted from Cline's telemetry collection patterns
 */
interface ServerMetrics {
  startTime: Date;
  requestCount: number;
  errorCount: number;
  activeConnections: number;
  uptime: () => number;
  memoryUsage: NodeJS.MemoryUsage;
  registeredControllers: number;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
}

/**
 * Dependency Injection Container
 * Production-grade service management following enterprise patterns
 */
class ServiceContainer {
  private services = new Map<string, any>();
  private factories = new Map<string, () => any>();
  private singletons = new Map<string, any>();

  /**
   * Register a service factory
   */
  register<T>(name: string, factory: () => T, singleton = true): void {
    this.factories.set(name, factory);
    if (singleton && !this.singletons.has(name)) {
      this.singletons.set(name, null);
    }
  }

  /**
   * Get a service instance
   */
  get<T>(name: string): T {
    if (this.singletons.has(name)) {
      let instance = this.singletons.get(name);
      if (!instance) {
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
  }
}

/**
 * ReadyAI API Server - Enterprise-grade Express server
 * 
 * Implements Cline's proven server architecture with:
 * - Modular controller registration system
 * - Comprehensive middleware pipeline
 * - Advanced error handling and recovery
 * - Performance monitoring and telemetry
 * - Graceful startup and shutdown sequences
 * - Health monitoring and status reporting
 * - Production-grade dependency injection
 */
export class ReadyAIServer {
  private readonly app: Express;
  private server: Server | null = null;
  private readonly config: ReadyAIServerConfig;
  private readonly logger: Logger;
  private readonly controllers: Map<string, ControllerRegistration> = new Map();
  private readonly metrics: ServerMetrics;
  private readonly container: ServiceContainer;
  private isShuttingDown = false;
  private shutdownTimeout?: NodeJS.Timeout;

  constructor(config?: Partial<ReadyAIServerConfig>) {
    this.config = { ...DEFAULT_SERVER_CONFIG, ...config };
    this.app = express();
    
    // Initialize dependency injection container
    this.container = new ServiceContainer();
    
    // Initialize logger with server-specific configuration
    const loggerConfig: Partial<LoggerConfig> = {
      level: this.config.environment === 'development' ? 'debug' : 'info',
      enableConsole: true,
      enableFile: this.config.environment === 'production',
      enableCorrelation: true,
      enableMetrics: true,
      enablePhaseTracking: true,
    };
    this.logger = Logger.getInstance(loggerConfig);

    // Initialize metrics
    this.metrics = {
      startTime: new Date(),
      requestCount: 0,
      errorCount: 0,
      activeConnections: 0,
      uptime: () => Date.now() - this.metrics.startTime.getTime(),
      memoryUsage: process.memoryUsage(),
      registeredControllers: 0,
      healthStatus: 'healthy',
    };

    this.initializeServer();
  }

  /**
   * Initialize server with comprehensive middleware pipeline
   * Following Cline's proven middleware patterns with ReadyAI extensions
   */
  private initializeServer(): void {
    // Trust proxy if in production (for load balancers)
    if (this.config.security.trustProxy) {
      this.app.set('trust proxy', 1);
    }

    // Security middleware (Helmet)
    if (this.config.security.enableHelmet) {
      this.app.use(helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
          },
        },
        crossOriginEmbedderPolicy: false,
      }));
    }

    // CORS middleware with ReadyAI-specific configuration
    this.app.use(cors({
      origin: this.config.corsOrigin,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Request-ID',
        'X-Correlation-ID',
        'X-Project-ID',
        'X-Session-ID',
        'X-Phase-Type',
      ],
      credentials: true,
      maxAge: 86400, // 24 hours
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

    // Body parsing middleware
    this.app.use(express.json({ 
      limit: '10mb',
      type: ['application/json', 'text/plain'],
    }));
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: '10mb',
    }));

    // Rate limiting middleware
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
          return req.ip || 'unknown';
        },
      });
      this.app.use(limiter);
    }

    // Request correlation and logging middleware
    this.setupRequestMiddleware();

    // Initialize core routes
    this.setupCoreRoutes();

    // Error handling middleware (must be last)
    this.setupErrorHandling();

    this.logger.info('ReadyAI server initialized', 'server', {
      config: {
        port: this.config.port,
        host: this.config.host,
        environment: this.config.environment,
      },
      features: {
        compression: this.config.enableCompression,
        rateLimit: this.config.enableRateLimit,
        security: this.config.security.enableHelmet,
      },
    });
  }

  /**
   * Setup request correlation and logging middleware
   * Adapted from Cline's request tracking patterns
   */
  private setupRequestMiddleware(): void {
    // Request correlation middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const requestId = req.headers['x-request-id'] as string || uuidv4();
      const correlationId = req.headers['x-correlation-id'] as string || uuidv4();
      const projectId = req.headers['x-project-id'] as string;
      const sessionId = req.headers['x-session-id'] as string;
      const phaseType = req.headers['x-phase-type'] as PhaseType;

      // Attach to request for downstream use
      (req as any).correlationId = correlationId;
      (req as any).requestId = requestId;
      (req as any).projectId = projectId;
      (req as any).sessionId = sessionId;
      (req as any).phaseType = phaseType;

      // Set response headers
      res.setHeader('X-Request-ID', requestId);
      res.setHeader('X-Correlation-ID', correlationId);

      // Start correlation context in logger
      this.logger.startCorrelation({
        projectId: projectId as UUID,
        sessionId,
        phaseType,
      });

      // Update metrics
      this.metrics.requestCount++;
      this.updateMemoryUsage();

      next();
    });

    // Request logging middleware
    if (this.config.enableRequestLogging) {
      this.app.use((req: Request, res: Response, next: NextFunction) => {
        const startTime = Date.now();
        
        this.logger.debug(`Incoming request: ${req.method} ${req.path}`, 'server', {
          method: req.method,
          path: req.path,
          userAgent: req.headers['user-agent'],
          ip: req.ip,
          correlationId: (req as any).correlationId,
        });

        // Response completion logging
        const originalSend = res.send;
        res.send = function(body: any) {
          const duration = Date.now() - startTime;
          const logger = (req as any).logger || Logger.getInstance();
          
          logger.info(`Request completed: ${req.method} ${req.path}`, 'server', {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration,
            correlationId: (req as any).correlationId,
            contentLength: res.get('content-length'),
          });

          return originalSend.call(this, body);
        };

        next();
      });
    }
  }

  /**
   * Setup core server routes with health checks and system endpoints
   * Following Cline's core endpoint patterns
   */
  private setupCoreRoutes(): void {
    // Health check endpoint
    if (this.config.healthCheck.enabled) {
      this.app.get(this.config.healthCheck.endpoint, this.handleHealthCheck.bind(this));
    }

    // Server info endpoint
    this.app.get('/api/v1/server/info', this.handleServerInfo.bind(this));

    // Server metrics endpoint
    this.app.get('/api/v1/server/metrics', this.handleServerMetrics.bind(this));

    // Controllers status endpoint
    this.app.get('/api/v1/server/controllers', this.handleControllersStatus.bind(this));

    // Version endpoint
    this.app.get('/api/v1/version', (req: Request, res: Response) => {
      const response: ApiResponse<any> = createApiResponse({
        service: 'ReadyAI Personal AI Development Orchestrator',
        version: '1.0.0',
        apiVersion: 'v1',
        buildDate: new Date().toISOString(),
        environment: this.config.environment,
        nodeVersion: process.version,
      });
      res.json(response);
    });

    // Root endpoint
    this.app.get('/', (req: Request, res: Response) => {
      const response: ApiResponse<any> = createApiResponse({
        message: 'ReadyAI API Server',
        status: 'running',
        version: '1.0.0',
        documentation: '/api/v1',
        endpoints: {
          health: this.config.healthCheck.endpoint,
          info: '/api/v1/server/info',
          metrics: '/api/v1/server/metrics',
          controllers: '/api/v1/server/controllers',
        },
      });
      res.json(response);
    });
  }

  /**
   * Setup comprehensive error handling middleware
   * Adapted from Cline's error handling patterns with ReadyAI enhancements
   */
  private setupErrorHandling(): void {
    // 404 handler for undefined routes
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const error: ApiErrorResponse = createApiError(
        `Route not found: ${req.method} ${req.path}`,
        'ROUTE_NOT_FOUND',
        404,
        {
          method: req.method,
          path: req.path,
          availableRoutes: this.getRegisteredRoutes(),
        }
      );

      this.logger.warn(`Route not found: ${req.method} ${req.path}`, 'server', {
        method: req.method,
        path: req.path,
        correlationId: (req as any).correlationId,
      });

      res.status(404).json(error);
    });

    // Global error handler
    this.app.use((error: any, req: Request, res: Response, next: NextFunction) => {
      this.metrics.errorCount++;
      
      const correlationId = (req as any).correlationId || 'unknown';
      
      this.logger.logError(error, 'server', {
        method: req.method,
        path: req.path,
        correlationId,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      });

      // Handle ReadyAI errors
      if (error instanceof ReadyAIError) {
        return res.status(error.statusCode || 500).json(error.toApiErrorResponse());
      }

      // Handle validation errors
      if (error.name === 'ValidationError') {
        const apiError: ApiErrorResponse = createApiError(
          error.message,
          'VALIDATION_ERROR',
          400,
          { field: error.field, value: error.value }
        );
        return res.status(400).json(apiError);
      }

      // Handle timeout errors
      if (error.code === 'TIMEOUT' || error.message.includes('timeout')) {
        const apiError: ApiErrorResponse = createApiError(
          'Request timeout',
          'REQUEST_TIMEOUT',
          408,
          { timeout: this.config.requestTimeout }
        );
        return res.status(408).json(apiError);
      }

      // Default error response
      const isDevelopment = this.config.environment === 'development';
      const apiError: ApiErrorResponse = createApiError(
        isDevelopment ? error.message : 'Internal server error',
        'INTERNAL_ERROR',
        500,
        isDevelopment ? { stack: error.stack } : undefined
      );

      res.status(500).json(apiError);
    });
  }

  /**
   * Initialize services in the dependency injection container
   * Following enterprise-grade dependency injection patterns
   */
  private initializeServices(): void {
    try {
      this.logger.info('Initializing ReadyAI services...', 'server');

      // Register repositories (no dependencies)
      this.container.register('configRepository', () => new ConfigRepository());
      this.container.register('databaseRepository', () => new DatabaseRepository());
      this.container.register('vectorRepository', () => new VectorRepository());
      
      // Register utility services
      this.container.register('configNormalizer', () => new ConfigNormalizer());
      this.container.register('queryBuilder', () => new QueryBuilder());
      
      // Register ConfigService with all its dependencies
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
            enableBackgroundSync: false
          },
          this.logger
        );
      });

      // Register DatabaseService with dependencies
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
            enableQueryOptimization: true
          },
          this.logger
        );
      });

      // Register MigrationService
      this.container.register('migrationService', () => {
        const databaseService = this.container.get<DatabaseService>('databaseService');
        return new MigrationService(
          databaseService,
          {
            migrationsPath: './migrations',
            enableAutoMigrations: true,
            enableRollback: true,
            enableBackup: true
          },
          this.logger
        );
      });

      // Register EmbeddingService
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
            maxRetryAttempts: 3
          },
          this.logger
        );
      });

      // Register VectorDatabaseService
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
            defaultThreshold: 0.7
          },
          this.logger
        );
      });

      // Register controllers with their service dependencies
      this.container.register('configController', () => {
        const configService = this.container.get<ConfigService>('configService');
        return new ConfigController(configService);
      });

      this.container.register('databaseController', () => {
        const databaseService = this.container.get<DatabaseService>('databaseService');
        const migrationService = this.container.get<MigrationService>('migrationService');
        return new DatabaseController(databaseService, migrationService);
      });

      this.container.register('vectorDatabaseController', () => {
        const vectorDatabaseService = this.container.get<VectorDatabaseService>('vectorDatabaseService');
        return new VectorDatabaseController(vectorDatabaseService);
      });

      this.logger.info('ReadyAI services initialized successfully', 'server');

    } catch (error) {
      this.logger.logError(error as Error, 'server', { operation: 'initializeServices' });
      throw new ReadyAIError(
        `Failed to initialize services: ${error}`,
        'SERVICE_INITIALIZATION_ERROR',
        500
      );
    }
  }

  /**
   * Register controller with comprehensive validation and health monitoring
   * Following Cline's modular provider registration patterns
   */
  public async registerController(
    name: string,
    path: string,
    router: express.Router,
    controller?: any,
    version = '1.0.0',
    healthCheck?: () => Promise<boolean>
  ): Promise<void> {
    try {
      // Validate controller registration
      if (this.controllers.has(name)) {
        this.logger.warn(`Controller '${name}' is already registered, replacing...`, 'server');
      }

      // Register controller
      const registration: ControllerRegistration = {
        name,
        path,
        router,
        controller,
        version,
        status: 'active',
        registeredAt: new Date().toISOString(),
        healthCheck,
      };

      this.controllers.set(name, registration);
      this.app.use(path, router);
      this.metrics.registeredControllers = this.controllers.size;

      this.logger.info(`Controller registered successfully: ${name}`, 'server', {
        name,
        path,
        version,
        hasController: !!controller,
        hasHealthCheck: !!healthCheck,
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
   * Initialize and register all ReadyAI controllers
   * Following Cline's service initialization patterns with proper dependency injection
   */
  private async initializeControllers(): Promise<void> {
    try {
      this.logger.info('Starting ReadyAI module registration...', 'server');

      // Initialize services first
      this.initializeServices();

      // Get service instances from container
      const configService = this.container.get<ConfigService>('configService');
      const configController = this.container.get<ConfigController>('configController');
      const databaseService = this.container.get<DatabaseService>('databaseService');
      const databaseController = this.container.get<DatabaseController>('databaseController');
      const vectorDatabaseService = this.container.get<VectorDatabaseService>('vectorDatabaseService');
      const vectorDatabaseController = this.container.get<VectorDatabaseController>('vectorDatabaseController');

      // Register configuration controller
      await this.registerController(
        'config',
        '/api/v1/config',
        configController.getRouter(),
        configController,
        '1.0.0',
        async () => configService ? await configService.getHealthStatus() : false
      );

      // Register database controller
      await this.registerController(
        'database',
        '/api/v1/database',
        databaseController.getRouter(),
        databaseController,
        '1.0.0',
        async () => databaseService ? await databaseService.getHealthStatus() : false
      );

      // Register vector database controller
      await this.registerController(
        'vector',
        '/api/v1/vector',
        vectorDatabaseController.getRouter(),
        vectorDatabaseController,
        '1.0.0',
        async () => vectorDatabaseService ? await vectorDatabaseService.getHealthStatus() : false
      );

      // Note: Additional controllers will be registered here as they become available
      // Following the implementation order from the Master Plan:
      // - LoggingController (when available)
      // - FileSystemController (when available)
      // - Other controllers as they are implemented

      this.logger.info('ReadyAI module registration completed', 'server', {
        registeredControllers: this.controllers.size,
        controllers: Array.from(this.controllers.keys()),
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
   * Start the server with comprehensive initialization
   * Following Cline's proven startup patterns
   */
  public async start(): Promise<void> {
    try {
      if (this.server) {
        throw new ReadyAIError('Server is already running', 'SERVER_ALREADY_RUNNING', 400);
      }

      this.logger.info('Starting ReadyAI server...', 'server');

      // Initialize controllers with dependency injection
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

      this.logger.info('ReadyAI server started successfully', 'server', {
        port: this.config.port,
        host: this.config.host,
        environment: this.config.environment,
        processId: process.pid,
        startTime: this.metrics.startTime.toISOString(),
        controllersRegistered: this.controllers.size,
      });
    } catch (error) {
      this.metrics.healthStatus = 'unhealthy';
      this.logger.logError(error as Error, 'server', { operation: 'start' });
      throw error;
    }
  }

  /**
   * Setup connection tracking for monitoring
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
   * Setup graceful shutdown handlers
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
   * Stop the server gracefully
   * Following Cline's resource cleanup patterns
   */
  public async stop(): Promise<void> {
    try {
      if (!this.server) {
        this.logger.warn('Server is not running', 'server');
        return;
      }

      this.logger.info('Stopping ReadyAI server...', 'server');

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

      this.logger.info('ReadyAI server stopped successfully', 'server', {
        uptime: this.metrics.uptime(),
        totalRequests: this.metrics.requestCount,
        totalErrors: this.metrics.errorCount,
      });
    } catch (error) {
      this.logger.logError(error as Error, 'server', { operation: 'stop' });
      throw error;
    }
  }

  /**
   * Cleanup server resources
   * Following Cline's resource management patterns
   */
  private async cleanup(): Promise<void> {
    try {
      // End logger correlation
      this.logger.endCorrelation();

      // Clear controller registrations
      this.controllers.clear();
      this.metrics.registeredControllers = 0;

      // Clear dependency injection container
      this.container.clear();

      this.logger.debug('Server cleanup completed', 'server');
    } catch (error) {
      this.logger.logError(error as Error, 'server', { operation: 'cleanup' });
    }
  }

  // Health and monitoring endpoints

  /**
   * Health check endpoint handler
   */
  private async handleHealthCheck(req: Request, res: Response): Promise<void> {
    const healthData = {
      status: this.metrics.healthStatus,
      timestamp: new Date().toISOString(),
      uptime: this.metrics.uptime(),
      version: '1.0.0',
      environment: this.config.environment,
      metrics: {
        requests: this.metrics.requestCount,
        errors: this.metrics.errorCount,
        connections: this.metrics.activeConnections,
        controllers: this.metrics.registeredControllers,
      },
      controllers: await this.getControllersHealth(),
    };

    const statusCode = this.metrics.healthStatus === 'healthy' ? 200 : 503;
    const response: ApiResponse<any> = createApiResponse(healthData);
    res.status(statusCode).json(response);
  }

  /**
   * Server info endpoint handler
   */
  private handleServerInfo(req: Request, res: Response): void {
    const serverInfo = {
      service: 'ReadyAI Personal AI Development Orchestrator API',
      version: '1.0.0',
      apiVersion: 'v1',
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
        },
      },
    };

    const response: ApiResponse<any> = createApiResponse(serverInfo);
    res.json(response);
  }

  /**
   * Server metrics endpoint handler
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
    };

    const response: ApiResponse<any> = createApiResponse(metrics);
    res.json(response);
  }

  /**
   * Controllers status endpoint handler
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
        };
      })
    );

    const response: ApiResponse<any> = createApiResponse({
      total: controllersStatus.length,
      controllers: controllersStatus,
    });
    res.json(response);
  }

  // Utility methods

  /**
   * Get registered routes for documentation
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

    this.controllers.forEach((controller) => {
      routes.push(`${controller.path}/* (${controller.name})`);
    });

    return routes;
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

  // Getters for testing and monitoring

  /**
   * Get Express app instance
   */
  public getApp(): Express {
    return this.app;
  }

  /**
   * Get server metrics
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
}

/**
 * Factory function to create ReadyAI server instance
 * Following Cline's factory patterns for dependency injection
 */
export function createReadyAIServer(config?: Partial<ReadyAIServerConfig>): ReadyAIServer {
  return new ReadyAIServer(config);
}

/**
 * Main entry point when run directly
 * Following Cline's activation patterns with comprehensive error handling
 */
if (require.main === module) {
  const server = createReadyAIServer();
  
  server.start()
    .then(() => {
      console.log('🚀 ReadyAI server is running successfully');
      console.log(`📍 Server: http://localhost:${server.getConfig().port}`);
      console.log(`🏥 Health: http://localhost:${server.getConfig().port}/health`);
      console.log(`📊 Metrics: http://localhost:${server.getConfig().port}/api/v1/server/metrics`);
    })
    .catch((error) => {
      console.error('❌ Failed to start ReadyAI server:', error);
      process.exit(1);
    });
}

// Export the server class and factory function
export default ReadyAIServer;
export { ReadyAIServerConfig, ControllerRegistration, ServerMetrics, ServiceContainer };