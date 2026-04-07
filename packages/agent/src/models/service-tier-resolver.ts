/**
 * Service tier resolver for Amazon Bedrock inference.
 *
 * Determines the effective service tier based on configuration and session type.
 * In "auto" mode, non-interactive sessions (event, subagent) use the Flex tier
 * for a 50% cost reduction, while user-facing sessions use the Standard tier
 * to preserve real-time latency.
 *
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/service-tiers-inference.html
 */

import type { SessionType } from '../session/types.js';
import type { ServiceTier, ServiceTierConfig } from './bedrock.js';
import { config } from '../config/index.js';

/**
 * Resolve the effective service tier based on configuration and session type.
 *
 * In "auto" mode:
 * - event sessions → "flex" (50% discount)
 * - subagent sessions → "flex" (50% discount)
 * - user sessions → "default" (standard tier for real-time UX)
 */
export function resolveServiceTier(sessionType?: SessionType): ServiceTier {
  const configured: ServiceTierConfig = config.BEDROCK_SERVICE_TIER;

  if (configured !== 'auto') {
    return configured;
  }

  switch (sessionType) {
    case 'event':
    case 'subagent':
      return 'flex';
    case 'user':
    default:
      return 'default';
  }
}
