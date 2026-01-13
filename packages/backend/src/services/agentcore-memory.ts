/**
 * AgentCore Memory Service Layer
 * Service for session management and event retrieval
 */

import {
  BedrockAgentCoreClient,
  ListSessionsCommand,
  ListSessionsCommandOutput,
  ListMemoryRecordsCommand,
  DeleteMemoryRecordCommand,
  RetrieveMemoryRecordsCommand,
  DeleteEventCommand,
  paginateListEvents,
} from '@aws-sdk/client-bedrock-agentcore';
import {
  BedrockAgentCoreControlClient,
  GetMemoryCommand,
} from '@aws-sdk/client-bedrock-agentcore-control';
import { config } from '../config/index.js';

/**
 * Type definitions to supplement incomplete AWS SDK type definitions
 */
interface MemoryRecordSummary {
  memoryRecordId?: string;
  content?: string | { text?: string };
  createdAt?: Date;
  namespaces?: string[];
  memoryStrategyId?: string;
  metadata?: Record<string, unknown>;
}

interface DeleteMemoryRecordParams {
  memoryId: string;
  namespace: string;
  memoryStrategyId: string;
  memoryRecordId: string;
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
 * Session information type definition (formatted for Frontend)
 */
export interface SessionSummary {
  sessionId: string;
  title: string; // Generated from first user message
  createdAt: string; // ISO 8601 string
  updatedAt: string; // ISO 8601 string
}

/**
 * Session list result type definition (with pagination)
 */
export interface SessionListResult {
  sessions: SessionSummary[];
  nextToken?: string;
  hasMore: boolean;
}

/**
 * ToolUse type definition
 */
export interface ToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status?: 'pending' | 'running' | 'completed' | 'error';
  originalToolUseId?: string;
}

/**
 * ToolResult type definition
 */
export interface ToolResult {
  toolUseId: string;
  content: string;
  isError: boolean;
}

/**
 * MessageContent type definition (Union type)
 */
export type MessageContent =
  | { type: 'text'; text: string }
  | { type: 'toolUse'; toolUse: ToolUse }
  | { type: 'toolResult'; toolResult: ToolResult }
  | { type: 'image'; image: { base64: string; mimeType: string; fileName?: string } };

/**
 * Event information type definition (formatted for Frontend)
 */
export interface ConversationMessage {
  id: string;
  type: 'user' | 'assistant';
  contents: MessageContent[];
  timestamp: string; // ISO 8601 string
}

/**
 * Conversational Payload type definition
 */
interface ConversationalPayload {
  conversational: {
    role: string;
    content: {
      text: string;
    };
  };
}

/**
 * Strands ContentBlock type definition
 */
interface StrandsContentBlock {
  type: string;
  text?: string;
  name?: string;
  toolUseId?: string;
  input?: Record<string, unknown>;
  content?: unknown;
  status?: string;
  // ImageBlock fields
  format?: string;
  base64?: string;
  source?: { bytes?: Uint8Array };
}

/**
 * Blob data content type definition (new format)
 */
interface BlobData {
  messageType: 'content';
  role: string;
  content: StrandsContentBlock[]; // Array of Strands ContentBlocks
}

/**
 * Convert Strands ContentBlock to MessageContent
 * @param contentBlocks Array of Strands SDK ContentBlocks
 * @returns Array of MessageContent
 */
