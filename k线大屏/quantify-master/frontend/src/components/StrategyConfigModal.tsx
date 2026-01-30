import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Modal, Form, Button, message, Tabs, Input, Space } from 'antd';
import authFetch from '../utils/authFetch.ts';
import { SettingOutlined, HistoryOutlined, SaveOutlined, StarOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { BottomDrawer } from './mobile/BottomDrawer.tsx';
import { Theme } from './mobile/theme.ts';
import { AuctionVolumeConfig } from '../strategies/AuctionVolumeConfig.tsx';
import { useStrategiesMeta } from '../strategies/useStrategiesMeta.ts';
import { StrategyHistoryTab } from './StrategyHistoryTab.tsx';

type Props = {
  open: boolean;
  onCancel: () => void;
  onSubmit: (values: { window_n: number; window_m: number; a_lines_spread: number[]; slope_lines: number[]; x_combo: string[]; price_type?: string; }) => void;
  onApplyStrategyFilter?: (result: any) => void; // 应用策略筛选回调
  onSaveConfig?: (config: { window_n?: number; x_combo?: string[]; price_type?: string; volume_multiple?: number; use_volume?: boolean; open_side?: string; }) => void; // 保存配置回调
  savedConfig?: { window_n?: number; x_combo?: string[]; price_type?: string; volume_multiple?: number; use_volume?: boolean; open_side?: string; }; // 保存的配置
  strategy?: string;
  dataType?: 'stock' | 'convertible_bond' | 'concept' | 'industry'; // 数据类型
  strategyResult?: any; // 当前数据类型的策略结果
  onStrategyResultUpdate?: (result: any) => void; // 策略结果更新回调
  globalPeriod?: string; // 全局周期设置
  tradeDate?: string;
  initialWindowN?: number;
  initialWindowM?: number;
  initialALines?: number[];
  initialSlopeLines?: number[];
  initialXCombo?: string[];
  initialPriceType?: string;
  theme?: 'dark' | 'light' | 'blue' | 'purple' | 'green' | 'orange' | 'cyan' | 'red' | 'gold';
  isMobile?: boolean;
  onBackToStrategyList?: () => void;
};

const StrategyConfigModal: React.FC<Props> = ({
  open,
  onCancel,
  onApplyStrategyFilter,
  onSaveConfig,
  savedConfig,
  strategy = 'auction_volume',
  dataType = 'stock',
  strategyResult: propStrategyResult,
  onStrategyResultUpdate,
  globalPeriod = 'daily',
  tradeDate,
  initialPriceType = 'close',
  theme = 'dark',
  isMobile = false,
  onBackToStrategyList,
}) => {
  const [form] = Form.useForm();

  // 常量与工具函数
  const toEntityType = (t: Props['dataType']) => (t === 'convertible_bond' ? 'bond' : (t || 'stock'));

  // 策略执行相关状态
  const [executing, setExecuting] = useState(false);

  // 预设相关状态
  const [presets, setPresets] = useState<any[]>([]);
  const [presetName, setPresetName] = useState('');
  const [savingPreset, setSavingPreset] = useState(false);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [editingPresetKey, setEditingPresetKey] = useState<string | null>(null);
  const [editingPresetName, setEditingPresetName] = useState('');

  // refs
  const didInitRef = useRef(false);

  // 股票预设列表（用于正股策略筛选）
  const [stockPresets, setStockPresets] = useState<Array<{ key: string; name: string; strategy_name: string; params: Record<string, any> }>>([]);
  const [loadingStockPresets, setLoadingStockPresets] = useState(false);

  // 加载股票预设（用于可转债正股策略筛选）
  const loadStockPresets = useCallback(async () => {
    if (dataType !== 'convertible_bond') return;
    setLoadingStockPresets(true);
    try {
      const resp = await authFetch(`/api/strategies/presets?entity_type=stock&period=${globalPeriod}`);
      if (resp.ok) {
        const result = await resp.json();
        if (result.success && Array.isArray(result.data)) {
          setStockPresets(result.data.map((p: any) => ({
            key: p.key,
            name: p.name,
            strategy_name: p.strategy_name,
            params: p.params || {}
          })));
        }
      }
    } catch (e) {
      console.error('加载股票预设失败', e);
    } finally {
      setLoadingStockPresets(false);
    }
  }, [dataType, globalPeriod]);

  // 窗口打开时加载股票预设
  useEffect(() => {
    if (open) {
      loadStockPresets();
    }
  }, [open, loadStockPresets]);

  const isConfigComplete = (cfg: any) => {
    if (!cfg) return false;
    const nComplete = !!(cfg.window_n && Array.isArray(cfg.x_combo) && cfg.x_combo.length > 0);
    const mComplete = !!(cfg.m_days && Array.isArray(cfg.ab_series) && cfg.ab_series.length > 0 && cfg.ab_direction);
    const kComplete = !!(cfg.window_k && cfg.diff_first && cfg.diff_second && cfg.diff_direction);
    return nComplete || mComplete || kComplete;
  };

  const buildContext = useCallback((cfg: any) => {
    const context: any = {
      entity_type: toEntityType(dataType),
      period: globalPeriod
    };

    if (tradeDate) {
      context.trade_date = tradeDate;
    }

    // 数据筛选参数（概念、行业、市值、排除）- 仅当开关启用时传递
    if (cfg.enable_data_filter === true) {
      context.enable_data_filter = true;
      if (cfg.filter_concepts && Array.isArray(cfg.filter_concepts) && cfg.filter_concepts.length > 0) {
        context.filter_concepts = cfg.filter_concepts;
      }
      if (cfg.filter_industries && Array.isArray(cfg.filter_industries) && cfg.filter_industries.length > 0) {
        context.filter_industries = cfg.filter_industries;
      }
      if (cfg.filter_market_cap_min !== undefined && cfg.filter_market_cap_min !== null) {
        context.filter_market_cap_min = Number(cfg.filter_market_cap_min);
      }
      if (cfg.filter_market_cap_max !== undefined && cfg.filter_market_cap_max !== null) {
        context.filter_market_cap_max = Number(cfg.filter_market_cap_max);
      }
      // 板块筛选（统一使用filter_* + board_filter_mode）
      context.board_filter_mode = cfg.board_filter_mode || 'exclude';
      if (cfg.filter_st === true) context.filter_st = true;
      if (cfg.filter_chinext === true) context.filter_chinext = true;
      if (cfg.filter_star === true) context.filter_star = true;
      if (cfg.filter_bse === true) context.filter_bse = true;
    }

    // 竞价策略：量、价、趋势三模块参数（开关控制）
    if (strategy === 'auction_volume') {
      // 始终保存开关状态，以便历史记录重建时恢复
      context.enable_volume = cfg.enable_volume === true;
      context.enable_price = cfg.enable_price === true;
      context.enable_limit_up_filter = cfg.enable_limit_up_filter === true;
      context.enable_trend_m = cfg.enable_trend_m === true;
      context.enable_trend_cross = cfg.enable_trend_cross === true;
      context.enable_trend_converge = cfg.enable_trend_converge === true;

      // 量模块（仅当enable_volume=true时传递详细参数）
      if (cfg.enable_volume === true) {
        // 数据源选择（多选 + 匹配模式）
        context.volume_sources = cfg.volume_sources || ['auction'];
        context.volume_source_match_mode = cfg.volume_source_match_mode || 'any';
        if (cfg.window_n !== undefined && cfg.window_n !== null) {
          context.window_n = Number(cfg.window_n);
        }
        if (cfg.volume_multiple !== undefined && cfg.volume_multiple !== null) {
          context.volume_multiple = Number(cfg.volume_multiple);
        }
        // 量模块-排除条件
        if (cfg.exclude_first_burst !== undefined && cfg.exclude_first_burst !== null) {
          context.exclude_first_burst = Number(cfg.exclude_first_burst);
        }
        if (cfg.exclude_low_avg_percent !== undefined && cfg.exclude_low_avg_percent !== null) {
          context.exclude_low_avg_percent = Number(cfg.exclude_low_avg_percent);
        }
      }

      // 振幅筛选（仅当enable_price=true时传递）
      if (cfg.enable_price === true) {
        // 平均振幅窗口
        if (cfg.amplitude_days_window !== undefined && cfg.amplitude_days_window !== null) {
          context.amplitude_days_window = Number(cfg.amplitude_days_window);
        }
        // 最小平均振幅阈值
        if (cfg.min_avg_amplitude !== undefined && cfg.min_avg_amplitude !== null) {
          context.min_avg_amplitude = Number(cfg.min_avg_amplitude);
        }
      }

      // 涨停筛选（仅当enable_limit_up_filter=true时传递）
      if (cfg.enable_limit_up_filter === true) {
        // 涨停统计窗口
        if (cfg.limit_up_days_window !== undefined && cfg.limit_up_days_window !== null) {
          context.limit_up_days_window = Number(cfg.limit_up_days_window);
        }
        // 最小涨停次数
        if (cfg.min_limit_up_count !== undefined && cfg.min_limit_up_count !== null) {
          context.min_limit_up_count = Number(cfg.min_limit_up_count);
        }
      }

      // 趋势模块条件1（仅当enable_trend_m=true时传递）
      if (cfg.enable_trend_m === true && cfg.m_days && (
        (Array.isArray(cfg.ab_up_series) && cfg.ab_up_series.length > 0) ||
        (Array.isArray(cfg.ab_down_series) && cfg.ab_down_series.length > 0)
      )) {
        context.m_days = Number(cfg.m_days);
        context.ab_up_series = cfg.ab_up_series || [];
        context.ab_up_series_match_mode = cfg.ab_up_series_match_mode || 'any';
        context.ab_down_series = cfg.ab_down_series || [];
        context.ab_down_series_match_mode = cfg.ab_down_series_match_mode || 'any';
        context.monotonic_type = cfg.monotonic_type || 'trend';
      }

      // 趋势模块条件2：EXPMA偏离筛选（仅当enable_trend_cross=true时传递）
      if (cfg.enable_trend_cross === true) {
        // EXPMA周期：多选 + 匹配模式
        context.cross_expma_periods = cfg.cross_expma_periods || [250];
        context.cross_expma_match_mode = cfg.cross_expma_match_mode || 'any';
        // 价格类型：多选 + 匹配模式
        context.cross_price_types = cfg.cross_price_types || ['close'];
        context.cross_price_match_mode = cfg.cross_price_match_mode || 'any';
        // 单值参数
        context.cross_days_window = Number(cfg.cross_days_window || 5);
        context.cross_threshold = Number(cfg.cross_threshold || 2);
        context.cross_threshold_match_mode = cfg.cross_threshold_match_mode || 'any';
      }

      // 趋势模块条件3：趋势收敛（仅当enable_trend_converge=true时传递）
      if (cfg.enable_trend_converge === true) {
        // 线对：多选 + 匹配模式
        context.converge_line_pairs = cfg.converge_line_pairs || ['a', 'b'];
        context.converge_line_pair_match_mode = cfg.converge_line_pair_match_mode || 'any';
        // 趋势类型：多选 + 匹配模式
        context.converge_trend_types = cfg.converge_trend_types || ['type1'];
        context.converge_trend_match_mode = cfg.converge_trend_match_mode || 'any';
        // 单值参数
        context.converge_monotonic_type = cfg.converge_monotonic_type || 'trend';
        context.converge_diff_positive = cfg.converge_diff_positive || false;
        context.converge_window = Number(cfg.converge_window || 5);
      }

      // 正股策略筛选（仅可转债时有效，需要开关启用且选择了预设）
      if (cfg.enable_underlying_filter && cfg.underlying_strategy) {
        context.enable_underlying_filter = true;
        context.underlying_strategy = cfg.underlying_strategy;
      }

      return context;
    }

    return context;
  }, [dataType, globalPeriod, strategy, tradeDate]);

  // 统一从策略元数据中获取标题（优先使用后端 label，缺失时回退到旧逻辑）
  const { strategies } = useStrategiesMeta();
  const strategyMeta = strategies.find(s => s.key === strategy);
  const modalTitle = strategyMeta?.label
    || (strategy === 'auction_volume'
      ? '量价趋势策略'
      : '策略配置');

  const [isInitializing, setIsInitializing] = useState(false);

  // 切换标的类型或周期时，重置表单并清空初始化标记
  useEffect(() => {
    didInitRef.current = false;
    // 仅在 Modal 打开时重置表单，避免 useForm 未连接警告
    if (open) {
      form.resetFields();
    }
  }, [dataType, globalPeriod, form, open]);

  // 窗口打开时，如果有保存的配置就填充表单
  useEffect(() => {
    if (!open) return;

    // 表单初始化只在第一次打开时进行
    if (!didInitRef.current) {
      setIsInitializing(true);
      if (savedConfig && savedConfig.window_n && savedConfig.x_combo) {
        const configValues = {
          window_n: savedConfig.window_n,
          m_days: undefined,
          monotonic_type: 'trend',
          ab_up_series: [],
          ab_down_series: [],
          window_k: undefined,
          diff_first: 'a4',
          diff_second: 'a1',
          diff_direction: 'down',
          diff_monotonic_type: 'trend',
          // 竞价策略相关配置
          volume_multiple: savedConfig.volume_multiple,
          use_volume: typeof savedConfig.use_volume === 'boolean' ? savedConfig.use_volume : true,
          open_side: savedConfig.open_side || 'low',
        };
        form.setFieldsValue(configValues);
        setIsInitializing(false);
      } else {
        const emptyValues = {
          window_n: undefined,
          m_days: undefined,
          monotonic_type: 'trend',
          ab_up_series: [],
          ab_down_series: [],
          window_k: undefined,
          diff_first: 'a4',
          diff_second: 'a1',
          diff_direction: 'down',
          diff_monotonic_type: 'trend',
          // 竞价策略默认配置
          volume_multiple: undefined,
          use_volume: true,
          open_side: 'low',
        };
        form.setFieldsValue(emptyValues);
        setIsInitializing(false);
      }
      didInitRef.current = true;
    }
  }, [open, savedConfig, form, initialPriceType]);

  // 执行策略
  const handleExecuteStrategy = async () => {
    setExecuting(true);
    try {
      const values = form.getFieldsValue();
      // EXPMA 策略需检查配置完整性；竞价策略则允许直接使用默认或部分参数
      if (strategy !== 'auction_volume' && !isConfigComplete(values)) {
        message.warning('请至少完成一组筛选条件的配置');
        setExecuting(false);
        return;
      }
      const response = await authFetch('/api/strategies/execute-async', {
        method: 'POST',
        body: JSON.stringify({
          strategy,
          entity_type: toEntityType(dataType),
          period: globalPeriod,
          context: {
            ...buildContext(values)
          }
        })
      });

      const data = await response.json();
      if (data.success) {
        // 跳转到执行历史tab，历史列表会自动显示running状态的记录
        setActiveTab('history');
        setMobileView('history');
        message.success('策略计算任务已启动');
      } else {
        message.error(data.detail || data.message || '启动策略计算失败');
      }
    } catch (error: any) {
      message.error(error?.message || '执行策略失败，请稍后重试');
    } finally {
      setExecuting(false);
    }
  };

  const isLight = theme === 'light';

  const handleModalCancel = () => {
    onCancel();
  };

  // 当前Tab
  const [activeTab, setActiveTab] = useState<'config' | 'presets' | 'history'>('config');

  // 应用历史结果 - 使用ts_codes和base_date
  const handleApplyHistoryResult = (tsCodes: string[], baseDate: string | null) => {
    if (onApplyStrategyFilter && tsCodes.length > 0) {
      onApplyStrategyFilter({
        ts_codes: tsCodes,
        base_date: baseDate,
        from_history: true
      });
      // 应用后关闭整个Modal
      onCancel();
    }
  };

  // 应用自定义代码列表（用于对比结果）
  const handleApplyCustomCodes = (codes: string[], label: string) => {
    if (onApplyStrategyFilter && codes.length > 0) {
      onApplyStrategyFilter({
        custom_codes: codes,
        custom_label: label,
        from_compare: true
      });
      message.success(`已应用${label}`);
      // 应用后关闭整个Modal
      onCancel();
    }
  };

  // 重建历史参数 - 将历史参数加载到表单中
  const handleRebuildParams = (context: Record<string, any>, _contextHash: string) => {
    // 切换到参数配置tab
    setActiveTab('config');
    // 先重置表单，再设置历史参数值
    form.resetFields();
    // 延迟设置值，确保resetFields生效后再设置
    setTimeout(() => {
      // 如果历史参数没有启用量条件，确保volume_sources为空
      if (!context.enable_volume) {
        context.volume_sources = [];
      }

      // 字段名已统一，无需反向转换
      form.setFieldsValue(context);
    }, 0);
  };

  // ==================== 预设功能 ====================

  // 加载预设列表
  const loadPresets = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        strategy_name: strategy,
        entity_type: toEntityType(dataType),
        period: globalPeriod,
      });
      const resp = await authFetch(`/api/strategies/presets?${params}`);
      if (resp.ok) {
        const res = await resp.json();
        if (res.success) {
          setPresets(res.data || []);
        }
      }
    } catch (e) {
      console.error('加载预设失败', e);
    }
  }, [strategy, dataType, globalPeriod]);

  // 打开时加载预设
  useEffect(() => {
    if (open) {
      loadPresets();
    }
  }, [open, loadPresets]);

  // 保存预设
  const handleSavePreset = async () => {
    if (!presetName.trim()) {
      message.warning('请输入预设名称');
      return;
    }
    setSavingPreset(true);
    try {
      const formParams = form.getFieldsValue();
      // 经过buildContext处理，保持与用户执行时一致
      const processedParams = buildContext(formParams);
      // 移除运行时参数，只保留策略参数
      delete processedParams.entity_type;
      delete processedParams.period;
      delete processedParams.trade_date;
      const resp = await authFetch('/api/strategies/presets', {
        method: 'POST',
        body: JSON.stringify({
          name: presetName.trim(),
          strategy_name: strategy,
          entity_type: toEntityType(dataType),
          period: globalPeriod,
          params: processedParams,
        }),
      });
      const res = await resp.json();
      if (res.success) {
        message.success('预设保存成功');
        setShowSaveInput(false);
        setPresetName('');
        loadPresets();
      } else {
        message.error(res.detail || res.message || '保存失败');
      }
    } catch (e: any) {
      message.error(e?.message || '保存预设失败');
    } finally {
      setSavingPreset(false);
    }
  };

  // 加载预设到表单
  const handleLoadPreset = (presetKey: string) => {
    const preset = presets.find(p => p.key === presetKey);
    if (preset?.params) {
      form.setFieldsValue(preset.params);
      message.success(`已加载预设: ${preset.name}`);
    }
  };

  // 删除预设
  const handleDeletePreset = async (presetKey: string) => {
    try {
      const resp = await authFetch(`/api/strategies/presets/${presetKey}`, {
        method: 'DELETE',
      });
      const res = await resp.json();
      if (res.success) {
        message.success('预设已删除');
        loadPresets();
      }
    } catch (e) {
      message.error('删除失败');
    }
  };

  // 更新预设参数（使用当前表单值覆盖）
  const handleUpdatePreset = async (presetKey: string) => {
    try {
      const formParams = form.getFieldsValue();
      const resp = await authFetch(`/api/strategies/presets/${presetKey}`, {
        method: 'PUT',
        body: JSON.stringify({ params: formParams }),
      });
      const res = await resp.json();
      if (res.success) {
        message.success('预设已更新');
        loadPresets();
      } else {
        message.error(res.detail || res.message || '更新失败');
      }
    } catch (e) {
      message.error('更新预设失败');
    }
  };

  // 重命名预设
  const handleRenamePreset = async (presetKey: string) => {
    if (!editingPresetName.trim()) {
      message.warning('请输入预设名称');
      return;
    }
    if (editingPresetName.trim().length < 2 || editingPresetName.trim().length > 50) {
      message.warning('预设名称长度需在2-50个字符之间');
      return;
    }
    try {
      const resp = await authFetch(`/api/strategies/presets/${presetKey}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editingPresetName.trim() }),
      });
      const res = await resp.json();
      if (res.success) {
        message.success('预设已重命名');
        setEditingPresetKey(null);
        setEditingPresetName('');
        loadPresets();
      } else {
        message.error(res.detail || res.message || '重命名失败');
      }
    } catch (e) {
      message.error('重命名失败');
    }
  };

  const modalContent = (
    <>
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as 'config' | 'presets' | 'history')}
        size="small"
        items={[
          {
            key: 'config',
            label: <span><SettingOutlined /> 参数配置</span>,
            children: (
              <>
                <Form
                  form={form}
                  layout="vertical"
                  size="middle"
                  preserve
                  initialValues={savedConfig ? {
                    window_n: savedConfig.window_n,
                    m_days: undefined,
                    monotonic_type: 'trend',
                    ab_up_series: [],
                    ab_down_series: [],
                    window_k: undefined,
                    diff_first: 'a4',
                    diff_second: 'a1',
                    diff_direction: 'down',
                    diff_monotonic_type: 'trend',
                    volume_multiple: savedConfig.volume_multiple,
                    open_side: savedConfig.open_side || 'low',
                  } : {
                    window_n: undefined,
                    m_days: undefined,
                    monotonic_type: 'trend',
                    ab_up_series: [],
                    ab_down_series: [],
                    window_k: undefined,
                    diff_first: 'a4',
                    diff_second: 'a1',
                    diff_direction: 'down',
                    diff_monotonic_type: 'trend',
                    volume_multiple: undefined,
                    open_side: 'low',
                  }}
                  onValuesChange={() => {
                    // 初始化期间忽略onValuesChange
                    if (isInitializing) return;
                  }}
                >
                  {strategy === 'auction_volume' && (
                    <AuctionVolumeConfig isLight={isLight} isMobile={isMobile} dataType={dataType} stockPresets={stockPresets} loadingStockPresets={loadingStockPresets} />
                  )}
                </Form>
              </>
            )
          },
          {
            key: 'presets',
            label: <span><StarOutlined /> 我的预设</span>,
            children: (
              <div style={{ minHeight: 200 }}>
                {presets.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
                    暂无保存的预设
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {presets.map(p => (
                      <div
                        key={p.key}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '8px 12px',
                          border: '1px solid #d9d9d9',
                          borderRadius: 6,
                          cursor: 'pointer',
                          background: isLight ? '#fafafa' : 'rgba(255,255,255,0.04)',
                        }}
                        onClick={() => { if (editingPresetKey !== p.key) { handleLoadPreset(p.key); setActiveTab('config'); } }}
                      >
                        {editingPresetKey === p.key ? (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }} onClick={(e) => e.stopPropagation()}>
                            <Input
                              size="small"
                              value={editingPresetName}
                              onChange={(e) => setEditingPresetName(e.target.value)}
                              onPressEnter={() => handleRenamePreset(p.key)}
                              style={{ flex: 1 }}
                              autoFocus
                            />
                            <Button size="small" type="primary" onClick={() => handleRenamePreset(p.key)}>保存</Button>
                            <Button size="small" onClick={() => { setEditingPresetKey(null); setEditingPresetName(''); }}>取消</Button>
                          </div>
                        ) : (
                          <>
                            <div>
                              <div style={{ fontWeight: 500 }}>{p.name}</div>
                              <div style={{ fontSize: 12, color: '#999' }}>
                                {p.updated_at ? new Date(p.updated_at).toLocaleString() : ''}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <Button
                                type="text"
                                size="small"
                                icon={<EditOutlined />}
                                onClick={(e) => { e.stopPropagation(); setEditingPresetKey(p.key); setEditingPresetName(p.name); }}
                                title="重命名"
                              />
                              <Button
                                type="text"
                                size="small"
                                icon={<SaveOutlined />}
                                onClick={(e) => { e.stopPropagation(); handleUpdatePreset(p.key); }}
                                title="用当前参数更新此预设"
                              />
                              <Button
                                type="text"
                                danger
                                size="small"
                                icon={<DeleteOutlined />}
                                onClick={(e) => { e.stopPropagation(); handleDeletePreset(p.key); }}
                                title="删除"
                              />
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          },
          {
            key: 'history',
            label: <span><HistoryOutlined /> 执行历史</span>,
            children: (
              <StrategyHistoryTab
                entityType={toEntityType(dataType)}
                period={globalPeriod}
                strategyName={strategy}
                onApplyResult={handleApplyHistoryResult}
                onApplyCustomCodes={handleApplyCustomCodes}
                onRebuildParams={handleRebuildParams}
                isMobile={isMobile}
                isActive={activeTab === 'history'}
                isLight={isLight}
              />
            )
          }
        ]}
      />

    </>
  );

  // 移动端视图状态
  const [mobileView, setMobileView] = useState<'config' | 'history' | 'presets'>('config');

  // 移动端：使用 BottomDrawer（只支持 'dark' | 'light'）
  const mobileTheme: Theme = theme === 'light' ? 'light' : 'dark';

  // 移动端内容渲染
  const renderMobileContent = () => {
    if (mobileView === 'history') {
      return (
        <StrategyHistoryTab
          entityType={toEntityType(dataType)}
          period={globalPeriod}
          strategyName={strategy}
          onApplyResult={handleApplyHistoryResult}
          onApplyCustomCodes={handleApplyCustomCodes}
          onRebuildParams={(ctx, hash) => { handleRebuildParams(ctx, hash); setMobileView('config'); }}
          isMobile={true}
          isActive={true}
          isLight={isLight}
        />
      );
    }

    if (mobileView === 'presets') {
      return (
        <div style={{ minHeight: 200 }}>
          {presets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
              暂无保存的预设
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {presets.map(p => (
                <div
                  key={p.key}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    border: '1px solid #d9d9d9',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: isLight ? '#fafafa' : 'rgba(255,255,255,0.04)',
                  }}
                  onClick={() => { if (editingPresetKey !== p.key) { handleLoadPreset(p.key); setMobileView('config'); } }}
                >
                  {editingPresetKey === p.key ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }} onClick={(e) => e.stopPropagation()}>
                      <Input
                        size="small"
                        value={editingPresetName}
                        onChange={(e) => setEditingPresetName(e.target.value)}
                        onPressEnter={() => handleRenamePreset(p.key)}
                        style={{ flex: 1 }}
                        autoFocus
                      />
                      <Button size="small" type="primary" onClick={() => handleRenamePreset(p.key)}>保存</Button>
                      <Button size="small" onClick={() => { setEditingPresetKey(null); setEditingPresetName(''); }}>取消</Button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 15 }}>{p.name}</div>
                        <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                          {p.updated_at ? new Date(p.updated_at).toLocaleString() : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <Button
                          type="text"
                          size="small"
                          icon={<EditOutlined />}
                          onClick={(e) => { e.stopPropagation(); setEditingPresetKey(p.key); setEditingPresetName(p.name); }}
                          title="重命名"
                        />
                        <Button
                          type="text"
                          size="small"
                          icon={<SaveOutlined />}
                          onClick={(e) => { e.stopPropagation(); handleUpdatePreset(p.key); }}
                          title="用当前参数更新此预设"
                        />
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={(e) => { e.stopPropagation(); handleDeletePreset(p.key); }}
                          title="删除"
                        />
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    // 默认：参数配置
    return (
      <>
        <Form
          form={form}
          layout="vertical"
          size="middle"
          preserve
          initialValues={savedConfig ? {
            window_n: savedConfig.window_n,
            volume_multiple: savedConfig.volume_multiple,
            use_volume: savedConfig.use_volume,
            open_side: savedConfig.open_side,
          } : undefined}
          onValuesChange={() => {
            if (isInitializing) return;
          }}
        >
          {strategy === 'auction_volume' && (
            <AuctionVolumeConfig isLight={isLight} isMobile={true} dataType={dataType} stockPresets={stockPresets} loadingStockPresets={loadingStockPresets} />
          )}
        </Form>
      </>
    );
  };

  if (isMobile) {
    const mobileTitle = mobileView === 'config' ? modalTitle :
      mobileView === 'history' ? '执行历史' : '我的预设';

    return (
      <BottomDrawer
        title={mobileTitle}
        theme={mobileTheme}
        maxHeight="70vh"
        open={open}
        onClose={handleModalCancel}
        onBack={mobileView !== 'config' ? () => setMobileView('config') : onBackToStrategyList}
        zIndex={2001}
      >
        <div style={{ padding: 16 }}>
          {/* 参数配置页显示快捷操作栏 */}
          {mobileView === 'config' && (
            <div style={{
              display: 'flex',
              gap: 8,
              marginBottom: 16,
              paddingBottom: 12,
              borderBottom: `1px solid ${isLight ? '#f0f0f0' : 'rgba(255,255,255,0.1)'}`,
            }}>
              <Button
                icon={<HistoryOutlined />}
                onClick={() => setMobileView('history')}
                style={{ flex: 1 }}
              >
                执行历史
              </Button>
              <Button
                icon={<StarOutlined />}
                onClick={() => setMobileView('presets')}
                style={{ flex: 1, color: presets.length > 0 ? '#faad14' : undefined }}
              >
                我的预设{presets.length > 0 && ` (${presets.length})`}
              </Button>
            </div>
          )}
          {renderMobileContent()}
          {mobileView === 'config' && (
            <div style={{ marginTop: 16 }}>
              {showSaveInput ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Input
                    placeholder="输入预设名称（2-20个字符）"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    style={{ height: 40 }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button onClick={() => { setShowSaveInput(false); setPresetName(''); }} style={{ flex: 1, height: 40 }}>
                      取消
                    </Button>
                    <Button type="primary" loading={savingPreset} onClick={handleSavePreset} style={{ flex: 1, height: 40 }}>
                      保存预设
                    </Button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button icon={<SaveOutlined />} onClick={() => setShowSaveInput(true)} style={{ height: 40 }}>
                    保存预设
                  </Button>
                  <Button
                    type="primary"
                    loading={executing}
                    disabled={executing}
                    onClick={handleExecuteStrategy}
                    style={{ flex: 1, height: 40, boxShadow: 'none' }}
                  >
                    {executing ? '执行中...' : '执行策略'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </BottomDrawer>
    );
  }

  // 桌面端：使用 Modal
  return (
    <Modal
      title={modalTitle}
      open={open}
      onCancel={handleModalCancel}
      width={700}
      footer={activeTab === 'config' ? (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          {showSaveInput ? (
            <Space.Compact>
              <Input
                placeholder="预设名称"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onPressEnter={handleSavePreset}
                style={{ width: 150 }}
              />
              <Button loading={savingPreset} onClick={handleSavePreset}>保存</Button>
              <Button onClick={() => { setShowSaveInput(false); setPresetName(''); }}>取消</Button>
            </Space.Compact>
          ) : (
            <Button icon={<SaveOutlined />} onClick={() => setShowSaveInput(true)}>
              保存预设
            </Button>
          )}
          <Button
            key="execute"
            type="primary"
            loading={executing}
            disabled={executing}
            onClick={handleExecuteStrategy}
            style={{ boxShadow: 'none' }}
          >
            {executing ? '执行中...' : '执行策略'}
          </Button>
        </div>
      ) : null}
      destroyOnHidden={false}
      maskClosable={false}
    >
      {modalContent}
    </Modal>
  );
};

export default StrategyConfigModal;


