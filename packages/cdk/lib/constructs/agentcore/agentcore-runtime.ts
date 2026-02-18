/**
 * Amazon Bedrock AgentCore Runtime Construct
 * CDK Construct for deploying Strands Agent to AgentCore Runtime
 */

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as agentcore from '@aws-cdk/aws-bedrock-agentcore-alpha';
import { RuntimeAuthorizerConfiguration } from '@aws-cdk/aws-bedrock-agentcore-alpha';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { ContainerImageBuild } from 'deploy-time-build';
import { Construct } from 'constructs';
import { CognitoAuth } from '../auth';
import { AgentCoreGateway } from './agentcore-gateway';
import * as path from 'path';

/**
 * Get project root directory from CDK package
 * packages/cdk/lib/constructs/agentcore -> project root (5 levels up)
 */
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

export interface AgentCoreRuntimeProps {
  /**
   * Runtime name
   */
  readonly runtimeName: string;

  /**
   * Runtime description
   */
  readonly description?: string;

  /**
   * Agent code path
   * @default '../agent'
   */
  readonly agentCodePath?: string;

  /**
   * AWS region
   * @default us-east-1
   */
  readonly region?: string;

  /**
   * Authentication type (optional)
   * @default iam (IAM SigV4 authentication)
   */
  readonly authType?: 'iam' | 'jwt';

  /**
   * Cognito authentication settings (required when authType is 'jwt')
   * Uses externally created CognitoAuth
   */
  readonly cognitoAuth?: CognitoAuth;

  /**
   * AgentCore Gateway (for JWT propagation)
   * Sets Gateway endpoint as environment variable for Runtime
   */
  readonly gateway?: AgentCoreGateway;

  /**
   * CORS allowed origin URLs
   * e.g., Frontend CloudFront URL
   */
  readonly corsAllowedOrigins?: string;

  /**
   * AgentCore Memory configuration (optional)
   */
  readonly memory?: {
    readonly memoryId: string;
    readonly enabled?: boolean;
  };

  /**
   * Tavily API Key Secret Name (Secrets Manager) (optional)
   * When set, runtime retrieves API key from Secrets Manager
   */
  readonly tavilyApiKeySecretName?: string;

  /**
   * GitHub Token Secret Name (Secrets Manager) (optional)
   * When set, runtime retrieves GitHub token from Secrets Manager for gh CLI authentication
   */
  readonly githubTokenSecretName?: string;

  /**
   * GitLab Token Secret Name (Secrets Manager) (optional)
   * When set, runtime retrieves GitLab token from Secrets Manager for glab CLI authentication
   */
  readonly gitlabTokenSecretName?: string;

  /**
   * GitLab Host (optional)
   * Hostname of the GitLab instance (e.g., 'gitlab.com' or 'gitlab.example.com')
   * @default 'gitlab.com'
   */
  readonly gitlabHost?: string;

  /**
   * User Storage bucket name (optional)
   * Required for using S3 storage tools
   */
  readonly userStorageBucketName?: string;

  /**
   * Sessions Table name (optional)
   * Required for session management
   */
  readonly sessionsTableName?: string;

  /**
   * Nova Canvas region (optional)
   * Region of Amazon Nova Canvas model used for image generation
   * @default us-east-1
   */
  readonly novaCanvasRegion?: string;

  /**
   * Backend API URL (optional)
   * Required for retrieving agent information with call_agent tool
   * Example: https://api.example.com
   */
  readonly backendApiUrl?: string;

  /**
   * AppSync Events HTTP Endpoint (optional)
   * Used for real-time message delivery
   */
  readonly appsyncHttpEndpoint?: string;
}

/**
 * Amazon Bedrock AgentCore Runtime Construct
 */
export class AgentCoreRuntime extends Construct {
  /**
   * Created AgentCore Runtime
   */
  public readonly runtime: agentcore.Runtime;

  /**
   * Runtime ARN
   */
  public readonly runtimeArn: string;

