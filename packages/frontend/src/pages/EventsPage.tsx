/**
 * Events Page - Trigger Management
 * Manage scheduled agent executions
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarRange, Plus } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { TriggerList } from '../components/triggers/TriggerList';
import { TriggerFormModal } from '../components/triggers/TriggerFormModal';
import { ExecutionHistoryModal } from '../components/triggers/ExecutionHistory';
import { useTriggerStore } from '../stores/triggerStore';
import type { Trigger } from '../types/trigger';
import toast from 'react-hot-toast';

export function EventsPage() {
  const { t } = useTranslation();
  const { triggers, isLoading, fetchTriggers, enableTrigger, disableTrigger, deleteTrigger } =
    useTriggerStore();

  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedTrigger, setSelectedTrigger] = useState<Trigger | null>(null);
  const [historyTriggerId, setHistoryTriggerId] = useState<string>('');
  const [historyTriggerName, setHistoryTriggerName] = useState<string>('');

  // Fetch triggers on mount
  useEffect(() => {
    fetchTriggers().catch((error) => {
      console.error('Failed to fetch triggers:', error);
      toast.error(t('triggers.messages.fetchError'));
    });
  }, [fetchTriggers, t]);

  // Handle toggle trigger
  const handleToggle = async (triggerId: string, enabled: boolean) => {
    try {
      if (enabled) {
        await enableTrigger(triggerId);
        toast.success(t('triggers.messages.enableSuccess'));
      } else {
        await disableTrigger(triggerId);
        toast.success(t('triggers.messages.disableSuccess'));
      }
    } catch (error) {
      console.error('Failed to toggle trigger:', error);
      toast.error(t('triggers.messages.toggleError'));
    }
  };

  // Handle delete trigger
  const handleDelete = async (triggerId: string) => {
    if (!confirm(t('triggers.messages.deleteConfirm'))) {
      return;
    }

    try {
      await deleteTrigger(triggerId);
      toast.success(t('triggers.messages.deleteSuccess'));
    } catch (error) {
      console.error('Failed to delete trigger:', error);
      toast.error(t('triggers.messages.deleteError'));
    }
  };

  // Handle edit trigger
  const handleEdit = (trigger: Trigger) => {
    setSelectedTrigger(trigger);
    setIsFormModalOpen(true);
  };

  // Handle view history
  const handleViewHistory = (triggerId: string) => {
    const trigger = triggers.find((t) => t.id === triggerId);
    if (trigger) {
      setHistoryTriggerId(triggerId);
      setHistoryTriggerName(trigger.name);
      setIsHistoryModalOpen(true);
    }
  };

  // Handle create trigger
  const handleCreate = () => {
    setSelectedTrigger(null);
    setIsFormModalOpen(true);
  };

  // Handle form modal close
  const handleFormModalClose = () => {
    setIsFormModalOpen(false);
    setSelectedTrigger(null);
  };

  // Handle form save
  const handleFormSave = () => {
    fetchTriggers();
  };

  // Handle history modal close
  const handleHistoryModalClose = () => {
    setIsHistoryModalOpen(false);
    setHistoryTriggerId('');
    setHistoryTriggerName('');
  };

  return (
    <>
      <PageHeader
        icon={CalendarRange}
        title={t('navigation.events')}
        actions={
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            {t('triggers.create')}
          </button>
        }
      />

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <TriggerList
          triggers={triggers}
          isLoading={isLoading}
          onEdit={handleEdit}
          onToggle={handleToggle}
          onViewHistory={handleViewHistory}
          onDelete={handleDelete}
        />
      </div>

      {/* Modals */}
      <TriggerFormModal
        isOpen={isFormModalOpen}
        onClose={handleFormModalClose}
        trigger={selectedTrigger}
        onSave={handleFormSave}
      />

      <ExecutionHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={handleHistoryModalClose}
        triggerId={historyTriggerId}
        triggerName={historyTriggerName}
      />
    </>
  );
}
