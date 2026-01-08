/**
 * Storage API Client
 * ユーザーファイルストレージAPI
 */

import { backendGet, backendPost, backendRequest } from './client/backend-client';

export interface StorageItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  lastModified?: string;
  url?: string;
}

export interface ListStorageResponse {
  items: StorageItem[];
  path: string;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}

export interface FolderNode {
  path: string;
  name: string;
  children: FolderNode[];
}

export interface FolderTreeResponse {
  tree: FolderNode[];
}

/**
 * パスを正規化（エンコード済み・未エンコード両方に対応）
 * 二重エンコード、単一エンコード、未エンコードのすべてに対応
 */
function normalizeStoragePath(path: string): string {
  let normalized = path;

  // 最大2回までデコードを試みる（二重エンコード対策）
  for (let i = 0; i < 2; i++) {
    try {
      const decoded = decodeURIComponent(normalized);
      if (decoded === normalized) {
        // これ以上デコードできない（未エンコードまたはデコード完了）
        break;
      }
      normalized = decoded;
    } catch {
      // デコードに失敗した場合は現在の値を使用
      break;
    }
  }

  return normalized;
}

export interface DownloadFileInfo {
  relativePath: string;
  downloadUrl: string;
  size: number;
}

export interface FolderDownloadInfo {
  files: DownloadFileInfo[];
  totalSize: number;
  fileCount: number;
}

export interface DownloadProgress {
  current: number;
  total: number;
  percentage: number;
  currentFile: string;
}

/**
 * ディレクトリ一覧を取得
 */
export async function listStorageItems(path: string = '/'): Promise<ListStorageResponse> {
  const params = new URLSearchParams();
  params.append('path', path);

  return backendGet<ListStorageResponse>(`/storage/list?${params.toString()}`);
}

/**
 * Upload file用の署名付きURLを生成
 */
export async function generateUploadUrl(
  fileName: string,
  path: string = '/',
  contentType?: string
): Promise<UploadUrlResponse> {
  return backendPost<UploadUrlResponse>('/storage/upload', {
    fileName,
    path,
    contentType,
  });
}

/**
 * 署名付きURLを使用してS3にファイルをアップロード
 * Note: This is direct S3 upload, not using backend client
 */
export async function uploadFileToS3(uploadUrl: string, file: File): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload file to S3: ${response.statusText}`);
  }
}

/**
 * ディレクトリを作成
 */
export async function createDirectory(directoryName: string, path: string = '/') {
  return backendPost('/storage/directory', {
    directoryName,
    path,
  });
}

/**
 * ファイルを削除
 */
export async function deleteFile(path: string) {
  const params = new URLSearchParams();
  params.append('path', path);

  return backendRequest(`/storage/file?${params.toString()}`, { method: 'DELETE' });
}

/**
 * ディレクトリを削除
 * @param path ディレクトリパス
 * @param force true の場合、ディレクトリ内のすべてのファイルを含めて削除
 */
export async function deleteDirectory(path: string, force: boolean = false) {
  const params = new URLSearchParams();
  params.append('path', path);
  if (force) {
    params.append('force', 'true');
  }

  return backendRequest(`/storage/directory?${params.toString()}`, { method: 'DELETE' });
}

/**
 * ファイルダウンロード用の署名付きURLを生成
 */
export async function generateDownloadUrl(path: string): Promise<string> {
  const params = new URLSearchParams();
  // パスを正規化（二重エンコード対策）
  const normalizedPath = normalizeStoragePath(path);
  params.append('path', normalizedPath);

  const data = await backendGet<{ downloadUrl: string }>(`/storage/download?${params.toString()}`);

  return data.downloadUrl;
}

/**
 * フォルダツリー構造を取得
 */
export async function fetchFolderTree(): Promise<FolderTreeResponse> {
  return backendGet<FolderTreeResponse>('/storage/tree');
}

/**
 * フォルダ内のすべてのファイル情報を取得
 */
export async function getFolderDownloadInfo(path: string): Promise<FolderDownloadInfo> {
  const params = new URLSearchParams();
  params.append('path', path);

  return backendGet<FolderDownloadInfo>(`/storage/download-folder?${params.toString()}`);
}

/**
 * フォルダを一括ダウンロード（ZIP形式）
 * Note: This uses external libraries (jszip, file-saver) and direct fetch to S3
 */
export async function downloadFolder(
  folderPath: string,
  folderName: string,
  onProgress?: (progress: DownloadProgress) => void,
  signal?: AbortSignal
): Promise<void> {
  const JSZip = (await import('jszip')).default;
  const { saveAs } = await import('file-saver');

  // フォルダ内のファイル情報を取得
  const downloadInfo = await getFolderDownloadInfo(folderPath);

  if (downloadInfo.fileCount === 0) {
    throw new Error('Folder is empty');
  }

  // Create ZIP file
  const zip = new JSZip();
  let downloadedCount = 0;

  // 各ファイルをダウンロードしてZIPに追加
  for (const file of downloadInfo.files) {
    // キャンセルチェック
    if (signal?.aborted) {
      throw new Error('Download cancelled');
    }

    // 進捗を通知
    if (onProgress) {
      onProgress({
        current: downloadedCount,
        total: downloadInfo.fileCount,
        percentage: Math.round((downloadedCount / downloadInfo.fileCount) * 100),
        currentFile: file.relativePath,
      });
    }

    try {
      // Download file (direct S3 fetch, not using backend client)
      const response = await fetch(file.downloadUrl, { signal });

      if (!response.ok) {
        console.error(`Failed to download file: ${file.relativePath}`);
        continue;
      }

      const blob = await response.blob();

      // ZIPに追加
      zip.file(file.relativePath, blob);

      downloadedCount++;
    } catch (error) {
      if (signal?.aborted) {
        throw new Error('Download cancelled');
      }
      console.error(`Error downloading file ${file.relativePath}:`, error);
      // エラーが発生してもスキップして続行
      downloadedCount++;
    }
  }

  // 最終進捗を通知
  if (onProgress) {
    onProgress({
      current: downloadedCount,
      total: downloadInfo.fileCount,
      percentage: 100,
      currentFile: 'Creating ZIP file...',
    });
  }

  // ZIPファイルを生成してダウンロード
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  saveAs(zipBlob, `${folderName}.zip`);
}
