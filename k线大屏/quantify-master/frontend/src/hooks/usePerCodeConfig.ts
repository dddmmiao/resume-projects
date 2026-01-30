import { useState, useCallback } from 'react';
import type { Period, IndicatorType } from '../components/mobile/constants.ts';

// 主图叠加指标类型
export type MainOverlayType = 'ma' | 'expma' | 'boll' | 'sar' | 'td';

const usePerCodeConfig = (
  period: Period,
  timeRange: number | string,
  indicator: IndicatorType,
  globalMainOverlays: MainOverlayType[] = []
) => {
  const [cardPeriods, setCardPeriods] = useState<Record<string, Period>>({});
  const [cardTimeRanges, setCardTimeRanges] = useState<Record<string, number | string>>({});
  const [cardIndicators, setCardIndicators] = useState<Record<string, IndicatorType>>({});
  const [cardMainOverlays, setCardMainOverlays] = useState<Record<string, MainOverlayType[]>>({});

  // 获取指定code的周期状态（列表页和详情页通用）
  const getPeriodForCode = useCallback((tsCode: string): Period => {
    return cardPeriods[tsCode] || period; // 个别设置优先，否则使用全局周期
  }, [cardPeriods, period]);

  // 获取指定code的范围状态（列表页和详情页通用）
  const getTimeRangeForCode = useCallback((tsCode: string): number | string => {
    return cardTimeRanges[tsCode] !== undefined ? cardTimeRanges[tsCode] : timeRange; // 个别设置优先，否则使用全局范围
  }, [cardTimeRanges, timeRange]);

  // 获取指定code的指标状态（列表页和详情页通用）
  const getIndicatorForCode = useCallback((tsCode: string): IndicatorType => {
    return cardIndicators[tsCode] || indicator; // 个别设置优先，否则使用全局指标
  }, [cardIndicators, indicator]);

  // 设置指定code的周期状态（详情页切换时调用）
  const setPeriodForCode = useCallback((tsCode: string, newPeriod: Period) => {
    setCardPeriods(prev => ({
      ...prev,
      [tsCode]: newPeriod,
    }));
  }, []);

  // 设置指定code的范围状态（详情页切换时调用）
  const setTimeRangeForCode = useCallback((tsCode: string, newTimeRange: number | string) => {
    setCardTimeRanges(prev => ({
      ...prev,
      [tsCode]: newTimeRange,
    }));
  }, []);

  // 设置指定code的指标状态（详情页切换时调用）
  const setIndicatorForCode = useCallback((tsCode: string, newIndicator: IndicatorType) => {
    setCardIndicators(prev => ({
      ...prev,
      [tsCode]: newIndicator,
    }));
  }, []);

  // 获取指定code的主图叠加指标状态
  const getMainOverlaysForCode = useCallback((tsCode: string): MainOverlayType[] => {
    return cardMainOverlays[tsCode] !== undefined ? cardMainOverlays[tsCode] : globalMainOverlays;
  }, [cardMainOverlays, globalMainOverlays]);

  // 设置指定code的主图叠加指标状态
  const setMainOverlaysForCode = useCallback((tsCode: string, newOverlays: MainOverlayType[]) => {
    setCardMainOverlays(prev => ({
      ...prev,
      [tsCode]: newOverlays,
    }));
  }, []);

  return {
    cardPeriods,
    cardTimeRanges,
    cardIndicators,
    cardMainOverlays,
    setCardPeriods,
    setCardTimeRanges,
    setCardIndicators,
    setCardMainOverlays,
    getPeriodForCode,
    getTimeRangeForCode,
    getIndicatorForCode,
    getMainOverlaysForCode,
    setPeriodForCode,
    setTimeRangeForCode,
    setIndicatorForCode,
    setMainOverlaysForCode,
  };
};

export default usePerCodeConfig;
