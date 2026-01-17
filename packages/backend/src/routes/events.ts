/**
 * Events API endpoints
 * API for retrieving available event sources
 */

import { Router, Response } from 'express';
import { jwtAuthMiddleware, AuthenticatedRequest, getCurrentAuth } from '../middleware/auth.js';

const router = Router();

interface EventSource {
  id: string;
  name: string;
  description: string;
  icon?: string;
}

/**
 * Get available event sources
 * GET /events
 */
router.get('/', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);

    console.log(`📋 Event sources retrieval started (${auth.requestId})`);

    const eventSourcesConfig = process.env.EVENT_SOURCES_CONFIG;

    if (!eventSourcesConfig) {
      console.log(`⚠️ No EVENT_SOURCES_CONFIG found (${auth.requestId})`);
      return res.status(200).json({
        eventSources: [],
        metadata: {
          requestId: auth.requestId,
          timestamp: new Date().toISOString(),
          message: 'No event sources configured',
        },
      });
    }

    const eventSources: EventSource[] = JSON.parse(eventSourcesConfig);

    console.log(
      `✅ Event sources retrieval completed (${auth.requestId}): ${eventSources.length} sources`
    );

    res.status(200).json({
      eventSources,
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        count: eventSources.length,
      },
    });
  } catch (error) {
    const auth = getCurrentAuth(req);
    console.error(`💥 Event sources retrieval error (${auth.requestId}):`, error);

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to retrieve event sources',
      requestId: auth.requestId,
    });
  }
});

export default router;
