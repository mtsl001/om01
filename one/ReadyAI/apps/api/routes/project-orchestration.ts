// apps/api/routes/project-orchestration.ts

import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { ProjectOrchestrationController } from '../../packages/project-management/controllers/ProjectOrchestrationController.js';
import { AuthMiddleware } from '../../packages/auth/middleware/AuthMiddleware.js';
import { ValidationMiddleware } from '../../packages/api-gateway/middleware/ValidationMiddleware.js';
import { ErrorService } from '../../packages/error-handling/services/ErrorService.js';
import { Logger } from '../../packages/logging/services/Logger.js';
import { ApiResponse, UUID } from '../../packages/foundation/types/core.js';
import type { 
  ProjectOrchestrationStatus, 
  PhaseExecutionRequest, 
  WorkflowControlRequest,
  OrchestrationMetrics 
} from '../../packages/project-management/types/orchestration.js';

/**
 * Project Orchestration Routes
 * Provides comprehensive workflow management and phase control endpoints for ReadyAI projects
 * Adapted from Cline's TaskExecutor routing patterns with ReadyAI-specific orchestration requirements
 */
export class ProjectOrchestrationRoutes {
  private router: Router;
  private orchestrationController: ProjectOrchestrationController;
  private authMiddleware: AuthMiddleware;
  private validationMiddleware: ValidationMiddleware;
  private errorService: ErrorService;
  private logger: Logger;

  constructor(
    orchestrationController: ProjectOrchestrationController,
    authMiddleware: AuthMiddleware,
    validationMiddleware: ValidationMiddleware,
    errorService: ErrorService,
    logger: Logger
  ) {
    this.router = Router();
    this.orchestrationController = orchestrationController;
    this.authMiddleware = authMiddleware;
    this.validationMiddleware = validationMiddleware;
    this.errorService = errorService;
    this.logger = logger;

    this.initializeRoutes();
  }

  /**
   * Initialize all orchestration routes with proper middleware chain
   * Following Cline's proven route organization and error handling patterns
   */
  private initializeRoutes(): void {
    // Project Orchestration Status & Control
    this.router.get(
      '/:projectId/orchestration/status',
      this.authMiddleware.authenticate,
      this.validateProjectId(),
      this.validationMiddleware.handleValidationErrors,
      this.getOrchestrationStatus.bind(this)
    );

    this.router.post(
      '/:projectId/orchestration/start',
      this.authMiddleware.authenticate,
      this.validateProjectId(),
      this.validateOrchestrationStart(),
      this.validationMiddleware.handleValidationErrors,
      this.startOrchestration.bind(this)
    );

    this.router.post(
      '/:projectId/orchestration/pause',
      this.authMiddleware.authenticate,
      this.validateProjectId(),
      this.validationMiddleware.handleValidationErrors,
      this.pauseOrchestration.bind(this)
    );

    this.router.post(
      '/:projectId/orchestration/resume',
      this.authMiddleware.authenticate,
      this.validateProjectId(),
      this.validationMiddleware.handleValidationErrors,
      this.resumeOrchestration.bind(this)
    );

    this.router.post(
      '/:projectId/orchestration/stop',
      this.authMiddleware.authenticate,
      this.validateProjectId(),
      this.validateOrchestrationStop(),
      this.validationMiddleware.handleValidationErrors,
      this.stopOrchestration.bind(this)
    );

    // Phase Management
    this.router.get(
      '/:projectId/phases',
      this.authMiddleware.authenticate,
      this.validateProjectId(),
      this.validationMiddleware.handleValidationErrors,
      this.getProjectPhases.bind(this)
    );

    this.router.get(
      '/:projectId/phases/:phaseId',
      this.authMiddleware.authenticate,
      this.validateProjectId(),
      this.validatePhaseId(),
      this.validationMiddleware.handleValidationErrors,
      this.getPhaseDetails.bind(this)
    );

    this.router.post(
      '/:projectId/phases/:phaseId/start',
      this.authMiddleware.authenticate,
      this.validateProjectId(),
      this.validatePhaseId(),
      this.validatePhaseExecution(),
      this.validationMiddleware.handleValidationErrors,
      this.startPhase.bind(this)
    );

    this.router.post(
      '/:projectId/phases/:phaseId/complete',
      this.authMiddleware.authenticate,
      this.validateProjectId(),
      this.validatePhaseId(),
      this.validationMiddleware.handleValidationErrors,
      this.completePhase.bind(this)
    );

    this.router.post(
      '/:projectId/phases/:phaseId/rollback',
      this.authMiddleware.authenticate,
      this.validateProjectId(),
      this.validatePhaseId(),
      this.validatePhaseRollback(),
      this.validationMiddleware.handleValidationErrors,
      this.rollbackPhase.bind(this)
    );

    // Workflow Management
    this.router.get(
      '/:projectId/workflow',
      this.authMiddleware.authenticate,
      this.validateProjectId(),
      query('includeMetrics').optional().isBoolean(),
      this.validationMiddleware.handleValidationErrors,
      this.getWorkflowStatus.bind(this)
    );

    this.router.post(
      '/:projectId/workflow/control',
      this.authMiddleware.authenticate,
      this.validateProjectId(),
      this.validateWorkflowControl(),
      this.validationMiddleware.handleValidationErrors,
      this.controlWorkflow.bind(this)
    );

    // Orchestration Metrics & Monitoring
    this.router.get(
      '/:projectId/orchestration/metrics',
      this.authMiddleware.authenticate,
      this.validateProjectId(),
      query('timeRange').optional().isIn(['1h', '6h', '24h', '7d', '30d']),
      query('includePhaseBreakdown').optional().isBoolean(),
      this.validationMiddleware.handleValidationErrors,
      this.getOrchestrationMetrics.bind(this)
    );

    this.router.get(
      '/:projectId/orchestration/health',
      this.authMiddleware.authenticate,
      this.validateProjectId(),
      this.validationMiddleware.handleValidationErrors,
      this.getOrchestrationHealth.bind(this)
    );
  }

