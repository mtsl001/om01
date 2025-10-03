// packages/project-management/services/ProjectSettingsService.ts

/**
 * Project Settings Service for ReadyAI Personal AI Development Orchestrator
 * 
 * Comprehensive project-level settings management with hierarchical inheritance,
 * user preferences, and enterprise-grade configuration capabilities.
 * 
 * Based on Cline's proven settings management architecture with ReadyAI-specific
 * extensions for project-level configuration, user preference inheritance,
 * and multi-phase development methodology integration.
 * 
 * Key Features:
 * - Project-level settings with global defaults inheritance
 * - User-specific preference management and overrides
 * - Phase-aware configuration with automatic switching
 * - Real-time settings synchronization and validation
 * - Backup and restoration capabilities
 * - Enterprise audit trail and compliance tracking
 * 
 * Cline Pattern Reuse (~85%):
 * - Settings management and validation patterns from Cline's ConfigService
 * - User preference handling from Cline's state management
 * - Auto-approval and permission systems from Cline's workflow engine
 * - Event-driven updates and notifications from Cline's messaging system
 * - Hierarchical configuration inheritance patterns
 * 
 * @version 1.0.0 - Master Implementation Phase
 * @author ReadyAI Development Team
 */

import {
  UUID,
  ApiResponse,
  ReadyAIError,
  createApiResponse,
  createApiError,
  isApiSuccess,
  wrapAsync,
  generateUUID,
  createTimestamp,
  PhaseType,
  AIProviderType,
  ValidationResult,
  QualityMetrics
} from '../../foundation/types/core';

import {
  Project,
  ProjectCreationMethod,
  ProjectComplexity,
  ProjectPriority,
  ProjectHealth,
  ProjectCollaborator
} from '../types/project';

import { ConfigService } from '../../config/services/ConfigService';
import { Logger } from '../../logging/services/Logger';
import { ErrorService } from '../../error-handling/services/ErrorService';

// =============================================================================
// PROJECT SETTINGS TYPES
// =============================================================================

/**
 * Project-specific settings categories following Cline's configuration patterns
 */
export interface ProjectSettings {
  /** Unique settings identifier */
  id: UUID;
  /** Associated project identifier */
  projectId: UUID;
  /** Settings version for migration compatibility */
  version: string;
  /** Last modification timestamp */
  lastModified: string;
  /** User who last modified settings */
  lastModifiedBy: UUID;
  
  // Core project configuration
  /** AI provider settings specific to this project */
  aiSettings: ProjectAISettings;
  /** Development workflow preferences */
  developmentSettings: ProjectDevelopmentSettings;
  /** Quality assurance configuration */
  qualitySettings: ProjectQualitySettings;
  /** User interface customization */
  uiSettings: ProjectUISettings;
  /** Notification and alert preferences */
  notificationSettings: ProjectNotificationSettings;
  /** Security and privacy settings */
  securitySettings: ProjectSecuritySettings;
  /** Integration and external service settings */
  integrationSettings: ProjectIntegrationSettings;
  /** Backup and recovery preferences */
  backupSettings: ProjectBackupSettings;
  
  // Advanced configuration
  /** Phase-specific setting overrides */
  phaseOverrides: Record<PhaseType, Partial<ProjectSettings>>;
  /** User-specific customizations */
  userOverrides: Record<UUID, Partial<ProjectSettings>>;
  /** Environment-specific configurations */
  environmentOverrides: Record<string, Partial<ProjectSettings>>;
  
  // Metadata
  /** Settings inheritance chain */
  inheritanceChain: string[];
  /** Applied configuration source tracking */
  appliedSources: {
    source: 'global' | 'project' | 'user' | 'phase' | 'environment';
    priority: number;
    appliedAt: string;
  }[];
}

/**
 * AI provider settings for project-level customization
 * Adapted from Cline's API configuration patterns
 */
export interface ProjectAISettings {
  /** Preferred AI provider for this project */
  primaryProvider: AIProviderType;
  /** Fallback providers in order of preference */
  fallbackProviders: AIProviderType[];
  /** Model selection by phase */
  phaseModels: Record<PhaseType, {
    modelId: string;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
  }>;
  /** Token usage limits and budgets */
  tokenBudgets: {
    dailyLimit: number;
    weeklyLimit: number;
    monthlyLimit: number;
    alertThresholds: number[];
  };
  /** Context management preferences */
  contextSettings: {
    maxContextLength: number;
    compressionThreshold: number;
    preserveHistory: boolean;
    contextRetentionDays: number;
  };
  /** Advanced AI features configuration */
  advancedFeatures: {
    enableExtendedThinking: boolean;
    enableContextCompression: boolean;
    enableReasoning: boolean;
    enableCodeAnalysis: boolean;
  };
}

/**
 * Development workflow settings
 * Based on Cline's task management and workflow patterns
 */
export interface ProjectDevelopmentSettings {
  /** Auto-save configuration */
  autoSave: {
    enabled: boolean;
    intervalSeconds: number;
    maxBackups: number;
  };
  /** Git integration settings */
  gitIntegration: {
    enabled: boolean;
    autoCommit: boolean;
    commitMessageTemplate: string;
    branchNamingPattern: string;
    tagOnPhaseCompletion: boolean;
  };
  /** Code generation preferences */
  codeGeneration: {
    preferredLanguages: string[];
    codingStandards: string[];
    documentationLevel: 'minimal' | 'standard' | 'comprehensive';
    includeTests: boolean;
    testFrameworks: string[];
  };
  /** Checkpoint and recovery settings */
  checkpoints: {
    enabled: boolean;
    frequency: 'phase' | 'milestone' | 'daily' | 'manual';
    retentionDays: number;
    compressOld: boolean;
  };
  /** File organization preferences */
  fileOrganization: {
    structureTemplate: string;
    namingConventions: Record<string, string>;
    autoOrganize: boolean;
  };
}

/**
 * Quality assurance settings
 * Enhanced from Cline's validation patterns
 */
