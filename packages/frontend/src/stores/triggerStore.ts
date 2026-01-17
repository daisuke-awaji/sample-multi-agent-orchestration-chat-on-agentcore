/**
 * Trigger management Zustand store
 */

import { create } from 'zustand';
import type {
  Trigger,
  CreateTriggerRequest,
  UpdateTriggerRequest,
  ExecutionRecord,
} from '../types/trigger';
import * as triggersApi from '../api/triggers';

interface TriggerStore {
  // State
  triggers: Trigger[];
  isLoading: boolean;
  error: string | null;
  togglingIds: Set<string>; // IDs of triggers currently being toggled

  // Actions
  fetchTriggers: () => Promise<void>;
  getTrigger: (triggerId: string) => Trigger | undefined;
  createTrigger: (input: CreateTriggerRequest) => Promise<Trigger>;
  updateTrigger: (triggerId: string, input: UpdateTriggerRequest) => Promise<void>;
  deleteTrigger: (triggerId: string) => Promise<void>;
  enableTrigger: (triggerId: string) => Promise<void>;
  disableTrigger: (triggerId: string) => Promise<void>;
  fetchExecutionHistory: (triggerId: string, limit?: number) => Promise<ExecutionRecord[]>;
  clearError: () => void;
}

export const useTriggerStore = create<TriggerStore>((set, get) => ({
  // Initial state
  triggers: [],
  isLoading: false,
  error: null,
  togglingIds: new Set<string>(),

  // Fetch all triggers
  fetchTriggers: async () => {
    set({ isLoading: true, error: null });

    try {
      const { triggers } = await triggersApi.listTriggers();

      set({
        triggers,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'トリガーの取得に失敗しました';
      set({ isLoading: false, error: errorMessage });
      throw error;
    }
  },

  // Get single trigger from store
  getTrigger: (triggerId: string) => {
    return get().triggers.find((trigger) => trigger.id === triggerId);
  },

  // Create new trigger
  createTrigger: async (input: CreateTriggerRequest) => {
    set({ isLoading: true, error: null });

    try {
      const newTrigger = await triggersApi.createTrigger(input);

      set((state) => ({
        triggers: [...state.triggers, newTrigger],
        isLoading: false,
        error: null,
      }));

      return newTrigger;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'トリガーの作成に失敗しました';
      set({ isLoading: false, error: errorMessage });
      throw error;
    }
  },

  // Update existing trigger
  updateTrigger: async (triggerId: string, input: UpdateTriggerRequest) => {
    set({ isLoading: true, error: null });

    try {
      const updatedTrigger = await triggersApi.updateTrigger(triggerId, input);

      set((state) => {
        const triggerIndex = state.triggers.findIndex((t) => t.id === triggerId);
        const updatedTriggers = [...state.triggers];

        if (triggerIndex !== -1) {
          updatedTriggers[triggerIndex] = updatedTrigger;
        }

        return {
          triggers: updatedTriggers,
          isLoading: false,
          error: null,
        };
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'トリガーの更新に失敗しました';
      set({ isLoading: false, error: errorMessage });
      throw error;
    }
  },

  // Delete trigger
  deleteTrigger: async (triggerId: string) => {
    set({ isLoading: true, error: null });

    try {
      await triggersApi.deleteTrigger(triggerId);

      set((state) => ({
        triggers: state.triggers.filter((t) => t.id !== triggerId),
        isLoading: false,
        error: null,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'トリガーの削除に失敗しました';
      set({ isLoading: false, error: errorMessage });
      throw error;
    }
  },

  // Enable trigger (with optimistic update)
  enableTrigger: async (triggerId: string) => {
    const currentTrigger = get().triggers.find((t) => t.id === triggerId);
    if (!currentTrigger) return;

    // Optimistic update: immediately update UI
    set((state) => {
      const newTogglingIds = new Set(state.togglingIds);
      newTogglingIds.add(triggerId);

      return {
        togglingIds: newTogglingIds,
        triggers: state.triggers.map((t) => (t.id === triggerId ? { ...t, enabled: true } : t)),
      };
    });

    try {
      await triggersApi.enableTrigger(triggerId);

      // Success: remove from toggling IDs
      set((state) => {
        const newTogglingIds = new Set(state.togglingIds);
        newTogglingIds.delete(triggerId);
        return { togglingIds: newTogglingIds };
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'トリガーの有効化に失敗しました';

      // Error: rollback and remove from toggling IDs
      set((state) => {
        const newTogglingIds = new Set(state.togglingIds);
        newTogglingIds.delete(triggerId);

        return {
          togglingIds: newTogglingIds,
          triggers: state.triggers.map((t) => (t.id === triggerId ? currentTrigger : t)),
          error: errorMessage,
        };
      });
      throw error;
    }
  },

  // Disable trigger (with optimistic update)
  disableTrigger: async (triggerId: string) => {
    const currentTrigger = get().triggers.find((t) => t.id === triggerId);
    if (!currentTrigger) return;

    // Optimistic update: immediately update UI
    set((state) => {
      const newTogglingIds = new Set(state.togglingIds);
      newTogglingIds.add(triggerId);

      return {
        togglingIds: newTogglingIds,
        triggers: state.triggers.map((t) => (t.id === triggerId ? { ...t, enabled: false } : t)),
      };
    });

    try {
      await triggersApi.disableTrigger(triggerId);

      // Success: remove from toggling IDs
      set((state) => {
        const newTogglingIds = new Set(state.togglingIds);
        newTogglingIds.delete(triggerId);
        return { togglingIds: newTogglingIds };
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'トリガーの無効化に失敗しました';

      // Error: rollback and remove from toggling IDs
      set((state) => {
        const newTogglingIds = new Set(state.togglingIds);
        newTogglingIds.delete(triggerId);

        return {
          togglingIds: newTogglingIds,
          triggers: state.triggers.map((t) => (t.id === triggerId ? currentTrigger : t)),
          error: errorMessage,
        };
      });
      throw error;
    }
  },

  // Fetch execution history
  fetchExecutionHistory: async (triggerId: string, limit = 20) => {
    try {
      const { executions } = await triggersApi.getExecutionHistory(triggerId, limit);
      return executions;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '実行履歴の取得に失敗しました';
      set({ error: errorMessage });
      throw error;
    }
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },
}));

/**
 * Hook to get triggers list
 */
export const useTriggers = () => {
  return useTriggerStore((state) => state.triggers);
};

/**
 * Hook to get loading state
 */
export const useTriggersLoading = () => {
  return useTriggerStore((state) => state.isLoading);
};

/**
 * Hook to get error state
 */
export const useTriggersError = () => {
  return useTriggerStore((state) => state.error);
};
