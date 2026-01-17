/**
 * Machine User Authentication
 * Client Credentials Flow for machine-to-machine authentication
 */

import fetch from 'node-fetch';
import type { MachineUserConfig } from '../config/index.js';

export interface MachineAuthResult {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Get access token using Client Credentials Flow
 */
export async function getMachineUserToken(config: MachineUserConfig): Promise<MachineAuthResult> {
  const tokenUrl = `https://${config.cognitoDomain}/oauth2/token`;
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    ...(config.scope && { scope: config.scope }),
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

    const data = (await response.json()) as TokenResponse;

    return {
      accessToken: data.access_token,
      tokenType: data.token_type,
      expiresIn: data.expires_in,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Machine user authentication error: ${error.message}`);
    }
    throw new Error('Unknown authentication error occurred');
  }
}

/**
 * Decode and get token payload for debugging
 */
export function getMachineTokenInfo(token: string): Record<string, unknown> | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload;
  } catch {
    return null;
  }
}

/**
 * Check if token is expired
 */
export function isMachineTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    const exp = payload.exp;
    const now = Math.floor(Date.now() / 1000);
    return exp < now;
  } catch {
    return true;
  }
}

/**
 * Token cache for machine user tokens
 */
class MachineTokenCache {
  private cache: Map<string, { token: MachineAuthResult; timestamp: number }> = new Map();

  set(key: string, token: MachineAuthResult): void {
    this.cache.set(key, {
      token,
      timestamp: Date.now(),
    });
  }

  get(key: string): MachineAuthResult | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    // Check token expiration with 5 minute buffer
    const expiresAt = cached.timestamp + cached.token.expiresIn * 1000;
    const bufferTime = 300 * 1000; // 5 minutes

    if (Date.now() + bufferTime > expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return cached.token;
  }

  clear(): void {
    this.cache.clear();
  }
}

export const machineTokenCache = new MachineTokenCache();

/**
 * Get cached machine user token
 */
export async function getCachedMachineUserToken(
  config: MachineUserConfig
): Promise<MachineAuthResult> {
  const cacheKey = `${config.cognitoDomain}:${config.clientId}`;

  // Try to get from cache
  const cached = machineTokenCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Get new token
  const token = await getMachineUserToken(config);
  machineTokenCache.set(cacheKey, token);

  return token;
}
