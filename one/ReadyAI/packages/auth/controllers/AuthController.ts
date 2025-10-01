// packages/auth/controllers/AuthController.ts

import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService.js';
import { SessionManager } from '../services/SessionManager.js';
import { TokenManager } from '../services/TokenManager.js';
import type { Logger } from '../../logging/types/logging.js';
import type { 
  UUID, 
  ApiResponse, 
  createApiResponse, 
  createErrorResponse, 
  ErrorCode 
} from '../../foundation/types/core.js';
import type {
  AnyAuthRequest,
  AuthResponse,
  TokenRefreshRequest,
  TokenRefreshResponse,
  AuthMethod,
  AuthStatus,
  AuthErrorCode,
  AuthenticationError,
  LocalSessionAuthRequest,
  ApiKeyAuthRequest,
  DevModeAuthRequest,
  UserProfile,
  AuthSession,
  AuthState
} from '../types/auth.js';
import * as crypto from 'crypto';

/**
 * AuthController provides HTTP endpoints for authentication and session management
 * in ReadyAI's Personal AI Development Orchestrator.
 * 
 * Adapted from Cline's proven controller patterns with ReadyAI-specific 
 * authentication requirements for local-first development environment.
 * 
 * Key Features:
 * - RESTful authentication endpoints
 * - Session lifecycle management
 * - Token-based authentication with refresh capabilities
 * - Multi-method authentication support
 * - Comprehensive error handling and validation
 * - Integration with AuthService, SessionManager, and TokenManager
 * - Production-ready request/response handling
 * - CORS and security headers support
 */
export class AuthController {
  private readonly logger: Logger;
  private readonly authService: AuthService;
  private readonly sessionManager: SessionManager;
  private readonly tokenManager: TokenManager;

  constructor(
    logger: Logger,
    authService: AuthService,
    sessionManager: SessionManager,
    tokenManager: TokenManager
  ) {
    this.logger = logger;
    this.authService = authService;
    this.sessionManager = sessionManager;
    this.tokenManager = tokenManager;

    this.logger.info('AuthController initialized');
  }

  /**
   * POST /auth/login
   * Authenticate user with provided credentials
   * Supports multiple authentication methods based on configuration
   */
  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = crypto.randomUUID() as UUID;
    
