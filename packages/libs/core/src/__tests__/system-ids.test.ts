import { describe, it, expect } from 'vitest';
import { SYSTEM_USER_ID, isSystemUser } from '../system-ids.js';
import { isUserId, parseUserId } from '../user-id.js';
import type { UserId } from '../user-id.js';

describe('SYSTEM_USER_ID', () => {
  it('equals the well-known UUID', () => {
    expect(SYSTEM_USER_ID as string).toBe('00000000-0000-7000-0000-000000000000');
  });

  it('passes isUserId validation', () => {
    expect(isUserId(SYSTEM_USER_ID as string)).toBe(true);
  });

  it('round-trips through parseUserId', () => {
    expect(parseUserId(SYSTEM_USER_ID as string)).toBe(SYSTEM_USER_ID);
  });
});

describe('isSystemUser', () => {
  it('returns true for SYSTEM_USER_ID', () => {
    expect(isSystemUser(SYSTEM_USER_ID)).toBe(true);
  });

  it('returns false for a regular UUID', () => {
    const regular = parseUserId('d7a41aa8-8031-70e8-4916-4c302e63588a');
    expect(isSystemUser(regular)).toBe(false);
  });

  it('returns false for another well-known-looking UUID', () => {
    const other = parseUserId('00000000-0000-7000-0000-000000000001');
    expect(isSystemUser(other)).toBe(false);
  });
});
