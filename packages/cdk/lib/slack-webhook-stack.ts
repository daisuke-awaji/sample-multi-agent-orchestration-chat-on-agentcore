import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';

export interface SlackWebhookStackProps extends cdk.StackProps {
  /**
   * Slack Signing Secret name in Secrets Manager
   * The secret should contain only the signing secret string (not JSON)
   */
  readonly slackSigningSecretName: string;

  /**
   * Resource name prefix (optional)
   * @default 'slack-webhook'
   */
  readonly resourcePrefix?: string;

  /**
   * Lambda timeout (optional)
   * @default 30 seconds
   */
  readonly timeout?: cdk.Duration;

  /**
   * Lambda memory size (optional)
   * @default 256 MB
   */
  readonly memorySize?: number;

  /**
   * Log retention period (optional)
   * @default 14 days
   */
  readonly logRetentionDays?: number;
}

/**
 * Slack Webhook to EventBridge Stack
 *
 * Independent CDK stack that receives Slack webhook events
 * and forwards them to EventBridge default bus.
 *
 * Architecture:
 *   Slack → API Gateway (HTTP API) → Lambda → EventBridge (default bus)
 */
export class SlackWebhookStack extends cdk.Stack {
  /**
   * The API Gateway HTTP API endpoint URL
   */
  public readonly webhookUrl: string;

  /**
   * The Lambda function
   */
  public readonly lambdaFunction: nodejs.NodejsFunction;

  /**
   * The API Gateway HTTP API
   */
  public readonly httpApi: apigatewayv2.HttpApi;

  constructor(scope: Construct, id: string, props: SlackWebhookStackProps) {
    super(scope, id, props);

    const resourcePrefix = props.resourcePrefix || 'slack-webhook';
    const logRetentionDays = props.logRetentionDays || 14;

    // Reference the Slack Signing Secret from Secrets Manager
    const signingSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'SlackSigningSecret',
      props.slackSigningSecretName
    );

    // Create Lambda function
    this.lambdaFunction = new nodejs.NodejsFunction(this, 'WebhookHandler', {
      functionName: `${resourcePrefix}-handler`,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, '../../slack-webhook/src/index.ts'),
      handler: 'handler',
      timeout: props.timeout || cdk.Duration.seconds(30),
      memorySize: props.memorySize || 256,
      description: 'Receives Slack webhooks and forwards to EventBridge',
      environment: {
        NODE_ENV: 'production',
        SLACK_SIGNING_SECRET_NAME: props.slackSigningSecretName,
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node22',
        format: nodejs.OutputFormat.ESM,
        mainFields: ['module', 'main'],
        esbuildArgs: {
          '--conditions': 'module',
        },
      },
      logRetention: logRetentionDays as logs.RetentionDays,
    });

    // Grant Lambda permission to read Slack Signing Secret
    signingSecret.grantRead(this.lambdaFunction);

    // Grant Lambda permission to put events to EventBridge default bus
    this.lambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['events:PutEvents'],
        resources: [`arn:aws:events:${this.region}:${this.account}:event-bus/default`],
      })
    );

    // Create HTTP API (API Gateway v2)
    this.httpApi = new apigatewayv2.HttpApi(this, 'HttpApi', {
      apiName: `${resourcePrefix}-api`,
      description: 'Slack Webhook to EventBridge HTTP API',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigatewayv2.CorsHttpMethod.POST],
        allowHeaders: ['Content-Type', 'X-Slack-Request-Timestamp', 'X-Slack-Signature'],
      },
    });

    // Add POST /slack/events route
    const lambdaIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'LambdaIntegration',
      this.lambdaFunction
    );

    this.httpApi.addRoutes({
      path: '/slack/events',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: lambdaIntegration,
    });

    this.webhookUrl = `${this.httpApi.apiEndpoint}/slack/events`;

    // Outputs
    new cdk.CfnOutput(this, 'WebhookUrl', {
      value: this.webhookUrl,
      description: 'Slack Webhook URL - Use this in Slack Event Subscriptions',
      exportName: `${resourcePrefix}-webhook-url`,
    });

    new cdk.CfnOutput(this, 'LambdaFunctionName', {
      value: this.lambdaFunction.functionName,
      description: 'Lambda function name',
      exportName: `${resourcePrefix}-lambda-name`,
    });

    new cdk.CfnOutput(this, 'HttpApiId', {
      value: this.httpApi.httpApiId,
      description: 'HTTP API ID',
      exportName: `${resourcePrefix}-api-id`,
    });
  }
}
