/**
 * 移动端详情页 - 头部组件
 * 包含标题、代码、热度图标、切换按钮等
 */

import React from 'react';
import { StarOutlined, StarFilled } from '@ant-design/icons';
import HotFlameIcon from '../../HotFlameIcon.tsx';
import { getEastMoneyUrl, stripCodeSuffix } from '../utils.ts';
import type { DetailHeaderSectionProps } from './types.ts';

export const DetailHeader: React.FC<DetailHeaderSectionProps> = ({
  currentTheme,
  selectedStock,
  detailCurrentTsCode,
  detailCurrentName,
  detailDataType,
  dataType,
  originalSelectedStock,
  isShowingUnderlying,
  isShowingBond,
  setDetailCurrentTsCode,
  setDetailCurrentName,
  setDetailDataType,
  setIsShowingUnderlying,
  setIsShowingBond,
  setTagsModalVisible,
  setCallRecordsModalVisible,
  handleDetailClose,
  isHot,
  flameColor,
  canOpenModal,
  handleHotIconClick,
  favoriteGroups,
  isInFavorites,
  onFavoriteClick,
}) => {
  // 判断是否已收藏
  const isStarred = favoriteGroups && favoriteGroups.length > 0 && isInFavorites && 
    favoriteGroups.some(g => isInFavorites(detailCurrentTsCode, g, detailDataType));
  // 包装关闭处理函数，添加日志
  const handleCloseWithLog = (e: React.MouseEvent | React.TouchEvent) => {
    // 阻止事件冒泡和默认行为，防止穿透到下层列表页
    e.stopPropagation();
    e.preventDefault();
    handleDetailClose();
  };

  return (
    <>
      {/* 第一行：名称 + code + 关闭按钮 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginBottom: 10,
        gap: 8
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 8,
          flex: 1,
          minWidth: 0
        }}>
          {/* 收藏星星图标 */}
          {onFavoriteClick && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onFavoriteClick();
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                cursor: 'pointer',
                flexShrink: 0,
                marginBottom: 2,
                color: isStarred ? '#faad14' : currentTheme.textSecondary,
                fontSize: 18,
              }}
            >
              {isStarred ? <StarFilled /> : <StarOutlined />}
            </span>
          )}
          {/* 火苗图标 */}
          {isHot && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                cursor: canOpenModal ? 'pointer' : 'not-allowed',
                flexShrink: 0,
                marginBottom: 2
              }}
              onClick={handleHotIconClick}
              onTouchStart={(e) => {
                if (canOpenModal) {
                  e.currentTarget.style.transform = 'scale(1.1)';
                }
              }}
              onTouchEnd={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <HotFlameIcon color={flameColor} size={18} />
            </span>
          )}
          <a
            href={getEastMoneyUrl({
              ts_code: detailCurrentTsCode,
              name: detailCurrentName,
              ...selectedStock
            }, detailDataType)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: currentTheme.text,
              textDecoration: 'none',
              lineHeight: 1.2
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {detailCurrentName}
          </a>
          <span style={{
            fontSize: 12,
            color: currentTheme.textSecondary,
            fontFamily: 'monospace',
            fontWeight: 600,
            marginBottom: 2
          }}>
            {stripCodeSuffix(detailCurrentTsCode)}
          </span>
        </div>
        <button
          onClick={handleCloseWithLog}
          onTouchEnd={handleCloseWithLog}
          tabIndex={0}
          className="detail-close-button"
          style={{
            color: currentTheme.textSecondary,
            padding: 4,
            minWidth: 'auto',
            flexShrink: 0,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            userSelect: 'none',
            WebkitTapHighlightColor: 'transparent',
            touchAction: 'manipulation',
            background: 'transparent',
            border: 'none',
            lineHeight: 1,
            WebkitAppearance: 'none',
            appearance: 'none'
          }}
          aria-label="关闭"
        >
          ✕
        </button>
      </div>

      {/* 第二行：切换按钮 + 标签 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: 10,
        flexWrap: 'wrap'
      }}>
        {/* 切换按钮 */}
        {(detailDataType === 'convertible_bond' || selectedStock.bond_short_name) && selectedStock.stk_code && selectedStock.stk_short_name && (
          <button
            type="button"
            onClick={() => {
              if (isShowingUnderlying) {
                setDetailCurrentTsCode(originalSelectedStock.ts_code || originalSelectedStock.code);
                setDetailCurrentName(originalSelectedStock.bond_short_name || originalSelectedStock.name);
                setDetailDataType('convertible_bond');
                setIsShowingUnderlying(false);
              } else {
                setDetailCurrentTsCode(selectedStock.stk_code);
                setDetailCurrentName(selectedStock.stk_short_name);
                setDetailDataType('stock');
                setIsShowingUnderlying(true);
              }
            }}
            style={{
              background: '#52c41a',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              padding: '3px 8px',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {isShowingUnderlying ? '转债' : '正股'}
          </button>
        )}

        {(detailDataType === 'stock' || (!selectedStock.bond_short_name && selectedStock.ts_code)) && selectedStock.convertible_bonds && Array.isArray(selectedStock.convertible_bonds) && selectedStock.convertible_bonds.length > 0 && (
          selectedStock.convertible_bonds.map((bond: any, index: number) => (
            <button
              type="button"
              key={index}
              onClick={() => {
                if (isShowingBond && detailCurrentTsCode === bond.ts_code) {
                  setDetailCurrentTsCode(originalSelectedStock.ts_code || originalSelectedStock.code);
                  setDetailCurrentName(originalSelectedStock.name);
                  setDetailDataType('stock');
                  setIsShowingBond(false);
                } else {
                  setDetailCurrentTsCode(bond.ts_code);
                  setDetailCurrentName(bond.bond_short_name || bond.name);
                  setDetailDataType('convertible_bond');
                  setIsShowingBond(true);
                }
              }}
              style={{
                background: '#722ed1',
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                padding: '3px 8px',
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {isShowingBond && detailCurrentTsCode === bond.ts_code ? '股票' : '转债'}
            </button>
          ))
        )}

        {/* 标签 - 合并概念和行业 */}
        {((selectedStock.concepts && Array.isArray(selectedStock.concepts) && selectedStock.concepts.length > 0) ||
          (selectedStock.industries && Array.isArray(selectedStock.industries) && selectedStock.industries.length > 0)) && (
          <button
            type="button"
            onClick={() => setTagsModalVisible(true)}
            style={{
              background: currentTheme.primary,
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              padding: '3px 8px',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            概念/行业
          </button>
        )}

        {(dataType === 'convertible_bond' || selectedStock.bond_short_name) && selectedStock.call_records && Array.isArray(selectedStock.call_records) && selectedStock.call_records.length > 0 && (
          <button
            type="button"
            onClick={() => setCallRecordsModalVisible(true)}
            style={{
              background: '#722ed1',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              padding: '3px 8px',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            赎回 {selectedStock.call_records.length}
          </button>
        )}
      </div>
    </>
  );
};
