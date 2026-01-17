/**
 * Session Management Store
 * State management for session list and active session
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { customAlphabet } from 'nanoid';
import toast from 'react-hot-toast';
import {
  fetchSessions,
  fetchSessionEvents,
  deleteSession as deleteSessionApi,
} from '../api/sessions';
import type { SessionSummary, ConversationMessage } from '../api/sessions';
import { ApiError } from '../api/client/base-client';
import i18n from '../i18n';

// AWS AgentCore sessionId constraints: [a-zA-Z0-9][a-zA-Z0-9-_]*
// Custom nanoid with alphanumeric characters only (excluding hyphens and underscores)
const generateSessionId = customAlphabet(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  33
);

/**
 * Default page size for session list
 */
const DEFAULT_PAGE_SIZE = 50;

/**
 * Session store state type definition
 */
interface SessionState {
  sessions: SessionSummary[];
  isLoadingSessions: boolean;
  sessionsError: string | null;
  hasLoadedOnce: boolean; // Initial load completion flag

  // Pagination state
  nextToken: string | null;
  hasMoreSessions: boolean;
  isLoadingMoreSessions: boolean;

  activeSessionId: string | null;
  sessionEvents: ConversationMessage[];
  isLoadingEvents: boolean;
  eventsError: string | null;

  isCreatingSession: boolean; // New session creation in progress flag
}

/**
 * Session store actions type definition
 */
interface SessionActions {
  loadSessions: () => Promise<void>;
  loadMoreSessions: () => Promise<void>; // Load more sessions for infinite scroll
  loadAllSessions: () => Promise<void>; // Load all sessions (for search page)
  selectSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>; // Delete a session
  deleteMultipleSessions: (sessionIds: string[]) => Promise<void>; // Delete multiple sessions
  setActiveSessionId: (sessionId: string) => void;
  clearActiveSession: () => void;
  setSessionsError: (error: string | null) => void;
  setEventsError: (error: string | null) => void;
  clearErrors: () => void;
  refreshSessions: () => Promise<void>;
  createNewSession: () => string; // Create new session (generate ID and set flag)
  finalizeNewSession: () => void; // Finalize new session creation (clear flag)
  addOptimisticSession: (sessionId: string, title?: string) => void; // Optimistically add session to sidebar
  updateSessionTitle: (sessionId: string, title: string) => void; // Update session title
}

/**
 * Session management store
 */
type SessionStore = SessionState & SessionActions;

