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
    gitlabTokenSecretName: 'agentcore/dev/gitlab-token',
    allowedSignUpEmailDomains: ['example.com'],
  },
  stg: {
    // Staging environment
    corsAllowedOrigins: ['https://stg.example.com'],
    memoryExpirationDays: 60,
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
| `githubWebhookSecretName` | string | `'agentcore/default/github-webhook-secret'` | Secrets Manager secret name for GitHub webhook HMAC secret |
| `allowedSignUpEmailDomains` | string[] | - | Allowed email domains for sign-up |
| `customDomain` | object | - | Custom domain configuration |
| `testUser` | object | - | Test user auto-creation (dev only) |
| `eventRules` | array | - | EventBridge rule configurations |
| `gitlabTokenSecretName` | string | `'agentcore/default/gitlab-token'` | Secrets Manager secret name for GitLab token |
| `gitlabHost` | string | `'gitlab.com'` | GitLab instance hostname |
| `microsoftGraphOAuthProviderArn` | string | - | Microsoft Graph OAuth2 credential provider ARN |
| `microsoftGraphOAuthSecretArn` | string | - | Microsoft Graph OAuth2 secret ARN |
| `enableAwsOpsPermissions` | boolean | `false` | Enable AWS ReadOnly + CloudFormation deploy permissions |
| `awsAccount` | string | - | AWS Account ID (uses CDK_DEFAULT_ACCOUNT if not specified) |
| `resourcePrefix` | string | auto-generated | Resource name prefix (e.g., 'moca', 'mocadev') |
| `bedrockModels` | BedrockModelConfig[] | global.* models | Available Bedrock models for frontend model selector |

## Environment Examples

### Development

Lightweight configuration for development and testing:

```typescript
dev: {
  // API integrations
  tavilyApiKeySecretName: 'agentcore/dev/tavily-api-key',
  githubTokenSecretName: 'agentcore/dev/github-token',
  gitlabTokenSecretName: 'agentcore/dev/gitlab-token',
  
  // Enable AWS resource inspection for development
  enableAwsOpsPermissions: true,
  
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
    {
        id: 'github-pr',
        name: 'GitHub Pull Request',
        description: 'Triggered when a pull request event occurs in the GitHub repository',
        eventPattern: {
          source: ['github.com'],
          detailType: ['pull_request'],
        },
        icon: 'git-pull-request', // https://lucide.dev/icons/git-pull-request
        enabled: true,
    },
  ],
},
```

## Bedrock Model Selection

You can configure which Bedrock models are available in the frontend model selector per environment. Each model ID should include the [cross-region inference profile](https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html) prefix (e.g., `global.`, `us.`, `eu.`, `apac.`, `jp.`).

```typescript
dev: {
  bedrockModels: [
    { id: 'us.anthropic.claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'Anthropic' },
    { id: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', name: 'Claude Haiku 4.5', provider: 'Anthropic' },
    { id: 'us.amazon.nova-2-lite-v1:0', name: 'Nova Lite 2', provider: 'Amazon' },
  ],
},
```

If `bedrockModels` is not specified, the frontend defaults to `global.*` prefixed models (Claude Opus 4.6, Claude Sonnet 4.6, Nova Lite 2). The first model in the list is used as the default selection.

## Deploying Different Environments

```bash
# Deploy default environment
npm run deploy

# Deploy development environment
npm run deploy:dev

# Deploy staging environment
npm run deploy:stg

# Deploy production environment
npm run deploy:prd
```


## Microsoft Graph (OneDrive) Integration

Enable OneDrive file operations and Excel workbook manipulation through Microsoft Graph API. When configured, agents can list, upload, download, search, and manage files in OneDrive, as well as read and write Excel worksheets, cells, and ranges.

### Prerequisites

1. **Azure AD App Registration** — Register an application in [Microsoft Entra admin center](https://entra.microsoft.com/)
2. **API Permissions** — Add Microsoft Graph Application permission `Files.ReadWrite.All` and grant admin consent
3. **Client Secret** — Create a client secret for the registered application

### 1. Create OAuth2 Credential Provider

Create an OAuth2 credential provider in the AgentCore Identity management console:

1. Open the **AgentCore console** → **Identity** → **Token Vault**
2. Create a new **OAuth2 Credential Provider** with:
   - **Authorization URL**: `https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/authorize`
   - **Token URL**: `https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token`
   - **Client ID**: Your Azure AD application (client) ID
   - **Client Secret**: Your Azure AD client secret
   - **Scope**: `https://graph.microsoft.com/.default`
3. Note the **Credential Provider ARN** and the auto-generated **Secret ARN** from the output

### 2. Configure Environment

Add the ARNs to your environment configuration in `packages/cdk/config/environments.ts`:

```typescript
dev: {
  microsoftGraphOAuthProviderArn:
    'arn:aws:bedrock-agentcore:us-east-1:123456789012:token-vault/tv-xxx/oauth2credentialprovider/microsoft-graph',
  microsoftGraphOAuthSecretArn:
    'arn:aws:secretsmanager:us-east-1:123456789012:secret:AgentCoreTokenVault-xxx',
},
```

### 3. Deploy

```bash
npm run deploy
```

After deployment, the OneDrive OpenAPI gateway target is automatically created. Agents can then use OneDrive tools for file and Excel operations.

## GitHub Webhook Setup

To receive GitHub events (Issues, Pull Requests) and trigger agents automatically:

### 1. Create Webhook Secret in Secrets Manager

```bash
# Generate a random secret
WEBHOOK_SECRET=$(uuidgen)

# Store in Secrets Manager
aws secretsmanager create-secret \
  --name "agentcore/dev/github-webhook-secret" \
  --secret-string "$WEBHOOK_SECRET" \
  --region ap-northeast-1

echo "Save this secret for GitHub configuration: $WEBHOOK_SECRET"
```

### 2. Configure GitHub Repository Webhook

1. Go to your GitHub repository → **Settings** → **Webhooks** → **Add webhook**
2. Set the following:
   - **Payload URL**: `<Backend API URL>/webhooks/github` (find in CloudFormation outputs)
   - **Content type**: `application/json`
   - **Secret**: The `$WEBHOOK_SECRET` value from step 1
   - **Events**: Select "Let me select individual events" → check **Issues** and **Pull requests**
3. Click **Add webhook**

### 3. Create Event Triggers

In the Moca UI, create triggers that subscribe to the `github-issue-created` or `github-pr` event sources. When a matching GitHub event occurs, the subscribed agent will be automatically invoked with the event context.

## Related Documentation

- [Local Development Setup](./local-development-setup.md)
