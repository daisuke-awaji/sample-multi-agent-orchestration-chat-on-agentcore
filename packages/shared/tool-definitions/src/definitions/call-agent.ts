import { z } from 'zod';
import { zodToJsonSchema } from '../utils/schema-converter.js';
import type { ToolDefinition } from '../types.js';

export const callAgentSchema = z.object({
  action: z
    .enum(['list_agents', 'start_task', 'status'])
    .describe(
      "Action to perform: 'list_agents' to discover available agents, 'start_task' to start new task, 'status' to check task status"
    ),
  agentId: z
    .string()
    .optional()
    .describe(
      'Agent ID to invoke (required for start_task). Use list_agents action first to discover available agent IDs.'
    ),
  query: z
    .string()
    .optional()
    .describe('Query or task to send to the agent (required for start_task)'),
  modelId: z
    .string()
    .optional()
    .describe('Model ID to use for the sub-agent (optional, defaults to agent config)'),
  taskId: z.string().optional().describe('Task ID to check (required for status action)'),
  waitForCompletion: z
    .boolean()
    .default(false)
    .describe('Whether to wait for task completion with polling (default: false)'),
  pollingInterval: z.number().default(30).describe('Polling interval in seconds (default: 30)'),
  maxWaitTime: z
    .number()
    .default(1200)
    .describe('Maximum wait time in seconds (default: 1200 = 20 minutes)'),
  storagePath: z
    .string()
    .optional()
    .describe(
      "S3 storage path for the sub-agent workspace. If omitted, inherits the parent agent's storage path. Use this to share files between agents or specify a different workspace."
    ),
  sessionId: z
    .string()
    .optional()
    .describe(
      'Session ID for sub-agent conversation history. If not specified, auto-generated as "<33-char-alphanumeric>_subagent" (same format as regular user sessions).'
    ),
});

export const callAgentDefinition: ToolDefinition<typeof callAgentSchema> = {
  name: 'call_agent',
  description:
    'Invoke specialized sub-agents asynchronously to handle specific tasks requiring different expertise. Use list_agents first to discover available agents, then start_task to invoke them. Sub-agents run independently with no shared history and can run for extended periods.',
  zodSchema: callAgentSchema,
  jsonSchema: zodToJsonSchema(callAgentSchema),
};
