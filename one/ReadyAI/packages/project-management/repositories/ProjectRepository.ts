// packages/project-management/repositories/ProjectRepository.ts

/**
 * ProjectRepository - Production-grade project management repository
 * 
 * Adapted from Cline's proven repository patterns with 75% pattern reuse while 
 * maintaining full compatibility with ReadyAI's project management architecture.
 * Provides comprehensive CRUD operations, advanced querying, caching, and 
 * transaction handling specifically optimized for ReadyAI project entities.
 * 
 * Key Cline Pattern Adaptations:
 * - Generic repository pattern from Cline's data access layer (BaseRepository foundation)
 * - Advanced query optimization and caching strategies from Cline's storage system
 * - Transaction management with proper isolation levels
 * - Event-driven architecture for project lifecycle tracking
 * - Comprehensive error handling and retry mechanisms
 * - Performance monitoring and metrics collection
 * 
 * ReadyAI Extensions:
 * - Project-specific query methods (findByPhase, findByTechStack)
 * - Phase progression tracking and validation
 * - AI provider usage statistics and optimization
 * - Context-aware search and dependency resolution
 * - Quality metrics integration and health scoring
 * 
 * Reuse Strategy: 75% Adapt from Cline repository patterns
 * - Direct adaptation of Cline's BaseRepository CRUD operations
 * - Enhanced with ReadyAI project-specific business logic
 * - Maintains Cline's proven caching and performance patterns
 * - Integrates with ReadyAI's transaction and validation systems
 * 
 * @version 1.0.0 - Phase 2.1 Implementation
 * @author ReadyAI Development Team
 */

import { Database } from 'better-sqlite3';
import {
  UUID,
  ApiResponse,
  ApiErrorResponse,
  ReadyAIError,
  AsyncResult,
  wrapAsync,
  createApiResponse,
  createApiError,
  isApiSuccess,
  PaginatedResponse,
  PhaseType,
  PhaseStatus,
  generateUUID,
  createTimestamp
} from '../../foundation/types/core';

import {
  Project,
  ProjectSearchCriteria,
  ProjectCreationRequest,
  ProjectUpdateRequest,
  ProjectOperationResult,
  ProjectSnapshot,
  ProjectTag,
  ProjectCategory,
  ProjectPerformance,
  ProjectAnalytics,
  createProject,
  validateProject,
  calculateProjectHealth,
  createProjectSnapshot,
  isProject,
  ProjectCreationError,
  ProjectValidationError
} from '../types/project';

import {
  BaseRepository,
  BaseEntity,
  QueryOptions,
  PaginatedResult,
  RepositoryContext,
  CacheConfig,
  RepositoryError,
  REPOSITORY_ERRORS
} from '../../database/repositories/BaseRepository';

import {
  DatabaseService,
  DatabaseServiceConfig,
  DatabaseOperationContext
} from '../../database/services/DatabaseService';

import {
  TransactionOptions,
  DEFAULT_TRANSACTION_OPTIONS
} from '../../database/types/database';

import { Logger } from '../../logging/services/Logger';
import { ErrorService } from '../../error-handling/services/ErrorService';

/**
 * Project-specific query options extending base repository patterns
 * Adapted from Cline's advanced query builder with ReadyAI project extensions
 */
export interface ProjectQueryOptions extends QueryOptions {
  /** Filter by current development phase */
  currentPhase?: PhaseType[];
  /** Filter by project status */
  status?: Project['status'][];
  /** Filter by project priority */
  priority?: Project['priority'][];
  /** Filter by project complexity */
  complexity?: Project['complexity'][];
  /** Filter by project health */
  health?: Project['health'][];
  /** Filter by technology stack languages */
  languages?: string[];
  /** Filter by tags */
  tags?: string[];
  /** Filter by owner */
  ownerId?: UUID;
  /** Filter by creation date range */
  createdAfter?: string;
  createdBefore?: string;
  /** Filter by last update range */
  updatedAfter?: string;
  updatedBefore?: string;
  /** Include archived projects */
  includeArchived?: boolean;
  /** Search in project name and description */
  search?: string;
}

/**
 * Project repository context for enhanced tracking
 */
export interface ProjectRepositoryContext extends RepositoryContext {
  /** Phase context for operations */
  phaseContext?: {
    currentPhase: PhaseType;
    targetPhase?: PhaseType;
    phaseProgress?: number;
  };
  /** Performance tracking context */
  performanceContext?: {
    trackMetrics: boolean;
    includeAnalytics: boolean;
  };
}

/**
 * Project cache configuration optimized for ReadyAI patterns
 */
const PROJECT_CACHE_CONFIG: CacheConfig = {
  enabled: true,
  ttl: 10 * 60 * 1000, // 10 minutes (longer TTL for project data)
  maxSize: 500, // Higher cache size for project entities
  keyPrefix: 'readyai:project:'
};

/**
 * Project-specific database operations result
 */
export interface ProjectDatabaseResult extends ProjectOperationResult {
  /** Performance metrics for the operation */
  performance?: {
    queryTime: number;
    cacheHit: boolean;
    indexUsed: boolean;
  };
}

/**
 * ProjectRepository - Comprehensive project management repository
 * 
 * Extends ReadyAI's BaseRepository with project-specific functionality while
 * leveraging Cline's proven repository patterns for reliability and performance.
 * Provides specialized methods for project lifecycle management, phase tracking,
 * and AI-powered development orchestration.
 */
export class ProjectRepository extends BaseRepository<Project> {
  private readonly databaseService: DatabaseService;
  private readonly errorService: ErrorService;
  
  // Project-specific caches following Cline's caching patterns
  private readonly phaseCache = new Map<string, Project[]>();
  private readonly tagCache = new Map<string, Project[]>();
  private readonly searchCache = new Map<string, { results: Project[]; timestamp: number }>();
  
  // Performance tracking adapted from Cline's metrics system
  private readonly queryMetrics = {
    projectQueries: 0,
    phaseQueries: 0,
    searchQueries: 0,
    cacheHitRate: 0,
    averageQueryTime: 0
  };

