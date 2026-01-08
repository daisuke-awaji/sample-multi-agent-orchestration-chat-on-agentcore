/**
 * セッション同期カスタムフック
 * URL パラメータと sessionStore の状態を一元的に管理
 */

import { useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSessionStore } from '../stores/sessionStore';
import { useChatStore } from '../stores/chatStore';

export interface UseSessionSyncReturn {
  currentSessionId: string | null;
  isNewChat: boolean;
  createAndNavigateToNewSession: () => string;
}

/**
 * セッション同期フック
 *
 * URL の sessionId と Store の状態を同期し、
 * 新規セッション作成時のナビゲーションを管理します。
 *
 * @returns {UseSessionSyncReturn} セッション同期情報とアクション
 */
export function useSessionSync(): UseSessionSyncReturn {
  const { sessionId: urlSessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const {
    activeSessionId,
    sessionEvents,
    isCreatingSession,
    selectSession,
    clearActiveSession,
    createNewSession,
    finalizeNewSession,
  } = useSessionStore();

  const { clearMessages, loadSessionHistory } = useChatStore();

  // URL → Store 同期
  useEffect(() => {
    // 新規セッション作成中の場合
    if (isCreatingSession) {
      // urlSessionId が activeSessionId と一致したら、URL同期が完了した証拠
      if (urlSessionId && urlSessionId === activeSessionId) {
        console.log('✅ 新規セッションのURL同期完了');
        finalizeNewSession();
      } else {
        console.log('⏳ 新規セッション作成中、URL同期をスキップ');
      }
      return; // Return here in both cases
    }

    if (!urlSessionId) {
      // For /chat: prepare new chat
      if (activeSessionId) {
        console.log('🗑️ 新規チャット準備のためアクティブセッションをクリア');
        clearActiveSession();
        clearMessages();
      }
      return;
    }

    // すでに同期済みの場合はスキップ
    if (urlSessionId === activeSessionId) {
      return;
    }

    // URL に sessionId がある場合は即座に events を取得（sessions 一覧の完了を待たない）
    // これにより、リロード時のラグを解消し、sessions API と events API が並列実行される
    console.log(`📥 セッション選択（並列取得）: ${urlSessionId}`);
    clearMessages();
    selectSession(urlSessionId);
  }, [
    urlSessionId,
    activeSessionId,
    isCreatingSession,
    selectSession,
    clearActiveSession,
    clearMessages,
    finalizeNewSession,
  ]);

  // セッション履歴を chatStore に復元
  useEffect(() => {
    if (urlSessionId && activeSessionId === urlSessionId && sessionEvents.length > 0) {
      console.log(`📖 セッション履歴を ChatStore に復元: ${urlSessionId}`);
      loadSessionHistory(sessionEvents);
    }
  }, [urlSessionId, activeSessionId, sessionEvents, loadSessionHistory]);

  // 新規セッション作成 + ナビゲーション
  const createAndNavigateToNewSession = useCallback(() => {
    const newSessionId = createNewSession();
    navigate(`/chat/${newSessionId}`, { replace: true });
    // setTimeout削除 - useEffect内でURL同期完了後にfinalizeする
    return newSessionId;
  }, [navigate, createNewSession]);

  return {
    currentSessionId: urlSessionId || null,
    isNewChat: !urlSessionId,
    createAndNavigateToNewSession,
  };
}
