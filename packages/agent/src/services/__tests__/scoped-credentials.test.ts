/**
 * Scoped Credentials Service - Unit Tests
 *
 * Verifies that STS AssumeRole is called with correct inline session policies
 * to restrict S3 access to the user's own directory only.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// --- Mock STS Client ---
const mockSend = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.unstable_mockModule('@aws-sdk/client-sts', () => ({
  STSClient: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  AssumeRoleCommand: jest.fn().mockImplementation((...args: unknown[]) => ({
    ...(typeof args[0] === 'object' && args[0] !== null ? args[0] : {}),
    __type: 'AssumeRoleCommand',
  })),
}));

// Dynamic import after mocking
const { ScopedCredentialsService } = await import('../scoped-credentials.js');

describe('ScopedCredentialsService', () => {
  const TEST_ROLE_ARN = 'arn:aws:iam::123456789012:role/test-runtime-role';
  const TEST_BUCKET = 'test-user-storage-bucket';
  const TEST_USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  let service: InstanceType<typeof ScopedCredentialsService>;

  const mockCredentials = {
    Credentials: {
      AccessKeyId: 'ASIA_TEST_KEY',
      SecretAccessKey: 'test-secret-key', // pragma: allowlist secret
      SessionToken: 'test-session-token', // pragma: allowlist secret
      Expiration: new Date(Date.now() + 3600 * 1000),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue(mockCredentials);
    service = new ScopedCredentialsService({
      roleArn: TEST_ROLE_ARN,
      bucketName: TEST_BUCKET,
    });
  });

  afterEach(() => {
    service.clearCache();
  });

  describe('getCredentials', () => {
    it('should call STS AssumeRole with correct role ARN and session name', async () => {
      await service.getCredentials(TEST_USER_ID);

      const { AssumeRoleCommand } = await import('@aws-sdk/client-sts');
      expect(AssumeRoleCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          RoleArn: TEST_ROLE_ARN,
          RoleSessionName: expect.stringContaining('user-'),
        })
      );
    });

    it('should include inline session policy scoped to user prefix', async () => {
      await service.getCredentials(TEST_USER_ID);

      const { AssumeRoleCommand } = await import('@aws-sdk/client-sts');
      const mockCalls = (AssumeRoleCommand as unknown as jest.Mock).mock.calls;
      const callArgs = mockCalls[0][0] as { Policy: string };
      const policy = JSON.parse(callArgs.Policy);

      // Verify the policy restricts to user's prefix
      expect(policy.Version).toBe('2012-10-17');
      expect(policy.Statement).toHaveLength(2);

      // Statement 0: Object-level actions
      const objectStatement = policy.Statement[0];
      expect(objectStatement.Effect).toBe('Allow');
      expect(objectStatement.Action).toEqual(
        expect.arrayContaining(['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:HeadObject'])
      );
      expect(objectStatement.Resource).toContain(
        `arn:aws:s3:::${TEST_BUCKET}/users/${TEST_USER_ID}/*`
      );

      // Statement 1: ListBucket with prefix condition
      const listStatement = policy.Statement[1];
      expect(listStatement.Effect).toBe('Allow');
      expect(listStatement.Action).toContain('s3:ListBucket');
      expect(listStatement.Resource).toContain(`arn:aws:s3:::${TEST_BUCKET}`);
      expect(listStatement.Condition.StringLike['s3:prefix']).toContain(
        `users/${TEST_USER_ID}/*`
      );
    });

    it('should return credentials from STS response', async () => {
      const result = await service.getCredentials(TEST_USER_ID);

      expect(result).toEqual({
        accessKeyId: 'ASIA_TEST_KEY',
        secretAccessKey: 'test-secret-key', // pragma: allowlist secret
        sessionToken: 'test-session-token', // pragma: allowlist secret
        expiration: mockCredentials.Credentials.Expiration,
      });
    });

    it('should set DurationSeconds to 3600', async () => {
      await service.getCredentials(TEST_USER_ID);

      const { AssumeRoleCommand } = await import('@aws-sdk/client-sts');
      expect(AssumeRoleCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          DurationSeconds: 3600,
        })
      );
    });

    it('should truncate long user IDs in session name to stay within 64 char limit', async () => {
      const longUserId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      await service.getCredentials(longUserId);

      const { AssumeRoleCommand } = await import('@aws-sdk/client-sts');
      const mockCalls = (AssumeRoleCommand as unknown as jest.Mock).mock.calls;
      const callArgs = mockCalls[0][0] as { RoleSessionName: string };

      expect(callArgs.RoleSessionName.length).toBeLessThanOrEqual(64);
    });

    it('should throw an error when STS returns no credentials', async () => {
      mockSend.mockResolvedValue({});

      await expect(service.getCredentials(TEST_USER_ID)).rejects.toThrow(
        'STS AssumeRole returned no credentials'
      );
    });

    it('should throw an error when STS call fails', async () => {
      mockSend.mockRejectedValue(new Error('Access Denied'));

      await expect(service.getCredentials(TEST_USER_ID)).rejects.toThrow('Access Denied');
    });
  });

  describe('credential caching', () => {
    it('should cache credentials for the same userId', async () => {
      // First call
      await service.getCredentials(TEST_USER_ID);
      // Second call
      await service.getCredentials(TEST_USER_ID);

      // STS should only be called once
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should not reuse cache for different userIds', async () => {
      const anotherUserId = 'x9y8z7w6-v5u4-3210-fedc-ba0987654321';

      await service.getCredentials(TEST_USER_ID);
      await service.getCredentials(anotherUserId);

      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should refresh expired credentials', async () => {
      // First call with credentials that expire immediately
      const expiredCredentials = {
        Credentials: {
          ...mockCredentials.Credentials,
          Expiration: new Date(Date.now() - 1000), // Already expired
        },
      };
      mockSend.mockResolvedValueOnce(expiredCredentials);

      await service.getCredentials(TEST_USER_ID);

      // Second call should make a new STS call
      mockSend.mockResolvedValueOnce(mockCredentials);
      await service.getCredentials(TEST_USER_ID);

      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should refresh credentials nearing expiration (within buffer)', async () => {
      // Credentials expiring in 2 minutes (within 5-minute refresh buffer)
      const nearExpiryCredentials = {
        Credentials: {
          ...mockCredentials.Credentials,
          Expiration: new Date(Date.now() + 2 * 60 * 1000),
        },
      };
      mockSend.mockResolvedValueOnce(nearExpiryCredentials);

      await service.getCredentials(TEST_USER_ID);

      // Second call should refresh because within buffer
      mockSend.mockResolvedValueOnce(mockCredentials);
      await service.getCredentials(TEST_USER_ID);

      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should clear cache for a specific user', async () => {
      await service.getCredentials(TEST_USER_ID);

      service.clearCacheForUser(TEST_USER_ID);

      await service.getCredentials(TEST_USER_ID);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should clear all cache', async () => {
      const anotherUserId = 'x9y8z7w6-v5u4-3210-fedc-ba0987654321';

      await service.getCredentials(TEST_USER_ID);
      await service.getCredentials(anotherUserId);

      service.clearCache();

      await service.getCredentials(TEST_USER_ID);
      await service.getCredentials(anotherUserId);

      expect(mockSend).toHaveBeenCalledTimes(4);
    });
  });

  describe('toEnvVars', () => {
    it('should convert credentials to environment variable format', async () => {
      const creds = await service.getCredentials(TEST_USER_ID);
      const envVars = ScopedCredentialsService.toEnvVars(creds);

      expect(envVars).toEqual({
        AWS_ACCESS_KEY_ID: 'ASIA_TEST_KEY',
        AWS_SECRET_ACCESS_KEY: 'test-secret-key', // pragma: allowlist secret
        AWS_SESSION_TOKEN: 'test-session-token', // pragma: allowlist secret
      });
    });
  });
});
