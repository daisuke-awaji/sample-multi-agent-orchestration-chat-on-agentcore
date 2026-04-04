// AWS AgentCore sessionId constraints: [a-zA-Z0-9][a-zA-Z0-9-_]*
// Alphanumeric-only characters to ensure the first character is always valid.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 33;
const MASK = 63; // 2^6 - 1, next power of 2 above alphabet size (62)

export function generateSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_LENGTH * 2));
  let result = '';
  let pos = 0;
  while (result.length < ID_LENGTH) {
    const idx = bytes[pos++] & MASK;
    if (idx < ALPHABET.length) {
      result += ALPHABET[idx];
    }
  }
  return result;
}
