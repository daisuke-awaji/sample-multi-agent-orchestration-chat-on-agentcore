import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface CognitoAuthProps {
  /**
   * Cognito User Pool の名前
   */
  readonly userPoolName: string;

  /**
   * App Client の名前
   * デフォルト: "{userPoolName}-client"
   */
  readonly appClientName?: string;

  /**
   * パスワードポリシーの最小文字数
   * デフォルト: 8
   */
  readonly passwordMinLength?: number;

  /**
   * ユーザー削除保護の有効化
   * デフォルト: false (開発環境用)
   */
  readonly deletionProtection?: boolean;

  /**
   * User Pool の追加設定
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
   * 許可するメールドメインのリスト (オプション)
   * 設定した場合、これらのドメインのメールアドレスのみサインアップ可能
   * 例: ['amazon.com', 'amazon.jp']
   */
  readonly allowedSignUpEmailDomains?: string[];

  /**
   * テストユーザー設定 (オプション、開発環境用)
   * 設定した場合、デプロイ時にテストユーザーを自動作成
   */
  readonly testUser?: {
    readonly username: string;
    readonly email: string;
    readonly password: string;
  };
}

/**
 * AgentCore用 Cognito User Pool + App Client Construct
 *
 * Gateway と Runtime で共有するCognito認証基盤を提供します。
 */
export class CognitoAuth extends Construct {
  /**
   * 作成されたUser Pool
   */
  public readonly userPool: cognito.UserPool;

  /**
   * 作成されたApp Client
   */
  public readonly userPoolClient: cognito.UserPoolClient;

  /**
   * OIDC Discovery URL
   * AgentCore のJWT authorizerで使用
   */
  public readonly discoveryUrl: string;

  /**
   * App Client ID
   * JWT token の client_id claim 検証で使用
   */
  public readonly clientId: string;

  /**
   * Machine User用のApp Client
   * Client Credentials Flowで使用
   */
  public readonly machineUserClient: cognito.UserPoolClient;

  /**
   * Machine User用のApp Client ID
   */
  public readonly machineUserClientId: string;

  /**
   * Resource Server (OAuth2スコープ定義)
   */
  public readonly resourceServer: cognito.UserPoolResourceServer;

  /**
   * User Pool Domain
   * Token endpointへのアクセスに必要
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

    // Pre Sign Up Lambda トリガー (メールドメイン検証用)
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

    // User Pool 作成
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: props.userPoolName,

      // パスワードポリシー
      passwordPolicy: {
        minLength: props.passwordMinLength || 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },

      // MFA設定
      mfa: props.userPoolConfig?.mfa || cognito.Mfa.OFF,

      // セルフサインアップ
      selfSignUpEnabled: props.userPoolConfig?.selfSignUpEnabled ?? false,

      // 自動検証
      autoVerify: {
        email: props.userPoolConfig?.autoVerify?.email ?? false,
        phone: props.userPoolConfig?.autoVerify?.phone ?? false,
      },

      // サインイン設定
      signInAliases: {
        username: true,
        email: true,
        phone: false,
      },

      // 削除保護
      deletionProtection: props.deletionProtection ?? false,

      // カスタム属性なし（シンプルな構成）
      customAttributes: {},

      // アカウント復旧
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,

      // Lambda トリガー設定
      lambdaTriggers: preSignUpTrigger
        ? {
            preSignUp: preSignUpTrigger,
          }
        : undefined,
    });

    // App Client 作成
    this.userPoolClient = this.userPool.addClient('AppClient', {
      userPoolClientName: props.appClientName || `${props.userPoolName}-client`,

      // 認証フロー設定
      authFlows: {
        userPassword: true, // USER_PASSWORD_AUTH (必須)
        userSrp: true, // SRP認証を有効化
        adminUserPassword: true, // ADMIN_USER_PASSWORD_AUTH
        custom: false, // CUSTOM_AUTH無効
      },

      // OAuth設定を完全に削除（JWT認証には不要）

      // トークン有効期限
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),

      // セキュリティ設定
      generateSecret: false, // Public client (secret不要)
      preventUserExistenceErrors: true,
    });

    // Resource Server 作成 (OAuth2スコープ定義)
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

    // User Pool Domain 作成 (Token endpoint access用)
    // 安全なドメインプレフィックス生成: 英数字のみ、ハイフンで区切り
    const sanitizedName = props.userPoolName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')  // 英数字以外を削除
      .substring(0, 20);           // 最大20文字
    const accountSuffix = cdk.Stack.of(this).account.substring(0, 8);
    const domainPrefix = `${sanitizedName}-${accountSuffix}`;
    
    this.userPoolDomain = this.userPool.addDomain('Domain', {
      cognitoDomain: {
        domainPrefix: domainPrefix,
      },
    });

    // Machine User用のApp Client作成 (Client Credentials Flow)
    this.machineUserClient = this.userPool.addClient('MachineUserClient', {
      userPoolClientName: `${props.userPoolName}-machine`,
      generateSecret: true, // Client Credentials Flowに必須
      authFlows: {
        userPassword: false,
        userSrp: false,
        adminUserPassword: false,
        custom: false,
      },
      oAuth: {
        flows: {
          clientCredentials: true, // Client Credentials Flowを有効化
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

    // Machine Clientの依存関係を設定
    this.machineUserClient.node.addDependency(this.resourceServer);
    this.machineUserClient.node.addDependency(this.userPoolDomain);

    // プロパティ設定
    this.clientId = this.userPoolClient.userPoolClientId;
    this.machineUserClientId = this.machineUserClient.userPoolClientId;
    this.userPoolId = this.userPool.userPoolId;
    this.userPoolArn = this.userPool.userPoolArn;

    // OIDC Discovery URL 構築
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

    // テストユーザーの作成（設定されている場合のみ）
    if (props.testUser) {
      this.createTestUser(props.testUser);
    }
  }

  /**
   * テストユーザーを作成する
   */
  private createTestUser(testUser: { username: string; email: string; password: string }): void {
    // ユーザー作成用の AwsCustomResource
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
          MessageAction: 'SUPPRESS', // Welcome email を送信しない
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

    // パスワード設定用の AwsCustomResource
    const setPassword = new cr.AwsCustomResource(this, 'SetTestUserPassword', {
      onCreate: {
        service: 'CognitoIdentityServiceProvider',
        action: 'adminSetUserPassword',
        parameters: {
          UserPoolId: this.userPoolId,
          Username: testUser.username,
          Password: testUser.password,
          Permanent: true, // パスワード変更不要
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

    // パスワード設定はユーザー作成後に実行
    setPassword.node.addDependency(createUser);

    // CloudFormation Output でテストユーザー情報を出力
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
   * JWT token 検証用のパラメータを取得
   * AgentCore Runtime の authorizerConfiguration で使用
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
