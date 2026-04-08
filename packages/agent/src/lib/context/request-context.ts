/**
 * Request Context Management
 * Request-scoped context management
 */

import { AsyncLocalStorage } from 'async_hooks';
import { v7 as uuidv7 } from 'uuid';
import type { SessionId } from '@moca/core';
import type { IWorkspaceSync } from '../../types/workspace-sync.js';
import type { SessionType } from '../../types/session.js';

/**
 * Type definition for request context
 */
export interface RequestContext {
  /** Authorization header (JWT Bearer Token) */
  authorizationHeader?: string;
  /** User ID (can be extracted from JWT) */
  userId?: string;
  /** S3 directory path selected by the user */
  storagePath?: string;
  /** Workspace sync service */
  workspaceSync?: IWorkspaceSync;
  /** Request-specific ID (for log tracing) */
  requestId: string;
  /** Request start time */
  startTime: Date;
  /** Whether this is a machine user (Client Credentials Flow) */
  isMachineUser: boolean;
  /** Client ID (for machine users) */
  clientId?: string;
  /** OAuth scopes */
  scopes?: string[];
  /** Session ID (from x-amzn-bedrock-agentcore-runtime-session-id header) — validated Branded type */
  sessionId?: SessionId;
  /** Session type (from x-amzn-bedrock-agentcore-runtime-session-type header) */
  sessionType?: SessionType;
}

/**
 * Type definition for context metadata
 */
export interface ContextMetadata {
  /** Request-specific ID */
  requestId: string;
  /** User ID (if present) */
  userId?: string;
  /** Whether authentication header is present */
  hasAuth: boolean;
  /** Request processing time (in milliseconds) */
  duration: number;
}

/**
 * Request context management using AsyncLocalStorage
 * Propagate authentication information in Express request scope
 */
export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current request context
 */
export function getCurrentContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

/**
 * Get the Authorization header of the current request
 */
export function getCurrentAuthHeader(): string | undefined {
  const context = getCurrentContext();
  return context?.authorizationHeader;
}

/**
 * Get the storage path of the current request
 */
export function getCurrentStoragePath(): string {
  const context = getCurrentContext();
  return context?.storagePath || '/';
}

/**
 * Create a new request context
 */
export function createRequestContext(authorizationHeader?: string): RequestContext {
  return {
    authorizationHeader,
    requestId: uuidv7(),
    startTime: new Date(),
    isMachineUser: false,
  };
}

/**
 * Execute a callback function with request context
 */
export function runWithContext<T>(context: RequestContext, callback: () => T): T {
  return requestContextStorage.run(context, callback);
}

/**
 * Get metadata for request context logging
 */
export function getContextMetadata(): ContextMetadata {
  const context = getCurrentContext();
  if (!context) {
    return {
      requestId: 'unknown',
      hasAuth: false,
      duration: 0,
    };
  }

  return {
    requestId: context.requestId,
    userId: context.userId,
    hasAuth: !!context.authorizationHeader,
    duration: Date.now() - context.startTime.getTime(),
  };
}
