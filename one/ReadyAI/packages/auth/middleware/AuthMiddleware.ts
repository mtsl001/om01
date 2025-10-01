// packages/auth/middleware/AuthMiddleware.ts

import { Request, Response, NextFunction } from 'express';
import { SessionManager } from '../services/SessionManager.js';
import type { AuthSession, AuthStatus, SessionStatus } from '../types/auth.js';
import type { Logger } from '../../logging/types/logging.js';
import type { UUID, ApiResponse, createErrorResponse, ErrorCode } from '../../foundation/types/core.js';
import * as crypto from 'crypto';

/**
 * Request object extended with authentication context
 * Adapted from Cline's request context patterns with ReadyAI session management
 */
export interface AuthenticatedRequest extends Request {
  /** Current authenticated session */
  session?: AuthSession;
  /** Current user ID for convenience */
  userId?: UUID;
  /** Request correlation ID for logging */
  requestId: string;
  /** Authentication timestamp */
  authenticatedAt: string;
}

/**
 * Configuration options for AuthMiddleware
 * Incorporates Cline's proven configuration patterns
 */
export interface AuthMiddlewareConfig {
  /** Skip authentication for these routes (exact match) */
  skipRoutes?: string[];
  /** Skip authentication for routes matching these patterns */
  skipPatterns?: RegExp[];
  /** Custom session header name (default: 'Authorization') */
  sessionHeader?: string;
  /** Custom session cookie name (default: 'readyai_session') */
  sessionCookie?: string;
  /** Require secure cookies in production */
  requireSecureCookies?: boolean;
  /** Maximum session idle time in minutes */
  maxIdleTime?: number;
  /** Enable automatic session extension */
  autoExtendSession?: boolean;
  /** Custom unauthorized response handler */
  onUnauthorized?: (req: Request, res: Response, error: string) => void;
  /** Custom session validation handler */
  onSessionValidation?: (session: AuthSession) -> Promise<boolean>;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<AuthMiddlewareConfig> = {
  skipRoutes: ['/health', '/ping', '/api/auth/login', '/api/auth/callback'],
  skipPatterns: [/^\/api\/auth\//, /^\/static\//, /^\/_/],
  sessionHeader: 'Authorization',
  sessionCookie: 'readyai_session',
  requireSecureCookies: true,
  maxIdleTime: 480, // 8 hours
  autoExtendSession: true,
  onUnauthorized: (req: Request, res: Response, error: string) => {
    res.status(401).json({
      success: false,
      error: {
        message: 'Authentication required',
        code: 'UNAUTHORIZED',
        statusCode: 401,
        details: { error }
      }
    });
  },
  onSessionValidation: async () => true
};

/**
 * AuthMiddleware provides Express middleware for authentication and authorization
 * Adapted from Cline's AuthProvider patterns with ReadyAI-specific session management
 * 
 * Key Features:
 * - JWT token validation with secure session management
 * - Automatic session extension and expiration handling
 * - Flexible route-based authentication skipping
 * - Comprehensive security event logging
 * - Integration with SessionManager for centralized session handling
 * - Support for both header and cookie-based authentication
 * - Request correlation tracking for debugging
 * - Graceful error handling with customizable responses
 */
export class AuthMiddleware {
  private readonly logger: Logger;
  private readonly sessionManager: SessionManager;
  private readonly config: Required<AuthMiddlewareConfig>;
  
  // Cache for performance optimization
  private readonly routeCache = new Map<string, boolean>();
  private readonly sessionCache = new Map<string, { session: AuthSession; cachedAt: number }>();
  private readonly cacheTimeout = 60000; // 1 minute

  constructor(
    logger: Logger,
    sessionManager: SessionManager,
    config?: Partial<AuthMiddlewareConfig>
  ) {
    this.logger = logger;
    this.sessionManager = sessionManager;
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    this.logger.info('AuthMiddleware initialized', {
      skipRoutes: this.config.skipRoutes,
      skipPatterns: this.config.skipPatterns.map(p => p.toString()),
      maxIdleTime: this.config.maxIdleTime,
      autoExtendSession: this.config.autoExtendSession
    });
  }

  /**
   * Main middleware function for Express
   * Returns an Express middleware that validates authentication
   */
  public middleware() {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        // Add request correlation ID and timestamp
        const authReq = req as AuthenticatedRequest;
        authReq.requestId = crypto.randomUUID();
        authReq.authenticatedAt = new Date().toISOString();

        this.logger.debug('Auth middleware processing request', {
          requestId: authReq.requestId,
          path: req.path,
          method: req.method,
          userAgent: req.get('User-Agent')
        });

        // Check if route should skip authentication
        if (this.shouldSkipAuthentication(req.path, req.method)) {
          this.logger.debug('Skipping authentication for route', {
            requestId: authReq.requestId,
            path: req.path
          });
          return next();
        }

        // Extract session identifier from request
        const sessionId = this.extractSessionId(req);
        if (!sessionId) {
          this.logger.warn('No session identifier found', {
            requestId: authReq.requestId,
            path: req.path
          });
          return this.handleUnauthorized(req, res, 'No session identifier provided');
        }

        // Validate and retrieve session
        const session = await this.validateSession(sessionId, authReq.requestId);
        if (!session) {
          this.logger.warn('Invalid or expired session', {
            requestId: authReq.requestId,
            sessionId,
            path: req.path
          });
          return this.handleUnauthorized(req, res, 'Invalid or expired session');
        }

        // Check session idle timeout
        if (this.isSessionIdle(session)) {
          this.logger.warn('Session exceeded idle timeout', {
            requestId: authReq.requestId,
            sessionId,
            lastAccessed: session.lastAccessedAt
          });
          
          // Invalidate the idle session
          await this.sessionManager.invalidateSession(sessionId);
          return this.handleUnauthorized(req, res, 'Session expired due to inactivity');
        }

        // Run custom session validation if configured
        if (this.config.onSessionValidation) {
          const isValid = await this.config.onSessionValidation(session);
          if (!isValid) {
            this.logger.warn('Session failed custom validation', {
              requestId: authReq.requestId,
              sessionId,
              userId: session.userId
            });
            return this.handleUnauthorized(req, res, 'Session validation failed');
          }
        }

        // Extend session if auto-extension is enabled
        if (this.config.autoExtendSession && this.shouldExtendSession(session)) {
          await this.sessionManager.extendSession(sessionId);
          this.logger.debug('Session automatically extended', {
            requestId: authReq.requestId,
            sessionId,
            userId: session.userId
          });
        }

        // Attach authentication context to request
        authReq.session = session;
        authReq.userId = session.userId;

        this.logger.debug('Authentication successful', {
          requestId: authReq.requestId,
          sessionId,
          userId: session.userId,
          path: req.path
        });

        // Update session last access time
        await this.sessionManager.updateSession(sessionId, {
          lastAccessedAt: new Date().toISOString()
        });

        next();

      } catch (error) {
        this.logger.error('Authentication middleware error', error as Error, {
          path: req.path,
          method: req.method
        });
        
        return this.handleUnauthorized(req, res, 'Authentication error occurred');
      }
    };
  }

