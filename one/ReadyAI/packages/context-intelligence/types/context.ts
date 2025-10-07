// packages/context-intelligence/types/context.ts

/**
 * Context Intelligence Types for ReadyAI Personal AI Development Orchestrator
 * 
 * This module provides comprehensive type definitions for context-aware AI development,
 * leveraging Cline's proven context management patterns while adding ReadyAI-specific
 * intelligence features for semantic project understanding, relevance scoring, and
 * quality metrics integration.
 * 
 * Key Adaptations from Cline:
 * - Context management patterns from Cline's src/core/context/types.ts
 * - Conversation context tracking from Cline's proven implementations
 * - File context tracking patterns from Cline's FileContextTracker
 * - Task state management from Cline's comprehensive context system
 * - Performance optimization patterns from Cline's context window management
 * 
 * ReadyAI Extensions:
 * - Semantic context understanding with vector embeddings
 * - Project-aware context retrieval with phase-based filtering
 * - Quality metrics integration for context relevance assessment
 * - Multi-modal context support (code, docs, artifacts, conversations)
 * - Context compression and optimization for large projects
 * 
 * @version 1.0.0
 * @author ReadyAI Development Team
 */

import { 
  UUID, 
  ApiResponse, 
  ApiErrorResponse,
  ReadyAIError,
  ValidationResult,
  AsyncResult,
  PhaseType,
  ProjectConfig,
  GenerationRequest,
  ContextPackage,
  QualityMetrics,
  createTimestamp,
  generateUUID
} from '../../foundation/types/core';

import {
  VectorEntity,
  VectorSearchResult,
  SemanticSearchConfig,
  SemanticSearchResult,
  VectorPerformanceMetrics,
  EmbeddingResult
} from '../../vectordb/types/vectordb';

// =============================================================================
// CORE CONTEXT INTELLIGENCE TYPES
// =============================================================================

/**
 * Context node types for semantic organization
 * Extended from Cline's context type patterns with ReadyAI enhancements
 */
export type ContextNodeType = 
  | 'file' 
  | 'module' 
  | 'dependency' 
  | 'pattern' 
  | 'artifact' 
  | 'conversation'
  | 'api'
  | 'config'
  | 'documentation'
  | 'test'
  | 'schema';

/**
 * Context access patterns for intelligent retrieval
 * Based on Cline's proven context access tracking
 */
export type ContextAccessPattern = 
  | 'sequential'
  | 'random'
  | 'clustered'
  | 'hierarchical'
  | 'dependency-driven'
  | 'search-driven';

/**
 * Context quality indicators for relevance assessment
 * Adapted from Cline's context validation patterns
 */
export type ContextQualityLevel = 
  | 'excellent'
  | 'good'
  | 'fair'
  | 'poor'
  | 'stale'
  | 'invalid';

/**
 * Enhanced context node with ReadyAI intelligence features
 * Builds upon Cline's context node patterns with vector embeddings and quality metrics
 */
export interface ContextIntelligenceNode {
  /** Unique context identifier */
  id: UUID;
  /** Project this context belongs to */
  projectId: UUID;
  /** Context node type */
  type: ContextNodeType;
  /** File path or identifier */
  path: string;
  /** Content or summary */
  content: string;
  /** Content hash for change detection (from Cline patterns) */
  contentHash: string;
  /** Size in tokens for context window management */
  tokenCount: number;
  /** Vector embedding for semantic search */
  vectorEmbedding?: number[];
  /** Embedding model used */
  embeddingModel?: string;
  /** Embedding generation timestamp */
  embeddingGeneratedAt?: string;
  /** Dependencies this context relies on */
  dependencies: UUID[];
  /** Contexts that depend on this one */
  dependents: UUID[];
  /** Relevance score for retrieval (0-1) */
  relevanceScore: number;
  /** Quality assessment */
  qualityMetrics: ContextQualityMetrics;
  /** Access pattern analysis */
  accessPattern: ContextAccessAnalysis;
  /** Last access timestamp */
  lastAccessed: string;
  /** Access frequency tracking */
  accessCount: number;
  /** Context creation timestamp */
  createdAt: string;
  /** Last modification timestamp */
  lastModified: string;
  /** Development phase when created */
  creationPhase: PhaseType;
  /** Tags for categorization */
  tags: string[];
  /** Additional metadata */
  metadata: Record<string, any>;
}

/**
 * Context quality metrics for relevance assessment
 * Enhanced quality tracking based on Cline's validation patterns
 */
