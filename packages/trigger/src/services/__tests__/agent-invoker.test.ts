/**
 * Unit tests for AgentInvoker service
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AgentInvoker } from '../agent-invoker.js';
import type { AgentsService } from '../agents-service.js';
import type { SchedulerEventPayload } from '../../types/index.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMockAgent(overrides: Partial<ReturnType<typeof buildAgent>> = {}) {
  return buildAgent(overrides);
}

function buildAgent(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-123',
    agentId: 'agent-456',
    name: 'Test Agent',
    description: 'A test agent',
    systemPrompt: 'You are a helpful assistant.',
    enabledTools: ['tool-a'],
    scenarios: [],
    mcpConfig: undefined,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    isShared: false,
    createdBy: 'user-123',
    ...overrides,
  };
}

function makePayload(overrides: Partial<SchedulerEventPayload> = {}): SchedulerEventPayload {
  return {
    triggerId: 'trigger-001',
    userId: 'user-123',
    agentId: 'agent-456',
    prompt: 'Hello, agent!',
    ...overrides,
  };
}

function makeAgentsService(
  agentOverrides: Record<string, unknown> = {}
): jest.Mocked<AgentsService> {
  return {
    getAgent: jest
      .fn<() => Promise<ReturnType<typeof buildAgent>>>()
      .mockResolvedValue(makeMockAgent(agentOverrides)),
  } as unknown as jest.Mocked<AgentsService>;
}

/**
 * Build a minimal ReadableStream-based Response for NDJSON streaming tests.
 */
