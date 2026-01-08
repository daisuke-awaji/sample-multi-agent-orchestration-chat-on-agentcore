/**
 * Environment-specific configuration
 * Supports 3 environments: dev / stg / prd
 */

import * as cdk from 'aws-cdk-lib';

/**
 * Environment name
 */
export type Environment = 'default' | 'dev' | 'stg' | 'prd' | string; // Allow dynamic PR environments

/**
 * Environment-specific configuration interface
 */
export interface EnvironmentConfig {
  /**
   * Environment name
   */
  env: Environment;

  /**
   * AWS Account ID (optional)
   * Uses CDK_DEFAULT_ACCOUNT if not specified
   */
  awsAccount?: string;

  /**
   * AWS Region
   */
  awsRegion: string;

  /**
   * Resource name prefix
   * Used as common prefix for Gateway, Cognito, Backend API, etc.
   */
  resourcePrefix: string;

  /**
   * Runtime name (underscore format)
   * AgentCore Runtime must start with a letter and contain only letters, numbers, and underscores
   */
  runtimeName: string;

  /**
   * Stack deletion protection
   */
  deletionProtection: boolean;

  /**
   * CORS allowed origins
   */
  corsAllowedOrigins: string[];

  /**
   * Memory expiration (days)
   */
  memoryExpirationDays: number;

  /**
   * S3 removal policy
   */
  s3RemovalPolicy: cdk.RemovalPolicy;

  /**
   * S3 auto delete objects (only effective when RemovalPolicy is DESTROY)
   */
  s3AutoDeleteObjects: boolean;

  /**
   * Cognito deletion protection
   */
  cognitoDeletionProtection: boolean;

  /**
   * Lambda function log retention period (days)
   */
  logRetentionDays: number;

  /**
   * Frontend S3 bucket name prefix
   */
  frontendBucketPrefix?: string;

  /**
   * User Storage S3 bucket name prefix
   */
  userStorageBucketPrefix?: string;

  /**
   * Backend API name
   */
  backendApiName?: string;

  /**
   * Tavily API Key Secret Name (Secrets Manager)
   * Set for production/staging environments to retrieve API key from Secrets Manager
   */
  tavilyApiKeySecretName?: string;

  /**
   * GitHub Token Secret Name (Secrets Manager)
   * Set for environments to retrieve GitHub token from Secrets Manager
   * Used for gh CLI authentication
   */
  githubTokenSecretName?: string;

  /**
   * Allowed email domains for sign-up (optional)
   * If set, only emails from these domains can sign up
   * Example: ['amazon.com', 'amazon.jp']
   */
  allowedSignUpEmailDomains?: string[];

  /**
   * Custom domain configuration for frontend (optional)
   * If set, CloudFront distribution will use custom domain with ACM certificate
   */
  customDomain?: {
    /**
     * Hostname for the website (e.g., 'genai')
     * A record will be created by CDK
     */
    hostName: string;

    /**
     * Domain name of the public hosted zone (e.g., 'example.com')
     * The hosted zone must exist in the same AWS account
     */
    domainName: string;
  };

  /**
   * Test user configuration (optional, for development only)
   * If set, a test user will be created automatically during deployment
   */
  testUser?: {
    /**
     * Username for the test user
     */
    username: string;

    /**
     * Email address for the test user
     */
    email: string;

    /**
     * Password for the test user (must meet password policy requirements)
     */
    password: string;
  };
}

/**
 * Environment-specific configurations
 */
