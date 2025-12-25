/**
 * AgentCore Runtime HTTP Server
 * AgentCore Runtime で動作する HTTP サーバー
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createAgent } from './agent.js';
import { getContextMetadata, getCurrentContext } from './context/request-context.js';
import { requestContextMiddleware } from './middleware/request-context.js';
import { createSessionStorage, SessionPersistenceHook } from './session/index.js';
import type { SessionConfig } from './session/types.js';
import { logger } from './config/index.js';

/**
 * Strands Agents ストリーミングイベントを安全にシリアライズ
 * 循環参照を含むオブジェクトから必要なプロパティのみを抽出
 */
function serializeStreamEvent(event: unknown): object {
  const eventObj = event as { type?: string; [key: string]: unknown };
  const baseEvent = { type: eventObj.type };

  switch (eventObj.type) {
    // テキスト生成イベント
    case 'modelContentBlockDeltaEvent':
      return {
        ...baseEvent,
        delta: eventObj.delta,
      };

    case 'modelContentBlockStartEvent':
      return {
        ...baseEvent,
        start: eventObj.start,
      };

    case 'modelContentBlockStopEvent':
      return {
        ...baseEvent,
        stop: eventObj.stop,
      };

    // メッセージライフサイクルイベント
    case 'modelMessageStartEvent':
      return {
        ...baseEvent,
        message: eventObj.message
          ? {
              role: (eventObj.message as { role: unknown }).role,
              content: (eventObj.message as { content: unknown }).content,
            }
          : undefined,
      };

    case 'modelMessageStopEvent':
      return {
        ...baseEvent,
        message: eventObj.message
          ? {
              role: (eventObj.message as { role: unknown }).role,
              content: (eventObj.message as { content: unknown }).content,
            }
          : undefined,
      };

    case 'messageAddedEvent':
      return {
        ...baseEvent,
        message: eventObj.message
          ? {
              role: (eventObj.message as { role: unknown }).role,
              content: (eventObj.message as { content: unknown }).content,
            }
          : undefined,
      };

    // メタデータ・結果イベント
    case 'modelMetadataEvent':
      return {
        ...baseEvent,
        metadata: eventObj.metadata,
      };

    case 'agentResult':
      return {
        ...baseEvent,
        result: eventObj.result,
      };

    // テキストブロックイベント
    case 'textBlock':
      return {
        ...baseEvent,
        text: eventObj.text,
      };

    // ストリームフックイベント（頻繁に発生するため軽量化）
    case 'modelStreamEventHook':
      return {
        ...baseEvent,
        // フック情報は基本的に不要なので type のみ
      };

    // 既存のライフサイクルイベント
    case 'beforeInvocationEvent':
    case 'afterInvocationEvent':
    case 'afterToolsEvent':
    case 'beforeModelCallEvent':
      return baseEvent;

    case 'beforeToolsEvent':
      return {
        ...baseEvent,
        message: eventObj.message
          ? {
              role: (eventObj.message as { role: unknown }).role,
              content: (eventObj.message as { content: unknown }).content,
            }
          : undefined,
      };

    case 'afterModelCallEvent':
      return {
        ...baseEvent,
        stopReason: eventObj.stopReason,
        stopData: eventObj.stopData
          ? {
              message: (eventObj.stopData as { message: unknown }).message,
            }
          : undefined,
      };

    default:
      // 真に未知のイベントタイプの場合のみ警告を表示
      logger.warn('新しい未知のストリーミングイベント:', { type: eventObj.type });
      return baseEvent;
  }
}

const PORT = process.env.PORT || 8080;
const app = express();

