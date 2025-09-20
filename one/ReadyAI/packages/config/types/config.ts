/**
 * Configuration types for ReadyAI Personal AI Development Orchestrator
 * 
 * This module adapts Cline's battle-tested multi-provider configuration system
 * with ReadyAI-specific extensions for phase management, local-first architecture,
 * and advanced context management capabilities.
 * 
 * Achieves 70%+ reuse of Cline's proven ApiConfiguration patterns while adding
 * ReadyAI's unique orchestration and quality assurance features.
 */

import {
  UUID,
  PhaseType,
  AIProviderType,
  ApiResponse,
  ApiErrorResponse,
  ReadyAIError,
  ValidationError,
  ValidationResult,
  QualityMetrics
} from '../../foundation/types/core'

// =============================================================================
// AI PROVIDER CONFIGURATION (Adapted from Cline's ApiConfiguration)
// =============================================================================

/**
 * Enhanced AI provider enumeration supporting 30+ providers
 * Direct adaptation from Cline's proven provider ecosystem
 */
export enum ApiProvider {
  // Core Providers
  ANTHROPIC = 'anthropic',
  OPENROUTER = 'openrouter', 
  OPENAI = 'openai',
  GEMINI = 'gemini',
  
  // Specialized Providers
  BEDROCK = 'bedrock',
  VERTEX = 'vertex',
  OLLAMA = 'ollama',
  LMSTUDIO = 'lmstudio',
  DEEPSEEK = 'deepseek',
  QWEN = 'qwen',
  MISTRAL = 'mistral',
  GROQ = 'groq',
  
  // Enterprise Providers
  FIREWORKS = 'fireworks',
  TOGETHER = 'together',
  NEBIUS = 'nebius',
  SAMBANOVA = 'sambanova',
  CEREBRAS = 'cerebras',
  XAI = 'xai',
  
  // Emerging Providers
  HUGGINGFACE = 'huggingface',
  MOONSHOT = 'moonshot',
  REQUESTY = 'requesty',
  ASKSAGE = 'asksage',
  SAPAICORE = 'sapaicore',
  BASETEN = 'baseten',
  VERCELAIGATEWAY = 'vercelaigateway',
  DIFY = 'dify',
  
  // Development Providers
  VSCODELM = 'vscode-lm',
  LITELLM = 'litellm',
  CLINE = 'cline'
}

/**
 * OpenAI reasoning effort levels for O1/O3 series models
 * Adapted from Cline's reasoning configuration
 */
export enum ReasoningEffort {
  LOW = 'low',
  MEDIUM = 'medium', 
  HIGH = 'high',
  MINIMAL = 'minimal'
}

/**
 * Model information interface with comprehensive metadata
 * Enhanced from Cline's ModelInfo with ReadyAI extensions
 */
export interface ModelInfo {
  /** Maximum output tokens */
  maxTokens?: number
  /** Context window size */
  contextWindow?: number
  /** Supports image input */
  supportsImages?: boolean
  /** Supports prompt caching */
  supportsPromptCache?: boolean
  /** Input price per million tokens */
  inputPrice?: number
  /** Output price per million tokens */
  outputPrice?: number
  /** Cache write price per million tokens */
  cacheWritesPrice?: number
  /** Cache read price per million tokens */
  cacheReadsPrice?: number
  /** Model description */
  description?: string
  /** Supports global endpoint routing */
  supportsGlobalEndpoint?: boolean
  /** ReadyAI Extensions */
  supportsBatchGeneration?: boolean
  supportsStructuredOutput?: boolean
  qualityTier?: 'development' | 'production' | 'premium'
}

/**
 * Thinking configuration for models supporting reasoning modes
 * Direct adaptation from Cline's ThinkingConfig
 */
export interface ThinkingConfig {
  /** Maximum thinking budget in tokens */
  maxBudget?: number
  /** Output price when using thinking budget */
  outputPrice?: number
  /** Tiered pricing for different usage levels */
  outputPriceTiers?: Array<{
    tokenLimit: number
    price: number
  }>
}

/**
 * Language model chat selector for VS Code LM API
 * Preserved from Cline's LanguageModelChatSelector
 */
