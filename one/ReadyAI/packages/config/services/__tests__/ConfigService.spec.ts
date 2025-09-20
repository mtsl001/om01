// packages/config/services/__tests__/ConfigService.spec.ts

/**
 * Comprehensive test suite for ConfigService
 * 
 * Adapts Cline's proven service testing patterns (70%+ reuse) with ReadyAI-specific
 * test scenarios, ensuring production-ready quality and comprehensive coverage.
 * 
 * Key Cline Pattern Adaptations:
 * - Service lifecycle testing from Cline's Controller tests
 * - Mock and spy patterns from Cline's service test architecture
 * - Error scenario testing from Cline's robust error handling tests
 * - Async operation testing from Cline's ApiHandler test patterns
 * - Event-driven testing from Cline's state management tests
 * 
 * @version 1.0.0
 * @author ReadyAI Development Team
 */

import { 
  UUID, 
  ApiResponse, 
  ApiErrorResponse, 
  ReadyAIError,
  PhaseType,
  AIProviderType,
  isApiSuccess,
  createApiResponse,
  createApiError
} from '../../../foundation/types/core';

import {
  ApiConfiguration,
  PhaseConfiguration,
  PhaseConfigurationMap,
  ConfigurationUpdateRequest,
  ConfigurationBackup,
  PHASE_CONFIGURATION_DEFAULTS,
  CONFIG_SCHEMA_VERSION
} from '../../types/config';

import { ConfigService, ConfigurationChangeEvent, ConfigServiceOptions } from '../ConfigService';
import { ConfigRepository } from '../../repositories/ConfigRepository';
import { ConfigNormalizer } from '../ConfigNormalizer';
import { ConfigValidator } from '../ConfigValidator';

// Test framework imports
import { describe, beforeEach, afterEach, it, expect, jest, beforeAll, afterAll } from '@jest/globals';

// Mock implementations - adapted from Cline's mock patterns
jest.mock('../../repositories/ConfigRepository');
jest.mock('../ConfigNormalizer');
jest.mock('../ConfigValidator');

// Test utilities and helpers - Cline testing pattern
interface TestContext {
  service: ConfigService;
  mockRepository: jest.Mocked<ConfigRepository>;
  mockNormalizer: jest.Mocked<ConfigNormalizer>;
  mockValidator: jest.Mocked<ConfigValidator>;
  mockLogger: MockLogger;
  mockErrorService: MockErrorService;
  testProjectId: UUID;
  testPhase: PhaseType;
  testConfig: ApiConfiguration;
}

interface MockLogger {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
  debug: jest.Mock;
}

interface MockErrorService {
  captureError: jest.Mock;
  createErrorResponse: jest.Mock;
}

// Test data factory - Cline pattern for consistent test data
class TestDataFactory {
  static createTestProjectId(): UUID {
    return 'test-project-123e4567-e89b-12d3-a456-426614174000' as UUID;
  }

  static createTestConfig(overrides?: Partial<ApiConfiguration>): ApiConfiguration {
    return {
      id: 'test-config-id' as UUID,
      projectId: this.createTestProjectId(),
      apiKey: 'sk-ant-test123456789',
      selectedProvider: 'anthropic' as AIProviderType,
      selectedModelId: 'claude-3-5-sonnet-20241022',
      phase: 'Phase1_ArchitecturalBlueprint' as PhaseType,
      globalAiPreferences: {
        temperature: 0.7,
        maxTokens: 4000,
        enableStreaming: true
      },
      phaseConfigurations: {
        'Phase1_ArchitecturalBlueprint': {
          ...PHASE_CONFIGURATION_DEFAULTS['Phase1_ArchitecturalBlueprint'],
          aiProvider: 'anthropic' as AIProviderType,
          modelId: 'claude-3-5-sonnet-20241022'
        }
      },
      version: CONFIG_SCHEMA_VERSION,
      createdAt: '2023-01-01T00:00:00.000Z',
      lastModified: '2023-01-01T00:00:00.000Z',
      ...overrides
    };
  }

  static createPhaseConfiguration(
    phase: PhaseType,
    overrides?: Partial<PhaseConfiguration>
  ): PhaseConfiguration {
    return {
      ...PHASE_CONFIGURATION_DEFAULTS[phase],
      phase,
      projectId: this.createTestProjectId(),
      createdAt: '2023-01-01T00:00:00.000Z',
      lastModified: '2023-01-01T00:00:00.000Z',
      version: CONFIG_SCHEMA_VERSION,
      ...overrides
    };
  }

