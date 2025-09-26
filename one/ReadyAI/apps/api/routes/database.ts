// apps/api/routes/database.ts

/**
 * Database API Routes for ReadyAI Personal AI Development Orchestrator
 * 
 * This module implements Express.js routes for database management operations,
 * leveraging Cline's proven REST API patterns with Pattern-Replicate strategy
 * while maintaining full compatibility with ReadyAI's Core Contracts and service architecture.
 * 
 * Key Adaptations from Cline:
 * - Router patterns from Cline's service endpoint organization
 * - Error handling and middleware patterns from Cline's robust request processing
 * - Response formatting from Cline's consistent API response structure
 * - Request validation from Cline's comprehensive parameter checking
 * - Async patterns from Cline's battle-tested controller architecture
 * 
 * @version 1.0.0
 * @author ReadyAI Development Team
 */

import { Request, Response, NextFunction, Router } from 'express';
import {
    UUID,
    ApiResponse,
    ApiErrorResponse,
    ReadyAIError,
    AsyncResult,
    wrapAsync,
    createApiResponse,
    createApiError,
    isApiSuccess
} from '../../../packages/foundation/types/core';
import DatabaseController from '../../../packages/database/controllers/DatabaseController';
import DatabaseService from '../../../packages/database/services/DatabaseService';

/**
 * Database API Router
 * 
 * Implements RESTful endpoints for ReadyAI database management operations,
 * following Cline's proven route organization patterns while extending
 * with ReadyAI-specific database administration functionality.
 */
export const databaseRouter = Router();

/**
 * Global database controller instance
 * Follows Cline's singleton pattern for controller management
 */
const databaseController = new DatabaseController(new DatabaseService());

// ============================================================================
// MIDDLEWARE PATTERNS - Adapted from Cline's Request Processing
// ============================================================================

/**
 * Request logging middleware adapted from Cline's telemetry patterns
 */
const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();
    
    // Attach request metadata - Cline pattern
    (req as any).metadata = {
        requestId,
        timestamp: new Date().toISOString(),
        startTime,
        path: req.path,
        method: req.method
    };
    
    console.log(`${(req as any).metadata.requestId} ${req.method} ${req.path} - Started`);
    
    // Response completion logging - Cline pattern
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        console.log(
            `${(req as any).metadata.requestId} ${req.method} ${req.path} - ` +
            `${res.statusCode} (${duration}ms)`
        );
    });
    
    next();
};

/**
 * Error handling middleware adapted from Cline's comprehensive error patterns
 */
const errorHandler = (
    error: any,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const requestId = (req as any).metadata?.requestId || 'unknown';
    
    console.error(`${requestId} Error in ${req.method} ${req.path}:`, error);
    
    // Handle ReadyAI errors following Cline's error discrimination pattern
    if (error instanceof ReadyAIError) {
        res.status(error.statusCode || 500).json(error.toApiErrorResponse());
        return;
    }
    
    // Handle validation errors - Cline pattern
    if (error.name === 'ValidationError') {
        const apiError = createApiError(
            error.message,
            'VALIDATION_ERROR',
            400,
            { field: error.field, value: error.value }
        );
        res.status(400).json(apiError);
        return;
    }
    
    // Default error response - Cline's fallback pattern
    const apiError = createApiError(
        'Internal server error',
        'INTERNAL_ERROR',
        500,
        process.env.NODE_ENV === 'development' ? { stack: error.stack } : undefined
    );
    res.status(500).json(apiError);
};

/**
 * UUID validation middleware adapted from Cline's parameter validation patterns
 */
const validateUUID = (paramName: string) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        const uuid = req.params[paramName];
        
        if (!uuid) {
            const error = createApiError(
                `Missing required parameter: ${paramName}`,
                'MISSING_PARAMETER',
                400
            );
            res.status(400).json(error);
            return;
        }
        
        // Basic UUID format validation - Cline pattern
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(uuid)) {
            const error = createApiError(
                `Invalid UUID format: ${paramName}`,
                'INVALID_UUID',
                400,
                { paramName, value: uuid }
            );
            res.status(400).json(error);
            return;
        }
        
        next();
    };
};

