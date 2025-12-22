import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { AuthState, User } from '../types/index';
import {
  authenticateUser,
  signOutUser,
  signUpUser,
  confirmSignUp,
  resendConfirmationCode,
} from '../lib/cognito';

interface AuthActions {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  signUp: (username: string, password: string, email: string) => Promise<void>;
  confirmSignUp: (username: string, code: string) => Promise<void>;
  resendCode: (username: string) => Promise<void>;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  setNeedsConfirmation: (needs: boolean, username?: string) => void;
}

type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>()(
  devtools(
    persist(
      (set, get) => ({
        // State
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
        needsConfirmation: false,
        pendingUsername: null,

        // Actions
        login: async (username: string, password: string) => {
          try {
            set({ isLoading: true, error: null });

            const user = await authenticateUser(username, password);

            set({
              user,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '認証に失敗しました';
            set({
              user: null,
              isAuthenticated: false,
              isLoading: false,
              error: errorMessage,
            });
            throw error;
          }
        },

        logout: async () => {
          try {
            set({ isLoading: true });

            const { user } = get();
            if (user) {
              await signOutUser();
            }

            set({
              user: null,
              isAuthenticated: false,
              isLoading: false,
              error: null,
            });
          } catch (error) {
            console.error('Logout error:', error);
            // ログアウトエラーでも状態はクリアする
            set({
              user: null,
              isAuthenticated: false,
              isLoading: false,
              error: null,
            });
          }
        },

        setUser: (user: User | null) => {
          set({
            user,
            isAuthenticated: !!user,
          });
        },

        setLoading: (loading: boolean) => {
          set({ isLoading: loading });
        },

        setError: (error: string | null) => {
          set({ error });
        },

        signUp: async (username: string, password: string, email: string) => {
          try {
            set({ isLoading: true, error: null });

            await signUpUser(username, password, email);

            set({
              isLoading: false,
              error: null,
              needsConfirmation: true,
              pendingUsername: username,
            });
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'サインアップに失敗しました';
            set({
              isLoading: false,
              error: errorMessage,
              needsConfirmation: false,
              pendingUsername: null,
            });
            throw error;
          }
        },

        confirmSignUp: async (username: string, code: string) => {
          try {
            set({ isLoading: true, error: null });

            await confirmSignUp(username, code);

            set({
              isLoading: false,
              error: null,
              needsConfirmation: false,
              pendingUsername: null,
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '確認に失敗しました';
            set({
              isLoading: false,
              error: errorMessage,
            });
            throw error;
          }
        },

        resendCode: async (username: string) => {
          try {
            set({ isLoading: true, error: null });

            await resendConfirmationCode(username);

            set({
              isLoading: false,
              error: null,
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '再送に失敗しました';
            set({
              isLoading: false,
              error: errorMessage,
            });
            throw error;
          }
        },

        setNeedsConfirmation: (needs: boolean, username?: string) => {
          set({
            needsConfirmation: needs,
            pendingUsername: username || null,
          });
        },

        clearError: () => {
          set({ error: null });
        },
      }),
      {
        name: 'agentcore-auth',
        partialize: (state) => ({
          user: state.user,
          isAuthenticated: state.isAuthenticated,
          needsConfirmation: state.needsConfirmation,
          pendingUsername: state.pendingUsername,
        }),
      }
    ),
    {
      name: 'auth-store',
    }
  )
);
