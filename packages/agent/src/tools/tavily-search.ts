/**
 * Tavily Search Tool - Execute high-quality web searches
 */

import { tool } from '@strands-agents/sdk';
import { tavilySearchDefinition } from '@moca/tool-definitions';
import { logger } from '../config/index.js';
import { getTavilyApiKey } from './tavily-common.js';
import { z } from 'zod';

/**
 * Tavily API response type
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
 * Tavily API error type
 */
interface TavilyError {
  error: string;
  message: string;
  status?: number;
}

/**
 * Safe size limit for search results
 */
function truncateContent(content: string, maxLength: number = 2000): string {
  if (content.length <= maxLength) {
    return content;
  }

  const truncated = content.substring(0, maxLength);
  return `${truncated}... (Content truncated due to length. Original length: ${content.length} characters)`;
}

/**
 * Call Tavily API
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callTavilyAPI(params: Record<string, any>): Promise<TavilySearchResponse> {
  const apiKey = await getTavilyApiKey();

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    let errorMessage = `Tavily API error: ${response.status} ${response.statusText}`;

    try {
      const errorData = (await response.json()) as TavilyError;
      errorMessage = `Tavily API error: ${errorData.error} - ${errorData.message}`;
    } catch {
      // Use default error message for JSON parse errors
    }

    throw new Error(errorMessage);
  }

  const data = (await response.json()) as TavilySearchResponse;
  return data;
}

/**
 * Format search results
 */
function formatSearchResults(response: TavilySearchResponse): string {
  const { query, answer, results, response_time, usage } = response;

  let output = `🔍 Tavily Search Results\n`;
  output += `Search Query: ${query}\n`;
  output += `Execution Time: ${response_time}s\n`;

  if (usage?.credits) {
    output += `Credits Used: ${usage.credits}\n`;
  }

  output += `\n`;

  // If LLM-generated answer exists
  if (answer) {
    output += `📝 AI Summary Answer:\n${truncateContent(answer, 1500)}\n\n`;
  }

  // Search results
  output += `📋 Search Results (${results.length} items):\n\n`;

  results.forEach((result, index) => {
    output += `${index + 1}. **${result.title}**\n`;
    output += `   URL: ${result.url}\n`;
    output += `   Relevance: ${(result.score * 100).toFixed(1)}%\n`;
    output += `   Content: ${truncateContent(result.content, 800)}\n\n`;
  });

  // If image results exist
  if (response.images && response.images.length > 0) {
    output += `🖼️ Related Images (${response.images.length} items):\n`;
    response.images.forEach((image, index) => {
      output += `${index + 1}. ${image.url}\n`;
      if (image.description) {
        output += `   Description: ${image.description}\n`;
      }
    });
    output += `\n`;
  }

  return output.trim();
}

/**
 * Tavily Search Tool
 */
export const tavilySearchTool = tool({
  name: tavilySearchDefinition.name,
  description: tavilySearchDefinition.description,
  inputSchema: tavilySearchDefinition.zodSchema,
  callback: async (input: z.infer<typeof tavilySearchDefinition.zodSchema>) => {
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

    logger.info(`🔍 Tavily search started: ${query}`);

    try {
      // Build API parameters
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const apiParams: Record<string, any> = {
        query,
        search_depth: searchDepth,
        topic,
        max_results: maxResults,
        include_answer: includeAnswer,
        include_images: includeImages,
        include_favicon: true, // Include favicon
      };

      // Set optional parameters
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
        // country parameter is only available for general topic
        apiParams.country = country;
      }

      // Call Tavily API
      const startTime = Date.now();
      const response = await callTavilyAPI(apiParams);
      const duration = Date.now() - startTime;

      // Format results
      const formattedResult = formatSearchResults(response);

      logger.info(
        `✅ Tavily search completed: ${query} (${duration}ms, ${response.results.length} results)`
      );

      return formattedResult;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`❌ Tavily search error: ${query}`, errorMessage);

      return `❌ An error occurred during Tavily search
Search Query: ${query}
Error: ${errorMessage}

Troubleshooting:
1. Verify that TAVILY_API_KEY environment variable is correctly set
2. Check internet connection
3. Verify search query is appropriate
4. Check if API usage limit has been reached`;
    }
  },
});
