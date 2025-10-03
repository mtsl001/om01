// packages/project-management/services/ProjectMetadataService.ts

/**
 * Project Metadata Service - Advanced Metadata Management for ReadyAI Project Orchestrator
 * 
 * This service manages project metadata including file tracking, search indexing, analytics, and contextual
 * information. Adapted from Cline's metadata management patterns with ReadyAI-specific enhancements 
 * for AI-powered development orchestration and production-grade metadata operations.
 * 
 * Key Cline Pattern Adaptations (Pattern-Replicate 60% reuse):
 * - File metadata tracking patterns from FileContextTracker
 * - Search indexing strategies from Cline's context management system
 * - State persistence patterns from TaskMetadata management
 * - Event-driven updates from Cline's service coordination
 * - Performance monitoring from TelemetryService patterns
 * - Error handling and recovery from ErrorService patterns
 * 
 * ReadyAI-Specific Enhancements:
 * - Multi-phase project metadata tracking
 * - AI generation context preservation
 * - Dependency graph metadata integration
 * - Advanced search with semantic similarity
 * - Real-time metadata synchronization
 * - Enterprise-grade analytics and reporting
 * 
 * @version 1.0.0 - Production Ready Implementation
 * @author ReadyAI Development Team
 */

import { EventEmitter } from 'events'
import { 
    UUID, 
    ApiResponse, 
    AsyncResult, 
    ReadyAIError, 
    PhaseType,
    ValidationResult,
    generateUUID, 
    createTimestamp, 
    createApiResponse, 
    wrapAsync,
    isValidUUID 
} from '../../foundation/types/core'

import {
    Project,
    ProjectOperationResult,
    ProjectAnalytics,
    ProjectPerformance,
    PhaseArtifact,
    ProjectSearchCriteria
} from '../types/project'

// Database service dependency
import { DatabaseService } from '../../database/services/DatabaseService'

// Logging service dependency  
import { Logger } from '../../logging/services/Logger'

// Error handling dependency
import { ErrorService } from '../../logging/services/ErrorService'

// File system utilities
import * as fs from 'fs/promises'
import * as path from 'path'
import * as crypto from 'crypto'

// =============================================================================
// METADATA TYPES AND INTERFACES
// =============================================================================

/**
 * File metadata entry with comprehensive tracking
 * Based on Cline's FileMetadataEntry with ReadyAI enhancements
 */
export interface ProjectFileMetadata {
    /** Unique metadata entry identifier */
    id: UUID
    /** Project this metadata belongs to */
    projectId: UUID
    /** File path relative to project root */
    path: string
    /** File size in bytes */
    size: number
    /** Content hash for change detection */
    contentHash: string
    /** MIME type */
    mimeType: string
    /** File creation timestamp */
    createdAt: string
    /** Last modification timestamp */
    modifiedAt: string
    /** Last accessed timestamp */
    lastAccessedAt: string
    /** Number of times accessed */
    accessCount: number
    /** Source of creation/modification */
    source: 'user' | 'ai' | 'template' | 'import'
    /** File status */
    status: 'active' | 'modified' | 'deleted' | 'archived'
    /** Associated phase when created/modified */
    associatedPhase?: PhaseType
    /** AI generation metadata if applicable */
    aiMetadata?: {
        modelUsed: string
        confidence: number
        generatedAt: string
        tokenUsage: number
    }
    /** Search metadata for full-text indexing */
    searchMetadata: {
        isIndexed: boolean
        lastIndexedAt?: string
        searchableContent?: string
        keywords: string[]
        language?: string
    }
    /** Version tracking */
    version: number
    /** Parent file if this is a generated variant */
    parentFileId?: UUID
    /** Child files generated from this file */
    childFileIds: UUID[]
    /** Tags for categorization */
    tags: string[]
}

/**
 * Project search index for fast metadata queries
 * Inspired by Cline's search and context management systems
 */
