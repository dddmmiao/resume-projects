import React from 'react';
import { Modal, Tag, Divider } from 'antd';

interface HotInfoModalProps {
  open: boolean;
  onClose: () => void;
  hotConcept?: string | null;
  hotRankReason?: string | null;
  theme: 'dark' | 'light' | 'blue' | 'purple' | 'green' | 'orange' | 'cyan' | 'red' | 'gold';
  dataType?: 'stock' | 'convertible_bond' | 'concept' | 'industry';
  onConceptFilter?: (concept: string) => void;
}

const HotInfoModal: React.FC<HotInfoModalProps> = ({
  open,
  onClose,
  hotConcept,
  hotRankReason,
  theme,
  dataType,
  onConceptFilter,
}) => {
  // 判断是否可以点击热度概念进行筛选（仅股票和可转债tab）
  const canFilterByConcept = (dataType === 'stock' || dataType === 'convertible_bond') && onConceptFilter;

  // 解析热度概念字符串为数组
  // 支持多种分隔符：逗号、分号、顿号、换行符等，也支持 JSON 数组格式
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
    // 支持：逗号（中英文）、分号（中英文）、顿号、换行符、管道符
    const separatorRegex = /[,，;；、\n\r\n|]+/;
    const concepts = trimmed
      .split(separatorRegex)
      .map(c => c.trim())
      .filter(c => c.length > 0);
    
    // 去重
    return Array.from(new Set(concepts.length > 0 ? concepts : [trimmed]));
  };

  // 处理单个概念的点击
  const handleConceptClick = (concept: string) => {
    if (canFilterByConcept && onConceptFilter) {
      onConceptFilter(concept);
      onClose();
    }
  };

  // 解析热度概念
  const conceptList = hotConcept ? parseConceptString(hotConcept) : [];
  const hasValidConcept = conceptList.length > 0;
  
  // 处理上榜原因，确保换行符正确显示
  // 将字面上的 \n 转换为真正的换行符（以防后端返回转义字符串）
  const processRankReason = (reason: string | null | undefined): string => {
    if (!reason || typeof reason !== 'string') {
      return '';
    }
    // 如果包含字面上的 \n（转义的换行符），先替换
    // 然后确保真正的换行符能够正确显示
    return reason.replace(/\\n/g, '\n').replace(/\\r\\n/g, '\n').replace(/\\r/g, '\n');
  };

  const processedRankReason = processRankReason(hotRankReason);
  const hasValidReason = processedRankReason && processedRankReason.trim().length > 0;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={600}
      style={{
        top: '50px'
      }}
    >
      <div className="label-text" style={{ fontSize: 14 }}>
        {hasValidConcept && (
          <div style={{ marginBottom: hasValidReason ? 16 : 0 }}>
            <h4 style={{ 
              margin: '0 0 8px 0', 
              color: '#1890ff',
              fontSize: '14px',
              fontWeight: 'bold'
            }}>
              热度概念 ({conceptList.length}个)
            </h4>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px'
            }}>
              {conceptList.map((concept, index) => (
                <Tag
                  key={`hot-concept-${index}`}
                  color="blue"
                  style={{
                    margin: '2px',
                    cursor: canFilterByConcept ? 'pointer' : 'default'
                  }}
                  onClick={() => handleConceptClick(concept)}
                >
                  {concept}
                </Tag>
              ))}
            </div>
          </div>
        )}

        {/* 分割线 */}
        {hasValidConcept && hasValidReason && (
          <Divider style={{ margin: '16px 0' }} />
        )}

        {hasValidReason && (
          <div>
            <h4 style={{ 
              margin: '0 0 8px 0', 
              color: '#ff7a00',
              fontSize: '14px',
              fontWeight: 'bold'
            }}>
              上榜原因
            </h4>
            <div 
              className="hide-scrollbar"
              style={{
                padding: '12px 0px',
                background: theme === 'light' ? '#f5f5f5' : 'rgba(255,255,255,0.05)',
                borderRadius: 6,
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.8,
                border: `1px solid ${theme === 'light' ? 'rgba(255, 122, 0, 0.2)' : 'rgba(255,255,255,0.1)'}`,
                maxHeight: '300px',
                overflowY: 'auto',
                fontSize: 13
              }}
            >
              {processedRankReason}
            </div>
          </div>
        )}
        
        {!hasValidConcept && !hasValidReason && (
          <div style={{ 
            textAlign: 'center',
            opacity: 0.7,
            padding: '40px 0',
            fontSize: 14
          }}>
            暂无热度信息
          </div>
        )}
      </div>
    </Modal>
  );
};

export default HotInfoModal;

