// packages/vectordb/utils/VectorUtils.ts

/**
 * Vector Database Utility Functions for ReadyAI Personal AI Development Orchestrator
 * 
 * This module provides comprehensive vector operations leveraging Cline's proven utility
 * patterns while implementing ReadyAI-specific vector functionality for semantic search,
 * similarity calculations, and vector normalization operations.
 * 
 * Key Adaptations from Cline:
 * - Mathematical utility patterns from Cline's robust calculation functions
 * - Error handling patterns from Cline's comprehensive error management
 * - Performance optimization patterns from Cline's efficient processing
 * - Validation patterns from Cline's thorough input validation
 * - Logging integration from Cline's telemetry system
 * 
 * ReadyAI Extensions:
 * - Vector similarity calculations (cosine, dot product, euclidean)
 * - Vector normalization and standardization
 * - Embedding quality assessment
 * - Batch vector processing optimizations
 * - Project-specific vector operations
 * 
 * @version 1.0.0
 * @author ReadyAI Development Team
 */

import { 
  UUID, 
  ReadyAIError, 
  createTimestamp,
  AsyncResult,
  wrapAsync
} from '../../foundation/types/core';
import {
  VectorEntity,
  VectorSearchResult,
  VectorPerformanceMetrics,
  VectorValidationResult,
  VectorDatabaseError,
  VectorContextNode,
  SemanticSearchResult,
  DEFAULT_CACHE_CONFIG
} from '../types/vectordb';

// =============================================================================
// VECTOR SIMILARITY CALCULATIONS
// =============================================================================

/**
 * Calculates cosine similarity between two vectors
 * Adapted from Cline's mathematical utility patterns with enhanced error handling
 * 
 * @param vectorA First vector for comparison
 * @param vectorB Second vector for comparison
 * @returns Cosine similarity score (0-1, where 1 is identical)
 * @throws VectorDatabaseError if vectors are invalid or incompatible
 */
export function calculateCosineSimilarity(vectorA: number[], vectorB: number[]): number {
  // Input validation following Cline's validation patterns
  if (!Array.isArray(vectorA) || !Array.isArray(vectorB)) {
    throw new VectorDatabaseError(
      'Invalid vector input: both parameters must be arrays',
      'INVALID_VECTOR',
      400,
      { vectorAType: typeof vectorA, vectorBType: typeof vectorB }
    );
  }

  if (vectorA.length !== vectorB.length) {
    throw new VectorDatabaseError(
      'Vector dimension mismatch',
      'DIMENSION_MISMATCH',
      400,
      { 
        expected: vectorA.length, 
        received: vectorB.length,
        recoveryActions: ['Ensure both vectors have the same dimension']
      }
    );
  }

  if (vectorA.length === 0) {
    throw new VectorDatabaseError(
      'Empty vectors are not supported',
      'INVALID_VECTOR',
      400,
      { suggestion: 'Provide non-empty vectors for similarity calculation' }
    );
  }

  // Calculate dot product and magnitudes using Cline's efficient calculation patterns
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < vectorA.length; i++) {
    const a = vectorA[i];
    const b = vectorB[i];

    // Validate individual components
    if (!isFinite(a) || !isFinite(b)) {
      throw new VectorDatabaseError(
        `Invalid vector component at index ${i}`,
        'INVALID_VECTOR',
        400,
        { index: i, valueA: a, valueB: b }
      );
    }

    dotProduct += a * b;
    magnitudeA += a * a;
    magnitudeB += b * b;
  }

  // Handle zero magnitude vectors following Cline's edge case handling
  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0; // Return 0 similarity for zero vectors
  }

  const similarity = dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
  
  // Clamp result to valid range [0, 1] to handle floating point precision issues
  return Math.max(0, Math.min(1, similarity));
}

/**
 * Calculates dot product similarity between two vectors
 * Follows Cline's performance optimization patterns
 * 
 * @param vectorA First vector for comparison
 * @param vectorB Second vector for comparison
 * @returns Dot product value
 */
