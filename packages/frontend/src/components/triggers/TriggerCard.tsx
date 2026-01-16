/**
 * TriggerCard Component
 * Displays individual trigger information with action buttons
 */

import { Clock, Bot, Calendar, CheckCircle, XCircle, Edit, Trash2, History } from 'lucide-react';
import type { Trigger, ScheduleConfig } from '../../types/trigger';
import { useAgentStore } from '../../stores/agentStore';

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
  const { getAgent } = useAgentStore();
  const agent = getAgent(trigger.agentId);
  const isEnabled = trigger.enabled;
  const config = trigger.scheduleConfig as ScheduleConfig;

  // Format last execution time
  const formatLastExecution = (timestamp?: string) => {
    if (!timestamp) return '未実行';
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
    <div className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-sm transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-semibold text-gray-900">{trigger.name}</h3>
            {isEnabled ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                <CheckCircle className="w-3.5 h-3.5" />
                有効
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
                <XCircle className="w-3.5 h-3.5" />
                無効
              </span>
            )}
          </div>
          {trigger.description && <p className="text-sm text-gray-600">{trigger.description}</p>}
        </div>
      </div>

      {/* Schedule Info */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <Clock className="w-4 h-4 text-gray-400" />
          <span className="font-medium">スケジュール:</span>
          <span>{config?.expression || 'N/A'}</span>
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-700">
          <Calendar className="w-4 h-4 text-gray-400" />
          <span className="font-medium">タイムゾーン:</span>
          <span>{config?.timezone || 'N/A'}</span>
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-700">
          <Bot className="w-4 h-4 text-gray-400" />
          <span className="font-medium">エージェント:</span>
          <span>{agent?.name || trigger.agentId}</span>
        </div>
      </div>

      {/* Last Execution */}
      {trigger.lastExecutedAt && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-600">
            最終実行: {formatLastExecution(trigger.lastExecutedAt)}
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-4 border-t border-gray-100">
        <button
          onClick={() => onEdit(trigger)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Edit className="w-4 h-4" />
          編集
        </button>

        <button
          onClick={() => onViewHistory(trigger.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <History className="w-4 h-4" />
          履歴
        </button>

        <button
          onClick={() => onToggle(trigger.id, !isEnabled)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
            isEnabled
              ? 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
              : 'text-white bg-green-600 hover:bg-green-700'
          }`}
        >
          {isEnabled ? '無効化' : '有効化'}
        </button>

        <button
          onClick={() => onDelete(trigger.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 bg-white border border-red-300 rounded-lg hover:bg-red-50 transition-colors ml-auto"
        >
          <Trash2 className="w-4 h-4" />
          削除
        </button>
      </div>
    </div>
  );
}
