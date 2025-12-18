#!/usr/bin/env node

/**
 * AgentCore Client CLI
 * メインエントリーポイント
 */

import { Command } from "commander";
import chalk from "chalk";
import { loadConfig } from "./config/index.js";
import { pingCommand } from "./commands/ping.js";
import { invokeCommand, interactiveMode } from "./commands/invoke.js";
import {
  configCommand,
  tokenInfoCommand,
  listProfilesCommand,
} from "./commands/config.js";

const program = new Command();

// プログラム情報
program
  .name("agentcore-client")
  .description("CLI client for AgentCore Runtime")
  .version("0.1.0");

// グローバルオプション
program
  .option("--endpoint <url>", "エンドポイントURL")
  .option("--json", "JSON形式で出力");

// Ping コマンド
program
  .command("ping")
  .description("Agent のヘルスチェック")
  .option("--json", "JSON形式で出力")
  .action(async (options) => {
    try {
      const globalOptions = program.opts();
      const config = loadConfig();

      // オプションで設定を上書き
      if (globalOptions.endpoint) {
        config.endpoint = globalOptions.endpoint;
        // エンドポイントが変更されたら Runtime 判定を再実行
        config.isAwsRuntime =
          config.endpoint.includes("bedrock-agentcore") &&
          config.endpoint.includes("/invocations");
      }

      await pingCommand(config, {
        json: options.json || globalOptions.json,
      });
    } catch (error) {
      console.error(
        chalk.red(
          `Error: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
      process.exit(1);
    }
  });

// Invoke コマンド
program
  .command("invoke")
  .description("Agent にプロンプトを送信")
  .argument("<prompt>", "送信するプロンプト")
  .option("--json", "JSON形式で出力")
  .option("--no-auth", "認証なしで実行")
  .action(async (prompt, options) => {
    try {
      const globalOptions = program.opts();
      const config = loadConfig();

      // オプションで設定を上書き
      if (globalOptions.endpoint) {
        config.endpoint = globalOptions.endpoint;
        // エンドポイントが変更されたら Runtime 判定を再実行
        config.isAwsRuntime =
          config.endpoint.includes("bedrock-agentcore") &&
          config.endpoint.includes("/invocations");
      }

      await invokeCommand(prompt, config, {
        json: options.json || globalOptions.json,
        noAuth: !options.auth, // --no-auth なので反転
      });
    } catch (error) {
      console.error(
        chalk.red(
          `Error: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
      process.exit(1);
    }
  });

// Interactive コマンド
program
  .command("interactive")
  .alias("i")
  .description("インタラクティブモードで Agent と対話")
  .action(async () => {
    try {
      const globalOptions = program.opts();
      const config = loadConfig();

      // オプションで設定を上書き
      if (globalOptions.endpoint) {
        config.endpoint = globalOptions.endpoint;
        // エンドポイントが変更されたら Runtime 判定を再実行
        config.isAwsRuntime =
          config.endpoint.includes("bedrock-agentcore") &&
          config.endpoint.includes("/invocations");
      }

      await interactiveMode(config);
    } catch (error) {
      console.error(
        chalk.red(
          `Error: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
      process.exit(1);
    }
  });

// Config コマンド
program
  .command("config")
  .description("設定の表示・管理")
  .option("--validate", "設定の検証")
  .option("--json", "JSON形式で出力")
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
        chalk.red(
          `Error: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
      process.exit(1);
    }
  });

// Token コマンド
program
  .command("token")
  .description("JWT トークン情報の表示")
  .action(async () => {
    try {
      const globalOptions = program.opts();
      const config = loadConfig();

      // オプションで設定を上書き
      if (globalOptions.endpoint) {
        config.endpoint = globalOptions.endpoint;
        // エンドポイントが変更されたら Runtime 判定を再実行
        config.isAwsRuntime =
          config.endpoint.includes("bedrock-agentcore") &&
          config.endpoint.includes("/invocations");
      }

      await tokenInfoCommand(config);
    } catch (error) {
      console.error(
        chalk.red(
          `Error: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
      process.exit(1);
    }
  });

// Runtimes コマンド（旧 Profiles）
program
  .command("runtimes")
  .alias("profiles") // 後方互換性
  .description("利用可能なランタイム一覧")
  .action(() => {
    try {
      listProfilesCommand();
    } catch (error) {
      console.error(
        chalk.red(
          `Error: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
      process.exit(1);
    }
  });

// デフォルトアクション（引数なしの場合）
program.action(() => {
  console.log(chalk.cyan("🤖 AgentCore Client"));
  console.log("");
  console.log("使用方法:");
  console.log("  agentcore-client <command> [options]");
  console.log("");
  console.log("コマンド:");
  console.log("  ping              Agent のヘルスチェック");
  console.log("  invoke <prompt>   Agent にプロンプトを送信");
  console.log("  interactive       インタラクティブモード");
  console.log("  config            設定の表示・管理");
  console.log("  token             JWT トークン情報");
  console.log("  runtimes          ランタイム一覧");
  console.log("");
  console.log("例:");
  console.log('  agentcore-client invoke "Hello, what is 1+1?"');
  console.log("  agentcore-client ping --endpoint http://localhost:3000");
  console.log("  agentcore-client config --validate");
  console.log("");
  console.log("環境変数での設定:");
  console.log("  AGENTCORE_ENDPOINT       ローカルエンドポイント");
  console.log("  AGENTCORE_RUNTIME_ARN    AWS Runtime ARN");
  console.log("  AGENTCORE_REGION         AWS リージョン");
  console.log("");
  console.log("詳細なヘルプ:");
  console.log("  agentcore-client --help");
  console.log("  agentcore-client <command> --help");
});

// エラーハンドリング
program.configureHelp({
  sortSubcommands: true,
});

program.showHelpAfterError();

// プログラム実行
try {
  program.parse(process.argv);

  // 引数が何も指定されていない場合はヘルプを表示
  if (process.argv.length <= 2) {
    program.help();
  }
} catch (error) {
  console.error(
    chalk.red(
      `Fatal error: ${error instanceof Error ? error.message : "Unknown error"}`
    )
  );
  process.exit(1);
}
