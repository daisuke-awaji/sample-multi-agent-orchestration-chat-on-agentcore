/**
 * ExecutionItem Component
 *
 * Display individual execution record with expandable details
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, XCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import type { ExecutionRecord } from '../../../types/trigger';

export interface ExecutionItemProps {
  execution: ExecutionRecord;
}

export function ExecutionItem({ execution }: ExecutionItemProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  // Format duration
  const formatDuration = (ms?: number): string => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  // Format date
  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Status icon and color
  const getStatusDisplay = (status: ExecutionRecord['status']) => {
    switch (status) {
      case 'success':
        return {
          icon: <CheckCircle className="w-5 h-5 text-green-600" />,
          bgColor: 'bg-feedback-success-bg',
          borderColor: 'border-feedback-success-border',
          textColor: 'text-green-700',
          label: t('triggers.history.success'),
        };
      case 'failure':
        return {
          icon: <XCircle className="w-5 h-5 text-feedback-error" />,
          bgColor: 'bg-feedback-error-bg',
          borderColor: 'border-feedback-error-border',
          textColor: 'text-feedback-error',
          label: t('triggers.history.failure'),
        };
      case 'in_progress':
        return {
          icon: <Clock className="w-5 h-5 text-action-primary animate-spin" />,
          bgColor: 'bg-feedback-info-bg',
          borderColor: 'border-feedback-info-border',
          textColor: 'text-action-primary',
          label: t('triggers.history.inProgress'),
        };
      default:
        return {
          icon: <Clock className="w-5 h-5 text-fg-secondary" />,
          bgColor: 'bg-surface-secondary',
          borderColor: 'border-border',
          textColor: 'text-fg-secondary',
          label: status || 'Unknown',
        };
    }
  };

  const statusDisplay = getStatusDisplay(execution.status);

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-colors ${statusDisplay.borderColor} ${statusDisplay.bgColor}`}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-opacity-80 transition-colors"
      >
        <div className="flex items-center gap-3">
          {statusDisplay.icon}
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${statusDisplay.textColor}`}>
                {statusDisplay.label}
              </span>
              <span className="text-xs text-fg-muted">{formatDuration(execution.duration)}</span>
            </div>
            <p className="text-xs text-fg-secondary mt-1">
              {t('triggers.history.executedAt')}: {formatDate(execution.startTime)}
            </p>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-fg-disabled" />
        ) : (
          <ChevronDown className="w-5 h-5 text-fg-disabled" />
        )}
      </button>

      {/* Details (expandable) */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3 border-t bg-white">
          {/* Input */}
          {execution.input && (
            <div>
              <p className="text-xs font-medium text-fg-secondary mb-1">
                {t('triggers.history.input')}
              </p>
              <div className="p-3 bg-surface-secondary rounded-md">
                <pre className="text-xs text-fg-default whitespace-pre-wrap font-mono">
                  {execution.input}
                </pre>
              </div>
            </div>
          )}

          {/* Output (for success) */}
          {execution.status === 'success' && execution.output && (
            <div>
              <p className="text-xs font-medium text-fg-secondary mb-1">
                {t('triggers.history.output')}
              </p>
              <div className="p-3 bg-surface-secondary rounded-md max-h-60 overflow-y-auto">
                <pre className="text-xs text-fg-default whitespace-pre-wrap font-mono">
                  {execution.output}
                </pre>
              </div>
            </div>
          )}

          {/* Error (for failure) */}
          {execution.status === 'failure' && execution.error && (
            <div>
              <p className="text-xs font-medium text-feedback-error mb-1">
                {t('triggers.history.error')}
              </p>
              <div className="p-3 bg-feedback-error-bg rounded-md">
                <pre className="text-xs text-feedback-error whitespace-pre-wrap font-mono">
                  {execution.error}
                </pre>
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="pt-2 border-t">
            <div className="grid grid-cols-2 gap-2 text-xs text-fg-secondary">
              <div>
                <span className="font-medium">{t('triggers.history.executionId')}:</span>
                <br />
                <span className="font-mono text-[10px]">{execution.executionId}</span>
              </div>
              {execution.endTime && (
                <div>
                  <span className="font-medium">{t('triggers.history.duration')}:</span>
                  <br />
                  <span>{formatDuration(execution.duration)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
