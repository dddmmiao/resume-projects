import React, { useMemo } from 'react';
import { List, Typography } from 'antd';
import { BottomDrawer } from '../BottomDrawer.tsx';
import { DrawerListItem } from '../DrawerListItem.tsx';
import { getThemeColors, type Theme } from '../theme.ts';
import { DATA_TYPE_OPTIONS, type DataType, type IndicatorType } from '../constants.ts';

const { Text } = Typography;

interface DataTypeDrawerProps {
  theme: Theme;
  open: boolean;
  onClose: () => void;
  dataType: DataType;
  indicator: IndicatorType;
  setDataType: (dt: DataType) => void;
  setIndicator: (ind: IndicatorType) => void;
  setCurrentPage: (page: number) => void;
  onSelectFavorites?: () => void; // 移动端：选择“自选”时，先展开分组选择
}

const DataTypeDrawer: React.FC<DataTypeDrawerProps> = ({
  theme,
  open,
  onClose,
  dataType,
  indicator,
  setDataType,
  setIndicator,
  setCurrentPage,
  onSelectFavorites,
}) => {
  const currentTheme = useMemo(() => getThemeColors(theme), [theme]);

  return (
    <BottomDrawer
      theme={theme}
      title="选择类型"
      open={open}
      onClose={onClose}
    >
      <List>
        {DATA_TYPE_OPTIONS.map(item => {
          const isSelected = dataType === item.key;
          const isFavorites = item.key === 'favorites';
          
          return (
            <DrawerListItem
              key={item.key}
              theme={theme}
              selected={isSelected}
              onClick={() => {
                const newDataType = item.key as DataType;
                if (newDataType === 'favorites' && typeof onSelectFavorites === 'function') {
                  onSelectFavorites();
                  onClose();
                  return;
                }
                setDataType(newDataType);
                setCurrentPage(1);
                if (newDataType !== 'stock' && indicator === 'auction') {
                  setIndicator('none');
                }
                onClose();
              }}
              label={item.label}
              icon={item.icon}
              extra={isFavorites ? (
                <Text style={{ color: currentTheme.textSecondary, fontSize: '14px' }}>›</Text>
              ) : null}
            />
          );
        })}
      </List>
    </BottomDrawer>
  );
};

export default DataTypeDrawer;
