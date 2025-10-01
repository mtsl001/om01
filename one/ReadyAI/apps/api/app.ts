// apps/api/app.ts

/**
 * ReadyAI Express Application Configuration - Production-grade app setup with Cline-accelerated patterns
 * 
 * This application configuration leverages Cline's proven Express app initialization patterns
 * enhanced with ReadyAI's comprehensive middleware stack and Phase 1.3 capabilities.
 * 
 * Key Adaptations from Cline:
 * - Express app creation patterns from Cline's webview provider setup
 * - Middleware configuration from Cline's request handling architecture  
 * - Route organization from Cline's command routing system
 * - Error boundary patterns from Cline's error service integration
 * - Security configurations from Cline's authentication middleware
 * - CORS and headers management from Cline's extension communication
 * - Compression and performance optimizations from Cline's resource management
 * 
 * ReadyAI Extensions:
 * - Comprehensive Phase 1.3 middleware pipeline
 * - Advanced request correlation and tracking
 * - Enterprise-grade security configurations
 * - API Gateway integration middleware
 * - Authentication and session management
 * - Rate limiting and request validation
 * - Health monitoring and metrics collection
 * - Graceful error handling with recovery strategies
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';

// ReadyAI Core Dependencies
import {
  UUID,
  ApiResponse,
  ApiErrorResponse,
  ReadyAIError,
  createApiResponse,
  createApiError,
  PhaseType
} from '../../packages/foundation/types/core';

// Service Dependencies
import { Logger, LoggerConfig } from '../../packages/logging/services/Logger';
import { ErrorService } from '../../packages/error-handling/services/ErrorService';

// Middleware Dependencies
import { gatewayMiddleware } from './middleware/gateway';

/**
 * Enhanced application configuration interface with Phase 1.3 capabilities
 * Adapted from Cline's configuration patterns
 */
export interface AppConfig {
  /** Environment mode */
  environment: 'development' | 'production' | 'test';
  /** CORS configuration */
  cors: {
    origin: string[] | string | boolean;
    credentials: boolean;
    methods: string[];
    allowedHeaders: string[];
    maxAge: number;
  };
  /** Security configuration */
  security: {
    enableHelmet: boolean;
    trustProxy: boolean;
    contentSecurityPolicy: boolean;
    enableHsts: boolean;
    enableNoSniff: boolean;
    enableXssFilter: boolean;
    enableFrameGuard: boolean;
  };
  /** Compression settings */
  compression: {
    enabled: boolean;
    level: number;
    threshold: number;
    filter?: (req: Request, res: Response) => boolean;
  };
  /** Rate limiting configuration */
  rateLimit: {
    enabled: boolean;
    windowMs: number;
    maxRequests: number;
    skipSuccessfulRequests: boolean;
    skipFailedRequests: boolean;
    standardHeaders: boolean;
    legacyHeaders: boolean;
  };
  /** Request parsing limits */
  parsing: {
    jsonLimit: string;
    urlencodedLimit: string;
    extended: boolean;
    parameterLimit: number;
  };
  /** Logging configuration */
  logging: {
    enableRequestLogging: boolean;
    enableErrorLogging: boolean;
    logFormat: string;
    enableCorrelationId: boolean;
    enablePhaseTracking: boolean;
  };
  /** API Gateway settings */
  gateway: {
    enabled: boolean;
    enableValidation: boolean;
    enableMetrics: boolean;
    enableDocumentation: boolean;
  };
  /** Authentication settings */
  auth: {
    enabled: boolean;
    cookieSecret: string;
    enableSessions: boolean;
    sessionName: string;
  };
  /** Health check configuration */
  health: {
    enabled: boolean;
    endpoint: string;
    enableDeepChecks: boolean;
  };
}

/**
 * Default application configuration optimized for ReadyAI Phase 1.3
 * Following Cline's proven configuration patterns
 */
