/**
 * 共有Agent管理用Zustandストア
 */

import { create } from 'zustand';
import type { Agent } from '../types/agent';
import * as agentsApi from '../api/agents';

interface SharedAgentState {
  sharedAgents: Agent[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
}

interface SharedAgentActions {
  // 共有Agent一覧取得
  fetchSharedAgents: (searchQuery?: string) => Promise<void>;

  // 検索クエリ更新
  setSearchQuery: (query: string) => void;

  // 共有Agentをマイエージェントに追加
  cloneAgent: (userId: string, agentId: string) => Promise<Agent>;

  // エラークリア
  clearError: () => void;
}

export type SharedAgentStore = SharedAgentState & SharedAgentActions;

export const useSharedAgentStore = create<SharedAgentStore>((set, get) => ({
  // 初期状態
  sharedAgents: [],
  isLoading: false,
  error: null,
  searchQuery: '',

  // 共有Agent一覧取得
  fetchSharedAgents: async (searchQuery?: string) => {
    set({ isLoading: true, error: null });

    try {
      const query = searchQuery !== undefined ? searchQuery : get().searchQuery;
      console.log('📋 共有Agent一覧取得開始...', { query });

      const agents = await agentsApi.listSharedAgents(query || undefined, 50);

      console.log(`✅ 共有Agent一覧取得完了: ${agents.length}件`);

      set({
        sharedAgents: agents,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : '共有Agent一覧の取得に失敗しました';
      console.error('💥 共有Agent一覧取得エラー:', error);
      set({
        sharedAgents: [],
        isLoading: false,
        error: errorMessage,
      });
    }
  },

  // 検索クエリ更新
  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },

  // 共有Agentをマイエージェントに追加
  cloneAgent: async (userId: string, agentId: string) => {
    set({ isLoading: true, error: null });

    try {
      console.log('📥 共有Agentクローン開始...', { userId, agentId });

      const clonedAgent = await agentsApi.cloneSharedAgent(userId, agentId);

      console.log(`✅ 共有Agentクローン完了: ${clonedAgent.id}`);

      set({ isLoading: false, error: null });

      return clonedAgent;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : '共有Agentのクローンに失敗しました';
      console.error('💥 共有Agentクローンエラー:', error);
      set({ isLoading: false, error: errorMessage });
      throw error;
    }
  },

  // エラークリア
  clearError: () => {
    set({ error: null });
  },
}));
