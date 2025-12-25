/**
 * イベント連携ページ
 * 今後実装予定のプレースホルダー
 */

import { useNavigate } from 'react-router-dom';
import { CalendarRange, Construction } from 'lucide-react';

/**
 * イベント連携ページメインコンポーネント
 */
export function EventsPage() {
  const navigate = useNavigate();

  const handleBackToChat = () => {
    navigate('/chat');
  };

  return (
    <>
      {/* ヘッダー */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CalendarRange className="w-6 h-6 text-gray-700" />
            <h1 className="text-xl font-semibold text-gray-900">イベント連携</h1>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center justify-center min-h-[calc(100vh-12rem)]">
          <div className="text-center max-w-md">
            {/* Coming Soon アイコン */}
            <div className="mb-6">
              <Construction className="w-20 h-20 text-gray-300 mx-auto" />
            </div>

            {/* Coming Soon タイトル */}
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Coming Soon</h2>

            {/* 説明文 */}
            <div className="space-y-3 mb-8">
              <p className="text-gray-600 text-base">イベント連携機能は今後開発する予定です。</p>
              <p className="text-gray-500 text-sm">
                外部カレンダーやイベント管理ツールと連携できるようになります。
              </p>
            </div>

            {/* チャットに戻るボタン */}
            <button
              onClick={handleBackToChat}
              className="px-6 py-3 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              チャットに戻る
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
