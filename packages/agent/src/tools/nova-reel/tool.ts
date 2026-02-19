/**
 * Amazon Nova Reel Tool - Generate videos using text prompts
 */

import { tool } from '@strands-agents/sdk';
import {
  BedrockRuntimeClient,
  StartAsyncInvokeCommand,
  GetAsyncInvokeCommand,
  ListAsyncInvokesCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { S3Client, CopyObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { novaReelDefinition } from '@moca/tool-definitions';
import { logger } from '../../config/index.js';
import { getCurrentContext, getCurrentStoragePath } from '../../context/request-context.js';
import type {
  VideoDuration,
  VideoDimension,
  JobStatus,
  SortOrder,
  StartVideoOutput,
  StatusOutput,
  ListJobsOutput,
} from './types.js';

// Model configuration
const NOVA_REEL_MODEL_ID = 'amazon.nova-reel-v1:1';
const NOVA_REEL_REGION = 'us-east-1';

// Default values
const DEFAULT_DURATION: VideoDuration = 6;
const DEFAULT_DIMENSION: VideoDimension = '1280x720';
const DEFAULT_FPS = 24;
const DEFAULT_POLLING_INTERVAL = 30; // seconds
const DEFAULT_MAX_WAIT_TIME = 1200; // seconds (20 minutes)

// Create Bedrock Runtime client for Nova Reel region
const bedrockClient = new BedrockRuntimeClient({ region: NOVA_REEL_REGION });

// Create S3 client
const s3Client = new S3Client({ region: process.env.AWS_REGION });

/**
 * Generate a timestamp-based filename
 */
function generateFilename(seed?: number): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const seedStr = seed !== undefined ? `-seed-${seed}` : '';
  return `video-${timestamp}${seedStr}.mp4`;
}

/**
 * Get estimated completion time based on duration
 */
function getEstimatedTime(duration: number): string {
  if (duration <= 6) {
    return 'approximately 90 seconds';
  }
  return 'approximately 14-17 minutes';
}

/**
 * Get temporary S3 bucket for video output
 */
function getTempOutputBucket(): string {
  const bucket = process.env.USER_STORAGE_BUCKET_NAME;
  if (!bucket) {
    throw new Error('USER_STORAGE_BUCKET_NAME is not configured');
  }
  return bucket;
}

/**
 * Get temporary S3 prefix for video output
 */
function getTempOutputPrefix(userId: string): string {
  return `temp/nova-reel/${userId}/${Date.now()}`;
}

/**
 * Copy video from temp location to user storage
 */
async function copyVideoToUserStorage(
  sourceS3Uri: string,
  userId: string,
  outputPath?: string
): Promise<string> {
  try {
    const bucketName = process.env.USER_STORAGE_BUCKET_NAME;
    if (!bucketName) {
      logger.warn('[NOVA_REEL] S3 bucket not configured, skipping video copy');
      return '';
    }

    // Parse source S3 URI
    const sourceMatch = sourceS3Uri.match(/^s3:\/\/([^/]+)\/(.+)$/);
    if (!sourceMatch) {
      logger.warn(`[NOVA_REEL] Invalid source S3 URI: ${sourceS3Uri}`);
      return '';
    }

    const [, sourceBucket, sourceKey] = sourceMatch;

    // Nova Reel outputs video as output.mp4 in the specified directory
    const videoSourceKey = sourceKey.endsWith('/')
      ? `${sourceKey}output.mp4`
      : `${sourceKey}/output.mp4`;

    // Check if source video exists
    try {
      await s3Client.send(
        new HeadObjectCommand({
          Bucket: sourceBucket,
          Key: videoSourceKey,
        })
      );
    } catch {
      logger.warn(`[NOVA_REEL] Source video not found: s3://${sourceBucket}/${videoSourceKey}`);
      return '';
    }

    // Get user's allowed storage path
    const allowedStoragePath = getCurrentStoragePath();
    const basePath = `users/${userId}/${allowedStoragePath}/videos`;
    const filename = outputPath || generateFilename();
    const destKey = `${basePath}/${filename}`.replace(/\/+/g, '/');

    // Copy to user storage
    const copyCommand = new CopyObjectCommand({
      Bucket: bucketName,
      Key: destKey,
      CopySource: `${sourceBucket}/${videoSourceKey}`,
      MetadataDirective: 'REPLACE',
      ContentType: 'video/mp4',
      Metadata: {
        'generated-by': 'nova-reel',
        'generated-at': new Date().toISOString(),
        'source-uri': sourceS3Uri,
      },
    });

    await s3Client.send(copyCommand);

    const s3Path = `s3://${bucketName}/${destKey}`;
    logger.info(`[NOVA_REEL] Video copied to user storage: ${s3Path}`);

    return s3Path;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[NOVA_REEL] Failed to copy video to user storage: ${errorMessage}`);
    return '';
  }
}

/**
 * Get user-friendly S3 path for display
 */
function getDisplayPath(s3Path: string, userId: string): string {
  // Use string operations instead of dynamic RegExp to avoid ReDoS concerns
  const prefix = `users/${userId}/`;
  if (s3Path.includes(prefix)) {
    const index = s3Path.indexOf(prefix);
    const relativePath = s3Path.substring(index + prefix.length);
    if (relativePath) {
      return `/${relativePath}`;
    }
  }
  return s3Path;
}

/**
 * Detect image format from base64 string
 */
function detectImageFormat(base64: string): 'png' | 'jpeg' | 'gif' | 'webp' {
  if (base64.startsWith('/9j/')) return 'jpeg';
  if (base64.startsWith('iVBORw')) return 'png';
  if (base64.startsWith('R0lGOD')) return 'gif';
  if (base64.startsWith('UklGR')) return 'webp';
  return 'png'; // Default to PNG
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Start a video generation job
 */
async function startVideoGeneration(
  prompt: string,
  options: {
    negativePrompt?: string;
    imageBase64?: string;
    duration?: VideoDuration;
    dimension?: VideoDimension;
    fps?: number;
    seed?: number;
    outputPath?: string;
    waitForCompletion?: boolean;
    pollingInterval?: number;
    maxWaitTime?: number;
  }
): Promise<StartVideoOutput> {
  const context = getCurrentContext();
  const userId = context?.userId || 'anonymous';

  const duration = options.duration || DEFAULT_DURATION;
  const dimension = options.dimension || DEFAULT_DIMENSION;
  const fps = options.fps || DEFAULT_FPS;
  const seed = options.seed !== undefined ? options.seed : Math.floor(Math.random() * 2147483646);

  logger.info(`[NOVA_REEL] Starting video generation for user: ${userId}`);
  logger.debug(
    `[NOVA_REEL] Parameters: prompt="${prompt}", duration=${duration}s, dimension=${dimension}`
  );

  try {
    // Build request body - using generic object type for API compatibility
    const requestBody: Record<string, unknown> = {
      taskType: 'TEXT_VIDEO',
      textToVideoParams: {
        text: prompt,
      },
      videoGenerationConfig: {
        durationSeconds: duration,
        fps,
        dimension,
        seed,
      },
    };

    // Add image if provided (for Image-to-Video)
    if (options.imageBase64) {
      const format = detectImageFormat(options.imageBase64);
      (requestBody.textToVideoParams as Record<string, unknown>).images = [
        {
          format,
          source: {
            bytes: options.imageBase64,
          },
        },
      ];
    }

    // Setup output S3 location
    const outputBucket = getTempOutputBucket();
    const outputPrefix = getTempOutputPrefix(userId);
    const outputS3Uri = `s3://${outputBucket}/${outputPrefix}/`;

    // Start async invocation
    const command = new StartAsyncInvokeCommand({
      modelId: NOVA_REEL_MODEL_ID,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      modelInput: requestBody as any,
      outputDataConfig: {
        s3OutputDataConfig: {
          s3Uri: outputS3Uri,
        },
      },
    });

    const response = await bedrockClient.send(command);
    const invocationArn = response.invocationArn!;

    logger.info(`[NOVA_REEL] Video generation started: ${invocationArn}`);

    // If waitForCompletion is requested, poll for completion
    if (options.waitForCompletion) {
      const statusResult = await waitForCompletion(
        invocationArn,
        userId,
        options.outputPath,
        options.pollingInterval || DEFAULT_POLLING_INTERVAL,
        options.maxWaitTime || DEFAULT_MAX_WAIT_TIME
      );

      return {
        success: statusResult.status === 'Completed',
        action: 'start',
        invocationArn,
        status: statusResult.status,
        estimatedTime: getEstimatedTime(duration),
        outputS3Uri: statusResult.outputS3Uri,
        s3Path: statusResult.s3Path,
        message: statusResult.message,
      };
    }

    return {
      success: true,
      action: 'start',
      invocationArn,
      status: 'InProgress',
      estimatedTime: getEstimatedTime(duration),
      message: `Video generation job started. It will take ${getEstimatedTime(duration)} to complete.`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[NOVA_REEL] Failed to start video generation: ${errorMessage}`);

    return {
      success: false,
      action: 'start',
      invocationArn: '',
      status: 'Failed',
      estimatedTime: '',
      message: `Failed to start video generation: ${errorMessage}`,
    };
  }
}

/**
 * Wait for job completion with polling
 */
async function waitForCompletion(
  invocationArn: string,
  userId: string,
  outputPath?: string,
  pollingInterval: number = DEFAULT_POLLING_INTERVAL,
  maxWaitTime: number = DEFAULT_MAX_WAIT_TIME
): Promise<StatusOutput> {
  const startTime = Date.now();
  const maxEndTime = startTime + maxWaitTime * 1000;

  logger.info(`[NOVA_REEL] Waiting for completion: ${invocationArn} (max ${maxWaitTime}s)`);

  while (Date.now() < maxEndTime) {
    const statusResult = await getJobStatus(invocationArn, userId, outputPath);

    if (statusResult.status === 'Completed' || statusResult.status === 'Failed') {
      return statusResult;
    }

    logger.debug(`[NOVA_REEL] Job still in progress, waiting ${pollingInterval}s...`);
    await sleep(pollingInterval * 1000);
  }

  const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
  return {
    success: false,
    action: 'status',
    invocationArn,
    status: 'InProgress',
    elapsedTime,
    message: `Maximum wait time (${maxWaitTime} seconds) exceeded. Job is still in progress.`,
  };
}

/**
 * Get job status
 */
async function getJobStatus(
  invocationArn: string,
  userId?: string,
  outputPath?: string
): Promise<StatusOutput> {
  const context = getCurrentContext();
  const effectiveUserId = userId || context?.userId || 'anonymous';

  logger.debug(`[NOVA_REEL] Getting job status: ${invocationArn}`);

  try {
    const command = new GetAsyncInvokeCommand({
      invocationArn,
    });

    const response = await bedrockClient.send(command);
    const status = response.status as JobStatus;
    const submitTime = response.submitTime;

    const elapsedTime = submitTime
      ? Math.floor((Date.now() - submitTime.getTime()) / 1000)
      : undefined;

    // Calculate progress estimate (rough approximation)
    let progress: number | undefined;
    if (status === 'InProgress' && elapsedTime !== undefined) {
      // Assume 90 seconds for 6s video, 900 seconds for 2min video
      const estimatedTotal = 90; // Use shorter estimate as baseline
      progress = Math.min(95, Math.floor((elapsedTime / estimatedTotal) * 100));
    } else if (status === 'Completed') {
      progress = 100;
    }

    let outputS3Uri: string | undefined;
    let s3Path: string | undefined;

    if (status === 'Completed' && response.outputDataConfig?.s3OutputDataConfig?.s3Uri) {
      outputS3Uri = response.outputDataConfig.s3OutputDataConfig.s3Uri;

      // Copy video to user storage
      const userS3Path = await copyVideoToUserStorage(outputS3Uri, effectiveUserId, outputPath);
      if (userS3Path) {
        s3Path = getDisplayPath(userS3Path, effectiveUserId);
        outputS3Uri = userS3Path;
      }
    }

    let message: string;
    if (status === 'Completed') {
      message = s3Path
        ? `Video generation completed. Saved to: ${s3Path}`
        : 'Video generation completed.';
    } else if (status === 'Failed') {
      message = `Video generation failed: ${response.failureMessage || 'Unknown error'}`;
    } else {
      message = `Generating video... (elapsed: ${elapsedTime || 0}s, progress: ${progress || 0}%)`;
    }

    return {
      success: status === 'Completed',
      action: 'status',
      invocationArn,
      status,
      progress,
      elapsedTime,
      outputS3Uri,
      s3Path,
      failureMessage: response.failureMessage,
      message,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[NOVA_REEL] Failed to get job status: ${errorMessage}`);

    return {
      success: false,
      action: 'status',
      invocationArn,
      status: 'Failed',
      failureMessage: errorMessage,
      message: `Failed to get job status: ${errorMessage}`,
    };
  }
}

/**
 * List video generation jobs
 */
async function listJobs(options: {
  statusFilter?: JobStatus;
  maxResults?: number;
  sortOrder?: SortOrder;
}): Promise<ListJobsOutput> {
  const maxResults = options.maxResults || 10;
  const sortOrder = options.sortOrder || 'Descending';

  logger.debug(
    `[NOVA_REEL] Listing jobs: statusFilter=${options.statusFilter}, maxResults=${maxResults}`
  );

  try {
    const command = new ListAsyncInvokesCommand({
      statusEquals: options.statusFilter,
      maxResults,
      sortOrder,
    });

    const response = await bedrockClient.send(command);
    const summaries = response.asyncInvokeSummaries || [];

    const jobs = summaries.map((summary) => ({
      invocationArn: summary.invocationArn!,
      status: summary.status as JobStatus,
      submitTime: summary.submitTime?.toISOString() || '',
      endTime: summary.endTime?.toISOString(),
      outputS3Uri: summary.outputDataConfig?.s3OutputDataConfig?.s3Uri,
    }));

    return {
      success: true,
      action: 'list',
      jobs,
      count: jobs.length,
      message: `Found ${jobs.length} job(s).`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[NOVA_REEL] Failed to list jobs: ${errorMessage}`);

    return {
      success: false,
      action: 'list',
      jobs: [],
      count: 0,
      message: `Failed to list jobs: ${errorMessage}`,
    };
  }
}

/**
 * Nova Reel Tool Definition
 */
export const novaReelTool = tool({
  name: novaReelDefinition.name,
  description: novaReelDefinition.description,
  inputSchema: novaReelDefinition.zodSchema,
  callback: async (input) => {
    const { action } = input;

    logger.info(`[NOVA_REEL] Executing action: ${action}`);

    switch (action) {
      case 'start': {
        if (!input.prompt) {
          return JSON.stringify({
            success: false,
            action: 'start',
            invocationArn: '',
            status: 'Failed',
            estimatedTime: '',
            message: 'Prompt is a required parameter.',
          } as StartVideoOutput);
        }

        const result = await startVideoGeneration(input.prompt, {
          negativePrompt: input.negativePrompt,
          imageBase64: input.imageBase64,
          duration: input.duration as VideoDuration | undefined,
          dimension: input.dimension as VideoDimension | undefined,
          fps: input.fps,
          seed: input.seed,
          outputPath: input.outputPath,
          waitForCompletion: input.waitForCompletion,
          pollingInterval: input.pollingInterval,
          maxWaitTime: input.maxWaitTime,
        });
        return JSON.stringify(result);
      }

      case 'status': {
        if (!input.invocationArn) {
          return JSON.stringify({
            success: false,
            action: 'status',
            invocationArn: '',
            status: 'Failed',
            message: 'invocationArn is a required parameter.',
          } as StatusOutput);
        }

        const context = getCurrentContext();
        const userId = context?.userId || 'anonymous';

        let result: StatusOutput;
        if (input.waitForCompletion) {
          result = await waitForCompletion(
            input.invocationArn,
            userId,
            input.outputPath,
            input.pollingInterval || DEFAULT_POLLING_INTERVAL,
            input.maxWaitTime || DEFAULT_MAX_WAIT_TIME
          );
        } else {
          result = await getJobStatus(input.invocationArn, userId, input.outputPath);
        }
        return JSON.stringify(result);
      }

      case 'list': {
        const result = await listJobs({
          statusFilter: input.statusFilter as JobStatus | undefined,
          maxResults: input.maxResults,
          sortOrder: input.sortOrder as SortOrder | undefined,
        });
        return JSON.stringify(result);
      }

      default:
        return JSON.stringify({
          success: false,
          action: 'list',
          jobs: [],
          count: 0,
          message: `Unknown action: ${action}`,
        } as ListJobsOutput);
    }
  },
});
