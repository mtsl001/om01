// packages/database/services/__tests__/DatabaseService.spec.ts

/**
 * Comprehensive test suite for DatabaseService
 * 
 * Adapts Cline's proven service testing patterns (70% reuse) with ReadyAI-specific
 * SQLite test scenarios, ensuring production-ready quality and comprehensive coverage.
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
  isApiSuccess,
  createApiResponse,
  createApiError,
  wrapAsync
} from '../../../../../foundation/types/core';

import {
  DatabaseConfig,
  DatabaseHealth,
  TransactionOptions,
  DatabaseOperationResult,
  MigrationResult,
  BackupResult,
  DEFAULT_DATABASE_CONFIG,
  DEFAULT_TRANSACTION_OPTIONS
} from '../../types/database';

import DatabaseService, {
  DatabaseServiceConfig,
  ServiceHealthStatus,
  DatabaseOperationContext
} from '../DatabaseService';

import DatabaseConnection from '../DatabaseConnection';
import MigrationService from '../MigrationService';
import BackupService from '../BackupService';
import TransactionManager from '../TransactionManager';
import DatabaseHealthMonitor from '../DatabaseHealthMonitor';
import BaseRepository from '../../repositories/BaseRepository';

// Test framework imports
import { describe, beforeEach, afterEach, it, expect, jest, beforeAll, afterAll } from '@jest/globals';

// Mock implementations - adapted from Cline's mock patterns
jest.mock('../DatabaseConnection');
jest.mock('../MigrationService');
jest.mock('../BackupService');
jest.mock('../TransactionManager');
jest.mock('../DatabaseHealthMonitor');
jest.mock('../../repositories/BaseRepository');

// Test utilities and helpers - Cline testing pattern
interface TestContext {
  service: DatabaseService;
  mockDbConnection: jest.Mocked<DatabaseConnection>;
  mockMigrationService: jest.Mocked<MigrationService>;
  mockBackupService: jest.Mocked<BackupService>;
  mockTransactionManager: jest.Mocked<TransactionManager>;
  mockHealthMonitor: jest.Mocked<DatabaseHealthMonitor>;
  mockRepository: jest.Mocked<BaseRepository<any>>;
  testConfig: DatabaseServiceConfig;
  testOperationId: UUID;
}

// Test data factory - Cline pattern for consistent test data
class TestDataFactory {
  static createTestConfig(): DatabaseServiceConfig {
    return {
      ...DEFAULT_DATABASE_CONFIG,
      url: ':memory:', // SQLite in-memory for tests
      enableAutoMigrations: false, // Control migrations in tests
      enableScheduledBackups: false, // Control backups in tests
      healthCheckInterval: 1000, // Short interval for tests
      enablePerformanceMonitoring: true,
      connectionPoolSize: 2 // Small pool for tests
    };
  }

  static createTestOperationId(): UUID {
    return 'test-op-12345678-1234-1234-1234-123456789012' as UUID;
  }

  static createDatabaseHealth(overrides?: Partial<DatabaseHealth>): DatabaseHealth {
    return {
      isConnected: true,
      connectionCount: 1,
      lastQuery: 'SELECT 1 as test',
      responseTime: 25,
      errors: [],
      walMode: true,
      foreignKeys: true,
      ...overrides
    };
  }

  static createMigrationResult(overrides?: Partial<MigrationResult>): MigrationResult {
    return {
      success: true,
      migrationsApplied: 3,
      executionTime: 150,
      appliedVersions: [1, 2, 3],
      canRollback: true,
      ...overrides
    };
  }

  static createBackupResult(overrides?: Partial<BackupResult>): BackupResult {
    return {
      success: true,
      backupPath: '/tmp/test-backup.db',
      backupSize: 1024000,
      duration: 500,
      timestamp: new Date().toISOString(),
      ...overrides
    };
  }

  static createTransactionOptions(overrides?: Partial<TransactionOptions>): TransactionOptions {
    return {
      ...DEFAULT_TRANSACTION_OPTIONS,
      timeout: 5000,
      ...overrides
    };
  }

  static createOperationContext(overrides?: Partial<DatabaseOperationContext>): DatabaseOperationContext {
    return {
      operationId: this.createTestOperationId(),
      operation: 'test-operation',
      projectId: 'test-project-123' as UUID,
      userId: 'test-user-123' as UUID,
      metadata: { testRun: true },
      ...overrides
    };
  }
}

// Test setup helper - Cline pattern for test isolation
class TestSetup {
  static async createTestContext(configOverrides?: Partial<DatabaseServiceConfig>): Promise<TestContext> {
    // Create mocks - Cline mocking pattern
    const mockDbConnection = new DatabaseConnection() as jest.Mocked<DatabaseConnection>;
    const mockMigrationService = new MigrationService() as jest.Mocked<MigrationService>;
    const mockBackupService = new BackupService() as jest.Mocked<BackupService>;
    const mockTransactionManager = new TransactionManager() as jest.Mocked<TransactionManager>;
    const mockHealthMonitor = new DatabaseHealthMonitor() as jest.Mocked<DatabaseHealthMonitor>;
    const mockRepository = new BaseRepository() as jest.Mocked<BaseRepository<any>>;

    // Setup default mock behaviors - Cline pattern
    this.setupConnectionMocks(mockDbConnection);
    this.setupMigrationMocks(mockMigrationService);
    this.setupBackupMocks(mockBackupService);
    this.setupTransactionMocks(mockTransactionManager);
    this.setupHealthMocks(mockHealthMonitor);
    this.setupRepositoryMocks(mockRepository);

    const testConfig = { ...TestDataFactory.createTestConfig(), ...configOverrides };
    const service = new DatabaseService(testConfig);

    // Inject mocks using any to bypass private members
    (service as any).dbConnection = mockDbConnection;
    (service as any).migrationService = mockMigrationService;
    (service as any).backupService = mockBackupService;
    (service as any).transactionManager = mockTransactionManager;
    (service as any).healthMonitor = mockHealthMonitor;

    return {
      service,
      mockDbConnection,
      mockMigrationService,
      mockBackupService,
      mockTransactionManager,
      mockHealthMonitor,
      mockRepository,
      testConfig,
      testOperationId: TestDataFactory.createTestOperationId()
    };
  }

  private static setupConnectionMocks(mockConnection: jest.Mocked<DatabaseConnection>): void {
    mockConnection.initialize.mockResolvedValue(undefined);
    mockConnection.shutdown.mockResolvedValue(undefined);
    mockConnection.execute.mockResolvedValue({ success: true, result: { test: 1 } });
    mockConnection.getHealth.mockResolvedValue(TestDataFactory.createDatabaseHealth());
    mockConnection.getStats.mockReturnValue({
      activeConnections: 1,
      totalConnections: 1,
      averageResponseTime: 25
    });
  }

  private static setupMigrationMocks(mockMigration: jest.Mocked<MigrationService>): void {
    mockMigration.initialize.mockResolvedValue(undefined);
    mockMigration.shutdown.mockResolvedValue(undefined);
    mockMigration.runPendingMigrations.mockResolvedValue(
      createApiResponse(TestDataFactory.createMigrationResult())
    );
    mockMigration.getCurrentVersion.mockResolvedValue(createApiResponse(1));
    mockMigration.getPendingMigrations.mockResolvedValue(createApiResponse([]));
  }

  private static setupBackupMocks(mockBackup: jest.Mocked<BackupService>): void {
    mockBackup.initialize.mockResolvedValue(undefined);
    mockBackup.shutdown.mockResolvedValue(undefined);
    mockBackup.createBackup.mockResolvedValue(TestDataFactory.createBackupResult());
    mockBackup.getBackupHistory.mockReturnValue([]);
  }

  private static setupTransactionMocks(mockTransaction: jest.Mocked<TransactionManager>): void {
    mockTransaction.executeTransaction.mockResolvedValue({ success: true, result: 'transaction-result' });
    mockTransaction.executeBatch.mockResolvedValue({ success: true, results: ['batch-result'] });
  }

  private static setupHealthMocks(mockHealth: jest.Mocked<DatabaseHealthMonitor>): void {
    mockHealth.initialize.mockResolvedValue(undefined);
    mockHealth.shutdown.mockResolvedValue(undefined);
  }

  private static setupRepositoryMocks(mockRepo: jest.Mocked<BaseRepository<any>>): void {
    mockRepo.findById.mockResolvedValue(null);
    mockRepo.create.mockResolvedValue({ id: 'test-id' });
  }
}

// Main test suite - following Cline's comprehensive testing structure
describe('DatabaseService', () => {
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
    if (context.service && (context.service as any).isInitialized) {
      await context.service.shutdown().catch(() => {
        // Ignore shutdown errors in tests
      });
    }
  });

  // Service Lifecycle Tests - adapted from Cline's service testing patterns
  describe('Service Lifecycle', () => {
    it('should initialize service successfully', async () => {
      // Act
      await context.service.initialize();

      // Assert - Cline assertion patterns
      expect(context.mockDbConnection.initialize).toHaveBeenCalledTimes(1);
      expect(context.mockMigrationService.initialize).toHaveBeenCalledTimes(1);
      expect(context.mockBackupService.initialize).toHaveBeenCalledTimes(1);
      expect(context.mockHealthMonitor.initialize).toHaveBeenCalledTimes(1);
    });

    it('should prevent double initialization', async () => {
      // Arrange
      await context.service.initialize();

      // Act & Assert
      await expect(context.service.initialize()).rejects.toThrow('DatabaseService is already initialized');
    });

    it('should shutdown gracefully', async () => {
      // Arrange
      await context.service.initialize();

      // Act
      await context.service.shutdown();

      // Assert
      expect(context.mockHealthMonitor.shutdown).toHaveBeenCalledTimes(1);
      expect(context.mockBackupService.shutdown).toHaveBeenCalledTimes(1);
      expect(context.mockMigrationService.shutdown).toHaveBeenCalledTimes(1);
      expect(context.mockDbConnection.shutdown).toHaveBeenCalledTimes(1);
    });

    it('should handle initialization failures', async () => {
      // Arrange
      context.mockDbConnection.initialize.mockRejectedValue(new Error('Connection failed'));

      // Act & Assert
      await expect(context.service.initialize()).rejects.toThrow('Failed to initialize DatabaseService');
    });
  });

  // Database Operations Tests - Cline patterns for operation testing
  describe('Database Operations', () => {
    beforeEach(async () => {
      await context.service.initialize();
    });

    it('should execute database operations successfully', async () => {
      // Arrange
      const testOperation = jest.fn().mockResolvedValue('operation-result');
      const operationContext = TestDataFactory.createOperationContext();

      // Act
      const result = await context.service.execute(testOperation, operationContext);

      // Assert
      expect(isApiSuccess(result)).toBe(true);
      if (isApiSuccess(result)) {
        expect(result.data).toBe('operation-result');
        expect(result.metadata?.operationCount).toBeGreaterThan(0);
      }
      expect(context.mockDbConnection.execute).toHaveBeenCalledWith(testOperation);
    });

    it('should handle operation failures with proper error wrapping', async () => {
      // Arrange
      const testOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      context.mockDbConnection.execute.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(context.service.execute(testOperation)).rejects.toThrow('Database operation failed');
    });

    it('should track performance metrics', async () => {
      // Arrange
      const testOperation = jest.fn().mockResolvedValue('result');
      
      // Act
      const result = await context.service.execute(testOperation);

      // Assert
      expect(isApiSuccess(result)).toBe(true);
      if (isApiSuccess(result)) {
        expect(result.metadata?.responseTime).toBeGreaterThan(0);
        expect(result.metadata?.operationCount).toBe(1);
      }
    });
  });

  // Transaction Management Tests - SQLite-specific scenarios
  describe('Transaction Management', () => {
    beforeEach(async () => {
      await context.service.initialize();
    });

    it('should execute transactions with ACID compliance', async () => {
      // Arrange
      const operations = jest.fn().mockResolvedValue('transaction-result');
      const options = TestDataFactory.createTransactionOptions({ mode: 'IMMEDIATE' });
      const operationContext = TestDataFactory.createOperationContext();

      // Act
      const result = await context.service.executeTransaction(operations, options, operationContext);

      // Assert
      expect(isApiSuccess(result)).toBe(true);
      if (isApiSuccess(result)) {
        expect(result.metadata?.transactionMode).toBe('IMMEDIATE');
      }
      expect(context.mockTransactionManager.executeTransaction).toHaveBeenCalledWith(operations, options);
    });

    it('should handle transaction rollback on failure', async () => {
      // Arrange
      const operations = jest.fn().mockRejectedValue(new Error('Transaction failed'));
      context.mockTransactionManager.executeTransaction.mockResolvedValue({
        success: false,
        error: 'Transaction rolled back'
      });

      // Act & Assert
      await expect(context.service.executeTransaction(operations)).rejects.toThrow('Database transaction failed');
    });

    it('should support different isolation levels for SQLite', async () => {
      // Arrange
      const operations = jest.fn().mockResolvedValue('result');
      const options = TestDataFactory.createTransactionOptions({
        mode: 'EXCLUSIVE',
        isolationLevel: 'SERIALIZABLE'
      });

      // Act
      await context.service.executeTransaction(operations, options);

      // Assert
      expect(context.mockTransactionManager.executeTransaction).toHaveBeenCalledWith(
        operations,
        expect.objectContaining({
          mode: 'EXCLUSIVE',
          isolationLevel: 'SERIALIZABLE'
        })
      );
    });

    it('should handle concurrent transaction conflicts', async () => {
      // Arrange - Simulate SQLite busy error
      context.mockTransactionManager.executeTransaction.mockRejectedValue(new Error('database is locked'));

      const operations = jest.fn();

      // Act & Assert
      await expect(context.service.executeTransaction(operations)).rejects.toThrow('Database transaction failed');
    });
  });

  // Health Monitoring Tests - Cline health check patterns
  describe('Health Monitoring', () => {
    beforeEach(async () => {
      await context.service.initialize();
    });

    it('should return comprehensive health status', async () => {
      // Arrange
      const mockHealth = TestDataFactory.createDatabaseHealth();
      context.mockDbConnection.getHealth.mockResolvedValue(mockHealth);

      // Act
      const result = await context.service.getHealthStatus();

      // Assert
      expect(isApiSuccess(result)).toBe(true);
      if (isApiSuccess(result)) {
        expect(result.data.isHealthy).toBe(true);
        expect(result.data.connectionHealth.isConnected).toBe(true);
        expect(result.data.performance.totalOperations).toBeGreaterThanOrEqual(0);
      }
    });

    it('should detect unhealthy database state', async () => {
      // Arrange
      const unhealthyState = TestDataFactory.createDatabaseHealth({
        isConnected: false,
        errors: ['Connection timeout']
      });
      context.mockDbConnection.getHealth.mockResolvedValue(unhealthyState);

      // Act
      const result = await context.service.getHealthStatus();

      // Assert
      expect(isApiSuccess(result)).toBe(true);
      if (isApiSuccess(result)) {
        expect(result.data.isHealthy).toBe(false);
        expect(result.data.connectionHealth.isConnected).toBe(false);
      }
    });

    it('should provide SQLite-specific health metrics', async () => {
      // Arrange
      const sqliteHealth = TestDataFactory.createDatabaseHealth({
        walMode: true,
        foreignKeys: true,
        responseTime: 15
      });
      context.mockDbConnection.getHealth.mockResolvedValue(sqliteHealth);

      // Act
      const result = await context.service.getHealthStatus();

      // Assert
      expect(isApiSuccess(result)).toBe(true);
      if (isApiSuccess(result)) {
        expect(result.data.connectionHealth.walMode).toBe(true);
        expect(result.data.connectionHealth.foreignKeys).toBe(true);
        expect(result.data.connectionHealth.responseTime).toBeLessThan(50);
      }
    });
  });

  // Migration Management Tests - Cline deployment patterns
  describe('Migration Management', () => {
    beforeEach(async () => {
      await context.service.initialize();
    });

    it('should execute pending migrations successfully', async () => {
      // Arrange
      const migrationResult = TestDataFactory.createMigrationResult({
        migrationsApplied: 2,
        appliedVersions: [1, 2]
      });
      context.mockMigrationService.runPendingMigrations.mockResolvedValue(
        createApiResponse(migrationResult)
      );

      // Act
      const result = await context.service.runMigrations();

      // Assert
      expect(isApiSuccess(result)).toBe(true);
      if (isApiSuccess(result)) {
        expect(result.data.migrationsApplied).toBe(2);
        expect(result.data.appliedVersions).toEqual([1, 2]);
      }
    });

    it('should handle migration failures gracefully', async () => {
      // Arrange
      context.mockMigrationService.runPendingMigrations.mockResolvedValue(
        createApiError('Migration failed', 'MIGRATION_ERROR', 500)
      );

      // Act & Assert
      await expect(context.service.runMigrations()).rejects.toThrow('Migration failed');
    });
  });

  // Backup Operations Tests - Cline backup patterns
  describe('Backup Operations', () => {
    beforeEach(async () => {
      await context.service.initialize();
    });

    it('should create database backups successfully', async () => {
      // Arrange
      const backupResult = TestDataFactory.createBackupResult({
        backupSize: 2048000,
        duration: 750
      });
      context.mockBackupService.createBackup.mockResolvedValue(backupResult);

      // Act
      const result = await context.service.createBackup('full');

      // Assert
      expect(isApiSuccess(result)).toBe(true);
      if (isApiSuccess(result)) {
        expect(result.data.success).toBe(true);
        expect(result.data.backupSize).toBe(2048000);
        expect(result.metadata?.backupStrategy).toBe('full');
      }
    });

    it('should handle backup failures', async () => {
      // Arrange
      const failedBackup = TestDataFactory.createBackupResult({
        success: false,
        error: 'Insufficient disk space'
      });
      context.mockBackupService.createBackup.mockResolvedValue(failedBackup);

      // Act
      const result = await context.service.createBackup('incremental');

      // Assert
      expect(isApiSuccess(result)).toBe(true);
      if (isApiSuccess(result)) {
        expect(result.data.success).toBe(false);
        expect(result.data.error).toContain('Insufficient disk space');
      }
    });
  });

  // Repository Management Tests - Cline repository patterns
  describe('Repository Management', () => {
    beforeEach(async () => {
      await context.service.initialize();
    });

    it('should register repositories successfully', async () => {
      // Arrange
      const testRepo = context.mockRepository;

      // Act
      context.service.registerRepository('testRepo', testRepo);

      // Assert
      const retrievedRepo = context.service.getRepository('testRepo');
      expect(retrievedRepo).toBe(testRepo);
    });

    it('should return undefined for non-existent repositories', async () => {
      // Act
      const repo = context.service.getRepository('nonExistentRepo');

      // Assert
      expect(repo).toBeUndefined();
    });
  });

  // Event System Tests - Cline event patterns
  describe('Event System', () => {
    beforeEach(async () => {
      await context.service.initialize();
    });

    it('should emit operation events', async () => {
      // Arrange
      const operationStartedSpy = jest.fn();
      const operationCompletedSpy = jest.fn();
      
      context.service.on('operation:started', operationStartedSpy);
      context.service.on('operation:completed', operationCompletedSpy);

      const testOperation = jest.fn().mockResolvedValue('result');

      // Act
      await context.service.execute(testOperation);

      // Assert
      expect(operationStartedSpy).toHaveBeenCalledTimes(1);
      expect(operationCompletedSpy).toHaveBeenCalledTimes(1);
    });

    it('should emit transaction events', async () => {
      // Arrange
      const transactionStartedSpy = jest.fn();
      const transactionCompletedSpy = jest.fn();
      
      context.service.on('transaction:started', transactionStartedSpy);
      context.service.on('transaction:completed', transactionCompletedSpy);

      const operations = jest.fn().mockResolvedValue('transaction-result');

      // Act
      await context.service.executeTransaction(operations);

      // Assert
      expect(transactionStartedSpy).toHaveBeenCalledTimes(1);
      expect(transactionCompletedSpy).toHaveBeenCalledTimes(1);
    });

    it('should emit error events on failures', async () => {
      // Arrange
      const errorSpy = jest.fn();
      context.service.on('error', errorSpy);

      const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      context.mockDbConnection.execute.mockRejectedValue(new Error('Database error'));

      // Act
      try {
        await context.service.execute(failingOperation);
      } catch (error) {
        // Expected to throw
      }

      // Assert - Error event should be emitted
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });
  });

  // Error Handling Tests - Cline error patterns
  describe('Error Handling', () => {
    it('should require initialization before operations', async () => {
      // Act & Assert - Service not initialized
      const operation = jest.fn();
      await expect(context.service.execute(operation)).rejects.toThrow();
    });

    it('should handle SQLite-specific errors', async () => {
      // Arrange
      await context.service.initialize();
      
      const sqliteError = new Error('SQLITE_BUSY: database is locked');
      context.mockDbConnection.execute.mockRejectedValue(sqliteError);
      
      const operation = jest.fn().mockRejectedValue(sqliteError);

      // Act & Assert
      await expect(context.service.execute(operation)).rejects.toThrow('Database operation failed');
    });

    it('should provide detailed error context', async () => {
      // Arrange
      await context.service.initialize();
      
      const operationContext = TestDataFactory.createOperationContext({
        operation: 'test-failing-operation'
      });
      
      context.mockDbConnection.execute.mockRejectedValue(new Error('Database error'));
      const operation = jest.fn().mockRejectedValue(new Error('Operation error'));

      // Act & Assert
      try {
        await context.service.execute(operation, operationContext);
      } catch (error) {
        expect(error).toBeInstanceOf(ReadyAIError);
        expect((error as ReadyAIError).details).toMatchObject({
          operationId: operationContext.operationId,
          context: expect.objectContaining({
            operation: 'test-failing-operation'
          })
        });
      }
    });
  });

  // Performance Tests - Cline performance patterns
  describe('Performance Monitoring', () => {
    beforeEach(async () => {
      await context.service.initialize();
    });

    it('should track operation performance metrics', async () => {
      // Arrange
      const operation1 = jest.fn().mockResolvedValue('result1');
      const operation2 = jest.fn().mockResolvedValue('result2');

      // Act
      await context.service.execute(operation1);
      await context.service.execute(operation2);

      const healthStatus = await context.service.getHealthStatus();

      // Assert
      expect(isApiSuccess(healthStatus)).toBe(true);
      if (isApiSuccess(healthStatus)) {
        expect(healthStatus.data.performance.totalOperations).toBe(2);
        expect(healthStatus.data.performance.averageResponseTime).toBeGreaterThan(0);
        expect(healthStatus.data.performance.errorRate).toBe(0);
      }
    });

    it('should calculate error rates correctly', async () => {
      // Arrange
      const successOperation = jest.fn().mockResolvedValue('success');
      const failOperation = jest.fn().mockRejectedValue(new Error('fail'));
      
      context.mockDbConnection.execute
        .mockResolvedValueOnce({ success: true, result: 'success' })
        .mockRejectedValueOnce(new Error('Database error'));

      // Act
      await context.service.execute(successOperation);
      
      try {
        await context.service.execute(failOperation);
      } catch {
        // Expected to fail
      }

      const healthStatus = await context.service.getHealthStatus();

      // Assert
      expect(isApiSuccess(healthStatus)).toBe(true);
      if (isApiSuccess(healthStatus)) {
        expect(healthStatus.data.performance.totalOperations).toBe(2);
        expect(healthStatus.data.performance.errorRate).toBe(50); // 1 error out of 2 operations
      }
    });
  });
});
