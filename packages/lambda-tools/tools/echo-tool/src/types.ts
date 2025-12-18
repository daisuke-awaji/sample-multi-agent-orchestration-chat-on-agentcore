/**
 * AgentCore Gateway Echo/Ping Tool 共通型定義
 */

/**
 * ツール入力の基本型
 */
export interface ToolInput {
  message?: string;
  [key: string]: unknown;
}

/**
 * ツール実行結果の基本型
 */
export interface ToolResult {
  [key: string]: unknown;
}

/**
 * レスポンスメタデータ
 */
export interface ResponseMetadata {
  timestamp: string;
  requestId: string;
  toolName: string;
}

/**
 * AgentCore Gateway からのリクエスト形式
 */
export interface AgentCoreRequest {
  tool: string;
  input?: ToolInput;
  sessionId?: string;
  userId?: string;
}

/**
 * AgentCore Gateway への応答形式
 */
export interface AgentCoreResponse {
  result: ToolResult | null;
  error?: string;
  metadata: ResponseMetadata;
}
