/**
 * Scoped Credentials Helper - Unit Tests
 *
 * Verifies the initialization helper correctly manages the lifecycle
 * of scoped credentials in the request context.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// --- Mock scoped-credentials module ---
const mockGetCredentials = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockClearCache = jest.fn();

jest.unstable_mockModule('../scoped-credentials.js', () => ({
  ScopedCredentialsService: jest.fn().mockImplementation(() => ({
    getCredentials: mockGetCredentials,
    clearCache: mockClearCache,
    clearCacheForUser: jest.fn(),
  })),
}));

const { initializeScopedCredentials, resetServiceInstance, isScopedCredentialsEnabled } =
  await import('../scoped-credentials-helper.js');

describe('scoped-credentials-helper', () => {
  const TEST_USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  const mockCredentials = {
    accessKeyId: 'ASIA_TEST',
    secretAccessKey: 'secret', // pragma: allowlist secret
    sessionToken: 'token', // pragma: allowlist secret
    expiration: new Date(Date.now() + 3600 * 1000),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resetServiceInstance();
  });

  afterEach(() => {
    // Clean up env vars
    delete process.env.SCOPED_CREDENTIALS_ROLE_ARN;
    delete process.env.USER_STORAGE_BUCKET_NAME;
    resetServiceInstance();
  });

  describe('isScopedCredentialsEnabled', () => {
    it('should return false when neither env var is set', () => {
      expect(isScopedCredentialsEnabled()).toBe(false);
    });

    it('should return false when only ROLE_ARN is set', () => {
      process.env.SCOPED_CREDENTIALS_ROLE_ARN = 'arn:aws:iam::123456789012:role/test';
      expect(isScopedCredentialsEnabled()).toBe(false);
    });

    it('should return false when only BUCKET_NAME is set', () => {
      process.env.USER_STORAGE_BUCKET_NAME = 'test-bucket';
      expect(isScopedCredentialsEnabled()).toBe(false);
    });

    it('should return true when both env vars are set', () => {
      process.env.SCOPED_CREDENTIALS_ROLE_ARN = 'arn:aws:iam::123456789012:role/test';
      process.env.USER_STORAGE_BUCKET_NAME = 'test-bucket';
      expect(isScopedCredentialsEnabled()).toBe(true);
    });
  });

  describe('initializeScopedCredentials', () => {
    it('should return null when not configured', async () => {
      const result = await initializeScopedCredentials(TEST_USER_ID);
      expect(result).toBeNull();
    });

    it('should return null for anonymous users', async () => {
      process.env.SCOPED_CREDENTIALS_ROLE_ARN = 'arn:aws:iam::123456789012:role/test';
      process.env.USER_STORAGE_BUCKET_NAME = 'test-bucket';

      const result = await initializeScopedCredentials('anonymous');
      expect(result).toBeNull();
    });

    it('should fetch and return credentials when configured', async () => {
      process.env.SCOPED_CREDENTIALS_ROLE_ARN = 'arn:aws:iam::123456789012:role/test';
      process.env.USER_STORAGE_BUCKET_NAME = 'test-bucket';

      mockGetCredentials.mockResolvedValue(mockCredentials);

      const result = await initializeScopedCredentials(TEST_USER_ID);
      expect(result).toEqual(mockCredentials);
      expect(mockGetCredentials).toHaveBeenCalledWith(TEST_USER_ID);
    });

    it('should attach credentials to request context', async () => {
      process.env.SCOPED_CREDENTIALS_ROLE_ARN = 'arn:aws:iam::123456789012:role/test';
      process.env.USER_STORAGE_BUCKET_NAME = 'test-bucket';

      mockGetCredentials.mockResolvedValue(mockCredentials);

      const context = { scopedCredentials: undefined } as { scopedCredentials: unknown };
      await initializeScopedCredentials(TEST_USER_ID, context as never);

      expect(context.scopedCredentials).toEqual(mockCredentials);
    });

    it('should return null and not throw when STS fails', async () => {
      process.env.SCOPED_CREDENTIALS_ROLE_ARN = 'arn:aws:iam::123456789012:role/test';
      process.env.USER_STORAGE_BUCKET_NAME = 'test-bucket';

      mockGetCredentials.mockRejectedValue(new Error('STS rate limit exceeded'));

      const result = await initializeScopedCredentials(TEST_USER_ID);
      expect(result).toBeNull();
      // Should not throw
    });

    it('should not modify context when STS fails', async () => {
      process.env.SCOPED_CREDENTIALS_ROLE_ARN = 'arn:aws:iam::123456789012:role/test';
      process.env.USER_STORAGE_BUCKET_NAME = 'test-bucket';

      mockGetCredentials.mockRejectedValue(new Error('STS error'));

      const context = { scopedCredentials: undefined } as { scopedCredentials: unknown };
      await initializeScopedCredentials(TEST_USER_ID, context as never);

      expect(context.scopedCredentials).toBeUndefined();
    });
  });
});
