/**
 * CodeInterpreter ツールの型定義
 */

export type LanguageType = 'python' | 'javascript' | 'typescript';

/**
 * ツールの実行結果
 */
export interface ToolResult {
  status: 'success' | 'error';
  content: Array<{ text?: string; json?: unknown }>;
}

/**
 * セッション初期化アクション
 */
export interface InitSessionAction {
  action: 'initSession';
  sessionName: string;
  description: string;
}

/**
 * コード実行アクション
 */
export interface ExecuteCodeAction {
  action: 'executeCode';
  sessionName: string;
  language: LanguageType;
  code: string;
  clearContext?: boolean;
}

/**
 * コマンド実行アクション
 */
export interface ExecuteCommandAction {
  action: 'executeCommand';
  sessionName: string;
  command: string;
}

/**
 * ファイル読み取りアクション
 */
export interface ReadFilesAction {
  action: 'readFiles';
  sessionName: string;
  paths: string[];
}

/**
 * ファイル一覧表示アクション
 */
export interface ListFilesAction {
  action: 'listFiles';
  sessionName: string;
  path: string;
}

/**
 * ファイル削除アクション
 */
export interface RemoveFilesAction {
  action: 'removeFiles';
  sessionName: string;
  paths: string[];
}

/**
 * ファイル書き込み用のコンテンツ
 */
export interface FileContent {
  path: string;
  text: string;
}

/**
 * ファイル書き込みアクション
 */
export interface WriteFilesAction {
  action: 'writeFiles';
  sessionName: string;
  content: FileContent[];
}

/**
 * ファイルダウンロードアクション
 */
export interface DownloadFilesAction {
  action: 'downloadFiles';
  sessionName: string;
  sourcePaths: string[];
  destinationDir: string;
}

/**
 * セッション一覧表示アクション
 */
export interface ListLocalSessionsAction {
  action: 'listLocalSessions';
}

/**
 * CodeInterpreter の全アクション
 */
export type CodeInterpreterAction =
  | InitSessionAction
  | ExecuteCodeAction
  | ExecuteCommandAction
  | ReadFilesAction
  | ListFilesAction
  | RemoveFilesAction
  | WriteFilesAction
  | DownloadFilesAction
  | ListLocalSessionsAction;

/**
 * セッション情報
 */
export interface SessionInfo {
  sessionId: string;
  description: string;
  awsSessionId: string;
}

/**
 * CodeInterpreter クライアントのオプション
 */
export interface CodeInterpreterOptions {
  region?: string;
  identifier?: string;
  sessionName?: string;
  autoCreate?: boolean;
  persistSessions?: boolean;
  storagePath?: string; // User's storage path for generating correct file references
}

/**
 * ファイルダウンロード結果
 */
export interface DownloadedFile {
  sourcePath: string;
  localPath: string;
  userPath: string; // User-facing path for references (e.g., /storage/filename.png)
  size: number;
}

/**
 * ダウンロード結果
 */
export interface DownloadResult {
  downloadedFiles: DownloadedFile[];
  totalFiles: number;
  destinationDir: string;
  storagePath?: string; // Storage path prefix for instruction
  instruction?: string; // Instruction for using userPath
  errors?: string[];
}
