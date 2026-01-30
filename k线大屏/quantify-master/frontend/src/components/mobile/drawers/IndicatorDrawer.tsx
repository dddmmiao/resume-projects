import React from 'react';
import { BottomDrawer } from '../BottomDrawer.tsx';
import { getThemeColors, type Theme } from '../theme.ts';
import {
  OVERLAY_INDICATOR_OPTIONS,
  SUB_INDICATOR_OPTIONS,
  type IndicatorType,
  type DataType,
  type Period,
} from '../constants.ts';
import { useAppStore } from '../../../stores/useAppStore.ts';

// 主图叠加指标类型
type MainOverlayType = 'ma' | 'expma' | 'boll' | 'sar' | 'td';

interface IndicatorDrawerProps {
  theme: Theme;
  open: boolean;
  onClose: () => void;
  dataType: DataType;
  period?: Period; // 周期，用于过滤开盘竞价指标（仅日线显示）
  // 副图指标（单选）
  indicator: IndicatorType;
  setIndicator: (ind: IndicatorType) => void;
  // 主图叠加指标（多选）
  mainOverlays?: MainOverlayType[];
  setMainOverlays?: (overlays: MainOverlayType[]) => void;
}

const IndicatorDrawer: React.FC<IndicatorDrawerProps> = ({
  theme,
  open,
  onClose,
  dataType,
  period = 'daily',
  indicator,
  setIndicator,
  mainOverlays = [],
  setMainOverlays,
}) => {
  const currentTheme = getThemeColors(theme);
  const indicatorLineSettings = useAppStore(state => state.indicatorLineSettings);
  const setIndicatorLineSettings = useAppStore(state => state.setIndicatorLineSettings);

  // 判断是否有可配置线的指标被选中
  const hasConfigurableIndicator = 
    mainOverlays.includes('ma') || mainOverlays.includes('expma') || mainOverlays.includes('boll') ||
    indicator === 'kdj' || indicator === 'macd' || indicator === 'dmi';

  // 切换主图叠加指标
  const toggleOverlay = (key: MainOverlayType) => {
    if (!setMainOverlays) return;
    if (mainOverlays.includes(key)) {
      setMainOverlays(mainOverlays.filter(k => k !== key));
    } else {
      setMainOverlays([...mainOverlays, key]);
    }
  };

  // 选择副图指标：再次点击同一个指标则取消选中，恢复为"无"
  const selectSubIndicator = (key: IndicatorType) => {
    if (indicator === key) {
      setIndicator('none');
    } else {
      setIndicator(key);
    }
  };

  // 过滤副图指标选项：隐藏"无”，非股票时隐藏开盘竞价，非日线时隐藏开盘竞价
  const filteredSubOptions = SUB_INDICATOR_OPTIONS.filter(item => {
    if (item.key === 'none') {
      return false;
    }
    // 开盘竞价指标仅在股票+日线时显示
    if (item.key === 'auction' && (dataType !== 'stock' || period !== 'daily')) {
      return false;
    }
    return true;
  });

  return (
    <BottomDrawer
      theme={theme}
      maxHeight="60vh"
      title="指标设置"
      open={open}
      onClose={onClose}
      zIndex={2100}
    >
      <>
        {/* 主图叠加指标区域 */}
        {setMainOverlays && (
          <div style={{ marginTop: 12, marginBottom: 20 }}>
            <div style={{
              fontSize: 14,
              fontWeight: 600,
              color: currentTheme.text,
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <span>主图指标</span>
              <span style={{
                fontSize: 11,
                color: currentTheme.textSecondary,
                fontWeight: 400
              }}>（多选）</span>
            </div>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10
            }}>
              {OVERLAY_INDICATOR_OPTIONS.map(opt => {
                const isSelected = mainOverlays.includes(opt.key as MainOverlayType);
                return (
                  <button
                    key={opt.key}
                    onClick={() => toggleOverlay(opt.key as MainOverlayType)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: `1.5px solid ${isSelected ? opt.color : currentTheme.border}`,
                      background: isSelected 
                        ? `${opt.color}18`
                        : theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                      color: isSelected ? opt.color : currentTheme.text,
                      fontSize: 14,
                      fontWeight: isSelected ? 600 : 400,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    {isSelected && <span style={{ fontSize: 12 }}>✓</span>}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 副图指标区域 */}
        <div>
          <div style={{
            fontSize: 14,
            fontWeight: 600,
            color: currentTheme.text,
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <span>副图指标</span>
            <span style={{
              fontSize: 11,
              color: currentTheme.textSecondary,
              fontWeight: 400
            }}>（单选）</span>
          </div>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10
          }}>
            {filteredSubOptions.map(opt => {
              const isSelected = indicator === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => selectSubIndicator(opt.key as IndicatorType)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: `1.5px solid ${isSelected ? opt.color : currentTheme.border}`,
                    background: isSelected 
                      ? `${opt.color}18`
                      : theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                    color: isSelected ? opt.color : currentTheme.text,
                    fontSize: 14,
                    fontWeight: isSelected ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 指标线设置区域 - 仅当有可配置指标时显示 */}
        {hasConfigurableIndicator && (
          <div style={{ marginTop: 20 }}>
            <div style={{
              fontSize: 14,
              fontWeight: 600,
              color: currentTheme.text,
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <span>指标线设置</span>
              <span style={{
                fontSize: 11,
                color: currentTheme.textSecondary,
                fontWeight: 400
              }}>（选择显示哪些线）</span>
            </div>

            {/* MA线设置 */}
            {mainOverlays.includes('ma') && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: currentTheme.textSecondary, marginBottom: 6 }}>MA线</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {[5, 10, 20, 60, 250].map(period => (
                    <button
                      key={period}
                      onClick={() => {
                        const newMa = indicatorLineSettings.ma.includes(period)
                          ? indicatorLineSettings.ma.filter(p => p !== period)
                          : [...indicatorLineSettings.ma, period].sort((a, b) => a - b);
                        setIndicatorLineSettings({ ma: newMa });
                      }}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: `1px solid ${indicatorLineSettings.ma.includes(period) ? '#1890ff' : currentTheme.border}`,
                        background: indicatorLineSettings.ma.includes(period) ? '#1890ff18' : 'transparent',
                        color: indicatorLineSettings.ma.includes(period) ? '#1890ff' : currentTheme.text,
                        fontSize: 12
                      }}
                    >
                      {period}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* EXPMA线设置 */}
            {mainOverlays.includes('expma') && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: currentTheme.textSecondary, marginBottom: 6 }}>EXPMA线</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {[5, 10, 20, 60, 250].map(period => (
                    <button
                      key={period}
                      onClick={() => {
                        const newExpma = indicatorLineSettings.expma.includes(period)
                          ? indicatorLineSettings.expma.filter(p => p !== period)
                          : [...indicatorLineSettings.expma, period].sort((a, b) => a - b);
                        setIndicatorLineSettings({ expma: newExpma });
                      }}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: `1px solid ${indicatorLineSettings.expma.includes(period) ? '#faad14' : currentTheme.border}`,
                        background: indicatorLineSettings.expma.includes(period) ? '#faad1418' : 'transparent',
                        color: indicatorLineSettings.expma.includes(period) ? '#faad14' : currentTheme.text,
                        fontSize: 12
                      }}
                    >
                      {period}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* BOLL线设置 */}
            {mainOverlays.includes('boll') && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: currentTheme.textSecondary, marginBottom: 6 }}>BOLL线</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {[{ key: 'upper', label: '上轨' }, { key: 'mid', label: '中轨' }, { key: 'lower', label: '下轨' }].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => {
                        const newBoll = indicatorLineSettings.boll.includes(key)
                          ? indicatorLineSettings.boll.filter(p => p !== key)
                          : [...indicatorLineSettings.boll, key];
                        setIndicatorLineSettings({ boll: newBoll });
                      }}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: `1px solid ${indicatorLineSettings.boll.includes(key) ? '#722ed1' : currentTheme.border}`,
                        background: indicatorLineSettings.boll.includes(key) ? '#722ed118' : 'transparent',
                        color: indicatorLineSettings.boll.includes(key) ? '#722ed1' : currentTheme.text,
                        fontSize: 12
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* KDJ线设置 */}
            {indicator === 'kdj' && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: currentTheme.textSecondary, marginBottom: 6 }}>KDJ线</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {[{ key: 'k', label: 'K' }, { key: 'd', label: 'D' }, { key: 'j', label: 'J' }].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => {
                        const newKdj = indicatorLineSettings.kdj.includes(key)
                          ? indicatorLineSettings.kdj.filter(p => p !== key)
                          : [...indicatorLineSettings.kdj, key];
                        setIndicatorLineSettings({ kdj: newKdj });
                      }}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: `1px solid ${indicatorLineSettings.kdj.includes(key) ? '#13c2c2' : currentTheme.border}`,
                        background: indicatorLineSettings.kdj.includes(key) ? '#13c2c218' : 'transparent',
                        color: indicatorLineSettings.kdj.includes(key) ? '#13c2c2' : currentTheme.text,
                        fontSize: 12
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* MACD线设置 */}
            {indicator === 'macd' && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: currentTheme.textSecondary, marginBottom: 6 }}>MACD线</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {[{ key: 'dif', label: 'DIF' }, { key: 'dea', label: 'DEA' }, { key: 'macd', label: 'MACD柱' }].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => {
                        const newMacd = indicatorLineSettings.macd.includes(key)
                          ? indicatorLineSettings.macd.filter(p => p !== key)
                          : [...indicatorLineSettings.macd, key];
                        setIndicatorLineSettings({ macd: newMacd });
                      }}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: `1px solid ${indicatorLineSettings.macd.includes(key) ? '#eb2f96' : currentTheme.border}`,
                        background: indicatorLineSettings.macd.includes(key) ? '#eb2f9618' : 'transparent',
                        color: indicatorLineSettings.macd.includes(key) ? '#eb2f96' : currentTheme.text,
                        fontSize: 12
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* DMI线设置 */}
            {indicator === 'dmi' && (
              <div>
                <div style={{ fontSize: 12, color: currentTheme.textSecondary, marginBottom: 6 }}>DMI线</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {[{ key: 'pdi', label: '+DI' }, { key: 'mdi', label: '-DI' }, { key: 'adx', label: 'ADX' }, { key: 'adxr', label: 'ADXR' }].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => {
                        const newDmi = indicatorLineSettings.dmi.includes(key)
                          ? indicatorLineSettings.dmi.filter(p => p !== key)
                          : [...indicatorLineSettings.dmi, key];
                        setIndicatorLineSettings({ dmi: newDmi });
                      }}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: `1px solid ${indicatorLineSettings.dmi.includes(key) ? '#52c41a' : currentTheme.border}`,
                        background: indicatorLineSettings.dmi.includes(key) ? '#52c41a18' : 'transparent',
                        color: indicatorLineSettings.dmi.includes(key) ? '#52c41a' : currentTheme.text,
                        fontSize: 12
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </>
    </BottomDrawer>
  );
};

export default IndicatorDrawer;
