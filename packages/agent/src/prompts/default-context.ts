import { MCPToolDefinition } from '../schemas/types.js';

/**
 * デフォルトコンテキストを生成
 * @param tools 有効なツール一覧
 * @param mcpTools MCP ツール定義一覧
 */
export function generateDefaultContext(
  tools: Array<{ name: string; description?: string }>,
  mcpTools: MCPToolDefinition[]
): string {
  // 現在時刻をISO 8601形式（UTC）で取得
  const now = new Date();
  const currentTime = now.toISOString();

  // ツール一覧をフォーマット（英語）
  const toolDescriptions: string[] = [];

  tools.forEach((tool) => {
    if (tool.name === 'get_weather') {
      // ローカルツール
      toolDescriptions.push(`    - ${tool.name}: Get weather information for a specified city`);
    } else {
      // MCP ツール
      const mcpTool = mcpTools.find((mcp) => mcp.name === tool.name);
      const description = mcpTool?.description || 'No description available';
      toolDescriptions.push(`    - ${tool.name}: ${description}`);
    }
  });

  const availableTools = toolDescriptions.length > 0 ? toolDescriptions.join('\n') : '    - None';

  // Markdown 描画ルールを英語で定義
  const markdownRules = `    This system supports the following Markdown formats:
    - Mermaid diagram notation (\`\`\`mermaid ... \`\`\`)
    - LaTeX math notation (inline: $...$, block: $$...$$)`;

  return `
<context>
  <current_time>${currentTime}</current_time>
  <available_tools>
${availableTools}
  </available_tools>
  <markdown_rules>
${markdownRules}
  </markdown_rules>
</context>`;
}
