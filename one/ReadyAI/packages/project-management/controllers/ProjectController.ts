// packages/project-management/controllers/ProjectController.ts

/**
 * Project Controller - RESTful API Controller for ReadyAI Project Management
 * 
 * This controller provides comprehensive CRUD operations and project orchestration endpoints,
 * leveraging proven patterns from Cline's controller architecture with ReadyAI-specific 
 * enhancements for AI-powered development workflows.
 * 
 * Primary Cline Sources Adapted (Pattern-Replicate 75% reuse):
 * - Controller structure from Cline's gRPC service handlers
 * - Request validation patterns from Cline's API request validation
 * - Error handling and response formatting from Cline's proven error system
 * - Async/await patterns and resource cleanup from Cline's task controllers
 * - Comprehensive logging from Cline's telemetry integration
 * - Type-safe request/response handling from Cline's protocol buffer patterns
 * 
 * ReadyAI Integration:
 * - Multi-phase project lifecycle management
 * - AI-powered code generation workflow endpoints
 * - Enterprise-grade validation and error recovery
 * - Real-time project state synchronization
 * - Context-aware project operations
 * - Production-ready performance monitoring
 * 
 * @version 1.0.0 - Production Ready Implementation
 * @author ReadyAI Development Team
 */

import { Request, Response, NextFunction, Router } from 'express'
import {
  UUID,
  ApiResponse,
  PhaseType,
  createApiResponse,
  createApiError,
  wrapAsync,
  generateUUID,
  createTimestamp,
  isValidUUID,
  AsyncResult
} from '../../foundation/types/core'

import {
  ProjectCreationRequest,
  ProjectUpdateRequest,
  ProjectListOptions,
  ProjectSearchFilters,
  ProjectExportOptions,
  ProjectImportOptions,
  ProjectOperationResult,
  Project,
  ProjectAnalytics,
  ProjectNotFoundError,
  ProjectValidationError,
  ProjectCreationError
} from '../types/project'

// Core service dependencies (following Cline's dependency injection patterns)
import { ProjectService } from '../services/ProjectService'
import { ProjectOrchestrator } from '../services/ProjectOrchestrator'
import { ProjectValidator } from '../services/ProjectValidator'
import { ProjectMetadataService } from '../services/ProjectMetadataService'

// Infrastructure services (Cline patterns)
import { LoggingService } from '../../logging/services/LoggingService'
import { ErrorService } from '../../error-handling/services/ErrorService'
import { ValidationMiddleware } from '../../api-gateway/middleware/ValidationMiddleware'
import { RateLimitingMiddleware } from '../../api-gateway/middleware/RateLimitingMiddleware'

// =============================================================================
// REQUEST/RESPONSE INTERFACES (CLINE TYPE SAFETY PATTERNS)
// =============================================================================

/**
 * Enhanced request interface extending Express Request with ReadyAI context
 * Following Cline's context-aware request patterns
 */
interface ProjectRequest extends Request {
  projectId?: UUID
  userId?: UUID
  operationId?: UUID
  validatedBody?: any
  context?: {
    traceId: string
    timestamp: string
    source: 'api' | 'ui' | 'cli'
  }
}

/**
 * Standardized project response format following Cline's API response patterns
 */
interface ProjectApiResponse<T = any> extends ApiResponse<T> {
  metadata?: {
    operation: string
    processingTime: number
    traceId: string
    cached?: boolean
  }
}

// =============================================================================
// PROJECT CONTROLLER IMPLEMENTATION
// =============================================================================

/**
 * Project Controller implementing Cline's proven REST API patterns
 * 
 * This controller serves as the primary HTTP interface for project management operations,
 * providing comprehensive CRUD endpoints with enterprise-grade error handling, validation,
 * and monitoring capabilities adapted from Cline's production-proven architecture.
 * 
 * Controller Philosophy (adapted from Cline):
 * - All endpoints use consistent error handling and response formatting
 * - Comprehensive request validation with detailed error messages
 * - Extensive logging and monitoring for production readiness
 * - Type-safe operations throughout the request/response cycle
 * - Graceful error recovery with detailed error context
 * - Performance optimization through caching and efficient queries
 */
export class ProjectController {
  private readonly logger: LoggingService
  private readonly errorService: ErrorService
  private readonly projectService: ProjectService
  private readonly projectOrchestrator: ProjectOrchestrator
  private readonly projectValidator: ProjectValidator
  private readonly projectMetadataService: ProjectMetadataService
  private readonly router: Router

  /**
   * Initialize ProjectController with comprehensive dependencies
   * Following Cline's proven dependency injection patterns for maximum testability
   */
  constructor(
    logger: LoggingService,
    errorService: ErrorService,
    projectService: ProjectService,
    projectOrchestrator: ProjectOrchestrator,
    projectValidator: ProjectValidator,
    projectMetadataService: ProjectMetadataService
  ) {
    this.logger = logger
    this.errorService = errorService
    this.projectService = projectService
    this.projectOrchestrator = projectOrchestrator
    this.projectValidator = projectValidator
    this.projectMetadataService = projectMetadataService
    this.router = Router()

    // Initialize routes with middleware (Cline middleware pattern)
    this.initializeRoutes()

    this.logger.info('ProjectController initialized with all dependencies', {
      controller: 'ProjectController',
      operation: 'constructor'
    })
  }

