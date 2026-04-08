/**
 * Architecture Structural Test — Layer Dependency Validator
 *
 * Inspired by OpenAI's Harness Engineering approach:
 * "Each business domain is divided into a fixed set of layers,
 *  with strictly validated dependency directions and a limited set of permissible edges."
 *
 * This script statically analyzes all TypeScript imports across the Moca monorepo
 * and reports any violations of the defined layered architecture rules.
 *
 * Usage: npx tsx tests/architecture/layer-dependency.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── ANSI Colors ─────────────────────────────────────────────────────────────
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

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
  rule: string;
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

// ─── Layer Definitions ───────────────────────────────────────────────────────

/**
 * packages/agent のレイヤー定義
 *
 * Layer 0: 基盤型 (config, schemas, validation, prompts)
 *   - 他の内部レイヤーに一切依存しない純粋な定義層
 *
 * Layer 1: ユーティリティ (models, utils)
 *   - Layer 0 のみに依存する汎用ロジック
 *
 * Layer 2: インフラ抽象 (context, mcp, middleware)
 *   - リクエストコンテキストやプロトコル抽象
 *
 * Layer 3: ビジネスロジック (services, session)
 *   - ドメインロジックとステート管理
 *
 * Layer 4: ツール定義 (tools)
 *   - エージェントが使用するツール群
 *
 * Layer 5: エージェント構成 (agent)
 *   - ツールとサービスを組み合わせてエージェントを構築
 *
 * Layer 6: エントリポイント (handlers)
 *   - 外部からのリクエストを受け付けるエントリポイント
 */
const AGENT_LAYER_RULE: LayerRule = {
  name: 'packages/agent',
  layers: {
    config: 0,
    schemas: 0,
    validation: 0,
    prompts: 0,
    models: 1,
    utils: 1,
    context: 2,
    mcp: 2,
    middleware: 2,
    services: 3,
    session: 3,
    tools: 4,
    agent: 5,
    handlers: 6,
  },
  srcRoot: 'packages/agent/src',
  layerExtractor: (filepath: string) => {
    const match = filepath.match(/packages\/agent\/src\/([^/]+)/);
    return match ? match[1] : null;
  },
};

/**
 * packages/backend のレイヤー定義
 *
 * Layer 0: 基盤 (config, mcp)
 * Layer 1: ユーティリティ (utils)
 * Layer 2: ミドルウェア (middleware)
 * Layer 3: ビジネスロジック (services, data)
 * Layer 4: エントリポイント (routes)
 */
const BACKEND_LAYER_RULE: LayerRule = {
  name: 'packages/backend',
  layers: {
    config: 0,
    mcp: 0,
    utils: 1,
    middleware: 2,
    services: 3,
    data: 3,
    routes: 4,
  },
  srcRoot: 'packages/backend/src',
  layerExtractor: (filepath: string) => {
    const match = filepath.match(/packages\/backend\/src\/([^/]+)/);
    return match ? match[1] : null;
  },
};

/**
 * packages/frontend のレイヤー定義
 *
 * Layer 0: 型・設定 (types, config, schemas, locales, i18n)
 * Layer 1: ユーティリティ (utils, lib)
 * Layer 2: 状態管理・API (stores, api, hooks)
 * Layer 3: UIコンポーネント (components, layouts)
 * Layer 4: フィーチャー (features)
 * Layer 5: ページ (pages)
 */
const FRONTEND_LAYER_RULE: LayerRule = {
  name: 'packages/frontend',
  layers: {
    types: 0,
    config: 0,
    schemas: 0,
    locales: 0,
    i18n: 0,
    utils: 1,
    lib: 1,
    stores: 2,
    api: 2,
    hooks: 2,
    components: 3,
    layouts: 3,
    features: 4,
    pages: 5,
  },
  srcRoot: 'packages/frontend/src',
  layerExtractor: (filepath: string) => {
    const match = filepath.match(/packages\/frontend\/src\/([^/]+)/);
    return match ? match[1] : null;
  },
};

// ─── Package Dependency Rules ────────────────────────────────────────────────

/**
 * パッケージ間の許可された依存方向
 *
 * libs (core, tool-definitions, etc.) は最下位のパッケージ群。
 * agent, backend, frontend は libs にのみ依存し、互いに依存してはならない。
 */
