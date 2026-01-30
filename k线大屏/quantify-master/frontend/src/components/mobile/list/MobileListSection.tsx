import React from 'react';
import { Layout } from 'antd';
import { StockCard } from '../StockCard.tsx';
import MobilePagination from '../MobilePagination.tsx';
import ListSkeleton from './ListSkeleton.tsx';
import EmptyState from '../../EmptyState.tsx';
import PullToRefresh from '../PullToRefresh.tsx';
import {
  type Period,
  type IndicatorType,
  type DataType,
  type Layout as LayoutType,
} from '../constants.ts';
import { getThemeColors, type Theme } from '../theme.ts';

const { Content } = Layout;

interface MobileListSectionProps {
  theme: Theme;
  currentTheme: ReturnType<typeof getThemeColors>;
  dataType: DataType;
  layout: LayoutType;
  loading: boolean;
  stockData: any[];
  contentStyle: React.CSSProperties;
  getPeriodForCode: (tsCode: string) => Period;
  getTimeRangeForCode: (tsCode: string) => number | string;
  getIndicatorForCode: (tsCode: string) => IndicatorType;
  getMainOverlaysForCode: (tsCode: string) => Array<'ma' | 'expma' | 'boll' | 'sar' | 'td'>;
  handleCardClick: (item: any) => void;
  setHotInfoStock: (stock: any) => void;
  setHotInfoModalVisible: (visible: boolean) => void;
  cardKlineData: Record<string, any>;
  miniKlines: Record<string, any[]>;
  handleCardKlineDataUpdate: (code: string) => (data: any) => void;
  tradeDate: string;
  searchKeyword: string;
  total: number;
  currentPage: number;
  pageSize: number;
  handlePageChange: (page: number) => void;
  onRefresh?: () => Promise<void>;
}

const MobileListSection: React.FC<MobileListSectionProps> = ({
  theme,
  currentTheme,
  dataType,
  layout,
  loading,
  stockData,
  contentStyle,
  getPeriodForCode,
  getTimeRangeForCode,
  getIndicatorForCode,
  getMainOverlaysForCode,
  handleCardClick,
  setHotInfoStock,
  setHotInfoModalVisible,
  cardKlineData,
  miniKlines,
  handleCardKlineDataUpdate,
  tradeDate,
  searchKeyword,
  total,
  currentPage,
  pageSize,
  handlePageChange,
  onRefresh,
}) => {
  const listContent = (
    <div 
      key={`list-${theme}`}
      style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: 6, 
        maxWidth:'100vw', 
        overflowX:'hidden',
        paddingBottom: '20px',
      }}
    >
        {loading ? (
          <ListSkeleton theme={theme} layout={layout} count={8} />
        ) : stockData.length === 0 ? (
          <EmptyState
            type={searchKeyword ? 'search' : (dataType === 'favorites' ? 'favorites' : 'empty')}
            searchKeyword={searchKeyword}
            theme={theme}
          />
        ) : (
          <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: layout === 'grid' ? '1fr 1fr' : '1fr',
              gap: layout === 'grid' ? 6 : 8,
              padding: '0px'
            }}>
              {stockData.map((item: any) => {
                const code = dataType === 'concept' ? item.concept_code : 
                            dataType === 'industry' ? item.industry_code : 
                            (item.ts_code || item.code || item.symbol);
                
                // 预计算这些值，避免在render中传递函数
                const currentPeriod = getPeriodForCode(code);
                const currentTimeRange = getTimeRangeForCode(code);  
                const currentIndicator = getIndicatorForCode(code);
                const currentMainOverlays = getMainOverlaysForCode(code);
                
                return (
                  <StockCard
                    key={code}
                    item={item}
                    dataType={dataType}
                    layout={layout}
                    theme={theme}
                    period={currentPeriod}
                    timeRange={currentTimeRange}
                    indicator={currentIndicator}
                    mainOverlays={currentMainOverlays}
                    onCardClick={handleCardClick}
                    onHotIconClick={(item) => {
                      // 判断是否有有效的热度数据
                      const hasValidConcept = item?.hot_concept && typeof item.hot_concept === 'string' && item.hot_concept.trim().length > 0;
                      const hasValidReason = item?.hot_rank_reason && typeof item.hot_rank_reason === 'string' && item.hot_rank_reason.trim().length > 0;
                      if (hasValidConcept || hasValidReason) {
                        setHotInfoStock(item);
                        setHotInfoModalVisible(true);
                      }
                    }}
                    cardKlineData={cardKlineData}
                    miniKlines={miniKlines}
                    onKlineDataUpdate={handleCardKlineDataUpdate}
                    tradeDate={tradeDate}
                  />
                );
              })}
            </div>
          
            {/* 分页组件 */}
            {stockData.length > 0 && (
              <MobilePagination
                theme={theme}
                dataType={dataType}
                searchKeyword={searchKeyword}
                total={total}
                currentPage={currentPage}
                pageSize={pageSize}
                loading={loading}
                onPageChange={handlePageChange}
              />
            )}
          </>
        )}
      </div>
  );

  return (
    <Content key={`content-${theme}`} style={contentStyle}>
      {onRefresh ? (
        <PullToRefresh theme={theme} onRefresh={onRefresh} disabled={loading}>
          {listContent}
        </PullToRefresh>
      ) : (
        listContent
      )}
    </Content>
  );
};

export default MobileListSection;
