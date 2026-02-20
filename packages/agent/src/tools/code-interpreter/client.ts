/**
 * AgentCore CodeInterpreter client implementation
 */

import {
  BedrockAgentCoreClient,
  StartCodeInterpreterSessionCommand,
  InvokeCodeInterpreterCommand,
  StopCodeInterpreterSessionCommand,
  GetCodeInterpreterSessionCommand,
} from '@aws-sdk/client-bedrock-agentcore';
import { logger, WORKSPACE_DIRECTORY } from '../../config/index.js';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type {
  ToolResult,
  SessionInfo,
  CodeInterpreterOptions,
  InitSessionAction,
  ExecuteCodeAction,
  ExecuteCommandAction,
  ReadFilesAction,
  ListFilesAction,
  RemoveFilesAction,
  WriteFilesAction,
  DownloadFilesAction,
  DownloadResult,
  DownloadedFile,
} from './types.js';

// Module-level session cache - persists across objects
const sessionMapping: Map<string, string> = new Map();

/**
 * AgentCore CodeInterpreter client
 */
export class AgentCoreCodeInterpreterClient {
  private region: string;
  private identifier: string;
  private sessions: Map<string, SessionInfo>;
  private autoCreate: boolean;
  private persistSessions: boolean;
  private defaultSession: string;
  private client: BedrockAgentCoreClient;
  private storagePath: string;

  constructor(options: CodeInterpreterOptions = {}) {
    this.region = options.region || process.env.AWS_REGION || 'us-east-1';
    this.identifier = options.identifier || 'aws.codeinterpreter.v1';
    this.autoCreate = options.autoCreate ?? true;
    this.persistSessions = options.persistSessions ?? true;
    this.storagePath = options.storagePath || '';

    if (options.sessionName) {
      this.defaultSession = options.sessionName;
    } else {
      this.defaultSession = `session-${crypto.randomUUID().slice(0, 12)}`;
    }

    this.sessions = new Map();
    this.client = new BedrockAgentCoreClient({ region: this.region });

    logger.info(
      `CodeInterpreter initialized: session='${this.defaultSession}', ` +
        `identifier='${this.identifier}', autoCreate=${this.autoCreate}, ` +
        `persistSessions=${this.persistSessions}, storagePath='${this.storagePath}'`
    );
  }

  /**
   * Initialize session
   */
  async initSession(action: InitSessionAction): Promise<ToolResult> {
    logger.info(`Initializing Bedrock AgentCore sandbox session: ${action.description}`);

    const sessionName = action.sessionName;

    // Check if already exists in instance cache
    if (this.sessions.has(sessionName)) {
      return {
        status: 'error',
        content: [{ text: `Session '${sessionName}' already exists` }],
      };
    }

    // Check if already in use by module-level cache
    if (sessionMapping.has(sessionName)) {
      const errorMsg =
        `Session '${sessionName}' is already in use by another instance. ` +
        `Use a unique session name or reconnect to the existing session ` +
        `via ensureSession() instead of calling initSession() directly.`;
      logger.error(errorMsg);
      return {
        status: 'error',
        content: [{ text: errorMsg }],
      };
    }

    try {
      // Start session
      const command = new StartCodeInterpreterSessionCommand({
        codeInterpreterIdentifier: this.identifier,
        name: sessionName,
        sessionTimeoutSeconds: 900, // 15 minutes
      });

      const response = await this.client.send(command);
      const awsSessionId = response.sessionId!;

      // Save to module-level cache
      sessionMapping.set(sessionName, awsSessionId);

      // Save local session information
      this.sessions.set(sessionName, {
        sessionId: sessionName,
        description: action.description,
        awsSessionId: awsSessionId,
      });

      logger.info(`Initialized session: ${sessionName} (AWS ID: ${awsSessionId})`);

      return {
        status: 'success',
        content: [
          {
            json: {
              sessionName: sessionName,
              description: action.description,
              sessionId: awsSessionId,
            },
          },
        ],
      };
    } catch (error) {
      const errorMsg = `Failed to initialize session '${sessionName}': ${error}`;
      logger.error(errorMsg);
      return {
        status: 'error',
        content: [{ text: errorMsg }],
      };
    }
  }