export const environments: Record<Environment, EnvironmentConfig> = {
  default: {
    env: 'default',
    awsRegion: 'ap-northeast-1',
    resourcePrefix: 'agentcore-app',
    runtimeName: 'agentcore_app',
    deletionProtection: false,
    corsAllowedOrigins: ['*'], // Development: Allow all origins
    memoryExpirationDays: 30,
    s3RemovalPolicy: cdk.RemovalPolicy.DESTROY,
    s3AutoDeleteObjects: true,
    cognitoDeletionProtection: false,
    logRetentionDays: 7,
    frontendBucketPrefix: 'agentcore-app',
    userStorageBucketPrefix: 'agentcore-app',
    backendApiName: 'agentcore-app-backend-api',
    tavilyApiKeySecretName: 'agentcore/default/tavily-api-key',
    githubTokenSecretName: 'agentcore/default/github-token',
    allowedSignUpEmailDomains: ['amazon.com', 'amazon.co.jp'],
  },

  dev: {
    env: 'dev',
    awsRegion: 'ap-northeast-1',
    resourcePrefix: 'agentcore-app-dev',
    runtimeName: 'agentcore_app_dev',
    deletionProtection: false,
    corsAllowedOrigins: ['*'], // Development: Allow all origins
    memoryExpirationDays: 30,
    s3RemovalPolicy: cdk.RemovalPolicy.DESTROY,
    s3AutoDeleteObjects: true,
    cognitoDeletionProtection: false,
    logRetentionDays: 7,
    frontendBucketPrefix: 'agentcore-app-dev',
    userStorageBucketPrefix: 'agentcore-app-dev',
    backendApiName: 'agentcore-app-dev-backend-api',
    tavilyApiKeySecretName: 'agentcore/dev/tavily-api-key',
    githubTokenSecretName: 'agentcore/dev/github-token',
    allowedSignUpEmailDomains: ['amazon.com', 'amazon.co.jp'],
    testUser: {
      username: 'testuser',
      email: 'testuser@amazon.com',
      password: 'TestPassword123!',
    },
  },

  stg: {
    env: 'stg',
    awsRegion: 'ap-northeast-1',
    resourcePrefix: 'agentcore-app-stg',
    runtimeName: 'agentcore_app_stg',
    deletionProtection: false,
    corsAllowedOrigins: ['https://stg.example.com'], // Staging environment URL
    memoryExpirationDays: 60,
    s3RemovalPolicy: cdk.RemovalPolicy.RETAIN,
    s3AutoDeleteObjects: false,
    cognitoDeletionProtection: false,
    logRetentionDays: 14,
    frontendBucketPrefix: 'agentcore-app-stg',
    userStorageBucketPrefix: 'agentcore-app-stg',
    backendApiName: 'agentcore-app-stg-backend-api',
    tavilyApiKeySecretName: 'agentcore/stg/tavily-api-key',
    githubTokenSecretName: 'agentcore/stg/github-token',
  },

  prd: {
    env: 'prd',
    awsRegion: 'ap-northeast-1',
    resourcePrefix: 'agentcore-app-prd',
    runtimeName: 'agentcore_app_prd',
    deletionProtection: true,
    corsAllowedOrigins: ['https://app.example.com'], // Production environment URL
    memoryExpirationDays: 365,
    s3RemovalPolicy: cdk.RemovalPolicy.RETAIN,
    s3AutoDeleteObjects: false,
    cognitoDeletionProtection: true,
    logRetentionDays: 30,
    frontendBucketPrefix: 'agentcore-app-prd',
    userStorageBucketPrefix: 'agentcore-app-prd',
    backendApiName: 'agentcore-app-prd-backend-api',
    tavilyApiKeySecretName: 'agentcore/prd/tavily-api-key',
    githubTokenSecretName: 'agentcore/prd/github-token',
  },
};

/**
 * Get environment configuration
 * @param env Environment name (dev, stg, prd, or pr-{number})
 * @returns Environment configuration
 */
export function getEnvironmentConfig(env: Environment): EnvironmentConfig {
  // Check if it's a PR environment (e.g., pr-123)
  if (env.startsWith('pr-')) {
    return getPrEnvironmentConfig(env);
  }

  const config = environments[env];
  if (!config) {
    throw new Error(`Unknown environment: ${env}. Valid values are: dev, stg, prd, or pr-{number}`);
  }
  return config;
}

/**
 * Generate PR environment configuration dynamically
 * @param env PR environment name (e.g., pr-123)
 * @returns PR environment configuration
 */
function getPrEnvironmentConfig(env: string): EnvironmentConfig {
  const prNumber = env.replace('pr-', '');

  // Validate PR number
  if (!/^\d+$/.test(prNumber)) {
    throw new Error(`Invalid PR environment name: ${env}. Expected format: pr-{number}`);
  }

  // Generate PR-specific configuration based on dev environment
  const baseConfig = environments.dev;

  return {
    env: env as Environment,
    awsRegion: baseConfig.awsRegion,
    resourcePrefix: `agentcore-pr-${prNumber}`,
    runtimeName: `agentcore_pr_${prNumber}`,
    deletionProtection: false,
    corsAllowedOrigins: ['*'], // Allow all origins for PR environments
    memoryExpirationDays: 7, // Short retention for PR environments
    s3RemovalPolicy: cdk.RemovalPolicy.DESTROY,
    s3AutoDeleteObjects: true,
    cognitoDeletionProtection: false,
    logRetentionDays: 3, // Short retention for PR environments
    frontendBucketPrefix: `agentcore-pr-${prNumber}`,
    userStorageBucketPrefix: `agentcore-pr-${prNumber}`,
    backendApiName: `agentcore-pr-${prNumber}-backend-api`,
    tavilyApiKeySecretName: 'agentcore/dev/tavily-api-key', // Use dev secrets
    githubTokenSecretName: 'agentcore/dev/github-token', // Use dev secrets
    allowedSignUpEmailDomains: ['amazon.com', 'amazon.co.jp'],
    // No custom domain for PR environments
    // No test user for PR environments
  };
}
