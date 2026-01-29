import { Construct } from 'constructs';
import * as agentcore from '@aws-cdk/aws-bedrock-agentcore-alpha';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Aws } from 'aws-cdk-lib';
import { CognitoAuth } from '../auth';

export interface AgentCoreGatewayProps {
  /**
   * Gateway name
   * Valid characters: a-z, A-Z, 0-9, _ (underscore), - (hyphen)
   * Maximum 100 characters
   */
  readonly gatewayName: string;

  /**
   * Gateway description (optional)
   * Maximum 200 characters
   */
  readonly description?: string;

  /**
   * Authentication type (optional)
   * @default cognito
   */
  readonly authType?: 'cognito' | 'iam' | 'jwt';

  /**
   * Cognito authentication settings (required when authType is 'cognito')
   * Uses externally created CognitoAuth
   */
  readonly cognitoAuth?: CognitoAuth;

  /**
   * JWT settings (required when authType is 'jwt')
   */
  readonly jwtConfig?: {
    readonly discoveryUrl: string;
    readonly allowedAudience?: string[];
    readonly allowedClients?: string[];
  };

  /**
   * MCP protocol settings (optional)
   */
  readonly mcpConfig?: {
    readonly instructions?: string;
    readonly searchType?: agentcore.McpGatewaySearchType;
    readonly supportedVersions?: agentcore.MCPProtocolVersion[];
  };
}

/**
 * Amazon Bedrock AgentCore Gateway Construct
 *
 * Creates a Gateway that serves as an integration point between agents and external services.
 */
export class AgentCoreGateway extends Construct {
  /**
   * Created Gateway instance
   */
  public readonly gateway: agentcore.Gateway;

  /**
   * Gateway ARN
   */
  public readonly gatewayArn: string;

  /**
   * Gateway ID
   */
  public readonly gatewayId: string;

  /**
   * Gateway endpoint URL
   */
  public readonly gatewayEndpoint: string;

  /**
   * IAM role for Gateway
   */
  public readonly gatewayRole: iam.Role;

  constructor(scope: Construct, id: string, props: AgentCoreGatewayProps) {
    super(scope, id);

    // Protocol configuration (MCP)
    const protocolConfiguration = new agentcore.McpProtocolConfiguration({
      instructions: props.mcpConfig?.instructions || 'Use this Gateway to connect to MCP tools',
      searchType: props.mcpConfig?.searchType || agentcore.McpGatewaySearchType.SEMANTIC,
      supportedVersions: props.mcpConfig?.supportedVersions || [
        agentcore.MCPProtocolVersion.MCP_2025_03_26,
      ],
    });

    // Authentication configuration
    let authorizerConfiguration: agentcore.IGatewayAuthorizerConfig | undefined;

    switch (props.authType) {
      case 'iam':
        authorizerConfiguration = agentcore.GatewayAuthorizer.usingAwsIam();
        break;

      case 'jwt':
        if (!props.jwtConfig?.discoveryUrl) {
          throw new Error('discoveryUrl is required when using JWT authentication');
        }
        authorizerConfiguration = agentcore.GatewayAuthorizer.usingCustomJwt({
          discoveryUrl: props.jwtConfig.discoveryUrl,
          allowedAudience: props.jwtConfig.allowedAudience,
          allowedClients: props.jwtConfig.allowedClients,
        });
        break;

      case 'cognito':
      default: {
        // Use externally created Cognito authentication
        if (!props.cognitoAuth) {
          throw new Error('cognitoAuth is required when using Cognito authentication');
        }

        const jwtConfig = props.cognitoAuth.getJwtAuthorizerConfig();
        authorizerConfiguration = agentcore.GatewayAuthorizer.usingCustomJwt({
          discoveryUrl: jwtConfig.discoveryUrl,
          allowedClients: jwtConfig.allowedClients,
        });
        break;
      }
    }

    // Create Gateway (L2 Construct creates a secure role internally)
    this.gateway = new agentcore.Gateway(this, 'Gateway', {
      gatewayName: props.gatewayName,
      description: props.description,
      protocolConfiguration: protocolConfiguration,
      authorizerConfiguration: authorizerConfiguration,
    });

    // Add required permissions to the role created by L2 Construct
    // Cast IRole to Role to enable using addToPolicy method
    const gatewayRole = this.gateway.role as iam.Role;

    // GetGateway permission
    gatewayRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'GetGateway',
        effect: iam.Effect.ALLOW,
        actions: ['bedrock-agentcore:GetGateway'],
        resources: [`arn:aws:bedrock-agentcore:${Aws.REGION}:${Aws.ACCOUNT_ID}:gateway/*`],
      })
    );

    // GetWorkloadAccessToken permission
    gatewayRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'GetWorkloadAccessToken',
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock-agentcore:GetWorkloadAccessToken',
          'bedrock-agentcore:GetWorkloadAccessTokenForJWT',
        ],
        resources: [
          `arn:aws:bedrock-agentcore:${Aws.REGION}:${Aws.ACCOUNT_ID}:workload-identity-directory/*`,
        ],
      })
    );

    // GetResourceOauth2Token permission
    gatewayRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'GetResourceOauth2Token',
        effect: iam.Effect.ALLOW,
        actions: ['bedrock-agentcore:GetResourceOauth2Token'],
        resources: [
          `arn:aws:bedrock-agentcore:${Aws.REGION}:${Aws.ACCOUNT_ID}:token-vault/*`,
          `arn:aws:bedrock-agentcore:${Aws.REGION}:${Aws.ACCOUNT_ID}:workload-identity-directory/*`,
        ],
      })
    );

    // GetSecretValue permission
    gatewayRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'GetSecretValue',
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [`arn:aws:secretsmanager:${Aws.REGION}:${Aws.ACCOUNT_ID}:secret:*`],
      })
    );

    // Expose the role created by L2 Construct
    this.gatewayRole = gatewayRole;

    this.gatewayArn = this.gateway.gatewayArn;
    this.gatewayId = this.gateway.gatewayId;
    this.gatewayEndpoint = this.gateway.gatewayUrl || '';
  }

  /**
   * Creates a basic Gateway.
   * To add targets, use the gateway property directly.
   *
   * Example:
   * gateway.gateway.addLambdaTarget("MyTarget", {
   *   gatewayTargetName: "MyTarget",
   *   lambdaFunction: myFunction,
   *   toolSchema: myToolSchema
   * });
   */
}
