import React, { useEffect, useState, useCallback } from 'react';
import { Drawer, Input, Button, Space, Typography, message } from 'antd';
import { getThemeColors, type Theme } from '../theme.ts';
import authFetch from '../../../utils/authFetch.ts';
import { useAppStore } from '../../../stores/useAppStore.ts';

interface THSCookieDrawerProps {
  theme: Theme;
  open: boolean;
  onClose: () => void;
  thsUsername: string;
  onUpdated?: () => void;
}

const { Text } = Typography;

const THSCookieDrawer: React.FC<THSCookieDrawerProps> = ({ theme, open, onClose, thsUsername, onUpdated }) => {
  const currentTheme = getThemeColors(theme);
  const getAccountByName = useAppStore(state => state.getAccountByName);
  const [cookieStr, setCookieStr] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasCookies, setHasCookies] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchStatus = useCallback(() => {
    // 从store获取账号状态，避免重复API调用
    const account = getAccountByName(thsUsername);
    setHasCookies(Boolean(account?.is_online));
    setLastUpdated(account?.last_login_at || null);
  }, [thsUsername, getAccountByName]);

  useEffect(() => {
    if (open) fetchStatus();
  }, [open, fetchStatus]);

  const handleSave = async () => {
    if (!cookieStr.trim()) {
      message.warning('请先粘贴 Cookie 字符串');
      return;
    }
    try {
      setLoading(true);
      const res = await authFetch('/api/admin/ths/cookies/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-THS-User-Key': thsUsername,
        },
        body: JSON.stringify({ cookie_str: cookieStr.trim() }),
      });
      const json = await res.json();
      if (res.ok && json?.success !== false) {
        setCookieStr('');
        await fetchStatus();
        onUpdated?.();
      } else {
        message.error(json?.message || '更新失败');
      }
    } catch (e: any) {
      message.error(e?.message || '更新 Cookie 失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/admin/ths/cookies', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-THS-User-Key': thsUsername,
        },
      });
      const json = await res.json();
      if (res.ok && json?.success !== false) {
        await fetchStatus();
      } else {
        message.error(json?.message || '删除失败');
      }
    } catch (e: any) {
      message.error(e?.message || '删除 Cookie 失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Drawer
      className={theme === 'dark' ? 'mobile-drawer-dark' : 'mobile-drawer-light'}
      title="同花顺 Cookie 配置"
      placement="bottom"
      onClose={onClose}
      open={open}
      height="65vh"
      styles={{
        body: { background: currentTheme.bg, color: currentTheme.text, padding: '16px' },
        header: { background: currentTheme.bg, borderBottom: `1px solid ${currentTheme.border}`, color: currentTheme.text },
      }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <Text style={{ color: hasCookies ? '#52c41a' : currentTheme.textSecondary }}>
            {hasCookies ? '已配置 Cookie' : '未配置 Cookie'}
          </Text>
          <div style={{ color: currentTheme.textSecondary, marginTop: 4 }}>
            最近更新：{lastUpdated ? new Date(lastUpdated).toLocaleString() : '无'}
          </div>
        </div>

        <Input.TextArea
          placeholder="粘贴整行 Cookie（浏览器网络面板中复制 Cookie: 冒号后的整行）"
          value={cookieStr}
          onChange={(e) => setCookieStr(e.target.value)}
          autoSize={{ minRows: 4, maxRows: 8 }}
        />

        <Space style={{ width: '100%' }}>
          <Button 
            loading={loading} 
            onClick={handleSave}
            style={{
              background: currentTheme.primary,
              borderColor: currentTheme.primary,
              color: '#ffffff',
              borderRadius: '12px',
              fontWeight: 500,
              height: '48px',
              paddingLeft: '24px',
              paddingRight: '24px'
            }}
          >
            保存
          </Button>
          {hasCookies && (
            <Button 
              loading={loading} 
              onClick={handleDelete}
              style={{
                background: currentTheme.positive,
                borderColor: currentTheme.positive,
                color: '#ffffff',
                borderRadius: '12px',
                fontWeight: 500,
                height: '48px',
                paddingLeft: '24px',
                paddingRight: '24px'
              }}
            >
              删除
            </Button>
          )}
        </Space>
      </Space>
    </Drawer>
  );
};

export default THSCookieDrawer;
