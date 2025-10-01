// packages/config/types/config.ts
/**
 * Enhanced Configuration types for ReadyAI Personal AI Development Orchestrator
 * 
 * This module expands upon Cline's battle-tested multi-provider configuration system
 * with ReadyAI-specific Phase 1.3 extensions for advanced context management,
 * enterprise-grade security, and comprehensive workflow orchestration.
 * 
 * Achieves 80%+ reuse of Cline's proven ApiConfiguration patterns while adding
 * ReadyAI's Phase 1.3 features: enhanced auth, advanced gateway configuration,
 * and sophisticated error handling capabilities.
 */

import {
  UUID,
  PhaseType,
  AIProviderType,
  ApiResponse,
  ApiErrorResponse,
  ReadyAIError,
  ValidationError,
  ValidationResult,
  QualityMetrics
} from '../../foundation/types/core'

// =============================================================================
// PHASE 1.3 ENHANCED CONFIGURATION EXTENSIONS
// =============================================================================

/**
 * Phase 1.3 Enhanced Authentication Configuration
 * Extends Cline's authentication patterns with enterprise-grade security
 */
export interface EnhancedAuthConfig {
  /** OAuth 2.0 configuration for enterprise SSO */
  oauth: {
    clientId?: string
    clientSecret?: string
    redirectUri: string
    scopes: string[]
    tokenEndpoint?: string
    authorizationEndpoint?: string
    introspectionEndpoint?: string
    refreshTokenRotation: boolean
    tokenLifetime: number // in seconds
    refreshTokenLifetime: number // in seconds
  }
  
  /** Multi-factor authentication settings */
  mfa: {
    enabled: boolean
    methods: Array<'totp' | 'sms' | 'email' | 'hardware'>
    gracePeriod: number // seconds before MFA challenge
    backupCodes: {
      enabled: boolean
      count: number
      lengthBytes: number
    }
  }
  
  /** Session management configuration */
  session: {
    strategy: 'jwt' | 'session' | 'hybrid'
    cookieSettings: {
      httpOnly: boolean
      secure: boolean
      sameSite: 'strict' | 'lax' | 'none'
      domain?: string
      path: string
      maxAge: number // seconds
    }
    sessionStorage: {
      type: 'memory' | 'redis' | 'database'
      connectionString?: string
      keyPrefix: string
      ttl: number // seconds
    }
    concurrentSessions: {
      enabled: boolean
      maxSessions: number
      strategy: 'reject' | 'revoke_oldest' | 'revoke_all'
    }
  }

  /** Enhanced password policies */
  passwordPolicy: {
    minLength: number
    maxLength: number
    requireUppercase: boolean
    requireLowercase: boolean
    requireNumbers: boolean
    requireSpecialChars: boolean
    forbidCommon: boolean
    historyCount: number // prevent reuse of last N passwords
    maxAge: number // days before password expires
    lockoutThreshold: number // failed attempts before lockout
    lockoutDuration: number // seconds
  }

  /** Biometric authentication support */
  biometric: {
    enabled: boolean
    methods: Array<'fingerprint' | 'face' | 'voice' | 'iris'>
    fallbackToPassword: boolean
    enrollmentRequired: boolean
  }
}

/**
 * Phase 1.3 Advanced Gateway Configuration
 * Adapts Cline's API gateway patterns with enterprise routing and load balancing
 */
export interface AdvancedGatewayConfig {
  /** Load balancing configuration */
  loadBalancing: {
    strategy: 'round_robin' | 'least_connections' | 'weighted' | 'ip_hash' | 'geolocation'
    healthCheck: {
      enabled: boolean
      interval: number // milliseconds
      timeout: number // milliseconds
      retries: number
      path: string
      expectedStatus: number[]
    }
    weights: Record<string, number> // endpoint -> weight mapping
    failover: {
      enabled: boolean
      maxFailures: number
      recoveryTime: number // milliseconds
    }
  }

  /** Rate limiting with advanced policies */
  rateLimiting: {
    global: {
      enabled: boolean
      requests: number
      window: number // seconds
      burst: number
    }
    perUser: {
      enabled: boolean
      requests: number
      window: number // seconds
      burst: number
    }
    perEndpoint: Record<string, {
      requests: number
      window: number
      burst: number
    }>
    quotas: {
      daily: number
      monthly: number
      resetTime: string // HH:MM format
    }
  }

