// packages/filesystem/types/filesystem.ts

import { UUID, Timestamp, ErrorDetails, ValidationResult, OperationStatus } from '../../foundation/types/core.js';

/**
 * ReadyAI Filesystem Types Module
 * 
 * Extracted and adapted from Cline's battle-tested file operation patterns.
 * Provides comprehensive type definitions for filesystem operations within
 * ReadyAI's project structure management system.
 * 
 * Key adaptations from Cline:
 * - Project-aware path resolution
 * - ReadyAI UUID integration
 * - Enhanced error handling for multi-phase operations
 * - Support for ReadyAI workspace conventions
 */

// =============================================================================
// Core Path and File Types
// =============================================================================

/**
 * Represents different types of file system entries
 * Extracted from Cline's file classification patterns
 */
export enum FileSystemEntryType {
  FILE = 'file',
  DIRECTORY = 'directory',
  SYMLINK = 'symlink',
  UNKNOWN = 'unknown'
}

/**
 * Represents file access permissions
 * Adapted from Cline's file operation security patterns
 */
export enum FileAccessPermission {
  READ = 'read',
  WRITE = 'write',
  EXECUTE = 'execute',
  DELETE = 'delete'
}

/**
 * Core file system entry information
 * Based on Cline's file metadata patterns with ReadyAI enhancements
 */
export interface FileSystemEntry {
  /** Unique identifier for tracking operations */
  readonly id: UUID;
  /** Absolute path to the entry */
  readonly absolutePath: string;
  /** Path relative to workspace root */
  readonly relativePath: string;
  /** Type of file system entry */
  readonly type: FileSystemEntryType;
  /** File size in bytes (null for directories) */
  readonly size: number | null;
  /** Last modified timestamp */
  readonly lastModified: Timestamp;
  /** Creation timestamp */
  readonly created: Timestamp;
  /** Available permissions for this entry */
  readonly permissions: FileAccessPermission[];
  /** Whether entry exists on filesystem */
  readonly exists: boolean;
  /** MIME type for files (null for directories) */
  readonly mimeType: string | null;
  /** File extension (null for directories) */
  readonly extension: string | null;
  /** ReadyAI-specific metadata */
  readonly metadata: FileSystemEntryMetadata;
}

/**
 * ReadyAI-specific metadata for file entries
 * Extends Cline's patterns with project structure awareness
 */
export interface FileSystemEntryMetadata {
  /** Whether file is part of ReadyAI project structure */
  readonly isProjectFile: boolean;
  /** Project phase this file belongs to */
  readonly projectPhase: string | null;
  /** Module this file belongs to */
  readonly moduleId: string | null;
  /** Whether file is generated content */
  readonly isGenerated: boolean;
  /** Tags for categorization */
  readonly tags: string[];
  /** Last operation performed on this file */
  readonly lastOperation: FileOperation | null;
}

// =============================================================================
// File Operations
// =============================================================================

/**
 * Types of file operations supported
 * Based on Cline's comprehensive file manipulation patterns
 */
export enum FileOperationType {
  READ = 'read',
  WRITE = 'write',
  CREATE = 'create',
  DELETE = 'delete',
  MOVE = 'move',
  COPY = 'copy',
  RENAME = 'rename',
  CHMOD = 'chmod',
  MKDIR = 'mkdir',
  RMDIR = 'rmdir'
}

/**
 * File operation request structure
 * Adapted from Cline's operation patterns with ReadyAI validation
 */
export interface FileOperationRequest {
  /** Unique identifier for operation tracking */
  readonly id: UUID;
  /** Type of operation to perform */
  readonly type: FileOperationType;
  /** Target path for the operation */
  readonly targetPath: string;
  /** Source path (for move/copy operations) */
  readonly sourcePath?: string;
  /** New content for write operations */
  readonly content?: string | Buffer;
  /** Options for the operation */
  readonly options: FileOperationOptions;
  /** ReadyAI context information */
  readonly context: ReadyAIOperationContext;
}

/**
 * Options for file operations
 * Based on Cline's flexible operation configuration
 */
export interface FileOperationOptions {
  /** Whether to create directories if they don't exist */
  readonly createDirectories: boolean;
  /** Whether to overwrite existing files */
  readonly overwrite: boolean;
  /** File encoding for text operations */
  readonly encoding: BufferEncoding;
  /** File permissions for new files */
  readonly mode: number;
  /** Whether to preserve timestamps */
  readonly preserveTimestamps: boolean;
  /** Maximum file size allowed */
  readonly maxSize: number;
  /** Whether to validate file content */
  readonly validateContent: boolean;
  /** Whether to create backup before modification */
  readonly createBackup: boolean;
}

/**
 * ReadyAI-specific operation context
 * Integrates with ReadyAI's project orchestration
 */
export interface ReadyAIOperationContext {
  /** Current project phase */
  readonly projectPhase: string;
  /** Module performing the operation */
  readonly moduleId: string;
  /** Operation priority */
  readonly priority: OperationPriority;
  /** Whether operation is part of batch */
  readonly isBatchOperation: boolean;
  /** Batch identifier if applicable */
  readonly batchId: UUID | null;
  /** User or system initiating operation */
  readonly initiator: string;
  /** Additional context data */
  readonly metadata: Record<string, unknown>;
}

