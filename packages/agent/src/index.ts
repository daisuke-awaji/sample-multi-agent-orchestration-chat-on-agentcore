/**
 * AgentCore Runtime HTTP Server
 * HTTP server running on AgentCore Runtime
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createAgent } from './agent.js';
import { getContextMetadata, getCurrentContext } from './context/request-context.js';
import { requestContextMiddleware } from './middleware/request-context.js';
import { createSessionStorage, SessionPersistenceHook } from './session/index.js';
import { WorkspaceSyncHook } from './session/workspace-sync-hook.js';
import type { SessionConfig } from './session/types.js';
import { WorkspaceSync } from './services/workspace-sync.js';
import { logger } from './config/index.js';
import { Message, TextBlock } from '@strands-agents/sdk';

/**
 * Sanitize error message to remove sensitive information
 * @param error Error object or unknown value
 * @returns Sanitized error message safe for storage and display
 */
function sanitizeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  // Remove sensitive information patterns
  return (
    message
      // Remove Bearer tokens
      .replace(/Bearer [A-Za-z0-9\-_.]+/gi, '[TOKEN]')
      // Remove AWS credentials and long alphanumeric strings (potential keys/secrets)
      .replace(/AKIA[A-Z0-9]{16}/g, '[AWS_KEY]')
      .replace(/[a-zA-Z0-9/+]{40,}/g, '[REDACTED]')
      // Remove file paths that might contain usernames
      .replace(/\/home\/[^/\s]+/g, '/home/[USER]')
      .replace(/\/Users\/[^/\s]+/g, '/Users/[USER]')
      // Remove potential email addresses
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
      // Limit message length to prevent extremely long error messages
      .substring(0, 500)
  );
}

/**
 * Create error message for session storage
 * @param error Error object
 * @param requestId Request ID for tracking
 * @returns Message object formatted for storage
 */
function createErrorMessage(error: unknown, requestId: string): Message {
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  const sanitizedMessage = sanitizeErrorMessage(error);

  const errorText = `[SYSTEM_ERROR]\nAn error occurred.\nType: ${errorName}\nDetails: ${sanitizedMessage}\nRequest ID: ${requestId}\n[/SYSTEM_ERROR]`;

  return new Message({
    role: 'assistant',
    content: [new TextBlock(errorText)],
  });
}

/**
 * Safely serialize Strands Agents streaming events
 * Extract only necessary properties from objects containing circular references
 */
function serializeStreamEvent(event: unknown): object {
  const eventObj = event as { type?: string; [key: string]: unknown };
  const baseEvent = { type: eventObj.type };

  switch (eventObj.type) {
    // Text generation events
    case 'modelContentBlockDeltaEvent':
      return {
        ...baseEvent,
        delta: eventObj.delta,
      };

    case 'modelContentBlockStartEvent':
      return {
        ...baseEvent,
        start: eventObj.start,
      };

    case 'modelContentBlockStopEvent':
      return {
        ...baseEvent,
        stop: eventObj.stop,
      };

    // Message lifecycle events
    case 'modelMessageStartEvent':
      return {
        ...baseEvent,
        message: eventObj.message
          ? {
              role: (eventObj.message as { role: unknown }).role,
              content: (eventObj.message as { content: unknown }).content,
            }
          : undefined,
      };

    case 'modelMessageStopEvent':
      return {
        ...baseEvent,
        message: eventObj.message
          ? {
              role: (eventObj.message as { role: unknown }).role,
              content: (eventObj.message as { content: unknown }).content,
            }
          : undefined,
      };

    case 'messageAddedEvent':
      return {
        ...baseEvent,
        message: eventObj.message
          ? {
              role: (eventObj.message as { role: unknown }).role,
              content: (eventObj.message as { content: unknown }).content,
            }
          : undefined,
      };

    // Metadata and result events
    case 'modelMetadataEvent':
      return {
        ...baseEvent,
        metadata: eventObj.metadata,
      };

    case 'agentResult':
      return {
        ...baseEvent,
        result: eventObj.result,
      };

    // Text block events
    case 'textBlock':
      return {
        ...baseEvent,
        text: eventObj.text,
      };

    // Stream hook events (lightweight due to frequent occurrence)
    case 'modelStreamEventHook':
      return {
        ...baseEvent,
        // Hook information generally unnecessary, only type
      };

    // Existing lifecycle events
    case 'beforeInvocationEvent':
    case 'afterInvocationEvent':
    case 'afterToolsEvent':
    case 'beforeModelCallEvent':
      return baseEvent;

    case 'beforeToolsEvent':
      return {
        ...baseEvent,
        message: eventObj.message
          ? {
              role: (eventObj.message as { role: unknown }).role,
              content: (eventObj.message as { content: unknown }).content,
            }
          : undefined,
      };

    case 'afterModelCallEvent':
      return {
        ...baseEvent,
        stopReason: eventObj.stopReason,
        stopData: eventObj.stopData
          ? {
              message: (eventObj.stopData as { message: unknown }).message,
            }
          : undefined,
      };

    default:
      // Show warning only for truly unknown event types
      logger.warn('New unknown streaming event:', { type: eventObj.type });
      return baseEvent;
  }
}

