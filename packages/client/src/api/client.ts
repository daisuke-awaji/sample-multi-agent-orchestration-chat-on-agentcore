/**
 * AgentCore API Client
 * AgentCore Runtime との HTTP 通信クライアント
 */

import fetch from 'node-fetch';
import { randomUUID } from 'crypto';
import type { ClientConfig } from '../config/index.js';
import { getCachedJwtToken } from '../auth/cognito.js';
import { getCachedMachineUserToken } from '../auth/machine-user.js';

// Strands Agents SDK ストリーミングイベント型定義
export interface AgentStreamEvent {
  type: string;
  [key: string]: unknown;
}

// テキストデルタイベント
export interface ModelContentBlockDeltaEvent extends AgentStreamEvent {
  type: 'modelContentBlockDeltaEvent';
  delta: {
    type: 'textDelta';
    text: string;
  };
}

// ツール使用開始イベント
export interface ModelContentBlockStartEvent extends AgentStreamEvent {
  type: 'modelContentBlockStartEvent';
  start: {
    type: 'toolUseStart';
    name: string;
    toolUseId: string;
  };
}

// モデル呼び出し完了イベント
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

// サーバー完了イベント
export interface ServerCompletionEvent extends AgentStreamEvent {
  type: 'serverCompletionEvent';
  metadata: {
    requestId: string;
    duration: number;
    sessionId: string;
    conversationLength: number;
  };
}

// サーバーエラーイベント
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
   * ヘルスチェック
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
   * サービス情報取得
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
   * Agent ストリーミング呼び出し (AsyncGenerator)
   */
  async *invokeStream(prompt: string, sessionId?: string): AsyncGenerator<AgentStreamEvent> {
    // AgentCore Runtime の場合は /invocations が既に含まれているため追加しない
    const isAgentCoreRuntime =
      this.config.endpoint.includes('bedrock-agentcore') &&
      this.config.endpoint.includes('/invocations');
    const url = isAgentCoreRuntime ? this.config.endpoint : `${this.config.endpoint}/invocations`;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // セッションIDを常にヘッダーに追加
      const actualSessionId = sessionId || `session-${randomUUID()}`;
      headers['X-Amzn-Bedrock-AgentCore-Runtime-Session-Id'] = actualSessionId;

      // AgentCore Runtime の場合は追加のトレースIDヘッダーも必要
      if (isAgentCoreRuntime) {
        headers['X-Amzn-Trace-Id'] = `client-trace-${Date.now()}`;
      }

      // 認証処理
      let body: string;
      if (this.config.authMode === 'machine' && this.config.machineUser) {
        // マシンユーザー認証
        const authResult = await getCachedMachineUserToken(this.config.machineUser);
        headers['Authorization'] = `Bearer ${authResult.accessToken}`;

        // マシンユーザーモードではtargetUserIdをリクエストボディに含める
        body = JSON.stringify({
          prompt,
          targetUserId: this.config.machineUser.targetUserId,
        });
      } else {
        // 通常のユーザー認証
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
          // JSON解析に失敗した場合は元のエラーメッセージを使用
        }

        throw new Error(errorMessage);
      }

      // ストリーミングレスポンスを処理
      if (!response.body) {
        throw new Error('レスポンスボディが存在しません');
      }

      // イベントキュー とコントロール用の Promise を準備
      const eventQueue: AgentStreamEvent[] = [];
      let streamEnded = false;
      let streamError: Error | null = null;

      // Node.js の ReadableStream を処理
      let buffer = '';

      const processStream = () => {
        response.body!.on('data', (chunk: Buffer) => {
          // バッファに新しいチャンクを追加
          buffer += chunk.toString('utf-8');

          // 改行で分割してNDJSONを処理
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // 最後の不完全な行を保持

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
          // 残りのバッファを処理
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

      // ストリーム処理開始
      processStream();

      // AsyncGenerator でイベントを返す
      while (!streamEnded || eventQueue.length > 0) {
        // エラーが発生した場合は例外を投げる
        if (streamError) {
          throw streamError;
        }

        // キューにイベントがある場合は返す
        if (eventQueue.length > 0) {
          yield eventQueue.shift()!;
        } else if (!streamEnded) {
          // キューが空でストリームが続いている場合は少し待つ
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
   * Agent 呼び出し (ストリーミングベース、互換性のため)
   */
  async invoke(prompt: string, sessionId?: string): Promise<InvokeResponse> {
    try {
      let lastMessage: InvokeResponse['response']['lastMessage'] | undefined;
      let stopReason = '';
      let metadata: ServerCompletionEvent['metadata'] | Record<string, unknown> = {};

      // ストリーミングで処理し、最終結果を組み立て
      for await (const event of this.invokeStream(prompt, sessionId)) {
        // 最終メッセージを記録
        if (event.type === 'afterModelCallEvent') {
          const afterEvent = event as AfterModelCallEvent;
          if (afterEvent.stopData?.message) {
            // 型変換：toolUse プロパティを除去し、text を必須に変換
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

        // サーバー完了イベントからメタデータを取得
        if (event.type === 'serverCompletionEvent') {
          const completionEvent = event as ServerCompletionEvent;
          metadata = completionEvent.metadata;
        }

        // エラーイベントの場合は例外を投げる
        if (event.type === 'serverErrorEvent') {
          const errorEvent = event as ServerErrorEvent;
          throw new Error(errorEvent.error.message);
        }
      }

      // 従来のレスポンス形式で返す
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
   * 接続テスト（ping + サービス情報）
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
   * エンドポイントの設定を更新
   */
  setEndpoint(endpoint: string): void {
    this.config.endpoint = endpoint;
  }

  /**
   * 現在の設定を取得
   */
  getConfig(): ClientConfig {
    return { ...this.config };
  }
}

/**
 * デフォルトクライアントインスタンス作成ヘルパー
 */
export function createClient(config: ClientConfig): AgentCoreClient {
  return new AgentCoreClient(config);
}
