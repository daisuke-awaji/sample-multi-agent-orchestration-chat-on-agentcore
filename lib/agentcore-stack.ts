import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { AgentCoreGateway } from "./constructs/agentcore-gateway";
import { AgentCoreLambdaTarget } from "./constructs/agentcore-lambda-target";

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
  readonly authType?: "cognito" | "iam" | "jwt";

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
   * 作成された AgentCore Gateway
   */
  public readonly gateway: AgentCoreGateway;

  /**
   * 作成された Echo Tool Lambda Target
   */
  public readonly echoToolTarget: AgentCoreLambdaTarget;

  constructor(scope: Construct, id: string, props?: AgentCoreStackProps) {
    super(scope, id, props);

    // Gateway名の設定
    const gatewayName = props?.gatewayName || "default-gateway";

    // AgentCore Gateway の作成
    this.gateway = new AgentCoreGateway(this, "AgentCoreGateway", {
      gatewayName: gatewayName,
      description:
        props?.gatewayDescription || `AgentCore Gateway - ${gatewayName}`,
      authType: props?.authType || "cognito",
      jwtConfig: props?.jwtConfig,
      mcpConfig: {
        instructions:
          "このGatewayを使用してAgentCoreツールと外部サービス間の統合を行います。Echo/Ping ツールが利用可能です。",
      },
    });

    // Echo Tool Lambda Target の作成
    this.echoToolTarget = new AgentCoreLambdaTarget(this, "EchoToolTarget", {
      targetName: "echo-tool",
      description: "Echo/Ping ツールを提供するLambda関数",
      lambdaCodePath: "lambda/echo-tool",
      toolSchemaPath: "lambda/echo-tool/tool-schema.json",
      timeout: 30,
      memorySize: 256,
      environment: {
        LOG_LEVEL: "INFO",
      },
    });

    // Gateway に Lambda Target を追加
    const echoTarget = this.echoToolTarget.addToGateway(
      this.gateway.gateway,
      "EchoToolGatewayTarget"
    );

    // CloudFormation出力
    new cdk.CfnOutput(this, "GatewayArn", {
      value: this.gateway.gatewayArn,
      description: "AgentCore Gateway ARN",
      exportName: `${id}-GatewayArn`,
    });

    new cdk.CfnOutput(this, "GatewayId", {
      value: this.gateway.gatewayId,
      description: "AgentCore Gateway ID",
      exportName: `${id}-GatewayId`,
    });

    new cdk.CfnOutput(this, "EchoToolLambdaArn", {
      value: this.echoToolTarget.lambdaFunction.functionArn,
      description: "Echo Tool Lambda Function ARN",
      exportName: `${id}-EchoToolLambdaArn`,
    });

    new cdk.CfnOutput(this, "EchoToolLambdaName", {
      value: this.echoToolTarget.lambdaFunction.functionName,
      description: "Echo Tool Lambda Function Name",
      exportName: `${id}-EchoToolLambdaName`,
    });

    // Cognito User Pool の情報を出力
    if (this.gateway.gateway.authorizerConfiguration) {
      // Cognito User Pool が作成されている場合の出力
      // Note: Gateway の内部実装により、Cognito User Pool の ARN/ID にアクセスする方法が必要
      // 現在のAPIでは直接アクセスできないため、Gateway IDから推測または手動確認が必要
    }

    new cdk.CfnOutput(this, "GatewayMcpEndpoint", {
      value: `https://${this.gateway.gatewayId}.gateway.bedrock-agentcore.${this.region}.amazonaws.com/mcp`,
      description: "AgentCore Gateway MCP Endpoint",
      exportName: `${id}-GatewayMcpEndpoint`,
    });

    new cdk.CfnOutput(this, "CognitoInstructions", {
      value:
        "Cognito User Pool ID と Client ID は AWS コンソールで確認してください。Gateway ID: " +
        this.gateway.gatewayId,
      description: "Cognito 設定確認のための指示",
    });

    // タグの追加
    cdk.Tags.of(this).add("Project", "AgentCore");
    cdk.Tags.of(this).add("Component", "Gateway");
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