/**
 * Operation priority levels
 * Based on ReadyAI's orchestrated development priorities
 */
export enum OperationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// =============================================================================
// Operation Results and Status
// =============================================================================

/**
 * Result of a file operation
 * Extended from Cline's comprehensive result tracking
 */
export interface FileOperationResult {
  /** Operation request that was executed */
  readonly request: FileOperationRequest;
  /** Final status of the operation */
  readonly status: OperationStatus;
  /** Timestamp when operation completed */
  readonly completedAt: Timestamp;
  /** Duration in milliseconds */
  readonly duration: number;
  /** Resulting file system entry (if applicable) */
  readonly resultEntry: FileSystemEntry | null;
  /** Files affected by the operation */
  readonly affectedFiles: string[];
  /** Bytes read/written */
  readonly bytesProcessed: number;
  /** Any warnings generated */
  readonly warnings: string[];
  /** Error details if operation failed */
  readonly error: ErrorDetails | null;
  /** Validation result if validation was requested */
  readonly validation: ValidationResult | null;
  /** Backup information if backup was created */
  readonly backup: BackupInfo | null;
}

/**
 * Information about file backups
 * Adapted from Cline's data protection patterns
 */
export interface BackupInfo {
  /** Path to backup file */
  readonly backupPath: string;
  /** Timestamp when backup was created */
  readonly createdAt: Timestamp;
  /** Original file checksum */
  readonly originalChecksum: string;
  /** Backup file checksum */
  readonly backupChecksum: string;
  /** Backup retention policy */
  readonly retention: BackupRetention;
}

/**
 * Backup retention policies
 * Based on ReadyAI's data management requirements
 */
export enum BackupRetention {
  TEMPORARY = 'temporary',    // Delete after operation completes
  SESSION = 'session',        // Delete at end of session
  PROJECT = 'project',        // Delete when project completes
  PERSISTENT = 'persistent'   // Keep indefinitely
}

// =============================================================================
// Path Resolution and Workspace Types
// =============================================================================

/**
 * ReadyAI workspace path information
 * Extends Cline's path handling with project structure awareness
 */
export interface WorkspacePath {
  /** Absolute path */
  readonly absolute: string;
  /** Path relative to workspace root */
  readonly relative: string;
  /** Path segments */
  readonly segments: string[];
  /** Whether path is within workspace */
  readonly isWithinWorkspace: boolean;
  /** ReadyAI project structure context */
  readonly projectContext: ProjectPathContext;
  /** Normalized path (cross-platform) */
  readonly normalized: string;
}

/**
 * Project structure context for paths
 * ReadyAI-specific path categorization
 */
export interface ProjectPathContext {
  /** Whether path is in source directory */
  readonly isSourcePath: boolean;
  /** Whether path is generated content */
  readonly isGeneratedPath: boolean;
  /** Whether path is configuration */
  readonly isConfigPath: boolean;
  /** Whether path is documentation */
  readonly isDocumentationPath: boolean;
  /** Module this path belongs to */
  readonly moduleId: string | null;
  /** Phase this path is relevant to */
  readonly relevantPhases: string[];
}

// =============================================================================
// File Watching and Events
// =============================================================================

/**
 * File system event types
 * Based on Cline's comprehensive file watching patterns
 */
export enum FileSystemEventType {
  CREATED = 'created',
  MODIFIED = 'modified',
  DELETED = 'deleted',
  MOVED = 'moved',
  PERMISSIONS_CHANGED = 'permissions_changed'
}

/**
 * File system change event
 * Adapted from Cline's event handling with ReadyAI context
 */
export interface FileSystemEvent {
  /** Unique event identifier */
  readonly id: UUID;
  /** Type of change that occurred */
  readonly type: FileSystemEventType;
  /** Path that changed */
  readonly path: string;
  /** Previous path (for move events) */
  readonly previousPath?: string;
  /** Timestamp of the event */
  readonly timestamp: Timestamp;
  /** ReadyAI-specific event context */
  readonly context: FileSystemEventContext;
  /** Additional event metadata */
  readonly metadata: Record<string, unknown>;
}

/**
 * Context information for file system events
 * ReadyAI integration for event processing
 */
export interface FileSystemEventContext {
  /** Whether change was initiated by ReadyAI */
  readonly isReadyAIInitiated: boolean;
  /** Module that initiated the change */
  readonly initiatingModule: string | null;
  /** Whether change should trigger project regeneration */
  readonly triggersRegeneration: boolean;
  /** Project phase relevance */
  readonly affectsPhases: string[];
}

// =============================================================================
// Batch Operations
// =============================================================================

/**
 * Batch file operation request
 * Extended from Cline's batch processing capabilities
 */
export interface BatchFileOperation {
  /** Unique batch identifier */
  readonly batchId: UUID;
  /** Individual operations in the batch */
  readonly operations: FileOperationRequest[];
  /** Batch execution options */
  readonly options: BatchOperationOptions;
  /** ReadyAI batch context */
  readonly context: ReadyAIBatchContext;
}

