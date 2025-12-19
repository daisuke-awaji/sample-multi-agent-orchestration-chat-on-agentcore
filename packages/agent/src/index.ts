/**
 * AgentCore Runtime HTTP Server
 * AgentCore Runtime で動作する HTTP サーバー
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { Agent, Message } from '@strands-agents/sdk';
import { createAgent } from './agent.js';
import { getContextMetadata } from './context/request-context.js';
import { requestContextMiddleware } from './middleware/request-context.js';

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
    case 'beforeToolsEvent':
    case 'afterToolsEvent':
    case 'beforeModelCallEvent':
      return baseEvent;

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
      console.warn(`新しい未知のストリーミングイベント: ${eventObj.type}`);
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
      console.warn(`🚫 CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id'],
  credentials: true,
  maxAge: 86400, // preflight キャッシュ 24時間
};

// CORS ミドルウェアを適用
app.use(cors(corsOptions));

// Agent インスタンス（遅延初期化）
let agent: Agent | null = null;
let initializationPromise: Promise<void> | null = null;

// セッション履歴管理
interface SessionHistory {
  sessionId: string;
  messages: Message[];
  lastAccessed: Date;
}

// セッション履歴を保存するMap（本来はRedisなどの永続化ストレージを使用）
const sessionHistories = new Map<string, SessionHistory>();

// セッション履歴のクリーンアップ（1時間以上アクセスされていないものを削除）
setInterval(
  () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    for (const [sessionId, history] of sessionHistories.entries()) {
      if (history.lastAccessed < oneHourAgo) {
        sessionHistories.delete(sessionId);
        console.log(`🗑️ セッション履歴をクリーンアップ: ${sessionId}`);
      }
    }
  },
  15 * 60 * 1000
); // 15分ごとにチェック

/**
 * セッション履歴を取得または作成
 */
function getOrCreateSessionHistory(sessionId: string): SessionHistory {
  let history = sessionHistories.get(sessionId);
  if (!history) {
    history = {
      sessionId,
      messages: [],
      lastAccessed: new Date(),
    };
    sessionHistories.set(sessionId, history);
    console.log(`📝 新しいセッション履歴を作成: ${sessionId}`);
  } else {
    history.lastAccessed = new Date();
  }
  return history;
}

/**
 * セッション履歴にメッセージを追加
 */
function addMessageToSession(sessionId: string, message: Message): void {
  const history = getOrCreateSessionHistory(sessionId);
  history.messages.push(message);
  console.log(`💬 メッセージを履歴に追加 (${sessionId}): ${history.messages.length}件`);
}

// Agent の遅延初期化（最初のリクエスト時に実行）
async function ensureAgentInitialized(): Promise<void> {
  // 既に初期化済みの場合はスキップ
  if (agent) {
    return;
  }

  // 初期化中の場合は既存のPromiseを待機
  if (initializationPromise) {
    await initializationPromise;
    return;
  }

  // 新しい初期化プロセスを開始
  initializationPromise = (async () => {
    try {
      console.log('🤖 AgentCore AI Agent を初期化中... (遅延初期化)');
      agent = await createAgent();
      console.log('✅ AI Agent の準備が完了しました！');
    } catch (error) {
      console.error('💥 AI Agent の初期化に失敗しました:', error);
      // 初期化に失敗した場合、次回リクエストで再試行できるようにPromiseをクリア
      initializationPromise = null;
      throw error;
    }
  })();

  await initializationPromise;
}

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
 * Agent 呼び出しエンドポイント（ストリーミング対応）
 * ユーザーからのクエリを受け取り、Agent のストリーミングレスポンスを NDJSON 形式で返す
 */
app.post('/invocations', async (req: Request, res: Response) => {
  try {
    // リクエストコンテキスト内でAgentを初期化（JWTが利用可能）
    await ensureAgentInitialized();

    // Agent が初期化されているかチェック（念のため）
    if (!agent) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Agent initialization failed',
      });
    }

    // リクエストボディからプロンプトを取得（JSON 形式）
    const prompt = req.body?.prompt || '';

    if (!prompt.trim()) {
      return res.status(400).json({
        error: 'Empty prompt provided',
      });
    }

    // セッションIDをヘッダーから取得
    const sessionId = req.headers['x-amzn-bedrock-agentcore-runtime-session-id'] as string;

    const contextMeta = getContextMetadata();
    console.log(`📝 Received prompt (${contextMeta.requestId}): ${prompt}`);
    console.log(`🔗 Session ID: ${sessionId}`);

    // ストリーミングレスポンス用のヘッダー設定
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // nginx のバッファリング無効

    // セッション履歴を取得
    const sessionHistory = sessionId ? getOrCreateSessionHistory(sessionId) : null;

    // ユーザーメッセージを作成
    const userMessage: Message = {
      type: 'message',
      role: 'user',
      content: [{ type: 'textBlock', text: prompt }],
    };

    // セッション履歴にユーザーメッセージを追加
    if (sessionHistory) {
      addMessageToSession(sessionId, userMessage);
    }

    // Agent をストリーミングで呼び出し
    let finalMessage: Message | undefined;

    try {
      console.log(`🔄 Agent ストリーミング開始 (${contextMeta.requestId})`);

      // ストリーミングイベントを NDJSON として送信
      for await (const event of agent.stream(prompt)) {
        // 循環参照を回避してイベントをシリアライズ
        const safeEvent = serializeStreamEvent(event);
        res.write(`${JSON.stringify(safeEvent)}\n`);

        // 最終メッセージを記録（セッション履歴用）
        if (event.type === 'afterModelCallEvent' && event.stopData?.message) {
          finalMessage = event.stopData.message;
        }
      }

      console.log(`✅ Agent ストリーミング完了 (${contextMeta.requestId})`);

      // 完了メタデータを送信
      const completionEvent = {
        type: 'serverCompletionEvent',
        metadata: {
          requestId: contextMeta.requestId,
          duration: contextMeta.duration,
          sessionId: sessionId,
          conversationLength: sessionHistory?.messages.length || 1,
        },
      };
      res.write(`${JSON.stringify(completionEvent)}\n`);

      // Assistant の応答をセッション履歴に追加
      if (sessionHistory && finalMessage) {
        addMessageToSession(sessionId, finalMessage);
      }

      res.end();
    } catch (streamError) {
      console.error(`❌ Agent ストリーミングエラー (${contextMeta.requestId}):`, streamError);

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
    console.error(`❌ Error processing request (${contextMeta.requestId}):`, error);

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
  console.error('💥 Unhandled error:', err);
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
      console.log(`🚀 AgentCore Runtime server listening on port ${PORT}`);
      console.log(`📋 Health check: http://localhost:${PORT}/ping`);
      console.log(`🤖 Agent endpoint: POST http://localhost:${PORT}/invocations`);
      console.log('⏳ Agent は最初のリクエスト時に初期化されます');
    });
  } catch (error) {
    console.error('💥 サーバー開始に失敗しました:', error);
    process.exit(1);
  }
}

// サーバー開始
startServer();

// Graceful shutdown の処理
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully');
  process.exit(0);
});
