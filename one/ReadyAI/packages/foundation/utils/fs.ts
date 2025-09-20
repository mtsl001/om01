/**
 * File system utilities for ReadyAI Personal AI Development Orchestrator
 * 
 * This module provides comprehensive file system operations with workspace integration,
 * adapting proven patterns from Cline's production codebase while maintaining
 * ReadyAI's specific architectural requirements and error handling standards.
 * 
 * Extracted from Cline's src/utils/fs.ts with ReadyAI workspace integration
 */

import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'
import { 
  arePathsEqual, 
  getReadablePath, 
  isLocatedInWorkspace, 
  normalizePath,
  resolveWorkspacePath 
} from './path'

// =============================================================================
// CONSTANTS AND CONFIGURATION
// =============================================================================

/**
 * Global file naming conventions used across ReadyAI
 * Maintains consistency with ReadyAI's project structure requirements
 */
export const READYAI_FILE_NAMES = {
  // Core configuration files
  projectConfig: 'readyai.config.json',
  contextHistory: 'context-history.json',
  phaseArtifacts: 'phase-artifacts.json',
  dependencyGraph: 'dependency-graph.json',
  validationResults: 'validation-results.json',
  
  // AI conversation and context
  aiConversationHistory: 'ai-conversation-history.json',
  contextPackages: 'context-packages.json',
  generationHistory: 'generation-history.json',
  
  // Quality and metrics
  qualityMetrics: 'quality-metrics.json',
  performanceMetrics: 'performance-metrics.json',
  
  // Project metadata
  projectMetadata: 'project-metadata.json',
  phaseProgress: 'phase-progress.json',
  
  // ReadyAI rules and configuration
  readyAIRules: '.readyai-rules',
  readyAIIgnore: '.readyai-ignore',
  readyAIWorkflows: '.readyai-workflows'
} as const

/**
 * Maximum file size for text processing (20MB)
 * Prevents memory issues with very large files
 */
export const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB in bytes

/**
 * Supported text file extensions for content extraction
 */
export const TEXT_FILE_EXTENSIONS = [
  '.txt', '.md', '.json', '.xml', '.yaml', '.yml',
  '.js', '.ts', '.jsx', '.tsx', '.py', '.java',
  '.cpp', '.c', '.h', '.cs', '.php', '.rb',
  '.go', '.rs', '.swift', '.kt', '.scala',
  '.html', '.css', '.scss', '.sass', '.less',
  '.sql', '.sh', '.bash', '.zsh', '.ps1',
  '.dockerfile', '.gitignore', '.env'
] as const

/**
 * Binary file extensions that should not be processed as text
 */
export const BINARY_FILE_EXTENSIONS = [
  '.pdf', '.docx', '.xlsx', '.pptx',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
  '.mp4', '.avi', '.mov', '.wmv',
  '.mp3', '.wav', '.flac',
  '.zip', '.tar', '.gz', '.rar',
  '.exe', '.dmg', '.app', '.deb', '.rpm'
] as const

// =============================================================================
// ERROR CLASSES
// =============================================================================

/**
 * Custom error class for file system operations
 * Extends ReadyAI's error handling patterns
 */
export class ReadyAIFileSystemError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly filePath?: string,
    public readonly originalError?: Error
  ) {
    super(message)
    this.name = 'ReadyAIFileSystemError'
    
    // Maintain stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ReadyAIFileSystemError)
    }
  }

  /**
   * Create error for file not found operations
   */
  static fileNotFound(filePath: string, operation: string): ReadyAIFileSystemError {
    return new ReadyAIFileSystemError(
      `File not found: ${filePath}`,
      operation,
      filePath
    )
  }

  /**
   * Create error for permission denied operations
   */
  static permissionDenied(filePath: string, operation: string): ReadyAIFileSystemError {
    return new ReadyAIFileSystemError(
      `Permission denied: ${filePath}`,
      operation,
      filePath
    )
  }

  /**
   * Create error for file too large operations
   */
  static fileTooLarge(filePath: string, size: number, maxSize: number): ReadyAIFileSystemError {
    return new ReadyAIFileSystemError(
      `File too large: ${filePath} (${size} bytes exceeds ${maxSize} bytes)`,
      'read',
      filePath
    )
  }
}

// =============================================================================
// CORE FILE SYSTEM OPERATIONS
// =============================================================================

