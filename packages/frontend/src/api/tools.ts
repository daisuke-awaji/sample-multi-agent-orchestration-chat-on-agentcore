/**
 * ツール管理 API クライアント
 * Backend のツール API を呼び出すためのクライアント
 */

import { getValidAccessToken } from '../lib/cognito';

/**
 * MCP ツールの型定義
 */
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * ローカルツール定義（エージェント内蔵ツール）
 * AgentCore Gateway ではなく、エージェント内で直接実装されているツール
 */
export const LOCAL_TOOLS: MCPTool[] = [
  {
    name: 'execute_command',
    description:
      'シェルコマンドを実行し、結果を返します。ファイル操作、情報収集、開発タスクの自動化に使用できます。',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: '実行するシェルコマンド',
        },
        workingDirectory: {
          type: 'string',
          description: '作業ディレクトリ（未指定の場合は現在のディレクトリ）',
        },
        timeout: {
          type: 'number',
          minimum: 1000,
          maximum: 60000,
          default: 30000,
          description: 'タイムアウト（ミリ秒、デフォルト: 30秒、最大: 60秒）',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'tavily_search',
    description:
      'Tavily APIを使用して高品質なWeb検索を実行します。最新の情報、ニュース、一般的な話題について包括的な検索結果を取得できます。',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '検索クエリ（必須）',
        },
        searchDepth: {
          type: 'string',
          enum: ['basic', 'advanced'],
          default: 'basic',
          description: '検索深度。basicは1クレジット、advancedは2クレジット使用',
        },
        topic: {
          type: 'string',
          enum: ['general', 'news', 'finance'],
          default: 'general',
          description: '検索カテゴリ。newsは最新情報、generalは一般検索',
        },
        maxResults: {
          type: 'number',
          minimum: 1,
          maximum: 20,
          default: 5,
          description: '取得する最大検索結果数（1-20）',
        },
        includeAnswer: {
          type: 'boolean',
          default: true,
          description: 'LLM生成の要約回答を含める',
        },
        timeRange: {
          type: 'string',
          enum: ['day', 'week', 'month', 'year', 'd', 'w', 'm', 'y'],
          description: '時間範囲フィルター（過去の期間で絞り込み）',
        },
        includeDomains: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: '検索対象に含めるドメインのリスト',
        },
        excludeDomains: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: '検索対象から除外するドメインのリスト',
        },
        includeImages: {
          type: 'boolean',
          default: false,
          description: '関連画像も取得する',
        },
        country: {
          type: 'string',
          description: '特定の国の結果を優先（例: japan, united states）',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'tavily_extract',
    description:
      'Tavily APIを使用して指定されたURLからコンテンツを抽出します。Webページの内容を構造化されたテキストとして取得できます。',
    inputSchema: {
      type: 'object',
      properties: {
        urls: {
          oneOf: [
            { type: 'string' },
            {
              type: 'array',
              items: { type: 'string' },
            },
          ],
          description: '抽出対象のURL（単一URLまたはURL配列）',
        },
        query: {
          type: 'string',
          description: 'リランキング用クエリ。指定すると関連性の高いコンテンツが優先されます',
        },
        extractDepth: {
          type: 'string',
          enum: ['basic', 'advanced'],
          default: 'basic',
          description: '抽出深度。basicは1クレジット/5URL、advancedは2クレジット/5URL',
        },
        format: {
          type: 'string',
          enum: ['markdown', 'text'],
          default: 'markdown',
          description: '出力フォーマット。markdownまたはtext',
        },
        chunksPerSource: {
          type: 'number',
          minimum: 1,
          maximum: 5,
          default: 3,
          description: 'ソースあたりのチャンク数（1-5、queryが指定された場合のみ有効）',
        },
        includeImages: {
          type: 'boolean',
          default: false,
          description: '画像情報を含めるかどうか',
        },
        timeout: {
          type: 'number',
          minimum: 1,
          maximum: 60,
          default: 30,
          description: 'タイムアウト（秒、1-60）',
        },
      },
      required: ['urls'],
    },
  },
  {
    name: 'tavily_crawl',
    description:
      'Tavily APIを使用してWebサイトを包括的にクロールします。指定されたルートURLから始まり、関連するページを自動的に発見・抽出します。',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'クロール開始URL',
        },
        instructions: {
          type: 'string',
          description: 'クロールの指示（自然言語）。指定すると使用コストが2倍になります',
        },
        maxDepth: {
          type: 'number',
          minimum: 1,
          maximum: 5,
          default: 1,
          description: '最大探索深度（1-5、ベースURLからどこまで離れるか）',
        },
        maxBreadth: {
          type: 'number',
          minimum: 1,
          default: 20,
          description: 'ページごとの最大リンク数（1以上）',
        },
        limit: {
          type: 'number',
          minimum: 1,
          default: 50,
          description: '処理する最大リンク数（1以上）',
        },
        selectPaths: {
          type: 'array',
          items: { type: 'string' },
          description: '含めるパスの正規表現パターン（例: ["/docs/.*", "/api/v1.*"]）',
        },
        selectDomains: {
          type: 'array',
          items: { type: 'string' },
          description: '含めるドメインの正規表現パターン（例: ["^docs\\.example\\.com$"]）',
        },
        excludePaths: {
          type: 'array',
          items: { type: 'string' },
          description: '除外するパスの正規表現パターン（例: ["/private/.*", "/admin/.*"]）',
        },
        excludeDomains: {
          type: 'array',
          items: { type: 'string' },
          description: '除外するドメインの正規表現パターン（例: ["^private\\.example\\.com$"]）',
        },
        allowExternal: {
          type: 'boolean',
          default: true,
          description: '外部ドメインリンクを結果に含めるかどうか',
        },
        extractDepth: {
          type: 'string',
          enum: ['basic', 'advanced'],
          default: 'basic',
          description: '抽出深度。basicは1クレジット/5抽出、advancedは2クレジット/5抽出',
        },
        format: {
          type: 'string',
          enum: ['markdown', 'text'],
          default: 'markdown',
          description: '出力フォーマット。markdownまたはtext',
        },
        includeImages: {
          type: 'boolean',
          default: false,
          description: '画像情報を含めるかどうか',
        },
        chunksPerSource: {
          type: 'number',
          minimum: 1,
          maximum: 5,
          default: 3,
          description: 'ソースあたりのチャンク数（1-5、instructionsが指定された場合のみ有効）',
        },
        timeout: {
          type: 'number',
          minimum: 10,
          maximum: 150,
          default: 150,
          description: 'タイムアウト（秒、10-150）',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'code_interpreter',
    description:
      'Amazon Bedrock AgentCore CodeInterpreter ツール - セキュアなサンドボックス環境でコード実行やファイル操作を行います。Python、JavaScript、TypeScript のコード実行、シェルコマンド実行、ファイル操作（読み取り、書き込み、削除）、セッション管理などの機能を提供します。',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'initSession',
            'executeCode',
            'executeCommand',
            'readFiles',
            'listFiles',
            'removeFiles',
            'writeFiles',
            'downloadFiles',
            'listLocalSessions',
          ],
          description: '実行する操作',
        },
        sessionName: {
          type: 'string',
          description: 'セッション名（省略時はデフォルト）',
        },
        description: {
          type: 'string',
          description: 'セッションの説明（initSession時）',
        },
        language: {
          type: 'string',
          enum: ['python', 'javascript', 'typescript'],
          description: 'コード実行時の言語',
        },
        code: {
          type: 'string',
          description: '実行するコード',
        },
        clearContext: {
          type: 'boolean',
          default: false,
          description: 'コンテキストをクリアするか',
        },
        command: {
          type: 'string',
          description: '実行するシェルコマンド',
        },
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'ファイルパスの配列',
        },
        path: {
          type: 'string',
          description: 'ディレクトリパス',
        },
        content: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              text: { type: 'string' },
            },
            required: ['path', 'text'],
          },
          description: '書き込むファイルの配列',
        },
        sourcePaths: {
          type: 'array',
          items: { type: 'string' },
          description: 'ダウンロードするファイルパスの配列',
        },
        destinationDir: {
          type: 'string',
          description: 'ダウンロード先ディレクトリ（絶対パス）',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 's3_list_files',
    description:
      'ユーザーのS3ストレージ内のファイルとディレクトリの一覧を取得します。指定されたパス配下のコンテンツを探索できます。',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          default: '/',
          description: '一覧を取得するディレクトリパス（デフォルト: ルート "/"）',
        },
        recursive: {
          type: 'boolean',
          default: false,
          description: '再帰的にサブディレクトリも含めて取得するか（デフォルト: false）',
        },
        maxResults: {
          type: 'number',
          minimum: 1,
          maximum: 1000,
          default: 100,
          description: '取得する最大結果数（1-1000、デフォルト: 100）',
        },
      },
      required: [],
    },
  },
  {
    name: 's3_download_file',
    description:
      'ユーザーのS3ストレージからファイルをダウンロードまたは読み取ります。テキストファイルの場合は内容を直接取得し、大きなファイルやバイナリファイルの場合は署名付きダウンロードURLを生成します。',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'ダウンロード・読み取りするファイルのパス（必須）',
        },
        returnContent: {
          type: 'boolean',
          default: true,
          description:
            'テキストファイルの内容を直接返すか（デフォルト: true）。falseの場合は常に署名付きURLを返す',
        },
        maxContentLength: {
          type: 'number',
          minimum: 1024,
          maximum: 1048576,
          default: 512000,
          description: '内容を取得する場合の最大サイズ（バイト）。デフォルト: 500KB、最大: 1MB',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 's3_upload_file',
    description:
      'ユーザーのS3ストレージにテキストコンテンツをファイルとしてアップロードします。コード、ドキュメント、設定ファイルなどを保存できます。注意: 日本語や非ASCII文字を含むファイルをアップロードする際は、contentTypeにcharsetを指定してください（例: "text/plain; charset=utf-8"）。',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'アップロード先のファイルパス（必須）。例: "/notes/memo.txt", "/code/sample.py"',
        },
        content: {
          type: 'string',
          description: 'ファイルの内容（必須）。テキストベースのコンテンツ',
        },
        contentType: {
          type: 'string',
          description:
            'MIMEタイプ（オプション）。指定しない場合はファイル名から自動推測。例: "text/plain", "application/json"',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 's3_get_presigned_urls',
    description:
      'ユーザーのS3ストレージ内のファイルに対する署名付きURLを一括で生成します。ダウンロード用またはアップロード用のURLを取得できます。複数のファイルを一度に処理できます。',
    inputSchema: {
      type: 'object',
      properties: {
        paths: {
          oneOf: [
            { type: 'string' },
            {
              type: 'array',
              items: { type: 'string' },
            },
          ],
          description: 'ファイルパス（単一の文字列または文字列の配列）',
        },
        operation: {
          type: 'string',
          enum: ['download', 'upload'],
          default: 'download',
          description: '操作タイプ: "download"（ダウンロード用）または "upload"（アップロード用）',
        },
        expiresIn: {
          type: 'number',
          minimum: 60,
          maximum: 604800,
          default: 3600,
          description:
            '署名付きURLの有効期限（秒）。デフォルト: 3600（1時間）、最大: 604800（7日間）',
        },
        contentType: {
          type: 'string',
          description: 'アップロード操作の場合のContent-Type（オプション）',
        },
      },
      required: ['paths'],
    },
  },
  {
    name: 's3_sync_folder',
    description:
      'S3ストレージからフォルダ全体をローカル環境（Agent実行コンテナ）にダウンロードします。aws s3 syncコマンド相当の機能を提供し、複数ファイルを一括で同期できます。',
    inputSchema: {
      type: 'object',
      properties: {
        s3Path: {
          type: 'string',
          description: 'S3上のフォルダパス（例: "/project/data"）',
        },
        localPath: {
          type: 'string',
          description: 'ローカルの保存先パス（/tmp/ws配下のみ、例: "/tmp/ws/data"）',
        },
        recursive: {
          type: 'boolean',
          default: true,
          description: 'サブディレクトリも含めて同期するか（デフォルト: true）',
        },
        overwrite: {
          type: 'boolean',
          default: false,
          description: '既存ファイルを上書きするか（デフォルト: false）',
        },
        maxConcurrency: {
          type: 'number',
          minimum: 1,
          maximum: 10,
          default: 5,
          description: '並列ダウンロード数（1-10、デフォルト: 5）',
        },
        maxFiles: {
          type: 'number',
          minimum: 1,
          maximum: 1000,
          default: 100,
          description: '最大ダウンロードファイル数（1-1000、デフォルト: 100）',
        },
        filePattern: {
          type: 'string',
          description: 'ファイル名フィルタ（globパターン、例: "*.txt", "data_*.json"）',
        },
      },
      required: ['s3Path', 'localPath'],
    },
  },
];

