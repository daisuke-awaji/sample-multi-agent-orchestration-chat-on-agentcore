/**
 * Tavily Extract Tool - Extract content from specified URLs
 */

import { tool } from '@strands-agents/sdk';
import { tavilyExtractDefinition } from '@fullstack-agentcore/tool-definitions';
import { logger } from '../config/index.js';
import { getTavilyApiKey } from './tavily-common.js';

/**
 * Tavily Extract API response type
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
function truncateContent(content: string, maxLength: number = 3000): string {
  if (content.length <= maxLength) {
    return content;
  }

  const truncated = content.substring(0, maxLength);
  return `${truncated}... (Content truncated due to length. Original length: ${content.length} characters)`;
}

/**
 * Call Tavily Extract API
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callTavilyExtractAPI(params: Record<string, any>): Promise<TavilyExtractResponse> {
  const apiKey = await getTavilyApiKey();

  const response = await fetch('https://api.tavily.com/extract', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    let errorMessage = `Tavily Extract API error: ${response.status} ${response.statusText}`;

    try {
      const errorData = (await response.json()) as TavilyError;
      errorMessage = `Tavily Extract API error: ${errorData.error} - ${errorData.message}`;
    } catch {
      // Use default error message for JSON parse errors
    }

    throw new Error(errorMessage);
  }

  const data = (await response.json()) as TavilyExtractResponse;
  return data;
}

/**
 * Format extraction results
 */
function formatExtractResults(response: TavilyExtractResponse): string {
  const { results, failed_results, response_time, usage } = response;

  let output = `🔍 Tavily Extract Results\n`;
  output += `Processing Time: ${response_time}s\n`;

  if (usage?.credits) {
    output += `Credits Used: ${usage.credits}\n`;
  }

  output += `Success: ${results.length} items, Failed: ${failed_results.length} items\n\n`;

  // Successful results
  if (results.length > 0) {
    output += `📄 Extracted Content:\n\n`;

    results.forEach((result, index) => {
      output += `${index + 1}. **${result.url}**\n`;
      output += `Content:\n${truncateContent(result.raw_content, 2000)}\n`;

      // If images exist
      if (result.images && result.images.length > 0) {
        output += `🖼️ Images (${result.images.length} items):\n`;
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

  // Failed results
  if (failed_results.length > 0) {
    output += `❌ URLs that failed extraction:\n\n`;

    failed_results.forEach((failed, index) => {
      output += `${index + 1}. ${failed.url}\n`;
      output += `   Reason: ${failed.reason}\n\n`;
    });
  }

  return output.trim();
}

/**
 * Tavily Extract Tool
 */
export const tavilyExtractTool = tool({
  name: tavilyExtractDefinition.name,
  description: tavilyExtractDefinition.description,
  inputSchema: tavilyExtractDefinition.zodSchema,
  callback: async (input) => {
    const { urls, query, extractDepth, format, chunksPerSource, includeImages, timeout } = input;

    // Convert URLs to array
    const urlArray = Array.isArray(urls) ? urls : [urls];

    logger.info(`🔍 Tavily extraction started: ${urlArray.length} URLs`);

    try {
      // Build API parameters
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const apiParams: Record<string, any> = {
        urls: urlArray,
        extract_depth: extractDepth,
        format,
        include_images: includeImages,
        timeout,
      };

      // Set optional parameters
      if (query) {
        apiParams.query = query;
        apiParams.chunks_per_source = chunksPerSource;
      }

      // Call Tavily Extract API
      const startTime = Date.now();
      const response = await callTavilyExtractAPI(apiParams);
      const duration = Date.now() - startTime;

      // Format results
      const formattedResult = formatExtractResults(response);

      logger.info(
        `✅ Tavily extraction completed: ${response.results.length} succeeded, ${response.failed_results.length} failed (${duration}ms)`
      );

      return formattedResult;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`❌ Tavily extraction error: ${urlArray.join(', ')}`, errorMessage);

      return `❌ An error occurred during Tavily extraction
Target URLs: ${urlArray.join(', ')}
Error: ${errorMessage}

Troubleshooting:
1. Verify that TAVILY_API_KEY environment variable is correctly set
2. Check internet connection
3. Verify URLs are valid
4. Check if API usage limit has been reached`;
    }
  },
});
