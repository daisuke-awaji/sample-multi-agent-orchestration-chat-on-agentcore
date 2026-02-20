/**
 * Invoke Command
 * Agent 呼び出しコマンド
 */

import chalk from 'chalk';
import ora from 'ora';
import {
  createClient,
  type ModelContentBlockDeltaEvent,
  type ModelContentBlockStartEvent,
  type ServerCompletionEvent,
  type ServerErrorEvent,
} from '../api/client.js';
import type { ClientConfig } from '../config/index.js';

async function handleJsonMode(
  client: ReturnType<typeof createClient>,
  prompt: string,
  config: ClientConfig
): Promise<void> {
  try {
    const response = await client.invoke(prompt);

    const output = {
      prompt,
      response,
      metadata: {
        endpoint: config.endpoint,
        runtime: config.isAwsRuntime ? 'AWS AgentCore Runtime' : 'ローカル環境',
        timestamp: new Date().toISOString(),
      },
    };

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    const errorOutput = {
      error: error instanceof Error ? error.message : 'Unknown error',
      prompt,
      endpoint: config.endpoint,
      timestamp: new Date().toISOString(),
    };
    console.log(JSON.stringify(errorOutput, null, 2));
    process.exit(1);
  }
}

function printHeader(
  config: ClientConfig,
  prompt: string,
  sessionId: string | undefined
): void {
  console.log(chalk.cyan('🤖 AgentCore 呼び出し'));
  console.log(chalk.gray(`エンドポイント: ${config.endpoint}`));
  console.log(
    chalk.gray(`ランタイム: ${config.isAwsRuntime ? 'AWS AgentCore Runtime' : 'ローカル環境'}`)
  );
  if (sessionId) {
    console.log(chalk.gray(`セッションID: ${sessionId}`));
  }
  console.log('');

  console.log(chalk.bold('📝 プロンプト:'));
  console.log(chalk.white(`"${prompt}"`));
  console.log('');
}

function handleStreamEvent(
  event: { type: string },
  spinner: ReturnType<typeof ora>,
  currentToolName: string,
  metadata: Record<string, unknown>
): { spinner: ReturnType<typeof ora>; currentToolName: string; metadata: Record<string, unknown> } {
  if (event.type === 'beforeInvocationEvent') {
    spinner.text = 'Agent が考えています...';
  }

  if (event.type === 'modelContentBlockDeltaEvent') {
    const deltaEvent = event as ModelContentBlockDeltaEvent;
    if (deltaEvent.delta.type === 'textDelta') {
      if (spinner.isSpinning) {
        spinner.stop();
      }
      process.stdout.write(chalk.white(deltaEvent.delta.text));
    }
  }

  if (event.type === 'modelContentBlockStartEvent') {
    const startEvent = event as ModelContentBlockStartEvent;
    if (startEvent.start.type === 'toolUseStart') {
      currentToolName = startEvent.start.name;
      if (spinner.isSpinning) {
        spinner.stop();
      }
      console.log(''); // 改行
      console.log(chalk.blue(`🔧 ツール実行中: ${currentToolName}`));
    }
  }

  if (event.type === 'beforeToolsEvent') {
    spinner = ora(`ツール "${currentToolName}" を実行中...`).start();
  }

  if (event.type === 'afterToolsEvent') {
    if (spinner.isSpinning) {
      spinner.succeed(chalk.green(`ツール "${currentToolName}" 実行完了`));
    }
  }

  if (event.type === 'serverCompletionEvent') {
    const completionEvent = event as unknown as ServerCompletionEvent;
    metadata = completionEvent.metadata;
    if (spinner.isSpinning) {
      spinner.succeed(chalk.green('Agent が応答しました'));
    }
  }

  if (event.type === 'serverErrorEvent') {
    if (spinner.isSpinning) {
      spinner.fail(chalk.red('Agent でエラーが発生しました'));
    }
    const errorEvent = event as ServerErrorEvent;
    throw new Error(errorEvent.error.message);
  }

  return { spinner, currentToolName, metadata };
}

function printFooter(metadata: Record<string, unknown>): void {
  console.log(''); // 改行
  console.log(chalk.white('─'.repeat(60)));

  console.log('');
  console.log(chalk.bold('📊 実行情報:'));
  console.log(`${chalk.blue('🆔')} リクエストID: ${chalk.gray(metadata.requestId || 'N/A')}`);
  console.log(
    `${chalk.blue('🕒')} 実行時間: ${chalk.gray(metadata.duration ? `${metadata.duration}ms` : 'N/A')}`
  );
  console.log(`${chalk.blue('💬')} 会話数: ${chalk.gray(metadata.conversationLength || 'N/A')}`);
}

function handleStreamError(error: unknown, spinner: ReturnType<typeof ora>): void {
  spinner.fail(chalk.red('Agent 呼び出しに失敗しました'));

  console.log('');
  console.log(chalk.red('❌ エラー詳細:'));
  console.log(chalk.red(`   ${error instanceof Error ? error.message : '不明なエラー'}`));

  console.log('');
  console.log(chalk.yellow('💡 トラブルシューティング:'));
  console.log(chalk.gray('   1. プロンプトが空でないか確認してください'));
  console.log(chalk.gray('   2. サーバーが起動しているか確認してください'));
  console.log(chalk.gray('   3. ネットワーク接続を確認してください'));

  process.exit(1);
}