/**
 * Check if a file exists at the specified path
 * Enhanced with comprehensive error handling and path normalization
 * 
 * @param filePath - Absolute or relative path to check
 * @returns Promise resolving to boolean indicating file existence
 */
export async function fileExistsAtPath(filePath: string): Promise<boolean> {
  try {
    const normalizedPath = normalizePath(filePath)
    const stats = await fs.stat(normalizedPath)
    return stats.isFile()
  } catch (error) {
    // File doesn't exist or is not accessible
    return false
  }
}

/**
 * Check if a directory exists at the specified path
 * 
 * @param dirPath - Absolute or relative path to check
 * @returns Promise resolving to boolean indicating directory existence
 */
export async function directoryExistsAtPath(dirPath: string): Promise<boolean> {
  try {
    const normalizedPath = normalizePath(dirPath)
    const stats = await fs.stat(normalizedPath)
    return stats.isDirectory()
  } catch (error) {
    return false
  }
}

/**
 * Get comprehensive file information including stats and metadata
 * 
 * @param filePath - Path to the file
 * @returns Promise resolving to file information object
 */
export interface FileInfo {
  path: string
  normalizedPath: string
  exists: boolean
  isFile: boolean
  isDirectory: boolean
  size: number
  createdAt: Date
  modifiedAt: Date
  accessedAt: Date
  extension: string
  mimeType?: string
  isReadable: boolean
  isWritable: boolean
  isInWorkspace: boolean
}

export async function getFileInfo(filePath: string): Promise<FileInfo> {
  const normalizedPath = normalizePath(filePath)
  const extension = path.extname(normalizedPath).toLowerCase()
  
  try {
    const stats = await fs.stat(normalizedPath)
    
    // Check permissions
    let isReadable = true
    let isWritable = true
    
    try {
      await fs.access(normalizedPath, fs.constants.R_OK)
    } catch {
      isReadable = false
    }
    
    try {
      await fs.access(normalizedPath, fs.constants.W_OK)
    } catch {
      isWritable = false
    }

    return {
      path: filePath,
      normalizedPath,
      exists: true,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      size: stats.size,
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime,
      accessedAt: stats.atime,
      extension,
      isReadable,
      isWritable,
      isInWorkspace: await isLocatedInWorkspace(normalizedPath)
    }
  } catch (error) {
    return {
      path: filePath,
      normalizedPath,
      exists: false,
      isFile: false,
      isDirectory: false,
      size: 0,
      createdAt: new Date(0),
      modifiedAt: new Date(0),
      accessedAt: new Date(0),
      extension,
      isReadable: false,
      isWritable: false,
      isInWorkspace: false
    }
  }
}

// =============================================================================
// FILE READING AND WRITING OPERATIONS
// =============================================================================

/**
 * Read file content with comprehensive error handling and size validation
 * Adapts Cline's proven file reading patterns with ReadyAI enhancements
 * 
 * @param filePath - Path to the file to read
 * @param encoding - Text encoding (default: 'utf8')
 * @param maxSize - Maximum allowed file size (default: MAX_FILE_SIZE)
 * @returns Promise resolving to file content as string
 * @throws ReadyAIFileSystemError for various error conditions
 */
export async function readFileContent(
  filePath: string, 
  encoding: BufferEncoding = 'utf8',
  maxSize: number = MAX_FILE_SIZE
): Promise<string> {
  try {
    const normalizedPath = normalizePath(filePath)
    
    // Check if file exists first
    const fileExists = await fileExistsAtPath(normalizedPath)
    if (!fileExists) {
      throw ReadyAIFileSystemError.fileNotFound(normalizedPath, 'read')
    }

    // Get file stats to check size
    const stats = await fs.stat(normalizedPath)
    if (stats.size > maxSize) {
      throw ReadyAIFileSystemError.fileTooLarge(normalizedPath, stats.size, maxSize)
    }

    // Check if it's actually a file
    if (!stats.isFile()) {
      throw new ReadyAIFileSystemError(
        `Path is not a file: ${normalizedPath}`,
        'read',
        normalizedPath
      )
    }

    // Read the file content
    const content = await fs.readFile(normalizedPath, encoding)
    return content
    
  } catch (error) {
    if (error instanceof ReadyAIFileSystemError) {
      throw error
    }
    
    // Handle system errors
    const systemError = error as NodeJS.ErrnoException
    switch (systemError.code) {
      case 'ENOENT':
        throw ReadyAIFileSystemError.fileNotFound(filePath, 'read')
      case 'EACCES':
        throw ReadyAIFileSystemError.permissionDenied(filePath, 'read')
      default:
        throw new ReadyAIFileSystemError(
          `Failed to read file: ${systemError.message}`,
          'read',
          filePath,
          systemError
        )
    }
  }
}

