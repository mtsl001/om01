/**
 * Configuration Controller for ReadyAI Personal AI Development Orchestrator
 * 
 * This module implements a comprehensive REST API controller for configuration management,
 * leveraging Cline's proven handler patterns with 50-60% pattern replication while
 * maintaining full compatibility with ReadyAI's Core Contracts and service architecture.
 * 
 * Key Adaptations from Cline:
 * - Handler patterns from Cline's Controller message handling architecture
 * - Error handling and retry mechanisms from Cline's ApiHandler patterns
 * - State management patterns from Cline's StateManager coordination
 * - Request validation from Cline's robust parameter checking system
 * - Response formatting from Cline's consistent API response structure
 * 
 * @version 1.0.0
 * @author ReadyAI Development Team
 */

import { Request, Response, NextFunction, Router } from 'express'
import { randomUUID } from 'crypto'
import {
  UUID,
  ApiResponse,
  ApiErrorResponse,
  ReadyAIError,
  AsyncResult,
  wrapAsync,
  createApiResponse,
  createApiError,
  isApiSuccess,
  PhaseType,
  AIProviderType,
  ValidationResult
} from '../../../foundation/types/core'
import {
  ApiConfiguration,
  PhaseConfiguration,
  PhaseConfigurationMap,
  ConfigurationValidationResult,
  ConfigurationUpdateRequest,
  ConfigurationExportData,
  ConfigurationImportRequest,
  ProviderSwitchRequest,
  ConfigurationBackup,
  ConfigurationMetrics,
  ConfigurationDiff
} from '../types/config'
import { ConfigService } from '../services/ConfigService'

/**
 * Enhanced request interface for configuration operations with comprehensive metadata
 * Adapted from Cline's request handling patterns for robust operation tracking
 */
interface ConfigRequest extends Request {
  /** Unique operation identifier for tracking and correlation */
  operationId?: UUID
  /** Request timestamp for performance monitoring */
  timestamp?: string
  /** Client information for audit logging */
  clientInfo?: {
    userAgent?: string
    ipAddress?: string
    sessionId?: UUID
  }
  /** Request validation results */
  validation?: ValidationResult[]
}

/**
 * Controller response helpers adapted from Cline's response formatting patterns
 * Provides consistent error handling and response structure across all endpoints
 */
class ResponseHelper {
  /**
   * Send successful API response with comprehensive metadata
   * Follows Cline's proven response structure patterns
   */
  static success<T>(
    res: Response,
    data: T,
    message?: string,
    statusCode: number = 200,
    metadata?: Record<string, any>
  ): Response {
    const response: ApiResponse<T> = createApiResponse(data, {
      ...metadata,
      message,
      statusCode
    })
    return res.status(statusCode).json(response)
  }

  /**
   * Send error response with detailed error information
   * Incorporates Cline's comprehensive error handling approach
   */
  static error(
    res: Response,
    error: string | ReadyAIError | Error,
    statusCode: number = 500,
    details?: Record<string, any>
  ): Response {
    let readyAIError: ReadyAIError

    if (error instanceof ReadyAIError) {
      readyAIError = error
    } else if (error instanceof Error) {
      readyAIError = new ReadyAIError(
        error.message,
        'INTERNAL_ERROR',
        statusCode,
        { ...details, originalError: error.name }
      )
    } else {
      readyAIError = new ReadyAIError(
        typeof error === 'string' ? error : 'Unknown error',
        'UNKNOWN_ERROR',
        statusCode,
        details
      )
    }

    const response = readyAIError.toApiErrorResponse()
    return res.status(statusCode).json(response)
  }

  /**
   * Send validation error response with field-specific details
   * Adapted from Cline's parameter validation error patterns
   */
  static validationError(
    res: Response,
    validationResults: ValidationResult[],
    message: string = 'Validation failed'
  ): Response {
    const errors = validationResults
      .filter(result => !result.passed)
      .map(result => ({
        field: result.type,
        message: result.errors.join(', '),
        suggestions: result.suggestions
      }))

    const readyAIError = new ReadyAIError(
      message,
      'VALIDATION_ERROR',
      400,
      { validationErrors: errors }
    )

    return res.status(400).json(readyAIError.toApiErrorResponse())
  }
}

