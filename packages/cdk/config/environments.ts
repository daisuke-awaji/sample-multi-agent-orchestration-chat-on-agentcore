import * as cdk from 'aws-cdk-lib';
import type { Environment, EnvironmentConfigInput } from './environment-types';

/**
 * Base prefix for resource naming
 * All resources are named in the format: {BASE_PREFIX}{env}
 * Examples: donuts, donutsdev, donutsstg, donutsprd
 */
export const BASE_PREFIX = 'donuts';

/**
 * Environment-specific configurations
 *
 * - env: Automatically derived from object key
 * - resourcePrefix: Auto-generated as 'donuts' + env if not specified
 * - Others: Default values applied if not specified
 *
 * Default values:
 *   - deletionProtection: false
 *   - corsAllowedOrigins: ['*']
 *   - memoryExpirationDays: 30
 *   - s3RemovalPolicy: DESTROY
 *   - s3AutoDeleteObjects: true
 *   - cognitoDeletionProtection: false
 *   - logRetentionDays: 7
 *   - tavilyApiKeySecretName: 'agentcore/default/tavily-api-key'
 *   - githubTokenSecretName: 'agentcore/default/github-token'
 *   - gitlabTokenSecretName: 'agentcore/default/gitlab-token'
 */
export const environments: Record<Environment, EnvironmentConfigInput> = {
  /**
   * Default environment
   */
  default: {},

  /**
   * Development environment
   */
  dev: {
    tavilyApiKeySecretName: 'agentcore/dev/tavily-api-key',
    githubTokenSecretName: 'agentcore/dev/github-token',
    gitlabTokenSecretName: 'agentcore/dev/gitlab-token',
    eventRules: [
      {
        id: 's3-upload',
        name: 'S3 File Upload',
        description: 'Triggered when a file is uploaded to S3',
        eventPattern: {
          source: ['aws.s3'],
          detailType: ['Object Created'],
          detail: {
            bucket: {
              name: [{ prefix: 'donuts-user-storage-' }],
            },
          },
        },
        icon: 'cloud-upload', // https://lucide.dev/icons/cloud-upload
        enabled: true,
      },
      {
        id: 'github-issue-created',
        name: 'GitHub Issue created',
        description: 'Triggered when a new issue is opened in the GitHub repository',
        eventPattern: {
          source: ['github.com'],
          detailType: ['issues'],
          detail: {
            action: ['opened'],
          },
        },
        icon: 'github', // https://lucide.dev/icons/github
        enabled: true,
      },
    ],
  },

  /**
   * Staging environment
   */
  stg: {
    corsAllowedOrigins: ['https://stg.example.com'],
    memoryExpirationDays: 60,
    s3RemovalPolicy: cdk.RemovalPolicy.RETAIN,
    s3AutoDeleteObjects: false,
    logRetentionDays: 14,
    tavilyApiKeySecretName: 'agentcore/stg/tavily-api-key',
    githubTokenSecretName: 'agentcore/stg/github-token',
    gitlabTokenSecretName: 'agentcore/stg/gitlab-token',
  },

  /**
   * Production environment
   */
  prd: {
    deletionProtection: true,
    corsAllowedOrigins: ['https://app.example.com'],
    memoryExpirationDays: 365,
    s3RemovalPolicy: cdk.RemovalPolicy.RETAIN,
    s3AutoDeleteObjects: false,
    cognitoDeletionProtection: true,
    logRetentionDays: 30,
    tavilyApiKeySecretName: 'agentcore/prd/tavily-api-key',
    githubTokenSecretName: 'agentcore/prd/github-token',
    gitlabTokenSecretName: 'agentcore/prd/gitlab-token',
  },
};
