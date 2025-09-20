// packages/filesystem/controllers/FileSystemController.ts

import { Express, Request, Response, Router } from 'express';
import * as path from 'path';
import { UUID, ApiResponse, ErrorCode, RequestContext } from '../../foundation/types/core.ts';
import { FileSystemError, FileOperationResult, FileStats, DirectoryContents } from '../types/filesystem.ts';
import { Logger } from '../../logging/services/Logger.ts';
import { LogLevel, LogContext } from '../../logging/types/logging.ts';
import { PathManager } from '../utils/PathManager.ts';
import { FileOperationsService } from '../services/FileOperationsService.ts';
import { WorkspaceManager } from '../services/WorkspaceManager.ts';

/**
 * FileSystemController - Provides REST API endpoints for file system operations
 * 
 * Implements Cline's proven handler patterns for file operations:
 * - Robust error handling with comprehensive validation
 * - Structured request/response patterns
 * - Automatic workspace context management
 * - Security-first path validation
 * - Comprehensive logging and telemetry
 * 
 * Adapted from Cline's file tool handlers with ReadyAI-specific enhancements
 */
export class FileSystemController {
    private readonly router: Router;
    private readonly logger: Logger;
    private readonly pathManager: PathManager;
    private readonly fileOps: FileOperationsService;
    private readonly workspaceManager: WorkspaceManager;
    private readonly logContext: LogContext;

    constructor(
        fileOps: FileOperationsService,
        workspaceManager: WorkspaceManager,
        pathManager: PathManager,
        logger: Logger
    ) {
        this.router = Router();
        this.logger = logger;
        this.pathManager = pathManager;
        this.fileOps = fileOps;
        this.workspaceManager = workspaceManager;
        this.logContext = { component: 'FileSystemController', module: 'filesystem' };

        this.setupRoutes();
        this.logger.info('FileSystemController initialized', this.logContext);
    }

    /**
     * Sets up all file system API routes
     * Following Cline's proven routing patterns with comprehensive error handling
     */
    private setupRoutes(): void {
        // File operations
        this.router.get('/files/:workspaceId/*', this.handleReadFile.bind(this));
        this.router.post('/files/:workspaceId/*', this.handleWriteFile.bind(this));
        this.router.put('/files/:workspaceId/*', this.handleUpdateFile.bind(this));
        this.router.delete('/files/:workspaceId/*', this.handleDeleteFile.bind(this));
        this.router.head('/files/:workspaceId/*', this.handleFileExists.bind(this));

        // Directory operations
        this.router.get('/directories/:workspaceId/*', this.handleListDirectory.bind(this));
        this.router.post('/directories/:workspaceId/*', this.handleCreateDirectory.bind(this));
        this.router.delete('/directories/:workspaceId/*', this.handleDeleteDirectory.bind(this));

        // Search operations
        this.router.post('/search/:workspaceId', this.handleSearchFiles.bind(this));
        this.router.post('/search/:workspaceId/content', this.handleSearchFileContent.bind(this));

        // File metadata and stats
        this.router.get('/stats/:workspaceId/*', this.handleGetFileStats.bind(this));
        
        // Workspace operations
        this.router.get('/workspace/:workspaceId/info', this.handleGetWorkspaceInfo.bind(this));
        this.router.get('/workspace/:workspaceId/tree', this.handleGetWorkspaceTree.bind(this));

        // Health check
        this.router.get('/health', this.handleHealthCheck.bind(this));
    }

    /**
     * Extracts and validates common request parameters
     * Adapted from Cline's parameter validation patterns
     */
    private async validateRequest(req: Request): Promise<{
        workspaceId: UUID;
        filePath: string;
        context: RequestContext;
    }> {
        const workspaceId = req.params.workspaceId as UUID;
        const filePath = req.params[0] || '';
        
        if (!workspaceId) {
            throw new FileSystemError(
                'Workspace ID is required',
                ErrorCode.VALIDATION_ERROR,
                { path: 'workspaceId' }
            );
        }

        if (!this.workspaceManager.isValidWorkspace(workspaceId)) {
            throw new FileSystemError(
                `Invalid workspace ID: ${workspaceId}`,
                ErrorCode.NOT_FOUND,
                { workspaceId }
            );
        }

        const context: RequestContext = {
            requestId: req.headers['x-request-id'] as UUID || this.generateRequestId(),
            userId: req.headers['x-user-id'] as UUID,
            timestamp: Date.now(),
            userAgent: req.headers['user-agent'],
            correlationId: req.headers['x-correlation-id'] as UUID
        };

        return { workspaceId, filePath, context };
    }

