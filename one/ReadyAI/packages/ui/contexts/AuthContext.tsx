// packages/ui/contexts/AuthContext.tsx

/**
 * ReadyAI Authentication Context Provider
 * 
 * Adapted from Cline's proven authentication patterns with ReadyAI-specific 
 * local-only authentication requirements and enhanced state management.
 * Provides comprehensive React context for authentication state, user management,
 * and security features throughout the ReadyAI UI components.
 * 
 * Based on Cline's webview-ui/src/context/AuthContext.tsx with ReadyAI adaptations
 * 
 * @version 1.0.0 - Production Ready
 * @author ReadyAI Development Team
 */

import React, { 
  createContext, 
  useContext, 
  useCallback, 
  useEffect, 
  useState, 
  useMemo,
  useRef,
  ReactNode 
} from 'react'

// ReadyAI Core Types
import { 
  UUID, 
  ApiResponse, 
  ReadyAIError, 
  generateUUID, 
  createTimestamp 
} from '../../foundation/types/core'

// Authentication Types
import {
  AuthStatus,
  SessionStatus,
  AuthMethod,
  UserRole,
  UserProfile,
  UserPreferences,
  AuthSession,
  AuthToken,
  RefreshToken,
  AuthError,
  AuthErrorCode,
  AuthState,
  AuthContextType,
  AnyAuthRequest,
  LocalSessionAuthRequest,
  ApiKeyAuthRequest,
  DevModeAuthRequest,
  AuthResponse,
  TokenRefreshRequest,
  TokenRefreshResponse,
  AuthUtils,
  AuthTypeGuards,
  AuthenticationError,
  AUTH_CONSTANTS,
  DEFAULT_AUTH_CONFIG
} from '../../auth/types/auth'

// =============================================================================
// CONTEXT DEFINITION
// =============================================================================

/**
 * Authentication Context
 * Provides authentication state and methods throughout the component tree
 */
export const AuthContext = createContext<AuthContextType | undefined>(undefined)

// =============================================================================
// AUTHENTICATION SERVICE INTERFACE
// =============================================================================

/**
 * Authentication service interface for local operations
 * Handles all authentication-related operations in ReadyAI's local-first architecture
 */
interface AuthService {
  /**
   * Authenticate user with provided credentials
   */
  authenticate(request: AnyAuthRequest): Promise<AuthResponse>
  
  /**
   * Sign out current user
   */
  signOut(): Promise<void>
  
  /**
   * Refresh authentication token
   */
  refreshToken(): Promise<TokenRefreshResponse>
  
  /**
   * Validate current authentication state
   */
  validateAuth(): Promise<boolean>
  
  /**
   * Get current user session
   */
  getCurrentSession(): Promise<AuthSession | null>
  
  /**
   * Update user preferences
   */
  updatePreferences(preferences: Partial<UserPreferences>): Promise<void>
  
  /**
   * Check user permission for resource/action
   */
  hasPermission(resource: string, action: string): Promise<boolean>
}

// =============================================================================
// LOCAL STORAGE UTILITIES
// =============================================================================

/**
 * Local storage keys for authentication data
 */
const STORAGE_KEYS = {
  AUTH_STATE: 'readyai_auth_state',
  USER_SESSION: 'readyai_user_session',
  REFRESH_TOKEN: 'readyai_refresh_token',
  USER_PREFERENCES: 'readyai_user_preferences'
} as const

/**
 * Secure local storage wrapper with encryption simulation
 */
class SecureStorage {
  /**
   * Store data securely in local storage
   */
  static setItem(key: string, value: unknown): void {
    try {
      const serialized = JSON.stringify({
        data: value,
        timestamp: Date.now(),
        checksum: this.generateChecksum(value)
      })
      localStorage.setItem(key, btoa(serialized)) // Basic encoding
    } catch (error) {
      console.error('SecureStorage: Failed to store item', { key, error })
    }
  }

