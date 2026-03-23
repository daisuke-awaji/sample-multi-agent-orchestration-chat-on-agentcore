/**
 * User-scoped S3 Credentials via STS AssumeRole with Session Policy
 *
 * Provides temporary AWS credentials that are restricted to a specific user's
 * S3 prefix (`users/{userId}/`). This ensures that even shell commands
 * (`aws s3 ...`) executed via the execute_command tool can only access
 * the authenticated user's storage directory.
 *
 * Architecture:
 *   1. Runtime role has `sts:AssumeRole` permission for USER_SCOPED_S3_ROLE_ARN
 *   2. USER_SCOPED_S3_ROLE_ARN has broad S3 permissions on the user storage bucket
 *   3. At assume-time, a **session policy** is attached that restricts access
 *      to `users/{userId}/*` only (IAM AND logic: role policy ∩ session policy)
 *   4. The resulting temporary credentials are used for S3 operations
 */

import { STSClient, AssumeRoleCommand, type Credentials } from '@aws-sdk/client-sts';
import { S3Client } from '@aws-sdk/client-s3';
import { logger } from '../config/index.js';

const stsClient = new STSClient({ region: process.env.AWS_REGION });

/**
 * Cached credentials entry with expiration tracking
 */
interface CachedCredentials {
  credentials: Credentials;
  expiresAt: Date;
}

/**
 * In-memory credential cache keyed by userId
 * Credentials are reused until they expire (with a safety margin)
 */
const credentialCache = new Map<string, CachedCredentials>();

/** Safety margin before credential expiry (5 minutes) */
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

/** Default credential duration in seconds (15 minutes) */
const DEFAULT_DURATION_SECONDS = 900;

/**
 * Build a session policy JSON that restricts S3 access to the user's prefix.
 *
 * The session policy is evaluated as an AND with the role's identity-based policy,
 * so the effective permissions are the intersection of both.
 *
 * Note: `userId` is embedded directly into the ARN Resource field. IAM evaluates
 * `*` and `?` in Resource ARNs as wildcards, so a userId containing these characters
 * could widen the scope of the session policy. This is NOT a risk in our system
 * because `userId` is always the Cognito `sub` claim — a UUID (e.g.,
 * "d7a41aa8-8031-70e8-4916-4c302e63588a") that is guaranteed by Cognito to contain
 * only hex digits and hyphens. If the userId source ever changes to accept
 * arbitrary user input, a validation/sanitisation step must be added here.
 */
function buildSessionPolicy(bucketName: string, userId: string): string {
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'AllowObjectAccessUserPrefix',
        Effect: 'Allow',
        Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:HeadObject'],
        Resource: `arn:aws:s3:::${bucketName}/users/${userId}/*`,
      },
      {
        Sid: 'AllowListBucketUserPrefix',
        Effect: 'Allow',
        Action: 's3:ListBucket',
        Resource: `arn:aws:s3:::${bucketName}`,
        Condition: {
          StringLike: {
            's3:prefix': [`users/${userId}/*`, `users/${userId}`],
          },
        },
      },
    ],
  });
}

/**
 * Assume the user-scoped S3 role with a session policy restricted to
 * the given user's S3 prefix. Returns cached credentials when available.
 *
 * @param userId - The authenticated user's ID
 * @returns Temporary AWS credentials scoped to `users/{userId}/`
 * @throws Error if role ARN or bucket name is not configured
 */
export async function assumeUserScopedS3Role(userId: string): Promise<Credentials> {
  const roleArn = process.env.USER_SCOPED_S3_ROLE_ARN;
  const bucketName = process.env.USER_STORAGE_BUCKET_NAME;

  if (!roleArn) {
    throw new Error('USER_SCOPED_S3_ROLE_ARN environment variable is not set');
  }
  if (!bucketName) {
    throw new Error('USER_STORAGE_BUCKET_NAME environment variable is not set');
  }

  // Check cache
  const cached = credentialCache.get(userId);
  if (cached && cached.expiresAt.getTime() - Date.now() > EXPIRY_MARGIN_MS) {
    logger.debug(`[SCOPED_S3] Using cached credentials for user=${userId}`);
    return cached.credentials;
  }

  logger.info(`[SCOPED_S3] Assuming user-scoped S3 role for user=${userId}`);

  const sessionPolicy = buildSessionPolicy(bucketName, userId);

  const command = new AssumeRoleCommand({
    RoleArn: roleArn,
    RoleSessionName: `user-${userId.replace(/[^a-zA-Z0-9_=,.@-]/g, '_').slice(0, 48)}`,
    Policy: sessionPolicy,
    DurationSeconds: DEFAULT_DURATION_SECONDS,
  });

  const response = await stsClient.send(command);

  if (!response.Credentials) {
    throw new Error('STS AssumeRole did not return credentials');
  }

  // Cache the credentials
  credentialCache.set(userId, {
    credentials: response.Credentials,
    expiresAt:
      response.Credentials.Expiration || new Date(Date.now() + DEFAULT_DURATION_SECONDS * 1000),
  });

  logger.info(
    `[SCOPED_S3] Credentials obtained for user=${userId}, ` +
      `expires=${response.Credentials.Expiration?.toISOString()}`
  );

  return response.Credentials;
}

/**
 * Create an S3Client configured with user-scoped temporary credentials.
 *
 * @param userId - The authenticated user's ID
 * @returns S3Client that can only access `users/{userId}/` in the storage bucket
 */
export async function createUserScopedS3Client(userId: string): Promise<S3Client> {
  const creds = await assumeUserScopedS3Role(userId);

  return new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: creds.AccessKeyId!,
      secretAccessKey: creds.SecretAccessKey!,
      sessionToken: creds.SessionToken,
    },
  });
}

/**
 * Get environment variables for a child process that restrict S3 access
 * to the given user's prefix. Used by execute_command to scope `aws s3` commands.
 *
 * @param userId - The authenticated user's ID
 * @returns Environment variable overrides for the child process
 */
export async function getUserScopedEnvVars(userId: string): Promise<Record<string, string>> {
  const creds = await assumeUserScopedS3Role(userId);

  return {
    AWS_ACCESS_KEY_ID: creds.AccessKeyId!,
    AWS_SECRET_ACCESS_KEY: creds.SecretAccessKey!,
    AWS_SESSION_TOKEN: creds.SessionToken!,
    AWS_REGION: process.env.AWS_REGION || 'us-east-1',
  };
}

/**
 * Clear cached credentials for a specific user or all users.
 * Useful for testing or when credentials need to be refreshed.
 */
export function clearCredentialCache(userId?: string): void {
  if (userId) {
    credentialCache.delete(userId);
  } else {
    credentialCache.clear();
  }
}
