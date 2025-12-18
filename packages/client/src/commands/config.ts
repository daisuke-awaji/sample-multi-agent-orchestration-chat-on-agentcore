/**
 * Config Command
 * 設定表示・管理コマンド
 */

import chalk from "chalk";
import {
  loadConfig,
  formatConfigForDisplay,
  validateConfig,
  getEndpointForProfile,
} from "../config/index.js";
import type { ClientConfig } from "../config/index.js";
import { getTokenInfo } from "../auth/cognito.js";

export async function configCommand(options: {
  json?: boolean;
  profile?: string;
  endpoint?: string;
  validate?: boolean;
}): Promise<void> {
  const config = loadConfig();

  // オプションで設定を上書き
  if (options.profile) {
    config.profile = options.profile as "local" | "agentcore";
    config.endpoint = getEndpointForProfile(options.profile);
  }

  if (options.endpoint) {
    config.endpoint = options.endpoint;
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

  // 対話的表示
  console.log(chalk.cyan("⚙️ AgentCore クライアント設定"));
  console.log("");

  console.log(chalk.bold("🔧 基本設定:"));
  console.log(
    `${chalk.blue("🌐")} エンドポイント: ${chalk.white(config.endpoint)}`
  );
  console.log(
    `${chalk.blue("📋")} プロファイル: ${chalk.white(config.profile)}`
  );

  console.log("");
  console.log(chalk.bold("🔐 Cognito 認証設定:"));
  const displayConfig = formatConfigForDisplay(config);
  console.log(
    `${chalk.blue("🏊")} User Pool ID: ${chalk.white(
      displayConfig.cognito.userPoolId
    )}`
  );
  console.log(
    `${chalk.blue("🆔")} Client ID: ${chalk.white(
      displayConfig.cognito.clientId
    )}`
  );
  console.log(
    `${chalk.blue("👤")} Username: ${chalk.white(
      displayConfig.cognito.username
    )}`
  );
  console.log(
    `${chalk.blue("🔑")} Password: ${chalk.gray(
      displayConfig.cognito.password
    )}`
  );
  console.log(
    `${chalk.blue("🌍")} Region: ${chalk.white(displayConfig.cognito.region)}`
  );

  // 設定の検証
  if (options.validate) {
    console.log("");
    console.log(chalk.bold("✅ 設定の検証:"));

    const errors = validateConfig(config);
    if (errors.length === 0) {
      console.log(chalk.green("✅ 設定は有効です"));
    } else {
      console.log(chalk.red("❌ 設定にエラーがあります:"));
      errors.forEach((error, index) => {
        console.log(chalk.red(`   ${index + 1}. ${error}`));
      });
    }
  }

  // プロファイル別の説明
  console.log("");
  console.log(chalk.bold("📚 プロファイルについて:"));
  console.log(`${chalk.yellow("🏠")} local: ローカル環境 (docker compose)`);
  console.log(
    `${chalk.yellow("☁️")} agentcore: AgentCore Runtime (AWS Bedrock)`
  );

  // 環境変数の説明
  console.log("");
  console.log(chalk.bold("🔨 設定方法:"));
  console.log(chalk.gray("以下の環境変数で設定を変更できます:"));
  console.log(chalk.gray("• AGENTCORE_ENDPOINT"));
  console.log(chalk.gray("• AGENTCORE_PROFILE"));
  console.log(chalk.gray("• COGNITO_USER_POOL_ID"));
  console.log(chalk.gray("• COGNITO_CLIENT_ID"));
  console.log(chalk.gray("• COGNITO_USERNAME"));
  console.log(chalk.gray("• COGNITO_PASSWORD"));
  console.log(chalk.gray("• COGNITO_REGION"));

  console.log("");
  console.log(chalk.gray("または .env ファイルを作成してください"));
}

/**
 * JWT トークン情報表示
 */
export async function tokenInfoCommand(config: ClientConfig): Promise<void> {
  console.log(chalk.cyan("🎫 JWT トークン情報"));
  console.log("");

  try {
    const { getCachedJwtToken } = await import("../auth/cognito.js");
    const authResult = await getCachedJwtToken(config.cognito);

    const tokenInfo = getTokenInfo(authResult.accessToken);
    if (!tokenInfo) {
      console.log(chalk.red("❌ トークンの解析に失敗しました"));
      return;
    }

    console.log(chalk.bold("📋 トークン詳細:"));
    console.log(`${chalk.blue("🆔")} Subject: ${chalk.white(tokenInfo.sub)}`);
    console.log(
      `${chalk.blue("👤")} Username: ${chalk.white(
        tokenInfo.username || "N/A"
      )}`
    );
    console.log(`${chalk.blue("🏛️")} Issuer: ${chalk.white(tokenInfo.iss)}`);
    console.log(`${chalk.blue("🎯")} Audience: ${chalk.white(tokenInfo.aud)}`);
    console.log(
      `${chalk.blue("🕐")} 発行日時: ${chalk.white(
        new Date(tokenInfo.iat).toLocaleString()
      )}`
    );
    console.log(
      `${chalk.blue("⏰")} 有効期限: ${chalk.white(
        new Date(tokenInfo.exp).toLocaleString()
      )}`
    );

    // 有効期限チェック
    const expiresAt = new Date(tokenInfo.exp);
    const now = new Date();
    const remainingTime = Math.max(0, expiresAt.getTime() - now.getTime());
    const remainingMinutes = Math.floor(remainingTime / (1000 * 60));

    console.log("");
    console.log(chalk.bold("⏳ 有効期限ステータス:"));
    if (remainingTime > 0) {
      if (remainingMinutes > 60) {
        console.log(
          chalk.green(
            `✅ 有効 (残り ${Math.floor(remainingMinutes / 60)} 時間 ${
              remainingMinutes % 60
            } 分)`
          )
        );
      } else {
        console.log(
          chalk.yellow(`⚠️ 間もなく期限切れ (残り ${remainingMinutes} 分)`)
        );
      }
    } else {
      console.log(chalk.red("❌ 期限切れ"));
    }
  } catch (error) {
    console.log(chalk.red("❌ トークンの取得に失敗しました"));
    console.log(
      chalk.red(`   ${error instanceof Error ? error.message : "不明なエラー"}`)
    );
  }
}

/**
 * 利用可能なプロファイル一覧表示
 */
export function listProfilesCommand(): void {
  console.log(chalk.cyan("📋 利用可能なプロファイル"));
  console.log("");

  const profiles = [
    {
      name: "local",
      description: "ローカル環境 (docker compose)",
      endpoint: getEndpointForProfile("local"),
      auth: "不要",
      icon: "🏠",
    },
    {
      name: "agentcore",
      description: "AgentCore Runtime (AWS Bedrock)",
      endpoint: getEndpointForProfile("agentcore"),
      auth: "Cognito JWT",
      icon: "☁️",
    },
  ];

  profiles.forEach((profile) => {
    console.log(`${profile.icon} ${chalk.bold(profile.name)}`);
    console.log(`   ${chalk.gray("説明:")} ${profile.description}`);
    console.log(`   ${chalk.gray("エンドポイント:")} ${profile.endpoint}`);
    console.log(`   ${chalk.gray("認証:")} ${profile.auth}`);
    console.log("");
  });

  console.log(chalk.bold("使用方法:"));
  console.log(chalk.gray("環境変数で設定: AGENTCORE_PROFILE=local"));
  console.log(chalk.gray("コマンドオプション: --profile local"));
}
