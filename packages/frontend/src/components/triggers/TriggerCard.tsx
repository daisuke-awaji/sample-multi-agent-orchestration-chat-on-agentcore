/**
 * TriggerCard Component
 * Displays individual trigger information with action buttons
 */

import { Clock, Bot, Calendar, Edit, Trash2, History, Loader2, Zap, Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import type { Trigger, ScheduleConfig, EventConfig } from '../../types/trigger';
import { useAgentStore } from '../../stores/agentStore';
import { useTriggerStore } from '../../stores/triggerStore';
import { translateIfKey } from '../../utils/agent-translation';
import { getEventSources } from '../../api/events';

interface TriggerCardProps {
  trigger: Trigger;
  onEdit: (trigger: Trigger) => void;
  onToggle: (triggerId: string, enabled: boolean) => void;
  onViewHistory: (triggerId: string) => void;
  onDelete: (triggerId: string) => void;
}

export function TriggerCard({
  trigger,
  onEdit,
  onToggle,
  onViewHistory,
  onDelete,
}: TriggerCardProps) {
  const { t } = useTranslation();
  const { getAgent } = useAgentStore();
  const togglingIds = useTriggerStore((state) => state.togglingIds);
  const agent = getAgent(trigger.agentId);
  const isEnabled = trigger.enabled;
  const isToggling = togglingIds.has(trigger.id);
  const scheduleConfig = trigger.scheduleConfig as ScheduleConfig;
  const eventConfig = trigger.eventConfig as EventConfig;

  // Fetch event source information for event-type triggers
  const [eventSourceName, setEventSourceName] = useState<string>('');

  useEffect(() => {
    if (trigger.type === 'event' && eventConfig?.eventSourceId) {
      getEventSources()
        .then((sources) => {
          const source = sources.find((s) => s.id === eventConfig.eventSourceId);
          if (source) {
            setEventSourceName(source.name);
          }
        })
        .catch((err) => {
          console.error('Failed to fetch event sources:', err);
        });
    }
  }, [trigger.type, eventConfig?.eventSourceId]);

  // Format last execution time
  const formatLastExecution = (timestamp?: string) => {
    if (!timestamp) return t('triggers.card.notExecuted');
    const date = new Date(timestamp);
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-sm transition-shadow flex flex-col h-full">
      {/* Header with Toggle */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0 pr-4">
          <h3 className="text-lg font-semibold text-gray-900 truncate mb-2">{trigger.name}</h3>
          {trigger.description && (
            <p className="text-sm text-gray-600 line-clamp-2">{trigger.description}</p>
          )}
        </div>

        {/* Toggle Switch */}
        <div className="flex-shrink-0">
          <button
            onClick={() => onToggle(trigger.id, !isEnabled)}
            disabled={isToggling}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed ${
              isEnabled ? 'bg-amber-500 focus:ring-amber-400' : 'bg-gray-200 focus:ring-gray-400'
            }`}
            role="switch"
            aria-checked={isEnabled}
            aria-label={isEnabled ? t('triggers.card.enabled') : t('triggers.card.disabled')}
          >
            {isToggling ? (
              <span className="inline-block w-full flex items-center justify-center">
                <Loader2 className="w-3 h-3 text-white animate-spin" />
              </span>
            ) : (
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            )}
          </button>
        </div>
      </div>

      {/* Trigger Info - Type-specific display */}
      <div className="space-y-2 mb-4 flex-1">
        {trigger.type === 'schedule' ? (
          <>
            {/* Schedule Type */}
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="font-medium">{t('triggers.card.schedule')}:</span>
              <span className="truncate">{scheduleConfig?.expression || 'N/A'}</span>
            </div>

            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="font-medium">{t('triggers.card.timezone')}:</span>
              <span className="truncate">{scheduleConfig?.timezone || 'N/A'}</span>
            </div>
          </>
        ) : (
          <>
            {/* Event Type */}
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Zap className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="font-medium">{t('triggers.card.eventSource')}:</span>
              <span className="truncate">
                {eventSourceName || eventConfig?.eventSourceId || 'N/A'}
              </span>
            </div>

            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Bell className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="font-medium">{t('triggers.card.triggerCondition')}:</span>
              <span className="truncate">{t('triggers.card.onEventReceived')}</span>
            </div>
          </>
        )}

        {/* Common: Agent */}
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <Bot className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="font-medium">{t('triggers.card.agent')}:</span>
          <span className="truncate">
            {agent ? translateIfKey(agent.name, t) : trigger.agentId}
          </span>
        </div>
      </div>

      {/* Last Execution */}
      {trigger.lastExecutedAt && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-600">
            {t('triggers.card.lastExecution')}: {formatLastExecution(trigger.lastExecutedAt)}
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-4 border-t border-gray-100">
        {/* Edit Button */}
        <button
          onClick={() => onEdit(trigger)}
          className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap flex-1 lg:flex-initial"
          aria-label={t('triggers.edit')}
        >
          <Edit className="w-4 h-4 flex-shrink-0" />
          <span className="hidden lg:inline">{t('triggers.edit')}</span>
        </button>

        {/* History Button */}
        <button
          onClick={() => onViewHistory(trigger.id)}
          className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap flex-1 lg:flex-initial"
          aria-label={t('triggers.viewHistory')}
        >
          <History className="w-4 h-4 flex-shrink-0" />
          <span className="hidden lg:inline">{t('triggers.viewHistory')}</span>
        </button>

        {/* Delete Button */}
        <button
          onClick={() => onDelete(trigger.id)}
          className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 bg-white border border-red-300 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap flex-1 lg:flex-initial lg:ml-auto"
          aria-label={t('triggers.delete')}
        >
          <Trash2 className="w-4 h-4 flex-shrink-0" />
          <span className="hidden lg:inline">{t('triggers.delete')}</span>
        </button>
      </div>
    </div>
  );
}