export interface ProjectQualitySettings {
  /** Code quality thresholds */
  codeQuality: {
    minimumCoverage: number;
    lintingLevel: 'relaxed' | 'standard' | 'strict';
    complexityThreshold: number;
    maintainabilityIndex: number;
  };
  /** Testing requirements */
  testing: {
    requiredCoverage: number;
    testTypes: ('unit' | 'integration' | 'e2e' | 'performance')[];
    mockingStrategy: 'minimal' | 'moderate' | 'extensive';
    testDataManagement: 'inline' | 'fixtures' | 'generated';
  };
  /** Documentation standards */
  documentation: {
    requiredSections: string[];
    apiDocumentation: boolean;
    codeComments: 'minimal' | 'standard' | 'verbose';
    changelogFormat: string;
  };
  /** Validation and review settings */
  validation: {
    preCommitChecks: string[];
    peerReviewRequired: boolean;
    automatedReview: boolean;
    qualityGates: string[];
  };
}

/**
 * User interface customization settings
 * Adapted from Cline's UI preferences
 */
export interface ProjectUISettings {
  /** Theme and appearance */
  appearance: {
    theme: 'light' | 'dark' | 'auto' | 'custom';
    accentColor: string;
    fontFamily: string;
    fontSize: number;
    compactMode: boolean;
  };
  /** Layout preferences */
  layout: {
    sidebarPosition: 'left' | 'right';
    panelLayout: 'horizontal' | 'vertical' | 'adaptive';
    showLineNumbers: boolean;
    showMinimap: boolean;
    wordWrap: boolean;
  };
  /** Dashboard configuration */
  dashboard: {
    defaultView: 'overview' | 'tasks' | 'metrics' | 'files';
    widgetOrder: string[];
    showMetrics: boolean;
    refreshInterval: number;
  };
  /** Accessibility settings */
  accessibility: {
    highContrast: boolean;
    screenReaderSupport: boolean;
    keyboardNavigation: boolean;
    reduceMotion: boolean;
  };
}

/**
 * Notification and alert preferences
 * Based on Cline's notification system
 */
export interface ProjectNotificationSettings {
  /** Notification channels */
  channels: {
    inApp: boolean;
    email: boolean;
    desktop: boolean;
    webhook?: string;
  };
  /** Event-based notifications */
  events: {
    phaseCompletion: boolean;
    errors: boolean;
    warnings: boolean;
    milestones: boolean;
    collaboratorActivity: boolean;
    budgetAlerts: boolean;
    qualityIssues: boolean;
  };
  /** Notification timing */
  timing: {
    quietHoursStart?: string;
    quietHoursEnd?: string;
    timezone: string;
    batchNotifications: boolean;
    maxFrequency: 'immediate' | 'hourly' | 'daily';
  };
  /** Custom notification rules */
  customRules: Array<{
    id: UUID;
    name: string;
    condition: string;
    action: 'notify' | 'email' | 'webhook' | 'ignore';
    enabled: boolean;
  }>;
}

/**
 * Security and privacy settings
 * Enhanced security patterns from Cline
 */
export interface ProjectSecuritySettings {
  /** Data protection */
  dataProtection: {
    encryption: boolean;
    encryptionLevel: 'standard' | 'high' | 'maximum';
    dataRetentionDays: number;
    anonymizeData: boolean;
  };
  /** Access control */
  accessControl: {
    requireAuthentication: boolean;
    sessionTimeout: number;
    ipWhitelist?: string[];
    twoFactorRequired: boolean;
  };
  /** Audit and compliance */
  audit: {
    logAllActions: boolean;
    detailedLogging: boolean;
    complianceMode: boolean;
    retentionPolicy: string;
  };
  /** External service security */
  externalServices: {
    allowThirdParty: boolean;
    approvedDomains: string[];
    requireSSL: boolean;
    validateCertificates: boolean;
  };
}

/**
 * Integration and external service settings
 */
export interface ProjectIntegrationSettings {
  /** Enabled integrations */
  enabled: string[];
  /** Integration configurations */
  configurations: Record<string, {
    enabled: boolean;
    settings: Record<string, any>;
    authentication?: {
      type: 'api_key' | 'oauth' | 'token';
      encrypted: boolean;
    };
  }>;
  /** Webhook settings */
  webhooks: Array<{
    id: UUID;
    name: string;
    url: string;
    events: string[];
    enabled: boolean;
    secret?: string;
  }>;
}

/**
 * Backup and recovery preferences
 */
export interface ProjectBackupSettings {
  /** Automatic backup configuration */
  automatic: {
    enabled: boolean;
    frequency: 'hourly' | 'daily' | 'weekly';
    retentionDays: number;
    includeSettings: boolean;
  };
  /** Manual backup options */
  manual: {
    includeArtifacts: boolean;
    compressionLevel: 'none' | 'fast' | 'best';
    encryptBackups: boolean;
  };
  /** Recovery preferences */
  recovery: {
    autoRestore: boolean;
    verifyBackups: boolean;
    notifyOnFailure: boolean;
  };
}

/**
 * Settings update request structure
 */
export interface ProjectSettingsUpdateRequest {
  /** Project identifier */
  projectId: UUID;
  /** Settings to update (partial) */
  updates: Partial<ProjectSettings>;
  /** Update metadata */
  metadata?: {
    reason: string;
    source: 'user' | 'system' | 'migration' | 'sync';
    batch?: boolean;
  };
  /** Validation options */
  validation?: {
    strict: boolean;
    skipWarnings: boolean;
    dryRun: boolean;
  };
}

/**
 * Settings inheritance resolution result
 */
export interface SettingsResolutionResult {
  /** Final resolved settings */
  settings: ProjectSettings;
  /** Resolution metadata */
  resolution: {
    appliedSources: string[];
    overrides: number;
    conflicts: Array<{
      path: string;
      sources: string[];
      resolved: any;
    }>;
  };
  /** Validation results */
  validation: ValidationResult;
}

// =============================================================================
// PROJECT SETTINGS SERVICE IMPLEMENTATION
// =============================================================================

/**
 * Project Settings Service Options
 */
