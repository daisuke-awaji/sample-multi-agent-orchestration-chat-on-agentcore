#!/usr/bin/env node
/**
 * Retrieve environment variables from CloudFormation stack outputs
 * and generate .env files for each package.
 *
 * Pattern A: Local Development Mode
 * - Frontend connects to Backend/Agent on localhost
 * - Backend/Agent connects to AWS resources (Cognito, Memory, Gateway, S3)
 */

import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import {
  CognitoIdentityProviderClient,
  DescribeUserPoolClientCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import * as fs from 'fs';
import * as path from 'path';

interface StackOutputs {
  Region?: string;
  UserPoolId?: string;
  UserPoolClientId?: string;
  MachineUserClientId?: string;
  TokenEndpoint?: string;
  DomainPrefix?: string;
  BackendApiUrl?: string;
  RuntimeInvocationEndpoint?: string;
  MemoryId?: string;
  GatewayMcpEndpoint?: string;
  UserStorageBucketName?: string;
  AgentsTableName?: string;
  SessionsTableName?: string;
  TriggersTableName?: string;
  TriggerLambdaArn?: string;
  SchedulerRoleArn?: string;
  EventSourcesConfig?: string;
  AppSyncEventsRealtimeEndpoint?: string;
  AppSyncEventsHttpEndpoint?: string;
}

const STACK_NAME = process.env.STACK_NAME || 'MocaAgentCoreApp';
const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * Retrieve Client Secret from Cognito App Client
 */
async function getMachineUserClientSecret(
  userPoolId: string,
  clientId: string,
  region: string
): Promise<string | undefined> {
  try {
    const client = new CognitoIdentityProviderClient({ region });
    const command = new DescribeUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientId: clientId,
    });

    const response = await client.send(command);
    return response.UserPoolClient?.ClientSecret;
  } catch (error) {
    console.warn('⚠️  Failed to retrieve Machine User Client Secret:', error);
    return undefined;
  }
}

async function getStackOutputs(): Promise<StackOutputs> {
  const client = new CloudFormationClient({});

  try {
    console.log(`📡 Retrieving CloudFormation stack outputs: ${STACK_NAME}`);

    const command = new DescribeStacksCommand({
      StackName: STACK_NAME,
    });

    const response = await client.send(command);
    const stack = response.Stacks?.[0];

    if (!stack) {
      throw new Error(`Stack not found: ${STACK_NAME}`);
    }

    const outputs: StackOutputs = {};

    for (const output of stack.Outputs || []) {
      const key = output.OutputKey;
      const value = output.OutputValue;

      if (key && value) {
        outputs[key as keyof StackOutputs] = value;
      }
    }

    console.log('✅ Stack outputs retrieved successfully');
    return outputs;
  } catch (error) {
    if (error instanceof Error) {
      console.error('❌ Failed to retrieve stack outputs:', error.message);
      console.error('\n📝 Checklist:');
      console.error(`  1. Is the stack name correct? ${STACK_NAME}`);
      console.error('  2. Are AWS credentials configured?');
      console.error('  3. Has the stack been deployed?');
      console.error('\n💡 To specify a stack name: STACK_NAME=YourStackName npm run setup-env\n');
    }
    throw error;
  }
}

function createFrontendEnv(outputs: StackOutputs): string {
  return `# Cognito Configuration
VITE_COGNITO_USER_POOL_ID=${outputs.UserPoolId || ''}
VITE_COGNITO_CLIENT_ID=${outputs.UserPoolClientId || ''}
VITE_AWS_REGION=${outputs.Region || ''}

# Backend API Configuration (Local Development Mode)
VITE_BACKEND_URL=http://localhost:3000

# Agent API Configuration (Local Development Mode)
VITE_AGENT_ENDPOINT=http://localhost:8080/invocations

# AppSync Events Configuration (for real-time session updates)
VITE_APPSYNC_EVENTS_ENDPOINT=${outputs.AppSyncEventsRealtimeEndpoint || ''}

# Note: In local development mode, Backend/Agent must be running locally.
# To use cloud connection mode, uncomment the following:
# VITE_BACKEND_URL=${outputs.BackendApiUrl || ''}
# VITE_AGENT_ENDPOINT=${outputs.RuntimeInvocationEndpoint || ''}
`;
}

