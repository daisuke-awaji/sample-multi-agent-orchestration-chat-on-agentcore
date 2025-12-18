/**
 * Configuration Management
 * 設定ファイルと環境変数の管理
 */

import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file
config({ path: path.resolve(__dirname, '../../.env') });

export interface CognitoConfig {
  userPoolId: string;
  clientId: string;
  username: string;
  password: string;
  region: string;
}

export interface ClientConfig {
  endpoint: string;
  isAwsRuntime: boolean;
  cognito: CognitoConfig;
}

/**
 * 設定表示用の型
 */
export interface ConfigDisplayFormat {
  endpoint: string;
  runtime: string;
  cognito: {
    userPoolId: string;
    clientId: string;
    username: string;
    password: string;
    region: string;
  };
}

/**
 * デフォルト設定
 */
const DEFAULT_COGNITO_CONFIG: CognitoConfig = {
  userPoolId: 'us-east-1_OZ6KUvSn3',
  clientId: '19duob1sqr877jesho69aildbn',
  username: 'testuser',
  password: 'TestPassword123!',
  region: 'us-east-1',
};

/**
 * エンドポイントを決定する優先順位:
 * 1. AGENTCORE_RUNTIME_ARN が設定されている場合 -> AWS AgentCore Runtime
 * 2. AGENTCORE_ENDPOINT が設定されている場合 -> カスタムエンドポイント
 * 3. どちらも設定されていない場合 -> デフォルト (localhost:8080)
 */
function determineEndpoint(): string {
  // 優先順位1: Runtime ARN が指定されている場合（AWS AgentCore Runtime）
  if (process.env.AGENTCORE_RUNTIME_ARN) {
    return buildAgentCoreEndpoint(
      process.env.AGENTCORE_RUNTIME_ARN,
      process.env.AGENTCORE_REGION || 'us-east-1'
    );
  }

  // 優先順位2: カスタムエンドポイント
  if (process.env.AGENTCORE_ENDPOINT) {
    return process.env.AGENTCORE_ENDPOINT;
  }

  // 優先順位3: デフォルト（localhost）
  return 'http://localhost:8080';
}

/**
 * AWS Runtime かどうかを判定
 */
function isAwsRuntime(endpoint: string): boolean {
  return endpoint.includes('bedrock-agentcore') && endpoint.includes('/invocations');
}

/**
 * 環境変数から設定を読み込み
 */
export function loadConfig(): ClientConfig {
  const endpoint = determineEndpoint();

  return {
    endpoint,
    isAwsRuntime: isAwsRuntime(endpoint),
    cognito: {
      userPoolId: process.env.COGNITO_USER_POOL_ID || DEFAULT_COGNITO_CONFIG.userPoolId,
      clientId: process.env.COGNITO_CLIENT_ID || DEFAULT_COGNITO_CONFIG.clientId,
      username: process.env.COGNITO_USERNAME || DEFAULT_COGNITO_CONFIG.username,
      password: process.env.COGNITO_PASSWORD || DEFAULT_COGNITO_CONFIG.password,
      region: process.env.COGNITO_REGION || DEFAULT_COGNITO_CONFIG.region,
    },
  };
}

/**
 * Runtime ARN から AgentCore エンドポイントを構築
 * ARN を URL エンコードして正しいエンドポイント URL を生成
 */
export function buildAgentCoreEndpoint(runtimeArn: string, region: string = 'us-east-1'): string {
  const encodedArn = encodeURIComponent(runtimeArn);
  return `https://bedrock-agentcore.${region}.amazonaws.com/runtimes/${encodedArn}/invocations?qualifier=DEFAULT`;
}

/**
 * 設定値の検証
 */
export function validateConfig(config: ClientConfig): string[] {
  const errors: string[] = [];

  if (!config.endpoint) {
    errors.push('エンドポイントが設定されていません');
  }

  if (config.isAwsRuntime) {
    if (!config.cognito.userPoolId) {
      errors.push('Cognito User Pool ID が設定されていません');
    }
    if (!config.cognito.clientId) {
      errors.push('Cognito Client ID が設定されていません');
    }
    if (!config.cognito.username) {
      errors.push('Cognito Username が設定されていません');
    }
    if (!config.cognito.password) {
      errors.push('Cognito Password が設定されていません');
    }
  }

  return errors;
}

/**
 * 設定の表示用フォーマット
 */
export function formatConfigForDisplay(config: ClientConfig): ConfigDisplayFormat {
  return {
    endpoint: config.endpoint,
    runtime: config.isAwsRuntime ? 'AWS AgentCore Runtime' : 'ローカル環境',
    cognito: {
      userPoolId: config.cognito.userPoolId,
      clientId: config.cognito.clientId,
      username: config.cognito.username,
      password: config.cognito.password ? '*'.repeat(8) : '<未設定>',
      region: config.cognito.region,
    },
  };
}
