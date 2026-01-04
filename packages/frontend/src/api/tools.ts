/**
 * Tools Management API Client
 * Client for calling Backend tools API
 */

import { backendGet, backendPost } from './client/backend-client';

/**
 * MCP Tool type definition
 */
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Local tool definitions (Built-in agent tools)
 * Tools implemented directly in the agent, not in AgentCore Gateway
 */
export const LOCAL_TOOLS: MCPTool[] = [
  {
    name: 'execute_command',
    description:
      'Execute shell commands and return results. Can be used for file operations, information gathering, and development task automation.',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Shell command to execute',
        },
        workingDirectory: {
          type: 'string',
          description: 'Working directory (defaults to current directory if not specified)',
        },
        timeout: {
          type: 'number',
          minimum: 1000,
          maximum: 60000,
          default: 30000,
          description: 'Timeout in milliseconds (default: 30s, max: 60s)',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'tavily_search',
    description:
      'Execute high-quality web search using Tavily API. Get comprehensive search results for latest information, news, and general topics.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (required)',
        },
        searchDepth: {
          type: 'string',
          enum: ['basic', 'advanced'],
          default: 'basic',
          description: 'Search depth. basic uses 1 credit, advanced uses 2 credits',
        },
        topic: {
          type: 'string',
          enum: ['general', 'news', 'finance'],
          default: 'general',
          description: 'Search category. news for latest information, general for general search',
        },
        maxResults: {
          type: 'number',
          minimum: 1,
          maximum: 20,
          default: 5,
          description: 'Maximum number of search results to retrieve (1-20)',
        },
        includeAnswer: {
          type: 'boolean',
          default: true,
          description: 'Include LLM-generated summary answer',
        },
        timeRange: {
          type: 'string',
          enum: ['day', 'week', 'month', 'year', 'd', 'w', 'm', 'y'],
          description: 'Time range filter (filter by past period)',
        },
        includeDomains: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'List of domains to include in search',
        },
        excludeDomains: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'List of domains to exclude from search',
        },
        includeImages: {
          type: 'boolean',
          default: false,
          description: 'Retrieve related images as well',
        },
        country: {
          type: 'string',
          description: 'Prioritize results from specific country (e.g., japan, united states)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'tavily_extract',
    description:
      'Extract content from specified URLs using Tavily API. Get webpage content as structured text.',
    inputSchema: {
      type: 'object',
      properties: {
        urls: {
          oneOf: [
            { type: 'string' },
            {
              type: 'array',
              items: { type: 'string' },
            },
          ],
          description: 'URL(s) to extract from (single URL or array of URLs)',
        },
        query: {
          type: 'string',
          description: 'Query for reranking. When specified, prioritizes more relevant content',
        },
        extractDepth: {
          type: 'string',
          enum: ['basic', 'advanced'],
          default: 'basic',
          description: 'Extraction depth. basic: 1 credit/5 URLs, advanced: 2 credits/5 URLs',
        },
        format: {
          type: 'string',
          enum: ['markdown', 'text'],
          default: 'markdown',
          description: 'Output format. markdown or text',
        },
        chunksPerSource: {
          type: 'number',
          minimum: 1,
          maximum: 5,
          default: 3,
          description: 'Number of chunks per source (1-5, only effective when query is specified)',
        },
        includeImages: {
          type: 'boolean',
          default: false,
          description: 'Whether to include image information',
        },
        timeout: {
          type: 'number',
          minimum: 1,
          maximum: 60,
          default: 30,
          description: 'Timeout in seconds (1-60)',
        },
      },
      required: ['urls'],
    },
  },
  {
    name: 'tavily_crawl',
    description:
      'Comprehensively crawl websites using Tavily API. Starting from specified root URL, automatically discovers and extracts related pages.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Starting URL for crawl',
        },
        instructions: {
          type: 'string',
          description: 'Crawl instructions (natural language). Specifying doubles the usage cost',
        },
        maxDepth: {
          type: 'number',
          minimum: 1,
          maximum: 5,
          default: 1,
          description: 'Maximum exploration depth (1-5, how far from base URL)',
        },
        maxBreadth: {
          type: 'number',
          minimum: 1,
          default: 20,
          description: 'Maximum number of links per page (1 or more)',
        },
        limit: {
          type: 'number',
          minimum: 1,
          default: 50,
          description: 'Maximum number of links to process (1 or more)',
        },
        selectPaths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Regex patterns for paths to include (e.g., ["/docs/.*", "/api/v1.*"])',
        },
        selectDomains: {
          type: 'array',
          items: { type: 'string' },
          description: 'Regex patterns for domains to include (e.g., ["^docs\\.example\\.com$"])',
        },
        excludePaths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Regex patterns for paths to exclude (e.g., ["/private/.*", "/admin/.*"])',
        },
        excludeDomains: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Regex patterns for domains to exclude (e.g., ["^private\\.example\\.com$"])',
        },
        allowExternal: {
          type: 'boolean',
          default: true,
          description: 'Whether to include external domain links in results',
        },
        extractDepth: {
          type: 'string',
          enum: ['basic', 'advanced'],
          default: 'basic',
          description:
            'Extraction depth. basic: 1 credit/5 extractions, advanced: 2 credits/5 extractions',
        },
        format: {
          type: 'string',
          enum: ['markdown', 'text'],
          default: 'markdown',
          description: 'Output format. markdown or text',
        },
        includeImages: {
          type: 'boolean',
          default: false,
          description: 'Whether to include image information',
        },
        chunksPerSource: {
          type: 'number',
          minimum: 1,
          maximum: 5,
          default: 3,
          description:
            'Number of chunks per source (1-5, only effective when instructions is specified)',
        },
        timeout: {
          type: 'number',
          minimum: 10,
          maximum: 150,
          default: 150,
          description: 'Timeout in seconds (10-150)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'code_interpreter',
    description:
      'Amazon Bedrock AgentCore CodeInterpreter tool - Execute code and perform file operations in a secure sandbox environment. Provides capabilities for Python, JavaScript, TypeScript code execution, shell command execution, file operations (read, write, delete), and session management.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'initSession',
            'executeCode',
            'executeCommand',
            'readFiles',
            'listFiles',
            'removeFiles',
            'writeFiles',
            'downloadFiles',
            'listLocalSessions',
          ],
          description: 'Operation to execute',
        },
        sessionName: {
          type: 'string',
          description: 'Session name (defaults to default if omitted)',
        },
        description: {
          type: 'string',
          description: 'Session description (for initSession)',
        },
        language: {
          type: 'string',
          enum: ['python', 'javascript', 'typescript'],
          description: 'Language for code execution',
        },
        code: {
          type: 'string',
          description: 'Code to execute',
        },
        clearContext: {
          type: 'boolean',
          default: false,
          description: 'Whether to clear context',
        },
        command: {
          type: 'string',
          description: 'Shell command to execute',
        },
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of file paths',
        },
        path: {
          type: 'string',
          description: 'Directory path',
        },
        content: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              text: { type: 'string' },
            },
            required: ['path', 'text'],
          },
          description: 'Array of files to write',
        },
        sourcePaths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of file paths to download',
        },
        destinationDir: {
          type: 'string',
          description: 'Download destination directory (absolute path)',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 's3_list_files',
    description:
      "Retrieve list of files and directories in user's S3 storage. Can explore contents under specified path.",
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          default: '/',
          description: 'Directory path to list (default: root "/")',
        },
        recursive: {
          type: 'boolean',
          default: false,
          description: 'Whether to recursively include subdirectories (default: false)',
        },
        maxResults: {
          type: 'number',
          minimum: 1,
          maximum: 1000,
          default: 100,
          description: 'Maximum number of results to retrieve (1-1000, default: 100)',
        },
      },
      required: [],
    },
  },
  {
    name: 's3_get_presigned_urls',
    description:
      "Generate presigned URLs in batch for files in user's S3 storage. Get URLs for download or upload. Can process multiple files at once.",
    inputSchema: {
      type: 'object',
      properties: {
        paths: {
          oneOf: [
            { type: 'string' },
            {
              type: 'array',
              items: { type: 'string' },
            },
          ],
          description: 'File path(s) (single string or array of strings)',
        },
        operation: {
          type: 'string',
          enum: ['download', 'upload'],
          default: 'download',
          description: 'Operation type: "download" (for download) or "upload" (for upload)',
        },
        expiresIn: {
          type: 'number',
          minimum: 60,
          maximum: 604800,
          default: 3600,
          description:
            'Expiration time for presigned URL (seconds). Default: 3600 (1 hour), Max: 604800 (7 days)',
        },
        contentType: {
          type: 'string',
          description: 'Content-Type for upload operation (optional)',
        },
      },
      required: ['paths'],
    },
  },
  {
    name: 'file_editor',
    description:
      'Edit or create new files. For moving or renaming files, use the mv command with the execute_command tool. Before use, confirm file contents with the cat command, and for new files, check the directory with the ls command. Replaces text specified in oldString with newString. oldString must be unique within the file and must match exactly including whitespace and indentation. Can only change one location at a time; for multiple changes, call multiple times.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Absolute path of the file to edit (relative paths not allowed)',
        },
        oldString: {
          type: 'string',
          description:
            'Text to replace. Must be unique within the file and must match exactly including whitespace and indentation. Specify empty string to create a new file.',
        },
        newString: {
          type: 'string',
          description:
            'Replacement text. For new file creation, this content will be written to the file.',
        },
      },
      required: ['filePath', 'oldString', 'newString'],
    },
  },
];

