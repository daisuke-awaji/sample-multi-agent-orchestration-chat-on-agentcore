/**
 * Storage Management Modal
 * ユーザーファイルストレージの管理モーダル
 */

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Folder,
  File,
  Upload,
  FolderPlus,
  Trash2,
  Loader2,
  AlertCircle,
  ChevronRight,
  Home,
  Download,
  Copy,
  Check,
  HelpCircle,
} from 'lucide-react';
import { useStorageStore } from '../stores/storageStore';
import type { StorageItem, FolderNode } from '../api/storage';
import { Modal } from './ui/Modal/Modal';
import { generateDownloadUrl, downloadFolder, type DownloadProgress } from '../api/storage';
import { Tooltip } from './ui/Tooltip/Tooltip';
import { FolderTree } from './FolderTree';
import { getFileIcon } from '../utils/fileIcons';
import { DownloadProgressModal } from './ui/DownloadProgressModal';

interface StorageManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * ファイル/ディレクトリアイテム表示コンポーネント
 */
interface StorageItemComponentProps {
  item: StorageItem;
  onDelete: (item: StorageItem) => void;
  onNavigate: (path: string) => void;
  onDownload: (item: StorageItem) => void;
  onContextMenu: (e: React.MouseEvent, item: StorageItem) => void;
  isDeleting: boolean;
}