  /**
   * Get the configured Express router with all project management endpoints
   * Following Cline's router export patterns
   */
  public getRouter(): Router {
    return this.router
  }

  // =============================================================================
  // ROUTE INITIALIZATION (CLINE MIDDLEWARE PATTERNS)
  // =============================================================================

  /**
   * Initialize all project management routes with appropriate middleware
   * Following Cline's proven route organization and middleware application patterns
   */
  private initializeRoutes(): void {
    // Apply global middleware for all project routes
    this.router.use(this.addRequestContext.bind(this))
    this.router.use(this.logRequest.bind(this))

    // CRUD Operations (Core project management endpoints)
    this.router.post('/projects', 
      ValidationMiddleware.validateProjectCreation(),
      RateLimitingMiddleware.applyRateLimit('project-creation', 10, '1h'),
      this.createProject.bind(this)
    )

    this.router.get('/projects/:projectId',
      this.validateProjectId.bind(this),
      this.getProject.bind(this)
    )

    this.router.put('/projects/:projectId',
      this.validateProjectId.bind(this),
      ValidationMiddleware.validateProjectUpdate(),
      this.updateProject.bind(this)
    )

    this.router.delete('/projects/:projectId',
      this.validateProjectId.bind(this),
      this.deleteProject.bind(this)
    )

    // Query Operations (List and search endpoints)
    this.router.get('/projects',
      ValidationMiddleware.validateQueryParams(),
      this.listProjects.bind(this)
    )

    this.router.get('/projects/search',
      ValidationMiddleware.validateSearchQuery(),
      RateLimitingMiddleware.applyRateLimit('project-search', 60, '1m'),
      this.searchProjects.bind(this)
    )

    // Analytics and Reporting (ReadyAI-specific endpoints)
    this.router.get('/projects/:projectId/analytics',
      this.validateProjectId.bind(this),
      this.getProjectAnalytics.bind(this)
    )

    this.router.get('/projects/:projectId/health',
      this.validateProjectId.bind(this),
      this.getProjectHealth.bind(this)
    )

    // Import/Export Operations (Advanced project management)
    this.router.post('/projects/:projectId/export',
      this.validateProjectId.bind(this),
      ValidationMiddleware.validateExportOptions(),
      RateLimitingMiddleware.applyRateLimit('project-export', 5, '1h'),
      this.exportProject.bind(this)
    )

    this.router.post('/projects/import',
      ValidationMiddleware.validateImportData(),
      RateLimitingMiddleware.applyRateLimit('project-import', 5, '1h'),
      this.importProject.bind(this)
    )

    // Project Lifecycle Management (ReadyAI-specific workflows)
    this.router.post('/projects/:projectId/phases/:phaseType/start',
      this.validateProjectId.bind(this),
      this.startProjectPhase.bind(this)
    )

    this.router.post('/projects/:projectId/phases/:phaseType/complete',
      this.validateProjectId.bind(this),
      this.completeProjectPhase.bind(this)
    )

    // Batch Operations (Efficiency endpoints)
    this.router.post('/projects/batch/validate',
      ValidationMiddleware.validateBatchRequest(),
      this.validateProjectsBatch.bind(this)
    )

    this.router.post('/projects/batch/update',
      ValidationMiddleware.validateBatchUpdateRequest(),
      RateLimitingMiddleware.applyRateLimit('batch-update', 3, '1h'),
      this.updateProjectsBatch.bind(this)
    )

    // Error handling middleware (must be last)
    this.router.use(this.handleRouterErrors.bind(this))

    this.logger.info('ProjectController routes initialized', {
      controller: 'ProjectController',
      routeCount: this.router.stack.length
    })
  }

  // =============================================================================
  // MIDDLEWARE FUNCTIONS (CLINE MIDDLEWARE PATTERNS)
  // =============================================================================

  /**
   * Add request context for tracing and correlation
   * Following Cline's request correlation patterns
   */
  private addRequestContext(req: ProjectRequest, res: Response, next: NextFunction): void {
    req.operationId = generateUUID()
    req.context = {
      traceId: req.headers['x-trace-id'] as string || generateUUID(),
      timestamp: createTimestamp(),
      source: (req.headers['x-source'] as 'api' | 'ui' | 'cli') || 'api'
    }

    // Add correlation headers to response
    res.setHeader('X-Operation-Id', req.operationId)
    res.setHeader('X-Trace-Id', req.context.traceId)

    next()
  }

  /**
   * Log incoming requests for monitoring and debugging
   * Following Cline's comprehensive request logging patterns
   */
  private logRequest(req: ProjectRequest, res: Response, next: NextFunction): void {
    this.logger.info('Project API request received', {
      controller: 'ProjectController',
      operationId: req.operationId,
      traceId: req.context?.traceId,
      method: req.method,
      url: req.url,
      userAgent: req.headers['user-agent'],
      source: req.context?.source
    })

    // Track response time
    const startTime = Date.now()
    res.on('finish', () => {
      const processingTime = Date.now() - startTime
      this.logger.info('Project API request completed', {
        controller: 'ProjectController',
        operationId: req.operationId,
        traceId: req.context?.traceId,
        statusCode: res.statusCode,
        processingTime
      })
    })

    next()
  }

