import { BedrockModel } from '@strands-agents/sdk';
import { config } from '../config/index.js';

export interface BedrockModelOptions {
  modelId?: string;
  region?: string;
}

/**
 * Bedrock モデルを作成
 */
export function createBedrockModel(options?: BedrockModelOptions): BedrockModel {
  const modelId = options?.modelId || config.BEDROCK_MODEL_ID;
  const region = options?.region || config.BEDROCK_REGION;

  return new BedrockModel({
    region,
    modelId,
  });
}
