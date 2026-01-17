/**
 * EventSourceSelector Component
 *
 * Selector for event-driven trigger sources (S3, GitHub, etc.)
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cloud, Loader2 } from 'lucide-react';
import { getEventSources } from '../../../api/events';
import type { EventSource } from '../../../api/events';
import toast from 'react-hot-toast';

export interface EventSourceSelectorProps {
  value: string | undefined;
  onChange: (eventSourceId: string) => void;
  disabled?: boolean;
}

export function EventSourceSelector({
  value,
  onChange,
  disabled = false,
}: EventSourceSelectorProps) {
  const { t } = useTranslation();
  const [eventSources, setEventSources] = useState<EventSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEventSources = async () => {
      try {
        setLoading(true);
        setError(null);
        const sources = await getEventSources();
        setEventSources(sources);
      } catch (err) {
        console.error('Failed to fetch event sources:', err);
        setError(err instanceof Error ? err.message : 'Failed to load event sources');
        toast.error(t('triggers.eventSource.loadError'));
      } finally {
        setLoading(false);
      }
    };

    fetchEventSources();
  }, [t]);

  if (loading) {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          {t('triggers.eventSource.label')}
        </label>
        <div className="flex items-center justify-center p-8 bg-gray-50 rounded-lg border border-gray-200">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          <span className="ml-2 text-sm text-gray-500">{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          {t('triggers.eventSource.label')}
        </label>
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      </div>
    );
  }

  if (eventSources.length === 0) {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          {t('triggers.eventSource.label')}
        </label>
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <p className="text-sm text-gray-600">{t('triggers.eventSource.noSourcesAvailable')}</p>
        </div>
      </div>
    );
  }

  const selectedSource = eventSources.find((s) => s.id === value);

  return (
    <div className="space-y-2">
      <label htmlFor="eventSource" className="block text-sm font-medium text-gray-700">
        {t('triggers.eventSource.label')}
      </label>
      <select
        id="eventSource"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
      >
        <option value="">{t('triggers.eventSource.selectPlaceholder')}</option>
        {eventSources.map((source) => (
          <option key={source.id} value={source.id}>
            {source.name}
          </option>
        ))}
      </select>

      {/* Description for selected source */}
      {selectedSource && (
        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <Cloud className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-blue-900">{selectedSource.name}</p>
            <p className="text-xs text-blue-700 mt-0.5">{selectedSource.description}</p>
          </div>
        </div>
      )}

      {/* Help text */}
      <p className="text-xs text-gray-500">{t('triggers.eventSource.helpText')}</p>
    </div>
  );
}