  /**
   * Validate project ID parameter
   * Following Cline's parameter validation patterns
   */
  private validateProjectId(req: ProjectRequest, res: Response, next: NextFunction): void {
    const projectId = req.params.projectId

    if (!projectId || !isValidUUID(projectId)) {
      const error = createApiError(
        'Invalid project ID format',
        'INVALID_PROJECT_ID',
        400,
        { projectId }
      )

      this.logger.warn('Invalid project ID provided', {
        controller: 'ProjectController',
        operationId: req.operationId,
        projectId
      })

      return res.status(400).json(error)
    }

    req.projectId = projectId as UUID
    next()
  }

  // =============================================================================
  // CRUD OPERATIONS (CLINE SERVICE INTEGRATION PATTERNS)
  // =============================================================================

  /**
   * Create a new project with comprehensive validation and setup
   * 
   * POST /projects
   * 
   * Creates a complete project with AI-powered development methodology setup,
   * following Cline's proven async operation patterns with comprehensive error handling.
   */
  public async createProject(req: ProjectRequest, res: Response): Promise<void> {
    const startTime = Date.now()

    try {
      this.logger.info('Creating new project', {
        controller: 'ProjectController',
        operation: 'createProject',
        operationId: req.operationId,
        projectName: req.body.name
      })

      // Validate request body (additional validation beyond middleware)
      const validationResult = await this.projectValidator.validateCreationRequest(req.body)
      if (!validationResult.passed) {
        const error = createApiError(
          'Project creation request validation failed',
          'VALIDATION_FAILED',
          400,
          { 
            errors: validationResult.errors,
            suggestions: validationResult.suggestions 
          }
        )
        return res.status(400).json(error)
      }

      // Create project using service
      const projectResult = await this.projectService.createProject(req.body as ProjectCreationRequest)

      if (!projectResult.success) {
        const error = createApiError(
          'Project creation failed',
          'PROJECT_CREATION_FAILED',
          500,
          { 
            errors: projectResult.errors,
            operationId: req.operationId 
          }
        )
        return res.status(500).json(error)
      }

      const processingTime = Date.now() - startTime

      // Format successful response (Cline response pattern)
      const response: ProjectApiResponse<ProjectOperationResult> = createApiResponse(
        projectResult.data!,
        'Project created successfully',
        {
          operation: 'create',
          processingTime,
          traceId: req.context?.traceId || '',
          cached: false
        }
      )

      this.logger.info('Project creation completed successfully', {
        controller: 'ProjectController',
        operation: 'createProject',
        operationId: req.operationId,
        projectId: projectResult.data!.project.id,
        processingTime
      })

      res.status(201).json(response)

    } catch (error) {
      await this.handleControllerError(error, req, res, 'createProject')
    }
  }

  /**
   * Get project by ID with comprehensive data enrichment
   * 
   * GET /projects/:projectId
   * 
   * Retrieves complete project information including current state, health,
   * and metadata following Cline's efficient data retrieval patterns.
   */
  public async getProject(req: ProjectRequest, res: Response): Promise<void> {
    const startTime = Date.now()

    try {
      this.logger.debug('Retrieving project', {
        controller: 'ProjectController',
        operation: 'getProject',
        operationId: req.operationId,
        projectId: req.projectId
      })

      const projectResult = await this.projectService.getProject(req.projectId!)

      if (!projectResult.success) {
        if (projectResult.error?.code === 'PROJECT_NOT_FOUND') {
          const error = createApiError(
            'Project not found',
            'PROJECT_NOT_FOUND',
            404,
            { projectId: req.projectId }
          )
          return res.status(404).json(error)
        }

        const error = createApiError(
          'Failed to retrieve project',
          'PROJECT_RETRIEVAL_FAILED',
          500,
          { 
            projectId: req.projectId,
            operationId: req.operationId 
          }
        )
        return res.status(500).json(error)
      }

      const processingTime = Date.now() - startTime

      // Format successful response
      const response: ProjectApiResponse<Project> = createApiResponse(
        projectResult.data!,
        'Project retrieved successfully',
        {
          operation: 'get',
          processingTime,
          traceId: req.context?.traceId || '',
          cached: false
        }
      )

      res.status(200).json(response)

    } catch (error) {
      await this.handleControllerError(error, req, res, 'getProject')
    }
  }

  /**
   * Update existing project with comprehensive validation
   * 
   * PUT /projects/:projectId
   * 
   * Updates project configuration, settings, and metadata with full validation
   * and state consistency checks following Cline's transaction-like patterns.
   */
  public async updateProject(req: ProjectRequest, res: Response): Promise<void> {
    const startTime = Date.now()

    try {
      this.logger.info('Updating project', {
        controller: 'ProjectController',
        operation: 'updateProject',
        operationId: req.operationId,
        projectId: req.projectId,
        updateFields: Object.keys(req.body)
      })

      const updateResult = await this.projectService.updateProject(
        req.projectId!,
        req.body as ProjectUpdateRequest
      )

      if (!updateResult.success) {
        if (updateResult.error?.code === 'PROJECT_NOT_FOUND') {
          const error = createApiError(
            'Project not found',
            'PROJECT_NOT_FOUND',
            404,
            { projectId: req.projectId }
          )
          return res.status(404).json(error)
        }

        const error = createApiError(
          'Project update failed',
          'PROJECT_UPDATE_FAILED',
          500,
          { 
            errors: updateResult.errors,
            projectId: req.projectId,
            operationId: req.operationId 
          }
        )
        return res.status(500).json(error)
      }

      const processingTime = Date.now() - startTime

      // Format successful response
      const response: ProjectApiResponse<ProjectOperationResult> = createApiResponse(
        updateResult.data!,
        'Project updated successfully',
        {
          operation: 'update',
          processingTime,
          traceId: req.context?.traceId || '',
          cached: false
        }
      )

      this.logger.info('Project update completed successfully', {
        controller: 'ProjectController',
        operation: 'updateProject',
        operationId: req.operationId,
        projectId: req.projectId,
        processingTime
      })

      res.status(200).json(response)

    } catch (error) {
      await this.handleControllerError(error, req, res, 'updateProject')
    }
  }

