/**
 * メインレイアウトコンポーネント
 * サイドバーと共通レイアウトを提供
 */

import { useEffect, useState } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { Menu, Bot, SquarePen } from 'lucide-react';
import * as icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SessionSidebar } from '../components/SessionSidebar';
import { useUIStore } from '../stores/uiStore';
import { useSelectedAgent } from '../stores/agentStore';
import { AgentSelectorModal } from '../components/AgentSelectorModal';
import type { Agent } from '../types/agent';
import { translateIfKey } from '../utils/agent-translation';
import { getPageTitleKey } from '../config/routes';
import { useSessionStore } from '../stores/sessionStore';

export function MainLayout() {
  const { isSidebarOpen, isMobileView, setSidebarOpen, setMobileView, setNarrowDesktop } =
    useUIStore();
  const location = useLocation();
  const { t } = useTranslation();
  const selectedAgent = useSelectedAgent();
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const { clearActiveSession } = useSessionStore();

  // ページタイトルを取得
  const getPageTitle = () => {
    const path = location.pathname;

    // チャットページの場合はエージェント名を返す
    if (path.startsWith('/chat')) {
      return selectedAgent ? translateIfKey(selectedAgent.name, t) : '汎用アシスタント';
    }

    // ルート設定から翻訳キーを取得
    const titleKey = getPageTitleKey(path);
    return titleKey ? t(titleKey) : '';
  };

  // ページアイコンを取得
  const getPageIcon = () => {
    const path = location.pathname;

    // チャットページの場合はエージェントアイコンを返す
    if (path.startsWith('/chat') && selectedAgent?.icon) {
      const AgentIcon = (icons[selectedAgent.icon as keyof typeof icons] as LucideIcon) || Bot;
      return <AgentIcon className="w-5 h-5 text-gray-700 flex-shrink-0" />;
    }

    return null;
  };

  // タイトルクリック処理
  const handleTitleClick = () => {
    if (location.pathname.startsWith('/chat')) {
      setIsAgentModalOpen(true);
    }
  };

  // Agent選択処理
  const handleAgentSelect = (agent: Agent | null) => {
    console.log('Agent selected:', agent?.name || 'None');
  };

  // 新しいチャット作成処理
  const handleNewChat = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.button === 1) {
      return;
    }
    clearActiveSession();
  };

  const pageTitle = getPageTitle();
  const pageIcon = getPageIcon();
  const isChatPage = location.pathname.startsWith('/chat');

  // レスポンシブ対応: 3段階のブレークポイント
  // - < 768px: モバイル（完全非表示、ハンバーガーメニューのみ）
  // - 768px - 1024px: ナローデスクトップ（自動折りたたみ）
  // - > 1024px: ワイドデスクトップ（ユーザー設定に従う）
  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 767px)');
    const narrowDesktopQuery = window.matchMedia('(min-width: 768px) and (max-width: 1023px)');

    const handleResize = () => {
      const isMobile = mobileQuery.matches;
      const isNarrow = narrowDesktopQuery.matches;

      setMobileView(isMobile);
      setNarrowDesktop(isNarrow);

      if (isMobile) {
        // モバイル: サイドバーを閉じる（オーバーレイ形式）
        setSidebarOpen(false);
      } else if (isNarrow) {
        // ナローデスクトップ: 自動的に折りたたむ
        setSidebarOpen(false);
      }
      // ワイドデスクトップ(> 1024px)の場合は何もしない（ユーザー設定を保持）
    };

    // 初回チェック
    handleResize();

    // リスナー登録
    mobileQuery.addEventListener('change', handleResize);
    narrowDesktopQuery.addEventListener('change', handleResize);

    return () => {
      mobileQuery.removeEventListener('change', handleResize);
      narrowDesktopQuery.removeEventListener('change', handleResize);
    };
  }, [setSidebarOpen, setMobileView, setNarrowDesktop]);

  // オーバーレイのクリック処理（モバイル時のみ）
  const handleOverlayClick = () => {
    if (isMobileView) {
      setSidebarOpen(false);
    }
  };

  return (
    <div className="flex h-full w-full relative">
      {/* モバイル時のハンバーガーメニュー */}
      {isMobileView && !isSidebarOpen && (
        <header className="fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-200 px-3 py-2 flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
            aria-label="サイドバーを開く"
          >
            <Menu className="w-5 h-5" />
          </button>

          {pageTitle && (
            <button
              onClick={handleTitleClick}
              className={`flex items-center gap-2 flex-1 min-w-0 ${
                isChatPage ? 'hover:bg-gray-50 rounded-lg p-2 transition-colors' : 'cursor-default'
              }`}
              disabled={!isChatPage}
            >
              {pageIcon}
              <h1 className="text-base font-semibold text-gray-900 truncate">{pageTitle}</h1>
            </button>
          )}

          <Link
            to="/chat"
            onClick={handleNewChat}
            className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
            aria-label={t('sidebar.newChat')}
            title={t('sidebar.newChat')}
          >
            <SquarePen className="w-5 h-5" />
          </Link>
        </header>
      )}

      {/* モバイル時のオーバーレイ背景 */}
      {isMobileView && isSidebarOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={handleOverlayClick} />
      )}

      {/* サイドバー */}
      {isMobileView ? (
        // モバイル時: オーバーレイサイドバー
        <div
          className={`
            fixed top-0 left-0 h-full z-50 transition-transform duration-300 ease-in-out
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          `}
        >
          <SessionSidebar />
        </div>
      ) : (
        // デスクトップ時: 通常のサイドバー
        <div
          className={`
            transition-all duration-300 ease-in-out flex-shrink-0
            ${isSidebarOpen ? 'w-80' : 'w-16'}
          `}
        >
          <SessionSidebar />
        </div>
      )}

      {/* メインコンテンツエリア */}
      <div
        className={`flex-1 flex flex-col min-w-0 bg-white ${isMobileView && !isSidebarOpen ? 'pt-12' : ''}`}
      >
        <Outlet />
      </div>

      {/* Agent選択モーダル */}
      <AgentSelectorModal
        isOpen={isAgentModalOpen}
        onClose={() => setIsAgentModalOpen(false)}
        onAgentSelect={handleAgentSelect}
      />
    </div>
  );
}
