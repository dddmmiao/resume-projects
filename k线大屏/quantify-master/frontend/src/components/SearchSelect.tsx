import React, { useMemo, useRef, useState } from 'react';
import { Input, Button } from 'antd';

type Option = { label: string; value: string };

interface SearchSelectProps {
  placeholder: string;
  fetchOptions: (keyword: string) => Promise<Option[]>;
  selectedValues: string[];
  selectedNames: Record<string, string>;
  onChangeSelected: (values: string[], names: Record<string, string>) => void;
}

const SearchSelect: React.FC<SearchSelectProps> = ({
  placeholder,
  fetchOptions,
  selectedValues,
  selectedNames,
  onChangeSelected
}) => {
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [options, setOptions] = useState<Option[]>([]);
  const lastSearchRef = useRef<string>('');

  const filteredOptions = useMemo(() => {
    return options.filter(o => !selectedValues.includes(o.value));
  }, [options, selectedValues]);

  const handleChange = async (value: string) => {
    setSearchKeyword(value);
    if (value && value.trim()) {
      lastSearchRef.current = value;
      try {
        const result = await fetchOptions(value);
        setOptions(result || []);
      } catch {
        setOptions([]);
      }
    }
  };

  const handleSubmit = async (value: string) => {
    setSearchKeyword(value);
    if (!value || !value.trim()) return;
    if (lastSearchRef.current === value) return;
    lastSearchRef.current = value;
    try {
      const result = await fetchOptions(value);
      setOptions(result || []);
    } catch {
      setOptions([]);
    }
  };

  const addSelection = (option: Option) => {
    if (selectedValues.includes(option.value)) return;
    const newValues = [...selectedValues, option.value];
    const newNames = { ...selectedNames, [option.value]: option.label };
    onChangeSelected(newValues, newNames);
    setSearchKeyword('');
  };

  const removeSelection = (value: string) => {
    const newValues = selectedValues.filter(v => v !== value);
    const newNames = { ...selectedNames };
    delete newNames[value];
    onChangeSelected(newValues, newNames);
  };

  return (
    <div style={{ marginBottom: '0px' }}>
      <Input.Search
        placeholder={placeholder}
        value={searchKeyword}
        onChange={(e) => handleChange(e.target.value)}
        onSearch={handleSubmit}
        size="small"
        allowClear
      />

      {/* 下拉匹配结果 - 内联显示，不使用绝对定位 */}
      {searchKeyword && searchKeyword.trim() && (
        <div style={{
          marginTop: '4px',
          backgroundColor: 'white',
          border: '1px solid #d9d9d9',
          borderRadius: '4px',
          maxHeight: '150px',
          overflowY: 'auto'
        }}>
          {filteredOptions.map((option) => (
            <div
              key={option.value}
              style={{
                padding: '6px 10px',
                borderBottom: '1px solid #f0f0f0',
                cursor: 'pointer',
                fontSize: '12px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
              onClick={() => addSelection(option)}
            >
              {option.label}
            </div>
          ))}
          {filteredOptions.length === 0 && (
            <div style={{ padding: '8px 10px', fontSize: '12px', color: '#999' }}>暂无结果</div>
          )}
        </div>
      )}

      {/* 已选项 - 只在有选择时显示，自动换行 */}
      {selectedValues.length > 0 && (
        <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {selectedValues.map((value) => (
            <div
              key={value}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                maxWidth: '100%',
                backgroundColor: '#f5f5f5',
                borderRadius: '6px',
                border: '1px solid #d9d9d9',
                padding: '2px 6px',
                gap: 6
              }}
            >
              <span style={{ color: '#595959', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedNames[value] || value}
              </span>
              <Button
                type="text"
                size="small"
                danger
                onClick={() => removeSelection(value)}
                style={{
                  color: '#ff0000',
                  fontSize: '12px',
                  padding: '0 4px',
                  height: '18px',
                  lineHeight: '18px',
                  minWidth: '18px',
                  borderRadius: '4px'
                }}
              >
                ×
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchSelect;