  /** Circuit breaker configuration */
  circuitBreaker: {
    enabled: boolean
    failureThreshold: number // failures before opening
    recoveryTimeout: number // milliseconds before half-open
    monitoringWindow: number // milliseconds
    minimumRequests: number // min requests before circuit can open
  }

  /** Request/Response transformation */
  transformation: {
    requestInterceptors: Array<{
      name: string
      enabled: boolean
      order: number
      config: Record<string, any>
    }>
    responseInterceptors: Array<{
      name: string
      enabled: boolean
      order: number
      config: Record<string, any>
    }>
    headerManagement: {
      addHeaders: Record<string, string>
      removeHeaders: string[]
      overrideHeaders: Record<string, string>
    }
  }

  /** Caching strategies */
  caching: {
    enabled: boolean
    strategy: 'memory' | 'redis' | 'disk' | 'hybrid'
    ttl: {
      default: number // seconds
      byEndpoint: Record<string, number>
      byContentType: Record<string, number>
    }
    invalidation: {
      strategy: 'ttl' | 'manual' | 'event_driven'
      webhooks: string[]
    }
    compression: {
      enabled: boolean
      algorithm: 'gzip' | 'brotli' | 'deflate'
      level: number // 1-9
    }
  }

  /** Advanced routing configuration */
  routing: {
    strategies: Array<{
      name: string
      pattern: string
      method: string[]
      destination: string
      priority: number
      conditions: Array<{
        type: 'header' | 'query' | 'body' | 'ip' | 'time' | 'user_agent'
        field?: string
        operator: 'equals' | 'contains' | 'matches' | 'in' | 'gt' | 'lt'
        value: string | number | string[]
      }>
    }>
    fallback: {
      enabled: boolean
      destination: string
      timeout: number
    }
  }
}

/**
 * Phase 1.3 Comprehensive Error Handling Configuration
 * Extends Cline's error patterns with enterprise monitoring and recovery
 */
export interface ComprehensiveErrorConfig {
  /** Error classification and handling */
  classification: {
    categories: Record<string, {
      priority: 'critical' | 'high' | 'medium' | 'low'
      retryable: boolean
      escalation: boolean
      notification: boolean
    }>
    customRules: Array<{
      pattern: string
      category: string
      action: 'log' | 'retry' | 'escalate' | 'ignore'
      threshold?: number
    }>
  }

  /** Advanced retry configuration */
  retryPolicies: {
    default: {
      maxAttempts: number
      backoffStrategy: 'exponential' | 'linear' | 'fixed' | 'custom'
      initialDelay: number // milliseconds
      maxDelay: number // milliseconds
      multiplier: number
      jitter: boolean
    }
    byErrorType: Record<string, {
      maxAttempts: number
      backoffStrategy: 'exponential' | 'linear' | 'fixed' | 'custom'
      initialDelay: number
      maxDelay: number
      multiplier: number
      jitter: boolean
    }>
    circuitBreaker: {
      enabled: boolean
      failureThreshold: number
      recoveryTimeout: number
    }
  }

  /** Error monitoring and alerting */
  monitoring: {
    enabled: boolean
    metrics: {
      errorRate: boolean
      responseTime: boolean
      availability: boolean
      customMetrics: Record<string, string>
    }
    alerting: {
      channels: Array<{
        type: 'email' | 'slack' | 'webhook' | 'sms'
        config: Record<string, any>
        conditions: Array<{
          metric: string
          threshold: number
          duration: number // seconds
          operator: 'gt' | 'lt' | 'eq' | 'ne'
        }>
      }>
    }
    logging: {
      level: 'debug' | 'info' | 'warn' | 'error' | 'critical'
      structured: boolean
      includeStackTrace: boolean
      sanitizeFields: string[]
      retention: {
        days: number
        archival: boolean
        compression: boolean
      }
    }
  }

  /** Error recovery strategies */
  recovery: {
    autoRecovery: {
      enabled: boolean
      strategies: Array<{
        name: string
        conditions: string[]
        actions: Array<'restart_service' | 'clear_cache' | 'reset_connections' | 'switch_provider'>
        cooldown: number // seconds between recovery attempts
      }>
    }
    fallbackModes: {
      degradedService: {
        enabled: boolean
        features: string[] // features to disable in degraded mode
        timeout: number // seconds before attempting normal operation
      }
      readOnlyMode: {
        enabled: boolean
        allowedEndpoints: string[]
        userMessage: string
      }
    }
  }
}