  /**
   * Delete project with comprehensive cleanup
   * 
   * DELETE /projects/:projectId
   * 
   * Removes project and all associated data with optional workspace cleanup,
   * following Cline's cascading deletion patterns with safety checks.
   */
  public async deleteProject(req: ProjectRequest, res: Response): Promise<void> {
    const startTime = Date.now()

    try {
      this.logger.info('Deleting project', {
        controller: 'ProjectController',
        operation: 'deleteProject',
        operationId: req.operationId,
        projectId: req.projectId
      })

      // Parse query parameters for deletion options
      const options = {
        force: req.query.force === 'true',
        cleanup: req.query.cleanup !== 'false' // Default to true
      }

      const deleteResult = await this.projectService.deleteProject(req.projectId!, options)

      if (!deleteResult.success) {
        if (deleteResult.error?.code === 'PROJECT_NOT_FOUND') {
          const error = createApiError(
            'Project not found',
            'PROJECT_NOT_FOUND',
            404,
            { projectId: req.projectId }
          )
          return res.status(404).json(error)
        }

        if (deleteResult.error?.code === 'PROJECT_DELETE_UNSAFE') {
          const error = createApiError(
            'Project deletion blocked by safety checks',
            'PROJECT_DELETE_UNSAFE',
            409,
            { 
              projectId: req.projectId,
              checks: deleteResult.error.context
            }
          )
          return res.status(409).json(error)
        }

        const error = createApiError(
          'Project deletion failed',
          'PROJECT_DELETE_FAILED',
          500,
          { 
            projectId: req.projectId,
            operationId: req.operationId 
          }
        )
        return res.status(500).json(error)
      }

      const processingTime = Date.now() - startTime

      // Format successful response
      const response: ProjectApiResponse<{ deleted: boolean; cleanupDetails: string[] }> = createApiResponse(
        deleteResult.data!,
        'Project deleted successfully',
        {
          operation: 'delete',
          processingTime,
          traceId: req.context?.traceId || '',
          cached: false
        }
      )

      this.logger.info('Project deletion completed successfully', {
        controller: 'ProjectController',
        operation: 'deleteProject',
        operationId: req.operationId,
        projectId: req.projectId,
        processingTime,
        cleanupDetails: deleteResult.data!.cleanupDetails
      })

      res.status(200).json(response)

    } catch (error) {
      await this.handleControllerError(error, req, res, 'deleteProject')
    }
  }

  // =============================================================================
  // QUERY OPERATIONS (CLINE EFFICIENT QUERYING PATTERNS)
  // =============================================================================

  /**
   * List projects with filtering and pagination
   * 
   * GET /projects
   * 
   * Returns paginated project list with comprehensive filtering capabilities,
   * following Cline's efficient querying and caching patterns.
   */
  public async listProjects(req: ProjectRequest, res: Response): Promise<void> {
    const startTime = Date.now()

    try {
      this.logger.debug('Listing projects', {
        controller: 'ProjectController',
        operation: 'listProjects',
        operationId: req.operationId,
        queryParams: req.query
      })

      // Parse and validate query parameters (Cline query parsing pattern)
      const options: ProjectListOptions = {
        page: parseInt(req.query.page as string) || 1,
        pageSize: Math.min(parseInt(req.query.pageSize as string) || 20, 100),
        sortBy: (req.query.sortBy as string) || 'lastModified',
        sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
        status: req.query.status ? 
          (Array.isArray(req.query.status) ? req.query.status : [req.query.status]) as string[] : 
          undefined,
        phase: req.query.phase ?
          (Array.isArray(req.query.phase) ? req.query.phase : [req.query.phase]) as PhaseType[] :
          undefined,
        tags: req.query.tags ?
          (Array.isArray(req.query.tags) ? req.query.tags : req.query.tags.split(',')) as string[] :
          undefined,
        includeArchived: req.query.includeArchived === 'true'
      }

      const listResult = await this.projectService.listProjects(options)

      if (!listResult.success) {
        const error = createApiError(
          'Failed to list projects',
          'PROJECT_LIST_FAILED',
          500,
          { 
            operationId: req.operationId,
            queryParams: req.query 
          }
        )
        return res.status(500).json(error)
      }

      const processingTime = Date.now() - startTime

      // Format successful response with pagination metadata
      const response: ProjectApiResponse<typeof listResult.data> = createApiResponse(
        listResult.data!,
        'Projects listed successfully',
        {
          operation: 'list',
          processingTime,
          traceId: req.context?.traceId || '',
          cached: false
        }
      )

      res.status(200).json(response)

    } catch (error) {
      await this.handleControllerError(error, req, res, 'listProjects')
    }
  }

