/**
 * Strands AI Agent for AgentCore Runtime
 * AgentCore Runtime で動作し、AgentCore Gateway のツールを使用する AI Agent
 */

import { Agent, BedrockModel, tool } from "@strands-agents/sdk";
import { z } from "zod";
import { config, logger } from "./config";
import { mcpClient, MCPToolResult } from "./mcp/client";
import { weatherTool } from "./tools/weather";

/**
 * MCP ツール定義の型
 */
interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * JSON Schema を Zod Schema に変換
 */
function convertToZodSchema(jsonSchema: any): z.ZodObject<any> {
  if (!jsonSchema || jsonSchema.type !== "object") {
    return z.object({});
  }

  const properties = jsonSchema.properties || {};
  const required = jsonSchema.required || [];
  const zodFields: Record<string, any> = {};

  for (const [key, prop] of Object.entries(properties)) {
    const propSchema = prop as any;
    let zodType: any;

    switch (propSchema.type) {
      case "string":
        zodType = z.string();
        break;
      case "number":
      case "integer":
        zodType = z.number();
        break;
      case "boolean":
        zodType = z.boolean();
        break;
      case "array":
        zodType = z.array(z.any());
        break;
      case "object":
        zodType = z.record(z.string(), z.any());
        break;
      default:
        zodType = z.any();
    }

    if (propSchema.description) {
      zodType = zodType.describe(propSchema.description);
    }

    if (!required.includes(key)) {
      zodType = zodType.optional();
    }

    zodFields[key] = zodType;
  }

  return z.object(zodFields);
}

/**
 * MCP ツールを Strands ツールに変換
 */
function createStrandsToolFromMCP(mcpTool: MCPToolDefinition) {
  return tool({
    name: mcpTool.name,
    description:
      mcpTool.description || `AgentCore Gateway ツール: ${mcpTool.name}`,
    inputSchema: convertToZodSchema(mcpTool.inputSchema) as any,
    callback: async (input: any): Promise<string> => {
      try {
        logger.debug(`ツール呼び出し: ${mcpTool.name}`, input);
        const result: MCPToolResult = await mcpClient.callTool(
          mcpTool.name,
          input
        );

        if (result.isError) {
          logger.error(`ツール実行エラー: ${mcpTool.name}`, result);
          return `ツール実行エラー: ${
            result.content[0]?.text || "不明なエラー"
          }`;
        }

        // 結果を文字列として返す
        const contentText = result.content
          .map((item) => {
            if (item.text) return item.text;
            if (item.json) return JSON.stringify(item.json, null, 2);
            return "";
          })
          .filter(Boolean)
          .join("\n");

        return contentText || "ツールの実行が完了しました。";
      } catch (error) {
        logger.error(`ツール呼び出し中にエラー: ${mcpTool.name}`, error);
        return `ツール呼び出し中にエラーが発生しました: ${error}`;
      }
    },
  });
}

/**
 * AgentCore Runtime 用の Strands Agent を作成
 */
export async function createAgent(): Promise<Agent> {
  logger.info("Strands Agent を初期化中...");

  try {
    // 1. AgentCore Gateway からツール一覧を取得
    logger.debug("AgentCore Gateway からツール一覧を取得中...");
    const mcpTools = await mcpClient.listTools();
    logger.info(`✅ ${mcpTools.length}個のツールを取得しました`);

    // 3. 各ツールを Strands の tool() 形式に変換
    const strandsToolsFromMCP = mcpTools.map((mcpTool) => {
      logger.debug(`ツール変換中: ${mcpTool.name}`);
      return createStrandsToolFromMCP(mcpTool as MCPToolDefinition);
    });

    // 4. ローカルツールとMCPツールを結合
    const allTools = [weatherTool, ...strandsToolsFromMCP];
    logger.info(`✅ 合計${allTools.length}個のツールを準備しました`);

    // 5. Amazon Bedrock モデルの設定
    const model = new BedrockModel({
      region: config.BEDROCK_REGION,
      modelId: config.BEDROCK_MODEL_ID,
    });

    // 6. システムプロンプトの生成
    const localTools = ["get_weather: 指定された都市の天気情報を取得"];
    const gatewayTools = mcpTools.map(
      (tool) => `- ${tool.name}: ${tool.description || "説明なし"}`
    );

    const systemPrompt = `あなたは AgentCore Runtime で動作する AI アシスタントです。

利用可能なツール:
${localTools.concat(gatewayTools).join("\n")}

ユーザーからの質問に日本語で丁寧に応答し、必要に応じて適切なツールを呼び出してください。
技術的な内容についても分かりやすく説明してください。`;

    // 7. Agent の作成
    const agent = new Agent({
      model,
      systemPrompt,
      tools: allTools,
    });

    logger.info("✅ Strands Agent の初期化が完了しました");
    return agent;
  } catch (error) {
    logger.error("❌ Strands Agent の初期化に失敗:", error);
    throw error;
  }
}
