import { z } from 'zod';
import { zodToJsonSchema } from '../utils/schema-converter.js';
import type { ToolDefinition } from '../types.js';

export const imageToTextSchema = z.object({
  imagePath: z
    .string()
    .min(1)
    .describe(
      'Image path: S3 URI (s3://bucket/key) or local file path (/absolute/path or ./relative/path)'
    ),
  prompt: z
    .string()
    .default('Describe this image in detail.')
    .describe('Analysis prompt for the image (default: describe the image)'),
  modelId: z
    .enum([
      'global.anthropic.claude-sonnet-4-5-20250929-v1:0',
      'global.anthropic.claude-haiku-4-5-20251001-v1:0',
      'global.amazon.nova-2-lite-v1:0',
    ])
    .default('global.amazon.nova-2-lite-v1:0')
    .describe(
      'Vision model to use (global inference profile). Options: Claude Sonnet 4.5 (high accuracy), Claude Haiku 4.5 (balanced), Nova 2 Lite (fast, default)'
    ),
});

export const imageToTextDefinition: ToolDefinition<typeof imageToTextSchema> = {
  name: 'image_to_text',
  description:
    'Analyze images and convert them to text descriptions using Bedrock Converse API. Supports S3 URIs and local file paths. Use vision-capable models to extract text, describe content, or analyze images. Useful for OCR, image understanding, and visual content analysis.',
  zodSchema: imageToTextSchema,
  jsonSchema: zodToJsonSchema(imageToTextSchema),
};
