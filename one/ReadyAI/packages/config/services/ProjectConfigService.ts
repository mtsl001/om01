// packages/config/services/ProjectConfigService.ts

/**
 * Project Configuration Service for ReadyAI Personal AI Development Orchestrator
 * 
 * Adapts Cline's proven configuration service patterns for project-specific 
 * configuration management, focusing on project lifecycle, templates, and 
 * schema validation within ReadyAI's multi-phase development methodology.
 * 
 * Achieves 70% reuse of Cline's config service architecture while specializing
 * for project-scoped configuration operations including template management,
 * project initialization, phase-aware validation, and dependency tracking.
 * 
 * Key Responsibilities:
 * - Project configuration templates and initialization
 * - Project-specific schema validation and enforcement
 * - Phase-aware configuration management per project
 * - Project dependency and integration configuration
 * - Configuration migration and versioning per project
 * 
 * @version 1.3.0
 * @author ReadyAI Development Team
 */

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
	PhaseType,
	AIProviderType,
	Project,
	ValidationResult,
	QualityMetrics
} from '../../foundation/types/core';

import {
	ApiConfiguration,
	PhaseConfiguration,
	PhaseConfigurationMap,
	ConfigurationValidationResult,
	ConfigurationUpdateRequest,
	ConfigurationBackup,
	IConfigurationManager,
	DEFAULT_PHASE_CONFIGURATION,
	CONFIG_SCHEMA_VERSION,
	// Phase 1.3 Enhanced Configuration Types
	EnhancedApiConfiguration,
	EnhancedAuthConfig,
	AdvancedGatewayConfig,
	ComprehensiveErrorConfig,
	EnhancedConfigurationValidationResult,
	EnhancedConfigurationBuilder,
	DEFAULT_ENHANCED_CONFIGURATION,
	ENHANCED_CONFIG_SCHEMA_VERSION,
	Phase13Feature,
	PHASE_13_FEATURES,
	ConfigurationHealthCheck
} from '../types/config';

import { ConfigRepository } from '../repositories/ConfigRepository';
import { ConfigNormalizer } from './ConfigNormalizer';
import { EnhancedConfigService } from './ConfigService';
import { Logger } from '../../logging/services/Logger';
import { ErrorService } from '../../error-handling/services/ErrorService';

/**
 * Project Configuration Template Definition
 * Following Cline's template pattern with ReadyAI project specifics
 */
export interface ProjectConfigurationTemplate {
	/** Template unique identifier */
	templateId: UUID;
	/** Template name and metadata */
	name: string;
	description: string;
	version: string;
	category: 'web-app' | 'api-service' | 'desktop-app' | 'mobile-app' | 'library' | 'custom';
	
	/** Template configuration structure */
	baseConfiguration: EnhancedApiConfiguration;
	phaseConfigurations: Partial<PhaseConfigurationMap>;
	
	/** Project initialization settings */
	initialization: {
		requiredPhases: PhaseType[];
		optionalPhases: PhaseType[];
		defaultPhase: PhaseType;
		skipValidation: boolean;
	};
	
	/** Template-specific validation rules */
	validation: {
		requiredFields: string[];
		conditionalFields: Record<string, string[]>;
		customValidators: string[];
	};
	
	/** Integration and dependency configuration */
	dependencies: {
		requiredServices: string[];
		optionalServices: string[];
		externalApis: string[];
		databaseRequirements?: {
			type: string;
			minVersion: string;
			features: string[];
		};
	};
	
	/** Template metadata */
	metadata: {
		author: string;
		created: string;
		lastModified: string;
		tags: string[];
		compatibility: string[];
		complexity: 'beginner' | 'intermediate' | 'advanced' | 'expert';
	};
}

/**
 * Project Configuration Schema Definition
 * Extends Cline's validation patterns with ReadyAI project awareness
 */
export interface ProjectConfigurationSchema {
	/** Schema identifier and metadata */
	schemaId: UUID;
	name: string;
	version: string;
	description: string;
	
	/** Schema validation rules */
	rules: {
		/** Required configuration fields */
		required: {
			fields: string[];
			phases: Record<PhaseType, string[]>;
			conditional: Record<string, {
				condition: string;
				requiredFields: string[];
			}>;
		};
		
		/** Field validation constraints */
		constraints: {
			stringFields: Record<string, {
				minLength?: number;
				maxLength?: number;
				pattern?: string;
				enum?: string[];
			}>;
			numberFields: Record<string, {
				min?: number;
				max?: number;
				integer?: boolean;
			}>;
			arrayFields: Record<string, {
				minItems?: number;
				maxItems?: number;
				itemType: string;
			}>;
		};
		
		/** Cross-field validation rules */
		relationships: {
			dependencies: Record<string, string[]>;
			conflicts: Record<string, string[]>;
			implications: Record<string, Record<string, any>>;
		};
		
		/** Phase-specific validation */
		phaseRules: Record<PhaseType, {
			allowedFields: string[];
			forbiddenFields: string[];
			requiredTransitions: PhaseType[];
		}>;
	};
	
