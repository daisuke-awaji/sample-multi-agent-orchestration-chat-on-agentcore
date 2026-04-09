/**
 * Agent invocation endpoint handler
 *
 * Thin orchestrator that uses RequestContext as the single source of
 * request-scoped state. Delegates streaming to `stream-handler.ts`.
 *
 * Unhandled errors are caught by the global error handler in app.ts
 * via the asyncHandler wrapper.
 */

import type { Request, Response } from 'express';
import type { HookProvider } from '@strands-agents/sdk';
import type { CreateAgentOptions } from '../runtime/agent/types.js';
import type { InvocationRequest } from './types.js';
import { createAgent } from '../agent.js';
import { getCurrentContext } from '../libs/context/request-context.js';
import { ObservabilityContext } from '../libs/context/observability-context.js';
import { setupSession, getSessionStorage } from '../services/session/session-helper.js';
import { initializeWorkspaceSync } from '../services/workspace-sync-helper.js';
import { createSessionPersistenceDeps } from '../services/session-persistence-deps-factory.js';
import { logger } from '../config/index.js';
import { validateImageData } from '../types/validation/index.js';
import { resolveEffectiveUserId } from './auth-resolver.js';
import { streamAgentResponse } from './stream-handler.js';

/**
 * Validate the request body and resolve the effective user ID.
 * Sends an error response and returns null if validation fails.
 */
function validateRequest(body: InvocationRequest, res: Response): string | null {
  // Validate prompt (allow empty prompt if images are provided)
  const hasImages = body.images && body.images.length > 0;
  if (!body.prompt?.trim() && !hasImages) {
    res.status(400).json({ error: 'Empty prompt provided' });
    return null;
  }

  // Validate images
  if (body.images && body.images.length > 0) {
    const validation = validateImageData(body.images);
    if (!validation.valid) {
      logger.warn('Image validation failed:', { error: validation.error });
      res.status(400).json({ error: validation.error });
      return null;
    }
  }

  // Resolve effective user ID
  const context = getCurrentContext();
  const userIdResult = resolveEffectiveUserId(context, body.targetUserId);
  if (userIdResult.error) {
    logger.warn('User ID resolution failed:', {
      requestId: context?.requestId,
      error: userIdResult.error.message,
    });
    res.status(userIdResult.error.status).json({ error: userIdResult.error.message });
    return null;
  }

  return userIdResult.userId;
}

/**
 * Agent invocation endpoint (with streaming support).
 * Creates an Agent per session and persists history.
 */
export async function handleInvocation(req: Request, res: Response): Promise<void> {
  const body = req.body as InvocationRequest;
  const context = getCurrentContext()!;

  // 1. Validate and resolve actor
  const actorId = validateRequest(body, res);
  if (!actorId) return;

  // Enrich context with resolved values
  context.userId = actorId;
  context.storagePath = body.storagePath || '/';

  const { sessionId, sessionType, requestId } = context;

  logger.info('Request received:', {
    requestId,
    prompt: body.prompt,
    actorId,
    sessionId: sessionId || 'none (sessionless mode)',
  });

  // 2. Initialize workspace sync (if storagePath is specified)
  const workspaceSyncResult = initializeWorkspaceSync(actorId, body.storagePath, context);

  // 3. Setup session (if sessionId exists)
  const sessionResult = setupSession({
    actorId,
    sessionId,
    sessionType,
    agentId: body.agentId,
    storagePath: body.storagePath,
    deps: createSessionPersistenceDeps(),
  });
  const sessionStorage = getSessionStorage();

  // 4. Build agent options
  const hooks = [sessionResult?.hook, workspaceSyncResult?.hook].filter(
    (hook) => hook != null
  ) as HookProvider[];

  const agentOptions: CreateAgentOptions = {
    hooks,
    modelId: body.modelId,
    enabledTools: body.enabledTools,
    systemPrompt: body.systemPrompt,
    memoryEnabled: body.memoryEnabled,
    memoryContext: body.memoryEnabled ? body.prompt : undefined,
    actorId: body.memoryEnabled ? actorId : undefined,
    memoryTopK: body.memoryTopK,
    mcpConfig: body.mcpConfig,
  };

  if (sessionResult) {
    agentOptions.sessionStorage = sessionStorage;
    agentOptions.sessionConfig = sessionResult.config;
  }

  // 5. Execute within observability span
  const otelCtx = new ObservabilityContext({
    actorId,
    sessionId,
    sessionType,
    agentId: body.agentId,
    modelId: body.modelId,
    isMachineUser: context.isMachineUser,
    memoryEnabled: body.memoryEnabled,
  });

  await otelCtx.traceAsync('agent.invocation', async () => {
    const { agent, metadata } = await createAgent(agentOptions);

    logger.info('Agent creation completed:', {
      requestId,
      loadedMessages: metadata.loadedMessagesCount,
      longTermMemories: metadata.longTermMemoriesCount,
      tools: metadata.toolsCount,
    });

    await streamAgentResponse(agent, body.prompt, body.images, res, {
      metadata,
      sessionStorage: sessionResult ? sessionStorage : undefined,
      sessionConfig: sessionResult?.config,
    });
  });
}
