/**
 * MCP server configuration type definitions
 * Supports three transport types: stdio / http / sse
 */

/**
 * Common options
 */
interface MCPServerBase {
  /** Whether to enable the server (default: true) */
  enabled?: boolean;
  /** Add prefix to tool names (for collision avoidance) */
  prefix?: string;
}

/**
 * stdio transport configuration
 * Communicates by launching a local process
 */
export interface StdioMCPServer extends MCPServerBase {
  transport: 'stdio';
  /** Execution command (e.g., "uvx", "npx", "python") */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables (can reference other env vars using ${VAR} syntax) */
  env?: Record<string, string>;
}

/**
 * Streamable HTTP transport configuration
 * Communicates with MCP server over HTTP
 */
export interface HttpMCPServer extends MCPServerBase {
  transport: 'http';
  /** MCP server URL */
  url: string;
  /** Request headers (can reference env vars using ${VAR} syntax) */
  headers?: Record<string, string>;
}

/**
 * SSE (Server-Sent Events) transport configuration
 * Communicates with MCP server over SSE
 */
export interface SseMCPServer extends MCPServerBase {
  transport: 'sse';
  /** MCP server URL */
  url: string;
  /** Request headers (can reference env vars using ${VAR} syntax) */
  headers?: Record<string, string>;
}

/**
 * Union type for MCP server configuration
 */
export type MCPServerConfig = StdioMCPServer | HttpMCPServer | SseMCPServer;

/**
 * Top-level configuration for mcp.json
 */
export interface MCPConfig {
  /** MCP server definitions (key: server name) */
  mcpServers: Record<string, MCPServerConfig>;
}

/**
 * MCP client creation error
 */
export class MCPConfigError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'MCPConfigError';
  }
}
