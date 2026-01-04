/**
 * Nova Canvas Image Generation Tool
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelCommandInput,
} from '@aws-sdk/client-bedrock-runtime';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ToolInput, ToolResult } from '../types.js';
import { Tool, ToolValidationError } from './types.js';
import { logger } from '../logger.js';

/**
 * Nova Canvas Tool Input
 */
interface NovaCanvasInput extends ToolInput {
  prompt?: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  numberOfImages?: number;
  cfgScale?: number;
  seed?: number;
}

/**
 * Generated Image Result
 */
interface GeneratedImage {
  s3Uri: string;
  s3Key: string;
  size: {
    width: number;
    height: number;
  };
  format: string;
}

/**
 * Nova Canvas Tool Output
 */
interface NovaCanvasResult extends ToolResult {
  images: GeneratedImage[];
  metadata: {
    prompt: string;
    model: string;
    seed?: number;
    cfgScale: number;
    negativePrompt?: string;
  };
}

/**
 * Bedrock Nova Canvas Request Body
 */
interface NovaCanvasRequestBody {
  taskType: 'TEXT_IMAGE';
  textToImageParams: {
    text: string;
    negativeText?: string;
  };
  imageGenerationConfig: {
    numberOfImages: number;
    height: number;
    width: number;
    cfgScale: number;
    seed?: number;
  };
}

/**
 * Bedrock Nova Canvas Response Body
 */
interface NovaCanvasResponseBody {
  images: string[]; // Base64 encoded images
  error?: string;
}

// AWS Clients
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

const NOVA_CANVAS_MODEL_ID = process.env.NOVA_CANVAS_MODEL_ID || 'amazon.nova-canvas-v1:0';
const USER_STORAGE_BUCKET = process.env.USER_STORAGE_BUCKET;

/**
 * Validate input parameters
 */
function validateInput(input: NovaCanvasInput): void {
  if (!input.prompt) {
    throw new ToolValidationError(
      'Nova Canvas tool requires a "prompt" parameter',
      'nova-canvas-generate',
      'prompt'
    );
  }

  if (input.prompt.length > 1024) {
    throw new ToolValidationError(
      'Prompt must be 1024 characters or less',
      'nova-canvas-generate',
      'prompt'
    );
  }

  if (input.negativePrompt && input.negativePrompt.length > 512) {
    throw new ToolValidationError(
      'Negative prompt must be 512 characters or less',
      'nova-canvas-generate',
      'negativePrompt'
    );
  }

  const width = input.width || 1024;
  const height = input.height || 1024;

  if (width < 256 || width > 2048) {
    throw new ToolValidationError(
      'Width must be between 256 and 2048',
      'nova-canvas-generate',
      'width'
    );
  }

  if (height < 256 || height > 2048) {
    throw new ToolValidationError(
      'Height must be between 256 and 2048',
      'nova-canvas-generate',
      'height'
    );
  }

  // Check total pixel count (max 4.19 million)
  const totalPixels = width * height;
  if (totalPixels > 4190000) {
    throw new ToolValidationError(
      `Total pixel count (${totalPixels}) exceeds maximum (4,190,000)`,
      'nova-canvas-generate',
      'width/height'
    );
  }
}

/**
 * Upload image to S3
 */
async function uploadToS3(imageBase64: string, index: number, prompt: string): Promise<string> {
  if (!USER_STORAGE_BUCKET) {
    throw new Error('USER_STORAGE_BUCKET environment variable is not set');
  }

  const imageBuffer = Buffer.from(imageBase64, 'base64');
  const timestamp = Date.now();
  const sanitizedPrompt = prompt
    .substring(0, 50)
    .replace(/[^a-zA-Z0-9]/g, '-')
    .toLowerCase();
  const s3Key = `generated-images/${timestamp}-${sanitizedPrompt}-${index}.png`;

  logger.info('S3_UPLOAD_START', {
    bucket: USER_STORAGE_BUCKET,
    key: s3Key,
    sizeBytes: imageBuffer.length,
  });

  await s3Client.send(
    new PutObjectCommand({
      Bucket: USER_STORAGE_BUCKET,
      Key: s3Key,
      Body: imageBuffer,
      ContentType: 'image/png',
      Metadata: {
        prompt: prompt.substring(0, 256), // Truncate for metadata
        generatedAt: new Date().toISOString(),
        model: NOVA_CANVAS_MODEL_ID,
      },
    })
  );

  logger.info('S3_UPLOAD_SUCCESS', {
    bucket: USER_STORAGE_BUCKET,
    key: s3Key,
  });

  return s3Key;
}

