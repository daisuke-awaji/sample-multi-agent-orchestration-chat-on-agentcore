import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Brain, HelpCircle, Languages, ChevronDown, Check } from 'lucide-react';
import { useMemoryStore } from '../stores/memoryStore';
import { useSettingsStore } from '../stores/settingsStore';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Toggle } from '../components/ui/Toggle';
import { MemoryManagementModal } from '../components/MemoryManagementModal';

/**
 * 設定ページ
 * 各種設定を管理するページ（今後設定項目を追加予定）
 */
export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { isMemoryEnabled, setMemoryEnabled } = useMemoryStore();
  const { sendBehavior, setSendBehavior } = useSettingsStore();
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const [isLanguageDropdownOpen, setIsLanguageDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 言語選択オプション
  const languageOptions = [
    { value: 'ja', label: t('settings.languageJa') },
    { value: 'en', label: t('settings.languageEn') },
  ];

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    setIsLanguageDropdownOpen(false);
  };

  // ドロップダウン外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsLanguageDropdownOpen(false);
      }
    };

    if (isLanguageDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isLanguageDropdownOpen]);

  return (
    <div className="min-h-screen bg-white">
      <PageHeader icon={Settings} title={t('settings.title')} />

      {/* メインコンテンツ */}
      <main className="flex-1 overflow-y-auto p-6">
        {/* 言語設定セクション */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Languages className="w-5 h-5 text-fg-secondary" />
            <h2 className="text-lg font-semibold text-fg-default">{t('settings.language')}</h2>
          </div>

          {/* カスタムドロップダウン */}
          <div ref={dropdownRef} className="relative w-full">
            {/* トリガーボタン */}
            <button
              onClick={() => setIsLanguageDropdownOpen(!isLanguageDropdownOpen)}
              className="w-full px-4 py-3 bg-white border border-border-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-border-focus focus:border-transparent text-fg-default font-medium cursor-pointer hover:border-border-strong transition-colors flex items-center justify-between"
            >
              <span>{languageOptions.find((opt) => opt.value === i18n.language)?.label}</span>
              <ChevronDown
                className={`w-5 h-5 text-fg-muted transition-transform duration-200 ${
                  isLanguageDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* ドロップダウンメニュー */}
            {isLanguageDropdownOpen && (
              <div className="absolute z-10 w-full mt-2 bg-white border border-border rounded-lg shadow-lg overflow-hidden animate-subtle-fade-in">
                {languageOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleLanguageChange(option.value)}
                    className={`
                      w-full px-4 py-3 text-left flex items-center justify-between
                      transition-colors duration-150
                      ${
                        i18n.language === option.value
                          ? 'bg-feedback-info-bg text-action-primary font-medium'
                          : 'text-fg-default hover:bg-surface-secondary'
                      }
                    `}
                  >
                    <span>{option.label}</span>
                    {i18n.language === option.value && (
                      <Check className="w-5 h-5 text-action-primary" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* メモリ管理セクション */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-fg-secondary" />
              <h2 className="text-lg font-semibold text-fg-default">{t('memory.title')}</h2>
              <HelpCircle className="w-4 h-4 text-fg-disabled" />
            </div>
            <Button variant="outline" size="md" onClick={() => setShowMemoryModal(true)}>
              {t('common.edit')}
            </Button>
          </div>

          <div className="flex items-center justify-between py-4">
            <div className="flex-1">
              <h3 className="text-sm font-medium text-fg-default mb-1">
                {t('memory.longTermMemory')}
              </h3>
              <p className="text-sm text-fg-secondary">{t('memory.longTermMemoryDescription')}</p>
            </div>
            <div className="ml-4">
              <Toggle
                checked={isMemoryEnabled}
                onChange={setMemoryEnabled}
                label={t('memory.longTermMemory')}
              />
            </div>
          </div>
        </div>

        {/* 詳細設定セクション */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-fg-default mb-6">{t('settings.advanced')}</h2>

          <div className="space-y-4">
            <p className="text-sm text-fg-secondary">
              {t('settings.enterBehaviorDescription')}
              <kbd className="mx-1 px-2 py-1 bg-gray-100 rounded text-sm font-mono">Enter</kbd>
              {t('settings.enterBehaviorSuffix')}
            </p>

            {/* ラジオボタン選択 */}
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="sendBehavior"
                  value="enter"
                  checked={sendBehavior === 'enter'}
                  onChange={() => setSendBehavior('enter')}
                  className="w-4 h-4 text-action-primary border-border-strong focus:ring-border-focus"
                />
                <span className="text-sm text-fg-default">{t('settings.sendOnEnter')}</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="sendBehavior"
                  value="cmdEnter"
                  checked={sendBehavior === 'cmdEnter'}
                  onChange={() => setSendBehavior('cmdEnter')}
                  className="w-4 h-4 text-action-primary border-border-strong focus:ring-border-focus"
                />
                <span className="text-sm text-fg-default">
                  {t('settings.newlineOnEnter')}（
                  <kbd className="mx-1 px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">⌘</kbd>+
                  <kbd className="mx-1 px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">
                    Enter
                  </kbd>
                  {t('settings.sendSuffix')}）
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* メモリ管理モーダル */}
        <MemoryManagementModal isOpen={showMemoryModal} onClose={() => setShowMemoryModal(false)} />
      </main>
    </div>
  );
}
