/**
 * mcp.json 設定ファイルの読み込みと検証
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';
import type { MCPConfig, MCPServerConfig } from './types.js';
import { MCPConfigError } from './types.js';

/**
 * ロガー関数の型定義
 */
interface Logger {
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
  debug?: (message: string, ...args: unknown[]) => void;
}

/**
 * デフォルトロガー（console を使用）
 */
const defaultLogger: Logger = {
  info: console.log,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

/**
 * Zod スキーマ定義
 */
const MCPServerBaseSchema = z.object({
  enabled: z.boolean().optional().default(true),
  prefix: z.string().optional(),
});

const StdioMCPServerSchema = z
  .object({
    transport: z.literal('stdio'),
    command: z.string().min(1, 'command は必須です'),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
  })
  .merge(MCPServerBaseSchema);

const HttpMCPServerSchema = z
  .object({
    transport: z.literal('http'),
    url: z.string().url('url は有効なURLである必要があります'),
    headers: z.record(z.string(), z.string()).optional(),
  })
  .merge(MCPServerBaseSchema);

const SseMCPServerSchema = z
  .object({
    transport: z.literal('sse'),
    url: z.string().url('url は有効なURLである必要があります'),
    headers: z.record(z.string(), z.string()).optional(),
  })
  .merge(MCPServerBaseSchema);

const MCPServerConfigSchema = z.union([
  StdioMCPServerSchema,
  HttpMCPServerSchema,
  SseMCPServerSchema,
]);

const MCPConfigSchema = z.object({
  mcpServers: z.record(z.string(), MCPServerConfigSchema),
});

/**
 * 環境変数を展開
 * ${VAR_NAME} 形式の文字列を process.env.VAR_NAME に置換
 */
function expandEnvVars(value: string, logger: Logger = defaultLogger): string {
  return value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    const envValue = process.env[varName];
    if (envValue === undefined) {
      logger.warn(`環境変数 ${varName} が定義されていません: ${match}`);
      return match; // 置換せずに元の文字列を返す
    }
    return envValue;
  });
}

/**
 * オブジェクト内の全ての文字列値に対して環境変数を展開
 */
function expandEnvVarsInObject<T>(obj: T, logger: Logger = defaultLogger): T {
  if (typeof obj === 'string') {
    return expandEnvVars(obj, logger) as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => expandEnvVarsInObject(item, logger)) as T;
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = expandEnvVarsInObject(value, logger);
    }
    return result as T;
  }
  return obj;
}

/**
 * MCPサーバー設定にtransportフィールドを自動推測して追加
 * - commandがあれば stdio
 * - urlがあれば http (デフォルト)
 */
function inferTransport(serverConfig: Record<string, unknown>): Record<string, unknown> {
  // 既にtransportが指定されている場合はそのまま
  if (serverConfig.transport) {
    return serverConfig;
  }

  // commandがあればstdio
  if (serverConfig.command) {
    console.debug('transport を自動推測: stdio (command フィールドが存在)');
    return { ...serverConfig, transport: 'stdio' };
  }

  // urlがあればhttp (デフォルト、将来的にSSE判定を追加可能)
  if (serverConfig.url) {
    console.debug('transport を自動推測: http (url フィールドが存在)');
    return { ...serverConfig, transport: 'http' };
  }

  // どちらもない場合はそのまま（Zodバリデーションでエラーになる）
  return serverConfig;
}

/**
 * mcp.json 設定ファイルを読み込み
 *
 * @param configPath 設定ファイルのパス (省略時は環境変数 MCP_CONFIG_PATH または ./mcp.json)
 * @param logger ロガー（省略時はコンソール）
 * @returns MCPConfig オブジェクト、またはファイルが存在しない場合は null
 */
export function loadMCPConfig(
  configPath?: string,
  logger: Logger = defaultLogger
): MCPConfig | null {
  // 設定ファイルパスの決定
  const path = configPath || process.env.MCP_CONFIG_PATH || resolve(process.cwd(), 'mcp.json');

  // ファイルの存在チェック
  if (!existsSync(path)) {
    logger.info(`MCP設定ファイルが見つかりません: ${path}`);
    return null;
  }

  try {
    logger.info(`MCP設定ファイルを読み込み中: ${path}`);

    // ファイル読み込み
    const content = readFileSync(path, 'utf-8');
    const rawConfig = JSON.parse(content);

    // 環境変数を展開
    const expandedConfig = expandEnvVarsInObject(rawConfig, logger);

    // transport を自動推測
    if (expandedConfig.mcpServers) {
      for (const [serverName, serverConfig] of Object.entries(expandedConfig.mcpServers)) {
        expandedConfig.mcpServers[serverName] = inferTransport(
          serverConfig as Record<string, unknown>
        );
      }
    }

    // Zod でバリデーション
    const validatedConfig = MCPConfigSchema.parse(expandedConfig) as MCPConfig;

    // 有効なサーバー数を確認
    const enabledServers = Object.entries(validatedConfig.mcpServers).filter(
      ([, serverConfig]) => serverConfig.enabled !== false
    );

    logger.info(
      `✅ MCP設定を読み込みました: ${Object.keys(validatedConfig.mcpServers).length}個のサーバー定義 (有効: ${enabledServers.length}個)`
    );

    return validatedConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
      throw new MCPConfigError(`MCP設定のバリデーションエラー:\n${issues.join('\n')}`, error);
    }

    if (error instanceof SyntaxError) {
      throw new MCPConfigError(`MCP設定のJSON解析エラー: ${error.message}`, error);
    }

    throw new MCPConfigError(
      `MCP設定の読み込みに失敗: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * 有効なMCPサーバー設定のみを抽出
 * transport が未指定の場合は自動推測を適用
 */
export function getEnabledMCPServers(config: MCPConfig): Array<{
  name: string;
  config: MCPServerConfig;
}> {
  return Object.entries(config.mcpServers)
    .filter(([, serverConfig]) => serverConfig.enabled !== false)
    .map(([name, serverConfig]) => ({
      name,
      config: inferTransport(
        serverConfig as unknown as Record<string, unknown>
      ) as unknown as MCPServerConfig,
    }));
}
