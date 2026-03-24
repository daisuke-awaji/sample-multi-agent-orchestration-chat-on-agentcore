/**
 * Utility functions for AgentCore Runtime
 */

export { sanitizeErrorMessage, createErrorMessage } from './error-handler.js';
export { serializeStreamEvent } from './stream-serializer.js';
export { buildInputContent } from './input-builder.js';
export { sanitizeForLogging, sanitizeAuthHeader, getTokenMetadata } from './logger.js';
export {
  assumeUserScopedRole,
  assumeUserScopedS3Role,
  createUserScopedS3Client,
  createUserScopedDynamoDBClient,
  getUserScopedEnvVars,
  clearCredentialCache,
} from './scoped-credentials.js';