  /**
   * Retrieve data securely from local storage
   */
  static getItem<T>(key: string): T | null {
    try {
      const encoded = localStorage.getItem(key)
      if (!encoded) return null

      const decoded = atob(encoded)
      const parsed = JSON.parse(decoded)
      
      // Basic integrity check
      if (!parsed.data || !parsed.timestamp || !parsed.checksum) {
        this.removeItem(key)
        return null
      }

      // Verify checksum
      if (parsed.checksum !== this.generateChecksum(parsed.data)) {
        console.warn('SecureStorage: Data integrity check failed', { key })
        this.removeItem(key)
        return null
      }

      return parsed.data as T
    } catch (error) {
      console.error('SecureStorage: Failed to retrieve item', { key, error })
      this.removeItem(key)
      return null
    }
  }

  /**
   * Remove item from secure storage
   */
  static removeItem(key: string): void {
    try {
      localStorage.removeItem(key)
    } catch (error) {
      console.error('SecureStorage: Failed to remove item', { key, error })
    }
  }

  /**
   * Clear all secure storage
   */
  static clear(): void {
    try {
      Object.values(STORAGE_KEYS).forEach(key => this.removeItem(key))
    } catch (error) {
      console.error('SecureStorage: Failed to clear storage', { error })
    }
  }

  /**
   * Generate simple checksum for data integrity
   */
  private static generateChecksum(data: unknown): string {
    const str = JSON.stringify(data)
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return hash.toString(16)
  }
}

// =============================================================================
// AUTHENTICATION SERVICE IMPLEMENTATION
// =============================================================================

/**
 * Local-first authentication service implementation
 * Provides authentication functionality for ReadyAI's offline-first architecture
 */
class LocalAuthService implements AuthService {
  private sessionCheckInterval: NodeJS.Timeout | null = null
  private readonly SESSION_CHECK_INTERVAL = 60000 // 1 minute

  constructor() {
    this.startSessionMonitoring()
  }

  /**
   * Authenticate user with credentials
   */
  async authenticate(request: AnyAuthRequest): Promise<AuthResponse> {
    const responseId = generateUUID()
    const timestamp = createTimestamp()

    try {
      // Validate request
      if (!request || !request.method) {
        throw new AuthenticationError(
          AuthErrorCode.INVALID_CREDENTIALS,
          'Invalid authentication request'
        )
      }

      let user: UserProfile
      let authMethod: AuthMethod

      // Handle different authentication methods
      switch (request.method) {
        case AuthMethod.LOCAL_SESSION:
          user = await this.handleLocalSessionAuth(request as LocalSessionAuthRequest)
          authMethod = AuthMethod.LOCAL_SESSION
          break

        case AuthMethod.DEV_MODE:
          user = await this.handleDevModeAuth(request as DevModeAuthRequest)
          authMethod = AuthMethod.DEV_MODE
          break

        case AuthMethod.API_KEY:
          user = await this.handleApiKeyAuth(request as ApiKeyAuthRequest)
          authMethod = AuthMethod.API_KEY
          break

        default:
          throw new AuthenticationError(
            AuthErrorCode.INVALID_AUTH_METHOD,
            `Authentication method ${request.method} is not supported`
          )
      }

      // Create session
      const session = await this.createSession(user, authMethod, request.clientInfo)
      
      // Store session securely
      SecureStorage.setItem(STORAGE_KEYS.USER_SESSION, session)
      SecureStorage.setItem(STORAGE_KEYS.AUTH_STATE, {
        status: AuthStatus.AUTHENTICATED,
        user,
        session,
        loading: false,
        lastUpdated: timestamp
      })

      return {
        id: responseId,
        success: true,
        session,
        timestamp,
        metadata: {
          authMethod,
          sessionId: session.id
        }
      }
    } catch (error) {
      const authError = error instanceof AuthenticationError 
        ? error 
        : AuthenticationError.fromError(error as Error)

      return {
        id: responseId,
        success: false,
        error: {
          code: authError.authErrorCode,
          message: authError.message,
          details: authError.details,
          context: authError.context,
          timestamp,
          retryable: authError.retryable,
          retryAfter: authError.retryAfter
        },
        timestamp
      }
    }
  }

