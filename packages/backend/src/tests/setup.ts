/**
 * Jest テストセットアップファイル
 */

import { config } from 'dotenv';
import path from 'path';

// テスト用の環境変数を読み込み
config({ path: path.resolve('.env') });

// テストタイムアウトを30秒に設定
jest.setTimeout(30000);