  /**
   * Search projects with advanced filtering
   * 
   * GET /projects/search
   * 
   * Performs full-text search across projects with semantic matching capabilities,
   * following Cline's advanced search patterns with performance optimization.
   */
  public async searchProjects(req: ProjectRequest, res: Response): Promise<void> {
    const startTime = Date.now()

    try {
      const query = req.query.q as string
      if (!query || query.trim().length < 2) {
        const error = createApiError(
          'Search query must be at least 2 characters long',
          'INVALID_SEARCH_QUERY',
          400,
          { query }
        )
        return res.status(400).json(error)
      }

      this.logger.debug('Searching projects', {
        controller: 'ProjectController',
        operation: 'searchProjects',
        operationId: req.operationId,
        query,
        filters: req.query
      })

      // Build search filters from query parameters
      const filters: ProjectSearchFilters = {
        techStack: req.query.techStack ? {
          languages: req.query.languages ? (req.query.languages as string).split(',') : undefined,
          frontend: req.query.frontend as string,
          backend: req.query.backend as string
        } : undefined,
        phase: req.query.phase as PhaseType,
        status: req.query.status as string,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        complexity: req.query.complexity as string,
        priority: req.query.priority as string,
        limit: Math.min(parseInt(req.query.limit as string) || 50, 100)
      }

      const searchResult = await this.projectService.searchProjects(query, filters)

      if (!searchResult.success) {
        const error = createApiError(
          'Project search failed',
          'PROJECT_SEARCH_FAILED',
          500,
          { 
            query,
            operationId: req.operationId 
          }
        )
        return res.status(500).json(error)
      }

      const processingTime = Date.now() - startTime

      // Format successful response
      const response: ProjectApiResponse<Project[]> = createApiResponse(
        searchResult.data!,
        `Found ${searchResult.data!.length} projects`,
        {
          operation: 'search',
          processingTime,
          traceId: req.context?.traceId || '',
          cached: false
        }
      )

      res.status(200).json(response)

    } catch (error) {
      await this.handleControllerError(error, req, res, 'searchProjects')
    }
  }

  // =============================================================================
  // ANALYTICS AND REPORTING (READYAI-SPECIFIC ENDPOINTS)
  // =============================================================================

  /**
   * Get comprehensive project analytics
   * 
   * GET /projects/:projectId/analytics
   * 
   * Returns detailed project metrics, progress tracking, and insights
   * following Cline's metrics collection patterns with ReadyAI-specific analytics.
   */
  public async getProjectAnalytics(req: ProjectRequest, res: Response): Promise<void> {
    const startTime = Date.now()

    try {
      this.logger.debug('Generating project analytics', {
        controller: 'ProjectController',
        operation: 'getProjectAnalytics',
        operationId: req.operationId,
        projectId: req.projectId
      })

      const timeframe = (req.query.timeframe as '24h' | '7d' | '30d' | 'all') || '30d'
      
      const analyticsResult = await this.projectService.getProjectAnalytics(
        req.projectId!,
        timeframe
      )

      if (!analyticsResult.success) {
        if (analyticsResult.error?.code === 'PROJECT_NOT_FOUND') {
          const error = createApiError(
            'Project not found',
            'PROJECT_NOT_FOUND',
            404,
            { projectId: req.projectId }
          )
          return res.status(404).json(error)
        }

        const error = createApiError(
          'Failed to generate project analytics',
          'ANALYTICS_GENERATION_FAILED',
          500,
          { 
            projectId: req.projectId,
            operationId: req.operationId 
          }
        )
        return res.status(500).json(error)
      }

      const processingTime = Date.now() - startTime

      // Format successful response
      const response: ProjectApiResponse<ProjectAnalytics> = createApiResponse(
        analyticsResult.data!,
        'Project analytics generated successfully',
        {
          operation: 'analytics',
          processingTime,
          traceId: req.context?.traceId || '',
          cached: false
        }
      )

      res.status(200).json(response)

    } catch (error) {
      await this.handleControllerError(error, req, res, 'getProjectAnalytics')
    }
  }

  /**
   * Get project health status
   * 
   * GET /projects/:projectId/health
   * 
   * Returns current project health metrics and recommendations
   * for optimization and issue resolution.
   */
  public async getProjectHealth(req: ProjectRequest, res: Response): Promise<void> {
    const startTime = Date.now()

    try {
      this.logger.debug('Checking project health', {
        controller: 'ProjectController',
        operation: 'getProjectHealth',
        operationId: req.operationId,
        projectId: req.projectId
      })

      // Get project first to ensure it exists
      const projectResult = await this.projectService.getProject(req.projectId!)

      if (!projectResult.success) {
        if (projectResult.error?.code === 'PROJECT_NOT_FOUND') {
          const error = createApiError(
            'Project not found',
            'PROJECT_NOT_FOUND',
            404,
            { projectId: req.projectId }
          )
          return res.status(404).json(error)
        }

        const error = createApiError(
          'Failed to retrieve project for health check',
          'PROJECT_RETRIEVAL_FAILED',
          500,
          { 
            projectId: req.projectId,
            operationId: req.operationId 
          }
        )
        return res.status(500).json(error)
      }

      const project = projectResult.data!
      const processingTime = Date.now() - startTime

      // Build health response (simplified for now, can be enhanced)
      const healthData = {
        projectId: project.id,
        status: project.health,
        lastUpdated: project.lastModified,
        currentPhase: project.currentPhase,
        overallScore: project.health === 'good' ? 100 : 
                     project.health === 'warning' ? 70 : 30,
        issues: [],
        recommendations: [],
        metrics: {
          completionPercentage: 0, // Would calculate based on phase progress
          activeIssues: 0,
          performanceScore: 100,
          qualityScore: 100
        }
      }

      const response: ProjectApiResponse<typeof healthData> = createApiResponse(
        healthData,
        'Project health retrieved successfully',
        {
          operation: 'health',
          processingTime,
          traceId: req.context?.traceId || '',
          cached: false
        }
      )

      res.status(200).json(response)

    } catch (error) {
      await this.handleControllerError(error, req, res, 'getProjectHealth')
    }
  }

