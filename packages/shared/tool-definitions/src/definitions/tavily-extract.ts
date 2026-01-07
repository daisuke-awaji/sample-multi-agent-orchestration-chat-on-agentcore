import { z } from 'zod';
import { zodToJsonSchema } from '../utils/schema-converter.js';
import type { ToolDefinition } from '../types.js';

export const tavilyExtractSchema = z.object({
  urls: z
    .union([z.string(), z.array(z.string())])
    .describe('URL(s) to extract from (single URL or array of URLs)'),
  query: z
    .string()
    .optional()
    .describe('Query for reranking. When specified, prioritizes more relevant content'),
  extractDepth: z
    .enum(['basic', 'advanced'])
    .default('basic')
    .describe('Extraction depth. basic: 1 credit/5 URLs, advanced: 2 credits/5 URLs'),
  format: z
    .enum(['markdown', 'text'])
    .default('markdown')
    .describe('Output format. markdown or text'),
  chunksPerSource: z
    .number()
    .min(1)
    .max(5)
    .default(3)
    .describe('Number of chunks per source (1-5, only effective when query is specified)'),
  includeImages: z.boolean().default(false).describe('Whether to include image information'),
  timeout: z.number().min(1).max(60).default(30).describe('Timeout in seconds (1-60)'),
});

export const tavilyExtractDefinition: ToolDefinition<typeof tavilyExtractSchema> = {
  name: 'tavily_extract',
  description:
    'Extract content from specified URLs using Tavily API. Get webpage content as structured text.',
  zodSchema: tavilyExtractSchema,
  jsonSchema: zodToJsonSchema(tavilyExtractSchema),
};
