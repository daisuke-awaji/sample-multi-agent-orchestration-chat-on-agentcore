/**
 * CronBuilder Component
 *
 * AWS EventBridge Scheduler Cron expression builder with presets and custom fields
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CronPresetButtons } from './CronPresetButtons';
import { CronPreview } from './CronPreview';
import { validateCronExpression, CRON_PRESETS, TIMEZONES } from './cronUtils';

export interface CronBuilderProps {
  value: string;
  timezone: string;
  onChange: (expression: string) => void;
  onTimezoneChange: (timezone: string) => void;
  disabled?: boolean;
}

export function CronBuilder({
  value,
  timezone,
  onChange,
  onTimezoneChange,
  disabled = false,
}: CronBuilderProps) {
  const { t } = useTranslation();

  // Check if current value is a preset
  const isPreset = CRON_PRESETS.some((preset) => preset.expression === value);
  const [isCustom, setIsCustom] = useState(!isPreset);

  // Handle preset selection
  const handlePresetSelect = (presetExpression: string) => {
    setIsCustom(false);
    onChange(presetExpression);
  };

  // Handle custom mode toggle
  const handleCustomToggle = () => {
    setIsCustom(true);
  };

  // Handle custom expression input
  const handleCustomInput = (expression: string) => {
    onChange(expression);
  };

  const isValid = validateCronExpression(value);

  return (
    <div className="space-y-6">
      {/* Timezone Selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t('triggers.cron.timezone')}
        </label>
        <select
          value={timezone}
          onChange={(e) => onTimezoneChange(e.target.value)}
          disabled={disabled}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz.value} value={tz.value}>
              {tz.label}
            </option>
          ))}
        </select>
      </div>

      {/* Preset Buttons */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t('triggers.cron.preset')}
        </label>
        <CronPresetButtons
          selectedExpression={value}
          onSelect={handlePresetSelect}
          onCustom={handleCustomToggle}
          isCustom={isCustom}
          disabled={disabled}
        />
      </div>

      {/* Custom Expression Input (shown when custom mode is active) */}
      <div
        className={`transition-all duration-200 ${
          isCustom ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'
        }`}
      >
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t('triggers.cron.customExpression')}
        </label>
        <input
          type="text"
          value={value}
          onChange={(e) => handleCustomInput(e.target.value)}
          disabled={disabled || !isCustom}
          placeholder="0 0 * * ? *"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed font-mono text-sm"
        />
        <p className="mt-1 text-xs text-gray-500">{t('triggers.cron.customExpressionHint')}</p>
      </div>

      {/* Preview */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t('triggers.cron.preview')}
        </label>
        <CronPreview expression={value} timezone={timezone} isValid={isValid} />
      </div>

      {/* Validation Error */}
      {!isValid && (
        <div className="text-sm text-red-600">{t('triggers.cron.invalidExpression')}</div>
      )}
    </div>
  );
}
