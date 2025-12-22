/**
 * AgentCore Memory サービス層
 * セッション管理とイベント取得のためのサービス
 */

import {
  BedrockAgentCoreClient,
  ListSessionsCommand,
  ListEventsCommand,
  ListMemoryRecordsCommand,
  DeleteMemoryRecordCommand,
  RetrieveMemoryRecordsCommand,
} from '@aws-sdk/client-bedrock-agentcore';
import {
  BedrockAgentCoreControlClient,
  GetMemoryCommand,
} from '@aws-sdk/client-bedrock-agentcore-control';
import { config } from '../config/index.js';

/**
 * AWS SDK の型定義が不完全な部分を補完する型定義
 */
interface MemoryRecordSummary {
  memoryRecordId?: string;
  content?: string | { text?: string };
  createdAt?: Date;
  namespaces?: string[];
  memoryStrategyId?: string;
  metadata?: Record<string, unknown>;
}

interface DeleteMemoryRecordParams {
  memoryId: string;
  namespace: string;
  memoryStrategyId: string;
  memoryRecordId: string;
}

interface RetrieveMemoryRecordsParams {
  memoryId: string;
  namespace: string;
  searchCriteria: {
    searchQuery: string;
    memoryStrategyId: string;
    topK: number;
  };
  maxResults: number;
}

/**
 * セッション情報の型定義（Frontend 向けに整形済み）
 */
export interface SessionSummary {
  sessionId: string;
  title: string; // 最初のユーザーメッセージから生成
  lastMessage: string; // 最後のメッセージ
  messageCount: number;
  createdAt: string; // ISO 8601 文字列
  updatedAt: string; // ISO 8601 文字列
}

/**
 * ToolUse 型定義
 */
export interface ToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status?: 'pending' | 'running' | 'completed' | 'error';
  originalToolUseId?: string;
}

/**
 * ToolResult 型定義
 */
export interface ToolResult {
  toolUseId: string;
  content: string;
  isError: boolean;
}

/**
 * MessageContent 型定義（Union型）
 */
export type MessageContent =
  | { type: 'text'; text: string }
  | { type: 'toolUse'; toolUse: ToolUse }
  | { type: 'toolResult'; toolResult: ToolResult };

/**
 * イベント情報の型定義（Frontend 向けに整形済み）
 */
export interface ConversationMessage {
  id: string;
  type: 'user' | 'assistant';
  contents: MessageContent[];
  timestamp: string; // ISO 8601 文字列
}

/**
 * Conversational Payload の型定義
 */
interface ConversationalPayload {
  conversational: {
    role: string;
    content: {
      text: string;
    };
  };
}

/**
 * Strands ContentBlock の型定義
 */
interface StrandsContentBlock {
  type: string;
  text?: string;
  name?: string;
  toolUseId?: string;
  input?: Record<string, unknown>;
  content?: unknown;
  status?: string;
}

/**
 * Blob データの内容型定義（新形式）
 */
interface BlobData {
  messageType: 'content';
  role: string;
  content: StrandsContentBlock[]; // Strands ContentBlock の配列
}

/**
 * Strands ContentBlock から MessageContent への変換
 * @param contentBlocks Strands SDK の ContentBlock 配列
 * @returns MessageContent 配列
 */
function convertToMessageContents(contentBlocks: StrandsContentBlock[]): MessageContent[] {
  const messageContents: MessageContent[] = [];

  for (const block of contentBlocks) {
    if (!block || typeof block !== 'object') continue;

    switch (block.type) {
      case 'textBlock':
        if ('text' in block && typeof block.text === 'string') {
          messageContents.push({ type: 'text', text: block.text });
        }
        break;

      case 'toolUseBlock':
        if (
          'name' in block &&
          'toolUseId' in block &&
          'input' in block &&
          block.name &&
          block.toolUseId &&
          block.input !== undefined
        ) {
          messageContents.push({
            type: 'toolUse',
            toolUse: {
              id: block.toolUseId,
              name: block.name,
              input: block.input || {},
              status: 'completed', // デフォルトステータス
              originalToolUseId: block.toolUseId,
            },
          });
        }
        break;

      case 'toolResultBlock':
        if ('toolUseId' in block && block.toolUseId) {
          messageContents.push({
            type: 'toolResult',
            toolResult: {
              toolUseId: block.toolUseId,
              content:
                typeof block.content === 'string'
                  ? block.content
                  : JSON.stringify(block.content || {}),
              isError: block.status === 'error' || false,
            },
          });
        }
        break;

      default:
        console.warn(`[AgentCoreMemoryService] Unknown ContentBlock type: ${block.type}`);
        break;
    }
  }

  return messageContents;
}

