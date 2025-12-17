/**
 * MCP Tools List Test
 * AgentCore Gateway で利用可能なツール一覧を詳細表示
 */

import { validateConfig, logger } from "../config/index.js";
import { cognitoAuth } from "../auth/cognito.js";

async function listAvailableTools(): Promise<void> {
  logger.info("=== 利用可能なツール一覧取得 ===");

  try {
    // Cognito トークンを取得
    const authHeader = await cognitoAuth.getAuthorizationHeader();

    // Tools list を取得
    const response = await fetch(
      "https://default-gateway-0wpcw3peau.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp",
      {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        }),
      }
    );

    if (response.ok) {
      const data = await response.json();

      logger.info("✅ ツール一覧取得成功");
      logger.info("利用可能なツール数:", data.result.tools.length);

      // 各ツールの詳細を表示
      data.result.tools.forEach((tool: any, index: number) => {
        logger.info(`--- ツール ${index + 1} ---`);
        logger.info("名前:", tool.name);
        logger.info("説明:", tool.description || "（説明なし）");
        logger.info("入力スキーマ:", JSON.stringify(tool.inputSchema, null, 2));
      });
    } else {
      const errorText = await response.text();
      logger.error("❌ ツール一覧取得失敗:", {
        status: response.status,
        error: errorText,
      });
    }
  } catch (error) {
    logger.error("❌ ツール一覧取得エラー:", error);
    throw error;
  }
}

async function testActualTool(
  toolName: string,
  toolArgs: any = {}
): Promise<void> {
  logger.info(`=== ${toolName} ツールテスト開始 ===`);

  try {
    // Cognito トークンを取得
    const authHeader = await cognitoAuth.getAuthorizationHeader();

    // 指定されたツールを呼び出し
    const response = await fetch(
      "https://default-gateway-0wpcw3peau.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp",
      {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: toolName,
            arguments: toolArgs,
          },
        }),
      }
    );

    logger.info(`${toolName} ツール レスポンス:`, {
      status: response.status,
      statusText: response.statusText,
    });

    if (response.ok) {
      const data = await response.json();
      logger.info(
        `✅ ${toolName} ツール呼び出し成功:`,
        JSON.stringify(data, null, 2)
      );
    } else {
      const errorText = await response.text();
      logger.error(`❌ ${toolName} ツール呼び出し失敗:`, {
        status: response.status,
        error: errorText,
      });
    }
  } catch (error) {
    logger.error(`❌ ${toolName} ツール呼び出しエラー:`, error);
  }
}

async function main(): Promise<void> {
  try {
    // 設定検証
    validateConfig();

    // Cognito認証
    await cognitoAuth.authenticate();
    logger.info("認証完了");

    // ツール一覧取得
    await listAvailableTools();

    // 実際のツールをテスト
    await testActualTool("echo-tool___echo", {
      message: "Hello from AgentCore Gateway!",
    });
    await testActualTool("echo-tool___ping", {});

    logger.info("🎉 ツール一覧取得が完了しました！");
  } catch (error) {
    logger.error("💥 テストが失敗しました:", error);
    process.exit(1);
  }
}

// スクリプトとして直接実行された場合
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
