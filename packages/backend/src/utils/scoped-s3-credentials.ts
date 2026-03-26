/**
 * User-scoped S3 Credentials via STS AssumeRole with Session Policy
 *
 * Provides temporary AWS credentials restricted to a specific user's
 * S3 prefix (`users/{userId}/`).
 */

import { STSClient, AssumeRoleCommand, type Credentials } from '@aws-sdk/client-sts';
import { S3Client } from '@aws-sdk/client-s3';

let stsClient: STSClient | undefined;

function getStsClient(): STSClient {
  if (!stsClient) {
    stsClient = new STSClient({ region: process.env.AWS_REGION });
  }
  return stsClient;
}

interface CachedCredentials {
  credentials: Credentials;
  expiresAt: Date;
}

const credentialCache = new Map<string, CachedCredentials>();
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;
const DEFAULT_DURATION_SECONDS = 900;

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

async function assumeUserScopedS3Role(userId: string): Promise<Credentials> {
  const roleArn = process.env.USER_SCOPED_ROLE_ARN;
  const bucketName = process.env.USER_STORAGE_BUCKET_NAME;

  if (!roleArn) throw new Error('USER_SCOPED_ROLE_ARN is not set');
  if (!bucketName) throw new Error('USER_STORAGE_BUCKET_NAME is not set');

  const cached = credentialCache.get(userId);
  if (cached && cached.expiresAt.getTime() - Date.now() > EXPIRY_MARGIN_MS) {
    return cached.credentials;
  }

  const response = await getStsClient().send(
    new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: `backend-${userId.replace(/[^a-zA-Z0-9_=,.@-]/g, '_').slice(0, 48)}`,
      Policy: buildSessionPolicy(bucketName, userId),
      DurationSeconds: DEFAULT_DURATION_SECONDS,
    })
  );

  if (!response.Credentials) throw new Error('STS AssumeRole did not return credentials');

  credentialCache.set(userId, {
    credentials: response.Credentials,
    expiresAt:
      response.Credentials.Expiration || new Date(Date.now() + DEFAULT_DURATION_SECONDS * 1000),
  });

  return response.Credentials;
}

export async function createUserScopedS3Client(userId: string): Promise<S3Client> {
  const creds = await assumeUserScopedS3Role(userId);

  if (!creds.AccessKeyId || !creds.SecretAccessKey) {
    throw new Error('STS credentials are missing required fields');
  }

  return new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: creds.AccessKeyId,
      secretAccessKey: creds.SecretAccessKey,
      sessionToken: creds.SessionToken,
    },
  });
}
