/**
 * Global Error Handler
 * Handles authentication errors and automatic logout
 */

import toast from 'react-hot-toast';
import { ApiError, AuthenticationError } from '../api/errors';
import { getValidAccessToken } from '../lib/cognito';
import i18n from '../i18n';

interface AuthStore {
  logout: () => Promise<void>;
}

let authStore: AuthStore | null = null;

/**
 * Shared promise for concurrent token refresh requests.
 * When multiple 401 responses arrive simultaneously, all callers
 * wait on the same refresh promise instead of triggering separate
 * refreshes (or worse, immediately returning false and forcing logout).
 */
let refreshPromise: Promise<boolean> | null = null;

/**
 * Initialize error handler with auth store
 * @param store - Auth store instance
 */
export function initializeErrorHandler(store: AuthStore): void {
  authStore = store;
}

/**
 * Attempt to refresh the access token.
 * If a refresh is already in progress, returns the same promise so that
 * concurrent callers share the result instead of racing each other.
 *
 * @returns true if refresh succeeded, false otherwise
 */
async function attemptTokenRefresh(): Promise<boolean> {
  // If a refresh is already in flight, piggy-back on it
  if (refreshPromise) {
    console.log('🔄 Token refresh already in progress, waiting...');
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      console.log('🔄 Attempting token refresh...');
      const newToken = await getValidAccessToken();

      if (newToken) {
        console.log('✅ Token refresh succeeded');
        return true;
      }

      console.warn('❌ Token refresh returned null');
      return false;
    } catch (error) {
      console.warn('❌ Token refresh failed:', error);
      return false;
    }
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

/**
 * Force logout with error message
 */
async function forceLogout(message: string): Promise<void> {
  toast.error(message, { duration: 5000 });

  if (authStore && typeof authStore.logout === 'function') {
    await authStore.logout();
  }
}

/**
 * Handle global API errors
 * @param error - Error object
 * @param skipRefreshAttempt - Skip token refresh attempt (used after retry)
 */
export async function handleGlobalError(error: unknown, skipRefreshAttempt = false): Promise<void> {
  // Handle authentication errors (401)
  if (error instanceof ApiError && error.status === 401) {
    if (!skipRefreshAttempt) {
      // Try to refresh the token before giving up
      const refreshed = await attemptTokenRefresh();
      if (refreshed) {
        // Token refreshed successfully — caller should retry the request
        // We don't logout here; the retry logic in the API client handles this
        console.log('🔄 Token refreshed, request should be retried');
        return;
      }
    }

    // Refresh failed or skipped — force logout
    console.warn('⚠️ Authentication token expired and refresh failed. Logging out...');
    await forceLogout(i18n.t('error.tokenExpired'));
    return;
  }

  // Handle authentication errors (from Cognito)
  if (error instanceof AuthenticationError) {
    if (!skipRefreshAttempt) {
      const refreshed = await attemptTokenRefresh();
      if (refreshed) {
        console.log('🔄 Token refreshed after AuthenticationError');
        return;
      }
    }

    console.warn('⚠️ Authentication required and refresh failed. Logging out...');
    await forceLogout(error.message);
    return;
  }

  // Handle other API errors
  if (error instanceof ApiError) {
    console.error('API Error:', {
      status: error.status,
      statusText: error.statusText,
      message: error.message,
      details: error.details,
    });

    // Show error toast for non-401 errors
    toast.error(error.message || i18n.t('error.apiError'), {
      duration: 4000,
    });

    return;
  }

  // Handle generic errors
  if (error instanceof Error) {
    console.error('Error:', error.message, error);
    toast.error(error.message || i18n.t('error.unexpectedError'));
    return;
  }

  // Unknown error
  console.error('Unknown error:', error);
  toast.error(i18n.t('error.unexpectedError'));
}

/**
 * Check if error is authentication related
 * @param error - Error object
 * @returns True if authentication error
 */
export function isAuthenticationError(error: unknown): boolean {
  return (
    (error instanceof ApiError && error.status === 401) || error instanceof AuthenticationError
  );
}
