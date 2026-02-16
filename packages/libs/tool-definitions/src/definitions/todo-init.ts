import { z } from 'zod';
import { zodToJsonSchema } from '../utils/schema-converter.js';
import type { ToolDefinition } from '../types.js';

export const todoInitSchema = z.object({
  items: z
    .array(z.string())
    .min(1)
    .describe(
      'Array of task descriptions to initialize the list with. All tasks are initially marked as pending.'
    ),
});

export const todoInitDefinition: ToolDefinition<typeof todoInitSchema> = {
  name: 'todo_init',
  description: `Establish a fresh todo list or overwrite the current one.

This utility enables systematic workflow management during sessions, facilitating progress monitoring and task coordination while providing transparency to users regarding work completion status.

## Optimal Usage Scenarios
Deploy this functionality strategically under these conditions:

1. Intricate workflows requiring multiple phases - Apply when operations demand 3+ sequential actions or procedures
2. Sophisticated assignments needing orchestration - Utilize for endeavors requiring methodical coordination or compound operations
3. Direct user specification for task tracking - Activate when users explicitly request task list functionality
4. Multiple assignment batches - Engage when users present enumerated or delimited work items
5. Upon instruction receipt - Promptly document user specifications as actionable items. Modify todo list as new details emerge.
6. Following task completion - Update status and incorporate subsequent follow-up activities
7. During task initiation - Transition items to active status. Maintain singular active task focus. Finalize current work before advancing to new items.

## Inappropriate Usage Contexts

Avoid this utility when:
1. Only one straightforward operation exists
2. Work is elementary and tracking offers no structural advantage
3. Completion requires fewer than 3 basic steps
4. Interaction is purely discussion-based or informational

IMPORTANT: Refrain from using this tool for single elementary tasks. Direct execution is more efficient in such cases.`,
  zodSchema: todoInitSchema,
  jsonSchema: zodToJsonSchema(todoInitSchema),
};
