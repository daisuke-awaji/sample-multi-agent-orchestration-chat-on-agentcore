/**
 * AppSync Connection Hook
 *
 * Hook to manage the shared AppSync Events WebSocket connection.
 * Should be called once at the app level to initialize the connection.
 *
 * ## Architecture Overview
 *
 * This module provides two hooks:
 * 1. useAppSyncConnection() - Initialize the shared connection (call once in App.tsx)
 * 2. useAppSyncSubscription() - Subscribe to channels (call in feature components)
 *
 * The shared connection is managed by appsyncConnectionStore, which handles:
 * - Single WebSocket connection for all subscriptions
 * - Automatic reconnection with exponential backoff
 * - Re-subscription after reconnection
 */
import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import {
  useAppSyncConnectionStore,
  useAppSyncConnectionState,
} from '../stores/appsyncConnectionStore';

/**
 * Initialize and manage the shared AppSync WebSocket connection.
 *
 * This hook should be called once at the app level (e.g., in App.tsx or a layout component).
 * It will automatically connect when the user is authenticated and disconnect on logout.
 *
 * @returns Connection state (isConnected, isConnectionAcknowledged)
 */
export function useAppSyncConnection() {
  const user = useAuthStore((state) => state.user);
  const connect = useAppSyncConnectionStore((state) => state.connect);
  const disconnect = useAppSyncConnectionStore((state) => state.disconnect);
  const connectionState = useAppSyncConnectionState();

  // Connect when authenticated, disconnect on logout
  useEffect(() => {
    if (user?.idToken && user?.userId) {
      connect();
    } else {
      // User logged out or not authenticated
      disconnect();
    }

    /**
     * WHY: Empty cleanup function instead of disconnect()
     *
     * We intentionally don't call disconnect() here because:
     * 1. React StrictMode mounts/unmounts components twice in development
     * 2. If we disconnect on unmount, the second mount would reconnect immediately
     * 3. This would cause unnecessary connection churn (disconnect → reconnect)
     *
     * Instead, disconnect is triggered when user state becomes null (logout),
     * which is handled by the if/else block above.
     */
    return () => {};
  }, [user?.idToken, user?.userId, connect, disconnect]);

  return connectionState;
}

/**
 * Hook to subscribe to a channel on the shared connection.
 *
 * @param channel - The channel to subscribe to (e.g., '/sessions/{userId}')
 * @param subscriptionId - Unique ID for this subscription
 * @param handler - Callback to handle incoming events
 * @param enabled - Whether the subscription should be active
 *
 * ## Usage Pattern
 *
 * ```tsx
 * useAppSyncSubscription(
 *   `/sessions/${userId}`,           // channel path
 *   `session-events-${userId}`,      // unique subscription ID
 *   (event) => handleEvent(event),   // event handler
 *   !!userId                         // enabled condition
 * );
 * ```
 */
export function useAppSyncSubscription(
  channel: string | null,
  subscriptionId: string | null,
  handler: (event: string) => void,
  enabled: boolean = true
) {
  const subscribe = useAppSyncConnectionStore((state) => state.subscribe);
  const unsubscribe = useAppSyncConnectionStore((state) => state.unsubscribe);

  useEffect(() => {
    if (!enabled || !channel || !subscriptionId) {
      return;
    }

    // Subscribe to channel
    // Note: subscription is stored in channelMap and will be sent when connection is acknowledged
    subscribe(channel, subscriptionId, handler);

    // Cleanup: unsubscribe when channel changes or component unmounts
    return () => {
      unsubscribe(subscriptionId);
    };
    /**
     * WHY: Intentionally excluding isConnectionAcknowledged from dependencies
     *
     * If we included isConnectionAcknowledged in the dependency array:
     * 1. useEffect would re-run when connection is acknowledged
     * 2. This would call subscribe() again for the same subscriptionId
     * 3. AppSync would return DuplicatedOperationError
     *
     * Instead, the store handles the timing internally:
     * - subscribe() stores the channel in _channelMap immediately
     * - When connection_ack arrives, store re-subscribes from _channelMap
     * - This ensures subscriptions are sent only after connection is ready
     *
     * The handler callback is also excluded because:
     * - Including it would cause re-subscription on every render (new function reference)
     * - The store updates the handler in _subscriptionHandlers without re-subscribing
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, subscriptionId, enabled]);
}
