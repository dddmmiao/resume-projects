/**
 * 画线工具栏组件
 * 用于选择不同的画线工具
 */
import React from 'react';
import { Button, Space, Tooltip } from 'antd';
import {
  LineOutlined,
  ArrowRightOutlined,
  MinusOutlined,
  BorderOuterOutlined,
  PercentageOutlined,
  RiseOutlined,
  CheckOutlined,
  DeleteOutlined,
  SwapOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { DrawingToolType } from '../components/chart-layers/drawing/types.ts';

export interface DrawingToolbarProps {
  activeTool: DrawingToolType | null;
  onToolSelect: (tool: DrawingToolType | null) => void;
  onClearAll?: () => void;
  onExit?: () => void;
  onDelete?: () => void;
  onSwitch?: () => void;
  onUndo?: () => void;
  hasSelectedDrawing?: boolean;
  canUndo?: boolean;
  theme?: 'dark' | 'light' | 'blue' | 'purple' | 'green' | 'orange' | 'cyan' | 'red' | 'gold';
}

const toolConfigs: Array<{
  type: DrawingToolType;
  icon: React.ReactNode;
  label: string;
  description: string;
}> = [
  {
    type: 'ray',
    icon: <ArrowRightOutlined />,
    label: '射线',
    description: '从起点无限延伸的直线',
  },
  {
    type: 'horizontal-ray',
    icon: <MinusOutlined />,
    label: '水平射线',
    description: '水平方向无限延伸的直线',
  },
  {
    type: 'segment',
    icon: <LineOutlined />,
    label: '线段',
    description: '两点之间的有限线段',
  },
  {
    type: 'price-channel',
    icon: <BorderOuterOutlined />,
    label: '价格通道',
    description: '平行价格通道线',
  },
  {
    type: 'fibonacci',
    icon: <PercentageOutlined />,
    label: '黄金分割',
    description: '斐波那契回撤线',
  },
  {
    type: 'gann-angle',
    icon: <RiseOutlined />,
    label: '江恩角度箱',
    description: '江恩角度箱',
  },
];

export const DrawingToolbar: React.FC<DrawingToolbarProps> = ({
  activeTool,
  onToolSelect,
  onClearAll,
  onExit,
  onDelete,
  onSwitch,
  onUndo,
  hasSelectedDrawing = false,
  canUndo = false,
  theme = 'dark',
}) => {
  const handleToolClick = (tool: DrawingToolType) => {
    // 如果点击的是当前激活的工具，则取消激活
    if (activeTool === tool) {
      onToolSelect(null);
    } else {
      onToolSelect(tool);
    }
  };

  // 根据主题获取工具栏样式
  const getToolbarStyle = () => {
    if (theme === 'light') {
      return {
        background: '#ffffff',
        border: '1px solid rgba(0, 0, 0, 0.15)',
      };
    }
    
    // 暗色主题使用深色背景
    return {
      background: 'rgba(30, 30, 30, 0.95)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
    };
  };

  return (
    <div
      style={{
        padding: '2px 4px',
        borderRadius: '4px',
        ...getToolbarStyle(),
        // 支持水平滚动，超出一行时可以左右滑动
        display: 'inline-block',
        whiteSpace: 'nowrap',
      }}
    >
      <Space size="small" wrap={false}>
        {onSwitch && (
          <Tooltip title="切换选中线的类型" placement="top">
            <Button
              type="default"
              icon={<SwapOutlined />}
              size="small"
              onClick={onSwitch}
              disabled={!hasSelectedDrawing}
              style={{
                minWidth: '32px',
                height: '28px',
                padding: '0 6px',
                flexShrink: 0,
              }}
            />
          </Tooltip>
        )}
        {onUndo && (
          <Tooltip title="撤销" placement="top">
            <Button
              type="default"
              icon={<UndoOutlined />}
              size="small"
              onClick={onUndo}
              disabled={!canUndo}
              style={{
                minWidth: '32px',
                height: '28px',
                padding: '0 6px',
                flexShrink: 0,
              }}
            />
          </Tooltip>
        )}
        {toolConfigs.map((tool) => (
          <Tooltip key={tool.type} title={`${tool.label}: ${tool.description}`} placement="top">
            <Button
              type={activeTool === tool.type ? 'primary' : 'default'}
              icon={tool.icon}
              size="small"
              onClick={() => handleToolClick(tool.type)}
              style={{
                minWidth: '32px',
                height: '28px',
                padding: '0 8px',
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: '12px' }}>{tool.label}</span>
            </Button>
          </Tooltip>
        ))}
        {onDelete && (
          <Tooltip title="删除选中的线" placement="top">
            <Button
              type="default"
              danger
              icon={<DeleteOutlined />}
              size="small"
              onClick={onDelete}
              disabled={!hasSelectedDrawing}
              style={{
                minWidth: '32px',
                height: '28px',
                padding: '0 6px',
                flexShrink: 0,
              }}
            />
          </Tooltip>
        )}
        {onClearAll && (
          <Tooltip title="清除所有绘图" placement="top">
            <Button
              type="default"
              danger
              size="small"
              onClick={onClearAll}
              style={{
                minWidth: '32px',
                height: '28px',
                padding: '0 8px',
                flexShrink: 0,
              }}
            >
              清空
            </Button>
          </Tooltip>
        )}
        {onExit && (
          <Tooltip title="完成画线" placement="top">
            <Button
              type="default"
              icon={<CheckOutlined />}
              size="small"
              onClick={onExit}
              style={{
                minWidth: '32px',
                height: '28px',
                padding: '0 6px',
                flexShrink: 0,
              }}
            />
          </Tooltip>
        )}
      </Space>
    </div>
  );
};

export default DrawingToolbar;

