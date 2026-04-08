/**
 * AgentCore Gateway MCP Client Service
 * Handles communication with AgentCore Gateway MCP endpoint
 */

import { config } from '../config/index.js';

/**
 * MCP tool type definition
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
 * MCP response type definition
 */
interface MCPResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Tools/List response type definition
 */
interface ToolsListResult {
  tools: MCPTool[];
  nextCursor?: string;
}

/**
 * Tools/Call (search) response type definition
 */
interface ToolsCallResult {
  content: Array<{
    type: string;
    text?: string;
    data?: unknown;
  }>;
  isError?: boolean;
}

/**
 * MCP Protocol Version for Gateway requests
 */
const MCP_PROTOCOL_VERSION = '2025-06-18';

/**
 * AgentCore Gateway MCP client
 */
export class AgentCoreGatewayService {
  private readonly gatewayEndpoint: string;

  constructor() {
    if (!config.gateway.endpoint) {
      throw new Error(
        'AgentCore Gateway endpoint is not configured. Please set AGENTCORE_GATEWAY_ENDPOINT environment variable.'
      );
    }
    this.gatewayEndpoint = config.gateway.endpoint;
  }

  /**
   * Common method to send MCP requests
   */
  private async sendMCPRequest<T = unknown>(
    method: string,
    params?: unknown,
    authToken?: string
  ): Promise<T> {
    const requestId = `${method}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const requestBody: {
      jsonrpc: '2.0';
      id: string;
      method: string;
      params?: unknown;
    } = {
      jsonrpc: '2.0' as const,
      id: requestId,
      method,
    };

    if (params && typeof params === 'object' && params !== null) {
      requestBody.params = params;
    }

    console.log(`🔗 Sending Gateway MCP request:`, {
      endpoint: this.gatewayEndpoint,
      method,
      requestId,
      hasParams: !!params,
      hasAuth: !!authToken,
    });

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Mcp-Protocol-Version': MCP_PROTOCOL_VERSION,
      };

      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }

      const response = await fetch(this.gatewayEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(
          `Gateway API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data: MCPResponse<T> = await response.json();

      if (data.error) {
        throw new Error(`Gateway MCP error: ${data.error.message} (${data.error.code})`);
      }

      if (!data.result) {
        throw new Error('Response from Gateway does not contain result');
      }

      console.log(`✅ Gateway MCP request successful:`, {
        requestId,
        method,
        resultType: typeof data.result,
      });

      return data.result;
    } catch (error) {
      console.error('💥 Gateway MCP request error (%s):', method, error);
      throw error;
    }
  }

  /**
   * Get list of available tools (with pagination support)
   * @param authToken JWT authentication token (optional)
   * @param cursor Cursor for pagination (optional)
   * @returns Tool list and nextCursor
   */
  async listTools(
    authToken?: string,
    cursor?: string
  ): Promise<{
    tools: MCPTool[];
    nextCursor?: string;
  }> {
    try {
      console.log('📋 Retrieving tool list from Gateway...', cursor ? { cursor } : {});

      const params = cursor ? { cursor } : {};
      const result = await this.sendMCPRequest<ToolsListResult>('tools/list', params, authToken);

      const tools = result.tools || [];
      const nextCursor = result.nextCursor;

      console.log(
        '✅ Tool list retrieval completed: %d items',
        tools.length,
        nextCursor ? { nextCursor: 'present' } : { nextCursor: 'none' }
      );

      return {
        tools,
        nextCursor,
      };
    } catch (error) {
      console.error('💥 Tool list retrieval error:', error);
      throw new Error(
        `Failed to retrieve tool list: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error }
      );
    }
  }

  /**
   * Search tools with semantic search
   * @param query Search query
   * @param authToken JWT authentication token
   * @returns List of search result tools
   */
  async searchTools(query: string, authToken: string): Promise<MCPTool[]> {
    if (!query || query.trim().length === 0) {
      throw new Error('Search query is required');
    }

    try {
      console.log(`🔍 Searching tools on Gateway: "${query}"`);

      const result = await this.sendMCPRequest<ToolsCallResult>(
        'tools/call',
        {
          name: 'x_amz_bedrock_agentcore_search',
          arguments: {
            query: query.trim(),
          },
        },
        authToken
      );

      // Parse response content
      if (result.isError) {
        throw new Error('Error occurred during search');
      }

      // Extract search results from content
      const tools: MCPTool[] = [];
      if (result.content && Array.isArray(result.content)) {
        for (const item of result.content) {
          if (item.type === 'text' && item.text) {
            try {
              // Parse JSON format tool information
              const toolData = JSON.parse(item.text);
              if (toolData.tools && Array.isArray(toolData.tools)) {
                tools.push(...toolData.tools);
              }
            } catch (parseError) {
              // Use as-is if text format
              console.warn('Failed to parse search results, processing as text:', parseError);
            }
          } else if (item.data && typeof item.data === 'object' && item.data !== null) {
            // If tool information is directly in data field
            const data = item.data as Record<string, unknown>;
            if (data.tools && Array.isArray(data.tools)) {
              tools.push(...(data.tools as MCPTool[]));
            } else if (data.name && typeof data.name === 'string') {
              // For single tool
              tools.push(data as unknown as MCPTool);
            }
          }
        }
      }

      console.log('✅ Tool search completed: %d items (query: "%s")', tools.length, query);
      return tools;
    } catch (error) {
      console.error('💥 Tool search error (query: "%s"):', query, error);
      throw new Error(
        `Tool search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error }
      );
    }
  }

  /**
   * Check Gateway connection status
   * @param authToken JWT authentication token
   * @returns true if connection successful
   */
  async checkConnection(authToken: string): Promise<boolean> {
    try {
      console.log('🔗 Checking Gateway connection...');

      // Check connection with tools/list
      await this.listTools(authToken);

      console.log('✅ Gateway connection check successful');
      return true;
    } catch (error) {
      console.error('💥 Gateway connection check failed:', error);
      return false;
    }
  }
}

/**
 * Singleton instance
 */
export const gatewayService = new AgentCoreGatewayService();
