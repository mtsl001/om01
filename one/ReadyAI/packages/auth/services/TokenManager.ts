// packages/auth/services/TokenManager.ts

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { LogLevel, Logger } from '../../core/contracts/ILogger';
import { UUID } from '../../core/contracts/Common';
import { ApiResponse, ErrorCode, createApiResponse, createErrorResponse } from '../../core/contracts/ApiResponse';

/**
 * Token types supported by the TokenManager
 */
export enum TokenType {
    ACCESS = 'access',
    REFRESH = 'refresh',
    SESSION = 'session'
}

/**
 * Token metadata interface
 */
export interface TokenMetadata {
    id: UUID;
    userId: UUID;
    type: TokenType;
    expiresAt: Date;
    issuedAt: Date;
    lastUsedAt?: Date;
    scopes?: string[];
    clientId?: string;
}

/**
 * Token storage interface for different storage backends
 */
export interface ITokenStorage {
    store(key: string, value: string): Promise<void>;
    retrieve(key: string): Promise<string | null>;
    remove(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    clear(): Promise<void>;
}

/**
 * Secure local token storage implementation using encryption
 */
class EncryptedLocalStorage implements ITokenStorage {
    private readonly encryptionKey: Buffer;
    private readonly algorithm = 'aes-256-gcm';

    constructor(encryptionKey?: string) {
        this.encryptionKey = encryptionKey 
            ? Buffer.from(encryptionKey, 'hex')
            : crypto.randomBytes(32);
    }

    private encrypt(text: string): string {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipher(this.algorithm, this.encryptionKey);
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag();
        return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
    }

    private decrypt(encryptedData: string): string {
        const parts = encryptedData.split(':');
        if (parts.length !== 3) {
            throw new Error('Invalid encrypted data format');
        }

        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const encrypted = parts[2];

        const decipher = crypto.createDecipher(this.algorithm, this.encryptionKey);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }

