/**
 * Tools API Routes
 * AgentCore Gateway のツール一覧・検索機能を提供するAPI
 */

import express, { Response } from 'express';
import { jwtAuthMiddleware, AuthenticatedRequest, getCurrentAuth } from '../middleware/auth.js';
import { gatewayService } from '../services/agentcore-gateway.js';
import { fetchToolsFromMCPConfig, MCPConfig } from '../mcp/index.js';

const router = express.Router();

/**
 * ツール一覧取得エンドポイント（認証必須）
 * GET /tools
 */
router.get('/', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const idToken = req.headers.authorization?.replace('Bearer ', '');

    if (!idToken) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: '認証トークンが必要です',
        timestamp: new Date().toISOString(),
      });
    }

    console.log(`🔧 ツール一覧取得開始 (${auth.requestId}):`, {
      userId: auth.userId,
      username: auth.username,
    });

    // cursorクエリパラメータを取得
    const cursor = req.query.cursor as string | undefined;

    // Gateway からツール一覧を取得（認証必須、ページネーション対応）
    const result = await gatewayService.listTools(idToken, cursor);

    const response = {
      tools: result.tools,
      nextCursor: result.nextCursor,
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        actorId: auth.userId,
        count: result.tools.length,
      },
    };

    console.log(
      `✅ ツール一覧取得完了 (${auth.requestId}): ${result.tools.length}件`,
      result.nextCursor ? { nextCursor: 'あり' } : { nextCursor: 'なし' }
    );

    res.status(200).json(response);
  } catch (error) {
    console.error(`💥 ツール一覧取得エラー:`, error);

    const errorResponse = {
      error: 'Tools List Error',
      message: error instanceof Error ? error.message : 'ツール一覧の取得に失敗しました',
      timestamp: new Date().toISOString(),
    };

    // Gateway 接続エラーの場合は 502
    if (error instanceof Error && error.message.includes('Gateway')) {
      return res.status(502).json(errorResponse);
    }

    res.status(500).json(errorResponse);
  }
});

/**
 * ツール検索エンドポイント
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
        message: '認証トークンが必要です',
        timestamp: new Date().toISOString(),
      });
    }

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: '検索クエリが必要です',
        timestamp: new Date().toISOString(),
      });
    }

    console.log(`🔍 ツール検索開始 (${auth.requestId}):`, {
      userId: auth.userId,
      username: auth.username,
      query: query.trim(),
    });

    // Gateway でセマンティック検索を実行
    const tools = await gatewayService.searchTools(query.trim(), idToken);

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
      `✅ ツール検索完了 (${auth.requestId}): ${tools.length}件 (クエリ: "${query.trim()}")`
    );

    res.status(200).json(response);
  } catch (error) {
    console.error(`💥 ツール検索エラー:`, error);

    const errorResponse = {
      error: 'Tools Search Error',
      message: error instanceof Error ? error.message : 'ツール検索に失敗しました',
      timestamp: new Date().toISOString(),
    };

    // Gateway 接続エラーの場合は 502
    if (error instanceof Error && error.message.includes('Gateway')) {
      return res.status(502).json(errorResponse);
    }

    // 検索クエリエラーの場合は 400
    if (error instanceof Error && error.message.includes('検索クエリ')) {
      return res.status(400).json(errorResponse);
    }

    res.status(500).json(errorResponse);
  }
});

/**
 * Gateway 接続確認エンドポイント
 * GET /tools/health
 */
router.get('/health', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const idToken = req.headers.authorization?.replace('Bearer ', '');

    if (!idToken) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: '認証トークンが必要です',
        timestamp: new Date().toISOString(),
      });
    }

    console.log(`💓 Gateway 接続確認開始 (${auth.requestId}):`, {
      userId: auth.userId,
      username: auth.username,
    });

    // Gateway 接続確認
    const isConnected = await gatewayService.checkConnection(idToken);

    if (isConnected) {
      const response = {
        status: 'healthy',
        gateway: {
          connected: true,
          endpoint: '[CONFIGURED]', // セキュリティ上、実際のエンドポイントは表示しない
        },
        metadata: {
          requestId: auth.requestId,
          timestamp: new Date().toISOString(),
          actorId: auth.userId,
        },
      };

      console.log(`✅ Gateway 接続確認成功 (${auth.requestId})`);
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

      console.log(`❌ Gateway 接続確認失敗 (${auth.requestId})`);
      res.status(502).json(response);
    }
  } catch (error) {
    console.error(`💥 Gateway 接続確認エラー:`, error);

    res.status(500).json({
      error: 'Health Check Error',
      message: error instanceof Error ? error.message : 'Gateway 接続確認に失敗しました',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * ローカル MCP ツール取得エンドポイント
 * POST /tools/local
 * ユーザー定義の MCP サーバー設定からツール一覧を取得
 */
router.post('/local', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const { mcpConfig } = req.body as { mcpConfig: MCPConfig };

    if (!mcpConfig || !mcpConfig.mcpServers) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'mcpConfig が必要です',
        timestamp: new Date().toISOString(),
      });
    }

    console.log(`🔧 ローカル MCP ツール取得開始 (${auth.requestId}):`, {
      userId: auth.userId,
      serverCount: Object.keys(mcpConfig.mcpServers).length,
    });

    // MCP サーバーからツール一覧を取得
    const tools = await fetchToolsFromMCPConfig(mcpConfig, console);

    const response = {
      tools,
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        actorId: auth.userId,
        count: tools.length,
      },
    };

    console.log(`✅ ローカル MCP ツール取得完了 (${auth.requestId}): ${tools.length}件`);
    res.status(200).json(response);
  } catch (error) {
    console.error(`💥 ローカル MCP ツール取得エラー:`, error);
    res.status(500).json({
      error: 'MCP Tools Error',
      message: error instanceof Error ? error.message : 'ツール取得に失敗しました',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
