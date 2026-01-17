/**
 * Integration Test for Trigger Lambda Handler
 *
 * This test connects to real AWS resources:
 * - Cognito User Pool (for Machine User authentication)
 * - DynamoDB (Triggers table)
 * - Agent API (Runtime invocation endpoint)
 *
 * Prerequisites:
 * - .env file must be configured with valid credentials
 * - AWS credentials must be available (AWS_PROFILE or environment variables)
 * - DynamoDB table must exist
 * - Cognito User Pool and Machine User client must be configured
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { config } from 'dotenv';
import { handler } from '../index.js';

// Load environment variables from .env file (override existing environment)
config({ override: true });

// Force AWS_REGION to match .env file (override system environment)
if (process.env.AWS_REGION) {
  process.env.AWS_DEFAULT_REGION = process.env.AWS_REGION;
}

describe('Trigger Lambda Integration Test', () => {
  beforeAll(() => {
    // Verify required environment variables
    const required = [
      'COGNITO_DOMAIN',
      'COGNITO_CLIENT_ID',
      'COGNITO_CLIENT_SECRET',
      'AGENT_API_URL',
      'TRIGGERS_TABLE_NAME',
      'AWS_REGION',
    ];

    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missing.join(', ')}\n` +
          'Please ensure .env file is configured correctly.'
      );
    }

    console.log('Environment variables loaded:');
    console.log('- COGNITO_DOMAIN:', process.env.COGNITO_DOMAIN);
    console.log('- COGNITO_CLIENT_ID:', process.env.COGNITO_CLIENT_ID);
    console.log('- AGENT_API_URL:', process.env.AGENT_API_URL);
    console.log('- TRIGGERS_TABLE_NAME:', process.env.TRIGGERS_TABLE_NAME);
    console.log('- AWS_REGION:', process.env.AWS_REGION);
  });

  test('should successfully invoke handler with EventBridge Scheduler event', async () => {
    // Test event provided by the user
    const event = {
      version: '0',
      id: 'trigger-epB5aPbTjrFGymD3ws9q3',
      'detail-type': 'Scheduled Event',
      source: 'agentcore.trigger',
      account: '123456789012',
      time: '2026-01-15T06:09:07.023Z',
      region: 'ap-northeast-1',
      resources: [],
      detail: {
        triggerId: 'epB5aPbTjrFGymD3ws9q3',
        userId: '47547a38-70e1-7026-e25f-bbdc98c68d68',
        agentId: '43a0a96c-8bc0-4e4f-8a2c-530d02af79d4',
        prompt: 'Hi',
      },
    };

    console.log('\n=== Starting Integration Test ===');
    console.log('Event:', JSON.stringify(event, null, 2));

    // Execute the handler
    const response = await handler(event);

    console.log('\n=== Handler Response ===');
    console.log(JSON.stringify(response, null, 2));

    // Assertions
    expect(response).toBeDefined();
    expect(response.statusCode).toBeDefined();
    expect(response.body).toBeDefined();

    // Parse response body
    const body = JSON.parse(response.body);
    console.log('\n=== Response Body ===');
    console.log(JSON.stringify(body, null, 2));

    // Success case
    expect(body.success).toBe(true);
    expect(body.triggerId).toBe(event.detail.triggerId);
    expect(body.executionId).toBeDefined();
    expect(body.requestId).toBeDefined();

    console.log('\n✅ Test PASSED: Agent invocation succeeded');
    console.log('Execution ID:', body.executionId);
    console.log('Request ID:', body.requestId);
    if (body.sessionId) {
      console.log('Session ID:', body.sessionId);
    }
  }, 60000); // 60 second timeout for integration test

  //   test('should handle authentication flow correctly', async () => {
  //     const event = {
  //       version: '0',
  //       id: 'test-auth-flow',
  //       'detail-type': 'Scheduled Event',
  //       source: 'agentcore.trigger',
  //       time: new Date().toISOString(),
  //       region: 'ap-northeast-1',
  //       resources: [],
  //       detail: {
  //         triggerId: 'test-trigger-auth',
  //         userId: '47547a38-70e1-7026-e25f-bbdc98c68d68',
  //         agentId: '43a0a96c-8bc0-4e4f-8a2c-530d02af79d4',
  //         prompt: 'Test authentication',
  //       },
  //     };

  //     console.log('\n=== Testing Authentication Flow ===');

  //     const response = await handler(event);
  //     const body = JSON.parse(response.body);

  //     console.log('Response Status:', response.statusCode);
  //     console.log('Response Body:', JSON.stringify(body, null, 2));

  //     // Authentication should either succeed or fail with specific error
  //     expect(response.statusCode).toBeGreaterThanOrEqual(200);
  //     expect(response.statusCode).toBeLessThan(600);

  //     if (response.statusCode === 500 && body.error === 'Authentication failed') {
  //       console.log('\n⚠️ Authentication failed - check Cognito credentials');
  //     } else if (response.statusCode === 500 && body.error === 'Agent invocation failed') {
  //       console.log('\n⚠️ Agent invocation failed - authentication succeeded but API call failed');
  //     } else if (response.statusCode === 200) {
  //       console.log('\n✅ Full flow succeeded including authentication');
  //     }
  //   }, 60000);

  //   test('should handle invalid event payload gracefully', async () => {
  //     const invalidEvent = {
  //       version: '0',
  //       id: 'test-invalid',
  //       'detail-type': 'Scheduled Event',
  //       source: 'agentcore.trigger',
  //       time: new Date().toISOString(),
  //       region: 'ap-northeast-1',
  //       resources: [],
  //       detail: {
  //         // Missing required fields
  //         triggerId: 'test-invalid',
  //       },
  //     };

  //     console.log('\n=== Testing Invalid Payload Handling ===');

  //     const response = await handler(invalidEvent);
  //     const body = JSON.parse(response.body);

  //     console.log('Response Status:', response.statusCode);
  //     console.log('Response Body:', JSON.stringify(body, null, 2));

  //     // Should return 400 Bad Request for invalid payload
  //     expect(response.statusCode).toBe(400);
  //     expect(body.error).toContain('Missing required fields');

  //     console.log('\n✅ Invalid payload handled correctly with 400 error');
  //   }, 30000);
});