/**
 * API response type definitions
 */
interface ToolsResponse {
  tools: MCPTool[];
  nextCursor?: string;
  metadata: {
    requestId: string;
    timestamp: string;
    actorId: string;
    count: number;
    query?: string;
  };
}

interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  gateway: {
    connected: boolean;
    endpoint: string;
  };
  metadata: {
    requestId: string;
    timestamp: string;
    actorId: string;
  };
}

/**
 * Fetch list of tools (with pagination support)
 * @param cursor Cursor for pagination (optional)
 * @returns List of tools and nextCursor
 */
export async function fetchTools(cursor?: string): Promise<{
  tools: MCPTool[];
  nextCursor?: string;
}> {
  const url = cursor ? `/tools?cursor=${encodeURIComponent(cursor)}` : '/tools';
  const data = await backendGet<ToolsResponse>(url);

  return {
    tools: data.tools,
    nextCursor: data.nextCursor,
  };
}

/**
 * MCP server error information
 */
export interface MCPServerError {
  serverName: string;
  message: string;
  details?: string; // Additional error details (e.g., stack trace, stderr output)
}

/**
 * Result of fetching local MCP tools
 */
export interface MCPToolsFetchResult {
  tools: (MCPTool & { serverName: string })[];
  errors: MCPServerError[];
}

/**
 * Fetch local MCP tools
 * Retrieve tool list from user-defined MCP server configuration
 * @param mcpConfig MCP server configuration in mcp.json format
 * @returns Tool list and error information
 */
export async function fetchLocalMCPTools(
  mcpConfig: Record<string, unknown>
): Promise<MCPToolsFetchResult> {
  const data = await backendPost<{
    tools: (MCPTool & { serverName: string })[];
    errors: MCPServerError[];
  }>('/tools/local', {
    mcpConfig,
  });

  return {
    tools: data.tools,
    errors: data.errors || [],
  };
}

/**
 * Search tools
 * @param query Search query
 * @returns List of tools matching search results
 */
export async function searchTools(query: string): Promise<MCPTool[]> {
  if (!query || query.trim().length === 0) {
    throw new Error('Search query is required');
  }

  const data = await backendPost<ToolsResponse>('/tools/search', {
    query: query.trim(),
  });

  return data.tools;
}

/**
 * Check Gateway connection status
 * @returns Connection status information
 */
export async function checkGatewayHealth(): Promise<HealthResponse> {
  return backendGet<HealthResponse>('/tools/health');
}
