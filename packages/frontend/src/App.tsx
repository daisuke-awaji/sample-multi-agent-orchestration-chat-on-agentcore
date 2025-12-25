import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { AuthContainer } from './features/auth/AuthContainer';
import { MainLayout } from './layouts/MainLayout';
import { HomePage } from './pages/HomePage';
import { ChatPage } from './pages/ChatPage';
import { ToolsPage } from './pages/ToolsPage';
import { SearchPage } from './pages/SearchPage';
import { AgentsPage } from './pages/AgentsPage';
import { EventsPage } from './pages/EventsPage';
import { SettingsPage } from './pages/SettingsPage';
import { getCurrentUserSession } from './lib/cognito';
import { initializeAgentStore } from './stores/agentStore';

function App() {
  const { isAuthenticated, setUser, setLoading, setError } = useAuthStore();

  useEffect(() => {
    // AgentStoreを初期化
    initializeAgentStore();

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

  return (
    <BrowserRouter>
      {isAuthenticated ? (
        <div className="h-screen flex">
          <Routes>
            <Route element={<MainLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/chat/:sessionId" element={<ChatPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/tools" element={<ToolsPage />} />
              <Route path="/agents" element={<AgentsPage />} />
              <Route path="/events" element={<EventsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/chat" replace />} />
          </Routes>
        </div>
      ) : (
        <AuthContainer />
      )}
    </BrowserRouter>
  );
}

export default App;
