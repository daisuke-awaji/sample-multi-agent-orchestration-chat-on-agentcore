/**
 * Workspace Sync Service
 * S3 ストレージとローカルワークスペース間でファイルを同期
 */

import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { logger, WORKSPACE_DIRECTORY } from '../config/index.js';
import * as fs from 'fs';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import * as crypto from 'crypto';
import { SyncIgnoreFilter } from './sync-ignore-filter.js';

const s3Client = new S3Client({ region: process.env.AWS_REGION });

/**
 * 同時アップロード数の制限
 */
const CONCURRENT_UPLOAD_LIMIT = 10;

/**
 * ファイル拡張子からContent-Typeを推測
 * テキストファイルには charset=utf-8 を付与
 */
function guessContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();

  // テキスト系ファイル（charset=utf-8付き）
  const textContentTypeMap: Record<string, string> = {
    // Text files
    txt: 'text/plain; charset=utf-8',
    md: 'text/markdown; charset=utf-8',
    csv: 'text/csv; charset=utf-8',
    html: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    xml: 'application/xml; charset=utf-8',

    // Programming languages
    js: 'application/javascript; charset=utf-8',
    ts: 'application/typescript; charset=utf-8',
    json: 'application/json; charset=utf-8',
    py: 'text/x-python; charset=utf-8',
    java: 'text/x-java; charset=utf-8',
    cpp: 'text/x-c++src; charset=utf-8',
    c: 'text/x-c; charset=utf-8',
    go: 'text/x-go; charset=utf-8',
    rs: 'text/x-rust; charset=utf-8',

    // Configuration files
    yaml: 'application/x-yaml; charset=utf-8',
    yml: 'application/x-yaml; charset=utf-8',
    toml: 'application/toml; charset=utf-8',
    ini: 'text/plain; charset=utf-8',
    conf: 'text/plain; charset=utf-8',
  };

  // バイナリ系ファイル（charset不要）
  const binaryContentTypeMap: Record<string, string> = {
    // Documents
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

    // Images
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',

    // Archives
    zip: 'application/zip',
    tar: 'application/x-tar',
    gz: 'application/gzip',
  };

  if (ext && textContentTypeMap[ext]) {
    return textContentTypeMap[ext];
  }

  if (ext && binaryContentTypeMap[ext]) {
    return binaryContentTypeMap[ext];
  }

  return 'application/octet-stream';
}

/**
 * ファイル情報
 */
interface FileInfo {
  path: string;
  size: number;
  mtime: number;
  hash: string;
}

/**
 * 同期結果
 */
export interface SyncResult {
  success: boolean;
  downloadedFiles?: number;
  uploadedFiles?: number;
  errors?: string[];
  duration?: number;
}

/**
 * Workspace Sync サービス
 */
export class WorkspaceSync {
  private syncPromise: Promise<void> | null = null;
  private syncComplete = false;
  private workspaceDir: string;
  private userId: string;
  private storagePath: string;
  private bucketName: string;
  private fileSnapshot: Map<string, FileInfo> = new Map();
  private ignoreFilter: SyncIgnoreFilter;

  constructor(userId: string, storagePath: string) {
    this.userId = userId;
    this.storagePath = storagePath;
    this.bucketName = process.env.USER_STORAGE_BUCKET_NAME || '';

    // ワークスペースディレクトリ
    this.workspaceDir = WORKSPACE_DIRECTORY;

    // Initialize ignore filter with default patterns
    this.ignoreFilter = new SyncIgnoreFilter();

    if (!this.bucketName) {
      logger.warn('[WORKSPACE_SYNC] USER_STORAGE_BUCKET_NAME not configured');
    }

    logger.info(`[WORKSPACE_SYNC] Initialized: userId=${userId}, storagePath=${storagePath}`);
  }

  /**
   * 非同期で初期同期を開始（ブロックしない）
   */
  startInitialSync(): void {
    if (!this.bucketName) {
      logger.warn('[WORKSPACE_SYNC] Skipping initial sync - bucket not configured');
      this.syncComplete = true;
      return;
    }

    logger.info('[WORKSPACE_SYNC] Starting initial sync (non-blocking)...');

    this.syncPromise = this.syncFromS3()
      .then(() => {
        this.syncComplete = true;
        logger.info('[WORKSPACE_SYNC] Initial sync completed');
      })
      .catch((err) => {
        logger.error('[WORKSPACE_SYNC] Initial sync failed:', err);
        this.syncComplete = true; // Mark as complete even on failure
      });
  }

