/**
 * 任务管理 Hook
 */
import { useState, useCallback } from 'react';
import authFetch from '../utils/authFetch.ts';
import { message } from 'antd';
import { TaskProgress, TaskConfig } from '../types/admin';

export const useTaskManager = () => {
  const [taskProgress, setTaskProgress] = useState<TaskProgress>({});
  const [taskConfig, setTaskConfig] = useState<TaskConfig>({
    cron_expression: '0 0 * * *',
    is_enabled: false
  });

  // 获取任务进度
  const fetchTaskProgress = useCallback(async () => {
    try {
      const response = await authFetch('/api/admin/tasks/progress');
      if (response.ok) {
        const data = await response.json();
        setTaskProgress(data);
      } else {
        message.error('获取任务进度失败');
      }
    } catch (error) {
      message.error('获取任务进度失败');
    }
  }, []);

  // 获取任务配置
  const fetchTaskConfig = useCallback(async () => {
    try {
      const response = await authFetch('/api/admin/tasks/config');
      if (response.ok) {
        const data = await response.json();
        setTaskConfig(data);
      } else {
        message.error('获取任务配置失败');
      }
    } catch (error) {
      message.error('获取任务配置失败');
    }
  }, []);

  // 更新任务配置
  const updateTaskConfig = useCallback(async (config: Partial<TaskConfig>) => {
    try {
      const response = await authFetch('/api/admin/tasks/config', {
        method: 'PUT',
        body: JSON.stringify(config),
      });

      if (response.ok) {
        message.success('任务配置更新成功');
        await fetchTaskConfig();
      } else {
        const errorData = await response.json();
        message.error(errorData.message || '更新任务配置失败');
      }
    } catch (error) {
      message.error('更新任务配置失败');
    }
  }, [fetchTaskConfig]);

  // 任务操作
  const taskAction = useCallback(async (taskId: string, action: 'start' | 'stop' | 'restart') => {
    try {
      const response = await authFetch(`/api/admin/tasks/${taskId}/${action}`, {
        method: 'POST',
      });

      if (response.ok) {
        message.success(`任务${action === 'start' ? '启动' : action === 'stop' ? '停止' : '重启'}成功`);
        await fetchTaskProgress();
      } else {
        const errorData = await response.json();
        message.error(errorData.message || `任务${action}失败`);
      }
    } catch (error) {
      message.error(`任务${action}失败`);
    }
  }, [fetchTaskProgress]);

  // 恢复运行中的任务
  const restoreRunningTasks = useCallback(async () => {
    try {
      const response = await authFetch('/api/admin/tasks/restore');
      if (response.ok) {
        const data = await response.json();
        setTaskProgress(prev => ({ ...prev, ...data }));
      }
    } catch (error) {
    }
  }, []);

  return {
    taskProgress,
    taskConfig,
    fetchTaskProgress,
    fetchTaskConfig,
    updateTaskConfig,
    taskAction,
    restoreRunningTasks
  };
};