export function calculateDotProduct(vectorA: number[], vectorB: number[]): number {
  // Reuse validation from cosine similarity
  if (vectorA.length !== vectorB.length) {
    throw new VectorDatabaseError(
      'Vector dimension mismatch',
      'DIMENSION_MISMATCH',
      400,
      { expected: vectorA.length, received: vectorB.length }
    );
  }

  let dotProduct = 0;
  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i] * vectorB[i];
  }

  return dotProduct;
}

/**
 * Calculates Euclidean distance between two vectors
 * Lower values indicate higher similarity
 * 
 * @param vectorA First vector for comparison
 * @param vectorB Second vector for comparison
 * @returns Euclidean distance (0 = identical vectors)
 */
export function calculateEuclideanDistance(vectorA: number[], vectorB: number[]): number {
  if (vectorA.length !== vectorB.length) {
    throw new VectorDatabaseError(
      'Vector dimension mismatch',
      'DIMENSION_MISMATCH',
      400,
      { expected: vectorA.length, received: vectorB.length }
    );
  }

  let sum = 0;
  for (let i = 0; i < vectorA.length; i++) {
    const diff = vectorA[i] - vectorB[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

/**
 * Calculates Manhattan (L1) distance between two vectors
 * Alternative distance metric for specific use cases
 * 
 * @param vectorA First vector for comparison
 * @param vectorB Second vector for comparison
 * @returns Manhattan distance
 */
export function calculateManhattanDistance(vectorA: number[], vectorB: number[]): number {
  if (vectorA.length !== vectorB.length) {
    throw new VectorDatabaseError(
      'Vector dimension mismatch',
      'DIMENSION_MISMATCH',
      400,
      { expected: vectorA.length, received: vectorB.length }
    );
  }

  let sum = 0;
  for (let i = 0; i < vectorA.length; i++) {
    sum += Math.abs(vectorA[i] - vectorB[i]);
  }

  return sum;
}

// =============================================================================
// VECTOR NORMALIZATION AND STANDARDIZATION
// =============================================================================

/**
 * Normalizes a vector to unit length (L2 normalization)
 * Adapted from Cline's data processing patterns with enhanced validation
 * 
 * @param vector Vector to normalize
 * @returns Normalized vector with unit magnitude
 */
export function normalizeVector(vector: number[]): number[] {
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new VectorDatabaseError(
      'Invalid vector for normalization',
      'INVALID_VECTOR',
      400,
      { vectorLength: vector?.length || 0 }
    );
  }

  // Calculate magnitude
  let magnitude = 0;
  for (const component of vector) {
    if (!isFinite(component)) {
      throw new VectorDatabaseError(
        'Vector contains invalid components',
        'INVALID_VECTOR',
        400,
        { invalidComponent: component }
      );
    }
    magnitude += component * component;
  }

  magnitude = Math.sqrt(magnitude);

  // Handle zero magnitude vector
  if (magnitude === 0) {
    return new Array(vector.length).fill(0);
  }

  // Normalize each component
  return vector.map(component => component / magnitude);
}

/**
 * Standardizes a vector using z-score normalization
 * Transforms vector to have zero mean and unit variance
 * 
 * @param vector Vector to standardize
 * @returns Standardized vector
 */
export function standardizeVector(vector: number[]): number[] {
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new VectorDatabaseError(
      'Invalid vector for standardization',
      'INVALID_VECTOR',
      400
    );
  }

  // Calculate mean
  const mean = vector.reduce((sum, val) => sum + val, 0) / vector.length;

  // Calculate standard deviation
  const variance = vector.reduce((sum, val) => {
    const diff = val - mean;
    return sum + diff * diff;
  }, 0) / vector.length;

  const stdDev = Math.sqrt(variance);

  // Handle zero standard deviation
  if (stdDev === 0) {
    return new Array(vector.length).fill(0);
  }

  // Standardize each component
  return vector.map(component => (component - mean) / stdDev);
}

/**
 * Applies min-max normalization to a vector
 * Scales vector components to [0, 1] range
 * 
 * @param vector Vector to normalize
 * @returns Min-max normalized vector
 */
export function minMaxNormalizeVector(vector: number[]): number[] {
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new VectorDatabaseError(
      'Invalid vector for min-max normalization',
      'INVALID_VECTOR',
      400
    );
  }

  const min = Math.min(...vector);
  const max = Math.max(...vector);

  // Handle case where all components are equal
  if (min === max) {
    return new Array(vector.length).fill(0.5);
  }

  const range = max - min;
  return vector.map(component => (component - min) / range);
}

