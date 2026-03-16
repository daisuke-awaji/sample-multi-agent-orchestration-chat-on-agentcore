import { z } from 'zod';
import { zodToJsonSchema } from '../utils/schema-converter.js';
import type { ToolDefinition } from '../types.js';

export const novaReelSchema = z.object({
  action: z
    .enum(['start', 'status', 'list'])
    .describe(
      'Action to execute: start (start video generation), status (check status), list (get list)'
    ),

  // Start action parameters
  prompt: z
    .string()
    .optional()
    .describe('Text prompt for video generation (required when action is start)'),
  negativePrompt: z.string().optional().describe('Elements to exclude from generation (optional)'),
  imageBase64: z.string().optional().describe('Base64-encoded image for Image-to-Video (optional)'),
  duration: z.number().optional().describe('Video duration in seconds: 6 (default) or 120'),
  dimension: z
    .enum(['1280x720'])
    .optional()
    .describe('Video resolution. Currently only 1280x720 (landscape, 16:9) is supported.'),
  fps: z.number().optional().describe('Frame rate (default: 24)'),
  seed: z.number().optional().describe('Random seed (0-2147483646)'),
  outputPath: z.string().optional().describe('Output filename (auto-generated if omitted)'),
  waitForCompletion: z.boolean().optional().describe('Wait for completion (default: false)'),
  pollingInterval: z.number().optional().describe('Polling interval in seconds (default: 30)'),
  maxWaitTime: z.number().optional().describe('Maximum wait time in seconds (default: 1200)'),

  // Status action parameters
  invocationArn: z.string().optional().describe('Job ARN (required when action is status)'),

  // List action parameters
  statusFilter: z
    .enum(['InProgress', 'Completed', 'Failed'])
    .optional()
    .describe('Filter by status'),
  maxResults: z.number().optional().describe('Maximum number of results (default: 10, max: 100)'),
  sortOrder: z
    .enum(['Ascending', 'Descending'])
    .optional()
    .describe('Sort order (default: Descending)'),
});

export const novaReelDefinition: ToolDefinition<typeof novaReelSchema> = {
  name: 'nova_reel',
  description: `Generate videos using Amazon Nova Reel.

Actions:
1. start: Start a video generation job from a text prompt
2. status: Check the status of a job
3. list: Get a list of jobs

Features:
- 6-second video: Generated in approximately 90 seconds
- 2-minute video: Generated in approximately 14-17 minutes
- Resolution: 1280x720 (landscape, 16:9) — currently the only supported dimension
- Image-to-Video generation is also supported

Examples:
1. Start video generation: action="start", prompt="A sunset over the ocean"
2. Check status: action="status", invocationArn="arn:aws:..."
3. Get job list: action="list"`,
  zodSchema: novaReelSchema,
  jsonSchema: zodToJsonSchema(novaReelSchema),
};
