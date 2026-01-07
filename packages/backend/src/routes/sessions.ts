/**
 * Session management API endpoints
 * API for managing AgentCore Memory sessions and events
 */

import { Router, Response } from 'express';
import { jwtAuthMiddleware, AuthenticatedRequest, getCurrentAuth } from '../middleware/auth.js';
import { createAgentCoreMemoryService } from '../services/agentcore-memory.js';
import { config } from '../config/index.js';

const router = Router();

/**
 * Session list retrieval endpoint
 * GET /sessions
 * JWT authentication required - Use user ID as actorId
 * Returns all sessions sorted by creation date (newest first)
 */
router.get('/', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const actorId = auth.userId;

    if (!actorId) {
      return res.status(400).json({
        error: 'Invalid authentication',
        message: 'Failed to retrieve user ID',
        requestId: auth.requestId,
      });
    }

    // Check if AgentCore Memory ID is configured
    if (!config.agentcore.memoryId) {
      return res.status(500).json({
        error: 'Configuration Error',
        message: 'AgentCore Memory ID is not configured',
        requestId: auth.requestId,
      });
    }

    console.log(`📋 Session list retrieval started (${auth.requestId}):`, {
      userId: actorId,
      username: auth.username,
    });

    const memoryService = createAgentCoreMemoryService();
    const result = await memoryService.listSessions(actorId);

    console.log(
      `✅ Session list retrieval completed (${auth.requestId}): ${result.sessions.length} items, hasMore: ${result.hasMore}`
    );

    res.status(200).json({
      sessions: result.sessions,
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        actorId,
        count: result.sessions.length,
        nextToken: result.nextToken,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    const auth = getCurrentAuth(req);
    console.error(`💥 Session list retrieval error (${auth.requestId}):`, error);

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to retrieve session list',
      requestId: auth.requestId,
    });
  }
});

/**
 * Session conversation history retrieval endpoint
 * GET /sessions/:sessionId/events
 * JWT authentication required - Use user ID as actorId
 */
router.get(
  '/:sessionId/events',
  jwtAuthMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const auth = getCurrentAuth(req);
      const actorId = auth.userId;
      const { sessionId } = req.params;

      if (!actorId) {
        return res.status(400).json({
          error: 'Invalid authentication',
          message: 'Failed to retrieve user ID',
          requestId: auth.requestId,
        });
      }

      if (!sessionId) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'Session ID is not specified',
          requestId: auth.requestId,
        });
      }

      // Check if AgentCore Memory ID is configured
      if (!config.agentcore.memoryId) {
        return res.status(500).json({
          error: 'Configuration Error',
          message: 'AgentCore Memory ID is not configured',
          requestId: auth.requestId,
        });
      }

      console.log(`💬 Session conversation history retrieval started (${auth.requestId}):`, {
        userId: actorId,
        username: auth.username,
        sessionId,
      });

      const memoryService = createAgentCoreMemoryService();
      const events = await memoryService.getSessionEvents(actorId, sessionId);

      console.log(
        `✅ Session conversation history retrieval completed (${auth.requestId}): ${events.length} items`
      );

      res.status(200).json({
        events,
        metadata: {
          requestId: auth.requestId,
          timestamp: new Date().toISOString(),
          actorId,
          sessionId,
          count: events.length,
        },
      });
    } catch (error) {
      const auth = getCurrentAuth(req);
      console.error(`💥 Session conversation history retrieval error (${auth.requestId}):`, error);

      res.status(500).json({
        error: 'Internal Server Error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to retrieve session conversation history',
        requestId: auth.requestId,
      });
    }
  }
);

export default router;
