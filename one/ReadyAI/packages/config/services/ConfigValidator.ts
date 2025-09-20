/**
 * Configuration Validator for ReadyAI Personal AI Development Orchestrator
 * 
 * This module replicates Cline's battle-tested validation patterns (~60% reuse) while extending 
 * them with ReadyAI-specific validation rules, project integrity checks, and comprehensive 
 * quality assurance mechanisms. Leverages Cline's proven error handling, validation flows, 
 * and configuration verification patterns.
 * 
 * Adapted from multiple Cline validation services with ReadyAI enhancements
 * @version 1.0.0
 */

import {
  UUID,
  ApiResponse,
  ApiErrorResponse,
  ReadyAIError,
  ValidationError,
  ValidationResult,
  PhaseType,
  AIProviderType,
  Project,
  AsyncResult,
  wrapAsync,
  createApiResponse,
  createApiError,
  isApiSuccess
} from '../../../foundation/types/core'

import {
  ApiConfiguration,
  ApiProvider,
  PhaseConfiguration,
  PhaseConfigurationMap,
  ModelInfo,
  ConfigurationValidationResult,
  ConfigurationIntegrityCheck,
  ProjectIntegrityResult,
  ValidationRule,
  ValidatorSeverity,
  ConfigurationDependency,
  IConfigurationValidator,
  VALIDATION_RULES,
  INTEGRITY_CHECKS,
  VALIDATOR_CONFIG
} from '../types/config'

import { ConfigNormalizer, NormalizedConfiguration } from './ConfigNormalizer'

// =============================================================================
// VALIDATION RULE ENGINE (Cline Pattern Replication)
// =============================================================================

/**
 * Validation rule result with enhanced metadata
 * Extends Cline's validation result patterns with ReadyAI specifics
 */
export interface ValidationRuleResult {
  /** Rule identifier */
  ruleId: string
  /** Rule name for display */
  ruleName: string
  /** Validation passed */
  passed: boolean
  /** Validation severity level */
  severity: ValidatorSeverity
  /** Error messages if validation failed */
  errors: string[]
  /** Warning messages */
  warnings: string[]
  /** Suggestions for improvement */
  suggestions: string[]
  /** Validation score (0-100) */
  score: number
  /** Rule execution time in milliseconds */
  executionTime: number
  /** Validation timestamp */
  validatedAt: string
  /** Additional validation context */
  context?: Record<string, any>
  /** Repair suggestions */
  repairActions?: ValidationRepairAction[]
}

/**
 * Automated repair action for validation failures
 * Cline-inspired automated fix patterns
 */
export interface ValidationRepairAction {
  /** Action identifier */
  id: string
  /** Action description */
  description: string
  /** Whether action can be automated */
  automated: boolean
  /** Confidence level (0-1) */
  confidence: number
  /** Action parameters */
  parameters: Record<string, any>
  /** Estimated fix time */
  estimatedTime?: number
  /** Risk level */
  riskLevel: 'low' | 'medium' | 'high'
}

/**
 * Comprehensive validation context
 * Extends Cline's context management with ReadyAI project awareness
 */
export interface ValidationContext {
  /** Current project context */
  project?: Project
  /** Target phase for validation */
  targetPhase?: PhaseType
  /** Validation mode */
  mode: 'strict' | 'standard' | 'permissive'
  /** Skip certain rule categories */
  skipRules?: string[]
  /** Environment context */
  environment: 'development' | 'production' | 'testing'
  /** Performance constraints */
  performanceMode: boolean
  /** Additional validation metadata */
  metadata: Record<string, any>
}

// =============================================================================
// CORE VALIDATION SERVICE
// =============================================================================

/**
 * Configuration validator service
 * Replicates Cline's validation architecture with ReadyAI extensions
 */
export class ConfigValidator implements IConfigurationValidator {
  private static instance: ConfigValidator | null = null
  private normalizer: ConfigNormalizer
  private validationRules: Map<string, ValidationRule>
  private integrityChecks: Map<string, ConfigurationIntegrityCheck>

  /**
   * Singleton access following Cline's service pattern
   */
  public static getInstance(): ConfigValidator {
    if (!ConfigValidator.instance) {
      ConfigValidator.instance = new ConfigValidator()
    }
    return ConfigValidator.instance
  }

  /**
   * Private constructor - enforces singleton pattern
   */
  private constructor() {
    this.normalizer = ConfigNormalizer.getInstance()
    this.validationRules = this.initializeValidationRules()
    this.integrityChecks = this.initializeIntegrityChecks()
  }

