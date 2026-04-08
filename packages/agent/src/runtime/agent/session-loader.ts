/**
 * Session history loader
 *
 * Loads saved messages from session storage for conversation continuity.
 */

import type { Message } from '@strands-agents/sdk';
import { logger } from '../../config/index.js';
import type { SessionStorage, SessionConfig } from '../../services/session/types.js';

/**
 * Load session history from storage.
 * Returns an empty array if storage or config is not provided.
 */
export async function loadSessionHistory(
  sessionStorage?: SessionStorage,
  sessionConfig?: SessionConfig
): Promise<Message[]> {
  if (!sessionStorage || !sessionConfig) {
    return [];
  }
  const messages = await sessionStorage.loadMessages(sessionConfig);
  logger.info(`📖 Session history restored: ${messages.length} messages`);
  return messages;
}
