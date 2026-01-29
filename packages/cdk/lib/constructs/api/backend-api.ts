import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { ContainerImageBuild } from 'deploy-time-build';
import { Construct } from 'constructs';
import { CognitoAuth } from '../auth';

export interface BackendApiProps {
  /**
   * API name
   */
  readonly apiName?: string;

  /**
   * Cognito authentication system
   */
  readonly cognitoAuth: CognitoAuth;

  /**
   * AgentCore Gateway endpoint
   */
  readonly agentcoreGatewayEndpoint: string;

  /**
   * AgentCore Memory ID
   */
  readonly agentcoreMemoryId?: string;

  /**
   * User Storage bucket name
   */
  readonly userStorageBucketName?: string;

  /**
   * Agents Table name
   */
  readonly agentsTableName?: string;

  /**
   * Sessions Table name
   */
  readonly sessionsTableName?: string;

  /**
   * CORS allowed origins
   */
  readonly corsAllowedOrigins?: string[];

  /**
   * Lambda function timeout (seconds)
   * @default 30
   */
  readonly timeout?: number;

  /**
   * Lambda function memory size (MB)
   * @default 1024
   */
  readonly memorySize?: number;

  /**
   * Lambda function log retention period
   * @default 14 days
   */
  readonly logRetention?: logs.RetentionDays;

  /**
   * Docker image context path
   * @default 'packages/backend'
   */
  readonly dockerContextPath?: string;

  /**
   * Docker image file name
   * @default 'Dockerfile.lambda'
   */
  readonly dockerFileName?: string;
}

/**
 * AgentCore Backend API Construct
 *
 * CDK Construct for running Express applications on
 * API Gateway + Lambda using Lambda Web Adapter
 */
export class BackendApi extends Construct {
  /**
   * Lambda function
   */
  public readonly lambdaFunction: lambda.Function;

  /**
   * HTTP API Gateway
   */
  public readonly httpApi: apigatewayv2.HttpApi;

