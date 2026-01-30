import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, Switch, Input, Select, Button, Space, Popconfirm, message, InputNumber, Table, Modal, Tabs, Tag, Pagination, DatePicker } from 'antd';
import { RocketOutlined, PlusOutlined, DeleteOutlined, EditOutlined, HistoryOutlined, SettingOutlined, UnorderedListOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import authFetch from '../../utils/authFetch.ts';
import { useStrategiesMeta } from '../../strategies/useStrategiesMeta.ts';
import { getSortOptions, type DataType, type Period, type SortOption } from '../../shared/constants.ts';
import dayjs from 'dayjs';

interface PushHistoryItem {
  id: number;
  strategy_name: string;
  strategy_label: string;
  entity_type: string;
  period: string;
  base_date: string;
  result_count: number;
  result_codes: string[];
  status: string;
  created_at: string;
  context_json: string;
  context: Record<string, any>;
}

interface StrategyPushItem {
  enabled: boolean;  // 是否启用该配置
  strategy_name: string;
  ths_group_name: string;
  entity_type: string;
  period: string;
  sort_by?: string;  // 推送排序字段
  sort_order?: string;  // 排序方向: asc | desc
  params_json: Record<string, any>;
}

interface StrategyPushConfigData {
  enabled: boolean;
  max_total_configs: number;
  base_date: string; // 基准日期，空字符串表示使用最新交易日
  use_dynamic_hot_filter: boolean; // 使用动态热门筛选（推送所有有热度数据的概念/行业）
  configs: StrategyPushItem[];
}

// 默认params_json模板（仅策略业务参数）
const DEFAULT_PARAMS_JSON = {
  enable_data_filter: false
};

interface StrategyPushConfigProps {
  readOnly?: boolean;
}

const StrategyPushConfig: React.FC<StrategyPushConfigProps> = ({ readOnly = false }) => {
  const { strategies } = useStrategiesMeta();
  const [config, setConfig] = useState<StrategyPushConfigData>({
    enabled: false,
    max_total_configs: 10,
    base_date: '',
    use_dynamic_hot_filter: false,
    configs: []
  });
  const [loading, setLoading] = useState(true);
  const [jsonErrors, setJsonErrors] = useState<Record<number, string>>({});
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingJson, setEditingJson] = useState<string>('');
  const saveTimerRef = useRef<number | null>(null);

  // 推送历史
  const [history, setHistory] = useState<PushHistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);

  // 将策略列表转换为Select选项
  const strategyOptions = strategies.map(s => ({ value: s.key, label: s.label }));

  // 加载配置
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await authFetch('/api/admin/system/config');
        const respData = await response.json();
        if (respData.success && respData.data?.strategy_push_config) {
          setConfig(respData.data.strategy_push_config);
        }
      } catch (error) {
        console.error('加载策略推送配置失败:', error);
      } finally {
        setLoading(false);
      }
    };
    loadConfig();
  }, []);

  // 保存配置
  const scheduleSaveConfig = (newConfig: StrategyPushConfigData) => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        const resp = await authFetch('/api/admin/system/config', {
          method: 'POST',
          body: JSON.stringify({ strategy_push_config: newConfig })
        });
        const data = await resp.json();
        if (data?.success) {
          message.success({ content: '策略推送配置已保存', key: 'strategy-push-save', duration: 1 });
        } else {
          message.error({ content: data?.message || '保存失败', key: 'strategy-push-save', duration: 2 });
        }
      } catch (error: any) {
        message.error({ content: '保存失败', key: 'strategy-push-save', duration: 2 });
      }
    }, 800);
  };

  const updateConfig = (updates: Partial<StrategyPushConfigData>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    scheduleSaveConfig(newConfig);
  };

  // 添加配置项
  const addConfigItem = () => {
    if (config.configs.length >= config.max_total_configs) {
      message.warning(`最多只能添加 ${config.max_total_configs} 个配置`);
      return;
    }
    const defaultStrategy = strategyOptions.length > 0 ? strategyOptions[0].value : '';
    const newConfigs = [...config.configs, {
      enabled: true,  // 默认启用
      strategy_name: defaultStrategy,
      ths_group_name: '策略推送',
      entity_type: 'stock',
      period: 'daily',
      sort_by: 'auction_vol',  // 股票默认竞价量
      sort_order: 'asc',
      params_json: { ...DEFAULT_PARAMS_JSON }
    }];
    updateConfig({ configs: newConfigs });
  };

  // 删除配置项
  const removeConfigItem = (index: number) => {
    const newConfigs = config.configs.filter((_, i) => i !== index);
    const newErrors = { ...jsonErrors };
    delete newErrors[index];
    setJsonErrors(newErrors);
    updateConfig({ configs: newConfigs });
  };

  // 更新配置项
  const updateConfigItem = (index: number, key: keyof StrategyPushItem, value: any) => {
    const newConfigs = [...config.configs];
    newConfigs[index] = { ...newConfigs[index], [key]: value };
    updateConfig({ configs: newConfigs });
  };

  // 加载推送历史
  const loadHistory = async (page: number = 1) => {
    setHistoryLoading(true);
    try {
      const resp = await authFetch(`/api/admin/strategy-push/history?page=${page}&page_size=5`);
      const data = await resp.json();
      if (data.success && data.data) {
        setHistory(data.data.items || []);
        setHistoryTotal(data.data.total || 0);
        setHistoryPage(page);
      }
    } catch (error) {
      console.error('加载推送历史失败:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  // 初始加载历史
  useEffect(() => {
    loadHistory();
  }, []);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  if (loading) {
    return null;
  }

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <RocketOutlined />
          <span>策略推送</span>
        </div>
      }
      style={{ marginBottom: '24px' }}
      styles={{ body: { padding: 0 } }}
    >
      <Tabs
        size="small"
        style={{ padding: '0 16px' }}
        onChange={(key) => { if (key === 'history') loadHistory(1); }}
        items={[
          {
            key: 'settings',
            label: <Space size={4}><SettingOutlined />基础设置</Space>,
            children: (
              <div style={{ padding: '0 0 12px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#262626' }}>
                      启用策略推送
                    </div>
                    <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                      开启后，定时任务会执行配置的策略并推送结果到同花顺分组
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto' }}>
                    <Switch
                      checked={config.enabled}
                      disabled={readOnly}
                      onChange={(checked) => updateConfig({ enabled: checked })}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 4 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#262626' }}>
                      最大配置数量
                    </div>
                    <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                      可添加的策略推送配置数量上限
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto' }}>
                    <InputNumber
                      min={1}
                      max={20}
                      value={config.max_total_configs}
                      disabled={readOnly}
                      onChange={(v) => updateConfig({ max_total_configs: v || 10 })}
                      style={{ width: 100 }}
                      addonAfter="个"
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 4 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#262626' }}>
                      基准日期
                    </div>
                    <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                      策略计算的基准日期，留空则使用最新交易日
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto' }}>
                    {React.createElement(DatePicker as any, {
                      allowClear: !readOnly,
                      placeholder: '最新交易日',
                      value: config.base_date ? dayjs(config.base_date) : null,
                      disabled: readOnly,
                      onChange: (date: any) => updateConfig({ base_date: date ? date.format('YYYYMMDD') : '' }),
                      style: { width: 140 }
                    })}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 4 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#262626' }}>
                      动态热门筛选
                    </div>
                    <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                      执行时动态获取最新热门概念/行业，替代配置中的静态列表
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Switch
                      checked={config.use_dynamic_hot_filter}
                      disabled={readOnly}
                      onChange={(checked) => updateConfig({ use_dynamic_hot_filter: checked })}
                    />
                  </div>
                </div>
              </div>
            )
          },
          {
            key: 'configs',
            label: <Space size={4}><UnorderedListOutlined />推送配置</Space>,
            children: (
              <div style={{ padding: '8px 0 16px' }}>
                <Table
                  size="small"
                  pagination={false}
                  tableLayout="fixed"
                  dataSource={config.configs.map((item, index) => ({ ...item, key: index }))}
                  columns={[
                    {
                      title: '策略',
                      dataIndex: 'strategy_name',
                      width: 150,
                      render: (value: string, _: any, index: number) => (
                        <Select
                          style={{ width: '100%' }}
                          size="small"
                          value={value}
                          disabled={readOnly}
                          onChange={(v) => updateConfigItem(index, 'strategy_name', v)}
                          options={strategyOptions}
                        />
                      )
                    },
                    {
                      title: '同花顺分组',
                      dataIndex: 'ths_group_name',
                      width: 100,
                      render: (value: string, _: any, index: number) => (
                        <Input
                          size="small"
                          value={value}
                          disabled={readOnly}
                          onChange={(e) => updateConfigItem(index, 'ths_group_name', e.target.value)}
                        />
                      )
                    },
                    {
                      title: '类型',
                      dataIndex: 'entity_type',
                      width: 90,
                      render: (value: string, record: any, index: number) => {
                        // 根据选中策略获取支持的类型
                        const strategyMeta = strategies.find(s => s.key === record.strategy_name);
                        const supportedTypes = strategyMeta?.supportedDataTypes || ['stock'];
                        const typeOptions = [
                          { value: 'stock', label: '股票' },
                          { value: 'bond', label: '可转债' },
                          { value: 'concept', label: '概念' },
                          { value: 'industry', label: '行业' }
                        ].filter(opt => supportedTypes.includes(opt.value as any));
                        return (
                          <Select
                            size="small"
                            style={{ width: '100%' }}
                            value={typeOptions.some(o => o.value === value) ? value : (typeOptions[0]?.value || 'stock')}
                            disabled={readOnly}
                            onChange={(v) => updateConfigItem(index, 'entity_type', v)}
                            options={typeOptions}
                          />
                        );
                      }
                    },
                    {
                      title: '周期',
                      dataIndex: 'period',
                      width: 80,
                      render: (value: string, _: any, index: number) => (
                        <Select
                          size="small"
                          style={{ width: '100%' }}
                          value={value || 'daily'}
                          disabled={readOnly}
                          onChange={(v) => updateConfigItem(index, 'period', v)}
                          options={[
                            { value: 'daily', label: '日线' },
                            { value: 'weekly', label: '周线' },
                            { value: 'monthly', label: '月线' }
                          ]}
                        />
                      )
                    },
                    {
                      title: '排序字段',
                      dataIndex: 'sort_by',
                      width: 120,
                      render: (value: string | undefined, record: any, index: number) => {
                        // 根据实体类型和周期复用大屏页面的排序选项
                        const entityType = record.entity_type || 'stock';
                        const period = (record.period || 'daily') as Period;
                        // 将 bond 映射为 convertible_bond
                        const mappedType: DataType = entityType === 'bond' ? 'convertible_bond' : entityType;
                        const rawOptions = getSortOptions(mappedType, period);

                        // 展平二级菜单（如竞价字段）并转换为 Select 需要的格式
                        const flattenOptions = (opts: SortOption[]): { value: string; label: string }[] => {
                          const result: { value: string; label: string }[] = [];
                          opts.forEach(opt => {
                            if (opt.children && opt.children.length > 0) {
                              // 二级菜单展平（保持简洁标签）
                              opt.children.forEach(child => {
                                result.push({ value: child.key, label: child.label });
                              });
                            } else {
                              result.push({ value: opt.key, label: opt.label });
                            }
                          });
                          return result;
                        };

                        const sortOptions = flattenOptions(rawOptions);

                        // 根据实体类型设置默认值：股票=竞价量，可转债=成交量
                        const defaultSort = entityType === 'stock' ? 'auction_vol' : 'vol';

                        return (
                          <Select
                            size="small"
                            style={{ width: '100%' }}
                            value={value || defaultSort}
                            disabled={readOnly}
                            onChange={(v) => updateConfigItem(index, 'sort_by', v)}
                            options={sortOptions}
                          />
                        );
                      }
                    },
                    {
                      title: '排序方向',
                      dataIndex: 'sort_order',
                      width: 70,
                      render: (value: string | undefined, _: any, index: number) => (
                        <Select
                          size="small"
                          style={{ width: '100%' }}
                          value={value || 'asc'}
                          disabled={readOnly}
                          onChange={(v) => updateConfigItem(index, 'sort_order', v)}
                          options={[
                            { value: 'asc', label: '升序' },
                            { value: 'desc', label: '降序' }
                          ]}
                        />
                      )
                    },
                    {
                      title: '策略参数',
                      dataIndex: 'params_json',
                      width: 150,
                      ellipsis: true,
                      render: (value: Record<string, any>, _: any, index: number) => (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                          <div style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 11,
                            color: '#8c8c8c',
                            fontFamily: 'monospace',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {JSON.stringify(value || {})}
                          </div>
                          <Button
                            type="text"
                            size="small"
                            icon={<EditOutlined />}
                            style={{ flexShrink: 0 }}
                            disabled={readOnly}
                            onClick={() => {
                              setEditingIndex(index);
                              setEditingJson(JSON.stringify(value || {}, null, 2));
                            }}
                          />
                        </div>
                      )
                    },
                    {
                      title: '操作',
                      width: 80,
                      render: (_: any, record: any, index: number) => (
                        <Space size={4}>
                          <Switch
                            size="small"
                            checked={record.enabled !== false}
                            disabled={readOnly}
                            onChange={(v) => updateConfigItem(index, 'enabled', v)}
                          />
                          <Popconfirm
                            title="删除？"
                            onConfirm={() => removeConfigItem(index)}
                            okText="是"
                            cancelText="否"
                            disabled={readOnly}
                          >
                            <Button type="text" danger size="small" icon={<DeleteOutlined />} disabled={readOnly} />
                          </Popconfirm>
                        </Space>
                      )
                    }
                  ] as ColumnsType<any>}
                />
                <Button
                  type="dashed"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={addConfigItem}
                  disabled={readOnly || config.configs.length >= config.max_total_configs}
                  style={{ width: '100%', marginTop: 8 }}
                >
                  {readOnly ? '无权添加' : `添加配置 (${config.configs.length}/${config.max_total_configs})`}
                </Button>
              </div>
            )
          },
          {
            key: 'history',
            label: <Space size={4}><HistoryOutlined />执行历史</Space>,
            children: (
              <div style={{ padding: '8px 0 16px' }}>
                <Table
                  size="small"
                  pagination={false}
                  loading={historyLoading}
                  dataSource={history.map((h, i) => ({ ...h, key: i }))}
                  columns={[
                    {
                      title: '时间',
                      dataIndex: 'created_at',
                      width: 90,
                      render: (v: string) => v?.substring(5, 16) || '-'
                    },
                    { title: '策略', dataIndex: 'strategy_label', width: 100, ellipsis: true },
                    {
                      title: '分组',
                      dataIndex: ['context', 'ths_group_name'],
                      width: 80,
                      ellipsis: true,
                      render: (v: string) => v || '-'
                    },
                    {
                      title: '类型',
                      dataIndex: 'entity_type',
                      width: 60,
                      render: (v: string) => {
                        const typeMap: Record<string, string> = { stock: '股票', bond: '可转债', concept: '概念', industry: '行业' };
                        return typeMap[v] || v;
                      }
                    },
                    {
                      title: '周期',
                      dataIndex: 'period',
                      width: 50,
                      render: (v: string) => {
                        const periodMap: Record<string, string> = { daily: '日', weekly: '周', monthly: '月' };
                        return periodMap[v] || v || '日';
                      }
                    },
                    {
                      title: '基准日',
                      dataIndex: 'base_date',
                      width: 70,
                      render: (v: string | null) => v || '最新'
                    },
                    {
                      title: '结果',
                      dataIndex: 'status',
                      width: 75,
                      render: (status: string, record: PushHistoryItem) => {
                        if (status === 'success') {
                          if (record.result_count === 0) {
                            return <Tag color="default" style={{ margin: 0 }}>无结果</Tag>;
                          }
                          return (
                            <Tag
                              color="success"
                              style={{ margin: 0, cursor: 'pointer' }}
                              onClick={() => {
                                if (record.result_codes?.length > 0) {
                                  // 使用JSON格式携带类型信息和基准日期
                                  const clipData = JSON.stringify({
                                    type: record.entity_type === 'bond' ? 'convertible_bond' : record.entity_type,
                                    codes: record.result_codes,
                                    label: record.strategy_label,
                                    base_date: record.base_date
                                  });
                                  // 兼容非HTTPS环境的剪贴板操作
                                  if (navigator.clipboard?.writeText) {
                                    navigator.clipboard.writeText(clipData);
                                    message.success(`已复制 ${record.result_count} 个代码，在大屏页面按 Ctrl+V 应用筛选`);
                                  } else {
                                    // 备用方案：使用临时textarea
                                    const textarea = document.createElement('textarea');
                                    textarea.value = clipData;
                                    textarea.style.position = 'fixed';
                                    textarea.style.opacity = '0';
                                    document.body.appendChild(textarea);
                                    textarea.select();
                                    try {
                                      document.execCommand('copy');
                                      message.success(`已复制 ${record.result_count} 个代码，在大屏页面按 Ctrl+V 应用筛选`);
                                    } catch {
                                      message.error('复制失败，请手动复制');
                                    }
                                    document.body.removeChild(textarea);
                                  }
                                }
                              }}
                            >
                              成功 {record.result_count}
                            </Tag>
                          );
                        }
                        return <Tag color="error" style={{ margin: 0 }}>失败</Tag>;
                      }
                    },
                    {
                      title: '操作',
                      width: 50,
                      render: (_: any, record: PushHistoryItem) => (
                        <Popconfirm
                          title="确定删除此条记录？"
                          onConfirm={async () => {
                            try {
                              const response = await authFetch(`/api/admin/strategy-history/${record.id}`, { method: 'DELETE' });
                              if (response.ok) {
                                message.success('删除成功');
                                loadHistory(historyPage);
                              } else {
                                message.error('删除失败');
                              }
                            } catch {
                              message.error('删除失败');
                            }
                          }}
                          okText="是"
                          cancelText="否"
                          disabled={readOnly}
                        >
                          <Button type="text" danger size="small" icon={<DeleteOutlined />} disabled={readOnly} />
                        </Popconfirm>
                      )
                    }
                  ]}
                />
                {historyTotal > 5 && (
                  <div style={{ textAlign: 'center', marginTop: 8 }}>
                    <Pagination
                      size="small"
                      current={historyPage}
                      total={historyTotal}
                      pageSize={5}
                      onChange={loadHistory}
                      showSizeChanger={false}
                    />
                  </div>
                )}
              </div>
            )
          }
        ]}
      />

      {/* JSON编辑弹窗 */}
      <Modal
        title="编辑策略参数"
        open={editingIndex !== null}
        onOk={() => {
          if (editingIndex !== null) {
            try {
              const parsed = JSON.parse(editingJson);
              updateConfigItem(editingIndex, 'params_json', parsed);
              setEditingIndex(null);
              const newErrors = { ...jsonErrors };
              delete newErrors[editingIndex];
              setJsonErrors(newErrors);
            } catch (e) {
              setJsonErrors({ ...jsonErrors, [editingIndex]: 'JSON格式错误' });
            }
          }
        }}
        onCancel={() => setEditingIndex(null)}
        width={500}
      >
        <Input.TextArea
          rows={8}
          value={editingJson}
          onChange={(e) => setEditingJson(e.target.value)}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
        {editingIndex !== null && jsonErrors[editingIndex] && (
          <div style={{ color: '#ff4d4f', fontSize: 12, marginTop: 4 }}>{jsonErrors[editingIndex]}</div>
        )}
      </Modal>
    </Card>
  );
};

export default StrategyPushConfig;
