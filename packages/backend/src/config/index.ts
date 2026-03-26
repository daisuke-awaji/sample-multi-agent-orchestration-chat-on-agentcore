/**
 * Backend API Configuration
 * Manage environment variables and application settings
 */

import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

// Load environment variables
loadEnv();

/**
 * Environment variable schema definition
 */
const envSchema = z.object({
  // Server configuration
  PORT: z.string().default('3000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Cognito configuration (required for JWT verification)
  COGNITO_USER_POOL_ID: z.string({
    required_error: 'COGNITO_USER_POOL_ID is required for JWT verification',
  }),
  COGNITO_REGION: z.string({
    required_error: 'COGNITO_REGION is required for JWT verification',
  }),
  COGNITO_CLIENT_ID: z.string().optional(),

  // CORS configuration
  CORS_ALLOWED_ORIGINS: z.string().default('*'),

  // AgentCore Memory configuration (required)
  AGENTCORE_MEMORY_ID: z.string({
    required_error: 'AGENTCORE_MEMORY_ID is required for memory features',
  }),
  AWS_REGION: z.string().default('us-east-1'),

  // AgentCore Gateway configuration (required)
  AGENTCORE_GATEWAY_ENDPOINT: z.string({
    required_error: 'AGENTCORE_GATEWAY_ENDPOINT is required for MCP tool integration',
  }),

  // User Storage configuration (required)
  USER_STORAGE_BUCKET_NAME: z.string({
    required_error: 'USER_STORAGE_BUCKET_NAME is required for user file storage',
  }),

  // Agents Table configuration (required)
  AGENTS_TABLE_NAME: z.string({
    required_error: 'AGENTS_TABLE_NAME is required for agent management',
  }),

  // Sessions Table configuration (required)
  SESSIONS_TABLE_NAME: z.string({
    required_error: 'SESSIONS_TABLE_NAME is required for session management',
  }),

  // SSM Parameter Store prefix for MCP env values (required)
  SSM_PARAMETER_PREFIX: z.string({
    required_error: 'SSM_PARAMETER_PREFIX is required for secure MCP env storage',
  }),
});

/**
 * Validate and parse environment variables
 */
function parseEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    console.error('❌ Invalid environment variable configuration:', error);
    process.exit(1);
  }
}

const env = parseEnv();

/**
 * Application configuration
 */
export const config = {
  // Server configuration
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',

  // Cognito configuration (used by aws-jwt-verify)
  cognito: {
    userPoolId: env.COGNITO_USER_POOL_ID,
    region: env.COGNITO_REGION,
    clientId: env.COGNITO_CLIENT_ID,
  },

  // CORS configuration
  cors: {
    allowedOrigins: env.CORS_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()),
  },

  // AgentCore Memory configuration
  agentcore: {
    memoryId: env.AGENTCORE_MEMORY_ID,
    region: env.AWS_REGION,
  },

  // AgentCore Gateway configuration
  gateway: {
    endpoint: env.AGENTCORE_GATEWAY_ENDPOINT,
  },

  // User Storage configuration
  userStorageBucketName: env.USER_STORAGE_BUCKET_NAME,

  // Agents Table configuration
  agentsTableName: env.AGENTS_TABLE_NAME,

  // Sessions Table configuration
  sessionsTableName: env.SESSIONS_TABLE_NAME,

  // SSM Parameter Store prefix for MCP env values (e.g. "/agentcore/mocadev")
  ssmParameterPrefix: env.SSM_PARAMETER_PREFIX,
} as const;

console.log('⚙️  Backend API configuration loaded:', {
  port: config.port,
  nodeEnv: config.nodeEnv,
  hasCognitoUserPoolId: !!config.cognito.userPoolId,
  hasCognitoClientId: !!config.cognito.clientId,
  corsOrigins: config.cors.allowedOrigins,
});