/**
 * Write content to file with automatic directory creation and backup
 * Incorporates Cline's proven file writing patterns with ReadyAI safety features
 * 
 * @param filePath - Path where to write the file
 * @param content - Content to write
 * @param options - Write options
 * @returns Promise resolving to the normalized file path
 */
export interface WriteFileOptions {
  encoding?: BufferEncoding
  createBackup?: boolean
  ensureDirectory?: boolean
  overwrite?: boolean
}

export async function writeFileContent(
  filePath: string,
  content: string,
  options: WriteFileOptions = {}
): Promise<string> {
  const {
    encoding = 'utf8',
    createBackup = true,
    ensureDirectory = true,
    overwrite = true
  } = options

  try {
    const normalizedPath = normalizePath(filePath)
    
    // Check if file already exists and we're not allowed to overwrite
    if (!overwrite && await fileExistsAtPath(normalizedPath)) {
      throw new ReadyAIFileSystemError(
        `File already exists and overwrite is disabled: ${normalizedPath}`,
        'write',
        normalizedPath
      )
    }

    // Create backup if requested and file exists
    if (createBackup && await fileExistsAtPath(normalizedPath)) {
      await createBackupFile(normalizedPath)
    }

    // Ensure parent directory exists
    if (ensureDirectory) {
      const dirPath = path.dirname(normalizedPath)
      await ensureDirectoryExists(dirPath)
    }

    // Write the file
    await fs.writeFile(normalizedPath, content, encoding)
    
    return normalizedPath
    
  } catch (error) {
    if (error instanceof ReadyAIFileSystemError) {
      throw error
    }
    
    const systemError = error as NodeJS.ErrnoException
    switch (systemError.code) {
      case 'EACCES':
        throw ReadyAIFileSystemError.permissionDenied(filePath, 'write')
      case 'ENOSPC':
        throw new ReadyAIFileSystemError(
          `No space left on device: ${filePath}`,
          'write',
          filePath,
          systemError
        )
      default:
        throw new ReadyAIFileSystemError(
          `Failed to write file: ${systemError.message}`,
          'write',
          filePath,
          systemError
        )
    }
  }
}

/**
 * Append content to an existing file or create new file if it doesn't exist
 * 
 * @param filePath - Path to the file
 * @param content - Content to append
 * @param encoding - Text encoding (default: 'utf8')
 * @returns Promise resolving to the normalized file path
 */
export async function appendFileContent(
  filePath: string,
  content: string,
  encoding: BufferEncoding = 'utf8'
): Promise<string> {
  try {
    const normalizedPath = normalizePath(filePath)
    
    // Ensure parent directory exists
    const dirPath = path.dirname(normalizedPath)
    await ensureDirectoryExists(dirPath)
    
    await fs.appendFile(normalizedPath, content, encoding)
    return normalizedPath
    
  } catch (error) {
    const systemError = error as NodeJS.ErrnoException
    throw new ReadyAIFileSystemError(
      `Failed to append to file: ${systemError.message}`,
      'append',
      filePath,
      systemError
    )
  }
}

// =============================================================================
// DIRECTORY OPERATIONS
// =============================================================================

/**
 * Ensure directory exists, creating it recursively if necessary
 * Adapts Cline's directory creation patterns with enhanced error handling
 * 
 * @param dirPath - Directory path to create
 * @returns Promise resolving to the normalized directory path
 */
export async function ensureDirectoryExists(dirPath: string): Promise<string> {
  try {
    const normalizedPath = normalizePath(dirPath)
    await fs.mkdir(normalizedPath, { recursive: true })
    return normalizedPath
  } catch (error) {
    const systemError = error as NodeJS.ErrnoException
    switch (systemError.code) {
      case 'EACCES':
        throw ReadyAIFileSystemError.permissionDenied(dirPath, 'mkdir')
      case 'ENOSPC':
        throw new ReadyAIFileSystemError(
          `No space left on device: ${dirPath}`,
          'mkdir',
          dirPath,
          systemError
        )
      default:
        throw new ReadyAIFileSystemError(
          `Failed to create directory: ${systemError.message}`,
          'mkdir',
          dirPath,
          systemError
        )
    }
  }
}

