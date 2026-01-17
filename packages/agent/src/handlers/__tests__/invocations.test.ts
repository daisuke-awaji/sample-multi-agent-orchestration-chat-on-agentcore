/**
 * Invocations Handler Tests
 * Tests for user ID resolution based on authentication type
 * Including security tests for context poisoning attack prevention
 */

import { describe, it, expect } from '@jest/globals';
import {
  resolveEffectiveUserId,
  validateMachineUserScopes,
  validateTargetUserId,
  verifyMachineUserClaim,
  REQUIRED_MACHINE_USER_SCOPE,
} from '../auth-resolver.js';
import type { RequestContext } from '../../context/request-context.js';

/**
 * Helper to create a mock JWT token
 */
function createMockJWT(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64');
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = 'mock-signature';
  return `${header}.${payloadBase64}.${signature}`;
}

/**
 * Helper to create a mock regular user context with valid JWT
 */
function createRegularUserContext(userId: string): RequestContext {
  const token = createMockJWT({
    sub: 'user-uuid-123',
    'cognito:username': userId,
    token_use: 'access',
    client_id: 'app-client-id',
  });
  return {
    authorizationHeader: `Bearer ${token}`,
    userId,
    requestId: 'test-request-id',
    startTime: new Date(),
    isMachineUser: false,
  };
}

/**
 * Helper to create a mock machine user context with valid JWT
 */
function createMachineUserContext(clientId: string, scopes?: string[]): RequestContext {
  const token = createMockJWT({
    sub: clientId, // sub === client_id for machine users
    token_use: 'access',
    client_id: clientId,
    scope: scopes?.join(' '),
  });
  return {
    authorizationHeader: `Bearer ${token}`,
    requestId: 'test-request-id',
    startTime: new Date(),
    isMachineUser: true,
    clientId,
    scopes,
  };
}

/**
 * Helper to create a poisoned context (isMachineUser=true but JWT is for regular user)
 */
function createPoisonedContext(clientId: string, scopes?: string[]): RequestContext {
  // JWT is for a regular user (has cognito:username)
  const token = createMockJWT({
    sub: 'user-uuid-123',
    'cognito:username': 'user@example.com',
    token_use: 'access',
    client_id: 'app-client-id',
  });
  return {
    authorizationHeader: `Bearer ${token}`,
    requestId: 'test-request-id',
    startTime: new Date(),
    // Context claims machine user (context poisoning attack)
    isMachineUser: true,
    clientId,
    scopes,
  };
}

describe('verifyMachineUserClaim', () => {
  describe('valid machine user tokens', () => {
    it('should verify machine user when sub equals client_id', () => {
      const token = createMockJWT({
        sub: 'machine-client-id',
        token_use: 'access',
        client_id: 'machine-client-id',
        scope: 'agent/invoke agent/admin',
      });

      const result = verifyMachineUserClaim(`Bearer ${token}`);
      expect(result).toEqual({
        verified: true,
        isMachineUser: true,
        clientId: 'machine-client-id',
        scopes: ['agent/invoke', 'agent/admin'],
      });
    });

    it('should verify machine user without sub claim', () => {
      const token = createMockJWT({
        token_use: 'access',
        client_id: 'machine-client-id',
        scope: 'agent/invoke',
      });

      const result = verifyMachineUserClaim(`Bearer ${token}`);
      expect(result).toEqual({
        verified: true,
        isMachineUser: true,
        clientId: 'machine-client-id',
        scopes: ['agent/invoke'],
      });
    });
  });

  describe('regular user tokens', () => {
    it('should identify regular user with cognito:username', () => {
      const token = createMockJWT({
        sub: 'user-uuid-123',
        'cognito:username': 'user@example.com',
        token_use: 'access',
        client_id: 'app-client-id',
      });

      const result = verifyMachineUserClaim(`Bearer ${token}`);
      expect(result).toEqual({
        verified: true,
        isMachineUser: false,
        clientId: undefined,
        scopes: undefined,
      });
    });

    it('should identify regular user with username claim', () => {
      const token = createMockJWT({
        sub: 'user-uuid-123',
        username: 'user@example.com',
        token_use: 'access',
        client_id: 'app-client-id',
      });

      const result = verifyMachineUserClaim(`Bearer ${token}`);
      expect(result).toEqual({
        verified: true,
        isMachineUser: false,
        clientId: undefined,
        scopes: undefined,
      });
    });

    it('should identify regular user when sub differs from client_id', () => {
      const token = createMockJWT({
        sub: 'user-uuid-456',
        token_use: 'access',
        client_id: 'app-client-id',
      });

      const result = verifyMachineUserClaim(`Bearer ${token}`);
      expect(result).toEqual({
        verified: true,
        isMachineUser: false,
        clientId: undefined,
        scopes: undefined,
      });
    });
  });

  describe('invalid inputs', () => {
    it('should return error for undefined auth header', () => {
      const result = verifyMachineUserClaim(undefined);
      expect(result.verified).toBe(false);
      expect(result.isMachineUser).toBe(false);
      expect(result.error?.status).toBe(401);
    });

    it('should return error for empty auth header', () => {
      const result = verifyMachineUserClaim('');
      expect(result.verified).toBe(false);
      expect(result.isMachineUser).toBe(false);
      expect(result.error?.status).toBe(401);
    });

    it('should return error for non-Bearer token', () => {
      const result = verifyMachineUserClaim('Basic sometoken');
      expect(result.verified).toBe(false);
      expect(result.isMachineUser).toBe(false);
      expect(result.error?.status).toBe(401);
    });

    it('should return error for malformed JWT', () => {
      const result = verifyMachineUserClaim('Bearer invalid-token');
      expect(result.verified).toBe(false);
      expect(result.isMachineUser).toBe(false);
      expect(result.error?.status).toBe(401);
    });

    it('should return error for JWT with wrong number of parts', () => {
      const result = verifyMachineUserClaim('Bearer header.payload');
      expect(result.verified).toBe(false);
      expect(result.isMachineUser).toBe(false);
      expect(result.error?.status).toBe(401);
      expect(result.error?.message).toContain('Invalid JWT format');
    });
  });

  describe('edge cases', () => {
    it('should not be machine user if token_use is not access', () => {
      const token = createMockJWT({
        sub: 'client-id-123',
        token_use: 'id',
        client_id: 'client-id-123',
      });

      const result = verifyMachineUserClaim(`Bearer ${token}`);
      expect(result.verified).toBe(true);
      expect(result.isMachineUser).toBe(false);
    });

    it('should handle token without scope', () => {
      const token = createMockJWT({
        sub: 'machine-client-id',
        token_use: 'access',
        client_id: 'machine-client-id',
      });

      const result = verifyMachineUserClaim(`Bearer ${token}`);
      expect(result.verified).toBe(true);
      expect(result.isMachineUser).toBe(true);
      expect(result.scopes).toBeUndefined();
    });
  });
});

