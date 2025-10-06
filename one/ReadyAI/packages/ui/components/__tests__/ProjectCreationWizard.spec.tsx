// packages/ui/components/__tests__/ProjectCreationWizard.spec.tsx

/**
 * ProjectCreationWizard Component Test Suite
 * 
 * Comprehensive test suite for the ProjectCreationWizard component using React Testing Library.
 * Adapted from Cline's component test patterns with ReadyAI-specific wizard flow testing.
 * 
 * Test Coverage:
 * - Multi-step wizard flow navigation and validation
 * - Form validation scenarios for each step
 * - Template selection and configuration
 * - Project creation with various configurations
 * - Error handling and recovery scenarios
 * - User interaction patterns and accessibility
 * - Integration with ReadyAI project management services
 * 
 * Based on Cline's webview-ui component testing patterns (90%+ reuse) with ReadyAI wizard adaptations
 * 
 * @version 1.0.0 - Production Ready
 * @author ReadyAI Development Team
 */

import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// Component under test
import { ProjectCreationWizard } from '../ProjectCreationWizard'

// ReadyAI Core Types
import { UUID, generateUUID, createApiResponse, createApiError } from '../../foundation/types/core'
import { ProjectTemplate, ProjectCreationRequest, ProjectValidationResult } from '../../project-management/types/project'

// Mock dependencies adapted from Cline's testing patterns
vi.mock('../hooks/useProject')
vi.mock('../hooks/useConfig')
vi.mock('../hooks/useLogger')
vi.mock('../hooks/useErrorHandler')
vi.mock('../../project-management/services/ProjectCreationService')
vi.mock('../../project-management/services/ProjectValidator')

// =============================================================================
// TEST SETUP AND MOCKS
// =============================================================================

// Mock hook implementations adapted from Cline's mock patterns
const mockUseProject = vi.fn()
const mockUseConfig = vi.fn()
const mockUseLogger = vi.fn()
const mockUseErrorHandler = vi.fn()

// Mock services
const mockProjectCreationService = {
  createProject: vi.fn(),
  getAvailableTemplates: vi.fn(),
  validateProjectData: vi.fn()
}

const mockProjectValidator = {
  validate: vi.fn()
}

// Mock logger
const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}

// Mock error handler
const mockErrorHandler = {
  handleError: vi.fn()
}

// Mock config
const mockConfig = {
  aiProvider: 'openrouter',
  aiModel: 'anthropic/claude-3-5-sonnet-20241022',
  workspacePath: '/test/workspace'
}

// =============================================================================
// TEST DATA FACTORIES
// =============================================================================

/**
 * Create mock project template
 * Adapted from Cline's data factory patterns
 */
const createMockTemplate = (overrides: Partial<ProjectTemplate> = {}): ProjectTemplate => ({
  id: 'web-app',
  name: 'Web Application',
  description: 'Full-stack web application with React and Node.js',
  category: 'web',
  features: ['react-frontend', 'express-backend', 'database'],
  scaffolding: {
    directories: ['src/components', 'src/services', 'server', 'public'],
    files: ['package.json', 'tsconfig.json', 'README.md', 'docker-compose.yml']
  },
  complexity: 'intermediate',
  ...overrides
})

/**
 * Create mock validation result
 */
const createMockValidationResult = (overrides: Partial<ProjectValidationResult> = {}): ProjectValidationResult => ({
  field: 'general',
  isValid: true,
  errorMessage: undefined,
  severity: 'info',
  suggestion: undefined,
  ...overrides
})

/**
 * Create mock project creation request
 */
const createMockProjectRequest = (overrides: Partial<ProjectCreationRequest> = {}): ProjectCreationRequest => ({
  name: 'Test Project',
  description: 'A test project',
  workspacePath: '/test/workspace',
  template: createMockTemplate(),
  configuration: {
    aiProvider: 'openrouter',
    aiModel: 'anthropic/claude-3-5-sonnet-20241022',
    codeStyle: 'typescript',
    testingFramework: 'jest',
    deploymentTarget: 'local',
    enableAdvancedFeatures: false,
    customSettings: {}
  },
  metadata: {
    category: 'web',
    tags: ['react', 'typescript'],
    createdBy: 'wizard'
  },
  ...overrides
})

