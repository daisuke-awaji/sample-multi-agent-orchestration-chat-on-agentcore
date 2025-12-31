/**
 * セッションサイドバーコンポーネント
 * セッション一覧の表示と管理を行う
 */

import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Donut,
  SquarePen,
  PanelRight,
  Wrench,
  Bot,
  User,
  LogOut,
  X,
  Settings,
  CalendarRange,
  Search,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useSessionStore } from '../stores/sessionStore';
import { useUIStore } from '../stores/uiStore';
import { LoadingIndicator } from './ui/LoadingIndicator';
import { Tooltip } from './ui/Tooltip';
import type { SessionSummary } from '../api/sessions';

/**
 * セッションアイテムコンポーネント
 */
interface SessionItemProps {
  session: SessionSummary;
  isActive: boolean;
  isNew?: boolean;
}

function SessionItem({ session, isActive, isNew = false }: SessionItemProps) {
  const { t } = useTranslation();

  return (
    <Link
      to={`/chat/${session.sessionId}`}
      className={`
        block w-full text-left p-2 rounded-lg transition-all duration-200 group no-underline
        ${isActive ? 'bg-gray-100' : 'hover:bg-gray-100'}
        ${isNew ? 'animate-subtle-fade-in' : ''}
      `}
    >
      <div className="flex items-center gap-2">
        <span
          className={`
          font-medium text-sm leading-tight flex-shrink-0
          ${isActive ? 'text-gray-900' : 'text-gray-900 group-hover:text-gray-700'}
        `}
        >
          {t('chat.sessionNameLabel')}
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
    </Link>
  );
}

/**
 * セッションサイドバーコンポーネント
 */
