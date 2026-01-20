/**
 * Message Events Subscription Hook
 *
 * Subscribe to real-time message updates via shared AppSync Events WebSocket connection.
 * This enables cross-tab/cross-device synchronization and recovery after page reload.
 */
import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useSessionStore } from '../stores/sessionStore';
import { useAppSyncSubscription } from './useAppSyncConnection';
import {
  useAppSyncConnectionState,
  useAppSyncConnectionStore,
} from '../stores/appsyncConnectionStore';
import type { MessageContent, Message } from '../types/index';
import { nanoid } from 'nanoid';

/**
 * Message event from Agent handler
 */
interface MessageEvent {
  type: 'MESSAGE_ADDED' | 'AGENT_COMPLETE' | 'AGENT_ERROR';
  sessionId: string;
  message?: {
    role: 'user' | 'assistant';
    content: unknown[];
    timestamp: string;
  };
  error?: string;
  requestId?: string;
}

/**
 * Convert API content to local MessageContent type
 *
 * Agent SDK ContentBlock types:
 * - textBlock: { type: 'textBlock', text: string }
 * - toolUseBlock: { type: 'toolUseBlock', toolUseId: string, name: string, input: object }
 * - toolResultBlock: { type: 'toolResultBlock', toolUseId: string, content: string }
 *
 * Frontend MessageContent types:
 * - text: { type: 'text', text: string }
 * - toolUse: { type: 'toolUse', toolUse: ToolUse }
 * - toolResult: { type: 'toolResult', toolResult: ToolResult }
 */
function convertContent(apiContent: unknown): MessageContent {
  const content = apiContent as Record<string, unknown>;

  // textBlock → text (Agent SDK format)
  if (content.type === 'textBlock' && typeof content.text === 'string') {
    return { type: 'text', text: content.text };
  }

  // text format (direct)
  if (content.type === 'text' && typeof content.text === 'string') {
    return { type: 'text', text: content.text };
  }

  // toolUseBlock → toolUse
  if (content.type === 'toolUseBlock') {
    return {
      type: 'toolUse',
      toolUse: {
        id: (content.toolUseId as string) || '',
        name: (content.name as string) || 'unknown',
        input: (content.input as Record<string, unknown>) || {},
        status: 'completed',
      },
    };
  }

  // toolResultBlock → toolResult
  if (content.type === 'toolResultBlock') {
    return {
      type: 'toolResult',
      toolResult: {
        toolUseId: (content.toolUseId as string) || '',
        content:
          typeof content.content === 'string'
            ? content.content
            : JSON.stringify(content.content || ''),
        isError: (content.isError as boolean) || false,
      },
    };
  }

  // Pass through for already-converted or unknown types
  return content as unknown as MessageContent;
}

/**
 * Custom hook for subscribing to real-time message updates
 *
 * @param sessionId - The active session ID to subscribe to
 */
