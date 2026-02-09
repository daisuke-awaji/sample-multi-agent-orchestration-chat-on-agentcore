import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ToolUse } from '../types/index';

interface ToolUseBlockProps {
  toolUse: ToolUse;
}

export const ToolUseBlock: React.FC<ToolUseBlockProps> = ({ toolUse }) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  // ステータスに基づくスタイル（白背景統一、アイコンのみ変更）
  const getStatusStyles = () => {
    switch (toolUse.status) {
      case 'pending':
        return {
          statusColor: 'text-fg-muted',
          icon: (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          ),
        };
      case 'running':
        return {
          statusColor: 'text-action-primary',
          icon: (
            <svg
              className="w-3 h-3 animate-spin"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          ),
        };
      case 'completed':
        return {
          statusColor: 'text-green-600',
          icon: (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          ),
        };
      case 'error':
        return {
          statusColor: 'text-feedback-error',
          icon: (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          ),
        };
      default:
        return {
          statusColor: 'text-fg-muted',
          icon: (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          ),
        };
    }
  };

  const statusStyles = getStatusStyles();
  const inputString = JSON.stringify(toolUse.input, null, 2);

  return (
    <div className="tool-use-block w-full">
      {/* 白背景・グレー枠線のメインコンテナ */}
      <div className="bg-white border border-border-strong rounded-lg text-sm hover:shadow-sm transition-shadow">
        {/* ヘッダー部分（全体クリック可能） */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 px-3 py-1.5 w-full text-left hover:bg-surface-secondary transition-colors"
          aria-label={isExpanded ? '入力を隠す' : '入力を表示'}
        >
          {/* アイコンとステータス */}
          <div className={`flex items-center ${statusStyles.statusColor}`}>{statusStyles.icon}</div>

          {/* ツール名 */}
          <span className="font-medium text-fg-default">{toolUse.name}</span>

          {/* ステータス */}
          <span className={`text-xs ${statusStyles.statusColor} capitalize`}>{toolUse.status}</span>

          {/* 展開ボタン */}
          <div className="text-fg-disabled ml-auto">
            <svg
              className={`w-3 h-3 transform transition-transform duration-200 ${
                isExpanded ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </button>

        {/* 入力内容（展開時、枠内に統合） */}
        {isExpanded && (
          <div className="px-3 pb-3 pt-1 border-t border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-fg-muted text-xs font-medium">
                {t('common.inputParameters')}
              </span>
              <button
                onClick={() => navigator.clipboard.writeText(inputString)}
                className="text-fg-disabled hover:text-fg-secondary text-xs px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                title={t('common.copyToClipboard')}
              >
                {t('common.copy')}
              </button>
            </div>
            <pre className="text-fg-default text-xs font-mono overflow-x-auto whitespace-pre-wrap break-words bg-surface-secondary p-2 rounded border border-border">
              {inputString}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
