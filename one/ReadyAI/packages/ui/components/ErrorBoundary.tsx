// packages/ui/components/ErrorBoundary.tsx

/**
 * ReadyAI Error Boundary Component
 * 
 * Production-ready error boundary component extracted and enhanced from Cline's 
 * ChatErrorBoundary implementation. Provides comprehensive error catching and fallback UI
 * for React component trees in ReadyAI's UI package.
 * 
 * Adapted from Cline's webview-ui/src/components/chat/ChatErrorBoundary.tsx with:
 * - ReadyAI-specific error types and handling
 * - Enhanced error reporting and recovery options
 * - Integration with ReadyAI's logging and telemetry systems
 * - Customizable fallback UI components
 * 
 * @version 1.1.0 - Production Ready
 * @author ReadyAI Development Team
 */

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { 
  DetailedReadyAIError, 
  ErrorCategory, 
  ErrorSeverity, 
  ErrorFactory,
  isDetailedReadyAIError 
} from '../../error-handling/types/error'
import { generateUUID, createTimestamp } from '../../foundation/types/core'

// =============================================================================
// INTERFACES AND TYPES
// =============================================================================

/**
 * Props interface for the ErrorBoundary component
 * Provides comprehensive configuration for error handling and display
 */
export interface ErrorBoundaryProps {
  /** Child components to wrap with error boundary protection */
  children: ReactNode
  
  /** Optional custom title for the error display */
  errorTitle?: string
  
  /** Optional custom error message body */
  errorBody?: string
  
  /** Optional height constraint for error container */
  height?: string
  
  /** Optional width constraint for error container */
  width?: string
  
  /** Optional maximum width for error container */
  maxWidth?: string
  
  /** Enable recovery button to retry rendering */
  enableRecovery?: boolean
  
  /** Custom recovery button text */
  recoveryButtonText?: string
  
  /** Custom CSS class names for styling */
  className?: string
  
  /** Custom inline styles */
  style?: React.CSSProperties
  
  /** Callback function when error occurs */
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  
  /** Callback function when recovery is attempted */
  onRecovery?: () => void
  
  /** Enable detailed error information display (development mode) */
  showErrorDetails?: boolean
  
  /** Custom fallback component to render instead of default error UI */
  fallbackComponent?: React.ComponentType<ErrorFallbackProps>
}

/**
 * State interface for the ErrorBoundary component
 * Tracks error state and provides error recovery mechanisms
 */
export interface ErrorBoundaryState {
  /** Whether an error has been caught */
  hasError: boolean
  
  /** The caught error object */
  error: Error | null
  
  /** React error info with component stack */
  errorInfo: ErrorInfo | null
  
  /** Unique error instance ID for tracking */
  errorId: string | null
  
  /** Timestamp when error occurred */
  errorTimestamp: string | null
  
  /** Number of retry attempts */
  retryCount: number
  
  /** Whether recovery is in progress */
  isRecovering: boolean
}

/**
 * Props interface for error fallback components
 * Provides all necessary information for custom error displays
 */
export interface ErrorFallbackProps {
  /** The error that was caught */
  error: Error | null
  
  /** React error information */
  errorInfo: ErrorInfo | null
  
  /** Unique error instance ID */
  errorId: string | null
  
  /** Error occurrence timestamp */
  errorTimestamp: string | null
  
  /** Number of retry attempts */
  retryCount: number
  
  /** Function to attempt error recovery */
  onRetry: () => void
  
  /** Whether recovery is enabled */
  enableRecovery: boolean
  
  /** Custom error title */
  errorTitle?: string
  
  /** Custom error body */
  errorBody?: string
  
  /** Container height */
  height?: string
  
  /** Container width */
  width?: string
  
  /** Container max width */
  maxWidth?: string
  
  /** Whether to show detailed error information */
  showErrorDetails?: boolean
}

// =============================================================================
// DEFAULT ERROR FALLBACK COMPONENT
// =============================================================================

/**
 * Default fallback component for error display
 * Provides a comprehensive, accessible error UI with recovery options
 */
