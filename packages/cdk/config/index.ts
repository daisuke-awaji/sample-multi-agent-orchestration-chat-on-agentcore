/**
 * CDK Configuration Files
 *
 * File structure:
 * - environments.ts      : Environment settings (edit this for deployment)
 * - environment-types.ts : Type definitions
 * - environment-utils.ts : Logic (getEnvironmentConfig, etc.)
 */

// Export type definitions
export type {
  Environment,
  EnvironmentConfig,
  EnvironmentConfigInput,
  EventRuleConfig,
} from './environment-types';

// Export configurations
export { BASE_PREFIX, environments } from './environments';

// Export utilities
export { getEnvironmentConfig } from './environment-utils';
