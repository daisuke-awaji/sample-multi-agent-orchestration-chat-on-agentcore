/**
 * Session ID Generator
 *
 * AgentCore Runtime セッションID 命名規約:
 *
 * | コンポーネント              | 最小長 | 最大長 | パターン                        | ハイフン/アンダースコア |
 * |---------------------------|--------|--------|---------------------------------|----------------------|
 * | Runtime（リクエスト）        | 33     | 256    | [a-zA-Z0-9][a-zA-Z0-9-_]*     | ✅ 使用可             |
 * | Runtime（レスポンスヘッダー） | 1      | 100    | [a-zA-Z0-9][a-zA-Z0-9-_]*     | ✅ 使用可             |
 * | Memory                     | 1      | 100    | [a-zA-Z0-9][a-zA-Z0-9-_]*     | ✅ 使用可             |
 * | CodeInterpreter / Browser  | 1      | 40     | [0-9a-zA-Z]{1,40}             | ❌ 使用不可            |
 *
 * 同じセッションIDを Runtime・Memory・CodeInterpreter/Browser で共有するため、
 * 全制約の共通部分を満たすフォーマットを採用:
 * - 33文字（Runtime の最小長）
 * - [a-zA-Z0-9] のみ（CodeInterpreter/Browser がハイフン不可）
 * - 40文字以内（CodeInterpreter/Browser の最大長）
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 33;
const MASK = 63; // 2^6 - 1, next power of 2 above alphabet size (62)

export function generateSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_LENGTH * 2));
  let result = '';
  let pos = 0;
  while (result.length < ID_LENGTH) {
    const idx = bytes[pos++] & MASK;
    if (idx < ALPHABET.length) {
      result += ALPHABET[idx];
    }
  }
  return result;
}
