// packages/ui/components/AuthGuard.tsx

/**
 * ReadyAI Authentication Guard Component
 * 
 * Route protection component that manages authentication state and redirects
 * for ReadyAI's UI components. Adapted from Cline's proven authentication 
 * guard patterns with ReadyAI-specific enhancements for local-first auth
 * and enhanced error handling.
 * 
 * Based on Cline's webview authentication guards with ReadyAI adaptations
 * 
 * @version 1.0.0 - Production Ready
 * @author ReadyAI Development Team
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

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
  AuthSession,
  AuthError,
  AuthErrorCode,
  AuthState,
  AuthContextType,
  AuthenticationError,
  AUTH_CONSTANTS,
  DEFAULT_AUTH_CONFIG
} from '../../auth/types/auth'

// Authentication Hook
import { useAuth } from '../hooks/useAuth'

// Error Handling
import { useErrorHandler } from '../hooks/useErrorHandler'

// Logging
import { useLogger } from '../hooks/useLogger'

// =============================================================================
// COMPONENT TYPES
// =============================================================================

/**
 * Authentication guard configuration
 */
export interface AuthGuardConfig {
  /**
   * Roles required to access the protected route
   * If empty or undefined, any authenticated user can access
   */
  requiredRoles?: UserRole[]
  
  /**
   * Specific permissions required
   * Format: "resource:action" (e.g., "project:write", "system:admin")
   */
  requiredPermissions?: string[]
  
  /**
   * Redirect path for unauthenticated users
   * @default "/auth/login"
   */
  redirectTo?: string
  
  /**
   * Path to redirect to after successful authentication
   * If not provided, will redirect to the originally requested path
   */
  returnUrl?: string
  
  /**
   * Whether to show loading spinner during authentication checks
   * @default true
   */
  showLoading?: boolean
  
  /**
   * Custom loading component to display during authentication checks
   */
  loadingComponent?: React.ComponentType
  
  /**
   * Custom fallback component for unauthorized access
   */
  unauthorizedComponent?: React.ComponentType<UnauthorizedProps>
  
  /**
   * Whether to allow access when authentication is in progress
   * @default false
   */
  allowDuringAuthCheck?: boolean
  
  /**
   * Minimum session time remaining (in minutes) before requiring re-auth
   * @default 5
   */
  minSessionTime?: number
}

/**
 * Props for unauthorized access component
 */
export interface UnauthorizedProps {
  error?: AuthError
  requiredRoles?: UserRole[]
  requiredPermissions?: string[]
  onRetry?: () => void
  onLogin?: () => void
}

/**
 * Props for the AuthGuard component
 */
export interface AuthGuardProps {
  children: React.ReactNode
  config?: AuthGuardConfig
  fallback?: React.ReactNode | React.ComponentType<UnauthorizedProps>
}

/**
 * Internal state for authentication checks
 */
interface AuthCheckState {
  isChecking: boolean
  lastCheck: Date | null
  checkId: UUID | null
  error: AuthError | null
}

// =============================================================================
// DEFAULT COMPONENTS
// =============================================================================

/**
 * Default loading component
 */
const DefaultLoadingComponent: React.FC = () => {
  return (
    <div className="ready-ai-auth-guard-loading">
      <div className="loading-spinner" />
      <p>Checking authentication...</p>
    </div>
  )
}

/**
 * Default unauthorized component
 */