export interface ContextQualityMetrics {
  /** Overall quality level */
  qualityLevel: ContextQualityLevel;
  /** Freshness score (0-1) */
  freshnessScore: number;
  /** Relevance score (0-1) */
  relevanceScore: number;
  /** Completeness score (0-1) */
  completenessScore: number;
  /** Accuracy score (0-1) */
  accuracyScore: number;
  /** Context coherence score (0-1) */
  coherenceScore: number;
  /** Validation issues */
  validationIssues: string[];
  /** Quality assessment timestamp */
  lastAssessed: string;
  /** Quality trend (improving/stable/degrading) */
  qualityTrend: 'improving' | 'stable' | 'degrading';
}

/**
 * Context access analysis for optimization
 * Based on Cline's context usage tracking patterns
 */
export interface ContextAccessAnalysis {
  /** Primary access pattern */
  primaryPattern: ContextAccessPattern;
  /** Access frequency over time windows */
  accessFrequency: {
    hourly: number;
    daily: number;
    weekly: number;
  };
  /** Co-access patterns with other contexts */
  coAccessPatterns: Array<{
    contextId: UUID;
    frequency: number;
    strength: number;
  }>;
  /** Temporal access patterns */
  temporalPatterns: {
    peakHours: number[];
    seasonality: 'morning' | 'afternoon' | 'evening' | 'uniform';
  };
  /** Last access analysis timestamp */
  lastAnalyzed: string;
}

// =============================================================================
// CONTEXT RETRIEVAL AND SEARCH
// =============================================================================

/**
 * Context retrieval request with ReadyAI intelligence
 * Enhanced from Cline's context request patterns
 */
export interface ContextRetrievalRequest {
  /** Request identifier */
  id: UUID;
  /** Project scope */
  projectId: UUID;
  /** Phase-specific filtering */
  phase?: PhaseType;
  /** Query text for semantic search */
  query?: string;
  /** Context types to include */
  contextTypes?: ContextNodeType[];
  /** Maximum results to return */
  maxResults: number;
  /** Relevance threshold (0-1) */
  relevanceThreshold: number;
  /** Include stale contexts */
  includeStale: boolean;
  /** Search strategy */
  searchStrategy: {
    algorithm: 'semantic' | 'keyword' | 'hybrid' | 'dependency-aware';
    boostFactors?: Record<string, number>;
    temporalWeighting?: boolean;
    qualityFiltering?: boolean;
  };
  /** Request context for personalization */
  requestContext?: {
    currentFile?: string;
    recentFiles?: string[];
    currentPhase?: PhaseType;
    userIntent?: string;
  };
  /** Performance requirements */
  performance?: {
    maxLatencyMs?: number;
    cachingEnabled?: boolean;
    backgroundRefresh?: boolean;
  };
  /** Request timestamp */
  requestedAt: string;
}

/**
 * Context retrieval result with quality metrics
 * Enhanced context results based on Cline's response patterns
 */
export interface ContextRetrievalResult {
  /** Request identifier */
  requestId: UUID;
  /** Retrieved contexts ranked by relevance */
  contexts: ContextIntelligenceNode[];
  /** Search performance metrics */
  searchMetrics: ContextSearchMetrics;
  /** Quality assessment of results */
  resultQuality: {
    averageRelevance: number;
    coverageScore: number;
    diversityScore: number;
    qualityScore: number;
  };
  /** Suggested related contexts */
  relatedContexts?: Array<{
    contextId: UUID;
    relationshipType: 'dependency' | 'similar' | 'complementary';
    relevanceScore: number;
  }>;
  /** Total contexts available */
  totalAvailable: number;
  /** Response timestamp */
  retrievedAt: string;
}

/**
 * Context search performance metrics
 * Adapted from Cline's performance tracking patterns
 */
export interface ContextSearchMetrics {
  /** Search operation duration */
  searchDurationMs: number;
  /** Vector search time */
  vectorSearchMs?: number;
  /** Keyword search time */
  keywordSearchMs?: number;
  /** Ranking time */
  rankingMs: number;
  /** Cache hit information */
  cache: {
    hitRate: number;
    hits: number;
    misses: number;
  };
  /** Contexts evaluated */
  contextsEvaluated: number;
  /** Search algorithm used */
  algorithmUsed: string;
  /** Quality filters applied */
  filtersApplied: string[];
}

// =============================================================================
// CONTEXT INTELLIGENCE ENGINE
// =============================================================================

/**
 * Context intelligence configuration
 * Based on Cline's configuration patterns with ReadyAI enhancements
 */
