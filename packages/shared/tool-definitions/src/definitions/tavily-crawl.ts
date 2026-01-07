import { z } from 'zod';
import { zodToJsonSchema } from '../utils/schema-converter.js';
import type { ToolDefinition } from '../types.js';

export const tavilyCrawlSchema = z.object({
  url: z.string().describe('Starting URL for crawl'),
  instructions: z
    .string()
    .optional()
    .describe('Crawl instructions (natural language). Specifying doubles the usage cost'),
  maxDepth: z
    .number()
    .min(1)
    .max(5)
    .default(1)
    .describe('Maximum exploration depth (1-5, how far from base URL)'),
  maxBreadth: z
    .number()
    .min(1)
    .default(20)
    .describe('Maximum number of links per page (1 or more)'),
  limit: z.number().min(1).default(50).describe('Maximum number of links to process (1 or more)'),
  selectPaths: z
    .array(z.string())
    .optional()
    .describe('Regex patterns for paths to include (e.g., ["/docs/.*", "/api/v1.*"])'),
  selectDomains: z
    .array(z.string())
    .optional()
    .describe('Regex patterns for domains to include (e.g., ["^docs\\.example\\.com$"])'),
  excludePaths: z
    .array(z.string())
    .optional()
    .describe('Regex patterns for paths to exclude (e.g., ["/private/.*", "/admin/.*"])'),
  excludeDomains: z
    .array(z.string())
    .optional()
    .describe('Regex patterns for domains to exclude (e.g., ["^private\\.example\\.com$"])'),
  allowExternal: z
    .boolean()
    .default(true)
    .describe('Whether to include external domain links in results'),
  extractDepth: z
    .enum(['basic', 'advanced'])
    .default('basic')
    .describe('Extraction depth. basic: 1 credit/5 extractions, advanced: 2 credits/5 extractions'),
  format: z
    .enum(['markdown', 'text'])
    .default('markdown')
    .describe('Output format. markdown or text'),
  includeImages: z.boolean().default(false).describe('Whether to include image information'),
  chunksPerSource: z
    .number()
    .min(1)
    .max(5)
    .default(3)
    .describe('Number of chunks per source (1-5, only effective when instructions is specified)'),
  timeout: z.number().min(10).max(150).default(150).describe('Timeout in seconds (10-150)'),
});

export const tavilyCrawlDefinition: ToolDefinition<typeof tavilyCrawlSchema> = {
  name: 'tavily_crawl',
  description:
    'Comprehensively crawl websites using Tavily API. Starting from specified root URL, automatically discovers and extracts related pages.',
  zodSchema: tavilyCrawlSchema,
  jsonSchema: zodToJsonSchema(tavilyCrawlSchema),
};
