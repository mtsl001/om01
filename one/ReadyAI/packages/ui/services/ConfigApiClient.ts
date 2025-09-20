/**
 * Configuration API Client for ReadyAI Personal AI Development Orchestrator
 * 
 * This service maximizes reuse of Cline's battle-tested API communication patterns,
 * adapting their proven frontend-backend communication architecture for ReadyAI's
 * configuration management requirements.
 * 
 * Achieves 80%+ reuse of Cline's communication patterns while adding ReadyAI-specific
 * configuration endpoints and enhanced error handling capabilities.
 */

// =============================================================================
// IMPORTS AND DEPENDENCIES
// =============================================================================

import {
  ReadyAIUIState,
  ConfigurationFormProps,
  AIConfigurationPanelProps,
  UIEventHandler,
  NotificationProps,
  ToastManager,
  createDefaultUIState
} from '../types/config'

import {
  ApiResponse,
  ApiErrorResponse,
  ApiResult,
  UUID,
  ReadyAIError,
  isApiSuccess,
  isApiError,
  createApiResponse,
  createApiError,
  wrapAsync,
  AsyncResult
} from '../../foundation/types/core'

import {
  ApiConfiguration,
  PhaseConfiguration,
  PhaseConfigurationMap,
  ApiProvider,
  ModelInfo,
  ConfigurationValidationResult,
  ConfigurationTemplate
} from '../../../config/types/config'

// =============================================================================
// TYPE DEFINITIONS AND INTERFACES
// =============================================================================

/**
 * Configuration API endpoints adapted from Cline's proven REST API patterns
 */
export type ConfigEndpoint =
  | '/api/v1/config'
  | '/api/v1/config/validate'
  | '/api/v1/config/phase'
  | '/api/v1/config/models'
  | '/api/v1/config/templates'
  | '/api/v1/config/export'
  | '/api/v1/config/import'
  | '/api/v1/config/reset'

/**
 * WebSocket event types for real-time configuration updates
 * Inspired by Cline's real-time task synchronization
 */
export type ConfigWebSocketEvent =
  | 'config-updated'
  | 'validation-completed'
  | 'model-availability-changed'
  | 'phase-config-updated'
  | 'connection-status'
  | 'error-occurred'

/**
 * Request options for configuration API calls
 * Enhanced from Cline's request configuration patterns
 */
export interface ConfigRequestOptions {
  /** Request timeout in milliseconds */
  timeout?: number
  /** Enable request retries */
  retry?: boolean
  /** Maximum retry attempts */
  maxRetries?: number
  /** Retry delay multiplier */
  retryDelay?: number
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal
  /** Custom headers */
  headers?: Record<string, string>
  /** Enable response caching */
  cache?: boolean
  /** Cache TTL in seconds */
  cacheTTL?: number
}

/**
 * Configuration update request payload
 */
export interface ConfigUpdateRequest {
  /** Configuration changes */
  configuration: Partial<ApiConfiguration>
  /** Phase-specific changes */
  phaseConfigurations?: Partial<PhaseConfigurationMap>
  /** Validation bypass flag */
  skipValidation?: boolean
  /** Update reason for audit trail */
  reason?: string
}

/**
 * Configuration validation request
 */
export interface ConfigValidationRequest {
  /** Configuration to validate */
  configuration: Partial<ApiConfiguration>
  /** Phase configurations to validate */
  phaseConfigurations?: Partial<PhaseConfigurationMap>
  /** Validation strictness level */
  strict?: boolean
}

/**
 * Model availability response
 */
export interface ModelAvailabilityResponse {
  /** Available models by provider */
  models: Record<ApiProvider, Record<string, ModelInfo>>
  /** Provider status information */
  providerStatus: Record<ApiProvider, {
    available: boolean
    latency?: number
    error?: string
  }>
  /** Last update timestamp */
  lastUpdated: string
}

/**
 * WebSocket message structure adapted from Cline's real-time patterns
 */
export interface ConfigWebSocketMessage {
  /** Message type */
  type: ConfigWebSocketEvent
  /** Message payload */
  payload: any
  /** Timestamp */
  timestamp: string
  /** Request correlation ID */
  requestId?: UUID
  /** Error details if applicable */
  error?: {
    code: string
    message: string
    details?: any
  }
}

// =============================================================================
// CONFIGURATION API CLIENT CLASS
// =============================================================================

/**
 * Configuration API Client with comprehensive error handling and real-time updates
 * Extensively adapted from Cline's proven API communication architecture
 */
