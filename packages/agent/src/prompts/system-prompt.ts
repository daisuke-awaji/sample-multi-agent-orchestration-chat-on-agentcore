import { MCPToolDefinition } from '../schemas/types.js';
import { generateDefaultContext } from './default-context.js';

export interface SystemPromptOptions {
  customPrompt?: string;
  tools: Array<{ name: string; description?: string }>;
  mcpTools: MCPToolDefinition[];
}

/**
 * システムプロンプトを生成
 */
export function buildSystemPrompt(options: SystemPromptOptions): string {
  let basePrompt: string;

  if (options.customPrompt) {
    basePrompt = options.customPrompt;
  } else {
    // デフォルトプロンプト生成ロジック
    basePrompt = generateDefaultSystemPrompt(options.tools, options.mcpTools);
  }

  // デフォルトコンテキストを付与
  return basePrompt + generateDefaultContext(options.tools, options.mcpTools);
}

/**
 * デフォルトシステムプロンプトを生成
 */
function generateDefaultSystemPrompt(
  tools: Array<{ name: string; description?: string }>,
  mcpTools: MCPToolDefinition[]
): string {
  const enabledLocalTools = tools.filter((tool) => tool.name === 'get_weather');
  const enabledMcpTools = tools.filter((tool) => tool.name !== 'get_weather');

  const localToolDescriptions = enabledLocalTools.map(
    (tool) => `- ${tool.name}: 指定された都市の天気情報を取得`
  );
  const gatewayToolDescriptions = enabledMcpTools.map((tool) => {
    const mcpTool = mcpTools.find((mcp) => mcp.name === tool.name);
    return `- ${tool.name}: ${mcpTool?.description || '説明なし'}`;
  });

  const allToolDescriptions = [...localToolDescriptions, ...gatewayToolDescriptions];

  return `あなたは AgentCore Runtime で動作する AI アシスタントです。

${allToolDescriptions.length > 0 ? `利用可能なツール:\n${allToolDescriptions.join('\n')}\n\n` : ''}ユーザーからの質問に日本語で丁寧に応答し、必要に応じて適切なツールを呼び出してください。
技術的な内容についても分かりやすく説明してください。`;
}
