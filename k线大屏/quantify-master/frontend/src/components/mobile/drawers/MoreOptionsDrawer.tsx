import React from 'react';
import { Button, Space, Typography } from 'antd';
import { BottomDrawer } from '../BottomDrawer.tsx';
import { getThemeColors, type Theme } from '../theme.ts';
import type { DataType } from '../constants.ts';

const { Text } = Typography;

interface MoreOptionsDrawerProps {
  theme: Theme;
  currentTheme: ReturnType<typeof getThemeColors>;
  dataType: DataType;
  moreOptionsVisible: boolean;
  setMoreOptionsVisible: (visible: boolean) => void;
  selectedIndustry: string | null;
  selectedConcept: string | null;
  availableConcepts: any[];
  availableIndustries: any[];
  setFilterDrawerVisible: (visible: boolean) => void;
  strategy: string;
  setStrategyVisible: (visible: boolean) => void;
  setSettingsVisible: (visible: boolean) => void;
  hideStrategyEntry?: boolean;
}

const MoreOptionsDrawer: React.FC<MoreOptionsDrawerProps> = ({
  theme,
  currentTheme,
  dataType,
  moreOptionsVisible,
  setMoreOptionsVisible,
  selectedIndustry,
  selectedConcept,
  availableConcepts,
  availableIndustries,
  setFilterDrawerVisible,
  strategy,
  setStrategyVisible,
  setSettingsVisible,
  hideStrategyEntry,
}) => {
  return (
    <BottomDrawer 
      theme={theme}
      maxHeight="45vh"
      title="更多选项"
      onClose={() => setMoreOptionsVisible(false)}
      open={moreOptionsVisible}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* 筛选 - 仅在股票/可转债时显示 */}
        {(dataType === 'stock' || dataType === 'convertible_bond') && (
          <div>
            <Text strong style={{ color: currentTheme.text, fontSize: '14px', display: 'block', marginBottom: '12px' }}>筛选</Text>
            <Button
              block
              onClick={() => {
                setMoreOptionsVisible(false);
                setFilterDrawerVisible(true);
              }}
              style={{
                height: '48px',
                borderRadius: '12px',
                fontWeight: 500,
                background: (selectedIndustry || selectedConcept) ? currentTheme.primary : currentTheme.card,
                borderColor: (selectedIndustry || selectedConcept) ? currentTheme.primary : currentTheme.border,
                color: (selectedIndustry || selectedConcept) ? '#ffffff' : currentTheme.text,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {(selectedIndustry || selectedConcept) ? (
                <>
                  {selectedConcept && (() => {
                    const concept = availableConcepts.find(c => c.concept_code === selectedConcept);
                    return `💡 ${concept ? (concept.is_hot === true ? `${concept.concept_name}🔥` : concept.concept_name) : '概念'}`;
                  })()}
                  {selectedConcept && selectedIndustry && ' '}
                  {selectedIndustry && (() => {
                    const industry = availableIndustries.find(i => i.industry_code === selectedIndustry);
                    return `🏭 ${industry ? (industry.is_hot === true ? `${industry.industry_name}🔥` : industry.industry_name) : '行业'}`;
                  })()}
                </>
              ) : (
                '筛选（行业/概念）'
              )}
            </Button>
          </div>
        )}

        {/* 策略选择 - 仅在非自选tab时显示 */}
        {dataType !== 'favorites' && !hideStrategyEntry && (
          <div>
            <Text strong style={{ color: currentTheme.text, fontSize: '14px', display: 'block', marginBottom: '12px' }}>策略</Text>
            <Button
              block
              onClick={() => {
                setMoreOptionsVisible(false);
                setStrategyVisible(true);
              }}
              style={{
                height: '48px',
                borderRadius: '12px',
                fontWeight: 500,
                background: strategy ? currentTheme.primary : currentTheme.card,
                borderColor: strategy ? currentTheme.primary : currentTheme.border,
                color: strategy ? '#ffffff' : currentTheme.text,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {strategy
                ? (strategy === 'auction_volume'
                    ? '量价趋势策略'
                    : strategy)
                : '策略'}
            </Button>
          </div>
        )}

        {/* 设置 */}
        <div>
          <Text strong style={{ color: currentTheme.text, fontSize: '14px', display: 'block', marginBottom: '12px' }}>设置</Text>
          <Button
            block
            onClick={() => {
              setMoreOptionsVisible(false);
              setSettingsVisible(true);
            }}
            style={{
              height: '48px',
              borderRadius: '12px',
              fontWeight: 500,
              background: currentTheme.card,
              borderColor: currentTheme.border,
              color: currentTheme.text,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            设置
          </Button>
        </div>

      </Space>
    </BottomDrawer>
  );
};

export default MoreOptionsDrawer;
