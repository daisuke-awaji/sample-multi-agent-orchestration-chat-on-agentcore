/**
 * Extended unit tests for auth-resolver
 * Covers validateMachineUserScopes, validateTargetUserId, and resolveEffectiveUserId
 * with additional edge cases beyond invocations.test.ts
 */

import { describe, it, expect } from '@jest/globals';
import {
  validateMachineUserScopes,
  validateTargetUserId,
  resolveEffectiveUserId,
  REQUIRED_MACHINE_USER_SCOPE,
} from '../auth-resolver.js';
import type { RequestContext } from '../../context/request-context.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createJWT(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `${header}.${body}.mock-sig`;
}

function machineUserContext(clientId: string, scopes: string[] | undefined): RequestContext {
  const token = createJWT({
    sub: clientId,
    client_id: clientId,
    token_use: 'access',
    scope: scopes?.join(' '),
  });
  return {
    authorizationHeader: `Bearer ${token}`,
    requestId: 'req-001',
    startTime: new Date(),
    isMachineUser: true,
    clientId,
    scopes,
  };
}

function regularUserContext(userId: string): RequestContext {
  const token = createJWT({
    sub: 'some-uuid',
    'cognito:username': userId,
    token_use: 'access',
    client_id: 'web-client',
  });
  return {
    authorizationHeader: `Bearer ${token}`,
    userId,
    requestId: 'req-002',
    startTime: new Date(),
    isMachineUser: false,
  };
}

const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

// ─── validateMachineUserScopes ─────────────────────────────────────────────────

describe('validateMachineUserScopes', () => {
  it('should be invalid when scopes is undefined (no scopes)', () => {
    const result = validateMachineUserScopes(undefined);
    expect(result.valid).toBe(false);
    expect(result.error?.status).toBe(403);
    expect(result.error?.message).toContain(REQUIRED_MACHINE_USER_SCOPE);
  });

  it('should be invalid when scopes is an empty array', () => {
    const result = validateMachineUserScopes([]);
    expect(result.valid).toBe(false);
    expect(result.error?.status).toBe(403);
  });

  it('should be invalid with message listing provided scopes when required scope is missing', () => {
    const result = validateMachineUserScopes(['agent/read', 'agent/write']);
    expect(result.valid).toBe(false);
    expect(result.error?.status).toBe(403);
    expect(result.error?.message).toContain('agent/read');
    expect(result.error?.message).toContain('agent/write');
    expect(result.error?.message).toContain(REQUIRED_MACHINE_USER_SCOPE);
  });

  it('should be valid when the only scope is the required one', () => {
    const result = validateMachineUserScopes([REQUIRED_MACHINE_USER_SCOPE]);
    expect(result).toEqual({ valid: true });
  });

  it('should be valid when required scope appears among multiple scopes', () => {
    const result = validateMachineUserScopes([
      'agent/read',
      REQUIRED_MACHINE_USER_SCOPE,
      'agent/admin',
    ]);
    expect(result).toEqual({ valid: true });
  });
});

// ─── validateTargetUserId ──────────────────────────────────────────────────────

describe('validateTargetUserId', () => {
  it('should be invalid for an empty string', () => {
    const result = validateTargetUserId('');
    expect(result.valid).toBe(false);
    expect(result.error?.status).toBe(400);
    expect(result.error?.message).toContain('empty');
  });

  it('should be invalid for a whitespace-only string', () => {
    const result = validateTargetUserId('   ');
    expect(result.valid).toBe(false);
    expect(result.error?.status).toBe(400);
    expect(result.error?.message).toContain('empty');
  });

  it('should be invalid for a tab character', () => {
    const result = validateTargetUserId('\t');
    expect(result.valid).toBe(false);
    expect(result.error?.status).toBe(400);
  });

  it('should be invalid for a non-UUID string', () => {
    const result = validateTargetUserId('not-a-uuid');
    expect(result.valid).toBe(false);
    expect(result.error?.status).toBe(400);
    expect(result.error?.message).toContain('UUID format');
  });

  it('should be invalid for an email address', () => {
    const result = validateTargetUserId('user@example.com');
    expect(result.valid).toBe(false);
    expect(result.error?.status).toBe(400);
  });

  it('should be valid for a standard lowercase UUID', () => {
    const result = validateTargetUserId(VALID_UUID);
    expect(result).toEqual({ valid: true });
  });

  it('should be valid for an uppercase UUID (regex is case-insensitive)', () => {
    const result = validateTargetUserId(VALID_UUID.toUpperCase());
    expect(result).toEqual({ valid: true });
  });

  it('should be invalid for UUID missing dashes', () => {
    const result = validateTargetUserId('a1b2c3d4e5f67890abcdef1234567890');
    expect(result.valid).toBe(false);
  });

  it('should be invalid for UUID with extra segment', () => {
    const result = validateTargetUserId(`${VALID_UUID}-extra`);
    expect(result.valid).toBe(false);
  });
});

// ─── resolveEffectiveUserId ────────────────────────────────────────────────────

