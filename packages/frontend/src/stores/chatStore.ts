import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import type { ChatState, Message } from '../types/index';
import { streamAgentResponse } from '../api/agent';

interface ChatActions {
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => string;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  sendPrompt: (prompt: string) => Promise<void>;
  clearMessages: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  setSessionId: (sessionId: string | null) => void;
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
        let { addMessage, updateMessage, sessionId } = get();

        // セッションIDがない場合は生成
        if (!sessionId) {
          sessionId = nanoid(33); // 33文字以上で生成
          set({ sessionId });
        }

        try {
          set({ isLoading: true, error: null });

          // ユーザーメッセージを追加
          addMessage({
            type: 'user',
            content: prompt,
          });

          // アシスタントの応答メッセージを作成（ストリーミング用）
          const assistantMessageId = addMessage({
            type: 'assistant',
            content: '',
            isStreaming: true,
          });

          let accumulatedContent = '';

          // ストリーミングレスポンスを処理
          await streamAgentResponse(prompt, sessionId, {
            onTextDelta: (text: string) => {
              accumulatedContent += text;
              updateMessage(assistantMessageId, {
                content: accumulatedContent,
                isStreaming: true,
              });
            },
            onComplete: (metadata: Record<string, unknown>) => {
              updateMessage(assistantMessageId, {
                isStreaming: false,
              });

              // セッションIDが返されたら保存
              if (metadata?.sessionId && typeof metadata.sessionId === 'string') {
                set({ sessionId: metadata.sessionId });
              }

              set({ isLoading: false });
            },
            onError: (error: Error) => {
              // エラーメッセージで更新
              updateMessage(assistantMessageId, {
                content: `エラーが発生しました: ${error.message}`,
                isStreaming: false,
              });

              set({
                isLoading: false,
                error: error.message,
              });
            },
          });
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
          sessionId: null,
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
    }),
    {
      name: 'chat-store',
    }
  )
);