/**
 * blob payload をパースする
 * @param blob Uint8Array または Buffer または base64文字列
 * @returns パース済み BlobData
 */
function parseBlobPayload(blob: Uint8Array | Buffer | unknown): BlobData | null {
  try {
    let blobString: string;

    // Uint8Array の場合
    if (blob instanceof Uint8Array) {
      const decoder = new TextDecoder();
      blobString = decoder.decode(blob);
    }
    // Buffer の場合
    else if (typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(blob)) {
      blobString = (blob as Buffer).toString('utf8');
    }
    // 文字列の場合（AWS SDK からの base64 エンコード文字列）
    else if (typeof blob === 'string') {
      try {
        // base64 デコードを試行
        const decodedBuffer = Buffer.from(blob, 'base64');
        blobString = decodedBuffer.toString('utf8');
        console.log('[AgentCoreMemoryService] Successfully decoded base64 blob');
      } catch {
        // base64 でない場合は直接使用
        console.log('[AgentCoreMemoryService] Using blob as plain string');
        blobString = blob;
      }
    }
    // その他の場合
    else {
      console.warn('[AgentCoreMemoryService] Unknown blob type:', typeof blob);
      return null;
    }

    const blobData = JSON.parse(blobString) as BlobData;
    console.log(
      `[AgentCoreMemoryService] Parsed blob data: messageType=${blobData.messageType}, role=${blobData.role}, contentBlocks=${blobData.content?.length || 0}`
    );
    return blobData.messageType === 'content' ? blobData : null;
  } catch (error) {
    console.error('[AgentCoreMemoryService] Failed to parse blob payload:', error);
    console.error(
      '[AgentCoreMemoryService] Raw blob sample:',
      typeof blob === 'string' ? blob.substring(0, 100) + '...' : typeof blob
    );
    return null;
  }
}

/**
 * MessageContent 配列から最初のテキストを抽出（タイトル生成用）
 * @param contents MessageContent 配列
 * @returns 最初のテキスト文字列
 */
function extractFirstText(contents: MessageContent[]): string {
  const firstTextContent = contents.find((content) => content.type === 'text');
  return firstTextContent?.text || '';
}

/**
 * 長期記憶レコードの型定義
 */
export interface MemoryRecord {
  recordId: string;
  namespace: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 長期記憶レコード一覧の型定義
 */
export interface MemoryRecordList {
  records: MemoryRecord[];
  nextToken?: string;
}

/**
 * AgentCore Memory サービスクラス
 */
export class AgentCoreMemoryService {
  private client: BedrockAgentCoreClient;
  private controlClient: BedrockAgentCoreControlClient;
  private memoryId: string;
  private region: string;
  private cachedStrategyId: string | null = null;

  constructor(memoryId?: string, region: string = 'us-east-1') {
    if (!memoryId) {
      throw new Error('AgentCore Memory ID が設定されていません');
    }

    this.client = new BedrockAgentCoreClient({ region });
    this.controlClient = new BedrockAgentCoreControlClient({ region });
    this.memoryId = memoryId;
    this.region = region;
  }

