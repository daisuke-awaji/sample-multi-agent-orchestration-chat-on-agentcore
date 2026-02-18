import { MCPToolDefinition } from '../schemas/types.js';

const WORKSPACE_DIR = '/tmp/ws';
/**
 * デフォルトコンテキストを生成
 * @param tools 有効なツール一覧
 * @param _mcpTools MCP ツール定義一覧
 */
export function generateDefaultContext(
  tools: Array<{ name: string; description?: string }>,
  _mcpTools: MCPToolDefinition[]
): string {
  // 現在時刻を年月日時まで取得（プロンプトキャッシュ最適化のため分秒を除外）
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hour = String(now.getUTCHours()).padStart(2, '0');
  const currentTime = `${year}-${month}-${day}T${hour}:00:00Z`;

  // Markdown 描画ルールを英語で定義
  const markdownRules = `    This system supports the following Markdown formats:
    - Mermaid diagram notation (\`\`\`mermaid ... \`\`\`)
    - LaTeX math notation (inline: $...$, block: $$...$$)
    - Image: ![alt](https://xxx.s3.us-east-1.amazonaws.com/<presignedUrl>)`;

  // S3関連ツールが有効かどうかをチェック
  const s3ToolNames = ['s3_list_files', 's3_download_file', 's3_upload_file', 's3_sync_folder'];
  const enabledS3Tools = tools.filter((tool) => s3ToolNames.includes(tool.name));
  const hasS3Tools = enabledS3Tools.length > 0;

  // S3ストレージツールが有効な場合のみセクションを追加
  let userStorageSection = '';
  if (hasS3Tools) {
    const enabledToolsList = enabledS3Tools.map((t) => `    - ${t.name}`).join('\n');
    userStorageSection = `

  ## About File Output
  - You are running on AWS Bedrock AgentCore. Therefore, when writing files, always write them under ${WORKSPACE_DIR}.
  - Similarly, if you need a workspace, please use the ${WORKSPACE_DIR} directory. Do not ask the user about their current workspace. It's always ${WORKSPACE_DIR}.
  - Also, users cannot directly access files written under ${WORKSPACE_DIR}. So when submitting these files to users, *always upload them to S3 using the s3_upload_file tool and provide the S3 URL*. The S3 URL must be included in the final output.
  - If the output file is an image file, the S3 URL output must be in Markdown format.
  - Note: When uploading files with Japanese or non-ASCII characters, specify contentType with charset (e.g., "text/plain; charset=utf-8") to ensure proper encoding.

  <user_storage>
    <description>
      You have access to a dedicated personal S3 storage space for this user.
      This storage is isolated per user and persists across conversations.
    </description>
    <enabled_tools>
${enabledToolsList}
    </enabled_tools>
    <usage_guidelines>
      - All paths are relative to user's root (e.g., "/code/app.py", "/docs/report.md")
      - The s3_sync_folder tool is the most efficient and effective way to specify an S3 directory and synchronize it with the AgentCore Runtime storage.
      - When asked to save, store, or keep something, use s3_upload_file
      - Organize files logically using directories (e.g., /code/, /notes/, /data/)
      - Presigned URLs are valid for 1 hour by default and can be shared externally
      - For large files or binary content, prefer presigned URLs over inline content
      - Always upload artifacts to S3 and provide users with presigned URLs, as users cannot directly access the file storage of the runtime where the agent is running.
    </usage_guidelines>
  </user_storage>`;
  }

  // Think ツールが有効かどうかをチェック
  const hasThinkTool = tools.some((tool) => tool.name === 'think');

  let thinkToolSection = '';
  if (hasThinkTool) {
    thinkToolSection = `

  ## Thinking Tool

  You have access to a \`think\` tool. Use it to reason through complex situations BEFORE taking action:

  - **After receiving tool results**: Analyze what the results mean before making the next tool call
  - **When facing ambiguous requests**: Think through the user's intent before proceeding
  - **For multi-step planning**: Plan your approach before executing a sequence of actions
  - **When deciding between approaches**: Evaluate trade-offs before committing to one path
  - **Before critical operations**: Verify your reasoning before executing destructive or irreversible actions

  You do NOT need to use \`think\` for simple, straightforward tasks.`;
  }

  return `
<context>
  <current_time>${currentTime}</current_time>
  <markdown_rules>
${markdownRules}
  </markdown_rules>${userStorageSection}${thinkToolSection}
</context>`;
}
