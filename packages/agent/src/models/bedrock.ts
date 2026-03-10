import { BedrockModel } from '@strands-agents/sdk';
import { config, logger } from '../config/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BedrockModelOptions {
  modelId?: string;
  region?: string;
  cachePrompt?: 'default' | 'ephemeral';
  cacheTools?: 'default' | 'ephemeral';
}

/**
 * Per-field prompt caching support (immutable value object).
 *
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html
 *   - Claude models:       system ✓, messages ✓, tools ✓
 *   - Amazon Nova models:  system ✓, messages ✓, tools ✗
 */
export interface PromptCachingSupport {
  readonly system: boolean;
  readonly messages: boolean;
  readonly tools: boolean;
}

// ---------------------------------------------------------------------------
// Caching capability registry (private, pure logic)
// ---------------------------------------------------------------------------

interface CachingRule {
  pattern: RegExp;
  support: PromptCachingSupport;
}

/**
 * Declarative registry of per-model prompt caching capabilities.
 * Add a new entry when Bedrock adds caching support for another model family.
 */
const CACHING_RULES: readonly CachingRule[] = [
  { pattern: /anthropic\.claude/, support: { system: true, messages: true, tools: true } },
  { pattern: /amazon\.nova/, support: { system: true, messages: true, tools: false } },
];

const NO_SUPPORT: PromptCachingSupport = Object.freeze({
  system: false,
  messages: false,
  tools: false,
});

// ---------------------------------------------------------------------------
// Pure query helpers
// ---------------------------------------------------------------------------

/** Get per-field caching support for a model ID. */
export function getPromptCachingSupport(modelId: string): PromptCachingSupport {
  const rule = CACHING_RULES.find((r) => r.pattern.test(modelId));
  return rule?.support ?? NO_SUPPORT;
}

/** Does this model support prompt caching (system or messages)? */
export function supportsPromptCaching(modelId: string): boolean {
  const s = getPromptCachingSupport(modelId);
  return s.system || s.messages;
}

/** Does this model support tool caching? */
export function supportsToolCaching(modelId: string): boolean {
  return getPromptCachingSupport(modelId).tools;
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Create a Bedrock model with cache options resolved based on model capability.
 *
 * - cachePrompt is enabled for models that support system/messages caching
 * - cacheTools is enabled only for models that support tool caching (Claude)
 * - Both are gated by the global ENABLE_PROMPT_CACHING config flag
 */
export function createBedrockModel(options?: BedrockModelOptions): BedrockModel {
  const modelId = options?.modelId || config.BEDROCK_MODEL_ID;
  const region = options?.region || config.BEDROCK_REGION;

  const cachingSupport = getPromptCachingSupport(modelId);

  const cachePrompt =
    config.ENABLE_PROMPT_CACHING && cachingSupport.system
      ? options?.cachePrompt || config.CACHE_TYPE
      : undefined;

  const cacheTools =
    config.ENABLE_PROMPT_CACHING && cachingSupport.tools
      ? options?.cacheTools || config.CACHE_TYPE
      : undefined;

  logger.debug('🤖 Creating BedrockModel:', {
    modelId,
    region,
    cachePrompt,
    cacheTools,
    cachingSupport,
  });

  return new BedrockModel({
    region,
    modelId,
    cachePrompt,
    cacheTools,
    clientConfig: {
      retryMode: 'adaptive',
      maxAttempts: 5,
    },
  });
}