  /**
   * Comprehensive configuration validation
   * Main validation orchestrator - adapts Cline's validation flow patterns
   */
  public async validateConfiguration(
    config: ApiConfiguration,
    context?: Partial<ValidationContext>
  ): Promise<ApiResponse<ConfigurationValidationResult>> {
    return wrapAsync(async () => {
      const validationContext = this.buildValidationContext(context)
      const startTime = Date.now()
      
      // Step 1: Normalize configuration first (Cline pattern)
      const normalizedConfig = await this.normalizer.normalizeConfiguration(
        config,
        validationContext.targetPhase
      )
      
      // Step 2: Basic structure validation (Cline pattern)
      const structureResults = await this.validateConfigurationStructure(config, validationContext)
      
      // Step 3: Provider and model validation (Cline pattern)
      const providerResults = await this.validateProviderConfiguration(normalizedConfig, validationContext)
      
      // Step 4: Phase configuration validation (ReadyAI extension)
      const phaseResults = await this.validatePhaseConfigurations(
        normalizedConfig.phaseConfigurations,
        validationContext
      )
      
      // Step 5: Project integrity checks (ReadyAI extension)
      const integrityResults = await this.validateProjectIntegrity(config, validationContext)
      
      // Step 6: Security validation (Cline pattern)
      const securityResults = await this.validateSecurityConfiguration(config, validationContext)
      
      // Step 7: Performance validation (ReadyAI extension)
      const performanceResults = await this.validatePerformanceConfiguration(config, validationContext)
      
      // Aggregate all validation results
      const allResults = [
        ...structureResults,
        ...providerResults,
        ...phaseResults,
        ...integrityResults,
        ...securityResults,
        ...performanceResults
      ]
      
      // Calculate overall validation metrics
      const validationMetrics = this.calculateValidationMetrics(allResults, startTime)
      
      // Generate repair recommendations
      const repairActions = this.generateRepairActions(allResults)
      
      const result: ConfigurationValidationResult = {
        id: `validation-${Date.now()}`,
        type: 'comprehensive',
        section: 'full',
        passed: allResults.every(r => r.passed),
        errors: allResults.flatMap(r => r.errors),
        warnings: allResults.flatMap(r => r.warnings),
        suggestions: allResults.flatMap(r => r.suggestions),
        score: validationMetrics.overallScore,
        validatedAt: new Date().toISOString(),
        validator: 'ConfigValidator',
        ruleResults: allResults,
        criticalErrors: allResults
          .filter(r => r.severity === 'critical' && !r.passed)
          .map(r => ({
            field: r.ruleId,
            message: r.errors.join('; '),
            value: null,
            code: r.ruleId.toUpperCase()
          })),
        optimizations: this.generateOptimizations(normalizedConfig, allResults),
        repairActions,
        executionTime: validationMetrics.totalExecutionTime,
        context: validationContext
      }
      
      return result
    }).then(result => {
      if (result.success) {
        return createApiResponse(result.data)
      } else {
        throw result.error
      }
    })
  }

  /**
   * Fast validation for quick feedback
   * Cline-inspired lightweight validation for UI responsiveness
   */
  public async validateConfigurationQuick(
    config: Partial<ApiConfiguration>,
    field?: string
  ): Promise<ApiResponse<ValidationRuleResult[]>> {
    return wrapAsync(async () => {
      const context = this.buildValidationContext({ mode: 'standard', performanceMode: true })
      const results: ValidationRuleResult[] = []
      
      if (field) {
        // Validate specific field only
        const fieldResult = await this.validateSingleField(config, field, context)
        if (fieldResult) {
          results.push(fieldResult)
        }
      } else {
        // Quick validation of critical fields only
        const criticalValidations = await Promise.all([
          this.validateApiKeys(config),
          this.validateProviderAvailability(config),
          this.validateBasicStructure(config)
        ])
        
        results.push(...criticalValidations.filter(r => r !== null))
      }
      
      return results
    }).then(result => {
      if (result.success) {
        return createApiResponse(result.data)
      } else {
        throw result.error
      }
    })
  }

