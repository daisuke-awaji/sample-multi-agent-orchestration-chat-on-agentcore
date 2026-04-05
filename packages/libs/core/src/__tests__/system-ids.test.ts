import { describe, it, expect } from 'vitest';
import {
  SYSTEM_USER_ID,
  systemAgentId,
  systemScenarioId,
  isSystemUserId,
  isSystemAgentId,
} from '../system-ids.js';

describe('SYSTEM_USER_ID', () => {
  it('equals "system"', () => {
    expect(SYSTEM_USER_ID as string).toBe('system');
  });
});

describe('systemAgentId', () => {
  it('returns "default-0" for index 0', () => {
    expect(systemAgentId(0) as string).toBe('default-0');
  });

  it('returns "default-5" for index 5', () => {
    expect(systemAgentId(5) as string).toBe('default-5');
  });
});

describe('systemScenarioId', () => {
  it('returns well-formed scenario ID', () => {
    expect(systemScenarioId(2, 3)).toBe('default-2-scenario-3');
  });
});

describe('isSystemUserId', () => {
  it('returns true for "system"', () => {
    expect(isSystemUserId('system')).toBe(true);
  });

  it('returns false for regular UUID', () => {
    expect(isSystemUserId('d7a41aa8-8031-70e8-4916-4c302e63588a')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isSystemUserId('')).toBe(false);
  });
});

describe('isSystemAgentId', () => {
  it('returns true for "default-0"', () => {
    expect(isSystemAgentId('default-0')).toBe(true);
  });

  it('returns true for "default-12"', () => {
    expect(isSystemAgentId('default-12')).toBe(true);
  });

  it('returns false for regular UUID', () => {
    expect(isSystemAgentId('019573e4-5a1b-7c2d-8e3f-4a5b6c7d8e9f')).toBe(false);
  });

  it('returns false for "default-" without number', () => {
    expect(isSystemAgentId('default-')).toBe(false);
  });

  it('returns false for "default-abc"', () => {
    expect(isSystemAgentId('default-abc')).toBe(false);
  });
});
