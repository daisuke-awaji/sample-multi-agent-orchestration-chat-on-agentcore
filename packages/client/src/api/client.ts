/**
 * AgentCore API Client
 * AgentCore Runtime との HTTP 通信クライアント
 */

import fetch from 'node-fetch';
import type { ClientConfig } from '../config/index.js';
import { getCachedJwtToken } from '../auth/cognito.js';

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
   * Agent 呼び出し
   */
  async invoke(
    prompt: string,
    useAuth: boolean = true,
    sessionId?: string
  ): Promise<InvokeResponse> {
    // AgentCore Runtime の場合は /invocations が既に含まれているため追加しない
    const isAgentCoreRuntime =
      this.config.endpoint.includes('bedrock-agentcore') &&
      this.config.endpoint.includes('/invocations');
    const url = isAgentCoreRuntime ? this.config.endpoint : `${this.config.endpoint}/invocations`;

    try {
      // 両環境で統一: JSON 形式を使用
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // AgentCore Runtime の場合は追加のヘッダーが必要
      if (isAgentCoreRuntime) {
        // セッション ID: 引数で渡された場合はそれを使用、なければ新規生成
        const actualSessionId =
          sessionId || `client-session-${Date.now()}-${Math.random().toString(36).substring(2)}`;
        headers['X-Amzn-Trace-Id'] = `client-trace-${Date.now()}`;
        headers['X-Amzn-Bedrock-AgentCore-Runtime-Session-Id'] = actualSessionId;
      }

      // JWT認証が必要な場合
      if (useAuth && this.config.isAwsRuntime) {
        const authResult = await getCachedJwtToken(this.config.cognito);
        headers['Authorization'] = `Bearer ${authResult.accessToken}`;
      }

      // 両環境で統一: JSON 形式を使用
      const body = JSON.stringify({ prompt });

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

        // レスポンスボディからエラー詳細を取得
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

      return (await response.json()) as InvokeResponse;
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
