/**
 * Configuration Management
 * 設定ファイルと環境変数の管理
 */

import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file
config({ path: path.resolve(__dirname, "../../.env") });

export interface CognitoConfig {
  userPoolId: string;
  clientId: string;
  username: string;
  password: string;
  region: string;
}

export interface ClientConfig {
  endpoint: string;
  profile: "local" | "agentcore";
  cognito: CognitoConfig;
}

/**
 * デフォルト設定
 */
const DEFAULT_CONFIG: ClientConfig = {
  endpoint: "http://localhost:8080",
  profile: "local",
  cognito: {
    userPoolId: "us-east-1_OZ6KUvSn3",
    clientId: "19duob1sqr877jesho69aildbn",
    username: "testuser",
    password: "TestPassword123!",
    region: "us-east-1",
  },
};

/**
 * 環境変数から設定を読み込み
 */
export function loadConfig(): ClientConfig {
  // Runtime ARN または Runtime Endpoint が設定されている場合は自動的に agentcore プロファイルを使用
  const hasRuntimeConfig = !!(
    process.env.AGENTCORE_RUNTIME_ARN || process.env.AGENTCORE_RUNTIME_ENDPOINT
  );
  const defaultProfile = hasRuntimeConfig
    ? "agentcore"
    : DEFAULT_CONFIG.profile;

  const profile =
    (process.env.AGENTCORE_PROFILE as "local" | "agentcore") || defaultProfile;

  return {
    endpoint: getEndpointForProfile(profile),
    profile: profile,
    cognito: {
      userPoolId:
        process.env.COGNITO_USER_POOL_ID || DEFAULT_CONFIG.cognito.userPoolId,
      clientId:
        process.env.COGNITO_CLIENT_ID || DEFAULT_CONFIG.cognito.clientId,
      username: process.env.COGNITO_USERNAME || DEFAULT_CONFIG.cognito.username,
      password: process.env.COGNITO_PASSWORD || DEFAULT_CONFIG.cognito.password,
      region: process.env.COGNITO_REGION || DEFAULT_CONFIG.cognito.region,
    },
  };
}

/**
 * Runtime ARN から AgentCore エンドポイントを構築
 * ARN を URL エンコードして正しいエンドポイント URL を生成
 */
export function buildAgentCoreEndpoint(
  runtimeArn: string,
  region: string = "us-east-1"
): string {
  const encodedArn = encodeURIComponent(runtimeArn);
  return `https://bedrock-agentcore.${region}.amazonaws.com/runtimes/${encodedArn}/invocations?qualifier=DEFAULT`;
}

/**
 * プロファイル別のエンドポイントを取得
 */
export function getEndpointForProfile(profile: string): string {
  // 優先順位1: 完全なエンドポイント URL が指定されている場合
  if (process.env.AGENTCORE_RUNTIME_ENDPOINT) {
    return process.env.AGENTCORE_RUNTIME_ENDPOINT;
  }

  // 優先順位2: Runtime ARN が指定されている場合（プロファイルに関係なく AgentCore を使用）
  if (process.env.AGENTCORE_RUNTIME_ARN) {
    return buildAgentCoreEndpoint(
      process.env.AGENTCORE_RUNTIME_ARN,
      process.env.AGENTCORE_REGION || "us-east-1"
    );
  }

  // 優先順位3: プロファイルに基づくデフォルト設定
  switch (profile) {
    case "local":
      return "http://localhost:8080";
    case "agentcore":
      return "https://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/YOUR_RUNTIME_ARN/invocations";
    default:
      return "http://localhost:8080";
  }
}

/**
 * 設定値の検証
 */
export function validateConfig(config: ClientConfig): string[] {
  const errors: string[] = [];

  if (!config.endpoint) {
    errors.push("エンドポイントが設定されていません");
  }

  if (!["local", "agentcore"].includes(config.profile)) {
    errors.push(
      'プロファイルは "local" または "agentcore" である必要があります'
    );
  }

  if (config.profile === "agentcore") {
    if (!config.cognito.userPoolId) {
      errors.push("Cognito User Pool ID が設定されていません");
    }
    if (!config.cognito.clientId) {
      errors.push("Cognito Client ID が設定されていません");
    }
    if (!config.cognito.username) {
      errors.push("Cognito Username が設定されていません");
    }
    if (!config.cognito.password) {
      errors.push("Cognito Password が設定されていません");
    }
  }

  return errors;
}

/**
 * 設定の表示用フォーマット
 */
export function formatConfigForDisplay(
  config: ClientConfig
): Record<string, any> {
  return {
    endpoint: config.endpoint,
    profile: config.profile,
    cognito: {
      userPoolId: config.cognito.userPoolId,
      clientId: config.cognito.clientId,
      username: config.cognito.username,
      password: config.cognito.password ? "*".repeat(8) : "<未設定>",
      region: config.cognito.region,
    },
  };
}
