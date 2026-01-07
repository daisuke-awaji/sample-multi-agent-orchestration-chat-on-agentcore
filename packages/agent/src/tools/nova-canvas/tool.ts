/**
 * Amazon Nova Canvas Tool - Generate images using text prompts
 */

import { tool } from '@strands-agents/sdk';
import { novaCanvasDefinition } from '@fullstack-agentcore/tool-definitions';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { config, logger } from '../../config/index.js';
import { getCurrentContext, getCurrentStoragePath } from '../../context/request-context.js';
import type { NovaCanvasRequest, NovaCanvasResponse, GenerateImageResult } from './types.js';

// Model configuration
const NOVA_CANVAS_MODEL_ID = 'amazon.nova-canvas-v1:0';

// Valid image dimensions for Nova Canvas
const VALID_DIMENSIONS = [512, 768, 1024];

// Create Bedrock Runtime client for Nova Canvas region
const bedrockClient = new BedrockRuntimeClient({ region: config.NOVA_CANVAS_REGION });

// Create S3 client
const s3Client = new S3Client({ region: process.env.AWS_REGION });

/**
 * Validate image dimensions
 */
function validateDimension(dimension: number): boolean {
  return VALID_DIMENSIONS.includes(dimension);
}

/**
 * Format file size to human-readable string
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Generate a timestamp-based filename
 */
function generateFilename(seed: number): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  return `image-${timestamp}-seed-${seed}.png`;
}

/**
 * Save image to S3 storage
 */
async function saveImageToS3(
  imageBase64: string,
  userId: string,
  outputPath?: string
): Promise<string> {
  try {
    const bucketName = process.env.USER_STORAGE_BUCKET_NAME;
    if (!bucketName) {
      logger.warn('[NOVA_CANVAS] S3 bucket not configured, skipping image storage');
      return '';
    }

    // Get user's allowed storage path
    const allowedStoragePath = getCurrentStoragePath();
    const basePath = `users/${userId}/${allowedStoragePath}/images`;
    const filename = outputPath || generateFilename(Math.floor(Math.random() * 858993460));
    const s3Key = `${basePath}/${filename}`.replace(/\/+/g, '/');

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(imageBase64, 'base64');

    // Upload to S3
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: imageBuffer,
      ContentType: 'image/png',
      Metadata: {
        'generated-by': 'nova-canvas',
        'generated-at': new Date().toISOString(),
      },
    });

    await s3Client.send(command);

    const s3Path = `s3://${bucketName}/${s3Key}`;
    logger.info(
      `[NOVA_CANVAS] Image saved to S3: ${s3Path} (${formatFileSize(imageBuffer.length)})`
    );

    return s3Path;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn(`[NOVA_CANVAS] Failed to save image to S3: ${errorMessage}`);
    return '';
  }
}

/**
 * Invoke Nova Canvas API via Bedrock
 */
