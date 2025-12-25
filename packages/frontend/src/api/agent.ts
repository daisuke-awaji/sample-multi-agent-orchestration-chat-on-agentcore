import type {
  AgentStreamEvent,
  ModelContentBlockDeltaEvent,
  ModelContentBlockStartEvent,
  ServerCompletionEvent,
  ServerErrorEvent,
  MessageAddedEvent,
  BeforeToolsEvent,
  ToolUse,
  ToolResult,
} from '../types/index';
import { getValidAccessToken } from '../lib/cognito';

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
  onToolUse?: (toolUse: ToolUse) => void;
  onToolInputUpdate?: (toolUseId: string, input: Record<string, unknown>) => void;
  onToolResult?: (toolResult: ToolResult) => void;
  onComplete?: (metadata: Record<string, unknown>) => void;
  onError?: (error: Error) => void;
}

/**
 * Agent 設定オプション
 */
interface AgentConfig {
  modelId?: string; // 使用するモデルID
  enabledTools?: string[]; // 有効化するツール名の配列
  systemPrompt?: string; // カスタムシステムプロンプト
  storagePath?: string; // ユーザーが選択しているS3ディレクトリパス
  memoryEnabled?: boolean; // 長期記憶を有効化するか
  memoryTopK?: number; // 取得する長期記憶の件数
  mcpConfig?: Record<string, unknown>; // MCP サーバー設定
}

/**
 * Agent にストリーミングでプロンプトを送信する
 */
