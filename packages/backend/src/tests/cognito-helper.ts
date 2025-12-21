/**
 * Cognito 認証ヘルパー（テスト用）
 */

import { AuthenticationDetails, CognitoUser, CognitoUserPool } from 'amazon-cognito-identity-js';

export interface CognitoConfig {
  userPoolId: string;
  clientId: string;
  region: string;
}

export interface AuthResult {
  idToken: string;
  accessToken: string;
  refreshToken: string;
}

/**
 * Cognito認証のヘルパークラス
 */
export class CognitoAuthHelper {
  private userPool: CognitoUserPool;

  constructor(private config: CognitoConfig) {
    this.userPool = new CognitoUserPool({
      UserPoolId: config.userPoolId,
      ClientId: config.clientId,
    });
  }

  /**
   * ユーザーログイン
   */
  async login(username: string, password: string): Promise<AuthResult> {
    return new Promise((resolve, reject) => {
      const authenticationDetails = new AuthenticationDetails({
        Username: username,
        Password: password,
      });

      const cognitoUser = new CognitoUser({
        Username: username,
        Pool: this.userPool,
      });

      cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: (result) => {
          const idToken = result.getIdToken().getJwtToken();
          const accessToken = result.getAccessToken().getJwtToken();
          const refreshToken = result.getRefreshToken().getToken();

          console.log('✅ Cognito 認証成功:', {
            username,
            idTokenLength: idToken.length,
            accessTokenLength: accessToken.length,
          });

          resolve({
            idToken,
            accessToken,
            refreshToken,
          });
        },
        onFailure: (err) => {
          console.error('❌ Cognito 認証失敗:', err);
          reject(err);
        },
        newPasswordRequired: (userAttributes, requiredAttributes) => {
          console.log('🔐 新しいパスワードが必要:', {
            userAttributes,
            requiredAttributes,
          });
          reject(new Error('新しいパスワードが必要です'));
        },
      });
    });
  }

  /**
   * JWT トークンのデコード（デバッグ用）
   */
  decodeJWT(token: string): Record<string, unknown> | null {
    try {
      const parts = token.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      return payload;
    } catch (error) {
      console.error('JWT デコードエラー:', error);
      return null;
    }
  }

  /**
   * JWT トークンの有効期限チェック
   */
  isTokenExpired(token: string): boolean {
    const payload = this.decodeJWT(token);
    if (!payload || !payload.exp || typeof payload.exp !== 'number') return true;

    const now = Math.floor(Date.now() / 1000);
    return payload.exp < now;
  }
}
