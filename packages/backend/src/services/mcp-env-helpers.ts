/**
 * Helper functions for extracting and restoring env values
 * from MCP configurations.
 *
 * These pure functions are used by AgentsService to separate sensitive
 * env values (stored in SSM) from the rest of the MCP config (stored in DynamoDB).
 */

import type { MCPConfig, MCPServer } from './agents-service.js';
import type { McpEnvMap } from './ssm-env-store.js';

/**
 * Extract env values from mcpConfig and remove them.
 *
 * @returns cleanedConfig with env fields removed, and envMap (null if no env values found)
 */
export function extractEnvFromMcpConfig(mcpConfig: MCPConfig): {
  cleanedConfig: MCPConfig;
  envMap: McpEnvMap | null;
} {
  const envMap: McpEnvMap = {};
  let hasEnv = false;

  const cleanedServers: Record<string, MCPServer> = {};

  for (const [serverName, server] of Object.entries(mcpConfig.mcpServers)) {
    if (server.env && Object.keys(server.env).length > 0) {
      envMap[serverName] = { ...server.env };
      hasEnv = true;

      const { env: _, ...rest } = server;
      cleanedServers[serverName] = rest;
    } else {
      cleanedServers[serverName] = { ...server };
    }
  }

  return {
    cleanedConfig: { mcpServers: cleanedServers },
    envMap: hasEnv ? envMap : null,
  };
}

/**
 * Restore env values from an envMap into an mcpConfig.
 */
export function restoreEnvToMcpConfig(mcpConfig: MCPConfig, envMap: McpEnvMap): MCPConfig {
  const restoredServers: Record<string, MCPServer> = {};

  for (const [serverName, server] of Object.entries(mcpConfig.mcpServers)) {
    if (envMap[serverName]) {
      restoredServers[serverName] = {
        ...server,
        env: { ...envMap[serverName] },
      };
    } else {
      restoredServers[serverName] = { ...server };
    }
  }

  return { mcpServers: restoredServers };
}
