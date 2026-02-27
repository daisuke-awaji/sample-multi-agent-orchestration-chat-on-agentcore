/**
 * Ping Command
 * Health check command for the Agent
 */

import chalk from 'chalk';
import ora from 'ora';
import { createClient } from '../api/client.js';
import type { ClientConfig } from '../config/index.js';

export async function pingCommand(
  config: ClientConfig,
  options: {
    json?: boolean;
  }
): Promise<void> {
  const client = createClient(config);

  if (options.json) {
    try {
      const result = await client.testConnection();
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      const errorOutput = {
        error: error instanceof Error ? error.message : 'Unknown error',
        endpoint: config.endpoint,
        timestamp: new Date().toISOString(),
      };
      console.log(JSON.stringify(errorOutput, null, 2));
      process.exit(1);
    }
    return;
  }

  console.log(chalk.cyan('🏥 AgentCore ヘルスチェック'));
  console.log(chalk.gray(`エンドポイント: ${config.endpoint}`));
  console.log(
    chalk.gray(`ランタイム: ${config.isAwsRuntime ? 'AWS AgentCore Runtime' : 'ローカル環境'}`)
  );
  console.log('');

  const spinner = ora('接続中...').start();

  try {
    const result = await client.testConnection();

    spinner.succeed(chalk.green('接続成功'));

    console.log('');
    console.log(chalk.bold('📊 ヘルスチェック結果:'));
    console.log(`${chalk.green('✅')} ステータス: ${chalk.bold(result.ping.status)}`);
    console.log(
      `${chalk.blue('🕐')} 最終更新: ${new Date(
        result.ping.time_of_last_update * 1000
      ).toLocaleString()}`
    );

    console.log('');
    console.log(chalk.bold('🔧 サービス情報:'));
    console.log(`${chalk.blue('📝')} サービス: ${chalk.bold(result.serviceInfo.service)}`);
    console.log(`${chalk.blue('🏷️')} バージョン: ${chalk.bold(result.serviceInfo.version)}`);
    console.log(`${chalk.blue('🚀')} ステータス: ${chalk.bold(result.serviceInfo.status)}`);

    console.log('');
    console.log(chalk.bold('⚡ パフォーマンス:'));
    console.log(`${chalk.yellow('⏱️')} 接続時間: ${chalk.bold(result.connectionTime)}ms`);

    // Endpoint information
    if (result.serviceInfo.endpoints) {
      console.log('');
      console.log(chalk.bold('🔗 利用可能エンドポイント:'));
      Object.entries(result.serviceInfo.endpoints).forEach(([key, value]) => {
        console.log(`  ${chalk.gray('•')} ${key}: ${chalk.cyan(value)}`);
      });
    }
  } catch (error) {
    spinner.fail(chalk.red('接続失敗'));

    console.log('');
    console.log(chalk.red('❌ エラー詳細:'));
    console.log(chalk.red(`   ${error instanceof Error ? error.message : '不明なエラー'}`));

    console.log('');
    console.log(chalk.yellow('💡 トラブルシューティング:'));
    console.log(chalk.gray('   1. エンドポイントが正しいか確認してください'));
    console.log(chalk.gray('   2. サーバーが起動しているか確認してください'));
    console.log(chalk.gray('   3. ネットワーク接続を確認してください'));

    if (config.isAwsRuntime) {
      console.log(chalk.gray('   4. Cognito認証情報を確認してください'));
    }

    process.exit(1);
  }
}
