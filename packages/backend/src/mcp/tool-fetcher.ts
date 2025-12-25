/**
 * MCP サーバーからツール一覧を取得するユーティリティ
 */
import { MCPConfig } from './types.js';
import { getEnabledMCPServers } from './config-loader.js';
import { createMCPClients } from './client-factory.js';

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
 * MCP ツール情報の型定義
 */
export interface MCPToolInfo {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  serverName: string; // どのサーバーのツールか識別用
}

/**
 * MCP 設定からツール一覧を取得
 *
 * @param mcpConfig MCP サーバー設定
 * @param logger ロガー（省略時はコンソール）
 * @returns ツール情報の配列
 */
export async function fetchToolsFromMCPConfig(
  mcpConfig: MCPConfig,
  logger: Logger = defaultLogger
): Promise<MCPToolInfo[]> {
  const servers = getEnabledMCPServers(mcpConfig);
  const clients = createMCPClients(servers, logger);
  const allTools: MCPToolInfo[] = [];

  for (let i = 0; i < clients.length; i++) {
    const client = clients[i];
    const serverName = servers[i].name;

    try {
      logger.info(`🔍 ツール取得開始: ${serverName}`);
      const tools = await client.listTools();

      for (const tool of tools) {
        const toolWithSchema = tool as {
          name: string;
          description?: string;
          inputSchema?: Record<string, unknown>;
          input_schema?: Record<string, unknown>;
        };

        allTools.push({
          name: toolWithSchema.name,
          description: toolWithSchema.description,
          inputSchema: toolWithSchema.inputSchema || toolWithSchema.input_schema || {},
          serverName,
        });
      }

      logger.info(`✅ ツール取得成功: ${serverName} (${tools.length}件)`);
    } catch (error) {
      logger.error(`❌ ツール取得失敗 (${serverName}):`, error);
      // エラーが発生してもスキップして続行（他のサーバーのツールは取得）
    }
  }

  return allTools;
}
