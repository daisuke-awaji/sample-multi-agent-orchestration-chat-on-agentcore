/**
 * Architecture Structural Test — Layer Dependency Validator
 *
 * Inspired by OpenAI's Harness Engineering approach:
 * "Each business domain is divided into a fixed set of layers,
 *  with strictly validated dependency directions and a limited set of permissible edges.
 *  These constraints are enforced mechanically via custom linters and structural tests."
 *
 * This test statically analyzes all TypeScript imports across the Moca monorepo
 * and fails if any violations of the defined layered architecture rules are detected.
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LayerRule {
  name: string;
  layers: Record<string, number>;
  srcRoot: string;
  layerExtractor: (filepath: string) => string | null;
}

interface PackageRule {
  name: string;
  allowedDeps: string[];
}

interface Violation {
  file: string;
  importSource: string;
  fromLayer: string;
  fromLevel: number;
  toLayer: string;
  toLevel: number;
  line: number;
}

interface PackageViolation {
  package: string;
  dependency: string;
}

interface LayerEdge {
  from: string;
  to: string;
  files: Array<{ file: string; line: number }>;
}

interface Cycle {
  cycle: string[];
  edges: LayerEdge[];
}

// ─── Repo Root ───────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '../..');

// ─── Layer Definitions ───────────────────────────────────────────────────────

const AGENT_LAYER_RULE: LayerRule = {
  name: 'packages/agent',
  layers: {
    config: 0, schemas: 0, validation: 0, prompts: 0,
    models: 1, utils: 1,
    context: 2, mcp: 2, middleware: 2,
    services: 3, session: 3,
    tools: 4,
    agent: 5,
    handlers: 6,
  },
  srcRoot: 'packages/agent/src',
  layerExtractor: (fp) => fp.match(/packages\/agent\/src\/([^/]+)/)?.[1] ?? null,
};

const BACKEND_LAYER_RULE: LayerRule = {
  name: 'packages/backend',
  layers: {
    config: 0, mcp: 0,
    utils: 1,
    middleware: 2,
    services: 3, data: 3,
    routes: 4,
  },
  srcRoot: 'packages/backend/src',
  layerExtractor: (fp) => fp.match(/packages\/backend\/src\/([^/]+)/)?.[1] ?? null,
};

const FRONTEND_LAYER_RULE: LayerRule = {
  name: 'packages/frontend',
  layers: {
    types: 0, config: 0, schemas: 0, locales: 0, i18n: 0,
    utils: 1, lib: 1,
    stores: 2, api: 2, hooks: 2,
    components: 3, layouts: 3,
    features: 4,
    pages: 5,
  },
  srcRoot: 'packages/frontend/src',
  layerExtractor: (fp) => fp.match(/packages\/frontend\/src\/([^/]+)/)?.[1] ?? null,
};

const ALL_LAYER_RULES = [AGENT_LAYER_RULE, BACKEND_LAYER_RULE, FRONTEND_LAYER_RULE];

// ─── Package Dependency Rules ────────────────────────────────────────────────

const PACKAGE_RULES: PackageRule[] = [
  { name: '@moca/core', allowedDeps: [] },
  { name: '@moca/generative-ui-catalog', allowedDeps: [] },
  { name: '@moca/s3-workspace-sync', allowedDeps: [] },
  { name: '@moca/tool-definitions', allowedDeps: ['@moca/generative-ui-catalog'] },
  {
    name: '@moca/agent',
    allowedDeps: ['@moca/core', '@moca/generative-ui-catalog', '@moca/s3-workspace-sync', '@moca/tool-definitions'],
  },
  { name: '@moca/backend', allowedDeps: ['@moca/core', '@moca/tool-definitions'] },
  { name: '@moca/client', allowedDeps: ['@moca/core'] },
  { name: '@moca/trigger', allowedDeps: ['@moca/core'] },
  { name: 'frontend', allowedDeps: ['@moca/core', '@moca/generative-ui-catalog'] },
  { name: '@moca/cdk', allowedDeps: [] },
  { name: '@moca/lambda-tools', allowedDeps: [] },
  { name: '@moca/session-stream-handler', allowedDeps: [] },
];

// ─── Import Parser ───────────────────────────────────────────────────────────

function extractImports(content: string): Array<{ source: string; line: number }> {
  const imports: Array<{ source: string; line: number }> = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const staticMatch = line.match(/(?:import|export)\s+.*?from\s+['"]([^'"]+)['"]/);
    if (staticMatch) {
      imports.push({ source: staticMatch[1], line: i + 1 });
      continue;
    }

    const reExportMatch = line.match(/export\s+\*\s+from\s+['"]([^'"]+)['"]/);
    if (reExportMatch) {
      imports.push({ source: reExportMatch[1], line: i + 1 });
      continue;
    }

    const dynamicMatch = line.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (dynamicMatch) {
      imports.push({ source: dynamicMatch[1], line: i + 1 });
    }
  }

  return imports;
}

// ─── File Scanner ────────────────────────────────────────────────────────────

function findTypeScriptFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'tests'].includes(entry.name)) continue;
      results.push(...findTypeScriptFiles(fullPath));
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.ts$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

// ─── Layer Violation Checker ─────────────────────────────────────────────────

function checkLayerViolations(rule: LayerRule): Violation[] {
  const violations: Violation[] = [];
  const srcDir = path.join(REPO_ROOT, rule.srcRoot);
  const files = findTypeScriptFiles(srcDir);

  for (const file of files) {
    const relPath = path.relative(REPO_ROOT, file);
    const fromLayer = rule.layerExtractor(relPath);
    if (!fromLayer || !(fromLayer in rule.layers)) continue;

    const fromLevel = rule.layers[fromLayer];
    const content = fs.readFileSync(file, 'utf-8');

    for (const imp of extractImports(content)) {
      if (!imp.source.startsWith('.') && !imp.source.startsWith('..')) continue;

      const resolved = path.relative(REPO_ROOT, path.resolve(path.dirname(file), imp.source));
      const toLayer = rule.layerExtractor(resolved);
      if (!toLayer || !(toLayer in rule.layers) || toLayer === fromLayer) continue;

      const toLevel = rule.layers[toLayer];
      if (toLevel > fromLevel) {
        violations.push({ file: relPath, importSource: imp.source, fromLayer, fromLevel, toLayer, toLevel, line: imp.line });
      }
    }
  }

  return violations;
}

// ─── Package Dependency Checker ──────────────────────────────────────────────

function checkPackageDependencies(): PackageViolation[] {
  const violations: PackageViolation[] = [];

  for (const rule of PACKAGE_RULES) {
    const pkgDir = rule.name === 'frontend'
      ? 'packages/frontend'
      : `packages/${rule.name.replace('@moca/', '')}`;

    let pkgJsonPath = path.join(REPO_ROOT, pkgDir, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) {
      pkgJsonPath = path.join(REPO_ROOT, 'packages', 'libs', rule.name.replace('@moca/', ''), 'package.json');
    }
    if (!fs.existsSync(pkgJsonPath)) continue;

    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    const allDeps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };

    for (const dep of Object.keys(allDeps)) {
      if (dep.startsWith('@moca/') && !rule.allowedDeps.includes(dep)) {
        violations.push({ package: rule.name, dependency: dep });
      }
    }
  }

  return violations;
}

// ─── Circular Dependency Checker ─────────────────────────────────────────────

function detectCircularDependencies(rule: LayerRule): Cycle[] {
  const graph = new Map<string, Map<string, Array<{ file: string; line: number }>>>();
  const srcDir = path.join(REPO_ROOT, rule.srcRoot);

  for (const file of findTypeScriptFiles(srcDir)) {
    const relPath = path.relative(REPO_ROOT, file);
    const fromLayer = rule.layerExtractor(relPath);
    if (!fromLayer || !(fromLayer in rule.layers)) continue;

    for (const imp of extractImports(fs.readFileSync(file, 'utf-8'))) {
      if (!imp.source.startsWith('.') && !imp.source.startsWith('..')) continue;

      const resolved = path.relative(REPO_ROOT, path.resolve(path.dirname(file), imp.source));
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
          edges.push({ from: cycle[i], to: cycle[i + 1], files: graph.get(cycle[i])?.get(cycle[i + 1]) ?? [] });
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

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatViolations(violations: Violation[]): string {
  const grouped = new Map<string, Violation[]>();
  for (const v of violations) {
    const key = `${v.fromLayer}(L${v.fromLevel}) → ${v.toLayer}(L${v.toLevel})`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(v);
  }

  const lines: string[] = [];
  for (const [direction, vs] of grouped) {
    lines.push(`\n  ${direction} (${vs.length} violation${vs.length > 1 ? 's' : ''}):`);
    for (const v of vs) {
      lines.push(`    ${v.file}:${v.line}  import '${v.importSource}'`);
    }
  }
  return lines.join('\n');
}

function formatCycles(cycles: Cycle[]): string {
  const lines: string[] = [];
  for (const { cycle, edges } of cycles) {
    lines.push(`\n  ${cycle.join(' → ')}:`);
    for (const edge of edges) {
      for (const f of edge.files.slice(0, 3)) {
        lines.push(`    ${edge.from} → ${edge.to}: ${f.file}:${f.line}`);
      }
      if (edge.files.length > 3) {
        lines.push(`    ... and ${edge.files.length - 3} more`);
      }
    }
  }
  return lines.join('\n');
}

function formatPackageViolations(violations: PackageViolation[]): string {
  return violations.map((v) => `  ${v.package} → ${v.dependency} (not allowed)`).join('\n');
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Architecture Structural Tests', () => {
  describe('Package Dependencies', () => {
    it('all packages depend only on allowed @moca/* packages', () => {
      const violations = checkPackageDependencies();
      if (violations.length > 0) {
        throw new Error(
          `${violations.length} disallowed package dependency(s) found:\n${formatPackageViolations(violations)}`
        );
      }
    });
  });

  describe('Circular Dependencies', () => {
    it.each(ALL_LAYER_RULES.map((r) => [r.name, r] as const))(
      '%s has no circular dependencies between layers',
      (_name, rule) => {
        const cycles = detectCircularDependencies(rule);
        if (cycles.length > 0) {
          throw new Error(
            `${cycles.length} circular dependency cycle(s) found:\n${formatCycles(cycles)}`
          );
        }
      }
    );
  });

  describe('Layer Violations', () => {
    it.each(ALL_LAYER_RULES.map((r) => [r.name, r] as const))(
      '%s has no upward layer imports',
      (_name, rule) => {
        const violations = checkLayerViolations(rule);
        if (violations.length > 0) {
          throw new Error(
            `${violations.length} layer violation(s) found:\n${formatViolations(violations)}`
          );
        }
      }
    );
  });
});
