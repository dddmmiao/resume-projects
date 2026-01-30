export const dataTypeLabel = (dataType: 'stock' | 'convertible_bond' | 'concept' | 'industry' | 'favorites' | string) => {
  switch (dataType) {
    case 'stock':
      return '股票';
    case 'convertible_bond':
      return '可转债';
    case 'concept':
      return '概念';
    case 'industry':
      return '行业';
    case 'favorites':
      return '自选';
    default:
      return '数据';
  }
};


