// packages\config\services\ConfigService.ts

/**
 * Configuration Service for ReadyAI Personal AI Development Orchestrator
 * 
 * This module orchestrates configuration management by coordinating between
 * ConfigRepository, ConfigNormalizer, and validation services. Implements
 * Cline's proven service coordination patterns with ~60% reuse while adding
 * ReadyAI-specific phase-aware configuration and business logic.
 * 
 * Key Adaptations from Cline:
 * - Service coordination patterns from Cline's Controller architecture
 * - Error handling and retry mechanisms from Cline's ApiHandler
 * - State management patterns from Cline's StateManager
 * - Event-driven updates from Cline's extension state management
 * 
 * @version 1.0.0
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
	Project
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
	CONFIG_SCHEMA_VERSION
} from '../types/config';

import { ConfigRepository } from '../repositories/ConfigRepository';
import { ConfigNormalizer } from './ConfigNormalizer';

// Placeholder imports for future dependencies
// These will be replaced with actual imports when the services are generated
interface Logger {
	info(message: string, meta?: Record<string, any>): void;
	warn(message: string, meta?: Record<string, any>): void;
	error(message: string, meta?: Record<string, any>): void;
	debug(message: string, meta?: Record<string, any>): void;
}

interface ErrorService {
	captureError(error: Error, context?: Record<string, any>): void;
	createErrorResponse(message: string, code?: string): ApiErrorResponse;
}

// Create basic logger implementation until actual service is available
const createBasicLogger = (): Logger => ({
	info: (message: string, meta?: Record<string, any>) => console.info(`[ConfigService] ${message}`, meta),
	warn: (message: string, meta?: Record<string, any>) => console.warn(`[ConfigService] ${message}`, meta),
	error: (message: string, meta?: Record<string, any>) => console.error(`[ConfigService] ${message}`, meta),
	debug: (message: string, meta?: Record<string, any>) => console.debug(`[ConfigService] ${message}`, meta)
});

// Create basic error service implementation until actual service is available
const createBasicErrorService = (): ErrorService => ({
	captureError: (error: Error, context?: Record<string, any>) => {
		console.error('[ConfigService Error]', error.message, context);
	},
	createErrorResponse: (message: string, code?: string): ApiErrorResponse => 
		createApiError(message, code || 'CONFIGURATION_ERROR')
});

/**
 * Configuration change event for reactive updates
 * Follows Cline's event-driven architecture patterns
 */
export interface ConfigurationChangeEvent {
	/** Unique event identifier */
	eventId: UUID;
	/** Timestamp of the change */
	timestamp: string;
	/** Type of configuration change */
	changeType: 'create' | 'update' | 'delete' | 'reset' | 'phase_change';
	/** Project affected by the change */
	projectId: UUID;
	/** Phase affected (if applicable) */
	phase?: PhaseType;
	/** Previous configuration state */
	previousConfig?: ApiConfiguration;
	/** New configuration state */
	newConfig?: ApiConfiguration;
	/** Change metadata */
	metadata: Record<string, any>;
}

/**
 * Configuration service options for customization
 */
export interface ConfigServiceOptions {
	/** Enable automatic configuration validation */
	enableAutoValidation?: boolean;
	/** Enable configuration change events */
	enableChangeEvents?: boolean;
	/** Maximum retry attempts for failed operations */
	maxRetryAttempts?: number;
	/** Retry delay in milliseconds */
	retryDelayMs?: number;
	/** Enable configuration caching */
	enableCaching?: boolean;
	/** Cache TTL in milliseconds */
	cacheTtlMs?: number;
	/** Enable background configuration sync */
	enableBackgroundSync?: boolean;
}

/**
 * Default service options following Cline's configuration patterns
 */
const DEFAULT_SERVICE_OPTIONS: Required<ConfigServiceOptions> = {
	enableAutoValidation: true,
	enableChangeEvents: true,
	maxRetryAttempts: 3,
	retryDelayMs: 1000,
	enableCaching: true,
	cacheTtlMs: 300000, // 5 minutes
	enableBackgroundSync: false
};

