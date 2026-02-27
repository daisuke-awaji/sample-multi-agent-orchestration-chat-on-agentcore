/**
 * Config Command
 * Command for displaying and managing configuration
 */

import chalk from 'chalk';
import { loadConfig, formatConfigForDisplay, validateConfig } from '../config/index.js';
import type { ClientConfig } from '../config/index.js';
import { getTokenInfo } from '../auth/cognito.js';
import { getMachineUserToken, getMachineTokenInfo } from '../auth/machine-user.js';

export async function configCommand(options: {
  json?: boolean;
  endpoint?: string;
  validate?: boolean;
}): Promise<void> {
  const config = loadConfig();

  // Override settings with options
  if (options.endpoint) {
    config.endpoint = options.endpoint;
    // Re-evaluate Runtime detection if endpoint has changed
    config.isAwsRuntime =
      config.endpoint.includes('bedrock-agentcore') && config.endpoint.includes('/invocations');
  }

  if (options.json) {
    if (options.validate) {
      const errors = validateConfig(config);
      const output = {
        config: formatConfigForDisplay(config),
        validation: {
          isValid: errors.length === 0,
          errors,
        },
      };
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.log(JSON.stringify(formatConfigForDisplay(config), null, 2));
    }
    return;
  }

  // Interactive display
  console.log(chalk.cyan('⚙️ AgentCore クライアント設定'));
  console.log('');

  console.log(chalk.bold('🔧 基本設定:'));
  console.log(`${chalk.blue('🌐')} エンドポイント: ${chalk.white(config.endpoint)}`);
  console.log(
    `${chalk.blue('📋')} ランタイム: ${chalk.white(
      config.isAwsRuntime ? 'AWS AgentCore Runtime' : 'ローカル環境'
    )}`
  );
  const displayConfig = formatConfigForDisplay(config);
  console.log(`${chalk.blue('🔐')} 認証モード: ${chalk.white(displayConfig.authMode)}`);

  console.log('');
  if (config.authMode === 'machine' && displayConfig.machineUser) {
    console.log(chalk.bold('🤖 マシンユーザー認証設定:'));
    console.log(
      `${chalk.blue('🌐')} Cognito ドメイン: ${chalk.white(displayConfig.machineUser.cognitoDomain)}`
    );
    console.log(
      `${chalk.blue('🆔')} Client ID: ${chalk.white(displayConfig.machineUser.clientId)}`
    );
    console.log(
      `${chalk.blue('🔑')} Client Secret: ${chalk.gray(displayConfig.machineUser.clientSecret)}`
    );
    console.log(
      `${chalk.blue('🎯')} Target User ID: ${chalk.white(displayConfig.machineUser.targetUserId)}`
    );
    if (displayConfig.machineUser.scope) {
      console.log(`${chalk.blue('📋')} Scope: ${chalk.white(displayConfig.machineUser.scope)}`);
    }
  } else {
    console.log(chalk.bold('🔐 Cognito 認証設定:'));
    console.log(
      `${chalk.blue('🏊')} User Pool ID: ${chalk.white(displayConfig.cognito.userPoolId)}`
    );
    console.log(`${chalk.blue('🆔')} Client ID: ${chalk.white(displayConfig.cognito.clientId)}`);
    console.log(`${chalk.blue('👤')} Username: ${chalk.white(displayConfig.cognito.username)}`);
    console.log(`${chalk.blue('🔑')} Password: ${chalk.gray(displayConfig.cognito.password)}`);
    console.log(`${chalk.blue('🌍')} Region: ${chalk.white(displayConfig.cognito.region)}`);
  }

  // Configuration validation
  if (options.validate) {
    console.log('');
    console.log(chalk.bold('✅ 設定の検証:'));

    const errors = validateConfig(config);
    if (errors.length === 0) {
      console.log(chalk.green('✅ 設定は有効です'));
    } else {
      console.log(chalk.red('❌ 設定にエラーがあります:'));
      errors.forEach((error, index) => {
        console.log(chalk.red(`   ${index + 1}. ${error}`));
      });
    }
  }

  // Runtime description
  console.log('');
  console.log(chalk.bold('📚 ランタイムについて:'));
  console.log(`${chalk.yellow('🏠')} ローカル環境: docker compose や開発サーバー`);
  console.log(`${chalk.yellow('☁️')} AWS AgentCore Runtime: Amazon Bedrock AgentCore`);

  // Environment variable description
  console.log('');
  console.log(chalk.bold('🔨 設定方法:'));
  console.log(chalk.gray('以下の環境変数で設定を変更できます:'));
  console.log(chalk.gray('• AGENTCORE_ENDPOINT (ローカル環境)'));
  console.log(chalk.gray('• AGENTCORE_RUNTIME_ARN (AWS 環境)'));
  console.log(chalk.gray('• AGENTCORE_REGION (AWS 環境)'));
  console.log(chalk.gray('• AUTH_MODE (user | machine)'));

  if (config.authMode === 'machine') {
    console.log(chalk.gray('• COGNITO_DOMAIN (マシンユーザー)'));
    console.log(chalk.gray('• MACHINE_CLIENT_ID (マシンユーザー)'));
    console.log(chalk.gray('• MACHINE_CLIENT_SECRET (マシンユーザー)'));
    console.log(chalk.gray('• TARGET_USER_ID (マシンユーザー)'));
    console.log(chalk.gray('• COGNITO_SCOPE (マシンユーザー、オプション)'));
  } else {
    console.log(chalk.gray('• COGNITO_USER_POOL_ID'));
    console.log(chalk.gray('• COGNITO_CLIENT_ID'));
    console.log(chalk.gray('• COGNITO_USERNAME'));
    console.log(chalk.gray('• COGNITO_PASSWORD'));
    console.log(chalk.gray('• COGNITO_REGION'));
  }

  console.log('');
  console.log(chalk.gray('または .env ファイルを作成してください'));
}

