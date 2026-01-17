/**
 * AgentExecutionConfig Component
 * Configuration for agent execution settings (model ID and working directory)
 */

import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Sparkles, FolderCog } from 'lucide-react';
import { AVAILABLE_MODELS, getModelById } from '../../../config/models';
import { useStorageStore } from '../../../stores/storageStore';

export interface AgentExecutionConfigProps {
  modelId?: string;
  workingDirectory?: string;
  onModelIdChange: (modelId: string | undefined) => void;
  onWorkingDirectoryChange: (path: string | undefined) => void;
  disabled?: boolean;
}

export function AgentExecutionConfig({
  modelId,
  workingDirectory,
  onModelIdChange,
  onWorkingDirectoryChange,
  disabled = false,
}: AgentExecutionConfigProps) {
  const { t } = useTranslation();
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [isDirectorySelectorOpen, setIsDirectorySelectorOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const directoryDropdownRef = useRef<HTMLDivElement>(null);
  const { folderTree, loadFolderTree } = useStorageStore();

  const selectedModel = modelId ? getModelById(modelId) : null;

  // Load folder tree on mount
  useEffect(() => {
    loadFolderTree();
  }, [loadFolderTree]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setIsModelSelectorOpen(false);
      }
      if (
        directoryDropdownRef.current &&
        !directoryDropdownRef.current.contains(event.target as Node)
      ) {
        setIsDirectorySelectorOpen(false);
      }
    };

    if (isModelSelectorOpen || isDirectorySelectorOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isModelSelectorOpen, isDirectorySelectorOpen]);

  const handleModelSelect = (selectedModelId: string) => {
    onModelIdChange(selectedModelId);
    setIsModelSelectorOpen(false);
  };

  const handleClearModel = () => {
    onModelIdChange(undefined);
    setIsModelSelectorOpen(false);
  };

  const handleDirectorySelect = (path: string) => {
    onWorkingDirectoryChange(path);
    setIsDirectorySelectorOpen(false);
  };

  const handleClearDirectory = () => {
    onWorkingDirectoryChange(undefined);
    setIsDirectorySelectorOpen(false);
  };

  // Flatten folder tree for dropdown
  const flattenFolderTree = (
    nodes: typeof folderTree,
    depth = 0
  ): Array<{ path: string; name: string; depth: number }> => {
    const result: Array<{ path: string; name: string; depth: number }> = [];
    for (const node of nodes) {
      result.push({ path: node.path, name: node.name, depth });
      if (node.children) {
        result.push(...flattenFolderTree(node.children, depth + 1));
      }
    }
    return result;
  };

  const folders = flattenFolderTree(folderTree);

  return (
    <div className="space-y-4">
      {/* Model Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t('triggers.form.modelId')}
          <span className="text-gray-400 ml-1 text-xs">({t('triggers.form.optional')})</span>
        </label>
        <div ref={modelDropdownRef} className="relative">
          <button
            type="button"
            onClick={() => !disabled && setIsModelSelectorOpen(!isModelSelectorOpen)}
            disabled={disabled}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-gray-900 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Sparkles className="w-4 h-4 text-gray-400 flex-shrink-0" />
              {selectedModel ? (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate">{selectedModel.name}</span>
                  <span className="text-gray-400 text-xs truncate">({selectedModel.provider})</span>
                </div>
              ) : (
                <span className="text-gray-400">{t('triggers.form.selectModel')}</span>
              )}
            </div>
            <ChevronDown
              className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${
                isModelSelectorOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {isModelSelectorOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 max-h-64 overflow-y-auto">
              <button
                type="button"
                onClick={handleClearModel}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors text-gray-500"
              >
                {t('triggers.form.useDefault')}
              </button>
              <div className="border-t border-gray-200 my-1" />
              {AVAILABLE_MODELS.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => handleModelSelect(model.id)}
                  className={`w-full px-3 py-2 text-left hover:bg-gray-50 transition-colors ${
                    model.id === modelId ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{model.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5 truncate">{model.provider}</div>
                    </div>
                    {model.id === modelId && (
                      <div className="w-2 h-2 rounded-full bg-blue-600 ml-2 flex-shrink-0" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1">{t('triggers.form.modelIdHint')}</p>
      </div>

      {/* Working Directory Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t('triggers.form.workingDirectory')}
          <span className="text-gray-400 ml-1 text-xs">({t('triggers.form.optional')})</span>
        </label>

        <div ref={directoryDropdownRef} className="relative">
          <button
            type="button"
            onClick={() => !disabled && setIsDirectorySelectorOpen(!isDirectorySelectorOpen)}
            disabled={disabled}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-gray-900 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <FolderCog className="w-4 h-4 text-gray-400 flex-shrink-0" />
              {workingDirectory ? (
                <span className="font-mono text-xs truncate">{workingDirectory}</span>
              ) : (
                <span className="text-gray-400">{t('triggers.form.selectDirectory')}</span>
              )}
            </div>
            <ChevronDown
              className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${
                isDirectorySelectorOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {isDirectorySelectorOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 max-h-64 overflow-y-auto">
              <button
                type="button"
                onClick={handleClearDirectory}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors text-gray-500"
              >
                {t('triggers.form.useDefault')}
              </button>
              <div className="border-t border-gray-200 my-1" />
              {folders.map((folder) => (
                <button
                  key={folder.path}
                  type="button"
                  onClick={() => handleDirectorySelect(folder.path)}
                  className={`w-full px-3 py-2 text-left hover:bg-gray-50 transition-colors ${
                    folder.path === workingDirectory ? 'bg-blue-50' : ''
                  }`}
                  style={{ paddingLeft: `${12 + folder.depth * 16}px` }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-gray-900 truncate">{folder.path}</span>
                    {folder.path === workingDirectory && (
                      <div className="w-2 h-2 rounded-full bg-blue-600 ml-2 flex-shrink-0" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-gray-500 mt-1">{t('triggers.form.workingDirectoryHint')}</p>
      </div>
    </div>
  );
}
