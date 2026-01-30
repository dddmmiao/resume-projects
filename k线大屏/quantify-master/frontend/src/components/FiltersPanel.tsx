import React from 'react';
import { Select } from 'antd';

interface Props {
  theme: string;
  dataType: string;
  filterIndustry: string[];
  filterConcepts: string[];
  availableIndustries: string[];
  availableConcepts: string[];
  conceptsCacheData: any[];
  industriesCacheData: any[];
  industrySelectWidth: number;
  conceptSelectWidth: number;
  onIndustryChange: (v: string | null) => void;
  onConceptsChange: (v: string[]) => void;
  onFetchFilterOptions: () => void;
}

const FiltersPanel: React.FC<Props> = ({
  theme,
  dataType,
  filterIndustry,
  filterConcepts,
  availableIndustries,
  availableConcepts,
  conceptsCacheData,
  industriesCacheData,
  industrySelectWidth,
  conceptSelectWidth,
  onIndustryChange,
  onConceptsChange,
  onFetchFilterOptions,
}) => {
  // 辅助函数：根据代码查找概念名称
  const getConceptNameByCode = (code: string) => {
    const concept = conceptsCacheData.find((item: any) => item.concept_code === code);
    return concept ? (concept.is_hot === true ? `🔥 ${concept.concept_name}` : concept.concept_name) : code;
  };

  // 辅助函数：根据代码查找行业名称
  const getIndustryNameByCode = (code: string) => {
    const industry = industriesCacheData.find((item: any) => item.industry_code === code);
    return industry ? (industry.is_hot === true ? `🔥 ${industry.industry_name}` : industry.industry_name) : code;
  };

  // 辅助函数：根据名称查找概念代码
  const getConceptCodeByName = (name: string) => {
    const cleanName = name.replace(/^🔥\s*/, '');
    const concept = conceptsCacheData.find((item: any) => item.concept_name === cleanName);
    return concept?.concept_code || name;
  };

  // 辅助函数：根据名称查找行业代码
  const getIndustryCodeByName = (name: string) => {
    const cleanName = name.replace(/^🔥\s*/, '');
    const industry = industriesCacheData.find((item: any) => item.industry_name === cleanName);
    return industry?.industry_code || name;
  };

  return (
    <>
      {/* 行业筛选 */}
      {(dataType === 'stock' || dataType === 'convertible_bond') && (
        <Select
          showSearch
          placeholder={dataType === 'stock' ? '行业' : '正股行业'}
          value={filterIndustry.length > 0 ? getIndustryNameByCode(filterIndustry[0]) : undefined}
          onChange={(value) => onIndustryChange(value ? getIndustryCodeByName(value) : null)}
          onOpenChange={(open) => {
            if (open && availableIndustries.length === 0) onFetchFilterOptions();
          }}
          style={{
            width: industrySelectWidth,
            background: 'transparent',
            backgroundColor: 'transparent',
            display: 'inline-flex',
            alignItems: 'center'
          }}
          size="small"
          allowClear
        >
          {availableIndustries.map(ind => (
            <Select.Option key={ind} value={ind}>{ind}</Select.Option>
          ))}
        </Select>
      )}

      {/* 概念筛选 */}
      {(dataType === 'stock' || dataType === 'convertible_bond') && (
        <Select
          showSearch
          placeholder={dataType === 'stock' ? '概念' : '正股概念'}
          value={filterConcepts.length > 0 ? getConceptNameByCode(filterConcepts[0]) : undefined}
          onChange={(value) => onConceptsChange(value ? [getConceptCodeByName(value)] : [])}
          onOpenChange={(open) => {
            if (open && availableConcepts.length === 0) onFetchFilterOptions();
          }}
          style={{
            width: conceptSelectWidth,
            background: 'transparent',
            backgroundColor: 'transparent',
            display: 'inline-flex',
            alignItems: 'center'
          }}
          size="small"
          allowClear
        >
          {availableConcepts.map(concept => (
            <Select.Option key={concept} value={concept}>{concept}</Select.Option>
          ))}
        </Select>
      )}
    </>
  );
};

export default FiltersPanel;

