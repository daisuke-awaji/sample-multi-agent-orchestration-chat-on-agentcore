/**
 * Strands AI Agent for AgentCore Runtime
 * AgentCore Runtime で動作するシンプルな AI Agent
 */

import { Agent, BedrockModel } from "@strands-agents/sdk";
import { weatherTool } from "./tools/weather.js";

/**
 * AgentCore Runtime 用の Strands Agent
 */
export function createAgent(): Agent {
  // Amazon Bedrock モデルの設定
  const model = new BedrockModel({
    region: process.env.AWS_REGION || "us-east-1",
    // 必要に応じて他のモデル設定を追加
  });

  // システムプロンプトの定義
  const systemPrompt = `あなたは AgentCore Runtime で動作する AI アシスタントです。

利用可能なツール:
- get_weather: 指定された都市の天気情報を取得

ユーザーからの質問に日本語で丁寧に応答してください。
天気について聞かれた場合は、必ず get_weather ツールを使用して情報を取得してください。
技術的な内容についても分かりやすく説明してください。`;

  // Agent の作成
  const agent = new Agent({
    model,
    systemPrompt,
    tools: [weatherTool],
  });

  return agent;
}
