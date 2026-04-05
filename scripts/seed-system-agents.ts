#!/usr/bin/env node
/**
 * Seed system default agents into DynamoDB.
 *
 * Usage:
 *   npx tsx scripts/seed-system-agents.ts --env dev
 *   npx tsx scripts/seed-system-agents.ts --env prd --force
 *   npx tsx scripts/seed-system-agents.ts --env dev --region ap-northeast-1
 *
 * Options:
 *   --env      Environment name (dev|stg|prd)             [required]
 *   --region   AWS region (default: ap-northeast-1)
 *   --force    Delete existing system agents and re-seed
 *   --dry-run  Show what would be done without making changes
 */

import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation';
import {
  DynamoDBClient,
  QueryCommand,
  DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { v7 as uuidv7 } from 'uuid';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--env' && args[i + 1]) {
      opts.env = args[++i];
    } else if (args[i] === '--region' && args[i + 1]) {
      opts.region = args[++i];
    } else if (args[i] === '--table' && args[i + 1]) {
      opts.table = args[++i];
    } else if (args[i] === '--force') {
      opts.force = true;
    } else if (args[i] === '--dry-run') {
      opts.dryRun = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Usage: npx tsx scripts/seed-system-agents.ts --env <dev|stg|prd> [options]

Options:
  --env      Environment name (dev|stg|prd)             [required]
  --region   AWS region (default: ap-northeast-1)
  --table    DynamoDB table name (auto-detected from CloudFormation if omitted)
  --force    Delete existing system agents and re-seed
  --dry-run  Show what would be done without making changes
`);
      process.exit(0);
    }
  }

  if (!opts.env) {
    console.error('❌ --env is required. Use --help for usage.');
    process.exit(1);
  }

  return {
    env: opts.env as string,
    region: (opts.region as string) || 'ap-northeast-1',
    table: opts.table as string | undefined,
    force: !!opts.force,
    dryRun: !!opts.dryRun,
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SYSTEM_USER_ID = '00000000-0000-7000-0000-000000000000';

// ---------------------------------------------------------------------------
// CloudFormation helpers
// ---------------------------------------------------------------------------

async function getStackOutputs(
  stackName: string,
  region: string
): Promise<Record<string, string>> {
  const client = new CloudFormationClient({ region });
  const res = await client.send(
    new DescribeStacksCommand({ StackName: stackName })
  );

  const stack = res.Stacks?.[0];
  if (!stack) {
    throw new Error(`Stack "${stackName}" not found`);
  }

  const outputs: Record<string, string> = {};
  for (const o of stack.Outputs || []) {
    if (o.OutputKey && o.OutputValue) {
      outputs[o.OutputKey] = o.OutputValue;
    }
  }
  return outputs;
}

// ---------------------------------------------------------------------------
// DynamoDB helpers
// ---------------------------------------------------------------------------

async function listSystemAgents(
  client: DynamoDBClient,
  tableName: string
): Promise<Array<{ userId: string; agentId: string; name: string }>> {
  const res = await client.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: marshall({ ':uid': SYSTEM_USER_ID }),
    })
  );

  return (res.Items || []).map((item) => {
    const r = unmarshall(item);
    return { userId: r.userId, agentId: r.agentId, name: r.name };
  });
}

async function deleteSystemAgents(
  client: DynamoDBClient,
  tableName: string,
  agents: Array<{ userId: string; agentId: string }>
): Promise<void> {
  for (const agent of agents) {
    await client.send(
      new DeleteItemCommand({
        TableName: tableName,
        Key: marshall({ userId: agent.userId, agentId: agent.agentId }),
      })
    );
  }
}

interface CreateAgentInput {
  name: string;
  description: string;
  icon?: string;
  systemPrompt: string;
  enabledTools: string[];
  scenarios: Array<{ title: string; prompt: string }>;
  mcpConfig?: unknown;
}

async function createAgent(
  client: DynamoDBClient,
  tableName: string,
  input: CreateAgentInput
): Promise<{ agentId: string; name: string }> {
  const now = new Date().toISOString();
  const agentId = uuidv7();

  const item = {
    userId: SYSTEM_USER_ID,
    agentId,
    name: input.name,
    description: input.description,
    icon: input.icon,
    systemPrompt: input.systemPrompt,
    enabledTools: input.enabledTools,
    scenarios: input.scenarios.map((s) => ({
      ...s,
      id: uuidv7(),
    })),
    mcpConfig: input.mcpConfig,
    createdAt: now,
    updatedAt: now,
    isShared: 'true',
    createdBy: 'System',
  };

  const { PutItemCommand } = await import('@aws-sdk/client-dynamodb');
  await client.send(
    new PutItemCommand({
      TableName: tableName,
      Item: marshall(item, { removeUndefinedValues: true }),
    })
  );

  return { agentId, name: input.name };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();
  const envSuffix = opts.env.charAt(0).toUpperCase() + opts.env.slice(1);
  const stackName = `MocaAgentCoreApp${envSuffix}`;

  console.log(`\n🔍 Environment: ${opts.env} (stack: ${stackName}, region: ${opts.region})`);
  if (opts.dryRun) console.log('📋 DRY RUN — no changes will be made\n');

  // 1. Resolve table name (from --table flag or CloudFormation outputs)
  let tableName: string;
  if (opts.table) {
    tableName = opts.table;
  } else {
    const outputs = await getStackOutputs(stackName, opts.region);
    tableName = outputs.AgentsTableName;
    if (!tableName) {
      throw new Error('AgentsTableName not found in stack outputs');
    }
  }
  console.log(`📦 Agents table: ${tableName}`);

  // 2. Load DEFAULT_AGENTS from backend data
  const { DEFAULT_AGENTS } = await import(
    '../packages/backend/src/data/default-agents.js'
  );
  console.log(`📝 Default agents defined: ${DEFAULT_AGENTS.length}`);

  // 3. Check existing system agents
  const dynamoClient = new DynamoDBClient({ region: opts.region });
  const existing = await listSystemAgents(dynamoClient, tableName);
  console.log(`📊 Existing system agents in DynamoDB: ${existing.length}`);

  if (existing.length > 0) {
    for (const a of existing) {
      console.log(`   - ${a.agentId}  ${a.name}`);
    }
  }

  // 4. Handle existing agents
  if (existing.length > 0 && !opts.force) {
    console.log(
      `\nℹ️  System agents already exist. Use --force to delete and re-seed.`
    );
    process.exit(0);
  }

  if (existing.length > 0 && opts.force) {
    console.log(`\n🗑️  Deleting ${existing.length} existing system agents...`);
    if (!opts.dryRun) {
      await deleteSystemAgents(dynamoClient, tableName, existing);
    }
    console.log('   Done.');
  }

  // 5. Seed
  console.log(`\n🌱 Seeding ${DEFAULT_AGENTS.length} system agents...`);
  const created: Array<{ agentId: string; name: string }> = [];

  for (const input of DEFAULT_AGENTS) {
    if (opts.dryRun) {
      console.log(`   [dry-run] Would create: ${input.name}`);
    } else {
      const agent = await createAgent(dynamoClient, tableName, input);
      created.push(agent);
      console.log(`   ✅ ${agent.agentId}  ${agent.name}`);
    }
  }

  console.log(
    `\n✨ ${opts.dryRun ? 'Would seed' : 'Seeded'} ${DEFAULT_AGENTS.length} system agents (userId: ${SYSTEM_USER_ID})\n`
  );
}

main().catch((err) => {
  console.error('\n❌ Seed failed:', err.message || err);
  process.exit(1);
});
