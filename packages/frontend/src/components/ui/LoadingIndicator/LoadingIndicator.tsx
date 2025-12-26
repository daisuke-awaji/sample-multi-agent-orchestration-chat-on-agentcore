/**
 * 汎用ローディングインジケータコンポーネント
 * アプリケーション全体で一貫したローディング表示を提供
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

export interface LoadingIndicatorProps {
  /** ローディングメッセージ */
  message?: string;
  /** スピナーサイズ */
  size?: 'sm' | 'md' | 'lg';
  /** 中央配置するか */
  center?: boolean;
  /** 外側の余白 */
  spacing?: 'none' | 'sm' | 'md' | 'lg';
  /** テキスト色のカスタマイズ */
  textColor?: string;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  message,
  size = 'md',
  center = true,
  spacing = 'md',
  textColor = 'text-gray-500',
}) => {
  const { t } = useTranslation();
  const displayMessage = message ?? t('common.loading');
  // スピナーサイズの定義
  const spinnerSizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-6 h-6',
  };

  // 外側余白の定義
  const spacingClasses = {
    none: '',
    sm: 'py-2',
    md: 'py-4',
    lg: 'py-8',
  };

  const containerClasses = [center ? 'text-center' : '', spacingClasses[spacing]]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={containerClasses}>
      <div className={`inline-flex items-center gap-2 text-sm ${textColor}`}>
        <div
          className={`${spinnerSizeClasses[size]} border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin`}
        />
        {displayMessage}
      </div>
    </div>
  );
};