const DefaultUnauthorizedComponent: React.FC<UnauthorizedProps> = ({
  error,
  requiredRoles,
  requiredPermissions,
  onRetry,
  onLogin
}) => {
  return (
    <div className="ready-ai-auth-guard-unauthorized">
      <h2>Access Denied</h2>
      <p>
        {error?.message || 'You do not have permission to access this resource.'}
      </p>
      
      {requiredRoles && requiredRoles.length > 0 && (
        <div className="required-roles">
          <h3>Required Roles:</h3>
          <ul>
            {requiredRoles.map(role => (
              <li key={role}>{role}</li>
            ))}
          </ul>
        </div>
      )}
      
      {requiredPermissions && requiredPermissions.length > 0 && (
        <div className="required-permissions">
          <h3>Required Permissions:</h3>
          <ul>
            {requiredPermissions.map(permission => (
              <li key={permission}>{permission}</li>
            ))}
          </ul>
        </div>
      )}
      
      <div className="auth-guard-actions">
        {onRetry && (
          <button onClick={onRetry} className="retry-button">
            Retry
          </button>
        )}
        {onLogin && (
          <button onClick={onLogin} className="login-button">
            Sign In
          </button>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_CONFIG: Required<Omit<AuthGuardConfig, 'requiredRoles' | 'requiredPermissions' | 'returnUrl' | 'loadingComponent' | 'unauthorizedComponent'>> = {
  redirectTo: '/auth/login',
  showLoading: true,
  allowDuringAuthCheck: false,
  minSessionTime: 5
}

const AUTH_CHECK_DEBOUNCE_MS = 100
const SESSION_CHECK_INTERVAL_MS = 60000 // 1 minute

// =============================================================================
// AUTHENTICATION GUARD COMPONENT
// =============================================================================

/**
 * ReadyAI Authentication Guard Component
 * 
 * Protects routes by verifying authentication status, user roles, and permissions.
 * Provides comprehensive access control with Cline-inspired patterns adapted
 * for ReadyAI's local-first architecture.
 * 
 * @param children - Components to render when access is granted
 * @param config - Authentication guard configuration
 * @param fallback - Custom fallback component for unauthorized access
 * 
 * @example
 * ```
 * // Basic authentication guard
 * <AuthGuard>
 *   <ProtectedComponent />
 * </AuthGuard>
 * 
 * // Role-based access control
 * <AuthGuard config={{ requiredRoles: [UserRole.ADMIN] }}>
 *   <AdminPanel />
 * </AuthGuard>
 * 
 * // Permission-based access
 * <AuthGuard config={{ 
 *   requiredPermissions: ['project:write', 'system:read'] 
 * }}>
 *   <ProjectEditor />
 * </AuthGuard>
 * ```
 */
export const AuthGuard: React.FC<AuthGuardProps> = ({ 
  children, 
  config = {}, 
  fallback 
}) => {
  // =============================================================================
  // CONFIGURATION
  // =============================================================================
  
  const mergedConfig = useMemo<Required<AuthGuardConfig>>(
    () => ({
      ...DEFAULT_CONFIG,
      ...config,
      requiredRoles: config.requiredRoles || [],
      requiredPermissions: config.requiredPermissions || [],
      returnUrl: config.returnUrl || undefined,
      loadingComponent: config.loadingComponent || DefaultLoadingComponent,
      unauthorizedComponent: config.unauthorizedComponent || DefaultUnauthorizedComponent
    }),
    [config]
  )

  // =============================================================================
  // HOOKS
  // =============================================================================
  
  const location = useLocation()
  const { handleError } = useErrorHandler()
  const { logInfo, logWarn, logError } = useLogger('AuthGuard')
  
  const {
    isAuthenticated,
    isLoading,
    user,
    session,
    error,
    hasPermission,
    isAdmin,
    login,
    getSessionInfo,
    isSessionExpired,
    retry
  } = useAuth()

  // =============================================================================
  // STATE
  // =============================================================================
  
  const [checkState, setCheckState] = useState<AuthCheckState>({
    isChecking: false,
    lastCheck: null,
    checkId: null,
    error: null
  })

  // Refs for cleanup and debouncing
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const sessionCheckIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const mountedRef = useRef<boolean>(true)

  // =============================================================================
  // AUTHENTICATION CHECKS
  // =============================================================================
  
  /**
   * Performs comprehensive authentication and authorization checks
   */
  const performAuthCheck = useCallback(async (): Promise<boolean> => {
    const checkId = generateUUID()
    
    try {
      setCheckState(prev => ({
        ...prev,
        isChecking: true,
        checkId,
        error: null
      }))

      logInfo('Performing authentication check', { checkId, path: location.pathname })

      // Check if user is authenticated
      if (!isAuthenticated) {
        logWarn('User not authenticated', { checkId })
        return false
      }

      // Check if user object exists
      if (!user) {
        logWarn('User object not available', { checkId })
        return false
      }

      // Check session validity
      if (isSessionExpired()) {
        logWarn('Session expired', { checkId })
        return false
      }

      // Check minimum session time remaining
      const sessionInfo = getSessionInfo()
      if (sessionInfo && mergedConfig.minSessionTime > 0) {
        const minTimeMs = mergedConfig.minSessionTime * 60 * 1000
        if (sessionInfo.remainingTime < minTimeMs) {
          logWarn('Session time below minimum threshold', { 
            checkId, 
            remaining: sessionInfo.remainingTime,
            required: minTimeMs
          })
          return false
        }
      }

      // Check required roles
      if (mergedConfig.requiredRoles.length > 0) {
        const hasRequiredRole = mergedConfig.requiredRoles.some(role => 
          user.role === role || (role === UserRole.ADMIN && isAdmin())
        )
        
        if (!hasRequiredRole) {
          logWarn('User lacks required roles', { 
            checkId,
            userRole: user.role,
            requiredRoles: mergedConfig.requiredRoles
          })
          return false
        }
      }

      // Check required permissions
      if (mergedConfig.requiredPermissions.length > 0) {
        const hasAllPermissions = mergedConfig.requiredPermissions.every(permission => {
          const [resource, action] = permission.split(':')
          return hasPermission(resource, action)
        })
        
        if (!hasAllPermissions) {
          logWarn('User lacks required permissions', { 
            checkId,
            requiredPermissions: mergedConfig.requiredPermissions
          })
          return false
        }
      }

      logInfo('Authentication check passed', { checkId })
      return true

    } catch (error) {
      const authError = error instanceof AuthenticationError 
        ? error.authError 
        : {
            code: AuthErrorCode.UNKNOWN_ERROR,
            message: error instanceof Error ? error.message : 'Unknown authentication error',
            timestamp: createTimestamp()
          }

      logError('Authentication check failed', { checkId, error: authError })
      
      if (mountedRef.current) {
        setCheckState(prev => ({
          ...prev,
          error: authError
        }))
      }
      
      return false
      
    } finally {
      if (mountedRef.current) {
        setCheckState(prev => ({
          ...prev,
          isChecking: false,
          lastCheck: new Date()
        }))
      }
    }
  }, [
    isAuthenticated,
    user,
    isSessionExpired,
    getSessionInfo,
    hasPermission,
    isAdmin,
    mergedConfig.requiredRoles,
    mergedConfig.requiredPermissions,
    mergedConfig.minSessionTime,
    location.pathname,
    logInfo,
    logWarn,
    logError
  ])

  /**
   * Debounced authentication check
   */
  const debouncedAuthCheck = useCallback(() => {
    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current)
    }

    checkTimeoutRef.current = setTimeout(() => {
      performAuthCheck()
    }, AUTH_CHECK_DEBOUNCE_MS)
  }, [performAuthCheck])

  // =============================================================================
  // EVENT HANDLERS
  // =============================================================================
  
  const handleRetry = useCallback(async () => {
    try {
      await retry()
      debouncedAuthCheck()
    } catch (error) {
      handleError(error as ReadyAIError, {
        context: 'AuthGuard.handleRetry',
        severity: 'medium'
      })
    }
  }, [retry, debouncedAuthCheck, handleError])

  const handleLogin = useCallback(() => {
    const returnUrl = mergedConfig.returnUrl || location.pathname
    const loginPath = `${mergedConfig.redirectTo}?returnUrl=${encodeURIComponent(returnUrl)}`
    
    logInfo('Redirecting to login', { loginPath, returnUrl })
    // Navigation will be handled by the Navigate component
  }, [mergedConfig.redirectTo, mergedConfig.returnUrl, location.pathname, logInfo])

  // =============================================================================
  // EFFECTS
  // =============================================================================
  
  // Perform initial authentication check
  useEffect(() => {
    debouncedAuthCheck()
  }, [debouncedAuthCheck])

  // Set up periodic session checking
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      sessionCheckIntervalRef.current = setInterval(() => {
        performAuthCheck()
      }, SESSION_CHECK_INTERVAL_MS)
    }

    return () => {
      if (sessionCheckIntervalRef.current) {
        clearInterval(sessionCheckIntervalRef.current)
      }
    }
  }, [isAuthenticated, isLoading, performAuthCheck])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false
      
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current)
      }
      
      if (sessionCheckIntervalRef.current) {
        clearInterval(sessionCheckIntervalRef.current)
      }
    }
  }, [])

  // =============================================================================
  // RENDER LOGIC
  // =============================================================================
  
  const shouldShowLoading = useMemo(() => {
    return (isLoading || checkState.isChecking) && 
           mergedConfig.showLoading && 
           !mergedConfig.allowDuringAuthCheck
  }, [isLoading, checkState.isChecking, mergedConfig.showLoading, mergedConfig.allowDuringAuthCheck])

  const authCheckResult = useMemo(async () => {
    if (isLoading && !mergedConfig.allowDuringAuthCheck) {
      return null // Show loading
    }

    if (!isAuthenticated) {
      return false // Redirect to login
    }

    return await performAuthCheck()
  }, [isLoading, isAuthenticated, performAuthCheck, mergedConfig.allowDuringAuthCheck])

  // Show loading component
  if (shouldShowLoading) {
    const LoadingComponent = mergedConfig.loadingComponent
    return <LoadingComponent />
  }

  // Handle authentication errors
  if (error || checkState.error) {
    const authError = error || checkState.error!
    
    // For certain error types, redirect to login
    if (authError.code === AuthErrorCode.INVALID_TOKEN || 
        authError.code === AuthErrorCode.TOKEN_EXPIRED ||
        authError.code === AuthErrorCode.UNAUTHORIZED) {
      
      const returnUrl = mergedConfig.returnUrl || location.pathname
      const redirectPath = `${mergedConfig.redirectTo}?returnUrl=${encodeURIComponent(returnUrl)}`
      
      return <Navigate to={redirectPath} replace />
    }

    // Show error component
    if (fallback) {
      if (React.isValidElement(fallback)) {
        return <>{fallback}</>
      }
      
      const FallbackComponent = fallback as React.ComponentType<UnauthorizedProps>
      return (
        <FallbackComponent
          error={authError}
          requiredRoles={mergedConfig.requiredRoles}
          requiredPermissions={mergedConfig.requiredPermissions}
          onRetry={handleRetry}
          onLogin={handleLogin}
        />
      )
    }

    const UnauthorizedComponent = mergedConfig.unauthorizedComponent
    return (
      <UnauthorizedComponent
        error={authError}
        requiredRoles={mergedConfig.requiredRoles}
        requiredPermissions={mergedConfig.requiredPermissions}
        onRetry={handleRetry}
        onLogin={handleLogin}
      />
    )
  }

  // Check authentication state
  return (
    <AuthCheckResolver
      authCheckPromise={authCheckResult}
      redirectTo={mergedConfig.redirectTo}
      returnUrl={mergedConfig.returnUrl || location.pathname}
      onLogin={handleLogin}
      onRetry={handleRetry}
      requiredRoles={mergedConfig.requiredRoles}
      requiredPermissions={mergedConfig.requiredPermissions}
      unauthorizedComponent={mergedConfig.unauthorizedComponent}
      fallback={fallback}
    >
      {children}
    </AuthCheckResolver>
  )
}

