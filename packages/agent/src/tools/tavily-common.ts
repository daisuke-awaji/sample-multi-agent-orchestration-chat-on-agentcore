/**
 * Tavily API common utilities
 */
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { logger } from '../config/index.js';

/**
 * Truncate content to a safe size limit.
 * Shared across all Tavily tools to avoid duplication.
 */
export function truncateContent(content: string, maxLength: number): string {
  if (maxLength <= 0) {
    throw new RangeError(`maxLength must be > 0, got ${maxLength}`);
  }

  if (content.length <= maxLength) {
    return content;
  }

  const truncated = content.substring(0, maxLength);
  return `${truncated}... (Content truncated due to length. Original length: ${content.length} characters)`;
}

let cachedApiKey: string | null = null;

/**
 * Get Tavily API key
 * 1. Return cached key if available
 * 2. Use TAVILY_API_KEY environment variable if available (for local development)
 * 3. Retrieve from Secrets Manager if TAVILY_API_KEY_SECRET_NAME is available
 */
export async function getTavilyApiKey(): Promise<string> {
  // Return cached key if available
  if (cachedApiKey) {
    return cachedApiKey;
  }

  // Get directly from environment variable (for local development)
  if (process.env.TAVILY_API_KEY) {
    cachedApiKey = process.env.TAVILY_API_KEY;
    logger.debug('Tavily API Key loaded from TAVILY_API_KEY environment variable');
    return cachedApiKey;
  }

  // Get from Secrets Manager (for production)
  const secretName = process.env.TAVILY_API_KEY_SECRET_NAME;
  if (secretName) {
    try {
      const client = new SecretsManagerClient({});
      const response = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
      cachedApiKey = response.SecretString || null;
      if (cachedApiKey) {
        logger.info(`Tavily API Key loaded from Secrets Manager: ${secretName}`);
        return cachedApiKey;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to retrieve Tavily API Key from Secrets Manager: ${errorMessage}`);
      throw new Error(`Failed to retrieve API key from Secrets Manager: ${errorMessage}`, { cause: error });
    }
  }

  throw new Error('TAVILY_API_KEY or TAVILY_API_KEY_SECRET_NAME environment variable is not set');
}