	/** Schema compatibility and versioning */
	compatibility: {
		minVersion: string;
		maxVersion: string;
		migrations: Array<{
			fromVersion: string;
			toVersion: string;
			migrationScript: string;
		}>;
	};
}

/**
 * Project Configuration Event
 * Extends Cline's event patterns for project-specific events
 */
export interface ProjectConfigurationEvent {
	/** Event identification */
	eventId: UUID;
	projectId: UUID;
	timestamp: string;
	
	/** Event classification */
	type: 'created' | 'updated' | 'deleted' | 'migrated' | 'template_applied' | 'phase_changed' | 'validated' | 'backup_created';
	source: 'user' | 'system' | 'migration' | 'template' | 'validation';
	
	/** Event data */
	data: {
		previousConfig?: EnhancedApiConfiguration;
		newConfig?: EnhancedApiConfiguration;
		templateId?: UUID;
		schemaId?: UUID;
		phase?: PhaseType;
		validationResults?: ProjectConfigurationValidationResult[];
		migrationDetails?: {
			fromVersion: string;
			toVersion: string;
			migrationTime: number;
			affectedFields: string[];
		};
	};
	
	/** Event metadata */
	metadata: {
		userId?: UUID;
		sessionId?: UUID;
		clientVersion: string;
		additionalData?: Record<string, any>;
	};
}

/**
 * Enhanced Project Configuration Validation Result
 * Extends base validation with project-specific concerns
 */
export interface ProjectConfigurationValidationResult extends EnhancedConfigurationValidationResult {
	/** Project-specific validation context */
	projectContext: {
		projectId: UUID;
		projectName: string;
		currentPhase: PhaseType;
		templateId?: UUID;
		schemaId?: UUID;
	};
	
	/** Template compatibility validation */
	templateValidation?: {
		isCompatible: boolean;
		templateVersion: string;
		requiredUpdates: string[];
		conflicts: string[];
	};
	
	/** Phase progression validation */
	phaseValidation?: {
		currentPhaseValid: boolean;
		nextPhaseReady: boolean;
		blockedTransitions: PhaseType[];
		recommendedActions: string[];
	};
	
	/** Dependency validation results */
	dependencyValidation?: {
		satisfied: string[];
		missing: string[];
		conflicting: Array<{
			dependency: string;
			conflict: string;
			resolution: string;
		}>;
	};
}

/**
 * Project Configuration Service Options
 * Extends Cline's service options pattern with project-specific settings
 */
export interface ProjectConfigServiceOptions {
	/** Enable automatic template synchronization */
	enableTemplateSync?: boolean;
	/** Enable schema validation enforcement */
	enableSchemaValidation?: boolean;
	/** Enable automatic phase progression validation */
	enablePhaseValidation?: boolean;
	/** Enable project configuration events */
	enableProjectEvents?: boolean;
	/** Template cache settings */
	templateCacheSize?: number;
	templateCacheTtlMs?: number;
	/** Schema validation settings */
	validationLevel?: 'permissive' | 'standard' | 'strict';
	maxValidationErrors?: number;
	/** Background processing settings */
	enableBackgroundValidation?: boolean;
	backgroundValidationIntervalMs?: number;
}

/**
 * Default service options following Cline's pattern
 */
const DEFAULT_PROJECT_CONFIG_OPTIONS: Required<ProjectConfigServiceOptions> = {
	enableTemplateSync: true,
	enableSchemaValidation: true,
	enablePhaseValidation: true,
	enableProjectEvents: true,
	templateCacheSize: 100,
	templateCacheTtlMs: 1800000, // 30 minutes
	validationLevel: 'standard',
	maxValidationErrors: 50,
	enableBackgroundValidation: false,
	backgroundValidationIntervalMs: 300000 // 5 minutes
};

/**
 * Project Configuration Event Listener
 */
export type ProjectConfigurationEventListener = (event: ProjectConfigurationEvent) => void | Promise<void>;

/**
 * Project Configuration Service
 * 
 * Specializes Cline's configuration service patterns for project-specific
 * configuration management within ReadyAI's multi-phase development methodology.
 * 
 * Maintains Cline's proven architecture while adding project lifecycle management,
 * template-based initialization, and phase-aware validation capabilities.
 */
export class ProjectConfigService {
	private readonly configService: EnhancedConfigService;
	private readonly repository: ConfigRepository;
	private readonly normalizer: ConfigNormalizer;
	private readonly logger: Logger;
	private readonly errorService: ErrorService;
	private readonly options: Required<ProjectConfigServiceOptions>;
	
	// Template and schema management (following Cline's caching patterns)
	private readonly templateCache = new Map<UUID, { template: ProjectConfigurationTemplate; timestamp: number }>();
	private readonly schemaCache = new Map<UUID, { schema: ProjectConfigurationSchema; timestamp: number }>();
	
