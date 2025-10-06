// packages/project-management/services/__tests__/ProjectService.spec.ts

/**
 * ProjectService Test Suite - Comprehensive Testing for ReadyAI Project Management Orchestrator
 * 
 * This test suite leverages proven patterns from Cline's service testing architecture,
 * adapting their comprehensive mocking, error handling, and integration testing approaches
 * for ReadyAI's project-centric workflow requirements.
 * 
 * Primary Cline Testing Patterns Adapted (90% Pattern Reuse):
 * - Mock service architecture from Cline's ControllerService tests
 * - Comprehensive error scenario testing from Cline's error handling tests
 * - Async operation testing patterns from Cline's task management tests
 * - Dependency injection mocking from Cline's service coordination tests
 * - State management testing from Cline's project state tests
 * - Integration testing patterns from Cline's E2E test framework
 * 
 * ReadyAI-Specific Test Enhancements:
 * - Multi-phase development methodology testing
 * - AI provider integration validation
 * - Context management system testing
 * - Dependency graph validation
 * - Project lifecycle orchestration testing
 * 
 * @version 1.0.0 - Production Ready Test Suite
 * @author ReadyAI Development Team
 */

import { describe, beforeEach, afterEach, it, expect, vi, type MockedFunction, type MockedObject } from 'vitest'

// Core ReadyAI types and utilities
import {
  UUID,
  ApiResponse,
  PhaseType,
  Project,
  ProjectConfig,
  TechStack,
  ValidationResult,
  ReadyAIError,
  generateUUID,
  createTimestamp,
  createApiResponse,
  createApiError,
  wrapAsync,
  AsyncResult,
  isValidUUID,
  ApiResult
} from '../../../foundation/types/core'

// Project management specific types
import {
  ProjectCreationRequest,
  ProjectUpdateRequest,
  ProjectOperationResult,
  ProjectListOptions,
  ProjectSearchFilters,
  ProjectExportOptions,
  ProjectImportOptions,
  ProjectAnalytics,
  createProject,
  validateProject,
  ProjectCreationError,
  ProjectValidationError,
  ProjectNotFoundError
} from '../../types/project'

// Service under test and its dependencies
import { ProjectService, createProjectService, checkProjectServiceHealth } from '../ProjectService'

// Mock dependencies following Cline's dependency injection patterns
import { ProjectCreationService } from '../ProjectCreationService'
import { ProjectConfigurationService } from '../ProjectConfigurationService'
import { ProjectStateManager } from '../ProjectStateManager'
import { ProjectValidator } from '../ProjectValidator'
import { ProjectWorkspaceManager } from '../ProjectWorkspaceManager'
import { PhaseManager } from '../PhaseManager'
import { ProjectOrchestrator } from '../ProjectOrchestrator'
import { ServiceCoordinator } from '../ServiceCoordinator'

// Infrastructure service mocks
import { FileOperationsService } from '../../../filesystem/services/FileOperationsService'
import { WorkspaceManager } from '../../../filesystem/services/WorkspaceManager'
import { DatabaseService } from '../../../database/services/DatabaseService'
import { LoggingService } from '../../../logging/services/LoggingService'
import { ErrorHandler } from '../../../error-handling/services/ErrorHandler'

// =============================================================================
// MOCK IMPLEMENTATIONS (Cline Mock Patterns)
// =============================================================================

// Mock service dependencies with comprehensive method coverage
vi.mock('../ProjectCreationService')
vi.mock('../ProjectConfigurationService')
vi.mock('../ProjectStateManager')
vi.mock('../ProjectValidator')
vi.mock('../ProjectWorkspaceManager')
vi.mock('../PhaseManager')
vi.mock('../ProjectOrchestrator')
vi.mock('../ServiceCoordinator')

// Mock infrastructure dependencies
vi.mock('../../../filesystem/services/FileOperationsService')
vi.mock('../../../filesystem/services/WorkspaceManager')
vi.mock('../../../database/services/DatabaseService')
vi.mock('../../../logging/services/LoggingService')
vi.mock('../../../error-handling/services/ErrorHandler')

// Mock external utilities
vi.mock('../../../foundation/types/core', async () => {
  const actual = await vi.importActual('../../../foundation/types/core')
  return {
    ...actual,
    generateUUID: vi.fn(() => 'test-uuid-123'),
    createTimestamp: vi.fn(() => '2023-01-01T00:00:00.000Z')
  }
})

// =============================================================================
// TEST FIXTURES AND FACTORIES (Cline Test Data Patterns)
// =============================================================================

/**
 * Create mock project for testing - follows Cline's fixture factory patterns
 */
function createMockProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'test-project-id',
    name: 'Test Project',
    description: 'A test project for unit testing',
    currentPhase: 'Phase0_StrategicCharter',
    rootPath: '/test/project',
    techStack: {
      languages: ['TypeScript', 'JavaScript'],
      frontend: 'React',
      backend: 'Node.js',
      database: 'PostgreSQL',
      tools: ['Jest', 'ESLint']
    },
    createdAt: '2023-01-01T00:00:00.000Z',
    lastModified: '2023-01-01T00:00:00.000Z',
    config: {
      quality: {
        testCoverage: 80,
        lintingLevel: 'standard',
        typeChecking: 'strict'
      },
      aiSettings: {
        preferredProvider: 'claude-sonnet-4',
        extendedThinking: true,
        contextCompression: 'standard'
      },
      development: {
        autoSave: true,
        gitIntegration: true,
        checkpointFrequency: 'medium'
      }
    },
    status: 'active',
    tags: ['test', 'sample'],
    metrics: {
      totalFiles: 10,
      totalLines: 500,
      totalTokens: 1000
    },
    ...overrides
  }
}

