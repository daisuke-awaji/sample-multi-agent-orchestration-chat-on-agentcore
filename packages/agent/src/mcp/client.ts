// MCP SDK が利用できない場合のフォールバック実装
// import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/http.js";
// import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { config, logger } from '../config/index.js';
import { getCurrentAuthHeader } from '../context/request-context.js';
import { MCPToolDefinition } from '../schemas/types.js';

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
  tools: Array<MCPToolDefinition>;
  nextCursor?: string;
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
 * リトライ設定
 */
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  timeout: number;
}

/**
 * デフォルトのリトライ設定
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 100,
  maxDelay: 2000,
  timeout: 30000,
};

/**
 * エラーのcauseプロパティを持つ型
 */
interface ErrorWithCause extends Error {
  cause?: {
    code?: string;
  };
}

/**
 * リトライ可能なエラーかどうかを判定
 */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  const cause = (error as ErrorWithCause).cause;

  // Node.js のネットワークエラーコード
  const retryableCodes = [
    'econnreset', // 接続リセット
    'etimedout', // タイムアウト
    'econnrefused', // 接続拒否
    'epipe', // パイプ破損
    'eai_again', // DNS一時エラー
    'enotfound', // DNS解決エラー
  ];

  // エラーメッセージに含まれる文字列チェック
  const retryableMessages = [
    'fetch failed',
    'network error',
    'connection reset',
    'connection refused',
    'timeout',
  ];

  // エラーコードの確認
  if (cause?.code) {
    const code = String(cause.code).toLowerCase();
    if (retryableCodes.includes(code)) {
      return true;
    }
  }

  // エラーメッセージの確認
  if (retryableMessages.some((msg) => message.includes(msg))) {
    return true;
  }

  return false;
}

/**
 * 指数バックオフでの待機
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * リトライロジック付きfetch
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retryConfig: Partial<RetryConfig> = {}
): Promise<Response> {
  const config = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      // タイムアウト設定
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout);

      const fetchOptions: RequestInit = {
        ...options,
        signal: controller.signal,
      };

      try {
        const response = await fetch(url, fetchOptions);
        clearTimeout(timeoutId);

        // HTTP 5xx エラーもリトライ対象
        if (response.status >= 500 && response.status < 600 && attempt < config.maxRetries) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // 最後のリトライの場合はエラーを投げる
      if (attempt >= config.maxRetries) {
        break;
      }

      // リトライ可能なエラーかチェック
      if (!isRetryableError(error)) {
        logger.debug(`リトライ不可能なエラー (attempt ${attempt + 1}):`, lastError.message);
        throw lastError;
      }

      // 待機時間を計算（指数バックオフ）
      const delay = Math.min(config.baseDelay * Math.pow(2, attempt), config.maxDelay);

      logger.debug(
        `リトライ可能なエラー (attempt ${attempt + 1}/${config.maxRetries + 1}): ${lastError.message}, ${delay}ms後にリトライ`
      );

      if (delay > 0) {
        await sleep(delay);
      }
    }
  }

  throw new MCPClientError(
    `${config.maxRetries + 1}回のリトライ後に失敗: ${lastError.message}`,
    lastError
  );
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
   * 利用可能なツール一覧を取得（ページネーション対応）
   */
  async listTools(): Promise<Array<MCPToolDefinition>> {
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

      const allTools = [];
      let cursor: string | undefined = undefined;
      let pageCount = 0;

      // nextCursor がある限り全てのページを取得
      do {
        pageCount++;
        logger.debug(`ページ${pageCount}を取得中...`, cursor ? { cursor } : {});

        const params = cursor ? { cursor } : {};

        const response = await fetchWithRetry(this.endpointUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: pageCount,
            method: 'tools/list',
            params,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = (await response.json()) as JSONRPCResponse<ListToolsResult>;

        if (config.DEBUG_MCP) {
          logger.debug(`ページ${pageCount}の取得結果:`, data);
        }

        if (data.error) {
          throw new Error(`MCP Error: ${data.error.message}`);
        }

        if (!data.result) {
          throw new Error('ツール一覧の結果が空です');
        }

        // このページのツールを追加
        allTools.push(...data.result.tools);
        logger.debug(`ページ${pageCount}: ${data.result.tools.length}個のツールを取得`);

        // 次のページがあるかチェック
        cursor = data.result.nextCursor;
      } while (cursor);

      logger.info(`✅ 全${pageCount}ページから合計${allTools.length}個のツールを取得しました`);
      return allTools;
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

      const response = await fetchWithRetry(this.endpointUrl, {
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
