/**
 * Cron Builder Utility Functions
 *
 * AWS EventBridge Scheduler Cron format (6 fields):
 * minute hour day-of-month month day-of-week year
 *
 * Example: 0 9 * * MON-FRI * (Every weekday at 9:00 AM)
 */

import type { TFunction } from 'i18next';

export interface CronFields {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
  year: string;
}

export interface CronPreset {
  id: string;
  label: string;
  expression: string;
}

/**
 * Predefined cron presets
 */
export const CRON_PRESETS: CronPreset[] = [
  {
    id: 'everyMinute',
    label: 'triggers.cron.presetEveryMinute',
    expression: '* * * * ? *',
  },
  {
    id: 'everyHour',
    label: 'triggers.cron.presetEveryHour',
    expression: '0 * * * ? *',
  },
  {
    id: 'everyDay',
    label: 'triggers.cron.presetEveryDay',
    expression: '0 0 * * ? *',
  },
  {
    id: 'everyWeekday',
    label: 'triggers.cron.presetEveryWeekday',
    expression: '0 0 ? * MON-FRI *',
  },
  {
    id: 'everyMonday',
    label: 'triggers.cron.presetEveryMonday',
    expression: '0 0 ? * MON *',
  },
  {
    id: 'everyMonth',
    label: 'triggers.cron.presetEveryMonth',
    expression: '0 0 1 * ? *',
  },
];

/**
 * Parse cron expression into fields
 */
export function parseCronExpression(expression: string): CronFields | null {
  const parts = expression.trim().split(/\s+/);

  if (parts.length !== 6) {
    return null;
  }

  return {
    minute: parts[0],
    hour: parts[1],
    dayOfMonth: parts[2],
    month: parts[3],
    dayOfWeek: parts[4],
    year: parts[5],
  };
}

/**
 * Build cron expression from fields
 */
export function buildCronExpression(fields: CronFields): string {
  return `${fields.minute} ${fields.hour} ${fields.dayOfMonth} ${fields.month} ${fields.dayOfWeek} ${fields.year}`;
}

/**
 * Validate cron expression
 */
export function validateCronExpression(expression: string): boolean {
  const fields = parseCronExpression(expression);
  if (!fields) return false;

  // Basic validation - check that either dayOfMonth or dayOfWeek has '?'
  const hasDayOfMonth = fields.dayOfMonth !== '?';
  const hasDayOfWeek = fields.dayOfWeek !== '?';

  // Exactly one of dayOfMonth or dayOfWeek must be '?'
  if (hasDayOfMonth === hasDayOfWeek) {
    return false;
  }

  return true;
}

/**
 * Get translated day name
 */
function getDayName(day: string, t: TFunction): string {
  const key = `triggers.cronDescription.days.${day}`;
  const translated = t(key);
  return translated !== key ? translated : day;
}

/**
 * Generate human-readable description of cron expression
 */
export function getCronDescription(expression: string, t: TFunction): string {
  const fields = parseCronExpression(expression);
  if (!fields) {
    return t('triggers.cron.invalidExpression');
  }

  const parts: string[] = [];

  // Handle presets first
  const preset = CRON_PRESETS.find((p) => p.expression === expression);
  if (preset) {
    return t(preset.label);
  }

  // Minute
  if (fields.minute === '*') {
    parts.push(t('triggers.cron.presetEveryMinute'));
  } else if (fields.minute === '0') {
    // Handle in hour section
  } else {
    parts.push(t('triggers.cronDescription.minute', { value: fields.minute }));
  }

  // Hour
  if (fields.hour === '*') {
    if (fields.minute === '0') {
      parts.push(t('triggers.cron.presetEveryHour'));
    }
  } else if (fields.hour !== '*') {
    parts.push(`${fields.hour}:${fields.minute.padStart(2, '0')}`);
  }

  // Day of month
  if (fields.dayOfMonth !== '?' && fields.dayOfMonth !== '*') {
    parts.push(t('triggers.cronDescription.day', { value: fields.dayOfMonth }));
  }

  // Day of week
  if (fields.dayOfWeek !== '?' && fields.dayOfWeek !== '*') {
    if (fields.dayOfWeek.includes('-')) {
      const [start, end] = fields.dayOfWeek.split('-');
      parts.push(
        t('triggers.cronDescription.dayRange', {
          start: getDayName(start, t),
          end: getDayName(end, t),
        })
      );
    } else if (fields.dayOfWeek.includes(',')) {
      const separator = t('triggers.cronDescription.dayList');
      const days = fields.dayOfWeek
        .split(',')
        .map((d) => getDayName(d, t))
        .join(separator);
      parts.push(days);
    } else {
      parts.push(getDayName(fields.dayOfWeek, t));
    }
  }

  // Month
  if (fields.month !== '*') {
    parts.push(t('triggers.cronDescription.month', { value: fields.month }));
  }

  return parts.join(' ') || expression;
}

/**
 * Calculate next execution times for a cron expression
 */
export function getNextExecutions(
  expression: string,
  _timezone: string,
  count: number = 3
): Date[] {
  const fields = parseCronExpression(expression);
  if (!fields || !validateCronExpression(expression)) {
    return [];
  }

  const executions: Date[] = [];
  let current = new Date();

  // Simple implementation - in production, use a proper cron parser like cron-parser
  // This is a basic approximation for common cases
  // Note: timezone parameter is not used in this simplified version

  for (let i = 0; i < count && executions.length < count; i++) {
    const next = calculateNextExecution(current, fields);
    if (next) {
      executions.push(next);
      current = new Date(next.getTime() + 60000); // Add 1 minute
    } else {
      break;
    }
  }

  return executions;
}