  constructor(
    databaseService: DatabaseService,
    cacheConfig: Partial<CacheConfig> = {}
  ) {
    const dbConnection = databaseService.getConnection();
    const transactionManager = databaseService['transactionManager']; // Access private member
    
    super(
      'projects',
      dbConnection,
      transactionManager,
      { ...PROJECT_CACHE_CONFIG, ...cacheConfig }
    );
    
    this.databaseService = databaseService;
    this.errorService = ErrorService.getInstance();
    this.logger = Logger.getInstance({ source: 'ProjectRepository' });

    // Set up project-specific event handlers
    this.setupProjectEventHandlers();
    
    // Initialize performance monitoring
    this.initializePerformanceMonitoring();
  }

  // ===== PROJECT-SPECIFIC CRUD OPERATIONS =====

  /**
   * Create a new project with comprehensive validation and setup
   * Adapts Cline's entity creation patterns with ReadyAI project requirements
   */
  async createProject(
    request: ProjectCreationRequest,
    context: ProjectRepositoryContext = {}
  ): Promise<ApiResponse<Project> | ApiErrorResponse> {
    return wrapAsync(async () => {
      const startTime = Date.now();
      
      this.logger.info('Creating new project', {
        projectName: request.name,
        templateId: request.templateId,
        correlationId: context.correlationId
      });

      // Create project entity from request
      const project = createProject(request);
      
      // Set owner from context if available
      if (context.userId) {
        project.ownerId = context.userId;
      }

      // Validate project before creation
      const validationResult = await this.validateProjectEntity(project);
      if (!isApiSuccess(validationResult)) {
        throw new ProjectValidationError(
          'Project validation failed',
          [validationResult.error] as any
        );
      }

      // Execute creation within transaction
      const result = await this.executeProjectTransaction(async (db) => {
        // Insert main project record
        const projectInsert = this.buildProjectInsertQuery(project);
        const projectStmt = db.prepare(projectInsert.sql);
        const projectResult = projectStmt.run(...projectInsert.params);

        if (projectResult.changes === 0) {
          throw new ProjectCreationError('Failed to insert project record');
        }

        // Insert initial phase records
        await this.insertProjectPhases(db, project);
        
        // Insert project tags if any
        if (request.tags && request.tags.length > 0) {
          await this.insertProjectTags(db, project.id, request.tags);
        }

        // Initialize project metrics
        await this.initializeProjectMetrics(db, project.id);

        return project;
      }, {
        ...DEFAULT_TRANSACTION_OPTIONS,
        mode: 'IMMEDIATE' // Ensure consistency for project creation
      });

      if (!result.success) {
        throw new ProjectCreationError(
          `Project creation failed: ${result.error}`,
          { projectName: request.name }
        );
      }

      const createdProject = result.result!;
      
      // Cache the created project
      this.setCacheEntry(createdProject.id, createdProject);
      this.invalidateRelatedCaches(createdProject);
      
      // Update performance metrics
      this.updateQueryMetrics(startTime, 'create');
      
      // Emit creation events
      this.emitEvent('entity:created', createdProject, context);
      this.emitProjectEvent('project:created', createdProject, context);
      
      this.logger.info('Project created successfully', {
        projectId: createdProject.id,
        projectName: createdProject.name,
        duration: Date.now() - startTime
      });

      return createdProject;
    });
  }

  /**
   * Update project with validation and phase progression handling
   * Adapts Cline's update patterns with ReadyAI project lifecycle management
   */
  async updateProject(
    id: UUID,
    updates: ProjectUpdateRequest,
    context: ProjectRepositoryContext = {}
  ): Promise<ApiResponse<Project> | ApiErrorResponse> {
    return wrapAsync(async () => {
      const startTime = Date.now();
      
      this.logger.info('Updating project', {
        projectId: id,
        updateFields: Object.keys(updates),
        correlationId: context.correlationId
      });

      // Get current project
      const currentResult = await this.findById(id, context);
      if (!isApiSuccess(currentResult)) {
        throw currentResult.error;
      }

      const current = currentResult.data;
      if (!current) {
        throw new RepositoryError(
          `Project not found: ${id}`,
          REPOSITORY_ERRORS.NOT_FOUND,
          404
        );
      }

      // Prepare updated project with change tracking
      const updatedProject = this.prepareProjectUpdate(current, updates);
      
      // Validate updated project
      const validationResult = await this.validateProjectEntity(updatedProject);
      if (!isApiSuccess(validationResult)) {
        throw new ProjectValidationError(
          'Updated project validation failed',
          [validationResult.error] as any
        );
      }

      // Execute update within transaction
      const result = await this.executeProjectTransaction(async (db) => {
        // Update main project record
        const updateQuery = this.buildProjectUpdateQuery(id, updates);
        const updateStmt = db.prepare(updateQuery.sql);
        const updateResult = updateStmt.run(...updateQuery.params);

        if (updateResult.changes === 0) {
          throw new RepositoryError(
            'Failed to update project record',
            REPOSITORY_ERRORS.UPDATE_FAILED,
            500
          );
        }

        // Handle tag updates if provided
        if (updates.tags !== undefined) {
          await this.updateProjectTags(db, id, updates.tags);
        }

        // Update project health score
        updatedProject.health = calculateProjectHealth(updatedProject);
        
        // Update health in database
        const healthUpdateStmt = db.prepare('UPDATE projects SET health = ? WHERE id = ?');
        healthUpdateStmt.run(updatedProject.health, id);

        return updatedProject;
      });

      if (!result.success) {
        throw new RepositoryError(
          `Project update failed: ${result.error}`,
          REPOSITORY_ERRORS.UPDATE_FAILED,
          500
        );
      }

      const finalProject = result.result!;
      
      // Update caches
      this.setCacheEntry(id, finalProject);
      this.invalidateRelatedCaches(finalProject);
      
      // Update performance metrics
      this.updateQueryMetrics(startTime, 'update');
      
      // Emit update events
      this.emitEvent('entity:updated', finalProject, current, context);
      this.emitProjectEvent('project:updated', finalProject, context, {
        previous: current,
        changes: updates
      });
      
      this.logger.info('Project updated successfully', {
        projectId: id,
        duration: Date.now() - startTime,
        changesApplied: Object.keys(updates).length
      });

      return finalProject;
    });
  }

  // ===== PROJECT-SPECIFIC QUERY METHODS =====