/**
 * Configuration event listener type
 */
export type ConfigurationEventListener = (event: ConfigurationChangeEvent) => void | Promise<void>;

/**
 * Configuration Service - Orchestrates all configuration management operations
 * 
 * This service implements the Facade pattern to coordinate between ConfigRepository,
 * ConfigNormalizer, and validation services. It provides a unified interface for
 * all configuration operations while maintaining ReadyAI's phase-aware business logic.
 * 
 * Key responsibilities:
 * - Configuration CRUD operations with validation
 * - Phase-specific configuration management
 * - Event-driven configuration updates
 * - Configuration backup and restore
 * - Multi-provider API configuration coordination
 * - Error handling and recovery
 */
export class ConfigService implements IConfigurationManager {
	private readonly repository: ConfigRepository;
	private readonly normalizer: ConfigNormalizer;
	private readonly logger: Logger;
	private readonly errorService: ErrorService;
	private readonly options: Required<ConfigServiceOptions>;
	
	// Event management (following Cline's event patterns)
	private readonly eventListeners = new Map<string, Set<ConfigurationEventListener>>();
	
	// Caching layer (adapted from Cline's caching strategies)
	private readonly configCache = new Map<string, { config: ApiConfiguration; timestamp: number }>();
	
	// Retry mechanisms (following Cline's retry patterns)
	private readonly retryOperations = new Map<string, { attempts: number; lastAttempt: number }>();

	constructor(
		repository: ConfigRepository,
		normalizer: ConfigNormalizer,
		options: ConfigServiceOptions = {},
		logger?: Logger,
		errorService?: ErrorService
	) {
		this.repository = repository;
		this.normalizer = normalizer;
		this.logger = logger || createBasicLogger();
		this.errorService = errorService || createBasicErrorService();
		this.options = { ...DEFAULT_SERVICE_OPTIONS, ...options };

		this.logger.info('ConfigService initialized', {
			options: this.options,
			cacheEnabled: this.options.enableCaching,
			eventsEnabled: this.options.enableChangeEvents
		});
	}

	/**
	 * Retrieves configuration for a specific project and phase
	 * Implements Cline's caching patterns with ReadyAI phase-awareness
	 */
	async getConfiguration(projectId: UUID, phase?: PhaseType): Promise<ApiResponse<ApiConfiguration>> {
		return wrapAsync(async () => {
			this.logger.debug('Getting configuration', { projectId, phase });

			// Check cache first (following Cline's caching strategy)
			if (this.options.enableCaching) {
				const cacheKey = this.buildCacheKey(projectId, phase);
				const cached = this.getCachedConfig(cacheKey);
				if (cached) {
					this.logger.debug('Configuration retrieved from cache', { projectId, phase });
					return createApiResponse(cached);
				}
			}

			// Retrieve from repository with retry logic (adapted from Cline's ApiHandler)
			const configResult = await this.executeWithRetry(
				`getConfig_${projectId}_${phase}`,
				async () => {
					if (phase) {
						return await this.repository.getPhaseConfiguration(projectId, phase);
					} else {
						return await this.repository.getConfiguration(projectId);
					}
				}
			);

			if (!isApiSuccess(configResult)) {
				throw new ReadyAIError(
					`Failed to retrieve configuration: ${configResult.error.message}`,
					'CONFIG_RETRIEVAL_ERROR',
					500,
					{ projectId, phase }
				);
			}

			const config = configResult.data;

			// Normalize configuration (leveraging ConfigNormalizer)
			const normalizedResult = await this.normalizer.normalizeConfiguration(config, {
				projectId,
				phase,
				validatePhaseCompatibility: true,
				applyDefaults: true
			});

			if (!isApiSuccess(normalizedResult)) {
				throw new ReadyAIError(
					`Configuration normalization failed: ${normalizedResult.error.message}`,
					'CONFIG_NORMALIZATION_ERROR',
					422,
					{ projectId, phase }
				);
			}

			// Cache the normalized configuration
			if (this.options.enableCaching) {
				const cacheKey = this.buildCacheKey(projectId, phase);
				this.setCachedConfig(cacheKey, normalizedResult.data);
			}

			this.logger.info('Configuration retrieved successfully', { projectId, phase });
			return createApiResponse(normalizedResult.data);
		});
	}

