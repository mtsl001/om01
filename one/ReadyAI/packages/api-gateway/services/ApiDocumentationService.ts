// packages/api-gateway/services/ApiDocumentationService.ts

/**
 * API Documentation Service for ReadyAI Personal AI Development Orchestrator
 * 
 * Generates and serves comprehensive OpenAPI documentation with real-time schema
 * generation, interactive exploration, and automated endpoint discovery.
 * 
 * @version 1.0.0 - Production Ready
 * @author ReadyAI Development Team
 * 
 * Cline Source Adaptation:
 * - Documentation patterns from Cline's configuration UI generation (Pattern-Replicate 60% reuse)
 * - Service orchestration from src/services/ architecture (75% reuse)
 * - Route discovery from src/api/ patterns (65% reuse)
 * - Schema validation from Cline's type system (70% reuse)
 * 
 * Key Features:
 * - Real-time OpenAPI 3.0 specification generation
 * - Interactive Swagger UI integration
 * - Automated endpoint discovery and documentation
 * - Type-safe schema generation from ReadyAI contracts
 * - Production-ready caching and performance optimization
 */

import {
  UUID,
  ApiResponse,
  ApiErrorResponse,
  createApiResponse,
  createApiError,
  createTimestamp,
  HTTP_STATUS,
  ERROR_CODES,
  PhaseType,
  AIProviderType
} from '../../foundation/types/core';

import {
  GatewayConfig,
  ServiceRoute,
  RoutingTable,
  GatewayError,
  GatewayErrorType,
  ReadyAIRequests,
  ReadyAIResponses,
  GATEWAY_DEFAULTS
} from '../types/gateway';

import { Logger } from '../../logging/services/Logger';
import { ErrorService } from '../../error-handling/services/ErrorService';

// =============================================================================
// OPENAPI SPECIFICATION TYPES
// =============================================================================

/**
 * OpenAPI 3.0 specification structure
 * Following official OpenAPI specification with ReadyAI extensions
 */
interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    description: string;
    version: string;
    contact?: {
      name: string;
      url?: string;
      email?: string;
    };
    license?: {
      name: string;
      url?: string;
    };
  };
  servers: Array<{
    url: string;
    description: string;
  }>;
  paths: Record<string, PathItem>;
  components: {
    schemas: Record<string, SchemaObject>;
    securitySchemes: Record<string, SecurityScheme>;
    parameters: Record<string, ParameterObject>;
    responses: Record<string, ResponseObject>;
  };
  security?: SecurityRequirement[];
  tags: TagObject[];
}

interface PathItem {
  summary?: string;
  description?: string;
  get?: OperationObject;
  post?: OperationObject;
  put?: OperationObject;
  patch?: OperationObject;
  delete?: OperationObject;
  options?: OperationObject;
  head?: OperationObject;
  parameters?: ParameterObject[];
}

interface OperationObject {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: ParameterObject[];
  requestBody?: RequestBodyObject;
  responses: Record<string, ResponseObject>;
  security?: SecurityRequirement[];
  deprecated?: boolean;
}

interface ParameterObject {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  schema?: SchemaObject;
  example?: any;
}

interface RequestBodyObject {
  description?: string;
  content: Record<string, MediaTypeObject>;
  required?: boolean;
}

interface ResponseObject {
  description: string;
  headers?: Record<string, HeaderObject>;
  content?: Record<string, MediaTypeObject>;
}

interface MediaTypeObject {
  schema?: SchemaObject;
  example?: any;
  examples?: Record<string, ExampleObject>;
}

interface SchemaObject {
  type?: string;
  format?: string;
  properties?: Record<string, SchemaObject>;
  items?: SchemaObject;
  required?: string[];
  enum?: any[];
  example?: any;
  description?: string;
  $ref?: string;
}

interface SecurityScheme {
  type: string;
  description?: string;
  name?: string;
  in?: string;
  scheme?: string;
}

interface SecurityRequirement {
  [key: string]: string[];
}

interface TagObject {
  name: string;
  description?: string;
  externalDocs?: {
    description?: string;
    url: string;
  };
}

interface HeaderObject {
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  schema?: SchemaObject;
}

interface ExampleObject {
  summary?: string;
  description?: string;
  value?: any;
  externalValue?: string;
}

// =============================================================================
// DOCUMENTATION SERVICE CONFIGURATION
// =============================================================================

