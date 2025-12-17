import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as agentcore from "@aws-cdk/aws-bedrock-agentcore-alpha";
import * as path from "path";
import * as fs from "fs";

export interface AgentCoreLambdaTargetProps {
  /**
   * Target の名前
   */
  readonly targetName: string;

  /**
   * Target の説明 (オプション)
   */
  readonly description?: string;

  /**
   * Lambda 関数のソースコードディレクトリ
   * 相対パス（プロジェクトルートからの）
   */
  readonly lambdaCodePath: string;

  /**
   * Tool Schema ファイルのパス
   * 相対パス（プロジェクトルートからの）
   */
  readonly toolSchemaPath: string;

  /**
   * Lambda ランタイム (オプション)
   * @default - Runtime.NODEJS_20_X
   */
  readonly runtime?: lambda.Runtime;

  /**
   * Lambda のタイムアウト時間 (オプション)
   * @default - 30秒
   */
  readonly timeout?: number;

  /**
   * Lambda のメモリサイズ (オプション)
   * @default - 256MB
   */
  readonly memorySize?: number;

  /**
   * 環境変数 (オプション)
   */
  readonly environment?: { [key: string]: string };
}

/**
 * AgentCore Gateway Lambda Target Construct
 *
 * Lambda 関数を AgentCore Gateway のターゲットとして追加するための Construct
 */
export class AgentCoreLambdaTarget extends Construct {
  /**
   * 作成された Lambda 関数
   */
  public readonly lambdaFunction: nodejs.NodejsFunction;

  /**
   * Tool Schema
   */
  public readonly toolSchema: agentcore.ToolSchema;

  /**
   * Target 名
   */
  public readonly targetName: string;

  constructor(scope: Construct, id: string, props: AgentCoreLambdaTargetProps) {
    super(scope, id);

    this.targetName = props.targetName;

    // Tool Schema を読み込み
    const toolSchemaContent = this.loadToolSchema(props.toolSchemaPath);
    this.toolSchema = agentcore.ToolSchema.fromInline(toolSchemaContent.tools);

    // Lambda 関数を作成
    this.lambdaFunction = new nodejs.NodejsFunction(this, "Function", {
      functionName: `agentcore-${props.targetName}-function`,
      runtime: props.runtime || lambda.Runtime.NODEJS_20_X,
      entry: path.join(props.lambdaCodePath, "src", "handler.ts"),
      handler: "handler",
      timeout: props.timeout
        ? cdk.Duration.seconds(props.timeout)
        : cdk.Duration.seconds(30),
      memorySize: props.memorySize || 256,
      description:
        props.description || `AgentCore Gateway Target: ${props.targetName}`,
      environment: {
        NODE_ENV: "production",
        ...props.environment,
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: "es2022",
        externalModules: ["aws-sdk"],
      },
    });

    // Lambda のログ出力設定
    this.lambdaFunction.addEnvironment("AWS_LAMBDA_LOG_LEVEL", "INFO");
  }

  /**
   * Tool Schema ファイルを読み込む
   */
  private loadToolSchema(schemaPath: string): any {
    try {
      const fullPath = path.resolve(schemaPath);
      const schemaContent = fs.readFileSync(fullPath, "utf8");
      const schema = JSON.parse(schemaContent);

      // Tool Schema の構造を検証
      if (!schema.tools || !Array.isArray(schema.tools)) {
        throw new Error("Tool schema must have a 'tools' array");
      }

      return schema;
    } catch (error) {
      throw new Error(
        `Failed to load tool schema from ${schemaPath}: ${error}`
      );
    }
  }

  /**
   * Gateway にこの Lambda Target を追加
   */
  public addToGateway(
    gateway: agentcore.Gateway,
    targetId: string
  ): agentcore.GatewayTarget {
    return gateway.addLambdaTarget(targetId, {
      gatewayTargetName: this.targetName,
      lambdaFunction: this.lambdaFunction,
      toolSchema: this.toolSchema,
      description: `Lambda target for ${this.targetName}`,
    });
  }
}
