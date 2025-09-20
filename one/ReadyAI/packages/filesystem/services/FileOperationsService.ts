// packages/filesystem/services/FileOperationsService.ts

/**
 * FileOperationsService - ReadyAI File Operations Service
 * 
 * Comprehensive file operations service adapted from Cline's proven file tool handlers
 * with ReadyAI-specific safety policies, validation, and project-aware file management.
 * 
 * This service provides secure, validated file operations for ReadyAI's AI-powered
 * development workflow, including atomic operations, rollback capability, and
 * comprehensive audit logging.
 * 
 * Reuse Strategy: 75% Adapt from Cline file tool handlers
 * - Core file operations adapted from Cline's readFile/writeFile/replaceInFile tools
 * - Enhanced with ReadyAI safety policies and project structure awareness
 * - Maintains Cline's proven error handling and validation patterns
 */

import * as fs from 'fs/promises';
import * as fsSyncconst from 'fs';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';
import { 
  PathManager, 
  normalizePath,
  joinPaths,
  getAbsolutePath,
  isWithinDirectory,
  isAccessible,
  getPathType,
  parseFilePath,
  sanitizePath,
  READYAI_PROJECT_STRUCTURE,
  READYAI_FILE_EXTENSIONS,
  PATH_CONFIG
} from '../utils/PathManager.js';
import { Logger, logger, logPhaseOperation } from '../../logging/services/Logger.js';
import { UUID, ReadyAIError, ApiResponse, createApiResponse, createApiError } from '../../foundation/types/core.js';

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

/**
 * File operation types supported by ReadyAI
 */
export type FileOperationType = 
  | 'read'
  | 'write' 
  | 'append'
  | 'delete'
  | 'move'
  | 'copy'
  | 'replace'
  | 'create_directory';

/**
 * File operation safety levels
 */
export type SafetyLevel = 'strict' | 'moderate' | 'permissive';

/**
 * File content encoding types
 */
export type FileEncoding = 'utf8' | 'binary' | 'base64';

/**
 * File operation context for tracking and validation
 */
export interface FileOperationContext {
  /** Unique operation identifier */
  operationId: UUID;
  /** Project ID for context */
  projectId?: UUID;
  /** Phase that initiated the operation */
  phaseType?: string;
  /** Safety level for this operation */
  safetyLevel: SafetyLevel;
  /** Whether to create backups */
  createBackup: boolean;
  /** Maximum file size allowed */
  maxFileSize: number;
  /** Allowed file extensions */
  allowedExtensions?: string[];
  /** Base directory restriction */
  restrictToDirectory?: string;
}

/**
 * File operation result with comprehensive metadata
 */
export interface FileOperationResult {
  /** Success indicator */
  success: boolean;
  /** Operation ID for tracking */
  operationId: UUID;
  /** Absolute file path */
  filePath: string;
  /** Operation type performed */
  operation: FileOperationType;
  /** File size after operation */
  fileSize?: number;
  /** File hash for integrity verification */
  fileHash?: string;
  /** Backup path if created */
  backupPath?: string;
  /** Timestamp of operation */
  timestamp: string;
  /** Any warnings generated */
  warnings: string[];
  /** Error message if failed */
  error?: string;
}

/**
 * ReadFile operation options adapted from Cline's readFile tool
 */
export interface ReadFileOptions {
  /** File encoding to use */
  encoding?: FileEncoding;
  /** Maximum file size to read */
  maxSize?: number;
  /** Whether to include file metadata */
  includeMetadata?: boolean;
}

/**
 * WriteFile operation options adapted from Cline's writeFile tool
 */
export interface WriteFileOptions {
  /** File encoding to use */
  encoding?: FileEncoding;
  /** Whether to create directories if they don't exist */
  createDirs?: boolean;
  /** File permissions to set */
  mode?: number;
  /** Whether to overwrite existing files */
  overwrite?: boolean;
}

/**
 * ReplaceInFile operation options adapted from Cline's replaceInFile tool
 */
export interface ReplaceInFileOptions {
  /** Search pattern (string or regex) */
  search: string | RegExp;
  /** Replacement content */
  replacement: string;
  /** Whether to replace all occurrences */
  global?: boolean;
  /** Whether to validate replacement success */
  validateReplacement?: boolean;
}

