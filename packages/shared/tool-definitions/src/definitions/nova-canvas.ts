import { z } from 'zod';
import { zodToJsonSchema } from '../utils/schema-converter.js';
import type { ToolDefinition } from '../types.js';

export const novaCanvasSchema = z.object({
  prompt: z
    .string()
    .min(1)
    .max(1024)
    .describe('Text prompt describing the image to generate (required, max 1024 characters)'),
  width: z
    .union([z.literal(512), z.literal(768), z.literal(1024)])
    .default(512)
    .describe('Image width in pixels (512, 768, or 1024, default: 512)'),
  height: z
    .union([z.literal(512), z.literal(768), z.literal(1024)])
    .default(512)
    .describe('Image height in pixels (512, 768, or 1024, default: 512)'),
  numberOfImages: z
    .number()
    .min(1)
    .max(5)
    .default(1)
    .describe('Number of images to generate (1-5, default: 1)'),
  seed: z
    .number()
    .min(0)
    .max(858993459)
    .optional()
    .describe('Random seed for reproducible generation (0-858993459, optional)'),
  saveToS3: z
    .boolean()
    .default(true)
    .describe('Whether to save generated images to S3 storage (default: true)'),
  outputPath: z
    .string()
    .optional()
    .describe('Custom output filename (default: auto-generated with timestamp)'),
});

export const novaCanvasDefinition: ToolDefinition<typeof novaCanvasSchema> = {
  name: 'nova_canvas',
  description:
    'Generate images using Amazon Nova Canvas on Bedrock. Convert text prompts into high-quality images with configurable size and seed for reproducibility. Automatically saves generated images to user S3 storage.',
  zodSchema: novaCanvasSchema,
  jsonSchema: zodToJsonSchema(novaCanvasSchema),
};
