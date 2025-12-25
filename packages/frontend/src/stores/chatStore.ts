import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { nanoid, customAlphabet } from 'nanoid';
import type { ChatState, Message, MessageContent, ToolUse, ToolResult } from '../types/index';
import { streamAgentResponse } from '../api/agent';
import type { ConversationMessage } from '../api/sessions';
import { useAgentStore } from './agentStore';
import { useStorageStore } from './storageStore';
import { useSessionStore } from './sessionStore';
import { useMemoryStore } from './memoryStore';

// AWS AgentCore sessionId制約: [a-zA-Z0-9][a-zA-Z0-9-_]*
// 英数字のみのカスタムnanoid（ハイフンとアンダースコアを除外）
const generateSessionId = customAlphabet(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  33
);

// React Router のナビゲート関数を格納する変数
let navigateFunction: ((to: string, options?: { replace?: boolean }) => void) | null = null;

// ナビゲート関数を設定するヘルパー関数
export const setNavigateFunction = (
  navigate: (to: string, options?: { replace?: boolean }) => void
) => {
  navigateFunction = navigate;
};

// ヘルパー関数: 文字列コンテンツをMessageContent配列に変換
const stringToContents = (text: string): MessageContent[] => {
  return text ? [{ type: 'text', text }] : [];
};

// ヘルパー関数: MessageContentを追加
const addContentToMessage = (
  contents: MessageContent[],
  newContent: MessageContent
): MessageContent[] => {
  return [...contents, newContent];
};

// ヘルパー関数: テキストコンテンツを更新または追加
const updateOrAddTextContent = (contents: MessageContent[], text: string): MessageContent[] => {
  // contentsが空の場合、新しいテキストブロックを追加
  if (contents.length === 0) {
    return [{ type: 'text', text }];
  }

  const lastContent = contents[contents.length - 1];

  // 最後がテキストブロックの場合のみ更新（ストリーミング継続）
  if (lastContent.type === 'text') {
    const updated = [...contents];
    updated[contents.length - 1] = { type: 'text', text };
    return updated;
  }

  // 最後がtoolUseまたはtoolResultの場合は新しいテキストブロックを追加
  return [...contents, { type: 'text', text }];
};

// ヘルパー関数: ToolUseのステータスを更新
const updateToolUseStatus = (
  contents: MessageContent[],
  toolUseId: string,
  status: ToolUse['status']
): MessageContent[] => {
  return contents.map((content) => {
    if (content.type === 'toolUse' && content.toolUse) {
      // 実際のtoolUseIdまたはローカルIDで一致確認
      if (content.toolUse.id === toolUseId || content.toolUse.originalToolUseId === toolUseId) {
        return {
          ...content,
          toolUse: {
            ...content.toolUse,
            status,
          },
        };
      }
    }
    return content;
  });
};

interface ChatActions {
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => string;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  sendPrompt: (prompt: string) => Promise<void>;
  clearMessages: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  setSessionId: (sessionId: string | null) => void;
  loadSessionHistory: (conversationMessages: ConversationMessage[]) => void;
}

type ChatStore = ChatState & ChatActions;

