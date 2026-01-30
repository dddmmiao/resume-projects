import { useState, useEffect, useCallback, useRef } from 'react';

const useMiniKlinesCache = () => {
  const [miniKlines, setMiniKlines] = useState<Record<string, any[]>>({});
  const maxCacheSize = 100; // 最大缓存100个K线数据（降低内存占用）
  const CACHE_EXPIRE_TIME = 30 * 60 * 1000; // 30分钟过期

  // 清理缓存函数（改进：同时清理过期和多余的缓存）
  const clearOldCache = useCallback(() => {
    setMiniKlines(prev => {
      const keys = Object.keys(prev);
      const now = Date.now();
      const newCache: Record<string, any[]> = {};
      
      // 先清理过期缓存（如果缓存项有timestamp）
      let validKeys = keys.filter(key => {
        const cacheItem = prev[key];
        // 如果缓存项是数组且第一个元素有timestamp，检查是否过期
        if (Array.isArray(cacheItem) && cacheItem.length > 0 && (cacheItem as any)[0]?.timestamp) {
          return now - (cacheItem as any)[0].timestamp < CACHE_EXPIRE_TIME;
        }
        return false; // 没有timestamp的缓存项视为过期
      });
      
      // 如果仍然超过限制，清理最旧的缓存（保留最近使用的）
      if (validKeys.length > maxCacheSize) {
        validKeys = validKeys.slice(-maxCacheSize);
      }
      
      // 构建新缓存
      validKeys.forEach(key => {
        newCache[key] = prev[key];
      });
      
      return newCache;
    });
  }, [maxCacheSize, CACHE_EXPIRE_TIME]);

  // 性能监控
  const performanceRef = useRef({
    renderCount: 0,
    lastMemoryCheck: Date.now(),
    memoryWarningShown: false,
  });

  // 性能监控effect
  useEffect(() => {
    performanceRef.current.renderCount++;
    
    // 每10秒检查一次内存使用
    const now = Date.now();
    if (now - performanceRef.current.lastMemoryCheck > 10000) {
      performanceRef.current.lastMemoryCheck = now;
      
      // 检查内存使用（如果浏览器支持）
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        const usedMB = Math.round(memory.usedJSHeapSize / 1024 / 1024);
        
        // 内存警告（仅在内存使用过高时）
        if (usedMB > 150 && !performanceRef.current.memoryWarningShown) {
          performanceRef.current.memoryWarningShown = true;
          // 自动清理缓存
          clearOldCache();
        }
      }
    }
  });

  // 组件卸载清理
  useEffect(() => {
    return () => {
      // 组件卸载，清理资源
      // 清理所有缓存
      setMiniKlines({});
      // 重置性能计数器
      performanceRef.current = {
        renderCount: 0,
        lastMemoryCheck: Date.now(),
        memoryWarningShown: false,
      };
    };
  }, []);

  return {
    miniKlines,
    setMiniKlines,
    clearOldCache,
    maxCacheSize,
  };
};

export default useMiniKlinesCache;
