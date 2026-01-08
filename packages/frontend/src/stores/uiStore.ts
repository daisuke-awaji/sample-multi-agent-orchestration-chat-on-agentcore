/**
 * UI状態管理ストア
 * サイドバーの開閉状態などのUI要素を管理する
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  /**
   * サイドバーが開いているかどうか
   */
  isSidebarOpen: boolean;

  /**
   * モバイル表示かどうか（768px未満）
   */
  isMobileView: boolean;

  /**
   * ナローデスクトップ表示かどうか（768px以上1024px未満）
   */
  isNarrowDesktop: boolean;

  /**
   * サイドバーの開閉を切り替える
   */
  toggleSidebar: () => void;

  /**
   * サイドバーの開閉状態を設定する
   * @param isOpen 開閉状態
   */
  setSidebarOpen: (isOpen: boolean) => void;

  /**
   * モバイル表示状態を設定する
   * @param isMobile モバイル表示状態
   */
  setMobileView: (isMobile: boolean) => void;

  /**
   * ナローデスクトップ表示状態を設定する
   * @param isNarrow ナローデスクトップ表示状態
   */
  setNarrowDesktop: (isNarrow: boolean) => void;
}

/**
 * UI状態管理ストア
 */
export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // デフォルトはサイドバー開いた状態
      isSidebarOpen: true,

      // デフォルトはデスクトップ表示
      isMobileView: false,

      // デフォルトはワイドデスクトップ
      isNarrowDesktop: false,

      toggleSidebar: () =>
        set((state) => {
          const newState = !state.isSidebarOpen;
          return { isSidebarOpen: newState };
        }),

      setSidebarOpen: (isOpen) =>
        set(() => {
          return { isSidebarOpen: isOpen };
        }),

      setMobileView: (isMobile) =>
        set(() => {
          return { isMobileView: isMobile };
        }),

      setNarrowDesktop: (isNarrow) =>
        set(() => {
          return { isNarrowDesktop: isNarrow };
        }),
    }),
    {
      name: 'ui-storage', // localStorage key name
      partialize: (state) => ({ isSidebarOpen: state.isSidebarOpen }), // Specify items to persist
    }
  )
);
