import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as agentcore from '@aws-cdk/aws-bedrock-agentcore-alpha';
import { Construct } from 'constructs';
import { AgentCoreLambdaTarget } from './constructs/agentcore';
import { EnvironmentConfig } from '../config';

export interface AgentCoreGatewayTargetStackProps extends cdk.StackProps {
  /**
   * Environment configuration
   */
  readonly envConfig: EnvironmentConfig;

  /**
   * Gateway ARN (direct specification)
   * Takes precedence over coreStackName import.
   */
  readonly gatewayArn?: string;

  /**
   * Gateway ID (required when gatewayArn is specified)
   */
  readonly gatewayId?: string;

  /**
   * Gateway Name (required when gatewayArn is specified)
   */
  readonly gatewayName?: string;

  /**
   * Gateway Role ARN (required when gatewayArn is specified)
   */
  readonly gatewayRoleArn?: string;

  /**
   * AgentCoreStack name to import Gateway attributes from via Fn::ImportValue
   * Used when gatewayArn is not directly specified.
   */
  readonly coreStackName?: string;
}

/**
 * AgentCore Gateway Target Stack
 *
 * Independently deployable stack for managing Gateway targets (Lambda Tools, etc.).
 *
 * This stack is separated from the core AgentCoreStack to split the deployment unit,
 * enabling each target to be added, updated, or removed independently without
 * affecting core infrastructure (Gateway, Cognito, Runtime, Storage, etc.).
 *
 * Gateway connection methods:
 * - coreStackName: Cross-stack reference via Fn::ImportValue (same account/region)
 * - Direct attributes (gatewayArn, gatewayId, etc.): Connect to externally managed Gateways
 */
export class AgentCoreGatewayTargetStack extends cdk.Stack {
  /**
   * Utility Tools Lambda Target
   */
  public readonly utilityToolsTarget: AgentCoreLambdaTarget;

  /**
   * Athena Tools Lambda Target
   */
  public readonly athenaToolsTarget: AgentCoreLambdaTarget;

