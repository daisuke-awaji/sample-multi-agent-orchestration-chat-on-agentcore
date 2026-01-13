/**
 * Strands Message と AgentCore Memory PayloadType の変換ユーティリティ
 */
import {
  Message,
  TextBlock,
  ImageBlock,
  type Role,
  type ContentBlock,
  type JSONValue,
} from '@strands-agents/sdk';

/**
 * ToolUse データの型定義
 */
interface ToolUseData {
  toolType: 'toolUse';
  name: string;
  toolUseId: string;
  input: JSONValue;
}

/**
 * ToolResult データの型定義
 */
interface ToolResultData {
  toolType: 'toolResult';
  toolUseId: string;
  content: JSONValue;
  isError: boolean;
}

/**
 * ツールデータの Union 型
 */
type ToolData = ToolUseData | ToolResultData;

/**
 * ImageBlock データの型定義（シリアライズ用）
 */
interface ImageBlockData {
  type: 'imageBlock';
  format: 'png' | 'jpeg' | 'gif' | 'webp';
  base64: string;
}

/**
 * AgentCore Memory のConversational Payload型定義
 */
export interface ConversationalPayload {
  conversational: {
    content: { text: string };
    role: 'USER' | 'ASSISTANT';
  };
}

/**
 * AgentCore Memory のBlob Payload型定義
 */
export interface BlobPayload {
  blob: Uint8Array;
}

/**
 * シリアライズ可能なコンテンツブロック型
 */
type SerializableContentBlock = ContentBlock | ImageBlockData;

/**
 * blob データの内容型定義（新形式）
 */
interface BlobData {
  messageType: 'content';
  role: string;
  content: SerializableContentBlock[];
}

/**
 * 旧形式のblob データの内容型定義（後方互換性）
 */
interface LegacyBlobData {
  messageType: 'tool';
  role: string;
  toolType: 'toolUse' | 'toolResult';
  name?: string;
  toolUseId: string;
  input?: JSONValue;
  content?: JSONValue;
  isError?: boolean;
}

/**
 * AgentCore Memory のPayloadType型定義（Union型）
 */
export type AgentCorePayload = ConversationalPayload | BlobPayload;

/**
 * ImageBlockをシリアライズ可能な形式に変換
 * @param block ImageBlock
 * @returns ImageBlockData (Base64形式)
 */
function serializeImageBlock(block: ContentBlock): ImageBlockData | null {
  if (block.type !== 'imageBlock') return null;

  // ImageBlock の source から bytes を取得
  const imageBlock = block as unknown as {
    type: 'imageBlock';
    format?: string;
    source?: { bytes?: Uint8Array };
  };

  if (!imageBlock.source?.bytes) return null;

  // Uint8Array を Base64 に変換
  const base64 = Buffer.from(imageBlock.source.bytes).toString('base64');

  return {
    type: 'imageBlock',
    format: (imageBlock.format as ImageBlockData['format']) || 'png',
    base64,
  };
}

/**
 * Strands Message から AgentCore Payload に変換
 * @param message Strands Message
 * @returns AgentCore Payload (ConversationalPayload or BlobPayload)
 */
export function messageToAgentCorePayload(message: Message): AgentCorePayload {
  // content 配列が空または存在しない場合
  if (!message.content || message.content.length === 0) {
    const agentCoreRole = message.role === 'user' ? 'USER' : 'ASSISTANT';
    return {
      conversational: {
        content: { text: ' ' }, // 最小限の1文字
        role: agentCoreRole,
      },
    };
  }

  // content 配列にテキスト以外（toolUse/toolResult/imageBlock）が含まれるかチェック
  const hasNonTextContent = message.content.some((block) => block.type !== 'textBlock');

  // テキストのみのシンプルなメッセージの場合は conversational payload
  if (!hasNonTextContent && message.content.length === 1) {
    const textBlock = message.content[0];
    if (textBlock.type === 'textBlock' && 'text' in textBlock) {
      const agentCoreRole = message.role === 'user' ? 'USER' : 'ASSISTANT';
      return {
        conversational: {
          content: { text: textBlock.text },
          role: agentCoreRole,
        },
      };
    }
  }

  // 複雑なメッセージ（toolUse/toolResult/imageBlock含む、または複数のコンテンツブロック）は blob payload
  // ImageBlock は Base64 にシリアライズして保存
  const serializedContent: SerializableContentBlock[] = message.content.map((block) => {
    if (block.type === 'imageBlock') {
      const serialized = serializeImageBlock(block);
      if (serialized) return serialized;
    }
    return block;
  });

  const blobData: BlobData = {
    messageType: 'content',
    role: message.role,
    content: serializedContent,
  };

  // JSON文字列にシリアライズしてからUint8Arrayにエンコード
  const encoder = new TextEncoder();
  return {
    blob: encoder.encode(JSON.stringify(blobData)),
  };
}

/**
 * AgentCore Payload から Strands Message に変換
 * @param payload AgentCore Payload (ConversationalPayload or BlobPayload)
 * @returns Strands Message
 */