    /**
     * Handles file read operations
     * Implements Cline's ReadFileToolHandler patterns
     */
    private async handleReadFile(req: Request, res: Response): Promise<void> {
        const requestContext = { ...this.logContext, operation: 'readFile' };
        
        try {
            const { workspaceId, filePath, context } = await this.validateRequest(req);
            
            this.logger.debug('Reading file', {
                ...requestContext,
                workspaceId,
                filePath,
                requestId: context.requestId
            });

            // Validate and resolve path using Cline's proven path resolution
            const resolvedPath = await this.pathManager.resolvePath(workspaceId, filePath);
            
            // Check workspace boundaries (Cline's security pattern)
            if (!await this.workspaceManager.isPathInWorkspace(workspaceId, resolvedPath)) {
                throw new FileSystemError(
                    'Path is outside workspace boundaries',
                    ErrorCode.FORBIDDEN,
                    { path: filePath, resolvedPath }
                );
            }

            // Execute file read with Cline's error handling patterns
            const result = await this.fileOps.readFile(resolvedPath, {
                encoding: req.query.encoding as string || 'utf8',
                maxSize: parseInt(req.query.maxSize as string) || undefined
            });

            const response: ApiResponse<FileOperationResult> = {
                success: true,
                data: result,
                requestId: context.requestId,
                timestamp: Date.now()
            };

            this.logger.info('File read completed', {
                ...requestContext,
                workspaceId,
                filePath,
                size: result.size,
                requestId: context.requestId
            });

            res.status(200).json(response);

        } catch (error) {
            await this.handleError(error, res, requestContext);
        }
    }

    /**
     * Handles file write operations
     * Implements Cline's WriteToFileToolHandler patterns with streaming support
     */
    private async handleWriteFile(req: Request, res: Response): Promise<void> {
        const requestContext = { ...this.logContext, operation: 'writeFile' };
        
        try {
            const { workspaceId, filePath, context } = await this.validateRequest(req);
            const { content, encoding = 'utf8', mode, overwrite = false } = req.body;

            this.logger.debug('Writing file', {
                ...requestContext,
                workspaceId,
                filePath,
                encoding,
                overwrite,
                requestId: context.requestId
            });

            if (!content && content !== '') {
                throw new FileSystemError(
                    'Content is required for file write operation',
                    ErrorCode.VALIDATION_ERROR,
                    { field: 'content' }
                );
            }

            const resolvedPath = await this.pathManager.resolvePath(workspaceId, filePath);
            
            // Workspace boundary check (Cline's security pattern)
            if (!await this.workspaceManager.isPathInWorkspace(workspaceId, resolvedPath)) {
                throw new FileSystemError(
                    'Path is outside workspace boundaries',
                    ErrorCode.FORBIDDEN,
                    { path: filePath, resolvedPath }
                );
            }

            // Check file existence for overwrite protection (Cline pattern)
            const exists = await this.fileOps.exists(resolvedPath);
            if (exists && !overwrite) {
                throw new FileSystemError(
                    'File already exists and overwrite is not enabled',
                    ErrorCode.CONFLICT,
                    { path: filePath, exists }
                );
            }

            const result = await this.fileOps.writeFile(resolvedPath, content, {
                encoding,
                mode,
                createDirectories: true
            });

            const response: ApiResponse<FileOperationResult> = {
                success: true,
                data: result,
                requestId: context.requestId,
                timestamp: Date.now()
            };

            this.logger.info('File write completed', {
                ...requestContext,
                workspaceId,
                filePath,
                size: result.size,
                created: !exists,
                requestId: context.requestId
            });

            res.status(exists ? 200 : 201).json(response);

        } catch (error) {
            await this.handleError(error, res, requestContext);
        }
    }

