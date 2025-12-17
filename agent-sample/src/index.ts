/**
 * AgentCore Gateway Sample Application
 * Strands AI Agent を使用して AgentCore Gateway のツールを呼び出すサンプルアプリケーション
 */

import { validateConfig, logger } from "./config";
import { cognitoAuth } from "./auth/cognito.js";
import { mcpClient } from "./mcp/client.js";
import { StrandsAgent } from "./agent/strands-agent";

async function demonstrateAgent(): Promise<void> {
  logger.info("=== AI Agent デモ ===");

  try {
    const agent = new StrandsAgent();

    // エージェントを初期化
    await agent.initialize();

    // 対話形式でツールを使用
    const queries = [
      "Pingツールを使って接続確認をしてください",
      "「AgentCore Gateway is awesome!」というメッセージをEchoツールでエコーしてください",
      "システム情報を確認してください",
    ];

    for (const [index, query] of queries.entries()) {
      logger.info(`--- クエリ ${index + 1}: ${query} ---`);

      const response = await agent.invoke(query);
      logger.info(`✅ Agent レスポンス:`, response);

      // 少し待機
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  } catch (error) {
    logger.error("❌ Agent デモ失敗:", error);
  }
}

async function main(): Promise<void> {
  try {
    logger.info("🚀 AgentCore Gateway Sample Application 開始");

    // 設定検証
    validateConfig();

    // 認証
    await cognitoAuth.authenticate();
    logger.info("✅ Cognito 認証完了");

    // MCP 接続
    await mcpClient.connect();
    logger.info("✅ MCP 接続完了");

    // ツール一覧表示
    const tools = await mcpClient.listTools();
    logger.info(`✅ 利用可能なツール: ${tools.length}個`);

    // デモ実行
    await demonstrateAgent();

    logger.info("🎉 全てのデモが完了しました！");
  } catch (error) {
    logger.error("💥 アプリケーション実行エラー:", error);
    process.exit(1);
  } finally {
    // クリーンアップ
    try {
      await mcpClient.disconnect();
    } catch (error) {
      logger.error("クリーンアップエラー:", error);
    }
  }
}

// スクリプトとして直接実行された場合
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