function createBackendEnv(outputs: StackOutputs): string {
  return `# Backend API Server Configuration

# Server
PORT=3000
NODE_ENV=development

# CORS
CORS_ALLOWED_ORIGINS=*

# Cognito (required for JWT verification via aws-jwt-verify)
COGNITO_USER_POOL_ID=${outputs.UserPoolId || ''}
COGNITO_REGION=${outputs.Region || ''}

# AgentCore Memory
AGENTCORE_MEMORY_ID=${outputs.MemoryId || ''}
AGENTCORE_GATEWAY_ENDPOINT=${outputs.GatewayMcpEndpoint || ''}

# User Storage
USER_STORAGE_BUCKET_NAME=${outputs.UserStorageBucketName || ''}

# Agents Table
AGENTS_TABLE_NAME=${outputs.AgentsTableName || ''}

# Sessions Table
SESSIONS_TABLE_NAME=${outputs.SessionsTableName || ''}

# AWS Region
AWS_REGION=${outputs.Region || ''}

# Event-Driven Triggers
TRIGGERS_TABLE_NAME=${outputs.TriggersTableName || ''}
TRIGGER_LAMBDA_ARN=${outputs.TriggerLambdaArn || ''}
SCHEDULER_ROLE_ARN=${outputs.SchedulerRoleArn || ''}
SCHEDULE_GROUP_NAME=default

# Event Sources Configuration (JSON)
EVENT_SOURCES_CONFIG=${outputs.EventSourcesConfig || '[]'}
`;
}

function createAgentEnv(outputs: StackOutputs): string {
  return `# Agent Configuration

# AWS Region
AWS_REGION=${outputs.Region || ''}

# Bedrock Model Region
BEDROCK_REGION=${outputs.Region || ''}

# Nova Canvas Region (for image generation)
NOVA_CANVAS_REGION=us-east-1

# AgentCore Memory
AGENTCORE_MEMORY_ID=${outputs.MemoryId || ''}

# AgentCore Gateway
AGENTCORE_GATEWAY_ENDPOINT=${outputs.GatewayMcpEndpoint || ''}

# User Storage
USER_STORAGE_BUCKET_NAME=${outputs.UserStorageBucketName || ''}

# Sessions Table
SESSIONS_TABLE_NAME=${outputs.SessionsTableName || ''}

# AppSync Events (for real-time message sync)
APPSYNC_HTTP_ENDPOINT=${outputs.AppSyncEventsHttpEndpoint || ''}

# Server Configuration
PORT=8080
NODE_ENV=development
`;
}

function createTriggerEnv(outputs: StackOutputs, machineUserClientSecret?: string): string {
  return `# Trigger Lambda Configuration

# AWS Region
AWS_REGION=${outputs.Region || ''}

# Cognito Machine User Authentication
COGNITO_USER_POOL_ID=${outputs.UserPoolId || ''}
COGNITO_CLIENT_ID=${outputs.MachineUserClientId || ''}
COGNITO_CLIENT_SECRET=${machineUserClientSecret || 'YOUR_CLIENT_SECRET_HERE'}

# Agent API Configuration
AGENT_API_URL=${outputs.RuntimeInvocationEndpoint || ''}

# DynamoDB Configuration
TRIGGERS_TABLE_NAME=${outputs.TriggersTableName || ''}
`;
}

function createTestScriptEnv(outputs: StackOutputs, machineUserClientSecret?: string): string {
  return `# Machine User Test Script Configuration
# This file was auto-generated

# AWS Region
AWS_REGION=${outputs.Region || ''}

# Cognito OAuth Configuration
COGNITO_DOMAIN=${outputs.DomainPrefix || ''}.auth.${outputs.Region || ''}.amazoncognito.com
COGNITO_CLIENT_ID=${outputs.MachineUserClientId || ''}
COGNITO_CLIENT_SECRET=${machineUserClientSecret || 'YOUR_CLIENT_SECRET_HERE'}

# Agent API Endpoint (Local Development)
AGENT_ENDPOINT=http://localhost:8080/invocations

# Test Configuration
TARGET_USER_ID=YOUR_USER_ID_HERE

# Optional: Specific Agent ID to test
# AGENT_ID=your-agent-id-here
`;
}

