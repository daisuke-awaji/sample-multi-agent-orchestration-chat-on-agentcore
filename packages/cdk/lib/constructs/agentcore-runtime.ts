/**
 * Amazon Bedrock AgentCore Runtime Construct
 * Strands Agent を AgentCore Runtime にデプロイするための CDK Construct
 */

import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as agentcore from "@aws-cdk/aws-bedrock-agentcore-alpha";
import { Construct } from "constructs";
import * as path from "path";

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

    const agentCodePath =
      props.agentCodePath || path.join(__dirname, "../../../agent");

    // Agent Runtime Artifact を作成
    const agentRuntimeArtifact =
      agentcore.AgentRuntimeArtifact.fromAsset(agentCodePath);

    // AgentCore Runtime を作成
    this.runtime = new agentcore.Runtime(this, "Runtime", {
      runtimeName: props.runtimeName,
      agentRuntimeArtifact: agentRuntimeArtifact,
      description:
        props.description || `Strands Agent Runtime: ${props.runtimeName}`,
    });

    // IAM ポリシーを追加
    this.runtime.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
        ],
        resources: [
          "arn:aws:bedrock:*::foundation-model/*",
          `arn:aws:bedrock:${props.region || "us-east-1"}:${
            cdk.Stack.of(this).account
          }:inference-profile/*`,
        ],
      })
    );

    // CloudWatch Logs へのアクセス権限を追加
    this.runtime.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ],
        resources: [
          `arn:aws:logs:${props.region || "us-east-1"}:${
            cdk.Stack.of(this).account
          }:log-group:/aws/bedrock-agentcore/runtimes/${props.runtimeName}*`,
        ],
      })
    );

    // プロパティを設定
    this.runtimeArn = this.runtime.agentRuntimeArn;
    this.runtimeId = this.runtime.agentRuntimeId;
  }
}
