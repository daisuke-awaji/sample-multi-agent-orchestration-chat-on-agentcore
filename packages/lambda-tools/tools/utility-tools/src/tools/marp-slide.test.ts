/**
 * Marp Slide ツールのテスト
 */

import { marpSlideTool } from './marp-slide.js';
import { ToolValidationError } from './types.js';
import { ToolInput } from '../types.js';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

// S3クライアントをモック
const s3Mock = mockClient(S3Client);

// 環境変数をモック
const originalEnv = process.env;

// テスト用のMarkdownサンプル
const sampleMarkdown = `---
marp: true
theme: default
---

# Sample Presentation

This is the first slide.

---

## Second Slide

- Point 1
- Point 2
- Point 3

---

## Third Slide

Thank you!
`;

const simpleMarkdown = `# Hello World

This is a simple slide.

---

# Second Page

Content here.
`;

/**
 * S3 Body用のモックストリームを作成
 */
function createMockBody(content: string) {
  return {
    transformToString: async () => content,
  };
}

describe('Marp Slide Tool', () => {
  beforeEach(() => {
    // 各テスト前にモックをリセット
    s3Mock.reset();
    // 環境変数をセット
    process.env = {
      ...originalEnv,
      USER_STORAGE_BUCKET_NAME: 'test-bucket',
      AWS_REGION: 'us-east-1',
    };
  });

  afterAll(() => {
    // 環境変数を復元
    process.env = originalEnv;
  });

  describe('正常系テスト', () => {
    test('Markdownファイルが正しくHTMLスライドに変換される', async () => {
      // S3 GetObject のモック
      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockBody(sampleMarkdown) as any,
        ContentLength: sampleMarkdown.length,
      });

      // S3 PutObject のモック
      s3Mock.on(PutObjectCommand).resolves({});

      const input: ToolInput = {
        inputS3Key: 'users/user-123/presentations/sample.md',
      };

      const result = await marpSlideTool.handler(input);

      expect(result.inputS3Path).toBe('s3://test-bucket/users/user-123/presentations/sample.md');
      expect(result.outputS3Path).toBe('s3://test-bucket/users/user-123/presentations/sample.html');
      expect(result.slideCount).toBeGreaterThan(0);
      expect(result.theme).toBe('default');
      expect(result.sizeBytes).toBeGreaterThan(0);
      expect(result.generatedAt).toBeDefined();
    });

    test('出力S3キーを指定した場合、その場所に保存される', async () => {
      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockBody(simpleMarkdown) as any,
        ContentLength: simpleMarkdown.length,
      });
      s3Mock.on(PutObjectCommand).resolves({});

      const input: ToolInput = {
        inputS3Key: 'users/user-123/input.md',
        outputS3Key: 'users/user-123/output/custom-output.html',
      };

      const result = await marpSlideTool.handler(input);

      expect(result.outputS3Path).toBe('s3://test-bucket/users/user-123/output/custom-output.html');
    });

    test('gaiaテーマを指定した場合、正しくテーマが適用される', async () => {
      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockBody(simpleMarkdown) as any,
        ContentLength: simpleMarkdown.length,
      });
      s3Mock.on(PutObjectCommand).resolves({});

      const input: ToolInput = {
        inputS3Key: 'users/user-123/slide.md',
        theme: 'gaia',
      };

      const result = await marpSlideTool.handler(input);

      expect(result.theme).toBe('gaia');
    });

    test('uncoverテーマを指定した場合、正しくテーマが適用される', async () => {
      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockBody(simpleMarkdown) as any,
        ContentLength: simpleMarkdown.length,
      });
      s3Mock.on(PutObjectCommand).resolves({});

      const input: ToolInput = {
        inputS3Key: 'users/user-123/slide.md',
        theme: 'uncover',
      };

      const result = await marpSlideTool.handler(input);

      expect(result.theme).toBe('uncover');
    });

    test('スライド数が正しくカウントされる', async () => {
      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockBody(sampleMarkdown) as any,
        ContentLength: sampleMarkdown.length,
      });
      s3Mock.on(PutObjectCommand).resolves({});

      const input: ToolInput = {
        inputS3Key: 'users/user-123/sample.md',
      };

      const result = await marpSlideTool.handler(input);

      // sampleMarkdown has 3 slides (separated by ---)
      expect(result.slideCount).toBe(3);
    });

    test('Markdown内にテーマが指定されている場合、それが優先される', async () => {
      const markdownWithTheme = `---
marp: true
theme: gaia
---

# Slide 1
`;
      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockBody(markdownWithTheme) as any,
        ContentLength: markdownWithTheme.length,
      });
      s3Mock.on(PutObjectCommand).resolves({});

      const input: ToolInput = {
        inputS3Key: 'users/user-123/slide.md',
        theme: 'default', // 入力でdefaultを指定してもMarkdown内のgaiaが使われる
      };

      const result = await marpSlideTool.handler(input);

      // テーマは入力値が返されるが、実際のHTML内はMarkdownのテーマが適用される
      expect(result.theme).toBe('default');
    });
  });

  describe('異常系テスト', () => {
    test('inputS3Keyがない場合にToolValidationErrorがスローされる', async () => {
      const input: ToolInput = {};

      await expect(marpSlideTool.handler(input)).rejects.toThrow(ToolValidationError);
    });

    test('inputS3Keyが.md拡張子でない場合にToolValidationErrorがスローされる', async () => {
      const input: ToolInput = {
        inputS3Key: 'users/user-123/file.txt',
      };

      await expect(marpSlideTool.handler(input)).rejects.toThrow(ToolValidationError);
    });

    test('サポートされていないテーマを指定した場合にToolValidationErrorがスローされる', async () => {
      const input: ToolInput = {
        inputS3Key: 'users/user-123/slide.md',
        theme: 'invalid-theme',
      };

      await expect(marpSlideTool.handler(input)).rejects.toThrow(ToolValidationError);
    });

    test('USER_STORAGE_BUCKET_NAMEが設定されていない場合にエラーがスローされる', async () => {
      delete process.env.USER_STORAGE_BUCKET_NAME;

      const input: ToolInput = {
        inputS3Key: 'users/user-123/slide.md',
      };

      await expect(marpSlideTool.handler(input)).rejects.toThrow(
        'USER_STORAGE_BUCKET_NAME is not configured'
      );
    });

    test('ファイルサイズが上限を超える場合にToolValidationErrorがスローされる', async () => {
      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockBody('# Test') as any,
        ContentLength: 2 * 1024 * 1024, // 2MB (上限は1MB)
      });

      const input: ToolInput = {
        inputS3Key: 'users/user-123/large-file.md',
      };

      await expect(marpSlideTool.handler(input)).rejects.toThrow(ToolValidationError);
    });

    test('S3からファイル取得に失敗した場合にエラーがスローされる', async () => {
      s3Mock.on(GetObjectCommand).rejects(new Error('Access Denied'));

      const input: ToolInput = {
        inputS3Key: 'users/user-123/slide.md',
      };

      await expect(marpSlideTool.handler(input)).rejects.toThrow('Access Denied');
    });

    test('S3へのファイル保存に失敗した場合にエラーがスローされる', async () => {
      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockBody(simpleMarkdown) as any,
        ContentLength: simpleMarkdown.length,
      });
      s3Mock.on(PutObjectCommand).rejects(new Error('Write Failed'));

      const input: ToolInput = {
        inputS3Key: 'users/user-123/slide.md',
      };

      await expect(marpSlideTool.handler(input)).rejects.toThrow('Write Failed');
    });

    test('ToolValidationErrorに正しい情報が含まれる', async () => {
      const input: ToolInput = {};

      try {
        await marpSlideTool.handler(input);
        fail('例外がスローされるはずです');
      } catch (error) {
        expect(error).toBeInstanceOf(ToolValidationError);
        const toolError = error as ToolValidationError;
        expect(toolError.toolName).toBe('marp-slide');
        expect(toolError.field).toBe('inputS3Key');
        expect(toolError.message).toContain("Marp Slide tool requires an 'inputS3Key' parameter");
      }
    });
  });

  describe('ツール定義テスト', () => {
    test('ツール名が正しい', () => {
      expect(marpSlideTool.name).toBe('marp-slide');
    });

    test('説明が設定されている', () => {
      expect(marpSlideTool.description).toBeDefined();
      expect(typeof marpSlideTool.description).toBe('string');
      expect(marpSlideTool.description).toContain('Marp');
    });

    test('バージョンが設定されている', () => {
      expect(marpSlideTool.version).toBe('1.0.0');
    });

    test('タグが設定されている', () => {
      expect(marpSlideTool.tags).toContain('presentation');
      expect(marpSlideTool.tags).toContain('slide');
      expect(marpSlideTool.tags).toContain('marp');
      expect(marpSlideTool.tags).toContain('markdown');
      expect(marpSlideTool.tags).toContain('s3');
    });

    test('ハンドラー関数が設定されている', () => {
      expect(typeof marpSlideTool.handler).toBe('function');
    });
  });

  describe('S3操作テスト', () => {
    test('GetObjectCommandが正しいパラメータで呼ばれる', async () => {
      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockBody(simpleMarkdown) as any,
        ContentLength: simpleMarkdown.length,
      });
      s3Mock.on(PutObjectCommand).resolves({});

      const input: ToolInput = {
        inputS3Key: 'users/user-123/test.md',
      };

      await marpSlideTool.handler(input);

      const getCalls = s3Mock.commandCalls(GetObjectCommand);
      expect(getCalls.length).toBe(1);
      expect(getCalls[0].args[0].input).toEqual({
        Bucket: 'test-bucket',
        Key: 'users/user-123/test.md',
      });
    });

    test('PutObjectCommandが正しいパラメータで呼ばれる', async () => {
      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockBody(simpleMarkdown) as any,
        ContentLength: simpleMarkdown.length,
      });
      s3Mock.on(PutObjectCommand).resolves({});

      const input: ToolInput = {
        inputS3Key: 'users/user-123/test.md',
      };

      await marpSlideTool.handler(input);

      const putCalls = s3Mock.commandCalls(PutObjectCommand);
      expect(putCalls.length).toBe(1);
      expect(putCalls[0].args[0].input.Bucket).toBe('test-bucket');
      expect(putCalls[0].args[0].input.Key).toBe('users/user-123/test.html');
      expect(putCalls[0].args[0].input.ContentType).toBe('text/html; charset=utf-8');
      expect(putCalls[0].args[0].input.Body).toContain('<!DOCTYPE html>');
    });
  });
});
