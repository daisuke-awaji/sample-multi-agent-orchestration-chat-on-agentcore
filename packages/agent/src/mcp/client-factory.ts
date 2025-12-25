/**
 * MCP クライアントファクトリー
 * transport 別に適切な McpClient を生成
 */

import { McpClient } from '@strands-agents/sdk';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { logger } from '../config/index.js';
import type { MCPServerConfig, StdioMCPServer, HttpMCPServer, SseMCPServer } from './types.js';
import { MCPConfigError } from './types.js';

/**
 * stdio トランスポートのクライアントを作成
 */
function createStdioClient(name: string, config: StdioMCPServer): McpClient {
  logger.debug(`stdio MCPクライアントを作成: ${name}`, {
    command: config.command,
    args: config.args,
  });

  // 環境変数のマージ (undefined を除外)
  const mergedEnv = config.env
    ? Object.fromEntries(
        Object.entries({ ...process.env, ...config.env }).filter(([, value]) => value !== undefined)
      )
    : undefined;

  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args || [],
    env: mergedEnv as Record<string, string> | undefined,
  });

  return new McpClient({
    transport: transport as Transport,
    applicationName: `AgentCore-${name}`,
  });
}

/**
 * Streamable HTTP トランスポートのクライアントを作成
 */
function createHttpClient(name: string, config: HttpMCPServer): McpClient {
  logger.debug(`HTTP MCPクライアントを作成: ${name}`, {
    url: config.url,
  });

  try {
    const url = new URL(config.url);
    const transport = new StreamableHTTPClientTransport(url, {
      requestInit: config.headers
        ? {
            headers: config.headers,
          }
        : undefined,
    });

    return new McpClient({
      transport: transport as Transport,
      applicationName: `AgentCore-${name}`,
    });
  } catch (error) {
    throw new MCPConfigError(
      `HTTP MCPクライアントの作成に失敗 (${name}): 無効なURL - ${config.url}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * SSE トランスポートのクライアントを作成
 */
function createSseClient(name: string, config: SseMCPServer): McpClient {
  logger.debug(`SSE MCPクライアントを作成: ${name}`, {
    url: config.url,
  });

  try {
    const url = new URL(config.url);
    const transport = new SSEClientTransport(url);

    return new McpClient({
      transport: transport as Transport,
      applicationName: `AgentCore-${name}`,
    });
  } catch (error) {
    throw new MCPConfigError(
      `SSE MCPクライアントの作成に失敗 (${name}): 無効なURL - ${config.url}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * MCP サーバー設定から McpClient を生成
 *
 * @param name サーバー名
 * @param config サーバー設定
 * @returns McpClient インスタンス
 */
export function createMCPClient(name: string, config: MCPServerConfig): McpClient {
  try {
    switch (config.transport) {
      case 'stdio': {
        return createStdioClient(name, config);
      }
      case 'http': {
        return createHttpClient(name, config);
      }
      case 'sse': {
        return createSseClient(name, config);
      }
      default: {
        // TypeScript の exhaustive check
        const _exhaustive: never = config;
        throw new MCPConfigError(`未対応のトランスポート: ${(_exhaustive as any).transport}`);
      }
    }
  } catch (error) {
    if (error instanceof MCPConfigError) {
      throw error;
    }
    throw new MCPConfigError(
      `MCPクライアントの作成に失敗 (${name}): ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * 複数の MCP サーバー設定から McpClient 配列を生成
 *
 * @param servers サーバー名と設定の配列
 * @returns McpClient インスタンスの配列
 */
export function createMCPClients(
  servers: Array<{ name: string; config: MCPServerConfig }>
): McpClient[] {
  const clients: McpClient[] = [];

  for (const { name, config } of servers) {
    try {
      const client = createMCPClient(name, config);
      clients.push(client);
      logger.info(`✅ MCPクライアントを作成: ${name} (${config.transport})`);
    } catch (error) {
      logger.error(`❌ MCPクライアントの作成に失敗: ${name}`, error);
      // エラーが発生してもスキップして続行（他のクライアントは作成）
    }
  }

  return clients;
}