interface ApiDocumentationConfig {
  /** Enable documentation generation */
  enabled: boolean;
  /** Documentation title */
  title: string;
  /** Documentation description */
  description: string;
  /** API version */
  version: string;
  /** Contact information */
  contact: {
    name: string;
    url?: string;
    email?: string;
  };
  /** Server configurations */
  servers: Array<{
    url: string;
    description: string;
  }>;
  /** Documentation UI settings */
  ui: {
    /** Enable Swagger UI */
    swagger: boolean;
    /** Enable ReDoc */
    redoc: boolean;
    /** Custom CSS */
    customCss?: string;
    /** Theme configuration */
    theme: 'light' | 'dark' | 'auto';
  };
  /** Caching configuration */
  cache: {
    /** Enable response caching */
    enabled: boolean;
    /** Cache TTL in seconds */
    ttl: number;
    /** Cache key prefix */
    keyPrefix: string;
  };
  /** Security documentation */
  security: {
    /** Include security schemes */
    includeSchemes: boolean;
    /** Security description */
    description?: string;
  };
  /** Example generation */
  examples: {
    /** Auto-generate examples */
    autoGenerate: boolean;
    /** Include realistic data */
    realistic: boolean;
    /** Example data seed */
    seed?: number;
  };
}

interface EndpointDocumentation {
  /** Route path */
  path: string;
  /** HTTP method */
  method: string;
  /** Operation summary */
  summary: string;
  /** Detailed description */
  description?: string;
  /** Operation tags */
  tags: string[];
  /** Parameters */
  parameters: ParameterDoc[];
  /** Request body schema */
  requestBody?: RequestBodyDoc;
  /** Response schemas */
  responses: Record<string, ResponseDoc>;
  /** Security requirements */
  security?: SecurityRequirement[];
  /** Deprecation status */
  deprecated?: boolean;
  /** Examples */
  examples?: Record<string, any>;
}

interface ParameterDoc {
  /** Parameter name */
  name: string;
  /** Parameter location */
  in: 'query' | 'header' | 'path' | 'cookie';
  /** Parameter description */
  description?: string;
  /** Required flag */
  required: boolean;
  /** Parameter type */
  type: string;
  /** Parameter format */
  format?: string;
  /** Enum values */
  enum?: any[];
  /** Example value */
  example?: any;
}

interface RequestBodyDoc {
  /** Description */
  description?: string;
  /** Content type schemas */
  content: Record<string, SchemaDoc>;
  /** Required flag */
  required: boolean;
}

interface ResponseDoc {
  /** Response description */
  description: string;
  /** Response headers */
  headers?: Record<string, HeaderDoc>;
  /** Response content */
  content?: Record<string, SchemaDoc>;
}

interface SchemaDoc {
  /** Schema reference or definition */
  schema: SchemaObject;
  /** Example value */
  example?: any;
}

interface HeaderDoc {
  /** Header description */
  description?: string;
  /** Header type */
  type: string;
  /** Example value */
  example?: any;
}

// =============================================================================
// API DOCUMENTATION SERVICE IMPLEMENTATION
// =============================================================================

/**
 * API Documentation Service
 * 
 * Provides comprehensive API documentation generation and serving capabilities
 * with real-time schema updates, interactive exploration, and automated discovery.
 */
export class ApiDocumentationService {
  private readonly logger: Logger;
  private readonly errorService: ErrorService;
  private config: ApiDocumentationConfig;
  private specCache: Map<string, { spec: OpenAPISpec; timestamp: number }>;
  private routeDocumentation: Map<string, EndpointDocumentation>;
  private schemaCache: Map<string, SchemaObject>;
  
  /**
   * Initialize API Documentation Service
   * 
   * @param config - Documentation configuration
   * @param logger - Logger instance
   * @param errorService - Error service instance
   */
  constructor(
    config: ApiDocumentationConfig,
    logger: Logger,
    errorService: ErrorService
  ) {
    this.config = config;
    this.logger = logger;
    this.errorService = errorService;
    this.specCache = new Map();
    this.routeDocumentation = new Map();
    this.schemaCache = new Map();
    
    this.logger.info('ApiDocumentationService initialized', {
      enabled: config.enabled,
      cacheEnabled: config.cache.enabled,
      version: config.version
    });
  }

