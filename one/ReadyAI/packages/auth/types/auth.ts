// packages/auth/types/auth.ts

/**
 * Authentication types and interfaces for ReadyAI Personal AI Development Orchestrator
 * 
 * Adapted from Cline's proven authentication patterns with ReadyAI-specific 
 * local-only authentication requirements. Provides comprehensive type safety
 * for session management, token handling, and user authentication state.
 * 
 * Based on Cline's src/core/auth/types.ts with ReadyAI adaptations
 * 
 * @version 1.0.0 - Production Ready
 * @author ReadyAI Development Team
 */

import { UUID, ApiResponse, ApiErrorResponse, ReadyAIError, generateUUID, createTimestamp } from '../../foundation/types/core'

// =============================================================================
// AUTHENTICATION STATE ENUMS
// =============================================================================

/**
 * Authentication status enumeration
 * Tracks the current state of user authentication
 */
export enum AuthStatus {
  /** User is not authenticated */
  UNAUTHENTICATED = 'unauthenticated',
  /** Authentication is in progress */
  AUTHENTICATING = 'authenticating', 
  /** User is fully authenticated */
  AUTHENTICATED = 'authenticated',
  /** Authentication has expired and needs renewal */
  EXPIRED = 'expired',
  /** Authentication failed due to invalid credentials */
  FAILED = 'failed',
  /** User has been logged out */
  LOGGED_OUT = 'logged_out'
}

/**
 * Session status enumeration
 * Tracks the lifecycle state of authentication sessions
 */
export enum SessionStatus {
  /** Session is active and valid */
  ACTIVE = 'active',
  /** Session is idle but still valid */
  IDLE = 'idle',
  /** Session has expired */
  EXPIRED = 'expired',
  /** Session has been invalidated */
  INVALIDATED = 'invalidated',
  /** Session is being refreshed */
  REFRESHING = 'refreshing'
}

/**
 * Authentication method enumeration
 * Defines supported authentication mechanisms
 */
export enum AuthMethod {
  /** Local session-based authentication */
  LOCAL_SESSION = 'local_session',
  /** Local development mode (no authentication) */
  DEV_MODE = 'dev_mode',
  /** Local API key authentication */
  API_KEY = 'api_key',
  /** Local certificate-based authentication */
  CERTIFICATE = 'certificate'
}

// =============================================================================
// USER AND PROFILE TYPES
// =============================================================================

/**
 * ReadyAI user profile interface
 * Minimal user information for local authentication
 */
export interface UserProfile {
  /** Unique user identifier */
  id: UUID
  /** Display name */
  displayName: string
  /** Optional email address */
  email?: string
  /** User avatar URL or data URI */
  avatarUrl?: string
  /** User preferences object */
  preferences: UserPreferences
  /** Account creation timestamp */
  createdAt: string
  /** Last login timestamp */
  lastLogin?: string
  /** User role in the system */
  role: UserRole
}

/**
 * User role enumeration
 * Defines access levels within ReadyAI
 */
export enum UserRole {
  /** Regular user with standard access */
  USER = 'user',
  /** Administrator with elevated access */
  ADMIN = 'admin',
  /** Developer with debugging access */
  DEVELOPER = 'developer',
  /** Guest user with limited access */
  GUEST = 'guest'
}

/**
 * User preferences interface
 * Stores user-specific configuration and settings
 */
export interface UserPreferences {
  /** UI theme preference */
  theme: 'light' | 'dark' | 'system'
  /** Language preference */
  language: string
  /** Timezone preference */
  timezone?: string
  /** Notification preferences */
  notifications: NotificationPreferences
  /** Security preferences */
  security: SecurityPreferences
  /** Development preferences */
  development?: DevelopmentPreferences
}

/**
 * Notification preferences
 */
export interface NotificationPreferences {
  /** Enable system notifications */
  systemNotifications: boolean
  /** Enable task completion notifications */
  taskNotifications: boolean
  /** Enable error notifications */
  errorNotifications: boolean
  /** Enable security alerts */
  securityAlerts: boolean
}

/**
 * Security preferences
 */
export interface SecurityPreferences {
  /** Require authentication for sensitive operations */
  requireAuthForSensitiveOps: boolean
  /** Session timeout in minutes */
  sessionTimeout: number
  /** Auto-lock after inactivity */
  autoLockEnabled: boolean
  /** Two-factor authentication enabled */
  twoFactorEnabled: boolean
}

