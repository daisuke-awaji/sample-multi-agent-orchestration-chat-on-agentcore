/**
 * Session Loader Unit Tests
 *
 * Tests for loadSessionHistory() which loads saved messages
 * from session storage for conversation continuity.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { SessionStorage, SessionConfig } from '../../../services/session/types.js';
import type { SessionId } from '@moca/core';

// Mock logger to suppress output during tests
jest.mock('../../../config/index.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  config: {},
}));

import { loadSessionHistory } from '../session-loader.js';

/** Create a minimal mock message object for testing (avoids importing ESM SDK) */
function createMockMessage(role: string, text: string) {
  return { role, content: [{ type: 'textBlock', text }] };
}

describe('loadSessionHistory', () => {
  const mockMessages = [createMockMessage('user', 'Hello'), createMockMessage('assistant', 'Hi!')];

  const mockSessionConfig: SessionConfig = {
    sessionId: 'test-session-id' as SessionId,
    actorId: 'test-actor-id',
  };

  let mockSessionStorage: jest.Mocked<SessionStorage>;

  beforeEach(() => {
    mockSessionStorage = {
      loadMessages: jest.fn<() => Promise<unknown[]>>().mockResolvedValue(mockMessages),
      saveMessages: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      appendMessage: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      clearSession: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SessionStorage>;
  });

  it('should return empty array when sessionStorage is undefined', async () => {
    const result = await loadSessionHistory(undefined, mockSessionConfig);
    expect(result).toEqual([]);
  });

  it('should return empty array when sessionConfig is undefined', async () => {
    const result = await loadSessionHistory(mockSessionStorage, undefined);
    expect(result).toEqual([]);
  });

  it('should return empty array when both parameters are undefined', async () => {
    const result = await loadSessionHistory(undefined, undefined);
    expect(result).toEqual([]);
  });

  it('should load messages from session storage when both parameters are provided', async () => {
    const result = await loadSessionHistory(mockSessionStorage, mockSessionConfig);

    expect(mockSessionStorage.loadMessages).toHaveBeenCalledWith(mockSessionConfig);
    expect(result).toEqual(mockMessages);
  });

  it('should return empty array when storage has no messages', async () => {
    mockSessionStorage.loadMessages.mockResolvedValue([]);

    const result = await loadSessionHistory(mockSessionStorage, mockSessionConfig);

    expect(result).toEqual([]);
  });

  it('should propagate errors from session storage', async () => {
    mockSessionStorage.loadMessages.mockRejectedValue(new Error('Storage unavailable'));

    await expect(loadSessionHistory(mockSessionStorage, mockSessionConfig)).rejects.toThrow(
      'Storage unavailable'
    );
  });
});