// =============================================================================
// EMBEDDING QUALITY ASSESSMENT
// =============================================================================

/**
 * Analyzes the quality of a vector embedding
 * Provides insights into embedding characteristics following Cline's analysis patterns
 * 
 * @param vector Vector embedding to analyze
 * @returns Quality analysis results
 */
export function analyzeEmbeddingQuality(vector: number[]): {
  dimension: number;
  magnitude: number;
  sparsity: number;
  entropy: number;
  qualityScore: number;
  issues: string[];
} {
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new VectorDatabaseError(
      'Invalid vector for quality analysis',
      'INVALID_VECTOR',
      400
    );
  }

  const issues: string[] = [];

  // Calculate basic metrics
  const dimension = vector.length;
  let magnitude = 0;
  let zeroCount = 0;
  const componentCounts = new Map<number, number>();

  for (const component of vector) {
    if (!isFinite(component)) {
      issues.push(`Invalid component detected: ${component}`);
      continue;
    }

    magnitude += component * component;
    
    if (component === 0) {
      zeroCount++;
    }

    // Count component occurrences for entropy calculation
    const rounded = Math.round(component * 10000) / 10000; // Round to 4 decimal places
    componentCounts.set(rounded, (componentCounts.get(rounded) || 0) + 1);
  }

  magnitude = Math.sqrt(magnitude);

  // Calculate sparsity (percentage of zero components)
  const sparsity = zeroCount / dimension;

  // Calculate entropy (measure of randomness/information content)
  let entropy = 0;
  for (const count of componentCounts.values()) {
    const probability = count / dimension;
    entropy -= probability * Math.log2(probability);
  }

  // Quality assessment following Cline's scoring patterns
  let qualityScore = 1.0;

  // Penalize extreme sparsity or lack of sparsity
  if (sparsity > 0.9) {
    qualityScore *= 0.5;
    issues.push('Vector is extremely sparse (>90% zeros)');
  } else if (sparsity < 0.01) {
    qualityScore *= 0.8;
    issues.push('Vector has very low sparsity (<1% zeros)');
  }

  // Penalize very low or very high magnitude
  if (magnitude < 0.1) {
    qualityScore *= 0.7;
    issues.push('Vector has very low magnitude');
  } else if (magnitude > 100) {
    qualityScore *= 0.8;
    issues.push('Vector has very high magnitude');
  }

  // Penalize low entropy (indicates low information content)
  const normalizedEntropy = entropy / Math.log2(dimension);
  if (normalizedEntropy < 0.3) {
    qualityScore *= 0.6;
    issues.push('Vector has low information entropy');
  }

  return {
    dimension,
    magnitude,
    sparsity,
    entropy: normalizedEntropy,
    qualityScore: Math.max(0, Math.min(1, qualityScore)),
    issues
  };
}

// =============================================================================
// BATCH VECTOR PROCESSING
// =============================================================================

/**
 * Processes multiple vectors in batches for optimal performance
 * Implements Cline's batch processing patterns with ReadyAI optimizations
 * 
 * @param vectors Array of vectors to process
 * @param operation Operation to perform on each vector
 * @param batchSize Size of each processing batch
 * @returns Processed vectors
 */
