/**
 * Session configuration helper
 */

import { SessionPersistenceHook } from './session-persistence-hook.js';
import { createSessionStorage } from './index.js';
import type { SessionId } from '@moca/core';
import type { SessionConfig, SessionType } from './types.js';
import type { SessionPersistenceDeps } from '../../types/persistence-deps.js';

/**
 * Result of session setup
 */
export interface SessionSetupResult {
  config: SessionConfig;
  hook: SessionPersistenceHook;
}

/**
 * Options for session setup
 */
export interface SessionSetupOptions {
  actorId: string;
  sessionId: SessionId | undefined;
  sessionType?: SessionType;
  agentId?: string;
  storagePath?: string;
  deps: SessionPersistenceDeps;
}

// Initialize session storage once (shared across all sessions)
const sessionStorage = createSessionStorage();

/**
 * Setup session configuration and persistence hook.
 * @param options Session setup options
 * @returns Session configuration and hook, or null if no sessionId provided
 */
export function setupSession(options: SessionSetupOptions): SessionSetupResult | null {
  if (!options.sessionId) {
    return null;
  }

  const config: SessionConfig = {
    actorId: options.actorId,
    sessionId: options.sessionId,
    sessionType: options.sessionType,
  };
  const hook = new SessionPersistenceHook(
    sessionStorage,
    config,
    options.deps,
    options.agentId,
    options.storagePath
  );

  return { config, hook };
}

/**
 * Get the shared session storage instance
 */
export function getSessionStorage() {
  return sessionStorage;
}