  /**
   * Get list of sessions
   */
  listLocalSessions(): ToolResult {
    const sessionsInfo = Array.from(this.sessions.values()).map((info) => ({
      sessionName: info.sessionId,
      description: info.description,
      sessionId: info.awsSessionId,
    }));

    return {
      status: 'success',
      content: [
        {
          json: {
            sessions: sessionsInfo,
            totalSessions: sessionsInfo.length,
          },
        },
      ],
    };
  }

  /**
   * Check session existence and create if needed
   */
  private async ensureSession(sessionName?: string): Promise<[string, ToolResult | null]> {
    const targetSession = sessionName || this.defaultSession;

    logger.debug(`Ensuring session: ${targetSession}`);

    // Check local cache
    if (this.sessions.has(targetSession)) {
      logger.debug(`Using cached session: ${targetSession}`);
      return [targetSession, null];
    }

    // Check module-level cache
    const awsSessionId = sessionMapping.get(targetSession);

    if (awsSessionId) {
      logger.debug(`Found session in module cache: ${targetSession} -> ${awsSessionId}`);

      try {
        // Check session status
        const command = new GetCodeInterpreterSessionCommand({
          codeInterpreterIdentifier: this.identifier,
          sessionId: awsSessionId,
        });

        const sessionInfo = await this.client.send(command);

        if (sessionInfo.status === 'READY') {
          // Session is ready - reconnect
          this.sessions.set(targetSession, {
            sessionId: targetSession,
            description: 'Reconnected via module cache',
            awsSessionId: awsSessionId,
          });

          logger.info(`Reconnected to existing session: ${targetSession}`);
          return [targetSession, null];
        } else {
          // Session not ready - remove from cache
          logger.warn(`Session ${targetSession} not READY, removing from cache`);
          sessionMapping.delete(targetSession);
        }
      } catch (error) {
        // Session doesn't exist or error - remove from cache
        logger.debug(`Session reconnection failed: ${error}`);
        sessionMapping.delete(targetSession);
      }
    }

    // If session not found
    if (this.autoCreate) {
      logger.info(`Auto-creating session: ${targetSession}`);

      const initAction: InitSessionAction = {
        action: 'initSession',
        sessionName: targetSession,
        description: 'Auto-initialized session',
      };

      const result = await this.initSession(initAction);

      if (result.status !== 'success') {
        return [targetSession, result];
      }

      logger.info(`Successfully auto-created session: ${targetSession}`);
      return [targetSession, null];
    }

    // Session doesn't exist with autoCreate=false
    logger.debug(`Session '${targetSession}' not found (auto_create disabled)`);
    throw new Error(`Session '${targetSession}' not found. Create it first using initSession.`);
  }

  /**
   * Execute code
   */
  async executeCode(action: ExecuteCodeAction): Promise<ToolResult> {
    const [sessionName, error] = await this.ensureSession(action.sessionName);
    if (error) return error;

    logger.debug(`Executing ${action.language} code in session '${sessionName}'`);

    try {
      const sessionInfo = this.sessions.get(sessionName)!;

      const command = new InvokeCodeInterpreterCommand({
        codeInterpreterIdentifier: this.identifier,
        sessionId: sessionInfo.awsSessionId,
        name: 'executeCode',
        arguments: {
          code: action.code,
          language: action.language,
          clearContext: action.clearContext || false,
        },
      });

      const response = await this.client.send(command);
      return await this.createToolResult(response);
    } catch (error) {
      const errorMsg = `Failed to execute code: ${error}`;
      logger.error(errorMsg);
      return {
        status: 'error',
        content: [{ text: errorMsg }],
      };
    }
  }

