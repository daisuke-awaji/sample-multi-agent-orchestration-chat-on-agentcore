/**
 * AgentCore CodeInterpreter クライアント実装
 */

import {
  BedrockAgentCoreClient,
  StartCodeInterpreterSessionCommand,
  InvokeCodeInterpreterCommand,
  StopCodeInterpreterSessionCommand,
  GetCodeInterpreterSessionCommand,
} from '@aws-sdk/client-bedrock-agentcore';
import { logger } from '../../config/index.js';
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

// モジュールレベルのセッションキャッシュ - オブジェクト間で永続化
const sessionMapping: Map<string, string> = new Map();

/**
 * AgentCore CodeInterpreter クライアント
 */
export class AgentCoreCodeInterpreterClient {
  private region: string;
  private identifier: string;
  private sessions: Map<string, SessionInfo>;
  private autoCreate: boolean;
  private persistSessions: boolean;
  private defaultSession: string;
  private client: BedrockAgentCoreClient;

  constructor(options: CodeInterpreterOptions = {}) {
    this.region = options.region || process.env.AWS_REGION || 'us-east-1';
    this.identifier = options.identifier || 'aws.codeinterpreter.v1';
    this.autoCreate = options.autoCreate ?? true;
    this.persistSessions = options.persistSessions ?? true;

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
        `persistSessions=${this.persistSessions}`
    );
  }

  /**
   * セッションを初期化
   */
  async initSession(action: InitSessionAction): Promise<ToolResult> {
    logger.info(`Initializing Bedrock AgentCore sandbox session: ${action.description}`);

    const sessionName = action.sessionName;

    // インスタンスキャッシュに既に存在するかチェック
    if (this.sessions.has(sessionName)) {
      return {
        status: 'error',
        content: [{ text: `Session '${sessionName}' already exists` }],
      };
    }

    // モジュールレベルキャッシュで既に使用されているかチェック
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
      // セッション開始
      const command = new StartCodeInterpreterSessionCommand({
        codeInterpreterIdentifier: this.identifier,
        name: sessionName,
        sessionTimeoutSeconds: 900, // 15分
      });

      const response = await this.client.send(command);
      const awsSessionId = response.sessionId!;

      // モジュールレベルキャッシュに保存
      sessionMapping.set(sessionName, awsSessionId);

      // ローカルセッション情報を保存
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
   * セッション一覧を取得
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
   * セッションの存在確認・作成
   */
  private async ensureSession(sessionName?: string): Promise<[string, ToolResult | null]> {
    const targetSession = sessionName || this.defaultSession;

    logger.debug(`Ensuring session: ${targetSession}`);

    // ローカルキャッシュを確認
    if (this.sessions.has(targetSession)) {
      logger.debug(`Using cached session: ${targetSession}`);
      return [targetSession, null];
    }

    // モジュールレベルキャッシュを確認
    const awsSessionId = sessionMapping.get(targetSession);

    if (awsSessionId) {
      logger.debug(`Found session in module cache: ${targetSession} -> ${awsSessionId}`);

      try {
        // セッションの状態を確認
        const command = new GetCodeInterpreterSessionCommand({
          codeInterpreterIdentifier: this.identifier,
          sessionId: awsSessionId,
        });

        const sessionInfo = await this.client.send(command);

        if (sessionInfo.status === 'READY') {
          // セッションは準備完了 - 再接続
          this.sessions.set(targetSession, {
            sessionId: targetSession,
            description: 'Reconnected via module cache',
            awsSessionId: awsSessionId,
          });

          logger.info(`Reconnected to existing session: ${targetSession}`);
          return [targetSession, null];
        } else {
          // セッションが準備完了でない - キャッシュから削除
          logger.warn(`Session ${targetSession} not READY, removing from cache`);
          sessionMapping.delete(targetSession);
        }
      } catch (error) {
        // セッションが存在しないかエラー - キャッシュから削除
        logger.debug(`Session reconnection failed: ${error}`);
        sessionMapping.delete(targetSession);
      }
    }

    // セッションが見つからない場合
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

    // autoCreate=false でセッションが存在しない
    logger.debug(`Session '${targetSession}' not found (auto_create disabled)`);
    throw new Error(`Session '${targetSession}' not found. Create it first using initSession.`);
  }

  /**
   * コードを実行
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
   * コマンドを実行
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
   * ファイルを読み取り
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
   * ファイル一覧を取得
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
   * ファイルを削除
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
   * ファイルを書き込み
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
   * ファイルをダウンロード
   */
  async downloadFiles(action: DownloadFilesAction): Promise<ToolResult> {
    const [sessionName, error] = await this.ensureSession(action.sessionName);
    if (error) return error;

    logger.debug(`Downloading ${action.sourcePaths.length} files from session '${sessionName}'`);

    try {
      // 宛先ディレクトリの検証・作成
      if (!path.isAbsolute(action.destinationDir)) {
        return {
          status: 'error',
          content: [
            { text: `Destination directory must be an absolute path: ${action.destinationDir}` },
          ],
        };
      }

      // 宛先ディレクトリを作成（存在しない場合）
      fs.mkdirSync(action.destinationDir, { recursive: true });

      // サンドボックス内でファイルをbase64エンコードするPythonコードを生成
      const sourcePathsJson = JSON.stringify(action.sourcePaths);
      const encodeCode = `
import base64
import json
import os

results = {}
source_paths = ${sourcePathsJson}

for path in source_paths:
    try:
        if not os.path.exists(path):
            results[path] = {"error": f"File not found: {path}"}
            continue
            
        with open(path, 'rb') as f:
            file_data = f.read()
            results[path] = {
                "data": base64.b64encode(file_data).decode('utf-8'),
                "size": len(file_data)
            }
    except Exception as e:
        results[path] = {"error": f"Failed to read file {path}: {str(e)}"}

print("__DOWNLOAD_RESULTS__")
print(json.dumps(results))
print("__DOWNLOAD_RESULTS_END__")
`;

      // エンコードコードをサンドボックスで実行
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

      // 実行結果からbase64エンコードされた結果を抽出
      const content = executionResult.content[0];
      let outputText: string;

      if (content.text) {
        outputText = content.text;
      } else {
        outputText = JSON.stringify(content);
      }

      logger.debug(`Extracted text: ${outputText.substring(0, 200)}...`);

      // JSONリザルトをマーカー間から抽出
      const startMarker = '__DOWNLOAD_RESULTS__';
      const endMarker = '__DOWNLOAD_RESULTS_END__';

      const startIdx = outputText.indexOf(startMarker);
      const endIdx = outputText.indexOf(endMarker);

      if (startIdx === -1 || endIdx === -1) {
        return {
          status: 'error',
          content: [
            {
              text:
                `Could not find download results in output. ` +
                `Start marker found: ${startIdx >= 0}, End marker found: ${endIdx >= 0}. ` +
                `Output: ${outputText.substring(0, 1000)}...`,
            },
          ],
        };
      }

      const jsonStart = startIdx + startMarker.length;
      const resultsJson = outputText.substring(jsonStart, endIdx).trim();
      logger.debug(`Extracted JSON: '${resultsJson}'`);

      if (!resultsJson) {
        return {
          status: 'error',
          content: [{ text: `Empty JSON results between markers. Full output: ${outputText}` }],
        };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let fileResults: Record<string, any>;
      try {
        fileResults = JSON.parse(resultsJson);
      } catch (jsonError) {
        return {
          status: 'error',
          content: [
            {
              text:
                `Failed to parse download results JSON: ${jsonError}. ` +
                `JSON string: '${resultsJson}'. Full output: ${outputText}`,
            },
          ],
        };
      }

      // 各ファイル結果を処理
      const downloadedFiles: DownloadedFile[] = [];
      const errors: string[] = [];

      for (const [sourcePath, result] of Object.entries(fileResults)) {
        if ('error' in result) {
          errors.push(`${sourcePath}: ${result.error}`);
          continue;
        }

        try {
          // base64データをデコード
          const fileData = Buffer.from(result.data, 'base64');

          // ローカルファイルパスを決定
          const sourceFilename = path.basename(sourcePath);
          let localPath = path.join(action.destinationDir, sourceFilename);

          // ファイル名の重複を処理
          let counter = 1;
          const baseName = sourceFilename;
          while (fs.existsSync(localPath)) {
            if (baseName.includes('.')) {
              const nameExt = baseName.split('.');
              const ext = nameExt.pop();
              const name = nameExt.join('.');
              localPath = path.join(action.destinationDir, `${name}_${counter}.${ext}`);
            } else {
              localPath = path.join(action.destinationDir, `${baseName}_${counter}`);
            }
            counter++;
          }

          // ファイルをローカルファイルシステムに書き込み
          fs.writeFileSync(localPath, fileData);

          downloadedFiles.push({
            sourcePath: sourcePath,
            localPath: localPath,
            size: result.size,
          });

          logger.info(`Downloaded file: ${sourcePath} -> ${localPath} (${result.size} bytes)`);
        } catch (decodeError) {
          errors.push(`${sourcePath}: Failed to decode/save file: ${decodeError}`);
        }
      }

      // レスポンスを準備
      if (errors.length > 0 && downloadedFiles.length === 0) {
        return {
          status: 'error',
          content: [{ text: `All downloads failed: ${errors.join('; ')}` }],
        };
      }

      const responseData: DownloadResult = {
        downloadedFiles: downloadedFiles,
        totalFiles: downloadedFiles.length,
        destinationDir: action.destinationDir,
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
   * ストリーミングレスポンスからツール結果を作成
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async createToolResult(response: any): Promise<ToolResult> {
    logger.debug(`Processing response: ${JSON.stringify(response, null, 2)}`);

    if (response.stream) {
      // ストリーミングレスポンスを処理
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results: any[] = [];

      try {
        // AWS SDK v3 のストリーミングレスポンスを処理
        for await (const event of response.stream) {
          logger.debug(`Stream event: ${JSON.stringify(event)}`);

          if (event.result) {
            results.push(event.result);
          } else if (event.chunk) {
            // チャンク形式の場合
            results.push(event.chunk);
          } else {
            // その他のイベント形式
            results.push(event);
          }
        }

        if (results.length > 0) {
          // 最後の結果を使用
          const lastResult = results[results.length - 1];
          const isError = response.isError || false;

          // 結果の内容に応じてフォーマット
          const content = lastResult.content || lastResult;
          if (typeof content === 'string') {
            return {
              status: isError ? 'error' : 'success',
              content: [{ text: content }],
            };
          } else {
            return {
              status: isError ? 'error' : 'success',
              content: [{ text: JSON.stringify(content) }],
            };
          }
        }

        return {
          status: 'error',
          content: [{ text: 'No results received from stream' }],
        };
      } catch (streamError) {
        logger.error(`Stream processing error: ${streamError}`);
        return {
          status: 'error',
          content: [{ text: `Stream processing failed: ${streamError}` }],
        };
      }
    }

    // ストリーミングではないレスポンス
    return response;
  }

  /**
   * クリーンアップ処理
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
