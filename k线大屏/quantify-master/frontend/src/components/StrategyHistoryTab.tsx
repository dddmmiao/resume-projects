import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Table, Button, Space, Tag, message, Empty, Spin } from 'antd';
import { DeleteOutlined, CheckOutlined, ReloadOutlined, CloseCircleOutlined, CheckCircleOutlined, SyncOutlined, StopOutlined, MinusCircleOutlined, SwapOutlined, CloseOutlined } from '@ant-design/icons';
import authFetch from '../utils/authFetch.ts';

interface HistoryItem {
  id: number;
  strategy_name: string;
  strategy_label: string;
  entity_type: string;
  period: string;
  base_date: string | null;
  context: Record<string, any>;
  context_hash: string;
  result_codes: string[];
  result_count: number;
  status: 'running' | 'success' | 'failed' | 'cancelled';
  task_id?: string | null;
  created_at: string;
}

interface TaskProgress {
  progress: number;
  message: string;
}

interface Props {
  entityType: string;
  period: string;
  strategyName: string;
  onApplyResult?: (tsCodes: string[], baseDate: string | null) => void;
  onApplyCustomCodes?: (codes: string[], label: string) => void;
  onRebuildParams?: (context: Record<string, any>, contextHash: string) => void;
  isMobile?: boolean;
  isActive?: boolean;
  isLight?: boolean;
}