  /**
   * API endpoint URL
   */
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: BackendApiProps) {
    super(scope, id);

    const apiName = props.apiName || 'agentcore-backend-api';
    const corsAllowedOrigins = props.corsAllowedOrigins || ['*'];

    // Create Lambda execution role
    const lambdaExecutionRole = new iam.Role(this, 'BackendApiExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Add access permissions to AgentCore Memory
    if (props.agentcoreMemoryId) {
      // Bedrock model invocation permissions
      lambdaExecutionRole.addToPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'bedrock:RetrieveAndGenerate',
            'bedrock:Retrieve',
            'bedrock:InvokeModel',
            'bedrock:InvokeModelWithResponseStream',
          ],
          resources: [`*`],
        })
      );

      // AgentCore Memory session operation permissions
      lambdaExecutionRole.addToPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'bedrock-agentcore:ListSessions',
            'bedrock-agentcore:GetSessionEvents',
            'bedrock-agentcore:ListEvents',
            'bedrock-agentcore:CreateSession',
            'bedrock-agentcore:UpdateSession',
            'bedrock-agentcore:DeleteSession',
            'bedrock-agentcore:ListMemoryRecords',
            'bedrock-agentcore:DeleteMemoryRecord',
            'bedrock-agentcore:RetrieveMemoryRecords',
          ],
          resources: [
            `arn:aws:bedrock-agentcore:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:memory/${props.agentcoreMemoryId}`,
            `arn:aws:bedrock-agentcore:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:memory/${props.agentcoreMemoryId}/*`,
          ],
        })
      );

      // AgentCore Memory Control Plane permissions
      lambdaExecutionRole.addToPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['bedrock-agentcore:GetMemory'],
          resources: [
            `arn:aws:bedrock-agentcore:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:memory/${props.agentcoreMemoryId}`,
          ],
        })
      );
    }

    // Add access permissions to EventBridge Scheduler
    // Scheduler create/update/delete permissions
    lambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'scheduler:CreateSchedule',
          'scheduler:UpdateSchedule',
          'scheduler:DeleteSchedule',
          'scheduler:GetSchedule',
          'scheduler:ListSchedules',
        ],
        resources: ['*'],
      })
    );

    // Permission to pass IAM role used by EventBridge Scheduler to invoke Lambda
    lambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['iam:PassRole'],
        resources: [`arn:aws:iam::${cdk.Stack.of(this).account}:role/*`],
        conditions: {
          StringEquals: {
            'iam:PassedToService': 'scheduler.amazonaws.com',
          },
        },
      })
    );

    // Create CloudWatch Log Group
    const logGroup = new logs.LogGroup(this, 'BackendApiLogGroup', {
      logGroupName: `/aws/lambda/${apiName}-function`,
      retention: props.logRetention || logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Build container image using deploy-time-build (CodeBuild)
    const containerImage = new ContainerImageBuild(this, 'BackendImageBuild', {
      directory: props.dockerContextPath || '.',
      file: props.dockerFileName || 'docker/backend.Dockerfile',
      platform: Platform.LINUX_AMD64,
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

    // Create Lambda function (Docker Image Function)
    this.lambdaFunction = new lambda.DockerImageFunction(this, 'BackendApiFunction', {
      functionName: `${apiName}-function`,
      code: containerImage.toLambdaDockerImageCode(),
      architecture: lambda.Architecture.X86_64,
      timeout: cdk.Duration.seconds(props.timeout || 30),
      memorySize: props.memorySize || 1024,
      role: lambdaExecutionRole,
      logGroup: logGroup, // Use logGroup instead of deprecated logRetention
      environment: {
        // Node.js / Express configuration
        NODE_ENV: 'production',
        PORT: '8080',

        // Cognito / JWT authentication configuration
        COGNITO_USER_POOL_ID: props.cognitoAuth.userPoolId,
        COGNITO_REGION: cdk.Stack.of(this).region,

        // CORS configuration
        CORS_ALLOWED_ORIGINS: corsAllowedOrigins.join(','),

        // AWS / AgentCore configuration
        // AWS_REGION removed as Lambda runtime provides it automatically
        AGENTCORE_GATEWAY_ENDPOINT: props.agentcoreGatewayEndpoint,
        AGENTCORE_MEMORY_ID: props.agentcoreMemoryId || '',
        USER_STORAGE_BUCKET_NAME: props.userStorageBucketName || '',
        AGENTS_TABLE_NAME: props.agentsTableName || '',
        SESSIONS_TABLE_NAME: props.sessionsTableName || '',

        // Lambda Web Adapter configuration (already set in Dockerfile, but added for safety)
        AWS_LWA_PORT: '8080',
        AWS_LWA_READINESS_CHECK_PATH: '/ping',
        AWS_LWA_INVOKE_MODE: 'BUFFERED',
        AWS_LWA_ASYNC_INIT: 'true',
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
      },
      description: `AgentCore Backend API - Express.js app running with Lambda Web Adapter`,
    });

    // Create Lambda Integration
    const lambdaIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'BackendApiIntegration',
      this.lambdaFunction,
      {
        payloadFormatVersion: apigatewayv2.PayloadFormatVersion.VERSION_2_0,
      }
    );

    // Create HTTP API Gateway
    this.httpApi = new apigatewayv2.HttpApi(this, 'BackendHttpApi', {
      apiName: apiName,
      description: 'AgentCore Backend HTTP API with Lambda Web Adapter',
      corsPreflight: {
        allowOrigins: corsAllowedOrigins,
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.PUT,
          apigatewayv2.CorsHttpMethod.DELETE,
          apigatewayv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Content-Type', 'Authorization'],
        maxAge: cdk.Duration.seconds(86400), // 24 hours
      },
      // Removed defaultIntegration - prevents $default route from forwarding OPTIONS requests to Lambda
    });

    // Forward all routes to Lambda function
    // Lambda Web Adapter handles Express routing internally
    // OPTIONS excluded as it is handled by API Gateway corsPreflight
    this.httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [
        apigatewayv2.HttpMethod.GET,
        apigatewayv2.HttpMethod.POST,
        apigatewayv2.HttpMethod.PUT,
        apigatewayv2.HttpMethod.DELETE,
        apigatewayv2.HttpMethod.PATCH,
        apigatewayv2.HttpMethod.HEAD,
      ],
      integration: lambdaIntegration,
    });

    // Additional route for root path
    this.httpApi.addRoutes({
      path: '/',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    // Get API URL
    this.apiUrl = this.httpApi.url!;

    // Add permission for API Gateway to invoke Lambda function
    this.lambdaFunction.addPermission('ApiGatewayInvokePermission', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:${this.httpApi.httpApiId}/*`,
    });

    // CloudWatch Alarms (optional)
    this.lambdaFunction.metricErrors({
      period: cdk.Duration.minutes(5),
    });

    this.lambdaFunction.metricDuration({
      period: cdk.Duration.minutes(5),
    });

    // Add tags
    cdk.Tags.of(this.lambdaFunction).add('Component', 'BackendApi');
    cdk.Tags.of(this.httpApi).add('Component', 'BackendApi');
    cdk.Tags.of(lambdaExecutionRole).add('Component', 'BackendApi');
  }

  /**
   * Set additional environment variables for Lambda function
   */
  public addEnvironmentVariable(key: string, value: string): void {
    this.lambdaFunction.addEnvironment(key, value);
  }

  /**
   * Grant additional IAM permissions to Lambda function
   */
  public grantPermissions(statement: iam.PolicyStatement): void {
    this.lambdaFunction.addToRolePolicy(statement);
  }

  /**
   * Add additional routes to API Gateway
   */
  public addRoute(
    path: string,
    methods: apigatewayv2.HttpMethod[],
    integration?: apigatewayv2Integrations.HttpLambdaIntegration
  ): void {
    this.httpApi.addRoutes({
      path,
      methods,
      integration:
        integration ||
        new apigatewayv2Integrations.HttpLambdaIntegration(
          `Integration-${path.replace(/[^a-zA-Z0-9]/g, '')}`,
          this.lambdaFunction
        ),
    });
  }
}
