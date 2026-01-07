/**
 * Session persistence hook
 * HookProvider that automatically saves conversation history before and after Agent execution
 * Also manages session metadata in DynamoDB and generates AI-powered titles
 */

import {
  HookProvider,
  HookRegistry,
  AfterInvocationEvent,
  MessageAddedEvent,
  Message,
} from '@strands-agents/sdk';
import { SessionConfig, SessionStorage } from './types.js';
import { getSessionsService } from '../services/sessions-service.js';
import { getTitleGenerator } from '../services/title-generator.js';
import { logger } from '../config/index.js';

/**
 * Extract title from first user message (truncate to max 50 chars)
 * Used as temporary title before AI generation
 */
function extractTitleFromMessage(message: Message): string {
  const maxLength = 50;

  if (message.role !== 'user') {
    return 'Session';
  }

  const text = extractTextFromMessage(message);
  if (!text) {
    return 'Session';
  }

  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

/**
 * Extract text content from a message
 */
function extractTextFromMessage(message: Message): string {
  const content = message.content;
  if (!content || !Array.isArray(content)) {
    return '';
  }

  for (const block of content) {
    if (block && typeof block === 'object' && 'text' in block && typeof block.text === 'string') {
      const text = block.text.trim();
      if (text) {
        return text;
      }
    }
  }

  return '';
}

/**
 * Hook that persists session history in response to Agent lifecycle events
 * Also creates/updates session metadata in DynamoDB and generates AI-powered titles
 *
 * Usage:
 * const hook = new SessionPersistenceHook(storage, { actorId: "user123", sessionId: "session456" });
 * const agent = new Agent({ hooks: [hook] });
 */
export class SessionPersistenceHook implements HookProvider {
  private isFirstUserMessage = true;
  private isNewSession = false;
  private firstUserMessageText?: string;
  private agentId?: string;

  constructor(
    private readonly storage: SessionStorage,
    private readonly sessionConfig: SessionConfig,
    agentId?: string
  ) {
    this.agentId = agentId;
  }

  /**
   * Register hook callbacks to registry
   */
  registerCallbacks(registry: HookRegistry): void {
    // Handle message added events for DynamoDB session management
    registry.addCallback(MessageAddedEvent, (event) => this.onMessageAdded(event));

    // Save history after Agent execution completes
    registry.addCallback(AfterInvocationEvent, (event) => this.onAfterInvocation(event));
  }

  /**
   * Event handler when a message is added
   * Creates session in DynamoDB on first user message, updates timestamp on subsequent messages
   * Triggers async title generation on first assistant message for new sessions
   */
  private async onMessageAdded(event: MessageAddedEvent): Promise<void> {
    const message = event.message;
    const { actorId, sessionId } = this.sessionConfig;

    const sessionsService = getSessionsService();
    if (!sessionsService.isConfigured()) {
      logger.debug(
        '[SessionPersistenceHook] SessionsService not configured, skipping DynamoDB operation'
      );
      return;
    }

    // Handle user messages
    if (message.role === 'user') {
      try {
        if (this.isFirstUserMessage) {
          // Check if session already exists
          const exists = await sessionsService.sessionExists(actorId, sessionId);

          if (!exists) {
            // New session - create in DynamoDB with temporary title
            const title = extractTitleFromMessage(message);
            await sessionsService.createSession({
              userId: actorId,
              sessionId,
              title,
              agentId: this.agentId,
            });
            logger.info('[SessionPersistenceHook] Created new session in DynamoDB:', {
              userId: actorId,
              sessionId,
              title,
            });

            // Mark as new session and save user message for title generation
            this.isNewSession = true;
            this.firstUserMessageText = extractTextFromMessage(message);
          } else {
            // Existing session - update timestamp
            await sessionsService.updateSessionTimestamp(actorId, sessionId);
            logger.debug('[SessionPersistenceHook] Updated existing session timestamp:', {
              userId: actorId,
              sessionId,
            });
          }

          this.isFirstUserMessage = false;
        } else {
          // Subsequent messages - just update timestamp
          await sessionsService.updateSessionTimestamp(actorId, sessionId);
          logger.debug('[SessionPersistenceHook] Updated session timestamp:', {
            userId: actorId,
            sessionId,
          });
        }
      } catch (error) {
        logger.warn('[SessionPersistenceHook] DynamoDB operation failed:', {
          userId: actorId,
          sessionId,
          error,
        });
      }
      return;
    }

    // Handle assistant messages - trigger title generation for new sessions
    if (message.role === 'assistant' && this.isNewSession && this.firstUserMessageText) {
      const assistantText = extractTextFromMessage(message);

      // Trigger async title generation (don't await)
      this.generateTitleAsync(actorId, sessionId, this.firstUserMessageText, assistantText);

      // Reset flags to prevent duplicate generation
      this.isNewSession = false;
      this.firstUserMessageText = undefined;
    }
  }

  /**
   * Generate title asynchronously and update DynamoDB
   * This runs in background without blocking the main response stream
   */
  private async generateTitleAsync(
    userId: string,
    sessionId: string,
    userMessage: string,
    assistantMessage: string
  ): Promise<void> {
    try {
      logger.info('[SessionPersistenceHook] Starting async title generation:', {
        userId,
        sessionId,
        userMessageLength: userMessage.length,
        assistantMessageLength: assistantMessage.length,
      });

      const titleGenerator = getTitleGenerator();
      const title = await titleGenerator.generateTitle(userMessage, assistantMessage);

      const sessionsService = getSessionsService();
      await sessionsService.updateSessionTitle(userId, sessionId, title);

      logger.info('[SessionPersistenceHook] Title generated and saved:', {
        userId,
        sessionId,
        title,
      });
    } catch (error) {
      // Log warning but don't throw - keep temporary title
      logger.warn('[SessionPersistenceHook] Failed to generate title, keeping temporary title:', {
        userId,
        sessionId,
        error,
      });
    }
  }

  /**
   * Event handler after Agent execution completes
   * Save conversation history to storage
   * Fallback for when real-time saving is not performed
   */
  private async onAfterInvocation(event: AfterInvocationEvent): Promise<void> {
    try {
      const { actorId, sessionId } = this.sessionConfig;
      const messages = event.agent.messages;

      logger.debug(
        `🔍 AfterInvocation triggered: Agent messages=${messages.length}, checking for unsaved messages`,
        { actorId, sessionId }
      );

      // Save conversation history to storage (avoid duplicates if already saved)
      await this.storage.saveMessages(this.sessionConfig, messages);

      logger.debug(
        `💾 Session history auto-save completed (fallback): ${actorId}/${sessionId} (${messages.length} items)`
      );
    } catch (error) {
      // Log at warning level to not stop Agent execution even if error occurs
      logger.warn(
        `⚠️  Session history auto-save failed: ${this.sessionConfig.actorId}/${this.sessionConfig.sessionId}`,
        error
      );
    }
  }
}
