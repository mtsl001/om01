/**
 * Configuration API Routes for ReadyAI Personal AI Development Orchestrator
 * 
 * This module implements Express.js routes for configuration management, leveraging Cline's
 * proven REST API patterns with 50-60% pattern replication while maintaining full 
 * compatibility with ReadyAI's Core Contracts and service architecture.
 * 
 * Key Adaptations from Cline:
 * - Router patterns from Cline's protobuf service definitions
 * - Error handling and middleware patterns from Cline's robust request processing
 * - Response formatting from Cline's consistent API response structure
 * - Request validation from Cline's comprehensive parameter checking
 * - Async patterns from Cline's battle-tested controller architecture
 * 
 * @version 1.0.0
 * @author ReadyAI Development Team
 */

import { Request, Response, NextFunction, Router } from 'express'
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
} from '../../../packages/foundation/types/core'
import { ConfigController } from '../../../packages/config/controllers/ConfigController'
import { ConfigService } from '../../../packages/config/services/ConfigService'

/**
 * Configuration API Router
 * 
 * Implements RESTful endpoints for ReadyAI configuration management,
 * following Cline's proven route organization patterns while extending
 * with ReadyAI-specific functionality.
 */
export const configRouter = Router()

/**
 * Global configuration controller instance
 * Follows Cline's singleton pattern for controller management
 */
const configController = new ConfigController(new ConfigService())

// =============================================================================
// MIDDLEWARE PATTERNS (Adapted from Cline's Request Processing)
// =============================================================================

/**
 * Request logging middleware adapted from Cline's telemetry patterns
 */
const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const requestId = crypto.randomUUID()
  const startTime = Date.now()
  
  // Attach request metadata (Cline pattern)
  req.metadata = {
    requestId,
    timestamp: new Date().toISOString(),
    startTime,
    path: req.path,
    method: req.method
  }
  
  console.log(`[${req.metadata.requestId}] ${req.method} ${req.path} - Started`)
  
  // Response completion logging (Cline pattern)
  res.on('finish', () => {
    const duration = Date.now() - startTime
    console.log(
      `[${req.metadata.requestId}] ${req.method} ${req.path} - ` +
      `${res.statusCode} (${duration}ms)`
    )
  })
  
  next()
}

/**
 * Error handling middleware adapted from Cline's comprehensive error patterns
 */
const errorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const requestId = req.metadata?.requestId || 'unknown'
  
  console.error(`[${requestId}] Error in ${req.method} ${req.path}:`, error)
  
  // Handle ReadyAI errors (following Cline's error discrimination pattern)
  if (error instanceof ReadyAIError) {
    res.status(error.statusCode || 500).json(error.toApiErrorResponse())
    return
  }
  
  // Handle validation errors (Cline pattern)
  if (error.name === 'ValidationError') {
    const apiError = createApiError(
      error.message,
      'VALIDATION_ERROR',
      400,
      { field: error.field, value: error.value }
    )
    res.status(400).json(apiError)
    return
  }
  
  // Default error response (Cline's fallback pattern)
  const apiError = createApiError(
    'Internal server error',
    'INTERNAL_ERROR',
    500,
    process.env.NODE_ENV === 'development' ? { stack: error.stack } : undefined
  )
  res.status(500).json(apiError)
}

/**
 * UUID validation middleware adapted from Cline's parameter validation patterns
 */
const validateUUID = (paramName: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const uuid = req.params[paramName]
    
    if (!uuid) {
      const error = createApiError(
        `Missing required parameter: ${paramName}`,
        'MISSING_PARAMETER',
        400
      )
      res.status(400).json(error)
      return
    }
    
    // Basic UUID format validation (Cline pattern)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(uuid)) {
      const error = createApiError(
        `Invalid UUID format: ${paramName}`,
        'INVALID_UUID',
        400,
        { paramName, value: uuid }
      )
      res.status(400).json(error)
      return
    }
    
    next()
  }
}

// Apply global middleware (Cline pattern)
configRouter.use(requestLogger)

// =============================================================================
// CONFIGURATION ENDPOINTS (Pattern-Replicated from Cline's REST API)
// =============================================================================

/**
 * GET /configs
 * List all configurations with optional filtering
 * 
 * Adapted from Cline's task history endpoint patterns
 * 
 * Query Parameters:
 * - limit: number (default: 50, max: 100)
 * - offset: number (default: 0)
 * - search: string (optional search filter)
 * - sort: string (name|created|modified, default: name)
 * - order: string (asc|desc, default: asc)
 */
