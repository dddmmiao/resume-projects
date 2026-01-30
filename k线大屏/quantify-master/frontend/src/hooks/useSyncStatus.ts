/**
 * 同步状态管理 Hook
 */
import { useState, useCallback } from 'react';
import { message } from 'antd';
import authFetch from '../utils/authFetch.ts';
import { SyncStatus, SyncConfig } from '../types/admin';

export const useSyncStatus = (adminMode: boolean = false) => {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncConfig, setSyncConfig] = useState<SyncConfig>({
    sync_type: 'stock',
    selected_items: [],
    selected_periods: ['daily'],
    sync_days: 365,
    selected_item_names: {}
  });

  // 获取同步状态（后端接口已移除，这里保持空实现以避免调用失败）
  const fetchSyncStatus = useCallback(async () => {
    setSyncStatus(null);
  }, []);

  // 更新同步配置
  const updateSyncConfig = useCallback((config: Partial<SyncConfig>) => {
    setSyncConfig(prev => ({ ...prev, ...config }));
  }, []);

  // 开始同步
  const startSync = useCallback(async (type: string) => {
    try {
      const response = await authFetch('/api/admin/sync/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          sync_type: type,
          config: syncConfig
        }),
      });

      if (response.ok) {
        message.success(`${type}同步已开始`);
        await fetchSyncStatus();
      } else {
        const errorData = await response.json();
        message.error(errorData.message || '启动同步失败');
      }
    } catch (error) {
      message.error('启动同步失败');
    }
  }, [syncConfig, fetchSyncStatus]);

  // 停止同步
  const stopSync = useCallback(async (type: string) => {
    try {
      const response = await authFetch('/api/admin/sync/stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sync_type: type }),
      });

      if (response.ok) {
        message.success(`${type}同步已停止`);
        await fetchSyncStatus();
      } else {
        const errorData = await response.json();
        message.error(errorData.message || '停止同步失败');
      }
    } catch (error) {
      message.error('停止同步失败');
    }
  }, [fetchSyncStatus]);

  return {
    syncStatus,
    syncConfig,
    fetchSyncStatus,
    updateSyncConfig,
    startSync,
    stopSync
  };
};