export const StrategyHistoryTab: React.FC<Props> = ({
  entityType,
  period,
  strategyName,
  onApplyResult,
  onApplyCustomCodes,
  onRebuildParams,
  isMobile = false,
  isActive = false,
  isLight = true
}) => {
  const [loading, setLoading] = useState(false);
  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  
  // 对比模式状态
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [showCompareResult, setShowCompareResult] = useState(false);
  
  // running状态记录的进度信息（从Redis获取）
  const [taskProgressMap, setTaskProgressMap] = useState<Record<string, TaskProgress>>({});
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // 获取历史列表
  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        entity_type: entityType,
        period: period,
        strategy_name: strategyName,
        page: String(page),
        page_size: String(pageSize)
      });
      
      const response = await authFetch(`/api/strategy-history?${params}`);
      const data = await response.json();
      
      if (data.success) {
        setHistoryList(data.data.items || []);
        setTotal(data.data.total || 0);
      } else {
        message.error(data.message || '获取历史失败');
      }
    } catch (error) {
      console.error('获取历史失败:', error);
      message.error('获取历史失败');
    } finally {
      setLoading(false);
    }
  }, [entityType, period, strategyName, page, pageSize]);

  // 轮询running状态任务的进度
  const pollRunningTasks = useCallback(async () => {
    const runningItems = historyList.filter(item => item.status === 'running' && item.task_id);
    if (runningItems.length === 0) return;

    const newProgressMap: Record<string, TaskProgress> = {};
    let hasCompleted = false;

    for (const item of runningItems) {
      if (!item.task_id) continue;
      try {
        const response = await authFetch(`/api/tasks/${item.task_id}`);
        const data = await response.json();
        
        if (data.success && data.data) {
          const taskData = data.data;
          const status = taskData.status || 'pending';
          const progress = taskData.progress || 0;
          const msg = taskData.message || '';
          
          newProgressMap[item.task_id] = { progress, message: msg };
          
          // 任务完成时标记需要刷新
          if (status === 'completed' || status === 'failed' || status === 'cancelled') {
            hasCompleted = true;
          }
        }
      } catch (error) {
        console.error('获取任务进度失败:', error);
      }
    }

    setTaskProgressMap(newProgressMap);
    
    // 有任务完成时刷新历史列表
    if (hasCompleted) {
      setTimeout(() => fetchHistory(), 500);
    }
  }, [historyList, fetchHistory]);

  // 当tab激活时刷新数据
  useEffect(() => {
    if (isActive) {
      fetchHistory();
    }
  }, [isActive, fetchHistory]);

  // 当有running状态的记录时，开始轮询进度
  useEffect(() => {
    const hasRunning = historyList.some(item => item.status === 'running' && item.task_id);
    
    if (hasRunning && isActive) {
      pollRunningTasks();
      pollingRef.current = setInterval(pollRunningTasks, 3000);
    }
    
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [historyList, isActive, pollRunningTasks]);

  // 取消运行中的任务
  const handleCancelTask = async (taskId: string) => {
    try {
      const response = await authFetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      const data = await response.json();
      
      if (data.success) {
        message.success('任务已取消');
        // 立即更新本地状态，将该任务标记为cancelled
        setHistoryList(prev => prev.map(item => 
          item.task_id === taskId ? { ...item, status: 'cancelled' as const } : item
        ));
        // 延迟刷新获取最新数据
        setTimeout(() => fetchHistory(), 300);
      } else {
        message.error(data.message || '取消失败');
      }
    } catch (error) {
      console.error('取消任务失败:', error);
      message.error('取消任务失败');
    }
  };

  // 删除记录（使用id）
  const handleDelete = async (id: number) => {
    try {
      const response = await authFetch(`/api/strategy-history/${id}`, { method: 'DELETE' });
      const data = await response.json();
      
      if (data.success) {
        message.success('删除成功');
        fetchHistory();
      } else {
        message.error(data.message || '删除失败');
      }
    } catch (error) {
      console.error('删除失败:', error);
      message.error('删除失败');
    }
  };

  // 应用结果 - 传递ts_codes和base_date
  const handleApplyResult = (record: HistoryItem) => {
    if (record.result_codes && record.result_codes.length > 0 && onApplyResult) {
      onApplyResult(record.result_codes, record.base_date);
      message.success(`已应用 ${record.result_codes.length} 条筛选结果`);
    } else {
      message.warning('无可应用的筛选结果');
    }
  };

  // 重建参数
  const handleRebuildParams = (record: HistoryItem) => {
    if (record.context && record.context_hash && onRebuildParams) {
      onRebuildParams(record.context, record.context_hash);
      message.info('已加载历史参数');
    }
  };

  // 切换对比模式
  const toggleCompareMode = () => {
    if (compareMode) {
      setCompareMode(false);
      setSelectedForCompare([]);
      setShowCompareResult(false);
    } else {
      setCompareMode(true);
    }
  };

  // 选择/取消选择对比项
  const handleSelectForCompare = (contextHash: string) => {
    if (selectedForCompare.includes(contextHash)) {
      setSelectedForCompare(prev => prev.filter(h => h !== contextHash));
    } else if (selectedForCompare.length < 2) {
      const newSelected = [...selectedForCompare, contextHash];
      setSelectedForCompare(newSelected);
      if (newSelected.length === 2) {
        setShowCompareResult(true);
      }
    }
  };

  // 获取对比结果
  const getCompareResult = () => {
    if (selectedForCompare.length !== 2) return null;
    
    const itemA = historyList.find(h => h.context_hash === selectedForCompare[0]);
    const itemB = historyList.find(h => h.context_hash === selectedForCompare[1]);
    
    if (!itemA || !itemB) return null;
    
    const codesA = new Set(itemA.result_codes || []);
    const codesB = new Set(itemB.result_codes || []);
    
    const onlyInA = [...codesA].filter(c => !codesB.has(c));
    const onlyInB = [...codesB].filter(c => !codesA.has(c));
    const inBoth = [...codesA].filter(c => codesB.has(c));
    
    return {
      itemA,
      itemB,
      onlyInA,
      onlyInB,
      inBoth,
    };
  };

  const compareResult = showCompareResult ? getCompareResult() : null;

  // 渲染状态标签（成功状态可点击应用结果）
  const renderStatus = (status: string, record: HistoryItem) => {
    if (status === 'running' && record.task_id) {
      const progress = taskProgressMap[record.task_id]?.progress || 0;
      return (
        <Tag icon={<SyncOutlined spin />} color="processing" style={{ margin: 0 }}>
          {progress}%
        </Tag>
      );
    }
    
    switch (status) {
      case 'success':
        if (record.result_count === 0) {
          return <Tag icon={<MinusCircleOutlined />} color="default">无结果</Tag>;
        }
        return (
          <Tag 
            icon={<CheckCircleOutlined />} 
            color="success" 
            style={{ cursor: 'pointer' }}
            onClick={() => {
              if (record.result_codes?.length > 0 && onApplyCustomCodes) {
                onApplyCustomCodes(record.result_codes, `筛选结果(${record.result_count})`);
              }
            }}
          >
            成功 {record.result_count}
          </Tag>
        );
      case 'failed':
        return <Tag icon={<CloseCircleOutlined />} color="error">失败</Tag>;
      case 'cancelled':
        return <Tag color="default">已取消</Tag>;
      default:
        return <Tag>{status}</Tag>;
    }
  };

  // 渲染操作列
  const renderAction = (_: any, record: HistoryItem) => {
    // 对比模式：显示选择按钮
    if (compareMode) {
      const hasResult = record.status === 'success' && record.result_codes?.length > 0;
      const isSelected = selectedForCompare.includes(record.context_hash);
      const canSelect = hasResult && (isSelected || selectedForCompare.length < 2);
      
      return (
        <Button
          type={isSelected ? 'primary' : 'default'}
          size="small"
          disabled={!canSelect}
          onClick={() => handleSelectForCompare(record.context_hash)}
        >
          {isSelected ? `已选${selectedForCompare.indexOf(record.context_hash) + 1}` : '选择'}
        </Button>
      );
    }
    
    if (record.status === 'running' && record.task_id) {
      return (
        <Button type="link" danger size="small" icon={<StopOutlined />} onClick={() => handleCancelTask(record.task_id!)}>
          取消
        </Button>
      );
    }
    
    const hasResult = record.status === 'success' && record.result_codes?.length > 0;
    
    return (
      <Space size={0}>
        <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => handleApplyResult(record)} disabled={!hasResult}>
          应用
        </Button>
        <Button type="link" size="small" icon={<ReloadOutlined />} onClick={() => handleRebuildParams(record)}>
          重建
        </Button>
        <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} />
      </Space>
    );
  };

  const columns = [
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 90,
      fixed: isMobile ? undefined : 'left' as const,
      render: (text: string) => text?.substring(5, 16) || '-'
    },
    {
      title: '基准日',
      dataIndex: 'base_date',
      key: 'base_date',
      width: 80,
      render: (text: string | null) => text || '最新'
    },
    {
      title: '结果',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: renderStatus
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: isMobile ? undefined : 'right' as const,
      render: renderAction
    }
  ];

  // 有成功结果的记录数量
  const successCount = historyList.filter(h => h.status === 'success' && h.result_codes?.length > 0).length;

  return (
    <div>
      <style>{`
        .running-task-row td {
          background: rgba(24, 144, 255, 0.08) !important;
        }
        .running-task-row {
          border-left: 3px solid #1890ff;
        }
        .compare-selected-row td {
          background: rgba(82, 196, 26, 0.1) !important;
        }
      `}</style>
      
      {/* 对比模式工具栏 */}
      {historyList.length > 0 && successCount >= 2 && (
        <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button
            size="small"
            type={compareMode ? 'primary' : 'default'}
            icon={compareMode ? <CloseOutlined /> : <SwapOutlined />}
            onClick={toggleCompareMode}
          >
            {compareMode ? '退出对比' : '对比结果'}
          </Button>
          {compareMode && (
            <span style={{ fontSize: 12, color: '#999' }}>
              {selectedForCompare.length === 0 ? '请选择2条记录' : 
               selectedForCompare.length === 1 ? '已选1条，再选1条' : '已选2条'}
            </span>
          )}
        </div>
      )}

      {/* 对比结果展示 */}
      {compareResult && (
        <div style={{ 
          marginBottom: 8, 
          padding: isMobile ? 10 : 12, 
          border: `1px solid ${isLight ? '#d9d9d9' : '#434343'}`, 
          borderRadius: 6,
          background: isLight ? '#fafafa' : 'rgba(255,255,255,0.04)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong>对比结果</strong>
            <Button 
              type="text" 
              size="small" 
              icon={<CloseOutlined />} 
              onClick={() => {
                setShowCompareResult(false);
                setSelectedForCompare([]);
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 13, alignItems: 'center' }}>
            <span style={{ color: '#666', fontSize: 12 }}>点击应用：</span>
            <Tag 
              color="purple" 
              style={{ cursor: compareResult.inBoth.length > 0 ? 'pointer' : 'not-allowed' }}
              onClick={() => {
                if (compareResult.inBoth.length > 0 && onApplyCustomCodes) {
                  onApplyCustomCodes(compareResult.inBoth, `共有(${compareResult.inBoth.length})`);
                }
              }}
            >
              共有 {compareResult.inBoth.length}
            </Tag>
            <Tag 
              color="blue"
              style={{ cursor: compareResult.onlyInA.length > 0 ? 'pointer' : 'not-allowed' }}
              onClick={() => {
                if (compareResult.onlyInA.length > 0 && onApplyCustomCodes) {
                  onApplyCustomCodes(compareResult.onlyInA, `仅1有(${compareResult.onlyInA.length})`);
                }
              }}
            >
              仅1有 {compareResult.onlyInA.length}
            </Tag>
            <Tag 
              color="green"
              style={{ cursor: compareResult.onlyInB.length > 0 ? 'pointer' : 'not-allowed' }}
              onClick={() => {
                if (compareResult.onlyInB.length > 0 && onApplyCustomCodes) {
                  onApplyCustomCodes(compareResult.onlyInB, `仅2有(${compareResult.onlyInB.length})`);
                }
              }}
            >
              仅2有 {compareResult.onlyInB.length}
            </Tag>
          </div>
        </div>
      )}

      {loading && historyList.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : historyList.length === 0 ? (
        <Empty description="暂无执行历史" />
      ) : (
        <Table
          dataSource={historyList}
          columns={columns}
          rowKey={(record) => `${record.context_hash}_${record.created_at}`}
          size="small"
          scroll={{ x: 550 }}
          rowClassName={(record) => {
            if (record.status === 'running') return 'running-task-row';
            if (compareMode && selectedForCompare.includes(record.context_hash)) return 'compare-selected-row';
            return '';
          }}
          pagination={{
            current: page,
            pageSize: pageSize,
            total: total,
            showSizeChanger: false,
            size: 'small',
            showTotal: (t) => `共${t}条`,
            onChange: (p) => setPage(p)
          }}
        />
      )}
    </div>
  );
};

export default StrategyHistoryTab;
