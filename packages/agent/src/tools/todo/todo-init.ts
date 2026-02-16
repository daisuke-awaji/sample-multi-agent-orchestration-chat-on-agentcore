import { tool } from '@strands-agents/sdk';
import { todoInitDefinition } from '@fullstack-agentcore/tool-definitions';
import { logger } from '../../config/index.js';
import { getTodoList, saveTodoList, formatTodoList } from './helpers.js';
import type { TodoList } from './types.js';

export const todoInitTool = tool({
  name: todoInitDefinition.name,
  description: todoInitDefinition.description,
  inputSchema: todoInitDefinition.zodSchema,
  callback: async (input, context) => {
    const { items } = input;

    logger.info(`📋 Todo init: creating ${items.length} tasks`);

    const existing = context?.agent?.state ? getTodoList(context.agent.state) : null;
    if (existing) {
      logger.info('📋 Overwriting existing todo list');
    }

    const now = Date.now();
    const todoList: TodoList = {
      items: items.map((description, index) => ({
        id: `task-${index + 1}`,
        description,
        status: 'pending' as const,
        createdAt: now,
        updatedAt: now,
      })),
      lastUpdated: now,
    };

    if (context?.agent?.state) {
      saveTodoList(context.agent.state, todoList);
    }

    return formatTodoList(todoList);
  },
});
