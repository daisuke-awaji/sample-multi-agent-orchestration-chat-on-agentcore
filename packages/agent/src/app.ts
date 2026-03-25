/**
 * Express application factory for AgentCore Runtime
 */

import express, { Request, Response, NextFunction, Express } from 'express';
import cors from 'cors';
import { corsOptions } from './middleware/cors.js';
import { requestContextMiddleware } from './middleware/request-context.js';
import { handleInvocation, handlePing, handleRoot, handleNotFound } from './handlers/index.js';
import { asyncHandler } from './middleware/async-handler.js';
import { getContextMetadata } from './context/request-context.js';
import { logger } from './config/index.js';

/**
 * Create and configure Express application
 * @returns Configured Express application
 */
export function createApp(): Express {
  const app = express();

  // Apply CORS middleware
  app.use(cors(corsOptions));

  // Configure to receive request body as JSON
  app.use(
    express.json({
      limit: '100mb',
    })
  );

  // Apply request context middleware (endpoints requiring authentication)
  app.use('/invocations', requestContextMiddleware);

  // Route handlers
  app.get('/ping', handlePing);
  app.get('/', handleRoot);
  app.post('/invocations', asyncHandler(handleInvocation));

  // 404 handler
  app.use(handleNotFound);

  // Global error handler — catches errors from asyncHandler and any middleware
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    const contextMeta = getContextMetadata();
    logger.error('💥 Unhandled error:', {
      error: err,
      requestId: contextMeta.requestId,
      path: req.path,
      method: req.method,
    });

    // If streaming already started, headers are sent and we can't send JSON error
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal server error',
        message: err.message,
        requestId: contextMeta.requestId,
      });
    }
  });

  return app;
}
