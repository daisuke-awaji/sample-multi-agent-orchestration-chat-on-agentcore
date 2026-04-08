import { BedrockModel } from '@strands-agents/sdk';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BedrockModelOptions {
  modelId?: string;
  region?: string;
  cachePrompt?: 'default' | 'ephemeral';
  cacheTools?: 'default' | 'ephemeral';
}

export interface PromptCachingSupport {
  readonly system: boolean;
  readonly messages: boolean;
  readonly tools: boolean;
}

// ---------------------------------------------------------------------------
// Caching capability registry
// ---------------------------------------------------------------------------

interface CachingRule {
  pattern: RegExp;
  support: PromptCachingSupport;
}

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
// Pure query helpers (no config dependency)
// ---------------------------------------------------------------------------

export function getPromptCachingSupport(modelId: string): PromptCachingSupport {
  const rule = CACHING_RULES.find((r) => r.pattern.test(modelId));
  return rule?.support ?? NO_SUPPORT;
}

export function supportsPromptCaching(modelId: string): boolean {
  const s = getPromptCachingSupport(modelId);
  return s.system || s.messages;
}

export function supportsToolCaching(modelId: string): boolean {
  return getPromptCachingSupport(modelId).tools;
}

// ---------------------------------------------------------------------------
// Factory helper (config-free — actual factory is in config/bedrock-model.ts)
// ---------------------------------------------------------------------------

export function createBedrockModelWithParams(
  modelId: string,
  region: string,
  enableCaching: boolean,
  defaultCacheType: string | undefined,
  options?: BedrockModelOptions
): BedrockModel {
  const cachingSupport = getPromptCachingSupport(modelId);

  const cachePrompt =
    enableCaching && cachingSupport.system
      ? options?.cachePrompt || defaultCacheType
      : undefined;

  const cacheTools =
    enableCaching && cachingSupport.tools
      ? options?.cacheTools || defaultCacheType
      : undefined;

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
