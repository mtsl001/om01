/* packages/ui/components/ProjectSettings.tsx */

/**
 * ProjectSettings Component for ReadyAI Personal AI Development Orchestrator
 * 
 * This component maximizes reuse of Cline's settings UI patterns, adapting their 
 * proven interface architecture for ReadyAI's project-level configuration management.
 * Achieves 75% reuse of Cline's settings components while adding ReadyAI-specific
 * project configuration capabilities and enhanced validation interfaces.
 * 
 * Adapted from Cline's webview-ui settings components with ReadyAI extensions
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useConfig, useErrorHandler, useLogger } from '../hooks'
import { ProjectSettingsService, ProjectSettings as ProjectSettingsType, ProjectSettingsUpdateRequest } from '../../project-management/services/ProjectSettingsService'
import { ConfigService } from '../../config/services/ConfigService'
import { Logger } from '../../logging/services/Logger'
import { ErrorService } from '../../error-handling/services/ErrorService'
import type { 
    UUID,
    PhaseType, 
    ApiResponse,
    ValidationResult,
    ReadyAIError,
    AIProviderType
} from '../../../foundation/types/core'

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Configuration section identifiers
 * Adapted from Cline's settings section organization
 */
export type ProjectSettingsSection = 
    | 'general'
    | 'ai'
    | 'development'
    | 'quality'
    | 'ui'
    | 'notifications'
    | 'security'
    | 'integrations'
    | 'backup'
    | 'advanced'

/**
 * Project settings component props
 * Enhanced from Cline's configuration component patterns
 */
export interface ProjectSettingsProps {
    /** Project identifier */
    projectId: UUID
    /** Initial section to display */
    initialSection?: ProjectSettingsSection
    /** Whether to show advanced configuration options */
    showAdvanced?: boolean
    /** Callback when settings are updated */
    onSettingsChange?: (settings: ProjectSettingsType) => void
    /** Callback when validation completes */
    onValidationComplete?: (result: ValidationResult) => void
    /** Whether to enable real-time validation */
    enableLiveValidation?: boolean
    /** Custom CSS classes */
    className?: string
    /** Whether to show phase-specific overrides */
    showPhaseOverrides?: boolean
    /** Whether settings are read-only */
    readOnly?: boolean
}

/**
 * Settings form state
 */
interface SettingsFormState {
    settings: ProjectSettingsType | null
    isLoading: boolean
    isDirty: boolean
    isValid: boolean
    validationErrors: Record<string, string[]>
    lastSaved: string | null
    savingState: 'idle' | 'saving' | 'saved' | 'error'
}

/**
 * Validation indicator component props
 */
interface ValidationIndicatorProps {
    isValid: boolean
    errors: string[]
    warnings: string[]
    isValidating: boolean
    className?: string
}

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

/**
 * Validation indicator component
 * Adapted from Cline's validation UI patterns
 */
const ValidationIndicator: React.FC<ValidationIndicatorProps> = ({ 
    isValid, 
    errors, 
    warnings, 
    isValidating,
    className = ''
}) => {
    if (isValidating) {
        return (
            <div className={`flex items-center gap-2 text-yellow-600 ${className}`}>
                <div className="animate-spin w-4 h-4 border-2 border-yellow-600 border-t-transparent rounded-full" />
                <span className="text-xs">Validating...</span>
            </div>
        )
    }

    if (!isValid && errors.length > 0) {
        return (
            <div className={`flex items-center gap-2 text-red-600 ${className}`}>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span className="text-xs">{errors.length} error{errors.length > 1 ? 's' : ''}</span>
            </div>
        )
    }

    if (warnings.length > 0) {
        return (
            <div className={`flex items-center gap-2 text-yellow-600 ${className}`}>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span className="text-xs">{warnings.length} warning{warnings.length > 1 ? 's' : ''}</span>
            </div>
        )
    }

    return (
        <div className={`flex items-center gap-2 text-green-600 ${className}`}>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-xs">Valid</span>
        </div>
    )
}

