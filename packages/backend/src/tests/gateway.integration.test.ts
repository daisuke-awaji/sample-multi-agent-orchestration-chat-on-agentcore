/**
 * AgentCore Gateway 統合テスト
 * 実際のAWS環境に接続してツール一覧取得・検索機能をテスト
 */

import { gatewayService } from '../services/agentcore-gateway.js';
import { CognitoAuthHelper } from './cognito-helper.js';

// テスト用の環境変数
const TEST_USER = 'testuser';
const TEST_PASSWORD = 'TestPassword123!';

describe('AgentCore Gateway 統合テスト', () => {
  let cognitoHelper: CognitoAuthHelper;
  let authToken: string;

  beforeAll(async () => {
    // 環境変数チェック
    const requiredEnvs = [
      'AGENTCORE_GATEWAY_ENDPOINT',
      'COGNITO_USER_POOL_ID',
      'COGNITO_CLIENT_ID',
      'COGNITO_REGION',
    ];

    const missingEnvs = requiredEnvs.filter((env) => !process.env[env]);
    if (missingEnvs.length > 0) {
      throw new Error(`必要な環境変数が設定されていません: ${missingEnvs.join(', ')}`);
    }

    // Cognito認証ヘルパー初期化
    cognitoHelper = new CognitoAuthHelper({
      userPoolId: process.env.COGNITO_USER_POOL_ID!,
      clientId: process.env.COGNITO_CLIENT_ID!,
      region: process.env.COGNITO_REGION!,
    });

    console.log('🔧 Cognito認証ヘルパー初期化完了');
  });

  describe('認証ありでのツール一覧取得', () => {
    beforeAll(async () => {
      // Cognito認証を実行
      console.log('🔐 Cognito認証実行中...');
      const authResult = await cognitoHelper.login(TEST_USER, TEST_PASSWORD);

      // Access Token を使用（Gateway 認証用）
      authToken = authResult.accessToken;

      // Access Token の情報をログ出力
      const payload = cognitoHelper.decodeJWT(authToken);
      if (payload) {
        console.log('✅ Access Token 取得成功:', {
          sub: payload.sub,
          username: payload.username,
          token_use: payload.token_use,
          client_id: payload.client_id,
          exp:
            payload.exp && typeof payload.exp === 'number'
              ? new Date(payload.exp * 1000).toISOString()
              : 'unknown',
          iat:
            payload.iat && typeof payload.iat === 'number'
              ? new Date(payload.iat * 1000).toISOString()
              : 'unknown',
        });
      }
    });

    it('listTools() - 認証ありでツール一覧を取得できる', async () => {
      console.log('📋 ツール一覧取得テスト開始 (認証あり)');

      // 認証ありでツール一覧を取得
      const tools = await gatewayService.listTools(authToken);

      // アサーション
      expect(tools).toBeDefined();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);

      // 各ツールが必要なプロパティを持っているか確認
      tools.forEach((tool) => {
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe('string');
        expect(tool.inputSchema).toBeDefined();
        expect(typeof tool.inputSchema).toBe('object');
      });

      console.log(`✅ ツール一覧取得成功: ${tools.length}件のツールを取得`);
      console.log('🔧 取得したツール名:', tools.map((t) => t.name).slice(0, 5));
    }, 30000);

    it('listTools() - 認証なしではエラーになる', async () => {
      console.log('🔒 認証なしテスト開始');

      await expect(gatewayService.listTools()).rejects.toThrow();

      console.log('✅ 認証なしで正しくエラーが発生');
    });
  });

  describe('認証ありでのセマンティック検索', () => {
    it('searchTools() - セマンティック検索でツールを検索できる', async () => {
      console.log('🔍 セマンティック検索テスト開始');

      const query = '検索';
      const searchResults = await gatewayService.searchTools(query, authToken);

      // アサーション
      expect(searchResults).toBeDefined();
      expect(Array.isArray(searchResults)).toBe(true);

      if (searchResults.length > 0) {
        // 検索結果があればプロパティを確認
        searchResults.forEach((tool) => {
          expect(tool.name).toBeDefined();
          expect(typeof tool.name).toBe('string');
          expect(tool.inputSchema).toBeDefined();
          expect(typeof tool.inputSchema).toBe('object');
        });

        console.log(`✅ セマンティック検索成功: ${searchResults.length}件の結果`);
        console.log(
          '🔧 検索結果のツール名:',
          searchResults.map((t) => t.name)
        );
      } else {
        console.log('⚠️  セマンティック検索結果は0件でした');
      }
    }, 30000);

    it('searchTools() - 異なるクエリでの検索テスト', async () => {
      console.log('🔍 追加の検索テスト開始');

      const queries = ['weather', 'test', 'api', 'データ'];

      for (const query of queries) {
        console.log(`🔍 クエリ "${query}" で検索中...`);
        const searchResults = await gatewayService.searchTools(query, authToken);

        expect(searchResults).toBeDefined();
        expect(Array.isArray(searchResults)).toBe(true);

        console.log(`   結果: ${searchResults.length}件`);
        if (searchResults.length > 0) {
          console.log(`   ツール例: ${searchResults[0].name}`);
        }
      }
    }, 60000);
  });

  describe('エラーハンドリング', () => {
    it('searchTools() - 無効なトークンで認証エラーになる', async () => {
      console.log('🔒 無効トークンテスト開始');

      const invalidToken = 'invalid.jwt.token';
      const query = 'test';

      await expect(gatewayService.searchTools(query, invalidToken)).rejects.toThrow();

      console.log('✅ 無効トークンで正しくエラーが発生');
    });

    it('searchTools() - 空のクエリでバリデーションエラーになる', async () => {
      console.log('📝 空クエリテスト開始');

      await expect(gatewayService.searchTools('', authToken)).rejects.toThrow(
        '検索クエリが必要です'
      );

      await expect(gatewayService.searchTools('   ', authToken)).rejects.toThrow(
        '検索クエリが必要です'
      );

      console.log('✅ 空クエリで正しくバリデーションエラーが発生');
    });
  });

  describe('Gateway接続確認', () => {
    it('checkConnection() - Gateway接続が正常', async () => {
      console.log('🔗 Gateway接続確認テスト開始');

      const isConnected = await gatewayService.checkConnection(authToken);

      expect(isConnected).toBe(true);

      console.log('✅ Gateway接続確認成功');
    });
  });
});
