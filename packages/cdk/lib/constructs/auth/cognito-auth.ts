import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface CognitoAuthProps {
  /**
   * Cognito User Pool name
   */
  readonly userPoolName: string;

  /**
   * App Client name
   * @default "{userPoolName}-client"
   */
  readonly appClientName?: string;

  /**
   * Password policy minimum length
   * @default 8
   */
  readonly passwordMinLength?: number;

  /**
   * Enable user deletion protection
   * @default false (for development)
   */
  readonly deletionProtection?: boolean;

  /**
   * Additional User Pool configuration
   */
  readonly userPoolConfig?: {
    readonly mfa?: cognito.Mfa;
    readonly selfSignUpEnabled?: boolean;
    readonly autoVerify?: {
      email?: boolean;
      phone?: boolean;
    };
  };

  /**
   * List of allowed email domains for sign up (optional)
   * When set, only email addresses from these domains can sign up
   * Example: ['amazon.com', 'amazon.jp']
   */
  readonly allowedSignUpEmailDomains?: string[];

  /**
   * Test user configuration (optional, for development)
   * When set, automatically creates test user during deployment
   */
  readonly testUser?: {
    readonly username: string;
    readonly email: string;
    readonly password: string;
  };
}

/**
 * Cognito User Pool + App Client Construct for AgentCore
 *
 * Provides Cognito authentication foundation shared by Gateway and Runtime.
 */
export class CognitoAuth extends Construct {
  /**
   * Created User Pool
   */
  public readonly userPool: cognito.UserPool;

  /**
   * Created App Client
   */
  public readonly userPoolClient: cognito.UserPoolClient;

  /**
   * OIDC Discovery URL
   * Used for AgentCore JWT authorizer
   */
  public readonly discoveryUrl: string;

  /**
   * App Client ID
   * Used for JWT token client_id claim verification
   */
  public readonly clientId: string;

  /**
   * App Client for Machine User
   * Used for Client Credentials Flow
   */
  public readonly machineUserClient: cognito.UserPoolClient;

  /**
   * App Client ID for Machine User
   */
  public readonly machineUserClientId: string;

  /**
   * Resource Server (OAuth2 scope definition)
   */
  public readonly resourceServer: cognito.UserPoolResourceServer;

  /**
   * User Pool Domain
   * Required for Token endpoint access
   */
  public readonly userPoolDomain: cognito.UserPoolDomain;

  /**
   * User Pool ID
   */
  public readonly userPoolId: string;

  /**
   * User Pool ARN
   */
  public readonly userPoolArn: string;

