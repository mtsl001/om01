/* packages/ui/components/ConfigManager.tsx */

/**
 * ConfigManager Component for ReadyAI Personal AI Development Orchestrator
 * 
 * This component maximizes reuse of Cline's configuration UI patterns, adapting their 
 * proven interface architecture for ReadyAI's phase-aware configuration management.
 * Achieves 75% reuse of Cline's configuration components while adding ReadyAI-specific
 * phase management capabilities and enhanced provider selection interfaces.
 * 
 * Adapted from Cline's webview-ui settings components with ReadyAI extensions
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useConfig, usePhaseConfig, useModelManagement } from '../hooks/useConfig'
import type { 
    ApiProvider, 
    PhaseType, 
    ModelInfo, 
    ConfigurationTemplate,
    ConfigurationValidationResult,
    ApiConfiguration,
    PhaseConfiguration
} from '../types/config'
import type { UUID } from '../../../../foundation/types/core'

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Configuration section identifiers
 * Adapted from Cline's settings section organization
 */
export type ConfigSection = 
    | 'general'
    | 'phases' 
    | 'providers'
    | 'models'
    | 'templates'
    | 'validation'
    | 'advanced'

/**
 * Provider selection mode for configuration
 */
export type ProviderSelectionMode = 'single' | 'phase-specific' | 'fallback-chain'

/**
 * Configuration manager props interface
 * Enhanced from Cline's configuration component patterns
 */
export interface ConfigManagerProps {
    /** Initial section to display */
    initialSection?: ConfigSection
    /** Whether to show advanced configuration options */
    showAdvanced?: boolean
    /** Callback when configuration changes */
    onConfigChange?: (config: ApiConfiguration) => void
    /** Callback when validation completes */
    onValidationComplete?: (results: ConfigurationValidationResult) => void
    /** Whether to enable real-time validation */
    enableLiveValidation?: boolean
    /** Custom CSS classes */
    className?: string
    /** Whether to show phase-specific configuration */
    showPhaseConfig?: boolean
}

/**
 * Validation indicator props
 */
interface ValidationIndicatorProps {
    isValid: boolean
    errors: string[]
    warnings: string[]
    isValidating: boolean
}

/**
 * Provider card props for provider selection
 */
interface ProviderCardProps {
    provider: ApiProvider
    isSelected: boolean
    isRecommended?: boolean
    onSelect: (provider: ApiProvider) => void
    modelCount?: number
    status?: 'available' | 'configured' | 'error'
}

/**
 * Phase configuration section props
 */