/**
 * Calculate next execution time (simplified)
 */
function calculateNextExecution(from: Date, fields: CronFields): Date | null {
  // This is a simplified implementation
  // In production, use a library like cron-parser or cronitor-cron

  const next = new Date(from);

  // Handle minute
  if (fields.minute === '*') {
    next.setMinutes(next.getMinutes() + 1);
  } else if (fields.minute !== '*') {
    const targetMinute = parseInt(fields.minute, 10);
    if (next.getMinutes() >= targetMinute) {
      next.setHours(next.getHours() + 1);
    }
    next.setMinutes(targetMinute);
  }
  next.setSeconds(0);
  next.setMilliseconds(0);

  // Handle hour
  if (fields.hour !== '*') {
    const targetHour = parseInt(fields.hour, 10);
    if (next.getHours() > targetHour || (next.getHours() === targetHour && next.getMinutes() > 0)) {
      next.setDate(next.getDate() + 1);
    }
    next.setHours(targetHour);
  }

  // Handle day of week (simplified)
  if (fields.dayOfWeek !== '?' && fields.dayOfWeek !== '*') {
    const dayMap: Record<string, number> = {
      SUN: 0,
      MON: 1,
      TUE: 2,
      WED: 3,
      THU: 4,
      FRI: 5,
      SAT: 6,
    };

    if (fields.dayOfWeek.includes('-')) {
      // Range like MON-FRI
      const [start, end] = fields.dayOfWeek.split('-');
      const startDay = dayMap[start];
      const endDay = dayMap[end];
      const currentDay = next.getDay();

      if (currentDay < startDay || currentDay > endDay) {
        // Move to next start day
        const daysToAdd = (startDay - currentDay + 7) % 7 || 7;
        next.setDate(next.getDate() + daysToAdd);
      }
    } else {
      // Specific day like MON
      const targetDay = dayMap[fields.dayOfWeek];
      const currentDay = next.getDay();
      if (currentDay !== targetDay) {
        const daysToAdd = (targetDay - currentDay + 7) % 7 || 7;
        next.setDate(next.getDate() + daysToAdd);
      }
    }
  }

  // Handle day of month
  if (fields.dayOfMonth !== '?' && fields.dayOfMonth !== '*') {
    const targetDay = parseInt(fields.dayOfMonth, 10);
    if (next.getDate() > targetDay) {
      next.setMonth(next.getMonth() + 1);
    }
    next.setDate(targetDay);
  }

  return next;
}

/**
 * Format date for display with locale support
 */
export function formatExecutionTime(date: Date, locale?: string): string {
  const displayLocale = locale || 'en-US';
  return date.toLocaleString(displayLocale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  });
}

/**
 * Available timezones (subset for common usage)
 */
export const TIMEZONES = [
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST)' },
  { value: 'America/New_York', label: 'America/New_York (EST)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST)' },
  { value: 'Europe/London', label: 'Europe/London (GMT)' },
  { value: 'UTC', label: 'UTC' },
];

/**
 * Day of week option keys for i18n
 */
export const DAY_OF_WEEK_OPTION_KEYS = [
  { value: 'MON', labelKey: 'MON' },
  { value: 'TUE', labelKey: 'TUE' },
  { value: 'WED', labelKey: 'WED' },
  { value: 'THU', labelKey: 'THU' },
  { value: 'FRI', labelKey: 'FRI' },
  { value: 'SAT', labelKey: 'SAT' },
  { value: 'SUN', labelKey: 'SUN' },
];

/**
 * Get day of week options with translated labels
 */
export function getDayOfWeekOptions(t: TFunction): Array<{ value: string; label: string }> {
  return DAY_OF_WEEK_OPTION_KEYS.map(({ value, labelKey }) => ({
    value,
    label: t(`triggers.cronDescription.days.${labelKey}`),
  }));
}

/**
 * Month option keys for i18n
 */
export const MONTH_OPTION_KEYS = [
  { value: '1', labelKey: '1' },
  { value: '2', labelKey: '2' },
  { value: '3', labelKey: '3' },
  { value: '4', labelKey: '4' },
  { value: '5', labelKey: '5' },
  { value: '6', labelKey: '6' },
  { value: '7', labelKey: '7' },
  { value: '8', labelKey: '8' },
  { value: '9', labelKey: '9' },
  { value: '10', labelKey: '10' },
  { value: '11', labelKey: '11' },
  { value: '12', labelKey: '12' },
];

/**
 * Get month options with translated labels
 */
export function getMonthOptions(t: TFunction): Array<{ value: string; label: string }> {
  return MONTH_OPTION_KEYS.map(({ value, labelKey }) => ({
    value,
    label: t(`triggers.cronDescription.months.${labelKey}`),
  }));
}

// Legacy exports for backward compatibility
export const DAY_OF_WEEK_OPTIONS = DAY_OF_WEEK_OPTION_KEYS.map(({ value }) => ({
  value,
  label: value, // Will be translated at usage
}));

export const MONTH_OPTIONS = MONTH_OPTION_KEYS.map(({ value }) => ({
  value,
  label: value, // Will be translated at usage
}));
