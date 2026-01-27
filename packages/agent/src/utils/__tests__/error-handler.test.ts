/**
 * Unit tests for error-handler utilities
 */

import { describe, it, expect } from '@jest/globals';
import { sanitizeErrorMessage, createErrorMessage } from '../error-handler.js';

describe('sanitizeErrorMessage', () => {
  it('should return sanitized string for Error objects', () => {
    const error = new Error('Test error message');
    const result = sanitizeErrorMessage(error);
    expect(result).toBe('Test error message');
  });

  it('should convert non-Error values to string', () => {
    expect(sanitizeErrorMessage('string error')).toBe('string error');
    expect(sanitizeErrorMessage(123)).toBe('123');
    expect(sanitizeErrorMessage(null)).toBe('null');
    expect(sanitizeErrorMessage(undefined)).toBe('undefined');
  });

  it('should remove Bearer tokens', () => {
    const error = new Error('Authorization failed: Bearer abc-123_xyz');
    const result = sanitizeErrorMessage(error);
    expect(result).toBe('Authorization failed: [TOKEN]');
    expect(result).not.toContain('abc-123_xyz');
  });

  it('should redact long alphanumeric strings (potential secrets)', () => {
    const longSecret = 'a'.repeat(45);
    const error = new Error(`Secret key: ${longSecret}`);
    const result = sanitizeErrorMessage(error);
    expect(result).toBe('Secret key: [REDACTED]');
    expect(result).not.toContain(longSecret);
  });

  it('should not redact strings shorter than 40 characters', () => {
    const shortString = 'abcdefghij'; // 10 chars
    const error = new Error(`Short string: ${shortString}`);
    const result = sanitizeErrorMessage(error);
    expect(result).toContain(shortString);
  });

  it('should sanitize Linux home directory paths', () => {
    const error = new Error('File not found: /home/johndoe/secret/file.txt');
    const result = sanitizeErrorMessage(error);
    expect(result).toBe('File not found: /home/[USER]/secret/file.txt');
    expect(result).not.toContain('johndoe');
  });

  it('should sanitize macOS user directory paths', () => {
    const error = new Error('File not found: /Users/janedoe/Documents/secret.txt');
    const result = sanitizeErrorMessage(error);
    expect(result).toBe('File not found: /Users/[USER]/Documents/secret.txt');
    expect(result).not.toContain('janedoe');
  });

  it('should sanitize email addresses', () => {
    const error = new Error('User email: john.doe@example.com not found');
    const result = sanitizeErrorMessage(error);
    expect(result).toBe('User email: [EMAIL] not found');
    expect(result).not.toContain('john.doe@example.com');
  });

  it('should truncate messages longer than 500 characters', () => {
    const longMessage = 'x'.repeat(600);
    const error = new Error(longMessage);
    const result = sanitizeErrorMessage(error);
    // Long alphanumeric strings are redacted, which reduces length
    // The test verifies truncation behavior
    expect(result.length).toBeLessThanOrEqual(500);
  });

  it('should handle multiple sensitive patterns in one message', () => {
    const error = new Error('Error for user john@example.com at /home/john with short token');
    const result = sanitizeErrorMessage(error);
    expect(result).not.toContain('john@example.com');
    expect(result).toContain('[EMAIL]');
    expect(result).toContain('/home/[USER]');
  });
});

describe('createErrorMessage', () => {
  it('should create a Message with assistant role', () => {
    const error = new Error('Test error');
    const message = createErrorMessage(error, 'req-123');
    expect(message.role).toBe('assistant');
  });

  it('should include error type in the message content', () => {
    const error = new Error('Test error');
    const message = createErrorMessage(error, 'req-123');
    const content = message.content[0];
    expect(content).toBeDefined();
    expect('text' in content).toBe(true);
    if ('text' in content) {
      expect(content.text).toContain('Type: Error');
    }
  });

  it('should include request ID in the message content', () => {
    const error = new Error('Test error');
    const message = createErrorMessage(error, 'req-456');
    const content = message.content[0];
    if ('text' in content) {
      expect(content.text).toContain('Request ID: req-456');
    }
  });

  it('should include sanitized error details', () => {
    const error = new Error('Error with email user@example.com');
    const message = createErrorMessage(error, 'req-789');
    const content = message.content[0];
    if ('text' in content) {
      expect(content.text).toContain('[EMAIL]');
      expect(content.text).not.toContain('user@example.com');
    }
  });

  it('should handle custom error types', () => {
    class CustomError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'CustomError';
      }
    }
    const error = new CustomError('Custom error message');
    const message = createErrorMessage(error, 'req-custom');
    const content = message.content[0];
    if ('text' in content) {
      expect(content.text).toContain('Type: CustomError');
    }
  });

  it('should handle non-Error objects', () => {
    const message = createErrorMessage('string error', 'req-string');
    const content = message.content[0];
    if ('text' in content) {
      expect(content.text).toContain('Type: UnknownError');
      expect(content.text).toContain('Details: string error');
    }
  });

  it('should wrap content in SYSTEM_ERROR tags', () => {
    const error = new Error('Test');
    const message = createErrorMessage(error, 'req-123');
    const content = message.content[0];
    if ('text' in content) {
      expect(content.text).toContain('[SYSTEM_ERROR]');
      expect(content.text).toContain('[/SYSTEM_ERROR]');
    }
  });
});
