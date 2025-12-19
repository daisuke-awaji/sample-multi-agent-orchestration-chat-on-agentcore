import type {
  AgentStreamEvent,
  ModelContentBlockDeltaEvent,
  ModelContentBlockStartEvent,
  ServerCompletionEvent,
  ServerErrorEvent,
} from '../types/index';
import { useAuthStore } from '../stores/authStore';

// Agent API エンドポイント（環境変数から取得）
// ローカル開発時: http://localhost:8080/invocations → Vite proxy経由
// 本番環境: AgentCore Runtime エンドポイント（/invocations 含む）
const AGENT_ENDPOINT = import.meta.env.VITE_AGENT_ENDPOINT || '';

/**
 * ストリーミングコールバック型
 */
interface StreamingCallbacks {
  onTextDelta?: (text: string) => void;
  onToolStart?: (toolName: string) => void;
  onToolEnd?: (toolName: string) => void;
  onComplete?: (metadata: Record<string, unknown>) => void;
  onError?: (error: Error) => void;
}

/**
 * Agent にストリーミングでプロンプトを送信する
 */
export const streamAgentResponse = async (
  prompt: string,
  sessionId: string | null,
  callbacks: StreamingCallbacks
): Promise<void> => {
  const { user } = useAuthStore.getState();

  if (!user) {
    throw new Error('認証が必要です');
  }

  // ARN部分をURLエンコードする（AgentCore Runtimeの場合）
  let url = AGENT_ENDPOINT;
  if (AGENT_ENDPOINT.includes('bedrock-agentcore') && AGENT_ENDPOINT.includes('/runtimes/arn:')) {
    // ARN部分を抽出してエンコード
    url = AGENT_ENDPOINT.replace(
      /\/runtimes\/(arn:[^/]+\/[^/]+)\//,
      (_match: string, arn: string) => {
        return `/runtimes/${encodeURIComponent(arn)}/`;
      }
    );
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${user.accessToken}`,
  };

  // セッションIDがあれば追加
  if (sessionId) {
    headers['X-Amzn-Bedrock-AgentCore-Runtime-Session-Id'] = sessionId;
  }

  const body = JSON.stringify({ prompt });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

      try {
        const errorText = await response.text();
        if (errorText) {
          const errorJson = JSON.parse(errorText);
          errorMessage += ` - ${errorJson.message || errorJson.error || errorText}`;
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

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // 残りのバッファを処理
          if (buffer.trim()) {
            try {
              const event = JSON.parse(buffer.trim()) as AgentStreamEvent;
              handleStreamEvent(event, callbacks);
            } catch (parseError) {
              console.warn('最終バッファ パースエラー:', parseError, 'バッファ:', buffer);
            }
          }
          break;
        }

        // バッファに新しいチャンクを追加
        buffer += decoder.decode(value, { stream: true });

        // 改行で分割してNDJSONを処理
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 最後の不完全な行を保持

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            try {
              const event = JSON.parse(trimmed) as AgentStreamEvent;
              handleStreamEvent(event, callbacks);
            } catch (parseError) {
              console.warn('NDJSON パースエラー:', parseError, 'ライン:', trimmed);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    if (callbacks.onError) {
      callbacks.onError(error instanceof Error ? error : new Error('Agent API エラー'));
    } else {
      throw error;
    }
  }
};

/**
 * ストリーミングイベントを処理する
 */
const handleStreamEvent = (event: AgentStreamEvent, callbacks: StreamingCallbacks) => {
  switch (event.type) {
    case 'modelContentBlockDeltaEvent': {
      const deltaEvent = event as ModelContentBlockDeltaEvent;
      if (deltaEvent.delta.type === 'textDelta' && callbacks.onTextDelta) {
        callbacks.onTextDelta(deltaEvent.delta.text);
      }
      break;
    }

    case 'modelContentBlockStartEvent': {
      const startEvent = event as ModelContentBlockStartEvent;
      if (startEvent.start?.type === 'toolUseStart' && callbacks.onToolStart) {
        callbacks.onToolStart(startEvent.start.name || '不明なツール');
      }
      break;
    }

    case 'afterToolsEvent': {
      if (callbacks.onToolEnd) {
        // ツール名を特定するのは困難なので、汎用的な処理
        callbacks.onToolEnd('ツール実行完了');
      }
      break;
    }

    case 'serverCompletionEvent': {
      const completionEvent = event as ServerCompletionEvent;
      if (callbacks.onComplete) {
        callbacks.onComplete(completionEvent.metadata);
      }
      break;
    }

    case 'serverErrorEvent': {
      const errorEvent = event as ServerErrorEvent;
      if (callbacks.onError) {
        callbacks.onError(new Error(errorEvent.error.message));
      }
      break;
    }

    // その他のイベントはログに出力
    default:
      console.debug('ストリーミングイベント:', event.type, event);
      break;
  }
};

/**
 * Agent エンドポイントの設定を取得
 */
export const getAgentConfig = () => ({
  endpoint: AGENT_ENDPOINT,
});

/**
 * Agent 接続をテストする
 */
export const testAgentConnection = async (): Promise<boolean> => {
  try {
    // ARN部分をURLエンコード処理してからbaseEndpointを構築
    let baseEndpoint = AGENT_ENDPOINT.replace('/invocations', '').replace('?qualifier=DEFAULT', '');

    if (baseEndpoint.includes('bedrock-agentcore') && baseEndpoint.includes('/runtimes/arn:')) {
      // ARN部分をエンコード
      baseEndpoint = baseEndpoint.replace(
        /\/runtimes\/(arn:[^/]+\/[^/]+)\//,
        (_match: string, arn: string) => {
          return `/runtimes/${encodeURIComponent(arn)}/`;
        }
      );
    }

    const response = await fetch(`${baseEndpoint}/ping`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return response.ok;
  } catch {
    return false;
  }
};