	/**
	 * Updates configuration for a project with validation and event emission
	 * Follows Cline's state update patterns with ReadyAI business logic
	 */
	async updateConfiguration(
		projectId: UUID,
		updates: ConfigurationUpdateRequest,
		options: { validateOnly?: boolean; skipEvents?: boolean } = {}
	): Promise<ApiResponse<ApiConfiguration>> {
		return wrapAsync(async () => {
			this.logger.debug('Updating configuration', { projectId, updates, options });

			// Get current configuration for comparison
			const currentResult = await this.getConfiguration(projectId, updates.phase);
			if (!isApiSuccess(currentResult)) {
				throw new ReadyAIError(
					`Failed to retrieve current configuration: ${currentResult.error.message}`,
					'CONFIG_UPDATE_ERROR',
					500,
					{ projectId }
				);
			}

			const currentConfig = currentResult.data;

			// Apply updates to current configuration
			const updatedConfig: ApiConfiguration = {
				...currentConfig,
				...updates.updates,
				lastModified: new Date().toISOString(),
				version: updates.version || currentConfig.version
			};

			// Validate updated configuration
			if (this.options.enableAutoValidation) {
				const validationResult = await this.normalizer.validateConfiguration(
					updatedConfig,
					{
						projectId,
						phase: updates.phase,
						strict: true,
						checkPhaseCompatibility: true
					}
				);

				if (!isApiSuccess(validationResult)) {
					throw new ReadyAIError(
						`Configuration validation failed: ${validationResult.error.message}`,
						'CONFIG_VALIDATION_ERROR',
						422,
						{ projectId, phase: updates.phase }
					);
				}

				// Return early if validation-only mode
				if (options.validateOnly) {
					this.logger.debug('Configuration validation completed', { projectId });
					return createApiResponse(updatedConfig);
				}
			}

			// Normalize the updated configuration
			const normalizedResult = await this.normalizer.normalizeConfiguration(
				updatedConfig,
				{
					projectId,
					phase: updates.phase,
					validatePhaseCompatibility: true,
					applyDefaults: false // Preserve explicit user settings
				}
			);

			if (!isApiSuccess(normalizedResult)) {
				throw new ReadyAIError(
					`Configuration normalization failed: ${normalizedResult.error.message}`,
					'CONFIG_NORMALIZATION_ERROR',
					422,
					{ projectId }
				);
			}

			// Persist the configuration with retry logic
			const saveResult = await this.executeWithRetry(
				`updateConfig_${projectId}_${updates.phase}`,
				async () => {
					return await this.repository.updateConfiguration(
						projectId,
						normalizedResult.data,
						{
							phase: updates.phase,
							createBackup: true,
							validateBeforeSave: false // Already validated
						}
					);
				}
			);

			if (!isApiSuccess(saveResult)) {
				throw new ReadyAIError(
					`Failed to save configuration: ${saveResult.error.message}`,
					'CONFIG_SAVE_ERROR',
					500,
					{ projectId }
				);
			}

			// Update cache
			if (this.options.enableCaching) {
				const cacheKey = this.buildCacheKey(projectId, updates.phase);
				this.setCachedConfig(cacheKey, saveResult.data);
			}

			// Emit configuration change event (following Cline's event patterns)
			if (this.options.enableChangeEvents && !options.skipEvents) {
				await this.emitConfigurationChange({
					eventId: crypto.randomUUID() as UUID,
					timestamp: new Date().toISOString(),
					changeType: 'update',
					projectId,
					phase: updates.phase,
					previousConfig: currentConfig,
					newConfig: saveResult.data,
					metadata: {
						updatedFields: Object.keys(updates.updates),
						validationEnabled: this.options.enableAutoValidation
					}
				});
			}

			this.logger.info('Configuration updated successfully', { 
				projectId, 
				phase: updates.phase,
				fieldsUpdated: Object.keys(updates.updates).length
			});

			return createApiResponse(saveResult.data);
		});
	}

