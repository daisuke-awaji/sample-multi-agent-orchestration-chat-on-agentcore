/**
 * Available Bedrock Models Configuration
 */

export interface BedrockModel {
  id: string;
  name: string;
  provider: 'Anthropic' | 'Amazon';
}

/**
 * Static list of available Bedrock models
 */
export const AVAILABLE_MODELS: readonly BedrockModel[] = [
  {
    id: 'global.anthropic.claude-opus-4-6-v1',
    name: 'Claude Opus 4.6',
    provider: 'Anthropic',
  },
  {
    id: 'global.anthropic.claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'Anthropic',
  },
  {
    id: 'global.anthropic.claude-sonnet-4-5-20250929-v1:0',
    name: 'Claude Sonnet 4.5',
    provider: 'Anthropic',
  },
  {
    id: 'global.anthropic.claude-opus-4-5-20251101-v1:0',
    name: 'Claude Opus 4.5',
    provider: 'Anthropic',
  },
  {
    id: 'global.anthropic.claude-haiku-4-5-20251001-v1:0',
    name: 'Claude Haiku 4.5',
    provider: 'Anthropic',
  },
  {
    id: 'global.amazon.nova-2-lite-v1:0',
    name: 'Nova Lite 2',
    provider: 'Amazon',
  },
] as const;

/**
 * Default model ID
 */
export const DEFAULT_MODEL_ID = 'global.anthropic.claude-sonnet-4-5-20250929-v1:0';

/**
 * Get model by ID
 */
export function getModelById(id: string): BedrockModel | undefined {
  return AVAILABLE_MODELS.find((model) => model.id === id);
}

/**
 * Get model display name
 */
export function getModelDisplayName(id: string): string {
  const model = getModelById(id);
  return model ? `${model.name} (${model.provider})` : id;
}
