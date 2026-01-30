import React, { useMemo } from 'react';
import { List } from 'antd';
import { StarOutlined, StarFilled } from '@ant-design/icons';
import { BottomDrawer } from '../BottomDrawer.tsx';
import { DrawerListItem } from '../DrawerListItem.tsx';
import { type Theme } from '../theme.ts';

interface FavoriteAddDrawerProps {
  theme: Theme;
  open: boolean;
  onClose: () => void;
  item: any;
  favoriteGroups: string[];
  isInFavorites: (ts_code: string, groupName: string, itemType?: string) => boolean;
  onAddToFavorites: (itemCode: string, groupName?: string, itemType?: string) => void;
  onRemoveFromFavorites: (itemCode: string, groupName?: string, itemType?: string) => void;
}

// 根据选项数量计算合适的高度
const calculateAutoHeight = (optionCount: number): string => {
  const itemHeight = 56;
  const headerHeight = 60;
  const contentPadding = 24;
  const safeAreaHeight = 20;
  const totalHeight = optionCount * itemHeight + headerHeight + contentPadding + safeAreaHeight;
  const minVh = 30;
  const maxVh = 60;
  const vh = Math.min(maxVh, Math.max(minVh, Math.ceil(totalHeight / window.innerHeight * 100)));
  return `${vh}vh`;
};

const FavoriteAddDrawer: React.FC<FavoriteAddDrawerProps> = ({
  theme,
  open,
  onClose,
  item,
  favoriteGroups,
  isInFavorites,
  onAddToFavorites,
  onRemoveFromFavorites,
}) => {
  const tsCode = item?.ts_code || item?.concept_code || item?.industry_code || '';
  const itemType = item?.data_type || item?.type;

  const handleGroupClick = (groupName: string) => {
    const isInGroup = isInFavorites(tsCode, groupName, itemType);
    if (isInGroup) {
      onRemoveFromFavorites(tsCode, groupName, itemType);
    } else {
      onAddToFavorites(tsCode, groupName, itemType);
    }
  };

  const drawerHeight = useMemo(() => {
    return calculateAutoHeight(favoriteGroups.length);
  }, [favoriteGroups.length]);

  return (
    <BottomDrawer
      theme={theme}
      open={open}
      onClose={onClose}
      title="添加到自选"
      maxHeight={drawerHeight}
    >
      <List
        dataSource={favoriteGroups}
        locale={{ emptyText: '暂无分组，请先创建分组' }}
        renderItem={(groupName: string) => {
          const isInGroup = isInFavorites(tsCode, groupName, itemType);
          return (
            <DrawerListItem
              key={groupName}
              theme={theme}
              selected={isInGroup}
              onClick={() => handleGroupClick(groupName)}
              label={groupName}
              extra={
                <span style={{ 
                  color: isInGroup ? '#faad14' : undefined, 
                  fontSize: 18,
                  display: 'flex',
                  alignItems: 'center',
                }}>
                  {isInGroup ? <StarFilled /> : <StarOutlined />}
                </span>
              }
            />
          );
        }}
      />
    </BottomDrawer>
  );
};

export default FavoriteAddDrawer;
