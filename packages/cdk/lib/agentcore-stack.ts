import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AgentCoreGateway } from './constructs/agentcore-gateway';
import { AgentCoreLambdaTarget } from './constructs/agentcore-lambda-target';
import { AgentCoreMemory } from './constructs/agentcore-memory';
import { AgentCoreRuntime } from './constructs/agentcore-runtime';
import { AgentsTable } from './constructs/agents-table';
import { BackendApi } from './constructs/backend-api';
import { CognitoAuth } from './constructs/cognito-auth';
import { Frontend } from './constructs/frontend';
import { UserStorage } from './constructs/user-storage';
import { EnvironmentConfig } from '../config';

export interface AgentCoreStackProps extends cdk.StackProps {
  /**
   * Environment configuration
   */
  readonly envConfig: EnvironmentConfig;

  /**
   * Gateway name (optional)
   * Default: 'default-gateway'
   */
  readonly gatewayName?: string;

  /**
   * Gateway description (optional)
   */
  readonly gatewayDescription?: string;

  /**
   * Authentication type (optional)
   * Default: cognito
   */
  readonly authType?: 'cognito' | 'iam' | 'jwt';

  /**
   * Runtime authentication type (optional)
   * Default: jwt (uses same Cognito as Gateway)
   */
  readonly runtimeAuthType?: 'iam' | 'jwt';

  /**
   * JWT configuration (required when authType is 'jwt')
   */
  readonly jwtConfig?: {
    readonly discoveryUrl: string;
    readonly allowedAudience?: string[];
    readonly allowedClients?: string[];
  };

  /**
   * Memory name (optional)
   * Default: '{gatewayName}-memory'
   */
  readonly memoryName?: string;

  /**
   * Whether to use built-in memory strategies (optional)
   * Default: true (Summarization, Semantic, UserPreference)
   */
  readonly useBuiltInMemoryStrategies?: boolean;

  /**
   * Memory expiration period in days (optional)
   * Default: 90 days
   */
  readonly memoryExpirationDays?: number;

  /**
   * Tavily API Key Secret Name (Secrets Manager) (optional)
   * When set, runtime will retrieve API key from Secrets Manager
   */
  readonly tavilyApiKeySecretName?: string;

  /**
   * GitHub Token Secret Name (Secrets Manager) (optional)
   * When set, runtime will retrieve GitHub token from Secrets Manager for gh CLI authentication
   */
  readonly githubTokenSecretName?: string;
}

/**
 * Amazon Bedrock AgentCore Stack
 *
 * CDK stack for deploying AgentCore Gateway and related resources
 */
export class AgentCoreStack extends cdk.Stack {
  /**
   * Created Cognito authentication system
   */
  public readonly cognitoAuth: CognitoAuth;

  /**
   * Created AgentCore Gateway
   */
  public readonly gateway: AgentCoreGateway;

  /**
   * Created Utility Tools Lambda Target
   */
  public readonly echoToolTarget: AgentCoreLambdaTarget;

  /**
   * Created AgentCore Runtime
   */
  public readonly agentRuntime: AgentCoreRuntime;

  /**
   * Created Backend API
   */
  public readonly backendApi: BackendApi;

  /**
   * Created Frontend
   */
  public readonly frontend: Frontend;

  /**
   * Created AgentCore Memory
   */
  public readonly memory: AgentCoreMemory;

  /**
   * Created User Storage
   */
  public readonly userStorage: UserStorage;

  /**
   * Created Agents Table
   */
  public readonly agentsTable: AgentsTable;

