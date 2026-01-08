/**
 * Storage Store
 * ユーザーファイルストレージの状態管理
 */

import { create } from 'zustand';
import type { StorageItem, ListStorageResponse, FolderNode } from '../api/storage';
import * as storageApi from '../api/storage';

// localStorageキー
const STORAGE_PATH_KEY = 'storage-current-path';
const EXPANDED_FOLDERS_KEY = 'storage-expanded-folders';

interface StorageState {
  // 状態
  currentPath: string;
  items: StorageItem[];
  isLoading: boolean;
  error: string | null;
  isUploading: boolean;
  uploadProgress: number;
  uploadTotal: number;
  uploadCompleted: number;

  // フォルダツリー関連
  folderTree: FolderNode[];
  isTreeLoading: boolean;
  expandedFolders: Set<string>;

  // アクション
  setCurrentPath: (path: string) => void;
  loadItems: (path?: string) => Promise<void>;
  uploadFile: (file: File, path?: string) => Promise<void>;
  uploadFiles: (files: Array<{ file: File; relativePath: string }>) => Promise<void>;
  createDirectory: (directoryName: string, path?: string) => Promise<void>;
  deleteItem: (item: StorageItem) => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;

  // フォルダツリーアクション
  loadFolderTree: () => Promise<void>;
  toggleFolderExpand: (path: string) => void;
  setExpandedFolders: (folders: Set<string>) => void;
}

// localStorageから展開フォルダを読み込み
const loadExpandedFolders = (): Set<string> => {
  try {
    const stored = localStorage.getItem(EXPANDED_FOLDERS_KEY);
    if (stored) {
      return new Set(JSON.parse(stored));
    }
  } catch (error) {
    console.error('Failed to load expanded folders from localStorage:', error);
  }
  return new Set(['/']); // Expand root by default
};

// localStorageに展開フォルダを保存
const saveExpandedFolders = (folders: Set<string>) => {
  try {
    localStorage.setItem(EXPANDED_FOLDERS_KEY, JSON.stringify(Array.from(folders)));
  } catch (error) {
    console.error('Failed to save expanded folders to localStorage:', error);
  }
};

