import React from 'react';
import { Input, Switch } from 'antd';
import { ToolbarButton } from '../ToolbarButton.tsx';
import { useAppStore } from '../../../stores/useAppStore.ts';
import MobileUserAvatar from '../MobileUserAvatar.tsx';
import {
  INDICATOR_OPTIONS,
  OVERLAY_INDICATOR_OPTIONS,
  DATA_TYPE_OPTIONS,
  PERIOD_OPTIONS,
  TIME_RANGE_OPTIONS,
  getSortOptions,
  type IndicatorType,
  type DataType,
  type Period,
} from '../constants.ts';
import { useStrategiesMeta } from '../../../strategies/useStrategiesMeta.ts';
import { getThemeColors, type Theme } from '../theme.ts';

const { Search } = Input;

interface MobileToolbarProps {
  theme: Theme;
  currentTheme: ReturnType<typeof getThemeColors>;
  dataType: DataType;
  currentFavoriteGroup?: string; // 🚀 自选分组名称
  searchKeyword: string;
  setSearchKeyword: (value: string) => void;
  setCurrentPage: (page: number) => void;
  period: Period;
  timeRange: number | string;
  indicator: IndicatorType;
  mainOverlays: Array<'ma' | 'expma' | 'boll' | 'sar' | 'td'>;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  tradeDate: string;
  displayTradeDate?: string;
  setDataTypeDrawerVisible: (visible: boolean) => void;
  setSortDrawerVisible: (visible: boolean) => void;
  setPeriodDrawerVisible: (visible: boolean) => void;
  setTimeRangeDrawerVisible: (visible: boolean) => void;
  setTradeDateDrawerVisible: (visible: boolean) => void;
  setIndicatorDrawerVisible: (visible: boolean) => void;
  setFilterDrawerVisible: (visible: boolean) => void;
  selectedIndustry: string | null;
  selectedConcept: string | null;
  setSortCategory: (category: 'main' | 'auction') => void;
  strategy: string;
  setStrategyVisible: (visible: boolean) => void;
  setStrategyConfigVisible: (visible: boolean) => void;
  availableIndustries?: any[];
  availableConcepts?: any[];
  onClickStats?: () => void;
  statsLoading?: boolean;
  onUserAvatarClick: () => void;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  isUserLoading?: boolean; // 用户信息是否正在加载
  onClickPush?: () => void; // 推送到同花顺
  pushLoading?: boolean;
}