	// Event management (following Cline's event system)
	private readonly eventListeners = new Map<string, Set<ProjectConfigurationEventListener>>();
	
	// Validation state tracking
	private readonly validationResults = new Map<UUID, ProjectConfigurationValidationResult[]>();
	private readonly backgroundValidationTimer?: NodeJS.Timeout;

	constructor(
		configService: EnhancedConfigService,
		repository: ConfigRepository,
		normalizer: ConfigNormalizer,
		options: ProjectConfigServiceOptions = {},
		logger?: Logger,
		errorService?: ErrorService
	) {
		this.configService = configService;
		this.repository = repository;
		this.normalizer = normalizer;
		this.logger = logger || this.createBasicLogger();
		this.errorService = errorService || this.createBasicErrorService();
		this.options = { ...DEFAULT_PROJECT_CONFIG_OPTIONS, ...options };

		// Initialize background validation if enabled (following Cline's background task pattern)
		if (this.options.enableBackgroundValidation) {
			this.startBackgroundValidation();
		}

		this.logger.info('ProjectConfigService initialized', {
			options: this.options,
			templateCacheEnabled: this.options.templateCacheSize > 0,
			eventsEnabled: this.options.enableProjectEvents
		});
	}

	/**
	 * Initialize project configuration from template
	 * Adapts Cline's initialization patterns with project template support
	 */
	async initializeProjectFromTemplate(
		projectId: UUID,
		templateId: UUID,
		customizations: Partial<EnhancedApiConfiguration> = {},
		options: {
			overrideExisting?: boolean;
			validateOnly?: boolean;
			skipPhaseSetup?: boolean;
		} = {}
	): Promise<ApiResponse<EnhancedApiConfiguration>> {
		return wrapAsync(async () => {
			this.logger.debug('Initializing project from template', { projectId, templateId, options });

			// Load template with caching (following Cline's caching pattern)
			const templateResult = await this.getConfigurationTemplate(templateId);
			if (!isApiSuccess(templateResult)) {
				throw new ReadyAIError(
					`Failed to load configuration template: ${templateResult.error.message}`,
					'PROJECT_CONFIG_TEMPLATE_ERROR',
					404,
					{ projectId, templateId }
				);
			}

			const template = templateResult.data;

			// Check if project already has configuration and handle override
			if (!options.overrideExisting) {
				const existingResult = await this.configService.getEnhancedConfiguration(projectId);
				if (isApiSuccess(existingResult)) {
					throw new ReadyAIError(
						'Project already has configuration. Use overrideExisting=true to replace.',
						'PROJECT_CONFIG_EXISTS',
						409,
						{ projectId, templateId }
					);
				}
			}

			// Build project configuration from template
			const projectConfig: EnhancedApiConfiguration = {
				...template.baseConfiguration,
				...customizations,
				id: crypto.randomUUID() as UUID,
				projectId,
				templateId,
				created: new Date().toISOString(),
				lastModified: new Date().toISOString(),
				version: template.version
			};

			// Apply template-specific phase configurations
			if (!options.skipPhaseSetup) {
				for (const [phase, phaseConfig] of Object.entries(template.phaseConfigurations)) {
					if (phaseConfig) {
						await this.configService.updateEnhancedConfiguration(
							projectId,
							{
								phase: phase as PhaseType,
								updates: phaseConfig,
								templateId
							},
							{ validateOnly: options.validateOnly }
						);
					}
				}
			}

			// Validate template application (following Cline's validation patterns)
			if (this.options.enableSchemaValidation) {
				const validationResult = await this.validateProjectConfiguration(
					projectId,
					projectConfig,
					{
						templateValidation: true,
						phaseValidation: !options.skipPhaseSetup,
						strict: this.options.validationLevel === 'strict'
					}
				);

				if (!isApiSuccess(validationResult)) {
					throw new ReadyAIError(
						`Template validation failed: ${validationResult.error.message}`,
						'PROJECT_CONFIG_VALIDATION_ERROR',
						422,
						{ projectId, templateId }
					);
				}

				// Store validation results
				this.validationResults.set(projectId, validationResult.data);
			}

			// Return early if validation-only mode
			if (options.validateOnly) {
				return createApiResponse(projectConfig);
			}

			// Persist project configuration
			const saveResult = await this.configService.updateEnhancedConfiguration(
				projectId,
				{
					updates: projectConfig,
					templateId,
					auditTrail: true
				}
			);

			if (!isApiSuccess(saveResult)) {
				throw new ReadyAIError(
					`Failed to save project configuration: ${saveResult.error.message}`,
					'PROJECT_CONFIG_SAVE_ERROR',
					500,
					{ projectId, templateId }
				);
			}

			// Emit project configuration event
			if (this.options.enableProjectEvents) {
				await this.emitProjectEvent({
					eventId: crypto.randomUUID() as UUID,
					projectId,
					timestamp: new Date().toISOString(),
					type: 'created',
					source: 'template',
					data: {
						newConfig: saveResult.data,
						templateId
					},
					metadata: {
						clientVersion: '1.3.0',
						additionalData: { 
							templateName: template.name,
							customizationCount: Object.keys(customizations).length
						}
					}
				});
			}

			this.logger.info('Project configuration initialized from template', {
				projectId,
				templateId,
				templateName: template.name,
				phaseSetup: !options.skipPhaseSetup
			});

			return saveResult;
		});
	}

