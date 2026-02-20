/**
 * Agent invocation endpoint handler
 */

import { Request, Response } from 'express';
import { createAgent } from '../agent.js';
import { getContextMetadata, getCurrentContext } from '../context/request-context.js';
import { setupSession, getSessionStorage } from '../session/session-helper.js';
import { initializeWorkspaceSync } from '../services/workspace-sync-helper.js';
import { logger } from '../config/index.js';
import {
  createErrorMessage,
  sanitizeErrorMessage,
  serializeStreamEvent,
  buildInputContent,
} from '../utils/index.js';
import { validateImageData } from '../validation/index.js';
import { resolveEffectiveUserId } from './auth-resolver.js';
import { publishMessageEvent } from '../services/appsync-events-publisher.js';
import type { InvocationRequest } from './types.js';
import type { SessionType } from '../session/types.js';
import type { RequestContext } from '../context/request-context.js';
import type { ImageData } from '../validation/index.js';

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

interface ParsedRequest {
  prompt: string;
  modelId?: string;
  enabledTools?: string[];
  systemPrompt?: string;
  storagePath?: string;
  agentId?: string;
  memoryEnabled?: boolean;
  memoryTopK?: number;
  mcpConfig?: Record<string, unknown>;
  images?: ImageData[];
  targetUserId?: string;
}

interface ParseResult {
  parsed?: ParsedRequest;
  errorStatus?: number;
  errorMessage?: string;
}

