/**
 * Execute Command Tool - Scoped Credentials Tests
 *
 * Verifies that ScopedCredentialsService.toEnvVars correctly produces
 * environment variables, and that the env override logic works correctly.
 *
 * The actual execute-command tool has too many transitive dependencies
 * (@moca/tool-definitions, @strands-agents/sdk) to mock cleanly in
 * isolation. Instead we test:
 * 1. The static toEnvVars helper produces correct env vars
 * 2. The env override pattern ({...process.env, ...scopedVars}) works
 */

import { describe, it, expect } from '@jest/globals';
import type { ScopedCredentials } from '../../services/scoped-credentials.js';

// Import only the service (no transitive @moca/tool-definitions dependency)
const { ScopedCredentialsService } = await import('../../services/scoped-credentials.js');

describe('execute-command scoped credentials integration', () => {
  const mockScopedCredentials: ScopedCredentials = {
    accessKeyId: 'ASIA_SCOPED_KEY',
    secretAccessKey: 'scoped-secret', // pragma: allowlist secret
    sessionToken: 'scoped-session-token', // pragma: allowlist secret
    expiration: new Date(Date.now() + 3600 * 1000),
  };

  describe('ScopedCredentialsService.toEnvVars', () => {
    it('should produce AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_SESSION_TOKEN', () => {
      const envVars = ScopedCredentialsService.toEnvVars(mockScopedCredentials);

      expect(envVars).toEqual({
        AWS_ACCESS_KEY_ID: 'ASIA_SCOPED_KEY',
        AWS_SECRET_ACCESS_KEY: 'scoped-secret', // pragma: allowlist secret
        AWS_SESSION_TOKEN: 'scoped-session-token', // pragma: allowlist secret
      });
    });
  });

  describe('env override pattern', () => {
    it('should override process.env AWS credentials with scoped credentials', () => {
      const originalEnv = {
        PATH: '/usr/bin',
        HOME: '/home/user',
        AWS_ACCESS_KEY_ID: 'ORIGINAL_RUNTIME_KEY',
        AWS_SECRET_ACCESS_KEY: 'ORIGINAL_SECRET', // pragma: allowlist secret
        AWS_SESSION_TOKEN: 'ORIGINAL_TOKEN',
        AWS_REGION: 'us-east-1',
      };

      const scopedEnvVars = ScopedCredentialsService.toEnvVars(mockScopedCredentials);

      const mergedEnv = {
        ...originalEnv,
        ...scopedEnvVars,
      };

      // Scoped credentials should override the originals
      expect(mergedEnv.AWS_ACCESS_KEY_ID).toBe('ASIA_SCOPED_KEY');
      expect(mergedEnv.AWS_SECRET_ACCESS_KEY).toBe('scoped-secret'); // pragma: allowlist secret
      expect(mergedEnv.AWS_SESSION_TOKEN).toBe('scoped-session-token');

      // Non-credential env vars should be preserved
      expect(mergedEnv.PATH).toBe('/usr/bin');
      expect(mergedEnv.HOME).toBe('/home/user');
      expect(mergedEnv.AWS_REGION).toBe('us-east-1');
    });

    it('should add credentials when none exist in original env', () => {
      const originalEnv = {
        PATH: '/usr/bin',
        HOME: '/home/user',
        AWS_REGION: 'us-east-1',
      };

      const scopedEnvVars = ScopedCredentialsService.toEnvVars(mockScopedCredentials);

      const mergedEnv = {
        ...originalEnv,
        ...scopedEnvVars,
      };

      expect(mergedEnv.AWS_ACCESS_KEY_ID).toBe('ASIA_SCOPED_KEY');
      expect(mergedEnv.AWS_SECRET_ACCESS_KEY).toBe('scoped-secret'); // pragma: allowlist secret
      expect(mergedEnv.AWS_SESSION_TOKEN).toBe('scoped-session-token');
    });

    it('should produce empty object when no scoped credentials available', () => {
      const scopedCredentials = undefined;
      const scopedEnvVars = scopedCredentials
        ? ScopedCredentialsService.toEnvVars(scopedCredentials)
        : {};

      const originalEnv = {
        PATH: '/usr/bin',
        AWS_ACCESS_KEY_ID: 'ORIGINAL_KEY',
      };

      const mergedEnv = {
        ...originalEnv,
        ...scopedEnvVars,
      };

      // Original credentials should be preserved
      expect(mergedEnv.AWS_ACCESS_KEY_ID).toBe('ORIGINAL_KEY');
    });
  });
});
