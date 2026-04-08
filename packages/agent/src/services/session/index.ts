/**
 * Exports for session management functionality
 */

import type { SessionStorage } from './types.js';
import { FileSessionStorage } from './file-session-storage.js';
import { AgentCoreMemoryStorage } from './agentcore-memory-storage.js';

export type { SessionConfig, SessionStorage } from './types.js';
export { FileSessionStorage } from './file-session-storage.js';
export { AgentCoreMemoryStorage } from './agentcore-memory-storage.js';
export { SessionPersistenceHook } from './session-persistence-hook.js';
export { retrieveLongTermMemory } from './memory-retriever.js';

/**
 * Create SessionStorage based on environment variables
 * Always uses AgentCore Memory if AGENTCORE_MEMORY_ID is set
 * @returns Appropriate SessionStorage instance
 */
export function createSessionStorage(): SessionStorage {
  const memoryId = process.env.AGENTCORE_MEMORY_ID;
  const region = process.env.AWS_REGION || 'us-east-1';

  if (!memoryId) {
    console.warn(
      '[SessionStorage] AGENTCORE_MEMORY_ID is not set, falling back to FileSessionStorage'
    );
    return new FileSessionStorage();
  }

  console.log(`[SessionStorage] Using AgentCore Memory: ${memoryId} (${region})`);
  return new AgentCoreMemoryStorage(memoryId, region);
}
