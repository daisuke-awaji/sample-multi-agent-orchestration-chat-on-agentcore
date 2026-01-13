/**
 * Backend API Client
 * HTTP client for Backend Service (VITE_BACKEND_URL)
 */

import { createAuthHeaders, handleApiError, normalizeBaseUrl } from './base-client';

/**
 * Check if API debugging is enabled
 */
const isDebugEnabled = (): boolean => {
  return import.meta.env.DEV || import.meta.env.VITE_API_DEBUG === 'true';
};

/**
 * Log API request start
 */
const logRequestStart = (method: string, endpoint: string): void => {
  if (isDebugEnabled()) {
    console.log(`🚀 ${method} ${endpoint}`);
  }
};

/**
 * Log API request success
 */
const logRequestSuccess = (method: string, endpoint: string, status: number): void => {
  if (isDebugEnabled()) {
    console.log(`✅ ${method} ${endpoint} -> ${status}`);
  }
};

/**
 * Log API request error
 */
const logRequestError = (method: string, endpoint: string, error: unknown): void => {
  if (isDebugEnabled()) {
    console.error(`💥 ${method} ${endpoint} failed:`, error);
  }
};

/**
 * Get Backend Service base URL
 */
const getBaseUrl = (): string => {
  return normalizeBaseUrl(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000');
};

/**
 * Generic backend API request
 * @param endpoint - API endpoint (e.g., '/agents')
 * @param options - Fetch options
 * @returns Response data
 */
export async function backendRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const method = options.method || 'GET';

  try {
    logRequestStart(method, endpoint);

    const baseUrl = getBaseUrl();
    const headers = await createAuthHeaders();

    const response = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers: { ...headers, ...(options.headers as Record<string, string>) },
    });

    if (!response.ok) {
      await handleApiError(response);
    }

    logRequestSuccess(method, endpoint, response.status);

    return response.json();
  } catch (error) {
    logRequestError(method, endpoint, error);
    
    // Import and handle global errors
    const { handleGlobalError } = await import('../../utils/errorHandler');
    await handleGlobalError(error);
    
    throw error;
  }
}

/**
 * GET request helper
 * @param endpoint - API endpoint
 * @returns Response data
 */
export async function backendGet<T>(endpoint: string): Promise<T> {
  return backendRequest<T>(endpoint, { method: 'GET' });
}

/**
 * POST request helper
 * @param endpoint - API endpoint
 * @param body - Request body
 * @returns Response data
 */
export async function backendPost<T>(endpoint: string, body?: unknown): Promise<T> {
  return backendRequest<T>(endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * PUT request helper
 * @param endpoint - API endpoint
 * @param body - Request body
 * @returns Response data
 */
export async function backendPut<T>(endpoint: string, body?: unknown): Promise<T> {
  return backendRequest<T>(endpoint, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * DELETE request helper
 * @param endpoint - API endpoint
 * @returns Response data
 */
export async function backendDelete<T>(endpoint: string): Promise<T> {
  return backendRequest<T>(endpoint, { method: 'DELETE' });
}

/**
 * PATCH request helper
 * @param endpoint - API endpoint
 * @param body - Request body
 * @returns Response data
 */
export async function backendPatch<T>(endpoint: string, body?: unknown): Promise<T> {
  return backendRequest<T>(endpoint, {
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  });
}
