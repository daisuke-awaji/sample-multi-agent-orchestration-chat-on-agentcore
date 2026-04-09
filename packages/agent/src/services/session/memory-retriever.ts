/**
 * Long-term memory retrieval utility
 * Retrieve long-term memory from AgentCore Memory using semantic search
 */

import {
  BedrockAgentCoreClient,
  RetrieveMemoryRecordsCommand,
} from '@aws-sdk/client-bedrock-agentcore';
import {
  BedrockAgentCoreControlClient,
  GetMemoryCommand,
} from '@aws-sdk/client-bedrock-agentcore-control';
import { logger } from '../../config/index.js';

/**
 * Type definitions to complement incomplete AWS SDK types
 */
interface MemoryRecordSummary {
  memoryRecordId?: string;
  content?: string | { text?: string };
  createdAt?: Date;
  namespaces?: string[];
  memoryStrategyId?: string;
  metadata?: Record<string, unknown>;
}

interface RetrieveMemoryRecordsParams {
  memoryId: string;
  namespace: string;
  searchCriteria: {
    searchQuery: string;
    memoryStrategyId: string;
    topK: number;
  };
  maxResults: number;
}

/**
 * Get semantic memory strategy ID (with cache)
 */
let cachedStrategyId: string | null = null;

async function getSemanticMemoryStrategyId(memoryId: string, region: string): Promise<string> {
  if (cachedStrategyId) {
    logger.info(`[MemoryRetriever] Using cached strategyId: ${cachedStrategyId}`);
    return cachedStrategyId as string;
  }

  try {
    logger.info(`[MemoryRetriever] Retrieving strategyId via GetMemory API: memoryId=${memoryId}`);

    const controlClient = new BedrockAgentCoreControlClient({ region });
    const command = new GetMemoryCommand({
      memoryId: memoryId,
    });

    const response = await controlClient.send(command);

    if (!response.memory?.strategies || response.memory.strategies.length === 0) {
      logger.warn('[MemoryRetriever] No strategies found in Memory');
      cachedStrategyId = 'semantic_memory_strategy'; // Fallback
      return cachedStrategyId as string;
    }

    // TODO: This logic is duplicated in packages/backend/src/services/agentcore-memory.ts
    // Consider extracting to a shared utility in packages/libs/
    // Search for strategy whose name or strategyId starts with 'semantic_memory_strategy'
    const semanticStrategy = response.memory.strategies.find(
      (strategy: { name?: string; strategyId?: string }) =>
        strategy.name?.startsWith('semantic_memory_strategy') ||
        strategy.strategyId?.startsWith('semantic_memory_strategy')
    );

    if (semanticStrategy?.strategyId) {
      cachedStrategyId = semanticStrategy.strategyId;
      logger.info(
        `[MemoryRetriever] Retrieved semantic strategy ID: ${cachedStrategyId} (name: ${semanticStrategy.name || 'N/A'})`
      );
    } else {
      logger.warn(
        '[MemoryRetriever] Semantic strategy not found, all strategies:',
        response.memory?.strategies?.map((s) => ({
          name: s.name,
          strategyId: s.strategyId,
        }))
      );
      logger.warn('[MemoryRetriever] Using fallback: semantic_memory_strategy');
      cachedStrategyId = 'semantic_memory_strategy'; // Fallback
    }

    return cachedStrategyId as string;
  } catch (error) {
    logger.error('[MemoryRetriever] GetMemory API error:', error);
    // Use fallback value on error
    cachedStrategyId = 'semantic_memory_strategy';
    return cachedStrategyId as string;
  }
}

/**
 * Retrieve long-term memory from AgentCore Memory
 * @param memoryId AgentCore Memory ID
 * @param actorId User ID
 * @param query Search query (e.g., user's latest message)
 * @param topK Number of items to retrieve (default: 10)
 * @param region AWS region (default: us-east-1)
 * @returns Array of long-term memory strings
 */
export async function retrieveLongTermMemory(
  memoryId: string,
  actorId: string,
  query: string,
  topK: number = 10,
  region: string = 'us-east-1'
): Promise<string[]> {
  try {
    logger.info(`[MemoryRetriever] Retrieving long-term memory:`, {
      actorId,
      query: query.substring(0, 100),
      topK,
      region,
    });

    // Get semantic memory strategy ID
    const memoryStrategyId = await getSemanticMemoryStrategyId(memoryId, region);

    // Build namespace format
    const namespace = `/strategies/${memoryStrategyId}/actors/${actorId}`;

    const client = new BedrockAgentCoreClient({ region });
    const retrieveParams: RetrieveMemoryRecordsParams = {
      memoryId: memoryId,
      namespace: namespace,
      searchCriteria: {
        searchQuery: query,
        memoryStrategyId: memoryStrategyId,
        topK: topK,
      },
      maxResults: 50,
    };

    const command = new RetrieveMemoryRecordsCommand(retrieveParams);
    const response = await client.send(command);

    // Type assertion for when memoryRecordSummaries is not included in AWS SDK response type
    const extendedResponse = response as typeof response & {
      memoryRecordSummaries?: MemoryRecordSummary[];
    };

    if (
      !extendedResponse.memoryRecordSummaries ||
      extendedResponse.memoryRecordSummaries.length === 0
    ) {
      logger.info('[MemoryRetriever] No long-term memory found:', {
        namespace,
        memoryStrategyId,
      });
      return [];
    }

    // Extract content
    const memories: string[] = extendedResponse.memoryRecordSummaries
      .map((record: MemoryRecordSummary) => {
        // Extract text property if content is object
        if (typeof record.content === 'object' && record.content?.text) {
          return record.content.text;
        } else if (typeof record.content === 'string') {
          return record.content;
        }
        return '';
      })
      .filter((content) => content.length > 0);

    logger.info(`[MemoryRetriever] Retrieved ${memories.length} long-term memories:`, {
      memoriesCount: memories.length,
      actorId,
    });
    return memories;
  } catch (error) {
    // Return empty array for ResourceNotFoundException (new user handling)
    if (error instanceof Error && error.name === 'ResourceNotFoundException') {
      logger.info(`[MemoryRetriever] Long-term memory does not exist (new user)`);
      return [];
    }
    logger.error('[MemoryRetriever] Long-term memory retrieval error:', error);
    // Return empty array on error to continue agent initialization
    return [];
  }
}
