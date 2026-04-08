/**
 * User-defined MCP client builder
 *
 * Builds MCP clients from user-provided mcp.json configuration.
 */

import type { McpClient } from '@strands-agents/sdk';
import { logger } from '../../config/index.js';
import { getEnabledMCPServers, createMCPClients } from '../../lib/mcp/index.js';
import type { MCPConfig } from '../../types/mcp.js';

/**
 * Build MCP clients from user-defined configuration.
 * Returns an empty array if no config is provided or if an error occurs.
 */
export function buildUserMCPClients(mcpConfig?: Record<string, unknown>): McpClient[] {
  if (!mcpConfig) {
    return [];
  }

  try {
    logger.info('🔧 Processing user-defined MCP configuration...');
    const servers = getEnabledMCPServers(mcpConfig as unknown as MCPConfig);
    const clients = createMCPClients(servers);
    logger.info(`✅ User-defined MCP clients: ${clients.length} items`);
    return clients;
  } catch (error) {
    logger.error('❌ Failed to generate user-defined MCP clients:', error);
    // Skip and continue even if error occurs
    return [];
  }
}