    /**
     * Handles file update operations (partial updates)
     * Implements Cline's diff-based update patterns
     */
    private async handleUpdateFile(req: Request, res: Response): Promise<void> {
        const requestContext = { ...this.logContext, operation: 'updateFile' };
        
        try {
            const { workspaceId, filePath, context } = await this.validateRequest(req);
            const { content, diff, encoding = 'utf8' } = req.body;

            this.logger.debug('Updating file', {
                ...requestContext,
                workspaceId,
                filePath,
                hasDiff: !!diff,
                hasContent: !!content,
                requestId: context.requestId
            });

            const resolvedPath = await this.pathManager.resolvePath(workspaceId, filePath);
            
            // Workspace boundary validation
            if (!await this.workspaceManager.isPathInWorkspace(workspaceId, resolvedPath)) {
                throw new FileSystemError(
                    'Path is outside workspace boundaries',
                    ErrorCode.FORBIDDEN,
                    { path: filePath, resolvedPath }
                );
            }

            // File must exist for updates (Cline pattern)
            if (!await this.fileOps.exists(resolvedPath)) {
                throw new FileSystemError(
                    'Cannot update non-existent file',
                    ErrorCode.NOT_FOUND,
                    { path: filePath }
                );
            }

            let result: FileOperationResult;

            if (diff) {
                // Apply diff using Cline's diff patterns
                result = await this.fileOps.applyDiff(resolvedPath, diff, { encoding });
            } else if (content !== undefined) {
                // Direct content replacement
                result = await this.fileOps.writeFile(resolvedPath, content, { encoding });
            } else {
                throw new FileSystemError(
                    'Either content or diff must be provided for file update',
                    ErrorCode.VALIDATION_ERROR,
                    { fields: ['content', 'diff'] }
                );
            }

            const response: ApiResponse<FileOperationResult> = {
                success: true,
                data: result,
                requestId: context.requestId,
                timestamp: Date.now()
            };

            this.logger.info('File update completed', {
                ...requestContext,
                workspaceId,
                filePath,
                size: result.size,
                method: diff ? 'diff' : 'content',
                requestId: context.requestId
            });

            res.status(200).json(response);

        } catch (error) {
            await this.handleError(error, res, requestContext);
        }
    }

    /**
     * Handles file deletion operations
     * Implements Cline's safe deletion patterns
     */
    private async handleDeleteFile(req: Request, res: Response): Promise<void> {
        const requestContext = { ...this.logContext, operation: 'deleteFile' };
        
        try {
            const { workspaceId, filePath, context } = await this.validateRequest(req);
            const { force = false } = req.query;

            this.logger.debug('Deleting file', {
                ...requestContext,
                workspaceId,
                filePath,
                force,
                requestId: context.requestId
            });

            const resolvedPath = await this.pathManager.resolvePath(workspaceId, filePath);
            
            if (!await this.workspaceManager.isPathInWorkspace(workspaceId, resolvedPath)) {
                throw new FileSystemError(
                    'Path is outside workspace boundaries',
                    ErrorCode.FORBIDDEN,
                    { path: filePath, resolvedPath }
                );
            }

            const result = await this.fileOps.deleteFile(resolvedPath, { force: force === 'true' });

            const response: ApiResponse<FileOperationResult> = {
                success: true,
                data: result,
                requestId: context.requestId,
                timestamp: Date.now()
            };

            this.logger.info('File deletion completed', {
                ...requestContext,
                workspaceId,
                filePath,
                requestId: context.requestId
            });

            res.status(200).json(response);

        } catch (error) {
            await this.handleError(error, res, requestContext);
        }
    }

    /**
     * Handles file existence checks
     * Implements Cline's efficient existence checking patterns
     */
    private async handleFileExists(req: Request, res: Response): Promise<void> {
        const requestContext = { ...this.logContext, operation: 'fileExists' };
        
        try {
            const { workspaceId, filePath, context } = await this.validateRequest(req);

            const resolvedPath = await this.pathManager.resolvePath(workspaceId, filePath);
            
            if (!await this.workspaceManager.isPathInWorkspace(workspaceId, resolvedPath)) {
                res.status(404).end();
                return;
            }

            const exists = await this.fileOps.exists(resolvedPath);
            
            this.logger.debug('File existence check', {
                ...requestContext,
                workspaceId,
                filePath,
                exists,
                requestId: context.requestId
            });

            res.status(exists ? 200 : 404).end();

        } catch (error) {
            res.status(500).end();
        }
    }

    /**
     * Handles directory listing operations
     * Implements Cline's ListFilesToolHandler patterns
     */
    private async handleListDirectory(req: Request, res: Response): Promise<void> {
        const requestContext = { ...this.logContext, operation: 'listDirectory' };
        
        try {
            const { workspaceId, filePath, context } = await this.validateRequest(req);
            const { 
                recursive = false, 
                includeHidden = false, 
                maxDepth = 10,
                pattern 
            } = req.query;

            this.logger.debug('Listing directory', {
                ...requestContext,
                workspaceId,
                filePath,
                recursive,
                includeHidden,
                maxDepth,
                requestId: context.requestId
            });

            const resolvedPath = await this.pathManager.resolvePath(workspaceId, filePath);
            
            if (!await this.workspaceManager.isPathInWorkspace(workspaceId, resolvedPath)) {
                throw new FileSystemError(
                    'Path is outside workspace boundaries',
                    ErrorCode.FORBIDDEN,
                    { path: filePath, resolvedPath }
                );
            }

            const result = await this.fileOps.listDirectory(resolvedPath, {
                recursive: recursive === 'true',
                includeHidden: includeHidden === 'true',
                maxDepth: parseInt(maxDepth as string) || 10,
                pattern: pattern as string
            });

            const response: ApiResponse<DirectoryContents> = {
                success: true,
                data: result,
                requestId: context.requestId,
                timestamp: Date.now()
            };

            this.logger.info('Directory listing completed', {
                ...requestContext,
                workspaceId,
                filePath,
                itemCount: result.entries.length,
                requestId: context.requestId
            });

            res.status(200).json(response);

        } catch (error) {
            await this.handleError(error, res, requestContext);
        }
    }

