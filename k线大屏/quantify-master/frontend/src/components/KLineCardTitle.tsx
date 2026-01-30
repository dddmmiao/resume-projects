import React, { useState } from 'react';
import FavoriteGroupsDropdown from './FavoriteGroupsDropdown.tsx';
import HotInfoModal from './HotInfoModal.tsx';
import HotFlameIcon from './HotFlameIcon.tsx';

interface Props {
  theme: string;
  item: any;
  dataType: 'stock' | 'convertible_bond' | 'concept' | 'industry' | 'concept' | 'industry';
  name: string;
  isHot?: boolean;
  isInFavoritesMode: boolean;
  isCardHovered: boolean;
  isCardFocused: boolean;
  favoriteGroups: string[];
  isInFavorites?: (ts_code: string, groupName: string, itemType?: string) => boolean;
  onAddToFavorites?: (itemCode: string, groupName?: string, itemType?: string) => void;
  onRemoveFromFavorites?: (itemCode: string, groupName?: string, itemType?: string) => void;
  getEastMoneyUrl: (item: any, type: string) => string;
  linkOnClickStopPropagation?: boolean;
  onConceptFilter?: (concept: string) => void;
}

const KLineCardTitle: React.FC<Props> = ({
  theme,
  item,
  dataType,
  name,
  isHot = false,
  isInFavoritesMode,
  isCardHovered,
  isCardFocused,
  favoriteGroups,
  isInFavorites,
  onAddToFavorites,
  onRemoveFromFavorites,
  getEastMoneyUrl,
  linkOnClickStopPropagation = false,
  onConceptFilter,
}) => {
  const [hotInfoModalVisible, setHotInfoModalVisible] = useState(false);

  // 判断是否有有效的热度概念和上榜原因
  const hasValidConcept = item?.hot_concept && typeof item.hot_concept === 'string' && item.hot_concept.trim().length > 0;
  const hasValidReason = item?.hot_rank_reason && typeof item.hot_rank_reason === 'string' && item.hot_rank_reason.trim().length > 0;
  
  // 只有当至少有一个有效数据时才允许点击
  const canOpenModal = hasValidConcept || hasValidReason;

  const handleHotIconClick = (e: React.MouseEvent) => {
    if (!canOpenModal) {
      return; // 如果没有有效数据，不打开弹窗
    }
    e.preventDefault();
    e.stopPropagation();
    setHotInfoModalVisible(true);
  };

  // 渲染火苗图标，根据数据情况显示不同颜色
  // 两个数据都缺少用橙色，否则用红色
  const renderFlameIcon = () => {
    // 两个都没有：橙色，否则：红色
    const flameColor = (!hasValidConcept && !hasValidReason) ? "#ff9800" : "#ff4d4f";
    
    if (!canOpenModal) {
      // 两个都没有：显示1个橙色火苗，不可点击
      return (
        <span 
          style={{ 
            display: 'inline-flex',
            alignItems: 'center',
            cursor: 'not-allowed',
            opacity: 1
          }}
        >
          <HotFlameIcon color={flameColor} size={12} />
        </span>
      );
    } else {
      // 至少有一个数据：显示1个红色火苗，可点击
      return (
        <span 
          style={{ 
            display: 'inline-flex',
            alignItems: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          onClick={handleHotIconClick}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <HotFlameIcon color={flameColor} size={12} />
        </span>
      );
    }
  };

  return (
    <>
      <div className="stock-title" style={{ fontSize: 14, fontWeight: 700 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isHot && renderFlameIcon()}
          <a
            href={getEastMoneyUrl(item, dataType)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'inherit', textDecoration: 'none', cursor: 'pointer', transition: 'all 0.2s ease' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#1890ff';
              e.currentTarget.style.textDecoration = 'underline';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'inherit';
              e.currentTarget.style.textDecoration = 'none';
            }}
            onClick={(e) => {
              if (linkOnClickStopPropagation) e.stopPropagation();
            }}
          >
            {name}
          </a>

        {isInFavorites && onAddToFavorites && onRemoveFromFavorites && (
          <div className="favorite-button-container" style={{ position: 'relative', visibility: (isInFavoritesMode || isCardHovered) ? 'visible' : 'hidden', pointerEvents: (isInFavoritesMode || isCardHovered) ? 'auto' : 'none', transition: 'visibility 0.2s ease' }}>
            <FavoriteGroupsDropdown
              theme={theme}
              item={item}
              isInFavoritesMode={isInFavoritesMode}
              isCardHovered={isCardHovered}
              isCardFocused={isCardFocused}
              favoriteGroups={favoriteGroups}
              isInFavorites={isInFavorites}
              onAddToFavorites={onAddToFavorites}
              onRemoveFromFavorites={onRemoveFromFavorites}
            />
          </div>
        )}
      </div>
    </div>
    
    <HotInfoModal
      open={hotInfoModalVisible}
      onClose={() => setHotInfoModalVisible(false)}
      hotConcept={item?.hot_concept}
      hotRankReason={item?.hot_rank_reason}
      theme={theme as 'dark' | 'light' | 'blue' | 'purple' | 'green' | 'orange' | 'cyan' | 'red' | 'gold'}
      dataType={dataType}
      onConceptFilter={onConceptFilter}
    />
    </>
  );
};

export default KLineCardTitle;

