/**
 * TriggerList Component
 * Displays list of triggers with filtering
 */

import { CalendarRange } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();

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
        <CalendarRange className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500 text-lg mb-2">{t('triggers.empty.title')}</p>
        <p className="text-gray-400 text-sm">{t('triggers.empty.description')}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-2 gap-4">
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
