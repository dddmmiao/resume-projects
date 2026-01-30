import React, { useEffect, useState, useCallback } from 'react';
import { Table, Tag, Button, Space, message, Modal, Form, Input, InputNumber, Switch, Popconfirm, Typography } from 'antd';
import { PlusOutlined, ReloadOutlined, DeleteOutlined } from '@ant-design/icons';
import authFetch from '../../utils/authFetch.ts';

const { Text } = Typography;

interface InvitationCodeItem {
  code: string;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
  is_valid: boolean;
  remark: string | null;
  created_at: string | null;
}

interface InvitationCodeManagementProps {
  readOnly?: boolean;
}

const InvitationCodeManagement: React.FC<InvitationCodeManagementProps> = ({ readOnly = false }) => {
  const [loading, setLoading] = useState(false);
  const [codes, setCodes] = useState<InvitationCodeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [form] = Form.useForm();

  const loadCodes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
        include_expired: 'true',
      });

      const resp = await authFetch(`/api/admin/invitation-codes?${params}`);
      const data = await resp.json();
      if (data?.success) {
        setCodes(data.data?.codes || []);
        setTotal(data.data?.total || 0);
      }
    } catch (e) {
      message.error('获取邀请码列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    loadCodes();
  }, [loadCodes]);

  const handleCreate = async (values: any) => {
    setCreateLoading(true);
    try {
      const resp = await authFetch('/api/admin/invitation-codes', {
        method: 'POST',
        body: JSON.stringify({
          code: values.code || null,
          max_uses: values.max_uses,
          expires_days: values.expires_days || null,
          remark: values.remark || null,
        }),
      });
      const data = await resp.json();
      if (data?.success) {
        message.success(data.message || '创建成功');
        setCreateModalVisible(false);
        form.resetFields();
        loadCodes();
      } else {
        message.error(data?.message || '创建失败');
      }
    } catch (e) {
      message.error('创建失败');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleToggleStatus = async (code: string, currentStatus: boolean) => {
    try {
      const resp = await authFetch(`/api/admin/invitation-codes/${encodeURIComponent(code)}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !currentStatus }),
      });
      const data = await resp.json();
      if (data?.success) {
        message.success(data.message);
        loadCodes();
      } else {
        message.error(data?.message || '操作失败');
      }
    } catch (e) {
      message.error('操作失败');
    }
  };

  const handleDelete = async (code: string) => {
    try {
      const resp = await authFetch(`/api/admin/invitation-codes/${encodeURIComponent(code)}`, {
        method: 'DELETE',
      });
      const data = await resp.json();
      if (data?.success) {
        message.success(data.message);
        loadCodes();
      } else {
        message.error(data?.message || '删除失败');
      }
    } catch (e) {
      message.error('删除失败');
    }
  };

  const columns = [
    {
      title: '邀请码',
      dataIndex: 'code',
      key: 'code',
      width: 160,
      render: (v: string) => (
        <Tag color="geekblue" style={{
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '10px',
          letterSpacing: '0.5px',
        }}>
          <Text copyable={{ text: v }} style={{ color: 'inherit' }}>{v}</Text>
        </Tag>
      ),
    },
    {
      title: '使用次数',
      key: 'usage',
      width: 100,
      render: (_: any, record: InvitationCodeItem) => (
        <span>
          {record.used_count} / {record.max_uses === 0 ? '∞' : record.max_uses}
        </span>
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: (_: any, record: InvitationCodeItem) => {
        if (!record.is_active) {
          return <Tag color="red">已禁用</Tag>;
        }
        if (!record.is_valid) {
          return <Tag color="red">已失效</Tag>;
        }
        return <Tag color="green">有效</Tag>;
      },
    },
    {
      title: '过期时间',
      dataIndex: 'expires_at',
      key: 'expires_at',
      width: 160,
      render: (v: string | null) => {
        if (!v) return <Text type="secondary">永不过期</Text>;
        const d = new Date(v);
        const isExpired = d < new Date();
        return (
          <Text type={isExpired ? 'danger' : undefined}>
            {d.toLocaleString('zh-CN')}
          </Text>
        );
      },
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      width: 150,
      ellipsis: true,
      render: (v: string | null) => v || <Text type="secondary">-</Text>,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (v: string | null) => v ? new Date(v).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_: any, record: InvitationCodeItem) => (
        <Space size="small">
          <Switch
            size="default"
            checked={record.is_active}
            disabled={readOnly}
            onChange={(checked) => handleToggleStatus(record.code, record.is_active)}
            checkedChildren="启用"
            unCheckedChildren="禁用"
          />
          <Popconfirm
            title="确定删除此邀请码？"
            onConfirm={() => handleDelete(record.code)}
            okText="确定"
            cancelText="取消"
            disabled={readOnly}
          >
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={readOnly}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => setCreateModalVisible(true)}
          disabled={readOnly}
        >
          {readOnly ? '无权生成' : '生成邀请码'}
        </Button>
        <Button size="small" icon={<ReloadOutlined />} onClick={loadCodes}>
          刷新
        </Button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#888' }}>
          共 {total} 个邀请码
        </span>
      </div>

      <Table
        size="small"
        loading={loading}
        columns={columns}
        dataSource={codes}
        pagination={{
          current: page,
          pageSize: pageSize,
          total: total,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50'],
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
        scroll={{ x: 900 }}
      />

      <Modal
        title="生成邀请码"
        open={createModalVisible}
        onCancel={() => {
          setCreateModalVisible(false);
          form.resetFields();
        }}
        footer={null}
        width={400}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          initialValues={{ max_uses: 1 }}
        >
          <Form.Item
            name="code"
            label="自定义邀请码"
            extra="留空则自动生成随机邀请码"
          >
            <Input placeholder="留空自动生成" maxLength={32} />
          </Form.Item>

          <Form.Item
            name="max_uses"
            label="最大使用次数"
            rules={[{ required: true, message: '请输入最大使用次数' }]}
            extra="设为 0 表示无限制"
          >
            <InputNumber min={0} max={9999} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="expires_days"
            label="有效期（天）"
            extra="留空表示永不过期"
          >
            <InputNumber min={1} max={365} style={{ width: '100%' }} placeholder="留空永不过期" />
          </Form.Item>

          <Form.Item
            name="remark"
            label="备注"
          >
            <Input.TextArea rows={2} maxLength={200} placeholder="可选备注信息" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setCreateModalVisible(false);
                form.resetFields();
              }}>
                取消
              </Button>
              <Button type="primary" htmlType="submit" loading={createLoading}>
                生成
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default InvitationCodeManagement;
