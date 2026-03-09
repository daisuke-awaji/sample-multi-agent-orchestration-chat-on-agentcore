/**
 * Auth Middleware Tests
 * Tests for extractJWTFromHeader (utils/jwks) and getCurrentAuth (middleware/auth)
 * including isMachineUserToken logic tested indirectly via getCurrentAuth.
 */

import { describe, it, expect, jest } from '@jest/globals';

// Mock config to avoid env var validation failure at import time
jest.mock('../../config/index.js', () => ({
  config: {
    cognito: {
      userPoolId: 'us-east-1_testpool',
      clientId: 'test-client-id',
    },
    port: 3000,
    nodeEnv: 'test',
  },
}));

// Mock aws-jwt-verify to avoid network calls
jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: jest.fn().mockReturnValue({
      verify: jest.fn(() => Promise.resolve({} as any)),

      hydrate: jest.fn(() => Promise.resolve(undefined as any)),
    }),
  },
}));

import { extractJWTFromHeader } from '../../utils/jwks.js';
import { getCurrentAuth, AuthenticatedRequest } from '../auth.js';
import type { CognitoJWTPayload } from '../../utils/jwks.js';

// Helper to create a mock AuthenticatedRequest
function mockRequest(
  jwt?: CognitoJWTPayload,
  userId?: string,
  requestId?: string
): AuthenticatedRequest {
  return {
    jwt,
    userId,
    requestId,
    get: jest.fn(),
    header: jest.fn(),
  } as unknown as AuthenticatedRequest;
}

// ─────────────────────────────────────────────────
// extractJWTFromHeader
// ─────────────────────────────────────────────────

describe('extractJWTFromHeader', () => {
  it('extracts token from valid Bearer header', () => {
    const token = 'eyJhbGciOiJSUzI1NiJ9.payload.signature';
    expect(extractJWTFromHeader(`Bearer ${token}`)).toBe(token);
  });

  it('returns null when header has no Bearer prefix', () => {
    expect(extractJWTFromHeader('eyJhbGciOiJSUzI1NiJ9.payload.signature')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractJWTFromHeader('')).toBeNull();
  });

  it('returns null for non-Bearer schemes', () => {
    expect(extractJWTFromHeader('Basic dXNlcjpwYXNz')).toBeNull();
    expect(extractJWTFromHeader('Token sometoken')).toBeNull();
  });

  it('trims whitespace from extracted token', () => {
    expect(extractJWTFromHeader('Bearer   eyJtoken  ')).toBe('eyJtoken');
  });

  it('handles Bearer with no token (empty after prefix)', () => {
    const result = extractJWTFromHeader('Bearer ');
    // Should return empty string (trimmed), still technically not null
    expect(result).toBe('');
  });
});

// ─────────────────────────────────────────────────
// getCurrentAuth – isMachineUserToken (private, tested via getCurrentAuth)
// ─────────────────────────────────────────────────

describe('getCurrentAuth - isMachineUserToken detection', () => {
  it('identifies machine user: sub === client_id, no cognito:username, token_use=access', () => {
    const req = mockRequest(
      {
        sub: 'machine-client-id',
        client_id: 'machine-client-id',
        token_use: 'access',
        scope: 'agent/invoke',
      },
      undefined,
      'req-001'
    );

    const auth = getCurrentAuth(req);

    expect(auth.isMachineUser).toBe(true);
    expect(auth.clientId).toBe('machine-client-id');
    expect(auth.userId).toBeUndefined();
  });

  it('identifies machine user when sub is absent (no sub claim)', () => {
    const req = mockRequest(
      {
        client_id: 'machine-client-id',
        token_use: 'access',
        scope: 'agent/invoke',
      },
      undefined
    );

    const auth = getCurrentAuth(req);
    expect(auth.isMachineUser).toBe(true);
  });

  it('identifies regular user: has cognito:username', () => {
    const req = mockRequest(
      {
        sub: 'user-uuid-abc',
        'cognito:username': 'user@example.com',
        client_id: 'app-client-id',
        token_use: 'access',
      },
      'user@example.com'
    );

    const auth = getCurrentAuth(req);

    expect(auth.isMachineUser).toBe(false);
    expect(auth.clientId).toBeUndefined();
    expect(auth.userId).toBe('user@example.com');
  });

  it('identifies regular user: has username claim', () => {
    const req = mockRequest(
      {
        sub: 'user-uuid-abc',
        username: 'user@example.com',
        token_use: 'access',
      },
      'user@example.com'
    );

    const auth = getCurrentAuth(req);
    expect(auth.isMachineUser).toBe(false);
  });

  it('identifies regular user: sub !== client_id', () => {
    const req = mockRequest(
      {
        sub: 'user-uuid-different',
        client_id: 'app-client-id',
        token_use: 'access',
      },
      'user-uuid-different'
    );

    const auth = getCurrentAuth(req);
    expect(auth.isMachineUser).toBe(false);
  });

  it('returns isMachineUser=false when token_use is "id" (even if sub === client_id)', () => {
    const req = mockRequest(
      {
        sub: 'client-id-123',
        client_id: 'client-id-123',
        token_use: 'id',
      },
      undefined
    );

    const auth = getCurrentAuth(req);
    expect(auth.isMachineUser).toBe(false);
  });

  it('returns unauthenticated result when payload is undefined', () => {
    const req = mockRequest(undefined, undefined);

    const auth = getCurrentAuth(req);

    expect(auth.authenticated).toBe(false);
    expect(auth.isMachineUser).toBe(false);
    expect(auth.userId).toBeUndefined();
    expect(auth.groups).toEqual([]);
  });
});

