import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";

/**
 * AgentCore Gateway Echo/Ping Tool Lambda Handler
 *
 * このLambda関数はAgentCore Gatewayから呼び出され、
 * Echo（メッセージをそのまま返す）とPing（接続確認）ツールを提供します。
 */

interface ToolRequest {
  tool: string;
  input?: {
    message?: string;
    [key: string]: any;
  };
  sessionId?: string;
  userId?: string;
}

interface ToolResponse {
  result: any;
  error?: string;
  metadata?: {
    timestamp: string;
    tool: string;
    sessionId?: string;
  };
}

export async function handler(
  event: any,
  context: Context
): Promise<APIGatewayProxyResult> {
  console.log("=== AgentCore Gateway Lambda Handler Start ===");
  console.log("Lambda Request ID:", context.awsRequestId);
  console.log("=== DEBUG: Full Event Structure ===");
  console.log("Event keys:", Object.keys(event));
  console.log("Event:", JSON.stringify(event, null, 2));
  console.log("=== DEBUG: Context Structure ===");
  console.log("Context:", JSON.stringify(context, null, 2));

  try {
    // AgentCore Gateway経由の場合、context.client_contextが設定される
    let toolName: string | null = null;

    try {
      if (context.clientContext && context.clientContext.Custom) {
        // client_contextから直接ツール名を取得
        toolName = context.clientContext.Custom[
          "bedrockAgentCoreToolName"
        ] as string;
        console.log(`Original tool name from Gateway: ${toolName}`);

        // Gateway Target プレフィックスを除去 (echo-tool___ping → ping)
        const delimiter = "___";
        if (toolName && toolName.includes(delimiter)) {
          toolName = toolName.substring(
            toolName.indexOf(delimiter) + delimiter.length
          );
          console.log(`Processed tool name: ${toolName}`);
        }

        console.log(
          `Client context structure: ${JSON.stringify(context.clientContext)}`
        );
      } else {
        console.log(
          "No client_context available - direct Lambda invocation or different format"
        );
      }
    } catch (error) {
      console.error(`Error accessing client_context: ${error}`);
      toolName = null;
    }

    let toolResult: any;

    // ツール名に基づいて処理を分岐
    if (toolName === "echo") {
      console.log("=== Echo tool execution ===");
      const message = event.message || "Hello from AgentCore Gateway!";
      toolResult = await handleEcho({ message });
    } else if (toolName === "ping") {
      console.log("=== Ping tool execution ===");
      toolResult = await handlePing(event);
    } else {
      console.log(
        `=== Unknown or missing tool name: ${toolName} - defaulting to ping ===`
      );
      // ツール名が不明な場合はpingとして処理
      toolResult = await handlePing(event);
    }

    // AgentCore Gateway が期待する応答フォーマット
    const response = {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
      body: JSON.stringify({
        result: toolResult,
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: context.awsRequestId,
          toolName: toolName || "unknown",
        },
      }),
    };

    console.log("=== Success Response ===");
    console.log("Response:", JSON.stringify(response, null, 2));

    return response;
  } catch (error) {
    console.error("=== Lambda Execution Error ===");
    console.error("Error:", error);
    console.error(
      "Stack:",
      error instanceof Error ? error.stack : "No stack trace"
    );

    const errorResponse = {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        result: null,
        error: error instanceof Error ? error.message : "Unknown error",
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: context.awsRequestId,
        },
      }),
    };

    console.log("=== Error Response ===");
    console.log("Error response:", JSON.stringify(errorResponse, null, 2));

    return errorResponse;
  }
}

/**
 * Echo ツール: 入力されたメッセージをそのまま返す
 */
async function handleEcho(input?: { message?: string }): Promise<any> {
  if (!input?.message) {
    throw new Error("Echo tool requires a 'message' parameter");
  }

  console.log(`Echo tool called with message: ${input.message}`);

  return {
    echo: input.message,
    length: input.message.length,
    uppercase: input.message.toUpperCase(),
    lowercase: input.message.toLowerCase(),
  };
}

/**
 * Ping ツール: 接続確認とシステム情報を返す
 */
async function handlePing(input?: any): Promise<any> {
  console.log("Ping tool called");

  return {
    status: "pong",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.version,
    platform: process.platform,
    arch: process.arch,
    memory: process.memoryUsage(),
  };
}

/**
 * OPTIONS リクエスト用のハンドラー（CORS対応）
 */
export async function optionsHandler(): Promise<APIGatewayProxyResult> {
  return {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
    body: "",
  };
}