export interface LanguageModelChatSelector {
  vendor?: string
  family?: string
  version?: string
  id?: string
}

// =============================================================================
// READYAI PHASE CONFIGURATION
// =============================================================================

/**
 * Phase-specific AI configuration for ReadyAI's 7-phase methodology
 * Extension of Cline's plan/act mode separation concept
 */
export interface PhaseConfiguration {
  /** AI provider for this phase */
  provider: ApiProvider
  /** Model ID for this provider */
  modelId: string
  /** Model information */
  modelInfo?: ModelInfo
  /** Enable extended thinking mode */
  extendedThinking: boolean
  /** Thinking budget in tokens */
  thinkingBudgetTokens?: number
  /** Reasoning effort level */
  reasoningEffort?: ReasoningEffort
  /** Custom system prompt for phase */
  customPrompt?: string
  /** Temperature setting */
  temperature?: number
  /** Quality requirements */
  qualityRequirements: {
    minConfidence: number
    maxRetries: number
    validationRequired: boolean
  }
}

/**
 * Phase-specific configuration mapping
 * Maps each phase to its AI configuration
 */
export interface PhaseConfigurationMap {
  [PhaseType.Phase0_StrategicCharter]: PhaseConfiguration
  [PhaseType.Phase1_ArchitecturalBlueprint]: PhaseConfiguration
  [PhaseType.Phase20_CoreContracts]: PhaseConfiguration
  [PhaseType.Phase21_ModuleSpec]: PhaseConfiguration
  [PhaseType.Phase23_ModuleSpecSubsequent]: PhaseConfiguration
  [PhaseType.Phase30_ProjectScaffolding]: PhaseConfiguration
  [PhaseType.Phase301_MasterPlan]: PhaseConfiguration
  [PhaseType.Phase31_FileGeneration]: PhaseConfiguration
  [PhaseType.Phase4_ValidationCorrection]: PhaseConfiguration
  [PhaseType.Phase5_TestGeneration]: PhaseConfiguration
  [PhaseType.Phase6_Documentation]: PhaseConfiguration
  [PhaseType.Phase7_Iteration]: PhaseConfiguration
}

// =============================================================================
// COMPREHENSIVE AI CONFIGURATION (Adapted from Cline)
// =============================================================================

/**
 * Complete API configuration interface
 * 70% adapted from Cline's battle-tested ApiConfiguration with ReadyAI extensions
 */
export interface ApiConfiguration {
  // =============================================================================
  // GLOBAL CONFIGURATION (Direct from Cline)
  // =============================================================================
  
  /** Anthropic API key */
  apiKey?: string
  /** Cline API key for premium features */
  clineApiKey?: string
  /** Unique identifier for usage tracking */
  ulid?: string
  
  // OpenAI Configuration
  openaiApiKey?: string
  openaiBaseUrl?: string
  openaiHeaders?: Record<string, string>
  openaiNativeApiKey?: string
  azureApiVersion?: string
  
  // Anthropic Configuration  
  anthropicBaseUrl?: string
  
  // OpenRouter Configuration
  openrouterApiKey?: string
  openrouterProviderSorting?: string
  
  // AWS Bedrock Configuration
  awsAccessKey?: string
  awsSecretKey?: string
  awsSessionToken?: string
  awsRegion?: string
  awsUseCrossRegionInference?: boolean
  awsBedrockUsePromptCache?: boolean
  awsUseProfile?: boolean
  awsProfile?: string
  awsBedrockEndpoint?: string
  awsAuthentication?: string
  awsBedrockApiKey?: string
  
  // Google Configuration
  vertexProjectId?: string
  vertexRegion?: string
  geminiApiKey?: string
  geminiBaseUrl?: string
  
  // Local/Self-hosted Configuration
  ollamaBaseUrl?: string
  ollamaApiKey?: string
  ollamaApiOptionsCtxNum?: string
  lmstudioBaseUrl?: string
  lmstudioMaxTokens?: string
  