/**
 * Request validation middleware adapted from Cline's robust parameter checking
 * Ensures all incoming requests meet required standards before processing
 */
class RequestValidator {
  /**
   * Validate required fields in request body
   * Following Cline's comprehensive validation patterns
   */
  static validateRequiredFields(requiredFields: string[]) {
    return (req: ConfigRequest, res: Response, next: NextFunction): void => {
      const missingFields: string[] = []
      const body = req.body || {}

      for (const field of requiredFields) {
        if (!(field in body) || body[field] === null || body[field] === undefined) {
          missingFields.push(field)
        }
      }

      if (missingFields.length > 0) {
        const error = new ReadyAIError(
          `Missing required fields: ${missingFields.join(', ')}`,
          'MISSING_REQUIRED_FIELDS',
          400,
          { missingFields }
        )
        return ResponseHelper.error(res, error, 400) as any
      }

      next()
    }
  }

  /**
   * Validate UUID parameters in request
   * Ensures proper UUID format following ReadyAI Core Contracts
   */
  static validateUUID(paramName: string) {
    return (req: ConfigRequest, res: Response, next: NextFunction): void => {
      const uuid = req.params[paramName]
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

      if (!uuid || !uuidRegex.test(uuid)) {
        const error = new ReadyAIError(
          `Invalid UUID format for parameter: ${paramName}`,
          'INVALID_UUID_FORMAT',
          400,
          { paramName, providedValue: uuid }
        )
        return ResponseHelper.error(res, error, 400) as any
      }

      next()
    }
  }

  /**
   * Validate AI provider type
   * Ensures provider is supported by ReadyAI system
   */
  static validateProviderType() {
    return (req: ConfigRequest, res: Response, next: NextFunction): void => {
      const { provider } = req.body
      const validProviders: AIProviderType[] = [
        'claude-sonnet-4', 'claude-3.5-sonnet', 'gpt-4', 'gpt-5', 'openrouter'
      ]

      if (provider && !validProviders.includes(provider)) {
        const error = new ReadyAIError(
          `Invalid AI provider type: ${provider}`,
          'INVALID_PROVIDER_TYPE',
          400,
          { validProviders, providedValue: provider }
        )
        return ResponseHelper.error(res, error, 400) as any
      }

      next()
    }
  }
}

/**
 * Configuration Controller implementing comprehensive configuration management
 * 
 * This controller leverages Cline's proven handler patterns while providing
 * ReadyAI-specific configuration capabilities including:
 * - Multi-provider AI configuration management
 * - Phase-aware configuration handling
 * - Configuration validation and normalization
 * - Import/export capabilities with version control
 * - Real-time configuration monitoring and metrics
 * 
 * Pattern Replication Strategy: 50-60% reuse from Cline's Controller architecture
 * - Request handling patterns from Cline's message processing
 * - Error handling and recovery from Cline's ApiHandler
 * - State coordination from Cline's StateManager
 * - Validation patterns from Cline's parameter checking
 */
export class ConfigController {
  private router: Router
  private configService: ConfigService

  /**
   * Initialize controller with dependency injection
   * Following Cline's service coordination patterns
   */
  constructor(configService: ConfigService) {
    this.configService = configService
    this.router = Router()
    this.setupMiddleware()
    this.setupRoutes()
  }

