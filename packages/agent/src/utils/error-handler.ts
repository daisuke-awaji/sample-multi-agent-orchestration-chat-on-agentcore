/**
 * Error handling utilities for AgentCore Runtime
 */

import { Message, TextBlock } from '@strands-agents/sdk';

/**
 * Sanitize error message to remove sensitive information
 * @param error Error object or unknown value
 * @returns Sanitized error message safe for storage and display
 */
export function sanitizeErrorMessage(error: unknown): string {
  let rawMessage: unknown;
  if (error instanceof Error) {
    rawMessage = error.message;
  } else {
    rawMessage = error;
  }

  // AWS SDK v3 streaming errors (e.g. ModelStreamErrorException) may have a
  // non-string `message` property.  Safely convert to a printable string.
  const message: string =
    typeof rawMessage === 'string'
      ? rawMessage
      : (() => {
          try {
            return JSON.stringify(rawMessage);
          } catch {
            return String(rawMessage);
          }
        })();

  // Remove sensitive information patterns
  return (
    message
      // Remove Bearer tokens
      .replace(/Bearer [A-Za-z0-9\-_.]+/gi, '[TOKEN]')
      // Remove AWS credentials and long alphanumeric strings (potential keys/secrets)
      .replace(/AKIA[A-Z0-9]{16}/g, '[AWS_KEY]')
      .replace(/[a-zA-Z0-9/+]{40,}/g, '[REDACTED]')
      // Remove file paths that might contain usernames
      .replace(/\/home\/[^/\s]+/g, '/home/[USER]')
      .replace(/\/Users\/[^/\s]+/g, '/Users/[USER]')
      // Remove potential email addresses
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
      // Limit message length to prevent extremely long error messages
      .substring(0, 500)
  );
}

/**
 * Create error message for session storage
 * @param error Error object
 * @param requestId Request ID for tracking
 * @returns Message object formatted for storage
 */
export function createErrorMessage(error: unknown, requestId: string): Message {
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  const sanitizedMessage = sanitizeErrorMessage(error);

  const errorText = `[SYSTEM_ERROR]\nAn error occurred.\nType: ${errorName}\nDetails: ${sanitizedMessage}\nRequest ID: ${requestId}\n[/SYSTEM_ERROR]`;

  return new Message({
    role: 'assistant',
    content: [new TextBlock(errorText)],
  });
}