/**
 * API レスポンスの型定義
 */
interface ToolsResponse {
  tools: MCPTool[];
  nextCursor?: string; // ページネーション用
  metadata: {
    requestId: string;
    timestamp: string;
    actorId: string;
    count: number;
    query?: string; // 検索の場合のみ
  };
}

interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  gateway: {
    connected: boolean;
    endpoint: string;
  };
  metadata: {
    requestId: string;
    timestamp: string;
    actorId: string;
  };
}

/**
 * Backend API のベース URL を取得
 */
function getBackendBaseUrl(): string {
  // 環境変数から取得、未設定の場合はデフォルト値を使用
  const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

  // 末尾のスラッシュを除去してダブルスラッシュ問題を防ぐ
  return baseUrl.replace(/\/$/, '');
}

/**
 * 認証ヘッダーを作成（自動トークンリフレッシュ対応）
 * @returns Authorization ヘッダー
 */
async function createAuthHeaders(): Promise<Record<string, string>> {
  // getValidAccessToken() は必要に応じて自動でトークンをリフレッシュ
  const accessToken = await getValidAccessToken();

  if (!accessToken) {
    throw new Error('認証トークンの取得に失敗しました。再ログインが必要です。');
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

/**
 * ツール一覧を取得（ページネーション対応）
 * @param cursor ページネーション用のカーソル（オプショナル）
 * @returns ツール一覧とnextCursor
 */
export async function fetchTools(cursor?: string): Promise<{
  tools: MCPTool[];
  nextCursor?: string;
}> {
  try {
    const baseUrl = getBackendBaseUrl();
    const headers = await createAuthHeaders();

    // cursorパラメータがある場合はクエリに追加
    const url = cursor
      ? `${baseUrl}/tools?cursor=${encodeURIComponent(cursor)}`
      : `${baseUrl}/tools`;

    console.log('🔧 ツール一覧取得開始...', cursor ? { cursor } : {});

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `ツール一覧の取得に失敗しました: ${response.status} ${response.statusText} - ${
          errorData.message || 'Unknown error'
        }`
      );
    }

    const data: ToolsResponse = await response.json();
    console.log(
      `✅ ツール一覧取得完了: ${data.tools.length}件`,
      data.nextCursor ? { nextCursor: 'あり' } : { nextCursor: 'なし' }
    );

    return {
      tools: data.tools,
      nextCursor: data.nextCursor,
    };
  } catch (error) {
    console.error('💥 ツール一覧取得エラー:', error);
    throw error;
  }
}

