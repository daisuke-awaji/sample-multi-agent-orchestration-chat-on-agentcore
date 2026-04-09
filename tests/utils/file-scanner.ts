/**
 * File Scanner - Finds TypeScript files in directories
 */

import * as fs from 'fs';
import * as path from 'path';

const EXCLUDED_DIRS = ['node_modules', 'dist', 'tests', 'cdk.out'];
const TS_FILE_PATTERN = /\.tsx?$/;
const TEST_FILE_PATTERN = /\.(test|spec)\.ts$/;

/**
 * Recursively find all TypeScript files in a directory
 * Excludes node_modules, dist, tests directories and test files
 */
export function findTypeScriptFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.includes(entry.name)) continue;
      results.push(...findTypeScriptFiles(fullPath));
    } else if (TS_FILE_PATTERN.test(entry.name) && !TEST_FILE_PATTERN.test(entry.name)) {
      results.push(fullPath);
    }
  }

  return results;
}