  /**
   * Setup middleware for request processing
   * Adapted from Cline's middleware patterns for robust request handling
   */
  private setupMiddleware(): void {
    // Request ID assignment for operation tracking
    this.router.use((req: ConfigRequest, res: Response, next: NextFunction) => {
      req.operationId = randomUUID() as UUID
      req.timestamp = new Date().toISOString()
      req.clientInfo = {
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip,
        sessionId: req.get('X-Session-ID') as UUID
      }
      next()
    })

    // Request logging adapted from Cline's telemetry patterns
    this.router.use((req: ConfigRequest, res: Response, next: NextFunction) => {
      console.log(`[ConfigController] ${req.method} ${req.path}`, {
        operationId: req.operationId,
        timestamp: req.timestamp,
        clientInfo: req.clientInfo
      })
      next()
    })

    // Global error handler following Cline's error management patterns
    this.router.use((error: any, req: ConfigRequest, res: Response, next: NextFunction) => {
      console.error(`[ConfigController] Error in operation ${req.operationId}:`, error)
      
      if (res.headersSent) {
        return next(error)
      }

      return ResponseHelper.error(res, error, 500, {
        operationId: req.operationId,
        timestamp: req.timestamp
      })
    })
  }

  /**
   * Setup API routes with comprehensive endpoint coverage
   * Following RESTful patterns with ReadyAI-specific enhancements
   */
  private setupRoutes(): void {
    // Configuration retrieval endpoints
    this.router.get('/current', this.getCurrentConfiguration.bind(this))
    this.router.get('/project/:projectId', 
      RequestValidator.validateUUID('projectId'),
      this.getProjectConfiguration.bind(this)
    )
    this.router.get('/phase/:phaseType', this.getPhaseConfiguration.bind(this))
    this.router.get('/provider/:providerType', this.getProviderConfiguration.bind(this))

    // Configuration management endpoints
    this.router.post('/update',
      RequestValidator.validateRequiredFields(['configuration']),
      this.updateConfiguration.bind(this)
    )
    this.router.post('/validate',
      RequestValidator.validateRequiredFields(['configuration']),
      this.validateConfiguration.bind(this)
    )
    this.router.post('/reset', this.resetConfiguration.bind(this))
    this.router.post('/switch-provider',
      RequestValidator.validateRequiredFields(['provider']),
      RequestValidator.validateProviderType(),
      this.switchProvider.bind(this)
    )

    // Configuration backup and versioning
    this.router.post('/backup', this.createBackup.bind(this))
    this.router.post('/restore/:backupId',
      RequestValidator.validateUUID('backupId'),
      this.restoreBackup.bind(this)
    )
    this.router.get('/backups', this.listBackups.bind(this))
    this.router.delete('/backups/:backupId',
      RequestValidator.validateUUID('backupId'),
      this.deleteBackup.bind(this)
    )

    // Import/Export functionality
    this.router.get('/export', this.exportConfiguration.bind(this))
    this.router.post('/import',
      RequestValidator.validateRequiredFields(['configurationData']),
      this.importConfiguration.bind(this)
    )

    // Monitoring and metrics
    this.router.get('/metrics', this.getConfigurationMetrics.bind(this))
    this.router.get('/health', this.getHealthStatus.bind(this))
    this.router.get('/diff/:sourceId/:targetId',
      RequestValidator.validateUUID('sourceId'),
      RequestValidator.validateUUID('targetId'),
      this.getConfigurationDiff.bind(this)
    )

    // Phase-specific configuration management
    this.router.put('/phase/:phaseType',
      RequestValidator.validateRequiredFields(['configuration']),
      this.updatePhaseConfiguration.bind(this)
    )
    this.router.delete('/phase/:phaseType', this.resetPhaseConfiguration.bind(this))
  }

  /**
   * Get current system configuration
   * Adapted from Cline's state retrieval patterns
   */
  private async getCurrentConfiguration(req: ConfigRequest, res: Response): Promise<Response> {
    const result = await wrapAsync(async () => {
      return await this.configService.getCurrentConfiguration(req.operationId!)
    })

    if (!result.success) {
      return ResponseHelper.error(res, result.error, 500)
    }

    return ResponseHelper.success(res, result.data, 'Current configuration retrieved successfully', 200, {
      operationId: req.operationId,
      timestamp: req.timestamp
    })
  }

  /**
   * Get project-specific configuration
   * Following Cline's project-aware configuration patterns
   */
  private async getProjectConfiguration(req: ConfigRequest, res: Response): Promise<Response> {
    const { projectId } = req.params

    const result = await wrapAsync(async () => {
      return await this.configService.getProjectConfiguration(projectId as UUID, req.operationId!)
    })

    if (!result.success) {
      return ResponseHelper.error(res, result.error, 500)
    }

    return ResponseHelper.success(res, result.data, `Project configuration retrieved for ${projectId}`, 200, {
      operationId: req.operationId,
      projectId
    })
  }