const DEFAULT_APP_CONFIG: AppConfig = {
  environment: (process.env.NODE_ENV as any) || 'development',
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:8080'
    ],
    credentials: true,
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
      'X-User-Agent',
      'Accept',
      'Accept-Language',
      'Accept-Encoding',
    ],
    maxAge: 86400, // 24 hours
  },
  security: {
    enableHelmet: true,
    trustProxy: process.env.NODE_ENV === 'production',
    contentSecurityPolicy: process.env.NODE_ENV === 'production',
    enableHsts: process.env.NODE_ENV === 'production',
    enableNoSniff: true,
    enableXssFilter: true,
    enableFrameGuard: true,
  },
  compression: {
    enabled: true,
    level: 6,
    threshold: 1024,
  },
  rateLimit: {
    enabled: true,
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: process.env.NODE_ENV === 'production' ? 1000 : 10000,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    standardHeaders: true,
    legacyHeaders: false,
  },
  parsing: {
    jsonLimit: '50mb',
    urlencodedLimit: '50mb',
    extended: true,
    parameterLimit: 10000,
  },
  logging: {
    enableRequestLogging: true,
    enableErrorLogging: true,
    logFormat: process.env.NODE_ENV === 'production' ? 'combined' : 'dev',
    enableCorrelationId: true,
    enablePhaseTracking: true,
  },
  gateway: {
    enabled: true,
    enableValidation: true,
    enableMetrics: true,
    enableDocumentation: true,
  },
  auth: {
    enabled: true,
    cookieSecret: process.env.COOKIE_SECRET || 'readyai-dev-cookie-secret',
    enableSessions: true,
    sessionName: 'readyai-session',
  },
  health: {
    enabled: true,
    endpoint: '/health',
    enableDeepChecks: true,
  },
};

/**
 * Enhanced middleware registration tracker for debugging and monitoring
 */
interface MiddlewareInfo {
  name: string;
  order: number;
  enabled: boolean;
  path?: string;
  registeredAt: Date;
  middleware: express.RequestHandler | express.ErrorRequestHandler;
}

/**
 * ReadyAI Express Application Factory - Enterprise-grade Express app with Phase 1.3 capabilities
 * 
 * Creates and configures Express application with Cline's proven patterns enhanced for:
 * - Comprehensive security middleware stack
 * - Advanced request correlation and tracking
 * - API Gateway integration
 * - Authentication and session management
 * - Error handling with recovery strategies
 * - Performance optimization and monitoring
 * - Development and production optimizations
 * - Graceful degradation and fault tolerance
 */
export class ReadyAIApp {
  private readonly app: Express;
  private readonly config: AppConfig;
  private readonly logger: Logger;
  private readonly errorService: ErrorService | null = null;
  private readonly middlewareRegistry: Map<string, MiddlewareInfo> = new Map();
  private middlewareOrder = 0;

  constructor(config?: Partial<AppConfig>) {
    this.config = { ...DEFAULT_APP_CONFIG, ...config };
    this.app = express();
    
    // Initialize logger for app configuration
    const loggerConfig: Partial<LoggerConfig> = {
      level: this.config.environment === 'development' ? 'debug' : 'info',
      enableConsole: true,
      enableFile: this.config.environment === 'production',
      enableCorrelation: this.config.logging.enableCorrelationId,
      enablePhaseTracking: this.config.logging.enablePhaseTracking,
    };
    this.logger = Logger.getInstance(loggerConfig);

    // Try to initialize error service (may not be available during bootstrap)
    try {
      // ErrorService would be injected by the server
      // this.errorService = new ErrorService(...);
    } catch (error) {
      this.logger.warn('Error service not available during app initialization', 'app');
    }

    this.configureApp();
  }

  /**
   * Configure the Express application with comprehensive middleware stack
   * Following Cline's proven middleware patterns with ReadyAI enhancements
   */
  private configureApp(): void {
    this.logger.info('Configuring ReadyAI Express application...', 'app', {
      environment: this.config.environment,
      features: {
        cors: !!this.config.cors.origin,
        security: this.config.security.enableHelmet,
        compression: this.config.compression.enabled,
        rateLimit: this.config.rateLimit.enabled,
        gateway: this.config.gateway.enabled,
        auth: this.config.auth.enabled,
      },
    });

    // Configure Express app settings
    this.configureAppSettings();

    // Setup core middleware pipeline
    this.setupCoreMiddleware();

    // Setup security middleware
    this.setupSecurityMiddleware();

    // Setup parsing middleware
    this.setupParsingMiddleware();

    // Setup request enhancement middleware
    this.setupRequestEnhancement();

    // Setup authentication middleware
    this.setupAuthenticationMiddleware();

    // Setup API Gateway middleware
    this.setupGatewayMiddleware();

    // Setup logging middleware
    this.setupLoggingMiddleware();

    // Setup health check routes
    this.setupHealthRoutes();

    // Setup error handling (must be last)
    this.setupErrorHandling();

    this.logger.info('ReadyAI Express application configured successfully', 'app', {
      middlewareCount: this.middlewareRegistry.size,
      registeredMiddleware: Array.from(this.middlewareRegistry.keys()),
    });
  }

