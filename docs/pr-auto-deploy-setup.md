# PR Auto Deploy Setup Guide

This guide explains how to set up automatic deployment of PR environments using GitHub Actions.

## Overview

When you add the `auto-deploy` label to a Pull Request, a temporary AWS environment is automatically created. When the PR is closed, the environment is automatically deleted.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  GitHub Repository                                              │
│  ┌─────────────┐                                                │
│  │    PR       │ ─── label: auto-deploy ───┐                   │
│  └─────────────┘                           │                   │
│                                            ▼                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  GitHub Actions Workflow (.github/workflows/auto-deploy)│   │
│  │  ├─ deploy job (on labeled)                             │   │
│  │  └─ cleanup job (on closed + has label)                 │   │
│  └───────────────────────────────────────┬─────────────────┘   │
└──────────────────────────────────────────┼─────────────────────┘
                                           │ OIDC
                                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  AWS Account (891376971424)                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  IAM Role: GitHubActionsRole                            │   │
│  │  - OIDC Trust with GitHub                               │   │
│  │  - CloudFormation, CDK, Bedrock permissions             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                          ▼                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  CloudFormation Stacks (per PR)                         │   │
│  │  - AgentCoreAppPr123                                    │   │
│  │  - AgentCoreAppPr456                                    │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

### 1. AWS Account Setup

The following IAM Role must already exist in your AWS account:
- **Role ARN**: `arn:aws:iam::891376971424:role/GitHubActionsRole`
- **Trust Relationship**: OIDC with GitHub Actions

### 2. Required IAM Permissions

The `GitHubActionsRole` must have the following permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "s3:*",
        "lambda:*",
        "cognito-idp:*",
        "dynamodb:*",
        "bedrock:*",
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:GetRole",
        "iam:GetRolePolicy",
        "iam:PassRole",
        "iam:TagRole",
        "iam:UntagRole",
        "cloudfront:*",
        "route53:*",
        "acm:*",
        "logs:*",
        "secretsmanager:GetSecretValue",
        "sts:AssumeRole"
      ],
      "Resource": "*"
    }
  ]
}
```

**Note**: For production use, you should scope down these permissions to specific resources.

### 3. Required Secrets in AWS Secrets Manager

PR environments use the same secrets as the dev environment:

- `agentcore/dev/tavily-api-key` - Tavily API key for web search
- `agentcore/dev/github-token` - GitHub token for gh CLI

Make sure these secrets exist in your AWS account.

## How to Use

### Deploying a PR Environment

1. Create a Pull Request
2. Add the `auto-deploy` label to the PR
3. Wait for the GitHub Actions workflow to complete (typically 10-15 minutes)
4. The workflow will post a comment with the deployment URLs:
   - Frontend URL (CloudFront)
   - Backend API URL
   - Runtime Invocation Endpoint

### Example Comment

```
🚀 PR Environment Deployed Successfully!

Environment: pr-123
Stack: AgentCoreAppPr123

🔗 Endpoints

- Frontend: https://d1234567890abc.cloudfront.net
- Backend API: https://abcd1234.lambda-url.ap-northeast-1.on.aws/
- Runtime: https://bedrock-agentcore.ap-northeast-1.amazonaws.com/...

ℹ️ Information

This is a temporary environment for testing this PR. 
It will be automatically deleted when the PR is closed.

Note: First-time access may take a few moments to warm up the Lambda functions.
```

### Cleaning Up

When you close the PR (either merge or close without merging), the environment is automatically deleted:

1. The `cleanup` job runs automatically
2. All AWS resources are destroyed
3. A cleanup confirmation comment is posted

## Environment Configuration

PR environments are configured with the following settings:

```typescript
{
  resourcePrefix: `agentcore-pr-{PR_NUMBER}`,
  runtimeName: `agentcore_pr_{PR_NUMBER}`,
  deletionProtection: false,
  corsAllowedOrigins: ['*'],
  memoryExpirationDays: 7,        // Short retention
  logRetentionDays: 3,            // Short retention
  s3RemovalPolicy: DESTROY,       // Auto-delete on cleanup
  s3AutoDeleteObjects: true,
  cognitoDeletionProtection: false,
  allowedSignUpEmailDomains: ['amazon.com', 'amazon.co.jp']
}
```

**Key differences from production:**
- No custom domain
- No test user auto-creation
- Short retention periods (7 days for memory, 3 days for logs)
- Automatic resource deletion on cleanup
- Uses dev environment secrets

## Stack Naming Convention

- **Pattern**: `AgentCoreAppPr{PR_NUMBER}`
- **Examples**:
  - PR #123 → `AgentCoreAppPr123`
  - PR #456 → `AgentCoreAppPr456`

## CDK Context

The workflow uses CDK context to pass the environment:

```bash
# Deploy PR #123
cdk deploy -c env=pr-123

# Destroy PR #123
cdk destroy -c env=pr-123
```

## Troubleshooting

### Deployment Fails

1. Check the [GitHub Actions workflow logs](https://github.com/daisuke-awaji/fullstack-agentcore/actions)
2. Verify IAM Role permissions
3. Check AWS CloudFormation console for stack errors
4. Ensure Secrets Manager secrets exist

### Cleanup Fails

If automatic cleanup fails:

1. Check the workflow logs
2. Manually delete the stack in AWS CloudFormation console:
   ```bash
   aws cloudformation delete-stack --stack-name AgentCoreAppPr{PR_NUMBER}
   ```

### Common Issues

#### Issue: "Access Denied" Error

**Solution**: Verify that `GitHubActionsRole` has all required permissions

#### Issue: "Stack Already Exists"

**Solution**: Delete the existing stack manually before retrying

#### Issue: "Resource Limit Exceeded"

**Solution**: Delete old PR environments to free up resources

## Cost Considerations

Each PR environment creates:
- 1 CloudFront distribution
- 2 Lambda functions (Backend API + Runtime)
- 1 Cognito User Pool
- 2 DynamoDB tables
- 2 S3 buckets
- 1 Bedrock AgentCore Gateway
- 1 Bedrock AgentCore Memory

**Estimated cost per PR environment**: $5-10 per month (depending on usage)

**Recommendations**:
- Limit the number of concurrent PR environments
- Close PRs promptly to trigger automatic cleanup
- Monitor AWS costs regularly

## Security Best Practices

1. **Restrict who can add labels**: Use GitHub branch protection rules
2. **Review IAM permissions**: Follow principle of least privilege
3. **Rotate secrets regularly**: Update Secrets Manager values
4. **Monitor deployments**: Set up AWS CloudWatch alarms
5. **Limit PR environment lifetime**: Consider adding auto-deletion after X days

## Monitoring

### GitHub Actions

- View workflow runs: [Actions tab](https://github.com/daisuke-awaji/fullstack-agentcore/actions)
- Check deployment status in PR comments

### AWS

- CloudFormation console: Monitor stack creation/deletion
- CloudWatch Logs: View Lambda function logs
- Cost Explorer: Track PR environment costs

## Future Enhancements

Potential improvements:

- [ ] Add Slack notifications
- [ ] Implement auto-deletion after N days of inactivity
- [ ] Add smoke tests after deployment
- [ ] Create GitHub label automatically on PR creation
- [ ] Add deployment preview screenshots

## References

- [GitHub Actions OIDC with AWS](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [AWS CDK Context](https://docs.aws.amazon.com/cdk/v2/guide/context.html)
- [CloudFormation Stack Management](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-console-delete-stack.html)