	/**
	 * Validate project configuration with comprehensive checks
	 * Extends Cline's validation patterns with project-specific validation
	 */
	async validateProjectConfiguration(
		projectId: UUID,
		config?: EnhancedApiConfiguration,
		options: {
			templateValidation?: boolean;
			phaseValidation?: boolean;
			dependencyValidation?: boolean;
			strict?: boolean;
			schemaId?: UUID;
		} = {}
	): Promise<ApiResponse<ProjectConfigurationValidationResult[]>> {
		return wrapAsync(async () => {
			this.logger.debug('Validating project configuration', { projectId, options });

			// Get current configuration if not provided
			let targetConfig = config;
			if (!targetConfig) {
				const configResult = await this.configService.getEnhancedConfiguration(projectId);
				if (!isApiSuccess(configResult)) {
					throw new ReadyAIError(
						`Failed to retrieve project configuration: ${configResult.error.message}`,
						'PROJECT_CONFIG_RETRIEVAL_ERROR',
						500,
						{ projectId }
					);
				}
				targetConfig = configResult.data;
			}

			const validationResults: ProjectConfigurationValidationResult[] = [];

			// Base configuration validation (using Cline's validation patterns)
			const baseValidationResult = await this.configService.validateEnhancedConfiguration
				? await (this.configService as any).validateEnhancedConfiguration(targetConfig, {
					projectId,
					phase: targetConfig.currentPhase,
					strict: options.strict,
					checkPhaseCompatibility: options.phaseValidation
				})
				: createApiResponse({
					isValid: true,
					errors: [],
					warnings: [],
					metadata: {}
				});

			if (isApiSuccess(baseValidationResult)) {
				const baseResult = baseValidationResult.data as EnhancedConfigurationValidationResult;
				validationResults.push({
					...baseResult,
					projectContext: {
						projectId,
						projectName: targetConfig.name || 'Unnamed Project',
						currentPhase: targetConfig.currentPhase || 'Phase0_StrategicCharter',
						templateId: targetConfig.templateId,
						schemaId: options.schemaId
					}
				});
			}

			// Template compatibility validation
			if (options.templateValidation && targetConfig.templateId) {
				const templateValidation = await this.validateTemplateCompatibility(
					projectId,
					targetConfig,
					targetConfig.templateId
				);
				
				if (isApiSuccess(templateValidation)) {
					validationResults.push({
						...validationResults[0],
						templateValidation: templateValidation.data
					});
				}
			}

			// Phase progression validation
			if (options.phaseValidation) {
				const phaseValidation = await this.validatePhaseProgression(
					projectId,
					targetConfig
				);
				
				if (isApiSuccess(phaseValidation)) {
					validationResults.push({
						...validationResults[0],
						phaseValidation: phaseValidation.data
					});
				}
			}

			// Dependency validation
			if (options.dependencyValidation) {
				const dependencyValidation = await this.validateProjectDependencies(
					projectId,
					targetConfig
				);
				
				if (isApiSuccess(dependencyValidation)) {
					validationResults.push({
						...validationResults[0],
						dependencyValidation: dependencyValidation.data
					});
				}
			}

			// Emit validation event
			if (this.options.enableProjectEvents) {
				await this.emitProjectEvent({
					eventId: crypto.randomUUID() as UUID,
					projectId,
					timestamp: new Date().toISOString(),
					type: 'validated',
					source: 'system',
					data: {
						validationResults
					},
					metadata: {
						clientVersion: '1.3.0',
						additionalData: {
							validationTypes: Object.keys(options),
							resultCount: validationResults.length
						}
					}
				});
			}

			this.logger.info('Project configuration validation completed', {
				projectId,
				resultCount: validationResults.length,
				hasErrors: validationResults.some(r => r.errors.length > 0),
				hasWarnings: validationResults.some(r => r.warnings.length > 0)
			});

			return createApiResponse(validationResults);
		});
	}

	/**
	 * Get project configuration template
	 * Implements Cline's resource retrieval patterns with caching
	 */
	async getConfigurationTemplate(templateId: UUID): Promise<ApiResponse<ProjectConfigurationTemplate>> {
		return wrapAsync(async () => {
			// Check cache first (following Cline's caching strategy)
			const cached = this.templateCache.get(templateId);
			if (cached && Date.now() - cached.timestamp < this.options.templateCacheTtlMs) {
				this.logger.debug('Template retrieved from cache', { templateId });
				return createApiResponse(cached.template);
			}

			// Load template from repository (placeholder - would connect to actual template store)
			const template = await this.loadTemplateFromRepository(templateId);
			
			// Cache the template
			this.templateCache.set(templateId, {
				template,
				timestamp: Date.now()
			});

			// Cleanup cache if it exceeds size limit
			if (this.templateCache.size > this.options.templateCacheSize) {
				const oldestEntry = Array.from(this.templateCache.entries())
					.sort(([,a], [,b]) => a.timestamp - b.timestamp)[0];
				this.templateCache.delete(oldestEntry[0]);
			}

			return createApiResponse(template);
		});
	}

