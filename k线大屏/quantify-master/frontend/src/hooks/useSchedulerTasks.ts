import { useCallback, useEffect, useState, useRef } from 'react';
import { message } from 'antd';
import authFetch from '../utils/authFetch.ts';

export interface SchedulerTask {
  id: string;
  name: string;
  status: 'running' | 'paused' | 'stopped';
  cron_expression?: string;
  cron_description?: string;
  next_run_time?: string | null;
  last_run_time?: string | null;
}

export interface UseSchedulerTasksReturn {
  schedulerTasks: SchedulerTask[];
  loadingSchedulerTasks: boolean;
  fetchSchedulerTasks: () => Promise<void>;
  triggeringTasks: Record<string, boolean>;
  handleTriggerTask: (taskId: string, event?: React.MouseEvent, forceFull?: boolean) => Promise<void>;
  editingTaskId: string | null;
  editingCron: string;
  setEditingCron: (v: string) => void;
  startEditCron: (taskId: string, currentCron: string) => void;
  cancelEditCron: () => void;
  saveCronExpression: (taskId: string) => Promise<void>;
  updatingCron: boolean;
  taskForceFullById: Record<string, boolean>;
  setTaskForceFullById: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  updatingStatus: Record<string, boolean>;
  updateTaskStatus: (taskId: string, status: 'running' | 'paused' | 'stopped') => Promise<void>;
}

export const useSchedulerTasks = (
  startTaskProgressMonitoring: (taskId: string, executionId: string | string[], preserveExisting?: boolean) => void
): UseSchedulerTasksReturn => {
  const [schedulerTasks, setSchedulerTasks] = useState<SchedulerTask[]>([]);
  const [loadingSchedulerTasks, setLoadingSchedulerTasks] = useState(false);
  const [triggeringTasks, setTriggeringTasks] = useState<Record<string, boolean>>({});

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingCron, setEditingCron] = useState<string>('');
  const [updatingCron, setUpdatingCron] = useState<boolean>(false);
  const [updatingStatus, setUpdatingStatus] = useState<Record<string, boolean>>({});

  const [taskForceFullById, setTaskForceFullById] = useState<Record<string, boolean>>({
    sync_all_stock_kline_data: false,
    sync_all_bond_kline_data: false,
    sync_all_concept_kline_data: false,
    sync_all_industry_kline_data: false,
  });

  const fetchSchedulerTasks = useCallback(async (silent = false) => {
    if (!silent) setLoadingSchedulerTasks(true);
    try {
      const response = await authFetch('/api/admin/scheduler/tasks');
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setSchedulerTasks((prev) => (JSON.stringify(prev) !== JSON.stringify(result.data) ? result.data : prev));
        }
      }
    } finally {
      if (!silent) setLoadingSchedulerTasks(false);
    }
  }, []);

  // 初始化时自动拉取任务列表，避免初始为空需要手动刷新
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    fetchSchedulerTasks();
  }, []);

  const handleTriggerTask = useCallback(async (taskId: string, event?: React.MouseEvent, forceFull?: boolean) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    try {
      setTriggeringTasks(prev => ({ ...prev, [taskId]: true }));
      const response = await authFetch(`/api/admin/scheduler/tasks/${taskId}/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ options: { force_sync: !!forceFull } }),
      });
      const result = await response.json();
      if (result.success) {
        const execId = result.task_execution_id || result.data?.task_execution_id;
        if (execId) {
          const executionIds = Array.isArray(execId) ? execId : [execId];
          startTaskProgressMonitoring(taskId, executionIds);
        }
      }
    } catch {
    } finally {
      setTriggeringTasks(prev => ({ ...prev, [taskId]: false }));
    }
  }, [startTaskProgressMonitoring]);

  const startEditCron = useCallback((taskId: string, currentCron: string) => {
    setEditingTaskId(taskId);
    setEditingCron(currentCron || '');
  }, []);

  const cancelEditCron = useCallback(() => {
    setEditingTaskId(null);
    setEditingCron('');
  }, []);

  const saveCronExpression = useCallback(async (taskId: string) => {
    if (!editingCron.trim()) {
      message.warning('请输入有效的 cron 表达式');
      return;
    }
    setUpdatingCron(true);
    try {
      const response = await authFetch(`/api/admin/scheduler/tasks/${taskId}/cron`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cron_expression: editingCron.trim() }),
      });
      const result = await response.json();
      if (result.success) {
        message.success('执行周期修改成功');
        await fetchSchedulerTasks(true);  // 静默刷新，不显示加载状态
        cancelEditCron();
      } else {
        message.error(result.message || '修改执行周期失败');
      }
    } catch (e) {
      message.error('网络错误，请重试');
    } finally {
      setUpdatingCron(false);
    }
  }, [editingCron, cancelEditCron, fetchSchedulerTasks]);

  const updateTaskStatus = useCallback(async (taskId: string, status: 'running' | 'paused' | 'stopped') => {
    setUpdatingStatus(prev => ({ ...prev, [taskId]: true }));
    try {
      const response = await authFetch(`/api/admin/scheduler/tasks/${taskId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      const result = await response.json();
      if (result.success && result.data) {
        const updated = result.data as SchedulerTask;
        setSchedulerTasks(prev => prev.map(t => (t.id === taskId ? { ...t, ...updated } : t)));
      }
    } catch {
      // 静默失败，前端可根据需要补充提示
    } finally {
      setUpdatingStatus(prev => ({ ...prev, [taskId]: false }));
    }
  }, []);

  return {
    schedulerTasks,
    loadingSchedulerTasks,
    fetchSchedulerTasks,
    triggeringTasks,
    handleTriggerTask,
    editingTaskId,
    editingCron,
    setEditingCron,
    startEditCron,
    cancelEditCron,
    saveCronExpression,
    updatingCron,
    taskForceFullById,
    setTaskForceFullById,
    updatingStatus,
    updateTaskStatus,
  };
};