/**
 * Create mock project creation request
 */
function createMockProjectCreationRequest(overrides: Partial<ProjectCreationRequest> = {}): ProjectCreationRequest {
  return {
    name: 'New Test Project',
    description: 'A new project for testing',
    rootPath: '/test/new-project',
    techStack: {
      languages: ['TypeScript'],
      frontend: 'React',
      backend: 'Node.js',
      tools: ['Vite', 'Jest']
    },
    config: {
      quality: {
        testCoverage: 90,
        lintingLevel: 'strict',
        typeChecking: 'strict'
      },
      aiSettings: {
        preferredProvider: 'claude-sonnet-4',
        extendedThinking: true,
        contextCompression: 'standard'
      }
    },
    tags: ['new', 'test'],
    ...overrides
  }
}

/**
 * Create mock validation result
 */
function createMockValidationResult(
  passed: boolean = true,
  errors: string[] = [],
  warnings: string[] = []
): ValidationResult {
  return {
    id: generateUUID(),
    type: 'project',
    passed,
    errors,
    warnings,
    suggestions: passed ? [] : ['Consider fixing the errors'],
    score: passed ? 100 : Math.max(0, 100 - (errors.length * 20)),
    validatedAt: createTimestamp(),
    validator: 'ProjectService',
    ...(errors.length > 0 && {
      fixes: errors.map(error => ({
        description: `Fix: ${error}`,
        automated: false,
        confidence: 0.8
      }))
    })
  }
}

// =============================================================================
// TEST SUITE SETUP (Cline Test Infrastructure Patterns)
// =============================================================================