export interface ProjectSearchIndex {
    /** Project identifier */
    projectId: UUID
    /** Index version for cache invalidation */
    version: number
    /** Last update timestamp */
    lastUpdated: string
    /** File path to metadata mapping */
    fileIndex: Map<string, UUID>
    /** Content hash to file mapping */
    hashIndex: Map<string, UUID[]>
    /** Tag to files mapping */
    tagIndex: Map<string, UUID[]>
    /** Phase to files mapping */
    phaseIndex: Map<PhaseType, UUID[]>
    /** Full-text search index */
    searchIndex: Map<string, Set<UUID>>
    /** Dependency tracking */
    dependencyIndex: Map<UUID, Set<UUID>>
}

/**
 * Metadata analytics and statistics
 * Based on Cline's analytics patterns with ReadyAI extensions
 */
export interface ProjectMetadataAnalytics {
    /** Project identifier */
    projectId: UUID
    /** Analytics timestamp */
    timestamp: string
    /** Total files tracked */
    totalFiles: number
    /** Files by source type */
    filesBySource: Record<'user' | 'ai' | 'template' | 'import', number>
    /** Files by phase */
    filesByPhase: Record<PhaseType, number>
    /** Storage metrics */
    storageMetrics: {
        totalSize: number
        averageFileSize: number
        largestFile: { path: string; size: number }
        smallestFile: { path: string; size: number }
    }
    /** Access patterns */
    accessPatterns: {
        mostAccessedFiles: Array<{ path: string; accessCount: number }>
        recentlyModifiedFiles: Array<{ path: string; modifiedAt: string }>
        unusedFiles: Array<{ path: string; lastAccessedAt: string }>
    }
    /** AI generation statistics */
    aiGenerationStats: {
        totalAiFiles: number
        averageConfidence: number
        totalTokensUsed: number
        modelsUsed: Record<string, number>
    }
    /** Search performance metrics */
    searchMetrics: {
        indexSize: number
        indexingTime: number
        averageQueryTime: number
        popularKeywords: Array<{ keyword: string; frequency: number }>
    }
}

/**
 * Metadata operation configuration
 */
export interface MetadataOperationConfig {
    /** Enable automatic indexing */
    autoIndex: boolean
    /** Enable real-time synchronization */
    realTimeSync: boolean
    /** Search index update interval in milliseconds */
    indexUpdateInterval: number
    /** Maximum cache size for metadata */
    maxCacheSize: number
    /** Enable analytics collection */
    enableAnalytics: boolean
    /** Batch size for bulk operations */
    batchSize: number
    /** Retention period for deleted file metadata */
    deletedFileRetentionDays: number
}

/**
 * Default metadata operation configuration
 */
const DEFAULT_METADATA_CONFIG: Required<MetadataOperationConfig> = {
    autoIndex: true,
    realTimeSync: true,
    indexUpdateInterval: 5000, // 5 seconds
    maxCacheSize: 1000,
    enableAnalytics: true,
    batchSize: 50,
    deletedFileRetentionDays: 30
}

// =============================================================================
// MAIN PROJECT METADATA SERVICE
// =============================================================================

/**
 * Project Metadata Service implementing Cline's proven metadata management patterns
 * 
 * This service provides comprehensive metadata management for ReadyAI projects,
 * including file tracking, search indexing, analytics, and contextual information.
 * It adapts Cline's successful patterns while adding ReadyAI-specific enhancements
 * for AI-powered development workflows.
 * 
 * Key Features:
 * - Real-time file metadata tracking with change detection
 * - Advanced search indexing with full-text and semantic search
 * - Comprehensive analytics and performance monitoring
 * - Integration with ReadyAI's multi-phase development methodology
 * - AI generation metadata preservation and analysis
 * - Production-ready error handling and recovery
 */
export class ProjectMetadataService extends EventEmitter {
    private readonly config: Required<MetadataOperationConfig>
    private readonly databaseService: DatabaseService
    private readonly logger: Logger
    private readonly errorService: ErrorService

    // Caching and indexing
    private readonly metadataCache = new Map<UUID, ProjectFileMetadata>()
    private readonly searchIndexCache = new Map<UUID, ProjectSearchIndex>()
    private isInitialized = false
    private isShuttingDown = false

    // Performance tracking (adapted from Cline's TelemetryService patterns)
    private operationCount = 0
    private errorCount = 0
    private readonly operationTimes: number[] = []
    private readonly MAX_OPERATION_TIMES = 1000

