/**
 * Session Management API Client
 * Client for calling Backend session API
 */

import { backendGet, backendDelete } from './client/backend-client';

/**
 * Session information type definition
 */
export interface SessionSummary {
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  agentId?: string;
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
 * Options for fetching sessions
 */
export interface FetchSessionsOptions {
  limit?: number;
  nextToken?: string;
}

/**
 * Result of fetching sessions with pagination info
 */
export interface FetchSessionsResult {
  sessions: SessionSummary[];
  nextToken?: string;
  hasMore: boolean;
}

/**
 * Fetch session list with pagination support
 * @param options Pagination options
 * @returns Sessions and pagination info
 */
export async function fetchSessions(options?: FetchSessionsOptions): Promise<FetchSessionsResult> {
  const params = new URLSearchParams();

  if (options?.limit) {
    params.set('limit', options.limit.toString());
  }

  if (options?.nextToken) {
    params.set('nextToken', options.nextToken);
  }

  const queryString = params.toString();
  const url = queryString ? `/sessions?${queryString}` : '/sessions';

  const data = await backendGet<SessionsResponse>(url);

  return {
    sessions: data.sessions,
    nextToken: data.metadata.nextToken,
    hasMore: data.metadata.hasMore,
  };
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
 * Delete a session
 * @param sessionId Session ID to delete
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await backendDelete(`/sessions/${sessionId}`);
}
