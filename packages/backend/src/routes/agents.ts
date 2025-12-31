/**
 * Agent管理API エンドポイント
 * ユーザーのAgentをDynamoDBで管理するAPI
 */

import { Router, Response } from 'express';
import { jwtAuthMiddleware, AuthenticatedRequest, getCurrentAuth } from '../middleware/auth.js';
import {
  createAgentsService,
  CreateAgentInput,
  UpdateAgentInput,
  Agent as BackendAgent,
} from '../services/agents-service.js';

const router = Router();

/**
 * Backend AgentをFrontend Agentに変換
 * agentId -> id にマッピング
 * includeUserId が true の場合は userId も含める（共有エージェント用）
 */
function toFrontendAgent(agent: BackendAgent, includeUserId: boolean = false) {
  const { userId, agentId, ...rest } = agent;
  return {
    id: agentId,
    ...(includeUserId && { userId }), // 共有エージェントの場合は userId も含める
    ...rest,
  };
}

/**
 * デフォルトAgent定義
 * 翻訳キー形式で定義し、フロントエンドで翻訳を適用
 */
const DEFAULT_AGENTS: CreateAgentInput[] = [
  {
    name: 'defaultAgents.generalAssistant.name',
    description: 'defaultAgents.generalAssistant.description',
    icon: 'Bot',
    systemPrompt: `You are a helpful and knowledgeable AI assistant. Please provide accurate and easy-to-understand answers to user questions.

Please keep the following in mind:
- Respond naturally in the user's language
- Explain technical content in a way that beginners can understand
- Honestly say "I don't know" when unsure
- Ask clarifying questions when needed`,
    enabledTools: ['file_editor', 's3_list_files', 's3_get_presigned_urls', 'tavily_search'],
    scenarios: [
      {
        title: 'defaultAgents.generalAssistant.scenarios.question.title',
        prompt: 'defaultAgents.generalAssistant.scenarios.question.prompt',
      },
      {
        title: 'defaultAgents.generalAssistant.scenarios.correction.title',
        prompt: 'defaultAgents.generalAssistant.scenarios.correction.prompt',
      },
      {
        title: 'defaultAgents.generalAssistant.scenarios.webSearch.title',
        prompt: 'defaultAgents.generalAssistant.scenarios.webSearch.prompt',
      },
      {
        title: 'defaultAgents.generalAssistant.scenarios.summary.title',
        prompt: 'defaultAgents.generalAssistant.scenarios.summary.prompt',
      },
      {
        title: 'defaultAgents.generalAssistant.scenarios.ideation.title',
        prompt: 'defaultAgents.generalAssistant.scenarios.ideation.prompt',
      },
      {
        title: 'defaultAgents.generalAssistant.scenarios.comparison.title',
        prompt: 'defaultAgents.generalAssistant.scenarios.comparison.prompt',
      },
    ],
  },
];

/**
 * Agent一覧取得エンドポイント
 * GET /agents
 * JWT認証必須
 */
router.get('/', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const userId = auth.userId;

    if (!userId) {
      return res.status(400).json({
        error: 'Invalid authentication',
        message: 'ユーザーIDが取得できませんでした',
        requestId: auth.requestId,
      });
    }

    console.log(`📋 Agent一覧取得開始 (${auth.requestId}):`, {
      userId,
      username: auth.username,
    });

    const agentsService = createAgentsService();
    const agents = await agentsService.listAgents(userId);

    console.log(`✅ Agent一覧取得完了 (${auth.requestId}): ${agents.length}件`);

    res.status(200).json({
      agents: agents.map((agent) => toFrontendAgent(agent)),
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        userId,
        count: agents.length,
      },
    });
  } catch (error) {
    const auth = getCurrentAuth(req);
    console.error(`💥 Agent一覧取得エラー (${auth.requestId}):`, error);

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Agent一覧の取得に失敗しました',
      requestId: auth.requestId,
    });
  }
});

