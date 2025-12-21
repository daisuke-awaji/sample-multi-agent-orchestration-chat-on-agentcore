import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { LoginForm } from './features/auth/LoginForm';
import { ChatPage } from './pages/ChatPage';
import { ToolsPage } from './pages/ToolsPage';
import { getCurrentUserSession, validateCognitoConfig } from './lib/cognito';

function App() {
  const { isAuthenticated, setUser, setLoading, setError } = useAuthStore();

  useEffect(() => {
    // 初期化時にCognito設定を検証
    if (!validateCognitoConfig()) {
      setError('Cognito設定が不完全です。環境変数を確認してください。');
      return;
    }

    // 既存のセッションを確認
    const checkExistingSession = async () => {
      try {
        setLoading(true);
        const user = await getCurrentUserSession();

        if (user) {
          setUser(user);
        }
      } catch (error) {
        console.error('Session check error:', error);
        // セッションチェックエラーはユーザーに表示しない（単に未認証として扱う）
      } finally {
        setLoading(false);
      }
    };

    checkExistingSession();
  }, [setUser, setLoading, setError]);

  // 認証状態に応じてルーティングを設定
  if (isAuthenticated) {
    return (
      <BrowserRouter>
        <div className="h-screen flex">
          <Routes>
            <Route path="/" element={<Navigate to="/chat" replace />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/chat/:sessionId" element={<ChatPage />} />
            <Route path="/tools" element={<ToolsPage />} />
            <Route path="*" element={<Navigate to="/chat" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    );
  }

  return <LoginForm />;
}

export default App;
