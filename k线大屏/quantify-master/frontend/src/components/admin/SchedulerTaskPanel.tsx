import React, { memo } from 'react';
import { Card, Button, Spin, Tag, Progress, Input, Checkbox, Switch } from 'antd';

type TaskStatus = 'running' | 'paused' | 'stopped';
type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'stuck' | 'error' | 'cancelled' | 'cancelling' | 'idle';

interface SchedulerTask {
  id: string;
  name: string;
  status: TaskStatus;
  cron_expression?: string;
  cron_description?: string;
  next_run_time?: string | null;
  last_run_time?: string | null;
}

interface TaskExecutionState {
  executionId?: string | string[];
  status?: ExecutionStatus;
  progress?: number;
  message?: string;
  result?: unknown;
  error?: string;
  completed_at?: string;
  completedAt?: string | null;
  elapsedTime?: number;
  remainingTime?: number;
  current?: number;
  total?: number;
}

interface SchedulerTaskPanelProps {
  schedulerTasks: SchedulerTask[];
  loadingSchedulerTasks: boolean;
  taskExecutions: Record<string, TaskExecutionState>;
  triggeringTasks: Record<string, boolean>;
  handleTriggerTask: (taskId: string, event?: React.MouseEvent, forceFull?: boolean) => Promise<void> | void;
  taskPanelRef: React.RefObject<HTMLDivElement>;
  editingTaskId: string | null;
  editingCron: string;
  setEditingCron: (v: string) => void;
  startEditCron: (taskId: string, currentCron: string) => void;
  cancelEditCron: () => void;
  saveCronExpression: (taskId: string) => Promise<void> | void;
  clearTaskExecution: (taskId: string) => void;
  cancelTaskExecution: (taskId: string) => Promise<void> | void;
  updatingCron: boolean;
  taskForceFullById: Record<string, boolean>;
  setTaskForceFullById: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  updatingStatus: Record<string, boolean>;
  onUpdateTaskStatus: (taskId: string, status: TaskStatus) => Promise<void> | void;
  readOnly?: boolean;
}

