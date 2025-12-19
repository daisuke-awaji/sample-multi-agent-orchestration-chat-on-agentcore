import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AgentCoreGateway } from './constructs/agentcore-gateway';
import { AgentCoreLambdaTarget } from './constructs/agentcore-lambda-target';
import { AgentCoreRuntime } from './constructs/agentcore-runtime';
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
   * 作成された Echo Tool Lambda Target
   */
  public readonly echoToolTarget: AgentCoreLambdaTarget;

  /**
   * 作成された AgentCore Runtime
   */
  public readonly agentRuntime: AgentCoreRuntime;

  /**
   * 作成された Frontend
   */
  public readonly frontend: Frontend;

  constructor(scope: Construct, id: string, props?: AgentCoreStackProps) {
    super(scope, id, props);

    // Gateway名の設定
    const gatewayName = props?.gatewayName || 'default-gateway';

    // 1. Cognito 認証システムの作成（Gateway と Runtime で共有）
    this.cognitoAuth = new CognitoAuth(this, 'CognitoAuth', {
      userPoolName: `${gatewayName}-user-pool`,
      appClientName: `${gatewayName}-client`,
      deletionProtection: false, // 開発環境用
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
          'このGatewayを使用してAgentCoreツールと外部サービス間の統合を行います。Echo/Ping ツールが利用可能です。',
      },
    });

    // Echo Tool Lambda Target の作成
    this.echoToolTarget = new AgentCoreLambdaTarget(this, 'EchoToolTarget', {
      targetName: 'echo-tool',
      description: 'Echo/Ping ツールを提供するLambda関数',
      lambdaCodePath: 'packages/lambda-tools/tools/echo-tool',
      toolSchemaPath: 'packages/lambda-tools/tools/echo-tool/tool-schema.json',
      timeout: 30,
      memorySize: 256,
      environment: {
        LOG_LEVEL: 'INFO',
      },
    });

    // Gateway に Lambda Target を追加
    const echoTarget = this.echoToolTarget.addToGateway(
      this.gateway.gateway,
      'EchoToolGatewayTarget'
    );

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

    new cdk.CfnOutput(this, 'EchoToolLambdaArn', {
      value: this.echoToolTarget.lambdaFunction.functionArn,
      description: 'Echo Tool Lambda Function ARN',
      exportName: `${id}-EchoToolLambdaArn`,
    });

    new cdk.CfnOutput(this, 'EchoToolLambdaName', {
      value: this.echoToolTarget.lambdaFunction.functionName,
      description: 'Echo Tool Lambda Function Name',
      exportName: `${id}-EchoToolLambdaName`,
    });

    // 3. AgentCore Runtime の作成（開発用に一時的にワイルドカード設定）
    this.agentRuntime = new AgentCoreRuntime(this, 'AgentCoreRuntime', {
      runtimeName: 'StrandsAgentsTS',
      description: 'TypeScript版Strands Agent Runtime',
      region: this.region,
      authType: props?.runtimeAuthType || 'jwt',
      cognitoAuth: this.cognitoAuth,
      gateway: this.gateway, // JWT伝播用のGatewayエンドポイント設定
      corsAllowedOrigins: '*', // 開発用に全オリジン許可（本番では具体的なURLを設定）
    });

    // 4. Frontend の作成
    this.frontend = new Frontend(this, 'Frontend', {
      userPoolId: this.cognitoAuth.userPoolId,
      userPoolClientId: this.cognitoAuth.clientId,
      runtimeEndpoint: `https://bedrock-agentcore.${this.region}.amazonaws.com/runtimes/${this.agentRuntime.runtimeArn}/invocations?qualifier=DEFAULT`,
      awsRegion: this.region,
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

    // タグの追加
    cdk.Tags.of(this).add('Project', 'AgentCore');
    cdk.Tags.of(this).add('Component', 'Gateway');
  }

  /**
   * 簡単なLambda関数をGatewayTargetとして追加するヘルパーメソッド
   */
  public addSimpleLambdaTarget(targetName: string, code: string): void {
    // 注意: 実際の実装では適切なLambda関数を作成する必要があります
    // ここではプレースホルダーとして記述
    // const lambdaFunction = new lambda.Function(this, `${targetName}Lambda`, {
    //   runtime: lambda.Runtime.NODEJS_20_X,
    //   handler: 'index.handler',
    //   code: lambda.Code.fromInline(code),
    // });
    // this.gateway.addLambdaTarget(targetName, lambdaFunction);
  }
}