function convertToMessageContents(contentBlocks: StrandsContentBlock[]): MessageContent[] {
  const messageContents: MessageContent[] = [];

  for (const block of contentBlocks) {
    if (!block || typeof block !== 'object') continue;

    switch (block.type) {
      case 'textBlock':
        if ('text' in block && typeof block.text === 'string') {
          messageContents.push({ type: 'text', text: block.text });
        }
        break;

      case 'toolUseBlock':
        if (
          'name' in block &&
          'toolUseId' in block &&
          'input' in block &&
          block.name &&
          block.toolUseId &&
          block.input !== undefined
        ) {
          messageContents.push({
            type: 'toolUse',
            toolUse: {
              id: block.toolUseId,
              name: block.name,
              input: block.input || {},
              status: 'completed', // Default status
              originalToolUseId: block.toolUseId,
            },
          });
        }
        break;

      case 'toolResultBlock':
        if ('toolUseId' in block && block.toolUseId) {
          messageContents.push({
            type: 'toolResult',
            toolResult: {
              toolUseId: block.toolUseId,
              content:
                typeof block.content === 'string'
                  ? block.content
                  : JSON.stringify(block.content || {}),
              isError: block.status === 'error' || false,
            },
          });
        }
        break;

      case 'imageBlock':
        // Handle serialized ImageBlock (base64 format from converters.ts)
        if ('base64' in block && typeof block.base64 === 'string' && block.format) {
          // Map format to mimeType
          const formatToMimeType: Record<string, string> = {
            png: 'image/png',
            jpeg: 'image/jpeg',
            jpg: 'image/jpeg',
            gif: 'image/gif',
            webp: 'image/webp',
          };
          const mimeType = formatToMimeType[block.format] || 'image/png';

          messageContents.push({
            type: 'image',
            image: {
              base64: block.base64,
              mimeType,
            },
          });
        }
        break;

      default:
        console.warn(`[AgentCoreMemoryService] Unknown ContentBlock type: ${block.type}`);
        break;
    }
  }

  return messageContents;
}

/**
 * Parse blob payload
 * @param blob Uint8Array or Buffer or base64 string
 * @returns Parsed BlobData
 */
function parseBlobPayload(blob: Uint8Array | Buffer | unknown): BlobData | null {
  try {
    let blobString: string;

    // For Uint8Array
    if (blob instanceof Uint8Array) {
      const decoder = new TextDecoder();
      blobString = decoder.decode(blob);
    }
    // For Buffer
    else if (typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(blob)) {
      blobString = (blob as Buffer).toString('utf8');
    }
    // For string (base64 encoded string from AWS SDK)
    else if (typeof blob === 'string') {
      try {
        // Try base64 decoding
        const decodedBuffer = Buffer.from(blob, 'base64');
        blobString = decodedBuffer.toString('utf8');
      } catch {
        // Use directly if not base64
        blobString = blob;
      }
    }
    // For other cases
    else {
      console.warn('[AgentCoreMemoryService] Unknown blob type:', typeof blob);
      return null;
    }

    const blobData = JSON.parse(blobString) as BlobData;
    return blobData.messageType === 'content' ? blobData : null;
  } catch (error) {
    console.error('[AgentCoreMemoryService] Failed to parse blob payload:', error);
    console.error(
      '[AgentCoreMemoryService] Raw blob sample:',
      typeof blob === 'string' ? blob.substring(0, 100) + '...' : typeof blob
    );
    return null;
  }
}

/**
 * Long-term memory record type definition
 */
export interface MemoryRecord {
  recordId: string;
  namespace: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Long-term memory record list type definition
 */
export interface MemoryRecordList {
  records: MemoryRecord[];
  nextToken?: string;
}

/**
 * AgentCore Memory service class
 */
export class AgentCoreMemoryService {
  private client: BedrockAgentCoreClient;
  private controlClient: BedrockAgentCoreControlClient;
  private memoryId: string;
  private region: string;
  private cachedStrategyId: string | null = null;

  constructor(memoryId?: string, region: string = 'us-east-1') {
    if (!memoryId) {
      throw new Error('AgentCore Memory ID is not configured');
    }

    this.client = new BedrockAgentCoreClient({ region });
    this.controlClient = new BedrockAgentCoreControlClient({ region });
    this.memoryId = memoryId;
    this.region = region;
  }

