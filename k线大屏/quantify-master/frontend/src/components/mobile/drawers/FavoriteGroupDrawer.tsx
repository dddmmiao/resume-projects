import React, { useState, useMemo } from 'react';
import { List, Input, Button, Typography } from 'antd';
import { BottomDrawer } from '../BottomDrawer.tsx';
import { DrawerListItem } from '../DrawerListItem.tsx';
import { getThemeColors, type Theme } from '../theme.ts';

const { Text } = Typography;

interface FavoriteGroupDrawerProps {
  theme: Theme;
  open: boolean;
  onClose: () => void;
  onBack?: () => void; // 🚀 返回上级半屏（标的类型选择页）
  groups: string[];
  currentGroup: string;
  onSelectGroup: (groupName: string) => void;
  onCreateGroup?: (groupName: string) => void;
  onDeleteGroup?: (groupName: string) => Promise<void> | void; // 支持异步删除
}

const FavoriteGroupDrawer: React.FC<FavoriteGroupDrawerProps> = ({
  theme,
  open,
  onClose,
  onBack,
  groups,
  currentGroup,
  onSelectGroup,
  onCreateGroup,
  onDeleteGroup,
}) => {
  const currentTheme = useMemo(() => getThemeColors(theme), [theme]);
  const [newGroupName, setNewGroupName] = useState('');
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const MAX_GROUP_NAME_LENGTH = 20;

  const handleCreate = () => {
    const trimmedName = newGroupName.trim();
    if (!trimmedName) return;
    if (trimmedName.length > MAX_GROUP_NAME_LENGTH) {
      return; // 输入框已限制，此处为双重保险
    }
    if (onCreateGroup) {
      onCreateGroup(trimmedName);
      setNewGroupName('');
    }
  };

  const handleDeleteClick = (groupName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setGroupToDelete(groupName);
    setDeleteConfirmVisible(true);
  };

  const handleDeleteConfirm = async () => {
    if (groupToDelete && onDeleteGroup) {
      setDeleteLoading(true);
      try {
        await onDeleteGroup(groupToDelete);
        setDeleteConfirmVisible(false);
        setGroupToDelete(null);
      } finally {
        setDeleteLoading(false);
      }
    }
  };

  return (
    <>
      <BottomDrawer
        theme={theme}
        title="选择自选分组"
        onBack={() => {
          onClose();
          onBack?.();
        }}
        open={open}
        onClose={onClose}
        maxHeight="70vh"
      >
        {/* 创建分组区域 */}
        {onCreateGroup && (
          <div style={{ 
            display: 'flex', 
            gap: 8, 
            marginBottom: 12,
            padding: '0 4px'
          }}>
            <Input
              placeholder="输入新分组名称"
              value={newGroupName}
              onChange={(e) => {
                const val = e.target.value;
                if (val.length <= MAX_GROUP_NAME_LENGTH) {
                  setNewGroupName(val);
                }
              }}
              onPressEnter={handleCreate}
              maxLength={MAX_GROUP_NAME_LENGTH}
              showCount
              style={{ 
                flex: 1,
                background: theme === 'light' ? '#fff' : 'rgba(255,255,255,0.08)',
                borderColor: currentTheme.border,
                color: currentTheme.text
              }}
            />
            <Button 
              onClick={handleCreate}
              disabled={!newGroupName.trim()}
              style={{
                background: newGroupName.trim() ? currentTheme.primary : currentTheme.card,
                borderColor: newGroupName.trim() ? currentTheme.primary : currentTheme.border,
                color: newGroupName.trim() ? '#ffffff' : currentTheme.textSecondary,
                borderRadius: '8px',
                fontWeight: 500
              }}
            >
              创建
            </Button>
          </div>
        )}

        {/* 分组列表 */}
        <List>
          {(groups || []).map((groupName) => {
            const isSelected = currentGroup === groupName;
            // 超长截断显示
            const displayName = groupName.length > 12 
              ? groupName.slice(0, 12) + '...' 
              : groupName;
            return (
              <DrawerListItem
                key={groupName}
                theme={theme}
                selected={isSelected}
                onClick={() => {
                  onSelectGroup(groupName);
                  onClose();
                }}
                label={displayName}
                extra={
                  onDeleteGroup ? (
                    <Text
                      onClick={(e) => handleDeleteClick(groupName, e)}
                      style={{ 
                        color: isSelected ? 'rgba(255,255,255,0.7)' : currentTheme.textSecondary, 
                        fontSize: '12px',
                        padding: '4px 8px',
                        borderRadius: 4,
                        background: isSelected ? 'rgba(255,255,255,0.1)' : 'transparent'
                      }}
                    >
                      删除
                    </Text>
                  ) : null
                }
              />
            );
          })}
        </List>

        {/* 空状态提示 */}
        {(!groups || groups.length === 0) && (
          <div style={{ 
            textAlign: 'center', 
            padding: '40px 20px',
            color: currentTheme.textSecondary 
          }}>
            暂无自选分组，请先创建
          </div>
        )}
      </BottomDrawer>

      {/* 删除确认弹窗 - 使用底部半屏样式 */}
      <BottomDrawer
        theme={theme}
        title="确认删除"
        open={deleteConfirmVisible}
        onClose={() => {
          setDeleteConfirmVisible(false);
          setGroupToDelete(null);
        }}
        height="auto"
        zIndex={1100}
      >
        <div style={{ padding: '5px 10px' }}>
          <p style={{ color: currentTheme.text, fontSize: 15, marginBottom: 8 }}>
            确定要删除分组「{groupToDelete}」吗？
          </p>
          <p style={{ color: currentTheme.textSecondary, fontSize: 13, marginBottom: 20 }}>
            删除后该分组内的股票将不再显示在自选列表中
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <Button 
              block 
              onClick={() => {
                setDeleteConfirmVisible(false);
                setGroupToDelete(null);
              }}
              style={{ 
                height: 48,
                borderRadius: 12,
                fontWeight: 500,
                background: currentTheme.card,
                borderColor: currentTheme.border,
                color: currentTheme.text
              }}
            >
              取消
            </Button>
            <Button 
              block 
              onClick={handleDeleteConfirm}
              loading={deleteLoading}
              disabled={deleteLoading}
              style={{ 
                height: 48, 
                borderRadius: 12,
                fontWeight: 500,
                background: currentTheme.positive,
                borderColor: currentTheme.positive,
                color: '#ffffff'
              }}
            >
              {deleteLoading ? '删除中' : '删除'}
            </Button>
          </div>
        </div>
      </BottomDrawer>
    </>
  );
};

export default FavoriteGroupDrawer;