	/**
	 * Creates a new phase configuration for a project
	 * Implements ReadyAI's phase-specific configuration logic
	 */
	async createPhaseConfiguration(
		projectId: UUID,
		phase: PhaseType,
		config: Partial<PhaseConfiguration>
	): Promise<ApiResponse<PhaseConfiguration>> {
		return wrapAsync(async () => {
			this.logger.debug('Creating phase configuration', { projectId, phase });

			// Build complete phase configuration from defaults and provided config
			const phaseConfig: PhaseConfiguration = {
				...PHASE_CONFIGURATION_DEFAULTS[phase],
				...config,
				phase,
				projectId,
				createdAt: new Date().toISOString(),
				lastModified: new Date().toISOString(),
				version: CONFIG_SCHEMA_VERSION
			};

			// Validate phase configuration
			const validationResult = await this.normalizer.validatePhaseConfiguration(
				phaseConfig,
				{ strict: true, checkDependencies: true }
			);

			if (!isApiSuccess(validationResult)) {
				throw new ReadyAIError(
					`Phase configuration validation failed: ${validationResult.error.message}`,
					'PHASE_CONFIG_VALIDATION_ERROR',
					422,
					{ projectId, phase }
				);
			}

			// Save phase configuration
			const saveResult = await this.executeWithRetry(
				`createPhaseConfig_${projectId}_${phase}`,
				async () => {
					return await this.repository.createPhaseConfiguration(projectId, phase, phaseConfig);
				}
			);

			if (!isApiSuccess(saveResult)) {
				throw new ReadyAIError(
					`Failed to save phase configuration: ${saveResult.error.message}`,
					'PHASE_CONFIG_SAVE_ERROR',
					500,
					{ projectId, phase }
				);
			}

			// Emit configuration change event
			if (this.options.enableChangeEvents) {
				await this.emitConfigurationChange({
					eventId: crypto.randomUUID() as UUID,
					timestamp: new Date().toISOString(),
					changeType: 'create',
					projectId,
					phase,
					previousConfig: undefined,
					newConfig: undefined, // Phase config, not full API config
					metadata: {
						phaseConfigCreated: true,
						phase: phase
					}
				});
			}

			this.logger.info('Phase configuration created successfully', { projectId, phase });
			return createApiResponse(saveResult.data);
		});
	}

	/**
	 * Retrieves all phase configurations for a project
	 */
	async getPhaseConfigurations(projectId: UUID): Promise<ApiResponse<PhaseConfigurationMap>> {
		return wrapAsync(async () => {
			this.logger.debug('Getting all phase configurations', { projectId });

			const result = await this.executeWithRetry(
				`getPhaseConfigs_${projectId}`,
				async () => {
					return await this.repository.getPhaseConfigurations(projectId);
				}
			);

			if (!isApiSuccess(result)) {
				throw new ReadyAIError(
					`Failed to retrieve phase configurations: ${result.error.message}`,
					'PHASE_CONFIGS_RETRIEVAL_ERROR',
					500,
					{ projectId }
				);
			}

			this.logger.info('Phase configurations retrieved successfully', { 
				projectId, 
				phaseCount: Object.keys(result.data).length 
			});

			return createApiResponse(result.data);
		});
	}

