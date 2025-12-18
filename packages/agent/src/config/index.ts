import dotenv from "dotenv";
import { z } from "zod";

// 環境変数を読み込み
dotenv.config();

/**
 * 環境変数のスキーマ定義
 */
const envSchema = z.object({
  // AWS Configuration
  AWS_REGION: z.string().default("us-east-1"),
  AWS_PROFILE: z.string().optional(),

  // AgentCore Gateway Configuration
  AGENTCORE_GATEWAY_ENDPOINT: z.string().url(),

  // Bedrock Configuration
  BEDROCK_MODEL_ID: z
    .string()
    .default("anthropic.claude-sonnet-4-5-20250929-v1:0"),
  BEDROCK_REGION: z.string().default("us-east-1"),

  // Debug Configuration
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  DEBUG_MCP: z
    .string()
    .default("false")
    .transform((val) => val === "true"),
});

/**
 * 設定の型定義
 */
export type Config = z.infer<typeof envSchema>;

/**
 * 環境変数をパース・バリデーション
 */
function parseEnv(): Config {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.issues
        .map((issue) => issue.path.join("."))
        .join(", ");
      throw new Error(`必要な環境変数が設定されていません: ${missingVars}`);
    }
    throw error;
  }
}

/**
 * アプリケーション設定
 */
export const config = parseEnv();

/**
 * ロギング設定
 */
export const logger = {
  debug: (...args: unknown[]) => {
    if (config.LOG_LEVEL === "debug") {
      console.log("[DEBUG]", new Date().toISOString(), ...args);
    }
  },
  info: (...args: unknown[]) => {
    if (["debug", "info"].includes(config.LOG_LEVEL)) {
      console.log("[INFO]", new Date().toISOString(), ...args);
    }
  },
  warn: (...args: unknown[]) => {
    if (["debug", "info", "warn"].includes(config.LOG_LEVEL)) {
      console.warn("[WARN]", new Date().toISOString(), ...args);
    }
  },
  error: (...args: unknown[]) => {
    console.error("[ERROR]", new Date().toISOString(), ...args);
  },
};

/**
 * 設定値を検証・表示
 */
export function validateConfig(): void {
  logger.info("設定値検証開始");

  logger.debug("設定値:", config);
  logger.info("設定値検証完了");
}
