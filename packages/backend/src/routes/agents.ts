/**
 * Agent management API endpoints
 * API for managing user Agents in DynamoDB
 */

import { Router, Response } from 'express';
import {
  jwtAuthMiddleware,
  AuthenticatedRequest,
  getCurrentAuth,
  AuthInfo,
} from '../middleware/auth.js';
import {
  createAgentsService,
  CreateAgentInput,
  UpdateAgentInput,
  Agent as BackendAgent,
} from '../services/agents-service.js';
import { DEFAULT_AGENTS } from '../data/default-agents.js';

const router = Router();

/**
 * UUID format regex for validating X-Target-User-Id
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve effective userId for agent API requests.
 *
 * For regular users: uses userId from JWT token.
 * For machine users (Client Credentials Flow): uses X-Target-User-Id header.
 * This enables EventBridge Scheduler triggered agents to access agent definitions
 * on behalf of the target user.
 */
function resolveUserId(
  auth: AuthInfo,
  req: AuthenticatedRequest
): { userId: string } | { error: string } {
  if (auth.isMachineUser) {
    const targetUserId = req.headers['x-target-user-id'] as string | undefined;
    if (!targetUserId) {
      return { error: 'X-Target-User-Id header is required for machine user requests' };
    }
    if (!UUID_REGEX.test(targetUserId)) {
      return { error: 'X-Target-User-Id must be a valid UUID format' };
    }
    return { userId: targetUserId };
  }

  if (!auth.userId) {
    return { error: 'Failed to retrieve user ID' };
  }
  return { userId: auth.userId };
}

/**
 * Agent list retrieval endpoint
 * GET /agents
 * JWT authentication required
 */
router.get('/', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const result = resolveUserId(auth, req);

    if ('error' in result) {
      return res.status(400).json({
        error: 'Invalid authentication',
        message: result.error,
        requestId: auth.requestId,
      });
    }

    const { userId } = result;

    console.log('📋 Agent list retrieval started (%s):', auth.requestId, {
      userId,
      username: auth.username,
    });

    const agentsService = createAgentsService();
    const agents = await agentsService.listAgents(userId);

    console.log('✅ Agent list retrieval completed (%s): %d items', auth.requestId, agents.length);

    res.status(200).json({
      agents: agents,
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        userId,
        count: agents.length,
      },
    });
  } catch (error) {
    const auth = getCurrentAuth(req);
    console.error('💥 Agent list retrieval error (%s):', auth.requestId, error);

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to retrieve Agent list',
      requestId: auth.requestId,
    });
  }
});

/**
 * Specific Agent retrieval endpoint
 * GET /agents/:agentId
 * JWT authentication required
 */
router.get('/:agentId', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const result = resolveUserId(auth, req);
    const { agentId } = req.params;

    if ('error' in result) {
      return res.status(400).json({
        error: 'Invalid authentication',
        message: result.error,
        requestId: auth.requestId,
      });
    }

    const { userId } = result;

    if (!agentId) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Agent ID is not specified',
        requestId: auth.requestId,
      });
    }

    console.log('🔍 Agent retrieval started (%s):', auth.requestId, {
      userId,
      username: auth.username,
      agentId,
    });

    const agentsService = createAgentsService();
    const agent = await agentsService.getAgent(userId, agentId);

    if (!agent) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Agent not found',
        requestId: auth.requestId,
      });
    }

    console.log('✅ Agent retrieval completed (%s): %s', auth.requestId, agent.name);

    res.status(200).json({
      agent: agent,
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        userId,
      },
    });
  } catch (error) {
    const auth = getCurrentAuth(req);
    console.error('💥 Agent retrieval error (%s):', auth.requestId, error);

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to retrieve Agent',
      requestId: auth.requestId,
    });
  }
});

/**
 * Agent creation endpoint
 * POST /agents
 * JWT authentication required
 */
router.post('/', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const userId = auth.userId;
    const input: CreateAgentInput = req.body;

    if (!userId) {
      return res.status(400).json({
        error: 'Invalid authentication',
        message: 'Failed to retrieve user ID',
        requestId: auth.requestId,
      });
    }

    // Validation
    if (!input.name || !input.description || !input.systemPrompt || !input.enabledTools) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Required fields are missing',
        requestId: auth.requestId,
      });
    }

    console.log('➕ Agent creation started (%s):', auth.requestId, {
      userId,
      username: auth.username,
      agentName: input.name,
    });

    const agentsService = createAgentsService();
    const agent = await agentsService.createAgent(userId, input, auth.username);

    console.log('✅ Agent creation completed (%s): %s', auth.requestId, agent.agentId);

    res.status(201).json({
      agent: agent,
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        userId,
      },
    });
  } catch (error) {
    const auth = getCurrentAuth(req);
    console.error('💥 Agent creation error (%s):', auth.requestId, error);

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to create Agent',
      requestId: auth.requestId,
    });
  }
});