	/**
	 * Switches project to a different phase with configuration validation
	 * Implements ReadyAI's phase transition business logic
	 */
	async switchPhase(
		projectId: UUID,
		fromPhase: PhaseType,
		toPhase: PhaseType,
		options: { validateTransition?: boolean } = {}
	): Promise<ApiResponse<ApiConfiguration>> {
		return wrapAsync(async () => {
			this.logger.debug('Switching project phase', { projectId, fromPhase, toPhase });

			// Validate phase transition if required
			if (options.validateTransition !== false) {
				const transitionValid = this.validatePhaseTransition(fromPhase, toPhase);
				if (!transitionValid) {
					throw new ReadyAIError(
						`Invalid phase transition from ${fromPhase} to ${toPhase}`,
						'INVALID_PHASE_TRANSITION',
						422,
						{ projectId, fromPhase, toPhase }
					);
				}
			}

			// Get current configuration
			const currentResult = await this.getConfiguration(projectId, fromPhase);
			if (!isApiSuccess(currentResult)) {
				throw new ReadyAIError(
					`Failed to retrieve current phase configuration: ${currentResult.error.message}`,
					'PHASE_SWITCH_ERROR',
					500,
					{ projectId, fromPhase }
				);
			}

			// Get target phase configuration or create default
			const targetResult = await this.getConfiguration(projectId, toPhase);
			let targetConfig: ApiConfiguration;

			if (!isApiSuccess(targetResult)) {
				// Create default configuration for target phase
				const defaultPhaseConfig = PHASE_CONFIGURATION_DEFAULTS[toPhase];
				targetConfig = {
					...currentResult.data,
					...defaultPhaseConfig,
					phase: toPhase,
					lastModified: new Date().toISOString()
				};
			} else {
				targetConfig = targetResult.data;
			}

			// Update project's current phase
			const updateResult = await this.updateConfiguration(
				projectId,
				{
					phase: toPhase,
					updates: {
						currentPhase: toPhase,
						...targetConfig
					},
					version: targetConfig.version
				},
				{ skipEvents: true } // We'll emit a custom phase change event
			);

			if (!isApiSuccess(updateResult)) {
				throw new ReadyAIError(
					`Failed to update configuration for phase switch: ${updateResult.error.message}`,
					'PHASE_SWITCH_UPDATE_ERROR',
					500,
					{ projectId, toPhase }
				);
			}

			// Emit phase change event
			if (this.options.enableChangeEvents) {
				await this.emitConfigurationChange({
					eventId: crypto.randomUUID() as UUID,
					timestamp: new Date().toISOString(),
					changeType: 'phase_change',
					projectId,
					phase: toPhase,
					previousConfig: currentResult.data,
					newConfig: updateResult.data,
					metadata: {
						fromPhase,
						toPhase,
						transitionValidated: options.validateTransition !== false
					}
				});
			}

			this.logger.info('Phase switch completed successfully', { 
				projectId, 
				fromPhase, 
				toPhase 
			});

			return createApiResponse(updateResult.data);
		});
	}

	/**
	 * Creates a backup of project configuration
	 * Follows Cline's backup patterns with ReadyAI-specific metadata
	 */
	async backupConfiguration(projectId: UUID, reason?: string): Promise<ApiResponse<ConfigurationBackup>> {
		return wrapAsync(async () => {
			this.logger.debug('Creating configuration backup', { projectId, reason });

			const result = await this.executeWithRetry(
				`backupConfig_${projectId}`,
				async () => {
					return await this.repository.createBackup(projectId, reason);
				}
			);

			if (!isApiSuccess(result)) {
				throw new ReadyAIError(
					`Failed to create configuration backup: ${result.error.message}`,
					'CONFIG_BACKUP_ERROR',
					500,
					{ projectId }
				);
			}

			this.logger.info('Configuration backup created successfully', { 
				projectId, 
				backupId: result.data.id 
			});

			return createApiResponse(result.data);
		});
	}

