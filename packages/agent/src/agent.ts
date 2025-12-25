/**
 * Strands AI Agent for AgentCore Runtime
 * AgentCore Runtime で動作し、AgentCore Gateway のツールを使用する AI Agent
 */

import { Agent, HookProvider, Message, McpClient } from '@strands-agents/sdk';
import { logger, config } from './config/index.js';
import { localTools, convertMCPToolsToStrands } from './tools/index.js';
import { buildSystemPrompt } from './prompts/index.js';
import { createBedrockModel } from './models/index.js';
import { MCPToolDefinition } from './schemas/types.js';
import { mcpClient } from './mcp/client.js';
import { getEnabledMCPServers, createMCPClients } from './mcp/index.js';
import { getCurrentStoragePath } from './context/request-context.js';
import type { SessionStorage, SessionConfig } from './session/types.js';
import { retrieveLongTermMemory } from './session/memory-retriever.js';
import type { MCPConfig } from './mcp/types.js';

/**
 * AgentCore Runtime 用の Strands Agent 作成オプション
 */
export interface CreateAgentOptions {
  modelId?: string; // 使用するモデルID（未指定時は環境変数）
  enabledTools?: string[]; // 有効化するツール名配列（undefined=全て、[]=なし）
  systemPrompt?: string; // カスタムシステムプロンプト（未指定時は自動生成）
  // セッション復元用（並列処理のため）
  sessionStorage?: SessionStorage;
  sessionConfig?: SessionConfig;
  // 長期記憶参照用
  memoryEnabled?: boolean; // 長期記憶を有効化するか（デフォルト: false）
  memoryContext?: string; // 検索クエリ（ユーザーの最新メッセージなど）
  actorId?: string; // ユーザーID
  memoryTopK?: number; // 取得する長期記憶の件数（デフォルト: 10）
  // ユーザー定義 MCP サーバー設定
  mcpConfig?: Record<string, unknown>; // mcp.json 形式の設定
}

/**
 * ツールをフィルタリング
 */
function filterTools<T extends { name: string }>(tools: T[], enabledTools?: string[]): T[] {
  if (enabledTools === undefined) return [];
  if (enabledTools.length === 0) {
    logger.info('🔧 ツールを無効化: 空配列が指定されました');
    return [];
  }

  const filtered = tools.filter((tool) => enabledTools.includes(tool.name));
  logger.info(`🔧 ツールをフィルタリング: ${enabledTools.join(', ')}`);
  return filtered;
}

/**
 * セッション履歴を読み込む
 */
async function loadSessionHistory(
  sessionStorage?: SessionStorage,
  sessionConfig?: SessionConfig
): Promise<Message[]> {
  if (!sessionStorage || !sessionConfig) {
    return [];
  }
  return sessionStorage.loadMessages(sessionConfig);
}

/**
 * 長期記憶を取得する
 */
async function fetchLongTermMemories(options?: CreateAgentOptions): Promise<{
  memories: string[];
  conditions: {
    memoryEnabled: boolean;
    hasActorId: boolean;
    hasMemoryContext: boolean;
    hasMemoryId: boolean;
  };
}> {
  // 条件チェック
  const conditions = {
    memoryEnabled: !!options?.memoryEnabled,
    hasActorId: !!options?.actorId,
    hasMemoryContext: !!options?.memoryContext,
    hasMemoryId: !!config.AGENTCORE_MEMORY_ID,
  };

  logger.info('🧠 長期記憶取得条件チェック:', conditions);

  if (!options?.memoryEnabled) {
    logger.info('🧠 長期記憶が無効化されています');
    return { memories: [], conditions };
  }

  // 必須条件が満たされていない場合
  if (!conditions.hasMemoryId) {
    logger.warn('⚠️ AGENTCORE_MEMORY_ID が設定されていません');
    return { memories: [], conditions };
  }
  if (!conditions.hasActorId) {
    logger.warn('⚠️ actorId が提供されていません');
    return { memories: [], conditions };
  }
  if (!conditions.hasMemoryContext) {
    logger.warn('⚠️ memoryContext が提供されていません');
    return { memories: [], conditions };
  }

  // 長期記憶を取得（条件チェック済みなので non-null assertion を使用）
  const memories = await retrieveLongTermMemory(
    config.AGENTCORE_MEMORY_ID!,
    options.actorId!,
    options.memoryContext!,
    options.memoryTopK || 10,
    config.BEDROCK_REGION
  );

  return { memories, conditions };
}

/**
 * Agent 作成結果
 */