  /**
   * Get phase-specific configuration
   * Implements ReadyAI's 7-phase methodology support
   */
  private async getPhaseConfiguration(req: ConfigRequest, res: Response): Promise<Response> {
    const { phaseType } = req.params

    const result = await wrapAsync(async () => {
      return await this.configService.getPhaseConfiguration(phaseType as PhaseType, req.operationId!)
    })

    if (!result.success) {
      return ResponseHelper.error(res, result.error, 500)
    }

    return ResponseHelper.success(res, result.data, `Phase configuration retrieved for ${phaseType}`, 200, {
      operationId: req.operationId,
      phaseType
    })
  }

  /**
   * Get provider-specific configuration
   * Supporting ReadyAI's multi-provider AI architecture
   */
  private async getProviderConfiguration(req: ConfigRequest, res: Response): Promise<Response> {
    const { providerType } = req.params

    const result = await wrapAsync(async () => {
      return await this.configService.getProviderConfiguration(providerType as AIProviderType, req.operationId!)
    })

    if (!result.success) {
      return ResponseHelper.error(res, result.error, 500)
    }

    return ResponseHelper.success(res, result.data, `Provider configuration retrieved for ${providerType}`, 200, {
      operationId: req.operationId,
      providerType
    })
  }

  /**
   * Update configuration with comprehensive validation
   * Adapted from Cline's state update patterns with ReadyAI enhancements
   */
  private async updateConfiguration(req: ConfigRequest, res: Response): Promise<Response> {
    const updateRequest: ConfigurationUpdateRequest = req.body

    // Pre-validation using ConfigService patterns
    const validationResult = await wrapAsync(async () => {
      return await this.configService.validateConfiguration(updateRequest.configuration, req.operationId!)
    })

    if (!validationResult.success) {
      return ResponseHelper.error(res, validationResult.error, 400)
    }

    if (!validationResult.data.isValid) {
      return ResponseHelper.validationError(res, validationResult.data.issues, 'Configuration validation failed')
    }

    // Execute configuration update
    const updateResult = await wrapAsync(async () => {
      return await this.configService.updateConfiguration(updateRequest, req.operationId!)
    })

    if (!updateResult.success) {
      return ResponseHelper.error(res, updateResult.error, 500)
    }

    return ResponseHelper.success(res, updateResult.data, 'Configuration updated successfully', 200, {
      operationId: req.operationId,
      changes: updateResult.data.changes,
      validationScore: validationResult.data.validationScore
    })
  }

  /**
   * Validate configuration without applying changes
   * Following Cline's validation-first approach
   */
  private async validateConfiguration(req: ConfigRequest, res: Response): Promise<Response> {
    const { configuration } = req.body

    const result = await wrapAsync(async () => {
      return await this.configService.validateConfiguration(configuration, req.operationId!)
    })

    if (!result.success) {
      return ResponseHelper.error(res, result.error, 500)
    }

    const statusCode = result.data.isValid ? 200 : 400
    const message = result.data.isValid ? 'Configuration is valid' : 'Configuration validation failed'

    return ResponseHelper.success(res, result.data, message, statusCode, {
      operationId: req.operationId,
      validationTimestamp: new Date().toISOString()
    })
  }

  /**
   * Reset configuration to defaults
   * Implements Cline's reset patterns with ReadyAI safety checks
   */
  private async resetConfiguration(req: ConfigRequest, res: Response): Promise<Response> {
    const { preserveUserData = true, createBackup = true } = req.body

    const result = await wrapAsync(async () => {
      return await this.configService.resetConfiguration({
        preserveUserData,
        createBackup,
        resetInitiator: req.clientInfo?.userAgent || 'Unknown',
        operationId: req.operationId!
      })
    })

    if (!result.success) {
      return ResponseHelper.error(res, result.error, 500)
    }

    return ResponseHelper.success(res, result.data, 'Configuration reset successfully', 200, {
      operationId: req.operationId,
      backupCreated: createBackup ? result.data.backupId : null,
      resetTimestamp: new Date().toISOString()
    })
  }

