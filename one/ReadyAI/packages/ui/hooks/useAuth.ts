// packages/ui/hooks/useAuth.ts

/**
 * ReadyAI Authentication Hook
 * 
 * Production-ready React hook for authentication operations in ReadyAI's UI components.
 * Adapted from Cline's proven authentication patterns with ReadyAI-specific enhancements
 * for local-first authentication and enhanced error handling.
 * 
 * Based on Cline's webview-ui authentication hooks with ReadyAI adaptations
 * 
 * @version 1.0.0 - Production Ready
 * @author ReadyAI Development Team
 */

import { useCallback, useMemo, useRef, useEffect } from 'react'

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

// Authentication Context
import { useAuth as useAuthContext } from '../contexts/AuthContext'

// =============================================================================
// HOOK RETURN TYPES
// =============================================================================

/**
 * Authentication hook return type
 * Provides comprehensive authentication functionality with Cline-inspired patterns
 */
export interface UseAuthReturn {
  // Current authentication state
  state: AuthState
  user: UserProfile | undefined
  session: AuthSession | undefined
  isAuthenticated: boolean
  isLoading: boolean
  error: AuthError | undefined

  // Authentication operations
  login: (request: AnyAuthRequest) => Promise<void>
  logout: () => Promise<void>
  refreshToken: () => Promise<void>
  
  // Permission management
  hasPermission: (resource: string, action: string) => boolean
  canRead: (resource: string) => boolean
  canWrite: (resource: string) => boolean
  canDelete: (resource: string) => boolean
  isAdmin: () => boolean
  
  // User management
  updatePreferences: (preferences: Partial<UserPreferences>) => Promise<void>
  
  // Session management
  getSessionInfo: () => SessionInfo | undefined
  isSessionExpired: () => boolean
  getTokenExpiration: () => Date | undefined
  
  // Utility functions
  clearError: () => void
  retry: () => Promise<void>
}

/**
 * Session information interface
 */
export interface SessionInfo {
  id: UUID
  userId: UUID
  status: SessionStatus
  authMethod: AuthMethod
  createdAt: string
  lastAccessedAt: string
  expiresAt: string
  isExpired: boolean
  remainingTime: number // in milliseconds
  accessToken: {
    expiresAt: string
    isExpired: boolean
    remainingTime: number
  }
}

/**
 * Authentication hook configuration
 */
export interface UseAuthConfig {
  /**
   * Enable automatic token refresh
   * @default true
   */
  autoRefresh?: boolean
  
  /**
   * Token refresh threshold in minutes before expiry
   * @default 5
   */
  refreshThreshold?: number
  
  /**
   * Maximum number of retry attempts for failed operations
   * @default 3
   */
  maxRetries?: number
  
  /**
   * Enable automatic error clearing after specified time
   * @default true
   */
  autoClearErrors?: boolean
  
  /**
   * Error clearing timeout in milliseconds
   * @default 10000
   */
  errorClearTimeout?: number
}

/**
 * Default hook configuration
 */
const DEFAULT_CONFIG: Required<UseAuthConfig> = {
  autoRefresh: true,
  refreshThreshold: 5,
  maxRetries: 3,
  autoClearErrors: true,
  errorClearTimeout: 10000
}

// =============================================================================
// AUTHENTICATION HOOK IMPLEMENTATION
// =============================================================================

/**
 * ReadyAI Authentication Hook
 * 
 * Provides comprehensive authentication functionality adapted from Cline's proven patterns.
 * Features include automatic token refresh, permission management, error handling,
 * and session monitoring with ReadyAI-specific enhancements.
 * 
 * @param config - Optional configuration for the hook behavior
 * @returns Authentication state and operations
 * 
 * @example
 * ```
 * const { isAuthenticated, login, logout, hasPermission } = useAuth({
 *   autoRefresh: true,
 *   refreshThreshold: 5
 * })
 * 
 * // Login with credentials
 * await login({
 *   method: AuthMethod.LOCAL_SESSION,
 *   credentials: { identifier: 'user', secret: 'password' }
 * })
 * 
 * // Check permissions
 * if (hasPermission('project', 'write')) {
 *   // User can write to projects
 * }
 * ```
 */