// =============================================================================
// ENHANCED AI PROVIDER CONFIGURATION (Phase 1.3 Extensions)
// =============================================================================

/**
 * Phase 1.3 Enhanced AI Provider Configuration
 * Builds on Cline's ApiConfiguration with advanced enterprise features
 */
export interface EnhancedApiConfiguration extends ApiConfiguration {
  // =============================================================================
  // PHASE 1.3 AUTHENTICATION ENHANCEMENTS
  // =============================================================================
  
  /** Enhanced authentication configuration */
  enhancedAuth: EnhancedAuthConfig

  /** Advanced gateway configuration */
  advancedGateway: AdvancedGatewayConfig

  /** Comprehensive error handling */
  comprehensiveErrorHandling: ComprehensiveErrorConfig

  // =============================================================================
  // PHASE 1.3 ADVANCED AI PROVIDER FEATURES
  // =============================================================================
  
  /** Multi-region deployment configuration */
  multiRegion: {
    enabled: boolean
    regions: Array<{
      name: string
      endpoint: string
      priority: number
      latencyThreshold: number // milliseconds
      healthCheck: {
        enabled: boolean
        endpoint: string
        interval: number
        timeout: number
      }
    }>
    failover: {
      strategy: 'priority' | 'latency' | 'round_robin'
      healthCheckRequired: boolean
    }
  }

  /** Advanced model configuration */
  enhancedModelConfig: {
    /** Model performance optimization */
    performance: {
      /** Connection pooling */
      connectionPool: {
        minConnections: number
        maxConnections: number
        idleTimeout: number // milliseconds
        connectionTimeout: number // milliseconds
      }
      /** Request batching */
      batching: {
        enabled: boolean
        maxBatchSize: number
        maxWaitTime: number // milliseconds
      }
      /** Response streaming optimization */
      streaming: {
        chunkSize: number
        bufferSize: number
        compression: boolean
      }
    }

    /** Model-specific fine-tuning parameters */
    fineTuning: Record<string, {
      parameters: Record<string, any>
      customPrompts: {
        systemPrompt?: string
        userPromptTemplate?: string
        assistantPromptTemplate?: string
      }
      processingRules: Array<{
        type: 'pre_process' | 'post_process'
        rule: string
        enabled: boolean
      }>
    }>

    /** Cost optimization settings */
    costOptimization: {
      budgetLimits: {
        daily: number
        monthly: number
        perRequest: number
      }
      costTracking: {
        enabled: boolean
        alertThresholds: number[] // percentages of budget
        detailedLogging: boolean
      }
      modelSelection: {
        costAware: boolean
        fallbackModel: string
        qualityThreshold: number
      }
    }
  }

  // =============================================================================
  // PHASE 1.3 ENTERPRISE FEATURES
  // =============================================================================
  
  /** Enterprise audit configuration */
  enterpriseAudit: {
    enabled: boolean
    logLevel: 'minimal' | 'standard' | 'comprehensive'
    retention: {
      days: number
      archival: boolean
      encryption: boolean
    }
    compliance: {
      frameworks: Array<'soc2' | 'hipaa' | 'gdpr' | 'pci' | 'iso27001'>
      dataClassification: Record<string, 'public' | 'internal' | 'confidential' | 'restricted'>
      retentionPolicies: Record<string, number> // data type -> retention days
    }
  }

  /** Advanced security configuration */
  advancedSecurity: {
    encryption: {
      atRest: {
        enabled: boolean
        algorithm: 'aes-256' | 'chacha20' | 'xchacha20'
        keyRotation: {
          enabled: boolean
          intervalDays: number
        }
      }
      inTransit: {
        tlsVersion: '1.2' | '1.3'
        cipherSuites: string[]
        certificateValidation: boolean
      }
      fieldLevel: {
        enabled: boolean
        encryptedFields: string[]
        keyManagement: 'aws-kms' | 'azure-kv' | 'hashicorp-vault' | 'local'
      }
    }
    accessControl: {
      rbac: {
        enabled: boolean
        roles: Record<string, {
          permissions: string[]
          inheritance: string[]
          conditions: Array<{
            field: string
            operator: string
            value: any
          }>
        }>
      }
      attributeBased: {
        enabled: boolean
        policies: Array<{
          name: string
          effect: 'allow' | 'deny'
          conditions: string // ABAC policy expression
          resources: string[]
          actions: string[]
        }>
      }
    }
    threatDetection: {
      enabled: boolean
      anomalyDetection: boolean
      rateLimitMonitoring: boolean
      suspiciousPatterns: string[]
      responseActions: Array<'log' | 'alert' | 'block' | 'challenge'>
    }
  }