  /**
   * Execute command
   */
  async executeCommand(action: ExecuteCommandAction): Promise<ToolResult> {
    const [sessionName, error] = await this.ensureSession(action.sessionName);
    if (error) return error;

    logger.debug(`Executing command in session '${sessionName}'`);

    try {
      const sessionInfo = this.sessions.get(sessionName)!;

      const command = new InvokeCodeInterpreterCommand({
        codeInterpreterIdentifier: this.identifier,
        sessionId: sessionInfo.awsSessionId,
        name: 'executeCommand',
        arguments: {
          command: action.command,
        },
      });

      const response = await this.client.send(command);
      return await this.createToolResult(response);
    } catch (error) {
      const errorMsg = `Failed to execute command: ${error}`;
      logger.error(errorMsg);
      return {
        status: 'error',
        content: [{ text: errorMsg }],
      };
    }
  }

  /**
   * Read files
   */
  async readFiles(action: ReadFilesAction): Promise<ToolResult> {
    const [sessionName, error] = await this.ensureSession(action.sessionName);
    if (error) return error;

    logger.debug(`Reading files from session '${sessionName}'`);

    try {
      const sessionInfo = this.sessions.get(sessionName)!;

      const command = new InvokeCodeInterpreterCommand({
        codeInterpreterIdentifier: this.identifier,
        sessionId: sessionInfo.awsSessionId,
        name: 'readFiles',
        arguments: {
          paths: action.paths,
        },
      });

      const response = await this.client.send(command);
      return await this.createToolResult(response);
    } catch (error) {
      const errorMsg = `Failed to read files: ${error}`;
      logger.error(errorMsg);
      return {
        status: 'error',
        content: [{ text: errorMsg }],
      };
    }
  }

  /**
   * List files
   */
  async listFiles(action: ListFilesAction): Promise<ToolResult> {
    const [sessionName, error] = await this.ensureSession(action.sessionName);
    if (error) return error;

    logger.debug(`Listing files in session '${sessionName}'`);

    try {
      const sessionInfo = this.sessions.get(sessionName)!;

      const command = new InvokeCodeInterpreterCommand({
        codeInterpreterIdentifier: this.identifier,
        sessionId: sessionInfo.awsSessionId,
        name: 'listFiles',
        arguments: {
          path: action.path,
        },
      });

      const response = await this.client.send(command);
      return await this.createToolResult(response);
    } catch (error) {
      const errorMsg = `Failed to list files: ${error}`;
      logger.error(errorMsg);
      return {
        status: 'error',
        content: [{ text: errorMsg }],
      };
    }
  }

  /**
   * Remove files
   */
  async removeFiles(action: RemoveFilesAction): Promise<ToolResult> {
    const [sessionName, error] = await this.ensureSession(action.sessionName);
    if (error) return error;

    logger.debug(`Removing files from session '${sessionName}'`);

    try {
      const sessionInfo = this.sessions.get(sessionName)!;

      const command = new InvokeCodeInterpreterCommand({
        codeInterpreterIdentifier: this.identifier,
        sessionId: sessionInfo.awsSessionId,
        name: 'removeFiles',
        arguments: {
          paths: action.paths,
        },
      });

      const response = await this.client.send(command);
      return await this.createToolResult(response);
    } catch (error) {
      const errorMsg = `Failed to remove files: ${error}`;
      logger.error(errorMsg);
      return {
        status: 'error',
        content: [{ text: errorMsg }],
      };
    }
  }

  /**
   * Write files
   */
  async writeFiles(action: WriteFilesAction): Promise<ToolResult> {
    const [sessionName, error] = await this.ensureSession(action.sessionName);
    if (error) return error;

    logger.debug(`Writing ${action.content.length} files to session '${sessionName}'`);

    try {
      const sessionInfo = this.sessions.get(sessionName)!;

      const contentDicts = action.content.map((fc) => ({
        path: fc.path,
        text: fc.text,
      }));

      const command = new InvokeCodeInterpreterCommand({
        codeInterpreterIdentifier: this.identifier,
        sessionId: sessionInfo.awsSessionId,
        name: 'writeFiles',
        arguments: {
          content: contentDicts,
        },
      });

      const response = await this.client.send(command);
      return await this.createToolResult(response);
    } catch (error) {
      const errorMsg = `Failed to write files: ${error}`;
      logger.error(errorMsg);
      return {
        status: 'error',
        content: [{ text: errorMsg }],
      };
    }
  }

