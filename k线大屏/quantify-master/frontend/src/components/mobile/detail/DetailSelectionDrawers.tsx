/**
 * 移动端详情页 - 选择器抽屉组件
 * 包含周期、指标、时间范围选择抽屉
 */

import React from 'react';
import { SelectionDrawer } from '../SelectionDrawer.tsx';
import IndicatorDrawer from '../drawers/IndicatorDrawer.tsx';
import {
  PERIOD_OPTIONS,
  TIME_RANGE_OPTIONS,
  type Period,
} from '../constants.ts';
import type { DetailSelectionDrawersProps } from './types.ts';

export const DetailSelectionDrawers: React.FC<DetailSelectionDrawersProps> = ({
  theme,
  detailCurrentTsCode,
  detailDataType = 'stock',
  detailPeriodDrawerVisible,
  detailIndicatorDrawerVisible,
  detailTimeRangeDrawerVisible,
  setDetailPeriodDrawerVisible,
  setDetailIndicatorDrawerVisible,
  setDetailTimeRangeDrawerVisible,
  getPeriodForCode,
  getTimeRangeForCode,
  getIndicatorForCode,
  getMainOverlaysForCode,
  setPeriodForCode,
  setTimeRangeForCode,
  setIndicatorForCode,
  setMainOverlaysForCode,
}) => {
  return (
    <>
      {/* 详情页专用Drawer - 周期选择 */}
      <SelectionDrawer
        theme={theme}
        title="选择周期"
        open={detailPeriodDrawerVisible}
        onClose={() => setDetailPeriodDrawerVisible(false)}
        options={PERIOD_OPTIONS.map(item => ({
          key: item.value,
          value: item.value,
          label: item.label,
          icon: item.icon
        }))}
        selectedValue={getPeriodForCode(detailCurrentTsCode)}
        valueKey="value"
        onSelect={(option) => {
          setPeriodForCode(detailCurrentTsCode, option.value as Period);
        }}
      />

      {/* 详情页专用Drawer - 指标选择（支持主图叠加多选+副图单选） */}
      <IndicatorDrawer
        theme={theme}
        open={detailIndicatorDrawerVisible}
        onClose={() => setDetailIndicatorDrawerVisible(false)}
        dataType={detailDataType}
        period={getPeriodForCode(detailCurrentTsCode)}
        indicator={getIndicatorForCode(detailCurrentTsCode)}
        setIndicator={(ind) => setIndicatorForCode(detailCurrentTsCode, ind)}
        mainOverlays={getMainOverlaysForCode?.(detailCurrentTsCode) || []}
        setMainOverlays={setMainOverlaysForCode 
          ? (overlays) => setMainOverlaysForCode(detailCurrentTsCode, overlays)
          : undefined
        }
      />

      {/* 详情页专用Drawer - 范围选择 */}
      <SelectionDrawer
        theme={theme}
        title="选择范围"
        open={detailTimeRangeDrawerVisible}
        onClose={() => setDetailTimeRangeDrawerVisible(false)}
        options={TIME_RANGE_OPTIONS.map(item => ({
          key: String(item.value),
          value: item.value,
          label: item.label
        }))}
        selectedValue={String(getTimeRangeForCode(detailCurrentTsCode))}
        valueKey="value"
        onSelect={(option) => {
          setTimeRangeForCode(detailCurrentTsCode, option.value as number | string);
        }}
      />
    </>
  );
};
