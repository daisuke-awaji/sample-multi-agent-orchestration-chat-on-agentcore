/**
 * Violation Checker - Checks layer and circular dependency violations
 */

import * as fs from 'fs';
import * as path from 'path';
import type { LayerRule, Violation, Cycle, LayerEdge, ImportInfo } from './types';
import { extractImports } from './import-parser';
import { findTypeScriptFiles } from './file-scanner';

/**
 * Provider layer constraint constants
 * Provider layers (level -1) can only depend on types (L0) and config (L1)
 */
const PROVIDER_ALLOWED_LEVELS = [0, 1];
const PROVIDER_LEVEL = -1;

/**
 * Parsed file entry: relative path, resolved layer, and its imports
 */
export interface FileEntry {
  relPath: string;
  fromLayer: string;
  imports: ImportInfo[];
}

/**
 * Build import graph for a package — scans files exactly once.
 * Returns only entries whose layer is defined in rule.layers.
 */
export function buildImportGraph(rule: LayerRule, repoRoot: string): FileEntry[] {
  const srcDir = path.join(repoRoot, rule.srcRoot);
  const files = findTypeScriptFiles(srcDir);
  const entries: FileEntry[] = [];

  for (const file of files) {
    const relPath = path.relative(repoRoot, file);
    const fromLayer = rule.layerExtractor(relPath);
    if (!fromLayer || !(fromLayer in rule.layers)) continue;

    const content = fs.readFileSync(file, 'utf-8');
    const imports = extractImports(content);
    // content is no longer referenced after this point — eligible for GC
    entries.push({ relPath, fromLayer, imports });
  }

  return entries;
}

/**
 * Check for layer dependency violations using a pre-built import graph.
 */
export function checkLayerViolationsFromGraph(
  rule: LayerRule,
  repoRoot: string,
  graph: FileEntry[]
): Violation[] {
  const violations: Violation[] = [];

  for (const { relPath, fromLayer, imports } of graph) {
    const fromLevel = rule.layers[fromLayer];

    for (const imp of imports) {
      if (!imp.source.startsWith('.') && !imp.source.startsWith('..')) continue;

      const absFrom = path.resolve(repoRoot, relPath);
      const resolved = path.relative(repoRoot, path.resolve(path.dirname(absFrom), imp.source));
      const toLayer = rule.layerExtractor(resolved);
      if (!toLayer || !(toLayer in rule.layers) || toLayer === fromLayer) continue;

      const toLevel = rule.layers[toLayer];

      // Provider layer (-1) can depend on types (L0) and config (L1)
      if (fromLevel === PROVIDER_LEVEL && PROVIDER_ALLOWED_LEVELS.includes(toLevel)) {
        continue;
      }

      // Provider layer (-1) can be imported from any core layer
      if (toLevel === PROVIDER_LEVEL) {
        continue;
      }

      // Core layers: forward-only dependencies (lower level can import higher level)
      if (toLevel > fromLevel) {
        violations.push({
          file: relPath,
          importSource: imp.source,
          fromLayer,
          fromLevel,
          toLayer,
          toLevel,
          line: imp.line,
        });
      }
    }
  }

  return violations;
}

/**
 * Detect circular dependencies between layers using a pre-built import graph.
 */
export function detectCircularDependenciesFromGraph(
  rule: LayerRule,
  repoRoot: string,
  graph: FileEntry[]
): Cycle[] {
  const edgeMap = new Map<string, Map<string, Array<{ file: string; line: number }>>>();

  for (const { relPath, fromLayer, imports } of graph) {
    for (const imp of imports) {
      if (!imp.source.startsWith('.') && !imp.source.startsWith('..')) continue;

      const absFrom = path.resolve(repoRoot, relPath);
      const resolved = path.relative(repoRoot, path.resolve(path.dirname(absFrom), imp.source));
      const toLayer = rule.layerExtractor(resolved);
      if (!toLayer || !(toLayer in rule.layers) || toLayer === fromLayer) continue;

      if (!edgeMap.has(fromLayer)) edgeMap.set(fromLayer, new Map());
      const edges = edgeMap.get(fromLayer)!;
      if (!edges.has(toLayer)) edges.set(toLayer, []);
      edges.get(toLayer)!.push({ file: relPath, line: imp.line });
    }
  }

  const cycles: Cycle[] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const pathStack: string[] = [];

  function dfs(node: string) {
    visited.add(node);
    recStack.add(node);
    pathStack.push(node);

    for (const [neighbor] of edgeMap.get(node) ?? []) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recStack.has(neighbor)) {
        const start = pathStack.indexOf(neighbor);
        const cycle = [...pathStack.slice(start), neighbor];
        const cycleEdges: LayerEdge[] = [];
        for (let i = 0; i < cycle.length - 1; i++) {
          cycleEdges.push({
            from: cycle[i],
            to: cycle[i + 1],
            files: edgeMap.get(cycle[i])?.get(cycle[i + 1]) ?? [],
          });
        }
        cycles.push({ cycle, edges: cycleEdges });
      }
    }

    pathStack.pop();
    recStack.delete(node);
  }

  for (const layer of Object.keys(rule.layers)) {
    if (!visited.has(layer)) dfs(layer);
  }

  return cycles;
}

/**
 * Check for layer dependency violations in a package.
 * @deprecated Prefer buildImportGraph + checkLayerViolationsFromGraph to avoid duplicate file I/O.
 */
export function checkLayerViolations(rule: LayerRule, repoRoot: string): Violation[] {
  return checkLayerViolationsFromGraph(rule, repoRoot, buildImportGraph(rule, repoRoot));
}

/**
 * Detect circular dependencies between layers.
 * @deprecated Prefer buildImportGraph + detectCircularDependenciesFromGraph to avoid duplicate file I/O.
 */
export function detectCircularDependencies(rule: LayerRule, repoRoot: string): Cycle[] {
  return detectCircularDependenciesFromGraph(rule, repoRoot, buildImportGraph(rule, repoRoot));
}