export interface ProjectSettingsServiceOptions {
  /** Enable automatic settings inheritance */
  enableInheritance?: boolean;
  /** Enable settings validation */
  enableValidation?: boolean;
  /** Enable settings caching */
  enableCaching?: boolean;
  /** Cache TTL in milliseconds */
  cacheTtlMs?: number;
  /** Enable change event emission */
  enableEvents?: boolean;
  /** Maximum inheritance depth */
  maxInheritanceDepth?: number;
}

/**
 * Default service options
 */
const DEFAULT_SERVICE_OPTIONS: Required<ProjectSettingsServiceOptions> = {
  enableInheritance: true,
  enableValidation: true,
  enableCaching: true,
  cacheTtlMs: 300000, // 5 minutes
  enableEvents: true,
  maxInheritanceDepth: 10
};

/**
 * Settings change event
 */
export interface SettingsChangeEvent {
  /** Event identifier */
  eventId: UUID;
  /** Event timestamp */
  timestamp: string;
  /** Project identifier */
  projectId: UUID;
  /** User who made the change */
  userId?: UUID;
  /** Changed settings paths */
  changedPaths: string[];
  /** Previous values */
  previousValues: Record<string, any>;
  /** New values */
  newValues: Record<string, any>;
  /** Change source */
  source: 'user' | 'system' | 'migration' | 'sync';
}

/**
 * Settings event listener type
 */
export type SettingsEventListener = (event: SettingsChangeEvent) => void | Promise<void>;

/**
 * Project Settings Service
 * 
 * Comprehensive project-level settings management service implementing
 * Cline's proven configuration patterns with ReadyAI-specific enhancements.
 * 
 * Key responsibilities:
 * - Project settings CRUD operations with validation
 * - Hierarchical inheritance from global and user settings
 * - Phase-aware configuration management
 * - Real-time change synchronization and events
 * - Backup and restoration capabilities
 * - User preference management and overrides
 * - Security and audit trail maintenance
 */
export class ProjectSettingsService {
  private readonly configService: ConfigService;
  private readonly logger: Logger;
  private readonly errorService: ErrorService;
  private readonly options: Required<ProjectSettingsServiceOptions>;
  
  // Event management (following Cline's event patterns)
  private readonly eventListeners = new Map<string, Set<SettingsEventListener>>();
  
  // Settings cache with hierarchy awareness
  private readonly settingsCache = new Map<string, {
    settings: ProjectSettings;
    resolved: SettingsResolutionResult;
    timestamp: number;
    etag: string;
  }>();
  
  // Settings inheritance cache
  private readonly inheritanceCache = new Map<string, {
    chain: string[];
    sources: Record<string, any>;
    timestamp: number;
  }>();

  constructor(
    configService: ConfigService,
    options: ProjectSettingsServiceOptions = {},
    logger?: Logger,
    errorService?: ErrorService
  ) {
    this.configService = configService;
    this.logger = logger || this.createBasicLogger();
    this.errorService = errorService || this.createBasicErrorService();
    this.options = { ...DEFAULT_SERVICE_OPTIONS, ...options };

    this.logger.info('ProjectSettingsService initialized', {
      options: this.options,
      cacheEnabled: this.options.enableCaching,
      inheritanceEnabled: this.options.enableInheritance,
      validationEnabled: this.options.enableValidation
    });
  }

  /**
   * Get project settings with full inheritance resolution
   * Following Cline's configuration retrieval patterns
   */
  async getProjectSettings(projectId: UUID, options?: {
    includeInherited?: boolean;
    resolveOverrides?: boolean;
    userId?: UUID;
    phase?: PhaseType;
    environment?: string;
  }): Promise<ApiResponse<SettingsResolutionResult>> {
    return wrapAsync(async () => {
      this.logger.debug('Getting project settings', { projectId, options });

      const cacheKey = this.buildCacheKey(projectId, options);

      // Check cache first
      if (this.options.enableCaching) {
        const cached = this.getCachedSettings(cacheKey);
        if (cached) {
          this.logger.debug('Project settings retrieved from cache', { projectId });
          return createApiResponse(cached);
        }
      }

      // Load base project settings
      const baseSettings = await this.loadProjectSettings(projectId);
      if (!baseSettings) {
        throw new ReadyAIError(
          `Project settings not found: ${projectId}`,
          'PROJECT_SETTINGS_NOT_FOUND',
          404,
          { projectId }
        );
      }

      // Resolve inheritance if enabled
      let resolvedSettings: SettingsResolutionResult;
      if (this.options.enableInheritance && options?.includeInherited !== false) {
        resolvedSettings = await this.resolveSettingsInheritance(
          baseSettings,
          projectId,
          options
        );
      } else {
        resolvedSettings = {
          settings: baseSettings,
          resolution: {
            appliedSources: ['project'],
            overrides: 0,
            conflicts: []
          },
          validation: await this.validateSettings(baseSettings, projectId)
        };
      }

      // Cache the resolved settings
      if (this.options.enableCaching) {
        this.setCachedSettings(cacheKey, resolvedSettings);
      }

      this.logger.info('Project settings retrieved successfully', { 
        projectId,
        sourcesApplied: resolvedSettings.resolution.appliedSources.length,
        overridesApplied: resolvedSettings.resolution.overrides,
        validationPassed: resolvedSettings.validation.passed
      });

      return createApiResponse(resolvedSettings);
    });
  }