/**
 * JWT token information display
 */
export async function tokenInfoCommand(config: ClientConfig): Promise<void> {
  console.log(chalk.cyan('🎫 JWT トークン情報'));
  console.log('');

  if (!config.isAwsRuntime && config.authMode !== 'machine') {
    console.log(chalk.yellow('⚠️ ローカル環境では JWT 認証は不要です'));
    return;
  }

  try {
    if (config.authMode === 'machine' && config.machineUser) {
      // Machine user token
      const authResult = await getMachineUserToken(config.machineUser);
      const tokenInfo = getMachineTokenInfo(authResult.accessToken);

      if (!tokenInfo) {
        console.log(chalk.red('❌ トークンの解析に失敗しました'));
        return;
      }

      console.log(chalk.bold('📋 マシンユーザートークン詳細:'));
      console.log(`${chalk.blue('🆔')} Client ID: ${chalk.white(tokenInfo.client_id || 'N/A')}`);
      console.log(`${chalk.blue('🎯')} Subject: ${chalk.white(tokenInfo.sub || 'N/A')}`);
      console.log(`${chalk.blue('🏛️')} Issuer: ${chalk.white(tokenInfo.iss || 'N/A')}`);
      if (tokenInfo.scope) {
        console.log(`${chalk.blue('📋')} Scope: ${chalk.white(tokenInfo.scope)}`);
      }

      // Display issuance time and expiration
      console.log(
        `${chalk.blue('🕐')} 発行日時: ${chalk.white(new Date(Number(tokenInfo.iat) * 1000).toLocaleString())}`
      );
      console.log(
        `${chalk.blue('⏰')} 有効期限: ${chalk.white(new Date(Number(tokenInfo.exp) * 1000).toLocaleString())}`
      );

      // Check expiration
      const expiresAt = new Date(Number(tokenInfo.exp) * 1000);
      const now = new Date();
      const remainingTime = Math.max(0, expiresAt.getTime() - now.getTime());
      const remainingMinutes = Math.floor(remainingTime / (1000 * 60));

      console.log('');
      console.log(chalk.bold('⏳ 有効期限ステータス:'));
      if (remainingTime > 0) {
        if (remainingMinutes > 60) {
          console.log(
            chalk.green(
              `✅ 有効 (残り ${Math.floor(remainingMinutes / 60)} 時間 ${remainingMinutes % 60} 分)`
            )
          );
        } else {
          console.log(chalk.yellow(`⚠️ 間もなく期限切れ (残り ${remainingMinutes} 分)`));
        }
      } else {
        console.log(chalk.red('❌ 期限切れ'));
      }
    } else {
      // Regular user token
      const { getCachedJwtToken } = await import('../auth/cognito.js');
      const authResult = await getCachedJwtToken(config.cognito);
      const tokenInfo = getTokenInfo(authResult.accessToken);

      if (!tokenInfo) {
        console.log(chalk.red('❌ トークンの解析に失敗しました'));
        return;
      }

      console.log(chalk.bold('📋 トークン詳細:'));
      console.log(`${chalk.blue('🆔')} Subject: ${chalk.white(tokenInfo.sub)}`);
      console.log(`${chalk.blue('👤')} Username: ${chalk.white(tokenInfo.username || 'N/A')}`);
      console.log(`${chalk.blue('🏛️')} Issuer: ${chalk.white(tokenInfo.iss)}`);
      console.log(`${chalk.blue('🎯')} Audience: ${chalk.white(tokenInfo.aud)}`);

      // Display issuance time and expiration
      console.log(
        `${chalk.blue('🕐')} 発行日時: ${chalk.white(new Date(tokenInfo.iat).toLocaleString())}`
      );
      console.log(
        `${chalk.blue('⏰')} 有効期限: ${chalk.white(new Date(tokenInfo.exp).toLocaleString())}`
      );

      // Check expiration
      const expiresAt = new Date(tokenInfo.exp);
      const now = new Date();
      const remainingTime = Math.max(0, expiresAt.getTime() - now.getTime());
      const remainingMinutes = Math.floor(remainingTime / (1000 * 60));

      console.log('');
      console.log(chalk.bold('⏳ 有効期限ステータス:'));
      if (remainingTime > 0) {
        if (remainingMinutes > 60) {
          console.log(
            chalk.green(
              `✅ 有効 (残り ${Math.floor(remainingMinutes / 60)} 時間 ${remainingMinutes % 60} 分)`
            )
          );
        } else {
          console.log(chalk.yellow(`⚠️ 間もなく期限切れ (残り ${remainingMinutes} 分)`));
        }
      } else {
        console.log(chalk.red('❌ 期限切れ'));
      }
    }
  } catch (error) {
    console.log(chalk.red('❌ トークンの取得に失敗しました'));
    console.log(chalk.red(`   ${error instanceof Error ? error.message : '不明なエラー'}`));
  }
}

