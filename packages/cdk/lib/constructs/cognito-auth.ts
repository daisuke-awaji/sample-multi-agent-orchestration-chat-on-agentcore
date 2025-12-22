import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as cdk from 'aws-cdk-lib';

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
   * User Pool ID
   */
  public readonly userPoolId: string;

  /**
   * User Pool ARN
   */
  public readonly userPoolArn: string;

  constructor(scope: Construct, id: string, props: CognitoAuthProps) {
    super(scope, id);

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
        email: false,
        phone: false,
      },

      // 削除保護
      deletionProtection: props.deletionProtection ?? false,

      // カスタム属性なし（シンプルな構成）
      customAttributes: {},

      // アカウント復旧
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
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

    // プロパティ設定
    this.clientId = this.userPoolClient.userPoolClientId;
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
      allowedClients: [this.clientId],
    };
  }
}