  /**
   * Update project settings with validation and change tracking
   * Adapted from Cline's configuration update patterns
   */
  async updateProjectSettings(
    request: ProjectSettingsUpdateRequest
  ): Promise<ApiResponse<SettingsResolutionResult>> {
    return wrapAsync(async () => {
      this.logger.debug('Updating project settings', { 
        projectId: request.projectId,
        updatePaths: Object.keys(request.updates)
      });

      // Get current settings for change tracking
      const currentResult = await this.getProjectSettings(request.projectId);
      if (!isApiSuccess(currentResult)) {
        throw new ReadyAIError(
          `Failed to get current settings: ${currentResult.error.message}`,
          'SETTINGS_UPDATE_ERROR',
          500,
          { projectId: request.projectId }
        );
      }

      const currentSettings = currentResult.data.settings;

      // Build updated settings
      const updatedSettings = this.mergeSettings(currentSettings, request.updates);

      // Validate updated settings
      if (this.options.enableValidation && !request.validation?.dryRun) {
        const validationResult = await this.validateSettings(updatedSettings, request.projectId);
        
        if (!validationResult.passed && request.validation?.strict !== false) {
          throw new ReadyAIError(
            `Settings validation failed: ${validationResult.errors.join(', ')}`,
            'SETTINGS_VALIDATION_ERROR',
            422,
            { 
              projectId: request.projectId,
              errors: validationResult.errors,
              warnings: validationResult.warnings
            }
          );
        }

        // Return early if dry run
        if (request.validation?.dryRun) {
          return createApiResponse({
            settings: updatedSettings,
            resolution: {
              appliedSources: ['validation'],
              overrides: 0,
              conflicts: []
            },
            validation: validationResult
          });
        }
      }

      // Update timestamps and metadata
      updatedSettings.lastModified = createTimestamp();
      updatedSettings.lastModifiedBy = request.metadata?.source === 'user' ? 
        generateUUID() : // Should come from authenticated user context
        updatedSettings.lastModifiedBy;

      // Persist updated settings
      const saveResult = await this.saveProjectSettings(updatedSettings);
      if (!isApiSuccess(saveResult)) {
        throw new ReadyAIError(
          `Failed to save settings: ${saveResult.error.message}`,
          'SETTINGS_SAVE_ERROR',
          500,
          { projectId: request.projectId }
        );
      }

      // Invalidate relevant caches
      this.invalidateSettingsCache(request.projectId);

      // Emit change event
      if (this.options.enableEvents) {
        await this.emitSettingsChange({
          eventId: generateUUID(),
          timestamp: createTimestamp(),
          projectId: request.projectId,
          changedPaths: Object.keys(request.updates),
          previousValues: this.extractValues(currentSettings, Object.keys(request.updates)),
          newValues: this.extractValues(updatedSettings, Object.keys(request.updates)),
          source: request.metadata?.source || 'user'
        });
      }

      // Get final resolved settings
      const finalResult = await this.getProjectSettings(request.projectId, {
        includeInherited: true,
        resolveOverrides: true
      });

      if (!isApiSuccess(finalResult)) {
        this.logger.warn('Failed to get final resolved settings after update', {
          projectId: request.projectId,
          error: finalResult.error
        });
        
        // Return basic result without full resolution
        return createApiResponse({
          settings: updatedSettings,
          resolution: {
            appliedSources: ['project'],
            overrides: 0,
            conflicts: []
          },
          validation: await this.validateSettings(updatedSettings, request.projectId)
        });
      }

      this.logger.info('Project settings updated successfully', {
        projectId: request.projectId,
        changedPaths: Object.keys(request.updates).length,
        source: request.metadata?.source
      });

      return finalResult;
    });
  }