/**
 * Development preferences
 */
export interface DevelopmentPreferences {
  /** Enable debug mode */
  debugMode: boolean
  /** Show verbose logging */
  verboseLogging: boolean
  /** Enable experimental features */
  experimentalFeatures: boolean
}

// =============================================================================
// TOKEN AND CREDENTIAL TYPES
// =============================================================================

/**
 * Authentication token interface
 * Represents JWT or session tokens used for authentication
 */
export interface AuthToken {
  /** Token identifier */
  id: UUID
  /** Actual token value */
  value: string
  /** Token type */
  type: TokenType
  /** Token expiration timestamp */
  expiresAt: string
  /** Token creation timestamp */
  issuedAt: string
  /** Token issuer */
  issuer: string
  /** Token audience */
  audience: string
  /** Token scopes */
  scopes: string[]
  /** Whether token can be refreshed */
  refreshable: boolean
}

/**
 * Token type enumeration
 */
export enum TokenType {
  /** Access token for API requests */
  ACCESS = 'access',
  /** Refresh token for renewing access tokens */
  REFRESH = 'refresh',
  /** Session token for maintaining login state */
  SESSION = 'session',
  /** API key for service authentication */
  API_KEY = 'api_key'
}

/**
 * Refresh token interface
 * Used for renewing expired access tokens
 */
export interface RefreshToken {
  /** Token identifier */
  id: UUID
  /** Refresh token value */
  value: string
  /** Associated access token ID */
  accessTokenId: UUID
  /** User ID this token belongs to */
  userId: UUID
  /** Token expiration timestamp */
  expiresAt: string
  /** Token creation timestamp */
  issuedAt: string
  /** Whether token has been used */
  used: boolean
  /** Token family for rotation */
  family?: string
}

/**
 * API key credentials
 */
export interface ApiKeyCredentials {
  /** API key identifier */
  keyId: UUID
  /** API key value */
  key: string
  /** Key name/description */
  name: string
  /** Associated user ID */
  userId: UUID
  /** Key scopes and permissions */
  scopes: string[]
  /** Key expiration timestamp */
  expiresAt?: string
  /** Key creation timestamp */
  createdAt: string
  /** Last used timestamp */
  lastUsedAt?: string
  /** Whether key is active */
  active: boolean
}

// =============================================================================
// SESSION MANAGEMENT TYPES
// =============================================================================

/**
 * Authentication session interface
 * Represents an active user session with full state tracking
 */
export interface AuthSession {
  /** Session identifier */
  id: UUID
  /** Associated user ID */
  userId: UUID
  /** User profile snapshot */
  user: UserProfile
  /** Current session status */
  status: SessionStatus
  /** Authentication method used */
  authMethod: AuthMethod
  /** Session creation timestamp */
  createdAt: string
  /** Session last accessed timestamp */
  lastAccessedAt: string
  /** Session expiration timestamp */
  expiresAt: string
  /** Access token information */
  accessToken?: AuthToken
  /** Refresh token information */
  refreshToken?: RefreshToken
  /** Session metadata */
  metadata: SessionMetadata
  /** Session security context */
  security: SessionSecurity
}

/**
 * Session metadata interface
 * Additional information about the authentication session
 */
export interface SessionMetadata {
  /** Client IP address (if applicable) */
  ipAddress?: string
  /** User agent string */
  userAgent?: string
  /** Client platform */
  platform?: string
  /** Session source */
  source: 'vscode' | 'web' | 'cli' | 'api'
  /** Geographic location */
  location?: {
    country?: string
    region?: string
    city?: string
  }
  /** Device information */
  device?: {
    type: 'desktop' | 'mobile' | 'tablet'
    os?: string
    browser?: string
  }
}

/**
 * Session security context
 */
export interface SessionSecurity {
  /** Whether session was created over secure connection */
  secure: boolean
  /** Session flags */
  flags: SessionFlag[]
  /** Last security check timestamp */
  lastSecurityCheck?: string
  /** Security events for this session */
  securityEvents: SecurityEvent[]
  /** Risk score (0-100) */
  riskScore: number
}

/**
 * Session flag enumeration
 */
export enum SessionFlag {
  /** Session created in development mode */
  DEV_MODE = 'dev_mode',
  /** Session has elevated privileges */
  ELEVATED = 'elevated',
  /** Session is marked as suspicious */
  SUSPICIOUS = 'suspicious',
  /** Session requires additional verification */
  REQUIRES_VERIFICATION = 'requires_verification'
}

