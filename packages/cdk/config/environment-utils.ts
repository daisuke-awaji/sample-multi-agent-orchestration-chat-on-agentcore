/**
 * Environment configuration utilities
 * Contains logic for resolving environment configurations with defaults
 */

import * as cdk from 'aws-cdk-lib';
import type { Environment, EnvironmentConfig, EnvironmentConfigInput } from './environment-types';
import { BASE_PREFIX, environments } from './environments';

/**
 * Default configuration values
 * All environments inherit these defaults unless explicitly overridden
 */
const DEFAULT_CONFIG = {
  deletionProtection: false,
  corsAllowedOrigins: ['*'] as string[],
  memoryExpirationDays: 30,
  s3RemovalPolicy: cdk.RemovalPolicy.DESTROY,
  s3AutoDeleteObjects: true,
  cognitoDeletionProtection: false,
  logRetentionDays: 7,
  tavilyApiKeySecretName: 'agentcore/default/tavily-api-key',
  githubTokenSecretName: 'agentcore/default/github-token',
  gitlabTokenSecretName: 'agentcore/default/gitlab-token',
};

/**
 * Generate default resource prefix from environment name
 * @param env Environment name
 * @returns Resource prefix (e.g., 'moca', 'mocadev', 'mocapr123')
 */
function getDefaultResourcePrefix(env: Environment): string {
  if (env === 'default') {
    return BASE_PREFIX;
  }
  // Remove hyphens for PR environments (pr-123 -> pr123)
  return `${BASE_PREFIX}${env.replace(/-/g, '')}`;
}

/**
 * Apply default values to partial configuration
 * @param env Environment name (derived from object key)
 * @param input Partial environment configuration input
 * @returns Full configuration with all defaults applied
 */
function resolveConfig(env: Environment, input: EnvironmentConfigInput): EnvironmentConfig {
  return {
    env: env,
    resourcePrefix: input.resourcePrefix ?? getDefaultResourcePrefix(env),
    deletionProtection: input.deletionProtection ?? DEFAULT_CONFIG.deletionProtection,
    corsAllowedOrigins: input.corsAllowedOrigins ?? DEFAULT_CONFIG.corsAllowedOrigins,
    memoryExpirationDays: input.memoryExpirationDays ?? DEFAULT_CONFIG.memoryExpirationDays,
    s3RemovalPolicy: input.s3RemovalPolicy ?? DEFAULT_CONFIG.s3RemovalPolicy,
    s3AutoDeleteObjects: input.s3AutoDeleteObjects ?? DEFAULT_CONFIG.s3AutoDeleteObjects,
    cognitoDeletionProtection:
      input.cognitoDeletionProtection ?? DEFAULT_CONFIG.cognitoDeletionProtection,
    logRetentionDays: input.logRetentionDays ?? DEFAULT_CONFIG.logRetentionDays,
    // Pass through optional properties
    awsAccount: input.awsAccount,
    tavilyApiKeySecretName: input.tavilyApiKeySecretName ?? DEFAULT_CONFIG.tavilyApiKeySecretName,
    githubTokenSecretName: input.githubTokenSecretName ?? DEFAULT_CONFIG.githubTokenSecretName,
    gitlabTokenSecretName: input.gitlabTokenSecretName ?? DEFAULT_CONFIG.gitlabTokenSecretName,
    gitlabHost: input.gitlabHost,
    allowedSignUpEmailDomains: input.allowedSignUpEmailDomains,
    customDomain: input.customDomain,
    testUser: input.testUser,
    eventRules: input.eventRules,
  };
}

/**
 * Generate PR environment configuration dynamically
 * @param env PR environment name (e.g., pr-123)
 * @returns PR environment configuration input
 */
function getPrEnvironmentConfig(env: string): EnvironmentConfigInput {
  const prNumber = env.replace('pr-', '');

  // Validate PR number
  if (!/^\d+$/.test(prNumber)) {
    throw new Error(`Invalid PR environment name: ${env}. Expected format: pr-{number}`);
  }

  return {
    // resourcePrefix is auto-generated as 'mocapr123' from env 'pr-123'
    memoryExpirationDays: 7, // Short retention for PR environments
    logRetentionDays: 3, // Short retention for PR environments
    tavilyApiKeySecretName: 'agentcore/dev/tavily-api-key', // Use dev secrets
    githubTokenSecretName: 'agentcore/dev/github-token', // Use dev secrets
    allowedSignUpEmailDomains: ['amazon.com', 'amazon.co.jp'],
  };
}

/**
 * Get environment configuration with defaults applied
 * @param env Environment name (default, dev, stg, prd, or pr-{number})
 * @returns Full environment configuration with all defaults applied
 */
export function getEnvironmentConfig(env: Environment): EnvironmentConfig {
  // Check if it's a PR environment (e.g., pr-123)
  if (env.startsWith('pr-')) {
    return resolveConfig(env, getPrEnvironmentConfig(env));
  }

  const config = environments[env];
  if (!config) {
    throw new Error(
      `Unknown environment: ${env}. Valid values are: default, dev, stg, prd, or pr-{number}`
    );
  }
  return resolveConfig(env, config);
}