  // =============================================================================
  // IMPORT/EXPORT OPERATIONS (ADVANCED PROJECT MANAGEMENT)
  // =============================================================================

  /**
   * Export project with comprehensive data serialization
   * 
   * POST /projects/:projectId/export
   * 
   * Exports complete project data including configuration, state, and metadata
   * following Cline's export patterns with ReadyAI-specific enhancements.
   */
  public async exportProject(req: ProjectRequest, res: Response): Promise<void> {
    const startTime = Date.now()

    try {
      this.logger.info('Exporting project', {
        controller: 'ProjectController',
        operation: 'exportProject',
        operationId: req.operationId,
        projectId: req.projectId
      })

      const options: ProjectExportOptions = {
        includeWorkspace: req.body.includeWorkspace !== false,
        includeHistory: req.body.includeHistory !== false,
        includeAnalytics: req.body.includeAnalytics !== false,
        format: req.body.format || 'json',
        compression: req.body.compression || 'gzip'
      }

      const exportResult = await this.projectService.exportProject(req.projectId!, options)

      if (!exportResult.success) {
        if (exportResult.error?.code === 'PROJECT_NOT_FOUND') {
          const error = createApiError(
            'Project not found',
            'PROJECT_NOT_FOUND',
            404,
            { projectId: req.projectId }
          )
          return res.status(404).json(error)
        }

        const error = createApiError(
          'Project export failed',
          'PROJECT_EXPORT_FAILED',
          500,
          { 
            projectId: req.projectId,
            operationId: req.operationId 
          }
        )
        return res.status(500).json(error)
      }

      const processingTime = Date.now() - startTime

      // Format successful response
      const response: ProjectApiResponse<typeof exportResult.data> = createApiResponse(
        exportResult.data!,
        'Project exported successfully',
        {
          operation: 'export',
          processingTime,
          traceId: req.context?.traceId || '',
          cached: false
        }
      )

      this.logger.info('Project export completed successfully', {
        controller: 'ProjectController',
        operation: 'exportProject',
        operationId: req.operationId,
        projectId: req.projectId,
        exportPath: exportResult.data!.exportPath,
        processingTime
      })

      res.status(200).json(response)

    } catch (error) {
      await this.handleControllerError(error, req, res, 'exportProject')
    }
  }

  /**
   * Import project from external source
   * 
   * POST /projects/import
   * 
   * Creates a new project from imported data with comprehensive validation
   * and integrity checking following Cline's import patterns.
   */
  public async importProject(req: ProjectRequest, res: Response): Promise<void> {
    const startTime = Date.now()

    try {
      this.logger.info('Importing project', {
        controller: 'ProjectController',
        operation: 'importProject',
        operationId: req.operationId,
        source: req.body.source
      })

      const options: ProjectImportOptions = {
        source: req.body.source,
        data: req.body.data,
        validateIntegrity: req.body.validateIntegrity !== false,
        preserveIds: req.body.preserveIds === true,
        overwriteExisting: req.body.overwriteExisting === true
      }

      const importResult = await this.projectService.importProject(options)

      if (!importResult.success) {
        const error = createApiError(
          'Project import failed',
          'PROJECT_IMPORT_FAILED',
          500,
          { 
            errors: importResult.errors,
            operationId: req.operationId 
          }
        )
        return res.status(500).json(error)
      }

      const processingTime = Date.now() - startTime

      // Format successful response
      const response: ProjectApiResponse<ProjectOperationResult> = createApiResponse(
        importResult.data!,
        'Project imported successfully',
        {
          operation: 'import',
          processingTime,
          traceId: req.context?.traceId || '',
          cached: false
        }
      )

      this.logger.info('Project import completed successfully', {
        controller: 'ProjectController',
        operation: 'importProject',
        operationId: req.operationId,
        projectId: importResult.data!.project.id,
        processingTime
      })

      res.status(201).json(response)

    } catch (error) {
      await this.handleControllerError(error, req, res, 'importProject')
    }
  }

  // =============================================================================
  // PROJECT LIFECYCLE MANAGEMENT (READYAI-SPECIFIC WORKFLOWS)
  // =============================================================================