export function SessionSidebar() {
  const { t } = useTranslation();

  const { user, logout } = useAuthStore();
  const {
    sessions,
    isLoadingSessions,
    sessionsError,
    hasLoadedOnce,
    activeSessionId,
    loadSessions,
    clearActiveSession,
  } = useSessionStore();
  const { isSidebarOpen, isMobileView, toggleSidebar } = useUIStore();

  // ユーザードロップダウンの状態管理
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  // 新規セッション検出用
  const prevSessionIdsRef = useRef<Set<string>>(new Set());
  const [newSessionIds, setNewSessionIds] = useState<Set<string>>(new Set());

  // 初回読み込み
  useEffect(() => {
    if (user && !hasLoadedOnce && !isLoadingSessions) {
      console.log('🔄 初回セッション読み込み開始');
      loadSessions();
    }
  }, [user, hasLoadedOnce, isLoadingSessions, loadSessions]);

  // 新規セッション検出
  useEffect(() => {
    const currentIds = new Set(sessions.map((s) => s.sessionId));
    const prevIds = prevSessionIdsRef.current;

    // 新規追加されたセッションを検出
    const newIds = new Set<string>();
    currentIds.forEach((id) => {
      if (!prevIds.has(id)) {
        newIds.add(id);
      }
    });

    if (newIds.size > 0) {
      // setStateを非同期で実行してeslintエラーを回避
      setTimeout(() => {
        setNewSessionIds(newIds);
      }, 0);
      // アニメーション完了後にクリア
      const timer = setTimeout(() => setNewSessionIds(new Set()), 300);
      return () => clearTimeout(timer);
    }

    prevSessionIdsRef.current = currentIds;
  }, [sessions]);

  // 新規チャット開始
  const handleNewChat = (e: React.MouseEvent) => {
    // Cmd/Ctrl+クリックまたは中クリック時は別タブで開くだけなので、状態変更しない
    if (e.metaKey || e.ctrlKey || e.button === 1) {
      return;
    }
    console.log('🆕 新規チャット開始');
    clearActiveSession();
  };

  // サイドバー折りたたみ
  const handleToggleSidebar = () => {
    toggleSidebar();
  };

  // ログアウト処理
  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // ユーザードロップダウンの切り替え
  const toggleUserDropdown = () => {
    setIsUserDropdownOpen(!isUserDropdownOpen);
  };

  // ドロップダウン外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setIsUserDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  if (!user) {
    return null;
  }

  // モバイル時は常に展開状態、デスクトップ時は現在の状態に従う
  const shouldShowExpanded = isMobileView || isSidebarOpen;

  return (
    <div
      className={`h-full bg-white border-r border-gray-200 flex flex-col ${shouldShowExpanded ? 'w-80' : 'w-16'}`}
    >
      {/* ヘッダー */}
      <div className={`p-4 ${shouldShowExpanded ? 'border-b border-gray-200' : ''} bg-white`}>
        <div
          className={`flex items-center mb-3 ${shouldShowExpanded ? 'justify-between' : 'justify-center'}`}
        >
          {shouldShowExpanded ? (
            <>
              <Link
                to="/"
                className="flex items-center gap-2 rounded-lg p-2 pb-1 pt-1 transition-colors group no-underline"
                title="ホームページに戻る"
              >
                <Donut className="w-5 h-5 text-gray-700 group-hover:text-amber-600 transition-colors" />
                <span className="text-lg font-semibold text-gray-900 group-hover:text-amber-700 transition-colors">
                  {t('auth.welcomeTitle')}
                </span>
              </Link>

              {/* モバイル時は×ボタン、デスクトップ時はPanelRightボタン */}
              <button
                onClick={handleToggleSidebar}
                className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                title={isMobileView ? 'サイドバーを閉じる' : 'サイドバーを閉じる'}
              >
                {isMobileView ? <X className="w-5 h-5" /> : <PanelRight className="w-5 h-5" />}
              </button>
            </>
          ) : (
            <button
              onClick={handleToggleSidebar}
              className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors group"
              title="サイドバーを開く"
            >
              <Donut className="w-5 h-5 text-amber-600 group-hover:hidden" />
              <PanelRight className="w-5 h-5 hidden group-hover:block" />
            </button>
          )}
        </div>

        <div className={`space-y-2 ${!shouldShowExpanded ? 'flex flex-col items-center' : ''}`}>
          <Tooltip content={t('navigation.newChat')} position="right" disabled={shouldShowExpanded}>
            <Link
              to="/chat"
              onClick={handleNewChat}
              className={`p-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2 no-underline ${
                shouldShowExpanded ? 'w-full text-left' : 'w-auto'
              }`}
            >
              <SquarePen className="w-5 h-5 flex-shrink-0" />
              {shouldShowExpanded && <span className="text-sm">{t('navigation.newChat')}</span>}
            </Link>
          </Tooltip>

          <Tooltip
            content={t('navigation.searchChat')}
            position="right"
            disabled={shouldShowExpanded}
          >
            <Link
              to="/search-chat"
              className={`p-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2 no-underline ${
                shouldShowExpanded ? 'w-full text-left' : 'w-auto'
              }`}
            >
              <Search className="w-5 h-5 flex-shrink-0" />
              {shouldShowExpanded && <span className="text-sm">{t('navigation.searchChat')}</span>}
            </Link>
          </Tooltip>

          <Tooltip
            content={t('navigation.searchAgents')}
            position="right"
            disabled={shouldShowExpanded}
          >
            <Link
              to="/search"
              className={`p-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2 no-underline ${
                shouldShowExpanded ? 'w-full text-left' : 'w-auto'
              }`}
            >
              <Bot className="w-5 h-5 flex-shrink-0" />
              {shouldShowExpanded && (
                <span className="text-sm">{t('navigation.searchAgents')}</span>
              )}
            </Link>
          </Tooltip>

          <Tooltip
            content={t('navigation.searchTools')}
            position="right"
            disabled={shouldShowExpanded}
          >
            <Link
              to="/tools"
              className={`p-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2 no-underline ${
                shouldShowExpanded ? 'w-full text-left' : 'w-auto'
              }`}
            >
              <Wrench className="w-5 h-5 flex-shrink-0" />
              {shouldShowExpanded && <span className="text-sm">{t('navigation.searchTools')}</span>}
            </Link>
          </Tooltip>

          <Tooltip content={t('navigation.events')} position="right" disabled={shouldShowExpanded}>
            <Link
              to="/events"
              className={`p-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2 no-underline ${
                shouldShowExpanded ? 'w-full text-left' : 'w-auto'
              }`}
            >
              <CalendarRange className="w-5 h-5 flex-shrink-0" />
              {shouldShowExpanded && <span className="text-sm">{t('navigation.events')}</span>}
            </Link>
          </Tooltip>
        </div>
      </div>

      {/* セッション一覧 - 展開時のみ表示 */}
      {shouldShowExpanded && (
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
            <div className="p-4">
              <LoadingIndicator message={t('chat.loadingSessions')} spacing="none" />
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
              <p className="text-sm">{t('chat.noConversations')}</p>
              <p className="text-xs text-gray-400 mt-1">{t('chat.startNewChat')}</p>
            </div>
          )}

          {sessions.length > 0 && (
            <div className="px-4 py-2 space-y-2">
              {sessions.map((session) => (
                <SessionItem
                  key={session.sessionId}
                  session={session}
                  isActive={session.sessionId === activeSessionId}
                  isNew={newSessionIds.has(session.sessionId)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ユーザー情報 - サイドバーの一番下 */}
      <div
        className={`mt-auto p-4 border-t border-gray-200 ${!shouldShowExpanded ? 'flex justify-center' : ''}`}
      >
        <div className="relative" ref={userDropdownRef}>
          <Tooltip
            content={t('navigation.userMenu')}
            position="right"
            disabled={shouldShowExpanded}
          >
            <button
              onClick={toggleUserDropdown}
              className={`flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 transition-colors ${
                shouldShowExpanded ? 'w-full text-left' : 'w-auto'
              }`}
            >
              <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-gray-600" />
              </div>
              {shouldShowExpanded && (
                <span className="text-sm font-medium text-gray-900 truncate">{user.username}</span>
              )}
            </button>
          </Tooltip>

          {/* ドロップダウンメニュー */}
          {isUserDropdownOpen && (
            <div
              className={`absolute bg-white rounded-2xl shadow-lg border border-gray-200 py-2 z-10 ${
                shouldShowExpanded
                  ? 'bottom-full left-0 right-0 mb-2'
                  : 'bottom-full left-0 mb-2 w-48'
              }`}
            >
              {/* ユーザー情報 - 展開時のみ表示 */}
              {shouldShowExpanded && (
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900">{user.username}</p>
                  <p className="text-xs text-gray-500">{t('auth.authenticated')}</p>
                </div>
              )}

              {/* 折りたたみ時はユーザー名も表示 */}
              {!shouldShowExpanded && (
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900">{user.username}</p>
                  <p className="text-xs text-gray-500">{t('auth.authenticated')}</p>
                </div>
              )}

              {/* 設定 */}
              <Link
                to="/settings"
                onClick={() => setIsUserDropdownOpen(false)}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 no-underline"
              >
                <Settings className="w-4 h-4" />
                {t('navigation.settings')}
              </Link>

              {/* ログアウト */}
              <button
                onClick={handleLogout}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                {t('auth.signOut')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
