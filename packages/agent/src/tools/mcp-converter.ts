import { tool } from '@strands-agents/sdk';
import { MCPToolDefinition, ToolInput } from '../schemas/types.js';
import { convertToZodSchema } from '../schemas/zod-converter.js';
import { mcpClient, MCPToolResult } from '../mcp/client.js';
import { logger } from '../config/index.js';

/**
 * MCP ツールを Strands ツールに変換
 */
export function createStrandsToolFromMCP(mcpTool: MCPToolDefinition) {
  const { schema, keyMapping } = convertToZodSchema(mcpTool.inputSchema);

  return tool({
    name: mcpTool.name,
    description: mcpTool.description || `AgentCore Gateway ツール: ${mcpTool.name}`,
    inputSchema: schema,
    callback: async (input: ToolInput): Promise<string> => {
      try {
        // サニタイズされたキーを元のキーに変換
        const originalInput: Record<string, unknown> = {};
        for (const [sanitizedKey, value] of Object.entries(input)) {
          const originalKey = keyMapping[sanitizedKey] || sanitizedKey;
          originalInput[originalKey] = value;
        }

        logger.debug(`ツール呼び出し: ${mcpTool.name}`, originalInput);
        const result: MCPToolResult = await mcpClient.callTool(mcpTool.name, originalInput);

        if (result.isError) {
          logger.error(`ツール実行エラー: ${mcpTool.name}`, result);
          return `ツール実行エラー: ${result.content[0]?.text || '不明なエラー'}`;
        }

        // 結果を文字列として返す
        const contentText = result.content
          .map((item) => {
            if (item.text) return item.text;
            if (item.json) return JSON.stringify(item.json, null, 2);
            return '';
          })
          .filter(Boolean)
          .join('\n');

        return contentText || 'ツールの実行が完了しました。';
      } catch (error) {
        logger.error(`ツール呼び出し中にエラー: ${mcpTool.name}`, error);
        return `ツール呼び出し中にエラーが発生しました: ${error}`;
      }
    },
  });
}

/**
 * MCP ツール一覧を Strands ツールに一括変換
 * @param mcpTools 既に取得済みのMCPツール一覧
 */
export function convertMCPToolsToStrands(
  mcpTools: MCPToolDefinition[]
): Array<ReturnType<typeof tool>> {
  logger.info(`✅ ${mcpTools.length}個のMCPツールを変換しています`);

  return mcpTools.map((mcpTool) => {
    logger.debug(`ツール変換中: ${mcpTool.name}`);
    return createStrandsToolFromMCP(mcpTool);
  });
}