/**
 * 特定のAgent取得エンドポイント
 * GET /agents/:agentId
 * JWT認証必須
 */
router.get('/:agentId', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const userId = auth.userId;
    const { agentId } = req.params;

    if (!userId) {
      return res.status(400).json({
        error: 'Invalid authentication',
        message: 'ユーザーIDが取得できませんでした',
        requestId: auth.requestId,
      });
    }

    if (!agentId) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'AgentIDが指定されていません',
        requestId: auth.requestId,
      });
    }

    console.log(`🔍 Agent取得開始 (${auth.requestId}):`, {
      userId,
      username: auth.username,
      agentId,
    });

    const agentsService = createAgentsService();
    const agent = await agentsService.getAgent(userId, agentId);

    if (!agent) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Agentが見つかりませんでした',
        requestId: auth.requestId,
      });
    }

    console.log(`✅ Agent取得完了 (${auth.requestId}): ${agent.name}`);

    res.status(200).json({
      agent: toFrontendAgent(agent),
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        userId,
      },
    });
  } catch (error) {
    const auth = getCurrentAuth(req);
    console.error(`💥 Agent取得エラー (${auth.requestId}):`, error);

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Agentの取得に失敗しました',
      requestId: auth.requestId,
    });
  }
});

/**
 * Agent作成エンドポイント
 * POST /agents
 * JWT認証必須
 */
router.post('/', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const userId = auth.userId;
    const input: CreateAgentInput = req.body;

    if (!userId) {
      return res.status(400).json({
        error: 'Invalid authentication',
        message: 'ユーザーIDが取得できませんでした',
        requestId: auth.requestId,
      });
    }

    // バリデーション
    if (!input.name || !input.description || !input.systemPrompt || !input.enabledTools) {
      return res.status(400).json({
        error: 'Invalid request',
        message: '必須項目が不足しています',
        requestId: auth.requestId,
      });
    }

    console.log(`➕ Agent作成開始 (${auth.requestId}):`, {
      userId,
      username: auth.username,
      agentName: input.name,
    });

    const agentsService = createAgentsService();
    const agent = await agentsService.createAgent(userId, input, auth.username);

    console.log(`✅ Agent作成完了 (${auth.requestId}): ${agent.agentId}`);

    res.status(201).json({
      agent: toFrontendAgent(agent),
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        userId,
      },
    });
  } catch (error) {
    const auth = getCurrentAuth(req);
    console.error(`💥 Agent作成エラー (${auth.requestId}):`, error);

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Agentの作成に失敗しました',
      requestId: auth.requestId,
    });
  }
});

/**
 * Agent更新エンドポイント
 * PUT /agents/:agentId
 * JWT認証必須
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
        message: 'ユーザーIDが取得できませんでした',
        requestId: auth.requestId,
      });
    }

    if (!agentId) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'AgentIDが指定されていません',
        requestId: auth.requestId,
      });
    }

    console.log(`📝 Agent更新開始 (${auth.requestId}):`, {
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

    console.log(`✅ Agent更新完了 (${auth.requestId}): ${agent.name}`);

    res.status(200).json({
      agent: toFrontendAgent(agent),
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        userId,
      },
    });
  } catch (error) {
    const auth = getCurrentAuth(req);
    console.error(`💥 Agent更新エラー (${auth.requestId}):`, error);

    if (error instanceof Error && error.message === 'Agent not found') {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Agentが見つかりませんでした',
        requestId: auth.requestId,
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Agentの更新に失敗しました',
      requestId: auth.requestId,
    });
  }
});

/**
 * Agent削除エンドポイント
 * DELETE /agents/:agentId
 * JWT認証必須
 */
