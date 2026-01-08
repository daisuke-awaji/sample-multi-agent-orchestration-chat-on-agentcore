/**
 * イベント連携ページ
 * 今後実装予定のプレースホルダー
 */

import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarRange, Construction } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';

/**
 * イベント連携ページメインコンポーネント
 */
export function EventsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleBackToChat = () => {
    navigate('/chat');
  };

  return (
    <>
      <PageHeader icon={CalendarRange} title={t('events.title')} />

      {/* メインコンテンツ */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center justify-center min-h-[calc(100vh-12rem)]">
          <div className="text-center max-w-md">
            {/* Coming Soon アイコン */}
            <div className="mb-6">
              <Construction className="w-20 h-20 text-gray-300 mx-auto" />
            </div>

            {/* Coming Soon タイトル */}
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t('events.comingSoon')}</h2>

            {/* Description文 */}
            <div className="space-y-3 mb-8">
              <p className="text-gray-600 text-base">{t('events.eventsDescription')}</p>
              <p className="text-gray-500 text-sm">{t('events.eventsFeature')}</p>
            </div>

            {/* チャットに戻るボタン */}
            <button
              onClick={handleBackToChat}
              className="px-6 py-3 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              {t('agent.backToChat')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