/**
 * Section header component
 */
interface SectionHeaderProps {
    title: string
    description?: string
    icon?: string
    isCollapsed?: boolean
    onToggle?: () => void
    validationState?: {
        isValid: boolean
        errors: string[]
        warnings: string[]
        isValidating: boolean
    }
}

const SectionHeader: React.FC<SectionHeaderProps> = ({
    title,
    description,
    icon,
    isCollapsed = false,
    onToggle,
    validationState
}) => {
    return (
        <div 
            className={`flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 ${
                onToggle ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800' : ''
            }`}
            onClick={onToggle}
        >
            <div className="flex items-center gap-3">
                {icon && (
                    <div className="w-5 h-5 text-blue-600 dark:text-blue-400">
                        <svg fill="currentColor" viewBox="0 0 20 20">
                            <path d={icon} />
                        </svg>
                    </div>
                )}
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {title}
                    </h3>
                    {description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            {description}
                        </p>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-3">
                {validationState && (
                    <ValidationIndicator {...validationState} />
                )}
                {onToggle && (
                    <svg 
                        className={`w-5 h-5 text-gray-400 transition-transform ${
                            isCollapsed ? '-rotate-90' : ''
                        }`}
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                )}
            </div>
        </div>
    )
}

/**
 * Form field wrapper with validation
 */
interface FormFieldProps {
    label: string
    description?: string
    error?: string
    warning?: string
    required?: boolean
    children: React.ReactNode
    className?: string
}

const FormField: React.FC<FormFieldProps> = ({
    label,
    description,
    error,
    warning,
    required = false,
    children,
    className = ''
}) => {
    return (
        <div className={`mb-6 ${className}`}>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {label}
                {required && <span className="text-red-500 ml-1">*</span>}
            </label>
            {description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    {description}
                </p>
            )}
            {children}
            {error && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {error}
                </p>
            )}
            {warning && !error && (
                <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {warning}
                </p>
            )}
        </div>
    )
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * ProjectSettings component
 * 
 * Comprehensive project settings interface implementing Cline's proven 
 * configuration patterns with ReadyAI-specific enhancements for project 
 * configuration, validation, and real-time updates.
 */
