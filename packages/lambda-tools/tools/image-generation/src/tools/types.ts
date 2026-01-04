/**
 * Tool Types
 */

import { ToolInput, ToolResult } from '../types.js';

/**
 * Tool Handler Function Type
 */
export type ToolHandler = (input: ToolInput) => Promise<ToolResult>;

/**
 * Tool Definition
 */
export interface Tool {
  name: string;
  handler: ToolHandler;
  description: string;
  version: string;
  tags?: string[];
}

/**
 * Tool Validation Error
 */
export class ToolValidationError extends Error {
  constructor(
    message: string,
    public readonly toolName: string,
    public readonly parameterName?: string
  ) {
    super(message);
    this.name = 'ToolValidationError';
  }
}
