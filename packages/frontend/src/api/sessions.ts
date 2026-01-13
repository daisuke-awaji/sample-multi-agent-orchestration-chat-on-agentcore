/**
 * Session Management API Client
 * Client for calling Backend session API
 */

import { backendGet, backendPatch } from './client/backend-client';

/**
 * Session information type definition
 */
export interface SessionSummary {
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  agentId?: string;
  workingDirectory?: string;
  modelId?: string;
}

/**
 * Update session input type definition
 */
export interface UpdateSessionInput {
  agentId?: string | null;
  workingDirectory?: string;
  modelId?: string;
  title?: string;
}

/**
 * ToolUse type definition (shared with Backend)
 */
export interface ToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status?: 'pending' | 'running' | 'completed' | 'error';
  originalToolUseId?: string;
}

/**
 * ToolResult type definition (shared with Backend)
 */
export interface ToolResult {
  toolUseId: string;
  content: string;
  isError: boolean;
}

/**
 * MessageContent type definition (Union type)
 */
export type MessageContent =
  | { type: 'text'; text: string }
  | { type: 'toolUse'; toolUse: ToolUse }
  | { type: 'toolResult'; toolResult: ToolResult }
  | { type: 'image'; image: { base64: string; mimeType: string; fileName?: string } };

/**
 * Conversation message type definition
 */
export interface ConversationMessage {
  id: string;
  type: 'user' | 'assistant';
  contents: MessageContent[];
  timestamp: string;
}

/**
 * API response type definition
 */
interface SessionsResponse {
  sessions: SessionSummary[];
  metadata: {
    requestId: string;
    timestamp: string;
    actorId: string;
    count: number;
    nextToken?: string;
    hasMore: boolean;
  };
}

interface SessionEventsResponse {
  events: ConversationMessage[];
  metadata: {
    requestId: string;
    timestamp: string;
    actorId: string;
    sessionId: string;
    count: number;
  };
}

/**
 * Fetch session list
 * @returns All sessions sorted by creation date (newest first)
 */
export async function fetchSessions(): Promise<SessionSummary[]> {
  const data = await backendGet<SessionsResponse>('/sessions');
  return data.sessions;
}

/**
 * Fetch session conversation history
 * @param sessionId Session ID
 * @returns Conversation history
 */
export async function fetchSessionEvents(sessionId: string): Promise<ConversationMessage[]> {
  const data = await backendGet<SessionEventsResponse>(`/sessions/${sessionId}/events`);
  return data.events;
}

/**
 * Update session settings
 * @param sessionId Session ID
 * @param updates Updates to apply
 * @returns Updated session
 */
export async function updateSession(
  sessionId: string,
  updates: UpdateSessionInput
): Promise<SessionSummary> {
  const data = await backendPatch<{ session: SessionSummary }>(`/sessions/${sessionId}`, updates);
  return data.session;
}
