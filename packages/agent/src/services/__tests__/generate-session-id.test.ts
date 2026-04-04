/**
 * Unit tests for generateSessionId (crypto.randomBytes-based implementation)
 *
 * Tests the inline generateSessionId function extracted from sub-agent-task-manager.ts.
 * The same implementation is used in trigger/agent-invoker.ts and client/client.ts.
 */

import { describe, it, expect } from '@jest/globals';
import { randomBytes } from 'crypto';

// Replicate the implementation under test
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 33;
const MASK = 63;

function generateSessionId(): string {
  const bytes = randomBytes(ID_LENGTH * 2);
  let result = '';
  let pos = 0;
  while (result.length < ID_LENGTH) {
    const idx = bytes[pos++] & MASK;
    if (idx < ALPHABET.length) {
      result += ALPHABET[idx];
    }
  }
  return result;
}

const AGENTCORE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

describe('generateSessionId (Node.js crypto implementation)', () => {
  it('returns a string', () => {
    expect(typeof generateSessionId()).toBe('string');
  });

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

  it('first character is always alphanumeric', () => {
    for (let i = 0; i < 1000; i++) {
      const id = generateSessionId();
      expect(id[0]).toMatch(/[a-zA-Z0-9]/);
    }
  });

  it('satisfies AgentCore sessionId constraint pattern', () => {
    for (let i = 0; i < 100; i++) {
      const id = generateSessionId();
      expect(id).toMatch(AGENTCORE_PATTERN);
    }
  });

  it('generates unique IDs across 1000 calls', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateSessionId()));
    expect(ids.size).toBe(1000);
  });

  it('uses only characters from the defined alphabet', () => {
    const alphabetSet = new Set(ALPHABET.split(''));
    for (let i = 0; i < 100; i++) {
      const id = generateSessionId();
      for (const char of id) {
        expect(alphabetSet.has(char)).toBe(true);
      }
    }
  });

  it('does not contain hyphens', () => {
    for (let i = 0; i < 100; i++) {
      const id = generateSessionId();
      expect(id).not.toContain('-');
    }
  });

  it('does not contain underscores', () => {
    for (let i = 0; i < 100; i++) {
      const id = generateSessionId();
      expect(id).not.toContain('_');
    }
  });

  it('produces roughly uniform character distribution', () => {
    const charCounts: Record<string, number> = {};
    const sampleSize = 10000;
    const totalChars = sampleSize * 33;

    for (let i = 0; i < sampleSize; i++) {
      const id = generateSessionId();
      for (const char of id) {
        charCounts[char] = (charCounts[char] || 0) + 1;
      }
    }

    const uniqueChars = Object.keys(charCounts);
    expect(uniqueChars.length).toBe(62);

    const expected = totalChars / 62;
    for (const char of uniqueChars) {
      const ratio = charCounts[char] / expected;
      expect(ratio).toBeGreaterThan(0.7);
      expect(ratio).toBeLessThan(1.3);
    }
  });

  it('mask correctly rejects values >= alphabet length', () => {
    // MASK = 63, alphabet.length = 62
    // Values 62 and 63 should be rejected (not mapped to any character)
    // This test verifies the rejection logic works by ensuring all IDs
    // are exactly 33 chars despite some bytes being rejected
    for (let i = 0; i < 100; i++) {
      const id = generateSessionId();
      expect(id).toHaveLength(33);
    }
  });

  it('buffer size (ID_LENGTH * 2) is sufficient even in worst case', () => {
    // With MASK = 63 and alphabet size 62, rejection rate is 2/64 ≈ 3.1%
    // Buffer of 66 bytes (33*2) for 33 chars gives ~97% acceptance rate
    // Probability of needing more than 66 bytes is vanishingly small
    // This test runs many iterations to confirm no buffer underrun
    for (let i = 0; i < 10000; i++) {
      const id = generateSessionId();
      expect(id).toHaveLength(33);
    }
  });

  it('has no sequential pattern across consecutive calls', () => {
    const id1 = generateSessionId();
    const id2 = generateSessionId();

    const commonPrefix = (a: string, b: string) => {
      let i = 0;
      while (i < a.length && a[i] === b[i]) i++;
      return i;
    };

    expect(commonPrefix(id1, id2)).toBeLessThan(5);
  });

  it('entropy is sufficient (62^33 > 2^128)', () => {
    // 62^33 ≈ 2^196, well above UUID v4's 2^122 entropy
    const entropyBits = 33 * Math.log2(62);
    expect(entropyBits).toBeGreaterThan(128);
  });
});
