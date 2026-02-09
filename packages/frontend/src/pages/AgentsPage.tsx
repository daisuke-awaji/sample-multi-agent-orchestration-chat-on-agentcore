/**
 * エージェント検索ページ
 * 今後実装予定のプレースホルダー
 */

import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bot, Construction } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';

/**
 * エージェント検索ページメインコンポーネント
 */
export function AgentsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleBackToChat = () => {
    navigate('/chat');
  };

  return (
    <>
      <PageHeader icon={Bot} title={t('navigation.searchAgents')} />

      <div className="flex-1 overflow-y-auto p-page">
        <div className="flex items-center justify-center min-h-[calc(100vh-12rem)]">
          <div className="text-center max-w-md">
            <EmptyState
              icon={Construction}
              title={t('agent.comingSoon')}
              description={t('agent.searchAgentsDescription')}
              action={
                <Button variant="outline" size="lg" onClick={handleBackToChat}>
                  {t('agent.backToChat')}
                </Button>
              }
            />
            <p className="text-fg-muted text-sm mt-2">{t('agent.searchAgentsFeature')}</p>
          </div>
        </div>
      </div>
    </>
  );
}