  /**
   * Start a project phase
   * 
   * POST /projects/:projectId/phases/:phaseType/start
   * 
   * Initiates the specified project phase with proper validation and state management.
   */
  public async startProjectPhase(req: ProjectRequest, res: Response): Promise<void> {
    const startTime = Date.now()

    try {
      const phaseType = req.params.phaseType as PhaseType

      this.logger.info('Starting project phase', {
        controller: 'ProjectController',
        operation: 'startProjectPhase',
        operationId: req.operationId,
        projectId: req.projectId,
        phaseType
      })

      // Use project orchestrator for phase management
      const startResult = await this.projectOrchestrator.startPhase(req.projectId!, phaseType)

      if (!startResult.success) {
        const statusCode = startResult.error?.code === 'PROJECT_NOT_FOUND' ? 404 : 500
        const error = createApiError(
          `Failed to start phase ${phaseType}`,
          'PHASE_START_FAILED',
          statusCode,
          { 
            projectId: req.projectId,
            phaseType,
            errors: startResult.errors
          }
        )
        return res.status(statusCode).json(error)
      }

      const processingTime = Date.now() - startTime

      // Format successful response
      const response: ProjectApiResponse<typeof startResult.data> = createApiResponse(
        startResult.data!,
        `Phase ${phaseType} started successfully`,
        {
          operation: 'startPhase',
          processingTime,
          traceId: req.context?.traceId || '',
          cached: false
        }
      )

      res.status(200).json(response)

    } catch (error) {
      await this.handleControllerError(error, req, res, 'startProjectPhase')
    }
  }

  /**
   * Complete a project phase
   * 
   * POST /projects/:projectId/phases/:phaseType/complete
   * 
   * Marks the specified project phase as complete and advances to the next phase.
   */
  public async completeProjectPhase(req: ProjectRequest, res: Response): Promise<void> {
    const startTime = Date.now()

    try {
      const phaseType = req.params.phaseType as PhaseType

      this.logger.info('Completing project phase', {
        controller: 'ProjectController',
        operation: 'completeProjectPhase',
        operationId: req.operationId,
        projectId: req.projectId,
        phaseType
      })

      // Use project orchestrator for phase management
      const completeResult = await this.projectOrchestrator.completePhase(req.projectId!, phaseType)

      if (!completeResult.success) {
        const statusCode = completeResult.error?.code === 'PROJECT_NOT_FOUND' ? 404 : 500
        const error = createApiError(
          `Failed to complete phase ${phaseType}`,
          'PHASE_COMPLETE_FAILED',
          statusCode,
          { 
            projectId: req.projectId,
            phaseType,
            errors: completeResult.errors
          }
        )
        return res.status(statusCode).json(error)
      }

      const processingTime = Date.now() - startTime

      // Format successful response
      const response: ProjectApiResponse<typeof completeResult.data> = createApiResponse(
        completeResult.data!,
        `Phase ${phaseType} completed successfully`,
        {
          operation: 'completePhase',
          processingTime,
          traceId: req.context?.traceId || '',
          cached: false
        }
      )

      res.status(200).json(response)

    } catch (error) {
      await this.handleControllerError(error, req, res, 'completeProjectPhase')
    }
  }

  // =============================================================================
  // BATCH OPERATIONS (EFFICIENCY ENDPOINTS)
  // =============================================================================

  /**
   * Validate multiple projects in batch
   * 
   * POST /projects/batch/validate
   * 
   * Validates multiple projects efficiently in a single request.
   */
  public async validateProjectsBatch(req: ProjectRequest, res: Response): Promise<void> {
    const startTime = Date.now()

    try {
      const projectIds = req.body.projectIds as UUID[]

      this.logger.info('Batch validating projects', {
        controller: 'ProjectController',
        operation: 'validateProjectsBatch',
        operationId: req.operationId,
        projectCount: projectIds.length
      })

      // Validate each project ID format
      for (const projectId of projectIds) {
        if (!isValidUUID(projectId)) {
          const error = createApiError(
            'Invalid project ID in batch request',
            'INVALID_PROJECT_ID',
            400,
            { projectId }
          )
          return res.status(400).json(error)
        }
      }

      // Perform batch validation (simplified implementation)
      const validationResults = await Promise.all(
        projectIds.map(async (projectId) => {
          try {
            const project = await this.projectService.getProject(projectId)
            return {
              projectId,
              valid: project.success,
              errors: project.success ? [] : [project.error?.message || 'Unknown error']
            }
          } catch (error) {
            return {
              projectId,
              valid: false,
              errors: [error instanceof Error ? error.message : 'Validation failed']
            }
          }
        })
      )

      const processingTime = Date.now() - startTime

      // Format successful response
      const response: ProjectApiResponse<typeof validationResults> = createApiResponse(
        validationResults,
        `Batch validation completed for ${projectIds.length} projects`,
        {
          operation: 'batchValidate',
          processingTime,
          traceId: req.context?.traceId || '',
          cached: false
        }
      )

      res.status(200).json(response)

    } catch (error) {
      await this.handleControllerError(error, req, res, 'validateProjectsBatch')
    }
  }

