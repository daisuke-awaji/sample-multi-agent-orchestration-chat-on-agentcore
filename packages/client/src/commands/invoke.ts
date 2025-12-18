/**
 * Invoke Command
 * Agent 呼び出しコマンド
 */

import chalk from "chalk";
import ora from "ora";
import { createClient } from "../api/client.js";
import type { ClientConfig } from "../config/index.js";

export async function invokeCommand(
  prompt: string,
  config: ClientConfig,
  options: {
    json?: boolean;
    noAuth?: boolean;
  }
): Promise<void> {
  const client = createClient(config);
  const useAuth = !options.noAuth;

  if (options.json) {
    try {
      const response = await client.invoke(prompt, useAuth);

      const output = {
        prompt,
        response,
        metadata: {
          endpoint: config.endpoint,
          runtime: config.isAwsRuntime
            ? "AWS AgentCore Runtime"
            : "ローカル環境",
          useAuth,
          timestamp: new Date().toISOString(),
        },
      };

      console.log(JSON.stringify(output, null, 2));
    } catch (error) {
      const errorOutput = {
        error: error instanceof Error ? error.message : "Unknown error",
        prompt,
        endpoint: config.endpoint,
        timestamp: new Date().toISOString(),
      };
      console.log(JSON.stringify(errorOutput, null, 2));
      process.exit(1);
    }
    return;
  }

  // 対話的UI
  console.log(chalk.cyan("🤖 AgentCore 呼び出し"));
  console.log(chalk.gray(`エンドポイント: ${config.endpoint}`));
  console.log(
    chalk.gray(
      `ランタイム: ${
        config.isAwsRuntime ? "AWS AgentCore Runtime" : "ローカル環境"
      }`
    )
  );
  console.log(chalk.gray(`認証: ${useAuth ? "有効" : "無効"}`));
  console.log("");

  console.log(chalk.bold("📝 プロンプト:"));
  console.log(chalk.white(`"${prompt}"`));
  console.log("");

  const spinner = ora("Agent が考えています...").start();

  try {
    const response = await client.invoke(prompt, useAuth);
    spinner.succeed(chalk.green("Agent が応答しました"));

    console.log("");
    console.log(chalk.bold("💬 Agent の応答:"));
    console.log(chalk.white("─".repeat(60)));

    // レスポンスの内容を表示
    if (
      response.response.lastMessage?.content &&
      response.response.lastMessage.content.length > 0
    ) {
      response.response.lastMessage.content.forEach(
        (content: any, index: number) => {
          if (content.text) {
            console.log(chalk.white(content.text));
            if (index < response.response.lastMessage!.content.length - 1) {
              console.log("");
            }
          }
        }
      );
    } else {
      console.log(chalk.yellow("（応答が空でした）"));
    }

    console.log(chalk.white("─".repeat(60)));

    // メタデータ情報
    console.log("");
    console.log(chalk.bold("📊 実行情報:"));
    console.log(
      `${chalk.blue("🆔")} リクエストID: ${chalk.gray(
        response.metadata?.requestId || "N/A"
      )}`
    );
    console.log(
      `${chalk.blue("🛑")} 停止理由: ${chalk.gray(
        response.response.stopReason || "N/A"
      )}`
    );
  } catch (error) {
    spinner.fail(chalk.red("Agent 呼び出しに失敗しました"));

    console.log("");
    console.log(chalk.red("❌ エラー詳細:"));
    console.log(
      chalk.red(`   ${error instanceof Error ? error.message : "不明なエラー"}`)
    );

    console.log("");
    console.log(chalk.yellow("💡 トラブルシューティング:"));
    console.log(chalk.gray("   1. プロンプトが空でないか確認してください"));
    console.log(chalk.gray("   2. サーバーが起動しているか確認してください"));
    console.log(chalk.gray("   3. ネットワーク接続を確認してください"));

    if (useAuth && config.isAwsRuntime) {
      console.log(chalk.gray("   4. Cognito認証情報を確認してください"));
      console.log(
        chalk.gray("   5. --no-auth オプションで認証なしを試してください")
      );
    }

    process.exit(1);
  }
}

/**
 * インタラクティブモード
 */
export async function interactiveMode(config: ClientConfig): Promise<void> {
  const client = createClient(config);

  console.log(chalk.cyan("🔄 AgentCore インタラクティブモード"));
  console.log(chalk.gray(`エンドポイント: ${config.endpoint}`));
  console.log(
    chalk.gray("終了するには 'exit' または Ctrl+C を入力してください")
  );
  console.log("");

  // Node.js の readline を使用したインタラクティブモード
  const readline = await import("readline");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.blue("AgentCore> "),
  });

  rl.prompt();

  rl.on("line", async (input) => {
    const trimmed = input.trim();

    // 空の入力は無視してプロンプトを再表示
    if (trimmed === "") {
      rl.prompt();
      return;
    }

    // exit/quit で終了
    if (trimmed === "exit" || trimmed === "quit") {
      console.log(chalk.yellow("👋 セッションを終了します"));
      rl.close();
      return;
    }

    // 非同期処理中は readline を一時停止
    rl.pause();

    try {
      const spinner = ora("Agent が考えています...").start();
      const result = await client.invoke(trimmed);
      spinner.succeed(chalk.green("応答完了"));

      console.log("");
      if (
        result.response.lastMessage?.content &&
        result.response.lastMessage.content.length > 0
      ) {
        result.response.lastMessage.content.forEach((content: any) => {
          if (content.text) {
            console.log(chalk.white(content.text));
          }
        });
      }
      console.log("");
    } catch (error) {
      console.log("");
      console.log(
        chalk.red(
          `エラー: ${error instanceof Error ? error.message : "不明なエラー"}`
        )
      );
      console.log("");
    } finally {
      // 処理完了後に再開してプロンプト表示
      rl.resume();
      rl.prompt();
    }
  });

  rl.on("close", () => {
    process.exit(0);
  });
}