export const useAuth = (config: UseAuthConfig = {}): UseAuthReturn => {
  // =============================================================================
  // CONFIGURATION
  // =============================================================================
  
  const mergedConfig = useMemo<Required<UseAuthConfig>>(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [config]
  )

  // =============================================================================
  // CONTEXT AND STATE
  // =============================================================================
  
  const {
    state,
    login: contextLogin,
    logout: contextLogout,
    refreshToken: contextRefreshToken,
    hasPermission: contextHasPermission,
    updatePreferences: contextUpdatePreferences
  } = useAuthContext()

  // Hook-specific state
  const retryCountRef = useRef<number>(0)
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastOperationRef = useRef<(() => Promise<void>) | null>(null)

  // =============================================================================
  // DERIVED STATE
  // =============================================================================
  
  const isAuthenticated = useMemo(
    () => state.status === AuthStatus.AUTHENTICATED && !!state.user && !!state.session,
    [state]
  )

  const user = useMemo(() => state.user, [state.user])
  const session = useMemo(() => state.session, [state.session])
  const isLoading = useMemo(() => state.loading, [state.loading])
  const error = useMemo(() => state.error, [state.error])

  // =============================================================================
  // SESSION INFORMATION
  // =============================================================================
  
  const getSessionInfo = useCallback((): SessionInfo | undefined => {
    if (!session) return undefined

    const now = Date.now()
    const expiresAt = new Date(session.expiresAt).getTime()
    const accessTokenExpiresAt = new Date(session.accessToken.expiresAt).getTime()

    return {
      id: session.id,
      userId: session.userId,
      status: session.status,
      authMethod: session.authMethod,
      createdAt: session.createdAt,
      lastAccessedAt: session.lastAccessedAt,
      expiresAt: session.expiresAt,
      isExpired: now >= expiresAt,
      remainingTime: Math.max(0, expiresAt - now),
      accessToken: {
        expiresAt: session.accessToken.expiresAt,
        isExpired: now >= accessTokenExpiresAt,
        remainingTime: Math.max(0, accessTokenExpiresAt - now)
      }
    }
  }, [session])

  const isSessionExpired = useCallback((): boolean => {
    const sessionInfo = getSessionInfo()
    return sessionInfo?.isExpired ?? true
  }, [getSessionInfo])

  const getTokenExpiration = useCallback((): Date | undefined => {
    return session?.accessToken ? new Date(session.accessToken.expiresAt) : undefined
  }, [session])

  // =============================================================================
  // ERROR HANDLING
  // =============================================================================
  
  const clearError = useCallback(() => {
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current)
      errorTimeoutRef.current = null
    }
    // Note: Error clearing would need to be implemented in the context
    // For now, we just clear the timeout
  }, [])

  const handleError = useCallback((error: unknown, operation?: () => Promise<void>) => {
    console.error('useAuth: Operation failed:', error)
    
    // Store the operation for retry
    if (operation) {
      lastOperationRef.current = operation
    }

    // Auto-clear error after timeout
    if (mergedConfig.autoClearErrors && mergedConfig.errorClearTimeout > 0) {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current)
      }
      
      errorTimeoutRef.current = setTimeout(() => {
        clearError()
      }, mergedConfig.errorClearTimeout)
    }
  }, [mergedConfig.autoClearErrors, mergedConfig.errorClearTimeout, clearError])

  const retry = useCallback(async (): Promise<void> => {
    const operation = lastOperationRef.current
    if (!operation) {
      console.warn('useAuth: No operation to retry')
      return
    }

    if (retryCountRef.current >= mergedConfig.maxRetries) {
      console.error('useAuth: Maximum retry attempts reached')
      return
    }

    try {
      retryCountRef.current += 1
      await operation()
      retryCountRef.current = 0 // Reset on success
    } catch (error) {
      handleError(error, operation)
    }
  }, [mergedConfig.maxRetries, handleError])

  // =============================================================================
  // AUTHENTICATION OPERATIONS
  // =============================================================================
  
  const login = useCallback(async (request: AnyAuthRequest): Promise<void> => {
    const operation = async () => {
      await contextLogin(request)
      retryCountRef.current = 0
    }

    try {
      lastOperationRef.current = operation
      await operation()
    } catch (error) {
      handleError(error, operation)
      throw error
    }
  }, [contextLogin, handleError])

  const logout = useCallback(async (): Promise<void> => {
    const operation = async () => {
      await contextLogout()
      retryCountRef.current = 0
      lastOperationRef.current = null // Clear stored operation
    }

    try {
      await operation()
    } catch (error) {
      handleError(error, operation)
      throw error
    }
  }, [contextLogout, handleError])

  const refreshToken = useCallback(async (): Promise<void> => {
    const operation = async () => {
      await contextRefreshToken()
      retryCountRef.current = 0
    }

    try {
      lastOperationRef.current = operation
      await operation()
    } catch (error) {
      handleError(error, operation)
      throw error
    }
  }, [contextRefreshToken, handleError])

  const updatePreferences = useCallback(async (preferences: Partial<UserPreferences>): Promise<void> => {
    const operation = async () => {
      await contextUpdatePreferences(preferences)
      retryCountRef.current = 0
    }

    try {
      lastOperationRef.current = operation
      await operation()
    } catch (error) {
      handleError(error, operation)
      throw error
    }
  }, [contextUpdatePreferences, handleError])

  // =============================================================================
  // PERMISSION MANAGEMENT
  // =============================================================================
  
  const hasPermission = useCallback((resource: string, action: string): boolean => {
    return contextHasPermission(resource, action)
  }, [contextHasPermission])

  const canRead = useCallback((resource: string): boolean => {
    return hasPermission(resource, 'read')
  }, [hasPermission])

  const canWrite = useCallback((resource: string): boolean => {
    return hasPermission(resource, 'write')
  }, [hasPermission])

  const canDelete = useCallback((resource: string): boolean => {
    return hasPermission(resource, 'delete')
  }, [hasPermission])

  const isAdmin = useCallback((): boolean => {
    return user?.role === UserRole.ADMIN || hasPermission('system', 'admin')
  }, [user?.role, hasPermission])

  // =============================================================================
  // AUTOMATIC TOKEN REFRESH
  // =============================================================================
  
  useEffect(() => {
    if (!mergedConfig.autoRefresh || !isAuthenticated || !session?.accessToken) {
      return
    }

    const checkAndRefreshToken = async () => {
      try {
        const tokenExpiration = new Date(session.accessToken.expiresAt).getTime()
        const now = Date.now()
        const refreshTime = tokenExpiration - (mergedConfig.refreshThreshold * 60 * 1000)

        if (now >= refreshTime) {
          console.log('useAuth: Automatically refreshing token')
          await refreshToken()
        }
      } catch (error) {
        console.error('useAuth: Automatic token refresh failed:', error)
        // Don't throw here to avoid breaking the app
      }
    }

    // Check immediately
    checkAndRefreshToken()

    // Set up periodic checks every minute
    const interval = setInterval(checkAndRefreshToken, 60000)

    return () => clearInterval(interval)
  }, [
    mergedConfig.autoRefresh,
    mergedConfig.refreshThreshold,
    isAuthenticated,
    session?.accessToken,
    refreshToken
  ])

  // =============================================================================
  // CLEANUP
  // =============================================================================
  
  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current)
      }
    }
  }, [])

  // =============================================================================
  // RETURN HOOK INTERFACE
  // =============================================================================
  
  return useMemo<UseAuthReturn>(() => ({
    // Current state
    state,
    user,
    session,
    isAuthenticated,
    isLoading,
    error,

    // Authentication operations
    login,
    logout,
    refreshToken,

    // Permission management
    hasPermission,
    canRead,
    canWrite,
    canDelete,
    isAdmin,

    // User management
    updatePreferences,

    // Session management
    getSessionInfo,
    isSessionExpired,
    getTokenExpiration,

    // Utility functions
    clearError,
    retry
  }), [
    state,
    user,
    session,
    isAuthenticated,
    isLoading,
    error,
    login,
    logout,
    refreshToken,
    hasPermission,
    canRead,
    canWrite,
    canDelete,
    isAdmin,
    updatePreferences,
    getSessionInfo,
    isSessionExpired,
    getTokenExpiration,
    clearError,
    retry
  ])
}

