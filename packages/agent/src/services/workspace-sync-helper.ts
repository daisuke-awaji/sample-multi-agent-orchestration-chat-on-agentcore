/**
 * Workspace sync initialization helper
 */

import { WorkspaceSync } from './workspace-sync.js';
import { WorkspaceSyncHook } from '../session/workspace-sync-hook.js';
import type { RequestContext } from '../context/request-context.js';
import { logger } from '../config/index.js';

/**
 * Result of workspace sync initialization
 */
export interface WorkspaceSyncResult {
  workspaceSync: WorkspaceSync;
  hook: WorkspaceSyncHook;
}

/**
 * Validate storage path for security
 * Prevents path traversal attacks and ensures only safe characters are used
 * @param storagePath Path to validate
 * @throws Error if path is invalid
 */
export function validateStoragePath(storagePath: string): void {
  // Check for path traversal sequences
  if (storagePath.includes('..')) {
    throw new Error("Invalid storage path: path traversal sequences ('..') are not allowed");
  }

  // Check for null bytes (potential injection attack)
  if (storagePath.includes('\0')) {
    throw new Error('Invalid storage path: null bytes are not allowed');
  }

  // Only allow safe characters: alphanumeric, hyphen, underscore, forward slash, dot (for file extensions)
  // Dot is allowed but '..' is already blocked above
  if (!/^[a-zA-Z0-9\-_/.]*$/.test(storagePath)) {
    throw new Error(
      'Invalid storage path: only alphanumeric characters, hyphens, underscores, dots, and forward slashes are allowed'
    );
  }

  // Prevent protocol-relative paths that could redirect to external systems
  if (storagePath.startsWith('//')) {
    throw new Error('Invalid storage path: protocol-relative paths are not allowed');
  }

  // Check for excessive path depth (potential DoS or confusion attack)
  const depth = storagePath.split('/').filter((p) => p.length > 0).length;
  if (depth > 50) {
    throw new Error('Invalid storage path: path depth exceeds maximum allowed (50)');
  }
}

/**
 * Initialize workspace sync if conditions are met
 * @param actorId User ID
 * @param storagePath S3 storage path
 * @param context Request context to attach workspace sync
 * @returns WorkspaceSync instance and hook, or null if not initialized
 */
export function initializeWorkspaceSync(
  actorId: string,
  storagePath: string | undefined,
  context?: RequestContext
): WorkspaceSyncResult | null {
  // Only initialize if storagePath is provided and user is authenticated
  if (!storagePath || actorId === 'anonymous') {
    return null;
  }

  // Validate storage path for security
  validateStoragePath(storagePath);

  const workspaceSync = new WorkspaceSync(actorId, storagePath);

  // Start initial sync asynchronously (don't await)
  workspaceSync.startInitialSync();

  // Set WorkspaceSync in context (accessible from tools)
  if (context) {
    context.workspaceSync = workspaceSync;
  }

  // Create WorkspaceSyncHook
  const hook = new WorkspaceSyncHook(workspaceSync);

  logger.info('🔄 Initialized workspace sync:', { actorId, storagePath });

  return { workspaceSync, hook };
}