router.delete('/:agentId', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const userId = auth.userId;
    const { agentId } = req.params;

    if (!userId) {
      return res.status(400).json({
        error: 'Invalid authentication',
        message: 'ユーザーIDが取得できませんでした',
        requestId: auth.requestId,
      });
    }

    if (!agentId) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'AgentIDが指定されていません',
        requestId: auth.requestId,
      });
    }

    console.log(`🗑️  Agent削除開始 (${auth.requestId}):`, {
      userId,
      username: auth.username,
      agentId,
    });

    const agentsService = createAgentsService();
    await agentsService.deleteAgent(userId, agentId);

    console.log(`✅ Agent削除完了 (${auth.requestId}): ${agentId}`);

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
    console.error(`💥 Agent削除エラー (${auth.requestId}):`, error);

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Agentの削除に失敗しました',
      requestId: auth.requestId,
    });
  }
});

/**
 * Agent共有状態トグルエンドポイント
 * PUT /agents/:agentId/share
 * JWT認証必須
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
          message: 'ユーザーIDが取得できませんでした',
          requestId: auth.requestId,
        });
      }

      if (!agentId) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'AgentIDが指定されていません',
          requestId: auth.requestId,
        });
      }

      console.log(`🔄 Agent共有状態トグル開始 (${auth.requestId}):`, {
        userId,
        username: auth.username,
        agentId,
      });

      const agentsService = createAgentsService();
      const agent = await agentsService.toggleShare(userId, agentId);

      console.log(`✅ Agent共有状態トグル完了 (${auth.requestId}): isShared=${agent.isShared}`);

      res.status(200).json({
        agent: toFrontendAgent(agent),
        metadata: {
          requestId: auth.requestId,
          timestamp: new Date().toISOString(),
          userId,
        },
      });
    } catch (error) {
      const auth = getCurrentAuth(req);
      console.error(`💥 Agent共有状態トグルエラー (${auth.requestId}):`, error);

      if (error instanceof Error && error.message === 'Agent not found') {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Agentが見つかりませんでした',
          requestId: auth.requestId,
        });
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Agent共有状態の変更に失敗しました',
        requestId: auth.requestId,
      });
    }
  }
);

/**
 * デフォルトAgent初期化エンドポイント
 * POST /agents/initialize
 * JWT認証必須
 * 初回ログイン時にデフォルトAgentを作成
 */
router.post('/initialize', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const userId = auth.userId;

    if (!userId) {
      return res.status(400).json({
        error: 'Invalid authentication',
        message: 'ユーザーIDが取得できませんでした',
        requestId: auth.requestId,
      });
    }

    console.log(`🔧 デフォルトAgent初期化開始 (${auth.requestId}):`, {
      userId,
      username: auth.username,
    });

    const agentsService = createAgentsService();

    // 既存のAgentがあるか確認
    const existingAgents = await agentsService.listAgents(userId);

    if (existingAgents.length > 0) {
      console.log(`ℹ️  既存のAgentが存在するため初期化をスキップ (${auth.requestId})`);
      return res.status(200).json({
        agents: existingAgents.map((agent) => toFrontendAgent(agent)),
        skipped: true,
        message: '既存のAgentが存在するため、初期化をスキップしました',
        metadata: {
          requestId: auth.requestId,
          timestamp: new Date().toISOString(),
          userId,
          count: existingAgents.length,
        },
      });
    }

    // デフォルトAgentを作成
    const agents = await agentsService.initializeDefaultAgents(
      userId,
      DEFAULT_AGENTS,
      auth.username
    );

    console.log(`✅ デフォルトAgent初期化完了 (${auth.requestId}): ${agents.length}件`);

    res.status(201).json({
      agents: agents.map((agent) => toFrontendAgent(agent)),
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
    console.error(`💥 デフォルトAgent初期化エラー (${auth.requestId}):`, error);

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'デフォルトAgentの初期化に失敗しました',
      requestId: auth.requestId,
    });
  }
});

/**
 * 共有Agent一覧取得エンドポイント
 * GET /shared-agents
 * JWT認証必須
 */