	/**
	 * Restores configuration from a backup
	 */
	async restoreConfiguration(
		projectId: UUID, 
		backupId: UUID,
		options: { validateRestore?: boolean } = {}
	): Promise<ApiResponse<ApiConfiguration>> {
		return wrapAsync(async () => {
			this.logger.debug('Restoring configuration from backup', { projectId, backupId });

			const result = await this.executeWithRetry(
				`restoreConfig_${projectId}_${backupId}`,
				async () => {
					return await this.repository.restoreFromBackup(projectId, backupId);
				}
			);

			if (!isApiSuccess(result)) {
				throw new ReadyAIError(
					`Failed to restore configuration: ${result.error.message}`,
					'CONFIG_RESTORE_ERROR',
					500,
					{ projectId, backupId }
				);
			}

			// Validate restored configuration if requested
			if (options.validateRestore) {
				const validationResult = await this.normalizer.validateConfiguration(
					result.data,
					{ projectId, strict: true }
				);

				if (!isApiSuccess(validationResult)) {
					this.logger.warn('Restored configuration validation failed', {
						projectId,
						backupId,
						validationErrors: validationResult.error.message
					});
				}
			}

			// Clear cache to force refresh
			if (this.options.enableCaching) {
				this.clearProjectCache(projectId);
			}

			this.logger.info('Configuration restored successfully', { projectId, backupId });
			return createApiResponse(result.data);
		});
	}

	/**
	 * Validates configuration without saving
	 */
	async validateConfiguration(
		config: ApiConfiguration, 
		context: { projectId: UUID; phase?: PhaseType; strict?: boolean }
	): Promise<ApiResponse<ConfigurationValidationResult>> {
		return wrapAsync(async () => {
			this.logger.debug('Validating configuration', { 
				projectId: context.projectId, 
				phase: context.phase 
			});

			const result = await this.normalizer.validateConfiguration(config, {
				projectId: context.projectId,
				phase: context.phase,
				strict: context.strict ?? true,
				checkPhaseCompatibility: true
			});

			this.logger.debug('Configuration validation completed', { 
				projectId: context.projectId,
				isValid: isApiSuccess(result)
			});

			return result;
		});
	}

	/**
	 * Event Management - Subscribe to configuration changes
	 * Follows Cline's event subscription patterns
	 */
	subscribe(eventType: string, listener: ConfigurationEventListener): () => void {
		if (!this.eventListeners.has(eventType)) {
			this.eventListeners.set(eventType, new Set());
		}
		
		this.eventListeners.get(eventType)!.add(listener);
		
		this.logger.debug('Event listener subscribed', { eventType });

		// Return unsubscribe function
		return () => {
			this.eventListeners.get(eventType)?.delete(listener);
			this.logger.debug('Event listener unsubscribed', { eventType });
		};
	}

	/**
	 * Clear all cached configurations for a project
	 */
	clearProjectCache(projectId: UUID): void {
		const keysToDelete: string[] = [];
		
		for (const [key] of this.configCache) {
			if (key.startsWith(projectId)) {
				keysToDelete.push(key);
			}
		}
		
		keysToDelete.forEach(key => this.configCache.delete(key));
		
		this.logger.debug('Project cache cleared', { projectId, keysCleared: keysToDelete.length });
	}

	/**
	 * Get service health status
	 * Follows Cline's service health patterns
	 */
	async getHealthStatus(): Promise<ApiResponse<{
		status: 'healthy' | 'degraded' | 'unhealthy';
		dependencies: Record<string, 'healthy' | 'unhealthy'>;
		metrics: {
			cacheSize: number;
			activeEventListeners: number;
			retryOperations: number;
		};
	}>> {
		return wrapAsync(async () => {
			const repositoryHealth = await this.repository.healthCheck();
			const normalizerHealth = await this.normalizer.healthCheck();

			const status = isApiSuccess(repositoryHealth) && isApiSuccess(normalizerHealth) 
				? 'healthy' 
				: 'degraded';

			return createApiResponse({
				status,
				dependencies: {
					repository: isApiSuccess(repositoryHealth) ? 'healthy' : 'unhealthy',
					normalizer: isApiSuccess(normalizerHealth) ? 'healthy' : 'unhealthy'
				},
				metrics: {
					cacheSize: this.configCache.size,
					activeEventListeners: Array.from(this.eventListeners.values())
						.reduce((sum, set) => sum + set.size, 0),
					retryOperations: this.retryOperations.size
				}
			});
		});
	}

