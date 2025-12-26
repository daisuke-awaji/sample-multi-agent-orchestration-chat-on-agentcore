---
name: deployment
description: Deployment guidelines and best practices for Fullstack AgentCore
---

# Deployment Guide

This document outlines deployment practices and guidelines for the Fullstack AgentCore project using AWS CDK.

## CDK Basics

### Project Structure
```
packages/cdk/
├── bin/
│   └── app.ts              # CDK app entry point
├── lib/
│   ├── agentcore-stack.ts  # Main stack definition
│   └── constructs/         # Reusable CDK constructs
├── mcp-api/                # Lambda function code
├── cdk.json                # CDK configuration
└── package.json
```

## Deployment Commands

### First-Time Setup
```bash
# Bootstrap CDK (once per account/region)
npx -w packages/cdk cdk bootstrap

# Deploy stack
npm run deploy
```

### Deployment Options
```bash
# Default region (from AWS CLI config)
npm run deploy

# Specific region
npm run deploy:tokyo  # ap-northeast-1

# Custom region
AWS_REGION=eu-west-1 AWS_DEFAULT_REGION=eu-west-1 CDK_DEFAULT_REGION=eu-west-1 npm run deploy
```

### CDK Commands
```bash
# View changes before deployment
npm run diff

# Synthesize CloudFormation template
npm run synth

# Destroy stack (cleanup)
npx -w packages/cdk cdk destroy
```

## Stack Configuration

### cdk.json
Main configuration file for CDK settings:
```json
{
  "app": "npx ts-node --prefer-ts-exts bin/app.ts",
  "context": {
    "modelIds": ["anthropic.claude-sonnet-4-5-20250929-v1:0"],
    "modelRegion": "us-west-2"
  }
}
```

### Environment Variables
CDK respects the following environment variables:
- `AWS_REGION`: Target AWS region
- `AWS_DEFAULT_REGION`: Fallback region
- `CDK_DEFAULT_REGION`: CDK-specific region
- `STACK_NAME`: Custom stack name (default: `AgentCoreStack`)

## Stack Outputs

### CloudFormation Outputs
The stack exports the following outputs:
- `Region`: Deployment region
- `UserPoolId`: Cognito User Pool ID
- `UserPoolClientId`: Cognito Client ID
- `MemoryId`: AgentCore Memory ID
- `GatewayMcpEndpoint`: AgentCore Gateway endpoint
- `UserStorageBucketName`: S3 bucket name
- `FrontendUrl`: Frontend application URL
- `BackendApiUrl`: Backend API URL
- `RuntimeInvocationEndpoint`: Runtime invocation URL

### Accessing Outputs
```bash
# View all outputs
aws cloudformation describe-stacks \
  --stack-name AgentCoreStack \
  --query 'Stacks[0].Outputs'

# Get specific output
aws cloudformation describe-stacks \
  --stack-name AgentCoreStack \
  --query 'Stacks[0].Outputs[?OutputKey==`FrontendUrl`].OutputValue' \
  --output text
```

## Construct Best Practices

### Naming Conventions
```typescript
// Use consistent naming for resources
const bucket = new s3.Bucket(this, 'UserStorage', {
  bucketName: `${stackName}-user-storage-${region}`,
});

// Export values as stack outputs
new cdk.CfnOutput(this, 'BucketName', {
  value: bucket.bucketName,
  exportName: `${stackName}-BucketName`,
});
```

### Resource Organization
```typescript
// Group related resources in constructs
class CognitoAuth extends Construct {
  public readonly userPool: cognito.UserPool;
  public readonly client: cognito.UserPoolClient;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    // Resource definitions...
  }
}
```

### Props Pattern
```typescript
// Define props interface for constructs
interface CustomConstructProps {
  vpc: ec2.IVpc;
  environment: Record<string, string>;
}

class CustomConstruct extends Construct {
  constructor(scope: Construct, id: string, props: CustomConstructProps) {
    super(scope, id);
    // Use props...
  }
}
```

## Lambda Functions

### Code Organization
```
packages/cdk/mcp-api/
├── index.ts           # Lambda handler
├── tools/             # Tool implementations
└── utils/             # Shared utilities
```

### Lambda Best Practices
```typescript
// Use NodejsFunction for TypeScript
const lambdaFunction = new lambda_nodejs.NodejsFunction(this, 'Handler', {
  entry: 'mcp-api/index.ts',
  runtime: lambda.Runtime.NODEJS_20_X,
  timeout: cdk.Duration.minutes(5),
  environment: {
    TABLE_NAME: table.tableName,
  },
});

// Grant permissions explicitly
table.grantReadWriteData(lambdaFunction);
```