	/**
	 * List available project templates
	 * Following Cline's listing patterns with filtering and pagination
	 */
	async listConfigurationTemplates(
		filters: {
			category?: string;
			complexity?: string;
			tags?: string[];
			compatibility?: string[];
		} = {},
		pagination: {
			offset?: number;
			limit?: number;
		} = {}
	): Promise<ApiResponse<{
		templates: ProjectConfigurationTemplate[];
		total: number;
		hasMore: boolean;
	}>> {
		return wrapAsync(async () => {
			// Load templates with filtering (placeholder implementation)
			const allTemplates = await this.loadAllTemplates();
			
			// Apply filters
			let filteredTemplates = allTemplates;
			
			if (filters.category) {
				filteredTemplates = filteredTemplates.filter(t => t.category === filters.category);
			}
			
			if (filters.complexity) {
				filteredTemplates = filteredTemplates.filter(t => t.metadata.complexity === filters.complexity);
			}
			
			if (filters.tags?.length) {
				filteredTemplates = filteredTemplates.filter(t => 
					filters.tags!.some(tag => t.metadata.tags.includes(tag))
				);
			}
			
			if (filters.compatibility?.length) {
				filteredTemplates = filteredTemplates.filter(t =>
					filters.compatibility!.some(compat => t.metadata.compatibility.includes(compat))
				);
			}
			
			// Apply pagination
			const offset = pagination.offset || 0;
			const limit = pagination.limit || 20;
			const paginatedTemplates = filteredTemplates.slice(offset, offset + limit);
			
			return createApiResponse({
				templates: paginatedTemplates,
				total: filteredTemplates.length,
				hasMore: offset + limit < filteredTemplates.length
			});
		});
	}

	/**
	 * Update project configuration with phase awareness
	 * Extends Cline's update patterns with project lifecycle management
	 */
	async updateProjectConfiguration(
		projectId: UUID,
		updates: ConfigurationUpdateRequest & {
			templateId?: UUID;
			phaseTransition?: {
				fromPhase: PhaseType;
				toPhase: PhaseType;
				validateTransition: boolean;
			};
			dependencyUpdates?: {
				add: string[];
				remove: string[];
				update: Record<string, any>;
			};
		},
		options: {
			validateOnly?: boolean;
			skipEvents?: boolean;
			forceSave?: boolean;
		} = {}
	): Promise<ApiResponse<EnhancedApiConfiguration>> {
		return wrapAsync(async () => {
			this.logger.debug('Updating project configuration', { projectId, updates, options });

			// Phase transition validation
			if (updates.phaseTransition?.validateTransition) {
				const transitionValid = await this.validatePhaseTransition(
					projectId,
					updates.phaseTransition.fromPhase,
					updates.phaseTransition.toPhase
				);
				
				if (!transitionValid) {
					throw new ReadyAIError(
						`Invalid phase transition: ${updates.phaseTransition.fromPhase} -> ${updates.phaseTransition.toPhase}`,
						'PROJECT_CONFIG_INVALID_PHASE_TRANSITION',
						422,
						{ projectId, transition: updates.phaseTransition }
					);
				}
			}

			// Get current configuration for comparison
			const currentResult = await this.configService.getEnhancedConfiguration(projectId);
			if (!isApiSuccess(currentResult)) {
				throw new ReadyAIError(
					`Failed to retrieve current project configuration: ${currentResult.error.message}`,
					'PROJECT_CONFIG_RETRIEVAL_ERROR',
					500,
					{ projectId }
				);
			}

			const currentConfig = currentResult.data;

			// Build update request for enhanced config service
			const enhancedUpdates = {
				...updates,
				updates: {
					...updates.updates,
					lastModified: new Date().toISOString(),
					...(updates.phaseTransition && { currentPhase: updates.phaseTransition.toPhase })
				}
			};

			// Apply update through enhanced config service
			const updateResult = await this.configService.updateEnhancedConfiguration(
				projectId,
				enhancedUpdates,
				{
					validateOnly: options.validateOnly,
					skipEvents: options.skipEvents,
					notifyDependentServices: true
				}
			);

			if (!isApiSuccess(updateResult)) {
				return updateResult;
			}

			// Perform project-specific post-update actions
			if (!options.validateOnly) {
				// Update dependency configurations
				if (updates.dependencyUpdates) {
					await this.updateProjectDependencies(projectId, updates.dependencyUpdates);
				}

				// Emit project-specific event
				if (this.options.enableProjectEvents && !options.skipEvents) {
					await this.emitProjectEvent({
						eventId: crypto.randomUUID() as UUID,
						projectId,
						timestamp: new Date().toISOString(),
						type: updates.phaseTransition ? 'phase_changed' : 'updated',
						source: 'user',
						data: {
							previousConfig: currentConfig,
							newConfig: updateResult.data,
							phase: updates.phaseTransition?.toPhase
						},
						metadata: {
							clientVersion: '1.3.0',
							additionalData: {
								hasPhaseTransition: !!updates.phaseTransition,
								hasDependencyUpdates: !!updates.dependencyUpdates,
								updateFields: Object.keys(updates.updates || {})
							}
						}
					});
				}
			}

			this.logger.info('Project configuration updated', {
				projectId,
				hasPhaseTransition: !!updates.phaseTransition,
				updateFields: Object.keys(updates.updates || {}).length,
				validateOnly: options.validateOnly
			});

			return updateResult;
		});
	}

