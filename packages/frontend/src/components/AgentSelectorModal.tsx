import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Plus, Bot, MoreHorizontal, Edit2, Trash2, AlertTriangle, Share2 } from 'lucide-react';
import * as icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AgentForm } from './AgentForm';
import { Modal, ConfirmModal } from './ui/Modal';
import { useAgentStore } from '../stores/agentStore';
import { useUIStore } from '../stores/uiStore';
import type { Agent, CreateAgentInput } from '../types/agent';
import { translateIfKey } from '../utils/agent-translation';

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
  const { t } = useTranslation();
  const {
    agents,
    selectedAgent,
    selectAgent,
    createAgent,
    updateAgent,
    deleteAgent,
    toggleShare,
    initializeStore,
    isLoading,
    error,
  } = useAgentStore();
  const { isMobileView } = useUIStore();

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
  const handleCreateAgent = async (data: CreateAgentInput) => {
    const newAgent = await createAgent(data);
    setMode('list');
    selectAgent(newAgent);
    onAgentSelect(newAgent);
  };

  // Agent更新
  const handleUpdateAgent = async (data: CreateAgentInput) => {
    if (!editingAgent) return;

    await updateAgent({
      id: editingAgent.id,
      ...data,
    });
    setMode('list');
    setEditingAgent(null);
  };

  // Agent削除
  const handleDeleteAgent = async (agent: Agent) => {
    await deleteAgent(agent.id);
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

  // localStorage クリア処理
  const handleClearLocalStorage = () => {
    if (confirm(t('agent.clearStorageConfirm'))) {
      localStorage.removeItem('agentcore-agents');
      localStorage.removeItem('agentcore-selected-agent');
      initializeStore();
      setMode('list');
      setEditingAgent(null);
    }
  };

  const getModalTitle = () => {
    switch (mode) {
      case 'create':
        return t('agent.createAgent');
      case 'edit':
        return t('agent.editAgent');
      default:
        return t('agent.selectAgent');
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} size="xl">
        <Modal.Header>
          <div className="flex items-center space-x-3">
            <Modal.Icon icon={Bot} />
            <Modal.Title>{getModalTitle()}</Modal.Title>
          </div>
          <Modal.CloseButton />
        </Modal.Header>

        {/* フォーム表示モード */}
        {(mode === 'create' || mode === 'edit') && (
          <>
            <Modal.Content noPadding>
              <div className="h-full">
                {/* エラー表示 */}
                {error && (
                  <div className="mx-6 mt-6 mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}
                <AgentForm
                  agent={editingAgent || undefined}
                  onSubmit={mode === 'create' ? handleCreateAgent : handleUpdateAgent}
                  isLoading={isLoading}
                />
              </div>
            </Modal.Content>
            <Modal.Footer>
              <button
                type="button"
                onClick={() => {
                  setMode('list');
                  setEditingAgent(null);
                }}
                disabled={isLoading}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                form="agent-form"
                disabled={isLoading}
                className="inline-flex items-center space-x-2 px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <span>{isLoading ? t('common.saving') : t('common.save')}</span>
              </button>
            </Modal.Footer>
          </>
        )}

        {/* Agent一覧表示モード */}
        {mode === 'list' && (
          <>
            <Modal.Content>
              <div className="h-[81vh] overflow-y-auto">
                {error && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                {/* 新規作成ボタン - デスクトップのみ */}
                {!isMobileView && (
                  <div className="mb-8">
                    <button
                      onClick={() => setMode('create')}
                      className="inline-flex items-center space-x-3 px-6 py-3 text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
                    >
                      <Plus className="w-5 h-5" />
                      <span className="font-medium">{t('agent.createNewAgent')}</span>
                    </button>
                  </div>
                )}

                {/* Agent一覧 */}
                {agents.length === 0 ? (
                  <div className="text-center py-20">
                    <Bot className="w-16 h-16 text-gray-300 mx-auto mb-6" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      {t('agent.noAgentsTitle')}
                    </h3>
                    <p className="text-gray-500 mb-6">{t('agent.noAgentsDescription')}</p>
                    <button
                      onClick={() => setMode('create')}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {t('agent.createAgentButton')}
                    </button>
                  </div>
                ) : (
                  <div
                    className={`grid gap-6 ${isMobileView ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}
                  >
                    {agents.map((agent) => {
                      const isSelected = selectedAgent?.id === agent.id;
                      const AgentIcon =
                        (icons[agent.icon as keyof typeof icons] as LucideIcon) || Bot;

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
                                  <AgentIcon
                                    className={`w-5 h-5 ${
                                      isSelected ? 'text-blue-600' : 'text-gray-600'
                                    }`}
                                  />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center space-x-2">
                                    <h3 className="font-medium text-gray-900">
                                      {translateIfKey(agent.name, t)}
                                    </h3>
                                  </div>
                                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                                    {translateIfKey(agent.description, t)}
                                  </p>
                                </div>
                              </div>

                              {/* 3点メニュー - デスクトップのみ */}
                              {!isMobileView && (
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
                                        <span>{t('common.edit')}</span>
                                      </button>
                                      <button
                                        onMouseDown={(e) => {
                                          e.stopPropagation();
                                        }}
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          const wasShared = agent.isShared;
                                          try {
                                            await toggleShare(agent.id);
                                            // 成功時にトースト通知
                                            toast.success(
                                              wasShared
                                                ? t('agent.unshareSuccess')
                                                : t('agent.shareSuccess'),
                                              {
                                                icon: '✅',
                                              }
                                            );
                                          } catch (error) {
                                            console.error('共有状態の変更に失敗:', error);
                                            toast.error(t('agent.shareError'));
                                          }
                                          setOpenMenuId(null);
                                        }}
                                        className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
                                      >
                                        <Share2 className="w-3 h-3" />
                                        <span>
                                          {agent.isShared ? t('agent.unshare') : t('agent.share')}
                                        </span>
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
                                        <span>{t('common.delete')}</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Modal.Content>

            {/* 開発中警告バナー - 下部固定 */}
            <Modal.Footer>
              <div className="flex items-start space-x-2 w-full">
                <AlertTriangle className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs text-gray-500">{t('agent.storageNotice')}</p>
                </div>
                <button
                  onClick={handleClearLocalStorage}
                  className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800 underline whitespace-nowrap"
                >
                  {t('common.clearStorage')}
                </button>
              </div>
            </Modal.Footer>
          </>
        )}
      </Modal>

      {/* 削除確認モーダル */}
      {deleteConfirmAgent && (
        <ConfirmModal
          isOpen={!!deleteConfirmAgent}
          onClose={() => setDeleteConfirmAgent(null)}
          onConfirm={() => handleDeleteAgent(deleteConfirmAgent)}
          title={t('agent.deleteAgentConfirmTitle')}
          message={t('agent.deleteAgentConfirmMessage', {
            name: translateIfKey(deleteConfirmAgent.name, t),
          })}
          confirmText={t('common.delete')}
          cancelText={t('common.cancel')}
          variant="danger"
        />
      )}
    </>
  );
};
