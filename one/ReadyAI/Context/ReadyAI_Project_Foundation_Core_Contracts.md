# ReadyAI: Project Foundation & Core Contracts Document

## **1. Document Overview**

**Purpose:** This document establishes the foundational technical conventions for the entire ReadyAI application. All subsequent module specifications and code generation must strictly adhere to the patterns and contracts defined herein. This ensures perfect consistency, maintainability, and developer efficiency from day one across all components of the AI-powered personal development orchestrator.

## **2. Foundational Type Definitions (`types.ts`)**

```typescript
/**
 * Core foundational types for ReadyAI Personal AI Development Orchestrator
 * Single source of truth for all shared data shapes
 */

/** UUID type for unique identifiers across the system */
export type UUID = string;

/** Generic API response wrapper for successful responses */
export interface ApiResponse<T> {
  /** Success indicator */
  success: true;
  /** Response data payload */
  data: T;
  /** Optional metadata */
  metadata?: {
    timestamp: string;
    requestId: string;
  };
}

/** Standardized API error response */
export interface ApiErrorResponse {
  /** Failure indicator */
  success: false;
  /** Error details */
  error: {
    /** Human-readable error message */
    message: string;
    /** Optional error code for programmatic handling */
    code?: string;
    /** Optional additional error details */
    details?: Record<string, any>;
  };
}

/** Development phases in the 7-phase methodology */
export type PhaseType = 
  | 'Phase0_StrategicCharter'
  | 'Phase1_ArchitecturalBlueprint' 
  | 'Phase2_0_CoreContracts'
  | 'Phase2_1_ModuleSpec'
  | 'Phase2_3_ModuleSpecSubsequent'
  | 'Phase3_0_ProjectScaffolding'
  | 'Phase3_0_1_MasterPlan'
  | 'Phase3_1_FileGeneration'
  | 'Phase4_ValidationCorrection'
  | 'Phase5_TestGeneration'
  | 'Phase6_Documentation'
  | 'Phase7_Iteration';

/** Status of a development phase */
export type PhaseStatus = 'pending' | 'in_progress' | 'completed' | 'validated' | 'failed';

/** AI provider types supported by the system */
export type AIProviderType = 'claude-sonnet-4';

/** Context node types for semantic organization */
export type ContextType = 'file' | 'module' | 'dependency' | 'pattern' | 'artifact';

/** Core project entity representing a software development project */
export interface Project {
  /** Unique project identifier */
  id: UUID;
  /** Project name */
  name: string;
  /** Detailed project description */
  description?: string;
  /** Current development phase */
  currentPhase: PhaseType;
  /** Root file system path */
  rootPath: string;
  /** Technology stack configuration */
  techStack: TechStack;
  /** Project creation timestamp */
  createdAt: string; // ISO 8601 format
  /** Last modification timestamp */
  lastModified: string; // ISO 8601 format
  /** Project configuration */
  config: ProjectConfig;
}

/** Technology stack configuration */
export interface TechStack {
  /** Frontend framework */
  frontend?: string;
  /** Backend framework */
  backend?: string;
  /** Database technology */
  database?: string;
  /** Programming languages */
  languages: string[];
  /** Additional tools and libraries */
  tools: string[];
}

/** Project-specific configuration */
export interface ProjectConfig {
  /** Code quality preferences */
  quality: {
    /** Target test coverage percentage */
    testCoverage: number;
    /** Linting strictness level */
    lintingLevel: 'basic' | 'standard' | 'strict';
    /** Type checking strictness */
    typeChecking: 'loose' | 'standard' | 'strict';
  };
  /** AI generation preferences */
  aiSettings: {
    /** Preferred AI provider */
    preferredProvider: AIProviderType;
    /** Enable extended thinking mode */
    extendedThinking: boolean;
    /** Context compression level */
    contextCompression: 'minimal' | 'standard' | 'aggressive';
  };
}

/** Development phase instance */
export interface Phase {
  /** Phase type identifier */
  id: PhaseType;
  /** Current status of phase */
  status: PhaseStatus;
  /** Generated artifacts for this phase */
  artifacts: PhaseArtifact[];
  /** Dependencies on other phases */
  dependencies: PhaseType[];
  /** Phase completion timestamp */
  completedAt?: string; // ISO 8601 format
  /** Validation results */
  validationResults?: ValidationResult[];
}

/** Artifact generated during a phase */
export interface PhaseArtifact {
  /** Unique artifact identifier */
  id: UUID;
  /** Artifact filename */
  filename: string;
  /** File path relative to project root */
  path: string;
  /** Artifact content */
  content: string;
  /** Content hash for change detection */
  contentHash: string;
  /** Generation timestamp */
  generatedAt: string; // ISO 8601 format
}

/** Context node for semantic project understanding */
export interface ContextNode {
  /** Unique context identifier */
  id: UUID;
  /** Project this context belongs to */
  projectId: UUID;
  /** Type of context element */
  type: ContextType;
  /** File path or identifier */
  path: string;
  /** Content or summary */
  content: string;
  /** Vector embedding for semantic search */
  vectorEmbedding: number[];
  /** Dependencies this context relies on */
  dependencies: UUID[];
  /** Contexts that depend on this one */
  dependents: UUID[];
  /** Relevance score for retrieval */
  relevanceScore: number;
  /** Last access timestamp */
  lastAccessed: string; // ISO 8601 format
  /** Metadata for additional context */
  metadata: Record<string, any>;
}

/** Node in the dependency graph */
export interface DependencyNode {
  /** Node identifier */
  id: UUID;
  /** File path */
  path: string;
  /** Dependencies of this node */
  dependencies: UUID[];
  /** Estimated generation complexity */
  complexity: number;
}

/** Edge in the dependency graph */
export interface DependencyEdge {
  /** Source node */
  from: UUID;
  /** Target node */
  to: UUID;
  /** Dependency type */
  type: 'import' | 'extends' | 'implements' | 'uses';
}

/** Complete dependency graph for a project */
export interface DependencyGraph {
  /** All nodes in the graph */
  nodes: Map<string, DependencyNode>;
  /** All edges in the graph */
  edges: DependencyEdge[];
  /** Optimal generation order */
  generationOrder: string[];
  /** Detected circular dependencies */
  circularDependencies: string[][];
}

/** AI code generation request */
export interface GenerationRequest {
  /** Unique request identifier */
  id: UUID;
  /** Associated project */
  projectId: UUID;
  /** Target file to generate */
  targetFile: string;
  /** Current phase */
  phase: PhaseType;
  /** Context package for AI */
  contextPackage: ContextPackage;
  /** AI provider to use */
  aiProvider: AIProviderType;
  /** Enable extended thinking mode */
  extendedThinking: boolean;
  /** Request status */
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  /** Generation result */
  result?: GenerationResult;
  /** Request timestamp */
  createdAt: string; // ISO 8601 format
}

/** Context package sent to AI for generation */
export interface ContextPackage {
  /** Relevant context nodes */
  contextNodes: ContextNode[];
  /** Dependency information */
  dependencyGraph: DependencyGraph;
  /** Phase-specific context */
  phaseContext: Record<string, any>;
  /** Total token count estimate */
  estimatedTokens: number;
}

/** Result of AI generation */
export interface GenerationResult {
  /** Generated content */
  content: string;
  /** Confidence score */
  confidence: number;
  /** Any issues or warnings */
  issues: string[];
  /** Token usage */
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };
  /** Generation timestamp */
  generatedAt: string; // ISO 8601 format
}

/** Validation result for code or artifacts */
export interface ValidationResult {
  /** Validation identifier */
  id: UUID;
  /** Validation type */
  type: 'syntax' | 'type' | 'lint' | 'test' | 'dependency';
  /** Validation passed */
  passed: boolean;
  /** Error messages */
  errors: string[];
  /** Warning messages */
  warnings: string[];
  /** Suggestions for improvement */
  suggestions: string[];
}

/** Quality metrics for project monitoring */
export interface QualityMetrics {
  /** Project identifier */
  projectId: UUID;
  /** Architectural consistency score (0-100) */
  architecturalConsistency: number;
  /** Test coverage percentage (0-100) */
  testCoverage: number;
  /** Dependency health score (0-100) */
  dependencyHealth: number;
  /** Context efficiency score (0-100) */
  contextEfficiency: number;
  /** Last calculation timestamp */
  lastCalculated: string; // ISO 8601 format
}

/** Paginated response wrapper */
export interface PaginatedResponse<T> {
  /** Array of items for current page */
  items: T[];
  /** Total number of items */
  total: number;
  /** Current page number (1-based) */
  page: number;
  /** Items per page */
  pageSize: number;
  /** Total number of pages */
  totalPages: number;
  /** Has next page */
  hasNext: boolean;
  /** Has previous page */
  hasPrevious: boolean;
}

/** Validation error details */
export interface ValidationError {
  /** Field name that failed validation */
  field: string;
  /** Validation error message */
  message: string;
  /** Invalid value */
  value?: any;
}
```

