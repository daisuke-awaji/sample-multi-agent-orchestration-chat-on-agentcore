/**
 * Unit tests for input-builder utilities
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { buildInputContent } from '../input-builder.js';
import type { ImageData } from '../../validation/index.js';

// Mock logger to prevent console output during tests
jest.mock('../../config/index.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('buildInputContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('text-only input', () => {
    it('should return prompt string when no images provided', () => {
      const result = buildInputContent('Hello, world!');
      expect(result).toBe('Hello, world!');
    });

    it('should return prompt string when images array is empty', () => {
      const result = buildInputContent('Hello, world!', []);
      expect(result).toBe('Hello, world!');
    });

    it('should return prompt string when images is undefined', () => {
      const result = buildInputContent('Test prompt', undefined);
      expect(result).toBe('Test prompt');
    });
  });

  describe('multimodal input with images', () => {
    // Create a minimal valid PNG (1x1 transparent pixel)
    const validPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    // Create a minimal valid JPEG
    const validJpegBase64 =
      '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQACEQA/AL+AB//Z';

    it('should return ContentBlock array when images are provided', () => {
      const images: ImageData[] = [{ base64: validPngBase64, mimeType: 'image/png' }];

      const result = buildInputContent('Describe this image', images);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2); // text + 1 image
    });

    it('should include TextBlock when prompt is not empty', () => {
      const images: ImageData[] = [{ base64: validPngBase64, mimeType: 'image/png' }];

      const result = buildInputContent('Describe this image', images);

      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        const textBlock = result[0];
        expect(textBlock).toBeDefined();
        expect('text' in textBlock).toBe(true);
      }
    });

    it('should not include TextBlock when prompt is empty/whitespace', () => {
      const images: ImageData[] = [{ base64: validPngBase64, mimeType: 'image/png' }];

      const result = buildInputContent('   ', images);

      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        expect(result).toHaveLength(1); // Only image, no text
      }
    });

    it('should handle multiple images', () => {
      const images: ImageData[] = [
        { base64: validPngBase64, mimeType: 'image/png' },
        { base64: validJpegBase64, mimeType: 'image/jpeg' },
      ];

      const result = buildInputContent('Compare these images', images);

      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        expect(result).toHaveLength(3); // text + 2 images
      }
    });

    it('should create ImageBlock with correct format for PNG', () => {
      const images: ImageData[] = [{ base64: validPngBase64, mimeType: 'image/png' }];

      const result = buildInputContent('Test', images);

      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        const imageBlock = result[1] as { type: string; format: string; source: unknown };
        expect(imageBlock).toBeDefined();
        expect(imageBlock.type).toBe('imageBlock');
        expect(imageBlock.format).toBe('png');
      }
    });

    it('should create ImageBlock with correct format for JPEG', () => {
      const images: ImageData[] = [{ base64: validJpegBase64, mimeType: 'image/jpeg' }];

      const result = buildInputContent('Test', images);

      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        const imageBlock = result[1] as { type: string; format: string; source: unknown };
        expect(imageBlock.type).toBe('imageBlock');
        expect(imageBlock.format).toBe('jpeg');
      }
    });

    it('should throw error for unknown mime types (security: defense in depth)', () => {
      const images: ImageData[] = [{ base64: validPngBase64, mimeType: 'image/unknown' }];

      expect(() => buildInputContent('Test', images)).toThrow(
        "Unsupported image MIME type: 'image/unknown'"
      );
    });

    it('should throw error for potentially dangerous mime types', () => {
      const images: ImageData[] = [{ base64: validPngBase64, mimeType: 'image/svg+xml' }];

      expect(() => buildInputContent('Test', images)).toThrow('Unsupported image MIME type');
    });

    it('should convert base64 to bytes in source', () => {
      const images: ImageData[] = [{ base64: validPngBase64, mimeType: 'image/png' }];

      const result = buildInputContent('Test', images);

      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        const imageBlock = result[1] as { source: { bytes: Uint8Array } };
        expect(imageBlock.source).toBeDefined();
        expect(imageBlock.source.bytes).toBeInstanceOf(Uint8Array);
        expect(imageBlock.source.bytes.length).toBeGreaterThan(0);
      }
    });
  });
});