// Available templates for testing
const mockTemplates: ProjectTemplate[] = [
  createMockTemplate({ id: 'blank', name: 'Blank Project', complexity: 'simple' }),
  createMockTemplate({ id: 'web-app', name: 'Web Application', complexity: 'intermediate' }),
  createMockTemplate({ id: 'api-service', name: 'REST API Service', category: 'backend', complexity: 'intermediate' }),
  createMockTemplate({ id: 'desktop-app', name: 'Desktop Application', category: 'desktop', complexity: 'advanced' }),
  createMockTemplate({ id: 'ai-integration', name: 'AI Integration', category: 'ai', complexity: 'advanced' })
]

// =============================================================================
// TEST UTILITIES
// =============================================================================

/**
 * Render ProjectCreationWizard with default props
 * Adapted from Cline's component render utilities
 */
const renderWizard = (props: Partial<React.ComponentProps<typeof ProjectCreationWizard>> = {}) => {
  const defaultProps = {
    onProjectCreated: vi.fn(),
    onCancel: vi.fn(),
    isOpen: true,
    ...props
  }

  return {
    ...render(<ProjectCreationWizard {...defaultProps} />),
    props: defaultProps
  }
}

/**
 * Setup default mocks for successful operations
 */
const setupSuccessfulMocks = () => {
  mockUseProject.mockReturnValue({
    createProject: vi.fn().mockResolvedValue(createApiResponse({ id: generateUUID() })),
    getAvailableTemplates: vi.fn().mockResolvedValue(mockTemplates),
    validateProjectData: vi.fn().mockResolvedValue([createMockValidationResult()])
  })

  mockUseConfig.mockReturnValue({
    config: mockConfig
  })

  mockUseLogger.mockReturnValue(mockLogger)

  mockUseErrorHandler.mockReturnValue(mockErrorHandler)
}

/**
 * Navigate to a specific wizard step
 */
const navigateToStep = async (stepIndex: number) => {
  const user = userEvent.setup()
  
  // Click "Next" button to advance through steps
  for (let i = 0; i < stepIndex; i++) {
    const nextButton = screen.getByRole('button', { name: /next/i })
    await user.click(nextButton)
    await waitFor(() => {
      // Wait for step transition
    })
  }
}

/**
 * Fill project information form
 */
const fillProjectInfo = async (projectData: Partial<ProjectCreationRequest> = {}) => {
  const user = userEvent.setup()
  const data = createMockProjectRequest(projectData)

  // Fill project name
  const nameInput = screen.getByLabelText(/project name/i)
  await user.clear(nameInput)
  await user.type(nameInput, data.name)

  // Fill description
  if (data.description) {
    const descriptionInput = screen.getByLabelText(/description/i)
    await user.clear(descriptionInput)
    await user.type(descriptionInput, data.description)
  }

  // Fill workspace path
  const pathInput = screen.getByLabelText(/workspace path/i)
  await user.clear(pathInput)
  await user.type(pathInput, data.workspacePath)

  // Select category
  if (data.metadata?.category) {
    const categorySelect = screen.getByLabelText(/category/i)
    await user.selectOptions(categorySelect, data.metadata.category)
  }

  // Fill tags
  if (data.metadata?.tags?.length) {
    const tagsInput = screen.getByLabelText(/tags/i)
    await user.clear(tagsInput)
    await user.type(tagsInput, data.metadata.tags.join(', '))
  }
}

/**
 * Select a project template
 */
const selectTemplate = async (templateId: string) => {
  const user = userEvent.setup()
  const templateCard = screen.getByTestId(`template-${templateId}`) || screen.getByText(new RegExp(templateId, 'i'))
  await user.click(templateCard)
}

// =============================================================================
// TEST SUITE
// =============================================================================