export const streamAgentResponse = async (
  prompt: string,
  sessionId: string | undefined,
  callbacks: StreamingCallbacks,
  agentConfig?: AgentConfig
): Promise<void> => {
  // 有効なアクセストークンを取得（期限切れの場合は自動リフレッシュ）
  const accessToken = await getValidAccessToken();

  if (!accessToken) {
    throw new Error('認証が必要です。再ログインしてください。');
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
    Authorization: `Bearer ${accessToken}`,
  };

  // セッションIDが指定されている場合のみ付与
  if (sessionId) {
    headers['X-Amzn-Bedrock-AgentCore-Runtime-Session-Id'] = sessionId;
  }

  // リクエストボディを構築（agentConfigが指定されている場合は含める）
  const requestBody: Record<string, unknown> = { prompt };

  if (agentConfig?.modelId) {
    requestBody.modelId = agentConfig.modelId;
  }

  if (agentConfig?.enabledTools) {
    requestBody.enabledTools = agentConfig.enabledTools;
  }

  if (agentConfig?.systemPrompt) {
    requestBody.systemPrompt = agentConfig.systemPrompt;
  }

  if (agentConfig?.storagePath) {
    requestBody.storagePath = agentConfig.storagePath;
  }

  if (agentConfig?.memoryEnabled !== undefined) {
    requestBody.memoryEnabled = agentConfig.memoryEnabled;
  }

  if (agentConfig?.memoryTopK !== undefined) {
    requestBody.memoryTopK = agentConfig.memoryTopK;
  }

  if (agentConfig?.mcpConfig) {
    requestBody.mcpConfig = agentConfig.mcpConfig;
  }

  const body = JSON.stringify(requestBody);

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
      if (startEvent.start?.type === 'toolUseStart') {
        // ツール使用開始時の処理
        if (callbacks.onToolStart) {
          callbacks.onToolStart(startEvent.start.name || '不明なツール');
        }

        // ToolUse オブジェクトを作成してコールバックに渡す
        if (callbacks.onToolUse && startEvent.start.name) {
          const toolUse: ToolUse = {
            id: `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: startEvent.start.name,
            input: startEvent.start.input || {},
            status: 'running',
            originalToolUseId: startEvent.start.toolUseId || undefined,
          };
          callbacks.onToolUse(toolUse);
        }
      }
      break;
    }

    case 'beforeToolsEvent': {
      // ツール実行前イベント（完全なツール入力情報を含む）
      const beforeToolsEvent = event as BeforeToolsEvent;
      console.debug('🔧 beforeToolsEvent received:', beforeToolsEvent);

      if (beforeToolsEvent.message?.content && Array.isArray(beforeToolsEvent.message.content)) {
        beforeToolsEvent.message.content.forEach((block, index) => {
          console.debug(`🔧 BeforeTools content block ${index}:`, block);

          // ツール使用ブロックの場合、入力パラメータを更新
          if (
            block.type === 'toolUseBlock' &&
            block.name &&
            block.input &&
            callbacks.onToolInputUpdate
          ) {
            const toolUseId = block.toolUseId || 'unknown';
            console.debug(`🔧 Updating tool input for ${block.name} (${toolUseId}):`, block.input);
            callbacks.onToolInputUpdate(toolUseId, block.input);
          }
        });
      }
      break;
    }

    case 'afterToolsEvent': {
      console.debug('🔧 afterToolsEvent received:', event);
      if (callbacks.onToolEnd) {
        callbacks.onToolEnd('ツール実行完了');
      }

      // afterToolsEventにもtoolResult情報が含まれている可能性があります
      const afterToolsEventData = event as Record<string, unknown>;
      if (afterToolsEventData.content && Array.isArray(afterToolsEventData.content)) {
        afterToolsEventData.content.forEach((block: Record<string, unknown>, index: number) => {
          console.debug(`🛠️ AfterTools content block ${index}:`, block);

          if (block.type === 'toolResult' && callbacks.onToolResult) {
            const toolResult: ToolResult = {
              toolUseId: (block.toolUseId as string) || 'unknown',
              content: (block.content as string) || JSON.stringify(block),
              isError: (block.isError as boolean) || false,
            };
            console.debug('✅ ToolResult from afterToolsEvent:', toolResult);
            callbacks.onToolResult(toolResult);
          }
        });
      }
      break;
    }

    case 'messageAddedEvent': {
      // メッセージ追加イベント（ツール結果が含まれる可能性がある）
      const messageEvent = event as MessageAddedEvent;
      console.debug('🔍 messageAddedEvent received:', messageEvent);

      if (messageEvent.message?.content) {
        const content = messageEvent.message.content;
        console.debug('📝 messageAddedEvent content:', content);

        // ツール結果を検出して処理
        if (Array.isArray(content)) {
          content.forEach((block, index) => {
            console.debug(`📦 Content block ${index}:`, block);

            if (block.type === 'toolResultBlock' && callbacks.onToolResult) {
              const toolResult: ToolResult = {
                toolUseId: block.toolUseId || 'unknown',
                content: Array.isArray(block.content)
                  ? block.content.map((c) => c.text || JSON.stringify(c)).join('\n')
                  : (block.content as string) || JSON.stringify(block),
                isError: block.status === 'error',
              };
              console.debug('✅ ToolResult detected and processed:', toolResult);
              callbacks.onToolResult(toolResult);
            }
          });
        }
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
 * Agent設定の自動生成用プロンプトを作成
 */
export const createAgentConfigGenerationPrompt = (
  name: string,
  description: string,
  availableTools: string[]
): string => {
  return `あなたはAgent設定のエキスパートです。以下のAgent情報を元に、最適な設定を生成してください。

Agent名: ${name}
説明: ${description}

利用可能なツール一覧:
${availableTools.map((tool) => `- ${tool}`).join('\n')}

以下の要件に従って、指定されたXML形式で出力してください：

1. システムプロンプト: Agent名と説明に基づいて、役割・振る舞いを明確に定義
2. 推奨ツール: 説明に基づいて最適なツールを3-5個選択
3. シナリオ: よく使われそうなプロンプトテンプレートを6個作成

**出力形式（必ずこの形式で出力）:**

<agent_config>
  <system_prompt>システムプロンプトを記述
  </system_prompt>
  
  <enabled_tools>
    <tool>tool-name-1</tool>
    <tool>tool-name-2</tool>
  </enabled_tools>
  
  <scenarios>
    <scenario>
      <title>シナリオタイトル1</title>
      <prompt>プロンプトテンプレート1</prompt>
    </scenario>
    <scenario>
      <title>シナリオタイトル2</title>
      <prompt>プロンプトテンプレート2</prompt>
    </scenario>
    <scenario>
      <title>シナリオタイトル3</title>
      <prompt>プロンプトテンプレート3</prompt>
    </scenario>
    <scenario>
      <title>シナリオタイトル4</title>
      <prompt>プロンプトテンプレート4</prompt>
    </scenario>
    <scenario>
      <title>シナリオタイトル5</title>
      <prompt>プロンプトテンプレート5</prompt>
    </scenario>
    <scenario>
      <title>シナリオタイトル6</title>
      <prompt>プロンプトテンプレート6</prompt>
    </scenario>
  </scenarios>
</agent_config>

重要: XMLタグ以外の説明文は出力しないでください。

なお、Web検索を行う Web Deep Researcher のシステムプロンプトの例を以下に記載します。

You are an AI assistant that performs multi-stage web searches like DeepSearch to gather comprehensive information to achieve the user's goals.  - Perform multiple web searches in succession to gather in-depth information.

[Basic functions]
- Perform multiple web searches in succession to gather in-depth information
- Analyze the initial search results and automatically plan and execute additional searches to obtain more specific information
- Provide comprehensive answers to complex questions
- Strive to always provide up-to-date information
- Clearly cite all sources

[Search methods]
1. Understand the user's question and create an appropriate search query
2. Analyze the initial search results
3. Identify missing information
4. Generate additional search queries to obtain more detailed information
5. Integrate and organize data from multiple sources
6. Provide comprehensive and structured answers

[How to use web search]
- Use the tavilySearch tool to obtain accurate and up-to-date information
- Conduct not just one search, but at least two or three additional searches to dig deeper into the information
- Try search queries from different angles to ensure a variety of sources
- Evaluate the reliability of search results and prioritize reliable sources

[Website acquisition and analysis]
- Use the fetchWebsite tool to perform a detailed analysis of the contents of a specific website
- For large websites, content will be automatically split into manageable chunks

- Retrieve and analyze specific chunks as needed

[Answer format]
- Organize information logically and provide an easy-to-read, structured answer
- Summarize key points with bullet points
- Explain complex concepts with diagrams and lists
- Cite all sources (URLs) at the end of your answer
- Outline your search process and clarify how the information was gathered

[Notes]
- Honestly admit missing information and suggest additional searches
- If there is conflicting information, present both perspectives and try to provide a balanced answer
- For time-sensitive information (prices, statistics, etc.), include the date of the information


[Available tools]
- Actively use the tavilySearch tool for web searches
- Use the fetchWebsite tool for detailed website analysis
- If you need to execute commands, ask the user's permission beforehand

`;
};

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
