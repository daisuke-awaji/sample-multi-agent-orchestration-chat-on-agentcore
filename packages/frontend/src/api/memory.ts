/**
 * Memory API クライアント
 * Backend の Memory API を呼び出すためのクライアント
 */

import { getValidAccessToken } from '../lib/cognito';

/**
 * メモリレコードの型定義
 */
export interface MemoryRecord {
  recordId: string;
  namespace: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * メモリレコード一覧の型定義
 */
export interface MemoryRecordList {
  records: MemoryRecord[];
  nextToken?: string;
}

/**
 * セマンティック検索のリクエスト型定義
 */
export interface SearchMemoryRequest {
  query: string;
  topK?: number;
  relevanceScore?: number;
}

/**
 * Backend API のベース URL を取得
 */
function getBackendBaseUrl(): string {
  // 環境変数から取得、未設定の場合はデフォルト値を使用
  const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

  // 末尾のスラッシュを除去してダブルスラッシュ問題を防ぐ
  return baseUrl.replace(/\/$/, '');
}

/**
 * 認証ヘッダーを作成（自動トークンリフレッシュ付き）
 * @returns Authorization ヘッダー
 */
async function createAuthHeaders(): Promise<Record<string, string>> {
  // 有効なアクセストークンを取得（期限切れの場合は自動リフレッシュ）
  const accessToken = await getValidAccessToken();

  if (!accessToken) {
    throw new Error('認証が必要です。再ログインしてください。');
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

/**
 * メモリレコード一覧を取得
 * @returns メモリレコード一覧
 */
export async function fetchMemoryRecords(): Promise<MemoryRecordList> {
  try {
    const baseUrl = getBackendBaseUrl();
    const headers = await createAuthHeaders();

    console.log(`📋 メモリレコード取得開始`);

    const response = await fetch(`${baseUrl}/memory/records`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `メモリレコードの取得に失敗しました: ${response.status} ${response.statusText} - ${
          errorData.error || 'Unknown error'
        }`
      );
    }

    const data: MemoryRecordList = await response.json();
    console.log(`✅ メモリレコード取得完了: ${data.records.length}件`);

    return data;
  } catch (error) {
    console.error('💥 メモリレコード取得エラー:', error);
    throw error;
  }
}

/**
 * メモリレコードを削除
 * @param recordId レコードID
 */
export async function deleteMemoryRecord(recordId: string): Promise<void> {
  try {
    const baseUrl = getBackendBaseUrl();
    const headers = await createAuthHeaders();

    console.log(`🗑️ メモリレコード削除開始: ${recordId}`);

    const response = await fetch(`${baseUrl}/memory/records/${recordId}`, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `メモリレコードの削除に失敗しました: ${response.status} ${response.statusText} - ${
          errorData.error || 'Unknown error'
        }`
      );
    }

    console.log(`✅ メモリレコード削除完了: ${recordId}`);
  } catch (error) {
    console.error('💥 メモリレコード削除エラー:', error);
    throw error;
  }
}

/**
 * メモリレコードをセマンティック検索
 * @param searchRequest 検索リクエスト
 * @returns 検索結果
 */
export async function searchMemoryRecords(
  searchRequest: SearchMemoryRequest
): Promise<MemoryRecord[]> {
  try {
    const baseUrl = getBackendBaseUrl();
    const headers = await createAuthHeaders();

    console.log(`🔍 メモリ検索開始: "${searchRequest.query}"`);

    const response = await fetch(`${baseUrl}/memory/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify(searchRequest),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `メモリ検索に失敗しました: ${response.status} ${response.statusText} - ${
          errorData.error || 'Unknown error'
        }`
      );
    }

    const data = await response.json();
    console.log(`✅ メモリ検索完了: ${data.records.length}件`);

    return data.records;
  } catch (error) {
    console.error('💥 メモリ検索エラー:', error);
    throw error;
  }
}
