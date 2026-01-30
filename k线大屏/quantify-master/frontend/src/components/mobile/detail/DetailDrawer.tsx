import React from 'react';
import { Drawer } from 'antd';
import { getThemeColors, type Theme } from '../theme.ts';
import { type DataType, type Period, type IndicatorType } from '../constants.ts';
import { DetailContent } from './DetailContent.tsx';
import type { MainOverlayType } from './types.ts';

interface DetailDrawerProps {
  theme: Theme;
  currentTheme: ReturnType<typeof getThemeColors>;
  open: boolean;
  onClose: () => void;
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
  // 收藏功能
  favoriteGroups?: string[];
  isInFavorites?: (ts_code: string, groupName: string, itemType?: string) => boolean;
  onFavoriteClick?: () => void;
}

const DetailDrawer: React.FC<DetailDrawerProps> = ({
  theme,
  currentTheme,
  open,
  onClose,
  onAfterOpenChange,
  // content props
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
  favoriteGroups,
  isInFavorites,
  onFavoriteClick,
}) => {
  const detailClassName = open ? 'mobile-detail-fullscreen' : '';

  // 阻止所有点击事件穿透到下层
  const handleContainerClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
  };

  return (
    <Drawer
      className={`${detailClassName} ${theme === 'dark' ? 'mobile-drawer-dark' : 'mobile-drawer-light'}`}
      rootClassName={detailClassName || undefined}
      title={null}
      placement="bottom"
      onClose={onClose}
      open={open}
      height="100vh"
      mask={false}
      afterOpenChange={onAfterOpenChange}
      styles={{
        body: { background: currentTheme.bg, color: currentTheme.text, padding: 0 },
        header: { display: 'none' }
      }}
      closable={false}
    >
      <div 
        onClick={handleContainerClick}
        onTouchEnd={handleContainerClick}
        style={{ 
          width: '100%', 
          height: '100%',
          position: 'relative',
          zIndex: 1
        }}
      >
        <DetailContent
        theme={theme}
        currentTheme={currentTheme}
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
      </div>
    </Drawer>
  );
};

export default DetailDrawer;
