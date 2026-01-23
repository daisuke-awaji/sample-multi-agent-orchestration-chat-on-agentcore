/**
 * Secure logging utilities
 * Provides functions to sanitize sensitive information from logs
 */

/**
 * List of sensitive keys that should be redacted from logs
 */
const SENSITIVE_KEYS = [
  'token',
  'authorization',
  'password',
  'secret',
  'apikey',
  'api_key',
  'clientsecret',
  'client_secret',
  'bearer',
  'jwt',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'idtoken',
  'id_token',
] as const;

/**
 * Sanitize an object by redacting sensitive information
 * @param data - Object to sanitize
 * @returns Sanitized object with sensitive values redacted
 */
export function sanitizeForLogging(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_KEYS.some((sensitive) => lowerKey.includes(sensitive));

    if (isSensitive) {
      sanitized[key] = value ? '[REDACTED]' : undefined;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeForLogging(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Check if an Authorization header exists without exposing its content
 * @param authHeader - Authorization header value
 * @returns Safe object for logging
 */
export function sanitizeAuthHeader(authHeader?: string): {
  present: boolean;
  format?: 'bearer' | 'invalid';
} {
  if (!authHeader) {
    return { present: false };
  }

  return {
    present: true,
    format: authHeader.startsWith('Bearer ') ? 'bearer' : 'invalid',
  };
}

/**
 * Get safe token metadata without exposing the token itself
 * @param token - JWT token
 * @returns Safe metadata for logging
 */
export function getTokenMetadata(token?: string): {
  present: boolean;
  length?: number;
  format?: 'valid' | 'invalid';
} {
  if (!token) {
    return { present: false };
  }

  const parts = token.split('.');
  return {
    present: true,
    length: token.length,
    format: parts.length === 3 ? 'valid' : 'invalid',
  };
}
