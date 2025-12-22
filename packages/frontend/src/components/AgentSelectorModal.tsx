import React, { useState, useEffect } from 'react';
import { Plus, Bot, MoreHorizontal, Edit2, Trash2 } from 'lucide-react';
import { AgentForm } from './AgentForm';
import { Modal, ConfirmModal } from './ui/Modal';
import { useAgentStore } from '../stores/agentStore';
import type { Agent, CreateAgentInput } from '../types/agent';

interface AgentSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAgentSelect: (agent: Agent | null) => void;
}

export const AgentSelectorModal: React.FC<AgentSelectorModalProps> = ({
  isOpen,
  onClose,
  onAgentSelect,
}) => {
  const {
    agents,
    selectedAgent,
    selectAgent,
    createAgent,
    updateAgent,
    deleteAgent,
    isLoading,
    error,
  } = useAgentStore();

  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [deleteConfirmAgent, setDeleteConfirmAgent] = useState<Agent | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // モーダルが開かれたときに初期化
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        setMode('list');
        setEditingAgent(null);
        setDeleteConfirmAgent(null);
        setOpenMenuId(null);
      });
    }
  }, [isOpen]);

  // メニュー外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = () => {
      setOpenMenuId(null);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Agent選択
  const handleAgentSelect = (agent: Agent) => {
    selectAgent(agent);
    onAgentSelect(agent);
    onClose();
  };

  // Agent作成
  const handleCreateAgent = (data: CreateAgentInput) => {
    const newAgent = createAgent(data);
    setMode('list');
    selectAgent(newAgent);
    onAgentSelect(newAgent);
  };

  // Agent更新
  const handleUpdateAgent = (data: CreateAgentInput) => {
    if (!editingAgent) return;

    updateAgent({
      id: editingAgent.id,
      ...data,
    });
    setMode('list');
    setEditingAgent(null);
  };

  // Agent削除
  const handleDeleteAgent = (agent: Agent) => {
    deleteAgent(agent.id);
    setDeleteConfirmAgent(null);
    setOpenMenuId(null);

    if (selectedAgent?.id === agent.id) {
      selectAgent(null);
      onAgentSelect(null);
    }
  };

  // 3点メニュートグル
  const toggleMenu = (agentId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setOpenMenuId(openMenuId === agentId ? null : agentId);
  };

  const getModalTitle = () => {
    switch (mode) {
      case 'create':
        return 'エージェント作成';
      case 'edit':
        return 'エージェント編集';
      default:
        return 'エージェント選択';
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} size="xl">
        <Modal.Header>
          <div className="flex items-center space-x-3">
            <Modal.Icon icon={Bot} />
            <Modal.Title>{getModalTitle()}</Modal.Title>
            <span>エージェントのカスタマイズ機能は現在実装中です...</span>
          </div>
          <Modal.CloseButton />
        </Modal.Header>

        <Modal.Content>
          {/* エラー表示 */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* フォーム表示モード */}
          {(mode === 'create' || mode === 'edit') && (
            <div>
              <AgentForm
                agent={editingAgent || undefined}
                onSubmit={mode === 'create' ? handleCreateAgent : handleUpdateAgent}
                onCancel={() => {
                  setMode('list');
                  setEditingAgent(null);
                }}
                isLoading={isLoading}
              />
            </div>
          )}

          {/* Agent一覧表示モード */}
          {mode === 'list' && (
            <>
              {/* 新規作成ボタン */}
              <div className="mb-8">
                <button
                  onClick={() => setMode('create')}
                  className="inline-flex items-center space-x-3 px-6 py-3 text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <Plus className="w-5 h-5" />
                  <span className="font-medium">新規エージェント作成</span>
                </button>
              </div>

              {/* Agent一覧 */}
              {agents.length === 0 ? (
                <div className="text-center py-20">
                  <Bot className="w-16 h-16 text-gray-300 mx-auto mb-6" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Agentがありません</h3>
                  <p className="text-gray-500 mb-6">最初のAgentを作成してください</p>
                  <button
                    onClick={() => setMode('create')}
                    className="text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Agentを作成する
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {agents.map((agent) => {
                    const isSelected = selectedAgent?.id === agent.id;

                    return (
                      <div
                        key={agent.id}
                        className={`relative bg-white rounded-2xl transition-all cursor-pointer border ${
                          isSelected
                            ? 'border-blue-500 ring-2 ring-blue-100'
                            : 'border-gray-100 hover:border-gray-300'
                        }`}
                        onClick={() => handleAgentSelect(agent)}
                      >
                        <div className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center space-x-3 flex-1">
                              <div
                                className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                  isSelected ? 'bg-blue-100' : 'bg-gray-100'
                                }`}
                              >
                                <Bot
                                  className={`w-5 h-5 ${
                                    isSelected ? 'text-blue-600' : 'text-gray-600'
                                  }`}
                                />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center space-x-2">
                                  <h3 className="font-medium text-gray-900">{agent.name}</h3>
                                </div>
                                <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                                  {agent.description}
                                </p>
                              </div>
                            </div>

                            {/* 3点メニュー */}
                            <div className="relative ml-2">
                              <button
                                onClick={(e) => toggleMenu(agent.id, e)}
                                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </button>

                              {/* ドロップダウンメニュー */}
                              {openMenuId === agent.id && (
                                <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                                  <button
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingAgent(agent);
                                      setMode('edit');
                                      setOpenMenuId(null);
                                    }}
                                    className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                    <span>編集</span>
                                  </button>
                                  <button
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteConfirmAgent(agent);
                                      setOpenMenuId(null);
                                    }}
                                    className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    <span>削除</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </Modal.Content>
      </Modal>

      {/* 削除確認モーダル */}
      {deleteConfirmAgent && (
        <ConfirmModal
          isOpen={!!deleteConfirmAgent}
          onClose={() => setDeleteConfirmAgent(null)}
          onConfirm={() => handleDeleteAgent(deleteConfirmAgent)}
          title="Agent削除の確認"
          message={`「${deleteConfirmAgent.name}」を削除しますか？この操作は取り消せません。`}
          confirmText="削除"
          cancelText="キャンセル"
          variant="danger"
        />
      )}
    </>
  );
};