describe('resolveEffectiveUserId', () => {
  describe('regular user (Authorization Code Flow)', () => {
    it('should return userId from context for regular user', () => {
      const context = createRegularUserContext('user@example.com');
      const result = resolveEffectiveUserId(context, undefined);

      expect(result).toEqual({
        userId: 'user@example.com',
      });
    });

    it('should return anonymous for regular user without userId', () => {
      const context: RequestContext = {
        authorizationHeader: undefined,
        requestId: 'test-request-id',
        startTime: new Date(),
        isMachineUser: false,
      };
      const result = resolveEffectiveUserId(context, undefined);

      expect(result).toEqual({
        userId: 'anonymous',
      });
    });

    it('should return 403 error if regular user tries to use targetUserId', () => {
      const context = createRegularUserContext('user@example.com');
      const result = resolveEffectiveUserId(context, 'another-user@example.com');

      expect(result).toEqual({
        userId: '',
        error: {
          status: 403,
          message: 'targetUserId is not allowed for regular users',
        },
      });
    });
  });

  describe('machine user (Client Credentials Flow)', () => {
    it('should return targetUserId for machine user with valid scope', () => {
      const context = createMachineUserContext('machine-client-id', [REQUIRED_MACHINE_USER_SCOPE]);
      const result = resolveEffectiveUserId(context, '47547a38-70e1-7026-e25f-bbdc98c68d68');

      expect(result).toEqual({
        userId: '47547a38-70e1-7026-e25f-bbdc98c68d68',
      });
    });

    it('should return 403 error if machine user has no scopes', () => {
      const context = createMachineUserContext('machine-client-id', undefined);
      const result = resolveEffectiveUserId(context, '47547a38-70e1-7026-e25f-bbdc98c68d68');

      expect(result).toEqual({
        userId: '',
        error: {
          status: 403,
          message: `Insufficient scope: '${REQUIRED_MACHINE_USER_SCOPE}' scope is required for machine user invocation`,
        },
      });
    });

    it('should return 403 error if machine user has empty scopes array', () => {
      const context = createMachineUserContext('machine-client-id', []);
      const result = resolveEffectiveUserId(context, '47547a38-70e1-7026-e25f-bbdc98c68d68');

      expect(result).toEqual({
        userId: '',
        error: {
          status: 403,
          message: `Insufficient scope: '${REQUIRED_MACHINE_USER_SCOPE}' scope is required, but only [] provided`,
        },
      });
    });

    it('should return 403 error if machine user has wrong scopes', () => {
      const context = createMachineUserContext('machine-client-id', ['agent/tools', 'agent/admin']);
      const result = resolveEffectiveUserId(context, '47547a38-70e1-7026-e25f-bbdc98c68d68');

      expect(result).toEqual({
        userId: '',
        error: {
          status: 403,
          message: `Insufficient scope: '${REQUIRED_MACHINE_USER_SCOPE}' scope is required, but only [agent/tools, agent/admin] provided`,
        },
      });
    });

    it('should return 400 error if machine user does not provide targetUserId', () => {
      const context = createMachineUserContext('machine-client-id', [REQUIRED_MACHINE_USER_SCOPE]);
      const result = resolveEffectiveUserId(context, undefined);

      expect(result).toEqual({
        userId: '',
        error: {
          status: 400,
          message: 'targetUserId is required for machine user (Client Credentials Flow)',
        },
      });
    });

    it('should return 400 error if machine user provides empty targetUserId', () => {
      const context = createMachineUserContext('machine-client-id', [REQUIRED_MACHINE_USER_SCOPE]);
      const result = resolveEffectiveUserId(context, '');

      // Empty string is falsy, so it triggers "required" error first
      expect(result).toEqual({
        userId: '',
        error: {
          status: 400,
          message: 'targetUserId is required for machine user (Client Credentials Flow)',
        },
      });
    });

    it('should return 400 error if targetUserId is not a valid UUID', () => {
      const context = createMachineUserContext('machine-client-id', [REQUIRED_MACHINE_USER_SCOPE]);
      const result = resolveEffectiveUserId(context, 'invalid-user-id');

      expect(result).toEqual({
        userId: '',
        error: {
          status: 400,
          message: 'targetUserId must be a valid UUID format (Cognito sub)',
        },
      });
    });

    it('should return 400 error if targetUserId is email format (not allowed)', () => {
      const context = createMachineUserContext('machine-client-id', [REQUIRED_MACHINE_USER_SCOPE]);
      const result = resolveEffectiveUserId(context, 'user@example.com');

      expect(result).toEqual({
        userId: '',
        error: {
          status: 400,
          message: 'targetUserId must be a valid UUID format (Cognito sub)',
        },
      });
    });
  });

  describe('context poisoning attack prevention', () => {
    it('should detect and reject context poisoning (isMachineUser=true but JWT is regular user)', () => {
      const context = createPoisonedContext('attacker-client-id', [REQUIRED_MACHINE_USER_SCOPE]);
      const result = resolveEffectiveUserId(context, 'victim@example.com');

      expect(result.userId).toBe('');
      expect(result.error?.status).toBe(403);
      expect(result.error?.message).toContain('machine user claim could not be verified');
    });

    it('should reject when context claims machine user but no auth header exists', () => {
      const context: RequestContext = {
        authorizationHeader: undefined,
        requestId: 'test-request-id',
        startTime: new Date(),
        isMachineUser: true, // Context poisoning: claims machine user
        clientId: 'attacker-client-id',
        scopes: [REQUIRED_MACHINE_USER_SCOPE],
      };
      const result = resolveEffectiveUserId(context, 'victim@example.com');

      expect(result.userId).toBe('');
      expect(result.error?.status).toBe(401);
      expect(result.error?.message).toContain('Authorization header is required');
    });

    it('should reject when context claims machine user but JWT is malformed', () => {
      const context: RequestContext = {
        authorizationHeader: 'Bearer invalid-jwt-token',
        requestId: 'test-request-id',
        startTime: new Date(),
        isMachineUser: true, // Context poisoning
        clientId: 'attacker-client-id',
        scopes: [REQUIRED_MACHINE_USER_SCOPE],
      };
      const result = resolveEffectiveUserId(context, 'victim@example.com');

      expect(result.userId).toBe('');
      expect(result.error?.status).toBe(401);
      expect(result.error?.message).toContain('Invalid JWT format');
    });

    it('should use scopes from JWT verification, not from context (context scopes could be poisoned)', () => {
      // Create a machine user JWT with different scopes than context claims
      const token = createMockJWT({
        sub: 'machine-client-id',
        token_use: 'access',
        client_id: 'machine-client-id',
        scope: 'agent/tools', // JWT has different scope than context claims
      });
      const context: RequestContext = {
        authorizationHeader: `Bearer ${token}`,
        requestId: 'test-request-id',
        startTime: new Date(),
        isMachineUser: true,
        clientId: 'machine-client-id',
        scopes: [REQUIRED_MACHINE_USER_SCOPE], // Context claims required scope
      };
      const result = resolveEffectiveUserId(context, 'target@example.com');

      // Should fail because JWT's scope (agent/tools) doesn't include required scope
      expect(result.userId).toBe('');
      expect(result.error?.status).toBe(403);
      expect(result.error?.message).toContain('Insufficient scope');
    });
  });

  describe('edge cases', () => {
    it('should handle undefined context', () => {
      const result = resolveEffectiveUserId(undefined, undefined);

      expect(result).toEqual({
        userId: 'anonymous',
      });
    });

    it('should return 403 for undefined context with targetUserId', () => {
      const result = resolveEffectiveUserId(undefined, 'target-user@example.com');

      expect(result).toEqual({
        userId: '',
        error: {
          status: 403,
          message: 'targetUserId is not allowed for regular users',
        },
      });
    });
  });
});