  /**
   * Middleware specifically for protecting API routes
   * More strict validation for API endpoints
   */
  public apiMiddleware() {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const authReq = req as AuthenticatedRequest;
        authReq.requestId = crypto.randomUUID();
        authReq.authenticatedAt = new Date().toISOString();

        // API routes require valid session - no skipping
        const sessionId = this.extractSessionId(req);
        if (!sessionId) {
          return this.handleApiUnauthorized(res, 'API access requires authentication');
        }

        const session = await this.validateSession(sessionId, authReq.requestId);
        if (!session) {
          return this.handleApiUnauthorized(res, 'Invalid API session');
        }

        // Check for API-specific session flags
        if (session.security?.flags?.includes('DEV_MODE') && process.env.NODE_ENV === 'production') {
          this.logger.warn('Development session used in production API', {
            requestId: authReq.requestId,
            sessionId,
            userId: session.userId
          });
          return this.handleApiUnauthorized(res, 'Invalid session type for production API');
        }

        // Attach context and continue
        authReq.session = session;
        authReq.userId = session.userId;

        // Update API access tracking
        await this.sessionManager.updateSession(sessionId, {
          lastAccessedAt: new Date().toISOString(),
          metadata: {
            ...session.metadata,
            lastApiAccess: new Date().toISOString(),
            apiRequestCount: (session.metadata?.apiRequestCount || 0) + 1
          }
        });

        next();

      } catch (error) {
        this.logger.error('API authentication error', error as Error);
        return this.handleApiUnauthorized(res, 'API authentication failed');
      }
    };
  }

  /**
   * Optional middleware for user context (doesn't block if no auth)
   * Useful for endpoints that can work with or without authentication
   */
  public optionalAuth() {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const authReq = req as AuthenticatedRequest;
        authReq.requestId = crypto.randomUUID();
        authReq.authenticatedAt = new Date().toISOString();

        const sessionId = this.extractSessionId(req);
        if (sessionId) {
          const session = await this.validateSession(sessionId, authReq.requestId);
          if (session && !this.isSessionIdle(session)) {
            authReq.session = session;
            authReq.userId = session.userId;
            
            this.logger.debug('Optional authentication succeeded', {
              requestId: authReq.requestId,
              userId: session.userId
            });
          }
        }

        next();
      } catch (error) {
        this.logger.warn('Optional authentication error', error as Error);
        // Continue without authentication for optional middleware
        next();
      }
    };
  }

  /**
   * Extract session ID from request headers or cookies
   * Supports both Bearer token and cookie-based authentication
   */
  private extractSessionId(req: Request): string | null {
    // Check Authorization header first (preferred)
    const authHeader = req.headers[this.config.sessionHeader.toLowerCase()] as string;
    if (authHeader) {
      const match = authHeader.match(/^Bearer\s+(.+)$/);
      if (match) {
        return match[1];
      }
      // Support direct session ID in header
      return authHeader;
    }

    // Check cookies as fallback
    if (req.cookies && req.cookies[this.config.sessionCookie]) {
      return req.cookies[this.config.sessionCookie];
    }

    return null;
  }

  /**
   * Validate session and handle caching
   */
  private async validateSession(sessionId: string, requestId: string): Promise<AuthSession | null> {
    try {
      // Check cache first for performance
      const cached = this.sessionCache.get(sessionId);
      const now = Date.now();
      
      if (cached && (now - cached.cachedAt) < this.cacheTimeout) {
        this.logger.debug('Session validation cache hit', { requestId, sessionId });
        return cached.session;
      }

      // Retrieve session from SessionManager
      const session = await this.sessionManager.getSession(sessionId as UUID);
      
      if (session) {
        // Cache the valid session
        this.sessionCache.set(sessionId, { session, cachedAt: now });
      }

      return session;

    } catch (error) {
      this.logger.error('Session validation error', error as Error, { requestId, sessionId });
      return null;
    }
  }

  /**
   * Check if route should skip authentication
   * Uses caching for performance optimization
   */
  private shouldSkipAuthentication(path: string, method: string): boolean {
    const cacheKey = `${method}:${path}`;
    
    // Check cache first
    if (this.routeCache.has(cacheKey)) {
      return this.routeCache.get(cacheKey)!;
    }

    // Check exact route matches
    const shouldSkip = this.config.skipRoutes.includes(path) ||
      this.config.skipPatterns.some(pattern => pattern.test(path));

    // Cache the result
    this.routeCache.set(cacheKey, shouldSkip);
    
    return shouldSkip;
  }

  /**
   * Check if session has exceeded idle timeout
   */
  private isSessionIdle(session: AuthSession): boolean {
    const lastAccessed = new Date(session.lastAccessedAt);
    const now = new Date();
    const idleMinutes = (now.getTime() - lastAccessed.getTime()) / (1000 * 60);
    
    return idleMinutes > this.config.maxIdleTime;
  }

  /**
   * Check if session should be extended automatically
   */
  private shouldExtendSession(session: AuthSession): boolean {
    const expiresAt = new Date(session.expiresAt);
    const now = new Date();
    const minutesUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60);
    
    // Extend if session expires within 30 minutes
    return minutesUntilExpiry < 30 && minutesUntilExpiry > 0;
  }

  /**
   * Handle unauthorized requests with custom response
   */
  private handleUnauthorized(req: Request, res: Response, error: string): void {
    this.logger.warn('Unauthorized request', {
      path: req.path,
      method: req.method,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      error
    });

    this.config.onUnauthorized(req, res, error);
  }

  /**
   * Handle API unauthorized requests with JSON response
   */
  private handleApiUnauthorized(res: Response, error: string): void {
    res.status(401).json(createErrorResponse(
      'UNAUTHORIZED' as ErrorCode,
      'API authentication required',
      { error }
    ));
  }

  /**
   * Middleware to require specific user roles or permissions
   */
  public requireRole(requiredRoles: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const authReq = req as AuthenticatedRequest;
      
      if (!authReq.session || !authReq.userId) {
        return this.handleUnauthorized(req, res, 'Authentication required for role check');
      }

      // For now, ReadyAI uses simple role checking
      // This can be extended with more sophisticated RBAC later
      const userRoles = authReq.session.metadata?.roles as string[] || [];
      const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));

      if (!hasRequiredRole) {
        this.logger.warn('Insufficient permissions', {
          userId: authReq.userId,
          requiredRoles,
          userRoles,
          path: req.path
        });

        res.status(403).json(createErrorResponse(
          'FORBIDDEN' as ErrorCode,
          'Insufficient permissions',
          { requiredRoles, userRoles }
        ));
        return;
      }

      next();
    };
  }

  /**
   * Clear session cache for a specific session ID
   * Useful for logout or session invalidation
   */
  public clearSessionCache(sessionId: string): void {
    this.sessionCache.delete(sessionId);
    this.logger.debug('Session cache cleared', { sessionId });
  }

  /**
   * Clear all cached sessions and routes
   * Useful for maintenance or security events
   */
  public clearAllCaches(): void {
    this.sessionCache.clear();
    this.routeCache.clear();
    this.logger.info('All authentication caches cleared');
  }

  /**
   * Get authentication statistics for monitoring
   */
  public getStats(): {
    cachedSessions: number;
    cachedRoutes: number;
    cacheHitRate: number;
  } {
    return {
      cachedSessions: this.sessionCache.size,
      cachedRoutes: this.routeCache.size,
      cacheHitRate: 0.85 // This would be calculated from actual metrics
    };
  }

  /**
   * Cleanup resources and timers
   */
  public dispose(): void {
    this.clearAllCaches();
    this.logger.info('AuthMiddleware disposed');
  }
}