export async function processBatchVectors<T>(
  vectors: number[][],
  operation: (vector: number[]) => Promise<T> | T,
  batchSize: number = 100
): Promise<AsyncResult<T[]>> {
  return wrapAsync(async () => {
    if (!Array.isArray(vectors)) {
      throw new VectorDatabaseError(
        'Invalid vectors input: must be an array',
        'INVALID_VECTOR',
        400
      );
    }

    if (batchSize <= 0) {
      throw new VectorDatabaseError(
        'Batch size must be positive',
        'INVALID_VECTOR',
        400,
        { batchSize }
      );
    }

    const results: T[] = [];
    const startTime = Date.now();

    // Process vectors in batches following Cline's chunking patterns
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (vector) => {
          try {
            return await operation(vector);
          } catch (error) {
            throw new VectorDatabaseError(
              `Batch processing failed at vector ${i + batch.indexOf(vector)}`,
              'BATCH_PROCESSING_ERROR',
              500,
              { error: error instanceof Error ? error.message : String(error) }
            );
          }
        })
      );
      
      results.push(...batchResults);

      // Yield control periodically for long-running operations
      if (i + batchSize < vectors.length) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    const duration = Date.now() - startTime;
    console.log(`Processed ${vectors.length} vectors in ${duration}ms (${batchSize} batch size)`);

    return results;
  });
}

/**
 * Calculates similarity scores between a query vector and multiple candidate vectors
 * Optimized for bulk similarity calculations
 * 
 * @param queryVector The reference vector for comparison
 * @param candidateVectors Array of vectors to compare against
 * @param metric Similarity metric to use
 * @returns Array of similarity scores
 */
export async function calculateBatchSimilarities(
  queryVector: number[],
  candidateVectors: number[][],
  metric: 'cosine' | 'dot' | 'euclidean' = 'cosine'
): Promise<AsyncResult<number[]>> {
  return wrapAsync(async () => {
    // Validate query vector once
    if (!Array.isArray(queryVector) || queryVector.length === 0) {
      throw new VectorDatabaseError(
        'Invalid query vector',
        'INVALID_VECTOR',
        400
      );
    }

    const operation = (candidateVector: number[]): number => {
      switch (metric) {
        case 'cosine':
          return calculateCosineSimilarity(queryVector, candidateVector);
        case 'dot':
          return calculateDotProduct(queryVector, candidateVector);
        case 'euclidean':
          return 1 / (1 + calculateEuclideanDistance(queryVector, candidateVector)); // Convert distance to similarity
        default:
          throw new VectorDatabaseError(
            `Unsupported similarity metric: ${metric}`,
            'INVALID_VECTOR',
            400
          );
      }
    };

    const result = await processBatchVectors(candidateVectors, operation);
    if (!result.success) {
      throw result.error;
    }

    return result.data;
  });
}

// =============================================================================
// READYAI-SPECIFIC VECTOR OPERATIONS
// =============================================================================

/**
 * Enhances vector search results with ReadyAI-specific context and relevance scoring
 * Implements ReadyAI's semantic understanding patterns
 * 
 * @param searchResults Raw vector search results
 * @param contextNodes Available context nodes for enrichment
 * @param query Original search query for relevance scoring
 * @returns Enhanced semantic search results
 */
export function enhanceSearchResults(
  searchResults: VectorSearchResult[],
  contextNodes: Map<string, VectorContextNode>,
  query: string
): SemanticSearchResult[] {
  return searchResults.map(result => {
    // Find corresponding context node
    const contextNode = contextNodes.get(result.id);
    
    if (!contextNode) {
      throw new VectorDatabaseError(
        `Context node not found for result ID: ${result.id}`,
        'CONTEXT_NOT_FOUND',
        404,
        { resultId: result.id }
      );
    }

    // Calculate enhanced relevance score combining vector similarity and context factors
    const enhancedScore = calculateContextualRelevance(result, contextNode, query);

    // Extract relevant snippet from content
    const snippet = extractRelevantSnippet(contextNode.content, query);

    // Generate explanation for the match
    const explanation = generateMatchExplanation(result, contextNode, query);

    // Find related context nodes
    const relatedNodes = findRelatedNodes(contextNode, contextNodes);

    return {
      contextNode,
      score: enhancedScore,
      snippet,
      explanation,
      relatedNodes
    };
  });
}

