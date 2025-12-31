/**
 * S3 Storage Service
 * ユーザーごとのファイルストレージを提供
 */

import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/index.js';

const s3Client = new S3Client({ region: process.env.AWS_REGION });

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

/**
 * ユーザーのストレージパスプレフィックスを生成
 */
function getUserStoragePrefix(userId: string): string {
  return `users/${userId}`;
}

/**
 * パスを正規化（先頭・末尾のスラッシュを削除、ローカルワークスペースパスを除去、二重エンコード対策）
 * 生成AIが出力するテキストはエンコードされている場合もあれば、そうでない場合もあるため二重エンコード対策を含めておく
 */
function normalizePath(path: string): string {
  let normalized = path;

  // 1. 二重エンコード対策（最大2回までデコード）
  for (let i = 0; i < 2; i++) {
    try {
      const decoded = decodeURIComponent(normalized);
      if (decoded === normalized) {
        // これ以上デコードできない
        break;
      }
      normalized = decoded;
    } catch {
      // デコードに失敗した場合は現在の値を使用
      break;
    }
  }

  // 2. 先頭・末尾のスラッシュを削除
  normalized = normalized.replace(/^\/+|\/+$/g, '');

  // 3. ローカルワークスペースパスのプレフィックスを除去（ハルシネーション対策）
  // /tmp/ws/, tmp/ws/, /tmp/, tmp/ などを除去
  normalized = normalized.replace(/^(?:tmp\/ws|tmp)\//, '');

  return normalized;
}

/**
 * ディレクトリ一覧を取得
 */
export async function listStorageItems(
  userId: string,
  path: string = '/'
): Promise<ListStorageResponse> {
  const bucketName = config.userStorageBucketName;
  if (!bucketName) {
    throw new Error('USER_STORAGE_BUCKET_NAME is not configured');
  }

  const normalizedPath = normalizePath(path);
  const prefix = normalizedPath
    ? `${getUserStoragePrefix(userId)}/${normalizedPath}/`
    : `${getUserStoragePrefix(userId)}/`;

  console.log(`📁 Listing storage items for user ${userId} at path: ${path} (prefix: ${prefix})`);

  const command = new ListObjectsV2Command({
    Bucket: bucketName,
    Prefix: prefix,
    Delimiter: '/',
  });

  const response = await s3Client.send(command);
  const items: StorageItem[] = [];

  // ディレクトリを追加
  if (response.CommonPrefixes) {
    for (const commonPrefix of response.CommonPrefixes) {
      if (commonPrefix.Prefix) {
        const name = commonPrefix.Prefix.replace(prefix, '').replace(/\/$/, '');
        items.push({
          name,
          path: `/${normalizedPath}/${name}`.replace(/\/+/g, '/'),
          type: 'directory',
        });
      }
    }
  }

  // ファイルを追加
  if (response.Contents) {
    for (const content of response.Contents) {
      if (content.Key && content.Key !== prefix) {
        const name = content.Key.replace(prefix, '');
        items.push({
          name,
          path: `/${normalizedPath}/${name}`.replace(/\/+/g, '/'),
          type: 'file',
          size: content.Size,
          lastModified: content.LastModified?.toISOString(),
        });
      }
    }
  }

  console.log(`✅ Found ${items.length} items`);

  return {
    items,
    path: `/${normalizedPath}`,
  };
}

/**
 * ファイルアップロード用の署名付きURLを生成
 */
export async function generateUploadUrl(
  userId: string,
  fileName: string,
  path: string = '/',
  contentType?: string
): Promise<UploadUrlResponse> {
  const bucketName = config.userStorageBucketName;
  if (!bucketName) {
    throw new Error('USER_STORAGE_BUCKET_NAME is not configured');
  }

  const normalizedPath = normalizePath(path);
  const key = normalizedPath
    ? `${getUserStoragePrefix(userId)}/${normalizedPath}/${fileName}`
    : `${getUserStoragePrefix(userId)}/${fileName}`;

  console.log(`📤 Generating upload URL for: ${key}`);

  // Note: ファイルサイズ制限は5MB（Bedrock Converse API制限を考慮）
  // 将来的にクライアント側またはサーバー側でバリデーションを追加する場合に参照
  // const maxFileSize = 5 * 1024 * 1024; // 5MB in bytes

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType || 'application/octet-stream',
  });

  const expiresIn = 3600; // 1時間
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });

  console.log(`✅ Upload URL generated (expires in ${expiresIn}s)`);

  return {
    uploadUrl,
    key,
    expiresIn,
  };
}

/**
 * ディレクトリを作成
 * S3にはディレクトリという概念がないため、空のプレースホルダーオブジェクトを作成
 */
