/**
 * AgentCore API Client
 * HTTP communication client for AgentCore Runtime
 */

import fetch from 'node-fetch';
import { randomUUID } from 'crypto';
import type { ClientConfig } from '../config/index.js';
import { getCachedJwtToken } from '../auth/cognito.js';
import { getCachedMachineUserToken } from '../auth/machine-user.js';

// Strands Agents SDK streaming event type definitions
export interface AgentStreamEvent {
  type: string;
  [key: string]: unknown;
}

// Text delta event
export interface ModelContentBlockDeltaEvent extends AgentStreamEvent {
  type: 'modelContentBlockDeltaEvent';
  delta: {
    type: 'textDelta';
    text: string;
  };
}

// Tool use start event
export interface ModelContentBlockStartEvent extends AgentStreamEvent {
  type: 'modelContentBlockStartEvent';
  start: {
    type: 'toolUseStart';
    name: string;
    toolUseId: string;
  };
}

// Model invocation complete event
export interface AfterModelCallEvent extends AgentStreamEvent {
  type: 'afterModelCallEvent';
  stopData?: {
    message: {
      type: string;
      role: string;
      content: Array<{
        type: string;
        text?: string;
        toolUse?: Record<string, unknown>;
      }>;
    };
  };
}

// Server completion event
export interface ServerCompletionEvent extends AgentStreamEvent {
  type: 'serverCompletionEvent';
  metadata: {
    requestId: string;
    duration: number;
    sessionId: string;
    conversationLength: number;
  };
}

// Server error event
export interface ServerErrorEvent extends AgentStreamEvent {
  type: 'serverErrorEvent';
  error: {
    message: string;
    requestId: string;
  };
}

export interface PingResponse {
  status: string;
  time_of_last_update: number;
}

export interface InvokeResponse {
  response: {
    type: string;
    stopReason: string;
    lastMessage?: {
      type: string;
      role: string;
      content: Array<{
        type: string;
        text: string;
      }>;
    };
  };
  metadata?: {
    requestId?: string;
    duration?: number;
  };
}

export interface ServiceInfoResponse {
  service: string;
  version: string;
  endpoints: Record<string, string>;
  status: string;
}

export class AgentCoreClient {
  private config: ClientConfig;

  constructor(config: ClientConfig) {
    this.config = config;
  }

