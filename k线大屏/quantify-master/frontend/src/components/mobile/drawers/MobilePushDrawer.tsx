import React, { useState, useEffect } from 'react';
import { Button, Input, Checkbox, InputNumber, Divider, Spin } from 'antd';
import { BottomDrawer } from '../BottomDrawer.tsx';
import { getThemeColors, type Theme } from '../theme.ts';

interface MobilePushDrawerProps {
  visible: boolean;
  onClose: () => void;
  theme: Theme;
  thsGroups: string[];
  total: number;
  onPush: (groupName: string, pushCount: number) => void;
  pushLoading?: boolean;
  onLoadGroups?: () => void; // 加载分组列表回调
}

const MobilePushDrawer: React.FC<MobilePushDrawerProps> = ({
  visible,
  onClose,
  theme,
  thsGroups,
  total,
  onPush,
  pushLoading,
  onLoadGroups,
}) => {
  const currentTheme = getThemeColors(theme);
  const [pushAll, setPushAll] = useState(true);
  const [customPushCount, setCustomPushCount] = useState<number | null>(20);
  const [inputGroupName, setInputGroupName] = useState('');
  
  // 打开抽屉时，如果分组列表为空则尝试加载
  useEffect(() => {
    if (visible && thsGroups.length === 0 && onLoadGroups) {
      onLoadGroups();
    }
  }, [visible, thsGroups.length, onLoadGroups]);

  // 计算实际推送数量：全部时为0，否则为用户输入值（限制在1-500之间）
  const effectivePushCount = pushAll ? 0 : Math.min(Math.max(customPushCount || 0, 1), Math.min(total, 500));

  const handlePushToGroup = (groupName: string) => {
    onPush(groupName, effectivePushCount);
    onClose();
  };

  const handlePushByInput = () => {
    const trimmed = inputGroupName.trim();
    if (!trimmed) return;
    onPush(trimmed, effectivePushCount);
    setInputGroupName('');
    onClose();
  };

  return (
    <BottomDrawer
      theme={theme}
      title="推送到同花顺分组"
      open={visible}
      onClose={onClose}
    >
      <Spin spinning={!!pushLoading}>
        {/* 推送数量选择 - 同一行，固定高度避免InputNumber撑高 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 16, height: 32 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: currentTheme.text, whiteSpace: 'nowrap' }}>推送数量</span>
          <Checkbox
            checked={pushAll}
            onChange={(e) => setPushAll(e.target.checked)}
          >
            <span style={{ fontSize: 14, color: currentTheme.text }}>全部</span>
          </Checkbox>
          {!pushAll && (
            <>
              <span style={{ fontSize: 14, color: currentTheme.textSecondary }}>前</span>
              <InputNumber
                size="small"
                min={1}
                max={Math.min(total, 500)}
                value={customPushCount}
                onChange={(v) => setCustomPushCount(v)}
                style={{ width: 60, height: 24 }}
              />
              <span style={{ fontSize: 14, color: currentTheme.textSecondary }}>个</span>
            </>
          )}
        </div>

        <Divider style={{ margin: '12px 0' }} />

        {/* 输入分组名称（在上） */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8, color: currentTheme.text }}>
            输入分组名称
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              placeholder="输入分组名称"
              value={inputGroupName}
              onChange={(e) => setInputGroupName(e.target.value)}
              onPressEnter={handlePushByInput}
              style={{ flex: 1 }}
            />
            <Button
              type="primary"
              onClick={handlePushByInput}
              disabled={!inputGroupName.trim()}
            >
              推送
            </Button>
          </div>
        </div>

        {/* 选择分组列表（在下） */}
        {thsGroups.length > 0 && (
          <>
            <Divider style={{ margin: '12px 0' }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8, color: currentTheme.text }}>
                选择分组
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {thsGroups.map((groupName) => (
                  <Button
                    key={groupName}
                    block
                    onClick={() => handlePushToGroup(groupName)}
                    style={{
                      textAlign: 'left',
                      height: 'auto',
                      padding: '10px 12px',
                      background: currentTheme.card,
                      borderColor: currentTheme.border,
                      color: currentTheme.text,
                    }}
                  >
                    {groupName}
                  </Button>
                ))}
              </div>
            </div>
          </>
        )}
      </Spin>
    </BottomDrawer>
  );
};

export default MobilePushDrawer;
