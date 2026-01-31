/**
 * Processed Message ID Store
 *
 * Tracks message IDs that have been processed via stream response
 * to prevent duplicate processing when the same message arrives via AppSync Events.
 *
 * This enables cross-tab synchronization while avoiding duplicates in the sender tab.
 */
import { create } from 'zustand';

/**
 * Maximum number of message IDs to retain (to prevent memory leaks)
 */
const MAX_PROCESSED_IDS = 1000;

/**
 * TTL for processed message IDs in milliseconds (5 minutes)
 */
const PROCESSED_ID_TTL = 5 * 60 * 1000;

interface ProcessedEntry {
  timestamp: number;
}

interface ProcessedMessageState {
  processedIds: Map<string, ProcessedEntry>;
}

interface ProcessedMessageActions {
  /**
   * Mark a message ID as processed (called when receiving via stream)
   */
  markProcessed: (messageId: string) => void;

  /**
   * Check if a message ID has been processed
   */
  isProcessed: (messageId: string) => boolean;

  /**
   * Clear old entries (called periodically or on cleanup)
   */
  cleanup: () => void;

  /**
   * Clear all entries (called on logout or session switch)
   */
  clearAll: () => void;
}

type ProcessedMessageStore = ProcessedMessageState & ProcessedMessageActions;

export const useProcessedMessageStore = create<ProcessedMessageStore>((set, get) => ({
  processedIds: new Map(),

  markProcessed: (messageId: string) => {
    const { processedIds, cleanup } = get();

    // Add new entry
    const newMap = new Map(processedIds);
    newMap.set(messageId, { timestamp: Date.now() });

    // Cleanup if exceeding max size
    if (newMap.size > MAX_PROCESSED_IDS) {
      cleanup();
    }

    set({ processedIds: newMap });
    console.log(`🔖 Marked messageId as processed: ${messageId}`);
  },

  isProcessed: (messageId: string) => {
    const { processedIds } = get();
    const entry = processedIds.get(messageId);

    if (!entry) {
      return false;
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > PROCESSED_ID_TTL) {
      // Remove expired entry
      const newMap = new Map(processedIds);
      newMap.delete(messageId);
      set({ processedIds: newMap });
      return false;
    }

    return true;
  },

  cleanup: () => {
    const { processedIds } = get();
    const now = Date.now();
    const newMap = new Map<string, ProcessedEntry>();

    // Keep only non-expired entries
    processedIds.forEach((entry, id) => {
      if (now - entry.timestamp < PROCESSED_ID_TTL) {
        newMap.set(id, entry);
      }
    });

    set({ processedIds: newMap });
    console.log(`🧹 Cleaned up processed message IDs: ${processedIds.size} -> ${newMap.size}`);
  },

  clearAll: () => {
    set({ processedIds: new Map() });
    console.log('🗑️ Cleared all processed message IDs');
  },
}));
