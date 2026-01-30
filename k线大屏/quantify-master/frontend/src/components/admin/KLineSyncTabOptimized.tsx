import React, { useCallback, useEffect } from 'react';
import { Row, Col, Checkbox, Button, Progress, Select, Divider, DatePicker, message } from 'antd';
import dayjs from 'dayjs';
import SearchSelect from '../SearchSelect.tsx';

const { RangePicker } = DatePicker;

interface OptionItem {
  label: string;
  value: string;
}

interface ExecutionState {
  progress?: number;
  message?: string;
  current?: number;
  total?: number;
  status?: string;
}

type Period = 'daily' | 'weekly' | 'monthly';
type SyncMode = 'incremental' | 'full' | 'range';
type DeleteScope = 'range' | 'full_periods' | 'all';

interface KLineSyncTabOptimizedProps {
  // 数据类型
  activeTab?: 'stock' | 'convertible_bond' | 'concept' | 'industry';
  onChangeTab?: (tab: 'stock' | 'convertible_bond' | 'concept' | 'industry') => void;

  // 日期范围
  dateRange?: [dayjs.Dayjs, dayjs.Dayjs] | null;
  setDateRange?: (range: [dayjs.Dayjs, dayjs.Dayjs] | null) => void;
  placeholder: string;
  fetchOptions: (keyword: string) => Promise<OptionItem[]>;
  selectedValues: string[];
  selectedNames: Record<string, string>;
  onChangeSelected: (values: string[], names: Record<string, string>) => void;

  allSelected: boolean;
  setAllSelected: (value: boolean) => void;

  periods: Period[];
  setPeriods: (values: Period[]) => void;

  syncing: boolean;
  onClickSync: () => void;
  onCancelTask?: () => void;
  execution: ExecutionState | undefined;

  // 同步模式
  syncMode?: SyncMode;
  setSyncMode?: (mode: SyncMode) => void;

  // 同步数据类型
  syncKline?: boolean;
  setSyncKline?: (sync: boolean) => void;

  // 竞价数据相关（仅股票tab使用）
  syncAuction?: boolean;
  setSyncAuction?: (value: boolean) => void;
  showAuctionCheckbox?: boolean;

  // 删除功能
  deleteScope?: DeleteScope;
  setDeleteScope?: (scope: DeleteScope) => void;
  includeBasic?: boolean;
  setIncludeBasic?: (include: boolean) => void;
  onClickDelete?: () => void;
  deleting?: boolean;
  readOnly?: boolean;
}