  /**
   * セマンティックメモリ戦略IDを取得（キャッシュ付き）
   * @returns セマンティックメモリ戦略ID
   */
  async getSemanticMemoryStrategyId(): Promise<string> {
    if (this.cachedStrategyId) {
      console.log(
        `[AgentCoreMemoryService] キャッシュされた strategyId を使用: ${this.cachedStrategyId}`
      );
      return this.cachedStrategyId;
    }

    try {
      console.log(
        `[AgentCoreMemoryService] GetMemory API で strategyId を取得中: memoryId=${this.memoryId}`
      );

      const command = new GetMemoryCommand({
        memoryId: this.memoryId,
      });

      const response = await this.controlClient.send(command);

      if (!response.memory?.strategies || response.memory.strategies.length === 0) {
        console.warn('[AgentCoreMemoryService] Memory に strategies が見つかりません');
        this.cachedStrategyId = 'semantic_memory_strategy'; // フォールバック
        return this.cachedStrategyId;
      }

      // name が 'semantic_memory_strategy' で始まる strategy を検索
      const semanticStrategy = response.memory.strategies.find((strategy) =>
        strategy.name?.startsWith('semantic_memory_strategy')
      );

      if (semanticStrategy?.strategyId) {
        this.cachedStrategyId = semanticStrategy.strategyId;
        console.log(
          `[AgentCoreMemoryService] セマンティック戦略ID を取得: ${this.cachedStrategyId}`
        );
      } else {
        console.warn(
          '[AgentCoreMemoryService] セマンティック戦略が見つかりません、フォールバックを使用'
        );
        this.cachedStrategyId = 'semantic_memory_strategy'; // フォールバック
      }

      return this.cachedStrategyId;
    } catch (error) {
      console.error('[AgentCoreMemoryService] GetMemory API エラー:', error);
      // エラー時はフォールバック値を使用
      this.cachedStrategyId = 'semantic_memory_strategy';
      return this.cachedStrategyId;
    }
  }

  /**
   * 指定されたアクターのセッション一覧を取得
   * @param actorId ユーザーID（JWT の sub）
   * @returns セッション一覧
   */
  async listSessions(actorId: string): Promise<SessionSummary[]> {
    try {
      console.log(`[AgentCoreMemoryService] セッション一覧を取得中: actorId=${actorId}`);

      const command = new ListSessionsCommand({
        memoryId: this.memoryId,
        actorId: actorId,
      });

      const response = await this.client.send(command);

      if (!response.sessionSummaries || response.sessionSummaries.length === 0) {
        console.log(
          `[AgentCoreMemoryService] セッションが見つかりませんでした: actorId=${actorId}`
        );
        return [];
      }

      // セッション一覧を軽量形式で返却（詳細取得は行わない）
      const sessions: SessionSummary[] = response.sessionSummaries
        .filter((sessionSummary) => sessionSummary.sessionId)
        .map((sessionSummary) => ({
          sessionId: sessionSummary.sessionId!,
          title: 'セッション名', // 固定タイトル
          lastMessage: '会話を選択して履歴を表示', // 固定メッセージ
          messageCount: 0, // 詳細取得しないため 0
          createdAt: sessionSummary.createdAt?.toISOString() || new Date().toISOString(),
          updatedAt: sessionSummary.createdAt?.toISOString() || new Date().toISOString(),
        }));

      // 作成日時の降順でソート（最新のセッションが上に）
      sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      console.log(`[AgentCoreMemoryService] ${sessions.length} 件のセッションを取得しました`);
      return sessions;
    } catch (error) {
      // 新規ユーザーでActorが存在しない場合は空配列を返す
      if (error instanceof Error && error.name === 'ResourceNotFoundException') {
        console.log(
          `[AgentCoreMemoryService] 新規ユーザーのため空のセッション一覧を返却: actorId=${actorId}`
        );
        return [];
      }
      console.error('[AgentCoreMemoryService] セッション一覧取得エラー:', error);
      throw error;
    }
  }

