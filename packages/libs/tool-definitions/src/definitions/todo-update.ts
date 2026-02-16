import { z } from 'zod';
import { zodToJsonSchema } from '../utils/schema-converter.js';
import type { ToolDefinition } from '../types.js';

const todoItemUpdateSchema = z.object({
  id: z.string().describe('The ID of the task to update (e.g., "task-1")'),
  status: z
    .enum(['pending', 'in_progress', 'completed', 'cancelled'])
    .describe('The new status for the task'),
  description: z.string().optional().describe('Optional new description for the task'),
});

export const todoUpdateSchema = z.object({
  updates: z
    .array(todoItemUpdateSchema)
    .nonempty()
    .describe('Array of task updates to process in batch'),
});

export const todoUpdateDefinition: ToolDefinition<typeof todoUpdateSchema> = {
  name: 'todo_update',
  description: `Update tasks in the todo list created by todo_init.
Use this to mark tasks as completed, in progress, or to modify task descriptions.
Provide an array of updates to process multiple tasks at once. For example,
<example>
{
  "updates": [
    {
      "id": "task-1",
      "status": "completed"
    },
    {
      "id": "task-2",
      "status": "in_progress"
    }
  ]
}
</example>

If your update request is invalid, an error will be returned.`,
  zodSchema: todoUpdateSchema,
  jsonSchema: zodToJsonSchema(todoUpdateSchema),
};
