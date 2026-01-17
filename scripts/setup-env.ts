#!/usr/bin/env node
/**
 * CloudFormation スタック出力から環境変数を取得し、各パッケージの .env ファイルを生成
 *
 * パターンA: ローカル開発モード
 * - Frontend は localhost の Backend/Agent に接続
 * - Backend/Agent は AWS リソース（Cognito, Memory, Gateway, S3）に接続
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
}

const STACK_NAME = process.env.STACK_NAME || 'AgentCoreApp';
const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * Cognito App ClientからClient Secretを取得
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
    console.warn('⚠️  Machine User Client Secretの取得に失敗しました:', error);
    return undefined;
  }
}

async function getStackOutputs(): Promise<StackOutputs> {
  const client = new CloudFormationClient({});

  try {
    console.log(`📡 CloudFormation スタック出力を取得中: ${STACK_NAME}`);

    const command = new DescribeStacksCommand({
      StackName: STACK_NAME,
    });

    const response = await client.send(command);
    const stack = response.Stacks?.[0];

    if (!stack) {
      throw new Error(`スタックが見つかりません: ${STACK_NAME}`);
    }

    const outputs: StackOutputs = {};

    for (const output of stack.Outputs || []) {
      const key = output.OutputKey;
      const value = output.OutputValue;

      if (key && value) {
        outputs[key as keyof StackOutputs] = value;
      }
    }

    console.log('✅ スタック出力の取得完了');
    return outputs;
  } catch (error) {
    if (error instanceof Error) {
      console.error('❌ スタック出力の取得に失敗しました:', error.message);
      console.error('\n📝 確認事項:');
      console.error(`  1. スタック名が正しいか: ${STACK_NAME}`);
      console.error('  2. AWS認証情報が設定されているか');
      console.error('  3. スタックがデプロイされているか');
      console.error('\n💡 スタック名を指定する場合: STACK_NAME=YourStackName npm run setup-env\n');
    }
    throw error;
  }
}

function createFrontendEnv(outputs: StackOutputs): string {
  return `# Cognito Configuration
VITE_COGNITO_USER_POOL_ID=${outputs.UserPoolId || ''}
VITE_COGNITO_CLIENT_ID=${outputs.UserPoolClientId || ''}
VITE_AWS_REGION=${outputs.Region || ''}

# Backend API Configuration (ローカル開発モード)
VITE_BACKEND_URL=http://localhost:3000

# Agent API Configuration (ローカル開発モード)
VITE_AGENT_ENDPOINT=http://localhost:8080/invocations

# 注: ローカル開発モードでは Backend/Agent をローカルで起動する必要があります
# クラウド接続モードを使用する場合は以下をコメント解除してください:
# VITE_BACKEND_URL=${outputs.BackendApiUrl || ''}
# VITE_AGENT_ENDPOINT=${outputs.RuntimeInvocationEndpoint || ''}
`;
}

function createBackendEnv(outputs: StackOutputs): string {
  return `# Backend API Server Configuration

# サーバー
PORT=3000
NODE_ENV=development

# CORS設定
CORS_ALLOWED_ORIGINS=*

# JWT / JWKS
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

# Nova Canvas Region (画像生成用)
NOVA_CANVAS_REGION=us-east-1

# AgentCore Memory
AGENTCORE_MEMORY_ID=${outputs.MemoryId || ''}

# AgentCore Gateway
AGENTCORE_GATEWAY_ENDPOINT=${outputs.GatewayMcpEndpoint || ''}

# User Storage
USER_STORAGE_BUCKET_NAME=${outputs.UserStorageBucketName || ''}

# Sessions Table
SESSIONS_TABLE_NAME=${outputs.SessionsTableName || ''}

# Server Configuration
PORT=8080
NODE_ENV=development
`;
}

function createTriggerEnv(
  outputs: StackOutputs,
  machineUserClientSecret?: string
): string {
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

function createTestScriptEnv(
  outputs: StackOutputs,
  machineUserClientSecret?: string
): string {
  return `# Machine User Test Script Configuration
# このファイルは自動生成されました

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

  // ディレクトリが存在しない場合は作成
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // .env ファイルを書き込み
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`✅ ${packageName} の .env ファイルを生成しました: ${filePath}`);
}

async function main() {
  try {
    console.log('🚀 環境変数セットアップを開始します...\n');

    // スタック出力を取得
    const outputs = await getStackOutputs();

    // 必須項目のチェック
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
      console.warn('\n⚠️  警告: 以下の出力が見つかりません:');
      missingOutputs.forEach((key) => console.warn(`  - ${key}`));
      console.warn('\n一部の機能が動作しない可能性があります。\n');
    }

    // 各パッケージの .env ファイルを生成
    console.log('\n📝 .env ファイルを生成中...\n');

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

    // Machine User のクレデンシャルを取得
    let clientSecret: string | undefined;
    if (outputs.MachineUserClientId && outputs.UserPoolId && outputs.Region) {
      console.log('\n🔐 Machine User 認証情報を取得中...\n');

      clientSecret = await getMachineUserClientSecret(
        outputs.UserPoolId,
        outputs.MachineUserClientId,
        outputs.Region
      );

      if (clientSecret) {
        console.log('✅ Machine User Client Secret を取得しました\n');
      } else {
        console.warn('⚠️  Machine User Client Secret の取得に失敗しました\n');
      }
    }

    // Trigger パッケージの .env ファイルを生成（トリガー機能が有効な場合）
    if (outputs.TriggersTableName && outputs.TriggerLambdaArn) {
      await writeEnvFile(
        path.join(PROJECT_ROOT, 'packages/trigger/.env'),
        createTriggerEnv(outputs, clientSecret),
        'Trigger'
      );
    }

    // Machine User テストスクリプト用 .env を生成
    if (outputs.MachineUserClientId && outputs.UserPoolId && outputs.Region) {

      if (clientSecret) {
        await writeEnvFile(
          path.join(PROJECT_ROOT, 'scripts/test-machine-user.env'),
          createTestScriptEnv(outputs, clientSecret),
          'Machine User Test Script'
        );
        console.log('✅ Machine User テストスクリプト用の .env ファイルを生成しました');
        console.log(
          '   ⚠️  セキュリティ: .env ファイルには機密情報が含まれています。Gitにコミットしないでください\n'
        );
      } else {
        console.warn(
          '⚠️  Machine User Client Secret の取得に失敗しました。手動で設定してください。\n'
        );
        await writeEnvFile(
          path.join(PROJECT_ROOT, 'scripts/test-machine-user.env'),
          createTestScriptEnv(outputs),
          'Machine User Test Script (without secret)'
        );
      }
    }

    console.log('\n✨ セットアップが完了しました！\n');
    console.log('📌 次のステップ:');
    console.log('  1. Frontend を起動: npm run frontend:dev');
    console.log('  2. Backend を起動: npm run backend:dev');
    console.log('  3. Agent を起動: npm run agent:dev');
    console.log('\nまたは、全て一度に起動する場合:');
    console.log('  npm run dev\n');
  } catch (error) {
    if (error instanceof Error) {
      console.error('\n❌ セットアップに失敗しました:', error.message);
    } else {
      console.error('\n❌ セットアップに失敗しました\n');
    }
    process.exit(1);
  }
}

main();