	/**
	 * Get project configuration health status
	 * Extends Cline's health check patterns with project-specific monitoring
	 */
	async getProjectHealthStatus(projectId: UUID): Promise<ApiResponse<{
		status: 'healthy' | 'degraded' | 'unhealthy';
		checks: Array<{
			name: string;
			status: 'pass' | 'warn' | 'fail';
			message?: string;
			details?: Record<string, any>;
		}>;
		project: {
			id: UUID;
			name: string;
			currentPhase: PhaseType;
			templateId?: UUID;
		};
		lastChecked: string;
	}>> {
		return wrapAsync(async () => {
			const checks: Array<{
				name: string;
				status: 'pass' | 'warn' | 'fail';
				message?: string;
				details?: Record<string, any>;
			}> = [];

			// Get project configuration
			const configResult = await this.configService.getEnhancedConfiguration(projectId);
			if (!isApiSuccess(configResult)) {
				return createApiResponse({
					status: 'unhealthy' as const,
					checks: [{
						name: 'configuration',
						status: 'fail' as const,
						message: `Failed to retrieve configuration: ${configResult.error.message}`
					}],
					project: {
						id: projectId,
						name: 'Unknown',
						currentPhase: 'Phase0_StrategicCharter' as PhaseType
					},
					lastChecked: new Date().toISOString()
				});
			}

			const config = configResult.data;

			// Configuration validity check
			const validationResult = await this.validateProjectConfiguration(projectId, config, {
				templateValidation: !!config.templateId,
				phaseValidation: true,
				dependencyValidation: true
			});

			if (isApiSuccess(validationResult)) {
				const hasErrors = validationResult.data.some(r => r.errors.length > 0);
				const hasWarnings = validationResult.data.some(r => r.warnings.length > 0);

				checks.push({
					name: 'configuration_validation',
					status: hasErrors ? 'fail' : hasWarnings ? 'warn' : 'pass',
					message: hasErrors ? 'Configuration has validation errors' : hasWarnings ? 'Configuration has warnings' : 'Configuration is valid',
					details: {
						errorCount: validationResult.data.reduce((sum, r) => sum + r.errors.length, 0),
						warningCount: validationResult.data.reduce((sum, r) => sum + r.warnings.length, 0)
					}
				});
			}

			// Template compatibility check
			if (config.templateId) {
				const templateResult = await this.getConfigurationTemplate(config.templateId);
				checks.push({
					name: 'template_compatibility',
					status: isApiSuccess(templateResult) ? 'pass' : 'warn',
					message: isApiSuccess(templateResult) ? 'Template is accessible' : 'Template not found or inaccessible'
				});
			}

			// Phase progression check
			const phaseValidation = await this.validatePhaseProgression(projectId, config);
			if (isApiSuccess(phaseValidation)) {
				checks.push({
					name: 'phase_progression',
					status: phaseValidation.data.currentPhaseValid ? 'pass' : 'warn',
					message: phaseValidation.data.currentPhaseValid 
						? 'Current phase is valid' 
						: 'Current phase has issues',
					details: {
						nextPhaseReady: phaseValidation.data.nextPhaseReady,
						blockedTransitions: phaseValidation.data.blockedTransitions
					}
				});
			}

			// Determine overall status
			const failedChecks = checks.filter(c => c.status === 'fail');
			const warnChecks = checks.filter(c => c.status === 'warn');
			
			const overallStatus = failedChecks.length > 0 ? 'unhealthy' :
				warnChecks.length > 0 ? 'degraded' : 'healthy';

			return createApiResponse({
				status: overallStatus,
				checks,
				project: {
					id: projectId,
					name: config.name || 'Unnamed Project',
					currentPhase: config.currentPhase || 'Phase0_StrategicCharter',
					templateId: config.templateId
				},
				lastChecked: new Date().toISOString()
			});
		});
	}

	// Event management methods (following Cline's event patterns)