const KLineSyncTabOptimized: React.FC<KLineSyncTabOptimizedProps> = ({
  activeTab,
  onChangeTab,
  dateRange,
  setDateRange,
  placeholder,
  fetchOptions,
  selectedValues,
  selectedNames,
  onChangeSelected,
  allSelected,
  setAllSelected,
  periods,
  setPeriods,
  syncing,
  onClickSync,
  onCancelTask,
  execution,
  syncMode = 'incremental',
  setSyncMode,
  syncKline = true,
  setSyncKline,
  syncAuction = false,
  setSyncAuction,
  showAuctionCheckbox = false,
  deleteScope = 'range',
  setDeleteScope,
  includeBasic = false,
  setIncludeBasic,
  onClickDelete,
  deleting = false,
  readOnly = false,
}) => {
  const hasSelection = selectedValues.length > 0 || allSelected;
  const isStockTab = activeTab === 'stock';
  const hasSyncData = syncKline || syncAuction;
  const canSyncAuction = isStockTab && periods.includes('daily');
  const hasAllPeriods = periods.includes('daily') && periods.includes('weekly') && periods.includes('monthly');
  const needDateRange = syncMode === 'range' || deleteScope === 'range';
  const isAuctionOnly = isStockTab && !!syncAuction && !syncKline;

  const executionStatus = execution?.status;
  const isExecuting = !!executionStatus && ['running', 'pending', 'cancelling'].includes(executionStatus);

  useEffect(() => {
    if (!isAuctionOnly) return;
    if (periods.length !== 1 || periods[0] !== 'daily') {
      setPeriods(['daily']);
    }
  }, [isAuctionOnly, periods, setPeriods]);

  // 自动补齐日期范围到完整自然周/月
  const autoExpandDateRange = useCallback((inputStart: dayjs.Dayjs, inputEnd: dayjs.Dayjs, targetPeriods: Period[]): [dayjs.Dayjs, dayjs.Dayjs, boolean] => {
    let start = inputStart;
    let end = inputEnd;
    const today = dayjs();
    let adjusted = false;

    // 周线补齐
    if (targetPeriods.includes('weekly')) {
      const curWeekStart = today.startOf('week');
      const weekStart = (d: dayjs.Dayjs) => d.startOf('week');
      const weekEnd = (d: dayjs.Dayjs) => d.endOf('week');

      // 开始日期补齐到周一
      const newStart = weekStart(start);
      if (!start.isSame(newStart, 'day')) {
        start = newStart;
        adjusted = true;
      }

      // 结束日期补齐：如果在当周，补到今天；如果在历史周，补到周日
      if (end.isBefore(curWeekStart, 'day')) {
        // 历史周：补到周日
        const newEnd = weekEnd(end);
        if (!end.isSame(newEnd, 'day')) {
          end = newEnd;
          adjusted = true;
        }
      } else if (end.isBefore(today, 'day')) {
        // 当周但不是今天：补到今天
        end = today;
        adjusted = true;
      }
    }

    // 月线补齐
    if (targetPeriods.includes('monthly')) {
      const curMonthStart = today.startOf('month');
      const monthStart = (d: dayjs.Dayjs) => d.startOf('month');
      const monthEnd = (d: dayjs.Dayjs) => d.endOf('month');

      // 开始日期补齐到月初
      const newStart = monthStart(start);
      if (!start.isSame(newStart, 'day')) {
        start = newStart;
        adjusted = true;
      }

      // 结束日期补齐：如果在当月，补到今天；如果在历史月，补到月末
      if (end.isBefore(curMonthStart, 'day')) {
        // 历史月：补到月末
        const newEnd = monthEnd(end);
        if (!end.isSame(newEnd, 'day')) {
          end = newEnd;
          adjusted = true;
        }
      } else if (end.isBefore(today, 'day')) {
        // 当月但不是今天：补到今天
        end = today;
        adjusted = true;
      }
    }

    if (adjusted) {
      message.info(`已自动扩展为完整自然周/月：${start.format('YYYY-MM-DD')} ~ ${end.format('YYYY-MM-DD')}`, 3);
    }

    return [start, end, adjusted];
  }, []);

  // 周期变化处理
  const handlePeriodChange = useCallback((vals: Period[]) => {
    const prevPeriods = periods;
    const newPeriods = vals;

    if (isAuctionOnly) {
      if (!newPeriods.includes('daily')) {
        if (setSyncAuction) setSyncAuction(false);
        setPeriods(newPeriods);
        return;
      }
      setPeriods(['daily']);
      return;
    }

    // 特殊处理：取消日线时，自动取消竞价数据
    if (isStockTab && prevPeriods.includes('daily') && !newPeriods.includes('daily') && setSyncAuction) {
      setSyncAuction(false);
    }

    // 检查是否新勾选了周线或月线，且已经有日期范围，自动补齐
    const weeklyJustChecked = !prevPeriods.includes('weekly') && newPeriods.includes('weekly');
    const monthlyJustChecked = !prevPeriods.includes('monthly') && newPeriods.includes('monthly');

    if ((weeklyJustChecked || monthlyJustChecked) && dateRange && dateRange.length === 2 && setDateRange) {
      const [newStart, newEnd, adjusted] = autoExpandDateRange(dateRange[0], dateRange[1], newPeriods);
      if (adjusted) {
        setDateRange([newStart, newEnd]);
      }
    }

    setPeriods(newPeriods);
  }, [periods, isAuctionOnly, dateRange, setDateRange, setSyncAuction, isStockTab, setPeriods, autoExpandDateRange]);

  const handleAuctionChange = useCallback((checked: boolean) => {
    if (!setSyncAuction) return;
    setSyncAuction(checked);
    // 仅竞价模式：强制周期为日线
    if (isStockTab && checked && !syncKline) {
      setPeriods(['daily']);
    }
  }, [setSyncAuction, isStockTab, syncKline, setPeriods]);

  // 日期范围变化处理：如果已勾选周线/月线，自动补齐
  const handleDateRangeChange = useCallback((dates: [dayjs.Dayjs, dayjs.Dayjs] | null) => {
    if (!setDateRange) return;

    if (dates && dates.length === 2 && (periods.includes('weekly') || periods.includes('monthly'))) {
      const [newStart, newEnd, adjusted] = autoExpandDateRange(dates[0], dates[1], periods);
      if (adjusted) {
        setDateRange([newStart, newEnd]);
        return;
      }
    }

    setDateRange(dates);
  }, [setDateRange, periods, autoExpandDateRange]);

  return (
    <div>
      {/* 搜索选择区 */}
      <div style={{
        padding: '16px',
        backgroundColor: '#fafafa',
        borderRadius: '6px',
        border: '1px solid #e8e8e8'
      }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <SearchSelect
              placeholder={placeholder}
              fetchOptions={fetchOptions}
              selectedValues={selectedValues}
              selectedNames={selectedNames as any}
              onChangeSelected={onChangeSelected as any}
            />
          </div>
          <Checkbox
            style={{ marginTop: 2 }}
            checked={allSelected}
            onChange={(e) => setAllSelected(e.target.checked)}
          >
            全选
          </Checkbox>
        </div>

        {/* 功能区：常驻显示（无选择时禁用按钮） */}
        <>
          <Divider style={{ margin: '16px 0 12px 0' }} />

          {!hasSelection && (
            <div style={{ fontSize: 12, color: '#999', marginBottom: 10 }}>
              请先在上方选择标的或勾选“全选”，再执行同步/删除。
            </div>
          )}

          {/* 周期选择行 + 日期范围（公用） */}
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>K线周期</span>
            <Checkbox.Group
              value={periods}
              onChange={(vals) => handlePeriodChange(vals as Period[])}
            >
              <Checkbox value="daily">日线</Checkbox>
              <Checkbox value="weekly" disabled={isAuctionOnly}>周线</Checkbox>
              <Checkbox value="monthly" disabled={isAuctionOnly}>月线</Checkbox>
            </Checkbox.Group>

            {/* 日期范围 - 仅在需要时显示 */}
            {needDateRange && setDateRange && (
              <>
                <span style={{ fontSize: 13, color: '#999' }}>|</span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>日期范围</span>
                <RangePicker
                  value={dateRange}
                  onChange={(dates) => handleDateRangeChange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}
                  format="YYYY-MM-DD"
                  placeholder={['开始日期', '结束日期']}
                  size="small"
                  style={{ width: 240 }}
                  disabledDate={(current) => {
                    // 禁用未来日期
                    return current && current > dayjs().endOf('day');
                  }}
                />
              </>
            )}
          </div>

          {/* 同步功能行 */}
          <div style={{
            padding: '10px 12px',
            backgroundColor: '#fafafa',
            borderRadius: 4,
            border: '1px solid #e8e8e8',
            marginBottom: 8
          }}>
            <Row gutter={12} align="middle">
              <Col flex="auto">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#333' }}>同步</span>

                  {/* 数据类型选择 - 可独立选择 */}
                  {setSyncKline && (
                    <Checkbox checked={syncKline} onChange={(e) => setSyncKline(e.target.checked)}>K线</Checkbox>
                  )}
                  {setSyncAuction && (
                    <Checkbox
                      checked={syncAuction}
                      disabled={!canSyncAuction}
                      onChange={(e) => handleAuctionChange(e.target.checked)}
                    >
                      竞价
                    </Checkbox>
                  )}

                  {/* 同步模式 */}
                  {setSyncMode && (
                    <Select
                      value={syncMode}
                      onChange={setSyncMode}
                      size="small"
                      style={{ width: 80 }}
                      options={[
                        { label: '增量', value: 'incremental' },
                        { label: '全量', value: 'full' },
                        { label: '范围', value: 'range' }
                      ]}
                    />
                  )}
                </div>
              </Col>
              <Col>
                <Button
                  type="primary"
                  loading={syncing || isExecuting}
                  onClick={onClickSync}
                  disabled={readOnly || !hasSelection || isExecuting || periods.length === 0 || !hasSyncData || (syncMode === 'range' && (!dateRange || dateRange.length !== 2))}
                  size="small"
                >
                  {readOnly ? '无权操作' : ((syncing || isExecuting) ? '同步中...' : '同步')}
                </Button>
              </Col>
            </Row>

            {execution && (syncing || isExecuting) && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Progress
                      percent={execution.progress || 0}
                      status={executionStatus === 'failed' || executionStatus === 'error' || executionStatus === 'timeout' ? 'exception' : 'active'}
                      size="small"
                      format={(percent) => {
                        if (execution.current && execution.total) {
                          return `${execution.current}/${execution.total}`;
                        }
                        return `${percent}%`;
                      }}
                    />
                  </div>
                  {onCancelTask && executionStatus !== 'cancelling' && (
                    <Button
                      size="small"
                      danger
                      onClick={onCancelTask}
                      disabled={executionStatus === 'cancelling'}
                    >
                      取消
                    </Button>
                  )}
                </div>
                {execution.message && (
                  <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                    {execution.message}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 删除功能行 */}
          {onClickDelete && (
            <div style={{
              padding: '10px 12px',
              backgroundColor: '#fafafa',
              borderRadius: 4,
              border: '1px solid #e8e8e8'
            }}>
              <Row gutter={12} align="middle">
                <Col flex="auto">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#333' }}>删除</span>

                    {/* 删除范围选择 - 下拉（仅范围和全量） */}
                    {setDeleteScope && (
                      <Select
                        value={deleteScope === 'all' ? 'full_periods' : deleteScope}
                        onChange={(val) => setDeleteScope(val as DeleteScope)}
                        size="small"
                        style={{ width: 80 }}
                        options={[
                          { label: '范围', value: 'range' },
                          { label: '全量', value: 'full_periods' }
                        ]}
                      />
                    )}

                    {/* 基础数据选项 - 仅在选择所有周期且全量删除时显示 */}
                    {hasAllPeriods && deleteScope === 'full_periods' && setIncludeBasic && (
                      <Checkbox
                        checked={includeBasic}
                        onChange={(e) => setIncludeBasic(e.target.checked)}
                      >
                        基础数据
                      </Checkbox>
                    )}
                  </div>
                </Col>
                <Col>
                  <Button
                    danger
                    loading={deleting}
                    onClick={onClickDelete}
                    disabled={readOnly || periods.length === 0 || (deleteScope === 'range' && (!dateRange || dateRange.length !== 2))}
                    size="small"
                  >
                    {readOnly ? '无权操作' : (deleting ? '删除中...' : '删除')}
                  </Button>
                </Col>
              </Row>
            </div>
          )}
        </>
      </div>
      <div style={{ fontSize: '12px', color: '#999', marginTop: 8 }}>
        提示：全量同步会根据系统配置的默认月份范围执行，增量同步仅同步最近数据
      </div>
    </div>
  );
};

export default KLineSyncTabOptimized;