// CORS 設定
const corsOptions = {
  // 許可するオリジン（環境変数から設定、デフォルトは全て許可）
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allowed?: boolean) => void
  ) => {
    const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['*'];

    // ローカル開発時は localhost を許可
    const developmentOrigins = [
      'http://localhost:5173', // Vite dev server
      'http://127.0.0.1:5173',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ];

    // オリジンがない場合（Postmanなどのツールからのリクエスト）は許可
    if (!origin) {
      return callback(null, true);
    }

    // 設定されたオリジンまたは開発用オリジンの場合は許可
    if (
      allowedOrigins.includes('*') ||
      allowedOrigins.includes(origin) ||
      developmentOrigins.includes(origin)
    ) {
      callback(null, true);
    } else {
      logger.warn('🚫 CORS blocked origin:', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id',
    'X-Actor-Id',
  ],
  credentials: true,
  maxAge: 86400, // preflight キャッシュ 24時間
};

// CORS ミドルウェアを適用
app.use(cors(corsOptions));

// セッションストレージの初期化（環境変数に基づく切り替え）
const sessionStorage = createSessionStorage();

// リクエストボディを JSON として受け取る設定
app.use(express.json());

// リクエストコンテキストミドルウェアを適用（認証が必要なエンドポイント）
app.use('/invocations', requestContextMiddleware);

/**
 * ヘルスチェックエンドポイント
 * AgentCore Runtime が正常に動作していることを確認するためのエンドポイント
 */
app.get('/ping', (req: Request, res: Response) => {
  res.json({
    status: 'Healthy',
    time_of_last_update: Math.floor(Date.now() / 1000),
  });
});

/**
 * Agent 呼び出しリクエストの型定義
 */
interface InvocationRequest {
  prompt: string; // 必須: ユーザーの入力
  modelId?: string; // 任意: 使用するモデルID（デフォルト: 環境変数）
  enabledTools?: string[]; // 任意: 有効化するツール名の配列（undefined=全て、[]=なし）
  systemPrompt?: string; // 任意: カスタムシステムプロンプト
  storagePath?: string; // 任意: ユーザーが選択しているS3ディレクトリパス
  memoryEnabled?: boolean; // 任意: 長期記憶を有効化するか（デフォルト: false）
  memoryTopK?: number; // 任意: 取得する長期記憶の件数（デフォルト: 10）
  mcpConfig?: Record<string, unknown>; // 任意: ユーザー定義の MCP サーバー設定
}

/**
 * Agent 呼び出しエンドポイント（ストリーミング対応）
 * セッションごとに Agent を作成し、履歴の永続化を行う
 */
app.post('/invocations', async (req: Request, res: Response) => {
  try {
    // リクエストボディから各パラメータを取得
    const {
      prompt,
      modelId,
      enabledTools,
      systemPrompt,
      storagePath,
      memoryEnabled,
      memoryTopK,
      mcpConfig,
    } = req.body as InvocationRequest;

    if (!prompt?.trim()) {
      return res.status(400).json({
        error: 'Empty prompt provided',
      });
    }

    // storagePathをコンテキストに設定
    const context = getCurrentContext();
    if (context) {
      context.storagePath = storagePath || '/';
    }

    // セッションID をヘッダーから取得（オプショナル）
    const sessionId = req.headers['x-amzn-bedrock-agentcore-runtime-session-id'] as
      | string
      | undefined;

    // RequestContext から userId を取得
    const contextMeta = getContextMetadata();
    const actorId = contextMeta.userId || 'anonymous';

    logger.info('📝 リクエスト受信:', {
      requestId: contextMeta.requestId,
      prompt,
      actorId,
      sessionId: sessionId || 'なし（セッションなしモード）',
    });

    // セッション設定とフック（sessionIdがある場合のみ）
    let sessionConfig: SessionConfig | undefined;
    let sessionHook: SessionPersistenceHook | undefined;

    if (sessionId) {
      sessionConfig = { actorId, sessionId };
      sessionHook = new SessionPersistenceHook(sessionStorage, sessionConfig);
    }

    // Agent作成オプション
    const agentOptions = {
      modelId,
      enabledTools,
      systemPrompt,
      ...(sessionId && { sessionStorage, sessionConfig }),
      // 長期記憶パラメータ（JWT の userId を actorId として使用）
      memoryEnabled,
      memoryContext: memoryEnabled ? prompt : undefined,
      actorId: memoryEnabled ? actorId : undefined,
      memoryTopK,
      // ユーザー定義 MCP サーバー設定
      mcpConfig,
    };

    // Agent を作成（セッションフックは条件付き）
    const hooks = sessionHook ? [sessionHook] : [];
    const { agent, metadata } = await createAgent(hooks, agentOptions);

    // Agent作成完了のログ出力
    logger.info('📊 Agent作成完了:', {
      requestId: contextMeta.requestId,
      loadedMessages: metadata.loadedMessagesCount,
      longTermMemories: metadata.longTermMemoriesCount,
      tools: metadata.toolsCount,
    });

    // ストリーミングレスポンス用のヘッダー設定
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // nginx のバッファリング無効

    try {
      logger.info('🔄 Agent ストリーミング開始:', { requestId: contextMeta.requestId });

      // ストリーミングイベントを NDJSON として送信
      for await (const event of agent.stream(prompt)) {
        // messageAddedEvent の場合はリアルタイムで保存（sessionIdがある場合のみ）
        if (event.type === 'messageAddedEvent' && event.message && sessionConfig) {
          try {
            await sessionStorage.appendMessage(sessionConfig, event.message);
            logger.info('💾 メッセージをリアルタイム保存:', {
              role: event.message.role,
              contentBlocks: event.message.content.length,
            });
          } catch (saveError) {
            logger.error('⚠️ メッセージ保存に失敗 (ストリーミング継続):', saveError);
            // 保存エラーでもストリーミングは継続する
          }
        }

        // 循環参照を回避してイベントをシリアライズ
        const safeEvent = serializeStreamEvent(event);
        res.write(`${JSON.stringify(safeEvent)}\n`);
      }

      logger.info('✅ Agent ストリーミング完了:', { requestId: contextMeta.requestId });

      // 完了メタデータを送信
      const completionEvent = {
        type: 'serverCompletionEvent',
        metadata: {
          requestId: contextMeta.requestId,
          duration: contextMeta.duration,
          sessionId: sessionId,
          actorId: actorId,
          conversationLength: agent.messages.length,
          // Agent作成時のメタデータも含める
          agentMetadata: metadata,
        },
      };
      res.write(`${JSON.stringify(completionEvent)}\n`);

      res.end();
    } catch (streamError) {
      logger.error('❌ Agent ストリーミングエラー:', {
        requestId: contextMeta.requestId,
        error: streamError,
      });

      // エラーイベントを送信
      const errorEvent = {
        type: 'serverErrorEvent',
        error: {
          message: streamError instanceof Error ? streamError.message : 'Unknown streaming error',
          requestId: contextMeta.requestId,
        },
      };
      res.write(`${JSON.stringify(errorEvent)}\n`);
      res.end();
    }
  } catch (error) {
    const contextMeta = getContextMetadata();
    logger.error('❌ Error processing request:', {
      requestId: contextMeta.requestId,
      error,
    });

    // 初期エラーの場合は JSON レスポンス
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        requestId: contextMeta.requestId,
      });
    }
  }
});

