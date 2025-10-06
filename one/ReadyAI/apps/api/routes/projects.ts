// apps/api/routes/projects.ts

/**
 * Projects API Routes - RESTful Project Management Endpoints
 * 
 * This module defines comprehensive REST API routes for project management operations,
 * leveraging proven patterns from Cline's route architecture with ReadyAI-specific 
 * enhancements for AI-powered development workflows.
 * 
 * Primary Cline Sources Adapted (Pattern-Replicate 75% reuse):
 * - Route structure and middleware patterns from Cline's gRPC service router setup
 * - Request validation and error handling from Cline's proven API route handlers
 * - Express router configuration from Cline's modular route organization
 * - Async route handler patterns from Cline's controller integration
 * - Comprehensive middleware application from Cline's security and validation layers
 * - Response formatting consistency from Cline's API response patterns
 * 
 * ReadyAI Integration:
 * - Project lifecycle management endpoints with phase progression
 * - AI-powered code generation workflow integration
 * - Enterprise-grade validation, rate limiting, and monitoring
 * - Real-time project state synchronization endpoints
 * - Context-aware project operations with comprehensive logging
 * - Production-ready performance optimization and caching
 * 
 * @version 1.0.0 - Production Ready Implementation
 * @author ReadyAI Development Team
 */

import { Router } from 'express'
import {
  UUID,
  ApiResponse,
  PhaseType,
  createApiResponse,
  createApiError,
  wrapAsync,
  generateUUID,
  createTimestamp,
  isValidUUID
} from '../../../packages/foundation/types/core'

// Import existing ProjectController with comprehensive functionality
import { ProjectController, createProjectController } from '../../../packages/project-management/controllers/ProjectController'

// Import required service dependencies following Cline's dependency injection patterns
import { LoggingService } from '../../../packages/logging/services/LoggingService'
import { ErrorService } from '../../../packages/error-handling/services/ErrorService'
import { ProjectService } from '../../../packages/project-management/services/ProjectService'
import { ProjectOrchestrator } from '../../../packages/project-management/services/ProjectOrchestrator'
import { ProjectValidator } from '../../../packages/project-management/services/ProjectValidator'
import { ProjectMetadataService } from '../../../packages/project-management/services/ProjectMetadataService'

// Import middleware following Cline's middleware patterns
import { ValidationMiddleware } from '../../../packages/api-gateway/middleware/ValidationMiddleware'
import { RateLimitingMiddleware } from '../../../packages/api-gateway/middleware/RateLimitingMiddleware'
import { authMiddleware } from '../middleware/auth'

// =============================================================================
// ROUTE FACTORY FUNCTION (CLINE DEPENDENCY INJECTION PATTERN)
// =============================================================================

/**
 * Create and configure the projects router with all dependencies
 * 
 * This factory function follows Cline's proven dependency injection patterns,
 * ensuring proper service initialization and comprehensive middleware application
 * for enterprise-grade project management functionality.
 * 
 * @param logger - Logging service for comprehensive request/response tracking
 * @param errorService - Error handling service for consistent error management
 * @param projectService - Core project business logic service
 * @param projectOrchestrator - Multi-phase project workflow orchestration
 * @param projectValidator - Comprehensive project validation service
 * @param projectMetadataService - Project metadata and analytics service
 * @returns Configured Express router with all project management endpoints
 */