  /**
   * Configure Express application settings
   * Following Cline's app configuration patterns
   */
  private configureAppSettings(): void {
    // Trust proxy configuration for load balancers
    if (this.config.security.trustProxy) {
      this.app.set('trust proxy', 1);
      this.logger.debug('Enabled proxy trust', 'app');
    }

    // Disable X-Powered-By header for security
    this.app.disable('x-powered-by');

    // Configure view engine (if needed for documentation)
    this.app.set('view engine', 'ejs');
    this.app.set('views', './views');

    // Set case sensitivity for routes
    this.app.set('case sensitive routing', false);
    this.app.set('strict routing', false);

    // Configure JSON spaces for pretty printing in development
    if (this.config.environment === 'development') {
      this.app.set('json spaces', 2);
    }
  }

  /**
   * Setup core middleware (CORS, Compression)
   * Adapted from Cline's core middleware patterns
   */
  private setupCoreMiddleware(): void {
    // CORS middleware with comprehensive ReadyAI configuration
    const corsMiddleware = cors({
      origin: this.config.cors.origin,
      credentials: this.config.cors.credentials,
      methods: this.config.cors.methods,
      allowedHeaders: this.config.cors.allowedHeaders,
      maxAge: this.config.cors.maxAge,
      optionsSuccessStatus: 200,
      preflightContinue: false,
    });

    this.registerMiddleware('cors', corsMiddleware, true);

    // Compression middleware
    if (this.config.compression.enabled) {
      const compressionMiddleware = compression({
        level: this.config.compression.level,
        threshold: this.config.compression.threshold,
        filter: this.config.compression.filter || ((req: Request) => {
          // Don't compress responses if X-No-Compression header is set
          if (req.headers['x-no-compression']) return false;
          // Default compression filter
          return compression.filter(req, {} as any);
        }),
      });

      this.registerMiddleware('compression', compressionMiddleware, true);
    }
  }

  /**
   * Setup security middleware (Helmet, Rate Limiting)
   * Following Cline's security patterns with ReadyAI enhancements
   */
  private setupSecurityMiddleware(): void {
    // Helmet security middleware with comprehensive configuration
    if (this.config.security.enableHelmet) {
      const helmetOptions: any = {
        contentSecurityPolicy: this.config.security.contentSecurityPolicy ? {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: ["'self'", "ws:", "wss:", "https://api.openai.com", "https://openrouter.ai"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
          },
        } : false,
        crossOriginEmbedderPolicy: false, // Allow embeddings for VS Code integration
        hsts: this.config.security.enableHsts ? {
          maxAge: 31536000, // 1 year
          includeSubDomains: true,
          preload: true,
        } : false,
        noSniff: this.config.security.enableNoSniff,
        xssFilter: this.config.security.enableXssFilter,
        frameguard: this.config.security.enableFrameGuard ? { action: 'deny' } : false,
        referrerPolicy: { policy: 'same-origin' },
      };

      this.registerMiddleware('helmet', helmet(helmetOptions), true);
    }

    // Rate limiting middleware
    if (this.config.rateLimit.enabled) {
      const rateLimiter = rateLimit({
        windowMs: this.config.rateLimit.windowMs,
        max: this.config.rateLimit.maxRequests,
        standardHeaders: this.config.rateLimit.standardHeaders,
        legacyHeaders: this.config.rateLimit.legacyHeaders,
        skipSuccessfulRequests: this.config.rateLimit.skipSuccessfulRequests,
        skipFailedRequests: this.config.rateLimit.skipFailedRequests,
        keyGenerator: (req: Request) => {
          // Enhanced key generation with user context
          const userId = (req as any).user?.id;
          const sessionId = (req as any).sessionId;
          const ip = req.ip || req.connection.remoteAddress || 'unknown';
          
          if (userId) return `user:${userId}`;
          if (sessionId) return `session:${sessionId}`;
          return `ip:${ip}`;
        },
        handler: (req: Request, res: Response) => {
          this.logger.warn('Rate limit exceeded', 'app', {
            ip: req.ip,
            method: req.method,
            path: req.path,
            correlationId: (req as any).correlationId,
            userAgent: req.headers['user-agent'],
          });

          const error: ApiErrorResponse = createApiError(
            'Too many requests, please try again later',
            'RATE_LIMIT_EXCEEDED',
            429,
            {
              retryAfter: Math.ceil(this.config.rateLimit.windowMs / 1000),
              limit: this.config.rateLimit.maxRequests,
              window: this.config.rateLimit.windowMs,
            }
          );

          res.status(429).json(error);
        },
        skip: (req: Request) => {
          // Skip rate limiting for health checks and metrics
          const skipPaths = ['/health', '/metrics', '/api/v1/server/info'];
          return skipPaths.some(path => req.path.startsWith(path));
        },
      });

      this.registerMiddleware('rateLimit', rateLimiter, true);
    }
  }

