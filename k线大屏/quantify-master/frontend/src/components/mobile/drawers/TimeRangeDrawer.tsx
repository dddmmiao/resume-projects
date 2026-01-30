import React from 'react';
import { SelectionDrawer } from '../SelectionDrawer.tsx';
import { type Theme } from '../theme.ts';
import { TIME_RANGE_OPTIONS } from '../constants.ts';

interface TimeRangeDrawerProps {
  theme: Theme;
  open: boolean;
  onClose: () => void;
  timeRange: number | string;
  setTimeRange: (val: number | string) => void;
  setCurrentPage: (page: number) => void;
}

const TimeRangeDrawer: React.FC<TimeRangeDrawerProps> = ({
  theme,
  open,
  onClose,
  timeRange,
  setTimeRange,
  setCurrentPage,
}) => {
  return (
    <SelectionDrawer
      theme={theme}
      title="选择范围"
      open={open}
      onClose={onClose}
      options={TIME_RANGE_OPTIONS.map(item => ({
        key: String(item.value),
        value: String(item.value), // 统一转为字符串比较
        label: item.label
      }))}
      selectedValue={String(timeRange)}
      valueKey="value"
      onSelect={(option) => {
        // 转换回原始类型
        const val = option.key;
        setTimeRange(val === 'all' ? 'all' : Number(val));
        setCurrentPage(1);
      }}
    />
  );
};

export default TimeRangeDrawer;
