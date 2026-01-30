import React from 'react';
import { List, Typography } from 'antd';
import { BottomDrawer } from '../BottomDrawer.tsx';
import { DrawerListItem } from '../DrawerListItem.tsx';
import { getThemeColors, type Theme } from '../theme.ts';

const { Text } = Typography;

interface FilterDrawerSectionProps {
  theme: Theme;
  currentTheme: ReturnType<typeof getThemeColors>;
  filterCategory: 'industry' | 'concept' | null;
  setFilterCategory: (category: 'industry' | 'concept' | null) => void;
  filterDrawerVisible: boolean;
  setFilterDrawerVisible: (visible: boolean) => void;
  selectedIndustry: string | null;
  setSelectedIndustry: (value: string | null) => void;
  selectedConcept: string | null;
  setSelectedConcept: (value: string | null) => void;
  availableIndustries: any[];
  availableConcepts: any[];
  setCurrentPage: (page: number) => void;
}

const FilterDrawerSection: React.FC<FilterDrawerSectionProps> = ({
  theme,
  currentTheme,
  filterCategory,
  setFilterCategory,
  filterDrawerVisible,
  setFilterDrawerVisible,
  selectedIndustry,
  setSelectedIndustry,
  selectedConcept,
  setSelectedConcept,
  availableIndustries,
  availableConcepts,
  setCurrentPage,
}) => {
  return (
    <BottomDrawer
      title={filterCategory === 'industry' ? '选择行业' : filterCategory === 'concept' ? '选择概念' : '筛选'}
      theme={theme}
      onClose={() => {
        setFilterDrawerVisible(false);
        setFilterCategory(null);
        setCurrentPage(1);
      }}
      open={filterDrawerVisible}
      onBack={filterCategory ? () => setFilterCategory(null) : undefined}
    >
      {filterCategory === null ? (
        // 初始选择页面：显示行业和概念两个选项，以及已选择的筛选条件
        <>
          {/* 已选择的筛选条件显示 */}
          {(selectedIndustry || selectedConcept) && (
            <div style={{ 
              padding: '12px 16px', 
              borderBottom: `1px solid ${currentTheme.border}`,
              background: theme === 'light' ? 'rgba(24, 144, 255, 0.05)' : 'rgba(24, 144, 255, 0.08)'
            }}>
              <Text strong style={{ color: currentTheme.text, fontSize: '13px', marginBottom: '8px', display: 'block' }}>已选择</Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {selectedConcept && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: '6px',
                      background: `${currentTheme.primary}15`,
                      border: `1px solid ${currentTheme.primary}40`,
                      color: currentTheme.primary,
                      fontSize: '12px',
                      fontWeight: 500
                    }}
                  >
                    <span>💡 {(() => {
                      const concept = availableConcepts.find(c => c.concept_code === selectedConcept);
                      return concept ? (concept.is_hot === true ? `${concept.concept_name}🔥` : concept.concept_name) : '概念';
                    })()}</span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedConcept(null);
                      }}
                      style={{
                        fontSize: '14px',
                        lineHeight: 1,
                        marginLeft: 4,
                        cursor: 'pointer',
                        opacity: 0.7
                      }}
                    >
                      ✕
                    </span>
                  </div>
                )}
                {selectedIndustry && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: '6px',
                      background: `${currentTheme.primary}15`,
                      border: `1px solid ${currentTheme.primary}40`,
                      color: currentTheme.primary,
                      fontSize: '12px',
                      fontWeight: 500
                    }}
                  >
                    <span>🏭 {(() => {
                      const industry = availableIndustries.find(i => i.industry_code === selectedIndustry);
                      return industry ? (industry.is_hot === true ? `${industry.industry_name}🔥` : industry.industry_name) : '行业';
                    })()}</span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedIndustry(null);
                      }}
                      style={{
                        fontSize: '14px',
                        lineHeight: 1,
                        marginLeft: 4,
                        cursor: 'pointer',
                        opacity: 0.7
                      }}
                    >
                      ✕
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* 行业和概念选项 */}
          <List
            dataSource={[
              { key: 'concept', label: '概念', icon: '💡' },
              { key: 'industry', label: '行业', icon: '🏭' }
            ]}
            renderItem={(item: any) => (
              <DrawerListItem
                theme={theme}
                selected={false}
                onClick={() => setFilterCategory(item.key as 'industry' | 'concept')}
                label={item.label}
                icon={item.icon}
              />
            )}
          />
        </>
      ) : filterCategory === 'industry' ? (
        // 行业列表
        <List
          dataSource={availableIndustries}
          renderItem={(item: any) => (
            <DrawerListItem
              theme={theme}
              selected={selectedIndustry === item.industry_code}
              onClick={() => {
                setSelectedIndustry(item.industry_code);
                setFilterCategory(null);
                setFilterDrawerVisible(false);
              }}
              label={item.is_hot === true ? `🔥${item.industry_name}` : item.industry_name}
            />
          )}
        />
      ) : (
        // 概念列表
        <List
          dataSource={availableConcepts}
          renderItem={(item: any) => (
            <DrawerListItem
              theme={theme}
              selected={selectedConcept === item.concept_code}
              onClick={() => {
                setSelectedConcept(item.concept_code);
                setFilterCategory(null);
                setFilterDrawerVisible(false);
              }}
              label={item.is_hot === true ? `🔥${item.concept_name}` : item.concept_name}
            />
          )}
        />
      )}
    </BottomDrawer>
  );
};

export default FilterDrawerSection;
