# Deployment Options

This guide explains how to customize your deployment by modifying `packages/cdk/config/environments.ts`.

## Overview

The Moca platform supports multiple deployment environments (default, dev, stg, prd) with customizable configurations. Each environment can have different settings for security, storage, logging, and integrations.

## Configuration File

Edit the environment configuration in `packages/cdk/config/environments.ts`:

```typescript
export const environments: Record<Environment, EnvironmentConfigInput> = {
  default: {
    // Minimal configuration - uses all defaults
  },
  dev: {
    // Development environment
    tavilyApiKeySecretName: 'agentcore/dev/tavily-api-key',
    allowedSignUpEmailDomains: ['example.com'],
  },
  prd: {
    // Production environment with stricter settings
    deletionProtection: true,
    memoryExpirationDays: 365,
  },
};
```

## Available Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `deletionProtection` | boolean | `false` | Stack deletion protection |
| `corsAllowedOrigins` | string[] | `['*']` | Allowed CORS origins |
| `memoryExpirationDays` | number | `30` | AgentCore Memory retention period (days) |
| `s3RemovalPolicy` | RemovalPolicy | `DESTROY` | S3 bucket removal policy |
| `s3AutoDeleteObjects` | boolean | `true` | Auto-delete S3 objects on stack deletion |
| `cognitoDeletionProtection` | boolean | `false` | Cognito User Pool deletion protection |
| `logRetentionDays` | number | `7` | Lambda log retention period (days) |
| `tavilyApiKeySecretName` | string | `'agentcore/default/tavily-api-key'` | Secrets Manager secret name for Tavily API key |
| `githubTokenSecretName` | string | `'agentcore/default/github-token'` | Secrets Manager secret name for GitHub token |
| `allowedSignUpEmailDomains` | string[] | - | Allowed email domains for sign-up |
| `customDomain` | object | - | Custom domain configuration |
| `testUser` | object | - | Test user auto-creation (dev only) |
| `eventRules` | array | - | EventBridge rule configurations |

## Environment Examples

### Development

Lightweight configuration for development and testing:

```typescript
dev: {
  // API integrations
  tavilyApiKeySecretName: 'agentcore/dev/tavily-api-key',
  githubTokenSecretName: 'agentcore/dev/github-token',
  
  // Restrict sign-up to specific domains
  allowedSignUpEmailDomains: ['your-company.com'],
  
  // Short retention for cost savings
  memoryExpirationDays: 7,
  logRetentionDays: 3,
},
```

### Production

Secure configuration with data retention:

```typescript
prd: {
  // Enable deletion protection
  deletionProtection: true,
  cognitoDeletionProtection: true,
  
  // Retain data on stack deletion
  s3RemovalPolicy: cdk.RemovalPolicy.RETAIN,
  s3AutoDeleteObjects: false,
  
  // Extended retention
  memoryExpirationDays: 365,
  logRetentionDays: 30,
  
  // Restrict CORS
  corsAllowedOrigins: ['https://app.your-domain.com'],
  
  // API integrations
  tavilyApiKeySecretName: 'agentcore/prd/tavily-api-key',
  githubTokenSecretName: 'agentcore/prd/github-token',
},
```

### Custom Domain Example

To use a custom domain for the frontend:

```typescript
dev: {
  customDomain: {
    hostName: 'agents',        // Creates: agents.example.com
    domainName: 'example.com', // Route53 hosted zone
  },
},
```

**Requirements:**
- A Route53 public hosted zone must exist in the same AWS account
- ACM certificate will be automatically created and validated

### Event Rules Example

Define EventBridge rules for event-driven agent triggers.

> **Note:** The `icon` field specifies the icon displayed in the application UI. Available icons can be found at [Lucide Icons](https://lucide.dev/icons/).

```typescript
dev: {
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
            name: [{ prefix: 'moca-user-storage-' }],
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
```

## Deploying Different Environments

```bash
# Deploy default environment
npm run deploy

# Deploy development environment
npm run deploy:dev

# Deploy production environment
npm run deploy:prd
```

## Related Documentation

- [Local Development Setup](./local-development-setup.md)
- [JWT Authentication System](./jwt-authentication.md)