/**
 * Agent update endpoint
 * PUT /agents/:agentId
 * JWT authentication required
 */
router.put('/:agentId', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const userId = auth.userId;
    const { agentId } = req.params;
    const input: Partial<CreateAgentInput> = req.body;

    if (!userId) {
      return res.status(400).json({
        error: 'Invalid authentication',
        message: 'Failed to retrieve user ID',
        requestId: auth.requestId,
      });
    }

    if (!agentId) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Agent ID is not specified',
        requestId: auth.requestId,
      });
    }

    console.log('📝 Agent update started (%s):', auth.requestId, {
      userId,
      username: auth.username,
      agentId,
    });

    const agentsService = createAgentsService();
    const updateInput: UpdateAgentInput = {
      agentId,
      ...input,
    };
    const agent = await agentsService.updateAgent(userId, updateInput);

    console.log('✅ Agent update completed (%s): %s', auth.requestId, agent.name);

    res.status(200).json({
      agent: agent,
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        userId,
      },
    });
  } catch (error) {
    const auth = getCurrentAuth(req);
    console.error('💥 Agent update error (%s):', auth.requestId, error);

    if (error instanceof Error && error.message === 'Agent not found') {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Agent not found',
        requestId: auth.requestId,
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to update Agent',
      requestId: auth.requestId,
    });
  }
});

/**
 * Agent deletion endpoint
 * DELETE /agents/:agentId
 * JWT authentication required
 */
router.delete('/:agentId', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const userId = auth.userId;
    const { agentId } = req.params;

    if (!userId) {
      return res.status(400).json({
        error: 'Invalid authentication',
        message: 'Failed to retrieve user ID',
        requestId: auth.requestId,
      });
    }

    if (!agentId) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Agent ID is not specified',
        requestId: auth.requestId,
      });
    }

    console.log('🗑️  Agent deletion started (%s):', auth.requestId, {
      userId,
      username: auth.username,
      agentId,
    });

    const agentsService = createAgentsService();
    await agentsService.deleteAgent(userId, agentId);

    console.log('✅ Agent deletion completed (%s): %s', auth.requestId, agentId);

    res.status(200).json({
      success: true,
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        userId,
      },
    });
  } catch (error) {
    const auth = getCurrentAuth(req);
    console.error('💥 Agent deletion error (%s):', auth.requestId, error);

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to delete Agent',
      requestId: auth.requestId,
    });
  }
});

/**
 * Agent share status toggle endpoint
 * PUT /agents/:agentId/share
 * JWT authentication required
 */
router.put(
  '/:agentId/share',
  jwtAuthMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const auth = getCurrentAuth(req);
      const userId = auth.userId;
      const { agentId } = req.params;

      if (!userId) {
        return res.status(400).json({
          error: 'Invalid authentication',
          message: 'Failed to retrieve user ID',
          requestId: auth.requestId,
        });
      }

      if (!agentId) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'Agent ID is not specified',
          requestId: auth.requestId,
        });
      }

      console.log('🔄 Agent share status toggle started (%s):', auth.requestId, {
        userId,
        username: auth.username,
        agentId,
      });

      const agentsService = createAgentsService();
      const agent = await agentsService.toggleShare(userId, agentId);

      console.log(
        '✅ Agent share status toggle completed (%s): isShared=%s',
        auth.requestId,
        agent.isShared
      );

      res.status(200).json({
        agent: agent,
        metadata: {
          requestId: auth.requestId,
          timestamp: new Date().toISOString(),
          userId,
        },
      });
    } catch (error) {
      const auth = getCurrentAuth(req);
      console.error('💥 Agent share status toggle error (%s):', auth.requestId, error);

      if (error instanceof Error && error.message === 'Agent not found') {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Agent not found',
          requestId: auth.requestId,
        });
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to change Agent share status',
        requestId: auth.requestId,
      });
    }
  }
);

/**
 * Default Agent initialization endpoint
 * POST /agents/initialize
 * JWT authentication required
 * Create default Agents on first login
 */