// ─────────────────────────────────────────────────
// getCurrentAuth – AuthInfo fields
// ─────────────────────────────────────────────────

describe('getCurrentAuth - AuthInfo fields', () => {
  it('returns correct AuthInfo for regular user', () => {
    const req = mockRequest(
      {
        sub: 'user-uuid-123',
        'cognito:username': 'alice@example.com',
        email: 'alice@example.com',
        token_use: 'access',
        'cognito:groups': ['admin', 'users'],
      },
      'alice@example.com',
      'req-123'
    );

    const auth = getCurrentAuth(req);

    expect(auth).toMatchObject({
      authenticated: true,
      userId: 'alice@example.com',
      username: 'alice@example.com',
      email: 'alice@example.com',
      groups: ['admin', 'users'],
      tokenUse: 'access',
      requestId: 'req-123',
      isMachineUser: false,
      clientId: undefined,
    });
  });

  it('returns correct AuthInfo for machine user with scopes', () => {
    const req = mockRequest(
      {
        sub: 'machine-client-id',
        client_id: 'machine-client-id',
        token_use: 'access',
        scope: 'agent/invoke agent/admin',
      },
      undefined,
      'req-456'
    );

    const auth = getCurrentAuth(req);

    expect(auth).toMatchObject({
      authenticated: true,
      isMachineUser: true,
      clientId: 'machine-client-id',
      scopes: ['agent/invoke', 'agent/admin'],
      userId: undefined,
      groups: [],
    });
  });

  it('splits space-separated scope string into array', () => {
    const req = mockRequest({
      sub: 'mc',
      client_id: 'mc',
      token_use: 'access',
      scope: 'read write execute',
    });

    const auth = getCurrentAuth(req);
    expect(auth.scopes).toEqual(['read', 'write', 'execute']);
  });

  it('returns undefined scopes when scope claim is absent', () => {
    const req = mockRequest({
      sub: 'user-uuid',
      'cognito:username': 'user@example.com',
      token_use: 'access',
    });

    const auth = getCurrentAuth(req);
    expect(auth.scopes).toBeUndefined();
  });

  it('returns empty groups array when cognito:groups is absent', () => {
    const req = mockRequest({
      sub: 'user-uuid',
      'cognito:username': 'user@example.com',
      token_use: 'access',
    });

    const auth = getCurrentAuth(req);
    expect(auth.groups).toEqual([]);
  });

  it('uses username claim for username field when cognito:username is absent', () => {
    const req = mockRequest(
      {
        sub: 'user-uuid',
        username: 'bob@example.com',
        token_use: 'access',
      },
      'bob@example.com'
    );

    const auth = getCurrentAuth(req);
    expect(auth.username).toBe('bob@example.com');
  });

  it('authenticated is false when no jwt payload', () => {
    const req = mockRequest(undefined);
    const auth = getCurrentAuth(req);
    expect(auth.authenticated).toBe(false);
  });

  it('authenticated is true when jwt payload exists', () => {
    const req = mockRequest({
      sub: 'user-uuid',
      'cognito:username': 'user@example.com',
      token_use: 'access',
    });
    const auth = getCurrentAuth(req);
    expect(auth.authenticated).toBe(true);
  });
});
