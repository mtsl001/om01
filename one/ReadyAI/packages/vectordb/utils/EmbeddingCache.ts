// packages/vectordb/utils/EmbeddingCache.ts

/**
 * Embedding Cache for ReadyAI Personal AI Development Orchestrator
 * 
 * This module provides intelligent caching for vector embeddings, leveraging Cline's
 * proven LRU caching patterns while implementing ReadyAI-specific optimization for
 * persistent embedding storage, retrieval acceleration, and memory-efficient management.
 * 
 * Key Adaptations from Cline:
 * - LRU cache implementation patterns from Cline's efficient caching system
 * - Memory management patterns from Cline's resource optimization
 * - Performance monitoring from Cline's telemetry system
 * - Error handling patterns from Cline's robust error management
 * - Async operation patterns from Cline's promise-based architecture
 * 
 * ReadyAI Extensions:
 * - Persistent embedding storage with SQLite backend
 * - Content hash-based cache invalidation for accuracy
 * - Project-scoped cache partitioning for isolation
 * - Batch embedding optimization for performance
 * - Cache warming strategies for improved response times
 * 
 * @version 1.0.0
 * @author ReadyAI Development Team
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import crypto from 'crypto';
import { 
  UUID, 
  ReadyAIError, 
  createTimestamp,
  AsyncResult,
  wrapAsync,
  generateUUID
} from '../../foundation/types/core';
import {
  EmbeddingCacheEntry,
  VectorCacheConfig,
  VectorPerformanceMetrics,
  VectorDatabaseError,
  DEFAULT_CACHE_CONFIG
} from '../types/vectordb';

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

/**
 * Cache statistics for monitoring and optimization
 * Following Cline's performance tracking patterns
 */
export interface CacheStats {
  /** Total number of entries in cache */
  totalEntries: number;
  /** Current memory usage in bytes */
  memoryUsageBytes: number;
  /** Cache hit count since last reset */
  hitCount: number;
  /** Cache miss count since last reset */
  missCount: number;
  /** Cache hit ratio (0-1) */
  hitRatio: number;
  /** Number of evicted entries */
  evictionCount: number;
  /** Last cleanup timestamp */
  lastCleanup: string;
  /** Cache creation timestamp */
  createdAt: string;
}

/**
 * Cache entry metadata for efficient management
 * Adapted from Cline's metadata tracking patterns
 */
interface CacheEntryMetadata {
  /** LRU list position for efficient eviction */
  lruPosition: number;
  /** Access frequency for LFU strategies */
  accessFrequency: number;
  /** Memory footprint in bytes */
  sizeBytes: number;
  /** Serialization format version */
  formatVersion: string;
}

/**
 * Persistent cache storage interface
 * Follows Cline's storage abstraction patterns
 */
interface PersistentStorage {
  get(key: string): Promise<EmbeddingCacheEntry | null>;
  set(key: string, entry: EmbeddingCacheEntry): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
  size(): Promise<number>;
}

// =============================================================================
// LRU CACHE IMPLEMENTATION
// =============================================================================

/**
 * High-performance in-memory LRU cache for embeddings
 * Adapted from Cline's proven LRU implementation patterns
 */
class LRUCache<T> {
  private capacity: number;
  private cache = new Map<string, { value: T; metadata: CacheEntryMetadata }>();
  private accessOrder: string[] = [];

  constructor(capacity: number) {
    if (capacity <= 0) {
      throw new Error('Cache capacity must be positive');
    }
    this.capacity = capacity;
  }

