import { SystemStatus, StatisticsCount } from '../hooks/useSystemMonitor';

export interface MonitorPanelProps {
  statisticsCount: StatisticsCount;
  systemStatus: SystemStatus;
  currentDataSource?: string;
}

export interface DataSourcePanelProps {
  dataSourceInfo: any;
  dataSourceStatus: any;
  onSwitchDataSource: (sourceType: string) => void;
  switching: boolean;
  onRefresh: () => void;
  loading: boolean;
}

export interface SyncPanelProps {
  syncType: 'stock' | 'convertible_bond';
  selectedItems: string[];
  selectedPeriods: string[];
  syncDays: number;
  onSync: () => void;
  syncing: boolean;
  syncStatus: Record<string, {
    status: 'running' | 'completed' | 'error' | 'idle';
    progress?: number;
    message?: string;
    last_sync?: string;
    next_sync?: string;
  }>;
  syncConfig: SyncConfig;
  onSyncConfigChange: (config: Partial<SyncConfig>) => void;
  onStartSync: (syncType: string, options?: {
    start_date?: string;
    end_date?: string;
    force_full?: boolean;
  }) => void;
  onStopSync: (syncType: string) => void;
}

export interface TaskPanelProps {
  tasks: any[];
  onTriggerTask: (taskId: string) => void;
  triggeringTasks: Record<string, boolean>;
  taskProgress: TaskProgress;
  onTaskAction: (taskId: string, action: 'start' | 'stop' | 'restart') => void;
}

export interface ApiPanelProps {
  apiStatus: any;
  onTestApi: () => void;
  testing: boolean;
  apiLimits: Record<string, {
    current: number;
    limit: number;
    reset_time?: string;
  }>;
  onRefreshLimits: () => Promise<void>;
}

export interface TaskProgress {
  [taskId: string]: {
    status: 'running' | 'completed' | 'failed' | 'pending';
    progress: number;
    message?: string;
    result?: any;
    error?: string;
  };
}

export interface TaskConfig {
  cron_expression: string;
  is_enabled: boolean;
}

export interface SyncStatus {
  admin_mode: boolean;
  sync_running: boolean;
  current_sync_type?: string;
  sync_progress?: number;
  sync_message?: string;
}

export interface SyncConfig {
  sync_type: 'stock' | 'convertible_bond';
  selected_items: string[];
  selected_periods: string[];
  sync_days: number;
  selected_item_names: Record<string, string>;
}