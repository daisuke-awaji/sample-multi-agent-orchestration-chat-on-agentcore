/**
 * セッション管理 API クライアント
 * Backend のセッション API を呼び出すためのクライアント
 */

import type { User } from '../types/index';

/**
 * セッション情報の型定義
 */
export interface SessionSummary {
  sessionId: string;
  title: string;
  lastMessage: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 会話メッセージの型定義
 */
export interface ConversationMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

/**
 * API レスポンスの型定義
 */
interface SessionsResponse {
  sessions: SessionSummary[];
  metadata: {
    requestId: string;
    timestamp: string;
    actorId: string;
    count: number;
  };
}

interface SessionEventsResponse {
  events: ConversationMessage[];
  metadata: {
    requestId: string;
    timestamp: string;
    actorId: string;
    sessionId: string;
    count: number;
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
  // Access Token を使用（一貫性のため）
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
 * セッション一覧を取得
 * @param user Cognito ユーザー情報
 * @returns セッション一覧
 */
export async function fetchSessions(user: User): Promise<SessionSummary[]> {
  try {
    const baseUrl = getBackendBaseUrl();
    const headers = createAuthHeaders(user);

    console.log('📋 セッション一覧取得開始...');

    const response = await fetch(`${baseUrl}/sessions`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `セッション一覧の取得に失敗しました: ${response.status} ${response.statusText} - ${
          errorData.message || 'Unknown error'
        }`
      );
    }

    const data: SessionsResponse = await response.json();
    console.log(`✅ セッション一覧取得完了: ${data.sessions.length}件`);

    return data.sessions;
  } catch (error) {
    console.error('💥 セッション一覧取得エラー:', error);
    throw error;
  }
}

/**
 * セッションの会話履歴を取得
 * @param user Cognito ユーザー情報
 * @param sessionId セッションID
 * @returns 会話履歴
 */
export async function fetchSessionEvents(
  user: User,
  sessionId: string
): Promise<ConversationMessage[]> {
  try {
    const baseUrl = getBackendBaseUrl();
    const headers = createAuthHeaders(user);

    console.log(`💬 セッション会話履歴取得開始: ${sessionId}`);

    const response = await fetch(`${baseUrl}/sessions/${sessionId}/events`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `セッション会話履歴の取得に失敗しました: ${response.status} ${response.statusText} - ${
          errorData.message || 'Unknown error'
        }`
      );
    }

    const data: SessionEventsResponse = await response.json();
    console.log(`✅ セッション会話履歴取得完了: ${data.events.length}件`);

    return data.events;
  } catch (error) {
    console.error('💥 セッション会話履歴取得エラー:', error);
    throw error;
  }
}
