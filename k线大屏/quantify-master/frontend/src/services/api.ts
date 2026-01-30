/**
 * API服务
 */
import axios, { AxiosResponse } from 'axios';
import { message } from 'antd';
import {
  Stock,
} from '../types';

// 创建axios实例
const api = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    // 可以在这里添加认证token等
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
api.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  (error) => {
    const detail = error?.response?.data?.detail;
    let errorMessage: string = '';
    if (typeof detail === 'string') {
      errorMessage = detail;
    } else if (Array.isArray(detail)) {
      errorMessage = detail.map((d: any) => d?.msg || d?.message || JSON.stringify(d)).join('; ');
    } else if (detail && typeof detail === 'object') {
      errorMessage = (detail.message || detail.msg) ? `${detail.message || detail.msg}` : JSON.stringify(detail);
    } else {
      errorMessage = error.message || '请求失败';
    }
    message.error(errorMessage);
    return Promise.reject(error);
  }
);

// 股票相关API
export const stocksApi = {
  // 获取股票列表（支持排序别名+周期）
  getStockList: async (request: {
    page?: number;
    page_size?: number;
    sort_by?: string; // pct_chg | amount | volatility | 标准字段
    sort_period?: 'daily' | 'weekly' | 'monthly';
    sort_order?: 'asc' | 'desc';
    search?: string;
    industries?: string[]; // 行业代码数组
    concepts?: string[];   // 概念代码数组
    ts_codes?: string[];   // 代码列表筛选
    hot_sort?: boolean;
  } = {}): Promise<any> => {
    const response = await api.post('/stocks', request);
    return response.data;
  },

  // 搜索股票
  searchStocks: async (keyword: string, limit = 20): Promise<Stock[]> => {
    const response = await api.get('/stocks/search', {
      params: { keyword, limit }
    });
    return response.data;
  },






  // ==================== 统一的概念和行业接口 ====================

  // 获取概念列表（改为 POST，支持代码筛选）
  getConcepts: async (request: {
    search?: string;
    hot_sort?: boolean;
    page?: number;
    page_size?: number;
    sort_by?: string;
    sort_period?: 'daily' | 'weekly' | 'monthly';
    sort_order?: 'asc' | 'desc';
    ts_codes?: string[];   // 代码列表筛选
  } = {}): Promise<any> => {
    const response = await api.post('/concepts', request);
    return response.data;
  },

  // 获取行业列表（改为 POST，支持代码筛选）
  getIndustries: async (request: {
    search?: string;
    hot_sort?: boolean;
    page?: number;
    page_size?: number;
    sort_by?: string;
    sort_period?: 'daily' | 'weekly' | 'monthly';
    sort_order?: 'asc' | 'desc';
    ts_codes?: string[];   // 代码列表筛选
  } = {}): Promise<any> => {
    const response = await api.post('/industries', request);
    return response.data;
  },
  
  // 获取可转债列表（改为 POST，支持行业/概念数组与代码筛选）
  getConvertibleBonds: async (request: {
    search?: string;
    industries?: string[];
    concepts?: string[];
    page?: number;
    page_size?: number;
    sort_by?: string;
    sort_period?: 'daily' | 'weekly' | 'monthly';
    sort_order?: 'asc' | 'desc';
    hot_sort?: boolean;
    ts_codes?: string[];   // 代码列表筛选
  } = {}): Promise<any> => {
    const response = await api.post('/convertible-bonds', request);
    return response.data;
  },

  // 获取概念选项（用于下拉筛选，不分页）
  getConceptOptions: async (params: {
    search?: string;
    hot_sort?: boolean;
  } = {}): Promise<any> => {
    const response = await api.get('/concepts/options', { params });
    return response.data;
  },

  // 获取行业选项（用于下拉筛选，不分页）
  getIndustryOptions: async (params: {
    search?: string;
    hot_sort?: boolean;
  } = {}): Promise<any> => {
    const response = await api.get('/industries/options', { params });
    return response.data;
  },

  // 获取概念K线数据
  getConceptKlines: async (ts_code: string, params: {
    period?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
    latest_only?: boolean;
  } = {}): Promise<any> => {
    const response = await api.get(`/concepts/${ts_code}/klines`, { params });
    return response.data;
  },

  // 获取行业K线数据
  getIndustryKlines: async (ts_code: string, params: {
    period?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
    latest_only?: boolean;
  } = {}): Promise<any> => {
    const response = await api.get(`/industries/${ts_code}/klines`, { params });
    return response.data;
  },


  // ==================== 策略相关API ====================

  // 获取策略列表
  getStrategies: async (): Promise<any> => {
    const response = await api.get('/strategies');
    return response.data;
  },

  // 异步执行策略
  executeStrategyAsync: async (params: {
    strategy: string;
    entity_type?: string;
    period?: string;
    context?: any;
  }): Promise<any> => {
    const response = await api.post('/strategies/execute-async', params);
    return response.data;
  },

  // 获取任务进度
  getTaskProgress: async (taskId: string): Promise<any> => {
    const response = await api.get(`/tasks/${taskId}`);
    return response.data;
  },

  // 取消任务
  cancelTask: async (taskId: string): Promise<any> => {
    const response = await api.delete(`/tasks/${taskId}`);
    return response.data;
  },

  // ==================== 策略预设API ====================

  // 保存策略预设
  saveStrategyPreset: async (params: {
    name: string;
    strategy_name: string;
    entity_type: string;
    period: string;
    params: any;
    is_default?: boolean;
    preset_id?: number;
  }): Promise<any> => {
    const response = await api.post('/strategies/presets', params);
    return response.data;
  },

  // 获取策略预设列表
  getStrategyPresets: async (params?: {
    strategy_name?: string;
    entity_type?: string;
    period?: string;
  }): Promise<any> => {
    const response = await api.get('/strategies/presets', { params });
    return response.data;
  },

  // 删除策略预设
  deleteStrategyPreset: async (presetKey: string): Promise<any> => {
    const response = await api.delete(`/strategies/presets/${presetKey}`);
    return response.data;
  },

  // 更新策略预设参数
  updateStrategyPreset: async (presetKey: string, params: any): Promise<any> => {
    const response = await api.put(`/strategies/presets/${presetKey}`, { params });
    return response.data;
  },
};


