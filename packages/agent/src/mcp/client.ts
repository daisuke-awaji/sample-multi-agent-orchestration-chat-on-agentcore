// MCP SDK が利用できない場合のフォールバック実装
// import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/http.js";
// import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { config, logger } from '../config/index.js';
import { getCurrentAuthHeader } from '../context/request-context.js';

/**
 * JSONRPC レスポンスの基本型
 */
interface JSONRPCResponse<T = unknown> {
  jsonrpc: string;
  id: number | string;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * ツール一覧のレスポンス型
 */
interface ListToolsResult {
  tools: Array<{
    name: string;
    description?: string;
    inputSchema: unknown;
  }>;
}

/**
 * ツール呼び出しのレスポンス型
 */
interface CallToolResult {
  toolUseId?: string;
  content?: Array<{
    type: 'text' | 'json';
    text?: string;
    json?: unknown;
  }>;
  isError?: boolean;
}

/**
 * MCP ツール呼び出しの結果
 */
export interface MCPToolResult {
  toolUseId: string;
  content: Array<{
    type: 'text' | 'json';
    text?: string;
    json?: unknown;
  }>;
  isError: boolean;
}

/**
 * MCP クライアントエラー
 */
export class MCPClientError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'MCPClientError';
  }
}

/**
 * AgentCore Gateway MCP クライアント (HTTP ベース)
 */
export class AgentCoreMCPClient {
  private readonly endpointUrl: string;

  constructor() {
    this.endpointUrl = config.AGENTCORE_GATEWAY_ENDPOINT;
    logger.debug('AgentCore MCP クライアントを初期化', {
      endpoint: this.endpointUrl,
    });
  }

  /**
   * Authorization ヘッダーを取得（JWT 伝播のみ）
   */
  private getAuthorizationHeader(required = true): string | null {
    // リクエストコンテキストから Inbound JWT を取得
    const contextAuthHeader = getCurrentAuthHeader();
    if (contextAuthHeader) {
      logger.debug('リクエストコンテキストから JWT を使用');
      return contextAuthHeader;
    }

    // JWT が見つからない場合の処理
    if (required) {
      throw new MCPClientError(
        'JWT認証情報が見つかりません。リクエストに Authorization ヘッダーが必要です。'
      );
    }

    logger.debug('JWT認証情報が見つかりませんが、必須ではないため継続');
    return null;
  }

  /**
   * 利用可能なツール一覧を取得
   */
  async listTools(): Promise<
    Array<{
      name: string;
      description?: string;
      inputSchema: unknown;
    }>
  > {
    try {
      logger.debug('ツール一覧を取得中...');

      // Agent 初期化時はJWT不要（認証なしでツール一覧を取得）
      const authHeader = this.getAuthorizationHeader(false);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (authHeader) {
        headers.Authorization = authHeader;
      }

      const response = await fetch(this.endpointUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as JSONRPCResponse<ListToolsResult>;

      if (config.DEBUG_MCP) {
        logger.debug('取得したツール一覧:', data);
      }

      if (data.error) {
        throw new Error(`MCP Error: ${data.error.message}`);
      }

      if (!data.result) {
        throw new Error('ツール一覧の結果が空です');
      }

      return data.result.tools;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '不明なエラー';
      logger.error('ツール一覧の取得に失敗:', errorMessage);

      throw new MCPClientError(
        `ツール一覧の取得に失敗: ${errorMessage}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * ツールを呼び出し
   */
  async callTool(toolName: string, arguments_: Record<string, unknown>): Promise<MCPToolResult> {
    try {
      logger.info('ツールを呼び出し中:', { toolName, arguments: arguments_ });

      // ツール呼び出し時はJWT認証必須
      const authHeader = this.getAuthorizationHeader(true);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (authHeader) {
        headers.Authorization = authHeader;
      }

      const response = await fetch(this.endpointUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: arguments_,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as JSONRPCResponse<CallToolResult>;

      if (config.DEBUG_MCP) {
        logger.debug('ツール呼び出し結果:', data);
      }

      if (data.error) {
        return {
          toolUseId: 'error',
          content: [{ type: 'text', text: `MCP Error: ${data.error.message}` }],
          isError: true,
        };
      }

      // レスポンスを統一形式に変換
      const result: MCPToolResult = {
        toolUseId: data.result?.toolUseId || 'unknown',
        content: data.result?.content || [
          { type: 'text', text: JSON.stringify(data.result || {}) },
        ],
        isError: data.result?.isError || false,
      };

      logger.info('ツール呼び出しが完了しました:', {
        toolName,
        success: !result.isError,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '不明なエラー';
      logger.error('ツール呼び出しに失敗:', errorMessage);

      throw new MCPClientError(
        `ツール呼び出しに失敗: ${errorMessage}`,
        error instanceof Error ? error : undefined
      );
    }
  }
}

/**
 * シングルトンのMCPクライアント
 */
export const mcpClient = new AgentCoreMCPClient();