/**
 * Options for batch operations
 * Based on Cline's efficient batch processing patterns
 */
export interface BatchOperationOptions {
  /** Whether to stop on first error */
  readonly stopOnError: boolean;
  /** Maximum concurrent operations */
  readonly maxConcurrency: number;
  /** Whether to run operations in sequence */
  readonly sequential: boolean;
  /** Timeout for entire batch */
  readonly timeoutMs: number;
  /** Whether to create transaction log */
  readonly createTransactionLog: boolean;
  /** Whether to validate batch before execution */
  readonly validateBatch: boolean;
}

/**
 * ReadyAI-specific batch context
 * Orchestration context for batch operations
 */
export interface ReadyAIBatchContext {
  /** Project phase for batch operations */
  readonly projectPhase: string;
  /** Module orchestrating the batch */
  readonly orchestratingModule: string;
  /** Batch priority level */
  readonly priority: OperationPriority;
  /** Whether batch is part of rollback operation */
  readonly isRollback: boolean;
  /** Related batch operations */
  readonly relatedBatches: UUID[];
  /** Batch metadata */
  readonly metadata: Record<string, unknown>;
}

/**
 * Result of batch operation execution
 * Comprehensive batch result tracking from Cline patterns
 */
export interface BatchOperationResult {
  /** Original batch request */
  readonly batch: BatchFileOperation;
  /** Individual operation results */
  readonly results: FileOperationResult[];
  /** Overall batch status */
  readonly status: OperationStatus;
  /** Batch completion timestamp */
  readonly completedAt: Timestamp;
  /** Total batch duration */
  readonly duration: number;
  /** Number of successful operations */
  readonly successCount: number;
  /** Number of failed operations */
  readonly failureCount: number;
  /** All files affected by batch */
  readonly affectedFiles: string[];
  /** Total bytes processed */
  readonly totalBytesProcessed: number;
  /** Batch-level errors */
  readonly batchErrors: ErrorDetails[];
  /** Transaction log path if created */
  readonly transactionLogPath: string | null;
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * File content encoding options
 * Based on Cline's flexible content handling
 */
export type FileEncoding = 'utf8' | 'utf16le' | 'latin1' | 'base64' | 'hex' | 'ascii' | 'binary';

/**
 * File filter predicate function
 * For filtering file system entries
 */
export type FileFilter = (entry: FileSystemEntry) => boolean;

/**
 * Path transformation function
 * For manipulating file paths
 */
export type PathTransformer = (path: string) => string;

/**
 * File operation callback function
 * For operation progress tracking
 */
export type FileOperationCallback = (progress: FileOperationProgress) => void;

/**
 * File operation progress information
 * Real-time operation tracking
 */
export interface FileOperationProgress {
  /** Operation being tracked */
  readonly operation: FileOperationRequest;
  /** Current progress percentage (0-100) */
  readonly progress: number;
  /** Current operation stage */
  readonly stage: string;
  /** Bytes processed so far */
  readonly bytesProcessed: number;
  /** Total bytes to process */
  readonly totalBytes: number;
  /** Estimated time remaining (milliseconds) */
  readonly estimatedTimeRemaining: number | null;
}

// =============================================================================
// Default Values and Constants
// =============================================================================

/**
 * Default file operation options
 * Sensible defaults based on Cline's proven patterns
 */
export const DEFAULT_FILE_OPERATION_OPTIONS: FileOperationOptions = {
  createDirectories: true,
  overwrite: false,
  encoding: 'utf8',
  mode: 0o644,
  preserveTimestamps: true,
  maxSize: 50 * 1024 * 1024, // 50MB
  validateContent: false,
  createBackup: false
} as const;

/**
 * Default batch operation options
 * Optimized for ReadyAI's orchestrated operations
 */
export const DEFAULT_BATCH_OPERATION_OPTIONS: BatchOperationOptions = {
  stopOnError: false,
  maxConcurrency: 10,
  sequential: false,
  timeoutMs: 300000, // 5 minutes
  createTransactionLog: true,
  validateBatch: true
} as const;

/**
 * ReadyAI project path patterns
 * Standard paths within ReadyAI projects
 */
export const READYAI_PATH_PATTERNS = {
  SOURCE: /^src\//,
  GENERATED: /^(dist|build|out|generated)\//,
  CONFIG: /^(config|\.config|\.readyai)\//,
  DOCS: /^(docs|documentation)\//,
  TESTS: /^(test|tests|__tests__|spec)\//,
  MODULES: /^(packages|modules|libs)\//
} as const;

/**
 * Standard ReadyAI file extensions
 * Categorized by type for efficient processing
 */
export const READYAI_FILE_EXTENSIONS = {
  SOURCE: ['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte'],
  CONFIG: ['.json', '.yaml', '.yml', '.toml', '.ini', '.env'],
  DOCS: ['.md', '.mdx', '.txt', '.rst'],
  ASSETS: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2']
} as const;