    /**
     * Handles directory creation operations
     * Implements Cline's safe directory creation patterns
     */
    private async handleCreateDirectory(req: Request, res: Response): Promise<void> {
        const requestContext = { ...this.logContext, operation: 'createDirectory' };
        
        try {
            const { workspaceId, filePath, context } = await this.validateRequest(req);
            const { recursive = true, mode } = req.body;

            this.logger.debug('Creating directory', {
                ...requestContext,
                workspaceId,
                filePath,
                recursive,
                requestId: context.requestId
            });

            const resolvedPath = await this.pathManager.resolvePath(workspaceId, filePath);
            
            if (!await this.workspaceManager.isPathInWorkspace(workspaceId, resolvedPath)) {
                throw new FileSystemError(
                    'Path is outside workspace boundaries',
                    ErrorCode.FORBIDDEN,
                    { path: filePath, resolvedPath }
                );
            }

            const result = await this.fileOps.createDirectory(resolvedPath, {
                recursive,
                mode
            });

            const response: ApiResponse<FileOperationResult> = {
                success: true,
                data: result,
                requestId: context.requestId,
                timestamp: Date.now()
            };

            this.logger.info('Directory creation completed', {
                ...requestContext,
                workspaceId,
                filePath,
                requestId: context.requestId
            });

            res.status(201).json(response);

        } catch (error) {
            await this.handleError(error, res, requestContext);
        }
    }

    /**
     * Handles file search operations
     * Implements Cline's SearchFilesToolHandler patterns
     */
    private async handleSearchFiles(req: Request, res: Response): Promise<void> {
        const requestContext = { ...this.logContext, operation: 'searchFiles' };
        
        try {
            const { workspaceId, context } = await this.validateRequest(req);
            const { 
                pattern, 
                filePattern, 
                excludePattern,
                maxResults = 100,
                includeContent = false 
            } = req.body;

            this.logger.debug('Searching files', {
                ...requestContext,
                workspaceId,
                pattern,
                filePattern,
                maxResults,
                requestId: context.requestId
            });

            if (!pattern) {
                throw new FileSystemError(
                    'Search pattern is required',
                    ErrorCode.VALIDATION_ERROR,
                    { field: 'pattern' }
                );
            }

            const workspacePath = this.workspaceManager.getWorkspacePath(workspaceId);
            
            const result = await this.fileOps.searchFiles(workspacePath, {
                pattern,
                filePattern,
                excludePattern,
                maxResults: parseInt(maxResults.toString()),
                includeContent
            });

            const response: ApiResponse<any> = {
                success: true,
                data: result,
                requestId: context.requestId,
                timestamp: Date.now()
            };

            this.logger.info('File search completed', {
                ...requestContext,
                workspaceId,
                resultCount: result.matches?.length || 0,
                requestId: context.requestId
            });

            res.status(200).json(response);

        } catch (error) {
            await this.handleError(error, res, requestContext);
        }
    }

    /**
     * Handles file statistics retrieval
     * Implements Cline's file metadata patterns
     */
    private async handleGetFileStats(req: Request, res: Response): Promise<void> {
        const requestContext = { ...this.logContext, operation: 'getFileStats' };
        
        try {
            const { workspaceId, filePath, context } = await this.validateRequest(req);

            this.logger.debug('Getting file stats', {
                ...requestContext,
                workspaceId,
                filePath,
                requestId: context.requestId
            });

            const resolvedPath = await this.pathManager.resolvePath(workspaceId, filePath);
            
            if (!await this.workspaceManager.isPathInWorkspace(workspaceId, resolvedPath)) {
                throw new FileSystemError(
                    'Path is outside workspace boundaries',
                    ErrorCode.FORBIDDEN,
                    { path: filePath, resolvedPath }
                );
            }

            const stats = await this.fileOps.getFileStats(resolvedPath);

            const response: ApiResponse<FileStats> = {
                success: true,
                data: stats,
                requestId: context.requestId,
                timestamp: Date.now()
            };

            res.status(200).json(response);

        } catch (error) {
            await this.handleError(error, res, requestContext);
        }
    }

