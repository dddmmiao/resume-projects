import { useState, useCallback } from 'react';
import type { DataType } from '../components/mobile/constants.ts';
import { resolveKlineDataType } from '../components/mobile/utils.ts';

const useDetailPanelState = (dataType: DataType) => {
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedStock, setSelectedStock] = useState<any>(null);
  const [detailCurrentTsCode, setDetailCurrentTsCode] = useState<string>('');
  const [detailCurrentName, setDetailCurrentName] = useState<string>('');
  const [detailDataType, setDetailDataType] = useState<'stock' | 'convertible_bond' | 'concept' | 'industry'>('stock');
  const [isShowingUnderlying, setIsShowingUnderlying] = useState(false);
  const [isShowingBond, setIsShowingBond] = useState(false);
  const [originalSelectedStock, setOriginalSelectedStock] = useState<any>(null);
  const [currentKlineData, setCurrentKlineData] = useState<any>(null);

  const handleCardClick = useCallback((item: any) => {
    setSelectedStock(item);
    setOriginalSelectedStock(item);
    // 使用工具函数统一处理类型判断
    const itemDataType = resolveKlineDataType(dataType, item);
    setDetailDataType(itemDataType);
    setDetailCurrentTsCode(
      itemDataType === 'concept' ? item.concept_code :
      itemDataType === 'industry' ? item.industry_code :
      (item.ts_code || item.code || item.symbol)
    );
    setDetailCurrentName(item.name || item.bond_short_name || item.concept_name || item.industry_name || item.ts_name || item.ts_code);
    setIsShowingUnderlying(false);
    setIsShowingBond(false);
    setDetailVisible(true);
  }, [
    dataType,
    setSelectedStock,
    setOriginalSelectedStock,
    setDetailDataType,
    setDetailCurrentTsCode,
    setDetailCurrentName,
    setIsShowingUnderlying,
    setIsShowingBond,
    setDetailVisible,
  ]);

  const handleKlineDataUpdate = useCallback((latestData: any) => {
    if (latestData) {
      setCurrentKlineData(latestData);
    }
  }, [setCurrentKlineData]);

  return {
    detailVisible,
    selectedStock,
    detailCurrentTsCode,
    detailCurrentName,
    detailDataType,
    isShowingUnderlying,
    isShowingBond,
    originalSelectedStock,
    currentKlineData,
    setDetailVisible,
    setSelectedStock,
    setDetailCurrentTsCode,
    setDetailCurrentName,
    setDetailDataType,
    setIsShowingUnderlying,
    setIsShowingBond,
    setOriginalSelectedStock,
    setCurrentKlineData,
    handleCardClick,
    handleKlineDataUpdate,
  };
};

export default useDetailPanelState;