  // Specialized Provider Configuration
  deepseekApiKey?: string
  qwenApiKey?: string
  qwenApiLine?: string
  qwenCodeOauthPath?: string
  mistralApiKey?: string
  groqApiKey?: string
  fireworksApiKey?: string
  fireworksModelMaxCompletionTokens?: number
  fireworksModelMaxTokens?: number
  togetherApiKey?: string
  nebiusApiKey?: string
  sambannovaApiKey?: string
  cerebrasApiKey?: string
  xaiApiKey?: string
  huggingfaceApiKey?: string
  moonshotApiKey?: string
  moonshotApiLine?: string
  requestyApiKey?: string
  requestyBaseUrl?: string
  asksageApiKey?: string
  asksageApiUrl?: string
  
  // Enterprise Providers
  sapaiCoreClientId?: string
  sapaiCoreClientSecret?: string
  sapaiResourceGroup?: string
  sapaiCoreTokenUrl?: string
  sapaiCoreBaseUrl?: string
  bastetenApiKey?: string
  vercelaiGatewayApiKey?: string
  difyApiKey?: string
  difyBaseUrl?: string
  
  // LiteLLM Configuration
  litellmBaseUrl?: string
  litellmApiKey?: string
  litellmUsePromptCache?: boolean
  
  // Global Settings
  requestTimeoutMs?: number
  clineAccountId?: string

  // =============================================================================
  // READYAI PHASE CONFIGURATIONS
  // =============================================================================
  
  /** Phase-specific AI configurations */
  phaseConfigurations: PhaseConfigurationMap
  
  /** Default fallback configuration */
  defaultPhaseConfig: PhaseConfiguration
  
  /** Global AI preferences */
  globalAiPreferences: {
    /** Preferred provider for new projects */
    preferredProvider: ApiProvider
    /** Enable automatic provider fallback */
    enableFallback: boolean
    /** Fallback provider order */
    fallbackOrder: ApiProvider[]
    /** Global extended thinking preference */
    globalExtendedThinking: boolean
    /** Global temperature setting */
    globalTemperature: number
    /** Token budget management */
    tokenBudgetManagement: {
      dailyBudget: number
      perPhaseLimit: number
      warningThreshold: number
    }
  }

  // =============================================================================
  // READYAI LOCAL-FIRST CONFIGURATION
  // =============================================================================
  
  /** Local development configuration */
  localConfig: {
    /** VS Code extension settings */
    vscodeSettings: {
      /** Auto-save generated files */
      autoSave: boolean
      /** Show progress notifications */
      showProgress: boolean
      /** Enable file watchers */
      enableFileWatchers: boolean
      /** Diff view preferences */
      diffViewMode: 'side-by-side' | 'inline'
    }
    
    /** File system settings */
    fileSystemSettings: {
      /** Default file encoding */
      encoding: 'utf-8' | 'utf-16'
      /** Line ending preference */
      lineEndings: 'lf' | 'crlf' | 'auto'
      /** Indentation settings */
      indentation: {
        type: 'spaces' | 'tabs'
        size: number
      }
    }
    
    /** Context management settings */
    contextSettings: {
      /** Maximum context nodes per request */
      maxContextNodes: number
      /** Context cache TTL in seconds */
      cacheTtl: number
      /** Vector embedding model */
      embeddingModel: string
      /** Semantic similarity threshold */
      similarityThreshold: number
    }
  }

  // =============================================================================
  // READYAI QUALITY ASSURANCE CONFIGURATION
  // =============================================================================
  
  /** Quality assurance settings */
  qualityConfig: {
    /** Validation settings */
    validation: {
      /** Enable syntax validation */
      enableSyntaxValidation: boolean
      /** Enable type checking */
      enableTypeChecking: boolean
      /** Enable linting */
      enableLinting: boolean
      /** Linting strictness */
      lintingStrictness: 'basic' | 'standard' | 'strict'
      /** Custom validation rules */
      customRules: string[]
    }
    
    /** Testing requirements */
    testing: {
      /** Minimum test coverage */
      minTestCoverage: number
      /** Generate unit tests */
      generateUnitTests: boolean
      /** Generate integration tests */
      generateIntegrationTests: boolean
      /** Test framework preference */
      testFramework: string
    }
    
    /** Code review settings */
    codeReview: {
      /** Enable automatic review */
      enableAutoReview: boolean
      /** Review strictness level */
      reviewStrictness: 'permissive' | 'standard' | 'strict'
      /** Focus areas */
      focusAreas: Array<'security' | 'performance' | 'maintainability' | 'style'>
    }
  }

