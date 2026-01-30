import React, { useEffect, useState, useCallback } from 'react';
import { Table, Tag, Button, Space, message, Typography, Input, Switch, Popconfirm, Modal, Tooltip } from 'antd';
import { SearchOutlined, ReloadOutlined, EditOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import authFetch from '../../utils/authFetch.ts';

const { Text } = Typography;

interface ThsAccountInfo {
  ths_account: string;
  nickname: string | null;
  is_active: boolean;
  has_cookie: boolean;
  auto_relogin_enabled: boolean;
  mobile?: string | null;
  last_login_method?: string | null;
  last_login_at?: string | null;
  message_forward_enabled?: boolean;
  message_forward_type?: string | null;
}

interface UserItem {
  username: string;
  nickname: string | null;
  is_active: boolean;
  is_admin: boolean;
  is_super_admin: boolean;
  created_at: string;
  last_login_at: string | null;
  ths_accounts: ThsAccountInfo[];
  pushplus_friend_token: string | null;
}

interface UserManagementProps {
  loginMethodsConfig?: { qr: boolean; sms: boolean; password: boolean; cookie?: boolean };
  readOnly?: boolean;
}

const UserManagement: React.FC<UserManagementProps> = ({ loginMethodsConfig, readOnly = false }) => {
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [thsDetailVisible, setThsDetailVisible] = useState(false);
  const [currentThsUser, setCurrentThsUser] = useState<UserItem | null>(null);
  const [triggeringAccount, setTriggeringAccount] = useState<string | null>(null);
  const [editingTokenUser, setEditingTokenUser] = useState<string | null>(null);
  const [tokenInputValue, setTokenInputValue] = useState<string>('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (keyword) params.append('keyword', keyword);

      const resp = await authFetch(`/api/admin/users?${params}`);
      const data = await resp.json();
      if (data?.success) {
        setUsers(data.data?.users || []);
        setTotal(data.data?.total || 0);
      }
    } catch (e) {
      message.error('获取用户列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleSearch = () => {
    setPage(1);
    setKeyword(searchInput);
  };

  const handleToggleStatus = async (username: string, currentStatus: boolean) => {
    try {
      const resp = await authFetch(`/api/admin/users/${username}/status`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !currentStatus })
      });
      const data = await resp.json();
      if (data?.success) {
        message.success(data.message);
        loadUsers();
      } else {
        // 处理HTTP错误状态码的情况，显示后端返回的具体错误信息
        message.error(data?.detail || data?.message || '操作失败');
      }
    } catch (e: any) {
      // 处理网络错误或解析错误
      message.error(e?.message || '操作失败');
    }
  };

  const handleDeleteCookie = async (username: string, thsAccount: string) => {
    try {
      const resp = await authFetch(`/api/admin/users/${username}/ths-cookie/${thsAccount}`, {
        method: 'DELETE',
      });
      const data = await resp.json();

      if (data?.success) {
        message.success('Cookie 删除成功');
        loadUsers();
        // 如果当前打开的详情窗口是被操作的用户，也需要更新
        if (currentThsUser && currentThsUser.username === username) {
          const updatedResp = await authFetch(`/api/admin/users?page=1&page_size=1000`);
          const updatedData = await updatedResp.json();
          if (updatedData?.success) {
            const updatedUser = updatedData.data?.users?.find((u: UserItem) => u.username === currentThsUser.username);
            if (updatedUser) {
              setCurrentThsUser(updatedUser);
            }
          }
        }
      } else {
        message.error(data?.message || 'Cookie 删除失败');
      }
    } catch (error) {
      message.error('Cookie 删除失败');
    }
  };

  const handleTriggerRelogin = async (username: string, thsAccount: string, method: 'sms' | 'qr') => {
    setTriggeringAccount(thsAccount);
    try {
      const resp = await authFetch('/api/admin/relogin/trigger', {
        method: 'POST',
        body: JSON.stringify({
          username,
          ths_account: thsAccount,
          method
        })
      });
      const data = await resp.json();
      if (data?.success) {
        message.success('补登录通知已发送');
      } else {
        message.error(data?.message || '触发补登录失败');
      }
    } catch (error) {
      message.error('触发补登录失败');
    } finally {
      setTriggeringAccount(null);
    }
  };

  const handleDeleteThsAccount = async (username: string, thsAccount: string) => {
    try {
      const resp = await authFetch(`/api/admin/users/${username}/ths-accounts/${encodeURIComponent(thsAccount)}`, {
        method: 'DELETE',
      });
      const data = await resp.json();

      if (data?.success) {
        message.success('同花顺账号删除成功');
        loadUsers();
        // 如果当前打开的详情窗口是被操作的用户，也需要更新
        if (currentThsUser && currentThsUser.username === username) {
          const updatedResp = await authFetch(`/api/admin/users?page=1&page_size=1000`);
          const updatedData = await updatedResp.json();
          if (updatedData?.success) {
            const updatedUser = updatedData.data?.users?.find((u: UserItem) => u.username === currentThsUser.username);
            if (updatedUser) {
              setCurrentThsUser(updatedUser);
            }
          }
        }
      } else {
        message.error(data?.message || '删除同花顺账号失败');
      }
    } catch (error) {
      message.error('删除同花顺账号失败');
    }
  };

  const handleUpdatePushplusToken = async (username: string, token: string | null) => {
    try {
      const resp = await authFetch(`/api/admin/users/${username}/pushplus-token`, {
        method: 'PUT',
        body: JSON.stringify({ pushplus_friend_token: token })
      });
      const data = await resp.json();
      if (data?.success) {
        message.success(data.message);
        setEditingTokenUser(null);
        loadUsers();
      } else {
        message.error(data?.message || '更新推送令牌失败');
      }
    } catch (error) {
      message.error('更新推送令牌失败');
    }
  };

  const handleUpdateThsAccountConfig = async (thsAccount: string, configKey: string, configValue: any) => {
    try {
      const resp = await authFetch(`/api/admin/ths_accounts/${thsAccount}`, {
        method: 'PUT',
        body: JSON.stringify({ [configKey]: configValue })
      });
      const data = await resp.json();

      if (data?.success) {
        message.success('配置更新成功');
        // 更新当前用户数据
        if (currentThsUser) {
          const updatedResp = await authFetch(`/api/admin/users?page=1&page_size=1000`);
          const updatedData = await updatedResp.json();
          if (updatedData?.success) {
            const updatedUser = updatedData.data?.users?.find((u: UserItem) => u.username === currentThsUser.username);
            if (updatedUser) {
              setCurrentThsUser(updatedUser);
            }
          }
        }
        loadUsers();
      } else {
        message.error(data?.message || '配置更新失败');
      }
    } catch (error) {
      message.error('配置更新失败');
    }
  };

  const columns = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 100,
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: '昵称',
      dataIndex: 'nickname',
      key: 'nickname',
      width: 100,
      render: (v: string | null) => v ? <Text>{v}</Text> : <Text type="secondary">-</Text>,
    },
    {
      title: '同花顺账号',
      key: 'ths_accounts',
      width: 280,
      render: (_: any, record: UserItem) => {
        const thsAccounts = record.ths_accounts || [];
        if (!thsAccounts.length) {
          return <Text type="secondary">未绑定</Text>;
        }

        // 多账号显示：最多显示2个，其余用省略号表示
        const displayAccounts = thsAccounts.slice(0, 2);
        const hasMore = thsAccounts.length > 2;

        return (
          <div style={{ width: '100%' }}>
            <Space size={4} wrap style={{ width: '100%' }}>
              {displayAccounts.map((acc, index) => {
                // 只显示昵称，如果没有昵称则显示""
                const displayText = acc.nickname || '';

                return (
                  <Tag
                    key={acc.ths_account}
                    color={acc.has_cookie ? 'success' : 'default'}
                    style={{
                      fontSize: 12,
                      cursor: 'pointer',
                      margin: 0,
                      fontFamily: 'monospace'
                    }}
                    onClick={() => {
                      setCurrentThsUser(record);
                      setThsDetailVisible(true);
                    }}
                  >
                    {displayText}
                  </Tag>
                );
              })}

              {/* 如果有更多账号，显示省略信息 */}
              {hasMore && (
                <Text
                  type="secondary"
                  style={{ fontSize: 11, cursor: 'pointer' }}
                  onClick={() => {
                    setCurrentThsUser(record);
                    setThsDetailVisible(true);
                  }}
                >
                  ... 等 {thsAccounts.length} 个账号
                </Text>
              )}
            </Space>
          </div>
        );
      },
    },
    {
      title: '角色',
      key: 'role',
      width: 120,
      render: (_: any, record: UserItem) => {
        if (record.is_super_admin) return <Tag color="gold">超级管理员</Tag>;
        if (record.is_admin) return <Tag color="volcano">管理员</Tag>;
        return <Tag>普通用户</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 80,
      render: (active: boolean, record: UserItem) => (
        <Switch
          size="default"
          checked={active}
          disabled={readOnly}
          onChange={() => handleToggleStatus(record.username, active)}
          checkedChildren="启用"
          unCheckedChildren="禁用"
        />
      ),
    },
    {
      title: '注册时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-',
    },
    {
      title: '最后登录时间',
      dataIndex: 'last_login_at',
      key: 'last_login_at',
      width: 180,
      render: (v: string | null) => v ? new Date(v).toLocaleString('zh-CN') : '-',
    },
    {
      title: '推送令牌',
      dataIndex: 'pushplus_friend_token',
      key: 'pushplus_friend_token',
      width: 180,
      render: (token: string | null, record: UserItem) => {
        const isEditing = editingTokenUser === record.username;

        if (isEditing) {
          return (
            <Space size={4}>
              <Input
                size="small"
                value={tokenInputValue}
                onChange={(e) => setTokenInputValue(e.target.value)}
                placeholder="输入令牌"
                style={{ width: 100 }}
              />
              <Button
                size="small"
                type="text"
                icon={<CheckOutlined style={{ color: '#52c41a' }} />}
                onClick={() => handleUpdatePushplusToken(record.username, tokenInputValue || null)}
              />
              <Button
                size="small"
                type="text"
                icon={<CloseOutlined style={{ color: '#ff4d4f' }} />}
                onClick={() => setEditingTokenUser(null)}
              />
            </Space>
          );
        }

        return (
          <Space size={4}>
            {token ? (
              <Tooltip title={token}>
                <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>
                  {token.length > 8 ? `${token.slice(0, 8)}...` : token}
                </Text>
              </Tooltip>
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>未配置</Text>
            )}
            <Button
              size="small"
              type="text"
              icon={<EditOutlined />}
              disabled={readOnly}
              onClick={() => {
                setEditingTokenUser(record.username);
                setTokenInputValue(token || '');
              }}
            />
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
        <Input
          placeholder="搜索用户名/昵称"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onPressEnter={handleSearch}
          style={{ width: 200 }}
          size="small"
          allowClear
        />
        <Button size="small" icon={<SearchOutlined />} onClick={handleSearch}>
          搜索
        </Button>
        <Button size="small" icon={<ReloadOutlined />} onClick={loadUsers}>
          刷新
        </Button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#888' }}>
          共 {total} 个用户
        </span>
      </div>
      <Table
        rowKey="username"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={users}
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
        scroll={{ x: 1300 }}
      />

      <Modal
        title="同花顺账号管理"
        open={thsDetailVisible}
        onCancel={() => {
          setThsDetailVisible(false);
          setCurrentThsUser(null);
        }}
        footer={null}
        width={800}
      >
        {currentThsUser?.ths_accounts?.length ? (
          <div style={{ maxHeight: '70vh', overflowY: 'auto', padding: '4px 0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {currentThsUser.ths_accounts.map((acc) => (
                <div
                  key={acc.ths_account}
                  style={{
                    padding: '4px 0',
                    borderBottom: '1px solid #f0f0f0',
                    fontSize: 12,
                  }}
                >
                  {/* 第一行：昵称 + 状态标签 + 账号属性信息 */}
                  <div style={{ marginBottom: 8 }}>
                    <Space size={4} wrap>
                      <Text strong style={{ fontSize: 13 }}>
                        {acc.nickname || '未命名账号'}
                      </Text>
                      {acc.has_cookie ? (
                        <Tag color="success" style={{ margin: 0, fontSize: 11 }}>
                          在线
                        </Tag>
                      ) : (
                        <Tag color="default" style={{ margin: 0, fontSize: 11 }}>
                          离线
                        </Tag>
                      )}
                      {!acc.is_active && (
                        <Tag color="orange" style={{ margin: 0, fontSize: 11 }}>
                          已停用
                        </Tag>
                      )}
                      {acc.mobile && (
                        <Tag
                          style={{ margin: 0, padding: '0 6px', fontSize: 11 }}
                          color="processing"
                        >
                          手机: {acc.mobile}
                        </Tag>
                      )}
                      {acc.last_login_at && (
                        <Tag
                          style={{ margin: 0, padding: '0 6px', fontSize: 11 }}
                          color="blue"
                        >
                          最近登录: {new Date(acc.last_login_at).toLocaleString('zh-CN')}
                        </Tag>
                      )}
                      {acc.last_login_method && (
                        <Tag
                          style={{ margin: 0, padding: '0 6px', fontSize: 11 }}
                          color="purple"
                        >
                          登录方式: {acc.last_login_method === 'sms'
                            ? '短信验证码'
                            : acc.last_login_method === 'qr'
                              ? '微信扫码'
                              : acc.last_login_method === 'password'
                                ? '账号密码'
                                : acc.last_login_method}
                        </Tag>
                      )}
                      {acc.message_forward_enabled && (
                        <Tag
                          style={{ margin: 0, padding: '0 6px', fontSize: 11 }}
                          color="geekblue"
                        >
                          消息转发: {acc.message_forward_type === 'sms_forwarder'
                            ? '短信转发服务'
                            : acc.message_forward_type === 'ios_shortcut'
                              ? 'iOS捷径'
                              : acc.message_forward_type === 'bark'
                                ? 'Bark'
                                : acc.message_forward_type || '已开启'}
                        </Tag>
                      )}
                    </Space>
                  </div>

                  {/* 第二行：统一的操作控件行 */}
                  <div style={{ marginTop: 8, padding: '8px 12px', backgroundColor: '#fafafa', borderRadius: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <Space size={16} wrap align="center">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 12, minWidth: '60px' }}>账号状态:</Text>
                          <Switch
                            size="small"
                            checked={acc.is_active}
                            disabled={readOnly}
                            onChange={(checked) => handleUpdateThsAccountConfig(acc.ths_account, 'is_active', checked)}
                          />
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {acc.is_active ? '启用' : '停用'}
                          </Text>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 12, minWidth: '70px' }}>自动补登录:</Text>
                          <Switch
                            size="small"
                            checked={acc.auto_relogin_enabled}
                            disabled={readOnly}
                            onChange={(checked) => handleUpdateThsAccountConfig(acc.ths_account, 'auto_relogin_enabled', checked)}
                          />
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {acc.auto_relogin_enabled ? '开启' : '关闭'}
                          </Text>
                        </div>
                      </Space>
                      <Space size={8}>
                        {acc.has_cookie && (
                          <Popconfirm
                            title={
                              <div>
                                <div>确定要清除该账号的登录状态吗？</div>
                                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                                  清除后需要重新登录同花顺账号
                                </div>
                              </div>
                            }
                            onConfirm={() => handleDeleteCookie(currentThsUser.username, acc.ths_account)}
                            okText="确定清除"
                            cancelText="取消"
                            disabled={readOnly}
                          >
                            <Button size="small" type="default" disabled={readOnly}>
                              清除登录状态
                            </Button>
                          </Popconfirm>
                        )}
                        {/* 只对掉线且符合自动补登录条件的账号显示触发补登录按钮 */}
                        {/* 条件：1.掉线 2.启用自动补登录 3.支持的登录方式(从系统配置获取) 4.是最近登录的账号 */}
                        {!acc.has_cookie && acc.auto_relogin_enabled &&
                          acc.last_login_method && loginMethodsConfig &&
                          ((acc.last_login_method === 'sms' && loginMethodsConfig.sms) ||
                            (acc.last_login_method === 'qr' && loginMethodsConfig.qr) ||
                            (acc.last_login_method === 'password' && loginMethodsConfig.password)) &&
                          acc.last_login_at && (() => {
                            const maxTime = Math.max(...currentThsUser.ths_accounts
                              .filter(a => a.last_login_at)
                              .map(a => new Date(a.last_login_at!).getTime()));
                            return new Date(acc.last_login_at).getTime() === maxTime;
                          })() && (
                            <Button
                              size="small"
                              type="default"
                              danger
                              loading={triggeringAccount === acc.ths_account}
                              disabled={readOnly}
                              onClick={() => handleTriggerRelogin(
                                currentThsUser.username,
                                acc.ths_account,
                                acc.last_login_method as 'sms' | 'qr'
                              )}
                            >
                              触发补登录
                            </Button>
                          )}
                        <Popconfirm
                          title={
                            <div>
                              <div>确定要删除该同花顺账号吗？</div>
                              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                                删除后用户需要重新添加该账号
                              </div>
                            </div>
                          }
                          onConfirm={() => handleDeleteThsAccount(currentThsUser.username, acc.ths_account)}
                          okText="确定删除"
                          cancelText="取消"
                          disabled={readOnly}
                        >
                          <Button size="small" type="default" danger disabled={readOnly}>
                            删除账号
                          </Button>
                        </Popconfirm>
                      </Space>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 16px' }}>
            <Text type="secondary" style={{ fontSize: 14 }}>
              该用户暂未绑定任何同花顺账号
            </Text>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default UserManagement;