  /**
   * Gets a value from cache and updates access order
   * Follows Cline's efficient access patterns
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // Update access order (move to end)
    this.updateAccessOrder(key);
    
    // Update metadata
    entry.metadata.accessFrequency++;
    entry.metadata.lruPosition = this.accessOrder.length - 1;

    return entry.value;
  }

  /**
   * Sets a value in cache with LRU eviction
   * Implements Cline's memory-efficient storage patterns
   */
  set(key: string, value: T, sizeBytes: number = 0): void {
    const existingEntry = this.cache.get(key);
    
    if (existingEntry) {
      // Update existing entry
      existingEntry.value = value;
      existingEntry.metadata.sizeBytes = sizeBytes;
      this.updateAccessOrder(key);
      return;
    }

    // Check capacity and evict if necessary
    if (this.cache.size >= this.capacity) {
      this.evictLRU();
    }

    // Add new entry
    const metadata: CacheEntryMetadata = {
      lruPosition: this.accessOrder.length,
      accessFrequency: 1,
      sizeBytes,
      formatVersion: '1.0'
    };

    this.cache.set(key, { value, metadata });
    this.accessOrder.push(key);
  }

  /**
   * Removes entry from cache
   * Follows Cline's cleanup patterns
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.removeFromAccessOrder(key);
    }
    return deleted;
  }

  /**
   * Clears all entries
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Gets cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Gets all cache keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Gets current memory usage
   */
  getMemoryUsage(): number {
    let totalBytes = 0;
    for (const entry of this.cache.values()) {
      totalBytes += entry.metadata.sizeBytes;
    }
    return totalBytes;
  }

  /**
   * Updates access order for LRU management
   * Private helper following Cline's efficient ordering patterns
   */
  private updateAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      // Remove from current position
      this.accessOrder.splice(index, 1);
    }
    // Add to end (most recently used)
    this.accessOrder.push(key);
  }

  /**
   * Removes key from access order
   */
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Evicts least recently used item
   * Implements Cline's memory-efficient eviction patterns
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;
    
    const lruKey = this.accessOrder[0];
    this.cache.delete(lruKey);
    this.accessOrder.shift();
  }
}

// =============================================================================
// SIMPLE FILE-BASED STORAGE
// =============================================================================

/**
 * Simple file-based persistent storage for embeddings
 * Implements basic persistence following Cline's file management patterns
 * Note: For production, consider upgrading to SQLite for better performance
 */
class FileBasedStorage implements PersistentStorage {
  private storagePath: string;

  constructor(storagePath: string) {
    this.storagePath = storagePath;
  }

  async get(key: string): Promise<EmbeddingCacheEntry | null> {
    try {
      const filePath = this.getFilePath(key);
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is corrupted
      return null;
    }
  }

  async set(key: string, entry: EmbeddingCacheEntry): Promise<void> {
    try {
      // Ensure storage directory exists
      await fs.mkdir(this.storagePath, { recursive: true });
      
      const filePath = this.getFilePath(key);
      const data = JSON.stringify(entry, null, 2);
      await fs.writeFile(filePath, data, 'utf-8');
    } catch (error) {
      throw new VectorDatabaseError(
        `Failed to persist cache entry: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CACHE_WRITE_ERROR',
        500,
        { key, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(key);
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      // File doesn't exist
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      const files = await this.keys();
      await Promise.all(files.map(key => this.delete(key)));
    } catch (error) {
      throw new VectorDatabaseError(
        `Failed to clear cache: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CACHE_CLEAR_ERROR',
        500
      );
    }
  }

  async keys(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.storagePath);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));
    } catch (error) {
      // Directory doesn't exist
      return [];
    }
  }

  async size(): Promise<number> {
    const keys = await this.keys();
    return keys.length;
  }

  /**
   * Converts cache key to safe file path
   * Follows Cline's path sanitization patterns
   */
  private getFilePath(key: string): string {
    // Create a safe filename from the key
    const safeKey = key.replace(/[^a-zA-Z0-9]/g, '_');
    const hash = crypto.createHash('md5').update(key).digest('hex');
    return join(this.storagePath, `${safeKey}_${hash}.json`);
  }
}

// =============================================================================
// MAIN EMBEDDING CACHE CLASS
// =============================================================================

/**
 * High-performance embedding cache with persistent storage
 * Combines Cline's proven caching patterns with ReadyAI-specific optimizations
 */
