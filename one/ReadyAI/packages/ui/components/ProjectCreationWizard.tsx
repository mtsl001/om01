// packages/ui/components/ProjectCreationWizard.tsx

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { UUID, ApiResponse } from '@readyai/foundation/types/core';
import { ProjectTemplate, ProjectCreationRequest, ProjectValidationResult } from '@readyai/project-management/types/project';
import { useProject } from '../hooks/useProject';
import { useConfig } from '../hooks/useConfig';
import { useLogger } from '../hooks/useLogger';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { ProjectCreationService } from '@readyai/project-management/services/ProjectCreationService';
import { ProjectValidator } from '@readyai/project-management/services/ProjectValidator';

/**
 * Multi-step project creation wizard adapted from Cline's wizard component patterns.
 * Provides guided project setup with template selection, configuration, and validation.
 * 
 * Key Features:
 * - Multi-step wizard interface with progress tracking
 * - Template selection with preview capabilities
 * - Real-time validation and error handling
 * - Integration with ReadyAI's project management services
 * - Responsive design with accessibility support
 * 
 * @component
 * @example
 * ```
 * <ProjectCreationWizard
 *   onProjectCreated={handleProjectCreated}
 *   onCancel={handleCancel}
 *   initialTemplate={selectedTemplate}
 * />
 * ```
 */

// Wizard step definitions
enum WizardStep {
  PROJECT_INFO = 'project-info',
  TEMPLATE_SELECTION = 'template-selection', 
  CONFIGURATION = 'configuration',
  VALIDATION = 'validation',
  CREATION = 'creation',
  COMPLETION = 'completion'
}

interface WizardStepConfig {
  id: WizardStep;
  title: string;
  description: string;
  optional?: boolean;
  validation?: () => Promise<boolean>;
}

// Project info form data
interface ProjectInfoData {
  name: string;
  description: string;
  workspacePath: string;
  category: string;
  tags: string[];
}

// Configuration data  
interface ProjectConfigData {
  aiProvider: string;
  aiModel: string;
  codeStyle: string;
  testingFramework: string;
  deploymentTarget: string;
  enableAdvancedFeatures: boolean;
  customSettings: Record<string, any>;
}

// Component props interface
interface ProjectCreationWizardProps {
  onProjectCreated: (projectId: UUID) => void;
  onCancel: () => void;
  initialTemplate?: ProjectTemplate;
  className?: string;
  isOpen?: boolean;
}

// Wizard state interface
interface WizardState {
  currentStep: WizardStep;
  completedSteps: Set<WizardStep>;
  projectInfo: ProjectInfoData;
  selectedTemplate: ProjectTemplate | null;
  configuration: ProjectConfigData;
  validationResults: ProjectValidationResult[];
  isCreating: boolean;
  errors: Record<string, string>;
}

// Default wizard state
const DEFAULT_WIZARD_STATE: WizardState = {
  currentStep: WizardStep.PROJECT_INFO,
  completedSteps: new Set(),
  projectInfo: {
    name: '',
    description: '',
    workspacePath: '',
    category: 'general',
    tags: []
  },
  selectedTemplate: null,
  configuration: {
    aiProvider: 'openrouter',
    aiModel: 'anthropic/claude-3-5-sonnet-20241022',
    codeStyle: 'typescript',
    testingFramework: 'jest',
    deploymentTarget: 'local',
    enableAdvancedFeatures: false,
    customSettings: {}
  },
  validationResults: [],
  isCreating: false,
  errors: {}
};

// Wizard step configuration adapted from Cline's step patterns
const WIZARD_STEPS: WizardStepConfig[] = [
  {
    id: WizardStep.PROJECT_INFO,
    title: 'Project Information',
    description: 'Basic project details and metadata'
  },
  {
    id: WizardStep.TEMPLATE_SELECTION,
    title: 'Template Selection',
    description: 'Choose a project template or start from scratch'
  },
  {
    id: WizardStep.CONFIGURATION,
    title: 'Configuration',
    description: 'Configure AI models and development settings'
  },
  {
    id: WizardStep.VALIDATION,
    title: 'Validation',
    description: 'Validate project setup and dependencies',
    optional: true
  },
  {
    id: WizardStep.CREATION,
    title: 'Creation',
    description: 'Creating project structure and files'
  },
  {
    id: WizardStep.COMPLETION,
    title: 'Completion',
    description: 'Project created successfully'
  }
];