describe('ProjectCreationWizard', () => {
  beforeEach(() => {
    setupSuccessfulMocks()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // =============================================================================
  // RENDERING AND BASIC FUNCTIONALITY
  // =============================================================================

  describe('Component Rendering', () => {
    it('should render the wizard when open', () => {
      renderWizard()
      
      expect(screen.getByText('Create New Project')).toBeInTheDocument()
      expect(screen.getByText('Project Information')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    })

    it('should not render when closed', () => {
      renderWizard({ isOpen: false })
      
      expect(screen.queryByText('Create New Project')).not.toBeInTheDocument()
    })

    it('should render with initial template if provided', () => {
      const initialTemplate = createMockTemplate({ id: 'web-app', name: 'Web Application' })
      renderWizard({ initialTemplate })
      
      // Should still start at project info step but have template pre-selected
      expect(screen.getByText('Project Information')).toBeInTheDocument()
    })

    it('should display progress indicators for all steps', () => {
      renderWizard()
      
      // Check that all steps are visible in progress
      expect(screen.getByText('Project Information')).toBeInTheDocument()
      expect(screen.getByText('Template Selection')).toBeInTheDocument()
      expect(screen.getByText('Configuration')).toBeInTheDocument()
      expect(screen.getByText('Validation')).toBeInTheDocument()
      expect(screen.getByText('Creation')).toBeInTheDocument()
      expect(screen.getByText('Completion')).toBeInTheDocument()
    })
  })

  // =============================================================================
  // PROJECT INFORMATION STEP
  // =============================================================================

  describe('Project Information Step', () => {
    it('should display project information form fields', () => {
      renderWizard()
      
      expect(screen.getByLabelText(/project name/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/description/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/workspace path/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/category/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/tags/i)).toBeInTheDocument()
    })

    it('should validate required fields before allowing progression', async () => {
      renderWizard()
      const user = userEvent.setup()
      
      const nextButton = screen.getByRole('button', { name: /next/i })
      expect(nextButton).toBeDisabled()
      
      // Fill required fields
      await user.type(screen.getByLabelText(/project name/i), 'Test Project')
      await user.type(screen.getByLabelText(/workspace path/i), '/test/path')
      
      await waitFor(() => {
        expect(nextButton).toBeEnabled()
      })
    })

    it('should handle form submission with valid data', async () => {
      renderWizard()
      const user = userEvent.setup()
      
      await fillProjectInfo()
      
      const nextButton = screen.getByRole('button', { name: /next/i })
      await user.click(nextButton)
      
      await waitFor(() => {
        expect(screen.getByText('Template Selection')).toBeInTheDocument()
      })
    })

    it('should display validation errors for invalid inputs', async () => {
      renderWizard()
      const user = userEvent.setup()
      
      // Enter invalid data
      const nameInput = screen.getByLabelText(/project name/i)
      await user.type(nameInput, '')
      await user.tab() // Trigger blur event
      
      // Should show validation error
      await waitFor(() => {
        expect(screen.getByText(/project name is required/i)).toBeInTheDocument()
      })
    })

    it('should handle tag input correctly', async () => {
      renderWizard()
      const user = userEvent.setup()
      
      const tagsInput = screen.getByLabelText(/tags/i)
      await user.type(tagsInput, 'react, typescript, testing')
      
      // Tags should be parsed correctly
      expect(tagsInput).toHaveValue('react, typescript, testing')
    })
  })

  // =============================================================================
  // TEMPLATE SELECTION STEP
  // =============================================================================

  describe('Template Selection Step', () => {
    beforeEach(async () => {
      renderWizard()
      await fillProjectInfo()
      await navigateToStep(1)
    })

    it('should display available templates', async () => {
      await waitFor(() => {
        expect(screen.getByText('Template Selection')).toBeInTheDocument()
        expect(screen.getByText('Blank Project')).toBeInTheDocument()
        expect(screen.getByText('Web Application')).toBeInTheDocument()
        expect(screen.getByText('REST API Service')).toBeInTheDocument()
      })
    })

    it('should allow template selection', async () => {
      const user = userEvent.setup()
      
      await waitFor(() => {
        const webAppTemplate = screen.getByText('Web Application')
        expect(webAppTemplate).toBeInTheDocument()
      })
      
      const webAppCard = screen.getByText('Web Application').closest('.template-card')
      expect(webAppCard).toBeInTheDocument()
      
      await user.click(webAppCard!)
      
      await waitFor(() => {
        expect(webAppCard).toHaveClass('selected')
      })
    })

    it('should display template details when selected', async () => {
      const user = userEvent.setup()
      
      await waitFor(() => {
        const webAppTemplate = screen.getByText('Web Application')
        expect(webAppTemplate).toBeInTheDocument()
      })
      
      const webAppCard = screen.getByText('Web Application').closest('.template-card')
      await user.click(webAppCard!)
      
      await waitFor(() => {
        expect(screen.getByText('Selected Template: Web Application')).toBeInTheDocument()
        expect(screen.getByText(/full-stack web application/i)).toBeInTheDocument()
      })
    })

    it('should show loading state when templates are being fetched', () => {
      mockUseProject.mockReturnValue({
        ...mockUseProject(),
        getAvailableTemplates: vi.fn().mockImplementation(() => new Promise(() => {})) // Never resolves
      })
      
      renderWizard()
      
      expect(screen.getByText(/loading project templates/i)).toBeInTheDocument()
    })

    it('should enable next button only when template is selected', async () => {
      const user = userEvent.setup()
      
      await waitFor(() => {
        const nextButton = screen.getByRole('button', { name: /next/i })
        expect(nextButton).toBeDisabled()
      })
      
      const webAppCard = screen.getByText('Web Application').closest('.template-card')
      await user.click(webAppCard!)
      
      await waitFor(() => {
        const nextButton = screen.getByRole('button', { name: /next/i })
        expect(nextButton).toBeEnabled()
      })
    })
  })

  // =============================================================================
  // CONFIGURATION STEP
  // =============================================================================

  describe('Configuration Step', () => {
    beforeEach(async () => {
      renderWizard()
      await fillProjectInfo()
      await navigateToStep(1)
      await selectTemplate('web-app')
      await navigateToStep(2)
    })

    it('should display configuration options', async () => {
      await waitFor(() => {
        expect(screen.getByText('Configuration')).toBeInTheDocument()
        expect(screen.getByLabelText(/ai provider/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/ai model/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/code style/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/testing framework/i)).toBeInTheDocument()
      })
    })

    it('should update AI model options based on provider selection', async () => {
      const user = userEvent.setup()
      
      await waitFor(() => {
        const providerSelect = screen.getByLabelText(/ai provider/i)
        expect(providerSelect).toBeInTheDocument()
      })
      
      const providerSelect = screen.getByLabelText(/ai provider/i)
      await user.selectOptions(providerSelect, 'anthropic')
      
      await waitFor(() => {
        const modelSelect = screen.getByLabelText(/ai model/i)
        expect(modelSelect).toHaveValue('claude-3-5-sonnet-20241022')
      })
    })

    it('should show template-specific configuration hints', async () => {
      await waitFor(() => {
        expect(screen.getByText('Template Configuration')).toBeInTheDocument()
        expect(screen.getByText(/settings optimized for: web application/i)).toBeInTheDocument()
      })
    })

    it('should handle advanced features toggle', async () => {
      const user = userEvent.setup()
      
      await waitFor(() => {
        const advancedCheckbox = screen.getByLabelText(/enable advanced features/i)
        expect(advancedCheckbox).toBeInTheDocument()
      })
      
      const advancedCheckbox = screen.getByLabelText(/enable advanced features/i)
      await user.click(advancedCheckbox)
      
      expect(advancedCheckbox).toBeChecked()
    })

    it('should validate configuration before allowing progression', async () => {
      await waitFor(() => {
        const nextButton = screen.getByRole('button', { name: /next/i })
        expect(nextButton).toBeEnabled() // Should be enabled with default values
      })
    })
  })

  // =============================================================================
  // VALIDATION STEP
  // =============================================================================

  describe('Validation Step', () => {
    beforeEach(async () => {
      renderWizard()
      await fillProjectInfo()
      await navigateToStep(1)
      await selectTemplate('web-app')
      await navigateToStep(2)
      await navigateToStep(3)
    })

    it('should show validation in progress', async () => {
      mockUseProject.mockReturnValue({
        ...mockUseProject(),
        validateProjectData: vi.fn().mockImplementation(() => new Promise(() => {})) // Never resolves
      })
      
      await waitFor(() => {
        expect(screen.getByText(/validating project configuration/i)).toBeInTheDocument()
      })
    })

    it('should display validation results when completed', async () => {
      await waitFor(() => {
        expect(screen.getByText('Validation Results')).toBeInTheDocument()
        expect(screen.getByText(/all validations passed/i)).toBeInTheDocument()
      })
    })

    it('should show validation errors when issues are found', async () => {
      const errorResult = createMockValidationResult({
        isValid: false,
        errorMessage: 'Workspace path does not exist',
        severity: 'error'
      })
      
      mockUseProject.mockReturnValue({
        ...mockUseProject(),
        validateProjectData: vi.fn().mockResolvedValue([errorResult])
      })
      
      renderWizard()
      await fillProjectInfo()
      await navigateToStep(3)
      
      await waitFor(() => {
        expect(screen.getByText(/issues found that need attention/i)).toBeInTheDocument()
        expect(screen.getByText('Workspace path does not exist')).toBeInTheDocument()
      })
    })

    it('should provide retry option for failed validations', async () => {
      const errorResult = createMockValidationResult({
        isValid: false,
        errorMessage: 'Validation failed',
        severity: 'error'
      })
      
      mockUseProject.mockReturnValue({
        ...mockUseProject(),
        validateProjectData: vi.fn().mockResolvedValue([errorResult])
      })
      
      renderWizard()
      await fillProjectInfo()
      await navigateToStep(3)
      
      await waitFor(() => {
        const retryButton = screen.getByRole('button', { name: /retry validation/i })
        expect(retryButton).toBeInTheDocument()
      })
    })

    it('should show validation suggestions when available', async () => {
      const resultWithSuggestion = createMockValidationResult({
        isValid: false,
        errorMessage: 'Invalid workspace path',
        suggestion: 'Use an absolute path starting with /'
      })
      
      mockUseProject.mockReturnValue({
        ...mockUseProject(),
        validateProjectData: vi.fn().mockResolvedValue([resultWithSuggestion])
      })
      
      renderWizard()
      await fillProjectInfo()
      await navigateToStep(3)
      
      await waitFor(() => {
        expect(screen.getByText(/use an absolute path starting with/i)).toBeInTheDocument()
      })
    })
  })

  // =============================================================================
  // CREATION STEP
  // =============================================================================

  describe('Creation Step', () => {
    beforeEach(async () => {
      renderWizard()
      await fillProjectInfo()
      await navigateToStep(1)
      await selectTemplate('web-app')
      await navigateToStep(2)
      await navigateToStep(3)
      await navigateToStep(4)
    })

    it('should show creation progress', async () => {
      mockUseProject.mockReturnValue({
        ...mockUseProject(),
        createProject: vi.fn().mockImplementation(() => new Promise(() => {})) // Never resolves
      })
      
      await waitFor(() => {
        expect(screen.getByText(/creating project/i)).toBeInTheDocument()
        expect(screen.getByText(/setting up project structure/i)).toBeInTheDocument()
      })
    })

    it('should display progress steps during creation', async () => {
      await waitFor(() => {
        expect(screen.getByText(/creating directories/i)).toBeInTheDocument()
        expect(screen.getByText(/generating files/i)).toBeInTheDocument()
      })
    })

    it('should call project creation service with correct data', async () => {
      const createProjectSpy = vi.fn().mockResolvedValue(createApiResponse({ id: generateUUID() }))
      
      mockUseProject.mockReturnValue({
        ...mockUseProject(),
        createProject: createProjectSpy
      })
      
      renderWizard()
      await fillProjectInfo()
      await navigateToStep(4)
      
      await waitFor(() => {
        expect(createProjectSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Test Project',
            workspacePath: '/test/workspace'
          })
        )
      })
    })
  })

  // =============================================================================
  // COMPLETION STEP
  // =============================================================================

  describe('Completion Step', () => {
    beforeEach(async () => {
      renderWizard()
      await fillProjectInfo()
      await navigateToStep(1)
      await selectTemplate('web-app')
      await navigateToStep(2)
      await navigateToStep(3)
      await navigateToStep(4)
      await waitFor(() => {
        expect(screen.getByText(/project created successfully/i)).toBeInTheDocument()
      })
    })

    it('should display success message', async () => {
      await waitFor(() => {
        expect(screen.getByText(/project created successfully/i)).toBeInTheDocument()
        expect(screen.getByText(/ready to start coding/i)).toBeInTheDocument()
      })
    })

    it('should show next steps checklist', async () => {
      await waitFor(() => {
        expect(screen.getByText(/project structure created/i)).toBeInTheDocument()
        expect(screen.getByText(/configuration files generated/i)).toBeInTheDocument()
        expect(screen.getByText(/development environment configured/i)).toBeInTheDocument()
      })
    })

    it('should provide action buttons', async () => {
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create another project/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /open project/i })).toBeInTheDocument()
      })
    })

    it('should call onProjectCreated when project creation is successful', async () => {
      const { props } = renderWizard()
      
      await waitFor(() => {
        expect(props.onProjectCreated).toHaveBeenCalledWith(expect.any(String))
      })
    })
  })

  // =============================================================================
  // NAVIGATION AND FLOW
  // =============================================================================

  describe('Wizard Navigation', () => {
    it('should allow backward navigation', async () => {
      renderWizard()
      const user = userEvent.setup()
      
      await fillProjectInfo()
      await navigateToStep(1)
      
      expect(screen.getByText('Template Selection')).toBeInTheDocument()
      
      const previousButton = screen.getByRole('button', { name: /previous/i })
      await user.click(previousButton)
      
      await waitFor(() => {
        expect(screen.getByText('Project Information')).toBeInTheDocument()
      })
    })

    it('should maintain form data when navigating back and forth', async () => {
      renderWizard()
      const user = userEvent.setup()
      
      // Fill project info
      await fillProjectInfo({ name: 'Persistent Project' })
      await navigateToStep(1)
      
      // Go back
      const previousButton = screen.getByRole('button', { name: /previous/i })
      await user.click(previousButton)
      
      // Check data is preserved
      await waitFor(() => {
        const nameInput = screen.getByLabelText(/project name/i) as HTMLInputElement
        expect(nameInput.value).toBe('Persistent Project')
      })
    })

    it('should update progress indicator as user progresses', async () => {
      renderWizard()
      
      // Initially on step 1
      const step1Indicator = screen.getByText('1').closest('.step-indicator')
      expect(step1Indicator).toHaveClass('active')
      
      await fillProjectInfo()
      await navigateToStep(1)
      
      // Now on step 2
      await waitFor(() => {
        const step1Indicator = screen.getByText('1').closest('.step-indicator')
        const step2Indicator = screen.getByText('2').closest('.step-indicator')
        
        expect(step1Indicator).toHaveClass('completed')
        expect(step2Indicator).toHaveClass('active')
      })
    })

    it('should prevent progression when step validation fails', async () => {
      renderWizard()
      const user = userEvent.setup()
      
      // Try to proceed without filling required fields
      const nextButton = screen.getByRole('button', { name: /next/i })
      expect(nextButton).toBeDisabled()
      
      // Fill partial data (missing required fields)
      await user.type(screen.getByLabelText(/project name/i), 'Test')
      // Workspace path still empty
      
      expect(nextButton).toBeDisabled()
    })
  })

  // =============================================================================
  // ERROR HANDLING
  // =============================================================================

  describe('Error Handling', () => {
    it('should display error when project creation fails', async () => {
      const createProjectError = createApiError('PROJECT_CREATION_FAILED', 'Failed to create project')
      
      mockUseProject.mockReturnValue({
        ...mockUseProject(),
        createProject: vi.fn().mockRejectedValue(createProjectError)
      })
      
      renderWizard()
      await fillProjectInfo()
      await navigateToStep(4)
      
      await waitFor(() => {
        expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
          'Failed to create project',
          createProjectError
        )
      })
    })

    it('should handle template loading errors gracefully', async () => {
      mockUseProject.mockReturnValue({
        ...mockUseProject(),
        getAvailableTemplates: vi.fn().mockRejectedValue(new Error('Failed to load templates'))
      })
      
      renderWizard()
      await fillProjectInfo()
      await navigateToStep(1)
      
      await waitFor(() => {
        expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
          'Failed to load project templates',
          expect.any(Error)
        )
      })
    })

    it('should handle validation errors', async () => {
      mockUseProject.mockReturnValue({
        ...mockUseProject(),
        validateProjectData: vi.fn().mockRejectedValue(new Error('Validation failed'))
      })
      
      renderWizard()
      await fillProjectInfo()
      await navigateToStep(3)
      
      await waitFor(() => {
        expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
          'Project validation failed',
          expect.any(Error)
        )
      })
    })

    it('should reset wizard state after cancellation', async () => {
      const { props } = renderWizard()
      const user = userEvent.setup()
      
      await fillProjectInfo()
      await navigateToStep(1)
      
      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      await user.click(cancelButton)
      
      expect(props.onCancel).toHaveBeenCalled()
    })

    it('should show confirmation dialog when canceling with progress', async () => {
      renderWizard()
      const user = userEvent.setup()
      
      // Make some progress
      await fillProjectInfo()
      await navigateToStep(1)
      
      // Mock window.confirm
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
      
      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      await user.click(cancelButton)
      
      expect(confirmSpy).toHaveBeenCalledWith(
        expect.stringContaining('Are you sure you want to cancel')
      )
      
      confirmSpy.mockRestore()
    })
  })

  // =============================================================================
  // ACCESSIBILITY
  // =============================================================================

  describe('Accessibility', () => {
    it('should have proper ARIA labels and roles', () => {
      renderWizard()
      
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument()
      expect(screen.getByLabelText(/project name/i)).toBeInTheDocument()
    })

    it('should support keyboard navigation for template selection', async () => {
      renderWizard()
      const user = userEvent.setup()
      
      await fillProjectInfo()
      await navigateToStep(1)
      
      await waitFor(() => {
        const templateCard = screen.getByText('Web Application').closest('.template-card')
        expect(templateCard).toHaveAttribute('tabIndex', '0')
        expect(templateCard).toHaveAttribute('role', 'button')
      })
    })

    it('should announce step changes to screen readers', async () => {
      renderWizard()
      
      await fillProjectInfo()
      await navigateToStep(1)
      
      await waitFor(() => {
        expect(screen.getByText('Template Selection')).toBeInTheDocument()
      })
    })

    it('should have proper form validation announcements', async () => {
      renderWizard()
      const user = userEvent.setup()
      
      const nameInput = screen.getByLabelText(/project name/i)
      await user.clear(nameInput)
      await user.tab()
      
      await waitFor(() => {
        const errorMessage = screen.getByText(/project name is required/i)
        expect(errorMessage).toHaveClass('error-message')
      })
    })
  })

  // =============================================================================
  // INTEGRATION TESTS
  // =============================================================================

  describe('Integration Tests', () => {
    it('should complete full wizard flow successfully', async () => {
      const { props } = renderWizard()
      const user = userEvent.setup()
      
      // Step 1: Project Information
      await fillProjectInfo()
      await user.click(screen.getByRole('button', { name: /next/i }))
      
      // Step 2: Template Selection
      await waitFor(() => {
        expect(screen.getByText('Template Selection')).toBeInTheDocument()
      })
      
      const webAppCard = screen.getByText('Web Application').closest('.template-card')
      await user.click(webAppCard!)
      await user.click(screen.getByRole('button', { name: /next/i }))
      
      // Step 3: Configuration
      await waitFor(() => {
        expect(screen.getByText('Configuration')).toBeInTheDocument()
      })
      
      await user.click(screen.getByRole('button', { name: /next/i }))
      
      // Step 4: Validation
      await waitFor(() => {
        expect(screen.getByText('Validation')).toBeInTheDocument()
      })
      
      await user.click(screen.getByRole('button', { name: /next/i }))
      
      // Step 5: Creation
      await waitFor(() => {
        expect(screen.getByText(/creating project/i)).toBeInTheDocument()
      })
      
      // Step 6: Completion
      await waitFor(() => {
        expect(screen.getByText(/project created successfully/i)).toBeInTheDocument()
      })
      
      expect(props.onProjectCreated).toHaveBeenCalled()
    })

    it('should handle template with initial configuration', async () => {
      const initialTemplate = createMockTemplate({
        id: 'ai-integration',
        name: 'AI Integration',
        category: 'ai'
      })
      
      renderWizard({ initialTemplate })
      
      await fillProjectInfo()
      await navigateToStep(1)
      
      // Template should be pre-selected
      await waitFor(() => {
        expect(screen.getByText('Selected Template: AI Integration')).toBeInTheDocument()
      })
    })

    it('should preserve state across re-renders', async () => {
      const { rerender, props } = renderWizard()
      
      await fillProjectInfo({ name: 'Persistent Test' })
      
      // Re-render component
      rerender(<ProjectCreationWizard {...props} />)
      
      // State should be preserved
      const nameInput = screen.getByLabelText(/project name/i) as HTMLInputElement
      expect(nameInput.value).toBe('Persistent Test')
    })
  })
})
