/**
 * TriggerList Component
 * Displays list of triggers with filtering
 */

import { TriggerCard } from './TriggerCard';
import type { Trigger } from '../../types/trigger';
import { LoadingIndicator } from '../ui/LoadingIndicator';

interface TriggerListProps {
  triggers: Trigger[];
  isLoading: boolean;
  onEdit: (trigger: Trigger) => void;
  onToggle: (triggerId: string, enabled: boolean) => void;
  onViewHistory: (triggerId: string) => void;
  onDelete: (triggerId: string) => void;
}

export function TriggerList({
  triggers,
  isLoading,
  onEdit,
  onToggle,
  onViewHistory,
  onDelete,
}: TriggerListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingIndicator size="lg" />
      </div>
    );
  }

  if (triggers.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 text-lg mb-2">トリガーがありません</p>
        <p className="text-gray-400 text-sm">
          「新規作成」ボタンをクリックして最初のトリガーを作成しましょう
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {triggers.map((trigger) => (
        <TriggerCard
          key={trigger.id}
          trigger={trigger}
          onEdit={onEdit}
          onToggle={onToggle}
          onViewHistory={onViewHistory}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
