/**
 * Strands AI Agent Factory for AgentCore Runtime
 *
 * Thin orchestrator that delegates each concern to dedicated builder modules
 * under `./agent/`. See each module for implementation details:
 *
 * - `agent/types.ts`               — Type definitions
 * - `agent/mcp-clients-builder.ts`  — User-defined MCP client construction
 * - `agent/tools-builder.ts`        — Tool integration and filtering
 * - `agent/memory-fetcher.ts`       — Long-term memory retrieval
 * - `agent/session-loader.ts`       — Session history loading
 */

import { Agent, SlidingWindowConversationManager } from '@strands-agents/sdk';
import { config } from './config/index.js';
import { buildSystemPrompt } from './prompts/index.js';
import { createBedrockModel, getPromptCachingSupport } from './models/index.js';
import { CachePointAppender } from './session/cache-point-appender.js';
import { getCurrentStoragePath } from './context/request-context.js';

// Agent building blocks
import { buildUserMCPClients } from './agent/mcp-clients-builder.js';
import { buildToolSet } from './agent/tools-builder.js';
import { extractMemoryParams, fetchLongTermMemories } from './agent/memory-fetcher.js';
import { loadSessionHistory } from './agent/session-loader.js';

import type { CreateAgentOptions, CreateAgentResult } from './agent/types.js';

/**
 * Create Strands Agent for AgentCore Runtime.
 *
 * Orchestrates the following steps:
 * 1. Build user-defined MCP clients
 * 2. Restore session history / fetch Gateway tools / retrieve long-term memories (parallel)
 * 3. Create Bedrock model with prompt caching
 * 4. Generate system prompt
 * 5. Assemble and return the Agent instance
 *
 * @param options - Agent creation options (includes hooks, model, tools, session, memory config)
 */
export async function createAgent(options?: CreateAgentOptions): Promise<CreateAgentResult> {
  // 1. Build user-defined MCP clients
  const userMCPClients = buildUserMCPClients(options?.mcpConfig);

  // 2. Execute in parallel: session history, Gateway tools, long-term memories
  const memoryParams = extractMemoryParams(options);
  const [savedMessages, toolSet, memoryResult] = await Promise.all([
    loadSessionHistory(options?.sessionStorage, options?.sessionConfig),
    buildToolSet(options?.enabledTools, userMCPClients),
    fetchLongTermMemories(memoryParams),
  ]);

  // 3. Create Bedrock model and apply cache points to history
  const modelId = options?.modelId || config.BEDROCK_MODEL_ID;
  const model = createBedrockModel({ modelId: options?.modelId });
  const cachingSupport = getPromptCachingSupport(modelId);
  const messagesWithCache = new CachePointAppender(cachingSupport).apply(savedMessages);

  // 4. Generate system prompt
  const storagePath = getCurrentStoragePath();
  const systemPrompt = buildSystemPrompt({
    customPrompt: options?.systemPrompt,
    tools: toolSet.tools,
    storagePath,
    longTermMemories: memoryResult.memories,
  });

  // 5. Assemble Agent
  const conversationManager = new SlidingWindowConversationManager({
    windowSize: config.CONVERSATION_WINDOW_SIZE,
    shouldTruncateResults: true,
  });

  const agent = new Agent({
    model,
    systemPrompt,
    tools: [...toolSet.tools, ...toolSet.mcpClients],
    messages: messagesWithCache,
    hooks: options?.hooks,
    conversationManager,
  });

  // Set storagePath in agent state for sub-agent inheritance
  if (storagePath) {
    agent.state.set('storagePath', storagePath);
  }

  return {
    agent,
    metadata: {
      loadedMessagesCount: savedMessages.length,
      longTermMemoriesCount: memoryResult.memories.length,
      toolsCount: toolSet.counts.total,
      memoryConditions: memoryResult.conditions,
    },
  };
}
