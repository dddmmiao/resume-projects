import React, { useState, useEffect } from 'react';
import { BottomDrawer } from '../BottomDrawer.tsx';
import { getThemeColors, type Theme } from '../theme.ts';
import type { Layout as LayoutType } from '../constants.ts';
import { useAppStore } from '../../../stores/useAppStore.ts';
import authFetch from '../../../utils/authFetch.ts';

interface SettingsDrawerProps {
  theme: Theme;
  currentTheme: ReturnType<typeof getThemeColors>;
  open: boolean;
  onClose: () => void;
  onThemeChange: (theme: string) => void;
  layout: LayoutType;
  setLayout: (layout: LayoutType) => void;
  localCrosshairMode: 1 | 2 | 3;
  setLocalCrosshairMode: (mode: 1 | 2 | 3) => void;
}

interface PushPlusConfig {
  has_token: boolean;
  masked_token: string | null;
  qrcode_url: string | null;
  qrcode_enabled: boolean;
  can_use_system_token?: boolean;
}

const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  theme,
  currentTheme,
  open,
  onClose,
  onThemeChange,
  layout,
  setLayout,
  localCrosshairMode,
  setLocalCrosshairMode,
}) => {
  const setCrosshairMode = useAppStore((state) => state.setCrosshairMode);
  
  // PushPlus 配置状态
  const [pushplusConfig, setPushplusConfig] = useState<PushPlusConfig | null>(null);

  // 获取 PushPlus 配置
  useEffect(() => {
    if (open) {
      fetchPushplusConfig();
    }
  }, [open]);

  const fetchPushplusConfig = async () => {
    try {
      const response = await authFetch('/api/user/pushplus');
      const data = await response.json();
      if (data.success) {
        setPushplusConfig(data.data);
      }
    } catch (error) {
      console.error('获取PushPlus配置失败:', error);
    }
  };


  return (
    <BottomDrawer 
      theme={theme}
      title="设置"
      onClose={onClose} 
      open={open}
      zIndex={1003}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* 主题设置 */}
        <div>
          <div style={{ 
            color: currentTheme.text, 
            fontSize: '14px', 
            fontWeight: 600,
            marginBottom: '12px',
            marginTop: '10px' 
          }}>
            主题设置
          </div>
          <div style={{ 
            display: 'flex', 
            gap: '8px',
            background: theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
            padding: '4px',
            borderRadius: '8px',
            transition: 'none'
          }}>
            <button
              type="button"
              onClick={() => onThemeChange('light')}
              style={{
                flex: 1,
                padding: '10px',
                border: 'none',
                borderRadius: '6px',
                background: theme === 'light' ? currentTheme.positive : 'transparent',
                color: theme === 'light' ? '#fff' : currentTheme.text,
                fontSize: '14px',
                fontWeight: theme === 'light' ? 600 : 400,
                cursor: 'pointer',
                transition: 'none'
              }}
            >
              ☀️ 浅色
            </button>
            <button
              type="button"
              onClick={() => onThemeChange('dark')}
              style={{
                flex: 1,
                padding: '10px',
                border: 'none',
                borderRadius: '6px',
                background: theme === 'dark' ? currentTheme.positive : 'transparent',
                color: theme === 'dark' ? '#fff' : currentTheme.text,
                fontSize: '14px',
                fontWeight: theme === 'dark' ? 600 : 400,
                cursor: 'pointer',
                transition: 'none'
              }}
            >
              🌙 深色
            </button>
          </div>
        </div>
        
        {/* 布局模式 */}
        <div>
          <div style={{ 
            color: currentTheme.text, 
            fontSize: '14px', 
            fontWeight: 600,
            marginBottom: '12px' 
          }}>
            布局模式
          </div>
          <div style={{ 
            display: 'flex', 
            gap: '8px',
            background: theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
            padding: '4px',
            borderRadius: '8px',
            transition: 'none'
          }}>
            <button
              type="button"
              onClick={() => setLayout('grid')}
              style={{
                flex: 1,
                padding: '10px',
                border: 'none',
                borderRadius: '6px',
                background: layout === 'grid' ? currentTheme.positive : 'transparent',
                color: layout === 'grid' ? '#fff' : currentTheme.text,
                fontSize: '14px',
                fontWeight: layout === 'grid' ? 600 : 400,
                cursor: 'pointer',
                transition: 'none'
              }}
            >
              宫格
            </button>
            <button
              type="button"
              onClick={() => setLayout('large')}
              style={{
                flex: 1,
                padding: '10px',
                border: 'none',
                borderRadius: '6px',
                background: layout === 'large' ? currentTheme.positive : 'transparent',
                color: layout === 'large' ? '#fff' : currentTheme.text,
                fontSize: '14px',
                fontWeight: layout === 'large' ? 600 : 400,
                cursor: 'pointer',
                transition: 'none'
              }}
            >
              卡片
            </button>
          </div>
        </div>
        
        {/* 十字线类型 */}
        <div>
          <div style={{ 
            color: currentTheme.text, 
            fontSize: '14px', 
            fontWeight: 600,
            marginBottom: '12px' 
          }}>
            十字线类型
          </div>
          <div style={{ 
            display: 'flex', 
            gap: '8px',
            background: theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
            padding: '4px',
            borderRadius: '8px',
            transition: 'none'
          }}>
            <button
              type="button"
              onClick={() => {
                const mode = 1 as 1 | 2 | 3;
                setLocalCrosshairMode(mode);
                setCrosshairMode(mode); // 更新全局 store
                window.dispatchEvent(new CustomEvent('crosshairModeChanged', { detail: { mode } }));
              }}
              style={{
                flex: 1,
                padding: '10px',
                border: 'none',
                borderRadius: '6px',
                background: localCrosshairMode === 1 ? currentTheme.positive : 'transparent',
                color: localCrosshairMode === 1 ? '#fff' : currentTheme.text,
                fontSize: '14px',
                fontWeight: localCrosshairMode === 1 ? 600 : 400,
                cursor: 'pointer',
                transition: 'none'
              }}
            >
              自由
            </button>
            <button
              type="button"
              onClick={() => {
                const mode = 2 as 1 | 2 | 3;
                setLocalCrosshairMode(mode);
                setCrosshairMode(mode); // 更新全局 store
                window.dispatchEvent(new CustomEvent('crosshairModeChanged', { detail: { mode } }));
              }}
              style={{
                flex: 1,
                padding: '10px',
                border: 'none',
                borderRadius: '6px',
                background: localCrosshairMode === 2 ? currentTheme.positive : 'transparent',
                color: localCrosshairMode === 2 ? '#fff' : currentTheme.text,
                fontSize: '14px',
                fontWeight: localCrosshairMode === 2 ? 600 : 400,
                cursor: 'pointer',
                transition: 'none'
              }}
            >
              吸附
            </button>
            <button
              type="button"
              onClick={() => {
                const mode = 3 as 1 | 2 | 3;
                setLocalCrosshairMode(mode);
                setCrosshairMode(mode); // 更新全局 store
                window.dispatchEvent(new CustomEvent('crosshairModeChanged', { detail: { mode } }));
              }}
              style={{
                flex: 1,
                padding: '10px',
                border: 'none',
                borderRadius: '6px',
                background: localCrosshairMode === 3 ? currentTheme.positive : 'transparent',
                color: localCrosshairMode === 3 ? '#fff' : currentTheme.text,
                fontSize: '14px',
                fontWeight: localCrosshairMode === 3 ? 600 : 400,
                cursor: 'pointer',
                transition: 'none'
              }}
            >
              双十字线
            </button>
          </div>
        </div>

        {/* 消息推送设置 */}
        {pushplusConfig?.qrcode_enabled && (
          <div>
            <div style={{ 
              color: currentTheme.text, 
              fontSize: '14px', 
              fontWeight: 600,
              marginBottom: '12px' 
            }}>
              消息推送
            </div>
            <div style={{
              padding: '12px',
              background: theme === 'light' ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)',
              borderRadius: '8px',
              border: `1px solid ${currentTheme.border}`,
              textAlign: 'center',
            }}>
              {pushplusConfig?.has_token && !pushplusConfig?.qrcode_url ? (
                <>
                  <div style={{
                    fontSize: '13px',
                    color: currentTheme.positive,
                    marginBottom: '8px',
                  }}>
                    ✓ 已绑定：{pushplusConfig.masked_token}
                  </div>
                  <button
                    onClick={async () => {
                      const resp = await authFetch('/api/user/pushplus?rebind=true');
                      const data = await resp.json();
                      if (data.success) {
                        setPushplusConfig(data.data);
                      }
                    }}
                    style={{
                      padding: '4px 12px',
                      fontSize: '12px',
                      background: 'transparent',
                      border: `1px solid ${currentTheme.border}`,
                      borderRadius: '4px',
                      color: currentTheme.text,
                      cursor: 'pointer',
                    }}
                  >
                    重新绑定
                  </button>
                </>
              ) : pushplusConfig?.qrcode_url ? (
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                  {/* 左侧：二维码 */}
                  <div style={{ flexShrink: 0 }}>
                    <img
                      src={pushplusConfig.qrcode_url}
                      alt="PushPlus二维码"
                      style={{
                        width: '100px',
                        height: '100px',
                        borderRadius: '6px',
                        border: `1px solid ${currentTheme.border}`,
                      }}
                    />
                  </div>
                  {/* 右侧：说明和操作 */}
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{
                      fontSize: '12px',
                      color: currentTheme.textSecondary,
                      marginBottom: '8px',
                      lineHeight: 1.5,
                    }}>
                      1. 微信扫码添加好友<br/>
                      2. 获取令牌后粘贴绑定
                    </div>
                    <input
                      type="text"
                      placeholder="粘贴好友令牌"
                      id="mobile-pushplus-token-input"
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        fontSize: '13px',
                        border: `1px solid ${currentTheme.border}`,
                        borderRadius: '4px',
                        background: theme === 'light' ? '#fff' : 'rgba(255,255,255,0.08)',
                        color: currentTheme.text,
                        marginBottom: '8px',
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={async () => {
                          const input = document.getElementById('mobile-pushplus-token-input') as HTMLInputElement;
                          const token = input?.value?.trim();
                          if (!token) return;
                          const resp = await authFetch('/api/user/pushplus', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ friend_token: token })
                          });
                          const data = await resp.json();
                          if (data.success) {
                            const configResp = await authFetch('/api/user/pushplus');
                            const configData = await configResp.json();
                            if (configData.success) {
                              setPushplusConfig(configData.data);
                            }
                          }
                        }}
                        style={{
                          padding: '8px 0',
                          fontSize: '13px',
                          background: currentTheme.primary || '#1890ff',
                          border: 'none',
                          borderRadius: '4px',
                          color: '#fff',
                          cursor: 'pointer',
                          flex: 1,
                        }}
                      >
                        绑定
                      </button>
                      {pushplusConfig?.can_use_system_token && (
                        <button
                          onClick={async () => {
                            const resp = await authFetch('/api/user/pushplus', {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ use_system_token: true })
                            });
                            const data = await resp.json();
                            if (data.success) {
                              const configResp = await authFetch('/api/user/pushplus');
                              const configData = await configResp.json();
                              if (configData.success) {
                                setPushplusConfig(configData.data);
                              }
                            }
                          }}
                          style={{
                            padding: '8px 0',
                            fontSize: '13px',
                            background: currentTheme.positive || '#52c41a',
                            border: 'none',
                            borderRadius: '4px',
                            color: '#fff',
                            cursor: 'pointer',
                            flex: 1,
                          }}
                        >
                          用系统Token
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{
                  fontSize: '13px',
                  color: currentTheme.textSecondary,
                }}>
                  二维码获取中...
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </BottomDrawer>
  );
};

export default SettingsDrawer;