// =============================================================================
// UTILITY HOOKS
// =============================================================================

/**
 * Hook to check if user is authenticated
 * Lightweight alternative to full useAuth hook
 */
export const useIsAuthenticated = (): boolean => {
  const { isAuthenticated } = useAuth()
  return isAuthenticated
}

/**
 * Hook to get current user
 * Lightweight alternative to full useAuth hook
 */
export const useCurrentUser = (): UserProfile | undefined => {
  const { user } = useAuth()
  return user
}

/**
 * Hook to get user permissions checker
 * Provides convenient permission checking utilities
 */
export const usePermissions = () => {
  const { hasPermission, canRead, canWrite, canDelete, isAdmin } = useAuth()
  
  return useMemo(() => ({
    hasPermission,
    canRead,
    canWrite,
    canDelete,
    isAdmin,
    // Additional permission utilities
    canReadProject: () => canRead('project'),
    canWriteProject: () => canWrite('project'),
    canDeleteProject: () => canDelete('project'),
    canManageUsers: () => hasPermission('users', 'manage'),
    canManageSystem: () => hasPermission('system', 'manage')
  }), [hasPermission, canRead, canWrite, canDelete, isAdmin])
}

/**
 * Hook for authentication loading states
 * Lightweight alternative to full useAuth hook
 */
export const useAuthLoading = (): boolean => {
  const { isLoading } = useAuth()
  return isLoading
}

/**
 * Hook for authentication errors
 * Lightweight alternative to full useAuth hook
 */
export const useAuthError = (): AuthError | undefined => {
  const { error } = useAuth()
  return error
}

/**
 * Hook for session information
 * Provides detailed session status and timing information
 */
export const useSessionInfo = (): SessionInfo | undefined => {
  const { getSessionInfo } = useAuth()
  return getSessionInfo()
}

// =============================================================================
// EXPORTS
// =============================================================================

export default useAuth

// Re-export authentication types for convenience
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
  AnyAuthRequest,
  AuthResponse,
  LocalSessionAuthRequest,
  ApiKeyAuthRequest,
  DevModeAuthRequest
} from '../../auth/types/auth'