/**
 * ルートエンドポイント（情報表示用）
 */
app.get('/', (req: Request, res: Response) => {
  res.json({
    service: 'AgentCore Runtime Agent',
    version: '0.1.0',
    endpoints: {
      health: 'GET /ping',
      invoke: 'POST /invocations',
    },
    status: 'running',
  });
});

/**
 * 404 ハンドラー
 */
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.path} not found`,
    availableEndpoints: ['GET /', 'GET /ping', 'POST /invocations'],
  });
});

/**
 * エラーハンドラー
 */
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error('💥 Unhandled error:', { error: err, path: req.path, method: req.method });
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
  });
});

/**
 * アプリケーション開始
 */
async function startServer(): Promise<void> {
  try {
    // HTTPサーバー開始（Agent初期化は最初のリクエスト時に実行）
    app.listen(PORT, () => {
      logger.info('🚀 AgentCore Runtime server 起動:', {
        port: PORT,
        healthCheck: `http://localhost:${PORT}/ping`,
        agentEndpoint: `POST http://localhost:${PORT}/invocations`,
        note: 'Agent は最初のリクエスト時に初期化されます',
      });
    });
  } catch (error) {
    logger.error('💥 サーバー開始に失敗:', { error });
    process.exit(1);
  }
}

// サーバー開始
startServer();

// Graceful shutdown の処理
process.on('SIGTERM', () => {
  logger.info('🛑 Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('🛑 Received SIGINT, shutting down gracefully');
  process.exit(0);
});
