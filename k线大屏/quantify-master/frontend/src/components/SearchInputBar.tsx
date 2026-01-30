import React from 'react';
import { Input } from 'antd';

interface SearchInputBarProps {
  theme: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  inputStyle?: React.CSSProperties;
}

const SearchInputBar: React.FC<SearchInputBarProps> = ({ theme, value, onChange, onSubmit, inputStyle }) => {
  const wrapperStyle: React.CSSProperties = {
    width: 160,
    display: 'inline-flex',
    alignItems: 'center'
  } as const;

  const mergedInputStyle: React.CSSProperties = {
    width: '100%',
    backgroundImage: 'none',
    ...(inputStyle || {})
  } as const;

  return (
    <div className={`search-input-wrapper theme-${theme}`} style={wrapperStyle}>
      <Input
        placeholder={`搜索名称/代码`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPressEnter={() => onSubmit(value)}
        style={mergedInputStyle}
        size="small"
        allowClear
        className="custom-search-input"
      />
    </div>
  );
};

export default SearchInputBar;

