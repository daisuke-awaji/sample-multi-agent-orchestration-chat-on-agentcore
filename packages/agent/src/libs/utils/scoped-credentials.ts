/**
 * User-scoped Credentials via STS AssumeRole with Session Policy
 *
 * Provides temporary AWS credentials that are restricted to a specific user's
 * resources:
 * - S3 prefix (`users/{userId}/`) — shell commands and SDK calls can only access
 *   the authenticated user's storage directory.
 * - DynamoDB partition key (`userId`) — only items belonging to the authenticated
 *   user are accessible via the `dynamodb:LeadingKeys` condition.
 *
 * Architecture:
 *   1. Runtime role has `sts:AssumeRole` permission for USER_SCOPED_ROLE_ARN
 *   2. USER_SCOPED_ROLE_ARN has broad S3 + DynamoDB permissions on target resources
 *   3. At assume-time, a **session policy** is attached that restricts access
 *      to the user's S3 prefix and DynamoDB partition key only
 *      (IAM AND logic: role policy ∩ session policy)
 *   4. The resulting temporary credentials are used for all user-scoped operations
 */

import { STSClient, AssumeRoleCommand, type Credentials } from '@aws-sdk/client-sts';
import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { logger } from '../../config/index.js';

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
 * Build a session policy JSON that restricts access to the user's S3 prefix
 * and DynamoDB partition key.
 *
 * The session policy is evaluated as an AND with the role's identity-based policy,
 * so the effective permissions are the intersection of both.
 *
 * Note: `userId` is embedded directly into the ARN Resource field and condition values.
 * IAM evaluates `*` and `?` in Resource ARNs as wildcards, so a userId containing
 * these characters could widen the scope of the session policy. This is NOT a risk
 * in our system because `userId` is always the Cognito `sub` claim — a UUID (e.g.,
 * "d7a41aa8-8031-70e8-4916-4c302e63588a") that is guaranteed by Cognito to contain
 * only hex digits and hyphens. If the userId source ever changes to accept
 * arbitrary user input, a validation/sanitisation step must be added here.
 */
function buildSessionPolicy(
  bucketName: string | undefined,
  tableArn: string | undefined,
  userId: string,
  enableOps: boolean
): string {
  // Session Policy size limit: 2,048 characters (packed).
  // To stay within the limit, all `Sid` fields are omitted and actions are
  // aggregated (e.g., `s3:*` instead of individual actions). The role's
  // identity-based policy already constrains the allowed actions, so using
  // wildcards here only widens the session-policy side of the AND evaluation
  // without granting additional effective permissions.
  const statements: Record<string, unknown>[] = [];

  // S3 — user storage prefix
  if (bucketName) {
    statements.push(
      {
        Effect: 'Allow',
        Action: 's3:*',
        Resource: `arn:aws:s3:::${bucketName}/users/${userId}/*`,
      },
      {
        Effect: 'Allow',
        Action: 's3:ListBucket',
        Resource: `arn:aws:s3:::${bucketName}`,
        Condition: {
          StringLike: { 's3:prefix': [`users/${userId}/*`, `users/${userId}`] },
        },
      }
    );
  }

  // S3 — CDK/CloudFormation staging buckets (Ops mode)
  if (enableOps) {
    statements.push({
      Effect: 'Allow',
      Action: 's3:*',
      Resource: [
        'arn:aws:s3:::cdk*',
        'arn:aws:s3:::cdk*/*',
        'arn:aws:s3:::cdktoolkit-*',
        'arn:aws:s3:::cdktoolkit-*/*',
      ],
    });
  }

  // DynamoDB — user-scoped partition key
  // `LeadingKeys` restricts to items where PK = userId. Scan is not allowed
  // because LeadingKeys cannot restrict it; the role policy also excludes Scan.
  if (tableArn) {
    statements.push({
      Effect: 'Allow',
      Action: 'dynamodb:*',
      Resource: [tableArn, `${tableArn}/index/*`],
      Condition: {
        'ForAllValues:StringEquals': { 'dynamodb:LeadingKeys': [userId] },
      },
    });
  }

  // Non-storage operations pass-through (Ops mode)
  // NotAction lets ReadOnly, CloudFormation, IAM PassRole, etc. through
  // while S3 and DynamoDB remain restricted to the statements above.
  if (enableOps) {
    statements.push({
      Effect: 'Allow',
      NotAction: ['s3:*', 'dynamodb:*'],
      Resource: '*',
    });
  }

  return JSON.stringify({ Version: '2012-10-17', Statement: statements });
}

/**
 * Assume the user-scoped role with a session policy restricted to
 * the given user's S3 prefix and DynamoDB partition key.
 * Returns cached credentials when available.
 *
 * @param userId - The authenticated user's ID
 * @returns Temporary AWS credentials scoped to the user's resources
 * @throws Error if role ARN is not configured
 */
export async function assumeUserScopedRole(userId: string): Promise<Credentials> {
  const roleArn = process.env.USER_SCOPED_ROLE_ARN;
  const bucketName = process.env.USER_STORAGE_BUCKET_NAME;
  const tableArn = process.env.SESSIONS_TABLE_ARN;
  const enableOps = process.env.ENABLE_AWS_OPS_PERMISSIONS === 'true';

  if (!roleArn) {
    throw new Error('USER_SCOPED_ROLE_ARN environment variable is not set');
  }

  // At least one resource must be configured for scoping
  if (!bucketName && !tableArn) {
    throw new Error('At least one of USER_STORAGE_BUCKET_NAME or SESSIONS_TABLE_ARN must be set');
  }

  // Check cache
  const cached = credentialCache.get(userId);
  if (cached && cached.expiresAt.getTime() - Date.now() > EXPIRY_MARGIN_MS) {
    logger.debug(`[SCOPED_CREDS] Using cached credentials for user=${userId}`);
    return cached.credentials;
  }

  logger.info(
    `[SCOPED_CREDS] Assuming user-scoped role for user=${userId}` +
      (enableOps ? ' (Ops mode enabled)' : '')
  );

  const sessionPolicy = buildSessionPolicy(bucketName, tableArn, userId, enableOps);

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
    `[SCOPED_CREDS] Credentials obtained for user=${userId}, ` +
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
  const creds = await assumeUserScopedRole(userId);

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
 * Create a DynamoDBClient configured with user-scoped temporary credentials.
 *
 * @param userId - The authenticated user's ID
 * @returns DynamoDBClient that can only access items where partition key = userId
 */
export async function createUserScopedDynamoDBClient(userId: string): Promise<DynamoDBClient> {
  const creds = await assumeUserScopedRole(userId);

  return new DynamoDBClient({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: creds.AccessKeyId!,
      secretAccessKey: creds.SecretAccessKey!,
      sessionToken: creds.SessionToken,
    },
  });
}

/**
 * Get environment variables for a child process that restrict S3 and DynamoDB access
 * to the given user's resources. Used by execute_command to scope `aws s3` and
 * `aws dynamodb` commands.
 *
 * @param userId - The authenticated user's ID
 * @returns Environment variable overrides for the child process
 */
export async function getUserScopedEnvVars(userId: string): Promise<Record<string, string>> {
  const creds = await assumeUserScopedRole(userId);

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

// Backward-compatible aliases
/** @deprecated Use `assumeUserScopedRole` instead */
export const assumeUserScopedS3Role = assumeUserScopedRole;
