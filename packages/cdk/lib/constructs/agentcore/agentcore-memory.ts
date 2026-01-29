import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as agentcore from '@aws-cdk/aws-bedrock-agentcore-alpha';
import { Construct } from 'constructs';

export interface AgentCoreMemoryProps {
  /**
   * Memory name
   * Only letters, numbers, and underscores are allowed
   */
  readonly memoryName: string;

  /**
   * Memory description (optional)
   */
  readonly description?: string;

  /**
   * Short-term memory expiration period (days)
   * Specify between 7 and 365 days
   * @default 90 days
   */
  readonly expirationDuration?: cdk.Duration;

  /**
   * Long-term memory extraction strategies
   * @default none (short-term memory only)
   */
  readonly memoryStrategies?: agentcore.IMemoryStrategy[];

  /**
   * KMS key for encryption (optional)
   * If not specified, AWS managed key is used
   */
  readonly kmsKey?: kms.IKey;

  /**
   * IAM role for Memory execution (optional)
   * If not specified, a role with CloudWatch Logs permissions is auto-generated
   */
  readonly executionRole?: iam.IRole;

  /**
   * Tags (optional)
   */
  readonly tags?: { [key: string]: string };

  /**
   * Whether to use built-in strategies when creating Memory
   * If true, automatically adds Semantic strategy
   * Extracts general facts, concepts, and meanings from conversations using vector embeddings for similarity search
   * @default false
   */
  readonly useBuiltInStrategies?: boolean;

  /**
   * Whether to auto-create executionRole
   * If true, auto-generates an IAM role with CloudWatch Logs permissions
   * @default true
   */
  readonly createExecutionRole?: boolean;
}

/**
 * Amazon Bedrock AgentCore Memory Construct
 *
 * Provides persistence of conversation history and context management.
 * Supports both short-term and long-term memory, allowing AI agents to
 * remember past conversations and provide consistent responses.
 */
export class AgentCoreMemory extends Construct {
  /**
   * Created Memory instance
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
   * Memory name
   */
  public readonly memoryName: string;

  constructor(scope: Construct, id: string, props: AgentCoreMemoryProps) {
    super(scope, id);

    // Set default values
    const expirationDuration = props.expirationDuration || cdk.Duration.days(90);
    const createExecutionRole = props.createExecutionRole ?? true;
    let memoryStrategies = props.memoryStrategies;

    // Use built-in strategies if specified
    if (props.useBuiltInStrategies && !memoryStrategies) {
      memoryStrategies = [
        agentcore.MemoryStrategy.usingSemantic({
          name: 'semantic_memory_strategy',
          namespaces: ['/strategies/{memoryStrategyId}/actors/{actorId}'],
          description:
            'Semantic memory strategy - extracts general facts, concepts, and meanings from conversations',
        }),
      ];
    }

    // Determine executionRole
    let executionRole = props.executionRole;
    if (!executionRole && createExecutionRole) {
      executionRole = this.createExecutionRole(props.memoryName);
    }

    // Create Memory
    this.memory = new agentcore.Memory(this, 'Memory', {
      memoryName: props.memoryName,
      description: props.description,
      expirationDuration: expirationDuration,
      memoryStrategies: memoryStrategies,
      kmsKey: props.kmsKey,
      executionRole: executionRole,
      tags: props.tags,
    });

    // Set properties
    this.memoryId = this.memory.memoryId;
    this.memoryArn = this.memory.memoryArn;
    this.memoryName = props.memoryName;
  }

  /**
   * Grant read permissions to the specified IAM principal for Memory
   */
  public grantRead(grantee: iam.IGrantable): iam.Grant {
    return this.memory.grantRead(grantee);
  }

  /**
   * Grant specific Action permissions to the specified IAM principal
   */
  public grant(grantee: iam.IGrantable, ...actions: string[]): iam.Grant {
    return this.memory.grant(grantee, ...actions);
  }

  /**
   * Grant permissions required for AgentCore Memory operations
   * Policy for use with TypeScript Agent Runtime
   */
  public grantAgentCoreAccess(grantee: iam.IGrantable): iam.Grant {
    return iam.Grant.addToPrincipal({
      grantee,
      actions: [
        'bedrock-agentcore:CreateEvent',
        'bedrock-agentcore:ListEvents',
        'bedrock-agentcore:DeleteEvent',
        'bedrock-agentcore:GetMemory',
        'bedrock-agentcore:ListMemoryStrategies', // Long-term memory: list strategies
        'bedrock-agentcore:RetrieveMemory', // Long-term memory: semantic search
        'bedrock-agentcore:RetrieveMemoryRecords', // Long-term memory: retrieve records (required)
      ],
      resourceArns: [this.memoryArn],
    });
  }

  /**
   * Get Memory configuration as environment variables
   */
  public getEnvironmentVariables(): { [key: string]: string } {
    return {
      AGENTCORE_MEMORY_ID: this.memoryId,
    };
  }

  /**
   * Create executionRole with CloudWatch Logs permissions
   * @param memoryName Memory name (used as part of role name)
   * @returns Created IAM Role
   */
  private createExecutionRole(memoryName: string): iam.Role {
    const executionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com'),
      description: `Execution role for AgentCore Memory: ${memoryName} in ${cdk.Stack.of(this).region}`,
    });

    // Add CloudWatch Logs permissions
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
