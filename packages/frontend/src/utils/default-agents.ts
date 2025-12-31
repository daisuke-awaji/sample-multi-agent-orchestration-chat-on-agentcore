/**
 * デフォルトエージェント変換ユーティリティ
 */

import type { Agent, CreateAgentInput } from '../types/agent';

/**
 * DEFAULT_AGENTS を Agent 型に変換
 */
export function convertDefaultAgentsToAgents(defaultAgents: CreateAgentInput[]): Agent[] {
  return defaultAgents.map((input, index) => ({
    id: `default-${index}`,
    name: input.name,
    description: input.description,
    icon: input.icon,
    systemPrompt: input.systemPrompt,
    enabledTools: input.enabledTools,
    scenarios: input.scenarios.map((s, sIndex) => ({
      ...s,
      id: `scenario-${index}-${sIndex}`,
    })),
    mcpConfig: input.mcpConfig,
    createdAt: new Date(),
    updatedAt: new Date(),
    isShared: true,
    createdBy: 'Donuts', // システム提供のエージェント
    userId: 'system',
  }));
}
