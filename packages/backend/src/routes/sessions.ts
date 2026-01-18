/**
 * Session management API endpoints
 * API for managing sessions via DynamoDB and AgentCore Memory
 */

import { Router, Response } from 'express';
import { jwtAuthMiddleware, AuthenticatedRequest, getCurrentAuth } from '../middleware/auth.js';
import { createAgentCoreMemoryService } from '../services/agentcore-memory.js';
import { getSessionsDynamoDBService } from '../services/sessions-dynamodb.js';
import { config } from '../config/index.js';

const router = Router();

/**
 * Session list retrieval endpoint
 * GET /sessions
 * JWT authentication required - Use user ID as actorId
 * Returns all sessions from DynamoDB sorted by updatedAt (newest first)
 */
router.get('/', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const actorId = auth.userId;

    // Parse pagination query parameters
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const nextToken = req.query.nextToken as string | undefined;

    if (!actorId) {
      return res.status(400).json({
        error: 'Invalid authentication',
        message: 'Failed to retrieve user ID',
        requestId: auth.requestId,
      });
    }

    console.log(`📋 Session list retrieval started (${auth.requestId}):`, {
      userId: actorId,
      username: auth.username,
      limit,
      hasNextToken: !!nextToken,
    });

    const sessionsDynamoDBService = getSessionsDynamoDBService();

    // Check if DynamoDB Sessions Table is configured
    if (!sessionsDynamoDBService.isConfigured()) {
      return res.status(500).json({
        error: 'Configuration Error',
        message: 'Sessions Table is not configured',
        requestId: auth.requestId,
      });
    }

    // Use DynamoDB for session list with pagination
    const result = await sessionsDynamoDBService.listSessions(actorId, limit, nextToken);

    console.log(
      `✅ Session list retrieval completed (${auth.requestId}): ${result.sessions.length} items, hasMore: ${result.hasMore}`
    );

    res.status(200).json({
      sessions: result.sessions.map((session) => ({
        sessionId: session.sessionId,
        title: session.title,
        sessionType: session.sessionType,
        agentId: session.agentId,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      })),
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        actorId,
        count: result.sessions.length,
        nextToken: result.nextToken,
        hasMore: result.hasMore,
        source: 'dynamodb',
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

      // Verify session ownership via DynamoDB
      const sessionsDynamoDBService = getSessionsDynamoDBService();
      if (sessionsDynamoDBService.isConfigured()) {
        const session = await sessionsDynamoDBService.getSession(actorId, sessionId);
        if (!session) {
          console.warn(`⚠️ Access denied to session (${auth.requestId}): ${sessionId}`);
          return res.status(403).json({
            error: 'Forbidden',
            message: 'You do not have permission to access this session',
            requestId: auth.requestId,
          });
        }
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

/**
 * Session deletion endpoint
 * DELETE /sessions/:sessionId
 * JWT authentication required - Use user ID as actorId
 * Deletes from both DynamoDB and AgentCore Memory
 */
router.delete(
  '/:sessionId',
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

      console.log(`🗑️ Session deletion started (${auth.requestId}):`, {
        userId: actorId,
        username: auth.username,
        sessionId,
      });

      // Verify session ownership before deletion
      const sessionsDynamoDBService = getSessionsDynamoDBService();
      if (sessionsDynamoDBService.isConfigured()) {
        const session = await sessionsDynamoDBService.getSession(actorId, sessionId);
        if (!session) {
          console.warn(`⚠️ Access denied to delete session (${auth.requestId}): ${sessionId}`);
          return res.status(403).json({
            error: 'Forbidden',
            message: 'You do not have permission to delete this session',
            requestId: auth.requestId,
          });
        }
      }

      const errors: string[] = [];

      // Delete from DynamoDB
      if (sessionsDynamoDBService.isConfigured()) {
        try {
          await sessionsDynamoDBService.deleteSession(actorId, sessionId);
          console.log(`✅ Deleted session from DynamoDB: ${sessionId}`);
        } catch (dynamoError) {
          console.error(`⚠️ Failed to delete session from DynamoDB: ${sessionId}`, dynamoError);
          errors.push(
            `DynamoDB: ${dynamoError instanceof Error ? dynamoError.message : 'Unknown error'}`
          );
        }
      }

      // Delete from AgentCore Memory
      if (config.agentcore.memoryId) {
        try {
          const memoryService = createAgentCoreMemoryService();
          await memoryService.deleteSession(actorId, sessionId);
          console.log(`✅ Deleted session from AgentCore Memory: ${sessionId}`);
        } catch (memoryError) {
          console.error(
            `⚠️ Failed to delete session from AgentCore Memory: ${sessionId}`,
            memoryError
          );
          errors.push(
            `AgentCore Memory: ${memoryError instanceof Error ? memoryError.message : 'Unknown error'}`
          );
        }
      }

      if (errors.length > 0) {
        console.warn(`⚠️ Session deletion completed with errors (${auth.requestId}):`, errors);
      } else {
        console.log(`✅ Session deletion completed successfully (${auth.requestId})`);
      }

      res.status(200).json({
        success: true,
        message: 'Session deleted',
        metadata: {
          requestId: auth.requestId,
          timestamp: new Date().toISOString(),
          actorId,
          sessionId,
          warnings: errors.length > 0 ? errors : undefined,
        },
      });
    } catch (error) {
      const auth = getCurrentAuth(req);
      console.error(`💥 Session deletion error (${auth.requestId}):`, error);

      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to delete session',
        requestId: auth.requestId,
      });
    }
  }
);

export default router;
