/**
 * MCP Integration Test
 * AgentCore Gateway との接続をテストします
 */

import { validateConfig, logger } from "../config/index.js";
import { cognitoAuth } from "../auth/cognito.js";

async function testCognitoAuth(): Promise<void> {
  logger.info("=== Cognito認証テスト開始 ===");

  try {
    // 認証実行
    const tokens = await cognitoAuth.authenticate();

    logger.info("✅ Cognito認証成功", {
      tokenType: tokens.tokenType,
      expiresIn: tokens.expiresIn,
      idTokenLength: tokens.idToken.length,
    });

    // Authorization ヘッダー取得
    const authHeader = await cognitoAuth.getAuthorizationHeader();
    logger.info("✅ Authorizationヘッダー取得成功", {
      headerLength: authHeader.length,
      prefix: authHeader.substring(0, 20) + "...",
    });
  } catch (error) {
    logger.error("❌ Cognito認証失敗:", error);
    throw error;
  }
}

async function testMCPConnection(): Promise<void> {
  logger.info("=== MCP接続テスト開始 ===");

  try {
    // Cognito トークンを取得
    const authHeader = await cognitoAuth.getAuthorizationHeader();

    // HTTPクライアントで直接テスト
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

    // ヘッダー情報を安全に取得
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    logger.info("MCP レスポンス:", {
      status: response.status,
      statusText: response.statusText,
      headers: headers,
    });

    if (response.ok) {
      const data = await response.json();
      logger.info("✅ MCP接続成功:", data);
    } else {
      const errorText = await response.text();
      logger.error("❌ MCP接続失敗:", {
        status: response.status,
        error: errorText,
      });
    }
  } catch (error) {
    logger.error("❌ MCP接続エラー:", error);
    throw error;
  }
}

async function testToolCall(): Promise<void> {
  logger.info("=== ツール呼び出しテスト開始 ===");

  try {
    // Cognito トークンを取得
    const authHeader = await cognitoAuth.getAuthorizationHeader();

    // Ping ツールを呼び出し
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
            name: "ping",
            arguments: {},
          },
        }),
      }
    );

    logger.info("Ping ツール レスポンス:", {
      status: response.status,
      statusText: response.statusText,
    });

    if (response.ok) {
      const data = await response.json();
      logger.info("✅ Pingツール呼び出し成功:", data);
    } else {
      const errorText = await response.text();
      logger.error("❌ Pingツール呼び出し失敗:", {
        status: response.status,
        error: errorText,
      });
    }
  } catch (error) {
    logger.error("❌ ツール呼び出しエラー:", error);
    throw error;
  }
}

async function testEchoTool(): Promise<void> {
  logger.info("=== Echo ツールテスト開始 ===");

  try {
    // Cognito トークンを取得
    const authHeader = await cognitoAuth.getAuthorizationHeader();

    // Echo ツールを呼び出し
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
          id: 3,
          method: "tools/call",
          params: {
            name: "echo",
            arguments: {
              message: "Hello from AgentCore Gateway!",
            },
          },
        }),
      }
    );

    logger.info("Echo ツール レスポンス:", {
      status: response.status,
      statusText: response.statusText,
    });

    if (response.ok) {
      const data = await response.json();
      logger.info("✅ Echoツール呼び出し成功:", data);
    } else {
      const errorText = await response.text();
      logger.error("❌ Echoツール呼び出し失敗:", {
        status: response.status,
        error: errorText,
      });
    }
  } catch (error) {
    logger.error("❌ Echoツール呼び出しエラー:", error);
    throw error;
  }
}

async function main(): Promise<void> {
  try {
    // 設定検証
    validateConfig();

    // テストを順次実行
    await testCognitoAuth();
    await testMCPConnection();
    await testToolCall();
    await testEchoTool();

    logger.info("🎉 全てのテストが完了しました！");
  } catch (error) {
    logger.error("💥 テストが失敗しました:", error);
    process.exit(1);
  }
}

// スクリプトとして直接実行された場合
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