interface UserContextResult {
  actorId?: string;
  errorStatus?: number;
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Extracted helpers
// ---------------------------------------------------------------------------

function parseAndValidateRequest(req: Request): ParseResult {
  const {
    prompt,
    modelId,
    enabledTools,
    systemPrompt,
    storagePath,
    agentId,
    memoryEnabled,
    memoryTopK,
    mcpConfig,
    images,
    targetUserId,
  } = req.body as InvocationRequest;

  if (!prompt?.trim()) {
    return { errorStatus: 400, errorMessage: 'Empty prompt provided' };
  }

  if (images && images.length > 0) {
    const validation = validateImageData(images);
    if (!validation.valid) {
      logger.warn('Image validation failed:', { error: validation.error });
      return { errorStatus: 400, errorMessage: validation.error };
    }
    logger.info(`Image validation passed: ${images.length} image(s)`);
  }

  return {
    parsed: {
      prompt,
      modelId,
      enabledTools,
      systemPrompt,
      storagePath,
      agentId,
      memoryEnabled,
      memoryTopK,
      mcpConfig,
      images,
      targetUserId,
    },
  };
}

function resolveUserAndContext(
  context: RequestContext | undefined,
  targetUserId: string | undefined,
  storagePath: string | undefined,
  requestId: string,
): UserContextResult {
  const userIdResult = resolveEffectiveUserId(context, targetUserId);
  if (userIdResult.error) {
    logger.warn('User ID resolution failed:', {
      requestId,
      error: userIdResult.error.message,
      isMachineUser: context?.isMachineUser,
      targetUserId,
    });
    return { errorStatus: userIdResult.error.status, errorMessage: userIdResult.error.message };
  }

  const actorId = userIdResult.userId;
  if (context) {
    context.userId = actorId;
    context.storagePath = storagePath || '/';
  }

  return { actorId };
}

function initializeSessionAndWorkspace(
  actorId: string,
  sessionId: string | undefined,
  sessionType: SessionType | undefined,
  agentId: string | undefined,
  storagePath: string | undefined,
  context: RequestContext | undefined,
) {
  const workspaceSyncResult = initializeWorkspaceSync(actorId, storagePath, context);

  const sessionResult = setupSession({
    actorId,
    sessionId,
    sessionType,
    agentId,
    storagePath,
  });
  const sessionStorage = getSessionStorage();

  return { sessionResult, sessionStorage, workspaceSyncResult };
}

function buildAgentOptions(
  modelId: string | undefined,
  enabledTools: string[] | undefined,
  systemPrompt: string | undefined,
  sessionResult: ReturnType<typeof setupSession>,
  sessionStorage: ReturnType<typeof getSessionStorage>,
  memoryEnabled: boolean | undefined,
  memoryTopK: number | undefined,
  mcpConfig: Record<string, unknown> | undefined,
  actorId: string,
  prompt: string,
) {
  return {
    modelId,
    enabledTools,
    systemPrompt,
    ...(sessionResult && {
      sessionStorage,
      sessionConfig: sessionResult.config,
    }),
    memoryEnabled,
    memoryContext: memoryEnabled ? prompt : undefined,
    actorId: memoryEnabled ? actorId : undefined,
    memoryTopK,
    mcpConfig,
  };
}

async function streamAgentResponse(
  agent: Awaited<ReturnType<typeof createAgent>>['agent'],
  metadata: Awaited<ReturnType<typeof createAgent>>['metadata'],
  inputContent: ReturnType<typeof buildInputContent>,
  res: Response,
  actorId: string,
  sessionId: string | undefined,
  sessionResult: ReturnType<typeof setupSession>,
  sessionStorage: ReturnType<typeof getSessionStorage>,
  requestId: string,
): Promise<void> {
  try {
    logger.info('Agent streaming started:', { requestId });

    for await (const event of agent.stream(inputContent)) {
      if (event.type === 'messageAddedEvent' && event.message && sessionResult) {
        try {
          await sessionStorage.appendMessage(sessionResult.config, event.message);
          logger.info('Message saved in real-time:', {
            role: event.message.role,
            contentBlocks: event.message.content.length,
          });

          publishMessageEvent(actorId, sessionResult.config.sessionId, {
            type: 'MESSAGE_ADDED',
            sessionId: sessionResult.config.sessionId,
            message: {
              role: event.message.role as 'user' | 'assistant',
              content: event.message.content,
              timestamp: new Date().toISOString(),
            },
          }).catch((err) => {
            logger.warn('AppSync Events publish failed (non-critical):', err);
          });
        } catch (saveError) {
          logger.error('Message save failed (streaming continues):', saveError);
        }
      }

      const safeEvent = serializeStreamEvent(event);
      res.write(`${JSON.stringify(safeEvent)}\n`);
    }

    logger.info('Agent streaming completed:', { requestId });

    const contextMeta = getContextMetadata();
    const completionEvent = {
      type: 'serverCompletionEvent',
      metadata: {
        requestId,
        duration: contextMeta.duration,
        sessionId,
        actorId,
        conversationLength: agent.messages.length,
        agentMetadata: metadata,
      },
    };
    res.write(`${JSON.stringify(completionEvent)}\n`);
    res.end();
  } catch (streamError) {
    logger.error('Agent streaming error:', { requestId, error: streamError });

    if (sessionResult) {
      try {
        const errorMessage = createErrorMessage(streamError, requestId);
        await sessionStorage.appendMessage(sessionResult.config, errorMessage);
        logger.info('Error message saved to session history:', {
          requestId,
          sessionId: sessionResult.config.sessionId,
        });
      } catch (saveError) {
        logger.error('Failed to save error message to session:', saveError);
      }
    }

    const errorEvent = {
      type: 'serverErrorEvent',
      error: {
        message: sanitizeErrorMessage(streamError),
        requestId,
        savedToHistory: !!sessionResult,
      },
    };
    res.write(`${JSON.stringify(errorEvent)}\n`);
    res.end();
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

/**
 * Agent invocation endpoint (with streaming support)
 * Create Agent for each session and persist history
 */
export async function handleInvocation(req: Request, res: Response): Promise<void> {
  try {
    const parseResult = parseAndValidateRequest(req);
    if (parseResult.errorStatus !== undefined) {
      res.status(parseResult.errorStatus).json({ error: parseResult.errorMessage });
      return;
    }
    const {
      prompt,
      modelId,
      enabledTools,
      systemPrompt,
      storagePath,
      agentId,
      memoryEnabled,
      memoryTopK,
      mcpConfig,
      images,
      targetUserId,
    } = parseResult.parsed!;

    const context = getCurrentContext();
    const requestId = context?.requestId || 'unknown';

    const userCtx = resolveUserAndContext(context, targetUserId, storagePath, requestId);
    if (userCtx.errorStatus !== undefined) {
      res.status(userCtx.errorStatus).json({ error: userCtx.errorMessage });
      return;
    }
    const actorId = userCtx.actorId!;

    const sessionId = req.headers['x-amzn-bedrock-agentcore-runtime-session-id'] as
      | string
      | undefined;
    const sessionTypeHeader = req.headers['x-amzn-bedrock-agentcore-runtime-session-type'] as
      | string
      | undefined;
    const sessionType: SessionType | undefined = sessionTypeHeader as SessionType | undefined;

    logger.info('Request received:', {
      requestId,
      prompt,
      actorId,
      sessionId: sessionId || 'none (sessionless mode)',
      sessionType: sessionType || 'user',
      isMachineUser: context?.isMachineUser,
      clientId: context?.clientId,
    });

    const { sessionResult, sessionStorage, workspaceSyncResult } = initializeSessionAndWorkspace(
      actorId,
      sessionId,
      sessionType,
      agentId,
      storagePath,
      context,
    );

    const agentOptions = buildAgentOptions(
      modelId,
      enabledTools,
      systemPrompt,
      sessionResult,
      sessionStorage,
      memoryEnabled,
      memoryTopK,
      mcpConfig,
      actorId,
      prompt,
    );

    const hooks = [sessionResult?.hook, workspaceSyncResult?.hook].filter(
      (hook) => hook !== null && hook !== undefined,
    );
    const { agent, metadata } = await createAgent(hooks, agentOptions);

    logger.info('Agent creation completed:', {
      requestId,
      loadedMessages: metadata.loadedMessagesCount,
      longTermMemories: metadata.longTermMemoriesCount,
      tools: metadata.toolsCount,
    });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const agentInput = buildInputContent(prompt, images);
    await streamAgentResponse(
      agent,
      metadata,
      agentInput,
      res,
      actorId,
      sessionId,
      sessionResult,
      sessionStorage,
      requestId,
    );
  } catch (error) {
    const contextMeta = getContextMetadata();
    logger.error('Error processing request:', {
      requestId: contextMeta.requestId,
      error,
    });

    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        requestId: contextMeta.requestId,
      });
      return;
    }
  }
}
