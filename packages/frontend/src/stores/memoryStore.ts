/**
 * Memory Store
 * AgentCore Memory 管理用のZustand store
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  fetchMemoryRecords,
  deleteMemoryRecord as apiDeleteMemoryRecord,
  searchMemoryRecords as apiSearchMemoryRecords,
  type MemoryRecord,
} from '../api/memory';

/**
 * Memory Store の状態
 */
interface MemoryState {
  // メモリ参照のON/OFF設定
  isMemoryEnabled: boolean;

  // メモリレコード（統一）
  records: MemoryRecord[];

  // ローディング状態
  isLoading: boolean;
  isDeleting: string | null; // Record ID being deleted

  // エラー状態
  error: string | null;

  // ページネーション
  nextToken?: string;

  // アクション
  setMemoryEnabled: (enabled: boolean) => void;
  loadMemoryRecords: () => Promise<void>;
  deleteMemoryRecord: (recordId: string) => Promise<void>;
  searchMemoryRecords: (query: string) => Promise<MemoryRecord[]>;
  clearError: () => void;
}

/**
 * Memory Store
 */
export const useMemoryStore = create<MemoryState>()(
  persist(
    (set, get) => ({
      // 初期状態
      isMemoryEnabled: true, // Default is ON
      records: [],
      isLoading: false,
      isDeleting: null,
      error: null,

      /**
       * メモリ参照のON/OFF設定
       */
      setMemoryEnabled: (enabled: boolean) => {
        set({ isMemoryEnabled: enabled });
        console.log(`[MemoryStore] Memory enabled: ${enabled}`);
      },

      /**
       * メモリレコード一覧を取得
       */
      loadMemoryRecords: async () => {
        try {
          set({ isLoading: true, error: null });

          const data = await fetchMemoryRecords();

          // 状態を更新
          set({
            records: data.records,
            nextToken: data.nextToken,
          });

          console.log(`[MemoryStore] Loaded ${data.records.length} records`);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : '不明なエラーが発生しました';
          set({ error: errorMessage });
          console.error(`[MemoryStore] Error loading records:`, error);
        } finally {
          set({ isLoading: false });
        }
      },

      /**
       * メモリレコードを削除
       */
      deleteMemoryRecord: async (recordId: string) => {
        try {
          set({ isDeleting: recordId, error: null });

          await apiDeleteMemoryRecord(recordId);

          // ローカル状態からレコードを削除
          const currentState = get();
          set({
            records: currentState.records.filter((r) => r.recordId !== recordId),
          });

          console.log(`[MemoryStore] Deleted memory record: ${recordId}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '削除に失敗しました';
          set({ error: errorMessage });
          console.error(`[MemoryStore] Error deleting memory record:`, error);
        } finally {
          set({ isDeleting: null });
        }
      },

      /**
       * メモリレコードをセマンティック検索
       */
      searchMemoryRecords: async (query: string): Promise<MemoryRecord[]> => {
        try {
          const records = await apiSearchMemoryRecords({
            query,
            topK: 20,
            relevanceScore: 0.2,
          });

          console.log(`[MemoryStore] Found ${records.length} records for query: "${query}"`);
          return records;
        } catch (error) {
          console.error(`[MemoryStore] Error searching memory records:`, error);
          return [];
        }
      },

      /**
       * Clear errors
       */
      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'memory-settings',
      // メモリ参照設定のみを永続化（レコード自体は毎回取得）
      partialize: (state) => ({
        isMemoryEnabled: state.isMemoryEnabled,
      }),
    }
  )
);