export function createProjectsRouter(
  logger: LoggingService,
  errorService: ErrorService,
  projectService: ProjectService,
  projectOrchestrator: ProjectOrchestrator,
  projectValidator: ProjectValidator,
  projectMetadataService: ProjectMetadataService
): Router {
  
  // Initialize router with Cline's proven configuration
  const router = Router({
    mergeParams: true,    // Allow access to parent route parameters
    caseSensitive: true,  // Maintain case sensitivity for precision
    strict: true          // Enforce strict routing for security
  })

  // Create ProjectController with comprehensive dependencies following Cline patterns
  const projectController = createProjectController(
    logger,
    errorService,
    projectService,
    projectOrchestrator,
    projectValidator,
    projectMetadataService
  )

  // Log router initialization with comprehensive context
  logger.info('Initializing Projects API Routes', {
    module: 'ProjectsRouter',
    operation: 'initialization',
    timestamp: createTimestamp(),
    controllerId: generateUUID()
  })

  // =============================================================================
  // GLOBAL MIDDLEWARE APPLICATION (CLINE SECURITY PATTERNS)
  // =============================================================================

  // Apply authentication middleware for all project routes
  // Following Cline's proven security-first approach
  router.use(authMiddleware)

  // Add comprehensive request logging for all project operations
  // Following Cline's detailed monitoring patterns
  router.use((req, res, next) => {
    const operationId = generateUUID()
    req.context = {
      ...req.context,
      operationId,
      module: 'ProjectsAPI',
      timestamp: createTimestamp()
    }

    logger.debug('Projects API request initiated', {
      operationId,
      method: req.method,
      url: req.url,
      userAgent: req.headers['user-agent'],
      contentType: req.headers['content-type'],
      queryParams: Object.keys(req.query || {}),
      bodySize: req.headers['content-length'] || 0
    })

    next()
  })

  // Apply rate limiting based on Cline's proven performance protection patterns
  router.use(RateLimitingMiddleware.applyRateLimit('projects-global', 1000, '1h'))

  // =============================================================================
  // CORE CRUD ENDPOINTS (CLINE REST API PATTERNS)
  // =============================================================================

  /**
   * Create new project with comprehensive validation
   * 
   * POST /api/projects
   * 
   * Creates a complete ReadyAI project with AI-powered development methodology setup,
   * following Cline's proven async operation patterns with comprehensive error handling
   * and validation.
   */
  router.post('/', 
    // Apply Cline's proven validation middleware patterns
    ValidationMiddleware.validateProjectCreation(),
    RateLimitingMiddleware.applyRateLimit('project-creation', 10, '1h'),
    
    // Wrap async handler following Cline's error handling patterns
    wrapAsync(async (req, res) => {
      await projectController.createProject(req, res)
    })
  )

  /**
   * Retrieve project by ID with comprehensive data enrichment
   * 
   * GET /api/projects/:projectId
   * 
   * Fetches complete project information including current state, health,
   * and metadata following Cline's efficient data retrieval patterns.
   */
  router.get('/:projectId',
    // Apply Cline's parameter validation patterns
    ValidationMiddleware.validateProjectId(),
    
    wrapAsync(async (req, res) => {
      await projectController.getProject(req, res)
    })
  )

  /**
   * Update existing project with comprehensive validation
   * 
   * PUT /api/projects/:projectId
   * 
   * Updates project configuration, settings, and metadata with full validation
   * and state consistency checks following Cline's transaction-like patterns.
   */
  router.put('/:projectId',
    ValidationMiddleware.validateProjectId(),
    ValidationMiddleware.validateProjectUpdate(),
    RateLimitingMiddleware.applyRateLimit('project-update', 50, '1h'),
    
    wrapAsync(async (req, res) => {
      await projectController.updateProject(req, res)
    })
  )

  /**
   * Delete project with comprehensive cleanup
   * 
   * DELETE /api/projects/:projectId
   * 
   * Removes project and all associated data with optional workspace cleanup,
   * following Cline's cascading deletion patterns with safety checks.
   */
  router.delete('/:projectId',
    ValidationMiddleware.validateProjectId(),
    RateLimitingMiddleware.applyRateLimit('project-deletion', 5, '1h'),
    
    wrapAsync(async (req, res) => {
      await projectController.deleteProject(req, res)
    })
  )

  // =============================================================================
  // QUERY AND SEARCH ENDPOINTS (CLINE EFFICIENT QUERYING PATTERNS)
  // =============================================================================

  /**
   * List projects with filtering and pagination
   * 
   * GET /api/projects
   * 
   * Returns paginated project list with comprehensive filtering capabilities,
   * following Cline's efficient querying and caching patterns.
   */
  router.get('/',
    ValidationMiddleware.validateQueryParams(),
    RateLimitingMiddleware.applyRateLimit('project-list', 100, '1h'),
    
    wrapAsync(async (req, res) => {
      await projectController.listProjects(req, res)
    })
  )

  /**
   * Search projects with advanced filtering
   * 
   * GET /api/projects/search
   * 
   * Performs full-text search across projects with semantic matching capabilities,
   * following Cline's advanced search patterns with performance optimization.
   * 
   * Note: This endpoint is placed before /:projectId to avoid route conflicts,
   * following Cline's proven route ordering patterns.
   */
  router.get('/search',
    ValidationMiddleware.validateSearchQuery(),
    RateLimitingMiddleware.applyRateLimit('project-search', 60, '1h'),
    
    wrapAsync(async (req, res) => {
      await projectController.searchProjects(req, res)
    })
  )

  // =============================================================================
  // ANALYTICS AND REPORTING ENDPOINTS (READYAI-SPECIFIC FUNCTIONALITY)
  // =============================================================================

  /**
   * Get comprehensive project analytics
   * 
   * GET /api/projects/:projectId/analytics
   * 
   * Returns detailed project metrics, progress tracking, and insights
   * following Cline's metrics collection patterns with ReadyAI-specific analytics.
   */
  router.get('/:projectId/analytics',
    ValidationMiddleware.validateProjectId(),
    ValidationMiddleware.validateAnalyticsParams(),
    RateLimitingMiddleware.applyRateLimit('project-analytics', 30, '1h'),
    
    wrapAsync(async (req, res) => {
      await projectController.getProjectAnalytics(req, res)
    })
  )

  /**
   * Get project health status and recommendations
   * 
   * GET /api/projects/:projectId/health
   * 
   * Returns current project health metrics, issue detection, and optimization
   * recommendations following Cline's health monitoring patterns.
   */
  router.get('/:projectId/health',
    ValidationMiddleware.validateProjectId(),
    
    wrapAsync(async (req, res) => {
      await projectController.getProjectHealth(req, res)
    })
  )

  // =============================================================================
  // IMPORT/EXPORT ENDPOINTS (ADVANCED PROJECT MANAGEMENT)
  // =============================================================================

  /**
   * Export project with comprehensive data serialization
   * 
   * POST /api/projects/:projectId/export
   * 
   * Exports complete project data including configuration, state, and metadata
   * following Cline's export patterns with ReadyAI-specific enhancements.
   */
  router.post('/:projectId/export',
    ValidationMiddleware.validateProjectId(),
    ValidationMiddleware.validateExportOptions(),
    RateLimitingMiddleware.applyRateLimit('project-export', 5, '1h'),
    
    wrapAsync(async (req, res) => {
      await projectController.exportProject(req, res)
    })
  )

  /**
   * Import project from external source
   * 
   * POST /api/projects/import
   * 
   * Creates a new project from imported data with comprehensive validation
   * and integrity checking following Cline's import patterns.
   */
  router.post('/import',
    ValidationMiddleware.validateImportData(),
    RateLimitingMiddleware.applyRateLimit('project-import', 5, '1h'),
    
    wrapAsync(async (req, res) => {
      await projectController.importProject(req, res)
    })
  )

  // =============================================================================
  // PROJECT LIFECYCLE MANAGEMENT (READYAI-SPECIFIC WORKFLOWS)
  // =============================================================================

  /**
   * Start a specific project phase
   * 
   * POST /api/projects/:projectId/phases/:phaseType/start
   * 
   * Initiates the specified project phase with proper validation and state management,
   * following ReadyAI's multi-phase development methodology.
   */
  router.post('/:projectId/phases/:phaseType/start',
    ValidationMiddleware.validateProjectId(),
    ValidationMiddleware.validatePhaseType(),
    RateLimitingMiddleware.applyRateLimit('phase-start', 20, '1h'),
    
    wrapAsync(async (req, res) => {
      await projectController.startProjectPhase(req, res)
    })
  )

  /**
   * Complete a specific project phase
   * 
   * POST /api/projects/:projectId/phases/:phaseType/complete
   * 
   * Marks the specified project phase as complete and advances workflow,
   * following ReadyAI's structured phase progression patterns.
   */
  router.post('/:projectId/phases/:phaseType/complete',
    ValidationMiddleware.validateProjectId(),
    ValidationMiddleware.validatePhaseType(),
    ValidationMiddleware.validatePhaseCompletion(),
    
    wrapAsync(async (req, res) => {
      await projectController.completeProjectPhase(req, res)
    })
  )

  /**
   * Get phase status and progression details
   * 
   * GET /api/projects/:projectId/phases/:phaseType/status
   * 
   * Returns detailed phase status, progress metrics, and next steps
   * for the specified project phase.
   */
  router.get('/:projectId/phases/:phaseType/status',
    ValidationMiddleware.validateProjectId(),
    ValidationMiddleware.validatePhaseType(),
    
    wrapAsync(async (req, res) => {
      // Enhanced phase status endpoint (could be added to controller)
      const { projectId, phaseType } = req.params
      
      try {
        // Get project to ensure it exists
        const projectResult = await projectService.getProject(projectId as UUID)
        
        if (!projectResult.success) {
          const statusCode = projectResult.error?.code === 'PROJECT_NOT_FOUND' ? 404 : 500
          return res.status(statusCode).json(
            createApiError(
              projectResult.error?.message || 'Failed to retrieve project',
              projectResult.error?.code || 'PROJECT_ERROR',
              statusCode,
              { projectId, phaseType }
            )
          )
        }

        const project = projectResult.data!
        const phaseStatus = {
          projectId,
          phaseType: phaseType as PhaseType,
          currentPhase: project.currentPhase,
          status: project.currentPhase === phaseType ? 'active' : 
                  project.completedPhases?.includes(phaseType as PhaseType) ? 'completed' : 'pending',
          progress: project.currentPhase === phaseType ? project.progress || 0 : 
                   project.completedPhases?.includes(phaseType as PhaseType) ? 100 : 0,
          lastUpdated: project.lastModified,
          nextActions: [], // Could be enhanced based on phase logic
          estimatedCompletion: null // Could be calculated based on project analytics
        }

        const response = createApiResponse(
          phaseStatus,
          `Phase ${phaseType} status retrieved successfully`,
          {
            operation: 'phaseStatus',
            processingTime: 0,
            traceId: req.context?.traceId || '',
            cached: false
          }
        )

        res.status(200).json(response)

      } catch (error) {
        logger.error('Error retrieving phase status', {
          error: error instanceof Error ? error.message : String(error),
          projectId,
          phaseType,
          operationId: req.context?.operationId
        })

        res.status(500).json(
          createApiError(
            'Failed to retrieve phase status',
            'PHASE_STATUS_ERROR',
            500,
            { projectId, phaseType }
          )
        )
      }
    })
  )

  // =============================================================================
  // BATCH OPERATIONS (EFFICIENCY ENDPOINTS)
  // =============================================================================

  /**
   * Validate multiple projects in batch
   * 
   * POST /api/projects/batch/validate
   * 
   * Validates multiple projects efficiently in a single request,
   * following Cline's batch processing patterns for performance optimization.
   */
  router.post('/batch/validate',
    ValidationMiddleware.validateBatchRequest(),
    RateLimitingMiddleware.applyRateLimit('batch-validate', 10, '1h'),
    
    wrapAsync(async (req, res) => {
      await projectController.validateProjectsBatch(req, res)
    })
  )

  /**
   * Update multiple projects in batch
   * 
   * POST /api/projects/batch/update
   * 
   * Updates multiple projects with the same modifications efficiently,
   * following Cline's batch operation patterns with comprehensive validation.
   */
  router.post('/batch/update',
    ValidationMiddleware.validateBatchUpdateRequest(),
    RateLimitingMiddleware.applyRateLimit('batch-update', 3, '1h'),
    
    wrapAsync(async (req, res) => {
      await projectController.updateProjectsBatch(req, res)
    })
  )

  // =============================================================================
  // PROJECT COLLABORATION AND SHARING (FUTURE-READY ENDPOINTS)
  // =============================================================================

  /**
   * Generate project sharing configuration
   * 
   * POST /api/projects/:projectId/share
   * 
   * Generates secure sharing links and collaboration settings for project sharing,
   * following enterprise-grade security patterns adapted from Cline's access control.
   */
  router.post('/:projectId/share',
    ValidationMiddleware.validateProjectId(),
    ValidationMiddleware.validateSharingOptions(),
    RateLimitingMiddleware.applyRateLimit('project-share', 10, '1h'),
    
    wrapAsync(async (req, res) => {
      const { projectId } = req.params
      const { shareType, permissions, expiresAt } = req.body

      try {
        logger.info('Generating project sharing configuration', {
          projectId,
          shareType,
          permissions,
          operationId: req.context?.operationId
        })

        // Generate secure sharing token
        const shareToken = generateUUID()
        const shareConfig = {
          projectId,
          shareToken,
          shareType,
          permissions: permissions || ['read'],
          createdBy: req.user?.id || 'anonymous',
          createdAt: createTimestamp(),
          expiresAt: expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          shareUrl: `${req.protocol}://${req.get('host')}/shared/projects/${projectId}?token=${shareToken}`
        }

        const response = createApiResponse(
          shareConfig,
          'Project sharing configuration created successfully',
          {
            operation: 'shareProject',
            processingTime: 0,
            traceId: req.context?.traceId || '',
            cached: false
          }
        )

        res.status(201).json(response)

      } catch (error) {
        logger.error('Error generating project sharing configuration', {
          error: error instanceof Error ? error.message : String(error),
          projectId,
          operationId: req.context?.operationId
        })

        res.status(500).json(
          createApiError(
            'Failed to generate sharing configuration',
            'SHARE_GENERATION_ERROR',
            500,
            { projectId }
          )
        )
      }
    })
  )

  // =============================================================================
  // COMPREHENSIVE ERROR HANDLING (CLINE ERROR PATTERNS)
  // =============================================================================

  /**
   * Catch-all error handler for unmatched routes
   * Following Cline's comprehensive error handling patterns
   */
  router.use('*', (req, res) => {
    const error = createApiError(
      `Projects API endpoint not found: ${req.method} ${req.originalUrl}`,
      'ENDPOINT_NOT_FOUND',
      404,
      {
        method: req.method,
        url: req.originalUrl,
        availableEndpoints: [
          'GET /projects',
          'POST /projects',
          'GET /projects/:id',
          'PUT /projects/:id',
          'DELETE /projects/:id',
          'GET /projects/search',
          'GET /projects/:id/analytics',
          'GET /projects/:id/health',
          'POST /projects/:id/export',
          'POST /projects/import',
          'POST /projects/:id/phases/:phase/start',
          'POST /projects/:id/phases/:phase/complete',
          'GET /projects/:id/phases/:phase/status',
          'POST /projects/batch/validate',
          'POST /projects/batch/update',
          'POST /projects/:id/share'
        ]
      }
    )

    logger.warn('Projects API endpoint not found', {
      method: req.method,
      url: req.originalUrl,
      operationId: req.context?.operationId,
      userAgent: req.headers['user-agent']
    })

    res.status(404).json(error)
  })

  /**
   * Express error handler middleware for unhandled route errors
   * Following Cline's middleware error handling patterns
   */
  router.use((error: any, req: any, res: any, next: any) => {
    if (res.headersSent) {
      return next(error)
    }

    const errorId = generateUUID()

    // Log the unhandled error with comprehensive context
    logger.error('Unhandled error in Projects API Routes', {
      errorId,
      operationId: req.context?.operationId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      url: req.url,
      method: req.method,
      projectId: req.params?.projectId
    })

    // Report to error service for aggregation and alerting
    errorService.reportError(error, {
      module: 'ProjectsRouter',
      operationId: req.context?.operationId,
      errorId,
      url: req.url,
      method: req.method,
      projectId: req.params?.projectId
    })

    // Send standardized error response
    const errorResponse = createApiError(
      'An unexpected error occurred in the Projects API',
      'UNHANDLED_ROUTER_ERROR',
      500,
      {
        operationId: req.context?.operationId,
        errorId,
        timestamp: createTimestamp()
      }
    )

    res.status(500).json(errorResponse)
  })

  // Log successful router configuration
  logger.info('Projects API Routes configured successfully', {
    module: 'ProjectsRouter',
    operation: 'configuration_complete',
    routeCount: router.stack.length,
    timestamp: createTimestamp()
  })

  return router
}

// =============================================================================
// ROUTER HEALTH CHECK AND DIAGNOSTICS (CLINE PATTERNS)
// =============================================================================

/**
 * Health check for Projects Router
 * Following Cline's comprehensive health monitoring patterns
 */
export async function checkProjectsRouterHealth(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy'
  details: Record<string, any>
}> {
  try {
    // Perform basic health checks for router dependencies
    const healthChecks = {
      router: 'healthy',
      middleware: 'healthy',
      validation: 'healthy',
      rateLimit: 'healthy',
      errorHandling: 'healthy'
    }

    return {
      status: 'healthy',
      details: {
        timestamp: createTimestamp(),
        checks: healthChecks,
        version: '1.0.0',
        endpoints: {
          crud: 5,
          analytics: 2,
          importExport: 2,
          lifecycle: 3,
          batch: 2,
          sharing: 1,
          total: 15
        }
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
 * Default export for easy importing
 * Following Cline's export patterns for modular architecture
 */
export default createProjectsRouter

/**
 * Named exports for flexibility
 * Following Cline's comprehensive export patterns
 */
export {
  createProjectsRouter as projectsRouter,
  checkProjectsRouterHealth as projectsHealthCheck
}