  /**
   * Generate complete OpenAPI specification
   * 
   * @param gatewayConfig - Gateway configuration
   * @returns OpenAPI 3.0 specification
   */
  async generateOpenAPISpec(gatewayConfig: GatewayConfig): Promise<ApiResponse<OpenAPISpec>> {
    try {
      this.logger.debug('Generating OpenAPI specification');
      
      const cacheKey = this.generateCacheKey(gatewayConfig);
      
      // Check cache if enabled
      if (this.config.cache.enabled) {
        const cached = this.specCache.get(cacheKey);
        if (cached && this.isCacheValid(cached.timestamp)) {
          this.logger.debug('Returning cached OpenAPI specification');
          return createApiResponse(cached.spec);
        }
      }
      
      // Generate fresh specification
      const spec = await this.buildOpenAPISpec(gatewayConfig);
      
      // Cache the result
      if (this.config.cache.enabled) {
        this.specCache.set(cacheKey, {
          spec,
          timestamp: Date.now()
        });
      }
      
      this.logger.info('OpenAPI specification generated successfully', {
        pathCount: Object.keys(spec.paths).length,
        schemaCount: Object.keys(spec.components.schemas).length
      });
      
      return createApiResponse(spec);
      
    } catch (error) {
      this.logger.error('Failed to generate OpenAPI specification', { error });
      
      const gatewayError = new GatewayError(
        GatewayErrorType.INTERNAL_ERROR,
        'Failed to generate API documentation',
        {
          service: 'ApiDocumentationService',
          upstreamError: error as Error
        }
      );
      
      return this.errorService.handleServiceError(gatewayError);
    }
  }

  /**
   * Get documentation for specific endpoint
   * 
   * @param method - HTTP method
   * @param path - Route path
   * @returns Endpoint documentation
   */
  async getEndpointDocumentation(
    method: string,
    path: string
  ): Promise<ApiResponse<EndpointDocumentation | null>> {
    try {
      const routeKey = `${method.toUpperCase()}:${path}`;
      const documentation = this.routeDocumentation.get(routeKey);
      
      if (!documentation) {
        this.logger.warn('Documentation not found for endpoint', { method, path });
        return createApiResponse(null);
      }
      
      return createApiResponse(documentation);
      
    } catch (error) {
      this.logger.error('Failed to get endpoint documentation', { method, path, error });
      
      const gatewayError = new GatewayError(
        GatewayErrorType.INTERNAL_ERROR,
        'Failed to retrieve endpoint documentation',
        {
          service: 'ApiDocumentationService',
          route: `${method} ${path}`,
          upstreamError: error as Error
        }
      );
      
      return this.errorService.handleServiceError(gatewayError);
    }
  }

  /**
   * Generate Swagger UI HTML
   * 
   * @param specUrl - URL to OpenAPI specification
   * @returns HTML content for Swagger UI
   */
  async generateSwaggerUI(specUrl: string): Promise<ApiResponse<string>> {
    try {
      if (!this.config.ui.swagger) {
        throw new GatewayError(
          GatewayErrorType.CONFIGURATION_ERROR,
          'Swagger UI is disabled'
        );
      }
      
      const html = this.buildSwaggerHTML(specUrl);
      
      this.logger.debug('Generated Swagger UI HTML', { specUrl });
      
      return createApiResponse(html);
      
    } catch (error) {
      this.logger.error('Failed to generate Swagger UI', { specUrl, error });
      
      const gatewayError = new GatewayError(
        GatewayErrorType.INTERNAL_ERROR,
        'Failed to generate Swagger UI',
        {
          service: 'ApiDocumentationService',
          upstreamError: error as Error
        }
      );
      
      return this.errorService.handleServiceError(gatewayError);
    }
  }

  /**
   * Generate ReDoc HTML
   * 
   * @param specUrl - URL to OpenAPI specification
   * @returns HTML content for ReDoc
   */
  async generateReDocUI(specUrl: string): Promise<ApiResponse<string>> {
    try {
      if (!this.config.ui.redoc) {
        throw new GatewayError(
          GatewayErrorType.CONFIGURATION_ERROR,
          'ReDoc UI is disabled'
        );
      }
      
      const html = this.buildReDocHTML(specUrl);
      
      this.logger.debug('Generated ReDoc UI HTML', { specUrl });
      
      return createApiResponse(html);
      
    } catch (error) {
      this.logger.error('Failed to generate ReDoc UI', { specUrl, error });
      
      const gatewayError = new GatewayError(
        GatewayErrorType.INTERNAL_ERROR,
        'Failed to generate ReDoc UI',
        {
          service: 'ApiDocumentationService',
          upstreamError: error as Error
        }
      );
      
      return this.errorService.handleServiceError(gatewayError);
    }
  }

  /**
   * Update configuration
   * 
   * @param newConfig - New configuration
   */
  async updateConfiguration(newConfig: Partial<ApiDocumentationConfig>): Promise<ApiResponse<void>> {
    try {
      this.config = { ...this.config, ...newConfig };
      
      // Clear caches when configuration changes
      this.specCache.clear();
      this.routeDocumentation.clear();
      this.schemaCache.clear();
      
      this.logger.info('API documentation configuration updated', { newConfig });
      
      return createApiResponse(undefined);
      
    } catch (error) {
      this.logger.error('Failed to update configuration', { newConfig, error });
      
      const gatewayError = new GatewayError(
        GatewayErrorType.CONFIGURATION_ERROR,
        'Failed to update documentation configuration',
        {
          service: 'ApiDocumentationService',
          upstreamError: error as Error
        }
      );
      
      return this.errorService.handleServiceError(gatewayError);
    }
  }

