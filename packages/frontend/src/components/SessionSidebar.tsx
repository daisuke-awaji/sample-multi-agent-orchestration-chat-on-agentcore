/**
 * セッションサイドバーコンポーネント
 * セッション一覧の表示と管理を行う
 */

import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Donut, SquarePen, Search, PanelRight, Wrench } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useSessionStore } from '../stores/sessionStore';
import { useUIStore } from '../stores/uiStore';
import type { SessionSummary } from '../api/sessions';

/**
 * セッションアイテムコンポーネント
 */
interface SessionItemProps {
  session: SessionSummary;
  isActive: boolean;
  onSelect: () => void;
}

function SessionItem({ session, isActive, onSelect }: SessionItemProps) {
  return (
    <button
      onClick={onSelect}
      className={`
        w-full text-left p-2 rounded-lg transition-all duration-200 group
        ${isActive ? 'bg-gray-100' : 'hover:bg-gray-100'}
      `}
    >
      <div className="flex items-center gap-2">
        <span
          className={`
          font-medium text-sm leading-tight flex-shrink-0
          ${isActive ? 'text-gray-900' : 'text-gray-900 group-hover:text-gray-700'}
        `}
        >
          セッション名
        </span>
        <span
          className={`
          text-xs leading-tight font-mono text-gray-500 truncate
          ${isActive ? 'text-gray-600' : 'text-gray-500 group-hover:text-gray-600'}
        `}
        >
          {session.sessionId}
        </span>
      </div>
    </button>
  );
}

/**
 * セッションサイドバーコンポーネント
 */
export function SessionSidebar() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId?: string }>();

  const { user } = useAuthStore();
  const {
    sessions,
    isLoadingSessions,
    sessionsError,
    hasLoadedOnce,
    activeSessionId,
    loadSessions,
    selectSession,
    clearActiveSession,
  } = useSessionStore();
  const { isSidebarOpen, toggleSidebar } = useUIStore();

  // 初回読み込み
  useEffect(() => {
    if (user && !hasLoadedOnce && !isLoadingSessions) {
      console.log('🔄 初回セッション読み込み開始');
      loadSessions(user);
    }
  }, [user, hasLoadedOnce, isLoadingSessions, loadSessions]);

  // URL のセッションID と現在のアクティブセッションを同期
  useEffect(() => {
    if (sessionId && sessionId !== activeSessionId && user) {
      console.log(`🔄 URL からセッション選択: ${sessionId}`);
      selectSession(user, sessionId);
    } else if (!sessionId && activeSessionId) {
      console.log('🗑️ URL からセッションIDが削除されたのでクリア');
      clearActiveSession();
    }
  }, [sessionId, activeSessionId, user, selectSession, clearActiveSession]);

  // 新規チャット開始
  const handleNewChat = () => {
    console.log('🆕 新規チャット開始');
    clearActiveSession();
    navigate('/chat');
  };

  // セッション選択
  const handleSessionSelect = (session: SessionSummary) => {
    console.log(`📋 セッション選択: ${session.sessionId}`);
    navigate(`/chat/${session.sessionId}`);
  };

  // 検索ボタン（モック）
  const handleSearch = () => {
    console.log('🔍 検索機能（未実装）');
    // TODO: 検索機能の実装
  };

  // ツール検索
  const handleToolsSearch = () => {
    console.log('🔧 ツール検索ページへナビゲート');
    navigate('/tools');
  };

  // サイドバー折りたたみ
  const handleToggleSidebar = () => {
    toggleSidebar();
  };

  if (!user) {
    return null;
  }

  return (
    <div
      className={`h-full bg-white border-r border-gray-200 flex flex-col ${isSidebarOpen ? 'w-80' : 'w-16'}`}
    >
      {/* ヘッダー */}
      <div className={`p-4 ${isSidebarOpen ? 'border-b border-gray-200' : ''} bg-white`}>
        <div
          className={`flex items-center mb-3 ${isSidebarOpen ? 'justify-between' : 'justify-center'}`}
        >
          {isSidebarOpen ? (
            <>
              <div className="flex items-center ml-2 gap-2">
                <Donut className="w-5 h-5 text-gray-700" />
                <span className="text-lg font-semibold text-gray-900">Donuts</span>
              </div>
              <button
                onClick={handleToggleSidebar}
                className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                title="サイドバーを閉じる"
              >
                <PanelRight className="w-5 h-5" />
              </button>
            </>
          ) : (
            <button
              onClick={handleToggleSidebar}
              className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              title="サイドバーを開く"
            >
              <PanelRight className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className={`space-y-2 ${!isSidebarOpen ? 'flex flex-col items-center' : ''}`}>
          <button
            onClick={handleNewChat}
            className={`p-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2 ${
              isSidebarOpen ? 'w-full text-left' : 'w-auto'
            }`}
            title={!isSidebarOpen ? '新しいチャット' : undefined}
          >
            <SquarePen className="w-5 h-5 flex-shrink-0" />
            {isSidebarOpen && <span className="text-sm">新しいチャット</span>}
          </button>

          <button
            onClick={handleSearch}
            className={`p-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2 ${
              isSidebarOpen ? 'w-full text-left' : 'w-auto'
            }`}
            title={!isSidebarOpen ? 'チャットを検索' : undefined}
          >
            <Search className="w-5 h-5 flex-shrink-0" />
            {isSidebarOpen && <span className="text-sm">チャットを検索</span>}
          </button>

          <button
            onClick={handleToolsSearch}
            className={`p-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2 ${
              isSidebarOpen ? 'w-full text-left' : 'w-auto'
            }`}
            title={!isSidebarOpen ? 'ツールを検索' : undefined}
          >
            <Wrench className="w-5 h-5 flex-shrink-0" />
            {isSidebarOpen && <span className="text-sm">ツールを検索</span>}
          </button>
        </div>
      </div>

      {/* セッション一覧 - 展開時のみ表示 */}
      {isSidebarOpen && (
        <div className="flex-1 overflow-y-auto">
          {sessionsError && (
            <div className="p-4">
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>{sessionsError}</span>
                </div>
              </div>
            </div>
          )}

          {isLoadingSessions && sessions.length === 0 && (
            <div className="p-4 text-center">
              <div className="inline-flex items-center gap-2 text-gray-500">
                <svg
                  className="w-4 h-4 animate-spin"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                読み込み中...
              </div>
            </div>
          )}

          {!isLoadingSessions && sessions.length === 0 && !sessionsError && (
            <div className="p-4 text-center text-gray-500">
              <svg
                className="w-12 h-12 mx-auto mb-3 text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              <p className="text-sm">まだ会話がありません</p>
              <p className="text-xs text-gray-400 mt-1">新しいチャットを開始しましょう</p>
            </div>
          )}

          {sessions.length > 0 && (
            <div className="px-4 py-2 space-y-2">
              {sessions.map((session) => (
                <SessionItem
                  key={session.sessionId}
                  session={session}
                  isActive={session.sessionId === activeSessionId}
                  onSelect={() => handleSessionSelect(session)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