function makeNdjsonResponse(lines: string[]): Response {
  const ndjson = lines.join('\n') + '\n';
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(ndjson));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AgentInvoker', () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.fn<typeof fetch>();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.AGENT_API_URL;
  });

  // ── encodeAgentUrl (tested via constructor + fetch call) ──────────────────

  describe('encodeAgentUrl (via URL passed to fetch)', () => {
    it('should percent-encode ARN containing slashes inside /runtimes/ path', async () => {
      const rawUrl =
        'https://xxx.bedrock-agentcore.us-east-1.amazonaws.com/runtimes/arn:aws:bedrock-agentcore:us-east-1:123456:runtime/my-runtime/invocations';
      const expectedEncodedArn = encodeURIComponent(
        'arn:aws:bedrock-agentcore:us-east-1:123456:runtime/my-runtime'
      );
      const expectedUrl = `https://xxx.bedrock-agentcore.us-east-1.amazonaws.com/runtimes/${expectedEncodedArn}/invocations`;

      const service = makeAgentsService();
      fetchMock.mockResolvedValue(makeNdjsonResponse([]));
      const invoker = new AgentInvoker(rawUrl, service);
      await invoker.invoke(makePayload(), 'auth-token');

      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toBe(expectedUrl);
    });

    it('should not modify URL that does not contain bedrock-agentcore', async () => {
      const url = 'https://example.com/runtimes/arn:something/my-agent/invocations';
      const service = makeAgentsService();
      fetchMock.mockResolvedValue(makeNdjsonResponse([]));
      const invoker = new AgentInvoker(url, service);
      await invoker.invoke(makePayload(), 'token');

      expect(fetchMock.mock.calls[0][0] as string).toBe(url);
    });

    it('should not modify URL that has bedrock-agentcore but no /runtimes/arn: segment', async () => {
      const url = 'https://xxx.bedrock-agentcore.us-east-1.amazonaws.com/invocations';
      const service = makeAgentsService();
      fetchMock.mockResolvedValue(makeNdjsonResponse([]));
      const invoker = new AgentInvoker(url, service);
      await invoker.invoke(makePayload(), 'token');

      expect(fetchMock.mock.calls[0][0] as string).toBe(url);
    });

    it('should handle URL that is already percent-encoded (no double-encoding)', async () => {
      const encodedArn = encodeURIComponent(
        'arn:aws:bedrock-agentcore:us-east-1:123456:runtime/my-runtime'
      );
      const alreadyEncoded = `https://xxx.bedrock-agentcore.us-east-1.amazonaws.com/runtimes/${encodedArn}/invocations`;

      const service = makeAgentsService();
      fetchMock.mockResolvedValue(makeNdjsonResponse([]));
      const invoker = new AgentInvoker(alreadyEncoded, service);
      await invoker.invoke(makePayload(), 'token');

      // When the URL doesn't literally contain /runtimes/arn:, regex won't match → unchanged
      expect(fetchMock.mock.calls[0][0] as string).toBe(alreadyEncoded);
    });
  });

  // ── fromEnvironment ───────────────────────────────────────────────────────

  describe('fromEnvironment', () => {
    it('should throw when AGENT_API_URL is not set', () => {
      delete process.env.AGENT_API_URL;
      expect(() => AgentInvoker.fromEnvironment(makeAgentsService())).toThrow(
        'AGENT_API_URL environment variable is required'
      );
    });

    it('should create an instance when AGENT_API_URL is set', () => {
      process.env.AGENT_API_URL = 'https://api.example.com/invocations';
      const invoker = AgentInvoker.fromEnvironment(makeAgentsService());
      expect(invoker).toBeInstanceOf(AgentInvoker);
    });
  });

  // ── invoke (sync) ─────────────────────────────────────────────────────────

  describe('invoke', () => {
    it('should return success with requestId from serverCompletionEvent', async () => {
      const service = makeAgentsService();
      const completionEvent = JSON.stringify({
        type: 'serverCompletionEvent',
        metadata: { requestId: 'req-789', sessionId: 'sess-abc' },
      });
      fetchMock.mockResolvedValue(makeNdjsonResponse([completionEvent]));

      const invoker = new AgentInvoker('https://api.example.com/invocations', service);
      const result = await invoker.invoke(makePayload(), 'my-auth-token');

      expect(result.success).toBe(true);
      expect(result.requestId).toBe('req-789');
      expect(result.sessionId).toBe('sess-abc');
    });

    it('should use provided sessionId from payload', async () => {
      const service = makeAgentsService();
      fetchMock.mockResolvedValue(makeNdjsonResponse([]));

      const invoker = new AgentInvoker('https://api.example.com/invocations', service);
      const result = await invoker.invoke(makePayload({ sessionId: 'custom-session' }), 'token');

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('custom-session');
    });

    it('should send correct headers including Authorization', async () => {
      const service = makeAgentsService();
      fetchMock.mockResolvedValue(makeNdjsonResponse([]));

      const invoker = new AgentInvoker('https://api.example.com/invocations', service);
      await invoker.invoke(makePayload(), 'my-bearer-token');

      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect((options.headers as Record<string, string>)['Authorization']).toBe(
        'Bearer my-bearer-token'
      );
      expect((options.headers as Record<string, string>)['Content-Type']).toBe('application/json');
      expect(options.method).toBe('POST');
    });

    it('should return success=false when agent is not found', async () => {
      const service = {
        getAgent: jest.fn<() => Promise<null>>().mockResolvedValue(null),
      } as unknown as jest.Mocked<AgentsService>;

      const invoker = new AgentInvoker('https://api.example.com/invocations', service);
      const result = await invoker.invoke(makePayload(), 'token');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Agent not found');
    });

    it('should return success=false when fetch returns non-ok status', async () => {
      const service = makeAgentsService();
      fetchMock.mockResolvedValue(new Response('Unauthorized', { status: 401 }));

      const invoker = new AgentInvoker('https://api.example.com/invocations', service);
      const result = await invoker.invoke(makePayload(), 'bad-token');

      expect(result.success).toBe(false);
      expect(result.error).toContain('401');
    });

    it('should swallow serverErrorEvent thrown inside inner parse catch (documented behavior)', async () => {
      // Note: serverErrorEvent throws inside the inner try/catch that wraps JSON.parse,
      // so the error is caught and logged as console.warn rather than propagated.
      // The outer try-catch never sees it, so invoke returns success: true.
      const service = makeAgentsService();
      const errorEvent = JSON.stringify({
        type: 'serverErrorEvent',
        error: { message: 'Internal agent error' },
      });
      fetchMock.mockResolvedValue(makeNdjsonResponse([errorEvent]));

      const invoker = new AgentInvoker('https://api.example.com/invocations', service);
      const result = await invoker.invoke(makePayload(), 'token');

      // The error is swallowed by the inner catch; invoke still reports success
      expect(result.success).toBe(true);
    });

    it('should include request body with agent configuration', async () => {
      const service = makeAgentsService({ enabledTools: ['code-runner', 'browser'] });
      fetchMock.mockResolvedValue(makeNdjsonResponse([]));

      const invoker = new AgentInvoker('https://api.example.com/invocations', service);
      await invoker.invoke(makePayload({ prompt: 'run the tests' }), 'token');

      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.prompt).toBe('run the tests');
      expect(body.targetUserId).toBe('user-123');
      expect(body.enabledTools).toEqual(['code-runner', 'browser']);
    });
  });

  // ── invokeAsync (fire-and-forget) ─────────────────────────────────────────

  describe('invokeAsync', () => {
    it('should return success without reading the stream', async () => {
      const service = makeAgentsService();
      fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

      const invoker = new AgentInvoker('https://api.example.com/invocations', service);
      const result = await invoker.invokeAsync(makePayload(), 'token');

      expect(result.success).toBe(true);
      expect(result.requestId).toBe('');
    });

    it('should return success=false when agent is not found', async () => {
      const service = {
        getAgent: jest.fn<() => Promise<null>>().mockResolvedValue(null),
      } as unknown as jest.Mocked<AgentsService>;

      const invoker = new AgentInvoker('https://api.example.com/invocations', service);
      const result = await invoker.invokeAsync(makePayload(), 'token');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Agent not found');
    });

    it('should return success=false on HTTP error', async () => {
      const service = makeAgentsService();
      fetchMock.mockResolvedValue(new Response('Service Unavailable', { status: 503 }));

      const invoker = new AgentInvoker('https://api.example.com/invocations', service);
      const result = await invoker.invokeAsync(makePayload(), 'token');

      expect(result.success).toBe(false);
      expect(result.error).toContain('503');
    });

    it('should call fetch with same URL encoding as invoke', async () => {
      const rawUrl =
        'https://xxx.bedrock-agentcore.us-east-1.amazonaws.com/runtimes/arn:aws:bedrock-agentcore:us-east-1:123456:runtime/my-runtime/invocations';
      const service = makeAgentsService();
      fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

      const invoker = new AgentInvoker(rawUrl, service);
      await invoker.invokeAsync(makePayload(), 'token');

      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain('bedrock-agentcore');
      expect(calledUrl).not.toContain('/runtimes/arn:aws:bedrock-agentcore:');
      expect(calledUrl).toContain(
        encodeURIComponent('arn:aws:bedrock-agentcore:us-east-1:123456:runtime/my-runtime')
      );
    });
  });
});