/**
 * List directory contents with optional filtering and sorting
 * 
 * @param dirPath - Directory path to list
 * @param options - Listing options
 * @returns Promise resolving to array of directory entries
 */
export interface DirectoryEntry {
  name: string
  path: string
  isFile: boolean
  isDirectory: boolean
  size: number
  modifiedAt: Date
  extension: string
}

export interface ListDirectoryOptions {
  recursive?: boolean
  includeHidden?: boolean
  fileExtensions?: string[]
  excludeExtensions?: string[]
  sortBy?: 'name' | 'size' | 'modified'
  sortOrder?: 'asc' | 'desc'
}

export async function listDirectory(
  dirPath: string,
  options: ListDirectoryOptions = {}
): Promise<DirectoryEntry[]> {
  const {
    recursive = false,
    includeHidden = false,
    fileExtensions = [],
    excludeExtensions = [],
    sortBy = 'name',
    sortOrder = 'asc'
  } = options

  try {
    const normalizedPath = normalizePath(dirPath)
    
    if (!await directoryExistsAtPath(normalizedPath)) {
      throw new ReadyAIFileSystemError(
        `Directory not found: ${normalizedPath}`,
        'list',
        normalizedPath
      )
    }

    const entries: DirectoryEntry[] = []
    
    const processDirectory = async (currentDir: string) => {
      const items = await fs.readdir(currentDir)
      
      for (const item of items) {
        // Skip hidden files if not requested
        if (!includeHidden && item.startsWith('.')) {
          continue
        }

        const itemPath = path.join(currentDir, item)
        const stats = await fs.stat(itemPath)
        const extension = path.extname(item).toLowerCase()

        // Apply extension filtering
        if (fileExtensions.length > 0 && !fileExtensions.includes(extension)) {
          continue
        }
        if (excludeExtensions.length > 0 && excludeExtensions.includes(extension)) {
          continue
        }

        const entry: DirectoryEntry = {
          name: item,
          path: itemPath,
          isFile: stats.isFile(),
          isDirectory: stats.isDirectory(),
          size: stats.size,
          modifiedAt: stats.mtime,
          extension
        }

        entries.push(entry)

        // Recurse into subdirectories if requested
        if (recursive && stats.isDirectory()) {
          await processDirectory(itemPath)
        }
      }
    }

    await processDirectory(normalizedPath)

    // Sort results
    entries.sort((a, b) => {
      let comparison = 0
      
      switch (sortBy) {
        case 'size':
          comparison = a.size - b.size
          break
        case 'modified':
          comparison = a.modifiedAt.getTime() - b.modifiedAt.getTime()
          break
        case 'name':
        default:
          comparison = a.name.localeCompare(b.name)
          break
      }
      
      return sortOrder === 'desc' ? -comparison : comparison
    })

    return entries
    
  } catch (error) {
    if (error instanceof ReadyAIFileSystemError) {
      throw error
    }
    
    const systemError = error as NodeJS.ErrnoException
    throw new ReadyAIFileSystemError(
      `Failed to list directory: ${systemError.message}`,
      'list',
      dirPath,
      systemError
    )
  }
}

// =============================================================================
// READYAI-SPECIFIC OPERATIONS
// =============================================================================

/**
 * Get the ReadyAI project root directory
 * Searches up the directory tree for ReadyAI configuration files
 * 
 * @param startPath - Starting directory (default: current working directory)
 * @returns Promise resolving to project root path or null if not found
 */
export async function getReadyAIProjectRoot(startPath?: string): Promise<string | null> {
  const searchPath = startPath || process.cwd()
  let currentPath = normalizePath(searchPath)
  
  const configFiles = [
    READYAI_FILE_NAMES.projectConfig,
    READYAI_FILE_NAMES.readyAIRules,
    'package.json' // Fallback for Node.js projects
  ]

  // Search up the directory tree
  while (true) {
    // Check for any ReadyAI configuration file
    for (const configFile of configFiles) {
      const configPath = path.join(currentPath, configFile)
      if (await fileExistsAtPath(configPath)) {
        return currentPath
      }
    }

    const parentPath = path.dirname(currentPath)
    
    // If we've reached the root or can't go further up
    if (parentPath === currentPath) {
      break
    }
    
    currentPath = parentPath
  }

  return null
}

