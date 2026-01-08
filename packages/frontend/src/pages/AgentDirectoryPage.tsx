/**
 * Agent Directory ページ
 * 共有されたエージェントの一覧表示と検索
 */

import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Search, Bot, Users, XCircle, Loader2 } from 'lucide-react';
import * as icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useSharedAgentStore } from '../stores/sharedAgentStore';
import { SharedAgentDetailModal } from '../components/SharedAgentDetailModal';
import { LoadingIndicator } from '../components/ui/LoadingIndicator';
import { PageHeader } from '../components/ui/PageHeader';
import type { Agent } from '../types/agent';
import { translateIfKey } from '../utils/agent-translation';

/**
 * Agent Directory ページメインコンポーネント
 */
export function AgentDirectoryPage() {
  const { t } = useTranslation();
  const {
    sharedAgents,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    fetchSharedAgents,
    loadMoreAgents,
  } = useSharedAgentStore();

  const [searchParams, setSearchParams] = useSearchParams();
  const [localSearchQuery, setLocalSearchQuery] = useState('');

  // 検索フィルタリング
  const filteredAgents = useMemo(() => {
    if (!localSearchQuery.trim()) {
      return sharedAgents;
    }

    const query = localSearchQuery.toLowerCase();
    return sharedAgents.filter((agent) => {
      const name = translateIfKey(agent.name, t).toLowerCase();
      const description = translateIfKey(agent.description, t).toLowerCase();
      return name.includes(query) || description.includes(query);
    });
  }, [sharedAgents, localSearchQuery, t]);

  // URLパラメータから選択されたエージェントを派生させる（useEffectではなくuseMemoを使用）
  const selectedAgent = useMemo(() => {
    const agentParam = searchParams.get('agent');
    if (agentParam && sharedAgents.length > 0) {
      return sharedAgents.find((a) => `${a.createdBy}-${a.agentId}` === agentParam) || null;
    }
    return null;
  }, [searchParams, sharedAgents]);

  // 初回ロード
  useEffect(() => {
    fetchSharedAgents();
  }, [fetchSharedAgents]);

  // DynamoDB検索を実行（デフォルトエージェントはフロントエンドでフィルタリング済み）
  const handleSearch = () => {
    if (localSearchQuery.trim()) {
      // DynamoDB側の検索も実行
      fetchSharedAgents(localSearchQuery);
    }
  };

  // Enterキーで検索
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // 検索クリア
  const handleClearSearch = () => {
    setLocalSearchQuery('');
  };

  // エージェントカードクリック
  const handleAgentClick = (agent: Agent) => {
    // URLパラメータを更新
    setSearchParams({ agent: `${agent.createdBy}-${agent.agentId}` });
  };

  // モーダルをクローズ
  const handleCloseModal = () => {
    // URLパラメータを削除
    setSearchParams({});
  };

  return (
    <>
      {/* ヘッダー */}
      <PageHeader icon={Users} title={t('navigation.searchAgents')} />

      {/* メインコンテンツ */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Description文 */}
        <p className="text-sm text-gray-600 mb-6">{t('agentDirectory.description')}</p>

        {/* 検索セクション */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Search className="w-4 h-4 text-gray-600" />
            <h2 className="text-sm font-medium text-gray-900">{t('agentDirectory.searchTitle')}</h2>
          </div>

          <div className="flex gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={localSearchQuery}
                onChange={(e) => setLocalSearchQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={t('agentDirectory.searchPlaceholder')}
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
              disabled={isLoading || !localSearchQuery.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('common.search')}
            </button>
          </div>
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* ローディング */}
        {isLoading && (
          <div className="py-20">
            <LoadingIndicator message={t('agentDirectory.loading')} size="lg" />
          </div>
        )}

        {/* エージェント一覧 */}
        {!isLoading && filteredAgents.length === 0 && (
          <div className="text-center py-20">
            <Bot className="w-16 h-16 text-gray-300 mx-auto mb-6" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {t('agentDirectory.noAgentsFound')}
            </h3>
            <p className="text-gray-500">
              {localSearchQuery
                ? t('agentDirectory.noAgentsDescription')
                : t('agentDirectory.noAgentsEmpty')}
            </p>
          </div>
        )}

        {!isLoading && filteredAgents.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredAgents.map((agent) => {
                const AgentIcon = (icons[agent.icon as keyof typeof icons] as LucideIcon) || Bot;

                return (
                  <div
                    key={`${agent.createdBy}-${agent.agentId}`}
                    onClick={() => handleAgentClick(agent)}
                    className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 hover:shadow-md transition-all cursor-pointer"
                  >
                    {/* アイコンと名前 */}
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <AgentIcon className="w-5 h-5 text-gray-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 truncate">
                          {translateIfKey(agent.name, t)}
                        </h3>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                      {translateIfKey(agent.description, t)}
                    </p>

                    {/* 作成者 */}
                    <div className="text-xs text-gray-500">
                      {t('agentDirectory.createdBy')}:{' '}
                      <span className="font-medium">{agent.createdBy}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ページネーション: もっと読み込むボタン */}
            {hasMore && (
              <div className="flex justify-center mt-8 pt-6 border-t border-gray-100">
                <button
                  onClick={loadMoreAgents}
                  disabled={isLoadingMore}
                  className="flex items-center gap-2 px-6 py-3 bg-gray-500 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('common.loading')}
                    </>
                  ) : (
                    <>{t('agentDirectory.loadMore')}</>
                  )}
                </button>
              </div>
            )}

            {/* 表示件数情報 */}
            <p className="text-center text-xs text-gray-500 mt-4">
              {filteredAgents.length}
              {t('agentDirectory.itemsDisplayed')}{' '}
              {hasMore ? `/ ${t('agentDirectory.hasMore')}` : `/ ${t('agentDirectory.allLoaded')}`}
            </p>
          </>
        )}
      </div>

      {/* 共有エージェント詳細モーダル */}
      <SharedAgentDetailModal agent={selectedAgent} onClose={handleCloseModal} />
    </>
  );
}
