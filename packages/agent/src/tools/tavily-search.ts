/**
 * Tavily Search ツール - 高品質なWeb検索を実行
 */

import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { logger } from '../config/index.js';

/**
 * Tavily API のレスポンス型
 */
interface TavilySearchResponse {
  query: string;
  answer?: string;
  images: Array<{
    url: string;
    description?: string;
  }>;
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
    raw_content?: string;
    favicon?: string;
  }>;
  response_time: string;
  auto_parameters?: {
    topic: string;
    search_depth: string;
  };
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
 * 検索結果の安全なサイズ制限
 */
function truncateContent(content: string, maxLength: number = 2000): string {
  if (content.length <= maxLength) {
    return content;
  }

  const truncated = content.substring(0, maxLength);
  return `${truncated}... (内容が長すぎるため切り詰められました。元の長さ: ${content.length}文字)`;
}

/**
 * Tavily API を呼び出す
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callTavilyAPI(params: Record<string, any>): Promise<TavilySearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    throw new Error('TAVILY_API_KEY 環境変数が設定されていません');
  }

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    let errorMessage = `Tavily API エラー: ${response.status} ${response.statusText}`;

    try {
      const errorData = (await response.json()) as TavilyError;
      errorMessage = `Tavily API エラー: ${errorData.error} - ${errorData.message}`;
    } catch {
      // JSON パースエラーの場合はデフォルトのエラーメッセージを使用
    }

    throw new Error(errorMessage);
  }

  const data = (await response.json()) as TavilySearchResponse;
  return data;
}

/**
 * 検索結果をフォーマット
 */
function formatSearchResults(response: TavilySearchResponse): string {
  const { query, answer, results, response_time, usage } = response;

  let output = `🔍 Tavily Search 結果\n`;
  output += `検索クエリ: ${query}\n`;
  output += `実行時間: ${response_time}秒\n`;

  if (usage?.credits) {
    output += `使用クレジット: ${usage.credits}\n`;
  }

  output += `\n`;

  // LLM生成の回答がある場合
  if (answer) {
    output += `📝 AI要約回答:\n${truncateContent(answer, 1500)}\n\n`;
  }

  // 検索結果
  output += `📋 検索結果 (${results.length}件):\n\n`;

  results.forEach((result, index) => {
    output += `${index + 1}. **${result.title}**\n`;
    output += `   URL: ${result.url}\n`;
    output += `   関連度: ${(result.score * 100).toFixed(1)}%\n`;
    output += `   内容: ${truncateContent(result.content, 800)}\n\n`;
  });

  // 画像結果がある場合
  if (response.images && response.images.length > 0) {
    output += `🖼️ 関連画像 (${response.images.length}件):\n`;
    response.images.forEach((image, index) => {
      output += `${index + 1}. ${image.url}\n`;
      if (image.description) {
        output += `   説明: ${image.description}\n`;
      }
    });
    output += `\n`;
  }

  return output.trim();
}

/**
 * Tavily Search ツール
 */
export const tavilySearchTool = tool({
  name: 'tavily_search',
  description:
    'Tavily APIを使用して高品質なWeb検索を実行します。最新の情報、ニュース、一般的な話題について包括的な検索結果を取得できます。',
  inputSchema: z.object({
    query: z.string().describe('検索クエリ（必須）'),
    searchDepth: z
      .enum(['basic', 'advanced'])
      .default('basic')
      .describe('検索深度。basicは1クレジット、advancedは2クレジット使用'),
    topic: z
      .enum(['general', 'news', 'finance'])
      .default('general')
      .describe('検索カテゴリ。newsは最新情報、generalは一般検索'),
    maxResults: z.number().min(1).max(20).default(5).describe('取得する最大検索結果数（1-20）'),
    includeAnswer: z.boolean().default(true).describe('LLM生成の要約回答を含める'),
    timeRange: z
      .enum(['day', 'week', 'month', 'year', 'd', 'w', 'm', 'y'])
      .optional()
      .describe('時間範囲フィルター（過去の期間で絞り込み）'),
    includeDomains: z.array(z.string()).optional().describe('検索対象に含めるドメインのリスト'),
    excludeDomains: z.array(z.string()).optional().describe('検索対象から除外するドメインのリスト'),
    includeImages: z.boolean().default(false).describe('関連画像も取得する'),
    country: z.string().optional().describe('特定の国の結果を優先（例: japan, united states）'),
  }),
  callback: async (input) => {
    const {
      query,
      searchDepth,
      topic,
      maxResults,
      includeAnswer,
      timeRange,
      includeDomains,
      excludeDomains,
      includeImages,
      country,
    } = input;

    logger.info(`🔍 Tavily検索開始: ${query}`);

    try {
      // API パラメータの構築
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const apiParams: Record<string, any> = {
        query,
        search_depth: searchDepth,
        topic,
        max_results: maxResults,
        include_answer: includeAnswer,
        include_images: includeImages,
        include_favicon: true, // ファビコンも含める
      };

      // オプショナルパラメータの設定
      if (timeRange) {
        apiParams.time_range = timeRange;
      }

      if (includeDomains && includeDomains.length > 0) {
        apiParams.include_domains = includeDomains;
      }

      if (excludeDomains && excludeDomains.length > 0) {
        apiParams.exclude_domains = excludeDomains;
      }

      if (country && topic === 'general') {
        // country パラメータは general topic でのみ利用可能
        apiParams.country = country;
      }

      // Tavily API 呼び出し
      const startTime = Date.now();
      const response = await callTavilyAPI(apiParams);
      const duration = Date.now() - startTime;

      // 結果のフォーマット
      const formattedResult = formatSearchResults(response);

      logger.info(
        `✅ Tavily検索完了: ${query} (${duration}ms, ${response.results.length}件の結果)`
      );

      return formattedResult;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`❌ Tavily検索エラー: ${query}`, errorMessage);

      return `❌ Tavily検索でエラーが発生しました
検索クエリ: ${query}
エラー: ${errorMessage}

問題の解決方法:
1. TAVILY_API_KEY 環境変数が正しく設定されているか確認
2. インターネット接続を確認
3. 検索クエリが適切かどうか確認
4. API使用量制限に達していないか確認`;
    }
  },
});
