#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SlackWebhookStack } from '../lib/slack-webhook-stack';

const app = new cdk.App();

// Get configuration from context or environment variables
const slackSigningSecretName =
  app.node.tryGetContext('slackSigningSecretName') ||
  process.env.SLACK_SIGNING_SECRET_NAME ||
  'agentcore/slack-signing-secret';

const resourcePrefix =
  app.node.tryGetContext('resourcePrefix') || process.env.RESOURCE_PREFIX || 'slack-webhook';

const region = app.node.tryGetContext('region') || process.env.AWS_REGION || 'ap-northeast-1';

// Create the stack
new SlackWebhookStack(app, 'SlackWebhookStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: region,
  },
  slackSigningSecretName,
  resourcePrefix,
  description: 'Slack Webhook to EventBridge integration stack',
});

console.log('🔗 Deploying Slack Webhook Stack');
console.log(`📦 Resource Prefix: ${resourcePrefix}`);
console.log(`🔐 Slack Signing Secret: ${slackSigningSecretName}`);
console.log(`🌍 Region: ${region}`);