  /**
   * Find projects by development phase
   * Implements ReadyAI-specific phase-based querying with caching
   */
  async findByPhase(
    phases: PhaseType[],
    options: Omit<ProjectQueryOptions, 'currentPhase'> = {},
    context: ProjectRepositoryContext = {}
  ): Promise<ApiResponse<Project[]> | ApiErrorResponse> {
    return wrapAsync(async () => {
      const startTime = Date.now();
      const cacheKey = this.generatePhaseCacheKey(phases, options);
      
      // Check phase cache
      const cached = this.getPhaseCacheEntry(cacheKey);
      if (cached) {
        this.queryMetrics.cacheHitRate++;
        return cached;
      }

      // Build query for phase filtering
      const queryOptions: ProjectQueryOptions = {
        ...options,
        currentPhase: phases,
        orderBy: options.orderBy || [{ field: 'updatedAt', direction: 'DESC' }]
      };

      const projectsResult = await this.findProjects(queryOptions, context);
      if (!isApiSuccess(projectsResult)) {
        throw projectsResult.error;
      }

      const projects = projectsResult.data;
      
      // Cache results
      this.setPhaseCacheEntry(cacheKey, projects);
      
      // Update metrics
      this.updateQueryMetrics(startTime, 'phase_query');
      this.queryMetrics.phaseQueries++;

      return projects;
    });
  }

  /**
   * Find projects by technology stack
   * ReadyAI-specific querying for tech stack compatibility
   */
  async findByTechStack(
    languages: string[],
    options: ProjectQueryOptions = {},
    context: ProjectRepositoryContext = {}
  ): Promise<ApiResponse<Project[]> | ApiErrorResponse> {
    return wrapAsync(async () => {
      const startTime = Date.now();
      
      // Use custom query for tech stack filtering
      const result = await this.execute(async (db) => {
        const whereConditions = ['deletedAt IS NULL'];
        const params: any[] = [];

        // Add language filtering
        if (languages.length > 0) {
          const languagePlaceholders = languages.map(() => '?').join(',');
          whereConditions.push(`JSON_EXTRACT(techStack, '$.languages') LIKE '%' || ? || '%'`);
          // For SQLite JSON queries, we'll need to check each language
          languages.forEach(lang => {
            whereConditions.push(`JSON_EXTRACT(techStack, '$.languages') LIKE '%' || ? || '%'`);
            params.push(lang);
          });
        }

        // Add other filters
        this.applyProjectQueryOptions(whereConditions, params, options);

        // Build final query
        const selectFields = options.select?.join(', ') || '*';
        const whereClause = whereConditions.join(' AND ');
        const orderBy = this.buildOrderByClause(options.orderBy);
        const limit = options.limit ? `LIMIT ${options.limit}` : '';
        const offset = options.offset ? `OFFSET ${options.offset}` : '';

        const query = `
          SELECT ${selectFields} 
          FROM projects 
          WHERE ${whereClause} 
          ${orderBy} 
          ${limit} 
          ${offset}
        `.trim();

        const stmt = db.prepare(query);
        return stmt.all(...params) as Project[];
      });

      // Parse techStack JSON for each project
      const projects = result.map(project => ({
        ...project,
        techStack: JSON.parse(project.techStack as any),
        config: JSON.parse(project.config as any)
      }));

      // Update metrics
      this.updateQueryMetrics(startTime, 'techstack_query');

      return projects;
    });
  }

  /**
   * Advanced project search with full-text capabilities
   * Adapts Cline's search patterns for ReadyAI project discovery
   */
  async searchProjects(
    criteria: ProjectSearchCriteria,
    context: ProjectRepositoryContext = {}
  ): Promise<ApiResponse<PaginatedResult<Project>> | ApiErrorResponse> {
    return wrapAsync(async () => {
      const startTime = Date.now();
      const searchKey = this.generateSearchCacheKey(criteria);
      
      // Check search cache
      const cached = this.getSearchCacheEntry(searchKey);
      if (cached) {
        this.queryMetrics.cacheHitRate++;
        return cached;
      }

      // Build complex search query
      const result = await this.executeProjectTransaction(async (db) => {
        const whereConditions = ['deletedAt IS NULL'];
        const params: any[] = [];

        // Full-text search in name and description
        if (criteria.query) {
          whereConditions.push(`(name LIKE '%' || ? || '%' OR description LIKE '%' || ? || '%')`);
          params.push(criteria.query, criteria.query);
        }

        // Apply all search criteria
        this.applySearchCriteria(whereConditions, params, criteria);

        // Get total count
        const countQuery = `SELECT COUNT(*) as total FROM projects WHERE ${whereConditions.join(' AND ')}`;
        const countStmt = db.prepare(countQuery);
        const countResult = countStmt.get(...params) as { total: number };
        const total = countResult.total;

        // Get paginated results
        const page = criteria.page || 1;
        const pageSize = Math.min(criteria.limit || 20, 100);
        const offset = (page - 1) * pageSize;

        const orderBy = this.buildOrderByClause(
          criteria.sortBy ? [{ field: criteria.sortBy, direction: criteria.sortDirection || 'DESC' }] : 
          [{ field: 'updatedAt', direction: 'DESC' }]
        );

        const selectQuery = `
          SELECT * FROM projects 
          WHERE ${whereConditions.join(' AND ')} 
          ${orderBy}
          LIMIT ? OFFSET ?
        `;
        
        const selectStmt = db.prepare(selectQuery);
        const projects = selectStmt.all(...params, pageSize, offset) as Project[];

        // Parse JSON fields
        const parsedProjects = projects.map(this.parseProjectJsonFields.bind(this));

        return {
          items: parsedProjects,
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
          hasNext: page * pageSize < total,
          hasPrevious: page > 1
        } as PaginatedResult<Project>;
      });

      if (!result.success) {
        throw new RepositoryError(
          `Project search failed: ${result.error}`,
          'PROJECT_SEARCH_FAILED',
          500
        );
      }

      const paginatedResult = result.result!;
      
      // Cache search results
      this.setSearchCacheEntry(searchKey, paginatedResult);
      
      // Update metrics
      this.updateQueryMetrics(startTime, 'search');
      this.queryMetrics.searchQueries++;

      return paginatedResult;
    });
  }

  /**
   * Find projects with active AI generation requests
   * ReadyAI-specific query for monitoring AI usage
   */
  async findProjectsWithActiveGeneration(
    context: ProjectRepositoryContext = {}
  ): Promise<ApiResponse<Project[]> | ApiErrorResponse> {
    return wrapAsync(async () => {
      const startTime = Date.now();

      const result = await this.execute(async (db) => {
        // Query for projects with recent AI activity
        const query = `
          SELECT p.* FROM projects p
          WHERE p.deletedAt IS NULL
            AND JSON_EXTRACT(p.metrics, '$.aiGenerations') > 0
            AND p.updatedAt > datetime('now', '-1 hour')
          ORDER BY p.updatedAt DESC
        `;
        
        const stmt = db.prepare(query);
        return stmt.all() as Project[];
      });

      const projects = result.map(this.parseProjectJsonFields.bind(this));
      
      // Update metrics
      this.updateQueryMetrics(startTime, 'active_generation_query');

      return projects;
    });
  }