  constructor(scope: Construct, id: string, props: AgentCoreStackProps) {
    super(scope, id, props);

    if (!props.envConfig) {
      throw new Error('envConfig is required');
    }

    const envConfig = props.envConfig;

    // Configure resource prefix (from environment config, can be overridden by props.gatewayName)
    const resourcePrefix = props.gatewayName || envConfig.resourcePrefix;

    // 1. Create Cognito authentication system (shared by Gateway and Runtime)
    this.cognitoAuth = new CognitoAuth(this, 'CognitoAuth', {
      userPoolName: `${resourcePrefix}-user-pool`,
      appClientName: `${resourcePrefix}-client`,
      deletionProtection: envConfig.cognitoDeletionProtection,
      userPoolConfig: {
        selfSignUpEnabled: true, // Enable self sign-up
        autoVerify: {
          email: true, // Enable automatic email verification
        },
      },
      allowedSignUpEmailDomains: envConfig.allowedSignUpEmailDomains,
      testUser: envConfig.testUser, // Add test user configuration
    });

    // 2. Create AgentCore Gateway
    this.gateway = new AgentCoreGateway(this, 'AgentCoreGateway', {
      gatewayName: resourcePrefix,
      description: props?.gatewayDescription || `AgentCore Gateway - ${resourcePrefix}`,
      authType: props?.authType || 'cognito',
      cognitoAuth: this.cognitoAuth,
      jwtConfig: props?.jwtConfig,
      mcpConfig: {
        instructions:
          'Use this Gateway to integrate AgentCore tools with external services. Utility tools (Echo/Ping, etc.) are available.',
      },
    });

    // Create Utility Tools Lambda Target
    this.echoToolTarget = new AgentCoreLambdaTarget(this, 'EchoToolTarget', {
      resourcePrefix: resourcePrefix,
      targetName: 'utility-tools',
      description: 'Lambda function providing utility tools',
      lambdaCodePath: 'packages/lambda-tools/tools/utility-tools',
      toolSchemaPath: 'packages/lambda-tools/tools/utility-tools/tool-schema.json',
      timeout: 30,
      memorySize: 256,
      enableKnowledgeBaseAccess: true, // Enable Retrieve permissions for Knowledge Base
      environment: {
        LOG_LEVEL: 'INFO',
      },
    });

    // Add Lambda Target to Gateway
    this.echoToolTarget.addToGateway(this.gateway.gateway, 'EchoToolGatewayTarget');

    // CloudFormation outputs
    new cdk.CfnOutput(this, 'GatewayArn', {
      value: this.gateway.gatewayArn,
      description: 'AgentCore Gateway ARN',
      exportName: `${id}-GatewayArn`,
    });

    new cdk.CfnOutput(this, 'GatewayId', {
      value: this.gateway.gatewayId,
      description: 'AgentCore Gateway ID',
      exportName: `${id}-GatewayId`,
    });

    new cdk.CfnOutput(this, 'Region', {
      value: this.region,
      description: 'AWS Region',
      exportName: `${id}-Region`,
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.cognitoAuth.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.cognitoAuth.clientId,
      description: 'Cognito User Pool Client ID',
    });

    new cdk.CfnOutput(this, 'UtilityToolsLambdaArn', {
      value: this.echoToolTarget.lambdaFunction.functionArn,
      description: 'Utility Tools Lambda Function ARN',
      exportName: `${id}-UtilityToolsLambdaArn`,
    });

    new cdk.CfnOutput(this, 'UtilityToolsLambdaName', {
      value: this.echoToolTarget.lambdaFunction.functionName,
      description: 'Utility Tools Lambda Function Name',
      exportName: `${id}-UtilityToolsLambdaName`,
    });

    // 3. Create AgentCore Memory
    const memoryName = props?.memoryName || `${resourcePrefix.replace(/-/g, '_')}_memory`;
    const useBuiltInStrategies = props?.useBuiltInMemoryStrategies ?? true;
    const expirationDays = props?.memoryExpirationDays || envConfig.memoryExpirationDays;

    this.memory = new AgentCoreMemory(this, 'AgentCoreMemory', {
      memoryName: memoryName,
      description: `AgentCore Memory for ${resourcePrefix} - Conversation history persistence and context management`,
      expirationDuration: cdk.Duration.days(expirationDays),
      useBuiltInStrategies: useBuiltInStrategies,
      tags: {
        Project: 'AgentCore',
        Component: 'Memory',
        Gateway: resourcePrefix,
        Environment: envConfig.env,
      },
    });

    // 4. Create User Storage
    this.userStorage = new UserStorage(this, 'UserStorage', {
      bucketNamePrefix: envConfig.userStorageBucketPrefix || resourcePrefix,
      retentionDays: 365,
      corsAllowedOrigins: envConfig.corsAllowedOrigins,
      removalPolicy: envConfig.s3RemovalPolicy,
      autoDeleteObjects: envConfig.s3AutoDeleteObjects,
    });

    // 5. Create Agents Table
    this.agentsTable = new AgentsTable(this, 'AgentsTable', {
      tableNamePrefix: resourcePrefix,
      removalPolicy: envConfig.s3RemovalPolicy, // Use same removal policy as S3
      pointInTimeRecovery: true,
    });

    // 6. Create AgentCore Runtime
    this.agentRuntime = new AgentCoreRuntime(this, 'AgentCoreRuntime', {
      runtimeName: envConfig.runtimeName,
      description: `TypeScript-based Strands Agent Runtime - ${resourcePrefix}`,
      region: this.region,
      authType: props?.runtimeAuthType || 'jwt',
      cognitoAuth: this.cognitoAuth,
      gateway: this.gateway, // Gateway endpoint configuration for JWT propagation
      corsAllowedOrigins: envConfig.corsAllowedOrigins.join(','),
      memory: {
        memoryId: this.memory.memoryId,
        enabled: true,
      },
      tavilyApiKeySecretName: props?.tavilyApiKeySecretName || envConfig.tavilyApiKeySecretName, // Pass Tavily API Key Secret Name
      githubTokenSecretName: props?.githubTokenSecretName || envConfig.githubTokenSecretName, // Pass GitHub Token Secret Name
      userStorageBucketName: this.userStorage.bucketName, // Pass User Storage bucket name
    });

    // Grant Memory access permissions to Runtime
    this.memory.grantAgentCoreAccess(this.agentRuntime.runtime);

    // Grant User Storage full access to Runtime
    this.userStorage.grantFullAccess(this.agentRuntime.runtime);

    // 7. Create Backend API (Lambda Web Adapter)
    this.backendApi = new BackendApi(this, 'BackendApi', {
      apiName: envConfig.backendApiName || `${resourcePrefix}-backend-api`,
      cognitoAuth: this.cognitoAuth,
      agentcoreGatewayEndpoint: `https://${this.gateway.gatewayId}.gateway.bedrock-agentcore.${this.region}.amazonaws.com/mcp`,
      agentcoreMemoryId: this.memory.memoryId,
      corsAllowedOrigins: envConfig.corsAllowedOrigins,
      timeout: 30,
      memorySize: 1024,
      userStorageBucketName: this.userStorage.bucketName,
      agentsTableName: this.agentsTable.tableName,
      logRetention: envConfig.logRetentionDays,
    });

    // Grant User Storage full access to Backend API
    this.userStorage.grantFullAccess(this.backendApi.lambdaFunction);

    // Grant Agents Table read/write access to Backend API
    this.agentsTable.grantReadWrite(this.backendApi.lambdaFunction);

    // 8. Create Frontend
    this.frontend = new Frontend(this, 'Frontend', {
      resourcePrefix: envConfig.frontendBucketPrefix || resourcePrefix,
      userPoolId: this.cognitoAuth.userPoolId,
      userPoolClientId: this.cognitoAuth.clientId,
      runtimeEndpoint: `https://bedrock-agentcore.${this.region}.amazonaws.com/runtimes/${this.agentRuntime.runtimeArn}/invocations?qualifier=DEFAULT`,
      awsRegion: this.region,
      backendApiUrl: this.backendApi.apiUrl, // Add Backend API URL
      customDomain: envConfig.customDomain, // Add custom domain configuration
    });

    // 9. Additional CloudFormation outputs (authentication related)
    new cdk.CfnOutput(this, 'GatewayMcpEndpoint', {
      value: `https://${this.gateway.gatewayId}.gateway.bedrock-agentcore.${this.region}.amazonaws.com/mcp`,
      description: 'AgentCore Gateway MCP Endpoint',
      exportName: `${id}-GatewayMcpEndpoint`,
    });

    new cdk.CfnOutput(this, 'RuntimeInvocationEndpoint', {
      value: `https://bedrock-agentcore.${this.region}.amazonaws.com/runtimes/${this.agentRuntime.runtimeArn}/invocations?qualifier=DEFAULT`,
      description: 'AgentCore Runtime Invocation Endpoint (JWT Bearer Token required)',
      exportName: `${id}-RuntimeInvocationEndpoint`,
    });

    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: this.frontend.websiteUrl,
      description: 'Frontend Website URL',
      exportName: `${id}-FrontendUrl`,
    });

    new cdk.CfnOutput(this, 'AuthenticationSummary', {
      value: `Gateway: JWT authentication, Runtime: JWT authentication (Shared Cognito User Pool: ${this.cognitoAuth.userPoolId})`,
      description: 'Authentication configuration summary',
    });

    new cdk.CfnOutput(this, 'CorsConfiguration', {
      value: `CORS configuration: Allowed origins="*" (development), Frontend URL="${this.frontend.websiteUrl}"`,
      description: 'CORS configuration summary',
    });

    // Helper outputs for creating test users
    new cdk.CfnOutput(this, 'CreateTestUserCommand', {
      value: `aws cognito-idp admin-create-user --user-pool-id ${this.cognitoAuth.userPoolId} --username testuser --message-action SUPPRESS --region ${this.region}`,
      description: 'Example command to create test user',
    });

    new cdk.CfnOutput(this, 'SetUserPasswordCommand', {
      value: `aws cognito-idp admin-set-user-password --user-pool-id ${this.cognitoAuth.userPoolId} --username testuser --password YourPassword123! --permanent --region ${this.region}`,
      description: 'Example command to set user password',
    });

    new cdk.CfnOutput(this, 'AgentRuntimeArn', {
      value: this.agentRuntime.runtimeArn,
      description: 'AgentCore Runtime ARN',
      exportName: `${id}-AgentRuntimeArn`,
    });

    new cdk.CfnOutput(this, 'AgentRuntimeId', {
      value: this.agentRuntime.runtimeId,
      description: 'AgentCore Runtime ID',
      exportName: `${id}-AgentRuntimeId`,
    });

    // Memory-related outputs
    new cdk.CfnOutput(this, 'MemoryId', {
      value: this.memory.memoryId,
      description: 'AgentCore Memory ID',
      exportName: `${id}-MemoryId`,
    });

    new cdk.CfnOutput(this, 'MemoryArn', {
      value: this.memory.memoryArn,
      description: 'AgentCore Memory ARN',
      exportName: `${id}-MemoryArn`,
    });

    new cdk.CfnOutput(this, 'MemoryName', {
      value: this.memory.memoryName,
      description: 'AgentCore Memory Name',
      exportName: `${id}-MemoryName`,
    });

    new cdk.CfnOutput(this, 'MemoryConfiguration', {
      value: `Memory: ${this.memory.memoryName} (${this.memory.memoryId}) - Conversation history persistence enabled`,
      description: 'AgentCore Memory configuration summary',
    });

    // Backend API-related outputs
    new cdk.CfnOutput(this, 'BackendApiUrl', {
      value: this.backendApi.apiUrl,
      description: 'Backend API Endpoint URL',
      exportName: `${id}-BackendApiUrl`,
    });

    new cdk.CfnOutput(this, 'BackendApiFunctionName', {
      value: this.backendApi.lambdaFunction.functionName,
      description: 'Backend API Lambda Function Name',
      exportName: `${id}-BackendApiFunctionName`,
    });

    new cdk.CfnOutput(this, 'BackendApiFunctionArn', {
      value: this.backendApi.lambdaFunction.functionArn,
      description: 'Backend API Lambda Function ARN',
      exportName: `${id}-BackendApiFunctionArn`,
    });

    new cdk.CfnOutput(this, 'BackendApiConfiguration', {
      value: `Backend API: ${this.backendApi.apiUrl} (Lambda Web Adapter + Express.js)`,
      description: 'Backend API configuration summary',
    });

    // User Storage-related outputs
    new cdk.CfnOutput(this, 'UserStorageBucketName', {
      value: this.userStorage.bucketName,
      description: 'User Storage S3 Bucket Name',
      exportName: `${id}-UserStorageBucketName`,
    });

    new cdk.CfnOutput(this, 'UserStorageBucketArn', {
      value: this.userStorage.bucketArn,
      description: 'User Storage S3 Bucket ARN',
      exportName: `${id}-UserStorageBucketArn`,
    });

    new cdk.CfnOutput(this, 'UserStorageConfiguration', {
      value: `User Storage: ${this.userStorage.bucketName} - User file storage`,
      description: 'User Storage configuration summary',
    });

    // Agents Table-related outputs
    new cdk.CfnOutput(this, 'AgentsTableName', {
      value: this.agentsTable.tableName,
      description: 'Agents DynamoDB Table Name',
      exportName: `${id}-AgentsTableName`,
    });

    new cdk.CfnOutput(this, 'AgentsTableArn', {
      value: this.agentsTable.tableArn,
      description: 'Agents DynamoDB Table ARN',
      exportName: `${id}-AgentsTableArn`,
    });

    new cdk.CfnOutput(this, 'AgentsTableConfiguration', {
      value: `Agents Table: ${this.agentsTable.tableName} - User agent storage`,
      description: 'Agents Table configuration summary',
    });

    // Add tags
    cdk.Tags.of(this).add('Project', 'AgentCore');
    cdk.Tags.of(this).add('Component', 'Gateway');
    cdk.Tags.of(this).add('Memory', 'Enabled');
    cdk.Tags.of(this).add('BackendApi', 'Enabled');
    cdk.Tags.of(this).add('UserStorage', 'Enabled');
    cdk.Tags.of(this).add('AgentsTable', 'Enabled');
  }
}
