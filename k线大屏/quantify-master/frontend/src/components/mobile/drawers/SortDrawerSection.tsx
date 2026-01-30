import React, { useMemo } from 'react';
import { List, Typography } from 'antd';
import { BottomDrawer } from '../BottomDrawer.tsx';
import { DrawerListItem } from '../DrawerListItem.tsx';
import { getThemeColors, type Theme } from '../theme.ts';
import { getSortOptions, type DataType, type Period } from '../constants.ts';

// 🚀 根据选项数量计算合适的高度
const calculateAutoHeight = (optionCount: number): string => {
  const itemHeight = 56;
  const headerHeight = 60;
  const safeAreaHeight = 20;
  const totalHeight = optionCount * itemHeight + headerHeight + safeAreaHeight;
  const minVh = 35;
  const maxVh = 75;
  const vh = Math.min(maxVh, Math.max(minVh, Math.ceil(totalHeight / window.innerHeight * 100)));
  return `${vh}vh`;
};

const { Text } = Typography;

interface SortDrawerSectionProps {
  theme: Theme;
  currentTheme: ReturnType<typeof getThemeColors>;
  dataType: DataType;
  period: Period;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  sortCategory: 'main' | 'auction';
  setSortCategory: (category: 'main' | 'auction') => void;
  sortDrawerVisible: boolean;
  setSortDrawerVisible: (visible: boolean) => void;
  setCurrentPage: (page: number) => void;
  setSortBy: (value: any) => void;
  setSortOrder: (order: 'asc' | 'desc') => void;
}

const SortDrawerSection: React.FC<SortDrawerSectionProps> = ({
  theme,
  currentTheme,
  dataType,
  period,
  sortBy,
  sortOrder,
  sortCategory,
  setSortCategory,
  sortDrawerVisible,
  setSortDrawerVisible,
  setCurrentPage,
  setSortBy,
  setSortOrder,
}) => {
  // 🚀 根据当前显示的选项数量动态计算高度
  const sortOptions = getSortOptions(dataType, period);
  const auctionChildren = sortOptions.find(item => item.key === 'auction')?.children || [];
  const currentOptions = sortCategory === 'main' ? sortOptions : auctionChildren;
  const drawerHeight = useMemo(() => calculateAutoHeight(currentOptions.length), [currentOptions.length]);

  return (
    <BottomDrawer
      theme={theme}
      title={sortCategory === 'auction' ? '开盘竞价排序' : '选择排序'}
      onBack={sortCategory === 'auction' ? () => setSortCategory('main') : undefined}
      height={drawerHeight}
      open={sortDrawerVisible}
      onClose={() => {
        setSortDrawerVisible(false);
        setSortCategory('main');
      }}
      zIndex={1001}
    >
      <List>
        {sortCategory === 'main' ? (
          // 主菜单
          getSortOptions(dataType, period).map(item => {
            const isItemSelected = sortBy === item.key && !item.children;
            const hasChildren = item.children && item.children.length > 0;
            
            return (
              <DrawerListItem
                key={item.key}
                theme={theme}
                selected={isItemSelected}
                onClick={() => {
                  if (hasChildren) {
                    // 有子菜单，展开二级菜单
                    setSortCategory('auction');
                  } else {
                    // 没有子菜单，直接选择
                    const newSortBy = item.key as any;
                    if (sortBy === newSortBy) {
                      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortBy(newSortBy);
                      // 名称和日期字段升序，其他字段降序（与桌面端一致）
                      const defaultOrder = ['call_countdown', 'issue_date', 'list_date', 'name', 'bond_short_name', 'concept_name', 'industry_name'].includes(newSortBy) ? 'asc' : 'desc';
                      setSortOrder(defaultOrder as 'asc' | 'desc');
                    }
                    setCurrentPage(1);
                    setSortDrawerVisible(false);
                  }
                }}
                label={item.label}
                extra={isItemSelected ? (
                  <Text style={{ color: '#fff', fontSize: '16px', fontWeight: 600 }}>
                    {sortOrder === 'asc' ? '↑' : '↓'}
                  </Text>
                ) : hasChildren ? (
                  <Text style={{ color: currentTheme.textSecondary, fontSize: '14px' }}>›</Text>
                ) : null}
              />
            );
          })
        ) : (
          // 集合竞价子菜单
          getSortOptions(dataType, period)
            .find(item => item.key === 'auction')?.children?.map(item => {
              const isItemSelected = sortBy === item.key;
              return (
                <DrawerListItem
                  key={item.key}
                  theme={theme}
                  selected={isItemSelected}
                  onClick={() => {
                    const newSortBy = item.key as any;
                    if (sortBy === newSortBy) {
                      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortBy(newSortBy);
                      setSortOrder('desc'); // 集合竞价字段默认降序
                    }
                    setCurrentPage(1);
                    setSortDrawerVisible(false);
                    setSortCategory('main');
                  }}
                  label={item.label}
                  extra={isItemSelected ? (
                    <Text style={{ color: '#fff', fontSize: '16px', fontWeight: 600 }}>
                      {sortOrder === 'asc' ? '↑' : '↓'}
                    </Text>
                  ) : null}
                />
              );
            })
        )}
      </List>
    </BottomDrawer>
  );
};

export default SortDrawerSection;