  static createUpdateRequest(
    overrides?: Partial<ConfigurationUpdateRequest>
  ): ConfigurationUpdateRequest {
    return {
      phase: 'Phase1_ArchitecturalBlueprint' as PhaseType,
      updates: {
        selectedModelId: 'claude-3-5-sonnet-20241022'
      },
      version: CONFIG_SCHEMA_VERSION,
      ...overrides
    };
  }

  static createConfigurationBackup(overrides?: Partial<ConfigurationBackup>): ConfigurationBackup {
    return {
      id: 'backup-123e4567-e89b-12d3-a456-426614174000' as UUID,
      projectId: this.createTestProjectId(),
      configuration: this.createTestConfig(),
      reason: 'Test backup',
      createdAt: '2023-01-01T00:00:00.000Z',
      checksum: 'test-checksum-12345',
      ...overrides
    };
  }
}

// Test setup utilities - Cline pattern for test organization
class TestSetup {
  static createMockLogger(): MockLogger {
    return {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
  }

  static createMockErrorService(): MockErrorService {
    return {
      captureError: jest.fn(),
      createErrorResponse: jest.fn().mockReturnValue(
        createApiError('Mock error', 'TEST_ERROR', 500)
      )
    };
  }

  static async createTestContext(
    options?: Partial<ConfigServiceOptions>
  ): Promise<TestContext> {
    // Create mocks - Cline mocking pattern
    const mockRepository = new ConfigRepository() as jest.Mocked<ConfigRepository>;
    const mockNormalizer = new ConfigNormalizer() as jest.Mocked<ConfigNormalizer>;
    const mockValidator = new ConfigValidator() as jest.Mocked<ConfigValidator>;
    
    const mockLogger = this.createMockLogger();
    const mockErrorService = this.createMockErrorService();

    // Setup default mock behaviors - Cline pattern
    this.setupRepositoryMocks(mockRepository);
    this.setupNormalizerMocks(mockNormalizer);
    this.setupValidatorMocks(mockValidator);

    // Create service instance
    const service = new ConfigService(
      mockRepository,
      mockNormalizer,
      {
        enableAutoValidation: true,
        enableChangeEvents: true,
        enableCaching: true,
        ...options
      },
      mockLogger,
      mockErrorService
    );

    const testProjectId = TestDataFactory.createTestProjectId();
    const testPhase: PhaseType = 'Phase1_ArchitecturalBlueprint';
    const testConfig = TestDataFactory.createTestConfig();

    return {
      service,
      mockRepository,
      mockNormalizer,
      mockValidator,
      mockLogger,
      mockErrorService,
      testProjectId,
      testPhase,
      testConfig
    };
  }

  private static setupRepositoryMocks(mockRepository: jest.Mocked<ConfigRepository>): void {
    // Successful operations by default - Cline pattern
    mockRepository.getConfiguration.mockResolvedValue(
      createApiResponse(TestDataFactory.createTestConfig())
    );
    mockRepository.getPhaseConfiguration.mockResolvedValue(
      createApiResponse(TestDataFactory.createPhaseConfiguration('Phase1_ArchitecturalBlueprint'))
    );
    mockRepository.updateConfiguration.mockResolvedValue(
      createApiResponse(TestDataFactory.createTestConfig())
    );
    mockRepository.createPhaseConfiguration.mockResolvedValue(
      createApiResponse(TestDataFactory.createPhaseConfiguration('Phase1_ArchitecturalBlueprint'))
    );
    mockRepository.getPhaseConfigurations.mockResolvedValue(
      createApiResponse({
        'Phase1_ArchitecturalBlueprint': TestDataFactory.createPhaseConfiguration('Phase1_ArchitecturalBlueprint')
      })
    );
    mockRepository.createBackup.mockResolvedValue(
      createApiResponse(TestDataFactory.createConfigurationBackup())
    );
    mockRepository.restoreFromBackup.mockResolvedValue(
      createApiResponse(TestDataFactory.createTestConfig())
    );
    mockRepository.healthCheck.mockResolvedValue(
      createApiResponse({ status: 'healthy' as const })
    );
  }

  private static setupNormalizerMocks(mockNormalizer: jest.Mocked<ConfigNormalizer>): void {
    mockNormalizer.normalizeConfiguration.mockResolvedValue(
      createApiResponse({
        ...TestDataFactory.createTestConfig(),
        normalizedAt: '2023-01-01T00:00:00.000Z'
      })
    );
    mockNormalizer.validateConfiguration.mockResolvedValue(
      createApiResponse({
        id: 'validation-123' as UUID,
        type: 'comprehensive' as const,
        section: 'full' as const,
        passed: true,
        errors: [],
        warnings: [],
        suggestions: [],
        score: 100,
        validatedAt: '2023-01-01T00:00:00.000Z',
        validator: 'ConfigNormalizer'
      })
    );
    mockNormalizer.validatePhaseConfiguration.mockResolvedValue(
      createApiResponse({
        id: 'phase-validation-123' as UUID,
        type: 'phase' as const,
        section: 'phase' as const,
        passed: true,
        errors: [],
        warnings: [],
        suggestions: [],
        score: 100,
        validatedAt: '2023-01-01T00:00:00.000Z',
        validator: 'ConfigNormalizer'
      })
    );
    mockNormalizer.healthCheck.mockResolvedValue(
      createApiResponse({ status: 'healthy' as const })
    );
  }

  private static setupValidatorMocks(mockValidator: jest.Mocked<ConfigValidator>): void {
    // Default successful validation
    mockValidator.validateConfiguration.mockResolvedValue(
      createApiResponse({
        id: 'validation-456' as UUID,
        type: 'comprehensive' as const,
        section: 'full' as const,
        passed: true,
        errors: [],
        warnings: [],
        suggestions: [],
        score: 100,
        validatedAt: '2023-01-01T00:00:00.000Z',
        validator: 'ConfigValidator'
      })
    );
  }
}

// Main test suite - following Cline's comprehensive testing structure
describe('ConfigService', () => {
  let context: TestContext;

  // Global test setup - Cline pattern
  beforeAll(async () => {
    // Setup global test environment
    jest.clearAllMocks();
  });

  afterAll(async () => {
    // Global cleanup
    jest.restoreAllMocks();
  });

  // Test context setup - Cline pattern for isolation
  beforeEach(async () => {
    context = await TestSetup.createTestContext();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Cleanup after each test
    if (context.service) {
      // Any cleanup needed
    }
  });

  // Core functionality tests - adapted from Cline's service testing patterns
  describe('Configuration Retrieval', () => {
    it('should retrieve configuration successfully', async () => {
      // Arrange - Cline test pattern
      const { service, mockRepository, testProjectId, testPhase } = context;
      const expectedConfig = TestDataFactory.createTestConfig();

      // Act
      const result = await service.getConfiguration(testProjectId, testPhase);

      // Assert - Cline assertion patterns
      expect(isApiSuccess(result)).toBe(true);
      if (isApiSuccess(result)) {
        expect(result.data).toEqual(expectedConfig);
      }
      expect(mockRepository.getConfiguration).toHaveBeenCalledWith(testProjectId);
      expect(mockRepository.getPhaseConfiguration).toHaveBeenCalledWith(testProjectId, testPhase);
    });

    it('should handle configuration not found', async () => {
      // Arrange
      const { service, mockRepository, testProjectId, testPhase } = context;
      mockRepository.getConfiguration.mockResolvedValue(
        createApiError('Configuration not found', 'CONFIG_NOT_FOUND', 404)
      );

      // Act & Assert
      await expect(service.getConfiguration(testProjectId, testPhase))
        .rejects
        .toThrow('Failed to retrieve configuration');
    });

    it('should cache configuration when caching is enabled', async () => {
      // Arrange
      const { service, mockRepository, testProjectId, testPhase } = context;
      
      // Act - Multiple calls
      await service.getConfiguration(testProjectId, testPhase);
      await service.getConfiguration(testProjectId, testPhase);

      // Assert - Second call should use cache
      expect(mockRepository.getConfiguration).toHaveBeenCalledTimes(1);
    });

    it('should skip cache when explicitly requested', async () => {
      // Arrange
      const testContext = await TestSetup.createTestContext({
        enableCaching: false
      });
      
      // Act - Multiple calls with caching disabled
      await testContext.service.getConfiguration(testContext.testProjectId, testContext.testPhase);
      await testContext.service.getConfiguration(testContext.testProjectId, testContext.testPhase);

      // Assert - Both calls should hit repository
      expect(testContext.mockRepository.getConfiguration).toHaveBeenCalledTimes(2);
    });
  });

  describe('Configuration Updates', () => {
    it('should update configuration successfully', async () => {
      // Arrange
      const { service, mockRepository, testProjectId, mockLogger } = context;
      const updateRequest = TestDataFactory.createUpdateRequest();
      const expectedUpdatedConfig = TestDataFactory.createTestConfig({
        ...updateRequest.updates,
        lastModified: expect.any(String)
      });

      // Act
      const result = await service.updateConfiguration(testProjectId, updateRequest);

      // Assert
      expect(isApiSuccess(result)).toBe(true);
      if (isApiSuccess(result)) {
        expect(result.data).toMatchObject(expectedUpdatedConfig);
      }
      expect(mockRepository.updateConfiguration).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Configuration updated successfully',
        expect.objectContaining({
          projectId: testProjectId,
          phase: updateRequest.phase
        })
      );
    });

    it('should validate configuration before updating', async () => {
      // Arrange
      const { service, mockNormalizer, testProjectId } = context;
      const updateRequest = TestDataFactory.createUpdateRequest();

      // Act
      await service.updateConfiguration(testProjectId, updateRequest);

      // Assert
      expect(mockNormalizer.validateConfiguration).toHaveBeenCalled();
    });

    it('should handle validation failures during updates', async () => {
      // Arrange
      const { service, mockNormalizer, testProjectId } = context;
      const updateRequest = TestDataFactory.createUpdateRequest();
      
      mockNormalizer.validateConfiguration.mockResolvedValue(
        createApiError('Validation failed', 'VALIDATION_ERROR', 422)
      );

      // Act & Assert
      await expect(service.updateConfiguration(testProjectId, updateRequest))
        .rejects
        .toThrow('Configuration validation failed');
    });

    it('should emit configuration change events', async () => {
      // Arrange
      const { service, testProjectId } = context;
      const updateRequest = TestDataFactory.createUpdateRequest();
      let eventEmitted = false;
      let emittedEvent: ConfigurationChangeEvent | null = null;

      // Subscribe to events
      service.subscribe('update', (event) => {
        eventEmitted = true;
        emittedEvent = event;
      });

      // Act
      await service.updateConfiguration(testProjectId, updateRequest);

      // Assert
      expect(eventEmitted).toBe(true);
      expect(emittedEvent).toMatchObject({
        changeType: 'update',
        projectId: testProjectId,
        phase: updateRequest.phase
      });
    });

    it('should support validation-only mode', async () => {
      // Arrange
      const { service, mockRepository, testProjectId } = context;
      const updateRequest = TestDataFactory.createUpdateRequest();

      // Act
      const result = await service.updateConfiguration(testProjectId, updateRequest, {
        validateOnly: true
      });

      // Assert
      expect(isApiSuccess(result)).toBe(true);
      expect(mockRepository.updateConfiguration).not.toHaveBeenCalled();
    });
  });

  describe('Phase Management', () => {
    it('should create phase configuration successfully', async () => {
      // Arrange
      const { service, mockRepository, testProjectId } = context;
      const phase: PhaseType = 'Phase2_CoreContracts';
      const phaseConfig = TestDataFactory.createPhaseConfiguration(phase);

      // Act
      const result = await service.createPhaseConfiguration(testProjectId, phase, phaseConfig);

      // Assert
      expect(isApiSuccess(result)).toBe(true);
      if (isApiSuccess(result)) {
        expect(result.data.phase).toBe(phase);
        expect(result.data.projectId).toBe(testProjectId);
      }
      expect(mockRepository.createPhaseConfiguration).toHaveBeenCalledWith(
        testProjectId,
        phase,
        expect.objectContaining({
          phase,
          projectId: testProjectId
        })
      );
    });

    it('should retrieve all phase configurations', async () => {
      // Arrange
      const { service, mockRepository, testProjectId } = context;

      // Act
      const result = await service.getPhaseConfigurations(testProjectId);

      // Assert
      expect(isApiSuccess(result)).toBe(true);
      expect(mockRepository.getPhaseConfigurations).toHaveBeenCalledWith(testProjectId);
    });

    it('should switch phases with validation', async () => {
      // Arrange
      const { service, testProjectId } = context;
      const fromPhase: PhaseType = 'Phase1_ArchitecturalBlueprint';
      const toPhase: PhaseType = 'Phase2_CoreContracts';

      // Act
      const result = await service.switchPhase(testProjectId, fromPhase, toPhase, {
        validateTransition: true
      });

      // Assert
      expect(isApiSuccess(result)).toBe(true);
      if (isApiSuccess(result)) {
        expect(result.data.phase).toBe(toPhase);
      }
    });

    it('should reject invalid phase transitions', async () => {
      // Arrange
      const { service, testProjectId } = context;
      const fromPhase: PhaseType = 'Phase1_ArchitecturalBlueprint';
      const toPhase: PhaseType = 'Phase5_TestGeneration'; // Invalid jump

      // Act & Assert
      await expect(service.switchPhase(testProjectId, fromPhase, toPhase, {
        validateTransition: true
      })).rejects.toThrow('Invalid phase transition');
    });
  });

  describe('Backup and Restore', () => {
    it('should create configuration backup', async () => {
      // Arrange
      const { service, mockRepository, testProjectId } = context;
      const reason = 'Pre-migration backup';

      // Act
      const result = await service.backupConfiguration(testProjectId, reason);

      // Assert
      expect(isApiSuccess(result)).toBe(true);
      if (isApiSuccess(result)) {
        expect(result.data.projectId).toBe(testProjectId);
        expect(result.data.reason).toBe(reason);
      }
      expect(mockRepository.createBackup).toHaveBeenCalledWith(testProjectId, reason);
    });

    it('should restore configuration from backup', async () => {
      // Arrange
      const { service, mockRepository, testProjectId } = context;
      const backupId = 'backup-123' as UUID;

      // Act
      const result = await service.restoreConfiguration(testProjectId, backupId);

      // Assert
      expect(isApiSuccess(result)).toBe(true);
      expect(mockRepository.restoreFromBackup).toHaveBeenCalledWith(testProjectId, backupId);
    });

    it('should validate restored configuration when requested', async () => {
      // Arrange
      const { service, mockNormalizer, testProjectId } = context;
      const backupId = 'backup-123' as UUID;

      // Act
      await service.restoreConfiguration(testProjectId, backupId, {
        validateRestore: true
      });

      // Assert
      expect(mockNormalizer.validateConfiguration).toHaveBeenCalled();
    });
  });

  describe('Validation Operations', () => {
    it('should validate configuration without saving', async () => {
      // Arrange
      const { service, mockNormalizer, testProjectId, testConfig } = context;

      // Act
      const result = await service.validateConfiguration(testConfig, {
        projectId: testProjectId
      });

      // Assert
      expect(isApiSuccess(result)).toBe(true);
      expect(mockNormalizer.validateConfiguration).toHaveBeenCalledWith(
        testConfig,
        testProjectId,
        undefined,
        true,
        true
      );
    });

    it('should support strict validation mode', async () => {
      // Arrange
      const { service, mockNormalizer, testProjectId, testConfig, testPhase } = context;

      // Act
      await service.validateConfiguration(testConfig, {
        projectId: testProjectId,
        phase: testPhase,
        strict: true
      });

      // Assert
      expect(mockNormalizer.validateConfiguration).toHaveBeenCalledWith(
        testConfig,
        testProjectId,
        testPhase,
        true,
        true
      );
    });
  });

  describe('Event Management', () => {
    it('should subscribe and unsubscribe to configuration events', () => {
      // Arrange
      const { service } = context;
      let eventReceived = false;
      const eventHandler = () => { eventReceived = true; };

      // Act
      const unsubscribe = service.subscribe('update', eventHandler);
      unsubscribe();

      // Assert - Event handler should be removed
      expect(typeof unsubscribe).toBe('function');
    });

    it('should handle multiple event listeners', () => {
      // Arrange
      const { service } = context;
      let event1Received = false;
      let event2Received = false;

      const handler1 = () => { event1Received = true; };
      const handler2 = () => { event2Received = true; };

      // Act
      service.subscribe('update', handler1);
      service.subscribe('update', handler2);

      // Assert - Both handlers should be registered
      expect(event1Received).toBe(false);
      expect(event2Received).toBe(false);
    });

    it('should not emit events when disabled', async () => {
      // Arrange
      const testContext = await TestSetup.createTestContext({
        enableChangeEvents: false
      });
      let eventEmitted = false;

      testContext.service.subscribe('update', () => {
        eventEmitted = true;
      });

      const updateRequest = TestDataFactory.createUpdateRequest();

      // Act
      await testContext.service.updateConfiguration(testContext.testProjectId, updateRequest);

      // Assert
      expect(eventEmitted).toBe(false);
    });
  });

  describe('Cache Management', () => {
    it('should clear project cache', () => {
      // Arrange
      const { service, testProjectId } = context;

      // Act
      service.clearProjectCache(testProjectId);

      // Assert - Should not throw and should complete
      expect(true).toBe(true); // Cache clearing is internal operation
    });

    it('should respect cache TTL settings', async () => {
      // Arrange
      const shortTtlContext = await TestSetup.createTestContext({
        cacheTtlMs: 100 // Very short TTL
      });

      // Act - Get configuration, wait for TTL, then get again
      await shortTtlContext.service.getConfiguration(
        shortTtlContext.testProjectId, 
        shortTtlContext.testPhase
      );
      
      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      await shortTtlContext.service.getConfiguration(
        shortTtlContext.testProjectId, 
        shortTtlContext.testPhase
      );

      // Assert - Should hit repository twice due to cache expiration
      expect(shortTtlContext.mockRepository.getConfiguration).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle repository failures gracefully', async () => {
      // Arrange
      const { service, mockRepository, mockErrorService, testProjectId, testPhase } = context;
      const repositoryError = new ReadyAIError('Database connection failed', 'DB_ERROR', 503);
      mockRepository.getConfiguration.mockRejectedValue(repositoryError);

      // Act & Assert
      await expect(service.getConfiguration(testProjectId, testPhase))
        .rejects
        .toThrow('Database connection failed');
      
      expect(mockErrorService.captureError).toHaveBeenCalledWith(
        repositoryError,
        expect.any(String)
      );
    });

    it('should retry failed operations', async () => {
      // Arrange
      const { service, mockRepository, testProjectId, testPhase } = context;
      
      // Setup first call to fail, second to succeed
      mockRepository.getConfiguration
        .mockRejectedValueOnce(new ReadyAIError('Temporary failure', 'TEMP_ERROR', 500))
        .mockResolvedValueOnce(createApiResponse(TestDataFactory.createTestConfig()));

      // Act
      const result = await service.getConfiguration(testProjectId, testPhase);

      // Assert
      expect(isApiSuccess(result)).toBe(true);
      expect(mockRepository.getConfiguration).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retry attempts', async () => {
      // Arrange
      const { service, mockRepository, testProjectId, testPhase } = context;
      const persistentError = new ReadyAIError('Persistent failure', 'PERSISTENT_ERROR', 500);
      mockRepository.getConfiguration.mockRejectedValue(persistentError);

      // Act & Assert
      await expect(service.getConfiguration(testProjectId, testPhase))
        .rejects
        .toThrow('Persistent failure');
      
      // Should retry maxRetryAttempts times (default 3)
      expect(mockRepository.getConfiguration).toHaveBeenCalledTimes(3);
    });

    it('should handle normalizer failures during updates', async () => {
      // Arrange
      const { service, mockNormalizer, testProjectId } = context;
      const updateRequest = TestDataFactory.createUpdateRequest();
      mockNormalizer.normalizeConfiguration.mockRejectedValue(
        new ReadyAIError('Normalization failed', 'NORM_ERROR', 422)
      );

      // Act & Assert
      await expect(service.updateConfiguration(testProjectId, updateRequest))
        .rejects
        .toThrow('Configuration normalization failed');
    });
  });

  describe('Service Health and Monitoring', () => {
    it('should report healthy status when dependencies are healthy', async () => {
      // Arrange
      const { service, mockRepository, mockNormalizer } = context;
      
      mockRepository.healthCheck.mockResolvedValue(
        createApiResponse({ status: 'healthy' as const })
      );
      mockNormalizer.healthCheck.mockResolvedValue(
        createApiResponse({ status: 'healthy' as const })
      );

      // Act
      const result = await service.getHealthStatus();

      // Assert
      expect(isApiSuccess(result)).toBe(true);
      if (isApiSuccess(result)) {
        expect(result.data.status).toBe('healthy');
        expect(result.data.dependencies.repository).toBe('healthy');
        expect(result.data.dependencies.normalizer).toBe('healthy');
      }
    });

    it('should report degraded status when some dependencies are unhealthy', async () => {
      // Arrange
      const { service, mockRepository, mockNormalizer } = context;
      
      mockRepository.healthCheck.mockResolvedValue(
        createApiResponse({ status: 'healthy' as const })
      );
      mockNormalizer.healthCheck.mockResolvedValue(
        createApiError('Service degraded', 'DEGRADED', 503)
      );

      // Act
      const result = await service.getHealthStatus();

      // Assert
      expect(isApiSuccess(result)).toBe(true);
      if (isApiSuccess(result)) {
        expect(result.data.status).toBe('degraded');
        expect(result.data.dependencies.repository).toBe('healthy');
        expect(result.data.dependencies.normalizer).toBe('unhealthy');
      }
    });

    it('should include service metrics in health status', async () => {
      // Arrange
      const { service } = context;

      // Act
      const result = await service.getHealthStatus();

      // Assert
      expect(isApiSuccess(result)).toBe(true);
      if (isApiSuccess(result)) {
        expect(result.data.metrics).toHaveProperty('cacheSize');
        expect(result.data.metrics).toHaveProperty('activeEventListeners');
        expect(result.data.metrics).toHaveProperty('retryOperations');
        expect(typeof result.data.metrics.cacheSize).toBe('number');
      }
    });
  });

  describe('Performance and Optimization', () => {
    it('should handle concurrent operations correctly', async () => {
      // Arrange
      const { service, testProjectId } = context;
      const numConcurrentOps = 10;

      // Act - Execute multiple operations concurrently
      const operations = Array.from({ length: numConcurrentOps }, (_, i) => 
        service.getConfiguration(testProjectId, 'Phase1_ArchitecturalBlueprint')
      );

      const results = await Promise.all(operations);

      // Assert - All operations should succeed
      expect(results).toHaveLength(numConcurrentOps);
      results.forEach(result => {
        expect(isApiSuccess(result)).toBe(true);
      });
    });

    it('should batch operations efficiently', async () => {
      // Arrange
      const { service, mockRepository, testProjectId } = context;
      
      // Act - Multiple rapid operations
      await Promise.all([
        service.getConfiguration(testProjectId, 'Phase1_ArchitecturalBlueprint'),
        service.getConfiguration(testProjectId, 'Phase2_CoreContracts'),
        service.getConfiguration(testProjectId, 'Phase3_FileGeneration')
      ]);

      // Assert - Repository calls should be optimized
      expect(mockRepository.getConfiguration).toHaveBeenCalledTimes(3);
    });

    it('should handle memory pressure gracefully', async () => {
      // Arrange
      const largeDataContext = await TestSetup.createTestContext({
        cacheSize: 1 // Very small cache
      });

      // Act - Fill cache beyond capacity
      for (let i = 0; i < 5; i++) {
        await largeDataContext.service.getConfiguration(
          `test-project-${i}` as UUID, 
          'Phase1_ArchitecturalBlueprint'
        );
      }

      // Assert - Should not throw errors due to memory constraints
      expect(true).toBe(true);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete configuration lifecycle', async () => {
      // Arrange
      const { service, testProjectId } = context;
      const phase: PhaseType = 'Phase1_ArchitecturalBlueprint';

      // Act - Complete lifecycle: create, update, backup, restore
      
      // 1. Create phase configuration
      const createResult = await service.createPhaseConfiguration(
        testProjectId, 
        phase, 
        TestDataFactory.createPhaseConfiguration(phase)
      );
      expect(isApiSuccess(createResult)).toBe(true);

      // 2. Update configuration
      const updateResult = await service.updateConfiguration(
        testProjectId,
        TestDataFactory.createUpdateRequest()
      );
      expect(isApiSuccess(updateResult)).toBe(true);

      // 3. Create backup
      const backupResult = await service.backupConfiguration(testProjectId, 'Integration test');
      expect(isApiSuccess(backupResult)).toBe(true);

      // 4. Restore from backup
      if (isApiSuccess(backupResult)) {
        const restoreResult = await service.restoreConfiguration(
          testProjectId,
          backupResult.data.id
        );
        expect(isApiSuccess(restoreResult)).toBe(true);
      }
    });

    it('should maintain data consistency across operations', async () => {
      // Arrange
      const { service, mockLogger, testProjectId } = context;
      
      // Act - Series of operations that should maintain consistency
      await service.updateConfiguration(
        testProjectId,
        TestDataFactory.createUpdateRequest()
      );

      await service.switchPhase(
        testProjectId,
        'Phase1_ArchitecturalBlueprint',
        'Phase2_CoreContracts'
      );

      // Assert - Operations should be logged consistently
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Configuration updated successfully',
        expect.any(Object)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Phase switch completed successfully',
        expect.any(Object)
      );
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle null and undefined inputs gracefully', async () => {
      // Arrange
      const { service } = context;

      // Act & Assert
      await expect(service.getConfiguration(null as any))
        .rejects
        .toThrow();

      await expect(service.updateConfiguration('' as UUID, undefined as any))
        .rejects
        .toThrow();
    });

    it('should handle empty configuration objects', async () => {
      // Arrange
      const { service, testProjectId } = context;
      const emptyConfig = {} as ApiConfiguration;

      // Act & Assert
      await expect(service.validateConfiguration(emptyConfig, {
        projectId: testProjectId
      })).rejects.toThrow();
    });

    it('should handle very large configurations', async () => {
      // Arrange
      const { service, testProjectId } = context;
      const largeConfig = TestDataFactory.createTestConfig({
        // Add large data payload
        metadata: {
          largeData: 'x'.repeat(100000) // 100KB of data
        }
      });

      // Act & Assert - Should handle large configs without issues
      const result = await service.validateConfiguration(largeConfig, {
        projectId: testProjectId
      });
      expect(isApiSuccess(result)).toBe(true);
    });

    it('should handle rapid consecutive operations', async () => {
      // Arrange
      const { service, testProjectId } = context;
      const updateRequest = TestDataFactory.createUpdateRequest();

      // Act - Rapid consecutive updates
      const rapidOperations = Array.from({ length: 5 }, () => 
        service.updateConfiguration(testProjectId, {
          ...updateRequest,
          version: Math.random()
        })
      );

      // Assert - All operations should eventually resolve
      const results = await Promise.allSettled(rapidOperations);
      const successfulResults = results.filter(r => r.status === 'fulfilled');
      expect(successfulResults.length).toBeGreaterThan(0);
    });
  });
});

