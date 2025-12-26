import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Brain, HelpCircle, Languages, ChevronDown, Check } from 'lucide-react';
import { useMemoryStore } from '../stores/memoryStore';
import { MemoryManagementModal } from '../components/MemoryManagementModal';

/**
 * 設定ページ
 * 各種設定を管理するページ（今後設定項目を追加予定）
 */
export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { isMemoryEnabled, setMemoryEnabled } = useMemoryStore();
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
      {/* ヘッダー */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6 text-gray-700" />
          <h1 className="text-xl font-semibold text-gray-900">{t('settings.title')}</h1>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="flex-1 overflow-y-auto p-6">
        {/* 言語設定セクション */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Languages className="w-5 h-5 text-gray-700" />
            <h2 className="text-lg font-semibold text-gray-900">{t('settings.language')}</h2>
          </div>

          {/* カスタムドロップダウン */}
          <div ref={dropdownRef} className="relative w-full">
            {/* トリガーボタン */}
            <button
              onClick={() => setIsLanguageDropdownOpen(!isLanguageDropdownOpen)}
              className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-medium cursor-pointer hover:border-gray-400 transition-colors flex items-center justify-between"
            >
              <span>{languageOptions.find((opt) => opt.value === i18n.language)?.label}</span>
              <ChevronDown
                className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${
                  isLanguageDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* ドロップダウンメニュー */}
            {isLanguageDropdownOpen && (
              <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden animate-subtle-fade-in">
                {languageOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleLanguageChange(option.value)}
                    className={`
                      w-full px-4 py-3 text-left flex items-center justify-between
                      transition-colors duration-150
                      ${
                        i18n.language === option.value
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-gray-900 hover:bg-gray-50'
                      }
                    `}
                  >
                    <span>{option.label}</span>
                    {i18n.language === option.value && <Check className="w-5 h-5 text-blue-600" />}
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
              <Brain className="w-5 h-5 text-gray-700" />
              <h2 className="text-lg font-semibold text-gray-900">{t('memory.title')}</h2>
              <HelpCircle className="w-4 h-4 text-gray-400" />
            </div>
            <button
              onClick={() => setShowMemoryModal(true)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {t('common.edit')}
            </button>
          </div>

          <div className="flex items-center justify-between py-4">
            <div className="flex-1">
              <h3 className="text-sm font-medium text-gray-900 mb-1">
                {t('memory.longTermMemory')}
              </h3>
              <p className="text-sm text-gray-600">{t('memory.longTermMemoryDescription')}</p>
            </div>
            <div className="ml-4">
              {/* カスタムトグルスイッチ */}
              <button
                onClick={() => setMemoryEnabled(!isMemoryEnabled)}
                className={`
                  relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
                  transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2
                  ${isMemoryEnabled ? 'bg-blue-600' : 'bg-gray-200'}
                `}
                role="switch"
                aria-checked={isMemoryEnabled}
              >
                <span
                  className={`
                    pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
                    transition duration-200 ease-in-out
                    ${isMemoryEnabled ? 'translate-x-5' : 'translate-x-0'}
                  `}
                />
              </button>
            </div>
          </div>
        </div>

        {/* メモリ管理モーダル */}
        <MemoryManagementModal isOpen={showMemoryModal} onClose={() => setShowMemoryModal(false)} />
      </main>
    </div>
  );
}
