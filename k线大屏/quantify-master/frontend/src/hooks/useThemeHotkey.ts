import { useEffect } from 'react';

type Theme = 'dark' | 'light' | 'blue' | 'purple' | 'green' | 'orange' | 'cyan' | 'red' | 'gold';

interface UseThemeHotkeyProps {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

/**
 * 主题切换快捷键 Hook
 * 支持按 R 键切换上一个主题，T 键切换下一个主题
 */
export const useThemeHotkey = ({ theme, setTheme }: UseThemeHotkeyProps) => {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      // 如果按下了修饰键，不处理
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      
      // 检查当前焦点元素，避免在输入框中触发
      const active = document.activeElement as HTMLElement | null;
      if (active && (
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.getAttribute('contenteditable') === 'true' ||
        active.closest('.ant-select') ||
        active.closest('.ant-modal')
      )) return;

      const themes: Theme[] = ['dark', 'light', 'blue', 'purple', 'green', 'orange', 'cyan', 'red', 'gold'];
      const currentIndex = themes.indexOf(theme);

      // 处理 T 键 - 切换到下一个主题
      if (event.key === 't' || event.key === 'T') {
        event.preventDefault();
        const nextIndex = (currentIndex + 1) % themes.length;
        setTheme(themes[nextIndex]);
      }
      
      // 处理 R 键 - 切换到上一个主题
      if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        const prevIndex = (currentIndex - 1 + themes.length) % themes.length;
        setTheme(themes[prevIndex]);
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [theme, setTheme]);
};

