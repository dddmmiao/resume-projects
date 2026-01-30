import React from 'react';
import { SelectionDrawer } from '../SelectionDrawer.tsx';
import { type Theme } from '../theme.ts';
import { PERIOD_OPTIONS, type Period } from '../constants.ts';

interface PeriodDrawerProps {
  theme: Theme;
  open: boolean;
  onClose: () => void;
  period: Period;
  setPeriod: (p: Period) => void;
  setCurrentPage: (page: number) => void;
}

const PeriodDrawer: React.FC<PeriodDrawerProps> = ({
  theme,
  open,
  onClose,
  period,
  setPeriod,
  setCurrentPage,
}) => {
  return (
    <SelectionDrawer
      theme={theme}
      title="选择周期"
      open={open}
      onClose={onClose}
      options={PERIOD_OPTIONS.map(item => ({
        key: item.value,
        value: item.value,
        label: item.label,
        icon: item.icon
      }))}
      selectedValue={period}
      valueKey="value"
      onSelect={(option) => {
        setPeriod(option.value as Period);
        setCurrentPage(1);
      }}
    />
  );
};

export default PeriodDrawer;
