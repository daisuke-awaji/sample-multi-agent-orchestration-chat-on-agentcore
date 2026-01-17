/**
 * TriggerFormModal Component
 *
 * Modal for creating and editing triggers
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Clock } from 'lucide-react';
import {
  Modal,
  ModalHeader,
  ModalContent,
  ModalFooter,
  ModalTitle,
  ModalCloseButton,
} from '../../ui/Modal';
import { SidebarTabsLayout, type TabItem } from '../../ui/SidebarTabs';
import { TriggerBasicInfo } from './TriggerBasicInfo';
import { ScheduleConfig } from './ScheduleConfig';
import { InputMessageConfig } from './InputMessageConfig';
import { AgentExecutionConfig } from './AgentExecutionConfig';
import { EventTypeSelector, type EventType } from './EventTypeSelector';
import { EventSourceSelector } from './EventSourceSelector';
import { useTriggerStore } from '../../../stores/triggerStore';
import type { Trigger, CreateTriggerRequest, UpdateTriggerRequest } from '../../../types/trigger';
import toast from 'react-hot-toast';

type TabType = 'basic' | 'trigger';

export interface TriggerFormModalProps {
  /**
   * Whether the modal is open
   */
  isOpen: boolean;

  /**
   * Callback when modal is closed
   */
  onClose: () => void;

  /**
   * Trigger to edit (null for create mode)
   */
  trigger?: Trigger | null;

  /**
   * Callback when trigger is saved
   */
  onSave?: () => void;
}

interface FormData {
  name: string;
  description: string;
  agentId: string;
  cronExpression: string;
  timezone: string;
  eventSourceId?: string;
  inputMessage: string;
  modelId?: string;
  workingDirectory?: string;
}