  /**
   * Get semantic memory strategy ID (with caching)
   * @returns Semantic memory strategy ID
   */
  async getSemanticMemoryStrategyId(): Promise<string> {
    if (this.cachedStrategyId) {
      console.log(`[AgentCoreMemoryService] Using cached strategyId: ${this.cachedStrategyId}`);
      return this.cachedStrategyId;
    }

    try {
      console.log(
        `[AgentCoreMemoryService] Retrieving strategyId via GetMemory API: memoryId=${this.memoryId}`
      );

      const command = new GetMemoryCommand({
        memoryId: this.memoryId,
      });

      const response = await this.controlClient.send(command);

      if (!response.memory?.strategies || response.memory.strategies.length === 0) {
        console.warn('[AgentCoreMemoryService] No strategies found in Memory');
        this.cachedStrategyId = 'semantic_memory_strategy'; // Fallback
        return this.cachedStrategyId;
      }

      // Search for strategy with name starting with 'semantic_memory_strategy'
      const semanticStrategy = response.memory.strategies.find((strategy) =>
        strategy.name?.startsWith('semantic_memory_strategy')
      );

      if (semanticStrategy?.strategyId) {
        this.cachedStrategyId = semanticStrategy.strategyId;
        console.log(
          `[AgentCoreMemoryService] Retrieved semantic strategy ID: ${this.cachedStrategyId}`
        );
      } else {
        console.warn('[AgentCoreMemoryService] Semantic strategy not found, using fallback');
        this.cachedStrategyId = 'semantic_memory_strategy'; // Fallback
      }

      return this.cachedStrategyId;
    } catch (error) {
      console.error('[AgentCoreMemoryService] GetMemory API error:', error);
      // Use fallback value on error
      this.cachedStrategyId = 'semantic_memory_strategy';
      return this.cachedStrategyId;
    }
  }

  /**
   * Get session list for specified actor (fetch all sessions)
   * @param actorId User ID (JWT sub)
   * @returns Session list result (all sessions, sorted by creation date descending)
   */
  async listSessions(actorId: string): Promise<SessionListResult> {
    try {
      console.log(`[AgentCoreMemoryService] Retrieving all sessions: actorId=${actorId}`);

      const allSessions: SessionSummary[] = [];
      let nextToken: string | undefined = undefined;

      // Fetch all pages
      do {
        const command = new ListSessionsCommand({
          memoryId: this.memoryId,
          actorId: actorId,
          maxResults: 100, // Maximum allowed by API
          nextToken: nextToken,
        });

        const response: ListSessionsCommandOutput = await this.client.send(command);

        if (response.sessionSummaries && response.sessionSummaries.length > 0) {
          // Add sessions from this page
          const pageSessions = response.sessionSummaries
            .filter((sessionSummary) => sessionSummary.sessionId)
            .map((sessionSummary) => ({
              sessionId: sessionSummary.sessionId!,
              title: 'Session',
              createdAt: sessionSummary.createdAt?.toISOString() || new Date().toISOString(),
              updatedAt: sessionSummary.createdAt?.toISOString() || new Date().toISOString(),
            }));

          allSessions.push(...pageSessions);
        }

        nextToken = response.nextToken;
      } while (nextToken);

      // Sort by creation date (newest first)
      allSessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      console.log(`[AgentCoreMemoryService] Retrieved all ${allSessions.length} sessions`);

      return {
        sessions: allSessions,
        hasMore: false, // All sessions fetched
      };
    } catch (error) {
      // Return empty result for new users where Actor doesn't exist
      if (error instanceof Error && error.name === 'ResourceNotFoundException') {
        console.log(
          `[AgentCoreMemoryService] Returning empty session list for new user: actorId=${actorId}`
        );
        return {
          sessions: [],
          hasMore: false,
        };
      }
      console.error('[AgentCoreMemoryService] Session list retrieval error:', error);
      throw error;
    }
  }

