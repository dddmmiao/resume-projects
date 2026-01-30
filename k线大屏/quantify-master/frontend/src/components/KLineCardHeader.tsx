import React from 'react';
import KLineCardTitle from './KLineCardTitle.tsx';
import TagsDisplay from './TagsDisplay.tsx';
import { stripCodeSuffix } from './mobile/utils.ts';
import HeaderMetrics from './HeaderMetrics.tsx';
import KLineCardActions from './KLineCardActions.tsx';

interface Props {
  theme: 'dark' | 'light' | 'blue' | 'purple' | 'green' | 'orange' | 'cyan' | 'red' | 'gold';
  item: any;
  dataType: 'stock' | 'convertible_bond' | 'concept' | 'industry' | 'concept' | 'industry';
  currentName: string;
  concepts: string[];
  industries: string[];
  currentKlineData: any;
  dailyBasic: any;
  isStockView: boolean;
  isInFavoritesMode: boolean;
  isCardHovered: boolean;
  isCardFocused: boolean;
  favoriteGroups: string[];
  isInFavorites?: (ts_code: string, groupName: string, itemType?: string) => boolean;
  onAddToFavorites?: (itemCode: string, groupName?: string, itemType?: string) => void;
  onRemoveFromFavorites?: (itemCode: string, groupName?: string, itemType?: string) => void;
  onConceptFilter?: (concept: string) => void;
  onIndustryFilter?: (industry: string) => void;
  getEastMoneyUrl: (item: any, type: string) => string;
  // 操作按钮相关
  originalItem: any;
  isShowingUnderlying: boolean;
  isShowingBond: boolean;
  isLoadingCallInfo: boolean;
  isLoadingBonds: boolean;
  relatedBonds: any[];
  onSwitchToUnderlying: () => void;
  onSwitchToConvertibleBond: () => void;
  onSwitchBackToStock: () => void;
  onShowCallInfo: (item: any) => void;
  onFullscreen: () => void;
  isFullscreen: boolean;
  // 当前K线周期（用于动态文案：日内/周内/月内涨跌）
  period?: 'daily' | 'weekly' | 'monthly';
}

const KLineCardHeader: React.FC<Props> = ({
  theme,
  item,
  dataType,
  currentName,
  concepts,
  industries,
  currentKlineData,
  dailyBasic,
  isStockView,
  isInFavoritesMode,
  isCardHovered,
  isCardFocused,
  favoriteGroups,
  isInFavorites,
  onAddToFavorites,
  onRemoveFromFavorites,
  onConceptFilter,
  onIndustryFilter,
  getEastMoneyUrl,
  originalItem,
  isShowingUnderlying,
  isShowingBond,
  isLoadingCallInfo,
  isLoadingBonds,
  relatedBonds,
  onSwitchToUnderlying,
  onSwitchToConvertibleBond,
  onSwitchBackToStock,
  onShowCallInfo,
  onFullscreen,
  isFullscreen,
  period,
}) => {
  return (
    <div className="stock-header" data-header style={{
      marginBottom: '2px',
      flexShrink: 0,
      zIndex: 2,
      position: 'relative',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'nowrap',
      gap: '8px',
      minWidth: 0,
      width: '100%'
    }}>
        <div style={{ 
          flex: 1, 
          minWidth: 0,             // 允许收缩
          overflow: 'hidden'       // 防止溢出
        }}>
          <KLineCardTitle
            theme={theme}
            item={item}
            dataType={dataType}
            name={currentName}
            isHot={item?.is_hot === true}
            isInFavoritesMode={isInFavoritesMode}
            isCardHovered={isCardHovered}
            isCardFocused={isCardFocused}
            favoriteGroups={favoriteGroups}
            isInFavorites={isInFavorites}
            onAddToFavorites={onAddToFavorites}
            onRemoveFromFavorites={onRemoveFromFavorites}
            getEastMoneyUrl={getEastMoneyUrl}
            onConceptFilter={onConceptFilter}
          />
          
          {/* code 和标签放在同一行 */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 2,
          }}>
            {/* code 显示 - 去掉后缀 */}
            {(() => {
              const rawCode = dataType === 'concept' ? item?.concept_code 
                            : dataType === 'industry' ? item?.industry_code 
                            : item?.ts_code;
              const code = stripCodeSuffix(rawCode);
              return code ? (
                <div className="stock-code">
                  {code}
                </div>
              ) : null;
            })()}
            
            {/* 综合标签展示 - 放在 code 后方 */}
            {(concepts.length > 0 || industries.length > 0) && (
              <div style={{ flexShrink: 0 }}>
                <TagsDisplay
                  concepts={concepts}
                  industries={industries}
                  onConceptClick={onConceptFilter}
                  onIndustryClick={(industry) => {
                    // 点击行业进行筛选
                    if (onIndustryFilter) {
                      onIndustryFilter(industry);
                    }
                  }}
                />
              </div>
            )}
          </div>
        </div>

        <div style={{ 
          textAlign: 'right', 
          minWidth: '120px',  // 设置最小宽度确保有足够空间
          maxWidth: '200px',  // 限制最大宽度避免占用太多空间
          overflow: 'hidden', 
          flexShrink: 1,      // 可以收缩但有最小宽度保护
          whiteSpace: 'nowrap' 
        }}>
          <HeaderMetrics
            data={currentKlineData}
            dailyBasic={dailyBasic}
            isStockView={isStockView}
            columns={3}
            variant="compact"
            align="right"
            theme={theme}
            period={period as any}
            fields={[
              // 收盘价更显眼
              { key: 'close', strong: true, colSpan: 2 },
              // 涨跌幅徽标
              { key: 'pct_chg', strong: true, badge: true },
              // 开/高/低
              'open','high','low',
              // 底部字段：额、换手率、量比、总市值、流通市值、日期（移除量）
              'amount', 'turnover_rate', 'volume_ratio', 'total_mv', 'circ_mv', 'trade_date'
            ]}
          />
        </div>

        {/* 操作按钮 - 固定在右侧不收缩 */}
        <div style={{ flexShrink: 0 }}>
          <KLineCardActions
          theme={theme}
          item={item}
          originalItem={originalItem}
          isShowingUnderlying={isShowingUnderlying}
          isShowingBond={isShowingBond}
          isLoadingCallInfo={isLoadingCallInfo}
          isLoadingBonds={isLoadingBonds}
          relatedBonds={relatedBonds}
          onSwitchToUnderlying={onSwitchToUnderlying}
          onSwitchToConvertibleBond={onSwitchToConvertibleBond}
          onSwitchBackToStock={onSwitchBackToStock}
          onShowCallInfo={onShowCallInfo}
          onFullscreen={onFullscreen}
          isFullscreen={isFullscreen}
        />
        </div>
    </div>
  );
};

export default KLineCardHeader;
