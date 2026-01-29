import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as agentcore from '@aws-cdk/aws-bedrock-agentcore-alpha';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Tool Schema file type definition
 * Using unknown to maintain compatibility with AgentCore types
 */
interface ToolSchemaFile {
  tools: unknown[];
}

export interface AgentCoreLambdaTargetProps {
  /**
   * Resource name prefix (optional)
   * Lambda function name: {resourcePrefix}-{targetName}-function
   * @default 'agentcore'
   */
  readonly resourcePrefix?: string;

  /**
   * Target name
   */
  readonly targetName: string;

  /**
   * Target description (optional)
   */
  readonly description?: string;

  /**
   * Lambda function source code directory
   * Relative path (from project root)
   */
  readonly lambdaCodePath: string;

  /**
   * Tool Schema file path
   * Relative path (from project root)
   */
  readonly toolSchemaPath: string;

  /**
   * Lambda runtime (optional)
   * @default Runtime.NODEJS_20_X
   */
  readonly runtime?: lambda.Runtime;

  /**
   * Lambda timeout duration (optional)
   * @default 30 seconds
   */
  readonly timeout?: number;

  /**
   * Lambda memory size (optional)
   * @default 256MB
   */
  readonly memorySize?: number;

  /**
   * Environment variables (optional)
   */
  readonly environment?: { [key: string]: string };

  /**
   * Whether to grant Retrieve permission to Knowledge Base (optional)
   * @default false
   */
  readonly enableKnowledgeBaseAccess?: boolean;
}

/**
 * AgentCore Gateway Lambda Target Construct
 *
 * Construct for adding Lambda functions as targets to AgentCore Gateway
 */
export class AgentCoreLambdaTarget extends Construct {
  /**
   * Created Lambda function
   */
  public readonly lambdaFunction: nodejs.NodejsFunction;

  /**
   * Tool Schema
   */
  public readonly toolSchema: agentcore.ToolSchema;

  /**
   * Target name
   */
  public readonly targetName: string;

  constructor(scope: Construct, id: string, props: AgentCoreLambdaTargetProps) {
    super(scope, id);

    this.targetName = props.targetName;

    // Load Tool Schema
    const toolSchemaContent = this.loadToolSchema(props.toolSchemaPath);
    // Cast to any to maintain compatibility with AgentCore types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.toolSchema = agentcore.ToolSchema.fromInline(toolSchemaContent.tools as any);

    // Get resource prefix
    const resourcePrefix = props.resourcePrefix || 'agentcore';

    // Create Lambda function
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

    // Lambda log output settings
    this.lambdaFunction.addEnvironment('AWS_LAMBDA_LOG_LEVEL', 'INFO');

    // Grant Retrieve permission to Knowledge Base
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
   * Load Tool Schema file
   */
  private loadToolSchema(schemaPath: string): ToolSchemaFile {
    try {
      // nosemgrep: path-join-resolve-traversal - schemaPath is a CDK build-time configuration, not user input
      const fullPath = path.resolve(schemaPath);
      const schemaContent = fs.readFileSync(fullPath, 'utf8');
      const schema = JSON.parse(schemaContent) as ToolSchemaFile;

      // Validate Tool Schema structure
      if (!schema.tools || !Array.isArray(schema.tools)) {
        throw new Error("Tool schema must have a 'tools' array");
      }

      return schema;
    } catch (error) {
      throw new Error(`Failed to load tool schema from ${schemaPath}: ${error}`);
    }
  }

  /**
   * Add this Lambda Target to Gateway
   */
  public addToGateway(gateway: agentcore.Gateway, targetId: string): agentcore.GatewayTarget {
    const target = gateway.addLambdaTarget(targetId, {
      gatewayTargetName: this.targetName,
      lambdaFunction: this.lambdaFunction,
      toolSchema: this.toolSchema,
      description: `Lambda target for ${this.targetName}`,
    });

    // CDK L2 calls grantInvoke but dependency is not set,
    // so explicitly set GatewayTarget to depend on Gateway role
    target.node.addDependency(gateway.role);

    return target;
  }
}