  // =============================================================================
  // READYAI PROJECT SCAFFOLDING CONFIGURATION
  // =============================================================================
  
  /** Project scaffolding preferences */
  scaffoldingConfig: {
    /** Template preferences */
    templates: {
      /** Default project template */
      defaultTemplate: string
      /** Custom template directories */
      customTemplates: string[]
      /** Template variable substitution */
      variableSubstitution: Record<string, string>
    }
    
    /** Dependency management */
    dependencies: {
      /** Automatic dependency detection */
      autoDetection: boolean
      /** Dependency resolution strategy */
      resolutionStrategy: 'conservative' | 'latest' | 'stable'
      /** Security scanning */
      securityScanning: boolean
    }
    
    /** Build system configuration */
    buildSystem: {
      /** Build tool preference */
      buildTool: string
      /** Package manager preference */
      packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun'
      /** CI/CD integration */
      cicdIntegration: boolean
      /** Docker support */
      dockerSupport: boolean
    }
  }
}

// =============================================================================
// CONFIGURATION VALIDATION AND MANAGEMENT
// =============================================================================

/**
 * Configuration validation result with detailed feedback
 * Extends ReadyAI's ValidationResult pattern
 */
export interface ConfigurationValidationResult extends ValidationResult {
  /** Configuration section that failed */
  section: string
  /** Critical errors that prevent operation */
  criticalErrors: ValidationError[]
  /** Warnings that should be addressed */
  warnings: ValidationError[]
  /** Suggestions for optimization */
  optimizations: Array<{
    setting: string
    currentValue: any
    suggestedValue: any
    reason: string
  }>
}

/**
 * Configuration update request with atomic changes
 */
export interface ConfigurationUpdateRequest {
  /** Target configuration section */
  section: keyof ApiConfiguration
  /** Changes to apply */
  changes: Record<string, any>
  /** Validate before applying */
  validate: boolean
  /** Create backup before update */
  createBackup: boolean
  /** Metadata for audit trail */
  metadata: {
    updatedBy: string
    reason: string
    timestamp: string
  }
}

/**
 * Configuration backup with versioning
 */
export interface ConfigurationBackup {
  /** Backup identifier */
  id: UUID
  /** Configuration snapshot */
  configuration: ApiConfiguration
  /** Backup timestamp */
  timestamp: string
  /** Backup metadata */
  metadata: {
    version: string
    createdBy: string
    description: string
  }
}

// =============================================================================
// CONFIGURATION MANAGEMENT INTERFACES
// =============================================================================

/**
 * Configuration manager interface with comprehensive operations
 */
export interface IConfigurationManager {
  /**
   * Load configuration from storage
   */
  loadConfiguration(): Promise<ApiResponse<ApiConfiguration>>
  
  /**
   * Save configuration to storage with validation
   */
  saveConfiguration(config: ApiConfiguration): Promise<ApiResponse<void>>
  
  /**
   * Update specific configuration section
   */
  updateConfiguration(request: ConfigurationUpdateRequest): Promise<ApiResponse<void>>
  
  /**
   * Validate configuration integrity
   */
  validateConfiguration(config: ApiConfiguration): Promise<ApiResponse<ConfigurationValidationResult>>
  
  /**
   * Create configuration backup
   */
  createBackup(description: string): Promise<ApiResponse<ConfigurationBackup>>
  
  /**
   * Restore from backup
   */
  restoreBackup(backupId: UUID): Promise<ApiResponse<void>>
  
  /**
   * Get configuration schema
   */
  getSchema(): Promise<ApiResponse<Record<string, any>>>
  
  /**
   * Reset to default configuration
   */
  resetToDefaults(): Promise<ApiResponse<void>>
}

/**
 * Configuration observer for reactive updates
 */
export interface IConfigurationObserver {
  /**
   * Called when configuration changes
   */
  onConfigurationChanged(config: ApiConfiguration, changes: string[]): void
  