router.post('/initialize', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const userId = auth.userId;

    if (!userId) {
      return res.status(400).json({
        error: 'Invalid authentication',
        message: 'Failed to retrieve user ID',
        requestId: auth.requestId,
      });
    }

    console.log('🔧 Default Agent initialization started (%s):', auth.requestId, {
      userId,
      username: auth.username,
    });

    const agentsService = createAgentsService();

    // Check if existing Agents exist
    const existingAgents = await agentsService.listAgents(userId);

    if (existingAgents.length > 0) {
      console.log('ℹ️  Skipping initialization because existing Agents exist (%s)', auth.requestId);
      return res.status(200).json({
        agents: existingAgents,
        skipped: true,
        message: 'Initialization skipped because existing Agents exist',
        metadata: {
          requestId: auth.requestId,
          timestamp: new Date().toISOString(),
          userId,
          count: existingAgents.length,
        },
      });
    }

    // Create default Agents
    const agents = await agentsService.initializeDefaultAgents(
      userId,
      DEFAULT_AGENTS,
      auth.username
    );

    console.log(
      '✅ Default Agent initialization completed (%s): %d items',
      auth.requestId,
      agents.length
    );

    res.status(201).json({
      agents: agents,
      skipped: false,
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        userId,
        count: agents.length,
      },
    });
  } catch (error) {
    const auth = getCurrentAuth(req);
    console.error('💥 Default Agent initialization error (%s):', auth.requestId, error);

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to initialize default Agents',
      requestId: auth.requestId,
    });
  }
});

/**
 * Shared Agent list retrieval endpoint (with pagination support)
 * GET /shared-agents/list
 * Query parameters:
 *   - q: Search query (optional)
 *   - limit: Number of items to retrieve (default: 20)
 *   - cursor: Pagination cursor (optional)
 * JWT authentication required
 *
 * Note: Default agents are included only on the first page (no cursor)
 */
router.get(
  '/shared-agents/list',
  jwtAuthMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const auth = getCurrentAuth(req);
      const { q: searchQuery, limit, cursor } = req.query;

      console.log('📋 Shared Agent list retrieval started (%s):', auth.requestId, {
        searchQuery,
        limit,
        hasCursor: !!cursor,
      });

      // Convert DEFAULT_AGENTS to Agent format (system user)
      const defaultAgents: BackendAgent[] = DEFAULT_AGENTS.map((agent, index) => ({
        userId: 'system',
        agentId: `default-${index}`,
        name: agent.name,
        description: agent.description,
        icon: agent.icon,
        systemPrompt: agent.systemPrompt,
        enabledTools: agent.enabledTools,
        scenarios: agent.scenarios.map((scenario) => ({
          ...scenario,
          id: `default-${index}-scenario-${agent.scenarios.indexOf(scenario)}`,
        })),
        mcpConfig: agent.mcpConfig,
        createdAt: new Date('2025-01-01').toISOString(),
        updatedAt: new Date('2025-01-01').toISOString(),
        isShared: true,
        createdBy: 'System',
      }));

      const agentsService = createAgentsService();
      const result = await agentsService.listSharedAgents(
        limit ? parseInt(limit as string, 10) : 20,
        searchQuery as string | undefined,
        cursor as string | undefined
      );

      // Filter and add default agents only on first page (no cursor)
      let allAgents: BackendAgent[] = [];
      if (!cursor) {
        // Filter default agents by search query
        let filteredDefaultAgents = defaultAgents;
        if (searchQuery) {
          const query = (searchQuery as string).toLowerCase();
          filteredDefaultAgents = defaultAgents.filter(
            (agent) =>
              agent.name.toLowerCase().includes(query) ||
              agent.description.toLowerCase().includes(query)
          );
        }
        allAgents = [...filteredDefaultAgents, ...result.items];
      } else {
        allAgents = result.items;
      }

      console.log(
        '✅ Shared Agent list retrieval completed (%s): %d items',
        auth.requestId,
        allAgents.length
      );

      res.status(200).json({
        agents: allAgents,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
        metadata: {
          requestId: auth.requestId,
          timestamp: new Date().toISOString(),
          count: allAgents.length,
        },
      });
    } catch (error) {
      const auth = getCurrentAuth(req);
      console.error('💥 Shared Agent list retrieval error (%s):', auth.requestId, error);

      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to retrieve shared Agent list',
        requestId: auth.requestId,
      });
    }
  }
);

/**
 * Shared Agent detail retrieval endpoint
 * GET /shared-agents/:userId/:agentId
 * JWT authentication required
 * Supports system agents (userId === 'system')
 */
