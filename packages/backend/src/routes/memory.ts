/**
 * Memory API ルート
 * AgentCore Memory の長期記憶管理用エンドポイント
 */

import { Router, Response } from 'express';
import { createAgentCoreMemoryService } from '../services/agentcore-memory.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

/**
 * 長期記憶レコード一覧を取得
 * GET /api/memory/records
 *
 * Query Parameters:
 * - nextToken: ページネーション用トークン (オプション)
 */
router.get('/records', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { nextToken } = req.query;

    const memoryService = createAgentCoreMemoryService();
    const strategyId = await memoryService.getSemanticMemoryStrategyId();
    const result = await memoryService.listMemoryRecords(
      userId,
      strategyId,
      typeof nextToken === 'string' ? nextToken : undefined
    );

    console.log(
      `[Memory API] Retrieved ${result.records.length} memory records for user: ${userId}`
    );

    res.json({
      records: result.records,
      nextToken: result.nextToken,
    });
  } catch (error) {
    console.error('[Memory API] Error retrieving memory records:', error);
    res.status(500).json({
      error: 'Failed to retrieve memory records',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * 長期記憶レコードを削除
 * DELETE /api/memory/records/:recordId
 *
 * Parameters:
 * - recordId: 削除するレコードID
 */
router.delete('/records/:recordId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { recordId } = req.params;

    // パラメータの検証
    if (!recordId) {
      return res.status(400).json({ error: 'recordId parameter is required' });
    }

    const memoryService = createAgentCoreMemoryService();
    const strategyId = await memoryService.getSemanticMemoryStrategyId();
    await memoryService.deleteMemoryRecord(userId, strategyId, recordId);

    console.log(`[Memory API] Deleted memory record: ${recordId} for user: ${userId}`);

    res.json({
      success: true,
      message: 'Memory record deleted successfully',
      recordId,
    });
  } catch (error) {
    console.error('[Memory API] Error deleting memory record:', error);
    res.status(500).json({
      error: 'Failed to delete memory record',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * セマンティック検索で長期記憶レコードを取得
 * POST /api/memory/search
 *
 * Body:
 * - query: 検索クエリ
 * - topK: 取得件数 (オプション、デフォルト: 10)
 * - relevanceScore: 関連度スコアの閾値 (オプション、デフォルト: 0.2)
 */
router.post('/search', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { query, topK = 10, relevanceScore = 0.2 } = req.body;

    // パラメータの検証
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'query is required' });
    }

    // 数値パラメータの検証
    const topKNum = typeof topK === 'number' ? topK : parseInt(topK, 10);
    const relevanceScoreNum =
      typeof relevanceScore === 'number' ? relevanceScore : parseFloat(relevanceScore);

    if (isNaN(topKNum) || topKNum < 1 || topKNum > 100) {
      return res.status(400).json({ error: 'topK must be a number between 1 and 100' });
    }

    if (isNaN(relevanceScoreNum) || relevanceScoreNum < 0 || relevanceScoreNum > 1) {
      return res.status(400).json({ error: 'relevanceScore must be a number between 0 and 1' });
    }

    const memoryService = createAgentCoreMemoryService();
    const strategyId = await memoryService.getSemanticMemoryStrategyId();
    const records = await memoryService.retrieveMemoryRecords(
      userId,
      strategyId,
      query,
      topKNum,
      relevanceScoreNum
    );

    console.log(
      `[Memory API] Retrieved ${records.length} search results for query: "${query}" for user: ${userId}`
    );

    res.json({ records });
  } catch (error) {
    console.error('[Memory API] Error searching memory records:', error);
    res.status(500).json({
      error: 'Failed to search memory records',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