export async function createDirectory(userId: string, directoryName: string, path: string = '/') {
  const bucketName = config.userStorageBucketName;
  if (!bucketName) {
    throw new Error('USER_STORAGE_BUCKET_NAME is not configured');
  }

  const normalizedPath = normalizePath(path);
  const key = normalizedPath
    ? `${getUserStoragePrefix(userId)}/${normalizedPath}/${directoryName}/`
    : `${getUserStoragePrefix(userId)}/${directoryName}/`;

  console.log(`📁 Creating directory: ${key}`);

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: '',
  });

  await s3Client.send(command);

  console.log(`✅ Directory created: ${key}`);

  return {
    path: `/${normalizedPath}/${directoryName}`.replace(/\/+/g, '/'),
    name: directoryName,
  };
}

/**
 * ファイルを削除
 */
export async function deleteFile(userId: string, filePath: string) {
  const bucketName = config.userStorageBucketName;
  if (!bucketName) {
    throw new Error('USER_STORAGE_BUCKET_NAME is not configured');
  }

  const normalizedPath = normalizePath(filePath);
  const key = `${getUserStoragePrefix(userId)}/${normalizedPath}`;

  console.log(`🗑️  Deleting file: ${key}`);

  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  await s3Client.send(command);

  console.log(`✅ File deleted: ${key}`);

  return { deleted: true };
}

/**
 * ディレクトリを削除
 * @param force true の場合、ディレクトリ内のすべてのオブジェクトを再帰的に削除
 */
export async function deleteDirectory(
  userId: string,
  directoryPath: string,
  force: boolean = false
) {
  const bucketName = config.userStorageBucketName;
  if (!bucketName) {
    throw new Error('USER_STORAGE_BUCKET_NAME is not configured');
  }

  const normalizedPath = normalizePath(directoryPath);
  // ルートフォルダの場合も正しくプレフィックスを構築
  const prefix = normalizedPath
    ? `${getUserStoragePrefix(userId)}/${normalizedPath}/`
    : `${getUserStoragePrefix(userId)}/`;

  console.log(`🗑️  Deleting directory: ${prefix} (force: ${force})`);

  // ディレクトリ内のオブジェクトを確認
  const listCommand = new ListObjectsV2Command({
    Bucket: bucketName,
    Prefix: prefix,
  });

  const listResponse = await s3Client.send(listCommand);

  if (!listResponse.Contents || listResponse.Contents.length === 0) {
    throw new Error('Directory not found');
  }

  // プレースホルダーオブジェクトのみの場合は削除可能
  if (listResponse.Contents.length === 1 && listResponse.Contents[0].Key === prefix) {
    const deleteCommand = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: prefix,
    });

    await s3Client.send(deleteCommand);
    console.log(`✅ Directory deleted: ${prefix}`);
    return { deleted: true, count: 1 };
  }

  // forceフラグがない場合は、空でないディレクトリは削除できない
  if (!force) {
    throw new Error('Directory is not empty');
  }

  // forceフラグがある場合は、すべてのオブジェクトを削除
  let deletedCount = 0;
  let continuationToken: string | undefined;

  do {
    // オブジェクト一覧を取得（ページネーション対応）
    const listCmd = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      ContinuationToken: continuationToken,
      MaxKeys: 1000, // S3 APIの最大値
    });

    const response = await s3Client.send(listCmd);

    if (response.Contents && response.Contents.length > 0) {
      // バッチ削除用のキーリストを作成
      const objectsToDelete = response.Contents.map((obj) => ({ Key: obj.Key! }));

      // DeleteObjectsCommandを使用して一括削除
      const { DeleteObjectsCommand: BatchDeleteCommand } = await import('@aws-sdk/client-s3');
      const deleteCmd = new BatchDeleteCommand({
        Bucket: bucketName,
        Delete: {
          Objects: objectsToDelete,
          Quiet: true,
        },
      });

      await s3Client.send(deleteCmd);
      deletedCount += objectsToDelete.length;
      console.log(`🗑️  Deleted ${objectsToDelete.length} objects (total: ${deletedCount})`);
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  console.log(`✅ Directory and all contents deleted: ${prefix} (${deletedCount} objects)`);

  return { deleted: true, count: deletedCount };
}

/**
 * ファイルのダウンロード用署名付きURLを生成
 */
export async function generateDownloadUrl(userId: string, filePath: string): Promise<string> {
  const bucketName = config.userStorageBucketName;
  if (!bucketName) {
    throw new Error('USER_STORAGE_BUCKET_NAME is not configured');
  }

  const normalizedPath = normalizePath(filePath);
  const key = `${getUserStoragePrefix(userId)}/${normalizedPath}`;

  console.log(`📥 Generating download URL for: ${key}`);

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  const expiresIn = 3600; // 1時間
  const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn });

  console.log(`✅ Download URL generated`);

  return downloadUrl;
}

/**
 * ファイルの存在確認
 */
