import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { nanoid } from 'nanoid';

/**
 * 新規チャット開始時に新しいセッションIDを生成してリダイレクトするコンポーネント
 */
export function NewChatRedirect() {
  const sessionId = nanoid(33); // Generate 33+ characters

  useEffect(() => {
    console.log(`🆕 新しいセッションを開始: ${sessionId}`);
  }, [sessionId]);

  return <Navigate to={`/chat/${sessionId}`} replace />;
}
