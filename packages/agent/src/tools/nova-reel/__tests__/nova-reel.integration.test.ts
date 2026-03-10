/**
 * Nova Reel Tool Integration Tests
 *
 * Note: These tests require AWS credentials and will incur costs.
 * Set ENABLE_NOVA_REEL_INTEGRATION_TESTS=true to run.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { novaReelTool } from '../tool.js';

// Helper to invoke the tool's callback and parse the JSON result
async function executeNovaReel(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  // The tool's callback returns a JSON string; parse it back to an object
  const raw = await (
    novaReelTool as unknown as { callback: (input: Record<string, unknown>) => Promise<string> }
  ).callback(input);
  return JSON.parse(raw) as Record<string, unknown>;
}

const ENABLE_TESTS = process.env.ENABLE_NOVA_REEL_INTEGRATION_TESTS === 'true';

const describeOrSkip = ENABLE_TESTS ? describe : describe.skip;

describeOrSkip('Nova Reel Tool Integration Tests', () => {
  let testInvocationArn: string | undefined;

  beforeAll(() => {
    // Ensure required environment variables are set
    if (!process.env.USER_STORAGE_BUCKET_NAME) {
      console.warn('USER_STORAGE_BUCKET_NAME not set, S3 storage tests will be skipped');
    }
  });

  afterAll(() => {
    // Cleanup if needed
  });

  describe('start action', () => {
    it('should start a video generation job', async () => {
      const result = await executeNovaReel({
        action: 'start',
        prompt: 'A beautiful sunset over the ocean with waves gently rolling onto the beach',
        duration: 6,
        dimension: '1280x720',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('start');
      expect(result.invocationArn).toBeTruthy();
      expect(result.status).toBe('InProgress');

      // Save for later tests
      if ('invocationArn' in result && result.invocationArn) {
        testInvocationArn = result.invocationArn as string;
      }
    }, 30000);

    it('should return error when prompt is missing', async () => {
      const result = await executeNovaReel({
        action: 'start',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('required');
    });
  });

  describe('status action', () => {
    it('should get job status', async () => {
      if (!testInvocationArn) {
        console.log('Skipping: No invocation ARN from previous test');
        return;
      }

      const result = await executeNovaReel({
        action: 'status',
        invocationArn: testInvocationArn,
      });

      expect(result.action).toBe('status');
      expect(result.invocationArn).toBe(testInvocationArn);
      expect(['InProgress', 'Completed', 'Failed']).toContain(result.status);
    }, 10000);

    it('should return error when invocationArn is missing', async () => {
      const result = await executeNovaReel({
        action: 'status',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('required');
    });
  });

  describe('list action', () => {
    it('should list video generation jobs', async () => {
      const result = await executeNovaReel({
        action: 'list',
        maxResults: 5,
      });

      expect(result.action).toBe('list');
      expect(Array.isArray((result as { jobs: unknown[] }).jobs)).toBe(true);
      expect(typeof (result as { count: number }).count).toBe('number');
    }, 10000);

    it('should filter jobs by status', async () => {
      const result = await executeNovaReel({
        action: 'list',
        statusFilter: 'Completed',
        maxResults: 5,
      });

      expect(result.action).toBe('list');
      const jobs = (result as { jobs: Array<{ status: string }> }).jobs;
      jobs.forEach((job) => {
        expect(job.status).toBe('Completed');
      });
    }, 10000);
  });

  describe('waitForCompletion', () => {
    it.skip('should wait for job completion (long running test)', async () => {
      // This test takes ~90 seconds for a 6-second video
      const result = await executeNovaReel({
        action: 'start',
        prompt: 'A cat playing with a ball of yarn',
        duration: 6,
        waitForCompletion: true,
        pollingInterval: 15,
        maxWaitTime: 300,
      });

      expect(result.action).toBe('start');
      expect(['Completed', 'Failed', 'InProgress']).toContain(result.status);

      if (result.status === 'Completed') {
        expect(result.outputS3Uri).toBeTruthy();
      }
    }, 360000); // 6 minutes timeout
  });
});

describe('Nova Reel Tool Unit Tests', () => {
  describe('parameter validation', () => {
    it('should have correct tool name', () => {
      expect(novaReelTool.name).toBe('nova_reel');
    });

    it('should have description', () => {
      expect(novaReelTool.description).toBeTruthy();
      expect(novaReelTool.description).toContain('Nova Reel');
    });
  });
});