  /**
   * Delete a session from AgentCore Memory by deleting all events
   * @param actorId User ID
   * @param sessionId Session ID
   */
  async deleteSession(actorId: string, sessionId: string): Promise<void> {
    try {
      console.log(`[AgentCoreMemoryService] Deleting session events: sessionId=${sessionId}`);

      // Get all events for the session
      const allEvents = [];
      const paginator = paginateListEvents(
        { client: this.client },
        {
          memoryId: this.memoryId,
          actorId,
          sessionId,
          maxResults: 100,
        }
      );

      for await (const page of paginator) {
        if (page.events) {
          allEvents.push(...page.events);
        }
      }

      console.log(`[AgentCoreMemoryService] Found ${allEvents.length} events to delete`);

      // Delete each event
      for (const event of allEvents) {
        if (event.eventId) {
          try {
            await this.client.send(
              new DeleteEventCommand({
                memoryId: this.memoryId,
                actorId,
                sessionId,
                eventId: event.eventId,
              })
            );
          } catch (deleteError) {
            console.warn(
              `[AgentCoreMemoryService] Failed to delete event ${event.eventId}:`,
              deleteError
            );
          }
        }
      }

      console.log(
        `[AgentCoreMemoryService] Session events deleted successfully: sessionId=${sessionId}`
      );
    } catch (error) {
      console.error('[AgentCoreMemoryService] Session deletion error:', error);
      throw error;
    }
  }

  /**
   * Get conversation history for specified session
   * @param actorId User ID
   * @param sessionId Session ID
   * @returns Conversation history
   */
  async getSessionEvents(actorId: string, sessionId: string): Promise<ConversationMessage[]> {
    try {
      console.log(`[AgentCoreMemoryService] Retrieving session events: sessionId=${sessionId}`);

      // ページネーション対応：すべてのイベントを取得
      const allEvents = [];
      const paginator = paginateListEvents(
        { client: this.client },
        {
          memoryId: this.memoryId,
          actorId: actorId,
          sessionId: sessionId,
          includePayloads: true,
          maxResults: 100,
        }
      );

      for await (const page of paginator) {
        if (page.events) {
          allEvents.push(...page.events);
        }
      }

      if (allEvents.length === 0) {
        console.log(`[AgentCoreMemoryService] No events found: sessionId=${sessionId}`);
        return [];
      }

      // Sort Events in chronological order
      const sortedEvents = allEvents.sort((a, b) => {
        const timestampA = a.eventTimestamp ? new Date(a.eventTimestamp).getTime() : 0;
        const timestampB = b.eventTimestamp ? new Date(b.eventTimestamp).getTime() : 0;
        return timestampA - timestampB;
      });

      // Convert Events to ConversationMessage
      const messages: ConversationMessage[] = [];

      for (const event of sortedEvents) {
        if (event.payload && event.payload.length > 0) {
          for (const payloadItem of event.payload) {
            // Case 1: conversational payload (text only)
            if ('conversational' in payloadItem) {
              const conversationalPayload = payloadItem as ConversationalPayload;
              const role = conversationalPayload.conversational.role;
              const text = conversationalPayload.conversational.content.text;

              messages.push({
                id: event.eventId || `event_${messages.length}`,
                type: role === 'USER' ? 'user' : 'assistant',
                contents: [{ type: 'text', text }],
                timestamp: event.eventTimestamp?.toISOString() || new Date().toISOString(),
              });
            }

            // Case 2: blob payload (includes toolUse/toolResult)
            else if ('blob' in payloadItem && payloadItem.blob) {
              const blobData = parseBlobPayload(payloadItem.blob);

              if (blobData) {
                const messageContents = convertToMessageContents(blobData.content);

                messages.push({
                  id: event.eventId || `event_${messages.length}`,
                  type: blobData.role === 'user' ? 'user' : 'assistant',
                  contents: messageContents,
                  timestamp: event.eventTimestamp?.toISOString() || new Date().toISOString(),
                });
              }
            }
          }
        }
      }

      console.log(`[AgentCoreMemoryService] Retrieved ${messages.length} messages`);
      return messages;
    } catch (error) {
      console.error('[AgentCoreMemoryService] Session event retrieval error:', error);
      throw error;
    }
  }