export function agentCorePayloadToMessage(payload: AgentCorePayload): Message {
  // conversational payload の場合
  if ('conversational' in payload) {
    const strandsRole = payload.conversational.role === 'USER' ? 'user' : 'assistant';
    const textBlock = new TextBlock(payload.conversational.content.text);
    return new Message({
      role: strandsRole,
      content: [textBlock],
    });
  }

  // blob payload の場合
  if ('blob' in payload && payload.blob) {
    // console.log('Blob payload received:', {
    //   type: typeof payload.blob,
    //   constructor: payload.blob?.constructor?.name,
    //   isUint8Array: payload.blob instanceof Uint8Array,
    //   isBuffer: Buffer.isBuffer && Buffer.isBuffer(payload.blob),
    //   keys: typeof payload.blob === 'object' ? Object.keys(payload.blob) : [],
    //   sample:
    //     typeof payload.blob === 'object' && !(payload.blob instanceof Uint8Array)
    //       ? JSON.stringify(payload.blob).slice(0, 200)
    //       : 'binary_data',
    // });

    try {
      let blobData: BlobData | null = null;

      // 1. Uint8Array の場合（新形式）
      if (payload.blob instanceof Uint8Array) {
        // console.log('Processing as Uint8Array');
        const decoder = new TextDecoder();
        const blobString = decoder.decode(payload.blob);
        blobData = JSON.parse(blobString);
      }
      // 2. Buffer の場合
      else if (typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(payload.blob)) {
        // console.log('Processing as Buffer');
        const blobString = (payload.blob as Buffer).toString('utf8');
        blobData = JSON.parse(blobString);
      }
      // 3. 直接オブジェクトの場合（古い形式 - 後方互換性）
      else if (typeof payload.blob === 'object' && payload.blob !== null) {
        // console.log('Processing as direct object (backward compatibility)');
        const blobObj = payload.blob as Record<string, unknown>;

        // 古い形式のチェック
        if (blobObj.messageType === 'tool') {
          blobData = blobObj as unknown as BlobData;
        }
      }
      // 4. 文字列の場合（base64 エンコードされた可能性）
      else if (typeof payload.blob === 'string') {
        // console.log('Processing as string');
        try {
          // base64 デコードを試行
          const decodedString = Buffer.from(payload.blob, 'base64').toString('utf8');
          blobData = JSON.parse(decodedString);
        } catch {
          // base64 でない場合は直接 JSON パース
          blobData = JSON.parse(payload.blob);
        }
      }

      // blobData が取得できた場合の処理
      if (blobData && (blobData.messageType === 'content' || blobData.messageType === 'tool')) {
        const strandsRole = blobData.role as Role;

        // 新形式: content配列全体を保存
        if (blobData.messageType === 'content') {
          // ImageBlockData を ImageBlock に復元
          const restoredContent: ContentBlock[] = blobData.content.map((block) => {
            // ImageBlockData の場合は ImageBlock に復元
            if (
              block.type === 'imageBlock' &&
              'base64' in block &&
              typeof (block as ImageBlockData).base64 === 'string'
            ) {
              const imageData = block as ImageBlockData;
              const bytes = new Uint8Array(Buffer.from(imageData.base64, 'base64'));
              return new ImageBlock({
                format: imageData.format,
                source: { bytes },
              });
            }
            return block as ContentBlock;
          });

          return new Message({
            role: strandsRole,
            content: restoredContent,
          });
        }

        // 旧形式: 後方互換性のため単一toolUse/toolResultを処理
        if (blobData.messageType === 'tool') {
          const legacyBlobData = blobData as unknown as LegacyBlobData;
          const content = createContentBlockFromToolData(legacyBlobData);
          return new Message({
            role: strandsRole,
            content: [content],
          });
        }
      } else {
        console.warn('Blob data does not have expected structure:', blobData);
      }
    } catch (error) {
      console.error('Failed to parse blob data:', error);
      console.error('Raw blob payload:', payload.blob);
      // パースエラーの場合はフォールバックに進む
    }
  }

  // フォールバック: 不明なペイロードの場合
  console.warn('Unknown payload type, creating empty message');
  return new Message({
    role: 'assistant',
    content: [new TextBlock('')],
  });
}

/**
 * AgentCore Event から eventId を抽出
 * @param event AgentCore Event オブジェクト
 * @returns eventId
 */
export function extractEventId(event: { eventId?: string }): string {
  return event.eventId || '';
}

/**
 * ツールデータから Strands ContentBlock を作成
 * @param toolData ツールデータ（ToolData または LegacyBlobData）
 * @returns ContentBlock
 */
function createContentBlockFromToolData(toolData: ToolData | LegacyBlobData): ContentBlock {
  if (toolData.toolType === 'toolUse') {
    // ToolUseBlock を作成（Strands SDK の正確な型に基づく）
    return {
      type: 'toolUseBlock',
      name: toolData.name,
      toolUseId: toolData.toolUseId,
      input: toolData.input,
    } as unknown as ContentBlock;
  }

  if (toolData.toolType === 'toolResult') {
    // ToolResultBlock を作成（Strands SDK の正確な型に基づく）
    return {
      type: 'toolResultBlock',
      toolUseId: toolData.toolUseId,
      content: toolData.content,
      isError: toolData.isError,
      status: 'success', // Strands SDK で必要なプロパティ
    } as unknown as ContentBlock;
  }

  // フォールバック（通常ここには来ない）
  return new TextBlock(
    `[Unknown tool data: ${JSON.stringify(toolData)}]`
  ) as unknown as ContentBlock;
}

/**
 * 現在のタイムスタンプを取得（AgentCore Event用）
 * @returns Date オブジェクト
 */
export function getCurrentTimestamp(): Date {
  return new Date();
}
