import React from 'react';

interface StatsSkeletonProps {
  isDarkTheme: boolean;
  /** 是否为移动端布局 */
  isMobile?: boolean;
}

// 骨架条动画样式
const shimmerStyle = (isDark: boolean): React.CSSProperties => ({
  background: isDark 
    ? 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)'
    : 'linear-gradient(90deg, rgba(0,0,0,0.04) 25%, rgba(0,0,0,0.08) 50%, rgba(0,0,0,0.04) 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s infinite',
});

// 骨架条组件
const SkeletonBar: React.FC<{ 
  width: string | number; 
  height: number; 
  isDark: boolean;
  style?: React.CSSProperties;
}> = ({ width, height, isDark, style }) => (
  <div style={{
    width,
    height,
    borderRadius: 4,
    ...shimmerStyle(isDark),
    ...style,
  }} />
);

/**
 * 统计窗口骨架屏组件
 * 支持桌面端和移动端两种布局
 */
const StatsSkeleton: React.FC<StatsSkeletonProps> = ({ isDarkTheme, isMobile = false }) => {
  const cardBg = isDarkTheme ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
  const border = isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';
  const barBg = isDarkTheme ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  
  // 移动端布局
  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
        {/* CSS 动画 */}
        <style>{`
          @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>

        {/* 标题行：标题 + 关闭按钮 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SkeletonBar width={100} height={18} isDark={isDarkTheme} />
            <SkeletonBar width={40} height={20} isDark={isDarkTheme} />
          </div>
          <SkeletonBar width={32} height={32} isDark={isDarkTheme} style={{ borderRadius: 6 }} />
        </div>

        {/* 模式切换按钮行 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <SkeletonBar width={72} height={32} isDark={isDarkTheme} style={{ borderRadius: 6 }} />
          </div>
          <SkeletonBar width={48} height={32} isDark={isDarkTheme} style={{ borderRadius: 6 }} />
        </div>

        {/* 统计摘要卡片骨架 */}
        <div style={{
          padding: 10,
          background: cardBg,
          borderRadius: 8,
          border: `1px solid ${border}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <SkeletonBar width={60} height={13} isDark={isDarkTheme} />
            <SkeletonBar width={45} height={16} isDark={isDarkTheme} />
          </div>
          <div style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <SkeletonBar width={32} height={12} isDark={isDarkTheme} />
              <SkeletonBar width={100} height={12} isDark={isDarkTheme} />
            </div>
            <SkeletonBar width="100%" height={6} isDark={isDarkTheme} />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <SkeletonBar width={32} height={12} isDark={isDarkTheme} />
              <SkeletonBar width={100} height={12} isDark={isDarkTheme} />
            </div>
            <SkeletonBar width="100%" height={6} isDark={isDarkTheme} />
          </div>
        </div>

        {/* 控制按钮行 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SkeletonBar width={72} height={32} isDark={isDarkTheme} style={{ borderRadius: 6 }} />
          <SkeletonBar width={48} height={32} isDark={isDarkTheme} style={{ borderRadius: 6 }} />
          <SkeletonBar width={48} height={32} isDark={isDarkTheme} style={{ borderRadius: 6 }} />
        </div>

        {/* 图表区域骨架 */}
        <div style={{
          flex: 1,
          minHeight: 280,
          background: cardBg,
          borderRadius: 8,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          padding: '30px 20px 40px',
          gap: 4,
        }}>
          {[35, 55, 80, 100, 85, 45, 25, 40, 65, 90, 70, 50, 30].map((h, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: `${h}%`,
                background: barBg,
                borderRadius: 2,
                ...shimmerStyle(isDarkTheme),
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  // 桌面端布局
  return (
    <div>
      {/* CSS 动画 */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {/* 概览卡片骨架 - 模拟 StatsSummaryCard */}
      <div style={{
        padding: 10,
        background: cardBg,
        borderRadius: 8,
        border: `1px solid ${border}`,
        marginBottom: 8,
      }}>
        {/* 标题行 */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}>
          <SkeletonBar width={80} height={14} isDark={isDarkTheme} />
          <SkeletonBar width={50} height={18} isDark={isDarkTheme} />
        </div>
        
        {/* 收盘进度条 */}
        <div style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <SkeletonBar width={40} height={12} isDark={isDarkTheme} />
            <SkeletonBar width={120} height={12} isDark={isDarkTheme} />
          </div>
          <SkeletonBar width="100%" height={6} isDark={isDarkTheme} />
        </div>
        
        {/* 日内进度条 */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <SkeletonBar width={40} height={12} isDark={isDarkTheme} />
            <SkeletonBar width={120} height={12} isDark={isDarkTheme} />
          </div>
          <SkeletonBar width="100%" height={6} isDark={isDarkTheme} />
        </div>
      </div>
      
      {/* 控制栏骨架 - 模拟 ChartControls */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[48, 48, 56, 48, 56].map((w, i) => (
            <SkeletonBar key={i} width={w} height={26} isDark={isDarkTheme} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <SkeletonBar width={48} height={26} isDark={isDarkTheme} />
          <SkeletonBar width={48} height={26} isDark={isDarkTheme} />
        </div>
      </div>
      
      {/* 图表区域骨架 - 模拟柱状图 */}
      <div style={{
        height: 320,
        background: cardBg,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: '40px 30px 50px',
        gap: 6,
      }}>
        {[35, 55, 80, 100, 85, 45, 25, 40, 65, 90, 70, 50, 30].map((h, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${h}%`,
              background: barBg,
              borderRadius: 2,
              ...shimmerStyle(isDarkTheme),
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default StatsSkeleton;
