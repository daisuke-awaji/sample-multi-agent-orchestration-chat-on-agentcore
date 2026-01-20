import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Brain, HelpCircle, Languages, ChevronDown, Check, Moon, Sun, Monitor } from 'lucide-react';
import { useMemoryStore } from '../stores/memoryStore';
import { useSettingsStore, type Theme } from '../stores/settingsStore';
import { PageHeader } from '../components/ui/PageHeader';
import { MemoryManagementModal } from '../components/MemoryManagementModal';

/**
 * 設定ページ
 * 各種設定を管理するページ（今後設定項目を追加予定）
 */
export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { isMemoryEnabled, setMemoryEnabled } = useMemoryStore();
  const { sendBehavior, setSendBehavior, theme, setTheme } = useSettingsStore();
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const [isLanguageDropdownOpen, setIsLanguageDropdownOpen] = useState(false);
  const [isThemeDropdownOpen, setIsThemeDropdownOpen] = useState(false);
  const languageDropdownRef = useRef<HTMLDivElement>(null);
  const themeDropdownRef = useRef<HTMLDivElement>(null);

  // 言語選択オプション
  const languageOptions = [
    { value: 'ja', label: t('settings.languageJa') },
    { value: 'en', label: t('settings.languageEn') },
  ];

  // テーマ選択オプション
  const themeOptions: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: t('settings.themeLight'), icon: Sun },
    { value: 'dark', label: t('settings.themeDark'), icon: Moon },
    { value: 'system', label: t('settings.themeSystem'), icon: Monitor },
  ];

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    setIsLanguageDropdownOpen(false);
  };

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    setIsThemeDropdownOpen(false);
  };

  // ドロップダウン外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (languageDropdownRef.current && !languageDropdownRef.current.contains(event.target as Node)) {
        setIsLanguageDropdownOpen(false);
      }
      if (themeDropdownRef.current && !themeDropdownRef.current.contains(event.target as Node)) {
        setIsThemeDropdownOpen(false);
      }
    };

    if (isLanguageDropdownOpen || isThemeDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isLanguageDropdownOpen, isThemeDropdownOpen]);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <PageHeader icon={Settings} title={t('settings.title')} />

      {/* メインコンテンツ */}
      <main className="flex-1 overflow-y-auto p-6">
        {/* テーマ設定セクション */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Moon className="w-5 h-5 text-gray-700 dark:text-gray-300 dark:text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('settings.theme')}</h2>
          </div>

          {/* テーマドロップダウン */}
          <div ref={themeDropdownRef} className="relative w-full">
            {/* トリガーボタン */}
            <button
              onClick={() => setIsThemeDropdownOpen(!isThemeDropdownOpen)}
              className="w-full px-4 py-3 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-gray-100 font-medium cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 transition-colors flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                {(() => {
                  const selectedOption = themeOptions.find((opt) => opt.value === theme);
                  if (selectedOption) {
                    const Icon = selectedOption.icon;
                    return (
                      <>
                        <Icon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                        {selectedOption.label}
                      </>
                    );
                  }
                  return null;
                })()}
              </span>
              <ChevronDown
                className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${
                  isThemeDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* ドロップダウンメニュー */}
            {isThemeDropdownOpen && (
              <div className="absolute z-10 w-full mt-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden animate-subtle-fade-in">
                {themeOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      onClick={() => handleThemeChange(option.value)}
                      className={`
                        w-full px-4 py-3 text-left flex items-center justify-between
                        transition-colors duration-150
                        ${
                          theme === option.value
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                            : 'text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }
                      `}
                    >
                      <span className="flex items-center gap-2">
                        <Icon className="w-5 h-5" />
                        {option.label}
                      </span>
                      {theme === option.value && <Check className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 言語設定セクション */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Languages className="w-5 h-5 text-gray-700 dark:text-gray-300 dark:text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('settings.language')}</h2>
          </div>

          {/* カスタムドロップダウン */}
          <div ref={languageDropdownRef} className="relative w-full">
            {/* トリガーボタン */}
            <button
              onClick={() => setIsLanguageDropdownOpen(!isLanguageDropdownOpen)}
              className="w-full px-4 py-3 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-gray-100 font-medium cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 transition-colors flex items-center justify-between"
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
              <div className="absolute z-10 w-full mt-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden animate-subtle-fade-in">
                {languageOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleLanguageChange(option.value)}
                    className={`
                      w-full px-4 py-3 text-left flex items-center justify-between
                      transition-colors duration-150
                      ${
                        i18n.language === option.value
                          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                          : 'text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }
                    `}
                  >
                    <span>{option.label}</span>
                    {i18n.language === option.value && <Check className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
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
              <Brain className="w-5 h-5 text-gray-700 dark:text-gray-300 dark:text-gray-600" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('memory.title')}</h2>
              <HelpCircle className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            </div>
            <button
              onClick={() => setShowMemoryModal(true)}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-600 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-800 transition-colors"
            >
              {t('common.edit')}
            </button>
          </div>

          <div className="flex items-center justify-between py-4">
            <div className="flex-1">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                {t('memory.longTermMemory')}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 dark:text-gray-500">{t('memory.longTermMemoryDescription')}</p>
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

        {/* 詳細設定セクション */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6">{t('settings.advanced')}</h2>

          <div className="space-y-4">
            <p className="text-sm text-gray-700 dark:text-gray-300 dark:text-gray-600">
              {t('settings.enterBehaviorDescription')}
              <kbd className="mx-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono">Enter</kbd>
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
                  className="w-4 h-4 text-blue-600 border-gray-300 dark:border-gray-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-900 dark:text-gray-100">{t('settings.sendOnEnter')}</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="sendBehavior"
                  value="cmdEnter"
                  checked={sendBehavior === 'cmdEnter'}
                  onChange={() => setSendBehavior('cmdEnter')}
                  className="w-4 h-4 text-blue-600 border-gray-300 dark:border-gray-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-900 dark:text-gray-100">
                  {t('settings.newlineOnEnter')}（
                  <kbd className="mx-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono">⌘</kbd>+
                  <kbd className="mx-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono">
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