const MobileToolbar: React.FC<MobileToolbarProps> = ({
  theme,
  currentTheme,
  dataType,
  currentFavoriteGroup,
  searchKeyword,
  setSearchKeyword,
  setCurrentPage,
  period,
  timeRange,
  indicator,
  mainOverlays,
  sortBy,
  sortOrder,
  tradeDate,
  displayTradeDate,
  setDataTypeDrawerVisible,
  setSortDrawerVisible,
  setPeriodDrawerVisible,
  setTimeRangeDrawerVisible,
  setTradeDateDrawerVisible,
  setIndicatorDrawerVisible,
  setFilterDrawerVisible,
  selectedIndustry,
  selectedConcept,
  setSortCategory,
  strategy,
  setStrategyVisible,
  setStrategyConfigVisible,
  availableIndustries,
  availableConcepts,
  onClickStats,
  statsLoading,
  onUserAvatarClick,
  isAdmin,
  isSuperAdmin,
  isUserLoading,
  onClickPush,
  pushLoading,
}) => {
  const { strategies } = useStrategiesMeta();
  return (
    <>
      {/* 第一行（48px）：搜索框 + 类型选择 */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        background: currentTheme.bg,
        borderBottom: `1px solid ${currentTheme.border}`,
        padding: '8px 16px',
        height: '48px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        transition: 'none'
      }}>
        {/* 类型选择按钮 - 自选分组时固定显示"自选"*/}
        <ToolbarButton
          theme={theme}
          onClick={() => setDataTypeDrawerVisible(true)}
        >
          {(() => {
            const current = DATA_TYPE_OPTIONS.find(opt => opt.key === dataType) || DATA_TYPE_OPTIONS[0];
            return `${current.icon} ${current.label}`;
          })()}
        </ToolbarButton>

        <Search
          placeholder="搜索名称/代码"
          value={searchKeyword}
          onChange={(e) => {
            const value = e.target.value;
            setSearchKeyword(value);
            // 清空搜索时重置分页以触发数据重新加载
            if (value.trim() === '') {
              setCurrentPage(1);
            }
          }}
          onSearch={(value) => {
            setSearchKeyword(value);
            setCurrentPage(1);
          }}
          style={{ flex: 1, minWidth: 0, height: 32 }}
        />

        <MobileUserAvatar
          theme={theme}
          onClick={onUserAvatarClick}
          isAdmin={isAdmin}
          isSuperAdmin={isSuperAdmin}
          isLoading={isUserLoading}
        />
      </div>

      {/* 第二行（44px）：折叠式操作栏 */}
      <div
        className="mobile-toolbar-row"
        style={{
          position: 'fixed',
          top: 48,
          left: 0,
          right: 0,
          zIndex: 1000,
          background: currentTheme.bg,
          borderBottom: `1px solid ${currentTheme.border}`,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          padding: '6px 16px',
          height: '44px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
          transition: 'none',
        }}
      >
        <ToolbarButton
          theme={theme}
          onClick={() => {
            setSortCategory('main');
            setSortDrawerVisible(true);
          }}
        >
          {(() => {
            // 如果是集合竞价字段，显示"开盘竞价"标签
            if (sortBy.startsWith('auction_')) {
              const auctionOption = getSortOptions(dataType, period)
                .find(item => item.key === 'auction')?.children
                ?.find(item => item.key === sortBy);
              return auctionOption
                ? `🔔 ${auctionOption.label} ${sortOrder === 'asc' ? '↑' : '↓'}`
                : `🔔 开盘竞价 ${sortOrder === 'asc' ? '↑' : '↓'}`;
            }
            const sortLabel = getSortOptions(dataType, period).find(opt => opt.key === sortBy)?.label || '🔥 热度';
            return `${sortLabel} ${sortOrder === 'asc' ? '↑' : '↓'}`;
          })()}
        </ToolbarButton>

        {/* 筛选按钮 - 仅在股票/可转债时显示 */}
        {(dataType === 'stock' || dataType === 'convertible_bond') && (
          <ToolbarButton
            theme={theme}
            onClick={() => setFilterDrawerVisible(true)}
            active={!!(selectedIndustry || selectedConcept)}
            activeColor={currentTheme.text}
          >
            {(() => {
              if (selectedIndustry || selectedConcept) {
                const parts: string[] = [];
                if (selectedConcept) {
                  const concept = availableConcepts?.find((c: any) => c.concept_code === selectedConcept);
                  parts.push(concept?.concept_name || '概念');
                }
                if (selectedIndustry) {
                  const industry = availableIndustries?.find((i: any) => i.industry_code === selectedIndustry);
                  parts.push(industry?.industry_name || '行业');
                }
                return parts.length > 1 ? `筛选×${parts.length}` : parts[0];
              }
              return '筛选';
            })()}
          </ToolbarButton>
        )}

        <ToolbarButton
          theme={theme}
          onClick={() => setTradeDateDrawerVisible(true)}
        >
          {(() => {
            const d = displayTradeDate || tradeDate;
            return `${d ? `${d.slice(0, 4)}/${d.slice(4, 6)}/${d.slice(6, 8)}` : '📅'}`;
          })()}
        </ToolbarButton>

        <ToolbarButton
          theme={theme}
          onClick={() => setPeriodDrawerVisible(true)}
        >
          {(() => {
            const current = PERIOD_OPTIONS.find(opt => opt.value === period) || PERIOD_OPTIONS[0];
            return `${current.icon} ${current.label}`;
          })()}
        </ToolbarButton>

        <ToolbarButton
          theme={theme}
          onClick={() => setTimeRangeDrawerVisible(true)}
        >
          {(() => {
            const current = TIME_RANGE_OPTIONS.find(opt => opt.value === timeRange);
            return current ? `${current.label}` : '范围';
          })()}
        </ToolbarButton>

        {dataType !== 'favorites' && (
          <ToolbarButton
            theme={theme}
            onClick={() => {
              // 始终打开策略选择列表，让用户可以切换或取消策略
              setStrategyVisible(true);
            }}
          >
            {(() => {
              if (!strategy) return '策略';
              const meta = strategies.find(s => s.key === strategy);
              return meta ? meta.label : strategy;
            })()}
          </ToolbarButton>
        )}

        <ToolbarButton
          theme={theme}
          onClick={() => setIndicatorDrawerVisible(true)}
          active={indicator !== 'none' || mainOverlays.length > 0}
          activeColor={currentTheme.text}
        >
          {(() => {
            const labels: string[] = [];

            if (indicator && indicator !== 'none') {
              const subOpt = INDICATOR_OPTIONS.find(opt => opt.key === indicator);
              if (subOpt?.label) {
                labels.push(subOpt.label);
              }
            }

            mainOverlays.forEach((key) => {
              const overlayOpt = OVERLAY_INDICATOR_OPTIONS.find(opt => opt.key === key);
              if (overlayOpt?.label) {
                labels.push(overlayOpt.label);
              }
            });

            if (labels.length === 0) return '指标';
            if (labels.length === 1) return labels[0] || '指标';
            return `指标×${labels.length}`;
          })()}
        </ToolbarButton>

        {onClickStats && (dataType === 'stock' || dataType === 'convertible_bond' || dataType === 'concept' || dataType === 'industry') && (
          <ToolbarButton
            theme={theme}
            onClick={onClickStats}
          >
            统计
          </ToolbarButton>
        )}

        {onClickPush && (dataType === 'stock' || dataType === 'convertible_bond' || dataType === 'concept' || dataType === 'industry') && (
          <ToolbarButton
            theme={theme}
            onClick={onClickPush}
            active={pushLoading}
          >
            {pushLoading ? '推送中...' : '推送'}
          </ToolbarButton>
        )}

        {/* 图表联动开关（K线拖动/缩放同步） */}
        <ChartSyncToggle theme={theme} currentTheme={currentTheme} />

      </div>
    </>
  );
};

// 图表联动开关组件（K线拖动/缩放同步）- 样式与ToolbarButton统一
const ChartSyncToggle: React.FC<{ theme: Theme; currentTheme: ReturnType<typeof getThemeColors> }> = ({ theme, currentTheme }) => {
  const chartSyncEnabled = useAppStore(state => state.chartSyncEnabled);
  const setChartSyncEnabled = useAppStore(state => state.setChartSyncEnabled);

  return (
    <div
      onClick={() => setChartSyncEnabled(!chartSyncEnabled)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '0 12px',
        height: 32,
        borderRadius: 6,
        background: currentTheme.card,
        border: `1px solid ${currentTheme.border}`,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        whiteSpace: 'nowrap',
        flexShrink: 0
      }}
    >
      <span style={{
        fontSize: 13,
        fontWeight: 500,
        color: currentTheme.text
      }}>
        联动
      </span>
      <Switch
        size="small"
        checked={chartSyncEnabled}
        onChange={setChartSyncEnabled}
        onClick={(_, e) => e.stopPropagation()}
        style={{ marginLeft: -2 }}
      />
    </div>
  );
};

export default MobileToolbar;
