/**
 * Base API Client
 * Common utilities for all API clients
 */

import { getValidAccessToken } from '../../lib/cognito';
import i18n from '../../i18n';

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly statusText: string;
  public readonly details?: unknown;

  constructor(message: string, status: number, statusText: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
    this.details = details;
  }
}

/**
 * Custom error class for authentication errors
 */
export class AuthenticationError extends Error {
  constructor(message?: string) {
    super(message || i18n.t('error.authenticationRequired'));
    this.name = 'AuthenticationError';
  }
}

/**
 * Create authorization headers with access token
 * @returns Authorization headers
 */
export async function createAuthHeaders(): Promise<Record<string, string>> {
  const accessToken = await getValidAccessToken();

  if (!accessToken) {
    throw new AuthenticationError();
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

/**
 * Handle API error responses
 * @param response - Failed response
 * @throws ApiError with details
 */
export async function handleApiError(response: Response): Promise<never> {
  const errorData = await response.json().catch(() => ({}));

  const apiError = new ApiError(
    errorData.message || errorData.error || 'Unknown error',
    response.status,
    response.statusText,
    errorData
  );

  // Special handling for 401 errors
  if (response.status === 401) {
    console.warn('⚠️ 401 Unauthorized detected:', apiError.message);
  }

  throw apiError;
}

/**
 * Normalize base URL by removing trailing slashes
 * @param url - URL to normalize
 * @returns Normalized URL
 */
export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, '');
}
