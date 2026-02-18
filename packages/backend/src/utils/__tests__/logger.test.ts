import { describe, it, expect } from '@jest/globals';
import { sanitizeForLogging, sanitizeAuthHeader, getTokenMetadata } from '../logger.js';

describe('sanitizeForLogging', () => {
  it('should redact known sensitive keys', () => {
    const input = {
      username: 'alice',
      token: 'secret-value',
      Authorization: 'Bearer xyz',
      password: 'hunter2',
    };
    const result = sanitizeForLogging(input);
    expect(result.username).toBe('alice');
    expect(result.token).toBe('[REDACTED]');
    expect(result.Authorization).toBe('[REDACTED]');
    expect(result.password).toBe('[REDACTED]');
  });

  it('should handle case-insensitive sensitive keys', () => {
    const input = {
      AccessToken: 'tok_123',
      API_KEY: 'key_456',
      clientSecret: 'sec_789',
      refreshToken: 'ref_000',
    };
    const result = sanitizeForLogging(input);
    expect(result.AccessToken).toBe('[REDACTED]');
    expect(result.API_KEY).toBe('[REDACTED]');
    expect(result.clientSecret).toBe('[REDACTED]');
    expect(result.refreshToken).toBe('[REDACTED]');
  });

  it('should return undefined for falsy sensitive values', () => {
    const input = {
      token: '',
      password: null,
      apikey: undefined,
    };
    const result = sanitizeForLogging(input as Record<string, unknown>);
    expect(result.token).toBeUndefined();
    expect(result.password).toBeUndefined();
    expect(result.apikey).toBeUndefined();
  });

  it('should recursively sanitize nested objects', () => {
    const input = {
      user: {
        name: 'bob',
        credentials: {
          password: 'secret',
          token: 'abc',
        },
      },
      level: 'info',
    };
    const result = sanitizeForLogging(input);
    const user = result.user as Record<string, unknown>;
    const credentials = user.credentials as Record<string, unknown>;
    expect(user.name).toBe('bob');
    expect(credentials.password).toBe('[REDACTED]');
    expect(credentials.token).toBe('[REDACTED]');
    expect(result.level).toBe('info');
  });

  it('should pass through arrays without modification', () => {
    const input = {
      tags: ['a', 'b'],
      count: 42,
    };
    const result = sanitizeForLogging(input);
    expect(result.tags).toEqual(['a', 'b']);
    expect(result.count).toBe(42);
  });

  it('should handle empty objects', () => {
    expect(sanitizeForLogging({})).toEqual({});
  });

  it('should preserve non-sensitive primitive values', () => {
    const input = {
      status: 200,
      message: 'OK',
      enabled: true,
      data: null,
    };
    const result = sanitizeForLogging(input as Record<string, unknown>);
    expect(result.status).toBe(200);
    expect(result.message).toBe('OK');
    expect(result.enabled).toBe(true);
    expect(result.data).toBeNull();
  });
});

describe('sanitizeAuthHeader', () => {
  it('should return present: false when header is undefined', () => {
    expect(sanitizeAuthHeader()).toEqual({ present: false });
    expect(sanitizeAuthHeader(undefined)).toEqual({ present: false });
  });

  it('should return present: false when header is empty string', () => {
    expect(sanitizeAuthHeader('')).toEqual({ present: false });
  });

  it('should detect bearer format', () => {
    const result = sanitizeAuthHeader('Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig');
    expect(result).toEqual({ present: true, format: 'bearer' });
  });

  it('should detect invalid format for non-bearer auth', () => {
    expect(sanitizeAuthHeader('Basic dXNlcjpwYXNz')).toEqual({
      present: true,
      format: 'invalid',
    });
    expect(sanitizeAuthHeader('Token abc123')).toEqual({ present: true, format: 'invalid' });
  });

  it('should not expose the actual token value', () => {
    const secret = 'super-secret-token-value';
    const result = sanitizeAuthHeader(`Bearer ${secret}`);
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});

describe('getTokenMetadata', () => {
  it('should return present: false when token is undefined', () => {
    expect(getTokenMetadata()).toEqual({ present: false });
    expect(getTokenMetadata(undefined)).toEqual({ present: false });
  });

  it('should return present: false when token is empty string', () => {
    expect(getTokenMetadata('')).toEqual({ present: false });
  });

  it('should detect valid JWT format (3 dot-separated parts)', () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature';
    const result = getTokenMetadata(token);
    expect(result.present).toBe(true);
    expect(result.format).toBe('valid');
    expect(result.length).toBe(token.length);
  });

  it('should detect invalid JWT format (not 3 parts)', () => {
    expect(getTokenMetadata('not-a-jwt')).toEqual({
      present: true,
      length: 9,
      format: 'invalid',
    });
    expect(getTokenMetadata('only.two')).toEqual({
      present: true,
      length: 8,
      format: 'invalid',
    });
    expect(getTokenMetadata('one.two.three.four')).toEqual({
      present: true,
      length: 18,
      format: 'invalid',
    });
  });

  it('should not expose the actual token value', () => {
    const token = 'header.payload.signature';
    const result = getTokenMetadata(token);
    expect(JSON.stringify(result)).not.toContain('header');
    expect(JSON.stringify(result)).not.toContain('payload');
    expect(JSON.stringify(result)).not.toContain('signature');
  });
});
