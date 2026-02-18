/**
 * Backend API Server
 * Express API server with JWT authentication support
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { jwtAuthMiddleware, AuthenticatedRequest, getCurrentAuth } from './middleware/auth.js';
import { routeErrorHandler } from './middleware/error-handler.js';
import { hydrateJWKS } from './utils/jwks.js';
import agentsRouter from './routes/agents.js';
import sessionsRouter from './routes/sessions.js';
import toolsRouter from './routes/tools.js';
import memoryRouter from './routes/memory.js';
import storageRouter from './routes/storage.js';
import triggersRouter from './routes/triggers.js';
import eventsRouter from './routes/events.js';

const app = express();

/**
 * CORS configuration
 */
const corsOptions = {
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allowed?: boolean) => void
  ) => {
    const allowedOrigins = config.cors.allowedOrigins;

    // Allow if no origin (Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // Check wildcard (*) or explicitly allowed origins
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`🚫 CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400, // Preflight cache 24 hours
};

// Middleware configuration
app.use(cors(corsOptions));
app.use(
  express.json({
    limit: '100mb',
  })
);

// API route configuration
app.use('/agents', agentsRouter);
app.use('/sessions', sessionsRouter);
app.use('/tools', toolsRouter);
app.use('/memory', jwtAuthMiddleware, memoryRouter);
app.use('/storage', storageRouter);
app.use('/triggers', triggersRouter);
app.use('/events', eventsRouter);

/**
 * Health check endpoint (no authentication required)
 * Standard health check used by Lambda/API Gateway
 */
app.get('/ping', (req: Request, res: Response) => {
  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'agentcore-backend',
    version: '0.1.0',
    environment: config.nodeEnv,
    cognito: {
      configured: !!config.cognito.userPoolId,
      userPoolId: config.cognito.userPoolId ? '[CONFIGURED]' : null,
    },
  };

  console.log(`💓 Health check - ${req.ip} - ${req.get('User-Agent')?.substring(0, 50)}`);

  res.status(200).json(healthStatus);
});

/**
 * JWT content verification endpoint (authentication required)
 * Return current JWT content
 */
app.get('/me', jwtAuthMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);

    const response = {
      authenticated: auth.authenticated,
      user: {
        id: auth.userId,
        username: auth.username,
        email: auth.email,
        groups: auth.groups,
      },
      jwt: {
        tokenUse: auth.tokenUse,
        issuer: req.jwt?.iss,
        audience: req.jwt?.aud,
        issuedAt: req.jwt?.iat ? new Date(req.jwt.iat * 1000).toISOString() : null,
        expiresAt: req.jwt?.exp ? new Date(req.jwt.exp * 1000).toISOString() : null,
        clientId: req.jwt?.client_id,
        authTime: req.jwt?.auth_time ? new Date(req.jwt.auth_time * 1000).toISOString() : null,
      },
      request: {
        id: auth.requestId,
        timestamp: new Date().toISOString(),
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      },
    };

    console.log('👤 /me request successful (%s):', auth.requestId, {
      userId: auth.userId,
      username: auth.username,
    });

    res.status(200).json(response);
  } catch (error) {
    console.error(`💥 /me endpoint error:`, error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to process /me request',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Root endpoint (no authentication required)
 * Display API information
 */
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    service: 'AgentCore Backend API',
    version: '0.1.0',
    environment: config.nodeEnv,
    endpoints: {
      health: 'GET /ping',
      userInfo: 'GET /me (requires Authorization header)',
    },
    documentation: {
      authentication: 'JWT Bearer token in Authorization header',
      format: 'Authorization: Bearer <jwt_token>',
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * 404 handler
 */
app.use('*', (req: Request, res: Response) => {
  console.warn(`❓ 404 Not Found: ${req.method} ${req.path} - ${req.ip}`);

  res.status(404).json({
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.path} not found`,
    availableEndpoints: ['GET /', 'GET /ping', 'GET /me (requires authentication)'],
    timestamp: new Date().toISOString(),
  });
});

/**
 * Error handler
 */
app.use(routeErrorHandler);

/**
 * Start server
 */
async function startServer(): Promise<void> {
  try {
    // Pre-load JWKS cache for faster first verification
    await hydrateJWKS();

    app.listen(config.port, () => {
      console.log(`🚀 AgentCore Backend API server listening on port ${config.port}`);
      console.log(`📋 Health check: http://localhost:${config.port}/ping`);
      console.log(`👤 User info: GET http://localhost:${config.port}/me`);
      console.log(`🌍 Environment: ${config.nodeEnv}`);
      console.log(`🔐 Cognito configured: ${config.cognito.userPoolId ? '✅' : '❌'}`);
      console.log(`🔗 CORS origins: ${config.cors.allowedOrigins.join(', ')}`);
    });
  } catch (error) {
    console.error('💥 Server start failed:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully');
  process.exit(0);
});

// Error handling on process termination
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server
startServer();
