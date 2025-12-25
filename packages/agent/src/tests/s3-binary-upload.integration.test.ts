/**
 * S3バイナリファイルアップロード インテグレーションテスト
 */

import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { s3UploadFileTool } from '../tools/s3-upload-file.js';
import { runWithContext, createRequestContext } from '../context/request-context.js';

// テスト用の定数
const TEST_USER_ID = '04685458-c001-70d7-b25e-6d575ca4d2b6';
const TEST_DIR = '/tmp/s3-upload-test';

/**
 * テストファイルのメタデータ
 */
interface TestFile {
  name: string;
  content: Buffer;
  contentType: string;
  size: number;
}

/**
 * バイト列を16進数で表示
 */
function bytesToHex(buffer: Buffer): string {
  return buffer.toString('hex').match(/.{2}/g)?.slice(0, 20).join(' ') || '';
}

/**
 * ファイルサイズを人間が読める形式に変換
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

describe('S3 Binary File Upload Integration Test', () => {
  let s3Client: S3Client;
  let bucketName: string;
  let region: string;
  const testFiles: TestFile[] = [];

  beforeAll(async () => {
    // 環境変数から設定を取得
    bucketName = process.env.USER_STORAGE_BUCKET_NAME || '';
    region = process.env.AWS_REGION || 'us-east-1';

    if (!bucketName) {
      console.warn(
        '⚠️  USER_STORAGE_BUCKET_NAME環境変数が設定されていません。テストをスキップします。'
      );
      return;
    }

    s3Client = new S3Client({ region });

    // テストディレクトリを作成
    await mkdir(TEST_DIR, { recursive: true });

    // テストファイルを準備
    // 1. 小さなPNG画像（1x1 透明ピクセル）
    const pngData = Buffer.from(
      '89504e470d0a1a0a0000000d494844520000000100000001080600000' +
        '01f15c4890000000a49444154789c6300010000050001d0a2db4e00' +
        '00000049454e44ae426082',
      'hex'
    );
    testFiles.push({
      name: 'test-image.png',
      content: pngData,
      contentType: 'image/png',
      size: pngData.length,
    });

    // 2. テキストファイル（UTF-8）
    const textData = Buffer.from('Hello World\nこんにちは世界\n', 'utf-8');
    testFiles.push({
      name: 'test-text.txt',
      content: textData,
      contentType: 'text/plain',
      size: textData.length,
    });

    // 3. JSONファイル
    const jsonData = Buffer.from(JSON.stringify({ test: 'data', 日本語: '値' }, null, 2), 'utf-8');
    testFiles.push({
      name: 'test-data.json',
      content: jsonData,
      contentType: 'application/json',
      size: jsonData.length,
    });

    // ファイルをディスクに書き込み
    for (const file of testFiles) {
      await writeFile(join(TEST_DIR, file.name), file.content);
    }

    console.log('\n📝 テスト情報:');
    console.log(`  バケット: ${bucketName}`);
    console.log(`  リージョン: ${region}`);
    console.log(`  テストディレクトリ: ${TEST_DIR}`);
    console.log(`  テストファイル数: ${testFiles.length}`);

    for (const file of testFiles) {
      console.log(
        `    - ${file.name}: ${formatFileSize(file.size)}, ${file.contentType}, hex: ${bytesToHex(file.content)}`
      );
    }
  });

  afterAll(async () => {
    // テストディレクトリをクリーンアップ
    try {
      await rm(TEST_DIR, { recursive: true, force: true });
      console.log('\n🧹 テストディレクトリをクリーンアップしました');
    } catch (error) {
      console.warn('⚠️  クリーンアップに失敗:', error);
    }
  });

  describe('sourceFile parameter support', () => {
    test('should upload PNG image file from local path', async () => {
      if (!bucketName) {
        console.log('⚠️  バケット名が未設定のためスキップ');
        return;
      }

      const testFile = testFiles[0]; // PNG image
      const localPath = join(TEST_DIR, testFile.name);
      const s3Path = `/test-uploads/${testFile.name}`;

      console.log(`\n📤 アップロード開始: ${testFile.name}`);

      // リクエストコンテキストでツールを実行
      const context = createRequestContext();
      context.userId = TEST_USER_ID;
      context.storagePath = '/';

      const result = await runWithContext(context, async () => {
        // Access the internal _callback property
        const toolCallback = (s3UploadFileTool as any)._callback;
        return await toolCallback({
          path: s3Path,
          sourceFile: localPath,
        });
      });

      console.log('📨 結果:', result);

      // 結果を検証
      expect(result).toContain('File uploaded to S3 successfully');
      expect(result).toContain(s3Path);
      expect(result).toContain(testFile.name);
      expect(result).toContain('image/png');

      // S3から直接検証
      const s3Key = `users/${TEST_USER_ID}${s3Path}`;
      const headCommand = new HeadObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
      });

      const metadata = await s3Client.send(headCommand);
      expect(metadata.ContentLength).toBe(testFile.size);
      expect(metadata.ContentType).toBe('image/png');

      console.log('✅ S3検証成功');
    });

    test('should upload text file with Japanese content', async () => {
      if (!bucketName) {
        console.log('⚠️  バケット名が未設定のためスキップ');
        return;
      }

      const testFile = testFiles[1]; // Text file
      const localPath = join(TEST_DIR, testFile.name);
      const s3Path = `/test-uploads/${testFile.name}`;

      console.log(`\n📤 アップロード開始: ${testFile.name}`);

      // リクエストコンテキストでツールを実行
      const context = createRequestContext();
      context.userId = TEST_USER_ID;
      context.storagePath = '/';

      const result = await runWithContext(context, async () => {
        const toolCallback = (s3UploadFileTool as any)._callback;
        return await toolCallback({
          path: s3Path,
          sourceFile: localPath,
        });
      });

      console.log('📨 結果:', result);

      expect(result).toContain('File uploaded to S3 successfully');

      // S3から内容を取得して検証
      const s3Key = `users/${TEST_USER_ID}${s3Path}`;
      const getCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
      });

      const response = await s3Client.send(getCommand);
      const content = await response.Body!.transformToString('utf-8');

      expect(content).toContain('Hello World');
      expect(content).toContain('こんにちは世界');

      console.log('✅ 内容検証成功:', content);
    });

    test('should support file:// protocol', async () => {
      if (!bucketName) {
        console.log('⚠️  バケット名が未設定のためスキップ');
        return;
      }

      const testFile = testFiles[2]; // JSON file
      const localPath = join(TEST_DIR, testFile.name);
      const fileUrl = `file://${localPath}`;
      const s3Path = `/test-uploads/${testFile.name}`;

      console.log(`\n📤 file://プロトコルでアップロード: ${testFile.name}`);

      // リクエストコンテキストでツールを実行
      const context = createRequestContext();
      context.userId = TEST_USER_ID;
      context.storagePath = '/';

      const result = await runWithContext(context, async () => {
        const toolCallback = (s3UploadFileTool as any)._callback;
        return await toolCallback({
          path: s3Path,
          sourceFile: fileUrl,
        });
      });

      console.log('📨 結果:', result);

      expect(result).toContain('File uploaded to S3 successfully');

      // S3から取得して内容を検証
      const s3Key = `users/${TEST_USER_ID}${s3Path}`;
      const getCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
      });

      const response = await s3Client.send(getCommand);
      const content = await response.Body!.transformToString('utf-8');
      const parsedJson = JSON.parse(content);

      expect(parsedJson).toHaveProperty('test', 'data');
      expect(parsedJson).toHaveProperty('日本語', '値');

      console.log('✅ JSON内容検証成功');
    });

    test('should auto-detect content type from file extension', async () => {
      if (!bucketName) {
        console.log('⚠️  バケット名が未設定のためスキップ');
        return;
      }

      const testFile = testFiles[0]; // PNG image
      const localPath = join(TEST_DIR, testFile.name);
      const s3Path = `/test-uploads/auto-detect-${testFile.name}`;

      // リクエストコンテキストでツールを実行
      const context = createRequestContext();
      context.userId = TEST_USER_ID;
      context.storagePath = '/';

      const result = await runWithContext(context, async () => {
        const toolCallback = (s3UploadFileTool as any)._callback;
        return await toolCallback({
          path: s3Path,
          sourceFile: localPath,
          // contentTypeを指定しない
        });
      });

      expect(result).toContain('image/png'); // 自動検出されることを確認

      // S3のメタデータを確認
      const s3Key = `users/${TEST_USER_ID}${s3Path}`;
      const headCommand = new HeadObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
      });

      const metadata = await s3Client.send(headCommand);
      expect(metadata.ContentType).toBe('image/png');

      console.log('✅ Content-Type自動検出成功');
    });
  });

  describe('Error handling', () => {
    test('should handle non-existent file', async () => {
      if (!bucketName) {
        console.log('⚠️  バケット名が未設定のためスキップ');
        return;
      }

      // リクエストコンテキストでツールを実行
      const context = createRequestContext();
      context.userId = TEST_USER_ID;
      context.storagePath = '/';

      const result = await runWithContext(context, async () => {
        const toolCallback = (s3UploadFileTool as any)._callback;
        return await toolCallback({
          path: '/test/non-existent.txt',
          sourceFile: '/tmp/this-file-does-not-exist.txt',
        });
      });

      expect(result).toContain('Failed to read local file');
      expect(result).toContain('File does not exist');

      console.log('✅ 存在しないファイルのエラーハンドリング成功');
    });

    test('should require either content or sourceFile', async () => {
      if (!bucketName) {
        console.log('⚠️  バケット名が未設定のためスキップ');
        return;
      }

      // Zodスキーマの検証により、このケースは事前にエラーになる
      // ツールの実装レベルでのテスト
      const context = createRequestContext();
      context.userId = TEST_USER_ID;
      context.storagePath = '/';

      const result = await runWithContext(context, async () => {
        const toolCallback = (s3UploadFileTool as any)._callback;
        return await toolCallback({
          path: '/test/empty.txt',
          content: undefined,
          sourceFile: undefined,
        } as any);
      });

      expect(result).toContain('Either content or sourceFile must be provided');

      console.log('✅ パラメータ必須チェック成功');
    });
  });

  describe('Backward compatibility', () => {
    test('should still support text content upload', async () => {
      if (!bucketName) {
        console.log('⚠️  バケット名が未設定のためスキップ');
        return;
      }

      const textContent = 'This is a test content\nこれはテストです';
      const s3Path = '/test-uploads/text-content.txt';

      console.log('\n📤 テキストコンテンツでアップロード');

      // リクエストコンテキストでツールを実行
      const context = createRequestContext();
      context.userId = TEST_USER_ID;
      context.storagePath = '/';

      const result = await runWithContext(context, async () => {
        const toolCallback = (s3UploadFileTool as any)._callback;
        return await toolCallback({
          path: s3Path,
          content: textContent,
        });
      });

      console.log('📨 結果:', result);

      expect(result).toContain('File uploaded to S3 successfully');
      expect(result).toContain('text content');

      // S3から取得して検証
      const s3Key = `users/${TEST_USER_ID}${s3Path}`;
      const getCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
      });

      const response = await s3Client.send(getCommand);
      const content = await response.Body!.transformToString('utf-8');

      expect(content).toBe(textContent);

      console.log('✅ 後方互換性確認成功');
    });
  });
});
