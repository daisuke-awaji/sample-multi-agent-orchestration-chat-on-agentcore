/**
 * AgentCore Gateway Sample Application
 * Strands AI Agent を使用して AgentCore Gateway のツールを呼び出すサンプルアプリケーション
 */

import * as readline from "readline";
import { validateConfig, logger } from "./config";
import { cognitoAuth } from "./auth/cognito.js";
import { mcpClient } from "./mcp/client.js";
import { StrandsAgent } from "./agent/strands-agent";

/**
 * 対話型 CLI モードを実行
 */
async function runInteractiveMode(): Promise<void> {
  try {
    console.log("🤖 AgentCore AI Agent を初期化中...");

    const agent = new StrandsAgent();
    await agent.initialize();

    console.log("✅ AI Agent の準備が完了しました！");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🤖 AgentCore AI Agent (exit または quit で終了)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "You: ",
    });

    const promptUser = (): void => {
      rl.prompt();
    };

    rl.on("line", async (input: string) => {
      const query = input.trim();

      if (!query) {
        promptUser();
        return;
      }

      // 終了コマンドの処理
      if (query.toLowerCase() === "exit" || query.toLowerCase() === "quit") {
        console.log("\n👋 AgentCore AI Agent を終了します");
        rl.close();
        return;
      }

      try {
        console.log("\n🤖 処理中...");
        const response = await agent.invoke(query);
        console.log(`Agent: ${response}\n`);
      } catch (error) {
        console.error(`❌ エラー: ${error}\n`);
        logger.error("Agent invoke エラー:", error);
      }

      promptUser();
    });

    rl.on("close", () => {
      console.log("\nさようなら！ 👋");
      process.exit(0);
    });

    // 初回プロンプト表示
    promptUser();
  } catch (error) {
    logger.error("❌ インタラクティブモードの初期化に失敗:", error);
    console.error("💥 AI Agent の初期化に失敗しました:", error);
    process.exit(1);
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

    // ツール一覧表示
    const tools = await mcpClient.listTools();
    logger.info(`✅ 利用可能なツール: ${tools.length}個`);

    // 対話型 CLI モード開始
    await runInteractiveMode();
  } catch (error) {
    logger.error("💥 アプリケーション実行エラー:", error);
    process.exit(1);
  } finally {
    // クリーンアップは不要（ステートレス設計）
    logger.debug("アプリケーション終了");
  }
}

// スクリプトとして直接実行された場合
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
