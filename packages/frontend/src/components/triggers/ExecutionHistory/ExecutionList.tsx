/**
 * ExecutionList Component
 *
 * Table list of execution records
 */

import { useTranslation } from 'react-i18next';
import { CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import { LoadingIndicator } from '../../ui/LoadingIndicator';
import type { ExecutionRecord } from '../../../types/trigger';

export interface ExecutionListProps {
  executions: ExecutionRecord[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

export function ExecutionList({ executions, isLoading, hasMore, onLoadMore }: ExecutionListProps) {
  const { t, i18n } = useTranslation();

  // Format duration
  const formatDuration = (ms?: number): string => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  // Format date with i18n locale
  const formatDate = (dateStr: string): string => {
    const locale = i18n.language === 'ja' ? 'ja-JP' : 'en-US';
    return new Date(dateStr).toLocaleString(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Status icon and label
  const getStatusDisplay = (status: ExecutionRecord['status']) => {
    switch (status) {
      case 'success':
        return {
          icon: <CheckCircle className="w-5 h-5 text-green-600" />,
          label: t('triggers.history.success'),
          textColor: 'text-green-700',
        };
      case 'failure':
        return {
          icon: <XCircle className="w-5 h-5 text-red-600" />,
          label: t('triggers.history.failure'),
          textColor: 'text-red-700',
        };
      case 'in_progress':
        return {
          icon: <Clock className="w-5 h-5 text-blue-600 animate-spin" />,
          label: t('triggers.history.inProgress'),
          textColor: 'text-blue-700',
        };
      default:
        return {
          icon: <Clock className="w-5 h-5 text-gray-600" />,
          label: status || 'Unknown',
          textColor: 'text-gray-700',
        };
    }
  };

  if (isLoading && executions.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingIndicator />
      </div>
    );
  }

  if (executions.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">{t('triggers.history.noHistory')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Executions Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('triggers.history.status')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('triggers.history.startedAt')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('triggers.history.completedAt')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('triggers.history.duration')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('triggers.history.executionId')}
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {executions.map((execution) => {
              const statusDisplay = getStatusDisplay(execution.status);
              const duration =
                execution.endTime && execution.startTime
                  ? new Date(execution.endTime).getTime() - new Date(execution.startTime).getTime()
                  : execution.duration;

              return (
                <tr key={execution.executionId} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {statusDisplay.icon}
                      <span className={`text-sm font-medium ${statusDisplay.textColor}`}>
                        {statusDisplay.label}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{formatDate(execution.startTime)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">
                      {execution.endTime ? formatDate(execution.endTime) : '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{formatDuration(duration)}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs text-gray-500 font-mono truncate max-w-xs">
                      {execution.executionId}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Load More Button */}
      {hasMore && (
        <div className="flex justify-center pt-4">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoading}
            className="flex items-center gap-2 px-6 py-3 bg-gray-500 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('common.loading')}
              </>
            ) : (
              <>
                {t('triggers.history.loadMore')}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