  constructor(scope: Construct, id: string, props: CognitoAuthProps) {
    super(scope, id);

    // Pre Sign Up Lambda trigger (for email domain validation)
    let preSignUpTrigger: lambda.Function | undefined;
    if (props.allowedSignUpEmailDomains && props.allowedSignUpEmailDomains.length > 0) {
      preSignUpTrigger = new lambda.Function(this, 'PreSignUpTrigger', {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline(`
exports.handler = async (event) => {
  console.log('Pre Sign Up Trigger - Event:', JSON.stringify(event, null, 2));
  
  const allowedDomains = process.env.ALLOWED_DOMAINS?.split(',') || [];
  const email = event.request.userAttributes.email;
  
  if (!email) {
    throw new Error('Email is required for sign up');
  }
  
  const emailDomain = email.split('@')[1]?.toLowerCase();
  
  if (!emailDomain) {
    throw new Error('Invalid email format');
  }
  
  const isAllowed = allowedDomains.some(domain => 
    emailDomain === domain.toLowerCase()
  );
  
  if (!isAllowed) {
    console.log(\`Sign up denied: Email domain '\${emailDomain}' is not in allowed list: \${allowedDomains.join(', ')}\`);
    throw new Error(\`Sign up is restricted to the following email domains: \${allowedDomains.join(', ')}\`);
  }
  
  console.log(\`Sign up allowed: Email domain '\${emailDomain}' is in allowed list\`);
  
  // Auto-confirm the user
  event.response.autoConfirmUser = false;
  event.response.autoVerifyEmail = false;
  
  return event;
};
        `),
        environment: {
          ALLOWED_DOMAINS: props.allowedSignUpEmailDomains.join(','),
        },
        timeout: cdk.Duration.seconds(10),
        logRetention: logs.RetentionDays.ONE_WEEK,
      });
    }

    // Create User Pool
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: props.userPoolName,

      // Password policy
      passwordPolicy: {
        minLength: props.passwordMinLength || 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },

      // MFA settings
      mfa: props.userPoolConfig?.mfa || cognito.Mfa.OFF,

      // Self sign-up
      selfSignUpEnabled: props.userPoolConfig?.selfSignUpEnabled ?? false,

      // Auto verification
      autoVerify: {
        email: props.userPoolConfig?.autoVerify?.email ?? false,
        phone: props.userPoolConfig?.autoVerify?.phone ?? false,
      },

      // Sign-in settings
      signInAliases: {
        username: true,
        email: true,
        phone: false,
      },

      // Deletion protection
      deletionProtection: props.deletionProtection ?? false,

      // No custom attributes (simple configuration)
      customAttributes: {},

      // Account recovery
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,

      // Lambda trigger settings
      lambdaTriggers: preSignUpTrigger
        ? {
            preSignUp: preSignUpTrigger,
          }
        : undefined,
    });

    // Create App Client
    this.userPoolClient = this.userPool.addClient('AppClient', {
      userPoolClientName: props.appClientName || `${props.userPoolName}-client`,

      // Authentication flow settings
      authFlows: {
        userPassword: true, // USER_PASSWORD_AUTH (required)
        userSrp: true, // Enable SRP authentication
        adminUserPassword: true, // ADMIN_USER_PASSWORD_AUTH
        custom: false, // CUSTOM_AUTH disabled
      },

      // OAuth settings completely removed (not needed for JWT authentication)

      // Token validity
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),

      // Security settings
      generateSecret: false, // Public client (no secret required)
      preventUserExistenceErrors: true,
    });

    // Create Resource Server (OAuth2 scope definition)
    this.resourceServer = new cognito.UserPoolResourceServer(this, 'ResourceServer', {
      userPool: this.userPool,
      identifier: 'agent',
      userPoolResourceServerName: `${props.userPoolName}-resource-server`,
      scopes: [
        {
          scopeName: 'invoke',
          scopeDescription: 'Invoke Agent API',
        },
        {
          scopeName: 'tools',
          scopeDescription: 'Access Gateway tools',
        },
        {
          scopeName: 'admin',
          scopeDescription: 'Administrative access',
        },
      ],
    });

    // Create User Pool Domain (for Token endpoint access)
    // Safe domain prefix generation: alphanumeric only, separated by hyphen
    const sanitizedName = props.userPoolName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '') // Remove non-alphanumeric characters
      .substring(0, 20); // Maximum 20 characters
    const accountSuffix = cdk.Stack.of(this).account.substring(0, 8);
    const domainPrefix = `${sanitizedName}-${accountSuffix}`;

    this.userPoolDomain = this.userPool.addDomain('Domain', {
      cognitoDomain: {
        domainPrefix: domainPrefix,
      },
    });

    // Create App Client for Machine User (Client Credentials Flow)
    this.machineUserClient = this.userPool.addClient('MachineUserClient', {
      userPoolClientName: `${props.userPoolName}-machine`,
      generateSecret: true, // Required for Client Credentials Flow
      authFlows: {
        userPassword: false,
        userSrp: false,
        adminUserPassword: false,
        custom: false,
      },
      oAuth: {
        flows: {
          clientCredentials: true, // Enable Client Credentials Flow
        },
        scopes: [
          cognito.OAuthScope.resourceServer(this.resourceServer, {
            scopeName: 'invoke',
            scopeDescription: 'Invoke Agent API',
          }),
          cognito.OAuthScope.resourceServer(this.resourceServer, {
            scopeName: 'tools',
            scopeDescription: 'Access Gateway tools',
          }),
        ],
      },
      accessTokenValidity: cdk.Duration.hours(1),
      preventUserExistenceErrors: true,
    });

    // Set Machine Client dependencies
    this.machineUserClient.node.addDependency(this.resourceServer);
    this.machineUserClient.node.addDependency(this.userPoolDomain);

    // Set properties
    this.clientId = this.userPoolClient.userPoolClientId;
    this.machineUserClientId = this.machineUserClient.userPoolClientId;
    this.userPoolId = this.userPool.userPoolId;
    this.userPoolArn = this.userPool.userPoolArn;

    // Build OIDC Discovery URL
    const region = cdk.Stack.of(this).region;
    this.discoveryUrl = `https://cognito-idp.${region}.amazonaws.com/${this.userPoolId}/.well-known/openid-configuration`;

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: `${cdk.Stack.of(this).stackName}-UserPoolId`,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.clientId,
      description: 'Cognito User Pool App Client ID',
      exportName: `${cdk.Stack.of(this).stackName}-UserPoolClientId`,
    });

    new cdk.CfnOutput(this, 'DiscoveryUrl', {
      value: this.discoveryUrl,
      description: 'OIDC Discovery URL for JWT authentication',
      exportName: `${cdk.Stack.of(this).stackName}-DiscoveryUrl`,
    });

    new cdk.CfnOutput(this, 'MachineUserClientId', {
      value: this.machineUserClientId,
      description: 'Cognito Machine User App Client ID (for Client Credentials Flow)',
      exportName: `${cdk.Stack.of(this).stackName}-MachineUserClientId`,
    });

    new cdk.CfnOutput(this, 'TokenEndpoint', {
      value: `https://${domainPrefix}.auth.${region}.amazoncognito.com/oauth2/token`,
      description: 'OAuth2 Token Endpoint for Client Credentials Flow',
      exportName: `${cdk.Stack.of(this).stackName}-TokenEndpoint`,
    });

    new cdk.CfnOutput(this, 'DomainPrefix', {
      value: domainPrefix,
      description: 'Cognito User Pool Domain Prefix',
      exportName: `${cdk.Stack.of(this).stackName}-DomainPrefix`,
    });

    // Create test user (only when configured)
    if (props.testUser) {
      this.createTestUser(props.testUser);
    }
  }

  /**
   * Create test user
   */
  private createTestUser(testUser: { username: string; email: string; password: string }): void {
    // AwsCustomResource for user creation
    const createUser = new cr.AwsCustomResource(this, 'CreateTestUser', {
      onCreate: {
        service: 'CognitoIdentityServiceProvider',
        action: 'adminCreateUser',
        parameters: {
          UserPoolId: this.userPoolId,
          Username: testUser.username,
          UserAttributes: [
            {
              Name: 'email',
              Value: testUser.email,
            },
            {
              Name: 'email_verified',
              Value: 'true',
            },
          ],
          MessageAction: 'SUPPRESS', // Do not send welcome email
        },
        physicalResourceId: cr.PhysicalResourceId.of(`test-user-${testUser.username}`),
      },
      onUpdate: {
        service: 'CognitoIdentityServiceProvider',
        action: 'adminCreateUser',
        parameters: {
          UserPoolId: this.userPoolId,
          Username: testUser.username,
          UserAttributes: [
            {
              Name: 'email',
              Value: testUser.email,
            },
            {
              Name: 'email_verified',
              Value: 'true',
            },
          ],
          MessageAction: 'SUPPRESS',
        },
        physicalResourceId: cr.PhysicalResourceId.of(`test-user-${testUser.username}`),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['cognito-idp:AdminCreateUser'],
          resources: [this.userPoolArn],
        }),
      ]),
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // AwsCustomResource for password setting
    const setPassword = new cr.AwsCustomResource(this, 'SetTestUserPassword', {
      onCreate: {
        service: 'CognitoIdentityServiceProvider',
        action: 'adminSetUserPassword',
        parameters: {
          UserPoolId: this.userPoolId,
          Username: testUser.username,
          Password: testUser.password,
          Permanent: true, // No password change required
        },
        physicalResourceId: cr.PhysicalResourceId.of(`test-user-password-${testUser.username}`),
      },
      onUpdate: {
        service: 'CognitoIdentityServiceProvider',
        action: 'adminSetUserPassword',
        parameters: {
          UserPoolId: this.userPoolId,
          Username: testUser.username,
          Password: testUser.password,
          Permanent: true,
        },
        physicalResourceId: cr.PhysicalResourceId.of(`test-user-password-${testUser.username}`),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['cognito-idp:AdminSetUserPassword'],
          resources: [this.userPoolArn],
        }),
      ]),
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // Password setting is executed after user creation
    setPassword.node.addDependency(createUser);

    // Output test user information via CloudFormation Output
    new cdk.CfnOutput(this, 'TestUserUsername', {
      value: testUser.username,
      description: 'Test user username',
    });

    new cdk.CfnOutput(this, 'TestUserEmail', {
      value: testUser.email,
      description: 'Test user email',
    });
  }

  /**
   * Get parameters for JWT token verification
   * Used for AgentCore Runtime authorizerConfiguration
   */
  public getJwtAuthorizerConfig(): {
    discoveryUrl: string;
    allowedClients: string[];
  } {
    return {
      discoveryUrl: this.discoveryUrl,
      allowedClients: [this.clientId, this.machineUserClientId], // Regular + Machine User
    };
  }
}
