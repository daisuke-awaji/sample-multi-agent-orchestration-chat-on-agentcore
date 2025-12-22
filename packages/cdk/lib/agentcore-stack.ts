import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AgentCoreGateway } from './constructs/agentcore-gateway';
import { AgentCoreLambdaTarget } from './constructs/agentcore-lambda-target';
import { AgentCoreMemory } from './constructs/agentcore-memory';
import { AgentCoreRuntime } from './constructs/agentcore-runtime';
import { BackendApi } from './constructs/backend-api';
import { CognitoAuth } from './constructs/cognito-auth';
import { Frontend } from './constructs/frontend';

export interface AgentCoreStackProps extends cdk.StackProps {
  /**
   * Gateway の名前 (オプション)
   * デフォルト: 'default-gateway'
   */
  readonly gatewayName?: string;

  /**
   * Gateway の説明 (オプション)
   */
  readonly gatewayDescription?: string;

  /**
   * 認証タイプ (オプション)
   * デフォルト: cognito
   */
  readonly authType?: 'cognito' | 'iam' | 'jwt';

  /**
   * Runtime の認証タイプ (オプション)
   * デフォルト: jwt (Gateway と同じ Cognito を使用)
   */
  readonly runtimeAuthType?: 'iam' | 'jwt';

  /**
   * JWTの設定 (authType が 'jwt' の場合に必要)
   */
  readonly jwtConfig?: {
    readonly discoveryUrl: string;
    readonly allowedAudience?: string[];
    readonly allowedClients?: string[];
  };

  /**
   * Memory の名前 (オプション)
   * デフォルト: '{gatewayName}-memory'
   */
  readonly memoryName?: string;

  /**
   * Memory で組み込み戦略を使用するかどうか (オプション)
   * デフォルト: true (Summarization, Semantic, UserPreference)
   */
  readonly useBuiltInMemoryStrategies?: boolean;

  /**
   * Memory の有効期限（日数） (オプション)
   * デフォルト: 90日
   */
  readonly memoryExpirationDays?: number;
}

/**
 * Amazon Bedrock AgentCore Stack
 *
 * AgentCore Gateway とその他の関連リソースをデプロイするためのCDKスタック
 */
export class AgentCoreStack extends cdk.Stack {
  /**
   * 作成された Cognito 認証システム
   */
  public readonly cognitoAuth: CognitoAuth;

  /**
   * 作成された AgentCore Gateway
   */
  public readonly gateway: AgentCoreGateway;

  /**
   * 作成された Utility Tools Lambda Target
   */
  public readonly echoToolTarget: AgentCoreLambdaTarget;

  /**
   * 作成された AgentCore Runtime
   */
  public readonly agentRuntime: AgentCoreRuntime;

  /**
   * 作成された Backend API
   */
  public readonly backendApi: BackendApi;

  /**
   * 作成された Frontend
   */
  public readonly frontend: Frontend;

  /**
   * 作成された AgentCore Memory
   */
  public readonly memory: AgentCoreMemory;

