/**
 * Agent invocation endpoint handler
 */

import { Request, Response } from 'express';
import { nanoid } from 'nanoid';
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

/**
 * Agent invocation endpoint (with streaming support)
 * Create Agent for each session and persist history
 */
export async function handleInvocation(req: Request, res: Response): Promise<void> {
  try {
    // Get each parameter from request body
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
      res.status(400).json({ error: 'Empty prompt provided' });
      return;
    }

    // Server-side image validation
    if (images && images.length > 0) {
      const validation = validateImageData(images);
      if (!validation.valid) {
        logger.warn('Image validation failed:', { error: validation.error });
        res.status(400).json({ error: validation.error });
        return;
      }
      logger.info(`Image validation passed: ${images.length} image(s)`);
    }

    // Get context information (retrieve once)
    const context = getCurrentContext();
    const requestId = context?.requestId || 'unknown';

    // Resolve effective user ID based on authentication type
    const userIdResult = resolveEffectiveUserId(context, targetUserId);
    if (userIdResult.error) {
      logger.warn('User ID resolution failed:', {
        requestId,
        error: userIdResult.error.message,
        isMachineUser: context?.isMachineUser,
        targetUserId,
      });
      res.status(userIdResult.error.status).json({ error: userIdResult.error.message });
      return;
    }
    const actorId = userIdResult.userId;

    // Set userId and storagePath in context
    if (context) {
      context.userId = actorId;
      context.storagePath = storagePath || '/';
    }

    // Get session ID from header (optional)
    const sessionId = req.headers['x-amzn-bedrock-agentcore-runtime-session-id'] as
      | string
      | undefined;

    // Get session type from header (optional, default: 'user')
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

    // Initialize workspace sync (if storagePath is specified)
    const workspaceSyncResult = initializeWorkspaceSync(actorId, storagePath, context);

    // Setup session (if sessionId exists)
    const sessionResult = setupSession({
      actorId,
      sessionId,
      sessionType,
      agentId,
      storagePath,
    });
    const sessionStorage = getSessionStorage();

    // Agent creation options
    const agentOptions = {
      modelId,
      enabledTools,
      systemPrompt,
      ...(sessionResult && {
        sessionStorage,
        sessionConfig: sessionResult.config,
      }),
      // Long-term memory parameters (use JWT userId as actorId)
      memoryEnabled,
      memoryContext: memoryEnabled ? prompt : undefined,
      actorId: memoryEnabled ? actorId : undefined,
      memoryTopK,
      // User-defined MCP server configuration
      mcpConfig,
    };

    // Create Agent (register all hooks)
    const hooks = [sessionResult?.hook, workspaceSyncResult?.hook].filter(
      (hook) => hook !== null && hook !== undefined
    );
    const { agent, metadata } = await createAgent(hooks, agentOptions);

    // Log Agent creation completion
    logger.info('Agent creation completed:', {
      requestId,
      loadedMessages: metadata.loadedMessagesCount,
      longTermMemories: metadata.longTermMemoriesCount,
      tools: metadata.toolsCount,
    });

    // Set headers for streaming response
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    try {
      logger.info('Agent streaming started:', { requestId });

      // Build input content (text + images for multimodal)
      const agentInput = buildInputContent(prompt, images);

      // Track message IDs for deduplication
      // Each role (user/assistant) gets a unique messageId per turn
      let userMessageId: string | null = null;
      let assistantMessageId: string | null = null;

      // Send streaming events as NDJSON
      for await (const event of agent.stream(agentInput)) {
        // For messageAddedEvent, save in real-time (only if session exists)
        if (event.type === 'messageAddedEvent' && event.message && sessionResult) {
          // Generate or reuse messageId based on role
          const role = event.message.role as 'user' | 'assistant';
          let messageId: string;
          if (role === 'user') {
            userMessageId ??= nanoid();
            messageId = userMessageId;
          } else {
            assistantMessageId ??= nanoid();
            messageId = assistantMessageId;
          }

          try {
            await sessionStorage.appendMessage(sessionResult.config, event.message);
            logger.info('Message saved in real-time:', {
              role: event.message.role,
              contentBlocks: event.message.content.length,
              messageId,
            });

            // Publish to AppSync Events for cross-tab/cross-device sync
            publishMessageEvent(actorId, sessionResult.config.sessionId, {
              type: 'MESSAGE_ADDED',
              sessionId: sessionResult.config.sessionId,
              messageId,
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
            // Continue streaming even if save error occurs
          }

          // Add messageId to stream event for frontend deduplication
          const safeEvent = { ...serializeStreamEvent(event), messageId };
          res.write(`${JSON.stringify(safeEvent)}\n`);
        } else {
          // Serialize event avoiding circular references
          const safeEvent = serializeStreamEvent(event);
          res.write(`${JSON.stringify(safeEvent)}\n`);
        }
      }

      logger.info('Agent streaming completed:', { requestId });

      // Get metadata with duration for completion event
      const contextMeta = getContextMetadata();

      // Send completion metadata
      const completionEvent = {
        type: 'serverCompletionEvent',
        metadata: {
          requestId,
          duration: contextMeta.duration,
          sessionId: sessionId,
          actorId: actorId,
          conversationLength: agent.messages.length,
          agentMetadata: metadata,
        },
      };
      res.write(`${JSON.stringify(completionEvent)}\n`);

      res.end();
    } catch (streamError) {
      logger.error('Agent streaming error:', {
        requestId,
        error: streamError,
      });

      // Save error message to session history (if session is configured)
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
          // Continue even if save fails - still send error event to client
        }
      }

      // Send error event
      const errorEvent = {
        type: 'serverErrorEvent',
        error: {
          message: sanitizeErrorMessage(streamError),
          requestId,
          // Include flag to indicate this error was saved to history
          savedToHistory: !!sessionResult,
        },
      };
      res.write(`${JSON.stringify(errorEvent)}\n`);
      res.end();
    }
  } catch (error) {
    const contextMeta = getContextMetadata();
    logger.error('Error processing request:', {
      requestId: contextMeta.requestId,
      error,
    });

    // JSON response for initial error
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
