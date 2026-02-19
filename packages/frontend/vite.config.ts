import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Moca Chat',
        short_name: 'Moca',
        description: 'AI Chat Application powered by AgentCore',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        orientation: 'portrait-primary',
        icons: [
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  define: {
    global: 'globalThis', // Node.js の global を globalThis にマッピング
  },
  server: {
    proxy: {
      '/invocations': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ping': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Rollup の出力設定
    rollupOptions: {
      output: {
        // 大きなライブラリを別チャンクに分離してキャッシュ効率を向上
        manualChunks: {
          // React 関連（コアライブラリ）
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],

          // Markdown レンダリング関連（比較的大きい）
          'vendor-markdown': [
            'react-markdown',
            'remark-gfm',
            'remark-math',
            'rehype-katex',
            'katex',
          ],

          // Mermaid ダイアグラム（非常に大きい）
          'vendor-mermaid': ['mermaid'],

          // シンタックスハイライト（大きい）
          'vendor-syntax': ['react-syntax-highlighter'],

          // 認証関連
          'vendor-auth': ['amazon-cognito-identity-js'],

          // 状態管理とユーティリティ
          'vendor-utils': ['zustand', 'zod', 'uuid', 'nanoid'],
        },
      },
    },

    // チャンクサイズ警告の閾値（500KB）
    chunkSizeWarningLimit: 500,

    // Source map を production では無効化（サイズ削減）
    sourcemap: false,

    // CSS のコード分割
    cssCodeSplit: true,

    // 最小化設定
    minify: 'esbuild',

    // Target を modern browsers に設定してより小さなバンドルを生成
    target: 'es2020',
  },
});
