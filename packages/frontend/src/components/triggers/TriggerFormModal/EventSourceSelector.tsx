/**
 * EventSourceSelector Component
 *
 * Card-based selector for event-driven trigger sources (S3, GitHub, etc.)
 * Includes expandable details section showing EventBridge rule configuration.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getEventSources } from '../../../api/events';
import type { EventSource } from '../../../api/events';
import toast from 'react-hot-toast';

export interface EventSourceSelectorProps {
  value: string | undefined;
  onChange: (eventSourceId: string) => void;
  disabled?: boolean;
}

/**
 * Convert kebab-case to PascalCase for lucide-react icon names
 * Example: 'cloud-upload' -> 'CloudUpload'
 */
function toPascalCase(str: string): string {
  return str
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * Get lucide-react icon component from icon name
 * @param iconName Icon name in kebab-case (e.g., 'cloud-upload')
 * @returns Lucide icon component
 */
function getIconComponent(iconName?: string): LucideIcon {
  if (!iconName) {
    return LucideIcons.Cloud; // Default icon
  }

  const pascalName = toPascalCase(iconName) as keyof typeof LucideIcons;
  const IconComponent = LucideIcons[pascalName];

  // lucide-react icons are wrapped with React.forwardRef, so typeof returns 'object'
  // Check if it's a valid React component (function or object with $$typeof)
  const isValidComponent =
    IconComponent &&
    (typeof IconComponent === 'function' ||
      (typeof IconComponent === 'object' && '$$typeof' in IconComponent));

  return (isValidComponent ? IconComponent : LucideIcons.Cloud) as LucideIcon;
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
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set());

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

  // Loading state
  if (loading) {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          {t('triggers.eventSource.label')}
        </label>
        <div className="flex items-center justify-center p-8 bg-gray-50 rounded-lg border border-gray-200">
          <LucideIcons.Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          <span className="ml-2 text-sm text-gray-500">{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  // Error state
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

  // Empty state
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

  /**
   * Toggle details expansion for a specific event source
   */
  const toggleDetails = (sourceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedDetails((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) {
        next.delete(sourceId);
      } else {
        next.add(sourceId);
      }
      return next;
    });
  };

  /**
   * Render event pattern details section
   */
  const renderEventPatternDetails = (source: EventSource) => {
    if (!source.eventPattern) return null;

    const isExpanded = expandedDetails.has(source.id);

    return (
      <div>
        <button
          type="button"
          onClick={(e) => toggleDetails(source.id, e)}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors w-full"
        >
          <LucideIcons.ChevronRight
            className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          />
          <span>{t('triggers.eventSource.ruleDetails')}</span>
        </button>

        {isExpanded && (
          <pre className="mt-2 p-3 bg-gray-50 rounded text-xs font-mono text-gray-700 overflow-x-auto animate-subtle-fade-in">
            {JSON.stringify(source.eventPattern, null, 2)}
          </pre>
        )}
      </div>
    );
  };

  // Grid card selector
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">
        {t('triggers.eventSource.label')}
      </label>

      <div className="grid grid-cols-2 gap-3">
        {eventSources.map((source) => {
          const Icon = getIconComponent(source.icon);
          const isSelected = value === source.id;
          const hasEventPattern = !!source.eventPattern;

          return (
            <div
              key={source.id}
              className={`
                rounded-lg border transition-all
                ${
                  isSelected
                    ? 'border-blue-300 bg-white ring-1 ring-blue-100'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }
                ${disabled ? 'opacity-50' : ''}
              `}
            >
              {/* Main card content - clickable */}
              <button
                type="button"
                onClick={() => !disabled && onChange(source.id)}
                disabled={disabled}
                className={`
                  p-4 w-full text-left
                  ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div
                    className={`
                      flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center
                      ${isSelected ? 'bg-blue-600' : 'bg-gray-100'}
                    `}
                  >
                    <Icon className={`w-5 h-5 ${isSelected ? 'text-white' : 'text-gray-600'}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">{source.name}</p>
                      {isSelected && <LucideIcons.Check className="w-4 h-4 text-blue-600" />}
                    </div>
                    <p className="text-xs text-gray-600 mt-1">{source.description}</p>
                  </div>
                </div>
              </button>

              {/* Event pattern details - expandable section */}
              {hasEventPattern && (
                <div className="px-4 pb-4">{renderEventPatternDetails(source)}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Help text */}
      <p className="text-xs text-gray-500">{t('triggers.eventSource.helpText')}</p>
    </div>
  );
}