  /**
   * S3 bucket for Athena query results
   */
  public readonly athenaOutputBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: AgentCoreGatewayTargetStackProps) {
    super(scope, id, props);

    const envConfig = props.envConfig;
    const resourcePrefix = envConfig.resourcePrefix;

    // Resolve Gateway attributes (direct specification or cross-stack import)
    const gatewayArn = props.gatewayArn || this.importValue(props.coreStackName, 'GatewayArn');
    const gatewayId = props.gatewayId || this.importValue(props.coreStackName, 'GatewayId');
    const gatewayName = props.gatewayName || this.importValue(props.coreStackName, 'GatewayName');
    const gatewayRoleArn =
      props.gatewayRoleArn || this.importValue(props.coreStackName, 'GatewayRoleArn');

    // Import Gateway using L2 fromGatewayAttributes
    const importedGateway = agentcore.Gateway.fromGatewayAttributes(this, 'ImportedGateway', {
      gatewayArn,
      gatewayId,
      gatewayName,
      role: iam.Role.fromRoleArn(this, 'ImportedGatewayRole', gatewayRoleArn),
    });

    // ── Utility Tools Target ──
    this.utilityToolsTarget = new AgentCoreLambdaTarget(this, 'UtilityToolsTarget', {
      resourcePrefix,
      targetName: 'utility-tools',
      description: 'Lambda function providing utility tools',
      lambdaCodePath: 'packages/lambda-tools/tools/utility-tools',
      toolSchemaPath: 'packages/lambda-tools/tools/utility-tools/tool-schema.json',
      timeout: 30,
      memorySize: 256,
      environment: { LOG_LEVEL: 'INFO' },
    });
    this.utilityToolsTarget.addToImportedGateway(importedGateway, 'UtilityToolsGatewayTarget');
    this.utilityToolsTarget.lambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:Retrieve'],
        resources: [`arn:aws:bedrock:${this.region}:${this.account}:knowledge-base/*`],
      })
    );

    // ── Athena Tools Target ──

    // Create S3 bucket for Athena query results
    this.athenaOutputBucket = new s3.Bucket(this, 'AthenaOutputBucket', {
      bucketName: `${resourcePrefix}-athena-output-${this.account}-${this.region}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [{ expiration: cdk.Duration.days(7) }],
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    this.athenaToolsTarget = new AgentCoreLambdaTarget(this, 'AthenaToolsTarget', {
      resourcePrefix,
      targetName: 'athena-tools',
      description: 'Lambda function providing Athena S3 query tools',
      lambdaCodePath: 'packages/lambda-tools/tools/athena-tools',
      toolSchemaPath: 'packages/lambda-tools/tools/athena-tools/tool-schema.json',
      timeout: 180,
      memorySize: 512,
      environment: {
        LOG_LEVEL: 'INFO',
        ATHENA_WORKGROUP: 'primary',
        ATHENA_OUTPUT_BUCKET: this.athenaOutputBucket.bucketName,
        ALLOWED_DATABASES: '*',
        ALLOWED_TABLES: '*',
      },
    });
    this.athenaToolsTarget.addToImportedGateway(importedGateway, 'AthenaToolsGatewayTarget');

    // Athena query execution permissions (all workgroups)
    this.athenaToolsTarget.lambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'athena:StartQueryExecution',
          'athena:GetQueryExecution',
          'athena:GetQueryResults',
          'athena:StopQueryExecution',
        ],
        resources: [`arn:aws:athena:${this.region}:${this.account}:workgroup/*`],
      })
    );

    // Glue Data Catalog read permissions (all databases and tables)
    this.athenaToolsTarget.lambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'glue:GetDatabase',
          'glue:GetDatabases',
          'glue:GetTable',
          'glue:GetTables',
          'glue:GetPartitions',
        ],
        resources: [
          `arn:aws:glue:${this.region}:${this.account}:catalog`,
          `arn:aws:glue:${this.region}:${this.account}:database/*`,
          `arn:aws:glue:${this.region}:${this.account}:table/*/*`,
        ],
      })
    );

    // S3 read permissions for all source data buckets
    this.athenaToolsTarget.lambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject', 's3:ListBucket', 's3:GetBucketLocation'],
        resources: ['*'],
      })
    );

    // Athena query results S3 permissions (output bucket)
    this.athenaOutputBucket.grantReadWrite(this.athenaToolsTarget.lambdaFunction);

    // Athena Tools outputs
    new cdk.CfnOutput(this, 'AthenaToolsLambdaArn', {
      value: this.athenaToolsTarget.lambdaFunction.functionArn,
      description: 'Athena Tools Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'AthenaToolsLambdaName', {
      value: this.athenaToolsTarget.lambdaFunction.functionName,
      description: 'Athena Tools Lambda Function Name',
    });

    new cdk.CfnOutput(this, 'AthenaOutputBucketName', {
      value: this.athenaOutputBucket.bucketName,
      description: 'S3 Bucket for Athena query results',
    });

    // CloudFormation outputs
    new cdk.CfnOutput(this, 'GatewayArn', {
      value: gatewayArn,
      description: 'Connected AgentCore Gateway ARN',
    });

    new cdk.CfnOutput(this, 'UtilityToolsLambdaArn', {
      value: this.utilityToolsTarget.lambdaFunction.functionArn,
      description: 'Utility Tools Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'UtilityToolsLambdaName', {
      value: this.utilityToolsTarget.lambdaFunction.functionName,
      description: 'Utility Tools Lambda Function Name',
    });

    // Tags
    cdk.Tags.of(this).add('Project', 'AgentCore');
    cdk.Tags.of(this).add('Component', 'GatewayTargets');
  }

  /**
   * Import a value from another stack's CfnOutput exports
   */
  private importValue(coreStackName: string | undefined, outputKey: string): string {
    if (!coreStackName) {
      throw new Error(
        `Either direct Gateway attributes or coreStackName must be provided. Missing value for: ${outputKey}`
      );
    }
    return cdk.Fn.importValue(`${coreStackName}-${outputKey}`);
  }
}