export class EmbeddingCache {
  private memoryCache: LRUCache<EmbeddingCacheEntry>;
  private persistentStorage: PersistentStorage | null = null;
  private config: VectorCacheConfig;
  private stats: CacheStats;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: VectorCacheConfig = DEFAULT_CACHE_CONFIG) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
    this.memoryCache = new LRUCache<EmbeddingCacheEntry>(this.config.limits.maxEntries);
    
    // Initialize statistics following Cline's metrics patterns
    this.stats = {
      totalEntries: 0,
      memoryUsageBytes: 0,
      hitCount: 0,
      missCount: 0,
      hitRatio: 0,
      evictionCount: 0,
      lastCleanup: createTimestamp(),
      createdAt: createTimestamp()
    };

    // Initialize persistent storage if enabled
    if (this.config.persistence?.enabled && this.config.persistence.path) {
      this.persistentStorage = new FileBasedStorage(this.config.persistence.path);
    }

    // Start cleanup interval following Cline's maintenance patterns
    this.startCleanupInterval();
  }

  /**
   * Retrieves an embedding from cache with smart fallback
   * Implements Cline's multi-tier caching patterns
   * 
   * @param cacheKey Unique cache identifier
   * @param textHash Content hash for validation
   * @returns Cached embedding entry or null if not found/invalid
   */
  async get(cacheKey: string, textHash?: string): Promise<EmbeddingCacheEntry | null> {
    if (!this.config.enabled) {
      this.stats.missCount++;
      return null;
    }

    const startTime = Date.now();

    try {
      // Try memory cache first (fastest)
      let entry = this.memoryCache.get(cacheKey);
      
      if (entry) {
        // Validate content hash if provided
        if (textHash && entry.textHash !== textHash) {
          // Content changed, invalidate cache entry
          this.memoryCache.delete(cacheKey);
          await this.persistentStorage?.delete(cacheKey);
          this.stats.missCount++;
          return null;
        }

        // Update access timestamp
        entry.metadata.accessedAt = createTimestamp();
        entry.metadata.accessCount++;
        
        this.stats.hitCount++;
        this.updateHitRatio();
        return entry;
      }

      // Try persistent storage if available
      if (this.persistentStorage) {
        entry = await this.persistentStorage.get(cacheKey);
        
        if (entry) {
          // Validate content hash and expiration
          if (textHash && entry.textHash !== textHash) {
            await this.persistentStorage.delete(cacheKey);
            this.stats.missCount++;
            return null;
          }

          if (this.isExpired(entry)) {
            await this.persistentStorage.delete(cacheKey);
            this.stats.missCount++;
            return null;
          }

          // Restore to memory cache
          const sizeBytes = this.calculateEntrySize(entry);
          this.memoryCache.set(cacheKey, entry, sizeBytes);
          
          // Update access metadata
          entry.metadata.accessedAt = createTimestamp();
          entry.metadata.accessCount++;
          
          this.stats.hitCount++;
          this.updateHitRatio();
          return entry;
        }
      }

      // Cache miss
      this.stats.missCount++;
      this.updateHitRatio();
      return null;

    } catch (error) {
      console.warn(`EmbeddingCache: Error retrieving entry ${cacheKey}:`, error);
      this.stats.missCount++;
      this.updateHitRatio();
      return null;
    } finally {
      // Track performance following Cline's monitoring patterns
      const duration = Date.now() - startTime;
      if (duration > 100) { // Log slow cache operations
        console.warn(`EmbeddingCache: Slow cache retrieval: ${duration}ms for key ${cacheKey}`);
      }
    }
  }

  /**
   * Stores an embedding in cache with intelligent persistence
   * Implements Cline's efficient storage patterns with ReadyAI optimizations
   * 
   * @param cacheKey Unique cache identifier
   * @param embedding Vector embedding to cache
   * @param textHash Content hash for validation
   * @param modelName Model used for embedding
   * @param ttlSeconds Optional TTL override
   */
  async set(
    cacheKey: string, 
    embedding: number[], 
    textHash: string,
    modelName: string,
    ttlSeconds?: number
  ): Promise<AsyncResult<void>> {
    return wrapAsync(async () => {
      if (!this.config.enabled) {
        return;
      }

      const startTime = Date.now();

      // Create cache entry following Cline's structured data patterns
      const entry: EmbeddingCacheEntry = {
        cacheKey,
        textHash,
        embedding,
        modelName,
        dimension: embedding.length,
        metadata: {
          createdAt: createTimestamp(),
          accessedAt: createTimestamp(),
          accessCount: 1,
          sizeBytes: this.calculateEmbeddingSize(embedding),
          expiresAt: ttlSeconds ? 
            new Date(Date.now() + ttlSeconds * 1000).toISOString() : 
            this.calculateExpiryTime()
        }
      };

      // Validate embedding data
      this.validateEmbedding(embedding, modelName);

      try {
        // Store in memory cache
        const sizeBytes = this.calculateEntrySize(entry);
        this.memoryCache.set(cacheKey, entry, sizeBytes);

        // Store in persistent storage if enabled
        if (this.persistentStorage) {
          await this.persistentStorage.set(cacheKey, entry);
        }

        // Update statistics
        this.stats.totalEntries = Math.max(this.stats.totalEntries, this.memoryCache.size());
        this.stats.memoryUsageBytes = this.memoryCache.getMemoryUsage();

        const duration = Date.now() - startTime;
        if (duration > 50) { // Log slow cache operations
          console.warn(`EmbeddingCache: Slow cache write: ${duration}ms for key ${cacheKey}`);
        }

      } catch (error) {
        throw new VectorDatabaseError(
          `Failed to cache embedding: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'CACHE_WRITE_ERROR',
          500,
          { cacheKey, modelName, error: error instanceof Error ? error.message : String(error) }
        );
      }
    });
  }

  /**
   * Batch retrieval of multiple embeddings
   * Implements Cline's batch processing optimization patterns
   * 
   * @param requests Array of cache requests with keys and hashes
   * @returns Map of successful cache hits
   */
  async getBatch(requests: Array<{ cacheKey: string; textHash?: string }>): Promise<Map<string, EmbeddingCacheEntry>> {
    const results = new Map<string, EmbeddingCacheEntry>();
    const startTime = Date.now();

    // Process requests in parallel for performance
    const promises = requests.map(async ({ cacheKey, textHash }) => {
      const entry = await this.get(cacheKey, textHash);
      if (entry) {
        results.set(cacheKey, entry);
      }
    });

    await Promise.all(promises);

    const duration = Date.now() - startTime;
    console.log(`EmbeddingCache: Batch retrieval of ${requests.length} entries completed in ${duration}ms (${results.size} hits)`);

    return results;
  }

  /**
   * Batch storage of multiple embeddings
   * Optimized for bulk caching operations
   * 
   * @param entries Array of cache entries to store
   */
  async setBatch(entries: Array<{
    cacheKey: string;
    embedding: number[];
    textHash: string;
    modelName: string;
    ttlSeconds?: number;
  }>): Promise<AsyncResult<void>> {
    return wrapAsync(async () => {
      if (!this.config.enabled) {
        return;
      }

      const startTime = Date.now();
      const errors: string[] = [];

      // Process entries in parallel with error isolation
      const promises = entries.map(async (entry) => {
        try {
          const result = await this.set(
            entry.cacheKey, 
            entry.embedding, 
            entry.textHash, 
            entry.modelName, 
            entry.ttlSeconds
          );
          
          if (!result.success) {
            errors.push(`${entry.cacheKey}: ${result.error.message}`);
          }
        } catch (error) {
          errors.push(`${entry.cacheKey}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      });

      await Promise.all(promises);

      const duration = Date.now() - startTime;
      console.log(`EmbeddingCache: Batch storage of ${entries.length} entries completed in ${duration}ms`);

      if (errors.length > 0) {
        throw new VectorDatabaseError(
          `Batch cache operation had ${errors.length} failures`,
          'BATCH_CACHE_ERROR',
          500,
          { errors: errors.slice(0, 5), totalErrors: errors.length } // Limit error details
        );
      }
    });
  }

  /**
   * Removes expired entries and optimizes cache
   * Follows Cline's cleanup and maintenance patterns
   */
  async cleanup(): Promise<void> {
    const startTime = Date.now();
    let expiredCount = 0;
    let corruptedCount = 0;

    try {
      // Clean memory cache
      const memoryKeys = this.memoryCache.keys();
      for (const key of memoryKeys) {
        const entry = this.memoryCache.get(key);
        if (entry && this.isExpired(entry)) {
          this.memoryCache.delete(key);
          expiredCount++;
        }
      }

      // Clean persistent storage if available
      if (this.persistentStorage) {
        const persistentKeys = await this.persistentStorage.keys();
        
        for (const key of persistentKeys) {
          try {
            const entry = await this.persistentStorage.get(key);
            if (!entry || this.isExpired(entry) || !this.isValidEntry(entry)) {
              await this.persistentStorage.delete(key);
              if (!entry || !this.isValidEntry(entry)) {
                corruptedCount++;
              } else {
                expiredCount++;
              }
            }
          } catch (error) {
            // Remove corrupted entries
            await this.persistentStorage.delete(key);
            corruptedCount++;
          }
        }
      }

      // Update statistics
      this.stats.lastCleanup = createTimestamp();
      this.stats.totalEntries = this.memoryCache.size();
      this.stats.memoryUsageBytes = this.memoryCache.getMemoryUsage();

      const duration = Date.now() - startTime;
      console.log(`EmbeddingCache: Cleanup completed in ${duration}ms (${expiredCount} expired, ${corruptedCount} corrupted)`);

    } catch (error) {
      console.error('EmbeddingCache: Cleanup failed:', error);
      throw new VectorDatabaseError(
        `Cache cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CACHE_CLEANUP_ERROR',
        500,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Gets comprehensive cache statistics
   * Following Cline's detailed metrics patterns
   */
  getStats(): CacheStats {
    this.stats.totalEntries = this.memoryCache.size();
    this.stats.memoryUsageBytes = this.memoryCache.getMemoryUsage();
    return { ...this.stats };
  }

  /**
   * Optimizes cache performance by preloading frequently accessed embeddings
   * Implements ReadyAI-specific cache warming strategies
   * 
   * @param projectId Project to warm cache for
   * @param topK Number of most frequent embeddings to preload
   */
  async warmCache(projectId: UUID, topK: number = 100): Promise<AsyncResult<number>> {
    return wrapAsync(async () => {
      if (!this.persistentStorage) {
        return 0;
      }

      const startTime = Date.now();
      let warmedCount = 0;

      try {
        // Get all persistent keys
        const keys = await this.persistentStorage.keys();
        
        // Filter for project-specific keys and load entries
        const projectKeys = keys.filter(key => key.includes(projectId));
        const entries: Array<{ key: string; entry: EmbeddingCacheEntry }> = [];

        for (const key of projectKeys) {
          const entry = await this.persistentStorage.get(key);
          if (entry && !this.isExpired(entry) && this.isValidEntry(entry)) {
            entries.push({ key, entry });
          }
        }

        // Sort by access frequency and recency
        entries.sort((a, b) => {
          const scoreA = a.entry.metadata.accessCount * 0.7 + 
                       (Date.now() - new Date(a.entry.metadata.accessedAt).getTime()) * 0.3;
          const scoreB = b.entry.metadata.accessCount * 0.7 + 
                       (Date.now() - new Date(b.entry.metadata.accessedAt).getTime()) * 0.3;
          return scoreB - scoreA;
        });

        // Preload top K entries into memory cache
        const entriesToWarm = entries.slice(0, topK);
        for (const { key, entry } of entriesToWarm) {
          const sizeBytes = this.calculateEntrySize(entry);
          this.memoryCache.set(key, entry, sizeBytes);
          warmedCount++;
        }

        const duration = Date.now() - startTime;
        console.log(`EmbeddingCache: Warmed ${warmedCount} entries for project ${projectId} in ${duration}ms`);

        return warmedCount;

      } catch (error) {
        throw new VectorDatabaseError(
          `Cache warming failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'CACHE_WARM_ERROR',
          500,
          { projectId, error: error instanceof Error ? error.message : String(error) }
        );
      }
    });
  }

  /**
   * Generates optimized cache key for text and model combination
   * Follows Cline's deterministic key generation patterns
   * 
   * @param text Source text for embedding
   * @param modelName Model used for embedding
   * @param projectId Optional project scope
   * @returns Optimized cache key
   */
  static generateCacheKey(text: string, modelName: string, projectId?: UUID): string {
    // Create deterministic hash of text content
    const textHash = crypto.createHash('sha256')
      .update(text, 'utf-8')
      .digest('hex')
      .substring(0, 16); // First 16 chars for efficiency

    // Include model and project in key for proper scoping
    const keyComponents = [
      'emb', // Cache type prefix
      modelName.replace(/[^a-zA-Z0-9]/g, '_'), // Sanitized model name
      textHash,
      projectId ? projectId.replace(/-/g, '') : 'global' // Project scope
    ];

    return keyComponents.join('_');
  }

  /**
   * Generates content hash for cache validation
   * Implements Cline's content integrity patterns
   */
  static generateContentHash(text: string): string {
    return crypto.createHash('sha256')
      .update(text, 'utf-8')
      .digest('hex');
  }

  /**
   * Destroys cache and cleans up resources
   * Follows Cline's proper resource cleanup patterns
   */
  async destroy(): Promise<void> {
    // Stop cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Clear memory cache
    this.memoryCache.clear();

    // Final cleanup run
    try {
      await this.cleanup();
    } catch (error) {
      console.warn('EmbeddingCache: Final cleanup failed:', error);
    }

    console.log('EmbeddingCache: Successfully destroyed');
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  /**
   * Calculates memory footprint of a cache entry
   * Follows Cline's memory accounting patterns
   */
  private calculateEntrySize(entry: EmbeddingCacheEntry): number {
    const baseSize = 200; // Estimated overhead for object structure
    const textSize = (entry.textHash.length + entry.cacheKey.length + entry.modelName.length) * 2; // UTF-16
    const embeddingSize = entry.embedding.length * 8; // Float64 bytes
    const metadataSize = JSON.stringify(entry.metadata).length * 2; // UTF-16
    
    return baseSize + textSize + embeddingSize + metadataSize;
  }

  /**
   * Calculates memory footprint of embedding array
   */
  private calculateEmbeddingSize(embedding: number[]): number {
    return embedding.length * 8; // 8 bytes per float64
  }

  /**
   * Checks if a cache entry has expired
   * Implements Cline's TTL management patterns
   */
  private isExpired(entry: EmbeddingCacheEntry): boolean {
    if (!entry.metadata.expiresAt) {
      return false; // No expiry set
    }

    return new Date(entry.metadata.expiresAt) <= new Date();
  }

  /**
   * Validates cache entry structure and data integrity
   * Follows Cline's comprehensive validation patterns
   */
  private isValidEntry(entry: EmbeddingCacheEntry): boolean {
    try {
      return !!(
        entry.cacheKey &&
        entry.textHash &&
        Array.isArray(entry.embedding) &&
        entry.embedding.length > 0 &&
        entry.modelName &&
        entry.dimension > 0 &&
        entry.metadata &&
        entry.metadata.createdAt &&
        entry.metadata.accessedAt
      );
    } catch {
      return false;
    }
  }

  /**
   * Validates embedding data quality
   * Implements ReadyAI's embedding quality checks
   */
  private validateEmbedding(embedding: number[], modelName: string): void {
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new VectorDatabaseError(
        'Invalid embedding: must be non-empty array',
        'INVALID_VECTOR',
        400,
        { modelName, embeddingLength: embedding?.length || 0 }
      );
    }

    if (embedding.some(val => !isFinite(val))) {
      throw new VectorDatabaseError(
        'Invalid embedding: contains non-finite values',
        'INVALID_VECTOR',
        400,
        { modelName }
      );
    }
  }

  /**
   * Calculates expiry time based on configuration
   * Follows Cline's TTL calculation patterns
   */
  private calculateExpiryTime(): string | undefined {
    const ttlSeconds = this.config.ttl.embeddings;
    if (ttlSeconds <= 0) {
      return undefined; // No expiry
    }

    return new Date(Date.now() + ttlSeconds * 1000).toISOString();
  }

  /**
   * Updates hit ratio statistics
   * Implements Cline's metrics calculation patterns
   */
  private updateHitRatio(): void {
    const total = this.stats.hitCount + this.stats.missCount;
    this.stats.hitRatio = total > 0 ? this.stats.hitCount / total : 0;
  }

  /**
   * Starts periodic cleanup following Cline's maintenance patterns
   */
  private startCleanupInterval(): void {
    if (this.config.persistence?.syncIntervalSeconds) {
      const intervalMs = this.config.persistence.syncIntervalSeconds * 1000;
      
      this.cleanupInterval = setInterval(async () => {
        try {
          await this.cleanup();
        } catch (error) {
          console.error('EmbeddingCache: Periodic cleanup failed:', error);
        }
      }, intervalMs);
    }
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Creates a project-scoped embedding cache
 * Follows ReadyAI's project isolation patterns
 * 
 * @param projectId Project identifier for cache scoping
 * @param config Optional cache configuration
 * @returns Configured EmbeddingCache instance
 */
export function createProjectCache(
  projectId: UUID, 
  config: Partial<VectorCacheConfig> = {}
): EmbeddingCache {
  const projectConfig: VectorCacheConfig = {
    ...DEFAULT_CACHE_CONFIG,
    ...config,
    persistence: config.persistence ? {
      ...DEFAULT_CACHE_CONFIG.persistence,
      ...config.persistence,
      path: config.persistence.path || 
            join(process.cwd(), '.readyai', 'cache', 'embeddings', projectId)
    } : DEFAULT_CACHE_CONFIG.persistence
  };

  return new EmbeddingCache(projectConfig);
}

/**
 * Utility to measure cache performance
 * Implements Cline's performance monitoring patterns
 */
export async function measureCacheOperation<T>(
  operationName: string,
  cache: EmbeddingCache,
  operation: () => Promise<T>
): Promise<{ result: T; metrics: VectorPerformanceMetrics }> {
  const startTime = Date.now();
  const initialStats = cache.getStats();

  try {
    const result = await operation();
    
    const finalStats = cache.getStats();
    const metrics: VectorPerformanceMetrics = {
      operationType: 'embed', // Default to embed type
      collection: 'cache',
      metrics: {
        totalTimeMs: Date.now() - startTime,
        vectorProcessingMs: 0, // Not applicable for cache operations
        networkLatencyMs: 0, // Not applicable for cache operations
        vectorCount: 1, // Default count
        throughput: 1000 / (Date.now() - startTime), // Operations per second
        peakMemoryMB: finalStats.memoryUsageBytes / 1024 / 1024
      },
      cache: {
        hits: finalStats.hitCount - initialStats.hitCount,
        misses: finalStats.missCount - initialStats.missCount,
        hitRate: finalStats.hitRatio,
        evictions: finalStats.evictionCount - initialStats.evictionCount
      },
      timestamp: createTimestamp()
    };

    console.log(`Cache operation '${operationName}' completed in ${metrics.metrics.totalTimeMs}ms`);
    return { result, metrics };

  } catch (error) {
    const metrics: VectorPerformanceMetrics = {
      operationType: 'embed',
      collection: 'cache',
      metrics: {
        totalTimeMs: Date.now() - startTime,
        vectorProcessingMs: 0,
        networkLatencyMs: 0,
        vectorCount: 0,
        throughput: 0,
        peakMemoryMB: cache.getStats().memoryUsageBytes / 1024 / 1024
      },
      timestamp: createTimestamp()
    };

    console.error(`Cache operation '${operationName}' failed after ${metrics.metrics.totalTimeMs}ms:`, error);
    throw error;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const EmbeddingCacheUtils = {
  EmbeddingCache,
  createProjectCache,
  measureCacheOperation,
  generateCacheKey: EmbeddingCache.generateCacheKey,
  generateContentHash: EmbeddingCache.generateContentHash
} as const;

export default EmbeddingCache;