  /**
   * Sign out current user
   */
  async signOut(): Promise<void> {
    try {
      // Clear all stored data
      SecureStorage.clear()
      
      // Stop session monitoring
      this.stopSessionMonitoring()
      
      console.log('User successfully signed out')
    } catch (error) {
      console.error('Error during sign out:', error)
      throw new AuthenticationError(
        AuthErrorCode.AUTH_ERROR,
        'Failed to sign out user'
      )
    }
  }

  /**
   * Refresh authentication token
   */
  async refreshToken(): Promise<TokenRefreshResponse> {
    const session = SecureStorage.getItem<AuthSession>(STORAGE_KEYS.USER_SESSION)
    
    if (!session || !session.refreshToken) {
      throw new AuthenticationError(
        AuthErrorCode.SESSION_EXPIRED,
        'No valid session found for token refresh'
      )
    }

    // Check if refresh token is expired
    if (AuthUtils.isTokenExpired(session.refreshToken as any)) {
      throw new AuthenticationError(
        AuthErrorCode.TOKEN_EXPIRED,
        'Refresh token has expired'
      )
    }

    // Generate new access token
    const newAccessToken: AuthToken = {
      id: generateUUID(),
      value: this.generateTokenValue(),
      type: 'ACCESS' as any,
      expiresAt: new Date(Date.now() + AUTH_CONSTANTS.DEFAULT_ACCESS_TOKEN_LIFETIME * 60 * 1000).toISOString(),
      issuedAt: createTimestamp(),
      issuer: 'readyai-local',
      audience: 'readyai-client',
      scopes: ['read', 'write', 'admin'],
      refreshable: true
    }

    // Update session
    const updatedSession: AuthSession = {
      ...session,
      accessToken: newAccessToken,
      lastAccessedAt: createTimestamp()
    }

    SecureStorage.setItem(STORAGE_KEYS.USER_SESSION, updatedSession)

    return {
      accessToken: newAccessToken,
      expiresIn: AUTH_CONSTANTS.DEFAULT_ACCESS_TOKEN_LIFETIME * 60
    }
  }

  /**
   * Validate current authentication state
   */
  async validateAuth(): Promise<boolean> {
    const session = SecureStorage.getItem<AuthSession>(STORAGE_KEYS.USER_SESSION)
    
    if (!session) return false
    
    // Check session expiration
    if (AuthUtils.isSessionExpired(session)) {
      await this.signOut()
      return false
    }

    return session.status === SessionStatus.ACTIVE
  }

  /**
   * Get current user session
   */
  async getCurrentSession(): Promise<AuthSession | null> {
    return SecureStorage.getItem<AuthSession>(STORAGE_KEYS.USER_SESSION)
  }

  /**
   * Update user preferences
   */
  async updatePreferences(preferences: Partial<UserPreferences>): Promise<void> {
    const session = await this.getCurrentSession()
    
    if (!session) {
      throw new AuthenticationError(
        AuthErrorCode.SESSION_EXPIRED,
        'No active session found'
      )
    }

    const updatedPreferences: UserPreferences = {
      ...session.user.preferences,
      ...preferences
    }

    const updatedUser: UserProfile = {
      ...session.user,
      preferences: updatedPreferences
    }

    const updatedSession: AuthSession = {
      ...session,
      user: updatedUser,
      lastAccessedAt: createTimestamp()
    }

    SecureStorage.setItem(STORAGE_KEYS.USER_SESSION, updatedSession)
    SecureStorage.setItem(STORAGE_KEYS.USER_PREFERENCES, updatedPreferences)
  }

