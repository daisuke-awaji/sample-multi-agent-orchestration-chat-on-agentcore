/**
 * Request Context Management
 * リクエストスコープでのコンテキスト管理
 */

import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import type { WorkspaceSync } from '../services/workspace-sync.js';

/**
 * リクエストコンテキストの型定義
 */
export interface RequestContext {
  /** Authorization ヘッダー（JWT Bearer Token） */
  authorizationHeader?: string;
  /** ユーザーID（JWTから抽出可能） */
  userId?: string;
  /** ユーザーが選択しているS3ディレクトリパス */
  storagePath?: string;
  /** ワークスペース同期サービス */
  workspaceSync?: WorkspaceSync;
  /** リクエスト固有ID（ログ追跡用） */
  requestId: string;
  /** リクエスト開始時刻 */
  startTime: Date;
  /** マシンユーザー（Client Credentials Flow）かどうか */
  isMachineUser: boolean;
  /** クライアントID（マシンユーザーの場合） */
  clientId?: string;
  /** OAuthスコープ */
  scopes?: string[];
}

/**
 * コンテキストメタデータの型定義
 */
export interface ContextMetadata {
  /** リクエスト固有ID */
  requestId: string;
  /** ユーザーID（存在する場合） */
  userId?: string;
  /** 認証ヘッダーの有無 */
  hasAuth: boolean;
  /** リクエスト処理時間（ミリ秒） */
  duration: number;
}

/**
 * AsyncLocalStorage を使用したリクエストコンテキスト管理
 * Express リクエストスコープで認証情報を伝播
 */
export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * 現在のリクエストコンテキストを取得
 */
export function getCurrentContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

/**
 * 現在のリクエストの Authorization ヘッダーを取得
 */
export function getCurrentAuthHeader(): string | undefined {
  const context = getCurrentContext();
  return context?.authorizationHeader;
}

/**
 * 現在のリクエストのストレージパスを取得
 */
export function getCurrentStoragePath(): string {
  const context = getCurrentContext();
  return context?.storagePath || '/';
}

/**
 * 新しいリクエストコンテキストを作成
 */
export function createRequestContext(authorizationHeader?: string): RequestContext {
  return {
    authorizationHeader,
    requestId: randomUUID(),
    startTime: new Date(),
    isMachineUser: false,
  };
}

/**
 * リクエストコンテキストでコールバック関数を実行
 */
export function runWithContext<T>(context: RequestContext, callback: () => T): T {
  return requestContextStorage.run(context, callback);
}

/**
 * リクエストコンテキストログ用のメタデータを取得
 */
export function getContextMetadata(): ContextMetadata {
  const context = getCurrentContext();
  if (!context) {
    return {
      requestId: 'unknown',
      hasAuth: false,
      duration: 0,
    };
  }

  return {
    requestId: context.requestId,
    userId: context.userId,
    hasAuth: !!context.authorizationHeader,
    duration: Date.now() - context.startTime.getTime(),
  };
}