export function useMessageEventsSubscription(sessionId: string | null) {
  // Track current session for event filtering
  const currentSessionIdRef = useRef(sessionId);
  const prevSessionIdRef = useRef<string | null>(null);

  // Get auth state
  const user = useAuthStore((state) => state.user);
  const userId = user?.userId;
  const connectionState = useAppSyncConnectionState();
  const unsubscribe = useAppSyncConnectionStore((state) => state.unsubscribe);

  // Update current session ref
  useEffect(() => {
    currentSessionIdRef.current = sessionId;
  }, [sessionId]);

  /**
   * Handle incoming message events
   */
  const handleMessageEvent = useCallback((eventData: string) => {
    try {
      const event = JSON.parse(eventData) as MessageEvent;
      console.log('📨 Received message event:', event);

      const chatStore = useChatStore.getState();
      const sessionStore = useSessionStore.getState();

      // Only process events for the active session
      if (event.sessionId !== currentSessionIdRef.current) {
        console.log(
          `⚠️ Message event for different session, ignoring (current: ${currentSessionIdRef.current}, event: ${event.sessionId})`
        );
        return;
      }

      switch (event.type) {
        case 'MESSAGE_ADDED': {
          if (!event.message) break;

          const sessionState = chatStore.getSessionState(event.sessionId);
          if (!sessionState) break;

          // Skip if this tab is currently sending (to avoid duplicates)
          if (sessionState.isLoading) {
            console.log('⚠️ Skipping message event while loading (sender tab)');
            break;
          }

          // Convert content first for comparison
          const contents: MessageContent[] = event.message.content.map(convertContent);

          // Helper function to extract text content for comparison
          const getTextContent = (msgContents: MessageContent[]): string => {
            return msgContents
              .filter(
                (c): c is MessageContent & { type: 'text'; text: string } => c.type === 'text'
              )
              .map((c) => c.text)
              .join('')
              .substring(0, 200);
          };

          // Check for duplicate by message content
          const eventText = getTextContent(contents);
          const isDuplicate = sessionState.messages.some((msg) => {
            if (msg.type !== event.message!.role) return false;
            const msgText = getTextContent(msg.contents);
            return msgText === eventText && eventText.length > 0;
          });

          if (isDuplicate) {
            console.log('⚠️ Duplicate message detected (by content), skipping');
            break;
          }

          // Add message to store
          const newMessage: Message = {
            id: nanoid(),
            type: event.message.role,
            contents,
            timestamp: new Date(event.message.timestamp),
            isStreaming: false,
          };

          const { sessions } = chatStore;
          const currentState = sessions[event.sessionId] || {
            messages: [],
            isLoading: false,
            error: null,
            lastUpdated: new Date(),
          };

          useChatStore.setState({
            sessions: {
              ...sessions,
              [event.sessionId]: {
                ...currentState,
                messages: [...currentState.messages, newMessage],
                lastUpdated: new Date(),
              },
            },
          });

          console.log(`📨 Added message from event: ${event.message.role}`);
          break;
        }

        case 'AGENT_COMPLETE': {
          const sessionState = chatStore.getSessionState(event.sessionId);
          if (!sessionState) break;

          const { sessions } = chatStore;
          const currentState = sessions[event.sessionId];
          if (!currentState) break;

          const updatedMessages = currentState.messages.map((msg) =>
            msg.isStreaming ? { ...msg, isStreaming: false } : msg
          );

          useChatStore.setState({
            sessions: {
              ...sessions,
              [event.sessionId]: {
                ...currentState,
                messages: updatedMessages,
                isLoading: false,
              },
            },
          });

          sessionStore.refreshSessions();
          console.log('📨 Agent complete event processed');
          break;
        }

        case 'AGENT_ERROR': {
          console.error('📨 Agent error event:', event.error);
          const { sessions } = chatStore;
          const currentState = sessions[event.sessionId];
          if (!currentState) break;

          useChatStore.setState({
            sessions: {
              ...sessions,
              [event.sessionId]: {
                ...currentState,
                isLoading: false,
                error: event.error || 'Unknown error',
              },
            },
          });
          break;
        }
      }
    } catch (error) {
      console.error('📨 Failed to parse message event:', error);
    }
  }, []);

  // Build channel and subscription ID for current session
  const channel = useMemo(
    () => (userId && sessionId ? `/messages/${userId}/${sessionId}` : null),
    [userId, sessionId]
  );
  const subscriptionId = useMemo(
    () => (sessionId ? `message-subscription-${sessionId}` : null),
    [sessionId]
  );

  // Handle session changes - unsubscribe from previous session
  useEffect(() => {
    const prevSessionId = prevSessionIdRef.current;

    // Unsubscribe from previous session if different
    if (prevSessionId && prevSessionId !== sessionId) {
      unsubscribe(`message-subscription-${prevSessionId}`);
    }

    // Update previous session ref
    prevSessionIdRef.current = sessionId;
  }, [sessionId, unsubscribe]);

  // Subscribe to message channel using shared connection
  useAppSyncSubscription(channel, subscriptionId, handleMessageEvent, !!sessionId && !!userId);

  return {
    isConnected: connectionState.isConnected,
  };
}
