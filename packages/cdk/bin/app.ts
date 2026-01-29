#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AgentCoreStack } from '../lib/agentcore-stack';
import { getEnvironmentConfig, Environment } from '../config';

const app = new cdk.App();

// Get environment from Context (default: default)
const envContext = app.node.tryGetContext('env') as Environment | undefined;
const envName: Environment = envContext || 'default';

// Get environment configuration
const envConfig = getEnvironmentConfig(envName);

// Stack name: DonutsAgentCoreApp (default), DonutsAgentCoreAppDev, DonutsAgentCoreAppStg, DonutsAgentCoreAppPrd, DonutsAgentCoreAppPr123
let stackName: string;
if (!envContext) {
  stackName = 'DonutsAgentCoreApp';
} else if (envName.startsWith('pr-')) {
  // PR environment: DonutsAgentCoreAppPr123
  const prNumber = envName.replace('pr-', '');
  stackName = `DonutsAgentCoreAppPr${prNumber}`;
} else {
  // Standard environment: capitalize first letter
  stackName = `DonutsAgentCoreApp${envName.charAt(0).toUpperCase() + envName.slice(1)}`;
}

// Create stack
new AgentCoreStack(app, stackName, {
  env: {
    account: envConfig.awsAccount || process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  envConfig: envConfig,
  tavilyApiKeySecretName: envConfig.tavilyApiKeySecretName,
  description: `Amazon Bedrock AgentCore - ${envName.toUpperCase()} environment`,
  terminationProtection: envConfig.deletionProtection,
});

// Output environment information
console.log(`🚀 Deploying AgentCore Stack for environment: ${envName}`);
console.log(`📦 Stack Name: ${stackName}`);
console.log(`🌍 Region: ${process.env.CDK_DEFAULT_REGION || 'not set (will use AWS_REGION)'}`);
console.log(`🔒 Deletion Protection: ${envConfig.deletionProtection ? 'ENABLED' : 'DISABLED'}`);