  /**
   * Download files
   */
  async downloadFiles(action: DownloadFilesAction): Promise<ToolResult> {
    const [sessionName, error] = await this.ensureSession(action.sessionName);
    if (error) return error;

    logger.debug(`Downloading ${action.sourcePaths.length} files from session '${sessionName}'`);

    try {
      if (!path.isAbsolute(action.destinationDir)) {
        return {
          status: 'error',
          content: [
            { text: `Destination directory must be an absolute path: ${action.destinationDir}` },
          ],
        };
      }

      fs.mkdirSync(action.destinationDir, { recursive: true });

      const resultFilePath = await this.encodeFilesInSandbox(sessionName, action.sourcePaths);
      if (typeof resultFilePath !== 'string') return resultFilePath;

      const encodedResults = await this.readEncodedResults(sessionName, resultFilePath);
      if ('status' in encodedResults) return encodedResults as ToolResult;

      const downloadedFiles: DownloadedFile[] = [];
      const errors: string[] = [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const [sourcePath, result] of Object.entries(encodedResults as Record<string, any>)) {
        if ('error' in result) {
          errors.push(`${sourcePath}: ${result.error}`);
          continue;
        }
        try {
          const downloaded = this.saveFileToWorkspace(sourcePath, result, action.destinationDir);
          downloadedFiles.push(downloaded);
          logger.info(`Downloaded file: ${sourcePath} -> ${downloaded.localPath} (${result.size} bytes)`);
        } catch (decodeError) {
          errors.push(`${sourcePath}: Failed to decode/save file: ${decodeError}`);
        }
      }

      if (errors.length > 0 && downloadedFiles.length === 0) {
        return {
          status: 'error',
          content: [{ text: `All downloads failed: ${errors.join('; ')}` }],
        };
      }

      const instruction = this.buildDownloadInstruction(downloadedFiles);

      const responseData: DownloadResult = {
        downloadedFiles: downloadedFiles,
        totalFiles: downloadedFiles.length,
        destinationDir: action.destinationDir,
        storagePath: this.storagePath,
        instruction: instruction,
      };

      if (errors.length > 0) {
        responseData.errors = errors;
      }

      return {
        status: 'success',
        content: [{ json: responseData }],
      };
    } catch (error) {
      const errorMsg = `Failed to download files from session '${sessionName}': ${error}`;
      logger.error(errorMsg);
      return {
        status: 'error',
        content: [{ text: errorMsg }],
      };
    }
  }

