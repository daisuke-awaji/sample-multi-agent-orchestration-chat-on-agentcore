/**
 * ツール管理 API クライアント
 * Backend のツール API を呼び出すためのクライアント
 */

import type { User } from '../types/index';

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
 * API レスポンスの型定義
 */
interface ToolsResponse {
  tools: MCPTool[];
  metadata: {
    requestId: string;
    timestamp: string;
    actorId: string;
    count: number;
    query?: string; // 検索の場合のみ
  };
}

interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  gateway: {
    connected: boolean;
    endpoint: string;
  };
  metadata: {
    requestId: string;
    timestamp: string;
    actorId: string;
  };
}

/**
 * Backend API のベース URL を取得
 */
function getBackendBaseUrl(): string {
  // 環境変数から取得、未設定の場合はデフォルト値を使用
  return import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
}

/**
 * 認証ヘッダーを作成
 * @param user ユーザー情報
 * @returns Authorization ヘッダー
 */
function createAuthHeaders(user: User): Record<string, string> {
  // Access Token を使用（Gateway API アクセス用）
  const accessToken = user.accessToken || user.idToken;

  if (!accessToken) {
    throw new Error('認証トークンが見つかりません');
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

/**
 * ツール一覧を取得
 * @param user Cognito ユーザー情報
 * @returns ツール一覧
 */
export async function fetchTools(user: User): Promise<MCPTool[]> {
  try {
    const baseUrl = getBackendBaseUrl();
    const headers = createAuthHeaders(user);

    console.log('🔧 ツール一覧取得開始...');

    const response = await fetch(`${baseUrl}/tools`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `ツール一覧の取得に失敗しました: ${response.status} ${response.statusText} - ${
          errorData.message || 'Unknown error'
        }`
      );
    }

    const data: ToolsResponse = await response.json();
    console.log(`✅ ツール一覧取得完了: ${data.tools.length}件`);

    return data.tools;
  } catch (error) {
    console.error('💥 ツール一覧取得エラー:', error);
    throw error;
  }
}

/**
 * ツールを検索
 * @param user Cognito ユーザー情報
 * @param query 検索クエリ
 * @returns 検索結果のツール一覧
 */
export async function searchTools(user: User, query: string): Promise<MCPTool[]> {
  if (!query || query.trim().length === 0) {
    throw new Error('検索クエリが必要です');
  }

  try {
    const baseUrl = getBackendBaseUrl();
    const headers = createAuthHeaders(user);

    console.log(`🔍 ツール検索開始: "${query}"`);

    const response = await fetch(`${baseUrl}/tools/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query: query.trim(),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `ツール検索に失敗しました: ${response.status} ${response.statusText} - ${
          errorData.message || 'Unknown error'
        }`
      );
    }

    const data: ToolsResponse = await response.json();
    console.log(`✅ ツール検索完了: ${data.tools.length}件 (クエリ: "${query}")`);

    return data.tools;
  } catch (error) {
    console.error('💥 ツール検索エラー:', error);
    throw error;
  }
}

/**
 * Gateway 接続状態を確認
 * @param user Cognito ユーザー情報
 * @returns 接続状態情報
 */
export async function checkGatewayHealth(user: User): Promise<HealthResponse> {
  try {
    const baseUrl = getBackendBaseUrl();
    const headers = createAuthHeaders(user);

    console.log('💓 Gateway 接続確認開始...');

    const response = await fetch(`${baseUrl}/tools/health`, {
      method: 'GET',
      headers,
    });

    const data: HealthResponse = await response.json();

    if (!response.ok) {
      console.warn(`⚠️ Gateway 接続確認警告: ${response.status} ${response.statusText}`);
    } else {
      console.log('✅ Gateway 接続確認完了:', data.status);
    }

    return data;
  } catch (error) {
    console.error('💥 Gateway 接続確認エラー:', error);
    throw error;
  }
}
