/**
 * Unit tests for createBedrockModel factory — serviceTier handling
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ── Mock definitions ───────────────────────────────────────────────────

const mockBedrockModelConstructor = jest.fn<any>().mockImplementation((opts: any) => opts);

jest.unstable_mockModule('@strands-agents/sdk', () => ({
  BedrockModel: function (...args: any[]) {
    return mockBedrockModelConstructor(...args);
  },
}));

jest.unstable_mockModule('../../config/index.js', () => ({
  config: {
    BEDROCK_MODEL_ID: 'global.anthropic.claude-sonnet-4-6',
    BEDROCK_REGION: 'us-east-1',
    ENABLE_PROMPT_CACHING: true,
    CACHE_TYPE: 'default',
  },
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ── Dynamic imports ────────────────────────────────────────────────────

const { createBedrockModel } = await import('../bedrock.js');

// ── Tests ──────────────────────────────────────────────────────────────

describe('createBedrockModel — serviceTier', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not include additionalRequestFields when serviceTier is undefined', () => {
    createBedrockModel();

    const opts = mockBedrockModelConstructor.mock.calls[0][0] as Record<string, unknown>;
    expect(opts.additionalRequestFields).toBeUndefined();
  });

  it('does not include additionalRequestFields when serviceTier is "default"', () => {
    createBedrockModel({ serviceTier: 'default' });

    const opts = mockBedrockModelConstructor.mock.calls[0][0] as Record<string, unknown>;
    expect(opts.additionalRequestFields).toBeUndefined();
  });

  it('passes service_tier "flex" via additionalRequestFields', () => {
    createBedrockModel({ serviceTier: 'flex' });

    const opts = mockBedrockModelConstructor.mock.calls[0][0] as Record<string, unknown>;
    expect(opts.additionalRequestFields).toEqual({ service_tier: 'flex' });
  });

  it('passes service_tier "priority" via additionalRequestFields', () => {
    createBedrockModel({ serviceTier: 'priority' });

    const opts = mockBedrockModelConstructor.mock.calls[0][0] as Record<string, unknown>;
    expect(opts.additionalRequestFields).toEqual({ service_tier: 'priority' });
  });

  it('preserves other model options alongside serviceTier', () => {
    createBedrockModel({
      modelId: 'amazon.nova-pro-v1:0',
      region: 'eu-west-1',
      serviceTier: 'flex',
    });

    const opts = mockBedrockModelConstructor.mock.calls[0][0] as Record<string, unknown>;
    expect(opts.modelId).toBe('amazon.nova-pro-v1:0');
    expect(opts.region).toBe('eu-west-1');
    expect(opts.additionalRequestFields).toEqual({ service_tier: 'flex' });
  });
});
