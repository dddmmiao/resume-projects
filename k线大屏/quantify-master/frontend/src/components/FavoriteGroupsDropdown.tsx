import React from 'react';
import { Dropdown, Button } from 'antd';

interface Props {
  theme: string;
  item: any;
  isInFavoritesMode: boolean;
  isCardHovered: boolean;
  isCardFocused: boolean;
  favoriteGroups: string[];
  isInFavorites: (ts_code: string, groupName: string, itemType?: string) => boolean;
  onAddToFavorites: (itemCode: string, groupName?: string, itemType?: string) => void;
  onRemoveFromFavorites: (itemCode: string, groupName?: string, itemType?: string) => void;
}

const FavoriteGroupsDropdown: React.FC<Props> = ({
  theme,
  item,
  isInFavoritesMode,
  isCardHovered,
  isCardFocused,
  favoriteGroups,
  isInFavorites,
  onAddToFavorites,
  onRemoveFromFavorites,
}) => {
  const overlayItems = [
    ...favoriteGroups.map((groupName, index) => {
      const itemType = isInFavoritesMode ? item.type : undefined;
      const isInGroup = isInFavorites(item.ts_code, groupName, itemType);
      return {
        key: groupName,
        label: (
          <span style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            minWidth: '120px',
            color: theme === 'light' ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)'
          }}>
            <span style={{ display: 'flex', alignItems: 'center' }}>
              {isCardFocused && index < 9 && (
                <kbd style={{
                  background: 'rgba(255,255,255,0.2)',
                  padding: '1px 3px',
                  borderRadius: '2px',
                  marginRight: '4px',
                  fontSize: '9px',
                  border: '1px solid rgba(255,255,255,0.3)'
                }}>
                  {index + 1}
                </kbd>
              )}
              <span>{groupName}</span>
            </span>
            <span style={{
              color: isInGroup ? '#52c41a' : (theme === 'light' ? '#999' : '#666'),
              fontSize: '12px',
              marginLeft: '8px'
            }}>
              {isInGroup ? '✓' : '+'}
            </span>
          </span>
        ),
        onClick: (e: any) => {
          e?.domEvent?.stopPropagation();
          if (isInGroup) {
            onRemoveFromFavorites(item.ts_code, groupName, itemType);
          } else {
            onAddToFavorites(item.ts_code, groupName, itemType);
          }
        }
      } as any;
    }),
    ...(favoriteGroups.length > 0 ? [{ type: 'divider' as const }] : []),
    {
      key: 'manage',
      label: (
        <span style={{ color: theme === 'light' ? '#1890ff' : '#40a9ff' }}>
          ⚙️ 管理分组
        </span>
      ),
      onClick: (e: any) => {
        e?.domEvent?.stopPropagation();
        const event = new CustomEvent('openFavoriteModal');
        window.dispatchEvent(event);
      }
    }
  ];

  const isInAnyGroup = favoriteGroups.some(groupName =>
    isInFavorites(item.ts_code, groupName, isInFavoritesMode ? item.type : undefined)
  );

  return (
    <Dropdown
      menu={{ items: overlayItems }}
      overlayClassName={`favorite-dropdown-${theme}`}
      trigger={['click']}
      placement="bottomRight"
      getPopupContainer={() => document.body}
      onOpenChange={(open) => {
        if (open) {
          // reserved for future side-effects
        }
      }}
    >
      <Button
        type="text"
        size="small"
        style={{
          padding: '0 4px',
          height: '20px',
          fontSize: '14px',
          color: isInAnyGroup ? '#faad14' : 'rgba(255,255,255,0.65)',
          border: 'none'
        }}
        title="管理自选分组"
      >
        {isInAnyGroup ? '⭐' : '☆'}
      </Button>
    </Dropdown>
  );
};

export default FavoriteGroupsDropdown;

