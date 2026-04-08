/**
 * OAuth Callback API Routes
 * Handles OAuth 3LO (Authorization Code Flow) callback processing for AgentCore Identity.
 * After a user completes OAuth consent in the browser, this endpoint calls
 * CompleteResourceTokenAuth to store the token in AgentCore Token Vault.
 */

import express, { Response } from 'express';
import {
  BedrockAgentCoreClient,
  CompleteResourceTokenAuthCommand,
} from '@aws-sdk/client-bedrock-agentcore';
import { jwtAuthMiddleware, AuthenticatedRequest, getCurrentAuth } from '../middleware/auth.js';

const router = express.Router();

const client = new BedrockAgentCoreClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

/**
 * Complete OAuth 3LO token exchange
 * POST /oauth/complete
 *
 * After the user completes GitHub OAuth consent in the browser,
 * the frontend calls this endpoint with the session URI to finalize
 * the token exchange via AgentCore Identity.
 */
router.post('/complete', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    if (!auth.authenticated || !auth.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { sessionUri } = req.body;
    if (!sessionUri || typeof sessionUri !== 'string') {
      res.status(400).json({ error: 'sessionUri is required and must be a string' });
      return;
    }

    console.log('🔑 Completing OAuth 3LO token auth for user: %s', auth.userId);

    await client.send(
      new CompleteResourceTokenAuthCommand({
        sessionUri,
        userIdentifier: { userId: auth.userId },
      })
    );

    console.log('✅ OAuth 3LO token auth completed for user: %s', auth.userId);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ OAuth 3LO token auth failed:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to complete OAuth token exchange';
    res.status(500).json({ error: message });
  }
});

export default router;
