# GitHub CLI Integration Guide

This document explains how to integrate GitHub CLI (`gh`) authentication with the AgentCore Runtime using AWS Secrets Manager.

## Overview

The AgentCore Runtime can authenticate with GitHub CLI using a Personal Access Token stored in AWS Secrets Manager. This enables the agent to perform GitHub operations such as:

- Repository cloning
- Creating pull requests
- Managing issues
- GitHub API interactions

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  AgentCore Runtime (Container)                                  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Entrypoint Script (startup.sh)                           │  │
│  │                                                          │  │
│  │ 1. Retrieve GITHUB_TOKEN from AWS Secrets Manager       │  │
│  │ 2. echo $TOKEN | gh auth login --with-token              │  │
│  │ 3. Start Node.js application                             │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  AWS Secrets Manager                                            │
│                                                                 │
│  Secret Name: agentcore/{env}/github-token                      │
│  Value: ghp_xxxxxxxxxxxxxxxxxxxx (plain text)                   │
└─────────────────────────────────────────────────────────────────┘
```

## Setup Instructions

### 1. Generate GitHub Personal Access Token

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Set the following scopes based on your needs:
   - `repo` - Full control of private repositories
   - `workflow` - Update GitHub Action workflows
   - `read:org` - Read org and team membership (if needed)
4. Copy the generated token (starts with `ghp_`)

### 2. Store Token in AWS Secrets Manager

Create a secret for each environment:

```bash
# For dev environment
aws secretsmanager create-secret \
  --name agentcore/dev/github-token \
  --description "GitHub Personal Access Token for gh CLI (dev environment)" \
  --secret-string "ghp_your_token_here" \
  --region ap-northeast-1

# For staging environment
aws secretsmanager create-secret \
  --name agentcore/stg/github-token \
  --description "GitHub Personal Access Token for gh CLI (staging environment)" \
  --secret-string "ghp_your_token_here" \
  --region ap-northeast-1

# For production environment
aws secretsmanager create-secret \
  --name agentcore/prd/github-token \
  --description "GitHub Personal Access Token for gh CLI (production environment)" \
  --secret-string "ghp_your_token_here" \
  --region ap-northeast-1
```

### 3. Update Secret Value (Optional)

If you need to rotate the token:

```bash
aws secretsmanager update-secret \
  --secret-id agentcore/dev/github-token \
  --secret-string "ghp_new_token_here" \
  --region ap-northeast-1
```

### 4. Deploy Infrastructure

The CDK stack is already configured to:
- Pass the secret name to the Runtime as an environment variable
- Grant IAM permissions for the Runtime to read the secret

Deploy the stack:

```bash
npm run deploy
```

## Configuration

### Environment Configuration

The secret names are configured per environment in `packages/cdk/config/environments.ts`:

```typescript
export const environments: Record<Environment, EnvironmentConfig> = {
  dev: {
    // ...
    githubTokenSecretName: 'agentcore/dev/github-token',
  },
  stg: {
    // ...
    githubTokenSecretName: 'agentcore/stg/github-token',
  },
  prd: {
    // ...
    githubTokenSecretName: 'agentcore/prd/github-token',
  },
};
```

### Runtime Environment Variables

The following environment variable is automatically set in the Runtime:

- `GITHUB_TOKEN_SECRET_NAME` - Secret name in Secrets Manager

### IAM Permissions

The Runtime execution role automatically receives permissions to read the secret:

```json
{
  "Effect": "Allow",
  "Action": ["secretsmanager:GetSecretValue"],
  "Resource": "arn:aws:secretsmanager:region:account:secret:agentcore/*/github-token*"
}
```

## How It Works

### Container Startup Process

1. **Container starts** - The Docker container is launched by AgentCore Runtime
2. **Entrypoint script runs** (`startup.sh`)
   - Checks if `GITHUB_TOKEN_SECRET_NAME` is set
   - Retrieves the token from Secrets Manager using AWS CLI
   - Authenticates with `gh auth login --with-token`
   - Verifies authentication with `gh auth status`
3. **Application starts** - Node.js application launches with `npm start`

### Entrypoint Script

The `packages/agent/scripts/startup.sh` script handles authentication:

```bash
#!/bin/bash
set -e

echo "Starting AgentCore Runtime..."