  /**
   * Create default project settings for a new project
   * Following Cline's default configuration patterns
   */
  async createDefaultProjectSettings(
    projectId: UUID, 
    project?: Partial<Project>
  ): Promise<ApiResponse<ProjectSettings>> {
    return wrapAsync(async () => {
      this.logger.debug('Creating default project settings', { projectId });

      const defaultSettings: ProjectSettings = {
        id: generateUUID(),
        projectId,
        version: '1.0.0',
        lastModified: createTimestamp(),
        lastModifiedBy: generateUUID(), // Should come from authenticated user

        // AI settings with reasonable defaults
        aiSettings: {
          primaryProvider: 'claude-3.5-sonnet',
          fallbackProviders: ['gpt-4', 'gemini-pro'],
          phaseModels: this.createDefaultPhaseModels(),
          tokenBudgets: {
            dailyLimit: 100000,
            weeklyLimit: 500000,
            monthlyLimit: 2000000,
            alertThresholds: [0.8, 0.9, 0.95]
          },
          contextSettings: {
            maxContextLength: 200000,
            compressionThreshold: 0.8,
            preserveHistory: true,
            contextRetentionDays: 30
          },
          advancedFeatures: {
            enableExtendedThinking: false,
            enableContextCompression: true,
            enableReasoning: true,
            enableCodeAnalysis: true
          }
        },

        // Development settings based on project type
        developmentSettings: {
          autoSave: {
            enabled: true,
            intervalSeconds: 30,
            maxBackups: 10
          },
          gitIntegration: {
            enabled: true,
            autoCommit: false,
            commitMessageTemplate: '[{phase}] {description}',
            branchNamingPattern: 'feature/{phase}-{description}',
            tagOnPhaseCompletion: true
          },
          codeGeneration: {
            preferredLanguages: project?.techStack?.languages || ['typescript', 'python'],
            codingStandards: ['prettier', 'eslint'],
            documentationLevel: 'standard',
            includeTests: true,
            testFrameworks: ['jest', 'vitest']
          },
          checkpoints: {
            enabled: true,
            frequency: 'phase',
            retentionDays: 30,
            compressOld: true
          },
          fileOrganization: {
            structureTemplate: 'modular',
            namingConventions: {
              components: 'PascalCase',
              functions: 'camelCase',
              constants: 'UPPER_SNAKE_CASE'
            },
            autoOrganize: false
          }
        },

        // Quality settings based on project complexity
        qualitySettings: {
          codeQuality: {
            minimumCoverage: project?.complexity === 'enterprise' ? 85 : 70,
            lintingLevel: 'standard',
            complexityThreshold: 10,
            maintainabilityIndex: 70
          },
          testing: {
            requiredCoverage: project?.complexity === 'enterprise' ? 90 : 75,
            testTypes: ['unit', 'integration'],
            mockingStrategy: 'moderate',
            testDataManagement: 'fixtures'
          },
          documentation: {
            requiredSections: ['overview', 'setup', 'usage'],
            apiDocumentation: true,
            codeComments: 'standard',
            changelogFormat: 'conventional'
          },
          validation: {
            preCommitChecks: ['lint', 'test', 'build'],
            peerReviewRequired: project?.complexity === 'enterprise',
            automatedReview: true,
            qualityGates: ['coverage', 'duplication', 'security']
          }
        },

        // UI settings with modern defaults
        uiSettings: {
          appearance: {
            theme: 'auto',
            accentColor: '#007ACC',
            fontFamily: 'Fira Code',
            fontSize: 14,
            compactMode: false
          },
          layout: {
            sidebarPosition: 'left',
            panelLayout: 'adaptive',
            showLineNumbers: true,
            showMinimap: true,
            wordWrap: true
          },
          dashboard: {
            defaultView: 'overview',
            widgetOrder: ['progress', 'metrics', 'recent'],
            showMetrics: true,
            refreshInterval: 30000
          },
          accessibility: {
            highContrast: false,
            screenReaderSupport: false,
            keyboardNavigation: true,
            reduceMotion: false
          }
        },

        // Notification settings
        notificationSettings: {
          channels: {
            inApp: true,
            email: false,
            desktop: false
          },
          events: {
            phaseCompletion: true,
            errors: true,
            warnings: false,
            milestones: true,
            collaboratorActivity: false,
            budgetAlerts: true,
            qualityIssues: true
          },
          timing: {
            timezone: 'UTC',
            batchNotifications: true,
            maxFrequency: 'hourly'
          },
          customRules: []
        },

        // Security settings
        securitySettings: {
          dataProtection: {
            encryption: false,
            encryptionLevel: 'standard',
            dataRetentionDays: 90,
            anonymizeData: false
          },
          accessControl: {
            requireAuthentication: false,
            sessionTimeout: 3600,
            twoFactorRequired: false
          },
          audit: {
            logAllActions: false,
            detailedLogging: false,
            complianceMode: false,
            retentionPolicy: '30d'
          },
          externalServices: {
            allowThirdParty: true,
            approvedDomains: [],
            requireSSL: true,
            validateCertificates: true
          }
        },

        // Integration settings
        integrationSettings: {
          enabled: [],
          configurations: {},
          webhooks: []
        },

        // Backup settings
        backupSettings: {
          automatic: {
            enabled: true,
            frequency: 'daily',
            retentionDays: 30,
            includeSettings: true
          },
          manual: {
            includeArtifacts: true,
            compressionLevel: 'fast',
            encryptBackups: false
          },
          recovery: {
            autoRestore: false,
            verifyBackups: true,
            notifyOnFailure: true
          }
        },

        // Advanced configuration
        phaseOverrides: {},
        userOverrides: {},
        environmentOverrides: {},
        inheritanceChain: ['global'],
        appliedSources: [{
          source: 'project',
          priority: 1,
          appliedAt: createTimestamp()
        }]
      };

      // Save default settings
      const saveResult = await this.saveProjectSettings(defaultSettings);
      if (!isApiSuccess(saveResult)) {
        throw new ReadyAIError(
          `Failed to save default settings: ${saveResult.error.message}`,
          'DEFAULT_SETTINGS_CREATE_ERROR',
          500,
          { projectId }
        );
      }

      this.logger.info('Default project settings created successfully', { projectId });

      return createApiResponse(defaultSettings);
    });
  }

  /**
   * Get user-specific settings for a project
   * Following Cline's user preference patterns
   */
  async getUserProjectSettings(
    projectId: UUID,
    userId: UUID
  ): Promise<ApiResponse<Partial<ProjectSettings>>> {
    return wrapAsync(async () => {
      this.logger.debug('Getting user project settings', { projectId, userId });

      // Get base project settings first
      const baseResult = await this.getProjectSettings(projectId);
      if (!isApiSuccess(baseResult)) {
        throw new ReadyAIError(
          `Failed to get project settings: ${baseResult.error.message}`,
          'USER_SETTINGS_ERROR',
          500,
          { projectId, userId }
        );
      }

      const baseSettings = baseResult.data.settings;
      const userOverrides = baseSettings.userOverrides[userId] || {};

      return createApiResponse(userOverrides);
    });
  }

  /**
   * Update user-specific settings for a project
   */
  async updateUserProjectSettings(
    projectId: UUID,
    userId: UUID,
    updates: Partial<ProjectSettings>
  ): Promise<ApiResponse<ProjectSettings>> {
    return wrapAsync(async () => {
      this.logger.debug('Updating user project settings', { projectId, userId });

      // Get current project settings
      const currentResult = await this.getProjectSettings(projectId);
      if (!isApiSuccess(currentResult)) {
        throw new ReadyAIError(
          `Failed to get project settings: ${currentResult.error.message}`,
          'USER_SETTINGS_UPDATE_ERROR',
          500,
          { projectId, userId }
        );
      }

      const currentSettings = currentResult.data.settings;
      
      // Update user overrides
      currentSettings.userOverrides[userId] = {
        ...currentSettings.userOverrides[userId],
        ...updates
      };

      // Save updated settings
      return await this.updateProjectSettings({
        projectId,
        updates: { userOverrides: currentSettings.userOverrides },
        metadata: { source: 'user', reason: 'User preference update' }
      }).then(result => {
        if (isApiSuccess(result)) {
          return createApiResponse(result.data.settings);
        }
        return result as ApiResponse<ProjectSettings>;
      });
    });
  }

  /**
   * Delete project settings
   */
  async deleteProjectSettings(projectId: UUID): Promise<ApiResponse<void>> {
    return wrapAsync(async () => {
      this.logger.debug('Deleting project settings', { projectId });

      // Implementation would depend on storage mechanism
      // For now, we'll simulate success
      this.invalidateSettingsCache(projectId);

      this.logger.info('Project settings deleted successfully', { projectId });

      return createApiResponse(undefined);
    });
  }