    /**
     * Handles workspace information retrieval
     * Implements ReadyAI-specific workspace management patterns
     */
    private async handleGetWorkspaceInfo(req: Request, res: Response): Promise<void> {
        const requestContext = { ...this.logContext, operation: 'getWorkspaceInfo' };
        
        try {
            const { workspaceId, context } = await this.validateRequest(req);

            this.logger.debug('Getting workspace info', {
                ...requestContext,
                workspaceId,
                requestId: context.requestId
            });

            const info = await this.workspaceManager.getWorkspaceInfo(workspaceId);

            const response: ApiResponse<any> = {
                success: true,
                data: info,
                requestId: context.requestId,
                timestamp: Date.now()
            };

            res.status(200).json(response);

        } catch (error) {
            await this.handleError(error, res, requestContext);
        }
    }

    /**
     * Handles health check operations
     * Implements Cline's service health patterns
     */
    private async handleHealthCheck(req: Request, res: Response): Promise<void> {
        const requestContext = { ...this.logContext, operation: 'healthCheck' };
        
        try {
            const health = {
                status: 'healthy',
                timestamp: Date.now(),
                services: {
                    fileOps: await this.fileOps.isHealthy(),
                    workspaceManager: await this.workspaceManager.isHealthy(),
                    pathManager: await this.pathManager.isHealthy()
                }
            };

            const allHealthy = Object.values(health.services).every(status => status);
            
            const response: ApiResponse<any> = {
                success: allHealthy,
                data: health,
                requestId: this.generateRequestId(),
                timestamp: Date.now()
            };

            res.status(allHealthy ? 200 : 503).json(response);

        } catch (error) {
            await this.handleError(error, res, requestContext);
        }
    }

    /**
     * Centralized error handling following Cline's error patterns
     * Provides comprehensive error logging and structured error responses
     */
    private async handleError(error: any, res: Response, context: LogContext): Promise<void> {
        let statusCode = 500;
        let errorCode = ErrorCode.INTERNAL_ERROR;
        let message = 'Internal server error';

        if (error instanceof FileSystemError) {
            statusCode = this.getHttpStatusFromErrorCode(error.code);
            errorCode = error.code;
            message = error.message;
            
            this.logger.warn('File system operation error', {
                ...context,
                error: message,
                code: errorCode,
                details: error.details
            });
        } else {
            this.logger.error('Unexpected error in file system operation', {
                ...context,
                error: error.message,
                stack: error.stack
            });
        }

        const response: ApiResponse<null> = {
            success: false,
            error: {
                code: errorCode,
                message,
                details: error instanceof FileSystemError ? error.details : undefined
            },
            requestId: this.generateRequestId(),
            timestamp: Date.now()
        };

        res.status(statusCode).json(response);
    }

    /**
     * Maps error codes to HTTP status codes
     * Following Cline's error handling conventions
     */
    private getHttpStatusFromErrorCode(code: ErrorCode): number {
        switch (code) {
            case ErrorCode.VALIDATION_ERROR:
                return 400;
            case ErrorCode.UNAUTHORIZED:
                return 401;
            case ErrorCode.FORBIDDEN:
                return 403;
            case ErrorCode.NOT_FOUND:
                return 404;
            case ErrorCode.CONFLICT:
                return 409;
            case ErrorCode.RATE_LIMIT_EXCEEDED:
                return 429;
            default:
                return 500;
        }
    }

    /**
     * Generates a unique request ID
     * Following ReadyAI's UUID patterns
     */
    private generateRequestId(): UUID {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` as UUID;
    }

    /**
     * Returns the Express router for mounting
     */
    public getRouter(): Router {
        return this.router;
    }

    /**
     * Graceful shutdown handling
     * Following Cline's service lifecycle patterns
     */
    public async shutdown(): Promise<void> {
        this.logger.info('FileSystemController shutting down', this.logContext);
        
        try {
            // Cleanup any pending operations
            await this.fileOps.cleanup();
            await this.workspaceManager.cleanup();
            
            this.logger.info('FileSystemController shutdown completed', this.logContext);
        } catch (error) {
            this.logger.error('Error during FileSystemController shutdown', {
                ...this.logContext,
                error: error.message
            });
        }
    }
}

// Export default instance factory following ReadyAI patterns
export default FileSystemController;