  /**
   * 初期同期の完了を待つ（必要な場合のみ）
   */
  async waitForInitialSync(): Promise<void> {
    if (this.syncComplete) {
      return;
    }

    if (this.syncPromise) {
      logger.debug('[WORKSPACE_SYNC] Waiting for initial sync to complete...');
      await this.syncPromise;
    }
  }

  /**
   * ワークスペースディレクトリのパスを取得
   */
  getWorkspacePath(): string {
    return this.workspaceDir;
  }

  /**
   * S3からローカルへダウンロード（初期同期）
   */
  private async syncFromS3(): Promise<void> {
    const startTime = Date.now();
    let downloadedFiles = 0;
    const errors: string[] = [];

    try {
      // S3パスのプレフィックスを生成
      const s3Prefix = this.getS3Prefix();

      logger.info(`[WORKSPACE_SYNC] Downloading from S3: ${s3Prefix}`);

      // ワークスペースディレクトリを作成
      this.ensureDirectoryExists(this.workspaceDir);

      // S3からファイル一覧を取得
      let continuationToken: string | undefined;

      do {
        const listCommand = new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: s3Prefix,
          MaxKeys: 1000,
          ContinuationToken: continuationToken,
        });

        const listResponse = await s3Client.send(listCommand);

        if (listResponse.Contents) {
          for (const item of listResponse.Contents) {
            if (!item.Key || item.Key === s3Prefix || item.Key.endsWith('/')) {
              continue; // Skip folders
            }

            try {
              // 相対パスを取得
              const relativePath = item.Key.replace(s3Prefix, '');

              // Check if file should be ignored
              if (this.ignoreFilter.isIgnored(relativePath)) {
                logger.debug(`[WORKSPACE_SYNC] Skipping ignored file: ${relativePath}`);
                continue;
              }

              const localPath = path.join(this.workspaceDir, relativePath);

              // ファイルをダウンロード
              await this.downloadFile(item.Key, localPath);
              downloadedFiles++;

              // ファイル情報をスナップショットに保存
              const stats = fs.statSync(localPath);
              const hash = await this.calculateFileHash(localPath);
              this.fileSnapshot.set(relativePath, {
                path: relativePath,
                size: stats.size,
                mtime: stats.mtimeMs,
                hash,
              });
            } catch (error) {
              const errorMsg = `Failed to download ${item.Key}: ${error}`;
              logger.error(`[WORKSPACE_SYNC] ${errorMsg}`);
              errors.push(errorMsg);
            }
          }
        }

        continuationToken = listResponse.NextContinuationToken;
      } while (continuationToken);

      const duration = Date.now() - startTime;
      logger.info(`[WORKSPACE_SYNC] Download complete: ${downloadedFiles} files in ${duration}ms`);

      if (errors.length > 0) {
        logger.warn(`[WORKSPACE_SYNC] Download completed with ${errors.length} errors`);
      }

