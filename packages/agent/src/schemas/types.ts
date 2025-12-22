/**
 * JSON Schema プロパティの型定義
 */
export interface JSONSchemaProperty {
  type: string;
  description?: string;
}

/**
 * JSON Schema の型定義
 */
export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
}

/**
 * MCP ツール定義の型
 */
export interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema: JSONSchema;
}

/**
 * ツール入力の型定義
 */
export type ToolInput = Record<string, unknown>;
