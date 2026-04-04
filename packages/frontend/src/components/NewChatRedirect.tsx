import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { generateSessionId } from '../utils/sessionId';

/**
 * Component that generates a new session ID and redirects when starting a new chat
 */
export function NewChatRedirect() {
  const sessionId = generateSessionId();

  useEffect(() => {
    console.log(`🆕 新しいセッションを開始: ${sessionId}`);
  }, [sessionId]);

  return <Navigate to={`/chat/${sessionId}`} replace />;
}