    async store(key: string, value: string): Promise<void> {
        try {
            const encrypted = this.encrypt(value);
            // Use localStorage or similar persistent storage
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(`readyai_token_${key}`, encrypted);
            }
        } catch (error) {
            throw new Error(`Failed to store token: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async retrieve(key: string): Promise<string | null> {
        try {
            if (typeof localStorage === 'undefined') {
                return null;
            }
            
            const encrypted = localStorage.getItem(`readyai_token_${key}`);
            if (!encrypted) {
                return null;
            }
            
            return this.decrypt(encrypted);
        } catch (error) {
            console.warn(`Failed to retrieve token ${key}:`, error);
            return null;
        }
    }

    async remove(key: string): Promise<void> {
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(`readyai_token_${key}`);
        }
    }

    async exists(key: string): Promise<boolean> {
        if (typeof localStorage === 'undefined') {
            return false;
        }
        return localStorage.getItem(`readyai_token_${key}`) !== null;
    }

    async clear(): Promise<void> {
        if (typeof localStorage === 'undefined') {
            return;
        }
        
        const keys = Object.keys(localStorage).filter(key => key.startsWith('readyai_token_'));
        keys.forEach(key => localStorage.removeItem(key));
    }
}

/**
 * TokenManager handles JWT token creation, validation, storage, and lifecycle management
 * Adapted from Cline's StateManager secrets handling patterns with ReadyAI-specific enhancements
 */
export class TokenManager extends EventEmitter {
    private readonly logger: Logger;
    private readonly storage: ITokenStorage;
    private readonly jwtSecret: string;
    private readonly defaultExpiration: number = 3600; // 1 hour in seconds
    private readonly refreshThreshold: number = 300; // 5 minutes in seconds
    
    // In-memory token cache for performance
    private tokenCache = new Map<string, { token: string; metadata: TokenMetadata; cachedAt: number }>();
    private readonly cacheTimeout = 30000; // 30 seconds

    constructor(
        logger: Logger,
        jwtSecret?: string,
        storage?: ITokenStorage
    ) {
        super();
        
        this.logger = logger;
        this.jwtSecret = jwtSecret || this.generateSecureSecret();
        this.storage = storage || new EncryptedLocalStorage();
        
        // Set up periodic cleanup
        setInterval(() => this.cleanupExpiredTokens(), 60000); // Every minute
        
        this.logger.log(LogLevel.INFO, 'TokenManager', 'TokenManager initialized');
    }

    /**
     * Generate a secure JWT token
     */
    async generateToken(
        userId: UUID,
        type: TokenType = TokenType.ACCESS,
        options: {
            expiresIn?: number;
            scopes?: string[];
            clientId?: string;
        } = {}
    ): Promise<ApiResponse<{ token: string; metadata: TokenMetadata }>> {
        try {
            const tokenId = crypto.randomUUID() as UUID;
            const now = new Date();
            const expiresIn = options.expiresIn || this.defaultExpiration;
            const expiresAt = new Date(now.getTime() + (expiresIn * 1000));

            const metadata: TokenMetadata = {
                id: tokenId,
                userId,
                type,
                expiresAt,
                issuedAt: now,
                scopes: options.scopes,
                clientId: options.clientId
            };

            const payload = {
                jti: tokenId,
                sub: userId,
                type,
                iat: Math.floor(now.getTime() / 1000),
                exp: Math.floor(expiresAt.getTime() / 1000),
                scopes: options.scopes,
                clientId: options.clientId
            };

            const token = jwt.sign(payload, this.jwtSecret, {
                algorithm: 'HS256'
            });

            // Store token metadata
            await this.storeTokenMetadata(tokenId, metadata);
            
            // Cache the token
            this.cacheToken(tokenId, token, metadata);

            this.logger.log(LogLevel.DEBUG, 'TokenManager', `Generated ${type} token for user ${userId}`);
            this.emit('tokenGenerated', { tokenId, userId, type });

            return createApiResponse({
                token,
                metadata
            });

        } catch (error) {
            this.logger.log(LogLevel.ERROR, 'TokenManager', `Failed to generate token: ${error}`);
            return createErrorResponse(
                ErrorCode.INTERNAL_ERROR,
                'Failed to generate token',
                { error: error instanceof Error ? error.message : 'Unknown error' }
            );
        }
    }

    /**
     * Validate and decode a JWT token
     */
    async validateToken(token: string): Promise<ApiResponse<TokenMetadata>> {
        try {
            // Check cache first
            const cached = this.getCachedToken(token);
            if (cached && this.isTokenValid(cached.metadata)) {
                await this.updateLastUsed(cached.metadata.id);
                return createApiResponse(cached.metadata);
            }

            // Verify JWT signature and decode
            const decoded = jwt.verify(token, this.jwtSecret) as any;
            
            if (!decoded.jti || !decoded.sub || !decoded.type) {
                return createErrorResponse(
                    ErrorCode.VALIDATION_ERROR,
                    'Invalid token format'
                );
            }

            // Retrieve stored metadata
            const metadata = await this.getTokenMetadata(decoded.jti);
            if (!metadata) {
                return createErrorResponse(
                    ErrorCode.NOT_FOUND,
                    'Token not found'
                );
            }

            // Check if token is expired or revoked
            if (!this.isTokenValid(metadata)) {
                await this.revokeToken(decoded.jti);
                return createErrorResponse(
                    ErrorCode.UNAUTHORIZED,
                    'Token expired or invalid'
                );
            }

            // Update last used timestamp
            await this.updateLastUsed(decoded.jti);
            
            // Update cache
            this.cacheToken(decoded.jti, token, metadata);

            this.logger.log(LogLevel.DEBUG, 'TokenManager', `Validated token ${decoded.jti}`);

            return createApiResponse(metadata);

        } catch (error) {
            this.logger.log(LogLevel.WARN, 'TokenManager', `Token validation failed: ${error}`);
            return createErrorResponse(
                ErrorCode.UNAUTHORIZED,
                'Invalid token',
                { error: error instanceof Error ? error.message : 'Unknown error' }
            );
        }
    }

    /**
     * Revoke a token by ID
     */
    async revokeToken(tokenId: UUID): Promise<ApiResponse<void>> {
        try {
            await this.storage.remove(`metadata_${tokenId}`);
            
            // Remove from cache
            const cacheEntries = Array.from(this.tokenCache.entries());
            const cacheEntry = cacheEntries.find(([_, data]) => data.metadata.id === tokenId);
            if (cacheEntry) {
                this.tokenCache.delete(cacheEntry[0]);
            }

            this.logger.log(LogLevel.INFO, 'TokenManager', `Revoked token ${tokenId}`);
            this.emit('tokenRevoked', { tokenId });

            return createApiResponse(undefined);

        } catch (error) {
            this.logger.log(LogLevel.ERROR, 'TokenManager', `Failed to revoke token: ${error}`);
            return createErrorResponse(
                ErrorCode.INTERNAL_ERROR,
                'Failed to revoke token'
            );
        }
    }

    /**
     * Refresh an access token using a refresh token
     */
    async refreshToken(refreshToken: string): Promise<ApiResponse<{ token: string; metadata: TokenMetadata }>> {
        const validationResult = await this.validateToken(refreshToken);
        
        if (!validationResult.success) {
            return validationResult as any;
        }

        const refreshMetadata = validationResult.data;
        
        if (refreshMetadata.type !== TokenType.REFRESH) {
            return createErrorResponse(
                ErrorCode.VALIDATION_ERROR,
                'Invalid token type for refresh'
            );
        }

        // Generate new access token
        return await this.generateToken(
            refreshMetadata.userId,
            TokenType.ACCESS,
            {
                scopes: refreshMetadata.scopes,
                clientId: refreshMetadata.clientId
            }
        );
    }

    /**
     * Check if a token needs to be refreshed soon
     */
    async shouldRefreshToken(token: string): Promise<boolean> {
        const validationResult = await this.validateToken(token);
        if (!validationResult.success) {
            return false;
        }

        const metadata = validationResult.data;
        const now = new Date();
        const refreshTime = new Date(metadata.expiresAt.getTime() - (this.refreshThreshold * 1000));
        
        return now >= refreshTime;
    }

    /**
     * Clean up expired tokens
     */
    private async cleanupExpiredTokens(): Promise<void> {
        try {
            // This would ideally iterate through all stored tokens
            // For now, we'll clean up the cache
            const now = Date.now();
            for (const [key, cachedData] of this.tokenCache.entries()) {
                if (now - cachedData.cachedAt > this.cacheTimeout || 
                    !this.isTokenValid(cachedData.metadata)) {
                    this.tokenCache.delete(key);
                }
            }

            this.logger.log(LogLevel.DEBUG, 'TokenManager', 'Cleaned up expired tokens from cache');
            
        } catch (error) {
            this.logger.log(LogLevel.ERROR, 'TokenManager', `Failed to cleanup expired tokens: ${error}`);
        }
    }

    /**
     * Generate a secure secret for JWT signing
     */
    private generateSecureSecret(): string {
        return crypto.randomBytes(64).toString('hex');
    }

    /**
     * Store token metadata
     */
    private async storeTokenMetadata(tokenId: UUID, metadata: TokenMetadata): Promise<void> {
        await this.storage.store(`metadata_${tokenId}`, JSON.stringify(metadata));
    }

    /**
     * Retrieve token metadata
     */
    private async getTokenMetadata(tokenId: UUID): Promise<TokenMetadata | null> {
        const data = await this.storage.retrieve(`metadata_${tokenId}`);
        if (!data) {
            return null;
        }

        try {
            const parsed = JSON.parse(data);
            return {
                ...parsed,
                expiresAt: new Date(parsed.expiresAt),
                issuedAt: new Date(parsed.issuedAt),
                lastUsedAt: parsed.lastUsedAt ? new Date(parsed.lastUsedAt) : undefined
            };
        } catch {
            return null;
        }
    }

    /**
     * Update last used timestamp
     */
    private async updateLastUsed(tokenId: UUID): Promise<void> {
        const metadata = await this.getTokenMetadata(tokenId);
        if (metadata) {
            metadata.lastUsedAt = new Date();
            await this.storeTokenMetadata(tokenId, metadata);
        }
    }

    /**
     * Check if token is valid (not expired)
     */
    private isTokenValid(metadata: TokenMetadata): boolean {
        return new Date() < metadata.expiresAt;
    }

    /**
     * Cache token for performance
     */
    private cacheToken(tokenId: UUID, token: string, metadata: TokenMetadata): void {
        this.tokenCache.set(token, {
            token,
            metadata,
            cachedAt: Date.now()
        });

        // Limit cache size
        if (this.tokenCache.size > 100) {
            const firstKey = this.tokenCache.keys().next().value;
            this.tokenCache.delete(firstKey);
        }
    }

    /**
     * Get cached token data
     */
    private getCachedToken(token: string): { token: string; metadata: TokenMetadata; cachedAt: number } | null {
        const cached = this.tokenCache.get(token);
        if (!cached) {
            return null;
        }

        // Check if cache entry is too old
        if (Date.now() - cached.cachedAt > this.cacheTimeout) {
            this.tokenCache.delete(token);
            return null;
        }

        return cached;
    }

    /**
     * Clear all tokens and cache
     */
    async clearAllTokens(): Promise<ApiResponse<void>> {
        try {
            await this.storage.clear();
            this.tokenCache.clear();
            
            this.logger.log(LogLevel.INFO, 'TokenManager', 'Cleared all tokens');
            this.emit('allTokensCleared');

            return createApiResponse(undefined);

        } catch (error) {
            this.logger.log(LogLevel.ERROR, 'TokenManager', `Failed to clear all tokens: ${error}`);
            return createErrorResponse(
                ErrorCode.INTERNAL_ERROR,
                'Failed to clear tokens'
            );
        }
    }
}

// Export singleton instance getter for convenience
let tokenManagerInstance: TokenManager | null = null;

export function getTokenManager(
    logger?: Logger,
    jwtSecret?: string,
    storage?: ITokenStorage
): TokenManager {
    if (!tokenManagerInstance) {
        if (!logger) {
            throw new Error('Logger is required for TokenManager initialization');
        }
        tokenManagerInstance = new TokenManager(logger, jwtSecret, storage);
    }
    return tokenManagerInstance;
}

export default TokenManager;
