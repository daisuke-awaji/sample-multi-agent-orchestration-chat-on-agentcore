# Tools Reference

> **Auto-generated** by `scripts/generate-tool-docs.ts`. Do not edit manually.

This document provides an overview of all available tools in Donuts. Tools extend agent capabilities and can be enabled per agent via the `enabledTools` configuration.

## Built-in Tools

Built-in tools are defined in `packages/libs/tool-definitions/src/definitions/` and run within the agent runtime.

### 🔧 Development & System

| Tool | Description |
|------|-------------|
| [`execute_command`](#execute_command) | Execute shell commands and return results |
| [`file_editor`](#file_editor) | Edit or create new files |
| [`code_interpreter`](#code_interpreter) | Code Interpreter tool for executing code in isolated sandbox environments |

### 🔍 Search & Web

| Tool | Description |
|------|-------------|
| [`tavily_search`](#tavily_search) | Execute high-quality web search using Tavily API |
| [`tavily_extract`](#tavily_extract) | Extract content from specified URLs using Tavily API |
| [`tavily_crawl`](#tavily_crawl) | Comprehensively crawl websites using Tavily API |
| [`browser`](#browser) | AgentCore Browser tool for interacting with web applications through a managed Chrome browser |

### 🎨 Media Generation

| Tool | Description |
|------|-------------|
| [`nova_canvas`](#nova_canvas) | Generate images using Amazon Nova Canvas on Bedrock |
| [`nova_reel`](#nova_reel) | Generate videos using Amazon Nova Reel |
| [`image_to_text`](#image_to_text) | Analyze images and convert them to text descriptions using Bedrock Converse API |

### 🤖 Agent Management

| Tool | Description |
|------|-------------|
| [`call_agent`](#call_agent) | Invoke specialized sub-agents asynchronously to handle specific tasks that require different expertise |
| [`manage_agent`](#manage_agent) | Create, update, or retrieve AI agent configurations |

### 📁 Storage & Organization

| Tool | Description |
|------|-------------|
| [`s3_list_files`](#s3_list_files) | Retrieve list of files and directories in user's S3 storage |
| [`todo`](#todo) | Manage a todo list for tracking task progress during sessions |

### 🧠 Reasoning

| Tool | Description |
|------|-------------|
| [`think`](#think) | Use this tool to think through a problem step-by-step before taking action |

---

## Tool Details

### execute_command

Execute shell commands and return results.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `command` | string | ✅ | Shell command to execute |
| `workingDirectory` | string |  | Working directory (current directory if not specified) |
| `timeout` | number |  | Timeout in milliseconds (default: 120s, max: 600s) |

---

### file_editor

Edit or create new files.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filePath` | string | ✅ | Absolute path of the file to edit (relative paths not allowed) |
| `oldString` | string | ✅ | Text to replace. Must be unique within the file and must match exactly including whitespace and indentation. Specify ... |
| `newString` | string | ✅ | Replacement text. For new file creation, this content will be written to the file. |

---

### tavily_search

Execute high-quality web search using Tavily API.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | ✅ | Search query (required) |
| `searchDepth` | string |  | Search depth. basic uses 1 credit, advanced uses 2 credits |
| `topic` | string |  | Search category. news for latest information, general for general search |
| `maxResults` | number |  | Maximum number of search results to retrieve (1-20) |
| `includeAnswer` | boolean |  | Include LLM-generated summary answer |
| `timeRange` | string |  | Time range filter (filter by past period) |
| `includeDomains` | string[] |  | List of domains to include in search |
| `excludeDomains` | string[] |  | List of domains to exclude from search |
| `includeImages` | boolean |  | Retrieve related images |
| `country` | string |  | Prioritize results from specific country (e.g., japan, united states) |

---

### tavily_extract

Extract content from specified URLs using Tavily API.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `urls` | unknown | ✅ | URL(s) to extract from (single URL or array of URLs) |
| `query` | string |  | Query for reranking. When specified, prioritizes more relevant content |
| `extractDepth` | string |  | Extraction depth. basic: 1 credit/5 URLs, advanced: 2 credits/5 URLs |
| `format` | string |  | Output format. markdown or text |
| `chunksPerSource` | number |  | Number of chunks per source (1-5, only effective when query is specified) |
| `includeImages` | boolean |  | Whether to include image information |
| `timeout` | number |  | Timeout in seconds (1-60) |

---

### tavily_crawl

Comprehensively crawl websites using Tavily API.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | ✅ | Starting URL for crawl |
| `instructions` | string |  | Crawl instructions (natural language). Specifying doubles the usage cost |
| `maxDepth` | number |  | Maximum exploration depth (1-5, how far from base URL) |
| `maxBreadth` | number |  | Maximum number of links per page (1 or more) |
| `limit` | number |  | Maximum number of links to process (1 or more) |
| `selectPaths` | string[] |  | Regex patterns for paths to include (e.g., ["/docs/.*", "/api/v1.*"]) |
| `selectDomains` | string[] |  | Regex patterns for domains to include (e.g., ["^docs\.example\.com$"]) |
| `excludePaths` | string[] |  | Regex patterns for paths to exclude (e.g., ["/private/.*", "/admin/.*"]) |
| `excludeDomains` | string[] |  | Regex patterns for domains to exclude (e.g., ["^private\.example\.com$"]) |
| `allowExternal` | boolean |  | Whether to include external domain links in results |
| `extractDepth` | string |  | Extraction depth. basic: 1 credit/5 extractions, advanced: 2 credits/5 extractions |
| `format` | string |  | Output format. markdown or text |
| `includeImages` | boolean |  | Whether to include image information |
| `chunksPerSource` | number |  | Number of chunks per source (1-5, only effective when instructions is specified) |
| `timeout` | number |  | Timeout in seconds (10-150) |

---

### s3_list_files

Retrieve list of files and directories in user's S3 storage.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string |  | Directory path to list (default: root "/") |
| `recursive` | boolean |  | Whether to recursively include subdirectories (default: false) |
| `maxResults` | number |  | Maximum number of results to retrieve (1-1000, default: 100) |
| `includePresignedUrls` | boolean |  | Whether to generate presigned URLs for files (default: false). URLs allow direct browser access and expire after spec... |
| `presignedUrlExpiry` | number |  | Presigned URL expiration time in seconds (60-86400, default: 3600 = 1 hour). Only used when includePresignedUrls is t... |

---

### code_interpreter

Code Interpreter tool for executing code in isolated sandbox environments.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | The operation type to perform. Must be one of: initSession (create new session), executeCode (run code), executeComma... |
| `sessionName` | string | ✅ | Session name for the code execution environment. REQUIRED for all operations except listLocalSessions. Use initSessio... |
| `description` | string |  | Session description (REQUIRED for initSession action). Describes the purpose of this code execution session. |
| `language` | string |  | Programming language (REQUIRED for executeCode action). Supported languages: python (with data science packages), jav... |
| `code` | string |  | Source code to execute (REQUIRED for executeCode action). Can be multi-line code with full program logic. |
| `clearContext` | string |  | Clear session context before execution (optional for executeCode). Set to true to start with fresh environment, false... |
| `command` | string |  | Shell command to execute (REQUIRED for executeCommand action). Can include pipes, redirects, and command chaining. |
| `paths` | string[] |  | Array of file paths (REQUIRED for readFiles and removeFiles actions). Paths are relative to session working directory. |
| `path` | string |  | Directory path to list (REQUIRED for listFiles action). Use "/" for root of sandbox, or relative paths. |
| `content` | string[] |  | Array of file objects with path and text properties (REQUIRED for writeFiles action). Each object must have {path: st... |
| `sourcePaths` | string[] |  | Array of source file paths in sandbox (REQUIRED for downloadFiles action). Files to download from the code execution ... |
| `destinationDir` | string |  | Absolute local filesystem path for downloads (REQUIRED for downloadFiles action). Use /tmp/ws or subdirectories like ... |

---

### nova_canvas

Generate images using Amazon Nova Canvas on Bedrock.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | ✅ | Text prompt describing the image to generate (required, max 1024 characters) |
| `width` | unknown |  | Image width in pixels (512, 768, or 1024, default: 512) |
| `height` | unknown |  | Image height in pixels (512, 768, or 1024, default: 512) |
| `numberOfImages` | number |  | Number of images to generate (1-5, default: 1) |
| `seed` | number |  | Random seed for reproducible generation (0-858993459, optional) |
| `saveToS3` | boolean |  | Whether to save generated images to S3 storage (default: true) |
| `outputPath` | string |  | Custom output filename (default: auto-generated with timestamp) |

---

### image_to_text

Analyze images and convert them to text descriptions using Bedrock Converse API.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `imagePath` | string | ✅ | Image path in one of the following formats: |
| `prompt` | string |  | Analysis prompt for the image (default: describe the image) |
| `modelId` | string |  | Vision model to use (global inference profile). Options: Claude Sonnet 4.5, Claude Haiku 4.5, Nova 2 Lite |

---

### call_agent

Invoke specialized sub-agents asynchronously to handle specific tasks that require different expertise.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | Action: 'list_agents' to list, 'start_task' to start, 'status' to check |
| `agentId` | string |  | Agent ID (required for start_task, e.g., "web-researcher") |
| `query` | string |  | Query to send to the agent (required for start_task) |
| `modelId` | string |  | Model ID to use (optional, defaults to agent config) |
| `storagePath` | string |  | S3 storage path for sub-agent (e.g., "/project-a/"). Inherits from parent if not specified. |
| `sessionId` | string |  | Session ID for sub-agent conversation history. If not specified, auto-generated as "<33-char-alphanumeric>_subagent" ... |
| `taskId` | string |  | Task ID (required for status action) |
| `waitForCompletion` | boolean |  | Wait for completion with polling (default: false) |
| `pollingInterval` | number |  | Polling interval in seconds (default: 30) |
| `maxWaitTime` | number |  | Max wait time in seconds (default: 1200) |

---

### nova_reel

Generate videos using Amazon Nova Reel.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | Action to execute: start (start video generation), status (check status), list (get list) |
| `prompt` | string |  | Text prompt for video generation (required when action is start) |
| `negativePrompt` | string |  | Elements to exclude from generation (optional) |
| `imageBase64` | string |  | Base64-encoded image for Image-to-Video (optional) |
| `duration` | number |  | Video duration in seconds: 6 (default) or 120 |
| `dimension` | string |  | Video resolution: 1280x720 (landscape), 720x1280 (portrait), 1280x1280 (square) |
| `fps` | number |  | Frame rate (default: 24) |
| `seed` | number |  | Random seed (0-2147483646) |
| `outputPath` | string |  | Output filename (auto-generated if omitted) |
| `waitForCompletion` | boolean |  | Wait for completion (default: false) |
| `pollingInterval` | number |  | Polling interval in seconds (default: 30) |
| `maxWaitTime` | number |  | Maximum wait time in seconds (default: 1200) |
| `invocationArn` | string |  | Job ARN (required when action is status) |
| `statusFilter` | string |  | Filter by status |
| `maxResults` | number |  | Maximum number of results (default: 10, max: 100) |
| `sortOrder` | string |  | Sort order (default: Descending) |

---

### manage_agent

Create, update, or retrieve AI agent configurations.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | Action: 'create' to create new agent, 'update' to modify existing, 'get' to retrieve details |
| `agentId` | string |  | Agent ID (required for update/get actions) |
| `name` | string |  | Agent name (e.g., "Code Reviewer", "Data Analyst") |
| `description` | string |  | Brief description of what this agent does |
| `systemPrompt` | string |  | System prompt that defines the agent behavior and capabilities |
| `enabledTools` | string[] |  | Array of tool names to enable (e.g., ["execute_command", "file_editor", "tavily_search"]) |
| `icon` | string |  | Lucide icon name (e.g., "Bot", "Code", "Brain", "Search") |
| `scenarios` | string[] |  | Predefined scenarios/prompts for quick access |

---

### browser

AgentCore Browser tool for interacting with web applications through a managed Chrome browser.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | The browser operation to perform. Must be one of: startSession (initialize browser), navigate (go to URL), click (cli... |
| `sessionName` | string |  | Session name for the browser environment. If not specified, a default session is used. Use startSession first to crea... |
| `viewportWidth` | string |  | Browser viewport width in pixels (for startSession, default: 1280) |
| `viewportHeight` | string |  | Browser viewport height in pixels (for startSession, default: 720) |
| `url` | string |  | URL to navigate to (REQUIRED for navigate action) |
| `selector` | string |  | CSS selector or text description of the element to interact with (REQUIRED for click, type, waitForElement actions) |
| `text` | string |  | Text to type into the selected element (REQUIRED for type action) |
| `direction` | string |  | Scroll direction (for scroll action, default: down) |
| `amount` | number |  | Scroll amount in pixels (for scroll action, default: 500) |
| `timeoutMs` | string |  | Timeout in milliseconds for waitForElement (default: 10000) |

---

### todo

Manage a todo list for tracking task progress during sessions.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | Action: 'init' to create/overwrite todo list, 'update' to modify existing task statuses |
| `items` | string[] |  | Array of task descriptions to initialize the list with (required for init action). All tasks are initially marked as ... |
| `updates` | string[] |  | Array of task updates to process in batch (required for update action). |

---

### think

Use this tool to think through a problem step-by-step before taking action.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `thought` | string | ✅ | Your internal reasoning, analysis, or planning. Use this to think through complex problems step-by-step, evaluate too... |

---

## Lambda Tools (External)

Lambda tools run as separate AWS Lambda functions and are connected via AgentCore Gateway. They are defined in `packages/lambda-tools/tools/`.

### Athena Tools (`athena-tools`)

| Tool | Description |
|------|-------------|
| `athena-query` | A tool that executes SQL queries on data stored in S3 using Amazon Athena and retrieves the results |
| `athena-list-tables` | A tool that retrieves a list of tables and their schema information from a specified database in the Glue Data Catalog |
| `athena-describe-table` | A tool that retrieves detailed schema information for a specified table, including column definitions, partition information, data format, SerDe information, and table parameters |

### Utility Tools (`utility-tools`)

| Tool | Description |
|------|-------------|
| `echo` | A tool that returns the input message as-is |
| `ping` | A tool that performs a connectivity check for the Lambda function and retrieves system information |
| `kb-retrieve` | A tool that retrieves relevant chunks from an Amazon Bedrock Knowledge Base using semantic search |

---

## Adding a New Built-in Tool

1. Create a new definition file in `packages/libs/tool-definitions/src/definitions/`
2. Define the Zod schema and `ToolDefinition` export
3. Add the export and import to `packages/libs/tool-definitions/src/definitions/index.ts`
4. Implement the tool handler in `packages/agent/src/tools/`
5. Register the tool in `packages/agent/src/tools/index.ts`
6. Build the definitions: `npm run -w packages/libs/tool-definitions build`
7. Run `npx ts-node scripts/generate-tool-docs.ts` to regenerate this document

## Adding a New Lambda Tool

1. Create a new directory under `packages/lambda-tools/tools/`
2. Define `tool-schema.json` with tool names, descriptions, and input schemas
3. Implement the Lambda handler
4. Deploy via CDK and register in AgentCore Gateway