  /** Performance monitoring configuration */
  performanceMonitoring: {
    metrics: {
      responseTime: boolean
      throughput: boolean
      errorRate: boolean
      resourceUtilization: boolean
      customMetrics: Record<string, {
        type: 'counter' | 'gauge' | 'histogram'
        description: string
        labels: string[]
      }>
    }
    alerting: {
      enabled: boolean
      thresholds: Record<string, {
        warning: number
        critical: number
        duration: number // seconds
      }>
      notifications: Array<{
        channel: string
        events: string[]
        template: string
      }>
    }
    profiling: {
      enabled: boolean
      samplingRate: number // 0.0 to 1.0
      includeStackTrace: boolean
    }
  }
}

// =============================================================================
// PHASE 1.3 CONFIGURATION VALIDATION AND MANAGEMENT
// =============================================================================

/**
 * Phase 1.3 Enhanced Configuration Validation
 * Extends Cline's validation patterns with comprehensive enterprise checks
 */
export interface EnhancedConfigurationValidationResult extends ValidationResult {
  /** Configuration section that was validated */
  section: keyof EnhancedApiConfiguration
  
  /** Security validation results */
  securityChecks: Array<{
    check: string
    passed: boolean
    severity: 'low' | 'medium' | 'high' | 'critical'
    recommendation?: string
  }>
  
  /** Performance validation results */
  performanceChecks: Array<{
    check: string
    passed: boolean
    impact: 'low' | 'medium' | 'high'
    optimizationSuggestion?: string
  }>
  
  /** Compliance validation results */
  complianceChecks: Array<{
    framework: string
    requirement: string
    compliant: boolean
    remediation?: string
  }>
}

/**
 * Phase 1.3 Configuration Templates
 * Enterprise-ready configuration templates for common deployment scenarios
 */
export interface EnhancedConfigurationTemplate extends ConfigurationTemplate {
  /** Phase 1.3 specific template features */
  phase13Features: {
    enhancedAuth: boolean
    advancedGateway: boolean
    comprehensiveErrorHandling: boolean
    enterpriseAudit: boolean
    advancedSecurity: boolean
    performanceMonitoring: boolean
  }
  
  /** Deployment environment optimizations */
  environmentOptimizations: {
    development: Partial<EnhancedApiConfiguration>
    staging: Partial<EnhancedApiConfiguration>
    production: Partial<EnhancedApiConfiguration>
  }
  
  /** Compliance presets */
  compliancePresets: Record<string, Partial<EnhancedApiConfiguration>>
}

// =============================================================================
// PHASE 1.3 CONFIGURATION BUILDER AND UTILITIES
// =============================================================================

/**
 * Phase 1.3 Enhanced Configuration Builder
 * Fluent interface for building complex enterprise configurations
 */
export class EnhancedConfigurationBuilder {
  private config: Partial<EnhancedApiConfiguration> = {}

  static create(): EnhancedConfigurationBuilder {
    return new EnhancedConfigurationBuilder()
  }

  /** Build enhanced authentication configuration */
  withEnhancedAuth(authConfig: Partial<EnhancedAuthConfig>): this {
    this.config.enhancedAuth = {
      ...this.config.enhancedAuth,
      ...authConfig
    } as EnhancedAuthConfig
    return this
  }

  /** Build advanced gateway configuration */
  withAdvancedGateway(gatewayConfig: Partial<AdvancedGatewayConfig>): this {
    this.config.advancedGateway = {
      ...this.config.advancedGateway,
      ...gatewayConfig
    } as AdvancedGatewayConfig
    return this
  }

  /** Build comprehensive error handling configuration */
  withComprehensiveErrorHandling(errorConfig: Partial<ComprehensiveErrorConfig>): this {
    this.config.comprehensiveErrorHandling = {
      ...this.config.comprehensiveErrorHandling,
      ...errorConfig
    } as ComprehensiveErrorConfig
    return this
  }

