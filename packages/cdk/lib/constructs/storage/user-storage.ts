/**
 * User Storage Construct
 * Provides per-user file storage (S3)
 */

import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface UserStorageProps {
  /**
   * Bucket name prefix (optional)
   * Actual bucket name: {prefix}-user-storage-{account}-{region}
   */
  readonly bucketNamePrefix?: string;

  /**
   * Data retention period (days)
   * @default 365 days (1 year)
   */
  readonly retentionDays?: number;

  /**
   * CORS allowed origins
   * @default ['*'] (for development)
   */
  readonly corsAllowedOrigins?: string[];

  /**
   * S3 bucket removal policy
   * @default RETAIN
   */
  readonly removalPolicy?: cdk.RemovalPolicy;

  /**
   * S3 bucket auto delete (only effective when RemovalPolicy.DESTROY)
   * @default false
   */
  readonly autoDeleteObjects?: boolean;
}

/**
 * User Storage Construct
 * Provides S3 bucket and access control for user files
 */
export class UserStorage extends Construct {
  /**
   * Created S3 bucket
   */
  public readonly bucket: s3.Bucket;

  /**
   * Bucket name
   */
  public readonly bucketName: string;

  /**
   * Bucket ARN
   */
  public readonly bucketArn: string;

  constructor(scope: Construct, id: string, props?: UserStorageProps) {
    super(scope, id);

    const stack = cdk.Stack.of(this);
    const prefix = props?.bucketNamePrefix || 'agentcore';
    const retentionDays = props?.retentionDays || 365;
    const corsAllowedOrigins = props?.corsAllowedOrigins || ['*'];
    const removalPolicy = props?.removalPolicy || cdk.RemovalPolicy.RETAIN;
    const autoDeleteObjects = props?.autoDeleteObjects ?? false;

    // Create S3 bucket
    this.bucket = new s3.Bucket(this, 'UserStorageBucket', {
      bucketName: `${prefix}-user-storage-${stack.account}-${stack.region}`,
      // Security settings
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true, // Enable versioning
      enforceSSL: true, // Enforce SSL/TLS connections

      // Lifecycle settings
      lifecycleRules: [
        {
          id: 'DeleteOldVersions',
          noncurrentVersionExpiration: cdk.Duration.days(30), // Delete old versions after 30 days
        },
        {
          id: 'ExpireDeleteMarkers',
          expiredObjectDeleteMarker: true, // Auto-delete delete markers
        },
      ],

      // Removal policy settings
      removalPolicy: removalPolicy,
      autoDeleteObjects: autoDeleteObjects,

      // CORS settings (for direct upload from frontend)
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: corsAllowedOrigins,
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag', 'x-amz-version-id'],
          maxAge: 3000,
        },
      ],
    });

    this.bucketName = this.bucket.bucketName;
    this.bucketArn = this.bucket.bucketArn;

    // Add tags
    cdk.Tags.of(this.bucket).add('Component', 'UserStorage');
    cdk.Tags.of(this.bucket).add('RetentionDays', retentionDays.toString());
  }

  /**
   * Grant full S3 access to Lambda function
   * Per-user prefix restrictions are implemented at application level
   */
  public grantFullAccess(grantee: iam.IGrantable): iam.Grant {
    return this.bucket.grantReadWrite(grantee);
  }

  /**
   * Grant presigned URL generation permission to Lambda function
   */
  public grantPresignedUrlGeneration(grantee: iam.IGrantable): iam.Grant {
    return this.bucket.grantReadWrite(grantee);
  }

  /**
   * Grant read-only permission to Lambda function
   */
  public grantReadOnly(grantee: iam.IGrantable): iam.Grant {
    return this.bucket.grantRead(grantee);
  }
}
