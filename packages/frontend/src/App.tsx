import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './stores/authStore';
import { AuthContainer } from './features/auth/AuthContainer';
import { MainLayout } from './layouts/MainLayout';
import { HomePage } from './pages/HomePage';
import { ChatPage } from './pages/ChatPage';
import { ToolsPage } from './pages/ToolsPage';
import { AgentDirectoryPage } from './pages/AgentDirectoryPage';
import { SearchChatPage } from './pages/SearchChatPage';
import { AgentsPage } from './pages/AgentsPage';
import { EventsPage } from './pages/EventsPage';
import { SettingsPage } from './pages/SettingsPage';
import { getCurrentUserSession } from './lib/cognito';
import { initializeAgentStore } from './stores/agentStore';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initializeErrorHandler } from './utils/errorHandler';

function App() {
  const { isAuthenticated, setUser, setLoading, setError, logout } = useAuthStore();

  useEffect(() => {
    // Initialize global error handler with auth store
    initializeErrorHandler({ logout });

    // Initialize AgentStore
    initializeAgentStore();

    // Check existing session
    const checkExistingSession = async () => {
      try {
        setLoading(true);
        const user = await getCurrentUserSession();

        if (user) {
          setUser(user);
        }
      } catch (error) {
        console.error('Session check error:', error);
        // Do not display session check errors to user (treat as unauthenticated)
      } finally {
        setLoading(false);
      }
    };

    checkExistingSession();
  }, [setUser, setLoading, setError, logout]);

  return (
    <ErrorBoundary>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#363636',
            color: '#fff',
            borderRadius: '12px',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#fff',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      />
      <BrowserRouter>
        {isAuthenticated ? (
          <div className="h-screen flex">
            <Routes>
              <Route element={<MainLayout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/chat/:sessionId" element={<ChatPage />} />
                <Route path="/search-chat" element={<SearchChatPage />} />
                <Route path="/search" element={<AgentDirectoryPage />} />
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
    </ErrorBoundary>
  );
}

export default App;