interface PhaseConfigSectionProps {
    phase: PhaseType
    config: PhaseConfiguration | null
    onUpdate: (config: Partial<PhaseConfiguration>) => void
    availableModels: Record<ApiProvider, Record<string, ModelInfo>>
    isActive: boolean
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get user-friendly provider names
 * Adapted from Cline's provider display logic
 */
const getProviderDisplayName = (provider: ApiProvider): string => {
    const names: Record<ApiProvider, string> = {
        [ApiProvider.ANTHROPIC]: 'Anthropic Claude',
        [ApiProvider.OPENROUTER]: 'OpenRouter',
        [ApiProvider.OPENAI]: 'OpenAI',
        [ApiProvider.GEMINI]: 'Google Gemini',
        [ApiProvider.BEDROCK]: 'AWS Bedrock',
        [ApiProvider.VERTEX]: 'Google Vertex AI',
        [ApiProvider.OLLAMA]: 'Ollama (Local)',
        [ApiProvider.LMSTUDIO]: 'LM Studio (Local)',
        [ApiProvider.DEEPSEEK]: 'DeepSeek',
        [ApiProvider.QWEN]: 'Qwen',
        [ApiProvider.MISTRAL]: 'Mistral',
        [ApiProvider.GROQ]: 'Groq',
        [ApiProvider.FIREWORKS]: 'Fireworks AI',
        [ApiProvider.TOGETHER]: 'Together AI',
        [ApiProvider.NEBIUS]: 'Nebius AI',
        [ApiProvider.SAMBANOVA]: 'SambaNova',
        [ApiProvider.CEREBRAS]: 'Cerebras',
        [ApiProvider.XAI]: 'xAI',
        [ApiProvider.HUGGINGFACE]: 'Hugging Face',
        [ApiProvider.MOONSHOT]: 'Moonshot AI',
        [ApiProvider.REQUESTY]: 'Requesty',
        [ApiProvider.ASKSAGE]: 'AskSage',
        [ApiProvider.SAPAICORE]: 'SAP AI Core',
        [ApiProvider.BASETEN]: 'Baseten',
        [ApiProvider.VERCELAIGATEWAY]: 'Vercel AI Gateway',
        [ApiProvider.DIFY]: 'Dify',
        [ApiProvider.VSCODELM]: 'VS Code LM',
        [ApiProvider.LITELLM]: 'LiteLLM',
        [ApiProvider.CLINE]: 'Cline Premium'
    }
    return names[provider] || provider.charAt(0).toUpperCase() + provider.slice(1)
}

/**
 * Get phase display names for UI
 * ReadyAI-specific phase naming
 */
const getPhaseDisplayName = (phase: PhaseType): string => {
    const names: Record<PhaseType, string> = {
        [PhaseType.Phase0_StrategicCharter]: 'Strategic Charter',
        [PhaseType.Phase1_ArchitecturalBlueprint]: 'Architectural Blueprint', 
        [PhaseType.Phase20_CoreContracts]: 'Core Contracts',
        [PhaseType.Phase21_ModuleSpec]: 'Module Specification',
        [PhaseType.Phase23_ModuleSpecSubsequent]: 'Subsequent Module Specs',
        [PhaseType.Phase30_ProjectScaffolding]: 'Project Scaffolding',
        [PhaseType.Phase301_MasterPlan]: 'Master Implementation Plan',
        [PhaseType.Phase31_FileGeneration]: 'File Generation',
        [PhaseType.Phase4_ValidationCorrection]: 'Validation & Correction',
        [PhaseType.Phase5_TestGeneration]: 'Test Generation',
        [PhaseType.Phase6_Documentation]: 'Documentation',
        [PhaseType.Phase7_Iteration]: 'Iteration & Enhancement'
    }
    return names[phase] || phase.replace(/_/g, ' ')
}

/**
 * Get recommended providers for each phase
 * ReadyAI-specific provider recommendations
 */
const getRecommendedProvidersForPhase = (phase: PhaseType): ApiProvider[] => {
    const recommendations: Record<PhaseType, ApiProvider[]> = {
        [PhaseType.Phase0_StrategicCharter]: [ApiProvider.ANTHROPIC, ApiProvider.OPENROUTER],
        [PhaseType.Phase1_ArchitecturalBlueprint]: [ApiProvider.ANTHROPIC, ApiProvider.OPENROUTER],
        [PhaseType.Phase20_CoreContracts]: [ApiProvider.ANTHROPIC, ApiProvider.OPENAI],
        [PhaseType.Phase21_ModuleSpec]: [ApiProvider.ANTHROPIC, ApiProvider.OPENROUTER],
        [PhaseType.Phase23_ModuleSpecSubsequent]: [ApiProvider.OPENROUTER, ApiProvider.ANTHROPIC],
        [PhaseType.Phase30_ProjectScaffolding]: [ApiProvider.OPENROUTER, ApiProvider.ANTHROPIC],
        [PhaseType.Phase301_MasterPlan]: [ApiProvider.ANTHROPIC, ApiProvider.OPENROUTER],
        [PhaseType.Phase31_FileGeneration]: [ApiProvider.OPENROUTER, ApiProvider.ANTHROPIC],
        [PhaseType.Phase4_ValidationCorrection]: [ApiProvider.ANTHROPIC, ApiProvider.OPENAI],
        [PhaseType.Phase5_TestGeneration]: [ApiProvider.OPENROUTER, ApiProvider.ANTHROPIC],
        [PhaseType.Phase6_Documentation]: [ApiProvider.ANTHROPIC, ApiProvider.OPENROUTER],
        [PhaseType.Phase7_Iteration]: [ApiProvider.OPENROUTER, ApiProvider.ANTHROPIC]
    }
    return recommendations[phase] || [ApiProvider.ANTHROPIC, ApiProvider.OPENROUTER]
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/**
 * Validation indicator component
 * Adapted from Cline's validation UI patterns
 */
const ValidationIndicator: React.FC<ValidationIndicatorProps> = ({ 
    isValid, 
    errors, 
    warnings, 
    isValidating 
}) => {
    if (isValidating) {
        return (
            <div className="flex items-center space-x-2 text-blue-600 text-sm">
                <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full" />
                <span>Validating...</span>
            </div>
        )
    }

    const hasErrors = errors.length > 0
    const hasWarnings = warnings.length > 0

    if (!hasErrors && !hasWarnings) {
        return (
            <div className="flex items-center space-x-2 text-green-600 text-sm">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Configuration Valid</span>
            </div>
        )
    }

    return (
        <div className="space-y-1">
            {hasErrors && (
                <div className="flex items-center space-x-2 text-red-600 text-sm">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span>{errors.length} Error{errors.length !== 1 ? 's' : ''}</span>
                </div>
            )}
            {hasWarnings && (
                <div className="flex items-center space-x-2 text-yellow-600 text-sm">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span>{warnings.length} Warning{warnings.length !== 1 ? 's' : ''}</span>
                </div>
            )}
        </div>
    )
}

/**
 * Provider card component for provider selection
 * Enhanced from Cline's provider selection UI
 */
const ProviderCard: React.FC<ProviderCardProps> = ({
    provider,
    isSelected,
    isRecommended = false,
    onSelect,
    modelCount = 0,
    status = 'available'
}) => {
    const handleClick = useCallback(() => {
        onSelect(provider)
    }, [provider, onSelect])

    const statusColors = {
        available: 'border-gray-300 hover:border-blue-500',
        configured: 'border-green-500 bg-green-50',
        error: 'border-red-500 bg-red-50'
    }

    const statusIcons = {
        available: null,
        configured: (
            <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
        ),
        error: (
            <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
        )
    }

    return (
        <div
            onClick={handleClick}
            className={`
                relative p-4 border-2 rounded-lg cursor-pointer transition-all duration-200
                ${isSelected ? 'border-blue-500 bg-blue-50' : statusColors[status]}
                ${isRecommended ? 'ring-2 ring-yellow-400 ring-opacity-50' : ''}
            `}
        >
            {isRecommended && (
                <div className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-xs px-2 py-1 rounded-full font-medium">
                    Recommended
                </div>
            )}
            
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <div className="flex items-center space-x-2">
                        <h3 className="font-medium text-gray-900">
                            {getProviderDisplayName(provider)}
                        </h3>
                        {statusIcons[status]}
                    </div>
                    
                    <div className="mt-1 text-sm text-gray-500">
                        {modelCount > 0 ? `${modelCount} models available` : 'No models loaded'}
                    </div>
                </div>
                
                <div className={`
                    w-4 h-4 rounded-full border-2 flex items-center justify-center
                    ${isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}
                `}>
                    {isSelected && (
                        <div className="w-2 h-2 rounded-full bg-white" />
                    )}
                </div>
            </div>
        </div>
    )
}

/**
 * Phase configuration section component
 * ReadyAI-specific phase configuration management
 */
const PhaseConfigSection: React.FC<PhaseConfigSectionProps> = ({
    phase,
    config,
    onUpdate,
    availableModels,
    isActive
}) => {
    const [isExpanded, setIsExpanded] = useState(isActive)
    const recommendedProviders = getRecommendedProvidersForPhase(phase)

    const handleProviderChange = useCallback((provider: ApiProvider) => {
        onUpdate({ provider })
    }, [onUpdate])

    const handleModelChange = useCallback((modelId: string) => {
        const provider = config?.provider
        if (provider && availableModels[provider]?.[modelId]) {
            onUpdate({ 
                modelId,
                modelInfo: availableModels[provider][modelId]
            })
        }
    }, [config?.provider, availableModels, onUpdate])

    const toggleExpanded = useCallback(() => {
        setIsExpanded(!isExpanded)
    }, [isExpanded])

    const availableModelsForProvider = config?.provider ? availableModels[config.provider] || {} : {}
    const modelOptions = Object.entries(availableModelsForProvider)

    return (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
                onClick={toggleExpanded}
                className={`
                    w-full px-4 py-3 flex items-center justify-between text-left
                    ${isActive ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 hover:bg-gray-100'}
                `}
            >
                <div className="flex items-center space-x-3">
                    <div className={`
                        w-2 h-2 rounded-full
                        ${config?.provider ? 'bg-green-500' : 'bg-gray-300'}
                    `} />
                    <h3 className="font-medium text-gray-900">
                        {getPhaseDisplayName(phase)}
                    </h3>
                    {config?.provider && (
                        <span className="text-sm text-gray-500">
                            {getProviderDisplayName(config.provider)} - {config.modelId || 'No model selected'}
                        </span>
                    )}
                </div>
                
                <svg 
                    className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            
            {isExpanded && (
                <div className="p-4 border-t border-gray-200 space-y-4">
                    {/* Provider Selection */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            AI Provider
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {recommendedProviders.map((provider) => (
                                <ProviderCard
                                    key={provider}
                                    provider={provider}
                                    isSelected={config?.provider === provider}
                                    isRecommended={recommendedProviders.indexOf(provider) < 2}
                                    onSelect={handleProviderChange}
                                    modelCount={Object.keys(availableModels[provider] || {}).length}
                                    status={availableModels[provider] ? 'configured' : 'available'}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Model Selection */}
                    {config?.provider && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Model
                            </label>
                            <select
                                value={config.modelId || ''}
                                onChange={(e) => handleModelChange(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">Select a model...</option>
                                {modelOptions.map(([modelId, modelInfo]) => (
                                    <option key={modelId} value={modelId}>
                                        {modelId} {modelInfo.description ? `- ${modelInfo.description}` : ''}
                                    </option>
                                ))}
                            </select>
                            
                            {config.modelInfo && (
                                <div className="mt-2 text-xs text-gray-500 space-y-1">
                                    {config.modelInfo.contextWindow && (
                                        <div>Context Window: {config.modelInfo.contextWindow.toLocaleString()} tokens</div>
                                    )}
                                    {config.modelInfo.maxTokens && (
                                        <div>Max Output: {config.modelInfo.maxTokens.toLocaleString()} tokens</div>
                                    )}
                                    {config.modelInfo.inputPrice && (
                                        <div>Input: ${config.modelInfo.inputPrice}/1M tokens</div>
                                    )}
                                    {config.modelInfo.outputPrice && (
                                        <div>Output: ${config.modelInfo.outputPrice}/1M tokens</div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Advanced Configuration */}
                    {config?.provider && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Temperature
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    max="2"
                                    step="0.1"
                                    value={config.temperature || 0.7}
                                    onChange={(e) => onUpdate({ temperature: parseFloat(e.target.value) })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            
                            <div>
                                <label className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        checked={config.extendedThinking || false}
                                        onChange={(e) => onUpdate({ extendedThinking: e.target.checked })}
                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-sm font-medium text-gray-700">Extended Thinking</span>
                                </label>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * ConfigManager - Main configuration management component
 * 
 * Comprehensive configuration interface that adapts Cline's proven UI patterns
 * for ReadyAI's phase-aware development methodology
 */
export const ConfigManager: React.FC<ConfigManagerProps> = ({
    initialSection = 'general',
    showAdvanced = false,
    onConfigChange,
    onValidationComplete,
    enableLiveValidation = true,
    className = '',
    showPhaseConfig = true
}) => {
    // =============================================================================
    // HOOKS AND STATE
    // =============================================================================

    const config = useConfig()
    const modelManagement = useModelManagement()
    const [activeSection, setActiveSection] = useState<ConfigSection>(initialSection)
    const [showAdvancedOptions, setShowAdvancedOptions] = useState(showAdvanced)
    const [searchQuery, setSearchQuery] = useState('')
    const [isDirty, setIsDirty] = useState(false)
    const debounceTimeoutRef = useRef<NodeJS.Timeout>()

    // Phase-specific configs
    const phaseConfigs = useMemo(() => {
        return Object.values(PhaseType).map(phase => ({
            phase,
            config: config.state.phaseConfigurations[phase] || null,
            isActive: config.state.currentPhase === phase
        }))
    }, [config.state.phaseConfigurations, config.state.currentPhase])

    // =============================================================================
    // VALIDATION LOGIC
    // =============================================================================

    const validationResults = config.validationState.validationResults
    const isValidating = config.validationState.isValidating
    const validationErrors = config.validationState.errors || []

    // Live validation effect
    useEffect(() => {
        if (enableLiveValidation && isDirty) {
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current)
            }

            debounceTimeoutRef.current = setTimeout(async () => {
                const result = await config.validateConfiguration()
                if (result.success && onValidationComplete) {
                    onValidationComplete(result.data)
                }
            }, 1000)
        }

        return () => {
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current)
            }
        }
    }, [config.state, enableLiveValidation, isDirty, config, onValidationComplete])

    // =============================================================================
    // EVENT HANDLERS
    // =============================================================================

    const handleConfigurationUpdate = useCallback(async (updates: Partial<ApiConfiguration>) => {
        try {
            await config.updateApiConfiguration(updates, { 
                showNotifications: true,
                autoValidate: enableLiveValidation 
            })
            setIsDirty(true)
            if (onConfigChange) {
                onConfigChange({ ...config.state.apiConfiguration, ...updates })
            }
        } catch (error) {
            console.error('Failed to update configuration:', error)
        }
    }, [config, enableLiveValidation, onConfigChange])

    const handlePhaseConfigUpdate = useCallback((phase: PhaseType, updates: Partial<PhaseConfiguration>) => {
        config.updatePhaseConfiguration(phase, updates, { 
            showNotifications: true,
            autoValidate: enableLiveValidation 
        })
        setIsDirty(true)
    }, [config, enableLiveValidation])

    const handleSectionChange = useCallback((section: ConfigSection) => {
        setActiveSection(section)
    }, [])

    const handleRefreshModels = useCallback(async () => {
        try {
            await modelManagement.refreshModels(undefined, { 
                showNotifications: true 
            })
        } catch (error) {
            console.error('Failed to refresh models:', error)
        }
    }, [modelManagement])

    const handleTestConnection = useCallback(async () => {
        try {
            const result = await config.testConnection()
            if (result.success) {
                config.showNotification({
                    type: 'success',
                    message: `Successfully connected to ${getProviderDisplayName(result.data.provider)}`,
                    duration: 3000
                })
            }
        } catch (error) {
            console.error('Connection test failed:', error)
        }
    }, [config])

    // =============================================================================
    // SECTION NAVIGATION
    // =============================================================================

    const sections: { id: ConfigSection; label: string; icon: string }[] = [
        { id: 'general', label: 'General', icon: '⚙️' },
        { id: 'providers', label: 'AI Providers', icon: '🤖' },
        { id: 'models', label: 'Models', icon: '🧠' },
        ...(showPhaseConfig ? [{ id: 'phases' as ConfigSection, label: 'Phase Configuration', icon: '📋' }] : []),
        { id: 'templates', label: 'Templates', icon: '📄' },
        { id: 'validation', label: 'Validation', icon: '✅' },
        ...(showAdvancedOptions ? [{ id: 'advanced' as ConfigSection, label: 'Advanced', icon: '🔧' }] : [])
    ]

    const filteredSections = useMemo(() => {
        if (!searchQuery) return sections
        return sections.filter(section => 
            section.label.toLowerCase().includes(searchQuery.toLowerCase())
        )
    }, [sections, searchQuery])

    // =============================================================================
    // RENDER SECTION CONTENT
    // =============================================================================

    const renderSectionContent = () => {
        switch (activeSection) {
            case 'general':
                return (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 mb-4">General Configuration</h2>
                            
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Default AI Provider
                                    </label>
                                    <select
                                        value={config.state.apiConfiguration.globalAiPreferences?.preferredProvider || ''}
                                        onChange={(e) => handleConfigurationUpdate({
                                            globalAiPreferences: {
                                                ...config.state.apiConfiguration.globalAiPreferences,
                                                preferredProvider: e.target.value as ApiProvider
                                            }
                                        })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">Select default provider...</option>
                                        {Object.values(ApiProvider).map(provider => (
                                            <option key={provider} value={provider}>
                                                {getProviderDisplayName(provider)}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex items-center space-x-4">
                                    <label className="flex items-center space-x-2">
                                        <input
                                            type="checkbox"
                                            checked={config.state.apiConfiguration.globalAiPreferences?.enableFallback || false}
                                            onChange={(e) => handleConfigurationUpdate({
                                                globalAiPreferences: {
                                                    ...config.state.apiConfiguration.globalAiPreferences,
                                                    enableFallback: e.target.checked
                                                }
                                            })}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm font-medium text-gray-700">Enable Provider Fallback</span>
                                    </label>

                                    <label className="flex items-center space-x-2">
                                        <input
                                            type="checkbox"
                                            checked={config.state.apiConfiguration.globalAiPreferences?.globalExtendedThinking || false}
                                            onChange={(e) => handleConfigurationUpdate({
                                                globalAiPreferences: {
                                                    ...config.state.apiConfiguration.globalAiPreferences,
                                                    globalExtendedThinking: e.target.checked
                                                }
                                            })}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm font-medium text-gray-700">Extended Thinking Mode</span>
                                    </label>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Global Temperature ({config.state.apiConfiguration.globalAiPreferences?.globalTemperature || 0.7})
                                    </label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="2"
                                        step="0.1"
                                        value={config.state.apiConfiguration.globalAiPreferences?.globalTemperature || 0.7}
                                        onChange={(e) => handleConfigurationUpdate({
                                            globalAiPreferences: {
                                                ...config.state.apiConfiguration.globalAiPreferences,
                                                globalTemperature: parseFloat(e.target.value)
                                            }
                                        })}
                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )

            case 'providers':
                return (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-gray-900">AI Providers</h2>
                            <button
                                onClick={handleRefreshModels}
                                disabled={modelManagement.isLoading}
                                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {modelManagement.isLoading ? 'Refreshing...' : 'Refresh Models'}
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {Object.values(ApiProvider).map(provider => {
                                const providerModels = modelManagement.availableModels[provider] || {}
                                const modelCount = Object.keys(providerModels).length
                                const isConfigured = modelCount > 0
                                
                                return (
                                    <ProviderCard
                                        key={provider}
                                        provider={provider}
                                        isSelected={config.state.apiConfiguration.globalAiPreferences?.preferredProvider === provider}
                                        onSelect={(selectedProvider) => handleConfigurationUpdate({
                                            globalAiPreferences: {
                                                ...config.state.apiConfiguration.globalAiPreferences,
                                                preferredProvider: selectedProvider
                                            }
                                        })}
                                        modelCount={modelCount}
                                        status={isConfigured ? 'configured' : 'available'}
                                    />
                                )
                            })}
                        </div>
                    </div>
                )

            case 'phases':
                if (!showPhaseConfig) return null
                
                return (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-gray-900">Phase Configuration</h2>
                            <div className="text-sm text-gray-500">
                                Current Phase: {getPhaseDisplayName(config.state.currentPhase)}
                            </div>
                        </div>

                        <div className="space-y-4">
                            {phaseConfigs.map(({ phase, config: phaseConfig, isActive }) => (
                                <PhaseConfigSection
                                    key={phase}
                                    phase={phase}
                                    config={phaseConfig}
                                    onUpdate={(updates) => handlePhaseConfigUpdate(phase, updates)}
                                    availableModels={modelManagement.availableModels}
                                    isActive={isActive}
                                />
                            ))}
                        </div>
                    </div>
                )

            case 'validation':
                return (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-gray-900">Configuration Validation</h2>
                            <button
                                onClick={handleTestConnection}
                                disabled={config.loadingStates.validation}
                                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                            >
                                {config.loadingStates.validation ? 'Testing...' : 'Test Connection'}
                            </button>
                        </div>

                        <ValidationIndicator
                            isValid={validationResults?.isValid || false}
                            errors={validationErrors}
                            warnings={validationResults?.warnings || []}
                            isValidating={isValidating}
                        />

                        {validationResults && (
                            <div className="bg-gray-50 rounded-lg p-4">
                                <h3 className="font-medium text-gray-900 mb-2">Validation Results</h3>
                                <div className="text-sm text-gray-600">
                                    Score: {validationResults.score}/100
                                </div>
                                
                                {validationResults.suggestions && validationResults.suggestions.length > 0 && (
                                    <div className="mt-4">
                                        <h4 className="font-medium text-gray-800 mb-2">Suggestions</h4>
                                        <ul className="space-y-1 text-sm text-gray-600">
                                            {validationResults.suggestions.map((suggestion, index) => (
                                                <li key={index} className="flex items-start space-x-2">
                                                    <span className="text-blue-500">•</span>
                                                    <span>{suggestion}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )

            default:
                return (
                    <div className="text-center text-gray-500 py-8">
                        <p>Section "{activeSection}" is not yet implemented.</p>
                        <p className="text-sm mt-2">Coming in a future update.</p>
                    </div>
                )
        }
    }

    // =============================================================================
    // MAIN RENDER
    // =============================================================================

    return (
        <div className={`flex h-full bg-white ${className}`}>
            {/* Sidebar Navigation */}
            <div className="w-64 border-r border-gray-200 flex flex-col">
                <div className="p-4 border-b border-gray-200">
                    <div className="flex items-center justify-between mb-3">
                        <h1 className="text-lg font-semibold text-gray-900">Configuration</h1>
                        <button
                            onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                            className="text-gray-400 hover:text-gray-600"
                            title="Toggle advanced options"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                            </svg>
                        </button>
                    </div>
                    
                    <input
                        type="text"
                        placeholder="Search sections..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                <nav className="flex-1 p-4 space-y-1">
                    {filteredSections.map(section => (
                        <button
                            key={section.id}
                            onClick={() => handleSectionChange(section.id)}
                            className={`
                                w-full flex items-center space-x-3 px-3 py-2 text-sm font-medium rounded-md text-left
                                ${activeSection === section.id
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'text-gray-700 hover:bg-gray-100'
                                }
                            `}
                        >
                            <span>{section.icon}</span>
                            <span>{section.label}</span>
                        </button>
                    ))}
                </nav>

                {/* Status Footer */}
                <div className="p-4 border-t border-gray-200 space-y-2">
                    {isDirty && (
                        <div className="text-xs text-yellow-600 flex items-center space-x-1">
                            <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                            <span>Unsaved changes</span>
                        </div>
                    )}
                    
                    <div className="text-xs text-gray-500">
                        {config.connectionState.isConnected ? (
                            <div className="flex items-center space-x-1">
                                <div className="w-2 h-2 bg-green-500 rounded-full" />
                                <span>Connected</span>
                            </div>
                        ) : (
                            <div className="flex items-center space-x-1">
                                <div className="w-2 h-2 bg-red-500 rounded-full" />
                                <span>Disconnected</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto">
                <div className="p-6">
                    {config.uiState.notifications.length > 0 && (
                        <div className="mb-6 space-y-2">
                            {config.uiState.notifications.map(notification => (
                                <div
                                    key={notification.id}
                                    className={`
                                        p-3 rounded-md flex items-center justify-between
                                        ${notification.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : ''}
                                        ${notification.type === 'warning' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' : ''}
                                        ${notification.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : ''}
                                        ${notification.type === 'info' ? 'bg-blue-50 text-blue-700 border border-blue-200' : ''}
                                    `}
                                >
                                    <span className="text-sm">{notification.message}</span>
                                    <button
                                        onClick={() => config.dismissNotification(notification.id)}
                                        className="ml-2 text-current opacity-70 hover:opacity-100"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    
                    {renderSectionContent()}
                </div>
            </div>
        </div>
    )
}

export default ConfigManager

// =============================================================================
// VERSION AND METADATA
// =============================================================================

/**
 * Component version for tracking updates
 */
export const CONFIG_MANAGER_VERSION = '1.0.0'

/**
 * Supported configuration sections
 */
export const SUPPORTED_CONFIG_SECTIONS = [
    'general',
    'phases', 
    'providers',
    'models',
    'templates',
    'validation',
    'advanced'
] as const
