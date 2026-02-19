/**
 * Command execution tool - Execute shell commands safely
 */

import { tool } from '@strands-agents/sdk';
import { executeCommandDefinition } from '@moca/tool-definitions';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger, WORKSPACE_DIRECTORY } from '../config/index.js';
import { getCurrentContext } from '../context/request-context.js';

const execAsync = promisify(exec);

/**
 * Error type definition for exec execution
 */
interface ExecError extends Error {
  code?: number;
  signal?: string;
  stdout?: string;
  stderr?: string;
}

/**
 * Blacklist of dangerous commands
 */
const DANGEROUS_COMMANDS = [
  // System destructive commands
  'rm -rf /',
  'mkfs',
  'dd if=',
  'fdisk',

  // System operation commands
  'shutdown',
  'reboot',
  'halt',
  'init 0',
  'init 6',
];

/**
 * Check if working directory is allowed
 */
function isAllowedWorkingDirectory(dir: string): boolean {
  // Root directory is forbidden
  if (dir === '/') {
    return false;
  }

  // Check if allowed directories are specified in environment variable
  const allowedDirs = process.env.ALLOWED_WORKING_DIRS?.split(',') || [];
  if (allowedDirs.length > 0) {
    return allowedDirs.some((allowed) => dir.startsWith(allowed.trim()));
  }

  // By default, /home, /tmp, /var/tmp, /Users are allowed
  const defaultAllowed = ['/home/', '/tmp/', '/var/tmp/', '/Users/'];
  return defaultAllowed.some((allowed) => dir.startsWith(allowed));
}

/**
 * Check if command is dangerous
 */
function isDangerousCommand(command: string): boolean {
  const lowerCommand = command.toLowerCase().trim();

  return DANGEROUS_COMMANDS.some((dangerous) => lowerCommand.includes(dangerous.toLowerCase()));
}

/**
 * Truncate output to safe size
 */
function truncateOutput(output: string, maxLength: number = 4000): string {
  if (output.length <= maxLength) {
    return output;
  }

  const truncated = output.substring(0, maxLength);
  return `${truncated}\n\n... (Output truncated due to length. Original length: ${output.length} characters)`;
}

/**
 * Command execution tool
 */
export const executeCommandTool = tool({
  name: executeCommandDefinition.name,
  description: executeCommandDefinition.description,
  inputSchema: executeCommandDefinition.zodSchema,
  callback: async (input) => {
    const { command, workingDirectory, timeout } = input;

    logger.info(`🔧 Command execution started: ${command}`);

    // Resolve active working directory (outside try/catch for error handler access)
    const context = getCurrentContext();
    const activeDir = context?.workspaceSync?.getActiveWorkingDirectory() || WORKSPACE_DIRECTORY;

    try {
      // Wait for workspace sync to complete
      if (context?.workspaceSync) {
        await context.workspaceSync.waitForInitialSync();
      }

      // Set default working directory (use active workspace subdirectory if available)
      const effectiveWorkingDirectory = workingDirectory || activeDir;

      // 1. Security check: Detect dangerous commands
      if (isDangerousCommand(command)) {
        const errorMsg = `⚠️ Security Error: Dangerous command detected\nCommand: ${command}`;
        logger.warn(errorMsg);
        return errorMsg;
      }

      // 2. Working directory check
      if (!isAllowedWorkingDirectory(effectiveWorkingDirectory)) {
        const errorMsg = `⚠️ Security Error: Working directory not allowed\nDirectory: ${effectiveWorkingDirectory}`;
        logger.warn(errorMsg);
        return errorMsg;
      }

      // 3. Execute command
      const execOptions = {
        timeout,
        maxBuffer: 1024 * 1024 * 10, // 10MB
        cwd: effectiveWorkingDirectory,
        encoding: 'utf8' as const,
      };

      const startTime = Date.now();
      const result = await execAsync(command, execOptions);
      const duration = Date.now() - startTime;

      // 4. Format result
      const stdout = truncateOutput(result.stdout || '');
      const stderr = truncateOutput(result.stderr || '');

      const output = `Execution Result:
Command: ${command}
Working Directory: ${effectiveWorkingDirectory}
Execution Time: ${duration}ms
Exit Code: 0

Standard Output:
${stdout || '(no output)'}

${stderr ? `Standard Error:\n${stderr}` : ''}`.trim();

      logger.info(`✅ Command execution succeeded: ${command} (${duration}ms)`);
      return output;
    } catch (error: unknown) {
      // Error handling
      const execError = error as ExecError;
      const effectiveWorkingDirectory = workingDirectory || activeDir;

      let errorOutput = `Execution Error:
Command: ${command}
Working Directory: ${effectiveWorkingDirectory}
`;

      if (execError.code !== undefined) {
        errorOutput += `Exit Code: ${execError.code}\n`;
      }

      if (execError.signal) {
        errorOutput += `Signal: ${execError.signal}\n`;
      }

      if (execError.stdout) {
        errorOutput += `\nStandard Output:\n${truncateOutput(execError.stdout)}`;
      }

      if (execError.stderr) {
        errorOutput += `\nStandard Error:\n${truncateOutput(execError.stderr)}`;
      }

      // Special handling for timeout errors
      const isTimeout =
        execError.signal === 'SIGTERM' ||
        execError.message?.includes('timeout') ||
        execError.message?.includes('ETIMEDOUT');
      if (isTimeout) {
        errorOutput += `\n⏰ Timeout: Execution interrupted after ${timeout}ms`;
      }

      logger.error(`❌ Command execution error: ${command}`, execError.message || 'Unknown error');
      return errorOutput;
    }
  },
});