  /**
   * Health check
   */
  async ping(): Promise<PingResponse> {
    const url = `${this.config.endpoint}/ping`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return (await response.json()) as PingResponse;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Ping エラー: ${error.message}`);
      }
      throw new Error('不明なエラーが発生しました');
    }
  }

  /**
   * Get service information
   */
  async getServiceInfo(): Promise<ServiceInfoResponse> {
    const url = `${this.config.endpoint}/`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return (await response.json()) as ServiceInfoResponse;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`サービス情報取得エラー: ${error.message}`);
      }
      throw new Error('不明なエラーが発生しました');
    }
  }

  /**
   * Agent streaming invocation (AsyncGenerator)
   */
  async *invokeStream(prompt: string, sessionId?: string): AsyncGenerator<AgentStreamEvent> {
    // Do not append /invocations if already included in the AgentCore Runtime endpoint
    const isAgentCoreRuntime =
      this.config.endpoint.includes('bedrock-agentcore') &&
      this.config.endpoint.includes('/invocations');
    const url = isAgentCoreRuntime ? this.config.endpoint : `${this.config.endpoint}/invocations`;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Always add session ID to headers
      const actualSessionId = sessionId || `session-${randomUUID()}`;
      headers['X-Amzn-Bedrock-AgentCore-Runtime-Session-Id'] = actualSessionId;

      // Additional trace ID header is also required for AgentCore Runtime
      if (isAgentCoreRuntime) {
        headers['X-Amzn-Trace-Id'] = `client-trace-${Date.now()}`;
      }

      // Authentication handling
      let body: string;
      if (this.config.authMode === 'machine' && this.config.machineUser) {
        // Machine user authentication
        const authResult = await getCachedMachineUserToken(this.config.machineUser);
        headers['Authorization'] = `Bearer ${authResult.accessToken}`;

        // Include targetUserId in request body for machine user mode
        body = JSON.stringify({
          prompt,
          targetUserId: this.config.machineUser.targetUserId,
        });
      } else {
        // Normal user authentication
        const authResult = await getCachedJwtToken(this.config.cognito);
        headers['Authorization'] = `Bearer ${authResult.accessToken}`;
        body = JSON.stringify({ prompt });
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

        try {
          const errorBody = await response.text();
          if (errorBody) {
            const errorJson = JSON.parse(errorBody);
            errorMessage += ` - ${errorJson.message || errorJson.error || errorBody}`;
          }
        } catch {
          // Use original error message if JSON parsing fails
        }

        throw new Error(errorMessage);
      }

      // Process streaming response
      if (!response.body) {
        throw new Error('レスポンスボディが存在しません');
      }

      // Prepare event queue and control Promises
      const eventQueue: AgentStreamEvent[] = [];
      let streamEnded = false;
      let streamError: Error | null = null;

      // Process Node.js ReadableStream
      let buffer = '';

      const processStream = () => {
        response.body!.on('data', (chunk: Buffer) => {
          // Add new chunk to buffer
          buffer += chunk.toString('utf-8');

          // Split by newlines and process NDJSON
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep the last incomplete line

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              try {
                const event: AgentStreamEvent = JSON.parse(trimmed);
                eventQueue.push(event);
              } catch (parseError) {
                console.warn('NDJSON パースエラー:', parseError, 'ライン:', trimmed);
              }
            }
          }
        });

        response.body!.on('end', () => {
          // Process remaining buffer
          if (buffer.trim()) {
            try {
              const event: AgentStreamEvent = JSON.parse(buffer.trim());
              eventQueue.push(event);
            } catch (parseError) {
              console.warn('最終バッファ パースエラー:', parseError, 'バッファ:', buffer);
            }
          }
          streamEnded = true;
        });

        response.body!.on('error', (error) => {
          streamError = error;
          streamEnded = true;
        });
      };

      // Start stream processing
      processStream();

      // Return events via AsyncGenerator
      while (!streamEnded || eventQueue.length > 0) {
        // Throw an exception if an error has occurred
        if (streamError) {
          throw streamError;
        }

        // Return event if queue has items
        if (eventQueue.length > 0) {
          yield eventQueue.shift()!;
        } else if (!streamEnded) {
          // Wait briefly if queue is empty but stream is still ongoing
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Agent ストリーミング呼び出しエラー: ${error.message}`);
      }
      throw new Error('不明なエラーが発生しました');
    }
  }

  /**
   * Agent invocation (streaming-based, for compatibility)
   */
  async invoke(prompt: string, sessionId?: string): Promise<InvokeResponse> {
    try {
      let lastMessage: InvokeResponse['response']['lastMessage'] | undefined;
      let stopReason = '';
      let metadata: ServerCompletionEvent['metadata'] | Record<string, unknown> = {};

      // Process via streaming and assemble final result
      for await (const event of this.invokeStream(prompt, sessionId)) {
        // Record final message
        if (event.type === 'afterModelCallEvent') {
          const afterEvent = event as AfterModelCallEvent;
          if (afterEvent.stopData?.message) {
            // Type conversion: remove toolUse property and make text required
            lastMessage = {
              type: afterEvent.stopData.message.type,
              role: afterEvent.stopData.message.role,
              content: afterEvent.stopData.message.content
                .filter((item) => item.text !== undefined)
                .map((item) => ({
                  type: item.type,
                  text: item.text!,
                })),
            };
            stopReason = (event as { stopReason?: string }).stopReason || 'completed';
          }
        }

        // Get metadata from server completion event
        if (event.type === 'serverCompletionEvent') {
          const completionEvent = event as ServerCompletionEvent;
          metadata = completionEvent.metadata;
        }

        // Throw an exception for error events
        if (event.type === 'serverErrorEvent') {
          const errorEvent = event as ServerErrorEvent;
          throw new Error(errorEvent.error.message);
        }
      }

      // Return in legacy response format
      return {
        response: {
          type: 'invocation',
          stopReason,
          lastMessage,
        },
        metadata,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Agent 呼び出しエラー: ${error.message}`);
      }
      throw new Error('不明なエラーが発生しました');
    }
  }

  /**
   * Connection test (ping + service info)
   */
  async testConnection(): Promise<{
    ping: PingResponse;
    serviceInfo: ServiceInfoResponse;
    connectionTime: number;
  }> {
    const startTime = Date.now();

    try {
      const [pingResult, serviceInfo] = await Promise.all([this.ping(), this.getServiceInfo()]);

      const connectionTime = Date.now() - startTime;

      return {
        ping: pingResult,
        serviceInfo,
        connectionTime,
      };
    } catch (error) {
      const connectionTime = Date.now() - startTime;
      throw new Error(
        `接続テストに失敗しました (${connectionTime}ms): ${
          error instanceof Error ? error.message : '不明なエラー'
        }`
      );
    }
  }

  /**
   * Update endpoint configuration
   */
  setEndpoint(endpoint: string): void {
    this.config.endpoint = endpoint;
  }

  /**
   * Get current configuration
   */
  getConfig(): ClientConfig {
    return { ...this.config };
  }
}

/**
 * Helper to create a default client instance
 */
export function createClient(config: ClientConfig): AgentCoreClient {
  return new AgentCoreClient(config);
}
