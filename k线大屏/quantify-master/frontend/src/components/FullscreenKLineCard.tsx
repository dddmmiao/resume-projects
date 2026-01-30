import React, { useState } from 'react';
import { Card, Button, Dropdown, Select } from 'antd';
import TagsDisplay from './TagsDisplay.tsx';
import HotInfoModal from './HotInfoModal.tsx';
import HotFlameIcon from './HotFlameIcon.tsx';
import { CloseOutlined } from '@ant-design/icons';
import { stripCodeSuffix } from './mobile/utils.ts';

type FullscreenKLineCardProps = {
  isVisible: boolean;
  onClose: () => void;
  cardRef: React.RefObject<HTMLDivElement>;
  stockContentRef: React.RefObject<HTMLDivElement>;
  isCardFocused: boolean;
  handleCardMouseDownCapture: (e: React.MouseEvent<HTMLElement>) => void;
  getEastMoneyUrl: (item: any, type: string) => string;
  item: any;
  dataType: 'stock' | 'convertible_bond' | 'concept' | 'industry';
  currentName: string;
  favoriteGroups: string[];
  isInFavorites: (itemCode: string, groupName?: string, itemType?: string) => boolean;
  isInFavoritesMode: boolean;
  onAddToFavorites?: (itemCode: string, groupName?: string, itemType?: string) => void;
  onRemoveFromFavorites?: (itemCode: string, groupName?: string, itemType?: string) => void;
  theme: 'dark' | 'light' | 'blue' | 'purple' | 'green' | 'orange' | 'cyan' | 'red' | 'gold';
  concepts: string[];
  industries: string[];
  onConceptFilter?: (concept: string) => void;
  onIndustryFilter?: (industry: string) => void;
  HeaderMetrics: React.ComponentType<any>;
  currentKlineData: any;
  dailyBasic: any;
  isStockView: boolean;
  handleSwitchToUnderlying: () => void;
  isShowingUnderlying: boolean;
  originalItem: any;
  relatedBonds: any[];
  isShowingBond: boolean;
  isLoadingBonds: boolean;
  switchToConvertibleBond: () => void;
  switchBackToStock: () => void;
  isLoadingCallInfo: boolean;
  handleShowCallInfo: (item: any) => void;
  KLineChart: React.ComponentType<any>;
  currentTsCode: string;
  currentPeriod: string;
  currentTimeRange: number | string | undefined;
  currentIndicator: string;
  currentMainOverlays: string[];
  refreshKey: number;
  handleLatestDataUpdate: (data: any) => void;
  globalIsSnapMode: boolean;
  onSnapModeChange?: (isSnap: boolean) => void;
  localPeriod: string | null;
  localTimeRange: number | string | null;
  localIndicator: string | null;
  globalPeriod: string;
  globalTimeRange: number | string | undefined;
  globalIndicator: string;
  onLocalPeriodChange: (period: string) => void;
  onLocalTimeRangeChange: (range: number | string) => void;
  onLocalIndicatorChange: (indicator: string) => void;
  getValidIndicatorValue: (value: string | null) => string;
  onLocalMainOverlaysChange: (next: string[]) => void;
  tradeDate?: string; // 交易日期，K线数据只显示到该日期
};

