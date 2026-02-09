import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { Plus, Bot, MoreHorizontal, Edit2, Trash2, Share2, Search, X } from 'lucide-react';
import * as icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AgentForm } from './AgentForm';
import { Modal, ConfirmModal } from './ui/Modal';
import { LoadingIndicator } from './ui/LoadingIndicator/LoadingIndicator';
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
    refreshAgents,
    isLoading,
    error,
  } = useAgentStore();
  const { isMobileView } = useUIStore();

  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [deleteConfirmAgent, setDeleteConfirmAgent] = useState<Agent | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter agents by search query
  const filteredAgents = useMemo(() => {
    if (!searchQuery.trim()) {
      return agents;
    }
    const query = searchQuery.toLowerCase();
    return agents.filter((agent) => {
      const name = translateIfKey(agent.name, t).toLowerCase();
      const description = translateIfKey(agent.description, t).toLowerCase();
      return name.includes(query) || description.includes(query);
    });
  }, [agents, searchQuery, t]);

  // Initialize when modal opens
  useEffect(() => {
    if (isOpen) {
      // Refresh agents list from API
      refreshAgents();

      requestAnimationFrame(() => {
        setMode('list');
        setEditingAgent(null);
        setDeleteConfirmAgent(null);
        setOpenMenuId(null);
        setSearchQuery('');
      });
    }
  }, [isOpen, refreshAgents]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = () => {
      setOpenMenuId(null);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Select agent
  const handleAgentSelect = (agent: Agent) => {
    selectAgent(agent);
    onAgentSelect(agent);
    onClose();
  };

  // Create agent
  const handleCreateAgent = async (data: CreateAgentInput) => {
    const newAgent = await createAgent(data);
    setMode('list');
    selectAgent(newAgent);
    onAgentSelect(newAgent);
  };

  // Update agent
  const handleUpdateAgent = async (data: CreateAgentInput) => {
    if (!editingAgent) return;

    await updateAgent({
      agentId: editingAgent.agentId,
      ...data,
    });
    setMode('list');
    setEditingAgent(null);
  };

  // Delete agent
  const handleDeleteAgent = async (agent: Agent) => {
    await deleteAgent(agent.agentId);
    setDeleteConfirmAgent(null);
    setOpenMenuId(null);

    if (selectedAgent?.agentId === agent.agentId) {
      selectAgent(null);
      onAgentSelect(null);
    }
  };

  // 3-dot menu toggle
  const toggleMenu = (agentId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setOpenMenuId(openMenuId === agentId ? null : agentId);
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
                  <div className="mx-6 mt-6 mb-4 p-4 bg-feedback-error-bg border border-feedback-error-border rounded-lg">
                    <p className="text-sm text-feedback-error">{error}</p>
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
                className="px-6 py-3 text-sm md:text-base font-medium text-fg-secondary border border-border-strong rounded-lg hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[48px]"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                form="agent-form"
                disabled={isLoading}
                className="inline-flex items-center justify-center space-x-2 px-6 py-3 text-sm md:text-base font-medium text-white bg-action-primary rounded-lg hover:bg-action-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[48px]"
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
                  <div className="mb-6 p-4 bg-feedback-error-bg border border-feedback-error-border rounded-lg">
                    <p className="text-sm text-feedback-error">{error}</p>
                  </div>
                )}

                {/* ローディング表示 */}
                {isLoading && <LoadingIndicator size="lg" spacing="lg" />}

                {/* 検索バーと新規作成ボタン */}
                {!isLoading && agents.length > 0 && (
                  <div className="mb-6 flex items-center gap-4">
                    {/* 検索バー（左側） */}
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-disabled" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t('agent.searchPlaceholder')}
                        className="w-full pl-10 pr-10 py-2.5 border border-border-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-border-focus focus:border-transparent text-sm"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-disabled hover:text-fg-secondary"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* 新規作成ボタン（右側） - モバイル: アイコンのみ、デスクトップ: フルテキスト */}
                    <button
                      onClick={() => setMode('create')}
                      className={`inline-flex items-center text-white bg-action-primary rounded-xl hover:bg-action-primary-hover transition-colors shadow-sm ${
                        isMobileView ? 'p-2.5' : 'space-x-2 px-6 py-2.5'
                      }`}
                      title={isMobileView ? t('agent.createNewAgent') : undefined}
                    >
                      <Plus className="w-5 h-5" />
                      {!isMobileView && (
                        <span className="font-medium">{t('agent.createNewAgent')}</span>
                      )}
                    </button>
                  </div>
                )}

                {/* Agent一覧 */}
                {!isLoading && agents.length === 0 ? (
                  <div className="text-center py-20">
                    <Bot className="w-16 h-16 text-fg-disabled mx-auto mb-6" />
                    <h3 className="text-lg font-medium text-fg-default mb-2">
                      {t('agent.noAgentsTitle')}
                    </h3>
                    <p className="text-fg-muted mb-6">{t('agent.noAgentsDescription')}</p>
                    <button
                      onClick={() => setMode('create')}
                      className="text-action-primary hover:text-action-primary font-medium"
                    >
                      {t('agent.createAgentButton')}
                    </button>
                  </div>
                ) : !isLoading && filteredAgents.length === 0 ? (
                  <div className="text-center py-20">
                    <Search className="w-16 h-16 text-fg-disabled mx-auto mb-6" />
                    <h3 className="text-lg font-medium text-fg-default mb-2">
                      {t('agent.noSearchResults')}
                    </h3>
                    <p className="text-fg-muted mb-6">{t('agent.noSearchResultsDescription')}</p>
                    <button
                      onClick={() => setSearchQuery('')}
                      className="text-action-primary hover:text-action-primary font-medium"
                    >
                      {t('agent.clearSearch')}
                    </button>
                  </div>
                ) : (
                  !isLoading && (
                    <div
                      className={`grid gap-6 ${isMobileView ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}
                    >
                      {filteredAgents.map((agent) => {
                        const isSelected = selectedAgent?.agentId === agent.agentId;
                        const AgentIcon =
                          (icons[agent.icon as keyof typeof icons] as LucideIcon) || Bot;

                        return (
                          <div
                            key={agent.agentId}
                            className={`relative bg-white rounded-2xl transition-all cursor-pointer border ${
                              isSelected
                                ? 'border-blue-500 ring-2 ring-blue-100'
                                : 'border-border hover:border-border-strong'
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
                                        isSelected ? 'text-action-primary' : 'text-fg-secondary'
                                      }`}
                                    />
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center space-x-2">
                                      <h3 className="font-medium text-fg-default">
                                        {translateIfKey(agent.name, t)}
                                      </h3>
                                    </div>
                                    <p className="text-sm text-fg-muted mt-1 line-clamp-2">
                                      {translateIfKey(agent.description, t)}
                                    </p>
                                  </div>
                                </div>

                                <div className="relative ml-2">
                                  <button
                                    onClick={(e) => toggleMenu(agent.agentId, e)}
                                    className="p-1.5 text-fg-disabled hover:text-fg-secondary hover:bg-gray-100 rounded transition-colors"
                                  >
                                    <MoreHorizontal className="w-5 h-5" />
                                  </button>

                                  {/* ドロップダウンメニュー */}
                                  {openMenuId === agent.agentId && (
                                    <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-border py-1 z-10">
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
                                        className="w-full px-3 py-1.5 text-left text-sm text-fg-secondary hover:bg-surface-secondary flex items-center space-x-2"
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
                                            await toggleShare(agent.agentId);
                                            // Show toast on success
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
                                        className="w-full px-3 py-1.5 text-left text-sm text-fg-secondary hover:bg-surface-secondary flex items-center space-x-2"
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
                                        className="w-full px-3 py-1.5 text-left text-sm text-feedback-error hover:bg-feedback-error-bg flex items-center space-x-2"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                        <span>{t('common.delete')}</span>
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
                  )
                )}
              </div>
            </Modal.Content>
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