## **3. Formal API Contract Scaffolding (OpenAPI 3.0 Specification)**

```yaml
openapi: 3.0.0
info:
  title: ReadyAI Personal Development Orchestrator API
  description: >-
    Complete API specification for ReadyAI - Personal AI Development Orchestrator.
    This API supports the 7-phase development methodology, advanced context management,
    dependency-aware code generation, and quality assurance capabilities.
  version: 1.0.0
  contact:
    name: ReadyAI Development
    url: https://github.com/readyai/readyai

servers:
  - url: http://localhost:8000/api/v1
    description: Local development server
  - url: https://api.readyai.local/v1
    description: Local production server

components:
  securitySchemes:
    # Note: Local-only authentication as per charter requirements
    localAuth:
      type: apiKey
      in: header
      name: X-Local-Auth
      description: Local authentication token for VS Code extension

  schemas:
    UUID:
      type: string
      format: uuid
      description: Universally unique identifier

    PhaseType:
      type: string
      enum:
        - Phase0_StrategicCharter
        - Phase1_ArchitecturalBlueprint
        - Phase2_0_CoreContracts
        - Phase2_1_ModuleSpec
        - Phase2_3_ModuleSpecSubsequent
        - Phase3_0_ProjectScaffolding
        - Phase3_0_1_MasterPlan
        - Phase3_1_FileGeneration
        - Phase4_ValidationCorrection
        - Phase5_TestGeneration
        - Phase6_Documentation
        - Phase7_Iteration
      description: Development phases in the 7-phase methodology

    PhaseStatus:
      type: string
      enum:
        - pending
        - in_progress
        - completed
        - validated
        - failed
      description: Status of a development phase

    AIProviderType:
      type: string
      enum:
        - claude-sonnet-4
      description: Supported AI provider types

    ApiResponse:
      type: object
      required:
        - success
        - data
      properties:
        success:
          type: boolean
          enum: [true]
        data:
          type: object
        metadata:
          type: object
          properties:
            timestamp:
              type: string
              format: date-time
            requestId:
              type: string

    ApiErrorResponse:
      type: object
      required:
        - success
        - error
      properties:
        success:
          type: boolean
          enum: [false]
        error:
          type: object
          required:
            - message
          properties:
            message:
              type: string
            code:
              type: string
            details:
              type: object

    Project:
      type: object
      required:
        - id
        - name
        - currentPhase
        - rootPath
        - techStack
        - createdAt
        - lastModified
        - config
      properties:
        id:
          $ref: '#/components/schemas/UUID'
        name:
          type: string
          minLength: 1
          maxLength: 200
        description:
          type: string
          maxLength: 1000
        currentPhase:
          $ref: '#/components/schemas/PhaseType'
        rootPath:
          type: string
        techStack:
          type: object
          properties:
            frontend:
              type: string
            backend:
              type: string
            database:
              type: string
            languages:
              type: array
              items:
                type: string
            tools:
              type: array
              items:
                type: string
        createdAt:
          type: string
          format: date-time
        lastModified:
          type: string
          format: date-time
        config:
          type: object
          properties:
            quality:
              type: object
              properties:
                testCoverage:
                  type: number
                  minimum: 0
                  maximum: 100
                lintingLevel:
                  type: string
                  enum: [basic, standard, strict]
                typeChecking:
                  type: string
                  enum: [loose, standard, strict]
            aiSettings:
              type: object
              properties:
                preferredProvider:
                  $ref: '#/components/schemas/AIProviderType'
                extendedThinking:
                  type: boolean
                contextCompression:
                  type: string
                  enum: [minimal, standard, aggressive]

    ContextNode:
      type: object
      required:
        - id
        - projectId
        - type
        - path
        - content
        - vectorEmbedding
        - dependencies
        - dependents
        - relevanceScore
        - lastAccessed
        - metadata
      properties:
        id:
          $ref: '#/components/schemas/UUID'
        projectId:
          $ref: '#/components/schemas/UUID'
        type:
          type: string
          enum: [file, module, dependency, pattern, artifact]
        path:
          type: string
        content:
          type: string
        vectorEmbedding:
          type: array
          items:
            type: number
        dependencies:
          type: array
          items:
            $ref: '#/components/schemas/UUID'
        dependents:
          type: array
          items:
            $ref: '#/components/schemas/UUID'
        relevanceScore:
          type: number
          minimum: 0
          maximum: 1
        lastAccessed:
          type: string
          format: date-time
        metadata:
          type: object

    GenerationRequest:
      type: object
      required:
        - id
        - projectId
        - targetFile
        - phase
        - aiProvider
        - extendedThinking
        - status
        - createdAt
      properties:
        id:
          $ref: '#/components/schemas/UUID'
        projectId:
          $ref: '#/components/schemas/UUID'
        targetFile:
          type: string
        phase:
          $ref: '#/components/schemas/PhaseType'
        aiProvider:
          $ref: '#/components/schemas/AIProviderType'
        extendedThinking:
          type: boolean
        status:
          type: string
          enum: [pending, in_progress, completed, failed]
        result:
          type: object
          properties:
            content:
              type: string
            confidence:
              type: number
              minimum: 0
              maximum: 1
            issues:
              type: array
              items:
                type: string
            tokenUsage:
              type: object
              properties:
                input:
                  type: integer
                output:
                  type: integer
                total:
                  type: integer
            generatedAt:
              type: string
              format: date-time
        createdAt:
          type: string
          format: date-time

tags:
  - name: Projects
    description: Project management and lifecycle operations
  - name: Phases
    description: Development phase management and progression
  - name: Generation
    description: AI-powered code generation services
  - name: Context
    description: Context management and semantic search
  - name: Dependencies
    description: Dependency tracking and analysis
  - name: Quality
    description: Quality assurance and validation
  - name: Configuration
    description: System configuration and preferences
```

