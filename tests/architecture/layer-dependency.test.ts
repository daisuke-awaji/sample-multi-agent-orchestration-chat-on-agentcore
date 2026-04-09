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

import * as path from 'path';
import type { LayerRule, PackageRule } from '../utils/types';
import type { FileEntry } from '../utils/violation-checker';
import {
  buildImportGraph,
  checkLayerViolationsFromGraph,
  detectCircularDependenciesFromGraph,
} from '../utils/violation-checker';
import { checkPackageDependencies } from '../utils/package-checker';
import { formatViolations, formatCycles, formatPackageViolations } from '../utils/formatters';

// ─── Repo Root ───────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '../..');

// ─── Layer Definitions ───────────────────────────────────────────────────────

/**
 * Agent Layer Rule
 *
 * Inspired by OpenAI's Harness Engineering approach:
 * "Each business domain is divided into a fixed set of layers,
 *  with strictly validated dependency directions."
 *
 * Layer Structure:
 *   handlers (4)  ── HTTP Entry Point
 *       ↓
 *   runtime (3)   ── AI Runtime (agent + tools)
 *       ↓
 *   services (2)  ── Business Logic & Data Access
 *       ↓
 *   config (1)    ── Configuration & Prompts
 *       ↓
 *   types (0)     ── Type Definitions, Schemas, Validation
 *
 *   [libs (-1) - Provider Layer: Cross-cutting concerns, accessible from all layers]
 */
const AGENT_LAYER_RULE: LayerRule = {
  name: 'packages/agent',
  layers: {
    // ─── Core Layers (strict forward-only dependencies) ───
    // Layer 0: Type Definitions, Schemas, Validation
    types: 0,

    // Layer 1: Configuration & Prompts
    config: 1,

    // Layer 2: Services (Business Logic & Data Access)
    services: 2,

    // Layer 3: Runtime (Agent + Tools)
    runtime: 3,

    // Layer 4: Handlers (HTTP Entry Point)
    handlers: 4,

    // ─── Provider Layer (cross-cutting concerns) ───
    // Accessible from all core layers
    libs: -1,
  },
  srcRoot: 'packages/agent/src',
  layerExtractor: (fp) => fp.match(/packages\/agent\/src\/([^/]+)/)?.[1] ?? null,
};

/**
 * Backend Layer Rule
 *
 * Layer Structure (aligned with packages/agent):
 *   routes (4)     ── HTTP Entry Point
 *       ↓
 *   services (3)   ── Business Logic & Data Access
 *       ↓
 *   middleware (2) ── HTTP Middleware
 *       ↓
 *   config (1)     ── Configuration & Static Data
 *       ↓
 *   types (0)      ── Type Definitions, Schemas
 *
 *   [libs (-1) - Provider Layer: Cross-cutting concerns, accessible from all layers]
 */
const BACKEND_LAYER_RULE: LayerRule = {
  name: 'packages/backend',
  layers: {
    // ─── Core Layers (strict forward-only dependencies) ───
    // Layer 0: Type Definitions
    types: 0,

    // Layer 1: Configuration & Static Data
    config: 1,

    // Layer 2: Middleware (HTTP Middleware)
    middleware: 2,

    // Layer 3: Services (Business Logic & Data Access)
    services: 3,

    // Layer 4: Routes (HTTP Entry Point)
    routes: 4,

    // ─── Provider Layer (cross-cutting concerns) ───
    // Accessible from all core layers
    libs: -1,
  },
  srcRoot: 'packages/backend/src',
  layerExtractor: (fp) => fp.match(/packages\/backend\/src\/([^/]+)/)?.[1] ?? null,
};

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
  { name: '@moca/cdk', allowedDeps: [] },
  { name: '@moca/lambda-tools', allowedDeps: [] },
  { name: '@moca/session-stream-handler', allowedDeps: [] },
];

// ─── Import Graph Cache (built once per package, shared across test suites) ──

const importGraphs = new Map<string, FileEntry[]>();

beforeAll(() => {
  for (const rule of ALL_LAYER_RULES) {
    importGraphs.set(rule.name, buildImportGraph(rule, REPO_ROOT));
  }
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Architecture Structural Tests', () => {
  describe('Package Dependencies', () => {
    it('all packages depend only on allowed @moca/* packages', () => {
      const violations = checkPackageDependencies(PACKAGE_RULES, REPO_ROOT);
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
        const graph = importGraphs.get(rule.name)!;
        const cycles = detectCircularDependenciesFromGraph(rule, REPO_ROOT, graph);
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
        const graph = importGraphs.get(rule.name)!;
        const violations = checkLayerViolationsFromGraph(rule, REPO_ROOT, graph);
        if (violations.length > 0) {
          throw new Error(
            `${violations.length} layer violation(s) found:\n${formatViolations(violations)}`
          );
        }
      }
    );
  });
});
