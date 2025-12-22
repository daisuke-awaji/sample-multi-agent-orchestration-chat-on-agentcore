import {
  CognitoUserPool,
  CognitoUser,
  CognitoUserAttribute,
  AuthenticationDetails,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';
import type { User } from '../types/index';

// Cognito エラー型定義
interface CognitoError extends Error {
  code?: string;
  name: string;
}

// Cognito設定（環境変数から取得）
const USER_POOL_ID = import.meta.env.VITE_COGNITO_USER_POOL_ID || '';
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID || '';
const AWS_REGION = import.meta.env.VITE_AWS_REGION || 'us-east-1';

// User Pool インスタンス
const userPool = new CognitoUserPool({
  UserPoolId: USER_POOL_ID,
  ClientId: CLIENT_ID,
});

/**
 * ユーザー認証を行う
 */
export const authenticateUser = async (username: string, password: string): Promise<User> => {
  return new Promise((resolve, reject) => {
    const authenticationDetails = new AuthenticationDetails({
      Username: username,
      Password: password,
    });

    const cognitoUser = new CognitoUser({
      Username: username,
      Pool: userPool,
    });

    cognitoUser.authenticateUser(authenticationDetails, {
      onSuccess: (session: CognitoUserSession) => {
        const accessToken = session.getAccessToken().getJwtToken();
        const refreshToken = session.getRefreshToken().getToken();
        const idToken = session.getIdToken().getJwtToken();

        const user: User = {
          username,
          accessToken,
          refreshToken,
          idToken,
        };

        resolve(user);
      },
      onFailure: (err) => {
        let errorMessage = 'ログインに失敗しました';

        if (err.code === 'NotAuthorizedException') {
          errorMessage = 'ユーザー名またはパスワードが間違っています';
        } else if (err.code === 'UserNotConfirmedException') {
          errorMessage = 'ユーザーが確認されていません';
        } else if (err.code === 'PasswordResetRequiredException') {
          errorMessage = 'パスワードのリセットが必要です';
        } else if (err.code === 'UserNotFoundException') {
          errorMessage = 'ユーザーが見つかりません';
        } else if (err.message) {
          errorMessage = err.message;
        }

        reject(new Error(errorMessage));
      },
    });
  });
};

/**
 * ユーザーをサインアウトする
 */
export const signOutUser = async (): Promise<void> => {
  return new Promise((resolve) => {
    const cognitoUser = userPool.getCurrentUser();
    if (cognitoUser) {
      cognitoUser.signOut();
    }
    resolve();
  });
};

/**
 * 現在のユーザーセッションを取得する
 */
export const getCurrentUserSession = async (): Promise<User | null> => {
  return new Promise((resolve) => {
    const cognitoUser = userPool.getCurrentUser();

    if (!cognitoUser) {
      resolve(null);
      return;
    }

    cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session || !session.isValid()) {
        resolve(null);
        return;
      }

      const accessToken = session.getAccessToken().getJwtToken();
      const refreshToken = session.getRefreshToken().getToken();
      const idToken = session.getIdToken().getJwtToken();

      const user: User = {
        username: cognitoUser.getUsername(),
        accessToken,
        refreshToken,
        idToken,
      };

      resolve(user);
    });
  });
};

/**
 * トークンを更新する
 */
export const refreshTokens = async (): Promise<User | null> => {
  return new Promise((resolve, reject) => {
    const cognitoUser = userPool.getCurrentUser();

    if (!cognitoUser) {
      resolve(null);
      return;
    }

    cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session) {
        reject(new Error('セッションの取得に失敗しました'));
        return;
      }

      const refreshToken = session.getRefreshToken();

      cognitoUser.refreshSession(refreshToken, (refreshErr, newSession) => {
        if (refreshErr) {
          reject(new Error('トークンの更新に失敗しました'));
          return;
        }

        const accessToken = newSession.getAccessToken().getJwtToken();
        const newRefreshToken = newSession.getRefreshToken().getToken();
        const idToken = newSession.getIdToken().getJwtToken();

        const user: User = {
          username: cognitoUser.getUsername(),
          accessToken,
          refreshToken: newRefreshToken,
          idToken,
        };

        resolve(user);
      });
    });
  });
};