async function invokeNovaCanvas(request: NovaCanvasRequest): Promise<NovaCanvasResponse> {
  try {
    logger.debug('[NOVA_CANVAS] Invoking Nova Canvas with request:', request);

    const command = new InvokeModelCommand({
      modelId: NOVA_CANVAS_MODEL_ID,
      contentType: 'application/json',
      body: JSON.stringify(request),
    });

    const response = await bedrockClient.send(command);

    // Decode response body
    const responseBodyText = await response.body.transformToString('utf-8');
    const responseBody = JSON.parse(responseBodyText) as NovaCanvasResponse;

    logger.debug(`[NOVA_CANVAS] Received ${responseBody.images.length} image(s)`);

    return responseBody;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[NOVA_CANVAS] Failed to invoke Nova Canvas: ${errorMessage}`);
    throw new Error(`Nova Canvas invocation failed: ${errorMessage}`);
  }
}

/**
 * Format generation results
 */
function formatResults(
  result: GenerateImageResult,
  originalPrompt: string,
  width: number,
  height: number,
  numberOfImages: number,
  seed: number
): string {
  let output = '🎨 Nova Canvas Image Generation Result\n\n';

  output += `Prompt: ${originalPrompt}\n`;
  output += `Configuration:\n`;
  output += `  - Size: ${width}x${height}\n`;
  output += `  - Generated: ${numberOfImages} image(s)\n`;
  output += `  - Seed: ${seed}\n`;
  output += `\n`;

  if (result.success) {
    output += `✅ Generation successful\n`;
    output += `Images generated: ${result.images.length}\n`;

    if (result.s3Paths && result.s3Paths.length > 0) {
      output += `\n📁 Saved to S3:\n`;
      result.s3Paths.forEach((path, index) => {
        output += `  ${index + 1}. ${path}\n`;
      });
    }

    output += `\n${result.message}`;
  } else {
    output += `❌ Generation failed\n`;
    output += `Error: ${result.message}`;
  }

  return output;
}

/**
 * Amazon Nova Canvas Tool
 */
export const novaCanvasTool = tool({
  name: novaCanvasDefinition.name,
  description: novaCanvasDefinition.description,
  inputSchema: novaCanvasDefinition.zodSchema,
  callback: async (input) => {
    const { prompt, width, height, numberOfImages, seed: userSeed, saveToS3, outputPath } = input;

    logger.info(
      `[NOVA_CANVAS] Image generation started: prompt="${prompt.substring(0, 50)}...", size=${width}x${height}`
    );

    // Get user context
    const context = getCurrentContext();
    if (!context?.userId) {
      logger.error('[NOVA_CANVAS] Failed to get user ID from context');
      return `❌ Error: User authentication information not found. Please log in again.`;
    }

    const userId = context.userId;

    // Validate dimensions
    if (!validateDimension(width) || !validateDimension(height)) {
      logger.warn(`[NOVA_CANVAS] Invalid dimensions: ${width}x${height}`);
      return `❌ Error: Invalid image dimensions. Supported sizes are 512, 768, and 1024 pixels.`;
    }

    try {
      // Generate seed if not provided
      const seed = userSeed ?? Math.floor(Math.random() * 858993460);

      // Build request payload
      const request: NovaCanvasRequest = {
        taskType: 'TEXT_IMAGE',
        textToImageParams: {
          text: prompt,
        },
        imageGenerationConfig: {
          seed,
          quality: 'standard',
          width,
          height,
          numberOfImages,
        },
      };

      // Invoke Nova Canvas
      const startTime = Date.now();
      const response = await invokeNovaCanvas(request);
      const duration = Date.now() - startTime;

      logger.info(
        `[NOVA_CANVAS] Image generation completed in ${duration}ms, generated ${response.images.length} image(s)`
      );

      // Save to S3 if requested
      const s3Paths: string[] = [];
      if (saveToS3 && response.images.length > 0) {
        for (let i = 0; i < response.images.length; i++) {
          const customPath =
            outputPath && response.images.length === 1
              ? outputPath
              : outputPath
                ? `${outputPath}-${i + 1}.png`
                : undefined;

          const s3Path = await saveImageToS3(response.images[i], userId, customPath);
          if (s3Path) {
            s3Paths.push(s3Path);
          }
        }
      }

      // Prepare result
      const result: GenerateImageResult = {
        success: true,
        images: response.images,
        seed,
        s3Paths: s3Paths.length > 0 ? s3Paths : undefined,
        message: `Successfully generated ${response.images.length} image(s) in ${duration}ms.`,
      };

      return formatResults(result, prompt, width, height, numberOfImages, seed);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[NOVA_CANVAS] Image generation error: ${errorMessage}`);

      const result: GenerateImageResult = {
        success: false,
        images: [],
        seed: 0,
        message: errorMessage,
      };

      return (
        formatResults(result, prompt, width, height, numberOfImages, 0) +
        '\n\nTroubleshooting:\n' +
        '1. Verify NOVA_CANVAS_REGION environment variable is correctly set\n' +
        '2. Verify AWS credentials have Bedrock permissions\n' +
        '3. Check if prompt contains any inappropriate content\n' +
        '4. Verify image size is one of: 512, 768, or 1024 pixels'
      );
    }
  },
});
