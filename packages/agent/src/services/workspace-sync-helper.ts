/**
 * Workspace sync initialization helper
 */

import { WorkspaceSync } from './workspace-sync.js';
import { validateStoragePath } from '@moca/s3-workspace-sync';
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

// Re-export for backward compatibility
export { validateStoragePath };

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

  logger.info('Initialized workspace sync:', { actorId, storagePath });

  return { workspaceSync, hook };
}