configRouter.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await wrapAsync(async () => {
      // Parameter validation with defaults (Cline pattern)
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100)
      const offset = parseInt(req.query.offset as string) || 0
      const search = req.query.search as string || undefined
      const sort = (req.query.sort as string) || 'name'
      const order = (req.query.order as string) || 'asc'
      
      // Validate sort field (Cline validation pattern)
      const validSortFields = ['name', 'created', 'modified']
      if (!validSortFields.includes(sort)) {
        throw new ReadyAIError(
          `Invalid sort field: ${sort}. Valid options: ${validSortFields.join(', ')}`,
          'INVALID_SORT_FIELD',
          400
        )
      }
      
      // Validate order (Cline validation pattern)
      const validOrders = ['asc', 'desc']
      if (!validOrders.includes(order)) {
        throw new ReadyAIError(
          `Invalid order: ${order}. Valid options: ${validOrders.join(', ')}`,
          'INVALID_ORDER',
          400
        )
      }
      
      return await configController.getConfigurations({
        limit,
        offset,
        search,
        sort,
        order
      })
    })
    
    if (!isApiSuccess(result)) {
      next(result.error)
      return
    }
    
    const response = createApiResponse(result.data, {
      requestId: req.metadata?.requestId,
      timestamp: new Date().toISOString(),
      metrics: {
        processingTime: Date.now() - (req.metadata?.startTime || Date.now())
      }
    })
    
    res.json(response)
  } catch (error) {
    next(error)
  }
})

/**
 * GET /configs/:configId
 * Get a specific configuration by ID
 * 
 * Adapted from Cline's showTaskWithId endpoint pattern
 */
configRouter.get('/:configId', validateUUID('configId'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await wrapAsync(async () => {
      const configId = req.params.configId as UUID
      return await configController.getConfiguration(configId)
    })
    
    if (!isApiSuccess(result)) {
      // Handle not found case (Cline pattern)
      if (result.error.message.includes('not found')) {
        const error = createApiError(
          `Configuration not found: ${req.params.configId}`,
          'CONFIG_NOT_FOUND',
          404
        )
        res.status(404).json(error)
        return
      }
      next(result.error)
      return
    }
    
    const response = createApiResponse(result.data, {
      requestId: req.metadata?.requestId,
      timestamp: new Date().toISOString()
    })
    
    res.json(response)
  } catch (error) {
    next(error)
  }
})

/**
 * POST /configs
 * Create a new configuration
 * 
 * Adapted from Cline's newTask endpoint pattern
 * 
 * Request Body:
 * - name: string (required)
 * - description?: string
 * - aiSettings: object (required)
 * - quality: object (required) 
 * - development?: object
 */
configRouter.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await wrapAsync(async () => {
      // Request body validation (Cline pattern)
      const { name, description, aiSettings, quality, development } = req.body
      
      if (!name || typeof name !== 'string') {
        throw new ReadyAIError(
          'Configuration name is required and must be a string',
          'INVALID_NAME',
          400,
          { field: 'name', value: name }
        )
      }
      
      if (!aiSettings || typeof aiSettings !== 'object') {
        throw new ReadyAIError(
          'AI settings are required and must be an object',
          'INVALID_AI_SETTINGS',
          400,
          { field: 'aiSettings', value: aiSettings }
        )
      }
      
      if (!quality || typeof quality !== 'object') {
        throw new ReadyAIError(
          'Quality settings are required and must be an object',
          'INVALID_QUALITY_SETTINGS',
          400,
          { field: 'quality', value: quality }
        )
      }
      
      return await configController.createConfiguration({
        name: name.trim(),
        description: description?.trim(),
        aiSettings,
        quality,
        development: development || {}
      })
    })
    
    if (!isApiSuccess(result)) {
      next(result.error)
      return
    }
    
    const response = createApiResponse(result.data, {
      requestId: req.metadata?.requestId,
      timestamp: new Date().toISOString()
    })
    
    res.status(201).json(response)
  } catch (error) {
    next(error)
  }
})

/**
 * PUT /configs/:configId
 * Update an existing configuration
 * 
 * Adapted from Cline's updateSettings endpoint pattern
 */
