/**
 * Command Palette Component
 * Provides quick access to agents, navigation, and recent chats via Cmd+K
 */

import { useEffect, useMemo } from 'react';
import { Command } from 'cmdk';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bot, Search, Check, MessageSquare } from 'lucide-react';
import * as icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAgentStore, useSelectedAgent } from '../../../stores/agentStore';
import { useSessionStore } from '../../../stores/sessionStore';
import type { Agent } from '../../../types/agent';
import { translateIfKey } from '../../../utils/agent-translation';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const agents = useAgentStore((state) => state.agents);
  const selectedAgent = useSelectedAgent();
  const selectAgent = useAgentStore((state) => state.selectAgent);
  const { sessions, selectSession } = useSessionStore();

  // Check if we're on a chat page
  const isChatPage = location.pathname.startsWith('/chat');

  // Recent sessions (limit to 5)
  const recentSessions = useMemo(() => sessions.slice(0, 5), [sessions]);

  // Handle agent selection
  const handleAgentSelect = (agent: Agent) => {
    selectAgent(agent);
    onClose();
    // Dispatch custom event to focus message input
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('focusMessageInput'));
    }, 100);
  };

  // Handle session selection
  const handleSessionSelect = (sessionId: string) => {
    selectSession(sessionId);
    navigate(`/chat/${sessionId}`);
    onClose();
  };

  // Get agent icon component
  const getAgentIcon = (iconName?: string): LucideIcon => {
    if (!iconName) return Bot;
    return (icons[iconName as keyof typeof icons] as LucideIcon) || Bot;
  };

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />

      {/* Command Dialog */}
      <div className="fixed left-1/2 top-[20%] -translate-x-1/2 w-full max-w-4xl px-4">
        <Command
          className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
          loop
        >
          {/* Search Input */}
          <div className="flex items-center border-b border-gray-100 px-4">
            <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <Command.Input
              placeholder={t('commandPalette.placeholder', 'Type a command or search...')}
              className="w-full px-3 py-3 text-base outline-none placeholder:text-gray-400"
              autoFocus
            />
            <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-400 bg-gray-100 rounded">
              ESC
            </kbd>
          </div>

          {/* Command List */}
          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-gray-500">
              {t('commandPalette.noResults', 'No results found.')}
            </Command.Empty>

            {/* Switch Agent - Only on chat pages */}
            {isChatPage && agents.length > 0 && (
              <Command.Group
                heading={
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide px-2 pt-1 pb-2">
                    {t('commandPalette.switchAgent', 'Switch Agent')}
                  </span>
                }
                className="pb-2"
              >
                {agents.map((agent) => {
                  const AgentIcon = getAgentIcon(agent.icon);
                  const isSelected = selectedAgent?.agentId === agent.agentId;

                  return (
                    <Command.Item
                      key={agent.agentId}
                      value={`agent-${agent.name}-${translateIfKey(agent.description, t)}`}
                      onSelect={() => handleAgentSelect(agent)}
                      className="flex items-center gap-4 px-3 py-2.5 rounded-xl cursor-pointer text-gray-700 data-[selected=true]:bg-gray-100 data-[selected=true]:text-gray-900 transition-colors"
                    >
                      <AgentIcon className="w-4 h-4 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{translateIfKey(agent.name, t)}</div>
                        <div className="text-xs text-gray-500 truncate">
                          {translateIfKey(agent.description, t)}
                        </div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-gray-600 flex-shrink-0" />}
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}

            {/* Recent Chats */}
            {recentSessions.length > 0 && (
              <Command.Group
                heading={
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide px-2 pt-1 pb-2">
                    {t('commandPalette.recentChats', 'Recent Chats')}
                  </span>
                }
                className={
                  isChatPage && agents.length > 0 ? 'border-t border-gray-100 pt-2 pb-2' : 'pb-2'
                }
              >
                {recentSessions.map((session) => (
                  <Command.Item
                    key={session.sessionId}
                    value={`session-${session.title}-${session.sessionId}`}
                    onSelect={() => handleSessionSelect(session.sessionId)}
                    className="flex items-center gap-4 px-3 py-2.5 rounded-xl cursor-pointer text-gray-700 data-[selected=true]:bg-gray-100 data-[selected=true]:text-gray-900 transition-colors"
                  >
                    <MessageSquare className="w-4 h-4 flex-shrink-0 text-gray-400" />
                    <span className="font-medium truncate">{session.title}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2 text-xs text-gray-400">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">↑↓</kbd>
                {t('commandPalette.toNavigate', 'to navigate')}
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">↵</kbd>
                {t('commandPalette.toSelect', 'to select')}
              </span>
            </div>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">⌘K</kbd>
              {t('commandPalette.toToggle', 'to toggle')}
            </span>
          </div>
        </Command>
      </div>
    </div>
  );
};
