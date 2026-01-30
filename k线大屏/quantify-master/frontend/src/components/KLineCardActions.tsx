import React from 'react';
import { Button } from 'antd';
import { FullscreenOutlined, CloseOutlined } from '@ant-design/icons';

interface Props {
  theme: string;
  item: any;
  originalItem: any;
  isShowingUnderlying: boolean;
  isShowingBond: boolean;
  isLoadingCallInfo: boolean;
  isLoadingBonds: boolean;
  relatedBonds: any[];
  onSwitchToUnderlying: () => void;
  onSwitchToConvertibleBond: () => void;
  onSwitchBackToStock: () => void;
  onShowCallInfo: (item: any) => void;
  onFullscreen: () => void;
  isFullscreen: boolean;
}

const KLineCardActions: React.FC<Props> = ({
  theme,
  item,
  originalItem,
  isShowingUnderlying,
  isShowingBond,
  isLoadingCallInfo,
  isLoadingBonds,
  relatedBonds,
  onSwitchToUnderlying,
  onSwitchToConvertibleBond,
  onSwitchBackToStock,
  onShowCallInfo,
  onFullscreen,
  isFullscreen,
}) => {
  // 检查是否应该显示赎回信息按钮（情况2：从股票切换到债券）
  const shouldShowCallButtonForBond = React.useMemo(() => {
    return (
      originalItem.type === 'stock' &&
      isShowingBond &&
      relatedBonds.length > 0 &&
      relatedBonds[0]?.call_records &&
      Array.isArray(relatedBonds[0].call_records) &&
      relatedBonds[0].call_records.length > 0
    );
  }, [originalItem.type, isShowingBond, relatedBonds]);

  return (
    <div style={{
      display: 'flex',
      gap: '4px',
      marginLeft: '12px',
      alignItems: 'flex-start',
      flexWrap: 'nowrap',      // 强制不换行
      minWidth: 'max-content', // 确保容器至少有内容所需的宽度
      flexShrink: 0            // 防止收缩
    }}>
      {/* 可转债切换正股按钮 */}
      {item.type === 'convertible_bond' && item.underlying_stock && (
        <Button
          type="text"
          size="small"
          onClick={onSwitchToUnderlying}
          style={{
            color: isShowingUnderlying ? '#52c41a' : '#1890ff',
            border: `1px solid ${isShowingUnderlying ? '#52c41a' : '#1890ff'}`,
            borderRadius: '6px',
            width: '24px',
            height: '24px',
            minWidth: '24px',
            fontSize: '10px',
            padding: '0',
            background: isShowingUnderlying ? 'rgba(82, 196, 26, 0.1)' : 'rgba(24, 144, 255, 0.1)',
            transition: 'all 0.2s ease'
          }}
          title={isShowingUnderlying ? '切换回可转债' : '切换到正股'}
        >
          {isShowingUnderlying ? '债' : '股'}
        </Button>
      )}

      {/* 可转债赎回信息按钮 - 只有在有赎回信息时才显示 */}
      {/* 情况1: 原始是可转债，有赎回信息 */}
      {item.type === 'convertible_bond' && item.call_records && item.call_records.length > 0 && (
        <Button
          type="text"
          size="small"
          loading={isLoadingCallInfo}
          onClick={() => onShowCallInfo(item)}
          style={{
            color: '#faad14',
            border: '1px solid #faad14',
            borderRadius: '6px',
            width: '24px',
            height: '24px',
            minWidth: '24px',
            fontSize: '10px',
            padding: '0',
            background: 'rgba(250, 173, 20, 0.1)',
            transition: 'all 0.2s ease'
          }}
          title="查看赎回信息"
        >
          {isLoadingCallInfo ? '' : '赎'}
        </Button>
      )}
      
      {/* 可转债赎回信息按钮 - 情况2: 从股票切换到债券后，债券有赎回信息 */}
      {shouldShowCallButtonForBond && (
        <Button
          type="text"
          size="small"
          loading={isLoadingCallInfo}
          onClick={() => onShowCallInfo(relatedBonds[0])}
          style={{
            color: '#faad14',
            border: '1px solid #faad14',
            borderRadius: '6px',
            width: '24px',
            height: '24px',
            minWidth: '24px',
            fontSize: '10px',
            padding: '0',
            background: 'rgba(250, 173, 20, 0.1)',
            transition: 'all 0.2s ease'
          }}
          title="查看赎回信息"
        >
          {isLoadingCallInfo ? '' : '赎'}
        </Button>
      )}

      {/* 股票切换转债按钮 */}
      {originalItem.type === 'stock' && !isShowingBond && relatedBonds.length > 0 && (
        <Button
          type="text"
          size="small"
          onClick={onSwitchToConvertibleBond}
          loading={isLoadingBonds}
          style={{
            color: isShowingBond ? '#52c41a' : '#1890ff',
            border: `1px solid ${isShowingBond ? '#52c41a' : '#1890ff'}`,
            borderRadius: '6px',
            width: '24px',
            height: '24px',
            minWidth: '24px',
            fontSize: '10px',
            padding: '0',
            background: isShowingBond ? 'rgba(82, 196, 26, 0.1)' : 'rgba(24, 144, 255, 0.1)',
            transition: 'all 0.2s ease'
          }}
          title="切换到可转债"
        >
          债
        </Button>
      )}

      {/* 切换回股票按钮 */}
      {originalItem.type === 'stock' && isShowingBond && (
        <Button
          type="text"
          size="small"
          onClick={onSwitchBackToStock}
          style={{
            color: '#52c41a',
            border: '1px solid #52c41a',
            borderRadius: '6px',
            width: '24px',
            height: '24px',
            minWidth: '24px',
            fontSize: '10px',
            padding: '0',
            background: 'rgba(82, 196, 26, 0.1)',
            transition: 'all 0.2s ease'
          }}
          title="切换回股票"
        >
          股
        </Button>
      )}

      {/* 全屏按钮 */}
      <Button
        type="text"
        size="small"
        icon={<FullscreenOutlined />}
        onClick={onFullscreen}
        style={{
          color: 'rgba(255,255,255,0.6)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: '6px',
          width: '24px',
          height: '24px',
          minWidth: '24px',
          fontSize: '12px',
          padding: '0',
          background: 'rgba(255,255,255,0.05)',
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
        }}
      />
      
      {/* 退出全屏按钮 */}
      {isFullscreen && (
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined />}
          onClick={onFullscreen}
          className="mobile-close-button"
          style={{
            color: 'rgba(255,255,255,0.6)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '6px',
            width: '24px',
            height: '24px',
            minWidth: '24px',
            fontSize: '12px',
            padding: '0',
            background: 'rgba(255,255,255,0.05)',
            transition: 'all 0.2s ease'
          }}
        />
      )}
    </div>
  );
};

export default KLineCardActions;