/**
 * Security event interface
 */
export interface SecurityEvent {
  /** Event identifier */
  id: UUID
  /** Event type */
  type: SecurityEventType
  /** Event timestamp */
  timestamp: string
  /** Event description */
  description: string
  /** Event severity */
  severity: 'low' | 'medium' | 'high' | 'critical'
  /** Associated data */
  data?: Record<string, any>
}

/**
 * Security event type enumeration
 */
export enum SecurityEventType {
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILURE = 'login_failure',
  LOGOUT = 'logout',
  TOKEN_REFRESH = 'token_refresh',
  SESSION_EXPIRED = 'session_expired',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  PRIVILEGE_ESCALATION = 'privilege_escalation'
}

// =============================================================================
// AUTHENTICATION REQUEST/RESPONSE TYPES
// =============================================================================

/**
 * Authentication request interface
 * Base interface for authentication requests
 */
export interface AuthRequest {
  /** Request identifier */
  id: UUID
  /** Authentication method */
  method: AuthMethod
  /** Client information */
  clientInfo?: {
    userAgent?: string
    platform?: string
    version?: string
  }
  /** Request timestamp */
  timestamp: string
}

/**
 * Local session authentication request
 */
export interface LocalSessionAuthRequest extends AuthRequest {
  method: AuthMethod.LOCAL_SESSION
  /** Session credentials */
  credentials: {
    /** Username or identifier */
    identifier: string
    /** Password or secret */
    secret: string
    /** Remember me flag */
    rememberMe?: boolean
  }
}

/**
 * API key authentication request
 */
export interface ApiKeyAuthRequest extends AuthRequest {
  method: AuthMethod.API_KEY
  /** API key credentials */
  credentials: {
    /** API key value */
    apiKey: string
    /** Optional key identifier */
    keyId?: UUID
  }
}

/**
 * Development mode authentication request
 */
export interface DevModeAuthRequest extends AuthRequest {
  method: AuthMethod.DEV_MODE
  /** Development credentials */
  credentials: {
    /** Developer identifier */
    developerId: string
    /** Development session name */
    sessionName?: string
  }
}

/**
 * Union type for all authentication requests
 */
export type AnyAuthRequest = LocalSessionAuthRequest | ApiKeyAuthRequest | DevModeAuthRequest

/**
 * Authentication response interface
 */
export interface AuthResponse {
  /** Response identifier */
  id: UUID
  /** Authentication success status */
  success: boolean
  /** Created session (if successful) */
  session?: AuthSession
  /** Error information (if failed) */
  error?: AuthError
  /** Response timestamp */
  timestamp: string
  /** Additional response metadata */
  metadata?: Record<string, any>
}

/**
 * Token refresh request
 */
export interface TokenRefreshRequest {
  /** Refresh token value */
  refreshToken: string
  /** Requested scopes */
  scopes?: string[]
}

/**
 * Token refresh response
 */
export interface TokenRefreshResponse {
  /** New access token */
  accessToken: AuthToken
  /** New refresh token (if rotated) */
  refreshToken?: RefreshToken
  /** Token expiration information */
  expiresIn: number
}

// =============================================================================
// AUTHENTICATION ERROR TYPES
// =============================================================================

/**
 * Authentication error interface
 * Extends ReadyAIError with auth-specific information
 */
export interface AuthError {
  /** Error code */
  code: AuthErrorCode
  /** Human-readable error message */
  message: string
  /** Detailed error description */
  details?: string
  /** Additional error context */
  context?: Record<string, any>
  /** Timestamp when error occurred */
  timestamp: string
  /** Whether error is retryable */
  retryable: boolean
  /** Suggested retry delay in milliseconds */
  retryAfter?: number
}

/**
 * Authentication error code enumeration
 */
