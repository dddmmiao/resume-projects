// 移动端主题配置

export type Theme = 'dark' | 'light';

export interface ThemeColors {
  bg: string;
  card: string;
  text: string;
  textSecondary: string;
  border: string;
  positive: string;
  negative: string;
  primary: string;  // 主色调（蓝色系）
}

export const themeColors: Record<Theme, ThemeColors> = {
  light: { 
    bg: '#ffffff', 
    card: '#f8f9fa', 
    text: '#1a1a1a',
    textSecondary: '#666666',
    border: '#e1e5e9',
    positive: '#ff4d4f',
    negative: '#52c41a',
    primary: '#1677ff'
  },
  dark: { 
    bg: '#000000', 
    card: '#1a1a1a', 
    text: '#ffffff',
    textSecondary: '#cccccc',
    border: '#333333',
    positive: '#ff4d4f',
    negative: '#52c41a',
    primary: '#1890ff'
  }
};

// 获取当前主题颜色
export const getThemeColors = (theme: Theme): ThemeColors => {
  return themeColors[theme] || themeColors.light;
};

// 获取背景渐变
export const getBackgroundGradient = (theme: Theme): string => {
  return theme === 'light' 
    ? 'linear-gradient(to bottom, #f5f5f5, #fafafa)'
    : 'linear-gradient(to bottom, #0a0a0a, #000000)';
};

// 获取卡片背景渐变
export const getCardBackgroundGradient = (theme: Theme): string => {
  return theme === 'light' 
    ? 'linear-gradient(to bottom, rgba(255,255,255,0.8), rgba(248,249,250,0.9))'
    : 'linear-gradient(to bottom, rgba(26,26,26,0.9), rgba(20,20,20,0.95))';
};

