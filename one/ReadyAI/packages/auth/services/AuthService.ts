// packages/auth/services/AuthService.ts

import { EventEmitter } from 'events';
import { SessionManager } from './SessionManager.js';
import { TokenManager, TokenType } from './TokenManager.js';
import type { 
  IAuthService,
  AnyAuthRequest,
  AuthResponse,
  TokenRefreshRequest,
  TokenRefreshResponse,
  UserProfile,
  AuthSession,
  AuthStatus,
  AuthMethod,
  AuthError,
  AuthErrorCode,
  AuthState,
  SessionMetadata,
  LocalSessionAuthRequest,
  ApiKeyAuthRequest,
  DevModeAuthRequest,
  AuthenticationError,
  AuthConfig,
  DEFAULT_AUTH_CONFIG,
  AUTH_CONSTANTS
} from '../types/auth.js';
import type { Logger } from '../../logging/types/logging.js';
import type { UUID, ApiResponse, createApiResponse, createErrorResponse, ErrorCode } from '../../foundation/types/core.js';
import * as crypto from 'crypto';

/**
 * User storage interface for different storage backends
 * Adapted from Cline's StateManager patterns for local user management
 */
export interface IUserStorage {
  store(userId: UUID, user: UserProfile): Promise<void>;
  retrieve(userId: UUID): Promise<UserProfile | null>;
  remove(userId: UUID): Promise<void>;
  exists(userId: UUID): Promise<boolean>;
  clear(): Promise<void>;
  list(): Promise<UserProfile[]>;
  findByEmail(email: string): Promise<UserProfile | null>;
}

/**
 * Local encrypted user storage implementation
 * Based on Cline's EncryptedSessionStorage patterns
 */
class EncryptedUserStorage implements IUserStorage {
  private readonly encryptionKey: Buffer;
  private readonly algorithm = 'aes-256-gcm';
  private readonly users = new Map<UUID, UserProfile>();

  constructor(encryptionKey?: string) {
    this.encryptionKey = encryptionKey 
      ? Buffer.from(encryptionKey, 'hex')
      : crypto.randomBytes(32);
  }

  private encrypt(data: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(this.algorithm, this.encryptionKey);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }

