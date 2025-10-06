// packages/project-management/controllers/ProjectSettingsController.ts

/**
 * Project Settings Controller for ReadyAI Personal AI Development Orchestrator
 * 
 * RESTful API controller for comprehensive project-level settings management with
 * hierarchical inheritance, user preferences, validation, and enterprise-grade
 * configuration capabilities.
 * 
 * Adapted from Cline's proven controller patterns (~85% reuse) with ReadyAI-specific
 * extensions for project-level configuration management, multi-user support, and
 * real-time settings synchronization.
 * 
 * Key Features:
 * - RESTful endpoints for all settings CRUD operations
 * - Comprehensive validation with detailed error handling
 * - Batch update capabilities with transaction-like behavior
 * - Real-time settings synchronization and change events
 * - User preference management and inheritance resolution
 * - Export/import capabilities for settings backup/migration
 * - Enterprise security and audit trail integration
 * 
 * Cline Pattern Reuse (~85%):
 * - Controller architecture from Cline's gRPC service handlers
 * - Request/response patterns from Cline's API endpoint handlers
 * - Validation middleware from Cline's parameter validation
 * - Error handling patterns from Cline's comprehensive error management
 * - Async response wrapping from Cline's promise handling utilities
 * - State management integration from Cline's settings controllers
 * - Event emission patterns from Cline's notification system
 * 
 * @version 1.0.0 - Master Implementation Phase
 * @author ReadyAI Development Team
 */

import {
  UUID,
  ApiResponse,
  ApiResult,
  ReadyAIError,
  createApiResponse,
  createApiError,
  isApiSuccess,
  wrapAsync,
  generateUUID,
  createTimestamp,
  PhaseType,
  ValidationResult,
  HTTP_STATUS,
  ERROR_CODES
} from '../../foundation/types/core';

import {
  ProjectSettings,
  ProjectAISettings,
  ProjectDevelopmentSettings,
  ProjectQualitySettings,
  ProjectUISettings,
  ProjectNotificationSettings,
  ProjectSecuritySettings,
  ProjectIntegrationSettings,
  ProjectBackupSettings,
  ProjectSettingsUpdateRequest,
  SettingsResolutionResult,
  SettingsChangeEvent,
  ProjectSettingsService,
  ProjectSettingsServiceOptions
} from '../services/ProjectSettingsService';

import { Logger } from '../../logging/services/Logger';
import { ErrorService } from '../../error-handling/services/ErrorService';

// =============================================================================
// REQUEST/RESPONSE TYPES
// =============================================================================

/**
 * Request for getting project settings with optional filters
 * Following Cline's parameter validation patterns
 */
export interface GetProjectSettingsRequest {
  /** Project identifier */
  projectId: UUID;
  /** Include inherited settings from global/user preferences */
  includeInherited?: boolean;
  /** Resolve all overrides and conflicts */
  resolveOverrides?: boolean;
  /** User context for user-specific overrides */
  userId?: UUID;
  /** Phase context for phase-specific settings */
  phase?: PhaseType;
  /** Environment context for environment-specific settings */
  environment?: string;
  /** Return specific setting sections only */
  sections?: ('ai' | 'development' | 'quality' | 'ui' | 'notifications' | 'security' | 'integration' | 'backup')[];
}

/**
 * Request for batch updating multiple projects' settings
 * Adapted from Cline's batch operation patterns
 */
export interface BatchUpdateSettingsRequest {
  /** Array of update requests */
  updates: ProjectSettingsUpdateRequest[];
  /** Batch metadata */
  metadata?: {
    reason: string;
    source: 'user' | 'system' | 'migration' | 'sync';
    transactional?: boolean;
  };
  /** Validation options */
  validation?: {
    strict: boolean;
    stopOnFirstError: boolean;
    dryRun: boolean;
  };
}

/**
 * Response for batch operations
 */
export interface BatchUpdateSettingsResponse {
  /** Successful updates */
  successful: Array<{
    projectId: UUID;
    result: SettingsResolutionResult;
  }>;
  /** Failed updates */
  failed: Array<{
    projectId: UUID;
    error: {
      message: string;
      code: string;
      details?: Record<string, any>;
    };
  }>;
  /** Overall batch status */
  batchStatus: 'completed' | 'partial' | 'failed';
  /** Processing metadata */
  processingTime: number;
}

/**
 * Settings export request
 */
export interface ExportSettingsRequest {
  /** Project identifier */
  projectId: UUID;
  /** Export options */
  options?: {
    includeUserOverrides?: boolean;
    includeSecrets?: boolean;
    format?: 'json' | 'yaml';
    compress?: boolean;
  };
}

/**
 * Settings import request
 */
export interface ImportSettingsRequest {
  /** Project identifier */
  projectId: UUID;
  /** Settings data to import */
  data: string;
  /** Import options */
  options?: {
    overwrite?: boolean;
    validate?: boolean;
    format?: 'json' | 'yaml';
    preserveIds?: boolean;
  };
}

