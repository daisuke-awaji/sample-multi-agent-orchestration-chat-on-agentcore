/**
 * ツール状態管理ストア
 * AgentCore Gateway のツール一覧・検索状態を管理
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { MCPTool } from '../api/tools';
import { fetchTools, searchTools, checkGatewayHealth } from '../api/tools';

/**
 * ツールストアの状態型定義
 */
export interface ToolStoreState {
  // ツールリスト
  tools: MCPTool[];
  isLoading: boolean;
  error: string | null;
  lastFetchTime: string | null;
  nextCursor: string | null; // ページネーション用

  // 検索機能
  searchQuery: string;
  searchResults: MCPTool[];
  isSearching: boolean;
  searchError: string | null;

  // Gateway 接続状態
  gatewayHealthy: boolean;
  gatewayStatus: 'unknown' | 'healthy' | 'unhealthy';

  // アクション
  loadTools: () => Promise<void>;
  loadMoreTools: () => Promise<void>; // 追加ページ読み込み
  searchToolsWithQuery: (query: string) => Promise<void>;
  clearSearch: () => void;
  setSearchQuery: (query: string) => void;
  checkGateway: () => Promise<void>;
  clearError: () => void;
}

/**
 * ツール管理ストア
 */
export const useToolStore = create<ToolStoreState>()(
  devtools(
    (set, get) => ({
      // 初期状態
      tools: [],
      isLoading: false,
      error: null,
      lastFetchTime: null,
      nextCursor: null, // 追加

      searchQuery: '',
      searchResults: [],
      isSearching: false,
      searchError: null,

      gatewayHealthy: false,
      gatewayStatus: 'unknown',

      /**
       * ツール一覧を読み込み（最初のページ）
       */
      loadTools: async () => {
        const currentState = get();

        // 既に読み込み中の場合は重複実行を避ける
        if (currentState.isLoading) {
          console.log('🔧 ツール一覧読み込み中のため、重複実行をスキップ');
          return;
        }

        set({
          isLoading: true,
          error: null,
          gatewayStatus: 'unknown',
          nextCursor: null, // リセット
        });

        try {
          console.log('🔧 ツール一覧読み込み開始');

          const result = await fetchTools();

          set({
            tools: result.tools,
            nextCursor: result.nextCursor || null,
            isLoading: false,
            error: null,
            lastFetchTime: new Date().toISOString(),
            gatewayHealthy: true,
            gatewayStatus: 'healthy',
          });

          console.log(
            `✅ ツール一覧読み込み完了: ${result.tools.length}件`,
            result.nextCursor ? { nextCursor: 'あり' } : { nextCursor: 'なし' }
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'ツール一覧の読み込みに失敗しました';

          console.error('💥 ツール一覧読み込みエラー:', error);

          set({
            tools: [],
            nextCursor: null,
            isLoading: false,
            error: errorMessage,
            lastFetchTime: null,
            gatewayHealthy: false,
            gatewayStatus: 'unhealthy',
          });
        }
      },

      /**
       * 追加ページを読み込み
       */
      loadMoreTools: async () => {
        const currentState = get();

        if (currentState.isLoading || !currentState.nextCursor) {
          console.log('🔧 追加読み込み不可: 読み込み中またはnextCursorなし');
          return;
        }

        set({
          isLoading: true,
          error: null,
        });

        try {
          console.log('🔧 追加ツール読み込み開始', { cursor: currentState.nextCursor });

          const result = await fetchTools(currentState.nextCursor);

          set({
            tools: [...currentState.tools, ...result.tools], // 既存のツールに追加
            nextCursor: result.nextCursor || null,
            isLoading: false,
            error: null,
            lastFetchTime: new Date().toISOString(),
            gatewayHealthy: true,
            gatewayStatus: 'healthy',
          });

          console.log(
            `✅ 追加ツール読み込み完了: +${result.tools.length}件 (合計: ${currentState.tools.length + result.tools.length}件)`,
            result.nextCursor ? { nextCursor: 'あり' } : { nextCursor: 'なし' }
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : '追加ツールの読み込みに失敗しました';

          console.error('💥 追加ツール読み込みエラー:', error);

          set({
            isLoading: false,
            error: errorMessage,
            gatewayHealthy: false,
            gatewayStatus: 'unhealthy',
          });
        }
      },

      /**
       * ツール検索を実行
       */
      searchToolsWithQuery: async (query: string) => {
        if (!query || query.trim().length === 0) {
          set({
            searchQuery: '',
            searchResults: [],
            searchError: '検索クエリを入力してください',
          });
          return;
        }

        const trimmedQuery = query.trim();

        set({
          searchQuery: trimmedQuery,
          isSearching: true,
          searchError: null,
          searchResults: [],
        });

        try {
          console.log(`🔍 ツール検索実行: "${trimmedQuery}"`);

          const searchResults = await searchTools(trimmedQuery);

          set({
            searchResults,
            isSearching: false,
            searchError: null,
            gatewayHealthy: true,
            gatewayStatus: 'healthy',
          });

          console.log(`✅ ツール検索完了: ${searchResults.length}件 (クエリ: "${trimmedQuery}")`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'ツール検索に失敗しました';

          console.error('💥 ツール検索エラー:', error);

          set({
            searchResults: [],
            isSearching: false,
            searchError: errorMessage,
            gatewayHealthy: false,
            gatewayStatus: 'unhealthy',
          });
        }
      },

      /**
       * 検索状態をクリア
       */
      clearSearch: () => {
        console.log('🧹 検索状態をクリア');
        set({
          searchQuery: '',
          searchResults: [],
          isSearching: false,
          searchError: null,
        });
      },

      /**
       * 検索クエリを設定
       */
      setSearchQuery: (query: string) => {
        set({
          searchQuery: query,
        });
      },

      /**
       * Gateway の接続状態を確認
       */
      checkGateway: async () => {
        try {
          console.log('💓 Gateway 接続状態確認開始');

          const healthResponse = await checkGatewayHealth();

          set({
            gatewayHealthy: healthResponse.gateway.connected,
            gatewayStatus: healthResponse.status,
          });

          console.log(`✅ Gateway 接続状態確認完了: ${healthResponse.status}`);
        } catch (error) {
          console.error('💥 Gateway 接続状態確認エラー:', error);

          set({
            gatewayHealthy: false,
            gatewayStatus: 'unhealthy',
          });
        }
      },

      /**
       * エラー状態をクリア
       */
      clearError: () => {
        set({
          error: null,
          searchError: null,
        });
      },
    }),
    {
      name: 'tool-store',
      // 開発時のみ有効
      enabled: import.meta.env.DEV,
    }
  )
);
