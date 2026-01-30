import React, { useState } from 'react';
import { Pagination, Select, Popover, Input, Divider, InputNumber, Checkbox } from 'antd';
import { LoadingOutlined, SendOutlined, PlusOutlined } from '@ant-design/icons';

interface Props {
  dataType: string;
  searchKeyword: string;
  total: number;
  currentPage: number;
  pageSize: number;
  loading: boolean;
  onPageChange: (page: number, pageSize: number) => void;
  onPageSizeChange: (current: number, size: number) => void;
  showStatsButton?: boolean;
  onClickStats?: () => void;
  statsLoading?: boolean;
  // 推送到同花顺分组
  showPushButton?: boolean;
  thsGroups?: string[];
  onPushToGroup?: (groupName: string, pushCount: number) => void;
  pushLoading?: boolean;
  onLoadGroups?: () => void; // 加载分组列表回调
}

const PaginationPanel: React.FC<Props> = ({
  dataType,
  searchKeyword,
  total,
  currentPage,
  pageSize,
  loading,
  onPageChange,
  onPageSizeChange,
  showStatsButton,
  onClickStats,
  statsLoading,
  showPushButton,
  thsGroups = [],
  onPushToGroup,
  pushLoading,
  onLoadGroups,
}) => {
  const [pushPopoverOpen, setPushPopoverOpen] = useState(false);
  
  // 打开推送弹窗时，如果分组列表为空则尝试加载
  const handlePopoverOpenChange = (open: boolean) => {
    setPushPopoverOpen(open);
    if (open && thsGroups.length === 0 && onLoadGroups) {
      onLoadGroups();
    }
  };
  const [newGroupName, setNewGroupName] = useState('');
  const [pushAll, setPushAll] = useState(true);  // 默认推送全部
  const [customPushCount, setCustomPushCount] = useState<number | null>(20);  // 用户自定义数量，默认20

  // 计算实际推送数量：全部时为0，否则为用户输入值（限制在1-500之间）
  const effectivePushCount = pushAll ? 0 : Math.min(Math.max(customPushCount || 0, 1), Math.min(total, 500));

  const handlePushToExisting = (groupName: string) => {
    onPushToGroup?.(groupName, effectivePushCount);
    setPushPopoverOpen(false);
  };

  const handlePushToNew = () => {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    onPushToGroup?.(trimmed, effectivePushCount);
    setNewGroupName('');
    setPushPopoverOpen(false);
  };

  const pushPopoverContent = (
    <div style={{ width: 200 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Checkbox
            checked={pushAll}
            onChange={(e) => setPushAll(e.target.checked)}
            style={{ marginRight: 4 }}
          >
            <span style={{ fontSize: 13 }}>全部推送</span>
          </Checkbox>
          {!pushAll && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 13, color: '#666' }}>前</span>
              <InputNumber
                size="small"
                min={1}
                max={Math.min(total, 500)}
                value={customPushCount}
                onChange={(v) => setCustomPushCount(v)}
                style={{ width: 65 }}
                placeholder="数量"
              />
              <span style={{ fontSize: 13, color: '#666' }}>个</span>
            </div>
          )}
        </div>
      </div>
      <div style={{ marginBottom: 8 }}>
        <Input
          placeholder="输入分组名称"
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          onPressEnter={handlePushToNew}
          size="small"
          suffix={
            <span
              onClick={newGroupName.trim() ? handlePushToNew : undefined}
              style={{
                cursor: newGroupName.trim() ? 'pointer' : 'not-allowed',
                opacity: newGroupName.trim() ? 1 : 0.4,
                color: '#1890ff',
                padding: '0 4px',
              }}
            >
              <PlusOutlined />
            </span>
          }
        />
      </div>
      {thsGroups.length > 0 && (
        <>
          <Divider style={{ margin: '8px 0', fontSize: 12 }}>或选择已有分组</Divider>
          <div style={{ maxHeight: 150, overflowY: 'auto' }}>
            {thsGroups.map(group => (
              <div
                key={group}
                onClick={() => handlePushToExisting(group)}
                style={{
                  padding: '6px 8px',
                  cursor: 'pointer',
                  borderRadius: 4,
                  fontSize: 13,
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.06)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                {group}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="pagination-panel" style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '16px',
      padding: '12px 16px',
      borderRadius: '8px'
    }}>
      <div className="label-muted" style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        {loading ? (
          <span style={{ color: '#999' }}>
            正在加载数据...
          </span>
        ) : (
          <span>
            {searchKeyword && `搜索关键词: "${searchKeyword}" | `}
            共 {total} 个{
              dataType === 'stock' ? '股票' :
              dataType === 'convertible_bond' ? '可转债' :
              dataType === 'concept' ? '概念' :
              dataType === 'industry' ? '行业' :
              dataType === 'favorites' ? '自选' : '项目'
            } |
            当前第 {currentPage} 页
          </span>
        )}
        {loading && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#1890ff' }}>
            <LoadingOutlined style={{ fontSize: '12px' }} />
            <span style={{ fontSize: '11px' }}>更新中</span>
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* 推送到同花顺分组按钮 */}
        {showPushButton && onPushToGroup && (
          <Popover
            content={pushPopoverContent}
            title="推送到同花顺分组"
            trigger="click"
            placement="bottomRight"
            open={pushPopoverOpen}
            onOpenChange={handlePopoverOpenChange}
          >
            <button
              type="button"
              disabled={loading || pushLoading || total === 0}
              style={{
                border: 'none',
                outline: 'none',
                cursor: (loading || pushLoading || total === 0) ? 'not-allowed' : 'pointer',
                borderRadius: 4,
                padding: '4px 10px',
                fontSize: 12,
                background: '#1890ff',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {pushLoading ? <LoadingOutlined style={{ fontSize: 12, color: '#fff' }} /> : <SendOutlined style={{ fontSize: 12, color: '#fff' }} />}
              推送到同花顺
            </button>
          </Popover>
        )}
        {showStatsButton && onClickStats && (
          <button
            type="button"
            onClick={onClickStats}
            disabled={loading || statsLoading}
            style={{
              border: 'none',
              outline: 'none',
              cursor: loading || statsLoading ? 'not-allowed' : 'pointer',
              borderRadius: 4,
              padding: '4px 10px',
              fontSize: 12,
              background: '#1890ff',
              color: '#fff',
            }}
          >
            统计
          </button>
        )}
        <span className="label-text" style={{ fontSize: '12px' }}>每页:</span>
        <Select
          size="small"
          value={pageSize}
          onChange={(val) => onPageSizeChange(currentPage, Number(val))}
          style={{ width: 56 }}
          className="page-size-selector"
        >
          {[6, 9, 12, 18, 24, 36, 48].map(n => (
            <Select.Option key={n} value={n}>{n}</Select.Option>
          ))}
        </Select>

        <Pagination
          className="dashboard-pagination"
          current={currentPage}
          pageSize={pageSize}
          total={total}
          onChange={onPageChange}
          onShowSizeChange={onPageSizeChange}
          showSizeChanger={false}
          showQuickJumper={false}
          showLessItems
          size="small"
          itemRender={(page, type, originalElement) => {
            if (type === 'page') {
              return <span style={{ display: 'inline-block', minWidth: 24, textAlign: 'center' }}>{page}</span>;
            }
            return originalElement;
          }}
        />
      </div>
    </div>
  );
};

export default PaginationPanel;

