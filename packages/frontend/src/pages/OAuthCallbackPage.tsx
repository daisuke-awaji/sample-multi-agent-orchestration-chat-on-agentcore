import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { backendClient } from '../api/client/backend-client';

type CallbackStatus = 'processing' | 'success' | 'error';

/**
 * OAuth Callback Page
 * Handles the redirect after a user completes OAuth consent (3LO).
 * Calls the backend to complete the token exchange via AgentCore Identity.
 *
 * URL pattern: /oauth/callback?session_id=urn:ietf:params:oauth:request_uri:...
 */
export function OAuthCallbackPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<CallbackStatus>('processing');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const sessionUri = searchParams.get('session_id');

    const completeAuth = async () => {
      if (!sessionUri) {
        setStatus('error');
        setErrorMessage(t('oauth.missingSessionId'));
        return;
      }

      try {
        await backendClient.post('/oauth/complete', { sessionUri });
        setStatus('success');

        // Auto-redirect to chat after 3 seconds
        setTimeout(() => {
          navigate('/chat', { replace: true });
        }, 3000);
      } catch (error) {
        setStatus('error');
        setErrorMessage(
          error instanceof Error ? error.message : t('oauth.authFailed')
        );
      }
    };

    completeAuth();
  }, [searchParams, navigate, t]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 text-center">
          {status === 'processing' && (
            <>
              <Loader2 className="w-12 h-12 mx-auto mb-4 text-blue-500 animate-spin" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {t('oauth.authenticating')}
              </h2>
              <p className="text-gray-500 dark:text-gray-400">
                {t('oauth.pleaseWait')}
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {t('oauth.authCompleted')}
              </h2>
              <p className="text-gray-500 dark:text-gray-400">
                {t('oauth.authCompletedDescription')}
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-4">
                {t('oauth.redirecting')}
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {t('oauth.authFailed')}
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {errorMessage || t('oauth.authFailedDescription')}
              </p>
              <button
                onClick={() => navigate('/chat', { replace: true })}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                {t('oauth.backToChat')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