      // Load custom ignore patterns from .syncignore after download
      this.ignoreFilter.loadFromWorkspace(this.workspaceDir);
    } catch (error) {
      logger.error('[WORKSPACE_SYNC] Download failed:', error);
      throw error;
    }
  }

  /**
   * ローカルからS3へアップロード（差分同期）
   */
  async syncToS3(): Promise<SyncResult> {
    if (!this.bucketName) {
      logger.warn('[WORKSPACE_SYNC] Skipping sync to S3 - bucket not configured');
      return { success: false, errors: ['Bucket not configured'] };
    }

    const startTime = Date.now();
    let uploadedFiles = 0;
    const errors: string[] = [];

    try {
      // 初期同期が完了していることを確認
      await this.waitForInitialSync();

      logger.info('[WORKSPACE_SYNC] Syncing changes to S3...');

      // ワークスペース内のファイルをスキャン
      const currentFiles = await this.scanWorkspaceFiles();

      // アップロード対象のファイルを収集
      interface UploadTask {
        relativePath: string;
        currentInfo: FileInfo;
        localPath: string;
        s3Key: string;
      }

      const uploadTasks: UploadTask[] = [];

      for (const [relativePath, currentInfo] of currentFiles.entries()) {
        const previousInfo = this.fileSnapshot.get(relativePath);

        // 新規ファイルまたは変更されたファイル
        const isNew = !previousInfo;
        const isModified = previousInfo && currentInfo.hash !== previousInfo.hash;

        if (isNew || isModified) {
          const localPath = path.join(this.workspaceDir, relativePath);
          const s3Key = this.getS3Key(relativePath);

          uploadTasks.push({
            relativePath,
            currentInfo,
            localPath,
            s3Key,
          });
        }
      }

      if (uploadTasks.length === 0) {
        logger.info('[WORKSPACE_SYNC] No files to upload');
        return {
          success: true,
          uploadedFiles: 0,
          duration: Date.now() - startTime,
        };
      }

      logger.info(
        `[WORKSPACE_SYNC] Uploading ${uploadTasks.length} files with concurrency limit ${CONCURRENT_UPLOAD_LIMIT}`
      );

      // 同時実行数を制限して並列アップロード
      for (let i = 0; i < uploadTasks.length; i += CONCURRENT_UPLOAD_LIMIT) {
        const chunk = uploadTasks.slice(i, i + CONCURRENT_UPLOAD_LIMIT);

        const uploadPromises = chunk.map(async (task) => {
          try {
            await this.uploadFile(task.localPath, task.s3Key);

            // スナップショットを更新
            this.fileSnapshot.set(task.relativePath, task.currentInfo);

            uploadedFiles++;
            logger.debug(`[WORKSPACE_SYNC] Uploaded: ${task.relativePath}`);
          } catch (error) {
            const errorMsg = `Failed to upload ${task.relativePath}: ${error}`;
            logger.error(`[WORKSPACE_SYNC] ${errorMsg}`);
            errors.push(errorMsg);
          }
        });

        // チャンク内のファイルを並列アップロード
        await Promise.all(uploadPromises);
      }

      const duration = Date.now() - startTime;
      logger.info(`[WORKSPACE_SYNC] Upload complete: ${uploadedFiles} files in ${duration}ms`);

      return {
        success: errors.length === 0,
        uploadedFiles,
        errors: errors.length > 0 ? errors : undefined,
        duration,
      };
    } catch (error) {
      logger.error('[WORKSPACE_SYNC] Upload failed:', error);
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  /**
   * S3からファイルをダウンロード
   */
  private async downloadFile(s3Key: string, localPath: string): Promise<void> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
    });

    const response = await s3Client.send(command);

    if (!response.Body) {
      throw new Error('Empty response body');
    }

    // ディレクトリを作成
    const dir = path.dirname(localPath);
    this.ensureDirectoryExists(dir);

    // ファイルを保存
    const writeStream = fs.createWriteStream(localPath);
    await pipeline(response.Body as NodeJS.ReadableStream, writeStream);
  }

  /**
   * S3へファイルをアップロード
   */
  private async uploadFile(localPath: string, s3Key: string): Promise<void> {
    const fileContent = fs.readFileSync(localPath);
    const filename = path.basename(localPath);
    const contentType = guessContentType(filename);

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
      Body: fileContent,
      ContentType: contentType,
    });

    await s3Client.send(command);
  }

  /**
   * ワークスペース内のファイルをスキャン
   */
  private async scanWorkspaceFiles(): Promise<Map<string, FileInfo>> {
    const files = new Map<string, FileInfo>();

    if (!fs.existsSync(this.workspaceDir)) {
      return files;
    }

    const scanDirectory = async (dir: string, baseDir: string): Promise<void> => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await scanDirectory(fullPath, baseDir);
        } else if (entry.isFile()) {
          const relativePath = path.relative(baseDir, fullPath);

          // Skip ignored files
          if (this.ignoreFilter.isIgnored(relativePath)) {
            continue;
          }

          const stats = fs.statSync(fullPath);
          const hash = await this.calculateFileHash(fullPath);

          files.set(relativePath, {
            path: relativePath,
            size: stats.size,
            mtime: stats.mtimeMs,
            hash,
          });
        }
      }
    };

    await scanDirectory(this.workspaceDir, this.workspaceDir);
    return files;
  }

  /**
   * ファイルのハッシュを計算
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * ディレクトリを再帰的に作成
   */
  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * S3プレフィックスを取得
   */
  private getS3Prefix(): string {
    const normalizedPath = this.storagePath.replace(/^\/+|\/+$/g, '');
    return normalizedPath ? `users/${this.userId}/${normalizedPath}/` : `users/${this.userId}/`;
  }

  /**
   * S3キーを取得
   */
  private getS3Key(relativePath: string): string {
    const prefix = this.getS3Prefix();
    return `${prefix}${relativePath}`;
  }
}
