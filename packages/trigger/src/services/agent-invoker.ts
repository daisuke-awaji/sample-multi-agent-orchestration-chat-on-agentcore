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
   * Invoke Agent with Machine User authentication
   * @param payload - Scheduler event payload
   * @param authToken - Machine user authentication token
   * @param eventContext - Optional event-driven context for building system prompt
   */
  async invoke(
    payload: SchedulerEventPayload,
    authToken: string,
    eventContext?: EventDrivenContext
  ): Promise<AgentInvocationResponse> {
    // Fetch Agent configuration from DynamoDB
    console.log('Fetching Agent configuration:', {
      userId: payload.userId,
      agentId: payload.agentId,
    });

    const agent = await this.agentsService.getAgent(payload.userId, payload.agentId);

    if (!agent) {
      console.error('Agent not found:', {
        userId: payload.userId,
        agentId: payload.agentId,
      });
      return {
        requestId: '',
        success: false,
        error: `Agent not found: ${payload.agentId}`,
      };
    }

    console.log('Agent configuration fetched:', {
      name: agent.name,
      systemPrompt: agent.systemPrompt.substring(0, 100) + '...',
      enabledTools: agent.enabledTools,
      hasMcpConfig: !!agent.mcpConfig,
    });

    // Build system prompt with event context if provided
    const systemPrompt = eventContext
      ? buildEventDrivenSystemPrompt(agent.systemPrompt, eventContext)
      : agent.systemPrompt;

    console.log('System prompt preparation:', {
      hasEventContext: !!eventContext,
      originalLength: agent.systemPrompt.length,
      finalLength: systemPrompt.length,
    });

    // Build request with Agent configuration
    const request: AgentInvocationRequest = {
      prompt: payload.prompt,
      targetUserId: payload.userId,
      sessionId: payload.sessionId,
      modelId: payload.modelId, // Use modelId from trigger payload if specified
      storagePath: payload.workingDirectory, // Use workingDirectory as storagePath
      systemPrompt, // Use event-driven system prompt if context provided, otherwise original
      enabledTools: agent.enabledTools, // Always use Agent's enabledTools
      mcpConfig: agent.mcpConfig, // Include MCP configuration if available
      agentId: payload.agentId, // Pass agentId for DynamoDB session metadata tracking
    };

    console.log('Invoking Agent API:', {
      url: this.agentApiUrl,
      triggerId: payload.triggerId,
      userId: payload.userId,
      agentId: payload.agentId,
      hasSystemPrompt: !!request.systemPrompt,
      enabledToolsCount: request.enabledTools?.length || 0,
      hasMcpConfig: !!request.mcpConfig,
    });

    // Generate session ID if not provided
    const actualSessionId = payload.sessionId || randomUUID();

    try {
      const response = await fetch(this.agentApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
          'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id': actualSessionId,
          'X-Amzn-Bedrock-AgentCore-Runtime-Session-Type': 'event',
          'X-Amzn-Trace-Id': `trigger-${Date.now()}`,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Agent API returned ${response.status}: ${errorText}`);
      }

      // Parse NDJSON streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let requestId = '';
      let sessionId = payload.sessionId;

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

              // Extract metadata from completion event
              if (event.type === 'serverCompletionEvent') {
                requestId = event.metadata?.requestId || '';
                sessionId = event.metadata?.sessionId || sessionId;
              }

              // Check for errors
              if (event.type === 'serverErrorEvent') {
                throw new Error(event.error?.message || 'Unknown error from Agent');
              }
            } catch (parseError) {
              console.warn('Failed to parse event line:', line, parseError);
            }
          }
        }
      }

      return {
        requestId,
        sessionId,
        success: true,
      };
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