/**
 * File operation configuration
 */
export interface FileOperationConfig {
  /** Default safety level */
  defaultSafetyLevel: SafetyLevel;
  /** Global maximum file size */
  maxFileSize: number;
  /** Whether to create backups by default */
  createBackups: boolean;
  /** Backup directory relative to project root */
  backupDirectory: string;
  /** Allowed file extensions by default */
  allowedExtensions: string[];
  /** Directories to exclude from operations */
  excludeDirectories: string[];
  /** Maximum operations per minute rate limit */
  maxOperationsPerMinute: number;
  /** Whether to enable audit logging */
  enableAuditLogging: boolean;
}

// =============================================================================
// CONSTANTS AND DEFAULTS
// =============================================================================

/**
 * Default file operation configuration optimized for ReadyAI safety
 */
const DEFAULT_CONFIG: FileOperationConfig = {
  defaultSafetyLevel: 'moderate',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  createBackups: true,
  backupDirectory: '.readyai/backups',
  allowedExtensions: [
    ...READYAI_FILE_EXTENSIONS.TYPESCRIPT,
    ...READYAI_FILE_EXTENSIONS.JAVASCRIPT,
    ...READYAI_FILE_EXTENSIONS.PYTHON,
    ...READYAI_FILE_EXTENSIONS.CONFIG,
    ...READYAI_FILE_EXTENSIONS.DOCS,
    ...READYAI_FILE_EXTENSIONS.TEMPLATES
  ],
  excludeDirectories: [
    'node_modules',
    '.git',
    '.svn',
    'dist',
    'build',
    'coverage',
    '.nyc_output',
    'tmp',
    'temp'
  ],
  maxOperationsPerMinute: 1000,
  enableAuditLogging: true
};

/**
 * File size limits by safety level
 */
const SAFETY_LIMITS: Record<SafetyLevel, { maxFileSize: number; maxLineLength: number }> = {
  strict: { maxFileSize: 1024 * 1024, maxLineLength: 200 }, // 1MB
  moderate: { maxFileSize: 10 * 1024 * 1024, maxLineLength: 1000 }, // 10MB  
  permissive: { maxFileSize: 100 * 1024 * 1024, maxLineLength: 5000 } // 100MB
};

/**
 * Dangerous file patterns to block
 */
const DANGEROUS_PATTERNS = [
  /\.(exe|bat|cmd|scr|pif|com|dll|sys)$/i, // Executable files
  /\.(sh|bash|zsh|fish|ps1)$/i, // Shell scripts (in strict mode)
  /\/\.(env|secret|key|pem|cert)$/i, // Sensitive files
  /node_modules/i, // Dependencies
  /\.git/i, // Version control
];

// =============================================================================
// MAIN SERVICE CLASS
// =============================================================================

/**
 * FileOperationsService - Enterprise-grade file operations for ReadyAI
 * 
 * Provides secure, validated file operations with comprehensive safety checks,
 * audit logging, and rollback capabilities. Adapted from Cline's file tool
 * handlers with ReadyAI-specific enhancements.
 */
export class FileOperationsService {
  private static instance: FileOperationsService;
  private config: FileOperationConfig;
  private operationHistory: Map<string, FileOperationResult> = new Map();
  private rateLimitMap: Map<string, number[]> = new Map();
  private pathManager: PathManager;
  private logger: Logger;

  private constructor(config: Partial<FileOperationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.pathManager = new PathManager();
    this.logger = logger;
    
    // Initialize audit logging
    if (this.config.enableAuditLogging) {
      this.logger.info('FileOperationsService initialized with audit logging', 
        'filesystem', { config: this.config });
    }
  }

  /**
   * Get singleton service instance
   */
  public static getInstance(config?: Partial<FileOperationConfig>): FileOperationsService {
    if (!FileOperationsService.instance) {
      FileOperationsService.instance = new FileOperationsService(config);
    }
    return FileOperationsService.instance;
  }

  // =============================================================================
  // CORE FILE OPERATIONS - Adapted from Cline's file tool handlers
  // =============================================================================

