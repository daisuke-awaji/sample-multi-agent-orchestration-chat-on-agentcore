/**
 * AgentCore Runtime HTTP Server
 * AgentCore Runtime で動作する HTTP サーバー
 */

import express, { Request, Response, NextFunction } from "express";
import { Agent } from "@strands-agents/sdk";
import { createAgent } from "./agent.js";
import { getContextMetadata } from "./context/request-context.js";
import { requestContextMiddleware } from "./middleware/request-context.js";

const PORT = process.env.PORT || 8080;
const app = express();

// Agent インスタンス（遅延初期化）
let agent: Agent | null = null;
let initializationPromise: Promise<void> | null = null;

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
      console.log("🤖 AgentCore AI Agent を初期化中... (遅延初期化)");
      agent = await createAgent();
      console.log("✅ AI Agent の準備が完了しました！");
    } catch (error) {
      console.error("💥 AI Agent の初期化に失敗しました:", error);
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
app.use("/invocations", requestContextMiddleware);

/**
 * ヘルスチェックエンドポイント
 * AgentCore Runtime が正常に動作していることを確認するためのエンドポイント
 */
app.get("/ping", (req: Request, res: Response) => {
  res.json({
    status: "Healthy",
    time_of_last_update: Math.floor(Date.now() / 1000),
  });
});

/**
 * Agent 呼び出しエンドポイント
 * ユーザーからのクエリを受け取り、Agent に処理させて結果を返す
 */
app.post("/invocations", async (req: Request, res: Response) => {
  try {
    // リクエストコンテキスト内でAgentを初期化（JWTが利用可能）
    await ensureAgentInitialized();

    // Agent が初期化されているかチェック（念のため）
    if (!agent) {
      return res.status(503).json({
        error: "Service Unavailable",
        message: "Agent initialization failed",
      });
    }

    // リクエストボディからプロンプトを取得（JSON 形式）
    const prompt = req.body?.prompt || "";

    if (!prompt.trim()) {
      return res.status(400).json({
        error: "Empty prompt provided",
      });
    }

    const contextMeta = getContextMetadata();
    console.log(`📝 Received prompt (${contextMeta.requestId}): ${prompt}`);

    // Agent でプロンプトを処理
    const result = await agent.invoke(prompt);

    // 結果を JSON で返す
    return res.json({
      response: result,
      metadata: {
        requestId: contextMeta.requestId,
        duration: contextMeta.duration,
      },
    });
  } catch (error) {
    const contextMeta = getContextMetadata();
    console.error(
      `❌ Error processing request (${contextMeta.requestId}):`,
      error
    );

    // エラーレスポンスを返す
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
      requestId: contextMeta.requestId,
    });
  }
});

/**
 * ルートエンドポイント（情報表示用）
 */
app.get("/", (req: Request, res: Response) => {
  res.json({
    service: "AgentCore Runtime Agent",
    version: "0.1.0",
    endpoints: {
      health: "GET /ping",
      invoke: "POST /invocations",
    },
    status: "running",
  });
});

/**
 * 404 ハンドラー
 */
app.use("*", (req: Request, res: Response) => {
  res.status(404).json({
    error: "Not Found",
    message: `Endpoint ${req.method} ${req.path} not found`,
    availableEndpoints: ["GET /", "GET /ping", "POST /invocations"],
  });
});

/**
 * エラーハンドラー
 */
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("💥 Unhandled error:", err);
  res.status(500).json({
    error: "Internal Server Error",
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
      console.log(
        `🤖 Agent endpoint: POST http://localhost:${PORT}/invocations`
      );
      console.log("⏳ Agent は最初のリクエスト時に初期化されます");
    });
  } catch (error) {
    console.error("💥 サーバー開始に失敗しました:", error);
    process.exit(1);
  }
}

// サーバー開始
startServer();

// Graceful shutdown の処理
process.on("SIGTERM", () => {
  console.log("🛑 Received SIGTERM, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 Received SIGINT, shutting down gracefully");
  process.exit(0);
});
