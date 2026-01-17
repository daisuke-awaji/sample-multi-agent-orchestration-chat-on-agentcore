/**
 * Request Context Middleware Tests
 * Tests for JWT parsing and authentication type detection
 */

import { describe, it, expect } from '@jest/globals';
import { parseJWTToken } from '../request-context.js';

/**
 * Helper to create a mock JWT token
 */
function createMockJWT(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64');
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = 'mock-signature';
  return `Bearer ${header}.${payloadBase64}.${signature}`;
}

describe('parseJWTToken', () => {
  describe('invalid input handling', () => {
    it('should return isMachineUser=false for undefined input', () => {
      const result = parseJWTToken(undefined);
      expect(result).toEqual({ isMachineUser: false });
    });

    it('should return isMachineUser=false for empty string', () => {
      const result = parseJWTToken('');
      expect(result).toEqual({ isMachineUser: false });
    });

    it('should return isMachineUser=false for non-Bearer token', () => {
      const result = parseJWTToken('Basic sometoken');
      expect(result).toEqual({ isMachineUser: false });
    });

    it('should return isMachineUser=false for malformed JWT', () => {
      const result = parseJWTToken('Bearer invalid-token');
      expect(result).toEqual({ isMachineUser: false });
    });
  });

  describe('regular user (Authorization Code Flow)', () => {
    it('should detect regular user with cognito:username', () => {
      const token = createMockJWT({
        sub: 'user-uuid-123',
        token_use: 'access',
        'cognito:username': 'user@example.com',
        email: 'user@example.com',
      });

      const result = parseJWTToken(token);
      expect(result).toEqual({
        isMachineUser: false,
        userId: 'user@example.com',
      });
    });

    it('should fallback to sub if cognito:username is not present but other user fields exist', () => {
      const token = createMockJWT({
        sub: 'user-uuid-123',
        token_use: 'id', // id token, not access token
        email: 'user@example.com',
      });

      const result = parseJWTToken(token);
      expect(result).toEqual({
        isMachineUser: false,
        userId: 'user-uuid-123',
      });
    });

    it('should use userId field if present', () => {
      const token = createMockJWT({
        sub: 'user-uuid-123',
        userId: 'custom-user-id',
        'cognito:username': 'user@example.com',
      });

      const result = parseJWTToken(token);
      expect(result).toEqual({
        isMachineUser: false,
        userId: 'user@example.com',
      });
    });
  });

  describe('machine user (Client Credentials Flow)', () => {
    it('should detect machine user when sub equals client_id', () => {
      const token = createMockJWT({
        sub: 'machine-client-id',
        token_use: 'access',
        scope: 'agentcore/batch.execute',
        client_id: 'machine-client-id',
      });

      const result = parseJWTToken(token);
      expect(result).toEqual({
        isMachineUser: true,
        clientId: 'machine-client-id',
        scopes: ['agentcore/batch.execute'],
      });
    });

    it('should detect machine user without sub claim', () => {
      const token = createMockJWT({
        token_use: 'access',
        scope: 'agentcore/batch.execute',
        client_id: 'machine-client-id',
      });

      const result = parseJWTToken(token);
      expect(result).toEqual({
        isMachineUser: true,
        clientId: 'machine-client-id',
        scopes: ['agentcore/batch.execute'],
      });
    });

    it('should handle multiple scopes', () => {
      const token = createMockJWT({
        sub: 'machine-client-id',
        token_use: 'access',
        scope: 'agentcore/batch.execute agentcore/admin openid',
        client_id: 'machine-client-id',
      });

      const result = parseJWTToken(token);
      expect(result).toEqual({
        isMachineUser: true,
        clientId: 'machine-client-id',
        scopes: ['agentcore/batch.execute', 'agentcore/admin', 'openid'],
      });
    });

    it('should handle machine user without scope', () => {
      const token = createMockJWT({
        sub: 'machine-client-id',
        token_use: 'access',
        client_id: 'machine-client-id',
      });

      const result = parseJWTToken(token);
      expect(result).toEqual({
        isMachineUser: true,
        clientId: 'machine-client-id',
        scopes: undefined,
      });
    });
  });

  describe('edge cases', () => {
    it('should not be machine user if token_use is not access', () => {
      const token = createMockJWT({
        sub: 'client-id-123',
        token_use: 'id',
        client_id: 'machine-client-id',
      });

      const result = parseJWTToken(token);
      expect(result).toEqual({
        isMachineUser: false,
        userId: 'client-id-123',
      });
    });

    it('should not be machine user if cognito:username is present even with token_use=access', () => {
      const token = createMockJWT({
        sub: 'user-uuid-123',
        token_use: 'access',
        'cognito:username': 'user@example.com',
        client_id: 'some-client-id',
      });

      const result = parseJWTToken(token);
      expect(result).toEqual({
        isMachineUser: false,
        userId: 'user@example.com',
      });
    });

    it('should not be machine user if sub differs from client_id (regular user access token)', () => {
      const token = createMockJWT({
        sub: 'user-uuid-456',
        token_use: 'access',
        client_id: 'app-client-id',
      });

      const result = parseJWTToken(token);
      expect(result).toEqual({
        isMachineUser: false,
        userId: 'user-uuid-456',
      });
    });
  });
});