  /**
   * Clear documentation cache
   */
  async clearCache(): Promise<ApiResponse<void>> {
    try {
      this.specCache.clear();
      this.routeDocumentation.clear();
      this.schemaCache.clear();
      
      this.logger.info('API documentation cache cleared');
      
      return createApiResponse(undefined);
      
    } catch (error) {
      this.logger.error('Failed to clear cache', { error });
      
      const gatewayError = new GatewayError(
        GatewayErrorType.INTERNAL_ERROR,
        'Failed to clear documentation cache',
        {
          service: 'ApiDocumentationService',
          upstreamError: error as Error
        }
      );
      
      return this.errorService.handleServiceError(gatewayError);
    }
  }

  // =============================================================================
  // PRIVATE IMPLEMENTATION METHODS
  // =============================================================================

  /**
   * Build complete OpenAPI specification
   * 
   * @param gatewayConfig - Gateway configuration
   * @returns OpenAPI specification
   */
  private async buildOpenAPISpec(gatewayConfig: GatewayConfig): Promise<OpenAPISpec> {
    const spec: OpenAPISpec = {
      openapi: '3.0.0',
      info: {
        title: this.config.title,
        description: this.config.description,
        version: this.config.version,
        contact: this.config.contact
      },
      servers: this.config.servers,
      paths: {},
      components: {
        schemas: this.generateSchemas(),
        securitySchemes: this.generateSecuritySchemes(),
        parameters: this.generateCommonParameters(),
        responses: this.generateCommonResponses()
      },
      tags: this.generateTags()
    };
    
    // Generate paths from routing table
    for (const route of gatewayConfig.routing.routes) {
      const pathItem = this.generatePathItem(route);
      const pathKey = this.normalizePathKey(route.path);
      
      if (!spec.paths[pathKey]) {
        spec.paths[pathKey] = {};
      }
      
      // Add operations for each supported method
      for (const method of route.methods) {
        const operation = this.generateOperation(route, method);
        const methodKey = method.toLowerCase() as keyof PathItem;
        (spec.paths[pathKey] as any)[methodKey] = operation;
        
        // Store endpoint documentation
        const routeKey = `${method}:${route.path}`;
        this.routeDocumentation.set(routeKey, this.createEndpointDoc(route, method, operation));
      }
    }
    
    return spec;
  }

  /**
   * Generate schema definitions for ReadyAI types
   * 
   * @returns Schema definitions
   */
  private generateSchemas(): Record<string, SchemaObject> {
    const schemas: Record<string, SchemaObject> = {};
    
    // Core response schemas
    schemas.ApiResponse = {
      type: 'object',
      required: ['success', 'data'],
      properties: {
        success: {
          type: 'boolean',
          enum: [true]
        },
        data: {
          type: 'object'
        },
        metadata: {
          type: 'object',
          properties: {
            timestamp: { type: 'string', format: 'date-time' },
            requestId: { type: 'string' }
          }
        }
      }
    };
    
    schemas.ApiErrorResponse = {
      type: 'object',
      required: ['success', 'error'],
      properties: {
        success: {
          type: 'boolean',
          enum: [false]
        },
        error: {
          type: 'object',
          required: ['message'],
          properties: {
            message: { type: 'string' },
            code: { type: 'string' },
            details: { type: 'object' }
          }
        }
      }
    };
    
    // ReadyAI-specific schemas
    schemas.UUID = {
      type: 'string',
      format: 'uuid',
      description: 'Universally unique identifier'
    };
    
    schemas.PhaseType = {
      type: 'string',
      enum: [
        'Phase0_StrategicCharter',
        'Phase1_ArchitecturalBlueprint',
        'Phase2_0_CoreContracts',
        'Phase2_1_ModuleSpec',
        'Phase2_3_ModuleSpecSubsequent',
        'Phase3_0_ProjectScaffolding',
        'Phase3_0_1_MasterPlan',
        'Phase3_1_FileGeneration',
        'Phase4_ValidationCorrection',
        'Phase5_TestGeneration',
        'Phase6_Documentation',
        'Phase7_Iteration'
      ]
    };
    
    schemas.AIProviderType = {
      type: 'string',
      enum: ['claude-sonnet-4']
    };
    
    // Project-related schemas
    schemas.Project = {
      type: 'object',
      required: ['id', 'name', 'currentPhase', 'rootPath', 'techStack', 'createdAt', 'lastModified', 'config'],
      properties: {
        id: { $ref: '#/components/schemas/UUID' },
        name: { type: 'string', minLength: 1, maxLength: 200 },
        description: { type: 'string', maxLength: 1000 },
        currentPhase: { $ref: '#/components/schemas/PhaseType' },
        rootPath: { type: 'string' },
        techStack: {
          type: 'object',
          properties: {
            frontend: { type: 'string' },
            backend: { type: 'string' },
            database: { type: 'string' },
            languages: { type: 'array', items: { type: 'string' } },
            tools: { type: 'array', items: { type: 'string' } }
          }
        },
        createdAt: { type: 'string', format: 'date-time' },
        lastModified: { type: 'string', format: 'date-time' },
        config: { type: 'object' }
      }
    };
    
    // Request/Response schemas for different operations
    this.addRequestResponseSchemas(schemas);
    
    return schemas;
  }