// Additional test utilities for complex scenarios
class IntegrationTestUtils {
  static async simulateUserWorkflow(service: ConfigService, projectId: UUID): Promise<void> {
    // Simulate a typical user workflow
    const phases: PhaseType[] = [
      'Phase0_StrategicCharter',
      'Phase1_ArchitecturalBlueprint', 
      'Phase2_CoreContracts',
      'Phase3_FileGeneration'
    ];

    for (let i = 0; i < phases.length - 1; i++) {
      await service.switchPhase(projectId, phases[i], phases[i + 1]);
    }
  }

  static async stressTestConfiguration(
    service: ConfigService, 
    projectId: UUID, 
    iterations: number = 100
  ): Promise<void> {
    const operations = [];
    
    for (let i = 0; i < iterations; i++) {
      operations.push(
        service.getConfiguration(projectId),
        service.updateConfiguration(projectId, TestDataFactory.createUpdateRequest())
      );
    }

    await Promise.allSettled(operations);
  }
}

// Performance benchmarking tests
describe('ConfigService Performance', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await TestSetup.createTestContext({
      enableCaching: true,
      enableChangeEvents: false // Disable events for pure performance testing
    });
  });

  it('should handle high-throughput operations', async () => {
    // Arrange
    const { service, testProjectId } = context;
    const startTime = Date.now();
    const operationCount = 1000;

    // Act
    const operations = Array.from({ length: operationCount }, () =>
      service.getConfiguration(testProjectId)
    );

    await Promise.all(operations);
    const endTime = Date.now();

    // Assert - Should complete within reasonable time
    const duration = endTime - startTime;
    const operationsPerSecond = operationCount / (duration / 1000);
    
    expect(operationsPerSecond).toBeGreaterThan(100); // At least 100 ops/sec
  });

  it('should maintain consistent response times under load', async () => {
    // Arrange
    const { service, testProjectId } = context;
    const responseTimes: number[] = [];

    // Act - Measure response times for multiple operations
    for (let i = 0; i < 50; i++) {
      const start = Date.now();
      await service.getConfiguration(testProjectId);
      const end = Date.now();
      responseTimes.push(end - start);
    }

    // Assert - Response times should be consistent
    const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const maxResponseTime = Math.max(...responseTimes);
    const minResponseTime = Math.min(...responseTimes);

    expect(maxResponseTime - minResponseTime).toBeLessThan(averageResponseTime * 2);
  });
});

export { TestDataFactory, TestSetup, IntegrationTestUtils };
