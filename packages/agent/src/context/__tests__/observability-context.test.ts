/**
 * Unit tests for ObservabilityContext — serviceTier attribute
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.unstable_mockModule('../../config/index.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { ObservabilityContext } = await import('../observability-context.js');

describe('ObservabilityContext — serviceTier', () => {
  it('includes gen_ai.request.service_tier in span attributes when serviceTier is set', () => {
    const ctx = new ObservabilityContext({
      actorId: 'user-1',
      serviceTier: 'flex',
    });

    const attrs = ctx.toSpanAttributes();
    expect(attrs['gen_ai.request.service_tier']).toBe('flex');
  });

  it('does not include gen_ai.request.service_tier when serviceTier is undefined', () => {
    const ctx = new ObservabilityContext({
      actorId: 'user-1',
    });

    const attrs = ctx.toSpanAttributes();
    expect(attrs['gen_ai.request.service_tier']).toBeUndefined();
  });

  it('includes serviceTier in entry keys when set', () => {
    const ctx = new ObservabilityContext({
      actorId: 'user-1',
      serviceTier: 'priority',
    });

    expect(ctx.entryKeys).toContain('gen_ai.request.service_tier');
  });
});