  // Route Handlers - Orchestration Control

  /**
   * Get current orchestration status for a project
   * Adapted from Cline's task status retrieval patterns
   */
  private async getOrchestrationStatus(req: any, res: any): Promise<void> {
    try {
      const projectId = req.params.projectId as UUID;
      const correlationId = req.headers['x-correlation-id'] as string;

      this.logger.info('Getting orchestration status', { 
        projectId, 
        correlationId,
        userId: req.user?.id 
      });

      const status = await this.orchestrationController.getOrchestrationStatus(
        projectId,
        correlationId
      );

      const response: ApiResponse<ProjectOrchestrationStatus> = {
        success: true,
        data: status,
        correlationId,
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      await this.handleRouteError(error, req, res, 'getOrchestrationStatus');
    }
  }

  /**
   * Start project orchestration with specified configuration
   * Following Cline's task execution initiation patterns
   */
  private async startOrchestration(req: any, res: any): Promise<void> {
    try {
      const projectId = req.params.projectId as UUID;
      const correlationId = req.headers['x-correlation-id'] as string;
      const { startFromPhase, skipPhases, config } = req.body;

      this.logger.info('Starting project orchestration', { 
        projectId, 
        correlationId,
        startFromPhase,
        skipPhases,
        userId: req.user?.id 
      });

      const orchestrationStatus = await this.orchestrationController.startOrchestration(
        projectId,
        {
          startFromPhase,
          skipPhases,
          config,
          userId: req.user.id
        },
        correlationId
      );

      const response: ApiResponse<ProjectOrchestrationStatus> = {
        success: true,
        data: orchestrationStatus,
        message: 'Project orchestration started successfully',
        correlationId,
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      await this.handleRouteError(error, req, res, 'startOrchestration');
    }
  }

  /**
   * Pause active orchestration while preserving state
   * Adapted from Cline's graceful task interruption patterns
   */
  private async pauseOrchestration(req: any, res: any): Promise<void> {
    try {
      const projectId = req.params.projectId as UUID;
      const correlationId = req.headers['x-correlation-id'] as string;

      this.logger.info('Pausing project orchestration', { 
        projectId, 
        correlationId,
        userId: req.user?.id 
      });

      const orchestrationStatus = await this.orchestrationController.pauseOrchestration(
        projectId,
        correlationId
      );

      const response: ApiResponse<ProjectOrchestrationStatus> = {
        success: true,
        data: orchestrationStatus,
        message: 'Project orchestration paused successfully',
        correlationId,
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      await this.handleRouteError(error, req, res, 'pauseOrchestration');
    }
  }

  /**
   * Resume paused orchestration from current state
   * Following Cline's state restoration patterns
   */
  private async resumeOrchestration(req: any, res: any): Promise<void> {
    try {
      const projectId = req.params.projectId as UUID;
      const correlationId = req.headers['x-correlation-id'] as string;

      this.logger.info('Resuming project orchestration', { 
        projectId, 
        correlationId,
        userId: req.user?.id 
      });

      const orchestrationStatus = await this.orchestrationController.resumeOrchestration(
        projectId,
        correlationId
      );

      const response: ApiResponse<ProjectOrchestrationStatus> = {
        success: true,
        data: orchestrationStatus,
        message: 'Project orchestration resumed successfully',
        correlationId,
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      await this.handleRouteError(error, req, res, 'resumeOrchestration');
    }
  }

  /**
   * Stop orchestration with optional cleanup configuration
   * Adapted from Cline's task termination and cleanup patterns
   */
  private async stopOrchestration(req: any, res: any): Promise<void> {
    try {
      const projectId = req.params.projectId as UUID;
      const correlationId = req.headers['x-correlation-id'] as string;
      const { force = false, preserveState = true } = req.body;

      this.logger.info('Stopping project orchestration', { 
        projectId, 
        correlationId,
        force,
        preserveState,
        userId: req.user?.id 
      });

      const orchestrationStatus = await this.orchestrationController.stopOrchestration(
        projectId,
        { force, preserveState },
        correlationId
      );

      const response: ApiResponse<ProjectOrchestrationStatus> = {
        success: true,
        data: orchestrationStatus,
        message: 'Project orchestration stopped successfully',
        correlationId,
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      await this.handleRouteError(error, req, res, 'stopOrchestration');
    }
  }

  // Route Handlers - Phase Management

  /**
   * Get all phases for a project with current status
   * Following Cline's hierarchical task structure patterns
   */
  private async getProjectPhases(req: any, res: any): Promise<void> {
    try {
      const projectId = req.params.projectId as UUID;
      const correlationId = req.headers['x-correlation-id'] as string;

      this.logger.info('Getting project phases', { 
        projectId, 
        correlationId,
        userId: req.user?.id 
      });

      const phases = await this.orchestrationController.getProjectPhases(
        projectId,
        correlationId
      );

      const response: ApiResponse<any[]> = {
        success: true,
        data: phases,
        correlationId,
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      await this.handleRouteError(error, req, res, 'getProjectPhases');
    }
  }

  /**
   * Get detailed information about a specific phase
   * Adapted from Cline's detailed task inspection patterns
   */
  private async getPhaseDetails(req: any, res: any): Promise<void> {
    try {
      const projectId = req.params.projectId as UUID;
      const phaseId = req.params.phaseId as string;
      const correlationId = req.headers['x-correlation-id'] as string;

      this.logger.info('Getting phase details', { 
        projectId, 
        phaseId,
        correlationId,
        userId: req.user?.id 
      });

      const phaseDetails = await this.orchestrationController.getPhaseDetails(
        projectId,
        phaseId,
        correlationId
      );

      const response: ApiResponse<any> = {
        success: true,
        data: phaseDetails,
        correlationId,
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      await this.handleRouteError(error, req, res, 'getPhaseDetails');
    }
  }

  /**
   * Start execution of a specific phase
   * Following Cline's phase-based execution patterns
   */
  private async startPhase(req: any, res: any): Promise<void> {
    try {
      const projectId = req.params.projectId as UUID;
      const phaseId = req.params.phaseId as string;
      const correlationId = req.headers['x-correlation-id'] as string;
      const executionConfig = req.body as PhaseExecutionRequest;

      this.logger.info('Starting phase execution', { 
        projectId, 
        phaseId,
        correlationId,
        config: executionConfig,
        userId: req.user?.id 
      });

      const phaseStatus = await this.orchestrationController.startPhase(
        projectId,
        phaseId,
        {
          ...executionConfig,
          userId: req.user.id
        },
        correlationId
      );

      const response: ApiResponse<any> = {
        success: true,
        data: phaseStatus,
        message: `Phase ${phaseId} started successfully`,
        correlationId,
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      await this.handleRouteError(error, req, res, 'startPhase');
    }
  }

  /**
   * Mark a phase as completed with validation
   * Adapted from Cline's task completion verification patterns
   */
  private async completePhase(req: any, res: any): Promise<void> {
    try {
      const projectId = req.params.projectId as UUID;
      const phaseId = req.params.phaseId as string;
      const correlationId = req.headers['x-correlation-id'] as string;

      this.logger.info('Completing phase', { 
        projectId, 
        phaseId,
        correlationId,
        userId: req.user?.id 
      });

      const phaseStatus = await this.orchestrationController.completePhase(
        projectId,
        phaseId,
        correlationId
      );

      const response: ApiResponse<any> = {
        success: true,
        data: phaseStatus,
        message: `Phase ${phaseId} completed successfully`,
        correlationId,
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      await this.handleRouteError(error, req, res, 'completePhase');
    }
  }

  /**
   * Rollback a phase to previous state
   * Following Cline's state restoration and rollback patterns
   */
  private async rollbackPhase(req: any, res: any): Promise<void> {
    try {
      const projectId = req.params.projectId as UUID;
      const phaseId = req.params.phaseId as string;
      const correlationId = req.headers['x-correlation-id'] as string;
      const { targetCheckpoint, preserveArtifacts = true } = req.body;

      this.logger.info('Rolling back phase', { 
        projectId, 
        phaseId,
        correlationId,
        targetCheckpoint,
        preserveArtifacts,
        userId: req.user?.id 
      });

      const phaseStatus = await this.orchestrationController.rollbackPhase(
        projectId,
        phaseId,
        { targetCheckpoint, preserveArtifacts },
        correlationId
      );

      const response: ApiResponse<any> = {
        success: true,
        data: phaseStatus,
        message: `Phase ${phaseId} rolled back successfully`,
        correlationId,
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      await this.handleRouteError(error, req, res, 'rollbackPhase');
    }
  }

  // Route Handlers - Workflow Management

  /**
   * Get comprehensive workflow status and metrics
   * Adapted from Cline's workflow monitoring patterns
   */
  private async getWorkflowStatus(req: any, res: any): Promise<void> {
    try {
      const projectId = req.params.projectId as UUID;
      const correlationId = req.headers['x-correlation-id'] as string;
      const includeMetrics = req.query.includeMetrics === 'true';

      this.logger.info('Getting workflow status', { 
        projectId, 
        correlationId,
        includeMetrics,
        userId: req.user?.id 
      });

      const workflowStatus = await this.orchestrationController.getWorkflowStatus(
        projectId,
        { includeMetrics },
        correlationId
      );

      const response: ApiResponse<any> = {
        success: true,
        data: workflowStatus,
        correlationId,
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      await this.handleRouteError(error, req, res, 'getWorkflowStatus');
    }
  }

  /**
   * Control workflow execution with various commands
   * Following Cline's command-based workflow control patterns
   */
  private async controlWorkflow(req: any, res: any): Promise<void> {
    try {
      const projectId = req.params.projectId as UUID;
      const correlationId = req.headers['x-correlation-id'] as string;
      const controlRequest = req.body as WorkflowControlRequest;

      this.logger.info('Controlling workflow', { 
        projectId, 
        correlationId,
        command: controlRequest.command,
        userId: req.user?.id 
      });

      const workflowStatus = await this.orchestrationController.controlWorkflow(
        projectId,
        controlRequest,
        correlationId
      );

      const response: ApiResponse<any> = {
        success: true,
        data: workflowStatus,
        message: `Workflow ${controlRequest.command} executed successfully`,
        correlationId,
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      await this.handleRouteError(error, req, res, 'controlWorkflow');
    }
  }

  /**
   * Get orchestration performance metrics and analytics
   * Adapted from Cline's telemetry and performance monitoring patterns
   */
  private async getOrchestrationMetrics(req: any, res: any): Promise<void> {
    try {
      const projectId = req.params.projectId as UUID;
      const correlationId = req.headers['x-correlation-id'] as string;
      const timeRange = req.query.timeRange as string || '24h';
      const includePhaseBreakdown = req.query.includePhaseBreakdown === 'true';

      this.logger.info('Getting orchestration metrics', { 
        projectId, 
        correlationId,
        timeRange,
        includePhaseBreakdown,
        userId: req.user?.id 
      });

      const metrics = await this.orchestrationController.getOrchestrationMetrics(
        projectId,
        { timeRange, includePhaseBreakdown },
        correlationId
      );

      const response: ApiResponse<OrchestrationMetrics> = {
        success: true,
        data: metrics,
        correlationId,
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      await this.handleRouteError(error, req, res, 'getOrchestrationMetrics');
    }
  }

  /**
   * Get orchestration health status and system diagnostics
   * Following Cline's health monitoring and diagnostic patterns
   */
  private async getOrchestrationHealth(req: any, res: any): Promise<void> {
    try {
      const projectId = req.params.projectId as UUID;
      const correlationId = req.headers['x-correlation-id'] as string;

      this.logger.info('Getting orchestration health', { 
        projectId, 
        correlationId,
        userId: req.user?.id 
      });

      const health = await this.orchestrationController.getOrchestrationHealth(
        projectId,
        correlationId
      );

      const response: ApiResponse<any> = {
        success: true,
        data: health,
        correlationId,
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      await this.handleRouteError(error, req, res, 'getOrchestrationHealth');
    }
  }

  // Validation Middleware Factories

  private validateProjectId() {
    return param('projectId')
      .isUUID(4)
      .withMessage('Project ID must be a valid UUID');
  }

  private validatePhaseId() {
    return param('phaseId')
      .isString()
      .isLength({ min: 1, max: 100 })
      .withMessage('Phase ID must be a non-empty string with max 100 characters');
  }

  private validateOrchestrationStart() {
    return [
      body('startFromPhase')
        .optional()
        .isString()
        .withMessage('startFromPhase must be a string'),
      body('skipPhases')
        .optional()
        .isArray()
        .withMessage('skipPhases must be an array'),
      body('config')
        .optional()
        .isObject()
        .withMessage('config must be an object')
    ];
  }

  private validateOrchestrationStop() {
    return [
      body('force')
        .optional()
        .isBoolean()
        .withMessage('force must be a boolean'),
      body('preserveState')
        .optional()
        .isBoolean()
        .withMessage('preserveState must be a boolean')
    ];
  }

  private validatePhaseExecution() {
    return [
      body('config')
        .optional()
        .isObject()
        .withMessage('config must be an object'),
      body('skipValidation')
        .optional()
        .isBoolean()
        .withMessage('skipValidation must be a boolean')
    ];
  }

  private validatePhaseRollback() {
    return [
      body('targetCheckpoint')
        .optional()
        .isString()
        .withMessage('targetCheckpoint must be a string'),
      body('preserveArtifacts')
        .optional()
        .isBoolean()
        .withMessage('preserveArtifacts must be a boolean')
    ];
  }

  private validateWorkflowControl() {
    return [
      body('command')
        .isIn(['pause', 'resume', 'stop', 'restart', 'skip_phase', 'retry_phase'])
        .withMessage('command must be a valid workflow control command'),
      body('parameters')
        .optional()
        .isObject()
        .withMessage('parameters must be an object')
    ];
  }

  /**
   * Centralized error handling following Cline's error management patterns
   * Provides consistent error responses and logging across all route handlers
   */
  private async handleRouteError(
    error: any, 
    req: any, 
    res: any, 
    operation: string
  ): Promise<void> {
    const correlationId = req.headers['x-correlation-id'] as string;
    const projectId = req.params?.projectId;

    this.logger.error(`Project orchestration route error in ${operation}`, {
      error: error.message,
      stack: error.stack,
      projectId,
      correlationId,
      userId: req.user?.id,
      operation
    });

    const { statusCode, errorResponse } = await this.errorService.handleApiError(
      error,
      {
        operation,
        resource: 'project_orchestration',
        projectId,
        correlationId
      }
    );

    res.status(statusCode).json(errorResponse);
  }

  public getRouter(): Router {
    return this.router;
  }
}

/**
 * Factory function to create and configure project orchestration routes
 * Following Cline's dependency injection and configuration patterns
 */
export function createProjectOrchestrationRoutes(
  orchestrationController: ProjectOrchestrationController,
  authMiddleware: AuthMiddleware,
  validationMiddleware: ValidationMiddleware,
  errorService: ErrorService,
  logger: Logger
): Router {
  const routes = new ProjectOrchestrationRoutes(
    orchestrationController,
    authMiddleware,
    validationMiddleware,
    errorService,
    logger
  );

  return routes.getRouter();
}

export default ProjectOrchestrationRoutes;
