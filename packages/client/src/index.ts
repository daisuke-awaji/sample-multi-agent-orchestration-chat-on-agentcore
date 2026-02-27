#!/usr/bin/env node

/**
 * AgentCore Client CLI
 * Main entry point
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from './config/index.js';
import { pingCommand } from './commands/ping.js';
import { invokeCommand, interactiveMode } from './commands/invoke.js';
import { configCommand, tokenInfoCommand, listProfilesCommand } from './commands/config.js';

const program = new Command();

// Program information
program.name('agentcore-client').description('CLI client for AgentCore Runtime').version('0.1.0');

// Global options
program
  .option('--endpoint <url>', 'エンドポイントURL')
  .option('--json', 'JSON形式で出力')
  .option('--machine-user', 'マシンユーザー認証を使用')
  .option('--target-user <userId>', '対象ユーザーID（マシンユーザーモード時）');

// Ping command
program
  .command('ping')
  .description('Agent のヘルスチェック')
  .option('--json', 'JSON形式で出力')
  .action(async (options) => {
    try {
      const globalOptions = program.opts();
      const config = loadConfig();

      // Override settings with options
      if (globalOptions.endpoint) {
        config.endpoint = globalOptions.endpoint;
        // Re-evaluate Runtime detection if endpoint has changed
        config.isAwsRuntime =
          config.endpoint.includes('bedrock-agentcore') && config.endpoint.includes('/invocations');
      }

      await pingCommand(config, {
        json: options.json || globalOptions.json,
      });
    } catch (error) {
      console.error(
        chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      );
      process.exit(1);
    }
  });

// Invoke command
program
  .command('invoke')
  .description('Agent にプロンプトを送信')
  .argument('<prompt>', '送信するプロンプト')
  .option('--json', 'JSON形式で出力')
  .option('--session-id <id>', 'セッションID（会話の継続に使用）')
  .option('--no-auth', '認証なしで実行')
  .action(async (prompt, options) => {
    try {
      const globalOptions = program.opts();
      const config = loadConfig();

      // Override settings with options
      if (globalOptions.endpoint) {
        config.endpoint = globalOptions.endpoint;
        // Re-evaluate Runtime detection if endpoint has changed
        config.isAwsRuntime =
          config.endpoint.includes('bedrock-agentcore') && config.endpoint.includes('/invocations');
      }

      // Override options for machine user mode
      if (globalOptions.machineUser) {
        config.authMode = 'machine';
      }
      if (globalOptions.targetUser && config.machineUser) {
        config.machineUser.targetUserId = globalOptions.targetUser;
      }

      // Determine session ID: CLI > environment variable
      const sessionId = options.sessionId || process.env.SESSION_ID;

      await invokeCommand(prompt, config, {
        json: options.json || globalOptions.json,
        sessionId,
      });
    } catch (error) {
      console.error(
        chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      );
      process.exit(1);
    }
  });

// Interactive command
program
  .command('interactive')
  .alias('i')
  .description('インタラクティブモードで Agent と対話')
  .action(async () => {
    try {
      const globalOptions = program.opts();
      const config = loadConfig();

      // Override settings with options
      if (globalOptions.endpoint) {
        config.endpoint = globalOptions.endpoint;
        // Re-evaluate Runtime detection if endpoint has changed
        config.isAwsRuntime =
          config.endpoint.includes('bedrock-agentcore') && config.endpoint.includes('/invocations');
      }

      // Override options for machine user mode
      if (globalOptions.machineUser) {
        config.authMode = 'machine';
      }
      if (globalOptions.targetUser && config.machineUser) {
        config.machineUser.targetUserId = globalOptions.targetUser;
      }

      await interactiveMode(config);
    } catch (error) {
      console.error(
        chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      );
      process.exit(1);
    }
  });

// Config command
program
  .command('config')
  .description('設定の表示・管理')
  .option('--validate', '設定の検証')
  .option('--json', 'JSON形式で出力')
  .action(async (options) => {
    try {
      const globalOptions = program.opts();

      await configCommand({
        json: options.json || globalOptions.json,
        endpoint: globalOptions.endpoint,
        validate: options.validate,
      });
    } catch (error) {
      console.error(
        chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      );
      process.exit(1);
    }
  });

// Token command
program
  .command('token')
  .description('JWT トークン情報の表示')
  .option('--machine', 'マシンユーザートークンを表示')
  .action(async (options) => {
    try {
      const globalOptions = program.opts();
      const config = loadConfig();

      // Override settings with options
      if (globalOptions.endpoint) {
        config.endpoint = globalOptions.endpoint;
        // Re-evaluate Runtime detection if endpoint has changed
        config.isAwsRuntime =
          config.endpoint.includes('bedrock-agentcore') && config.endpoint.includes('/invocations');
      }

      // Override options for machine user mode
      if (options.machine || globalOptions.machineUser) {
        config.authMode = 'machine';
      }

      await tokenInfoCommand(config);
    } catch (error) {
      console.error(
        chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      );
      process.exit(1);
    }
  });

// Runtimes command (formerly Profiles)
program
  .command('runtimes')
  .alias('profiles') // For backward compatibility
  .description('利用可能なランタイム一覧')
  .action(() => {
    try {
      listProfilesCommand();
    } catch (error) {
      console.error(
        chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      );
      process.exit(1);
    }
  });

// Default action (when no arguments are provided)
program.action(() => {
  console.log(chalk.cyan('🤖 AgentCore Client'));
  console.log('');
  console.log('使用方法:');
  console.log('  agentcore-client <command> [options]');
  console.log('');
  console.log('コマンド:');
  console.log('  ping              Agent のヘルスチェック');
  console.log('  invoke <prompt>   Agent にプロンプトを送信');
  console.log('  interactive       インタラクティブモード');
  console.log('  config            設定の表示・管理');
  console.log('  token             JWT トークン情報');
  console.log('  runtimes          ランタイム一覧');
  console.log('');
  console.log('例:');
  console.log('  agentcore-client invoke "Hello, what is 1+1?"');
  console.log('  agentcore-client ping --endpoint http://localhost:3000');
  console.log('  agentcore-client config --validate');
  console.log('');
  console.log('環境変数での設定:');
  console.log('  AGENTCORE_ENDPOINT       ローカルエンドポイント');
  console.log('  AGENTCORE_RUNTIME_ARN    AWS Runtime ARN');
  console.log('  AGENTCORE_REGION         AWS リージョン');
  console.log('  AUTH_MODE                認証モード (user | machine)');
  console.log('');
  console.log('マシンユーザー認証:');
  console.log('  COGNITO_DOMAIN           Cognito ドメイン');
  console.log('  MACHINE_CLIENT_ID        マシンクライアント ID');
  console.log('  MACHINE_CLIENT_SECRET    マシンクライアントシークレット');
  console.log('  TARGET_USER_ID           対象ユーザー ID');
  console.log('  COGNITO_SCOPE            OAuth スコープ（オプション）');
  console.log('');
  console.log('詳細なヘルプ:');
  console.log('  agentcore-client --help');
  console.log('  agentcore-client <command> --help');
});

// Error handling
program.configureHelp({
  sortSubcommands: true,
});

program.showHelpAfterError();

// Execute program
try {
  program.parse(process.argv);

  // Show help if no arguments are provided
  if (process.argv.length <= 2) {
    program.help();
  }
} catch (error) {
  console.error(
    chalk.red(`Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`)
  );
  process.exit(1);
}