// Apply global middleware - Cline pattern
databaseRouter.use(requestLogger);

// ============================================================================
// DATABASE HEALTH AND STATUS ENDPOINTS - Pattern-Replicated from Cline's REST API
// ============================================================================

/**
 * GET /health
 * Get comprehensive database health status
 * 
 * Adapted from Cline's system health check endpoint patterns
 */
databaseRouter.get('/health', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const result = await wrapAsync(async () => {
            return await databaseController.getHealthStatus();
        });
        
        if (!isApiSuccess(result)) {
            next(result.error);
            return;
        }
        
        const response = createApiResponse(result.data, {
            requestId: (req as any).metadata?.requestId,
            timestamp: new Date().toISOString(),
            metrics: {
                processingTime: Date.now() - ((req as any).metadata?.startTime || Date.now())
            }
        });
        
        // Health checks return appropriate status codes - Cline pattern
        const statusCode = result.data.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(response);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /connection
 * Get database connection status and statistics
 * 
 * Adapted from Cline's connection monitoring patterns
 */
databaseRouter.get('/connection', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const result = await wrapAsync(async () => {
            return await databaseController.getConnectionStatus();
        });
        
        if (!isApiSuccess(result)) {
            next(result.error);
            return;
        }
        
        const response = createApiResponse(result.data, {
            requestId: (req as any).metadata?.requestId,
            timestamp: new Date().toISOString()
        });
        
        res.json(response);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /connection/test
 * Test database connectivity and return diagnostics
 * 
 * Adapted from Cline's connection testing patterns
 */
databaseRouter.post('/connection/test', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const result = await wrapAsync(async () => {
            const { timeout = 5000 } = req.body;
            
            // Validate timeout parameter - Cline validation pattern
            if (typeof timeout !== 'number' || timeout < 1000 || timeout > 30000) {
                throw new ReadyAIError(
                    'Invalid timeout value. Must be between 1000 and 30000 milliseconds',
                    'INVALID_TIMEOUT',
                    400,
                    { provided: timeout, min: 1000, max: 30000 }
                );
            }
            
            return await databaseController.testConnection(timeout);
        });
        
        if (!isApiSuccess(result)) {
            next(result.error);
            return;
        }
        
        const response = createApiResponse(result.data, {
            requestId: (req as any).metadata?.requestId,
            timestamp: new Date().toISOString()
        });
        
        res.json(response);
    } catch (error) {
        next(error);
    }
});

// ============================================================================
// DATABASE MIGRATION ENDPOINTS
// ============================================================================

/**
 * GET /migrations
 * List all database migrations with status and execution history
 * 
 * Adapted from Cline's listing endpoints with pagination patterns
 */