export async function invokeCommand(
  prompt: string,
  config: ClientConfig,
  options: {
    json?: boolean;
    sessionId?: string;
  }
): Promise<void> {
  const client = createClient(config);

  if (options.json) {
    await handleJsonMode(client, prompt, config);
    return;
  }

  printHeader(config, prompt, options.sessionId);

  let spinner = ora('Agent が初期化中...').start();
  let currentToolName = '';
  let metadata: Record<string, unknown> = {};

  try {
    console.log('');
    console.log(chalk.bold('💬 Agent の応答:'));
    console.log(chalk.white('─'.repeat(60)));

    for await (const event of client.invokeStream(prompt, options.sessionId)) {
      ({ spinner, currentToolName, metadata } = handleStreamEvent(
        event,
        spinner,
        currentToolName,
        metadata
      ));
    }

    printFooter(metadata);
  } catch (error) {
    handleStreamError(error, spinner);
  }
}

/**
 * インタラクティブモード
 */
export async function interactiveMode(config: ClientConfig): Promise<void> {
  const client = createClient(config);

  // インタラクティブセッション用の固定セッションIDを生成
  const sessionId = `interactive-session-${Date.now()}-${Math.random().toString(36).substring(2)}`;

  console.log(chalk.cyan('🔄 AgentCore インタラクティブモード'));
  console.log(chalk.gray(`エンドポイント: ${config.endpoint}`));
  console.log(chalk.gray(`セッションID: ${sessionId}`));
  console.log(chalk.gray("終了するには 'exit' または Ctrl+C を入力してください"));
  console.log('');

  // Node.js の readline を使用したインタラクティブモード
  const readline = await import('readline');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.blue('AgentCore> '),
  });

  rl.prompt();

  rl.on('line', async (input) => {
    const trimmed = input.trim();

    // 空の入力は無視してプロンプトを再表示
    if (trimmed === '') {
      rl.prompt();
      return;
    }

    // exit/quit で終了
    if (trimmed === 'exit' || trimmed === 'quit') {
      console.log(chalk.yellow('👋 セッションを終了します'));
      rl.close();
      return;
    }

    // 非同期処理中は readline を一時停止
    rl.pause();

    try {
      let spinner = ora('Agent が初期化中...').start();
      let currentToolName = '';

      // ストリーミングレスポンスをリアルタイム処理
      for await (const event of client.invokeStream(trimmed, sessionId)) {
        // Agent ループ開始
        if (event.type === 'beforeInvocationEvent') {
          spinner.text = 'Agent が考えています...';
        }

        // テキスト生成
        if (event.type === 'modelContentBlockDeltaEvent') {
          const deltaEvent = event as ModelContentBlockDeltaEvent;
          if (deltaEvent.delta.type === 'textDelta') {
            // 初回テキストの場合はスピナーを停止
            if (spinner.isSpinning) {
              spinner.stop();
              console.log(''); // 改行
            }
            process.stdout.write(chalk.white(deltaEvent.delta.text));
          }
        }

        // ツール使用開始
        if (event.type === 'modelContentBlockStartEvent') {
          const startEvent = event as ModelContentBlockStartEvent;
          if (startEvent.start.type === 'toolUseStart') {
            currentToolName = startEvent.start.name;
            if (spinner.isSpinning) {
              spinner.stop();
            }
            console.log(''); // 改行
            console.log(chalk.blue(`🔧 ツール実行中: ${currentToolName}`));
          }
        }

        // ツール実行前
        if (event.type === 'beforeToolsEvent') {
          spinner = ora(`ツール "${currentToolName}" を実行中...`).start();
        }

        // ツール実行後
        if (event.type === 'afterToolsEvent') {
          if (spinner.isSpinning) {
            spinner.succeed(chalk.green(`ツール "${currentToolName}" 実行完了`));
          }
        }

        // サーバー完了イベント
        if (event.type === 'serverCompletionEvent') {
          if (spinner.isSpinning) {
            spinner.succeed(chalk.green('応答完了'));
          }
        }

        // エラーイベント
        if (event.type === 'serverErrorEvent') {
          if (spinner.isSpinning) {
            spinner.fail(chalk.red('Agent でエラーが発生しました'));
          }
          const errorEvent = event as ServerErrorEvent;
          throw new Error(errorEvent.error.message);
        }
      }
      console.log('');
    } catch (error) {
      console.log('');
      console.log(chalk.red(`エラー: ${error instanceof Error ? error.message : '不明なエラー'}`));
      console.log('');
    } finally {
      // 処理完了後に再開してプロンプト表示
      rl.resume();
      rl.prompt();
    }
  });

  rl.on('close', () => {
    process.exit(0);
  });
}