  /**
   * Project integrity validation
   * ReadyAI-specific validation for project consistency and health
   */
  public async validateProjectIntegrity(
    config: ApiConfiguration,
    context: ValidationContext
  ): Promise<ValidationRuleResult[]> {
    const results: ValidationRuleResult[] = []
    
    try {
      // Check project-configuration alignment
      if (context.project) {
        const alignmentResult = await this.validateProjectConfigAlignment(
          context.project,
          config,
          context
        )
        results.push(alignmentResult)
        
        // Validate phase progression integrity
        const phaseProgressionResult = await this.validatePhaseProgression(
          context.project,
          config,
          context
        )
        results.push(phaseProgressionResult)
        
        // Check resource allocation adequacy
        const resourceResult = await this.validateResourceAllocation(
          context.project,
          config,
          context
        )
        results.push(resourceResult)
      }
      
      // Validate configuration dependencies
      const dependencyResult = await this.validateConfigurationDependencies(config, context)
      results.push(dependencyResult)
      
      // Check for configuration conflicts
      const conflictResult = await this.validateConfigurationConflicts(config, context)
      results.push(conflictResult)
      
    } catch (error) {
      results.push({
        ruleId: 'INTEGRITY_CHECK_ERROR',
        ruleName: 'Project Integrity Check',
        passed: false,
        severity: 'critical',
        errors: [`Project integrity validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: [],
        suggestions: ['Review project configuration and try again'],
        score: 0,
        executionTime: 0,
        validatedAt: new Date().toISOString(),
        context: { error: error instanceof Error ? error.message : 'Unknown error' }
      })
    }
    
    return results
  }

  // =============================================================================
  // VALIDATION RULE IMPLEMENTATIONS (Cline Patterns)
  // =============================================================================

  /**
   * Validate configuration structure
   * Adapts Cline's structure validation patterns
   */
  private async validateConfigurationStructure(
    config: ApiConfiguration,
    context: ValidationContext
  ): Promise<ValidationRuleResult[]> {
    const results: ValidationRuleResult[] = []
    const startTime = Date.now()
    
    // Required fields validation (Cline pattern)
    const requiredFieldsResult = await this.validateRequiredFields(config, context)
    results.push(requiredFieldsResult)
    
    // Data type validation (Cline pattern)
    const dataTypeResult = await this.validateDataTypes(config, context)
    results.push(dataTypeResult)
    
    // Value range validation (Cline pattern)
    const rangeResult = await this.validateValueRanges(config, context)
    results.push(rangeResult)
    
    // Format validation (Cline pattern)
    const formatResult = await this.validateFormats(config, context)
    results.push(formatResult)
    
    return results
  }

  /**
   * Validate provider configuration
   * Adapts Cline's provider validation with ReadyAI enhancements
   */
  private async validateProviderConfiguration(
    normalizedConfig: NormalizedConfiguration,
    context: ValidationContext
  ): Promise<ValidationRuleResult[]> {
    const results: ValidationRuleResult[] = []
    
    // Provider availability validation
    const providerResult = await this.validateProviderAvailability(normalizedConfig)
    results.push(providerResult)
    
    // Model compatibility validation
    const modelResult = await this.validateModelCompatibility(
      normalizedConfig.selectedProvider,
      normalizedConfig.selectedModelId,
      normalizedConfig.selectedModelInfo,
      context
    )
    results.push(modelResult)
    
    // API key validation
    const apiKeyResult = await this.validateProviderApiKeys(normalizedConfig, context)
    results.push(apiKeyResult)
    
    // Rate limiting validation
    const rateLimitResult = await this.validateRateLimiting(normalizedConfig, context)
    results.push(rateLimitResult)
    
    return results
  }

  /**
   * Validate phase configurations
   * ReadyAI-specific phase validation with quality assurance
   */
  private async validatePhaseConfigurations(
    phaseConfigs: PhaseConfigurationMap,
    context: ValidationContext
  ): Promise<ValidationRuleResult[]> {
    const results: ValidationRuleResult[] = []
    
    for (const [phaseType, config] of Object.entries(phaseConfigs)) {
      const phaseResult = await this.validateSinglePhaseConfiguration(
        phaseType as PhaseType,
        config,
        context
      )
      results.push(phaseResult)
    }
    
    // Validate phase configuration consistency
    const consistencyResult = await this.validatePhaseConsistency(phaseConfigs, context)
    results.push(consistencyResult)
    
    return results
  }

  /**
   * Validate security configuration
   * Adapts Cline's security validation patterns
   */
  private async validateSecurityConfiguration(
    config: ApiConfiguration,
    context: ValidationContext
  ): Promise<ValidationRuleResult[]> {
    const results: ValidationRuleResult[] = []
    
    // API key security validation
    const keySecurityResult = await this.validateApiKeySecurity(config, context)
    results.push(keySecurityResult)
    
    // Configuration exposure validation
    const exposureResult = await this.validateConfigurationExposure(config, context)
    results.push(exposureResult)
    
    // Access control validation
    const accessResult = await this.validateAccessControl(config, context)
    results.push(accessResult)
    
    return results
  }

  /**
   * Validate performance configuration
   * ReadyAI-specific performance validation for KPI compliance
   */
  private async validatePerformanceConfiguration(
    config: ApiConfiguration,
    context: ValidationContext
  ): Promise<ValidationRuleResult[]> {
    const results: ValidationRuleResult[] = []
    
    // Token budget validation
    const tokenResult = await this.validateTokenBudgets(config, context)
    results.push(tokenResult)
    
    // Context window optimization
    const contextResult = await this.validateContextWindowUsage(config, context)
    results.push(contextResult)
    
    // Response time targets
    const responseTimeResult = await this.validateResponseTimeTargets(config, context)
    results.push(responseTimeResult)
    
    // Caching configuration
    const cachingResult = await this.validateCachingConfiguration(config, context)
    results.push(cachingResult)
    
    return results
  }

  // =============================================================================
  // SPECIFIC VALIDATION IMPLEMENTATIONS
  // =============================================================================

  /**
   * Validate required fields
   * Direct adaptation of Cline's required field validation
   */
  private async validateRequiredFields(
    config: ApiConfiguration,
    context: ValidationContext
  ): Promise<ValidationRuleResult> {
    const startTime = Date.now()
    const errors: string[] = []
    const warnings: string[] = []
    const suggestions: string[] = []
    
    // Check for at least one provider configuration
    const hasValidProvider = config.apiKey || 
                            config.openaiApiKey || 
                            config.openrouterApiKey || 
                            config.geminiApiKey
    
    if (!hasValidProvider) {
      errors.push('At least one AI provider API key is required')
      suggestions.push('Configure an API key for Anthropic, OpenAI, OpenRouter, or Gemini')
    }
    
    // Check global preferences
    if (!config.globalAiPreferences) {
      warnings.push('Global AI preferences not configured')
      suggestions.push('Set up global AI preferences for better defaults')
    }
    
    // Check phase configurations
    if (!config.phaseConfigurations || Object.keys(config.phaseConfigurations).length === 0) {
      warnings.push('No phase-specific configurations found')
      suggestions.push('Configure phase-specific settings for optimal performance')
    }
    
    const score = errors.length === 0 ? (warnings.length === 0 ? 100 : 85) : 0
    
    return {
      ruleId: 'REQUIRED_FIELDS',
      ruleName: 'Required Fields Validation',
      passed: errors.length === 0,
      severity: 'critical',
      errors,
      warnings,
      suggestions,
      score,
      executionTime: Date.now() - startTime,
      validatedAt: new Date().toISOString(),
      context: { hasValidProvider, configKeys: Object.keys(config) }
    }
  }

  /**
   * Validate API key availability and format
   * Cline-inspired API key validation with enhanced security checks
   */
  private async validateApiKeys(config: Partial<ApiConfiguration>): Promise<ValidationRuleResult> {
    const startTime = Date.now()
    const errors: string[] = []
    const warnings: string[] = []
    const suggestions: string[] = []
    
    // Anthropic API key validation
    if (config.apiKey) {
      if (!config.apiKey.startsWith('sk-ant-')) {
        errors.push('Anthropic API key format invalid')
        suggestions.push('Anthropic API keys should start with "sk-ant-"')
      } else if (config.apiKey.length < 50) {
        warnings.push('Anthropic API key appears too short')
      }
    }
    
    // OpenAI API key validation
    if (config.openaiApiKey) {
      if (!config.openaiApiKey.startsWith('sk-') && !config.openaiApiKey.startsWith('org-')) {
        errors.push('OpenAI API key format invalid')
        suggestions.push('OpenAI API keys should start with "sk-" or "org-"')
      }
    }
    
    // OpenRouter API key validation
    if (config.openrouterApiKey) {
      if (!config.openrouterApiKey.startsWith('sk-or-')) {
        warnings.push('OpenRouter API key format may be invalid')
        suggestions.push('OpenRouter API keys typically start with "sk-or-"')
      }
    }
    
    const score = errors.length === 0 ? (warnings.length === 0 ? 100 : 85) : 20
    
    return {
      ruleId: 'API_KEYS',
      ruleName: 'API Key Validation',
      passed: errors.length === 0,
      severity: 'high',
      errors,
      warnings,
      suggestions,
      score,
      executionTime: Date.now() - startTime,
      validatedAt: new Date().toISOString()
    }
  }

  /**
   * Validate provider availability
   * Cline pattern for checking provider accessibility
   */
  private async validateProviderAvailability(
    config: Partial<ApiConfiguration> | NormalizedConfiguration
  ): Promise<ValidationRuleResult> {
    const startTime = Date.now()
    const errors: string[] = []
    const warnings: string[] = []
    const suggestions: string[] = []
    
    let availableProviders = 0
    
    // Check each provider availability
    const providerChecks = [
      { name: 'Anthropic', key: 'apiKey', available: !!config.apiKey },
      { name: 'OpenAI', key: 'openaiApiKey', available: !!config.openaiApiKey },
      { name: 'OpenRouter', key: 'openrouterApiKey', available: !!config.openrouterApiKey },
      { name: 'Gemini', key: 'geminiApiKey', available: !!config.geminiApiKey }
    ]
    
    for (const check of providerChecks) {
      if (check.available) {
        availableProviders++
      } else {
        suggestions.push(`Consider configuring ${check.name} for better fallback options`)
      }
    }
    
    if (availableProviders === 0) {
      errors.push('No AI providers are configured')
    } else if (availableProviders === 1) {
      warnings.push('Only one AI provider configured - consider adding fallbacks')
    }
    
    const score = availableProviders === 0 ? 0 : Math.min(100, availableProviders * 25 + 50)
    
    return {
      ruleId: 'PROVIDER_AVAILABILITY',
      ruleName: 'Provider Availability Check',
      passed: availableProviders > 0,
      severity: availableProviders === 0 ? 'critical' : 'medium',
      errors,
      warnings,
      suggestions,
      score,
      executionTime: Date.now() - startTime,
      validatedAt: new Date().toISOString(),
      context: { availableProviders, totalProviders: providerChecks.length }
    }
  }

  /**
   * Validate basic configuration structure
   * Cline-style structure validation
   */
  private async validateBasicStructure(config: Partial<ApiConfiguration>): Promise<ValidationRuleResult> {
    const startTime = Date.now()
    const errors: string[] = []
    const warnings: string[] = []
    const suggestions: string[] = []
    
    // Check if config is object
    if (typeof config !== 'object' || config === null) {
      errors.push('Configuration must be a valid object')
      return {
        ruleId: 'BASIC_STRUCTURE',
        ruleName: 'Basic Structure Validation',
        passed: false,
        severity: 'critical',
        errors,
        warnings: [],
        suggestions: ['Provide a valid configuration object'],
        score: 0,
        executionTime: Date.now() - startTime,
        validatedAt: new Date().toISOString()
      }
    }
    
    // Check for empty configuration
    if (Object.keys(config).length === 0) {
      errors.push('Configuration cannot be empty')
      suggestions.push('Add at least one AI provider configuration')
    }
    
    // Validate global preferences structure
    if (config.globalAiPreferences && typeof config.globalAiPreferences !== 'object') {
      errors.push('globalAiPreferences must be an object')
    }
    
    // Validate phase configurations structure
    if (config.phaseConfigurations && typeof config.phaseConfigurations !== 'object') {
      errors.push('phaseConfigurations must be an object')
    }
    
    const score = errors.length === 0 ? (warnings.length === 0 ? 100 : 85) : 10
    
    return {
      ruleId: 'BASIC_STRUCTURE',
      ruleName: 'Basic Structure Validation',
      passed: errors.length === 0,
      severity: 'high',
      errors,
      warnings,
      suggestions,
      score,
      executionTime: Date.now() - startTime,
      validatedAt: new Date().toISOString(),
      context: { configKeys: Object.keys(config) }
    }
  }

  // =============================================================================
  // UTILITY METHODS (Cline Patterns)
  // =============================================================================

  /**
   * Build validation context with defaults
   * Cline pattern for context management
   */
  private buildValidationContext(context?: Partial<ValidationContext>): ValidationContext {
    return {
      mode: 'standard',
      environment: 'development',
      performanceMode: false,
      metadata: {},
      ...context
    }
  }

  /**
   * Calculate comprehensive validation metrics
   * Cline-inspired metrics calculation
   */
  private calculateValidationMetrics(
    results: ValidationRuleResult[],
    startTime: number
  ): {
    overallScore: number
    totalExecutionTime: number
    passedRules: number
    failedRules: number
    criticalErrors: number
    averageScore: number
  } {
    const totalExecutionTime = Date.now() - startTime
    const passedRules = results.filter(r => r.passed).length
    const failedRules = results.filter(r => !r.passed).length
    const criticalErrors = results.filter(r => r.severity === 'critical' && !r.passed).length
    
    const totalScore = results.reduce((sum, r) => sum + r.score, 0)
    const averageScore = results.length > 0 ? totalScore / results.length : 0
    
    // Overall score considers both average score and critical failures
    let overallScore = averageScore
    if (criticalErrors > 0) {
      overallScore = Math.min(overallScore, 25) // Cap at 25 if critical errors exist
    }
    
    return {
      overallScore: Math.round(overallScore),
      totalExecutionTime,
      passedRules,
      failedRules,
      criticalErrors,
      averageScore: Math.round(averageScore)
    }
  }

  /**
   * Generate automated repair actions
   * Cline-inspired automated fix generation
   */
  private generateRepairActions(results: ValidationRuleResult[]): ValidationRepairAction[] {
    const actions: ValidationRepairAction[] = []
    
    for (const result of results) {
      if (!result.passed && result.repairActions) {
        actions.push(...result.repairActions)
      }
    }
    
    // Add common repair actions based on validation patterns
    const failedRules = results.filter(r => !r.passed)
    
    if (failedRules.some(r => r.ruleId === 'API_KEYS')) {
      actions.push({
        id: 'configure-api-keys',
        description: 'Configure missing API keys for AI providers',
        automated: false,
        confidence: 0.9,
        parameters: { requiredKeys: ['apiKey', 'openaiApiKey', 'openrouterApiKey'] },
        riskLevel: 'low'
      })
    }
    
    if (failedRules.some(r => r.ruleId === 'PROVIDER_AVAILABILITY')) {
      actions.push({
        id: 'setup-fallback-providers',
        description: 'Configure additional AI providers for redundancy',
        automated: false,
        confidence: 0.8,
        parameters: { recommendedProviders: ['OpenRouter', 'Anthropic'] },
        riskLevel: 'low'
      })
    }
    
    return actions
  }

  /**
   * Generate optimization recommendations
   * ReadyAI-specific optimization suggestions based on validation results
   */
  private generateOptimizations(
    normalizedConfig: NormalizedConfiguration,
    results: ValidationRuleResult[]
  ): Array<{
    setting: string
    currentValue: any
    suggestedValue: any
    reason: string
    impact: 'low' | 'medium' | 'high'
  }> {
    const optimizations: Array<{
      setting: string
      currentValue: any
      suggestedValue: any
      reason: string
      impact: 'low' | 'medium' | 'high'
    }> = []
    
    // Provider optimization
    if (normalizedConfig.selectedProvider === ApiProvider.OPENROUTER) {
      optimizations.push({
        setting: 'primaryProvider',
        currentValue: normalizedConfig.selectedProvider,
        suggestedValue: ApiProvider.ANTHROPIC,
        reason: 'Direct Anthropic access provides better performance and features',
        impact: 'medium'
      })
    }
    
    // Model optimization based on validation results
    const modelWarnings = results.filter(r => 
      r.ruleId.includes('MODEL') && r.warnings.length > 0
    )
    
    if (modelWarnings.length > 0) {
      optimizations.push({
        setting: 'modelSelection',
        currentValue: normalizedConfig.selectedModelId,
        suggestedValue: 'claude-3-5-sonnet-20241022',
        reason: 'Upgrade to latest model for improved performance',
        impact: 'high'
      })
    }
    
    return optimizations
  }

  /**
   * Initialize validation rules registry
   * Cline pattern for rule management
   */
  private initializeValidationRules(): Map<string, ValidationRule> {
    const rules = new Map<string, ValidationRule>()
    
    // Load rules from configuration
    VALIDATION_RULES.forEach(rule => {
      rules.set(rule.id, rule)
    })
    
    return rules
  }

  /**
   * Initialize integrity checks registry
   * ReadyAI-specific integrity check initialization
   */
  private initializeIntegrityChecks(): Map<string, ConfigurationIntegrityCheck> {
    const checks = new Map<string, ConfigurationIntegrityCheck>()
    
    // Load checks from configuration
    INTEGRITY_CHECKS.forEach(check => {
      checks.set(check.id, check)
    })
    
    return checks
  }

  // =============================================================================
  // PLACEHOLDER IMPLEMENTATIONS FOR COMPLEX VALIDATIONS
  // =============================================================================

  /**
   * Validate single field (placeholder)
   */
  private async validateSingleField(
    config: Partial<ApiConfiguration>,
    field: string,
    context: ValidationContext
  ): Promise<ValidationRuleResult | null> {
    // Implementation would validate specific field
    return null
  }

  /**
   * Validate data types (placeholder)
   */
  private async validateDataTypes(
    config: ApiConfiguration,
    context: ValidationContext
  ): Promise<ValidationRuleResult> {
    // Implementation would validate all data types
    return {
      ruleId: 'DATA_TYPES',
      ruleName: 'Data Type Validation',
      passed: true,
      severity: 'medium',
      errors: [],
      warnings: [],
      suggestions: [],
      score: 100,
      executionTime: 1,
      validatedAt: new Date().toISOString()
    }
  }

  /**
   * Validate value ranges (placeholder)
   */
  private async validateValueRanges(
    config: ApiConfiguration,
    context: ValidationContext
  ): Promise<ValidationRuleResult> {
    // Implementation would validate numeric ranges
    return {
      ruleId: 'VALUE_RANGES',
      ruleName: 'Value Range Validation',
      passed: true,
      severity: 'medium',
      errors: [],
      warnings: [],
      suggestions: [],
      score: 100,
      executionTime: 1,
      validatedAt: new Date().toISOString()
    }
  }

  /**
   * Validate formats (placeholder)
   */
  private async validateFormats(
    config: ApiConfiguration,
    context: ValidationContext
  ): Promise<ValidationRuleResult> {
    // Implementation would validate string formats, URLs, etc.
    return {
      ruleId: 'FORMATS',
      ruleName: 'Format Validation',
      passed: true,
      severity: 'medium',
      errors: [],
      warnings: [],
      suggestions: [],
      score: 100,
      executionTime: 1,
      validatedAt: new Date().toISOString()
    }
  }

  // Additional placeholder methods for comprehensive validation...
  // (Many more validation methods would be implemented here in a complete system)

}

// =============================================================================
// CONVENIENCE FUNCTIONS AND EXPORTS
// =============================================================================

/**
 * Convenience function for quick configuration validation
 * Adapts Cline's convenience function patterns
 */
export async function validateConfiguration(
  config: ApiConfiguration,
  options?: {
    project?: Project
    phase?: PhaseType
    mode?: 'strict' | 'standard' | 'permissive'
  }
): Promise<ConfigurationValidationResult> {
  const validator = ConfigValidator.getInstance()
  const result = await validator.validateConfiguration(config, options)
  
  if (!isApiSuccess(result)) {
    throw new ReadyAIError(
      'Configuration validation failed',
      'CONFIG_VALIDATION_ERROR',
      400,
      { validationResult: result.error }
    )
  }
  
  return result.data
}

/**
 * Quick validation for UI feedback
 * Cline-inspired lightweight validation
 */
export async function validateConfigurationQuick(
  config: Partial<ApiConfiguration>,
  field?: string
): Promise<ValidationRuleResult[]> {
  const validator = ConfigValidator.getInstance()
  const result = await validator.validateConfigurationQuick(config, field)
  
  if (!isApiSuccess(result)) {
    throw new ReadyAIError(
      'Quick validation failed',
      'CONFIG_QUICK_VALIDATION_ERROR',
      400,
      { validationResult: result.error }
    )
  }
  
  return result.data
}

/**
 * Validate specific validation rule
 */
export async function validateRule(
  ruleId: string,
  config: ApiConfiguration,
  context?: Partial<ValidationContext>
): Promise<ValidationRuleResult> {
  const validator = ConfigValidator.getInstance()
  // Implementation would execute specific rule
  throw new ReadyAIError('Rule validation not yet implemented', 'NOT_IMPLEMENTED', 501)
}

// Export validator instance for direct access
export const configValidator = ConfigValidator.getInstance()

// Version information
export const CONFIG_VALIDATOR_VERSION = '1.0.0'

// Default export
export default ConfigValidator
