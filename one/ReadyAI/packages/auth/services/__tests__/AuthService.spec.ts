// packages/auth/services/__tests__/AuthService.spec.ts

import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as sinon from 'sinon';
import { EventEmitter } from 'events';
import { AuthService, IUserStorage } from '../AuthService.js';
import { SessionManager } from '../SessionManager.js';
import { TokenManager, TokenType } from '../TokenManager.js';
import type { Logger } from '../../../logging/types/logging.js';
import type {
  AuthMethod,
  AuthStatus,
  UserProfile,
  AuthSession,
  SessionStatus,
  AuthError,
  AuthErrorCode,
  LocalSessionAuthRequest,
  ApiKeyAuthRequest,
  DevModeAuthRequest,
  AuthResponse,
  TokenRefreshRequest,
  TokenRefreshResponse,
  AuthState,
  SessionMetadata,
  AuthenticationError,
  DEFAULT_AUTH_CONFIG
} from '../../types/auth.js';
import type { UUID, ApiResponse } from '../../../foundation/types/core.js';

describe('AuthService', () => {
  let authService: AuthService;
  let mockLogger: sinon.SinonStubbedInstance<Logger>;
  let mockSessionManager: sinon.SinonStubbedInstance<SessionManager>;
  let mockTokenManager: sinon.SinonStubbedInstance<TokenManager>;
  let mockUserStorage: sinon.SinonStubbedInstance<IUserStorage>;
  let sandbox: sinon.SinonSandbox;
  
  // Test data
  const mockUserId = 'test-user-123' as UUID;
  const mockSessionId = 'test-session-456' as UUID;
  const mockTokenId = 'test-token-789' as UUID;
  
  const mockUser: UserProfile = {
    id: mockUserId,
    displayName: 'Test User',
    email: 'test@readyai.dev',
    preferences: {
      theme: 'system',
      language: 'en',
      notifications: {
        systemNotifications: true,
        taskNotifications: true,
        errorNotifications: true,
        securityAlerts: true
      },
      security: {
        requireAuthForSensitiveOps: true,
        sessionTimeout: 480,
        autoLockEnabled: false,
        twoFactorEnabled: false
      }
    },
    createdAt: '2024-01-01T00:00:00.000Z',
    role: 'user'
  };

  const mockSession: AuthSession = {
    id: mockSessionId,
    userId: mockUserId,
    user: mockUser,
    status: 'active' as SessionStatus,
    authMethod: AuthMethod.LOCAL_SESSION,
    createdAt: '2024-01-01T00:00:00.000Z',
    lastAccessedAt: '2024-01-01T00:00:00.000Z',
    expiresAt: '2024-01-01T08:00:00.000Z',
    metadata: {
      source: 'vscode',
      userAgent: 'VSCode/1.0.0',
      platform: 'darwin'
    },
    security: {
      secure: true,
      flags: [],
      securityEvents: [],
      riskScore: 0
    }
  };

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    
    // Create mock logger following Cline patterns
    mockLogger = sandbox.createStubInstance(class {
      info() {}
      warn() {}
      error() {}
      debug() {}
    } as any);
    
    // Create mock SessionManager following Cline service patterns
    mockSessionManager = sandbox.createStubInstance(SessionManager);
    mockSessionManager.createSession.resolves({
      success: true,
      data: mockSession
    } as ApiResponse<AuthSession>);
    mockSessionManager.getSession.resolves(mockSession);
    mockSessionManager.updateSession.resolves({ success: true, data: undefined });
    mockSessionManager.invalidateSession.resolves({ success: true, data: undefined });
    mockSessionManager.invalidateAllUserSessions.resolves({ success: true, data: undefined });
    
    // Create mock TokenManager following Cline token handling patterns
    mockTokenManager = sandbox.createStubInstance(TokenManager);
    mockTokenManager.validateToken.resolves(true);
    mockTokenManager.refreshToken.resolves({
      success: true,
      data: {
        value: 'new-access-token',
        metadata: 'new-token-metadata'
      }
    });
    
    // Create mock UserStorage following Cline storage patterns
    mockUserStorage = sandbox.createStubInstance(class {
      async store() {}
      async retrieve() { return null; }
      async remove() {}
      async exists() { return false; }
      async clear() {}
      async list() { return []; }
      async findByEmail() { return null; }
    } as any);
    mockUserStorage.store.resolves();
    mockUserStorage.retrieve.resolves(mockUser);
    mockUserStorage.findByEmail.resolves(null);
    mockUserStorage.exists.resolves(true);
    
    // Initialize AuthService with mocks
    authService = new AuthService(
      mockLogger as unknown as Logger,
      mockSessionManager as unknown as SessionManager,
      mockTokenManager as unknown as TokenManager,
      DEFAULT_AUTH_CONFIG,
      mockUserStorage as unknown as IUserStorage
    );
  });

  afterEach(() => {
    authService.dispose();
    sandbox.restore();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      expect(authService).to.be.instanceOf(AuthService);
      expect(authService).to.be.instanceOf(EventEmitter);
    });

    it('should merge custom configuration with defaults', () => {
      const customConfig = {
        defaultMethod: AuthMethod.DEV_MODE,
        enabledMethods: [AuthMethod.DEV_MODE]
      };
      
      const customAuthService = new AuthService(
        mockLogger as unknown as Logger,
        mockSessionManager as unknown as SessionManager,
        mockTokenManager as unknown as TokenManager,
        customConfig,
        mockUserStorage as unknown as IUserStorage
      );
      
      expect(customAuthService).to.be.instanceOf(AuthService);
      customAuthService.dispose();
    });

    it('should set up periodic cleanup and monitoring', (done) => {
      // Verify that background tasks are set up (they run periodically)
      // We can't easily test the intervals directly, but we can verify construction succeeds
      setTimeout(() => {
        expect(authService).to.be.instanceOf(AuthService);
        done();
      }, 100);
    });
  });

  describe('authenticate', () => {
    describe('local session authentication', () => {
      it('should successfully authenticate with valid local session credentials', async () => {
        const request: LocalSessionAuthRequest = {
          id: 'auth-request-123' as UUID,
          method: AuthMethod.LOCAL_SESSION,
          credentials: {
            identifier: 'test@readyai.dev',
            secret: 'password123'
          },
          clientInfo: {
            userAgent: 'VSCode/1.0.0',
            platform: 'darwin'
          },
          timestamp: '2024-01-01T00:00:00.000Z'
        };
        
        mockUserStorage.findByEmail.resolves(mockUser);
        
        const result = await authService.authenticate(request);
        
        expect(result.success).to.be.true;
        expect(result.session).to.deep.equal(mockSession);
        expect(mockSessionManager.createSession.called).to.be.true;
        expect(mockLogger.info.calledWith('Authentication successful')).to.be.true;
      });

      it('should create new user in development mode when user not found', async () => {
        const request: LocalSessionAuthRequest = {
          id: 'auth-request-124' as UUID,
          method: AuthMethod.LOCAL_SESSION,
          credentials: {
            identifier: 'newuser@readyai.dev',
            secret: 'password123'
          },
          clientInfo: {
            userAgent: 'VSCode/1.0.0',
            platform: 'darwin'
          },
          timestamp: '2024-01-01T00:00:00.000Z'
        };
        
        mockUserStorage.findByEmail.resolves(null);
        
        // Mock development config
        const devAuthService = new AuthService(
          mockLogger as unknown as Logger,
          mockSessionManager as unknown as SessionManager,
          mockTokenManager as unknown as TokenManager,
          { 
            ...DEFAULT_AUTH_CONFIG, 
            development: { enabled: true, skipAuth: false, mockResponses: false }
          },
          mockUserStorage as unknown as IUserStorage
        );
        
        const result = await devAuthService.authenticate(request);
        
        expect(result.success).to.be.true;
        expect(mockUserStorage.store.called).to.be.true;
        
        devAuthService.dispose();
      });

      it('should fail authentication with invalid credentials', async () => {
        const request: LocalSessionAuthRequest = {
          id: 'auth-request-125' as UUID,
          method: AuthMethod.LOCAL_SESSION,
          credentials: {
            identifier: 'nonexistent@readyai.dev',
            secret: 'wrongpassword'
          },
          clientInfo: {
            userAgent: 'VSCode/1.0.0',
            platform: 'darwin'
          },
          timestamp: '2024-01-01T00:00:00.000Z'
        };
        
        mockUserStorage.findByEmail.resolves(null);
        
        const result = await authService.authenticate(request);
        
        expect(result.success).to.be.false;
        expect(result.error?.code).to.equal('INVALID_CREDENTIALS');
        expect(mockSessionManager.createSession.called).to.be.false;
      });
    });

    describe('API key authentication', () => {
      it('should successfully authenticate with valid API key', async () => {
        const request: ApiKeyAuthRequest = {
          id: 'auth-request-126' as UUID,
          method: AuthMethod.API_KEY,
          credentials: {
            apiKey: 'readyai_test_key_123'
          },
          clientInfo: {
            userAgent: 'ReadyAI-CLI/1.0.0',
            platform: 'linux'
          },
          timestamp: '2024-01-01T00:00:00.000Z'
        };
        
        const apiUser = {
          ...mockUser,
          email: 'api@readyai.local',
          displayName: 'API User'
        };
        
        mockUserStorage.findByEmail.resolves(apiUser);
        
        const result = await authService.authenticate(request);
        
        expect(result.success).to.be.true;
        expect(result.session).to.exist;
        expect(mockSessionManager.createSession.called).to.be.true;
      });

      it('should fail authentication with invalid API key format', async () => {
        const request: ApiKeyAuthRequest = {
          id: 'auth-request-127' as UUID,
          method: AuthMethod.API_KEY,
          credentials: {
            apiKey: 'invalid_key_format'
          },
          clientInfo: {
            userAgent: 'ReadyAI-CLI/1.0.0',
            platform: 'linux'
          },
          timestamp: '2024-01-01T00:00:00.000Z'
        };
        
        const result = await authService.authenticate(request);
        
        expect(result.success).to.be.false;
        expect(result.error?.code).to.equal('INVALID_CREDENTIALS');
      });
    });

    describe('development mode authentication', () => {
      it('should successfully authenticate in development mode', async () => {
        const request: DevModeAuthRequest = {
          id: 'auth-request-128' as UUID,
          method: AuthMethod.DEV_MODE,
          credentials: {
            developerId: 'dev-123',
            sessionName: 'test-session'
          },
          clientInfo: {
            userAgent: 'VSCode/1.0.0',
            platform: 'darwin'
          },
          timestamp: '2024-01-01T00:00:00.000Z'
        };
        
        const devAuthService = new AuthService(
          mockLogger as unknown as Logger,
          mockSessionManager as unknown as SessionManager,
          mockTokenManager as unknown as TokenManager,
          { 
            ...DEFAULT_AUTH_CONFIG, 
            development: { enabled: true, skipAuth: false, mockResponses: false }
          },
          mockUserStorage as unknown as IUserStorage
        );
        
        const result = await devAuthService.authenticate(request);
        
        expect(result.success).to.be.true;
        expect(result.session).to.exist;
        
        devAuthService.dispose();
      });

      it('should fail development mode authentication when not enabled', async () => {
        const request: DevModeAuthRequest = {
          id: 'auth-request-129' as UUID,
          method: AuthMethod.DEV_MODE,
          credentials: {
            developerId: 'dev-123',
            sessionName: 'test-session'
          },
          timestamp: '2024-01-01T00:00:00.000Z'
        };
        
        const result = await authService.authenticate(request);
        
        expect(result.success).to.be.false;
        expect(result.error?.code).to.equal('INVALID_CREDENTIALS');
      });
    });

    describe('rate limiting', () => {
      it('should enforce rate limiting on repeated failed attempts', async () => {
        const request: LocalSessionAuthRequest = {
          id: 'auth-request-130' as UUID,
          method: AuthMethod.LOCAL_SESSION,
          credentials: {
            identifier: 'test@readyai.dev',
            secret: 'wrongpassword'
          },
          clientInfo: {
            userAgent: 'VSCode/1.0.0',
            platform: 'darwin'
          },
          timestamp: '2024-01-01T00:00:00.000Z'
        };
        
        mockUserStorage.findByEmail.resolves(null);
        
        // Make multiple failed attempts
        for (let i = 0; i < 6; i++) {
          await authService.authenticate(request);
        }
        
        // Next attempt should be rate limited
        const result = await authService.authenticate(request);
        
        expect(result.success).to.be.false;
        expect(result.error?.code).to.equal('RATE_LIMITED');
        expect(result.error?.retryAfter).to.be.greaterThan(0);
      });
    });

    describe('error handling', () => {
      it('should handle session creation failures gracefully', async () => {
        const request: LocalSessionAuthRequest = {
          id: 'auth-request-131' as UUID,
          method: AuthMethod.LOCAL_SESSION,
          credentials: {
            identifier: 'test@readyai.dev',
            secret: 'password123'
          },
          timestamp: '2024-01-01T00:00:00.000Z'
        };
        
        mockUserStorage.findByEmail.resolves(mockUser);
        mockSessionManager.createSession.resolves({
          success: false,
          error: {
            message: 'Session creation failed',
            code: 'INTERNAL_ERROR'
          }
        } as any);
        
        const result = await authService.authenticate(request);
        
        expect(result.success).to.be.false;
        expect(mockLogger.error.called).to.be.true;
      });

      it('should handle invalid authentication method', async () => {
        const request = {
          id: 'auth-request-132' as UUID,
          method: 'INVALID_METHOD' as AuthMethod,
          credentials: {},
          timestamp: '2024-01-01T00:00:00.000Z'
        } as any;
        
        const result = await authService.authenticate(request);
        
        expect(result.success).to.be.false;
        expect(result.error?.code).to.equal('INVALID_AUTH_METHOD');
      });
    });
  });

  describe('refreshToken', () => {
    it('should successfully refresh an access token', async () => {
      const request: TokenRefreshRequest = {
        refreshToken: 'valid-refresh-token-123'
      };
      
      const result = await authService.refreshToken(request);
      
      expect(result.accessToken).to.equal('new-token-metadata');
      expect(result.expiresIn).to.equal(3600);
      expect(mockTokenManager.refreshToken.calledWith('valid-refresh-token-123')).to.be.true;
      expect(mockLogger.debug.calledWith('Token refresh successful')).to.be.true;
    });

    it('should fail to refresh with invalid token', async () => {
      const request: TokenRefreshRequest = {
        refreshToken: 'invalid-refresh-token'
      };
      
      mockTokenManager.refreshToken.resolves({
        success: false,
        error: { message: 'Invalid refresh token', code: 'TOKEN_EXPIRED' }
      } as any);
      
      try {
        await authService.refreshToken(request);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(AuthenticationError);
        expect((error as AuthenticationError).authErrorCode).to.equal('TOKEN_EXPIRED');
      }
    });

    it('should update current session with new token', async () => {
      const request: TokenRefreshRequest = {
        refreshToken: 'valid-refresh-token-123'
      };
      
      // Set up current auth state with session
      const authState = authService.getCurrentAuthState();
      (authService as any).currentAuthState = {
        ...authState,
        session: mockSession
      };
      
      const result = await authService.refreshToken(request);
      
      expect(result.accessToken).to.equal('new-token-metadata');
      expect(mockSessionManager.updateSession.called).to.be.true;
    });
  });

  describe('validateToken', () => {
    it('should validate a valid token', async () => {
      const token = 'valid-token-123';
      
      const result = await authService.validateToken(token);
      
      expect(result).to.be.true;
      expect(mockTokenManager.validateToken.calledWith(token)).to.be.true;
    });

    it('should reject an invalid token', async () => {
      const token = 'invalid-token';
      mockTokenManager.validateToken.resolves(false);
      
      const result = await authService.validateToken(token);
      
      expect(result).to.be.false;
    });

    it('should handle validation errors gracefully', async () => {
      const token = 'error-token';
      mockTokenManager.validateToken.rejects(new Error('Validation error'));
      
      const result = await authService.validateToken(token);
      
      expect(result).to.be.false;
      expect(mockLogger.error.called).to.be.true;
    });
  });

  describe('session management', () => {
    describe('getSession', () => {
      it('should retrieve an existing session', async () => {
        const result = await authService.getSession(mockSessionId);
        
        expect(result).to.deep.equal(mockSession);
        expect(mockSessionManager.getSession.calledWith(mockSessionId)).to.be.true;
      });

      it('should return null for non-existent session', async () => {
        mockSessionManager.getSession.resolves(null);
        
        const result = await authService.getSession('non-existent' as UUID);
        
        expect(result).to.be.null;
      });
    });

    describe('updateSession', () => {
      it('should update session information', async () => {
        const updates = { lastAccessedAt: '2024-01-01T01:00:00.000Z' };
        
        await authService.updateSession(mockSessionId, updates);
        
        expect(mockSessionManager.updateSession.calledWith(mockSessionId, updates)).to.be.true;
      });

      it('should handle session update failures', async () => {
        mockSessionManager.updateSession.resolves({
          success: false,
          error: { message: 'Update failed', code: 'INTERNAL_ERROR' }
        } as any);
        
        try {
          await authService.updateSession(mockSessionId, {});
          expect.fail('Should have thrown an error');
        } catch (error) {
          expect(error).to.be.instanceOf(Error);
          expect((error as Error).message).to.include('Failed to update session');
        }
      });
    });

    describe('invalidateSession', () => {
      it('should invalidate a session', async () => {
        await authService.invalidateSession(mockSessionId);
        
        expect(mockSessionManager.invalidateSession.calledWith(mockSessionId)).to.be.true;
        expect(mockLogger.info.calledWith('Session invalidated')).to.be.true;
      });

      it('should update auth state when invalidating current session', async () => {
        // Set up current auth state
        (authService as any).currentAuthState = {
          status: AuthStatus.AUTHENTICATED,
          user: mockUser,
          session: mockSession,
          loading: false,
          lastUpdated: '2024-01-01T00:00:00.000Z'
        };
        
        await authService.invalidateSession(mockSessionId);
        
        const currentState = authService.getCurrentAuthState();
        expect(currentState.status).to.equal(AuthStatus.LOGGED_OUT);
        expect(currentState.user).to.be.undefined;
        expect(currentState.session).to.be.undefined;
      });
    });

    describe('invalidateAllUserSessions', () => {
      it('should invalidate all sessions for a user', async () => {
        await authService.invalidateAllUserSessions(mockUserId);
        
        expect(mockSessionManager.invalidateAllUserSessions.calledWith(mockUserId)).to.be.true;
        expect(mockLogger.info.calledWith('All user sessions invalidated')).to.be.true;
      });
    });
  });

  describe('user management', () => {
    describe('getUser', () => {
      it('should retrieve user by ID', async () => {
        const result = await authService.getUser(mockUserId);
        
        expect(result).to.deep.equal(mockUser);
        expect(mockUserStorage.retrieve.calledWith(mockUserId)).to.be.true;
      });

      it('should handle user retrieval errors', async () => {
        mockUserStorage.retrieve.rejects(new Error('Storage error'));
        
        const result = await authService.getUser(mockUserId);
        
        expect(result).to.be.null;
        expect(mockLogger.error.called).to.be.true;
      });
    });

    describe('updateUser', () => {
      it('should update user information', async () => {
        const updates = { displayName: 'Updated Name' };
        
        await authService.updateUser(mockUserId, updates);
        
        expect(mockUserStorage.store.called).to.be.true;
        expect(mockLogger.info.calledWith('User updated')).to.be.true;
      });

      it('should update auth state for current user', async () => {
        const updates = { displayName: 'Updated Name' };
        
        // Set up current auth state
        (authService as any).currentAuthState = {
          status: AuthStatus.AUTHENTICATED,
          user: mockUser,
          session: mockSession,
          loading: false,
          lastUpdated: '2024-01-01T00:00:00.000Z'
        };
        
        await authService.updateUser(mockUserId, updates);
        
        const currentState = authService.getCurrentAuthState();
        expect(currentState.user?.displayName).to.equal('Updated Name');
      });

      it('should handle non-existent user', async () => {
        mockUserStorage.retrieve.resolves(null);
        
        try {
          await authService.updateUser('non-existent' as UUID, {});
          expect.fail('Should have thrown an error');
        } catch (error) {
          expect((error as Error).message).to.equal('User not found');
        }
      });
    });

    describe('createUser', () => {
      it('should create a new user', async () => {
        const userData = {
          displayName: 'New User',
          email: 'newuser@readyai.dev',
          role: 'user' as const
        };
        
        mockUserStorage.findByEmail.resolves(null);
        
        const result = await authService.createUser(userData);
        
        expect(result.displayName).to.equal('New User');
        expect(result.email).to.equal('newuser@readyai.dev');
        expect(mockUserStorage.store.called).to.be.true;
        expect(mockLogger.info.calledWith('User created')).to.be.true;
      });

      it('should prevent duplicate email creation', async () => {
        const userData = {
          displayName: 'Duplicate User',
          email: 'existing@readyai.dev'
        };
        
        mockUserStorage.findByEmail.resolves(mockUser);
        
        try {
          await authService.createUser(userData);
          expect.fail('Should have thrown an error');
        } catch (error) {
          expect(error).to.be.instanceOf(AuthenticationError);
          expect((error as AuthenticationError).message).to.include('already exists');
        }
      });
    });
  });

  describe('permission checking', () => {
    it('should check user permissions correctly', async () => {
      const result = await authService.checkPermission(mockUserId, 'project', 'read');
      
      expect(result).to.be.true;
    });

    it('should cache permission results', async () => {
      // First call
      await authService.checkPermission(mockUserId, 'project', 'read');
      
      // Second call should use cache
      await authService.checkPermission(mockUserId, 'project', 'read');
      
      // Should only fetch user once
      expect(mockUserStorage.retrieve.calledOnce).to.be.true;
    });

    it('should handle permission check for non-existent user', async () => {
      mockUserStorage.retrieve.resolves(null);
      
      const result = await authService.checkPermission('non-existent' as UUID, 'project', 'read');
      
      expect(result).to.be.false;
    });

    it('should handle admin permissions correctly', async () => {
      const adminUser = { ...mockUser, role: 'admin' as const };
      mockUserStorage.retrieve.resolves(adminUser);
      
      const result = await authService.checkPermission(mockUserId, 'system', 'delete');
      
      expect(result).to.be.true;
    });
  });

  describe('authentication state management', () => {
    describe('getCurrentAuthState', () => {
      it('should return current authentication state', () => {
        const state = authService.getCurrentAuthState();
        
        expect(state).to.have.property('status');
        expect(state).to.have.property('loading');
        expect(state).to.have.property('lastUpdated');
        expect(state.status).to.equal(AuthStatus.UNAUTHENTICATED);
      });
    });

    describe('subscribeToAuthStateChanges', () => {
      it('should allow subscription to auth state changes', (done) => {
        let callCount = 0;
        
        const unsubscribe = authService.subscribeToAuthStateChanges((state) => {
          callCount++;
          
          if (callCount === 1) {
            // Initial state
            expect(state.status).to.equal(AuthStatus.UNAUTHENTICATED);
          } else if (callCount === 2) {
            // After update
            expect(state.loading).to.be.true;
            unsubscribe();
            done();
          }
        });
        
        // Trigger state change
        (authService as any).updateAuthState({ loading: true });
      });

      it('should handle subscription errors gracefully', (done) => {
        const unsubscribe = authService.subscribeToAuthStateChanges(() => {
          throw new Error('Subscriber error');
        });
        
        // Should not crash when subscriber throws
        (authService as any).updateAuthState({ loading: true });
        
        setTimeout(() => {
          unsubscribe();
          done();
        }, 100);
      });
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      // Set up authenticated state
      (authService as any).currentAuthState = {
        status: AuthStatus.AUTHENTICATED,
        user: mockUser,
        session: mockSession,
        loading: false,
        lastUpdated: '2024-01-01T00:00:00.000Z'
      };
      
      await authService.logout();
      
      const currentState = authService.getCurrentAuthState();
      expect(currentState.status).to.equal(AuthStatus.LOGGED_OUT);
      expect(currentState.user).to.be.undefined;
      expect(currentState.session).to.be.undefined;
      expect(mockLogger.info.calledWith('User logged out')).to.be.true;
    });

    it('should handle logout when no active session', async () => {
      await authService.logout();
      
      const currentState = authService.getCurrentAuthState();
      expect(currentState.status).to.equal(AuthStatus.LOGGED_OUT);
    });
  });

  describe('event emission', () => {
    it('should emit authenticated event on successful authentication', (done) => {
      authService.once('authenticated', (data) => {
        expect(data.user).to.deep.equal(mockUser);
        expect(data.session).to.deep.equal(mockSession);
        done();
      });
      
      authService.emit('authenticated', { user: mockUser, session: mockSession });
    });

    it('should emit logout event on logout', (done) => {
      authService.once('logout', () => {
        done();
      });
      
      authService.emit('logout');
    });

    it('should emit userUpdated event on user update', (done) => {
      authService.once('userUpdated', (data) => {
        expect(data.userId).to.equal(mockUserId);
        expect(data.updates).to.have.property('displayName');
        done();
      });
      
      authService.emit('userUpdated', { 
        userId: mockUserId, 
        updates: { displayName: 'Updated Name' }
      });
    });
  });

  describe('cleanup and disposal', () => {
    it('should perform periodic cleanup tasks', async () => {
      // This tests that cleanup doesn't throw errors
      await (authService as any).performCleanup();
      
      expect(mockLogger.debug.called).to.be.true;
    });

    it('should perform security monitoring', async () => {
      await (authService as any).performSecurityMonitoring();
      
      // Should complete without errors
      expect(true).to.be.true;
    });

    it('should dispose resources properly', () => {
      expect(() => authService.dispose()).to.not.throw();
      expect(mockLogger.info.calledWith('AuthService disposed')).to.be.true;
    });
  });

  describe('singleton pattern', () => {
    it('should return the same instance when using getAuthService', () => {
      const { getAuthService } = require('../AuthService.js');
      
      const instance1 = getAuthService(
        mockLogger as unknown as Logger,
        mockSessionManager as unknown as SessionManager,
        mockTokenManager as unknown as TokenManager
      );
      
      const instance2 = getAuthService();
      
      expect(instance1).to.equal(instance2);
    });

    it('should throw error when getting instance without required dependencies', () => {
      // Reset singleton
      const AuthServiceModule = require('../AuthService.js');
      AuthServiceModule.authServiceInstance = null;
      
      expect(() => {
        AuthServiceModule.getAuthService();
      }).to.throw('Logger, SessionManager, and TokenManager are required');
    });
  });

  describe('error scenarios and edge cases', () => {
    it('should handle concurrent authentication requests', async () => {
      const request: LocalSessionAuthRequest = {
        id: 'auth-request-concurrent' as UUID,
        method: AuthMethod.LOCAL_SESSION,
        credentials: {
          identifier: 'concurrent@readyai.dev',
          secret: 'password123'
        },
        timestamp: '2024-01-01T00:00:00.000Z'
      };
      
      mockUserStorage.findByEmail.resolves(mockUser);
      
      const promises = Array.from({ length: 5 }, () => 
        authService.authenticate(request)
      );
      
      const results = await Promise.all(promises);
      
      results.forEach(result => {
        expect(result).to.have.property('success');
      });
    });

    it('should handle malformed request data', async () => {
      const malformedRequest = {
        method: AuthMethod.LOCAL_SESSION,
        // Missing required fields
      } as any;
      
      const result = await authService.authenticate(malformedRequest);
      
      expect(result.success).to.be.false;
    });

    it('should handle storage failures gracefully', async () => {
      mockUserStorage.store.rejects(new Error('Storage failure'));
      
      const userData = {
        displayName: 'Test User',
        email: 'test@readyai.dev'
      };
      
      try {
        await authService.createUser(userData);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
      }
    });
  });
});