const PACKAGE_RULES: PackageRule[] = [
  // Libs — 互いに依存しないのが理想
  { name: '@moca/core', allowedDeps: [] },
  { name: '@moca/generative-ui-catalog', allowedDeps: [] },
  { name: '@moca/s3-workspace-sync', allowedDeps: [] },
  { name: '@moca/tool-definitions', allowedDeps: ['@moca/generative-ui-catalog'] },
  // Application packages — libs にのみ依存可能
  {
    name: '@moca/agent',
    allowedDeps: [
      '@moca/core',
      '@moca/generative-ui-catalog',
      '@moca/s3-workspace-sync',
      '@moca/tool-definitions',
    ],
  },
  { name: '@moca/backend', allowedDeps: ['@moca/core', '@moca/tool-definitions'] },
  { name: '@moca/client', allowedDeps: ['@moca/core'] },
  { name: '@moca/trigger', allowedDeps: ['@moca/core'] },
  { name: 'frontend', allowedDeps: ['@moca/core', '@moca/generative-ui-catalog'] },
  // Infra & standalone — @moca/* に依存しない
  { name: '@moca/cdk', allowedDeps: [] },
  { name: '@moca/lambda-tools', allowedDeps: [] },
  { name: '@moca/session-stream-handler', allowedDeps: [] },
];

// ─── Import Parser ───────────────────────────────────────────────────────────

/**
 * TypeScript ファイルから import 文を抽出する
 * 静的 import と動的 import() の両方を検出
 */
function extractImports(
  content: string
): Array<{ source: string; line: number }> {
  const imports: Array<{ source: string; line: number }> = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Static imports: import ... from '...'
    const staticMatch = line.match(
      /(?:import|export)\s+.*?from\s+['"]([^'"]+)['"]/
    );
    if (staticMatch) {
      imports.push({ source: staticMatch[1], line: i + 1 });
      continue;
    }

    // Re-exports: export * from '...'
    const reExportMatch = line.match(/export\s+\*\s+from\s+['"]([^'"]+)['"]/);
    if (reExportMatch) {
      imports.push({ source: reExportMatch[1], line: i + 1 });
      continue;
    }

    // Dynamic imports: import('...')  or await import('...')
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
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'tests') {
        continue;
      }
      results.push(...findTypeScriptFiles(fullPath));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      if (!entry.name.endsWith('.test.ts') && !entry.name.endsWith('.spec.ts')) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

// ─── Layer Violation Checker ─────────────────────────────────────────────────

