/**
 * Agent Factory Unit Tests
 *
 * Tests for createAgent() which orchestrates all sub-modules to build
 * the Strands Agent instance. All dependencies are mocked.
 *
 * Uses jest.unstable_mockModule + dynamic import for ESM compatibility.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ── Mock definitions ───────────────────────────────────────────────────

const mockBuildUserMCPClients = jest.fn<any>().mockReturnValue([]);
const mockBuildToolSet = jest.fn<any>().mockResolvedValue({
  tools: [{ name: 'mock-tool' }],
  mcpClients: [],
  gatewayMCPTools: [],
  counts: { local: 1, gateway: 0, userMCP: 0, total: 1 },
});
const mockExtractMemoryParams = jest.fn<any>().mockReturnValue({ enabled: false });
const mockFetchLongTermMemories = jest.fn<any>().mockResolvedValue({
  memories: [],
  conditions: {
    memoryEnabled: false,
    hasActorId: false,
    hasMemoryContext: false,
    hasMemoryId: false,
  },
});
const mockLoadSessionHistory = jest.fn<any>().mockResolvedValue([]);
const mockModel = { id: 'mock-model' };
const mockCreateBedrockModel = jest.fn<any>().mockReturnValue(mockModel);
const mockGetPromptCachingSupport = jest.fn<any>().mockReturnValue('none');
const mockBuildSystemPrompt = jest.fn<any>().mockReturnValue('mock system prompt');
const mockGetCurrentStoragePath = jest.fn<any>().mockReturnValue('/');
const mockAgentInstance = {
  state: new Map(),
  messages: [],
};
const mockAgentConstructor = jest.fn<any>().mockReturnValue(mockAgentInstance);
const mockConversationManagerConstructor = jest.fn<any>().mockReturnValue({});

// ── Register ESM mocks ─────────────────────────────────────────────────

jest.unstable_mockModule('../../config/index.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  config: {
    BEDROCK_MODEL_ID: 'default-model-id',
    CONVERSATION_WINDOW_SIZE: 20,
  },
}));

jest.unstable_mockModule('../mcp-clients-builder.js', () => ({
  buildUserMCPClients: mockBuildUserMCPClients,
}));

jest.unstable_mockModule('../tools-builder.js', () => ({
  buildToolSet: mockBuildToolSet,
}));

jest.unstable_mockModule('../memory-fetcher.js', () => ({
  extractMemoryParams: mockExtractMemoryParams,
  fetchLongTermMemories: mockFetchLongTermMemories,
}));

jest.unstable_mockModule('../session-loader.js', () => ({
  loadSessionHistory: mockLoadSessionHistory,
}));

jest.unstable_mockModule('../../models/index.js', () => ({
  createBedrockModel: mockCreateBedrockModel,
  getPromptCachingSupport: mockGetPromptCachingSupport,
}));

jest.unstable_mockModule('../../session/cache-point-appender.js', () => ({
  CachePointAppender: jest.fn().mockImplementation(() => ({
    apply: jest.fn((messages: unknown[]) => messages),
  })),
}));

jest.unstable_mockModule('../../prompts/index.js', () => ({
  buildSystemPrompt: mockBuildSystemPrompt,
}));

jest.unstable_mockModule('../../context/request-context.js', () => ({
  getCurrentStoragePath: mockGetCurrentStoragePath,
}));

jest.unstable_mockModule('@strands-agents/sdk', () => ({
  Agent: function (...args: any[]) {
    return mockAgentConstructor(...args);
  },
  SlidingWindowConversationManager: function (...args: any[]) {
    return mockConversationManagerConstructor(...args);
  },
}));

// ── Dynamic imports ────────────────────────────────────────────────────

const { createAgent } = await import('../../agent.js');

// ── Tests ──────────────────────────────────────────────────────────────

describe('createAgent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAgentInstance.state = new Map();
  });

  it('should create agent with default options', async () => {
    const result = await createAgent();

    expect(result.agent).toBeDefined();
    expect(result.metadata).toBeDefined();
    expect(result.metadata.loadedMessagesCount).toBe(0);
    expect(result.metadata.longTermMemoriesCount).toBe(0);
    expect(result.metadata.toolsCount).toBe(1);
  });

  it('should call buildUserMCPClients with mcpConfig', async () => {
    const mcpConfig = { mcpServers: { test: { command: 'test' } } };
    await createAgent({ mcpConfig });

    expect(mockBuildUserMCPClients).toHaveBeenCalledWith(mcpConfig);
  });

  it('should call buildToolSet with enabledTools and userMCPClients', async () => {
    const enabledTools = ['tool1', 'tool2'];
    await createAgent({ enabledTools });

    expect(mockBuildToolSet).toHaveBeenCalledWith(enabledTools, []);
  });

  it('should call loadSessionHistory with session storage and config', async () => {
    const mockStorage = { loadMessages: jest.fn() };
    const mockConfig = { sessionId: 'sess-1', actorId: 'actor-1' };

    await createAgent({
      sessionStorage: mockStorage as any,
      sessionConfig: mockConfig as any,
    });

    expect(mockLoadSessionHistory).toHaveBeenCalledWith(mockStorage, mockConfig);
  });

  it('should call extractMemoryParams and fetchLongTermMemories', async () => {
    const options = {
      memoryEnabled: true,
      actorId: 'user-123',
      memoryContext: 'test context',
    };

    await createAgent(options);

    expect(mockExtractMemoryParams).toHaveBeenCalledWith(options);
    expect(mockFetchLongTermMemories).toHaveBeenCalled();
  });

  it('should use custom modelId when provided', async () => {
    await createAgent({ modelId: 'custom-model-id' });

    expect(mockCreateBedrockModel).toHaveBeenCalledWith({ modelId: 'custom-model-id' });
    expect(mockGetPromptCachingSupport).toHaveBeenCalledWith('custom-model-id');
  });

  it('should use default model ID from config when not provided', async () => {
    await createAgent();

    expect(mockGetPromptCachingSupport).toHaveBeenCalledWith('default-model-id');
  });

  it('should pass custom system prompt to buildSystemPrompt', async () => {
    await createAgent({ systemPrompt: 'You are a helpful assistant.' });

    expect(mockBuildSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        customPrompt: 'You are a helpful assistant.',
      })
    );
  });

  it('should pass storagePath to buildSystemPrompt', async () => {
    mockGetCurrentStoragePath.mockReturnValue('/user/docs');

    await createAgent();

    expect(mockBuildSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        storagePath: '/user/docs',
      })
    );
  });

  it('should create SlidingWindowConversationManager with configured window size', async () => {
    await createAgent();

    expect(mockConversationManagerConstructor).toHaveBeenCalledWith({
      windowSize: 20,
      shouldTruncateResults: true,
    });
  });

  it('should pass hooks to Agent constructor', async () => {
    const mockHooks = [{ onMessageAdded: jest.fn() }];
    await createAgent({ hooks: mockHooks as any });

    expect(mockAgentConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        hooks: mockHooks,
      })
    );
  });

  it('should pass tools and mcpClients to Agent constructor', async () => {
    const mockTools = [{ name: 'tool-x' }];
    const mockMCPClients = [{ id: 'mcp-1' }];
    mockBuildToolSet.mockResolvedValue({
      tools: mockTools,
      mcpClients: mockMCPClients,
      gatewayMCPTools: [],
      counts: { local: 1, gateway: 0, userMCP: 1, total: 2 },
    });

    await createAgent();

    expect(mockAgentConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [...mockTools, ...mockMCPClients],
      })
    );
  });

  it('should pass cached messages to Agent constructor', async () => {
    const mockMessages = [{ role: 'user', content: [{ type: 'textBlock', text: 'Hi' }] }];
    mockLoadSessionHistory.mockResolvedValue(mockMessages);

    await createAgent();

    // CachePointAppender.apply is a pass-through in mock, so messages should be passed as-is
    expect(mockAgentConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: mockMessages,
      })
    );
  });

  it('should pass model to Agent constructor', async () => {
    await createAgent();

    expect(mockAgentConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        model: mockModel,
      })
    );
  });

  it('should pass system prompt to Agent constructor', async () => {
    await createAgent();

    expect(mockAgentConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: 'mock system prompt',
      })
    );
  });

  it('should set storagePath in agent state when available', async () => {
    mockGetCurrentStoragePath.mockReturnValue('/my/path');

    await createAgent();

    expect(mockAgentInstance.state.get('storagePath')).toBe('/my/path');
  });

  it('should return correct metadata with memory conditions', async () => {
    const mockConditions = {
      memoryEnabled: true,
      hasActorId: true,
      hasMemoryContext: true,
      hasMemoryId: true,
    };
    mockFetchLongTermMemories.mockResolvedValue({
      memories: ['mem1', 'mem2'],
      conditions: mockConditions,
    });

    const result = await createAgent();

    expect(result.metadata.longTermMemoriesCount).toBe(2);
    expect(result.metadata.memoryConditions).toEqual(mockConditions);
  });

  it('should execute loadSessionHistory, buildToolSet, and fetchLongTermMemories in parallel', async () => {
    // Track call order to verify parallelism
    const callOrder: string[] = [];

    mockLoadSessionHistory.mockImplementation(async () => {
      callOrder.push('session-start');
      await new Promise((resolve) => setTimeout(resolve, 10));
      callOrder.push('session-end');
      return [];
    });

    mockBuildToolSet.mockImplementation(async () => {
      callOrder.push('tools-start');
      await new Promise((resolve) => setTimeout(resolve, 10));
      callOrder.push('tools-end');
      return {
        tools: [],
        mcpClients: [],
        gatewayMCPTools: [],
        counts: { local: 0, gateway: 0, userMCP: 0, total: 0 },
      };
    });

    mockFetchLongTermMemories.mockImplementation(async () => {
      callOrder.push('memory-start');
      await new Promise((resolve) => setTimeout(resolve, 10));
      callOrder.push('memory-end');
      return { memories: [], conditions: {} };
    });

    await createAgent();

    // All three should start before any ends (parallel execution)
    const startIndices = ['session-start', 'tools-start', 'memory-start'].map((s) =>
      callOrder.indexOf(s)
    );
    const endIndices = ['session-end', 'tools-end', 'memory-end'].map((s) => callOrder.indexOf(s));

    // All starts should come before all ends
    const maxStart = Math.max(...startIndices);
    const minEnd = Math.min(...endIndices);
    expect(maxStart).toBeLessThan(minEnd);
  });
});
