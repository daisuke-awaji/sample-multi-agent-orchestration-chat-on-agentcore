/**
 * Type definitions for Agent creation
 */

import type { Agent, HookProvider } from '@strands-agents/sdk';
import type { SessionStorage, SessionConfig } from '../session/types.js';
import type { ServiceTier } from '../models/bedrock.js';

/**
 * Strands Agent creation options for AgentCore Runtime
 */
export interface CreateAgentOptions {
  hooks?: HookProvider[]; // Array of HookProviders (e.g., session persistence, workspace sync)
  modelId?: string; // Model ID to use (uses environment variable if not specified)
  enabledTools?: string[]; // Array of tool names to enable (undefined=all, []=none)
  systemPrompt?: string; // Custom system prompt (auto-generated if not specified)
  // For session restoration (for parallel processing)
  sessionStorage?: SessionStorage;
  sessionConfig?: SessionConfig;
  // For long-term memory reference
  memoryEnabled?: boolean; // Whether to enable long-term memory (default: false)
  memoryContext?: string; // Search query (e.g., user's latest message)
  actorId?: string; // User ID
  memoryTopK?: number; // Number of long-term memories to retrieve (default: 10)
  // User-defined MCP server configuration
  mcpConfig?: Record<string, unknown>; // Configuration in mcp.json format
  serviceTier?: ServiceTier; // Bedrock service tier override (default/flex/priority)
}

/**
 * Agent creation result
 */
export interface CreateAgentResult {
  agent: Agent;
  metadata: AgentMetadata;
}

/**
 * Metadata returned after agent creation
 */
export interface AgentMetadata {
  loadedMessagesCount: number;
  longTermMemoriesCount: number;
  toolsCount: number;
  memoryConditions?: MemoryConditions;
}

/**
 * Conditions checked during long-term memory retrieval
 */
export interface MemoryConditions {
  memoryEnabled: boolean;
  hasActorId: boolean;
  hasMemoryContext: boolean;
  hasMemoryId: boolean;
}

/**
 * Parameters for long-term memory retrieval
 */
export interface LongTermMemoryParams {
  enabled: boolean;
  actorId?: string;
  context?: string;
  topK?: number;
}

/**
 * Result of long-term memory retrieval
 */
export interface LongTermMemoryResult {
  memories: string[];
  conditions: MemoryConditions;
}
