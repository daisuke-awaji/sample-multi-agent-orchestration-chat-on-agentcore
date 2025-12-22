/**
 * Strands AI Agent for AgentCore Runtime
 * AgentCore Runtime で動作し、AgentCore Gateway のツールを使用する AI Agent
 */

import { Agent, BedrockModel, tool, Message } from '@strands-agents/sdk';
import { z } from 'zod';
import { config, logger } from './config/index.js';
import { mcpClient, MCPToolResult } from './mcp/client.js';
import { weatherTool } from './tools/weather.js';

/**
 * JSON Schema プロパティの型定義
 */
interface JSONSchemaProperty {
  type: string;
  description?: string;
}

/**
 * JSON Schema の型定義
 */
interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
}

/**
 * MCP ツール定義の型
 */
interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema: JSONSchema;
}

/**
 * デフォルトコンテキストを生成
 * @param tools 有効なツール一覧
 * @param mcpTools MCP ツール定義一覧
 */
function generateDefaultContext(
  tools: Array<{ name: string; description?: string }>,
  mcpTools: MCPToolDefinition[]
): string {
  // 現在時刻をISO 8601形式（UTC）で取得
  const now = new Date();
  const currentTime = now.toISOString();

  // ツール一覧をフォーマット（英語）
  const toolDescriptions: string[] = [];

  tools.forEach((tool) => {
    if (tool.name === 'get_weather') {
      // ローカルツール
      toolDescriptions.push(`    - ${tool.name}: Get weather information for a specified city`);
    } else {
      // MCP ツール
      const mcpTool = mcpTools.find((mcp) => mcp.name === tool.name);
      const description = mcpTool?.description || 'No description available';
      toolDescriptions.push(`    - ${tool.name}: ${description}`);
    }
  });

  const availableTools = toolDescriptions.length > 0 ? toolDescriptions.join('\n') : '    - None';

  // Markdown 描画ルールを英語で定義
  const markdownRules = `    This system supports the following Markdown formats:
    - Mermaid diagram notation (\`\`\`mermaid ... \`\`\`)
    - LaTeX math notation (inline: $...$, block: $$...$$)`;

  return `
<context>
  <current_time>${currentTime}</current_time>
  <available_tools>
${availableTools}
  </available_tools>
  <markdown_rules>
${markdownRules}
  </markdown_rules>
</context>`;
}

/**
 * プロパティキー名をサニタイズ（Bedrock の制約に適合させる）
 * パターン: ^[a-zA-Z0-9_.-]{1,64}$
 */
function sanitizePropertyKey(key: string): string {
  // 許可されていない文字をアンダースコアに置換
  let sanitized = key.replace(/[^a-zA-Z0-9_.-]/g, '_');

  // 64文字に切り詰め
  if (sanitized.length > 64) {
    sanitized = sanitized.substring(0, 64);
  }

  // 空文字の場合はデフォルト名
  if (sanitized.length === 0) {
    sanitized = '_param';
  }

  return sanitized;
}

/**
 * JSON Schema を Zod Schema に変換し、キーマッピングも返す
 */
function convertToZodSchema(jsonSchema: JSONSchema): {
  schema: z.ZodObject<Record<string, z.ZodTypeAny>>;
  keyMapping: Record<string, string>; // sanitizedKey -> originalKey
} {
  if (!jsonSchema || jsonSchema.type !== 'object') {
    return { schema: z.object({}), keyMapping: {} };
  }

  const properties = jsonSchema.properties || {};
  const required = jsonSchema.required || [];
  const zodFields: Record<string, z.ZodTypeAny> = {};
  const keyMapping: Record<string, string> = {};

  for (const [key, prop] of Object.entries(properties)) {
    const propSchema = prop as JSONSchemaProperty;

    // プロパティキー名をサニタイズ
    const sanitizedKey = sanitizePropertyKey(key);
    keyMapping[sanitizedKey] = key; // マッピングを記録

    let zodType: z.ZodTypeAny;

    switch (propSchema.type) {
      case 'string':
        zodType = z.string();
        break;
      case 'number':
      case 'integer':
        zodType = z.number();
        break;
      case 'boolean':
        zodType = z.boolean();
        break;
      case 'array':
        zodType = z.array(z.unknown());
        break;
      case 'object':
        zodType = z.record(z.string(), z.unknown());
        break;
      default:
        zodType = z.unknown();
    }

    if (propSchema.description) {
      zodType = zodType.describe(propSchema.description);
    }

    if (!required.includes(key)) {
      zodType = zodType.optional();
    }

    zodFields[sanitizedKey] = zodType;
  }

  return { schema: z.object(zodFields), keyMapping };
}

/**
 * ツール入力の型定義
 */
type ToolInput = Record<string, unknown>;

/**
 * MCP ツールを Strands ツールに変換
 */
function createStrandsToolFromMCP(mcpTool: MCPToolDefinition) {
  const { schema, keyMapping } = convertToZodSchema(mcpTool.inputSchema);

  return tool({
    name: mcpTool.name,
    description: mcpTool.description || `AgentCore Gateway ツール: ${mcpTool.name}`,
    inputSchema: schema,
    callback: async (input: ToolInput): Promise<string> => {
      try {
        // サニタイズされたキーを元のキーに変換
        const originalInput: Record<string, unknown> = {};
        for (const [sanitizedKey, value] of Object.entries(input)) {
          const originalKey = keyMapping[sanitizedKey] || sanitizedKey;
          originalInput[originalKey] = value;
        }

        logger.debug(`ツール呼び出し: ${mcpTool.name}`, originalInput);
        const result: MCPToolResult = await mcpClient.callTool(mcpTool.name, originalInput);

        if (result.isError) {
          logger.error(`ツール実行エラー: ${mcpTool.name}`, result);
          return `ツール実行エラー: ${result.content[0]?.text || '不明なエラー'}`;
        }

        // 結果を文字列として返す
        const contentText = result.content
          .map((item) => {
            if (item.text) return item.text;
            if (item.json) return JSON.stringify(item.json, null, 2);
            return '';
          })
          .filter(Boolean)
          .join('\n');

        return contentText || 'ツールの実行が完了しました。';
      } catch (error) {
        logger.error(`ツール呼び出し中にエラー: ${mcpTool.name}`, error);
        return `ツール呼び出し中にエラーが発生しました: ${error}`;
      }
    },
  });
}

