/**
 * K线数据获取和管理Hook
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import authFetch from '../utils/authFetch.ts';
import { KLineData } from '../utils/indicators';
import { useAppStore } from '../stores/useAppStore.ts';

// 全局数据缓存，避免重复API调用
export const klineDataCache = new Map<string, {
  data: KLineData[];
  timestamp: number;
  period: string;
  limit: number; // 已请求的limit值，用于判断是否需要重新请求
}>();

// 缓存配置
const MAX_CACHE_SIZE = 100; // 最大缓存100个K线数据
const CACHE_EXPIRE_TIME = 30 * 60 * 1000; // 30分钟过期

// 清理过期和多余的缓存
const cleanCache = () => {
  const now = Date.now();
  const entries = Array.from(klineDataCache.entries());
  
  // 清理过期缓存
  entries.forEach(([key, value]) => {
    if (now - value.timestamp > CACHE_EXPIRE_TIME) {
      klineDataCache.delete(key);
    }
  });
  
  // 如果缓存仍然超过限制，清理最旧的缓存
  if (klineDataCache.size > MAX_CACHE_SIZE) {
    const sortedEntries = Array.from(klineDataCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const toDelete = sortedEntries.slice(0, klineDataCache.size - MAX_CACHE_SIZE);
    toDelete.forEach(([key]) => {
      klineDataCache.delete(key);
    });
  }
};


export interface UseKLineDataOptions {
  ts_code: string;
  period: string;
  dataType: 'stock' | 'convertible_bond' | 'concept' | 'industry';
  refreshKey: number;
  onLatestDataUpdate?: (latestData: KLineData | null) => void;
  tradeDate?: string; // 交易日期限制，只显示到该日期 YYYYMMDD格式
  timeRange?: number | string; // 时间范围（天数），用于动态计算limit
}

export interface UseKLineDataReturn {
  loading: boolean;
  allKlineData: KLineData[];
  klineData: KLineData[];
  fetchKLineData: () => Promise<void>;
}

// 根据timeRange计算合适的limit值
const calculateLimit = (timeRange: number | string | undefined, period: string): number => {
  // 默认值：3年数据
  const DEFAULT_LIMIT = 750;
  
  if (!timeRange) return DEFAULT_LIMIT;
  
  // 处理字符串类型的timeRange（如 "all"）
  if (typeof timeRange === 'string') {
    if (timeRange === 'all') return DEFAULT_LIMIT;
    const parsed = parseInt(timeRange, 10);
    if (isNaN(parsed)) return DEFAULT_LIMIT;
    // 继续处理解析后的数值
    return calculateLimitByPeriod(parsed, period, DEFAULT_LIMIT);
  }
  
  return calculateLimitByPeriod(timeRange, period, DEFAULT_LIMIT);
};

// 根据周期计算limit
const calculateLimitByPeriod = (days: number, period: string, maxLimit: number): number => {
  // 根据周期将天数转换为K线根数
  let klineCount: number;
  let buffer: number;
  
  if (period === 'weekly') {
    klineCount = Math.ceil(days / 5); // 周线约5个交易日一根
    buffer = 60; // 周线缓冲60根（用于MA60等指标）
  } else if (period === 'monthly') {
    klineCount = Math.ceil(days / 22); // 月线约22个交易日一根
    buffer = 60; // 月线缓冲60根（用于MA60等指标）
  } else {
    klineCount = days; // 日线直接使用天数
    buffer = 60; // 日线缓冲60根（用于MA60等指标，当前最大MA周期为60）
  }
  
  return Math.min(klineCount + buffer, maxLimit);
};

export const useKLineData = (options: UseKLineDataOptions): UseKLineDataReturn => {
  const { ts_code, period, dataType, refreshKey, onLatestDataUpdate, tradeDate, timeRange } = options;

  const indicatorSource = useAppStore(state => state.indicatorSource);
  
  const [loading, setLoading] = useState(true);
  const [allKlineData, setAllKlineData] = useState<KLineData[]>([]);
  const [klineData, setKlineData] = useState<KLineData[]>([]);
  
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevTradeDateRef = useRef<string | undefined>(tradeDate);
  
  // 使用ref存储回调，避免回调变化导致重复请求
  const onLatestDataUpdateRef = useRef(onLatestDataUpdate);
  onLatestDataUpdateRef.current = onLatestDataUpdate;

  const fetchKLineData = useCallback(async () => {
    if (!ts_code) {
      setLoading(false);
      return;
    }

    // 清除之前的定时器
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }

    // 定期清理缓存
    cleanCache();

    // 检查缓存 - 缓存键不含日期，完整数据缓存一次，前端按tradeDate截断显示
    const cacheKey = `${dataType}-${ts_code}-${period}-${indicatorSource}`;
    const cachedData = klineDataCache.get(cacheKey);
    const requiredLimit = calculateLimit(timeRange, period);

    // 如果是强制刷新（refreshKey > 0），清除缓存以确保获取最新数据
    if (refreshKey > 0) {
      klineDataCache.delete(cacheKey);
    }

    // 检查缓存是否过期
    const isCacheValid = cachedData && (Date.now() - cachedData.timestamp < CACHE_EXPIRE_TIME);
    
    // 检查缓存的数据量是否足够（切换到更大范围时需要重新请求）
    const isCacheSufficient = cachedData && cachedData.limit >= requiredLimit;

    // 优先使用缓存数据（缓存有效、未强制刷新、且数据量足够时复用缓存）
    if (isCacheValid && isCacheSufficient && refreshKey === 0) {
      // 缓存的数据也需要排序
      const sortedCachedData = [...cachedData.data].sort((a, b) => {
        const dateA = a.trade_date || '00000000';
        const dateB = b.trade_date || '00000000';
        return dateA.localeCompare(dateB);
      });
      
      setAllKlineData(sortedCachedData);
      
      // 根据tradeDate截断显示数据
      let displayData = sortedCachedData;
      if (tradeDate && sortedCachedData.length > 0) {
        const idx = sortedCachedData.findIndex(d => d.trade_date && d.trade_date > tradeDate);
        if (idx > 0) {
          displayData = sortedCachedData.slice(0, idx);
        }
      }
      setKlineData(displayData);
      setLoading(false);

      // 回调最新数据（使用截断后的数据）
      if (onLatestDataUpdateRef.current && displayData.length > 0) {
        const latestData = displayData[displayData.length - 1];
        onLatestDataUpdateRef.current(latestData);
      }
      return;
    }

    // 设置防抖延迟
    fetchTimeoutRef.current = setTimeout(async () => {
      // 将cachedData移到外层作用域，以便在catch块中使用
      let cachedDataForFallback = cachedData;

      try {
        setLoading(true);

        // 构建URL参数 - 根据周期获取合适的数据量
        const params = new URLSearchParams();
        params.append('period', period);
        
        // 不再传递end_date，获取完整数据，前端根据tradeDate截断显示

        // 设置数据量限制 - 根据timeRange动态计算
        const limit = calculateLimit(timeRange, period);
        params.append('limit', String(limit));

        // 根据数据类型构建不同的API URL
        let url = '';
        if (dataType === 'concept') {
          url = `/api/concepts/${ts_code}/klines?${params.toString()}`;
        } else if (dataType === 'industry') {
          url = `/api/industries/${ts_code}/klines?${params.toString()}`;
        } else if (dataType === 'convertible_bond') {
          url = `/api/convertible-bonds/${ts_code}/klines?${params.toString()}`;
        } else {
          // 默认为股票
          url = `/api/stocks/${ts_code}/klines?${params.toString()}`;
        }
        
        const response = await authFetch(url);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        // 处理API响应结构 - 修正数据解析逻辑
        let klineArray: KLineData[] = [];

        if (result.success && result.data && result.data.klines && Array.isArray(result.data.klines)) {
          // 标准格式：{success: true, data: {klines: [...]}}
          klineArray = result.data.klines;
        } else if (result.success && Array.isArray(result.data)) {
          // 直接数组格式：{success: true, data: [...]}
          klineArray = result.data;
        } else {
          throw new Error('API响应格式不正确');
        }

        // 验证数据格式
        if (klineArray.length > 0) {
          const firstItem = klineArray[0];
          if (!firstItem.trade_date || firstItem.close === undefined || firstItem.close === null) {
            throw new Error('K线数据格式不正确');
          }
        }

        // 后端返回的是倒序数据（最新的在前面），需要转换为正序（最旧的在前面，最新的在后面）
        const sortedKlineArray = [...klineArray].sort((a, b) => {
          const dateA = a.trade_date || '00000000';
          const dateB = b.trade_date || '00000000';
          return dateA.localeCompare(dateB);
        });

        // 存储全量数据
        setAllKlineData(sortedKlineArray);
        
        // 根据tradeDate截断显示数据（前端处理）
        let displayData = sortedKlineArray;
        if (tradeDate && sortedKlineArray.length > 0) {
          // 找到tradeDate对应的索引，截断显示
          const idx = sortedKlineArray.findIndex(d => d.trade_date && d.trade_date > tradeDate);
          if (idx > 0) {
            displayData = sortedKlineArray.slice(0, idx);
          } else if (idx === -1) {
            // 所有数据都在tradeDate之前或等于，显示全部
            displayData = sortedKlineArray;
          }
        }
        setKlineData(displayData);

        // 更新缓存（存储原始数据，不存储填充后的数据）
        klineDataCache.set(cacheKey, {
          data: klineArray,
          timestamp: Date.now(),
          period: period,
          limit: requiredLimit // 记录已请求的limit，用于判断是否需要重新请求
        });
        
        // 设置缓存后清理过期和多余的缓存
        cleanCache();

        // 如果有回调函数，将最新数据传递给父组件
        if (onLatestDataUpdateRef.current && klineArray && klineArray.length > 0) {
          // 最新数据是数组的最后一项（因为数据是按日期正序排列的）
          const latestData = klineArray[klineArray.length - 1];
          onLatestDataUpdateRef.current(latestData);
        }

      } catch (error) {
        // 如果是同步刷新失败，尝试使用缓存数据或重试
        if (refreshKey > 0) {
          // 如果有缓存数据，先使用缓存数据
          if (cachedDataForFallback && cachedDataForFallback.data.length > 0) {
            setAllKlineData(cachedDataForFallback.data);
            setKlineData(cachedDataForFallback.data);

            // 回调最新数据
            if (onLatestDataUpdateRef.current && cachedDataForFallback.data.length > 0) {
              const latestData = cachedDataForFallback.data[cachedDataForFallback.data.length - 1];
              onLatestDataUpdateRef.current(latestData);
            }
          }
        } else {
          // 首次加载失败，保持现有数据不变，避免清空图表
          if (allKlineData.length === 0 && cachedDataForFallback && cachedDataForFallback.data.length > 0) {
            // 如果没有现有数据但有缓存，使用缓存数据
            setAllKlineData(cachedDataForFallback.data);
            setKlineData(cachedDataForFallback.data);

            if (onLatestDataUpdateRef.current && cachedDataForFallback.data.length > 0) {
              const latestData = cachedDataForFallback.data[cachedDataForFallback.data.length - 1];
              onLatestDataUpdateRef.current(latestData);
            }
          }
        }
        // 无论如何都不清空现有数据，保持图表显示
      } finally {
        setLoading(false);
      }
    }, 300); // 300ms防抖延迟
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ts_code, period, refreshKey, dataType, allKlineData.length, indicatorSource, timeRange, tradeDate]);

  // 监听交易日期变化，前端截断显示（不重新请求）
  useEffect(() => {
    if (prevTradeDateRef.current !== tradeDate && allKlineData.length > 0) {
      prevTradeDateRef.current = tradeDate;
      
      // 根据tradeDate截断显示数据
      let displayData = allKlineData;
      if (tradeDate) {
        const idx = allKlineData.findIndex(d => d.trade_date && d.trade_date > tradeDate);
        if (idx > 0) {
          displayData = allKlineData.slice(0, idx);
        }
      }
      setKlineData(displayData);
      
      // 回调最新数据
      if (onLatestDataUpdateRef.current && displayData.length > 0) {
        onLatestDataUpdateRef.current(displayData[displayData.length - 1]);
      }
    }
  }, [tradeDate, allKlineData]);

  return {
    loading,
    allKlineData,
    klineData,
    fetchKLineData
  };
};