export enum AuthErrorCode {
  /** Invalid credentials provided */
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  /** User account not found */
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  /** Account is disabled or locked */
  ACCOUNT_DISABLED = 'ACCOUNT_DISABLED',
  /** Session has expired */
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  /** Invalid or malformed token */
  INVALID_TOKEN = 'INVALID_TOKEN',
  /** Token has expired */
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  /** Insufficient permissions for operation */
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  /** Rate limit exceeded */
  RATE_LIMITED = 'RATE_LIMITED',
  /** Authentication service unavailable */
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  /** Invalid authentication method */
  INVALID_AUTH_METHOD = 'INVALID_AUTH_METHOD',
  /** MFA required but not provided */
  MFA_REQUIRED = 'MFA_REQUIRED',
  /** Invalid MFA code */
  INVALID_MFA_CODE = 'INVALID_MFA_CODE',
  /** Account requires verification */
  VERIFICATION_REQUIRED = 'VERIFICATION_REQUIRED',
  /** General authentication error */
  AUTH_ERROR = 'AUTH_ERROR'
}

/**
 * Authentication error class
 * Extends ReadyAIError with authentication-specific functionality
 */
export class AuthenticationError extends ReadyAIError {
  public readonly authErrorCode: AuthErrorCode

  constructor(
    code: AuthErrorCode,
    message: string,
    details?: string,
    context?: Record<string, any>,
    retryable = false,
    retryAfter?: number
  ) {
    super(message, code, 401, { details, context }, retryable, retryAfter)
    this.authErrorCode = code
    this.name = 'AuthenticationError'
  }

  /**
   * Create authentication error from generic error
   */
  static fromError(error: Error, code = AuthErrorCode.AUTH_ERROR): AuthenticationError {
    return new AuthenticationError(
      code,
      error.message,
      error.stack,
      { originalError: error.constructor.name }
    )
  }

  /**
   * Convert to API error response
   */
  toAuthErrorResponse(): ApiErrorResponse {
    return {
      success: false,
      error: {
        message: this.message,
        code: this.authErrorCode,
        statusCode: this.statusCode,
        details: {
          ...this.details,
          authError: true,
          timestamp: createTimestamp()
        },
        retryable: this.retryable,
        retryAfter: this.retryAfter
      }
    }
  }
}

// =============================================================================
// PERMISSION AND AUTHORIZATION TYPES
// =============================================================================

/**
 * Permission interface
 * Defines granular permissions within ReadyAI
 */
export interface Permission {
  /** Permission identifier */
  id: UUID
  /** Permission name */
  name: string
  /** Permission description */
  description: string
  /** Permission resource */
  resource: string
  /** Permission action */
  action: string
  /** Permission conditions */
  conditions?: PermissionCondition[]
}

/**
 * Permission condition interface
 */
export interface PermissionCondition {
  /** Condition field */
  field: string
  /** Condition operator */
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'gt' | 'gte' | 'lt' | 'lte'
  /** Condition value */
  value: any
}

/**
 * Role interface
 * Defines user roles with associated permissions
 */
export interface Role {
  /** Role identifier */
  id: UUID
  /** Role name */
  name: string
  /** Role description */
  description: string
  /** Associated permissions */
  permissions: Permission[]
  /** Role inheritance */
  inherits?: UUID[]
  /** Whether role is built-in */
  builtIn: boolean
  /** Role creation timestamp */
  createdAt: string
}

// =============================================================================
// AUTHENTICATION CONFIGURATION TYPES
// =============================================================================

/**
 * Authentication configuration interface
 */
export interface AuthConfig {
  /** Default authentication method */
  defaultMethod: AuthMethod
  /** Enabled authentication methods */
  enabledMethods: AuthMethod[]
  /** Session configuration */
  session: SessionConfig
  /** Token configuration */
  tokens: TokenConfig
  /** Security configuration */
  security: SecurityConfig
  /** Development configuration */
  development?: DevelopmentConfig
}

/**
 * Session configuration
 */
export interface SessionConfig {
  /** Default session timeout in minutes */
  defaultTimeout: number
  /** Maximum session timeout in minutes */
  maxTimeout: number
  /** Session cleanup interval in minutes */
  cleanupInterval: number
  /** Maximum concurrent sessions per user */
  maxConcurrentSessions: number
  /** Session storage type */
  storageType: 'memory' | 'file' | 'database'
}

/**
 * Token configuration
 */
export interface TokenConfig {
  /** Access token lifetime in minutes */
  accessTokenLifetime: number
  /** Refresh token lifetime in days */
  refreshTokenLifetime: number
  /** Token signing algorithm */
  signingAlgorithm: 'HS256' | 'RS256' | 'ES256'
  /** Token issuer */
  issuer: string
  /** Token audience */
  audience: string
  /** Whether to rotate refresh tokens */
  rotateRefreshTokens: boolean
}

