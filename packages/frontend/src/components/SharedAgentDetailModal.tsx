/**
 * 共有エージェント詳細モーダル
 * 共有されたエージェントの詳細情報を表示し、マイエージェントに追加する機能を提供
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { X, User } from 'lucide-react';
import * as icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Agent } from '../types/agent';
import { translateIfKey } from '../utils/agent-translation';
import { useSharedAgentStore } from '../stores/sharedAgentStore';
import { useAgentStore } from '../stores/agentStore';
import { useAuthStore } from '../stores/authStore';
import { toggleShareAgent, createAgent } from '../api/agents';

interface SharedAgentDetailModalProps {
  agent: Agent | null;
  onClose: () => void;
}

export const SharedAgentDetailModal: React.FC<SharedAgentDetailModalProps> = ({
  agent,
  onClose,
}) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { cloneAgent, fetchSharedAgents } = useSharedAgentStore();
  const { initializeStore: refreshAgents } = useAgentStore();
  const [isCloning, setIsCloning] = React.useState(false);
  const [isUnsharing, setIsUnsharing] = React.useState(false);

  if (!agent) return null;

  const AgentIcon = (icons[agent.icon as keyof typeof icons] as LucideIcon) || icons.Bot;

  // 自分のエージェントか判定（userId ベースで比較）
  const isOwnAgent = user?.userId === agent.userId;

  // マイエージェントに追加
  const handleAddToMyAgents = async () => {
    setIsCloning(true);
    try {
      // デフォルトエージェント（userId === 'system'）の場合は新規作成
      if (agent.userId === 'system') {
        await createAgent({
          name: agent.name,
          description: agent.description,
          icon: agent.icon,
          systemPrompt: agent.systemPrompt,
          enabledTools: agent.enabledTools,
          scenarios: agent.scenarios.map((s) => ({
            title: s.title,
            prompt: s.prompt,
          })),
          mcpConfig: agent.mcpConfig,
        });
      } else {
        // 共有エージェントの場合はクローン
        if (!agent.userId) {
          alert('エージェントのユーザーIDが見つかりません');
          return;
        }
        await cloneAgent(agent.userId, agent.id);
      }

      await refreshAgents();
      alert('エージェントをマイエージェントに追加しました！');
      onClose();
    } catch (error) {
      console.error('エージェントの追加に失敗:', error);
      alert('エージェントの追加に失敗しました');
    } finally {
      setIsCloning(false);
    }
  };

  // 共有を解除する
  const handleUnshare = async () => {
    setIsUnsharing(true);
    try {
      await toggleShareAgent(agent.id);
      await fetchSharedAgents(); // 共有エージェント一覧を更新
      alert('共有を解除しました');
      onClose();
    } catch (error) {
      console.error('共有解除に失敗:', error);
      alert('共有解除に失敗しました');
    } finally {
      setIsUnsharing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl max-w-5xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
              <AgentIcon className="w-6 h-6 text-gray-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {translateIfKey(agent.name, t)}
              </h2>
              <p className="text-sm text-gray-600">{translateIfKey(agent.description, t)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
            {/* 左側: System Prompt */}
            <div className="flex flex-col h-[80%]">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">System Prompt</h3>
              <div className="bg-gray-50 rounded-lg p-4 flex-1 min-h-0 overflow-y-auto">
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
                  {agent.systemPrompt}
                </pre>
              </div>
            </div>

            {/* 右側: Tools & Scenarios */}
            <div className="space-y-6">
              {/* Tools */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Tools</h3>
                <div className="flex flex-wrap gap-2">
                  {agent.enabledTools.map((tool) => (
                    <span
                      key={tool}
                      className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </div>

              {/* Scenarios */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Scenario</h3>
                <div className="space-y-2">
                  {agent.scenarios.map((scenario) => (
                    <div
                      key={scenario.id}
                      className="bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition-colors"
                    >
                      <h4 className="text-sm font-medium text-gray-900 mb-1">
                        {translateIfKey(scenario.title, t)}
                      </h4>
                      <p className="text-xs text-gray-600 line-clamp-2">
                        {translateIfKey(scenario.prompt, t)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
          {/* 作成者情報 */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
              <User className="w-4 h-4 text-gray-600" />
            </div>
            <span className="text-sm text-gray-700">
              <span className="font-medium">{agent.createdBy}</span>
            </span>
          </div>

          {/* アクションボタン */}
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              閉じる
            </button>
            {isOwnAgent ? (
              <button
                onClick={handleUnshare}
                disabled={isUnsharing}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isUnsharing ? '共有を解除中...' : '共有を解除する'}
              </button>
            ) : (
              <button
                onClick={handleAddToMyAgents}
                disabled={isCloning}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isCloning ? 'マイエージェントに追加中...' : 'マイエージェントに追加'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
