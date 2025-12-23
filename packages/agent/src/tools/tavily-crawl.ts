/**
 * Tavily Crawl ツール - グラフベースのWebサイト探索
 */

import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { logger } from '../config/index.js';

/**
 * Tavily Crawl API のレスポンス型
 */
interface TavilyCrawlResponse {
  base_url: string;
  results: Array<{
    url: string;
    raw_content: string;
    images?: Array<{
      url: string;
      description?: string;
    }>;
    favicon?: string;
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
function truncateContent(content: string, maxLength: number = 2500): string {
  if (content.length <= maxLength) {
    return content;
  }

  const truncated = content.substring(0, maxLength);
  return `${truncated}... (内容が長すぎるため切り詰められました。元の長さ: ${content.length}文字)`;
}

/**
 * Tavily Crawl API を呼び出す
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callTavilyCrawlAPI(params: Record<string, any>): Promise<TavilyCrawlResponse> {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    throw new Error('TAVILY_API_KEY 環境変数が設定されていません');
  }

  const response = await fetch('https://api.tavily.com/crawl', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    let errorMessage = `Tavily Crawl API エラー: ${response.status} ${response.statusText}`;

    try {
      const errorData = (await response.json()) as TavilyError;
      errorMessage = `Tavily Crawl API エラー: ${errorData.error} - ${errorData.message}`;
    } catch {
      // JSON パースエラーの場合はデフォルトのエラーメッセージを使用
    }

    throw new Error(errorMessage);
  }

  const data = (await response.json()) as TavilyCrawlResponse;
  return data;
}

/**
 * クロール結果をフォーマット
 */
function formatCrawlResults(response: TavilyCrawlResponse): string {
  const { base_url, results, response_time, usage } = response;

  let output = `🕷️ Tavily Crawl 結果\n`;
  output += `ベースURL: ${base_url}\n`;
  output += `処理時間: ${response_time}秒\n`;
  output += `発見したページ数: ${results.length}件\n`;

  if (usage?.credits) {
    output += `使用クレジット: ${usage.credits}\n`;
  }

  output += `\n`;

  // クロール結果
  if (results.length > 0) {
    output += `📄 クロールされたページ:\n\n`;

    results.forEach((result, index) => {
      output += `${index + 1}. **${result.url}**\n`;
      output += `内容:\n${truncateContent(result.raw_content, 1500)}\n`;

      // 画像がある場合
      if (result.images && result.images.length > 0) {
        output += `🖼️ 画像 (${result.images.length}件):\n`;
        result.images.slice(0, 2).forEach((image, imgIndex) => {
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

  return output.trim();
}

/**
 * Tavily Crawl ツール
 */
export const tavilyCrawlTool = tool({
  name: 'tavily_crawl',
  description:
    'Tavily APIを使用してWebサイトを包括的にクロールします。指定されたルートURLから始まり、関連するページを自動的に発見・抽出します。',
  inputSchema: z.object({
    url: z.string().describe('クロール開始URL'),
    instructions: z
      .string()
      .optional()
      .describe('クロールの指示（自然言語）。指定すると使用コストが2倍になります'),
    maxDepth: z
      .number()
      .min(1)
      .max(5)
      .default(1)
      .describe('最大探索深度（1-5、ベースURLからどこまで離れるか）'),
    maxBreadth: z.number().min(1).default(20).describe('ページごとの最大リンク数（1以上）'),
    limit: z.number().min(1).default(50).describe('処理する最大リンク数（1以上）'),
    selectPaths: z
      .array(z.string())
      .optional()
      .describe('含めるパスの正規表現パターン（例: ["/docs/.*", "/api/v1.*"]）'),
    selectDomains: z
      .array(z.string())
      .optional()
      .describe('含めるドメインの正規表現パターン（例: ["^docs\\.example\\.com$"]）'),
    excludePaths: z
      .array(z.string())
      .optional()
      .describe('除外するパスの正規表現パターン（例: ["/private/.*", "/admin/.*"]）'),
    excludeDomains: z
      .array(z.string())
      .optional()
      .describe('除外するドメインの正規表現パターン（例: ["^private\\.example\\.com$"]）'),
    allowExternal: z.boolean().default(true).describe('外部ドメインリンクを結果に含めるかどうか'),
    extractDepth: z
      .enum(['basic', 'advanced'])
      .default('basic')
      .describe('抽出深度。basicは1クレジット/5抽出、advancedは2クレジット/5抽出'),
    format: z
      .enum(['markdown', 'text'])
      .default('markdown')
      .describe('出力フォーマット。markdownまたはtext'),
    includeImages: z.boolean().default(false).describe('画像情報を含めるかどうか'),
    chunksPerSource: z
      .number()
      .min(1)
      .max(5)
      .default(3)
      .describe('ソースあたりのチャンク数（1-5、instructionsが指定された場合のみ有効）'),
    timeout: z.number().min(10).max(150).default(150).describe('タイムアウト（秒、10-150）'),
  }),
  callback: async (input) => {
    const {
      url,
      instructions,
      maxDepth,
      maxBreadth,
      limit,
      selectPaths,
      selectDomains,
      excludePaths,
      excludeDomains,
      allowExternal,
      extractDepth,
      format,
      includeImages,
      chunksPerSource,
      timeout,
    } = input;

    logger.info(`🕷️ Tavilyクロール開始: ${url}`);

    try {
      // API パラメータの構築
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const apiParams: Record<string, any> = {
        url,
        max_depth: maxDepth,
        max_breadth: maxBreadth,
        limit,
        allow_external: allowExternal,
        extract_depth: extractDepth,
        format,
        include_images: includeImages,
        timeout,
      };

      // オプショナルパラメータの設定
      if (instructions) {
        apiParams.instructions = instructions;
        apiParams.chunks_per_source = chunksPerSource;
      }

      if (selectPaths && selectPaths.length > 0) {
        apiParams.select_paths = selectPaths;
      }

      if (selectDomains && selectDomains.length > 0) {
        apiParams.select_domains = selectDomains;
      }

      if (excludePaths && excludePaths.length > 0) {
        apiParams.exclude_paths = excludePaths;
      }

      if (excludeDomains && excludeDomains.length > 0) {
        apiParams.exclude_domains = excludeDomains;
      }

      // Tavily Crawl API 呼び出し
      const startTime = Date.now();
      const response = await callTavilyCrawlAPI(apiParams);
      const duration = Date.now() - startTime;

      // 結果のフォーマット
      const formattedResult = formatCrawlResults(response);

      logger.info(`✅ Tavilyクロール完了: ${response.results.length}ページ発見 (${duration}ms)`);

      return formattedResult;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`❌ Tavilyクロールエラー: ${url}`, errorMessage);

      return `❌ Tavilyクロールでエラーが発生しました
対象URL: ${url}
エラー: ${errorMessage}

問題の解決方法:
1. TAVILY_API_KEY 環境変数が正しく設定されているか確認
2. インターネット接続を確認
3. URLが有効かどうか確認
4. クロール設定（深度、制限数）が適切か確認
5. API使用量制限に達していないか確認`;
    }
  },
});