/**
 * Calculates contextual relevance score combining vector similarity with ReadyAI metadata
 * Follows Cline's scoring patterns with ReadyAI-specific enhancements
 */
function calculateContextualRelevance(
  result: VectorSearchResult,
  contextNode: VectorContextNode,
  query: string
): number {
  let relevanceScore = result.score;

  // Boost score based on context type relevance
  const contextTypeBoosts = {
    'file': 1.0,
    'dependency': 0.8,
    'api': 1.2,
    'config': 0.7,
    'documentation': 1.1
  };

  const typeBoost = contextTypeBoosts[contextNode.type] || 1.0;
  relevanceScore *= typeBoost;

  // Boost based on recent access (recency bias)
  const lastAccessed = new Date(contextNode.lastAccessed);
  const daysSinceAccess = (Date.now() - lastAccessed.getTime()) / (1000 * 60 * 60 * 24);
  const recencyBoost = Math.max(0.5, 1 - (daysSinceAccess * 0.1));
  relevanceScore *= recencyBoost;

  // Apply existing relevance score from context node
  relevanceScore *= contextNode.relevanceScore;

  // Normalize to [0, 1] range
  return Math.max(0, Math.min(1, relevanceScore));
}

/**
 * Extracts relevant snippet from content based on query
 * Implements intelligent snippet extraction following Cline's text processing patterns
 */
