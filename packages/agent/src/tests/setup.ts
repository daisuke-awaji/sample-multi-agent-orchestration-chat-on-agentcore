/**
 * Jest テストセットアップファイル
 */

import { jest } from '@jest/globals';
import { config } from 'dotenv';
import path from 'path';

// テスト用の環境変数を読み込み
config({ path: path.resolve('.env') });

// テスト用のデフォルト環境変数を設定（CI環境対応）
if (!process.env.AGENTCORE_GATEWAY_ENDPOINT) {
  process.env.AGENTCORE_GATEWAY_ENDPOINT = 'https://test.example.com';
}

// テストタイムアウトを30秒に設定
jest.setTimeout(30000);
