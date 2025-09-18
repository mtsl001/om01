/**
 * Path utilities for ReadyAI Personal AI Development Orchestrator
 * 
 * Direct extract from Cline's proven path handling patterns with ReadyAI-specific
 * project path conventions. Provides comprehensive cross-platform path operations,
 * workspace management, and ReadyAI project structure support.
 * 
 * Based on Cline's src/utils/path.ts with ReadyAI project conventions
 */

import * as path from 'path'
import * as fs from 'fs'
import { promisify } from 'util'
import { UUID, ReadyAIError } from '../types/core'

// Async file system operations
const stat = promisify(fs.stat)
const access = promisify(fs.access)
const readdir = promisify(fs.readdir)

// =============================================================================
// CONSTANTS AND CONFIGURATION
// =============================================================================

/**
 * ReadyAI project structure constants
 * Defines the standard directory structure for ReadyAI projects
 */
export const READYAI_PROJECT_STRUCTURE = {
  // Core directories
  SRC: 'src',
  DOCS: 'docs',
  TESTS: 'tests',
  CONFIG: 'config',
  SCRIPTS: 'scripts',
  
  // ReadyAI specific directories
  PHASES: '.readyai/phases',
  CONTEXT: '.readyai/context',
  ARTIFACTS: '.readyai/artifacts',
  TEMPLATES: '.readyai/templates',
  CHECKPOINTS: '.readyai/checkpoints',
  
  // Generated content
  GENERATED: 'generated',
  TEMP: '.readyai/temp',
  
  // Configuration files
  CONFIG_FILE: 'readyai.config.json',
  PROJECT_MANIFEST: '.readyai/manifest.json',
  CONTEXT_INDEX: '.readyai/context/index.json'
} as const

/**
 * File extensions commonly used in ReadyAI projects
 */
export const READYAI_FILE_EXTENSIONS = {
  // Source files
  TYPESCRIPT: ['.ts', '.tsx'],
  JAVASCRIPT: ['.js', '.jsx', '.mjs'],
  PYTHON: ['.py', '.pyi'],
  
  // Configuration
  CONFIG: ['.json', '.yaml', '.yml', '.toml'],
  
  // Documentation
  DOCS: ['.md', '.mdx', '.txt'],
  
  // Templates
  TEMPLATES: ['.template', '.tmpl'],
  
  // ReadyAI specific
  PHASE_ARTIFACT: ['.phase.json'],
  CONTEXT_NODE: ['.context.json'],
  CHECKPOINT: ['.checkpoint.json']
} as const

/**
 * Platform-specific path separators and configurations
 */
export const PATH_CONFIG = {
  SEPARATOR: path.sep,
  DELIMITER: path.delimiter,
  IS_WINDOWS: process.platform === 'win32',
  IS_POSIX: path.posix === path,
  MAX_PATH_LENGTH: process.platform === 'win32' ? 260 : 4096
} as const

// =============================================================================
// CORE PATH OPERATIONS
// =============================================================================

/**
 * Normalize a file path for cross-platform compatibility
 * Handles Windows/POSIX differences and ensures consistent separators
 * 
 * @param filePath - The path to normalize
 * @returns Normalized path string
 */
export function normalizePath(filePath: string): string {
  if (!filePath) {
    throw new ReadyAIError('Path cannot be empty', 'INVALID_PATH')
  }
  
  // Convert to platform-specific separators and resolve relative components
  return path.resolve(path.normalize(filePath))
}

/**
 * Join multiple path segments with proper separator handling
 * Ensures cross-platform compatibility and handles edge cases
 * 
 * @param segments - Path segments to join
 * @returns Joined path string
 */
export function joinPaths(...segments: string[]): string {
  if (segments.length === 0) {
    throw new ReadyAIError('At least one path segment is required', 'INVALID_PATH')
  }
  
  // Filter out empty segments and join
  const validSegments = segments.filter(segment => segment && segment.trim() !== '')
  
  if (validSegments.length === 0) {
    throw new ReadyAIError('All path segments are empty', 'INVALID_PATH')
  }
  
  return path.join(...validSegments)
}