export const useStorageStore = create<StorageState>((set, get) => ({
  // 初期状態（localStorageから読み込み）
  currentPath: localStorage.getItem(STORAGE_PATH_KEY) || '/',
  items: [],
  isLoading: false,
  error: null,
  isUploading: false,
  uploadProgress: 0,
  uploadTotal: 0,
  uploadCompleted: 0,

  // フォルダツリー初期状態
  folderTree: [],
  isTreeLoading: false,
  expandedFolders: loadExpandedFolders(),

  // パスを設定
  setCurrentPath: (path: string) => {
    set({ currentPath: path });
    // localStorageに保存
    localStorage.setItem(STORAGE_PATH_KEY, path);
  },

  // アイテム一覧を読み込み
  loadItems: async (path?: string) => {
    const targetPath = path ?? get().currentPath;

    set({ isLoading: true, error: null });

    try {
      const response: ListStorageResponse = await storageApi.listStorageItems(targetPath);

      // localStorageに保存
      localStorage.setItem(STORAGE_PATH_KEY, response.path);

      set({
        items: response.items,
        currentPath: response.path,
        isLoading: false,
      });
    } catch (error) {
      console.error('Failed to load storage items:', error);
      set({
        error: error instanceof Error ? error.message : 'ストレージの読み込みに失敗しました',
        isLoading: false,
      });
    }
  },

  // ファイルをアップロード（単一ファイル）
  uploadFile: async (file: File, relativePathOrPath?: string) => {
    // 単一ファイルのアップロードは uploadFiles を使用
    const relativePath = relativePathOrPath || file.name;
    await get().uploadFiles([{ file, relativePath }]);
  },

  // 複数ファイルをバッチアップロード
  uploadFiles: async (files: Array<{ file: File; relativePath: string }>) => {
    const currentPath = get().currentPath;
    const maxSize = 5 * 1024 * 1024; // 5MB

    // ファイルサイズチェック
    const oversizedFiles = files.filter((f) => f.file.size > maxSize);
    if (oversizedFiles.length > 0) {
      set({
        error: `以下のファイルが5MBを超えています: ${oversizedFiles.map((f) => f.file.name).join(', ')}`,
      });
      return;
    }

    set({
      isUploading: true,
      uploadProgress: 0,
      uploadTotal: files.length,
      uploadCompleted: 0,
      error: null,
    });

    let completed = 0;
    const errors: string[] = [];

    try {
      // 各ファイルを順次アップロード
      for (const { file, relativePath } of files) {
        try {
          let targetPath: string;
          let fileName: string;

          if (relativePath.includes('/')) {
            // 相対パスが含まれている場合
            const pathParts = relativePath.split('/');
            fileName = pathParts[pathParts.length - 1];
            const dirPath = pathParts.slice(0, -1).join('/');
            targetPath = currentPath === '/' ? `/${dirPath}` : `${currentPath}/${dirPath}`;
          } else {
            // ファイル名のみ
            fileName = relativePath;
            targetPath = currentPath;
          }

          // 署名付きURL取得
          const uploadUrlResponse = await storageApi.generateUploadUrl(
            fileName,
            targetPath,
            file.type
          );

          // S3にアップロード
          await storageApi.uploadFileToS3(uploadUrlResponse.uploadUrl, file);

          completed++;
          set({
            uploadCompleted: completed,
            uploadProgress: Math.round((completed / files.length) * 100),
          });
        } catch (error) {
          console.error(`Failed to upload file ${file.name}:`, error);
          errors.push(`${file.name}: ${error instanceof Error ? error.message : '不明なエラー'}`);
        }
      }

      // 全ファイルのアップロード完了後、1回だけリストとツリーを更新
      await get().loadItems(currentPath);
      await get().loadFolderTree();

      set({
        isUploading: false,
        uploadProgress: 100,
        uploadTotal: 0,
        uploadCompleted: 0,
      });

      // エラーがあれば表示
      if (errors.length > 0) {
        set({
          error: `一部のファイルのアップロードに失敗しました:\n${errors.join('\n')}`,
        });
      }

      // プログレスをリセット
      setTimeout(() => {
        set({ uploadProgress: 0 });
      }, 1000);
    } catch (error) {
      console.error('Failed to upload files:', error);
      set({
        error: error instanceof Error ? error.message : 'ファイルのアップロードに失敗しました',
        isUploading: false,
        uploadProgress: 0,
        uploadTotal: 0,
        uploadCompleted: 0,
      });
    }
  },

  // ディレクトリを作成
  createDirectory: async (directoryName: string, path?: string) => {
    const targetPath = path ?? get().currentPath;

    set({ isLoading: true, error: null });

    try {
      await storageApi.createDirectory(directoryName, targetPath);

      // リストを再読み込み
      await get().loadItems(targetPath);

      // ツリーを更新
      await get().loadFolderTree();
    } catch (error) {
      console.error('Failed to create directory:', error);
      set({
        error: error instanceof Error ? error.message : 'ディレクトリの作成に失敗しました',
        isLoading: false,
      });
    }
  },

  // アイテムを削除
  deleteItem: async (item: StorageItem, force: boolean = true) => {
    set({ isLoading: true, error: null });

    try {
      if (item.type === 'file') {
        await storageApi.deleteFile(item.path);
      } else {
        // ディレクトリの場合は force=true で削除（中身も含めて削除）
        await storageApi.deleteDirectory(item.path, force);
      }

      // リストを再読み込み
      await get().loadItems();

      // ディレクトリが削除された場合はツリーも更新
      if (item.type === 'directory') {
        await get().loadFolderTree();
      }
    } catch (error) {
      console.error('Failed to delete item:', error);
      set({
        error: error instanceof Error ? error.message : 'アイテムの削除に失敗しました',
        isLoading: false,
      });
    }
  },

  // 現在のパスを再読み込み
  refresh: async () => {
    await get().loadItems();
  },

  // Clear errors
  clearError: () => {
    set({ error: null });
  },

  // フォルダツリーを読み込み
  loadFolderTree: async () => {
    set({ isTreeLoading: true });

    try {
      const response = await storageApi.fetchFolderTree();
      set({
        folderTree: response.tree,
        isTreeLoading: false,
      });
    } catch (error) {
      console.error('Failed to load folder tree:', error);
      set({
        error: error instanceof Error ? error.message : 'フォルダツリーの読み込みに失敗しました',
        isTreeLoading: false,
      });
    }
  },

  // フォルダの展開/折りたたみをトグル
  toggleFolderExpand: (path: string) => {
    const expandedFolders = new Set(get().expandedFolders);
    if (expandedFolders.has(path)) {
      expandedFolders.delete(path);
    } else {
      expandedFolders.add(path);
    }
    set({ expandedFolders });
    saveExpandedFolders(expandedFolders);
  },

  // 展開フォルダのセットを設定
  setExpandedFolders: (folders: Set<string>) => {
    set({ expandedFolders: folders });
    saveExpandedFolders(folders);
  },
}));