# GitHub Token authentication
if [ -n "$GITHUB_TOKEN_SECRET_NAME" ]; then
  echo "Retrieving GitHub token from Secrets Manager: $GITHUB_TOKEN_SECRET_NAME"
  GITHUB_TOKEN=$(aws secretsmanager get-secret-value \
    --secret-id "$GITHUB_TOKEN_SECRET_NAME" \
    --query 'SecretString' \
    --output text \
    --region "${AWS_REGION:-us-east-1}" 2>/dev/null || true)
  
  if [ -n "$GITHUB_TOKEN" ] && [ "$GITHUB_TOKEN" != "null" ]; then
    echo "$GITHUB_TOKEN" | gh auth login --with-token
    echo "GitHub CLI authenticated successfully"
    gh auth status
  else
    echo "Warning: Could not retrieve GitHub token, skipping gh auth"
  fi
else
  echo "GITHUB_TOKEN_SECRET_NAME not set, skipping GitHub CLI authentication"
fi

# Start application
echo "Starting Node.js application..."
exec npm start
```

## Verification

### Check Secret Exists

```bash
aws secretsmanager describe-secret \
  --secret-id agentcore/dev/github-token \
  --region ap-northeast-1
```

### Test Secret Retrieval

```bash
aws secretsmanager get-secret-value \
  --secret-id agentcore/dev/github-token \
  --query 'SecretString' \
  --output text \
  --region ap-northeast-1
```

### Check Runtime Logs

After deployment, check CloudWatch Logs for the Runtime:

```bash
aws logs tail /aws/bedrock-agentcore/runtimes/agentcore_app_dev \
  --follow \
  --region ap-northeast-1
```

Look for log entries like:
```
Starting AgentCore Runtime...
Retrieving GitHub token from Secrets Manager: agentcore/dev/github-token
GitHub CLI authenticated successfully
✓ Logged in to github.com as username (keyring)
```

## Security Best Practices

1. **Token Rotation**
   - Rotate GitHub tokens regularly (every 90 days recommended)
   - Update the secret in Secrets Manager after rotation
   - No code changes or redeployment needed

2. **Principle of Least Privilege**
   - Grant only necessary GitHub permissions
   - Use fine-grained tokens when possible
   - Avoid using tokens with full admin access

3. **Secret Management**
   - Never commit tokens to version control
   - Use separate tokens per environment
   - Monitor secret access in CloudTrail

4. **Token Scope**
   - For read-only operations: `repo:status`, `public_repo`
   - For PR creation: `repo`, `workflow`
   - For org operations: add `read:org`, `write:org` as needed

## Troubleshooting

### Authentication Failed

**Problem**: `gh auth status` shows not authenticated

**Solutions**:
1. Verify secret exists in Secrets Manager
2. Check IAM permissions for the Runtime role
3. Ensure token is valid and not expired
4. Check CloudWatch Logs for error messages

### Secret Not Found

**Problem**: `An error occurred (ResourceNotFoundException) when calling the GetSecretValue operation`

**Solutions**:
1. Verify secret name matches environment configuration
2. Check AWS region matches
3. Create the secret if missing

### Invalid Token

**Problem**: `Bad credentials` error when using gh

**Solutions**:
1. Generate a new token on GitHub
2. Update the secret value in Secrets Manager
3. Restart the Runtime (redeploy or update)

### Container Fails to Start

**Problem**: Runtime container exits immediately

**Solutions**:
1. Check the entrypoint script has execute permissions
2. Verify AWS CLI is installed in the container
3. Review CloudWatch Logs for startup errors

## Disabling GitHub Authentication

To disable GitHub CLI authentication:

1. Remove or comment out `githubTokenSecretName` in `packages/cdk/config/environments.ts`:
   ```typescript
   dev: {
     // ...
     // githubTokenSecretName: 'agentcore/dev/github-token',
   }
   ```

2. Redeploy the stack:
   ```bash
   npm run deploy
   ```

The Runtime will skip GitHub authentication if `GITHUB_TOKEN_SECRET_NAME` is not set.

## Resources

- [GitHub Personal Access Tokens Documentation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)
- [GitHub CLI Documentation](https://cli.github.com/)
- [AWS Secrets Manager Documentation](https://docs.aws.amazon.com/secretsmanager/)
- [AWS Secrets Manager Best Practices](https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html)
