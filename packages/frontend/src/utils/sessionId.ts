import { customAlphabet } from 'nanoid';

// AWS AgentCore sessionId constraints: [a-zA-Z0-9][a-zA-Z0-9-_]*
// Custom nanoid with alphanumeric characters only (excluding hyphens and underscores)
// to ensure the first character is always alphanumeric.
export const generateSessionId = customAlphabet(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  33
);
