import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  AuthFlowType,
  InitiateAuthCommandInput,
  InitiateAuthResponse,
} from "@aws-sdk/client-cognito-identity-provider";
import { config, logger } from "../config/index.js";

/**
 * Cognito認証の結果
 */
export interface CognitoAuthResult {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

/**
 * Cognito認証エラー
 */
export class CognitoAuthError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = "CognitoAuthError";
  }
}

/**
 * Cognito認証クライアント
 */
export class CognitoAuthClient {
  private readonly cognitoClient: CognitoIdentityProviderClient;
  private cachedTokens: CognitoAuthResult | null = null;
  private tokenExpiry: Date | null = null;

  constructor() {
    this.cognitoClient = new CognitoIdentityProviderClient({
      region: config.AWS_REGION,
    });

    logger.debug("Cognito認証クライアントを初期化しました", {
      region: config.AWS_REGION,
      userPoolId: config.COGNITO_USER_POOL_ID,
      clientId: config.COGNITO_CLIENT_ID,
    });
  }

  /**
   * ユーザー認証を実行
   */
  async authenticate(): Promise<CognitoAuthResult> {
    // キャッシュされたトークンが有効な場合は再利用
    if (this.cachedTokens && this.isTokenValid()) {
      logger.debug("キャッシュされたトークンを使用");
      return this.cachedTokens;
    }

    try {
      logger.info("Cognito認証を開始");

      const params: InitiateAuthCommandInput = {
        ClientId: config.COGNITO_CLIENT_ID,
        AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
        AuthParameters: {
          USERNAME: config.COGNITO_USERNAME,
          PASSWORD: config.COGNITO_PASSWORD,
        },
      };

      const command = new InitiateAuthCommand(params);
      const response: InitiateAuthResponse = await this.cognitoClient.send(
        command
      );

      if (!response.AuthenticationResult) {
        throw new CognitoAuthError("認証結果が取得できませんでした");
      }

      const authResult = response.AuthenticationResult;

      if (
        !authResult.AccessToken ||
        !authResult.IdToken ||
        !authResult.RefreshToken ||
        !authResult.ExpiresIn
      ) {
        throw new CognitoAuthError("必要なトークン情報が不足しています");
      }

      this.cachedTokens = {
        accessToken: authResult.AccessToken,
        idToken: authResult.IdToken,
        refreshToken: authResult.RefreshToken,
        expiresIn: authResult.ExpiresIn,
        tokenType: authResult.TokenType || "Bearer",
      };

      // トークンの有効期限を設定（5分のマージンを設ける）
      this.tokenExpiry = new Date(
        Date.now() + (authResult.ExpiresIn - 300) * 1000
      );

      logger.info("Cognito認証が完了しました", {
        expiresIn: authResult.ExpiresIn,
        tokenType: authResult.TokenType,
      });

      return this.cachedTokens;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "不明なエラー";
      logger.error("Cognito認証に失敗しました:", errorMessage);

      throw new CognitoAuthError(
        `Cognito認証に失敗しました: ${errorMessage}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * ID Tokenを取得
   */
  async getIdToken(): Promise<string> {
    const tokens = await this.authenticate();
    return tokens.idToken;
  }

  /**
   * Access Tokenを取得
   */
  async getAccessToken(): Promise<string> {
    const tokens = await this.authenticate();
    return tokens.accessToken;
  }

  /**
   * Authorization ヘッダー用の値を取得
   */
  async getAuthorizationHeader(): Promise<string> {
    const tokens = await this.authenticate();
    return `${tokens.tokenType} ${tokens.accessToken}`;
  }

  /**
   * トークンが有効かチェック
   */
  private isTokenValid(): boolean {
    return this.tokenExpiry ? this.tokenExpiry > new Date() : false;
  }

  /**
   * キャッシュされたトークンを無効化
   */
  invalidateTokens(): void {
    this.cachedTokens = null;
    this.tokenExpiry = null;
    logger.debug("トークンキャッシュを無効化しました");
  }

  /**
   * 認証状態を確認
   */
  isAuthenticated(): boolean {
    return this.cachedTokens !== null && this.isTokenValid();
  }
}

/**
 * シングルトンのCognito認証クライアント
 */
export const cognitoAuth = new CognitoAuthClient();