  /**
   * Get long-term memory record list
   * @param actorId User ID
   * @param memoryStrategyId Memory strategy ID (e.g., preference_builtin_cdkGen0001-L84bdDEgeO)
   * @param nextToken Pagination token
   * @returns Long-term memory record list
   */
  async listMemoryRecords(
    actorId: string,
    memoryStrategyId: string,
    nextToken?: string
  ): Promise<MemoryRecordList> {
    try {
      console.log(
        `[AgentCoreMemoryService] Retrieving long-term memory record list: actorId=${actorId}, memoryStrategyId=${memoryStrategyId}`
      );

      // Fix namespace format to correct format
      const namespace = `/strategies/${memoryStrategyId}/actors/${actorId}`;

      const command = new ListMemoryRecordsCommand({
        memoryId: this.memoryId,
        namespace: namespace,
        memoryStrategyId: memoryStrategyId,
        maxResults: 50,
        nextToken: nextToken,
      });

      const response = await this.client.send(command);

      // Type assertion for cases where memoryRecordSummaries is not included in AWS SDK response type
      const extendedResponse = response as typeof response & {
        memoryRecordSummaries?: MemoryRecordSummary[];
      };

      if (!extendedResponse.memoryRecordSummaries) {
        console.log(
          `[AgentCoreMemoryService] Long-term memory records not found: memoryStrategyId=${memoryStrategyId}`
        );
        return { records: [] };
      }

      const records: MemoryRecord[] = extendedResponse.memoryRecordSummaries.map(
        (record, index: number) => {
          // Debug log: Check structure of memoryRecordSummaries
          if (index < 2) {
            // Log only first 2 items
            console.log(`[AgentCoreMemoryService] Record ${index} structure:`, {
              recordId: record.memoryRecordId,
              recordIdType: typeof record.memoryRecordId,
              availableKeys: Object.keys(record),
              fullRecord: record,
            });
          }

          // Extract text property if content is an object
          let content = '';
          if (typeof record.content === 'object' && record.content?.text) {
            content = record.content.text;
          } else if (typeof record.content === 'string') {
            content = record.content;
          } else if (record.content) {
            content = JSON.stringify(record.content);
          }

          // Warning log if recordId is empty
          const recordId = record.memoryRecordId || '';
          if (!recordId) {
            console.warn(
              `[AgentCoreMemoryService] Empty recordId found in record ${index}:`,
              record
            );
          }

          return {
            recordId: recordId,
            namespace: namespace,
            content: content,
            createdAt: record.createdAt?.toISOString() || new Date().toISOString(),
            updatedAt: record.createdAt?.toISOString() || new Date().toISOString(), // AWS SDK doesn't provide updatedAt
          };
        }
      );

      console.log(`[AgentCoreMemoryService] Retrieved ${records.length} long-term memory records`);
      return {
        records,
        nextToken: response.nextToken,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'ResourceNotFoundException') {
        console.log(
          `[AgentCoreMemoryService] Long-term memory records do not exist: memoryStrategyId=${memoryStrategyId}`
        );
        return { records: [] };
      }
      console.error(
        '[AgentCoreMemoryService] Long-term memory record list retrieval error:',
        error
      );
      throw error;
    }
  }

  /**
   * Delete long-term memory record
   * @param actorId User ID
   * @param memoryStrategyId Memory strategy ID
   * @param recordId Record ID
   */
  async deleteMemoryRecord(
    actorId: string,
    memoryStrategyId: string,
    recordId: string
  ): Promise<void> {
    try {
      console.log(
        `[AgentCoreMemoryService] Deleting long-term memory record: recordId=${recordId}, memoryStrategyId=${memoryStrategyId}`
      );

      // Fix namespace format to correct format
      const namespace = `/strategies/${memoryStrategyId}/actors/${actorId}`;

      const deleteParams: DeleteMemoryRecordParams = {
        memoryId: this.memoryId,
        namespace: namespace,
        memoryStrategyId: memoryStrategyId,
        memoryRecordId: recordId, // recordId → memoryRecordId fixed
      };

      console.log(`[AgentCoreMemoryService] Delete parameters:`, deleteParams);

      const command = new DeleteMemoryRecordCommand(deleteParams);

      await this.client.send(command);
      console.log(`[AgentCoreMemoryService] Long-term memory record deleted: recordId=${recordId}`);
    } catch (error) {
      console.error('[AgentCoreMemoryService] Long-term memory record deletion error:', error);
      throw error;
    }
  }