/**
 * AgentCore Runtime 用の Strands Agent 作成オプション
 */
interface CreateAgentOptions {
  modelId?: string; // 使用するモデルID（未指定時は環境変数）
  enabledTools?: string[]; // 有効化するツール名配列（undefined=全て、[]=なし）
  systemPrompt?: string; // カスタムシステムプロンプト（未指定時は自動生成）
}

/**
 * AgentCore Runtime 用の Strands Agent を作成
 * @param initialMessages 初期会話履歴（セッション復元用）
 * @param hooks HookProvider の配列（セッション永続化など）
 * @param options Agent作成オプション（モデルID、ツール、システムプロンプト）
 */
export async function createAgent(
  initialMessages?: Message[],
  hooks?: import('@strands-agents/sdk').HookProvider[],
  options?: CreateAgentOptions
): Promise<Agent> {
  logger.info('Strands Agent を初期化中...');

  try {
    // 1. AgentCore Gateway からツール一覧を取得
    logger.debug('AgentCore Gateway からツール一覧を取得中...');
    const mcpTools = await mcpClient.listTools();
    logger.info(`✅ ${mcpTools.length}個のツールを取得しました`);

    // 3. 各ツールを Strands の tool() 形式に変換
    const strandsToolsFromMCP = mcpTools.map((mcpTool) => {
      logger.debug(`ツール変換中: ${mcpTool.name}`);
      return createStrandsToolFromMCP(mcpTool as MCPToolDefinition);
    });

    // 4. ローカルツールとMCPツールを結合
    let allTools = [weatherTool, ...strandsToolsFromMCP];

    // 4.1. ツールのフィルタリング（options.enabledTools が指定されている場合）
    if (options?.enabledTools !== undefined) {
      if (options.enabledTools.length === 0) {
        // 空配列の場合はツールなし
        allTools = [];
        logger.info('🔧 ツールを無効化: 空配列が指定されました');
      } else {
        // 指定されたツールのみ有効化
        allTools = allTools.filter((tool) => options.enabledTools!.includes(tool.name));
        logger.info(`🔧 ツールをフィルタリング: ${options.enabledTools.join(', ')}`);
      }
    }
    logger.info(`✅ 合計${allTools.length}個のツールを準備しました`);

    // 5. Amazon Bedrock モデルの設定
    const modelId = options?.modelId || config.BEDROCK_MODEL_ID;
    const model = new BedrockModel({
      region: config.BEDROCK_REGION,
      modelId,
    });
    logger.info(`🤖 使用モデル: ${modelId}`);

    // 6. システムプロンプトの設定
    let baseSystemPrompt: string;

    if (options?.systemPrompt) {
      // カスタムシステムプロンプトが指定されている場合
      baseSystemPrompt = options.systemPrompt;
      logger.info('📝 カスタムシステムプロンプトを使用');
    } else {
      // デフォルトのシステムプロンプトを生成
      const enabledLocalTools = allTools.filter((tool) => tool.name === 'get_weather');
      const enabledMcpTools = allTools.filter((tool) => tool.name !== 'get_weather');

      const localToolDescriptions = enabledLocalTools.map(
        (tool) => `- ${tool.name}: 指定された都市の天気情報を取得`
      );
      const gatewayToolDescriptions = enabledMcpTools.map((tool) => {
        const mcpTool = mcpTools.find((mcp) => mcp.name === tool.name);
        return `- ${tool.name}: ${mcpTool?.description || '説明なし'}`;
      });

      const allToolDescriptions = [...localToolDescriptions, ...gatewayToolDescriptions];

      baseSystemPrompt = `あなたは AgentCore Runtime で動作する AI アシスタントです。

${allToolDescriptions.length > 0 ? `利用可能なツール:\n${allToolDescriptions.join('\n')}\n\n` : ''}ユーザーからの質問に日本語で丁寧に応答し、必要に応じて適切なツールを呼び出してください。
技術的な内容についても分かりやすく説明してください。`;

      logger.info('📝 デフォルトシステムプロンプトを生成');
    }

    // 7. デフォルトコンテキストを付与してシステムプロンプトを完成
    const defaultContext = generateDefaultContext(allTools, mcpTools as MCPToolDefinition[]);
    const systemPrompt = baseSystemPrompt + defaultContext;

    logger.info('📝 デフォルトコンテキストを付与したシステムプロンプトを生成');

    // 7. Agent の作成
    const agent = new Agent({
      model,
      systemPrompt,
      tools: allTools,
      messages: initialMessages, // セッション履歴を初期化時に設定
      hooks, // セッション永続化フックなどを設定
    });

    if (initialMessages && initialMessages.length > 0) {
      logger.info(`✅ セッション履歴を復元: ${initialMessages.length}件のメッセージ`);
    }
    if (hooks && hooks.length > 0) {
      logger.info(`✅ ${hooks.length}個のフックを登録`);
    }

    logger.info('✅ Strands Agent の初期化が完了しました');
    return agent;
  } catch (error) {
    logger.error('❌ Strands Agent の初期化に失敗:', error);
    throw error;
  }
}
