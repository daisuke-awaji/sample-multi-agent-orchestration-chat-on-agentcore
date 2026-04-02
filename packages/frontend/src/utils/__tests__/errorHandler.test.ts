/**
 * Unit tests for errorHandler.ts
 *
 * Focus: The refreshPromise sharing mechanism that prevents
 * concurrent 401 responses from triggering spurious logouts.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ---- Mocks ----

// Mock cognito module
vi.mock('../../lib/cognito', () => ({
  getValidAccessToken: vi.fn(),
}));

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn() },
}));

// Mock i18n
vi.mock('../../i18n', () => ({
  default: { t: (key: string) => key },
}));

// Import after mocks are set up
import { handleGlobalError, initializeErrorHandler } from '../errorHandler';
import { getValidAccessToken } from '../../lib/cognito';
import { ApiError, AuthenticationError } from '../../api/errors';

// ---- Helpers ----

function make401(): ApiError {
  return new ApiError('Unauthorized', 401, 'Unauthorized');
}

/** Create a controllable deferred promise */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ---- Tests ----

describe('errorHandler — attemptTokenRefresh', () => {
  const mockLogout = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    initializeErrorHandler({ logout: mockLogout });
  });

  // --------------------------------------------------
  // Basic: single 401
  // --------------------------------------------------
  it('should not logout when a single 401 is resolved by a successful refresh', async () => {
    (getValidAccessToken as Mock).mockResolvedValue('new-token');

    await handleGlobalError(make401());

    expect(getValidAccessToken).toHaveBeenCalledTimes(1);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('should logout when refresh returns null', async () => {
    (getValidAccessToken as Mock).mockResolvedValue(null);

    await handleGlobalError(make401());

    expect(getValidAccessToken).toHaveBeenCalledTimes(1);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('should logout when refresh throws an exception', async () => {
    (getValidAccessToken as Mock).mockRejectedValue(new Error('network error'));

    await handleGlobalError(make401());

    expect(getValidAccessToken).toHaveBeenCalledTimes(1);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  // --------------------------------------------------
  // Core: concurrent 401 — promise sharing
  // --------------------------------------------------
  it('should call getValidAccessToken only once for concurrent 401s (shared promise)', async () => {
    const d = deferred<string | null>();
    (getValidAccessToken as Mock).mockReturnValue(d.promise);

    // Fire 3 concurrent 401 errors
    const p1 = handleGlobalError(make401());
    const p2 = handleGlobalError(make401());
    const p3 = handleGlobalError(make401());

    // Resolve the single shared refresh
    d.resolve('new-token');
    await Promise.all([p1, p2, p3]);

    // getValidAccessToken should be called exactly once, not 3 times
    expect(getValidAccessToken).toHaveBeenCalledTimes(1);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('should not logout any caller when concurrent 401s share a successful refresh', async () => {
    const d = deferred<string | null>();
    (getValidAccessToken as Mock).mockReturnValue(d.promise);

    const promises = Array.from({ length: 5 }, () => handleGlobalError(make401()));

    d.resolve('fresh-token');
    await Promise.all(promises);

    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('should trigger logout when concurrent 401s share a failed refresh', async () => {
    const d = deferred<string | null>();
    (getValidAccessToken as Mock).mockReturnValue(d.promise);

    const promises = Array.from({ length: 3 }, () => handleGlobalError(make401()));

    d.resolve(null); // refresh failed
    await Promise.all(promises);

    // All 3 callers get false, but logout should still be called
    // (multiple calls are acceptable — the important thing is no crash)
    expect(mockLogout).toHaveBeenCalled();
  });

  it('should create a new promise after the previous refresh completes', async () => {
    // First batch
    const d1 = deferred<string | null>();
    (getValidAccessToken as Mock).mockReturnValue(d1.promise);

    const p1 = handleGlobalError(make401());
    d1.resolve('token-1');
    await p1;

    // Second batch — should create a new promise
    const d2 = deferred<string | null>();
    (getValidAccessToken as Mock).mockReturnValue(d2.promise);

    const p2 = handleGlobalError(make401());
    d2.resolve('token-2');
    await p2;

    expect(getValidAccessToken).toHaveBeenCalledTimes(2);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  // --------------------------------------------------
  // skipRefreshAttempt
  // --------------------------------------------------
  it('should skip refresh and logout immediately when skipRefreshAttempt is true', async () => {
    await handleGlobalError(make401(), true);

    expect(getValidAccessToken).not.toHaveBeenCalled();
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  // --------------------------------------------------
  // AuthenticationError
  // --------------------------------------------------
  it('should not logout on AuthenticationError when refresh succeeds', async () => {
    (getValidAccessToken as Mock).mockResolvedValue('refreshed-token');

    await handleGlobalError(new AuthenticationError('auth required'));

    expect(getValidAccessToken).toHaveBeenCalledTimes(1);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('should logout on AuthenticationError when refresh fails', async () => {
    (getValidAccessToken as Mock).mockResolvedValue(null);

    await handleGlobalError(new AuthenticationError('auth required'));

    expect(getValidAccessToken).toHaveBeenCalledTimes(1);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
