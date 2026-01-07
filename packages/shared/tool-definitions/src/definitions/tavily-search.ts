import { z } from 'zod';
import { zodToJsonSchema } from '../utils/schema-converter.js';
import type { ToolDefinition } from '../types.js';

export const tavilySearchSchema = z.object({
  query: z.string().describe('Search query (required)'),
  searchDepth: z
    .enum(['basic', 'advanced'])
    .default('basic')
    .describe('Search depth. basic uses 1 credit, advanced uses 2 credits'),
  topic: z
    .enum(['general', 'news'])
    .default('general')
    .describe('Search category. news for latest information, general for general search'),
  maxResults: z
    .number()
    .min(1)
    .max(20)
    .default(5)
    .describe('Maximum number of search results to retrieve (1-20)'),
  includeAnswer: z.boolean().default(true).describe('Include LLM-generated summary answer'),
  timeRange: z
    .enum(['day', 'week', 'month', 'year', 'd', 'w', 'm', 'y'])
    .optional()
    .describe('Time range filter (filter by past period)'),
  includeDomains: z.array(z.string()).optional().describe('List of domains to include in search'),
  excludeDomains: z.array(z.string()).optional().describe('List of domains to exclude from search'),
  includeImages: z.boolean().default(false).describe('Retrieve related images'),
  country: z
    .string()
    .optional()
    .describe('Prioritize results from specific country (e.g., japan, united states)'),
});

export const tavilySearchDefinition: ToolDefinition<typeof tavilySearchSchema> = {
  name: 'tavily_search',
  description:
    'Execute high-quality web search using Tavily API. Get comprehensive search results for latest information, news, and general topics.',
  zodSchema: tavilySearchSchema,
  jsonSchema: zodToJsonSchema(tavilySearchSchema),
};
