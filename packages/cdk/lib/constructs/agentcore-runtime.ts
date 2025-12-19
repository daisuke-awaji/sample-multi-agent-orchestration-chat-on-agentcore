/**
 * Amazon Bedrock AgentCore Runtime Construct
 * Strands Agent を AgentCore Runtime にデプロイするための CDK Construct
 */

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as agentcore from '@aws-cdk/aws-bedrock-agentcore-alpha';
import { RuntimeAuthorizerConfiguration } from '@aws-cdk/aws-bedrock-agentcore-alpha';
import { Construct } from 'constructs';
import * as path from 'path';
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

    const agentCodePath = props.agentCodePath || path.join(__dirname, '../../../agent');

    // Agent Runtime Artifact を作成
    const agentRuntimeArtifact = agentcore.AgentRuntimeArtifact.fromAsset(agentCodePath);

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

    // IAM ポリシーを追加
    this.runtime.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: [
          'arn:aws:bedrock:*::foundation-model/*',
          `arn:aws:bedrock:${props.region || 'us-east-1'}:${
            cdk.Stack.of(this).account
          }:inference-profile/*`,
        ],
      })
    );

    // CloudWatch Logs へのアクセス権限を追加
    this.runtime.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: [
          `arn:aws:logs:${props.region || 'us-east-1'}:${
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
