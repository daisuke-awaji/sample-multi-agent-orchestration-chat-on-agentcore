import { z } from 'zod';
import { zodToJsonSchema } from '../utils/schema-converter.js';
import type { ToolDefinition } from '../types.js';

const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.pptx', '.xlsx'] as const;

export const documentReaderSchema = z.object({
  filePath: z
    .string()
    .min(1)
    .describe(
      'Absolute path to the local file to read. ' +
        `Supported formats: ${SUPPORTED_EXTENSIONS.join(', ')}. ` +
        'Example: /tmp/ws/report.pdf'
    ),
  maxLength: z
    .number()
    .int()
    .min(1)
    .max(200000)
    .optional()
    .default(50000)
    .describe('Maximum number of characters to extract (default: 50000, max: 200000)'),
  enableVision: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Enable AI vision analysis for PDF and PPTX files. ' +
        'When enabled, uses a foundation model to visually analyze the document, ' +
        'extracting information from charts, diagrams, images, and complex layouts ' +
        'that text extraction alone cannot capture. ' +
        'This incurs additional API costs. Only supported for PDF and PPTX formats.'
    ),
  visionModelId: z
    .string()
    .optional()
    .default('anthropic.claude-sonnet-4-5-20250929-v1:0')
    .describe(
      'Model ID to use for vision analysis (default: anthropic.claude-sonnet-4-5-20250929-v1:0). ' +
        'Only used when enableVision is true.'
    ),
  visionPrompt: z
    .string()
    .optional()
    .describe(
      'Custom prompt for vision analysis. ' +
        'If not provided, a default prompt that extracts text, tables, charts, and layout information is used. ' +
        'Only used when enableVision is true.'
    ),
});

export const documentReaderDefinition: ToolDefinition<typeof documentReaderSchema> = {
  name: 'document_reader',
  description:
    'Read and extract text content from document files (PDF, Word, PowerPoint, Excel). ' +
    'Supports .pdf, .docx, .pptx, .xlsx files on the local filesystem. ' +
    'Returns extracted text content. ' +
    'With enableVision=true, uses AI vision to analyze PDF and PPTX files visually, ' +
    'capturing charts, diagrams, images, and complex layouts that text extraction misses. ' +
    'For structured data analysis of Excel files, consider using code_interpreter after extraction.',
  zodSchema: documentReaderSchema,
  jsonSchema: zodToJsonSchema(documentReaderSchema),
};