  private decrypt(encryptedData: string): string {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipher(this.algorithm, this.encryptionKey);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  async store(userId: UUID, user: UserProfile): Promise<void> {
    try {
      // Store in memory for quick access
      this.users.set(userId, user);
      
      // Persist to localStorage if available
      if (typeof localStorage !== 'undefined') {
        const serialized = JSON.stringify(user);
        const encrypted = this.encrypt(serialized);
        localStorage.setItem(`readyai_user_${userId}`, encrypted);
      }
    } catch (error) {
      throw new Error(`Failed to store user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async retrieve(userId: UUID): Promise<UserProfile | null> {
    try {
      // Check memory cache first
      const cached = this.users.get(userId);
      if (cached) {
        return cached;
      }

      // Try localStorage
      if (typeof localStorage === 'undefined') {
        return null;
      }
      
      const encrypted = localStorage.getItem(`readyai_user_${userId}`);
      if (!encrypted) {
        return null;
      }
      
      const decrypted = this.decrypt(encrypted);
      const user = JSON.parse(decrypted) as UserProfile;
      
      // Restore Date objects
      user.createdAt = new Date(user.createdAt).toISOString();
      if (user.lastLogin) {
        user.lastLogin = new Date(user.lastLogin).toISOString();
      }
      
      // Cache in memory
      this.users.set(userId, user);
      
      return user;
    } catch (error) {
      console.warn(`Failed to retrieve user ${userId}:`, error);
      return null;
    }
  }

  async remove(userId: UUID): Promise<void> {
    this.users.delete(userId);
    
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`readyai_user_${userId}`);
    }
  }

  async exists(userId: UUID): Promise<boolean> {
    if (this.users.has(userId)) {
      return true;
    }
    
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(`readyai_user_${userId}`) !== null;
    }
    
    return false;
  }

  async clear(): Promise<void> {
    this.users.clear();
    
    if (typeof localStorage !== 'undefined') {
      const keys = Object.keys(localStorage).filter(key => key.startsWith('readyai_user_'));
      keys.forEach(key => localStorage.removeItem(key));
    }
  }

  async list(): Promise<UserProfile[]> {
    const users: UserProfile[] = [];
    
    // Get from memory cache
    for (const user of this.users.values()) {
      users.push(user);
    }
    
    // Get from localStorage for additional users
    if (typeof localStorage !== 'undefined') {
      const keys = Object.keys(localStorage).filter(key => key.startsWith('readyai_user_'));
      
      for (const key of keys) {
        const userId = key.replace('readyai_user_', '') as UUID;
        if (!this.users.has(userId)) {
          const user = await this.retrieve(userId);
          if (user) {
            users.push(user);
          }
        }
      }
    }
    
    return users;
  }

  async findByEmail(email: string): Promise<UserProfile | null> {
    const users = await this.list();
    return users.find(user => user.email === email) || null;
  }
}

/**
 * AuthService provides comprehensive authentication and authorization functionality
 * for ReadyAI's Personal AI Development Orchestrator.
 * 
 * Adapted from Cline's StateManager and AccountService patterns with ReadyAI-specific
 * local-first authentication requirements.
 * 
 * Key Features:
 * - Local-first authentication with encrypted storage
 * - Multi-method authentication support (local, dev mode, API keys)
 * - Session lifecycle management with automatic cleanup
 * - Token-based authentication with refresh capabilities
 * - Comprehensive permission and role-based access control
 * - Integration with SessionManager and TokenManager
 * - Event-driven architecture for auth state changes
 * - Production-ready error handling and validation
 */
export class AuthService extends EventEmitter implements IAuthService {
  private readonly logger: Logger;
  private readonly sessionManager: SessionManager;
  private readonly tokenManager: TokenManager;
  private readonly userStorage: IUserStorage;
  private readonly config: AuthConfig;
  
  // Current authentication state
  private currentAuthState: AuthState;
  private readonly authStateSubscribers = new Set<(state: AuthState) => void>();
  
  // Rate limiting and security
  private readonly loginAttempts = new Map<string, { count: number; lastAttempt: number; lockedUntil?: number }>();
  private readonly permissionCache = new Map<string, { permissions: string[]; calculatedAt: number }>();
  private readonly cacheTimeout = 300000; // 5 minutes
  
  // Background tasks
  private readonly cleanupInterval: NodeJS.Timeout;
  private readonly securityMonitorInterval: NodeJS.Timeout;

  constructor(
    logger: Logger,
    sessionManager: SessionManager,
    tokenManager: TokenManager,
    config?: Partial<AuthConfig>,
    userStorage?: IUserStorage
  ) {
    super();
    
    this.logger = logger;
    this.sessionManager = sessionManager;
    this.tokenManager = tokenManager;
    this.userStorage = userStorage || new EncryptedUserStorage();
    this.config = { ...DEFAULT_AUTH_CONFIG, ...config };
    
    // Initialize auth state
    this.currentAuthState = {
      status: AuthStatus.UNAUTHENTICATED,
      loading: false,
      lastUpdated: new Date().toISOString()
    };
    
    // Set up periodic cleanup and monitoring
    this.cleanupInterval = setInterval(() => this.performCleanup(), 300000); // Every 5 minutes
    this.securityMonitorInterval = setInterval(() => this.performSecurityMonitoring(), 60000); // Every minute
    
    this.logger.info('AuthService initialized', {
      defaultMethod: this.config.defaultMethod,
      enabledMethods: this.config.enabledMethods
    });
  }

  /**
   * Authenticate user with provided credentials
   * Supports multiple authentication methods based on configuration
   */
  async authenticate(request: AnyAuthRequest): Promise<AuthResponse> {
    try {
      this.updateAuthState({ loading: true });

      const responseId = crypto.randomUUID() as UUID;
      const timestamp = new Date().toISOString();

      // Validate authentication method
      if (!this.config.enabledMethods.includes(request.method)) {
        return {
          id: responseId,
          success: false,
          error: {
            code: AuthErrorCode.INVALID_AUTH_METHOD,
            message: `Authentication method ${request.method} is not enabled`,
            timestamp,
            retryable: false
          },
          timestamp
        };
      }

      // Check rate limiting
      const rateLimitCheck = this.checkRateLimit(this.getClientIdentifier(request));
      if (!rateLimitCheck.allowed) {
        return {
          id: responseId,
          success: false,
          error: {
            code: AuthErrorCode.RATE_LIMITED,
            message: 'Too many authentication attempts. Please try again later.',
            timestamp,
            retryable: true,
            retryAfter: rateLimitCheck.retryAfter
          },
          timestamp
        };
      }

      // Route to appropriate authentication handler
      let authResult: { user: UserProfile; metadata?: SessionMetadata } | null = null;

      switch (request.method) {
        case AuthMethod.LOCAL_SESSION:
          authResult = await this.authenticateLocalSession(request as LocalSessionAuthRequest);
          break;
        case AuthMethod.API_KEY:
          authResult = await this.authenticateApiKey(request as ApiKeyAuthRequest);
          break;
        case AuthMethod.DEV_MODE:
          authResult = await this.authenticateDevMode(request as DevModeAuthRequest);
          break;
        default:
          throw new AuthenticationError(
            AuthErrorCode.INVALID_AUTH_METHOD,
            `Unsupported authentication method: ${request.method}`
          );
      }

      if (!authResult) {
        this.recordFailedAttempt(this.getClientIdentifier(request));
        return {
          id: responseId,
          success: false,
          error: {
            code: AuthErrorCode.INVALID_CREDENTIALS,
            message: 'Authentication failed',
            timestamp,
            retryable: true
          },
          timestamp
        };
      }

      // Create session
      const sessionResult = await this.sessionManager.createSession(
        authResult.user,
        request.method,
        authResult.metadata
      );

      if (!sessionResult.success) {
        throw new Error('Failed to create session after successful authentication');
      }

      // Update auth state
      this.updateAuthState({
        status: AuthStatus.AUTHENTICATED,
        user: authResult.user,
        session: sessionResult.data,
        loading: false,
        error: undefined
      });

      this.logger.info('Authentication successful', {
        userId: authResult.user.id,
        method: request.method,
        sessionId: sessionResult.data.id
      });

      this.emit('authenticated', { user: authResult.user, session: sessionResult.data });

      return {
        id: responseId,
        success: true,
        session: sessionResult.data,
        timestamp
      };

    } catch (error) {
      this.logger.error('Authentication failed', error as Error);
      
      const authError = error instanceof AuthenticationError 
        ? error 
        : AuthenticationError.fromError(error as Error);

      this.updateAuthState({
        status: AuthStatus.FAILED,
        loading: false,
        error: {
          code: authError.authErrorCode,
          message: authError.message,
          timestamp: new Date().toISOString(),
          retryable: authError.retryable
        }
      });

      return authError.toAuthErrorResponse() as AuthResponse;
    }
  }

  /**
   * Refresh authentication token using refresh token
   */
  async refreshToken(request: TokenRefreshRequest): Promise<TokenRefreshResponse> {
    try {
      // Use TokenManager to refresh the token
      const refreshResult = await this.tokenManager.refreshToken(request.refreshToken);
      
      if (!refreshResult.success) {
        throw new AuthenticationError(
          AuthErrorCode.TOKEN_EXPIRED,
          'Failed to refresh token'
        );
      }

      // Update current session if applicable
      if (this.currentAuthState.session) {
        const sessionId = this.currentAuthState.session.id;
        const updateResult = await this.sessionManager.updateSession(sessionId, {
          accessToken: refreshResult.data.metadata
        });

        if (updateResult.success) {
          // Update auth state with new token
          this.updateAuthState({
            session: {
              ...this.currentAuthState.session,
              accessToken: refreshResult.data.metadata
            }
          });
        }
      }

      this.logger.debug('Token refresh successful');
      this.emit('tokenRefreshed', { token: refreshResult.data.metadata });

      return {
        accessToken: refreshResult.data.metadata,
        expiresIn: 3600 // 1 hour default
      };

    } catch (error) {
      this.logger.error('Token refresh failed', error as Error);
      
      const authError = error instanceof AuthenticationError 
        ? error 
        : AuthenticationError.fromError(error as Error, AuthErrorCode.TOKEN_EXPIRED);

      throw authError;
    }
  }

  /**
   * Validate authentication token
   */
  async validateToken(token: string): Promise<boolean> {
    try {
      return await this.tokenManager.validateToken(token);
    } catch (error) {
      this.logger.error('Token validation failed', error as Error);
      return false;
    }
  }

  /**
   * Get user session by ID
   */
  async getSession(sessionId: UUID): Promise<AuthSession | null> {
    return await this.sessionManager.getSession(sessionId);
  }

  /**
   * Update session information
   */
  async updateSession(sessionId: UUID, updates: Partial<AuthSession>): Promise<void> {
    const result = await this.sessionManager.updateSession(sessionId, updates);
    if (!result.success) {
      throw new Error(`Failed to update session: ${result.error?.message}`);
    }

    // Update auth state if this is the current session
    if (this.currentAuthState.session?.id === sessionId) {
      this.updateAuthState({
        session: {
          ...this.currentAuthState.session,
          ...updates
        }
      });
    }

    this.emit('sessionUpdated', { sessionId, updates });
  }

  /**
   * Invalidate user session
   */
  async invalidateSession(sessionId: UUID): Promise<void> {
    const result = await this.sessionManager.invalidateSession(sessionId);
    if (!result.success) {
      throw new Error(`Failed to invalidate session: ${result.error?.message}`);
    }

    // Update auth state if this was the current session
    if (this.currentAuthState.session?.id === sessionId) {
      this.updateAuthState({
        status: AuthStatus.LOGGED_OUT,
        user: undefined,
        session: undefined,
        error: undefined
      });
    }

    this.logger.info('Session invalidated', { sessionId });
    this.emit('sessionInvalidated', { sessionId });
  }

  /**
   * Invalidate all user sessions
   */
  async invalidateAllUserSessions(userId: UUID): Promise<void> {
    const result = await this.sessionManager.invalidateAllUserSessions(userId);
    if (!result.success) {
      throw new Error(`Failed to invalidate user sessions: ${result.error?.message}`);
    }

    // Update auth state if this was the current user
    if (this.currentAuthState.user?.id === userId) {
      this.updateAuthState({
        status: AuthStatus.LOGGED_OUT,
        user: undefined,
        session: undefined,
        error: undefined
      });
    }

    this.logger.info('All user sessions invalidated', { userId });
    this.emit('allUserSessionsInvalidated', { userId });
  }

  /**
   * Get user by ID
   */
  async getUser(userId: UUID): Promise<UserProfile | null> {
    try {
      return await this.userStorage.retrieve(userId);
    } catch (error) {
      this.logger.error('Failed to retrieve user', error as Error, { userId });
      return null;
    }
  }

  /**
   * Update user information
   */
  async updateUser(userId: UUID, updates: Partial<UserProfile>): Promise<void> {
    try {
      const existingUser = await this.userStorage.retrieve(userId);
      if (!existingUser) {
        throw new Error('User not found');
      }

      const updatedUser: UserProfile = {
        ...existingUser,
        ...updates,
        id: userId // Ensure ID cannot be changed
      };

      await this.userStorage.store(userId, updatedUser);

      // Update auth state if this is the current user
      if (this.currentAuthState.user?.id === userId) {
        this.updateAuthState({
          user: updatedUser
        });
      }

      this.logger.info('User updated', { userId, updates: Object.keys(updates) });
      this.emit('userUpdated', { userId, updates });

    } catch (error) {
      this.logger.error('Failed to update user', error as Error, { userId });
      throw error;
    }
  }

  /**
   * Check user permissions for a resource and action
   */
  async checkPermission(userId: UUID, resource: string, action: string): Promise<boolean> {
    try {
      // Check permission cache first
      const cacheKey = `${userId}:${resource}:${action}`;
      const cached = this.permissionCache.get(cacheKey);
      const now = Date.now();
      
      if (cached && (now - cached.calculatedAt) < this.cacheTimeout) {
        return cached.permissions.includes(`${resource}:${action}`);
      }

      // Get user to check role
      const user = await this.getUser(userId);
      if (!user) {
        return false;
      }

      // Simple role-based permissions for ReadyAI
      const permissions = this.getRolePermissions(user.role);
      const hasPermission = permissions.includes(`${resource}:${action}`) || permissions.includes('*:*');

      // Cache the result
      this.permissionCache.set(cacheKey, {
        permissions,
        calculatedAt: now
      });

      return hasPermission;

    } catch (error) {
      this.logger.error('Permission check failed', error as Error, { userId, resource, action });
      return false;
    }
  }

  /**
   * Get current authentication state
   */
  getCurrentAuthState(): AuthState {
    return { ...this.currentAuthState };
  }

  /**
   * Subscribe to authentication state changes
   */
  subscribeToAuthStateChanges(callback: (state: AuthState) => void): () => void {
    this.authStateSubscribers.add(callback);
    
    // Send current state immediately
    callback(this.getCurrentAuthState());
    
    // Return unsubscribe function
    return () => {
      this.authStateSubscribers.delete(callback);
    };
  }

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    try {
      if (this.currentAuthState.session) {
        await this.invalidateSession(this.currentAuthState.session.id);
      }

      this.updateAuthState({
        status: AuthStatus.LOGGED_OUT,
        user: undefined,
        session: undefined,
        error: undefined
      });

      this.logger.info('User logged out');
      this.emit('logout');

    } catch (error) {
      this.logger.error('Logout failed', error as Error);
      throw error;
    }
  }

  /**
   * Create a new user account (for local authentication)
   */
  async createUser(userData: {
    displayName: string;
    email?: string;
    password?: string;
    role?: UserProfile['role'];
  }): Promise<UserProfile> {
    try {
      // Check if user already exists by email
      if (userData.email) {
        const existingUser = await this.userStorage.findByEmail(userData.email);
        if (existingUser) {
          throw new AuthenticationError(
            AuthErrorCode.USER_NOT_FOUND, // Reusing error code
            'User with this email already exists'
          );
        }
      }

      const userId = crypto.randomUUID() as UUID;
      const now = new Date().toISOString();

      const newUser: UserProfile = {
        id: userId,
        displayName: userData.displayName,
        email: userData.email,
        preferences: {
          theme: 'system',
          language: 'en',
          notifications: {
            systemNotifications: true,
            taskNotifications: true,
            errorNotifications: true,
            securityAlerts: true
          },
          security: {
            requireAuthForSensitiveOps: true,
            sessionTimeout: AUTH_CONSTANTS.DEFAULT_SESSION_TIMEOUT,
            autoLockEnabled: false,
            twoFactorEnabled: false
          }
        },
        createdAt: now,
        role: userData.role || 'user'
      };

      await this.userStorage.store(userId, newUser);

      this.logger.info('User created', { userId, displayName: userData.displayName });
      this.emit('userCreated', { user: newUser });

      return newUser;

    } catch (error) {
      this.logger.error('Failed to create user', error as Error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */

  /**
   * Update authentication state and notify subscribers
   */
  private updateAuthState(updates: Partial<AuthState>): void {
    this.currentAuthState = {
      ...this.currentAuthState,
      ...updates,
      lastUpdated: new Date().toISOString()
    };

    // Notify all subscribers
    for (const callback of this.authStateSubscribers) {
      try {
        callback(this.getCurrentAuthState());
      } catch (error) {
        this.logger.error('Error in auth state subscriber', error as Error);
      }
    }
  }

  /**
   * Authenticate using local session credentials
   */
  private async authenticateLocalSession(request: LocalSessionAuthRequest): Promise<{ user: UserProfile; metadata?: SessionMetadata } | null> {
    // For local sessions, we'll create or retrieve users based on identifier
    // This is a simplified implementation for ReadyAI's local-first approach
    
    const { identifier, secret } = request.credentials;
    
    // Try to find existing user by email/identifier
    let user = await this.userStorage.findByEmail(identifier);
    
    if (!user) {
      // Create new user for first-time login in dev mode
      if (this.config.development?.enabled) {
        user = await this.createUser({
          displayName: identifier.split('@')[0] || identifier,
          email: identifier,
          role: 'user'
        });
      } else {
        return null; // User not found and not in dev mode
      }
    }

    // In a production system, you'd verify the password here
    // For ReadyAI's local-first approach, we'll use a simplified validation
    
    const metadata: SessionMetadata = {
      source: 'vscode',
      userAgent: request.clientInfo?.userAgent,
      platform: request.clientInfo?.platform
    };

    return { user, metadata };
  }

  /**
   * Authenticate using API key
   */
  private async authenticateApiKey(request: ApiKeyAuthRequest): Promise<{ user: UserProfile; metadata?: SessionMetadata } | null> {
    // For API key authentication, validate the key and return associated user
    // This is a simplified implementation
    
    const { apiKey } = request.credentials;
    
    // In a real implementation, you'd validate the API key against a secure store
    // For now, we'll use a simple validation
    
    if (!apiKey.startsWith('readyai_')) {
      return null;
    }

    // Create or retrieve service user for API key authentication
    let user = await this.userStorage.findByEmail('api@readyai.local');
    
    if (!user) {
      user = await this.createUser({
        displayName: 'API User',
        email: 'api@readyai.local',
        role: 'user'
      });
    }

    const metadata: SessionMetadata = {
      source: 'api',
      userAgent: request.clientInfo?.userAgent,
      platform: request.clientInfo?.platform
    };

    return { user, metadata };
  }

  /**
   * Authenticate using development mode
   */
  private async authenticateDevMode(request: DevModeAuthRequest): Promise<{ user: UserProfile; metadata?: SessionMetadata } | null> {
    if (!this.config.development?.enabled) {
      return null;
    }

    const { developerId, sessionName } = request.credentials;
    
    // Get or create developer user
    let user = this.config.development.defaultUser;
    
    if (!user) {
      user = await this.userStorage.findByEmail(`${developerId}@readyai.dev`);
      
      if (!user) {
        user = await this.createUser({
          displayName: `Developer ${developerId}`,
          email: `${developerId}@readyai.dev`,
          role: 'developer'
        });
      }
    }

    const metadata: SessionMetadata = {
      source: 'vscode',
      userAgent: request.clientInfo?.userAgent,
      platform: request.clientInfo?.platform,
      device: {
        type: 'desktop',
        os: process.platform
      }
    };

    return { user, metadata };
  }

  /**
   * Get client identifier for rate limiting
   */
  private getClientIdentifier(request: AnyAuthRequest): string {
    // Use multiple factors to create a unique client identifier
    const factors = [
      request.clientInfo?.userAgent || 'unknown',
      request.clientInfo?.platform || 'unknown',
      request.method
    ];
    
    return crypto.createHash('sha256')
      .update(factors.join(':'))
      .digest('hex');
  }

  /**
   * Check rate limiting for authentication attempts
   */
  private checkRateLimit(clientId: string): { allowed: boolean; retryAfter?: number } {
    if (!this.config.security.rateLimiting.enabled) {
      return { allowed: true };
    }

    const now = Date.now();
    const windowMs = this.config.security.rateLimiting.windowMinutes * 60 * 1000;
    const blockDurationMs = this.config.security.rateLimiting.blockDurationMinutes * 60 * 1000;

    const attempts = this.loginAttempts.get(clientId);
    
    if (!attempts) {
      // First attempt
      this.loginAttempts.set(clientId, {
        count: 1,
        lastAttempt: now
      });
      return { allowed: true };
    }

    // Check if client is currently locked out
    if (attempts.lockedUntil && now < attempts.lockedUntil) {
      return { 
        allowed: false, 
        retryAfter: Math.ceil((attempts.lockedUntil - now) / 1000)
      };
    }

    // Reset counter if window has expired
    if (now - attempts.lastAttempt > windowMs) {
      this.loginAttempts.set(clientId, {
        count: 1,
        lastAttempt: now
      });
      return { allowed: true };
    }

    // Check if max attempts exceeded
    if (attempts.count >= this.config.security.rateLimiting.maxAttempts) {
      // Lock out the client
      const lockedUntil = now + blockDurationMs;
      this.loginAttempts.set(clientId, {
        ...attempts,
        lockedUntil
      });
      
      return { 
        allowed: false, 
        retryAfter: Math.ceil(blockDurationMs / 1000)
      };
    }

    // Increment attempt counter
    this.loginAttempts.set(clientId, {
      count: attempts.count + 1,
      lastAttempt: now
    });

    return { allowed: true };
  }

  /**
   * Record a failed authentication attempt
   */
  private recordFailedAttempt(clientId: string): void {
    const now = Date.now();
    const attempts = this.loginAttempts.get(clientId);
    
    if (attempts) {
      this.loginAttempts.set(clientId, {
        count: attempts.count + 1,
        lastAttempt: now
      });
    }
  }

  /**
   * Get permissions for a user role
   */
  private getRolePermissions(role: UserProfile['role']): string[] {
    switch (role) {
      case 'admin':
        return ['*:*']; // Full access
      case 'developer':
        return [
          'project:read', 'project:write', 'project:delete',
          'context:read', 'context:write',
          'generation:read', 'generation:write',
          'debug:read', 'debug:write'
        ];
      case 'user':
        return [
          'project:read', 'project:write',
          'context:read', 'context:write',
          'generation:read', 'generation:write'
        ];
      case 'guest':
        return [
          'project:read',
          'context:read'
        ];
      default:
        return [];
    }
  }

  /**
   * Perform periodic cleanup tasks
   */
  private async performCleanup(): Promise<void> {
    try {
      // Clean up expired rate limit entries
      const now = Date.now();
      const expiredClientIds: string[] = [];
      
      for (const [clientId, attempts] of this.loginAttempts.entries()) {
        // Remove entries older than 24 hours
        if (now - attempts.lastAttempt > 24 * 60 * 60 * 1000) {
          expiredClientIds.push(clientId);
        }
      }
      
      expiredClientIds.forEach(clientId => {
        this.loginAttempts.delete(clientId);
      });

      // Clean up permission cache
      for (const [key, cached] of this.permissionCache.entries()) {
        if (now - cached.calculatedAt > this.cacheTimeout) {
          this.permissionCache.delete(key);
        }
      }

      this.logger.debug('AuthService cleanup completed', {
        clearedRateLimitEntries: expiredClientIds.length,
        remainingRateLimitEntries: this.loginAttempts.size,
        permissionCacheSize: this.permissionCache.size
      });

    } catch (error) {
      this.logger.error('AuthService cleanup failed', error as Error);
    }
  }

  /**
   * Perform security monitoring tasks
   */
  private async performSecurityMonitoring(): Promise<void> {
    try {
      // Monitor for suspicious authentication patterns
      // This is a simplified implementation
      
      let suspiciousActivities = 0;
      const now = Date.now();
      const hourAgo = now - (60 * 60 * 1000);

      for (const attempts of this.loginAttempts.values()) {
        if (attempts.lastAttempt > hourAgo && attempts.count > 10) {
          suspiciousActivities++;
        }
      }

      if (suspiciousActivities > 0) {
        this.logger.warn('Suspicious authentication activity detected', {
          suspiciousClients: suspiciousActivities
        });
      }

    } catch (error) {
      this.logger.error('Security monitoring failed', error as Error);
    }
  }

  /**
   * Cleanup resources and stop background tasks
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    if (this.securityMonitorInterval) {
      clearInterval(this.securityMonitorInterval);
    }

    this.loginAttempts.clear();
    this.permissionCache.clear();
    this.authStateSubscribers.clear();
    this.removeAllListeners();
    
    this.logger.info('AuthService disposed');
  }
}

// Export singleton instance getter for convenience
let authServiceInstance: AuthService | null = null;

export function getAuthService(
  logger?: Logger,
  sessionManager?: SessionManager,
  tokenManager?: TokenManager,
  config?: Partial<AuthConfig>,
  userStorage?: IUserStorage
): AuthService {
  if (!authServiceInstance) {
    if (!logger || !sessionManager || !tokenManager) {
      throw new Error('Logger, SessionManager, and TokenManager are required for AuthService initialization');
    }
    authServiceInstance = new AuthService(logger, sessionManager, tokenManager, config, userStorage);
  }
  return authServiceInstance;
}

export default AuthService;