  constructor(scope: Construct, id: string, props?: AgentCoreStackProps) {
    super(scope, id, props);

    // Gateway名の設定
    const gatewayName = props?.gatewayName || 'default-gateway';

    // 1. Cognito 認証システムの作成（Gateway と Runtime で共有）
    this.cognitoAuth = new CognitoAuth(this, 'CognitoAuth', {
      userPoolName: `${gatewayName}-user-pool`,
      appClientName: `${gatewayName}-client`,
      deletionProtection: false, // 開発環境用
      userPoolConfig: {
        selfSignUpEnabled: true, // セルフサインアップを有効化
        autoVerify: {
          email: true, // メール自動検証を有効化
        },
      },
    });

    // 2. AgentCore Gateway の作成
    this.gateway = new AgentCoreGateway(this, 'AgentCoreGateway', {
      gatewayName: gatewayName,
      description: props?.gatewayDescription || `AgentCore Gateway - ${gatewayName}`,
      authType: props?.authType || 'cognito',
      cognitoAuth: this.cognitoAuth,
      jwtConfig: props?.jwtConfig,
      mcpConfig: {
        instructions:
          'このGatewayを使用してAgentCoreツールと外部サービス間の統合を行います。Utility ツール（Echo/Ping等）が利用可能です。',
      },
    });

    // Utility Tools Lambda Target の作成
    this.echoToolTarget = new AgentCoreLambdaTarget(this, 'EchoToolTarget', {
      targetName: 'utility-tools',
      description: 'Utility ツール（Echo/Ping等）を提供するLambda関数',
      lambdaCodePath: 'packages/lambda-tools/tools/utility-tools',
      toolSchemaPath: 'packages/lambda-tools/tools/utility-tools/tool-schema.json',
      timeout: 30,
      memorySize: 256,
      environment: {
        LOG_LEVEL: 'INFO',
      },
    });

    // Gateway に Lambda Target を追加
    this.echoToolTarget.addToGateway(this.gateway.gateway, 'EchoToolGatewayTarget');

    // CloudFormation出力
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

    // 3. AgentCore Memory の作成
    const memoryName = props?.memoryName || `${gatewayName.replace(/-/g, '_')}_memory`;
    const useBuiltInStrategies = props?.useBuiltInMemoryStrategies ?? true;
    const expirationDays = props?.memoryExpirationDays || 90;

    this.memory = new AgentCoreMemory(this, 'AgentCoreMemory', {
      memoryName: memoryName,
      description: `AgentCore Memory for ${gatewayName} - 会話履歴の永続化とコンテキスト管理`,
      expirationDuration: cdk.Duration.days(expirationDays),
      useBuiltInStrategies: useBuiltInStrategies,
      tags: {
        Project: 'AgentCore',
        Component: 'Memory',
        Gateway: gatewayName,
      },
    });

    // 4. AgentCore Runtime の作成（開発用に一時的にワイルドカード設定）
    this.agentRuntime = new AgentCoreRuntime(this, 'AgentCoreRuntime', {
      runtimeName: 'StrandsAgentsTS',
      description: 'TypeScript版Strands Agent Runtime',
      region: this.region,
      authType: props?.runtimeAuthType || 'jwt',
      cognitoAuth: this.cognitoAuth,
      gateway: this.gateway, // JWT伝播用のGatewayエンドポイント設定
      corsAllowedOrigins: '*', // 開発用に全オリジン許可（本番では具体的なURLを設定）
      memory: {
        memoryId: this.memory.memoryId,
        enabled: true,
      },
    });

    // Runtime に Memory アクセス権限を付与
    this.memory.grantAgentCoreAccess(this.agentRuntime.runtime);

    // 5. Backend API の作成（Lambda Web Adapter）
    this.backendApi = new BackendApi(this, 'BackendApi', {
      apiName: `${gatewayName}-backend-api`,
      cognitoAuth: this.cognitoAuth,
      agentcoreGatewayEndpoint: `https://${this.gateway.gatewayId}.gateway.bedrock-agentcore.${this.region}.amazonaws.com/mcp`,
      agentcoreMemoryId: this.memory.memoryId,
      corsAllowedOrigins: ['*'], // 開発用、本番では具体的なオリジンを設定
      timeout: 30, // API Gateway の制限
      memorySize: 1024, // Express アプリに十分なメモリ
    });

    // 6. Frontend の作成
    this.frontend = new Frontend(this, 'Frontend', {
      userPoolId: this.cognitoAuth.userPoolId,
      userPoolClientId: this.cognitoAuth.clientId,
      runtimeEndpoint: `https://bedrock-agentcore.${this.region}.amazonaws.com/runtimes/${this.agentRuntime.runtimeArn}/invocations?qualifier=DEFAULT`,
      awsRegion: this.region,
      backendApiUrl: this.backendApi.apiUrl, // Backend API URL を追加
    });

    // 5. CloudFormation 追加出力（認証関連）
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
      value: `Gateway: JWT認証, Runtime: JWT認証 (共通Cognito User Pool: ${this.cognitoAuth.userPoolId})`,
      description: '認証設定サマリー',
    });

    new cdk.CfnOutput(this, 'CorsConfiguration', {
      value: `CORS設定: 許可オリジン="*" (開発用)、Frontend URL="${this.frontend.websiteUrl}"`,
      description: 'CORS設定サマリー',
    });

    // テスト用ユーザー作成のヘルパー出力
    new cdk.CfnOutput(this, 'CreateTestUserCommand', {
      value: `aws cognito-idp admin-create-user --user-pool-id ${this.cognitoAuth.userPoolId} --username testuser --message-action SUPPRESS --region ${this.region}`,
      description: 'テストユーザー作成コマンド例',
    });

    new cdk.CfnOutput(this, 'SetUserPasswordCommand', {
      value: `aws cognito-idp admin-set-user-password --user-pool-id ${this.cognitoAuth.userPoolId} --username testuser --password YourPassword123! --permanent --region ${this.region}`,
      description: 'ユーザーパスワード設定コマンド例',
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

    // Memory 関連の出力
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
      value: `Memory: ${this.memory.memoryName} (${this.memory.memoryId}) - 会話履歴永続化機能有効`,
      description: 'AgentCore Memory 設定サマリー',
    });

    // Backend API 関連の出力
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
      description: 'Backend API 設定サマリー',
    });

    // タグの追加
    cdk.Tags.of(this).add('Project', 'AgentCore');
    cdk.Tags.of(this).add('Component', 'Gateway');
    cdk.Tags.of(this).add('Memory', 'Enabled');
    cdk.Tags.of(this).add('BackendApi', 'Enabled');
  }
}
