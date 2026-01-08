/**
 * Agent管理用Zustandストア（API + LocalStorage）
 */

import { create } from 'zustand';
import type { Agent, CreateAgentInput, UpdateAgentInput, AgentStore } from '../types/agent';
import * as agentsApi from '../api/agents';

const SELECTED_AGENT_KEY = 'agentcore-selected-agent';

/**
 * LocalStorageに選択されたAgentのIDを保存
 */
const saveSelectedAgentIdToStorage = (agentId: string | null): void => {
  try {
    if (agentId) {
      localStorage.setItem(SELECTED_AGENT_KEY, agentId);
    } else {
      localStorage.removeItem(SELECTED_AGENT_KEY);
    }
  } catch (error) {
    console.error('選択AgentID保存エラー:', error);
  }
};

/**
 * LocalStorageから選択されたAgentのIDを読み込む
 */
const loadSelectedAgentIdFromStorage = (): string | null => {
  try {
    const stored = localStorage.getItem(SELECTED_AGENT_KEY);
    return stored || null;
  } catch (error) {
    console.error('選択AgentID読み込みエラー:', error);
    return null;
  }
};

/**
 * AgentStoreの実装
 */
export const useAgentStore = create<AgentStore>((set, get) => ({
  // 初期状態
  agents: [],
  selectedAgent: null,
  isLoading: false,
  error: null,

  // Agent CRUD operations
  createAgent: async (input: CreateAgentInput) => {
    set({ isLoading: true, error: null });

    try {
      const newAgent = await agentsApi.createAgent(input);

      set((state) => ({
        agents: [...state.agents, newAgent],
        isLoading: false,
        error: null,
      }));

      return newAgent;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Agent作成に失敗しました';
      set({ isLoading: false, error: errorMessage });
      throw error;
    }
  },

  updateAgent: async (input: UpdateAgentInput) => {
    set({ isLoading: true, error: null });

    try {
      const updatedAgent = await agentsApi.updateAgent(input.agentId, input);

      set((state) => {
        const agentIndex = state.agents.findIndex((agent) => agent.agentId === input.agentId);
        const updatedAgents = [...state.agents];

        if (agentIndex !== -1) {
          updatedAgents[agentIndex] = updatedAgent;
        }

        // 選択中のAgentが更新された場合は選択状態も更新
        const updatedSelectedAgent =
          state.selectedAgent?.agentId === input.agentId ? updatedAgent : state.selectedAgent;

        return {
          agents: updatedAgents,
          selectedAgent: updatedSelectedAgent,
          isLoading: false,
          error: null,
        };
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Agent更新に失敗しました';
      set({ isLoading: false, error: errorMessage });
      throw error;
    }
  },

  deleteAgent: async (agentId: string) => {
    set({ isLoading: true, error: null });

    try {
      await agentsApi.deleteAgent(agentId);

      set((state) => {
        const updatedAgents = state.agents.filter((agent) => agent.agentId !== agentId);

        // 削除されたAgentが選択中だった場合は選択を解除
        const updatedSelectedAgent =
          state.selectedAgent?.agentId === agentId ? null : state.selectedAgent;

        if (updatedSelectedAgent !== state.selectedAgent) {
          saveSelectedAgentIdToStorage(updatedSelectedAgent?.agentId || null);
        }

        return {
          agents: updatedAgents,
          selectedAgent: updatedSelectedAgent,
          isLoading: false,
          error: null,
        };
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Agent削除に失敗しました';
      set({ isLoading: false, error: errorMessage });
      throw error;
    }
  },

  getAgent: (agentId: string) => {
    return get().agents.find((agent) => agent.agentId === agentId);
  },

  // 共有機能
  toggleShare: async (agentId: string) => {
    set({ isLoading: true, error: null });

    try {
      const updatedAgent = await agentsApi.toggleShareAgent(agentId);

      set((state) => {
        const agentIndex = state.agents.findIndex((agent) => agent.agentId === agentId);
        const updatedAgents = [...state.agents];

        if (agentIndex !== -1) {
          updatedAgents[agentIndex] = updatedAgent;
        }

        // 選択中のAgentが更新された場合は選択状態も更新
        const updatedSelectedAgent =
          state.selectedAgent?.agentId === agentId ? updatedAgent : state.selectedAgent;

        return {
          agents: updatedAgents,
          selectedAgent: updatedSelectedAgent,
          isLoading: false,
          error: null,
        };
      });

      return updatedAgent;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Agent共有状態の変更に失敗しました';
      set({ isLoading: false, error: errorMessage });
      throw error;
    }
  },

  // Select agent
  selectAgent: (agent: Agent | null) => {
    set({ selectedAgent: agent });
    saveSelectedAgentIdToStorage(agent?.agentId || null);
  },

  // ユーティリティ
  initializeStore: async () => {
    set({ isLoading: true, error: null });

    try {
      console.log('🔧 AgentStore初期化開始...');

      // まずAPIからAgent一覧を取得
      let agents = await agentsApi.listAgents();

      // エージェントが0件の場合のみ初期化APIを呼び出し
      if (agents.length === 0) {
        console.log('📝 初回ログイン検出 - デフォルトエージェントを初期化...');
        const result = await agentsApi.initializeAgents();
        agents = result.agents;
        console.log(`✨ デフォルトエージェント作成完了: ${agents.length}件`);
      }

      // 保存されている選択AgentIDを取得
      const selectedAgentId = loadSelectedAgentIdFromStorage();
      let selectedAgent: Agent | null = null;

      // 選択されたAgentIDが有効か確認
      if (selectedAgentId) {
        selectedAgent = agents.find((a) => a.agentId === selectedAgentId) || null;
      }

      // 未選択の場合はデフォルトで最初のAgentを選択
      if (!selectedAgent && agents.length > 0) {
        selectedAgent = agents[0];
        saveSelectedAgentIdToStorage(selectedAgent.agentId);
      }

      console.log(`✅ AgentStore初期化完了: ${agents.length}件`);

      set({
        agents,
        selectedAgent,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('💥 AgentStore初期化エラー:', error);
      set({
        agents: [],
        selectedAgent: null,
        isLoading: false,
        error: error instanceof Error ? error.message : 'ストアの初期化に失敗しました',
      });
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));

/**
 * アプリ起動時にストアを初期化
 */
export const initializeAgentStore = () => {
  useAgentStore.getState().initializeStore();
};

/**
 * 選択されたAgentを取得するヘルパー
 */
export const useSelectedAgent = () => {
  return useAgentStore((state) => state.selectedAgent);
};

/**
 * Agent一覧を取得するヘルパー
 */
export const useAgents = () => {
  return useAgentStore((state) => state.agents);
};
