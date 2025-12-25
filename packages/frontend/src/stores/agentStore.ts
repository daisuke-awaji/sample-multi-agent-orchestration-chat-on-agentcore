/**
 * Agent管理用Zustandストア（LocalStorage永続化）
 */

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Agent, CreateAgentInput, UpdateAgentInput, AgentStore } from '../types/agent';
import { DEFAULT_AGENTS } from '../types/agent';

const STORAGE_KEY = 'agentcore-agents';
const SELECTED_AGENT_KEY = 'agentcore-selected-agent';

/**
 * LocalStorageからAgentデータを読み込む
 */
const loadAgentsFromStorage = (): Agent[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);
    return parsed.map(
      (agent: { createdAt: string | number | Date; updatedAt: string | number | Date }) => ({
        ...agent,
        createdAt: new Date(agent.createdAt),
        updatedAt: new Date(agent.updatedAt),
      })
    ) as Agent[];
  } catch (error) {
    console.error('Agent一覧の読み込みに失敗:', error);
    return [];
  }
};

/**
 * LocalStorageに選択されたAgentを保存
 */
const saveSelectedAgentToStorage = (agent: Agent | null): void => {
  try {
    if (agent) {
      localStorage.setItem(
        SELECTED_AGENT_KEY,
        JSON.stringify({
          ...agent,
          createdAt: agent.createdAt.toISOString(),
          updatedAt: agent.updatedAt.toISOString(),
        })
      );
    } else {
      localStorage.removeItem(SELECTED_AGENT_KEY);
    }
  } catch (error) {
    console.error('選択Agent保存エラー:', error);
  }
};

/**
 * LocalStorageから選択されたAgentを読み込む
 */
const loadSelectedAgentFromStorage = (): Agent | null => {
  try {
    const stored = localStorage.getItem(SELECTED_AGENT_KEY);
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored);
    return {
      ...parsed,
      createdAt: new Date(parsed.createdAt),
      updatedAt: new Date(parsed.updatedAt),
    };
  } catch (error) {
    console.error('選択Agent読み込みエラー:', error);
    return null;
  }
};

/**
 * LocalStorageにAgentデータを保存
 */
const saveAgentsToStorage = (agents: Agent[]): void => {
  try {
    const serializable = agents.map((agent) => ({
      ...agent,
      createdAt: agent.createdAt.toISOString(),
      updatedAt: agent.updatedAt.toISOString(),
    }));

    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch (error) {
    console.error('Agent一覧の保存に失敗:', error);
  }
};

/**
 * デフォルトAgentを作成
 */
const createDefaultAgents = (): Agent[] => {
  const now = new Date();

  return DEFAULT_AGENTS.map((input) => ({
    id: uuidv4(),
    ...input,
    scenarios: input.scenarios.map((scenario) => ({
      ...scenario,
      id: uuidv4(),
    })),
    createdAt: now,
    updatedAt: now,
  }));
};

/**
 * CreateAgentInputからAgentを作成
 */
const createAgentFromInput = (input: CreateAgentInput): Agent => {
  const now = new Date();

  return {
    id: uuidv4(),
    name: input.name,
    description: input.description,
    icon: input.icon,
    systemPrompt: input.systemPrompt,
    enabledTools: [...input.enabledTools],
    scenarios: input.scenarios.map((scenario) => ({
      ...scenario,
      id: uuidv4(),
    })),
    mcpConfig: input.mcpConfig,
    createdAt: now,
    updatedAt: now,
  };
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

  // Agent CRUD操作
  createAgent: (input: CreateAgentInput) => {
    const newAgent = createAgentFromInput(input);

    set((state) => {
      const updatedAgents = [...state.agents, newAgent];
      saveAgentsToStorage(updatedAgents);

      return {
        agents: updatedAgents,
        error: null,
      };
    });

    return newAgent;
  },

  updateAgent: (input: UpdateAgentInput) => {
    set((state) => {
      const agentIndex = state.agents.findIndex((agent) => agent.id === input.id);

      if (agentIndex === -1) {
        return {
          error: 'Agent が見つかりません',
        };
      }

      const currentAgent = state.agents[agentIndex];
      const updatedAgent: Agent = {
        ...currentAgent,
        name: input.name ?? currentAgent.name,
        description: input.description ?? currentAgent.description,
        icon: input.icon ?? currentAgent.icon,
        systemPrompt: input.systemPrompt ?? currentAgent.systemPrompt,
        enabledTools: input.enabledTools ?? currentAgent.enabledTools,
        scenarios: input.scenarios
          ? input.scenarios.map((scenario) => ({
              ...scenario,
              id: uuidv4(),
            }))
          : currentAgent.scenarios,
        mcpConfig: input.mcpConfig ?? currentAgent.mcpConfig,
        updatedAt: new Date(),
      };

      const updatedAgents = [...state.agents];
      updatedAgents[agentIndex] = updatedAgent;

      saveAgentsToStorage(updatedAgents);

      // 選択中のAgentが更新された場合は選択状態も更新
      const updatedSelectedAgent =
        state.selectedAgent?.id === input.id ? updatedAgent : state.selectedAgent;

      if (updatedSelectedAgent && state.selectedAgent?.id === input.id) {
        saveSelectedAgentToStorage(updatedSelectedAgent);
      }

      return {
        agents: updatedAgents,
        selectedAgent: updatedSelectedAgent,
        error: null,
      };
    });
  },

  deleteAgent: (id: string) => {
    set((state) => {
      const updatedAgents = state.agents.filter((agent) => agent.id !== id);
      saveAgentsToStorage(updatedAgents);

      // 削除されたAgentが選択中だった場合は選択を解除
      const updatedSelectedAgent = state.selectedAgent?.id === id ? null : state.selectedAgent;

      if (updatedSelectedAgent !== state.selectedAgent) {
        saveSelectedAgentToStorage(updatedSelectedAgent);
      }

      return {
        agents: updatedAgents,
        selectedAgent: updatedSelectedAgent,
        error: null,
      };
    });
  },

  getAgent: (id: string) => {
    return get().agents.find((agent) => agent.id === id);
  },

  // Agent選択
  selectAgent: (agent: Agent | null) => {
    set({ selectedAgent: agent });
    saveSelectedAgentToStorage(agent);
  },

  // ユーティリティ
  initializeStore: () => {
    set({ isLoading: true });

    try {
      let agents = loadAgentsFromStorage();

      // 初回起動時はデフォルトAgentを作成
      if (agents.length === 0) {
        agents = createDefaultAgents();
        saveAgentsToStorage(agents);
      }

      const selectedAgent = loadSelectedAgentFromStorage();

      // 選択されたAgentが削除されている場合は選択を解除
      const validSelectedAgent =
        selectedAgent && agents.some((a) => a.id === selectedAgent.id) ? selectedAgent : null;

      if (validSelectedAgent !== selectedAgent) {
        saveSelectedAgentToStorage(validSelectedAgent);
      }

      set({
        agents,
        selectedAgent: validSelectedAgent,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('AgentStore初期化エラー:', error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'ストアの初期化に失敗しました',
      });
    }
  },

  clearError: () => {
    set({ error: null });
  },

  // LocalStorage操作
  saveToLocalStorage: () => {
    const { agents, selectedAgent } = get();
    saveAgentsToStorage(agents);
    saveSelectedAgentToStorage(selectedAgent);
  },

  loadFromLocalStorage: () => {
    get().initializeStore();
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