  /**
   * Read file content with comprehensive validation and safety checks
   * Adapted from Cline's readFile tool with ReadyAI safety enhancements
   */
  public async readFile(
    filePath: string,
    context: Partial<FileOperationContext> = {},
    options: ReadFileOptions = {}
  ): Promise<ApiResponse<{
    content: string;
    metadata: {
      size: number;
      lastModified: string;
      encoding: FileEncoding;
      hash: string;
      lineCount: number;
    };
  }>> {
    const operationId = randomUUID() as UUID;
    const startTime = Date.now();

    try {
      // Create operation context with defaults
      const operationContext = this.createOperationContext(operationId, context, 'read');
      
      // Validate and normalize file path
      const validatedPath = await this.validateFilePath(filePath, operationContext);
      
      // Check rate limiting
      await this.checkRateLimit(operationContext);
      
      // Check file accessibility and size
      const pathType = await getPathType(validatedPath);
      if (pathType !== 'file') {
        return createApiError(
          `Path is not a file or does not exist: ${validatedPath}`,
          'FILE_NOT_FOUND',
          404
        );
      }

      // Get file stats for validation
      const stats = await fs.stat(validatedPath);
      const maxSize = options.maxSize || SAFETY_LIMITS[operationContext.safetyLevel].maxFileSize;
      
      if (stats.size > maxSize) {
        return createApiError(
          `File size (${stats.size}) exceeds limit (${maxSize})`,
          'FILE_TOO_LARGE',
          413
        );
      }

      // Perform the read operation
      const encoding = options.encoding || 'utf8';
      let content: string;
      
      if (encoding === 'binary' || encoding === 'base64') {
        const buffer = await fs.readFile(validatedPath);
        content = encoding === 'base64' 
          ? buffer.toString('base64')
          : buffer.toString('binary');
      } else {
        content = await fs.readFile(validatedPath, 'utf8');
      }

      // Calculate file hash for integrity
      const hash = createHash('sha256').update(content).digest('hex');
      const lineCount = encoding === 'utf8' ? content.split('\n').length : 0;

      // Log successful operation
      const duration = Date.now() - startTime;
      this.logger.info(
        `File read successfully: ${path.basename(validatedPath)}`,
        'filesystem',
        {
          operationId,
          filePath: validatedPath,
          fileSize: stats.size,
          duration,
          encoding,
          lineCount
        },
        'file-operations'
      );

      // Record operation result
      const result: FileOperationResult = {
        success: true,
        operationId,
        filePath: validatedPath,
        operation: 'read',
        fileSize: stats.size,
        fileHash: hash,
        timestamp: new Date().toISOString(),
        warnings: []
      };
      
      this.operationHistory.set(operationId, result);

      return createApiResponse({
        content,
        metadata: {
          size: stats.size,
          lastModified: stats.mtime.toISOString(),
          encoding,
          hash,
          lineCount
        }
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.logger.error(
        `File read failed: ${errorMessage}`,
        'filesystem',
        {
          operationId,
          filePath,
          error: errorMessage,
          duration: Date.now() - startTime
        },
        'file-operations'
      );

      return createApiError(
        `Failed to read file: ${errorMessage}`,
        'FILE_READ_ERROR',
        500,
        { operationId, originalError: errorMessage }
      );
    }
  }

  /**
   * Write file content with atomic operations and backup creation
   * Adapted from Cline's writeFile tool with ReadyAI safety enhancements
   */
  public async writeFile(
    filePath: string,
    content: string,
    context: Partial<FileOperationContext> = {},
    options: WriteFileOptions = {}
  ): Promise<ApiResponse<FileOperationResult>> {
    const operationId = randomUUID() as UUID;
    const startTime = Date.now();
    let backupPath: string | undefined;

    try {
      // Create operation context
      const operationContext = this.createOperationContext(operationId, context, 'write');
      
      // Validate and normalize file path
      const validatedPath = await this.validateFilePath(filePath, operationContext);
      
      // Check rate limiting
      await this.checkRateLimit(operationContext);
      
      // Validate content size
      const contentSize = Buffer.byteLength(content, 'utf8');
      const maxSize = SAFETY_LIMITS[operationContext.safetyLevel].maxFileSize;
      
      if (contentSize > maxSize) {
        return createApiError(
          `Content size (${contentSize}) exceeds limit (${maxSize})`,
          'CONTENT_TOO_LARGE',
          413
        );
      }

      // Check if file exists and handle overwrite policy
      const fileExists = await isAccessible(validatedPath);
      if (fileExists && !options.overwrite) {
        return createApiError(
          `File already exists and overwrite is disabled: ${validatedPath}`,
          'FILE_EXISTS',
          409
        );
      }

      // Create backup if file exists and backup is enabled
      if (fileExists && operationContext.createBackup) {
        backupPath = await this.createBackup(validatedPath, operationContext.projectId);
      }

      // Create directory if needed and allowed
      const dir = path.dirname(validatedPath);
      if (options.createDirs && !await isAccessible(dir)) {
        await fs.mkdir(dir, { recursive: true });
      }

      // Perform atomic write operation (write to temp file first)
      const tempPath = `${validatedPath}.tmp.${operationId}`;
      
      try {
        // Write content to temporary file
        const encoding = options.encoding || 'utf8';
        if (encoding === 'base64') {
          const buffer = Buffer.from(content, 'base64');
          await fs.writeFile(tempPath, buffer);
        } else {
          await fs.writeFile(tempPath, content, encoding as BufferEncoding);
        }

        // Set file permissions if specified
        if (options.mode) {
          await fs.chmod(tempPath, options.mode);
        }

        // Atomic move to final location
        await fs.rename(tempPath, validatedPath);

      } catch (error) {
        // Clean up temporary file on error
        try {
          await fs.unlink(tempPath);
        } catch (unlinkError) {
          // Ignore cleanup errors
        }
        throw error;
      }

      // Calculate file hash for integrity
      const hash = createHash('sha256').update(content).digest('hex');
      
      // Log successful operation
      const duration = Date.now() - startTime;
      this.logger.info(
        `File written successfully: ${path.basename(validatedPath)}`,
        'filesystem',
        {
          operationId,
          filePath: validatedPath,
          contentSize,
          duration,
          backupCreated: !!backupPath,
          encoding: options.encoding || 'utf8'
        },
        'file-operations'
      );

      // Record operation result
      const result: FileOperationResult = {
        success: true,
        operationId,
        filePath: validatedPath,
        operation: 'write',
        fileSize: contentSize,
        fileHash: hash,
        backupPath,
        timestamp: new Date().toISOString(),
        warnings: []
      };
      
      this.operationHistory.set(operationId, result);

      return createApiResponse(result);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Restore backup if operation failed and backup exists
      if (backupPath) {
        try {
          await fs.copyFile(backupPath, filePath);
          this.logger.info(`Backup restored after write failure: ${backupPath}`, 'filesystem');
        } catch (restoreError) {
          this.logger.error(
            `Failed to restore backup: ${restoreError instanceof Error ? restoreError.message : 'Unknown error'}`,
            'filesystem'
          );
        }
      }

      this.logger.error(
        `File write failed: ${errorMessage}`,
        'filesystem',
        {
          operationId,
          filePath,
          error: errorMessage,
          duration: Date.now() - startTime,
          backupPath
        },
        'file-operations'
      );

      return createApiError(
        `Failed to write file: ${errorMessage}`,
        'FILE_WRITE_ERROR',
        500,
        { operationId, originalError: errorMessage, backupPath }
      );
    }
  }

  /**
   * Replace content in file using search and replace
   * Adapted from Cline's replaceInFile tool with enhanced validation
   */
  public async replaceInFile(
    filePath: string,
    replaceOptions: ReplaceInFileOptions,
    context: Partial<FileOperationContext> = {}
  ): Promise<ApiResponse<{
    result: FileOperationResult;
    replacements: {
      count: number;
      matches: Array<{
        line: number;
        column: number;
        original: string;
        replacement: string;
      }>;
    };
  }>> {
    const operationId = randomUUID() as UUID;
    const startTime = Date.now();
    let backupPath: string | undefined;

    try {
      // Create operation context
      const operationContext = this.createOperationContext(operationId, context, 'replace');
      
      // First, read the current file content
      const readResult = await this.readFile(filePath, operationContext);
      if (!readResult.success) {
        return createApiError(
          `Cannot replace in file: ${readResult.error?.message}`,
          'FILE_READ_ERROR',
          404
        );
      }

      const originalContent = readResult.data.content;
      const { search, replacement, global = true, validateReplacement = true } = replaceOptions;

      // Perform the replacement
      let newContent: string;
      let replacementCount = 0;
      const matches: Array<{ line: number; column: number; original: string; replacement: string }> = [];

      if (typeof search === 'string') {
        // String search and replace with match tracking
        const lines = originalContent.split('\n');
        const newLines: string[] = [];

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
          let line = lines[lineIndex];
          let searchIndex = 0;

          while ((searchIndex = line.indexOf(search, searchIndex)) !== -1) {
            matches.push({
              line: lineIndex + 1,
              column: searchIndex + 1,
              original: search,
              replacement
            });

            line = line.substring(0, searchIndex) + replacement + line.substring(searchIndex + search.length);
            replacementCount++;
            searchIndex += replacement.length;

            if (!global) break;
          }

          newLines.push(line);
          if (replacementCount > 0 && !global) break;
        }

        newContent = newLines.join('\n');
      } else {
        // RegExp search and replace
        const globalRegex = global ? new RegExp(search.source, search.flags.includes('g') ? search.flags : search.flags + 'g') : search;
        
        // Track matches for logging
        const matchResults = Array.from(originalContent.matchAll(globalRegex));
        replacementCount = matchResults.length;
        
        // Calculate line/column positions for matches
        const lines = originalContent.split('\n');
        let currentPos = 0;
        
        for (const match of matchResults) {
          if (match.index !== undefined) {
            // Find line and column
            let line = 0;
            let lineStart = 0;
            
            while (lineStart <= match.index && line < lines.length) {
              if (lineStart + lines[line].length + 1 > match.index) break;
              lineStart += lines[line].length + 1;
              line++;
            }
            
            matches.push({
              line: line + 1,
              column: match.index - lineStart + 1,
              original: match[0],
              replacement
            });
          }
        }

        newContent = originalContent.replace(globalRegex, replacement);
      }

      // Validate that replacements occurred if validation is enabled
      if (validateReplacement && replacementCount === 0) {
        return createApiError(
          'No matches found for search pattern',
          'NO_MATCHES_FOUND',
          404,
          { 
            operationId,
            searchPattern: typeof search === 'string' ? search : search.source
          }
        );
      }

      // Check if content actually changed
      if (newContent === originalContent) {
        this.logger.info(
          `Replace operation resulted in no changes: ${path.basename(filePath)}`,
          'filesystem',
          { operationId, searchPattern: typeof search === 'string' ? search : search.source }
        );

        // Return successful result with zero replacements
        const result: FileOperationResult = {
          success: true,
          operationId,
          filePath: await this.validateFilePath(filePath, operationContext),
          operation: 'replace',
          timestamp: new Date().toISOString(),
          warnings: ['No changes made - content was identical']
        };

        return createApiResponse({
          result,
          replacements: { count: 0, matches: [] }
        });
      }

      // Write the modified content back to file
      const writeResult = await this.writeFile(filePath, newContent, {
        ...operationContext,
        createBackup: operationContext.createBackup
      });

      if (!writeResult.success) {
        return createApiError(
          `Failed to write replaced content: ${writeResult.error?.message}`,
          'FILE_WRITE_ERROR',
          500
        );
      }

      // Log successful replacement operation
      const duration = Date.now() - startTime;
      this.logger.info(
        `File replacement completed: ${path.basename(filePath)}`,
        'filesystem',
        {
          operationId,
          filePath,
          replacementCount,
          duration,
          searchPattern: typeof search === 'string' ? search : search.source
        },
        'file-operations'
      );

      // Update the operation result
      const result: FileOperationResult = {
        ...writeResult.data,
        operation: 'replace'
      };

      this.operationHistory.set(operationId, result);

      return createApiResponse({
        result,
        replacements: {
          count: replacementCount,
          matches
        }
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.logger.error(
        `File replacement failed: ${errorMessage}`,
        'filesystem',
        {
          operationId,
          filePath,
          error: errorMessage,
          duration: Date.now() - startTime,
          searchPattern: typeof replaceOptions.search === 'string' ? replaceOptions.search : replaceOptions.search.source
        },
        'file-operations'
      );

      return createApiError(
        `Failed to replace in file: ${errorMessage}`,
        'FILE_REPLACE_ERROR',
        500,
        { operationId, originalError: errorMessage }
      );
    }
  }

  /**
   * Create directory with proper permissions and validation
   */
  public async createDirectory(
    dirPath: string,
    context: Partial<FileOperationContext> = {},
    options: { recursive?: boolean; mode?: number } = {}
  ): Promise<ApiResponse<FileOperationResult>> {
    const operationId = randomUUID() as UUID;
    const startTime = Date.now();

    try {
      // Create operation context
      const operationContext = this.createOperationContext(operationId, context, 'create_directory');
      
      // Validate and normalize directory path
      const validatedPath = await this.validateFilePath(dirPath, operationContext);
      
      // Check if directory already exists
      const pathType = await getPathType(validatedPath);
      if (pathType === 'directory') {
        return createApiError(
          `Directory already exists: ${validatedPath}`,
          'DIRECTORY_EXISTS',
          409
        );
      }

      // Create the directory
      await fs.mkdir(validatedPath, { 
        recursive: options.recursive || false,
        mode: options.mode
      });

      // Log successful operation
      const duration = Date.now() - startTime;
      this.logger.info(
        `Directory created successfully: ${path.basename(validatedPath)}`,
        'filesystem',
        {
          operationId,
          dirPath: validatedPath,
          recursive: options.recursive,
          duration
        },
        'file-operations'
      );

      // Record operation result
      const result: FileOperationResult = {
        success: true,
        operationId,
        filePath: validatedPath,
        operation: 'create_directory',
        timestamp: new Date().toISOString(),
        warnings: []
      };
      
      this.operationHistory.set(operationId, result);

      return createApiResponse(result);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.logger.error(
        `Directory creation failed: ${errorMessage}`,
        'filesystem',
        {
          operationId,
          dirPath,
          error: errorMessage,
          duration: Date.now() - startTime
        },
        'file-operations'
      );

      return createApiError(
        `Failed to create directory: ${errorMessage}`,
        'DIRECTORY_CREATE_ERROR',
        500,
        { operationId, originalError: errorMessage }
      );
    }
  }

  /**
   * Delete file with safety checks and optional backup
   */
  public async deleteFile(
    filePath: string,
    context: Partial<FileOperationContext> = {},
    options: { createBackup?: boolean } = {}
  ): Promise<ApiResponse<FileOperationResult>> {
    const operationId = randomUUID() as UUID;
    const startTime = Date.now();
    let backupPath: string | undefined;

    try {
      // Create operation context
      const operationContext = this.createOperationContext(operationId, context, 'delete');
      
      // Validate and normalize file path
      const validatedPath = await this.validateFilePath(filePath, operationContext);
      
      // Check if file exists
      const pathType = await getPathType(validatedPath);
      if (pathType !== 'file') {
        return createApiError(
          `File does not exist: ${validatedPath}`,
          'FILE_NOT_FOUND',
          404
        );
      }

      // Create backup if requested or if safety level requires it
      const shouldBackup = options.createBackup ?? (operationContext.safetyLevel === 'strict');
      if (shouldBackup) {
        backupPath = await this.createBackup(validatedPath, operationContext.projectId);
      }

      // Perform the deletion
      await fs.unlink(validatedPath);

      // Log successful operation
      const duration = Date.now() - startTime;
      this.logger.info(
        `File deleted successfully: ${path.basename(validatedPath)}`,
        'filesystem',
        {
          operationId,
          filePath: validatedPath,
          backupCreated: !!backupPath,
          duration
        },
        'file-operations'
      );

      // Record operation result
      const result: FileOperationResult = {
        success: true,
        operationId,
        filePath: validatedPath,
        operation: 'delete',
        backupPath,
        timestamp: new Date().toISOString(),
        warnings: shouldBackup && !backupPath ? ['Backup creation failed'] : []
      };
      
      this.operationHistory.set(operationId, result);

      return createApiResponse(result);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.logger.error(
        `File deletion failed: ${errorMessage}`,
        'filesystem',
        {
          operationId,
          filePath,
          error: errorMessage,
          duration: Date.now() - startTime,
          backupPath
        },
        'file-operations'
      );

      return createApiError(
        `Failed to delete file: ${errorMessage}`,
        'FILE_DELETE_ERROR',
        500,
        { operationId, originalError: errorMessage, backupPath }
      );
    }
  }

  // =============================================================================
  // VALIDATION AND SAFETY METHODS
  // =============================================================================

  /**
   * Validate file path according to ReadyAI safety policies
   */
  private async validateFilePath(
    filePath: string,
    context: FileOperationContext
  ): Promise<string> {
    // Sanitize and normalize the path
    const sanitizedPath = sanitizePath(filePath, {
      allowAbsolute: true,
      maxLength: PATH_CONFIG.MAX_PATH_LENGTH,
      baseDir: context.restrictToDirectory
    });

    // Check if path is within allowed directory
    if (context.restrictToDirectory) {
      const isWithinDir = isWithinDirectory(sanitizedPath, context.restrictToDirectory);
      if (!isWithinDir) {
        throw new ReadyAIError(
          `Path is outside allowed directory: ${sanitizedPath}`,
          'PATH_OUTSIDE_BASE'
        );
      }
    }

    // Check against dangerous patterns based on safety level
    if (context.safetyLevel === 'strict') {
      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(sanitizedPath)) {
          throw new ReadyAIError(
            `Path matches dangerous pattern in strict mode: ${sanitizedPath}`,
            'DANGEROUS_PATH'
          );
        }
      }
    }

    // Check file extension if restrictions are set
    if (context.allowedExtensions && context.allowedExtensions.length > 0) {
      const parsed = parseFilePath(sanitizedPath);
      const isAllowed = context.allowedExtensions.includes(parsed.ext.toLowerCase());
      if (!isAllowed) {
        throw new ReadyAIError(
          `File extension not allowed: ${parsed.ext}`,
          'INVALID_EXTENSION'
        );
      }
    }

    // Check exclude directories
    for (const excludeDir of this.config.excludeDirectories) {
      if (sanitizedPath.includes(excludeDir)) {
        throw new ReadyAIError(
          `Path contains excluded directory: ${excludeDir}`,
          'EXCLUDED_DIRECTORY'
        );
      }
    }

    return sanitizedPath;
  }

  /**
   * Create operation context with defaults
   */
  private createOperationContext(
    operationId: UUID,
    partial: Partial<FileOperationContext>,
    operation: FileOperationType
  ): FileOperationContext {
    return {
      operationId,
      safetyLevel: partial.safetyLevel || this.config.defaultSafetyLevel,
      createBackup: partial.createBackup ?? this.config.createBackups,
      maxFileSize: partial.maxFileSize || this.config.maxFileSize,
      allowedExtensions: partial.allowedExtensions || this.config.allowedExtensions,
      restrictToDirectory: partial.restrictToDirectory,
      projectId: partial.projectId,
      phaseType: partial.phaseType
    };
  }

  /**
   * Check rate limiting to prevent abuse
   */
  private async checkRateLimit(context: FileOperationContext): Promise<void> {
    const key = context.projectId || 'global';
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window

    if (!this.rateLimitMap.has(key)) {
      this.rateLimitMap.set(key, []);
    }

    const timestamps = this.rateLimitMap.get(key)!;
    
    // Remove old timestamps
    const filtered = timestamps.filter(ts => ts > windowStart);
    
    // Check if limit exceeded
    if (filtered.length >= this.config.maxOperationsPerMinute) {
      throw new ReadyAIError(
        `Rate limit exceeded: ${this.config.maxOperationsPerMinute} operations per minute`,
        'RATE_LIMIT_EXCEEDED'
      );
    }

    // Add current timestamp
    filtered.push(now);
    this.rateLimitMap.set(key, filtered);
  }

  /**
   * Create backup of file before modification
   */
  private async createBackup(filePath: string, projectId?: UUID): Promise<string> {
    try {
      const parsed = parseFilePath(filePath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `${parsed.name}_${timestamp}${parsed.ext}.bak`;
      
      // Determine backup directory
      let backupDir: string;
      if (projectId) {
        const projectRoot = path.dirname(filePath); // Simplified - would use project manager in real implementation
        backupDir = joinPaths(projectRoot, this.config.backupDirectory);
      } else {
        backupDir = joinPaths(parsed.dir, '.backups');
      }

      // Ensure backup directory exists
      await fs.mkdir(backupDir, { recursive: true });
      
      // Create backup path and copy file
      const backupPath = joinPaths(backupDir, backupName);
      await fs.copyFile(filePath, backupPath);

      this.logger.debug(
        `Backup created: ${backupName}`,
        'filesystem',
        { originalFile: filePath, backupPath }
      );

      return backupPath;

    } catch (error) {
      this.logger.error(
        `Failed to create backup: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'filesystem',
        { originalFile: filePath }
      );
      throw new ReadyAIError(
        `Backup creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'BACKUP_FAILED'
      );
    }
  }

  // =============================================================================
  // UTILITY AND MANAGEMENT METHODS
  // =============================================================================

  /**
   * Get operation history
   */
  public getOperationHistory(limit?: number): FileOperationResult[] {
    const results = Array.from(this.operationHistory.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    return limit ? results.slice(0, limit) : results;
  }

  /**
   * Get operation by ID
   */
  public getOperation(operationId: string): FileOperationResult | undefined {
    return this.operationHistory.get(operationId);
  }

  /**
   * Clear operation history
   */
  public clearHistory(): void {
    this.operationHistory.clear();
    this.logger.info('File operation history cleared', 'filesystem');
  }

  /**
   * Update service configuration
   */
  public updateConfig(newConfig: Partial<FileOperationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('FileOperationsService configuration updated', 'filesystem', { config: this.config });
  }

  /**
   * Get current configuration
   */
  public getConfig(): Readonly<FileOperationConfig> {
    return { ...this.config };
  }

  /**
   * Health check for service
   */
  public async healthCheck(): Promise<ApiResponse<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    metrics: {
      totalOperations: number;
      recentErrors: number;
      memoryUsage: number;
    };
  }>> {
    try {
      const totalOperations = this.operationHistory.size;
      const recentErrors = Array.from(this.operationHistory.values())
        .filter(op => !op.success && 
          new Date(op.timestamp).getTime() > Date.now() - 3600000 // Last hour
        ).length;
      
      const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024; // MB

      const status = recentErrors > 10 ? 'unhealthy' : 
                    recentErrors > 5 ? 'degraded' : 'healthy';

      return createApiResponse({
        status,
        metrics: {
          totalOperations,
          recentErrors,
          memoryUsage
        }
      });

    } catch (error) {
      return createApiError(
        `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'HEALTH_CHECK_FAILED',
        500
      );
    }
  }
}

// =============================================================================
// EXPORTS AND CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Default service instance for convenience
 */
export const fileOperations = FileOperationsService.getInstance();

/**
 * Create custom file operations service with specific configuration
 */
export const createFileOperationsService = (config?: Partial<FileOperationConfig>) => 
  FileOperationsService.getInstance(config);

/**
 * Convenience functions for common operations
 */
export const readFile = (filePath: string, options?: ReadFileOptions) =>
  fileOperations.readFile(filePath, {}, options);

export const writeFile = (filePath: string, content: string, options?: WriteFileOptions) =>
  fileOperations.writeFile(filePath, content, {}, options);

export const replaceInFile = (filePath: string, replaceOptions: ReplaceInFileOptions) =>
  fileOperations.replaceInFile(filePath, replaceOptions);

export const createDirectory = (dirPath: string, options?: { recursive?: boolean; mode?: number }) =>
  fileOperations.createDirectory(dirPath, {}, options);

export const deleteFile = (filePath: string, options?: { createBackup?: boolean }) =>
  fileOperations.deleteFile(filePath, {}, options);

// Export types for external consumption
export type {
  FileOperationType,
  SafetyLevel,
  FileEncoding,
  FileOperationContext,
  FileOperationResult,
  ReadFileOptions,
  WriteFileOptions,
  ReplaceInFileOptions,
  FileOperationConfig
};
