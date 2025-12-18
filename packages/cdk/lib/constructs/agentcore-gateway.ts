import { Construct } from 'constructs';
import * as agentcore from '@aws-cdk/aws-bedrock-agentcore-alpha';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Aws } from 'aws-cdk-lib';
import { CognitoAuth } from './cognito-auth.js';

export interface AgentCoreGatewayProps {
  /**
   * Gateway の名前
   * 有効な文字: a-z, A-Z, 0-9, _ (アンダースコア), - (ハイフン)
   * 最大100文字
   */
  readonly gatewayName: string;

  /**
   * Gateway の説明 (オプション)
   * 最大200文字
   */
  readonly description?: string;

  /**
   * 認証タイプ (オプション)
   * デフォルト: cognito
   */
  readonly authType?: 'cognito' | 'iam' | 'jwt';

  /**
   * Cognito認証設定 (authType が 'cognito' の場合に必要)
   * 外部で作成されたCognitoAuthを使用
   */
  readonly cognitoAuth?: CognitoAuth;

  /**
   * JWTの設定 (authType が 'jwt' の場合に必要)
   */
  readonly jwtConfig?: {
    readonly discoveryUrl: string;
    readonly allowedAudience?: string[];
    readonly allowedClients?: string[];
  };

  /**
   * MCP プロトコルの設定 (オプション)
   */
  readonly mcpConfig?: {
    readonly instructions?: string;
    readonly searchType?: agentcore.McpGatewaySearchType;
    readonly supportedVersions?: agentcore.MCPProtocolVersion[];
  };
}

/**
 * Amazon Bedrock AgentCore Gateway Construct
 *
 * エージェントと外部サービス間の統合ポイントとなるGatewayを作成します。
 */
export class AgentCoreGateway extends Construct {
  /**
   * 作成された Gateway インスタンス
   */
  public readonly gateway: agentcore.Gateway;

  /**
   * Gateway の ARN
   */
  public readonly gatewayArn: string;

  /**
   * Gateway の ID
   */
  public readonly gatewayId: string;

  /**
   * Gateway のエンドポイント URL
   */
  public readonly gatewayEndpoint: string;

  /**
   * Gateway 用の IAM ロール
   */
  public readonly gatewayRole: iam.Role;

  constructor(scope: Construct, id: string, props: AgentCoreGatewayProps) {
    super(scope, id);

    // プロトコル設定（MCP）
    const protocolConfiguration = new agentcore.McpProtocolConfiguration({
      instructions: props.mcpConfig?.instructions || 'このGatewayを使用してMCPツールに接続します',
      searchType: props.mcpConfig?.searchType || agentcore.McpGatewaySearchType.SEMANTIC,
      supportedVersions: props.mcpConfig?.supportedVersions || [
        agentcore.MCPProtocolVersion.MCP_2025_03_26,
      ],
    });

    // 認証設定
    let authorizerConfiguration: agentcore.IGatewayAuthorizerConfig | undefined;

    switch (props.authType) {
      case 'iam':
        authorizerConfiguration = agentcore.GatewayAuthorizer.usingAwsIam();
        break;

      case 'jwt':
        if (!props.jwtConfig?.discoveryUrl) {
          throw new Error('JWT認証を使用する場合、discoveryUrlが必要です');
        }
        authorizerConfiguration = agentcore.GatewayAuthorizer.usingCustomJwt({
          discoveryUrl: props.jwtConfig.discoveryUrl,
          allowedAudience: props.jwtConfig.allowedAudience,
          allowedClients: props.jwtConfig.allowedClients,
        });
        break;

      case 'cognito':
      default:
        // 外部で作成されたCognito認証を使用
        if (!props.cognitoAuth) {
          throw new Error('Cognito認証を使用する場合、cognitoAuthが必要です');
        }

        const jwtConfig = props.cognitoAuth.getJwtAuthorizerConfig();
        authorizerConfiguration = agentcore.GatewayAuthorizer.usingCustomJwt({
          discoveryUrl: jwtConfig.discoveryUrl,
          allowedClients: jwtConfig.allowedClients,
        });
        break;
    }

    // Gateway作成（L2 Constructがセキュアなロールを内部で作成）
    this.gateway = new agentcore.Gateway(this, 'Gateway', {
      gatewayName: props.gatewayName,
      description: props.description,
      protocolConfiguration: protocolConfiguration,
      authorizerConfiguration: authorizerConfiguration,
    });

    // L2 Constructが作成したロールに必要な権限を追加
    // IRole を Role にキャストしてaddToPolicyメソッドを使用できるようにする
    const gatewayRole = this.gateway.role as iam.Role;

    // GetGateway 権限
    gatewayRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'GetGateway',
        effect: iam.Effect.ALLOW,
        actions: ['bedrock-agentcore:GetGateway'],
        resources: [`arn:aws:bedrock-agentcore:${Aws.REGION}:${Aws.ACCOUNT_ID}:gateway/*`],
      })
    );

    // GetWorkloadAccessToken 権限
    gatewayRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'GetWorkloadAccessToken',
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock-agentcore:GetWorkloadAccessToken',
          'bedrock-agentcore:GetWorkloadAccessTokenForJWT',
        ],
        resources: [
          `arn:aws:bedrock-agentcore:${Aws.REGION}:${Aws.ACCOUNT_ID}:workload-identity-directory/*`,
        ],
      })
    );

    // GetResourceOauth2Token 権限
    gatewayRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'GetResourceOauth2Token',
        effect: iam.Effect.ALLOW,
        actions: ['bedrock-agentcore:GetResourceOauth2Token'],
        resources: [
          `arn:aws:bedrock-agentcore:${Aws.REGION}:${Aws.ACCOUNT_ID}:token-vault/*`,
          `arn:aws:bedrock-agentcore:${Aws.REGION}:${Aws.ACCOUNT_ID}:workload-identity-directory/*`,
        ],
      })
    );

    // GetSecretValue 権限
    gatewayRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'GetSecretValue',
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [`arn:aws:secretsmanager:${Aws.REGION}:${Aws.ACCOUNT_ID}:secret:*`],
      })
    );

    // L2 Constructが作成したロールを公開
    this.gatewayRole = gatewayRole;

    this.gatewayArn = this.gateway.gatewayArn;
    this.gatewayId = this.gateway.gatewayId;
    this.gatewayEndpoint = this.gateway.gatewayUrl || '';
  }

  /**
   * 基本的なGatewayを作成します。
   * ターゲットの追加は、直接 gateway プロパティを使用してください。
   *
   * 例:
   * gateway.gateway.addLambdaTarget("MyTarget", {
   *   gatewayTargetName: "MyTarget",
   *   lambdaFunction: myFunction,
   *   toolSchema: myToolSchema
   * });
   */
}