/**
 * Ensure ReadyAI project directory structure exists
 * Creates the standard ReadyAI directory layout
 * 
 * @param projectRoot - Root directory of the ReadyAI project
 * @returns Promise resolving to created directory paths
 */
export async function ensureReadyAIProjectStructure(projectRoot: string): Promise<string[]> {
  const normalizedRoot = normalizePath(projectRoot)
  
  const standardDirs = [
    '.readyai',
    '.readyai/phases',
    '.readyai/context',
    '.readyai/artifacts',
    '.readyai/validation',
    '.readyai/metrics',
    '.readyai/cache',
    '.readyai/logs'
  ]

  const createdDirs: string[] = []
  
  for (const dir of standardDirs) {
    const dirPath = path.join(normalizedRoot, dir)
    await ensureDirectoryExists(dirPath)
    createdDirs.push(dirPath)
  }

  return createdDirs
}

/**
 * Create a backup file with timestamp
 * Follows Cline's backup patterns with ReadyAI naming conventions
 * 
 * @param filePath - Original file path
 * @returns Promise resolving to backup file path
 */
export async function createBackupFile(filePath: string): Promise<string> {
  const normalizedPath = normalizePath(filePath)
  
  if (!await fileExistsAtPath(normalizedPath)) {
    throw ReadyAIFileSystemError.fileNotFound(normalizedPath, 'backup')
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const extension = path.extname(normalizedPath)
  const baseName = path.basename(normalizedPath, extension)
  const dirName = path.dirname(normalizedPath)
  
  const backupPath = path.join(dirName, `${baseName}.backup-${timestamp}${extension}`)
  
  try {
    const content = await readFileContent(normalizedPath)
    await writeFileContent(backupPath, content, { createBackup: false })
    return backupPath
  } catch (error) {
    throw new ReadyAIFileSystemError(
      `Failed to create backup: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'backup',
      normalizedPath,
      error instanceof Error ? error : undefined
    )
  }
}

/**
 * Clean up old backup files based on age and count limits
 * 
 * @param dirPath - Directory to clean
 * @param options - Cleanup options
 * @returns Promise resolving to number of files cleaned up
 */
export interface BackupCleanupOptions {
  maxAge?: number // Maximum age in milliseconds
  maxCount?: number // Maximum number of backup files to keep
  pattern?: RegExp // Pattern to match backup files
}

export async function cleanupBackupFiles(
  dirPath: string,
  options: BackupCleanupOptions = {}
): Promise<number> {
  const {
    maxAge = 7 * 24 * 60 * 60 * 1000, // 7 days default
    maxCount = 10,
    pattern = /\.backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/
  } = options

  try {
    const entries = await listDirectory(dirPath, {
      includeHidden: false,
      sortBy: 'modified',
      sortOrder: 'desc'
    })

    const backupFiles = entries.filter(entry => 
      entry.isFile && pattern.test(entry.name)
    )

    const now = Date.now()
    let cleanedCount = 0

    // Remove files older than maxAge
    for (const file of backupFiles) {
      const age = now - file.modifiedAt.getTime()
      if (age > maxAge) {
        await fs.unlink(file.path)
        cleanedCount++
      }
    }

    // Remove excess files beyond maxCount (keeping newest)
    const remainingFiles = backupFiles.filter(file => {
      const age = now - file.modifiedAt.getTime()
      return age <= maxAge
    })

    if (remainingFiles.length > maxCount) {
      const excessFiles = remainingFiles.slice(maxCount)
      for (const file of excessFiles) {
        await fs.unlink(file.path)
        cleanedCount++
      }
    }

    return cleanedCount
    
  } catch (error) {
    throw new ReadyAIFileSystemError(
      `Failed to cleanup backup files: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'cleanup',
      dirPath,
      error instanceof Error ? error : undefined
    )
  }
}

// =============================================================================
// CONTENT PROCESSING UTILITIES
// =============================================================================

/**
 * Determine if a file is likely binary based on extension and content
 * 
 * @param filePath - Path to the file
 * @returns Promise resolving to boolean indicating if file is binary
 */
export async function isBinaryFile(filePath: string): Promise<boolean> {
  const extension = path.extname(filePath).toLowerCase()
  
  // Check known binary extensions
  if (BINARY_FILE_EXTENSIONS.includes(extension as any)) {
    return true
  }
  
  // Check known text extensions
  if (TEXT_FILE_EXTENSIONS.includes(extension as any)) {
    return false
  }
  
  // For unknown extensions, check file content
  try {
    const buffer = await fs.readFile(filePath, { encoding: null })
    
    // Check for null bytes which indicate binary content
    for (let i = 0; i < Math.min(buffer.length, 1024); i++) {
      if (buffer[i] === 0) {
        return true
      }
    }
    
    return false
  } catch {
    // If we can't read the file, assume it's binary for safety
    return true
  }
}

/**
 * Extract metadata from file content (for supported formats)
 * 
 * @param filePath - Path to the file
 * @returns Promise resolving to metadata object
 */
export interface FileMetadata {
  encoding?: string
  lineCount?: number
  wordCount?: number
  characterCount?: number
  language?: string
  hasShebang?: boolean
  shebangLine?: string
}

export async function extractFileMetadata(filePath: string): Promise<FileMetadata> {
  try {
    const content = await readFileContent(filePath)
    const lines = content.split('\n')
    const words = content.split(/\s+/).filter(word => word.length > 0)
    
    const metadata: FileMetadata = {
      encoding: 'utf8',
      lineCount: lines.length,
      wordCount: words.length,
      characterCount: content.length
    }

    // Check for shebang
    if (lines[0] && lines[0].startsWith('#!')) {
      metadata.hasShebang = true
      metadata.shebangLine = lines[0]
    }

    // Basic language detection based on file extension
    const extension = path.extname(filePath).toLowerCase()
    const languageMap: Record<string, string> = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.jsx': 'jsx',
      '.tsx': 'tsx',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.cs': 'csharp',
      '.php': 'php',
      '.rb': 'ruby',
      '.go': 'go',
      '.rs': 'rust',
      '.swift': 'swift',
      '.kt': 'kotlin'
    }

    if (languageMap[extension]) {
      metadata.language = languageMap[extension]
    }

    return metadata
    
  } catch (error) {
    throw new ReadyAIFileSystemError(
      `Failed to extract metadata: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'metadata',
      filePath,
      error instanceof Error ? error : undefined
    )
  }
}

// =============================================================================
// WORKSPACE INTEGRATION
// =============================================================================

/**
 * Get workspace-relative path for better user experience
 * Integrates with ReadyAI's workspace management
 * 
 * @param absolutePath - Absolute file path
 * @param workspaceRoot - Workspace root directory (optional)
 * @returns Workspace-relative path or absolute path if not in workspace
 */
export async function getWorkspaceRelativePath(
  absolutePath: string, 
  workspaceRoot?: string
): Promise<string> {
  const projectRoot = workspaceRoot || await getReadyAIProjectRoot()
  
  if (!projectRoot) {
    return absolutePath
  }

  const normalizedAbsolute = normalizePath(absolutePath)
  const normalizedRoot = normalizePath(projectRoot)
  
  if (normalizedAbsolute.startsWith(normalizedRoot)) {
    return path.relative(normalizedRoot, normalizedAbsolute)
  }
  
  return absolutePath
}

/**
 * Resolve workspace path with multi-workspace support
 * Adapts Cline's workspace resolution with ReadyAI extensions
 * 
 * @param relativePath - Relative path within workspace
 * @param workspaceRoot - Optional workspace root override
 * @returns Resolved absolute path
 */
export async function resolveWorkspaceFilePath(
  relativePath: string,
  workspaceRoot?: string
): Promise<string> {
  const projectRoot = workspaceRoot || await getReadyAIProjectRoot() || process.cwd()
  return path.resolve(projectRoot, relativePath)
}

// =============================================================================
// EXPORTS AND VERSION INFO
// =============================================================================

/**
 * Version information for the fs utilities module
 */
export const FS_UTILS_VERSION = '1.0.0'

/**
 * Feature flags for optional functionality
 */
export const FEATURE_FLAGS = {
  BACKUP_ENABLED: true,
  METADATA_EXTRACTION: true,
  WORKSPACE_INTEGRATION: true,
  BINARY_DETECTION: true
} as const

/**
 * Module initialization function
 * Sets up any required global state or configuration
 */
export function initializeFSUtils(): void {
  // Any initialization logic would go here
  // Currently no global state needs initialization
}

// Re-export path utilities for convenience
export {
  arePathsEqual,
  getReadablePath,
  isLocatedInWorkspace,
  normalizePath,
  resolveWorkspacePath
} from './path'
