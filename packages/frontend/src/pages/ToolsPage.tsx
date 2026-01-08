/**
 * ツール一覧ページ
 * AgentCore Gateway のツール一覧・検索機能を提供
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Wrench, Search, Loader2, AlertCircle, XCircle, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useToolStore } from '../stores/toolStore';
import { LoadingIndicator } from '../components/ui/LoadingIndicator';
import { PageHeader } from '../components/ui/PageHeader';
import { getToolIcon } from '../utils/toolIcons';
import type { MCPTool } from '../api/tools';

/**
 * ツールアイテムコンポーネント
 */
interface ToolItemProps {
  tool: MCPTool;
}

function ToolItem({ tool }: ToolItemProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  // パラメータの表示
  const renderParameters = () => {
    if (!tool.inputSchema.properties) return null;

    const properties = tool.inputSchema.properties;
    const required = tool.inputSchema.required || [];

    return (
      <div className="mt-3 pt-3 border-t border-gray-100">
        <h4 className="text-xs font-medium text-gray-700 mb-2">{t('tool.parameters')}:</h4>
        <div className="space-y-2">
          {Object.entries(properties).map(([paramName, paramInfo]) => {
            const info = paramInfo as Record<string, unknown>;
            const typeString = typeof info.type === 'string' ? info.type : 'unknown';
            const description = typeof info.description === 'string' ? info.description : null;

            return (
              <div key={paramName} className="bg-gray-50 px-3 py-2 rounded text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-blue-600">{paramName}</span>
                  <span className="text-gray-500">({typeString})</span>
                  {required.includes(paramName) && (
                    <span className="text-red-500 text-xs">*{t('tool.required')}</span>
                  )}
                </div>
                {description && <p className="text-gray-600 mt-1">{description}</p>}
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
                aria-label={isExpanded ? t('tool.hideDetails') : t('tool.showDetails')}
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

          {/* Description */}
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
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const {
    tools,
    isLoading,
    error,
    nextCursor,
    searchQuery,
    searchResults,
    isSearching,
    searchError,
    loadTools,
    loadMoreTools,
    searchToolsWithQuery,
    clearSearch,
    setSearchQuery,
    clearError,
  } = useToolStore();

  const [localSearchQuery, setLocalSearchQuery] = useState('');

  // 初回ロード
  useEffect(() => {
    if (user) {
      loadTools();
    }
  }, [user, loadTools]);

  // 検索実行
  const handleSearch = async () => {
    if (!user) return;
    if (!localSearchQuery.trim()) {
      clearSearch();
      return;
    }
    await searchToolsWithQuery(localSearchQuery.trim());
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
      loadTools();
    }
  };

  // 次のページを読み込み
  const handleLoadMore = async () => {
    if (user) {
      await loadMoreTools();
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
    <>
      {/* ヘッダー */}
      <PageHeader
        icon={Wrench}
        title={t('tool.availableTools')}
        actions={
          <button
            onClick={handleRefresh}
            disabled={currentLoading}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            aria-label={t('tool.refresh')}
          >
            <RefreshCw className={`w-4 h-4 ${currentLoading ? 'animate-spin' : ''}`} />
          </button>
        }
      />

      {/* メインコンテンツ */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* 検索セクション */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Search className="w-4 h-4 text-gray-600" />
            <h2 className="text-sm font-medium text-gray-900">{t('tool.searchTools')}</h2>
          </div>

          <div className="flex gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={localSearchQuery}
                onChange={(e) => setLocalSearchQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={t('tool.searchPlaceholder')}
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
              {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : t('common.search')}
            </button>
          </div>

          {searchQuery && (
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-600">
              <span>
                {t('tool.searchingFor')}: {searchQuery}
              </span>
              <button
                onClick={handleClearSearch}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                {t('common.clear')}
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
                <h3 className="text-sm font-medium text-red-900">{t('common.error')}</h3>
                <p className="text-red-700 text-sm mt-1">{currentError}</p>
                <button
                  onClick={() => clearError()}
                  className="mt-2 text-red-600 hover:text-red-700 font-medium text-xs"
                >
                  {t('tool.closeError')}
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
              {searchQuery ? t('tool.searchResults') : t('tool.availableTools')}
              <span className="ml-2 text-gray-500 font-normal text-sm">
                (
                {currentLoading
                  ? t('common.loading')
                  : `${displayTools.length}${t('tool.displayedCount')}`}
                )
              </span>
            </h2>
          </div>

          {/* Description文 */}
          {!searchQuery && (
            <p className="text-xs text-gray-500 mb-4">{t('tool.toolsPageDescription')}</p>
          )}

          {/* ローディング */}
          {currentLoading && displayTools.length === 0 && (
            <LoadingIndicator
              message={searchQuery ? t('tool.searching') : t('tool.loadingTools')}
              spacing="lg"
            />
          )}

          {/* ツールがない場合 */}
          {!currentLoading && displayTools.length === 0 && !currentError && (
            <div className="text-center py-12">
              <Wrench className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-sm font-medium text-gray-600 mb-2">
                {searchQuery ? t('tool.noSearchResults') : t('tool.noToolsFound')}
              </h3>
              <p className="text-gray-500 text-sm">
                {searchQuery ? t('tool.tryDifferentKeyword') : t('tool.noToolsRegistered')}
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

          {/* ページネーション（検索時は非表示） */}
          {!searchQuery && nextCursor && displayTools.length > 0 && (
            <div className="flex justify-center mt-8 pt-6 border-t border-gray-100">
              <button
                onClick={handleLoadMore}
                disabled={isLoading}
                className="flex items-center gap-2 px-6 py-3 bg-gray-500 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('common.loading')}
                  </>
                ) : (
                  <>
                    {t('tool.loadMore')}
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </>
                )}
              </button>
            </div>
          )}

          {/* ページネーション情報 */}
          {!searchQuery && displayTools.length > 0 && (
            <div className="mt-4 text-center">
              <p className="text-xs text-gray-500">
                {displayTools.length}
                {t('tool.displayedCount')}
                {nextCursor ? ` / ${t('tool.hasMore')}` : ` / ${t('tool.allLoaded')}`}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
