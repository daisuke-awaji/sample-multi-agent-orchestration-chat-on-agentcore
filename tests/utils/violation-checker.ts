/**
 * Violation Checker - Checks layer and circular dependency violations
 */

import * as fs from 'fs';
import * as path from 'path';
import type { LayerRule, Violation, Cycle, LayerEdge } from './types';
import { extractImports } from './import-parser';
import { findTypeScriptFiles } from './file-scanner';

/**
 * Provider layer constraint constants
 * Provider layers (level -1) can only depend on types (L0) and config (L1)
 */
const PROVIDER_ALLOWED_LEVELS = [0, 1];
const PROVIDER_LEVEL = -1;

/**
 * Check for layer dependency violations in a package
 */
export function checkLayerViolations(rule: LayerRule, repoRoot: string): Violation[] {
  const violations: Violation[] = [];
  const srcDir = path.join(repoRoot, rule.srcRoot);
  const files = findTypeScriptFiles(srcDir);

  for (const file of files) {
    const relPath = path.relative(repoRoot, file);
    const fromLayer = rule.layerExtractor(relPath);
    if (!fromLayer || !(fromLayer in rule.layers)) continue;

    const fromLevel = rule.layers[fromLayer];
    const content = fs.readFileSync(file, 'utf-8');

    for (const imp of extractImports(content)) {
      if (!imp.source.startsWith('.') && !imp.source.startsWith('..')) continue;

      const resolved = path.relative(repoRoot, path.resolve(path.dirname(file), imp.source));
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
 * Detect circular dependencies between layers
 */
export function detectCircularDependencies(rule: LayerRule, repoRoot: string): Cycle[] {
  const graph = new Map<string, Map<string, Array<{ file: string; line: number }>>>();
  const srcDir = path.join(repoRoot, rule.srcRoot);

  for (const file of findTypeScriptFiles(srcDir)) {
    const relPath = path.relative(repoRoot, file);
    const fromLayer = rule.layerExtractor(relPath);
    if (!fromLayer || !(fromLayer in rule.layers)) continue;

    for (const imp of extractImports(fs.readFileSync(file, 'utf-8'))) {
      if (!imp.source.startsWith('.') && !imp.source.startsWith('..')) continue;

      const resolved = path.relative(repoRoot, path.resolve(path.dirname(file), imp.source));
      const toLayer = rule.layerExtractor(resolved);
      if (!toLayer || !(toLayer in rule.layers) || toLayer === fromLayer) continue;

      if (!graph.has(fromLayer)) graph.set(fromLayer, new Map());
      const edges = graph.get(fromLayer)!;
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

    for (const [neighbor] of graph.get(node) ?? []) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recStack.has(neighbor)) {
        const start = pathStack.indexOf(neighbor);
        const cycle = [...pathStack.slice(start), neighbor];
        const edges: LayerEdge[] = [];
        for (let i = 0; i < cycle.length - 1; i++) {
          edges.push({
            from: cycle[i],
            to: cycle[i + 1],
            files: graph.get(cycle[i])?.get(cycle[i + 1]) ?? [],
          });
        }
        cycles.push({ cycle, edges });
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
