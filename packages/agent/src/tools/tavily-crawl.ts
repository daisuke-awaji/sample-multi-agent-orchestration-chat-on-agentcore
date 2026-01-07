/**
 * Tavily Crawl Tool - Graph-based website exploration
 */

import { tool } from '@strands-agents/sdk';
import { tavilyCrawlDefinition } from '@fullstack-agentcore/tool-definitions';
import { logger } from '../config/index.js';
import { getTavilyApiKey } from './tavily-common.js';

/**
 * Tavily Crawl API response type
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
 * Tavily API error type
 */
interface TavilyError {
  error: string;
  message: string;
  status?: number;
}

/**
 * Truncate content to safe size
 */
function truncateContent(content: string, maxLength: number = 2500): string {
  if (content.length <= maxLength) {
    return content;
  }

  const truncated = content.substring(0, maxLength);
  return `${truncated}... (Content truncated due to length. Original length: ${content.length} characters)`;
}

/**
 * Call Tavily Crawl API
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callTavilyCrawlAPI(params: Record<string, any>): Promise<TavilyCrawlResponse> {
  const apiKey = await getTavilyApiKey();

  const response = await fetch('https://api.tavily.com/crawl', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    let errorMessage = `Tavily Crawl API error: ${response.status} ${response.statusText}`;

    try {
      const errorData = (await response.json()) as TavilyError;
      errorMessage = `Tavily Crawl API error: ${errorData.error} - ${errorData.message}`;
    } catch {
      // Use default error message for JSON parse errors
    }

    throw new Error(errorMessage);
  }

  const data = (await response.json()) as TavilyCrawlResponse;
  return data;
}

/**
 * Format crawl results
 */
function formatCrawlResults(response: TavilyCrawlResponse): string {
  const { base_url, results, response_time, usage } = response;

  let output = `🕷️ Tavily Crawl Results\n`;
  output += `Base URL: ${base_url}\n`;
  output += `Processing Time: ${response_time}s\n`;
  output += `Pages Discovered: ${results.length} items\n`;

  if (usage?.credits) {
    output += `Credits Used: ${usage.credits}\n`;
  }

  output += `\n`;

  // Crawl results
  if (results.length > 0) {
    output += `📄 Crawled Pages:\n\n`;

    results.forEach((result, index) => {
      output += `${index + 1}. **${result.url}**\n`;
      output += `Content:\n${truncateContent(result.raw_content, 1500)}\n`;

      // If images exist
      if (result.images && result.images.length > 0) {
        output += `🖼️ Images (${result.images.length} items):\n`;
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
 * Tavily Crawl Tool
 */
export const tavilyCrawlTool = tool({
  name: tavilyCrawlDefinition.name,
  description: tavilyCrawlDefinition.description,
  inputSchema: tavilyCrawlDefinition.zodSchema,
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

    logger.info(`🕷️ Tavily crawl started: ${url}`);

    try {
      // Build API parameters
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

      // Set optional parameters
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

      // Call Tavily Crawl API
      const startTime = Date.now();
      const response = await callTavilyCrawlAPI(apiParams);
      const duration = Date.now() - startTime;

      // Format results
      const formattedResult = formatCrawlResults(response);

      logger.info(
        `✅ Tavily crawl completed: ${response.results.length} pages discovered (${duration}ms)`
      );

      return formattedResult;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`❌ Tavily crawl error: ${url}`, errorMessage);

      return `❌ An error occurred during Tavily crawl
Target URL: ${url}
Error: ${errorMessage}

Troubleshooting:
1. Verify that TAVILY_API_KEY environment variable is correctly set
2. Check internet connection
3. Verify URL is valid
4. Verify crawl settings (depth, limits) are appropriate
5. Check if API usage limit has been reached`;
    }
  },
});
