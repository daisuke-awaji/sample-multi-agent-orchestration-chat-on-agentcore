/**
 * @moca/core — Core types, branded IDs, and shared utilities for Moca
 *
 * @example
 * ```ts
 * import { generateSessionId, parseSessionId, isSessionId } from '@moca/core';
 * import type { SessionId, Brand } from '@moca/core';
 *
 * // Generate a new session ID
 * const id: SessionId = generateSessionId();
 *
 * // Validate external input
 * const parsed: SessionId = parseSessionId(headerValue);
 *
 * // Type guard
 * if (isSessionId(unknownValue)) { ... }
 * ```
 */

// Branded Type infrastructure
export type { Brand } from './branded.js';

// SessionId
export type { SessionId } from './session-id.js';
export {
  generateSessionId,
  isSessionId,
  parseSessionId,
  SESSION_ID_LENGTH,
  SESSION_ID_PATTERN,
} from './session-id.js';

// Crypto utilities
export { getSecureRandomBytes } from './crypto.js';
