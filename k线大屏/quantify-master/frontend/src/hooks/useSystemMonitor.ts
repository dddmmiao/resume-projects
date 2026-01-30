/**
 * 系统监控 Hook
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { message } from 'antd';
import authFetch from '../utils/authFetch.ts';

export interface SystemStatus {
  cpu: number;
  memory: number;
  disk: number;
  network: number;
  uptime: number;
  load_average: number[];
}

export interface StatisticsCount {
  stock: number;
  convertible_bond: number;
  concept: number;
  industry: number;
}

export const useSystemMonitor = () => {
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    cpu: 0,
    memory: 0,
    disk: 0,
    network: 0,
    uptime: 0,
    load_average: [0, 0, 0]
  });
  const [statisticsCount, setStatisticsCount] = useState<StatisticsCount>({
    stock: 0,
    convertible_bond: 0,
    concept: 0,
    industry: 0
  });
  const [loading, setLoading] = useState(false);
  
  // 添加缓存机制，避免重复请求
  const lastFetchTime = useRef<number>(0);
  const cacheTimeout = 300000; // 5分钟缓存，减少重复请求
  const lastSystemStatusTime = useRef<number>(0);
  const systemStatusCacheTimeout = 300000; // 5分钟缓存

  // 获取系统状态
  const fetchSystemStatus = useCallback(async () => {
    // 检查缓存，避免短时间内重复请求
    const now = Date.now();
    if (now - lastSystemStatusTime.current < systemStatusCacheTimeout) {
      return;
    }
    
    try {
      lastSystemStatusTime.current = now;
      
      const response = await authFetch('/api/admin/system/status');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setSystemStatus(data.data);
        }
      } else {
        // Failed to get system status
      }
    } catch (error) {
      // Failed to get system status
    }
  }, []);

  // 获取统计数据
  const fetchStatisticsCount = useCallback(async () => {
    // 检查缓存，避免短时间内重复请求
    const now = Date.now();
    if (now - lastFetchTime.current < cacheTimeout) {
      return;
    }
    
    try {
      setLoading(true);
      lastFetchTime.current = now;
      
      // 使用统一的统计数据API
      const response = await authFetch('/api/statistics/overview');
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setStatisticsCount({
            stock: data.data.stock || 0,
            convertible_bond: data.data.convertible_bond || 0,
            concept: data.data.concept || 0,
            industry: data.data.industry || 0
          });
        }
      } else {
        // Failed to get statistics
      }
    } catch (error) {
      message.error('获取统计数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 刷新所有监控数据
  const refreshAll = useCallback(async () => {
    await Promise.all([
      fetchSystemStatus(),
      fetchStatisticsCount()
    ]);
  }, [fetchSystemStatus, fetchStatisticsCount]);

  // 定时刷新系统状态 - 减少频率到5分钟
  useEffect(() => {
    const interval = setInterval(fetchSystemStatus, 300000); // 每5分钟刷新一次
    return () => clearInterval(interval);
  }, [fetchSystemStatus]);

  // 初始化数据
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  return {
    systemStatus,
    statisticsCount,
    loading,
    fetchSystemStatus,
    fetchStatisticsCount,
    refreshAll
  };
};
