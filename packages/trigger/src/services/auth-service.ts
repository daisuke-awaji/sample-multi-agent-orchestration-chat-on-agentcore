/**
 * Authentication service for obtaining Machine User tokens
 */

/**
 * Configuration for Machine User authentication
 */
interface MachineUserConfig {
  cognitoDomain: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
}

/**
 * Machine User token response
 */
interface TokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}

/**
 * OAuth2 Token Response from Cognito
 */
interface OAuth2TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Service for obtaining Machine User authentication tokens
 */
export class AuthService {
  private readonly config: MachineUserConfig;

  constructor(config: MachineUserConfig) {
    this.config = config;
  }

  /**
   * Obtain Machine User token using OAuth2 Client Credentials flow
   */
  async getMachineUserToken(): Promise<TokenResponse> {
    const tokenUrl = `https://${this.config.cognitoDomain}/oauth2/token`;
    const credentials = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString(
      'base64'
    );

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      ...(this.config.scope && { scope: this.config.scope }),
    });

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Token request failed: ${response.status} ${response.statusText}\n${errorText}`
        );
      }

      const data = (await response.json()) as OAuth2TokenResponse;

      return {
        accessToken: data.access_token,
        tokenType: data.token_type,
        expiresIn: data.expires_in,
      };
    } catch (error) {
      console.error('Failed to obtain Machine User token:', error);
      throw new Error(
        'Authentication failed: ' + (error instanceof Error ? error.message : String(error))
      );
    }
  }

  /**
   * Create AuthService from environment variables
   */
  static fromEnvironment(): AuthService {
    const cognitoDomain = process.env.COGNITO_DOMAIN;
    const clientId = process.env.COGNITO_CLIENT_ID;
    const clientSecret = process.env.COGNITO_CLIENT_SECRET;
    const scope = process.env.COGNITO_SCOPE;

    if (!cognitoDomain || !clientId || !clientSecret) {
      throw new Error('Missing required environment variables for Machine User authentication');
    }

    return new AuthService({
      cognitoDomain,
      clientId,
      clientSecret,
      scope,
    });
  }
}
