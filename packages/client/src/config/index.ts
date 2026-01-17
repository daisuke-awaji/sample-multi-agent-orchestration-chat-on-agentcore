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

export interface MachineUserConfig {
  cognitoDomain: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
  targetUserId: string;
}

export type AuthMode = 'user' | 'machine';

export interface ClientConfig {
  endpoint: string;
  isAwsRuntime: boolean;
  authMode: AuthMode;
  cognito: CognitoConfig;
  machineUser?: MachineUserConfig;
}

/**
 * 設定表示用の型
 */
export interface ConfigDisplayFormat {
  endpoint: string;
  runtime: string;
  authMode: string;
  cognito: {
    userPoolId: string;
    clientId: string;
    username: string;
    password: string;
    region: string;
  };
  machineUser?: {
    cognitoDomain: string;
    clientId: string;
    clientSecret: string;
    scope?: string;
    targetUserId: string;
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
 * 認証モードを決定
 */
function determineAuthMode(): AuthMode {
  const mode = process.env.AUTH_MODE?.toLowerCase();
  if (mode === 'machine') {
    return 'machine';
  }
  return 'user';
}

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
  const authMode = determineAuthMode();

  const config: ClientConfig = {
    endpoint,
    isAwsRuntime: isAwsRuntime(endpoint),
    authMode,
    cognito: {
      userPoolId: process.env.COGNITO_USER_POOL_ID || DEFAULT_COGNITO_CONFIG.userPoolId,
      clientId: process.env.COGNITO_CLIENT_ID || DEFAULT_COGNITO_CONFIG.clientId,
      username: process.env.COGNITO_USERNAME || DEFAULT_COGNITO_CONFIG.username,
      password: process.env.COGNITO_PASSWORD || DEFAULT_COGNITO_CONFIG.password,
      region: process.env.COGNITO_REGION || DEFAULT_COGNITO_CONFIG.region,
    },
  };

  // マシンユーザーモードの場合は追加設定を読み込み
  if (authMode === 'machine') {
    config.machineUser = {
      cognitoDomain: process.env.COGNITO_DOMAIN || '',
      clientId: process.env.MACHINE_CLIENT_ID || '',
      clientSecret: process.env.MACHINE_CLIENT_SECRET || '',
      scope: process.env.COGNITO_SCOPE,
      targetUserId: process.env.TARGET_USER_ID || '',
    };
  }

  return config;
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

  if (config.authMode === 'machine') {
    // マシンユーザーモードの検証
    if (!config.machineUser?.cognitoDomain) {
      errors.push('COGNITO_DOMAIN が設定されていません');
    }
    if (!config.machineUser?.clientId) {
      errors.push('MACHINE_CLIENT_ID が設定されていません');
    }
    if (!config.machineUser?.clientSecret) {
      errors.push('MACHINE_CLIENT_SECRET が設定されていません');
    }
    if (!config.machineUser?.targetUserId) {
      errors.push('TARGET_USER_ID が設定されていません');
    }
  } else if (config.isAwsRuntime) {
    // ユーザー認証モードの検証
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
  const display: ConfigDisplayFormat = {
    endpoint: config.endpoint,
    runtime: config.isAwsRuntime ? 'AWS AgentCore Runtime' : 'ローカル環境',
    authMode:
      config.authMode === 'machine' ? 'Machine User (Client Credentials)' : 'User (Password)',
    cognito: {
      userPoolId: config.cognito.userPoolId,
      clientId: config.cognito.clientId,
      username: config.cognito.username,
      password: config.cognito.password ? '*'.repeat(8) : '<未設定>',
      region: config.cognito.region,
    },
  };

  if (config.authMode === 'machine' && config.machineUser) {
    display.machineUser = {
      cognitoDomain: config.machineUser.cognitoDomain,
      clientId: config.machineUser.clientId,
      clientSecret: config.machineUser.clientSecret ? '*'.repeat(8) : '<未設定>',
      scope: config.machineUser.scope,
      targetUserId: config.machineUser.targetUserId,
    };
  }

  return display;
}
