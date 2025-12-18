/**
 * ツールレジストリ
 *
 * 利用可能なツールを管理し、ツール名による検索機能を提供
 */

import { Tool, ToolHandler } from './types.js';
import { echoTool } from './echo.js';
import { pingTool } from './ping.js';
import { logger } from '../logger.js';

/**
 * 利用可能なツールのレジストリ
 */
export const toolRegistry = new Map<string, Tool>([
  ['echo', echoTool],
  ['ping', pingTool],
]);

/**
 * デフォルトツール（ツール名が不明な場合に使用）
 */
export const defaultTool = pingTool;

/**
 * ツール名からツールハンドラーを取得する
 *
 * @param toolName ツール名（nullの場合はデフォルトツール）
 * @returns ツールハンドラー関数
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
 * ツール名からツール定義を取得する
 *
 * @param toolName ツール名
 * @returns ツール定義、または undefined
 */
export function getTool(toolName: string): Tool | undefined {
  return toolRegistry.get(toolName);
}

/**
 * 利用可能なすべてのツールを取得する
 *
 * @returns ツール定義の配列
 */
export function getAllTools(): Tool[] {
  return Array.from(toolRegistry.values());
}

/**
 * ツール名の一覧を取得する
 *
 * @returns ツール名の配列
 */
export function getToolNames(): string[] {
  return Array.from(toolRegistry.keys());
}

/**
 * ツールがレジストリに登録されているかチェックする
 *
 * @param toolName ツール名
 * @returns 登録されている場合 true
 */
export function hasTool(toolName: string): boolean {
  return toolRegistry.has(toolName);
}

/**
 * ツールをレジストリに動的に追加する
 *
 * @param tool ツール定義
 * @throws Error ツール名が既に存在する場合
 */
export function registerTool(tool: Tool): void {
  if (toolRegistry.has(tool.name)) {
    throw new Error(`Tool '${tool.name}' is already registered`);
  }

  toolRegistry.set(tool.name, tool);

  logger.info('TOOL_REGISTRY', {
    action: 'tool_registered',
    toolName: tool.name,
    toolVersion: tool.version,
    totalTools: toolRegistry.size,
  });
}

/**
 * ツールをレジストリから削除する
 *
 * @param toolName ツール名
 * @returns 削除された場合 true、存在しなかった場合 false
 */
export function unregisterTool(toolName: string): boolean {
  const deleted = toolRegistry.delete(toolName);

  if (deleted) {
    logger.info('TOOL_REGISTRY', {
      action: 'tool_unregistered',
      toolName,
      totalTools: toolRegistry.size,
    });
  }

  return deleted;
}

/**
 * レジストリの統計情報を取得する
 *
 * @returns レジストリ統計
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
 * タグでツールを検索する
 *
 * @param tag 検索するタグ
 * @returns 該当するツールの配列
 */
export function getToolsByTag(tag: string): Tool[] {
  return Array.from(toolRegistry.values()).filter((tool) => tool.tags && tool.tags.includes(tag));
}

/**
 * レジストリの初期化とバリデーション
 */
function initializeRegistry(): void {
  logger.info('TOOL_REGISTRY', {
    action: 'registry_initialized',
    ...getRegistryStats(),
  });

  // 各ツールの基本検証
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

// レジストリを初期化
initializeRegistry();
