/**
 * CronPreview Component
 *
 * Preview cron expression with human-readable description and next execution times
 */

import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';
import { getCronDescription, getNextExecutions, formatExecutionTime } from './cronUtils';

export interface CronPreviewProps {
  /**
   * Cron expression to preview
   */
  expression: string;

  /**
   * Timezone for execution times
   */
  timezone: string;

  /**
   * Whether the expression is valid
   */
  isValid: boolean;
}

export function CronPreview({ expression, timezone, isValid }: CronPreviewProps) {
  const { t, i18n } = useTranslation();

  if (!isValid) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-sm text-red-600">{t('triggers.cron.invalidExpression')}</p>
      </div>
    );
  }

  const description = getCronDescription(expression, t);
  const nextExecutions = getNextExecutions(expression, timezone, 3);

  return (
    <div className="space-y-4">
      {/* Human-readable description */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm font-medium text-blue-900">{description}</p>
        <p className="text-xs text-blue-700 mt-1 font-mono">{expression}</p>
      </div>

      {/* Next execution times */}
      {nextExecutions.length > 0 && (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-gray-600" />
            <p className="text-sm font-medium text-gray-700">{t('triggers.cron.nextExecutions')}</p>
          </div>
          <div className="space-y-2">
            {nextExecutions.map((date, index) => (
              <div key={index} className="flex items-center gap-2 text-sm text-gray-600 pl-6">
                <span className="text-gray-400">{index + 1}.</span>
                <span className="font-mono">{formatExecutionTime(date, i18n.language)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
