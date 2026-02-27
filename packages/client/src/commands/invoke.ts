/**
 * Invoke Command
 * Command to invoke the Agent
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
    return;
  }

  // Interactive UI
  console.log(chalk.cyan('🤖 AgentCore 呼び出し'));
  console.log(chalk.gray(`エンドポイント: ${config.endpoint}`));
  console.log(
    chalk.gray(`ランタイム: ${config.isAwsRuntime ? 'AWS AgentCore Runtime' : 'ローカル環境'}`)
  );
  if (options.sessionId) {
    console.log(chalk.gray(`セッションID: ${options.sessionId}`));
  }
  console.log('');

  console.log(chalk.bold('📝 プロンプト:'));
  console.log(chalk.white(`"${prompt}"`));
  console.log('');

  let spinner = ora('Agent が初期化中...').start();
  let currentToolName = '';
  let metadata: Record<string, unknown> = {};

  try {
    console.log('');
    console.log(chalk.bold('💬 Agent の応答:'));
    console.log(chalk.white('─'.repeat(60)));

    // Process streaming response in real time
    for await (const event of client.invokeStream(prompt, options.sessionId)) {
      // Agent loop start
      if (event.type === 'beforeInvocationEvent') {
        spinner.text = 'Agent が考えています...';
      }

      // Text generation
      if (event.type === 'modelContentBlockDeltaEvent') {
        const deltaEvent = event as ModelContentBlockDeltaEvent;
        if (deltaEvent.delta.type === 'textDelta') {
          // Stop spinner on first text output
          if (spinner.isSpinning) {
            spinner.stop();
          }
          process.stdout.write(chalk.white(deltaEvent.delta.text));
        }
      }

      // Tool use start
      if (event.type === 'modelContentBlockStartEvent') {
        const startEvent = event as ModelContentBlockStartEvent;
        if (startEvent.start.type === 'toolUseStart') {
          currentToolName = startEvent.start.name;
          if (spinner.isSpinning) {
            spinner.stop();
          }
          console.log(''); // newline
          console.log(chalk.blue(`🔧 ツール実行中: ${currentToolName}`));
        }
      }

      // Before tool execution
      if (event.type === 'beforeToolsEvent') {
        spinner = ora(`ツール "${currentToolName}" を実行中...`).start();
      }

      // After tool execution
      if (event.type === 'afterToolsEvent') {
        if (spinner.isSpinning) {
          spinner.succeed(chalk.green(`ツール "${currentToolName}" 実行完了`));
        }
      }

      // Server completion event
      if (event.type === 'serverCompletionEvent') {
        const completionEvent = event as unknown as ServerCompletionEvent;
        metadata = completionEvent.metadata;
        if (spinner.isSpinning) {
          spinner.succeed(chalk.green('Agent が応答しました'));
        }
      }

      // Error event
      if (event.type === 'serverErrorEvent') {
        if (spinner.isSpinning) {
          spinner.fail(chalk.red('Agent でエラーが発生しました'));
        }
        const errorEvent = event as ServerErrorEvent;
        throw new Error(errorEvent.error.message);
      }
    }

    console.log(''); // newline
    console.log(chalk.white('─'.repeat(60)));

    // Metadata information
    console.log('');
    console.log(chalk.bold('📊 実行情報:'));
    console.log(`${chalk.blue('🆔')} リクエストID: ${chalk.gray(metadata.requestId || 'N/A')}`);
    console.log(
      `${chalk.blue('🕒')} 実行時間: ${chalk.gray(metadata.duration ? `${metadata.duration}ms` : 'N/A')}`
    );
    console.log(`${chalk.blue('💬')} 会話数: ${chalk.gray(metadata.conversationLength || 'N/A')}`);
  } catch (error) {
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
}

/**
 * Interactive mode
 */
export async function interactiveMode(config: ClientConfig): Promise<void> {
  const client = createClient(config);

  // Generate a fixed session ID for the interactive session
  const sessionId = `interactive-session-${Date.now()}-${Math.random().toString(36).substring(2)}`;

  console.log(chalk.cyan('🔄 AgentCore インタラクティブモード'));
  console.log(chalk.gray(`エンドポイント: ${config.endpoint}`));
  console.log(chalk.gray(`セッションID: ${sessionId}`));
  console.log(chalk.gray("終了するには 'exit' または Ctrl+C を入力してください"));
  console.log('');

  // Interactive mode using Node.js readline
  const readline = await import('readline');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.blue('AgentCore> '),
  });

  rl.prompt();

  rl.on('line', async (input) => {
    const trimmed = input.trim();

    // Ignore empty input and re-display prompt
    if (trimmed === '') {
      rl.prompt();
      return;
    }

    // Exit on exit/quit
    if (trimmed === 'exit' || trimmed === 'quit') {
      console.log(chalk.yellow('👋 セッションを終了します'));
      rl.close();
      return;
    }

    // Pause readline during async processing
    rl.pause();

    try {
      let spinner = ora('Agent が初期化中...').start();
      let currentToolName = '';

      // Process streaming response in real time
      for await (const event of client.invokeStream(trimmed, sessionId)) {
        // Agent loop start
        if (event.type === 'beforeInvocationEvent') {
          spinner.text = 'Agent が考えています...';
        }

        // Text generation
        if (event.type === 'modelContentBlockDeltaEvent') {
          const deltaEvent = event as ModelContentBlockDeltaEvent;
          if (deltaEvent.delta.type === 'textDelta') {
            // Stop spinner on first text output
            if (spinner.isSpinning) {
              spinner.stop();
              console.log(''); // newline
            }
            process.stdout.write(chalk.white(deltaEvent.delta.text));
          }
        }

        // Tool use start
        if (event.type === 'modelContentBlockStartEvent') {
          const startEvent = event as ModelContentBlockStartEvent;
          if (startEvent.start.type === 'toolUseStart') {
            currentToolName = startEvent.start.name;
            if (spinner.isSpinning) {
              spinner.stop();
            }
            console.log(''); // newline
            console.log(chalk.blue(`🔧 ツール実行中: ${currentToolName}`));
          }
        }

        // Before tool execution
        if (event.type === 'beforeToolsEvent') {
          spinner = ora(`ツール "${currentToolName}" を実行中...`).start();
        }

        // After tool execution
        if (event.type === 'afterToolsEvent') {
          if (spinner.isSpinning) {
            spinner.succeed(chalk.green(`ツール "${currentToolName}" 実行完了`));
          }
        }

        // Server completion event
        if (event.type === 'serverCompletionEvent') {
          if (spinner.isSpinning) {
            spinner.succeed(chalk.green('応答完了'));
          }
        }

        // Error event
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
      // Resume and show prompt after processing completes
      rl.resume();
      rl.prompt();
    }
  });

  rl.on('close', () => {
    process.exit(0);
  });
}