  /** Apply security hardening preset */
  withSecurityHardening(level: 'basic' | 'standard' | 'strict' = 'standard'): this {
    const securityPresets = {
      basic: {
        enhancedAuth: {
          mfa: { enabled: false, methods: [], gracePeriod: 300 },
          passwordPolicy: { minLength: 8, maxLength: 128, requireUppercase: true }
        },
        advancedSecurity: {
          encryption: { atRest: { enabled: true }, inTransit: { tlsVersion: '1.2' as const } }
        }
      },
      standard: {
        enhancedAuth: {
          mfa: { enabled: true, methods: ['totp' as const], gracePeriod: 300 },
          passwordPolicy: { minLength: 12, maxLength: 128, requireUppercase: true, requireNumbers: true }
        },
        advancedSecurity: {
          encryption: { atRest: { enabled: true }, inTransit: { tlsVersion: '1.3' as const } },
          threatDetection: { enabled: true, anomalyDetection: true }
        }
      },
      strict: {
        enhancedAuth: {
          mfa: { enabled: true, methods: ['totp' as const, 'hardware' as const], gracePeriod: 60 },
          passwordPolicy: { minLength: 16, maxLength: 128, requireUppercase: true, requireNumbers: true, requireSpecialChars: true }
        },
        advancedSecurity: {
          encryption: { atRest: { enabled: true }, inTransit: { tlsVersion: '1.3' as const } },
          threatDetection: { enabled: true, anomalyDetection: true, rateLimitMonitoring: true }
        }
      }
    }

    const preset = securityPresets[level]
    this.config.enhancedAuth = { ...this.config.enhancedAuth, ...preset.enhancedAuth } as EnhancedAuthConfig
    this.config.advancedSecurity = { ...this.config.advancedSecurity, ...preset.advancedSecurity } as any
    return this
  }

  /** Apply compliance framework configuration */
  withComplianceFramework(frameworks: Array<'soc2' | 'hipaa' | 'gdpr' | 'pci' | 'iso27001'>): this {
    this.config.enterpriseAudit = {
      ...this.config.enterpriseAudit,
      enabled: true,
      compliance: {
        ...this.config.enterpriseAudit?.compliance,
        frameworks
      }
    } as any
    return this
  }

  /** Build final configuration */
  build(): EnhancedApiConfiguration {
    return this.config as EnhancedApiConfiguration
  }
}

// =============================================================================
// PHASE 1.3 CONSTANTS AND DEFAULTS
// =============================================================================

/**
 * Phase 1.3 Default Enhanced Configuration
 */
