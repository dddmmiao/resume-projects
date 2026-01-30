import React from 'react';
import { SelectionDrawer } from '../SelectionDrawer.tsx';
import { type Theme } from '../theme.ts';
import { useStrategiesMeta } from '../../../strategies/useStrategiesMeta.ts';

interface StrategyDrawerProps {
  theme: Theme;
  open: boolean;
  onClose: () => void;
  strategy: string;
  setStrategy: (s: string) => void;
  setStrategyConfigVisible: (visible: boolean) => void;
  setStrategyParams: (params: any | null) => void;
  setCurrentPage: (page: number) => void;
  dataType?: 'stock' | 'convertible_bond' | 'concept' | 'industry' | 'favorites';
}

const StrategyDrawer: React.FC<StrategyDrawerProps> = ({
  theme,
  open,
  onClose,
  strategy,
  setStrategy,
  setStrategyConfigVisible,
  setStrategyParams,
  setCurrentPage,
  dataType,
}) => {
  const { strategies } = useStrategiesMeta();

  const availableStrategies = strategies.filter(meta => {
    if (!dataType || dataType === 'favorites') return false;
    // convertible_bond在前端显示层使用，但策略元数据中使用bond
    const matchType = dataType === 'convertible_bond' ? 'bond' : dataType;
    return meta.supportedDataTypes.includes(matchType as any);
  });

  const options = [
    { key: '', label: '无' },
    ...availableStrategies.map(meta => ({ key: meta.key, label: meta.label })),
  ];
  return (
    <SelectionDrawer
      theme={theme}
      title="选择策略"
      open={open}
      onClose={onClose}
      options={options}
      selectedValue={strategy}
      onSelect={(option) => {
        const newStrategy = option.key as string;
        setStrategy(newStrategy);
        if (!newStrategy) {
          setStrategyParams(null);
        } else {
          setStrategyConfigVisible(true);
        }
      }}
    />
  );
};

export default StrategyDrawer;