  /**
   * Add request/response schemas for ReadyAI operations
   * 
   * @param schemas - Schema collection to add to
   */
  private addRequestResponseSchemas(schemas: Record<string, SchemaObject>): void {
    // Project operation schemas
    schemas.ProjectRequest = {
      type: 'object',
      properties: {
        projectId: { $ref: '#/components/schemas/UUID' },
        operation: {
          type: 'string',
          enum: ['create', 'read', 'update', 'delete', 'list']
        },
        data: { type: 'object' },
        filters: { type: 'object' }
      }
    };
    
    schemas.ProjectResponse = {
      type: 'object',
      required: ['operation', 'metadata'],
      properties: {
        operation: { type: 'string' },
        project: { $ref: '#/components/schemas/Project' },
        projects: {
          type: 'array',
          items: { $ref: '#/components/schemas/Project' }
        },
        metadata: {
          type: 'object',
          properties: {
            totalCount: { type: 'number' },
            filteredCount: { type: 'number' },
            operationTime: { type: 'number' }
          }
        }
      }
    };
    
    // Generation operation schemas
    schemas.GenerationRequest = {
      type: 'object',
      required: ['projectId', 'targetFile', 'phase'],
      properties: {
        projectId: { $ref: '#/components/schemas/UUID' },
        targetFile: { type: 'string' },
        phase: { $ref: '#/components/schemas/PhaseType' },
        aiProvider: { $ref: '#/components/schemas/AIProviderType' },
        extendedThinking: { type: 'boolean' },
        contextPreferences: { type: 'object' },
        options: { type: 'object' }
      }
    };
    
    schemas.GenerationResponse = {
      type: 'object',
      required: ['generationId', 'status', 'metadata'],
      properties: {
        generationId: { $ref: '#/components/schemas/UUID' },
        status: {
          type: 'string',
          enum: ['pending', 'in_progress', 'completed', 'failed']
        },
        content: { type: 'string' },
        metadata: {
          type: 'object',
          properties: {
            tokensUsed: { type: 'number' },
            confidence: { type: 'number' },
            generationTime: { type: 'number' },
            modelUsed: { type: 'string' },
            issues: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    };
  }

  /**
   * Generate security scheme definitions
   * 
   * @returns Security scheme definitions
   */
  private generateSecuritySchemes(): Record<string, SecurityScheme> {
    const schemes: Record<string, SecurityScheme> = {};
    
    if (this.config.security.includeSchemes) {
      schemes.localAuth = {
        type: 'apiKey',
        name: 'X-Local-Auth',
        in: 'header',
        description: 'Local authentication token for VS Code extension'
      };
    }
    
    return schemes;
  }

  /**
   * Generate common parameter definitions
   * 
   * @returns Common parameter definitions
   */
  private generateCommonParameters(): Record<string, ParameterObject> {
    return {
      projectId: {
        name: 'projectId',
        in: 'path',
        description: 'Unique project identifier',
        required: true,
        schema: { $ref: '#/components/schemas/UUID' }
      },
      page: {
        name: 'page',
        in: 'query',
        description: 'Page number for pagination (1-based)',
        required: false,
        schema: {
          type: 'integer',
          minimum: 1,
          example: 1
        }
      },
      limit: {
        name: 'limit',
        in: 'query',
        description: 'Maximum number of items per page',
        required: false,
        schema: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          example: 20
        }
      }
    };
  }

  /**
   * Generate common response definitions
   * 
   * @returns Common response definitions
   */
  private generateCommonResponses(): Record<string, ResponseObject> {
    return {
      Success: {
        description: 'Successful operation',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ApiResponse' }
          }
        }
      },
      BadRequest: {
        description: 'Invalid request parameters',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ApiErrorResponse' }
          }
        }
      },
      Unauthorized: {
        description: 'Authentication required',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ApiErrorResponse' }
          }
        }
      },
      NotFound: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ApiErrorResponse' }
          }
        }
      },
      InternalError: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ApiErrorResponse' }
          }
        }
      }
    };
  }

  /**
   * Generate API tags for organization
   * 
   * @returns Tag definitions
   */
  private generateTags(): TagObject[] {
    return [
      {
        name: 'Projects',
        description: 'Project management and lifecycle operations'
      },
      {
        name: 'Phases',
        description: 'Development phase management and progression'
      },
      {
        name: 'Generation',
        description: 'AI-powered code generation services'
      },
      {
        name: 'Context',
        description: 'Context management and semantic search'
      },
      {
        name: 'Dependencies',
        description: 'Dependency tracking and analysis'
      },
      {
        name: 'Quality',
        description: 'Quality assurance and validation'
      },
      {
        name: 'Configuration',
        description: 'System configuration and preferences'
      }
    ];
  }

  /**
   * Generate path item from service route
   * 
   * @param route - Service route definition
   * @returns Path item object
   */
  private generatePathItem(route: ServiceRoute): PathItem {
    return {
      summary: route.metadata.description,
      description: route.metadata.description,
      parameters: this.extractPathParameters(route.path)
    };
  }

  /**
   * Generate operation object from route and method
   * 
   * @param route - Service route definition
   * @param method - HTTP method
   * @returns Operation object
   */
  private generateOperation(route: ServiceRoute, method: string): OperationObject {
    const operation: OperationObject = {
      tags: route.metadata.tags,
      summary: `${method.toUpperCase()} ${route.path}`,
      description: route.metadata.description,
      operationId: `${method.toLowerCase()}${this.pathToOperationId(route.path)}`,
      parameters: this.generateParameters(route, method),
      responses: this.generateResponses(route, method)
    };
    
    // Add request body for methods that typically have one
    if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      operation.requestBody = this.generateRequestBody(route, method);
    }
    
    // Add security requirements if authentication is required
    if (route.config.authRequired) {
      operation.security = [{ localAuth: [] }];
    }
    
    // Mark as deprecated if specified
    if (route.metadata.deprecated?.deprecated) {
      operation.deprecated = true;
    }
    
    return operation;
  }

  /**
   * Generate parameters for operation
   * 
   * @param route - Service route definition
   * @param method - HTTP method
   * @returns Parameter definitions
   */
  private generateParameters(route: ServiceRoute, method: string): ParameterObject[] {
    const parameters: ParameterObject[] = [];
    
    // Add path parameters
    parameters.push(...this.extractPathParameters(route.path));
    
    // Add common query parameters for GET requests
    if (method.toUpperCase() === 'GET' && route.path.includes('list')) {
      parameters.push(
        {
          name: 'page',
          in: 'query',
          description: 'Page number for pagination',
          required: false,
          schema: { type: 'integer', minimum: 1, example: 1 }
        },
        {
          name: 'limit',
          in: 'query',
          description: 'Items per page',
          required: false,
          schema: { type: 'integer', minimum: 1, maximum: 100, example: 20 }
        }
      );
    }
    
    return parameters;
  }

  /**
   * Generate request body definition
   * 
   * @param route - Service route definition
   * @param method - HTTP method
   * @returns Request body object
   */
  private generateRequestBody(route: ServiceRoute, method: string): RequestBodyObject | undefined {
    // Determine schema based on route pattern
    let schemaRef = '';
    
    if (route.path.includes('/projects')) {
      schemaRef = '#/components/schemas/ProjectRequest';
    } else if (route.path.includes('/generate')) {
      schemaRef = '#/components/schemas/GenerationRequest';
    } else {
      // Generic request body
      return {
        description: 'Request payload',
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object' }
          }
        }
      };
    }
    
    return {
      description: 'Request payload',
      required: true,
      content: {
        'application/json': {
          schema: { $ref: schemaRef }
        }
      }
    };
  }

  /**
   * Generate response definitions for operation
   * 
   * @param route - Service route definition
   * @param method - HTTP method
   * @returns Response definitions
   */
  private generateResponses(route: ServiceRoute, method: string): Record<string, ResponseObject> {
    const responses: Record<string, ResponseObject> = {
      '200': { $ref: '#/components/responses/Success' },
      '400': { $ref: '#/components/responses/BadRequest' },
      '500': { $ref: '#/components/responses/InternalError' }
    };
    
    // Add method-specific responses
    if (method.toUpperCase() === 'POST') {
      responses['201'] = {
        description: 'Resource created successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ApiResponse' }
          }
        }
      };
    }
    
    // Add authentication responses if required
    if (route.config.authRequired) {
      responses['401'] = { $ref: '#/components/responses/Unauthorized' };
    }
    
    // Add not found for specific resource endpoints
    if (route.path.includes('/{')) {
      responses['404'] = { $ref: '#/components/responses/NotFound' };
    }
    
    return responses;
  }

  /**
   * Extract path parameters from route path
   * 
   * @param path - Route path
   * @returns Path parameter definitions
   */
  private extractPathParameters(path: string): ParameterObject[] {
    const parameters: ParameterObject[] = [];
    const paramMatches = path.match(/\{([^}]+)\}/g);
    
    if (paramMatches) {
      for (const match of paramMatches) {
        const paramName = match.slice(1, -1); // Remove { }
        parameters.push({
          name: paramName,
          in: 'path',
          description: `${paramName} identifier`,
          required: true,
          schema: paramName.endsWith('Id') 
            ? { $ref: '#/components/schemas/UUID' }
            : { type: 'string' }
        });
      }
    }
    
    return parameters;
  }

  /**
   * Convert path to operation ID
   * 
   * @param path - Route path
   * @returns Operation ID
   */
  private pathToOperationId(path: string): string {
    return path
      .split('/')
      .filter(segment => segment && !segment.startsWith('{'))
      .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join('');
  }

  /**
   * Normalize path key for OpenAPI paths object
   * 
   * @param path - Route path
   * @returns Normalized path key
   */
  private normalizePathKey(path: string): string {
    // Convert Express-style :param to OpenAPI {param}
    return path.replace(/:([^/]+)/g, '{$1}');
  }

  /**
   * Create endpoint documentation object
   * 
   * @param route - Service route
   * @param method - HTTP method
   * @param operation - Operation object
   * @returns Endpoint documentation
   */
  private createEndpointDoc(
    route: ServiceRoute,
    method: string,
    operation: OperationObject
  ): EndpointDocumentation {
    return {
      path: route.path,
      method: method.toUpperCase(),
      summary: operation.summary || '',
      description: operation.description,
      tags: operation.tags || [],
      parameters: (operation.parameters || []).map(param => ({
        name: param.name,
        in: param.in,
        description: param.description,
        required: param.required || false,
        type: param.schema?.type || 'string',
        format: param.schema?.format,
        enum: param.schema?.enum,
        example: param.example
      })),
      requestBody: operation.requestBody ? {
        description: operation.requestBody.description,
        content: operation.requestBody.content,
        required: operation.requestBody.required || false
      } : undefined,
      responses: Object.entries(operation.responses).reduce((acc, [code, response]) => {
        if ('$ref' in response) {
          acc[code] = { description: `Reference: ${response.$ref}` };
        } else {
          acc[code] = {
            description: response.description,
            headers: response.headers ? Object.entries(response.headers).reduce((headerAcc, [name, header]) => {
              headerAcc[name] = {
                description: header.description,
                type: header.schema?.type || 'string',
                example: header.schema?.example
              };
              return headerAcc;
            }, {} as Record<string, HeaderDoc>) : undefined,
            content: response.content
          };
        }
        return acc;
      }, {} as Record<string, ResponseDoc>),
      security: operation.security,
      deprecated: operation.deprecated,
      examples: this.config.examples.autoGenerate ? this.generateExamples(route, method) : undefined
    };
  }

  /**
   * Generate examples for endpoint
   * 
   * @param route - Service route
   * @param method - HTTP method
   * @returns Example data
   */
  private generateExamples(route: ServiceRoute, method: string): Record<string, any> {
    const examples: Record<string, any> = {};
    
    // Generate request example
    if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      if (route.path.includes('/projects')) {
        examples.request = {
          name: 'My AI Project',
          description: 'A revolutionary AI-powered application',
          techStack: {
            frontend: 'React',
            backend: 'Node.js',
            database: 'PostgreSQL',
            languages: ['TypeScript', 'Python'],
            tools: ['Docker', 'Jest']
          }
        };
      } else if (route.path.includes('/generate')) {
        examples.request = {
          targetFile: 'src/services/UserService.ts',
          phase: 'Phase3_1_FileGeneration',
          aiProvider: 'claude-sonnet-4',
          extendedThinking: true
        };
      }
    }
    
    // Generate response example
    examples.response = {
      success: true,
      data: {},
      metadata: {
        timestamp: createTimestamp(),
        requestId: 'req_123456789'
      }
    };
    
    return examples;
  }

  /**
   * Build Swagger UI HTML
   * 
   * @param specUrl - OpenAPI specification URL
   * @returns HTML content
   */
  private buildSwaggerHTML(specUrl: string): string {
    const theme = this.config.ui.theme;
    const customCss = this.config.ui.customCss || '';
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ReadyAI API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css" />
  <style>
    html {
      box-sizing: border-box;
      overflow: -moz-scrollbars-vertical;
      overflow-y: scroll;
    }
    *, *:before, *:after {
      box-sizing: inherit;
    }
    body {
      margin: 0;
      background: ${theme === 'dark' ? '#1a1a1a' : '#fafafa'};
    }
    ${customCss}
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: '${specUrl}',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout",
        theme: "${theme}",
        tryItOutEnabled: true,
        requestInterceptor: function(request) {
          request.headers['X-Client-Type'] = 'swagger-ui';
          return request;
        }
      });
    };
  </script>