	// Private helper methods

	/**
	 * Execute operation with retry logic (adapted from Cline's ApiHandler)
	 */
	private async executeWithRetry<T>(
		operationId: string,
		operation: () => Promise<ApiResponse<T>>
	): Promise<ApiResponse<T>> {
		let lastError: ReadyAIError | undefined;
		
		for (let attempt = 1; attempt <= this.options.maxRetryAttempts; attempt++) {
			try {
				const result = await operation();
				
				// Clear retry tracking on success
				this.retryOperations.delete(operationId);
				
				return result;
			} catch (error) {
				lastError = error instanceof ReadyAIError 
					? error 
					: new ReadyAIError(
						`Operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
						'OPERATION_ERROR',
						500
					);

				this.retryOperations.set(operationId, { 
					attempts: attempt, 
					lastAttempt: Date.now() 
				});

				if (attempt < this.options.maxRetryAttempts) {
					this.logger.warn(`Operation retry ${attempt}/${this.options.maxRetryAttempts}`, {
						operationId,
						error: lastError.message
					});
					
					await new Promise(resolve => setTimeout(resolve, this.options.retryDelayMs));
				}
			}
		}

		this.errorService.captureError(lastError!, { operationId });
		throw lastError;
	}

	/**
	 * Build cache key for configuration
	 */
	private buildCacheKey(projectId: UUID, phase?: PhaseType): string {
		return phase ? `${projectId}:${phase}` : projectId;
	}

	/**
	 * Get cached configuration if valid
	 */
	private getCachedConfig(cacheKey: string): ApiConfiguration | null {
		const cached = this.configCache.get(cacheKey);
		
		if (!cached) return null;
		
		const now = Date.now();
		if (now - cached.timestamp > this.options.cacheTtlMs) {
			this.configCache.delete(cacheKey);
			return null;
		}
		
		return cached.config;
	}

	/**
	 * Set cached configuration
	 */
	private setCachedConfig(cacheKey: string, config: ApiConfiguration): void {
		this.configCache.set(cacheKey, {
			config,
			timestamp: Date.now()
		});
	}

	/**
	 * Validate phase transition logic
	 * Implements ReadyAI's phase dependency rules
	 */
	private validatePhaseTransition(fromPhase: PhaseType, toPhase: PhaseType): boolean {
		// Define valid phase transitions based on ReadyAI's 7-phase methodology
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
			'Phase7_Iteration': ['Phase31_FileGeneration', 'Phase6_Documentation'] // Allow iteration loops
		};

		return validTransitions[fromPhase]?.includes(toPhase) ?? false;
	}

	/**
	 * Emit configuration change event to all listeners
	 */
	private async emitConfigurationChange(event: ConfigurationChangeEvent): Promise<void> {
		const listeners = [
			...(this.eventListeners.get('*') || []),
			...(this.eventListeners.get(event.changeType) || [])
		];

		await Promise.allSettled(
			listeners.map(async (listener) => {
				try {
					await listener(event);
				} catch (error) {
					this.logger.error('Event listener error', {
						eventType: event.changeType,
						error: error instanceof Error ? error.message : 'Unknown error'
					});
				}
			})
		);

		this.logger.debug('Configuration change event emitted', {
			eventType: event.changeType,
			projectId: event.projectId,
			listenersNotified: listeners.length
		});
	}
}

/**
 * Factory function to create ConfigService with default dependencies
 * Follows Cline's service factory patterns
 */
export async function createConfigService(
	options: ConfigServiceOptions & {
		repository?: ConfigRepository;
		normalizer?: ConfigNormalizer;
		logger?: Logger;
		errorService?: ErrorService;
	} = {}
): Promise<ConfigService> {
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

	// Initialize dependencies
	await configRepository.initialize();
	await configNormalizer.initialize();

	return new ConfigService(
		configRepository,
		configNormalizer,
		serviceOptions,
		logger,
		errorService
	);
}

export default ConfigService;