  /**
   * Execute Python base64-encoding script in sandbox and return the result file path.
   * Returns the file path string on success, or a ToolResult error on failure.
   */
  private async encodeFilesInSandbox(
    sessionName: string,
    sourcePaths: string[]
  ): Promise<string | ToolResult> {
    const sourcePathsJson = JSON.stringify(sourcePaths);
    const encodeCode = `
import base64
import json
import os

results = {}
source_paths = ${sourcePathsJson}
cwd = os.getcwd()

for path in source_paths:
    try:
        # For relative paths, interpret as relative from working directory
        full_path = path if os.path.isabs(path) else os.path.join(cwd, path)
        
        if not os.path.exists(full_path):
            results[path] = {"error": f"File not found: {full_path}"}
            continue
            
        with open(full_path, 'rb') as f:
            file_data = f.read()
            results[path] = {
                "data": base64.b64encode(file_data).decode('utf-8'),
                "size": len(file_data)
            }
    except Exception as e:
        results[path] = {"error": str(e)}

# Save results to file (using cwd)
result_file = "__download_results__.json"
with open(result_file, 'w') as f:
    json.dump(results, f)

# Output only the file path
print(result_file)
`;

    const sessionInfo = this.sessions.get(sessionName)!;
    const command = new InvokeCodeInterpreterCommand({
      codeInterpreterIdentifier: this.identifier,
      sessionId: sessionInfo.awsSessionId,
      name: 'executeCode',
      arguments: {
        code: encodeCode,
        language: 'python',
        clearContext: false,
      },
    });

    const response = await this.client.send(command);
    const executionResult = await this.createToolResult(response);

    if (executionResult.status !== 'success') {
      return {
        status: 'error',
        content: [
          {
            text: `Failed to execute file encoding in sandbox: ${JSON.stringify(executionResult)}`,
          },
        ],
      };
    }

    const content = executionResult.content[0];
    if (!content.text) {
      return {
        status: 'error',
        content: [{ text: `Unexpected response format: ${JSON.stringify(executionResult)}` }],
      };
    }

    const outputText = content.text.trim();
    try {
      const parsed = JSON.parse(outputText);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].text) {
        return parsed[0].text.trim() as string;
      }
    } catch {
      // Use as-is if not JSON
    }
    return outputText;
  }

  /**
   * Read and parse the encoded results JSON file from the sandbox.
   * Returns the parsed file-results map on success, or a ToolResult on error.
   */
  private async readEncodedResults(
    sessionName: string,
    resultFilePath: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<Record<string, any> | ToolResult> {
    logger.debug(`Result file path: ${resultFilePath}`);

    const readResult = await this.readFiles({
      action: 'readFiles',
      sessionName: sessionName,
      paths: [resultFilePath],
    });

    if (readResult.status !== 'success') {
      return {
        status: 'error',
        content: [
          {
            text: `Failed to read results file ${resultFilePath}: ${JSON.stringify(readResult)}`,
          },
        ],
      };
    }

    const fileContent = readResult.content[0];
    if (!fileContent.text) {
      return {
        status: 'error',
        content: [{ text: `Failed to extract JSON content: ${JSON.stringify(readResult)}` }],
      };
    }

    let resultsJson: string;
    try {
      const parsed = JSON.parse(fileContent.text);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const firstItem = parsed[0];
        // For resource type, get data from resource.text
        if (firstItem.type === 'resource' && firstItem.resource?.text) {
          resultsJson = firstItem.resource.text;
        } else if (firstItem.text) {
          resultsJson = firstItem.text;
        } else {
          resultsJson = fileContent.text;
        }
      } else {
        resultsJson = fileContent.text;
      }
    } catch {
      // Use as-is if JSON parse fails
      resultsJson = fileContent.text;
    }

    logger.debug(`Read JSON content (length: ${resultsJson.length})`);

    try {
      await this.removeFiles({
        action: 'removeFiles',
        sessionName: sessionName,
        paths: [resultFilePath],
      });
      logger.debug(`Cleaned up temporary file: ${resultFilePath}`);
    } catch (cleanupError) {
      logger.warn(`Failed to cleanup temporary file ${resultFilePath}: ${cleanupError}`);
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fileResults: Record<string, any> = JSON.parse(resultsJson);
      logger.debug(`Parsed fileResults with ${Object.keys(fileResults).length} files`);
      return fileResults;
    } catch (jsonError) {
      return {
        status: 'error',
        content: [
          {
            text: `Failed to parse download results JSON: ${jsonError}. Content: ${resultsJson.substring(0, 500)}`,
          },
        ],
      };
    }
  }

  /**
   * Resolve a unique local file path within destinationDir, avoiding collisions.
   */
  private resolveUniqueLocalPath(destinationDir: string, sourceFilename: string): string {
    // nosemgrep: path-join-resolve-traversal - destinationDir is validated, sourceFilename extracted via path.basename
    let localPath = path.join(destinationDir, sourceFilename);
    let counter = 1;
    while (fs.existsSync(localPath)) {
      if (sourceFilename.includes('.')) {
        const nameExt = sourceFilename.split('.');
        const ext = nameExt.pop();
        const name = nameExt.join('.');
        // nosemgrep: path-join-resolve-traversal - destinationDir is validated, filename is constructed safely
        localPath = path.join(destinationDir, `${name}_${counter}.${ext}`);
      } else {
        // nosemgrep: path-join-resolve-traversal - destinationDir is validated, filename is constructed safely
        localPath = path.join(destinationDir, `${sourceFilename}_${counter}`);
      }
      counter++;
    }
    return localPath;
  }

  /**
   * Decode base64 file data, write to workspace, and return the DownloadedFile descriptor.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private saveFileToWorkspace(sourcePath: string, result: any, destinationDir: string): DownloadedFile {
    const fileData = Buffer.from(result.data, 'base64');
    const sourceFilename = path.basename(sourcePath);
    const localPath = this.resolveUniqueLocalPath(destinationDir, sourceFilename);

    fs.writeFileSync(localPath, fileData);

    // Generate user-facing path by stripping WORKSPACE_DIRECTORY from local path.
    // Since workspace dir now mirrors S3 path hierarchy (e.g., /tmp/ws/dev2/file.png),
    // stripping /tmp/ws yields the correct display path (e.g., /dev2/file.png).
    const userPath = localPath.startsWith(WORKSPACE_DIRECTORY)
      ? localPath.slice(WORKSPACE_DIRECTORY.length) || `/${path.basename(localPath)}`
      : `/${path.basename(localPath)}`;

    return {
      sourcePath: sourcePath,
      localPath: localPath,
      userPath: userPath,
      size: result.size,
    };
  }

  /**
   * Build a markdown instruction string for referencing the downloaded files.
   */
  private buildDownloadInstruction(downloadedFiles: DownloadedFile[]): string {
    const exampleFile = downloadedFiles[0];
    const exampleExt = exampleFile ? path.extname(exampleFile.userPath).toLowerCase() : '';
    const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(exampleExt);
    const isVideo = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'].includes(exampleExt);

    let instruction = `✅ Files downloaded successfully. Use 'userPath' for references:\n`;

    if (isImage) {
      instruction += `Example: ![Image Description](${exampleFile.userPath})`;
    } else if (isVideo) {
      instruction += `Example: ![Video Description](${exampleFile.userPath}) or [Video](${exampleFile.userPath})`;
    } else {
      instruction += `Example: [File Name](${exampleFile.userPath})`;
    }

    return instruction;
  }

  /**
   * Create tool result from streaming response
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async createToolResult(response: any): Promise<ToolResult> {
    logger.debug(`Processing response: ${JSON.stringify(response, null, 2)}`);

    if (!response.stream) {
      return response;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = [];
    try {
      for await (const event of response.stream) {
        logger.debug(`Stream event: ${JSON.stringify(event)}`);

        if (event.result) {
          results.push(event.result);
        } else if (event.chunk) {
          results.push(event.chunk);
        } else {
          results.push(event);
        }
      }

      if (results.length === 0) {
        return this.formatErrorResult('No results received from stream');
      }

      return this.formatSuccessResult(results, response.isError || false);
    } catch (streamError) {
      logger.error(`Stream processing error: ${streamError}`);
      return this.formatErrorResult(`Stream processing failed: ${streamError}`);
    }
  }

  /**
   * Build a ToolResult from a non-empty stream results array.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private formatSuccessResult(results: any[], isError: boolean): ToolResult {
    const lastResult = results[results.length - 1];
    const content = lastResult.content || lastResult;
    const status = isError ? 'error' : 'success';
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    return { status, content: [{ text }] };
  }

  /**
   * Build an error ToolResult from a plain message string.
   */
  private formatErrorResult(errorMessage: string): ToolResult {
    return { status: 'error', content: [{ text: errorMessage }] };
  }

  /**
   * Cleanup processing
   */
  async cleanup(): Promise<void> {
    if (!this.persistSessions) {
      logger.info('Cleaning up Bedrock Agent Core platform resources');

      for (const [sessionName, sessionInfo] of this.sessions.entries()) {
        try {
          const command = new StopCodeInterpreterSessionCommand({
            codeInterpreterIdentifier: this.identifier,
            sessionId: sessionInfo.awsSessionId,
          });

          await this.client.send(command);
          logger.debug(`Stopped session: ${sessionName}`);
        } catch (error) {
          logger.debug(`Session ${sessionName} cleanup skipped: ${error}`);
        }
      }

      this.sessions.clear();
      logger.info('Bedrock AgentCore platform cleanup completed');
    } else {
      logger.debug('Skipping cleanup - sessions persist (persistSessions=true)');
    }
  }
}
