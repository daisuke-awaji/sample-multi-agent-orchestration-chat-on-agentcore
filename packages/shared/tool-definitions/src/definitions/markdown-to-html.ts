import { z } from 'zod';
import { zodToJsonSchema } from '../utils/schema-converter.js';
import type { ToolDefinition } from '../types.js';

export const markdownToHtmlSchema = z.object({
  inputPath: z
    .string()
    .min(1)
    .describe(
      'Path to the Markdown file to convert. The file must exist and be readable. Supports GFM (GitHub Flavored Markdown) including tables, task lists, and strikethrough.'
    ),
  title: z
    .string()
    .optional()
    .describe('HTML document title. If not provided, uses the filename without extension.'),
  outputPath: z
    .string()
    .optional()
    .describe(
      'Output HTML file path. If not provided, generates a timestamped filename in the same directory as the input file (e.g., report-20260105-120000.html).'
    ),
});

export type MarkdownToHtmlInput = z.infer<typeof markdownToHtmlSchema>;

export const markdownToHtmlDefinition: ToolDefinition<typeof markdownToHtmlSchema> = {
  name: 'markdown_to_html',
  description:
    'Convert a Markdown file to a styled HTML report. Reads a Markdown file from the specified path and generates a single, self-contained HTML file with embedded CSS styling. Supports GFM (GitHub Flavored Markdown) including tables, task lists, code blocks, and more. The generated HTML uses a clean, professional design with white/gray color scheme. Useful for creating shareable reports from Markdown documents.',
  zodSchema: markdownToHtmlSchema,
  jsonSchema: zodToJsonSchema(markdownToHtmlSchema),
};