const SchedulerTaskPanel: React.FC<SchedulerTaskPanelProps> = memo(({
  schedulerTasks,
  loadingSchedulerTasks,
  taskExecutions,
  triggeringTasks,
  handleTriggerTask,
  taskPanelRef,
  editingTaskId,
  editingCron,
  setEditingCron,
  startEditCron,
  cancelEditCron,
  saveCronExpression,
  clearTaskExecution,
  cancelTaskExecution,
  updatingCron,
  taskForceFullById,
  setTaskForceFullById,
  updatingStatus,
  onUpdateTaskStatus,
  readOnly = false,
}) => {
  return (
    <Card size="small" title="定时任务管理" style={{ marginTop: '16px' }}>
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>
            系统定时任务状态，每个任务显示下次执行时间和执行周期：
          </p>
        </div>
      </div>
      {loadingSchedulerTasks ? (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <Spin size="large" />
          <p style={{ marginTop: '16px' }}>加载定时任务中...</p>
        </div>
      ) : schedulerTasks.length > 0 ? (
        <div ref={taskPanelRef}>
          {schedulerTasks.map((task) => {
            const execution = taskExecutions[task.id];
            const isTriggering = triggeringTasks[task.id];
            const isUpdatingStatus = !!updatingStatus[task.id];
            return (
              <Card key={task.id} size="small" style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <strong style={{ fontSize: '14px' }}>{task.name}</strong>
                      <Tag color={task.status === 'running' ? 'green' : task.status === 'paused' ? 'orange' : 'red'}>
                        {task.status === 'running' ? '运行中' : task.status === 'paused' ? '已暂停' : '已停止'}
                      </Tag>
                      {execution && (
                        <Tag color={
                          execution.status === 'completed' ? 'green' :
                            execution.status === 'failed' ? 'red' :
                              execution.status === 'running' ? 'blue' :
                                execution.status === 'timeout' ? 'volcano' :
                                  execution.status === 'stuck' ? 'magenta' : 'orange'
                        }>
                          {execution.status === 'completed' ? '执行完成' :
                            execution.status === 'failed' ? '执行失败' :
                              execution.status === 'running' ? '执行中' :
                                execution.status === 'timeout' ? '执行超时' :
                                  execution.status === 'stuck' ? '疑似卡住' : '等待执行'}
                        </Tag>
                      )}
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
                        <Switch
                          size="small"
                          checked={task.status === 'running'}
                          loading={isUpdatingStatus}
                          disabled={readOnly}
                          onChange={(checked) => {
                            const nextStatus: TaskStatus = checked ? 'running' : 'paused';
                            onUpdateTaskStatus(task.id, nextStatus);
                          }}
                        />
                      </div>
                    </div>
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                      <strong>执行周期:</strong>
                      {task.cron_description && (
                        <span style={{ color: '#999', marginLeft: '8px' }}>
                          {task.cron_description || '未设置执行周期'}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                      {editingTaskId === task.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                          <Input
                            size="small"
                            value={editingCron}
                            onChange={(e) => setEditingCron(e.target.value)}
                            placeholder="0 2 * * *"
                            style={{ fontSize: '11px', width: '140px' }}
                          />
                          <Button
                            size="small"
                            type="primary"
                            onClick={() => saveCronExpression(task.id)}
                            loading={updatingCron}
                            style={{ fontSize: '10px', padding: '0 8px', height: '24px' }}
                          >
                            保存
                          </Button>
                          <Button
                            size="small"
                            onClick={cancelEditCron}
                            style={{ fontSize: '10px', padding: '0 8px', height: '24px' }}
                          >
                            取消
                          </Button>
                        </div>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <span>{task.cron_expression}</span>
                          {!readOnly && (
                            <Button
                              size="small"
                              type="text"
                              onClick={() => startEditCron(task.id, task.cron_expression || '')}
                              style={{ fontSize: '10px', padding: '0 4px', height: '20px', color: '#1890ff' }}
                            >
                              修改
                            </Button>
                          )}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                      <strong>下次执行:</strong> {
                        task.next_run_time
                          ? new Date(task.next_run_time).toLocaleString('zh-CN')
                          : '未安排'
                      }
                    </div>
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: execution ? '8px' : '0' }}>
                      <strong>上次执行:</strong> {
                        task.last_run_time ? (
                          <span>
                            {new Date(task.last_run_time).toLocaleString('zh-CN')}
                          </span>
                        ) : (
                          '暂无执行记录'
                        )
                      }
                    </div>

                    {execution && (
                      <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '6px', border: '1px solid #e9ecef' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#495057' }}>
                            任务执行进度
                          </span>
                          <Button
                            size="small"
                            type="text"
                            onClick={() => cancelTaskExecution(task.id)}
                            style={{ fontSize: '10px', padding: '0 4px', height: '20px' }}
                          >
                            ✕
                          </Button>
                        </div>

                        <Progress
                          percent={execution.progress}
                          status={
                            execution.status === 'failed' ? 'exception' :
                              execution.status === 'completed' ? 'success' :
                                execution.status === 'cancelling' ? 'active' : 'active'
                          }
                          strokeColor={
                            execution.status === 'completed' ? '#52c41a' :
                              execution.status === 'failed' ? '#ff4d4f' :
                                execution.status === 'cancelling' ? '#faad14' :
                                  { '0%': '#108ee9', '100%': '#87d068' }
                          }
                          format={(percent) => `${percent}%`}
                          size="small"
                        />

                        <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                          {execution.message}
                          {execution.elapsedTime && (
                            <div style={{ marginTop: '2px', fontSize: '10px', color: '#999' }}>
                              运行时长: {execution.elapsedTime}秒
                              {execution.remainingTime && execution.remainingTime > 0 && (
                                <span style={{ marginLeft: '8px' }}>
                                  预计剩余: {execution.remainingTime}秒
                                </span>
                              )}
                            </div>
                          )}
                          {task.id === 'concept_sync' && execution.current && execution.total && (
                            <div style={{ marginTop: '2px', fontSize: '10px', color: '#999' }}>
                              进度: {execution.current}/{execution.total} 个概念
                            </div>
                          )}
                          {execution.status === 'completed' && execution.result != null && (
                            <div style={{ marginTop: '4px', fontSize: '10px', color: '#52c41a' }}>
                              {(execution.result as any)?.message || '执行完成'}
                            </div>
                          )}
                        </div>

                        {typeof execution.result !== 'undefined' && (
                          <div style={{ fontSize: '11px', color: '#52c41a', marginTop: '4px', padding: '4px 8px', backgroundColor: '#f6ffed', borderRadius: '4px', border: '1px solid #b7eb8f' }}>
                            <strong>执行结果:</strong> {JSON.stringify(execution.result as any)}
                          </div>
                        )}

                        {typeof execution.error === 'string' && execution.error && (
                          <div style={{ fontSize: '11px', color: '#ff4d4f', marginTop: '4px', padding: '4px 8px', backgroundColor: '#fff2f0', borderRadius: '4px', border: '1px solid #ffccc7' }}>
                            <strong>错误信息:</strong> {execution.error}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {['sync_all_stock_kline_data', 'sync_all_bond_kline_data', 'sync_all_concept_kline_data', 'sync_all_industry_kline_data', 'sync_stock_auction_data'].includes(task.id) && (
                      <Checkbox
                        checked={!!taskForceFullById[task.id]}
                        onChange={(e) => setTaskForceFullById((prev: any) => ({ ...prev, [task.id]: e.target.checked }))}
                      >
                        全量
                      </Checkbox>
                    )}
                    <Button
                      type="primary"
                      size="small"
                      htmlType="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleTriggerTask(task.id, e, !!taskForceFullById[task.id]);
                      }}
                      disabled={readOnly || task.status !== 'running' || isTriggering || (execution && (execution.status === 'running' || execution.status === 'pending'))}
                      loading={isTriggering}
                    >
                      {readOnly ? '无权' : (isTriggering ? '触发中...' : execution && execution.status === 'running' ? '执行中' : '触发')}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>暂无定时任务</div>
      )}
    </Card>
  );
});

export default SchedulerTaskPanel;
