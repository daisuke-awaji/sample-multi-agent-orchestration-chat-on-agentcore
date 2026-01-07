/**
 * Amazon Bedrock AgentCore Runtime Construct
 * Strands Agent を AgentCore Runtime にデプロイするための CDK Construct
 */

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as agentcore from '@aws-cdk/aws-bedrock-agentcore-alpha';
import { RuntimeAuthorizerConfiguration } from '@aws-cdk/aws-bedrock-agentcore-alpha';
import { Construct } from 'constructs';
import { CognitoAuth } from './cognito-auth.js';
import { AgentCoreGateway } from './agentcore-gateway.js';

export interface AgentCoreRuntimeProps {
  /**
   * Runtime の名前
   */
  readonly runtimeName: string;

  /**
   * Runtime の説明
   */
  readonly description?: string;

  /**
   * Agent コードのパス
   * デフォルト: '../agent'
   */
  readonly agentCodePath?: string;

  /**
   * AWS リージョン
   * デフォルト: us-east-1
   */
  readonly region?: string;

  /**
   * 認証タイプ (オプション)
   * デフォルト: iam (IAM SigV4認証)
   */
  readonly authType?: 'iam' | 'jwt';

  /**
   * Cognito認証設定 (authType が 'jwt' の場合に必要)
   * 外部で作成されたCognitoAuthを使用
   */
  readonly cognitoAuth?: CognitoAuth;

  /**
   * AgentCore Gateway (JWT伝播用)
   * Gateway エンドポイントを環境変数として Runtime に設定
   */
  readonly gateway?: AgentCoreGateway;

  /**
   * CORS で許可するオリジン URL
   * Frontend の CloudFront URL など
   */
  readonly corsAllowedOrigins?: string;

  /**
   * AgentCore Memory の設定（オプション）
   */
  readonly memory?: {
    readonly memoryId: string;
    readonly enabled?: boolean;
  };

  /**
   * Tavily API Key Secret Name (Secrets Manager)（オプション）
   * 設定されている場合、ランタイムは Secrets Manager から API キーを取得
   */
  readonly tavilyApiKeySecretName?: string;

  /**
   * GitHub Token Secret Name (Secrets Manager)（オプション）
   * 設定されている場合、ランタイムは Secrets Manager から GitHub トークンを取得して gh CLI 認証
   */
  readonly githubTokenSecretName?: string;

  /**
   * User Storage バケット名（オプション）
   * S3ストレージツールを使用するために必要
   */
  readonly userStorageBucketName?: string;

  /**
   * Sessions Table テーブル名（オプション）
   * セッション管理のために必要
   */
  readonly sessionsTableName?: string;

  /**
   * Nova Canvas のリージョン（オプション）
   * 画像生成に使用する Amazon Nova Canvas モデルのリージョン
   * デフォルト: us-east-1
   */
  readonly novaCanvasRegion?: string;

  /**
   * Backend API URL（オプション）
   * call_agent ツールでエージェント情報を取得するために必要
   * 例: https://api.example.com
   */
  readonly backendApiUrl?: string;
}

/**
 * Amazon Bedrock AgentCore Runtime Construct
 */
export class AgentCoreRuntime extends Construct {
  /**
   * 作成された AgentCore Runtime
   */
  public readonly runtime: agentcore.Runtime;

  /**
   * Runtime の ARN
   */
  public readonly runtimeArn: string;

  /**
   * Runtime の ID
   */
  public readonly runtimeId: string;

