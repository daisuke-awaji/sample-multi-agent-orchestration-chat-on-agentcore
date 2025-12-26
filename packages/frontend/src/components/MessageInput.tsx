import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Loader2 } from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import { StoragePathDisplay } from './StoragePathDisplay';
import { StorageManagementModal } from './StorageManagementModal';

interface MessageInputProps {
  sessionId: string | null;
  onCreateSession: () => string;
  getScenarioPrompt?: () => string | null;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  sessionId,
  onCreateSession,
  getScenarioPrompt,
}) => {
  const { t } = useTranslation();
  const { sendPrompt, isLoading } = useChatStore();
  const [input, setInput] = useState('');
  const [isStorageModalOpen, setIsStorageModalOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevLoadingRef = useRef(isLoading);

  // テキストエリアの自動リサイズ
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [input]);

  // ローディング完了時にフォーカスを戻す
  useEffect(() => {
    // ローディングが完了した時（true → false）にフォーカスを戻す
    if (prevLoadingRef.current && !isLoading) {
      textareaRef.current?.focus();
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading]);

  // シナリオプロンプトの自動入力
  useEffect(() => {
    if (getScenarioPrompt) {
      const scenarioPrompt = getScenarioPrompt();
      if (scenarioPrompt) {
        // 次のフレームで実行してカスケードレンダリングを防ぐ
        requestAnimationFrame(() => {
          setInput(scenarioPrompt);
          // フォーカスを当ててカーソルを末尾に移動
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.focus();
              textareaRef.current.setSelectionRange(scenarioPrompt.length, scenarioPrompt.length);
            }
          }, 0);
        });
      }
    }
  }, [getScenarioPrompt]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // エラーがある場合のみクリア（不要な再レンダリングを防ぐ）
    // エラーは送信時または新しいメッセージ受信時にクリアされるため、ここでは削除
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || isLoading) {
      return;
    }

    try {
      // 送信するメッセージを保存
      const messageToSend = input.trim();

      // 入力フィールドを即座にクリア
      setInput('');

      // 送信後にテキストエリアにフォーカスを戻す
      textareaRef.current?.focus();

      // 新規セッションの場合は先にセッション作成
      let targetSessionId = sessionId;
      if (!targetSessionId) {
        targetSessionId = onCreateSession();
      }

      // メッセージ送信（非同期で継続）
      await sendPrompt(messageToSend, targetSessionId);
    } catch (err) {
      console.error('メッセージ送信エラー:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Shift + Enter で改行、Enter で送信（IME変換中は除く）
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="bg-white p-4">
      {/* ストレージパス表示 */}
      <div className="max-w-4xl mx-auto mb-2">
        <StoragePathDisplay onClick={() => setIsStorageModalOpen(true)} />
      </div>

      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
        <div className="relative">
          {/* テキスト入力エリア */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.messageInputPlaceholder')}
            className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-2xl focus:outline-none focus:ring-1 focus:ring-gray-200 focus:border-transparent resize-none min-h-[52px] max-h-[200px] bg-white"
            rows={1}
            style={{ height: 'auto' }}
          />

          {/* 送信ボタン */}
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className={`absolute right-2 top-1/2 transform -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 ${
              !input.trim() || isLoading
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-gray-900 text-white hover:bg-gray-800'
            }`}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* ヘルプテキスト */}
        <p className="mt-2 text-xs text-gray-500">{t('chat.inputHelp')}</p>
      </form>

      {/* ストレージ管理モーダル */}
      <StorageManagementModal
        isOpen={isStorageModalOpen}
        onClose={() => setIsStorageModalOpen(false)}
      />
    </div>
  );
};
