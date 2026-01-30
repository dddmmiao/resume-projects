import { useEffect } from 'react';

/**
 * Lock body scroll when isLocked is true; restore on unlock/unmount.
 * Preserves scroll position using a data attribute and restores via rAF,
 * matching the previous behavior in MobileDashboard.
 */
export default function useBodyScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) return;

    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    const originalWidth = document.body.style.width;
    const scrollY = window.scrollY;

    // 保存滚动位置到data属性，避免闭包问题
    document.body.setAttribute('data-scroll-y', String(scrollY));

    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.top = `-${scrollY}px`;

    return () => {
      try {
        // 恢复样式
        document.body.style.overflow = originalOverflow;
        document.body.style.position = originalPosition;
        document.body.style.width = originalWidth;
        document.body.style.top = '';

        // 使用requestAnimationFrame延迟恢复滚动位置，避免触发页面刷新
        const savedScrollY = document.body.getAttribute('data-scroll-y');
        if (savedScrollY) {
          const scrollYNum = parseInt(savedScrollY, 10);
          if (!isNaN(scrollYNum) && scrollYNum >= 0) {
            requestAnimationFrame(() => {
              window.scrollTo({ top: scrollYNum, behavior: 'auto' });
            });
          }
          document.body.removeAttribute('data-scroll-y');
        }
      } catch (error) {
        // Failed to restore body styles
      }
    };
  }, [isLocked]);
}