router.get(
  '/shared-agents/:userId/:agentId',
  jwtAuthMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const auth = getCurrentAuth(req);
      const { userId, agentId } = req.params;

      if (!userId || !agentId) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'User ID or Agent ID is not specified',
          requestId: auth.requestId,
        });
      }

      console.log('🔍 Shared Agent detail retrieval started (%s):', auth.requestId, {
        userId,
        agentId,
      });

      let agent: BackendAgent | null = null;

      // Handle system agents (default agents)
      if (userId === 'system' && agentId.startsWith('default-')) {
        const index = parseInt(agentId.replace('default-', '').split('-')[0], 10);
        const defaultAgent = DEFAULT_AGENTS[index];

        if (defaultAgent) {
          agent = {
            userId: 'system',
            agentId: `default-${index}`,
            name: defaultAgent.name,
            description: defaultAgent.description,
            icon: defaultAgent.icon,
            systemPrompt: defaultAgent.systemPrompt,
            enabledTools: defaultAgent.enabledTools,
            scenarios: defaultAgent.scenarios.map((scenario) => ({
              ...scenario,
              id: `default-${index}-scenario-${defaultAgent.scenarios.indexOf(scenario)}`,
            })),
            mcpConfig: defaultAgent.mcpConfig,
            createdAt: new Date('2025-01-01').toISOString(),
            updatedAt: new Date('2025-01-01').toISOString(),
            isShared: true,
            createdBy: 'System',
          };
        }
      } else {
        // Handle user-shared agents
        const agentsService = createAgentsService();
        agent = await agentsService.getSharedAgent(userId, agentId);
      }

      if (!agent) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Shared Agent not found',
          requestId: auth.requestId,
        });
      }

      console.log(
        '✅ Shared Agent detail retrieval completed (%s): %s',
        auth.requestId,
        agent.name
      );

      res.status(200).json({
        agent: agent,
        metadata: {
          requestId: auth.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      const auth = getCurrentAuth(req);
      console.error('💥 Shared Agent detail retrieval error (%s):', auth.requestId, error);

      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to retrieve shared Agent details',
        requestId: auth.requestId,
      });
    }
  }
);

/**
 * Shared Agent clone endpoint
 * POST /shared-agents/:userId/:agentId/clone
 * JWT authentication required
 * Supports cloning both user-shared agents and system agents
 */
router.post(
  '/shared-agents/:userId/:agentId/clone',
  jwtAuthMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const auth = getCurrentAuth(req);
      const targetUserId = auth.userId;
      const { userId: sourceUserId, agentId: sourceAgentId } = req.params;

      if (!targetUserId) {
        return res.status(400).json({
          error: 'Invalid authentication',
          message: 'Failed to retrieve user ID',
          requestId: auth.requestId,
        });
      }

      if (!sourceUserId || !sourceAgentId) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'Source User ID or Agent ID is not specified',
          requestId: auth.requestId,
        });
      }

      console.log('📥 Shared Agent clone started (%s):', auth.requestId, {
        targetUserId,
        targetUsername: auth.username,
        sourceUserId,
        sourceAgentId,
      });

      const agentsService = createAgentsService();
      let sourceAgent: CreateAgentInput | null = null;

      // Handle system agents (default agents)
      if (sourceUserId === 'system' && sourceAgentId.startsWith('default-')) {
        const index = parseInt(sourceAgentId.replace('default-', '').split('-')[0], 10);
        const defaultAgent = DEFAULT_AGENTS[index];

        if (defaultAgent) {
          sourceAgent = defaultAgent;
        }
      } else {
        // Handle user-shared agents
        const sharedAgent = await agentsService.getSharedAgent(sourceUserId, sourceAgentId);
        if (sharedAgent) {
          sourceAgent = {
            name: sharedAgent.name,
            description: sharedAgent.description,
            icon: sharedAgent.icon,
            systemPrompt: sharedAgent.systemPrompt,
            enabledTools: sharedAgent.enabledTools,
            scenarios: sharedAgent.scenarios,
            mcpConfig: sharedAgent.mcpConfig,
          };
        }
      }

      if (!sourceAgent) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Shared Agent not found',
          requestId: auth.requestId,
        });
      }
      const clonedAgent = await agentsService.createAgent(targetUserId, sourceAgent, auth.username);

      console.log('✅ Shared Agent clone completed (%s): %s', auth.requestId, clonedAgent.agentId);

      res.status(201).json({
        agent: clonedAgent,
        metadata: {
          requestId: auth.requestId,
          timestamp: new Date().toISOString(),
          userId: targetUserId,
        },
      });
    } catch (error) {
      const auth = getCurrentAuth(req);
      console.error('💥 Shared Agent clone error (%s):', auth.requestId, error);

      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to clone shared Agent',
        requestId: auth.requestId,
      });
    }
  }
);

export default router;
