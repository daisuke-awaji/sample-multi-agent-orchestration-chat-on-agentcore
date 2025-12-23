import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import { NodejsBuild } from 'deploy-time-build';
import { Construct } from 'constructs';

export interface FrontendProps {
  /**
   * Cognito User Pool ID for frontend configuration
   */
  userPoolId: string;

  /**
   * Cognito User Pool Client ID for frontend configuration
   */
  userPoolClientId: string;

  /**
   * AgentCore Runtime Endpoint URL
   */
  runtimeEndpoint: string;

  /**
   * Backend API URL (API Gateway + Lambda)
   */
  backendApiUrl?: string;

  /**
   * AWS Region
   */
  awsRegion: string;
}

export class Frontend extends Construct {
  public readonly s3Bucket: s3.Bucket;
  public readonly cloudFrontDistribution: cloudfront.Distribution;
  public readonly websiteUrl: string;

  constructor(scope: Construct, id: string, props: FrontendProps) {
    super(scope, id);

    // S3 Bucket for Frontend Static Website
    this.s3Bucket = new s3.Bucket(this, 'AgentCoreFrontendBucket', {
      bucketName: `agentcore-frontend-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For demo purposes
      autoDeleteObjects: true, // For demo purposes
    });

    // Response Headers Policy for optimized caching and security
    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(
      this,
      'FrontendResponseHeadersPolicy',
      {
        // Security headers
        securityHeadersBehavior: {
          contentTypeOptions: { override: true },
          frameOptions: {
            frameOption: cloudfront.HeadersFrameOption.DENY,
            override: true,
          },
          referrerPolicy: {
            referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
            override: true,
          },
          strictTransportSecurity: {
            accessControlMaxAge: cdk.Duration.days(365),
            includeSubdomains: true,
            override: true,
          },
          xssProtection: {
            protection: true,
            modeBlock: true,
            override: true,
          },
        },
      }
    );

    // Cache Policy for static assets (JS, CSS, fonts, images)
    const staticAssetsCachePolicy = new cloudfront.CachePolicy(this, 'StaticAssetsCachePolicy', {
      cachePolicyName: `agentcore-static-assets-${cdk.Aws.REGION}`,
      comment: 'Cache policy for static assets with long TTL',
      defaultTtl: cdk.Duration.days(365),
      maxTtl: cdk.Duration.days(365),
      minTtl: cdk.Duration.days(365),
      enableAcceptEncodingBrotli: true,
      enableAcceptEncodingGzip: true,
      headerBehavior: cloudfront.CacheHeaderBehavior.none(),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
    });

    // CloudFront Distribution
    this.cloudFrontDistribution = new cloudfront.Distribution(
      this,
      'AgentCoreCloudFrontDistribution',
      {
        defaultBehavior: {
          origin: origins.S3BucketOrigin.withOriginAccessControl(this.s3Bucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          responseHeadersPolicy: responseHeadersPolicy,
          compress: true,
        },
        // Static assets behavior (JS, CSS, fonts, images) with aggressive caching
        additionalBehaviors: {
          '/assets/*': {
            origin: origins.S3BucketOrigin.withOriginAccessControl(this.s3Bucket),
            viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            cachePolicy: staticAssetsCachePolicy,
            responseHeadersPolicy: responseHeadersPolicy,
            compress: true,
          },
        },
        defaultRootObject: 'index.html',
        errorResponses: [
          {
            httpStatus: 404,
            responseHttpStatus: 200,
            responsePagePath: '/index.html',
            ttl: cdk.Duration.minutes(30),
          },
          {
            httpStatus: 403,
            responseHttpStatus: 200,
            responsePagePath: '/index.html',
            ttl: cdk.Duration.minutes(30),
          },
        ],
        priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      }
    );

    // Frontend Build and Deployment using deploy-time-build
    const frontendBuild = new NodejsBuild(this, 'FrontendBuild', {
      assets: [
        {
          path: 'packages/frontend',
          exclude: ['node_modules/**', '.git/**', 'dist/**', '.env'],
        },
      ],
      buildCommands: ['npm install', 'npm run build'],
      buildEnvironment: {
        VITE_COGNITO_USER_POOL_ID: props.userPoolId,
        VITE_COGNITO_CLIENT_ID: props.userPoolClientId,
        VITE_AWS_REGION: props.awsRegion,
        VITE_AGENT_ENDPOINT: props.runtimeEndpoint,
        VITE_BACKEND_URL: props.backendApiUrl || '', // Backend API URL を追加
      },
      outputSourceDirectory: 'dist',
      destinationBucket: this.s3Bucket,
      distribution: this.cloudFrontDistribution,
    });

    // NodejsBuild の grantPrincipal に CloudWatch Logs への権限を追加
    const cloudWatchPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [
        `arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:/aws/codebuild/*`,
      ],
    });

    // 権限を NodejsBuild のサービスロールに追加
    if (frontendBuild.grantPrincipal) {
      (frontendBuild.grantPrincipal as iam.IRole).addToPrincipalPolicy(cloudWatchPolicy);
    }

    // Set website URL for easy access
    this.websiteUrl = `https://${this.cloudFrontDistribution.distributionDomainName}`;
  }
}
