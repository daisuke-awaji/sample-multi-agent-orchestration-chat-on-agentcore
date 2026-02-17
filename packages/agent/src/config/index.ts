import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

/**
 * Environment variable schema definition
 */
const envSchema = z.object({
  // AWS Configuration
  AWS_REGION: z.string().default('us-east-1'),
  AWS_PROFILE: z.string().optional(),

  // AgentCore Gateway Configuration
  AGENTCORE_GATEWAY_ENDPOINT: z.string().url(),

  // Bedrock Configuration
  BEDROCK_MODEL_ID: z.string().default('global.anthropic.claude-sonnet-4-6'),
  BEDROCK_REGION: z.string().default('us-east-1'),

  // Nova Canvas Configuration
  NOVA_CANVAS_REGION: z.string().default('us-east-1'),

  // AgentCore Memory Configuration
  AGENTCORE_MEMORY_ID: z.string().optional(),

  // Secrets Manager Configuration
  TAVILY_API_KEY_SECRET_NAME: z.string().optional(),
  GITHUB_TOKEN_SECRET_NAME: z.string().optional(),

  // Debug Configuration
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DEBUG_MCP: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),

  // Prompt Caching Configuration
  ENABLE_PROMPT_CACHING: z
    .string()
    .default('true')
    .transform((val) => val === 'true'),
  CACHE_TYPE: z.enum(['default', 'ephemeral']).default('default'),
});

/**
 * Configuration type definition
 */
export type Config = z.infer<typeof envSchema>;

/**
 * Parse and validate environment variables
 */
function parseEnv(): Config {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.issues.map((issue) => issue.path.join('.')).join(', ');
      throw new Error(`Required environment variables are not set: ${missingVars}`);
    }
    throw error;
  }
}

/**
 * Application configuration
 */
export const config = parseEnv();

/**
 * Workspace directory
 * Default working directory for Agent file operations
 */
export const WORKSPACE_DIRECTORY = '/tmp/ws';

/**
 * Logging configuration
 * Automatically JSON.stringify objects to improve readability in CloudWatch
 */
export const logger = {
  debug: (...args: unknown[]) => {
    if (config.LOG_LEVEL === 'debug') {
      const formattedArgs = args.map((arg) =>
        typeof arg === 'object' && arg !== null ? JSON.stringify(arg) : arg
      );
      console.log('[DEBUG]', new Date().toISOString(), ...formattedArgs);
    }
  },
  info: (...args: unknown[]) => {
    if (['debug', 'info'].includes(config.LOG_LEVEL)) {
      const formattedArgs = args.map((arg) =>
        typeof arg === 'object' && arg !== null ? JSON.stringify(arg) : arg
      );
      console.log('[INFO]', new Date().toISOString(), ...formattedArgs);
    }
  },
  warn: (...args: unknown[]) => {
    if (['debug', 'info', 'warn'].includes(config.LOG_LEVEL)) {
      const formattedArgs = args.map((arg) =>
        typeof arg === 'object' && arg !== null ? JSON.stringify(arg) : arg
      );
      console.warn('[WARN]', new Date().toISOString(), ...formattedArgs);
    }
  },
  error: (...args: unknown[]) => {
    const formattedArgs = args.map((arg) =>
      typeof arg === 'object' && arg !== null ? JSON.stringify(arg) : arg
    );
    console.error('[ERROR]', new Date().toISOString(), ...formattedArgs);
  },
};

/**
 * Validate and display configuration values
 */
export function validateConfig(): void {
  logger.info('Configuration validation started');

  logger.debug('Configuration values:', config);
  logger.info('Configuration validation completed');
}
