import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as agentcore from '@aws-cdk/aws-bedrock-agentcore-alpha';
import { Construct } from 'constructs';

export interface AgentCoreMemoryProps {
  /**
   * Memory の名前
   * 文字、数字、アンダースコアのみ使用可能
   */
  readonly memoryName: string;

  /**
   * Memory の説明 (オプション)
   */
  readonly description?: string;

  /**
   * 短期メモリの有効期限（日数）
   * 7日から365日の間で指定
   * デフォルト: 90日
   */
  readonly expirationDuration?: cdk.Duration;

  /**
   * 長期メモリ抽出戦略
   * デフォルト: なし（短期メモリのみ）
   */
  readonly memoryStrategies?: agentcore.IMemoryStrategy[];

  /**
   * 暗号化用のKMSキー (オプション)
   * 指定しない場合はAWS管理キーを使用
   */
  readonly kmsKey?: kms.IKey;

  /**
   * Memory 実行用のIAMロール (オプション)
   * 指定しない場合は CloudWatch Logs 権限を含むロールを自動生成
   */
  readonly executionRole?: iam.IRole;

  /**
   * タグ (オプション)
   */
  readonly tags?: { [key: string]: string };

  /**
   * Memory作成時に組み込み戦略を使用するかどうか
   * true の場合、Semantic 戦略（セマンティック記憶戦略）を自動で追加
   * 会話から一般的な事実、概念、意味を抽出してベクター埋め込みで類似度検索を行う
   * デフォルト: false
   */
  readonly useBuiltInStrategies?: boolean;

  /**
   * executionRole を自動作成するかどうか
   * true の場合、CloudWatch Logs 権限を含む IAM ロールを自動生成
   * デフォルト: true
   */
  readonly createExecutionRole?: boolean;
}

/**
 * Amazon Bedrock AgentCore Memory Construct
 *
 * 会話履歴の永続化とコンテキストの管理を提供します。
 * 短期メモリと長期メモリの両方をサポートし、AI エージェントが
 * 過去の会話を記憶して一貫性のある応答を提供できます。
 */
export class AgentCoreMemory extends Construct {
  /**
   * 作成された Memory
   */
  public readonly memory: agentcore.Memory;

  /**
   * Memory ID
   */
  public readonly memoryId: string;

  /**
   * Memory ARN
   */
  public readonly memoryArn: string;

  /**
   * Memory 名
   */
  public readonly memoryName: string;

  constructor(scope: Construct, id: string, props: AgentCoreMemoryProps) {
    super(scope, id);

    // デフォルト値の設定
    const expirationDuration = props.expirationDuration || cdk.Duration.days(90);
    const createExecutionRole = props.createExecutionRole ?? true;
    let memoryStrategies = props.memoryStrategies;

    // 組み込み戦略を使用する場合
    if (props.useBuiltInStrategies && !memoryStrategies) {
      memoryStrategies = [
        agentcore.MemoryStrategy.usingSemantic({
          name: 'semantic_memory_strategy',
          namespaces: ['/strategies/{memoryStrategyId}/actors/{actorId}'],
          description: 'セマンティック記憶戦略 - 会話から一般的な事実、概念、意味を抽出',
        }),
      ];
    }

    // executionRole の決定
    let executionRole = props.executionRole;
    if (!executionRole && createExecutionRole) {
      executionRole = this.createExecutionRole(props.memoryName);
    }

    // Memory の作成
    this.memory = new agentcore.Memory(this, 'Memory', {
      memoryName: props.memoryName,
      description: props.description,
      expirationDuration: expirationDuration,
      memoryStrategies: memoryStrategies,
      kmsKey: props.kmsKey,
      executionRole: executionRole,
      tags: props.tags,
    });

    // プロパティの設定
    this.memoryId = this.memory.memoryId;
    this.memoryArn = this.memory.memoryArn;
    this.memoryName = props.memoryName;
  }

  /**
   * 指定されたIAMプリンシパルにMemoryの読み取り権限を付与
   */
  public grantRead(grantee: iam.IGrantable): iam.Grant {
    return this.memory.grantRead(grantee);
  }

  /**
   * 指定されたIAMプリンシパルに特定のAction権限を付与
   */
  public grant(grantee: iam.IGrantable, ...actions: string[]): iam.Grant {
    return this.memory.grant(grantee, ...actions);
  }

  /**
   * AgentCore Memory操作に必要な権限を付与
   * TypeScript Agent Runtime で使用するためのポリシー
   */
  public grantAgentCoreAccess(grantee: iam.IGrantable): iam.Grant {
    return iam.Grant.addToPrincipal({
      grantee,
      actions: [
        'bedrock-agentcore:CreateEvent',
        'bedrock-agentcore:ListEvents',
        'bedrock-agentcore:DeleteEvent',
        'bedrock-agentcore:GetMemory',
      ],
      resourceArns: [this.memoryArn],
    });
  }

  /**
   * Memory設定を環境変数として取得
   */
  public getEnvironmentVariables(): { [key: string]: string } {
    return {
      AGENTCORE_MEMORY_ID: this.memoryId,
      USE_AGENTCORE_MEMORY: 'true',
    };
  }

  /**
   * CloudWatch Logs 権限を含む executionRole を作成
   * @param memoryName Memory名（ロール名の一部として使用）
   * @returns 作成された IAM Role
   */
  private createExecutionRole(memoryName: string): iam.Role {
    const executionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com'),
      description: `Execution role for AgentCore Memory: ${memoryName}`,
      roleName: `AgentCoreMemory-${memoryName}-ExecutionRole`,
    });

    // CloudWatch Logs 権限を追加
    executionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: [
          `arn:aws:logs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:log-group:/aws/bedrock-agentcore/memory/${memoryName}*`,
        ],
      })
    );

    return executionRole;
  }
}
