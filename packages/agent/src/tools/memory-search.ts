/**
 * Memory Search Tool - Ad-hoc long-term memory retrieval via ToolUse
 *
 * Allows the agent to perform semantic searches against AgentCore Memory
 * at any point during a conversation, complementing the session-startup
 * memory retrieval that is embedded in the system prompt.
 */

import { tool } from '@strands-agents/sdk';
import { memorySearchDefinition } from '@fullstack-agentcore/tool-definitions';
import { retrieveLongTermMemory } from '../session/memory-retriever.js';
import { getCurrentContext } from '../context/request-context.js';
import { config, logger } from '../config/index.js';

/**
 * Memory Search Tool
 *
 * Resolves actorId and memoryId from server-side context (not from user input)
 * to ensure users can only access their own memories.
 */
export const memorySearchTool = tool({
  name: memorySearchDefinition.name,
  description: memorySearchDefinition.description,
  inputSchema: memorySearchDefinition.zodSchema,
  callback: async (input) => {
    const { query, topK } = input;

    logger.info(`🧠 memory_search tool invoked:`, {
      query: query.substring(0, 100),
      topK,
    });

    // Validate memoryId from config
    const memoryId = config.AGENTCORE_MEMORY_ID;
    if (!memoryId) {
      logger.warn('[memory_search] AGENTCORE_MEMORY_ID is not configured');
      return (
        'Long-term memory is not configured for this environment. ' +
        'AGENTCORE_MEMORY_ID is not set. Memory search is unavailable.'
      );
    }

    // Validate actorId from request context
    const context = getCurrentContext();
    const actorId = context?.userId;
    if (!actorId) {
      logger.warn('[memory_search] Could not resolve actorId from request context');
      return (
        'Could not determine the current user identity. ' +
        'User authentication information is required for memory search.'
      );
    }

    try {
      // Reuse the existing retrieveLongTermMemory function
      const memories = await retrieveLongTermMemory(
        memoryId,
        actorId,
        query,
        topK,
        config.BEDROCK_REGION
      );

      if (memories.length === 0) {
        logger.info(`[memory_search] No memories found for query: "${query.substring(0, 100)}"`);
        return `No memories found for query: "${query}". The user may not have relevant past interactions on this topic.`;
      }

      // Format results as numbered list
      const formattedMemories = memories
        .map((memory, index) => `${index + 1}. ${memory}`)
        .join('\n');

      logger.info(`[memory_search] Retrieved ${memories.length} memories`);

      return (
        `Found ${memories.length} relevant memory record(s) for query "${query}":\n\n` +
        formattedMemories
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[memory_search] Error searching memories:`, { error: errorMessage, query });

      return (
        `An error occurred while searching long-term memory: ${errorMessage}. ` +
        'You may continue the conversation without this context.'
      );
    }
  },
});
