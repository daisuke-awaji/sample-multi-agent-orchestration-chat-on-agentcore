/**
 * CachePointAppender — adds CachePointBlock to session history messages
 * based on the model's caching capabilities.
 *
 * Responsibility: "Given caching capabilities, should I add a cache point
 * to the message history? If so, append it to the last message."
 */

import { Message, CachePointBlock } from '@strands-agents/sdk';
import type { PromptCachingSupport } from '../models/bedrock.js';
import { config, logger } from '../config/index.js';

export class CachePointAppender {
  constructor(private readonly cachingSupport: PromptCachingSupport) {}

  /**
   * Add CachePointBlock to the last message in session history.
   *
   * Returns messages unchanged if:
   * - Global prompt caching is disabled
   * - The message array is empty
   * - The model does not support messages caching
   *
   * @param messages Session history message array
   * @returns Message array with cache point appended to the last message (if applicable)
   */
  apply(messages: Message[]): Message[] {
    if (!config.ENABLE_PROMPT_CACHING || messages.length === 0) {
      return messages;
    }

    if (!this.cachingSupport.messages) {
      return messages;
    }

    const lastMessage = messages[messages.length - 1];
    const updatedLastMessage = new Message({
      role: lastMessage.role,
      content: [...lastMessage.content, new CachePointBlock({ cacheType: 'default' })],
    });

    logger.debug('📦 Added CachePointBlock to session history', {
      totalMessages: messages.length,
      cacheType: config.CACHE_TYPE,
    });

    return [...messages.slice(0, -1), updatedLastMessage];
  }
}