/**
 * Display list of available runtimes
 */
export function listProfilesCommand(): void {
  console.log(chalk.cyan('📋 利用可能なランタイム'));
  console.log('');

  const runtimes = [
    {
      name: 'ローカル環境',
      description: 'docker compose や開発サーバー',
      setup: 'AGENTCORE_ENDPOINT=http://localhost:8080',
      auth: '不要',
      icon: '🏠',
    },
    {
      name: 'AWS AgentCore Runtime',
      description: 'Amazon Bedrock AgentCore',
      setup: 'AGENTCORE_RUNTIME_ARN=arn:aws:bedrock-agentcore:...',
      auth: 'Cognito JWT',
      icon: '☁️',
    },
  ];

  runtimes.forEach((runtime) => {
    console.log(`${runtime.icon} ${chalk.bold(runtime.name)}`);
    console.log(`   ${chalk.gray('説明:')} ${runtime.description}`);
    console.log(`   ${chalk.gray('設定例:')} ${runtime.setup}`);
    console.log(`   ${chalk.gray('認証:')} ${runtime.auth}`);
    console.log('');
  });

  console.log(chalk.bold('使用方法:'));
  console.log(chalk.gray('ローカル環境: AGENTCORE_ENDPOINT を設定'));
  console.log(chalk.gray('AWS 環境: AGENTCORE_RUNTIME_ARN を設定'));
}
