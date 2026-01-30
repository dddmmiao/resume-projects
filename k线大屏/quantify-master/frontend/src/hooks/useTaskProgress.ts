import { useCallback, useState, useRef, useEffect } from 'react';
import authFetch from '../utils/authFetch.ts';

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'stuck' | 'error' | 'cancelled' | 'cancelling' | 'idle';

export interface TaskExecutionState {
  executionId?: string | string[];
  status?: ExecutionStatus;
  progress?: number;
  message?: string;
  result?: any;
  error?: string;
  operationDetails?: any;
  completed_at?: string;
  completedAt?: string | null;
  elapsedTime?: number;
  remainingTime?: number;
  current?: number;
  total?: number;
  startTime?: string;
  lastUpdate?: number;
}

interface UseTaskProgressOptions {
  showProgressToast?: (data: any) => void;
  onTaskComplete?: (taskId: string, data: any) => void;
}

export const useTaskProgress = (options: UseTaskProgressOptions = {}) => {
  const { showProgressToast, onTaskComplete } = options;
  const [taskExecutions, setTaskExecutions] = useState<Record<string, TaskExecutionState>>({});
  
  // 使用ref保存最新的taskExecutions，避免useCallback依赖taskExecutions导致无限循环
  const taskExecutionsRef = useRef<Record<string, TaskExecutionState>>({});
  
  // 保存每个任务的轮询timeout ID，用于取消轮询
  const pollingTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  
  // 同步ref和state
  useEffect(() => {
    taskExecutionsRef.current = taskExecutions;
  }, [taskExecutions]);
  
  // 组件卸载时清理所有轮询
  useEffect(() => {
    return () => {
      Object.values(pollingTimeoutsRef.current).forEach(timeoutId => {
        clearTimeout(timeoutId);
      });
      pollingTimeoutsRef.current = {};
    };
  }, []);

  const clearTaskExecution = useCallback((taskId: string) => {
    // 清理该任务的轮询
    if (pollingTimeoutsRef.current[taskId]) {
      clearTimeout(pollingTimeoutsRef.current[taskId]);
      delete pollingTimeoutsRef.current[taskId];
    }
    setTaskExecutions(prev => {
      const newState = { ...prev };
      delete newState[taskId];
      return newState;
    });
  }, []);
  
  const stopTaskProgressMonitoring = useCallback((taskId: string) => {
    // 停止指定任务的进度监控
    if (pollingTimeoutsRef.current[taskId]) {
      clearTimeout(pollingTimeoutsRef.current[taskId]);
      delete pollingTimeoutsRef.current[taskId];
    }
  }, []);
  
  const stopAllTaskProgressMonitoring = useCallback(() => {
    // 停止所有任务的进度监控
    Object.values(pollingTimeoutsRef.current).forEach(timeoutId => {
      clearTimeout(timeoutId);
    });
    pollingTimeoutsRef.current = {};
  }, []);

  const cancelTaskExecution = useCallback(async (taskId: string) => {
    const executionId = taskExecutions[taskId]?.executionId;
    if (!executionId) {
      clearTaskExecution(taskId);
      return;
    }

    try {
      setTaskExecutions(prev => ({
        ...prev,
        [taskId]: {
          ...prev[taskId],
          status: 'cancelling',
          message: '正在取消任务...',
          lastUpdate: Date.now(),
        },
      }));

      const res = await authFetch(`/api/tasks/${Array.isArray(executionId) ? executionId[0] : executionId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        setTaskExecutions(prev => ({
          ...prev,
          [taskId]: {
            ...prev[taskId],
            status: 'running',
            message: '取消失败，任务继续运行',
            lastUpdate: Date.now(),
          },
        }));
        return;
      }
      // 取消请求已发送，保持 cancelling 状态，让轮询继续追踪直到终态（cancelled）
      // 不立即清理状态，避免进度条闪烁消失又重现
    } catch (error) {
      setTaskExecutions(prev => ({
        ...prev,
        [taskId]: {
          ...prev[taskId],
          status: 'running',
          message: '取消请求失败，任务继续运行',
          lastUpdate: Date.now(),
        },
      }));
    }
  }, [taskExecutions, clearTaskExecution]);

  const startTaskProgressMonitoring = useCallback((taskId: string, executionId: string | string[], preserveExisting: boolean = false) => {
    // Start task progress monitoring
    setTaskExecutions(prev => {
      const existing = prev[taskId];
      const initialState: TaskExecutionState = (preserveExisting && existing)
        ? { ...existing, executionId }
        : {
            executionId,
            status: 'pending',
            progress: 0,
            message: '任务已触发，等待执行...',
            startTime: new Date().toISOString(),
          };
      const newState = { ...prev, [taskId]: initialState };
      return newState;
    });

    const startTime = Date.now();
    let lastProgress = 0;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 20;
    const maxExecutionTime = 6 * 60 * 60 * 1000; // 6小时

    const pollProgress = async () => {
      try {
        // Polling task progress

        // 使用当前任务状态中的startTime，如果没有则使用本地startTime
        const currentTask = taskExecutionsRef.current[taskId];
        const taskStartTime = currentTask?.startTime ? new Date(currentTask.startTime).getTime() : startTime;
        const elapsedTime = Date.now() - taskStartTime;
        
        if (elapsedTime > maxExecutionTime) {
          setTaskExecutions(prev => {
            const newState = {
              ...prev,
              [taskId]: {
                ...prev[taskId],
                status: 'timeout',
                message: `任务执行超时(${Math.floor(elapsedTime / 60000)}分钟)，已强制停止`,
                lastUpdate: Date.now(),
              },
            } as Record<string, TaskExecutionState>;
            return newState;
          });
          return;
        }

        const ids = Array.isArray(executionId) ? executionId : [executionId];
        const responses = await Promise.all(ids.map(id => authFetch(`/api/tasks/${id}`)));
        const validResponses = responses.filter(r => r.ok);
        if (validResponses.length === 0) throw new Error('所有任务执行记录都不存在');
        const progressDataArray = await Promise.all(validResponses.map(async r => {
          const payload = await r.json();
          return payload?.data; // 仅按 ApiResponse 解析
        }));

        const combined = progressDataArray.reduce((acc: any, cur: any) => ({
          ...acc,
          progress: Math.max(acc.progress || 0, cur.progress || 0),
          status: cur.status === 'completed' ? 'completed'
                : cur.status === 'failed' ? 'failed'
                : cur.status === 'error' ? 'error'
                : cur.status === 'cancelled' ? 'cancelled'
                : cur.status === 'cancelling' ? 'cancelling'
                : acc.status || cur.status,
          message: cur.message || acc.message,
          result: cur.result || acc.result,
          error: cur.error || acc.error,
          completed_at: cur.completed_at || acc.completed_at,
          started_at: cur.started_at || acc.started_at,
          created_at: cur.created_at || acc.created_at,
          current: cur.current || acc.current,
          total: cur.total || acc.total,
        }), {} as any);

        // 为下游 toast 提供任务标识，避免 task_id 丢失导致不触发/去重冲突
        (combined as any).task_id = taskId;
        (combined as any).execution_id = ids.join(',');

        const currentProgress = combined.progress || 0;
        if (currentProgress > lastProgress) lastProgress = currentProgress;

        // 统一使用前端时间计算运行时长，避免服务器和前端时间不同步导致的问题
        const actualElapsedTime = Date.now() - taskStartTime;

        setTaskExecutions(prev => {
          const prevTask = prev[taskId];
          const newElapsedTime = Math.floor(actualElapsedTime / 1000);
          
          // 计算预计剩余时间
          const newRemainingTime = (currentProgress > 0 && currentProgress < 100)
            ? Math.round(newElapsedTime / currentProgress * (100 - currentProgress))
            : undefined;
          
          const newState = {
            ...prev,
            [taskId]: {
              ...prevTask,
              status: combined.status,
              progress: currentProgress,
              message: combined.message,
              result: combined.result,
              error: combined.error,
              completedAt: combined.completed_at || (combined.status === 'completed' ? new Date().toISOString() : null),
              started_at: combined.started_at,
              created_at: combined.created_at,
              elapsedTime: newElapsedTime,
              remainingTime: newRemainingTime,
              current: combined.current,
              total: combined.total,
            },
          } as Record<string, TaskExecutionState>;
          return newState;
        });

        // 真正的终态：completed, failed, error, cancelled
        if (['completed', 'failed', 'error', 'cancelled'].includes(combined.status)) {
          try { showProgressToast && showProgressToast(combined); } catch {}
          try { onTaskComplete && onTaskComplete(taskId, combined); } catch {}

          setTaskExecutions(prev => {
            const newState = { ...prev } as Record<string, TaskExecutionState>;
            delete newState[taskId];
            return newState;
          });
          return;
        }

        // cancelling 是过渡态，继续以短间隔轮询直到进入终态
        if (combined.status === 'cancelling') {
          pollingTimeoutsRef.current[taskId] = setTimeout(pollProgress, 1000); // 取消中时用1秒短间隔快速轮询
          return;
        }

        if (combined.status === 'idle' && elapsedTime < 10000) {
          setTaskExecutions(prev => {
            const newState = { ...prev } as Record<string, TaskExecutionState>;
            delete newState[taskId];
            return newState;
          });
          return;
        }

        // 正常运行时3秒间隔
        pollingTimeoutsRef.current[taskId] = setTimeout(pollProgress, 3000);
      } catch (e) {
        consecutiveErrors++;
        if (consecutiveErrors >= maxConsecutiveErrors) {
          setTaskExecutions(prev => ({
            ...prev,
            [taskId]: {
              ...prev[taskId],
              status: 'error',
              message: `连续${consecutiveErrors}次获取进度失败，任务已停止`,
              lastUpdate: Date.now(),
            },
          }));
          // 清理轮询记录
          delete pollingTimeoutsRef.current[taskId];
          return;
        }
        pollingTimeoutsRef.current[taskId] = setTimeout(pollProgress, 5000); // 错误重试5秒间隔
      }
    };

    pollingTimeoutsRef.current[taskId] = setTimeout(pollProgress, 1000); // 首次轮询1秒后开始
  }, [onTaskComplete, showProgressToast]);

  const restoreRunningTasks = useCallback(async (): Promise<Record<string, TaskExecutionState>> => {
    try {
      // Restore running tasks
      const response = await authFetch('/api/admin/tasks/running');
      if (!response.ok) return {};
      
      const data = await response.json();
      if (!data.success || !data.data) return {};
      
      // Got running tasks
      
      const tasks = data.data as Record<string, any>;
      const restoredTasks: Record<string, TaskExecutionState> = {};

      // 简化后的code映射：后端现在直接返回manual_*_sync，前端直接使用
      const inferTaskIdFromCode = (code: string): string | null => {
        if (!code) return null;
        // 所有已知的任务code都直接使用，不需要转换
        return code;
      };

      Object.entries(tasks).forEach(([executionId, taskInfo]) => {
        if (taskInfo.status === 'running' || taskInfo.status === 'pending') {
          // 仅使用后端返回的 code 作为任务标识，避免使用 name 做兜底（不可控）
          const taskCode = taskInfo.code || '';
          const taskId = inferTaskIdFromCode(taskCode) || executionId;
          
          // 正常情况下一个任务只有一个execution ID（后端已改为单任务）
          if (restoredTasks[taskId]) {
            const existingIds = restoredTasks[taskId].executionId;
            const mergedIds = Array.isArray(existingIds) 
              ? [...existingIds, executionId] 
              : [existingIds as string, executionId];
            restoredTasks[taskId] = {
              ...restoredTasks[taskId],
              executionId: mergedIds,
              // 取进度最小的（最保守估计）
              progress: Math.min(restoredTasks[taskId].progress || 0, taskInfo.progress || 0),
              message: taskInfo.message || restoredTasks[taskId].message || '',
            };
          } else {
            restoredTasks[taskId] = {
              executionId: executionId,
              status: taskInfo.status,
              progress: taskInfo.progress || 0,
              message: taskInfo.message || '',
              startTime: taskInfo.start_time,
              result: taskInfo.result,
              error: taskInfo.error,
              operationDetails: taskInfo.operation_details,
            };
          }
        }
      });
      
      if (Object.keys(restoredTasks).length > 0) {
        setTaskExecutions(restoredTasks);
        
        // 恢复轮询 - 传递完整的 execution ID（可能是数组）
        Object.entries(restoredTasks).forEach(([taskId, task]) => {
          if (task.status === 'running' || task.status === 'pending') {
            // Restore task polling
            startTaskProgressMonitoring(taskId, task.executionId!, true);
          }
        });
      }

      return restoredTasks;
    } catch (error) {
      // Failed to restore running tasks
      return {};
    }
  }, [startTaskProgressMonitoring]);

  return {
    taskExecutions,
    setTaskExecutions,
    startTaskProgressMonitoring,
    stopTaskProgressMonitoring,
    stopAllTaskProgressMonitoring,
    cancelTaskExecution,
    clearTaskExecution,
    restoreRunningTasks,
  };
};

