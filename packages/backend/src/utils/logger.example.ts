/**
 * Logger Usage Examples
 * ロガーの使用例
 */

import { logger } from './logger.js';

/**
 * 基本的な使用例
 */
export function basicUsageExample() {
  // 情報ログ
  logger.info('アプリケーション起動', {
    port: 3000,
    environment: 'development',
  });

  // エラーログ
  const error = new Error('Database connection failed');
  logger.error('データベース接続エラー', {
    error,
    host: 'localhost',
    port: 5432,
  });

  // 警告ログ
  logger.warn('設定が未定義です', {
    configKey: 'API_KEY',
    defaultValue: 'using default',
  });

  // デバッグログ（LOG_LEVEL=debug の時のみ出力）
  logger.debug('リクエストボディ', {
    body: { name: 'test', email: 'test@example.com' },
  });
}

/**
 * 子ロガーの使用例
 */
export function childLoggerExample() {
  // リクエストごとにコンテキスト付きロガーを作成
  const requestLogger = logger.child({
    requestId: 'req_1234567890_abc123',
    userId: 'user-123',
    username: 'awaji',
  });

  // すべてのログに自動でrequestId, userId, usernameが付与される
  requestLogger.info('Agent一覧取得開始');
  requestLogger.info('Agent一覧取得完了', { count: 5 });

  // さらにコンテキストを追加
  const agentLogger = requestLogger.child({
    agentId: 'agent-456',
  });

  agentLogger.info('Agent詳細取得開始');
  agentLogger.error('Agent詳細取得失敗', {
    error: new Error('Agent not found'),
  });
}

/**
 * Express ルートハンドラーでの使用例
 */
export function expressHandlerExample() {
  // この例は実際のExpressアプリでは動作しません（デモンストレーション用）
  
  // ミドルウェアで req.logger が設定されている前提
  const mockRequest = {
    logger: logger.child({
      requestId: 'req_1234567890_xyz789',
      userId: 'user-789',
    }),
  };

  // ルートハンドラー内で使用
  mockRequest.logger.info('Agent作成リクエスト受信', {
    body: { name: 'New Agent', description: 'Test' },
  });

  try {
    // 何らかの処理
    const agentId = 'agent-new-123';
    
    mockRequest.logger.info('Agent作成成功', {
      agentId,
      name: 'New Agent',
    });
  } catch (error) {
    mockRequest.logger.error('Agent作成失敗', {
      error,
      reason: 'validation_error',
    });
  }
}

/**
 * サービス層での使用例
 */
export class AgentServiceExample {
  async createAgent(userId: string, data: { name: string }) {
    const serviceLogger = logger.child({ userId, service: 'AgentService' });

    serviceLogger.info('Agent作成処理開始', { data });

    try {
      // DynamoDB操作などの処理
      const agentId = 'generated-id';
      
      serviceLogger.info('Agent作成成功', {
        agentId,
        name: data.name,
      });

      return { agentId, ...data };
    } catch (error) {
      serviceLogger.error('Agent作成失敗', {
        error,
        data,
      });
      throw error;
    }
  }

  async listAgents(userId: string) {
    const serviceLogger = logger.child({ userId, service: 'AgentService' });

    serviceLogger.debug('Agent一覧取得クエリ実行', {
      userId,
    });

    try {
      // DynamoDB クエリ
      const agents = [
        { id: 'agent-1', name: 'Agent 1' },
        { id: 'agent-2', name: 'Agent 2' },
      ];

      serviceLogger.info('Agent一覧取得成功', {
        count: agents.length,
      });

      return agents;
    } catch (error) {
      serviceLogger.error('Agent一覧取得失敗', { error });
      throw error;
    }
  }
}

/**
 * エラーハンドリングの例
 */
export function errorHandlingExample() {
  try {
    throw new Error('Something went wrong');
  } catch (error) {
    // エラーオブジェクトをerrorキーで渡すと、自動的にシリアライズされる
    logger.error('予期しないエラー', {
      error,
      context: 'error handling example',
    });
  }

  // 非Errorオブジェクトのエラー
  try {
    throw 'String error message';
  } catch (error) {
    // 文字列や他の型でも適切に処理される
    logger.error('非標準エラー', {
      error,
      type: typeof error,
    });
  }
}

// 実行例（このファイルを直接実行する場合）
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('\n=== Basic Usage ===');
  basicUsageExample();

  console.log('\n=== Child Logger ===');
  childLoggerExample();

  console.log('\n=== Express Handler ===');
  expressHandlerExample();

  console.log('\n=== Error Handling ===');
  errorHandlingExample();

  console.log('\n=== Service Layer ===');
  const service = new AgentServiceExample();
  await service.createAgent('user-123', { name: 'Test Agent' });
  await service.listAgents('user-123');
}