describe('resolveEffectiveUserId', () => {
  describe('regular user', () => {
    it('should return userId from context', () => {
      const ctx = regularUserContext('alice');
      expect(resolveEffectiveUserId(ctx, undefined)).toEqual({ userId: 'alice' });
    });

    it('should return anonymous when context has no userId', () => {
      const ctx: RequestContext = {
        requestId: 'r1',
        startTime: new Date(),
        isMachineUser: false,
      };
      expect(resolveEffectiveUserId(ctx, undefined)).toEqual({ userId: 'anonymous' });
    });

    it('should return 403 error when regular user provides targetUserId', () => {
      const ctx = regularUserContext('alice');
      const result = resolveEffectiveUserId(ctx, VALID_UUID);
      expect(result.error?.status).toBe(403);
      expect(result.error?.message).toContain('not allowed for regular users');
    });
  });

  describe('machine user', () => {
    it('should return targetUserId for valid machine user with required scope', () => {
      const ctx = machineUserContext('client-x', [REQUIRED_MACHINE_USER_SCOPE]);
      const result = resolveEffectiveUserId(ctx, VALID_UUID);
      expect(result).toEqual({ userId: VALID_UUID });
    });

    it('should return targetUserId when required scope is among multiple scopes', () => {
      const ctx = machineUserContext('client-x', ['agent/read', REQUIRED_MACHINE_USER_SCOPE]);
      const result = resolveEffectiveUserId(ctx, VALID_UUID);
      expect(result).toEqual({ userId: VALID_UUID });
    });

    it('should return 400 error when targetUserId is missing', () => {
      const ctx = machineUserContext('client-x', [REQUIRED_MACHINE_USER_SCOPE]);
      const result = resolveEffectiveUserId(ctx, undefined);
      expect(result.error?.status).toBe(400);
      expect(result.error?.message).toContain('targetUserId is required');
    });

    it('should return 403 error when machine user has no scopes (undefined)', () => {
      const ctx = machineUserContext('client-x', undefined);
      const result = resolveEffectiveUserId(ctx, VALID_UUID);
      expect(result.error?.status).toBe(403);
      expect(result.error?.message).toContain('Insufficient scope');
    });

    it('should return 403 error when machine user has missing required scope', () => {
      const ctx = machineUserContext('client-x', ['agent/read']);
      const result = resolveEffectiveUserId(ctx, VALID_UUID);
      expect(result.error?.status).toBe(403);
    });

    it('should return 400 error when targetUserId has invalid UUID format', () => {
      const ctx = machineUserContext('client-x', [REQUIRED_MACHINE_USER_SCOPE]);
      const result = resolveEffectiveUserId(ctx, 'bad-user-id');
      expect(result.error?.status).toBe(400);
      expect(result.error?.message).toContain('UUID format');
    });
  });

  describe('JWT verification failures (context poisoning prevention)', () => {
    it('should return 401 when isMachineUser=true but no Authorization header', () => {
      const ctx: RequestContext = {
        requestId: 'r1',
        startTime: new Date(),
        isMachineUser: true,
        clientId: 'attacker',
        scopes: [REQUIRED_MACHINE_USER_SCOPE],
      };
      const result = resolveEffectiveUserId(ctx, VALID_UUID);
      expect(result.error?.status).toBe(401);
    });

    it('should return 401 when isMachineUser=true but JWT is malformed', () => {
      const ctx: RequestContext = {
        authorizationHeader: 'Bearer not.a.valid.jwt.here',
        requestId: 'r1',
        startTime: new Date(),
        isMachineUser: true,
      };
      const result = resolveEffectiveUserId(ctx, VALID_UUID);
      expect(result.error?.status).toBe(401);
    });

    it('should return 403 when context says isMachineUser=true but JWT has cognito:username (regular user JWT)', () => {
      const poisonedToken = createJWT({
        sub: 'user-uuid',
        'cognito:username': 'alice@example.com',
        token_use: 'access',
        client_id: 'web-client',
      });
      const ctx: RequestContext = {
        authorizationHeader: `Bearer ${poisonedToken}`,
        requestId: 'r1',
        startTime: new Date(),
        isMachineUser: true, // poisoned
        clientId: 'attacker-client',
        scopes: [REQUIRED_MACHINE_USER_SCOPE],
      };
      const result = resolveEffectiveUserId(ctx, VALID_UUID);
      expect(result.error?.status).toBe(403);
      expect(result.error?.message).toContain('machine user claim could not be verified');
    });

    it('should use scopes from JWT, not from context (context scope poisoning)', () => {
      // JWT has a different scope than what context claims
      const token = createJWT({
        sub: 'machine-client',
        client_id: 'machine-client',
        token_use: 'access',
        scope: 'agent/read', // insufficient scope in JWT
      });
      const ctx: RequestContext = {
        authorizationHeader: `Bearer ${token}`,
        requestId: 'r1',
        startTime: new Date(),
        isMachineUser: true,
        clientId: 'machine-client',
        scopes: [REQUIRED_MACHINE_USER_SCOPE], // context claims sufficient scope
      };
      const result = resolveEffectiveUserId(ctx, VALID_UUID);
      // JWT scope wins → should be 403
      expect(result.error?.status).toBe(403);
      expect(result.error?.message).toContain('Insufficient scope');
    });
  });

  describe('null / undefined context', () => {
    it('should return anonymous for undefined context without targetUserId', () => {
      expect(resolveEffectiveUserId(undefined, undefined)).toEqual({ userId: 'anonymous' });
    });

    it('should return 403 for undefined context when targetUserId is provided', () => {
      const result = resolveEffectiveUserId(undefined, VALID_UUID);
      expect(result.error?.status).toBe(403);
      expect(result.error?.message).toContain('not allowed for regular users');
    });
  });
});
