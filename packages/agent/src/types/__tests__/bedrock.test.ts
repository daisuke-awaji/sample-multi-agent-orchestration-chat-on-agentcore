/**
 * Unit tests for bedrock model utilities
 */

import { describe, it, expect } from '@jest/globals';
import { supportsPromptCaching, supportsToolCaching, getPromptCachingSupport } from '../bedrock.js';

// ---------------------------------------------------------------------------
// getPromptCachingSupport
// ---------------------------------------------------------------------------

describe('getPromptCachingSupport', () => {
  it('returns full support (system + messages + tools) for Claude models', () => {
    const support = getPromptCachingSupport('anthropic.claude-sonnet-4-20250514-v1:0');
    expect(support).toEqual({ system: true, messages: true, tools: true });
  });

  it('returns full support for cross-region Claude models', () => {
    expect(getPromptCachingSupport('us.anthropic.claude-sonnet-4-20250514-v1:0')).toEqual({
      system: true,
      messages: true,
      tools: true,
    });
    expect(getPromptCachingSupport('global.anthropic.claude-sonnet-4-5-20250929-v1:0')).toEqual({
      system: true,
      messages: true,
      tools: true,
    });
  });

  it('returns partial support (system + messages, NOT tools) for Amazon Nova models', () => {
    expect(getPromptCachingSupport('amazon.nova-lite-v1:0')).toEqual({
      system: true,
      messages: true,
      tools: false,
    });
  });

  it('returns partial support for all Nova variants', () => {
    for (const modelId of [
      'amazon.nova-pro-v1:0',
      'amazon.nova-micro-v1:0',
      'amazon.nova-premier-v1:0',
      'amazon.nova-2-lite-v1:0',
    ]) {
      const support = getPromptCachingSupport(modelId);
      expect(support.tools).toBe(false);
      expect(support.system).toBe(true);
      expect(support.messages).toBe(true);
    }
  });

  it('returns no support for unknown models', () => {
    expect(getPromptCachingSupport('meta.llama3-1-8b-instruct-v1:0')).toEqual({
      system: false,
      messages: false,
      tools: false,
    });
  });
});

// ---------------------------------------------------------------------------
// supportsPromptCaching
// ---------------------------------------------------------------------------

describe('supportsPromptCaching', () => {
  it('returns true for Claude models', () => {
    expect(supportsPromptCaching('anthropic.claude-3-haiku-20240307-v1:0')).toBe(true);
    expect(supportsPromptCaching('anthropic.claude-3-5-sonnet-20241022-v2:0')).toBe(true);
    expect(supportsPromptCaching('anthropic.claude-sonnet-4-20250514-v1:0')).toBe(true);
    expect(supportsPromptCaching('anthropic.claude-opus-4-20250514-v1:0')).toBe(true);
  });

  it('returns true for cross-region Claude models', () => {
    expect(supportsPromptCaching('us.anthropic.claude-sonnet-4-20250514-v1:0')).toBe(true);
    expect(supportsPromptCaching('eu.anthropic.claude-3-7-sonnet-20250219-v1:0')).toBe(true);
    expect(supportsPromptCaching('global.anthropic.claude-sonnet-4-5-20250929-v1:0')).toBe(true);
    expect(supportsPromptCaching('apac.anthropic.claude-haiku-4-5-20251001-v1:0')).toBe(true);
  });

  it('returns true for Amazon Nova models (system + messages supported)', () => {
    expect(supportsPromptCaching('amazon.nova-lite-v1:0')).toBe(true);
    expect(supportsPromptCaching('amazon.nova-pro-v1:0')).toBe(true);
    expect(supportsPromptCaching('amazon.nova-micro-v1:0')).toBe(true);
    expect(supportsPromptCaching('amazon.nova-premier-v1:0')).toBe(true);
  });

  it('returns false for unsupported models', () => {
    expect(supportsPromptCaching('meta.llama3-1-8b-instruct-v1:0')).toBe(false);
    expect(supportsPromptCaching('mistral.mistral-large-3-v1:0')).toBe(false);
    expect(supportsPromptCaching('ai21.jamba-1-5-large-v1:0')).toBe(false);
    expect(supportsPromptCaching('cohere.command-r-plus-v1:0')).toBe(false);
    expect(supportsPromptCaching('deepseek.deepseek-r1-v1:0')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// supportsToolCaching
// ---------------------------------------------------------------------------

describe('supportsToolCaching', () => {
  it('returns true for Claude models', () => {
    expect(supportsToolCaching('anthropic.claude-sonnet-4-20250514-v1:0')).toBe(true);
    expect(supportsToolCaching('global.anthropic.claude-sonnet-4-5-20250929-v1:0')).toBe(true);
  });

  it('returns false for Amazon Nova models', () => {
    expect(supportsToolCaching('amazon.nova-lite-v1:0')).toBe(false);
    expect(supportsToolCaching('amazon.nova-pro-v1:0')).toBe(false);
    expect(supportsToolCaching('amazon.nova-micro-v1:0')).toBe(false);
  });

  it('returns false for other models', () => {
    expect(supportsToolCaching('meta.llama3-1-8b-instruct-v1:0')).toBe(false);
    expect(supportsToolCaching('mistral.mistral-large-3-v1:0')).toBe(false);
  });
});
