import React, { useState } from 'react';
import { Bot } from 'lucide-react';
import * as icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSelectedAgent } from '../stores/agentStore';
import { useUIStore } from '../stores/uiStore';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { AgentSelectorModal } from './AgentSelectorModal';
import type { Agent } from '../types/agent';
import { translateIfKey } from '../utils/agent-translation';

interface ChatContainerProps {
  sessionId: string | null;
  onCreateSession: () => string;
}

export const ChatContainer: React.FC<ChatContainerProps> = ({ sessionId, onCreateSession }) => {
  const { t } = useTranslation();
  const selectedAgent = useSelectedAgent();
  const { isMobileView } = useUIStore();
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [selectedScenarioPrompt, setSelectedScenarioPrompt] = useState<string | null>(null);

  // Handle scenario click
  const handleScenarioClick = (prompt: string) => {
    setSelectedScenarioPrompt(prompt);
  };

  // Function to get scenario prompt (pass to MessageInput)
  const getScenarioPrompt = () => {
    const prompt = selectedScenarioPrompt;
    if (prompt) {
      setSelectedScenarioPrompt(null); // Use only once
    }
    return prompt;
  };

  // Handle agent selection
  const handleAgentSelect = (agent: Agent | null) => {
    console.log('Agent selected:', agent?.name || 'None');
  };

  return (
    <div className="chat-container">
      {/* ヘッダー - デスクトップ時のみ表示 */}
      {!isMobileView && (
        <header className="flex items-center justify-between p-4 bg-white">
          <div className="flex items-center">
            <button
              onClick={() => setIsAgentModalOpen(true)}
              className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-50 transition-colors group"
            >
              {(() => {
                const AgentIcon = selectedAgent?.icon
                  ? (icons[selectedAgent.icon as keyof typeof icons] as LucideIcon) || Bot
                  : Bot;
                return <AgentIcon className="w-6 h-6 text-gray-700" />;
              })()}
              <h1 className="text-lg font-semibold text-gray-900">
                {selectedAgent ? translateIfKey(selectedAgent.name, t) : '汎用アシスタント'}
              </h1>
            </button>
          </div>
        </header>
      )}

      {/* メッセージリスト - pb-32で入力フォーム領域を確保 */}
      <MessageList onScenarioClick={handleScenarioClick} />

      {/* メッセージ入力 */}
      <MessageInput
        sessionId={sessionId}
        onCreateSession={onCreateSession}
        getScenarioPrompt={getScenarioPrompt}
      />

      {/* Select agentモーダル */}
      <AgentSelectorModal
        isOpen={isAgentModalOpen}
        onClose={() => setIsAgentModalOpen(false)}
        onAgentSelect={handleAgentSelect}
      />
    </div>
  );
};
