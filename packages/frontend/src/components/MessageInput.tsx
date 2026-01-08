import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Loader2 } from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import { useSettingsStore } from '../stores/settingsStore';
import { StoragePathDisplay } from './StoragePathDisplay';
import { StorageManagementModal } from './StorageManagementModal';
import { ModelSelector } from './ui/ModelSelector';

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
  const { sendBehavior } = useSettingsStore();
  const [input, setInput] = useState('');
  const [isStorageModalOpen, setIsStorageModalOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevLoadingRef = useRef(isLoading);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [input]);

  // Return focus when loading completes
  useEffect(() => {
    // Return focus when loading completes (true → false)
    if (prevLoadingRef.current && !isLoading) {
      textareaRef.current?.focus();
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading]);

  // Auto-fill scenario prompt
  useEffect(() => {
    if (getScenarioPrompt) {
      const scenarioPrompt = getScenarioPrompt();
      if (scenarioPrompt) {
        // Execute in next frame to prevent cascade rendering
        requestAnimationFrame(() => {
          setInput(scenarioPrompt);
          // Focus and move cursor to end
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
    // Clear only if error exists (prevent unnecessary re-renders)
    // Error cleared on send or new message, so delete here
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || isLoading) {
      return;
    }

    try {
      // Save message to send
      const messageToSend = input.trim();

      // Clear input field immediately
      setInput('');

      // Return focus to textarea after sending
      textareaRef.current?.focus();

      // Create session first for new session
      let targetSessionId = sessionId;
      if (!targetSessionId) {
        targetSessionId = onCreateSession();
      }

      // Send message (continue asynchronously)
      await sendPrompt(messageToSend, targetSessionId);
    } catch (err) {
      console.error('メッセージ送信エラー:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Do nothing during IME composition
    if (e.nativeEvent.isComposing) {
      return;
    }

    if (sendBehavior === 'enter') {
      // Send with Enter, newline with Shift+Enter
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e);
      }
    } else {
      // Send with Cmd/Ctrl+Enter, newline with Enter
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit(e);
      }
    }
  };

  return (
    <div
      className="sticky bottom-0 left-0 right-0 z-30 bg-white p-4"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      {/* ストレージパス表示 */}
      <div className="max-w-4xl mx-auto mb-2">
        <StoragePathDisplay onClick={() => setIsStorageModalOpen(true)} />
      </div>

      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
        <div className="relative">
          {/* テキスト入力エリア - 2行分のスペースを確保 */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.messageInputPlaceholder')}
            className="w-full px-4 py-3 pr-12 pb-12 border border-gray-200 rounded-2xl focus:outline-none focus:ring-1 focus:ring-gray-200 focus:border-transparent resize-none min-h-[72px] max-h-[200px] bg-white"
            rows={2}
            style={{ height: 'auto' }}
          />

          {/* モデルセレクター - 下部に配置 */}
          <div className="absolute bottom-3 left-1.5 flex items-center">
            <ModelSelector />
          </div>

          {/* 送信ボタン */}
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className={`absolute right-2 bottom-2 w-8 h-8 rounded-md flex items-center justify-center transition-all duration-200 ${
              !input.trim() || isLoading
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-black hover:bg-gray-100'
            }`}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </form>

      {/* ストレージ管理モーダル */}
      <StorageManagementModal
        isOpen={isStorageModalOpen}
        onClose={() => setIsStorageModalOpen(false)}
      />
    </div>
  );
};
