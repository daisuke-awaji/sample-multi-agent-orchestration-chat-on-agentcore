/**
 * Invocations Handler Unit Tests
 *
 * Tests for handleInvocation() which orchestrates request validation,
 * agent creation, and streaming response.
 *
 * Uses jest.unstable_mockModule + dynamic import for ESM compatibility.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ── Mock definitions ───────────────────────────────────────────────────

const mockValidateImageData = jest.fn<any>().mockReturnValue({ valid: true });
const mockResolveEffectiveUserId = jest.fn<any>().mockReturnValue({ userId: 'test-user-id' });
const mockGetCurrentContext = jest.fn<any>();
const mockInitializeWorkspaceSync = jest.fn<any>().mockReturnValue(null);
const mockSetupSession = jest.fn<any>().mockReturnValue(null);
const mockGetSessionStorage = jest.fn<any>().mockReturnValue(null);
const mockAgent = { messages: [], state: new Map() };
const mockMetadata = {
  loadedMessagesCount: 0,
  longTermMemoriesCount: 0,
  toolsCount: 5,
};
const mockCreateAgent = jest.fn<any>().mockResolvedValue({
  agent: mockAgent,
  metadata: mockMetadata,
});
const mockStreamAgentResponse = jest.fn<any>().mockResolvedValue(undefined);

// ── Register ESM mocks ─────────────────────────────────────────────────

jest.unstable_mockModule('../../config/index.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  config: {},
}));

jest.unstable_mockModule('../../validation/index.js', () => ({
  validateImageData: mockValidateImageData,
}));

jest.unstable_mockModule('../auth-resolver.js', () => ({
  resolveEffectiveUserId: mockResolveEffectiveUserId,
}));

jest.unstable_mockModule('../../context/request-context.js', () => ({
  getCurrentContext: mockGetCurrentContext,
}));

jest.unstable_mockModule('../../services/workspace-sync-helper.js', () => ({
  initializeWorkspaceSync: mockInitializeWorkspaceSync,
}));

jest.unstable_mockModule('../../session/session-helper.js', () => ({
  setupSession: mockSetupSession,
  getSessionStorage: mockGetSessionStorage,
}));

jest.unstable_mockModule('../../context/observability-context.js', () => ({
  ObservabilityContext: jest.fn().mockImplementation(() => ({
    traceAsync: jest.fn(async (_name: string, fn: () => Promise<void>) => fn()),
  })),
}));

jest.unstable_mockModule('../../agent.js', () => ({
  createAgent: mockCreateAgent,
}));

jest.unstable_mockModule('../stream-handler.js', () => ({
  streamAgentResponse: mockStreamAgentResponse,
}));

// ── Dynamic imports (after mock registration) ──────────────────────────

const { handleInvocation } = await import('../invocations.js');

// ── Helpers ────────────────────────────────────────────────────────────

function createMockRequest(body: Record<string, unknown> = {}) {
  return {
    body: {
      prompt: 'Hello, world!',
      ...body,
    },
  } as any;
}

function createMockResponse() {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
  };
  return res;
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('handleInvocation', () => {
  let req: any;
  let res: any;
  // Mutable context object — getCurrentContext returns a reference to this
  let mockContext: any;

  beforeEach(() => {
    jest.clearAllMocks();
    req = createMockRequest();
    res = createMockResponse();

    // Create fresh mutable context for each test
    mockContext = {
      requestId: 'test-request-id',
      sessionId: 'test-session-id',
      sessionType: 'user',
      startTime: new Date(),
      isMachineUser: false,
      userId: undefined,
      storagePath: undefined,
    };

    // Set mock return values in beforeEach to avoid hoisting issues
    mockGetCurrentContext.mockReturnValue(mockContext);

    mockValidateImageData.mockReturnValue({ valid: true });
    mockResolveEffectiveUserId.mockReturnValue({ userId: 'test-user-id' });
    mockSetupSession.mockReturnValue(null);
    mockGetSessionStorage.mockReturnValue(null);
    mockCreateAgent.mockResolvedValue({ agent: mockAgent, metadata: mockMetadata });
    mockStreamAgentResponse.mockResolvedValue(undefined);
  });

  describe('request validation', () => {
    it('should return 400 for empty prompt', async () => {
      req = createMockRequest({ prompt: '' });

      await handleInvocation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Empty prompt provided' });
      expect(mockCreateAgent).not.toHaveBeenCalled();
    });

    it('should return 400 for whitespace-only prompt', async () => {
      req = createMockRequest({ prompt: '   ' });

      await handleInvocation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockCreateAgent).not.toHaveBeenCalled();
    });

    it('should return 400 for undefined prompt', async () => {
      req = createMockRequest({ prompt: undefined });

      await handleInvocation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Empty prompt provided' });
      expect(mockCreateAgent).not.toHaveBeenCalled();
    });

    it('should return 400 when image validation fails', async () => {
      mockValidateImageData.mockReturnValue({ valid: false, error: 'Invalid image format' });
      req = createMockRequest({
        prompt: 'Describe this',
        images: [{ base64: 'bad-data', mimeType: 'image/png' }],
      });

      await handleInvocation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid image format' });
      expect(mockCreateAgent).not.toHaveBeenCalled();
    });

    it('should return error when user ID resolution fails', async () => {
      mockResolveEffectiveUserId.mockReturnValue({
        userId: '',
        error: { status: 403, message: 'Forbidden' },
      });

      await handleInvocation(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
      expect(mockCreateAgent).not.toHaveBeenCalled();
    });
  });

  describe('agent creation', () => {
    it('should create agent with correct options', async () => {
      req = createMockRequest({
        prompt: 'Hello',
        modelId: 'custom-model',
        enabledTools: ['tool1', 'tool2'],
        systemPrompt: 'Be helpful',
      });

      await handleInvocation(req, res);

      expect(mockCreateAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          modelId: 'custom-model',
          enabledTools: ['tool1', 'tool2'],
          systemPrompt: 'Be helpful',
        })
      );
    });

    it('should pass memory options when memoryEnabled is true', async () => {
      req = createMockRequest({
        prompt: 'Hello',
        memoryEnabled: true,
        memoryTopK: 5,
      });

      await handleInvocation(req, res);

      expect(mockCreateAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          memoryEnabled: true,
          memoryContext: 'Hello',
          actorId: 'test-user-id',
          memoryTopK: 5,
        })
      );
    });

    it('should not pass memory options when memoryEnabled is false', async () => {
      req = createMockRequest({
        prompt: 'Hello',
        memoryEnabled: false,
      });

      await handleInvocation(req, res);

      expect(mockCreateAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          memoryEnabled: false,
          memoryContext: undefined,
          actorId: undefined,
        })
      );
    });

    it('should set session storage when session is configured', async () => {
      const mockStorage = { loadMessages: jest.fn() };
      const mockSessionResult = {
        hook: { onMessageAdded: jest.fn() },
        config: { sessionId: 'sess-1', actorId: 'actor-1' },
      };
      mockSetupSession.mockReturnValue(mockSessionResult);
      mockGetSessionStorage.mockReturnValue(mockStorage);

      await handleInvocation(req, res);

      expect(mockCreateAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionStorage: mockStorage,
          sessionConfig: mockSessionResult.config,
        })
      );
    });
  });

  describe('context enrichment', () => {
    it('should set userId on context after resolution', async () => {
      await handleInvocation(req, res);

      expect(mockContext.userId).toBe('test-user-id');
    });

    it('should set storagePath on context from request body', async () => {
      req = createMockRequest({ prompt: 'Hello', storagePath: '/my/path' });

      await handleInvocation(req, res);

      expect(mockContext.storagePath).toBe('/my/path');
    });

    it('should default storagePath to "/" when not specified', async () => {
      await handleInvocation(req, res);

      expect(mockContext.storagePath).toBe('/');
    });
  });

  describe('streaming', () => {
    it('should call streamAgentResponse with correct arguments', async () => {
      await handleInvocation(req, res);

      expect(mockStreamAgentResponse).toHaveBeenCalledWith(
        mockAgent,
        'Hello, world!',
        undefined,
        res,
        expect.objectContaining({
          metadata: mockMetadata,
        })
      );
    });

    it('should pass images to streamAgentResponse', async () => {
      const images = [{ base64: 'abc123', mimeType: 'image/png' }];
      req = createMockRequest({ prompt: 'Describe this', images });

      await handleInvocation(req, res);

      expect(mockStreamAgentResponse).toHaveBeenCalledWith(
        mockAgent,
        'Describe this',
        images,
        res,
        expect.any(Object)
      );
    });
  });

  describe('hooks', () => {
    it('should collect hooks from session and workspace sync', async () => {
      const sessionHook = { onMessageAdded: jest.fn() };
      mockSetupSession.mockReturnValue({
        hook: sessionHook,
        config: { sessionId: 'sess-1', actorId: 'actor-1' },
      });

      await handleInvocation(req, res);

      expect(mockCreateAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          hooks: expect.arrayContaining([sessionHook]),
        })
      );
    });

    it('should pass empty hooks when no session or workspace sync', async () => {
      mockSetupSession.mockReturnValue(null);

      await handleInvocation(req, res);

      expect(mockCreateAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          hooks: [],
        })
      );
    });
  });

  describe('sessionless mode', () => {
    it('should not set sessionStorage/sessionConfig when no sessionId', async () => {
      mockContext.sessionId = undefined;
      mockSetupSession.mockReturnValue(null);
      mockGetSessionStorage.mockReturnValue(null);

      await handleInvocation(req, res);

      const agentOptions = mockCreateAgent.mock.calls[0][0] as any;
      expect(agentOptions.sessionStorage).toBeUndefined();
      expect(agentOptions.sessionConfig).toBeUndefined();
    });
  });

  describe('MCP config', () => {
    it('should pass mcpConfig to agent options', async () => {
      const mcpConfig = {
        mcpServers: { test: { command: 'npx', args: ['-y', 'test-server'] } },
      };
      req = createMockRequest({ prompt: 'Hello', mcpConfig });

      await handleInvocation(req, res);

      expect(mockCreateAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          mcpConfig,
        })
      );
    });
  });
});