// =============================================================================
// AUTH CHECK RESOLVER COMPONENT
// =============================================================================

interface AuthCheckResolverProps {
  children: React.ReactNode
  authCheckPromise: Promise<boolean | null> | boolean | null
  redirectTo: string
  returnUrl: string
  onLogin: () => void
  onRetry: () => void
  requiredRoles: UserRole[]
  requiredPermissions: string[]
  unauthorizedComponent: React.ComponentType<UnauthorizedProps>
  fallback?: React.ReactNode | React.ComponentType<UnauthorizedProps>
}

const AuthCheckResolver: React.FC<AuthCheckResolverProps> = ({
  children,
  authCheckPromise,
  redirectTo,
  returnUrl,
  onLogin,
  onRetry,
  requiredRoles,
  requiredPermissions,
  unauthorizedComponent: UnauthorizedComponent,
  fallback
}) => {
  const [authResult, setAuthResult] = useState<boolean | null>(null)

  useEffect(() => {
    if (authCheckPromise instanceof Promise) {
      authCheckPromise.then(setAuthResult)
    } else {
      setAuthResult(authCheckPromise)
    }
  }, [authCheckPromise])

  // Still checking
  if (authResult === null) {
    return <DefaultLoadingComponent />
  }

  // Authentication failed - redirect to login
  if (authResult === false) {
    const redirectPath = `${redirectTo}?returnUrl=${encodeURIComponent(returnUrl)}`
    return <Navigate to={redirectPath} replace />
  }

  // Authentication passed - render children
  if (authResult === true) {
    return <>{children}</>
  }

  // Fallback - show unauthorized component
  if (fallback) {
    if (React.isValidElement(fallback)) {
      return <>{fallback}</>
    }
    
    const FallbackComponent = fallback as React.ComponentType<UnauthorizedProps>
    return (
      <FallbackComponent
        requiredRoles={requiredRoles}
        requiredPermissions={requiredPermissions}
        onRetry={onRetry}
        onLogin={onLogin}
      />
    )
  }

  return (
    <UnauthorizedComponent
      requiredRoles={requiredRoles}
      requiredPermissions={requiredPermissions}
      onRetry={onRetry}
      onLogin={onLogin}
    />
  )
}