	/**
	 * Add event listener for project configuration events
	 */
	addEventListener(eventType: string, listener: ProjectConfigurationEventListener): void {
		if (!this.eventListeners.has(eventType)) {
			this.eventListeners.set(eventType, new Set());
		}
		this.eventListeners.get(eventType)!.add(listener);
		
		this.logger.debug('Project config event listener added', { eventType });
	}

	/**
	 * Remove event listener
	 */
	removeEventListener(eventType: string, listener: ProjectConfigurationEventListener): void {
		const listeners = this.eventListeners.get(eventType);
		if (listeners) {
			listeners.delete(listener);
			if (listeners.size === 0) {
				this.eventListeners.delete(eventType);
			}
		}
		
		this.logger.debug('Project config event listener removed', { eventType });
	}

	/**
	 * Emit project configuration event
	 */
	private async emitProjectEvent(event: ProjectConfigurationEvent): Promise<void> {
		const listeners = [
			...(this.eventListeners.get('*') || []),
			...(this.eventListeners.get(event.type) || [])
		];

		await Promise.allSettled(
			listeners.map(async (listener) => {
				try {
					await listener(event);
				} catch (error) {
					this.logger.error('Project event listener error', {
						eventType: event.type,
						error: error instanceof Error ? error.message : 'Unknown error'
					});
				}
			})
		);

		this.logger.debug('Project configuration event emitted', {
			eventType: event.type,
			projectId: event.projectId,
			listenersNotified: listeners.length
		});
	}

	// Private helper methods (following Cline's helper method patterns)

	/**
	 * Validate template compatibility
	 */
	private async validateTemplateCompatibility(
		projectId: UUID,
		config: EnhancedApiConfiguration,
		templateId: UUID
	): Promise<ApiResponse<{
		isCompatible: boolean;
		templateVersion: string;
		requiredUpdates: string[];
		conflicts: string[];
	}>> {
		// Placeholder implementation - would check template version compatibility
		return createApiResponse({
			isCompatible: true,
			templateVersion: '1.0.0',
			requiredUpdates: [],
			conflicts: []
		});
	}

	/**
	 * Validate phase progression
	 */
	private async validatePhaseProgression(
		projectId: UUID,
		config: EnhancedApiConfiguration
	): Promise<ApiResponse<{
		currentPhaseValid: boolean;
		nextPhaseReady: boolean;
		blockedTransitions: PhaseType[];
		recommendedActions: string[];
	}>> {
		// Placeholder implementation - would validate phase requirements
		return createApiResponse({
			currentPhaseValid: true,
			nextPhaseReady: true,
			blockedTransitions: [],
			recommendedActions: []
		});
	}

	/**
	 * Validate project dependencies
	 */
	private async validateProjectDependencies(
		projectId: UUID,
		config: EnhancedApiConfiguration
	): Promise<ApiResponse<{
		satisfied: string[];
		missing: string[];
		conflicting: Array<{
			dependency: string;
			conflict: string;
			resolution: string;
		}>;
	}>> {
		// Placeholder implementation - would check service dependencies
		return createApiResponse({
			satisfied: [],
			missing: [],
			conflicting: []
		});
	}

	/**
	 * Validate phase transition
	 */
	private async validatePhaseTransition(
		projectId: UUID,
		fromPhase: PhaseType,
		toPhase: PhaseType
	): Promise<boolean> {
		// Reuse validation logic from enhanced config service
		const validTransitions: Record<PhaseType, PhaseType[]> = {
			'Phase0_StrategicCharter': ['Phase1_ArchitecturalBlueprint'],
			'Phase1_ArchitecturalBlueprint': ['Phase20_CoreContracts', 'Phase0_StrategicCharter'],
			'Phase20_CoreContracts': ['Phase21_ModuleSpec', 'Phase1_ArchitecturalBlueprint'],
			'Phase21_ModuleSpec': ['Phase23_ModuleSpecSubsequent', 'Phase30_ProjectScaffolding'],
			'Phase23_ModuleSpecSubsequent': ['Phase30_ProjectScaffolding', 'Phase21_ModuleSpec'],
			'Phase30_ProjectScaffolding': ['Phase301_MasterPlan', 'Phase23_ModuleSpecSubsequent'],
			'Phase301_MasterPlan': ['Phase31_FileGeneration', 'Phase30_ProjectScaffolding'],
			'Phase31_FileGeneration': ['Phase4_ValidationCorrection', 'Phase301_MasterPlan'],
			'Phase4_ValidationCorrection': ['Phase5_TestGeneration', 'Phase31_FileGeneration'],
			'Phase5_TestGeneration': ['Phase6_Documentation', 'Phase4_ValidationCorrection'],
			'Phase6_Documentation': ['Phase7_Iteration', 'Phase5_TestGeneration'],
			'Phase7_Iteration': ['Phase31_FileGeneration', 'Phase6_Documentation']
		};

		return validTransitions[fromPhase]?.includes(toPhase) ?? false;
	}