export async function checkFileExists(userId: string, filePath: string): Promise<boolean> {
  const bucketName = config.userStorageBucketName;
  if (!bucketName) {
    throw new Error('USER_STORAGE_BUCKET_NAME is not configured');
  }

  const normalizedPath = normalizePath(filePath);
  const key = `${getUserStoragePrefix(userId)}/${normalizedPath}`;

  try {
    const command = new HeadObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    await s3Client.send(command);
    return true;
  } catch {
    return false;
  }
}

/**
 * フォルダダウンロード用のファイル情報
 */
export interface DownloadFileInfo {
  relativePath: string; // ZIP内の相対パス
  downloadUrl: string; // S3署名付きURL
  size: number; // ファイルサイズ
}

export interface FolderDownloadInfo {
  files: DownloadFileInfo[];
  totalSize: number;
  fileCount: number;
}

/**
 * フォルダツリー構造
 */
export interface FolderNode {
  path: string;
  name: string;
  children: FolderNode[];
}

/**
 * フォルダツリーを取得
 * ルートからの全フォルダを階層構造で返す
 */
export async function getFolderTree(userId: string): Promise<FolderNode[]> {
  const bucketName = config.userStorageBucketName;
  if (!bucketName) {
    throw new Error('USER_STORAGE_BUCKET_NAME is not configured');
  }

  const prefix = `${getUserStoragePrefix(userId)}/`;
  console.log(`📁 Building folder tree for user ${userId} (prefix: ${prefix})`);

  // すべてのオブジェクトを取得（ディレクトリマーカー含む）
  const allObjects: string[] = [];
  let continuationToken: string | undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });

    const response = await s3Client.send(command);

    if (response.Contents) {
      for (const obj of response.Contents) {
        if (obj.Key && obj.Key !== prefix) {
          // プレフィックスを除いた相対パスを取得
          const relativePath = obj.Key.replace(prefix, '');
          allObjects.push(relativePath);
        }
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  // ディレクトリパスを抽出（重複排除）
  const dirPaths = new Set<string>();
  for (const objPath of allObjects) {
    const parts = objPath.split('/');
    let currentPath = '';
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath += (currentPath ? '/' : '') + parts[i];
      dirPaths.add(currentPath);
    }
  }

  // ディレクトリパスをソート
  const sortedDirPaths = Array.from(dirPaths).sort();

  // ツリー構造を構築
  const root: FolderNode = {
    path: '/',
    name: 'ルート',
    children: [],
  };

  const pathMap = new Map<string, FolderNode>();
  pathMap.set('/', root);

  for (const dirPath of sortedDirPaths) {
    const parts = dirPath.split('/');
    const name = parts[parts.length - 1];
    const fullPath = `/${dirPath}`;

    const node: FolderNode = {
      path: fullPath,
      name,
      children: [],
    };

    pathMap.set(fullPath, node);

    // 親ノードを見つけて追加
    const parentPath = parts.length > 1 ? `/${parts.slice(0, -1).join('/')}` : '/';
    const parentNode = pathMap.get(parentPath);
    if (parentNode) {
      parentNode.children.push(node);
    }
  }

  console.log(`✅ Folder tree built with ${sortedDirPaths.length} directories`);

  return [root];
}

/**
 * フォルダ内のすべてのファイルの署名付きURLを取得（再帰的）
 */
export async function getRecursiveDownloadUrls(
  userId: string,
  folderPath: string
): Promise<FolderDownloadInfo> {
  const bucketName = config.userStorageBucketName;
  if (!bucketName) {
    throw new Error('USER_STORAGE_BUCKET_NAME is not configured');
  }

  const normalizedPath = normalizePath(folderPath);
  const prefix = normalizedPath
    ? `${getUserStoragePrefix(userId)}/${normalizedPath}/`
    : `${getUserStoragePrefix(userId)}/`;

  console.log(`📦 Getting recursive download URLs for folder: ${prefix}`);

  const files: DownloadFileInfo[] = [];
  let totalSize = 0;
  let continuationToken: string | undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    });

    const response = await s3Client.send(command);

    if (response.Contents) {
      for (const obj of response.Contents) {
        // ディレクトリマーカー（末尾が/で終わるオブジェクト）はスキップ
        if (obj.Key && !obj.Key.endsWith('/') && obj.Key !== prefix) {
          const relativePath = obj.Key.replace(prefix, '');
          const size = obj.Size || 0;

          // 署名付きURLを生成
          const downloadCommand = new GetObjectCommand({
            Bucket: bucketName,
            Key: obj.Key,
          });

          const downloadUrl = await getSignedUrl(s3Client, downloadCommand, { expiresIn: 3600 });

          files.push({
            relativePath,
            downloadUrl,
            size,
          });

          totalSize += size;
        }
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  console.log(`✅ Found ${files.length} files (total size: ${totalSize} bytes)`);

  return {
    files,
    totalSize,
    fileCount: files.length,
  };
}