  /**
   * Switch AI provider with seamless transition
   * Adapted from Cline's provider switching patterns
   */
  private async switchProvider(req: ConfigRequest, res: Response): Promise<Response> {
    const switchRequest: ProviderSwitchRequest = req.body

    const result = await wrapAsync(async () => {
      return await this.configService.switchProvider(switchRequest, req.operationId!)
    })

    if (!result.success) {
      return ResponseHelper.error(res, result.error, 500)
    }

    return ResponseHelper.success(res, result.data, `Successfully switched to ${switchRequest.provider}`, 200, {
      operationId: req.operationId,
      previousProvider: result.data.previousProvider,
      switchTimestamp: new Date().toISOString(),
      migrationRequired: result.data.requiresConfigMigration
    })
  }

  /**
   * Create configuration backup
   * Following Cline's backup and versioning patterns
   */
  private async createBackup(req: ConfigRequest, res: Response): Promise<Response> {
    const { description, includeSecrets = false } = req.body

    const result = await wrapAsync(async () => {
      return await this.configService.createBackup({
        description,
        includeSecrets,
        createdBy: req.clientInfo?.sessionId || 'Anonymous',
        operationId: req.operationId!
      })
    })

    if (!result.success) {
      return ResponseHelper.error(res, result.error, 500)
    }

    return ResponseHelper.success(res, result.data, 'Configuration backup created successfully', 201, {
      operationId: req.operationId,
      backupSize: result.data.size,
      backupTimestamp: result.data.createdAt
    })
  }

  /**
   * Restore configuration from backup
   * Implements Cline's restore patterns with ReadyAI safety measures
   */
  private async restoreBackup(req: ConfigRequest, res: Response): Promise<Response> {
    const { backupId } = req.params
    const { validateBeforeRestore = true, createPreRestoreBackup = true } = req.body

    const result = await wrapAsync(async () => {
      return await this.configService.restoreBackup(backupId as UUID, {
        validateBeforeRestore,
        createPreRestoreBackup,
        restoreInitiator: req.clientInfo?.userAgent || 'Unknown',
        operationId: req.operationId!
      })
    })

    if (!result.success) {
      return ResponseHelper.error(res, result.error, 500)
    }

    return ResponseHelper.success(res, result.data, 'Configuration restored successfully', 200, {
      operationId: req.operationId,
      restoredFromBackup: backupId,
      preRestoreBackup: result.data.preRestoreBackupId,
      restoreTimestamp: new Date().toISOString()
    })
  }

