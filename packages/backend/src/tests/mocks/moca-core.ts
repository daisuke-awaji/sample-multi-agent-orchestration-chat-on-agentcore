/**
 * Manual mock for @moca/core
 *
 * Jest with ts-jest ESM preset cannot resolve workspace-linked ESM packages.
 * This file provides the subset of @moca/core exports used by backend code.
 */

// Branded types (structurally just strings at runtime)
export type Brand<T, B extends string> = T & { readonly __brand: B };
export type UserId = Brand<string, 'UserId'>;
export type AgentId = Brand<string, 'AgentId'>;
export type SessionId = Brand<string, 'SessionId'>;

// UserId
export const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUserId(value: string): value is UserId {
  return USER_ID_PATTERN.test(value);
}
export function parseUserId(value: string): UserId {
  return value as UserId;
}

// AgentId
export const AGENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isAgentId(value: string): value is AgentId {
  return AGENT_ID_PATTERN.test(value);
}
export function parseAgentId(value: string): AgentId {
  return value as AgentId;
}

// SessionId
export const SESSION_ID_PATTERN = /^[a-zA-Z0-9]{33}$/;
export const SESSION_ID_LENGTH = 33;
export function isSessionId(value: string): value is SessionId {
  return SESSION_ID_PATTERN.test(value);
}
export function parseSessionId(value: string): SessionId {
  return value as SessionId;
}
export function generateSessionId(): SessionId {
  return 'a'.repeat(33) as SessionId;
}

// System IDs
export const SYSTEM_USER_ID: UserId = '00000000-0000-7000-0000-000000000000' as UserId;
export function isSystemUser(userId: UserId): boolean {
  return userId === SYSTEM_USER_ID;
}

// Crypto
export function getSecureRandomBytes(size: number): Uint8Array {
  return new Uint8Array(size);
}
