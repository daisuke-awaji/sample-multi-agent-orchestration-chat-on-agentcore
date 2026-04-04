import { describe, it, expect } from 'vitest';
import { generateSessionId } from '../sessionId';

describe('generateSessionId', () => {
  it('generates a 33-character string', () => {
    const id = generateSessionId();
    expect(id).toHaveLength(33);
  });

  it('contains only alphanumeric characters', () => {
    for (let i = 0; i < 100; i++) {
      const id = generateSessionId();
      expect(id).toMatch(/^[a-zA-Z0-9]+$/);
    }
  });

  it('first character is always alphanumeric (never - or _)', () => {
    for (let i = 0; i < 1000; i++) {
      const id = generateSessionId();
      expect(id[0]).toMatch(/[a-zA-Z0-9]/);
    }
  });

  it('satisfies AgentCore sessionId constraint pattern', () => {
    const pattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
    for (let i = 0; i < 100; i++) {
      const id = generateSessionId();
      expect(id).toMatch(pattern);
    }
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateSessionId()));
    expect(ids.size).toBe(100);
  });
});
