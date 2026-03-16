/**
 * Dynamic tool runner for lambda-tools
 *
 * Scans the tools/ directory and runs the specified npm script for each tool.
 * This eliminates the need to manually register each tool in package.json.
 *
 * Usage:
 *   node scripts/run-all.mjs build
 *   node scripts/run-all.mjs clean
 *   node scripts/run-all.mjs test
 */

import { readdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TOOLS_DIR = join(ROOT, 'tools');
const SHARED_DIR = join(ROOT, 'shared');

const action = process.argv[2];

if (!action || !['build', 'clean', 'test'].includes(action)) {
  console.error('Usage: node scripts/run-all.mjs <build|clean|test>');
  process.exit(1);
}

/**
 * Execute a shell command with inherited stdio
 */
function run(cmd, cwd) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`▶ ${cmd}`);
  console.log(`  cwd: ${cwd}`);
  console.log('─'.repeat(60));
  execSync(cmd, { stdio: 'inherit', cwd });
}

/**
 * Discover all tool directories under tools/
 * A valid tool directory must contain a package.json
 */
function discoverTools() {
  if (!existsSync(TOOLS_DIR)) {
    console.warn('tools/ directory not found');
    return [];
  }

  return readdirSync(TOOLS_DIR, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && existsSync(join(TOOLS_DIR, entry.name, 'package.json'))
    )
    .map((entry) => entry.name)
    .sort();
}

// ── Main ──

const tools = discoverTools();
console.log(`\nDiscovered ${tools.length} tool(s): ${tools.join(', ')}`);

// Step 1: Build shared first (required for build and test)
if (action === 'build' || action === 'test') {
  console.log('\n══ Building shared library ══');
  run('npm install && npm run build', SHARED_DIR);
}

// Step 2: Run action for each tool
for (const tool of tools) {
  const toolDir = join(TOOLS_DIR, tool);
  console.log(`\n══ ${action}: ${tool} ══`);

  try {
    if (action === 'clean') {
      run('npm run clean', toolDir);
    } else {
      // build or test: install deps first, then run
      run(`npm install && npm run ${action}`, toolDir);
    }
  } catch {
    console.error(`\n✗ Failed to ${action} ${tool}`);
    process.exit(1);
  }
}

console.log(`\n${'═'.repeat(60)}`);
console.log(`✓ All ${tools.length} tool(s) ${action} completed successfully`);
console.log('═'.repeat(60));