function checkLayerViolations(
  rule: LayerRule,
  repoRoot: string
): Violation[] {
  const violations: Violation[] = [];
  const srcDir = path.join(repoRoot, rule.srcRoot);
  const files = findTypeScriptFiles(srcDir);

  for (const file of files) {
    const relPath = path.relative(repoRoot, file);
    const fromLayer = rule.layerExtractor(relPath);
    if (!fromLayer || !(fromLayer in rule.layers)) continue;

    const fromLevel = rule.layers[fromLayer];
    const content = fs.readFileSync(file, 'utf-8');
    const imports = extractImports(content);

    for (const imp of imports) {
      // Only check relative imports (internal layer references)
      if (!imp.source.startsWith('.') && !imp.source.startsWith('..')) continue;

      // Resolve the import path relative to the file
      const resolvedImport = path.resolve(path.dirname(file), imp.source);
      const relResolved = path.relative(repoRoot, resolvedImport);
      const toLayer = rule.layerExtractor(relResolved);

      if (!toLayer || !(toLayer in rule.layers)) continue;
      if (toLayer === fromLayer) continue; // Same layer is OK

      const toLevel = rule.layers[toLayer];

      // Violation: importing from a HIGHER layer (larger number)
      if (toLevel > fromLevel) {
        violations.push({
          rule: rule.name,
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

// ─── Package Dependency Checker ──────────────────────────────────────────────

function checkPackageDependencies(repoRoot: string): PackageViolation[] {
  const violations: PackageViolation[] = [];

  for (const rule of PACKAGE_RULES) {
    const pkgDir = rule.name === 'frontend'
      ? 'packages/frontend'
      : rule.name.startsWith('@moca/libs/')
        ? `packages/libs/${rule.name.replace('@moca/', '')}`
        : `packages/${rule.name.replace('@moca/', '')}`;

    // Check both packages/ and packages/libs/
    let pkgJsonPath = path.join(repoRoot, pkgDir, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) {
      pkgJsonPath = path.join(repoRoot, 'packages', 'libs', rule.name.replace('@moca/', ''), 'package.json');
    }
    if (!fs.existsSync(pkgJsonPath)) continue;

    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    const allDeps = {
      ...pkgJson.dependencies,
      ...pkgJson.devDependencies,
    };

    for (const dep of Object.keys(allDeps)) {
      if (dep.startsWith('@moca/') && !rule.allowedDeps.includes(dep)) {
        violations.push({
          package: rule.name,
          dependency: dep,
        });
      }
    }
  }

  return violations;
}

// ─── Circular Dependency Checker ─────────────────────────────────────────────

interface LayerEdge {
  from: string;
  to: string;
  files: Array<{ file: string; line: number }>;
}

function detectCircularDependencies(
  rule: LayerRule,
  repoRoot: string
): Array<{ cycle: string[]; edges: LayerEdge[] }> {
  // Build a directed graph of layer → layer dependencies
  const graph = new Map<string, Map<string, Array<{ file: string; line: number }>>>();
  const srcDir = path.join(repoRoot, rule.srcRoot);
  const files = findTypeScriptFiles(srcDir);

  for (const file of files) {
    const relPath = path.relative(repoRoot, file);
    const fromLayer = rule.layerExtractor(relPath);
    if (!fromLayer || !(fromLayer in rule.layers)) continue;

    const content = fs.readFileSync(file, 'utf-8');
    const imports = extractImports(content);

    for (const imp of imports) {
      if (!imp.source.startsWith('.') && !imp.source.startsWith('..')) continue;

      const resolvedImport = path.resolve(path.dirname(file), imp.source);
      const relResolved = path.relative(repoRoot, resolvedImport);
      const toLayer = rule.layerExtractor(relResolved);

      if (!toLayer || !(toLayer in rule.layers) || toLayer === fromLayer) continue;

      if (!graph.has(fromLayer)) graph.set(fromLayer, new Map());
      const edges = graph.get(fromLayer)!;
      if (!edges.has(toLayer)) edges.set(toLayer, []);
      edges.get(toLayer)!.push({ file: relPath, line: imp.line });
    }
  }

  // Detect cycles using DFS
  const cycles: Array<{ cycle: string[]; edges: LayerEdge[] }> = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const pathStack: string[] = [];

  function dfs(node: string) {
    visited.add(node);
    recStack.add(node);
    pathStack.push(node);

    const neighbors = graph.get(node);
    if (neighbors) {
      for (const [neighbor] of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor);
        } else if (recStack.has(neighbor)) {
          // Found a cycle
          const cycleStart = pathStack.indexOf(neighbor);
          const cycle = [...pathStack.slice(cycleStart), neighbor];
          const edges: LayerEdge[] = [];
          for (let i = 0; i < cycle.length - 1; i++) {
            const from = cycle[i];
            const to = cycle[i + 1];
            const edgeFiles = graph.get(from)?.get(to) || [];
            edges.push({ from, to, files: edgeFiles });
          }
          cycles.push({ cycle, edges });
        }
      }
    }

    pathStack.pop();
    recStack.delete(node);
  }

  for (const layer of Object.keys(rule.layers)) {
    if (!visited.has(layer)) {
      dfs(layer);
    }
  }

  return cycles;
}

// ─── Report Generator ────────────────────────────────────────────────────────

function generateLayerNames(layers: Record<string, number>): string[] {
  const maxLevel = Math.max(...Object.values(layers));
  const result: string[] = [];
  for (let i = 0; i <= maxLevel; i++) {
    const names = Object.entries(layers)
      .filter(([, level]) => level === i)
      .map(([name]) => name);
    result.push(`L${i}: ${names.join('/')}`);
  }
  return result;
}

function printReport(
  layerViolations: Map<string, Violation[]>,
  packageViolations: PackageViolation[],
  circularDeps: Map<string, Array<{ cycle: string[]; edges: LayerEdge[] }>>,
) {
  console.log(`\n${BOLD}${'═'.repeat(70)}${RESET}`);
  console.log(`${BOLD}  🏗️  Moca Architecture Structural Test Report${RESET}`);
  console.log(`${BOLD}${'═'.repeat(70)}${RESET}\n`);

  let totalViolations = 0;

  // ── 1. Package Dependency Check ──
  console.log(`${BOLD}📦 Package Dependency Rules${RESET}`);
  console.log(`${'─'.repeat(50)}`);
  if (packageViolations.length === 0) {
    console.log(`  ${GREEN}✅ All package dependencies are within allowed boundaries${RESET}\n`);
  } else {
    for (const v of packageViolations) {
      console.log(`  ${RED}❌ ${v.package} → ${v.dependency} (not in allowed list)${RESET}`);
      totalViolations++;
    }
    console.log();
  }

  // ── 2. Circular Dependencies ──
  console.log(`${BOLD}🔄 Circular Dependency Detection${RESET}`);
  console.log(`${'─'.repeat(50)}`);
  let hasCircular = false;
  for (const [ruleName, cycles] of circularDeps) {
    if (cycles.length > 0) {
      hasCircular = true;
      for (const { cycle, edges } of cycles) {
        console.log(`  ${RED}❌ ${ruleName}: ${cycle.join(' → ')}${RESET}`);
        totalViolations++;
        for (const edge of edges) {
          console.log(`     ${DIM}${edge.from} → ${edge.to}:${RESET}`);
          for (const f of edge.files.slice(0, 3)) {
            console.log(`       ${DIM}${f.file}:${f.line}${RESET}`);
          }
          if (edge.files.length > 3) {
            console.log(`       ${DIM}... and ${edge.files.length - 3} more${RESET}`);
          }
        }
      }
    }
  }
  if (!hasCircular) {
    console.log(`  ${GREEN}✅ No circular dependencies detected${RESET}`);
  }
  console.log();

  // ── 3. Layer Violations per package ──
  for (const [ruleName, violations] of layerViolations) {
    console.log(`${BOLD}📐 Layer Violations: ${ruleName}${RESET}`);
    console.log(`${'─'.repeat(50)}`);

    if (violations.length === 0) {
      console.log(`  ${GREEN}✅ No layer violations${RESET}\n`);
      continue;
    }

    // Group by fromLayer → toLayer
    const grouped = new Map<string, Violation[]>();
    for (const v of violations) {
      const key = `${v.fromLayer}(L${v.fromLevel}) → ${v.toLayer}(L${v.toLevel})`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(v);
    }

    for (const [direction, vs] of grouped) {
      console.log(`\n  ${RED}❌ ${direction}${RESET} ${YELLOW}(${vs.length} violation${vs.length > 1 ? 's' : ''})${RESET}`);
      totalViolations += vs.length;
      for (const v of vs) {
        console.log(`     ${DIM}${v.file}:${v.line}${RESET}`);
        console.log(`       ${DIM}import ... from '${v.importSource}'${RESET}`);
      }
    }
    console.log();
  }

  // ── Summary ──
  console.log(`${BOLD}${'═'.repeat(70)}${RESET}`);
  if (totalViolations === 0) {
    console.log(`${GREEN}${BOLD}  ✅ ALL CHECKS PASSED — No architecture violations detected${RESET}`);
  } else {
    console.log(`${RED}${BOLD}  ❌ ${totalViolations} ARCHITECTURE VIOLATION${totalViolations > 1 ? 'S' : ''} DETECTED${RESET}`);
    console.log();
    console.log(`${CYAN}  Remediation guidance:${RESET}`);
    console.log(`  • Upward layer imports → Move shared logic to a lower layer or use dependency injection`);
    console.log(`  • Circular dependencies → Extract shared types/interfaces into a separate lower layer`);
    console.log(`  • Package violations → Check if the dependency belongs in a shared lib`);
  }
  console.log(`${BOLD}${'═'.repeat(70)}${RESET}\n`);

  return totalViolations;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const repoRoot = path.resolve(__dirname, '../..');
  console.log(`${DIM}Repo root: ${repoRoot}${RESET}`);
  console.log(`${DIM}Scanning TypeScript files...${RESET}`);

  // Layer rules to check
  const layerRules = [AGENT_LAYER_RULE, BACKEND_LAYER_RULE, FRONTEND_LAYER_RULE];

  // Run checks
  const layerViolations = new Map<string, Violation[]>();
  const circularDeps = new Map<string, Array<{ cycle: string[]; edges: LayerEdge[] }>>();

  for (const rule of layerRules) {
    const srcDir = path.join(repoRoot, rule.srcRoot);
    const fileCount = findTypeScriptFiles(srcDir).length;
    console.log(`${DIM}  ${rule.name}: ${fileCount} files${RESET}`);

    layerViolations.set(rule.name, checkLayerViolations(rule, repoRoot));
    circularDeps.set(rule.name, detectCircularDependencies(rule, repoRoot));
  }

  const packageViolations = checkPackageDependencies(repoRoot);

  // Print report
  const totalViolations = printReport(layerViolations, packageViolations, circularDeps);

  // Print layer definitions for reference
  console.log(`${DIM}Layer definitions used:${RESET}`);
  for (const rule of layerRules) {
    console.log(`${DIM}  ${rule.name}: ${generateLayerNames(rule.layers).join(' → ')}${RESET}`);
  }
  console.log();

  process.exit(totalViolations > 0 ? 1 : 0);
}

main();