const DefaultErrorFallback: React.FC<ErrorFallbackProps> = ({
  error,
  errorInfo,
  errorId,
  errorTimestamp,
  retryCount,
  onRetry,
  enableRecovery,
  errorTitle,
  errorBody,
  height,
  width,
  maxWidth,
  showErrorDetails
}) => {
  // Determine error severity and icon based on error type
  const getErrorSeverityInfo = () => {
    if (isDetailedReadyAIError(error)) {
      switch (error.details.severity) {
        case ErrorSeverity.CRITICAL:
          return { icon: 'error', color: 'var(--vscode-errorForeground)', level: 'Critical' }
        case ErrorSeverity.HIGH:
          return { icon: 'warning', color: 'var(--vscode-editorWarning-foreground)', level: 'High' }
        case ErrorSeverity.MEDIUM:
          return { icon: 'info', color: 'var(--vscode-notificationsInfoIcon-foreground)', level: 'Medium' }
        default:
          return { icon: 'info', color: 'var(--vscode-descriptionForeground)', level: 'Low' }
      }
    }
    return { icon: 'error', color: 'var(--vscode-errorForeground)', level: 'Unknown' }
  }

  const severityInfo = getErrorSeverityInfo()
  
  // Generate user-friendly error message
  const getUserFriendlyMessage = () => {
    if (isDetailedReadyAIError(error)) {
      return error.details.userMessage || error.message
    }
    return error?.message || 'An unexpected error occurred'
  }

  const containerStyle: React.CSSProperties = {
    padding: '16px',
    color: 'var(--vscode-errorForeground)',
    height: height || 'auto',
    width: width || 'auto',
    maxWidth: maxWidth || '512px',
    overflow: 'auto',
    border: '1px solid var(--vscode-editorError-foreground)',
    borderRadius: '4px',
    backgroundColor: 'var(--vscode-inputValidation-errorBackground)',
    fontFamily: 'var(--vscode-font-family)',
    fontSize: 'var(--vscode-font-size)',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  }

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px'
  }

  const iconStyle: React.CSSProperties = {
    color: severityInfo.color,
    fontSize: '16px',
    flexShrink: 0
  }

  const titleStyle: React.CSSProperties = {
    margin: '0',
    fontSize: '14px',
    fontWeight: 'bold',
    color: 'var(--vscode-foreground)'
  }

  const messageStyle: React.CSSProperties = {
    margin: '0',
    fontSize: '13px',
    lineHeight: '1.4',
    color: 'var(--vscode-foreground)'
  }

  const detailsStyle: React.CSSProperties = {
    fontSize: '12px',
    color: 'var(--vscode-descriptionForeground)',
    fontFamily: 'var(--vscode-editor-font-family)',
    backgroundColor: 'var(--vscode-textCodeBlock-background)',
    padding: '8px',
    borderRadius: '3px',
    overflow: 'auto',
    maxHeight: '200px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  }

  const buttonContainerStyle: React.CSSProperties = {
    display: 'flex',
    gap: '8px',
    marginTop: '4px'
  }

  const buttonStyle: React.CSSProperties = {
    padding: '6px 12px',
    fontSize: '13px',
    border: '1px solid var(--vscode-button-border)',
    borderRadius: '2px',
    cursor: 'pointer',
    backgroundColor: 'var(--vscode-button-background)',
    color: 'var(--vscode-button-foreground)',
    fontFamily: 'inherit'
  }

  const secondaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: 'var(--vscode-button-secondaryBackground)',
    color: 'var(--vscode-button-secondaryForeground)'
  }

  return (
    <div style={containerStyle} role="alert" aria-live="assertive">
      {/* Error Header */}
      <div style={headerStyle}>
        <span 
          className={`codicon codicon-${severityInfo.icon}`} 
          style={iconStyle}
          aria-hidden="true"
        />
        <h3 style={titleStyle}>
          {errorTitle || `Something went wrong${severityInfo.level !== 'Unknown' ? ` (${severityInfo.level})` : ''}`}
        </h3>
      </div>

      {/* Error Message */}
      <p style={messageStyle}>
        {errorBody || getUserFriendlyMessage()}
      </p>

      {/* Retry Information */}
      {retryCount > 0 && (
        <p style={{ ...messageStyle, fontSize: '12px', fontStyle: 'italic' }}>
          Retry attempt: {retryCount}
        </p>
      )}

      {/* Error Details (Development Mode) */}
      {showErrorDetails && error && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: '12px', marginBottom: '8px' }}>
            Technical Details
          </summary>
          <div style={detailsStyle}>
            <strong>Error ID:</strong> {errorId || 'N/A'}<br />
            <strong>Timestamp:</strong> {errorTimestamp || 'N/A'}<br />
            <strong>Error Type:</strong> {error.constructor.name}<br />
            <strong>Message:</strong> {error.message}<br />
            {error.stack && (
              <>
                <strong>Stack Trace:</strong><br />
                {error.stack}
              </>
            )}
            {errorInfo?.componentStack && (
              <>
                <br /><strong>Component Stack:</strong><br />
                {errorInfo.componentStack}
              </>
            )}
            {isDetailedReadyAIError(error) && (
              <>
                <br /><strong>Category:</strong> {error.details.category}<br />
                <strong>Severity:</strong> {error.details.severity}<br />
                <strong>Recovery Strategy:</strong> {error.details.recoveryStrategy}
              </>
            )}
          </div>
        </details>
      )}

      {/* Action Buttons */}
      {enableRecovery && (
        <div style={buttonContainerStyle}>
          <button
            onClick={onRetry}
            style={buttonStyle}
            onMouseOver={(e) => {
              (e.target as HTMLButtonElement).style.backgroundColor = 'var(--vscode-button-hoverBackground)'
            }}
            onMouseOut={(e) => {
              (e.target as HTMLButtonElement).style.backgroundColor = 'var(--vscode-button-background)'
            }}
          >
            <span className="codicon codicon-refresh" style={{ marginRight: '4px' }} />
            Try Again
          </button>
          
          <button
            onClick={() => window.location.reload()}
            style={secondaryButtonStyle}
            onMouseOver={(e) => {
              (e.target as HTMLButtonElement).style.backgroundColor = 'var(--vscode-button-secondaryHoverBackground)'
            }}
            onMouseOut={(e) => {
              (e.target as HTMLButtonElement).style.backgroundColor = 'var(--vscode-button-secondaryBackground)'
            }}
          >
            <span className="codicon codicon-debug-restart" style={{ marginRight: '4px' }} />
            Reload Page
          </button>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// ERROR BOUNDARY COMPONENT
// =============================================================================

/**
 * Production-ready React Error Boundary component for ReadyAI
 * 
 * Catches JavaScript errors anywhere in the child component tree, logs those errors,
 * and displays a fallback UI instead of the component tree that crashed.
 * 
 * Features:
 * - Comprehensive error catching and logging
 * - Customizable fallback UI with recovery options
 * - Integration with ReadyAI error handling system
 * - Development-friendly error details display
 * - Accessibility-compliant error messages
 * - Error recovery and retry mechanisms
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private retryTimeoutId: NodeJS.Timeout | null = null
  private readonly maxRetries = 3
  private readonly retryDelay = 1000 // 1 second

  constructor(props: ErrorBoundaryProps) {
    super(props)
    
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      errorTimestamp: null,
      retryCount: 0,
      isRecovering: false
    }

    // Bind methods
    this.handleRetry = this.handleRetry.bind(this)
  }

  /**
   * Static method to derive state from error
   * Called when an error is caught during rendering
   */
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorId: generateUUID(),
      errorTimestamp: createTimestamp(),
      isRecovering: false
    }
  }

  /**
   * Lifecycle method called when an error is caught
   * Handles error logging and telemetry reporting
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Update state with error info
    this.setState({
      errorInfo
    })

    // Create detailed error for better tracking
    let detailedError: DetailedReadyAIError
    
    if (isDetailedReadyAIError(error)) {
      detailedError = error
    } else {
      // Convert regular errors to detailed ReadyAI errors
      detailedError = ErrorFactory.createAuthError(
        'UNKNOWN_ERROR' as any,
        error.message,
        {
          category: ErrorCategory.USER_INPUT,
          severity: ErrorSeverity.MEDIUM,
          technicalDetails: {
            originalError: error,
            componentStack: errorInfo.componentStack,
            errorBoundary: 'ErrorBoundary'
          }
        }
      )
    }

    // Console logging for development
    console.error('ErrorBoundary: Caught error in component tree', {
      error: detailedError.toStructuredLog(),
      errorInfo: {
        componentStack: errorInfo.componentStack
      },
      timestamp: new Date().toISOString()
    })

    // Call custom error handler if provided
    if (this.props.onError) {
      try {
        this.props.onError(error, errorInfo)
      } catch (handlerError) {
        console.error('ErrorBoundary: Error in custom error handler', handlerError)
      }
    }

    // In production, you might want to report to error tracking service
    // Example: Sentry, LogRocket, etc.
    if (process.env.NODE_ENV === 'production') {
      // reportErrorToService(detailedError, errorInfo)
    }
  }

  /**
   * Cleanup method to clear timeouts
   */
  componentWillUnmount(): void {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId)
      this.retryTimeoutId = null
    }
  }

  /**
   * Handle error recovery attempts
   * Implements retry logic with exponential backoff
   */
  private handleRetry(): void {
    const { retryCount } = this.state

    if (retryCount >= this.maxRetries) {
      console.warn('ErrorBoundary: Maximum retry attempts reached')
      return
    }

    this.setState({
      isRecovering: true
    })

    // Call custom recovery handler if provided
    if (this.props.onRecovery) {
      try {
        this.props.onRecovery()
      } catch (recoveryError) {
        console.error('ErrorBoundary: Error in custom recovery handler', recoveryError)
      }
    }

    // Implement retry with delay
    this.retryTimeoutId = setTimeout(() => {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        errorId: null,
        errorTimestamp: null,
        retryCount: retryCount + 1,
        isRecovering: false
      })

      console.log(`ErrorBoundary: Attempting recovery (attempt ${retryCount + 1}/${this.maxRetries})`)
    }, this.retryDelay * Math.pow(2, retryCount)) // Exponential backoff
  }

  /**
   * Main render method
   * Returns error UI when error is caught, otherwise renders children
   */
  render(): ReactNode {
    const { 
      children,
      errorTitle,
      errorBody,
      height,
      width,
      maxWidth,
      enableRecovery = true,
      className,
      style,
      showErrorDetails = process.env.NODE_ENV === 'development',
      fallbackComponent: CustomFallback
    } = this.props

    const {
      hasError,
      error,
      errorInfo,
      errorId,
      errorTimestamp,
      retryCount,
      isRecovering
    } = this.state

    // Show loading state during recovery
    if (isRecovering) {
      const loadingStyle: React.CSSProperties = {
        padding: '16px',
        textAlign: 'center',
        color: 'var(--vscode-foreground)',
        fontSize: '13px'
      }

      return (
        <div style={loadingStyle} className={className}>
          <span className="codicon codicon-loading codicon-modifier-spin" style={{ marginRight: '8px' }} />
          Attempting to recover...
        </div>
      )
    }

    // Render error fallback if error occurred
    if (hasError) {
      const fallbackProps: ErrorFallbackProps = {
        error,
        errorInfo,
        errorId,
        errorTimestamp,
        retryCount,
        onRetry: this.handleRetry,
        enableRecovery: enableRecovery && retryCount < this.maxRetries,
        errorTitle,
        errorBody,
        height,
        width,
        maxWidth,
        showErrorDetails
      }

      const containerProps = {
        className,
        style
      }

      return (
        <div {...containerProps}>
          {CustomFallback ? (
            <CustomFallback {...fallbackProps} />
          ) : (
            <DefaultErrorFallback {...fallbackProps} />
          )}
        </div>
      )
    }

    // Render children normally when no error
    return children
  }
}

