import React from 'react';
import { getThemeColors, type Theme } from '../theme.ts';
import { type DataType, type Period, type IndicatorType } from '../constants.ts';
import DetailDrawer from './DetailDrawer.tsx';
import { DetailSelectionDrawers } from './DetailSelectionDrawers.tsx';
import { DetailBottomDrawers } from './DetailBottomDrawers.tsx';
import type { MainOverlayType } from './types.ts';

interface DetailSectionProps {
  theme: Theme;
  currentTheme: ReturnType<typeof getThemeColors>;
  // drawer
  detailVisible: boolean;
  onDrawerClose: () => void;
  onAfterOpenChange?: (open: boolean) => void;
  // content props
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
  // selection drawers
  detailPeriodDrawerVisible: boolean;
  detailIndicatorDrawerVisible: boolean;
  detailTimeRangeDrawerVisible: boolean;
  setPeriodForCode: (tsCode: string, period: Period) => void;
  setTimeRangeForCode: (tsCode: string, timeRange: number | string) => void;
  setIndicatorForCode: (tsCode: string, indicator: IndicatorType) => void;
  setMainOverlaysForCode?: (tsCode: string, overlays: MainOverlayType[]) => void;
  // bottom drawers
  tagsModalVisible: boolean;
  callRecordsModalVisible: boolean;
  hotInfoModalVisible: boolean;
  hotInfoStock: any;
  setHotInfoStock: (stock: any) => void;
  // 收藏功能
  favoriteGroups?: string[];
  isInFavorites?: (ts_code: string, groupName: string, itemType?: string) => boolean;
  onFavoriteClick?: () => void;
}

const DetailSection: React.FC<DetailSectionProps> = (props) => {
  const {
    theme,
    currentTheme,
    detailVisible,
    onDrawerClose,
    onAfterOpenChange,
    // content
    selectedStock,
    detailCurrentTsCode,
    detailCurrentName,
    detailDataType,
    dataType,
    originalSelectedStock,
    isShowingUnderlying,
    isShowingBond,
    currentKlineData,
    miniKlines,
    getPeriodForCode,
    getTimeRangeForCode,
    getIndicatorForCode,
    getMainOverlaysForCode,
    setDetailCurrentTsCode,
    setDetailCurrentName,
    setDetailDataType,
    setIsShowingUnderlying,
    setIsShowingBond,
    setTagsModalVisible,
    setCallRecordsModalVisible,
    setHotInfoModalVisible,
    setDetailPeriodDrawerVisible,
    setDetailTimeRangeDrawerVisible,
    setDetailIndicatorDrawerVisible,
    handleDetailClose,
    globalIsSnapMode,
    setGlobalIsSnapMode,
    tradeDate,
    handleKlineDataUpdate,
    // selection drawers
    detailPeriodDrawerVisible,
    detailIndicatorDrawerVisible,
    detailTimeRangeDrawerVisible,
    setPeriodForCode,
    setTimeRangeForCode,
    setIndicatorForCode,
    setMainOverlaysForCode,
    // bottom drawers
    tagsModalVisible,
    callRecordsModalVisible,
    hotInfoModalVisible,
    hotInfoStock,
    setHotInfoStock,
    // 收藏功能
    favoriteGroups,
    isInFavorites,
    onFavoriteClick,
  } = props;

  return (
    <>
      <DetailDrawer
        theme={theme}
        currentTheme={currentTheme}
        open={detailVisible}
        onClose={onDrawerClose}
        onAfterOpenChange={onAfterOpenChange}
        selectedStock={selectedStock}
        detailCurrentTsCode={detailCurrentTsCode}
        detailCurrentName={detailCurrentName}
        detailDataType={detailDataType}
        dataType={dataType}
        originalSelectedStock={originalSelectedStock}
        isShowingUnderlying={isShowingUnderlying}
        isShowingBond={isShowingBond}
        currentKlineData={currentKlineData}
        miniKlines={miniKlines}
        getPeriodForCode={getPeriodForCode}
        getTimeRangeForCode={getTimeRangeForCode}
        getIndicatorForCode={getIndicatorForCode}
        getMainOverlaysForCode={getMainOverlaysForCode}
        setDetailCurrentTsCode={setDetailCurrentTsCode}
        setDetailCurrentName={setDetailCurrentName}
        setDetailDataType={setDetailDataType}
        setIsShowingUnderlying={setIsShowingUnderlying}
        setIsShowingBond={setIsShowingBond}
        setTagsModalVisible={setTagsModalVisible}
        setCallRecordsModalVisible={setCallRecordsModalVisible}
        setHotInfoModalVisible={setHotInfoModalVisible}
        setDetailPeriodDrawerVisible={setDetailPeriodDrawerVisible}
        setDetailTimeRangeDrawerVisible={setDetailTimeRangeDrawerVisible}
        setDetailIndicatorDrawerVisible={setDetailIndicatorDrawerVisible}
        handleDetailClose={handleDetailClose}
        globalIsSnapMode={globalIsSnapMode}
        setGlobalIsSnapMode={setGlobalIsSnapMode}
        tradeDate={tradeDate}
        handleKlineDataUpdate={handleKlineDataUpdate}
        favoriteGroups={favoriteGroups}
        isInFavorites={isInFavorites}
        onFavoriteClick={onFavoriteClick}
      />

      <DetailSelectionDrawers
        theme={theme}
        detailCurrentTsCode={detailCurrentTsCode}
        detailDataType={detailDataType}
        detailPeriodDrawerVisible={detailPeriodDrawerVisible}
        detailIndicatorDrawerVisible={detailIndicatorDrawerVisible}
        detailTimeRangeDrawerVisible={detailTimeRangeDrawerVisible}
        setDetailPeriodDrawerVisible={setDetailPeriodDrawerVisible}
        setDetailIndicatorDrawerVisible={setDetailIndicatorDrawerVisible}
        setDetailTimeRangeDrawerVisible={setDetailTimeRangeDrawerVisible}
        getPeriodForCode={getPeriodForCode}
        getTimeRangeForCode={getTimeRangeForCode}
        getIndicatorForCode={getIndicatorForCode}
        getMainOverlaysForCode={getMainOverlaysForCode}
        setPeriodForCode={setPeriodForCode}
        setTimeRangeForCode={setTimeRangeForCode}
        setIndicatorForCode={setIndicatorForCode}
        setMainOverlaysForCode={setMainOverlaysForCode}
      />

      <DetailBottomDrawers
        theme={theme}
        currentTheme={currentTheme}
        selectedStock={selectedStock}
        tagsModalVisible={tagsModalVisible}
        setTagsModalVisible={setTagsModalVisible}
        callRecordsModalVisible={callRecordsModalVisible}
        setCallRecordsModalVisible={setCallRecordsModalVisible}
        hotInfoModalVisible={hotInfoModalVisible}
        setHotInfoModalVisible={setHotInfoModalVisible}
        hotInfoStock={hotInfoStock}
        setHotInfoStock={setHotInfoStock}
      />
    </>
  );
};

export default DetailSection;
