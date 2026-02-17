import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest, getCurrentAuth } from './auth.js';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function routeErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const auth = getCurrentAuth(req as AuthenticatedRequest);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.statusCode < 500 ? err.message : 'Internal Server Error',
      message: err.message,
      requestId: auth.requestId,
    });
    return;
  }

  console.error('💥 Unhandled route error (%s):', auth.requestId, err);

  res.status(500).json({
    error: 'Internal Server Error',
    message: err instanceof Error ? err.message : 'An unexpected error occurred',
    requestId: auth.requestId,
  });
}
