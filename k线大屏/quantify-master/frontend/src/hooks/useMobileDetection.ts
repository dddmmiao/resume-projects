import { useState } from 'react';

interface MobileDetectionResult {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  screenWidth: number;
  screenHeight: number;
  orientation: 'portrait' | 'landscape';
}

export const useMobileDetection = (): MobileDetectionResult => {
  // 优化后的移动端检测：使用静态检测，避免resize监听导致的重新渲染
  const getInitialDetection = (): MobileDetectionResult => {
    if (typeof window === 'undefined') {
      return {
        isMobile: false,
        isTablet: false, 
        isDesktop: true,
        screenWidth: 375,
        screenHeight: 667,
        orientation: 'portrait'
      };
    }

    const width = window.innerWidth;
    const height = window.innerHeight;
    
    // 基于User Agent的稳定检测
    const userAgent = navigator.userAgent.toLowerCase();
    const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
    
    // 结合屏幕尺寸和User Agent
    const isMobile = isMobileUA || width <= 768;
    const isTablet = !isMobileUA && width > 768 && width <= 1024;
    const isDesktop = !isMobileUA && width > 1024;
    
    return {
      isMobile,
      isTablet,
      isDesktop,
      screenWidth: width,
      screenHeight: height,
      orientation: width > height ? 'landscape' : 'portrait'
    };
  };

  // 使用静态检测，移动端不监听resize事件，避免频繁重新渲染
  const [detection] = useState<MobileDetectionResult>(getInitialDetection);

  return detection;
};