export const DEFAULT_ENHANCED_CONFIGURATION: Partial<EnhancedApiConfiguration> = {
  enhancedAuth: {
    oauth: {
      redirectUri: 'http://localhost:3000/auth/callback',
      scopes: ['openid', 'profile', 'email'],
      refreshTokenRotation: true,
      tokenLifetime: 3600, // 1 hour
      refreshTokenLifetime: 86400 // 24 hours
    },
    mfa: {
      enabled: false,
      methods: [],
      gracePeriod: 300,
      backupCodes: {
        enabled: false,
        count: 10,
        lengthBytes: 8
      }
    },
    session: {
      strategy: 'hybrid',
      cookieSettings: {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/',
        maxAge: 3600
      },
      sessionStorage: {
        type: 'memory',
        keyPrefix: 'readyai:session:',
        ttl: 3600
      },
      concurrentSessions: {
        enabled: true,
        maxSessions: 5,
        strategy: 'revoke_oldest'
      }
    },
    passwordPolicy: {
      minLength: 8,
      maxLength: 128,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: false,
      forbidCommon: true,
      historyCount: 5,
      maxAge: 90,
      lockoutThreshold: 5,
      lockoutDuration: 900
    },
    biometric: {
      enabled: false,
      methods: [],
      fallbackToPassword: true,
      enrollmentRequired: false
    }
  },

  advancedGateway: {
    loadBalancing: {
      strategy: 'round_robin',
      healthCheck: {
        enabled: true,
        interval: 30000,
        timeout: 5000,
        retries: 3,
        path: '/health',
        expectedStatus: [200, 204]
      },
      weights: {},
      failover: {
        enabled: true,
        maxFailures: 3,
        recoveryTime: 30000
      }
    },
    rateLimiting: {
      global: {
        enabled: true,
        requests: 1000,
        window: 60,
        burst: 100
      },
      perUser: {
        enabled: true,
        requests: 100,
        window: 60,
        burst: 20
      },
      perEndpoint: {},
      quotas: {
        daily: 10000,
        monthly: 300000,
        resetTime: '00:00'
      }
    },
    circuitBreaker: {
      enabled: true,
      failureThreshold: 5,
      recoveryTimeout: 30000,
      monitoringWindow: 60000,
      minimumRequests: 10
    },
    transformation: {
      requestInterceptors: [],
      responseInterceptors: [],
      headerManagement: {
        addHeaders: {
          'X-ReadyAI-Version': '1.0.0',
          'X-Request-ID': '${requestId}'
        },
        removeHeaders: ['X-Powered-By'],
        overrideHeaders: {}
      }
    },
    caching: {
      enabled: true,
      strategy: 'memory',
      ttl: {
        default: 300,
        byEndpoint: {},
        byContentType: {
          'application/json': 300,
          'text/plain': 600
        }
      },
      invalidation: {
        strategy: 'ttl',
        webhooks: []
      },
      compression: {
        enabled: true,
        algorithm: 'gzip',
        level: 6
      }
    },
    routing: {
      strategies: [],
      fallback: {
        enabled: true,
        destination: '/api/v1/fallback',
        timeout: 30000
      }
    }
  },

  comprehensiveErrorHandling: {
    classification: {
      categories: {
        'authentication': { priority: 'high', retryable: false, escalation: true, notification: true },
        'rate_limit': { priority: 'medium', retryable: true, escalation: false, notification: false },
        'server_error': { priority: 'critical', retryable: true, escalation: true, notification: true }
      },
      customRules: []
    },
    retryPolicies: {
      default: {
        maxAttempts: 3,
        backoffStrategy: 'exponential',
        initialDelay: 1000,
        maxDelay: 30000,
        multiplier: 2,
        jitter: true
      },
      byErrorType: {},
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        recoveryTimeout: 30000
      }
    },
    monitoring: {
      enabled: true,
      metrics: {
        errorRate: true,
        responseTime: true,
        availability: true,
        customMetrics: {}
      },
      alerting: {
        channels: []
      },
      logging: {
        level: 'info',
        structured: true,
        includeStackTrace: false,
        sanitizeFields: ['password', 'apiKey', 'token'],
        retention: {
          days: 30,
          archival: false,
          compression: false
        }
      }
    },
    recovery: {
      autoRecovery: {
        enabled: false,
        strategies: [],
        cooldown: 300
      },
      fallbackModes: {
        degradedService: {
          enabled: false,
          features: [],
          timeout: 300
        },
        readOnlyMode: {
          enabled: false,
          allowedEndpoints: ['/health', '/status'],
          userMessage: 'System is currently in read-only mode due to maintenance.'
        }
      }
    }
  }
}

/**
 * Phase 1.3 Configuration Schema Version
 */
export const ENHANCED_CONFIG_SCHEMA_VERSION = '1.3.0'

/**
 * Supported enhanced configuration versions
 */
export const SUPPORTED_ENHANCED_CONFIG_VERSIONS = ['1.0.0', '1.1.0', '1.2.0', '1.3.0'] as const
export type EnhancedConfigVersion = typeof SUPPORTED_ENHANCED_CONFIG_VERSIONS[number]

// =============================================================================
// EXPORTS AND VERSION INFO
// =============================================================================

export * from './streaming'
export * from './security'

/**
 * Enhanced configuration types module version
 */
export const ENHANCED_CONFIG_TYPES_VERSION = '1.3.0'

/**
 * Phase 1.3 feature flags
 */
export const PHASE_13_FEATURES = {
  ENHANCED_AUTH: 'enhanced_auth',
  ADVANCED_GATEWAY: 'advanced_gateway',
  COMPREHENSIVE_ERROR_HANDLING: 'comprehensive_error_handling',
  ENTERPRISE_AUDIT: 'enterprise_audit',
  ADVANCED_SECURITY: 'advanced_security',
  PERFORMANCE_MONITORING: 'performance_monitoring'
} as const

export type Phase13Feature = typeof PHASE_13_FEATURES[keyof typeof PHASE_13_FEATURES]

/**
 * Configuration migration utilities for Phase 1.3
 */
export interface ConfigurationMigration {
  fromVersion: string
  toVersion: string
  migrationFunction: (oldConfig: any) => EnhancedApiConfiguration
  validationRules: Array<(config: any) => ValidationError[]>
  backupRequired: boolean
}

/**
 * Phase 1.3 configuration health check
 */
export interface ConfigurationHealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy'
  checks: Array<{
    name: string
    status: 'pass' | 'warn' | 'fail'
    message?: string
    metadata?: Record<string, any>
  }>
  lastChecked: string
  nextCheck: string
}
