import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AgentCoreGateway } from './constructs/agentcore-gateway';
import { AgentCoreLambdaTarget } from './constructs/agentcore-lambda-target';
import { AgentCoreMemory } from './constructs/agentcore-memory';
import { AgentCoreRuntime } from './constructs/agentcore-runtime';
import { AgentsTable } from './constructs/agents-table';
import { SessionsTable } from './constructs/sessions-table';
import { TriggersTable } from './constructs/triggers-table';
import { TriggerLambda } from './constructs/trigger-lambda';
import { TriggerEventSources } from './constructs/trigger-event-sources';
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

  /**
   * Created Sessions Table
   */
  public readonly sessionsTable: SessionsTable;

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

    // 5.5. Create Sessions Table
    this.sessionsTable = new SessionsTable(this, 'SessionsTable', {
      tableNamePrefix: resourcePrefix,
      removalPolicy: envConfig.s3RemovalPolicy, // Use same removal policy as S3
      pointInTimeRecovery: true,
    });

    // 5.6. Create Triggers Table
    const triggersTable = new TriggersTable(this, 'TriggersTable', {
      tableNamePrefix: resourcePrefix,
      removalPolicy: envConfig.s3RemovalPolicy,
      pointInTimeRecovery: true,
    });

    // 6. Create Backend API (Lambda Web Adapter) - Create before Runtime to pass URL
    // 6. Create Trigger Lambda (before Backend API to get ARN)
    const triggerLambda = new TriggerLambda(this, 'TriggerLambda', {
      resourcePrefix,
      triggersTable: triggersTable.table,
      agentsTable: this.agentsTable.table,
      agentApiUrl: '', // Will be set after Runtime is created
      cognitoUserPoolId: this.cognitoAuth.userPoolId,
      cognitoClientId: this.cognitoAuth.machineUserClientId,
      cognitoDomain: `${this.cognitoAuth.userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`,
    });

    // Create EventBridge Scheduler role
    const schedulerRole = triggerLambda.createSchedulerRole(this, resourcePrefix);

    // 6.5. Create Trigger Event Sources (EventBridge Rules) if configured
    let triggerEventSources: TriggerEventSources | undefined;
    if (envConfig.eventRules && envConfig.eventRules.length > 0) {
      triggerEventSources = new TriggerEventSources(this, 'TriggerEventSources', {
        resourcePrefix,
        eventRules: envConfig.eventRules,
        triggerLambda: triggerLambda.lambdaFunction,
      });
    }

    // 7. Create Backend API (Lambda Web Adapter) - Create before Runtime to pass URL
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
      sessionsTableName: this.sessionsTable.tableName,
      logRetention: envConfig.logRetentionDays,
    });

    // Grant User Storage full access to Backend API
    this.userStorage.grantFullAccess(this.backendApi.lambdaFunction);

    // Grant Agents Table read/write access to Backend API
    this.agentsTable.grantReadWrite(this.backendApi.lambdaFunction);

    // Grant Sessions Table read/write access to Backend API
    this.sessionsTable.grantReadWrite(this.backendApi.lambdaFunction);

    // Grant Triggers Table read/write access to Backend API
    triggersTable.grantReadWrite(this.backendApi.lambdaFunction);

    // Grant EventBridge Scheduler permissions to Backend API
    this.backendApi.lambdaFunction.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: [
          'scheduler:CreateSchedule',
          'scheduler:UpdateSchedule',
          'scheduler:DeleteSchedule',
          'scheduler:GetSchedule',
        ],
        resources: [
          `arn:aws:scheduler:${this.region}:${this.account}:schedule/default/*`,
        ],
      })
    );

    // Add environment variables for trigger management to Backend API
    this.backendApi.lambdaFunction.addEnvironment('TRIGGERS_TABLE_NAME', triggersTable.tableName);
    this.backendApi.lambdaFunction.addEnvironment('TRIGGER_LAMBDA_ARN', triggerLambda.functionArn);
    this.backendApi.lambdaFunction.addEnvironment('SCHEDULER_ROLE_ARN', schedulerRole.roleArn);
    this.backendApi.lambdaFunction.addEnvironment('SCHEDULE_GROUP_NAME', 'default');

    // Add event sources config if event rules are configured
    if (triggerEventSources) {
      this.backendApi.lambdaFunction.addEnvironment(
        'EVENT_SOURCES_CONFIG',
        triggerEventSources.eventSourcesConfig
      );
    }

    // 8. Create AgentCore Runtime
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
      sessionsTableName: this.sessionsTable.tableName, // Pass Sessions Table name
      backendApiUrl: this.backendApi.apiUrl, // Pass Backend API URL for call_agent tool
    });

    // Grant Memory access permissions to Runtime
    this.memory.grantAgentCoreAccess(this.agentRuntime.runtime);

    // Grant User Storage full access to Runtime
    this.userStorage.grantFullAccess(this.agentRuntime.runtime);

    // Grant Sessions Table read/write access to Runtime
    this.sessionsTable.grantReadWrite(this.agentRuntime.runtime);

    // Update Trigger Lambda with Agent API URL (now available from Runtime)
    triggerLambda.lambdaFunction.addEnvironment(
      'AGENT_API_URL',
      `https://bedrock-agentcore.${this.region}.amazonaws.com/runtimes/${this.agentRuntime.runtimeArn}/invocations?qualifier=DEFAULT`
    );

    // 9. Create Frontend
    this.frontend = new Frontend(this, 'Frontend', {
      resourcePrefix: envConfig.frontendBucketPrefix || resourcePrefix,
      userPoolId: this.cognitoAuth.userPoolId,
      userPoolClientId: this.cognitoAuth.clientId,
      runtimeEndpoint: `https://bedrock-agentcore.${this.region}.amazonaws.com/runtimes/${this.agentRuntime.runtimeArn}/invocations?qualifier=DEFAULT`,
      awsRegion: this.region,
      backendApiUrl: this.backendApi.apiUrl, // Add Backend API URL
      customDomain: envConfig.customDomain, // Add custom domain configuration
    });

    // 10. Additional CloudFormation outputs (authentication related)
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

    // Sessions Table-related outputs
    new cdk.CfnOutput(this, 'SessionsTableName', {
      value: this.sessionsTable.tableName,
      description: 'Sessions DynamoDB Table Name',
      exportName: `${id}-SessionsTableName`,
    });

    new cdk.CfnOutput(this, 'SessionsTableArn', {
      value: this.sessionsTable.tableArn,
      description: 'Sessions DynamoDB Table ARN',
      exportName: `${id}-SessionsTableArn`,
    });

    new cdk.CfnOutput(this, 'SessionsTableConfiguration', {
      value: `Sessions Table: ${this.sessionsTable.tableName} - User session storage`,
      description: 'Sessions Table configuration summary',
    });

    // Note: Trigger-related outputs are already defined in construct files:
    // - TriggersTableName: triggers-table.ts
    // - TriggerLambdaArn: trigger-lambda.ts
    // - SchedulerRoleArn: trigger-lambda.ts (createSchedulerRole method)

    new cdk.CfnOutput(this, 'TriggerConfiguration', {
      value: `Triggers: ${triggersTable.tableName} - Scheduled agent execution enabled`,
      description: 'Event-driven Triggers configuration summary',
    });

    // Trigger-related outputs (for setup-env.ts)
    new cdk.CfnOutput(this, 'TriggersTableName', {
      value: triggersTable.tableName,
      description: 'Triggers DynamoDB Table Name',
      exportName: `${id}-TriggersTableName`,
    });

    new cdk.CfnOutput(this, 'TriggerLambdaArn', {
      value: triggerLambda.functionArn,
      description: 'Trigger Lambda Function ARN',
      exportName: `${id}-TriggerLambdaArn`,
    });

    new cdk.CfnOutput(this, 'SchedulerRoleArn', {
      value: schedulerRole.roleArn,
      description: 'EventBridge Scheduler IAM Role ARN',
      exportName: `${id}-SchedulerRoleArn`,
    });

    // Add tags
    cdk.Tags.of(this).add('Project', 'AgentCore');
    cdk.Tags.of(this).add('Component', 'Gateway');
    cdk.Tags.of(this).add('Memory', 'Enabled');
    cdk.Tags.of(this).add('BackendApi', 'Enabled');
    cdk.Tags.of(this).add('UserStorage', 'Enabled');
    cdk.Tags.of(this).add('AgentsTable', 'Enabled');
    cdk.Tags.of(this).add('SessionsTable', 'Enabled');
    cdk.Tags.of(this).add('TriggersTable', 'Enabled');
    cdk.Tags.of(this).add('TriggerLambda', 'Enabled');
  }
}