function StorageItemComponent({
  item,
  onDelete,
  onNavigate,
  onDownload,
  onContextMenu,
  isDeleting,
}: StorageItemComponentProps) {
  const { t } = useTranslation();

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation(); // Stop card click event

    const confirmMessage =
      item.type === 'directory'
        ? t('storage.deleteDirectoryConfirm', { name: item.name })
        : t('storage.deleteFileConfirm', { name: item.name });

    if (window.confirm(confirmMessage)) {
      onDelete(item);
    }
  };

  const handleDownloadClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Stop card click event
    onDownload(item);
  };

  const handleCardClick = () => {
    if (item.type === 'directory') {
      onNavigate(item.path);
    } else {
      // Download if file
      onDownload(item);
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleContextMenuClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e, item);
  };

  // Get file icon
  const fileIconConfig = item.type === 'file' ? getFileIcon(item.name) : null;
  const FileIcon = fileIconConfig?.icon;

  return (
    <div
      onClick={handleCardClick}
      onContextMenu={handleContextMenuClick}
      className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors cursor-pointer"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
    >
      <div className="flex items-center gap-3">
        {/* アイコン */}
        <div className="flex-shrink-0">
          {item.type === 'directory' ? (
            <Folder className="w-5 h-5 text-amber-500" />
          ) : FileIcon ? (
            <FileIcon className={`w-5 h-5 ${fileIconConfig.color}`} />
          ) : (
            <File className="w-5 h-5 text-blue-500" />
          )}
        </div>

        {/* 情報 */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">{item.name}</div>
          <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
            {item.type === 'file' && <span>{formatSize(item.size)}</span>}
            <span className="hidden sm:inline">{formatDate(item.lastModified)}</span>
          </div>
        </div>

        {/* アクション */}
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={handleDownloadClick}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title={item.type === 'directory' ? t('storage.downloadFolder') : t('storage.download')}
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={t('common.delete')}
          >
            {isDeleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Storage Management Modal
 */
export function StorageManagementModal({ isOpen, onClose }: StorageManagementModalProps) {
  const { t } = useTranslation();
  const {
    currentPath,
    items,
    isLoading,
    error,
    isUploading,
    uploadProgress,
    uploadTotal,
    uploadCompleted,
    folderTree,
    isTreeLoading,
    expandedFolders,
    loadItems,
    uploadFiles,
    createDirectory,
    deleteItem,
    clearError,
    loadFolderTree,
    toggleFolderExpand,
  } = useStorageStore();

  const [newDirectoryName, setNewDirectoryName] = useState('');
  const [showNewDirectoryInput, setShowNewDirectoryInput] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [deletingItemPath, setDeletingItemPath] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    path: string;
    type: 'file' | 'directory';
  } | null>(null);
  const [folderContextMenu, setFolderContextMenu] = useState<{
    x: number;
    y: number;
    path: string;
    name: string;
  } | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const folderContextMenuRef = useRef<HTMLDivElement>(null);

  // Folder download related state
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({
    current: 0,
    total: 0,
    percentage: 0,
    currentFile: '',
  });
  const [downloadStatus, setDownloadStatus] = useState<
    'downloading' | 'success' | 'error' | 'cancelled'
  >('downloading');
  const [downloadError, setDownloadError] = useState<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);

  // Get path from URL hash
  const getPathFromHash = (): string => {
    const hash = window.location.hash;
    const match = hash.match(/#storage=(.+)/);
    return match ? decodeURIComponent(match[1]) : '/';
  };

  // Set path to URL hash
  const setPathToHash = (path: string) => {
    const newHash = `#storage=${encodeURIComponent(path)}`;
    window.history.pushState(null, '', newHash);
  };

  // Clear URL hash
  const clearHash = () => {
    if (window.location.hash.startsWith('#storage=')) {
      window.history.pushState(null, '', window.location.pathname + window.location.search);
    }
  };

  // モーダル表示時にデータを読み込み
  useEffect(() => {
    if (isOpen) {
      // Use URL hash if explicitly set,
      // otherwise use currently selected path (currentPath)
      const hasExplicitHash = window.location.hash.startsWith('#storage=');
      const initialPath = hasExplicitHash ? getPathFromHash() : currentPath || '/';

      // Set URL hash on initial display (add to history)
      setPathToHash(initialPath);
      loadItems(initialPath);
      // Also load folder tree
      loadFolderTree();
    } else {
      // Clear URL hash when closing modal
      clearHash();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Detect browser back/forward
  useEffect(() => {
    if (!isOpen) return;

    const handleHashChange = () => {
      if (window.location.hash.startsWith('#storage=')) {
        const pathFromHash = getPathFromHash();
        // Call store method directly
        useStorageStore.getState().loadItems(pathFromHash);
      } else {
        // Close modal if no hash
        onClose();
      }
    };

    window.addEventListener('popstate', handleHashChange);
    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('popstate', handleHashChange);
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [isOpen, onClose]);

  // Detect outside click of context menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
      if (
        folderContextMenuRef.current &&
        !folderContextMenuRef.current.contains(event.target as Node)
      ) {
        setFolderContextMenu(null);
      }
    };

    if (contextMenu || folderContextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [contextMenu, folderContextMenu]);

  // Path navigation
  const handleNavigate = (path: string) => {
    setPathToHash(path);
    loadItems(path);
  };

  const handleNavigateToRoot = () => {
    setPathToHash('/');
    loadItems('/');
  };

  // Create breadcrumb list
  const pathSegments = currentPath.split('/').filter(Boolean);

  // File upload (batch processing)
  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray: Array<{ file: File; relativePath: string }> = [];
    for (let i = 0; i < files.length; i++) {
      fileArray.push({
        file: files[i],
        relativePath: files[i].name,
      });
    }

    await uploadFiles(fileArray);
  };

  // Recursively get files and directories from directory entry
  const readDirectoryEntry = async (
    directoryEntry: FileSystemDirectoryEntry,
    path: string = ''
  ): Promise<{
    files: Array<{ file: File; relativePath: string }>;
    directories: string[];
  }> => {
    const files: Array<{ file: File; relativePath: string }> = [];
    const directories: string[] = [];
    const reader = directoryEntry.createReader();

    const readEntries = (): Promise<FileSystemEntry[]> => {
      return new Promise((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });
    };

    const entries = await readEntries();

    // Empty directory if no entry
    if (entries.length === 0) {
      directories.push(path);
      return { files, directories };
    }

    for (const entry of entries) {
      if (entry.isFile) {
        const fileEntry = entry as FileSystemFileEntry;
        const file = await new Promise<File>((resolve, reject) => {
          fileEntry.file(resolve, reject);
        });
        files.push({
          file,
          relativePath: path ? `${path}/${entry.name}` : entry.name,
        });
      } else if (entry.isDirectory) {
        const dirEntry = entry as FileSystemDirectoryEntry;
        const subPath = path ? `${path}/${entry.name}` : entry.name;
        const result = await readDirectoryEntry(dirEntry, subPath);
        files.push(...result.files);
        directories.push(...result.directories);
      }
    }

    return { files, directories };
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files);
    // リセット
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // ドラッグ&ドロップ
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const items = e.dataTransfer.items;

    if (!items) {
      // Fallback: Normal file list
      const files = e.dataTransfer.files;
      await handleFileSelect(files);
      return;
    }

    // Process folder using DataTransferItem
    const allFiles: Array<{ file: File; relativePath: string }> = [];
    const allDirectories: string[] = [];

    // [IMPORTANT] DataTransferItemList can only be accessed synchronously,
    // so get all entries synchronously first
    const entries: FileSystemEntry[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          entries.push(entry);
        }
      }
    }

    // Execute async processing after getting entries
    for (const entry of entries) {
      if (entry.isFile) {
        // If file
        const fileEntry = entry as FileSystemFileEntry;
        const file = await new Promise<File>((resolve, reject) => {
          fileEntry.file(resolve, reject);
        });
        allFiles.push({ file, relativePath: file.name });
      } else if (entry.isDirectory) {
        // If directory, read recursively
        const dirEntry = entry as FileSystemDirectoryEntry;
        const result = await readDirectoryEntry(dirEntry, entry.name);
        allFiles.push(...result.files);
        allDirectories.push(...result.directories);
      }
    }

    // Create empty directory first
    for (const dirPath of allDirectories) {
      // Calculate parent path using last segment of dirPath as directory name
      const pathParts = dirPath.split('/');
      const dirName = pathParts[pathParts.length - 1];
      const parentPath =
        pathParts.length > 1
          ? currentPath === '/'
            ? `/${pathParts.slice(0, -1).join('/')}`
            : `${currentPath}/${pathParts.slice(0, -1).join('/')}`
          : currentPath;

      await createDirectory(dirName, parentPath);
    }

    // Batch upload all files
    if (allFiles.length > 0) {
      await uploadFiles(allFiles);
    }
  };

  // Create directory
  const handleCreateDirectory = async () => {
    if (!newDirectoryName.trim()) return;

    // バリデーション: 半角スペースまたは全角スペースを含む場合はエラー
    if (/[\s\u3000]/.test(newDirectoryName)) {
      alert(t('storage.folderNameSpaceError'));
      return;
    }

    await createDirectory(newDirectoryName);
    setNewDirectoryName('');
    setShowNewDirectoryInput(false);
  };

  // 削除
  const handleDelete = async (item: StorageItem) => {
    setDeletingItemPath(item.path);
    await deleteItem(item);
    setDeletingItemPath(null);
  };

  // ダウンロード
  const handleDownload = async (item: StorageItem) => {
    if (item.type === 'directory') {
      // ZIP download for folders
      await handleFolderDownload(item.path, item.name);
    } else {
      // Download with signed URL for files
      try {
        const downloadUrl = await generateDownloadUrl(item.path);
        // Open download URL in new tab
        window.open(downloadUrl, '_blank');
      } catch (error) {
        console.error('Download error:', error);
      }
    }
  };

  // Show context menu of content panel
  const handleContextMenu = (e: React.MouseEvent, item: StorageItem) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      path: item.path,
      type: item.type,
    });
  };

  // Show context menu of folder tree
  const handleFolderContextMenu = (e: React.MouseEvent, node: FolderNode) => {
    e.preventDefault();
    e.stopPropagation();
    setFolderContextMenu({
      x: e.clientX,
      y: e.clientY,
      path: node.path,
      name: node.name,
    });
  };

  // パスをコピー
  const handleCopyPath = async (path: string, closeMenu: () => void) => {
    try {
      await navigator.clipboard.writeText(path);
      setCopiedPath(path);
      setTimeout(() => {
        setCopiedPath(null);
        closeMenu();
      }, 1500);
    } catch (error) {
      console.error('Copy error:', error);
      closeMenu();
    }
  };

  // コンテンツパネルのコンテキストメニューからダウンロード
  const handleContextDownload = async () => {
    if (!contextMenu) return;
    const item = items.find((i) => i.path === contextMenu.path);
    if (item && item.type === 'file') {
      await handleDownload(item);
    }
    setContextMenu(null);
  };

  // コンテンツパネルのコンテキストメニューから削除
  const handleContextDelete = async () => {
    if (!contextMenu) return;
    const item = items.find((i) => i.path === contextMenu.path);
    if (item) {
      const confirmMessage =
        item.type === 'directory'
          ? t('storage.deleteDirectoryConfirm', { name: item.name })
          : t('storage.deleteFileConfirm', { name: item.name });

      if (window.confirm(confirmMessage)) {
        setContextMenu(null);
        await handleDelete(item);
      } else {
        setContextMenu(null);
      }
    }
  };

  // フォルダツリーのコンテキストメニューから削除
  const handleFolderDelete = async () => {
    if (!folderContextMenu) return;

    const confirmMessage = t('storage.deleteDirectoryConfirm', { name: folderContextMenu.name });

    if (window.confirm(confirmMessage)) {
      setFolderContextMenu(null);
      const folderItem: StorageItem = {
        name: folderContextMenu.name,
        path: folderContextMenu.path,
        type: 'directory',
      };
      await handleDelete(folderItem);
    } else {
      setFolderContextMenu(null);
    }
  };

  // フォルダダウンロード
  const handleFolderDownload = async (folderPath: string, folderName: string) => {
    // モーダルを開いて進捗表示開始
    setDownloadStatus('downloading');
    setDownloadError('');
    setDownloadProgress({ current: 0, total: 0, percentage: 0, currentFile: '' });
    setIsDownloadModalOpen(true);

    // Create AbortController
    abortControllerRef.current = new AbortController();

    try {
      await downloadFolder(
        folderPath,
        folderName,
        (progress) => {
          setDownloadProgress(progress);
        },
        abortControllerRef.current.signal
      );

      // 成功
      setDownloadStatus('success');
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Download cancelled') {
          setDownloadStatus('cancelled');
        } else {
          setDownloadStatus('error');
          setDownloadError(error.message);
        }
      } else {
        setDownloadStatus('error');
        setDownloadError('Unknown error occurred');
      }
    } finally {
      abortControllerRef.current = null;
    }
  };

  // ダウンロードキャンセル
  const handleCancelDownload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // ダウンロードモーダルを閉じる
  const handleCloseDownloadModal = () => {
    setIsDownloadModalOpen(false);
    setDownloadProgress({ current: 0, total: 0, percentage: 0, currentFile: '' });
    setDownloadError('');
  };

  // コンテキストメニューからフォルダダウンロード
  const handleContextFolderDownload = async () => {
    if (!contextMenu) return;
    const item = items.find((i) => i.path === contextMenu.path);
    if (item && item.type === 'directory') {
      setContextMenu(null);
      await handleFolderDownload(item.path, item.name);
    }
  };

  // フォルダツリーのコンテキストメニューからフォルダダウンロード
  const handleTreeFolderDownload = async () => {
    if (!folderContextMenu) return;
    setFolderContextMenu(null);
    await handleFolderDownload(folderContextMenu.path, folderContextMenu.name);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      className="md:max-w-6xl md:h-[85vh] max-w-full h-screen"
    >
      {/* ヘッダー */}
      <div className="border-b border-gray-200 px-4 md:px-6 py-3 md:py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Folder className="w-5 h-5 text-amber-500" />
            <h2 className="text-base md:text-lg font-semibold text-gray-900">
              {t('storage.fileStorage')}
            </h2>
            <Tooltip
              content={<div className="text-xs leading-relaxed">{t('storage.description')}</div>}
              position="bottom"
              width="480px"
            >
              <button className="w-6 h-6 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-600 transition-colors">
                <HelpCircle className="w-4 h-4" />
              </button>
            </Tooltip>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ツールバー */}
      <div className="px-4 md:px-6 py-2.5 border-b border-gray-100 bg-gray-50">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('storage.upload')}</span>
          </button>

          <button
            onClick={() => setShowNewDirectoryInput(true)}
            className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('storage.newFolder')}</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileInputChange}
            className="hidden"
          />
        </div>

        {/* アップロード進捗 */}
        {isUploading && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs sm:text-sm text-gray-600 mb-1">
              <span className="truncate">
                {uploadTotal > 0
                  ? t('storage.uploadingProgress', {
                      completed: uploadCompleted,
                      total: uploadTotal,
                    })
                  : t('storage.uploading')}
              </span>
              <span className="ml-2">{uploadProgress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* コンテンツエリア: レスポンシブレイアウト */}
      <div className="flex divide-x divide-gray-200 flex-1 min-h-0">
        {/* 左カラム: フォルダツリー - デスクトップのみ表示 */}
        <div className="hidden md:block md:w-[240px] flex-shrink-0 overflow-y-auto bg-gray-50">
          <div className="px-3 py-2">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">
              {t('storage.folders')}
            </div>
            <FolderTree
              tree={folderTree}
              selectedPath={currentPath}
              expandedPaths={expandedFolders}
              onSelect={handleNavigate}
              onToggleExpand={toggleFolderExpand}
              onContextMenu={handleFolderContextMenu}
              isLoading={isTreeLoading}
            />
          </div>
        </div>

        {/* 右カラム: ファイル一覧 */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* パンくずナビゲーション */}
          <div className="px-4 md:px-6 py-3 border-b border-gray-100 bg-white">
            <div className="flex flex-wrap items-center gap-1 text-sm overflow-x-auto">
              <button
                onClick={handleNavigateToRoot}
                className="flex items-center gap-1 px-2 py-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors whitespace-nowrap"
              >
                <Home className="w-4 h-4 flex-shrink-0" />
                <span>{t('storage.root')}</span>
              </button>

              {pathSegments.map((segment, index) => {
                const segmentPath = '/' + pathSegments.slice(0, index + 1).join('/');
                return (
                  <div key={segmentPath} className="flex items-center gap-1">
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <button
                      onClick={() => handleNavigate(segmentPath)}
                      className="px-2 py-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors truncate max-w-[120px] sm:max-w-none"
                    >
                      {segment}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ファイルリスト */}
          <div
            className={`flex-1 overflow-y-auto px-4 md:px-6 py-4 relative ${
              isDragOver ? 'bg-blue-50' : ''
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* エラー表示 */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-red-800 break-words">{error}</p>
                  <button
                    onClick={clearError}
                    className="text-sm text-red-600 hover:text-red-800 font-medium mt-1"
                  >
                    {t('common.close')}
                  </button>
                </div>
              </div>
            )}

            {/* ローディング */}
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                <span className="ml-2 text-sm text-gray-600">{t('common.loading')}</span>
              </div>
            )}

            {/* アイテム一覧 */}
            {!isLoading && (
              <>
                {items.length === 0 && !showNewDirectoryInput ? (
                  <div className="text-center py-12">
                    <Folder className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-sm text-gray-600 mb-2">{t('storage.emptyFolder')}</p>
                    <p className="text-xs text-gray-500">{t('storage.dragAndDropHint')}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {items.map((item) => (
                      <StorageItemComponent
                        key={item.path}
                        item={item}
                        onDelete={handleDelete}
                        onNavigate={handleNavigate}
                        onDownload={handleDownload}
                        onContextMenu={handleContextMenu}
                        isDeleting={deletingItemPath === item.path}
                      />
                    ))}

                    {/* 新規ディレクトリ入力（リストの末尾） */}
                    {showNewDirectoryInput && (
                      <div className="border border-blue-300 rounded-lg p-3 bg-blue-50">
                        <div className="flex items-center gap-3">
                          <Folder className="w-5 h-5 text-amber-500 flex-shrink-0" />
                          <input
                            type="text"
                            value={newDirectoryName}
                            onChange={(e) => setNewDirectoryName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCreateDirectory();
                              if (e.key === 'Escape') {
                                setShowNewDirectoryInput(false);
                                setNewDirectoryName('');
                              }
                            }}
                            placeholder={t('storage.folderNamePlaceholder')}
                            className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                          />
                          <button
                            onClick={handleCreateDirectory}
                            disabled={!newDirectoryName.trim()}
                            className="flex-shrink-0 p-2 text-blue-600 hover:bg-blue-100 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title={t('storage.create')}
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setShowNewDirectoryInput(false);
                              setNewDirectoryName('');
                            }}
                            className="flex-shrink-0 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title={t('common.cancel')}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ドラッグオーバー時のオーバーレイ */}
            {isDragOver && (
              <div className="absolute inset-0 flex items-center justify-center bg-blue-50/90 pointer-events-none">
                <div className="text-center">
                  <Upload className="w-12 h-12 text-blue-500 mx-auto mb-2" />
                  <p className="text-lg font-medium text-blue-900">{t('storage.dropFiles')}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* コンテンツパネルのコンテキストメニュー */}
        {contextMenu && (
          <div
            ref={contextMenuRef}
            className="fixed bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[160px]"
            style={{
              left: `${Math.min(contextMenu.x, window.innerWidth - 180)}px`,
              top: `${Math.min(contextMenu.y, window.innerHeight - 200)}px`,
            }}
          >
            {contextMenu.type === 'file' ? (
              <button
                onClick={handleContextDownload}
                className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4 text-gray-600" />
                <span className="text-gray-900">{t('storage.download')}</span>
              </button>
            ) : (
              <button
                onClick={handleContextFolderDownload}
                className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4 text-gray-600" />
                <span className="text-gray-900">{t('storage.downloadFolder')}</span>
              </button>
            )}
            <button
              onClick={handleContextDelete}
              className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2 transition-colors"
            >
              <Trash2 className="w-4 h-4 text-gray-600" />
              <span className="text-gray-900">{t('common.delete')}</span>
            </button>
            <div className="border-t border-gray-200 my-1" />
            <button
              onClick={() => handleCopyPath(contextMenu.path, () => setContextMenu(null))}
              className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2 transition-colors"
            >
              {copiedPath === contextMenu.path ? (
                <>
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-green-600">{t('storage.copied')}</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-gray-600" />
                  <span className="text-gray-900">{t('storage.copyPath')}</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* フォルダツリーのコンテキストメニュー */}
        {folderContextMenu && (
          <div
            ref={folderContextMenuRef}
            className="fixed bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[160px]"
            style={{
              left: `${Math.min(folderContextMenu.x, window.innerWidth - 180)}px`,
              top: `${Math.min(folderContextMenu.y, window.innerHeight - 200)}px`,
            }}
          >
            <button
              onClick={handleTreeFolderDownload}
              className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4 text-gray-600" />
              <span className="text-gray-900">{t('storage.downloadFolder')}</span>
            </button>
            <button
              onClick={handleFolderDelete}
              className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2 transition-colors"
            >
              <Trash2 className="w-4 h-4 text-gray-600" />
              <span className="text-gray-900">{t('common.delete')}</span>
            </button>
            <div className="border-t border-gray-200 my-1" />
            <button
              onClick={() =>
                handleCopyPath(folderContextMenu.path, () => setFolderContextMenu(null))
              }
              className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2 transition-colors"
            >
              {copiedPath === folderContextMenu.path ? (
                <>
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-green-600">{t('storage.copied')}</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-gray-600" />
                  <span className="text-gray-900">{t('storage.copyPath')}</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* フッター */}
      <div className="border-t border-gray-200 px-4 md:px-6 py-3 md:py-4 bg-gray-50">
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 sm:gap-0">
          <p className="text-xs text-gray-500">{t('storage.itemCount', { count: items.length })}</p>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            {t('common.close')}
          </button>
        </div>
      </div>

      {/* ダウンロード進捗モーダル */}
      <DownloadProgressModal
        isOpen={isDownloadModalOpen}
        onClose={handleCloseDownloadModal}
        progress={downloadProgress}
        status={downloadStatus}
        errorMessage={downloadError}
        onCancel={downloadStatus === 'downloading' ? handleCancelDownload : undefined}
      />
    </Modal>
  );
}