// Available project templates
const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'blank',
    name: 'Blank Project',
    description: 'Start from scratch with minimal setup',
    category: 'general',
    features: ['basic-structure'],
    scaffolding: {
      directories: ['src', 'docs'],
      files: ['README.md', 'package.json']
    },
    complexity: 'simple'
  },
  {
    id: 'web-app',
    name: 'Web Application',
    description: 'Full-stack web application with React and Node.js',
    category: 'web',
    features: ['react-frontend', 'express-backend', 'database'],
    scaffolding: {
      directories: ['src/components', 'src/services', 'server', 'public'],
      files: ['package.json', 'tsconfig.json', 'README.md', 'docker-compose.yml']
    },
    complexity: 'intermediate'
  },
  {
    id: 'api-service',
    name: 'REST API Service',
    description: 'Backend API service with database integration',
    category: 'backend',
    features: ['express-api', 'database', 'testing', 'docker'],
    scaffolding: {
      directories: ['src/routes', 'src/models', 'src/middleware', 'tests'],
      files: ['package.json', 'Dockerfile', 'README.md', 'openapi.yml']
    },
    complexity: 'intermediate'
  },
  {
    id: 'desktop-app',
    name: 'Desktop Application',
    description: 'Cross-platform desktop app with Electron',
    category: 'desktop',
    features: ['electron', 'react', 'native-apis'],
    scaffolding: {
      directories: ['src/main', 'src/renderer', 'assets'],
      files: ['package.json', 'electron-builder.yml', 'README.md']
    },
    complexity: 'advanced'
  },
  {
    id: 'mobile-app',
    name: 'Mobile Application',
    description: 'React Native mobile application',
    category: 'mobile',
    features: ['react-native', 'navigation', 'native-modules'],
    scaffolding: {
      directories: ['src/screens', 'src/components', 'src/services', 'assets'],
      files: ['package.json', 'app.json', 'README.md', 'metro.config.js']
    },
    complexity: 'advanced'
  },
  {
    id: 'ai-integration',
    name: 'AI Integration',
    description: 'Project with AI model integration and RAG capabilities',
    category: 'ai',
    features: ['ai-models', 'vector-db', 'rag-pipeline', 'embeddings'],
    scaffolding: {
      directories: ['src/ai', 'src/embeddings', 'src/vector', 'data'],
      files: ['package.json', 'requirements.txt', 'README.md', '.env.example']
    },
    complexity: 'advanced'
  }
];

