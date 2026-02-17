import path from 'path';
import { MCPToolDefinition } from '../schemas/types.js';
import { generateDefaultContext } from './default-context.js';
import { WORKSPACE_DIRECTORY } from '../config/index.js';

export interface SystemPromptOptions {
  customPrompt?: string;
  tools: Array<{ name: string; description?: string }>;
  mcpTools: MCPToolDefinition[];
  storagePath?: string;
  longTermMemories?: string[]; // Array of long-term memories
}

/**
 * Generate system prompt
 */
export function buildSystemPrompt(options: SystemPromptOptions): string {
  let basePrompt: string;

  if (options.customPrompt) {
    basePrompt = options.customPrompt;
  } else {
    // Default prompt generation logic
    basePrompt = generateDefaultSystemPrompt(options.tools, options.mcpTools);
  }

  // Add long-term memory information (if long-term memories exist)
  if (options.longTermMemories && options.longTermMemories.length > 0) {
    basePrompt += `

## User Context (Long-term Memory)
Below is what you've learned about this user in the past, so you can tailor your responses to their preferences and circumstances.
${options.longTermMemories.map((memory, index) => `${index + 1}. ${memory}`).join('\n')}
`;
  }

  // Compute active working directory (used in multiple prompt sections)
  const normalizedStoragePath = (options.storagePath || '/').replace(/^\/+|\/+$/g, '');
  const activeWorkDir = normalizedStoragePath
    ? path.join(WORKSPACE_DIRECTORY, normalizedStoragePath)
    : WORKSPACE_DIRECTORY;

  // Add workspace and storage path information
  if (options.storagePath) {
    basePrompt += `

## Workspace and Storage
Your workspace is synchronized with the user's S3 storage at path "${options.storagePath}".

### Working Directory
- Default working directory: ${activeWorkDir}
- All commands (execute_command) run from ${activeWorkDir} by default
- Files from S3 are automatically synced to this directory

### File Operations
When you create or edit files:
1. Use ${activeWorkDir} as your working directory (this is the default)
2. Files are automatically uploaded to S3 after tool execution
3. No need to manually use S3 upload tools - changes sync automatically
4. When using execute_command, you don't need to specify workingDirectory

The workspace sync handles most file operations automatically, making your workflow seamless.

### Displaying Files in Chat
When referencing files in chat, strip "${WORKSPACE_DIRECTORY}" from the local path to get the display path:
- Local: ${activeWorkDir}/report.md → Chat: ${options.storagePath}/report.md
- Local: ${activeWorkDir}/plots/chart.png → Chat: ${options.storagePath}/plots/chart.png

**For images**: \`![Chart](${options.storagePath || '/'}plots/chart.png)\`
**For videos**: \`![Video](${options.storagePath || '/'}demo.mp4)\` or \`[Video](${options.storagePath || '/'}demo.mp4)\`
**For other files**: \`[Report](${options.storagePath || '/'}documents/report.pdf)\`

Supported video formats: .mp4, .webm, .mov, .avi, .mkv, .m4v

**Rules:**
- ✅ ALWAYS strip "${WORKSPACE_DIRECTORY}" prefix from paths when referencing files in chat
- ✅ The frontend will automatically generate secure download URLs when needed
- ❌ NEVER include "${WORKSPACE_DIRECTORY}" or "/tmp/" in file references shown to users
- ❌ NEVER generate presigned URLs or full S3 URLs like "https://bucket.s3.amazonaws.com/..."

**Examples** (with storage path "${options.storagePath}"):
- ✅ Correct: \`![Chart](${options.storagePath || '/'}chart.png)\`, \`[Data](${options.storagePath || '/'}results.csv)\`
- ❌ Wrong: \`![Chart](${activeWorkDir}/chart.png)\`, \`[Data](/tmp/ws/results.csv)\`
`;

    // Check S3 tool availability
    const hasS3ListFiles = options.tools.some((tool) => tool.name === 's3_list_files');

    // Add section only if S3 tools are available
    if (hasS3ListFiles) {
      basePrompt += `

### S3 Tools (Optional)
You can still use S3 tools for specific operations:
- s3_list_files: List files in "${options.storagePath}"`;
    }
  }

  // Check CodeInterpreter tool availability
  const hasCodeInterpreter = options.tools.some((tool) => tool.name === 'code_interpreter');

  if (hasCodeInterpreter) {
    basePrompt += `

## Code Interpreter Usage Guidelines

When using the code_interpreter tool, follow these critical guidelines for reliable execution:

### ⛔ CRITICAL FILE PATH RULES (READ FIRST!)

**Code Interpreter and AgentCore Runtime are COMPLETELY SEPARATE environments.**

| DO ✅ | DON'T ❌ |
|-------|----------|
| Create file → downloadFiles → Use userPath | Reference files without downloading |
| \`![Chart](${options.storagePath || '/'}chart.png)\` | \`![Chart](${activeWorkDir}/chart.png)\` |
| \`![Chart](${options.storagePath || '/'}chart.png)\` | \`![Chart](/opt/amazon/.../chart.png)\` |
| Check downloadFiles result for userPath | Use localPath or internal paths |

**MANDATORY WORKFLOW:**
\`\`\`
Step 1: executeCode (create file)
Step 2: downloadFiles (transfer to Runtime)
Step 3: Use 'userPath' from result (NOT 'localPath')
\`\`\`

### ⚠️ Execution Environment Separation

| Environment | Location | Accessible from Runtime? |
|------------|----------|-------------------------|
| Code Interpreter | /opt/amazon/genesis1p-tools/var | ❌ NO - Isolated environment |
| AgentCore Runtime | ${activeWorkDir} (your workspace) | ✅ YES - Your working directory |

**Key Facts:**
- Files created by \`executeCode\` or \`executeCommand\` exist ONLY in Code Interpreter environment
- AgentCore Runtime CANNOT directly access Code Interpreter files
- You MUST use \`downloadFiles\` action to transfer files to Runtime before referencing them

**NEVER do these (causes hallucination/broken references):**
- ❌ Return Code Interpreter file paths directly (e.g., "/opt/amazon/.../output.png")
- ❌ Assume files are accessible in Runtime without downloading
- ❌ Reference files that haven't been transferred via \`downloadFiles\`
- ❌ Generate fake, placeholder, or presigned URLs

**ALWAYS follow this pattern:**
1. ✅ Create files in Code Interpreter (executeCode/executeCommand)
2. ✅ Download files to Runtime (\`downloadFiles\` to ${activeWorkDir})
3. ✅ Verify download success
4. ✅ Return relative paths starting with "/" (e.g., /chart.png, /report.pdf)

### Complete File Creation Workflow (MANDATORY)

**Every file creation must follow these 3 steps:**

**Step 1: Create file in Code Interpreter**
\`\`\`json
{
  "action": "executeCode",
  "sessionName": "data-analysis",
  "language": "python",
  "code": "import matplotlib.pyplot as plt\\nplt.plot([1,2,3])\\nplt.savefig('chart.png')"
}
\`\`\`

**Step 2: Download to AgentCore Runtime (REQUIRED - DO NOT SKIP)**
\`\`\`json
{
  "action": "downloadFiles",
  "sessionName": "data-analysis",
  "sourcePaths": ["chart.png"],
  "destinationDir": "${activeWorkDir}"
}
\`\`\`

**Step 3: Return correct path to user**
\`\`\`markdown
Here is your chart: ![Chart](/chart.png)
\`\`\`

⚠️ **Skipping Step 2 causes broken file references and hallucination!**

### Common Mistakes - Learn from These Anti-Patterns

❌ **WRONG: Returning Code Interpreter internal paths**
\`\`\`
"I created a chart at /opt/amazon/genesis1p-tools/var/sessions/abc/chart.png"
\`\`\`
→ User cannot access this path. File doesn't exist in Runtime.

❌ **WRONG: Assuming file exists without download**
\`\`\`python
# In Code Interpreter
plt.savefig('analysis.png')
\`\`\`
Then immediately: "Here is your analysis: ![Result](/analysis.png)"
→ File wasn't downloaded to Runtime. Link is broken.

❌ **WRONG: Including workspace path in user-facing references**
\`\`\`
"Your file is at ${activeWorkDir}/report.pdf"
\`\`\`
→ Should strip "${WORKSPACE_DIRECTORY}" prefix for proper S3 integration

✅ **CORRECT: Complete workflow**
\`\`\`python
# Step 1: Create
plt.savefig('analysis.png')
\`\`\`
\`\`\`json
// Step 2: Download
{"action": "downloadFiles", "sourcePaths": ["analysis.png"], "destinationDir": "${activeWorkDir}"}
\`\`\`
"Here is your analysis: ![Result](/analysis.png)" // Step 3: Reference

### Pre-Reference Checklist (Verify Before Responding)

Before returning any file reference to the user, verify:
- [ ] Did I create a file via executeCode/executeCommand?
- [ ] Did I run \`downloadFiles\` to transfer it to ${activeWorkDir}?
- [ ] Did the download succeed? (Check tool response)
- [ ] Am I using relative path with "/" prefix? (e.g., ${options.storagePath || '/'}/file.png, not ${activeWorkDir}/file.png)
- [ ] Am I NOT using Code Interpreter internal paths?

If you answer "No" to any of these, DO NOT reference the file yet.

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
- **Download to ${activeWorkDir} or subdirectories** for automatic S3 sync
- Files are automatically uploaded to S3 after tool execution via Workspace Sync Hook
- **Avoid other paths** like /tmp/downloads or /Users/xxx - these will NOT sync to S3
- Example: \`destinationDir: "${activeWorkDir}"\` ✓ Syncs to S3
- Example: \`destinationDir: "/tmp/downloads"\` ✗ Does NOT sync to S3

### Package Installation
Common packages that need installation:
- seaborn, scikit-learn, tensorflow, pytorch, plotly
- Install via: \`executeCommand\` with "pip install package-name"
- Use matplotlib.pyplot for visualizations (pre-installed)

### Matplotlib Japanese Font Configuration (CRITICAL for Japanese Users)

The CodeInterpreter environment has a font limitation:
- **Droid Sans Fallback** font supports Japanese characters but **NOT ASCII** (A-Z, 0-9, punctuation)
- Using Japanese font globally causes garbled text for English/numbers

**Solution: Hybrid Approach**
- ✓ Use Japanese font for **titles and legends only**
- ✓ Use default font for **axis labels and pie chart labels**

**Font Setup:**
\`\`\`python
from matplotlib.font_manager import FontProperties
jp_font = FontProperties(fname='/usr/share/fonts/google-droid-sans-fonts/DroidSansFallbackFull.ttf')
\`\`\`

**GOOD Pattern:**
\`\`\`python
# Japanese title with explicit font
ax.set_title('Sales Trend Graph', fontproperties=jp_font, fontsize=16)

# English axis labels (no font issues)
ax.set_xlabel('Date', fontsize=14)
ax.set_ylabel('Sales Amount', fontsize=14)

# Japanese legend with explicit font
ax.legend(prop=jp_font, fontsize=12)
\`\`\`

**BAD Patterns (Avoid):**
\`\`\`python
# ❌ Japanese axis labels cause garbled text
ax.set_xlabel('Date (JP)', fontproperties=jp_font)

# ❌ Global rcParams breaks ASCII rendering
plt.rcParams['font.family'] = 'Droid Sans Fallback'
\`\`\`

**Element Usage Guide:**
| Element | Language | Use Japanese Font? |
|---------|----------|-------------------|
| Title | Japanese | ✓ Yes (fontproperties=jp_font) |
| Legend | Japanese | ✓ Yes (prop=jp_font) |
| Axis Labels | English | ✗ No (use default) |
| Pie Labels | English | ✗ No (use default) |

### Best Practices
1. Always specify sessionName for consistent context
2. Combine related code in single executeCode blocks
3. Use descriptive session names for tracking
4. Install required packages before executing code
5. Check tool description for detailed file system behavior
`;
  }

  // Add default context
  return basePrompt + generateDefaultContext(options.tools, options.mcpTools);
}

/**
 * Generate default system prompt
 */
function generateDefaultSystemPrompt(
  _tools: Array<{ name: string; description?: string }>,
  _mcpTools: MCPToolDefinition[]
): string {
  return `You are an AI assistant running on AgentCore Runtime.

Please respond to user questions politely and call appropriate tools as needed.
Explain technical content in an easy-to-understand manner.`;
}