/**
 * 有効なアクセストークンを取得する（必要に応じて自動リフレッシュ）
 * getSession() は期限切れトークンを自動的にリフレッシュしてくれる
 */
export const getValidAccessToken = async (): Promise<string | null> => {
  return new Promise((resolve) => {
    const cognitoUser = userPool.getCurrentUser();

    if (!cognitoUser) {
      console.warn('🔒 認証されたユーザーが見つかりません');
      resolve(null);
      return;
    }

    // getSession() は内部で期限切れチェック & 自動リフレッシュを行う
    cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err) {
        console.warn('🔒 セッション取得エラー:', err.message);
        resolve(null);
        return;
      }

      if (!session || !session.isValid()) {
        console.warn('🔒 無効なセッション');
        resolve(null);
        return;
      }

      const accessToken = session.getAccessToken().getJwtToken();
      console.log('✅ 有効なアクセストークンを取得');
      resolve(accessToken);
    });
  });
};

/**
 * 有効なユーザー情報を取得する（必要に応じて自動リフレッシュ）
 */
export const getValidUser = async (): Promise<User | null> => {
  return new Promise((resolve) => {
    const cognitoUser = userPool.getCurrentUser();

    if (!cognitoUser) {
      resolve(null);
      return;
    }

    cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session || !session.isValid()) {
        resolve(null);
        return;
      }

      const user: User = {
        username: cognitoUser.getUsername(),
        accessToken: session.getAccessToken().getJwtToken(),
        refreshToken: session.getRefreshToken().getToken(),
        idToken: session.getIdToken().getJwtToken(),
      };

      resolve(user);
    });
  });
};

/**
 * 新規ユーザーを登録する
 */
export const signUpUser = async (
  username: string,
  password: string,
  email: string
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const attributeList = [
      new CognitoUserAttribute({
        Name: 'email',
        Value: email,
      }),
    ];

    userPool.signUp(username, password, attributeList, [], (err) => {
      if (err) {
        let errorMessage = 'サインアップに失敗しました';

        const cognitoError = err as CognitoError;
        if (cognitoError.code === 'UsernameExistsException') {
          errorMessage = 'このユーザー名は既に使用されています';
        } else if (cognitoError.code === 'InvalidPasswordException') {
          errorMessage = 'パスワードが要件を満たしていません';
        } else if (cognitoError.code === 'InvalidParameterException') {
          errorMessage = '入力値が正しくありません';
        } else if (err.message) {
          errorMessage = err.message;
        }

        reject(new Error(errorMessage));
        return;
      }

      resolve();
    });
  });
};

/**
 * サインアップの確認コードを検証する
 */
export const confirmSignUp = async (username: string, code: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({
      Username: username,
      Pool: userPool,
    });

    cognitoUser.confirmRegistration(code, true, (err) => {
      if (err) {
        let errorMessage = '確認に失敗しました';

        const cognitoError = err as CognitoError;
        if (cognitoError.code === 'CodeMismatchException') {
          errorMessage = '確認コードが正しくありません';
        } else if (cognitoError.code === 'ExpiredCodeException') {
          errorMessage = '確認コードの有効期限が切れています';
        } else if (cognitoError.code === 'UserNotFoundException') {
          errorMessage = 'ユーザーが見つかりません';
        } else if (err.message) {
          errorMessage = err.message;
        }

        reject(new Error(errorMessage));
        return;
      }

      resolve();
    });
  });
};

/**
 * 確認コードを再送する
 */
export const resendConfirmationCode = async (username: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({
      Username: username,
      Pool: userPool,
    });

    cognitoUser.resendConfirmationCode((err) => {
      if (err) {
        let errorMessage = '確認コードの再送に失敗しました';

        const cognitoError = err as CognitoError;
        if (cognitoError.code === 'UserNotFoundException') {
          errorMessage = 'ユーザーが見つかりません';
        } else if (cognitoError.code === 'InvalidParameterException') {
          errorMessage = 'ユーザーは既に確認済みです';
        } else if (err.message) {
          errorMessage = err.message;
        }

        reject(new Error(errorMessage));
        return;
      }

      resolve();
    });
  });
};

/**
 * Cognito設定を取得する
 */
export const getCognitoConfig = () => ({
  userPoolId: USER_POOL_ID,
  clientId: CLIENT_ID,
  region: AWS_REGION,
});
