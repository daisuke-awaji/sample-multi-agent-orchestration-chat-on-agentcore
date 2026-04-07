/**
 * Unit tests for service tier resolver
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ── Mock definitions ───────────────────────────────────────────────────

let mockServiceTier = 'auto';

jest.unstable_mockModule('../../config/index.js', () => ({
  config: {
    get BEDROCK_SERVICE_TIER() {
      return mockServiceTier;
    },
  },
}));

// ── Dynamic imports ────────────────────────────────────────────────────

const { resolveServiceTier } = await import('../service-tier-resolver.js');

// ── Tests ──────────────────────────────────────────────────────────────

describe('resolveServiceTier', () => {
  beforeEach(() => {
    mockServiceTier = 'auto';
  });

  describe('when configured to "auto"', () => {
    it('returns "flex" for event sessions', () => {
      expect(resolveServiceTier('event')).toBe('flex');
    });

    it('returns "flex" for subagent sessions', () => {
      expect(resolveServiceTier('subagent')).toBe('flex');
    });

    it('returns "default" for user sessions', () => {
      expect(resolveServiceTier('user')).toBe('default');
    });

    it('returns "default" when session type is undefined', () => {
      expect(resolveServiceTier(undefined)).toBe('default');
    });
  });

  describe('when configured to a fixed tier', () => {
    it('returns "flex" regardless of session type when configured to "flex"', () => {
      mockServiceTier = 'flex';
      expect(resolveServiceTier('user')).toBe('flex');
      expect(resolveServiceTier('event')).toBe('flex');
      expect(resolveServiceTier('subagent')).toBe('flex');
      expect(resolveServiceTier(undefined)).toBe('flex');
    });

    it('returns "default" regardless of session type when configured to "default"', () => {
      mockServiceTier = 'default';
      expect(resolveServiceTier('user')).toBe('default');
      expect(resolveServiceTier('event')).toBe('default');
      expect(resolveServiceTier('subagent')).toBe('default');
    });

    it('returns "priority" regardless of session type when configured to "priority"', () => {
      mockServiceTier = 'priority';
      expect(resolveServiceTier('user')).toBe('priority');
      expect(resolveServiceTier('event')).toBe('priority');
      expect(resolveServiceTier('subagent')).toBe('priority');
    });
  });
});
