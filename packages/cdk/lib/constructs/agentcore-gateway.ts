import { Construct } from "constructs";
import * as agentcore from "@aws-cdk/aws-bedrock-agentcore-alpha";

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
  readonly authType?: "cognito" | "iam" | "jwt";

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

  constructor(scope: Construct, id: string, props: AgentCoreGatewayProps) {
    super(scope, id);

    // プロトコル設定（MCP）
    const protocolConfiguration = new agentcore.McpProtocolConfiguration({
      instructions:
        props.mcpConfig?.instructions ||
        "このGatewayを使用してMCPツールに接続します",
      searchType:
        props.mcpConfig?.searchType || agentcore.McpGatewaySearchType.SEMANTIC,
      supportedVersions: props.mcpConfig?.supportedVersions || [
        agentcore.MCPProtocolVersion.MCP_2025_03_26,
      ],
    });

    // 認証設定
    let authorizerConfiguration: agentcore.IGatewayAuthorizerConfig | undefined;

    switch (props.authType) {
      case "iam":
        authorizerConfiguration = agentcore.GatewayAuthorizer.usingAwsIam();
        break;

      case "jwt":
        if (!props.jwtConfig?.discoveryUrl) {
          throw new Error("JWT認証を使用する場合、discoveryUrlが必要です");
        }
        authorizerConfiguration = agentcore.GatewayAuthorizer.usingCustomJwt({
          discoveryUrl: props.jwtConfig.discoveryUrl,
          allowedAudience: props.jwtConfig.allowedAudience,
          allowedClients: props.jwtConfig.allowedClients,
        });
        break;

      case "cognito":
      default:
        // Cognito認証（デフォルト）- 自動的にCognitoユーザープールが作成される
        // authorizerConfigurationを指定しない場合、デフォルトでCognito認証が使用される
        authorizerConfiguration = undefined;
        break;
    }

    // Gateway作成
    this.gateway = new agentcore.Gateway(this, "Gateway", {
      gatewayName: props.gatewayName,
      description: props.description,
      protocolConfiguration: protocolConfiguration,
      authorizerConfiguration: authorizerConfiguration,
    });

    this.gatewayArn = this.gateway.gatewayArn;
    this.gatewayId = this.gateway.gatewayId;
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
