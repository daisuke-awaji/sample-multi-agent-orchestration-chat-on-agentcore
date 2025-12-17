// MCP SDK が利用できない場合のフォールバック実装
// import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/http.js";
// import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { config, logger } from "../config/index.js";
import { cognitoAuth } from "../auth/cognito.js";

/**
 * MCP ツール呼び出しの結果
 */
export interface MCPToolResult {
  toolUseId: string;
  content: Array<{
    type: "text" | "json";
    text?: string;
    json?: unknown;
  }>;
  isError: boolean;
}

/**
 * MCP クライアントエラー
 */
export class MCPClientError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = "MCPClientError";
  }
}

/**
 * AgentCore Gateway MCP クライアント (HTTP ベース)
 */
export class AgentCoreMCPClient {
  private isConnected = false;
  private readonly endpointUrl: string;

  constructor() {
    this.endpointUrl = config.AGENTCORE_GATEWAY_ENDPOINT;
    logger.debug("AgentCore MCP クライアントを初期化", {
      endpoint: this.endpointUrl,
    });
  }

  /**
   * MCP サーバーに接続
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      logger.debug("既に接続済みです");
      return;
    }

    try {
      logger.info("AgentCore Gateway に接続中...");

      // Cognito 認証をテスト
      await cognitoAuth.authenticate();

      // 接続テスト
      await this.testConnection();

      this.isConnected = true;
      logger.info("AgentCore Gateway に接続しました");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "不明なエラー";
      logger.error("AgentCore Gateway への接続に失敗:", errorMessage);

      throw new MCPClientError(
        `AgentCore Gateway への接続に失敗: ${errorMessage}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * 接続をテスト
   */
  private async testConnection(): Promise<void> {
    const authHeader = await cognitoAuth.getAuthorizationHeader();

    const response = await fetch(this.endpointUrl, {
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
    });

    if (!response.ok) {
      throw new Error(
        `Connection test failed: ${response.status} ${response.statusText}`
      );
    }
  }

  /**
   * 接続を切断
   */
  async disconnect(): Promise<void> {
    this.isConnected = false;
    logger.info("AgentCore Gateway から切断しました");
  }

  /**
   * 利用可能なツール一覧を取得
   */
  async listTools(): Promise<
    Array<{
      name: string;
      description?: string;
      inputSchema: unknown;
    }>
  > {
    await this.ensureConnected();

    try {
      logger.debug("ツール一覧を取得中...");

      const authHeader = await cognitoAuth.getAuthorizationHeader();
      const response = await fetch(this.endpointUrl, {
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
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (config.DEBUG_MCP) {
        logger.debug("取得したツール一覧:", data);
      }

      if (data.error) {
        throw new Error(`MCP Error: ${data.error.message}`);
      }

      return data.result.tools;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "不明なエラー";
      logger.error("ツール一覧の取得に失敗:", errorMessage);

      throw new MCPClientError(
        `ツール一覧の取得に失敗: ${errorMessage}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * ツールを呼び出し
   */
  async callTool(
    toolName: string,
    arguments_: Record<string, unknown>
  ): Promise<MCPToolResult> {
    await this.ensureConnected();

    try {
      logger.info("ツールを呼び出し中:", { toolName, arguments: arguments_ });

      const authHeader = await cognitoAuth.getAuthorizationHeader();
      const response = await fetch(this.endpointUrl, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/call",
          params: {
            name: toolName,
            arguments: arguments_,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (config.DEBUG_MCP) {
        logger.debug("ツール呼び出し結果:", data);
      }

      if (data.error) {
        return {
          toolUseId: "error",
          content: [{ type: "text", text: `MCP Error: ${data.error.message}` }],
          isError: true,
        };
      }

      // レスポンスを統一形式に変換
      const result: MCPToolResult = {
        toolUseId: data.result?.toolUseId || "unknown",
        content: data.result?.content || [
          { type: "text", text: JSON.stringify(data.result || {}) },
        ],
        isError: data.result?.isError || false,
      };

      logger.info("ツール呼び出しが完了しました:", {
        toolName,
        success: !result.isError,
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "不明なエラー";
      logger.error("ツール呼び出しに失敗:", errorMessage);

      throw new MCPClientError(
        `ツール呼び出しに失敗: ${errorMessage}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * 接続状態を確認し、必要に応じて再接続
   */
  private async ensureConnected(): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }
  }

  /**
   * 接続状態を取得
   */
  get connected(): boolean {
    return this.isConnected;
  }
}

/**
 * シングルトンのMCPクライアント
 */
export const mcpClient = new AgentCoreMCPClient();
