/**
 * MCP (Model Context Protocol) 統合モジュール
 * - AgentCore Gateway 経由の HTTP MCP クライアント
 * - ローカル stdio/http/sse MCP サーバーのサポート
 */

// AgentCore Gateway クライアント (既存)
export { mcpClient, AgentCoreMCPClient, MCPClientError } from './client.js';
export type { MCPToolResult } from './client.js';

// ローカル MCP サーバー設定とクライアント（ローカル実装から再エクスポート）
export type {
  MCPServerConfig,
  StdioMCPServer,
  HttpMCPServer,
  SseMCPServer,
  MCPConfig,
  MCPConfigError,
} from './types.js';
export { loadMCPConfig, getEnabledMCPServers } from './config-loader.js';
export { createMCPClient, createMCPClients } from './client-factory.js';