  /**
   * 指定されたセッションの会話履歴を取得
   * @param actorId ユーザーID
   * @param sessionId セッションID
   * @returns 会話履歴
   */
  async getSessionEvents(actorId: string, sessionId: string): Promise<ConversationMessage[]> {
    try {
      console.log(`[AgentCoreMemoryService] セッションイベントを取得中: sessionId=${sessionId}`);

      const command = new ListEventsCommand({
        memoryId: this.memoryId,
        actorId: actorId,
        sessionId: sessionId,
        includePayloads: true,
        maxResults: 100, // 最大100件を取得
      });

      const response = await this.client.send(command);

      if (!response.events) {
        console.log(
          `[AgentCoreMemoryService] イベントが見つかりませんでした: sessionId=${sessionId}`
        );
        return [];
      }

      // Events を時系列順にソート
      const sortedEvents = response.events.sort((a, b) => {
        const timestampA = a.eventTimestamp ? new Date(a.eventTimestamp).getTime() : 0;
        const timestampB = b.eventTimestamp ? new Date(b.eventTimestamp).getTime() : 0;
        return timestampA - timestampB;
      });

      // Events から ConversationMessage に変換
      const messages: ConversationMessage[] = [];

      for (const event of sortedEvents) {
        if (event.payload && event.payload.length > 0) {
          for (const payloadItem of event.payload) {
            // ケース1: conversational payload（テキストのみ）
            if ('conversational' in payloadItem) {
              const conversationalPayload = payloadItem as ConversationalPayload;
              const role = conversationalPayload.conversational.role;
              const text = conversationalPayload.conversational.content.text;

              messages.push({
                id: event.eventId || `event_${messages.length}`,
                type: role === 'USER' ? 'user' : 'assistant',
                contents: [{ type: 'text', text }],
                timestamp: event.eventTimestamp?.toISOString() || new Date().toISOString(),
              });
            }

            // ケース2: blob payload（toolUse/toolResult含む）
            else if ('blob' in payloadItem && payloadItem.blob) {
              const blobData = parseBlobPayload(payloadItem.blob);

              if (blobData) {
                const messageContents = convertToMessageContents(blobData.content);

                messages.push({
                  id: event.eventId || `event_${messages.length}`,
                  type: blobData.role === 'user' ? 'user' : 'assistant',
                  contents: messageContents,
                  timestamp: event.eventTimestamp?.toISOString() || new Date().toISOString(),
                });
              }
            }
          }
        }
      }

      console.log(`[AgentCoreMemoryService] ${messages.length} 件のメッセージを取得しました`);
      return messages;
    } catch (error) {
      console.error('[AgentCoreMemoryService] セッションイベント取得エラー:', error);
      throw error;
    }
  }

  /**
   * セッションの詳細情報を取得（タイトルと最終メッセージを生成）
   * @param actorId ユーザーID
   * @param sessionId セッションID
   * @returns セッション詳細
   * @private
   */
  private async getSessionDetail(actorId: string, sessionId: string): Promise<SessionSummary> {
    const messages = await this.getSessionEvents(actorId, sessionId);

    // タイトルを生成（最初のユーザーメッセージを使用）
    let title = `セッション ${sessionId.slice(0, 8)}...`;
    const firstUserMessage = messages.find((m) => m.type === 'user');
    if (firstUserMessage) {
      const firstText = extractFirstText(firstUserMessage.contents);
      // 最大50文字に切り詰め
      title = firstText.length > 50 ? `${firstText.slice(0, 50)}...` : firstText;
    }

    // 最終メッセージを取得
    let lastMessage = '会話を開始してください';
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      const lastText = extractFirstText(lastMsg.contents);
      lastMessage = lastText.length > 100 ? `${lastText.slice(0, 100)}...` : lastText;
    }

    // 作成日時と更新日時
    const createdAt = messages.length > 0 ? messages[0].timestamp : new Date().toISOString();
    const updatedAt = messages.length > 0 ? messages[messages.length - 1].timestamp : createdAt;

    return {
      sessionId,
      title,
      lastMessage,
      messageCount: messages.length,
      createdAt,
      updatedAt,
    };
  }

