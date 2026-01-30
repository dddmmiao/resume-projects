import React from 'react';
import DataTypeTabs from './DataTypeTabs.tsx';
import SearchInputBar from './SearchInputBar.tsx';
import CleanSortSelect from './CleanSortSelect.tsx';
import FavoriteGroupSelector from './FavoriteGroupSelector.tsx';
import { ThsAccountSimple } from './ThsAccountSimple.tsx';
import FiltersPanel from './FiltersPanel.tsx';
import { DataType, Period } from '../shared/constants.ts';

type FavoriteGroups = {
  [groupName: string]: {
    stocks: string[];
    convertible_bonds: string[];
    concepts: string[];
    industries: string[];
  };
};

type DashboardToolbarProps = {
  theme: 'dark' | 'light' | 'blue' | 'purple' | 'green' | 'orange' | 'cyan' | 'red' | 'gold';
  // data type
  dataType: DataType;
  onDataTypeChange: (t: DataType) => void;
  // search
  searchInput: string;
  onSearchInputChange: (v: string) => void;
  onSearchSubmit: (v: string) => void;
  inputStyle: React.CSSProperties;
  // sort
  sortType: string;
  sortOrder: 'asc' | 'desc';
  onSortChange: (type: string, order: 'asc' | 'desc') => void;
  period?: Period; // 当前选择的周期
  // favorites
  favorites: FavoriteGroups;
  currentFavoriteGroup: string;
  onFavoriteGroupChange: (group: string) => void;
  onOpenFavoriteModal: () => void;
  favoriteGroupSelectWidth: number;
  // filters
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
  hasValidThsAccount?: boolean;
};

const DashboardToolbar: React.FC<DashboardToolbarProps> = ({
  theme,
  dataType,
  onDataTypeChange,
  searchInput,
  onSearchInputChange,
  onSearchSubmit,
  inputStyle,
  sortType,
  sortOrder,
  onSortChange,
  period = 'daily',
  favorites,
  currentFavoriteGroup,
  onFavoriteGroupChange,
  onOpenFavoriteModal,
  favoriteGroupSelectWidth,
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
  hasValidThsAccount,
}) => {
  return (
    <div className="toolbar-container" style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
      padding: '8px 12px',
      background: theme === 'light' ? '#ffffff' : 'rgba(255,255,255,0.06)',
      border: theme === 'light' ? '1px solid rgba(0,0,0,0.08)' : 'none',
      boxShadow: 'none',
      borderRadius: 8,
      flexWrap: 'wrap'
    }}>
      {/* 数据类型切换 */}
      <DataTypeTabs
        theme={theme}
        value={dataType as any}
        onChange={(t) => onDataTypeChange(t)}
      />

      {/* 搜索框 */}
      <SearchInputBar
        theme={theme}
        value={searchInput}
        onChange={onSearchInputChange}
        onSubmit={onSearchSubmit}
        inputStyle={{
          ...inputStyle,
          backgroundImage: 'none'
        }}
      />

      {/* 排序控件 */}
      {(dataType === 'stock' || dataType === 'convertible_bond' || dataType === 'concept' || dataType === 'industry') && (
        <CleanSortSelect
          currentSortType={sortType}
          currentSortOrder={sortOrder}
          dataType={dataType}
          theme={theme}
          onChange={onSortChange}
          size="small"
          period={period}
        />
      )}

      {/* 自选分组选择器 */}
      {dataType === 'favorites' && hasValidThsAccount && (
        <FavoriteGroupSelector
          theme={theme}
          favorites={favorites}
          currentFavoriteGroup={currentFavoriteGroup}
          onChange={onFavoriteGroupChange}
          width={favoriteGroupSelectWidth}
          inputStyle={inputStyle}
          onManageGroups={onOpenFavoriteModal}
        />
      )}

      <FiltersPanel
        theme={theme}
        dataType={dataType}
        filterIndustry={filterIndustry}
        filterConcepts={filterConcepts}
        availableIndustries={availableIndustries}
        availableConcepts={availableConcepts}
        conceptsCacheData={conceptsCacheData}
        industriesCacheData={industriesCacheData}
        industrySelectWidth={industrySelectWidth}
        conceptSelectWidth={conceptSelectWidth}
        onIndustryChange={onIndustryChange}
        onConceptsChange={onConceptsChange}
        onFetchFilterOptions={onFetchFilterOptions}
      />

      {/* 右侧工具区域 - 账号选择器等 */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        {dataType === 'favorites' && (
          <ThsAccountSimple />
        )}
      </div>
    </div>
  );
};

export default DashboardToolbar;