describe('ProjectService', () => {
  // Service dependencies - typed mocks following Cline's mock typing patterns
  let mockLogger: MockedObject<LoggingService>
  let mockErrorHandler: MockedObject<ErrorHandler>
  let mockDatabaseService: MockedObject<DatabaseService>
  let mockFileService: MockedObject<FileOperationsService>
  let mockWorkspaceManager: MockedObject<WorkspaceManager>

  // Specialized service mocks
  let mockProjectCreationService: MockedObject<ProjectCreationService>
  let mockProjectConfigurationService: MockedObject<ProjectConfigurationService>
  let mockProjectStateManager: MockedObject<ProjectStateManager>
  let mockProjectValidator: MockedObject<ProjectValidator>
  let mockProjectWorkspaceManager: MockedObject<ProjectWorkspaceManager>
  let mockPhaseManager: MockedObject<PhaseManager>
  let mockProjectOrchestrator: MockedObject<ProjectOrchestrator>
  let mockServiceCoordinator: MockedObject<ServiceCoordinator>

  // Service under test
  let projectService: ProjectService

  beforeEach(() => {
    // Reset all mocks between tests (Cline reset pattern)
    vi.clearAllMocks()

    // Initialize infrastructure service mocks with comprehensive method coverage
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    } as MockedObject<LoggingService>

    mockErrorHandler = {
      handleError: vi.fn(),
      isRetryableError: vi.fn(() => false),
      shouldRetry: vi.fn(() => false)
    } as MockedObject<ErrorHandler>

    mockDatabaseService = {
      projects: {
        create: vi.fn(),
        findById: vi.fn(),
        findByName: vi.fn(),
        findByPath: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        findMany: vi.fn(),
        search: vi.fn()
      }
    } as MockedObject<DatabaseService>

    mockFileService = {
      exists: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      deleteFile: vi.fn(),
      createDirectory: vi.fn()
    } as MockedObject<FileOperationsService>

    mockWorkspaceManager = {
      initializeWorkspace: vi.fn(),
      cleanupWorkspace: vi.fn(),
      validateWorkspacePath: vi.fn(() => true)
    } as MockedObject<WorkspaceManager>

    // Initialize specialized service mocks with detailed method coverage
    mockProjectCreationService = {
      createProject: vi.fn()
    } as MockedObject<ProjectCreationService>

    mockProjectConfigurationService = {
      applyInitialConfiguration: vi.fn(),
      removeProjectConfiguration: vi.fn(),
      getConfigurationMetrics: vi.fn()
    } as MockedObject<ProjectConfigurationService>

    mockProjectStateManager = {
      initializeProject: vi.fn(),
      updateProjectState: vi.fn(),
      getProjectState: vi.fn(),
      removeProject: vi.fn(),
      getStateHistory: vi.fn()
    } as MockedObject<ProjectStateManager>

    mockProjectValidator = {
      validateCreationRequest: vi.fn(),
      validateUpdateRequest: vi.fn()
    } as MockedObject<ProjectValidator>

    mockProjectWorkspaceManager = {
      initializeWorkspace: vi.fn(),
      cleanupWorkspace: vi.fn(),
      hasUnsavedChanges: vi.fn(() => Promise.resolve(false)),
      getWorkspaceMetrics: vi.fn()
    } as MockedObject<ProjectWorkspaceManager>

    mockPhaseManager = {
      initializeProjectPhases: vi.fn(),
      removeProjectPhases: vi.fn(),
      getPhaseAnalytics: vi.fn()
    } as MockedObject<PhaseManager>

    mockProjectOrchestrator = {
      orchestrateProject: vi.fn()
    } as MockedObject<ProjectOrchestrator>

    mockServiceCoordinator = {
      coordinateProjectUpdate: vi.fn(),
      coordinateProjectExport: vi.fn(),
      coordinateProjectImport: vi.fn()
    } as MockedObject<ServiceCoordinator>

    // Create service instance with mocked dependencies
    projectService = new ProjectService(
      mockLogger,
      mockErrorHandler,
      mockDatabaseService,
      mockFileService,
      mockWorkspaceManager
    )

    // Inject mocked specialized services using reflection (Cline dependency injection pattern)
    ;(projectService as any).projectCreationService = mockProjectCreationService
    ;(projectService as any).projectConfigurationService = mockProjectConfigurationService
    ;(projectService as any).projectStateManager = mockProjectStateManager
    ;(projectService as any).projectValidator = mockProjectValidator
    ;(projectService as any).projectWorkspaceManager = mockProjectWorkspaceManager
    ;(projectService as any).phaseManager = mockPhaseManager
    ;(projectService as any).projectOrchestrator = mockProjectOrchestrator
    ;(projectService as any).serviceCoordinator = mockServiceCoordinator
  })

  afterEach(() => {
    // Cleanup after each test
    vi.restoreAllMocks()
  })

  // =============================================================================
  // PROJECT CREATION TESTS (Core Functionality)
  // =============================================================================

  describe('createProject', () => {
    it('should successfully create a new project with valid input', async () => {
      // Arrange - setup successful flow mocks
      const mockRequest = createMockProjectCreationRequest()
      const mockProject = createMockProject()
      const mockValidationResult = createMockValidationResult(true)

      mockProjectValidator.validateCreationRequest.mockResolvedValue(mockValidationResult)
      mockDatabaseService.projects.findByName.mockResolvedValue(null)
      mockDatabaseService.projects.findByPath.mockResolvedValue(null)
      
      mockProjectCreationService.createProject.mockResolvedValue({
        success: true,
        data: {
          project: mockProject,
          warnings: []
        },
        errors: [],
        warnings: [],
        metadata: {
          operation: 'create',
          timestamp: createTimestamp(),
          processingTime: 1000,
          userId: 'test-user',
          details: {}
        }
      })

      mockProjectStateManager.initializeProject.mockResolvedValue()
      mockProjectConfigurationService.applyInitialConfiguration.mockResolvedValue()
      mockProjectWorkspaceManager.initializeWorkspace.mockResolvedValue()
      mockPhaseManager.initializeProjectPhases.mockResolvedValue()
      mockDatabaseService.projects.create.mockResolvedValue(mockProject)

      // Mock validateProject from project types
      vi.mocked(validateProject).mockReturnValue(mockValidationResult)

      // Act
      const result = await projectService.createProject(mockRequest)

      // Assert - comprehensive validation following Cline's assertion patterns
      expect(result.success).toBe(true)
      expect(result.data?.success).toBe(true)
      expect(result.data?.project).toEqual(mockProject)
      expect(result.data?.errors).toHaveLength(0)

      // Verify service orchestration calls
      expect(mockProjectValidator.validateCreationRequest).toHaveBeenCalledWith(mockRequest)
      expect(mockDatabaseService.projects.findByName).toHaveBeenCalledWith(mockRequest.name)
      expect(mockProjectCreationService.createProject).toHaveBeenCalledWith(mockRequest)
      expect(mockProjectStateManager.initializeProject).toHaveBeenCalledWith(mockProject)
      expect(mockProjectConfigurationService.applyInitialConfiguration).toHaveBeenCalledWith(
        mockProject.id,
        mockProject.config
      )
      expect(mockProjectWorkspaceManager.initializeWorkspace).toHaveBeenCalledWith(mockProject)
      expect(mockPhaseManager.initializeProjectPhases).toHaveBeenCalledWith(mockProject)
      expect(mockDatabaseService.projects.create).toHaveBeenCalledWith(mockProject)

      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting project creation',
        expect.objectContaining({
          service: 'ProjectService',
          operation: 'createProject',
          projectName: mockRequest.name
        })
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Project creation completed successfully',
        expect.objectContaining({
          service: 'ProjectService',
          operation: 'createProject',
          projectId: mockProject.id
        })
      )
    })

    it('should fail project creation when validation fails', async () => {
      // Arrange - setup validation failure
      const mockRequest = createMockProjectCreationRequest()
      const mockValidationResult = createMockValidationResult(false, ['Invalid project name'])

      mockProjectValidator.validateCreationRequest.mockResolvedValue(mockValidationResult)

      // Act
      const result = await projectService.createProject(mockRequest)

      // Assert - verify error handling
      expect(result.success).toBe(true) // wrapAsync always returns success, but data shows failure
      expect(result.data?.success).toBe(false)
      expect(result.data?.errors).toHaveLength(1)
      expect(result.data?.errors[0].errors).toContain('Project creation request validation failed')

      // Verify no further operations were performed
      expect(mockProjectCreationService.createProject).not.toHaveBeenCalled()
      expect(mockDatabaseService.projects.create).not.toHaveBeenCalled()

      // Verify error logging
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Project creation failed',
        expect.objectContaining({
          service: 'ProjectService',
          operation: 'createProject'
        })
      )
    })

    it('should fail when project name already exists', async () => {
      // Arrange - setup name conflict
      const mockRequest = createMockProjectCreationRequest()
      const existingProject = createMockProject({ name: mockRequest.name })
      const mockValidationResult = createMockValidationResult(true)

      mockProjectValidator.validateCreationRequest.mockResolvedValue(mockValidationResult)
      mockDatabaseService.projects.findByName.mockResolvedValue(existingProject)

      // Act & Assert - should throw ProjectCreationError
      const result = await projectService.createProject(mockRequest)

      expect(result.success).toBe(true)
      expect(result.data?.success).toBe(false)
      expect(result.data?.errors[0].errors[0]).toContain(`Project with name "${mockRequest.name}" already exists`)
    })

    it('should fail when project path already exists', async () => {
      // Arrange - setup path conflict
      const mockRequest = createMockProjectCreationRequest()
      const existingProject = createMockProject({ rootPath: mockRequest.rootPath })
      const mockValidationResult = createMockValidationResult(true)

      mockProjectValidator.validateCreationRequest.mockResolvedValue(mockValidationResult)
      mockDatabaseService.projects.findByName.mockResolvedValue(null)
      mockDatabaseService.projects.findByPath.mockResolvedValue(existingProject)

      // Act
      const result = await projectService.createProject(mockRequest)

      // Assert
      expect(result.success).toBe(true)
      expect(result.data?.success).toBe(false)
      expect(result.data?.errors[0].errors[0]).toContain(`Project already exists at path: ${mockRequest.rootPath}`)
    })

    it('should rollback on final validation failure', async () => {
      // Arrange - setup rollback scenario
      const mockRequest = createMockProjectCreationRequest()
      const mockProject = createMockProject()
      const mockValidationResult = createMockValidationResult(true)
      const failedValidationResult = createMockValidationResult(false, ['Final validation failed'])

      mockProjectValidator.validateCreationRequest.mockResolvedValue(mockValidationResult)
      mockDatabaseService.projects.findByName.mockResolvedValue(null)
      mockDatabaseService.projects.findByPath.mockResolvedValue(null)

      mockProjectCreationService.createProject.mockResolvedValue({
        success: true,
        data: { project: mockProject, warnings: [] },
        errors: [],
        warnings: [],
        metadata: {
          operation: 'create',
          timestamp: createTimestamp(),
          processingTime: 1000,
          userId: 'test-user',
          details: {}
        }
      })

      // Setup successful intermediate steps
      mockProjectStateManager.initializeProject.mockResolvedValue()
      mockProjectConfigurationService.applyInitialConfiguration.mockResolvedValue()
      mockProjectWorkspaceManager.initializeWorkspace.mockResolvedValue()
      mockPhaseManager.initializeProjectPhases.mockResolvedValue()
      mockDatabaseService.projects.create.mockResolvedValue(mockProject)

      // Mock final validation failure
      vi.mocked(validateProject).mockReturnValue(failedValidationResult)

      // Mock rollback operations
      mockDatabaseService.projects.delete.mockResolvedValue()
      mockProjectStateManager.removeProject.mockResolvedValue()
      mockProjectConfigurationService.removeProjectConfiguration.mockResolvedValue()
      mockPhaseManager.removeProjectPhases.mockResolvedValue()

      // Act
      const result = await projectService.createProject(mockRequest)

      // Assert
      expect(result.success).toBe(true)
      expect(result.data?.success).toBe(false)
      expect(result.data?.errors[0].errors[0]).toContain('Project failed final validation after creation')

      // Verify rollback operations were called
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Rolling back failed project creation',
        expect.objectContaining({
          service: 'ProjectService',
          operation: 'rollbackProjectCreation',
          projectId: mockProject.id
        })
      )
    })

    it('should handle service coordination failures gracefully', async () => {
      // Arrange - setup service failure
      const mockRequest = createMockProjectCreationRequest()
      const mockValidationResult = createMockValidationResult(true)

      mockProjectValidator.validateCreationRequest.mockResolvedValue(mockValidationResult)
      mockDatabaseService.projects.findByName.mockResolvedValue(null)
      mockDatabaseService.projects.findByPath.mockResolvedValue(null)

      // Mock creation service failure
      mockProjectCreationService.createProject.mockResolvedValue({
        success: false,
        errors: [createMockValidationResult(false, ['Service creation failed'])],
        warnings: [],
        metadata: {
          operation: 'create',
          timestamp: createTimestamp(),
          processingTime: 1000,
          userId: 'test-user',
          details: {}
        }
      })

      // Act
      const result = await projectService.createProject(mockRequest)

      // Assert
      expect(result.success).toBe(true)
      expect(result.data?.success).toBe(false)
      expect(result.data?.errors[0].errors[0]).toContain('Project creation failed during service execution')

      // Verify no database persistence occurred
      expect(mockDatabaseService.projects.create).not.toHaveBeenCalled()
    })
  })

  // =============================================================================
  // PROJECT RETRIEVAL TESTS
  // =============================================================================

  describe('getProject', () => {
    it('should successfully retrieve an existing project', async () => {
      // Arrange
      const projectId = 'test-project-id'
      const mockProject = createMockProject({ id: projectId })
      const mockProjectState = {
        currentPhase: 'Phase1_ArchitecturalBlueprint' as PhaseType,
        status: 'active' as const,
        health: 'good' as const,
        lastModified: '2023-01-02T00:00:00.000Z'
      }

      mockDatabaseService.projects.findById.mockResolvedValue(mockProject)
      mockProjectStateManager.getProjectState.mockResolvedValue(mockProjectState)

      // Act
      const result = await projectService.getProject(projectId)

      // Assert
      expect(result.success).toBe(true)
      expect(result.data?.id).toBe(projectId)
      expect(result.data?.currentPhase).toBe('Phase1_ArchitecturalBlueprint')
      expect(result.data?.status).toBe('active')
      expect(result.data?.lastModified).toBe('2023-01-02T00:00:00.000Z')

      expect(mockDatabaseService.projects.findById).toHaveBeenCalledWith(projectId)
      expect(mockProjectStateManager.getProjectState).toHaveBeenCalledWith(projectId)
    })

    it('should fail with invalid UUID format', async () => {
      // Arrange
      const invalidUuid = 'invalid-uuid'

      // Mock the UUID validation to return false
      vi.mocked(isValidUUID).mockReturnValue(false)

      // Act
      const result = await projectService.getProject(invalidUuid)

      // Assert
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProjectValidationError)
      expect(result.error?.message).toContain('Invalid project ID format')

      expect(mockDatabaseService.projects.findById).not.toHaveBeenCalled()
    })

    it('should fail when project does not exist', async () => {
      // Arrange
      const projectId = 'non-existent-project'

      mockDatabaseService.projects.findById.mockResolvedValue(null)

      // Act
      const result = await projectService.getProject(projectId)

      // Assert
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProjectNotFoundError)
      expect(result.error?.message).toContain('Project not found: non-existent-project')

      expect(mockDatabaseService.projects.findById).toHaveBeenCalledWith(projectId)
    })

    it('should handle database errors gracefully', async () => {
      // Arrange
      const projectId = 'test-project-id'
      const dbError = new Error('Database connection failed')

      mockDatabaseService.projects.findById.mockRejectedValue(dbError)

      // Act
      const result = await projectService.getProject(projectId)

      // Assert
      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('Database connection failed')
    })
  })

  // =============================================================================
  // PROJECT UPDATE TESTS
  // =============================================================================

  describe('updateProject', () => {
    it('should successfully update an existing project', async () => {
      // Arrange
      const projectId = 'test-project-id'
      const mockProject = createMockProject({ id: projectId })
      const updateRequest: ProjectUpdateRequest = {
        name: 'Updated Project Name',
        description: 'Updated description',
        status: 'paused',
        tags: ['updated', 'test']
      }

      const updatedProject = { ...mockProject, ...updateRequest }
      const mockValidationResult = createMockValidationResult(true)

      // Mock successful retrieval
      mockDatabaseService.projects.findById.mockResolvedValue(mockProject)
      mockProjectStateManager.getProjectState.mockResolvedValue({
        currentPhase: mockProject.currentPhase,
        status: mockProject.status,
        health: 'good',
        lastModified: mockProject.lastModified
      })

      // Mock successful validation and update
      mockProjectValidator.validateUpdateRequest.mockResolvedValue(mockValidationResult)
      mockServiceCoordinator.coordinateProjectUpdate.mockResolvedValue({
        success: true,
        data: updatedProject,
        errors: [],
        warnings: [],
        metadata: {
          operation: 'update',
          timestamp: createTimestamp(),
          processingTime: 500,
          userId: 'test-user',
          details: {}
        }
      })

      mockDatabaseService.projects.update.mockResolvedValue(updatedProject)
      mockProjectStateManager.updateProjectState.mockResolvedValue()

      // Act
      const result = await projectService.updateProject(projectId, updateRequest)

      // Assert
      expect(result.success).toBe(true)
      expect(result.data?.success).toBe(true)
      expect(result.data?.project.name).toBe('Updated Project Name')
      expect(result.data?.project.description).toBe('Updated description')

      expect(mockProjectValidator.validateUpdateRequest).toHaveBeenCalledWith(mockProject, updateRequest)
      expect(mockServiceCoordinator.coordinateProjectUpdate).toHaveBeenCalledWith(mockProject, updateRequest)
      expect(mockDatabaseService.projects.update).toHaveBeenCalledWith(projectId, updatedProject)
    })

    it('should fail when project does not exist for update', async () => {
      // Arrange
      const projectId = 'non-existent-project'
      const updateRequest: ProjectUpdateRequest = { name: 'New Name' }

      mockDatabaseService.projects.findById.mockResolvedValue(null)

      // Act
      const result = await projectService.updateProject(projectId, updateRequest)

      // Assert
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProjectNotFoundError)
      expect(result.error?.message).toContain('Cannot update project: non-existent-project')

      expect(mockServiceCoordinator.coordinateProjectUpdate).not.toHaveBeenCalled()
    })

    it('should fail when update validation fails', async () => {
      // Arrange
      const projectId = 'test-project-id'
      const mockProject = createMockProject({ id: projectId })
      const updateRequest: ProjectUpdateRequest = { name: 'Invalid Name!' }
      const failedValidationResult = createMockValidationResult(false, ['Invalid name format'])

      mockDatabaseService.projects.findById.mockResolvedValue(mockProject)
      mockProjectStateManager.getProjectState.mockResolvedValue({
        currentPhase: mockProject.currentPhase,
        status: mockProject.status,
        health: 'good',
        lastModified: mockProject.lastModified
      })

      mockProjectValidator.validateUpdateRequest.mockResolvedValue(failedValidationResult)

      // Act
      const result = await projectService.updateProject(projectId, updateRequest)

      // Assert
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProjectValidationError)
      expect(result.error?.message).toContain('Project update validation failed')

      expect(mockServiceCoordinator.coordinateProjectUpdate).not.toHaveBeenCalled()
    })
  })

  // =============================================================================
  // PROJECT DELETION TESTS
  // =============================================================================

  describe('deleteProject', () => {
    it('should successfully delete a project with cleanup', async () => {
      // Arrange
      const projectId = 'test-project-id'
      const mockProject = createMockProject({ id: projectId })

      mockDatabaseService.projects.findById.mockResolvedValue(mockProject)
      mockProjectStateManager.getProjectState.mockResolvedValue({
        currentPhase: mockProject.currentPhase,
        status: 'paused',
        health: 'good',
        lastModified: mockProject.lastModified
      })

      // Mock safety check success
      const mockSafetyCheck = createMockValidationResult(true)
      ;(projectService as any).validateProjectDeletion = vi.fn().mockResolvedValue(mockSafetyCheck)

      // Mock cleanup operations
      mockProjectWorkspaceManager.cleanupWorkspace.mockResolvedValue()
      mockProjectStateManager.removeProject.mockResolvedValue()
      mockProjectConfigurationService.removeProjectConfiguration.mockResolvedValue()
      mockPhaseManager.removeProjectPhases.mockResolvedValue()
      mockDatabaseService.projects.delete.mockResolvedValue()

      // Act
      const result = await projectService.deleteProject(projectId, { force: false, cleanup: true })

      // Assert
      expect(result.success).toBe(true)
      expect(result.data?.deleted).toBe(true)
      expect(result.data?.cleanupDetails).toContain('Workspace files removed')
      expect(result.data?.cleanupDetails).toContain('Service state cleaned up')
      expect(result.data?.cleanupDetails).toContain('Database record removed')

      expect(mockProjectWorkspaceManager.cleanupWorkspace).toHaveBeenCalledWith(mockProject)
      expect(mockDatabaseService.projects.delete).toHaveBeenCalledWith(projectId)
    })

    it('should force delete without safety checks', async () => {
      // Arrange
      const projectId = 'test-project-id'
      const mockProject = createMockProject({ id: projectId })

      mockDatabaseService.projects.findById.mockResolvedValue(mockProject)
      mockProjectStateManager.getProjectState.mockResolvedValue({
        currentPhase: mockProject.currentPhase,
        status: 'active',
        health: 'warning',
        lastModified: mockProject.lastModified
      })

      // Mock service cleanup operations
      mockProjectStateManager.removeProject.mockResolvedValue()
      mockProjectConfigurationService.removeProjectConfiguration.mockResolvedValue()
      mockPhaseManager.removeProjectPhases.mockResolvedValue()
      mockDatabaseService.projects.delete.mockResolvedValue()

      // Act
      const result = await projectService.deleteProject(projectId, { force: true, cleanup: false })

      // Assert
      expect(result.success).toBe(true)
      expect(result.data?.deleted).toBe(true)

      // Should skip safety checks when forced
      expect((projectService as any).validateProjectDeletion).not.toHaveBeenCalled()
      // Should not cleanup workspace when cleanup: false
      expect(mockProjectWorkspaceManager.cleanupWorkspace).not.toHaveBeenCalled()
    })

    it('should fail when safety checks fail and not forced', async () => {
      // Arrange
      const projectId = 'test-project-id'
      const mockProject = createMockProject({ id: projectId })

      mockDatabaseService.projects.findById.mockResolvedValue(mockProject)
      mockProjectStateManager.getProjectState.mockResolvedValue({
        currentPhase: mockProject.currentPhase,
        status: 'active',
        health: 'good',
        lastModified: mockProject.lastModified
      })

      // Mock safety check failure
      const failedSafetyCheck = createMockValidationResult(false, ['Project has active processes'])
      ;(projectService as any).validateProjectDeletion = vi.fn().mockResolvedValue(failedSafetyCheck)

      // Act
      const result = await projectService.deleteProject(projectId, { force: false })

      // Assert
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ReadyAIError)
      expect(result.error?.message).toContain('Project deletion blocked by safety checks')

      expect(mockDatabaseService.projects.delete).not.toHaveBeenCalled()
    })
  })

  // =============================================================================
  // PROJECT LISTING AND SEARCH TESTS
  // =============================================================================

  describe('listProjects', () => {
    it('should successfully list projects with default options', async () => {
      // Arrange
      const mockProjects = [
        createMockProject({ id: 'project-1', name: 'Project 1' }),
        createMockProject({ id: 'project-2', name: 'Project 2' })
      ]

      const mockDbResult = {
        items: mockProjects,
        total: 2,
        hasNext: false
      }

      mockDatabaseService.projects.findMany.mockResolvedValue(mockDbResult)
      mockProjectStateManager.getProjectState
        .mockResolvedValueOnce({
          currentPhase: 'Phase1_ArchitecturalBlueprint' as PhaseType,
          status: 'active',
          health: 'good',
          lastModified: '2023-01-02T00:00:00.000Z'
        })
        .mockResolvedValueOnce({
          currentPhase: 'Phase0_StrategicCharter' as PhaseType,
          status: 'paused',
          health: 'warning',
          lastModified: '2023-01-01T00:00:00.000Z'
        })

      // Act
      const result = await projectService.listProjects()

      // Assert
      expect(result.success).toBe(true)
      expect(result.data?.projects).toHaveLength(2)
      expect(result.data?.total).toBe(2)
      expect(result.data?.page).toBe(1)
      expect(result.data?.pageSize).toBe(20)
      expect(result.data?.hasMore).toBe(false)

      expect(mockDatabaseService.projects.findMany).toHaveBeenCalledWith(
        expect.objectContaining({}),
        expect.objectContaining({
          page: 1,
          pageSize: 20,
          sortBy: 'lastModified',
          sortOrder: 'desc'
        })
      )
    })

    it('should apply custom filtering options', async () => {
      // Arrange
      const options: ProjectListOptions = {
        page: 2,
        pageSize: 10,
        status: ['active'],
        phase: ['Phase1_ArchitecturalBlueprint'],
        techStack: {
          languages: ['TypeScript']
        },
        tags: ['production'],
        sortBy: 'name',
        sortOrder: 'asc'
      }

      const mockDbResult = {
        items: [],
        total: 0,
        hasNext: false
      }

      mockDatabaseService.projects.findMany.mockResolvedValue(mockDbResult)

      // Act
      const result = await projectService.listProjects(options)

      // Assert
      expect(result.success).toBe(true)
      expect(mockDatabaseService.projects.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          status: { $in: ['active'] },
          currentPhase: { $in: ['Phase1_ArchitecturalBlueprint'] },
          'techStack.languages': { $in: ['TypeScript'] },
          tags: { $in: ['production'] }
        }),
        expect.objectContaining({
          page: 2,
          pageSize: 10,
          sortBy: 'name',
          sortOrder: 'asc'
        })
      )
    })
  })

  describe('searchProjects', () => {
    it('should successfully search projects with query and filters', async () => {
      // Arrange
      const query = 'test project'
      const filters: ProjectSearchFilters = {
        techStack: { languages: ['JavaScript'] },
        status: ['active'],
        limit: 10
      }

      const mockSearchResults = [
        createMockProject({ id: 'search-1', name: 'Test Project 1' })
      ]

      mockDatabaseService.projects.search.mockResolvedValue(mockSearchResults)
      mockProjectStateManager.getProjectState.mockResolvedValue({
        currentPhase: 'Phase0_StrategicCharter' as PhaseType,
        status: 'active',
        health: 'good',
        lastModified: '2023-01-01T00:00:00.000Z'
      })

      // Act
      const result = await projectService.searchProjects(query, filters)

      // Assert
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(1)
      expect(result.data?.[0].name).toBe('Test Project 1')

      expect(mockDatabaseService.projects.search).toHaveBeenCalledWith(query, {
        techStack: { languages: ['JavaScript'] },
        phase: undefined,
        status: ['active'],
        tags: undefined,
        dateRange: undefined,
        complexity: undefined,
        priority: undefined,
        limit: 10
      })
    })
  })

  // =============================================================================
  // PROJECT ANALYTICS TESTS
  // =============================================================================

  describe('getProjectAnalytics', () => {
    it('should successfully generate project analytics', async () => {
      // Arrange
      const projectId = 'test-project-id'
      const timeframe = '30d'
      const mockProject = createMockProject({ id: projectId })

      mockDatabaseService.projects.findById.mockResolvedValue(mockProject)
      mockProjectStateManager.getProjectState.mockResolvedValue({
        currentPhase: mockProject.currentPhase,
        status: mockProject.status,
        health: 'good',
        lastModified: mockProject.lastModified
      })

      // Mock analytics from various services
      mockPhaseManager.getPhaseAnalytics.mockResolvedValue({
        success: true,
        data: {
          currentPhase: mockProject.currentPhase,
          completedPhases: [],
          totalPhases: 8,
          progressPercentage: 12.5
        }
      })

      mockProjectStateManager.getStateHistory.mockResolvedValue({
        success: true,
        data: [
          {
            timestamp: '2023-01-01T00:00:00.000Z',
            phase: 'Phase0_StrategicCharter',
            status: 'active'
          }
        ]
      })

      mockProjectWorkspaceManager.getWorkspaceMetrics.mockResolvedValue({
        success: true,
        data: {
          totalFiles: 10,
          totalLines: 500,
          fileTypes: { '.ts': 5, '.js': 3, '.json': 2 },
          sizeInBytes: 25000
        }
      })

      mockProjectConfigurationService.getConfigurationMetrics.mockResolvedValue({
        success: true,
        data: {
          score: 95,
          issues: [],
          recommendations: ['Consider enabling auto-save']
        }
      })

      // Act
      const result = await projectService.getProjectAnalytics(projectId, timeframe)

      // Assert
      expect(result.success).toBe(true)
      expect(result.data?.projectId).toBe(projectId)
      expect(result.data?.timeframe).toBe(timeframe)
      expect(result.data?.phaseProgress.progressPercentage).toBe(12.5)
      expect(result.data?.workspaceMetrics.totalFiles).toBe(10)
      expect(result.data?.summary.healthScore).toBe(100) // 'good' health = 100

      expect(mockPhaseManager.getPhaseAnalytics).toHaveBeenCalledWith(projectId, timeframe)
      expect(mockProjectStateManager.getStateHistory).toHaveBeenCalledWith(projectId, timeframe)
    })
  })

  // =============================================================================
  // IMPORT/EXPORT TESTS
  // =============================================================================

  describe('exportProject', () => {
    it('should successfully export project with options', async () => {
      // Arrange
      const projectId = 'test-project-id'
      const options: ProjectExportOptions = {
        includeWorkspace: true,
        includeHistory: false,
        format: 'zip'
      }

      const mockProject = createMockProject({ id: projectId })
      const mockExportResult = {
        exportPath: '/tmp/project-export.zip',
        metadata: {
          size: 1024000,
          timestamp: createTimestamp(),
          format: 'zip'
        }
      }

      mockDatabaseService.projects.findById.mockResolvedValue(mockProject)
      mockProjectStateManager.getProjectState.mockResolvedValue({
        currentPhase: mockProject.currentPhase,
        status: mockProject.status,
        health: 'good',
        lastModified: mockProject.lastModified
      })

      mockServiceCoordinator.coordinateProjectExport.mockResolvedValue({
        success: true,
        data: mockExportResult,
        errors: [],
        warnings: [],
        metadata: {
          operation: 'export',
          timestamp: createTimestamp(),
          processingTime: 2000,
          userId: 'test-user',
          details: {}
        }
      })

      // Act
      const result = await projectService.exportProject(projectId, options)

      // Assert
      expect(result.success).toBe(true)
      expect(result.data?.exportPath).toBe('/tmp/project-export.zip')
      expect(result.data?.metadata.format).toBe('zip')

      expect(mockServiceCoordinator.coordinateProjectExport).toHaveBeenCalledWith(mockProject, options)
    })
  })

  describe('importProject', () => {
    it('should successfully import project from external source', async () => {
      // Arrange
      const options: ProjectImportOptions = {
        source: 'file',
        path: '/tmp/project-import.zip',
        overwriteExisting: false
      }

      const importedProject = createMockProject({ name: 'Imported Project' })
      const mockImportResult = {
        success: true,
        project: importedProject,
        errors: [],
        warnings: ['Some configurations were updated'],
        metadata: {
          operation: 'import' as const,
          timestamp: createTimestamp(),
          processingTime: 3000,
          userId: 'test-user',
          details: {
            importSource: 'file',
            importedFiles: 15
          }
        }
      }

      mockServiceCoordinator.coordinateProjectImport.mockResolvedValue({
        success: true,
        data: mockImportResult,
        errors: [],
        warnings: [],
        metadata: {
          operation: 'import',
          timestamp: createTimestamp(),
          processingTime: 3000,
          userId: 'test-user',
          details: {}
        }
      })

      mockDatabaseService.projects.create.mockResolvedValue(importedProject)
      mockProjectStateManager.initializeProject.mockResolvedValue()

      // Act
      const result = await projectService.importProject(options)

      // Assert
      expect(result.success).toBe(true)
      expect(result.data?.project.name).toBe('Imported Project')
      expect(result.data?.warnings).toContain('Some configurations were updated')

      expect(mockServiceCoordinator.coordinateProjectImport).toHaveBeenCalledWith(options)
      expect(mockDatabaseService.projects.create).toHaveBeenCalledWith(importedProject)
      expect(mockProjectStateManager.initializeProject).toHaveBeenCalledWith(importedProject)
    })
  })

  // =============================================================================
  // SERVICE FACTORY AND HEALTH CHECK TESTS
  // =============================================================================

  describe('createProjectService factory', () => {
    it('should create ProjectService with proper dependencies', () => {
      // Act
      const service = createProjectService(
        mockLogger,
        mockErrorHandler,
        mockDatabaseService,
        mockFileService,
        mockWorkspaceManager
      )

      // Assert
      expect(service).toBeInstanceOf(ProjectService)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'ProjectService initialized with all dependencies',
        expect.objectContaining({
          service: 'ProjectService',
          operation: 'constructor'
        })
      )
    })
  })

  describe('checkProjectServiceHealth', () => {
    it('should return healthy status when all checks pass', async () => {
      // Act
      const health = await checkProjectServiceHealth()

      // Assert
      expect(health.status).toBe('healthy')
      expect(health.details.checks).toEqual({
        dependencies: 'healthy',
        database: 'healthy',
        filesystem: 'healthy'
      })
      expect(health.details.version).toBe('1.0.0')
    })

    it('should handle health check errors gracefully', async () => {
      // Arrange - force an error in health check by mocking a throwing function
      const originalTimestamp = createTimestamp
      vi.mocked(createTimestamp).mockImplementation(() => {
        throw new Error('Health check failed')
      })

      // Act
      const health = await checkProjectServiceHealth()

      // Assert
      expect(health.status).toBe('unhealthy')
      expect(health.details.error).toBe('Health check failed')

      // Cleanup
      vi.mocked(createTimestamp).mockImplementation(originalTimestamp)
    })
  })

  // =============================================================================
  // ERROR HANDLING AND EDGE CASES
  // =============================================================================

  describe('error handling edge cases', () => {
    it('should handle concurrent project creation attempts', async () => {
      // This tests the race condition handling for project creation
      const mockRequest = createMockProjectCreationRequest()

      // Setup validation to pass
      mockProjectValidator.validateCreationRequest.mockResolvedValue(createMockValidationResult(true))
      
      // First call succeeds, second fails with conflict
      mockDatabaseService.projects.findByName
        .mockResolvedValueOnce(null) // First check passes
        .mockResolvedValueOnce(createMockProject({ name: mockRequest.name })) // Second check fails

      // Start both operations concurrently
      const [result1, result2] = await Promise.all([
        projectService.createProject(mockRequest),
        projectService.createProject(mockRequest)
      ])

      // One should succeed, one should fail
      const successCount = [result1, result2].filter(r => r.success && r.data?.success).length
      const failureCount = [result1, result2].filter(r => !r.success || !r.data?.success).length

      expect(successCount + failureCount).toBe(2)
      expect(failureCount).toBeGreaterThan(0) // At least one should fail due to conflict
    })

    it('should handle network timeouts gracefully', async () => {
      // Arrange
      const projectId = 'test-project-id'
      const timeoutError = new Error('Request timeout')
      timeoutError.name = 'TimeoutError'

      mockDatabaseService.projects.findById.mockRejectedValue(timeoutError)

      // Act
      const result = await projectService.getProject(projectId)

      // Assert
      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('Request timeout')
    })

    it('should handle partial service failures during project creation', async () => {
      // Test scenario where some services succeed but others fail
      const mockRequest = createMockProjectCreationRequest()
      const mockProject = createMockProject()

      // Setup successful validation and creation
      mockProjectValidator.validateCreationRequest.mockResolvedValue(createMockValidationResult(true))
      mockDatabaseService.projects.findByName.mockResolvedValue(null)
      mockDatabaseService.projects.findByPath.mockResolvedValue(null)
      
      mockProjectCreationService.createProject.mockResolvedValue({
        success: true,
        data: { project: mockProject, warnings: [] },
        errors: [],
        warnings: [],
        metadata: {
          operation: 'create',
          timestamp: createTimestamp(),
          processingTime: 1000,
          userId: 'test-user',
          details: {}
        }
      })

      // Some services succeed
      mockProjectStateManager.initializeProject.mockResolvedValue()
      mockProjectConfigurationService.applyInitialConfiguration.mockResolvedValue()
      
      // But workspace initialization fails
      mockProjectWorkspaceManager.initializeWorkspace.mockRejectedValue(new Error('Workspace initialization failed'))

      // Act
      const result = await projectService.createProject(mockRequest)

      // Assert
      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('Workspace initialization failed')
    })
  })
})