  /**
   * Check user permission for resource/action
   */
  async hasPermission(resource: string, action: string): Promise<boolean> {
    const session = await this.getCurrentSession()
    
    if (!session) return false
    
    // Basic permission check based on user role
    const { role } = session.user
    
    switch (role) {
      case UserRole.ADMIN:
        return true // Admin has all permissions
      
      case UserRole.DEVELOPER:
        return resource !== 'system' || action !== 'delete'
      
      case UserRole.USER:
        return action === 'read' || (resource === 'project' && action === 'write')
      
      case UserRole.GUEST:
        return action === 'read'
      
      default:
        return false
    }
  }

  /**
   * Handle local session authentication
   */
  private async handleLocalSessionAuth(request: LocalSessionAuthRequest): Promise<UserProfile> {
    const { identifier, secret } = request.credentials

    // Simulate authentication (in real implementation, this would validate against a local store)
    if (!identifier || !secret) {
      throw new AuthenticationError(
        AuthErrorCode.INVALID_CREDENTIALS,
        'Username and password are required'
      )
    }

    // For demo purposes, accept any non-empty credentials
    // In production, this would validate against encrypted local storage
    return {
      id: generateUUID(),
      displayName: identifier,
      email: `${identifier}@readyai.local`,
      role: UserRole.USER,
      preferences: AuthUtils.createDefaultUserPreferences(),
      createdAt: createTimestamp(),
      lastLogin: createTimestamp()
    }
  }

  /**
   * Handle development mode authentication
   */
  private async handleDevModeAuth(request: DevModeAuthRequest): Promise<UserProfile> {
    const { developerId, sessionName } = request.credentials

    return {
      id: generateUUID(),
      displayName: sessionName || `Developer ${developerId}`,
      email: `${developerId}@readyai.dev`,
      role: UserRole.DEVELOPER,
      preferences: {
        ...AuthUtils.createDefaultUserPreferences(),
        development: {
          debugMode: true,
          verboseLogging: true,
          experimentalFeatures: true
        }
      },
      createdAt: createTimestamp(),
      lastLogin: createTimestamp()
    }
  }

  /**
   * Handle API key authentication
   */
  private async handleApiKeyAuth(request: ApiKeyAuthRequest): Promise<UserProfile> {
    const { apiKey } = request.credentials

    if (!apiKey || apiKey.length < 32) {
      throw new AuthenticationError(
        AuthErrorCode.INVALID_CREDENTIALS,
        'Invalid API key format'
      )
    }

    return {
      id: generateUUID(),
      displayName: 'API User',
      role: UserRole.USER,
      preferences: AuthUtils.createDefaultUserPreferences(),
      createdAt: createTimestamp(),
      lastLogin: createTimestamp()
    }
  }

  /**
   * Create authentication session
   */
  private async createSession(
    user: UserProfile, 
    authMethod: AuthMethod,
    clientInfo?: any
  ): Promise<AuthSession> {
    const sessionId = generateUUID()
    const now = createTimestamp()
    const expiresAt = new Date(Date.now() + AUTH_CONSTANTS.DEFAULT_SESSION_TIMEOUT * 60 * 1000).toISOString()

    const accessToken: AuthToken = {
      id: generateUUID(),
      value: this.generateTokenValue(),
      type: 'ACCESS' as any,
      expiresAt: new Date(Date.now() + AUTH_CONSTANTS.DEFAULT_ACCESS_TOKEN_LIFETIME * 60 * 1000).toISOString(),
      issuedAt: now,
      issuer: 'readyai-local',
      audience: 'readyai-client',
      scopes: ['read', 'write'],
      refreshable: true
    }

    const refreshToken: RefreshToken = {
      id: generateUUID(),
      value: this.generateTokenValue(),
      accessTokenId: accessToken.id,
      userId: user.id,
      expiresAt: new Date(Date.now() + AUTH_CONSTANTS.DEFAULT_REFRESH_TOKEN_LIFETIME * 24 * 60 * 60 * 1000).toISOString(),
      issuedAt: now,
      used: false
    }

    return {
      id: sessionId,
      userId: user.id,
      user,
      status: SessionStatus.ACTIVE,
      authMethod,
      createdAt: now,
      lastAccessedAt: now,
      expiresAt,
      accessToken,
      refreshToken,
      metadata: AuthUtils.createSessionMetadata(
        { method: authMethod, clientInfo } as any,
        { source: 'vscode' as any }
      ),
      security: {
        secure: true,
        flags: [],
        securityEvents: [],
        riskScore: 0
      }
    }
  }

