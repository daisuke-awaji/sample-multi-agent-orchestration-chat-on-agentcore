import { z } from 'zod';
import { zodToJsonSchema } from '../utils/schema-converter.js';
import type { ToolDefinition } from '../types.js';

const fileContentSchema = z.object({
  path: z.string(),
  text: z.string(),
});

export const codeInterpreterSchema = z.object({
  action: z
    .enum([
      'initSession',
      'executeCode',
      'executeCommand',
      'readFiles',
      'listFiles',
      'removeFiles',
      'writeFiles',
      'downloadFiles',
      'listLocalSessions',
    ])
    .describe('Operation to execute'),
  sessionName: z.string().optional().describe('Session name (defaults to default if omitted)'),
  description: z.string().optional().describe('Session description (for initSession)'),
  language: z
    .enum(['python', 'javascript', 'typescript'])
    .optional()
    .describe('Language for code execution'),
  code: z.string().optional().describe('Code to execute'),
  clearContext: z.boolean().default(false).describe('Whether to clear context'),
  command: z.string().optional().describe('Shell command to execute'),
  paths: z.array(z.string()).optional().describe('Array of file paths'),
  path: z.string().optional().describe('Directory path'),
  content: z.array(fileContentSchema).optional().describe('Array of files to write'),
  sourcePaths: z.array(z.string()).optional().describe('Array of file paths to download'),
  destinationDir: z.string().optional().describe('Download destination directory (absolute path)'),
});

export const codeInterpreterDefinition: ToolDefinition<typeof codeInterpreterSchema> = {
  name: 'code_interpreter',
  description:
    'Amazon Bedrock AgentCore CodeInterpreter tool - Execute code and perform file operations in a secure sandbox environment. Provides capabilities for Python, JavaScript, TypeScript code execution, shell command execution, file operations (read, write, delete), and session management.',
  zodSchema: codeInterpreterSchema,
  jsonSchema: zodToJsonSchema(codeInterpreterSchema),
};
