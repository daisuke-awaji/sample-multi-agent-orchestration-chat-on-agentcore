/**
 * AgentCore Gateway MCP Client Service
 * AgentCore Gateway の MCP エンドポイントとの通信を担当
 */

import { config } from '../config/index.js';

/**
 * MCP ツールの型定義
 */
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * MCP レスポンスの型定義
 */
interface MCPResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Tools/List レスポンスの型定義
 */
interface ToolsListResult {
  tools: MCPTool[];
  nextCursor?: string;
}

/**
 * Tools/Call (search) レスポンスの型定義
 */
interface ToolsCallResult {
  content: Array<{
    type: string;
    text?: string;
    data?: unknown;
  }>;
  isError?: boolean;
}

/**
 * AgentCore Gateway MCP クライアント
 */
export class AgentCoreGatewayService {
  private readonly gatewayEndpoint: string;

  constructor() {
    if (!config.gateway.endpoint) {
      throw new Error(
        'AgentCore Gateway エンドポイントが設定されていません。AGENTCORE_GATEWAY_ENDPOINT 環境変数を設定してください。'
      );
    }
    this.gatewayEndpoint = config.gateway.endpoint;
  }

  /**
   * MCP リクエストを送信する共通メソッド
   */
  private async sendMCPRequest<T = unknown>(
    method: string,
    params?: unknown,
    authToken?: string
  ): Promise<T> {
    const requestId = `${method}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const requestBody: {
      jsonrpc: '2.0';
      id: string;
      method: string;
      params?: unknown;
    } = {
      jsonrpc: '2.0' as const,
      id: requestId,
      method,
    };

    if (params && typeof params === 'object' && params !== null) {
      requestBody.params = params;
    }

    console.log(`🔗 Gateway MCP リクエスト送信:`, {
      endpoint: this.gatewayEndpoint,
      method,
      requestId,
      hasParams: !!params,
      hasAuth: !!authToken,
    });

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }

      const response = await fetch(this.gatewayEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(
          `Gateway API エラー: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data: MCPResponse<T> = await response.json();

      if (data.error) {
        throw new Error(`Gateway MCP エラー: ${data.error.message} (${data.error.code})`);
      }

      if (!data.result) {
        throw new Error('Gateway からの応答に result が含まれていません');
      }

      console.log(`✅ Gateway MCP リクエスト成功:`, {
        requestId,
        method,
        resultType: typeof data.result,
      });

      return data.result;
    } catch (error) {
      console.error(`💥 Gateway MCP リクエストエラー (${method}):`, error);
      throw error;
    }
  }

  /**
   * 利用可能なツール一覧を取得
   * @param authToken JWT認証トークン（オプショナル）
   * @returns ツール一覧
   */
  async listTools(authToken?: string): Promise<MCPTool[]> {
    try {
      console.log('📋 Gateway からツール一覧を取得中...');

      const result = await this.sendMCPRequest<ToolsListResult>('tools/list', undefined, authToken);

      const tools = result.tools || [];
      console.log(`✅ ツール一覧取得完了: ${tools.length}件`);

      return tools;
    } catch (error) {
      console.error('💥 ツール一覧取得エラー:', error);
      throw new Error(
        `ツール一覧の取得に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * セマンティック検索でツールを検索
   * @param query 検索クエリ
   * @param authToken JWT認証トークン
   * @returns 検索結果のツール一覧
   */
  async searchTools(query: string, authToken: string): Promise<MCPTool[]> {
    if (!query || query.trim().length === 0) {
      throw new Error('検索クエリが必要です');
    }

    try {
      console.log(`🔍 Gateway でツールを検索中: "${query}"`);

      const result = await this.sendMCPRequest<ToolsCallResult>(
        'tools/call',
        {
          name: 'x_amz_bedrock_agentcore_search',
          arguments: {
            query: query.trim(),
          },
        },
        authToken
      );

      // レスポンスの内容を解析
      if (result.isError) {
        throw new Error('検索中にエラーが発生しました');
      }

      // content から検索結果を抽出
      const tools: MCPTool[] = [];
      if (result.content && Array.isArray(result.content)) {
        for (const item of result.content) {
          if (item.type === 'text' && item.text) {
            try {
              // JSON形式のツール情報を解析
              const toolData = JSON.parse(item.text);
              if (toolData.tools && Array.isArray(toolData.tools)) {
                tools.push(...toolData.tools);
              }
            } catch (parseError) {
              // テキスト形式の場合はそのまま使用
              console.warn('検索結果のパースに失敗、テキストとして処理:', parseError);
            }
          } else if (item.data && typeof item.data === 'object' && item.data !== null) {
            // data フィールドに直接ツール情報が含まれている場合
            const data = item.data as Record<string, unknown>;
            if (data.tools && Array.isArray(data.tools)) {
              tools.push(...(data.tools as MCPTool[]));
            } else if (data.name && typeof data.name === 'string') {
              // 単一ツールの場合
              tools.push(data as unknown as MCPTool);
            }
          }
        }
      }

      console.log(`✅ ツール検索完了: ${tools.length}件 (クエリ: "${query}")`);
      return tools;
    } catch (error) {
      console.error(`💥 ツール検索エラー (クエリ: "${query}"):`, error);
      throw new Error(
        `ツール検索に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Gateway の接続状態を確認
   * @param authToken JWT認証トークン
   * @returns 接続が成功した場合は true
   */
  async checkConnection(authToken: string): Promise<boolean> {
    try {
      console.log('🔗 Gateway 接続確認中...');

      // tools/list で接続確認
      await this.listTools(authToken);

      console.log('✅ Gateway 接続確認成功');
      return true;
    } catch (error) {
      console.error('💥 Gateway 接続確認失敗:', error);
      return false;
    }
  }
}

/**
 * シングルトンインスタンス
 */
export const gatewayService = new AgentCoreGatewayService();