/**
 * Security configuration
 */
export interface SecurityConfig {
  /** Password minimum length */
  passwordMinLength: number
  /** Password complexity requirements */
  passwordComplexity: {
    requireUppercase: boolean
    requireLowercase: boolean
    requireNumbers: boolean
    requireSpecialChars: boolean
  }
  /** Rate limiting configuration */
  rateLimiting: {
    enabled: boolean
    maxAttempts: number
    windowMinutes: number
    blockDurationMinutes: number
  }
  /** Account lockout configuration */
  accountLockout: {
    enabled: boolean
    maxFailedAttempts: number
    lockoutDurationMinutes: number
  }
  /** Two-factor authentication configuration */
  twoFactor: {
    enabled: boolean
    required: boolean
    methods: string[]
  }
}

/**
 * Development configuration
 */
export interface DevelopmentConfig {
  /** Enable development mode */
  enabled: boolean
  /** Skip authentication in dev mode */
  skipAuth: boolean
  /** Default developer user */
  defaultUser?: UserProfile
  /** Mock authentication responses */
  mockResponses: boolean
}

// =============================================================================
// AUTHENTICATION SERVICE INTERFACES
// =============================================================================

/**
 * Authentication service interface
 * Defines the contract for authentication services
 */
export interface IAuthService {
  /**
   * Authenticate user with credentials
   */
  authenticate(request: AnyAuthRequest): Promise<AuthResponse>

  /**
   * Refresh authentication token
   */
  refreshToken(request: TokenRefreshRequest): Promise<TokenRefreshResponse>

  /**
   * Validate authentication token
   */
  validateToken(token: string): Promise<boolean>

  /**
   * Get user session by ID
   */
  getSession(sessionId: UUID): Promise<AuthSession | null>

  /**
   * Update session information
   */
  updateSession(sessionId: UUID, updates: Partial<AuthSession>): Promise<void>

  /**
   * Invalidate user session
   */
  invalidateSession(sessionId: UUID): Promise<void>

  /**
   * Invalidate all user sessions
   */
  invalidateAllUserSessions(userId: UUID): Promise<void>

  /**
   * Get user by ID
   */
  getUser(userId: UUID): Promise<UserProfile | null>

  /**
   * Update user information
   */
  updateUser(userId: UUID, updates: Partial<UserProfile>): Promise<void>

  /**
   * Check user permissions
   */
  checkPermission(userId: UUID, resource: string, action: string): Promise<boolean>
}

/**
 * Token service interface
 */
export interface ITokenService {
  /**
   * Generate access token
   */
  generateAccessToken(user: UserProfile, scopes?: string[]): Promise<AuthToken>

  /**
   * Generate refresh token
   */
  generateRefreshToken(accessTokenId: UUID, userId: UUID): Promise<RefreshToken>

  /**
   * Validate token
   */
  validateToken(token: string): Promise<AuthToken | null>

  /**
   * Refresh access token
   */
  refreshAccessToken(refreshToken: string): Promise<{ accessToken: AuthToken; refreshToken?: RefreshToken }>

  /**
   * Revoke token
   */
  revokeToken(tokenId: UUID): Promise<void>

  /**
   * Cleanup expired tokens
   */
  cleanupExpiredTokens(): Promise<void>
}

/**
 * Session service interface
 */
export interface ISessionService {
  /**
   * Create new session
   */
  createSession(user: UserProfile, authMethod: AuthMethod, metadata?: SessionMetadata): Promise<AuthSession>

  /**
   * Get session by ID
   */
  getSession(sessionId: UUID): Promise<AuthSession | null>

  /**
   * Update session
   */
  updateSession(sessionId: UUID, updates: Partial<AuthSession>): Promise<void>

  /**
   * Extend session expiration
   */
  extendSession(sessionId: UUID, extensionMinutes?: number): Promise<void>

  /**
   * Invalidate session
   */
  invalidateSession(sessionId: UUID): Promise<void>

  /**
   * Get user sessions
   */
  getUserSessions(userId: UUID): Promise<AuthSession[]>

  /**
   * Cleanup expired sessions
   */
  cleanupExpiredSessions(): Promise<void>
}

// =============================================================================
// AUTHENTICATION EVENTS AND LISTENERS
// =============================================================================

/**
 * Authentication event interface
 */
