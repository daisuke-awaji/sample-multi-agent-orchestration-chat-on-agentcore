/**
 * EventBridge Scheduler event handler
 * Triggered by EventBridge Scheduler to invoke Agent API
 */

import { SchedulerEvent } from '../types/index.js';
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
  const { triggerId, userId, agentId, prompt } = payload;

  if (!triggerId || !userId || !agentId || !prompt) {
    console.error('Invalid event payload:', payload);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required fields in event payload' }),
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

  // Start execution record
  let executionId: string;
  try {
    executionId = await executionRecorder.startExecution(triggerId, userId);
  } catch (error) {
    console.error('Failed to create execution record:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to create execution record',
        message: error instanceof Error ? error.message : String(error),
      }),
    };
  }

  try {
    // Step 1: Get Machine User authentication token
    console.log('Obtaining Machine User token...');
    const tokenResponse = await authService.getMachineUserToken();

    // Step 2: Invoke Agent API
    console.log('Invoking Agent API...');
    const invocationResponse = await agentInvoker.invoke(payload, tokenResponse.accessToken);

    if (!invocationResponse.success) {
      // Record failure
      await executionRecorder.failExecution(
        triggerId,
        executionId,
        invocationResponse.error || 'Unknown error'
      );

      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Agent invocation failed',
          message: invocationResponse.error,
          executionId,
        }),
      };
    }

    // Step 3: Record successful execution
    await executionRecorder.completeExecution(
      triggerId,
      executionId,
      invocationResponse.requestId,
      invocationResponse.sessionId
    );

    // Step 4: Update trigger's last execution timestamp
    await executionRecorder.updateTriggerLastExecution(userId, triggerId);

    console.log('Trigger execution completed successfully:', {
      triggerId,
      executionId,
      requestId: invocationResponse.requestId,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        triggerId,
        executionId,
        requestId: invocationResponse.requestId,
        sessionId: invocationResponse.sessionId,
      }),
    };
  } catch (error) {
    console.error('Unexpected error during trigger execution:', error);

    // Record failure
    try {
      await executionRecorder.failExecution(
        triggerId,
        executionId,
        error instanceof Error ? error.message : String(error)
      );
    } catch (recordError) {
      console.error('Failed to record execution failure:', recordError);
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Unexpected error',
        message: error instanceof Error ? error.message : String(error),
        executionId,
      }),
    };
  }
}