/**
 * Get relative path from source to target
 * Handles cross-platform path resolution with error checking
 * 
 * @param from - Source path
 * @param to - Target path
 * @returns Relative path from source to target
 */
export function getRelativePath(from: string, to: string): string {
  if (!from || !to) {
    throw new ReadyAIError('Both from and to paths are required', 'INVALID_PATH')
  }
  
  try {
    const normalizedFrom = normalizePath(from)
    const normalizedTo = normalizePath(to)
    return path.relative(normalizedFrom, normalizedTo)
  } catch (error) {
    throw new ReadyAIError(
      `Failed to calculate relative path: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'PATH_CALCULATION_ERROR'
    )
  }
}

/**
 * Get the absolute path, resolving relative paths from a base directory
 * 
 * @param filePath - Path to resolve (absolute or relative)
 * @param baseDir - Base directory for relative path resolution
 * @returns Absolute path
 */
export function getAbsolutePath(filePath: string, baseDir?: string): string {
  if (!filePath) {
    throw new ReadyAIError('File path is required', 'INVALID_PATH')
  }
  
  if (path.isAbsolute(filePath)) {
    return normalizePath(filePath)
  }
  
  const base = baseDir ? normalizePath(baseDir) : process.cwd()
  return path.resolve(base, filePath)
}

/**
 * Extract directory, filename, and extension from a file path
 * 
 * @param filePath - Full file path
 * @returns Object containing path components
 */
export function parseFilePath(filePath: string): {
  dir: string
  base: string
  name: string
  ext: string
  root: string
} {
  if (!filePath) {
    throw new ReadyAIError('File path is required', 'INVALID_PATH')
  }
  
  const parsed = path.parse(normalizePath(filePath))
  return {
    dir: parsed.dir,
    base: parsed.base,
    name: parsed.name,
    ext: parsed.ext,
    root: parsed.root
  }
}

// =============================================================================
// FILE SYSTEM VALIDATION
// =============================================================================

/**
 * Check if a path exists and return its type
 * 
 * @param filePath - Path to check
 * @returns Promise resolving to path type or null if not exists
 */
export async function getPathType(filePath: string): Promise<'file' | 'directory' | null> {
  if (!filePath) {
    return null
  }
  
  try {
    const normalizedPath = normalizePath(filePath)
    const stats = await stat(normalizedPath)
    
    if (stats.isFile()) {
      return 'file'
    } else if (stats.isDirectory()) {
      return 'directory'
    } else {
      return null
    }
  } catch {
    return null
  }
}

/**
 * Check if a file exists and is accessible
 * 
 * @param filePath - Path to check
 * @param mode - Access mode to check (default: read access)
 * @returns Promise resolving to true if accessible
 */
export async function isAccessible(filePath: string, mode: number = fs.constants.R_OK): Promise<boolean> {
  if (!filePath) {
    return false
  }
  
  try {
    const normalizedPath = normalizePath(filePath)
    await access(normalizedPath, mode)
    return true
  } catch {
    return false
  }
}

/**
 * Check if path is within a given directory (prevents path traversal)
 * 
 * @param filePath - Path to check
 * @param baseDir - Base directory that should contain the path
 * @returns True if path is within base directory
 */
export function isWithinDirectory(filePath: string, baseDir: string): boolean {
  if (!filePath || !baseDir) {
    return false
  }
  
  try {
    const absoluteBase = normalizePath(baseDir)
    const absolutePath = normalizePath(filePath)
    const relativePath = path.relative(absoluteBase, absolutePath)
    
    // If relative path starts with '..' or is absolute, it's outside the base
    return !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
  } catch {
    return false
  }
}

/**
 * Validate path length against platform limits
 * 
 * @param filePath - Path to validate
 * @returns True if path length is within limits
 */
export function isValidPathLength(filePath: string): boolean {
  if (!filePath) {
    return false
  }
  
  return filePath.length <= PATH_CONFIG.MAX_PATH_LENGTH
}

// =============================================================================
// READYAI PROJECT PATH UTILITIES
// =============================================================================

/**
 * Create standard ReadyAI project directory structure
 * 
 * @param projectRoot - Root directory of the project
 * @returns Promise resolving to created directory paths
 */
export async function createReadyAIStructure(projectRoot: string): Promise<string[]> {
  if (!projectRoot) {
    throw new ReadyAIError('Project root is required', 'INVALID_PATH')
  }
  
  const normalizedRoot = normalizePath(projectRoot)
  const createdDirs: string[] = []
  
  // Define directories to create
  const dirsToCreate = [
    READYAI_PROJECT_STRUCTURE.PHASES,
    READYAI_PROJECT_STRUCTURE.CONTEXT,
    READYAI_PROJECT_STRUCTURE.ARTIFACTS,
    READYAI_PROJECT_STRUCTURE.TEMPLATES,
    READYAI_PROJECT_STRUCTURE.CHECKPOINTS,
    READYAI_PROJECT_STRUCTURE.TEMP
  ]
  
  for (const dir of dirsToCreate) {
    const fullPath = joinPaths(normalizedRoot, dir)
    
    try {
      await fs.promises.mkdir(fullPath, { recursive: true })
      createdDirs.push(fullPath)
    } catch (error) {
      throw new ReadyAIError(
        `Failed to create directory ${fullPath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DIRECTORY_CREATION_ERROR'
      )
    }
  }
  
  return createdDirs
}

