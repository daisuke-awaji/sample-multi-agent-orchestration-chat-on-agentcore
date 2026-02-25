/**
 * Environment configuration type definitions
 */

import * as cdk from 'aws-cdk-lib';

/**
 * Environment name
 */
export type Environment = 'default' | 'dev' | 'stg' | 'prd' | string; // Allow dynamic PR environments

/**
 * Environment-specific configuration interface
 * Used throughout the stack - all core properties are required (defaults applied)
 */
export interface EnvironmentConfig {
  /**
   * Environment name
   */
  env: Environment;

  /**
   * Resource name prefix
   * Used as common prefix for all resources (Gateway, Cognito, S3, API, etc.)
   * Must contain only lowercase letters and numbers (no hyphens or underscores)
   * Examples: 'moca', 'mocadev', 'mocastg', 'mocaprd'
   */
  resourcePrefix: string;

  /**
   * AWS Account ID (optional)
   * Uses CDK_DEFAULT_ACCOUNT if not specified
   */
  awsAccount?: string;

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
   * Tavily API Key Secret Name (Secrets Manager)
   * Set for production/staging environments to retrieve API key from Secrets Manager
   * NOTE: This is a secret NAME/ID reference, not the actual secret value
   * pragma: allowlist secret
   */
  tavilyApiKeySecretName?: string;

  /**
   * GitHub Token Secret Name (Secrets Manager)
   * Set for environments to retrieve GitHub token from Secrets Manager
   * Used for gh CLI authentication
   * NOTE: This is a secret NAME/ID reference, not the actual secret value
   * pragma: allowlist secret
   */
  githubTokenSecretName?: string;

  /**
   * GitLab Token Secret Name (Secrets Manager)
   * Set for environments to retrieve GitLab token from Secrets Manager
   * Used for glab CLI authentication and git credential configuration
   * NOTE: This is a secret NAME/ID reference, not the actual secret value
   * pragma: allowlist secret
   */
  gitlabTokenSecretName?: string;

  /**
   * GitLab Host (optional)
   * Hostname of the GitLab instance (e.g., 'gitlab.com' or 'gitlab.example.com')
   * @default 'gitlab.com'
   */
  gitlabHost?: string;

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

  /**
   * Microsoft Graph OAuth2 Credential Provider ARN (optional)
   * Created via AgentCore Identity management console.
   * When set together with microsoftGraphOAuthSecretArn, enables OneDrive OpenAPI target.
   * Format: arn:aws:bedrock-agentcore:{region}:{account}:token-vault/{id}/oauth2credentialprovider/{name}
   */
  microsoftGraphOAuthProviderArn?: string;

  /**
   * Microsoft Graph OAuth2 Secret ARN (optional)
   * The Secrets Manager secret ARN auto-generated when creating the OAuth2 credential provider.
   * Required together with microsoftGraphOAuthProviderArn to enable OneDrive OpenAPI target.
   * Format: arn:aws:secretsmanager:{region}:{account}:secret:{name}
   * NOTE: This is a secret ARN reference, not the actual secret value
   * pragma: allowlist secret
   */
  microsoftGraphOAuthSecretArn?: string;

  /**
   * Event rules configuration (optional)
   * Predefined EventBridge rules that users can subscribe to for triggers
   */
  eventRules?: EventRuleConfig[];
}

/**
 * Input type for defining environment configurations
 * All properties are optional - `env` is derived from the object key,
 * `resourcePrefix` is auto-generated from env if not specified
 * Used only in environments.ts for configuration definition
 */
export type EnvironmentConfigInput = Partial<Omit<EnvironmentConfig, 'env'>>;

/**
 * Event rule configuration
 * Defines EventBridge rules that trigger Lambda when events match the pattern
 */
export interface EventRuleConfig {
  /**
   * Unique identifier (e.g., "s3-upload", "github-push")
   */
  id: string;

  /**
   * Display name (e.g., "S3 File Upload")
   */
  name: string;

  /**
   * Description
   */
  description: string;

  /**
   * EventBridge event pattern
   * Matches events to trigger the Lambda function
   */
  eventPattern: {
    /**
     * Event source (e.g., ["aws.s3"], ["com.github"])
     */
    source: string[];

    /**
     * Event detail type (e.g., ["Object Created"], ["Push"])
     */
    detailType: string[];

    /**
     * Optional detail filters
     * Example: { bucket: { name: ["my-bucket"] } }
     */
    detail?: Record<string, unknown>;
  };

  /**
   * Icon name for frontend display (optional)
   */
  icon?: string;

  /**
   * Whether this rule is enabled
   */
  enabled: boolean;
}
