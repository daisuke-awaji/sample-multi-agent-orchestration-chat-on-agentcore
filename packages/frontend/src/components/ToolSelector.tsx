import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X, AlertCircle } from 'lucide-react';
import { useToolStore } from '../stores/toolStore';
import { LoadingIndicator } from './ui/LoadingIndicator';
import { getToolIcon } from '../utils/toolIcons';

interface ToolSelectorProps {
  selectedTools: string[];
  onSelectionChange: (selectedTools: string[]) => void;
  disabled?: boolean;
}

export const ToolSelector: React.FC<ToolSelectorProps> = ({
  selectedTools,
  onSelectionChange,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const { tools, isLoading, error, loadAllTools } = useToolStore();
  const [searchQuery, setSearchQuery] = useState('');

  // ツール一覧を取得（全ページ読み込み）
  useEffect(() => {
    if (tools.length === 0 && !isLoading && !error) {
      loadAllTools();
    }
  }, [tools.length, isLoading, error, loadAllTools]);

  // 検索フィルタリング（useMemoを使用してパフォーマンス向上）
  const filteredTools = React.useMemo(() => {
    if (!searchQuery.trim()) {
      return tools;
    }

    const query = searchQuery.toLowerCase();
    return tools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(query) ||
        (tool.description && tool.description.toLowerCase().includes(query))
    );
  }, [tools, searchQuery]);

  // ツール選択の切り替え
  const toggleTool = (toolName: string) => {
    if (disabled) return;

    const isSelected = selectedTools.includes(toolName);
    let newSelection: string[];

    if (isSelected) {
      newSelection = selectedTools.filter((name) => name !== toolName);
    } else {
      newSelection = [...selectedTools, toolName];
    }

    onSelectionChange(newSelection);
  };

  // 全選択/全解除
  const toggleAllTools = () => {
    if (disabled) return;

    const allToolNames = filteredTools.map((tool) => tool.name);
    const allSelected = allToolNames.every((name) => selectedTools.includes(name));

    if (allSelected) {
      // 表示中のツールをすべて解除
      const newSelection = selectedTools.filter((name) => !allToolNames.includes(name));
      onSelectionChange(newSelection);
    } else {
      // 表示中のツールをすべて選択
      const newSelection = [...new Set([...selectedTools, ...allToolNames])];
      onSelectionChange(newSelection);
    }
  };

  const allFilteredSelected = filteredTools.every((tool) => selectedTools.includes(tool.name));

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">{t('tool.selector.availableTools')}</h3>
        <span className="text-xs text-gray-500">
          {t('tool.selector.selectedCount', {
            selected: selectedTools.length,
            total: tools.length,
          })}
        </span>
      </div>

      {/* 検索ボックス */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <input
          type="text"
          placeholder={t('tool.selector.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          disabled={disabled || isLoading}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 全選択/解除ボタン */}
      {filteredTools.length > 0 && (
        <button
          onClick={toggleAllTools}
          disabled={disabled || isLoading}
          className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed"
        >
          {allFilteredSelected
            ? t('tool.selector.deselectAllVisible')
            : t('tool.selector.selectAllVisible')}
        </button>
      )}

      {/* ローディング状態 */}
      {isLoading && <LoadingIndicator message={t('tool.loadingTools')} spacing="lg" />}

      {/* エラー状態 */}
      {error && (
        <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span className="text-sm text-red-700">{error}</span>
        </div>
      )}

      {/* ツール一覧 */}
      {!isLoading && !error && (
        <div className="space-y-2 max-h-[30vh] overflow-y-auto border border-gray-200 rounded-lg">
          {filteredTools.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              {searchQuery ? t('tool.selector.noSearchResults') : t('tool.selector.noTools')}
            </div>
          ) : (
            filteredTools.map((tool) => {
              const isSelected = selectedTools.includes(tool.name);
              return (
                <div
                  key={tool.name}
                  onClick={() => toggleTool(tool.name)}
                  className={`flex items-start space-x-3 p-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                    disabled ? 'cursor-not-allowed opacity-50' : ''
                  }`}
                >
                  {/* ツールアイコン（選択状態で枠色変更） */}
                  <div
                    className={`flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center transition-all duration-200 ${
                      isSelected
                        ? 'bg-blue-600 text-white border-1 border-blue-500 shadow-sm'
                        : 'bg-gray-100 text-gray-600 border border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                    }`}
                  >
                    {getToolIcon(tool.name, 'w-3 h-3')}
                  </div>

                  {/* ツール情報 */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">{tool.name}</div>
                    {tool.description && (
                      <div className="text-xs text-gray-500 mt-1">{tool.description}</div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 選択済みツールの概要 */}
      {selectedTools.length > 0 && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="text-sm font-medium text-blue-900 mb-2">
            {t('tool.selector.selectedToolsTitle')}
          </h4>
          <div className="flex flex-wrap gap-1">
            {selectedTools.map((toolName) => (
              <span
                key={toolName}
                className="inline-flex items-center px-2 py-1 rounded-md bg-blue-100 text-blue-800 text-xs"
              >
                {toolName}
                {!disabled && (
                  <button
                    onClick={() => toggleTool(toolName)}
                    className="ml-1 text-blue-600 hover:text-blue-800"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