    try {
      this.logger.info('Authentication request received', { 
        requestId, 
        method: req.body?.method,
        userAgent: req.headers['user-agent']
      });

      // Validate request body
      if (!req.body || typeof req.body !== 'object') {
        const errorResponse = createErrorResponse(
          'Invalid request body',
          ErrorCode.VALIDATION_ERROR,
          400,
          { requestId }
        );
        res.status(400).json(errorResponse);
        return;
      }

      // Validate authentication method
      const { method } = req.body;
      if (!method || !Object.values(AuthMethod).includes(method)) {
        const errorResponse = createErrorResponse(
          'Authentication method is required and must be valid',
          ErrorCode.VALIDATION_ERROR,
          400,
          { requestId, providedMethod: method }
        );
        res.status(400).json(errorResponse);
        return;
      }

      // Build authentication request with client info
      const authRequest: AnyAuthRequest = {
        id: requestId,
        method,
        credentials: req.body.credentials || {},
        clientInfo: {
          userAgent: req.headers['user-agent'],
          platform: req.headers['x-platform'] as string || 'unknown',
          version: req.headers['x-client-version'] as string
        },
        timestamp: new Date().toISOString()
      };

      // Perform authentication
      const authResponse = await this.authService.authenticate(authRequest);

      // Handle authentication result
      if (authResponse.success && authResponse.session) {
        this.logger.info('Authentication successful', {
          requestId,
          userId: authResponse.session.userId,
          method: authRequest.method,
          sessionId: authResponse.session.id
        });

        // Set secure session cookie if session was created
        this.setSessionCookie(res, authResponse.session);

        const successResponse = createApiResponse(
          {
            sessionId: authResponse.session.id,
            user: authResponse.session.user,
            expiresAt: authResponse.session.expiresAt,
            accessToken: authResponse.session.accessToken?.value
          },
          'Authentication successful'
        );

        res.status(200).json(successResponse);
      } else {
        this.logger.warn('Authentication failed', {
          requestId,
          method: authRequest.method,
          error: authResponse.error
        });

        const statusCode = this.mapAuthErrorToStatusCode(authResponse.error?.code);
        const errorResponse = createErrorResponse(
          authResponse.error?.message || 'Authentication failed',
          authResponse.error?.code as ErrorCode || ErrorCode.AUTHENTICATION_ERROR,
          statusCode,
          { 
            requestId,
            retryable: authResponse.error?.retryable,
            retryAfter: authResponse.error?.retryAfter
          }
        );

        res.status(statusCode).json(errorResponse);
      }

    } catch (error) {
      this.logger.error('Authentication request failed', error as Error, { requestId });
      
      const authError = error instanceof AuthenticationError 
        ? error 
        : AuthenticationError.fromError(error as Error);

      const errorResponse = createErrorResponse(
        authError.message,
        authError.authErrorCode as ErrorCode,
        authError.statusCode,
        { requestId, retryable: authError.retryable }
      );

      res.status(authError.statusCode).json(errorResponse);
    }
  };

  /**
   * POST /auth/refresh
   * Refresh authentication token using refresh token
   */
  refreshToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = crypto.randomUUID() as UUID;
    
    try {
      this.logger.debug('Token refresh request received', { requestId });

      // Validate request body
      const { refreshToken } = req.body;
      if (!refreshToken || typeof refreshToken !== 'string') {
        const errorResponse = createErrorResponse(
          'Refresh token is required',
          ErrorCode.VALIDATION_ERROR,
          400,
          { requestId }
        );
        res.status(400).json(errorResponse);
        return;
      }

      const refreshRequest: TokenRefreshRequest = {
        refreshToken,
        scopes: req.body.scopes
      };

      // Perform token refresh
      const refreshResponse = await this.authService.refreshToken(refreshRequest);

      this.logger.info('Token refresh successful', { requestId });

      const successResponse = createApiResponse(
        {
          accessToken: refreshResponse.accessToken.value,
          expiresIn: refreshResponse.expiresIn,
          refreshToken: refreshResponse.refreshToken?.value
        },
        'Token refreshed successfully'
      );

      res.status(200).json(successResponse);

    } catch (error) {
      this.logger.error('Token refresh failed', error as Error, { requestId });
      
      const authError = error instanceof AuthenticationError 
        ? error 
        : AuthenticationError.fromError(error as Error, AuthErrorCode.TOKEN_EXPIRED);

      const errorResponse = createErrorResponse(
        authError.message,
        authError.authErrorCode as ErrorCode,
        authError.statusCode,
        { requestId }
      );

      res.status(authError.statusCode).json(errorResponse);
    }
  };

  /**
   * POST /auth/logout
   * Logout current user and invalidate session
   */
  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = crypto.randomUUID() as UUID;
    
    try {
      this.logger.info('Logout request received', { requestId });

      // Get session from cookie or header
      const sessionId = this.getSessionId(req);
      
      if (sessionId) {
        await this.authService.invalidateSession(sessionId);
        this.clearSessionCookie(res);
      }

      // Always return success for logout (idempotent operation)
      const successResponse = createApiResponse(
        { loggedOut: true },
        'Logout successful'
      );

      res.status(200).json(successResponse);

    } catch (error) {
      this.logger.error('Logout failed', error as Error, { requestId });
      
      // Even if logout fails, clear the cookie and return success
      this.clearSessionCookie(res);
      
      const successResponse = createApiResponse(
        { loggedOut: true },
        'Logout completed'
      );

      res.status(200).json(successResponse);
    }
  };

  /**
   * GET /auth/session
   * Get current session information
   */
  getSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = crypto.randomUUID() as UUID;
    
    try {
      const sessionId = this.getSessionId(req);
      
      if (!sessionId) {
        const errorResponse = createErrorResponse(
          'No active session',
          ErrorCode.AUTHENTICATION_ERROR,
          401,
          { requestId }
        );
        res.status(401).json(errorResponse);
        return;
      }

      const session = await this.authService.getSession(sessionId);
      
      if (!session) {
        this.clearSessionCookie(res);
        const errorResponse = createErrorResponse(
          'Session not found',
          ErrorCode.AUTHENTICATION_ERROR,
          401,
          { requestId }
        );
        res.status(401).json(errorResponse);
        return;
      }

      // Check if session is expired
      if (new Date(session.expiresAt) <= new Date()) {
        await this.authService.invalidateSession(sessionId);
        this.clearSessionCookie(res);
        
        const errorResponse = createErrorResponse(
          'Session expired',
          ErrorCode.SESSION_EXPIRED,
          401,
          { requestId }
        );
        res.status(401).json(errorResponse);
        return;
      }

      const successResponse = createApiResponse(
        {
          sessionId: session.id,
          user: session.user,
          status: session.status,
          expiresAt: session.expiresAt,
          lastAccessedAt: session.lastAccessedAt
        },
        'Session retrieved successfully'
      );

      res.status(200).json(successResponse);

    } catch (error) {
      this.logger.error('Get session failed', error as Error, { requestId });
      
      const errorResponse = createErrorResponse(
        'Failed to retrieve session',
        ErrorCode.INTERNAL_ERROR,
        500,
        { requestId }
      );

      res.status(500).json(errorResponse);
    }
  };

  /**
   * PUT /auth/session
   * Update current session information
   */
  updateSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = crypto.randomUUID() as UUID;
    
    try {
      const sessionId = this.getSessionId(req);
      
      if (!sessionId) {
        const errorResponse = createErrorResponse(
          'No active session',
          ErrorCode.AUTHENTICATION_ERROR,
          401,
          { requestId }
        );
        res.status(401).json(errorResponse);
        return;
      }

      // Validate update request
      const updates = req.body;
      if (!updates || typeof updates !== 'object') {
        const errorResponse = createErrorResponse(
          'Invalid update data',
          ErrorCode.VALIDATION_ERROR,
          400,
          { requestId }
        );
        res.status(400).json(errorResponse);
        return;
      }

      // Filter allowed updates (security measure)
      const allowedUpdates = {
        metadata: updates.metadata
      };

      await this.authService.updateSession(sessionId, allowedUpdates);

      const successResponse = createApiResponse(
        { updated: true },
        'Session updated successfully'
      );

      res.status(200).json(successResponse);

    } catch (error) {
      this.logger.error('Update session failed', error as Error, { requestId });
      
      const errorResponse = createErrorResponse(
        'Failed to update session',
        ErrorCode.INTERNAL_ERROR,
        500,
        { requestId }
      );

      res.status(500).json(errorResponse);
    }
  };

  /**
   * GET /auth/status
   * Get current authentication status
   */
  getStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = crypto.randomUUID() as UUID;
    
    try {
      const authState = this.authService.getCurrentAuthState();
      
      const successResponse = createApiResponse(
        {
          status: authState.status,
          authenticated: authState.status === AuthStatus.AUTHENTICATED,
          user: authState.user,
          lastUpdated: authState.lastUpdated,
          error: authState.error
        },
        'Authentication status retrieved'
      );

      res.status(200).json(successResponse);

    } catch (error) {
      this.logger.error('Get auth status failed', error as Error, { requestId });
      
      const errorResponse = createErrorResponse(
        'Failed to retrieve authentication status',
        ErrorCode.INTERNAL_ERROR,
        500,
        { requestId }
      );

      res.status(500).json(errorResponse);
    }
  };

  /**
   * GET /auth/user/:userId
   * Get user profile by ID (admin/self only)
   */
  getUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = crypto.randomUUID() as UUID;
    
    try {
      const { userId } = req.params;
      
      if (!userId) {
        const errorResponse = createErrorResponse(
          'User ID is required',
          ErrorCode.VALIDATION_ERROR,
          400,
          { requestId }
        );
        res.status(400).json(errorResponse);
        return;
      }

      // Check authorization (user can only access their own profile)
      const sessionId = this.getSessionId(req);
      if (sessionId) {
        const session = await this.authService.getSession(sessionId);
        if (session && session.userId !== userId) {
          // Check if user has admin permissions
          const hasPermission = await this.authService.checkPermission(
            session.userId, 
            'user', 
            'read'
          );
          
          if (!hasPermission) {
            const errorResponse = createErrorResponse(
              'Insufficient permissions',
              ErrorCode.FORBIDDEN,
              403,
              { requestId }
            );
            res.status(403).json(errorResponse);
            return;
          }
        }
      }

      const user = await this.authService.getUser(userId as UUID);
      
      if (!user) {
        const errorResponse = createErrorResponse(
          'User not found',
          ErrorCode.NOT_FOUND,
          404,
          { requestId }
        );
        res.status(404).json(errorResponse);
        return;
      }

      const successResponse = createApiResponse(
        { user },
        'User retrieved successfully'
      );

      res.status(200).json(successResponse);

    } catch (error) {
      this.logger.error('Get user failed', error as Error, { requestId });
      
      const errorResponse = createErrorResponse(
        'Failed to retrieve user',
        ErrorCode.INTERNAL_ERROR,
        500,
        { requestId }
      );

      res.status(500).json(errorResponse);
    }
  };

  /**
   * PUT /auth/user/:userId
   * Update user profile (self only)
   */
  updateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = crypto.randomUUID() as UUID;
    
    try {
      const { userId } = req.params;
      
      if (!userId) {
        const errorResponse = createErrorResponse(
          'User ID is required',
          ErrorCode.VALIDATION_ERROR,
          400,
          { requestId }
        );
        res.status(400).json(errorResponse);
        return;
      }

      // Check authorization (user can only update their own profile)
      const sessionId = this.getSessionId(req);
      if (!sessionId) {
        const errorResponse = createErrorResponse(
          'Authentication required',
          ErrorCode.AUTHENTICATION_ERROR,
          401,
          { requestId }
        );
        res.status(401).json(errorResponse);
        return;
      }

      const session = await this.authService.getSession(sessionId);
      if (!session || session.userId !== userId) {
        const errorResponse = createErrorResponse(
          'Can only update own profile',
          ErrorCode.FORBIDDEN,
          403,
          { requestId }
        );
        res.status(403).json(errorResponse);
        return;
      }

      // Validate update data
      const updates = req.body;
      if (!updates || typeof updates !== 'object') {
        const errorResponse = createErrorResponse(
          'Invalid update data',
          ErrorCode.VALIDATION_ERROR,
          400,
          { requestId }
        );
        res.status(400).json(errorResponse);
        return;
      }

      // Filter allowed updates (security measure)
      const allowedUpdates: Partial<UserProfile> = {
        displayName: updates.displayName,
        preferences: updates.preferences
      };

      await this.authService.updateUser(userId as UUID, allowedUpdates);

      const successResponse = createApiResponse(
        { updated: true },
        'User updated successfully'
      );

      res.status(200).json(successResponse);

    } catch (error) {
      this.logger.error('Update user failed', error as Error, { requestId });
      
      const errorResponse = createErrorResponse(
        'Failed to update user',
        ErrorCode.INTERNAL_ERROR,
        500,
        { requestId }
      );

      res.status(500).json(errorResponse);
    }
  };

  /**
   * Private helper methods
   */

  /**
   * Get session ID from request (cookie or header)
   */
  private getSessionId(req: Request): UUID | null {
    // Try cookie first
    const cookieSessionId = req.cookies?.['readyai-session-id'];
    if (cookieSessionId) {
      return cookieSessionId as UUID;
    }

    // Try Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7) as UUID;
    }

    // Try custom header
    const customHeader = req.headers['x-session-id'];
    if (customHeader && typeof customHeader === 'string') {
      return customHeader as UUID;
    }

    return null;
  }

  /**
   * Set secure session cookie
   */
  private setSessionCookie(res: Response, session: AuthSession): void {
    const isProduction = process.env.NODE_ENV === 'production';
    
    res.cookie('readyai-session-id', session.id, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: new Date(session.expiresAt).getTime() - Date.now(),
      path: '/'
    });
  }

  /**
   * Clear session cookie
   */
  private clearSessionCookie(res: Response): void {
    res.clearCookie('readyai-session-id', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });
  }

  /**
   * Map authentication error codes to HTTP status codes
   */
  private mapAuthErrorToStatusCode(errorCode?: AuthErrorCode): number {
    if (!errorCode) return 500;
    
    switch (errorCode) {
      case AuthErrorCode.INVALID_CREDENTIALS:
      case AuthErrorCode.USER_NOT_FOUND:
      case AuthErrorCode.INVALID_TOKEN:
      case AuthErrorCode.TOKEN_EXPIRED:
      case AuthErrorCode.SESSION_EXPIRED:
        return 401;
      
      case AuthErrorCode.ACCOUNT_DISABLED:
      case AuthErrorCode.INSUFFICIENT_PERMISSIONS:
      case AuthErrorCode.MFA_REQUIRED:
      case AuthErrorCode.VERIFICATION_REQUIRED:
        return 403;
      
      case AuthErrorCode.RATE_LIMITED:
        return 429;
      
      case AuthErrorCode.INVALID_AUTH_METHOD:
      case AuthErrorCode.INVALID_MFA_CODE:
        return 400;
      
      case AuthErrorCode.SERVICE_UNAVAILABLE:
        return 503;
      
      case AuthErrorCode.AUTH_ERROR:
      default:
        return 500;
    }
  }
}

// Export factory function for convenience
export function createAuthController(
  logger: Logger,
  authService: AuthService,
  sessionManager: SessionManager,
  tokenManager: TokenManager
): AuthController {
  return new AuthController(logger, authService, sessionManager, tokenManager);
}

export default AuthController;
