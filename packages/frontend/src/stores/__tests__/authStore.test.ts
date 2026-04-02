/**
 * Unit tests for authStore.ts
 *
 * Strategy: Mock all cognito functions and test state transitions.
 * Zustand stores can be tested without React by using getState()/setState().
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ---- Mocks ----

vi.mock('../../lib/cognito', () => ({
  authenticateUser: vi.fn(),
  signOutUser: vi.fn(),
  signUpUser: vi.fn(),
  confirmSignUp: vi.fn(),
  resendConfirmationCode: vi.fn(),
  completeNewPasswordChallenge: vi.fn(),
}));

vi.mock('../../utils/logger', () => ({
  logger: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
}));

// Import after mocks
import { useAuthStore } from '../authStore';
import {
  authenticateUser,
  signOutUser,
  signUpUser,
  confirmSignUp,
  resendConfirmationCode,
  completeNewPasswordChallenge,
} from '../../lib/cognito';
import type { User } from '../../types/index';

// ---- Helpers ----

const mockUser: User = {
  userId: 'user-123',
  username: 'testuser',
  accessToken: 'access-token-abc',
  refreshToken: 'refresh-token-xyz',
};

const freshUser: User = {
  userId: 'user-123',
  username: 'testuser',
  accessToken: 'fresh-access-token',
  refreshToken: 'fresh-refresh-token',
};

function resetStore() {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    needsConfirmation: false,
    pendingUsername: null,
    needsNewPassword: false,
    pendingCognitoUser: null,
  });
}

// ---- Tests ----

describe('authStore', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  // ==========================================================
  // login
  // ==========================================================
  describe('login', () => {
    it('should set user and isAuthenticated on successful login', async () => {
      (authenticateUser as Mock).mockResolvedValue({
        type: 'success',
        user: mockUser,
      });

      await useAuthStore.getState().login('testuser', 'password');

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should set isLoading to true during login', async () => {
      let capturedLoading = false;

      (authenticateUser as Mock).mockImplementation(() => {
        capturedLoading = useAuthStore.getState().isLoading;
        return Promise.resolve({ type: 'success', user: mockUser });
      });

      await useAuthStore.getState().login('testuser', 'password');

      expect(capturedLoading).toBe(true);
    });

    it('should set needsNewPassword when NEW_PASSWORD_REQUIRED', async () => {
      const fakeCognitoUser = { getUsername: () => 'testuser' };

      (authenticateUser as Mock).mockResolvedValue({
        type: 'newPasswordRequired',
        cognitoUser: fakeCognitoUser,
        userAttributes: { email: 'test@example.com' },
      });

      await useAuthStore.getState().login('testuser', 'password');

      const state = useAuthStore.getState();
      expect(state.needsNewPassword).toBe(true);
      expect(state.pendingCognitoUser).toBe(fakeCognitoUser);
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
    });

    it('should set error and clear user on login failure', async () => {
      (authenticateUser as Mock).mockRejectedValue(new Error('Incorrect username or password'));

      await expect(useAuthStore.getState().login('testuser', 'wrong')).rejects.toThrow();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Incorrect username or password');
    });

    it('should clear previous error before login attempt', async () => {
      useAuthStore.setState({ error: 'previous error' });

      (authenticateUser as Mock).mockResolvedValue({
        type: 'success',
        user: mockUser,
      });

      await useAuthStore.getState().login('testuser', 'password');

      expect(useAuthStore.getState().error).toBeNull();
    });
  });

  // ==========================================================
  // logout
  // ==========================================================
  describe('logout', () => {
    it('should reset all state on logout', async () => {
      // Set up authenticated state
      useAuthStore.setState({
        user: mockUser,
        isAuthenticated: true,
        needsNewPassword: true,
        pendingCognitoUser: {} as never,
      });

      (signOutUser as Mock).mockResolvedValue(undefined);

      await useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.needsNewPassword).toBe(false);
      expect(state.pendingCognitoUser).toBeNull();
    });

    it('should call signOutUser when user exists', async () => {
      useAuthStore.setState({ user: mockUser, isAuthenticated: true });
      (signOutUser as Mock).mockResolvedValue(undefined);

      await useAuthStore.getState().logout();

      expect(signOutUser).toHaveBeenCalledTimes(1);
    });

    it('should not call signOutUser when user is null', async () => {
      useAuthStore.setState({ user: null });

      await useAuthStore.getState().logout();

      expect(signOutUser).not.toHaveBeenCalled();
    });

    it('should still reset state even if signOutUser throws', async () => {
      useAuthStore.setState({ user: mockUser, isAuthenticated: true });
      (signOutUser as Mock).mockRejectedValue(new Error('signout error'));

      await useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  // ==========================================================
  // signUp
  // ==========================================================
  describe('signUp', () => {
    it('should set needsConfirmation and pendingUsername on success', async () => {
      (signUpUser as Mock).mockResolvedValue(undefined);

      await useAuthStore.getState().signUp('newuser', 'password', 'new@example.com');

      const state = useAuthStore.getState();
      expect(state.needsConfirmation).toBe(true);
      expect(state.pendingUsername).toBe('newuser');
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should set error and clear confirmation state on failure', async () => {
      (signUpUser as Mock).mockRejectedValue(new Error('This username is already taken'));

      await expect(
        useAuthStore.getState().signUp('existing', 'password', 'e@example.com')
      ).rejects.toThrow();

      const state = useAuthStore.getState();
      expect(state.needsConfirmation).toBe(false);
      expect(state.pendingUsername).toBeNull();
      expect(state.error).toBe('This username is already taken');
    });
  });

  // ==========================================================
  // confirmSignUp
  // ==========================================================
  describe('confirmSignUp', () => {
    it('should clear confirmation state on success', async () => {
      useAuthStore.setState({ needsConfirmation: true, pendingUsername: 'newuser' });
      (confirmSignUp as Mock).mockResolvedValue(undefined);

      await useAuthStore.getState().confirmSignUp('newuser', '123456');

      const state = useAuthStore.getState();
      expect(state.needsConfirmation).toBe(false);
      expect(state.pendingUsername).toBeNull();
      expect(state.error).toBeNull();
    });

    it('should set error on failure', async () => {
      (confirmSignUp as Mock).mockRejectedValue(new Error('Incorrect confirmation code'));

      await expect(useAuthStore.getState().confirmSignUp('newuser', '000000')).rejects.toThrow();

      expect(useAuthStore.getState().error).toBe('Incorrect confirmation code');
    });
  });

  // ==========================================================
  // resendCode
  // ==========================================================
  describe('resendCode', () => {
    it('should complete without error on success', async () => {
      (resendConfirmationCode as Mock).mockResolvedValue(undefined);

      await useAuthStore.getState().resendCode('newuser');

      expect(useAuthStore.getState().isLoading).toBe(false);
      expect(useAuthStore.getState().error).toBeNull();
    });

    it('should set error on failure', async () => {
      (resendConfirmationCode as Mock).mockRejectedValue(new Error('User not found'));

      await expect(useAuthStore.getState().resendCode('nonexistent')).rejects.toThrow();

      expect(useAuthStore.getState().error).toBe('User not found');
    });
  });

  // ==========================================================
  // completeNewPassword
  // ==========================================================
  describe('completeNewPassword', () => {
    it('should set user and clear newPassword state on success', async () => {
      const fakeCognitoUser = { getUsername: () => 'testuser' };
      useAuthStore.setState({
        needsNewPassword: true,
        pendingCognitoUser: fakeCognitoUser as never,
      });

      (completeNewPasswordChallenge as Mock).mockResolvedValue(mockUser);

      await useAuthStore.getState().completeNewPassword('NewP@ssw0rd');

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.isAuthenticated).toBe(true);
      expect(state.needsNewPassword).toBe(false);
      expect(state.pendingCognitoUser).toBeNull();
    });

    it('should pass pendingCognitoUser to completeNewPasswordChallenge', async () => {
      const fakeCognitoUser = { getUsername: () => 'testuser' };
      useAuthStore.setState({
        needsNewPassword: true,
        pendingCognitoUser: fakeCognitoUser as never,
      });

      (completeNewPasswordChallenge as Mock).mockResolvedValue(mockUser);

      await useAuthStore.getState().completeNewPassword('NewP@ssw0rd');

      expect(completeNewPasswordChallenge).toHaveBeenCalledWith(fakeCognitoUser, 'NewP@ssw0rd');
    });

    it('should throw if pendingCognitoUser is null', async () => {
      useAuthStore.setState({ pendingCognitoUser: null });

      await expect(useAuthStore.getState().completeNewPassword('NewP@ssw0rd')).rejects.toThrow(
        'Password change session not found'
      );
    });

    it('should set error on failure', async () => {
      const fakeCognitoUser = { getUsername: () => 'testuser' };
      useAuthStore.setState({
        needsNewPassword: true,
        pendingCognitoUser: fakeCognitoUser as never,
      });

      (completeNewPasswordChallenge as Mock).mockRejectedValue(
        new Error('Password does not meet requirements')
      );

      await expect(useAuthStore.getState().completeNewPassword('weak')).rejects.toThrow();

      expect(useAuthStore.getState().error).toBe('Password does not meet requirements');
    });
  });

  // ==========================================================
  // setUser — token update scenario
  // ==========================================================
  describe('setUser', () => {
    it('should set user and isAuthenticated to true', () => {
      useAuthStore.getState().setUser(mockUser);

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.isAuthenticated).toBe(true);
    });

    it('should set isAuthenticated to false when user is null', () => {
      useAuthStore.setState({ user: mockUser, isAuthenticated: true });

      useAuthStore.getState().setUser(null);

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });

    it('should update accessToken when called with a refreshed user', () => {
      useAuthStore.setState({ user: mockUser, isAuthenticated: true });

      useAuthStore.getState().setUser(freshUser);

      const state = useAuthStore.getState();
      expect(state.user?.accessToken).toBe('fresh-access-token');
      expect(state.user?.refreshToken).toBe('fresh-refresh-token');
      expect(state.isAuthenticated).toBe(true);
    });
  });

  // ==========================================================
  // Helper actions
  // ==========================================================
  describe('helper actions', () => {
    it('setLoading should update isLoading', () => {
      useAuthStore.getState().setLoading(true);
      expect(useAuthStore.getState().isLoading).toBe(true);

      useAuthStore.getState().setLoading(false);
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it('setError should update error', () => {
      useAuthStore.getState().setError('Something went wrong');
      expect(useAuthStore.getState().error).toBe('Something went wrong');
    });

    it('clearError should set error to null', () => {
      useAuthStore.setState({ error: 'existing error' });

      useAuthStore.getState().clearError();

      expect(useAuthStore.getState().error).toBeNull();
    });

    it('setNeedsConfirmation should update state', () => {
      useAuthStore.getState().setNeedsConfirmation(true, 'pendingUser');

      const state = useAuthStore.getState();
      expect(state.needsConfirmation).toBe(true);
      expect(state.pendingUsername).toBe('pendingUser');
    });

    it('setNeedsNewPassword should update state', () => {
      const fakeCognitoUser = { getUsername: () => 'testuser' };

      useAuthStore.getState().setNeedsNewPassword(true, fakeCognitoUser as never);

      const state = useAuthStore.getState();
      expect(state.needsNewPassword).toBe(true);
      expect(state.pendingCognitoUser).toBe(fakeCognitoUser);
    });
  });
});
