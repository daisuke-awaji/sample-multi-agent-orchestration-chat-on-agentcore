import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as agentcore from '@aws-cdk/aws-bedrock-agentcore-alpha';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Tool Schema ファイルの型定義
 * AgentCore の型と互換性を保つため unknown を使用
 */
interface ToolSchemaFile {
  tools: unknown[];
}

export interface AgentCoreLambdaTargetProps {
  /**
   * リソース名のプレフィックス（オプション）
   * Lambda関数名: {resourcePrefix}-{targetName}-function
   * @default 'agentcore'
   */
  readonly resourcePrefix?: string;

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

  /**
   * Knowledge Base への Retrieve 権限を付与するかどうか (オプション)
   * @default false
   */
  readonly enableKnowledgeBaseAccess?: boolean;
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
    // AgentCore の型と互換性を保つため any にキャスト
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.toolSchema = agentcore.ToolSchema.fromInline(toolSchemaContent.tools as any);

    // リソースプレフィックスの取得
    const resourcePrefix = props.resourcePrefix || 'agentcore';

    // Lambda 関数を作成
    this.lambdaFunction = new nodejs.NodejsFunction(this, 'Function', {
      functionName: `${resourcePrefix}-${props.targetName}-function`,
      runtime: props.runtime || lambda.Runtime.NODEJS_22_X,
      // nosemgrep: path-join-resolve-traversal - lambdaCodePath is a CDK build-time configuration, not user input
      entry: path.join(props.lambdaCodePath, 'src', 'handler.ts'),
      handler: 'handler',
      timeout: props.timeout ? cdk.Duration.seconds(props.timeout) : cdk.Duration.seconds(30),
      memorySize: props.memorySize || 256,
      description: props.description || `AgentCore Gateway Target: ${props.targetName}`,
      environment: {
        NODE_ENV: 'production',
        ...props.environment,
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'es2022',
        externalModules: ['aws-sdk', '@aws-sdk/client-bedrock-agent-runtime'],
      },
    });

    // Lambda のログ出力設定
    this.lambdaFunction.addEnvironment('AWS_LAMBDA_LOG_LEVEL', 'INFO');

    // Knowledge Base への Retrieve 権限を付与
    if (props.enableKnowledgeBaseAccess) {
      this.lambdaFunction.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['bedrock:Retrieve'],
          resources: [
            `arn:aws:bedrock:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:knowledge-base/*`,
          ],
        })
      );
    }
  }

  /**
   * Tool Schema ファイルを読み込む
   */
  private loadToolSchema(schemaPath: string): ToolSchemaFile {
    try {
      // nosemgrep: path-join-resolve-traversal - schemaPath is a CDK build-time configuration, not user input
      const fullPath = path.resolve(schemaPath);
      const schemaContent = fs.readFileSync(fullPath, 'utf8');
      const schema = JSON.parse(schemaContent) as ToolSchemaFile;

      // Tool Schema の構造を検証
      if (!schema.tools || !Array.isArray(schema.tools)) {
        throw new Error("Tool schema must have a 'tools' array");
      }

      return schema;
    } catch (error) {
      throw new Error(`Failed to load tool schema from ${schemaPath}: ${error}`);
    }
  }

  /**
   * Gateway にこの Lambda Target を追加
   */
  public addToGateway(gateway: agentcore.Gateway, targetId: string): agentcore.GatewayTarget {
    const target = gateway.addLambdaTarget(targetId, {
      gatewayTargetName: this.targetName,
      lambdaFunction: this.lambdaFunction,
      toolSchema: this.toolSchema,
      description: `Lambda target for ${this.targetName}`,
    });

    // CDK L2 が grantInvoke を呼ぶが、依存関係が設定されていないため
    // GatewayTarget が Gateway ロールに依存するよう明示的に設定
    target.node.addDependency(gateway.role);

    return target;
  }
}