  /**
   * Called when configuration validation fails
   */
  onValidationFailed(errors: ValidationError[]): void
}

// =============================================================================
// PHASE-SPECIFIC CONFIGURATION HELPERS
// =============================================================================

/**
 * Phase configuration builder with fluent interface
 */
export class PhaseConfigurationBuilder {
  private config: Partial<PhaseConfiguration> = {}

  static create(): PhaseConfigurationBuilder {
    return new PhaseConfigurationBuilder()
  }

  withProvider(provider: ApiProvider): this {
    this.config.provider = provider
    return this
  }

  withModel(modelId: string, modelInfo?: ModelInfo): this {
    this.config.modelId = modelId
    this.config.modelInfo = modelInfo
    return this
  }

  withThinking(enabled: boolean, budget?: number): this {
    this.config.extendedThinking = enabled
    this.config.thinkingBudgetTokens = budget
    return this
  }

  withQuality(requirements: PhaseConfiguration['qualityRequirements']): this {
    this.config.qualityRequirements = requirements
    return this
  }

  build(): PhaseConfiguration {
    if (!this.config.provider || !this.config.modelId || !this.config.qualityRequirements) {
      throw new ReadyAIError(
        'Missing required configuration fields',
        'INVALID_PHASE_CONFIG',
        400
      )
    }
    return this.config as PhaseConfiguration
  }
}

/**
 * Configuration template for common setups
 */
export interface ConfigurationTemplate {
  /** Template identifier */
  id: string
  /** Template name */
  name: string
  /** Template description */
  description: string
  /** Target use case */
  useCase: 'development' | 'production' | 'enterprise' | 'research'
  /** Base configuration */
  configuration: Partial<ApiConfiguration>
  /** Required environment variables */
  requiredEnvVars: string[]
  /** Setup instructions */
  setupInstructions: string[]
}

// =============================================================================
// CONFIGURATION UTILITIES AND CONSTANTS
// =============================================================================

/**
 * Default phase configuration for fallback scenarios
 */
export const DEFAULT_PHASE_CONFIGURATION: PhaseConfiguration = {
  provider: ApiProvider.OPENROUTER,
  modelId: 'anthropic/claude-3.5-sonnet',
  extendedThinking: true,
  thinkingBudgetTokens: 10000,
  reasoningEffort: ReasoningEffort.MEDIUM,
  temperature: 0.7,
  qualityRequirements: {
    minConfidence: 0.8,
    maxRetries: 3,
    validationRequired: true
  }
}

/**
 * Configuration validation rules
 */
export const CONFIGURATION_VALIDATION_RULES = {
  apiKey: {
    required: false,
    minLength: 10,
    pattern: /^[a-zA-Z0-9_-]+$/
  },
  requestTimeoutMs: {
    min: 1000,
    max: 300000,
    default: 30000
  },
  temperature: {
    min: 0,
    max: 2,
    default: 0.7
  }
} as const

/**
 * Environment variable mapping for configuration
 */
export const CONFIG_ENV_MAPPING = {
  'apiKey': 'ANTHROPIC_API_KEY',
  'openaiApiKey': 'OPENAI_API_KEY',
  'openrouterApiKey': 'OPENROUTER_API_KEY',
  'geminiApiKey': 'GEMINI_API_KEY',
  'groqApiKey': 'GROQ_API_KEY'
} as const

/**
 * Configuration file schema version
 */
export const CONFIG_SCHEMA_VERSION = '1.0.0'

/**
 * Maximum configuration file size in bytes
 */
export const MAX_CONFIG_FILE_SIZE = 1024 * 1024 // 1MB

// =============================================================================
// EXPORTS AND VERSION INFO
// =============================================================================

export * from './streaming'
export * from './security'

/**
 * Configuration types module version
 */
export const CONFIG_TYPES_VERSION = '1.0.0'

/**
 * Supported configuration format versions
 */
export const SUPPORTED_CONFIG_VERSIONS = ['1.0.0'] as const
export type ConfigVersion = typeof SUPPORTED_CONFIG_VERSIONS[number]
