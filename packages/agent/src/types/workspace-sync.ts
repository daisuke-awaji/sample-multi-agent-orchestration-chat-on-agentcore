/**
 * WorkspaceSync interface definition
 *
 * Extracted to models/ (L1) so that context/ and middleware/ (L2)
 * can reference the type without depending on services/ (L3).
 *
 * The concrete WorkspaceSync class in services/ structurally implements
 * this interface.
 */

import type { SyncResult } from '@moca/s3-workspace-sync';

export type { SyncResult };

export interface IWorkspaceSync {
  startInitialSync(): void;
  waitForInitialSync(): Promise<void>;
  syncToS3(): Promise<SyncResult>;
  getWorkspacePath(): string;
  getActiveWorkingDirectory(): string;
}