  /**
   * Setup request parsing middleware
   * Following Cline's request handling patterns
   */
  private setupParsingMiddleware(): void {
    // Cookie parser middleware
    if (this.config.auth.enableSessions) {
      this.registerMiddleware('cookieParser', cookieParser(this.config.auth.cookieSecret), true);
    }

    // JSON body parser with enhanced configuration
    const jsonParser = express.json({
      limit: this.config.parsing.jsonLimit,
      type: ['application/json', 'text/plain'],
      strict: true,
      verify: (req: Request, res: Response, buf: Buffer) => {
        // Store raw body for signature verification if needed
        (req as any).rawBody = buf;
      },
    });

    this.registerMiddleware('jsonParser', jsonParser, true);

    // URL-encoded body parser
    const urlencodedParser = express.urlencoded({
      limit: this.config.parsing.urlencodedLimit,
      extended: this.config.parsing.extended,
      parameterLimit: this.config.parsing.parameterLimit,
    });

    this.registerMiddleware('urlencodedParser', urlencodedParser, true);

    // Raw body parser for webhooks and binary data
    const rawParser = express.raw({
      limit: '10mb',
      type: ['application/octet-stream', 'application/pdf', 'image/*'],
    });

    this.registerMiddleware('rawParser', rawParser, true, '/webhooks/*');

    // Text parser for plain text content
    const textParser = express.text({
      limit: '10mb',
      type: 'text/plain',
    });

    this.registerMiddleware('textParser', textParser, true, '/api/v1/text/*');
  }

  /**
   * Setup request enhancement middleware (correlation, timing, etc.)
   * Following Cline's request tracking patterns with ReadyAI enhancements
   */
  private setupRequestEnhancement(): void {
    // Request correlation and enhancement middleware
    const enhancementMiddleware = (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();

      // Generate or extract correlation identifiers
      const requestId = req.headers['x-request-id'] as string || uuidv4();
      const correlationId = req.headers['x-correlation-id'] as string || uuidv4();
      const projectId = req.headers['x-project-id'] as string;
      const sessionId = req.headers['x-session-id'] as string || req.cookies?.[this.config.auth.sessionName];
      const phaseType = req.headers['x-phase-type'] as PhaseType;

      // Attach to request object
      (req as any).requestId = requestId;
      (req as any).correlationId = correlationId;
      (req as any).projectId = projectId;
      (req as any).sessionId = sessionId;
      (req as any).phaseType = phaseType;
      (req as any).startTime = startTime;

      // Set response headers
      res.setHeader('X-Request-ID', requestId);
      res.setHeader('X-Correlation-ID', correlationId);
      res.setHeader('X-Server-Instance', process.env.HOSTNAME || 'readyai-api');
      res.setHeader('X-API-Version', 'v1');
      res.setHeader('X-Phase-Support', 'all');
      res.setHeader('X-ReadyAI-Version', '1.0.0');

      // Add timing information to response
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        res.setHeader('X-Response-Time', `${duration}ms`);
      });