const FullscreenKLineCard: React.FC<FullscreenKLineCardProps> = (props) => {
  const [hotInfoModalVisible, setHotInfoModalVisible] = useState(false);
  
  const {
    isVisible,
    onClose,
    cardRef,
    stockContentRef,
    isCardFocused,
    handleCardMouseDownCapture,
    getEastMoneyUrl,
    item,
    dataType,
    currentName,
    favoriteGroups,
    isInFavorites,
    isInFavoritesMode,
    onAddToFavorites,
    onRemoveFromFavorites,
    theme,
    concepts,
    industries,
    onConceptFilter,
    onIndustryFilter,
    HeaderMetrics,
    currentKlineData,
    dailyBasic,
    isStockView,
    handleSwitchToUnderlying,
    isShowingUnderlying,
    originalItem,
    relatedBonds,
    isShowingBond,
    isLoadingBonds,
    switchToConvertibleBond,
    switchBackToStock,
    isLoadingCallInfo,
    handleShowCallInfo,
    KLineChart,
    currentTsCode,
    currentPeriod,
    currentTimeRange,
    currentIndicator,
    currentMainOverlays,
    refreshKey,
    handleLatestDataUpdate,
    globalIsSnapMode,
    onSnapModeChange,
    localPeriod,
    localTimeRange,
    localIndicator,
    globalPeriod,
    globalTimeRange,
    onLocalPeriodChange,
    onLocalTimeRangeChange,
    onLocalIndicatorChange,
    getValidIndicatorValue,
    onLocalMainOverlaysChange,
    tradeDate,
  } = props;

  const currentIndicatorValue = getValidIndicatorValue(localIndicator);

  const overlayKeys = new Set(['ma', 'expma', 'boll', 'sar', 'td']);
  const subIndicatorKeys = new Set(['auction', 'macd', 'rsi', 'kdj', 'cci', 'wr', 'dmi', 'obv', 'vol']);

  const activeIndicators: string[] = [];
  if (currentIndicatorValue && currentIndicatorValue !== 'none' && subIndicatorKeys.has(currentIndicatorValue)) {
    activeIndicators.push(currentIndicatorValue);
  }
  if (Array.isArray(currentMainOverlays)) {
    currentMainOverlays.forEach((key) => {
      if (overlayKeys.has(key)) {
        activeIndicators.push(key);
      }
    });
  }

  // 下拉展示用的值：如果没有任何指标选中，则选中一个“none”占位，展示为"无"
  const displayIndicators = activeIndicators.length > 0 ? activeIndicators : ['none'];

  // 检查是否应该显示赎回信息按钮（情况2：从股票切换到债券）
  const shouldShowCallButtonForBond = React.useMemo(() => {
    return (
      originalItem.type === 'stock' &&
      isShowingBond &&
      relatedBonds.length > 0 &&
      relatedBonds[0]?.call_records &&
      Array.isArray(relatedBonds[0].call_records) &&
      relatedBonds[0].call_records.length > 0
    );
  }, [originalItem.type, isShowingBond, relatedBonds]);

  // 判断是否有有效的热度概念和上榜原因
  const hasValidConcept = item?.hot_concept && typeof item.hot_concept === 'string' && item.hot_concept.trim().length > 0;
  const hasValidReason = item?.hot_rank_reason && typeof item.hot_rank_reason === 'string' && item.hot_rank_reason.trim().length > 0;
  
  // 只有当至少有一个有效数据时才允许点击
  const canOpenModal = hasValidConcept || hasValidReason;

  const handleHotIconClick = (e: React.MouseEvent) => {
    if (!canOpenModal) {
      return; // 如果没有有效数据，不打开弹窗
    }
    e.preventDefault();
    e.stopPropagation();
    setHotInfoModalVisible(true);
  };

  // 指标选择变更处理：支持统一多选入口，方案B：选择"无"时清空所有主图叠加
  const handleIndicatorSelect = (value: string) => {
    if (value === 'none') {
      onLocalIndicatorChange('none');
      onLocalMainOverlaysChange([]);
      return;
    }

    if (overlayKeys.has(value)) {
      const base = Array.isArray(currentMainOverlays) ? currentMainOverlays : [];
      if (!base.includes(value)) {
        const next = [...base, value];
        onLocalMainOverlaysChange(next);
      }
      return;
    }

    if (subIndicatorKeys.has(value)) {
      onLocalIndicatorChange(value);
    }
  };

  const handleIndicatorDeselect = (value: string) => {
    if (value === 'none') {
      return;
    }

    if (overlayKeys.has(value)) {
      const base = Array.isArray(currentMainOverlays) ? currentMainOverlays : [];
      const next = base.filter((key) => key !== value);
      onLocalMainOverlaysChange(next);
      return;
    }

    if (subIndicatorKeys.has(value)) {
      if (value === currentIndicatorValue) {
        onLocalIndicatorChange('none');
      }
    }
  };

  // 渲染火苗图标，根据数据情况显示不同颜色
  // 两个数据都缺少用橙色，否则用红色
  const renderFlameIcon = () => {
    // 两个都没有：橙色，否则：红色
    const flameColor = (!hasValidConcept && !hasValidReason) ? "#ff9800" : "#ff4d4f";
    
    if (!canOpenModal) {
      // 两个都没有：显示1个橙色火苗，不可点击
      return (
        <span 
          style={{ 
            display: 'inline-flex',
            alignItems: 'center',
            cursor: 'not-allowed',
            opacity: 1
          }}
        >
          <HotFlameIcon color={flameColor} size={14} />
        </span>
      );
    } else {
      // 至少有一个数据：显示1个红色火苗，可点击
      return (
        <span 
          style={{ 
            display: 'inline-flex',
            alignItems: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          onClick={handleHotIconClick}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <HotFlameIcon color={flameColor} size={14} />
        </span>
      );
    }
  };

  if (!isVisible) return null;

  const fullscreenCardStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.1)',
    border: '2px solid rgba(255,255,255,0.3)',
    borderRadius: '12px',
    backdropFilter: 'blur(10px)',
    height: '90vh',
    position: 'fixed',
    top: '5vh',
    left: '2.5vw',
    right: '2.5vw',
    width: 'auto',
    maxWidth: 'none',
    minWidth: 'none',
    zIndex: 10001,
    boxSizing: 'border-box',
    overflow: 'hidden',
    boxShadow: '0 25px 80px rgba(0, 0, 0, 0.9)',
    margin: '0',
    pointerEvents: 'auto',
    userSelect: 'none',
    transform: 'none'
  };

  return (
    <>
    <Card
      style={{
        ...fullscreenCardStyle,
        outline: isCardFocused ? '3px solid #1890ff' : 'none',
        transition: 'outline 0.2s ease'
      }}
      className="fullscreen-card"
      ref={cardRef}
      onClick={(e) => e.stopPropagation()}
      onMouseDownCapture={handleCardMouseDownCapture}
      onDragStart={(e) => {
        e.preventDefault();
        return false;
      }}
      onDrag={(e) => {
        e.preventDefault();
        return false;
      }}
      draggable={false}
      tabIndex={0}
    >
      <div ref={stockContentRef} className="stock-card-content">
        <div className="stock-header">
          <div className="stock-header-row">
            <div className="stock-header-left">
              <div className="stock-title" style={{ fontSize: 16, fontWeight: 700 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {item?.is_hot === true && renderFlameIcon()}
                  <a
                    href={getEastMoneyUrl(item, dataType)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'inherit', textDecoration: 'none', cursor: 'pointer', transition: 'all 0.2s ease' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#1890ff';
                      e.currentTarget.style.textDecoration = 'underline';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'inherit';
                      e.currentTarget.style.textDecoration = 'none';
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {currentName}
                  </a>

                  {(dataType === 'stock' || dataType === 'convertible_bond') && onAddToFavorites && onRemoveFromFavorites && isInFavorites && (
                    <Dropdown
                      menu={{
                        items: [
                          ...favoriteGroups.map((groupName, index) => {
                            const itemType = isInFavoritesMode ? item.type : undefined;
                            const isInGroup = isInFavorites(item.ts_code, groupName, itemType);
                            return {
                              key: groupName,
                              label: (
                                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: '120px', color: theme === 'light' ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)' }}>
                                  <span style={{ display: 'flex', alignItems: 'center' }}>
                                    {isCardFocused && index < 9 && (
                                      <kbd style={{ background: 'rgba(255,255,255,0.2)', padding: '1px 4px', borderRadius: '2px', marginRight: '6px', fontSize: '10px', border: '1px solid rgba(255,255,255,0.3)' }}>{index + 1}</kbd>
                                    )}
                                    <span>{groupName}</span>
                                  </span>
                                  <span style={{ color: isInGroup ? '#52c41a' : (theme === 'light' ? '#999' : '#666'), fontSize: '12px', marginLeft: '8px' }}>
                                    {isInGroup ? '✓' : '+'}
                                  </span>
                                </span>
                              ),
                              onClick: () => {
                                if (isInGroup) {
                                  onRemoveFromFavorites(item.ts_code, groupName, itemType);
                                } else {
                                  onAddToFavorites(item.ts_code, groupName, itemType);
                                }
                              }
                            };
                          }),
                          ...(favoriteGroups.length > 0 ? [{ type: 'divider' as const }] : []),
                          {
                            key: 'manage',
                            label: (
                              <span style={{ color: theme === 'light' ? '#1890ff' : '#40a9ff' }}>
                                ⚙️ 管理分组
                              </span>
                            ),
                            onClick: () => {
                              const event = new CustomEvent('openFavoriteModal');
                              window.dispatchEvent(event);
                            }
                          }
                        ]
                      }}
                      overlayClassName={`favorite-dropdown-${theme} fullscreen-dropdown`}
                      trigger={['click']}
                      placement="bottomRight"
                      getPopupContainer={() => cardRef.current || document.body}
                    >
                      <Button
                        type="text"
                        size="small"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          padding: '0 4px',
                          height: '20px',
                          fontSize: '14px',
                          color: (() => {
                            const itemType = isInFavoritesMode ? item.type : undefined;
                            const isInAnyGroup = favoriteGroups.some(groupName => isInFavorites(item.ts_code, groupName, itemType));
                            return isInAnyGroup ? '#faad14' : 'rgba(255,255,255,0.65)';
                          })(),
                          border: 'none',
                          transition: 'all 0.2s ease',
                          position: 'relative',
                          zIndex: 10050
                        }}
                        title="管理自选分组"
                      >
                        {(() => {
                          const itemType = isInFavoritesMode ? item.type : undefined;
                          const isInAnyGroup = favoriteGroups.some(groupName => isInFavorites(item.ts_code, groupName, itemType));
                          return isInAnyGroup ? '⭐' : '☆';
                        })()}
                      </Button>
                    </Dropdown>
                  )}
                </div>
              </div>

              {/* code 和标签放在同一行 */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 4
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
                      onIndustryClick={onIndustryFilter}
                    />
                  </div>
                )}
              </div>
            </div>

            <div style={{ textAlign: 'right', marginRight: '20px', minWidth: 320 }}>
              <HeaderMetrics
                data={currentKlineData}
                dailyBasic={dailyBasic}
                isStockView={isStockView}
                columns={4}
                variant="large"
                align="right"
                theme={theme}
                period={currentPeriod as any}
                isFullscreen={true}
                fields={[
                  // 主要价格信息
                  { key: 'close', strong: true },
                  { key: 'volatility', strong: true, badge: true },
                  { key: 'pct_chg', strong: true, badge: true },
                  // 基础K线值 + 日涨
                  'open', 'high', 'low',
                  { key: 'change_abs', strong: true },
                  'amount',
                  // 排序相关的值（如果是股票视图则显示更多指标）
                  ...(isStockView ? ['turnover_rate', 'volume_ratio', 'total_mv', 'circ_mv'] : []),
                  'trade_date'
                ]}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              {item.type === 'convertible_bond' && item.underlying_stock && (
                <Button
                  type="text"
                  size="large"
                  onClick={handleSwitchToUnderlying}
                  style={{
                    color: isShowingUnderlying ? '#52c41a' : '#1890ff',
                    border: `1px solid ${isShowingUnderlying ? '#52c41a' : '#1890ff'}`,
                    borderRadius: '8px', width: '32px', height: '32px', minWidth: '32px', fontSize: '14px', padding: '0',
                    background: isShowingUnderlying ? 'rgba(82, 196, 26, 0.1)' : 'rgba(24, 144, 255, 0.1)',
                    transition: 'all 0.2s ease'
                  }}
                  title={isShowingUnderlying ? '切换回可转债' : '切换到正股'}
                  onMouseEnter={(e) => {
                    const color = isShowingUnderlying ? '#52c41a' : '#1890ff';
                    e.currentTarget.style.background = isShowingUnderlying ? 'rgba(82, 196, 26, 0.2)' : 'rgba(24, 144, 255, 0.2)';
                    e.currentTarget.style.borderColor = color;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isShowingUnderlying ? 'rgba(82, 196, 26, 0.1)' : 'rgba(24, 144, 255, 0.1)';
                    e.currentTarget.style.borderColor = isShowingUnderlying ? '#52c41a' : '#1890ff';
                  }}
                >
                  {isShowingUnderlying ? '债' : '股'}
                </Button>
              )}

              {originalItem.type === 'stock' && !isShowingBond && relatedBonds.length > 0 && (
                <Button
                  type="text"
                  size="large"
                  onClick={switchToConvertibleBond}
                  loading={isLoadingBonds}
                  style={{
                    color: isShowingBond ? '#52c41a' : '#1890ff',
                    border: `1px solid ${isShowingBond ? '#52c41a' : '#1890ff'}`,
                    borderRadius: '8px', width: '32px', height: '32px', minWidth: '32px', fontSize: '14px', padding: '0',
                    background: isShowingBond ? 'rgba(82, 196, 26, 0.1)' : 'rgba(24, 144, 255, 0.1)',
                    transition: 'all 0.2s ease'
                  }}
                  title="切换到可转债"
                  onMouseEnter={(e) => {
                    const color = isShowingBond ? '#52c41a' : '#1890ff';
                    e.currentTarget.style.background = isShowingBond ? 'rgba(82, 196, 26, 0.2)' : 'rgba(24, 144, 255, 0.2)';
                    e.currentTarget.style.borderColor = color;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isShowingBond ? 'rgba(82, 196, 26, 0.1)' : 'rgba(24, 144, 255, 0.1)';
                    e.currentTarget.style.borderColor = isShowingBond ? '#52c41a' : '#1890ff';
                  }}
                >
                  债
                </Button>
              )}

              {originalItem.type === 'stock' && isShowingBond && (
                <Button
                  type="text"
                  size="large"
                  onClick={switchBackToStock}
                  style={{
                    color: '#52c41a',
                    border: '1px solid #52c41a',
                    borderRadius: '8px', width: '32px', height: '32px', minWidth: '32px', fontSize: '14px', padding: '0',
                    background: 'rgba(82, 196, 26, 0.1)',
                    transition: 'all 0.2s ease'
                  }}
                  title="切换回股票"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(82, 196, 26, 0.2)';
                    e.currentTarget.style.borderColor = '#52c41a';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(82, 196, 26, 0.1)';
                    e.currentTarget.style.borderColor = '#52c41a';
                  }}
                >
                  股
                </Button>
              )}

              {/* 可转债赎回信息按钮 - 情况1: 原始是可转债，有赎回信息 */}
              {item.type === 'convertible_bond' && item.call_records && item.call_records.length > 0 && (
                <Button
                  type="text"
                  size="large"
                  loading={isLoadingCallInfo}
                  onClick={() => handleShowCallInfo(item)}
                  style={{
                    color: '#faad14',
                    border: '1px solid #faad14',
                    borderRadius: '8px', width: '32px', height: '32px', minWidth: '32px', fontSize: '14px', padding: '0',
                    background: 'rgba(250, 173, 20, 0.1)',
                    transition: 'all 0.2s ease'
                  }}
                  title="查看赎回信息"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(250, 173, 20, 0.2)';
                    e.currentTarget.style.borderColor = '#faad14';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(250, 173, 20, 0.1)';
                    e.currentTarget.style.borderColor = '#faad14';
                  }}
                >
                  {isLoadingCallInfo ? '' : '赎'}
                </Button>
              )}

              {/* 可转债赎回信息按钮 - 情况2: 从股票切换到债券后，债券有赎回信息 */}
              {shouldShowCallButtonForBond && (
                <Button
                  type="text"
                  size="large"
                  loading={isLoadingCallInfo}
                  onClick={() => handleShowCallInfo(relatedBonds[0])}
                  style={{
                    color: '#faad14',
                    border: '1px solid #faad14',
                    borderRadius: '8px', width: '32px', height: '32px', minWidth: '32px', fontSize: '14px', padding: '0',
                    background: 'rgba(250, 173, 20, 0.1)',
                    transition: 'all 0.2s ease'
                  }}
                  title="查看赎回信息"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(250, 173, 20, 0.2)';
                    e.currentTarget.style.borderColor = '#faad14';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(250, 173, 20, 0.1)';
                    e.currentTarget.style.borderColor = '#faad14';
                  }}
                >
                  {isLoadingCallInfo ? '' : '赎'}
                </Button>
              )}

              <Button
                type="text"
                size="large"
                icon={<CloseOutlined />}
                onClick={onClose}
                className="mobile-close-button"
                style={{
                  color: 'rgba(255,255,255,0.8)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: '8px', width: '32px', height: '32px', minWidth: '32px', fontSize: '14px', padding: '0',
                  background: 'rgba(255,255,255,0.08)',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
                }}
              />
            </div>
          </div>
        </div>

        <div className="fullscreen-controls-panel" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="fullscreen-control-label">周期</span>
              <Select
                value={localPeriod !== null ? localPeriod : globalPeriod}
                onChange={onLocalPeriodChange}
                size="middle"
                className="fullscreen-control-select"
                style={{ width: 56, fontSize: '14px' }}
                getPopupContainer={() => stockContentRef?.current || cardRef?.current || document.body}
              >
                <Select.Option value="daily">日</Select.Option>
                <Select.Option value="weekly">周</Select.Option>
                <Select.Option value="monthly">月</Select.Option>
              </Select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="fullscreen-control-label">范围</span>
              <Select
                value={localTimeRange !== null ? localTimeRange : globalTimeRange}
                onChange={onLocalTimeRangeChange}
                size="middle"
                className="fullscreen-control-select"
                style={{ width: 90, fontSize: '14px' }}
                getPopupContainer={() => stockContentRef?.current || cardRef?.current || document.body}
              >
                <Select.Option value={30}>30天</Select.Option>
                <Select.Option value={60}>60天</Select.Option>
                <Select.Option value={90}>90天</Select.Option>
                <Select.Option value={180}>180天</Select.Option>
                <Select.Option value={360}>360天</Select.Option>
                <Select.Option value="all">全部</Select.Option>
              </Select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="fullscreen-control-label">指标</span>
              <Select
                mode="multiple"
                value={displayIndicators}
                onSelect={handleIndicatorSelect}
                onDeselect={handleIndicatorDeselect}
                size="middle"
                className="fullscreen-control-select"
                style={{ width: 140, fontSize: '14px' }}
                getPopupContainer={() => stockContentRef?.current || cardRef?.current || document.body}
                placeholder="无"
                virtual={false}
                listHeight={200}
                showSearch={false}
                maxTagCount={0}
                maxTagPlaceholder={(omittedValues) => {
                  const count = Array.isArray(omittedValues) ? omittedValues.length : 0;
                  if (count === 0) return '无';
                  const labels = omittedValues.map((opt: any) => {
                    if (opt && typeof opt.label === 'string') return opt.label;
                    if (opt && typeof opt.value === 'string') return opt.value;
                    return '';
                  }).filter(Boolean);
                  if (labels.length === 1) {
                    return labels[0] || '无';
                  }
                  return `指标×${labels.length}`;
                }}
                menuItemSelectedIcon={null}
              >
                <Select.Option value="none">无</Select.Option>
                {/* 开盘竞价指标仅在股票类型+日线时显示 */}
                {dataType === 'stock' && currentPeriod === 'daily' && <Select.Option value="auction">开盘竞价</Select.Option>}
                <Select.Option value="ma">MA</Select.Option>
                <Select.Option value="expma">EXPMA</Select.Option>
                <Select.Option value="macd">MACD</Select.Option>
                <Select.Option value="rsi">RSI</Select.Option>
                <Select.Option value="kdj">KDJ</Select.Option>
                <Select.Option value="boll">BOLL</Select.Option>
                <Select.Option value="cci">CCI</Select.Option>
                <Select.Option value="wr">WR</Select.Option>
                <Select.Option value="dmi">DMI</Select.Option>
                <Select.Option value="sar">SAR</Select.Option>
                <Select.Option value="obv">OBV</Select.Option>
                <Select.Option value="vol">VOL</Select.Option>
                <Select.Option value="td">神奇九转</Select.Option>
              </Select>
            </div>
          </div>
        </div>

        <div className="kline-chart-container" style={{ flex: 1, minHeight: 0, width: '100%', height: 'calc(90vh - 140px)', overflow: 'hidden' }}>
          <KLineChart
            key={`${currentTsCode}-${currentPeriod}-${currentTimeRange}-${currentIndicator}`}
            ts_code={currentTsCode}
            dataType={(
              (item.type === 'convertible_bond' && isShowingUnderlying ? 'stock' :
              item.type === 'convertible_bond' && !isShowingUnderlying ? 'convertible_bond' :
              originalItem.type === 'stock' && isShowingBond ? 'convertible_bond' :
              originalItem.type === 'stock' && !isShowingBond ? 'stock' :
              dataType === 'concept' ? 'concept' :
              dataType === 'industry' ? 'industry' :
              dataType) as 'stock' | 'convertible_bond' | 'concept' | 'industry'
            )}
            width="100%"
            height="100%"
            initialCount={(() => {
              // 将timeRange转换为initialCount
              if (currentTimeRange === 'all') {
                return 1095; // 全部数据
              }
              if (typeof currentTimeRange === 'number') {
                return currentTimeRange; // 直接使用天数作为K线根数
              }
              return 200; // 默认200根
            })()}
            period={currentPeriod}
            indicator={currentIndicator}
            mainIndicators={currentMainOverlays}
            isFullscreen={true}
            refreshKey={refreshKey}
            onLatestDataUpdate={handleLatestDataUpdate}
            showPriceCard={false}
            globalIsSnapMode={globalIsSnapMode}
            onSnapModeChange={onSnapModeChange}
            theme={theme}
            tradeDate={tradeDate}
            timeRange={currentTimeRange}
          />
        </div>
      </div>
    </Card>
    
    <HotInfoModal
      open={hotInfoModalVisible}
      onClose={() => setHotInfoModalVisible(false)}
      hotConcept={item?.hot_concept}
      hotRankReason={item?.hot_rank_reason}
      theme={theme}
      dataType={dataType}
      onConceptFilter={onConceptFilter}
    />
    </>
  );
};

export default FullscreenKLineCard;

