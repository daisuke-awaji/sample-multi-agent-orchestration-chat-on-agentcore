/**
 * Bedrock model factory — depends on config, delegates pure logic to types/bedrock.ts.
 */
import type { BedrockModel } from '@strands-agents/sdk';
import type { BedrockModelOptions } from '../types/bedrock.js';
import { createBedrockModelWithParams } from '../types/bedrock.js';
import { config, logger } from './index.js';

export function createBedrockModel(options?: BedrockModelOptions): BedrockModel {
  const modelId = options?.modelId || config.BEDROCK_MODEL_ID;
  const region = options?.region || config.BEDROCK_REGION;

  logger.debug('🤖 Creating BedrockModel:', { modelId, region });

  return createBedrockModelWithParams(
    modelId,
    region,
    config.ENABLE_PROMPT_CACHING,
    config.CACHE_TYPE,
    options
  );
}
