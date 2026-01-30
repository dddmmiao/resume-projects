import React, { useEffect, useState, useCallback } from 'react';
import { Form, InputNumber, Typography, Space, Checkbox, Switch, Segmented, Tag, Tooltip, Select, Button } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import authFetch from '../utils/authFetch.ts';
import { MultiSelectDrawer } from '../components/mobile/MultiSelectDrawer.tsx';
import { SelectionDrawer } from '../components/mobile/SelectionDrawer.tsx';

interface StrategyConfigProps {
  isLight: boolean;
  isMobile?: boolean;
  dataType?: 'stock' | 'convertible_bond' | 'concept' | 'industry';
  stockPresets?: Array<{ key: string; name: string; strategy_name: string; params: Record<string, any> }>;  // 正股策略预设列表（由父组件加载）
  loadingStockPresets?: boolean;  // 是否正在加载正股策略预设
}

export const AuctionVolumeConfig: React.FC<StrategyConfigProps> = ({
  isLight,
  isMobile = false,
  dataType = 'stock',
  stockPresets = [],
  loadingStockPresets = false,
}) => {
  const form = Form.useFormInstance();

  // 概念和行业选项数据
  const [conceptOptions, setConceptOptions] = useState<Array<{ code: string; name: string; isHot: boolean }>>([]);
  const [industryOptions, setIndustryOptions] = useState<Array<{ code: string; name: string; isHot: boolean }>>([]);
  const [loadingConcepts, setLoadingConcepts] = useState(false);
  const [loadingIndustries, setLoadingIndustries] = useState(false);

  // 获取概念列表
  type OptionItem = { code: string; name: string; isHot: boolean };
  const fetchConcepts = useCallback(async (): Promise<OptionItem[]> => {
    if (conceptOptions.length > 0) return conceptOptions; // 已有缓存
    setLoadingConcepts(true);
    try {
      const resp = await authFetch('/api/concepts/options?hot_sort=true');
      if (resp.ok) {
        const result = await resp.json();
        if (result.success && Array.isArray(result.data)) {
          const options = result.data.map((item: any) => ({
            code: item.concept_code,
            name: item.concept_name,
            isHot: item.is_hot === true
          }));
          setConceptOptions(options);
          return options;
        }
      }
    } catch (e) {
      console.error('获取概念列表失败', e);
    } finally {
      setLoadingConcepts(false);
    }
    return [];
  }, [conceptOptions]);

  // 获取行业列表
  const fetchIndustries = useCallback(async (): Promise<OptionItem[]> => {
    if (industryOptions.length > 0) return industryOptions; // 已有缓存
    setLoadingIndustries(true);
    try {
      const resp = await authFetch('/api/industries/options?hot_sort=true');
      if (resp.ok) {
        const result = await resp.json();
        if (result.success && Array.isArray(result.data)) {
          const options = result.data.map((item: any) => ({
            code: item.industry_code,
            name: item.industry_name,
            isHot: item.is_hot === true
          }));
          setIndustryOptions(options);
          return options;
        }
      }
    } catch (e) {
      console.error('获取行业列表失败', e);
    } finally {
      setLoadingIndustries(false);
    }
    return [];
  }, [industryOptions]);

  // 监听表单中的概念和行业值，有值时自动加载选项（用于重建参数场景）
  const filterConcepts = Form.useWatch('filter_concepts', form);
  const filterIndustries = Form.useWatch('filter_industries', form);

  useEffect(() => {
    if (filterConcepts?.length > 0 && conceptOptions.length === 0) {
      fetchConcepts();
    }
  }, [filterConcepts, conceptOptions.length, fetchConcepts]);

  useEffect(() => {
    if (filterIndustries?.length > 0 && industryOptions.length === 0) {
      fetchIndustries();
    }
  }, [filterIndustries, industryOptions.length, fetchIndustries]);

  // 数据源选择
  const volumeSourceMatchMode = Form.useWatch('volume_source_match_mode', form) || 'any';

  // 是否为股票标的
  const isStock = dataType === 'stock';

  // 非股票标的时，移除竞价量选项
  useEffect(() => {
    if (!isStock) {
      const currentVolumeSources = form.getFieldValue('volume_sources');
      // 如果包含竞价量，移除它
      if (currentVolumeSources?.includes('auction')) {
        form.setFieldValue('volume_sources', currentVolumeSources.filter((s: string) => s !== 'auction'));
      }
    }
  }, [isStock, form]);
  const enableVolume = Form.useWatch('enable_volume', form);
  const enablePrice = Form.useWatch('enable_price', form);
  const enableLimitUpFilter = Form.useWatch('enable_limit_up_filter', form);
  const enableTrendM = Form.useWatch('enable_trend_m', form);
  const enableTrendCross = Form.useWatch('enable_trend_cross', form);
  const enableTrendConverge = Form.useWatch('enable_trend_converge', form);
  const enableUnderlyingFilter = Form.useWatch('enable_underlying_filter', form);

  // 正股策略筛选：关闭开关时清空选中项
  useEffect(() => {
    if (enableUnderlyingFilter === false) {
      form.setFieldValue('underlying_strategy', undefined);
    }
  }, [enableUnderlyingFilter, form]);

  // 条件3匹配模式监听
  const convergeLinePairMatchMode = Form.useWatch('converge_line_pair_match_mode', form) || 'any';
  const convergeTrendMatchMode = Form.useWatch('converge_trend_match_mode', form) || 'any';

  // 条件1、条件2匹配模式监听
  const abUpSeriesMatchMode = Form.useWatch('ab_up_series_match_mode', form) || 'any';
  const abDownSeriesMatchMode = Form.useWatch('ab_down_series_match_mode', form) || 'any';
  const crossExpmaMatchMode = Form.useWatch('cross_expma_match_mode', form) || 'any';
  const crossPriceMatchMode = Form.useWatch('cross_price_match_mode', form) || 'any';
  const crossThresholdMatchMode = Form.useWatch('cross_threshold_match_mode', form) || 'any';

  // 条件1：涨跌序列监听
  const abUpSeries = Form.useWatch('ab_up_series', form) || [];
  const abDownSeries = Form.useWatch('ab_down_series', form) || [];

  // 数据筛选开关监听
  const enableDataFilter = Form.useWatch('enable_data_filter', form);

  // 移动端半屏选择状态
  const [conceptDrawerOpen, setConceptDrawerOpen] = useState(false);
  const [industryDrawerOpen, setIndustryDrawerOpen] = useState(false);
  const [stockPresetDrawerOpen, setStockPresetDrawerOpen] = useState(false);


  // 条件1：涨跌互斥处理 - 当涨选中某值时自动从跌中移除，反之亦然
  useEffect(() => {
    if (abUpSeries.length > 0 && abDownSeries.length > 0) {
      const conflict = abUpSeries.filter((v: string) => abDownSeries.includes(v));
      if (conflict.length > 0) {
        // 从跌中移除冲突项
        const newDown = abDownSeries.filter((v: string) => !conflict.includes(v));
        form.setFieldValue('ab_down_series', newDown);
      }
    }
  }, [abUpSeries]);

  useEffect(() => {
    if (abDownSeries.length > 0 && abUpSeries.length > 0) {
      const conflict = abDownSeries.filter((v: string) => abUpSeries.includes(v));
      if (conflict.length > 0) {
        // 从涨中移除冲突项
        const newUp = abUpSeries.filter((v: string) => !conflict.includes(v));
        form.setFieldValue('ab_up_series', newUp);
      }
    }
  }, [abDownSeries]);


  return (
    <>
      <div style={{ marginBottom: 16, fontSize: 13, color: isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.75)' }}>
        <Typography.Paragraph style={{ marginBottom: 8 }}>
          <strong>策略说明：</strong>量&价&趋势三维筛选
        </Typography.Paragraph>
      </div>

      {/* ==================== 正股策略筛选模块（仅可转债） ==================== */}
      {dataType === 'convertible_bond' && (
        <div style={{
          border: `1px solid ${isLight ? '#d9d9d9' : '#434343'}`,
          borderRadius: 6,
          padding: 12,
          marginBottom: 16,
          backgroundColor: isLight ? '#fafafa' : 'rgba(255,255,255,0.02)',
        }}>
          <Space size={12} align="center" style={{ marginBottom: 8 }}>
            <Typography.Text strong style={{ fontSize: 14 }}>
              正股策略筛选
            </Typography.Text>
            <Form.Item name="enable_underlying_filter" valuePropName="checked" style={{ marginBottom: 0 }} initialValue={false}>
              <Switch size="small" />
            </Form.Item>
          </Space>
          <Form.Item name="underlying_strategy" hidden><input /></Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.enable_underlying_filter !== cur.enable_underlying_filter || prev.underlying_strategy !== cur.underlying_strategy}>
            {() => {
              const enableFilter = form.getFieldValue('enable_underlying_filter');
              const underlyingStrategy = form.getFieldValue('underlying_strategy');
              const selectedPresetName = underlyingStrategy?.preset_name;

              return isMobile ? (
                <>
                  <Button
                    block
                    disabled={!enableFilter}
                    onClick={() => setStockPresetDrawerOpen(true)}
                    style={{
                      textAlign: 'left',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <span style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: selectedPresetName ? undefined : '#999'
                    }}>
                      {selectedPresetName || '选择股票预设来筛选正股'}
                    </span>
                    <RightOutlined style={{ fontSize: 12, color: '#999' }} />
                  </Button>
                  <SelectionDrawer
                    title="选择正股策略预设"
                    theme={isLight ? 'light' : 'dark'}
                    open={stockPresetDrawerOpen}
                    onClose={() => setStockPresetDrawerOpen(false)}
                    onBack={() => setStockPresetDrawerOpen(false)}
                    options={stockPresets.map(p => ({
                      key: p.key,
                      label: p.name,
                      value: p
                    }))}
                    selectedValue={underlyingStrategy?.preset_key}
                    onSelect={(option) => {
                      if (underlyingStrategy?.preset_key === option.key) {
                        form.setFieldValue('underlying_strategy', null);
                      } else {
                        const preset = option.value;
                        form.setFieldValue('underlying_strategy', {
                          preset_key: preset.key,
                          preset_name: preset.name,
                          strategy_name: preset.strategy_name,
                          params: preset.params
                        });
                      }
                    }}
                    disableScrollLock
                  />
                </>
              ) : (
                <Select
                  allowClear
                  placeholder="选择股票预设来筛选正股"
                  loading={loadingStockPresets}
                  disabled={!enableFilter}
                  style={{ width: '100%' }}
                  value={underlyingStrategy?.preset_key || undefined}
                  onChange={(value) => {
                    if (!value) {
                      form.setFieldValue('underlying_strategy', null);
                      return;
                    }
                    const preset = stockPresets.find(p => p.key === value);
                    if (preset) {
                      form.setFieldValue('underlying_strategy', {
                        preset_key: preset.key,
                        preset_name: preset.name,
                        strategy_name: preset.strategy_name,
                        params: preset.params
                      });
                    }
                  }}
                  options={stockPresets.map(p => ({
                    value: p.key,
                    label: p.name
                  }))}
                />
              );
            }}
          </Form.Item>
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
            提示：对候选可转债的正股执行所选预设，仅保留正股符合条件的可转债
          </Typography.Text>
        </div>
      )}

      {/* ==================== 数据筛选模块（仅股票/可转债） ==================== */}
      {(dataType === 'stock' || dataType === 'convertible_bond') && (
        <div style={{
          border: `1px solid ${isLight ? '#d9d9d9' : '#434343'}`,
          borderRadius: 6,
          padding: 12,
          marginBottom: 16,
          backgroundColor: isLight ? '#fafafa' : 'rgba(255,255,255,0.02)',
        }}>
          <Space size={12} align="center" style={{ marginBottom: 8 }}>
            <Typography.Text strong style={{ fontSize: 14 }}>
              数据筛选
            </Typography.Text>
            <Form.Item name="enable_data_filter" valuePropName="checked" style={{ marginBottom: 0 }} initialValue={false}>
              <Switch size="small" />
            </Form.Item>
          </Space>

          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {/* 一键选择热门 */}
            <Space size={8} align="center">
              <Tag
                color="red"
                style={{
                  cursor: enableDataFilter ? 'pointer' : 'not-allowed',
                  opacity: enableDataFilter ? 1 : 0.5,
                  fontSize: isMobile ? 12 : 13
                }}
                onClick={async () => {
                  if (!enableDataFilter) return;
                  const [concepts, industries] = await Promise.all([fetchConcepts(), fetchIndustries()]);
                  const hotConceptCodes = (concepts || []).filter(opt => opt.isHot).map(opt => opt.code);
                  const hotIndustryCodes = (industries || []).filter(opt => opt.isHot).map(opt => opt.code);
                  form.setFieldValue('filter_concepts', hotConceptCodes);
                  form.setFieldValue('filter_industries', hotIndustryCodes);
                }}
              >
                🔥 一键选择热门
              </Tag>
              <Tag
                style={{
                  cursor: enableDataFilter ? 'pointer' : 'not-allowed',
                  opacity: enableDataFilter ? 1 : 0.5,
                  fontSize: isMobile ? 12 : 13
                }}
                onClick={() => {
                  if (!enableDataFilter) return;
                  form.setFieldValue('filter_concepts', []);
                  form.setFieldValue('filter_industries', []);
                }}
              >
                清空
              </Tag>
            </Space>

            {/* 概念筛选 */}
            <Space size={4} align="center" style={{ width: '100%' }}>
              <span style={{ minWidth: isMobile ? 50 : 56, fontSize: isMobile ? 12 : 14 }}>概念</span>
              {isMobile ? (
                <>
                  <Form.Item name="filter_concepts" hidden><input /></Form.Item>
                  <Button
                    block
                    disabled={!enableDataFilter}
                    onClick={() => {
                      fetchConcepts();
                      setConceptDrawerOpen(true);
                    }}
                    style={{
                      flex: 1,
                      textAlign: 'left',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <span style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: filterConcepts?.length > 0 ? undefined : '#999'
                    }}>
                      {filterConcepts?.length > 0
                        ? `已选${filterConcepts.length}个概念`
                        : '选择概念'}
                    </span>
                    <RightOutlined style={{ fontSize: 12, color: '#999' }} />
                  </Button>
                  <MultiSelectDrawer
                    theme={isLight ? 'light' : 'dark'}
                    title="选择概念"
                    open={conceptDrawerOpen}
                    onClose={() => setConceptDrawerOpen(false)}
                    options={conceptOptions}
                    selectedValues={filterConcepts || []}
                    onConfirm={(values) => form.setFieldValue('filter_concepts', values)}
                    loading={loadingConcepts}
                    placeholder="搜索概念"
                    onFetchOptions={fetchConcepts}
                  />
                </>
              ) : (
                <Form.Item name="filter_concepts" style={{ marginBottom: 0, flex: 1 }}>
                  <Select
                    mode="multiple"
                    placeholder="选择概念"
                    allowClear
                    showSearch
                    disabled={!enableDataFilter}
                    filterOption={(input, option) =>
                      (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    onDropdownVisibleChange={(open) => {
                      if (open) fetchConcepts();
                    }}
                    loading={loadingConcepts}
                    style={{ width: '100%', minWidth: 200 }}
                    options={conceptOptions.map(opt => ({
                      value: opt.code,
                      label: opt.isHot ? `🔥 ${opt.name}` : opt.name
                    }))}
                    maxTagCount={2}
                  />
                </Form.Item>
              )}
            </Space>

            {/* 行业筛选 */}
            <Space size={4} align="center" style={{ width: '100%' }}>
              <span style={{ minWidth: isMobile ? 50 : 56, fontSize: isMobile ? 12 : 14 }}>行业</span>
              {isMobile ? (
                <>
                  <Form.Item name="filter_industries" hidden><input /></Form.Item>
                  <Button
                    block
                    disabled={!enableDataFilter}
                    onClick={() => {
                      fetchIndustries();
                      setIndustryDrawerOpen(true);
                    }}
                    style={{
                      flex: 1,
                      textAlign: 'left',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <span style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: filterIndustries?.length > 0 ? undefined : '#999'
                    }}>
                      {filterIndustries?.length > 0
                        ? `已选${filterIndustries.length}个行业`
                        : '选择行业'}
                    </span>
                    <RightOutlined style={{ fontSize: 12, color: '#999' }} />
                  </Button>
                  <MultiSelectDrawer
                    theme={isLight ? 'light' : 'dark'}
                    title="选择行业"
                    open={industryDrawerOpen}
                    onClose={() => setIndustryDrawerOpen(false)}
                    options={industryOptions}
                    selectedValues={filterIndustries || []}
                    onConfirm={(values) => form.setFieldValue('filter_industries', values)}
                    loading={loadingIndustries}
                    placeholder="搜索行业"
                    onFetchOptions={fetchIndustries}
                  />
                </>
              ) : (
                <Form.Item name="filter_industries" style={{ marginBottom: 0, flex: 1 }}>
                  <Select
                    mode="multiple"
                    placeholder="选择行业"
                    allowClear
                    showSearch
                    disabled={!enableDataFilter}
                    filterOption={(input, option) =>
                      (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    onDropdownVisibleChange={(open) => {
                      if (open) fetchIndustries();
                    }}
                    loading={loadingIndustries}
                    style={{ width: '100%', minWidth: 200 }}
                    options={industryOptions.map(opt => ({
                      value: opt.code,
                      label: opt.isHot ? `🔥 ${opt.name}` : opt.name
                    }))}
                    maxTagCount={2}
                  />
                </Form.Item>
              )}
            </Space>

            {/* 流通市值筛选 */}
            <Space size={4} align="center" style={{ width: '100%', flexWrap: 'wrap' }}>
              <Tooltip title={dataType === 'convertible_bond' ? "按可转债对应正股的流通市值筛选（单位：亿元）" : "按股票流通市值筛选范围（单位：亿元）"}>
                <span style={{ minWidth: isMobile ? 70 : 80, cursor: 'help', borderBottom: '1px dashed #999', fontSize: isMobile ? 12 : 14 }}>{dataType === 'convertible_bond' ? '正股市值' : '流通市值'}</span>
              </Tooltip>
              <Form.Item name="filter_market_cap_min" style={{ marginBottom: 0 }}>
                <InputNumber
                  placeholder="最小"
                  min={0}
                  disabled={!enableDataFilter}
                  style={{ width: isMobile ? 90 : 110 }}
                  addonAfter="亿"
                />
              </Form.Item>
              <span style={{ color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>~</span>
              <Form.Item name="filter_market_cap_max" style={{ marginBottom: 0 }}>
                <InputNumber
                  placeholder="最大"
                  min={0}
                  disabled={!enableDataFilter}
                  style={{ width: isMobile ? 90 : 110 }}
                  addonAfter="亿"
                />
              </Form.Item>
              <Tag color="blue" style={{ cursor: enableDataFilter ? 'pointer' : 'not-allowed', opacity: enableDataFilter ? 1 : 0.5, marginLeft: 8 }} onClick={() => { if (enableDataFilter) { form.setFieldValue('filter_market_cap_min', 0); form.setFieldValue('filter_market_cap_max', 50); } }}>小盘</Tag>
              <Tag color="green" style={{ cursor: enableDataFilter ? 'pointer' : 'not-allowed', opacity: enableDataFilter ? 1 : 0.5 }} onClick={() => { if (enableDataFilter) { form.setFieldValue('filter_market_cap_min', 50); form.setFieldValue('filter_market_cap_max', 200); } }}>中盘</Tag>
              <Tag color="orange" style={{ cursor: enableDataFilter ? 'pointer' : 'not-allowed', opacity: enableDataFilter ? 1 : 0.5 }} onClick={() => { if (enableDataFilter) { form.setFieldValue('filter_market_cap_min', 200); form.setFieldValue('filter_market_cap_max', undefined); } }}>大盘</Tag>
            </Space>

            {/* 板块筛选 - 仅股票显示 */}
            {dataType === 'stock' && (
              <Space size={isMobile ? 8 : 12} align="center" style={{ width: '100%', flexWrap: 'wrap' }}>
                <Form.Item noStyle shouldUpdate={(prev, cur) => prev.board_filter_mode !== cur.board_filter_mode}>
                  {() => {
                    const mode = form.getFieldValue('board_filter_mode') || 'exclude';
                    return (
                      <Tooltip title="排除=去掉勾选项，只保留=仅保留勾选项">
                        <Tag
                          color={mode === 'exclude' ? 'red' : 'green'}
                          style={{ cursor: enableDataFilter ? 'pointer' : 'not-allowed', opacity: enableDataFilter ? 1 : 0.5, minWidth: isMobile ? 50 : 60, textAlign: 'center', marginRight: 0 }}
                          onClick={() => {
                            if (!enableDataFilter) return;
                            form.setFieldsValue({ board_filter_mode: mode === 'exclude' ? 'include' : 'exclude' });
                          }}
                        >
                          {mode === 'exclude' ? '排除' : '只保留'}
                        </Tag>
                      </Tooltip>
                    );
                  }}
                </Form.Item>
                <Form.Item name="board_filter_mode" hidden initialValue="exclude"><input /></Form.Item>
                <Form.Item name="filter_st" valuePropName="checked" style={{ marginBottom: 0 }} initialValue={true}>
                  <Checkbox disabled={!enableDataFilter}>
                    <Tooltip title="ST、*ST等被特别处理的股票">
                      <span style={{ cursor: 'help' }}>ST股</span>
                    </Tooltip>
                  </Checkbox>
                </Form.Item>
                <Form.Item name="filter_chinext" valuePropName="checked" style={{ marginBottom: 0 }} initialValue={false}>
                  <Checkbox disabled={!enableDataFilter}>
                    <Tooltip title="开通条件：最近20个交易日日均资产≥10万元，参与证券交易≥24个月">
                      <span style={{ cursor: 'help' }}>创业板(300)</span>
                    </Tooltip>
                  </Checkbox>
                </Form.Item>
                <Form.Item name="filter_star" valuePropName="checked" style={{ marginBottom: 0 }} initialValue={false}>
                  <Checkbox disabled={!enableDataFilter}>
                    <Tooltip title="开通条件：最近20个交易日日均资产≥50万元，参与证券交易≥24个月">
                      <span style={{ cursor: 'help' }}>科创板(688)</span>
                    </Tooltip>
                  </Checkbox>
                </Form.Item>
                <Form.Item name="filter_bse" valuePropName="checked" style={{ marginBottom: 0 }} initialValue={false}>
                  <Checkbox disabled={!enableDataFilter}>
                    <Tooltip title="开通条件：最近20个交易日日均资产≥50万元，参与证券交易≥24个月">
                      <span style={{ cursor: 'help' }}>北交所(43/83/87/920)</span>
                    </Tooltip>
                  </Checkbox>
                </Form.Item>
              </Space>
            )}
          </Space>
        </div>
      )}

      {/* ==================== 量模块 ==================== */}
      <div style={{
        border: `1px solid ${isLight ? '#d9d9d9' : '#434343'}`,
        borderRadius: 6,
        padding: 12,
        marginBottom: 16,
        backgroundColor: isLight ? '#fafafa' : 'rgba(255,255,255,0.02)',
      }}>
        <Space size={12} align="center" style={{ marginBottom: 8 }}>
          <Typography.Text strong style={{ fontSize: 14 }}>
            量条件
          </Typography.Text>
          <Form.Item name="enable_volume" valuePropName="checked" style={{ marginBottom: 0 }} initialValue={false}>
            <Switch size="small" />
          </Form.Item>
        </Space>

        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {/* 数据源选择（多选+Tag切换） */}
          <Space size={4} align="center">
            <span style={{ minWidth: isMobile ? 50 : 56, fontSize: isMobile ? 12 : 14 }}>数据源</span>
            <Form.Item name="volume_source_match_mode" style={{ marginBottom: 0 }} initialValue="any">
              <Tag
                color={volumeSourceMatchMode === 'any' ? 'blue' : 'green'}
                style={{ cursor: enableVolume ? 'pointer' : 'not-allowed', margin: 0, opacity: enableVolume ? 1 : 0.5 }}
                onClick={() => {
                  if (!enableVolume) return;
                  form.setFieldValue('volume_source_match_mode', volumeSourceMatchMode === 'any' ? 'all' : 'any');
                }}
              >
                {volumeSourceMatchMode === 'any' ? '或' : '且'}
              </Tag>
            </Form.Item>
            <span>:</span>
            <Form.Item name="volume_sources" style={{ marginBottom: 0 }} initialValue={['auction']}>
              <Checkbox.Group
                disabled={!enableVolume}
                options={[
                  { label: '竞价量', value: 'auction', disabled: !isStock },
                  { label: '成交量', value: 'daily' },
                ]}
              />
            </Form.Item>
          </Space>
          {/* 基础参数 */}
          {!isMobile && (
            <Typography.Text style={{ fontSize: 13, color: '#8c8c8c', display: 'block' }}>
              数据源满足：当前量是窗口N内平均值的x倍及以上
            </Typography.Text>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobile ? 8 : 16, alignItems: 'center' }}>
            <Space size={4} align="center">
              <Tooltip title="计算平均量的窗口周期数">
                <span style={{ minWidth: isMobile ? 50 : 56, cursor: 'help', borderBottom: '1px dashed #999' }}>窗口N:</span>
              </Tooltip>
              <Form.Item name="window_n" style={{ marginBottom: 0 }}>
                <InputNumber
                  min={1}
                  max={365}
                  step={1}
                  style={{ width: isMobile ? 70 : 80 }}
                  placeholder="1-365"
                  disabled={!enableVolume}
                />
              </Form.Item>
            </Space>
            <Space size={4} align="center">
              <Tooltip title="当前量≥平均量×倍数才通过">
                <span style={{ minWidth: isMobile ? 50 : 56, cursor: 'help', borderBottom: '1px dashed #999' }}>倍数X:</span>
              </Tooltip>
              <Form.Item name="volume_multiple" style={{ marginBottom: 0 }}>
                <InputNumber
                  min={1}
                  step={1}
                  style={{ width: isMobile ? 70 : 80 }}
                  placeholder="1"
                  disabled={!enableVolume}
                />
              </Form.Item>
            </Space>
            <Space size={4} align="center">
              <Tooltip title="排除N周期内首次出现爆量的标的">
                <span style={{ fontSize: isMobile ? 12 : 14, cursor: 'help', borderBottom: '1px dashed #999' }}>排除首次爆量:</span>
              </Tooltip>
              <Form.Item name="exclude_first_burst" style={{ marginBottom: 0 }}>
                <InputNumber
                  min={1}
                  max={365}
                  style={{ width: isMobile ? 70 : 70 }}
                  placeholder="5"
                  disabled={!enableVolume}
                />
              </Form.Item>
            </Space>
            <Space size={4} align="center">
              <Tooltip title="排除成交量低于历史平均值x%的标的">
                <span style={{ fontSize: isMobile ? 12 : 14, cursor: 'help', borderBottom: '1px dashed #999' }}>排除低于均%:</span>
              </Tooltip>
              <Form.Item name="exclude_low_avg_percent" style={{ marginBottom: 0 }}>
                <InputNumber
                  min={0}
                  max={100}
                  step={1}
                  style={{ width: isMobile ? 70 : 70 }}
                  placeholder="%"
                  disabled={!enableVolume}
                />
              </Form.Item>
            </Space>
          </div>

        </Space>
      </div>

      {/* ==================== 价条件（波动率筛选） ==================== */}
      <div style={{
        border: `1px solid ${isLight ? '#d9d9d9' : '#434343'}`,
        borderRadius: 6,
        padding: 12,
        marginBottom: 16,
        backgroundColor: isLight ? '#fafafa' : 'rgba(255,255,255,0.02)',
      }}>
        <Typography.Text strong style={{ fontSize: 14, marginBottom: 8, display: 'block' }}>
          价条件
        </Typography.Text>

        {/* 条件1：振幅筛选 */}
        <div style={{ marginBottom: isMobile ? 8 : 12 }}>
          <Space size={isMobile ? 8 : 12} align="center" style={{ marginBottom: 8 }}>
            <Typography.Text strong style={{ fontSize: isMobile ? 13 : 14 }}>
              {isMobile ? '条件1: 振幅筛选' : '条件1：振幅筛选'}
            </Typography.Text>
            <Form.Item name="enable_price" valuePropName="checked" style={{ marginBottom: 0 }} initialValue={false}>
              <Switch size="small" />
            </Form.Item>
          </Space>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobile ? 8 : 16, alignItems: 'center' }}>
            <Space size={4} align="center">
              <Tooltip title="计算平均振幅的窗口天数">
                <span style={{ fontSize: isMobile ? 12 : 14, cursor: 'help', borderBottom: '1px dashed #999' }}>窗口:</span>
              </Tooltip>
              <Form.Item name="amplitude_days_window" style={{ marginBottom: 0 }} initialValue={20}>
                <InputNumber
                  min={1}
                  max={100}
                  style={{ width: isMobile ? 60 : 70 }}
                  placeholder="20"
                  disabled={!enablePrice}
                />
              </Form.Item>
            </Space>
            <Space size={4} align="center">
              <Tooltip title="窗口期内平均振幅>阈值才通过">
                <span style={{ fontSize: isMobile ? 12 : 14, cursor: 'help', borderBottom: '1px dashed #999' }}>最小振幅%:</span>
              </Tooltip>
              <Form.Item name="min_avg_amplitude" style={{ marginBottom: 0 }} initialValue={2.0}>
                <InputNumber
                  min={0.5}
                  max={20}
                  step={0.5}
                  style={{ width: isMobile ? 60 : 70 }}
                  placeholder="2.0"
                  disabled={!enablePrice}
                />
              </Form.Item>
            </Space>
          </div>
          {!isMobile && (
            <Typography.Text style={{ fontSize: 12, color: '#8c8c8c', display: 'block', marginTop: 4 }}>
              振幅 = (最高价 - 最低价) / 收盘价 × 100%，排除低波动标的
            </Typography.Text>
          )}
        </div>

        {/* 条件2：涨停筛选 */}
        <div style={{ marginTop: 16 }}>
          <Space size={isMobile ? 8 : 12} align="center" style={{ marginBottom: 8 }}>
            <Typography.Text strong style={{ fontSize: isMobile ? 13 : 14 }}>
              {isMobile ? '条件2: 涨停筛选' : '条件2：涨停筛选'}
            </Typography.Text>
            <Form.Item name="enable_limit_up_filter" valuePropName="checked" style={{ marginBottom: 0 }} initialValue={false}>
              <Switch size="small" />
            </Form.Item>
          </Space>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobile ? 8 : 16, alignItems: 'center' }}>
            <Space size={4} align="center">
              <Tooltip title="筛选最近x天内涨停次数>=n的标的">
                <span style={{ fontSize: isMobile ? 12 : 14, cursor: 'help', borderBottom: '1px dashed #999' }}>最近</span>
              </Tooltip>
              <Form.Item name="limit_up_days_window" style={{ marginBottom: 0 }} initialValue={250}>
                <InputNumber
                  min={1}
                  max={500}
                  style={{ width: isMobile ? 65 : 75 }}
                  placeholder="250"
                  disabled={!enableLimitUpFilter}
                />
              </Form.Item>
              <span style={{ fontSize: isMobile ? 12 : 14 }}>天涨停次数 ≥</span>
              <Form.Item name="min_limit_up_count" style={{ marginBottom: 0 }} initialValue={1}>
                <InputNumber
                  min={1}
                  max={100}
                  style={{ width: isMobile ? 55 : 60 }}
                  placeholder="1"
                  disabled={!enableLimitUpFilter}
                />
              </Form.Item>
              <span style={{ fontSize: isMobile ? 12 : 14 }}>次</span>
            </Space>
          </div>
        </div>
      </div>

      {/* ==================== 趋势模块 ==================== */}
      <div style={{
        border: `1px solid ${isLight ? '#d9d9d9' : '#434343'}`,
        borderRadius: 6,
        padding: 12,
        marginBottom: 16,
        backgroundColor: isLight ? '#fafafa' : 'rgba(255,255,255,0.02)'
      }}>
        {!isMobile && (
          <Typography.Text strong style={{ fontSize: 14, marginBottom: 8, display: 'block' }}>
            趋势条件（a1=5周期 a2=10周期 a3=20周期 a4=60周期 a5=250周期）
          </Typography.Text>
        )}
        {isMobile && (
          <Typography.Text style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 8, display: 'block' }}>
            a1=5 a2=10 a3=20 a4=60 a5=250
          </Typography.Text>
        )}

        {/* 条件1：ab序列单调性约束（独立涨跌选择） */}
        <div style={{ marginBottom: isMobile ? 8 : 12 }}>
          <Space size={isMobile ? 8 : 12} align="center" style={{ marginBottom: 8 }}>
            <Typography.Text strong style={{ fontSize: isMobile ? 13 : 14 }}>
              {isMobile ? '条件1: M周期ab单调' : '条件1：最近M个周期内，ab单调性约束'}
            </Typography.Text>
            <Form.Item name="enable_trend_m" valuePropName="checked" style={{ marginBottom: 0 }} initialValue={false}>
              <Switch size="small" />
            </Form.Item>
          </Space>
          {/* 窗口M + 单调性同行 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobile ? 8 : 16, alignItems: 'center', marginBottom: 8 }}>
            <Space size={4} align="center">
              <Tooltip title="检查最近M个周期的均线走势">
                <span style={{ cursor: 'help', borderBottom: '1px dashed #999' }}>M:</span>
              </Tooltip>
              <Form.Item name="m_days" style={{ marginBottom: 0 }}>
                <InputNumber
                  style={{ width: isMobile ? 60 : 70 }}
                  placeholder="3-90"
                  min={3}
                  max={90}
                  precision={0}
                  disabled={!enableTrendM}
                />
              </Form.Item>
            </Space>
            <Space size={4} align="center">
              <Tooltip title="趋势=首尾比较；严格=每天递增/递减">
                <span style={{ cursor: 'help', borderBottom: '1px dashed #999' }}>单调:</span>
              </Tooltip>
              <Form.Item name="monotonic_type" style={{ marginBottom: 0 }} initialValue="trend">
                <Segmented
                  size={isMobile ? 'small' : 'middle'}
                  options={[
                    { label: '趋势', value: 'trend' },
                    { label: '严格', value: 'strict' },
                  ]}
                  disabled={!enableTrendM}
                />
              </Form.Item>
            </Space>
          </div>
          {/* ab序列独立涨跌选择 + 匹配模式Tag */}
          <div style={{ marginBottom: 4 }}>
            <Space size={4} style={{ width: '100%' }} wrap align="center">
              <span style={{ minWidth: isMobile ? 24 : 40, flexShrink: 0 }}>涨</span>
              <Form.Item name="ab_up_series_match_mode" style={{ marginBottom: 0 }} initialValue="any">
                <Tag
                  color={abUpSeriesMatchMode === 'any' ? 'blue' : 'green'}
                  style={{ cursor: enableTrendM ? 'pointer' : 'not-allowed', margin: 0, opacity: enableTrendM ? 1 : 0.5 }}
                  onClick={() => {
                    if (!enableTrendM) return;
                    form.setFieldValue('ab_up_series_match_mode', abUpSeriesMatchMode === 'any' ? 'all' : 'any');
                  }}
                >
                  {abUpSeriesMatchMode === 'any' ? '或' : '且'}
                </Tag>
              </Form.Item>
              <span>:</span>
              <Form.Item name="ab_up_series" style={{ marginBottom: 0 }}>
                <Checkbox.Group
                  disabled={!enableTrendM}
                  options={[
                    { label: 'a1', value: 'a1' },
                    { label: 'a2', value: 'a2' },
                    { label: 'a3', value: 'a3' },
                    { label: 'a4', value: 'a4' },
                    { label: 'a5', value: 'a5' }
                  ]}
                />
              </Form.Item>
            </Space>
          </div>
          <div>
            <Space size={4} style={{ width: '100%' }} wrap align="center">
              <span style={{ minWidth: isMobile ? 24 : 40, flexShrink: 0 }}>跌</span>
              <Form.Item name="ab_down_series_match_mode" style={{ marginBottom: 0 }} initialValue="any">
                <Tag
                  color={abDownSeriesMatchMode === 'any' ? 'blue' : 'green'}
                  style={{ cursor: enableTrendM ? 'pointer' : 'not-allowed', margin: 0, opacity: enableTrendM ? 1 : 0.5 }}
                  onClick={() => {
                    if (!enableTrendM) return;
                    form.setFieldValue('ab_down_series_match_mode', abDownSeriesMatchMode === 'any' ? 'all' : 'any');
                  }}
                >
                  {abDownSeriesMatchMode === 'any' ? '或' : '且'}
                </Tag>
              </Form.Item>
              <span>:</span>
              <Form.Item name="ab_down_series" style={{ marginBottom: 0 }}>
                <Checkbox.Group
                  disabled={!enableTrendM}
                  options={[
                    { label: 'a1', value: 'a1' },
                    { label: 'a2', value: 'a2' },
                    { label: 'a3', value: 'a3' },
                    { label: 'a4', value: 'a4' },
                    { label: 'a5', value: 'a5' }
                  ]}
                />
              </Form.Item>
            </Space>
          </div>
        </div>

        {/* 条件2：EXPMA偏离筛选 */}
        <div style={{ marginBottom: 0, marginTop: 16 }}>
          <Space size={isMobile ? 8 : 12} align="center" style={{ marginBottom: 8 }}>
            <Typography.Text strong style={{ fontSize: isMobile ? 13 : 14 }}>
              {isMobile ? '条件2: EXPMA偏离' : '条件2：EXPMA偏离筛选'}
            </Typography.Text>
            <Form.Item name="enable_trend_cross" valuePropName="checked" style={{ marginBottom: 0 }} initialValue={false}>
              <Switch size="small" />
            </Form.Item>
          </Space>
          {/* EXPMA周期 + 价格类型 同一行 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobile ? 8 : 16, alignItems: 'center', marginBottom: 8 }}>
            <Space size={4} align="center">
              <span>EXPMA</span>
              <Form.Item name="cross_expma_match_mode" style={{ marginBottom: 0 }} initialValue="any">
                <Tag
                  color={crossExpmaMatchMode === 'any' ? 'blue' : 'green'}
                  style={{ cursor: enableTrendCross ? 'pointer' : 'not-allowed', margin: 0, opacity: enableTrendCross ? 1 : 0.5 }}
                  onClick={() => {
                    if (!enableTrendCross) return;
                    form.setFieldValue('cross_expma_match_mode', crossExpmaMatchMode === 'any' ? 'all' : 'any');
                  }}
                >
                  {crossExpmaMatchMode === 'any' ? '或' : '且'}
                </Tag>
              </Form.Item>
              <span>:</span>
              <Form.Item name="cross_expma_periods" style={{ marginBottom: 0 }} initialValue={[250]}>
                <Checkbox.Group
                  disabled={!enableTrendCross}
                  options={[
                    { label: 'a4', value: 60 },
                    { label: 'a5', value: 250 },
                  ]}
                />
              </Form.Item>
            </Space>
            <Space size={4} align="center">
              <span>价格</span>
              <Form.Item name="cross_price_match_mode" style={{ marginBottom: 0 }} initialValue="any">
                <Tag
                  color={crossPriceMatchMode === 'any' ? 'blue' : 'green'}
                  style={{ cursor: enableTrendCross ? 'pointer' : 'not-allowed', margin: 0, opacity: enableTrendCross ? 1 : 0.5 }}
                  onClick={() => {
                    if (!enableTrendCross) return;
                    form.setFieldValue('cross_price_match_mode', crossPriceMatchMode === 'any' ? 'all' : 'any');
                  }}
                >
                  {crossPriceMatchMode === 'any' ? '或' : '且'}
                </Tag>
              </Form.Item>
              <span>:</span>
              <Form.Item name="cross_price_types" style={{ marginBottom: 0 }} initialValue={['close']}>
                <Checkbox.Group
                  disabled={!enableTrendCross}
                  options={[
                    { label: '开', value: 'open' },
                    { label: '高', value: 'high' },
                    { label: '收', value: 'close' },
                    { label: '低', value: 'low' },
                  ]}
                />
              </Form.Item>
            </Space>
          </div>
          {/* 窗口 + 偏离阈值 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobile ? 8 : 16, alignItems: 'center' }}>
            <Space size={4} align="center">
              <Tooltip title="在最近N天内存在一天满足偏离条件即可">
                <span style={{ cursor: 'help', borderBottom: '1px dashed #999' }}>窗口:</span>
              </Tooltip>
              <Form.Item name="cross_days_window" style={{ marginBottom: 0 }} initialValue={5}>
                <InputNumber
                  min={1}
                  max={365}
                  step={1}
                  style={{ width: isMobile ? 55 : 55 }}
                  disabled={!enableTrendCross}
                />
              </Form.Item>
            </Space>
            <Space size={4} align="center">
              <Tooltip title="价格与EXPMA偏离度≤阈值才通过。或=窗口内任一天满足即可，且=窗口内所有天都要满足">
                <span style={{ cursor: 'help', borderBottom: '1px dashed #999' }}>偏离阈值:</span>
              </Tooltip>
              <Form.Item name="cross_threshold" style={{ marginBottom: 0 }} initialValue={2}>
                <InputNumber
                  min={1}
                  max={50}
                  step={1}
                  precision={0}
                  style={{ width: isMobile ? 60 : 60 }}
                  disabled={!enableTrendCross}
                />
              </Form.Item>
              <span>%</span>
              <Form.Item name="cross_threshold_match_mode" style={{ marginBottom: 0 }} initialValue="any">
                <Tag
                  color={crossThresholdMatchMode === 'any' ? 'blue' : 'green'}
                  style={{ cursor: enableTrendCross ? 'pointer' : 'not-allowed', margin: 0, opacity: enableTrendCross ? 1 : 0.5 }}
                  onClick={() => {
                    if (!enableTrendCross) return;
                    form.setFieldValue('cross_threshold_match_mode', crossThresholdMatchMode === 'any' ? 'all' : 'any');
                  }}
                >
                  {crossThresholdMatchMode === 'any' ? '或' : '且'}
                </Tag>
              </Form.Item>
            </Space>
          </div>
        </div>

        {/* 条件3：趋势收敛 */}
        <div style={{ marginBottom: 0, marginTop: 16 }}>
          <Space size={isMobile ? 8 : 12} align="center" style={{ marginBottom: 8 }}>
            <Typography.Text strong style={{ fontSize: isMobile ? 13 : 14 }}>
              {isMobile ? '条件3: 趋势收敛' : '条件3：趋势收敛'}
            </Typography.Text>
            <Form.Item name="enable_trend_converge" valuePropName="checked" style={{ marginBottom: 0 }} initialValue={false}>
              <Switch size="small" />
            </Form.Item>
          </Space>
          {/* 第1行：线对选择 */}
          <div style={{ marginBottom: 8 }}>
            <Space size={isMobile ? 8 : 16} align="center" wrap>
              <Space size={4} align="center">
                <Tooltip title="选择要检查的均线线对组合">
                  <span style={{ cursor: 'help', borderBottom: '1px dashed #999' }}>线对</span>
                </Tooltip>
                <Form.Item name="converge_line_pair_match_mode" style={{ marginBottom: 0 }} initialValue="any">
                  <Tag
                    color={convergeLinePairMatchMode === 'any' ? 'blue' : 'green'}
                    style={{ cursor: enableTrendConverge ? 'pointer' : 'not-allowed', margin: 0, opacity: enableTrendConverge ? 1 : 0.5 }}
                    onClick={() => {
                      if (!enableTrendConverge) return;
                      form.setFieldValue('converge_line_pair_match_mode', convergeLinePairMatchMode === 'any' ? 'all' : 'any');
                    }}
                  >
                    {convergeLinePairMatchMode === 'any' ? '或' : '且'}
                  </Tag>
                </Form.Item>
                <span>:</span>
                <Form.Item name="converge_line_pairs" style={{ marginBottom: 0 }} initialValue={['a', 'b']}>
                  <Checkbox.Group
                    disabled={!enableTrendConverge}
                    options={[
                      { label: 'a1/a3', value: 'a' },
                      { label: 'a3/a4', value: 'b' },
                      { label: 'a4/a5', value: 'c' },
                    ]}
                  />
                </Form.Item>
              </Space>
            </Space>
          </div>
          {/* 第2行：趋势类型 + 不交叉 */}
          <div style={{ marginBottom: 8 }}>
            <Space size={isMobile ? 8 : 16} align="center" wrap>
              <Space size={4} align="center">
                <Tooltip title="多头收敛=长线涨+差值减小；空头收敛=长线跌+差值增大">
                  <span style={{ cursor: 'help', borderBottom: '1px dashed #999' }}>趋势</span>
                </Tooltip>
                <Form.Item name="converge_trend_match_mode" style={{ marginBottom: 0 }} initialValue="any">
                  <Tag
                    color={convergeTrendMatchMode === 'any' ? 'blue' : 'green'}
                    style={{ cursor: enableTrendConverge ? 'pointer' : 'not-allowed', margin: 0, opacity: enableTrendConverge ? 1 : 0.5 }}
                    onClick={() => {
                      if (!enableTrendConverge) return;
                      form.setFieldValue('converge_trend_match_mode', convergeTrendMatchMode === 'any' ? 'all' : 'any');
                    }}
                  >
                    {convergeTrendMatchMode === 'any' ? '或' : '且'}
                  </Tag>
                </Form.Item>
                <span>:</span>
                <Form.Item name="converge_trend_types" style={{ marginBottom: 0 }} initialValue={['type1']}>
                  <Checkbox.Group
                    disabled={!enableTrendConverge}
                    options={[
                      { label: '多头收敛', value: 'type1' },
                      { label: '空头收敛', value: 'type2' },
                    ]}
                  />
                </Form.Item>
              </Space>
              <Space size={4} align="center">
                <Tooltip title="窗口期内均线不发生交叉（差值保持同号）">
                  <span style={{ cursor: 'help', borderBottom: '1px dashed #999' }}>不交叉:</span>
                </Tooltip>
                <Form.Item name="converge_diff_positive" valuePropName="checked" style={{ marginBottom: 0 }} initialValue={false}>
                  <Switch size="small" disabled={!enableTrendConverge} />
                </Form.Item>
              </Space>
            </Space>
          </div>
          {/* 第3行：窗口 + 单调 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobile ? 8 : 16, alignItems: 'center' }}>
            <Space size={4} align="center">
              <Tooltip title="检查最近N天的趋势，用于判断单调性">
                <span style={{ cursor: 'help', borderBottom: '1px dashed #999' }}>窗口:</span>
              </Tooltip>
              <Form.Item name="converge_window" style={{ marginBottom: 0 }} initialValue={5}>
                <InputNumber
                  min={2}
                  max={60}
                  step={1}
                  style={{ width: isMobile ? 55 : 55 }}
                  disabled={!enableTrendConverge}
                />
              </Form.Item>
            </Space>
            <Space size={4} align="center">
              <Tooltip title="趋势=首尾比较；严格=每天递增/递减">
                <span style={{ cursor: 'help', borderBottom: '1px dashed #999' }}>单调:</span>
              </Tooltip>
              <Form.Item name="converge_monotonic_type" style={{ marginBottom: 0 }} initialValue="trend">
                <Segmented
                  size={isMobile ? 'small' : 'middle'}
                  options={[
                    { label: '趋势', value: 'trend' },
                    { label: '严格', value: 'strict' },
                  ]}
                  disabled={!enableTrendConverge}
                />
              </Form.Item>
            </Space>
          </div>
        </div>

      </div>
    </>
  );
};
