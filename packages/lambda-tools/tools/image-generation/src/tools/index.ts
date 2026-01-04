/**
 * Tool Registry
 */

import { Tool, ToolHandler } from './types.js';
import { novaCanvasTool } from './nova-canvas.js';
import { logger } from '../logger.js';

/**
 * Available tools registry
 */
export const toolRegistry = new Map<string, Tool>([['nova-canvas-generate', novaCanvasTool]]);

/**
 * Default tool (used when tool name is unknown)
 */
export const defaultTool = novaCanvasTool;

/**
 * Get tool handler by name
 */
export function getToolHandler(toolName: string | null): ToolHandler {
  if (!toolName) {
    logger.info('TOOL_REGISTRY', {
      action: 'get_default_tool',
      defaultTool: defaultTool.name,
      reason: 'no_tool_name_provided',
    });
    return defaultTool.handler;
  }

  const tool = toolRegistry.get(toolName);

  if (!tool) {
    logger.warn('TOOL_REGISTRY', {
      action: 'tool_not_found',
      requestedTool: toolName,
      availableTools: Array.from(toolRegistry.keys()),
      fallbackTool: defaultTool.name,
    });
    return defaultTool.handler;
  }

  logger.info('TOOL_REGISTRY', {
    action: 'tool_found',
    toolName: tool.name,
    toolVersion: tool.version,
  });

  return tool.handler;
}

/**
 * Get tool by name
 */
export function getTool(toolName: string): Tool | undefined {
  return toolRegistry.get(toolName);
}

/**
 * Get all available tools
 */
export function getAllTools(): Tool[] {
  return Array.from(toolRegistry.values());
}

/**
 * Get all tool names
 */
export function getToolNames(): string[] {
  return Array.from(toolRegistry.keys());
}

/**
 * Check if tool exists
 */
export function hasTool(toolName: string): boolean {
  return toolRegistry.has(toolName);
}

/**
 * Get registry statistics
 */
export function getRegistryStats() {
  const tools = Array.from(toolRegistry.values());

  return {
    totalTools: tools.length,
    toolNames: tools.map((t) => t.name),
    toolVersions: tools.map((t) => ({ name: t.name, version: t.version })),
    allTags: [...new Set(tools.flatMap((t) => t.tags || []))],
    defaultTool: defaultTool.name,
  };
}

/**
 * Initialize and validate registry
 */
function initializeRegistry(): void {
  logger.info('TOOL_REGISTRY', {
    action: 'registry_initialized',
    ...getRegistryStats(),
  });

  // Validate each tool
  for (const [name, tool] of toolRegistry) {
    if (tool.name !== name) {
      logger.warn('TOOL_REGISTRY', {
        action: 'name_mismatch',
        registryKey: name,
        toolName: tool.name,
      });
    }
  }
}

// Initialize registry
initializeRegistry();
