/**
 * ツール状態管理ストア
 * AgentCore Gateway のツール一覧・検索状態を管理
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { User } from '../types/index';
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

  // 検索機能
  searchQuery: string;
  searchResults: MCPTool[];
  isSearching: boolean;
  searchError: string | null;

  // Gateway 接続状態
  gatewayHealthy: boolean;
  gatewayStatus: 'unknown' | 'healthy' | 'unhealthy';

  // アクション
  loadTools: (user: User) => Promise<void>;
  searchToolsWithQuery: (user: User, query: string) => Promise<void>;
  clearSearch: () => void;
  setSearchQuery: (query: string) => void;
  checkGateway: (user: User) => Promise<void>;
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

      searchQuery: '',
      searchResults: [],
      isSearching: false,
      searchError: null,

      gatewayHealthy: false,
      gatewayStatus: 'unknown',

      /**
       * ツール一覧を読み込み
       */
      loadTools: async (user: User) => {
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
        });

        try {
          console.log('🔧 ツール一覧読み込み開始');

          const tools = await fetchTools(user);

          set({
            tools,
            isLoading: false,
            error: null,
            lastFetchTime: new Date().toISOString(),
            gatewayHealthy: true,
            gatewayStatus: 'healthy',
          });

          console.log(`✅ ツール一覧読み込み完了: ${tools.length}件`);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'ツール一覧の読み込みに失敗しました';

          console.error('💥 ツール一覧読み込みエラー:', error);

          set({
            tools: [],
            isLoading: false,
            error: errorMessage,
            lastFetchTime: null,
            gatewayHealthy: false,
            gatewayStatus: 'unhealthy',
          });
        }
      },

      /**
       * ツール検索を実行
       */
      searchToolsWithQuery: async (user: User, query: string) => {
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

          const searchResults = await searchTools(user, trimmedQuery);

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
      checkGateway: async (user: User) => {
        try {
          console.log('💓 Gateway 接続状態確認開始');

          const healthResponse = await checkGatewayHealth(user);

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