const PORT = process.env.PORT || 8080;
const app = express();

// CORS configuration
const corsOptions = {
  // Allowed origins (set from environment variable, default allows all)
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allowed?: boolean) => void
  ) => {
    const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['*'];

    // Allow localhost for local development
    const developmentOrigins = [
      'http://localhost:5173', // Vite dev server
      'http://127.0.0.1:5173',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ];

    // Allow if no origin (requests from tools like Postman)
    if (!origin) {
      return callback(null, true);
    }

    // Allow if configured origin or development origin
    if (
      allowedOrigins.includes('*') ||
      allowedOrigins.includes(origin) ||
      developmentOrigins.includes(origin)
    ) {
      callback(null, true);
    } else {
      logger.warn('🚫 CORS blocked origin:', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id'],
  credentials: true,
  maxAge: 86400, // Preflight cache 24 hours
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Initialize session storage (switch based on environment variables)
const sessionStorage = createSessionStorage();

// Configure to receive request body as JSON
app.use(express.json());

// Apply request context middleware (endpoints requiring authentication)
app.use('/invocations', requestContextMiddleware);

/**
 * Health check endpoint
 * Endpoint to verify that AgentCore Runtime is operating normally
 */
app.get('/ping', (req: Request, res: Response) => {
  res.json({
    status: 'Healthy',
    time_of_last_update: Math.floor(Date.now() / 1000),
  });
});

/**
 * Agent invocation request type definition
 */
interface InvocationRequest {
  prompt: string; // Required: User input
  modelId?: string; // Optional: Model ID to use (default: environment variable)
  enabledTools?: string[]; // Optional: Array of tool names to enable (undefined=all, []=none)
  systemPrompt?: string; // Optional: Custom system prompt
  storagePath?: string; // Optional: S3 directory path selected by user
  memoryEnabled?: boolean; // Optional: Whether to enable long-term memory (default: false)
  memoryTopK?: number; // Optional: Number of long-term memories to retrieve (default: 10)
  mcpConfig?: Record<string, unknown>; // Optional: User-defined MCP server configuration
}

/**
 * Agent invocation endpoint (with streaming support)
 * Create Agent for each session and persist history
 */
app.post('/invocations', async (req: Request, res: Response) => {
  try {
    // Get each parameter from request body
    const {
      prompt,
      modelId,
      enabledTools,
      systemPrompt,
      storagePath,
      memoryEnabled,
      memoryTopK,
      mcpConfig,
    } = req.body as InvocationRequest;

    if (!prompt?.trim()) {
      return res.status(400).json({
        error: 'Empty prompt provided',
      });
    }

    // Set storagePath in context
    const context = getCurrentContext();
    if (context) {
      context.storagePath = storagePath || '/';
    }

    // Get session ID from header (optional)
    const sessionId = req.headers['x-amzn-bedrock-agentcore-runtime-session-id'] as
      | string
      | undefined;

    // Get userId from RequestContext
    const contextMeta = getContextMetadata();
    const actorId = contextMeta.userId || 'anonymous';

    logger.info('📝 Request received:', {
      requestId: contextMeta.requestId,
      prompt,
      actorId,
      sessionId: sessionId || 'none (sessionless mode)',
    });

    // Initialize workspace sync (if storagePath is specified)
    let workspaceSync: WorkspaceSync | null = null;
    let workspaceSyncHook: WorkspaceSyncHook | null = null;

    if (storagePath && actorId !== 'anonymous') {
      workspaceSync = new WorkspaceSync(actorId, storagePath);

      // Start initial sync asynchronously (don't await)
      workspaceSync.startInitialSync();

      // Set WorkspaceSync in context (accessible from tools)
      if (context) {
        context.workspaceSync = workspaceSync;
      }

      // Create WorkspaceSyncHook
      workspaceSyncHook = new WorkspaceSyncHook(workspaceSync);

      logger.info('🔄 Initialized workspace sync:', { actorId, storagePath });
    }

    // Session configuration and hook (only if sessionId exists)
    let sessionConfig: SessionConfig | undefined;
    let sessionHook: SessionPersistenceHook | undefined;

    if (sessionId) {
      sessionConfig = { actorId, sessionId };
      sessionHook = new SessionPersistenceHook(sessionStorage, sessionConfig);
    }

    // Agent creation options
    const agentOptions = {
      modelId,
      enabledTools,
      systemPrompt,
      ...(sessionId && { sessionStorage, sessionConfig }),
      // Long-term memory parameters (use JWT userId as actorId)
      memoryEnabled,
      memoryContext: memoryEnabled ? prompt : undefined,
      actorId: memoryEnabled ? actorId : undefined,
      memoryTopK,
      // User-defined MCP server configuration
      mcpConfig,
    };

    // Create Agent (register all hooks)
    const hooks = [sessionHook, workspaceSyncHook].filter(
      (hook): hook is SessionPersistenceHook | WorkspaceSyncHook =>
        hook !== null && hook !== undefined
    );
    const { agent, metadata } = await createAgent(hooks, agentOptions);

    // Log Agent creation completion
    logger.info('📊 Agent creation completed:', {
      requestId: contextMeta.requestId,
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
      logger.info('🔄 Agent streaming started:', { requestId: contextMeta.requestId });

      // Send streaming events as NDJSON
      for await (const event of agent.stream(prompt)) {
        // For messageAddedEvent, save in real-time (only if sessionId exists)
        if (event.type === 'messageAddedEvent' && event.message && sessionConfig) {
          try {
            await sessionStorage.appendMessage(sessionConfig, event.message);
            logger.info('💾 Message saved in real-time:', {
              role: event.message.role,
              contentBlocks: event.message.content.length,
            });
          } catch (saveError) {
            logger.error('⚠️ Message save failed (streaming continues):', saveError);
            // Continue streaming even if save error occurs
          }
        }

        // Serialize event avoiding circular references
        const safeEvent = serializeStreamEvent(event);
        res.write(`${JSON.stringify(safeEvent)}\n`);
      }

      logger.info('✅ Agent streaming completed:', { requestId: contextMeta.requestId });

      // Send completion metadata
      const completionEvent = {
        type: 'serverCompletionEvent',
        metadata: {
          requestId: contextMeta.requestId,
          duration: contextMeta.duration,
          sessionId: sessionId,
          actorId: actorId,
          conversationLength: agent.messages.length,
          // Include metadata from Agent creation
          agentMetadata: metadata,
        },
      };
      res.write(`${JSON.stringify(completionEvent)}\n`);

      res.end();
    } catch (streamError) {
      logger.error('❌ Agent streaming error:', {
        requestId: contextMeta.requestId,
        error: streamError,
      });

      // Save error message to session history (if session is configured)
      if (sessionConfig) {
        try {
          const errorMessage = createErrorMessage(streamError, contextMeta.requestId);
          await sessionStorage.appendMessage(sessionConfig, errorMessage);
          logger.info('💾 Error message saved to session history:', {
            requestId: contextMeta.requestId,
            sessionId: sessionConfig.sessionId,
          });
        } catch (saveError) {
          logger.error('⚠️ Failed to save error message to session:', saveError);
          // Continue even if save fails - still send error event to client
        }
      }

      // Send error event
      const errorEvent = {
        type: 'serverErrorEvent',
        error: {
          message: sanitizeErrorMessage(streamError),
          requestId: contextMeta.requestId,
          // Include flag to indicate this error was saved to history
          savedToHistory: !!sessionConfig,
        },
      };
      res.write(`${JSON.stringify(errorEvent)}\n`);
      res.end();
    }
  } catch (error) {
    const contextMeta = getContextMetadata();
    logger.error('❌ Error processing request:', {
      requestId: contextMeta.requestId,
      error,
    });

    // JSON response for initial error
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        requestId: contextMeta.requestId,
      });
    }
  }
});

/**
 * Root endpoint (for information display)
 */
app.get('/', (req: Request, res: Response) => {
  res.json({
    service: 'AgentCore Runtime Agent',
    version: '0.1.0',
    endpoints: {
      health: 'GET /ping',
      invoke: 'POST /invocations',
    },
    status: 'running',
  });
});

/**
 * 404 handler
 */
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.path} not found`,
    availableEndpoints: ['GET /', 'GET /ping', 'POST /invocations'],
  });
});

/**
 * Error handler
 */
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error('💥 Unhandled error:', { error: err, path: req.path, method: req.method });
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
  });
});

/**
 * Start application
 */
async function startServer(): Promise<void> {
  try {
    // Start HTTP server (Agent initialization executed on first request)
    app.listen(PORT, () => {
      logger.info('🚀 AgentCore Runtime server started:', {
        port: PORT,
        healthCheck: `http://localhost:${PORT}/ping`,
        agentEndpoint: `POST http://localhost:${PORT}/invocations`,
        note: 'Agent is initialized on first request',
      });
    });
  } catch (error) {
    logger.error('💥 Server start failed:', { error });
    process.exit(1);
  }
}

// Start server
startServer();

// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.info('🛑 Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('🛑 Received SIGINT, shutting down gracefully');
  process.exit(0);
});
