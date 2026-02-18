import { describe, it, expect, beforeAll } from '@jest/globals';

process.env.COGNITO_USER_POOL_ID = 'us-east-1_TestPool';
process.env.COGNITO_REGION = 'us-east-1';

let normalizePath: typeof import('../s3-storage.js').normalizePath;
let getUserStoragePrefix: typeof import('../s3-storage.js').getUserStoragePrefix;

beforeAll(async () => {
  const mod = await import('../s3-storage.js');
  normalizePath = mod.normalizePath;
  getUserStoragePrefix = mod.getUserStoragePrefix;
});

describe('getUserStoragePrefix', () => {
  it('should generate prefix with user ID', () => {
    expect(getUserStoragePrefix('user-123')).toBe('users/user-123');
  });

  it('should handle UUID-style user IDs', () => {
    expect(getUserStoragePrefix('a7a42a28-c031-70fd-66d7-a2c7fd31b14f')).toBe(
      'users/a7a42a28-c031-70fd-66d7-a2c7fd31b14f'
    );
  });
});

describe('normalizePath', () => {
  it('should strip leading and trailing slashes', () => {
    expect(normalizePath('/documents/')).toBe('documents');
    expect(normalizePath('///path///')).toBe('path');
  });

  it('should return empty string for root paths', () => {
    expect(normalizePath('/')).toBe('');
    expect(normalizePath('')).toBe('');
  });

  it('should decode URL-encoded paths', () => {
    expect(normalizePath('my%20folder')).toBe('my folder');
    expect(normalizePath('/hello%2Fworld/')).toBe('hello/world');
  });

  it('should handle double URL encoding', () => {
    const doubleEncoded = encodeURIComponent(encodeURIComponent('my folder'));
    expect(normalizePath(doubleEncoded)).toBe('my folder');
  });

  it('should strip /tmp/ws/ prefix (hallucination mitigation)', () => {
    expect(normalizePath('tmp/ws/reports/data.csv')).toBe('reports/data.csv');
    expect(normalizePath('/tmp/ws/reports/data.csv')).toBe('reports/data.csv');
  });

  it('should strip /tmp/ prefix', () => {
    expect(normalizePath('tmp/reports/data.csv')).toBe('reports/data.csv');
    expect(normalizePath('/tmp/reports/data.csv')).toBe('reports/data.csv');
  });

  it('should handle paths with no prefix to strip', () => {
    expect(normalizePath('documents/file.txt')).toBe('documents/file.txt');
  });

  it('should handle complex combined cases', () => {
    expect(normalizePath('/tmp/ws/my%20folder/file.txt')).toBe('my folder/file.txt');
  });

  it('should not break on already-clean paths', () => {
    expect(normalizePath('reports/2026/data.json')).toBe('reports/2026/data.json');
  });

  it('should handle malformed encoding gracefully', () => {
    expect(normalizePath('%ZZinvalid')).toBe('%ZZinvalid');
  });
});
