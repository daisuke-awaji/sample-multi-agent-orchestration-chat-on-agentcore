import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../stores/chatStore';
import { useSelectedAgent } from '../stores/agentStore';
import { useSessionStore } from '../stores/sessionStore';
import { Message } from './Message';
import { MessageSkeleton } from './MessageSkeleton';
import { translateIfKey } from '../utils/agent-translation';

interface MessageListProps {
  onScenarioClick?: (prompt: string) => void;
}

export const MessageList: React.FC<MessageListProps> = ({ onScenarioClick }) => {
  const { t } = useTranslation();
  const { sessionId } = useParams<{ sessionId?: string }>();
  const { isLoadingEvents } = useSessionStore();
  const sessionState = useChatStore((state) =>
    sessionId ? (state.sessions[sessionId] ?? null) : null
  );
  const messages = useMemo(() => sessionState?.messages || [], [sessionState?.messages]);
  const error = sessionState?.error || null;
  const selectedAgent = useSelectedAgent();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  // Monitor scroll position and stop auto-scroll if user scrolls up
  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;

    // Enable auto-scroll if within 10px of bottom
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 10;
    setShouldAutoScroll(isAtBottom);
  };

  // Auto-scroll when new message added (only if auto-scroll enabled)
  useEffect(() => {
    if (shouldAutoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, shouldAutoScroll]);

  return (
    <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto bg-white">
      <div className="max-w-4xl mx-auto p-4 pb-32">
        {/* エラー表示 */}
        {error && (
          <div className="mb-6 bg-feedback-error-bg border border-feedback-error-border rounded-2xl p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-feedback-error"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-feedback-error">{t('common.error')}</h3>
                <p className="mt-1 text-sm text-feedback-error">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* セッション読み込み中はスケルトンを表示（sessionIdがある場合かつメッセージがない場合のみ） */}
        {isLoadingEvents && messages.length === 0 && sessionId && <MessageSkeleton />}

        {/* ウェルカムメッセージ（メッセージがない場合かつ読み込み中でない） */}
        {messages.length === 0 && !error && !isLoadingEvents && selectedAgent && (
          <div className="text-center py-12">
            <div className="mx-auto w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-fg-disabled" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
                <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
              </svg>
            </div>

            <h3 className="text-2xl font-semibold text-fg-default mb-2">
              {translateIfKey(selectedAgent.name, t)}
            </h3>
            <p className="text-fg-secondary max-w-md mx-auto mb-8">
              {translateIfKey(selectedAgent.description, t)}
            </p>

            {/* シナリオボタン（グリッド形式） */}
            {selectedAgent.scenarios.length > 0 && (
              <div className="grid grid-cols-3 gap-3 max-w-2xl mx-auto">
                {selectedAgent.scenarios.map((scenario) => (
                  <button
                    key={scenario.id}
                    onClick={() => onScenarioClick?.(translateIfKey(scenario.prompt, t))}
                    className="px-4 py-3 text-left text-sm text-fg-secondary bg-white hover:bg-surface-secondary rounded-xl border border-border transition-colors"
                  >
                    {translateIfKey(scenario.title, t)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* メッセージ一覧 - ローディング中は非表示 */}
        {!isLoadingEvents &&
          messages.map((message) => <Message key={message.id} message={message} />)}

        {/* 自動スクロール用の参照要素 */}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};