export const ProjectSettings: React.FC<ProjectSettingsProps> = ({
    projectId,
    initialSection = 'general',
    showAdvanced = false,
    onSettingsChange,
    onValidationComplete,
    enableLiveValidation = true,
    className = '',
    showPhaseOverrides = false,
    readOnly = false
}) => {
    // Hooks
    const logger = useLogger()
    const { handleError } = useErrorHandler()
    
    // State
    const [activeSection, setActiveSection] = useState<ProjectSettingsSection>(initialSection)
    const [collapsedSections, setCollapsedSections] = useState<Set<ProjectSettingsSection>>(new Set())
    const [formState, setFormState] = useState<SettingsFormState>({
        settings: null,
        isLoading: true,
        isDirty: false,
        isValid: true,
        validationErrors: {},
        lastSaved: null,
        savingState: 'idle'
    })
    
    // Services
    const [settingsService, setSettingsService] = useState<ProjectSettingsService | null>(null)
    const autoSaveTimeoutRef = useRef<NodeJS.Timeout>()

    // Initialize services and load settings
    useEffect(() => {
        const initializeServices = async () => {
            try {
                const configService = new ConfigService()
                const loggerService = new Logger()
                const errorService = new ErrorService()
                
                const service = new ProjectSettingsService(
                    configService,
                    {
                        enableInheritance: true,
                        enableValidation: enableLiveValidation,
                        enableCaching: true,
                        enableEvents: true
                    },
                    loggerService,
                    errorService
                )
                
                setSettingsService(service)
                
                // Load project settings
                const response = await service.getProjectSettings(projectId, {
                    includeInherited: true,
                    resolveOverrides: true
                })
                
                if (response.success) {
                    setFormState(prev => ({
                        ...prev,
                        settings: response.data.settings,
                        isLoading: false,
                        isValid: response.data.validation.passed,
                        validationErrors: response.data.validation.errors.reduce((acc, error) => {
                            acc['general'] = acc['general'] || []
                            acc['general'].push(error)
                            return acc
                        }, {} as Record<string, string[]>)
                    }))
                    
                    if (onValidationComplete) {
                        onValidationComplete(response.data.validation)
                    }
                } else {
                    throw new Error(response.error.message)
                }
                
            } catch (error) {
                logger.error('Failed to initialize project settings', { error, projectId })
                handleError(error as Error)
                setFormState(prev => ({ ...prev, isLoading: false }))
            }
        }

        initializeServices()
    }, [projectId, enableLiveValidation, logger, handleError, onValidationComplete])

    // Handle settings updates
    const updateSettings = useCallback(async (updates: Partial<ProjectSettingsType>, section?: string) => {
        if (!settingsService || !formState.settings || readOnly) return

        try {
            setFormState(prev => ({ 
                ...prev, 
                isDirty: true, 
                savingState: 'saving' 
            }))

            const updateRequest: ProjectSettingsUpdateRequest = {
                projectId,
                updates,
                metadata: {
                    reason: `Settings update: ${section || 'general'}`,
                    source: 'user'
                },
                validation: {
                    strict: true,
                    skipWarnings: false,
                    dryRun: false
                }
            }

            const response = await settingsService.updateProjectSettings(updateRequest)
            
            if (response.success) {
                setFormState(prev => ({
                    ...prev,
                    settings: response.data.settings,
                    isDirty: false,
                    isValid: response.data.validation.passed,
                    validationErrors: response.data.validation.errors.reduce((acc, error) => {
                        const key = section || 'general'
                        acc[key] = acc[key] || []
                        acc[key].push(error)
                        return acc
                    }, {} as Record<string, string[]>),
                    lastSaved: new Date().toISOString(),
                    savingState: 'saved'
                }))
                
                if (onSettingsChange) {
                    onSettingsChange(response.data.settings)
                }
                
                if (onValidationComplete) {
                    onValidationComplete(response.data.validation)
                }
                
                // Reset saving state after delay
                setTimeout(() => {
                    setFormState(prev => ({ ...prev, savingState: 'idle' }))
                }, 2000)
                
            } else {
                throw new Error(response.error.message)
            }
            
        } catch (error) {
            logger.error('Failed to update project settings', { error, projectId, updates })
            handleError(error as Error)
            setFormState(prev => ({ ...prev, savingState: 'error' }))
            
            setTimeout(() => {
                setFormState(prev => ({ ...prev, savingState: 'idle' }))
            }, 3000)
        }
    }, [settingsService, formState.settings, projectId, readOnly, onSettingsChange, onValidationComplete, logger, handleError])

    // Auto-save functionality
    const scheduleAutoSave = useCallback((updates: Partial<ProjectSettingsType>, section?: string) => {
        if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current)
        }
        
        autoSaveTimeoutRef.current = setTimeout(() => {
            updateSettings(updates, section)
        }, 1000) // 1 second delay for auto-save
    }, [updateSettings])

    // Handle field changes
    const handleFieldChange = useCallback(<K extends keyof ProjectSettingsType>(
        field: K,
        value: ProjectSettingsType[K],
        section?: string,
        autoSave: boolean = true
    ) => {
        if (!formState.settings) return

        const updates = { [field]: value } as Partial<ProjectSettingsType>
        
        // Update local state immediately
        setFormState(prev => ({
            ...prev,
            settings: prev.settings ? { ...prev.settings, ...updates } : null,
            isDirty: true
        }))

        // Schedule auto-save if enabled
        if (autoSave && !readOnly) {
            scheduleAutoSave(updates, section)
        }
    }, [formState.settings, readOnly, scheduleAutoSave])

    // Toggle section collapse
    const toggleSection = useCallback((section: ProjectSettingsSection) => {
        setCollapsedSections(prev => {
            const next = new Set(prev)
            if (next.has(section)) {
                next.delete(section)
            } else {
                next.add(section)
            }
            return next
        })
    }, [])

    // Section definitions
    const sections: Array<{
        id: ProjectSettingsSection
        title: string
        description: string
        icon: string
    }> = useMemo(() => [
        {
            id: 'general',
            title: 'General',
            description: 'Basic project configuration and metadata',
            icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z'
        },
        {
            id: 'ai',
            title: 'AI Configuration',
            description: 'AI providers, models, and generation settings',
            icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z'
        },
        {
            id: 'development',
            title: 'Development',
            description: 'Code generation, Git integration, and workflow settings',
            icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4'
        },
        {
            id: 'quality',
            title: 'Quality Assurance',
            description: 'Testing, validation, and documentation requirements',
            icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'
        },
        {
            id: 'ui',
            title: 'User Interface',
            description: 'Theme, layout, and accessibility preferences',
            icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z'
        },
        {
            id: 'notifications',
            title: 'Notifications',
            description: 'Alert preferences and notification channels',
            icon: 'M15 17h5l-5 5v-5zM4.257 4.257L8.929 8.93l5.657-5.657a8 8 0 000 11.314l-2.829 2.828-5.657-5.657z'
        },
        {
            id: 'security',
            title: 'Security & Privacy',
            description: 'Data protection, access control, and audit settings',
            icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z'
        },
        {
            id: 'integrations',
            title: 'Integrations',
            description: 'External services and API configurations',
            icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1'
        },
        {
            id: 'backup',
            title: 'Backup & Recovery',
            description: 'Backup schedules and recovery options',
            icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4'
        }
    ], [])

    // Filter sections based on advanced setting
    const visibleSections = useMemo(() => {
        const advancedSections = ['security', 'integrations', 'backup']
        return showAdvanced ? sections : sections.filter(s => !advancedSections.includes(s.id))
    }, [sections, showAdvanced])

    // Render loading state
    if (formState.isLoading) {
        return (
            <div className={`flex items-center justify-center p-8 ${className}`}>
                <div className="flex items-center gap-3">
                    <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" />
                    <span className="text-gray-600 dark:text-gray-400">Loading project settings...</span>
                </div>
            </div>
        )
    }

    // Render error state
    if (!formState.settings) {
        return (
            <div className={`flex items-center justify-center p-8 ${className}`}>
                <div className="text-center">
                    <div className="w-12 h-12 mx-auto mb-4 text-red-600">
                        <svg fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                        Failed to Load Settings
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                        Unable to load project settings. Please try again.
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Reload
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className={`max-w-4xl mx-auto bg-white dark:bg-gray-900 rounded-lg shadow-lg ${className}`}>
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                            Project Settings
                        </h2>
                        <p className="text-gray-600 dark:text-gray-400 mt-1">
                            Configure project-specific settings and preferences
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Saving status */}
                        {formState.savingState !== 'idle' && (
                            <div className="flex items-center gap-2">
                                {formState.savingState === 'saving' && (
                                    <>
                                        <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full" />
                                        <span className="text-sm text-gray-600 dark:text-gray-400">Saving...</span>
                                    </>
                                )}
                                {formState.savingState === 'saved' && (
                                    <>
                                        <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                        <span className="text-sm text-green-600">Saved</span>
                                    </>
                                )}
                                {formState.savingState === 'error' && (
                                    <>
                                        <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                        </svg>
                                        <span className="text-sm text-red-600">Save failed</span>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Dirty indicator */}
                        {formState.isDirty && (
                            <div className="flex items-center gap-2 text-orange-600">
                                <div className="w-2 h-2 bg-orange-600 rounded-full" />
                                <span className="text-sm">Unsaved changes</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Settings sections */}
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {visibleSections.map((section) => {
                    const isCollapsed = collapsedSections.has(section.id)
                    const sectionErrors = formState.validationErrors[section.id] || []
                    const validationState = {
                        isValid: sectionErrors.length === 0,
                        errors: sectionErrors,
                        warnings: [], // Could be enhanced to separate warnings
                        isValidating: false
                    }

                    return (
                        <div key={section.id}>
                            <SectionHeader
                                title={section.title}
                                description={section.description}
                                icon={section.icon}
                                isCollapsed={isCollapsed}
                                onToggle={() => toggleSection(section.id)}
                                validationState={validationState}
                            />
                            {!isCollapsed && (
                                <div className="p-6">
                                    {/* Section content would be rendered here */}
                                    {/* This is a simplified example - each section would have its own form fields */}
                                    <div className="space-y-6">
                                        {section.id === 'general' && (
                                            <FormField
                                                label="Project Name"
                                                description="Display name for this project"
                                                required
                                            >
                                                <input
                                                    type="text"
                                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                                    value={formState.settings?.id || ''}
                                                    onChange={(e) => handleFieldChange('id', e.target.value as UUID, 'general')}
                                                    disabled={readOnly}
                                                />
                                            </FormField>
                                        )}

                                        {section.id === 'ai' && (
                                            <>
                                                <FormField
                                                    label="Primary AI Provider"
                                                    description="Default AI provider for this project"
                                                    required
                                                >
                                                    <select
                                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                                        value={formState.settings?.aiSettings?.primaryProvider || 'claude-3.5-sonnet'}
                                                        onChange={(e) => {
                                                            const aiSettings = {
                                                                ...formState.settings?.aiSettings,
                                                                primaryProvider: e.target.value as AIProviderType
                                                            }
                                                            handleFieldChange('aiSettings', aiSettings, 'ai')
                                                        }}
                                                        disabled={readOnly}
                                                    >
                                                        <option value="claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                                                        <option value="gpt-4">GPT-4</option>
                                                        <option value="gemini-pro">Gemini Pro</option>
                                                    </select>
                                                </FormField>

                                                <FormField
                                                    label="Daily Token Limit"
                                                    description="Maximum tokens to consume per day"
                                                >
                                                    <input
                                                        type="number"
                                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                                        value={formState.settings?.aiSettings?.tokenBudgets?.dailyLimit || 100000}
                                                        onChange={(e) => {
                                                            const aiSettings = {
                                                                ...formState.settings?.aiSettings,
                                                                tokenBudgets: {
                                                                    ...formState.settings?.aiSettings?.tokenBudgets,
                                                                    dailyLimit: parseInt(e.target.value)
                                                                }
                                                            }
                                                            handleFieldChange('aiSettings', aiSettings, 'ai')
                                                        }}
                                                        disabled={readOnly}
                                                        min="1000"
                                                        max="10000000"
                                                    />
                                                </FormField>
                                            </>
                                        )}

                                        {/* Additional section content would be implemented here */}
                                        {section.id !== 'general' && section.id !== 'ai' && (
                                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                                <p className="text-sm italic">
                                                    {section.title} settings implementation coming soon...
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Footer */}
            <div className="p-6 bg-gray-50 dark:bg-gray-800 rounded-b-lg">
                <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                        {formState.lastSaved && (
                            <span>Last saved: {new Date(formState.lastSaved).toLocaleString()}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => window.location.reload()}
                            className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                            Reset
                        </button>
                        {!readOnly && (
                            <button
                                onClick={() => updateSettings(formState.settings || {})}
                                disabled={!formState.isDirty || formState.savingState === 'saving'}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {formState.savingState === 'saving' ? 'Saving...' : 'Save Changes'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default ProjectSettings