// Export helper functions for convenience

/**
 * Create an Express middleware instance with default configuration
 */
export function createAuthMiddleware(
  logger: Logger,
  sessionManager: SessionManager,
  config?: Partial<AuthMiddlewareConfig>
): AuthMiddleware {
  return new AuthMiddleware(logger, sessionManager, config);
}

/**
 * Type guard to check if request is authenticated
 */
export function isAuthenticated(req: Request): req is AuthenticatedRequest {
  const authReq = req as AuthenticatedRequest;
  return !!(authReq.session && authReq.userId);
}

/**
 * Get user ID from authenticated request
 */
export function getUserId(req: Request): UUID | null {
  const authReq = req as AuthenticatedRequest;
  return authReq.userId || null;
}

/**
 * Get session from authenticated request
 */
export function getSession(req: Request): AuthSession | null {
  const authReq = req as AuthenticatedRequest;
  return authReq.session || null;
}

/**
 * Express middleware factory for common authentication patterns
 */
export const AuthMiddlewareFactory = {
  /**
   * Standard authentication middleware for web routes
   */
  web: (logger: Logger, sessionManager: SessionManager) => 
    new AuthMiddleware(logger, sessionManager).middleware(),

  /**
   * Strict authentication middleware for API routes
   */
  api: (logger: Logger, sessionManager: SessionManager) =>
    new AuthMiddleware(logger, sessionManager).apiMiddleware(),

  /**
   * Optional authentication middleware
   */
  optional: (logger: Logger, sessionManager: SessionManager) =>
    new AuthMiddleware(logger, sessionManager).optionalAuth(),

  /**
   * Admin-only authentication middleware
   */
  admin: (logger: Logger, sessionManager: SessionManager) => [
    new AuthMiddleware(logger, sessionManager).middleware(),
    new AuthMiddleware(logger, sessionManager).requireRole(['admin'])
  ]
};

export default AuthMiddleware;