describe('validateMachineUserScopes', () => {
  it('should return valid for correct scope', () => {
    const result = validateMachineUserScopes([REQUIRED_MACHINE_USER_SCOPE]);
    expect(result).toEqual({ valid: true });
  });

  it('should return valid when required scope is among multiple scopes', () => {
    const result = validateMachineUserScopes([
      'agent/tools',
      REQUIRED_MACHINE_USER_SCOPE,
      'agent/admin',
    ]);
    expect(result).toEqual({ valid: true });
  });

  it('should return error for undefined scopes', () => {
    const result = validateMachineUserScopes(undefined);
    expect(result.valid).toBe(false);
    expect(result.error?.status).toBe(403);
    expect(result.error?.message).toContain(REQUIRED_MACHINE_USER_SCOPE);
  });

  it('should return error for empty scopes array', () => {
    const result = validateMachineUserScopes([]);
    expect(result.valid).toBe(false);
    expect(result.error?.status).toBe(403);
  });

  it('should return error when required scope is missing', () => {
    const result = validateMachineUserScopes(['agent/tools', 'agent/admin']);
    expect(result.valid).toBe(false);
    expect(result.error?.status).toBe(403);
    expect(result.error?.message).toContain('agent/tools');
    expect(result.error?.message).toContain('agent/admin');
  });
});

