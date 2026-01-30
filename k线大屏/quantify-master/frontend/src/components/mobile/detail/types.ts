/**
 * 移动端详情页共享类型定义
 */

import type { Theme } from '../theme.ts';
import type { DataType, Period, IndicatorType } from '../constants.ts';
import { getThemeColors } from '../theme.ts';

// 主图叠加指标类型
export type MainOverlayType = 'ma' | 'expma' | 'boll' | 'sar' | 'td';

// 详情页头部组件Props
export interface DetailHeaderSectionProps {
  currentTheme: ReturnType<typeof getThemeColors>;
  selectedStock: any;
  detailCurrentTsCode: string;
  detailCurrentName: string;
  detailDataType: 'stock' | 'convertible_bond' | 'concept' | 'industry';
  dataType: DataType;
  originalSelectedStock: any;
  isShowingUnderlying: boolean;
  isShowingBond: boolean;
  setDetailCurrentTsCode: (tsCode: string) => void;
  setDetailCurrentName: (name: string) => void;
  setDetailDataType: (type: 'stock' | 'convertible_bond' | 'concept' | 'industry') => void;
  setIsShowingUnderlying: (value: boolean) => void;
  setIsShowingBond: (value: boolean) => void;
  setTagsModalVisible: (visible: boolean) => void;
  setCallRecordsModalVisible: (visible: boolean) => void;
  handleDetailClose: (event?: React.MouseEvent | React.KeyboardEvent | React.TouchEvent) => void;
  isHot: boolean;
  flameColor: string;
  canOpenModal: boolean;
  handleHotIconClick: (e: React.MouseEvent) => void;
  // 收藏功能
  favoriteGroups?: string[];
  isInFavorites?: (ts_code: string, groupName: string, itemType?: string) => boolean;
  onFavoriteClick?: () => void;
}

// 详情页主内容组件Props
export interface DetailDrawerContentProps {
  theme: Theme;
  currentTheme: ReturnType<typeof getThemeColors>;
  selectedStock: any;
  detailCurrentTsCode: string;
  detailCurrentName: string;
  detailDataType: 'stock' | 'convertible_bond' | 'concept' | 'industry';
  dataType: DataType;
  originalSelectedStock: any;
  isShowingUnderlying: boolean;
  isShowingBond: boolean;
  currentKlineData: any;
  miniKlines: Record<string, any[]>;
  getPeriodForCode: (tsCode: string) => Period;
  getTimeRangeForCode: (tsCode: string) => number | string;
  getIndicatorForCode: (tsCode: string) => IndicatorType;
  getMainOverlaysForCode?: (tsCode: string) => MainOverlayType[];
  setDetailCurrentTsCode: (tsCode: string) => void;
  setDetailCurrentName: (name: string) => void;
  setDetailDataType: (type: 'stock' | 'convertible_bond' | 'concept' | 'industry') => void;
  setIsShowingUnderlying: (value: boolean) => void;
  setIsShowingBond: (value: boolean) => void;
  setTagsModalVisible: (visible: boolean) => void;
  setCallRecordsModalVisible: (visible: boolean) => void;
  setHotInfoModalVisible: (visible: boolean) => void;
  setDetailPeriodDrawerVisible: (visible: boolean) => void;
  setDetailTimeRangeDrawerVisible: (visible: boolean) => void;
  setDetailIndicatorDrawerVisible: (visible: boolean) => void;
  handleDetailClose: (event?: React.MouseEvent | React.KeyboardEvent | React.TouchEvent) => void;
  globalIsSnapMode: boolean;
  setGlobalIsSnapMode: (value: boolean) => void;
  tradeDate: string;
  handleKlineDataUpdate: (latestData: any) => void;
  // 收藏功能
  favoriteGroups?: string[];
  isInFavorites?: (ts_code: string, groupName: string, itemType?: string) => boolean;
  onFavoriteClick?: () => void;
}

// 选择器抽屉组件Props
export interface DetailSelectionDrawersProps {
  theme: Theme;
  detailCurrentTsCode: string;
  detailDataType?: 'stock' | 'convertible_bond' | 'concept' | 'industry';
  detailPeriodDrawerVisible: boolean;
  detailIndicatorDrawerVisible: boolean;
  detailTimeRangeDrawerVisible: boolean;
  setDetailPeriodDrawerVisible: (visible: boolean) => void;
  setDetailIndicatorDrawerVisible: (visible: boolean) => void;
  setDetailTimeRangeDrawerVisible: (visible: boolean) => void;
  getPeriodForCode: (tsCode: string) => Period;
  getTimeRangeForCode: (tsCode: string) => number | string;
  getIndicatorForCode: (tsCode: string) => IndicatorType;
  getMainOverlaysForCode?: (tsCode: string) => MainOverlayType[];
  setPeriodForCode: (tsCode: string, period: Period) => void;
  setTimeRangeForCode: (tsCode: string, range: number | string) => void;
  setIndicatorForCode: (tsCode: string, indicator: IndicatorType) => void;
  setMainOverlaysForCode?: (tsCode: string, overlays: MainOverlayType[]) => void;
}

// 底部抽屉组件Props
export interface DetailBottomDrawersProps {
  theme: Theme;
  currentTheme: ReturnType<typeof getThemeColors>;
  selectedStock: any;
  tagsModalVisible: boolean;
  setTagsModalVisible: (visible: boolean) => void;
  callRecordsModalVisible: boolean;
  setCallRecordsModalVisible: (visible: boolean) => void;
  hotInfoModalVisible: boolean;
  setHotInfoModalVisible: (visible: boolean) => void;
  hotInfoStock: any;
  setHotInfoStock: (stock: any) => void;
}
