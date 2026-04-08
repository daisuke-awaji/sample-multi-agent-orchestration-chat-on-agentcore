/**
 * Workspace Sync Hook
 * Automatically synchronizes the local workspace with S3 after tool execution
 */

import { HookProvider, HookRegistry, AfterToolsEvent } from '@strands-agents/sdk';
import type { IWorkspaceSync } from '../models/workspace-sync-types.js';
import { logger } from '../config/index.js';

/**
 * Hook that synchronizes the workspace with S3 after tool execution
 */
export class WorkspaceSyncHook implements HookProvider {
  constructor(private readonly workspaceSync: IWorkspaceSync) {}

  /**
   * Register hook callbacks in the registry
   */
  registerCallbacks(registry: HookRegistry): void {
    // Sync to S3 after tool execution
    registry.addCallback(AfterToolsEvent, (event) => this.onAfterTools(event));
  }

  /**
   * Event handler after tool execution
   * Syncs after every tool execution since file operations may have occurred
   */
  private async onAfterTools(_event: AfterToolsEvent): Promise<void> {
    try {
      logger.info('[WORKSPACE_SYNC_HOOK] Triggering sync to S3 after tool execution...');

      // Run sync asynchronously (does not block the response)
      // Agent execution continues even if an error occurs
      this.workspaceSync.syncToS3().catch((error) => {
        logger.error('[WORKSPACE_SYNC_HOOK] Sync to S3 failed:', error);
      });
    } catch (error) {
      // Do not stop Agent execution even if an error occurs in the hook
      logger.warn('[WORKSPACE_SYNC_HOOK] Error in hook:', error);
    }
  }
}
