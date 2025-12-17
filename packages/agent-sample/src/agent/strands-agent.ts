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

      // MCP クライアントはステートレス設計のため、事前接続は不要
      // 各リクエスト時に必要な認証ヘッダーが自動取得される

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
      const response = await this.agent.invoke(query);
      return typeof response === "string" ? response : JSON.stringify(response);
    } catch (error) {
      logger.error("❌ Agent invoke エラー:", error);
      return `エラーが発生しました: ${error}`;
    }
  }

  /**
   * 初期化状態を取得
   */
  get initialized(): boolean {
    return this.isInitialized;
  }
}