export interface ContextIntelligenceConfig {
  /** Semantic search settings */
  semanticSearch: {
    enabled: boolean;
    embeddingModel: string;
    embeddingDimension: number;
    similarityThreshold: number;
    maxSemanticResults: number;
  };
  /** Quality assessment settings */
  qualityAssessment: {
    enabled: boolean;
    assessmentFrequency: 'realtime' | 'periodic' | 'on-demand';
    qualityThreshold: number;
    validationRules: string[];
  };
  /** Context optimization settings */
  optimization: {
    autoCompression: boolean;
    compressionThreshold: number;
    maxContextAge: number;
    pruningStrategy: 'lru' | 'quality-based' | 'hybrid';
  };
  /** Performance settings */
  performance: {
    maxConcurrentRequests: number;
    cacheSize: number;
    cacheTtlSeconds: number;
    backgroundProcessing: boolean;
  };
  /** Integration settings */
  integration: {
    vectorDbEnabled: boolean;
    realtimeUpdates: boolean;
    phaseAwareness: boolean;
    projectIsolation: boolean;
  };
}

/**
 * Context intelligence engine state
 * Comprehensive state management based on Cline's patterns
 */
export interface ContextIntelligenceEngineState {
  /** Engine identifier */
  engineId: UUID;
  /** Current project */
  projectId: UUID;
  /** Engine configuration */
  config: ContextIntelligenceConfig;
  /** Active contexts count */
  activeContexts: number;
  /** Total contexts managed */
  totalContexts: number;
  /** Current memory usage */
  memoryUsageMB: number;
  /** Performance statistics */
  performance: ContextEnginePerformance;
  /** Last optimization run */
  lastOptimization?: string;
  /** Engine health status */
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
  /** Current operations */
  currentOperations: string[];
  /** Engine startup timestamp */
  startedAt: string;
  /** Last activity timestamp */
  lastActivity: string;
}

/**
 * Context engine performance metrics
 * Detailed performance tracking based on Cline's telemetry
 */
export interface ContextEnginePerformance {
  /** Request statistics */
  requests: {
    total: number;
    successful: number;
    failed: number;
    averageLatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
  };
  /** Cache performance */
  cache: {
    hitRate: number;
    size: number;
    evictions: number;
    memoryUsageMB: number;
  };
  /** Search performance */
  search: {
    averageSearchMs: number;
    vectorSearchCount: number;
    keywordSearchCount: number;
    hybridSearchCount: number;
  };
  /** Quality assessment performance */
  qualityAssessment: {
    assessmentsPerformed: number;
    averageAssessmentMs: number;
    qualityImprovements: number;
  };
  /** Resource utilization */
  resources: {
    cpuUsagePercent: number;
    memoryUsageMB: number;
    diskUsageMB: number;
    networkRequestsPerSecond: number;
  };
}

// =============================================================================
// CONTEXT CONVERSATION AND HISTORY
// =============================================================================

/**
 * Context conversation tracking
 * Enhanced conversation context from Cline's conversation management
 */
export interface ContextConversation {
  /** Conversation identifier */
  id: UUID;
  /** Associated project */
  projectId: UUID;
  /** Conversation title */
  title: string;
  /** Conversation context nodes */
  contexts: ContextConversationEntry[];
  /** Total context tokens */
  totalTokens: number;
  /** Conversation quality metrics */
  qualityMetrics: ConversationQualityMetrics;
  /** Conversation summary */
  summary?: string;
  /** Key topics extracted */
  topics: string[];
  /** Conversation phase */
  phase: PhaseType;
  /** Start timestamp */
  startedAt: string;
  /** End timestamp */
  endedAt?: string;
  /** Last activity timestamp */
  lastActivity: string;
  /** Conversation status */
  status: 'active' | 'completed' | 'paused' | 'archived';
}

/**
 * Context conversation entry
 * Individual context usage within conversations
 */
export interface ContextConversationEntry {
  /** Entry identifier */
  id: UUID;
  /** Referenced context */
  contextId: UUID;
  /** Usage timestamp */
  usedAt: string;
  /** Usage type */
  usageType: 'referenced' | 'modified' | 'created' | 'deleted';
  /** Relevance score at time of use */
  relevanceScore: number;
  /** Token contribution */
  tokenContribution: number;
  /** Usage effectiveness */
  effectiveness?: number;
  /** User feedback on utility */
  feedback?: 'helpful' | 'neutral' | 'unhelpful';
}

