/**
 * Workspace Sync Service
 * Thin adapter over @moca/s3-workspace-sync that maps
 * the agent-specific (userId, storagePath) convention to the generic package API.
 *
 * The local workspace directory includes the storagePath as a subdirectory
 * (e.g., storagePath="/dev2" → workspaceDir="/tmp/ws/dev2") so that local
 * filesystem paths align with S3 display paths after stripping WORKSPACE_DIRECTORY.
 */

import path from 'path';
import { S3WorkspaceSync } from '@moca/s3-workspace-sync';
import type { SyncResult } from '@moca/s3-workspace-sync';
import { logger, WORKSPACE_DIRECTORY } from '../config/index.js';

export type { SyncResult };

/**
 * Agent-specific workspace sync wrapper.
 *
 * Maps `(userId, storagePath)` to an S3 prefix of the form
 * `users/{userId}/{storagePath}/` and syncs files into
 * `WORKSPACE_DIRECTORY/{storagePath}/` so that stripping WORKSPACE_DIRECTORY
 * from any local path yields a valid S3 display path.
 */
export class WorkspaceSync {
  private readonly inner: S3WorkspaceSync;
  private readonly activeWorkingDirectory: string;

  constructor(userId: string, storagePath: string) {
    const bucketName = process.env.USER_STORAGE_BUCKET_NAME || '';
    const normalizedPath = storagePath.replace(/^\/+|\/+$/g, '');
    const prefix = normalizedPath ? `users/${userId}/${normalizedPath}/` : `users/${userId}/`;

    const workspaceDir = normalizedPath
      ? path.join(WORKSPACE_DIRECTORY, normalizedPath)
      : WORKSPACE_DIRECTORY;

    this.activeWorkingDirectory = workspaceDir;

    this.inner = new S3WorkspaceSync({
      bucket: bucketName,
      prefix,
      workspaceDir,
      region: process.env.AWS_REGION,
      logger,
    });
  }

  /**
   * Start initial sync in the background (non-blocking).
   */
  startInitialSync(): void {
    this.inner.startBackgroundPull();
  }

  /**
   * Wait for the initial sync to complete.
   */
  async waitForInitialSync(): Promise<void> {
    await this.inner.waitForPull();
  }

  /**
   * Upload local changes to S3 (diff-based).
   */
  async syncToS3(): Promise<SyncResult> {
    return this.inner.push();
  }

  /**
   * Get the workspace directory path.
   */
  getWorkspacePath(): string {
    return this.inner.getWorkspacePath();
  }

  /**
   * Get the active working directory path (where files are synced).
   * e.g., "/tmp/ws/dev2" when storagePath is "/dev2", "/tmp/ws" when storagePath is "/".
   */
  getActiveWorkingDirectory(): string {
    return this.activeWorkingDirectory;
  }
}
