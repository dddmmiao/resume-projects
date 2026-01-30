import React from 'react';
import { Select, Button } from 'antd';

type FavoriteGroups = {
  [groupName: string]: {
    stocks: string[];
    convertible_bonds: string[];
    concepts: string[];
    industries: string[];
  };
};

type FavoriteGroupSelectorProps = {
  theme: 'dark' | 'light' | 'blue' | 'purple' | 'green' | 'orange' | 'cyan' | 'red' | 'gold';
  favorites: FavoriteGroups;
  currentFavoriteGroup: string;
  onChange: (value: string) => void;
  width: number;
  inputStyle: React.CSSProperties;
  onManageGroups: () => void;
};

const FavoriteGroupSelector: React.FC<FavoriteGroupSelectorProps> = ({
  theme,
  favorites,
  currentFavoriteGroup,
  onChange,
  width,
  inputStyle,
  onManageGroups,
}) => {
  const themeAccentColor = React.useMemo(() => {
    switch (theme) {
      case 'blue': return '#177ddc';
      case 'purple': return '#722ed1';
      case 'green': return '#36b37e';
      case 'orange': return '#fa8c16';
      case 'cyan': return '#00aaaa';
      case 'red': return '#dc2626';
      case 'gold': return '#faad14';
      case 'light': return '#1677ff';
      default: return '#ffffff';
    }
  }, [theme]);

  return (
    <>
      <Select
        size="small"
        value={currentFavoriteGroup}
        onChange={onChange}
        style={{
          width,
          ...inputStyle,
          background: 'transparent',
          backgroundColor: 'transparent',
          display: 'inline-flex',
          alignItems: 'center'
        }}
        placeholder="选择分组"
        showSearch
        allowClear
      >
        {Object.keys(favorites).map(groupName => (
          <Select.Option key={groupName} value={groupName}>
            {groupName}
          </Select.Option>
        ))}
      </Select>

      <Button
        size="small"
        type="primary"
        style={{
          background: theme === 'light' ? themeAccentColor : 'rgba(255,255,255,0.15)',
          borderColor: theme === 'light' ? themeAccentColor : 'rgba(255,255,255,0.25)',
          color: '#ffffff'
        }}
        onClick={onManageGroups}
      >
        管理分组
      </Button>
    </>
  );
};

export default FavoriteGroupSelector;