## **4. Foundational Frontend State & Data-Fetching Strategy**

**Authentication & Session Management:**
ReadyAI uses a local-only authentication model suitable for personal development use. The VS Code extension manages authentication state through a React Context provider.

```typescript
// Local authentication context for VS Code extension
interface AuthContextType {
  isAuthenticated: boolean;
  sessionId: string | null;
  extensionVersion: string;
  authenticate: () => Promise<void>;
  deauthenticate: () => void;
}
```

**Server Data Caching:**
Mandatory use of **TanStack Query (React Query)** for all server state management with the following configuration:
- **Stale Time:** 5 minutes for project data, 1 hour for context patterns
- **Cache Time:** 30 minutes default, 2 hours for large context data
- **Retry Logic:** 3 attempts with exponential backoff for network requests

**Base API Client Wrapper:**
Pre-configured Axios instance with ReadyAI-specific features:

```typescript
import axios from 'axios';
import { ApiResponse, ApiErrorResponse } from './types';

const apiClient = axios.create({
  baseURL: process.env.VSCODE_API_BASE_URL || 'http://localhost:8000/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'X-ReadyAI-Client': 'vscode-extension'
  },
});

// Request interceptor for local authentication
apiClient.interceptors.request.use((config) => {
  // Add VS Code extension authentication
  const sessionId = vscode.workspace.getConfiguration('readyai').get('sessionId');
  if (sessionId && config.headers) {
    config.headers['X-Local-Auth'] = sessionId;
  }
  return config;
});

// Response interceptor for consistent API response handling
apiClient.interceptors.response.use(
  (response) => {
    // Unwrap ApiResponse<T> wrapper
    if (response.data?.success === true) {
      return response.data;
    }
    return response.data;
  },
  (error) => {
    // Transform error to ApiErrorResponse format
    const apiError: ApiErrorResponse = {
      success: false,
      error: {
        message: error.response?.data?.error?.message || error.message || 'An unexpected error occurred',
        code: error.response?.data?.error?.code || error.response?.status?.toString(),
        details: error.response?.data?.error?.details
      },
    };
    return Promise.reject(apiError);
  }
);

export default apiClient;
```