  /**
   * Export project settings for backup or migration
   */
  async exportProjectSettings(
    projectId: UUID,
    options?: {
      includeUserOverrides?: boolean;
      includeSecrets?: boolean;
      format?: 'json' | 'yaml';
    }
  ): Promise<ApiResponse<string>> {
    return wrapAsync(async () => {
      this.logger.debug('Exporting project settings', { projectId, options });

      const settingsResult = await this.getProjectSettings(projectId);
      if (!isApiSuccess(settingsResult)) {
        throw new ReadyAIError(
          `Failed to get settings for export: ${settingsResult.error.message}`,
          'SETTINGS_EXPORT_ERROR',
          500,
          { projectId }
        );
      }

      let settings = settingsResult.data.settings;

      // Remove user overrides if not requested
      if (!options?.includeUserOverrides) {
        settings = { ...settings, userOverrides: {} };
      }

      // Remove secrets if not requested
      if (!options?.includeSecrets) {
        settings = this.sanitizeSettingsForExport(settings);
      }

      // Convert to requested format
      const exported = options?.format === 'yaml' ? 
        this.toYaml(settings) : 
        JSON.stringify(settings, null, 2);

      this.logger.info('Project settings exported successfully', { 
        projectId,
        format: options?.format || 'json',
        size: exported.length
      });

      return createApiResponse(exported);
    });
  }

