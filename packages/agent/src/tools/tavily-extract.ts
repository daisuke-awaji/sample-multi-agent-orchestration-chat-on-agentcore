/**
 * Tavily Extract ツール - 指定URLからコンテンツを抽出
 */

import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { logger } from '../config/index.js';

/**
 * Tavily Extract API のレスポンス型
 */
interface TavilyExtractResponse {
  results: Array<{
    url: string;
    raw_content: string;
    images?: Array<{
      url: string;
      description?: string;
    }>;
    favicon?: string;
  }>;
  failed_results: Array<{
    url: string;
    reason: string;
  }>;
  response_time: number;
  usage?: {
    credits: number;
  };
  request_id?: string;
}

/**
 * Tavily API エラー型
 */
interface TavilyError {
  error: string;
  message: string;
  status?: number;
}

/**
 * コンテンツを安全なサイズに切り詰め
 */
function truncateContent(content: string, maxLength: number = 3000): string {
  if (content.length <= maxLength) {
    return content;
  }

  const truncated = content.substring(0, maxLength);
  return `${truncated}... (内容が長すぎるため切り詰められました。元の長さ: ${content.length}文字)`;
}

/**
 * Tavily Extract API を呼び出す
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callTavilyExtractAPI(params: Record<string, any>): Promise<TavilyExtractResponse> {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    throw new Error('TAVILY_API_KEY 環境変数が設定されていません');
  }

  const response = await fetch('https://api.tavily.com/extract', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    let errorMessage = `Tavily Extract API エラー: ${response.status} ${response.statusText}`;

    try {
      const errorData = (await response.json()) as TavilyError;
      errorMessage = `Tavily Extract API エラー: ${errorData.error} - ${errorData.message}`;
    } catch {
      // JSON パースエラーの場合はデフォルトのエラーメッセージを使用
    }

    throw new Error(errorMessage);
  }

  const data = (await response.json()) as TavilyExtractResponse;
  return data;
}

/**
 * 抽出結果をフォーマット
 */
function formatExtractResults(response: TavilyExtractResponse): string {
  const { results, failed_results, response_time, usage } = response;

  let output = `🔍 Tavily Extract 結果\n`;
  output += `処理時間: ${response_time}秒\n`;

  if (usage?.credits) {
    output += `使用クレジット: ${usage.credits}\n`;
  }

  output += `成功: ${results.length}件、失敗: ${failed_results.length}件\n\n`;

  // 成功した結果
  if (results.length > 0) {
    output += `📄 抽出されたコンテンツ:\n\n`;

    results.forEach((result, index) => {
      output += `${index + 1}. **${result.url}**\n`;
      output += `内容:\n${truncateContent(result.raw_content, 2000)}\n`;

      // 画像がある場合
      if (result.images && result.images.length > 0) {
        output += `🖼️ 画像 (${result.images.length}件):\n`;
        result.images.slice(0, 3).forEach((image, imgIndex) => {
          output += `  ${imgIndex + 1}. ${image.url}`;
          if (image.description) {
            output += ` - ${image.description}`;
          }
          output += `\n`;
        });
      }

      output += `\n`;
    });
  }

  // 失敗した結果
  if (failed_results.length > 0) {
    output += `❌ 抽出に失敗したURL:\n\n`;

    failed_results.forEach((failed, index) => {
      output += `${index + 1}. ${failed.url}\n`;
      output += `   理由: ${failed.reason}\n\n`;
    });
  }

  return output.trim();
}

/**
 * Tavily Extract ツール
 */
export const tavilyExtractTool = tool({
  name: 'tavily_extract',
  description:
    'Tavily APIを使用して指定されたURLからコンテンツを抽出します。Webページの内容を構造化されたテキストとして取得できます。',
  inputSchema: z.object({
    urls: z
      .union([z.string(), z.array(z.string())])
      .describe('抽出対象のURL（単一URLまたはURL配列）'),
    query: z
      .string()
      .optional()
      .describe('リランキング用クエリ。指定すると関連性の高いコンテンツが優先されます'),
    extractDepth: z
      .enum(['basic', 'advanced'])
      .default('basic')
      .describe('抽出深度。basicは1クレジット/5URL、advancedは2クレジット/5URL'),
    format: z
      .enum(['markdown', 'text'])
      .default('markdown')
      .describe('出力フォーマット。markdownまたはtext'),
    chunksPerSource: z
      .number()
      .min(1)
      .max(5)
      .default(3)
      .describe('ソースあたりのチャンク数（1-5、queryが指定された場合のみ有効）'),
    includeImages: z.boolean().default(false).describe('画像情報を含めるかどうか'),
    timeout: z.number().min(1).max(60).default(30).describe('タイムアウト（秒、1-60）'),
  }),
  callback: async (input) => {
    const { urls, query, extractDepth, format, chunksPerSource, includeImages, timeout } = input;

    // URLsを配列に変換
    const urlArray = Array.isArray(urls) ? urls : [urls];

    logger.info(`🔍 Tavily抽出開始: ${urlArray.length}件のURL`);

    try {
      // API パラメータの構築
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const apiParams: Record<string, any> = {
        urls: urlArray,
        extract_depth: extractDepth,
        format,
        include_images: includeImages,
        timeout,
      };

      // オプショナルパラメータの設定
      if (query) {
        apiParams.query = query;
        apiParams.chunks_per_source = chunksPerSource;
      }

      // Tavily Extract API 呼び出し
      const startTime = Date.now();
      const response = await callTavilyExtractAPI(apiParams);
      const duration = Date.now() - startTime;

      // 結果のフォーマット
      const formattedResult = formatExtractResults(response);

      logger.info(
        `✅ Tavily抽出完了: ${response.results.length}件成功, ${response.failed_results.length}件失敗 (${duration}ms)`
      );

      return formattedResult;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`❌ Tavily抽出エラー: ${urlArray.join(', ')}`, errorMessage);

      return `❌ Tavily抽出でエラーが発生しました
対象URL: ${urlArray.join(', ')}
エラー: ${errorMessage}

問題の解決方法:
1. TAVILY_API_KEY 環境変数が正しく設定されているか確認
2. インターネット接続を確認
3. URLが有効かどうか確認
4. API使用量制限に達していないか確認`;
    }
  },
});