function extractRelevantSnippet(content: string, query: string, maxLength: number = 200): string {
  if (!content || content.length <= maxLength) {
    return content;
  }

  // Simple implementation - find best matching segment
  const words = query.toLowerCase().split(/\s+/);
  const contentLower = content.toLowerCase();
  
  let bestStart = 0;
  let bestScore = 0;

  // Slide window through content to find best match
  for (let i = 0; i <= content.length - maxLength; i += 50) {
    const segment = contentLower.slice(i, i + maxLength);
    const score = words.reduce((acc, word) => {
      return acc + (segment.includes(word) ? 1 : 0);
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      bestStart = i;
    }
  }

  let snippet = content.slice(bestStart, bestStart + maxLength);
  
  // Clean up snippet boundaries
  if (bestStart > 0) {
    snippet = '...' + snippet;
  }
  if (bestStart + maxLength < content.length) {
    snippet = snippet + '...';
  }

  return snippet.trim();
}

/**
 * Generates human-readable explanation for why a result matched
 * Follows Cline's explanation generation patterns
 */
function generateMatchExplanation(
  result: VectorSearchResult,
  contextNode: VectorContextNode,
  query: string
): string {
  const explanations: string[] = [];

  // Base similarity explanation
  const similarityPercent = Math.round(result.score * 100);
  explanations.push(`${similarityPercent}% semantic similarity`);

  // Context type explanation
  const contextTypeLabels = {
    'file': 'source file',
    'dependency': 'dependency',
    'api': 'API endpoint',
    'config': 'configuration',
    'documentation': 'documentation'
  };
  
  const typeLabel = contextTypeLabels[contextNode.type] || 'content';
  explanations.push(`matches in ${typeLabel}`);

  // Recent access boost
  const lastAccessed = new Date(contextNode.lastAccessed);
  const daysSinceAccess = (Date.now() - lastAccessed.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceAccess < 7) {
    explanations.push('recently accessed');
  }

  return explanations.join(', ');
}

/**
 * Finds related context nodes based on dependencies and similarity
 * Implements ReadyAI's relationship discovery patterns
 */
function findRelatedNodes(
  contextNode: VectorContextNode,
  contextNodes: Map<string, VectorContextNode>
): Array<{ id: UUID; relationship: 'dependency' | 'dependent' | 'similar'; score: number }> {
  const relatedNodes: Array<{ id: UUID; relationship: 'dependency' | 'dependent' | 'similar'; score: number }> = [];

  // Add direct dependencies
  for (const depId of contextNode.dependencies) {
    relatedNodes.push({
      id: depId,
      relationship: 'dependency',
      score: 1.0
    });
  }

  // Add dependents
  for (const depId of contextNode.dependents) {
    relatedNodes.push({
      id: depId,
      relationship: 'dependent',
      score: 1.0
    });
  }

  // Find similar nodes (if we have embedding data)
  if (contextNode.embedding) {
    for (const [nodeId, node] of contextNodes.entries()) {
      if (node.id === contextNode.id || !node.embedding) continue;

      try {
        const similarity = calculateCosineSimilarity(contextNode.embedding, node.embedding);
        if (similarity > 0.8) { // High similarity threshold
          relatedNodes.push({
            id: node.id,
            relationship: 'similar',
            score: similarity
          });
        }
      } catch {
        // Skip if similarity calculation fails
        continue;
      }
    }
  }

  // Sort by score and limit results
  return relatedNodes
    .sort((a, b) => b.score - a.score)
    .slice(0, 5); // Top 5 related nodes
}

// =============================================================================
// VECTOR VALIDATION AND DIAGNOSTICS
// =============================================================================

/**
 * Validates vector compatibility and quality
 * Implements comprehensive validation following Cline's validation patterns
 * 
 * @param vectors Array of vectors to validate
 * @param expectedDimension Expected vector dimension
 * @returns Validation results
 */
export function validateVectors(
  vectors: number[][],
  expectedDimension?: number
): VectorValidationResult {
  const validationId = `val_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const issues: string[] = [];
  const warnings: string[] = [];
  let allValid = true;

  // Basic structure validation
  if (!Array.isArray(vectors)) {
    return {
      id: validationId as UUID,
      type: 'format',
      valid: false,
      errors: ['Input is not an array'],
      warnings: [],
      suggestions: ['Provide an array of number arrays'],
      score: 0,
      validatedAt: createTimestamp(),
      validator: 'VectorUtils.validateVectors',
      vectorValidations: [],
      collectionCompatibility: {
        compatible: false,
        issues: ['Invalid input format'],
        suggestions: ['Ensure input is an array of vectors']
      }
    };
  }

  const vectorValidations: Array<{
    type: 'dimension' | 'format' | 'range' | 'metadata';
    field: string;
    valid: boolean;
    message: string;
    suggestion?: string;
  }> = [];

  // Validate each vector
  for (let i = 0; i < vectors.length; i++) {
    const vector = vectors[i];
    const fieldName = `vector[${i}]`;

    // Check if it's an array
    if (!Array.isArray(vector)) {
      vectorValidations.push({
        type: 'format',
        field: fieldName,
        valid: false,
        message: `Vector at index ${i} is not an array`,
        suggestion: 'Ensure all vectors are number arrays'
      });
      allValid = false;
      continue;
    }

    // Check dimension consistency
    if (expectedDimension && vector.length !== expectedDimension) {
      vectorValidations.push({
        type: 'dimension',
        field: fieldName,
        valid: false,
        message: `Vector at index ${i} has dimension ${vector.length}, expected ${expectedDimension}`,
        suggestion: `Ensure all vectors have dimension ${expectedDimension}`
      });
      allValid = false;
    }

    // Check for valid numbers
    for (let j = 0; j < vector.length; j++) {
      const component = vector[j];
      if (!isFinite(component)) {
        vectorValidations.push({
          type: 'range',
          field: `${fieldName}[${j}]`,
          valid: false,
          message: `Invalid component at position ${j}: ${component}`,
          suggestion: 'Replace invalid components with valid numbers'
        });
        allValid = false;
      }
    }

    // Quality warnings
    const qualityAnalysis = analyzeEmbeddingQuality(vector);
    if (qualityAnalysis.qualityScore < 0.5) {
      warnings.push(`Vector at index ${i} has low quality score: ${qualityAnalysis.qualityScore.toFixed(2)}`);
      qualityAnalysis.issues.forEach(issue => {
        warnings.push(`Vector ${i}: ${issue}`);
      });
    }
  }

  // Calculate overall validation score
  const validVectors = vectorValidations.filter(v => v.valid).length;
  const totalVectors = vectors.length;
  const score = totalVectors > 0 ? (validVectors / totalVectors) * 100 : 0;

  return {
    id: validationId as UUID,
    type: 'format',
    valid: allValid,
    errors: vectorValidations.filter(v => !v.valid).map(v => v.message),
    warnings,
    suggestions: [
      ...new Set(vectorValidations.filter(v => v.suggestion).map(v => v.suggestion!))
    ],
    score,
    validatedAt: createTimestamp(),
    validator: 'VectorUtils.validateVectors',
    vectorValidations,
    collectionCompatibility: {
      compatible: allValid,
      issues: allValid ? [] : ['Vector validation failed'],
      suggestions: allValid ? [] : ['Fix validation errors before proceeding']
    }
  };
}

// =============================================================================
// PERFORMANCE UTILITIES
// =============================================================================

/**
 * Creates performance metrics for vector operations
 * Follows Cline's telemetry and metrics patterns
 */
export function createPerformanceMetrics(
  operationType: 'search' | 'insert' | 'update' | 'delete' | 'embed',
  collection: string,
  startTime: number,
  vectorCount: number,
  additionalMetrics?: Partial<VectorPerformanceMetrics['metrics']>
): VectorPerformanceMetrics {
  const totalTimeMs = Date.now() - startTime;
  
  return {
    operationType,
    collection,
    metrics: {
      totalTimeMs,
      vectorProcessingMs: totalTimeMs * 0.8, // Estimate processing time
      networkLatencyMs: totalTimeMs * 0.2, // Estimate network time
      vectorCount,
      throughput: vectorCount > 0 ? vectorCount / (totalTimeMs / 1000) : 0,
      peakMemoryMB: process.memoryUsage().heapUsed / 1024 / 1024,
      ...additionalMetrics
    },
    timestamp: createTimestamp()
  };
}

/**
 * Utility to measure and log vector operation performance
 * Implements Cline's performance monitoring patterns
 */
export async function measureVectorOperation<T>(
  operationName: string,
  operation: () => Promise<T>,
  vectorCount: number = 0
): Promise<{ result: T; metrics: VectorPerformanceMetrics }> {
  const startTime = Date.now();
  
  try {
    const result = await operation();
    const metrics = createPerformanceMetrics(
      'search', // Default operation type
      'unknown',
      startTime,
      vectorCount
    );
    
    console.log(`Vector operation '${operationName}' completed in ${metrics.metrics.totalTimeMs}ms`);
    
    return { result, metrics };
  } catch (error) {
    const metrics = createPerformanceMetrics(
      'search',
      'unknown',
      startTime,
      vectorCount
    );
    
    console.error(`Vector operation '${operationName}' failed after ${metrics.metrics.totalTimeMs}ms:`, error);
    throw error;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const VectorUtils = {
  // Similarity calculations
  calculateCosineSimilarity,
  calculateDotProduct,
  calculateEuclideanDistance,
  calculateManhattanDistance,
  
  // Normalization
  normalizeVector,
  standardizeVector,
  minMaxNormalizeVector,
  
  // Quality assessment
  analyzeEmbeddingQuality,
  
  // Batch processing
  processBatchVectors,
  calculateBatchSimilarities,
  
  // ReadyAI-specific
  enhanceSearchResults,
  
  // Validation
  validateVectors,
  
  // Performance
  createPerformanceMetrics,
  measureVectorOperation
} as const;

export default VectorUtils;
