/**
 * Long-term memory fetcher
 *
 * Retrieves long-term memories from AgentCore Memory for context enrichment.
 */

import { logger, config } from '../../config/index.js';
import { retrieveLongTermMemory } from '../../services/session/memory-retriever.js';
import type { LongTermMemoryParams, LongTermMemoryResult, MemoryConditions } from './types.js';

/**
 * Extract long-term memory parameters from agent options.
 */
export function extractMemoryParams(options?: {
  memoryEnabled?: boolean;
  actorId?: string;
  memoryContext?: string;
  memoryTopK?: number;
}): LongTermMemoryParams {
  return {
    enabled: !!options?.memoryEnabled,
    actorId: options?.actorId,
    context: options?.memoryContext,
    topK: options?.memoryTopK,
  };
}

/**
 * Fetch long-term memories based on the provided parameters.
 *
 * Returns empty memories when:
 * - Memory is disabled
 * - AGENTCORE_MEMORY_ID is not configured
 * - actorId or context is missing
 */
export async function fetchLongTermMemories(
  params: LongTermMemoryParams
): Promise<LongTermMemoryResult> {
  const conditions: MemoryConditions = {
    memoryEnabled: params.enabled,
    hasActorId: !!params.actorId,
    hasMemoryContext: !!params.context,
    hasMemoryId: !!config.AGENTCORE_MEMORY_ID,
  };

  logger.info('🧠 Long-term memory retrieval condition check:', conditions);

  if (!params.enabled) {
    logger.info('🧠 Long-term memory is disabled');
    return { memories: [], conditions };
  }

  if (!conditions.hasMemoryId) {
    logger.warn('⚠️ AGENTCORE_MEMORY_ID is not configured');
    return { memories: [], conditions };
  }
  if (!conditions.hasActorId) {
    logger.warn('⚠️ actorId is not provided');
    return { memories: [], conditions };
  }
  if (!conditions.hasMemoryContext) {
    logger.warn('⚠️ memoryContext is not provided');
    return { memories: [], conditions };
  }

  // All conditions met — retrieve memories
  const memories = await retrieveLongTermMemory(
    config.AGENTCORE_MEMORY_ID!,
    params.actorId!,
    params.context!,
    params.topK || 10,
    config.BEDROCK_REGION
  );

  return { memories, conditions };
}