/**
 * Conversation quality metrics
 * Quality assessment for context conversations
 */
export interface ConversationQualityMetrics {
  /** Context coherence score (0-1) */
  coherenceScore: number;
  /** Context completeness score (0-1) */
  completenessScore: number;
  /** Context relevance score (0-1) */
  relevanceScore: number;
  /** Context efficiency score (0-1) */
  efficiencyScore: number;
  /** Token utilization efficiency */
  tokenEfficiency: number;
  /** Context switching frequency */
  contextSwitchingRate: number;
  /** Average context quality */
  averageContextQuality: number;
  /** Quality trend over conversation */
  qualityTrend: 'improving' | 'stable' | 'degrading';
}

// =============================================================================
// CONTEXT COMPRESSION AND OPTIMIZATION
// =============================================================================

/**
 * Context compression configuration
 * Based on Cline's context window management patterns
 */
export interface ContextCompressionConfig {
  /** Compression strategy */
  strategy: 'lossy' | 'lossless' | 'selective' | 'adaptive';
  /** Target compression ratio (0-1) */
  targetCompressionRatio: number;
  /** Quality preservation threshold */
  qualityThreshold: number;
  /** Priority-based compression */
  priorityWeights: {
    relevance: number;
    freshness: number;
    dependencies: number;
    userPreference: number;
  };
  /** Content-aware compression */
  contentAwareSettings: {
    preserveCodeStructure: boolean;
    preserveKeywords: boolean;
    preserveRelationships: boolean;
  };
}

/**
 * Context compression result
 * Results from context compression operations
 */
export interface ContextCompressionResult {
  /** Operation identifier */
  operationId: UUID;
  /** Original context count */
  originalContextCount: number;
  /** Compressed context count */
  compressedContextCount: number;
  /** Original token count */
  originalTokenCount: number;
  /** Compressed token count */
  compressedTokenCount: number;
  /** Compression ratio achieved */
  compressionRatio: number;
  /** Quality impact assessment */
  qualityImpact: {
    informationLoss: number;
    qualityDegradation: number;
    preservedRelationships: number;
  };
  /** Compression strategy used */
  strategyUsed: string;
  /** Compression timestamp */
  compressedAt: string;
  /** Compression duration */
  compressionDurationMs: number;
}

// =============================================================================
// CONTEXT ANALYTICS AND INSIGHTS
// =============================================================================

/**
 * Context usage analytics
 * Comprehensive analytics based on Cline's usage patterns
 */
export interface ContextUsageAnalytics {
  /** Analysis period */
  period: {
    startDate: string;
    endDate: string;
    duration: string;
  };
  /** Overall usage statistics */
  usage: {
    totalContexts: number;
    activeContexts: number;
    averageRelevanceScore: number;
    mostUsedContextTypes: Array<{
      type: ContextNodeType;
      count: number;
      percentage: number;
    }>;
  };
  /** Access patterns */
  accessPatterns: {
    peakUsageHours: number[];
    averageSessionDuration: number;
    contextsPerSession: number;
    mostCommonAccessPattern: ContextAccessPattern;
  };
  /** Quality trends */
  qualityTrends: {
    averageQualityScore: number;
    qualityImprovement: number;
    qualityDistribution: Record<ContextQualityLevel, number>;
  };
  /** Performance insights */
  performance: {
    averageRetrievalTime: number;
    cacheHitRate: number;
    searchSuccessRate: number;
    userSatisfactionScore?: number;
  };
  /** Recommendations */
  recommendations: ContextRecommendation[];
}

/**
 * Context recommendation
 * Actionable recommendations for context optimization
 */
export interface ContextRecommendation {
  /** Recommendation identifier */
  id: UUID;
  /** Recommendation type */
  type: 'optimization' | 'quality' | 'performance' | 'organization';
  /** Recommendation priority */
  priority: 'low' | 'medium' | 'high' | 'critical';
  /** Recommendation title */
  title: string;
  /** Detailed description */
  description: string;
  /** Expected impact */
  expectedImpact: {
    performanceImprovement?: number;
    qualityImprovement?: number;
    storageReduction?: number;
  };
  /** Implementation effort */
  implementationEffort: 'low' | 'medium' | 'high';
  /** Affected contexts */
  affectedContextIds?: UUID[];
  /** Recommendation timestamp */
  generatedAt: string;
  /** Expiration timestamp */
  expiresAt?: string;
}

// =============================================================================
// ERROR HANDLING AND VALIDATION
// =============================================================================

