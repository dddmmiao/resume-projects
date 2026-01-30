/**
 * 综合标签显示组件（概念+行业）
 */
import React, { useState } from 'react';
import { Button, Modal, Tag, Divider, Tooltip } from 'antd';
import { TagsOutlined } from '@ant-design/icons';

interface TagsDisplayProps {
  concepts: string[];
  industries: string[];
  onConceptClick?: (concept: string) => void;
  onIndustryClick?: (industry: string) => void;
}

const TagsDisplay: React.FC<TagsDisplayProps> = ({ 
  concepts, 
  industries,
  onConceptClick,
  onIndustryClick 
}) => {
  const [modalVisible, setModalVisible] = useState(false);

  const handleConceptClick = (concept: string) => {
    if (onConceptClick) {
      onConceptClick(concept);
      setModalVisible(false);
    }
  };

  const handleIndustryClick = (industry: string) => {
    if (onIndustryClick) {
      onIndustryClick(industry);
      setModalVisible(false);
    }
  };

  const totalTags = (concepts?.length || 0) + (industries?.length || 0);

  if (totalTags === 0) {
    return null;
  }

  return (
    <>
      <Tooltip title={`点击查看概念和行业`}>
        <Button
          type="text"
          size="small"
          icon={<TagsOutlined />}
          onClick={() => setModalVisible(true)}
          className="stock-tags"
          style={{
            fontSize: '10px',
            padding: '0 3px',
            height: '16px',
            minWidth: '16px',
            border: 'none',
            background: 'transparent'
          }}
        />
      </Tooltip>

      <Modal
        title={null}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={700}
      >
        <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
          {/* 概念板块 */}
          {concepts && concepts.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ 
                margin: '0 0 8px 0', 
                color: '#1890ff',
                fontSize: '14px',
                fontWeight: 'bold'
              }}>
                概念板块 ({concepts.length}个)
              </h4>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px'
              }}>
                {concepts.map((concept, index) => (
                  <Tag
                    key={`concept-${index}`}
                    color="blue"
                    style={{
                      margin: '2px',
                      cursor: onConceptClick ? 'pointer' : 'default'
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
          {concepts && concepts.length > 0 && industries && industries.length > 0 && (
            <Divider style={{ margin: '16px 0' }} />
          )}

          {/* 行业板块 */}
          {industries && industries.length > 0 && (
            <div>
              <h4 style={{ 
                margin: '0 0 8px 0', 
                color: '#ff7a00',
                fontSize: '14px',
                fontWeight: 'bold'
              }}>
                行业板块 ({industries.length}个)
              </h4>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px'
              }}>
                {industries.map((industry, index) => (
                  <Tag
                    key={`industry-${index}`}
                    color="orange"
                    style={{
                      margin: '2px',
                      cursor: onIndustryClick ? 'pointer' : 'default'
                    }}
                    onClick={() => handleIndustryClick(industry)}
                  >
                    {industry}
                  </Tag>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};

export default TagsDisplay;
