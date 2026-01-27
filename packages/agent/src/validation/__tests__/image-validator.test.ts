/**
 * Unit tests for image-validator utilities
 */

import { describe, it, expect } from '@jest/globals';
import { validateImageData, IMAGE_VALIDATION_CONFIG } from '../image-validator.js';
import type { ImageData } from '../image-validator.js';

describe('validateImageData', () => {
  // Valid minimal JPEG
  const validJpegBase64 =
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQACEQA/AL+AB//Z';

  // Valid minimal GIF
  const validGifBase64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  // Valid minimal WebP
  const validWebpBase64 =
    'UklGRlYAAABXRUJQVlA4IEoAAADQAQCdASoBAAEAAQAcJYgCdAEO/hOMAAD++O9PwAzTXl3ykRORPG+e/9X/T7zzPyqY0V7LOAB4fRYAYXU7xOwAaX/u9w03/xZQAAAA';

  describe('valid images', () => {
    it('should accept valid JPEG image', () => {
      const images: ImageData[] = [{ base64: validJpegBase64, mimeType: 'image/jpeg' }];
      const result = validateImageData(images);
      expect(result.valid).toBe(true);
    });

    it('should accept valid GIF image', () => {
      const images: ImageData[] = [{ base64: validGifBase64, mimeType: 'image/gif' }];
      const result = validateImageData(images);
      expect(result.valid).toBe(true);
    });

    it('should accept valid WebP image', () => {
      const images: ImageData[] = [{ base64: validWebpBase64, mimeType: 'image/webp' }];
      const result = validateImageData(images);
      expect(result.valid).toBe(true);
    });

    it('should accept multiple valid images', () => {
      const images: ImageData[] = [
        { base64: validJpegBase64, mimeType: 'image/jpeg' },
        { base64: validGifBase64, mimeType: 'image/gif' },
        { base64: validWebpBase64, mimeType: 'image/webp' },
      ];
      const result = validateImageData(images);
      expect(result.valid).toBe(true);
    });

    it('should accept maximum allowed images', () => {
      const images: ImageData[] = Array(IMAGE_VALIDATION_CONFIG.MAX_IMAGES).fill({
        base64: validGifBase64,
        mimeType: 'image/gif',
      });
      const result = validateImageData(images);
      expect(result.valid).toBe(true);
    });
  });

  describe('image count validation', () => {
    it('should reject when exceeding maximum image count', () => {
      const images: ImageData[] = Array(IMAGE_VALIDATION_CONFIG.MAX_IMAGES + 1).fill({
        base64: validGifBase64,
        mimeType: 'image/gif',
      });
      const result = validateImageData(images);
      expect(result.valid).toBe(false);
      expect(result.error).toContain(
        `Maximum ${IMAGE_VALIDATION_CONFIG.MAX_IMAGES} images allowed`
      );
      expect(result.error).toContain(`received ${IMAGE_VALIDATION_CONFIG.MAX_IMAGES + 1}`);
    });

    it('should accept empty image array', () => {
      const result = validateImageData([]);
      expect(result.valid).toBe(true);
    });
  });

  describe('MIME type validation', () => {
    it('should reject invalid MIME type', () => {
      const images: ImageData[] = [{ base64: validGifBase64, mimeType: 'image/bmp' }];
      const result = validateImageData(images);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid MIME type 'image/bmp'");
      expect(result.error).toContain('Allowed types:');
    });

    it('should reject non-image MIME type', () => {
      const images: ImageData[] = [{ base64: validGifBase64, mimeType: 'application/pdf' }];
      const result = validateImageData(images);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid MIME type 'application/pdf'");
    });

    it('should include image index in error message', () => {
      const images: ImageData[] = [
        { base64: validGifBase64, mimeType: 'image/gif' },
        { base64: validGifBase64, mimeType: 'image/invalid' },
      ];
      const result = validateImageData(images);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Image 2:');
    });
  });

  describe('base64 validation', () => {
    it('should reject content that does not match mime type (invalid magic bytes)', () => {
      // This is technically valid base64 but contains invalid image data for GIF
      const invalidContent = Buffer.from('not a real image').toString('base64');
      const images: ImageData[] = [{ base64: invalidContent, mimeType: 'image/gif' }];
      const result = validateImageData(images);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('File content does not match declared MIME type');
    });

    it('should accept valid base64 with padding', () => {
      const images: ImageData[] = [{ base64: validGifBase64, mimeType: 'image/gif' }];
      const result = validateImageData(images);
      expect(result.valid).toBe(true);
    });
  });

  describe('file size validation', () => {
    it('should reject images exceeding size limit', () => {
      // Create a large base64 string that exceeds 5MB when decoded
      // Each base64 character represents 6 bits, so we need ~6.67MB of base64 for 5MB decoded
      const largeBase64 = 'R0lGODlhAQAB' + 'A'.repeat(7 * 1024 * 1024);
      const images: ImageData[] = [{ base64: largeBase64, mimeType: 'image/gif' }];
      const result = validateImageData(images);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds 5MB limit');
    });

    it('should include file size in error message', () => {
      const largeBase64 = 'R0lGODlhAQAB' + 'A'.repeat(7 * 1024 * 1024);
      const images: ImageData[] = [{ base64: largeBase64, mimeType: 'image/gif' }];
      const result = validateImageData(images);
      expect(result.error).toMatch(/File size \(\d+\.\d+MB\)/);
    });
  });

  describe('magic number validation', () => {
    it('should reject GIF MIME type with JPEG content', () => {
      const images: ImageData[] = [{ base64: validJpegBase64, mimeType: 'image/gif' }];
      const result = validateImageData(images);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('File content does not match declared MIME type');
    });

    it('should reject JPEG MIME type with GIF content', () => {
      const images: ImageData[] = [{ base64: validGifBase64, mimeType: 'image/jpeg' }];
      const result = validateImageData(images);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('File content does not match declared MIME type');
    });

    it('should reject WebP MIME type with GIF content', () => {
      const images: ImageData[] = [{ base64: validGifBase64, mimeType: 'image/webp' }];
      const result = validateImageData(images);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("MIME type 'image/webp'");
    });

    it('should accept image/jpg alias for JPEG', () => {
      const images: ImageData[] = [{ base64: validJpegBase64, mimeType: 'image/jpg' }];
      const result = validateImageData(images);
      expect(result.valid).toBe(true);
    });
  });

  describe('IMAGE_VALIDATION_CONFIG', () => {
    it('should have correct MAX_FILE_SIZE', () => {
      expect(IMAGE_VALIDATION_CONFIG.MAX_FILE_SIZE).toBe(5 * 1024 * 1024);
    });

    it('should have correct MAX_IMAGES', () => {
      expect(IMAGE_VALIDATION_CONFIG.MAX_IMAGES).toBe(4);
    });

    it('should have all expected MIME types', () => {
      expect(IMAGE_VALIDATION_CONFIG.ALLOWED_MIME_TYPES).toContain('image/png');
      expect(IMAGE_VALIDATION_CONFIG.ALLOWED_MIME_TYPES).toContain('image/jpeg');
      expect(IMAGE_VALIDATION_CONFIG.ALLOWED_MIME_TYPES).toContain('image/jpg');
      expect(IMAGE_VALIDATION_CONFIG.ALLOWED_MIME_TYPES).toContain('image/gif');
      expect(IMAGE_VALIDATION_CONFIG.ALLOWED_MIME_TYPES).toContain('image/webp');
    });

    it('should have magic numbers for all allowed types', () => {
      for (const mimeType of IMAGE_VALIDATION_CONFIG.ALLOWED_MIME_TYPES) {
        expect(IMAGE_VALIDATION_CONFIG.MAGIC_NUMBERS[mimeType]).toBeDefined();
        expect(Array.isArray(IMAGE_VALIDATION_CONFIG.MAGIC_NUMBERS[mimeType])).toBe(true);
      }
    });
  });
});
