/**
 * Toast 提取器 Hook
 * 提供基于接口 message 的 toast 处理能力
 */

import { useCallback, useRef } from 'react';
import { message } from 'antd';

// 类型定义
export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Progress {
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  message?: string;
  error?: { message?: string } | null;
  task_id: string;
  progress?: number;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  result?: any;
}

export interface ToastInfo {
  text: string;
  type: ToastType;
  dedupeKey: string;
}

// 状态迁移检测器
class StateTransitionDetector {
  private lastStates = new Map<string, string>();

  hasTransitioned(taskId: string, currentStatus: string): boolean {
    const lastStatus = this.lastStates.get(taskId);
    
    // 对于终态（completed, failed, cancelled），直接认为是状态迁移
    // 这样简化了逻辑，确保终态总是能显示 toast
    if (currentStatus === 'completed' || currentStatus === 'failed' || currentStatus === 'cancelled') {
      this.lastStates.set(taskId, currentStatus);
      return true;
    }
    
    // 对于其他状态的常规处理
    const hasChanged = lastStatus !== currentStatus;
    if (hasChanged) {
      this.lastStates.set(taskId, currentStatus);
    }
    
    return hasChanged;
  }

  clear(taskId: string): void {
    this.lastStates.delete(taskId);
  }

  clearAll(): void {
    this.lastStates.clear();
  }
}

// Toast 节流器
class ToastThrottler {
  private shownToasts = new Set<string>();
  private throttleTime = 2000;

  canShow(dedupeKey: string): boolean {
    if (this.shownToasts.has(dedupeKey)) {
      return false;
    }
    
    this.shownToasts.add(dedupeKey);
    
    setTimeout(() => {
      this.shownToasts.delete(dedupeKey);
    }, this.throttleTime);
    
    return true;
  }

  clear(dedupeKey: string): void {
    this.shownToasts.delete(dedupeKey);
  }

  clearAll(): void {
    this.shownToasts.clear();
  }
}

// 全局实例
const stateDetector = new StateTransitionDetector();
const toastThrottler = new ToastThrottler();

// 工具函数
function sanitizeText(text: string, maxLength = 120): string {
  if (!text) return '';
  
  let sanitized = text
    .replace(/[\r\n]+/g, ' ')
    .replace(/<[^>]*>/g, '')
    .trim();
  
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '...';
  }
  
  return sanitized;
}

function extractToast(progress: Progress): ToastInfo {
  const hasError = !!progress.error && progress.status !== 'completed';
  
  const type: ToastType = hasError
    ? 'error'
    : progress.status === 'completed'
      ? 'success'
      : (progress.status === 'running' || progress.status === 'queued')
        ? 'info'
        : 'warning';

  let fallback =
    type === 'success' ? '操作成功'
    : type === 'error' ? (progress.error?.message || '操作失败')
    : progress.status === 'cancelled' ? '已取消'
    : '处理中…';

  // 🚀 优化：统一使用后端返回的 message，删除前端智能派生逻辑
  // 后端现在通过 TaskMessageFormatter 统一生成完整的提示文案
  const text = (progress.message && progress.message.trim()) || fallback;

  const execId = (progress as any).execution_id || '';
  const identity = execId || progress.task_id;
  const dedupeKey = `${identity}:${progress.status}`;
  
  return { text, type, dedupeKey };
}

function processToast(progress: Progress): ToastInfo | null {
  const execId = (progress as any).execution_id || '';
  const identity = execId || progress.task_id;
  if (!stateDetector.hasTransitioned(identity, progress.status)) {
    return null;
  }
  
  const toastInfo = extractToast(progress);
  
  if (!toastThrottler.canShow(toastInfo.dedupeKey)) {
    return null;
  }
  
  toastInfo.text = sanitizeText(toastInfo.text);
  
  return toastInfo;
}

// 开关配置
const USE_SERVER_MESSAGE_TOAST = true; // 默认开启，可按需调整

/**
 * Toast 提取器 Hook
 */
export function useToastExtractor() {
  const lastProgressRef = useRef<Map<string, Progress>>(new Map());

  /**
   * 根据类型显示 toast
   */
  const showToastByType = useCallback((toastInfo: ToastInfo) => {
    const { text, type } = toastInfo;
    
    switch (type) {
      case 'success':
        message.success(text);
        break;
      case 'error':
        message.error(text);
        break;
      case 'warning':
        message.warning(text);
        break;
      case 'info':
      default:
        message.info(text);
        break;
    }
  }, []);

  /**
   * 处理进度更新并显示 toast
   * @param progress 进度响应
   * @param options 选项
   */
  const handleProgress = useCallback((
    progress: Progress,
    options: {
      showToast?: boolean;
      forceShow?: boolean;
    } = {}
  ) => {
    const { showToast = true, forceShow = false } = options;
    
    if (!USE_SERVER_MESSAGE_TOAST && !forceShow) {
      return;
    }

    // 检查是否有实际变化
    const execId = (progress as any).execution_id || '';
    const identity = execId || progress.task_id;
    const lastProgress = lastProgressRef.current.get(identity);
    if (lastProgress && 
        lastProgress.status === progress.status && 
        lastProgress.message === progress.message) {
      return;
    }

    // 更新缓存
    lastProgressRef.current.set(identity, { ...progress });

    if (!showToast) {
      return;
    }

    // 处理 toast
    const toastInfo = processToast(progress);
    if (!toastInfo) {
      return;
    }

    // 显示 toast
    showToastByType(toastInfo);
  }, [showToastByType]);

  /**
   * 清理指定任务的记录
   */
  const clearTask = useCallback((taskId: string) => {
    lastProgressRef.current.delete(taskId);
    stateDetector.clear(taskId);
    toastThrottler.clear(taskId);
  }, []);

  /**
   * 清理所有记录
   */
  const clearAll = useCallback(() => {
    lastProgressRef.current.clear();
    stateDetector.clearAll();
    toastThrottler.clearAll();
  }, []);

  /**
   * 直接提取 toast 信息（不显示）
   */
  const extractToastInfo = useCallback((progress: Progress): ToastInfo | null => {
    return extractToast(progress);
  }, []);

  return {
    handleProgress,
    clearTask,
    clearAll,
    extractToastInfo,
    showToastByType
  };
}

/**
 * 简化的 toast 处理 Hook
 * 仅用于状态迁移时的 toast 显示
 */
export function useSimpleToast() {
  const { handleProgress, clearTask, clearAll } = useToastExtractor();

  return {
    showProgressToast: handleProgress,
    clearTask,
    clearAll
  };
}