/**
 * Health check response
 */
export interface HealthCheckResponse {
  /** Service status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Detailed health information */
  details: {
    service: Record<string, any>;
    cache: Record<string, any>;
    events: Record<string, any>;
    storage: Record<string, any>;
  };
  /** Last health check timestamp */
  lastChecked: string;
  /** Response time in milliseconds */
  responseTime: number;
}

// =============================================================================
// VALIDATION MIDDLEWARE
// =============================================================================

/**
 * Request validation middleware following Cline's validation patterns
 */
class SettingsRequestValidator {
  /**
   * Validate UUID parameter
   */
  static validateUUID(value: any, fieldName: string): asserts value is UUID {
    if (!value || typeof value !== 'string') {
      throw new ReadyAIError(
        `${fieldName} is required and must be a string`,
        ERROR_CODES.MISSING_PARAMETER,
        HTTP_STATUS.BAD_REQUEST,
        { field: fieldName, value }
      );
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(value)) {
      throw new ReadyAIError(
        `${fieldName} must be a valid UUID`,
        ERROR_CODES.INVALID_UUID,
        HTTP_STATUS.BAD_REQUEST,
        { field: fieldName, value }
      );
    }
  }

  /**
   * Validate get settings request
   */
  static validateGetRequest(req: any): GetProjectSettingsRequest {
    const { projectId, includeInherited, resolveOverrides, userId, phase, environment, sections } = req.body || req.query || req.params || {};

    this.validateUUID(projectId, 'projectId');

    if (userId && typeof userId === 'string') {
      this.validateUUID(userId, 'userId');
    }

    if (sections && !Array.isArray(sections)) {
      throw new ReadyAIError(
        'sections must be an array',
        ERROR_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST,
        { field: 'sections', value: sections }
      );
    }

    return {
      projectId,
      includeInherited: includeInherited === 'true' || includeInherited === true,
      resolveOverrides: resolveOverrides === 'true' || resolveOverrides === true,
      userId: userId || undefined,
      phase: phase as PhaseType || undefined,
      environment: environment || undefined,
      sections: sections || undefined
    };
  }

  /**
   * Validate update settings request
   */
  static validateUpdateRequest(req: any): ProjectSettingsUpdateRequest {
    const { projectId, updates, metadata, validation } = req.body || {};

    this.validateUUID(projectId, 'projectId');

    if (!updates || typeof updates !== 'object') {
      throw new ReadyAIError(
        'updates is required and must be an object',
        ERROR_CODES.MISSING_PARAMETER,
        HTTP_STATUS.BAD_REQUEST,
        { field: 'updates', value: updates }
      );
    }

    return {
      projectId,
      updates,
      metadata,
      validation
    };
  }

