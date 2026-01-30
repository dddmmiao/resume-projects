import React from 'react';

type FullscreenOverlayProps = {
  visible: boolean;
  onClose: () => void;
};

const FullscreenOverlay: React.FC<FullscreenOverlayProps> = ({ visible, onClose }) => {
  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onClick={(e) => {
        // 只有直接点击遮罩层才关闭，避免下拉框等组件的点击冒泡导致意外关闭
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    />
  );
};

export default FullscreenOverlay;