export const useChatStore = create<ChatStore>()(
  devtools(
    (set, get) => ({
      // State
      messages: [],
      isLoading: false,
      error: null,
      sessionId: null,

      // Actions
      addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => {
        const newMessage: Message = {
          ...message,
          id: nanoid(),
          timestamp: new Date(),
        };

        set((state) => ({
          messages: [...state.messages, newMessage],
        }));

        return newMessage.id;
      },

      updateMessage: (id: string, updates: Partial<Message>) => {
        set((state) => ({
          messages: state.messages.map((msg) => (msg.id === id ? { ...msg, ...updates } : msg)),
        }));
      },

      sendPrompt: async (prompt: string) => {
        const { addMessage, updateMessage } = get();
        let { sessionId } = get();

        // 新規セッションかどうかを判定（セッション一覧更新に使用）
        const isNewSession = !sessionId;

        // セッションIDがない場合は新しく生成（初回メッセージ送信時）
        if (!sessionId) {
          sessionId = generateSessionId();
          set({ sessionId });
        }

        try {
          set({ isLoading: true, error: null });

          // ユーザーメッセージを追加
          addMessage({
            type: 'user',
            contents: stringToContents(prompt),
          });

          // URL を更新して sessionId を反映（メッセージ追加後に遷移）
          if (isNewSession && navigateFunction) {
            console.log(`🆕 新しいセッションを作成: ${sessionId}`);
            navigateFunction(`/chat/${sessionId}`, { replace: true });
          }

          // アシスタントの応答メッセージを作成（ストリーミング用）
          const assistantMessageId = addMessage({
            type: 'assistant',
            contents: [],
            isStreaming: true,
          });

          let accumulatedContent = '';
          let isAfterToolExecution = false;

          // 選択中のエージェント設定を取得
          const selectedAgent = useAgentStore.getState().selectedAgent;

          // ストレージパスを取得
          const currentPath = useStorageStore.getState().currentPath;

          // 長期記憶設定を取得
          const { isMemoryEnabled } = useMemoryStore.getState();

          const agentConfig = selectedAgent
            ? {
                systemPrompt: selectedAgent.systemPrompt,
                enabledTools: selectedAgent.enabledTools,
                storagePath: currentPath,
                memoryEnabled: isMemoryEnabled,
                mcpConfig: selectedAgent.mcpConfig as Record<string, unknown> | undefined,
              }
            : {
                storagePath: currentPath,
                memoryEnabled: isMemoryEnabled,
              };

          // デバッグログ
          if (selectedAgent) {
            console.log(`🤖 選択エージェント: ${selectedAgent.name}`);
            console.log(`🔧 有効ツール: ${selectedAgent.enabledTools.join(', ') || 'なし'}`);
          } else {
            console.log(`🤖 デフォルトエージェント使用`);
          }
          console.log(`📁 ストレージパス制限: ${currentPath}`);

          // ストリーミングレスポンスを処理
          await streamAgentResponse(
            prompt,
            sessionId,
            {
              onTextDelta: (text: string) => {
                // ツール実行後の最初のテキストの場合、新しいテキストブロック開始
                if (isAfterToolExecution) {
                  accumulatedContent = text;
                  isAfterToolExecution = false;
                } else {
                  accumulatedContent += text;
                }

                const { messages } = get();
                const currentMessage = messages.find((msg) => msg.id === assistantMessageId);
                if (currentMessage) {
                  // 既存のcontentsを保持しつつテキストを更新
                  const newContents = updateOrAddTextContent(
                    currentMessage.contents,
                    accumulatedContent
                  );
                  updateMessage(assistantMessageId, {
                    contents: newContents,
                    isStreaming: true,
                  });
                }
              },
              onToolUse: (toolUse: ToolUse) => {
                // ツール使用を追加
                const { messages } = get();
                const currentMessage = messages.find((msg) => msg.id === assistantMessageId);
                if (currentMessage) {
                  const newContents = addContentToMessage(currentMessage.contents, {
                    type: 'toolUse',
                    toolUse,
                  });
                  updateMessage(assistantMessageId, {
                    contents: newContents,
                  });
                }
              },
              onToolInputUpdate: (toolUseId: string, input: Record<string, unknown>) => {
                // ツール入力パラメータを更新
                const { messages } = get();
                const currentMessage = messages.find((msg) => msg.id === assistantMessageId);
                if (currentMessage) {
                  const updatedContents = currentMessage.contents.map((content) => {
                    if (content.type === 'toolUse' && content.toolUse) {
                      // originalToolUseIdまたはローカルIDで一致確認
                      if (
                        content.toolUse.originalToolUseId === toolUseId ||
                        content.toolUse.id === toolUseId
                      ) {
                        return {
                          ...content,
                          toolUse: {
                            ...content.toolUse,
                            input,
                          },
                        };
                      }
                    }
                    return content;
                  });

                  updateMessage(assistantMessageId, {
                    contents: updatedContents,
                  });
                }
              },
              onToolResult: (toolResult: ToolResult) => {
                // ツール結果を追加
                const { messages } = get();
                const currentMessage = messages.find((msg) => msg.id === assistantMessageId);
                if (currentMessage) {
                  // ToolUseのステータスを完了に更新
                  const updatedContentsWithStatus = updateToolUseStatus(
                    currentMessage.contents,
                    toolResult.toolUseId,
                    'completed'
                  );

                  // ツール結果を追加
                  const finalContents = addContentToMessage(updatedContentsWithStatus, {
                    type: 'toolResult',
                    toolResult,
                  });

                  updateMessage(assistantMessageId, {
                    contents: finalContents,
                  });

                  // ツール実行後フラグを設定（次のテキストは新しいブロックとして開始）
                  isAfterToolExecution = true;
                }
              },
              onComplete: () => {
                updateMessage(assistantMessageId, {
                  isStreaming: false,
                });

                set({ isLoading: false });
                console.log(`✅ メッセージ送信完了 (セッション: ${sessionId})`);

                // 新規セッションの場合、セッション一覧を更新
                if (isNewSession) {
                  console.log('🔄 新規セッション作成完了、セッション一覧を更新中...');
                  useSessionStore.getState().refreshSessions();
                }
              },
              onError: (error: Error) => {
                // エラーメッセージで更新
                updateMessage(assistantMessageId, {
                  contents: stringToContents(`エラーが発生しました: ${error.message}`),
                  isStreaming: false,
                });

                set({
                  isLoading: false,
                  error: error.message,
                });
              },
            },
            agentConfig
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'メッセージの送信に失敗しました';
          set({
            isLoading: false,
            error: errorMessage,
          });
        }
      },

      clearMessages: () => {
        set({
          messages: [],
          // sessionId は URL から管理されるためクリアしない
        });
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },

      setError: (error: string | null) => {
        set({ error });
      },

      clearError: () => {
        set({ error: null });
      },

      setSessionId: (sessionId: string | null) => {
        set({ sessionId });
      },

      loadSessionHistory: (conversationMessages: ConversationMessage[]) => {
        console.log(`📖 会話履歴を復元中: ${conversationMessages.length}件のメッセージ`);

        // ConversationMessage を Message 型に変換
        const messages: Message[] = conversationMessages.map((convMsg) => ({
          id: convMsg.id,
          type: convMsg.type,
          contents: convMsg.contents, // contents配列をそのまま使用
          timestamp: new Date(convMsg.timestamp),
          isStreaming: false, // 履歴データはストリーミング中ではない
        }));

        set({
          messages,
          error: null, // エラーをクリア
        });

        console.log(`✅ 会話履歴の復元完了: ${messages.length}件のメッセージ`);
      },
    }),
    {
      name: 'chat-store',
    }
  )
);