  /**
   * Runtime ID
   */
  public readonly runtimeId: string;

  constructor(scope: Construct, id: string, props: AgentCoreRuntimeProps) {
    super(scope, id);

    // Build container image using deploy-time-build (CodeBuild)
    // Platform: ARM64 (Amazon Bedrock AgentCore Runtime requires ARM64 architecture)
    // Note: Using CodeBuild eliminates the need for QEMU emulation on x86_64 systems.
    // CodeBuild natively supports ARM64 builds.
    const containerImage = new ContainerImageBuild(this, 'AgentImageBuild', {
      directory: PROJECT_ROOT,
      file: 'docker/agent.Dockerfile',
      platform: Platform.LINUX_ARM64,
      // Exclude large directories to speed up CDK synth hash calculation
      exclude: [
        'node_modules',
        '.git',
        'cdk.out',
        'dist',
        '.vscode',
        '.idea',
        'packages/frontend',
        'packages/client',
        'packages/lambda-tools',
        'docs',
        '*.log',
        '.env*',
        'coverage',
        '.nyc_output',
        '__tests__',
      ],
    });

    // Create AgentRuntimeArtifact from ECR repository
    const agentRuntimeArtifact = agentcore.AgentRuntimeArtifact.fromEcrRepository(
      containerImage.repository,
      containerImage.imageTag
    );

    // Authentication configuration
    let authorizerConfiguration: RuntimeAuthorizerConfiguration | undefined;

    if (props.authType === 'jwt') {
      if (!props.cognitoAuth) {
        throw new Error('cognitoAuth is required when using JWT authentication');
      }

      // Configure Cognito authentication using L2 Construct static method
      // Allow both Frontend Client and Machine User Client
      authorizerConfiguration = RuntimeAuthorizerConfiguration.usingCognito(
        props.cognitoAuth.userPool,
        [props.cognitoAuth.userPoolClient, props.cognitoAuth.machineUserClient]
      );

      console.log(
        `Cognito: UserPool=${props.cognitoAuth.userPoolId}, Frontend Client=${props.cognitoAuth.clientId}, Machine User Client=${props.cognitoAuth.machineUserClientId}`
      );
    }

    // Set environment variables
    const environmentVariables: Record<string, string> = {
      AWS_REGION: props.region || 'us-east-1',
      BEDROCK_MODEL_ID: 'global.anthropic.claude-sonnet-4-6',
      BEDROCK_REGION: props.region || 'us-east-1',
      LOG_LEVEL: 'info',
    };

    // Set Gateway endpoint (for JWT propagation)
    if (props.gateway) {
      environmentVariables.AGENTCORE_GATEWAY_ENDPOINT = props.gateway.gatewayEndpoint;
    }

    // Set CORS allowed origins
    if (props.corsAllowedOrigins) {
      environmentVariables.CORS_ALLOWED_ORIGINS = props.corsAllowedOrigins;
    }

    // AgentCore Memory configuration
    if (props.memory) {
      environmentVariables.AGENTCORE_MEMORY_ID = props.memory.memoryId;
    }

    // Set Tavily API Key Secret Name
    if (props.tavilyApiKeySecretName) {
      environmentVariables.TAVILY_API_KEY_SECRET_NAME = props.tavilyApiKeySecretName;
    }

    // Set GitHub Token Secret Name
    if (props.githubTokenSecretName) {
      environmentVariables.GITHUB_TOKEN_SECRET_NAME = props.githubTokenSecretName;
    }

    // Set GitLab Token Secret Name
    if (props.gitlabTokenSecretName) {
      environmentVariables.GITLAB_TOKEN_SECRET_NAME = props.gitlabTokenSecretName;
    }

    // Set GitLab Host
    if (props.gitlabHost) {
      environmentVariables.GITLAB_HOST = props.gitlabHost;
    }

    // Set User Storage bucket name
    if (props.userStorageBucketName) {
      environmentVariables.USER_STORAGE_BUCKET_NAME = props.userStorageBucketName;
    }

    // Set Sessions Table name
    if (props.sessionsTableName) {
      environmentVariables.SESSIONS_TABLE_NAME = props.sessionsTableName;
    }

    // Set Nova Canvas region
    if (props.novaCanvasRegion) {
      environmentVariables.NOVA_CANVAS_REGION = props.novaCanvasRegion;
    }

    // Set Backend API URL
    if (props.backendApiUrl) {
      environmentVariables.BACKEND_API_URL = props.backendApiUrl;
    }

    // Set AppSync Events HTTP Endpoint
    if (props.appsyncHttpEndpoint) {
      environmentVariables.APPSYNC_HTTP_ENDPOINT = props.appsyncHttpEndpoint;
    }

    // Create AgentCore Runtime
    this.runtime = new agentcore.Runtime(this, 'Runtime', {
      runtimeName: props.runtimeName,
      agentRuntimeArtifact: agentRuntimeArtifact,
      description: props.description || `Strands Agent Runtime: ${props.runtimeName}`,
      authorizerConfiguration: authorizerConfiguration,
      environmentVariables: environmentVariables,
      // Enable Authorization header forwarding for JWT authentication
      requestHeaderConfiguration: {
        allowlistedHeaders: ['Authorization'],
      },
    });

    const region = props.region || 'us-east-1';
    const account = cdk.Stack.of(this).account;

    // CloudWatch Logs permissions (Statement 1: log-group level)
    this.runtime.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['logs:DescribeLogStreams', 'logs:CreateLogGroup'],
        resources: [
          `arn:aws:logs:${region}:${account}:log-group:/aws/bedrock-agentcore/runtimes/*`,
        ],
      })
    );

    // CloudWatch Logs permissions (Statement 2: all log groups reference)
    this.runtime.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['logs:DescribeLogGroups'],
        resources: [`arn:aws:logs:${region}:${account}:log-group:*`],
      })
    );

    // CloudWatch Logs permissions (Statement 3: log-stream level)
    this.runtime.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: [
          `arn:aws:logs:${region}:${account}:log-group:/aws/bedrock-agentcore/runtimes/*:log-stream:*`,
        ],
      })
    );

    // X-Ray tracing permissions
    this.runtime.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'xray:PutTraceSegments',
          'xray:PutTelemetryRecords',
          'xray:GetSamplingRules',
          'xray:GetSamplingTargets',
        ],
        resources: ['*'],
      })
    );

    // CloudWatch metrics permissions (conditional)
    this.runtime.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'cloudwatch:namespace': 'bedrock-agentcore',
          },
        },
      })
    );

    // Bedrock model invocation permissions
    this.runtime.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'BedrockModelInvocation',
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
          'bedrock:StartAsyncInvoke', // Start async job for Nova Reel
          'bedrock:GetAsyncInvoke',
          'bedrock:ListAsyncInvokes',
        ],
        resources: [
          'arn:aws:bedrock:*::foundation-model/*',
          `arn:aws:bedrock:${region}:${account}:*`,
          // Nova Reel is only available in us-east-1, allow cross-region async invokes
          `arn:aws:bedrock:us-east-1:${account}:async-invoke/*`,
          `arn:aws:bedrock:${region}:${account}:async-invoke/*`,
        ],
      })
    );

    // CodeInterpreter operation permissions
    this.runtime.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'BedrockAgentCoreCodeInterpreterAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock-agentcore:CreateCodeInterpreter',
          'bedrock-agentcore:StartCodeInterpreterSession',
          'bedrock-agentcore:InvokeCodeInterpreter',
          'bedrock-agentcore:StopCodeInterpreterSession',
          'bedrock-agentcore:DeleteCodeInterpreter',
          'bedrock-agentcore:ListCodeInterpreters',
          'bedrock-agentcore:GetCodeInterpreter',
          'bedrock-agentcore:GetCodeInterpreterSession',
          'bedrock-agentcore:ListCodeInterpreterSessions',
        ],
        resources: [
          `arn:aws:bedrock-agentcore:${region}:${account}:code-interpreter/*`,
          `arn:aws:bedrock-agentcore:${region}:aws:code-interpreter/*`, // AWS Managed Code Interpreter
        ],
      })
    );

    // Browser operation permissions
    this.runtime.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'BedrockAgentCoreBrowserAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock-agentcore:CreateBrowser',
          'bedrock-agentcore:StartBrowserSession',
          'bedrock-agentcore:UpdateBrowserStream',
          'bedrock-agentcore:StopBrowserSession',
          'bedrock-agentcore:GetBrowserSession',
          'bedrock-agentcore:SaveBrowserSessionProfile',
          'bedrock-agentcore:DeleteBrowser',
          'bedrock-agentcore:ListBrowsers',
          'bedrock-agentcore:GetBrowser',
          'bedrock-agentcore:ListBrowserSessions',
          'bedrock-agentcore:ConnectBrowserAutomationStream',
          'bedrock-agentcore:ConnectBrowserLiveViewStream',
        ],
        resources: [
          `arn:aws:bedrock-agentcore:${region}:${account}:browser/*`,
          `arn:aws:bedrock-agentcore:${region}:aws:browser/*`, // AWS Managed Browser
        ],
      })
    );

    // Secrets Manager access permissions (Tavily API Key)
    if (props.tavilyApiKeySecretName) {
      this.runtime.addToRolePolicy(
        new iam.PolicyStatement({
          sid: 'SecretsManagerTavilyApiKeyAccess',
          effect: iam.Effect.ALLOW,
          actions: ['secretsmanager:GetSecretValue'],
          resources: [
            `arn:aws:secretsmanager:${region}:${account}:secret:${props.tavilyApiKeySecretName}*`,
          ],
        })
      );
    }

    // Secrets Manager access permissions (GitHub Token)
    if (props.githubTokenSecretName) {
      this.runtime.addToRolePolicy(
        new iam.PolicyStatement({
          sid: 'SecretsManagerGitHubTokenAccess',
          effect: iam.Effect.ALLOW,
          actions: ['secretsmanager:GetSecretValue'],
          resources: [
            `arn:aws:secretsmanager:${region}:${account}:secret:${props.githubTokenSecretName}*`,
          ],
        })
      );
    }

    // Secrets Manager access permissions (GitLab Token)
    if (props.gitlabTokenSecretName) {
      this.runtime.addToRolePolicy(
        new iam.PolicyStatement({
          sid: 'SecretsManagerGitLabTokenAccess',
          effect: iam.Effect.ALLOW,
          actions: ['secretsmanager:GetSecretValue'],
          resources: [
            `arn:aws:secretsmanager:${region}:${account}:secret:${props.gitlabTokenSecretName}*`,
          ],
        })
      );
    }

    // S3 access permissions (for User Storage & Nova Reel output)
    if (props.userStorageBucketName) {
      this.runtime.addToRolePolicy(
        new iam.PolicyStatement({
          sid: 'S3UserStorageAccess',
          effect: iam.Effect.ALLOW,
          actions: [
            's3:GetObject',
            's3:PutObject',
            's3:DeleteObject',
            's3:ListBucket',
            's3:HeadObject',
          ],
          resources: [
            `arn:aws:s3:::${props.userStorageBucketName}`,
            `arn:aws:s3:::${props.userStorageBucketName}/*`,
          ],
        })
      );
    }

    // AppSync Events permissions (for real-time message delivery)
    if (props.appsyncHttpEndpoint) {
      this.runtime.addToRolePolicy(
        new iam.PolicyStatement({
          sid: 'AppSyncEventsPublish',
          effect: iam.Effect.ALLOW,
          actions: ['appsync:EventPublish'],
          resources: [`arn:aws:appsync:${region}:${account}:apis/*/channelNamespace/*`],
        })
      );
    }

    // Set properties
    this.runtimeArn = this.runtime.agentRuntimeArn;
    this.runtimeId = this.runtime.agentRuntimeId;
  }
}