/**
 * Context intelligence specific errors
 * Enhanced error handling based on Cline's patterns
 */
export interface ContextIntelligenceError extends ReadyAIError {
  /** Context-specific error code */
  contextErrorCode: 
    | 'CONTEXT_NOT_FOUND'
    | 'QUALITY_TOO_LOW'
    | 'EMBEDDING_FAILED'
    | 'COMPRESSION_FAILED'
    | 'SEARCH_TIMEOUT'
    | 'INVALID_QUERY'
    | 'CONTEXT_CORRUPTED'
    | 'DEPENDENCY_CYCLE'
    | 'RESOURCE_EXHAUSTED';
  /** Context identifier (if applicable) */
  contextId?: UUID;
  /** Quality information */
  qualityInfo?: {
    currentQuality: number;
    minimumRequired: number;
  };
  /** Suggested recovery actions */
  recoveryActions?: string[];
}

/**
 * Context validation result
 * Comprehensive validation based on Cline's validation patterns
 */
export interface ContextValidationResult extends ValidationResult {
  /** Context-specific validations */
  contextValidations: Array<{
    type: 'content' | 'quality' | 'relationships' | 'metadata';
    field: string;
    valid: boolean;
    message: string;
    suggestion?: string;
  }>;
  /** Relationship validation */
  relationshipValidation?: {
    dependenciesValid: boolean;
    circularDependencies: UUID[][];
    orphanedContexts: UUID[];
  };
  /** Quality validation */
  qualityValidation?: {
    meetsMinimumQuality: boolean;
    qualityIssues: string[];
    improvementSuggestions: string[];
  };
}

// =============================================================================
// UTILITY TYPES AND CONSTANTS
// =============================================================================

/**
 * Context operation types
 */
export type ContextOperationType = 
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'search'
  | 'compress'
  | 'analyze'
  | 'validate'
  | 'optimize';

/**
 * Context storage backends
 */
export type ContextStorageBackend = 'memory' | 'disk' | 'database' | 'hybrid';

/**
 * Context indexing strategies
 */
export type ContextIndexingStrategy = 'full-text' | 'vector' | 'hybrid' | 'semantic';

/**
 * Default context intelligence configuration
 * Production-ready defaults based on Cline's proven patterns
 */
export const DEFAULT_CONTEXT_INTELLIGENCE_CONFIG: ContextIntelligenceConfig = {
  semanticSearch: {
    enabled: true,
    embeddingModel: 'all-MiniLM-L6-v2',
    embeddingDimension: 384,
    similarityThreshold: 0.7,
    maxSemanticResults: 50
  },
  qualityAssessment: {
    enabled: true,
    assessmentFrequency: 'periodic',
    qualityThreshold: 0.6,
    validationRules: ['content-freshness', 'dependency-validity', 'relevance-check']
  },
  optimization: {
    autoCompression: true,
    compressionThreshold: 0.8,
    maxContextAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    pruningStrategy: 'hybrid'
  },
  performance: {
    maxConcurrentRequests: 10,
    cacheSize: 1000,
    cacheTtlSeconds: 3600,
    backgroundProcessing: true
  },
  integration: {
    vectorDbEnabled: true,
    realtimeUpdates: true,
    phaseAwareness: true,
    projectIsolation: true
  }
} as const;

/**
 * Context intelligence constants
 */
export const CONTEXT_INTELLIGENCE_CONSTANTS = {
  MAX_CONTEXT_SIZE_BYTES: 1024 * 1024, // 1MB
  MAX_CONTEXTS_PER_PROJECT: 10000,
  MAX_EMBEDDING_DIMENSION: 1536,
  MIN_RELEVANCE_SCORE: 0.1,
  MAX_RELEVANCE_SCORE: 1.0,
  DEFAULT_COMPRESSION_RATIO: 0.5,
  MAX_DEPENDENCY_DEPTH: 10,
  QUALITY_ASSESSMENT_INTERVAL: 60 * 60 * 1000, // 1 hour
  MAX_SEARCH_RESULTS: 100
} as const;

/**
 * Helper functions for context intelligence
 */

/**
 * Create a new context intelligence node
 */
