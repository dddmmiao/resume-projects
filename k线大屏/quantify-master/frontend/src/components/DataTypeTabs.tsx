import React from 'react';

type DataType = 'stock' | 'convertible_bond' | 'concept' | 'industry' | 'favorites';

interface Props {
  theme: string;
  value: DataType;
  onChange: (v: DataType) => void;
}

const DataTypeTabs: React.FC<Props> = ({ theme, value, onChange }) => {
  const options: Array<{ label: string; value: DataType }> = [
    { label: '📈 股票', value: 'stock' },
    { label: '💱 可转债', value: 'convertible_bond' },
    { label: '🧠 概念', value: 'concept' },
    { label: '🏭 行业', value: 'industry' },
    { label: '⭐ 自选', value: 'favorites' },
  ];

  return (
    <div className="custom-data-type-tabs" style={{
      display: 'flex',
      gap: '0px',
      alignItems: 'center',
      background: theme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)',
      borderRadius: '8px',
      padding: '2px',
      border: theme === 'light' ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.1)'
    }}>
      {options.map(option => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          style={{
            border: 'none',
            outline: 'none',
            background: 'transparent',
            padding: '6px 10px',
            cursor: 'pointer',
            borderRadius: '6px',
            transition: 'all 0.2s ease',
            color: value === option.value ? (theme === 'light' ? '#1677ff' : '#1890ff') : (theme === 'light' ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.85)'),
            backgroundColor: value === option.value ? (theme === 'light' ? '#e6f4ff' : 'rgba(24, 144, 255, 0.15)') : 'transparent',
            boxShadow: value === option.value ? (theme === 'light' ? 'inset 0 0 0 1px #91caff' : 'none') : 'none'
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

export default DataTypeTabs;