async function writeEnvFile(filePath: string, content: string, packageName: string): Promise<void> {
  const dir = path.dirname(filePath);

  // Create directory if it does not exist
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write .env file
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`✅ Generated .env file for ${packageName}: ${filePath}`);
}

async function main() {
  try {
    console.log('🚀 Starting environment variable setup...\n');

    // Retrieve stack outputs
    const outputs = await getStackOutputs();

    // Check required outputs
    const requiredOutputs: (keyof StackOutputs)[] = [
      'Region',
      'UserPoolId',
      'UserPoolClientId',
      'MemoryId',
      'GatewayMcpEndpoint',
      'UserStorageBucketName',
      'AgentsTableName',
      'SessionsTableName',
    ];

    const missingOutputs = requiredOutputs.filter((key) => !outputs[key]);

    if (missingOutputs.length > 0) {
      console.warn('\n⚠️  Warning: The following outputs were not found:');
      missingOutputs.forEach((key) => console.warn(`  - ${key}`));
      console.warn('\nSome features may not work correctly.\n');
    }

    // Generate .env files for each package
    console.log('\n📝 Generating .env files...\n');

    await writeEnvFile(
      path.join(PROJECT_ROOT, 'packages/frontend/.env'),
      createFrontendEnv(outputs),
      'Frontend'
    );

    await writeEnvFile(
      path.join(PROJECT_ROOT, 'packages/backend/.env'),
      createBackendEnv(outputs),
      'Backend'
    );

    await writeEnvFile(
      path.join(PROJECT_ROOT, 'packages/agent/.env'),
      createAgentEnv(outputs),
      'Agent'
    );

    // Retrieve Machine User credentials
    let clientSecret: string | undefined;
    if (outputs.MachineUserClientId && outputs.UserPoolId && outputs.Region) {
      console.log('\n🔐 Retrieving Machine User credentials...\n');

      clientSecret = await getMachineUserClientSecret(
        outputs.UserPoolId,
        outputs.MachineUserClientId,
        outputs.Region
      );

      if (clientSecret) {
        console.log('✅ Machine User Client Secret retrieved successfully\n');
      } else {
        console.warn('⚠️  Failed to retrieve Machine User Client Secret\n');
      }
    }

    // Generate .env file for Trigger package (if trigger feature is enabled)
    if (outputs.TriggersTableName && outputs.TriggerLambdaArn) {
      await writeEnvFile(
        path.join(PROJECT_ROOT, 'packages/trigger/.env'),
        createTriggerEnv(outputs, clientSecret),
        'Trigger'
      );
    }

    // Generate .env for Machine User test script
    if (outputs.MachineUserClientId && outputs.UserPoolId && outputs.Region) {
      if (clientSecret) {
        await writeEnvFile(
          path.join(PROJECT_ROOT, 'scripts/test-machine-user.env'),
          createTestScriptEnv(outputs, clientSecret),
          'Machine User Test Script'
        );
        console.log('✅ Generated .env file for Machine User test script');
        console.log(
          '   ⚠️  Security: The .env file contains sensitive information. Do not commit it to Git.\n'
        );
      } else {
        console.warn(
          '⚠️  Failed to retrieve Machine User Client Secret. Please configure it manually.\n'
        );
        await writeEnvFile(
          path.join(PROJECT_ROOT, 'scripts/test-machine-user.env'),
          createTestScriptEnv(outputs),
          'Machine User Test Script (without secret)'
        );
      }
    }

    console.log('\n✨ Setup completed!\n');
    console.log('📌 Next steps:');
    console.log('  1. Start Frontend: npm run frontend:dev');
    console.log('  2. Start Backend: npm run backend:dev');
    console.log('  3. Start Agent: npm run agent:dev');
    console.log('\nOr start all at once:');
    console.log('  npm run dev\n');
  } catch (error) {
    if (error instanceof Error) {
      console.error('\n❌ Setup failed:', error.message);
    } else {
      console.error('\n❌ Setup failed\n');
    }
    process.exit(1);
  }
}

main();