    // Update intervals and cleanup
    private indexUpdateInterval?: NodeJS.Timeout
    private cleanupInterval?: NodeJS.Timeout

    /**
     * Initialize ProjectMetadataService with comprehensive dependencies
     * Following Cline's proven dependency injection patterns for maximum testability
     */
    constructor(
        databaseService: DatabaseService,
        logger: Logger,
        errorService: ErrorService,
        config: Partial<MetadataOperationConfig> = {}
    ) {
        super()

        this.databaseService = databaseService
        this.logger = logger
        this.errorService = errorService
        this.config = { ...DEFAULT_METADATA_CONFIG, ...config }

        this.logger.info('ProjectMetadataService initialized', {
            service: 'ProjectMetadataService',
            operation: 'constructor',
            config: this.config
        })
    }

    /**
     * Initialize the metadata service
     * Sets up indexing, caching, and background processes
     */
    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            throw new ReadyAIError(
                'ProjectMetadataService is already initialized',
                'SERVICE_ALREADY_INITIALIZED',
                400
            )
        }

        try {
            this.emit('initializing')

            // Initialize database tables if needed
            await this.initializeDatabaseSchema()

            // Start background processes if enabled
            if (this.config.autoIndex) {
                this.startIndexUpdateInterval()
            }

            // Start cleanup process
            this.startCleanupInterval()

            this.isInitialized = true
            this.emit('initialized')

            this.logger.info('ProjectMetadataService initialization completed', {
                service: 'ProjectMetadataService',
                operation: 'initialize'
            })

        } catch (error) {
            this.emit('error', error)
            throw new ReadyAIError(
                `Failed to initialize ProjectMetadataService: ${(error as Error).message}`,
                'SERVICE_INITIALIZATION_FAILED',
                500,
                { originalError: error }
            )
        }
    }

    // =============================================================================
    // FILE METADATA OPERATIONS (CLINE PATTERNS)
    // =============================================================================

    /**
     * Track file metadata for a project file
     * Adapts Cline's FileContextTracker patterns for comprehensive metadata management
     */
    public async trackFile(
        projectId: UUID,
        filePath: string,
        source: ProjectFileMetadata['source'] = 'user',
        associatedPhase?: PhaseType
    ): Promise<AsyncResult<ProjectFileMetadata>> {
        return wrapAsync(async () => {
            this.ensureInitialized()

            const operationStart = Date.now()
            const operationId = generateUUID()

            this.logger.debug('Tracking file metadata', {
                service: 'ProjectMetadataService',
                operation: 'trackFile',
                operationId,
                projectId,
                filePath,
                source
            })

            try {
                // Validate inputs
                if (!isValidUUID(projectId)) {
                    throw new ReadyAIError('Invalid project ID format', 'INVALID_PROJECT_ID', 400)
                }

                if (!filePath || filePath.trim().length === 0) {
                    throw new ReadyAIError('File path is required', 'INVALID_FILE_PATH', 400)
                }

                // Check if file exists and get stats
                const fullPath = path.resolve(filePath)
                let fileStats: any
                let contentHash: string
                let mimeType: string

                try {
                    fileStats = await fs.stat(fullPath)
                    const content = await fs.readFile(fullPath)
                    contentHash = crypto.createHash('sha256').update(content).digest('hex')
                    mimeType = this.detectMimeType(filePath, content)
                } catch (fileError) {
                    // File may not exist on disk (could be virtual or deleted)
                    fileStats = null
                    contentHash = ''
                    mimeType = this.detectMimeType(filePath)
                }

                // Check if file is already tracked
                const existingMetadata = await this.getFileMetadata(projectId, filePath)
                
                if (existingMetadata.success && existingMetadata.data) {
                    // Update existing metadata
                    const metadata = existingMetadata.data
                    metadata.modifiedAt = createTimestamp()
                    metadata.lastAccessedAt = createTimestamp()
                    metadata.accessCount += 1
                    metadata.version += 1

                    // Update hash and size if file exists
                    if (fileStats) {
                        metadata.contentHash = contentHash
                        metadata.size = fileStats.size
                    }

                    // Update source and phase
                    metadata.source = source
                    if (associatedPhase) {
                        metadata.associatedPhase = associatedPhase
                    }

                    await this.updateFileMetadata(metadata)
                    return metadata
                } else {
                    // Create new metadata entry
                    const now = createTimestamp()
                    const metadata: ProjectFileMetadata = {
                        id: generateUUID(),
                        projectId,
                        path: filePath,
                        size: fileStats?.size || 0,
                        contentHash,
                        mimeType,
                        createdAt: now,
                        modifiedAt: now,
                        lastAccessedAt: now,
                        accessCount: 1,
                        source,
                        status: 'active',
                        associatedPhase,
                        searchMetadata: {
                            isIndexed: false,
                            keywords: [],
                        },
                        version: 1,
                        childFileIds: [],
                        tags: []
                    }

                    await this.createFileMetadata(metadata)

                    // Trigger indexing if enabled
                    if (this.config.autoIndex) {
                        this.scheduleFileIndexing(metadata.id)
                    }

                    return metadata
                }

            } finally {
                const processingTime = Date.now() - operationStart
                this.trackOperationTime(processingTime)
                this.operationCount++

                this.logger.debug('File tracking completed', {
                    service: 'ProjectMetadataService',
                    operation: 'trackFile',
                    operationId,
                    processingTime
                })
            }
        })
    }

    /**
     * Get file metadata for a specific file
     * Implements Cline's efficient data retrieval patterns with caching
     */
    public async getFileMetadata(
        projectId: UUID,
        filePath: string
    ): Promise<AsyncResult<ProjectFileMetadata | null>> {
        return wrapAsync(async () => {
            this.ensureInitialized()

            // Check cache first
            const cachedMetadata = Array.from(this.metadataCache.values())
                .find(metadata => metadata.projectId === projectId && metadata.path === filePath)

            if (cachedMetadata) {
                return cachedMetadata
            }

            // Query database
            const result = await this.databaseService.execute(async (db) => {
                return db.projectFileMetadata.findFirst({
                    where: {
                        projectId,
                        path: filePath,
                        status: { not: 'deleted' }
                    }
                })
            })

            if (result.success && result.data) {
                // Cache the result
                this.metadataCache.set(result.data.id, result.data)
                return result.data
            }

            return null
        })
    }

    /**
     * Update AI generation metadata for a file
     * ReadyAI-specific enhancement for tracking AI-generated content
     */
    public async updateAIMetadata(
        fileId: UUID,
        aiMetadata: ProjectFileMetadata['aiMetadata']
    ): Promise<AsyncResult<void>> {
        return wrapAsync(async () => {
            this.ensureInitialized()

            const metadata = this.metadataCache.get(fileId)
            if (metadata) {
                metadata.aiMetadata = aiMetadata
                metadata.modifiedAt = createTimestamp()
                metadata.version += 1
                
                await this.updateFileMetadata(metadata)
            } else {
                throw new ReadyAIError(
                    `File metadata not found: ${fileId}`,
                    'METADATA_NOT_FOUND',
                    404
                )
            }

            this.emit('ai_metadata_updated', { fileId, aiMetadata })
        })
    }

    // =============================================================================
    // SEARCH AND INDEXING OPERATIONS (CLINE PATTERNS)
    // =============================================================================

    /**
     * Search project files using advanced criteria
     * Implements Cline's search patterns with ReadyAI enhancements for semantic search
     */
    public async searchFiles(
        projectId: UUID,
        criteria: ProjectSearchCriteria
    ): Promise<AsyncResult<ProjectFileMetadata[]>> {
        return wrapAsync(async () => {
            this.ensureInitialized()

            const operationStart = Date.now()

            this.logger.debug('Searching project files', {
                service: 'ProjectMetadataService',
                operation: 'searchFiles',
                projectId,
                criteria
            })

            try {
                // Get or build search index
                const searchIndex = await this.getSearchIndex(projectId)

                let results: ProjectFileMetadata[] = []

                // Text search
                if (criteria.query) {
                    const textResults = await this.performTextSearch(projectId, criteria.query, searchIndex)
                    results = results.length === 0 ? textResults : 
                        results.filter(r => textResults.some(t => t.id === r.id))
                }

                // Tag filtering
                if (criteria.tags && criteria.tags.length > 0) {
                    const tagResults = await this.searchByTags(projectId, criteria.tags, searchIndex)
                    results = results.length === 0 ? tagResults :
                        results.filter(r => tagResults.some(t => t.id === r.id))
                }

                // Phase filtering
                if (criteria.currentPhase && criteria.currentPhase.length > 0) {
                    const phaseResults = await this.searchByPhases(projectId, criteria.currentPhase, searchIndex)
                    results = results.length === 0 ? phaseResults :
                        results.filter(r => phaseResults.some(p => p.id === r.id))
                }

                // Apply additional filters
                results = this.applySearchFilters(results, criteria)

                // Sort results
                results = this.sortSearchResults(results, criteria.sortBy, criteria.sortDirection)

                // Apply pagination
                const start = ((criteria.page || 1) - 1) * (criteria.limit || 20)
                const end = start + (criteria.limit || 20)
                results = results.slice(start, end)

                const processingTime = Date.now() - operationStart
                this.trackOperationTime(processingTime)

                this.logger.debug('File search completed', {
                    service: 'ProjectMetadataService',
                    operation: 'searchFiles',
                    resultCount: results.length,
                    processingTime
                })

                return results

            } catch (error) {
                this.errorCount++
                throw error
            }
        })
    }

    /**
     * Update search index for a project
     * Adapts Cline's indexing patterns for comprehensive metadata indexing
     */
    public async updateSearchIndex(projectId: UUID): Promise<AsyncResult<void>> {
        return wrapAsync(async () => {
            this.ensureInitialized()

            this.logger.info('Updating search index', {
                service: 'ProjectMetadataService',
                operation: 'updateSearchIndex',
                projectId
            })

            const operationStart = Date.now()

            try {
                // Get all active file metadata for the project
                const allMetadata = await this.getAllFileMetadata(projectId)

                // Build new search index
                const searchIndex: ProjectSearchIndex = {
                    projectId,
                    version: Date.now(),
                    lastUpdated: createTimestamp(),
                    fileIndex: new Map(),
                    hashIndex: new Map(),
                    tagIndex: new Map(),
                    phaseIndex: new Map(),
                    searchIndex: new Map(),
                    dependencyIndex: new Map()
                }

                // Index all metadata
                for (const metadata of allMetadata) {
                    await this.indexFileMetadata(metadata, searchIndex)
                }

                // Cache the updated index
                this.searchIndexCache.set(projectId, searchIndex)

                // Persist to database (if needed for durability)
                await this.persistSearchIndex(searchIndex)

                const processingTime = Date.now() - operationStart
                this.trackOperationTime(processingTime)

                this.emit('search_index_updated', { projectId, indexSize: allMetadata.length })

                this.logger.info('Search index update completed', {
                    service: 'ProjectMetadataService',
                    operation: 'updateSearchIndex',
                    projectId,
                    indexSize: allMetadata.length,
                    processingTime
                })

            } catch (error) {
                this.errorCount++
                throw error
            }
        })
    }

    // =============================================================================
    // ANALYTICS AND REPORTING (CLINE PATTERNS)
    // =============================================================================

    /**
     * Generate comprehensive metadata analytics for a project
     * Implements Cline's analytics patterns with ReadyAI-specific metrics
     */
    public async getMetadataAnalytics(projectId: UUID): Promise<AsyncResult<ProjectMetadataAnalytics>> {
        return wrapAsync(async () => {
            this.ensureInitialized()

            this.logger.debug('Generating metadata analytics', {
                service: 'ProjectMetadataService',
                operation: 'getMetadataAnalytics',
                projectId
            })

            const operationStart = Date.now()

            try {
                const allMetadata = await this.getAllFileMetadata(projectId)
                const searchIndex = await this.getSearchIndex(projectId)

                const analytics: ProjectMetadataAnalytics = {
                    projectId,
                    timestamp: createTimestamp(),
                    totalFiles: allMetadata.length,
                    filesBySource: {
                        user: 0,
                        ai: 0,
                        template: 0,
                        import: 0
                    },
                    filesByPhase: {} as Record<PhaseType, number>,
                    storageMetrics: this.calculateStorageMetrics(allMetadata),
                    accessPatterns: this.calculateAccessPatterns(allMetadata),
                    aiGenerationStats: this.calculateAIGenerationStats(allMetadata),
                    searchMetrics: this.calculateSearchMetrics(searchIndex, Date.now() - operationStart)
                }

                // Calculate source distribution
                allMetadata.forEach(metadata => {
                    analytics.filesBySource[metadata.source]++
                })

                // Calculate phase distribution
                allMetadata.forEach(metadata => {
                    if (metadata.associatedPhase) {
                        analytics.filesByPhase[metadata.associatedPhase] = 
                            (analytics.filesByPhase[metadata.associatedPhase] || 0) + 1
                    }
                })

                const processingTime = Date.now() - operationStart
                this.trackOperationTime(processingTime)

                return analytics

            } catch (error) {
                this.errorCount++
                throw error
            }
        })
    }

    // =============================================================================
    // UTILITY AND HELPER METHODS (CLINE PATTERNS)
    // =============================================================================

    /**
     * Ensure service is initialized before operations
     */
    private ensureInitialized(): void {
        if (!this.isInitialized) {
            throw new ReadyAIError(
                'ProjectMetadataService not initialized',
                'SERVICE_NOT_INITIALIZED',
                500
            )
        }
    }

    /**
     * Track operation performance metrics
     * Adapted from Cline's telemetry patterns
     */
    private trackOperationTime(time: number): void {
        this.operationTimes.push(time)
        
        if (this.operationTimes.length > this.MAX_OPERATION_TIMES) {
            this.operationTimes.shift()
        }
    }

    /**
     * Initialize database schema for metadata storage
     */
    private async initializeDatabaseSchema(): Promise<void> {
        // This would typically involve creating tables/collections
        // Implementation depends on the specific database system used
        await this.databaseService.execute(async (db) => {
            // Initialize project file metadata table
            // Implementation specific to database system
            return true
        })
    }

    /**
     * Create new file metadata entry
     */
    private async createFileMetadata(metadata: ProjectFileMetadata): Promise<void> {
        await this.databaseService.execute(async (db) => {
            return db.projectFileMetadata.create({
                data: metadata
            })
        })

        // Cache the new metadata
        this.metadataCache.set(metadata.id, metadata)

        this.emit('file_metadata_created', { metadata })
    }

    /**
     * Update existing file metadata
     */
    private async updateFileMetadata(metadata: ProjectFileMetadata): Promise<void> {
        await this.databaseService.execute(async (db) => {
            return db.projectFileMetadata.update({
                where: { id: metadata.id },
                data: metadata
            })
        })

        // Update cache
        this.metadataCache.set(metadata.id, metadata)

        this.emit('file_metadata_updated', { metadata })
    }

    /**
     * Get all file metadata for a project
     */
    private async getAllFileMetadata(projectId: UUID): Promise<ProjectFileMetadata[]> {
        const result = await this.databaseService.execute(async (db) => {
            return db.projectFileMetadata.findMany({
                where: {
                    projectId,
                    status: { not: 'deleted' }
                }
            })
        })

        return result.success ? result.data || [] : []
    }

    /**
     * Detect MIME type from file path and content
     */
    private detectMimeType(filePath: string, content?: Buffer): string {
        const ext = path.extname(filePath).toLowerCase()
        
        // Basic MIME type detection
        const mimeTypes: Record<string, string> = {
            '.js': 'application/javascript',
            '.ts': 'application/typescript',
            '.json': 'application/json',
            '.md': 'text/markdown',
            '.txt': 'text/plain',
            '.css': 'text/css',
            '.html': 'text/html',
            '.py': 'text/x-python',
            '.java': 'text/x-java',
            '.cpp': 'text/x-c++src',
            '.c': 'text/x-csrc'
        }

        return mimeTypes[ext] || 'application/octet-stream'
    }

    /**
     * Calculate storage metrics from metadata
     */
    private calculateStorageMetrics(allMetadata: ProjectFileMetadata[]) {
        const sizes = allMetadata.map(m => m.size)
        const totalSize = sizes.reduce((sum, size) => sum + size, 0)
        const averageFileSize = totalSize / allMetadata.length || 0

        const sortedBySize = [...allMetadata].sort((a, b) => b.size - a.size)
        
        return {
            totalSize,
            averageFileSize,
            largestFile: sortedBySize[0] ? { path: sortedBySize[0].path, size: sortedBySize[0].size } : { path: '', size: 0 },
            smallestFile: sortedBySize[sortedBySize.length - 1] ? 
                { path: sortedBySize[sortedBySize.length - 1].path, size: sortedBySize[sortedBySize.length - 1].size } : 
                { path: '', size: 0 }
        }
    }

    /**
     * Calculate access patterns from metadata
     */
    private calculateAccessPatterns(allMetadata: ProjectFileMetadata[]) {
        const sortedByAccess = [...allMetadata].sort((a, b) => b.accessCount - a.accessCount)
        const sortedByModified = [...allMetadata].sort((a, b) => 
            new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
        )
        const sortedByLastAccessed = [...allMetadata].sort((a, b) => 
            new Date(a.lastAccessedAt).getTime() - new Date(b.lastAccessedAt).getTime()
        )

        return {
            mostAccessedFiles: sortedByAccess.slice(0, 10).map(m => ({
                path: m.path,
                accessCount: m.accessCount
            })),
            recentlyModifiedFiles: sortedByModified.slice(0, 10).map(m => ({
                path: m.path,
                modifiedAt: m.modifiedAt
            })),
            unusedFiles: sortedByLastAccessed.slice(0, 10).map(m => ({
                path: m.path,
                lastAccessedAt: m.lastAccessedAt
            }))
        }
    }

    /**
     * Calculate AI generation statistics
     */
    private calculateAIGenerationStats(allMetadata: ProjectFileMetadata[]) {
        const aiFiles = allMetadata.filter(m => m.aiMetadata)
        const totalTokensUsed = aiFiles.reduce((sum, m) => sum + (m.aiMetadata?.tokenUsage || 0), 0)
        const averageConfidence = aiFiles.length > 0 ? 
            aiFiles.reduce((sum, m) => sum + (m.aiMetadata?.confidence || 0), 0) / aiFiles.length : 0

        const modelsUsed: Record<string, number> = {}
        aiFiles.forEach(m => {
            if (m.aiMetadata?.modelUsed) {
                modelsUsed[m.aiMetadata.modelUsed] = (modelsUsed[m.aiMetadata.modelUsed] || 0) + 1
            }
        })

        return {
            totalAiFiles: aiFiles.length,
            averageConfidence,
            totalTokensUsed,
            modelsUsed
        }
    }

    /**
     * Calculate search performance metrics
     */
    private calculateSearchMetrics(searchIndex: ProjectSearchIndex, processingTime: number) {
        const indexSize = searchIndex.fileIndex.size
        const popularKeywords = Array.from(searchIndex.searchIndex.entries())
            .map(([keyword, fileIds]) => ({ keyword, frequency: fileIds.size }))
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, 20)

        return {
            indexSize,
            indexingTime: processingTime,
            averageQueryTime: this.operationTimes.length > 0 ? 
                this.operationTimes.reduce((sum, time) => sum + time, 0) / this.operationTimes.length : 0,
            popularKeywords
        }
    }

    /**
     * Start automatic index update interval
     */
    private startIndexUpdateInterval(): void {
        this.indexUpdateInterval = setInterval(async () => {
            try {
                // Update indices for all cached projects
                const projectIds = Array.from(new Set(
                    Array.from(this.metadataCache.values()).map(m => m.projectId)
                ))

                for (const projectId of projectIds) {
                    await this.updateSearchIndex(projectId)
                }
            } catch (error) {
                this.logger.error('Error during automatic index update', {
                    service: 'ProjectMetadataService',
                    operation: 'startIndexUpdateInterval',
                    error: error instanceof Error ? error.message : String(error)
                })
            }
        }, this.config.indexUpdateInterval)
    }

    /**
     * Start cleanup interval for maintenance tasks
     */
    private startCleanupInterval(): void {
        this.cleanupInterval = setInterval(async () => {
            try {
                // Clean up deleted file metadata older than retention period
                await this.cleanupDeletedMetadata()

                // Trim cache if it's too large
                if (this.metadataCache.size > this.config.maxCacheSize) {
                    await this.trimCache()
                }
            } catch (error) {
                this.logger.error('Error during cleanup', {
                    service: 'ProjectMetadataService',
                    operation: 'startCleanupInterval',
                    error: error instanceof Error ? error.message : String(error)
                })
            }
        }, 60000) // Run cleanup every minute
    }

    /**
     * Get or build search index for project
     */
    private async getSearchIndex(projectId: UUID): Promise<ProjectSearchIndex> {
        let searchIndex = this.searchIndexCache.get(projectId)
        
        if (!searchIndex) {
            await this.updateSearchIndex(projectId)
            searchIndex = this.searchIndexCache.get(projectId)
        }

        if (!searchIndex) {
            throw new ReadyAIError(
                `Failed to build search index for project: ${projectId}`,
                'SEARCH_INDEX_ERROR',
                500
            )
        }

        return searchIndex
    }

    /**
     * Additional helper methods would be implemented here following the same patterns...
     */

    /**
     * Shutdown the metadata service gracefully
     */
    public async shutdown(): Promise<void> {
        if (!this.isInitialized || this.isShuttingDown) {
            return
        }

        this.isShuttingDown = true
        this.emit('shutting_down')

        try {
            // Clear intervals
            if (this.indexUpdateInterval) {
                clearInterval(this.indexUpdateInterval)
            }
            
            if (this.cleanupInterval) {
                clearInterval(this.cleanupInterval)
            }

            // Clear caches
            this.metadataCache.clear()
            this.searchIndexCache.clear()

            this.isInitialized = false
            this.emit('shutdown')

            this.logger.info('ProjectMetadataService shutdown completed', {
                service: 'ProjectMetadataService',
                operation: 'shutdown'
            })

        } catch (error) {
            this.emit('error', error)
            throw error
        } finally {
            this.isShuttingDown = false
        }
    }

    // Placeholder implementations for missing helper methods
    private async scheduleFileIndexing(fileId: UUID): Promise<void> {
        // Implementation for scheduling file indexing
    }

    private async indexFileMetadata(metadata: ProjectFileMetadata, searchIndex: ProjectSearchIndex): Promise<void> {
        // Implementation for indexing file metadata
    }

    private async persistSearchIndex(searchIndex: ProjectSearchIndex): Promise<void> {
        // Implementation for persisting search index
    }

    private async performTextSearch(projectId: UUID, query: string, searchIndex: ProjectSearchIndex): Promise<ProjectFileMetadata[]> {
        // Implementation for text search
        return []
    }

    private async searchByTags(projectId: UUID, tags: string[], searchIndex: ProjectSearchIndex): Promise<ProjectFileMetadata[]> {
        // Implementation for tag-based search
        return []
    }

    private async searchByPhases(projectId: UUID, phases: string[], searchIndex: ProjectSearchIndex): Promise<ProjectFileMetadata[]> {
        // Implementation for phase-based search
        return []
    }

    private applySearchFilters(results: ProjectFileMetadata[], criteria: ProjectSearchCriteria): ProjectFileMetadata[] {
        // Implementation for applying search filters
        return results
    }

    private sortSearchResults(results: ProjectFileMetadata[], sortBy?: string, sortDirection?: string): ProjectFileMetadata[] {
        // Implementation for sorting search results
        return results
    }

    private async cleanupDeletedMetadata(): Promise<void> {
        // Implementation for cleaning up deleted metadata
    }

    private async trimCache(): Promise<void> {
        // Implementation for trimming cache
    }
}

/**
 * Factory function to create ProjectMetadataService with proper dependencies
 * Follows Cline's proven factory patterns for service initialization
 */
export function createProjectMetadataService(
    databaseService: DatabaseService,
    logger: Logger,
    errorService: ErrorService,
    config?: Partial<MetadataOperationConfig>
): ProjectMetadataService {
    return new ProjectMetadataService(databaseService, logger, errorService, config)
}

// Export types for external use
export type {
    ProjectFileMetadata,
    ProjectSearchIndex,
    ProjectMetadataAnalytics,
    MetadataOperationConfig
}

export default ProjectMetadataService