## **5. Core Environment Variable Manifest (`.env.template`)**

| Variable Name | Scope | Description & Example |
|---|---|---|
| `PORT` | Backend | Backend server port (e.g., `8000`) |
| `NODE_ENV` | Backend | Application environment (`development`, `production`) |
| `LOG_LEVEL` | Backend | Logging level (`debug`, `info`, `warn`, `error`) |
| `DATABASE_URL` | Backend | SQLite connection string (e.g., `sqlite:///./data/readyai.db`) |
| `MILVUS_HOST` | Backend | Milvus vector database host (e.g., `localhost`) |
| `MILVUS_PORT` | Backend | Milvus vector database port (e.g., `19530`) |
| `VECTOR_EMBEDDING_MODEL` | Backend | Sentence transformer model (`sentence-transformers/all-mpnet-base-v2`) |
| `OPENROUTER_API_KEY` | Backend | OpenRouter API key for Claude Sonnet 4 access |
| `OPENROUTER_BASE_URL` | Backend | OpenRouter API base URL (`https://openrouter.ai/api/v1`) |
| `CONTEXT_CACHE_TTL` | Backend | Context cache TTL in seconds (e.g., `3600`) |
| `MAX_CONTEXT_NODES` | Backend | Maximum context nodes per request (e.g., `100`) |
| `GENERATION_TIMEOUT` | Backend | AI generation timeout in seconds (e.g., `300`) |
| `VSCODE_API_BASE_URL` | Extension | Backend API URL for VS Code extension (`http://localhost:8000/api/v1`) |
| `ENABLE_EXTENDED_THINKING` | Backend | Enable Claude extended thinking mode (`true`) |
| `PROJECT_ROOT_PATH` | Backend | Default project root directory |
| `BACKUP_RETENTION_DAYS` | Backend | Number of days to retain project backups (e.g., `30`) |

