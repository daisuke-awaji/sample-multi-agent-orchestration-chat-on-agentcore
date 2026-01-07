import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { Construct } from 'constructs';
import { CognitoAuth } from './cognito-auth';

export interface BackendApiProps {
  /**
   * API名
   */
  readonly apiName?: string;

  /**
   * Cognito認証システム
   */
  readonly cognitoAuth: CognitoAuth;

  /**
   * AgentCore Gateway エンドポイント
   */
  readonly agentcoreGatewayEndpoint: string;

  /**
   * AgentCore Memory ID
   */
  readonly agentcoreMemoryId?: string;

  /**
   * User Storage バケット名
   */
  readonly userStorageBucketName?: string;

  /**
   * Agents Table テーブル名
   */
  readonly agentsTableName?: string;

  /**
   * Sessions Table テーブル名
   */
  readonly sessionsTableName?: string;

  /**
   * CORS許可オリジン
   */
  readonly corsAllowedOrigins?: string[];

  /**
   * Lambda関数のタイムアウト（秒）
   * @default 30
   */
  readonly timeout?: number;

  /**
   * Lambda関数のメモリサイズ（MB）
   * @default 1024
   */
  readonly memorySize?: number;

  /**
   * Lambda関数のログ保持期間
   * @default 14日
   */
  readonly logRetention?: logs.RetentionDays;

  /**
   * Docker イメージのコンテキストパス
   * @default 'packages/backend'
   */
  readonly dockerContextPath?: string;

  /**
   * Docker イメージのファイル名
   * @default 'Dockerfile.lambda'
   */
  readonly dockerFileName?: string;
}

/**
 * AgentCore Backend API Construct
 *
 * Lambda Web Adapter を使用して Express アプリケーションを
 * API Gateway + Lambda で実行するためのCDK Construct
 */
export class BackendApi extends Construct {
  /**
   * Lambda関数
   */
  public readonly lambdaFunction: lambda.Function;

  /**
   * HTTP API Gateway
   */
  public readonly httpApi: apigatewayv2.HttpApi;

  /**
   * API エンドポイント URL
   */
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: BackendApiProps) {
    super(scope, id);

    const apiName = props.apiName || 'agentcore-backend-api';
    const corsAllowedOrigins = props.corsAllowedOrigins || ['*'];

    // Lambda 実行ロールの作成
    const lambdaExecutionRole = new iam.Role(this, 'BackendApiExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // AgentCore Memory へのアクセス権限を追加
    if (props.agentcoreMemoryId) {
      // Bedrock モデル呼び出し権限
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

      // AgentCore Memory セッション操作権限
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
            // メモリレコード操作権限を追加
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

      // AgentCore Memory Control Plane 権限
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

    // CloudWatch Log Group の作成
    const logGroup = new logs.LogGroup(this, 'BackendApiLogGroup', {
      logGroupName: `/aws/lambda/${apiName}-function`,
      retention: props.logRetention || logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Lambda関数の作成（Docker Image Function）
    this.lambdaFunction = new lambda.DockerImageFunction(this, 'BackendApiFunction', {
      functionName: `${apiName}-function`,
      code: lambda.DockerImageCode.fromImageAsset(props.dockerContextPath || '.', {
        file: props.dockerFileName || 'docker/backend.Dockerfile',
        platform: Platform.LINUX_AMD64,
      }),
      architecture: lambda.Architecture.X86_64,
      timeout: cdk.Duration.seconds(props.timeout || 30),
      memorySize: props.memorySize || 1024,
      role: lambdaExecutionRole,
      logGroup: logGroup, // deprecated な logRetention の代わりに logGroup を使用
      environment: {
        // Node.js / Express 設定
        NODE_ENV: 'production',
        PORT: '8080',

        // Cognito / JWT 認証設定
        COGNITO_USER_POOL_ID: props.cognitoAuth.userPoolId,
        COGNITO_REGION: cdk.Stack.of(this).region,

        // CORS 設定
        CORS_ALLOWED_ORIGINS: corsAllowedOrigins.join(','),

        // AWS / AgentCore 設定
        // AWS_REGION は Lambda ランタイムが自動提供するため削除
        AGENTCORE_GATEWAY_ENDPOINT: props.agentcoreGatewayEndpoint,
        AGENTCORE_MEMORY_ID: props.agentcoreMemoryId || '',
        USER_STORAGE_BUCKET_NAME: props.userStorageBucketName || '',
        AGENTS_TABLE_NAME: props.agentsTableName || '',
        SESSIONS_TABLE_NAME: props.sessionsTableName || '',

        // Lambda Web Adapter 設定（既にDockerfileで設定されているが念のため）
        AWS_LWA_PORT: '8080',
        AWS_LWA_READINESS_CHECK_PATH: '/ping',
        AWS_LWA_INVOKE_MODE: 'BUFFERED',
        AWS_LWA_ASYNC_INIT: 'true',
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
      },
      description: `AgentCore Backend API - Express.js app running with Lambda Web Adapter`,
    });

    // Lambda Integration の作成
    const lambdaIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'BackendApiIntegration',
      this.lambdaFunction,
      {
        payloadFormatVersion: apigatewayv2.PayloadFormatVersion.VERSION_2_0,
      }
    );

    // HTTP API Gateway の作成
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
        maxAge: cdk.Duration.seconds(86400), // 24時間
      },
      // defaultIntegration を削除 - $default ルートが OPTIONS リクエストを Lambda に転送するのを防ぐ
    });

    // すべてのルートをLambda関数に転送
    // Lambda Web Adapter が内部的に Express ルーティングを処理
    // OPTIONS は API Gateway の corsPreflight で処理されるため除外
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

    // ルートパス用の追加ルート
    this.httpApi.addRoutes({
      path: '/',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    // API URL の取得
    this.apiUrl = this.httpApi.url!;

    // Lambda 関数に API Gateway からの呼び出し権限を追加
    this.lambdaFunction.addPermission('ApiGatewayInvokePermission', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:${this.httpApi.httpApiId}/*`,
    });

    // CloudWatch Alarms（オプション）
    this.lambdaFunction.metricErrors({
      period: cdk.Duration.minutes(5),
    });

    this.lambdaFunction.metricDuration({
      period: cdk.Duration.minutes(5),
    });

    // タグの追加
    cdk.Tags.of(this.lambdaFunction).add('Component', 'BackendApi');
    cdk.Tags.of(this.httpApi).add('Component', 'BackendApi');
    cdk.Tags.of(lambdaExecutionRole).add('Component', 'BackendApi');
  }

  /**
   * Lambda 関数に追加の環境変数を設定
   */
  public addEnvironmentVariable(key: string, value: string): void {
    this.lambdaFunction.addEnvironment(key, value);
  }

  /**
   * Lambda 関数に追加の IAM 権限を付与
   */
  public grantPermissions(statement: iam.PolicyStatement): void {
    this.lambdaFunction.addToRolePolicy(statement);
  }

  /**
   * API Gateway に追加のルートを設定
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
