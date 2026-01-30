import { useState, useCallback } from 'react';
import { message } from 'antd';
import authFetch from '../utils/authFetch.ts';
import { addThsAccountHeaders } from '../utils/thsAccountUtils.ts';
import { getThsUsername } from '../utils/userKey.ts';

export interface PushParams {
  dataType: 'stock' | 'convertible_bond' | 'concept' | 'industry';
  searchKeyword?: string;
  tradeDate?: string;
  userChangedTradeDate?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  sortPeriod?: string;
  tsCodes?: string[];  // 直接指定代码列表筛选
  filterIndustry?: string[];
  filterConcepts?: string[];
}

export interface UseThsPushResult {
  pushLoading: boolean;
  batchPushToThsGroup: (groupName: string, pushCount: number, params: PushParams) => Promise<void>;
}

/**
 * 共享的同花顺推送逻辑 Hook
 * 用于桌面端和移动端复用
 */
export function useThsPush(onSuccess?: () => void): UseThsPushResult {
  const [pushLoading, setPushLoading] = useState(false);
  const thsUsername = getThsUsername();

  const batchPushToThsGroup = useCallback(async (
    groupName: string, 
    pushCount: number,
    params: PushParams
  ) => {
    setPushLoading(true);
    
    try {
      // 1. 根据数据类型选择对应的 API 端点
      let apiUrl = '/api/stocks/ts-codes';
      if (params.dataType === 'convertible_bond') apiUrl = '/api/convertible-bonds/ts-codes';
      else if (params.dataType === 'concept') apiUrl = '/api/concepts/ts-codes';
      else if (params.dataType === 'industry') apiUrl = '/api/industries/ts-codes';
      
      // 构建请求参数
      // 仅当用户手动选择过日期时才携带 trade_date，否则由后端使用最新交易日
      const effectiveTradeDate = params.userChangedTradeDate ? params.tradeDate : undefined;
      // 当 pushCount 为 0 时表示全部推送，使用后端最大限制 500
      const effectivePageSize = pushCount > 0 ? pushCount : 500;
      
      const requestBody: any = {
        page: 1,
        page_size: effectivePageSize,
        search: params.searchKeyword || undefined,
        trade_date: effectiveTradeDate || undefined,
        sort_by: params.sortBy || 'hot_score',
        sort_order: params.sortOrder || 'desc',
        sort_period: params.sortPeriod || 'daily',
      };
      
      // 股票和可转债支持行业/概念筛选
      if (params.dataType === 'stock' || params.dataType === 'convertible_bond') {
        if (params.filterIndustry?.length) requestBody.industries = params.filterIndustry;
        if (params.filterConcepts?.length) requestBody.concepts = params.filterConcepts;
      }
      if (params.tsCodes?.length) {
        requestBody.ts_codes = params.tsCodes;
      }
      
      const tsCodesResponse = await authFetch(apiUrl, {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });
      
      if (!tsCodesResponse.ok) {
        throw new Error('获取代码列表失败');
      }
      
      const tsCodesResult = await tsCodesResponse.json();
      const tsCodes: string[] = tsCodesResult.success && tsCodesResult.data ? tsCodesResult.data : [];
      
      if (tsCodes.length === 0) {
        message.warning('当前没有可推送的数据');
        return;
      }
      
      // 2. 执行推送
      const response = await authFetch(`/api/favorites/ths/groups/${encodeURIComponent(groupName)}/batch`, {
        method: 'POST',
        headers: addThsAccountHeaders({
          'Content-Type': 'application/json',
          'X-THS-User-Key': thsUsername,
        }),
        body: JSON.stringify({
          group_name: groupName,
          ts_codes: tsCodes,
          rebuild: true
        }),
      });
      
      const result = await response.json();
      if (result.success) {
        message.success(`成功推送 ${result.data?.pushed_count || tsCodes.length} 个代码到分组 "${groupName}"`);
        onSuccess?.();
      } else {
        throw new Error(result.message || '推送失败');
      }
    } catch (error: any) {
      console.error('批量推送到同花顺分组失败:', error);
      message.error(error?.message || '推送到同花顺分组失败');
    } finally {
      setPushLoading(false);
    }
  }, [thsUsername, onSuccess]);

  return {
    pushLoading,
    batchPushToThsGroup,
  };
}

export default useThsPush;