export const useSessionStore = create<SessionStore>()(
  devtools(
    (set, get) => ({
      // State
      sessions: [],
      isLoadingSessions: false,
      sessionsError: null,
      hasLoadedOnce: false, // Initial load completion flag

      // Pagination state
      nextToken: null,
      hasMoreSessions: false,
      isLoadingMoreSessions: false,

      activeSessionId: null,
      sessionEvents: [],
      isLoadingEvents: false,
      eventsError: null,
      isCreatingSession: false, // New session creation in progress flag

      // Actions
      loadSessions: async () => {
        try {
          set({ isLoadingSessions: true, sessionsError: null });

          console.log('🔄 Loading all sessions...');
          const result = await fetchSessions({ limit: DEFAULT_PAGE_SIZE });

          set({
            sessions: result.sessions,
            nextToken: result.nextToken || null,
            hasMoreSessions: result.hasMore,
            isLoadingSessions: false,
            sessionsError: null,
            hasLoadedOnce: true, // Set initial load completion flag
          });

          console.log(
            `✅ Session list loaded: ${result.sessions.length} items, hasMore: ${result.hasMore}`
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to load session list';
          console.error('💥 Session list loading error:', error);

          set({
            sessions: [],
            nextToken: null,
            hasMoreSessions: false,
            isLoadingSessions: false,
            sessionsError: errorMessage,
            hasLoadedOnce: true, // Mark as initial load completed even on error
          });
        }
      },

      loadMoreSessions: async () => {
        const { nextToken, hasMoreSessions, isLoadingMoreSessions, sessions } = get();

        // Skip if no more sessions or already loading
        if (!hasMoreSessions || isLoadingMoreSessions || !nextToken) {
          console.log('⏭️ Skipping loadMoreSessions:', {
            hasMoreSessions,
            isLoadingMoreSessions,
            hasNextToken: !!nextToken,
          });
          return;
        }

        try {
          set({ isLoadingMoreSessions: true });

          console.log('🔄 Loading more sessions...');
          const result = await fetchSessions({
            limit: DEFAULT_PAGE_SIZE,
            nextToken,
          });

          set({
            sessions: [...sessions, ...result.sessions],
            nextToken: result.nextToken || null,
            hasMoreSessions: result.hasMore,
            isLoadingMoreSessions: false,
          });

          console.log(
            `✅ More sessions loaded: ${result.sessions.length} items, total: ${sessions.length + result.sessions.length}, hasMore: ${result.hasMore}`
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to load more sessions';
          console.error('💥 Load more sessions error:', error);

          set({
            isLoadingMoreSessions: false,
            sessionsError: errorMessage,
          });
        }
      },

      loadAllSessions: async () => {
        const { loadSessions, loadMoreSessions } = get();

        console.log('🔄 Loading all sessions...');

        // First, load initial sessions
        await loadSessions();

        // Then, keep loading more until no more sessions
        let iterationCount = 0;
        const maxIterations = 100; // Safety limit to prevent infinite loops

        while (get().hasMoreSessions && get().nextToken && iterationCount < maxIterations) {
          await loadMoreSessions();
          iterationCount++;
        }

        const totalSessions = get().sessions.length;
        console.log(
          `✅ All sessions loaded: ${totalSessions} items in ${iterationCount + 1} requests`
        );
      },

      selectSession: async (sessionId: string) => {
        try {
          set({
            isLoadingEvents: true,
            eventsError: null,
            activeSessionId: sessionId,
          });

          console.log(`🔄 Selecting session: ${sessionId}`);
          const events = await fetchSessionEvents(sessionId);

          set({
            sessionEvents: events,
            isLoadingEvents: false,
            eventsError: null,
          });

          console.log(`✅ Session conversation history loaded: ${events.length} items`);
        } catch (error) {
          // Handle 403 Forbidden - redirect to /chat
          if (error instanceof ApiError && error.status === 403) {
            console.warn(`⚠️ Access denied to session: ${sessionId}`);
            toast.error(i18n.t('error.forbidden'));
            set({
              activeSessionId: null,
              sessionEvents: [],
              isLoadingEvents: false,
              eventsError: null,
            });
            window.location.href = '/chat';
            return;
          }

          const errorMessage =
            error instanceof Error ? error.message : 'Failed to load session conversation history';
          console.error('💥 Session conversation history loading error:', error);

          set({
            sessionEvents: [],
            isLoadingEvents: false,
            eventsError: errorMessage,
          });
        }
      },

      deleteSession: async (sessionId: string) => {
        // 1. Save session for potential rollback
        const { sessions, activeSessionId } = get();
        const sessionToDelete = sessions.find((s) => s.sessionId === sessionId);
        const originalIndex = sessions.findIndex((s) => s.sessionId === sessionId);

        // 2. Optimistically remove from local state immediately
        const updatedSessions = sessions.filter((s) => s.sessionId !== sessionId);
        set({ sessions: updatedSessions });

        // Clear active session if it's the deleted one
        if (activeSessionId === sessionId) {
          set({
            activeSessionId: null,
            sessionEvents: [],
            eventsError: null,
          });
        }

        console.log(`🗑️ Optimistically removed session: ${sessionId}`);

        try {
          // 3. Call API to delete session (in background)
          await deleteSessionApi(sessionId);
          console.log(`✅ Session deleted from server: ${sessionId}`);
          toast.success(i18n.t('chat.sessionDeleted'));
        } catch (error) {
          // 4. Rollback on error - restore the session
          console.error('💥 Session deletion error, rolling back:', error);

          if (sessionToDelete) {
            const currentSessions = get().sessions;
            // Restore at original position if possible
            const restoredSessions = [...currentSessions];
            const insertIndex = Math.min(originalIndex, restoredSessions.length);
            restoredSessions.splice(insertIndex, 0, sessionToDelete);
            set({ sessions: restoredSessions });
          }

          const errorMessage = error instanceof Error ? error.message : 'Failed to delete session';
          toast.error(errorMessage);
          throw error;
        }
      },

      deleteMultipleSessions: async (sessionIds: string[]) => {
        if (sessionIds.length === 0) return;

        // 1. Save sessions for potential rollback
        const { sessions, activeSessionId } = get();
        const sessionsToDelete = sessions.filter((s) => sessionIds.includes(s.sessionId));
        const sessionIdsSet = new Set(sessionIds);

        // 2. Optimistically remove from local state immediately
        const updatedSessions = sessions.filter((s) => !sessionIdsSet.has(s.sessionId));
        set({ sessions: updatedSessions });

        // Clear active session if it's one of the deleted ones
        if (activeSessionId && sessionIdsSet.has(activeSessionId)) {
          set({
            activeSessionId: null,
            sessionEvents: [],
            eventsError: null,
          });
        }

        console.log(`🗑️ Optimistically removed ${sessionIds.length} sessions`);

        // 3. Call API to delete sessions (in parallel, in background)
        const results = await Promise.allSettled(
          sessionIds.map((sessionId) => deleteSessionApi(sessionId))
        );

        // 4. Check results
        const failedCount = results.filter((r) => r.status === 'rejected').length;
        const successCount = results.filter((r) => r.status === 'fulfilled').length;

        if (failedCount > 0) {
          console.error(`💥 ${failedCount} session deletions failed`);

          // Rollback failed deletions
          const failedIndices = results
            .map((r, i) => (r.status === 'rejected' ? i : -1))
            .filter((i) => i >= 0);
          const failedSessionIds = failedIndices.map((i) => sessionIds[i]);
          const sessionsToRestore = sessionsToDelete.filter((s) =>
            failedSessionIds.includes(s.sessionId)
          );

          if (sessionsToRestore.length > 0) {
            const currentSessions = get().sessions;
            set({ sessions: [...sessionsToRestore, ...currentSessions] });
          }

          if (successCount > 0) {
            toast.success(i18n.t('chat.sessionsDeleted', { count: successCount }));
          }
          toast.error(`${failedCount} sessions failed to delete`);
        } else {
          console.log(`✅ ${successCount} sessions deleted from server`);
          toast.success(i18n.t('chat.sessionsDeleted', { count: successCount }));
        }
      },

      setActiveSessionId: (sessionId: string) => {
        set({
          activeSessionId: sessionId,
          sessionEvents: [], // Empty conversation history for new session
          eventsError: null,
          isLoadingEvents: false,
        });
        console.log(`🆕 Set new session as active: ${sessionId}`);
      },

      clearActiveSession: () => {
        set({
          activeSessionId: null,
          sessionEvents: [],
          eventsError: null,
          isLoadingEvents: false, // Explicitly clear loading state for new chat
        });
        console.log('🗑️ Cleared active session');
      },

      setSessionsError: (error: string | null) => {
        set({ sessionsError: error });
      },

      setEventsError: (error: string | null) => {
        set({ eventsError: error });
      },

      clearErrors: () => {
        set({
          sessionsError: null,
          eventsError: null,
        });
      },

      refreshSessions: async () => {
        // Reload all sessions (without clearing first to prevent UI flash)
        const { loadSessions } = get();
        console.log('🔄 Refreshing session list...');
        await loadSessions();
      },

      createNewSession: () => {
        const newSessionId = generateSessionId();
        set({
          activeSessionId: newSessionId,
          sessionEvents: [],
          eventsError: null,
          isLoadingEvents: false,
          isCreatingSession: true, // Set new session creation flag
        });
        console.log(`🆕 Created new session: ${newSessionId}`);
        return newSessionId;
      },

      finalizeNewSession: () => {
        set({ isCreatingSession: false });
        console.log('✅ New session creation completed');
      },

      addOptimisticSession: (sessionId: string, title?: string) => {
        const { sessions } = get();

        // Check if session already exists
        const exists = sessions.some((s) => s.sessionId === sessionId);
        if (exists) {
          console.log(`⚠️ Session ${sessionId} already exists, skipping optimistic add`);
          return;
        }

        // Create optimistic session with title or placeholder
        const optimisticSession: SessionSummary = {
          sessionId,
          title: title || 'New conversation...',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        // Add to beginning of list
        set({
          sessions: [optimisticSession, ...sessions],
        });

        console.log(`✨ Optimistically added session: ${sessionId} - "${optimisticSession.title}"`);
      },

      updateSessionTitle: (sessionId: string, title: string) => {
        const { sessions } = get();

        const updatedSessions = sessions.map((session) =>
          session.sessionId === sessionId
            ? { ...session, title, updatedAt: new Date().toISOString() }
            : session
        );

        set({ sessions: updatedSessions });
        console.log(`📝 Updated session title: ${sessionId} - "${title}"`);
      },
    }),
    {
      name: 'session-store',
    }
  )
);

/**
 * Session-related selectors (utility functions)
 */
export const sessionSelectors = {
  /**
   * Get session information for specified session ID
   */
  getSessionById: (sessionId: string) => {
    const { sessions } = useSessionStore.getState();
    return sessions.find((session) => session.sessionId === sessionId);
  },

  /**
   * Check if any session loading is in progress
   */
  isAnyLoading: () => {
    const { isLoadingSessions, isLoadingEvents, isLoadingMoreSessions } =
      useSessionStore.getState();
    return isLoadingSessions || isLoadingEvents || isLoadingMoreSessions;
  },

  /**
   * Check if there are any errors
   */
  hasAnyError: () => {
    const { sessionsError, eventsError } = useSessionStore.getState();
    return !!sessionsError || !!eventsError;
  },

  /**
   * Get all error messages as an array
   */
  getAllErrors: () => {
    const { sessionsError, eventsError } = useSessionStore.getState();
    return [sessionsError, eventsError].filter(Boolean) as string[];
  },
};