## **6. Project-Wide Coding Conventions**

**Naming Conventions:**
- **API endpoints and JSON properties:** camelCase (e.g., `projectId`, `createdAt`)
- **Database tables and columns:** snake_case (e.g., `project_contexts`, `created_at`)
- **File and directory names:** kebab-case (e.g., `context-manager.service.ts`)
- **Component names:** PascalCase (e.g., `ProjectExplorerComponent`)
- **Constants:** SCREAMING_SNAKE_CASE (e.g., `MAX_CONTEXT_NODES`)

**Error Handling:**
- **All API error responses** must strictly conform to the `ApiErrorResponse` interface
- **Service-layer errors** must be caught and transformed to user-friendly messages
- **Validation errors** must include field-level details using `ValidationError` interface
- **Async operations** must include proper error boundaries and fallback mechanisms

**Asynchronous Code:**
- **Exclusive use of async/await** for all asynchronous operations
- **Prohibition of .then() chains** in new code
- **Promise-based APIs** must be wrapped with async/await
- **Error handling** must use try/catch blocks, not Promise.catch()

**Code Quality Standards:**
- **JSDoc comments** required for all public functions, interfaces, and classes
- **TypeScript strict mode** enabled for all modules
- **ESLint and Prettier** configuration enforced via VS Code extension
- **Test coverage** minimum 90% for critical AI generation paths, 75% overall
- **Performance budgets** enforced for context retrieval (<3 seconds) and generation operations

**Context Management Standards:**
- **Vector embeddings** must use sentence-transformers/all-mpnet-base-v2 model
- **Context compression** must preserve semantic meaning while reducing token count
- **Dependency tracking** must be updated atomically with file generation
- **Relevance scoring** must be recalculated after major project changes

**AI Integration Standards:**
- **Extended thinking mode** must be enabled for complex architectural decisions
- **Token usage** must be monitored and logged for optimization
- **Generation quality** must be validated before accepting AI output
- **Retry logic** must implement exponential backoff for API failures

This Project Foundation & Core Contracts Document serves as the definitive technical foundation for all ReadyAI development. All subsequent modules, features, and code generation must adhere strictly to these established patterns and conventions to ensure the advanced context management system and multi-phase development orchestrator operate with perfect consistency and reliability.
