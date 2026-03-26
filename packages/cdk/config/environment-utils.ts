/**
 * Environment configuration utilities
 * Contains logic for resolving environment configurations with defaults
 */

import * as cdk from 'aws-cdk-lib';
import type {
  BedrockModelConfig,
  Environment,
  EnvironmentConfig,
  EnvironmentConfigInput,
} from './environment-types';
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
  githubWebhookSecretName: 'agentcore/default/github-webhook-secret',
  bedrockModels: [
    {
      id: 'global.anthropic.claude-opus-4-6-v1',
      name: 'Claude Opus 4.6',
      provider: 'Anthropic' as const,
    },
    {
      id: 'global.anthropic.claude-sonnet-4-6',
      name: 'Claude Sonnet 4.6',
      provider: 'Anthropic' as const,
    },
    { id: 'global.amazon.nova-2-lite-v1:0', name: 'Nova Lite 2', provider: 'Amazon' as const },
  ],
};

const VALID_PROVIDERS: readonly string[] = ['Anthropic', 'Amazon'];
const INFERENCE_PROFILE_PREFIX = /^(global|us|eu|apac|jp)\./;

/**
 * Validate bedrockModels configuration
 * Called during resolveConfig so errors surface at cdk synth / deploy time.
 */
function validateBedrockModels(models: BedrockModelConfig[], env: Environment): void {
  if (models.length === 0) {
    throw new Error(`[${env}] bedrockModels must contain at least one model`);
  }
  for (const model of models) {
    if (!model.id || typeof model.id !== 'string') {
      throw new Error(`[${env}] bedrockModels: invalid model id: ${JSON.stringify(model)}`);
    }
    if (!INFERENCE_PROFILE_PREFIX.test(model.id)) {
      throw new Error(
        `[${env}] bedrockModels: model id "${model.id}" must start with inference profile prefix (global., us., eu., apac., jp.)`
      );
    }
    if (!model.name || typeof model.name !== 'string') {
      throw new Error(`[${env}] bedrockModels: missing name for model "${model.id}"`);
    }
    if (!VALID_PROVIDERS.includes(model.provider)) {
      throw new Error(
        `[${env}] bedrockModels: invalid provider "${model.provider}" for model "${model.id}". Must be one of: ${VALID_PROVIDERS.join(', ')}`
      );
    }
  }
}

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
  const bedrockModels = input.bedrockModels ?? DEFAULT_CONFIG.bedrockModels;
  validateBedrockModels(bedrockModels, env);

  return {
    // Spread input first so optional properties are automatically passed through.
    // Adding a new optional property to EnvironmentConfig no longer requires
    // updating this function — only properties with defaults need explicit entries below.
    ...input,
    // Required properties (derived or with defaults)
    env,
    resourcePrefix: input.resourcePrefix ?? getDefaultResourcePrefix(env),
    deletionProtection: input.deletionProtection ?? DEFAULT_CONFIG.deletionProtection,
    corsAllowedOrigins: input.corsAllowedOrigins ?? DEFAULT_CONFIG.corsAllowedOrigins,
    memoryExpirationDays: input.memoryExpirationDays ?? DEFAULT_CONFIG.memoryExpirationDays,
    s3RemovalPolicy: input.s3RemovalPolicy ?? DEFAULT_CONFIG.s3RemovalPolicy,
    s3AutoDeleteObjects: input.s3AutoDeleteObjects ?? DEFAULT_CONFIG.s3AutoDeleteObjects,
    cognitoDeletionProtection:
      input.cognitoDeletionProtection ?? DEFAULT_CONFIG.cognitoDeletionProtection,
    logRetentionDays: input.logRetentionDays ?? DEFAULT_CONFIG.logRetentionDays,
    tavilyApiKeySecretName: input.tavilyApiKeySecretName ?? DEFAULT_CONFIG.tavilyApiKeySecretName,
    githubTokenSecretName: input.githubTokenSecretName ?? DEFAULT_CONFIG.githubTokenSecretName,
    gitlabTokenSecretName: input.gitlabTokenSecretName ?? DEFAULT_CONFIG.gitlabTokenSecretName,
    githubWebhookSecretName:
      input.githubWebhookSecretName ?? DEFAULT_CONFIG.githubWebhookSecretName,
    bedrockModels,
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
