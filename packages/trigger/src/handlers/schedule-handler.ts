/**
 * EventBridge Scheduler event handler
 * Triggered by EventBridge Scheduler to invoke Agent API
 */

import { SchedulerEvent, EventDrivenContext } from '../types/index.js';
import { parseTriggerId } from '@moca/core';
import { AuthService } from '../services/auth-service.js';
import { AgentInvoker } from '../services/agent-invoker.js';
import { ExecutionRecorder } from '../services/execution-recorder.js';
import { createAgentsService } from '../services/agents-service.js';

/**
 * Lambda handler response
 */
export interface HandlerResponse {
  statusCode: number;
  body: string;
}

/**
 * Handle EventBridge Scheduler event
 */
export async function handleSchedulerEvent(event: SchedulerEvent): Promise<HandlerResponse> {
  console.log('Received Scheduler event:', JSON.stringify(event, null, 2));

  const payload = event.detail;
  const { triggerId: rawTriggerId, userId, agentId, prompt } = payload;

  if (!rawTriggerId || !userId || !agentId || !prompt) {
    console.error('Invalid event payload:', payload);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required fields in event payload' }),
    };
  }

  // Validate triggerId format (runtime check — EventBridge payload is untyped JSON)
  let triggerId;
  try {
    triggerId = parseTriggerId(rawTriggerId);
  } catch {
    console.error('Invalid triggerId in event payload, discarding:', { rawTriggerId });
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid triggerId format in event payload' }),
    };
  }

  // Initialize services
  let authService: AuthService;
  let agentInvoker: AgentInvoker;
  let executionRecorder: ExecutionRecorder;

  try {
    authService = AuthService.fromEnvironment();
    const agentsService = createAgentsService();
    agentInvoker = AgentInvoker.fromEnvironment(agentsService);
    executionRecorder = ExecutionRecorder.fromEnvironment();
  } catch (error) {
    console.error('Failed to initialize services:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Service initialization failed',
        message: error instanceof Error ? error.message : String(error),
      }),
    };
  }

  try {
    // Step 1: Get Machine User authentication token
    console.log('Obtaining Machine User token...');
    const tokenResponse = await authService.getMachineUserToken();

    // Step 2: Build event-driven context
    const eventContext: EventDrivenContext = {
      triggerId,
      executionTime: new Date().toISOString(),
      eventBridge: {
        id: event.id,
        source: event.source,
        detailType: event['detail-type'],
        account: event.account,
        region: event.region,
        time: event.time,
        resources: event.resources,
      },
      eventDetail: payload as unknown as Record<string, unknown>,
    };

    console.log('Event context prepared:', {
      triggerId: eventContext.triggerId,
      source: eventContext.eventBridge.source,
      detailType: eventContext.eventBridge.detailType,
    });

    // Step 3: Invoke Agent API with fire-and-forget (async)
    console.log('Invoking Agent API (async fire-and-forget)...');
    const invocationResponse = await agentInvoker.invokeAsync(
      payload,
      tokenResponse.accessToken,
      eventContext
    );

    // Step 4: Record execution (success or failure)
    const executionId = await executionRecorder.recordExecution(
      triggerId,
      invocationResponse.sessionId,
      event,
      invocationResponse.success ? undefined : invocationResponse.error
    );

    // Step 5: Update trigger's last execution timestamp
    await executionRecorder.updateTriggerLastExecution(userId, triggerId);

    if (!invocationResponse.success) {
      console.error('Agent invocation failed:', {
        triggerId,
        executionId,
        error: invocationResponse.error,
      });

      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Agent invocation failed',
          message: invocationResponse.error,
          executionId,
        }),
      };
    }

    console.log('Trigger invocation dispatched successfully (fire-and-forget):', {
      triggerId,
      executionId,
      sessionId: invocationResponse.sessionId,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        triggerId,
        executionId,
        sessionId: invocationResponse.sessionId,
      }),
    };
  } catch (error) {
    console.error('Unexpected error during trigger execution:', error);

    // Record unexpected errors too
    try {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await executionRecorder.recordExecution(triggerId, undefined, event, errorMsg);
      await executionRecorder.updateTriggerLastExecution(userId, triggerId);
    } catch (recordError) {
      console.error('Failed to record execution error (non-critical):', recordError);
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Unexpected error',
        message: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}