  /**
   * Generate token value
   */
  private generateTokenValue(): string {
    return btoa(generateUUID() + '_' + Date.now().toString(36)).replace(/=/g, '')
  }

  /**
   * Start session monitoring
   */
  private startSessionMonitoring(): void {
    if (this.sessionCheckInterval) return

    this.sessionCheckInterval = setInterval(async () => {
      try {
        const isValid = await this.validateAuth()
        if (!isValid) {
          this.stopSessionMonitoring()
        }
      } catch (error) {
        console.error('Session validation error:', error)
      }
    }, this.SESSION_CHECK_INTERVAL)
  }

  /**
   * Stop session monitoring
   */
  private stopSessionMonitoring(): void {
    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval)
      this.sessionCheckInterval = null
    }
  }
}

// =============================================================================
// CONTEXT PROVIDER IMPLEMENTATION
// =============================================================================

/**
 * AuthProvider Props
 */
interface AuthProviderProps {
  children: ReactNode
}

/**
 * ReadyAI Authentication Provider
 * Manages authentication state and provides auth functionality to child components
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  // =============================================================================
  // STATE MANAGEMENT
  // =============================================================================

  const [state, setState] = useState<AuthState>(() => {
    // Initialize from local storage
    const savedState = SecureStorage.getItem<AuthState>(STORAGE_KEYS.AUTH_STATE)
    
    return savedState || {
      status: AuthStatus.UNAUTHENTICATED,
      loading: false,
      lastUpdated: createTimestamp()
    }
  })

  // Service instance
  const authServiceRef = useRef<AuthService>(new LocalAuthService())
  const authService = authServiceRef.current

  // =============================================================================
  // AUTHENTICATION METHODS
  // =============================================================================

  /**
   * Login user with credentials
   */
  const login = useCallback(async (request: AnyAuthRequest): Promise<void> => {
    setState(prev => ({ ...prev, loading: true, error: undefined }))

    try {
      const response = await authService.authenticate(request)
      
      if (response.success && response.session) {
        setState({
          status: AuthStatus.AUTHENTICATED,
          user: response.session.user,
          session: response.session,
          loading: false,
          lastUpdated: createTimestamp()
        })
      } else {
        setState(prev => ({
          ...prev,
          status: AuthStatus.FAILED,
          loading: false,
          error: response.error,
          lastUpdated: createTimestamp()
        }))
      }
    } catch (error) {
      const authError = error instanceof AuthenticationError 
        ? error 
        : AuthenticationError.fromError(error as Error)

      setState(prev => ({
        ...prev,
        status: AuthStatus.FAILED,
        loading: false,
        error: {
          code: authError.authErrorCode,
          message: authError.message,
          details: authError.details,
          context: authError.context,
          timestamp: createTimestamp(),
          retryable: authError.retryable,
          retryAfter: authError.retryAfter
        },
        lastUpdated: createTimestamp()
      }))
    }
  }, [authService])

  /**
   * Logout current user
   */
  const logout = useCallback(async (): Promise<void> => {
    setState(prev => ({ ...prev, loading: true }))

    try {
      await authService.signOut()
      
      setState({
        status: AuthStatus.LOGGED_OUT,
        loading: false,
        lastUpdated: createTimestamp()
      })
    } catch (error) {
      console.error('Logout failed:', error)
      
      // Force logout even if service call fails
      setState({
        status: AuthStatus.LOGGED_OUT,
        loading: false,
        error: {
          code: AuthErrorCode.AUTH_ERROR,
          message: 'Logout completed with errors',
          timestamp: createTimestamp(),
          retryable: false
        },
        lastUpdated: createTimestamp()
      })
    }
  }, [authService])

  /**
   * Refresh authentication token
   */
  const refreshToken = useCallback(async (): Promise<void> => {
    if (!state.session) return

    setState(prev => ({ ...prev, loading: true }))

    try {
      const response = await authService.refreshToken()
      
      const updatedSession: AuthSession = {
        ...state.session,
        accessToken: response.accessToken,
        refreshToken: response.refreshToken || state.session.refreshToken,
        lastAccessedAt: createTimestamp()
      }

      setState(prev => ({
        ...prev,
        session: updatedSession,
        loading: false,
        lastUpdated: createTimestamp()
      }))
    } catch (error) {
      const authError = error instanceof AuthenticationError 
        ? error 
        : AuthenticationError.fromError(error as Error)

      if (authError.authErrorCode === AuthErrorCode.SESSION_EXPIRED) {
        // Session expired, force logout
        await logout()
      } else {
        setState(prev => ({
          ...prev,
          loading: false,
          error: {
            code: authError.authErrorCode,
            message: authError.message,
            details: authError.details,
            timestamp: createTimestamp(),
            retryable: authError.retryable
          },
          lastUpdated: createTimestamp()
        }))
      }
    }
  }, [authService, state.session, logout])

  /**
   * Check if user has permission for resource/action
   */
  const hasPermission = useCallback((resource: string, action: string): boolean => {
    if (!AuthTypeGuards.isAuthenticatedState(state)) {
      return false
    }

    const { role } = state.user
    
    switch (role) {
      case UserRole.ADMIN:
        return true
      
      case UserRole.DEVELOPER:
        return resource !== 'system' || action !== 'delete'
      
      case UserRole.USER:
        return action === 'read' || (resource === 'project' && action === 'write')
      
      case UserRole.GUEST:
        return action === 'read'
      
      default:
        return false
    }
  }, [state])

  /**
   * Update user preferences
   */
  const updatePreferences = useCallback(async (preferences: Partial<UserPreferences>): Promise<void> => {
    if (!AuthTypeGuards.isAuthenticatedState(state)) {
      throw new AuthenticationError(
        AuthErrorCode.SESSION_EXPIRED,
        'No active session found'
      )
    }

    setState(prev => ({ ...prev, loading: true }))

    try {
      await authService.updatePreferences(preferences)
      
      const updatedUser: UserProfile = {
        ...state.user,
        preferences: {
          ...state.user.preferences,
          ...preferences
        }
      }

      const updatedSession: AuthSession = {
        ...state.session,
        user: updatedUser,
        lastAccessedAt: createTimestamp()
      }

      setState(prev => ({
        ...prev,
        user: updatedUser,
        session: updatedSession,
        loading: false,
        lastUpdated: createTimestamp()
      }))
    } catch (error) {
      const authError = error instanceof AuthenticationError 
        ? error 
        : AuthenticationError.fromError(error as Error)

      setState(prev => ({
        ...prev,
        loading: false,
        error: {
          code: authError.authErrorCode,
          message: authError.message,
          details: authError.details,
          timestamp: createTimestamp(),
          retryable: authError.retryable
        },
        lastUpdated: createTimestamp()
      }))
    }
  }, [authService, state])

  // =============================================================================
  // LIFECYCLE EFFECTS
  // =============================================================================

  /**
   * Initialize authentication state on mount
   */
  useEffect(() => {
    const initializeAuth = async () => {
      setState(prev => ({ ...prev, loading: true }))

      try {
        const isValid = await authService.validateAuth()
        
        if (isValid) {
          const session = await authService.getCurrentSession()
          
          if (session) {
            setState({
              status: AuthStatus.AUTHENTICATED,
              user: session.user,
              session,
              loading: false,
              lastUpdated: createTimestamp()
            })
            return
          }
        }

        // No valid session found
        setState({
          status: AuthStatus.UNAUTHENTICATED,
          loading: false,
          lastUpdated: createTimestamp()
        })
      } catch (error) {
        console.error('Auth initialization failed:', error)
        
        setState({
          status: AuthStatus.UNAUTHENTICATED,
          loading: false,
          error: {
            code: AuthErrorCode.AUTH_ERROR,
            message: 'Authentication initialization failed',
            timestamp: createTimestamp(),
            retryable: true
          },
          lastUpdated: createTimestamp()
        })
      }
    }

    initializeAuth()
  }, [authService])

  /**
   * Persist authentication state changes
   */
  useEffect(() => {
    if (state.status !== AuthStatus.UNAUTHENTICATED) {
      SecureStorage.setItem(STORAGE_KEYS.AUTH_STATE, state)
    }
  }, [state])

  /**
   * Setup automatic token refresh
   */
  useEffect(() => {
    if (!AuthTypeGuards.isAuthenticatedState(state) || !state.session.accessToken) {
      return
    }

    const token = state.session.accessToken
    const expiresAt = new Date(token.expiresAt).getTime()
    const now = Date.now()
    const refreshTime = expiresAt - (5 * 60 * 1000) // Refresh 5 minutes before expiry

    if (refreshTime <= now) {
      // Token is already expired or about to expire
      refreshToken()
      return
    }

    const refreshTimeout = setTimeout(() => {
      refreshToken()
    }, refreshTime - now)

    return () => clearTimeout(refreshTimeout)
  }, [state, refreshToken])

  // =============================================================================
  // CONTEXT VALUE
  // =============================================================================

  const contextValue = useMemo<AuthContextType>(() => ({
    state,
    login,
    logout,
    refreshToken,
    hasPermission,
    updatePreferences
  }), [state, login, logout, refreshToken, hasPermission, updatePreferences])

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}