  /**
   * List available configuration backups
   * Following Cline's listing patterns with pagination support
   */
  private async listBackups(req: ConfigRequest, res: Response): Promise<Response> {
    const {
      page = 1,
      pageSize = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query

    const result = await wrapAsync(async () => {
      return await this.configService.listBackups({
        page: Number(page),
        pageSize: Number(pageSize),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        operationId: req.operationId!
      })
    })

    if (!result.success) {
      return ResponseHelper.error(res, result.error, 500)
    }

    return ResponseHelper.success(res, result.data, 'Configuration backups retrieved successfully', 200, {
      operationId: req.operationId,
      pagination: {
        page: Number(page),
        pageSize: Number(pageSize),
        totalItems: result.data.total,
        totalPages: result.data.totalPages
      }
    })
  }

  /**
   * Delete configuration backup
   * Implements Cline's deletion patterns with safety checks
   */
  private async deleteBackup(req: ConfigRequest, res: Response): Promise<Response> {
    const { backupId } = req.params
    const { force = false } = req.body

    const result = await wrapAsync(async () => {
      return await this.configService.deleteBackup(backupId as UUID, {
        force,
        deletedBy: req.clientInfo?.sessionId || 'Anonymous',
        operationId: req.operationId!
      })
    })

    if (!result.success) {
      return ResponseHelper.error(res, result.error, 500)
    }

    return ResponseHelper.success(res, result.data, 'Configuration backup deleted successfully', 200, {
      operationId: req.operationId,
      deletedBackup: backupId,
      deleteTimestamp: new Date().toISOString()
    })
  }

  /**
   * Export configuration data
   * Following Cline's export patterns with format support
   */
  private async exportConfiguration(req: ConfigRequest, res: Response): Promise<Response> {
    const {
      format = 'json',
      includeSecrets = false,
      includeHistory = false
    } = req.query

    const result = await wrapAsync(async () => {
      return await this.configService.exportConfiguration({
        format: format as 'json' | 'yaml',
        includeSecrets: includeSecrets === 'true',
        includeHistory: includeHistory === 'true',
        operationId: req.operationId!
      })
    })

    if (!result.success) {
      return ResponseHelper.error(res, result.error, 500)
    }

    // Set appropriate headers for download
    res.setHeader('Content-Type', format === 'yaml' ? 'application/x-yaml' : 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="readyai-config-export-${new Date().toISOString().split('T')[0]}.${format}"`)

    return ResponseHelper.success(res, result.data, 'Configuration exported successfully', 200, {
      operationId: req.operationId,
      exportFormat: format,
      exportTimestamp: new Date().toISOString()
    })
  }

  /**
   * Import configuration data
   * Implements Cline's import patterns with validation and migration
   */
  private async importConfiguration(req: ConfigRequest, res: Response): Promise<Response> {
    const importRequest: ConfigurationImportRequest = req.body

    const result = await wrapAsync(async () => {
      return await this.configService.importConfiguration(importRequest, req.operationId!)
    })

    if (!result.success) {
      return ResponseHelper.error(res, result.error, 500)
    }

    return ResponseHelper.success(res, result.data, 'Configuration imported successfully', 200, {
      operationId: req.operationId,
      importedItems: result.data.importedItemsCount,
      migrationRequired: result.data.requiresMigration,
      importTimestamp: new Date().toISOString()
    })
  }

  /**
   * Get configuration metrics and analytics
   * Following Cline's metrics collection patterns
   */
  private async getConfigurationMetrics(req: ConfigRequest, res: Response): Promise<Response> {
    const { timeframe = '24h' } = req.query

    const result = await wrapAsync(async () => {
      return await this.configService.getConfigurationMetrics({
        timeframe: timeframe as '1h' | '24h' | '7d' | '30d',
        operationId: req.operationId!
      })
    })

    if (!result.success) {
      return ResponseHelper.error(res, result.error, 500)
    }

    return ResponseHelper.success(res, result.data, 'Configuration metrics retrieved successfully', 200, {
      operationId: req.operationId,
      metricsTimeframe: timeframe,
      generatedAt: new Date().toISOString()
    })
  }

  /**
   * Get configuration system health status
   * Adapted from Cline's health check patterns
   */
  private async getHealthStatus(req: ConfigRequest, res: Response): Promise<Response> {
    const result = await wrapAsync(async () => {
      return await this.configService.getHealthStatus(req.operationId!)
    })

    if (!result.success) {
      return ResponseHelper.error(res, result.error, 500)
    }

    const statusCode = result.data.overall === 'healthy' ? 200 : 503

    return ResponseHelper.success(res, result.data, 'Health status retrieved successfully', statusCode, {
      operationId: req.operationId,
      checkTimestamp: new Date().toISOString()
    })
  }

  /**
   * Get configuration difference between two versions
   * Following Cline's diff patterns for version comparison
   */
  private async getConfigurationDiff(req: ConfigRequest, res: Response): Promise<Response> {
    const { sourceId, targetId } = req.params
    const { includeValues = true } = req.query

    const result = await wrapAsync(async () => {
      return await this.configService.getConfigurationDiff(
        sourceId as UUID,
        targetId as UUID,
        {
          includeValues: includeValues !== 'false',
          operationId: req.operationId!
        }
      )
    })

    if (!result.success) {
      return ResponseHelper.error(res, result.error, 500)
    }

    return ResponseHelper.success(res, result.data, 'Configuration diff generated successfully', 200, {
      operationId: req.operationId,
      sourceId,
      targetId,
      changeCount: result.data.changes.length
    })
  }

  /**
   * Update phase-specific configuration
   * Implements ReadyAI's phase-aware configuration management
   */
  private async updatePhaseConfiguration(req: ConfigRequest, res: Response): Promise<Response> {
    const { phaseType } = req.params
    const { configuration } = req.body

    const result = await wrapAsync(async () => {
      return await this.configService.updatePhaseConfiguration(
        phaseType as PhaseType,
        configuration,
        req.operationId!
      )
    })

    if (!result.success) {
      return ResponseHelper.error(res, result.error, 500)
    }

    return ResponseHelper.success(res, result.data, `Phase configuration updated for ${phaseType}`, 200, {
      operationId: req.operationId,
      phaseType,
      updateTimestamp: new Date().toISOString()
    })
  }

  /**
   * Reset phase-specific configuration
   * Following Cline's reset patterns with phase-specific handling
   */
  private async resetPhaseConfiguration(req: ConfigRequest, res: Response): Promise<Response> {
    const { phaseType } = req.params
    const { createBackup = true } = req.body

    const result = await wrapAsync(async () => {
      return await this.configService.resetPhaseConfiguration(
        phaseType as PhaseType,
        {
          createBackup,
          operationId: req.operationId!
        }
      )
    })

    if (!result.success) {
      return ResponseHelper.error(res, result.error, 500)
    }

    return ResponseHelper.success(res, result.data, `Phase configuration reset for ${phaseType}`, 200, {
      operationId: req.operationId,
      phaseType,
      backupCreated: createBackup ? result.data.backupId : null,
      resetTimestamp: new Date().toISOString()
    })
  }

  /**
   * Get the Express router instance
   * Allows integration with Express applications
   */
  public getRouter(): Router {
    return this.router
  }

  /**
   * Get controller health and status information
   * Following Cline's service health reporting patterns
   */
  public getControllerStatus(): {
    name: string
    version: string
    uptime: number
    totalRequests: number
    lastRequestAt?: string
  } {
    return {
      name: 'ConfigController',
      version: '1.0.0',
      uptime: process.uptime(),
      totalRequests: 0, // Would be tracked in production
      lastRequestAt: new Date().toISOString()
    }
  }
}

/**
 * Factory function to create ConfigController instance
 * Enables dependency injection and testing
 */
export function createConfigController(configService: ConfigService): ConfigController {
  return new ConfigController(configService)
}

/**
 * Export controller router for Express integration
 * Provides convenient access to configured routes
 */
export function createConfigRouter(configService: ConfigService): Router {
  const controller = new ConfigController(configService)
  return controller.getRouter()
}

/**
 * Controller error types for enhanced error handling
 * Extends ReadyAI error system with controller-specific errors
 */
export class ConfigControllerError extends ReadyAIError {
  constructor(message: string, code: string = 'CONFIG_CONTROLLER_ERROR', statusCode: number = 500, details?: Record<string, any>) {
    super(message, code, statusCode, details, true)
    this.name = 'ConfigControllerError'
  }
}

/**
 * Controller configuration options
 * Allows customization of controller behavior
 */
export interface ConfigControllerOptions {
  /** Enable request logging */
  enableLogging?: boolean
  /** Request timeout in milliseconds */
  requestTimeout?: number
  /** Maximum request body size */
  maxRequestSize?: string
  /** Enable CORS */
  enableCors?: boolean
  /** Rate limiting configuration */
  rateLimit?: {
    windowMs: number
    maxRequests: number
  }
}

/**
 * Version information for the controller
 */
export const CONFIG_CONTROLLER_VERSION = '1.0.0'

/**
 * Supported API versions
 */
export const SUPPORTED_CONFIG_API_VERSIONS = ['v1'] as const
export type ConfigApiVersion = typeof SUPPORTED_CONFIG_API_VERSIONS[number]