</body>
</html>`;
  }

  /**
   * Build ReDoc UI HTML
   * 
   * @param specUrl - OpenAPI specification URL
   * @returns HTML content
   */
  private buildReDocHTML(specUrl: string): string {
    const theme = this.config.ui.theme;
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ReadyAI API Documentation</title>
  <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700" rel="stylesheet">
  <style>
    body {
      margin: 0;
      padding: 0;
    }
  </style>
</head>
<body>
  <div id="redoc-container"></div>
  <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
  <script>
    Redoc.init('${specUrl}', {
      theme: {
        colors: {
          primary: {
            main: '${theme === 'dark' ? '#bb86fc' : '#1976d2'}'
          }
        },
        typography: {
          fontSize: '14px',
          lineHeight: '1.5em',
          code: {
            fontSize: '13px'
          },
          headings: {
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: '400'
          }
        },
        sidebar: {
          backgroundColor: '${theme === 'dark' ? '#263238' : '#fafafa'}'
        }
      },
      scrollYOffset: 60,
      hideDownloadButton: false,
      disableSearch: false
    }, document.getElementById('redoc-container'));
  </script>
</body>
</html>`;
  }

  /**
   * Generate cache key for specification
   * 
   * @param gatewayConfig - Gateway configuration
   * @returns Cache key
   */
  private generateCacheKey(gatewayConfig: GatewayConfig): string {
    const configHash = JSON.stringify({
      version: gatewayConfig.gateway.version,
      routeCount: gatewayConfig.routing.routes.length,
      configVersion: this.config.version
    });
    
    return Buffer.from(configHash).toString('base64');
  }

  /**
   * Check if cached specification is still valid
   * 
   * @param timestamp - Cache timestamp
   * @returns True if cache is valid
   */
  private isCacheValid(timestamp: number): boolean {
    const now = Date.now();
    const maxAge = this.config.cache.ttl * 1000; // Convert to milliseconds
    return (now - timestamp) < maxAge;
  }
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