// =============================================================================
// CONTEXT HOOK
// =============================================================================

/**
 * Hook to access authentication context
 * Must be used within an AuthProvider
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  
  return context
}

// =============================================================================
// UTILITY HOOKS
// =============================================================================

/**
 * Hook to check if user is authenticated
 */
export const useIsAuthenticated = (): boolean => {
  const { state } = useAuth()
  return state.status === AuthStatus.AUTHENTICATED && !!state.user && !!state.session
}

/**
 * Hook to get current user
 */
export const useCurrentUser = (): UserProfile | undefined => {
  const { state } = useAuth()
  return state.user
}

/**
 * Hook to get user permissions checker
 */
export const usePermissions = () => {
  const { hasPermission } = useAuth()
  return {
    hasPermission,
    canRead: (resource: string) => hasPermission(resource, 'read'),
    canWrite: (resource: string) => hasPermission(resource, 'write'),
    canDelete: (resource: string) => hasPermission(resource, 'delete'),
    isAdmin: () => hasPermission('system', 'admin')
  }
}

/**
 * Hook for authentication loading states
 */
export const useAuthLoading = (): boolean => {
  const { state } = useAuth()
  return state.loading
}

/**
 * Hook for authentication errors
 */
export const useAuthError = (): AuthError | undefined => {
  const { state } = useAuth()
  return state.error
}

// =============================================================================
// EXPORTS
// =============================================================================

export default AuthProvider

// Export authentication utilities for external use
export {
  AuthStatus,
  SessionStatus,
  AuthMethod,
  UserRole,
  AuthErrorCode,
  AuthUtils,
  AuthTypeGuards,
  AUTH_CONSTANTS
} from '../../auth/types/auth'

export type {
  AuthState,
  AuthContextType,
  UserProfile,
  UserPreferences,
  AuthSession,
  AuthError,
  AnyAuthRequest
} from '../../auth/types/auth'