router.get(
  '/shared-agents/list',
  jwtAuthMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const auth = getCurrentAuth(req);
      const { q: searchQuery, limit } = req.query;

      console.log(`📋 共有Agent一覧取得開始 (${auth.requestId}):`, {
        searchQuery,
        limit,
      });

      const agentsService = createAgentsService();
      const agents = await agentsService.listSharedAgents(
        limit ? parseInt(limit as string, 10) : 20,
        searchQuery as string | undefined
      );

      console.log(`✅ 共有Agent一覧取得完了 (${auth.requestId}): ${agents.length}件`);

      res.status(200).json({
        agents: agents.map((agent) => toFrontendAgent(agent, true)),
        metadata: {
          requestId: auth.requestId,
          timestamp: new Date().toISOString(),
          count: agents.length,
        },
      });
    } catch (error) {
      const auth = getCurrentAuth(req);
      console.error(`💥 共有Agent一覧取得エラー (${auth.requestId}):`, error);

      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : '共有Agent一覧の取得に失敗しました',
        requestId: auth.requestId,
      });
    }
  }
);

/**
 * 共有Agent詳細取得エンドポイント
 * GET /shared-agents/:userId/:agentId
 * JWT認証必須
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
          message: 'UserIDまたはAgentIDが指定されていません',
          requestId: auth.requestId,
        });
      }

      console.log(`🔍 共有Agent詳細取得開始 (${auth.requestId}):`, {
        userId,
        agentId,
      });

      const agentsService = createAgentsService();
      const agent = await agentsService.getSharedAgent(userId, agentId);

      if (!agent) {
        return res.status(404).json({
          error: 'Not Found',
          message: '共有Agentが見つかりませんでした',
          requestId: auth.requestId,
        });
      }

      console.log(`✅ 共有Agent詳細取得完了 (${auth.requestId}): ${agent.name}`);

      res.status(200).json({
        agent: toFrontendAgent(agent, true),
        metadata: {
          requestId: auth.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      const auth = getCurrentAuth(req);
      console.error(`💥 共有Agent詳細取得エラー (${auth.requestId}):`, error);

      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : '共有Agent詳細の取得に失敗しました',
        requestId: auth.requestId,
      });
    }
  }
);

/**
 * 共有Agentクローンエンドポイント
 * POST /shared-agents/:userId/:agentId/clone
 * JWT認証必須
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
          message: 'ユーザーIDが取得できませんでした',
          requestId: auth.requestId,
        });
      }

      if (!sourceUserId || !sourceAgentId) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'ソースUserIDまたはAgentIDが指定されていません',
          requestId: auth.requestId,
        });
      }

      console.log(`📥 共有Agentクローン開始 (${auth.requestId}):`, {
        targetUserId,
        targetUsername: auth.username,
        sourceUserId,
        sourceAgentId,
      });

      const agentsService = createAgentsService();
      const clonedAgent = await agentsService.cloneAgent(
        targetUserId,
        sourceUserId,
        sourceAgentId,
        auth.username
      );

      console.log(`✅ 共有Agentクローン完了 (${auth.requestId}): ${clonedAgent.agentId}`);

      res.status(201).json({
        agent: toFrontendAgent(clonedAgent),
        metadata: {
          requestId: auth.requestId,
          timestamp: new Date().toISOString(),
          userId: targetUserId,
        },
      });
    } catch (error) {
      const auth = getCurrentAuth(req);
      console.error(`💥 共有Agentクローンエラー (${auth.requestId}):`, error);

      if (error instanceof Error && error.message === 'Shared agent not found') {
        return res.status(404).json({
          error: 'Not Found',
          message: '共有Agentが見つかりませんでした',
          requestId: auth.requestId,
        });
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : '共有Agentのクローンに失敗しました',
        requestId: auth.requestId,
      });
    }
  }
);

export default router;
