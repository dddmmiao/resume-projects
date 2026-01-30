/**
 * 用户菜单组件
 * 显示用户信息和登出按钮
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dropdown, Avatar, message, Modal, Form, Input, Button, Select } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import authFetch from '../utils/authFetch.ts';
import { useAppStore } from '../stores/useAppStore.ts';

interface UserMenuProps {
  style?: React.CSSProperties;
}

interface PushPlusConfig {
  has_token: boolean;
  masked_token: string | null;
  qrcode_url: string | null;
  qrcode_enabled: boolean;
  can_use_system_token?: boolean;
}

const UserMenu: React.FC<UserMenuProps> = ({ style }) => {
  const navigate = useNavigate();
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [settingsVisible, setSettingsVisible] = useState(false);

  // PushPlus 配置状态
  const [pushplusConfig, setPushplusConfig] = useState<PushPlusConfig | null>(null);

  const dashboardTheme = useAppStore(state => state.dashboardTheme);
  const mobileTheme = useAppStore(state => state.mobileTheme);
  const setDashboardTheme = useAppStore(state => state.setDashboardTheme);
  const setMobileTheme = useAppStore(state => state.setMobileTheme);
  const crosshairMode = useAppStore(state => state.crosshairMode);
  const setCrosshairMode = useAppStore(state => state.setCrosshairMode);
  const dashboardLayout = useAppStore(state => state.dashboardLayout);
  const setDashboardLayout = useAppStore(state => state.setDashboardLayout);
  const [shortcutsExpanded, setShortcutsExpanded] = useState(false);
  const isMobileRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/mobile');
  const currentTheme = isMobileRoute ? mobileTheme : dashboardTheme;
  const themeOptions = [
    { value: 'dark', color: '#001529' },
    { value: 'light', color: '#f0f2f5' },
    { value: 'blue', color: '#001d3d' },
    { value: 'purple', color: '#1e1033' },
    { value: 'green', color: '#0f2f1f' },
    { value: 'orange', color: '#2f1f0f' },
    { value: 'cyan', color: '#002a2e' },
    { value: 'red', color: '#2a0f0f' },
    { value: 'gold', color: '#2a2400' },
  ];

  const [userInfo, setUserInfo] = useState<any>(null);

  // 从API获取用户信息
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const response = await authFetch('/api/user/profile');
        const data = await response.json();
        if (data.success) {
          setUserInfo(data.data);
        }
      } catch (error) {
        console.error('获取用户信息失败:', error);
      }
    };

    fetchUserProfile();
  }, []);
  const isAdmin = userInfo?.is_admin === true;
  const isSuperAdmin = userInfo?.is_super_admin === true;
  const hasAdminAccess = isAdmin || isSuperAdmin;

  // 登出处理
  const handleLogout = () => {
    localStorage.removeItem('access_token');
    message.success('已登出');
    navigate('/login');
  };

  // 打开个人信息编辑弹窗
  const handleOpenProfile = () => {
    form.setFieldsValue({
      nickname: userInfo?.nickname || '',
    });
    setProfileModalVisible(true);
  };

  // 保存个人信息
  const handleSaveProfile = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const response = await authFetch('/api/user/profile', {
        method: 'PUT',
        body: JSON.stringify(values),
      });

      const data = await response.json();
      if (data.success) {
        // 更新本地状态中的用户信息
        const updatedUserInfo = { ...userInfo, ...values };
        setUserInfo(updatedUserInfo);
        message.success('个人信息已更新');
        setProfileModalVisible(false);
      } else {
        message.error(data.message || '更新失败');
      }
    } catch (error) {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleThemeSelect = (value: string) => {
    if (isMobileRoute) {
      setMobileTheme(value as any);
    } else {
      setDashboardTheme(value as any);
    }
  };

  // 获取 PushPlus 配置
  useEffect(() => {
    if (settingsVisible) {
      fetchPushplusConfig();
    }
  }, [settingsVisible]);

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


  // 构建菜单项
  const buildMenuItems = (): MenuProps['items'] => {
    const items: MenuProps['items'] = [
      {
        key: 'info',
        label: (
          <div style={{ padding: '4px 0' }}>
            <div style={{ fontWeight: 500 }}>
              {userInfo?.nickname || userInfo?.username || '用户'}
            </div>
            {isSuperAdmin && (
              <div style={{ fontSize: '12px', color: '#faad14', marginTop: '4px' }}>超级管理员</div>
            )}
            {!isSuperAdmin && isAdmin && (
              <div style={{ fontSize: '12px', color: '#1890ff', marginTop: '4px' }}>管理员</div>
            )}
            {!isAdmin && !isSuperAdmin && (
              <div style={{ fontSize: '12px', color: '#8c8c8c', marginTop: '4px' }}>普通用户</div>
            )}
          </div>
        ),
        disabled: true,
      },
      {
        type: 'divider',
      },
      {
        key: 'profile',
        label: '编辑',
        onClick: handleOpenProfile,
      },
      {
        key: 'settings',
        label: '设置',
        onClick: () => setSettingsVisible(true),
      },
    ];

    // 只有管理员或超级管理员才显示"管理后台"按钮
    if (hasAdminAccess) {
      items.push({
        key: 'admin',
        label: '后台',
        onClick: () => navigate('/admin'),
      });
    }

    items.push(
      {
        type: 'divider',
      },
      {
        key: 'logout',
        label: '登出',
        onClick: handleLogout,
      }
    );

    return items;
  };

  const menuItems = buildMenuItems();

  // 移除阻止组件渲染的条件，让头像始终显示

  return (
    <>
      <Dropdown menu={{ items: menuItems }} placement="bottomRight">
        <div style={{
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          ...style
        }}>
          {/* 始终显示占位头像，不依赖API加载状态 */}
          <Avatar
            size="small"
            icon={<UserOutlined />}
            style={{
              backgroundColor: currentTheme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.16)',
              color: currentTheme === 'light' ? 'rgba(0,0,0,0.88)' : 'rgba(255,255,255,0.96)',
              borderRadius: '999px',
              border: currentTheme === 'light' ? '1px solid rgba(0,0,0,0.15)' : '1px solid rgba(255,255,255,0.35)',
              // 确保头像始终可见，不受加载状态影响
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '24px',
              minHeight: '24px'
            }}
          />
        </div>
      </Dropdown>

      {/* 个人信息编辑弹窗 */}
      <Modal
        title="编辑"
        open={profileModalVisible}
        onCancel={() => setProfileModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setProfileModalVisible(false)}>
            取消
          </Button>,
          <Button key="save" type="primary" loading={saving} onClick={handleSaveProfile}>
            保存
          </Button>,
        ]}
      >
        <Form form={form} layout="vertical" style={{ marginTop: '16px' }}>
          <Form.Item label="用户名">
            <Input value={userInfo?.username} disabled />
          </Form.Item>
          <Form.Item
            name="nickname"
            label="昵称"
            rules={[{ max: 50, message: '昵称最多50个字符' }]}
          >
            <Input placeholder="请输入昵称" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="设置"
        open={settingsVisible}
        onCancel={() => setSettingsVisible(false)}
        footer={null}
        width={480}
      >
        <div style={{ paddingTop: 8 }}>
          {/* 设置项容器 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* 主题设置行 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 0',
                borderBottom: '1px solid rgba(0,0,0,0.06)',
              }}
            >
              <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.88)' }}>主题</span>
              <Select
                value={currentTheme}
                onChange={handleThemeSelect}
                style={{ width: 140 }}
                size="small"
              >
                {themeOptions.map(option => (
                  <Select.Option key={option.value} value={option.value}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 4,
                          background: option.color,
                          border: '1px solid rgba(0,0,0,0.15)',
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: 13 }}>{option.value}</span>
                    </div>
                  </Select.Option>
                ))}
              </Select>
            </div>

            {/* 十字线模式设置行 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 0',
                borderBottom: '1px solid rgba(0,0,0,0.06)',
              }}
            >
              <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.88)' }}>十字线模式</span>
              <Select
                value={crosshairMode}
                onChange={(val) => setCrosshairMode(val as 0 | 1 | 2 | 3)}
                style={{ width: 140 }}
                size="small"
              >
                <Select.Option value={0}>无</Select.Option>
                <Select.Option value={1}>自由</Select.Option>
                <Select.Option value={2}>吸附</Select.Option>
                <Select.Option value={3}>双十字线</Select.Option>
              </Select>
            </div>

            {/* 桌面端布局设置行 */}
            {!isMobileRoute && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 0',
                  borderBottom: '1px solid rgba(0,0,0,0.06)',
                }}
              >
                <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.88)' }}>卡片布局</span>
                <Select
                  value={dashboardLayout}
                  onChange={(val) => setDashboardLayout(val as 'normal' | 'compact')}
                  style={{ width: 140 }}
                  size="small"
                >
                  <Select.Option value="normal">K线卡片</Select.Option>
                  <Select.Option value="compact">紧凑</Select.Option>
                </Select>
              </div>
            )}

            {/* 消息推送配置 */}
            {pushplusConfig?.qrcode_enabled && (
              <div style={{ paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 12
                }}>
                  <div style={{ fontSize: 14, color: 'rgba(0,0,0,0.88)' }}>消息推送</div>
                  {pushplusConfig?.has_token && !pushplusConfig?.qrcode_url && (
                    <Button
                      size="small"
                      type="link"
                      style={{ padding: 0, height: 'auto', fontSize: 12 }}
                      onClick={async () => {
                        const resp = await authFetch('/api/user/pushplus?rebind=true');
                        const data = await resp.json();
                        if (data.success) {
                          setPushplusConfig(data.data);
                        }
                      }}
                    >
                      重新绑定
                    </Button>
                  )}
                </div>

                {pushplusConfig?.has_token && !pushplusConfig?.qrcode_url ? (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 12px',
                    background: 'rgba(82, 196, 26, 0.06)',
                    borderRadius: 6,
                    border: '1px solid rgba(82, 196, 26, 0.2)',
                  }}>
                    <div style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: '#52c41a',
                      flexShrink: 0,
                    }} />
                    <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.65)' }}>
                      已绑定 {pushplusConfig.masked_token}
                    </span>
                  </div>
                ) : pushplusConfig?.qrcode_url ? (
                  <div style={{
                    padding: 16,
                    background: 'rgba(0,0,0,0.02)',
                    borderRadius: 8,
                  }}>
                    <div style={{
                      display: 'flex',
                      gap: 16,
                      alignItems: 'flex-start',
                    }}>
                      <img
                        src={pushplusConfig.qrcode_url}
                        alt="PushPlus二维码"
                        style={{
                          width: 120,
                          height: 120,
                          borderRadius: 6,
                          border: '1px solid rgba(0,0,0,0.08)',
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.88)', marginBottom: 8 }}>
                          绑定步骤
                        </div>
                        <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)', marginBottom: 4 }}>
                          1. 微信扫码添加好友
                        </div>
                        <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)', marginBottom: 12 }}>
                          2. 联系管理员获取令牌
                        </div>
                        <Input
                          placeholder="输入令牌"
                          size="small"
                          style={{ marginBottom: 8 }}
                          id="pushplus-token-input"
                        />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Button
                            size="small"
                            type="primary"
                            style={{ flex: 1 }}
                            onClick={async () => {
                              const input = document.getElementById('pushplus-token-input') as HTMLInputElement;
                              const token = input?.value?.trim();
                              if (!token) {
                                message.warning('请输入令牌');
                                return;
                              }
                              const resp = await authFetch('/api/user/pushplus', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ friend_token: token })
                              });
                              const data = await resp.json();
                              if (data.success) {
                                message.success('绑定成功');
                                const configResp = await authFetch('/api/user/pushplus');
                                const configData = await configResp.json();
                                if (configData.success) {
                                  setPushplusConfig(configData.data);
                                }
                              } else {
                                message.error(data.message || '绑定失败');
                              }
                            }}
                          >
                            确认绑定
                          </Button>
                          {pushplusConfig?.can_use_system_token && (
                            <Button
                              size="small"
                              style={{ flex: 1 }}
                              onClick={async () => {
                                const resp = await authFetch('/api/user/pushplus', {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ use_system_token: true })
                                });
                                const data = await resp.json();
                                if (data.success) {
                                  message.success('已使用系统Token');
                                  const configResp = await authFetch('/api/user/pushplus');
                                  const configData = await configResp.json();
                                  if (configData.success) {
                                    setPushplusConfig(configData.data);
                                  }
                                } else {
                                  message.error(data.message || '操作失败');
                                }
                              }}
                            >
                              使用系统Token
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    padding: 16,
                    textAlign: 'center',
                    color: 'rgba(0,0,0,0.45)',
                    fontSize: 13,
                  }}>
                    加载中...
                  </div>
                )}
              </div>
            )}

            {/* 键盘快捷键区域 - 可折叠 */}
            <div style={{ paddingTop: 12 }}>
              <div
                onClick={() => setShortcutsExpanded(!shortcutsExpanded)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.88)' }}>键盘快捷键</span>
                <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', transition: 'transform 0.2s' }}>
                  {shortcutsExpanded ? '收起 ▲' : '展开 ▼'}
                </span>
              </div>
              {shortcutsExpanded && (
                <div
                  style={{
                    background: 'rgba(0,0,0,0.02)',
                    borderRadius: 8,
                    padding: '8px 0',
                    marginTop: 4,
                  }}
                >
                  {/* 快捷键列表：专业的键位+说明布局 */}
                  {[
                    { keys: ['R', 'T'], desc: '切换主题' },
                    { keys: ['←', '↑', '→', '↓'], desc: '网格导航' },
                    { keys: ['Enter'], desc: '打开详情' },
                    { keys: ['Esc'], desc: '关闭详情' },
                    { keys: ['1', '-', '9'], desc: '快速切换自选分组' },
                    { keys: ['Double Click'], desc: '切换十字线模式' },
                    { keys: ['Tab'], desc: '切换画线类型' },
                    { keys: ['Del'], desc: '删除画线' },
                    { keys: ['⌘Z'], desc: '撤销操作' },
                  ].map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 12px',
                      }}
                    >
                      <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.65)' }}>{item.desc}</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {item.keys.map((key, i) => (
                          <kbd
                            key={i}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              minWidth: 24,
                              height: 22,
                              padding: '0 6px',
                              fontSize: 11,
                              fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                              fontWeight: 500,
                              color: 'rgba(0,0,0,0.75)',
                              background: '#fff',
                              border: '1px solid rgba(0,0,0,0.15)',
                              borderRadius: 4,
                            }}
                          >
                            {key}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginTop: 8, padding: '0 12px' }}>
                    提示：点击卡片获得焦点后，快捷键生效
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default UserMenu;
