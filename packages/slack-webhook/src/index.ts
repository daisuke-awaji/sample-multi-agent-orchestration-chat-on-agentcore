/**
 * Slack Webhook to EventBridge Lambda Handler
 *
 * Receives Slack webhook events and forwards them to EventBridge default bus.
 * Handles Slack URL verification and signature validation.
 */

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import * as crypto from 'crypto';

const eventBridgeClient = new EventBridgeClient({});
const secretsManagerClient = new SecretsManagerClient({});

let cachedSigningSecret: string | null = null;

interface SlackEvent {
  type: string;
  challenge?: string;
  token?: string;
  team_id?: string;
  api_app_id?: string;
  event?: {
    type: string;
    user?: string;
    channel?: string;
    text?: string;
    ts?: string;
    [key: string]: unknown;
  };
  event_id?: string;
  event_time?: number;
  [key: string]: unknown;
}

/**
 * Get Slack Signing Secret from Secrets Manager (with caching)
 */
async function getSigningSecret(): Promise<string> {
  if (cachedSigningSecret) {
    return cachedSigningSecret;
  }

  const secretName = process.env.SLACK_SIGNING_SECRET_NAME;
  if (!secretName) {
    throw new Error('SLACK_SIGNING_SECRET_NAME environment variable not set');
  }

  const response = await secretsManagerClient.send(
    new GetSecretValueCommand({ SecretId: secretName })
  );

  if (!response.SecretString) {
    throw new Error('Slack signing secret not found in Secrets Manager');
  }

  cachedSigningSecret = response.SecretString;
  return cachedSigningSecret;
}

/**
 * Verify Slack request signature
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
async function verifySlackSignature(
  headers: Record<string, string | undefined>,
  body: string
): Promise<boolean> {
  const timestamp = headers['x-slack-request-timestamp'];
  const slackSignature = headers['x-slack-signature'];

  if (!timestamp || !slackSignature) {
    console.error('Missing Slack signature headers');
    return false;
  }

  // Check timestamp to prevent replay attacks (5 minutes tolerance)
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - parseInt(timestamp, 10)) > 300) {
    console.error('Request timestamp too old');
    return false;
  }

  const signingSecret = await getSigningSecret();
  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature =
    'v0=' + crypto.createHmac('sha256', signingSecret).update(sigBasestring).digest('hex');

  return crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(slackSignature));
}

/**
 * Send event to EventBridge
 */
async function sendToEventBridge(slackEvent: SlackEvent): Promise<void> {
  const eventType = slackEvent.event?.type || slackEvent.type || 'unknown';

  const command = new PutEventsCommand({
    Entries: [
      {
        Source: 'slack',
        DetailType: eventType,
        Detail: JSON.stringify(slackEvent),
        EventBusName: 'default',
      },
    ],
  });

  const response = await eventBridgeClient.send(command);

  if (response.FailedEntryCount && response.FailedEntryCount > 0) {
    console.error('Failed to send event to EventBridge:', response.Entries);
    throw new Error('Failed to send event to EventBridge');
  }

  console.log(`✅ Event sent to EventBridge: source=slack, detail-type=${eventType}`);
}

/**
 * Lambda handler
 */
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  console.log('Received request:', JSON.stringify(event, null, 2));

  try {
    const body = event.body || '';

    // Parse request body
    let slackEvent: SlackEvent;
    try {
      slackEvent = JSON.parse(body);
    } catch {
      console.error('Failed to parse request body');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON body' }),
      };
    }

    // Handle Slack URL verification challenge
    if (slackEvent.type === 'url_verification') {
      console.log('Handling URL verification challenge');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/plain' },
        body: slackEvent.challenge || '',
      };
    }

    // Verify Slack signature
    const headers: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(event.headers || {})) {
      headers[key.toLowerCase()] = value;
    }

    const isValid = await verifySlackSignature(headers, body);
    if (!isValid) {
      console.error('Invalid Slack signature');
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid signature' }),
      };
    }

    // Send event to EventBridge
    await sendToEventBridge(slackEvent);

    // Return 200 immediately (Slack expects quick response)
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true }),
    };
  } catch (error) {
    console.error('Error processing Slack webhook:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      }),
    };
  }
};