configRouter.put('/:configId', validateUUID('configId'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await wrapAsync(async () => {
      const configId = req.params.configId as UUID
      const updates = req.body
      
      // Validate at least one field is being updated (Cline pattern)
      const allowedFields = ['name', 'description', 'aiSettings', 'quality', 'development']
      const providedFields = Object.keys(updates).filter(key => allowedFields.includes(key))
      
      if (providedFields.length === 0) {
        throw new ReadyAIError(
          'At least one valid field must be provided for update',
          'NO_UPDATE_FIELDS',
          400,
          { allowedFields }
        )
      }
      
      // Validate individual fields if provided (Cline validation pattern)
      if (updates.name !== undefined && (typeof updates.name !== 'string' || !updates.name.trim())) {
        throw new ReadyAIError(
          'Name must be a non-empty string',
          'INVALID_NAME',
          400,
          { field: 'name', value: updates.name }
        )
      }
      
      return await configController.updateConfiguration(configId, updates)
    })
    
    if (!isApiSuccess(result)) {
      // Handle not found case (Cline pattern)
      if (result.error.message.includes('not found')) {
        const error = createApiError(
          `Configuration not found: ${req.params.configId}`,
          'CONFIG_NOT_FOUND',
          404
        )
        res.status(404).json(error)
        return
      }
      next(result.error)
      return
    }
    
    const response = createApiResponse(result.data, {
      requestId: req.metadata?.requestId,
      timestamp: new Date().toISOString()
    })
    
    res.json(response)
  } catch (error) {
    next(error)
  }
})

/**
 * DELETE /configs/:configId
 * Delete a configuration
 * 
 * Adapted from Cline's deleteTasksWithIds endpoint pattern
 */
configRouter.delete('/:configId', validateUUID('configId'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await wrapAsync(async () => {
      const configId = req.params.configId as UUID
      return await configController.deleteConfiguration(configId)
    })
    
    if (!isApiSuccess(result)) {
      // Handle not found case (Cline pattern)
      if (result.error.message.includes('not found')) {
        const error = createApiError(
          `Configuration not found: ${req.params.configId}`,
          'CONFIG_NOT_FOUND',
          404
        )
        res.status(404).json(error)
        return
      }
      next(result.error)
      return
    }
    
    const response = createApiResponse(result.data, {
      requestId: req.metadata?.requestId,
      timestamp: new Date().toISOString()
    })
    
    res.json(response)
  } catch (error) {
    next(error)
  }
})

/**
 * POST /configs/:configId/validate
 * Validate a configuration
 * 
 * Adapted from Cline's validation service patterns
 */
configRouter.post('/:configId/validate', validateUUID('configId'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await wrapAsync(async () => {
      const configId = req.params.configId as UUID
      return await configController.validateConfiguration(configId)
    })
    
    if (!isApiSuccess(result)) {
      // Handle not found case (Cline pattern)
      if (result.error.message.includes('not found')) {
        const error = createApiError(
          `Configuration not found: ${req.params.configId}`,
          'CONFIG_NOT_FOUND',
          404
        )
        res.status(404).json(error)
        return
      }
      next(result.error)
      return
    }
    
    const response = createApiResponse(result.data, {
      requestId: req.metadata?.requestId,
      timestamp: new Date().toISOString()
    })
    
    res.json(response)
  } catch (error) {
    next(error)
  }
})

/**
 * GET /configs/:configId/export
 * Export configuration as JSON
 * 
 * Adapted from Cline's exportTaskWithId endpoint pattern
 */
configRouter.get('/:configId/export', validateUUID('configId'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await wrapAsync(async () => {
      const configId = req.params.configId as UUID
      const format = (req.query.format as string) || 'json'
      
      // Validate export format (Cline validation pattern)
      const validFormats = ['json', 'yaml']
      if (!validFormats.includes(format)) {
        throw new ReadyAIError(
          `Invalid export format: ${format}. Valid options: ${validFormats.join(', ')}`,
          'INVALID_FORMAT',
          400,
          { format, validFormats }
        )
      }
      
      return await configController.exportConfiguration(configId, format)
    })
    
    if (!isApiSuccess(result)) {
      // Handle not found case (Cline pattern)
      if (result.error.message.includes('not found')) {
        const error = createApiError(
          `Configuration not found: ${req.params.configId}`,
          'CONFIG_NOT_FOUND',
          404
        )
        res.status(404).json(error)
        return
      }
      next(result.error)
      return
    }
    
    // Set appropriate content type based on format (Cline pattern)
    const format = (req.query.format as string) || 'json'
    const contentType = format === 'yaml' ? 'application/x-yaml' : 'application/json'
    
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', `attachment; filename="config-${req.params.configId}.${format}"`)
    
    const response = createApiResponse(result.data, {
      requestId: req.metadata?.requestId,
      timestamp: new Date().toISOString()
    })
    
    res.json(response)
  } catch (error) {
    next(error)
  }
})