/**
 * Get ReadyAI-specific paths for a project
 * 
 * @param projectRoot - Root directory of the project
 * @returns Object containing ReadyAI-specific paths
 */
export function getReadyAIPaths(projectRoot: string): {
  root: string
  phases: string
  context: string
  artifacts: string
  templates: string
  checkpoints: string
  temp: string
  configFile: string
  manifest: string
  contextIndex: string
} {
  if (!projectRoot) {
    throw new ReadyAIError('Project root is required', 'INVALID_PATH')
  }
  
  const root = normalizePath(projectRoot)
  
  return {
    root,
    phases: joinPaths(root, READYAI_PROJECT_STRUCTURE.PHASES),
    context: joinPaths(root, READYAI_PROJECT_STRUCTURE.CONTEXT),
    artifacts: joinPaths(root, READYAI_PROJECT_STRUCTURE.ARTIFACTS),
    templates: joinPaths(root, READYAI_PROJECT_STRUCTURE.TEMPLATES),
    checkpoints: joinPaths(root, READYAI_PROJECT_STRUCTURE.CHECKPOINTS),
    temp: joinPaths(root, READYAI_PROJECT_STRUCTURE.TEMP),
    configFile: joinPaths(root, READYAI_PROJECT_STRUCTURE.CONFIG_FILE),
    manifest: joinPaths(root, READYAI_PROJECT_STRUCTURE.PROJECT_MANIFEST),
    contextIndex: joinPaths(root, READYAI_PROJECT_STRUCTURE.CONTEXT_INDEX)
  }
}

/**
 * Get path for a specific phase artifact
 * 
 * @param projectRoot - Root directory of the project
 * @param phaseId - Phase identifier
 * @param artifactName - Name of the artifact
 * @returns Full path to phase artifact
 */
export function getPhaseArtifactPath(projectRoot: string, phaseId: string, artifactName: string): string {
  if (!projectRoot || !phaseId || !artifactName) {
    throw new ReadyAIError('Project root, phase ID, and artifact name are required', 'INVALID_PATH')
  }
  
  const paths = getReadyAIPaths(projectRoot)
  return joinPaths(paths.phases, phaseId, `${artifactName}.phase.json`)
}

/**
 * Get path for a context node
 * 
 * @param projectRoot - Root directory of the project
 * @param contextId - Context node identifier
 * @returns Full path to context node file
 */
export function getContextNodePath(projectRoot: string, contextId: UUID): string {
  if (!projectRoot || !contextId) {
    throw new ReadyAIError('Project root and context ID are required', 'INVALID_PATH')
  }
  
  const paths = getReadyAIPaths(projectRoot)
  return joinPaths(paths.context, `${contextId}.context.json`)
}

