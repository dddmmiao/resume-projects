import React from 'react';
import { Modal, Input, Button } from 'antd';

type FavoriteGroups = {
  [groupName: string]: {
    stocks: string[];
    convertible_bonds: string[];
    concepts: string[];
    industries: string[];
  };
};

type FavoriteGroupsModalProps = {
  open: boolean;
  onCancel: () => void;
  favorites: FavoriteGroups;
  currentFavoriteGroup: string;
  newGroupName: string;
  editingGroupName: string | null;
  editingNewName: string;
  setNewGroupName: (name: string) => void;
  setEditingGroupName: (name: string | null) => void;
  setEditingNewName: (name: string) => void;
  createFavoriteGroup: (name: string) => void;
  renameFavoriteGroup: (oldName: string, newName: string) => void;
  deleteFavoriteGroup: (name: string) => void;
};

const MAX_GROUP_NAME_LENGTH = 20;

const FavoriteGroupsModal: React.FC<FavoriteGroupsModalProps> = ({
  open,
  onCancel,
  favorites,
  currentFavoriteGroup,
  newGroupName,
  editingGroupName,
  editingNewName,
  setNewGroupName,
  setEditingGroupName,
  setEditingNewName,
  createFavoriteGroup,
  renameFavoriteGroup,
  deleteFavoriteGroup,
}) => {
  return (
    <Modal
      title="管理自选分组"
      open={open}
      onCancel={onCancel}
      footer={null}
      width={600}
      zIndex={10200}
      style={{ zIndex: 10200 }}
    >
      <div style={{ marginBottom: '16px' }}>
        <Input
          placeholder="输入新分组名称"
          value={newGroupName}
          onChange={(e) => {
            const val = e.target.value;
            if (val.length <= MAX_GROUP_NAME_LENGTH) {
              setNewGroupName(val);
            }
          }}
          onPressEnter={() => {
            if (newGroupName.trim() && newGroupName.trim().length <= MAX_GROUP_NAME_LENGTH) {
              createFavoriteGroup(newGroupName.trim());
              setNewGroupName('');
            }
          }}
          maxLength={MAX_GROUP_NAME_LENGTH}
          showCount
          style={{ marginBottom: '8px' }}
        />
        <Button
          type="primary"
          onClick={() => {
            createFavoriteGroup(newGroupName);
            setNewGroupName('');
          }}
          disabled={!newGroupName.trim()}
          style={{ width: '100%' }}
        >
          创建分组
        </Button>
      </div>

      <div>
        <h4>现有分组：</h4>
        {Object.entries(favorites).map(([groupName, group]) => {
          return (
            <div
              key={groupName}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                border: '1px solid #d9d9d9',
                borderRadius: '4px',
                marginBottom: '8px',
                backgroundColor: currentFavoriteGroup === groupName ? '#f0f8ff' : 'transparent'
              }}
            >
              <div style={{ flex: 1 }}>
                {editingGroupName === groupName ? (
                  <Input
                    size="small"
                    value={editingNewName}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.length <= MAX_GROUP_NAME_LENGTH) {
                        setEditingNewName(val);
                      }
                    }}
                    onPressEnter={() => {
                      if (editingNewName.trim() && editingNewName.trim().length <= MAX_GROUP_NAME_LENGTH) {
                        renameFavoriteGroup(groupName, editingNewName.trim());
                        setEditingGroupName(null);
                        setEditingNewName('');
                      }
                    }}
                    onBlur={() => {
                      setEditingGroupName(null);
                      setEditingNewName('');
                    }}
                    autoFocus
                    maxLength={MAX_GROUP_NAME_LENGTH}
                    style={{ width: '150px' }}
                  />
                ) : (
                  <div title={groupName} style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <strong>{groupName}</strong>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                {groupName !== '默认分组' && (
                  <>
                    <Button
                      size="small"
                      onClick={() => {
                        setEditingGroupName(groupName);
                        setEditingNewName(groupName);
                      }}
                    >
                      重命名
                    </Button>
                    <Button
                      size="small"
                      danger
                      onClick={() => deleteFavoriteGroup(groupName)}
                    >
                      删除
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
};

export default FavoriteGroupsModal;


