/**
 * Global Error Handler
 * Handles authentication errors and automatic logout
 */

import toast from 'react-hot-toast';
import { ApiError, AuthenticationError } from '../api/client/base-client';
import i18n from '../i18n';

interface AuthStore {
  logout: () => Promise<void>;
}

let authStore: AuthStore | null = null;

/**
 * Initialize error handler with auth store
 * @param store - Auth store instance
 */
export function initializeErrorHandler(store: AuthStore): void {
  authStore = store;
}

/**
 * Handle global API errors
 * @param error - Error object
 */
export async function handleGlobalError(error: unknown): Promise<void> {
  // Handle authentication errors (401)
  if (error instanceof ApiError && error.status === 401) {
    console.warn('⚠️ Authentication token expired. Logging out...');

    toast.error(i18n.t('error.tokenExpired'), {
      duration: 5000,
    });

    // Automatic logout
    if (authStore && typeof authStore.logout === 'function') {
      await authStore.logout();
    }

    return;
  }

  // Handle authentication errors (from Cognito)
  if (error instanceof AuthenticationError) {
    console.warn('⚠️ Authentication required. Logging out...');

    toast.error(error.message, {
      duration: 5000,
    });

    // Automatic logout
    if (authStore && typeof authStore.logout === 'function') {
      await authStore.logout();
    }

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