/**
 * Default API documentation configuration
 */
export const DEFAULT_API_DOCUMENTATION_CONFIG: ApiDocumentationConfig = {
  enabled: true,
  title: 'ReadyAI Personal AI Development Orchestrator API',
  description: 'Complete API specification for ReadyAI - Personal AI Development Orchestrator supporting 7-phase development methodology, advanced context management, and AI-powered code generation.',
  version: '1.0.0',
  contact: {
    name: 'ReadyAI Development Team',
    url: 'https://github.com/readyai/readyai'
  },
  servers: [
    {
      url: 'http://localhost:8000/api/v1',
      description: 'Local development server'
    }
  ],
  ui: {
    swagger: true,
    redoc: true,
    theme: 'auto'
  },
  cache: {
    enabled: true,
    ttl: 3600, // 1 hour
    keyPrefix: 'readyai:api-docs:'
  },
  security: {
    includeSchemes: true,
    description: 'ReadyAI uses local-only authentication suitable for personal development use'
  },
  examples: {
    autoGenerate: true,
    realistic: true,
    seed: 42
  }
};

/**
 * Create API documentation service instance
 * 
 * @param config - Optional configuration override
 * @param logger - Logger instance
 * @param errorService - Error service instance
 * @returns API documentation service
 */
export function createApiDocumentationService(
  config: Partial<ApiDocumentationConfig> = {},
  logger: Logger,
  errorService: ErrorService
): ApiDocumentationService {
  const finalConfig = { ...DEFAULT_API_DOCUMENTATION_CONFIG, ...config };
  return new ApiDocumentationService(finalConfig, logger, errorService);
}

export default ApiDocumentationService;
