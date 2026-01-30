/**
 * 滑块验证码弹窗组件
 * 参考同花顺设计，在页面顶层显示
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Modal, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

interface SliderCaptchaModalProps {
  open: boolean;
  captchaImages: { background: string; slider: string; init_y?: number } | null;
  loading?: boolean;
  onSubmit: (x: number, trackWidth: number) => void;
  onCancel: () => void;
  onRefresh?: () => void;
  /** 主题色，用于移动端不同主题适配 */
  primaryColor?: string;
}

const SliderCaptchaModal: React.FC<SliderCaptchaModalProps> = ({
  open,
  captchaImages,
  loading = false,
  onSubmit,
  onCancel,
  onRefresh,
  primaryColor = '#1890ff',
}) => {
  const [sliderX, setSliderX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  
  // 背景图宽度（同花顺背景图标准宽度340px）
  const BG_WIDTH = 340;
  // 滑轨宽度
  const TRACK_WIDTH = BG_WIDTH;
  // 滑块/滑轨高度
  const SLIDER_SIZE = 40;
  
  // 重置滑块位置
  useEffect(() => {
    if (open) {
      setSliderX(0);
    }
  }, [open, captchaImages]);

  // 处理鼠标/触摸拖动
  const handleDragStart = useCallback((clientX: number) => {
    setIsDragging(true);
  }, []);

  const handleDragMove = useCallback((clientX: number) => {
    if (!isDragging || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    let newX = clientX - rect.left - SLIDER_SIZE / 2;
    
    // 限制范围
    newX = Math.max(0, Math.min(newX, TRACK_WIDTH - SLIDER_SIZE));
    setSliderX(newX);
  }, [isDragging]);

  const handleDragEnd = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      // 拖动结束时自动提交验证
      if (sliderX >= 10) {
        onSubmit(Math.round(sliderX), TRACK_WIDTH);
      }
    }
  }, [isDragging, sliderX, onSubmit]);

  // 鼠标事件
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleDragStart(e.clientX);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    handleDragMove(e.clientX);
  }, [handleDragMove]);

  const handleMouseUp = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  // 触摸事件
  const handleTouchStart = (e: React.TouchEvent) => {
    handleDragStart(e.touches[0].clientX);
  };

  const handleTouchMove = useCallback((e: TouchEvent) => {
    handleDragMove(e.touches[0].clientX);
  }, [handleDragMove]);

  const handleTouchEnd = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  // 添加全局事件监听
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleTouchEnd);
    }
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  if (!captchaImages) return null;


  return (
    <Modal
      open={open}
      title="请完成安全验证"
      onCancel={onCancel}
      footer={null}
      centered
      width={400}
      maskClosable={false}
      destroyOnClose
      styles={{
        body: { padding: '5px' }
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* 验证码图片区域 */}
        <div 
          style={{ 
            position: 'relative', 
            width: BG_WIDTH, 
            marginBottom: 16,
            userSelect: 'none',
          }}
        >
          {/* 背景图 - 使用原始尺寸 */}
          <img 
            src={`data:image/jpeg;base64,${captchaImages.background}`} 
            alt="验证码背景"
            style={{ 
              display: 'block',
              width: BG_WIDTH,
              height: 'auto',
              borderRadius: 4,
            }}
            draggable={false}
          />
          
          {/* 滑块图片 - 使用原始尺寸，跟随拖动，使用init_y定位 */}
          <img 
            src={`data:image/png;base64,${captchaImages.slider}`}
            alt="滑块"
            style={{ 
              position: 'absolute',
              top: captchaImages.init_y ?? 0,
              left: sliderX,
              width: 'auto',
              height: 'auto',
              pointerEvents: 'none',
            }}
            draggable={false}
          />
          
          {/* 刷新按钮 - 右上角 */}
          {onRefresh && (
            <Button
              type="text"
              icon={<ReloadOutlined style={{ color: primaryColor, fontSize: 18 }} />}
              onClick={onRefresh}
              disabled={loading}
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                width: 32,
                height: 32,
                backgroundColor: 'rgba(255, 255, 255, 1)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            />
          )}
        </div>

        {/* 滑动轨道 */}
        <div 
          ref={containerRef}
          style={{
            position: 'relative',
            width: TRACK_WIDTH,
            height: SLIDER_SIZE + 2,
            backgroundColor: '#f5f5f5',
            borderRadius: SLIDER_SIZE / 2,
            border: '1px solid #e8e8e8',
            overflow: 'hidden',
          }}
        >
          {/* 已滑动区域 */}
          <div 
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: sliderX + SLIDER_SIZE / 2,
              height: '100%',
              backgroundColor: `${primaryColor}20`,
              transition: isDragging ? 'none' : 'width 0.1s',
            }}
          />
          
          {/* 提示文字 */}
          <div 
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#999',
              fontSize: 14,
              pointerEvents: 'none',
            }}
          >
            {sliderX < 10 ? '向右拖动滑块填充拼图' : ''}
          </div>
          
          {/* 滑块按钮 - 与轨道高度一致 */}
          <div
            ref={sliderRef}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            style={{
              position: 'absolute',
              left: sliderX,
              top: 0,
              width: SLIDER_SIZE,
              height: SLIDER_SIZE,
              backgroundColor: '#fff',
              borderRadius: SLIDER_SIZE / 2,
              boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: isDragging ? 'grabbing' : 'grab',
              transition: isDragging ? 'none' : 'left 0.1s',
              userSelect: 'none',
            }}
          >
            <span style={{ 
              fontSize: 18, 
              color: primaryColor,
              fontWeight: 'bold',
            }}>
              →
            </span>
          </div>
        </div>

      </div>
    </Modal>
  );
};

export default SliderCaptchaModal;
