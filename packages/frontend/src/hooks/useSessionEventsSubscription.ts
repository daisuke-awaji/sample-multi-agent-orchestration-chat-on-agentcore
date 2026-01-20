/**
 * Session Events Subscription Hook
 *
 * Subscribe to real-time session updates via shared AppSync Events WebSocket connection.
 */
import { useCallback, useMemo } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { useAuthStore } from '../stores/authStore';
import { useAppSyncSubscription } from './useAppSyncConnection';
import { useAppSyncConnectionState } from '../stores/appsyncConnectionStore';

/**
 * Session event from DynamoDB Streams
 */
interface SessionEvent {
  type: 'INSERT' | 'MODIFY' | 'REMOVE';
  sessionId: string;
  title?: string;
  agentId?: string;
  updatedAt?: string;
  createdAt?: string;
}

/**
 * Custom hook for subscribing to real-time session updates
 *
 * This hook uses the shared WebSocket connection to AppSync Events API
 * and listens for session changes (INSERT, MODIFY, REMOVE).
 */
export function useSessionEventsSubscription() {
  // Get user ID for channel subscription
  const user = useAuthStore((state) => state.user);
  const userId = user?.userId;
  const connectionState = useAppSyncConnectionState();

  /**
   * Handle incoming session events
   */
  const handleSessionEvent = useCallback((eventData: string) => {
    try {
      const event = JSON.parse(eventData) as SessionEvent;
      console.log('📡 Received session event:', event);

      const store = useSessionStore.getState();

      switch (event.type) {
        case 'INSERT': {
          // Check if session already exists (might be added optimistically)
          const exists = store.sessions.some((s) => s.sessionId === event.sessionId);
          if (!exists) {
            store.addOptimisticSession(event.sessionId, event.title);
          }
          break;
        }

        case 'MODIFY': {
          // Update session title if changed
          if (event.title) {
            store.updateSessionTitle(event.sessionId, event.title);
          }
          break;
        }

        case 'REMOVE': {
          // Session was deleted (possibly by another device/tab)
          // Refresh to sync
          store.refreshSessions();
          break;
        }
      }
    } catch (error) {
      console.error('📡 Failed to parse session event:', error);
    }
  }, []);

  // Build channel and subscription ID
  const channel = useMemo(() => (userId ? `/sessions/${userId}` : null), [userId]);
  const subscriptionId = useMemo(() => (userId ? 'session-subscription' : null), [userId]);

  // Subscribe to session channel using shared connection
  useAppSyncSubscription(channel, subscriptionId, handleSessionEvent, !!userId);

  return {
    isConnected: connectionState.isConnected,
  };
}