/**
 * Nova Canvas Tool Handler
 */
async function handleNovaCanvas(input: ToolInput): Promise<NovaCanvasResult> {
  const canvasInput = input as NovaCanvasInput;

  // Validate input
  validateInput(canvasInput);

  const prompt = canvasInput.prompt!;
  const negativePrompt = canvasInput.negativePrompt;
  const width = canvasInput.width || 1024;
  const height = canvasInput.height || 1024;
  const numberOfImages = canvasInput.numberOfImages || 1;
  const cfgScale = canvasInput.cfgScale || 7.0;
  const seed = canvasInput.seed;

  logger.info('NOVA_CANVAS_START', {
    prompt: prompt.substring(0, 100),
    width,
    height,
    numberOfImages,
    cfgScale,
    hasSeed: !!seed,
    hasNegativePrompt: !!negativePrompt,
  });

  // Build request body
  const requestBody: NovaCanvasRequestBody = {
    taskType: 'TEXT_IMAGE',
    textToImageParams: {
      text: prompt,
      ...(negativePrompt && { negativeText: negativePrompt }),
    },
    imageGenerationConfig: {
      numberOfImages,
      height,
      width,
      cfgScale,
      ...(seed !== undefined && { seed }),
    },
  };

  // Invoke Bedrock model
  const invokeInput: InvokeModelCommandInput = {
    modelId: NOVA_CANVAS_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(requestBody),
  };

  try {
    logger.info('BEDROCK_INVOKE_START', {
      modelId: NOVA_CANVAS_MODEL_ID,
      requestBodySize: JSON.stringify(requestBody).length,
    });

    const response = await bedrockClient.send(new InvokeModelCommand(invokeInput));

    if (!response.body) {
      throw new Error('No response body from Bedrock');
    }

    const responseBody: NovaCanvasResponseBody = JSON.parse(
      new TextDecoder().decode(response.body)
    );

    if (responseBody.error) {
      throw new Error(`Bedrock error: ${responseBody.error}`);
    }

    if (!responseBody.images || responseBody.images.length === 0) {
      throw new Error('No images generated');
    }

    logger.info('BEDROCK_INVOKE_SUCCESS', {
      imagesCount: responseBody.images.length,
    });

    // Upload images to S3
    const uploadPromises = responseBody.images.map((imageBase64, index) =>
      uploadToS3(imageBase64, index, prompt)
    );

    const s3Keys = await Promise.all(uploadPromises);

    // Build result
    const images: GeneratedImage[] = s3Keys.map((s3Key) => ({
      s3Uri: `s3://${USER_STORAGE_BUCKET}/${s3Key}`,
      s3Key,
      size: {
        width,
        height,
      },
      format: 'png',
    }));

    const result: NovaCanvasResult = {
      images,
      metadata: {
        prompt,
        model: NOVA_CANVAS_MODEL_ID,
        cfgScale,
        ...(seed !== undefined && { seed }),
        ...(negativePrompt && { negativePrompt }),
      },
    };

    logger.info('NOVA_CANVAS_SUCCESS', {
      imagesGenerated: images.length,
      totalSize: images.length * width * height,
    });

    return result;
  } catch (error) {
    logger.error('NOVA_CANVAS_ERROR', {
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : 'Unknown',
      prompt: prompt.substring(0, 100),
    });
    throw error;
  }
}

/**
 * Nova Canvas Tool Definition
 */
export const novaCanvasTool: Tool = {
  name: 'nova-canvas-generate',
  handler: handleNovaCanvas,
  description:
    'Generate high-quality images using Amazon Nova Canvas from text prompts. Perfect for marketing images, product mockups, and creative content.',
  version: '1.0.0',
  tags: ['image-generation', 'nova', 'canvas', 'bedrock', 'ai'],
};

export default novaCanvasTool;