  /**
   * Retrieve long-term memory records using semantic search
   * @param actorId User ID
   * @param memoryStrategyId Memory strategy ID
   * @param query Search query
   * @param topK Number of items to retrieve (default: 10)
   * @param relevanceScore Relevance score threshold (default: 0.2)
   * @returns Long-term memory record list (sorted by relevance)
   */
  async retrieveMemoryRecords(
    actorId: string,
    memoryStrategyId: string,
    query: string,
    topK: number = 10,
    _relevanceScore: number = 0.2
  ): Promise<MemoryRecord[]> {
    try {
      console.log(
        `[AgentCoreMemoryService] Executing semantic search: query=${query}, memoryStrategyId=${memoryStrategyId}`
      );

      // Fix namespace format to correct format
      const namespace = `/strategies/${memoryStrategyId}/actors/${actorId}`;

      const retrieveParams: RetrieveMemoryRecordsParams = {
        memoryId: this.memoryId,
        namespace: namespace,
        searchCriteria: {
          searchQuery: query,
          memoryStrategyId: memoryStrategyId,
          topK: topK,
        },
        maxResults: 50,
      };

      const command = new RetrieveMemoryRecordsCommand(retrieveParams);

      const response = await this.client.send(command);

      // Type assertion for cases where memoryRecordSummaries is not included in AWS SDK response type
      const extendedResponse = response as typeof response & {
        memoryRecordSummaries?: MemoryRecordSummary[];
      };

      if (!extendedResponse.memoryRecordSummaries) {
        console.log(`[AgentCoreMemoryService] Semantic search results not found: query=${query}`);
        return [];
      }

      const records: MemoryRecord[] = extendedResponse.memoryRecordSummaries.map(
        (record: MemoryRecordSummary, index: number) => {
          // Debug log: Check structure of memoryRecordSummaries
          if (index < 2) {
            // Log only first 2 items
            console.log(`[AgentCoreMemoryService] Retrieve record ${index} structure:`, {
              recordId: record.memoryRecordId,
              recordIdType: typeof record.memoryRecordId,
              availableKeys: Object.keys(record),
              fullRecord: record,
            });
          }

          // Extract text property if content is an object
          let content = '';
          if (typeof record.content === 'object' && record.content?.text) {
            content = record.content.text;
          } else if (typeof record.content === 'string') {
            content = record.content;
          } else if (record.content) {
            content = JSON.stringify(record.content);
          }

          // Warning log if recordId is empty
          const recordId = record.memoryRecordId || '';
          if (!recordId) {
            console.warn(
              `[AgentCoreMemoryService] Empty recordId found in retrieve record ${index}:`,
              record
            );
          }

          return {
            recordId: recordId,
            namespace: namespace,
            content: content,
            createdAt: record.createdAt?.toISOString() || new Date().toISOString(),
            updatedAt: record.createdAt?.toISOString() || new Date().toISOString(), // AWS SDK doesn't provide updatedAt
          };
        }
      );

      console.log(`[AgentCoreMemoryService] Retrieved ${records.length} semantic search results`);
      return records;
    } catch (error) {
      if (error instanceof Error && error.name === 'ResourceNotFoundException') {
        console.log(
          `[AgentCoreMemoryService] Semantic search target does not exist: memoryStrategyId=${memoryStrategyId}`
        );
        return [];
      }
      console.error('[AgentCoreMemoryService] Semantic search error:', error);
      throw error;
    }
  }
}

/**
 * Create AgentCore Memory service instance
 * @returns AgentCoreMemoryService instance
 */
export function createAgentCoreMemoryService(): AgentCoreMemoryService {
  return new AgentCoreMemoryService(config.agentcore.memoryId, config.agentcore.region);
}
