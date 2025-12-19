/**
 * Backend API Server
 * JWT認証対応のExpress APIサーバー
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { jwtAuthMiddleware, AuthenticatedRequest, getCurrentAuth } from './middleware/auth.js';

const app = express();

/**
 * CORS 設定
 */
const corsOptions = {
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allowed?: boolean) => void
  ) => {
    const allowedOrigins = config.cors.allowedOrigins;

    // オリジンがない場合（Postman等）は許可
    if (!origin) {
      return callback(null, true);
    }

    // ワイルドカード（*）または明示的に許可されたオリジンをチェック
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`🚫 CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400, // preflight キャッシュ 24時間
};

// ミドルウェア設定
app.use(cors(corsOptions));
app.use(express.json());

/**
 * ヘルスチェックエンドポイント（認証不要）
 * Lambda/API Gateway で使用される標準的なヘルスチェック
 */
app.get('/ping', (req: Request, res: Response) => {
  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'agentcore-backend',
    version: '0.1.0',
    environment: config.nodeEnv,
    jwks: {
      configured: !!config.jwks.uri,
      uri: config.jwks.uri ? '[CONFIGURED]' : null,
    },
  };

  console.log(`💓 ヘルスチェック - ${req.ip} - ${req.get('User-Agent')?.substring(0, 50)}`);

  res.status(200).json(healthStatus);
});

/**
 * JWT 内容確認エンドポイント（認証必要）
 * 現在のJWTの内容を返却
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

    console.log(`👤 /me リクエスト成功 (${auth.requestId}):`, {
      userId: auth.userId,
      username: auth.username,
    });

    res.status(200).json(response);
  } catch (error) {
    console.error(`💥 /me エンドポイントエラー:`, error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to process /me request',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * ルートエンドポイント（認証不要）
 * API 情報を表示
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
 * 404 ハンドラー
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
 * エラーハンドラー
 */
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('💥 Unhandled error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  res.status(500).json({
    error: 'Internal Server Error',
    message: config.isDevelopment ? err.message : 'Something went wrong',
    timestamp: new Date().toISOString(),
  });
});

/**
 * サーバー開始
 */
async function startServer(): Promise<void> {
  try {
    app.listen(config.port, () => {
      console.log(`🚀 AgentCore Backend API server listening on port ${config.port}`);
      console.log(`📋 Health check: http://localhost:${config.port}/ping`);
      console.log(`👤 User info: GET http://localhost:${config.port}/me`);
      console.log(`🌍 Environment: ${config.nodeEnv}`);
      console.log(`🔐 JWKS configured: ${config.jwks.uri ? '✅' : '❌'}`);
      console.log(`🔗 CORS origins: ${config.cors.allowedOrigins.join(', ')}`);
    });
  } catch (error) {
    console.error('💥 サーバー開始に失敗しました:', error);
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

// プロセス終了時のエラーハンドリング
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// サーバー開始
startServer();