export interface AuthEvent {
  /** Event identifier */
  id: UUID
  /** Event type */
  type: AuthEventType
  /** User ID (if applicable) */
  userId?: UUID
  /** Session ID (if applicable) */
  sessionId?: UUID
  /** Event data */
  data?: Record<string, any>
  /** Event timestamp */
  timestamp: string
}

/**
 * Authentication event type enumeration
 */
export enum AuthEventType {
  USER_LOGIN = 'user_login',
  USER_LOGOUT = 'user_logout',
  SESSION_CREATED = 'session_created',
  SESSION_EXPIRED = 'session_expired',
  SESSION_INVALIDATED = 'session_invalidated',
  TOKEN_GENERATED = 'token_generated',
  TOKEN_REFRESHED = 'token_refreshed',
  TOKEN_REVOKED = 'token_revoked',
  AUTHENTICATION_FAILED = 'authentication_failed',
  PERMISSION_DENIED = 'permission_denied'
}

/**
 * Authentication event listener interface
 */
export interface IAuthEventListener {
  /**
   * Handle authentication event
   */
  handleAuthEvent(event: AuthEvent): Promise<void>
}

// =============================================================================
// UTILITY TYPES AND HELPERS
// =============================================================================

/**
 * Authentication state type
 */
export interface AuthState {
  /** Current authentication status */
  status: AuthStatus
  /** Current user (if authenticated) */
  user?: UserProfile
  /** Current session (if authenticated) */
  session?: AuthSession
  /** Loading state */
  loading: boolean
  /** Error state */
  error?: AuthError
  /** Last updated timestamp */
  lastUpdated: string
}

/**
 * Authentication context type for React context
 */
export interface AuthContextType {
  /** Current authentication state */
  state: AuthState
  /** Login function */
  login: (request: AnyAuthRequest) => Promise<void>
  /** Logout function */
  logout: () => Promise<void>
  /** Refresh token function */
  refreshToken: () => Promise<void>
  /** Check permission function */
  hasPermission: (resource: string, action: string) => boolean
  /** Update user preferences */
  updatePreferences: (preferences: Partial<UserPreferences>) => Promise<void>
}

/**
 * Type guards for authentication types
 */
export namespace AuthTypeGuards {
  export function isLocalSessionAuthRequest(request: AnyAuthRequest): request is LocalSessionAuthRequest {
    return request.method === AuthMethod.LOCAL_SESSION
  }

  export function isApiKeyAuthRequest(request: AnyAuthRequest): request is ApiKeyAuthRequest {
    return request.method === AuthMethod.API_KEY
  }

  export function isDevModeAuthRequest(request: AnyAuthRequest): request is DevModeAuthRequest {
    return request.method === AuthMethod.DEV_MODE
  }

  export function isAuthenticatedState(state: AuthState): state is AuthState & { user: UserProfile; session: AuthSession } {
    return state.status === AuthStatus.AUTHENTICATED && !!state.user && !!state.session
  }
}

/**
 * Utility functions for authentication
 */
export namespace AuthUtils {
  /**
   * Check if session is expired
   */
  export function isSessionExpired(session: AuthSession): boolean {
    return new Date(session.expiresAt) <= new Date()
  }

  /**
   * Check if token is expired
   */
  export function isTokenExpired(token: AuthToken): boolean {
    return new Date(token.expiresAt) <= new Date()
  }

  /**
   * Get session time remaining in minutes
   */
  export function getSessionTimeRemaining(session: AuthSession): number {
    const now = new Date()
    const expires = new Date(session.expiresAt)
    return Math.max(0, Math.floor((expires.getTime() - now.getTime()) / (1000 * 60)))
  }

  /**
   * Create default user preferences
   */
  export function createDefaultUserPreferences(): UserPreferences {
    return {
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
        sessionTimeout: 480, // 8 hours
        autoLockEnabled: false,
        twoFactorEnabled: false
      }
    }
  }

  /**
   * Create session metadata from request
   */
  export function createSessionMetadata(
    request: AnyAuthRequest,
    additionalData?: Partial<SessionMetadata>
  ): SessionMetadata {
    return {
      userAgent: request.clientInfo?.userAgent,
      platform: request.clientInfo?.platform,
      source: 'vscode',
      ...additionalData
    }
  }
}

// =============================================================================
// CONSTANTS AND DEFAULTS
// =============================================================================

/**
 * Authentication constants
 */