export function TriggerFormModal({ isOpen, onClose, trigger, onSave }: TriggerFormModalProps) {
  const { t } = useTranslation();
  const { createTrigger, updateTrigger } = useTriggerStore();
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('basic');
  const [selectedEventType, setSelectedEventType] = useState<EventType | null>(
    trigger ? (trigger.type === 'event' ? 'event' : 'schedule') : null
  );

  const isEditMode = !!trigger;

  // Initialize form data
  const [formData, setFormData] = useState<FormData>(() => {
    if (trigger?.type === 'schedule' && trigger.scheduleConfig) {
      return {
        name: trigger.name,
        description: trigger.description || '',
        agentId: trigger.agentId,
        cronExpression: trigger.scheduleConfig.expression,
        timezone: trigger.scheduleConfig.timezone || 'Asia/Tokyo',
        inputMessage: trigger.prompt,
        modelId: trigger.modelId,
        workingDirectory: trigger.workingDirectory,
      };
    } else if (trigger?.type === 'event' && trigger.eventConfig) {
      return {
        name: trigger.name,
        description: trigger.description || '',
        agentId: trigger.agentId,
        cronExpression: '0 0 * * ? *',
        timezone: 'Asia/Tokyo',
        eventSourceId: trigger.eventConfig.eventSourceId,
        inputMessage: trigger.prompt,
        modelId: trigger.modelId,
        workingDirectory: trigger.workingDirectory,
      };
    }
    return {
      name: '',
      description: '',
      agentId: '',
      cronExpression: '0 0 * * ? *',
      timezone: 'Asia/Tokyo',
      eventSourceId: undefined,
      inputMessage: '',
      modelId: undefined,
      workingDirectory: undefined,
    };
  });

  // Reset form when trigger changes
  useEffect(() => {
    if (trigger) {
      setSelectedEventType(trigger.type);
      if (trigger.type === 'schedule' && trigger.scheduleConfig) {
        setFormData({
          name: trigger.name,
          description: trigger.description || '',
          agentId: trigger.agentId,
          cronExpression: trigger.scheduleConfig.expression,
          timezone: trigger.scheduleConfig.timezone || 'Asia/Tokyo',
          inputMessage: trigger.prompt,
          modelId: trigger.modelId,
          workingDirectory: trigger.workingDirectory,
        });
      } else if (trigger.type === 'event' && trigger.eventConfig) {
        setFormData({
          name: trigger.name,
          description: trigger.description || '',
          agentId: trigger.agentId,
          cronExpression: '0 0 * * ? *',
          timezone: 'Asia/Tokyo',
          eventSourceId: trigger.eventConfig.eventSourceId,
          inputMessage: trigger.prompt,
          modelId: trigger.modelId,
          workingDirectory: trigger.workingDirectory,
        });
      }
    } else {
      setFormData({
        name: '',
        description: '',
        agentId: '',
        cronExpression: '0 0 * * ? *',
        timezone: 'Asia/Tokyo',
        eventSourceId: undefined,
        inputMessage: '',
        modelId: undefined,
        workingDirectory: undefined,
      });
    }
  }, [trigger]);

  // Validate form
  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      toast.error(t('triggers.form.nameRequired'));
      return false;
    }

    if (!formData.agentId) {
      toast.error(t('triggers.form.agentRequired'));
      return false;
    }

    if (!formData.inputMessage.trim()) {
      toast.error(t('triggers.form.inputMessageRequired'));
      return false;
    }

    if (selectedEventType === 'event' && !formData.eventSourceId) {
      toast.error(t('triggers.form.eventSourceRequired'));
      return false;
    }

    return true;
  };

  // Handle save
  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    setIsSaving(true);

    try {
      if (isEditMode) {
        // Update existing trigger
        const updateData: UpdateTriggerRequest = {
          name: formData.name,
          description: formData.description || undefined,
          agentId: formData.agentId,
          type: selectedEventType as 'schedule' | 'event',
          prompt: formData.inputMessage,
          modelId: formData.modelId,
          workingDirectory: formData.workingDirectory,
        };

        if (selectedEventType === 'schedule') {
          updateData.scheduleConfig = {
            expression: formData.cronExpression,
            timezone: formData.timezone,
          };
        } else if (selectedEventType === 'event') {
          updateData.eventConfig = {
            eventSourceId: formData.eventSourceId!,
          };
        }

        await updateTrigger(trigger.id, updateData);
        toast.success(t('triggers.messages.updateSuccess'));
      } else {
        // Create new trigger
        const createData: CreateTriggerRequest = {
          name: formData.name,
          description: formData.description || undefined,
          agentId: formData.agentId,
          type: selectedEventType as 'schedule' | 'event',
          prompt: formData.inputMessage,
          modelId: formData.modelId,
          workingDirectory: formData.workingDirectory,
        };

        if (selectedEventType === 'schedule') {
          createData.scheduleConfig = {
            expression: formData.cronExpression,
            timezone: formData.timezone,
          };
        } else if (selectedEventType === 'event') {
          createData.eventConfig = {
            eventSourceId: formData.eventSourceId!,
          };
        }

        await createTrigger(createData);
        toast.success(t('triggers.messages.createSuccess'));
      }

      onSave?.();
      onClose();
    } catch (error) {
      console.error('Failed to save trigger:', error);
      toast.error(
        isEditMode ? t('triggers.messages.updateError') : t('triggers.messages.createError')
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    onClose();
  };

  // Tab configuration
  const tabs: TabItem<TabType>[] = [
    { id: 'basic', label: t('triggers.tabs.basic'), icon: Settings },
    { id: 'trigger', label: t('triggers.tabs.trigger'), icon: Clock },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalHeader>
        <ModalTitle>
          {isEditMode ? t('triggers.form.editTitle') : t('triggers.form.createTitle')}
        </ModalTitle>
        <ModalCloseButton />
      </ModalHeader>

      <ModalContent noPadding={true}>
        <SidebarTabsLayout tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
          <div className="h-[80vh] overflow-y-auto px-6 py-6">
            {/* Basic Settings Tab */}
            {activeTab === 'basic' && (
              <div className="space-y-6 max-w-5xl mx-auto">
                <h2 className="text-lg font-semibold text-gray-900 mb-6">
                  {t('triggers.tabs.basic')}
                </h2>

                {/* Basic Info */}
                <TriggerBasicInfo
                  name={formData.name}
                  description={formData.description}
                  agentId={formData.agentId}
                  onNameChange={(name: string) => setFormData({ ...formData, name })}
                  onDescriptionChange={(description: string) =>
                    setFormData({ ...formData, description })
                  }
                  onAgentIdChange={(agentId: string) => setFormData({ ...formData, agentId })}
                  disabled={isSaving}
                />

                {/* Agent Execution Config */}
                <AgentExecutionConfig
                  modelId={formData.modelId}
                  workingDirectory={formData.workingDirectory}
                  onModelIdChange={(modelId) => setFormData({ ...formData, modelId })}
                  onWorkingDirectoryChange={(workingDirectory) =>
                    setFormData({ ...formData, workingDirectory })
                  }
                  disabled={isSaving}
                />

                {/* Input Message */}
                <InputMessageConfig
                  inputMessage={formData.inputMessage}
                  onChange={(inputMessage: string) => setFormData({ ...formData, inputMessage })}
                  disabled={isSaving}
                />
              </div>
            )}

            {/* Trigger Configuration Tab */}
            {activeTab === 'trigger' && (
              <div className="space-y-6 max-w-5xl mx-auto">
                <h2 className="text-lg font-semibold text-gray-900 mb-6">
                  {t('triggers.tabs.trigger')}
                </h2>

                {/* Event Type Selector */}
                <EventTypeSelector
                  selectedType={selectedEventType}
                  onSelect={setSelectedEventType}
                  disabled={isSaving}
                />

                {/* Event Type Configuration */}
                {selectedEventType === 'schedule' && (
                  <ScheduleConfig
                    cronExpression={formData.cronExpression}
                    timezone={formData.timezone}
                    onCronChange={(cronExpression: string) =>
                      setFormData({ ...formData, cronExpression })
                    }
                    onTimezoneChange={(timezone: string) => setFormData({ ...formData, timezone })}
                    disabled={isSaving}
                  />
                )}

                {selectedEventType === 'event' && (
                  <EventSourceSelector
                    value={formData.eventSourceId}
                    onChange={(eventSourceId: string) =>
                      setFormData({ ...formData, eventSourceId })
                    }
                    disabled={isSaving}
                  />
                )}
              </div>
            )}
          </div>
        </SidebarTabsLayout>
      </ModalContent>

      <ModalFooter>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isSaving}
            className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 shadow-sm"
          >
            {t('triggers.form.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 shadow-sm flex items-center gap-2"
          >
            {isSaving && (
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            )}
            {isSaving ? t('triggers.form.saving') : t('triggers.form.save')}
          </button>
        </div>
      </ModalFooter>
    </Modal>
  );
}