/**
 * Get path for a checkpoint
 * 
 * @param projectRoot - Root directory of the project
 * @param checkpointId - Checkpoint identifier
 * @returns Full path to checkpoint file
 */
export function getCheckpointPath(projectRoot: string, checkpointId: string): string {
  if (!projectRoot || !checkpointId) {
    throw new ReadyAIError('Project root and checkpoint ID are required', 'INVALID_PATH')
  }
  
  const paths = getReadyAIPaths(projectRoot)
  return joinPaths(paths.checkpoints, `${checkpointId}.checkpoint.json`)
}

// =============================================================================
// FILE FILTERING AND MATCHING
// =============================================================================

/**
 * Check if file has one of the specified extensions
 * 
 * @param filePath - Path to check
 * @param extensions - Array of extensions to match against
 * @returns True if file has matching extension
 */
export function hasExtension(filePath: string, extensions: readonly string[]): boolean {
  if (!filePath || !extensions || extensions.length === 0) {
    return false
  }
  
  const parsed = parseFilePath(filePath)
  return extensions.includes(parsed.ext.toLowerCase())
}

/**
 * Check if file is a source code file based on ReadyAI conventions
 * 
 * @param filePath - Path to check
 * @returns True if file is considered source code
 */
export function isSourceFile(filePath: string): boolean {
  if (!filePath) {
    return false
  }
  
  const sourceExtensions = [
    ...READYAI_FILE_EXTENSIONS.TYPESCRIPT,
    ...READYAI_FILE_EXTENSIONS.JAVASCRIPT,
    ...READYAI_FILE_EXTENSIONS.PYTHON
  ]
  
  return hasExtension(filePath, sourceExtensions)
}

/**
 * Check if file is a ReadyAI-specific file
 * 
 * @param filePath - Path to check
 * @returns True if file is ReadyAI-specific
 */
export function isReadyAIFile(filePath: string): boolean {
  if (!filePath) {
    return false
  }
  
  // Check if file is in ReadyAI directory
  if (filePath.includes('.readyai')) {
    return true
  }
  
  // Check for ReadyAI-specific extensions
  const readyAIExtensions = [
    ...READYAI_FILE_EXTENSIONS.PHASE_ARTIFACT,
    ...READYAI_FILE_EXTENSIONS.CONTEXT_NODE,
    ...READYAI_FILE_EXTENSIONS.CHECKPOINT
  ]
  
  return hasExtension(filePath, readyAIExtensions) || 
         parseFilePath(filePath).base === READYAI_PROJECT_STRUCTURE.CONFIG_FILE
}

/**
 * Filter files based on ReadyAI project conventions
 * 
 * @param files - Array of file paths to filter
 * @param options - Filtering options
 * @returns Filtered array of file paths
 */
export function filterProjectFiles(
  files: string[], 
  options: {
    includeSource?: boolean
    includeConfig?: boolean
    includeDocs?: boolean
    includeReadyAI?: boolean
    excludePatterns?: RegExp[]
  } = {}
): string[] {
  const {
    includeSource = true,
    includeConfig = true,
    includeDocs = true,
    includeReadyAI = false,
    excludePatterns = []
  } = options
  
  return files.filter(filePath => {
    // Apply exclude patterns first
    for (const pattern of excludePatterns) {
      if (pattern.test(filePath)) {
        return false
      }
    }
    
    // Check inclusion criteria
    if (includeReadyAI && isReadyAIFile(filePath)) {
      return true
    }
    
    if (includeSource && isSourceFile(filePath)) {
      return true
    }
    
    if (includeConfig && hasExtension(filePath, READYAI_FILE_EXTENSIONS.CONFIG)) {
      return true
    }
    
    if (includeDocs && hasExtension(filePath, READYAI_FILE_EXTENSIONS.DOCS)) {
      return true
    }
    
    return false
  })
}

// =============================================================================
// PATH MANIPULATION UTILITIES
// =============================================================================

/**
 * Convert file path to URL-safe string
 * 
 * @param filePath - Path to convert
 * @returns URL-safe path string
 */
