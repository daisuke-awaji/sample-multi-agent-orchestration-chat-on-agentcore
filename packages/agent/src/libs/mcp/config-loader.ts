/**
 * MCP configuration processing utility
 */

import { logger } from '../../config/index.js';
import type { MCPConfig, MCPServerConfig } from './types.js';

/**
 * Auto-infer and add transport field to MCP server configuration
 * - stdio if command exists
 * - http if url exists (default)
 */
function inferTransport(serverConfig: Record<string, unknown>): Record<string, unknown> {
  // Return as-is if transport already specified
  if (serverConfig.transport) {
    return serverConfig;
  }

  // stdio if command exists
  if (serverConfig.command) {
    logger.debug('Auto-inferring transport: stdio (command field exists)');
    return { ...serverConfig, transport: 'stdio' };
  }

  // http if url exists (default, SSE detection can be added in future)
  if (serverConfig.url) {
    logger.debug('Auto-inferring transport: http (url field exists)');
    return { ...serverConfig, transport: 'http' };
  }

  // Return as-is if neither exists (will error in Zod validation)
  return serverConfig;
}

/**
 * Extract only enabled MCP server configurations
 * Apply auto-inference if transport is not specified
 */
export function getEnabledMCPServers(config: MCPConfig): Array<{
  name: string;
  config: MCPServerConfig;
}> {
  return Object.entries(config.mcpServers)
    .filter(([, serverConfig]) => serverConfig.enabled !== false)
    .map(([name, serverConfig]) => ({
      name,
      config: inferTransport(
        serverConfig as unknown as Record<string, unknown>
      ) as unknown as MCPServerConfig,
    }));
}