// 工具函数
export const apiUtils = {
  // 处理API错误
  handleError: (error: any, defaultMessage = '操作失败') => {
    const errorMessage = error.response?.data?.detail || error.message || defaultMessage;
    message.error(errorMessage);
  },

  // 显示成功消息
  showSuccess: (message_text: string) => {
    message.success(message_text);
  },

  // 显示加载状态
  showLoading: (content = '加载中...') => {
    return message.loading(content, 0);
  },

  // 格式化股票代码
  formatStockCode: (ts_code: string) => {
    return ts_code.replace(/\.(SZ|SH)$/, '');
  },

  // 格式化股票名称
  formatStockName: (name: string, maxLength = 6) => {
    return name.length > maxLength ? name.substring(0, maxLength) + '...' : name;
  },

  // 格式化价格
  formatPrice: (price: number, precision = 2) => {
    return price?.toFixed(precision) || '--';
  },

  // 格式化百分比
  formatPercent: (percent: number, precision = 2) => {
    if (percent === undefined || percent === null) return '--';
    const sign = percent > 0 ? '+' : '';
    return `${sign}${percent.toFixed(precision)}%`;
  },

  // 获取涨跌颜色类名
  getPriceColorClass: (change?: number) => {
    if (!change) return 'neutral';
    return change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral';
  },

  // 获取涨跌颜色
  getPriceColor: (change?: number) => {
    if (!change) return '#8c8c8c';
    return change > 0 ? '#f5222d' : change < 0 ? '#52c41a' : '#8c8c8c';
  },
};

export default api;