  // ===== PROJECT LIFECYCLE MANAGEMENT =====

  /**
   * Advance project to next phase with validation
   * Implements ReadyAI's phase progression logic with Cline's state management patterns
   */
  async advanceProjectPhase(
    id: UUID,
    targetPhase: PhaseType,
    context: ProjectRepositoryContext = {}
  ): Promise<ApiResponse<Project> | ApiErrorResponse> {
    return wrapAsync(async () => {
      const startTime = Date.now();
      
      this.logger.info('Advancing project phase', {
        projectId: id,
        targetPhase,
        correlationId: context.correlationId
      });

      // Get current project
      const currentResult = await this.findById(id, context);
      if (!isApiSuccess(currentResult)) {
        throw currentResult.error;
      }

      const current = currentResult.data;
      if (!current) {
        throw new RepositoryError(
          `Project not found: ${id}`,
          REPOSITORY_ERRORS.NOT_FOUND,
          404
        );
      }

      // Validate phase transition
      const canAdvance = this.validatePhaseTransition(current.currentPhase, targetPhase);
      if (!canAdvance.valid) {
        throw new ProjectValidationError(canAdvance.reason, []);
      }

      // Execute phase advancement within transaction
      const result = await this.executeProjectTransaction(async (db) => {
        // Update current phase
        const phaseUpdateStmt = db.prepare(`
          UPDATE projects 
          SET currentPhase = ?, updatedAt = ? 
          WHERE id = ?
        `);
        phaseUpdateStmt.run(targetPhase, createTimestamp(), id);

        // Update phase record in phases table
        const phaseRecordStmt = db.prepare(`
          UPDATE project_phases 
          SET status = 'completed', completedAt = ?
          WHERE projectId = ? AND phaseId = ?
        `);
        phaseRecordStmt.run(createTimestamp(), id, current.currentPhase);

        // Insert new phase record
        const newPhaseStmt = db.prepare(`
          INSERT INTO project_phases (id, projectId, phaseId, status, startedAt)
          VALUES (?, ?, ?, 'in_progress', ?)
        `);
        newPhaseStmt.run(generateUUID(), id, targetPhase, createTimestamp());

        // Create updated project
        const updatedProject: Project = {
          ...current,
          currentPhase: targetPhase,
          updatedAt: createTimestamp(),
          health: calculateProjectHealth({ ...current, currentPhase: targetPhase })
        };

        return updatedProject;
      });

      if (!result.success) {
        throw new RepositoryError(
          `Phase advancement failed: ${result.error}`,
          'PHASE_ADVANCEMENT_FAILED',
          500
        );
      }

      const updatedProject = result.result!;
      
      // Update caches
      this.setCacheEntry(id, updatedProject);
      this.invalidateRelatedCaches(updatedProject);
      
      // Update metrics
      this.updateQueryMetrics(startTime, 'phase_advance');
      
      // Emit phase advancement events
      this.emitProjectEvent('project:phase_advanced', updatedProject, context, {
        previousPhase: current.currentPhase,
        newPhase: targetPhase
      });

      return updatedProject;
    });
  }