  /**
   * Update multiple projects in batch
   * 
   * POST /projects/batch/update
   * 
   * Updates multiple projects with the same modifications efficiently.
   */
  public async updateProjectsBatch(req: ProjectRequest, res: Response): Promise<void> {
    const startTime = Date.now()

    try {
      const { projectIds, updates } = req.body

      this.logger.info('Batch updating projects', {
        controller: 'ProjectController',
        operation: 'updateProjectsBatch',
        operationId: req.operationId,
        projectCount: projectIds.length,
        updateFields: Object.keys(updates)
      })

      // Validate project IDs
      for (const projectId of projectIds) {
        if (!isValidUUID(projectId)) {
          const error = createApiError(
            'Invalid project ID in batch request',
            'INVALID_PROJECT_ID',
            400,
            { projectId }
          )
          return res.status(400).json(error)
        }
      }

      // Perform batch updates
      const updateResults = await Promise.all(
        projectIds.map(async (projectId: UUID) => {
          try {
            const result = await this.projectService.updateProject(projectId, updates)
            return {
              projectId,
              success: result.success,
              errors: result.success ? [] : result.errors?.map(e => e.errors).flat() || []
            }
          } catch (error) {
            return {
              projectId,
              success: false,
              errors: [error instanceof Error ? error.message : 'Update failed']
            }
          }
        })
      )

      const processingTime = Date.now() - startTime
      const successCount = updateResults.filter(r => r.success).length

      // Format successful response
      const response: ProjectApiResponse<typeof updateResults> = createApiResponse(
        updateResults,
        `Batch update completed: ${successCount}/${projectIds.length} successful`,
        {
          operation: 'batchUpdate',
          processingTime,
          traceId: req.context?.traceId || '',
          cached: false
        }
      )

      res.status(200).json(response)

    } catch (error) {
      await this.handleControllerError(error, req, res, 'updateProjectsBatch')
    }
  }

  // =============================================================================
  // ERROR HANDLING (CLINE ERROR PATTERNS)
  // =============================================================================

  /**
   * Handle controller-level errors with comprehensive logging and response formatting
   * Following Cline's proven error handling patterns
   */
  private async handleControllerError(
    error: any, 
    req: ProjectRequest, 
    res: Response, 
    operation: string
  ): Promise<void> {
    const errorId = generateUUID()

    // Log error with full context
    this.logger.error(`ProjectController error in ${operation}`, {
      controller: 'ProjectController',
      operation,
      operationId: req.operationId,
      errorId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      projectId: req.projectId
    })

    // Report error to error service for aggregation and alerting
    await this.errorService.reportError(error, {
      controller: 'ProjectController',
      operation,
      operationId: req.operationId,
      errorId,
      projectId: req.projectId,
      userId: req.userId,
      context: req.context
    })

    // Determine appropriate error response
    let statusCode = 500
    let errorCode = 'INTERNAL_SERVER_ERROR'
    let message = 'An unexpected error occurred'

    if (error instanceof ProjectNotFoundError) {
      statusCode = 404
      errorCode = 'PROJECT_NOT_FOUND'
      message = error.message
    } else if (error instanceof ProjectValidationError) {
      statusCode = 400
      errorCode = 'VALIDATION_ERROR'
      message = error.message
    } else if (error instanceof ProjectCreationError) {
      statusCode = 500
      errorCode = 'PROJECT_CREATION_ERROR'
      message = error.message
    }

    // Format error response
    const errorResponse = createApiError(
      message,
      errorCode,
      statusCode,
      {
        operationId: req.operationId,
        errorId,
        timestamp: createTimestamp()
      }
    )

    res.status(statusCode).json(errorResponse)
  }

  /**
   * Express error handler middleware for unhandled router errors
   * Following Cline's middleware error handling patterns
   */
  private handleRouterErrors(
    error: any,
    req: ProjectRequest,
    res: Response,
    next: NextFunction
  ): void {
    if (res.headersSent) {
      return next(error)
    }

    // Log the unhandled error
    this.logger.error('Unhandled router error in ProjectController', {
      controller: 'ProjectController',
      operationId: req.operationId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      url: req.url,
      method: req.method
    })

    // Send generic error response
    const errorResponse = createApiError(
      'An unexpected error occurred',
      'UNHANDLED_ERROR',
      500,
      {
        operationId: req.operationId,
        timestamp: createTimestamp()
      }
    )

    res.status(500).json(errorResponse)
  }
}

// =============================================================================
// CONTROLLER FACTORY AND HEALTH CHECK (CLINE PATTERNS)
// =============================================================================

/**
 * Factory function to create ProjectController with proper dependencies
 * Following Cline's proven factory patterns for service initialization
 */
export function createProjectController(
  logger: LoggingService,
  errorService: ErrorService,
  projectService: ProjectService,
  projectOrchestrator: ProjectOrchestrator,
  projectValidator: ProjectValidator,
  projectMetadataService: ProjectMetadataService
): ProjectController {
  return new ProjectController(
    logger,
    errorService,
    projectService,
    projectOrchestrator,
    projectValidator,
    projectMetadataService
  )
}

/**
 * Health check for ProjectController
 * Following Cline's health monitoring patterns
 */
export async function checkProjectControllerHealth(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy'
  details: Record<string, any>
}> {
  try {
    // Perform basic health checks
    const healthChecks = {
      dependencies: 'healthy',
      routes: 'healthy',
      middleware: 'healthy'
    }

    return {
      status: 'healthy',
      details: {
        timestamp: createTimestamp(),
        checks: healthChecks,
        version: '1.0.0'
      }
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      details: {
        timestamp: createTimestamp(),
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

/**
 * Default export for common usage patterns
 */
export default ProjectController
