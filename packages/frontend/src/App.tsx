import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './stores/authStore';
import { useThemeStore } from './stores/themeStore';
import { AuthContainer } from './features/auth/AuthContainer';
import { MainLayout } from './layouts/MainLayout';
import { HomePage } from './pages/HomePage';
import { ChatPage } from './pages/ChatPage';
import { ToolsPage } from './pages/ToolsPage';
import { AgentDirectoryPage } from './pages/AgentDirectoryPage';
import { SearchChatPage } from './pages/SearchChatPage';
import { EventsPage } from './pages/EventsPage';
import { SettingsPage } from './pages/SettingsPage';
import { OAuthCallbackPage } from './pages/OAuthCallbackPage';
import { getCurrentUserSession } from './lib/cognito';
import { useAgentStore } from './stores/agentStore';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initializeErrorHandler } from './utils/errorHandler';
import { useAppSyncConnection } from './hooks/useAppSyncConnection';
import { CommandPalette, useCommandPalette } from './components/ui/CommandPalette';

function App() {
  const { user, isAuthenticated, setUser, setLoading, setError, logout } = useAuthStore();
  const { initializeStore, clearStore } = useAgentStore();

  // Initialize theme
  const initializeTheme = useThemeStore((state) => state.initialize);
  useEffect(() => {
    initializeTheme();
  }, [initializeTheme]);

  // Initialize error handler and check existing session
  useEffect(() => {
    initializeErrorHandler({ logout });

    const checkExistingSession = async () => {
      try {
        setLoading(true);
        const existingUser = await getCurrentUserSession();

        if (existingUser) {
          setUser(existingUser);
        }
      } catch (error) {
        console.error('Session check error:', error);
      } finally {
        setLoading(false);
      }
    };

    checkExistingSession();
  }, [setUser, setLoading, setError, logout]);

  // Initialize AgentStore when user is authenticated
  useEffect(() => {
    if (user) {
      console.log('👤 User authenticated, initializing AgentStore...');
      initializeStore();
    } else {
      console.log('👋 User logged out, clearing AgentStore...');
      clearStore();
    }
  }, [user, initializeStore, clearStore]);

  // Initialize shared AppSync WebSocket connection
  useAppSyncConnection();

  // Command Palette state
  const { isOpen: isCommandPaletteOpen, close: closeCommandPalette } = useCommandPalette();

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
        {/* Command Palette - Global */}
        {isAuthenticated && (
          <CommandPalette isOpen={isCommandPaletteOpen} onClose={closeCommandPalette} />
        )}
        {isAuthenticated ? (
          <div className="h-screen flex">
            <Routes>
              <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
              <Route element={<MainLayout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/chat/:sessionId" element={<ChatPage />} />
                <Route path="/chat/search" element={<SearchChatPage />} />
                <Route path="/agents" element={<AgentDirectoryPage />} />
                <Route path="/tools" element={<ToolsPage />} />
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
