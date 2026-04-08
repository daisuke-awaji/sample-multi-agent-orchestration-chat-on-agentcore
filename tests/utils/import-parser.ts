/**
 * Import Parser - Extracts import statements from TypeScript source code
 */

import type { ImportInfo } from './types';

/**
 * Extract all import/export statements from TypeScript source code
 */
export function extractImports(content: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Static import/export: import { x } from 'y' or export { x } from 'y'
    const staticMatch = line.match(/(?:import|export)\s+.*?from\s+['"]([^'"]+)['"]/);
    if (staticMatch) {
      imports.push({ source: staticMatch[1], line: i + 1 });
      continue;
    }

    // Re-export: export * from 'y'
    const reExportMatch = line.match(/export\s+\*\s+from\s+['"]([^'"]+)['"]/);
    if (reExportMatch) {
      imports.push({ source: reExportMatch[1], line: i + 1 });
      continue;
    }

    // Dynamic import: import('y')
    const dynamicMatch = line.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (dynamicMatch) {
      imports.push({ source: dynamicMatch[1], line: i + 1 });
    }
  }

  return imports;
}