  /**
   * 長期記憶レコード一覧を取得
   * @param actorId ユーザーID
   * @param memoryStrategyId 記憶戦略ID（例: preference_builtin_cdkGen0001-L84bdDEgeO）
   * @param nextToken ページネーション用トークン
   * @returns 長期記憶レコード一覧
   */
  async listMemoryRecords(
    actorId: string,
    memoryStrategyId: string,
    nextToken?: string
  ): Promise<MemoryRecordList> {
    try {
      console.log(
        `[AgentCoreMemoryService] 長期記憶レコード一覧を取得中: actorId=${actorId}, memoryStrategyId=${memoryStrategyId}`
      );

      // namespace形式を正しい形式に修正
      const namespace = `/strategies/${memoryStrategyId}/actors/${actorId}`;

      const command = new ListMemoryRecordsCommand({
        memoryId: this.memoryId,
        namespace: namespace,
        memoryStrategyId: memoryStrategyId,
        maxResults: 50,
        nextToken: nextToken,
      });

      const response = await this.client.send(command);

      // AWS SDKのレスポンス型にmemoryRecordSummariesが含まれていない場合の型アサーション
      const extendedResponse = response as typeof response & {
        memoryRecordSummaries?: MemoryRecordSummary[];
      };

      if (!extendedResponse.memoryRecordSummaries) {
        console.log(
          `[AgentCoreMemoryService] 長期記憶レコードが見つかりませんでした: memoryStrategyId=${memoryStrategyId}`
        );
        return { records: [] };
      }

      const records: MemoryRecord[] = extendedResponse.memoryRecordSummaries.map(
        (record, index: number) => {
          // デバッグログ: memoryRecordSummariesの構造を確認
          if (index < 2) {
            // 最初の2件のみログ出力
            console.log(`[AgentCoreMemoryService] Record ${index} structure:`, {
              recordId: record.memoryRecordId,
              recordIdType: typeof record.memoryRecordId,
              availableKeys: Object.keys(record),
              fullRecord: record,
            });
          }

          // contentがオブジェクトの場合はtextプロパティを抽出
          let content = '';
          if (typeof record.content === 'object' && record.content?.text) {
            content = record.content.text;
          } else if (typeof record.content === 'string') {
            content = record.content;
          } else if (record.content) {
            content = JSON.stringify(record.content);
          }

          // recordIdが空の場合は警告ログ
          const recordId = record.memoryRecordId || '';
          if (!recordId) {
            console.warn(
              `[AgentCoreMemoryService] Empty recordId found in record ${index}:`,
              record
            );
          }

          return {
            recordId: recordId,
            namespace: namespace,
            content: content,
            createdAt: record.createdAt?.toISOString() || new Date().toISOString(),
            updatedAt: record.createdAt?.toISOString() || new Date().toISOString(), // AWS SDK doesn't provide updatedAt
          };
        }
      );

      console.log(`[AgentCoreMemoryService] ${records.length} 件の長期記憶レコードを取得しました`);
      return {
        records,
        nextToken: response.nextToken,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'ResourceNotFoundException') {
        console.log(
          `[AgentCoreMemoryService] 長期記憶レコードが存在しません: memoryStrategyId=${memoryStrategyId}`
        );
        return { records: [] };
      }
      console.error('[AgentCoreMemoryService] 長期記憶レコード一覧取得エラー:', error);
      throw error;
    }
  }

  /**
   * 長期記憶レコードを削除
   * @param actorId ユーザーID
   * @param memoryStrategyId 記憶戦略ID
   * @param recordId レコードID
   */
  async deleteMemoryRecord(
    actorId: string,
    memoryStrategyId: string,
    recordId: string
  ): Promise<void> {
    try {
      console.log(
        `[AgentCoreMemoryService] 長期記憶レコードを削除中: recordId=${recordId}, memoryStrategyId=${memoryStrategyId}`
      );

      // namespace形式を正しい形式に修正
      const namespace = `/strategies/${memoryStrategyId}/actors/${actorId}`;

      const deleteParams: DeleteMemoryRecordParams = {
        memoryId: this.memoryId,
        namespace: namespace,
        memoryStrategyId: memoryStrategyId,
        memoryRecordId: recordId, // recordId → memoryRecordId に修正
      };

      console.log(`[AgentCoreMemoryService] 削除パラメータ:`, deleteParams);

      const command = new DeleteMemoryRecordCommand(deleteParams);

      await this.client.send(command);
      console.log(`[AgentCoreMemoryService] 長期記憶レコードを削除しました: recordId=${recordId}`);
    } catch (error) {
      console.error('[AgentCoreMemoryService] 長期記憶レコード削除エラー:', error);
      throw error;
    }
  }