	/**
	 * Update project dependencies
	 */
	private async updateProjectDependencies(
		projectId: UUID,
		updates: {
			add: string[];
			remove: string[];
			update: Record<string, any>;
		}
	): Promise<void> {
		// Placeholder implementation - would update dependency configurations
		this.logger.debug('Updating project dependencies', { projectId, updates });
	}

	/**
	 * Load template from repository
	 */
	private async loadTemplateFromRepository(templateId: UUID): Promise<ProjectConfigurationTemplate> {
		// Placeholder implementation - would load from actual template repository
		return {
			templateId,
			name: 'Default Web App Template',
			description: 'Standard web application template with ReadyAI integration',
			version: '1.0.0',
			category: 'web-app',
			baseConfiguration: {
				...DEFAULT_ENHANCED_CONFIGURATION,
				id: crypto.randomUUID() as UUID,
				name: 'New Project',
				description: 'Project created from template'
			} as EnhancedApiConfiguration,
			phaseConfigurations: {},
			initialization: {
				requiredPhases: ['Phase0_StrategicCharter', 'Phase1_ArchitecturalBlueprint'],
				optionalPhases: [],
				defaultPhase: 'Phase0_StrategicCharter',
				skipValidation: false
			},
			validation: {
				requiredFields: ['name', 'description'],
				conditionalFields: {},
				customValidators: []
			},
			dependencies: {
				requiredServices: ['logging', 'error-handling'],
				optionalServices: ['auth', 'api-gateway'],
				externalApis: []
			},
			metadata: {
				author: 'ReadyAI System',
				created: new Date().toISOString(),
				lastModified: new Date().toISOString(),
				tags: ['web', 'typescript', 'readyai'],
				compatibility: ['1.3.0'],
				complexity: 'intermediate'
			}
		};
	}

	/**
	 * Load all available templates
	 */
	private async loadAllTemplates(): Promise<ProjectConfigurationTemplate[]> {
		// Placeholder implementation - would load from template registry
		const defaultTemplate = await this.loadTemplateFromRepository(crypto.randomUUID() as UUID);
		return [defaultTemplate];
	}

	/**
	 * Start background validation process
	 */
	private startBackgroundValidation(): void {
		// Placeholder for background validation timer
		this.logger.info('Background validation started', {
			intervalMs: this.options.backgroundValidationIntervalMs
		});
	}

	/**
	 * Basic logger implementation (following Cline's pattern)
	 */
	private createBasicLogger(): Logger {
		return {
			info: (message: string, meta?: Record<string, any>) => console.info(`[ProjectConfigService] ${message}`, meta),
			warn: (message: string, meta?: Record<string, any>) => console.warn(`[ProjectConfigService] ${message}`, meta),
			error: (message: string, meta?: Record<string, any>) => console.error(`[ProjectConfigService] ${message}`, meta),
			debug: (message: string, meta?: Record<string, any>) => console.debug(`[ProjectConfigService] ${message}`, meta)
		} as Logger;
	}

	/**
	 * Basic error service implementation (following Cline's pattern)
	 */
	private createBasicErrorService(): ErrorService {
		return {
			captureError: (error: Error, context?: Record<string, any>) => {
				console.error('[ProjectConfigService Error]', error.message, context);
			},
			createErrorResponse: (message: string, code?: string): ApiErrorResponse => 
				createApiError(message, code || 'PROJECT_CONFIG_ERROR'),
			handleConfigurationChange: async (config: any) => {
				// Placeholder implementation
			}
		} as ErrorService;
	}

	/**
	 * Cleanup method for graceful shutdown
	 */
	async dispose(): Promise<void> {
		// Clear timers
		if (this.backgroundValidationTimer) {
			clearInterval(this.backgroundValidationTimer);
		}

		// Clear caches
		this.templateCache.clear();
		this.schemaCache.clear();
		this.validationResults.clear();

		// Remove event listeners
		this.eventListeners.clear();

		this.logger.info('ProjectConfigService disposed');
	}
}

/**
 * Factory function for creating ProjectConfigService
 * Following Cline's factory pattern for service creation
 */
export async function createProjectConfigService(
	configService: EnhancedConfigService,
	options: ProjectConfigServiceOptions & {
		repository?: ConfigRepository;
		normalizer?: ConfigNormalizer;
		logger?: Logger;
		errorService?: ErrorService;
	} = {}
): Promise<ProjectConfigService> {
	const {
		repository,
		normalizer,
		logger,
		errorService,
		...serviceOptions
	} = options;

	// Create default dependencies if not provided
	const configRepository = repository || new ConfigRepository();
	const configNormalizer = normalizer || new ConfigNormalizer();

	// Initialize dependencies if needed
	if (!repository) {
		await configRepository.initialize();
	}
	if (!normalizer) {
		await configNormalizer.initialize();
	}

	return new ProjectConfigService(
		configService,
		configRepository,
		configNormalizer,
		serviceOptions,
		logger,
		errorService
	);
}

export default ProjectConfigService;
