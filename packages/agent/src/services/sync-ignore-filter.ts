/**
 * Sync Ignore Filter
 * .gitignore style pattern matching for workspace sync exclusions
 */

import ignore, { Ignore } from 'ignore';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../config/index.js';

/**
 * Default ignore patterns
 * Applied even when .syncignore file doesn't exist
 */
const DEFAULT_PATTERNS = [
  // System files
  '.DS_Store',
  'Thumbs.db',
  '*.swp',
  '*.swo',
  '*~',

  // Build artifacts
  'node_modules/',
  '__pycache__/',
  '*.pyc',
  '.gradle/',
  'build/',
  'dist/',
  'target/',

  // IDE settings
  '.idea/',
  '.vscode/',
  '*.iml',

  // Log files
  '*.log',
  'logs/',

  // Temporary files
  '*.tmp',
  '*.temp',
  '.cache/',

  // Sync configuration itself
  '.syncignore',
];

/**
 * Sync Ignore Filter
 * Provides .gitignore-style pattern matching for file exclusion
 */
export class SyncIgnoreFilter {
  private ig: Ignore;
  private customPatternsLoaded = false;

  constructor() {
    this.ig = ignore();
    this.loadDefaultPatterns();
  }

  /**
   * Load default ignore patterns
   */
  private loadDefaultPatterns(): void {
    this.ig.add(DEFAULT_PATTERNS);
    logger.debug(`[SYNC_IGNORE] Loaded ${DEFAULT_PATTERNS.length} default patterns`);
  }

  /**
   * Load custom patterns from .syncignore file
   * @param workspaceDir - Workspace directory path
   */
  loadFromWorkspace(workspaceDir: string): void {
    const syncignorePath = path.join(workspaceDir, '.syncignore');

    if (!fs.existsSync(syncignorePath)) {
      logger.debug('[SYNC_IGNORE] No .syncignore file found, using defaults only');
      return;
    }

    try {
      const content = fs.readFileSync(syncignorePath, 'utf-8');
      const patterns = content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#')); // Remove empty lines and comments

      if (patterns.length > 0) {
        this.ig.add(patterns);
        this.customPatternsLoaded = true;
        logger.info(`[SYNC_IGNORE] Loaded ${patterns.length} custom patterns from .syncignore`);
      }
    } catch (error) {
      logger.warn(`[SYNC_IGNORE] Failed to load .syncignore: ${error}`);
    }
  }

  /**
   * Check if a file should be ignored
   * @param relativePath - Relative path from workspace root
   * @returns true if the file should be ignored
   */
  isIgnored(relativePath: string): boolean {
    // Normalize path separators for cross-platform compatibility
    const normalizedPath = relativePath.replace(/\\/g, '/');
    return this.ig.ignores(normalizedPath);
  }

  /**
   * Filter an array of paths, removing ignored ones
   * @param paths - Array of relative paths
   * @returns Filtered array with ignored paths removed
   */
  filter(paths: string[]): string[] {
    return paths.filter((p) => !this.isIgnored(p));
  }

  /**
   * Get information about loaded patterns
   */
  getInfo(): {
    defaultPatternsCount: number;
    customPatternsLoaded: boolean;
  } {
    return {
      defaultPatternsCount: DEFAULT_PATTERNS.length,
      customPatternsLoaded: this.customPatternsLoaded,
    };
  }
}
