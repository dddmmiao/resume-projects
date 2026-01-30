import React, { useEffect, useState, useCallback } from 'react';
import { Modal, Form, Input, Button, Space, Typography, Alert, message } from 'antd';
import { SettingOutlined, DeleteOutlined } from '@ant-design/icons';
import axiosInstance from '../utils/axios.ts';
import { getThsUsername } from '../utils/userKey.ts';
import { useAppStore } from '../stores/useAppStore.ts';

const { TextArea } = Input;
const { Text } = Typography;

interface CookieStatus {
  is_online: boolean;
  cookie_count: number;
  last_updated: string | null;
}

interface ThsCookieConfigModalProps {
  open: boolean;
  onClose: () => void;
  onStatusChange?: (hasCookies: boolean) => void;
}

const ThsCookieConfigModal: React.FC<ThsCookieConfigModalProps> = ({ open, onClose, onStatusChange }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<CookieStatus | null>(null);
  const thsUsername = getThsUsername();

  // 直接从全局store获取账号数据，避免重复API调用
  const thsAccounts = useAppStore(state => state.thsAccounts);

  const loadStatus = useCallback(async () => {
    try {
      // 直接使用全局store中的账号数据，不再调用API
      const accounts = thsAccounts || [];
      const account = accounts.find((acc: any) => acc.ths_account === thsUsername);
      const s: CookieStatus = {
        is_online: account?.is_online || false,
        cookie_count: account?.is_online ? 1 : 0,
        last_updated: account?.last_login_at || null
      };
      setStatus(s);
      if (onStatusChange) {
        onStatusChange(!!s.is_online);
      }
    } catch (e) {
      // 静默失败即可，不影响表单使用
    }
  }, [thsUsername, onStatusChange, thsAccounts]);

  useEffect(() => {
    if (open) {
      loadStatus();
    }
  }, [open, loadStatus]);

  const handleSave = async (values: { cookieStr: string }) => {
    const cookieStr = (values.cookieStr || '').trim();
    if (!cookieStr) {
      message.error('请输入 Cookie 字符串');
      return;
    }
    setLoading(true);
    try {
      const resp = await axiosInstance.post(
        '/api/admin/ths/cookies/update',
        { cookie_str: cookieStr },
        {
          headers: {
            'X-THS-User-Key': thsUsername,
          },
        },
      );
      if (resp.data && resp.data.success) {
        message.success('Cookie 已更新');
        form.resetFields();
        await loadStatus();
      } else {
        message.error(resp.data?.message || 'Cookie 更新失败');
      }
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'Cookie 更新失败');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    setLoading(true);
    try {
      const resp = await axiosInstance.delete('/api/admin/ths/cookies', {
        headers: {
          'X-THS-User-Key': thsUsername,
        },
      });
      if (resp.data && resp.data.success) {
        message.success('Cookie 已清除');
        form.resetFields();
        await loadStatus();
      } else {
        message.error(resp.data?.message || 'Cookie 清除失败');
      }
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'Cookie 清除失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      title="同花顺 Cookie 配置"
      onCancel={onClose}
      footer={null}
      destroyOnHidden
    >
      <div style={{ fontSize: 12, marginBottom: 8 }}>
        <span>当前 Cookie 数量：{status?.cookie_count ?? 0} 个</span>
        {status?.last_updated && (
          <span style={{ marginLeft: 16 }}>
            最后更新：{new Date(status.last_updated).toLocaleString('zh-CN')}
          </span>
        )}
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message={
          <span>
            在浏览器 Network 面板中复制整行 <Text code>Cookie</Text> 值，粘贴到下方输入框。
          </span>
        }
      />

      <Form form={form} layout="vertical" onFinish={handleSave}>
        <Form.Item
          label="Cookie 字符串"
          name="cookieStr"
          rules={[{ required: true, message: '请输入 Cookie 字符串' }]}
        >
          <TextArea
            rows={4}
            placeholder="v=你的v值; sid=你的sid值; 其他键=其他值"
            style={{ fontFamily: 'monospace' }}
          />
        </Form.Item>

        <Form.Item>
          <Space>
            <Button
              type="primary"
              icon={<SettingOutlined />}
              loading={loading}
              onClick={() => form.submit()}
            >
              保存 Cookie
            </Button>
            {status?.is_online && (
              <Button
                danger
                icon={<DeleteOutlined />}
                loading={loading}
                onClick={handleClear}
              >
                清除
              </Button>
            )}
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ThsCookieConfigModal;
