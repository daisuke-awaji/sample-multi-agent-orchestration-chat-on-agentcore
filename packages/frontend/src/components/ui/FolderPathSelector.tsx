import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, AlertCircle } from 'lucide-react';
import { FolderTree } from '../FolderTree';
import { fetchFolderTree, type FolderNode } from '../../api/storage';

interface FolderPathSelectorProps {
  value?: string;
  onChange: (path: string | undefined) => void;
  disabled?: boolean;
  id?: string;
}

export const FolderPathSelector: React.FC<FolderPathSelectorProps> = ({
  value,
  onChange,
  disabled = false,
  id = 'folderPathSelector',
}) => {
  const { t } = useTranslation();
  const [folderTree, setFolderTree] = useState<FolderNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<string[]>([]);

  useEffect(() => {
    const loadFolders = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetchFolderTree();
        setFolderTree(response.tree);
      } catch (err) {
        console.error('Failed to load folder tree:', err);
        setError(t('storage.loadError'));
      } finally {
        setIsLoading(false);
      }
    };
    loadFolders();
  }, [t]);

  // Auto-expand parent paths when value is set
  useEffect(() => {
    if (value) {
      const parts = value.split('/').filter(Boolean);
      const paths: string[] = [];
      let currentPath = '';
      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
        paths.push(currentPath);
      }
      setExpandedPaths((prev) => [...new Set([...prev, ...paths])]);
    }
  }, [value]);

  const handleToggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    );
  }, []);

  const handleSelect = useCallback(
    (path: string) => {
      if (!disabled) {
        onChange(path);
      }
    },
    [disabled, onChange]
  );

  const handleClear = useCallback(() => {
    if (!disabled) {
      onChange(undefined);
    }
  }, [disabled, onChange]);

  return (
    <div id={id} className="space-y-2">
      {/* Selected path display */}
      {value && (
        <div className="flex items-center justify-between px-3 py-2 bg-feedback-info-bg border border-action-primary rounded-input">
          <span className="text-sm text-action-primary truncate">{value}</span>
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            className="p-0.5 hover:bg-border rounded transition-colors disabled:opacity-50"
          >
            <X className="size-4 text-action-primary" />
          </button>
        </div>
      )}

      {/* Folder tree */}
      <div
        className={`border rounded-input bg-surface-primary max-h-48 overflow-y-auto ${
          disabled ? 'opacity-50 pointer-events-none' : ''
        } border-border`}
      >
        <FolderTree
          tree={folderTree}
          selectedPath={value || ''}
          expandedPaths={expandedPaths}
          onSelect={handleSelect}
          onToggleExpand={handleToggleExpand}
          isLoading={isLoading}
        />
      </div>

      {/* Error display */}
      {error && (
        <div className="flex items-center gap-1 text-feedback-error">
          <AlertCircle className="size-4" />
          <p className="text-xs">{error}</p>
        </div>
      )}

      {/* No selection hint */}
      {!value && !isLoading && !error && folderTree.length > 0 && (
        <p className="text-xs text-fg-muted">{t('agent.noDefaultStoragePath')}</p>
      )}
    </div>
  );
};