export const AUTH_CONSTANTS = {
  /** Default session timeout in minutes */
  DEFAULT_SESSION_TIMEOUT: 480, // 8 hours
  /** Maximum session timeout in minutes */
  MAX_SESSION_TIMEOUT: 1440, // 24 hours
  /** Default access token lifetime in minutes */
  DEFAULT_ACCESS_TOKEN_LIFETIME: 60, // 1 hour
  /** Default refresh token lifetime in days */
  DEFAULT_REFRESH_TOKEN_LIFETIME: 30,
  /** Maximum concurrent sessions per user */
  MAX_CONCURRENT_SESSIONS: 5,
  /** Session cleanup interval in minutes */
  SESSION_CLEANUP_INTERVAL: 30,
  /** Token cleanup interval in minutes */
  TOKEN_CLEANUP_INTERVAL: 60,
  /** Maximum login attempts before lockout */
  MAX_LOGIN_ATTEMPTS: 5,
  /** Account lockout duration in minutes */
  LOCKOUT_DURATION: 30,
  /** Rate limit window in minutes */
  RATE_LIMIT_WINDOW: 15,
  /** Rate limit max requests */
  RATE_LIMIT_MAX_REQUESTS: 100
} as const

/**
 * Default authentication configuration
 */
export const DEFAULT_AUTH_CONFIG: AuthConfig = {
  defaultMethod: AuthMethod.LOCAL_SESSION,
  enabledMethods: [AuthMethod.LOCAL_SESSION, AuthMethod.DEV_MODE],
  session: {
    defaultTimeout: AUTH_CONSTANTS.DEFAULT_SESSION_TIMEOUT,
    maxTimeout: AUTH_CONSTANTS.MAX_SESSION_TIMEOUT,
    cleanupInterval: AUTH_CONSTANTS.SESSION_CLEANUP_INTERVAL,
    maxConcurrentSessions: AUTH_CONSTANTS.MAX_CONCURRENT_SESSIONS,
    storageType: 'file'
  },
  tokens: {
    accessTokenLifetime: AUTH_CONSTANTS.DEFAULT_ACCESS_TOKEN_LIFETIME,
    refreshTokenLifetime: AUTH_CONSTANTS.DEFAULT_REFRESH_TOKEN_LIFETIME,
    signingAlgorithm: 'HS256',
    issuer: 'readyai',
    audience: 'readyai-client',
    rotateRefreshTokens: true
  },
  security: {
    passwordMinLength: 8,
    passwordComplexity: {
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: false
    },
    rateLimiting: {
      enabled: true,
      maxAttempts: AUTH_CONSTANTS.RATE_LIMIT_MAX_REQUESTS,
      windowMinutes: AUTH_CONSTANTS.RATE_LIMIT_WINDOW,
      blockDurationMinutes: 60
    },
    accountLockout: {
      enabled: true,
      maxFailedAttempts: AUTH_CONSTANTS.MAX_LOGIN_ATTEMPTS,
      lockoutDurationMinutes: AUTH_CONSTANTS.LOCKOUT_DURATION
    },
    twoFactor: {
      enabled: false,
      required: false,
      methods: []
    }
  },
  development: {
    enabled: process.env.NODE_ENV === 'development',
    skipAuth: false,
    mockResponses: false
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

/**
 * Version information for auth types
 */
export const AUTH_TYPES_VERSION = '1.0.0'

// Export all types for convenience
export type {
  // Core interfaces
  UserProfile,
  AuthSession,
  AuthToken,
  RefreshToken,
  ApiKeyCredentials,
  
  // Request/Response types
  AnyAuthRequest,
  AuthResponse,
  TokenRefreshRequest,
  TokenRefreshResponse,
  
  // Configuration types
  AuthConfig,
  SessionConfig,
  TokenConfig,
  SecurityConfig,
  
  // Service interfaces
  IAuthService,
  ITokenService,
  ISessionService,
  
  // Context types
  AuthState,
  AuthContextType
}

// Export enums for direct usage
export {
  AuthStatus,
  SessionStatus,
  AuthMethod,
  UserRole,
  TokenType,
  AuthErrorCode,
  SecurityEventType,
  AuthEventType,
  SessionFlag
}

// Export utilities and constants
export {
  AuthTypeGuards,
  AuthUtils,
  AUTH_CONSTANTS,
  DEFAULT_AUTH_CONFIG
}