  constructor(scope: Construct, id: string, props: AgentCoreRuntimeProps) {
    super(scope, id);

    // Agent Runtime Artifact を作成
    // Docker context: プロジェクトルート, Dockerfile: docker/agent.Dockerfile
    const agentRuntimeArtifact = agentcore.AgentRuntimeArtifact.fromAsset('.', {
      file: 'docker/agent.Dockerfile',
    });

    // 認証設定
    let authorizerConfiguration: RuntimeAuthorizerConfiguration | undefined;

    if (props.authType === 'jwt') {
      if (!props.cognitoAuth) {
        throw new Error('JWT認証を使用する場合、cognitoAuthが必要です');
      }

      // L2 Construct の静的メソッドを使用してCognito認証を設定
      authorizerConfiguration = RuntimeAuthorizerConfiguration.usingCognito(
        props.cognitoAuth.userPool,
        [props.cognitoAuth.userPoolClient]
      );

      console.log(
        `Cognito認証設定完了: UserPool=${props.cognitoAuth.userPoolId}, Client=${props.cognitoAuth.clientId}`
      );
    }

    // 環境変数を設定
    const environmentVariables: Record<string, string> = {
      AWS_REGION: props.region || 'us-east-1',
      BEDROCK_MODEL_ID: 'global.anthropic.claude-sonnet-4-5-20250929-v1:0',
      BEDROCK_REGION: props.region || 'us-east-1',
      LOG_LEVEL: 'info',
    };

    // Gateway エンドポイントを設定（JWT伝播用）
    if (props.gateway) {
      environmentVariables.AGENTCORE_GATEWAY_ENDPOINT = props.gateway.gatewayEndpoint;
    }

    // CORS 許可オリジンを設定
    if (props.corsAllowedOrigins) {
      environmentVariables.CORS_ALLOWED_ORIGINS = props.corsAllowedOrigins;
    }

    // AgentCore Memory の設定
    if (props.memory) {
      environmentVariables.AGENTCORE_MEMORY_ID = props.memory.memoryId;
    }

    // Tavily API Key Secret Name の設定
    if (props.tavilyApiKeySecretName) {
      environmentVariables.TAVILY_API_KEY_SECRET_NAME = props.tavilyApiKeySecretName;
    }

    // GitHub Token Secret Name の設定
    if (props.githubTokenSecretName) {
      environmentVariables.GITHUB_TOKEN_SECRET_NAME = props.githubTokenSecretName;
    }

    // User Storage バケット名の設定
    if (props.userStorageBucketName) {
      environmentVariables.USER_STORAGE_BUCKET_NAME = props.userStorageBucketName;
    }

    // Sessions Table テーブル名の設定
    if (props.sessionsTableName) {
      environmentVariables.SESSIONS_TABLE_NAME = props.sessionsTableName;
    }

    // Nova Canvas リージョンの設定
    if (props.novaCanvasRegion) {
      environmentVariables.NOVA_CANVAS_REGION = props.novaCanvasRegion;
    }

    // Backend API URL の設定
    if (props.backendApiUrl) {
      environmentVariables.BACKEND_API_URL = props.backendApiUrl;
    }

    // AgentCore Runtime を作成
    this.runtime = new agentcore.Runtime(this, 'Runtime', {
      runtimeName: props.runtimeName,
      agentRuntimeArtifact: agentRuntimeArtifact,
      description: props.description || `Strands Agent Runtime: ${props.runtimeName}`,
      authorizerConfiguration: authorizerConfiguration,
      environmentVariables: environmentVariables,
      // JWT認証のためのAuthorizationヘッダー転送を有効化
      requestHeaderConfiguration: {
        allowlistedHeaders: ['Authorization'],
      },
    });

    const region = props.region || 'us-east-1';
    const account = cdk.Stack.of(this).account;

    // CloudWatch Logs 権限（Statement 1: log-group レベル）
    this.runtime.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['logs:DescribeLogStreams', 'logs:CreateLogGroup'],
        resources: [
          `arn:aws:logs:${region}:${account}:log-group:/aws/bedrock-agentcore/runtimes/*`,
        ],
      })
    );

    // CloudWatch Logs 権限（Statement 2: 全ロググループの参照）
    this.runtime.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['logs:DescribeLogGroups'],
        resources: [`arn:aws:logs:${region}:${account}:log-group:*`],
      })
    );

    // CloudWatch Logs 権限（Statement 3: log-stream レベル）
    this.runtime.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: [
          `arn:aws:logs:${region}:${account}:log-group:/aws/bedrock-agentcore/runtimes/*:log-stream:*`,
        ],
      })
    );

    // X-Ray トレース権限
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

    // CloudWatch メトリクス権限（条件付き）
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

    // Bedrock モデル呼び出し権限
    this.runtime.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'BedrockModelInvocation',
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: [
          'arn:aws:bedrock:*::foundation-model/*',
          `arn:aws:bedrock:${region}:${account}:*`,
        ],
      })
    );

    // CodeInterpreter 操作権限
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
          `arn:aws:bedrock-agentcore:${region}:aws:code-interpreter/*`, // AWSマネージドCode Interpreter
        ],
      })
    );

    // Secrets Manager アクセス権限（Tavily API Key）
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

    // Secrets Manager アクセス権限（GitHub Token）
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

    // プロパティを設定
    this.runtimeArn = this.runtime.agentRuntimeArn;
    this.runtimeId = this.runtime.agentRuntimeId;
  }
}
