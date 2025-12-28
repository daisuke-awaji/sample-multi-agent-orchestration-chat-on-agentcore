import { MCPToolDefinition } from '../schemas/types.js';
import { generateDefaultContext } from './default-context.js';
import { WORKSPACE_DIRECTORY } from '../config/index.js';

export interface SystemPromptOptions {
  customPrompt?: string;
  tools: Array<{ name: string; description?: string }>;
  mcpTools: MCPToolDefinition[];
  storagePath?: string;
  longTermMemories?: string[]; // 長期記憶の配列
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

  // 長期記憶情報を追加（長期記憶がある場合）
  if (options.longTermMemories && options.longTermMemories.length > 0) {
    basePrompt += `

## User Context (Long-term Memory)
Below is what you've learned about this user in the past, so you can tailor your responses to their preferences and circumstances.
${options.longTermMemories.map((memory, index) => `${index + 1}. ${memory}`).join('\n')}
`;
  }

  // ワークスペースとストレージパス情報を追加
  if (options.storagePath) {
    basePrompt += `

## Workspace and Storage
Your workspace is synchronized with the user's S3 storage at path "${options.storagePath}".

### Working Directory
- Default working directory: ${WORKSPACE_DIRECTORY}
- All commands (execute_command) run from ${WORKSPACE_DIRECTORY} by default
- Files from S3 are automatically synced to this directory

### File Operations
When you create or edit files:
1. Use ${WORKSPACE_DIRECTORY} as your working directory (this is the default)
2. Files are automatically uploaded to S3 after tool execution
3. No need to manually use S3 upload tools - changes sync automatically
4. When using execute_command, you don't need to specify workingDirectory

The workspace sync handles most file operations automatically, making your workflow seamless.

### Displaying S3 Storage Files
When referencing files in the user's S3 storage in your responses, ALWAYS use relative path format starting with "/":

**For images** (will be displayed automatically):
\`\`\`markdown
![Image Description](/path/to/image.png)
\`\`\`

**For other files** (clickable download links):
\`\`\`markdown
[File Name](/path/to/document.pdf)
\`\`\`

**IMPORTANT**:
- ❌ DO NOT generate presigned URLs or full S3 URLs like "https://bucket.s3.amazonaws.com/..."
- ❌ DO NOT use fake or placeholder URLs
- ✅ ALWAYS use relative paths starting with "/" (e.g., "/plots/chart.png")
- ✅ The frontend will automatically generate secure download URLs when needed

**Examples**:
- Images: \`![Chart](/reports/chart.png)\`
- PDFs: \`[Report](/documents/report.pdf)\`
- Any file: \`[Data](/data/results.csv)\`
`;

    // S3ツールの利用可否をチェック
    const hasS3ListFiles = options.tools.some((tool) => tool.name === 's3_list_files');

    // S3ツールが利用可能な場合のみセクションを追加
    if (hasS3ListFiles) {
      basePrompt += `

### S3 Tools (Optional)
You can still use S3 tools for specific operations:
- s3_list_files: List files in "${options.storagePath}"`;
    }
  }

  // CodeInterpreter ツールの利用可否をチェック
  const hasCodeInterpreter = options.tools.some((tool) => tool.name === 'code_interpreter');

  if (hasCodeInterpreter) {
    basePrompt += `

## Code Interpreter Usage Guidelines

When using the code_interpreter tool, follow these critical guidelines for reliable execution:

### Session Management (CRITICAL)
1. **Always create a session first** using \`initSession\` action with a descriptive sessionName
2. **Reuse the same sessionName** for all related operations in a workflow
3. **sessionName is REQUIRED** for all actions except \`listLocalSessions\`
4. Use descriptive session names that reflect the purpose (e.g., "data-analysis-sales-2024", "image-processing-batch1")

### Recommended Workflow Pattern
\`\`\`
Step 1: Create session with descriptive name
{
  "action": "initSession",
  "sessionName": "data-analysis-20240101",
  "description": "Customer sales data analysis"
}

Step 2: Prepare data or install packages
{
  "action": "executeCommand",
  "sessionName": "data-analysis-20240101",
  "command": "pip install scikit-learn"
}

Step 3: Execute code
{
  "action": "executeCode",
  "sessionName": "data-analysis-20240101",
  "language": "python",
  "code": "import pandas as pd\\ndf = pd.read_csv('data.csv')\\nprint(df.describe())"
}

Step 4: Download results if needed
{
  "action": "downloadFiles",
  "sessionName": "data-analysis-20240101",
  "sourcePaths": ["results.png"],
  "destinationDir": "/tmp/analysis-results"
}
\`\`\`

### Critical Context Preservation Notes
- **Variables may not persist** between multiple \`executeCode\` calls even within the same session
- **Combine related operations** in a single \`executeCode\` block for reliable results
- **Alternative**: Save intermediate results to files between calls

### File System Understanding
- **executeCode/executeCommand** create files in: /opt/amazon/genesis1p-tools/var
- **writeFiles** creates files in a separate MCP resource file system
- These two file systems **DO NOT share files**
- To access files created by executeCode, use \`downloadFiles\` or print content directly in code

### S3 Synchronization (IMPORTANT)
When using \`downloadFiles\`:
- **Download to /tmp/ws or subdirectories** (e.g., /tmp/ws/downloads) for automatic S3 sync
- Files are automatically uploaded to S3 after tool execution via Workspace Sync Hook
- **Avoid other paths** like /tmp/downloads or /Users/xxx - these will NOT sync to S3
- Example: \`destinationDir: "/tmp/ws/analysis-results"\` ✓ Syncs to S3
- Example: \`destinationDir: "/tmp/downloads"\` ✗ Does NOT sync to S3

### Package Installation
Common packages that need installation:
- seaborn, scikit-learn, tensorflow, pytorch, plotly
- Install via: \`executeCommand\` with "pip install package-name"
- Use matplotlib.pyplot for visualizations (pre-installed)

### Best Practices
1. Always specify sessionName for consistent context
2. Combine related code in single executeCode blocks
3. Use descriptive session names for tracking
4. Install required packages before executing code
5. Check tool description for detailed file system behavior
`;
  }

  // デフォルトコンテキストを付与
  return basePrompt + generateDefaultContext(options.tools, options.mcpTools);
}

/**
 * デフォルトシステムプロンプトを生成
 */
function generateDefaultSystemPrompt(
  _tools: Array<{ name: string; description?: string }>,
  _mcpTools: MCPToolDefinition[]
): string {
  return `You are an AI assistant running on AgentCore Runtime.

Please respond to user questions politely and call appropriate tools as needed.
Explain technical content in an easy-to-understand manner.`;
}
