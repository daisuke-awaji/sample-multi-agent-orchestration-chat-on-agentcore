#!/usr/bin/env npx ts-node

/**
 * Auto-generate docs/tools.md from tool definitions.
 *
 * Usage:
 *   npx ts-node scripts/generate-tool-docs.ts
 *
 * Prerequisites:
 *   packages/libs/tool-definitions must be built first:
 *     npm run -w packages/libs/tool-definitions build
 *
 * This script loads the compiled tool definitions and lambda-tools
 * tool-schema.json files, then generates a comprehensive Markdown
 * reference document at docs/tools.md.
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JsonSchemaProperty {
  type?: string;
  description?: string;
  enum?: string[];
  default?: unknown;
  items?: { type?: string };
  anyOf?: Array<{ type?: string; items?: { type?: string } }>;
}

interface JsonSchema {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}

interface ToolDefRuntime {
  name: string;
  description: string;
  jsonSchema: JsonSchema;
}

interface LambdaToolSchema {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

interface LambdaToolFile {
  tools: LambdaToolSchema[];
}

// ---------------------------------------------------------------------------
// Category mapping – update when adding new tools
// ---------------------------------------------------------------------------

interface CategoryEntry {
  emoji: string;
  title: string;
  tools: string[];
}

const CATEGORIES: CategoryEntry[] = [
  {
    emoji: '🔧',
    title: 'Development & System',
    tools: ['execute_command', 'file_editor', 'code_interpreter'],
  },
  {
    emoji: '🔍',
    title: 'Search & Web',
    tools: ['tavily_search', 'tavily_extract', 'tavily_crawl', 'browser'],
  },
  {
    emoji: '🎨',
    title: 'Media Generation',
    tools: ['nova_canvas', 'nova_reel', 'image_to_text'],
  },
  {
    emoji: '🤖',
    title: 'Agent Management',
    tools: ['call_agent', 'manage_agent'],
  },
  {
    emoji: '📁',
    title: 'Storage & Organization',
    tools: ['s3_list_files', 'todo'],
  },
  {
    emoji: '🧠',
    title: 'Reasoning',
    tools: ['think'],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveType(prop: JsonSchemaProperty): string {
  // Handle anyOf (union types)
  if (prop.anyOf) {
    const types = prop.anyOf
      .filter((t) => t.type !== 'null')
      .map((t) => {
        if (t.type === 'array') return `${t.items?.type ?? 'unknown'}[]`;
        return t.type ?? 'unknown';
      });
    if (types.length > 0) return types.join(' \\| ');
  }
  if (prop.enum) {
    return 'enum';
  }
  if (prop.type === 'array') {
    const itemType = prop.items?.type ?? 'unknown';
    return `${itemType}[]`;
  }
  return prop.type ?? 'unknown';
}

function firstSentence(text: string): string {
  const byDot = text.split(/\.\s/)[0];
  const byNewline = text.split('\n')[0];
  const result = byDot.length < byNewline.length ? byDot : byNewline;
  return result.replace(/\.$/, '').trim();
}

function truncateDesc(text: string, maxLen = 120): string {
  const line = (text ?? '').split('\n')[0].trim();
  if (line.length <= maxLen) return line;
  return line.slice(0, maxLen - 3) + '...';
}

function generateParamTable(schema: JsonSchema): string {
  const props = schema.properties;
  const required = new Set(schema.required ?? []);
  if (!props || Object.keys(props).length === 0) {
    return '_No parameters._\n';
  }

  const lines: string[] = [];
  lines.push('| Parameter | Type | Required | Description |');
  lines.push('|-----------|------|----------|-------------|');

  for (const [name, prop] of Object.entries(props)) {
    const type = resolveType(prop);
    const req = required.has(name) ? '✅' : '';
    const desc = truncateDesc(prop.description ?? '');
    lines.push(`| \`${name}\` | ${type} | ${req} | ${desc} |`);
  }

  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Load built-in tool definitions (from compiled dist)
// ---------------------------------------------------------------------------

function loadBuiltinTools(): ToolDefRuntime[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const defs = require(
    path.resolve(__dirname, '..', 'packages', 'libs', 'tool-definitions', 'dist', 'index.js')
  );

  const allDefs: ToolDefRuntime[] = defs.allToolDefinitions;
  if (!allDefs || !Array.isArray(allDefs)) {
    throw new Error(
      'Failed to load allToolDefinitions. Run: npm run -w packages/libs/tool-definitions build'
    );
  }
  return allDefs;
}

// ---------------------------------------------------------------------------
// Load lambda tool definitions
// ---------------------------------------------------------------------------

interface LambdaToolGroup {
  dirName: string;
  tools: LambdaToolSchema[];
}

function loadLambdaTools(): LambdaToolGroup[] {
  const toolsDir = path.resolve(__dirname, '..', 'packages', 'lambda-tools', 'tools');
  if (!fs.existsSync(toolsDir)) return [];

  const groups: LambdaToolGroup[] = [];

  for (const dir of fs.readdirSync(toolsDir)) {
    const schemaPath = path.join(toolsDir, dir, 'tool-schema.json');
    if (!fs.existsSync(schemaPath)) continue;

    const schemaContent = JSON.parse(fs.readFileSync(schemaPath, 'utf-8')) as LambdaToolFile;
    groups.push({
      dirName: dir,
      tools: schemaContent.tools ?? [],
    });
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Generate Markdown
// ---------------------------------------------------------------------------

function generate(): string {
  const builtinTools = loadBuiltinTools();
  const lambdaToolGroups = loadLambdaTools();

  const toolMap = new Map<string, ToolDefRuntime>();
  for (const tool of builtinTools) {
    toolMap.set(tool.name, tool);
  }

  const lines: string[] = [];

  // Header
  lines.push('# Tools Reference');
  lines.push('');
  lines.push('> **Auto-generated** by `scripts/generate-tool-docs.ts`. Do not edit manually.');
  lines.push('');
  lines.push(
    'This document provides an overview of all available tools in Donuts. Tools extend agent capabilities and can be enabled per agent via the `enabledTools` configuration.'
  );
  lines.push('');

  // Built-in tools overview
  lines.push('## Built-in Tools');
  lines.push('');
  lines.push(
    'Built-in tools are defined in `packages/libs/tool-definitions/src/definitions/` and run within the agent runtime.'
  );
  lines.push('');

  // Category tables
  for (const cat of CATEGORIES) {
    lines.push(`### ${cat.emoji} ${cat.title}`);
    lines.push('');
    lines.push('| Tool | Description |');
    lines.push('|------|-------------|');
    for (const toolName of cat.tools) {
      const tool = toolMap.get(toolName);
      if (!tool) continue;
      const desc = firstSentence(tool.description);
      lines.push(`| [\`${toolName}\`](#${toolName}) | ${desc} |`);
    }
    lines.push('');
  }

  // Uncategorized tools
  const categorizedTools = new Set(CATEGORIES.flatMap((c) => c.tools));
  const uncategorized = builtinTools.filter((t) => !categorizedTools.has(t.name));
  if (uncategorized.length > 0) {
    lines.push('### Other');
    lines.push('');
    lines.push('| Tool | Description |');
    lines.push('|------|-------------|');
    for (const tool of uncategorized) {
      const desc = firstSentence(tool.description);
      lines.push(`| [\`${tool.name}\`](#${tool.name}) | ${desc} |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // Tool details
  lines.push('## Tool Details');
  lines.push('');

  for (const tool of builtinTools) {
    lines.push(`### ${tool.name}`);
    lines.push('');
    lines.push(firstSentence(tool.description) + '.');
    lines.push('');
    lines.push(generateParamTable(tool.jsonSchema));
    lines.push('---');
    lines.push('');
  }

  // Lambda tools
  lines.push('## Lambda Tools (External)');
  lines.push('');
  lines.push(
    'Lambda tools run as separate AWS Lambda functions and are connected via AgentCore Gateway. They are defined in `packages/lambda-tools/tools/`.'
  );
  lines.push('');

  for (const group of lambdaToolGroups) {
    const title = group.dirName
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    lines.push(`### ${title} (\`${group.dirName}\`)`);
    lines.push('');
    lines.push('| Tool | Description |');
    lines.push('|------|-------------|');
    for (const tool of group.tools) {
      lines.push(`| \`${tool.name}\` | ${firstSentence(tool.description)} |`);
    }
    lines.push('');
  }

  // Adding new tools guide
  lines.push('---');
  lines.push('');
  lines.push('## Adding a New Built-in Tool');
  lines.push('');
  lines.push(
    '1. Create a new definition file in `packages/libs/tool-definitions/src/definitions/`'
  );
  lines.push('2. Define the Zod schema and `ToolDefinition` export');
  lines.push(
    '3. Add the export and import to `packages/libs/tool-definitions/src/definitions/index.ts`'
  );
  lines.push('4. Implement the tool handler in `packages/agent/src/tools/`');
  lines.push('5. Register the tool in `packages/agent/src/tools/index.ts`');
  lines.push(
    '6. Build the definitions: `npm run -w packages/libs/tool-definitions build`'
  );
  lines.push('7. Run `npx ts-node scripts/generate-tool-docs.ts` to regenerate this document');
  lines.push('');
  lines.push('## Adding a New Lambda Tool');
  lines.push('');
  lines.push('1. Create a new directory under `packages/lambda-tools/tools/`');
  lines.push('2. Define `tool-schema.json` with tool names, descriptions, and input schemas');
  lines.push('3. Implement the Lambda handler');
  lines.push('4. Deploy via CDK and register in AgentCore Gateway');
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const output = generate();
const outputPath = path.resolve(__dirname, '..', 'docs', 'tools.md');
fs.writeFileSync(outputPath, output, 'utf-8');

// Count tool detail sections
const detailMatches = output.match(/^### \w+/gm);
console.log(`✅ Generated docs/tools.md (${detailMatches?.length ?? 0} tool sections)`);