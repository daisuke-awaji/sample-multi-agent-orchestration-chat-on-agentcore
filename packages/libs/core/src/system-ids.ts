/**
 * System IDs — Well-known Synthetic Identifiers
 *
 * Default/system agents are NOT stored in DynamoDB and do not have real UUIDs.
 * Instead, they use well-known synthetic IDs (e.g., "system", "default-0").
 *
 * These constants centralise the `as` casts in one place so that route handlers
 * never need raw `as UserId` / `as AgentId` casts, preserving branded-type safety
 * across the rest of the codebase.
 *
 * ⚠️  Values returned by these helpers **must not** be passed to functions that
 *     expect real UUID-format IDs (e.g., DynamoDB key look-ups, SSM paths).
 */

import type { UserId } from './user-id.js';
import type { AgentId } from './agent-id.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Synthetic UserId for system-owned resources (default agents, etc.).
 * Not a real UUID — only used in API responses, never persisted to DynamoDB.
 */
export const SYSTEM_USER_ID = 'system' as UserId;

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/**
 * Create a synthetic AgentId for a default agent by index.
 *
 * @param index - Zero-based index into the DEFAULT_AGENTS array
 * @returns A branded AgentId like "default-0", "default-1", etc.
 *
 * @example
 * ```ts
 * const agentId = systemAgentId(0); // AgentId — "default-0"
 * ```
 */
export function systemAgentId(index: number): AgentId {
  return `default-${index}` as AgentId;
}

/**
 * Create a synthetic Scenario ID for a default agent's scenario.
 *
 * @param agentIndex - Zero-based default agent index
 * @param scenarioIndex - Zero-based scenario index within the agent
 */
export function systemScenarioId(agentIndex: number, scenarioIndex: number): string {
  return `default-${agentIndex}-scenario-${scenarioIndex}`;
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/**
 * Check if a UserId is the well-known system user.
 */
export function isSystemUserId(userId: string): boolean {
  return userId === (SYSTEM_USER_ID as string);
}

/**
 * Check if an AgentId looks like a system default agent ID.
 */
export function isSystemAgentId(agentId: string): boolean {
  return /^default-\d+$/.test(agentId);
}
