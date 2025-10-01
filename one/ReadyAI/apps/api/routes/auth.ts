// apps/api/routes/auth.ts

import { Router } from 'express';
import { AuthController } from '@readyai/auth/controllers/AuthController.js';
import { AuthService } from '@readyai/auth/services/AuthService.js';
import { SessionManager } from '@readyai/auth/services/SessionManager.js';
import { TokenManager } from '@readyai/auth/services/TokenManager.js';
import { Logger } from '@readyai/logging/services/Logger.js';
import { authMiddleware, rateLimitMiddleware, corsMiddleware } from '../middleware/index.js';
import type { Request, Response, NextFunction } from 'express';

/**
 * Authentication routes for ReadyAI's Personal AI Development Orchestrator
 * 
 * Adapted from Cline's proven route patterns with ReadyAI-specific 
 * authentication requirements for local-first development environment.
 * 
 * Features:
 * - RESTful authentication endpoints
 * - Comprehensive error handling
 * - Rate limiting protection
 * - CORS middleware support
 * - Session management integration
 * - Production-ready security patterns
 * - Middleware composition following Cline's patterns
 */

/**
 * Factory function to create authentication routes with dependency injection
 * Following Cline's proven pattern of service composition
 */
export function createAuthRoutes(
  logger: Logger,
  authService: AuthService,
  sessionManager: SessionManager,
  tokenManager: TokenManager
): Router {
  const router = Router();
  
  // Create controller with injected dependencies
  const authController = new AuthController(
    logger,
    authService,
    sessionManager,
    tokenManager
  );

  // Apply global middleware following Cline's security patterns
  router.use(corsMiddleware);
  router.use(rateLimitMiddleware);

  // Authentication Routes
  
  /**
   * POST /auth/login
   * Authenticate user with provided credentials
   */
  router.post('/login', authController.login);

  /**
   * POST /auth/refresh
   * Refresh authentication token using refresh token
   */
  router.post('/refresh', authController.refreshToken);

  /**
   * POST /auth/logout
   * Logout current user and invalidate session
   */
  router.post('/logout', authController.logout);

  /**
   * GET /auth/session
   * Get current session information (requires authentication)
   */
  router.get('/session', authMiddleware, authController.getSession);

  /**
   * PUT /auth/session
   * Update current session information (requires authentication)
   */
  router.put('/session', authMiddleware, authController.updateSession);

  /**
   * GET /auth/status
   * Get current authentication status (public endpoint)
   */
  router.get('/status', authController.getStatus);

  /**
   * GET /auth/user/:userId
   * Get user profile by ID (requires authentication and proper permissions)
   */
  router.get('/user/:userId', authMiddleware, authController.getUser);

  /**
   * PUT /auth/user/:userId
   * Update user profile (requires authentication, self-only)
   */
  router.put('/user/:userId', authMiddleware, authController.updateUser);

  // Health check endpoint for authentication service
  router.get('/health', (req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      data: {
        service: 'auth',
        status: 'healthy',
        timestamp: new Date().toISOString()
      },
      message: 'Authentication service is healthy'
    });
  });

  // Error handling middleware (must be last)
  router.use((error: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error('Authentication route error', error, {
      method: req.method,
      path: req.path,
      userAgent: req.headers['user-agent']
    });

    // Don't leak error details in production
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: isDevelopment ? error.message : 'An error occurred processing your request',
      data: null
    });
  });

  logger.info('Authentication routes initialized', {
    routes: [
      'POST /auth/login',
      'POST /auth/refresh', 
      'POST /auth/logout',
      'GET /auth/session',
      'PUT /auth/session',
      'GET /auth/status',
      'GET /auth/user/:userId',
      'PUT /auth/user/:userId',
      'GET /auth/health'
    ]
  });

  return router;
}

/**
 * Default export following ReadyAI module patterns
 */
export default createAuthRoutes;

/**
 * Named exports for advanced usage patterns
 */
export { AuthController };
export type { Router as AuthRouter };

/**
 * Route configuration interface for external consumers
 */
export interface AuthRouteConfig {
  basePath: string;
  enableHealthCheck: boolean;
  enableRateLimit: boolean;
  enableCors: boolean;
}

/**
 * Advanced factory function with configuration options
 * Provides flexibility for different deployment scenarios
 */
export function createConfiguredAuthRoutes(
  logger: Logger,
  authService: AuthService,
  sessionManager: SessionManager,
  tokenManager: TokenManager,
  config: Partial<AuthRouteConfig> = {}
): Router {
  const defaultConfig: AuthRouteConfig = {
    basePath: '/auth',
    enableHealthCheck: true,
    enableRateLimit: true,
    enableCors: true
  };

  const finalConfig = { ...defaultConfig, ...config };
  const router = createAuthRoutes(logger, authService, sessionManager, tokenManager);

  logger.info('Configured authentication routes', {
    config: finalConfig,
    timestamp: new Date().toISOString()
  });

  return router;
}
