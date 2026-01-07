#!/usr/bin/env node
/**
 * CloudFormation スタック出力から環境変数を取得し、各パッケージの .env ファイルを生成
 *
 * パターンA: ローカル開発モード
 * - Frontend は localhost の Backend/Agent に接続
 * - Backend/Agent は AWS リソース（Cognito, Memory, Gateway, S3）に接続
 */

import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import * as fs from 'fs';
import * as path from 'path';

interface StackOutputs {
  Region?: string;
  UserPoolId?: string;
  UserPoolClientId?: string;
  BackendApiUrl?: string;
  RuntimeInvocationEndpoint?: string;
  MemoryId?: string;
  GatewayMcpEndpoint?: string;
  UserStorageBucketName?: string;
  AgentsTableName?: string;
  SessionsTableName?: string;
}

const STACK_NAME = process.env.STACK_NAME || 'AgentCoreApp';
const PROJECT_ROOT = path.resolve(__dirname, '..');

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