  /**
   * Create project snapshot for versioning
   * Adapts Cline's state management patterns for ReadyAI project versioning
   */
  async createSnapshot(
    projectId: UUID,
    name: string,
    description?: string,
    context: ProjectRepositoryContext = {}
  ): Promise<ApiResponse<ProjectSnapshot> | ApiErrorResponse> {
    return wrapAsync(async () => {
      const startTime = Date.now();
      
      // Get current project state
      const projectResult = await this.findById(projectId, context);
      if (!isApiSuccess(projectResult)) {
        throw projectResult.error;
      }

      const project = projectResult.data;
      if (!project) {
        throw new RepositoryError(
          `Project not found: ${projectId}`,
          REPOSITORY_ERRORS.NOT_FOUND,
          404
        );
      }

      // Create snapshot
      const snapshot = createProjectSnapshot(
        project,
        name,
        'manual',
        context.userId || generateUUID(),
        description
      );

      // Store snapshot in database
      const result = await this.executeProjectTransaction(async (db) => {
        const insertStmt = db.prepare(`
          INSERT INTO project_snapshots (
            id, projectId, name, description, projectState, 
            createdAt, createdBy, size, type, canDelete, expiresAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        insertStmt.run(
          snapshot.id,
          snapshot.projectId,
          snapshot.name,
          snapshot.description,
          JSON.stringify(snapshot.projectState),
          snapshot.createdAt,
          snapshot.createdBy,
          snapshot.size,
          snapshot.type,
          snapshot.canDelete ? 1 : 0,
          snapshot.expiresAt
        );

        return snapshot;
      });

      if (!result.success) {
        throw new RepositoryError(
          `Snapshot creation failed: ${result.error}`,
          'SNAPSHOT_CREATION_FAILED',
          500
        );
      }

      // Update metrics
      this.updateQueryMetrics(startTime, 'snapshot_create');
      
      // Emit snapshot event
      this.emitProjectEvent('project:snapshot_created', project, context, {
        snapshotId: snapshot.id,
        snapshotName: name
      });

      return snapshot;
    });
  }

  // ===== ADVANCED PROJECT OPERATIONS =====

  /**
   * Get project performance analytics
   * ReadyAI-specific analytics aggregation with caching
   */
  async getProjectAnalytics(
    projectId: UUID,
    timeframe: '1d' | '7d' | '30d' = '7d',
    context: ProjectRepositoryContext = {}
  ): Promise<ApiResponse<ProjectAnalytics> | ApiErrorResponse> {
    return wrapAsync(async () => {
      const startTime = Date.now();
      
      const result = await this.execute(async (db) => {
        // Get project
        const projectStmt = db.prepare('SELECT * FROM projects WHERE id = ? AND deletedAt IS NULL');
        const project = projectStmt.get(projectId) as Project | undefined;
        
        if (!project) {
          throw new RepositoryError(
            `Project not found: ${projectId}`,
            REPOSITORY_ERRORS.NOT_FOUND,
            404
          );
        }

        // Calculate timeframe
        const timeframeDays = timeframe === '1d' ? 1 : timeframe === '7d' ? 7 : 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - timeframeDays);

        // Aggregate analytics data
        const analytics: ProjectAnalytics = {
          projectId,
          period: {
            startDate: startDate.toISOString(),
            endDate: new Date().toISOString(),
            granularity: timeframe === '1d' ? 'hour' : timeframe === '7d' ? 'day' : 'week'
          },
          performance: [], // Would be populated from performance tracking
          phaseProgression: this.calculatePhaseProgression(project),
          codeGeneration: this.calculateCodeGenerationStats(project),
          collaboration: this.calculateCollaborationStats(project),
          issues: this.calculateIssueStats(project)
        };

        return analytics;
      });

      // Update metrics
      this.updateQueryMetrics(startTime, 'analytics');

      return result as ProjectAnalytics;
    });
  }

  // ===== PRIVATE HELPER METHODS =====

  /**
   * Execute project-specific database transaction
   * Wraps Cline's transaction patterns with project-specific error handling
   */
  private async executeProjectTransaction<T>(
    operation: (db: Database) => Promise<T> | T,
    options: TransactionOptions = DEFAULT_TRANSACTION_OPTIONS
  ): Promise<{ success: true; result: T } | { success: false; error: string }> {
    try {
      const result = await this.transactionManager.executeTransaction(operation, options);
      return { success: true, result };
    } catch (error) {
      this.errorService.logError(error as Error, {
        component: 'ProjectRepository',
        operation: 'transaction'
      });
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown transaction error' 
      };
    }
  }

  /**
   * Build specialized project insert query
   * Handles JSON serialization for complex project fields
   */
  private buildProjectInsertQuery(project: Project): { sql: string; params: any[] } {
    const fields = [
      'id', 'name', 'description', 'version', 'currentPhase', 'status', 'health',
      'priority', 'complexity', 'createdAt', 'updatedAt', 'rootPath', 'techStack',
      'config', 'ownerId', 'metrics'
    ];

    const placeholders = fields.map(() => '?').join(', ');
    const sql = `INSERT INTO projects (${fields.join(', ')}) VALUES (${placeholders})`;
    
    const params = [
      project.id,
      project.name,
      project.description || null,
      project.version,
      project.currentPhase,
      project.status,
      project.health,
      project.priority,
      project.complexity,
      project.createdAt,
      project.updatedAt,
      project.rootPath,
      JSON.stringify(project.techStack),
      JSON.stringify(project.config),
      project.ownerId,
      JSON.stringify(project.metrics)
    ];

    return { sql, params };
  }

  /**
   * Build specialized project update query
   * Handles partial updates with JSON field merging
   */
  private buildProjectUpdateQuery(id: UUID, updates: ProjectUpdateRequest): { sql: string; params: any[] } {
    const setClauses: string[] = [];
    const params: any[] = [];

    // Handle simple field updates
    const simpleFields = ['name', 'description', 'priority', 'status'] as const;
    simpleFields.forEach(field => {
      if (updates[field] !== undefined) {
        setClauses.push(`${field} = ?`);
        params.push(updates[field]);
      }
    });

    // Handle JSON field updates
    if (updates.techStack) {
      setClauses.push(`techStack = JSON_PATCH(techStack, ?)`);
      params.push(JSON.stringify(updates.techStack));
    }

    if (updates.config) {
      setClauses.push(`config = JSON_PATCH(config, ?)`);
      params.push(JSON.stringify(updates.config));
    }

    // Always update timestamp
    setClauses.push('updatedAt = ?');
    params.push(createTimestamp());

    // Add ID for WHERE clause
    params.push(id);

    const sql = `UPDATE projects SET ${setClauses.join(', ')} WHERE id = ? AND deletedAt IS NULL`;
    return { sql, params };
  }

  /**
   * Parse JSON fields in project records
   * Handles deserialization of complex project data
   */
  private parseProjectJsonFields(project: any): Project {
    return {
      ...project,
      techStack: JSON.parse(project.techStack || '{}'),
      config: JSON.parse(project.config || '{}'),
      metrics: JSON.parse(project.metrics || '{}'),
      phases: JSON.parse(project.phases || '[]'),
      milestones: JSON.parse(project.milestones || '[]'),
      artifacts: JSON.parse(project.artifacts || '[]'),
      collaborators: JSON.parse(project.collaborators || '[]'),
      deployments: JSON.parse(project.deployments || '[]'),
      integrations: JSON.parse(project.integrations || '[]'),
      tags: JSON.parse(project.tags || '[]'),
      aiProviderUsage: JSON.parse(project.aiProviderUsage || '{}'),
      preferences: JSON.parse(project.preferences || '{}')
    };
  }

  /**
   * Apply search criteria to query building
   * Comprehensive filtering logic for project search
   */
  private applySearchCriteria(
    whereConditions: string[],
    params: any[],
    criteria: ProjectSearchCriteria
  ): void {
    // Status filtering
    if (criteria.status && criteria.status.length > 0) {
      const statusPlaceholders = criteria.status.map(() => '?').join(',');
      whereConditions.push(`status IN (${statusPlaceholders})`);
      params.push(...criteria.status);
    }

    // Phase filtering
    if (criteria.currentPhase && criteria.currentPhase.length > 0) {
      const phasePlaceholders = criteria.currentPhase.map(() => '?').join(',');
      whereConditions.push(`currentPhase IN (${phasePlaceholders})`);
      params.push(...criteria.currentPhase);
    }

    // Date range filtering
    if (criteria.createdAfter) {
      whereConditions.push('createdAt >= ?');
      params.push(criteria.createdAfter);
    }

    if (criteria.createdBefore) {
      whereConditions.push('createdAt <= ?');
      params.push(criteria.createdBefore);
    }

    if (criteria.updatedAfter) {
      whereConditions.push('updatedAt >= ?');
      params.push(criteria.updatedAfter);
    }

    if (criteria.updatedBefore) {
      whereConditions.push('updatedAt <= ?');
      params.push(criteria.updatedBefore);
    }

    // Owner filtering
    if (criteria.ownerId) {
      whereConditions.push('ownerId = ?');
      params.push(criteria.ownerId);
    }

    // Tag filtering
    if (criteria.tags && criteria.tags.length > 0) {
      criteria.tags.forEach(tag => {
        whereConditions.push(`JSON_EXTRACT(tags, '$') LIKE '%' || ? || '%'`);
        params.push(tag);
      });
    }
  }

  /**
   * Validate project entity against ReadyAI requirements
   * Enhanced validation with business rule enforcement
   */
  private async validateProjectEntity(project: Project): Promise<ApiResponse<void> | ApiErrorResponse> {
    try {
      // Use existing validation function
      const validationResult = validateProject(project);
      
      if (!validationResult.passed) {
        return createApiError(
          'Project validation failed',
          'VALIDATION_FAILED',
          422,
          {
            errors: validationResult.errors,
            warnings: validationResult.warnings,
            suggestions: validationResult.suggestions
          }
        );
      }

      // Additional business rule validation
      if (project.name.length > 100) {
        return createApiError(
          'Project name must be 100 characters or less',
          'NAME_TOO_LONG',
          422
        );
      }

      if (!project.rootPath) {
        return createApiError(
          'Project root path is required',
          'ROOT_PATH_REQUIRED',
          422
        );
      }

      return createApiResponse(undefined);
    } catch (error) {
      return createApiError(
        `Validation error: ${(error as Error).message}`,
        'VALIDATION_ERROR',
        500
      );
    }
  }

  /**
   * Validate phase transition rules
   * Implements ReadyAI's phase progression constraints
   */
  private validatePhaseTransition(
    currentPhase: PhaseType,
    targetPhase: PhaseType
  ): { valid: boolean; reason: string } {
    // Define valid phase transitions
    const validTransitions: Record<PhaseType, PhaseType[]> = {
      'Phase0_StrategicCharter': ['Phase1_ArchitecturalBlueprint'],
      'Phase1_ArchitecturalBlueprint': ['Phase20_CoreContracts'],
      'Phase20_CoreContracts': ['Phase21_ModuleSpec'],
      'Phase21_ModuleSpec': ['Phase23_ModuleSpecSubsequent', 'Phase30_ProjectScaffolding'],
      'Phase23_ModuleSpecSubsequent': ['Phase30_ProjectScaffolding'],
      'Phase30_ProjectScaffolding': ['Phase301_MasterPlan'],
      'Phase301_MasterPlan': ['Phase31_FileGeneration'],
      'Phase31_FileGeneration': ['Phase4_ValidationCorrection'],
      'Phase4_ValidationCorrection': ['Phase5_TestGeneration', 'Phase31_FileGeneration'],
      'Phase5_TestGeneration': ['Phase6_Documentation'],
      'Phase6_Documentation': ['Phase7_Iteration'],
      'Phase7_Iteration': ['Phase31_FileGeneration', 'Phase4_ValidationCorrection']
    };

    const allowedTransitions = validTransitions[currentPhase] || [];
    
    if (!allowedTransitions.includes(targetPhase)) {
      return {
        valid: false,
        reason: `Invalid phase transition from ${currentPhase} to ${targetPhase}. Allowed transitions: ${allowedTransitions.join(', ')}`
      };
    }

    return { valid: true, reason: '' };
  }

  /**
   * Setup project-specific event handlers
   * Implements Cline's event-driven patterns for project lifecycle
   */
  private setupProjectEventHandlers(): void {
    // Handle project creation events
    this.on('entity:created', (project, context) => {
      this.logger.info('Project created', {
        projectId: project.id,
        projectName: project.name,
        phase: project.currentPhase
      });
    });

    // Handle project updates
    this.on('entity:updated', (updated, previous, context) => {
      // Track significant changes
      if (updated.currentPhase !== previous.currentPhase) {
        this.logger.info('Project phase changed', {
          projectId: updated.id,
          previousPhase: previous.currentPhase,
          newPhase: updated.currentPhase
        });
      }

      if (updated.status !== previous.status) {
        this.logger.info('Project status changed', {
          projectId: updated.id,
          previousStatus: previous.status,
          newStatus: updated.status
        });
      }
    });

    // Handle project deletion
    this.on('entity:deleted', (id, context) => {
      this.invalidateProjectCaches(id);
      this.logger.info('Project deleted', { projectId: id });
    });
  }

  /**
   * Initialize performance monitoring
   * Adapts Cline's performance tracking for project operations
   */
  private initializePerformanceMonitoring(): void {
    // Reset metrics periodically
    setInterval(() => {
      const totalQueries = this.queryMetrics.projectQueries + 
                          this.queryMetrics.phaseQueries + 
                          this.queryMetrics.searchQueries;
      
      if (totalQueries > 0) {
        this.logger.debug('Project repository performance', {
          totalQueries,
          cacheHitRate: `${(this.queryMetrics.cacheHitRate / totalQueries * 100).toFixed(2)}%`,
          averageQueryTime: `${this.queryMetrics.averageQueryTime}ms`
        });
      }
    }, 60000); // Every minute
  }

  /**
   * Update query performance metrics
   * Tracks operation performance following Cline's monitoring patterns
   */
  private updateQueryMetrics(startTime: number, queryType: string): void {
    const duration = Date.now() - startTime;
    this.queryMetrics.averageQueryTime = (this.queryMetrics.averageQueryTime + duration) / 2;
    
    switch (queryType) {
      case 'create':
      case 'update':
      case 'phase_advance':
        this.queryMetrics.projectQueries++;
        break;
      case 'phase_query':
        this.queryMetrics.phaseQueries++;
        break;
      case 'search':
        this.queryMetrics.searchQueries++;
        break;
    }
  }

  /**
   * Cache management methods adapted from Cline's caching strategies
   */
  private generatePhaseCacheKey(phases: PhaseType[], options: ProjectQueryOptions): string {
    const key = `phases:${phases.join(',')}:${JSON.stringify(options)}`;
    return require('crypto').createHash('md5').update(key).digest('hex');
  }

  private getPhaseCacheEntry(key: string): Project[] | null {
    const entry = this.phaseCache.get(key);
    if (!entry) return null;
    
    // Simple TTL check (5 minutes for phase queries)
    const now = Date.now();
    const cacheTime = parseInt(key.split(':')[0]) || 0;
    if (now - cacheTime > 5 * 60 * 1000) {
      this.phaseCache.delete(key);
      return null;
    }
    
    return entry;
  }

  private setPhaseCacheEntry(key: string, projects: Project[]): void {
    // Add timestamp to key for TTL
    const timestampedKey = `${Date.now()}:${key}`;
    this.phaseCache.set(timestampedKey, projects);
    
    // Cleanup old entries
    if (this.phaseCache.size > 100) {
      const oldestKey = this.phaseCache.keys().next().value;
      this.phaseCache.delete(oldestKey);
    }
  }

  /**
   * Additional utility methods for project-specific operations
   */
  private generateSearchCacheKey(criteria: ProjectSearchCriteria): string {
    return require('crypto')
      .createHash('md5')
      .update(JSON.stringify(criteria))
      .digest('hex');
  }

  private getSearchCacheEntry(key: string): PaginatedResult<Project> | null {
    const entry = this.searchCache.get(key);
    if (!entry) return null;
    
    // 2-minute TTL for search results
    if (Date.now() - entry.timestamp > 2 * 60 * 1000) {
      this.searchCache.delete(key);
      return null;
    }
    
    return entry.results as any;
  }

  private setSearchCacheEntry(key: string, results: PaginatedResult<Project>): void {
    this.searchCache.set(key, { results: results as any, timestamp: Date.now() });
    
    // Cleanup old search cache entries
    if (this.searchCache.size > 50) {
      const oldestKey = this.searchCache.keys().next().value;
      this.searchCache.delete(oldestKey);
    }
  }

  private invalidateRelatedCaches(project: Project): void {
    // Clear phase caches that might include this project
    this.phaseCache.clear();
    
    // Clear search caches
    this.searchCache.clear();
    
    // Clear tag caches
    this.tagCache.clear();
  }

  private invalidateProjectCaches(projectId: UUID): void {
    this.removeCacheEntry(projectId);
    this.invalidateRelatedCaches({} as Project);
  }

  /**
   * Project event emission following Cline's event patterns
   */
  private emitProjectEvent(
    eventType: string,
    project: Project,
    context: ProjectRepositoryContext,
    eventData?: any
  ): void {
    // Emit to logger for audit trail
    this.logger.info(`Project event: ${eventType}`, {
      projectId: project.id,
      projectName: project.name,
      eventData,
      correlationId: context.correlationId
    });

    // Additional project-specific event handling could go here
  }

  /**
   * Calculate analytics helper methods
   * These would integrate with actual performance tracking systems
   */
  private calculatePhaseProgression(project: Project): ProjectAnalytics['phaseProgression'] {
    return project.phases.map(phase => ({
      phase: phase.id,
      startedAt: phase.startedAt || project.createdAt,
      completedAt: phase.completedAt,
      duration: phase.duration,
      status: phase.status
    }));
  }

  private calculateCodeGenerationStats(project: Project): ProjectAnalytics['codeGeneration'] {
    return {
      totalFiles: project.metrics.totalFiles,
      totalLines: project.metrics.totalLines,
      languageBreakdown: {}, // Would be calculated from actual file analysis
      aiGeneratedPercentage: project.metrics.aiGenerations > 0 ? 80 : 0, // Placeholder
      userModifiedPercentage: project.metrics.userModifications > 0 ? 20 : 0 // Placeholder
    };
  }

  private calculateCollaborationStats(project: Project): ProjectAnalytics['collaboration'] {
    return {
      activeCollaborators: project.collaborators.filter(c => c.status === 'active').length,
      totalCollaborators: project.collaborators.length,
      activityTimeline: [] // Would be populated from activity tracking
    };
  }

  private calculateIssueStats(project: Project): ProjectAnalytics['issues'] {
    // Placeholder - would integrate with actual issue tracking
    return {
      totalIssues: 0,
      resolvedIssues: 0,
      openIssues: 0,
      criticalIssues: 0,
      averageResolutionTime: 0,
      issueTypes: {}
    };
  }

  /**
   * Helper methods for project operations
   */
  private prepareProjectUpdate(current: Project, updates: ProjectUpdateRequest): Project {
    return {
      ...current,
      ...updates,
      id: current.id, // Ensure ID doesn't change
      updatedAt: createTimestamp(),
      version: current.version, // Version management would be handled separately
      // Merge complex objects properly
      techStack: updates.techStack ? { ...current.techStack, ...updates.techStack } : current.techStack,
      config: updates.config ? { ...current.config, ...updates.config } : current.config,
      preferences: updates.preferences ? { ...current.preferences, ...updates.preferences } : current.preferences
    };
  }

  private buildOrderByClause(orderBy?: Array<{ field: string; direction: 'ASC' | 'DESC' }>): string {
    if (!orderBy || orderBy.length === 0) {
      return 'ORDER BY updatedAt DESC';
    }
    
    const clauses = orderBy.map(order => `${order.field} ${order.direction}`);
    return `ORDER BY ${clauses.join(', ')}`;
  }

  private applyProjectQueryOptions(
    whereConditions: string[],
    params: any[],
    options: ProjectQueryOptions
  ): void {
    // Apply base query options
    if (options.where) {
      Object.entries(options.where).forEach(([field, value]) => {
        if (value !== undefined) {
          whereConditions.push(`${field} = ?`);
          params.push(value);
        }
      });
    }

    // Apply project-specific filters
    if (options.status && options.status.length > 0) {
      const placeholders = options.status.map(() => '?').join(',');
      whereConditions.push(`status IN (${placeholders})`);
      params.push(...options.status);
    }

    if (options.currentPhase && options.currentPhase.length > 0) {
      const placeholders = options.currentPhase.map(() => '?').join(',');
      whereConditions.push(`currentPhase IN (${placeholders})`);
      params.push(...options.currentPhase);
    }

    // Add search functionality
    if (options.search) {
      whereConditions.push(`(name LIKE '%' || ? || '%' OR description LIKE '%' || ? || '%')`);
      params.push(options.search, options.search);
    }
  }

  /**
   * Insert project phases during creation
   */
  private async insertProjectPhases(db: Database, project: Project): Promise<void> {
    if (project.phases.length === 0) return;

    const insertStmt = db.prepare(`
      INSERT INTO project_phases (id, projectId, phaseId, status, startedAt, completedAt, duration)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const phase of project.phases) {
      insertStmt.run(
        generateUUID(),
        project.id,
        phase.id,
        phase.status,
        phase.startedAt || null,
        phase.completedAt || null,
        phase.duration || null
      );
    }
  }

  /**
   * Insert project tags during creation
   */
  private async insertProjectTags(db: Database, projectId: UUID, tags: string[]): Promise<void> {
    if (tags.length === 0) return;

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO project_tags (id, name, usageCount, createdAt)
      VALUES (?, ?, 1, ?)
    `);

    const linkStmt = db.prepare(`
      INSERT INTO project_tag_links (projectId, tagId)
      VALUES (?, ?)
    `);

    const now = createTimestamp();
    
    for (const tagName of tags) {
      const tagId = generateUUID();
      insertStmt.run(tagId, tagName, now);
      linkStmt.run(projectId, tagId);
    }
  }

  /**
   * Initialize project metrics during creation
   */
  private async initializeProjectMetrics(db: Database, projectId: UUID): Promise<void> {
    const insertStmt = db.prepare(`
      INSERT INTO project_metrics (
        projectId, architecturalConsistency, testCoverage, 
        dependencyHealth, contextEfficiency, lastCalculated
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    insertStmt.run(
      projectId,
      1.0,  // Initial perfect consistency
      0.0,  // No tests initially
      1.0,  // No dependencies initially
      1.0,  // Perfect efficiency initially
      createTimestamp()
    );
  }

  /**
   * Update project tags during updates
   */
  private async updateProjectTags(db: Database, projectId: UUID, tags: string[]): Promise<void> {
    // Remove existing tag links
    const deleteLinksStmt = db.prepare('DELETE FROM project_tag_links WHERE projectId = ?');
    deleteLinksStmt.run(projectId);

    // Insert new tags and links
    await this.insertProjectTags(db, projectId, tags);
  }

  /**
   * Enhanced find method with project-specific options
   */
  private async findProjects(
    options: ProjectQueryOptions = {},
    context: RepositoryContext = {}
  ): Promise<ApiResponse<Project[]> | ApiErrorResponse> {
    const baseOptions: QueryOptions = {
      select: options.select,
      where: options.where,
      orderBy: options.orderBy,
      limit: options.limit,
      offset: options.offset,
      includeSoftDeleted: options.includeArchived || false
    };

    const result = await this.find(baseOptions, context);
    if (!isApiSuccess(result)) {
      return result;
    }

    // Parse JSON fields for each project
    const projects = result.data.map(this.parseProjectJsonFields.bind(this));
    
    // Apply project-specific post-processing filters
    const filteredProjects = this.applyProjectPostFilters(projects, options);

    return createApiResponse(filteredProjects);
  }

  /**
   * Apply post-query filters that require parsed data
   */
  private applyProjectPostFilters(projects: Project[], options: ProjectQueryOptions): Project[] {
    let filtered = projects;

    // Filter by languages in tech stack
    if (options.languages && options.languages.length > 0) {
      filtered = filtered.filter(project => 
        options.languages!.some(lang => 
          project.techStack.languages.includes(lang)
        )
      );
    }

    // Filter by project health
    if (options.health && options.health.length > 0) {
      filtered = filtered.filter(project => 
        options.health!.includes(project.health)
      );
    }

    return filtered;
  }

  /**
   * Get repository health status for monitoring
   * Adapts Cline's health monitoring patterns
   */
  public getProjectRepositoryHealth(): {
    totalProjects: number;
    activeProjects: number;
    cacheStatistics: any;
    queryMetrics: typeof this.queryMetrics;
    lastActivity: string;
  } {
    const baseHealth = this.getHealthStatus();
    
    return {
      totalProjects: this.queryMetrics.projectQueries, // Approximation
      activeProjects: 0, // Would be calculated from actual query
      cacheStatistics: {
        ...baseHealth,
        phaseCacheSize: this.phaseCache.size,
        searchCacheSize: this.searchCache.size,
        tagCacheSize: this.tagCache.size
      },
      queryMetrics: { ...this.queryMetrics },
      lastActivity: new Date().toISOString()
    };
  }

  /**
   * Cleanup resources and dispose repository
   * Follows Cline's cleanup patterns for graceful shutdown
   */
  public async dispose(): Promise<void> {
    // Clear project-specific caches
    this.phaseCache.clear();
    this.tagCache.clear();
    this.searchCache.clear();
    
    // Call parent dispose
    await super.dispose();
    
    this.logger.info('ProjectRepository disposed', {
      totalQueries: this.queryMetrics.projectQueries + 
                   this.queryMetrics.phaseQueries + 
                   this.queryMetrics.searchQueries,
      cacheHitRate: this.queryMetrics.cacheHitRate
    });
  }
}

/**
 * Factory function for creating ProjectRepository instances
 * Enables dependency injection and testing following Cline's patterns
 */
export function createProjectRepository(
  databaseService: DatabaseService,
  cacheConfig?: Partial<CacheConfig>
): ProjectRepository {
  return new ProjectRepository(databaseService, cacheConfig);
}

/**
 * Singleton pattern for default project repository instance
 * Adapts Cline's singleton patterns for application-wide consistency
 */
let defaultProjectRepository: ProjectRepository | null = null;

export function getDefaultProjectRepository(
  databaseService: DatabaseService,
  cacheConfig?: Partial<CacheConfig>
): ProjectRepository {
  if (!defaultProjectRepository) {
    defaultProjectRepository = new ProjectRepository(databaseService, cacheConfig);
  }
  return defaultProjectRepository;
}

export function resetDefaultProjectRepository(): void {
  if (defaultProjectRepository) {
    defaultProjectRepository.dispose();
    defaultProjectRepository = null;
  }
}

/**
 * Project repository specific error types
 */
export class ProjectRepositoryError extends RepositoryError {
  constructor(
    message: string,
    code: string = 'PROJECT_REPOSITORY_ERROR',
    statusCode: number = 500,
    details?: Record<string, any>
  ) {
    super(message, code, statusCode, details);
    this.name = 'ProjectRepositoryError';
  }
}

/**
 * Export configuration and constants
 */
export const PROJECT_REPOSITORY_CONFIG = {
  DEFAULT_CACHE_TTL: PROJECT_CACHE_CONFIG.ttl,
  MAX_SEARCH_RESULTS: 1000,
  ANALYTICS_TIMEFRAMES: ['1d', '7d', '30d'] as const,
  SUPPORTED_SEARCH_FIELDS: ['name', 'description', 'tags', 'languages'] as const
} as const;

/**
 * Version information
 */
export const PROJECT_REPOSITORY_VERSION = '1.0.0';

// Re-export types for convenience
export type {
  ProjectQueryOptions,
  ProjectRepositoryContext,
  ProjectDatabaseResult
};

export default ProjectRepository;