databaseRouter.get('/migrations', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const result = await wrapAsync(async () => {
            // Parameter validation with defaults - Cline pattern
            const status = req.query.status as string;
            const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
            
            // Validate status filter - Cline validation pattern
            if (status) {
                const validStatuses = ['pending', 'running', 'completed', 'failed', 'rolledback'];
                if (!validStatuses.includes(status)) {
                    throw new ReadyAIError(
                        `Invalid migration status: ${status}. Valid options: ${validStatuses.join(', ')}`,
                        'INVALID_MIGRATION_STATUS',
                        400,
                        { provided: status, valid: validStatuses }
                    );
                }
            }
            
            return await databaseController.getMigrations({
                status,
                limit
            });
        });
        
        if (!isApiSuccess(result)) {
            next(result.error);
            return;
        }
        
        const response = createApiResponse(result.data, {
            requestId: (req as any).metadata?.requestId,
            timestamp: new Date().toISOString(),
            pagination: {
                limit: parseInt(req.query.limit as string) || 50
            }
        });
        
        res.json(response);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /migrations
 * Execute pending migrations with validation and progress tracking
 * 
 * Adapted from Cline's batch operation patterns
 */
databaseRouter.post('/migrations', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const result = await wrapAsync(async () => {
            const { dryRun = false, targetVersion } = req.body;
            
            // Validate request body - Cline pattern
            if (typeof dryRun !== 'boolean') {
                throw new ReadyAIError(
                    'dryRun must be a boolean value',
                    'INVALID_DRY_RUN',
                    400,
                    { field: 'dryRun', value: dryRun }
                );
            }
            
            if (targetVersion && typeof targetVersion !== 'string') {
                throw new ReadyAIError(
                    'targetVersion must be a string',
                    'INVALID_TARGET_VERSION',
                    400,
                    { field: 'targetVersion', value: targetVersion }
                );
            }
            
            return await databaseController.executeMigrations({
                dryRun,
                targetVersion
            });
        });
        
        if (!isApiSuccess(result)) {
            // Handle migration failures with detailed error reporting - Cline pattern
            if (result.error.message.includes('migration failed')) {
                const error = createApiError(
                    'Migration execution failed',
                    'MIGRATION_EXECUTION_FAILED',
                    400,
                    { failedMigrations: result.error.details }
                );
                res.status(400).json(error);
                return;
            }
            next(result.error);
            return;
        }
        
        const response = createApiResponse(result.data, {
            requestId: (req as any).metadata?.requestId,
            timestamp: new Date().toISOString()
        });
        
        res.json(response);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /migrations/:migrationId/rollback
 * Rollback a specific migration if rollback script is available
 * 
 * Adapted from Cline's operation rollback patterns
 */
databaseRouter.post('/migrations/:migrationId/rollback', validateUUID('migrationId'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const result = await wrapAsync(async () => {
            const migrationId = req.params.migrationId as UUID;
            return await databaseController.rollbackMigration(migrationId);
        });
        
        if (!isApiSuccess(result)) {
            // Handle rollback not supported case - Cline pattern
            if (result.error.message.includes('rollback not supported')) {
                const error = createApiError(
                    `Migration rollback not supported: ${req.params.migrationId}`,
                    'ROLLBACK_NOT_SUPPORTED',
                    400
                );
                res.status(400).json(error);
                return;
            }
            
            // Handle not found case - Cline pattern
            if (result.error.message.includes('not found')) {
                const error = createApiError(
                    `Migration not found: ${req.params.migrationId}`,
                    'MIGRATION_NOT_FOUND',
                    404
                );
                res.status(404).json(error);
                return;
            }
            
            next(result.error);
            return;
        }
        
        const response = createApiResponse(result.data, {
            requestId: (req as any).metadata?.requestId,
            timestamp: new Date().toISOString()
        });
        
        res.json(response);
    } catch (error) {
        next(error);
    }
});

// ============================================================================
// DATABASE BACKUP AND RESTORE ENDPOINTS
// ============================================================================

/**
 * GET /backup
 * List available database backups with metadata and filtering
 * 
 * Adapted from Cline's asset listing patterns
 */
databaseRouter.get('/backup', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const result = await wrapAsync(async () => {
            // Parameter validation with defaults - Cline pattern
            const type = req.query.type as string;
            const automatic = req.query.automatic ? req.query.automatic === 'true' : undefined;
            const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
            
            // Validate backup type filter - Cline validation pattern
            if (type) {
                const validTypes = ['full', 'incremental', 'schema-only'];
                if (!validTypes.includes(type)) {
                    throw new ReadyAIError(
                        `Invalid backup type: ${type}. Valid options: ${validTypes.join(', ')}`,
                        'INVALID_BACKUP_TYPE',
                        400,
                        { provided: type, valid: validTypes }
                    );
                }
            }
            
            return await databaseController.getBackups({
                type,
                automatic,
                limit
            });
        });
        
        if (!isApiSuccess(result)) {
            next(result.error);
            return;
        }
        
        const response = createApiResponse(result.data, {
            requestId: (req as any).metadata?.requestId,
            timestamp: new Date().toISOString()
        });
        
        res.json(response);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /backup
 * Create a new database backup with specified options
 * 
 * Adapted from Cline's asset creation patterns
 */
databaseRouter.post('/backup', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const result = await wrapAsync(async () => {
            const { 
                type = 'full', 
                description, 
                compress = true, 
                filename 
            } = req.body;
            
            // Request body validation - Cline pattern
            if (!type || typeof type !== 'string') {
                throw new ReadyAIError(
                    'Backup type is required and must be a string',
                    'INVALID_BACKUP_TYPE',
                    400,
                    { field: 'type', value: type }
                );
            }
            
            // Validate backup type - Cline validation pattern
            const validTypes = ['full', 'incremental', 'schema-only'];
            if (!validTypes.includes(type)) {
                throw new ReadyAIError(
                    `Invalid backup type: ${type}. Valid options: ${validTypes.join(', ')}`,
                    'INVALID_BACKUP_TYPE',
                    400,
                    { provided: type, valid: validTypes }
                );
            }
            
            if (description && (typeof description !== 'string' || description.length > 500)) {
                throw new ReadyAIError(
                    'Description must be a string with maximum 500 characters',
                    'INVALID_DESCRIPTION',
                    400,
                    { field: 'description', value: description, maxLength: 500 }
                );
            }
            
            if (filename && (typeof filename !== 'string' || filename.length > 255)) {
                throw new ReadyAIError(
                    'Filename must be a string with maximum 255 characters',
                    'INVALID_FILENAME',
                    400,
                    { field: 'filename', value: filename, maxLength: 255 }
                );
            }
            
            return await databaseController.createBackup({
                type,
                description,
                compress,
                filename
            });
        });
        
        if (!isApiSuccess(result)) {
            next(result.error);
            return;
        }
        
        const response = createApiResponse(result.data, {
            requestId: (req as any).metadata?.requestId,
            timestamp: new Date().toISOString()
        });
        
        res.status(201).json(response);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /backup/:backupId
 * Get detailed information about a specific backup
 * 
 * Adapted from Cline's asset detail patterns
 */
databaseRouter.get('/backup/:backupId', validateUUID('backupId'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const result = await wrapAsync(async () => {
            const backupId = req.params.backupId as UUID;
            return await databaseController.getBackupDetails(backupId);
        });
        
        if (!isApiSuccess(result)) {
            // Handle not found case - Cline pattern
            if (result.error.message.includes('not found')) {
                const error = createApiError(
                    `Backup not found: ${req.params.backupId}`,
                    'BACKUP_NOT_FOUND',
                    404
                );
                res.status(404).json(error);
                return;
            }
            next(result.error);
            return;
        }
        
        const response = createApiResponse(result.data, {
            requestId: (req as any).metadata?.requestId,
            timestamp: new Date().toISOString()
        });
        
        res.json(response);
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /backup/:backupId
 * Delete a specific database backup file and metadata
 * 
 * Adapted from Cline's asset deletion patterns
 */
databaseRouter.delete('/backup/:backupId', validateUUID('backupId'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const result = await wrapAsync(async () => {
            const backupId = req.params.backupId as UUID;
            return await databaseController.deleteBackup(backupId);
        });
        
        if (!isApiSuccess(result)) {
            // Handle not found case - Cline pattern
            if (result.error.message.includes('not found')) {
                const error = createApiError(
                    `Backup not found: ${req.params.backupId}`,
                    'BACKUP_NOT_FOUND',
                    404
                );
                res.status(404).json(error);
                return;
            }
            next(result.error);
            return;
        }
        
        const response = createApiResponse(result.data, {
            requestId: (req as any).metadata?.requestId,
            timestamp: new Date().toISOString()
        });
        
        res.json(response);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /restore/:backupId
 * Restore database from a specific backup with safety measures
 * 
 * Adapted from Cline's data restoration patterns
 */
databaseRouter.post('/restore/:backupId', validateUUID('backupId'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const result = await wrapAsync(async () => {
            const backupId = req.params.backupId as UUID;
            const { 
                createBackupBeforeRestore = true, 
                validateBackup = true 
            } = req.body;
            
            // Validate request body - Cline pattern
            if (typeof createBackupBeforeRestore !== 'boolean') {
                throw new ReadyAIError(
                    'createBackupBeforeRestore must be a boolean value',
                    'INVALID_PRE_RESTORE_BACKUP',
                    400,
                    { field: 'createBackupBeforeRestore', value: createBackupBeforeRestore }
                );
            }
            
            if (typeof validateBackup !== 'boolean') {
                throw new ReadyAIError(
                    'validateBackup must be a boolean value',
                    'INVALID_VALIDATE_BACKUP',
                    400,
                    { field: 'validateBackup', value: validateBackup }
                );
            }
            
            return await databaseController.restoreFromBackup(backupId, {
                createBackupBeforeRestore,
                validateBackup
            });
        });
        
        if (!isApiSuccess(result)) {
            // Handle backup not found case - Cline pattern
            if (result.error.message.includes('not found')) {
                const error = createApiError(
                    `Backup not found: ${req.params.backupId}`,
                    'BACKUP_NOT_FOUND',
                    404
                );
                res.status(404).json(error);
                return;
            }
            
            // Handle restore failures with detailed error reporting - Cline pattern
            if (result.error.message.includes('restore failed')) {
                const error = createApiError(
                    'Database restore operation failed',
                    'RESTORE_FAILED',
                    400,
                    { backupId: req.params.backupId, details: result.error.details }
                );
                res.status(400).json(error);
                return;
            }
            
            next(result.error);
            return;
        }
        
        const response = createApiResponse(result.data, {
            requestId: (req as any).metadata?.requestId,
            timestamp: new Date().toISOString()
        });
        
        res.json(response);
    } catch (error) {
        next(error);
    }
});

// ============================================================================
// DATABASE SCHEMA AND STATISTICS ENDPOINTS
// ============================================================================

/**
 * GET /schema
 * Get current database schema including tables, indexes, and constraints
 * 
 * Adapted from Cline's schema introspection patterns
 */
databaseRouter.get('/schema', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const result = await wrapAsync(async () => {
            return await databaseController.getDatabaseSchema();
        });
        
        if (!isApiSuccess(result)) {
            next(result.error);
            return;
        }
        
        const response = createApiResponse(result.data, {
            requestId: (req as any).metadata?.requestId,
            timestamp: new Date().toISOString()
        });
        
        res.json(response);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /statistics
 * Get detailed database performance and usage statistics
 * 
 * Adapted from Cline's metrics collection patterns
 */
databaseRouter.get('/statistics', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const result = await wrapAsync(async () => {
            const includeTableStats = req.query.includeTableStats === 'true';
            return await databaseController.getDatabaseStatistics({ includeTableStats });
        });
        
        if (!isApiSuccess(result)) {
            next(result.error);
            return;
        }
        
        const response = createApiResponse(result.data, {
            requestId: (req as any).metadata?.requestId,
            timestamp: new Date().toISOString()
        });
        
        res.json(response);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /vacuum
 * Perform SQLite VACUUM operation to optimize database performance
 * 
 * Adapted from Cline's maintenance operation patterns
 */
databaseRouter.post('/vacuum', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const result = await wrapAsync(async () => {
            const { analyze = true } = req.body;
            
            // Validate request body - Cline pattern
            if (typeof analyze !== 'boolean') {
                throw new ReadyAIError(
                    'analyze must be a boolean value',
                    'INVALID_ANALYZE',
                    400,
                    { field: 'analyze', value: analyze }
                );
            }
            
            return await databaseController.vacuumDatabase({ analyze });
        });
        
        if (!isApiSuccess(result)) {
            next(result.error);
            return;
        }
        
        const response = createApiResponse(result.data, {
            requestId: (req as any).metadata?.requestId,
            timestamp: new Date().toISOString()
        });
        
        res.json(response);
    } catch (error) {
        next(error);
    }
});

// ============================================================================
// ERROR HANDLING MIDDLEWARE - Applied Last
// ============================================================================

/**
 * Apply error handler after all routes - Cline pattern
 */
databaseRouter.use(errorHandler);

// ============================================================================
// TYPE AUGMENTATION FOR REQUEST METADATA
// ============================================================================

declare global {
    namespace Express {
        interface Request {
            metadata?: {
                requestId: string;
                timestamp: string;
                startTime: number;
                path: string;
                method: string;
            };
        }
    }
}

/**
 * Export the configured router
 * 
 * This router can be mounted at `/api/database` or any other appropriate base path
 * in the main Express application following ReadyAI's API organization patterns.
 */
export default databaseRouter;