export function pathToUrlSafe(filePath: string): string {
  if (!filePath) {
    return ''
  }
  
  return normalizePath(filePath)
    .replace(/\\/g, '/')  // Convert Windows separators
    .replace(/[^a-zA-Z0-9\-_.~/]/g, '_')  // Replace invalid URL characters
}

/**
 * Generate unique temporary file path
 * 
 * @param projectRoot - Project root directory
 * @param prefix - Optional filename prefix
 * @param extension - Optional file extension
 * @returns Unique temporary file path
 */
export function getTempFilePath(projectRoot: string, prefix?: string, extension?: string): string {
  if (!projectRoot) {
    throw new ReadyAIError('Project root is required', 'INVALID_PATH')
  }
  
  const paths = getReadyAIPaths(projectRoot)
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  
  const filename = [
    prefix || 'temp',
    timestamp,
    random
  ].join('_') + (extension || '.tmp')
  
  return joinPaths(paths.temp, filename)
}

/**
 * Clean and validate user-provided path input
 * 
 * @param userPath - User-provided path
 * @param options - Validation options
 * @returns Cleaned and validated path
 */
export function sanitizePath(userPath: string, options: {
  allowAbsolute?: boolean
  maxLength?: number
  baseDir?: string
} = {}): string {
  const {
    allowAbsolute = true,
    maxLength = PATH_CONFIG.MAX_PATH_LENGTH,
    baseDir
  } = options
  
  if (!userPath || typeof userPath !== 'string') {
    throw new ReadyAIError('Valid path string is required', 'INVALID_PATH')
  }
  
  // Remove leading/trailing whitespace
  let cleaned = userPath.trim()
  
  // Check for dangerous patterns
  const dangerousPatterns = [
    /\.\./,  // Path traversal
    /[<>:"|?*]/,  // Invalid characters
    /\0/,  // Null bytes
  ]
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(cleaned)) {
      throw new ReadyAIError('Path contains invalid characters or patterns', 'INVALID_PATH')
    }
  }
  
  // Normalize the path
  try {
    if (path.isAbsolute(cleaned)) {
      if (!allowAbsolute) {
        throw new ReadyAIError('Absolute paths are not allowed', 'INVALID_PATH')
      }
      cleaned = normalizePath(cleaned)
    } else {
      cleaned = baseDir ? getAbsolutePath(cleaned, baseDir) : normalizePath(cleaned)
    }
  } catch {
    throw new ReadyAIError('Invalid path format', 'INVALID_PATH')
  }
  
  // Check length limits
  if (cleaned.length > maxLength) {
    throw new ReadyAIError(`Path exceeds maximum length of ${maxLength} characters`, 'PATH_TOO_LONG')
  }
  
  // Validate path is within base directory if specified
  if (baseDir && !isWithinDirectory(cleaned, baseDir)) {
    throw new ReadyAIError('Path is outside allowed directory', 'PATH_OUTSIDE_BASE')
  }
  
  return cleaned
}

// =============================================================================
// EXPORTS AND MODULE INFO
// =============================================================================

/**
 * Module version for compatibility tracking
 */
export const PATH_UTILS_VERSION = '1.0.0'

/**
 * Default export containing all path utilities
 */
export default {
  // Core operations
  normalizePath,
  joinPaths,
  getRelativePath,
  getAbsolutePath,
  parseFilePath,
  
  // Validation
  getPathType,
  isAccessible,
  isWithinDirectory,
  isValidPathLength,
  
  // ReadyAI specific
  createReadyAIStructure,
  getReadyAIPaths,
  getPhaseArtifactPath,
  getContextNodePath,
  getCheckpointPath,
  
  // File filtering
  hasExtension,
  isSourceFile,
  isReadyAIFile,
  filterProjectFiles,
  
  // Utilities
  pathToUrlSafe,
  getTempFilePath,
  sanitizePath,
  
  // Constants
  READYAI_PROJECT_STRUCTURE,
  READYAI_FILE_EXTENSIONS,
  PATH_CONFIG,
  PATH_UTILS_VERSION
}