export interface CreateAgentResult {
  agent: Agent;
  metadata: {
    loadedMessagesCount: number;
    longTermMemoriesCount: number;
    toolsCount: number;
    memoryConditions?: {
      memoryEnabled: boolean;
      hasActorId: boolean;
      hasMemoryContext: boolean;
      hasMemoryId: boolean;
    };
  };
}

/**
 * AgentCore Runtime 用の Strands Agent を作成
 * @param hooks HookProvider の配列（セッション永続化など）
 * @param options Agent作成オプション（モデルID、ツール、システムプロンプト、セッション設定）
 */
export async function createAgent(
  hooks?: HookProvider[],
  options?: CreateAgentOptions
): Promise<CreateAgentResult> {
  logger.info('Strands Agent を初期化中...');

  try {
    // 1. ユーザー定義 MCP クライアントを生成（リクエストから受け取った mcpConfig）
    let userMCPClients: McpClient[] = [];
    if (options?.mcpConfig) {
      try {
        logger.info('🔧 ユーザー定義 MCP 設定を処理中...');
        const userMCPServers = getEnabledMCPServers(options.mcpConfig as unknown as MCPConfig);
        userMCPClients = createMCPClients(userMCPServers);
        logger.info(`✅ ユーザー定義 MCP クライアント: ${userMCPClients.length}件`);
      } catch (error) {
        logger.error('❌ ユーザー定義 MCP クライアントの生成に失敗:', error);
        // エラーがあってもスキップして続行
      }
    }

    // 2. セッション履歴復元、Gateway MCPツール取得、長期記憶取得を並列実行
    const [savedMessages, gatewayMCPTools, longTermMemoriesResult] = await Promise.all([
      loadSessionHistory(options?.sessionStorage, options?.sessionConfig),
      mcpClient.listTools(),
      fetchLongTermMemories(options),
    ]);

    const longTermMemories = longTermMemoriesResult.memories;
    const memoryConditions = longTermMemoriesResult.conditions;

    logger.info(`📖 セッション履歴を復元: ${savedMessages.length}件のメッセージ`);
    if (longTermMemories.length > 0) {
      logger.info(`🧠 長期記憶を取得: ${longTermMemories.length}件`);
    }

    // 3. Gateway MCP ツールを Strands 形式に変換
    const gatewayStrandsTools = convertMCPToolsToStrands(gatewayMCPTools as MCPToolDefinition[]);

    // 4. すべてのツールを統合
    // - ローカル Python ツール等（enabledTools でフィルタリング）
    // - AgentCore Gateway 経由のツール（enabledTools でフィルタリング）
    // - ユーザー定義 MCP サーバー（リクエストから、常に全て有効）
    const filteredTools = filterTools(
      [...localTools, ...gatewayStrandsTools],
      options?.enabledTools
    );
    const allTools = [...filteredTools, ...userMCPClients] as unknown[];

    logger.info(
      `✅ 合計${allTools.length}個のツールを準備 (ローカル: ${localTools.length}, Gateway: ${gatewayStrandsTools.length}, ユーザーMCP: ${userMCPClients.length})`
    );

    // 3. Bedrock モデルを作成
    const model = createBedrockModel({ modelId: options?.modelId });
    logger.info(`🤖 使用モデル: ${options?.modelId || 'デフォルト'}`);

    // 5. システムプロンプトを生成（ストレージパス情報と長期記憶を含む）
    const storagePath = getCurrentStoragePath();
    const systemPrompt = buildSystemPrompt({
      customPrompt: options?.systemPrompt,
      tools: allTools as Array<{ name: string; description?: string }>,
      mcpTools: gatewayMCPTools as MCPToolDefinition[],
      storagePath,
      longTermMemories,
    });

    if (options?.systemPrompt) {
      logger.info('📝 カスタムシステムプロンプトを使用');
    } else {
      logger.info('📝 デフォルトシステムプロンプトを生成');
    }
    logger.info('📝 デフォルトコンテキストを付与したシステムプロンプトを生成');

    logger.info({ systemPrompt });

    // 6. Agent を作成

    const agent = new Agent({
      model,
      systemPrompt,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: allTools as any,
      messages: savedMessages,
      hooks,
    });

    // 7. ログ出力
    if (hooks && hooks.length > 0) {
      logger.info(`✅ ${hooks.length}個のフックを登録`);
    }

    logger.info('✅ Strands Agent の初期化が完了しました');

    // メタデータを返す
    return {
      agent,
      metadata: {
        loadedMessagesCount: savedMessages.length,
        longTermMemoriesCount: longTermMemories.length,
        toolsCount: allTools.length,
        memoryConditions,
      },
    };
  } catch (error) {
    logger.error('❌ Strands Agent の初期化に失敗:', error);
    throw error;
  }
}