/**
 * POST /configs/import
 * Import configuration from JSON/YAML
 * 
 * Adapted from Cline's batch operation patterns
 */
configRouter.post('/import', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await wrapAsync(async () => {
      const { data, format, name } = req.body
      
      if (!data) {
        throw new ReadyAIError(
          'Configuration data is required',
          'MISSING_DATA',
          400,
          { field: 'data' }
        )
      }
      
      // Validate import format (Cline validation pattern)
      const validFormats = ['json', 'yaml', 'auto']
      const importFormat = format || 'auto'
      if (!validFormats.includes(importFormat)) {
        throw new ReadyAIError(
          `Invalid import format: ${importFormat}. Valid options: ${validFormats.join(', ')}`,
          'INVALID_FORMAT',
          400,
          { format: importFormat, validFormats }
        )
      }
      
      return await configController.importConfiguration({
        data,
        format: importFormat,
        name: name || `Imported Configuration ${new Date().toISOString()}`
      })
    })
    
    if (!isApiSuccess(result)) {
      next(result.error)
      return
    }
    
    const response = createApiResponse(result.data, {
      requestId: req.metadata?.requestId,
      timestamp: new Date().toISOString()
    })
    
    res.status(201).json(response)
  } catch (error) {
    next(error)
  }
})

// =============================================================================
// SPECIALIZED CONFIGURATION ENDPOINTS
// =============================================================================

/**
 * GET /configs/:configId/providers
 * Get AI provider configurations
 * 
 * ReadyAI-specific endpoint for managing AI provider settings
 */
configRouter.get('/:configId/providers', validateUUID('configId'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await wrapAsync(async () => {
      const configId = req.params.configId as UUID
      return await configController.getProviderConfigurations(configId)
    })
    
    if (!isApiSuccess(result)) {
      if (result.error.message.includes('not found')) {
        const error = createApiError(
          `Configuration not found: ${req.params.configId}`,
          'CONFIG_NOT_FOUND',
          404
        )
        res.status(404).json(error)
        return
      }
      next(result.error)
      return
    }
    
    const response = createApiResponse(result.data, {
      requestId: req.metadata?.requestId,
      timestamp: new Date().toISOString()
    })
    
    res.json(response)
  } catch (error) {
    next(error)
  }
})

/**
 * PUT /configs/:configId/providers/:providerId
 * Update AI provider configuration
 * 
 * ReadyAI-specific endpoint for updating individual AI provider settings
 */
configRouter.put('/:configId/providers/:providerId', 
  validateUUID('configId'), 
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await wrapAsync(async () => {
        const configId = req.params.configId as UUID
        const providerId = req.params.providerId as AIProviderType
        const updates = req.body
        
        // Validate provider ID (ReadyAI specific validation)
        const validProviders: AIProviderType[] = ['claude-sonnet-4', 'claude-3.5-sonnet', 'gpt-4', 'gpt-5', 'openrouter']
        if (!validProviders.includes(providerId)) {
          throw new ReadyAIError(
            `Invalid provider ID: ${providerId}. Valid options: ${validProviders.join(', ')}`,
            'INVALID_PROVIDER_ID',
            400,
            { providerId, validProviders }
          )
        }
        
        return await configController.updateProviderConfiguration(configId, providerId, updates)
      })
      
      if (!isApiSuccess(result)) {
        if (result.error.message.includes('not found')) {
          const error = createApiError(
            `Configuration not found: ${req.params.configId}`,
            'CONFIG_NOT_FOUND',
            404
          )
          res.status(404).json(error)
          return
        }
        next(result.error)
        return
      }
      
      const response = createApiResponse(result.data, {
        requestId: req.metadata?.requestId,
        timestamp: new Date().toISOString()
      })
      
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

// =============================================================================
// ERROR HANDLING MIDDLEWARE (Applied Last)
// =============================================================================

// Apply error handler after all routes (Cline pattern)
configRouter.use(errorHandler)

// =============================================================================
// TYPE AUGMENTATION FOR REQUEST METADATA
// =============================================================================

declare global {
  namespace Express {
    interface Request {
      metadata?: {
        requestId: string
        timestamp: string
        startTime: number
        path: string
        method: string
      }
    }
  }
}

/**
 * Export the configured router
 * 
 * This router can be mounted at `/api/config` or any other appropriate base path
 * in the main Express application following ReadyAI's API organization patterns.
 */
export default configRouter