  /**
   * セマンティック検索で長期記憶レコードを取得
   * @param actorId ユーザーID
   * @param memoryStrategyId 記憶戦略ID
   * @param query 検索クエリ
   * @param topK 取得件数（デフォルト: 10）
   * @param relevanceScore 関連度スコアの閾値（デフォルト: 0.2）
   * @returns 長期記憶レコード一覧（関連度順）
   */
  async retrieveMemoryRecords(
    actorId: string,
    memoryStrategyId: string,
    query: string,
    topK: number = 10,
    _relevanceScore: number = 0.2
  ): Promise<MemoryRecord[]> {
    try {
      console.log(
        `[AgentCoreMemoryService] セマンティック検索を実行中: query=${query}, memoryStrategyId=${memoryStrategyId}`
      );

      // namespace形式を正しい形式に修正
      const namespace = `/strategies/${memoryStrategyId}/actors/${actorId}`;

      const retrieveParams: RetrieveMemoryRecordsParams = {
        memoryId: this.memoryId,
        namespace: namespace,
        searchCriteria: {
          searchQuery: query,
          memoryStrategyId: memoryStrategyId,
          topK: topK,
        },
        maxResults: 50,
      };

      const command = new RetrieveMemoryRecordsCommand(retrieveParams);

      const response = await this.client.send(command);

      // AWS SDKのレスポンス型にmemoryRecordSummariesが含まれていない場合の型アサーション
      const extendedResponse = response as typeof response & {
        memoryRecordSummaries?: MemoryRecordSummary[];
      };

      if (!extendedResponse.memoryRecordSummaries) {
        console.log(
          `[AgentCoreMemoryService] セマンティック検索結果が見つかりませんでした: query=${query}`
        );
        return [];
      }

      const records: MemoryRecord[] = extendedResponse.memoryRecordSummaries.map(
        (record: MemoryRecordSummary, index: number) => {
          // デバッグログ: memoryRecordSummariesの構造を確認
          if (index < 2) {
            // 最初の2件のみログ出力
            console.log(`[AgentCoreMemoryService] Retrieve record ${index} structure:`, {
              recordId: record.memoryRecordId,
              recordIdType: typeof record.memoryRecordId,
              availableKeys: Object.keys(record),
              fullRecord: record,
            });
          }

          // contentがオブジェクトの場合はtextプロパティを抽出
          let content = '';
          if (typeof record.content === 'object' && record.content?.text) {
            content = record.content.text;
          } else if (typeof record.content === 'string') {
            content = record.content;
          } else if (record.content) {
            content = JSON.stringify(record.content);
          }

          // recordIdが空の場合は警告ログ
          const recordId = record.memoryRecordId || '';
          if (!recordId) {
            console.warn(
              `[AgentCoreMemoryService] Empty recordId found in retrieve record ${index}:`,
              record
            );
          }

          return {
            recordId: recordId,
            namespace: namespace,
            content: content,
            createdAt: record.createdAt?.toISOString() || new Date().toISOString(),
            updatedAt: record.createdAt?.toISOString() || new Date().toISOString(), // AWS SDK doesn't provide updatedAt
          };
        }
      );

      console.log(
        `[AgentCoreMemoryService] ${records.length} 件のセマンティック検索結果を取得しました`
      );
      return records;
    } catch (error) {
      if (error instanceof Error && error.name === 'ResourceNotFoundException') {
        console.log(
          `[AgentCoreMemoryService] セマンティック検索対象が存在しません: memoryStrategyId=${memoryStrategyId}`
        );
        return [];
      }
      console.error('[AgentCoreMemoryService] セマンティック検索エラー:', error);
      throw error;
    }
  }
}

/**
 * AgentCore Memory サービスのインスタンスを作成
 * @returns AgentCoreMemoryService インスタンス
 */
export function createAgentCoreMemoryService(): AgentCoreMemoryService {
  return new AgentCoreMemoryService(config.agentcore.memoryId, config.agentcore.region);
}