## Security Best Practices

### IAM Roles
```typescript
// Principle of least privilege
const role = new iam.Role(this, 'LambdaRole', {
  assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  managedPolicies: [
    iam.ManagedPolicy.fromAwsManagedPolicyName(
      'service-role/AWSLambdaBasicExecutionRole'
    ),
  ],
});

// Grant specific permissions only
bucket.grantRead(role);
```

### Resource Encryption
```typescript
// Enable encryption for S3
const bucket = new s3.Bucket(this, 'Storage', {
  encryption: s3.BucketEncryption.S3_MANAGED,
  enforceSSL: true,
});

// Enable encryption for DynamoDB
const table = new dynamodb.Table(this, 'Data', {
  encryption: dynamodb.TableEncryption.AWS_MANAGED,
});
```

## Multi-Region Deployment

### Region-Specific Configuration
```typescript
const stack = new cdk.Stack(app, 'AgentCoreStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-west-2',
  },
});
```

### Cross-Region Resources
```typescript
// Some resources must be in specific regions
// e.g., Bedrock models in us-west-2
const bedrockRegion = 'us-west-2';

// Reference cross-region resources
const modelId = `arn:aws:bedrock:${bedrockRegion}:...`;
```

## Troubleshooting

### Common Issues

#### Stack Already Exists
```bash
# Update existing stack
npm run deploy

# Force update with changes
npm run deploy -- --force
```

#### Bootstrap Required
```bash
# Bootstrap the account/region
npx -w packages/cdk cdk bootstrap aws://ACCOUNT-ID/REGION
```

#### Permission Denied
```bash
# Check AWS credentials
aws sts get-caller-identity

# Ensure proper IAM permissions for CDK
```

#### Resource Limits
```bash
# Check AWS service quotas
aws service-quotas list-service-quotas \
  --service-code lambda
```

## CI/CD Integration

### GitLab CI Example
```yaml
deploy:
  stage: deploy
  script:
    - npm ci
    - npm run deploy
  only:
    - main
  environment:
    name: production
```

### GitHub Actions Example
```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm ci
      - run: npm run deploy
```

## Rollback Strategy

### Manual Rollback
```bash
# View stack events
aws cloudformation describe-stack-events \
  --stack-name AgentCoreStack

# Rollback to previous version
aws cloudformation rollback-stack \
  --stack-name AgentCoreStack
```

### Automated Rollback
Configure CloudFormation to automatically rollback on failure:
```typescript
const stack = new cdk.Stack(app, 'AgentCoreStack', {
  terminationProtection: true, // Prevent accidental deletion
});
```

## Cost Management

### Tagging Resources
```typescript
// Add tags for cost tracking
cdk.Tags.of(stack).add('Project', 'AgentCore');
cdk.Tags.of(stack).add('Environment', 'Production');
cdk.Tags.of(stack).add('ManagedBy', 'CDK');
```

### Cost Optimization
- Use appropriate instance sizes
- Enable auto-scaling for Lambda
- Set retention policies for logs
- Use S3 lifecycle policies

## Monitoring and Logging

### CloudWatch Integration
```typescript
// Enable detailed monitoring
const lambdaFunction = new lambda.Function(this, 'Handler', {
  // ... other props
  logRetention: logs.RetentionDays.ONE_WEEK,
  tracing: lambda.Tracing.ACTIVE, // X-Ray tracing
});

// Create CloudWatch alarms
new cloudwatch.Alarm(this, 'ErrorAlarm', {
  metric: lambdaFunction.metricErrors(),
  threshold: 10,
  evaluationPeriods: 1,
});
```

## Best Practices Summary

1. **Version Control**: Keep CDK code in version control
2. **Environment Separation**: Use separate stacks for dev/staging/prod
3. **Parameter Store**: Use AWS Systems Manager for configuration
4. **Testing**: Test CDK code with unit tests
5. **Documentation**: Document custom constructs and patterns
6. **Security**: Follow AWS security best practices
7. **Cost Awareness**: Monitor and optimize costs regularly
8. **Idempotency**: Ensure deployments are idempotent

## Resources

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [CDK Best Practices](https://docs.aws.amazon.com/cdk/latest/guide/best-practices.html)
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)
