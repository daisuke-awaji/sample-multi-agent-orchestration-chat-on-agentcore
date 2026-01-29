/**
 * Marp Slide ツール実装
 *
 * S3上のMarp形式MarkdownファイルからHTMLスライドを生成し、S3に保存するツール
 */

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Marp } from '@marp-team/marp-core';
import { ToolInput, ToolResult } from '../types.js';
import { Tool, ToolValidationError } from './types.js';
import { logger } from '../logger.js';

/**
 * Marp Slide ツールの入力型
 */
interface MarpSlideInput extends ToolInput {
  inputS3Key?: string;
  outputS3Key?: string;
  theme?: 'default' | 'gaia' | 'uncover';
}

/**
 * Marp Slide ツールの出力型
 */
interface MarpSlideResult extends ToolResult {
  inputS3Path: string;
  outputS3Path: string;
  slideCount: number;
  theme: string;
  sizeBytes: number;
  generatedAt: string;
}

/**
 * S3クライアントのインスタンス
 */
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

/**
 * サポートされているテーマ
 */
const SUPPORTED_THEMES = ['default', 'gaia', 'uncover'] as const;

/**
 * 入力ファイルの最大サイズ (1MB)
 */
const MAX_INPUT_SIZE_BYTES = 1024 * 1024;

/**
 * Marp Slide ツールのメイン処理
 *
 * @param input 入力データ
 * @returns Marp Slideの実行結果
 */
async function handleMarpSlide(input: ToolInput): Promise<MarpSlideResult> {
  const marpInput = input as MarpSlideInput;

  // 入力検証
  if (!marpInput.inputS3Key) {
    throw new ToolValidationError(
      "Marp Slide tool requires an 'inputS3Key' parameter",
      'marp-slide',
      'inputS3Key'
    );
  }

  const bucketName = process.env.USER_STORAGE_BUCKET_NAME;

  if (!bucketName) {
    throw new Error('USER_STORAGE_BUCKET_NAME is not configured');
  }

  const inputS3Key = marpInput.inputS3Key;
  const theme = marpInput.theme || 'default';

  // テーマの検証
  if (!SUPPORTED_THEMES.includes(theme as (typeof SUPPORTED_THEMES)[number])) {
    throw new ToolValidationError(
      `Invalid theme '${theme}'. Supported themes: ${SUPPORTED_THEMES.join(', ')}`,
      'marp-slide',
      'theme'
    );
  }

  // 入力キーの検証（.md拡張子のみ許可）
  if (!inputS3Key.toLowerCase().endsWith('.md')) {
    throw new ToolValidationError(
      "Input file must be a Markdown file with '.md' extension",
      'marp-slide',
      'inputS3Key'
    );
  }

  logger.info('MARP_SLIDE_START', {
    inputS3Key,
    theme,
    bucketName,
  });

  try {
    // 1. S3から入力Markdownを取得
    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: inputS3Key,
    });

    const getResponse = await s3Client.send(getCommand);

    // Content-Lengthチェック
    if (getResponse.ContentLength && getResponse.ContentLength > MAX_INPUT_SIZE_BYTES) {
      throw new ToolValidationError(
        `Input file exceeds maximum size of ${MAX_INPUT_SIZE_BYTES / 1024 / 1024}MB`,
        'marp-slide',
        'inputS3Key'
      );
    }

    const markdown = await getResponse.Body?.transformToString();

    if (!markdown) {
      throw new Error('Failed to read markdown content from S3');
    }

    logger.debug('MARP_SLIDE_INPUT_READ', {
      inputS3Key,
      contentLength: markdown.length,
    });

    // 2. Marp変換
    const marp = new Marp({
      html: true,
      emoji: {
        shortcode: true,
        unicode: true,
      },
      math: false,
    });

    // テーマを適用（front-matterで指定がない場合）
    const markdownWithTheme = markdown.includes('theme:')
      ? markdown
      : `---\nmarp: true\ntheme: ${theme}\n---\n\n${markdown}`;

    const { html, css } = marp.render(markdownWithTheme);

    // 3. 完全なHTMLドキュメントを生成
    const title = extractTitle(markdown) || 'Presentation';
    const fullHtml = generateFullHtml(title, css, html);

    // 4. スライド数をカウント
    const slideCount = countSlides(markdown);

    // 5. 出力キーを決定
    const outputS3Key = marpInput.outputS3Key || inputS3Key.replace(/\.md$/i, '.html');

    // 6. S3へ出力HTMLを保存
    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: outputS3Key,
      Body: fullHtml,
      ContentType: 'text/html; charset=utf-8',
      CacheControl: 'max-age=3600',
    });

    await s3Client.send(putCommand);

    const sizeBytes = Buffer.byteLength(fullHtml, 'utf8');
    const generatedAt = new Date().toISOString();

    logger.info('MARP_SLIDE_SUCCESS', {
      inputS3Key,
      outputS3Key,
      slideCount,
      theme,
      sizeBytes,
      generatedAt,
    });

    // 結果を生成
    const result: MarpSlideResult = {
      inputS3Path: `s3://${bucketName}/${inputS3Key}`,
      outputS3Path: `s3://${bucketName}/${outputS3Key}`,
      slideCount,
      theme,
      sizeBytes,
      generatedAt,
    };

    return result;
  } catch (error) {
    logger.error('MARP_SLIDE_ERROR', {
      inputS3Key,
      theme,
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : 'Unknown',
    });

    throw error;
  }
}

/**
 * MarkdownからタイトルをTitle: またはH1から抽出する
 *
 * @param markdown Markdownテキスト
 * @returns 抽出されたタイトル、または undefined
 */
function extractTitle(markdown: string): string | undefined {
  // front-matter内のtitleを検索
  const titleMatch = markdown.match(/^title:\s*(.+)$/m);
  if (titleMatch) {
    return titleMatch[1].trim();
  }

  // 最初のH1を検索
  const h1Match = markdown.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }

  return undefined;
}

/**
 * Markdownからスライド数をカウントする
 *
 * @param markdown Markdownテキスト
 * @returns スライド数
 */
function countSlides(markdown: string): number {
  // front-matterの終了後から数える
  const contentStart = markdown.indexOf('---', 3);
  const content = contentStart > 0 ? markdown.substring(contentStart + 3) : markdown;

  // `---`で区切られたスライド数をカウント（最初のスライド + 区切り数）
  const separators = (content.match(/^---$/gm) || []).length;
  return separators + 1;
}

/**
 * 完全なHTMLドキュメントを生成する
 *
 * @param title ページタイトル
 * @param css Marpが生成したCSS
 * @param html Marpが生成したHTML
 * @returns 完全なHTMLドキュメント
 */
function generateFullHtml(title: string, css: string, html: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="Marp">
  <title>${escapeHtml(title)}</title>
  <style>
    ${css}
  </style>
</head>
<body>
  ${html}
</body>
</html>`;
}

/**
 * HTMLエスケープ
 *
 * @param text エスケープするテキスト
 * @returns エスケープされたテキスト
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Marp Slide ツールの定義
 */
export const marpSlideTool: Tool = {
  name: 'marp-slide',
  handler: handleMarpSlide,
  description:
    'Generate presentation HTML slides from Marp-formatted Markdown file in S3 and save to S3',
  version: '1.0.0',
  tags: ['presentation', 'slide', 'marp', 'markdown', 's3'],
};

export default marpSlideTool;
