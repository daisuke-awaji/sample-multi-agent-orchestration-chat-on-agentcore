/**
 * Session storage implementation using AgentCore Memory
 */
import {
  BedrockAgentCoreClient,
  CreateEventCommand,
  DeleteEventCommand,
  paginateListEvents,
  type PayloadType,
} from '@aws-sdk/client-bedrock-agentcore';
import { Message } from '@strands-agents/sdk';
import type { SessionConfig, SessionStorage } from './types.js';
import {
  messageToAgentCorePayload,
  agentCorePayloadToMessage,
  extractEventId,
  getCurrentTimestamp,
  type AgentCorePayload,
} from './converters.js';
import { logger } from '../../config/index.js';

/**
 * Session storage using AgentCore Memory
 */
export class AgentCoreMemoryStorage implements SessionStorage {
  private client: BedrockAgentCoreClient;
  private memoryId: string;

  constructor(memoryId: string, region: string = 'us-east-1') {
    this.client = new BedrockAgentCoreClient({ region });
    this.memoryId = memoryId;
  }

  /**
   * Load conversation history for the specified session
   * @param config Session configuration
   * @returns Array of Message objects containing conversation history
   */
  async loadMessages(config: SessionConfig): Promise<Message[]> {
    try {
      logger.info('[AgentCoreMemoryStorage] Loading messages:', {
        sessionId: config.sessionId,
        actorId: config.actorId,
      });

      // Pagination support: retrieve all events
      const allEvents = [];
      const paginator = paginateListEvents(
        { client: this.client },
        {
          memoryId: this.memoryId,
          actorId: config.actorId,
          sessionId: config.sessionId,
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
        logger.info('[AgentCoreMemoryStorage] No events found:', {
          sessionId: config.sessionId,
        });
        return [];
      }

      logger.info('[AgentCoreMemoryStorage] Fetched all events:', {
        sessionId: config.sessionId,
        totalEvents: allEvents.length,
      });

      // Sort events in chronological order
      const sortedEvents = allEvents.sort((a, b) => {
        const timestampA = a.eventTimestamp ? new Date(a.eventTimestamp).getTime() : 0;
        const timestampB = b.eventTimestamp ? new Date(b.eventTimestamp).getTime() : 0;
        return timestampA - timestampB;
      });

      // Convert events to Messages
      const messages: Message[] = [];

      for (const event of sortedEvents) {
        if (event.payload && event.payload.length > 0) {
          // Consolidate multiple payloads within a single event into one message
          const consolidatedMessage = this.consolidateEventPayloads(event.payload);
          if (consolidatedMessage) {
            messages.push(consolidatedMessage);
          }
        }
      }

      logger.info('[AgentCoreMemoryStorage] Loaded messages:', {
        sessionId: config.sessionId,
        messageCount: messages.length,
      });
      return messages;
    } catch (error) {
      logger.error('[AgentCoreMemoryStorage] Error loading messages:', {
        sessionId: config.sessionId,
        error,
      });
      throw error;
    }
  }

  /**
   * Save conversation history to the specified session
   * @param config Session configuration
   * @param messages Array of Message objects to save
   */
  async saveMessages(config: SessionConfig, messages: Message[]): Promise<void> {
    try {
      logger.info('[AgentCoreMemoryStorage] Saving messages:', {
        sessionId: config.sessionId,
        totalMessages: messages.length,
      });

      // Get the number of existing messages
      const existingMessages = await this.loadMessages(config);
      const existingCount = existingMessages.length;

      // Extract only new messages
      const newMessages = messages.slice(existingCount);

      if (newMessages.length === 0) {
        logger.info('[AgentCoreMemoryStorage] No new messages to save:', {
          sessionId: config.sessionId,
        });
        return;
      }

      logger.info('[AgentCoreMemoryStorage] Saving new messages:', {
        sessionId: config.sessionId,
        newMessageCount: newMessages.length,
      });

      // Save each message as an individual event
      for (const message of newMessages) {
        await this.createMessageEvent(config, message);
      }
    } catch (error) {
      logger.error('[AgentCoreMemoryStorage] Error saving messages:', {
        sessionId: config.sessionId,
        error,
      });
      throw error;
    }
  }

  /**
   * Clear the history for the specified session
   * @param config Session configuration
   */
  async clearSession(config: SessionConfig): Promise<void> {
    try {
      logger.info('[AgentCoreMemoryStorage] Clearing session:', {
        sessionId: config.sessionId,
      });

      // Pagination support: retrieve all events
      const allEvents = [];
      const paginator = paginateListEvents(
        { client: this.client },
        {
          memoryId: this.memoryId,
          actorId: config.actorId,
          sessionId: config.sessionId,
          includePayloads: false, // Retrieve event IDs only
          maxResults: 100,
        }
      );

      for await (const page of paginator) {
        if (page.events) {
          allEvents.push(...page.events);
        }
      }

      if (allEvents.length === 0) {
        logger.info('[AgentCoreMemoryStorage] No events to delete:', {
          sessionId: config.sessionId,
        });
        return;
      }

      logger.info('[AgentCoreMemoryStorage] Deleting events:', {
        sessionId: config.sessionId,
        eventCount: allEvents.length,
      });

      // Delete each event individually
      for (const event of allEvents) {
        const eventId = extractEventId(event);
        if (eventId) {
          await this.deleteEvent(config, eventId);
        }
      }
    } catch (error) {
      logger.error('[AgentCoreMemoryStorage] Error clearing session:', {
        sessionId: config.sessionId,
        error,
      });
      throw error;
    }
  }

  /**
   * Create a single message as an event
   * @param config Session configuration
   * @param message Message to save
   * @private
   */
  private async createMessageEvent(config: SessionConfig, message: Message): Promise<void> {
    const payload = messageToAgentCorePayload(message);

    const command = new CreateEventCommand({
      memoryId: this.memoryId,
      actorId: config.actorId,
      sessionId: config.sessionId,
      eventTimestamp: getCurrentTimestamp(),
      payload: [payload as PayloadType], // For type compatibility with AWS SDK's PayloadType
    });

    const response = await this.client.send(command);
    logger.info('[AgentCoreMemoryStorage] Created event:', {
      eventId: response.event?.eventId,
      messageRole: message.role,
    });
  }

  /**
   * Append a single message to the specified session
   * For real-time saving during streaming
   * @param config Session configuration
   * @param message Message to append
   */
  async appendMessage(config: SessionConfig, message: Message): Promise<void> {
    try {
      logger.info('[AgentCoreMemoryStorage] Appending message:', {
        sessionId: config.sessionId,
        messageRole: message.role,
      });

      await this.createMessageEvent(config, message);
    } catch (error) {
      logger.error('[AgentCoreMemoryStorage] Error appending message:', {
        sessionId: config.sessionId,
        error,
      });
      throw error;
    }
  }

  /**
   * Consolidate multiple payloads within an event into a single message
   * @param payloads Array of payloads within the event
   * @returns Consolidated Message, or null if consolidation fails
   * @private
   */
  private consolidateEventPayloads(payloads: PayloadType[]): Message | null {
    if (payloads.length === 0) return null;

    // Convert each payload to a message
    const messages: Message[] = [];
    for (const payloadItem of payloads) {
      if ('conversational' in payloadItem || 'blob' in payloadItem) {
        const agentCorePayload = payloadItem as AgentCorePayload;
        const message = agentCorePayloadToMessage(agentCorePayload);
        messages.push(message);
      }
    }

    if (messages.length === 0) return null;
    if (messages.length === 1) return messages[0];

    // Consolidate multiple messages
    // Merge content from messages with the same role
    const firstMessage = messages[0];
    const role = firstMessage.role;

    // Verify all messages have the same role
    const allSameRole = messages.every((msg) => msg.role === role);
    if (!allSameRole) {
      logger.warn('[AgentCoreMemoryStorage] Event contains mixed roles, using first message only');
      return firstMessage;
    }

    // Merge all content
    const consolidatedContent = messages.flatMap((msg) => msg.content);

    logger.info('[AgentCoreMemoryStorage] Consolidated event payloads:', {
      role,
      payloadCount: payloads.length,
      contentBlockCount: consolidatedContent.length,
    });

    return new Message({
      role,
      content: consolidatedContent,
    });
  }

  /**
   * Delete the specified event
   * @param config Session configuration
   * @param eventId ID of the event to delete
   * @private
   */
  private async deleteEvent(config: SessionConfig, eventId: string): Promise<void> {
    const command = new DeleteEventCommand({
      memoryId: this.memoryId,
      actorId: config.actorId,
      sessionId: config.sessionId,
      eventId: eventId,
    });

    await this.client.send(command);
    logger.info('[AgentCoreMemoryStorage] Deleted event:', { eventId });
  }
}