export const ProjectCreationWizard: React.FC<ProjectCreationWizardProps> = ({
  onProjectCreated,
  onCancel,
  initialTemplate,
  className = '',
  isOpen = true
}) => {
  const logger = useLogger('ProjectCreationWizard');
  const { handleError } = useErrorHandler();
  const { config } = useConfig();
  const { createProject, getAvailableTemplates, validateProjectData } = useProject();

  // Wizard state management adapted from Cline's state patterns
  const [wizardState, setWizardState] = useState<WizardState>(() => ({
    ...DEFAULT_WIZARD_STATE,
    selectedTemplate: initialTemplate || null
  }));

  // Available templates with real-time loading
  const [availableTemplates, setAvailableTemplates] = useState<ProjectTemplate[]>(PROJECT_TEMPLATES);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);

  // Form validation state
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isValidating, setIsValidating] = useState(false);

  /**
   * Load available templates from the backend service
   * Implements Cline's data loading patterns with error handling
   */
  const loadAvailableTemplates = useCallback(async () => {
    setIsLoadingTemplates(true);
    try {
      logger.info('Loading available project templates');
      const templates = await getAvailableTemplates();
      setAvailableTemplates(templates);
      logger.debug('Loaded templates', { count: templates.length });
    } catch (error) {
      handleError('Failed to load project templates', error);
      // Fallback to default templates
      setAvailableTemplates(PROJECT_TEMPLATES);
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [getAvailableTemplates, handleError, logger]);

  /**
   * Initialize wizard with template loading
   */
  useEffect(() => {
    if (isOpen) {
      loadAvailableTemplates();
    }
  }, [isOpen, loadAvailableTemplates]);

  /**
   * Get current step configuration
   */
  const currentStepConfig = useMemo(() => {
    return WIZARD_STEPS.find(step => step.id === wizardState.currentStep);
  }, [wizardState.currentStep]);

  /**
   * Calculate wizard progress percentage
   */
  const progressPercentage = useMemo(() => {
    const currentIndex = WIZARD_STEPS.findIndex(step => step.id === wizardState.currentStep);
    const totalSteps = WIZARD_STEPS.length;
    return Math.round(((currentIndex + 1) / totalSteps) * 100);
  }, [wizardState.currentStep]);

  /**
   * Check if current step can be completed
   */
  const canProceedFromCurrentStep = useMemo(() => {
    switch (wizardState.currentStep) {
      case WizardStep.PROJECT_INFO:
        return wizardState.projectInfo.name.trim().length > 0 && 
               wizardState.projectInfo.workspacePath.trim().length > 0;
      case WizardStep.TEMPLATE_SELECTION:
        return wizardState.selectedTemplate !== null;
      case WizardStep.CONFIGURATION:
        return wizardState.configuration.aiProvider && wizardState.configuration.aiModel;
      case WizardStep.VALIDATION:
        return wizardState.validationResults.every(result => result.isValid);
      case WizardStep.CREATION:
        return !wizardState.isCreating;
      default:
        return true;
    }
  }, [wizardState]);

  /**
   * Navigate to next wizard step with validation
   */
  const handleNextStep = useCallback(async () => {
    if (!canProceedFromCurrentStep) {
      logger.warn('Cannot proceed from current step', { step: wizardState.currentStep });
      return;
    }

    try {
      // Mark current step as completed
      const completedSteps = new Set(wizardState.completedSteps);
      completedSteps.add(wizardState.currentStep);

      // Determine next step
      const currentIndex = WIZARD_STEPS.findIndex(step => step.id === wizardState.currentStep);
      const nextStep = WIZARD_STEPS[currentIndex + 1];

      if (!nextStep) {
        logger.error('No next step available');
        return;
      }

      // Special handling for validation step
      if (nextStep.id === WizardStep.VALIDATION) {
        await performValidation();
      }

      // Special handling for creation step
      if (nextStep.id === WizardStep.CREATION) {
        await performProjectCreation();
      }

      setWizardState(prev => ({
        ...prev,
        currentStep: nextStep.id,
        completedSteps
      }));

      logger.debug('Advanced to next step', { from: wizardState.currentStep, to: nextStep.id });
    } catch (error) {
      handleError('Failed to advance wizard step', error);
    }
  }, [canProceedFromCurrentStep, wizardState, handleError, logger]);

  /**
   * Navigate to previous wizard step
   */
  const handlePreviousStep = useCallback(() => {
    const currentIndex = WIZARD_STEPS.findIndex(step => step.id === wizardState.currentStep);
    const previousStep = WIZARD_STEPS[currentIndex - 1];

    if (!previousStep) {
      logger.warn('No previous step available');
      return;
    }

    setWizardState(prev => ({
      ...prev,
      currentStep: previousStep.id
    }));

    logger.debug('Returned to previous step', { from: wizardState.currentStep, to: previousStep.id });
  }, [wizardState.currentStep, logger]);

  /**
   * Update project information with validation
   */
  const updateProjectInfo = useCallback((updates: Partial<ProjectInfoData>) => {
    setWizardState(prev => ({
      ...prev,
      projectInfo: { ...prev.projectInfo, ...updates }
    }));

    // Clear related field errors
    const updatedFields = Object.keys(updates);
    setFieldErrors(prev => {
      const newErrors = { ...prev };
      updatedFields.forEach(field => delete newErrors[field]);
      return newErrors;
    });
  }, []);

  /**
   * Select project template with configuration updates
   */
  const selectTemplate = useCallback((template: ProjectTemplate | null) => {
    setWizardState(prev => ({
      ...prev,
      selectedTemplate: template,
      configuration: {
        ...prev.configuration,
        // Auto-configure based on template
        codeStyle: template?.category === 'web' ? 'typescript' : prev.configuration.codeStyle,
        testingFramework: template?.features?.includes('testing') ? 'jest' : prev.configuration.testingFramework
      }
    }));

    logger.debug('Selected template', { templateId: template?.id });
  }, [logger]);

  /**
   * Update configuration settings
   */
  const updateConfiguration = useCallback((updates: Partial<ProjectConfigData>) => {
    setWizardState(prev => ({
      ...prev,
      configuration: { ...prev.configuration, ...updates }
    }));
  }, []);

  /**
   * Perform project validation using ReadyAI's ProjectValidator service
   */
  const performValidation = useCallback(async () => {
    setIsValidating(true);
    try {
      logger.info('Validating project configuration');

      const projectData: ProjectCreationRequest = {
        name: wizardState.projectInfo.name,
        description: wizardState.projectInfo.description,
        workspacePath: wizardState.projectInfo.workspacePath,
        template: wizardState.selectedTemplate,
        configuration: wizardState.configuration,
        metadata: {
          category: wizardState.projectInfo.category,
          tags: wizardState.projectInfo.tags,
          createdBy: 'wizard'
        }
      };

      const validationResults = await validateProjectData(projectData);
      
      setWizardState(prev => ({
        ...prev,
        validationResults
      }));

      const hasErrors = validationResults.some(result => !result.isValid);
      if (hasErrors) {
        logger.warn('Validation failed', { errors: validationResults.filter(r => !r.isValid) });
      } else {
        logger.info('Validation passed successfully');
      }

    } catch (error) {
      handleError('Project validation failed', error);
      setWizardState(prev => ({
        ...prev,
        validationResults: [{
          field: 'general',
          isValid: false,
          errorMessage: error instanceof Error ? error.message : 'Validation failed',
          severity: 'error'
        }]
      }));
    } finally {
      setIsValidating(false);
    }
  }, [wizardState, validateProjectData, handleError, logger]);

  /**
   * Perform actual project creation using ReadyAI's ProjectCreationService
   */
  const performProjectCreation = useCallback(async () => {
    setWizardState(prev => ({ ...prev, isCreating: true }));

    try {
      logger.info('Creating new project', { name: wizardState.projectInfo.name });

      const projectData: ProjectCreationRequest = {
        name: wizardState.projectInfo.name,
        description: wizardState.projectInfo.description,
        workspacePath: wizardState.projectInfo.workspacePath,
        template: wizardState.selectedTemplate,
        configuration: wizardState.configuration,
        metadata: {
          category: wizardState.projectInfo.category,
          tags: wizardState.projectInfo.tags,
          createdBy: 'wizard',
          createdAt: new Date().toISOString()
        }
      };

      const response = await createProject(projectData);
      
      if (response.success && response.data) {
        logger.info('Project created successfully', { projectId: response.data.id });
        onProjectCreated(response.data.id);
      } else {
        throw new Error(response.message || 'Project creation failed');
      }

    } catch (error) {
      handleError('Failed to create project', error);
      setWizardState(prev => ({ ...prev, isCreating: false }));
    }
  }, [wizardState, createProject, onProjectCreated, handleError, logger]);

  /**
   * Handle wizard cancellation with confirmation
   */
  const handleCancel = useCallback(() => {
    if (wizardState.completedSteps.size > 0) {
      const confirmed = window.confirm('Are you sure you want to cancel project creation? Your progress will be lost.');
      if (!confirmed) return;
    }

    logger.debug('Project creation wizard cancelled');
    onCancel();
  }, [wizardState.completedSteps.size, onCancel, logger]);

  /**
   * Reset wizard to initial state
   */
  const resetWizard = useCallback(() => {
    setWizardState(DEFAULT_WIZARD_STATE);
    setFieldErrors({});
    logger.debug('Wizard reset to initial state');
  }, [logger]);

  // Don't render if not open
  if (!isOpen) return null;

  return (
    <div className={`project-creation-wizard ${className}`}>
      {/* Wizard Header with Progress */}
      <div className="wizard-header">
        <div className="wizard-progress">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          <div className="step-indicators">
            {WIZARD_STEPS.map((step, index) => (
              <div
                key={step.id}
                className={`step-indicator ${
                  wizardState.completedSteps.has(step.id) ? 'completed' :
                  step.id === wizardState.currentStep ? 'active' : 'pending'
                }`}
              >
                <div className="step-number">{index + 1}</div>
                <div className="step-title">{step.title}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="wizard-title">
          <h2>Create New Project</h2>
          {currentStepConfig && (
            <p className="step-description">{currentStepConfig.description}</p>
          )}
        </div>
      </div>

      {/* Wizard Content */}
      <div className="wizard-content">
        {wizardState.currentStep === WizardStep.PROJECT_INFO && (
          <ProjectInfoStep
            data={wizardState.projectInfo}
            errors={fieldErrors}
            onChange={updateProjectInfo}
          />
        )}

        {wizardState.currentStep === WizardStep.TEMPLATE_SELECTION && (
          <TemplateSelectionStep
            templates={availableTemplates}
            selectedTemplate={wizardState.selectedTemplate}
            isLoading={isLoadingTemplates}
            onSelectTemplate={selectTemplate}
          />
        )}

        {wizardState.currentStep === WizardStep.CONFIGURATION && (
          <ConfigurationStep
            data={wizardState.configuration}
            selectedTemplate={wizardState.selectedTemplate}
            onChange={updateConfiguration}
          />
        )}

        {wizardState.currentStep === WizardStep.VALIDATION && (
          <ValidationStep
            results={wizardState.validationResults}
            isValidating={isValidating}
            onRetryValidation={performValidation}
          />
        )}

        {wizardState.currentStep === WizardStep.CREATION && (
          <CreationStep
            isCreating={wizardState.isCreating}
            projectName={wizardState.projectInfo.name}
          />
        )}

        {wizardState.currentStep === WizardStep.COMPLETION && (
          <CompletionStep
            projectName={wizardState.projectInfo.name}
            onCreateAnother={resetWizard}
            onClose={onCancel}
          />
        )}
      </div>

      {/* Wizard Footer with Navigation */}
      <div className="wizard-footer">
        <div className="wizard-actions">
          <button
            type="button"
            onClick={handleCancel}
            className="btn btn-secondary"
            disabled={wizardState.isCreating}
          >
            Cancel
          </button>

          <div className="step-navigation">
            {wizardState.currentStep !== WizardStep.PROJECT_INFO && 
             wizardState.currentStep !== WizardStep.COMPLETION && (
              <button
                type="button"
                onClick={handlePreviousStep}
                className="btn btn-outline"
                disabled={wizardState.isCreating}
              >
                Previous
              </button>
            )}

            {wizardState.currentStep !== WizardStep.COMPLETION && (
              <button
                type="button"
                onClick={handleNextStep}
                className="btn btn-primary"
                disabled={!canProceedFromCurrentStep || wizardState.isCreating}
              >
                {wizardState.currentStep === WizardStep.CREATION ? 'Creating...' : 'Next'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Project Information Step Component
 * Adapted from Cline's form input patterns
 */
interface ProjectInfoStepProps {
  data: ProjectInfoData;
  errors: Record<string, string>;
  onChange: (updates: Partial<ProjectInfoData>) => void;
}

const ProjectInfoStep: React.FC<ProjectInfoStepProps> = ({
  data,
  errors,
  onChange
}) => {
  const handleTagInput = useCallback((value: string) => {
    const tags = value.split(',').map(tag => tag.trim()).filter(Boolean);
    onChange({ tags });
  }, [onChange]);

  return (
    <div className="project-info-step">
      <div className="form-section">
        <h3>Project Details</h3>
        
        <div className="form-group">
          <label htmlFor="project-name">Project Name *</label>
          <input
            id="project-name"
            type="text"
            value={data.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Enter project name"
            className={errors.name ? 'error' : ''}
            autoFocus
          />
          {errors.name && <span className="error-message">{errors.name}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="project-description">Description</label>
          <textarea
            id="project-description"
            value={data.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Describe your project (optional)"
            rows={3}
          />
        </div>

        <div className="form-group">
          <label htmlFor="workspace-path">Workspace Path *</label>
          <input
            id="workspace-path"
            type="text"
            value={data.workspacePath}
            onChange={(e) => onChange({ workspacePath: e.target.value })}
            placeholder="/path/to/project"
            className={errors.workspacePath ? 'error' : ''}
          />
          {errors.workspacePath && <span className="error-message">{errors.workspacePath}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="project-category">Category</label>
          <select
            id="project-category"
            value={data.category}
            onChange={(e) => onChange({ category: e.target.value })}
          >
            <option value="general">General</option>
            <option value="web">Web Application</option>
            <option value="backend">Backend Service</option>
            <option value="desktop">Desktop Application</option>
            <option value="mobile">Mobile Application</option>
            <option value="ai">AI/ML Project</option>
            <option value="data">Data Science</option>
            <option value="game">Game Development</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="project-tags">Tags</label>
          <input
            id="project-tags"
            type="text"
            value={data.tags.join(', ')}
            onChange={(e) => handleTagInput(e.target.value)}
            placeholder="Enter tags separated by commas"
          />
          <small className="form-help">Tags help categorize and search your projects</small>
        </div>
      </div>
    </div>
  );
};

/**
 * Template Selection Step Component  
 * Adapted from Cline's selection grid patterns
 */
interface TemplateSelectionStepProps {
  templates: ProjectTemplate[];
  selectedTemplate: ProjectTemplate | null;
  isLoading: boolean;
  onSelectTemplate: (template: ProjectTemplate | null) => void;
}

const TemplateSelectionStep: React.FC<TemplateSelectionStepProps> = ({
  templates,
  selectedTemplate,
  isLoading,
  onSelectTemplate
}) => {
  if (isLoading) {
    return (
      <div className="loading-state">
        <div className="loading-spinner" />
        <p>Loading project templates...</p>
      </div>
    );
  }

  return (
    <div className="template-selection-step">
      <div className="template-grid">
        {templates.map((template) => (
          <div
            key={template.id}
            className={`template-card ${
              selectedTemplate?.id === template.id ? 'selected' : ''
            }`}
            onClick={() => onSelectTemplate(template)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectTemplate(template);
              }
            }}
          >
            <div className="template-header">
              <h4>{template.name}</h4>
              <span className={`complexity-badge ${template.complexity}`}>
                {template.complexity}
              </span>
            </div>
            
            <p className="template-description">{template.description}</p>
            
            <div className="template-features">
              <h5>Features:</h5>
              <ul>
                {template.features?.map((feature, index) => (
                  <li key={index}>{feature.replace('-', ' ')}</li>
                ))}
              </ul>
            </div>

            <div className="template-structure">
              <h5>Structure:</h5>
              <div className="structure-preview">
                {template.scaffolding?.directories?.slice(0, 3).map((dir, index) => (
                  <div key={index} className="directory-item">📁 {dir}</div>
                ))}
                {template.scaffolding?.files?.slice(0, 3).map((file, index) => (
                  <div key={index} className="file-item">📄 {file}</div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedTemplate && (
        <div className="selected-template-info">
          <h4>Selected Template: {selectedTemplate.name}</h4>
          <p>{selectedTemplate.description}</p>
        </div>
      )}
    </div>
  );
};

/**
 * Configuration Step Component
 * Adapted from Cline's configuration UI patterns
 */
interface ConfigurationStepProps {
  data: ProjectConfigData;
  selectedTemplate: ProjectTemplate | null;
  onChange: (updates: Partial<ProjectConfigData>) => void;
}

const ConfigurationStep: React.FC<ConfigurationStepProps> = ({
  data,
  selectedTemplate,
  onChange
}) => {
  const { config: globalConfig } = useConfig();

  const aiProviders = [
    { id: 'openrouter', name: 'OpenRouter', models: ['anthropic/claude-3-5-sonnet-20241022', 'openai/gpt-4'] },
    { id: 'anthropic', name: 'Anthropic', models: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'] },
    { id: 'openai', name: 'OpenAI', models: ['gpt-4', 'gpt-3.5-turbo'] }
  ];

  const selectedProvider = aiProviders.find(p => p.id === data.aiProvider);

  return (
    <div className="configuration-step">
      <div className="config-sections">
        <div className="config-section">
          <h3>AI Model Configuration</h3>
          
          <div className="form-group">
            <label htmlFor="ai-provider">AI Provider</label>
            <select
              id="ai-provider"
              value={data.aiProvider}
              onChange={(e) => {
                const provider = aiProviders.find(p => p.id === e.target.value);
                onChange({
                  aiProvider: e.target.value,
                  aiModel: provider?.models[0] || ''
                });
              }}
            >
              {aiProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="ai-model">AI Model</label>
            <select
              id="ai-model"
              value={data.aiModel}
              onChange={(e) => onChange({ aiModel: e.target.value })}
            >
              {selectedProvider?.models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="config-section">
          <h3>Development Settings</h3>
          
          <div className="form-group">
            <label htmlFor="code-style">Code Style</label>
            <select
              id="code-style"
              value={data.codeStyle}
              onChange={(e) => onChange({ codeStyle: e.target.value })}
            >
              <option value="typescript">TypeScript</option>
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
              <option value="java">Java</option>
              <option value="csharp">C#</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="testing-framework">Testing Framework</label>
            <select
              id="testing-framework"
              value={data.testingFramework}
              onChange={(e) => onChange({ testingFramework: e.target.value })}
            >
              <option value="jest">Jest</option>
              <option value="vitest">Vitest</option>
              <option value="mocha">Mocha</option>
              <option value="cypress">Cypress</option>
              <option value="playwright">Playwright</option>
              <option value="none">No Testing</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="deployment-target">Deployment Target</label>
            <select
              id="deployment-target"
              value={data.deploymentTarget}
              onChange={(e) => onChange({ deploymentTarget: e.target.value })}
            >
              <option value="local">Local Development</option>
              <option value="docker">Docker Container</option>
              <option value="cloud">Cloud Platform</option>
              <option value="serverless">Serverless</option>
            </select>
          </div>
        </div>

        <div className="config-section">
          <h3>Advanced Options</h3>
          
          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={data.enableAdvancedFeatures}
                onChange={(e) => onChange({ enableAdvancedFeatures: e.target.checked })}
              />
              Enable Advanced Features
            </label>
            <small className="form-help">
              Include advanced AI capabilities, monitoring, and optimization features
            </small>
          </div>
        </div>
      </div>

      {selectedTemplate && (
        <div className="template-config-info">
          <h4>Template Configuration</h4>
          <p>Settings optimized for: {selectedTemplate.name}</p>
          <ul>
            {selectedTemplate.features?.map((feature, index) => (
              <li key={index}>✓ {feature.replace('-', ' ')}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

/**
 * Validation Step Component
 * Adapted from Cline's validation display patterns
 */
interface ValidationStepProps {
  results: ProjectValidationResult[];
  isValidating: boolean;
  onRetryValidation: () => void;
}

const ValidationStep: React.FC<ValidationStepProps> = ({
  results,
  isValidating,
  onRetryValidation
}) => {
  const hasErrors = results.some(result => !result.isValid);

  if (isValidating) {
    return (
      <div className="validation-step loading">
        <div className="loading-spinner" />
        <p>Validating project configuration...</p>
      </div>
    );
  }

  return (
    <div className="validation-step">
      <div className="validation-summary">
        <h3>Validation Results</h3>
        {hasErrors ? (
          <div className="validation-status error">
            <span className="status-icon">⚠️</span>
            <span>Issues found that need attention</span>
          </div>
        ) : (
          <div className="validation-status success">
            <span className="status-icon">✅</span>
            <span>All validations passed</span>
          </div>
        )}
      </div>

      <div className="validation-results">
        {results.map((result, index) => (
          <div
            key={index}
            className={`validation-result ${result.isValid ? 'valid' : 'invalid'}`}
          >
            <div className="result-header">
              <span className={`result-icon ${result.isValid ? 'success' : 'error'}`}>
                {result.isValid ? '✅' : '❌'}
              </span>
              <span className="result-field">{result.field}</span>
              <span className={`result-severity ${result.severity || 'info'}`}>
                {result.severity || 'info'}
              </span>
            </div>
            
            {result.errorMessage && (
              <p className="result-message">{result.errorMessage}</p>
            )}
            
            {result.suggestion && (
              <p className="result-suggestion">💡 {result.suggestion}</p>
            )}
          </div>
        ))}
      </div>

      {hasErrors && (
        <div className="validation-actions">
          <button
            type="button"
            onClick={onRetryValidation}
            className="btn btn-primary"
          >
            Retry Validation
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * Creation Step Component
 * Shows progress during project creation
 */
interface CreationStepProps {
  isCreating: boolean;
  projectName: string;
}

const CreationStep: React.FC<CreationStepProps> = ({
  isCreating,
  projectName
}) => {
  return (
    <div className="creation-step">
      {isCreating ? (
        <div className="creation-progress">
          <div className="loading-spinner large" />
          <h3>Creating Project: {projectName}</h3>
          <p>Setting up project structure and initializing files...</p>
          <div className="progress-steps">
            <div className="progress-step active">📁 Creating directories</div>
            <div className="progress-step active">📄 Generating files</div>
            <div className="progress-step">⚙️ Installing dependencies</div>
            <div className="progress-step">🔧 Configuring services</div>
          </div>
        </div>
      ) : (
        <div className="creation-ready">
          <h3>Ready to Create Project</h3>
          <p>All configurations validated. Click "Next" to create your project.</p>
        </div>
      )}
    </div>
  );
};

/**
 * Completion Step Component
 * Shows successful creation and next actions
 */
interface CompletionStepProps {
  projectName: string;
  onCreateAnother: () => void;
  onClose: () => void;
}

const CompletionStep: React.FC<CompletionStepProps> = ({
  projectName,
  onCreateAnother,
  onClose
}) => {
  return (
    <div className="completion-step">
      <div className="success-message">
        <div className="success-icon">🎉</div>
        <h3>Project Created Successfully!</h3>
        <p>Your project "{projectName}" has been created and is ready for development.</p>
      </div>

      <div className="next-actions">
        <h4>Next Steps:</h4>
        <ul>
          <li>✅ Project structure created</li>
          <li>✅ Configuration files generated</li>
          <li>✅ Development environment configured</li>
          <li>🚀 Ready to start coding!</li>
        </ul>
      </div>

      <div className="completion-actions">
        <button
          type="button"
          onClick={onCreateAnother}
          className="btn btn-outline"
        >
          Create Another Project
        </button>
        
        <button
          type="button"
          onClick={onClose}
          className="btn btn-primary"
        >
          Open Project
        </button>
      </div>
    </div>
  );
};

export default ProjectCreationWizard;
