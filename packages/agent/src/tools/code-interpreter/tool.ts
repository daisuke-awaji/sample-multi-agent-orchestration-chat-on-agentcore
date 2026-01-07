/**
 * CodeInterpreter Strands tool definition
 */

import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { logger } from '../../config/index.js';
import { AgentCoreCodeInterpreterClient } from './client.js';
import type {
  InitSessionAction,
  ExecuteCodeAction,
  ExecuteCommandAction,
  ReadFilesAction,
  ListFilesAction,
  RemoveFilesAction,
  WriteFilesAction,
  DownloadFilesAction,
} from './types.js';
import { codeInterpreterDefinition } from '@fullstack-agentcore/tool-definitions';

/**
 * CodeInterpreter tool schema definition
 * Using z.object() format for Bedrock API compatibility
 */

/**
 * CodeInterpreter Tool
 */
export const codeInterpreterTool = tool({
  name: codeInterpreterDefinition.name,
  description: codeInterpreterDefinition.description,
  inputSchema: codeInterpreterDefinition.zodSchema,
  callback: async (input: z.infer<typeof codeInterpreterDefinition.zodSchema>) => {
    logger.info(`🧮 CodeInterpreter execution started: ${input.action}`);

    try {
      // Create client (with default settings)
      const client = new AgentCoreCodeInterpreterClient({
        autoCreate: true,
        persistSessions: true,
      });

      // Branch processing by action
      let result;
      switch (input.action) {
        case 'initSession': {
          result = await client.initSession(input as InitSessionAction);
          break;
        }

        case 'executeCode': {
          result = await client.executeCode(input as ExecuteCodeAction);
          break;
        }

        case 'executeCommand': {
          result = await client.executeCommand(input as ExecuteCommandAction);
          break;
        }

        case 'readFiles': {
          result = await client.readFiles(input as ReadFilesAction);
          break;
        }

        case 'listFiles': {
          result = await client.listFiles(input as ListFilesAction);
          break;
        }

        case 'removeFiles': {
          result = await client.removeFiles(input as RemoveFilesAction);
          break;
        }

        case 'writeFiles': {
          result = await client.writeFiles(input as WriteFilesAction);
          break;
        }

        case 'downloadFiles': {
          result = await client.downloadFiles(input as DownloadFilesAction);
          break;
        }

        case 'listLocalSessions': {
          result = client.listLocalSessions();
          break;
        }

        default: {
          // TypeScript exhaustiveness check
          const exhaustiveCheck: never = input.action;
          throw new Error(`Unknown action: ${exhaustiveCheck}`);
        }
      }

      // Format result
      if (result.status === 'success') {
        logger.info(`✅ CodeInterpreter execution successful: ${input.action}`);

        // Format content appropriately
        const content = result.content[0];
        if (content.json) {
          return `Execution Result:\nOperation: ${input.action}\nResult: ${JSON.stringify(content.json, null, 2)}`;
        } else if (content.text) {
          return `Execution Result:\nOperation: ${input.action}\nOutput:\n${content.text}`;
        } else {
          return `Execution Result:\nOperation: ${input.action}\nResult: ${JSON.stringify(content)}`;
        }
      } else {
        logger.error(`❌ CodeInterpreter execution error: ${input.action}`);
        const errorText = result.content[0]?.text || JSON.stringify(result.content);
        return `Execution Error:\nOperation: ${input.action}\nError: ${errorText}`;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`❌ CodeInterpreter unexpected error: ${input.action}`, errorMessage);
      return `An unexpected error occurred:\nOperation: ${input.action}\nError: ${errorMessage}`;
    }
  },
});