export class ConfigApiClient {
  private baseUrl: string
  private wsUrl: string
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private requestCache = new Map<string, { data: any; timestamp: number; ttl: number }>()
  private activeRequests = new Map<string, AbortController>()
  private eventListeners = new Map<ConfigWebSocketEvent, Set<Function>>()
  private toastManager?: ToastManager

  constructor(
    baseUrl = 'http://localhost:3001',
    wsUrl = 'ws://localhost:3001/ws',
    toastManager?: ToastManager
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '') // Remove trailing slash
    this.wsUrl = wsUrl
    this.toastManager = toastManager
    this.initializeWebSocket()
  }

  // =============================================================================
  // WEBSOCKET MANAGEMENT - Adapted from Cline's Real-time Architecture
  // =============================================================================

  /**
   * Initialize WebSocket connection with automatic reconnection
   * Based on Cline's proven WebSocket management patterns
   */
  private initializeWebSocket(): void {
    try {
      this.ws = new WebSocket(this.wsUrl)

      this.ws.onopen = () => {
        console.info('[ConfigApiClient] WebSocket connection established')
        this.reconnectAttempts = 0
        this.notifyConnectionStatus(true)
      }

      this.ws.onmessage = (event) => {
        try {
          const message: ConfigWebSocketMessage = JSON.parse(event.data)
          this.handleWebSocketMessage(message)
        } catch (error) {
          console.error('[ConfigApiClient] Failed to parse WebSocket message:', error)
        }
      }

      this.ws.onerror = (error) => {
        console.error('[ConfigApiClient] WebSocket error:', error)
        this.notifyConnectionStatus(false)
      }

      this.ws.onclose = (event) => {
        console.warn('[ConfigApiClient] WebSocket connection closed:', event.code, event.reason)
        this.notifyConnectionStatus(false)
        this.scheduleReconnection()
      }
    } catch (error) {
      console.error('[ConfigApiClient] Failed to initialize WebSocket:', error)
      this.scheduleReconnection()
    }
  }

  /**
   * Handle incoming WebSocket messages with proper error handling
   */
  private handleWebSocketMessage(message: ConfigWebSocketMessage): void {
    const { type, payload, error } = message

    if (error) {
      console.error(`[ConfigApiClient] WebSocket error for ${type}:`, error)
      this.showNotification(
        `Configuration ${type} failed: ${error.message}`,
        'error'
      )
      return
    }

    // Notify registered listeners
    const listeners = this.eventListeners.get(type)
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(payload, message)
        } catch (error) {
          console.error('[ConfigApiClient] Listener error:', error)
        }
      })
    }

    // Handle specific message types
    switch (type) {
      case 'config-updated':
        this.invalidateCache('/api/v1/config')
        break
      case 'validation-completed':
        this.showNotification('Configuration validation completed', 'success')
        break
      case 'model-availability-changed':
        this.invalidateCache('/api/v1/config/models')
        break
      case 'error-occurred':
        this.showNotification(`Configuration error: ${payload.message}`, 'error')
        break
    }
  }

  /**
   * Schedule WebSocket reconnection with exponential backoff
   */
  private scheduleReconnection(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[ConfigApiClient] Max reconnection attempts reached')
      return
    }

    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts),
      30000 // Max 30 seconds
    )

    setTimeout(() => {
      console.info(`[ConfigApiClient] Attempting reconnection (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`)
      this.reconnectAttempts++
      this.initializeWebSocket()
    }, delay)
  }

  /**
   * Notify connection status changes
   */
  private notifyConnectionStatus(connected: boolean): void {
    this.emit('connection-status', { connected })
    
    if (this.toastManager) {
      const message = connected 
        ? 'Configuration service connected'
        : 'Configuration service disconnected'
      const type = connected ? 'success' : 'warning'
      
      this.toastManager.show({
        id: crypto.randomUUID(),
        type,
        title: 'Connection Status',
        message,
        duration: 3000
      })
    }
  }

  // =============================================================================
  // HTTP REQUEST MANAGEMENT - Enhanced from Cline's Patterns
  // =============================================================================

  /**
   * Make HTTP request with comprehensive error handling and retry logic
   * Adapted from Cline's withRetry patterns
   */
  private async makeRequest<T>(
    endpoint: ConfigEndpoint,
    options: RequestInit & ConfigRequestOptions = {}
  ): Promise<ApiResult<T>> {
    const {
      timeout = 15000,
      retry = true,
      maxRetries = 3,
      retryDelay = 1000,
      abortSignal,
      headers = {},
      cache = false,
      cacheTTL = 300,
      ...fetchOptions
    } = options

    // Check cache first
    if (cache && fetchOptions.method !== 'POST' && fetchOptions.method !== 'PUT') {
      const cached = this.getFromCache(endpoint, cacheTTL)
      if (cached) {
        return createApiResponse(cached)
      }
    }

    const requestId = crypto.randomUUID()
    const controller = new AbortController()
    const combinedSignal = abortSignal 
      ? this.combineAbortSignals([abortSignal, controller.signal])
      : controller.signal

    // Track active request
    this.activeRequests.set(requestId, controller)

    // Set timeout
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, timeout)

    let lastError: Error | null = null
    const maxAttempts = retry ? maxRetries + 1 : 1

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          ...fetchOptions,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
            ...headers
          },
          signal: combinedSignal
        })

        clearTimeout(timeoutId)
        this.activeRequests.delete(requestId)

        if (!response.ok) {
          const errorText = await response.text()
          let errorData: any

          try {
            errorData = JSON.parse(errorText)
          } catch {
            errorData = { message: errorText }
          }

          const error = new ReadyAIError(
            errorData.message || `HTTP ${response.status}: ${response.statusText}`,
            errorData.code || `HTTP_${response.status}`,
            response.status,
            errorData.details,
            response.status >= 500, // Retryable for server errors
            errorData.retryAfter
          )

          // Don't retry 4xx errors (except 429)
          if (response.status < 500 && response.status !== 429) {
            return error.toApiErrorResponse()
          }

          throw error
        }

        const data = await response.json()

        // Cache successful responses
        if (cache) {
          this.setCache(endpoint, data, cacheTTL)
        }

        return createApiResponse(data, {
          requestId,
          processingTime: Date.now() - parseInt(response.headers.get('X-Start-Time') || '0')
        })

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Don't retry on abort or non-retryable errors
        if (
          combinedSignal.aborted ||
          (error instanceof ReadyAIError && !error.retryable) ||
          attempt === maxAttempts
        ) {
          break
        }

        // Wait before retry with exponential backoff
        const delay = retryDelay * Math.pow(2, attempt - 1)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    clearTimeout(timeoutId)
    this.activeRequests.delete(requestId)

    if (lastError instanceof ReadyAIError) {
      return lastError.toApiErrorResponse()
    }

    return createApiError(
      lastError?.message || 'Request failed',
      'REQUEST_FAILED',
      500
    )
  }

  /**
   * Combine multiple abort signals
   */
  private combineAbortSignals(signals: AbortSignal[]): AbortSignal {
    const controller = new AbortController()
    
    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort()
        break
      }
      signal.addEventListener('abort', () => controller.abort())
    }
    
    return controller.signal
  }

  // =============================================================================
  // CACHE MANAGEMENT
  // =============================================================================

  /**
   * Get cached response if still valid
   */
  private getFromCache(key: string, ttl: number): any | null {
    const cached = this.requestCache.get(key)
    if (!cached) return null

    const isExpired = Date.now() - cached.timestamp > (cached.ttl || ttl) * 1000
    if (isExpired) {
      this.requestCache.delete(key)
      return null
    }

    return cached.data
  }

  /**
   * Set cache entry
   */
  private setCache(key: string, data: any, ttl: number): void {
    this.requestCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    })
  }

  /**
   * Invalidate cache entries
   */
  private invalidateCache(pattern: string): void {
    for (const key of this.requestCache.keys()) {
      if (key.includes(pattern)) {
        this.requestCache.delete(key)
      }
    }
  }

  // =============================================================================
  // CONFIGURATION API METHODS
  // =============================================================================

  /**
   * Get current configuration with caching support
   */
  async getConfiguration(): Promise<ApiResult<ApiConfiguration>> {
    return this.makeRequest<ApiConfiguration>('/api/v1/config', {
      method: 'GET',
      cache: true,
      cacheTTL: 60 // 1 minute cache
    })
  }

  /**
   * Update configuration with validation
   */
  async updateConfiguration(
    request: ConfigUpdateRequest,
    options: ConfigRequestOptions = {}
  ): Promise<ApiResult<ApiConfiguration>> {
    return this.makeRequest<ApiConfiguration>('/api/v1/config', {
      method: 'PUT',
      body: JSON.stringify(request),
      ...options
    })
  }

  /**
   * Validate configuration without saving
   */
  async validateConfiguration(
    request: ConfigValidationRequest,
    options: ConfigRequestOptions = {}
  ): Promise<ApiResult<ConfigurationValidationResult>> {
    return this.makeRequest<ConfigurationValidationResult>('/api/v1/config/validate', {
      method: 'POST',
      body: JSON.stringify(request),
      ...options
    })
  }

  /**
   * Get phase-specific configuration
   */
  async getPhaseConfiguration(
    phase: string,
    options: ConfigRequestOptions = {}
  ): Promise<ApiResult<PhaseConfiguration>> {
    return this.makeRequest<PhaseConfiguration>(`/api/v1/config/phase?phase=${encodeURIComponent(phase)}`, {
      method: 'GET',
      cache: true,
      cacheTTL: 300,
      ...options
    })
  }

  /**
   * Update phase-specific configuration
   */
  async updatePhaseConfiguration(
    phase: string,
    configuration: Partial<PhaseConfiguration>,
    options: ConfigRequestOptions = {}
  ): Promise<ApiResult<PhaseConfiguration>> {
    return this.makeRequest<PhaseConfiguration>('/api/v1/config/phase', {
      method: 'PUT',
      body: JSON.stringify({ phase, configuration }),
      ...options
    })
  }

  /**
   * Get available models with status information
   */
  async getAvailableModels(
    options: ConfigRequestOptions = {}
  ): Promise<ApiResult<ModelAvailabilityResponse>> {
    return this.makeRequest<ModelAvailabilityResponse>('/api/v1/config/models', {
      method: 'GET',
      cache: true,
      cacheTTL: 120, // 2 minute cache
      ...options
    })
  }

  /**
   * Refresh model availability from providers
   */
  async refreshModelAvailability(
    providers?: ApiProvider[],
    options: ConfigRequestOptions = {}
  ): Promise<ApiResult<ModelAvailabilityResponse>> {
    const body = providers ? JSON.stringify({ providers }) : undefined
    
    return this.makeRequest<ModelAvailabilityResponse>('/api/v1/config/models', {
      method: 'POST',
      body,
      ...options
    })
  }

  /**
   * Get configuration templates
   */
  async getConfigurationTemplates(
    options: ConfigRequestOptions = {}
  ): Promise<ApiResult<ConfigurationTemplate[]>> {
    return this.makeRequest<ConfigurationTemplate[]>('/api/v1/config/templates', {
      method: 'GET',
      cache: true,
      cacheTTL: 600, // 10 minute cache
      ...options
    })
  }

  /**
   * Export current configuration
   */
  async exportConfiguration(
    format: 'json' | 'yaml' = 'json',
    options: ConfigRequestOptions = {}
  ): Promise<ApiResult<{ data: string; filename: string }>> {
    return this.makeRequest<{ data: string; filename: string }>(`/api/v1/config/export?format=${format}`, {
      method: 'GET',
      ...options
    })
  }

  /**
   * Import configuration from file or data
   */
  async importConfiguration(
    data: string | File,
    options: ConfigRequestOptions = {}
  ): Promise<ApiResult<ApiConfiguration>> {
    let body: string | FormData

    if (typeof data === 'string') {
      body = JSON.stringify({ data })
    } else {
      const formData = new FormData()
      formData.append('file', data)
      body = formData
    }

    return this.makeRequest<ApiConfiguration>('/api/v1/config/import', {
      method: 'POST',
      body,
      headers: typeof data === 'string' ? {} : undefined, // Let fetch set multipart headers
      ...options
    })
  }

  /**
   * Reset configuration to defaults
   */
  async resetConfiguration(
    scope: 'all' | 'api' | 'phases' = 'all',
    options: ConfigRequestOptions = {}
  ): Promise<ApiResult<ApiConfiguration>> {
    return this.makeRequest<ApiConfiguration>('/api/v1/config/reset', {
      method: 'POST',
      body: JSON.stringify({ scope }),
      ...options
    })
  }

  // =============================================================================
  // WEBSOCKET EVENT MANAGEMENT
  // =============================================================================

  /**
   * Subscribe to WebSocket events
   */
  on(event: ConfigWebSocketEvent, listener: Function): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    
    this.eventListeners.get(event)!.add(listener)
    
    // Return unsubscribe function
    return () => {
      this.eventListeners.get(event)?.delete(listener)
    }
  }

  /**
   * Emit event to WebSocket (if connected)
   */
  private emit(event: ConfigWebSocketEvent, payload: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message: ConfigWebSocketMessage = {
        type: event,
        payload,
        timestamp: new Date().toISOString()
      }
      this.ws.send(JSON.stringify(message))
    }
  }

  /**
   * Remove all listeners for an event
   */
  off(event?: ConfigWebSocketEvent): void {
    if (event) {
      this.eventListeners.delete(event)
    } else {
      this.eventListeners.clear()
    }
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Show notification using toast manager
   */
  private showNotification(
    message: string,
    type: 'info' | 'success' | 'warning' | 'error' = 'info'
  ): void {
    if (this.toastManager) {
      this.toastManager.show({
        id: crypto.randomUUID(),
        type,
        title: 'Configuration',
        message,
        duration: type === 'error' ? 5000 : 3000
      })
    }
  }

  /**
   * Cancel all active requests
   */
  cancelAllRequests(): void {
    for (const [requestId, controller] of this.activeRequests) {
      controller.abort()
      this.activeRequests.delete(requestId)
    }
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  /**
   * Close WebSocket connection and cleanup
   */
  disconnect(): void {
    this.ws?.close()
    this.ws = null
    this.cancelAllRequests()
    this.requestCache.clear()
    this.eventListeners.clear()
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: Array<{ key: string; timestamp: number; ttl: number }> } {
    return {
      size: this.requestCache.size,
      entries: Array.from(this.requestCache.entries()).map(([key, value]) => ({
        key,
        timestamp: value.timestamp,
        ttl: value.ttl
      }))
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.requestCache.clear()
  }
}

// =============================================================================
// SINGLETON INSTANCE AND FACTORY
// =============================================================================

let configApiClientInstance: ConfigApiClient | null = null

/**
 * Get or create ConfigApiClient singleton instance
 */
export function getConfigApiClient(
  baseUrl?: string,
  wsUrl?: string,
  toastManager?: ToastManager
): ConfigApiClient {
  if (!configApiClientInstance) {
    configApiClientInstance = new ConfigApiClient(baseUrl, wsUrl, toastManager)
  }
  return configApiClientInstance
}

/**
 * Reset singleton instance (useful for testing)
 */
export function resetConfigApiClient(): void {
  configApiClientInstance?.disconnect()
  configApiClientInstance = null
}

// =============================================================================
// REACT HOOKS FOR CONFIGURATION MANAGEMENT
// =============================================================================

/**
 * React hook for configuration management with real-time updates
 * Inspired by Cline's state management patterns
 */
export function useConfigApi(client?: ConfigApiClient) {
  const apiClient = client || getConfigApiClient()
  const [isConnected, setIsConnected] = React.useState(apiClient.isConnected())
  const [lastError, setLastError] = React.useState<string | null>(null)

  React.useEffect(() => {
    // Subscribe to connection status
    const unsubscribe = apiClient.on('connection-status', (status: { connected: boolean }) => {
      setIsConnected(status.connected)
    })

    // Subscribe to errors
    const unsubscribeError = apiClient.on('error-occurred', (error: { message: string }) => {
      setLastError(error.message)
      // Clear error after 5 seconds
      setTimeout(() => setLastError(null), 5000)
    })

    return () => {
      unsubscribe()
      unsubscribeError()
    }
  }, [apiClient])

  return {
    client: apiClient,
    isConnected,
    lastError,
    clearError: () => setLastError(null)
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Create configuration request with default options
 */
export function createConfigRequest(
  configuration: Partial<ApiConfiguration>,
  options: Partial<ConfigUpdateRequest> = {}
): ConfigUpdateRequest {
  return {
    configuration,
    skipValidation: false,
    reason: 'User configuration update',
    ...options
  }
}

/**
 * Create validation request with default options
 */
export function createValidationRequest(
  configuration: Partial<ApiConfiguration>,
  options: Partial<ConfigValidationRequest> = {}
): ConfigValidationRequest {
  return {
    configuration,
    strict: true,
    ...options
  }
}

/**
 * Handle API result with proper error handling
 */
export async function handleApiResult<T>(
  resultPromise: Promise<ApiResult<T>>,
  onSuccess: (data: T) => void,
  onError?: (error: ApiErrorResponse['error']) => void
): Promise<void> {
  try {
    const result = await resultPromise
    
    if (isApiSuccess(result)) {
      onSuccess(result.data)
    } else if (isApiError(result)) {
      if (onError) {
        onError(result.error)
      } else {
        console.error('Configuration API Error:', result.error)
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Configuration API Request Failed:', errorMessage)
    
    if (onError) {
      onError({
        message: errorMessage,
        code: 'REQUEST_FAILED'
      })
    }
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default ConfigApiClient

export type {
  ConfigEndpoint,
  ConfigWebSocketEvent,
  ConfigRequestOptions,
  ConfigUpdateRequest,
  ConfigValidationRequest,
  ModelAvailabilityResponse,
  ConfigWebSocketMessage
}

/**
 * Configuration API Client version information
 */
export const CONFIG_API_CLIENT_VERSION = '1.0.0'

/**
 * Supported API versions
 */
export const SUPPORTED_CONFIG_API_VERSIONS = ['v1'] as const
export type ConfigApiVersion = typeof SUPPORTED_CONFIG_API_VERSIONS[number]