// =============================================================================
// UTILITY HOOKS
// =============================================================================

/**
 * Hook to check if current route is protected
 */
export const useIsProtectedRoute = (config?: AuthGuardConfig): boolean => {
  const { isAuthenticated, user, hasPermission, isAdmin } = useAuth()
  
  return useMemo(() => {
    if (!config) return false
    
    const { requiredRoles = [], requiredPermissions = [] } = config
    
    if (!isAuthenticated || !user) return true
    
    // Check roles
    if (requiredRoles.length > 0) {
      const hasRequiredRole = requiredRoles.some(role => 
        user.role === role || (role === UserRole.ADMIN && isAdmin())
      )
      if (!hasRequiredRole) return true
    }
    
    // Check permissions
    if (requiredPermissions.length > 0) {
      const hasAllPermissions = requiredPermissions.every(permission => {
        const [resource, action] = permission.split(':')
        return hasPermission(resource, action)
      })
      if (!hasAllPermissions) return true
    }
    
    return false
  }, [isAuthenticated, user, hasPermission, isAdmin, config])
}

/**
 * Hook to get authentication redirect URL
 */
export const useAuthRedirectUrl = (config?: AuthGuardConfig): string | null => {
  const location = useLocation()
  const isProtected = useIsProtectedRoute(config)
  
  return useMemo(() => {
    if (!isProtected) return null
    
    const redirectTo = config?.redirectTo || DEFAULT_CONFIG.redirectTo
    const returnUrl = config?.returnUrl || location.pathname
    
    return `${redirectTo}?returnUrl=${encodeURIComponent(returnUrl)}`
  }, [isProtected, config?.redirectTo, config?.returnUrl, location.pathname])
}

// =============================================================================
// EXPORTS
// =============================================================================

export default AuthGuard

// Re-export authentication types for convenience
export {
  AuthStatus,
  SessionStatus,
  AuthMethod,
  UserRole,
  AuthErrorCode,
  AUTH_CONSTANTS
} from '../../auth/types/auth'

export type {
  UserProfile,
  AuthSession,
  AuthError,
  AuthState,
  AuthContextType
} from '../../auth/types/auth'
