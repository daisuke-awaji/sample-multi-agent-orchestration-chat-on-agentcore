/**
 * ツール一覧ページ
 * AgentCore Gateway のツール一覧・検索機能を提供
 */

import { useState, useEffect } from 'react';
import {
  Wrench,
  Search,
  Loader2,
  AlertCircle,
  XCircle,
  Settings,
  Zap,
  Code,
  RefreshCw,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useToolStore } from '../stores/toolStore';
import { SessionSidebar } from '../components/SessionSidebar';
import { useUIStore } from '../stores/uiStore';
import type { MCPTool } from '../api/tools';

/**
 * ツールアイテムコンポーネント
 */
interface ToolItemProps {
  tool: MCPTool;
}

function ToolItem({ tool }: ToolItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // ツール名に基づいたアイコンを選択
  const getToolIcon = (toolName: string) => {
    if (toolName.includes('search')) return <Search className="w-4 h-4" />;
    if (toolName.includes('echo') || toolName.includes('ping')) return <Zap className="w-4 h-4" />;
    if (toolName.includes('code') || toolName.includes('script'))
      return <Code className="w-4 h-4" />;
    return <Settings className="w-4 h-4" />;
  };

  // パラメータの表示
  const renderParameters = () => {
    if (!tool.inputSchema.properties) return null;

    const properties = tool.inputSchema.properties;
    const required = tool.inputSchema.required || [];

    return (
      <div className="mt-3 pt-3 border-t border-gray-100">
        <h4 className="text-xs font-medium text-gray-700 mb-2">パラメータ:</h4>
        <div className="space-y-2">
          {Object.entries(properties).map(([paramName, paramInfo]) => {
            const info = paramInfo as Record<string, unknown>;
            return (
              <div key={paramName} className="bg-gray-50 px-3 py-2 rounded text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-blue-600">{paramName}</span>
                  <span className="text-gray-500">({(info.type as string) || 'unknown'})</span>
                  {required.includes(paramName) && (
                    <span className="text-red-500 text-xs">*required</span>
                  )}
                </div>
                {info.description && typeof info.description === 'string' && (
                  <p className="text-gray-600 mt-1">{info.description}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-start gap-3">
        {/* アイコン */}
        <div className="flex-shrink-0 w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-gray-600">
          {getToolIcon(tool.name)}
        </div>

        {/* メインコンテンツ */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900 truncate">{tool.name}</h3>

            {/* 詳細展開ボタン */}
            {tool.inputSchema.properties && Object.keys(tool.inputSchema.properties).length > 0 && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 rounded"
                aria-label={isExpanded ? '詳細を閉じる' : '詳細を表示'}
              >
                <svg
                  className={`w-4 h-4 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            )}
          </div>

          {/* 説明 */}
          {tool.description && (
            <p className="text-gray-600 text-sm mt-1 leading-relaxed">{tool.description}</p>
          )}

          {/* パラメータ詳細（展開時のみ） */}
          {isExpanded && renderParameters()}
        </div>
      </div>
    </div>
  );
}

/**
 * ツール一覧ページメインコンポーネント
 */
export function ToolsPage() {
  const { user } = useAuthStore();
  const { isSidebarOpen } = useUIStore();
  const {
    tools,
    isLoading,
    error,
    searchQuery,
    searchResults,
    isSearching,
    searchError,
    loadTools,
    searchToolsWithQuery,
    clearSearch,
    setSearchQuery,
    clearError,
  } = useToolStore();

  const [localSearchQuery, setLocalSearchQuery] = useState('');

  // 初回ロード
  useEffect(() => {
    if (user) {
      loadTools(user);
    }
  }, [user, loadTools]);

  // 検索実行
  const handleSearch = async () => {
    if (!user) return;
    if (!localSearchQuery.trim()) {
      clearSearch();
      return;
    }
    await searchToolsWithQuery(user, localSearchQuery.trim());
  };

  // Enterキーでの検索
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // 検索クリア
  const handleClearSearch = () => {
    setLocalSearchQuery('');
    setSearchQuery('');
    clearSearch();
  };

  // 再読み込み
  const handleRefresh = () => {
    if (user) {
      clearError();
      loadTools(user);
    }
  };

  // 表示するツール一覧を決定
  const displayTools = searchQuery ? searchResults : tools;
  const currentLoading = searchQuery ? isSearching : isLoading;
  const currentError = searchQuery ? searchError : error;

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-full w-full">
      {/* サイドバー - 常に表示、幅のみ切り替え */}
      <div
        className={`
          transition-all duration-300 ease-in-out flex-shrink-0
          ${isSidebarOpen ? 'w-80' : 'w-16'}
        `}
      >
        <SessionSidebar />
      </div>

      {/* メインコンテンツエリア */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {/* ヘッダー */}
        <div className="border-b border-gray-200 bg-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Wrench className="w-6 h-6 text-gray-700" />
              <h1 className="text-xl font-semibold text-gray-900">利用可能なツール</h1>
            </div>
            <button
              onClick={handleRefresh}
              disabled={currentLoading}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              aria-label="再読み込み"
            >
              <RefreshCw className={`w-4 h-4 ${currentLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* メインコンテンツ */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* 検索セクション */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Search className="w-4 h-4 text-gray-600" />
              <h2 className="text-sm font-medium text-gray-900">ツールを検索</h2>
            </div>

            <div className="flex gap-3">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={localSearchQuery}
                  onChange={(e) => setLocalSearchQuery(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="自然言語でツールを検索... (例: 'テキストをエコーする')"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
                {localSearchQuery && (
                  <button
                    onClick={handleClearSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                onClick={handleSearch}
                disabled={isSearching || !localSearchQuery.trim()}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : '検索'}
              </button>
            </div>

            {searchQuery && (
              <div className="mt-3 flex items-center gap-2 text-xs text-gray-600">
                <span>検索中: "{searchQuery}"</span>
                <button
                  onClick={handleClearSearch}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  クリア
                </button>
              </div>
            )}
          </div>

          {/* エラー表示 */}
          {currentError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <div>
                  <h3 className="text-sm font-medium text-red-900">エラーが発生しました</h3>
                  <p className="text-red-700 text-sm mt-1">{currentError}</p>
                  <button
                    onClick={() => clearError()}
                    className="mt-2 text-red-600 hover:text-red-700 font-medium text-xs"
                  >
                    エラーを閉じる
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ツール一覧 */}
          <div>
            {/* ヘッダー情報 */}
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-medium text-gray-900">
                {searchQuery ? '検索結果' : '利用可能なツール'}
                <span className="ml-2 text-gray-500 font-normal text-sm">
                  ({currentLoading ? '読み込み中...' : `${displayTools.length}件`})
                </span>
              </h2>
            </div>

            {/* 説明文 */}
            {!searchQuery && (
              <p className="text-xs text-gray-500 mb-4">
                AgentCore Gateway
                から提供されるツール一覧です。各ツールは自然言語での検索や、パラメータの詳細確認が可能です。
              </p>
            )}

            {/* ローディング */}
            {currentLoading && displayTools.length === 0 && (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto mb-3" />
                  <p className="text-gray-600 text-sm">
                    {searchQuery ? 'ツールを検索しています...' : 'ツール一覧を読み込んでいます...'}
                  </p>
                </div>
              </div>
            )}

            {/* ツールがない場合 */}
            {!currentLoading && displayTools.length === 0 && !currentError && (
              <div className="text-center py-12">
                <Wrench className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-sm font-medium text-gray-600 mb-2">
                  {searchQuery ? '検索結果が見つかりません' : 'ツールが見つかりません'}
                </h3>
                <p className="text-gray-500 text-sm">
                  {searchQuery
                    ? '別のキーワードで検索してみてください'
                    : 'Gateway に登録されているツールがありません'}
                </p>
              </div>
            )}

            {/* ツールリスト */}
            {displayTools.length > 0 && (
              <div className="space-y-4">
                {displayTools.map((tool, index) => (
                  <ToolItem key={`${tool.name}-${index}`} tool={tool} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