export function createContextIntelligenceNode(
  projectId: UUID,
  type: ContextNodeType,
  path: string,
  content: string,
  phase: PhaseType
): ContextIntelligenceNode {
  const now = createTimestamp();
  const nodeId = generateUUID();
  
  return {
    id: nodeId,
    projectId,
    type,
    path,
    content,
    contentHash: '', // Will be calculated by implementation
    tokenCount: 0, // Will be calculated by implementation
    dependencies: [],
    dependents: [],
    relevanceScore: 1.0,
    qualityMetrics: {
      qualityLevel: 'good',
      freshnessScore: 1.0,
      relevanceScore: 1.0,
      completenessScore: 1.0,
      accuracyScore: 1.0,
      coherenceScore: 1.0,
      validationIssues: [],
      lastAssessed: now,
      qualityTrend: 'stable'
    },
    accessPattern: {
      primaryPattern: 'sequential',
      accessFrequency: {
        hourly: 0,
        daily: 0,
        weekly: 0
      },
      coAccessPatterns: [],
      temporalPatterns: {
        peakHours: [],
        seasonality: 'uniform'
      },
      lastAnalyzed: now
    },
    lastAccessed: now,
    accessCount: 0,
    createdAt: now,
    lastModified: now,
    creationPhase: phase,
    tags: [],
    metadata: {}
  };
}

/**
 * Calculate context relevance score
 */
export function calculateContextRelevance(
  context: ContextIntelligenceNode,
  query: string,
  currentPhase?: PhaseType
): number {
  let relevance = context.relevanceScore;
  
  // Phase alignment bonus
  if (currentPhase && context.creationPhase === currentPhase) {
    relevance *= 1.2;
  }
  
  // Freshness factor
  const age = Date.now() - new Date(context.lastModified).getTime();
  const daysSinceModified = age / (24 * 60 * 60 * 1000);
  const freshnessFactor = Math.max(0.1, Math.exp(-daysSinceModified / 30));
  relevance *= freshnessFactor;
  
  // Quality factor
  relevance *= context.qualityMetrics.qualityLevel === 'excellent' ? 1.0 :
               context.qualityMetrics.qualityLevel === 'good' ? 0.9 :
               context.qualityMetrics.qualityLevel === 'fair' ? 0.7 :
               context.qualityMetrics.qualityLevel === 'poor' ? 0.5 : 0.2;
  
  return Math.min(1.0, Math.max(0.0, relevance));
}

/**
 * Validate context intelligence node
 */
export function validateContextNode(
  context: ContextIntelligenceNode
): ContextValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];
  
  // Basic validation
  if (!context.id || !context.projectId) {
    errors.push('Missing required identifiers');
  }
  
  if (!context.content || context.content.trim().length === 0) {
    errors.push('Context content is empty');
  }
  
  if (context.relevanceScore < 0 || context.relevanceScore > 1) {
    errors.push('Relevance score must be between 0 and 1');
  }
  
  // Quality validation
  if (context.qualityMetrics.qualityLevel === 'poor' || 
      context.qualityMetrics.qualityLevel === 'stale') {
    warnings.push('Context quality is below recommended threshold');
    suggestions.push('Consider refreshing or validating context content');
  }
  
  return {
    id: generateUUID(),
    type: 'context',
    passed: errors.length === 0,
    errors,
    warnings,
    suggestions,
    score: errors.length === 0 ? (warnings.length === 0 ? 100 : 80) : 0,
    validatedAt: createTimestamp(),
    validator: 'context-intelligence-validator',
    contextValidations: [],
    relationshipValidation: {
      dependenciesValid: true,
      circularDependencies: [],
      orphanedContexts: []
    },
    qualityValidation: {
      meetsMinimumQuality: context.qualityMetrics.qualityLevel !== 'poor',
      qualityIssues: warnings,
      improvementSuggestions: suggestions
    }
  };
}

/**
 * Export all types for external consumption
 */
export type {
  ContextIntelligenceNode,
  ContextQualityMetrics,
  ContextAccessAnalysis,
  ContextRetrievalRequest,
  ContextRetrievalResult,
  ContextSearchMetrics,
  ContextIntelligenceConfig,
  ContextIntelligenceEngineState,
  ContextEnginePerformance,
  ContextConversation,
  ContextConversationEntry,
  ConversationQualityMetrics,
  ContextCompressionConfig,
  ContextCompressionResult,
  ContextUsageAnalytics,
  ContextRecommendation,
  ContextIntelligenceError,
  ContextValidationResult
};

// Version information
export const CONTEXT_INTELLIGENCE_TYPES_VERSION = '1.0.0';

// Default exports
export default {
  CONTEXT_INTELLIGENCE_TYPES_VERSION,
  DEFAULT_CONTEXT_INTELLIGENCE_CONFIG,
  CONTEXT_INTELLIGENCE_CONSTANTS
};
