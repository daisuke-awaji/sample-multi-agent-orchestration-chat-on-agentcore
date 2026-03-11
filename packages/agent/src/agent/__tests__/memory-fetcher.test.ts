/**
 * Memory Fetcher Unit Tests
 *
 * Tests for extractMemoryParams() and fetchLongTermMemories()
 * which handle long-term memory retrieval from AgentCore Memory.
 *
 * Uses jest.unstable_mockModule + dynamic import for ESM compatibility.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ── Mock definitions ───────────────────────────────────────────────────

const mockRetrieveLongTermMemory = jest
  .fn<
    (
      memoryId: string,
      actorId: string,
      context: string,
      topK: number,
      region: string
    ) => Promise<string[]>
  >()
  .mockResolvedValue([]);

// ── Register ESM mocks ─────────────────────────────────────────────────

const mockConfig = {
  AGENTCORE_MEMORY_ID: 'test-memory-id',
  BEDROCK_REGION: 'us-east-1',
};

jest.unstable_mockModule('../../config/index.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  config: mockConfig,
}));

jest.unstable_mockModule('../../session/memory-retriever.js', () => ({
  retrieveLongTermMemory: mockRetrieveLongTermMemory,
}));

// ── Dynamic imports ────────────────────────────────────────────────────

const { extractMemoryParams, fetchLongTermMemories } = await import('../memory-fetcher.js');

describe('extractMemoryParams', () => {
  it('should return defaults when options is undefined', () => {
    const result = extractMemoryParams(undefined);
    expect(result).toEqual({
      enabled: false,
      actorId: undefined,
      context: undefined,
      topK: undefined,
    });
  });

  it('should return defaults when options is empty object', () => {
    const result = extractMemoryParams({});
    expect(result).toEqual({
      enabled: false,
      actorId: undefined,
      context: undefined,
      topK: undefined,
    });
  });

  it('should extract all parameters when provided', () => {
    const result = extractMemoryParams({
      memoryEnabled: true,
      actorId: 'user-123',
      memoryContext: 'What is AI?',
      memoryTopK: 5,
    });
    expect(result).toEqual({
      enabled: true,
      actorId: 'user-123',
      context: 'What is AI?',
      topK: 5,
    });
  });

  it('should treat memoryEnabled=false as disabled', () => {
    const result = extractMemoryParams({ memoryEnabled: false });
    expect(result.enabled).toBe(false);
  });

  it('should treat memoryEnabled=undefined as disabled', () => {
    const result = extractMemoryParams({ memoryEnabled: undefined });
    expect(result.enabled).toBe(false);
  });
});

describe('fetchLongTermMemories', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset config to default values
    mockConfig.AGENTCORE_MEMORY_ID = 'test-memory-id';
    mockConfig.BEDROCK_REGION = 'us-east-1';
  });

  it('should return empty memories when disabled', async () => {
    const result = await fetchLongTermMemories({
      enabled: false,
      actorId: 'user-123',
      context: 'test query',
    });

    expect(result.memories).toEqual([]);
    expect(result.conditions.memoryEnabled).toBe(false);
    expect(mockRetrieveLongTermMemory).not.toHaveBeenCalled();
  });

  it('should return empty memories when AGENTCORE_MEMORY_ID is not configured', async () => {
    mockConfig.AGENTCORE_MEMORY_ID = '';

    const result = await fetchLongTermMemories({
      enabled: true,
      actorId: 'user-123',
      context: 'test query',
    });

    expect(result.memories).toEqual([]);
    expect(result.conditions.hasMemoryId).toBe(false);
    expect(mockRetrieveLongTermMemory).not.toHaveBeenCalled();
  });

  it('should return empty memories when actorId is missing', async () => {
    const result = await fetchLongTermMemories({
      enabled: true,
      actorId: undefined,
      context: 'test query',
    });

    expect(result.memories).toEqual([]);
    expect(result.conditions.hasActorId).toBe(false);
    expect(mockRetrieveLongTermMemory).not.toHaveBeenCalled();
  });

  it('should return empty memories when context is missing', async () => {
    const result = await fetchLongTermMemories({
      enabled: true,
      actorId: 'user-123',
      context: undefined,
    });

    expect(result.memories).toEqual([]);
    expect(result.conditions.hasMemoryContext).toBe(false);
    expect(mockRetrieveLongTermMemory).not.toHaveBeenCalled();
  });

  it('should retrieve memories when all conditions are met', async () => {
    const expectedMemories = ['Memory 1: User likes TypeScript', 'Memory 2: Previous project'];
    mockRetrieveLongTermMemory.mockResolvedValue(expectedMemories);

    const result = await fetchLongTermMemories({
      enabled: true,
      actorId: 'user-123',
      context: 'What is TypeScript?',
      topK: 5,
    });

    expect(result.memories).toEqual(expectedMemories);
    expect(result.conditions).toEqual({
      memoryEnabled: true,
      hasActorId: true,
      hasMemoryContext: true,
      hasMemoryId: true,
    });
    expect(mockRetrieveLongTermMemory).toHaveBeenCalledWith(
      'test-memory-id',
      'user-123',
      'What is TypeScript?',
      5,
      'us-east-1'
    );
  });

  it('should use default topK of 10 when not specified', async () => {
    mockRetrieveLongTermMemory.mockResolvedValue([]);

    await fetchLongTermMemories({
      enabled: true,
      actorId: 'user-123',
      context: 'test query',
    });

    expect(mockRetrieveLongTermMemory).toHaveBeenCalledWith(
      'test-memory-id',
      'user-123',
      'test query',
      10,
      'us-east-1'
    );
  });

  it('should propagate errors from retrieveLongTermMemory', async () => {
    mockRetrieveLongTermMemory.mockRejectedValue(new Error('Memory API error'));

    await expect(
      fetchLongTermMemories({
        enabled: true,
        actorId: 'user-123',
        context: 'test query',
      })
    ).rejects.toThrow('Memory API error');
  });

  it('should return empty memories when actorId is empty string', async () => {
    const result = await fetchLongTermMemories({
      enabled: true,
      actorId: '',
      context: 'test query',
    });

    expect(result.memories).toEqual([]);
    expect(result.conditions.hasActorId).toBe(false);
    expect(mockRetrieveLongTermMemory).not.toHaveBeenCalled();
  });

  it('should return empty memories when context is empty string', async () => {
    const result = await fetchLongTermMemories({
      enabled: true,
      actorId: 'user-123',
      context: '',
    });

    expect(result.memories).toEqual([]);
    expect(result.conditions.hasMemoryContext).toBe(false);
    expect(mockRetrieveLongTermMemory).not.toHaveBeenCalled();
  });

  it('should set correct conditions object for all checks', async () => {
    const result = await fetchLongTermMemories({
      enabled: false,
      actorId: 'user-123',
      context: 'test',
    });

    expect(result.conditions).toEqual({
      memoryEnabled: false,
      hasActorId: true,
      hasMemoryContext: true,
      hasMemoryId: true,
    });
  });
});
