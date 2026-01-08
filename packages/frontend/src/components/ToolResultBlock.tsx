import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ToolResult } from '../types/index';

interface ToolResultBlockProps {
  toolResult: ToolResult;
}

export const ToolResultBlock: React.FC<ToolResultBlockProps> = ({ toolResult }) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  // Style based on error state (unified white background, change icon only)
  const getResultStyles = () => {
    if (toolResult.isError) {
      return {
        statusColor: 'text-red-600',
        label: t('tool.errorResult'),
        icon: (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"
            />
          </svg>
        ),
      };
    }
    return {
      statusColor: 'text-blue-600',
      label: t('tool.executionResult'),
      icon: (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
    };
  };

  const resultStyles = getResultStyles();

  // Format result content
  const formattedContent = (() => {
    try {
      // Check if JSON
      const parsed = JSON.parse(toolResult.content);
      return {
        isJson: true,
        content: JSON.stringify(parsed, null, 2),
      };
    } catch {
      return {
        isJson: false,
        content: toolResult.content,
      };
    }
  })();

  return (
    <div className="tool-result-block my-1 w-full">
      {/* 白背景・グレー枠線のメインコンテナ */}
      <div className="bg-white border border-gray-300 rounded-lg text-sm hover:shadow-sm transition-shadow">
        {/* ヘッダー部分（全体クリック可能） */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 px-3 py-1.5 w-full text-left hover:bg-gray-50 transition-colors"
          aria-label={isExpanded ? '結果を隠す' : '結果を表示'}
        >
          {/* アイコンとステータス */}
          <div className={`flex items-center ${resultStyles.statusColor}`}>{resultStyles.icon}</div>

          {/* ラベル（シンプル化） */}
          <span className="font-medium text-gray-900 text-xs">{resultStyles.label}</span>

          {/* 展開ボタン */}
          <div className="text-gray-400 ml-auto">
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

        {/* 詳細コンテンツ（展開時、枠内に統合） */}
        {isExpanded && (
          <div className="px-3 pb-3 pt-1 border-t border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-500 text-xs font-medium">
                {formattedContent.isJson ? t('tool.jsonResponse') : t('tool.textResult')}
              </span>
              <button
                onClick={() => navigator.clipboard.writeText(toolResult.content)}
                className="text-gray-400 hover:text-gray-600 text-xs px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                title={t('common.copyToClipboard')}
              >
                {t('common.copy')}
              </button>
            </div>

            {/* スクロール可能な結果表示 */}
            <div className="max-h-64 overflow-y-auto">
              <pre
                className={`
                  text-gray-800 text-xs overflow-x-auto whitespace-pre-wrap break-words
                  bg-gray-50 p-2 rounded border border-gray-200
                  ${formattedContent.isJson ? 'font-mono' : 'font-sans'}
                `}
              >
                {formattedContent.content}
              </pre>
            </div>

            {/* 統計情報 */}
            {formattedContent.content.length > 500 && (
              <div className="mt-2 pt-2 border-t border-gray-200">
                <p className="text-gray-400 text-xs">
                  {t('common.charactersWithStatus', {
                    count: formattedContent.content.length,
                    status: toolResult.isError ? t('common.errorStatus') : t('common.success'),
                  })}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
