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
});

export const documentReaderDefinition: ToolDefinition<typeof documentReaderSchema> = {
  name: 'document_reader',
  description:
    'Read and extract text content from document files (PDF, Word, PowerPoint, Excel). ' +
    'Supports .pdf, .docx, .pptx, .xlsx files on the local filesystem. ' +
    'Returns extracted text content. For scanned PDFs (image-only), use image_to_text tool instead. ' +
    'For structured data analysis of Excel files, consider using code_interpreter after extraction.',
  zodSchema: documentReaderSchema,
  jsonSchema: zodToJsonSchema(documentReaderSchema),
};
