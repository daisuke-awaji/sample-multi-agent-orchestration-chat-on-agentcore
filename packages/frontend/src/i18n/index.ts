import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { load } from 'js-yaml';

// 翻訳ファイルのインポート
import jaYaml from '../locales/ja.yaml?raw';
import enYaml from '../locales/en.yaml?raw';

// YAML パース
const ja = load(jaYaml) as Record<string, unknown>;
const en = load(enYaml) as Record<string, unknown>;

// i18n 初期化
i18n
  .use(LanguageDetector) // Auto-detect browser language
  .use(initReactI18next) // Integrate with React
  .init({
    resources: {
      ja: {
        translation: ja,
      },
      en: {
        translation: en,
      },
    },
    fallbackLng: 'en', // Fallback language
    supportedLngs: ['ja', 'en'], // Supported languages
    debug: import.meta.env.DEV, // Enable debug logs in development mode

    interpolation: {
      escapeValue: false, // React already escapes by default
    },

    // 不足している翻訳キーを検出（開発モードのみ）
    saveMissing: import.meta.env.DEV,

    // 不足キーが見つかった場合のハンドラー
    missingKeyHandler: (lngs, ns, key, fallbackValue) => {
      if (import.meta.env.DEV) {
        console.warn(
          `%c[i18n] Translation key not found: "${key}"`,
          'color: #ff9800; font-weight: bold',
          {
            languages: lngs,
            namespace: ns,
            fallbackValue,
          }
        );
      }
    },

    // 不足キーの場合にキー名をそのまま表示（デフォルト動作を明示）
    returnEmptyString: false,

    detection: {
      // 言語検出の優先順位
      order: ['localStorage', 'navigator'],
      // localStorage key name
      lookupLocalStorage: 'i18nextLng',
      // キャッシュする言語
      caches: ['localStorage'],
    },

    react: {
      useSuspense: false, // Disable Suspense (can enable if needed)
    },
  });

export default i18n;