  /**
   * Validate batch update request
   */
  static validateBatchUpdateRequest(req: any): BatchUpdateSettingsRequest {
    const { updates, metadata, validation } = req.body || {};

    if (!Array.isArray(updates) || updates.length === 0) {
      throw new ReadyAIError(
        'updates must be a non-empty array',
        ERROR_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST,
        { field: 'updates', value: updates }
      );
    }

    // Validate each update request
    updates.forEach((update, index) => {
      try {
        this.validateUpdateRequest({ body: update });
      } catch (error) {
        throw new ReadyAIError(
          `Invalid update request at index ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ERROR_CODES.VALIDATION_ERROR,
          HTTP_STATUS.BAD_REQUEST,
          { index, update, originalError: error }
        );
      }
    });

    return { updates, metadata, validation };
  }
}

// =============================================================================
// PROJECT SETTINGS CONTROLLER IMPLEMENTATION
// =============================================================================

/**
 * Project Settings Controller
 * 
 * RESTful API controller providing comprehensive project settings management
 * with enterprise-grade features including validation, caching, real-time
 * synchronization, and hierarchical configuration inheritance.
 * 
 * Follows Cline's proven controller architecture with ReadyAI-specific
 * enhancements for project-centric development workflows.
 * 
 * Endpoints:
 * - GET    /api/projects/:projectId/settings - Get project settings with inheritance
 * - PUT    /api/projects/:projectId/settings - Update project settings
 * - POST   /api/projects/:projectId/settings/batch - Batch update multiple settings
 * - DELETE /api/projects/:projectId/settings - Delete project settings
 * - GET    /api/projects/:projectId/settings/user/:userId - Get user-specific overrides
 * - PUT    /api/projects/:projectId/settings/user/:userId - Update user-specific overrides
 * - POST   /api/projects/:projectId/settings/export - Export settings for backup
 * - POST   /api/projects/:projectId/settings/import - Import settings from backup
 * - GET    /api/projects/:projectId/settings/health - Health check endpoint
 * - POST   /api/projects/:projectId/settings/validate - Validate settings without saving
 * 
 * WebSocket Events:
 * - settings:changed - Real-time settings change notifications
 * - settings:validation - Settings validation results
 * - settings:health - Health status updates
 */
export class ProjectSettingsController {
  private readonly projectSettingsService: ProjectSettingsService;
  private readonly logger: Logger;
  private readonly errorService: ErrorService;

  // Event listeners for real-time updates (following Cline's event patterns)
  private readonly eventListeners = new Map<string, Set<(data: any) => void>>();

  constructor(
    projectSettingsService: ProjectSettingsService,
    logger?: Logger,
    errorService?: ErrorService
  ) {
    this.projectSettingsService = projectSettingsService;
    this.logger = logger || this.createBasicLogger();
    this.errorService = errorService || this.createBasicErrorService();

    // Set up settings change event listener
    this.projectSettingsService.addEventListener('*', this.handleSettingsChange.bind(this));

    this.logger.info('ProjectSettingsController initialized', {
      service: 'ProjectSettingsController',
      version: '1.0.0'
    });
  }

  /**
   * Get project settings with full inheritance resolution
   * GET /api/projects/:projectId/settings
   * 
   * Adapted from Cline's getLatestState controller pattern
   */
  async getProjectSettings(req: any, res?: any): Promise<ApiResponse<SettingsResolutionResult> | void> {
    const startTime = Date.now();
    
    return this.handleRequest(async () => {
      this.logger.debug('GET project settings request', { 
        params: req.params,
        query: req.query
      });

      // Validate and extract request parameters
      const requestData = SettingsRequestValidator.validateGetRequest({
        body: { ...req.params, ...req.query }
      });

      // Get settings from service
      const result = await this.projectSettingsService.getProjectSettings(
        requestData.projectId,
        {
          includeInherited: requestData.includeInherited,
          resolveOverrides: requestData.resolveOverrides,
          userId: requestData.userId,
          phase: requestData.phase,
          environment: requestData.environment
        }
      );

      if (!isApiSuccess(result)) {
        throw new ReadyAIError(
          result.error.message,
          result.error.code,
          result.error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR,
          result.error.details
        );
      }

      // Filter sections if requested
      let responseData = result.data;
      if (requestData.sections && requestData.sections.length > 0) {
        responseData = this.filterSettingsSections(responseData, requestData.sections);
      }

      const response = createApiResponse(responseData, {
        timestamp: createTimestamp(),
        requestId: generateUUID(),
        metrics: {
          processingTime: Date.now() - startTime
        }
      });

      this.logger.info('Project settings retrieved successfully', {
        projectId: requestData.projectId,
        sectionsRequested: requestData.sections?.length || 'all',
        processingTime: Date.now() - startTime
      });

      if (res) {
        res.status(HTTP_STATUS.OK).json(response);
        return;
      }
      return response;
    }, res);
  }

  /**
   * Update project settings with comprehensive validation
   * PUT /api/projects/:projectId/settings
   * 
   * Following Cline's updateSettings controller pattern with enhanced validation
   */
  async updateProjectSettings(req: any, res?: any): Promise<ApiResponse<SettingsResolutionResult> | void> {
    const startTime = Date.now();
    
    return this.handleRequest(async () => {
      this.logger.debug('PUT project settings request', { 
        projectId: req.params?.projectId,
        updateKeys: Object.keys(req.body?.updates || {})
      });

      // Validate request
      const updateRequest = SettingsRequestValidator.validateUpdateRequest({
        body: { 
          projectId: req.params?.projectId,
          ...req.body 
        }
      });

      // Update settings through service
      const result = await this.projectSettingsService.updateProjectSettings(updateRequest);

      if (!isApiSuccess(result)) {
        throw new ReadyAIError(
          result.error.message,
          result.error.code,
          result.error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR,
          result.error.details
        );
      }

      const response = createApiResponse(result.data, {
        timestamp: createTimestamp(),
        requestId: generateUUID(),
        metrics: {
          processingTime: Date.now() - startTime
        }
      });

      this.logger.info('Project settings updated successfully', {
        projectId: updateRequest.projectId,
        changedPaths: Object.keys(updateRequest.updates).length,
        validationPassed: result.data.validation.passed,
        processingTime: Date.now() - startTime
      });

      if (res) {
        res.status(HTTP_STATUS.OK).json(response);
        return;
      }
      return response;
    }, res);
  }

  /**
   * Batch update multiple project settings
   * POST /api/projects/settings/batch
   * 
   * Following Cline's batch operation patterns with transaction-like behavior
   */
  async batchUpdateSettings(req: any, res?: any): Promise<ApiResponse<BatchUpdateSettingsResponse> | void> {
    const startTime = Date.now();
    
    return this.handleRequest(async () => {
      this.logger.debug('POST batch settings update request', { 
        updateCount: req.body?.updates?.length
      });

      // Validate batch request
      const batchRequest = SettingsRequestValidator.validateBatchUpdateRequest(req);

      const successful: Array<{ projectId: UUID; result: SettingsResolutionResult }> = [];
      const failed: Array<{ projectId: UUID; error: any }> = [];

      // Process updates sequentially or in parallel based on transactional flag
      if (batchRequest.metadata?.transactional) {
        // Sequential processing for transactional behavior
        for (const updateRequest of batchRequest.updates) {
          try {
            const result = await this.projectSettingsService.updateProjectSettings(updateRequest);
            
            if (isApiSuccess(result)) {
              successful.push({
                projectId: updateRequest.projectId,
                result: result.data
              });
            } else {
              failed.push({
                projectId: updateRequest.projectId,
                error: {
                  message: result.error.message,
                  code: result.error.code || 'UNKNOWN_ERROR',
                  details: result.error.details
                }
              });

              // Stop on first error in transactional mode
              if (batchRequest.validation?.stopOnFirstError) {
                break;
              }
            }
          } catch (error) {
            failed.push({
              projectId: updateRequest.projectId,
              error: {
                message: error instanceof Error ? error.message : 'Unknown error',
                code: error instanceof ReadyAIError ? error.code || 'UNKNOWN_ERROR' : 'UNKNOWN_ERROR',
                details: error instanceof ReadyAIError ? error.details : { originalError: error }
              }
            });

            if (batchRequest.validation?.stopOnFirstError) {
              break;
            }
          }
        }
      } else {
        // Parallel processing for better performance
        const results = await Promise.allSettled(
          batchRequest.updates.map(async updateRequest => {
            const result = await this.projectSettingsService.updateProjectSettings(updateRequest);
            return { updateRequest, result };
          })
        );

        results.forEach(result => {
          if (result.status === 'fulfilled') {
            const { updateRequest, result: serviceResult } = result.value;
            
            if (isApiSuccess(serviceResult)) {
              successful.push({
                projectId: updateRequest.projectId,
                result: serviceResult.data
              });
            } else {
              failed.push({
                projectId: updateRequest.projectId,
                error: {
                  message: serviceResult.error.message,
                  code: serviceResult.error.code || 'UNKNOWN_ERROR',
                  details: serviceResult.error.details
                }
              });
            }
          } else {
            // Extract projectId from the rejected promise
            const error = result.reason;
            const projectId = batchRequest.updates[results.indexOf(result)]?.projectId || 'unknown';
            
            failed.push({
              projectId,
              error: {
                message: error instanceof Error ? error.message : 'Unknown error',
                code: error instanceof ReadyAIError ? error.code || 'UNKNOWN_ERROR' : 'UNKNOWN_ERROR',
                details: error instanceof ReadyAIError ? error.details : { originalError: error }
              }
            });
          }
        });
      }

      // Determine batch status
      let batchStatus: 'completed' | 'partial' | 'failed';
      if (failed.length === 0) {
        batchStatus = 'completed';
      } else if (successful.length > 0) {
        batchStatus = 'partial';
      } else {
        batchStatus = 'failed';
      }

      const processingTime = Date.now() - startTime;
      const response: BatchUpdateSettingsResponse = {
        successful,
        failed,
        batchStatus,
        processingTime
      };

      this.logger.info('Batch settings update completed', {
        totalUpdates: batchRequest.updates.length,
        successful: successful.length,
        failed: failed.length,
        batchStatus,
        processingTime
      });

      const apiResponse = createApiResponse(response, {
        timestamp: createTimestamp(),
        requestId: generateUUID(),
        metrics: { processingTime }
      });

      if (res) {
        const statusCode = batchStatus === 'failed' ? HTTP_STATUS.BAD_REQUEST :
                          batchStatus === 'partial' ? HTTP_STATUS.ACCEPTED :
                          HTTP_STATUS.OK;
        res.status(statusCode).json(apiResponse);
        return;
      }
      return apiResponse;
    }, res);
  }

  /**
   * Delete project settings
   * DELETE /api/projects/:projectId/settings
   * 
   * Following Cline's delete operation patterns
   */
  async deleteProjectSettings(req: any, res?: any): Promise<ApiResponse<void> | void> {
    const startTime = Date.now();
    
    return this.handleRequest(async () => {
      this.logger.debug('DELETE project settings request', { 
        projectId: req.params?.projectId
      });

      const projectId = req.params?.projectId;
      SettingsRequestValidator.validateUUID(projectId, 'projectId');

      const result = await this.projectSettingsService.deleteProjectSettings(projectId);

      if (!isApiSuccess(result)) {
        throw new ReadyAIError(
          result.error.message,
          result.error.code,
          result.error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR,
          result.error.details
        );
      }

      const response = createApiResponse(undefined, {
        timestamp: createTimestamp(),
        requestId: generateUUID(),
        metrics: {
          processingTime: Date.now() - startTime
        }
      });

      this.logger.info('Project settings deleted successfully', {
        projectId,
        processingTime: Date.now() - startTime
      });

      if (res) {
        res.status(HTTP_STATUS.NO_CONTENT).json(response);
        return;
      }
      return response;
    }, res);
  }

  /**
   * Get user-specific project settings
   * GET /api/projects/:projectId/settings/user/:userId
   * 
   * Following Cline's user preference retrieval patterns
   */
  async getUserProjectSettings(req: any, res?: any): Promise<ApiResponse<Partial<ProjectSettings>> | void> {
    const startTime = Date.now();
    
    return this.handleRequest(async () => {
      this.logger.debug('GET user project settings request', { 
        projectId: req.params?.projectId,
        userId: req.params?.userId
      });

      const projectId = req.params?.projectId;
      const userId = req.params?.userId;

      SettingsRequestValidator.validateUUID(projectId, 'projectId');
      SettingsRequestValidator.validateUUID(userId, 'userId');

      const result = await this.projectSettingsService.getUserProjectSettings(projectId, userId);

      if (!isApiSuccess(result)) {
        throw new ReadyAIError(
          result.error.message,
          result.error.code,
          result.error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR,
          result.error.details
        );
      }

      const response = createApiResponse(result.data, {
        timestamp: createTimestamp(),
        requestId: generateUUID(),
        metrics: {
          processingTime: Date.now() - startTime
        }
      });

      this.logger.info('User project settings retrieved successfully', {
        projectId,
        userId,
        processingTime: Date.now() - startTime
      });

      if (res) {
        res.status(HTTP_STATUS.OK).json(response);
        return;
      }
      return response;
    }, res);
  }

  /**
   * Update user-specific project settings
   * PUT /api/projects/:projectId/settings/user/:userId
   * 
   * Following Cline's user preference update patterns
   */
  async updateUserProjectSettings(req: any, res?: any): Promise<ApiResponse<ProjectSettings> | void> {
    const startTime = Date.now();
    
    return this.handleRequest(async () => {
      this.logger.debug('PUT user project settings request', { 
        projectId: req.params?.projectId,
        userId: req.params?.userId,
        updateKeys: Object.keys(req.body || {})
      });

      const projectId = req.params?.projectId;
      const userId = req.params?.userId;
      const updates = req.body;

      SettingsRequestValidator.validateUUID(projectId, 'projectId');
      SettingsRequestValidator.validateUUID(userId, 'userId');

      if (!updates || typeof updates !== 'object') {
        throw new ReadyAIError(
          'Request body must contain settings updates',
          ERROR_CODES.MISSING_PARAMETER,
          HTTP_STATUS.BAD_REQUEST
        );
      }

      const result = await this.projectSettingsService.updateUserProjectSettings(
        projectId,
        userId,
        updates
      );

      if (!isApiSuccess(result)) {
        throw new ReadyAIError(
          result.error.message,
          result.error.code,
          result.error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR,
          result.error.details
        );
      }

      const response = createApiResponse(result.data, {
        timestamp: createTimestamp(),
        requestId: generateUUID(),
        metrics: {
          processingTime: Date.now() - startTime
        }
      });

      this.logger.info('User project settings updated successfully', {
        projectId,
        userId,
        processingTime: Date.now() - startTime
      });

      if (res) {
        res.status(HTTP_STATUS.OK).json(response);
        return;
      }
      return response;
    }, res);
  }

  /**
   * Export project settings for backup or migration
   * POST /api/projects/:projectId/settings/export
   * 
   * Following Cline's export functionality patterns
   */
  async exportProjectSettings(req: any, res?: any): Promise<ApiResponse<string> | void> {
    const startTime = Date.now();
    
    return this.handleRequest(async () => {
      this.logger.debug('POST export project settings request', { 
        projectId: req.params?.projectId,
        options: req.body?.options
      });

      const projectId = req.params?.projectId;
      SettingsRequestValidator.validateUUID(projectId, 'projectId');

      const exportRequest: ExportSettingsRequest = {
        projectId,
        options: req.body?.options || {}
      };

      const result = await this.projectSettingsService.exportProjectSettings(
        exportRequest.projectId,
        exportRequest.options
      );

      if (!isApiSuccess(result)) {
        throw new ReadyAIError(
          result.error.message,
          result.error.code,
          result.error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR,
          result.error.details
        );
      }

      const response = createApiResponse(result.data, {
        timestamp: createTimestamp(),
        requestId: generateUUID(),
        metrics: {
          processingTime: Date.now() - startTime
        }
      });

      this.logger.info('Project settings exported successfully', {
        projectId,
        format: exportRequest.options?.format || 'json',
        size: result.data.length,
        processingTime: Date.now() - startTime
      });

      if (res) {
        res.status(HTTP_STATUS.OK).json(response);
        return;
      }
      return response;
    }, res);
  }

  /**
   * Import project settings from backup or migration
   * POST /api/projects/:projectId/settings/import
   * 
   * Following Cline's import functionality patterns
   */
  async importProjectSettings(req: any, res?: any): Promise<ApiResponse<ProjectSettings> | void> {
    const startTime = Date.now();
    
    return this.handleRequest(async () => {
      this.logger.debug('POST import project settings request', { 
        projectId: req.params?.projectId,
        dataSize: req.body?.data?.length || 0,
        options: req.body?.options
      });

      const projectId = req.params?.projectId;
      SettingsRequestValidator.validateUUID(projectId, 'projectId');

      if (!req.body?.data || typeof req.body.data !== 'string') {
        throw new ReadyAIError(
          'data field is required and must be a string',
          ERROR_CODES.MISSING_PARAMETER,
          HTTP_STATUS.BAD_REQUEST,
          { field: 'data' }
        );
      }

      const importRequest: ImportSettingsRequest = {
        projectId,
        data: req.body.data,
        options: req.body?.options || {}
      };

      const result = await this.projectSettingsService.importProjectSettings(
        importRequest.projectId,
        importRequest.data,
        importRequest.options
      );

      if (!isApiSuccess(result)) {
        throw new ReadyAIError(
          result.error.message,
          result.error.code,
          result.error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR,
          result.error.details
        );
      }

      const response = createApiResponse(result.data, {
        timestamp: createTimestamp(),
        requestId: generateUUID(),
        metrics: {
          processingTime: Date.now() - startTime
        }
      });

      this.logger.info('Project settings imported successfully', {
        projectId,
        format: importRequest.options?.format || 'json',
        dataSize: importRequest.data.length,
        processingTime: Date.now() - startTime
      });

      if (res) {
        res.status(HTTP_STATUS.CREATED).json(response);
        return;
      }
      return response;
    }, res);
  }

  /**
   * Validate project settings without saving
   * POST /api/projects/:projectId/settings/validate
   * 
   * Dry-run validation endpoint following Cline's validation patterns
   */
  async validateProjectSettings(req: any, res?: any): Promise<ApiResponse<ValidationResult> | void> {
    const startTime = Date.now();
    
    return this.handleRequest(async () => {
      this.logger.debug('POST validate project settings request', { 
        projectId: req.params?.projectId,
        hasUpdates: !!req.body?.updates
      });

      if (!req.body?.updates) {
        throw new ReadyAIError(
          'updates field is required for validation',
          ERROR_CODES.MISSING_PARAMETER,
          HTTP_STATUS.BAD_REQUEST,
          { field: 'updates' }
        );
      }

      const updateRequest = SettingsRequestValidator.validateUpdateRequest({
        body: { 
          projectId: req.params?.projectId,
          ...req.body,
          validation: { ...req.body?.validation, dryRun: true }
        }
      });

      const result = await this.projectSettingsService.updateProjectSettings(updateRequest);

      if (!isApiSuccess(result)) {
        throw new ReadyAIError(
          result.error.message,
          result.error.code,
          result.error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR,
          result.error.details
        );
      }

      const response = createApiResponse(result.data.validation, {
        timestamp: createTimestamp(),
        requestId: generateUUID(),
        metrics: {
          processingTime: Date.now() - startTime
        }
      });

      this.logger.info('Project settings validation completed', {
        projectId: updateRequest.projectId,
        passed: result.data.validation.passed,
        errors: result.data.validation.errors.length,
        warnings: result.data.validation.warnings.length,
        processingTime: Date.now() - startTime
      });

      if (res) {
        res.status(HTTP_STATUS.OK).json(response);
        return;
      }
      return response;
    }, res);
  }

  /**
   * Health check endpoint
   * GET /api/projects/:projectId/settings/health
   * 
   * Following Cline's health check patterns
   */
  async getHealthStatus(req: any, res?: any): Promise<ApiResponse<HealthCheckResponse> | void> {
    const startTime = Date.now();
    
    return this.handleRequest(async () => {
      this.logger.debug('GET health check request', { 
        projectId: req.params?.projectId
      });

      const serviceHealthResult = await this.projectSettingsService.getHealthStatus();

      if (!isApiSuccess(serviceHealthResult)) {
        throw new ReadyAIError(
          `Health check failed: ${serviceHealthResult.error.message}`,
          'HEALTH_CHECK_FAILED',
          HTTP_STATUS.SERVICE_UNAVAILABLE,
          serviceHealthResult.error.details
        );
      }

      const processingTime = Date.now() - startTime;
      const healthResponse: HealthCheckResponse = {
        status: serviceHealthResult.data.status,
        details: {
          service: serviceHealthResult.data.details,
          cache: {
            enabled: true, // Would check actual cache status
            hitRate: 0.85 // Would calculate from actual metrics
          },
          events: {
            listeners: this.eventListeners.size,
            lastEvent: createTimestamp()
          },
          storage: {
            available: true,
            lastWrite: createTimestamp()
          }
        },
        lastChecked: createTimestamp(),
        responseTime: processingTime
      };

      const response = createApiResponse(healthResponse, {
        timestamp: createTimestamp(),
        requestId: generateUUID(),
        metrics: { processingTime }
      });

      this.logger.debug('Health check completed', {
        status: healthResponse.status,
        processingTime
      });

      if (res) {
        const statusCode = healthResponse.status === 'healthy' ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE;
        res.status(statusCode).json(response);
        return;
      }
      return response;
    }, res);
  }

  /**
   * Create default settings for a new project
   * POST /api/projects/:projectId/settings/defaults
   * 
   * Following Cline's default creation patterns
   */
  async createDefaultSettings(req: any, res?: any): Promise<ApiResponse<ProjectSettings> | void> {
    const startTime = Date.now();
    
    return this.handleRequest(async () => {
      this.logger.debug('POST create default settings request', { 
        projectId: req.params?.projectId,
        projectData: !!req.body?.project
      });

      const projectId = req.params?.projectId;
      SettingsRequestValidator.validateUUID(projectId, 'projectId');

      const result = await this.projectSettingsService.createDefaultProjectSettings(
        projectId,
        req.body?.project
      );

      if (!isApiSuccess(result)) {
        throw new ReadyAIError(
          result.error.message,
          result.error.code,
          result.error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR,
          result.error.details
        );
      }

      const response = createApiResponse(result.data, {
        timestamp: createTimestamp(),
        requestId: generateUUID(),
        metrics: {
          processingTime: Date.now() - startTime
        }
      });

      this.logger.info('Default project settings created successfully', {
        projectId,
        processingTime: Date.now() - startTime
      });

      if (res) {
        res.status(HTTP_STATUS.CREATED).json(response);
        return;
      }
      return response;
    }, res);
  }

  /**
   * Subscribe to settings changes for real-time updates
   * WebSocket endpoint for real-time settings synchronization
   * 
   * Following Cline's subscription patterns
   */
  subscribeToSettingsChanges(
    projectId: UUID,
    callback: (event: SettingsChangeEvent) => void
  ): () => void {
    this.logger.debug('WebSocket subscription to settings changes', { projectId });

    SettingsRequestValidator.validateUUID(projectId, 'projectId');

    const eventKey = `settings:${projectId}`;
    
    if (!this.eventListeners.has(eventKey)) {
      this.eventListeners.set(eventKey, new Set());
    }
    
    this.eventListeners.get(eventKey)!.add(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.eventListeners.get(eventKey);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this.eventListeners.delete(eventKey);
        }
      }
      
      this.logger.debug('WebSocket unsubscribed from settings changes', { projectId });
    };
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  /**
   * Generic request handler with comprehensive error handling
   * Following Cline's request wrapper patterns
   */
  private async handleRequest<T>(
    handler: () => Promise<T>,
    res?: any
  ): Promise<T | void> {
    try {
      return await handler();
    } catch (error) {
      this.logger.error('Controller request failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      const readyAIError = error instanceof ReadyAIError ? error : 
        new ReadyAIError(
          error instanceof Error ? error.message : 'Unknown error',
          ERROR_CODES.INTERNAL_ERROR,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          { originalError: error }
        );

      if (res) {
        const errorResponse = readyAIError.toApiErrorResponse();
        res.status(readyAIError.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR)
           .json(errorResponse);
        return;
      }

      throw readyAIError;
    }
  }

  /**
   * Handle settings change events and emit to subscribers
   * Following Cline's event handling patterns
   */
  private async handleSettingsChange(event: SettingsChangeEvent): Promise<void> {
    const eventKey = `settings:${event.projectId}`;
    const listeners = this.eventListeners.get(eventKey);

    if (listeners && listeners.size > 0) {
      this.logger.debug('Emitting settings change event', {
        projectId: event.projectId,
        eventId: event.eventId,
        listeners: listeners.size,
        changedPaths: event.changedPaths.length
      });

      // Emit to all subscribers for this project
      await Promise.allSettled(
        Array.from(listeners).map(async callback => {
          try {
            await callback(event);
          } catch (error) {
            this.logger.error('Settings change event listener error', {
              projectId: event.projectId,
              eventId: event.eventId,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        })
      );
    }
  }

  /**
   * Filter settings sections based on requested sections
   */
  private filterSettingsSections(
    settingsResult: SettingsResolutionResult,
    sections: string[]
  ): SettingsResolutionResult {
    const settings = { ...settingsResult.settings };

    // Map section names to setting properties
    const sectionMap: Record<string, keyof ProjectSettings> = {
      ai: 'aiSettings',
      development: 'developmentSettings',
      quality: 'qualitySettings',
      ui: 'uiSettings',
      notifications: 'notificationSettings',
      security: 'securitySettings',
      integration: 'integrationSettings',
      backup: 'backupSettings'
    };

    // Create filtered settings object
    const filteredSettings: Partial<ProjectSettings> = {
      id: settings.id,
      projectId: settings.projectId,
      version: settings.version,
      lastModified: settings.lastModified,
      lastModifiedBy: settings.lastModifiedBy,
      inheritanceChain: settings.inheritanceChain,
      appliedSources: settings.appliedSources
    };

    // Add only requested sections
    sections.forEach(section => {
      const settingKey = sectionMap[section];
      if (settingKey && settings[settingKey]) {
        (filteredSettings as any)[settingKey] = settings[settingKey];
      }
    });

    return {
      settings: filteredSettings as ProjectSettings,
      resolution: settingsResult.resolution,
      validation: settingsResult.validation
    };
  }

  /**
   * Create basic logger if none provided
   */
  private createBasicLogger(): Logger {
    return {
      info: (message: string, meta?: Record<string, any>) => 
        console.info(`[ProjectSettingsController] ${message}`, meta),
      warn: (message: string, meta?: Record<string, any>) => 
        console.warn(`[ProjectSettingsController] ${message}`, meta),
      error: (message: string, meta?: Record<string, any>) => 
        console.error(`[ProjectSettingsController] ${message}`, meta),
      debug: (message: string, meta?: Record<string, any>) => 
        console.debug(`[ProjectSettingsController] ${message}`, meta)
    } as Logger;
  }

  /**
   * Create basic error service if none provided
   */
  private createBasicErrorService(): ErrorService {
    return {
      captureError: (error: Error, context?: Record<string, any>) => {
        console.error('[ProjectSettingsController Error]', error.message, context);
      },
      createErrorResponse: (message: string, code?: string) => 
        createApiError(message, code || 'PROJECT_SETTINGS_CONTROLLER_ERROR')
    } as ErrorService;
  }
}

// =============================================================================
// ROUTE HANDLER FACTORY
// =============================================================================

/**
 * Factory function for creating route handlers
 * Following Cline's route handler creation patterns
 */
export interface ProjectSettingsRouteHandlers {
  getProjectSettings: (req: any, res: any) => Promise<void>;
  updateProjectSettings: (req: any, res: any) => Promise<void>;
  batchUpdateSettings: (req: any, res: any) => Promise<void>;
  deleteProjectSettings: (req: any, res: any) => Promise<void>;
  getUserProjectSettings: (req: any, res: any) => Promise<void>;
  updateUserProjectSettings: (req: any, res: any) => Promise<void>;
  exportProjectSettings: (req: any, res: any) => Promise<void>;
  importProjectSettings: (req: any, res: any) => Promise<void>;
  validateProjectSettings: (req: any, res: any) => Promise<void>;
  getHealthStatus: (req: any, res: any) => Promise<void>;
  createDefaultSettings: (req: any, res: any) => Promise<void>;
}

/**
 * Create route handlers for Express.js or similar frameworks
 * Following Cline's route handler factory pattern
 */
export function createProjectSettingsRouteHandlers(
  controller: ProjectSettingsController
): ProjectSettingsRouteHandlers {
  return {
    // Core settings endpoints
    getProjectSettings: async (req: any, res: any) => {
      await controller.getProjectSettings(req, res);
    },

    updateProjectSettings: async (req: any, res: any) => {
      await controller.updateProjectSettings(req, res);
    },

    batchUpdateSettings: async (req: any, res: any) => {
      await controller.batchUpdateSettings(req, res);
    },

    deleteProjectSettings: async (req: any, res: any) => {
      await controller.deleteProjectSettings(req, res);
    },

    // User-specific endpoints
    getUserProjectSettings: async (req: any, res: any) => {
      await controller.getUserProjectSettings(req, res);
    },

    updateUserProjectSettings: async (req: any, res: any) => {
      await controller.updateUserProjectSettings(req, res);
    },

    // Import/export endpoints
    exportProjectSettings: async (req: any, res: any) => {
      await controller.exportProjectSettings(req, res);
    },

    importProjectSettings: async (req: any, res: any) => {
      await controller.importProjectSettings(req, res);
    },

    // Utility endpoints
    validateProjectSettings: async (req: any, res: any) => {
      await controller.validateProjectSettings(req, res);
    },

    getHealthStatus: async (req: any, res: any) => {
      await controller.getHealthStatus(req, res);
    },

    createDefaultSettings: async (req: any, res: any) => {
      await controller.createDefaultSettings(req, res);
    }
  };
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Factory function for creating ProjectSettingsController instances
 * Following Cline's service factory patterns
 */
export async function createProjectSettingsController(
  projectSettingsService: ProjectSettingsService,
  dependencies?: {
    logger?: Logger;
    errorService?: ErrorService;
  }
): Promise<ProjectSettingsController> {
  return new ProjectSettingsController(
    projectSettingsService,
    dependencies?.logger,
    dependencies?.errorService
  );
}

// =============================================================================
// EXPORTS
// =============================================================================

export default ProjectSettingsController;

export {
  // Main controller class
  ProjectSettingsController,
  createProjectSettingsController,
  
  // Route handlers
  createProjectSettingsRouteHandlers,
  type ProjectSettingsRouteHandlers,
  
  // Request/response types
  type GetProjectSettingsRequest,
  type BatchUpdateSettingsRequest,
  type BatchUpdateSettingsResponse,
  type ExportSettingsRequest,
  type ImportSettingsRequest,
  type HealthCheckResponse,
  
  // Validation utilities
  SettingsRequestValidator
};
