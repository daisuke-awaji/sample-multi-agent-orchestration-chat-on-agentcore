/**
 * Service for invoking Agent API
 */

import { randomUUID } from 'crypto';
import { SchedulerEventPayload, EventDrivenContext } from '../types/index.js';
import { AgentsService, MCPConfig } from './agents-service.js';
import { buildEventDrivenSystemPrompt } from './prompt-builder.js';

/**
 * Encode ARN in Agent URL for AgentCore Runtime
 * @param url - URL to encode
 * @returns Encoded URL
 */
function encodeAgentUrl(url: string): string {
  if (url.includes('bedrock-agentcore') && url.includes('/runtimes/arn:')) {
    return url.replace(/\/runtimes\/(arn:[^/]+\/[^/]+)\//, (_match: string, arn: string) => {
      return `/runtimes/${encodeURIComponent(arn)}/`;
    });
  }
  return url;
}

/**
 * Agent invocation request
 */
interface AgentInvocationRequest {
  prompt: string;
  modelId?: string;
  storagePath?: string;
  enabledTools?: string[];
  targetUserId: string;
  sessionId?: string;
  systemPrompt?: string;
  mcpConfig?: MCPConfig;
  agentId?: string;
}

/**
 * Agent invocation response
 */
interface AgentInvocationResponse {
  requestId: string;
  sessionId?: string;
  success: boolean;
  error?: string;
}

/**
 * Prepared request for Agent API
 */
interface PreparedRequest {
  request: AgentInvocationRequest;
  sessionId: string;
}

/**
 * Service for invoking Agent /invocations API
 */
export class AgentInvoker {
  private readonly agentApiUrl: string;
  private readonly agentsService: AgentsService;

  constructor(agentApiUrl: string, agentsService: AgentsService) {
    // Encode ARN in URL if needed
    this.agentApiUrl = encodeAgentUrl(agentApiUrl);
    this.agentsService = agentsService;
    console.log('AgentInvoker initialized with URL:', this.agentApiUrl);
  }

  /**
   * Build Agent invocation request from payload and agent configuration
   */
  private async prepareRequest(
    payload: SchedulerEventPayload,
    eventContext?: EventDrivenContext
  ): Promise<PreparedRequest> {
    console.log('Fetching Agent configuration:', {
      userId: payload.userId,
      agentId: payload.agentId,
    });

    const agent = await this.agentsService.getAgent(payload.userId, payload.agentId);

    if (!agent) {
      throw new Error(`Agent not found: ${payload.agentId}`);
    }

    console.log('Agent configuration fetched:', {
      name: agent.name,
      systemPrompt: agent.systemPrompt.substring(0, 100) + '...',
      enabledTools: agent.enabledTools,
      hasMcpConfig: !!agent.mcpConfig,
    });

    const systemPrompt = eventContext
      ? buildEventDrivenSystemPrompt(agent.systemPrompt, eventContext)
      : agent.systemPrompt;

    console.log('System prompt preparation:', {
      hasEventContext: !!eventContext,
      originalLength: agent.systemPrompt.length,
      finalLength: systemPrompt.length,
    });

    const sessionId = payload.sessionId || randomUUID();

    return {
      request: {
        prompt: payload.prompt,
        targetUserId: payload.userId,
        sessionId,
        modelId: payload.modelId,
        storagePath: payload.workingDirectory,
        systemPrompt,
        enabledTools: agent.enabledTools,
        mcpConfig: agent.mcpConfig,
        agentId: payload.agentId,
      },
      sessionId,
    };
  }

  /**
   * Send HTTP request to Agent API
   */
  private async sendRequest(
    request: AgentInvocationRequest,
    sessionId: string,
    authToken: string
  ): Promise<Response> {
    const response = await fetch(this.agentApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
        'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id': sessionId,
        'X-Amzn-Bedrock-AgentCore-Runtime-Session-Type': 'event',
        'X-Amzn-Trace-Id': `trigger-${Date.now()}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Agent API returned ${response.status}: ${errorText}`);
    }

    return response;
  }

  /**
   * Invoke Agent synchronously (reads full NDJSON stream)
   */
  async invoke(
    payload: SchedulerEventPayload,
    authToken: string,
    eventContext?: EventDrivenContext
  ): Promise<AgentInvocationResponse> {
    try {
      const { request, sessionId } = await this.prepareRequest(payload, eventContext);

      console.log('Invoking Agent API (sync):', {
        url: this.agentApiUrl,
        triggerId: payload.triggerId,
        agentId: payload.agentId,
      });

      const response = await this.sendRequest(request, sessionId, authToken);

      // Parse NDJSON streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let requestId = '';
      let resultSessionId = sessionId;

      if (reader) {
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              const event = JSON.parse(line);

              if (event.type === 'serverCompletionEvent') {
                requestId = event.metadata?.requestId || '';
                resultSessionId = event.metadata?.sessionId || resultSessionId;
              }

              if (event.type === 'serverErrorEvent') {
                throw new Error(event.error?.message || 'Unknown error from Agent');
              }
            } catch (parseError) {
              console.warn('Failed to parse event line:', line, parseError);
            }
          }
        }
      }

      return { requestId, sessionId: resultSessionId, success: true };
    } catch (error) {
      console.error('Failed to invoke Agent:', error);
      return {
        requestId: '',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Invoke Agent asynchronously (fire-and-forget)
   * Sends the request, verifies HTTP 200 acceptance, and returns immediately
   * without reading the NDJSON stream. AgentCore continues processing server-side.
   */
  async invokeAsync(
    payload: SchedulerEventPayload,
    authToken: string,
    eventContext?: EventDrivenContext
  ): Promise<AgentInvocationResponse> {
    try {
      const { request, sessionId } = await this.prepareRequest(payload, eventContext);

      console.log('Invoking Agent API (async fire-and-forget):', {
        url: this.agentApiUrl,
        triggerId: payload.triggerId,
        agentId: payload.agentId,
        sessionId,
      });

      await this.sendRequest(request, sessionId, authToken);

      console.log('Agent API accepted invocation (HTTP 200). Returning without reading stream.');

      return { requestId: '', sessionId, success: true };
    } catch (error) {
      console.error('Failed to invoke Agent (async):', error);
      return {
        requestId: '',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Create AgentInvoker from environment variables
   */
  static fromEnvironment(agentsService: AgentsService): AgentInvoker {
    const agentApiUrl = process.env.AGENT_API_URL;

    if (!agentApiUrl) {
      throw new Error('AGENT_API_URL environment variable is required');
    }

    return new AgentInvoker(agentApiUrl, agentsService);
  }
}
