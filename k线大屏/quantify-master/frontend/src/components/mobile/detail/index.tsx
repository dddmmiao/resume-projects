/**
 * 移动端详情页 - 主入口文件
 * 导出所有详情页相关组件
 */

// 导出主要组件
export { default as DetailDrawer } from './DetailDrawer.tsx';
export { default as DetailSection } from './DetailSection.tsx';

// 导出子组件
export { DetailHeader } from './DetailHeader.tsx';
export { DetailContent } from './DetailContent.tsx';
export { DetailSelectionDrawers } from './DetailSelectionDrawers.tsx';
export { DetailBottomDrawers } from './DetailBottomDrawers.tsx';

// 导出类型定义
export type {
  MainOverlayType,
  DetailHeaderSectionProps,
  DetailDrawerContentProps,
  DetailSelectionDrawersProps,
  DetailBottomDrawersProps,
} from './types.ts';
