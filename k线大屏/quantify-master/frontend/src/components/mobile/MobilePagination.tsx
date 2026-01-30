import React from 'react';
import { Button } from 'antd';
import { LeftOutlined, RightOutlined, LoadingOutlined } from '@ant-design/icons';
import { getThemeColors } from './theme.ts';
import type { Theme } from './theme.ts';

interface MobilePaginationProps {
  theme: Theme;
  dataType: string;
  searchKeyword: string;
  total: number;
  currentPage: number;
  pageSize: number;
  loading: boolean;
  onPageChange: (page: number) => void;
}

const MobilePagination: React.FC<MobilePaginationProps> = ({
  theme,
  dataType,
  searchKeyword,
  total,
  currentPage,
  pageSize,
  loading,
  onPageChange
}) => {
  const currentTheme = getThemeColors(theme);
  const totalPages = Math.ceil(total / pageSize);
  
  const getDataTypeName = () => {
    switch (dataType) {
      case 'stock': return '股票';
      case 'convertible_bond': return '可转债';
      case 'concept': return '概念';
      case 'industry': return '行业';
      case 'favorites': return '自选';
      default: return '项目';
    }
  };

  return (
    <div style={{
      background: currentTheme.card,
      border: `1px solid ${currentTheme.border}`,
      borderRadius: 6,
      padding: '8px 12px',
      margin: '8px 4px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontSize: 12
    }}>
      {/* 左侧：统计信息 */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 6,
        color: currentTheme.textSecondary,
        fontSize: 11,
        flex: 1
      }}>
        {loading ? (
          <>
            <LoadingOutlined style={{ fontSize: 10 }} />
            <span style={{ color: currentTheme.textSecondary }}>加载中...</span>
          </>
        ) : (
          <>
            <span>
              共 {total} 个{getDataTypeName()}
            </span>
            {searchKeyword && (
              <span style={{ color: currentTheme.primary }}>
                "{searchKeyword}"
              </span>
            )}
          </>
        )}
      </div>

      {/* 右侧：分页控制 */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 8 
      }}>
        <Button
          size="small"
          icon={<LeftOutlined />}
          disabled={currentPage <= 1 || loading}
          onClick={(e) => {
            e.currentTarget.blur(); // 移除焦点，防止浏览器滚动到焦点元素
            onPageChange(currentPage - 1);
          }}
          style={{
            minWidth: 28,
            height: 28,
            padding: 0,
            border: 'none',
            background: 'transparent',
            color: currentPage <= 1 ? currentTheme.textSecondary : currentTheme.text
          }}
        />
        
        <span style={{ 
          color: currentTheme.text,
          fontWeight: 500,
          minWidth: 60,
          textAlign: 'center'
        }}>
          {currentPage} / {totalPages}
        </span>
        
        <Button
          size="small"
          icon={<RightOutlined />}
          disabled={currentPage >= totalPages || loading}
          onClick={(e) => {
            e.currentTarget.blur(); // 移除焦点，防止浏览器滚动到焦点元素
            onPageChange(currentPage + 1);
          }}
          style={{
            minWidth: 28,
            height: 28,
            padding: 0,
            border: 'none',
            background: 'transparent',
            color: currentPage >= totalPages ? currentTheme.textSecondary : currentTheme.text
          }}
        />
      </div>
    </div>
  );
};

export default MobilePagination;
