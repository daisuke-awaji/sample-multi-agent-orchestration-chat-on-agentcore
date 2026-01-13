/**
 * Unit tests for workspace-sync-helper utilities
 */

import { describe, it, expect } from '@jest/globals';
import { validateStoragePath } from '../workspace-sync-helper.js';

describe('validateStoragePath', () => {
  describe('valid paths', () => {
    it('should accept simple path', () => {
      expect(() => validateStoragePath('documents')).not.toThrow();
    });

    it('should accept path with forward slashes', () => {
      expect(() => validateStoragePath('documents/project/src')).not.toThrow();
    });

    it('should accept path with leading slash', () => {
      expect(() => validateStoragePath('/documents')).not.toThrow();
    });

    it('should accept path with trailing slash', () => {
      expect(() => validateStoragePath('documents/')).not.toThrow();
    });

    it('should accept path with hyphens and underscores', () => {
      expect(() => validateStoragePath('my-project/sub_folder')).not.toThrow();
    });

    it('should accept path with numbers', () => {
      expect(() => validateStoragePath('project123/v2')).not.toThrow();
    });

    it('should accept path with dots (file extensions)', () => {
      expect(() => validateStoragePath('documents/file.txt')).not.toThrow();
    });

    it('should accept empty path', () => {
      expect(() => validateStoragePath('')).not.toThrow();
    });

    it('should accept root path', () => {
      expect(() => validateStoragePath('/')).not.toThrow();
    });
  });

  describe('path traversal prevention', () => {
    it('should reject path with double dots', () => {
      expect(() => validateStoragePath('../')).toThrow(
        "path traversal sequences ('..') are not allowed"
      );
    });

    it('should reject path with double dots in middle', () => {
      expect(() => validateStoragePath('documents/../secrets')).toThrow(
        "path traversal sequences ('..') are not allowed"
      );
    });

    it('should reject path with multiple traversal sequences', () => {
      expect(() => validateStoragePath('a/../../b')).toThrow(
        "path traversal sequences ('..') are not allowed"
      );
    });

    it('should reject path attempting to escape user directory', () => {
      expect(() => validateStoragePath('../../../other-user/data')).toThrow(
        "path traversal sequences ('..') are not allowed"
      );
    });
  });

  describe('null byte prevention', () => {
    it('should reject path with null byte', () => {
      expect(() => validateStoragePath('documents\0/secret')).toThrow('null bytes are not allowed');
    });
  });

  describe('invalid characters', () => {
    it('should reject path with spaces', () => {
      expect(() => validateStoragePath('my documents')).toThrow(
        'only alphanumeric characters, hyphens, underscores, dots, and forward slashes are allowed'
      );
    });

    it('should reject path with special characters', () => {
      expect(() => validateStoragePath('documents@home')).toThrow(
        'only alphanumeric characters, hyphens, underscores, dots, and forward slashes are allowed'
      );
    });

    it('should reject path with backslashes', () => {
      expect(() => validateStoragePath('documents\\subfolder')).toThrow(
        'only alphanumeric characters, hyphens, underscores, dots, and forward slashes are allowed'
      );
    });

    it('should reject path with asterisk', () => {
      expect(() => validateStoragePath('documents/*')).toThrow(
        'only alphanumeric characters, hyphens, underscores, dots, and forward slashes are allowed'
      );
    });

    it('should reject path with question mark', () => {
      expect(() => validateStoragePath('documents?query')).toThrow(
        'only alphanumeric characters, hyphens, underscores, dots, and forward slashes are allowed'
      );
    });

    it('should reject path with non-ASCII characters', () => {
      expect(() => validateStoragePath('documents/\u65E5\u672C\u8A9E')).toThrow(
        'only alphanumeric characters, hyphens, underscores, dots, and forward slashes are allowed'
      );
    });

    it('should reject path with colon (Windows drive letter)', () => {
      expect(() => validateStoragePath('C:/documents')).toThrow(
        'only alphanumeric characters, hyphens, underscores, dots, and forward slashes are allowed'
      );
    });
  });

  describe('protocol-relative path prevention', () => {
    it('should reject protocol-relative paths', () => {
      expect(() => validateStoragePath('//evil.com/path')).toThrow(
        'protocol-relative paths are not allowed'
      );
    });
  });

  describe('path depth limit', () => {
    it('should accept path with reasonable depth', () => {
      const path = Array(10).fill('dir').join('/');
      expect(() => validateStoragePath(path)).not.toThrow();
    });

    it('should accept path at maximum depth (50)', () => {
      const path = Array(50).fill('d').join('/');
      expect(() => validateStoragePath(path)).not.toThrow();
    });

    it('should reject path exceeding maximum depth', () => {
      const path = Array(51).fill('d').join('/');
      expect(() => validateStoragePath(path)).toThrow('path depth exceeds maximum allowed (50)');
    });
  });
});
