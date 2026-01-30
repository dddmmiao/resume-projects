/**
 * 移动端详情页 - 底部抽屉组件
 * 包含概念行业标签、可转债赎回记录、热度信息等抽屉
 */

import React from 'react';
import { BottomDrawer } from '../BottomDrawer.tsx';
import type { DetailBottomDrawersProps } from './types.ts';

export const DetailBottomDrawers: React.FC<DetailBottomDrawersProps> = ({
  theme,
  currentTheme,
  selectedStock,
  tagsModalVisible,
  setTagsModalVisible,
  callRecordsModalVisible,
  setCallRecordsModalVisible,
  hotInfoModalVisible,
  setHotInfoModalVisible,
  hotInfoStock,
  setHotInfoStock,
}) => {
  return (
    <>
      {/* 概念行业标签 */}
      <BottomDrawer
        theme={theme}
        title="概念行业标签"
        open={tagsModalVisible}
        onClose={() => setTagsModalVisible(false)}
        zIndex={1001}
      >
        <>
          {/* 概念板块 */}
          {selectedStock?.concepts && Array.isArray(selectedStock.concepts) && selectedStock.concepts.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h4 style={{
                margin: '0 0 12px 0',
                color: currentTheme.primary,
                fontSize: 16,
                fontWeight: 600
              }}>
                概念板块
              </h4>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8
              }}>
                {selectedStock.concepts.map((concept: string, index: number) => (
                  <div
                    key={`concept-${index}`}
                    style={{
                      background: `${currentTheme.primary}15`,
                      border: `1px solid ${currentTheme.primary}40`,
                      borderRadius: 8,
                      padding: '6px 12px',
                      fontSize: 12,
                      color: currentTheme.primary,
                      fontWeight: 500
                    }}
                  >
                    {concept}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 分割线 */}
          {selectedStock?.concepts && selectedStock.concepts.length > 0 &&
            selectedStock?.industries && selectedStock.industries.length > 0 && (
              <div style={{
                height: 1,
                background: currentTheme.border,
                margin: '16px 0'
              }} />
            )}

          {/* 行业板块 */}
          {selectedStock?.industries && Array.isArray(selectedStock.industries) && selectedStock.industries.length > 0 && (
            <div>
              <h4 style={{
                margin: '0 0 12px 0',
                color: '#ff7a00',
                fontSize: 16,
                fontWeight: 600
              }}>
                行业板块
              </h4>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8
              }}>
                {selectedStock.industries.map((industry: string, index: number) => (
                  <div
                    key={`industry-${index}`}
                    style={{
                      background: 'rgba(255, 122, 0, 0.1)',
                      border: '1px solid rgba(255, 122, 0, 0.3)',
                      borderRadius: 8,
                      padding: '6px 12px',
                      fontSize: 12,
                      color: '#ff7a00',
                      fontWeight: 500
                    }}
                  >
                    {industry}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      </BottomDrawer>

      {/* 可转债赎回记录抽屉 */}
      <BottomDrawer
        theme={theme}
        title="赎回记录"
        open={callRecordsModalVisible}
        onClose={() => setCallRecordsModalVisible(false)}
        zIndex={1001}
      >
        {selectedStock?.call_records && Array.isArray(selectedStock.call_records) && selectedStock.call_records.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {selectedStock.call_records.map((record: any, index: number) => {
              // 获取赎回状态显示
              const getStatusDisplay = () => {
                if (record.call_status && record.call_status.display_name) {
                  return {
                    text: record.call_status.display_name,
                    color: record.call_status.color || currentTheme.text
                  };
                } else if (record.is_call) {
                  const getStatusColor = (status: string) => {
                    if (status.includes('公告实施强赎') || status.includes('公告到期赎回')) {
                      return '#ff4d4f';
                    } else if (status.includes('已满足强赎条件')) {
                      return '#fa8c16';
                    } else if (status.includes('公告提示强赎')) {
                      return '#faad14';
                    } else if (status.includes('公告不强赎')) {
                      return '#52c41a';
                    }
                    return currentTheme.text;
                  };
                  return {
                    text: record.is_call,
                    color: getStatusColor(record.is_call)
                  };
                } else if (record.call_type) {
                  const getStatusColor = (status: string) => {
                    if (status.includes('公告实施强赎') || status.includes('公告到期赎回')) {
                      return '#ff4d4f';
                    }
                    return currentTheme.text;
                  };
                  return {
                    text: record.call_type,
                    color: getStatusColor(record.call_type)
                  };
                }
                return null;
              };

              const statusDisplay = getStatusDisplay();

              // 格式化日期
              const formatDate = (date: string | null | undefined) => {
                if (!date) return null;
                try {
                  return new Date(date).toLocaleDateString('zh-CN');
                } catch {
                  return date;
                }
              };

              return (
                <div
                  key={`call-record-${index}`}
                  style={{
                    background: theme === 'light' ? 'rgba(0, 0, 0, 0.02)' : 'rgba(255, 255, 255, 0.05)',
                    border: `1px solid ${currentTheme.border}`,
                    borderRadius: 8,
                    padding: 12,
                  }}
                >
                  {/* 公告日期 */}
                  {record.ann_date && (
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ color: currentTheme.textSecondary, fontSize: 12 }}>公告日期：</span>
                      <span style={{ color: currentTheme.text, fontSize: 13 }}>
                        {formatDate(record.ann_date)}
                      </span>
                    </div>
                  )}
                  {/* 赎回状态 */}
                  {statusDisplay && (
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ color: currentTheme.textSecondary, fontSize: 12 }}>赎回状态：</span>
                      <span style={{
                        color: statusDisplay.color,
                        fontWeight: 600,
                        fontSize: 13
                      }}>
                        {statusDisplay.text}
                      </span>
                    </div>
                  )}
                  {/* 赎回价格 */}
                  {record.call_price !== undefined && record.call_price !== null && (
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ color: currentTheme.textSecondary, fontSize: 12 }}>赎回价格：</span>
                      <span style={{ color: currentTheme.text, fontWeight: 600, fontSize: 13 }}>
                        ¥{typeof record.call_price === 'number' ? record.call_price.toFixed(4) : record.call_price}
                      </span>
                    </div>
                  )}
                  {/* 赎回日期 */}
                  {record.call_date && (
                    <div>
                      <span style={{ color: currentTheme.textSecondary, fontSize: 12 }}>赎回日期：</span>
                      <span style={{ color: currentTheme.text, fontSize: 13 }}>
                        {formatDate(record.call_date)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{
            textAlign: 'center',
            padding: 40,
            color: currentTheme.textSecondary
          }}>
            暂无赎回信息
          </div>
        )}
      </BottomDrawer>

      {/* 热度信息详情抽屉 */}
      <BottomDrawer
        theme={theme}
        title="热度信息"
        open={hotInfoModalVisible}
        onClose={() => {
          setHotInfoModalVisible(false);
          setHotInfoStock(null);
        }}
        zIndex={1001}
      >
        {(() => {
          // 优先使用列表页点击的股票数据，否则使用详情页的股票数据
          const currentStock = hotInfoStock || selectedStock;

          // 解析热度概念字符串为数组（与HotInfoModal逻辑一致）
          const parseConceptString = (conceptStr: string | null | undefined): string[] => {
            if (!conceptStr || typeof conceptStr !== 'string') {
              return [];
            }

            const trimmed = conceptStr.trim();
            if (!trimmed) {
              return [];
            }

            // 尝试解析为 JSON 数组
            try {
              const parsed = JSON.parse(trimmed);
              if (Array.isArray(parsed)) {
                return parsed
                  .map((item) => (typeof item === 'string' ? item.trim() : String(item).trim()))
                  .filter((item) => item.length > 0);
              }
            } catch (e) {
              // 不是 JSON 格式，继续其他解析方式
            }

            // 使用正则表达式一次性按所有常见分隔符拆分
            const separatorRegex = /[,，;；、\n\r\n|]+/;
            const concepts = trimmed
              .split(separatorRegex)
              .map(c => c.trim())
              .filter(c => c.length > 0);

            // 去重
            return Array.from(new Set(concepts.length > 0 ? concepts : [trimmed]));
          };

          // 处理上榜原因，确保换行符正确显示
          const processRankReason = (reason: string | null | undefined): string => {
            if (!reason || typeof reason !== 'string') {
              return '';
            }
            return reason.replace(/\\n/g, '\n').replace(/\\r\\n/g, '\n').replace(/\\r/g, '\n');
          };

          const conceptList = currentStock?.hot_concept ? parseConceptString(currentStock.hot_concept) : [];
          const hasValidConcept = conceptList.length > 0;
          const processedRankReason = processRankReason(currentStock?.hot_rank_reason);
          const hasValidReason = processedRankReason && processedRankReason.trim().length > 0;

          return (
            <>
              {/* 热度概念 */}
              {hasValidConcept && (
                <div style={{ marginBottom: hasValidReason ? 16 : 0 }}>
                  <h4 style={{
                    margin: '0 0 12px 0',
                    color: currentTheme.primary,
                    fontSize: 16,
                    fontWeight: 600
                  }}>
                    热度概念
                  </h4>
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8
                  }}>
                    {conceptList.map((concept, index) => (
                      <div
                        key={`hot-concept-${index}`}
                        style={{
                          background: `${currentTheme.primary}15`,
                          border: `1px solid ${currentTheme.primary}40`,
                          borderRadius: 8,
                          padding: '6px 12px',
                          fontSize: 12,
                          color: currentTheme.primary,
                          fontWeight: 500
                        }}
                      >
                        {concept}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 分割线 */}
              {hasValidConcept && hasValidReason && (
                <div style={{
                  height: 1,
                  background: currentTheme.border,
                  margin: '16px 0'
                }} />
              )}

              {/* 上榜原因 */}
              {hasValidReason && (
                <div>
                  <h4 style={{
                    margin: '0 0 12px 0',
                    color: '#ff7a00',
                    fontSize: 16,
                    fontWeight: 600
                  }}>
                    上榜原因
                  </h4>
                  <div
                    className="hide-scrollbar"
                    style={{
                      padding: '12px',
                      background: theme === 'light' ? 'rgba(0, 0, 0, 0.02)' : 'rgba(255, 255, 255, 0.05)',
                      borderRadius: 8,
                      wordBreak: 'break-word',
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.8,
                      border: `1px solid ${currentTheme.border}`,
                      maxHeight: '300px',
                      overflowY: 'auto',
                      fontSize: 13,
                      color: currentTheme.text
                    }}
                  >
                    {processedRankReason}
                  </div>
                </div>
              )}

              {!hasValidConcept && !hasValidReason && (
                <div style={{
                  textAlign: 'center',
                  padding: 40,
                  color: currentTheme.textSecondary
                }}>
                  暂无热度信息
                </div>
              )}
            </>
          );
        })()}
      </BottomDrawer>
    </>
  );
};