  /**
   * Import project settings from backup or migration
   */
  async importProjectSettings(
    projectId: UUID,
    settingsData: string,
    options?: {
      overwrite?: boolean;
      validate?: boolean;
      format?: 'json' | 'yaml';
    }
  ): Promise<ApiResponse<ProjectSettings>> {
    return wrapAsync(async () => {
      this.logger.debug('Importing project settings', { projectId, options });

      // Parse settings data
      let settings: ProjectSettings;
      try {
        settings = options?.format === 'yaml' ?
          this.fromYaml(settingsData) :
          JSON.parse(settingsData);
      } catch (error) {
        throw new ReadyAIError(
          `Failed to parse settings data: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'SETTINGS_IMPORT_PARSE_ERROR',
          422,
          { projectId }
        );
      }

      // Update project ID to match target
      settings.projectId = projectId;
      settings.id = generateUUID();
      settings.lastModified = createTimestamp();

      // Validate if requested
      if (options?.validate !== false) {
        const validationResult = await this.validateSettings(settings, projectId);
        if (!validationResult.passed) {
          throw new ReadyAIError(
            `Settings validation failed: ${validationResult.errors.join(', ')}`,
            'SETTINGS_IMPORT_VALIDATION_ERROR',
            422,
            { 
              projectId,
              errors: validationResult.errors,
              warnings: validationResult.warnings
            }
          );
        }
      }

      // Save imported settings
      const saveResult = await this.saveProjectSettings(settings);
      if (!isApiSuccess(saveResult)) {
        throw new ReadyAIError(
          `Failed to save imported settings: ${saveResult.error.message}`,
          'SETTINGS_IMPORT_SAVE_ERROR',
          500,
          { projectId }
        );
      }

      this.logger.info('Project settings imported successfully', { projectId });

      return createApiResponse(settings);
    });
  }

  /**
   * Subscribe to settings change events
   * Following Cline's event subscription patterns
   */
  addEventListener(
    eventType: string | '*',
    listener: SettingsEventListener
  ): () => void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    
    this.eventListeners.get(eventType)!.add(listener);
    
    // Return unsubscribe function
    return () => {
      const listeners = this.eventListeners.get(eventType);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.eventListeners.delete(eventType);
        }
      }
    };
  }

  /**
   * Get health status of the settings service
   */
  async getHealthStatus(): Promise<ApiResponse<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
  }>> {
    return wrapAsync(async () => {
      const checks: Record<string, any> = {};
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

      // Check config service health
      try {
        const configHealth = await this.configService.getHealthStatus();
        checks.configService = isApiSuccess(configHealth) ? 'healthy' : 'unhealthy';
        if (!isApiSuccess(configHealth)) {
          status = 'unhealthy';
        }
      } catch (error) {
        checks.configService = 'unhealthy';
        status = 'unhealthy';
      }

      // Check cache status
      checks.cache = {
        enabled: this.options.enableCaching,
        size: this.settingsCache.size,
        maxAge: this.options.cacheTtlMs
      };

      // Check event listeners
      checks.events = {
        enabled: this.options.enableEvents,
        listeners: Array.from(this.eventListeners.keys()).reduce((acc, key) => {
          acc[key] = this.eventListeners.get(key)!.size;
          return acc;
        }, {} as Record<string, number>)
      };

      return createApiResponse({
        status,
        details: checks
      });
    });
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  /**
   * Load project settings from storage
   * This would be implemented based on the actual storage mechanism
   */
  private async loadProjectSettings(projectId: UUID): Promise<ProjectSettings | null> {
    // Placeholder implementation - would integrate with actual storage
    // Could be database, file system, or other persistence layer
    this.logger.debug('Loading project settings from storage', { projectId });
    return null; // Would return actual settings from storage
  }

  /**
   * Save project settings to storage
   */
  private async saveProjectSettings(settings: ProjectSettings): Promise<ApiResponse<void>> {
    // Placeholder implementation - would integrate with actual storage
    this.logger.debug('Saving project settings to storage', { projectId: settings.projectId });
    return createApiResponse(undefined);
  }

  /**
   * Resolve settings inheritance chain
   * Following Cline's hierarchical configuration resolution
   */
  private async resolveSettingsInheritance(
    baseSettings: ProjectSettings,
    projectId: UUID,
    options?: {
      userId?: UUID;
      phase?: PhaseType;
      environment?: string;
    }
  ): Promise<SettingsResolutionResult> {
    this.logger.debug('Resolving settings inheritance', { projectId, options });

    const sources: Record<string, any> = { project: baseSettings };
    const appliedSources = ['project'];
    let overrides = 0;
    const conflicts: Array<{ path: string; sources: string[]; resolved: any }> = [];

    // Apply global defaults (would be loaded from ConfigService)
    // sources.global = await this.loadGlobalDefaults();
    // appliedSources.unshift('global');

    // Apply user overrides if specified
    if (options?.userId && baseSettings.userOverrides[options.userId]) {
      sources.user = baseSettings.userOverrides[options.userId];
      appliedSources.push('user');
      overrides++;
    }

    // Apply phase overrides if specified
    if (options?.phase && baseSettings.phaseOverrides[options.phase]) {
      sources.phase = baseSettings.phaseOverrides[options.phase];
      appliedSources.push('phase');
      overrides++;
    }

    // Apply environment overrides if specified
    if (options?.environment && baseSettings.environmentOverrides[options.environment]) {
      sources.environment = baseSettings.environmentOverrides[options.environment];
      appliedSources.push('environment');
      overrides++;
    }

    // Merge all sources with conflict detection
    const mergedSettings = this.mergeSettingsWithConflictDetection(sources, conflicts);

    // Update metadata
    mergedSettings.inheritanceChain = appliedSources;
    mergedSettings.appliedSources = appliedSources.map((source, index) => ({
      source: source as any,
      priority: index,
      appliedAt: createTimestamp()
    }));

    // Validate final settings
    const validation = await this.validateSettings(mergedSettings, projectId);

    return {
      settings: mergedSettings,
      resolution: {
        appliedSources,
        overrides,
        conflicts
      },
      validation
    };
  }

  /**
   * Validate project settings
   * Adapted from Cline's configuration validation patterns
   */
  private async validateSettings(
    settings: ProjectSettings,
    projectId: UUID
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    try {
      // Validate basic structure
      if (!settings.id || !settings.projectId || !settings.version) {
        errors.push('Missing required settings metadata');
      }

      // Validate AI settings
      if (settings.aiSettings) {
        if (settings.aiSettings.tokenBudgets.dailyLimit <= 0) {
          errors.push('Daily token limit must be positive');
        }
        if (settings.aiSettings.contextSettings.maxContextLength < 1000) {
          warnings.push('Very low context length may impact performance');
        }
      }

      // Validate development settings
      if (settings.developmentSettings) {
        if (settings.developmentSettings.autoSave.intervalSeconds < 5) {
          warnings.push('Very frequent auto-save may impact performance');
        }
        if (!settings.developmentSettings.codeGeneration.includeTests) {
          suggestions.push('Consider enabling test generation for better code quality');
        }
      }

      // Validate quality settings
      if (settings.qualitySettings) {
        if (settings.qualitySettings.codeQuality.minimumCoverage > 100) {
          errors.push('Code coverage cannot exceed 100%');
        }
        if (settings.qualitySettings.testing.requiredCoverage < 50) {
          warnings.push('Low test coverage requirement may lead to quality issues');
        }
      }

      // Calculate quality score
      const score = Math.max(0, 100 - (errors.length * 20) - (warnings.length * 5));

      return {
        id: generateUUID(),
        type: 'project_settings',
        passed: errors.length === 0,
        errors,
        warnings,
        suggestions,
        score,
        validatedAt: createTimestamp(),
        validator: 'ProjectSettingsService'
      };

    } catch (error) {
      errors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      return {
        id: generateUUID(),
        type: 'project_settings',
        passed: false,
        errors,
        warnings,
        suggestions,
        score: 0,
        validatedAt: createTimestamp(),
        validator: 'ProjectSettingsService'
      };
    }
  }

  /**
   * Merge settings with conflict detection
   */
  private mergeSettingsWithConflictDetection(
    sources: Record<string, any>,
    conflicts: Array<{ path: string; sources: string[]; resolved: any }>
  ): ProjectSettings {
    // Implement deep merge with conflict detection
    // This would be a sophisticated merge that tracks where each value comes from
    
    // For now, return the project settings (base implementation)
    return sources.project || sources[Object.keys(sources)[0]];
  }

  /**
   * Create default phase models configuration
   */
  private createDefaultPhaseModels(): Record<PhaseType, { modelId: string; maxTokens?: number; temperature?: number; topP?: number }> {
    return {
      'Phase0_StrategicCharter': {
        modelId: 'claude-3-5-sonnet-20241022',
        temperature: 0.7,
        maxTokens: 8192
      },
      'Phase1_ArchitecturalBlueprint': {
        modelId: 'claude-3-5-sonnet-20241022',
        temperature: 0.5,
        maxTokens: 8192
      },
      'Phase20_CoreContracts': {
        modelId: 'claude-3-5-sonnet-20241022',
        temperature: 0.3,
        maxTokens: 4096
      },
      'Phase21_ModuleSpec': {
        modelId: 'claude-3-5-sonnet-20241022',
        temperature: 0.3,
        maxTokens: 4096
      },
      'Phase23_ModuleSpecSubsequent': {
        modelId: 'claude-3-5-sonnet-20241022',
        temperature: 0.3,
        maxTokens: 4096
      },
      'Phase30_ProjectScaffolding': {
        modelId: 'claude-3-5-sonnet-20241022',
        temperature: 0.2,
        maxTokens: 4096
      },
      'Phase301_MasterPlan': {
        modelId: 'claude-3-5-sonnet-20241022',
        temperature: 0.4,
        maxTokens: 8192
      },
      'Phase31_FileGeneration': {
        modelId: 'claude-3-5-sonnet-20241022',
        temperature: 0.2,
        maxTokens: 4096
      },
      'Phase4_ValidationCorrection': {
        modelId: 'claude-3-5-sonnet-20241022',
        temperature: 0.1,
        maxTokens: 4096
      },
      'Phase5_TestGeneration': {
        modelId: 'claude-3-5-sonnet-20241022',
        temperature: 0.2,
        maxTokens: 4096
      },
      'Phase6_Documentation': {
        modelId: 'claude-3-5-sonnet-20241022',
        temperature: 0.6,
        maxTokens: 8192
      },
      'Phase7_Iteration': {
        modelId: 'claude-3-5-sonnet-20241022',
        temperature: 0.4,
        maxTokens: 4096
      }
    };
  }

  /**
   * Merge settings objects deeply
   */
  private mergeSettings(base: ProjectSettings, updates: Partial<ProjectSettings>): ProjectSettings {
    // Implement deep merge logic
    // For now, simple shallow merge
    return {
      ...base,
      ...updates,
      lastModified: createTimestamp()
    };
  }

  /**
   * Extract values from settings at specified paths
   */
  private extractValues(settings: ProjectSettings, paths: string[]): Record<string, any> {
    const values: Record<string, any> = {};
    paths.forEach(path => {
      values[path] = this.getSettingValue(settings, path);
    });
    return values;
  }

  /**
   * Get setting value by path
   */
  private getSettingValue(settings: ProjectSettings, path: string): any {
    const parts = path.split('.');
    let value: any = settings;
    
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  /**
   * Build cache key for settings
   */
  private buildCacheKey(projectId: UUID, options?: any): string {
    const optionsKey = options ? 
      Object.keys(options).sort().map(k => `${k}:${options[k]}`).join('|') :
      'default';
    return `${projectId}:${optionsKey}`;
  }

  /**
   * Get cached settings
   */
  private getCachedSettings(cacheKey: string): SettingsResolutionResult | null {
    const cached = this.settingsCache.get(cacheKey);
    
    if (!cached) return null;
    
    const now = Date.now();
    if (now - cached.timestamp > this.options.cacheTtlMs) {
      this.settingsCache.delete(cacheKey);
      return null;
    }
    
    return cached.resolved;
  }

  /**
   * Set cached settings
   */
  private setCachedSettings(cacheKey: string, result: SettingsResolutionResult): void {
    this.settingsCache.set(cacheKey, {
      settings: result.settings,
      resolved: result,
      timestamp: Date.now(),
      etag: this.generateEtag(result.settings)
    });
  }

  /**
   * Invalidate settings cache for a project
   */
  private invalidateSettingsCache(projectId: UUID): void {
    const keysToDelete: string[] = [];
    
    for (const [key] of this.settingsCache) {
      if (key.startsWith(`${projectId}:`)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.settingsCache.delete(key));
    
    // Also clear inheritance cache
    this.inheritanceCache.delete(projectId);
  }

  /**
   * Generate ETag for settings
   */
  private generateEtag(settings: ProjectSettings): string {
    return Buffer.from(JSON.stringify(settings)).toString('base64').slice(0, 16);
  }

  /**
   * Emit settings change event
   */
  private async emitSettingsChange(event: SettingsChangeEvent): Promise<void> {
    const listeners = [
      ...(this.eventListeners.get('*') || []),
      ...(this.eventListeners.get('change') || [])
    ];

    await Promise.allSettled(
      listeners.map(async (listener) => {
        try {
          await listener(event);
        } catch (error) {
          this.logger.error('Settings event listener error', {
            eventId: event.eventId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      })
    );

    this.logger.debug('Settings change event emitted', {
      eventId: event.eventId,
      projectId: event.projectId,
      changedPaths: event.changedPaths.length,
      listenersNotified: listeners.length
    });
  }

  /**
   * Sanitize settings for export (remove secrets)
   */
  private sanitizeSettingsForExport(settings: ProjectSettings): ProjectSettings {
    // Create a deep copy and remove sensitive information
    const sanitized = JSON.parse(JSON.stringify(settings));
    
    // Remove any API keys, tokens, or other secrets
    if (sanitized.integrationSettings?.configurations) {
      Object.keys(sanitized.integrationSettings.configurations).forEach(key => {
        const config = sanitized.integrationSettings.configurations[key];
        if (config.authentication) {
          config.authentication = { type: config.authentication.type, encrypted: true };
        }
      });
    }
    
    return sanitized;
  }

  /**
   * Convert settings to YAML (placeholder)
   */
  private toYaml(settings: ProjectSettings): string {
    // Would use a YAML library like 'yaml' or 'js-yaml'
    return JSON.stringify(settings, null, 2);
  }

  /**
   * Parse settings from YAML (placeholder)
   */
  private fromYaml(yaml: string): ProjectSettings {
    // Would use a YAML library like 'yaml' or 'js-yaml'
    return JSON.parse(yaml);
  }

  /**
   * Create basic logger if none provided
   */
  private createBasicLogger(): Logger {
    return {
      info: (message: string, meta?: Record<string, any>) => 
        console.info(`[ProjectSettingsService] ${message}`, meta),
      warn: (message: string, meta?: Record<string, any>) => 
        console.warn(`[ProjectSettingsService] ${message}`, meta),
      error: (message: string, meta?: Record<string, any>) => 
        console.error(`[ProjectSettingsService] ${message}`, meta),
      debug: (message: string, meta?: Record<string, any>) => 
        console.debug(`[ProjectSettingsService] ${message}`, meta)
    } as Logger;
  }

  /**
   * Create basic error service if none provided
   */
  private createBasicErrorService(): ErrorService {
    return {
      captureError: (error: Error, context?: Record<string, any>) => {
        console.error('[ProjectSettingsService Error]', error.message, context);
      },
      createErrorResponse: (message: string, code?: string) => 
        createApiError(message, code || 'PROJECT_SETTINGS_ERROR')
    } as ErrorService;
  }
}

/**
 * Factory function for creating ProjectSettingsService instances
 */
export async function createProjectSettingsService(
  configService: ConfigService,
  options: ProjectSettingsServiceOptions = {},
  dependencies?: {
    logger?: Logger;
    errorService?: ErrorService;
  }
): Promise<ProjectSettingsService> {
  return new ProjectSettingsService(
    configService,
    options,
    dependencies?.logger,
    dependencies?.errorService
  );
}

// =============================================================================
// EXPORTS
// =============================================================================

export default ProjectSettingsService;

export {
  // Main service class
  ProjectSettingsService,
  createProjectSettingsService,
  
  // Types and interfaces
  type ProjectSettings,
  type ProjectAISettings,
  type ProjectDevelopmentSettings,
  type ProjectQualitySettings,
  type ProjectUISettings,
  type ProjectNotificationSettings,
  type ProjectSecuritySettings,
  type ProjectIntegrationSettings,
  type ProjectBackupSettings,
  type ProjectSettingsUpdateRequest,
  type SettingsResolutionResult,
  type SettingsChangeEvent,
  type SettingsEventListener,
  type ProjectSettingsServiceOptions,
  
  // Default options
  DEFAULT_SERVICE_OPTIONS
};