/**
 * ローカル MCP ツール取得
 * ユーザー定義の MCP サーバー設定からツール一覧を取得
 * @param mcpConfig mcp.json 形式の MCP サーバー設定
 * @returns ツール一覧（サーバー名付き）
 */
export async function fetchLocalMCPTools(
  mcpConfig: Record<string, unknown>
): Promise<(MCPTool & { serverName: string })[]> {
  try {
    const baseUrl = getBackendBaseUrl();
    const headers = await createAuthHeaders();

    console.log('🔧 ローカル MCP ツール取得開始...');

    const response = await fetch(`${baseUrl}/tools/local`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ mcpConfig }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `ローカル MCP ツール取得失敗: ${response.status} ${response.statusText} - ${
          errorData.message || 'Unknown error'
        }`
      );
    }

    const data = await response.json();
    console.log(`✅ ローカル MCP ツール取得完了: ${data.tools.length}件`);

    return data.tools;
  } catch (error) {
    console.error('💥 ローカル MCP ツール取得エラー:', error);
    throw error;
  }
}

/**
 * ツールを検索
 * @param query 検索クエリ
 * @returns 検索結果のツール一覧
 */
export async function searchTools(query: string): Promise<MCPTool[]> {
  if (!query || query.trim().length === 0) {
    throw new Error('検索クエリが必要です');
  }

  try {
    const baseUrl = getBackendBaseUrl();
    const headers = await createAuthHeaders();

    console.log(`🔍 ツール検索開始: "${query}"`);

    const response = await fetch(`${baseUrl}/tools/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query: query.trim(),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `ツール検索に失敗しました: ${response.status} ${response.statusText} - ${
          errorData.message || 'Unknown error'
        }`
      );
    }

    const data: ToolsResponse = await response.json();
    console.log(`✅ ツール検索完了: ${data.tools.length}件 (クエリ: "${query}")`);

    return data.tools;
  } catch (error) {
    console.error('💥 ツール検索エラー:', error);
    throw error;
  }
}

/**
 * Gateway 接続状態を確認
 * @returns 接続状態情報
 */
export async function checkGatewayHealth(): Promise<HealthResponse> {
  try {
    const baseUrl = getBackendBaseUrl();
    const headers = await createAuthHeaders();

    console.log('💓 Gateway 接続確認開始...');

    const response = await fetch(`${baseUrl}/tools/health`, {
      method: 'GET',
      headers,
    });

    const data: HealthResponse = await response.json();

    if (!response.ok) {
      console.warn(`⚠️ Gateway 接続確認警告: ${response.status} ${response.statusText}`);
    } else {
      console.log('✅ Gateway 接続確認完了:', data.status);
    }

    return data;
  } catch (error) {
    console.error('💥 Gateway 接続確認エラー:', error);
    throw error;
  }
}