describe('validateTargetUserId', () => {
  describe('valid inputs - UUID format (Cognito sub)', () => {
    it('should accept valid UUID format', () => {
      const result = validateTargetUserId('47547a38-70e1-7026-e25f-bbdc98c68d68');
      expect(result).toEqual({ valid: true });
    });

    it('should accept UUID with uppercase letters', () => {
      const result = validateTargetUserId('47547A38-70E1-7026-E25F-BBDC98C68D68');
      expect(result).toEqual({ valid: true });
    });

    it('should accept UUID with mixed case letters', () => {
      const result = validateTargetUserId('47547a38-70E1-7026-e25F-BBDC98c68d68');
      expect(result).toEqual({ valid: true });
    });

    it('should accept another valid UUID', () => {
      const result = validateTargetUserId('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(result).toEqual({ valid: true });
    });
  });

  describe('invalid inputs - format', () => {
    it('should reject empty string', () => {
      const result = validateTargetUserId('');
      expect(result.valid).toBe(false);
      expect(result.error?.status).toBe(400);
      expect(result.error?.message).toContain('empty');
    });

    it('should reject whitespace-only string', () => {
      const result = validateTargetUserId('   ');
      expect(result.valid).toBe(false);
      expect(result.error?.status).toBe(400);
      expect(result.error?.message).toContain('empty');
    });

    it('should reject non-UUID format', () => {
      const result = validateTargetUserId('not-a-uuid');
      expect(result.valid).toBe(false);
      expect(result.error?.status).toBe(400);
      expect(result.error?.message).toContain('UUID format');
    });

    it('should reject email format (not allowed)', () => {
      const result = validateTargetUserId('user@example.com');
      expect(result.valid).toBe(false);
      expect(result.error?.status).toBe(400);
      expect(result.error?.message).toContain('UUID format');
    });

    it('should reject invalid UUID (wrong length)', () => {
      const result = validateTargetUserId('47547a38-70e1-7026-e25f');
      expect(result.valid).toBe(false);
      expect(result.error?.status).toBe(400);
    });

    it('should reject invalid UUID (missing dashes)', () => {
      const result = validateTargetUserId('47547a3870e17026e25fbbdc98c68d68');
      expect(result.valid).toBe(false);
      expect(result.error?.status).toBe(400);
    });

    it('should reject invalid UUID (extra characters)', () => {
      const result = validateTargetUserId('47547a38-70e1-7026-e25f-bbdc98c68d68-extra');
      expect(result.valid).toBe(false);
      expect(result.error?.status).toBe(400);
    });

    it('should reject invalid UUID (non-hex characters)', () => {
      const result = validateTargetUserId('47547g38-70e1-7026-e25f-bbdc98c68d68');
      expect(result.valid).toBe(false);
      expect(result.error?.status).toBe(400);
    });
  });
});
