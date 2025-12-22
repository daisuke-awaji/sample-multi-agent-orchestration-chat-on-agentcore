import React, { useState, useEffect } from 'react';
import { Search, Check, X, AlertCircle } from 'lucide-react';
import { fetchTools, type MCPTool } from '../api/tools';
import { LoadingIndicator } from './ui/LoadingIndicator';

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
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [filteredTools, setFilteredTools] = useState<MCPTool[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ツール一覧を取得
  useEffect(() => {
    const loadTools = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await fetchTools();
        setTools(result.tools);
        setFilteredTools(result.tools);
      } catch (err) {
        console.error('ツール取得エラー:', err);
        setError(err instanceof Error ? err.message : 'ツール一覧の取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };

    loadTools();
  }, []);

  // 検索フィルタリング
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredTools(tools);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = tools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(query) ||
        (tool.description && tool.description.toLowerCase().includes(query))
    );

    setFilteredTools(filtered);
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
        <h3 className="text-sm font-medium text-gray-900">利用可能なツール</h3>
        <span className="text-xs text-gray-500">
          {selectedTools.length} / {tools.length} 選択中
        </span>
      </div>

      {/* 検索ボックス */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <input
          type="text"
          placeholder="ツールを検索..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          disabled={disabled || loading}
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
          disabled={disabled || loading}
          className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed"
        >
          {allFilteredSelected ? '表示中をすべて解除' : '表示中をすべて選択'}
        </button>
      )}

      {/* ローディング状態 */}
      {loading && <LoadingIndicator message="ツール一覧を読み込み中..." spacing="lg" />}

      {/* エラー状態 */}
      {error && (
        <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span className="text-sm text-red-700">{error}</span>
        </div>
      )}

      {/* ツール一覧 */}
      {!loading && !error && (
        <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
          {filteredTools.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              {searchQuery ? '検索結果が見つかりません' : 'ツールがありません'}
            </div>
          ) : (
            filteredTools.map((tool) => {
              const isSelected = selectedTools.includes(tool.name);
              return (
                <label
                  key={tool.name}
                  className={`flex items-start space-x-3 p-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                    disabled ? 'cursor-not-allowed opacity-50' : ''
                  }`}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <div
                      className={`w-4 h-4 border rounded flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'border-gray-300 hover:border-blue-500'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3" />}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0" onClick={() => toggleTool(tool.name)}>
                    <div className="text-sm font-medium text-gray-900">{tool.name}</div>
                    {tool.description && (
                      <div className="text-xs text-gray-500 mt-1">{tool.description}</div>
                    )}
                  </div>
                </label>
              );
            })
          )}
        </div>
      )}

      {/* 選択済みツールの概要 */}
      {selectedTools.length > 0 && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="text-sm font-medium text-blue-900 mb-2">選択済みツール:</h4>
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
