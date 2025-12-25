/**
 * MCP サーバー設定の型定義
 * stdio / http / sse の3種類のトランスポートに対応
 */

/**
 * 共通オプション
 */
interface MCPServerBase {
  /** サーバーを有効化するか (デフォルト: true) */
  enabled?: boolean;
  /** ツール名にプレフィックスを付与 (競合回避用) */
  prefix?: string;
}

/**
 * stdio トランスポート設定
 * ローカルプロセスを起動して通信
 */
export interface StdioMCPServer extends MCPServerBase {
  transport: 'stdio';
  /** 実行コマンド (例: "uvx", "npx", "python") */
  command: string;
  /** コマンド引数 */
  args?: string[];
  /** 環境変数 (${VAR} 形式で他の環境変数を参照可能) */
  env?: Record<string, string>;
}

/**
 * Streamable HTTP トランスポート設定
 * HTTP経由でMCPサーバーと通信
 */
export interface HttpMCPServer extends MCPServerBase {
  transport: 'http';
  /** MCPサーバーのURL */
  url: string;
  /** リクエストヘッダー (${VAR} 形式で環境変数を参照可能) */
  headers?: Record<string, string>;
}

/**
 * SSE (Server-Sent Events) トランスポート設定
 * SSE経由でMCPサーバーと通信
 */
export interface SseMCPServer extends MCPServerBase {
  transport: 'sse';
  /** MCPサーバーのURL */
  url: string;
  /** リクエストヘッダー (${VAR} 形式で環境変数を参照可能) */
  headers?: Record<string, string>;
}

/**
 * MCPサーバー設定の Union 型
 */
export type MCPServerConfig = StdioMCPServer | HttpMCPServer | SseMCPServer;

/**
 * mcp.json の全体設定
 */
export interface MCPConfig {
  /** MCPサーバーの定義 (キー: サーバー名) */
  mcpServers: Record<string, MCPServerConfig>;
}

/**
 * MCPクライアント生成エラー
 */
export class MCPConfigError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'MCPConfigError';
  }
}
