/**
 * Strands AI Agent - Default Implementation
 * AgentCore Gateway のツールを使用する最もシンプルな AI Agent
 */

import { Agent } from "@strands-agents/sdk";
import { config, logger } from "../config/index.js";
import { mcpClient } from "../mcp/client.js";

/**
 * Strands AI Agent for AgentCore Gateway
 */
export class StrandsAgent {
  private agent: Agent;
  private isInitialized = false;

  constructor() {
    // デフォルトのStrands Agent を作成（Amazon Bedrock provider を使用）
    this.agent = new Agent({
      systemPrompt: `あなたはAgentCore Gatewayのデモ用AI Agentです。

ユーザーからの質問に日本語で丁寧に応答してください。
技術的な内容についても分かりやすく説明してください。`,
    });

    logger.debug("StrandsAgent を初期化しました");
  }

  /**
   * Agent を初期化
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      logger.info("Strands Agent を初期化中...");

      // MCP クライアント接続
      if (!mcpClient.connected) {
        await mcpClient.connect();
      }

      this.isInitialized = true;
      logger.info("✅ Strands Agent の初期化が完了しました");
    } catch (error) {
      logger.error("❌ Strands Agent の初期化に失敗:", error);
      throw error;
    }
  }

  /**
   * ユーザークエリを処理
   */
  async invoke(query: string): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      logger.info("Agent にクエリを送信:", query);

      // シンプルなクエリマッチング + AI Agent の組み合わせ
      if (query.toLowerCase().includes("ping") || query.includes("接続確認")) {
        const mcpResult = await this.callMCPTool("echo-tool___ping", {});
        const aiResponse = await this.agent.invoke(
          `次のシステム情報について日本語で分かりやすく説明してください: ${mcpResult}`
        );
        return typeof aiResponse === "string"
          ? aiResponse
          : JSON.stringify(aiResponse);
      } else if (
        query.toLowerCase().includes("echo") ||
        query.includes("エコー")
      ) {
        const messageMatch = query.match(/[「"](.*?)[」"]/);
        const message = messageMatch
          ? messageMatch[1]
          : "Hello from AgentCore Gateway!";

        const mcpResult = await this.callMCPTool("echo-tool___echo", {
          message,
        });
        const aiResponse = await this.agent.invoke(
          `次のエコー結果について説明してください: ${mcpResult}`
        );
        return typeof aiResponse === "string"
          ? aiResponse
          : JSON.stringify(aiResponse);
      } else {
        // 通常の AI Agent として動作
        const aiResponse = await this.agent.invoke(query);
        return typeof aiResponse === "string"
          ? aiResponse
          : JSON.stringify(aiResponse);
      }
    } catch (error) {
      logger.error("❌ Agent invoke エラー:", error);
      return `エラーが発生しました: ${error}`;
    }
  }

  /**
   * MCP ツールを直接呼び出し
   */
  private async callMCPTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<string> {
    try {
      const result = await mcpClient.callTool(toolName, args);

      if (result.isError) {
        return `ツールエラー: ${result.content.map((c) => c.text).join(", ")}`;
      }

      return result.content[0]?.text || JSON.stringify(result);
    } catch (error) {
      return `MCP ツール呼び出しエラー: ${error}`;
    }
  }

  /**
   * 初期化状態を取得
   */
  get initialized(): boolean {
    return this.isInitialized;
  }
}
