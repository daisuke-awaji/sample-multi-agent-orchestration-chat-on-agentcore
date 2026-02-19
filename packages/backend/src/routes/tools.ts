/**
 * Tools API Routes
 * API providing tool list and search functionality for AgentCore Gateway
 */

import express, { Response } from 'express';
import { jwtAuthMiddleware, AuthenticatedRequest, getCurrentAuth } from '../middleware/auth.js';
import { gatewayService } from '../services/agentcore-gateway.js';
import { fetchToolsFromMCPConfig, MCPConfig } from '../mcp/index.js';
import { allMCPToolDefinitions } from '@moca/tool-definitions';

const router = express.Router();

/**
 * Tool list retrieval endpoint (authentication required)
 * GET /tools
 */
router.get('/', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const idToken = req.headers.authorization?.replace('Bearer ', '');

    if (!idToken) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication token is required',
        timestamp: new Date().toISOString(),
      });
    }

    console.log('🔧 Tool list retrieval started (%s):', auth.requestId, {
      userId: auth.userId,
      username: auth.username,
    });

    // Get cursor query parameter
    const cursor = req.query.cursor as string | undefined;

    // Fetch tool list from Gateway (authentication required, pagination supported)
    const result = await gatewayService.listTools(idToken, cursor);

    // Include builtin tools only in the first page (when cursor is not present)
    const tools = cursor ? result.tools : [...allMCPToolDefinitions, ...result.tools];

    const response = {
      tools,
      nextCursor: result.nextCursor,
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        actorId: auth.userId,
        count: tools.length,
      },
    };

    console.log(
      '✅ Tool list retrieval completed (%s): %d items (builtin: %d, gateway: %d)',
      auth.requestId,
      tools.length,
      cursor ? 0 : allMCPToolDefinitions.length,
      result.tools.length,
      result.nextCursor ? { nextCursor: 'present' } : { nextCursor: 'none' }
    );

    res.status(200).json(response);
  } catch (error) {
    console.error(`💥 Tool list retrieval error:`, error);

    const errorResponse = {
      error: 'Tools List Error',
      message: error instanceof Error ? error.message : 'Failed to retrieve tool list',
      timestamp: new Date().toISOString(),
    };

    // Return 502 for Gateway connection errors
    if (error instanceof Error && error.message.includes('Gateway')) {
      return res.status(502).json(errorResponse);
    }

    res.status(500).json(errorResponse);
  }
});

/**
 * Tool search endpoint
 * POST /tools/search
 */
router.post('/search', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const idToken = req.headers.authorization?.replace('Bearer ', '');
    const { query } = req.body;

    if (!idToken) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication token is required',
        timestamp: new Date().toISOString(),
      });
    }

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Search query is required',
        timestamp: new Date().toISOString(),
      });
    }

    console.log('🔍 Tool search started (%s):', auth.requestId, {
      userId: auth.userId,
      username: auth.username,
      query: query.trim(),
    });

    const trimmedQuery = query.trim().toLowerCase();

    // Search in builtin tools (local search)
    const builtinResults = allMCPToolDefinitions.filter(
      (tool) =>
        tool.name.toLowerCase().includes(trimmedQuery) ||
        (tool.description && tool.description.toLowerCase().includes(trimmedQuery))
    );

    // Execute semantic search on Gateway for MCP tools
    const gatewayResults = await gatewayService.searchTools(query.trim(), idToken);

    // Combine builtin and gateway results
    const tools = [...builtinResults, ...gatewayResults];

    const response = {
      tools,
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        actorId: auth.userId,
        query: query.trim(),
        count: tools.length,
      },
    };

    console.log(
      `✅ Tool search completed (${auth.requestId}): ${tools.length} items (builtin: ${builtinResults.length}, gateway: ${gatewayResults.length}, query: "${query.trim()}")`
    );

    res.status(200).json(response);
  } catch (error) {
    console.error(`💥 Tool search error:`, error);

    const errorResponse = {
      error: 'Tools Search Error',
      message: error instanceof Error ? error.message : 'Tool search failed',
      timestamp: new Date().toISOString(),
    };

    // Return 502 for Gateway connection errors
    if (error instanceof Error && error.message.includes('Gateway')) {
      return res.status(502).json(errorResponse);
    }

    // Return 400 for search query errors
    if (error instanceof Error && error.message.includes('query')) {
      return res.status(400).json(errorResponse);
    }

    res.status(500).json(errorResponse);
  }
});

/**
 * Gateway connection check endpoint
 * GET /tools/health
 */
router.get('/health', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const idToken = req.headers.authorization?.replace('Bearer ', '');

    if (!idToken) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication token is required',
        timestamp: new Date().toISOString(),
      });
    }

    console.log('💓 Gateway connection check started (%s):', auth.requestId, {
      userId: auth.userId,
      username: auth.username,
    });

    // Check Gateway connection
    const isConnected = await gatewayService.checkConnection(idToken);

    if (isConnected) {
      const response = {
        status: 'healthy',
        gateway: {
          connected: true,
          endpoint: '[CONFIGURED]', // For security, actual endpoint is not displayed
        },
        metadata: {
          requestId: auth.requestId,
          timestamp: new Date().toISOString(),
          actorId: auth.userId,
        },
      };

      console.log('✅ Gateway connection check successful (%s)', auth.requestId);
      res.status(200).json(response);
    } else {
      const response = {
        status: 'unhealthy',
        gateway: {
          connected: false,
          endpoint: '[CONFIGURED]',
        },
        metadata: {
          requestId: auth.requestId,
          timestamp: new Date().toISOString(),
          actorId: auth.userId,
        },
      };

      console.log('❌ Gateway connection check failed (%s)', auth.requestId);
      res.status(502).json(response);
    }
  } catch (error) {
    console.error(`💥 Gateway connection check error:`, error);

    res.status(500).json({
      error: 'Health Check Error',
      message: error instanceof Error ? error.message : 'Gateway connection check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Local MCP tool retrieval endpoint
 * POST /tools/local
 * Retrieve tool list from user-defined MCP server configuration
 */
router.post('/local', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const { mcpConfig } = req.body as { mcpConfig: MCPConfig };

    if (!mcpConfig || !mcpConfig.mcpServers) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'mcpConfig is required',
        timestamp: new Date().toISOString(),
      });
    }

    console.log('🔧 Local MCP tool retrieval started (%s):', auth.requestId, {
      userId: auth.userId,
      serverCount: Object.keys(mcpConfig.mcpServers).length,
    });

    // Fetch tool list from MCP servers
    const result = await fetchToolsFromMCPConfig(mcpConfig, console);

    const response = {
      tools: result.tools,
      errors: result.errors,
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        actorId: auth.userId,
        count: result.tools.length,
        errorCount: result.errors.length,
      },
    };

    console.log(
      `✅ Local MCP tool retrieval completed (${auth.requestId}): ${result.tools.length} tools, ${result.errors.length} errors`
    );
    res.status(200).json(response);
  } catch (error) {
    console.error(`💥 Local MCP tool retrieval error:`, error);
    res.status(500).json({
      error: 'MCP Tools Error',
      message: error instanceof Error ? error.message : 'Tool retrieval failed',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