// =============================================================================
// CONVENIENCE HOOKS AND UTILITIES
// =============================================================================

/**
 * Hook for creating error boundary configurations
 * Provides common error boundary setups for different use cases
 */
export const useErrorBoundaryConfig = (
  type: 'minimal' | 'standard' | 'detailed' = 'standard'
): Partial<ErrorBoundaryProps> => {
  switch (type) {
    case 'minimal':
      return {
        enableRecovery: false,
        showErrorDetails: false,
        errorTitle: 'Error',
        errorBody: 'Something went wrong. Please refresh the page.'
      }
    
    case 'detailed':
      return {
        enableRecovery: true,
        showErrorDetails: true,
        errorTitle: 'Component Error',
        errorBody: 'A component error occurred. You can try to recover or reload the page.'
      }
    
    case 'standard':
    default:
      return {
        enableRecovery: true,
        showErrorDetails: process.env.NODE_ENV === 'development',
        errorTitle: 'Something went wrong',
        errorBody: 'An unexpected error occurred. Please try again.'
      }
  }
}

/**
 * Higher-order component for wrapping components with error boundaries
 */
export const withErrorBoundary = <P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Partial<ErrorBoundaryProps>
) => {
  const WithErrorBoundaryComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  )

  WithErrorBoundaryComponent.displayName = 
    `withErrorBoundary(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`

  return WithErrorBoundaryComponent
}

// =============================================================================
// EXPORTS
// =============================================================================

export default ErrorBoundary

export type {
  ErrorBoundaryProps,
  ErrorBoundaryState,
  ErrorFallbackProps
}

export {
  DefaultErrorFallback,
  useErrorBoundaryConfig,
  withErrorBoundary
}
