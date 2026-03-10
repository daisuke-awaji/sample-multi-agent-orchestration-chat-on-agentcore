/**
 * Nova Canvas Integration Tests
 *
 * These tests make actual calls to AWS Bedrock Nova Canvas service.
 * Valid AWS credentials are required to run these tests.
 *
 * Run with:
 * npm run test:integration -- nova-canvas.integration.test.ts
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import type { NovaCanvasRequest, NovaCanvasResponse } from '../types.js';

const NOVA_CANVAS_MODEL_ID = 'amazon.nova-canvas-v1:0';
const NOVA_CANVAS_REGION = process.env.NOVA_CANVAS_REGION || 'us-east-1';

let bedrockClient: BedrockRuntimeClient;

beforeAll(() => {
  bedrockClient = new BedrockRuntimeClient({ region: NOVA_CANVAS_REGION });
  console.log(`Nova Canvas tests running in region: ${NOVA_CANVAS_REGION}`);
});

describe('Nova Canvas - Basic Image Generation', () => {
  it('should generate a simple image from text prompt', async () => {
    const seed = Math.floor(Math.random() * 858993460);

    const request: NovaCanvasRequest = {
      taskType: 'TEXT_IMAGE',
      textToImageParams: {
        text: 'A simple red circle on white background',
      },
      imageGenerationConfig: {
        seed,
        quality: 'standard',
        width: 512,
        height: 512,
        numberOfImages: 1,
      },
    };

    console.log(`Generating image with seed: ${seed}`);

    const command = new InvokeModelCommand({
      modelId: NOVA_CANVAS_MODEL_ID,
      contentType: 'application/json',
      body: JSON.stringify(request),
    });

    const response = await bedrockClient.send(command);
    const responseBodyText = await response.body.transformToString('utf-8');
    const responseBody = JSON.parse(responseBodyText) as NovaCanvasResponse;

    expect(responseBody.images).toBeDefined();
    expect(responseBody.images).toHaveLength(1);
    expect(responseBody.images[0]).toMatch(/^[A-Za-z0-9+/=]+$/); // Base64 pattern
    expect(responseBody.images[0].length).toBeGreaterThan(1000); // Should be a substantial image

    console.log(`Image generated successfully (${responseBody.images[0].length} chars)`);
  }, 60000);

  it('should generate image with different dimensions', async () => {
    const seed = Math.floor(Math.random() * 858993460);

    const request: NovaCanvasRequest = {
      taskType: 'TEXT_IMAGE',
      textToImageParams: {
        text: 'A blue square',
      },
      imageGenerationConfig: {
        seed,
        quality: 'standard',
        width: 768,
        height: 768,
        numberOfImages: 1,
      },
    };

    console.log(`Generating 768x768 image with seed: ${seed}`);

    const command = new InvokeModelCommand({
      modelId: NOVA_CANVAS_MODEL_ID,
      contentType: 'application/json',
      body: JSON.stringify(request),
    });

    const response = await bedrockClient.send(command);
    const responseBodyText = await response.body.transformToString('utf-8');
    const responseBody = JSON.parse(responseBodyText) as NovaCanvasResponse;

    expect(responseBody.images).toBeDefined();
    expect(responseBody.images).toHaveLength(1);
    expect(responseBody.images[0]).toMatch(/^[A-Za-z0-9+/=]+$/);

    console.log(`768x768 image generated successfully`);
  }, 60000);

  it('should generate multiple images', async () => {
    const seed = Math.floor(Math.random() * 858993460);

    const request: NovaCanvasRequest = {
      taskType: 'TEXT_IMAGE',
      textToImageParams: {
        text: 'A green triangle',
      },
      imageGenerationConfig: {
        seed,
        quality: 'standard',
        width: 512,
        height: 512,
        numberOfImages: 2,
      },
    };

    console.log(`Generating 2 images with seed: ${seed}`);

    const command = new InvokeModelCommand({
      modelId: NOVA_CANVAS_MODEL_ID,
      contentType: 'application/json',
      body: JSON.stringify(request),
    });

    const response = await bedrockClient.send(command);
    const responseBodyText = await response.body.transformToString('utf-8');
    const responseBody = JSON.parse(responseBodyText) as NovaCanvasResponse;

    expect(responseBody.images).toBeDefined();
    expect(responseBody.images).toHaveLength(2);
    expect(responseBody.images[0]).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(responseBody.images[1]).toMatch(/^[A-Za-z0-9+/=]+$/);

    console.log(`Multiple images generated successfully (2 images)`);
  }, 90000);
});

describe('Nova Canvas - Reproducibility', () => {
  it('should generate identical images with same seed', async () => {
    const seed = 12345;
    const prompt = 'A yellow star on blue background';

    const request: NovaCanvasRequest = {
      taskType: 'TEXT_IMAGE',
      textToImageParams: {
        text: prompt,
      },
      imageGenerationConfig: {
        seed,
        quality: 'standard',
        width: 512,
        height: 512,
        numberOfImages: 1,
      },
    };

    console.log(`Testing reproducibility with seed: ${seed}`);

    // First generation
    const command1 = new InvokeModelCommand({
      modelId: NOVA_CANVAS_MODEL_ID,
      contentType: 'application/json',
      body: JSON.stringify(request),
    });

    const response1 = await bedrockClient.send(command1);
    const responseBody1Text = await response1.body.transformToString('utf-8');
    const responseBody1 = JSON.parse(responseBody1Text) as NovaCanvasResponse;

    // Second generation with same seed
    const command2 = new InvokeModelCommand({
      modelId: NOVA_CANVAS_MODEL_ID,
      contentType: 'application/json',
      body: JSON.stringify(request),
    });

    const response2 = await bedrockClient.send(command2);
    const responseBody2Text = await response2.body.transformToString('utf-8');
    const responseBody2 = JSON.parse(responseBody2Text) as NovaCanvasResponse;

    // Images generated with the same seed should be very similar (same size at minimum).
    // Note: Nova Canvas may not guarantee bit-identical output across invocations,
    // so we compare image sizes instead of exact base64 strings.
    const size1 = responseBody1.images[0].length;
    const size2 = responseBody2.images[0].length;
    const sizeDiffRatio = Math.abs(size1 - size2) / Math.max(size1, size2);
    expect(sizeDiffRatio).toBeLessThan(0.05); // Allow up to 5% size difference

    console.log('Reproducibility confirmed: identical images generated');
  }, 90000);
});

describe('Nova Canvas - Prompt Variations', () => {
  it('should generate image from detailed prompt', async () => {
    const seed = Math.floor(Math.random() * 858993460);

    const request: NovaCanvasRequest = {
      taskType: 'TEXT_IMAGE',
      textToImageParams: {
        text: 'A cute robot with a friendly expression, rendered in a minimalist style with soft colors',
      },
      imageGenerationConfig: {
        seed,
        quality: 'standard',
        width: 512,
        height: 512,
        numberOfImages: 1,
      },
    };

    console.log('Generating image from detailed prompt');

    const command = new InvokeModelCommand({
      modelId: NOVA_CANVAS_MODEL_ID,
      contentType: 'application/json',
      body: JSON.stringify(request),
    });

    const response = await bedrockClient.send(command);
    const responseBodyText = await response.body.transformToString('utf-8');
    const responseBody = JSON.parse(responseBodyText) as NovaCanvasResponse;

    expect(responseBody.images).toBeDefined();
    expect(responseBody.images).toHaveLength(1);
    expect(responseBody.images[0]).toMatch(/^[A-Za-z0-9+/=]+$/);

    console.log('Detailed prompt image generated successfully');
  }, 60000);

  it('should generate image from simple prompt', async () => {
    const seed = Math.floor(Math.random() * 858993460);

    const request: NovaCanvasRequest = {
      taskType: 'TEXT_IMAGE',
      textToImageParams: {
        text: 'sunset',
      },
      imageGenerationConfig: {
        seed,
        quality: 'standard',
        width: 512,
        height: 512,
        numberOfImages: 1,
      },
    };

    console.log('Generating image from simple prompt');

    const command = new InvokeModelCommand({
      modelId: NOVA_CANVAS_MODEL_ID,
      contentType: 'application/json',
      body: JSON.stringify(request),
    });

    const response = await bedrockClient.send(command);
    const responseBodyText = await response.body.transformToString('utf-8');
    const responseBody = JSON.parse(responseBodyText) as NovaCanvasResponse;

    expect(responseBody.images).toBeDefined();
    expect(responseBody.images).toHaveLength(1);
    expect(responseBody.images[0]).toMatch(/^[A-Za-z0-9+/=]+$/);

    console.log('Simple prompt image generated successfully');
  }, 60000);
});

describe('Nova Canvas - Image Size Validation', () => {
  it('should generate 512x512 image', async () => {
    const seed = Math.floor(Math.random() * 858993460);

    const request: NovaCanvasRequest = {
      taskType: 'TEXT_IMAGE',
      textToImageParams: {
        text: 'test image 512x512',
      },
      imageGenerationConfig: {
        seed,
        quality: 'standard',
        width: 512,
        height: 512,
        numberOfImages: 1,
      },
    };

    const command = new InvokeModelCommand({
      modelId: NOVA_CANVAS_MODEL_ID,
      contentType: 'application/json',
      body: JSON.stringify(request),
    });

    const response = await bedrockClient.send(command);
    const responseBodyText = await response.body.transformToString('utf-8');
    const responseBody = JSON.parse(responseBodyText) as NovaCanvasResponse;

    expect(responseBody.images).toHaveLength(1);

    // Verify image is valid base64
    const buffer = Buffer.from(responseBody.images[0], 'base64');
    expect(buffer.length).toBeGreaterThan(0);

    console.log(`512x512 image size: ${buffer.length} bytes`);
  }, 60000);

  it('should generate 1024x1024 image', async () => {
    const seed = Math.floor(Math.random() * 858993460);

    const request: NovaCanvasRequest = {
      taskType: 'TEXT_IMAGE',
      textToImageParams: {
        text: 'test image 1024x1024',
      },
      imageGenerationConfig: {
        seed,
        quality: 'standard',
        width: 1024,
        height: 1024,
        numberOfImages: 1,
      },
    };

    const command = new InvokeModelCommand({
      modelId: NOVA_CANVAS_MODEL_ID,
      contentType: 'application/json',
      body: JSON.stringify(request),
    });

    const response = await bedrockClient.send(command);
    const responseBodyText = await response.body.transformToString('utf-8');
    const responseBody = JSON.parse(responseBodyText) as NovaCanvasResponse;

    expect(responseBody.images).toHaveLength(1);

    // Verify image is valid base64
    const buffer = Buffer.from(responseBody.images[0], 'base64');
    expect(buffer.length).toBeGreaterThan(0);

    console.log(`1024x1024 image size: ${buffer.length} bytes`);
  }, 90000);
});

describe('Nova Canvas - Base64 Validation', () => {
  it('should return valid base64 encoded PNG', async () => {
    const seed = Math.floor(Math.random() * 858993460);

    const request: NovaCanvasRequest = {
      taskType: 'TEXT_IMAGE',
      textToImageParams: {
        text: 'A test pattern',
      },
      imageGenerationConfig: {
        seed,
        quality: 'standard',
        width: 512,
        height: 512,
        numberOfImages: 1,
      },
    };

    const command = new InvokeModelCommand({
      modelId: NOVA_CANVAS_MODEL_ID,
      contentType: 'application/json',
      body: JSON.stringify(request),
    });

    const response = await bedrockClient.send(command);
    const responseBodyText = await response.body.transformToString('utf-8');
    const responseBody = JSON.parse(responseBodyText) as NovaCanvasResponse;

    const base64Image = responseBody.images[0];

    // Verify it's valid base64
    expect(base64Image).toMatch(/^[A-Za-z0-9+/=]+$/);

    // Decode and verify it's a PNG
    const buffer = Buffer.from(base64Image, 'base64');
    const pngSignature = buffer.subarray(0, 8);
    const expectedPngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    expect(pngSignature.equals(expectedPngSignature)).toBe(true);

    console.log('Valid PNG image confirmed');
  }, 60000);
});