      // Start correlation context if logger supports it
      if (this.config.logging.enableCorrelationId && this.logger.startCorrelation) {
        this.logger.startCorrelation({
          projectId: projectId as UUID,
          sessionId,
          phaseType,
        });
      }

      next();
    };

    this.registerMiddleware('requestEnhancement', enhancementMiddleware, true);

    // Request size monitoring
    const sizeMonitoringMiddleware = (req: Request, res: Response, next: NextFunction) => {
      const contentLength = req.headers['content-length'];
      if (contentLength) {
        const size = parseInt(contentLength, 10);
        if (size > 100 * 1024 * 1024) { // 100MB
          this.logger.warn('Large request detected', 'app', {
            size,
            path: req.path,
            method: req.method,
            correlationId: (req as any).correlationId,
          });
        }
        (req as any).contentLength = size;
      }
      next();
    };

    this.registerMiddleware('sizeMonitoring', sizeMonitoringMiddleware, true);
  }

  /**
   * Setup authentication middleware
   * Following Cline's authentication patterns
   */
  private setupAuthenticationMiddleware(): void {
    if (!this.config.auth.enabled) return;

    // Basic authentication extraction middleware
    const authExtractionMiddleware = (req: Request, res: Response, next: NextFunction) => {
      try {
        // Extract various authentication methods
        const authHeader = req.headers['authorization'];
        const apiKey = req.headers['x-api-key'] as string;
        const authToken = req.headers['x-auth-token'] as string;
        const refreshToken = req.headers['x-refresh-token'] as string;
        const sessionCookie = req.cookies?.[this.config.auth.sessionName];

        // Store authentication data for downstream middleware
        (req as any).auth = {
          bearer: authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null,
          apiKey,
          authToken,
          refreshToken,
          sessionCookie,
        };

        // Log authentication attempt if token provided
        if (authHeader || apiKey || authToken) {
          this.logger.debug('Authentication data extracted', 'auth', {
            hasBearerToken: !!((req as any).auth.bearer),
            hasApiKey: !!apiKey,
            hasAuthToken: !!authToken,
            hasRefreshToken: !!refreshToken,
            hasSessionCookie: !!sessionCookie,
            correlationId: (req as any).correlationId,
          });
        }

        next();
      } catch (error) {
        this.logger.warn('Authentication extraction failed', 'auth', {
          error: (error as Error).message,
          correlationId: (req as any).correlationId,
        });
        next(); // Continue without authentication
      }
    };

    this.registerMiddleware('authExtraction', authExtractionMiddleware, true);
  }

  /**
   * Setup API Gateway middleware
   * Following Cline's gateway patterns with ReadyAI enhancements
   */
  private setupGatewayMiddleware(): void {
    if (!this.config.gateway.enabled) return;

    // Use the gateway middleware from the middleware directory
    this.registerMiddleware('gateway', gatewayMiddleware, true);

    // Gateway request preprocessing
    const gatewayPreprocessMiddleware = (req: Request, res: Response, next: NextFunction) => {
      // Add gateway context to request
      (req as any).gateway = {
        enabled: this.config.gateway.enabled,
        validation: this.config.gateway.enableValidation,
        metrics: this.config.gateway.enableMetrics,
        documentation: this.config.gateway.enableDocumentation,
        startTime: Date.now(),
        route: req.path,
        method: req.method,
        version: req.headers['api-version'] || 'v1',
      };

      // Set gateway headers
      res.setHeader('X-Gateway-Enabled', 'true');
      res.setHeader('X-Gateway-Version', '1.0.0');

      next();
    };

    this.registerMiddleware('gatewayPreprocess', gatewayPreprocessMiddleware, true);
  }

  /**
   * Setup logging middleware
   * Following Cline's logging patterns with ReadyAI enhancements
   */
  private setupLoggingMiddleware(): void {
    if (!this.config.logging.enableRequestLogging) return;

    // Morgan HTTP request logger with custom format
    const morganMiddleware = morgan(this.config.logging.logFormat, {
      stream: {
        write: (message: string) => {
          // Remove trailing newline and log through ReadyAI logger
          this.logger.info(message.trim(), 'http');
        },
      },
      skip: (req: Request, res: Response) => {
        // Skip logging for health checks in production
        if (this.config.environment === 'production') {
          return req.path === '/health' || req.path === '/metrics';
        }
        return false;
      },
    });

    this.registerMiddleware('morgan', morganMiddleware, true);

    // Custom request/response logging middleware
    const customLogMiddleware = (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();

      // Log request details in development
      if (this.config.environment === 'development') {
        this.logger.debug('Incoming request', 'app', {
          method: req.method,
          path: req.path,
          query: Object.keys(req.query).length > 0 ? req.query : undefined,
          headers: {
            userAgent: req.headers['user-agent'],
            contentType: req.headers['content-type'],
            contentLength: req.headers['content-length'],
          },
          correlationId: (req as any).correlationId,
          projectId: (req as any).projectId,
          phaseType: (req as any).phaseType,
        });
      }

      // Enhanced response logging
      const originalSend = res.send;
      res.send = function(body: any) {
        const duration = Date.now() - startTime;
        
        // Log response details
        const responseData: any = {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
          correlationId: (req as any).correlationId,
        };

        // Add additional data in development
        if (this.config.environment === 'development') {
          responseData.responseSize = body ? Buffer.byteLength(JSON.stringify(body)) : 0;
          responseData.gateway = (req as any).gateway;
        }

        // Log at appropriate level based on status code
        if (res.statusCode >= 500) {
          Logger.getInstance().error('Request completed with server error', 'app', responseData);
        } else if (res.statusCode >= 400) {
          Logger.getInstance().warn('Request completed with client error', 'app', responseData);
        } else {
          Logger.getInstance().info('Request completed successfully', 'app', responseData);
        }

        return originalSend.call(this, body);
      };

      next();
    };

    this.registerMiddleware('customLogging', customLogMiddleware, true);
  }

  /**
   * Setup health check routes
   * Following Cline's health monitoring patterns
   */
  private setupHealthRoutes(): void {
    if (!this.config.health.enabled) return;

    // Basic health check endpoint
    this.app.get(this.config.health.endpoint, (req: Request, res: Response) => {
      const healthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: this.config.environment,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        pid: process.pid,
      };

      const response: ApiResponse<any> = createApiResponse(healthData);
      res.json(response);
    });

    // Readiness probe
    this.app.get('/ready', (req: Request, res: Response) => {
      // Check if application is ready to serve requests
      const isReady = true; // Add your readiness checks here
      
      if (isReady) {
        const response: ApiResponse<any> = createApiResponse({
          status: 'ready',
          timestamp: new Date().toISOString(),
        });
        res.json(response);
      } else {
        const error: ApiErrorResponse = createApiError(
          'Application not ready',
          'NOT_READY',
          503
        );
        res.status(503).json(error);
      }
    });

    // Liveness probe
    this.app.get('/alive', (req: Request, res: Response) => {
      const response: ApiResponse<any> = createApiResponse({
        status: 'alive',
        timestamp: new Date().toISOString(),
        pid: process.pid,
      });
      res.json(response);
    });
  }

  /**
   * Setup comprehensive error handling middleware
   * Following Cline's error handling patterns with ReadyAI enhancements
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
          suggestion: 'Check the API documentation for available endpoints',
        }
      );

      this.logger.warn('Route not found', 'app', {
        method: req.method,
        path: req.path,
        correlationId: (req as any).correlationId,
        userAgent: req.headers['user-agent'],
        referer: req.headers['referer'],
      });

      res.status(404).json(error);
    });

    // Global error handler
    const errorHandler = (error: any, req: Request, res: Response, next: NextFunction) => {
      // Log the error
      this.logger.logError(error, 'app', {
        method: req.method,
        path: req.path,
        correlationId: (req as any).correlationId,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        body: this.config.environment === 'development' ? req.body : '[hidden]',
      });

      // Handle different types of errors
      let statusCode = 500;
      let apiError: ApiErrorResponse;

      if (error instanceof ReadyAIError) {
        // ReadyAI specific errors
        apiError = error.toApiErrorResponse();
        statusCode = error.statusCode || 500;
      } else if (error.name === 'ValidationError') {
        // Validation errors
        apiError = createApiError(
          error.message,
          'VALIDATION_ERROR',
          400,
          {
            field: error.field,
            value: error.value,
            constraints: error.constraints,
          }
        );
        statusCode = 400;
      } else if (error.name === 'SyntaxError' && error.message.includes('JSON')) {
        // JSON parsing errors
        apiError = createApiError(
          'Invalid JSON in request body',
          'INVALID_JSON',
          400,
          {
            details: error.message,
          }
        );
        statusCode = 400;
      } else if (error.code === 'EBADCSRFTOKEN') {
        // CSRF token errors
        apiError = createApiError(
          'Invalid CSRF token',
          'INVALID_CSRF_TOKEN',
          403
        );
        statusCode = 403;
      } else if (error.code === 'LIMIT_FILE_SIZE') {
        // File size limit errors
        apiError = createApiError(
          'File too large',
          'FILE_TOO_LARGE',
          413,
          {
            limit: error.limit,
            received: error.received,
          }
        );
        statusCode = 413;
      } else if (error.code === 'LIMIT_FIELD_COUNT') {
        // Too many fields error
        apiError = createApiError(
          'Too many fields in request',
          'TOO_MANY_FIELDS',
          413,
          {
            limit: error.limit,
          }
        );
        statusCode = 413;
      } else {
        // Generic server errors
        const isDevelopment = this.config.environment === 'development';
        apiError = createApiError(
          isDevelopment ? error.message : 'Internal server error',
          'INTERNAL_ERROR',
          500,
          isDevelopment ? {
            stack: error.stack,
            type: error.name,
          } : {
            correlationId: (req as any).correlationId,
          }
        );
        statusCode = 500;
      }

      // Set security headers even for errors
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');

      res.status(statusCode).json(apiError);
    };

    // Register error handler as the last middleware
    this.registerMiddleware('errorHandler', errorHandler as any, true);
  }

  /**
   * Register middleware with tracking and debugging capabilities
   * Following Cline's middleware registration patterns
   */
  private registerMiddleware(
    name: string,
    middleware: express.RequestHandler | express.ErrorRequestHandler,
    enabled: boolean,
    path?: string
  ): void {
    if (!enabled) {
      this.logger.debug(`Middleware '${name}' disabled`, 'app');
      return;
    }

    const middlewareInfo: MiddlewareInfo = {
      name,
      order: this.middlewareOrder++,
      enabled,
      path,
      registeredAt: new Date(),
      middleware,
    };

    this.middlewareRegistry.set(name, middlewareInfo);

    // Apply middleware to app
    if (path) {
      this.app.use(path, middleware as express.RequestHandler);
    } else {
      this.app.use(middleware as express.RequestHandler);
    }

    this.logger.debug(`Middleware '${name}' registered`, 'app', {
      order: middlewareInfo.order,
      path: path || 'global',
    });
  }

  /**
   * Get the configured Express application
   */
  public getApp(): Express {
    return this.app;
  }

  /**
   * Get application configuration
   */
  public getConfig(): AppConfig {
    return { ...this.config };
  }

  /**
   * Get registered middleware information
   */
  public getMiddlewareInfo(): MiddlewareInfo[] {
    return Array.from(this.middlewareRegistry.values()).sort((a, b) => a.order - b.order);
  }

  /**
   * Check if specific middleware is registered
   */
  public hasMiddleware(name: string): boolean {
    return this.middlewareRegistry.has(name);
  }

  /**
   * Set error service for enhanced error handling
   */
  public setErrorService(errorService: ErrorService): void {
    (this as any).errorService = errorService;
    this.logger.debug('Error service attached to app', 'app');
  }
}

/**
 * Factory function to create ReadyAI Express application
 * Following Cline's factory patterns
 */
export function createReadyAIApp(config?: Partial<AppConfig>): ReadyAIApp {
  return new ReadyAIApp(config);
}

/**
 * Default export - Create application with default configuration
 * Following Cline's export patterns
 */
export default function createApp(config?: Partial<AppConfig>): Express {
  const readyAIApp = new ReadyAIApp(config);
  return readyAIApp.getApp();
}

// Export types and classes for external use
export { AppConfig, MiddlewareInfo };
