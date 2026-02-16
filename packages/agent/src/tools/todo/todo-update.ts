import { tool } from '@strands-agents/sdk';
import { todoUpdateDefinition } from '@fullstack-agentcore/tool-definitions';
import { logger } from '../../config/index.js';
import { getTodoList, saveTodoList, formatTodoList } from './helpers.js';
import type { TodoList, TodoItemUpdate } from './types.js';

export const todoUpdateTool = tool({
  name: todoUpdateDefinition.name,
  description: todoUpdateDefinition.description,
  inputSchema: todoUpdateDefinition.zodSchema,
  callback: async (input, context) => {
    const updates: TodoItemUpdate[] = input.updates;

    logger.info(`📋 Todo update: processing ${updates.length} update(s)`);

    const todoList = context?.agent?.state ? getTodoList(context.agent.state) : null;
    if (!todoList) {
      return 'No todo list exists. Please create one first using todo_init.';
    }

    const now = Date.now();
    const updatedItems = [...todoList.items];

    for (const update of updates) {
      const taskIndex = updatedItems.findIndex((task) => task.id === update.id);
      if (taskIndex === -1) {
        const currentList = formatTodoList(todoList);
        return `Update failed: Task id ${update.id} was not found.\n\n${currentList}`;
      }

      updatedItems[taskIndex] = {
        ...updatedItems[taskIndex],
        status: update.status,
        description: update.description ?? updatedItems[taskIndex].description,
        updatedAt: now,
      };
    }

    const updatedList: TodoList = {
      items: updatedItems,
      lastUpdated: now,
    };

    // Validate: only one task can be in_progress at a time
    if (updatedList.items.filter((item) => item.status === 'in_progress').length > 1) {
      const currentList = formatTodoList(todoList);
      return `Update failed: Only one task can be in progress at a time.\n\n${currentList}`;
    }

    if (context?.agent?.state) {
      saveTodoList(context.agent.state, updatedList);
    }

    const formattedList = formatTodoList(updatedList);

    let message: string;
    if (updates.length === 1) {
      message = `Task ${updates[0].id} updated to status: ${updates[0].status}`;
    } else {
      message = `${updates.length} tasks updated successfully`;
    }

    return `${message}\n\n${formattedList}`;
  },
});
